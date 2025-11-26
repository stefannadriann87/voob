"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function BillingSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect după 5 secunde
    const timer = setTimeout(() => {
      router.push("/business/billing");
    }, 5000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0B0E17] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#1A1F2E] rounded-lg p-8 border border-white/10 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Abonament activat cu succes!</h1>
          <p className="text-white/60">
            Abonamentul tău a fost activat și vei fi facturat automat lunar.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/business/billing"
            className="block w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Vezi detalii abonament
          </Link>
          <Link
            href="/business/dashboard"
            className="block w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Mergi la Dashboard
          </Link>
        </div>

        <p className="text-sm text-white/40 mt-6">
          Vei fi redirecționat automat în 5 secunde...
        </p>
      </div>
    </div>
  );
}

