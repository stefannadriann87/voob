/**
 * Billing Service
 * Gestionează logica de billing recurent pentru business-uri
 */

const prisma = require("../../lib/prisma").default;
const { getStripeClient } = require("../../services/stripeService");

/**
 * Creează un SetupIntent pentru salvarea cardului
 */
export async function createSetupIntent(businessId: string): Promise<string> {
  const stripe = getStripeClient();

  // Verifică dacă există customer Stripe
  const existingSubscription = await prisma.subscription.findFirst({
    where: { businessId },
    select: { stripeCustomerId: true },
  });

  let customerId: string;

  if (existingSubscription?.stripeCustomerId) {
    customerId = existingSubscription.stripeCustomerId;
  } else {
    // Creează customer nou
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { owner: { select: { email: true } } },
    });

    if (!business) {
      throw new Error("Business nu a fost găsit.");
    }

    const customer = await stripe.customers.create({
      email: business.owner.email || undefined,
      metadata: {
        businessId,
      },
    });

    customerId = customer.id;

    // Salvează customer ID în subscription existent sau creează unul nou
    await prisma.subscription.upsert({
      where: { businessId },
      update: { stripeCustomerId: customerId },
      create: {
        businessId,
        planId: "", // Va fi actualizat la subscribe
        status: "TRIAL",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        billingMethod: "CARD",
        amount: 0,
        currency: "RON",
        stripeCustomerId: customerId,
      },
    });
  }

  // Creează SetupIntent
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    metadata: {
      businessId,
    },
  });

  return setupIntent.client_secret!;
}

/**
 * Atașează PaymentMethod la Customer și îl setează ca default
 */
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  const stripe = getStripeClient();

  // Atașează PaymentMethod la Customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });

  // Setează ca default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

/**
 * Creează Stripe Subscription pentru un business
 */
export async function createSubscription(
  businessId: string,
  planId: string,
  paymentMethodId: string,
  consentData: {
    consent: boolean;
    ip: string;
  }
): Promise<{ subscriptionId: string; customerId: string }> {
  if (!consentData.consent) {
    throw new Error("Consimțământul pentru auto-billing este obligatoriu.");
  }

  const stripe = getStripeClient();

  // Obține planul
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error("Planul nu a fost găsit.");
  }

  // Obține sau creează customer
  let customerId: string;
  const existingSubscription = await prisma.subscription.findFirst({
    where: { businessId },
    select: { stripeCustomerId: true },
  });

  if (existingSubscription?.stripeCustomerId) {
    customerId = existingSubscription.stripeCustomerId;
  } else {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { owner: { select: { email: true } } },
    });

    if (!business) {
      throw new Error("Business nu a fost găsit.");
    }

    const customer = await stripe.customers.create({
      email: business.owner.email || undefined,
      metadata: { businessId },
    });
    customerId = customer.id;
  }

  // Atașează PaymentMethod
  await attachPaymentMethod(customerId, paymentMethodId);

  // IMPORTANT: Trebuie să ai Stripe Price ID pentru plan
  // Pentru moment, folosim price_data (dar în producție ar trebui să ai Price IDs)
  // NOTĂ: Trebuie să creezi Prices în Stripe Dashboard pentru fiecare plan
  const priceId = plan.stripePriceId || null;

  if (!priceId) {
    throw new Error(
      `Planul ${plan.name} nu are un Stripe Price ID configurat. Creează un Price în Stripe Dashboard și adaugă-l în plan.`
    );
  }

  // Creează Subscription în Stripe
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    default_payment_method: paymentMethodId,
    payment_behavior: "default_incomplete", // Permite subscription chiar dacă prima plată eșuează
    metadata: {
      businessId,
      planId,
    },
    expand: ["latest_invoice.payment_intent"],
  });

  // Calculează next billing date
  const nextBillingDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  // Actualizează sau creează subscription în DB
  const existingSub = await prisma.subscription.findFirst({
    where: { businessId },
  });

  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
      planId,
      status: "ACTIVE",
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      amount: plan.price,
      currency: plan.currency,
      billingMethod: "CARD",
      autoBillingEnabled: true,
      autoBillingConsent: true,
      autoBillingConsentIP: consentData.ip,
      autoBillingConsentAt: new Date(),
        nextBillingDate,
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        businessId,
        planId,
        status: "ACTIVE",
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        amount: plan.price,
        currency: plan.currency,
        billingMethod: "CARD",
        autoBillingEnabled: true,
        autoBillingConsent: true,
        autoBillingConsentIP: consentData.ip,
        autoBillingConsentAt: new Date(),
        nextBillingDate,
      },
    });
  }

  return {
    subscriptionId: subscription.id,
    customerId,
  };
}

/**
 * Anulează subscription (cancel_at_period_end)
 */
export async function cancelSubscription(businessId: string): Promise<void> {
  const stripe = getStripeClient();

  const subscription = await prisma.subscription.findFirst({
    where: { businessId },
    select: { stripeSubscriptionId: true },
  });

  if (!subscription?.stripeSubscriptionId) {
    throw new Error("Subscription nu a fost găsit.");
  }

  // Anulează subscription în Stripe (va continua până la sfârșitul perioadei)
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  // Actualizează în DB
  await prisma.subscription.updateMany({
    where: { businessId },
    data: {
      autoBillingEnabled: false,
    },
  });
}

/**
 * Obține statusul subscription-ului pentru un business
 */
export async function getSubscriptionStatus(businessId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { businessId },
    include: {
      plan: {
        select: {
          id: true,
          name: true,
          price: true,
          currency: true,
          billingCycle: true,
        },
      },
    },
  });

  if (!subscription) {
    return null;
  }

  return {
    plan: subscription.plan,
    status: subscription.status,
    nextBillingDate: subscription.nextBillingDate,
    autoBillingEnabled: subscription.autoBillingEnabled,
    autoBillingConsent: subscription.autoBillingConsent,
    autoBillingConsentAt: subscription.autoBillingConsentAt,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    stripeCustomerId: subscription.stripeCustomerId,
  };
}

module.exports = {
  createSetupIntent,
  attachPaymentMethod,
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
};

