import { useState, useCallback } from "react";
import useApi from "./useApi";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  smsIncluded: number | null;
  maxEmployees: number | null;
  description: string | null;
}

export default function useSubscription() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const createCheckout = useCallback(
    async (businessId: string, planId: string) => {
      setLoading(true);
      setError(null);

      try {
        const { data } = await api.post<{ sessionId: string; url: string }>("/subscription/create-checkout", {
          businessId,
          planId,
        });

        // Redirect către Stripe Checkout
        const stripe = await stripePromise;
        if (stripe && data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("Stripe nu este configurat corect.");
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || err.message || "Eroare la crearea sesiunii de checkout.";
        setError(errorMessage);
        console.error("Create checkout error:", err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  return {
    createCheckout,
    loading,
    error,
  };
}

