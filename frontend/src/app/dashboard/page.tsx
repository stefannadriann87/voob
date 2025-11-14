"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, Building2 } from "lucide-react";
import BookingCard from "../../components/BookingCard";
import ServiceCard from "../../components/ServiceCard";
import useAuth from "../../hooks/useAuth";
import useBookings from "../../hooks/useBookings";
import useBusiness from "../../hooks/useBusiness";

export default function DashboardPage() {
  const router = useRouter();
  const { user, hydrated, updateProfile } = useAuth();
  const { bookings, fetchBookings, loading, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses, addService, updateService, deleteService } = useBusiness();
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
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  const [isBusinessDropdownOpen, setIsBusinessDropdownOpen] = useState(false);
  const [selectedBusinessIdsForBookings, setSelectedBusinessIdsForBookings] = useState<Set<string>>(new Set());
  const businessDropdownRef = useRef<HTMLDivElement>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [displayedBookingsCount, setDisplayedBookingsCount] = useState(6);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    void Promise.all([fetchBookings(), fetchBusinesses()]);
    
    // Show phone modal for CLIENT users without phone
    if (user.role === "CLIENT" && !user.phone && !showPhoneModal) {
      setShowPhoneModal(true);
    }
  }, [hydrated, user, fetchBookings, fetchBusinesses, router, showPhoneModal]);

  // Load selected business IDs from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && user?.role === "CLIENT" && hydrated) {
      const savedIds = localStorage.getItem("selectedBusinessIds");
      if (savedIds) {
        try {
          const ids = JSON.parse(savedIds) as string[];
          if (ids.length > 0) {
            setSelectedBusinessIdsForBookings(new Set(ids));
            // Also set the selected business for filtering bookings
            if (!selectedBusinessId && ids.length > 0) {
              setSelectedBusinessId(ids[0]);
            }
          }
        } catch (error) {
          console.error("Error loading selected business IDs:", error);
        }
      }
    }
  }, [user?.role, hydrated, selectedBusinessId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (businessDropdownRef.current && !businessDropdownRef.current.contains(event.target as Node)) {
        setIsBusinessDropdownOpen(false);
      }
    };

    if (isBusinessDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isBusinessDropdownOpen]);

  // Filter businesses based on search query
  const filteredBusinesses = useMemo(() => {
    if (!businessSearchQuery.trim()) {
      return businesses;
    }
    const query = businessSearchQuery.toLowerCase();
    return businesses.filter(
      (business) =>
        business.name.toLowerCase().includes(query) ||
        business.domain.toLowerCase().includes(query) ||
        business.email?.toLowerCase().includes(query)
    );
  }, [businesses, businessSearchQuery]);

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

  // Filter bookings by selected business (for clients) or by business ID (for business users)
  const filteredBookings = useMemo(() => {
    if (user?.role === "BUSINESS") {
      // For business users, filter by their business ID
      const businessId = businessRecord?.id || userBusiness?.id;
      if (businessId) {
        const filtered = bookings.filter((booking) => booking.businessId === businessId);
        // Debug: log bookings for business users
        if (filtered.length > 0) {
          console.log("Business bookings filtered:", filtered.length, "Business ID:", businessId);
          console.log("First booking client data:", filtered[0]?.client);
        }
        return filtered;
      }
      return bookings;
    }
    if (user?.role === "CLIENT") {
      // If no business selected yet, show all bookings (or first business)
      if (!selectedBusinessId && businesses.length > 0) {
        const firstBusiness = businesses[0];
        return bookings.filter((booking) => booking.businessId === firstBusiness.id);
      }
      if (selectedBusinessId) {
        return bookings.filter((booking) => booking.businessId === selectedBusinessId);
      }
    }
    return bookings;
  }, [bookings, selectedBusinessId, user?.role, businesses, businessRecord, userBusiness]);

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

  const handleRequestCancel = useCallback((id: string) => {
    setBookingToCancel(id);
  }, []);

  const handleCloseCancelModal = useCallback(() => {
    if (cancellingId) return;
    setBookingToCancel(null);
  }, [cancellingId]);

  const handleConfirmCancel = useCallback(async () => {
    if (!bookingToCancel) return;
    setCancellingId(bookingToCancel);
    try {
      await cancelBooking(bookingToCancel);
      setBookingToCancel(null);
    } catch (error) {
      console.error("Cancel booking failed:", error);
    } finally {
      setCancellingId(null);
    }
  }, [bookingToCancel, cancelBooking]);

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
  }, [businessRecord?.id, serviceName, serviceDuration, servicePrice, serviceNotes, editingServiceId, updateService, addService, handleCloseServiceModal, fetchBusinesses]);

  const handleDeleteService = useCallback(async () => {
    if (!serviceToDelete || !businessRecord?.id) return;
    
    setDeletingServiceId(serviceToDelete.id);
    try {
      await deleteService(businessRecord.id, serviceToDelete.id);
      setServiceToDelete(null);
      // Refresh businesses to get updated data
      void fetchBusinesses();
    } catch (error) {
      console.error("Delete service failed:", error);
      setServiceToDelete(null);
    } finally {
      setDeletingServiceId(null);
    }
  }, [serviceToDelete, businessRecord?.id, deleteService, fetchBusinesses]);

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

      {/* Business Selector for Clients */}
      {user?.role === "CLIENT" && businesses.length > 0 && (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="relative" ref={businessDropdownRef}>
            <label className="mb-2 block text-sm font-semibold text-white">Selectează business-urile pentru rezervări</label>
            <button
              type="button"
              onClick={() => setIsBusinessDropdownOpen(!isBusinessDropdownOpen)}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#0B0E17]/50 px-4 py-3 text-left transition hover:border-[#6366F1]/60 hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-white/60" />
                <span className="text-white">
                  {selectedBusinessIdsForBookings.size > 0
                    ? `${selectedBusinessIdsForBookings.size} business-uri selectate`
                    : "Selectează business-uri"}
                </span>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-white/60 transition-transform ${
                  isBusinessDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isBusinessDropdownOpen && (
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#0B0E17] shadow-xl">
                <div className="p-3">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      placeholder="Caută business..."
                      value={businessSearchQuery}
                      onChange={(e) => setBusinessSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-10 py-2 text-sm text-white placeholder:text-white/40 focus:border-[#6366F1]/60 focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredBusinesses.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-white/60">
                        Nu s-au găsit business-uri.
                      </div>
                    ) : (
                      filteredBusinesses.map((business) => (
                        <label
                          key={business.id}
                          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                            selectedBusinessIdsForBookings.has(business.id)
                              ? "bg-[#6366F1]/20 text-white"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedBusinessIdsForBookings.has(business.id)}
                            onChange={(e) => {
                              setSelectedBusinessIdsForBookings((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) {
                                  next.add(business.id);
                                } else {
                                  next.delete(business.id);
                                }
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-white/20 text-[#6366F1] focus:ring-[#6366F1]"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Building2 className="h-4 w-4" />
                          <div className="flex-1">
                            <div className="font-medium">{business.name}</div>
                            {business.domain && (
                              <div className="text-xs text-white/50">{business.domain}</div>
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedBusinessIdsForBookings.size > 0) {
                          // Save to localStorage
                          localStorage.setItem(
                            "selectedBusinessIds",
                            JSON.stringify(Array.from(selectedBusinessIdsForBookings))
                          );
                          setIsBusinessDropdownOpen(false);
                          setBusinessSearchQuery("");
                          // Redirect to bookings page
                          router.push("/client/bookings");
                        }
                      }}
                      disabled={selectedBusinessIdsForBookings.size === 0}
                      className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Adaugă ({selectedBusinessIdsForBookings.size})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {selectedBusinessIdsForBookings.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from(selectedBusinessIdsForBookings).map((businessId) => {
                const business = businesses.find((b) => b.id === businessId);
                if (!business) return null;
                return (
                  <div
                    key={businessId}
                    className="flex items-center gap-2 rounded-lg bg-[#6366F1]/20 px-3 py-1.5 text-xs text-white"
                  >
                    <span>{business.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBusinessIdsForBookings((prev) => {
                          const next = new Set(prev);
                          next.delete(businessId);
                          // Update localStorage
                          if (typeof window !== "undefined") {
                            localStorage.setItem(
                              "selectedBusinessIds",
                              JSON.stringify(Array.from(next))
                            );
                          }
                          return next;
                        });
                      }}
                      className="text-white/60 hover:text-white"
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
          <h2 className="text-lg font-semibold text-white">AI Insights</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-[#6366F1]" />
              <div>
                Joi între 16:00 - 18:00 ai cele mai multe anulări. Trimite remindere cu 4 ore înainte pentru a reduce no-show-urile.
              </div>
            </li>
            <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-[#22D3EE]" />
              <div>5 clienți nu au mai rezervat în ultimele 90 de zile. Trimite-le un voucher de revenire.</div>
            </li>
          </ul>
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
                disabled={cancellingId === bookingToCancel && loading}
                className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancellingId === bookingToCancel && loading ? "Se anulează..." : "Confirmă anularea"}
              </button>
            </div>
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

