"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import BookingCard from "../../../components/BookingCard";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import { logger } from "../../../lib/logger";

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { bookings, fetchBookings, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses } = useBusiness();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const business = useMemo(() => {
    if (businesses.length === 0) {
      return null;
    }

    if (user?.id) {
      const employeeBusiness = businesses.find((item) =>
        item.employees.some((employee) => employee.id === user.id)
      );
      if (employeeBusiness) {
        return employeeBusiness;
      }
    }

    return businesses[0] ?? null;
  }, [businesses, user]);

  // Filter bookings for this business and only today's bookings, and only for this employee
  const businessBookings = useMemo(() => {
    if (!business?.id || !user?.id) return [];
    return bookings.filter((booking) => 
      booking.businessId === business.id && booking.employeeId === user.id
    );
  }, [bookings, business?.id, user?.id]);

  type DayBooking = Booking & { isPastToday: boolean };

  const todaysBookings = useMemo<DayBooking[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return businessBookings
      .filter((booking) => {
        const bookingDate = new Date(booking.date);
        return bookingDate >= today && bookingDate < tomorrow;
      })
      .map(
        (booking) =>
          ({
            ...booking,
            isPastToday: new Date(booking.date).getTime() < currentTime,
          }) as DayBooking
      )
      .sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [businessBookings, currentTime]);

  const handleRescheduleBooking = useCallback(
    (bookingId: string) => {
      router.push(`/employee/calendar?reschedule=${bookingId}`);
    },
    [router]
  );

  const handleCancelBooking = useCallback(
    async (bookingId: string) => {
      setCancellingBookingId(bookingId);
      try {
        await cancelBooking(bookingId);
        await fetchBookings();
      } catch (error) {
        logger.error("Cancel booking error:", error);
      } finally {
        setCancellingBookingId(null);
      }
    },
    [cancelBooking, fetchBookings]
  );

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "EMPLOYEE") {
      router.replace("/client/dashboard");
      return;
    }
    void Promise.all([fetchBookings(), fetchBusinesses()]);
  }, [hydrated, user, router, fetchBookings, fetchBusinesses]);

  if (!hydrated) {
    return null;
  }
  if (!user || user.role !== "EMPLOYEE") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Employee Dashboard - VOOB</title>
      </Head>
      <div className="flex flex-col gap-10 max-w-7xl">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold">
            Bun venit, {user.name}! {business ? `(${business.name})` : ""}
          </h1>
          <p className="mt-2 text-sm text-white/60 mb-2">
            Vizualizează calendarul și gestionează programările tale.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-3 desktop:p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Rezervări lună curentă</p>
              <p className="mt-3 text-2xl font-semibold">
                {businessBookings.filter((booking) => new Date(booking.date).getMonth() === new Date().getMonth()).length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Venit estimat</p>
              <p className="mt-3 text-2xl font-semibold">
                {businessBookings
                  .filter((booking) => booking.paid && booking.service)
                  .reduce((acc, booking) => acc + (booking.service?.price ?? 0), 0)
                  .toLocaleString("ro-RO", { style: "currency", currency: "RON" })}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-wide text-white/60">Clienți recurenți</p>
              <p className="mt-3 text-2xl font-semibold">
                {new Set(businessBookings.map((booking) => booking.client.email)).size}
              </p>
            </div>
          </div>
        </section>

        <section id="bookings" className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Rezervările de astăzi</h2>
              <p className="text-sm text-white/60 mb-2">O privire completă asupra programărilor din această zi.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/employee/calendar")}
              className="rounded-2xl bg-[#6366F1] px-4 py-2 text-sm font-semibold transition hover:bg-[#7C3AED]"
            >
              Adaugă rezervare
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {todaysBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60 md:col-span-2 xl:col-span-3">
                Nu ai programări pentru ziua de azi. Programările vor apărea aici când clienții vor face rezervări.
              </div>
            ) : (
              todaysBookings.map((booking) => {
                const isPast = booking.isPastToday;
                const clientName = booking.client?.name || booking.client?.email || `Client ID: ${booking.clientId}` || "Client necunoscut";
                const subtitleParts = [clientName];
                if (booking.client?.phone) {
                  subtitleParts.push(booking.client.phone);
                }

                return (
                  <BookingCard
                    key={booking.id}
                    id={booking.id}
                    serviceName={booking.service?.name ?? "Serviciu"}
                    businessName={subtitleParts.join(" • ")}
                    date={booking.date}
                    paid={booking.paid}
                    status={isPast ? "completed" : "upcoming"}
                    showActions={!isPast}
                    className={isPast ? "border-emerald-500/40 bg-emerald-500/10 opacity-90" : undefined}
                    onReschedule={handleRescheduleBooking}
                    onCancel={handleCancelBooking}
                    cancelling={cancellingBookingId === booking.id}
                    reminderSentAt={booking.reminderSentAt}
                    currentTime={currentTime}
                    ignoreCancellationLimits
                  />
                );
              })
            )}
          </div>
        </section>

        <section id="services" className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Servicii disponibile</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {business?.services.map((service) => (
              <div
                key={service.id}
                className="group relative rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-[#6366F1]/60 hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                    <p className="mt-2 text-sm text-white/60">
                      Durată: {service.duration} min
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#6366F1]">
                      {service.price.toLocaleString("ro-RO", {
                        style: "currency",
                        currency: "RON",
                      })}
                    </p>
                    {service.notes && (
                      <p className="mt-2 text-sm text-pink-400">{service.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!business || business.services.length === 0) && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                Nu există servicii disponibile momentan.
              </div>
            )}
          </div>
        </section>

        <section id="insights" className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold mb-2">AI Insights</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-5">
              <p className="text-sm font-semibold">Ore recomandate pentru promoții</p>
              <p className="mt-2 text-sm text-white/70">
                Joi și vineri între 17:00 - 19:00 ai zone cu disponibilitate ridicată. Trimite notificări automate pentru upgrade-uri.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">Clienți în risc de inactivitate</p>
              <p className="mt-2 text-sm text-white/70">
                5 clienți nu au mai rezervat în ultimele 3 luni. Trimite-le un voucher de revenire.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
