"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import BookingCard from "../../../components/BookingCard";
import ServiceCard from "../../../components/ServiceCard";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";

export default function BusinessDashboardPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { bookings, fetchBookings, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses, addService, updateService, deleteService, addEmployee, updateEmployee, deleteEmployee } = useBusiness();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("30");
  const [servicePrice, setServicePrice] = useState("150");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceFeedback, setServiceFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeeSpecialization, setEmployeeSpecialization] = useState("");
  const [employeeFeedback, setEmployeeFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const business = useMemo(() => {
    if (businesses.length === 0) {
      return null;
    }

    const userBusinessId = user?.business?.id;
    if (userBusinessId) {
      const match = businesses.find((item) => item.id === userBusinessId);
      if (match) {
        return match;
      }
    }

    if (user?.id) {
      const owned = businesses.find((item) => item.ownerId === user.id);
      if (owned) {
        return owned;
      }

      const employeeBusiness = businesses.find((item) =>
        item.employees.some((employee) => employee.id === user.id)
      );
      if (employeeBusiness) {
        return employeeBusiness;
      }
    }

    return businesses[0] ?? null;
  }, [businesses, user]);

  // Filter bookings for this business and only today's bookings
  const businessBookings = useMemo(() => {
    if (!business?.id) return [];
    return bookings.filter((booking) => booking.businessId === business.id);
  }, [bookings, business?.id]);

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
      router.push(`/business/bookings?reschedule=${bookingId}`);
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
        console.error("Cancel booking error:", error);
      } finally {
        setCancellingBookingId(null);
      }
    },
    [cancelBooking, fetchBookings]
  );

  const handleOpenServiceModal = useCallback((serviceId?: string) => {
    if (serviceId && business) {
      // Editing existing service
      const service = business.services.find((s) => s.id === serviceId);
      if (service) {
        setEditingServiceId(serviceId);
        setServiceName(service.name);
        setServiceDuration(service.duration.toString());
        setServicePrice(service.price.toString());
        setServiceNotes(service.notes || "");
      }
    } else {
      // Adding new service
      setEditingServiceId(null);
      setServiceName("");
      setServiceDuration("30");
      setServicePrice("150");
      setServiceNotes("");
    }
    setServiceFeedback(null);
    setServiceModalOpen(true);
  }, [business]);

  const handleCloseServiceModal = useCallback(() => {
    setServiceModalOpen(false);
    setEditingServiceId(null);
    setServiceName("");
    setServiceDuration("30");
    setServicePrice("150");
    setServiceNotes("");
    setServiceFeedback(null);
  }, []);

  const handleSubmitService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business?.id) return;

    const duration = Number(serviceDuration);
    const price = Number(servicePrice);

    if (!serviceName.trim() || Number.isNaN(duration) || duration <= 0 || Number.isNaN(price) || price <= 0) {
      setServiceFeedback({ type: "error", message: "Completează un nume, o durată și un preț valide." });
      return;
    }

    try {
      if (editingServiceId) {
        // Update existing service
        await updateService(
          business.id,
          editingServiceId,
          serviceName.trim(),
          duration,
          price,
          serviceNotes.trim() || undefined
        );
        setServiceFeedback({ type: "success", message: "Serviciu actualizat cu succes." });
      } else {
        // Add new service
        await addService({
          businessId: business.id,
          name: serviceName.trim(),
          duration,
          price,
          notes: serviceNotes.trim() || undefined,
        });
        setServiceFeedback({ type: "success", message: "Serviciu adăugat cu succes." });
      }
      
      // Close modal after a short delay to show success message
      setTimeout(() => {
        handleCloseServiceModal();
        // Refresh businesses to get updated data
        void fetchBusinesses();
      }, 1000);
    } catch (error) {
      console.error("Service operation failed:", error);
      setServiceFeedback({ 
        type: "error", 
        message: editingServiceId 
          ? "Nu am putut actualiza serviciul. Încearcă din nou." 
          : "Nu am putut adăuga serviciul. Încearcă din nou." 
      });
    }
  };

  const handleDeleteService = useCallback(async () => {
    if (!serviceToDelete || !business?.id) return;
    
    setDeletingServiceId(serviceToDelete.id);
    try {
      await deleteService(business.id, serviceToDelete.id);
      setServiceToDelete(null);
      // Refresh businesses to get updated data
      void fetchBusinesses();
    } catch (error) {
      console.error("Delete service failed:", error);
      setServiceToDelete(null);
    } finally {
      setDeletingServiceId(null);
    }
  }, [serviceToDelete, business?.id, deleteService, fetchBusinesses]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role === "CLIENT") {
      router.replace("/client/dashboard");
      return;
    }
    void Promise.all([fetchBookings(), fetchBusinesses()]);
  }, [hydrated, user, router, fetchBookings, fetchBusinesses]);

  if (!hydrated) {
    return null;
  }
  if (!user || user.role === "CLIENT") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Business Dashboard - LARSTEF</title>
      </Head>
      <div className="flex flex-col gap-10">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold">
            Bun venit, {user.name}! {business ? `(${business.name})` : ""}
          </h1>
          <p className="mt-2 text-sm text-white/60 mb-2">
            Vizualizează calendarul, gestionează serviciile și oferă-le clienților tăi cea mai bună experiență.
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
                  .filter((booking) => booking.paid)
                  .reduce((acc, booking) => acc + booking.service.price, 0)
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
              onClick={() => router.push("/business/bookings")}
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
                if (booking.employee?.name) {
                  subtitleParts.push(`Specialist: ${booking.employee.name}`);
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
                  />
                );
              })
            )}
          </div>
        </section>

        <section id="services" className="flex flex-col gap-6 mobile:px-0 py-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Servicii</h2>
            <button
              type="button"
              onClick={() => handleOpenServiceModal()}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              Adaugă serviciu
            </button>
          </div>
          <div className="grid gap-2 desktop:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {business?.services.map((service) => (
              <div
                key={service.id}
                className="group relative rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-6 transition hover:border-[#6366F1]/60 hover:bg-white/10"
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
                  <div className="ml-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleOpenServiceModal(service.id)}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-[#6366F1]/20 hover:text-[#6366F1]"
                      title="Editează serviciu"
                    >
                      <i className="fas fa-edit text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceToDelete({ id: service.id, name: service.name })}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-red-500/20 hover:text-red-400"
                      title="Șterge serviciu"
                    >
                      <i className="fas fa-trash text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(!business || business.services.length === 0) && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                Adaugă primul serviciu pentru a-l face disponibil clienților tăi.
              </div>
            )}
          </div>
        </section>

        <section id="employees" className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Angajați</h2>
            <button
              type="button"
              onClick={() => {
                setEditingEmployeeId(null);
                setEmployeeModalOpen(true);
                setEmployeeName("");
                setEmployeeEmail("");
                setEmployeePhone("");
                setEmployeeSpecialization("");
                setEmployeeFeedback(null);
              }}
              className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              Adaugă angajat
            </button>
          </div>
          <div className="grid gap-2 desktop:gap-4 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {business?.employees.map((employee) => (
              <div
                key={employee.id}
                className="group relative rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-6 transition hover:border-[#6366F1]/60 hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{employee.name}</h3>
                    {employee.specialization && (
                      <p className="mt-2 text-sm text-white/60">{employee.specialization}</p>
                    )}
                    <p className="mt-2 text-xs text-white/50">{employee.email}</p>
                    {employee.phone && (
                      <p className="mt-1 text-xs text-white/50">{employee.phone}</p>
                    )}
                  </div>
                  <div className="ml-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmployeeId(employee.id);
                        setEmployeeName(employee.name);
                        setEmployeeEmail(employee.email);
                        setEmployeePhone(employee.phone || "");
                        setEmployeeSpecialization(employee.specialization || "");
                        setEmployeeFeedback(null);
                        setEmployeeModalOpen(true);
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-[#6366F1]/20 hover:text-[#6366F1]"
                      title="Editează angajat"
                    >
                      <i className="fas fa-edit text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeToDelete({ id: employee.id, name: employee.name })}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-red-500/20 hover:text-red-400"
                      title="Șterge angajat"
                    >
                      <i className="fas fa-trash text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(!business?.employees || business.employees.length === 0) && (
              <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/60">
                Nu ai angajați adăugați. Adaugă angajați pentru a gestiona programările.
              </div>
            )}
          </div>
        </section>

        {/* Service Modal (Add/Edit) */}
        {serviceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={handleCloseServiceModal}>
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">
                    {editingServiceId ? "Editează serviciile" : "Adaugă servicii"}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {editingServiceId 
                      ? "Actualizează informațiile despre serviciu" 
                      : "Completează informațiile pentru noul serviciu"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseServiceModal}
                  className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <form onSubmit={handleSubmitService} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Nume serviciu *</span>
                    <input
                      value={serviceName}
                      onChange={(event) => setServiceName(event.target.value)}
                      placeholder="Ex: Tuns modern"
                      required
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Durată (minute) *</span>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={serviceDuration}
                      onChange={(event) => setServiceDuration(event.target.value)}
                      required
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Preț (RON) *</span>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={servicePrice}
                      onChange={(event) => setServicePrice(event.target.value)}
                      required
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                </div>
                <label className="flex mt-6 flex-col gap-2 text-sm">
                  <span className="text-white/70">Observații</span>
                  <textarea
                    value={serviceNotes}
                    onChange={(event) => setServiceNotes(event.target.value)}
                    placeholder="Adaugă observații sau note despre acest serviciu..."
                    rows={3}
                    className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1] resize-none"
                  />
                </label>

                {serviceFeedback && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      serviceFeedback.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/40 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {serviceFeedback.message}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleCloseServiceModal}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    Renunță
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                  >
                    {editingServiceId ? "Salvează modificările" : "Adaugă servicii"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Service Confirmation Modal */}
        {serviceToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">Confirmă ștergerea</h3>
                <p className="mt-2 text-sm text-white/60">
                  Ești sigur că vrei să ștergi serviciul <strong className="text-white">"{serviceToDelete.name}"</strong>? 
                  Această acțiune nu poate fi anulată.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setServiceToDelete(null)}
                  disabled={deletingServiceId === serviceToDelete.id}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={handleDeleteService}
                  disabled={deletingServiceId === serviceToDelete.id}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingServiceId === serviceToDelete.id ? "Se șterge..." : "Șterge serviciu"}
                </button>
              </div>
            </div>
          </div>
        )}

        <section id="insights" className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold mb-2">AI Insights</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-3 desktop:p-5">
              <p className="text-sm font-semibold">Ore recomandate pentru promoții</p>
              <p className="mt-2 text-sm text-white/70">
                Joi și vineri între 17:00 - 19:00 ai zone cu disponibilitate ridicată. Trimite notificări automate pentru upgrade-uri.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-5">
              <p className="text-sm font-semibold">Clienți în risc de inactivitate</p>
              <p className="mt-2 text-sm text-white/70">
                5 clienți nu au mai rezervat în ultimele 3 luni. Trimite-le un voucher de revenire.
              </p>
            </div>
          </div>
        </section>

        {/* Employee Modal */}
        {employeeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {editingEmployeeId ? "Editează angajat" : "Adaugă angajat"}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {editingEmployeeId 
                      ? "Actualizează informațiile despre angajat" 
                      : "Completează informațiile pentru noul angajat"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeModalOpen(false);
                    setEditingEmployeeId(null);
                    setEmployeeName("");
                    setEmployeeEmail("");
                    setEmployeePhone("");
                    setEmployeeSpecialization("");
                    setEmployeeFeedback(null);
                  }}
                  className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!business?.id) return;

                  if (!employeeName.trim() || !employeeEmail.trim()) {
                    setEmployeeFeedback({ type: "error", message: "Numele și email-ul sunt obligatorii." });
                    return;
                  }

                  setAddingEmployee(true);
                  setEmployeeFeedback(null);
                  try {
                    if (editingEmployeeId) {
                      // Update existing employee
                      await updateEmployee(
                        business.id,
                        editingEmployeeId,
                        employeeName.trim(),
                        employeeEmail.trim(),
                        employeePhone.trim() || undefined,
                        employeeSpecialization.trim() || undefined
                      );
                      setEmployeeFeedback({ type: "success", message: "Angajat actualizat cu succes!" });
                    } else {
                      // Add new employee
                      await addEmployee({
                        businessId: business.id,
                        name: employeeName.trim(),
                        email: employeeEmail.trim(),
                        phone: employeePhone.trim() || undefined,
                        specialization: employeeSpecialization.trim() || undefined,
                      });
                      setEmployeeFeedback({ type: "success", message: "Angajat adăugat cu succes!" });
                    }
                    setTimeout(() => {
                      setEmployeeModalOpen(false);
                      setEditingEmployeeId(null);
                      setEmployeeName("");
                      setEmployeeEmail("");
                      setEmployeePhone("");
                      setEmployeeSpecialization("");
                      setEmployeeFeedback(null);
                      void fetchBusinesses();
                    }, 1000);
                  } catch (error) {
                    setEmployeeFeedback({
                      type: "error",
                      message: error instanceof Error ? error.message : editingEmployeeId 
                        ? "Eroare la actualizarea angajatului." 
                        : "Eroare la adăugarea angajatului.",
                    });
                  } finally {
                    setAddingEmployee(false);
                  }
                }}
                className="flex flex-col gap-4"
              >
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-white/70">Nume complet *</span>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    required
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    placeholder="Ion Popescu"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-white/70">Specializare</span>
                  <input
                    type="text"
                    value={employeeSpecialization}
                    onChange={(e) => setEmployeeSpecialization(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    placeholder="Ex: Stomatolog, Hair stylist, etc."
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-white/70">Email *</span>
                  <input
                    type="email"
                    value={employeeEmail}
                    onChange={(e) => setEmployeeEmail(e.target.value)}
                    required
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    placeholder="ion.popescu@example.com"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-white/70">Număr de telefon</span>
                  <input
                    type="tel"
                    value={employeePhone}
                    onChange={(e) => setEmployeePhone(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    placeholder="+40 7XX XXX XXX"
                  />
                </label>

                {employeeFeedback && (
                  <div
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      employeeFeedback.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/40 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {employeeFeedback.message}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeeModalOpen(false);
                      setEditingEmployeeId(null);
                      setEmployeeName("");
                      setEmployeeEmail("");
                      setEmployeePhone("");
                      setEmployeeSpecialization("");
                      setEmployeeFeedback(null);
                    }}
                    disabled={addingEmployee}
                    className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Renunță
                  </button>
                  <button
                    type="submit"
                    disabled={addingEmployee}
                    className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addingEmployee 
                      ? (editingEmployeeId ? "Se actualizează..." : "Se adaugă...") 
                      : (editingEmployeeId ? "Salvează modificările" : "Adaugă angajat")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Employee Confirmation Modal */}
        {employeeToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">Confirmă ștergerea</h3>
                <p className="mt-2 text-sm text-white/60">
                  Ești sigur că vrei să ștergi angajatul <strong className="text-white">"{employeeToDelete.name}"</strong>? 
                  Această acțiune nu poate fi anulată.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEmployeeToDelete(null)}
                  disabled={deletingEmployeeId === employeeToDelete.id}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!employeeToDelete || !business?.id) return;
                    setDeletingEmployeeId(employeeToDelete.id);
                    try {
                      await deleteEmployee(business.id, employeeToDelete.id);
                      setEmployeeToDelete(null);
                      void fetchBusinesses();
                    } catch (error) {
                      console.error("Delete employee failed:", error);
                      setEmployeeToDelete(null);
                    } finally {
                      setDeletingEmployeeId(null);
                    }
                  }}
                  disabled={deletingEmployeeId === employeeToDelete.id}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingEmployeeId === employeeToDelete.id ? "Se șterge..." : "Șterge angajat"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

