/**
 * Subscription Routes
 * Gestionează subscription-urile și trial-ul pentru business-uri
 */

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { verifyStripeWebhook, getWebhookSecret } = require("../middleware/webhookSignature");
const { checkTrialStatus, isTrialExpired } = require("../services/trialService");
const { getStripeClient } = require("../services/stripeService");
const { logger } = require("../lib/logger");
const { sendEmail } = require("../services/emailService");

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

  if (!authReq.user?.userId) {
    logger.warn("Check trial: No user in request", { businessId, path: req.path });
    return res.status(401).json({ error: "Nu ești autentificat." });
  }

  const userId = authReq.user.userId;
  const userRole = authReq.user.role;

  // Verifică autorizarea - permite owner-ului și employee-urilor
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      owner: { select: { id: true } },
      employees: { select: { id: true } },
    },
  });

  if (!business) {
    logger.warn("Check trial: Business not found", { businessId, userId });
    return res.status(404).json({ error: "Business-ul nu a fost găsit." });
  }

  const isOwner = business.owner.id === userId;
  const isEmployee = business.employees.some((emp: { id: string }) => emp.id === userId);
  const isSuperAdmin = userRole === "SUPERADMIN";

  if (!isOwner && !isEmployee && !isSuperAdmin) {
    const employeeIds = business.employees.map((e: { id: string }) => e.id);
    logger.warn("Check trial: Unauthorized access attempt", {
      businessId,
      userId,
      userRole,
      ownerId: business.owner.id,
      employeeIds,
      isOwner,
      isEmployee,
      isSuperAdmin,
    });
    return res.status(403).json({ 
      error: "Nu ai permisiunea de a accesa acest business.",
      details: process.env.NODE_ENV === "development" ? {
        businessId,
        userId,
        userRole,
        ownerId: business.owner.id,
        employeeIds,
      } : undefined,
    });
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

  logger.info("Create checkout request", { businessId, planId, userId: authReq.user?.userId });

  if (!businessId || !planId) {
    return res.status(400).json({ error: "businessId și planId sunt obligatorii." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        owner: { select: { id: true, email: true } },
        currentPlan: true,
      },
    });

    if (!business) {
      logger.warn("Create checkout: Business not found", { businessId });
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.owner.id !== authReq.user?.userId) {
      logger.warn("Create checkout: Unauthorized", { 
        businessId, 
        userId: authReq.user?.userId, 
        ownerId: business.owner.id 
      });
      return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
    }
    // Mapare pentru ID-uri hardcodate din frontend
    let plan;
    if (planId === "pro") {
      plan = await prisma.subscriptionPlan.findUnique({
        where: { name: "VOOB PRO" },
      });
    } else if (planId === "business") {
      plan = await prisma.subscriptionPlan.findUnique({
        where: { name: "VOOB BUSINESS" },
      });
    } else {
      // Încearcă să găsească după ID
      plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });
    }

    if (!plan) {
      logger.warn("Create checkout: Plan not found", { planId });
      return res.status(404).json({ error: "Planul nu a fost găsit." });
    }

    logger.info("Create checkout: Plan found", { planId: plan.id, planName: plan.name, price: plan.price });

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (stripeError) {
      logger.error("Create checkout: Stripe client error", stripeError);
      return res.status(500).json({ 
        error: "Stripe nu este configurat corect.",
        details: process.env.NODE_ENV === "development" ? (stripeError instanceof Error ? stripeError.message : String(stripeError)) : undefined,
      });
    }

    // Creează sau obține customer Stripe
    let customerId: string;
    const existingSubscription = await prisma.subscription.findFirst({
      where: { businessId, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    });

    if (existingSubscription?.stripeCustomerId) {
      customerId = existingSubscription.stripeCustomerId;
      logger.info("Create checkout: Using existing Stripe customer", { customerId });
    } else {
      try {
        const customer = await stripe.customers.create({
          email: business.owner.email || undefined,
          metadata: {
            businessId,
          },
        });
        customerId = customer.id;
        logger.info("Create checkout: Created new Stripe customer", { customerId });
      } catch (customerError) {
        logger.error("Create checkout: Stripe customer creation error", customerError);
        return res.status(500).json({ 
          error: "Nu am putut crea customer-ul Stripe.",
          details: process.env.NODE_ENV === "development" ? (customerError instanceof Error ? customerError.message : String(customerError)) : undefined,
        });
      }
    }

    // Creează Checkout Session
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const successUrl = `${frontendUrl}/business/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/business/subscription/cancel`;
    
    logger.info("Create checkout: URLs", { successUrl, cancelUrl, frontendUrl });

    // Validează datele planului
    const currency = (plan.currency || "RON").toLowerCase();
    const billingCycle = (plan.billingCycle || "MONTHLY").toLowerCase();
    const interval = billingCycle === "monthly" ? "month" : "year";
    const unitAmount = Math.round(plan.price * 100);

    if (!currency || !interval || unitAmount <= 0) {
      logger.error("Invalid plan data", { plan, currency, interval, unitAmount });
      return res.status(400).json({ error: "Datele planului sunt invalide." });
    }

    let session;
    try {
      logger.info("Create checkout: Creating Stripe session", { 
        customerId, 
        currency, 
        interval, 
        unitAmount,
        planName: plan.name 
      });
      
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: plan.name,
                description: plan.description || undefined,
              },
              recurring: {
                interval,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          businessId,
          planId: plan.id, // Folosește ID-ul real al planului, nu "pro" sau "business"
          company: "VOOB",
        },
        subscription_data: {
          metadata: {
            company: "VOOB",
            businessId,
            planId: plan.id,
          },
          description: `Abonament ${plan.name} - VOOB`,
        },
        payment_intent_data: {
          description: `Abonament ${plan.name} - VOOB`,
          metadata: {
            company: "VOOB",
            businessId,
            planId: plan.id,
          },
        },
      });

      logger.info("Create checkout: Stripe session created", { sessionId: session.id });
    } catch (sessionError) {
      logger.error("Create checkout: Stripe session creation error", sessionError);
      return res.status(500).json({ 
        error: "Nu am putut crea sesiunea de checkout Stripe.",
        details: process.env.NODE_ENV === "development" ? (sessionError instanceof Error ? sessionError.message : String(sessionError)) : undefined,
      });
    }

    if (!session.url) {
      logger.error("Create checkout: Session created but no URL", { sessionId: session.id });
      return res.status(500).json({ error: "Sesiunea Stripe nu are URL." });
    }

    return res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error("Create checkout error", error);
    const errorMessage = error instanceof Error ? error.message : "Eroare necunoscută";
    const errorStack = error instanceof Error ? error.stack : undefined;
    return res.status(500).json({ 
      error: "Eroare la crearea sesiunii de checkout.",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      stack: process.env.NODE_ENV === "development" ? errorStack : undefined,
    });
  }
});

