import type StripeType from "stripe";
const Stripe = require("stripe");
const { PaymentMethod } = require("@prisma/client");
type PaymentMethodEnum = (typeof PaymentMethod)[keyof typeof PaymentMethod];

const STRIPE_API_VERSION = "2024-11-20.acacia" as StripeType.LatestApiVersion;

let stripeInstance: StripeType | null = null;

const getStripeClient = (): StripeType => {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });

  return stripeInstance!;
};

type ClientPaymentMethod = "card" | "offline";

const getStripePaymentMethodTypes = (method: ClientPaymentMethod): string[] => {
  // Only card is supported now, automatic_payment_methods handles card/Apple Pay/Google Pay
  return ["card"];
};

const requiresRedirectFlow = (method: ClientPaymentMethod) => false;

const mapClientMethodToPrisma = (method: ClientPaymentMethod): PaymentMethodEnum => {
  switch (method) {
    case "card":
      return PaymentMethod.CARD;
    default:
      return PaymentMethod.OFFLINE;
  }
};

module.exports = {
  getStripeClient,
  getStripePaymentMethodTypes,
  requiresRedirectFlow,
  mapClientMethodToPrisma,
};

