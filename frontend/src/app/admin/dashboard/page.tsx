"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type DashboardSummary = {
  totalBusinesses: number;
  activeBusinesses: number;
  totalBookings: number;
  totalRevenue: number;
  platformRevenue: number;
  smsUsage: {
    totalMessages: number;
    estimatedCost: number;
  };
  aiUsage: {
    totalRequests: number;
    estimatedCost: number;
  };
  paymentDistribution: Record<string, number>;
  slaPercent: number;
  generatedAt: string;
};

type AnalyticsOverview = {
  bookingsDaily: Array<{ date: string; count: number }>;
  serviceMix: Array<{ serviceName: string; count: number }>;
  paymentSplit: Array<{ method: string | null; amount: number }>;
  cancellationRate: number;
};

const currencyFormatter = (value: number) =>
  value.toLocaleString("ro-RO", { style: "currency", currency: "RON" });

export default function AdminDashboardPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryResponse, analyticsResponse] = await Promise.all([
        api.get("/admin/dashboard/summary"),
        api.get("/admin/dashboard/analytics"),
      ]);
      setSummary(summaryResponse.data);
      setAnalytics(analyticsResponse.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca datele.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "SUPERADMIN") {
      router.replace("/dashboard");
      return;
    }
    void fetchData();
  }, [hydrated, user, router, fetchData]);

  const paymentEntries = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.paymentDistribution).filter(([, amount]) => amount > 0);
  }, [summary]);

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>SuperAdmin Dashboard - VOOB</title>
      </Head>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">SuperAdmin</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">Platform Control Center</h1>
            <p className="text-sm text-white/60">
              Monitorizează sănătatea platformei fără a accesa date personale ale clienților.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchData()}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Reîncarcă datele
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardCard
            title="Business-uri active"
            value={loading || !summary ? "…" : summary.activeBusinesses}
            description={`${summary?.totalBusinesses ?? 0} în total`}
          />
          <DashboardCard
            title="Rezervări în platformă"
            value={loading || !summary ? "…" : summary.totalBookings}
            description="Agregat, fără PII"
          />
          <DashboardCard
            title="Venit procesat"
            value={loading || !summary ? "…" : currencyFormatter(summary.totalRevenue)}
            description={`Platform fee: ${
              summary ? currencyFormatter(summary.platformRevenue) : "…"
            }`}
          />
          <DashboardCard
            title="SLA lunar"
            value={loading || !summary ? "…" : `${summary.slaPercent.toFixed(2)}%`}
            description="Disponibilitate raportată"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2 py-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">Costuri operaționale</p>
                <h2 className="text-lg font-semibold text-white">SMS & AI consum</h2>
              </div>
            </header>
            <div className="mt-6 space-y-4 text-sm text-white/80">
              <div className="rounded-2xl border border-white/10 bg-[#111827]/60 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Mesaje SMS</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {loading || !summary
                    ? "…"
                    : `${summary.smsUsage.totalMessages} mesaje`}
                </p>
                <p className="text-xs text-white/50">
                  Cost estimat: {summary ? currencyFormatter(summary.smsUsage.estimatedCost) : "…"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111827]/60 p-4">
                <p className="text-xs uppercase tracking-wide text-white/60">Consum AI</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {loading || !summary ? "…" : summary.aiUsage.totalRequests}
                </p>
                <p className="text-xs text-white/50">
                  Cost estimat: {summary ? currencyFormatter(summary.aiUsage.estimatedCost) : "…"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/60">Metode de plată</p>
                <h2 className="text-lg font-semibold text-white">Distribuție agregată</h2>
              </div>
            </header>
            <div className="mt-6 space-y-3 text-sm text-white/80">
              {paymentEntries.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-white/50">
                  Încă nu există plăți raportate.
                </p>
              )}
              {paymentEntries.map(([method, amount]) => (
                <div
                  key={method}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#111827]/60 px-4 py-3"
                >
                  <span className="text-white">{method}</span>
                  <span className="text-white/70">{currencyFormatter(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Trenduri anonime</p>
              <h2 className="text-lg font-semibold text-white">Activitate ultimile 30 zile</h2>
            </div>
            <p className="text-xs text-white/50">
              Rată anulări: {analytics ? `${analytics.cancellationRate}%` : "…"}
            </p>
          </header>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-wide text-white/50">Rezervări / zi</p>
              <div className="rounded-2xl border border-white/5 bg-[#0F172A]/60 p-4 max-h-64 overflow-y-auto">
                {analytics?.bookingsDaily.map((entry) => (
                  <div key={entry.date} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-white/60">{entry.date}</span>
                    <span className="font-semibold text-white">{entry.count}</span>
                  </div>
                ))}
                {!analytics && <p className="text-white/50">Se încarcă…</p>}
              </div>
            </div>
            <div className="space-y-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-wide text-white/50">Top servicii</p>
              <div className="rounded-2xl border border-white/5 bg-[#0F172A]/60 p-4 max-h-64 overflow-y-auto">
                {analytics?.serviceMix.map((service) => (
                  <div key={service.serviceName} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-white/70">{service.serviceName}</span>
                    <span className="font-semibold text-white">{service.count}</span>
                  </div>
                ))}
                {!analytics && <p className="text-white/50">Se încarcă…</p>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function DashboardCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-wide text-white/60">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      {description && <p className="mt-1 text-xs text-white/60">{description}</p>}
    </div>
  );
}
