/**
 * Billing Webhooks
 * Gestionează webhook-urile Stripe pentru subscription events
 */

type ExpressRequest = import("express").Request;
type ExpressResponse = import("express").Response;
const { verifyStripeWebhook, getWebhookSecret } = require("../../middleware/webhookSignature");
const { logger } = require("../../lib/logger");
const prisma = require("../../lib/prisma");

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

    logger.info(`Invoice payment succeeded for subscription`, { subscriptionId });
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

    logger.warn(`Invoice payment failed for subscription`, { subscriptionId });
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

    logger.info(`Subscription updated`, { subscriptionId: stripeSubscription.id, status });
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

    logger.info(`Subscription deleted`, { subscriptionId: stripeSubscription.id });
}

/**
 * POST /billing/webhooks
 * Webhook handler pentru Stripe subscription events
 */
async function billingWebhookHandler(
  req: ExpressRequest & { rawBody?: Buffer },
  res: ExpressResponse
) {
  const webhookSecret = getWebhookSecret("billing");
  if (!webhookSecret) {
    logger.error("Billing webhook secret not configured", { path: req.path });
    return res.status(500).send("Stripe webhook secret is not configured");
  }

  // Verifică semnătura folosind middleware-ul unificat
  const verifyMiddleware = verifyStripeWebhook(webhookSecret);
  
  // Aplică middleware-ul manual
  return verifyMiddleware(req, res, async () => {
    const event = (req as ExpressRequest & { webhookEvent?: any }).webhookEvent;
    if (!event) {
      return res.status(400).send("Webhook event not found");
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
        logger.warn(`Unhandled webhook event type`, { eventType: event.type });
    }

    return res.json({ received: true });
    } catch (error: any) {
      console.error("Billing webhook handler error:", error);
      return res.status(500).send("Webhook handler error");
    }
  });
}

module.exports = {
  billingWebhookHandler,
};
