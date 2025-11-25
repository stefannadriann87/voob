"use strict";

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { getStripeClient, getStripePaymentMethodTypes, mapClientMethodToPrisma } = require("../services/stripeService");

const prisma = require("../lib/prisma").default;

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

router.post("/create-intent", verifyJWT, async (req: express.Request, res: express.Response) => {
  try {
    const {
      businessId,
      serviceId,
      employeeId,
      date,
      paymentMethod,
      clientNotes,
    }: {
      businessId?: string;
      serviceId?: string;
      employeeId?: string;
      date?: string;
      paymentMethod?: "card" | "applepay" | "googlepay" | "klarna" | "offline";
      clientNotes?: string;
    } = req.body;

    if (!paymentMethod || paymentMethod === "offline") {
      return res.status(400).json({ error: "Metoda de plată nu este validă pentru Stripe." });
    }

    if (!businessId || !serviceId) {
      return res.status(400).json({ error: "businessId și serviceId sunt obligatorii." });
    }
    const service = await validateBookingPayload({ businessId, serviceId });
    const amountMinor = toMinorCurrencyUnit(service.price);

    const stripe = getStripeClient();
    const clientMethod = paymentMethod;
    const paymentMethodTypes = getStripePaymentMethodTypes(clientMethod);
    const clientId = (req as express.Request & { user?: { userId: string } }).user?.userId;
    if (!clientId) {
      return res.status(401).json({ error: "Autentificare necesară." });
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

    const paymentIntentParams: any = {
      amount: amountMinor,
      currency: "ron",
      payment_method_types: paymentMethodTypes,
      capture_method: "automatic",
      metadata: {
        businessId: businessId ?? "",
        serviceId: serviceId ?? "",
        clientId,
        paymentMethod: clientMethod,
      },
    };
    if (clientMethod !== "klarna") {
      paymentIntentParams.automatic_payment_methods = { enabled: true, allow_redirects: "always" };
    }
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    const installments = clientMethod === "klarna" ? 3 : null;
    const amountPerInstallment = installments ? Number((service.price / installments).toFixed(2)) : null;

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

