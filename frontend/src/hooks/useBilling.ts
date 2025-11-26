/**
 * useBilling Hook
 * Hook pentru gestionarea billing-ului recurent
 */

import { useState, useCallback } from "react";
import useApi from "./useApi";

interface BillingStatus {
  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    billingCycle: string;
  } | null;
  status: string;
  nextBillingDate: string | null;
  autoBillingEnabled: boolean;
  autoBillingConsent: boolean;
  autoBillingConsentAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

export default function useBilling() {
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Creează SetupIntent pentru salvarea cardului
   */
  const createSetupIntent = useCallback(
    async (businessId: string): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ client_secret: string }>("/billing/setup-intent", {
          businessId,
        });
        return data.client_secret;
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || "Eroare la crearea SetupIntent.";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  /**
   * Activează subscription pentru un business
   */
  const subscribe = useCallback(
    async (
      businessId: string,
      planId: string,
      paymentMethodId: string,
      consent: boolean,
      ipAddress?: string
    ): Promise<{ subscriptionId: string; customerId: string }> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ success: boolean; subscriptionId: string; customerId: string }>(
          "/billing/subscribe",
          {
            businessId,
            planId,
            payment_method_id: paymentMethodId,
            auto_billing_consent: consent,
            ip_address: ipAddress || "unknown",
          }
        );
        return { subscriptionId: data.subscriptionId, customerId: data.customerId };
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || "Eroare la activarea subscription-ului.";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  /**
   * Anulează subscription pentru un business
   */
  const cancelSubscription = useCallback(
    async (businessId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        await api.post("/billing/cancel", { businessId });
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || "Eroare la anularea subscription-ului.";
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  /**
   * Obține statusul subscription-ului pentru un business
   */
  const getBillingStatus = useCallback(
    async (businessId: string): Promise<BillingStatus | null> => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<BillingStatus>(`/billing/status/${businessId}`);
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || "Eroare la obținerea statusului.";
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  return {
    createSetupIntent,
    subscribe,
    cancelSubscription,
    getBillingStatus,
    loading,
    error,
  };
}

