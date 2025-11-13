"use client";

import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import BusinessCard from "../../../components/BusinessCard";
import ServiceCard from "../../../components/ServiceCard";
import DatePicker from "../../../components/DatePicker";
import useAuth from "../../../hooks/useAuth";
import useBookings from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";

type PaymentMethod = "stripe" | "klarna" | "offline";

const HOURS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];

const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("ro-RO", { weekday: "short", day: "numeric" });

export default function NewBookingPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { businesses, fetchBusinesses } = useBusiness();
  const { bookings, fetchBookings, createBooking, loading, error } = useBookings();

  const [businessIdOverride, setBusinessIdOverride] = useState<string | null>(null);
  const [serviceSelections, setServiceSelections] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("stripe");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    void fetchBusinesses();
    void fetchBookings();
  }, [hydrated, user, fetchBusinesses, fetchBookings, router]);

  const selectedBusinessId = businessIdOverride ?? businesses[0]?.id ?? null;
  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );
  const selectedServiceId =
    selectedBusinessId != null ? serviceSelections[selectedBusinessId] ?? null : null;

  const selectedService = useMemo(
    () => selectedBusiness?.services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedBusiness, selectedServiceId]
  );

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  const relevantBookings = useMemo(() => {
    if (!selectedBusinessId) return [];
    return bookings.filter((booking) => booking.businessId === selectedBusinessId);
  }, [bookings, selectedBusinessId]);

  const serviceDurationMinutes = selectedService?.duration ?? 60;
  const slotDurationMinutes = 60;
  const serviceDurationMs = serviceDurationMinutes * 60 * 1000;

  const slotsMatrix = useMemo(() => {
    if (!selectedServiceId) return null;

    const selectedStart = selectedDate ? new Date(selectedDate).getTime() : null;
    const selectedEnd = selectedStart !== null ? selectedStart + serviceDurationMs : null;

    return weekDays.map((day) => {
      return HOURS.map((hour) => {
        const [h, m] = hour.split(":").map(Number);
        const slotDate = new Date(day);
        slotDate.setHours(h, m, 0, 0);
        const slotStartMs = slotDate.getTime();
        const slotEndMs = slotStartMs + serviceDurationMs;
        const iso = slotDate.toISOString();
        const isPast = slotStartMs < Date.now();

        const isBooked = relevantBookings.some((booking) => {
          const bookingStart = new Date(booking.date);
          const bookingStartMs = bookingStart.getTime();
          const bookingDurationMs = (booking.service?.duration ?? slotDurationMinutes) * 60 * 1000;
          const bookingEndMs = bookingStartMs + bookingDurationMs;
          const sameDay = bookingStart.toDateString() === slotDate.toDateString();
          return sameDay && bookingStartMs < slotEndMs && bookingEndMs > slotStartMs;
        });

        let status: "available" | "booked" | "past" | "selected" = "available";
        if (isPast) status = "past";
        if (isBooked) status = "booked";
        if (
          selectedStart !== null &&
          selectedEnd !== null &&
          slotStartMs >= selectedStart &&
          slotStartMs < selectedEnd
        ) {
          status = "selected";
        }

        return {
          iso,
          label: slotDate.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
          status,
        };
      });
    });
  }, [
    weekDays,
    selectedServiceId,
    relevantBookings,
    selectedDate,
    serviceDurationMs,
    slotDurationMinutes,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedBusinessId || !selectedServiceId || !selectedDate) return;

    const slotDate = new Date(selectedDate);
    const isoDate = slotDate.toISOString();
    const conflict = slotsMatrix?.some((daySlots) =>
      daySlots.some((slot) => {
        if (slot.status === "booked") {
          const slotTime = new Date(slot.iso).getTime();
          const startTime = slotDate.getTime();
          const endTime = startTime + serviceDurationMs;
          return slotTime >= startTime && slotTime < endTime;
        }
        return false;
      })
    );

    if (conflict) {
      return;
    }

    try {
      await createBooking({
        clientId: user.id,
        businessId: selectedBusinessId,
        serviceId: selectedServiceId,
        date: isoDate,
        paid: selectedPayment !== "offline",
      });
      setSuccessMessage("Rezervare creată cu succes! Vei primi confirmarea pe email.");
      setTimeout(() => {
        // Redirect based on user role
        switch (user.role) {
          case "BUSINESS":
            router.push("/business/dashboard");
            break;
          case "EMPLOYEE":
            router.push("/employee/dashboard");
            break;
          case "SUPERADMIN":
            router.push("/admin/dashboard");
            break;
          case "CLIENT":
          default:
            router.push("/client/dashboard");
        }
      }, 1500);
    } catch {
      // error handled in hook
    }
  };

  if (!hydrated) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Rezervare nouă - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-3 desktop:p-8">
            <h1 className="text-3xl font-semibold">Creează o rezervare</h1>
            <p className="mt-2 text-sm text-white/60">
              Alege businessul, serviciul și ora potrivită. Plata se poate face online sau la fața locului.
            </p>
          </section>

          <form onSubmit={handleSubmit} className="flex flex-col gap-10">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <h2 className="text-xl font-semibold">1. Alege businessul</h2>
                  <button
                    type="button"
                    className="rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/10"
                  >
                    Vezi businessurile mele
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {businesses.map((business) => (
                    <BusinessCard
                      key={business.id}
                      id={business.id}
                      name={business.name}
                      domain={business.domain}
                      services={business.services.length}
                      selected={business.id === selectedBusinessId}
                      onSelect={(id) => {
                        setBusinessIdOverride(id);
                      }}
                    />
                  ))}
                  {businesses.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                      Nu există businessuri disponibile momentan.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold">2. Alege serviciul</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selectedBusiness?.services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      id={service.id}
                      name={service.name}
                      duration={service.duration}
                      price={service.price}
                      selected={service.id === selectedServiceId}
                      onSelect={(serviceId) => {
                        if (selectedBusinessId != null) {
                          setServiceSelections((prev) => ({
                            ...prev,
                            [selectedBusinessId]: serviceId,
                          }));
                        }
                      }}
                    />
                  ))}
                  {selectedBusiness && selectedBusiness.services.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                      Businessul selectat nu are servicii configurate încă.
                    </div>
                  )}
                </div>
              </div>

              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">3. Alege data și ora</h2>
                    <p className="text-xs text-white/50">
                      Zilele sunt pe coloane, orele pe rânduri. Alege un interval disponibil din această săptămână.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                    
                    {/* Calendar picker */}
                    <div className="hidden sm:block">
                      <DatePicker
                        value={calendarDate}
                        onChange={(date) => {
                          setCalendarDate(date);
                          const selectedDateObj = new Date(date);
                          setWeekStart(getWeekStart(selectedDateObj));
                        }}
                        placeholder="Selectează data"
                      />
                    </div>
                  </div>
                </div>

                {!selectedServiceId ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                    Selectează mai întâi un serviciu pentru a vedea intervalele disponibile.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="w-full rounded-3xl border border-white/10 bg-[#0B0E17]/40 p-4">
                      <div
                        className="grid gap-1.5"
                        style={{
                          gridTemplateColumns: `repeat(${weekDays.length}, minmax(100px, 1fr))`,
                        }}
                      >
                        {weekDays.map((day, index) => (
                          <div key={`head-${index}`} className="text-center text-sm font-semibold text-white/70">
                            <div>{formatDayLabel(day)}</div>
                            <div className="mt-1 text-xs text-white/40">
                              {day.toLocaleDateString("ro-RO", { month: "short" })}
                            </div>
                          </div>
                        ))}

                        {HOURS.map((hour, hourIndex) => (
                          <Fragment key={`row-${hour}`}>
                            {weekDays.map((_, dayIndex) => {
                              const slot = slotsMatrix?.[dayIndex]?.[hourIndex];
                              if (!slot) {
                                return <div key={`empty-${dayIndex}-${hour}`} className="rounded-2xl bg-[#0B0E17]/30" />;
                              }

                              const slotDate = new Date(slot.iso);
                              const slotStartMs = slotDate.getTime();
                              const hoveredStartMs = hoveredSlot ? new Date(hoveredSlot).getTime() : null;
                              const hoveredDayString = hoveredSlot ? new Date(hoveredSlot).toDateString() : null;
                              const hoveredEndMs =
                                hoveredStartMs !== null ? hoveredStartMs + serviceDurationMs : null;

                              let stateClasses =
                                "bg-[#0B0E17]/60 text-white/70 hover:bg-white/10 border border-white/10";
                              if (slot.status === "booked") {
                                stateClasses =
                                  "bg-red-500/20 text-red-300 border border-red-400/40 cursor-not-allowed";
                              } else if (slot.status === "past") {
                                stateClasses =
                                  "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed";
                              } else if (slot.status === "selected") {
                                stateClasses =
                                  "bg-[#6366F1]/50 text-white border border-[#6366F1]/70 shadow-lg shadow-[#6366F1]/40";
                              }

                              const isHoverHighlight =
                                hoveredStartMs !== null &&
                                hoveredEndMs !== null &&
                                hoveredDayString === slotDate.toDateString() &&
                                slot.status === "available" &&
                                slotStartMs >= hoveredStartMs &&
                                slotStartMs < hoveredEndMs;

                              if (isHoverHighlight) {
                                if (slotStartMs === hoveredStartMs) {
                                  stateClasses =
                                    "bg-[#6366F1]/45 text-white border border-[#6366F1]/70 shadow-lg shadow-[#6366F1]/20";
                                } else {
                                  stateClasses =
                                    "bg-[#6366F1]/25 text-white border border-[#6366F1]/40 shadow shadow-[#6366F1]/10";
                                }
                              }

                              return (
                                <button
                                  key={slot.iso}
                                  type="button"
                                  disabled={slot.status === "booked" || slot.status === "past"}
                                  onClick={() => {
                                    const slotDate = new Date(slot.iso);
                                    setSelectedDate(slot.iso);
                                    if (serviceDurationMinutes > slotDurationMinutes) {
                                      const endMs = slotDate.getTime() + serviceDurationMs;
                                      setHoveredSlot(new Date(endMs).toISOString());
                                    } else {
                                      setHoveredSlot(null);
                                    }
                                  }}
                                  onMouseEnter={() => {
                                    if (slot.status === "available") {
                                      setHoveredSlot(slot.iso);
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredSlot((prev) => (prev === slot.iso ? null : prev));
                                  }}
                                  className={`flex h-[52px] w-full items-center justify-center rounded-2xl px-3 text-xs font-semibold transition ${stateClasses}`}
                                  style={{
                                    cursor:
                                      slot.status === "booked" || slot.status === "past" ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {slot.status === "booked" ? "Ocupat" : slot.label}
                                </button>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm">
                  <span className="font-semibold text-white">4. Metoda de plată</span>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/50 px-4 py-3">
                      <input
                        type="radio"
                        name="payment"
                        value="stripe"
                        checked={selectedPayment === "stripe"}
                        onChange={() => setSelectedPayment("stripe")}
                      />
                      <span>Stripe - card bancar (recomandat)</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/50 px-4 py-3">
                      <input
                        type="radio"
                        name="payment"
                        value="klarna"
                        checked={selectedPayment === "klarna"}
                        onChange={() => setSelectedPayment("klarna")}
                      />
                      <span>Klarna - 4 rate fără dobândă</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/50 px-4 py-3">
                      <input
                        type="radio"
                        name="payment"
                        value="offline"
                        checked={selectedPayment === "offline"}
                        onChange={() => setSelectedPayment("offline")}
                      />
                      <span>Plată la locație</span>
                    </label>
                  </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold">Rezumat rezervare</h2>
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4 text-sm text-white/70">
                <div className="flex items-center justify-between">
                  <span>Business</span>
                  <span className="font-semibold text-white">
                    {selectedBusiness ? selectedBusiness.name : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Serviciu</span>
                  <span className="font-semibold text-white">{selectedService?.name ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Data</span>
                  <span className="font-semibold text-white">
                    {selectedDate
                      ? new Date(selectedDate).toLocaleString("ro-RO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Plată</span>
                  <span className="font-semibold text-white capitalize">
                    {selectedPayment === "stripe"
                      ? "Stripe"
                      : selectedPayment === "klarna"
                        ? "Klarna"
                        : "La locație"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-white/10 pt-3">
                  <span>Total estimat</span>
                  <span className="text-lg font-semibold text-[#6366F1]">
                    {selectedService?.price?.toLocaleString("ro-RO", {
                      style: "currency",
                      currency: "RON",
                    }) ?? "—"}
                  </span>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              {successMessage && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  {successMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !selectedBusinessId || !selectedServiceId || !selectedDate}
                className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Se procesează..." : "Confirmă rezervarea"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </>
  );
}

