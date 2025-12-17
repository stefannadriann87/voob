"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";
import useBilling from "../../../hooks/useBilling";
import useApi from "../../../hooks/useApi";
import { logger } from "../../../lib/logger";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
}

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
  currentPeriodEnd: string;
}

function BillingForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { businesses, loading: businessesLoading } = useBusiness();
  const {
    createSetupIntent,
    subscribe,
    cancelSubscription,
    getBillingStatus,
    loading: billingLoading,
    error: billingError,
  } = useBilling();
  const api = useApi();

  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (!hydrated) return;

    if (user?.role !== "BUSINESS") {
      router.push("/");
      return;
    }

    if (businesses.length > 0 && !selectedBusinessId) {
      setSelectedBusinessId(businesses[0].id);
    }
  }, [user, hydrated, businesses, router, selectedBusinessId]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { data } = await api.get<SubscriptionPlan[]>("/subscription/plans");
        if (data && data.length > 0) {
          setPlans(data);
        } else {
          // Fallback
          const proPlan: SubscriptionPlan = {
            id: "pro",
            name: "VOOB PRO",
            price: 149,
            currency: "RON",
            billingCycle: "MONTHLY",
          };

          const businessPlan: SubscriptionPlan = {
            id: "business",
            name: "VOOB BUSINESS",
            price: 299,
            currency: "RON",
            billingCycle: "MONTHLY",
          };

          setPlans([proPlan, businessPlan]);
        }
      } catch (error) {
        logger.error("Failed to fetch plans:", error);
        const proPlan: SubscriptionPlan = {
          id: "pro",
          name: "VOOB PRO",
          price: 149,
          currency: "RON",
          billingCycle: "MONTHLY",
        };

        const businessPlan: SubscriptionPlan = {
          id: "business",
          name: "VOOB BUSINESS",
          price: 299,
          currency: "RON",
          billingCycle: "MONTHLY",
        };

        setPlans([proPlan, businessPlan]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [api]);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!selectedBusinessId) return;

      try {
        const status = await getBillingStatus(selectedBusinessId);
        setBillingStatus(status);
      } catch (error) {
        logger.error("Failed to fetch billing status:", error);
      } finally {
        setStatusLoading(false);
      }
    };

    if (selectedBusinessId) {
      fetchStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusinessId]);

  const handlePlanSelect = async (planId: string) => {
    if (!selectedBusinessId) return;

    setSelectedPlanId(planId);
    setClientSecret(null);
    try {
      const secret = await createSetupIntent(selectedBusinessId);
      setClientSecret(secret);
    } catch (error) {
      logger.error("Failed to create setup intent:", error);
      alert("Eroare la inițializarea formularului de plată. Te rugăm să încerci din nou.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !selectedBusinessId || !selectedPlanId || !consentChecked) {
      return;
    }

    setProcessing(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { setupIntent, error: confirmError } = await stripe.confirmCardSetup(clientSecret!, {
        payment_method: {
          card: cardElement,
        },
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (!setupIntent?.payment_method) {
        throw new Error("Payment method not found");
      }

      const ipResponse = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipResponse.json();
      const clientIp = ipData.ip || "unknown";

      await subscribe(selectedBusinessId, selectedPlanId, setupIntent.payment_method as string, true, clientIp);

      router.push("/business/billing/success");
    } catch (error: any) {
      logger.error("Subscription activation error:", error);
      alert(error.message || "Eroare la activarea subscription-ului.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedBusinessId) return;

    if (!confirm("Ești sigur că vrei să anulezi abonamentul? Abonamentul va continua până la sfârșitul perioadei curente.")) {
      return;
    }

    try {
      await cancelSubscription(selectedBusinessId);
      alert("Abonamentul a fost anulat cu succes.");
      // Refresh status
      const status = await getBillingStatus(selectedBusinessId);
      setBillingStatus(status);
    } catch (error: any) {
      logger.error("Cancel subscription error:", error);
      alert(error.message || "Eroare la anularea abonamentului.");
    }
  };

  if (!hydrated || loading || businessesLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Se încarcă...</div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Nu ai niciun business asociat.</div>
      </div>
    );
  }

  // Dacă are subscription activ
  if (billingStatus && billingStatus.status === "ACTIVE" && billingStatus.autoBillingEnabled) {
    const nextBillingDate = billingStatus.nextBillingDate
      ? new Date(billingStatus.nextBillingDate).toLocaleDateString("ro-RO")
      : "N/A";

    return (
      <div className="min-h-screen bg-[#0B0E17] text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Facturare și Abonament</h1>

          <div className="bg-[#1A1F2E] rounded-lg p-6 border border-white/10 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Status Abonament</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Status:</span>
                  <span className="text-green-400 font-semibold">Activ</span>
                </div>
                {billingStatus.plan && (
                  <div className="flex justify-between">
                    <span className="text-white/60">Plan:</span>
                    <span className="font-semibold">{billingStatus.plan.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/60">Următoarea dată de facturare:</span>
                  <span className="font-semibold">{nextBillingDate}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleCancel}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Anulează abonamentul
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dacă subscription este CANCELED
  if (billingStatus && billingStatus.status === "CANCELED") {
    const expiryDate = billingStatus.currentPeriodEnd
      ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString("ro-RO")
      : "N/A";

    return (
      <div className="min-h-screen bg-[#0B0E17] text-white p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Facturare și Abonament</h1>

          <div className="bg-[#1A1F2E] rounded-lg p-6 border border-white/10 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Status Abonament</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">Status:</span>
                  <span className="text-red-400 font-semibold">Anulat</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Expiră la:</span>
                  <span className="font-semibold">{expiryDate}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setBillingStatus(null);
                setSelectedPlanId(null);
                setClientSecret(null);
              }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Reînnoiește abonamentul
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Formular de activare
  return (
    <div className="min-h-screen bg-[#0B0E17] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Facturare și Abonament</h1>

        {billingError && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
            {billingError}
          </div>
        )}

        <div className="bg-[#1A1F2E] rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Selectează Planul</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => handlePlanSelect(plan.id)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedPlanId === plan.id
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-left">
                  <h3 className="font-semibold text-lg">{plan.name}</h3>
                  <p className="text-2xl font-bold mt-2">
                    {plan.price} {plan.currency}
                    <span className="text-sm font-normal text-white/60">/lună</span>
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selectedPlanId && clientSecret && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Detalii Card</label>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <CardElement
                    options={{
                      style: {
                        base: {
                          fontSize: "16px",
                          color: "#ffffff",
                          "::placeholder": {
                            color: "#aab7c4",
                          },
                        },
                        invalid: {
                          color: "#fa755a",
                        },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="consent"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="consent" className="text-sm text-white/80 leading-relaxed">
                  Sunt de acord ca VOOB să îmi debiteze automat cardul lunar pentru abonamentul selectat.{" "}
                  Confirm că am citit și accept Termenii și Condițiile și Politica de Confidențialitate.{" "}
                  Pot anula oricând din zona de facturare înainte de data următoarei plăți.
                </label>
              </div>

              <button
                type="submit"
                disabled={!consentChecked || processing || billingLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {processing ? "Se procesează..." : "Activează abonamentul"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BusinessBillingPage() {
  return (
    <Elements stripe={stripePromise}>
      <BillingForm />
    </Elements>
  );
}
