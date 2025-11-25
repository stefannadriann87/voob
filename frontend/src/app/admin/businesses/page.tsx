"use client";

import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type BusinessItem = {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  plan?: {
    name: string;
    price: number;
  } | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  monthlyBookings: number;
  monthlySms: number;
  monthlyAi: number;
};

export default function AdminBusinessesPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const api = useApi();
  const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadBusinesses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/admin/businesses");
      setBusinesses(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca business-urile.");
    } finally {
      setLoading(false);
    }
  }, [api]);

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
    void loadBusinesses();
  }, [hydrated, user, router, loadBusinesses]);

  const handleStatusToggle = async (business: BusinessItem) => {
    try {
      setUpdatingId(business.id);
      await api.patch(`/admin/businesses/${business.id}/status`, {
        status: business.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
      });
      await loadBusinesses();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut actualiza statusul.");
    } finally {
      setUpdatingId(null);
    }
  };

  const activeCount = useMemo(
    () => businesses.filter((business) => business.status === "ACTIVE").length,
    [businesses]
  );

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Business-uri - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Business-uri</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Greutate pe platformă</h1>
          <p className="text-sm text-white/60">
            Listă agregată fără date personale. {activeCount} business-uri active.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <p className="text-sm text-white/70">
              {loading ? "Se încarcă…" : `${businesses.length} business-uri monitorizate`}
            </p>
            <button
              type="button"
              onClick={() => loadBusinesses()}
              className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              Reîncarcă
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5 text-sm text-white/80">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Luna curentă
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/60">
                    Acțiuni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {businesses.map((business) => (
                  <tr key={business.id}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-white">{business.name}</p>
                      <p className="text-xs text-white/50">
                        Creat la {new Date(business.createdAt).toLocaleDateString("ro-RO")}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">
                        {business.plan ? business.plan.name : "Nesetat"}
                      </p>
                      <p className="text-xs text-white/50">
                        {business.subscriptionStatus ?? "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">
                        {business.monthlyBookings} rezervări
                      </p>
                      <p className="text-xs text-white/50">
                        {business.monthlySms} SMS • {business.monthlyAi} AI calls
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          business.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-red-500/10 text-red-200"
                        }`}
                      >
                        {business.status === "ACTIVE" ? "Activ" : "Suspendat"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/businesses/${business.id}`}
                          className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                        >
                          Vezi detalii
                        </Link>
                        <button
                          type="button"
                          disabled={updatingId === business.id}
                          onClick={() => handleStatusToggle(business)}
                          className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {business.status === "ACTIVE" ? "Suspendă" : "Reactivează"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && businesses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-white/60">
                      Nu există business-uri înregistrate.
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
