"use client";

import Head from "next/head";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type PaymentOverview = {
  businessId: string;
  businessName: string;
  totalProcessed: number;
  applicationFee: number;
  methods: Record<string, number>;
};

export default function AdminPaymentsPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [payments, setPayments] = useState<PaymentOverview[]>([]);
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
        const response = await api.get("/admin/payments");
        setPayments(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca plățile.");
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
        <title>Plăți platformă - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Plăți</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Procesare agregată</h1>
          <p className="text-sm text-white/60">
            Vizualizează sumele procesate per business și metode folosite. Fără detalii card / PII.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {payments.map((payment) => (
            <div
              key={payment.businessId}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/50">Business</p>
                  <p className="text-lg font-semibold text-white">{payment.businessName}</p>
                </div>
                <span className="text-xs text-white/50">#{payment.businessId.slice(0, 6)}</span>
              </div>
              <div className="mt-4 space-y-1">
                <p>
                  Total procesat:{" "}
                  <span className="text-white">
                    {payment.totalProcessed.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                  </span>
                </p>
                <p>
                  Taxă platformă:{" "}
                  <span className="text-white">
                    {payment.applicationFee.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                  </span>
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(payment.methods).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2">
                    <span>{method}</span>
                    <span className="font-semibold text-white">
                      {amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                      {method === "OFFLINE" && " • SELF_REPORTED"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!loading && payments.length === 0 && (
            <p className="rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60 md:col-span-2">
              Nu există plăți raportate încă.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

