"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BookingCard from "../../../components/BookingCard";
import useAuth from "../../../hooks/useAuth";
import useBookings from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import { getBookingCancellationStatus } from "../../../utils/bookingRules";
import useApi from "../../../hooks/useApi";

type InsightSlot = {
  day: string;
  hour: string;
  count: number;
  examples: Array<{ client: string; service: string; date: string }>;
};

type InactiveClientInsight = {
  name: string;
  email: string;
  lastBooking: string;
  daysSince: number;
};

type BusinessInsights = {
  topSlots: InsightSlot[];
  inactiveClients: InactiveClientInsight[];
  generatedAt?: string;
};
export default function ClientDashboardPage() {
  const router = useRouter();
  const { user, hydrated, updateProfile } = useAuth();
  const { bookings, fetchBookings, loading, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses, addService, updateService, deleteService } = useBusiness();
  const api = useApi();
  const [now] = useState(() => Date.now());
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("30");
  const [servicePrice, setServicePrice] = useState("150");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceFeedback, setServiceFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<string | null>(null);
  const [bookingDetailsId, setBookingDetailsId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [selectedBusinessIdsForBookings, setSelectedBusinessIdsForBookings] = useState<Set<string>>(new Set());
  const [initialSelectionLoaded, setInitialSelectionLoaded] = useState(false);
  const [hasStoredSelection, setHasStoredSelection] = useState(false);
  const [autoPopulatedSelection, setAutoPopulatedSelection] = useState(false);
  const [businessToRemoveId, setBusinessToRemoveId] = useState<string | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [displayedBookingsCount, setDisplayedBookingsCount] = useState(6);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const businessScope: "linked" | "all" = user?.role === "CLIENT" ? "linked" : "all";

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    void fetchBookings();
    void fetchBusinesses({ scope: businessScope });
    
    // Show phone modal for CLIENT users without phone
    if (user.role === "CLIENT" && !user.phone && !showPhoneModal) {
      setShowPhoneModal(true);
    }
  }, [hydrated, user, fetchBookings, fetchBusinesses, router, showPhoneModal, businessScope]);

  // Load selected business IDs from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined" || user?.role !== "CLIENT" || !hydrated) {
      return;
    }

    const savedIdsRaw = localStorage.getItem("selectedBusinessIds");
    if (savedIdsRaw) {
      try {
        const ids = JSON.parse(savedIdsRaw) as string[];
        setSelectedBusinessIdsForBookings(new Set(ids));
        setHasStoredSelection(ids.length > 0);
        if (ids.length > 0) {
          setSelectedBusinessId((prev) => prev ?? ids[0]);
        }
      } catch (error) {
        console.error("Error loading selected business IDs:", error);
        setHasStoredSelection(false);
        setSelectedBusinessIdsForBookings(new Set());
      }
    } else {
      setHasStoredSelection(false);
      setSelectedBusinessIdsForBookings(new Set());
    }

    setInitialSelectionLoaded(true);
  }, [user?.role, hydrated]);

  useEffect(() => {
    if (
      !hydrated ||
      user?.role !== "CLIENT" ||
      !initialSelectionLoaded ||
      hasStoredSelection ||
      autoPopulatedSelection
    ) {
      return;
    }

    if (selectedBusinessIdsForBookings.size === 0 && businesses.length > 0) {
      const ids = businesses.map((business) => business.id);
      setSelectedBusinessIdsForBookings(new Set(ids));
      setSelectedBusinessId((prev) => prev ?? ids[0] ?? null);
      if (typeof window !== "undefined") {
        localStorage.setItem("selectedBusinessIds", JSON.stringify(ids));
      }
      setHasStoredSelection(ids.length > 0);
      setAutoPopulatedSelection(true);
    }
  }, [
    autoPopulatedSelection,
    businesses,
    hasStoredSelection,
    hydrated,
    initialSelectionLoaded,
    selectedBusinessIdsForBookings,
    user?.role,
  ]);

  useEffect(() => {
    if (
      !hydrated ||
      user?.role !== "CLIENT" ||
      !initialSelectionLoaded ||
      businesses.length === 0
    ) {
      return;
    }

    setSelectedBusinessIdsForBookings((prev) => {
      const next = new Set(prev);
      let changed = false;

      for (const business of businesses) {
        if (!next.has(business.id)) {
          next.add(business.id);
          changed = true;
        }
      }

      if (!changed) {
        return prev;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("selectedBusinessIds", JSON.stringify(Array.from(next)));
      }
      setHasStoredSelection(true);
      if (!selectedBusinessId && next.size > 0) {
        setSelectedBusinessId(Array.from(next)[0]);
      }
      return next;
    });
  }, [businesses, hydrated, initialSelectionLoaded, selectedBusinessId, user?.role]);

  const selectedBusinesses = useMemo(() => {
    if (selectedBusinessIdsForBookings.size === 0) {
      return businesses;
    }
    return businesses.filter((business) => selectedBusinessIdsForBookings.has(business.id));
  }, [businesses, selectedBusinessIdsForBookings]);

  const fetchInsights = useCallback(async () => {
    if (user?.role !== "CLIENT" || selectedBusinessIdsForBookings.size === 0 || businesses.length === 0) {
      setInsights(null);
      return;
    }
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const targetBusiness =
        selectedBusinesses[0] ??
        businesses.find((business) => selectedBusinessIdsForBookings.has(business.id)) ??
        businesses[0];
      const targetBusinessId = targetBusiness?.id;
      if (!targetBusinessId) {
        setInsights(null);
        setInsightsLoading(false);
        return;
      }
      const { data } = await api.get<{ insights: BusinessInsights }>(`/business/${targetBusinessId}/insights`);
      setInsights(data.insights);
    } catch (error) {
      console.error("Failed to fetch insights:", error);
      setInsightsError("Nu am putut încărca insight-urile de rezervări.");
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  }, [api, businesses, selectedBusinessIdsForBookings, selectedBusinesses, user?.role]);

  useEffect(() => {
    if (!hydrated || user?.role !== "CLIENT") {
      return;
    }
    void fetchInsights();
  }, [fetchInsights, hydrated, user?.role]);

  // Get selected business
  const selectedBusiness = useMemo(() => {
    if (!selectedBusinessId && businesses.length > 0) {
      return businesses[0];
    }
    if (selectedBusinessId) {
      return businesses.find((b) => b.id === selectedBusinessId) || businesses[0] || null;
    }
    return null;
  }, [businesses, selectedBusinessId]);

  // Get business info for business users (needed for filtering bookings)
  const userId = user?.id ?? "";
  const userBusiness = user?.business ?? null;
  const isBusinessUser = user?.role === "BUSINESS";

  const businessRecord = useMemo(() => {
    if (!isBusinessUser) {
      return null;
    }
    return (
      businesses.find((item) => item.ownerId === userId || item.id === userBusiness?.id) ?? null
    );
  }, [isBusinessUser, businesses, userId, userBusiness]);

  const businessPendingRemoval = useMemo(() => {
    if (!businessToRemoveId) {
      return null;
    }
    return businesses.find((business) => business.id === businessToRemoveId) ?? null;
  }, [businesses, businessToRemoveId]);

  // Filter bookings by selected business (for clients) or by business ID (for business users)
  // Exclude cancelled bookings from the list
  const filteredBookings = useMemo(() => {
    // First, exclude cancelled bookings
    const activeBookings = bookings.filter((booking) => booking.status !== "CANCELLED");
    
    if (user?.role === "BUSINESS") {
      // For business users, filter by their business ID
      const businessId = businessRecord?.id || userBusiness?.id;
      if (businessId) {
        const filtered = activeBookings.filter((booking) => booking.businessId === businessId);
        // Debug: log bookings for business users
        if (filtered.length > 0) {
          console.log("Business bookings filtered:", filtered.length, "Business ID:", businessId);
          console.log("First booking client data:", filtered[0]?.client);
        }
        return filtered;
      }
      return activeBookings;
    }
    if (user?.role === "CLIENT" && user.id) {
      const clientBookings = activeBookings.filter((booking) => booking.clientId === user.id);

      if (selectedBusinessIdsForBookings.size > 0) {
        return clientBookings.filter((booking) =>
          selectedBusinessIdsForBookings.has(booking.businessId)
        );
      }

      if (selectedBusinessId) {
        return clientBookings.filter((booking) => booking.businessId === selectedBusinessId);
      }

      if (businesses.length > 0) {
        const firstBusiness = businesses[0];
        return clientBookings.filter((booking) => booking.businessId === firstBusiness.id);
      }

      return clientBookings;
    }
    return activeBookings;
  }, [
    bookings,
    selectedBusinessId,
    selectedBusinessIdsForBookings,
    user?.role,
    user?.id,
    businesses,
    businessRecord,
    userBusiness,
  ]);

  const bookingToCancelData = useMemo(() => {
    if (!bookingToCancel) return null;
    return (
      filteredBookings.find((booking) => booking.id === bookingToCancel) ??
      bookings.find((booking) => booking.id === bookingToCancel) ??
      null
    );
  }, [bookingToCancel, filteredBookings, bookings]);

  const bookingToCancelStatus = useMemo(
    () =>
      bookingToCancelData
        ? getBookingCancellationStatus(bookingToCancelData.date, bookingToCancelData.reminderSentAt)
        : null,
    [bookingToCancelData]
  );

  const upcoming = useMemo(() => {
    if (isBusinessUser) {
      // For business, show only today's bookings sorted by time
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      return filteredBookings
        .filter((booking) => {
          const bookingDate = new Date(booking.date);
          return bookingDate >= today && bookingDate < tomorrow;
        })
        .sort((a, b) => {
          // Sort by time (hour and minute)
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        })
        .slice(0, 3);
    }
    
    // For clients, show upcoming bookings
    return filteredBookings
      .filter((booking) => new Date(booking.date).getTime() >= now)
      .slice(0, 3);
  }, [filteredBookings, now, isBusinessUser]);

  const past = useMemo(
    () =>
      filteredBookings
        .filter((booking) => new Date(booking.date).getTime() < now)
        .slice(0, 3),
    [filteredBookings, now]
  );

  const displayedBookings = activeTab === "upcoming" ? upcoming : past;

  const businessDisplay = businessRecord ?? (isBusinessUser ? userBusiness : null);

  const handleReschedule = useCallback(
    (id: string) => {
      const booking = (user?.role === "CLIENT" ? filteredBookings : bookings).find((item) => item.id === id);
      if (user?.role === "CLIENT") {
        // For clients, go to /client/bookings and scroll to calendar
        if (booking?.serviceId) {
          const params = new URLSearchParams({
            businessId: booking.businessId,
            serviceId: booking.serviceId,
            date: booking.date,
          });
          router.push(`/client/bookings?${params.toString()}#calendar`);
        } else {
          router.push("/client/bookings#calendar");
        }
      } else {
        // For other roles, redirect to client bookings page
        // (or their specific booking page if they have one)
        if (booking?.serviceId) {
          const params = new URLSearchParams({
            businessId: booking.businessId,
            serviceId: booking.serviceId,
            date: booking.date,
          });
          router.push(`/client/bookings?${params.toString()}`);
        } else {
          router.push("/client/bookings");
        }
      }
    },
    [filteredBookings, bookings, router, user?.role]
  );

  const handleDetails = useCallback((id: string) => {
    setBookingDetailsId(id);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setBookingDetailsId(null);
  }, []);

  const handleRequestCancel = useCallback(
    (id: string) => {
      const targetBooking =
        filteredBookings.find((item) => item.id === id) ?? bookings.find((item) => item.id === id);
      if (targetBooking) {
        const status = getBookingCancellationStatus(targetBooking.date, targetBooking.reminderSentAt);
        if (!status.canCancel) {
          return;
        }
      }
      setBookingToCancel(id);
    },
    [filteredBookings, bookings]
  );

  const handleCloseCancelModal = useCallback(() => {
    if (cancellingId) return;
    setBookingToCancel(null);
  }, [cancellingId]);

  const handleConfirmCancel = useCallback(async () => {
    if (!bookingToCancel) return;
    if (bookingToCancelStatus && !bookingToCancelStatus.canCancel) return;
    setCancellingId(bookingToCancel);
    try {
      await cancelBooking(bookingToCancel);
      setBookingToCancel(null);
    } catch (error) {
      console.error("Cancel booking failed:", error);
    } finally {
      setCancellingId(null);
    }
  }, [bookingToCancel, bookingToCancelStatus, cancelBooking]);

  const handleCreateBookingClick = useCallback(() => {
    if (!user) return;
    switch (user.role) {
      case "CLIENT":
        router.push("/client/bookings");
        break;
      case "BUSINESS":
        router.push("/business/bookings");
        break;
      case "EMPLOYEE":
        router.push("/employee/calendar");
        break;
      case "SUPERADMIN":
        router.push("/admin/dashboard");
        break;
      default:
        router.push("/client/bookings");
    }
  }, [router, user]);

  const handleOpenServiceModal = useCallback((serviceId?: string) => {
    if (serviceId) {
      // Editing existing service
      const service = businessRecord?.services.find((s) => s.id === serviceId);
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
  }, [businessRecord?.services]);

  const handleCloseServiceModal = useCallback(() => {
    setServiceModalOpen(false);
    setEditingServiceId(null);
    setServiceName("");
    setServiceDuration("30");
    setServicePrice("150");
    setServiceNotes("");
    setServiceFeedback(null);
  }, []);

  const handleSubmitService = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!businessRecord?.id) return;

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
          businessRecord.id,
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
          businessId: businessRecord.id,
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
        void fetchBusinesses({ scope: businessScope });
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
  }, [businessRecord?.id, serviceName, serviceDuration, servicePrice, serviceNotes, editingServiceId, updateService, addService, handleCloseServiceModal, fetchBusinesses]);

  const handleDeleteService = useCallback(async () => {
    if (!serviceToDelete || !businessRecord?.id) return;
    
    setDeletingServiceId(serviceToDelete.id);
    try {
      await deleteService(businessRecord.id, serviceToDelete.id);
      setServiceToDelete(null);
      // Refresh businesses to get updated data
      void fetchBusinesses({ scope: businessScope });
    } catch (error) {
      console.error("Delete service failed:", error);
      setServiceToDelete(null);
    } finally {
      setDeletingServiceId(null);
    }
  }, [serviceToDelete, businessRecord?.id, deleteService, fetchBusinesses]);

  const handleRemoveBusiness = useCallback((businessId: string) => {
    setBusinessToRemoveId(businessId);
  }, []);

  const handleCancelRemoveBusiness = useCallback(() => {
    setBusinessToRemoveId(null);
  }, []);

  const handleConfirmRemoveBusiness = useCallback(() => {
    if (!businessToRemoveId) return;
    setSelectedBusinessIdsForBookings((prev) => {
      const next = new Set(prev);
      next.delete(businessToRemoveId);

      if (typeof window !== "undefined") {
        if (next.size > 0) {
          localStorage.setItem("selectedBusinessIds", JSON.stringify(Array.from(next)));
        } else {
          localStorage.removeItem("selectedBusinessIds");
        }
      }

      setHasStoredSelection(next.size > 0);

      if (next.size === 0) {
        setSelectedBusinessId(null);
      } else if (selectedBusinessId === businessToRemoveId) {
        setSelectedBusinessId(Array.from(next)[0]);
      }

      return next;
    });
    setBusinessToRemoveId(null);
  }, [businessToRemoveId, selectedBusinessId]);

  if (!hydrated) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-[#6366F1]">
              {isBusinessUser ? "Business Overview" : "Agenda ta personală"}
            </p>
            <h1 className="mt-1 mb-1 text-3xl font-semibold text-white">
              Bun venit, {user.name}
              {isBusinessUser && businessDisplay ? ` (${businessDisplay.name})` : ""}!
            </h1>
            <p className="text-sm text-white/60 mb-2">
              {isBusinessUser
                ? "Vizualizează calendarul, gestionează serviciile și oferă-le clienților tăi cea mai bună experiență."
                : "Gestionează toate rezervările într-un singur loc și primește recomandări inteligente."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
            onClick={handleCreateBookingClick}
              className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] mb-4 desktop:mb-0"
            >
              Adaugă rezervare
            </button>
             {isBusinessUser && businessRecord && (
              <button
                type="button"
                onClick={() => handleOpenServiceModal()}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 mb-4 desktop:mb-0"
              >
                Adaugă servicii
              </button>
            )}
          </div>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-white/10 bg-[#6366F1]/10 p-3 desktop:p-5">
            <p className="text-xs uppercase tracking-wide text-white/60">
              {isBusinessUser ? "Rezervări lună curentă" : "Rezervări confirmate"}
            </p>
            <p className="mt-3 text-lg desktop:text-2xl font-semibold">
              {(isBusinessUser ? bookings : filteredBookings).filter((booking) => new Date(booking.date).getMonth() === new Date().getMonth()).length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-5">
            <p className="text-xs uppercase tracking-wide text-white/60">
              {isBusinessUser ? "Venit estimat" : "Rezervări viitoare"}
            </p>
            <p className="mt-3 text-lg desktop:text-2xl font-semibold">
              {isBusinessUser
                ? bookings
                    .filter((booking) => booking.paid)
                    .reduce((acc, booking) => acc + booking.service.price, 0)
                    .toLocaleString("ro-RO", { style: "currency", currency: "RON" })
                : filteredBookings.filter((booking) => new Date(booking.date).getTime() >= now).length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-5">
            <p className="text-xs uppercase tracking-wide text-white/60">
              {isBusinessUser ? "Clienți recurenți" : "Rezervări finalizate"}
            </p>
            <p className="mt-3 text-lg desktop:text-2xl font-semibold">
              {isBusinessUser
                ? new Set(bookings.map((booking) => booking.client.email)).size
                : filteredBookings.filter((booking) => new Date(booking.date).getTime() < now).length}
            </p>
          </div>
        </div>
      </section>

      {/* Client onboarding hint */}
      {user?.role === "CLIENT" && businesses.length === 0 && (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-white">Nu ai business-uri conectate încă</h2>
          <p className="mt-2 text-sm text-white/60">
            Partenerii LARSTEF îți oferă acces exclusiv prin codul lor QR. Scanează-l pentru a vedea servicii și a face
            rezervări.
          </p>
          <button
            type="button"
            onClick={() => router.push("/client/scan-qr")}
            className="mt-4 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
          >
            Deschide pagina „Scanează QR”
          </button>
        </section>
      )}

      {/* Business Selector for Clients */}
      {user?.role === "CLIENT" && (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Business-urile tale</h2>
              <p className="mt-1 text-sm text-white/60">
                Ai acces la aceste locații după scanarea codului QR.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selectedBusinesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60 md:col-span-2 xl:col-span-3">
                Nu ai încă business-uri salvate. Scanează un cod QR pentru a începe.
                <button
                  type="button"
                  onClick={() => router.push("/client/scan-qr")}
                  className="mt-3 inline-flex items-center justify-center rounded-2xl bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#7C3AED]"
                >
                  Scanează cod QR
                </button>
              </div>
            ) : (
              selectedBusinesses.map((business) => (
                <article
                  key={business.id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-5 shadow-lg shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-white">{business.name}</p>
                      {business.domain && (
                        <p className="mt-1 text-xs text-white/60">{business.domain}</p>
                      )}
                      {business.email && (
                        <p className="mt-2 text-xs text-white/50">{business.email}</p>
                      )}
                      {(() => {
                        const phone = (business as { phone?: string | null }).phone;
                        if (!phone) {
                          return null;
                        }
                        return <p className="text-xs text-white/50">{phone}</p>;
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBusiness(business.id)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-red-500/20 hover:text-red-300"
                    >
                      Șterge
                    </button>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/70">
                    Cod QR generat • {business.qrCodeUrl ? "Disponibil" : "În curs"}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Toate rezervările</h2>
            <p className="text-sm text-white/60 mb-2">O privire completă asupra programărilor trecute și viitoare.</p>
          </div>
        </header>

        {filteredBookings.length === 0 && !loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Nu există rezervări salvate momentan.
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredBookings
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, displayedBookingsCount)
                .map((booking) => (
                  <BookingCard
                    key={booking.id}
                    id={booking.id}
                    serviceName={booking.service.name}
                    businessName={booking.business.name}
                    date={booking.date}
                    paid={booking.paid}
                    status={new Date(booking.date).getTime() > now ? "upcoming" : "completed"}
                    onReschedule={handleReschedule}
                    onRequestCancel={handleRequestCancel}
                    onDetails={handleDetails}
                    cancelling={cancellingId === booking.id && loading}
                    reminderSentAt={booking.reminderSentAt}
                    currentTime={now}
                  />
                ))}
            </div>

            {filteredBookings.length > displayedBookingsCount && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setDisplayedBookingsCount((prev) => prev + 6)}
                  className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Vezi mai mult
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="desktop:rounded-3xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-6">
          <header className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Rezervări</h2>
            </div>
            <div className="flex gap-2 border-b border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab("upcoming")}
                className={`flex-1 px-4 py-2 text-sm font-medium transition ${
                  activeTab === "upcoming"
                    ? "border-b-2 border-[#6366F1] text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Viitoare
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("past")}
                className={`flex-1 px-4 py-2 text-sm font-medium transition ${
                  activeTab === "past"
                    ? "border-b-2 border-[#6366F1] text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Trecute
              </button>
            </div>
          </header>
          <div className="mt-4 space-y-3">
            {displayedBookings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/60">
                {activeTab === "upcoming"
                  ? "Nu ai programări viitoare. Completează programul cu recomandările AI."
                  : "Nu ai programări trecute."}
              </p>
            ) : (
              displayedBookings.map((booking) => {
                // For business users, always show client name
                // If client data is missing, log it for debugging
                if (isBusinessUser && !booking.client) {
                  console.warn("Booking missing client data:", {
                    bookingId: booking.id,
                    businessId: booking.businessId,
                    clientId: booking.clientId,
                    booking: booking
                  });
                }
                
                const clientName = isBusinessUser 
                  ? (booking.client?.name || booking.client?.email || `Client ID: ${booking.clientId}` || "Client necunoscut")
                  : (booking.business?.name || "Business");
                
                return (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-white/5 bg-white/5 px-4 py-4 text-sm text-white/80"
                  >
                    <div className="flex items-center justify-between text-white">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white text-base">
                          {clientName}
                        </span>
                        {isBusinessUser && booking.client?.email && (
                          <span className="mt-1 text-xs text-white/60">{booking.client.email}</span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-white/70 whitespace-nowrap ml-2">
                        {new Date(booking.date).toLocaleString("ro-RO", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-white/60">{booking.service?.name || "Serviciu"}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="desktop:rounded-3xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-6">
          <h2 className="text-lg font-semibold text-white mb-6">AI Insights</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#6366F1]/10 p-4">
              <p className="text-sm font-semibold text-white">Ore recomandate</p>
              <p className="mt-2 text-xs text-white/70">
                {insightsLoading
                  ? "Analizăm tiparele de rezervări pentru businessurile selectate..."
                  : insightsError
                  ? insightsError
                  : insights && insights.topSlots.length > 0
                  ? `Intervale populare: ${insights.topSlots
                      .slice(0, 2)
                      .map((slot) => `${slot.day} ${slot.hour}`)
                      .join(" • ")}. Programează-te în aceste ferestre pentru locuri sigure.`
                  : "Nu există încă suficiente date pentru recomandări. Adaugă businessuri noi sau revizuiește selecția."}
              </p>
              {!insightsLoading && !insightsError && insights && insights.topSlots.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-white/80">
                  {insights.topSlots.slice(0, 3).map((slot) => (
                    <li key={`${slot.day}-${slot.hour}`} className="flex items-start gap-2">
                      <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-[#A5B4FC]" />
                      <span>
                        {slot.day} • {slot.hour} — {slot.count} rezervări
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Clienți recurenți</p>
              <p className="mt-2 text-xs text-white/70">
                {insightsLoading
                  ? "Monitorizăm activitatea ta pentru a detecta pauzele lungi."
                  : insightsError
                  ? "Nu putem evalua clienții recurenți momentan."
                  : insights && insights.inactiveClients.length > 0
                  ? "Aceste businessuri nu au mai fost vizitate recent. Reprogramează din timp:"
                  : "Ești la zi cu reprogramările :)."}
              </p>
              {!insightsLoading && !insightsError && insights && insights.inactiveClients.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-white/80">
                  {insights.inactiveClients.slice(0, 3).map((client) => (
                    <li key={client.email} className="flex flex-col rounded-xl border border-white/10 bg-[#0B0E17]/50 p-3">
                      <span className="font-semibold text-white">{client.name}</span>
                      <span className="text-white/60">{client.email}</span>
                      <span className="text-white/40">
                        Ultima vizită: {new Date(client.lastBooking).toLocaleDateString("ro-RO")} • {client.daysSince} zile
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {isBusinessUser && businessRecord && businessRecord.services && (
        <section id="services" className="rounded-3xl border border-white/10 bg-white/5 p-8 mobile:px-0 py-2">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Servicii active</h2>
              <p className="text-sm text-white/60">Actualizează timpul, prețul și disponibilitatea echipei.</p>
            </div>
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {businessRecord.services.map((service) => (
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
            {businessRecord.services.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                Adaugă primul serviciu pentru a-l face disponibil în booking.
              </div>
            )}
          </div>
        </section>
      )}

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

        {businessPendingRemoval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">Confirmă eliminarea</h3>
                <p className="mt-2 text-sm text-white/60">
                  Vrei să elimini business-ul{" "}
                  <strong className="text-white">{businessPendingRemoval.name}</strong> din lista ta? Îl vei putea
                  adăuga din nou doar prin scanarea codului QR.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCancelRemoveBusiness}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemoveBusiness}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500"
                >
                  Elimină
                </button>
              </div>
            </div>
          </div>
        )}

      {bookingToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Confirmă anularea</h3>
              <p className="mt-2 text-sm text-white/60">
                Ești sigur că vrei să anulezi această rezervare? Intervalul va deveni disponibil în calendar și
                clientul va fi notificat.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseCancelModal}
                disabled={cancellingId === bookingToCancel && loading}
                className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Renunță
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={
                  (cancellingId === bookingToCancel && loading) ||
                  (!!bookingToCancelStatus && !bookingToCancelStatus.canCancel)
                }
                className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancellingId === bookingToCancel && loading ? "Se anulează..." : "Confirmă anularea"}
              </button>
            </div>
            {bookingToCancelStatus && !bookingToCancelStatus.canCancel && bookingToCancelStatus.message && (
              <p className="mt-2 text-sm text-red-300">{bookingToCancelStatus.message}</p>
            )}
          </div>
        </div>
      )}

      {bookingDetailsId && (() => {
        const booking = filteredBookings.find((b) => b.id === bookingDetailsId);
        if (!booking) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={handleCloseDetails}>
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-2xl font-semibold text-white">Detalii rezervare</h3>
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-white/60">Serviciu</span>
                    <span className="text-lg font-semibold text-white">{booking.service.name}</span>
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-white/60">Business</span>
                    <span className="font-medium text-white">{booking.business.name}</span>
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-white/60">Data și ora</span>
                    <span className="font-medium text-white">
                      {new Date(booking.date).toLocaleString("ro-RO", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-white/60">Durată</span>
                    <span className="font-medium text-white">{booking.service.duration} minute</span>
                  </div>
                  {booking.employee && (
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-white/60">Specialist</span>
                      <span className="font-medium text-white">{booking.employee.name}</span>
                    </div>
                  )}
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-white/60">Preț</span>
                    <span className="text-lg font-semibold text-[#6366F1]">
                      {booking.service.price.toLocaleString("ro-RO", {
                        style: "currency",
                        currency: "RON",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/60">Status plată</span>
                    <span className={`font-medium ${booking.paid ? "text-emerald-400" : "text-amber-400"}`}>
                      {booking.paid ? "Plătit" : "Plată la locație"}
                    </span>
                  </div>
                </div>
                {isBusinessUser && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-white/80">Informații client</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white/60">Nume</span>
                      <span className="font-medium text-white">{booking.client.name}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-white/60">Email</span>
                      <span className="font-medium text-white">{booking.client.email}</span>
                    </div>
                    {booking.client.phone && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm text-white/60">Telefon</span>
                        <span className="font-medium text-white">{booking.client.phone}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  className="rounded-2xl bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                >
                  Închide
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Phone Modal for CLIENT users without phone */}
      {showPhoneModal && user?.role === "CLIENT" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Adaugă numărul de telefon</h3>
              <p className="mt-2 text-sm text-white/60">
                Te rugăm să adaugi numărul tău de telefon pentru a putea fi contactat cu privire la rezervările tale.
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!phoneInput.trim()) {
                  return;
                }
                setUpdatingPhone(true);
                try {
                  await updateProfile({ phone: phoneInput.trim() });
                  setShowPhoneModal(false);
                  setPhoneInput("");
                } catch (error) {
                  console.error("Failed to update phone:", error);
                } finally {
                  setUpdatingPhone(false);
                }
              }}
              className="flex flex-col gap-4"
            >
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Număr de telefon</span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+40 7XX XXX XXX"
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  required
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPhoneModal(false);
                    setPhoneInput("");
                  }}
                  disabled={updatingPhone}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sări peste
                </button>
                <button
                  type="submit"
                  disabled={updatingPhone || !phoneInput.trim()}
                  className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingPhone ? "Se salvează..." : "Salvează"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

