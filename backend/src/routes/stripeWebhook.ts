import express = require("express");
const { verifyStripeWebhook, getWebhookSecret } = require("../middleware/webhookSignature");
const { logger } = require("../lib/logger");

const prisma = require("../lib/prisma");

const handlePaymentSucceeded = async (intent: any) => {
  const payment = await prisma.payment.findFirst({
    where: { externalPaymentId: intent.id },
  });

  if (!payment) {
    return;
  }

  // IMPORTANT FIX: Verifică dacă payment-ul este deja SUCCEEDED (prevenire double payment)
  if (payment.status === "SUCCEEDED") {
    logger.warn("Payment already succeeded", { paymentId: payment.id, intentId: intent.id });
    return; // Skip - deja procesat
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCEEDED",
      metadata: {
        ...(payment.metadata || {}),
        stripeStatus: intent.status,
      },
    },
  });

  if (payment.bookingId) {
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        paid: true,
        paymentStatus: "PAID",
      },
    });
  }
};

const handlePaymentFailed = async (intent: any) => {
  const payment = await prisma.payment.findFirst({
    where: { externalPaymentId: intent.id },
  });

  if (!payment) {
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      metadata: {
        ...(payment.metadata || {}),
        stripeStatus: intent.status,
        failureReason: intent.last_payment_error?.message ?? null,
      },
    },
  });

  if (payment.bookingId) {
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: "FAILED",
      },
    });
  }
};

module.exports = async (req: express.Request & { rawBody?: Buffer }, res: express.Response) => {
  const webhookSecret = getWebhookSecret("payment");
  if (!webhookSecret) {
    logger.error("Stripe webhook secret not configured", { path: req.path });
    return res.status(500).send("Stripe webhook secret is not configured");
  }

  // Verifică semnătura folosind middleware-ul unificat
  const verifyMiddleware = verifyStripeWebhook(webhookSecret);
  
  // Aplică middleware-ul manual (pentru că este un handler direct, nu un router)
  return verifyMiddleware(req, res, async () => {
    const event = (req as express.Request & { webhookEvent?: any }).webhookEvent;
    if (!event) {
      return res.status(400).send("Webhook event not found");
    }

  try {
    // IMPORTANT FIX: Verifică dacă event-ul a fost deja procesat (idempotency)
    const eventId = event.id;
    const processedEvent = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (processedEvent && processedEvent.processed) {
      logger.info("Webhook event already processed", { eventId, type: event.type });
      return res.json({ received: true });
    }

    // Procesează event-ul
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        break;
    }

    // IMPORTANT FIX: Salvează event-ul ca procesat (idempotency)
    await prisma.webhookEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        type: event.type,
        processed: true,
      },
      update: {
        processed: true,
      },
    });

    return res.json({ received: true });
  } catch (error) {
    logger.error("Stripe webhook handler error", error);
    return res.status(500).send("Webhook handler error");
  }
  });
};

