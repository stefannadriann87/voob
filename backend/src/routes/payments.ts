"use strict";

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { getStripeClient, mapClientMethodToPrisma } = require("../services/stripeService");
const { validate } = require("../middleware/validate");
const { createPaymentIntentSchema } = require("../validators/paymentSchemas");

const prisma = require("../lib/prisma");

const router = express.Router();

/**
 * Convertește o sumă din RON în unități minore (bani)
 * @param {number} amount - Suma în RON
 * @returns {number} Suma în bani (amount * 100)
 */
const toMinorCurrencyUnit = (amount: number) => Math.round(amount * 100);

/**
 * Validează payload-ul pentru booking înainte de crearea payment intent
 * @param {Object} params - Parametrii de validare
 * @param {string} params.businessId - ID-ul business-ului
 * @param {string} params.serviceId - ID-ul serviciului
 * @returns {Promise<Object>} Service object dacă validarea reușește
 * @throws {Error} Dacă businessId sau serviceId lipsesc
 * @throws {Error} Dacă serviciul nu există sau nu aparține business-ului
 * @throws {Error} Dacă serviciul nu are preț configurat
 */
const validateBookingPayload = async ({
  businessId,
  serviceId,
}: {
  businessId?: string;
  serviceId?: string;
}) => {
  if (!businessId || !serviceId) {
    throw new Error("businessId și serviceId sunt obligatorii.");
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, businessId },
    select: { id: true, name: true, duration: true, price: true, businessId: true },
  });

  if (!service) {
    throw new Error("Serviciul nu a fost găsit pentru acest business.");
  }

  if (service.price <= 0) {
    throw new Error("Serviciul selectat nu are preț configurat.");
  }

  return service;
};

/**
 * POST /payments/create-intent
 * Creează un Stripe Payment Intent pentru o rezervare
 * 
 * @route POST /payments/create-intent
 * @access Private (JWT required)
 * @param {string} businessId - ID-ul business-ului
 * @param {string} serviceId - ID-ul serviciului
 * @param {string} [employeeId] - ID-ul angajatului (opțional)
 * @param {string} date - Data rezervării (ISO format)
 * @param {string} paymentMethod - Metoda de plată (card, offline)
 * @param {string} [clientNotes] - Note de la client
 * @param {number} [duration] - Durata în minute (override)
 * @returns {Object} Payment intent cu clientSecret și paymentIntentId
 * @throws {400} Dacă paymentMethod este 'offline' sau datele sunt invalide
 * @throws {401} Dacă user-ul nu este autentificat
 * @throws {403} Dacă clientul nu este conectat la business
 * @throws {400} Dacă serviciul nu există sau nu are preț configurat
 * @throws {500} Dacă Stripe API eșuează sau există erori interne
 */
