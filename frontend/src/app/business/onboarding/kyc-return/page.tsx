"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../../hooks/useAuth";
import useApi from "../../../../hooks/useApi";

export default function KycReturnPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const api = useApi();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Se verifică statusul verificării...");

  useEffect(() => {
    if (!hydrated || !user) return;

    if (user.role !== "BUSINESS") {
      router.push("/business/dashboard");
      return;
    }

    const checkStatus = async () => {
      try {
        // Obține businessId din user
        const businessId = user.business?.id;
        if (!businessId) {
          setStatus("error");
          setMessage("Business ID nu a fost găsit.");
          return;
        }

        // Verifică statusul KYC
        const { data } = await api.get(`/business-onboarding/status/${businessId}`);
        
        if (data.kycStatus?.status === "VERIFIED") {
          setStatus("success");
          setMessage("Verificarea a fost completată cu succes! Contul tău este acum activ.");
        } else if (data.kycStatus?.status === "IN_REVIEW") {
          setStatus("success");
          setMessage("Datele au fost trimise cu succes. Verificarea este în curs. Vei primi o notificare când procesul este finalizat.");
        } else if (data.kycStatus?.status === "REJECTED") {
          setStatus("error");
          setMessage(data.kycStatus.rejectionReason || "Verificarea a fost respinsă. Te rugăm să contactezi suportul.");
        } else {
          setStatus("success");
          setMessage("Onboarding-ul a fost salvat. Verifică statusul în dashboard.");
        }

        // Redirect după 3 secunde
        setTimeout(() => {
          router.push("/business/dashboard");
        }, 3000);
      } catch (error: any) {
        console.error("KYC status check error:", error);
        setStatus("error");
        setMessage("Eroare la verificarea statusului. Te rugăm să încerci din nou.");
      }
    };

    checkStatus();
  }, [hydrated, user, router, api]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-white">Se încarcă...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#1A1F2E] rounded-lg p-8 border border-white/10 text-center">
        {status === "loading" && (
          <div className="mb-6">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white/80">{message}</p>
          </div>
        )}

        {status === "success" && (
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
            <h1 className="text-2xl font-bold mb-2">Succes!</h1>
            <p className="text-white/80">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Eroare</h1>
            <p className="text-white/80">{message}</p>
          </div>
        )}

        <button
          onClick={() => router.push("/business/dashboard")}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Mergi la Dashboard
        </button>

        <p className="text-sm text-white/40 mt-6">
          Vei fi redirecționat automat în 3 secunde...
        </p>
      </div>
    </div>
  );
}

