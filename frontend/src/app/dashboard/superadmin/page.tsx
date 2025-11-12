"use client";

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";
import useBookings from "../../../hooks/useBookings";

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { businesses, fetchBusinesses, loading: businessLoading } = useBusiness();
  const { bookings, fetchBookings, loading: bookingsLoading } = useBookings();
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user && user.role !== "SUPERADMIN") {
      // Redirect to appropriate dashboard based on role
      switch (user.role) {
        case "CLIENT":
          router.replace("/client/dashboard");
          break;
        case "BUSINESS":
          router.replace("/business/dashboard");
          break;
        case "EMPLOYEE":
          router.replace("/employee/dashboard");
          break;
        default:
          router.replace("/client/dashboard");
      }
      return;
    }
    if (user.role === "SUPERADMIN") {
      void Promise.all([fetchBusinesses(), fetchBookings()]);
    }
  }, [hydrated, user, router, fetchBusinesses, fetchBookings]);

  const totalRevenue = useMemo(
    () =>
      bookings
        .filter((booking) => booking.paid)
        .reduce((acc, booking) => acc + booking.service.price, 0),
    [bookings]
  );

  const activeBusinesses = useMemo(
    () => businesses.filter((business) => business.services.length > 0).length,
    [businesses]
  );

  const upcomingBookings = useMemo(
    () => bookings.filter((booking) => new Date(booking.date).getTime() > now).slice(0, 5),
    [bookings, now]
  );

  if (!hydrated) {
    return null;
  }
  if (!user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Super Admin - LARSTEF</title>
      </Head>
      <div className="space-y-10">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-[#6366F1]">Super Admin</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">Control Center</h1>
              <p className="text-sm text-white/60">
                Monitorizează business-urile, rezervările și activitatea generală LARSTEF.
              </p>
            </div>
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Business-uri totale</p>
              <p className="mt-3 text-2xl font-semibold">
                {businessLoading ? "…" : businesses.length}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {activeBusinesses} active cu servicii configurate
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Rezervări totale</p>
              <p className="mt-3 text-2xl font-semibold">{bookingsLoading ? "…" : bookings.length}</p>
              <p className="mt-1 text-xs text-white/60">Din toate business-urile conectate</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Venit procesat</p>
              <p className="mt-3 text-2xl font-semibold text-[#6366F1]">
                {bookingsLoading
                  ? "…"
                  : totalRevenue.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
              </p>
              <p className="mt-1 text-xs text-white/60">Stripe + Klarna (rezervări marcate ca plătite)</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Business-uri recente</h2>
              <span className="text-xs text-white/60">{businesses.length} total</span>
            </div>
            <div className="mt-4 space-y-3 text-sm text-white/80">
              {businesses.slice(0, 6).map((business) => (
                <div
                  key={business.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-white">{business.name}</p>
                    <p className="text-xs text-white/50">
                      {business.domain} • {business.services.length} servicii
                    </p>
                  </div>
                  <span className="rounded-lg bg-[#6366F1]/20 px-3 py-1 text-xs text-[#6366F1]">
                    {business.employees.length} angajați
                  </span>
                </div>
              ))}
              {businesses.length === 0 && !businessLoading && (
                <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-white/60">
                  Încă nu există business-uri înregistrate.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Rezervări viitoare</h2>
            <div className="mt-4 space-y-3 text-sm text-white/80">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-white">{booking.business.name}</p>
                    <p className="text-xs text-white/60">
                      {booking.service.name} • {booking.client.name}
                    </p>
                  </div>
                  <span className="text-xs text-white/50">
                    {new Date(booking.date).toLocaleString("ro-RO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))}
              {upcomingBookings.length === 0 && !bookingsLoading && (
                <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-white/60">
                  Nu există rezervări viitoare programate.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Monitorizare rapidă</h2>
              <p className="text-sm text-white/60">
                Insight-uri cheie pentru sănătatea platformei (placeholder pentru integrare viitoare).
              </p>
            </div>
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Activare businessuri</p>
              <p className="mt-3 text-2xl font-semibold">
                {businesses.length === 0
                  ? "0%"
                  : Math.round((activeBusinesses / Math.max(businesses.length, 1)) * 100)}%
              </p>
              <p className="mt-1 text-xs text-white/60">Business-uri cu cel puțin 1 serviciu</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Rezervări cu plată</p>
              <p className="mt-3 text-2xl font-semibold">
                {bookings.length === 0
                  ? "0%"
                  : Math.round(
                      (bookings.filter((booking) => booking.paid).length /
                        Math.max(bookings.length, 1)) *
                        100
                    )}%
              </p>
              <p className="mt-1 text-xs text-white/60">Stripe & Klarna fully processed</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Business-uri fără servicii</p>
              <p className="mt-3 text-2xl font-semibold">
                {businessLoading ? "…" : businesses.length - activeBusinesses}
              </p>
              <p className="mt-1 text-xs text-white/60">Ținte bune pentru onboarding assist</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

