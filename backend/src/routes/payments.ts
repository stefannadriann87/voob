"use strict";

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { getStripeClient, mapClientMethodToPrisma } = require("../services/stripeService");
const { validate } = require("../middleware/validate");
const { createPaymentIntentSchema } = require("../validators/paymentSchemas");

const prisma = require("../lib/prisma");

const router = express.Router();

const toMinorCurrencyUnit = (amount: number) => Math.round(amount * 100);

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

router.post("/create-intent", verifyJWT, validate(createPaymentIntentSchema), async (req: express.Request, res: express.Response) => {
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
      return res.status(400).json({ error: "Metoda de plată 'offline' nu necesită payment intent." });
    }

    if (!businessId || !serviceId) {
      return res.status(400).json({ error: "businessId și serviceId sunt obligatorii." });
    }
    const service = await validateBookingPayload({ businessId, serviceId });
    const amountMinor = toMinorCurrencyUnit(service.price);

    const stripe = getStripeClient();
    const clientMethod = paymentMethod;
    const clientId = (req as express.Request & { user?: { userId: string } }).user?.userId;
    if (!clientId) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }

    // CRITIC FIX: Verifică dacă clientul este conectat la business
    const clientBusinessLink = await prisma.clientBusinessLink.findFirst({
      where: {
        clientId: clientId,
        businessId: businessId,
      },
    });

    if (!clientBusinessLink) {
      return res.status(403).json({ 
        error: "Nu ești conectat la acest business. Scanează codul QR pentru a te conecta." 
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

    const paymentIntentParams: any = {
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
    
    // CRITIC FIX: Folosește idempotency key pentru a preveni duplicate payments
    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams,
      { idempotencyKey }
    );

    // No installments for card payments
    const installments = null;
    const amountPerInstallment = null;

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

    return res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      paymentMethod: clientMethod,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Nu am putut crea intentul de plată." });
  }
});

module.exports = router;

