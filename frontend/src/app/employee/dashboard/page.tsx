"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import BookingCard from "../../../components/BookingCard";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import useApi from "../../../hooks/useApi";
import { logger } from "../../../lib/logger";

type EmployeeService = {
  id: string;
  name: string;
  duration: number;
  price: number;
  notes?: string | null;
  isAssociated: boolean;
  hasOverrides?: boolean;
};

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { bookings, fetchBookings, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses } = useBusiness();
  const api = useApi();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [employeeServices, setEmployeeServices] = useState<EmployeeService[]>([]);
  const [canManageOwnServices, setCanManageOwnServices] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServicePrice, setEditServicePrice] = useState<string>("");
  const [editServiceDuration, setEditServiceDuration] = useState<string>("");
  const [editServiceNotes, setEditServiceNotes] = useState<string>("");
  const [savingService, setSavingService] = useState(false);
  const [serviceEditError, setServiceEditError] = useState<string | null>(null);

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

  // CRITICAL FIX: Fetch employee services (only assigned services)
  useEffect(() => {
    if (!hydrated || !user || user.role !== "EMPLOYEE") {
      return;
    }

    const fetchEmployeeServices = async () => {
      setLoadingServices(true);
      try {
        const { data } = await api.get<{
          services: EmployeeService[];
          businessId: string;
          businessName: string;
          canManageOwnServices: boolean;
        }>("/employee/services");
        setEmployeeServices(data.services);
        setCanManageOwnServices(data.canManageOwnServices);
      } catch (error) {
        logger.error("Failed to fetch employee services:", error);
        // Fallback: use all business services if endpoint fails
        if (business?.services) {
          setEmployeeServices(
            business.services.map((s) => ({ ...s, isAssociated: true }))
          );
        }
      } finally {
        setLoadingServices(false);
      }
    };

    void fetchEmployeeServices();
  }, [hydrated, user, api, business?.services]);

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
            {canManageOwnServices && (
              <p className="text-xs text-white/50">
                Poți gestiona propriile servicii
              </p>
            )}
          </div>
          {loadingServices ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
              <i className="fas fa-spinner fa-spin mr-2" />
              Se încarcă serviciile...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {employeeServices
                .filter((service) => service.isAssociated)
                .map((service) => (
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
                      {canManageOwnServices && (
                        <div className="ml-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingServiceId(service.id);
                              setEditServicePrice(service.price.toString());
                              setEditServiceDuration(service.duration.toString());
                              setEditServiceNotes(service.notes || "");
                              setServiceEditError(null);
                            }}
                            className="rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/10 px-3 py-1.5 text-xs font-semibold text-[#6366F1] transition hover:bg-[#6366F1]/20"
                            title="Editează serviciul"
                          >
                            <i className="fas fa-edit" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (togglingServiceId === service.id) return;
                              setTogglingServiceId(service.id);
                              try {
                                if (service.isAssociated) {
                                  // Remove service
                                  await api.delete(`/employee/services/${service.id}`);
                                } else {
                                  // Add service
                                  await api.post(`/employee/services/${service.id}`);
                                }
                                // Refresh services
                                const { data } = await api.get<{
                                  services: EmployeeService[];
                                  canManageOwnServices: boolean;
                                }>("/employee/services");
                                setEmployeeServices(data.services);
                                setCanManageOwnServices(data.canManageOwnServices);
                              } catch (error) {
                                logger.error("Failed to toggle service:", error);
                                alert(
                                  error instanceof Error
                                    ? error.message
                                    : "Eroare la gestionarea serviciului"
                                );
                              } finally {
                                setTogglingServiceId(null);
                              }
                            }}
                            disabled={togglingServiceId === service.id}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Elimină serviciul"
                          >
                            {togglingServiceId === service.id ? (
                              <i className="fas fa-spinner fa-spin" />
                            ) : (
                              <i className="fas fa-times" />
                            )}
                          </button>
                        </div>
                      )}
                      {service.hasOverrides && (
                        <div className="absolute top-2 right-2">
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                            <i className="fas fa-star mr-1" />
                            Personalizat
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {employeeServices.filter((service) => service.isAssociated).length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 md:col-span-2 lg:col-span-3">
                  Nu ai servicii asignate momentan. Contactează business owner-ul pentru a-ți asigna servicii.
                </div>
              )}
            </div>
          )}
          {/* CRITICAL FIX: Show available services that can be added if canManageOwnServices is true */}
          {canManageOwnServices && employeeServices.filter((s) => !s.isAssociated).length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Servicii disponibile pentru adăugare</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {employeeServices
                  .filter((service) => !service.isAssociated)
                  .map((service) => (
                    <div
                      key={service.id}
                      className="group relative rounded-2xl border border-white/5 bg-white/3 p-6 transition hover:border-[#6366F1]/40 hover:bg-white/5 opacity-70"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white/80">{service.name}</h3>
                          <p className="mt-2 text-sm text-white/50">
                            Durată: {service.duration} min
                          </p>
                          <p className="mt-1 text-sm font-medium text-[#6366F1]/80">
                            {service.price.toLocaleString("ro-RO", {
                              style: "currency",
                              currency: "RON",
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (togglingServiceId === service.id) return;
                            setTogglingServiceId(service.id);
                            try {
                              await api.post(`/employee/services/${service.id}`);
                              // Refresh services
                              const { data } = await api.get<{
                                services: EmployeeService[];
                                canManageOwnServices: boolean;
                              }>("/employee/services");
                              setEmployeeServices(data.services);
                              setCanManageOwnServices(data.canManageOwnServices);
                            } catch (error) {
                              logger.error("Failed to add service:", error);
                              alert(
                                error instanceof Error
                                  ? error.message
                                  : "Eroare la adăugarea serviciului"
                              );
                            } finally {
                              setTogglingServiceId(null);
                            }
                          }}
                          disabled={togglingServiceId === service.id}
                          className="ml-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Adaugă serviciul"
                        >
                          {togglingServiceId === service.id ? (
                            <i className="fas fa-spinner fa-spin" />
                          ) : (
                            <i className="fas fa-plus" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>

        {/* Edit Service Modal */}
        {editingServiceId && canManageOwnServices && (() => {
          const service = employeeServices.find((s) => s.id === editingServiceId && s.isAssociated);
          if (!service) return null;
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
              <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-6 shadow-xl shadow-black/40">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Editează serviciul</h3>
                    <p className="mt-1 text-sm text-white/60">{service.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingServiceId(null);
                      setEditServicePrice("");
                      setEditServiceDuration("");
                      setEditServiceNotes("");
                      setServiceEditError(null);
                    }}
                    className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <i className="fas fa-times" />
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingService(true);
                    setServiceEditError(null);
                    try {
                      await api.put(`/employee/services/${editingServiceId}`, {
                        price: editServicePrice ? parseFloat(editServicePrice) : null,
                        duration: editServiceDuration ? parseInt(editServiceDuration, 10) : null,
                        notes: editServiceNotes.trim() || null,
                      });
                      // Refresh services
                      const { data } = await api.get<{
                        services: EmployeeService[];
                        canManageOwnServices: boolean;
                      }>("/employee/services");
                      setEmployeeServices(data.services);
                      setCanManageOwnServices(data.canManageOwnServices);
                      setEditingServiceId(null);
                      setEditServicePrice("");
                      setEditServiceDuration("");
                      setEditServiceNotes("");
                    } catch (error: any) {
                      logger.error("Failed to update service:", error);
                      setServiceEditError(
                        error?.response?.data?.error || "Eroare la actualizarea serviciului"
                      );
                    } finally {
                      setSavingService(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white">
                      Preț (RON) <span className="text-white/50 text-xs">(lasă gol pentru prețul default)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editServicePrice}
                      onChange={(e) => setEditServicePrice(e.target.value)}
                      placeholder={`Default: ${service.price.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}`}
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white">
                      Durată (minute) <span className="text-white/50 text-xs">(lasă gol pentru durata default, multiplu de 30)</span>
                    </label>
                    <input
                      type="number"
                      step="30"
                      min="30"
                      value={editServiceDuration}
                      onChange={(e) => setEditServiceDuration(e.target.value)}
                      placeholder={`Default: ${service.duration} min`}
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white">
                      Note <span className="text-white/50 text-xs">(lasă gol pentru notele default)</span>
                    </label>
                    <textarea
                      value={editServiceNotes}
                      onChange={(e) => setEditServiceNotes(e.target.value)}
                      placeholder={service.notes || "Note personalizate..."}
                      rows={3}
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1] resize-none"
                    />
                  </div>

                  {serviceEditError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                      {serviceEditError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingServiceId(null);
                        setEditServicePrice("");
                        setEditServiceDuration("");
                        setEditServiceNotes("");
                        setServiceEditError(null);
                      }}
                      disabled={savingService}
                      className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anulează
                    </button>
                    <button
                      type="submit"
                      disabled={savingService}
                      className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingService ? "Se salvează..." : "Salvează"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

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
