"use client";

import Head from "next/head";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type SubscriptionItem = {
  id: string;
  businessId: string;
  businessName: string;
  planName: string;
  amount: number;
  billingMethod: string;
  status: string;
  currentPeriodEnd: string;
};

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
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
        const response = await api.get("/admin/subscriptions");
        setSubscriptions(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca abonamentele.");
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
        <title>Abonamente & Facturare - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Abonamente</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Facturare agregată</h1>
          <p className="text-sm text-white/60">
            Vizualizează abonamentele active fără a expune informații card sau clienți finali.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5 text-sm text-white/70">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Metodă plată
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Următoarea facturare
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-white">{subscription.businessName}</p>
                      <p className="text-xs text-white/50">#{subscription.businessId.slice(0, 6)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">{subscription.planName}</p>
                      <p className="text-xs text-white/50">
                        {subscription.amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                      </p>
                    </td>
                    <td className="px-6 py-4">{subscription.billingMethod}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          subscription.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-yellow-500/10 text-yellow-200"
                        }`}
                      >
                        {subscription.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString("ro-RO")}
                    </td>
                  </tr>
                ))}
                {!loading && subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-white/60">
                      Nu există abonamente active.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

