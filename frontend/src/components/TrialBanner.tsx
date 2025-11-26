"use client";

import useTrialStatus from "../hooks/useTrialStatus";
import useAuth from "../hooks/useAuth";
import Link from "next/link";

interface TrialBannerProps {
  businessId: string | null;
}

export default function TrialBanner({ businessId }: TrialBannerProps) {
  const { trialStatus, loading } = useTrialStatus(businessId);
  const { user } = useAuth();

  // Nu afișa banner-ul dacă nu ești business sau nu ai businessId
  if (user?.role !== "BUSINESS" || !businessId || loading || !trialStatus) {
    return null;
  }

  // Nu afișa dacă are subscription activ
  if (trialStatus.hasActiveSubscription) {
    return null;
  }

  // Nu afișa dacă trial-ul a expirat (se va afișa modal-ul)
  if (trialStatus.isExpired) {
    return null;
  }

  const daysRemaining = trialStatus.daysRemaining;

  if (daysRemaining === null || daysRemaining <= 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white py-3 px-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-semibold">
            {daysRemaining === 1
              ? "Ultima zi din trial gratuit!"
              : `${daysRemaining} zile rămase din trial gratuit`}
          </span>
        </div>
        <Link
          href="/business/subscription"
          className="bg-white text-[#6366F1] px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          Activează abonament
        </Link>
      </div>
    </div>
  );
}

