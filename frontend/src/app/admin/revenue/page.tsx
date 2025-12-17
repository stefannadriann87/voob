"use client";

import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type PaymentStats = {
  businessId: string;
  businessName: string;
  totalProcessed: number;
  applicationFee: number;
  methods: {
    CARD?: number;
    CASH?: number;
    OFFLINE?: number;
  };
};

type DashboardSummary = {
  totalRevenue: number;
  platformRevenue: number;
  paymentDistribution: Record<string, number>;
};

const currencyFormatter = (value: number) =>
  value.toLocaleString("ro-RO", { style: "currency", currency: "RON" });

export default function AdminRevenuePage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [payments, setPayments] = useState<PaymentStats[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [paymentsResponse, summaryResponse] = await Promise.all([
        api.get("/admin/payments"),
        api.get("/admin/dashboard/summary"),
      ]);
      setPayments(paymentsResponse.data);
      setSummary({
        totalRevenue: summaryResponse.data.totalRevenue,
        platformRevenue: summaryResponse.data.platformRevenue,
        paymentDistribution: summaryResponse.data.paymentDistribution,
      });
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

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  const totalProcessed = payments.reduce((sum, p) => sum + p.totalProcessed, 0);
  const totalPlatformFee = payments.reduce((sum, p) => sum + p.applicationFee, 0);

  return (
    <>
      <Head>
        <title>Încasări - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Încasări</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Gestionare încasări platformă</h1>
          <p className="text-sm text-white/60">
            Vizualizează și gestionează încasările platformei și comisioanele aferente.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
            Se încarcă datele...
          </div>
        ) : (
          <>
            {/* Statistici generale */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-wide text-white/50">Total procesat</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {currencyFormatter(summary?.totalRevenue ?? totalProcessed)}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Suma totală procesată prin platformă
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-wide text-white/50">Comision platformă</p>
                <p className="mt-2 text-2xl font-semibold text-[#818CF8]">
                  {currencyFormatter(summary?.platformRevenue ?? totalPlatformFee)}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Total comisioane încasate
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-xs uppercase tracking-wide text-white/50">Business-uri active</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {payments.length}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Business-uri cu plăți procesate
                </p>
              </div>
            </div>

            {/* Distribuție metode de plată */}
            {summary?.paymentDistribution && Object.keys(summary.paymentDistribution).length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">Distribuție metode de plată</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  {Object.entries(summary.paymentDistribution)
                    .filter(([, amount]) => amount > 0)
                    .map(([method, amount]) => (
                      <div
                        key={method}
                        className="rounded-2xl border border-white/10 bg-[#0F172A]/70 p-4"
                      >
                        <p className="text-xs uppercase tracking-wide text-white/50">
                          {method === "CARD" ? "Card" : method === "CASH" ? "Numerar" : method === "OFFLINE" ? "Offline" : method}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-white">
                          {currencyFormatter(amount)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Lista plăți pe business */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Plăți pe business</h2>
              {payments.length === 0 ? (
                <p className="text-center text-white/60">Nu există plăți procesate.</p>
              ) : (
                <div className="space-y-3">
                  {payments
                    .sort((a, b) => b.totalProcessed - a.totalProcessed)
                    .map((payment) => (
                      <div
                        key={payment.businessId}
                        className="rounded-2xl border border-white/10 bg-[#0F172A]/70 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-white">{payment.businessName}</p>
                            <p className="text-xs text-white/50">ID: {payment.businessId}</p>
                          </div>
                          <div className="flex flex-col gap-2 text-right md:flex-row md:gap-6">
                            <div>
                              <p className="text-xs text-white/50">Total procesat</p>
                              <p className="text-lg font-semibold text-white">
                                {currencyFormatter(payment.totalProcessed)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/50">Comision</p>
                              <p className="text-lg font-semibold text-[#818CF8]">
                                {currencyFormatter(payment.applicationFee)}
                              </p>
                            </div>
                          </div>
                        </div>
                        {Object.entries(payment.methods).some(([, amount]) => amount && amount > 0) && (
                          <div className="mt-3 border-t border-white/10 pt-3">
                            <p className="mb-2 text-xs text-white/50">Distribuție metode:</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(payment.methods)
                                .filter(([, amount]) => amount && amount > 0)
                                .map(([method, amount]) => (
                                  <span
                                    key={method}
                                    className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/70"
                                  >
                                    {method === "CARD" ? "Card" : method === "CASH" ? "Numerar" : "Offline"}: {currencyFormatter(amount ?? 0)}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
