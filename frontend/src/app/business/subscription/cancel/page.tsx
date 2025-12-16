"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SubscriptionCancelPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0B0E17] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#1A1F2E] rounded-lg p-8 border border-white/10 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Plata a fost anulată</h1>
          <p className="text-white/60">
            Nu s-a procesat nicio plată. Poți încerca din nou oricând.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/business/subscription"
            className="block w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Încearcă din nou
          </Link>
          <Link
            href="/business/dashboard"
            className="block w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Mergi la Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
