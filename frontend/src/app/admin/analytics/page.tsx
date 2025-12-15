"use client";

import Head from "next/head";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type AnalyticsOverview = {
  bookingsDaily: Array<{ date: string; count: number }>;
  serviceMix: Array<{ serviceName: string; count: number }>;
  paymentSplit: Array<{ method: string | null; amount: number }>;
  cancellationRate: number;
};

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
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
        const response = await api.get("/admin/dashboard/analytics");
        setAnalytics(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca analytics.");
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
        <title>Raportare & Analytics - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Analytics</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Raportare anonimă</h1>
          <p className="text-sm text-white/60">
            Trenduri de utilizare bazate pe date agregate. Fără identitate clienti sau servicii sensibile.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Rezervări zilnice (ultimele 30 de zile)</h2>
            <span className="text-xs text-white/60">
              Rată anulări: {analytics ? `${analytics.cancellationRate}%` : "…"}
            </span>
          </div>
          <div className="mt-4 max-h-72 overflow-y-auto">
            {analytics?.bookingsDaily.map((entry, index) => (
              <div
                key={`${entry.date}-${index}`}
                className="flex items-center justify-between border-b border-white/5 py-2 text-sm text-white/70"
              >
                <span>{entry.date}</span>
                <span className="font-semibold text-white">{entry.count}</span>
              </div>
            ))}
            {!analytics && <p className="text-sm text-white/60">Se încarcă datele…</p>}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Tipuri servicii</h2>
            <div className="mt-4 space-y-2">
              {analytics?.serviceMix.map((service) => (
                <div
                  key={service.serviceName}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2 text-sm text-white/80"
                >
                  <span>{service.serviceName}</span>
                  <span className="font-semibold text-white">{service.count}</span>
                </div>
              ))}
              {analytics && analytics.serviceMix.length === 0 && (
                <p className="text-sm text-white/60">Nu există servicii suficient de populare.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Plăți online vs cash</h2>
            <div className="mt-4 space-y-2">
              {analytics?.paymentSplit.map((payment) => (
                <div
                  key={payment.method ?? "n/a"}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2 text-sm text-white/80"
                >
                  <span>{payment.method ?? "N/A"}</span>
                  <span className="font-semibold text-white">
                    {payment.amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                  </span>
                </div>
              ))}
              {analytics && analytics.paymentSplit.length === 0 && (
                <p className="text-sm text-white/60">Nu există încă plăți procesate.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
