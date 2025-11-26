/**
 * Billing Webhooks
 * Gestionează webhook-urile Stripe pentru subscription events
 */

import express = require("express");
const { getStripeClient } = require("../../services/stripeService");
const prisma = require("../../lib/prisma").default;

/**
 * Handler pentru invoice.payment_succeeded
 */
async function handleInvoicePaymentSucceeded(invoice: any) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!subscription) return;

  // Actualizează next billing date și status
  const nextBillingDate = invoice.period_end
    ? new Date(invoice.period_end * 1000)
    : null;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "ACTIVE",
      nextBillingDate,
      currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
    },
  });

  console.log(`✅ Invoice payment succeeded pentru subscription ${subscriptionId}`);
}

/**
 * Handler pentru invoice.payment_failed
 */
async function handleInvoicePaymentFailed(invoice: any) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "PAST_DUE",
    },
  });

  console.log(`⚠️ Invoice payment failed pentru subscription ${subscriptionId}`);
}

/**
 * Handler pentru customer.subscription.updated
 */
async function handleSubscriptionUpdated(stripeSubscription: any) {
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription) return;

  const nextBillingDate = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : null;

  // Mapăm status-ul Stripe la status-ul nostru
  let status = "ACTIVE";
  if (stripeSubscription.status === "past_due") {
    status = "PAST_DUE";
  } else if (stripeSubscription.status === "canceled" || stripeSubscription.status === "unpaid") {
    status = "CANCELED";
  } else if (stripeSubscription.status === "active") {
    status = "ACTIVE";
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status,
      nextBillingDate,
      currentPeriodStart: stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000)
        : undefined,
      currentPeriodEnd: stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : undefined,
      autoBillingEnabled: stripeSubscription.cancel_at_period_end ? false : true,
    },
  });

  console.log(`📝 Subscription updated: ${stripeSubscription.id} -> ${status}`);
}

/**
 * Handler pentru customer.subscription.deleted
 */
async function handleSubscriptionDeleted(stripeSubscription: any) {
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "CANCELED",
      autoBillingEnabled: false,
    },
  });

  console.log(`🗑️ Subscription deleted: ${stripeSubscription.id}`);
}

/**
 * POST /billing/webhooks
 * Webhook handler pentru Stripe subscription events
 */
export async function billingWebhookHandler(
  req: express.Request & { rawBody?: Buffer },
  res: express.Response
) {
  const stripe = getStripeClient();
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).send("Missing Stripe signature");
  }

  const webhookSecret =
    process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send("Stripe webhook secret is not configured");
  }

  let event: any;
  try {
    const payload = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error: any) {
    console.error("Stripe webhook verification failed:", error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    console.error("Billing webhook handler error:", error);
    return res.status(500).send("Webhook handler error");
  }
}

module.exports = {
  billingWebhookHandler,
};

