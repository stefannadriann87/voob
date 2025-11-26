import Stripe from "stripe";
import { PaymentMethod } from "@prisma/client";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2024-11-20.acacia";

let stripeInstance: Stripe | null = null;

export const getStripeClient = () => {
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

  return stripeInstance;
};

export type ClientPaymentMethod = "card" | "offline";

export const getStripePaymentMethodTypes = (method: ClientPaymentMethod): string[] => {
  // Only card is supported now, automatic_payment_methods handles card/Apple Pay/Google Pay
  return ["card"];
};

export const requiresRedirectFlow = (method: ClientPaymentMethod) => false;

export const mapClientMethodToPrisma = (method: ClientPaymentMethod): PaymentMethod => {
  switch (method) {
    case "card":
      return PaymentMethod.CARD;
    default:
      return PaymentMethod.OFFLINE;
  }
};

