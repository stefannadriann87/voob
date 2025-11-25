import express = require("express");
const Stripe = require("stripe");
const { getStripeClient } = require("../services/stripeService");

const prisma = require("../lib/prisma").default;

const handlePaymentSucceeded = async (intent: any) => {
  const payment = await prisma.payment.findFirst({
    where: { externalPaymentId: intent.id },
  });

  if (!payment) {
    return;
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
  const stripe = getStripeClient();
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Missing Stripe signature");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).send("Stripe webhook secret is not configured");
  }

  let event: any;
  try {
    const payload = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook verification failed:", error);
    return res.status(400).send(`Webhook Error: ${(error as Error).message}`);
  }

  try {
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

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    return res.status(500).send("Webhook handler error");
  }
};

