/**
 * Subscription Routes
 * Gestionează subscription-urile și trial-ul pentru business-uri
 */

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { checkTrialStatus, isTrialExpired } = require("../services/trialService");
const { getStripeClient } = require("../services/stripeService");
const { logger } = require("../lib/logger");

const router = express.Router();

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * GET /subscription/check-trial/:businessId
 * Verifică statusul trial-ului pentru un business
 */
router.get("/check-trial/:businessId", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN")) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    const trialStatus = await checkTrialStatus(businessId);
    return res.json(trialStatus);
  } catch (error) {
    logger.error("Check trial status error", error);
    return res.status(500).json({ error: "Eroare la verificarea statusului trial." });
  }
});

/**
 * POST /subscription/create-checkout
 * Creează o sesiune Stripe Checkout pentru subscription
 */
router.post("/create-checkout", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, planId } = req.body;

  if (!businessId || !planId) {
    return res.status(400).json({ error: "businessId și planId sunt obligatorii." });
  }

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      owner: { select: { email: true } },
      currentPlan: true,
    },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
  }

  try {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return res.status(404).json({ error: "Planul nu a fost găsit." });
    }

    const stripe = getStripeClient();

    // Creează sau obține customer Stripe
    let customerId: string;
    const existingSubscription = await prisma.subscription.findFirst({
      where: { businessId, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    });

    if (existingSubscription?.stripeCustomerId) {
      customerId = existingSubscription.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: business.owner.email || undefined,
        metadata: {
          businessId,
        },
      });
      customerId = customer.id;
    }

    // Creează Checkout Session
    const successUrl = `${process.env.FRONTEND_URL || "http://localhost:3001"}/business/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.FRONTEND_URL || "http://localhost:3001"}/business/subscription/cancel`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: {
              name: plan.name,
              description: plan.description || undefined,
            },
            recurring: {
              interval: plan.billingCycle.toLowerCase() === "monthly" ? "month" : "year",
            },
            unit_amount: Math.round(plan.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        businessId,
        planId,
      },
    });

    return res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error("Create checkout error", error);
    return res.status(500).json({ error: "Eroare la crearea sesiunii de checkout." });
  }
});

/**
 * POST /subscription/webhook
 * Webhook pentru evenimente Stripe subscription
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req: express.Request, res: express.Response) => {
  const stripe = getStripeClient();
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event;
  try {
    const webhookSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET nu este setat");
      return res.status(500).send("Webhook secret not configured");
    }

    event = stripe.webhooks.constructEvent((req as any).rawBody || req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error("Webhook signature verification failed", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const { businessId, planId } = session.metadata || {};

        if (businessId && planId) {
          const plan = await prisma.subscriptionPlan.findUnique({
            where: { id: planId },
          });

          if (plan) {
            // Găsește subscription existent sau creează unul nou
            const existingSubscription = await prisma.subscription.findFirst({
              where: { businessId },
            });

            if (existingSubscription) {
              // Actualizează subscription existent
              await prisma.subscription.update({
                where: { id: existingSubscription.id },
                data: {
                  planId,
                  status: "ACTIVE",
                  stripeSubscriptionId: session.subscription || null,
                  stripeCustomerId: session.customer || null,
                  currentPeriodStart: new Date(session.subscription_details?.current_period_start * 1000 || Date.now()),
                  currentPeriodEnd: new Date(session.subscription_details?.current_period_end * 1000 || Date.now()),
                  billingMethod: "CARD",
                  amount: plan.price,
                },
              });
            } else {
              // Creează subscription nou
              await prisma.subscription.create({
                data: {
                  businessId,
                  planId,
                  status: "ACTIVE",
                  stripeSubscriptionId: session.subscription || null,
                  stripeCustomerId: session.customer || null,
                  currentPeriodStart: new Date(session.subscription_details?.current_period_start * 1000 || Date.now()),
                  currentPeriodEnd: new Date(session.subscription_details?.current_period_end * 1000 || Date.now()),
                  billingMethod: "CARD",
                  amount: plan.price,
                  currency: plan.currency,
                },
              });
            }

            // Actualizează currentPlanId în Business
            await prisma.business.update({
              where: { id: businessId },
              data: { currentPlanId: planId },
            });
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;
        const dbSubscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (dbSubscription) {
          await prisma.subscription.update({
            where: { id: dbSubscription.id },
            data: {
              status: subscription.status === "active" ? "ACTIVE" : subscription.status === "past_due" ? "PAST_DUE" : "CANCELED",
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        // Subscription-ul este deja activ
        logger.info("Invoice payment succeeded", { invoiceId: invoice.id });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const dbSubscription = await prisma.subscription.findFirst({
          where: { stripeCustomerId: invoice.customer },
        });

        if (dbSubscription) {
          await prisma.subscription.update({
            where: { id: dbSubscription.id },
            data: {
              status: "PAST_DUE",
            },
          });
        }
        break;
      }
    }

    return res.json({ received: true });
  } catch (error) {
    logger.error("Webhook handler error", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
});

/**
 * GET /subscription/plans
 * Obține toate planurile disponibile
 */
router.get("/plans", async (req: express.Request, res: express.Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: "asc" },
    });
    return res.json(plans);
  } catch (error) {
    logger.error("Get plans error", error);
    return res.status(500).json({ error: "Eroare la obținerea planurilor." });
  }
});

export = router;

