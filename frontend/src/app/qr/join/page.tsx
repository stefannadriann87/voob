"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";

type StatusState = { type: "success" | "error" | "info"; message: string } | null;

export default function QrJoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessId = searchParams.get("businessId");
  const { user, hydrated } = useAuth();
  const { linkClientToBusiness, fetchBusinesses } = useBusiness();
  const [status, setStatus] = useState<StatusState>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!businessId) {
      setStatus({ type: "error", message: "Codul QR nu este valid. Lipsește identificatorul business-ului." });
      return;
    }
    if (!user) {
      setStatus({ type: "info", message: "Autentifică-te pentru a finaliza conectarea la business." });
      return;
    }
    if (user.role !== "CLIENT") {
      setStatus({ type: "error", message: "Doar conturile de client pot folosi aceste QR coduri." });
      return;
    }

    const connect = async () => {
      setProcessing(true);
      setStatus({ type: "info", message: "Se verifică business-ul..." });
      try {
        const business = await linkClientToBusiness(businessId);
        await fetchBusinesses({ scope: "linked" });
        setStatus({
          type: "success",
          message: `Ești conectat la ${business.name}. Redirecționăm către dashboard...`,
        });
        setTimeout(() => router.push("/client/dashboard"), 1500);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Nu am putut conecta acest cod QR. Încearcă din aplicație.";
        setStatus({ type: "error", message });
      } finally {
        setProcessing(false);
      }
    };

    void connect();
  }, [hydrated, user, businessId, linkClientToBusiness, fetchBusinesses, router]);

  const loginUrl = useMemo(() => {
    const redirect = "/qr/join" + (businessId ? `?businessId=${businessId}` : "");
    return `/auth/login?redirect=${encodeURIComponent(redirect)}`;
  }, [businessId]);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-4 py-16 text-white">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center shadow-2xl shadow-black/30">
        <h1 className="text-3xl font-semibold">Conectare la business</h1>
        <p className="mt-3 text-sm text-white/60">
          Scanarea codului QR asociază contul tău de client cu business-ul partener pentru a putea vizualiza și
          rezerva servicii.
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

        {!businessId && (
          <p className="mt-6 text-sm text-white/60">
            Asigură-te că folosești link-ul complet generat de business-ul tău. Codul ar trebui să conțină parametrul{" "}
            <code className="rounded bg-black/40 px-2 py-1 text-xs text-white/80">businessId</code>.
          </p>
        )}

        {!user && businessId && (
          <div className="mt-8 flex flex-col gap-3">
            <Link
              href={loginUrl}
              className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
            >
              Autentifică-te pentru a continua
            </Link>
            <p className="text-xs text-white/50">
              După autentificare vei fi redirecționat automat pentru a finaliza conectarea.
            </p>
          </div>
        )}

        {user && user.role !== "CLIENT" && (
          <div className="mt-8 text-sm text-white/60">
            Acest cod este destinat clienților. Intră în{" "}
            <Link href="/dashboard" className="text-[#6366F1] hover:text-[#7C3AED]">
              dashboard-ul tău
            </Link>{" "}
            pentru a gestiona business-ul.
          </div>
        )}

        <div className="mt-10 text-xs text-white/40">
          {processing ? "Se procesează..." : "Procesul durează doar câteva secunde."}
        </div>
      </div>
    </div>
  );
}