/**
 * POST /subscription/webhook
 * Webhook pentru evenimente Stripe subscription
 */
router.post("/webhook", express.raw({ type: "application/json" }), async (req: express.Request, res: express.Response) => {
  const webhookSecret = getWebhookSecret("billing") || process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET nu este setat");
    return res.status(500).send("Webhook secret not configured");
  }

  // Verifică semnătura folosind middleware-ul unificat
  const verifyMiddleware = verifyStripeWebhook(webhookSecret);
  
  // Aplică middleware-ul manual
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
      logger.info("Subscription webhook event already processed", { eventId, type: event.type });
      return res.json({ received: true });
    }

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
              // IMPORTANT FIX: Verifică dacă subscription-ul este deja ACTIVE cu același plan
              if (existingSubscription.status === "ACTIVE" && existingSubscription.planId === planId) {
                logger.warn("Checkout session already processed", { businessId, planId, sessionId: session.id });
                break; // Skip - deja procesat
              }

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
            const updatedBusiness = await prisma.business.update({
              where: { id: businessId },
              data: { currentPlanId: planId },
              include: {
                owner: { select: { email: true, name: true } },
              },
            });

            // Trimite email de confirmare
            const finalSubscription = await prisma.subscription.findFirst({
              where: { businessId },
              include: { plan: true },
              orderBy: { createdAt: "desc" },
            });

            if (finalSubscription && updatedBusiness.owner.email) {
              const features: string[] = [];
              if (finalSubscription.plan.maxEmployees) {
                features.push(
                  `${finalSubscription.plan.maxEmployees} ${finalSubscription.plan.maxEmployees === 1 ? "utilizator" : "utilizatori"}`
                );
              }
              if (finalSubscription.plan.smsIncluded) {
                features.push(`${finalSubscription.plan.smsIncluded} SMS/lună`);
              }
              if (finalSubscription.plan.name === "VOOB BUSINESS") {
                features.push("Suport prioritar 2-4h");
              } else {
                features.push("Suport în 24-48h");
              }

              const periodEndFormatted = finalSubscription.currentPeriodEnd.toLocaleDateString("ro-RO", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

              const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Abonament activat - VOOB</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
                  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <div style="background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 40px 20px; text-align: center;">
                      <div style="background-color: rgba(255, 255, 255, 0.2); width: 64px; height: 64px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">Abonament activat cu succes!</h1>
                    </div>
                    
                    <div style="padding: 40px 30px;">
                      <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Buna ${updatedBusiness.owner.name || "Utilizator"},
                      </p>
                      
                      <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                        Abonamentul tău pentru <strong>${finalSubscription.plan.name}</strong> a fost activat cu succes! 
                        Vei fi facturat automat lunar pentru a continua să beneficiezi de toate funcționalitățile VOOB.
                      </p>

                      <div style="background-color: #f8f9fa; border-radius: 12px; padding: 30px; margin-bottom: 30px; border: 1px solid #e9ecef;">
                        <h2 style="color: #1a1a1a; font-size: 22px; font-weight: bold; margin: 0 0 20px 0;">
                          ${finalSubscription.plan.name}
                        </h2>
                        
                        <div style="margin-bottom: 25px;">
                          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e9ecef;">
                            <span style="color: #666666; font-size: 15px;">Preț:</span>
                            <span style="color: #1a1a1a; font-size: 18px; font-weight: bold;">
                              ${finalSubscription.plan.price} ${finalSubscription.plan.currency}/lună
                            </span>
                          </div>
                          
                          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e9ecef;">
                            <span style="color: #666666; font-size: 15px;">Valabil până la:</span>
                            <span style="color: #1a1a1a; font-size: 15px; font-weight: 600;">
                              ${periodEndFormatted}
                            </span>
                          </div>
                          
                          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
                            <span style="color: #666666; font-size: 15px;">Ciclu de facturare:</span>
                            <span style="color: #1a1a1a; font-size: 15px; font-weight: 600;">
                              ${finalSubscription.plan.billingCycle === "MONTHLY" ? "Lunar" : "Anual"}
                            </span>
                          </div>
                        </div>

                        ${features.length > 0 ? `
                        <div style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #e9ecef;">
                          <h3 style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin: 0 0 15px 0;">
                            Inclus în abonament:
                          </h3>
                          <ul style="margin: 0; padding: 0; list-style: none;">
                            ${features
                              .map(
                                (feature) => `
                            <li style="display: flex; align-items: center; padding: 8px 0; color: #333333; font-size: 15px;">
                              <span style="color: #10b981; margin-right: 10px; font-size: 18px;">✓</span>
                              ${feature}
                            </li>
                            `
                              )
                              .join("")}
                          </ul>
                        </div>
                        ` : ""}
                      </div>

                      ${finalSubscription.plan.description ? `
                      <div style="background-color: #f0f4ff; border-left: 4px solid #6366F1; padding: 15px 20px; margin-bottom: 30px; border-radius: 4px;">
                        <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                          <strong>Descriere:</strong> ${finalSubscription.plan.description}
                        </p>
                      </div>
                      ` : ""}

                      <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Poți gestiona abonamentul tău și vedea toate detaliile din panoul de control VOOB.
                      </p>

                      <div style="text-align: center; margin-top: 30px;">
                        <a href="${process.env.FRONTEND_URL || "http://localhost:3001"}/business/subscription" 
                           style="display: inline-block; background-color: #6366F1; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                          Vezi detalii abonament
                        </a>
                      </div>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
                      <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                        Cu respect,<br>
                        <strong>Echipa VOOB</strong>
                      </p>
                      <p style="color: #999999; font-size: 12px; margin: 0;">
                        Acest email a fost trimis automat. Te rugăm să nu răspunzi la acest email.
                      </p>
                    </div>
                  </div>
                </body>
                </html>
              `;

              sendEmail({
                to: updatedBusiness.owner.email,
                subject: `Abonament ${finalSubscription.plan.name} activat - VOOB`,
                html: emailHtml,
              }).catch((error: unknown) => {
                logger.error("Failed to send subscription confirmation email", error);
                // Nu aruncăm eroarea, doar logăm
              });
            }
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
    logger.error("Webhook handler error", error);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
  });
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

/**
 * GET /subscription/success-details
 * Obține detaliile subscription-ului pentru pagina de success
 */
router.get("/success-details", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { session_id } = req.query;
  const authReq = req as AuthenticatedRequest;

  if (!session_id || typeof session_id !== "string") {
    return res.status(400).json({ error: "session_id este obligatoriu." });
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session.metadata?.businessId) {
      return res.status(404).json({ error: "Sesiunea nu a fost găsită." });
    }

    const business = await prisma.business.findUnique({
      where: { id: session.metadata.businessId },
      include: {
        owner: { select: { id: true, email: true } },
      },
    });

    if (!business || (business.owner.id !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN")) {
      return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste detalii." });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { businessId: session.metadata.businessId },
      include: {
        plan: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription || !subscription.plan) {
      return res.status(404).json({ error: "Abonamentul nu a fost găsit." });
    }

    const features: string[] = [];
    if (subscription.plan.maxEmployees) {
      features.push(
        `${subscription.plan.maxEmployees} ${subscription.plan.maxEmployees === 1 ? "utilizator" : "utilizatori"}`
      );
    }
    if (subscription.plan.smsIncluded) {
      features.push(`${subscription.plan.smsIncluded} SMS/lună`);
    }
    if (subscription.plan.name === "VOOB BUSINESS") {
      features.push("Suport prioritar 2-4h");
    } else {
      features.push("Suport în 24-48h");
    }

    return res.json({
      planName: subscription.plan.name,
      price: subscription.plan.price,
      currency: subscription.plan.currency,
      periodEnd: subscription.currentPeriodEnd.toISOString(),
      features,
    });
  } catch (error) {
    logger.error("Get success details error", error);
    return res.status(500).json({ error: "Eroare la obținerea detaliilor." });
  }
});

export = router;

