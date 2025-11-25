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

export type ClientPaymentMethod = "card" | "applepay" | "googlepay" | "klarna" | "offline";

export const getStripePaymentMethodTypes = (method: ClientPaymentMethod): string[] => {
  switch (method) {
    case "klarna":
      return ["klarna"];
    case "card":
      return ["card"];
    case "applepay":
    case "googlepay":
      // Apple Pay / Google Pay use the card rails underneath Payment Request Button
      return ["card"];
    default:
      return ["card"];
  }
};

export const requiresRedirectFlow = (method: ClientPaymentMethod) => method === "klarna";

export const mapClientMethodToPrisma = (method: ClientPaymentMethod): PaymentMethod => {
  switch (method) {
    case "card":
      return PaymentMethod.CARD;
    case "applepay":
      return PaymentMethod.APPLE_PAY;
    case "googlepay":
      return PaymentMethod.GOOGLE_PAY;
    case "klarna":
      return PaymentMethod.KLARNA;
    default:
      return PaymentMethod.OFFLINE;
  }
};