router.post("/create-intent", verifyJWT, validate(createPaymentIntentSchema), async (req: express.Request, res: express.Response) => {
  const { logger } = require("../lib/logger");
  
  try {
    const {
      businessId,
      serviceId,
      employeeId,
      date,
      paymentMethod,
      clientNotes,
      duration,
    } = req.body; // Body este deja validat

    if (paymentMethod === "offline") {
      return res.status(400).json({ 
        error: "Metoda de plată 'offline' nu necesită payment intent.",
        code: "PAYMENT_METHOD_OFFLINE",
        actionable: "Folosește metoda de plată 'offline' direct în booking creation."
      });
    }

    if (!businessId || !serviceId) {
      return res.status(400).json({ 
        error: "businessId și serviceId sunt obligatorii.",
        code: "MISSING_REQUIRED_FIELDS",
        actionable: "Asigură-te că furnizezi toate câmpurile obligatorii."
      });
    }

    // CRITICAL FIX (TICKET-011): Error handling robust pentru validare booking payload
    let service;
    try {
      service = await validateBookingPayload({ businessId, serviceId });
    } catch (validationError: any) {
      logger.error("Booking payload validation failed", { 
        error: validationError.message, 
        businessId, 
        serviceId 
      });
      return res.status(400).json({ 
        error: validationError.message || "Serviciul selectat nu este valid.",
        code: "INVALID_SERVICE",
        actionable: "Verifică că serviciul există și aparține business-ului selectat."
      });
    }

    // CRITICAL FIX (TICKET-011): Validare amount
    if (!service.price || service.price <= 0) {
      return res.status(400).json({ 
        error: "Serviciul selectat nu are preț configurat.",
        code: "INVALID_SERVICE_PRICE",
        actionable: "Contactează business-ul pentru a configura prețul serviciului."
      });
    }

    const amountMinor = toMinorCurrencyUnit(service.price);
    if (amountMinor <= 0 || amountMinor > 10000000) { // Max 100,000 RON
      return res.status(400).json({ 
        error: "Prețul serviciului este invalid.",
        code: "INVALID_AMOUNT",
        actionable: "Contactează business-ul pentru a verifica prețul serviciului."
      });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      logger.error("Stripe client not initialized");
      return res.status(500).json({ 
        error: "Serviciul de plată nu este disponibil momentan.",
        code: "PAYMENT_GATEWAY_UNAVAILABLE",
        actionable: "Te rugăm să încerci din nou în câteva momente."
      });
    }

    const clientMethod = paymentMethod;
    const clientId = (req as express.Request & { user?: { userId: string } }).user?.userId;
    if (!clientId) {
      return res.status(401).json({ 
        error: "Autentificare necesară.",
        code: "UNAUTHORIZED",
        actionable: "Te rugăm să te autentifici înainte de a continua."
      });
    }

    // CRITIC FIX: Verifică dacă clientul este conectat la business
    try {
      const clientBusinessLink = await prisma.clientBusinessLink.findFirst({
        where: {
          clientId: clientId,
          businessId: businessId,
        },
      });

      if (!clientBusinessLink) {
        return res.status(403).json({ 
          error: "Nu ești conectat la acest business. Scanează codul QR pentru a te conecta.",
          code: "CLIENT_NOT_LINKED",
          actionable: "Scanează codul QR al business-ului pentru a te conecta."
        });
      }
    } catch (linkError: any) {
      logger.error("Error checking client business link", { error: linkError, clientId, businessId });
      return res.status(500).json({ 
        error: "Nu am putut verifica conexiunea la business.",
        code: "LINK_CHECK_FAILED",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul."
      });
    }

    const metadata = {
      pendingBooking: {
        clientId,
        businessId,
        serviceId,
        employeeId: employeeId ?? null,
        date,
        clientNotes: clientNotes ?? null,
      },
      method: clientMethod,
    };

    // CRITIC FIX: Generează idempotency key pentru a preveni duplicate payments
    const idempotencyKey = `booking_${businessId}_${serviceId}_${date}_${clientId}`.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 255);

    // CRITICAL FIX (TICKET-015): Use proper Stripe type instead of `any`
    type PaymentIntentParams = {
      amount: number;
      currency: string;
      capture_method: string;
      automatic_payment_methods: {
        enabled: boolean;
        allow_redirects: string;
      };
      metadata: {
        businessId: string;
        serviceId: string;
        clientId: string;
        paymentMethod: string;
      };
    };
    const paymentIntentParams: PaymentIntentParams = {
      amount: amountMinor,
      currency: "ron",
      capture_method: "automatic",
      // Use automatic_payment_methods for card payments (Stripe handles card, Apple Pay, Google Pay automatically)
      automatic_payment_methods: { 
        enabled: true, 
        allow_redirects: "always" 
      },
      metadata: {
        businessId: businessId ?? "",
        serviceId: serviceId ?? "",
        clientId,
        paymentMethod: clientMethod,
      },
    };
    
    // CRITICAL FIX (TICKET-011): Error handling robust pentru Stripe API calls
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        { idempotencyKey }
      );
    } catch (stripeError: any) {
      logger.error("Stripe payment intent creation failed", { 
        error: stripeError.message, 
        code: stripeError.code,
        type: stripeError.type,
        businessId,
        serviceId,
        amountMinor
      });

      // Handle specific Stripe errors
      if (stripeError.type === "StripeCardError") {
        return res.status(400).json({ 
          error: "Cardul nu a putut fi procesat. Verifică datele cardului.",
          code: "CARD_ERROR",
          actionable: "Verifică că datele cardului sunt corecte și că cardul este activ."
        });
      }

      if (stripeError.type === "StripeRateLimitError") {
        return res.status(429).json({ 
          error: "Prea multe solicitări. Te rugăm să aștepți câteva momente.",
          code: "RATE_LIMIT",
          actionable: "Așteaptă câteva secunde și încearcă din nou."
        });
      }

      if (stripeError.type === "StripeInvalidRequestError") {
        return res.status(400).json({ 
          error: "Solicitarea de plată este invalidă.",
          code: "INVALID_REQUEST",
          actionable: "Verifică că toate datele sunt corecte și încearcă din nou."
        });
      }

      // Generic Stripe error
      return res.status(500).json({ 
        error: "Nu am putut procesa plata. Te rugăm să încerci din nou.",
        code: "STRIPE_ERROR",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
      });
    }

    // No installments for card payments
    const installments = null;
    const amountPerInstallment = null;

    // CRITICAL FIX (TICKET-011): Error handling pentru database operations
    try {
      // Verifică dacă există deja un Payment pentru acest intent (idempotency key reused)
      const existingPayment = await prisma.payment.findFirst({
        where: { externalPaymentId: paymentIntent.id },
      });

      if (!existingPayment) {
        // Creează Payment nou doar dacă nu există
        await prisma.payment.create({
          data: {
            businessId,
            amount: service.price,
            currency: "RON",
            method: mapClientMethodToPrisma(clientMethod),
            status: "PENDING",
            gateway: "stripe",
            externalPaymentId: paymentIntent.id,
            installments: installments ?? undefined,
            amountPerInstallment: amountPerInstallment ?? undefined,
            metadata,
          },
        });
      }
    } catch (dbError: any) {
      logger.error("Database error creating payment record", { 
        error: dbError.message, 
        paymentIntentId: paymentIntent.id,
        businessId,
        serviceId
      });
      
      // Payment intent was created in Stripe but DB record failed
      // This is a critical error - payment exists in Stripe but not in our DB
      // We should still return success but log the error for manual reconciliation
      logger.error("CRITICAL: Payment intent created in Stripe but DB record creation failed", {
        paymentIntentId: paymentIntent.id,
        businessId,
        serviceId,
        error: dbError
      });
      
      // Return success but with warning - payment intent exists in Stripe
      return res.json({
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        paymentMethod: clientMethod,
        warning: "Plata a fost inițiată, dar a apărut o eroare la înregistrarea în sistem. Contactează suportul dacă ai probleme."
      });
    }

    return res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      paymentMethod: clientMethod,
    });
  } catch (error: any) {
    logger.error("Unexpected error in payment intent creation", { 
      error: error.message, 
      stack: error.stack,
      body: req.body
    });

    // Generic error fallback
    if (error instanceof Error) {
      return res.status(500).json({ 
        error: "Nu am putut crea intentul de plată. Te rugăm să încerci din nou.",
        code: "INTERNAL_ERROR",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
      });
    }
    return res.status(500).json({ 
      error: "Nu am putut crea intentul de plată.",
      code: "UNKNOWN_ERROR",
      actionable: "Te rugăm să contactezi suportul."
    });
  }
});

module.exports = router;

