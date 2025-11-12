"use client";

import { useEffect, useState } from "react";
import Head from "next/head";
import { useParams, useRouter } from "next/navigation";
import BookingCard from "../../../components/BookingCard";
import Navbar from "../../../components/Navbar";
import useAuth from "../../../hooks/useAuth";
import useBookings, { Booking } from "../../../hooks/useBookings";

export default function BookingDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, hydrated } = useAuth();
  const { getBooking } = useBookings();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!params?.id) return;

    const fetch = async () => {
      try {
        const result = await getBooking(params.id);
        setBooking(result);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Rezervarea nu a fost găsită.");
      } finally {
        setLoading(false);
      }
    };

    void fetch();
  }, [hydrated, user, router, params, getBooking]);

  if (!hydrated) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Detalii rezervare - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <Navbar />

        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
          {loading && <p className="text-sm text-white/60">Se încarcă rezervarea...</p>}
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          {booking && (
            <>
              <BookingCard
                id={booking.id}
                serviceName={booking.service.name}
                businessName={booking.business.name}
                date={booking.date}
                paid={booking.paid}
                status={new Date(booking.date).getTime() > now ? "upcoming" : "completed"}
                showActions={false}
              />

              <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">Informatii rezervare</h2>
                <div className="mt-4 grid gap-4 text-sm text-white/70 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                    <p className="text-xs uppercase tracking-wide text-white/50">Client</p>
                    <p className="mt-1 text-white">{booking.client.name}</p>
                    <p className="text-white/60">{booking.client.email}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                    <p className="text-xs uppercase tracking-wide text-white/50">Business</p>
                    <p className="mt-1 text-white">{booking.business.name}</p>
                    <p className="text-white/60">{booking.service.name}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                    <p className="text-xs uppercase tracking-wide text-white/50">Plată</p>
                    <p className="mt-1 text-white">{booking.paid ? "Online" : "La locație"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                    <p className="text-xs uppercase tracking-wide text-white/50">Consent</p>
                    <p className="mt-1 text-white">
                      {booking.consent ? "Semnat" : "Nu există consimțământ"}
                    </p>
                    {booking.consent && (
                      <button
                        type="button"
                        onClick={() => router.push(`/consent/${booking.id}`)}
                        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#6366F1] hover:text-[#7C3AED]"
                      >
                        Vezi consimțământ
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    Reprogramează
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
                  >
                    Anulează rezervarea
                  </button>
                  {!booking.consent && (
                    <button
                      type="button"
                      onClick={() => router.push(`/consent/${booking.id}`)}
                      className="rounded-2xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                    >
                      Completează consimțământ
                    </button>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

