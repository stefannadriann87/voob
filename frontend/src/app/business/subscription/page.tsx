"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";
import useSubscription from "../../../hooks/useSubscription";
import useApi from "../../../hooks/useApi";

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  smsIncluded: number | null;
  maxEmployees: number | null;
  description: string | null;
}

export default function BusinessSubscriptionPage() {
  const { user, hydrated } = useAuth();
  const router = useRouter();
  const { businesses, loading: businessesLoading } = useBusiness();
  const { createCheckout, loading: checkoutLoading, error: checkoutError } = useSubscription();
  const api = useApi();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;

    if (user?.role !== "BUSINESS") {
      router.push("/");
      return;
    }

    // Setează primul business dacă există
    if (businesses.length > 0 && !selectedBusinessId) {
      setSelectedBusinessId(businesses[0].id);
    }
  }, [user, hydrated, businesses, router, selectedBusinessId]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        // Presupunem că avem un endpoint pentru planuri
        // Pentru moment, folosim planurile hardcodate
        const proPlan: SubscriptionPlan = {
          id: "pro",
          name: "LARSTEF PRO",
          price: 149,
          currency: "RON",
          billingCycle: "MONTHLY",
          smsIncluded: 150,
          maxEmployees: 1,
          description: "Plan de bază cu 1 utilizator și 150 SMS/lună",
        };

        const businessPlan: SubscriptionPlan = {
          id: "business",
          name: "LARSTEF BUSINESS",
          price: 299,
          currency: "RON",
          billingCycle: "MONTHLY",
          smsIncluded: 500,
          maxEmployees: 5,
          description: "Plan premium cu 5 utilizatori și 500 SMS/lună",
        };

        setPlans([proPlan, businessPlan]);
      } catch (error) {
        console.error("Fetch plans error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const handleSubscribe = async (planId: string) => {
    if (!selectedBusinessId) {
      alert("Te rugăm să selectezi un business.");
      return;
    }

    try {
      await createCheckout(selectedBusinessId, planId);
    } catch (error) {
      console.error("Subscribe error:", error);
    }
  };

  if (!hydrated || loading || businessesLoading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-white">Se încarcă...</div>
      </div>
    );
  }

  if (user?.role !== "BUSINESS") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Alege planul tău</h1>
          <p className="text-white/70">Selectează planul potrivit pentru afacerea ta</p>
        </div>

        {businesses.length > 1 && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Selectează business-ul:</label>
            <select
              value={selectedBusinessId || ""}
              onChange={(e) => setSelectedBusinessId(e.target.value)}
              className="bg-[#0B0E17] border border-white/10 rounded-lg px-4 py-2 text-white"
            >
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {checkoutError && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
            {checkoutError}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative border rounded-2xl p-8 ${
                plan.name === "LARSTEF BUSINESS"
                  ? "border-[#6366F1] bg-[#6366F1]/10"
                  : "border-white/10 bg-[#0B0E17]/60"
              }`}
            >
              {plan.name === "LARSTEF BUSINESS" && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#6366F1] text-white px-4 py-1 rounded-full text-xs font-semibold">
                    CEA MAI POPULARĂ
                  </span>
                </div>
              )}
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-white/70 ml-1">lei/lună</span>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#6366F1] mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-white/70">
                    {plan.maxEmployees} {plan.maxEmployees === 1 ? "utilizator" : "utilizatori"}
                  </span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#6366F1] mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-white/70">{plan.smsIncluded} SMS/lună</span>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-[#6366F1] mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-white/70">
                    {plan.name === "LARSTEF BUSINESS" ? "Suport prioritar 2-4h" : "Suport în 24-48h"}
                  </span>
                </li>
              </ul>

              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={checkoutLoading || !selectedBusinessId}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  plan.name === "LARSTEF BUSINESS"
                    ? "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                    : "bg-white/10 text-white hover:bg-white/20"
                } ${checkoutLoading || !selectedBusinessId ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {checkoutLoading ? "Se procesează..." : "Alege planul"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

