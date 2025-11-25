"use client";

import Head from "next/head";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type AiOverview = {
  totalRequests: number;
  estimatedCost: number;
  tokensUsed: number;
  topBusinesses: Array<{
    businessId: string | null;
    businessName: string;
    requests: number;
    tokens: number;
  }>;
  errors: Array<{ statusCode: number | null; count: number }>;
};

export default function AdminAiPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [overview, setOverview] = useState<AiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "SUPERADMIN") {
      router.replace("/dashboard");
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get("/admin/dashboard/ai");
        setOverview(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca consumul AI.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [hydrated, user, router, api]);

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>AI & Consum resurse - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">AI & LLM</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Consum agregat OpenAI</h1>
          <p className="text-sm text-white/60">
            Monitorizează costurile și erorile AI fără a expune conversații sau utilizatori finali.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Solicitări totale"
            value={loading || !overview ? "…" : overview.totalRequests}
            subtitle="Function calling + răspuns LLM"
          />
          <InfoCard
            title="Cost estimat"
            value={
              loading || !overview
                ? "…"
                : overview.estimatedCost.toLocaleString("ro-RO", { style: "currency", currency: "RON" })
            }
            subtitle="Bazat pe cost per 1K tokens"
          />
          <InfoCard
            title="Tokens procesați"
            value={loading || !overview ? "…" : overview.tokensUsed}
            subtitle="Agregat pentru luna curentă"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2 py-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Top consumatori</h2>
            <div className="mt-4 space-y-3">
              {overview?.topBusinesses.map((business) => (
                <div
                  key={`${business.businessId}-${business.businessName}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-3 text-sm text-white/80"
                >
                  <div>
                    <p className="font-semibold text-white">{business.businessName}</p>
                    <p className="text-xs text-white/50">{business.requests} requests</p>
                  </div>
                  <span className="text-xs text-white/60">{business.tokens} tokens</span>
                </div>
              ))}
              {overview && overview.topBusinesses.length === 0 && (
                <p className="text-sm text-white/60">Nu există încă trafic AI înregistrat.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Erori AI</h2>
            <div className="mt-4 space-y-2">
              {overview?.errors.map((errorEntry) => (
                <div
                  key={errorEntry.statusCode ?? "unknown"}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2 text-sm text-white/80"
                >
                  <span>Status {errorEntry.statusCode ?? "N/A"}</span>
                  <span className="font-semibold text-white">{errorEntry.count}</span>
                </div>
              ))}
              {overview && overview.errors.length === 0 && (
                <p className="text-sm text-white/60">Nu au fost raportate erori.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function InfoCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-wide text-white/60">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-white/60">{subtitle}</p>}
    </div>
  );
}

