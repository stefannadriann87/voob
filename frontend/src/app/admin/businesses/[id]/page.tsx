"use client";

import Head from "next/head";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import useAuth from "../../../../hooks/useAuth";
import useApi from "../../../../hooks/useApi";

type BusinessDetail = {
  business: {
    id: string;
    name: string;
    domain: string;
    status: string;
    businessType: string;
    createdAt: string;
  };
  subscription?: {
    planName: string;
    status: string;
    amount: number;
    billingMethod: string;
    currentPeriodEnd: string;
  } | null;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    paymentMethod: string;
    issuedAt: string;
  }>;
  payments: {
    totalProcessed: number;
    applicationFee: number;
    methods: Record<string, number>;
  };
  bookings: {
    total: number;
    confirmed: number;
    cancelled: number;
    currentMonth: number;
  };
  usage: {
    smsTotal: number;
    smsMonth: number;
    aiTotal: number;
    aiMonth: number;
  };
  configuration: {
    workingHours: unknown;
    holidays: number;
  };
};

export default function AdminBusinessDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [data, setData] = useState<BusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

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
        const response = await api.get(`/admin/businesses/${params.id}`);
        setData(response.data);
      } catch (err: any) {
        setError(
          err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca detaliile business-ului."
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [hydrated, user, router, api, params.id]);

  const handleResetPassword = async () => {
    try {
      setResetting(true);
      setTemporaryPassword(null);
      const response = await api.post(`/admin/businesses/${params.id}/reset-owner-password`);
      setTemporaryPassword(response.data.temporaryPassword);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut reseta parola ownerului.");
    } finally {
      setResetting(false);
    }
  };

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Business details - Admin</title>
      </Head>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-white/60 transition hover:text-white"
        >
          ← Înapoi la listă
        </button>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
            Se încarcă detaliile…
          </div>
        )}

        {data && (
          <>
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">{data.business.businessType}</p>
                  <h1 className="text-3xl font-semibold text-white">{data.business.name}</h1>
                  <p className="text-sm text-white/60">Creat la {new Date(data.business.createdAt).toLocaleDateString("ro-RO")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      data.business.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-red-500/10 text-red-200"
                    }`}
                  >
                    {data.business.status === "ACTIVE" ? "Activ" : "Suspendat"}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetting}
                    className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resetting ? "Se resetează..." : "Resetare parolă owner"}
                  </button>
                </div>
              </div>
              {temporaryPassword && (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Parolă temporară: <span className="font-mono">{temporaryPassword}</span>
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoTile title="Rezervări totale" value={data.bookings.total} description={`Confirmate: ${data.bookings.confirmed}`} />
              <InfoTile title="Rezervări luna curentă" value={data.bookings.currentMonth} description={`Anulate: ${data.bookings.cancelled}`} />
              <InfoTile
                title="Consum SMS"
                value={`${data.usage.smsTotal} mesaje`}
                description={`${data.usage.smsMonth} luna aceasta`}
              />
              <InfoTile
                title="Consum AI"
                value={`${data.usage.aiTotal} solicitări`}
                description={`${data.usage.aiMonth} luna aceasta`}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 mt-6">
                <h2 className="text-lg font-semibold text-white">Abonament & Facturare</h2>
                {data.subscription ? (
                  <div className="mt-4 space-y-2 text-sm text-white/70">
                    <p>
                      Plan: <span className="text-white">{data.subscription.planName}</span>
                    </p>
                    <p>
                      Status: <span className="text-white">{data.subscription.status}</span>
                    </p>
                    <p>
                      Metodă plată: <span className="text-white">{data.subscription.billingMethod}</span>
                    </p>
                    <p>
                      Următoarea facturare:{" "}
                      <span className="text-white">
                        {new Date(data.subscription.currentPeriodEnd).toLocaleDateString("ro-RO")}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/60">Nu există abonament activ.</p>
                )}
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-wide text-white/50">Ultimele facturi</p>
                  <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                    {data.invoices.map((invoice) => (
                      <div key={invoice.id} className="rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-3 text-sm">
                        <p className="font-semibold text-white">
                          {invoice.amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                        </p>
                        <p className="text-xs text-white/60">
                          {invoice.paymentMethod} • {invoice.status} •{" "}
                          {new Date(invoice.issuedAt).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                    ))}
                    {data.invoices.length === 0 && (
                      <p className="text-sm text-white/60">Nu există facturi generare.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 mt-6">
                <h2 className="text-lg font-semibold text-white">Plăți procesate</h2>
                <div className="mt-4 space-y-2 text-sm text-white/70">
                  <p>
                    Total procesat:{" "}
                    <span className="text-white">
                      {data.payments.totalProcessed.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                    </span>
                  </p>
                  <p>
                    Taxă platformă:{" "}
                    <span className="text-white">
                      {data.payments.applicationFee.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                    </span>
                  </p>
                </div>
                <div className="mt-4 space-y-2 text-sm text-white/70">
                  {Object.entries(data.payments.methods).map(([method, amount]) => (
                    <div key={method} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2">
                      <span>{method}</span>
                      <span className="text-white/80">
                        {amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 mt-6">
              <h2 className="text-lg font-semibold text-white">Configurări business</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-[#0F172A]/70 p-4 text-sm text-white/70">
                  <p className="text-xs uppercase tracking-wide text-white/50">Working hours</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-white/60">
                    {JSON.stringify(data.configuration.workingHours ?? {}, null, 2)}
                  </pre>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0F172A]/70 p-4 text-sm text-white/70">
                  <p className="text-xs uppercase tracking-wide text-white/50">Holidays înregistrate</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{data.configuration.holidays}</p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function InfoTile({
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

