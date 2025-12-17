"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import useApi from "../../../../hooks/useApi";
import { logger } from "../../../../lib/logger";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const [showModal, setShowModal] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<{
    planName: string;
    price: number;
    currency: string;
    periodEnd: string;
    features: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      router.push("/business/subscription");
      return;
    }

    // Fetch subscription details
    const fetchSubscriptionDetails = async () => {
      try {
        const { data } = await api.get<{
          planName: string;
          price: number;
          currency: string;
          periodEnd: string;
          features: string[];
        }>(`/subscription/success-details?session_id=${sessionId}`);

        setSubscriptionData(data);
      } catch (error) {
        logger.error("Failed to fetch subscription details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptionDetails();
  }, [searchParams, api, router]);

  const handleCloseModal = () => {
    setShowModal(false);
    router.push("/business/dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0E17] text-white flex items-center justify-center">
        <div className="text-white">Se încarcă...</div>
      </div>
    );
  }

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0B0E17] border border-white/10 rounded-3xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Abonament activat cu succes!</h2>
              <p className="text-white/70">
                Abonamentul tău a fost activat și vei fi facturat automat lunar.
              </p>
            </div>

            {subscriptionData && (
              <div className="mb-8 space-y-4">
                <div className="bg-[#1A1F2E] rounded-xl p-6 border border-white/10">
                  <h3 className="text-xl font-bold text-white mb-4">{subscriptionData.planName}</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">Preț:</span>
                      <span className="text-white font-semibold">
                        {subscriptionData.price} {subscriptionData.currency}/lună
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">Valabil până la:</span>
                      <span className="text-white font-semibold">
                        {new Date(subscriptionData.periodEnd).toLocaleDateString("ro-RO", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  {subscriptionData.features.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <h4 className="text-sm font-semibold text-white/80 mb-3">Inclus în abonament:</h4>
                      <ul className="space-y-2">
                        {subscriptionData.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center text-white/70">
                            <svg
                              className="w-5 h-5 text-green-400 mr-2"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={handleCloseModal}
                className="flex-1 bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors"
              >
                Mergi la Dashboard
              </button>
              <Link
                href="/business/subscription"
                className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors text-center"
              >
                Vezi detalii abonament
              </Link>
            </div>

            <div className="mt-6 text-center">
              <p className="text-white/50 text-sm">
                Un email de confirmare a fost trimis la adresa ta de email cu toate detaliile abonamentului.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
