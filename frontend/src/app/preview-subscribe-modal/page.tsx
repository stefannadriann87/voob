"use client";

import { useState } from "react";
import { logger } from "../../lib/logger";

export default function PreviewSubscribeModalPage() {
  const [isOpen, setIsOpen] = useState(true);

  const availablePlans = [
    { id: "pro", name: "VOOB PRO", price: 149, features: ["1 utilizator", "150 SMS/lună", "Suport 24-48h"] },
    {
      id: "business",
      name: "VOOB BUSINESS",
      price: 299,
      features: ["5 utilizatori", "500 SMS/lună", "Suport prioritar 2-4h"],
      popular: true,
    },
  ];

  const handleSubscribe = (planId: string) => {
    logger.log("Subscribe to plan:", planId);
    alert(`Ai selectat planul: ${planId}`);
  };

  if (!isOpen) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#6366F1] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition"
        >
          Deschide modala de subscribe
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0B0E17] border border-white/10 rounded-3xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Trial-ul tău a expirat</h2>
          <p className="text-white/70">
            Pentru a continua să folosești VOOB, te rugăm să activezi un plan de abonament.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {availablePlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative border rounded-2xl p-6 ${
                plan.popular
                  ? "border-[#6366F1] bg-[#6366F1]/10"
                  : "border-white/10 bg-[#0B0E17]/60"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-[#6366F1] text-white px-4 py-1 rounded-full text-xs font-semibold">
                    CEA MAI POPULARĂ
                  </span>
                </div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-white/70 ml-1">lei/lună</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center text-white/70">
                    <svg className="w-5 h-5 text-[#6366F1] mr-2" fill="currentColor" viewBox="0 0 20 20">
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
              <button
                onClick={() => handleSubscribe(plan.id)}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  plan.popular
                    ? "bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                Alege planul
              </button>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-white/50 text-sm">
            Ai nevoie de ajutor?{" "}
            <a href="/support" className="text-[#6366F1] hover:underline">
              Contactează suportul
            </a>
          </p>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/50 hover:text-white text-sm underline"
          >
            Închide preview
          </button>
        </div>
      </div>
    </div>
  );
}
