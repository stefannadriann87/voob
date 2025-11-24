"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useAuth from "../../hooks/useAuth";
import useBusiness from "../../hooks/useBusiness";

type StatusState = { type: "success" | "error" | "info"; message: string } | null;

const APP_STORE_URL = "https://apps.apple.com/app/larstef"; // Update with actual App Store URL
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.larstef.app"; // Update with actual Play Store URL
const APP_DEEP_LINK_SCHEME = "larstef://"; // Update with actual deep link scheme

export default function LinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bizId = searchParams.get("biz");
  const { user, hydrated } = useAuth();
  const { linkClientToBusiness, fetchBusinesses } = useBusiness();
  const [status, setStatus] = useState<StatusState>(null);
  const [processing, setProcessing] = useState(false);

  // Store pending business ID if user is not authenticated
  useEffect(() => {
    if (!hydrated) return;
    if (!bizId) {
      setStatus({ type: "error", message: "Link invalid. Lipsește identificatorul business-ului." });
      return;
    }
    if (!user) {
      // Store pending business ID in localStorage
      if (typeof window !== "undefined") {
        window.localStorage.setItem("larstef_pending_business_id", bizId);
      }
      return;
    }
    // Clear pending business ID if user is authenticated
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("larstef_pending_business_id");
    }
  }, [hydrated, user, bizId]);

  // Handle business attachment when user is authenticated
  useEffect(() => {
    if (!hydrated || !user || !bizId) return;
    if (user.role !== "CLIENT") {
      setStatus({ type: "error", message: "Doar conturile de client pot folosi aceste link-uri." });
      return;
    }

    const attachBusiness = async () => {
      setProcessing(true);
      setStatus({ type: "info", message: "Se verifică business-ul..." });
      try {
        const business = await linkClientToBusiness(bizId);
        await fetchBusinesses({ scope: "linked" });
        setStatus({
          type: "success",
          message: `Ești conectat la ${business.name}. Redirecționăm către dashboard...`,
        });
        setTimeout(() => router.push("/client/dashboard"), 1500);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Nu am putut conecta acest business. Încearcă din nou.";
        setStatus({ type: "error", message });
      } finally {
        setProcessing(false);
      }
    };

    void attachBusiness();
  }, [hydrated, user, bizId, linkClientToBusiness, fetchBusinesses, router]);

  const loginUrl = useMemo(() => {
    const redirect = "/link" + (bizId ? `?biz=${bizId}` : "");
    return `/auth/login?redirect=${encodeURIComponent(redirect)}`;
  }, [bizId]);

  const registerUrl = useMemo(() => {
    const redirect = "/link" + (bizId ? `?biz=${bizId}` : "");
    return `/auth/register?redirect=${encodeURIComponent(redirect)}`;
  }, [bizId]);

  const deepLinkUrl = useMemo(() => {
    if (!bizId) return null;
    return `${APP_DEEP_LINK_SCHEME}link?biz=${bizId}`;
  }, [bizId]);

  const handleOpenApp = () => {
    if (deepLinkUrl && typeof window !== "undefined") {
      // Try to open the app
      window.location.href = deepLinkUrl;
      // Fallback: after a short delay, show install options if app didn't open
      setTimeout(() => {
        // If we're still on the page, the app likely didn't open
        setStatus({
          type: "info",
          message: "Aplicația nu este instalată. Te rugăm să o instalezi mai jos.",
        });
      }, 1000);
    }
  };

  // Show landing page for unauthenticated users
  if (!user && hydrated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-4 py-16 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-2xl shadow-black/30">
          <h1 className="text-3xl font-semibold">Conectează-te la business</h1>
          <p className="mt-3 text-sm text-white/60">
            Scanează codul QR pentru a te conecta la acest business și a rezerva servicii.
          </p>

          {status && (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : status.type === "error"
                    ? "border-red-500/40 bg-red-500/10 text-red-200"
                    : "border-[#6366F1]/40 bg-[#6366F1]/10 text-white"
              }`}
            >
              {status.message}
            </div>
          )}

          {!bizId && (
            <p className="mt-6 text-sm text-white/60">
              Link invalid. Asigură-te că folosești link-ul complet generat de business.
            </p>
          )}

          {bizId && (
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={handleOpenApp}
                className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
              >
                Deschide aplicația
              </button>

              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  📱 Instalează pentru iOS
                </Link>
                <Link
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  🤖 Instalează pentru Android
                </Link>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href={loginUrl}
                  className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Autentifică-te
                </Link>
                <Link
                  href={registerUrl}
                  className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Creează cont
                </Link>
              </div>

              <p className="mt-4 text-xs text-white/50">
                După autentificare sau instalarea aplicației, business-ul va fi conectat automat la contul tău.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show processing/status for authenticated users
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-4 py-16 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-2xl shadow-black/30">
        <h1 className="text-3xl font-semibold">Conectare la business</h1>
        <p className="mt-3 text-sm text-white/60">
          {processing ? "Se procesează..." : "Procesul durează doar câteva secunde."}
        </p>

        {status && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
              status.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : status.type === "error"
                  ? "border-red-500/40 bg-red-500/10 text-red-200"
                  : "border-[#6366F1]/40 bg-[#6366F1]/10 text-white"
            }`}
          >
            {status.message}
          </div>
        )}

        {!bizId && (
          <p className="mt-6 text-sm text-white/60">
            Link invalid. Asigură-te că folosești link-ul complet generat de business.
          </p>
        )}
      </div>
    </div>
  );
}

