"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "../../../components/DatePicker";
import CustomSelect from "../../../components/CustomSelect";
import useAuth from "../../../hooks/useAuth";
import useBookings, { Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import useApi from "../../../hooks/useApi";
import useWorkingHours from "../../../hooks/useWorkingHours";
import useCourts from "../../../hooks/useCourts";
import {
  getBookingCancellationStatus,
  isBookingTooSoon,
  MIN_LEAD_MESSAGE,
  MIN_BOOKING_LEAD_MS,
} from "../../../utils/bookingRules";
import { getWeekStart, formatDayLabel, getClientColor } from "../../../utils/calendarUtils";

// Calendar utilities importate din utils/calendarUtils

export default function BusinessBookingsPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const api = useApi();
  const { bookings, fetchBookings, loading, cancelBooking, updateBooking, createBooking } = useBookings();
  const { businesses, fetchBusinesses } = useBusiness();
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [calendarDate, setCalendarDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [viewType, setViewType] = useState<"week" | "day">("week");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null);
  const [filterServiceId, setFilterServiceId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "unpaid">("all");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [hoveredAvailableSlot, setHoveredAvailableSlot] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [tooltipBooking, setTooltipBooking] = useState<Booking | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; showAbove: boolean } | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refundPayment, setRefundPayment] = useState<boolean>(false);
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState<string | null>(null);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [createBookingModalOpen, setCreateBookingModalOpen] = useState(false);
  const [selectedSlotDate, setSelectedSlotDate] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedEmployeeIdForBooking, setSelectedEmployeeIdForBooking] = useState<string>("");
  const [paid, setPaid] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; name: string; email: string; phone?: string | null }>>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [createBookingError, setCreateBookingError] = useState<string | null>(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const selectedSlotTooSoon = useMemo(
    () => (selectedSlotDate ? isBookingTooSoon(selectedSlotDate) : false),
    [selectedSlotDate]
  );
  const bypassCancellationLimits = user?.role === "BUSINESS" || user?.role === "EMPLOYEE";
  const tooltipCancellationStatus = useMemo(() => {
    if (!tooltipBooking) return null;
    // Check if booking is already cancelled
    if (tooltipBooking.status === "CANCELLED") {
      return { canCancel: false, message: "Rezervarea a fost deja anulată." };
    }
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(tooltipBooking.date, tooltipBooking.reminderSentAt);
  }, [tooltipBooking, bypassCancellationLimits]);
  const selectedBookingCancellationStatus = useMemo(() => {
    if (!selectedBooking) return null;
    // Check if booking is already cancelled
    if (selectedBooking.status === "CANCELLED") {
      return { canCancel: false, message: "Rezervarea a fost deja anulată." };
    }
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(selectedBooking.date, selectedBooking.reminderSentAt);
  }, [selectedBooking, bypassCancellationLimits]);
  const bookingToCancelCancellationStatus = useMemo(() => {
    if (!bookingToCancel) return null;
    // Check if booking is already cancelled
    if (bookingToCancel.status === "CANCELLED") {
      return { canCancel: false, message: "Rezervarea a fost deja anulată." };
    }
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(bookingToCancel.date, bookingToCancel.reminderSentAt);
  }, [bookingToCancel, bypassCancellationLimits]);
  const [holidays, setHolidays] = useState<Array<{ id: string; startDate: string; endDate: string; reason: string | null }>>([]);

  const businessId = user?.business?.id;

  // Get business with employees
  const business = useMemo(() => {
    if (!businessId) return null;
    return businesses.find((b) => b.id === businessId);
  }, [businesses, businessId]);

  // Detect if business is SPORT_OUTDOOR
  const isSportOutdoor = business?.businessType === "SPORT_OUTDOOR";

  // Get courts for SPORT_OUTDOOR businesses
  const { courts, loading: courtsLoading } = useCourts(isSportOutdoor ? businessId || null : null);

  // Get slot duration from business, or calculate from minimum service duration, or default to 60
  // For SPORT_OUTDOOR, always use 60 minutes (1 hour)
  const slotDurationMinutes = useMemo(() => {
    if (!business) return 60;
    if (isSportOutdoor) return 60; // SPORT_OUTDOOR always uses 1 hour slots
    if (business.slotDuration !== null && business.slotDuration !== undefined) {
      return business.slotDuration;
    }
    // Calculate from minimum service duration
    // Slot duration trebuie să fie multiplu de 30 minute și nu mai mare decât durata minimă
    if (business.services && business.services.length > 0) {
      const minDuration = Math.min(...business.services.map((s) => s.duration));
      // Round to nearest valid slot duration (30, 60, 90, 120, etc.) - doar multipli de 30
      const validDurations = [30, 60, 90, 120, 150, 180];
      return validDurations.reduce((prev, curr) => {
        if (curr > minDuration) return prev; // Nu folosim slot duration mai mare decât durata minimă
        return Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev;
      }, 30); // Default minim 30 minute
    }
    return 60; // Default
  }, [business]);

  // Use working hours hook
  // For SPORT_OUTDOOR, don't use employeeId (no employees for SPORT_OUTDOOR)
  const { workingHours, getAvailableHoursForDay: getAvailableHoursForDayFromHook, isBreakTime } = useWorkingHours({
    businessId: businessId || null,
    employeeId: isSportOutdoor ? null : selectedEmployeeId,
    slotDurationMinutes,
  });

  // Fetch holidays - only once when businessId changes
  const holidaysFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!businessId) return;
    // Only fetch if we haven't fetched for this businessId yet
    if (holidaysFetchedRef.current === businessId) return;
    
    const fetchHolidays = async () => {
      try {
        const { data } = await api.get<{ holidays: Array<{ id: string; startDate: string; endDate: string; reason: string | null }> }>(`/business/${businessId}/holidays`);
        setHolidays(data.holidays);
        holidaysFetchedRef.current = businessId;
      } catch (error) {
        // Failed to fetch holidays - silently fail
      }
    };
    void fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]); // Removed api from dependencies (it's stable)

  // Track if initial fetch has been done to prevent duplicate requests
  const hasInitialFetchRef = useRef(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "BUSINESS") {
      // Redirect to appropriate dashboard based on role
      switch (user.role) {
        case "CLIENT":
          router.replace("/client/dashboard");
          break;
        case "EMPLOYEE":
          router.replace("/employee/dashboard");
          break;
        case "SUPERADMIN":
          router.replace("/admin/dashboard");
          break;
        default:
          router.replace("/client/dashboard");
      }
      return;
    }
    
    // Only fetch once on mount, not on every render
    if (!hasInitialFetchRef.current) {
      hasInitialFetchRef.current = true;
      void Promise.all([fetchBookings(), fetchBusinesses()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user, router]); // Removed fetchBookings and fetchBusinesses from dependencies

  // Listen for booking created events from AI chat
  const handleBookingCreated = useCallback(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    window.addEventListener("voob:booking-created", handleBookingCreated);
    return () => {
      window.removeEventListener("voob:booking-created", handleBookingCreated);
    };
  }, [handleBookingCreated]);

  // Fetch clients when modal opens or search query changes
  useEffect(() => {
    if (!createBookingModalOpen) {
      return;
    }
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const { data } = await api.get<Array<{ id: string; name: string; email: string; phone?: string | null }>>(
          `/auth/clients${clientSearchQuery ? `?search=${encodeURIComponent(clientSearchQuery)}` : ""}`
        );
        setClients(data);
      } catch (error) {
        setClients([]);
      } finally {
        setLoadingClients(false);
      }
    };
    const timeoutId = setTimeout(fetchClients, 300); // Debounce search
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createBookingModalOpen, clientSearchQuery]); // Removed api from dependencies (it's stable)
  
  // Filter bookings by business and optionally by employee, search, and filters
  const businessBookings = useMemo(() => {
    if (!businessId) return [];
    let filtered = bookings.filter((booking) => booking.businessId === businessId);
    
    // Filter by selected employee if one is selected (for employee tabs)
    // Skip for SPORT_OUTDOOR (no employees)
    if (!isSportOutdoor && selectedEmployeeId) {
      filtered = filtered.filter((booking) => booking.employeeId === selectedEmployeeId);
    }
    
    // Filter by selected court if one is selected (for court tabs) - SPORT_OUTDOOR only
    if (isSportOutdoor && selectedCourtId) {
      filtered = filtered.filter((booking) => booking.courtId === selectedCourtId);
    }
    
    // Apply additional filters
    // Skip for SPORT_OUTDOOR (no employees)
    if (!isSportOutdoor && filterEmployeeId) {
      filtered = filtered.filter((booking) => booking.employeeId === filterEmployeeId);
    }
    
    if (filterServiceId) {
      filtered = filtered.filter((booking) => booking.serviceId === filterServiceId);
    }
    
    if (filterStatus !== "all") {
      filtered = filtered.filter((booking) => 
        filterStatus === "paid" ? booking.paid : !booking.paid
      );
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((booking) => {
        const clientName = booking.client?.name?.toLowerCase() || "";
        const clientEmail = booking.client?.email?.toLowerCase() || "";
        const serviceName = booking.service?.name?.toLowerCase() || "";
        const employeeName = booking.employee?.name?.toLowerCase() || "";
        return (
          clientName.includes(query) ||
          clientEmail.includes(query) ||
          serviceName.includes(query) ||
          employeeName.includes(query)
        );
      });
    }
    
    return filtered;
  }, [bookings, businessId, selectedEmployeeId, selectedCourtId, filterEmployeeId, filterServiceId, filterStatus, searchQuery, isSportOutdoor]);

  // Get all employees from business, sorted by name
  const employees = useMemo(() => {
    if (!business?.employees) return [];
    return [...business.employees].sort((a, b) => a.name.localeCompare(b.name));
  }, [business?.employees]);

  // Sync weekStart when viewType changes
  useEffect(() => {
    if (calendarDate) {
      const selectedDateObj = new Date(calendarDate);
      if (viewType === "day") {
        // In day view, set weekStart to the exact day
        selectedDateObj.setHours(0, 0, 0, 0);
        setWeekStart(selectedDateObj);
      } else {
        // In week view, set weekStart to the start of the week
        setWeekStart(getWeekStart(selectedDateObj));
      }
    }
  }, [viewType, calendarDate]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  // Use getAvailableHoursForDay from hook
  const getAvailableHoursForDay = getAvailableHoursForDayFromHook;

  const slotsMatrix = useMemo(() => {
    const now = Date.now();
    const minBookingTime = now + MIN_BOOKING_LEAD_MS;
    return weekDays.map((day) => {
      const availableHours = getAvailableHoursForDay(day);
      return availableHours.map((hour: string) => {
        const [h, m] = hour.split(":").map(Number);
        const slotDate = new Date(day);
        slotDate.setHours(h, m, 0, 0);
        const slotStartMs = slotDate.getTime();
        const iso = slotDate.toISOString();
        const isPast = slotStartMs < now;
        const isTooSoon = !isPast && slotStartMs < minBookingTime;
        const slotEndMs = slotStartMs + slotDurationMinutes * 60 * 1000;

        // Check if slot is in a holiday period and get the holiday
        const blockingHoliday = holidays.find((holiday) => {
          const holidayStart = new Date(holiday.startDate);
          holidayStart.setHours(0, 0, 0, 0);
          const holidayEnd = new Date(holiday.endDate);
          holidayEnd.setHours(23, 59, 59, 999);
          return slotStartMs < holidayEnd.getTime() && slotEndMs > holidayStart.getTime();
        });
        const isBreak = isBreakTime(day, hour);
        const isBlocked = !!blockingHoliday || isBreak;

        // Find all bookings that overlap with this slot
        // When "Toți" tab is selected, multiple bookings from different employees can overlap
        const overlappingBookings = businessBookings.filter((b) => {
          const bookingStart = new Date(b.date);
          const bookingStartMs = bookingStart.getTime();
          // Use booking.duration if available, otherwise service.duration, otherwise default to slotDurationMinutes
          const bookingDurationMs = (b.duration ?? b.service?.duration ?? slotDurationMinutes) * 60 * 1000;
          const bookingEndMs = bookingStartMs + bookingDurationMs;
          const slotEndMs = slotStartMs + slotDurationMinutes * 60 * 1000;
          const sameDay = bookingStart.toDateString() === slotDate.toDateString();
          // Check if booking overlaps with this slot: bookingStart < slotEnd && bookingEnd > slotStart
          return sameDay && bookingStartMs < slotEndMs && bookingEndMs > slotStartMs;
        });

        // Get the first booking for display (prioritize the one that starts closest to slot start)
        const booking = overlappingBookings.length > 0
          ? overlappingBookings.sort((a, b) => {
              const aStart = new Date(a.date).getTime();
              const bStart = new Date(b.date).getTime();
              // Sort by start time, then by employee name for consistency
              if (Math.abs(aStart - slotStartMs) !== Math.abs(bStart - slotStartMs)) {
                return Math.abs(aStart - slotStartMs) - Math.abs(bStart - slotStartMs);
              }
              return (a.employee?.name || "").localeCompare(b.employee?.name || "");
            })[0]
          : null;

        let status: "available" | "booked" | "past" | "blocked" = "available";
        if (isPast) status = "past";
        if (isBlocked || isTooSoon) status = "blocked";
        if (overlappingBookings.length > 0) status = "booked"; // Mark as booked if any booking overlaps

        // Check if this is the first slot of the booking (to show details only on the first slot)
        // A slot is the first slot if the booking starts at or very close to this slot's start time
        const isFirstSlotOfBooking =
          booking &&
          Math.abs(new Date(booking.date).getTime() - slotStartMs) < 5 * 60 * 1000; // 5 minutes tolerance

        // Get client color if booking exists
        const clientColor = booking?.clientId ? getClientColor(booking.clientId) : null;
        
        // Store all overlapping bookings for potential future use (e.g., tooltip showing all)
        const allOverlappingBookings = overlappingBookings.length > 0 ? overlappingBookings : null;

        // Count how many bookings overlap this slot (for visual indicator)
        const overlappingCount = overlappingBookings.length;
        const hasMultipleBookings = overlappingCount > 1;

        return {
          iso,
          label: slotDate.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
          status,
          booking: booking || null,
          allOverlappingBookings: allOverlappingBookings, // All bookings that overlap this slot
          overlappingCount, // Number of overlapping bookings
          hasMultipleBookings, // Boolean flag for multiple bookings
          isFirstSlot: isFirstSlotOfBooking || false,
          clientColor: clientColor || null,
          blockingHoliday: blockingHoliday || null,
          isBreak, // Flag to indicate if this is a break/pause period
        };
      });
    });
  }, [weekDays, businessBookings, getAvailableHoursForDay, holidays, slotDurationMinutes, isBreakTime]);

  // Expose slotsMatrix for validation in create booking modal
  const slotsMatrixForValidation = slotsMatrix;

  // CRITICAL FIX (TICKET-016): Memoize handler functions to prevent unnecessary re-renders
  const handleViewTypeChange = useCallback((newViewType: "week" | "day") => {
    setViewType(newViewType);
  }, []);

  const handleCalendarDateChange = useCallback((date: string) => {
    setCalendarDate(date);
    const selectedDateObj = new Date(date);
    // In day view, set weekStart to the exact day; in week view, set to week start
    if (viewType === "day") {
      selectedDateObj.setHours(0, 0, 0, 0);
      setWeekStart(selectedDateObj);
    } else {
      setWeekStart(getWeekStart(selectedDateObj));
    }
  }, [viewType]);

  const handleClearFilters = useCallback(() => {
    setFilterEmployeeId(null);
    setFilterServiceId(null);
    setFilterStatus("all");
    setSearchQuery("");
  }, []);

  const handleSelectEmployee = useCallback((employeeId: string | null) => {
    setSelectedEmployeeId(employeeId);
  }, []);

  const handleSelectCourt = useCallback((courtId: string | null) => {
    setSelectedCourtId(courtId);
  }, []);

  const handleSelectBooking = useCallback((booking: Booking | null) => {
    setSelectedBooking(booking);
    setTooltipBooking(null);
    setTooltipPosition(null);
  }, []);

  const handleOpenCreateBookingModal = useCallback((slotIso: string) => {
    setSelectedSlotDate(slotIso);
    setCreateBookingModalOpen(true);
  }, []);

  const handleCloseCreateBookingModal = useCallback(() => {
    setCreateBookingModalOpen(false);
    setSelectedSlotDate(null);
    setSelectedClientId("");
    setSelectedServiceId("");
    setSelectedEmployeeIdForBooking("");
    setPaid(false);
    setClientSearchQuery("");
    setCreateBookingError(null);
  }, []);

  const handleFilterEmployeeChange = useCallback((value: string) => {
    setFilterEmployeeId(value || null);
  }, []);

  const handleFilterServiceChange = useCallback((value: string) => {
    setFilterServiceId(value || null);
  }, []);

  // Memoize employee filter options
  const employeeFilterOptions = useMemo(() => {
    return [
      { value: "", label: "Toți angajații" },
      ...employees.map((emp) => ({
        value: emp.id,
        label: emp.name,
      })),
    ];
  }, [employees]);

  // Memoize service filter options
  const serviceFilterOptions = useMemo(() => {
    if (!business?.services) return [{ value: "", label: "Toate serviciile" }];
    return [
      { value: "", label: "Toate serviciile" },
      ...business.services.map((service) => ({
        value: service.id,
        label: service.name,
      })),
    ];
  }, [business?.services]);

  if (!hydrated) {
    return null;
  }
  if (!user || user.role !== "BUSINESS") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0B0E17] text-white">
      <main className="flex flex-col gap-10 px-0 desktop:px-4 ">
        {/* <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-3xl font-semibold">Programările businessului</h1>
          <p className="mt-2 text-sm text-white/60">
            Vizualizează și gestionează toate programările businessului tău în calendarul de mai jos.
          </p>
        </section> */}

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4">
            {/* Header with title and view toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-white mb-2">Calendar programări</h1>
              <p className="text-xs text-white/50">
                {viewType === "week" && "Zilele sunt pe coloane, orele pe rânduri. Click pe o rezervare pentru detalii."}
                {viewType === "day" && "Vizualizare detaliată pentru o singură zi."}
              </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                {/* View Type Toggle - Mobile optimized */}
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0B0E17]/60 p-3 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => handleViewTypeChange("week")}
                    className={`px-2 sm:px-3 py-1 text-sm font-medium rounded transition whitespace-nowrap ${
                      viewType === "week"
                        ? "bg-[#6366F1] text-white"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="hidden sm:inline">Săptămână</span>
                    <span className="sm:hidden">Săpt.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewTypeChange("day")}
                    className={`px-2 sm:px-3 py-1 text-sm font-medium rounded transition whitespace-nowrap ${
                      viewType === "day"
                        ? "bg-[#6366F1] text-white"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Zi
                  </button>
                </div>
                
                    {/* Calendar picker */}
                    <div className="hidden sm:block">
                      <DatePicker
                        value={calendarDate}
                        onChange={handleCalendarDateChange}
                        placeholder="Selectează data"
                        viewType={viewType}
                      />
                    </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Search Bar - Mobile optimized */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Caută după client, serviciu, angajat..."
                  className="w-full rounded-xl border border-white/10 bg-[#0B0E17]/60 pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-[#6366F1] touch-manipulation"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition touch-manipulation"
                    aria-label="Șterge căutarea"
                  >
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>

              {/* Filters - Mobile optimized */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-white/60 hidden sm:inline">Filtre:</span>
                
                {/* Employee Filter - Hidden for SPORT_OUTDOOR */}
                {!isSportOutdoor && employees.length > 0 && (
                  <CustomSelect
                    value={filterEmployeeId || ""}
                    onChange={(value) => setFilterEmployeeId(value || null)}
                    options={[
                      { value: "", label: "Toți angajații" },
                      ...employees.map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                      })),
                    ]}
                    placeholder="Toți angajații"
                    size="md"
                  />
                )}

                {/* Service Filter */}
                {business?.services && business.services.length > 0 && (
                  <CustomSelect
                    value={filterServiceId || ""}
                    onChange={(value) => setFilterServiceId(value || null)}
                    options={[
                      { value: "", label: "Toate serviciile" },
                      ...business.services.map((service) => ({
                        value: service.id,
                        label: service.name,
                      })),
                    ]}
                    placeholder="Toate serviciile"
                    size="md"
                  />
                )}

                {/* Status Filter */}
                <CustomSelect
                  value={filterStatus}
                  onChange={(value) => setFilterStatus(value as "all" | "paid" | "unpaid")}
                  options={[
                    { value: "all", label: "Toate statusurile" },
                    { value: "paid", label: "Plătite" },
                    { value: "unpaid", label: "Neplătite" },
                  ]}
                  placeholder="Toate statusurile"
                  size="md"
                />

                {/* Clear Filters */}
                {(filterEmployeeId || filterServiceId || filterStatus !== "all" || searchQuery) && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="rounded-lg border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition touch-manipulation min-h-[44px] flex items-center gap-1"
                  >
                    <i className="fas fa-times" />
                    <span className="hidden sm:inline">Șterge filtrele</span>
                    <span className="sm:hidden">Șterge</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Employee Tabs - Mobile optimized - Hidden for SPORT_OUTDOOR */}
          {!isSportOutdoor && employees.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => handleSelectEmployee(null)}
                className={`rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold transition whitespace-nowrap touch-manipulation min-h-[44px] ${
                  selectedEmployeeId === null
                    ? "bg-[#6366F1] text-white"
                    : "bg-white/5 text-white/70 hover:bg-white/10 active:bg-white/15"
                }`}
              >
                Toți
              </button>
              {employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => handleSelectEmployee(employee.id)}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold transition whitespace-nowrap touch-manipulation min-h-[44px] ${
                    selectedEmployeeId === employee.id
                      ? "bg-[#6366F1] text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10 active:bg-white/15"
                  }`}
                >
                  {employee.name}
                </button>
              ))}
            </div>
          )}

          {/* Court Tabs - Mobile optimized - Only for SPORT_OUTDOOR */}
          {isSportOutdoor && courts.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => handleSelectCourt(null)}
                className={`rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold transition whitespace-nowrap touch-manipulation min-h-[44px] ${
                  selectedCourtId === null
                    ? "bg-[#6366F1] text-white"
                    : "bg-white/5 text-white/70 hover:bg-white/10 active:bg-white/15"
                }`}
              >
                Toate
              </button>
              {courts.map((court) => (
                <button
                  key={court.id}
                  type="button"
                  onClick={() => handleSelectCourt(court.id)}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold transition whitespace-nowrap touch-manipulation min-h-[44px] ${
                    selectedCourtId === court.id
                      ? "bg-[#6366F1] text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10 active:bg-white/15"
                  }`}
                >
                  {court.name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-center text-sm text-white/60">
              Se încarcă programările...
            </div>
          ) : viewType === "day" ? (
            // Day View - O singură zi detaliată
            <div className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {weekDays[0].toLocaleDateString("ro-RO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
              </div>
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {(() => {
                  const day = weekDays[0];
                  const availableHours = getAvailableHoursForDay(day);
                  const daySlots = slotsMatrix?.[0] || [];
                  // Filter out break slots in day view
                  return availableHours.map((hour: string, index: number) => {
                    const slot = daySlots[index];
                    if (!slot || slot.isBreak) return null;
                    const slotDate = new Date(slot.iso);
                    const isPast = slotDate.getTime() < Date.now();
                    return (
                      <div
                        key={hour}
                        className={`flex items-center gap-4 rounded-xl border border-white/10 p-4 ${
                          slot.status === "booked"
                            ? slot.clientColor?.bg || "bg-[#6366F1]/60"
                            : "bg-[#0B0E17]/40"
                        } ${isPast ? "opacity-50" : ""}`}
                      >
                        <div className="w-20 text-sm font-medium text-white/70">{hour}</div>
                        <div className="flex-1">
                          {slot.status === "booked" && slot.allOverlappingBookings && slot.allOverlappingBookings.length > 0 ? (
                            // Afișează toate rezervările suprapuse (pentru tab "Toți")
                            <div className="space-y-1">
                              {slot.hasMultipleBookings && slot.overlappingCount > 1 && (
                                <div className="mb-2 rounded-lg bg-yellow-500/20 border border-yellow-400/40 px-2 py-1">
                                  <p className="text-xs font-semibold text-yellow-300">
                                    {slot.overlappingCount} rezervări la această oră
                                  </p>
                                </div>
                              )}
                              {slot.allOverlappingBookings.map((booking) => {
                                const bookingClientColor = booking.clientId ? getClientColor(booking.clientId) : null;
                                return (
                                  <div
                                    key={booking.id}
                                    className={`rounded-lg border p-3 cursor-pointer transition hover:opacity-80 ${
                                      bookingClientColor?.border || "border-white/20"
                                    } ${bookingClientColor?.bg || "bg-[#6366F1]/60"}`}
                                    onClick={() => handleSelectBooking(booking)}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <div className="font-semibold text-white text-sm">{booking.client?.name}</div>
                                    </div>
                                    <div className="text-xs text-white/70 mb-1">{booking.service?.name}</div>
                                    {booking.employee && (
                                      <div className="text-xs text-white/50">
                                        <i className="fas fa-user mr-1" />
                                        {booking.employee.name}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : slot.booking ? (
                            <div
                              className="cursor-pointer"
                              onClick={() => handleSelectBooking(slot.booking!)}
                            >
                              <div className="font-semibold text-white">{slot.booking.client?.name}</div>
                              <div className="text-sm text-white/70">{slot.booking.service?.name}</div>
                              {slot.booking.employee && (
                                <div className="text-xs text-white/50 mt-1">
                                  <i className="fas fa-user mr-1" />
                                  {slot.booking.employee.name}
                                </div>
                              )}
                            </div>
                          ) : slot.status === "available" && !slot.isBreak ? (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateBookingModal(slot.iso)}
                              className="text-white/50 hover:text-white transition"
                            >
                              Disponibil
                            </button>
                          ) : (
                            <span className="text-white/30">
                              {slot.status === "past" ? "Trecut" : slot.status === "blocked" ? (slot.isBreak ? "Pauză" : "Blocat") : "—"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            // Week View - Vizualizare săptămânală (existentă)
            <div className="overflow-x-auto">
              <div className="w-full rounded-3xl border border-white/10 bg-[#0B0E17]/40 p-4">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${weekDays.length}, minmax(100px, 1fr))`,
                    gap: "12px",
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

                  {(() => {
                    // Get all unique hours from all days for this week
                    const allHours = new Set<string>();
                    weekDays.forEach((day) => {
                      const availableHours = getAvailableHoursForDay(day);
                      availableHours.forEach((h: string) => allHours.add(h));
                    });
                    return Array.from(allHours).sort();
                  })().map((hour, hourIndex) => (
                    <Fragment key={`row-${hour}`}>
                      {weekDays.map((_, dayIndex) => {
                        // Find the slot for this day and hour
                        const day = weekDays[dayIndex];
                        const availableHoursForDay = getAvailableHoursForDay(day);
                        const slotIndex = availableHoursForDay.indexOf(hour);
                        const slot = slotIndex >= 0 ? slotsMatrix?.[dayIndex]?.[slotIndex] : null;
                        if (!slot) {
                          return <div key={`empty-${dayIndex}-${hour}`} className="rounded-2xl bg-[#0B0E17]/30" />;
                        }

                        const slotDate = new Date(slot.iso);
                        const slotStartMs = slotDate.getTime();
                        const hoveredStartMs = hoveredSlot ? new Date(hoveredSlot).getTime() : null;
                        const hoveredDayString = hoveredSlot ? new Date(hoveredSlot).toDateString() : null;
                        const isHoveredAvailable = hoveredAvailableSlot === slot.iso && slot.status === "available";

                        let stateClasses =
                          "bg-[#0B0E17]/60 text-white/70 border border-white/10 transition-all duration-200";
                        if (slot.status === "blocked") {
                          stateClasses =
                            "bg-red-600/30 text-red-400 border border-red-500/60 cursor-not-allowed";
                        } else if (slot.status === "booked") {
                          // Check if slot is in the past
                          const slotDate = new Date(slot.iso);
                          const now = new Date();
                          const isPast = slotDate.getTime() < now.getTime();
                          
                          // Check if this booking spans multiple slots (for gradient effect)
                          const bookingDuration = slot.booking
                            ? (slot.booking.duration ?? slot.booking.service?.duration ?? slotDurationMinutes) * 60 * 1000
                            : 0;
                          const spansMultipleSlots = bookingDuration > slotDurationMinutes * 60 * 1000;
                          
                          if (isPast) {
                            // Past booked slots should be disabled
                            stateClasses =
                              "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed opacity-60";
                          } else {
                            // Check if there are multiple bookings in this slot (different employees)
                            const hasMultipleBookings = slot.hasMultipleBookings && slot.overlappingCount > 1;
                            
                            // Use client-specific color if available
                            if (slot.clientColor) {
                              const borderClass = hasMultipleBookings 
                                ? "border-2 border-yellow-400/80" 
                                : slot.clientColor.border;
                              
                              if (spansMultipleSlots && slot.isFirstSlot) {
                                // Gradient for first slot of multi-slot bookings
                                stateClasses = `${slot.clientColor.gradientFirst} text-white ${borderClass} cursor-pointer transition-all duration-300 ${slot.clientColor.gradientHover} shadow-lg ${slot.clientColor.shadow}`;
                              } else if (spansMultipleSlots) {
                                // Middle/end slots of multi-slot booking
                                stateClasses = `${slot.clientColor.gradientMiddle} text-white ${borderClass} cursor-pointer transition-all duration-300`;
                              } else {
                                // Single slot booking
                                stateClasses = `${slot.clientColor.bg} text-white ${borderClass} cursor-pointer transition-all duration-300 hover:${slot.clientColor.hover} hover:scale-[1.02]`;
                              }
                            } else {
                              // Fallback to default purple gradient if no client color
                              const borderClass = hasMultipleBookings 
                                ? "border-2 border-yellow-400/80" 
                                : "border border-indigo-500/70";
                              if (spansMultipleSlots && slot.isFirstSlot) {
                                stateClasses =
                                  `bg-gradient-to-r from-indigo-500/70 via-indigo-500/60 to-indigo-500/50 text-white ${borderClass} cursor-pointer transition-all duration-300 hover:from-indigo-500/80 hover:via-indigo-500/70 hover:to-indigo-500/60 shadow-lg shadow-indigo-500/40`;
                              } else if (spansMultipleSlots) {
                                stateClasses =
                                  `bg-gradient-to-r from-indigo-500/60 via-indigo-500/50 to-indigo-500/40 text-white ${borderClass} cursor-pointer transition-all duration-300`;
                              } else {
                                stateClasses =
                                  `bg-[#6366F1]/50 text-white ${borderClass} cursor-pointer transition-all duration-300 hover:bg-[#6366F1]/60 hover:scale-[1.02] hover:shadow-lg hover:shadow-[#6366F1]/40`;
                              }
                            }
                          }
                        } else if (slot.status === "past") {
                          stateClasses =
                            "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed";
                        } else if (slot.status === "available") {
                          // Enhanced hover styles for available slots with smooth animations
                          if (isHoveredAvailable) {
                            stateClasses =
                              "bg-[#6366F1]/40 text-white border border-[#6366F1] cursor-pointer shadow-lg shadow-[#6366F1]/50 scale-[1.02] transition-all duration-300 ease-out z-10 animate-pulse";
                          } else {
                            stateClasses =
                              "bg-[#0B0E17]/60 text-white/70 border border-white/10 hover:bg-[#6366F1]/20 hover:border-[#6366F1]/50 hover:text-white hover:scale-[1.01] cursor-pointer transition-all duration-300 ease-in-out";
                          }
                        }

                        // Highlight all slots that belong to the same booking when hovering
                        // Only highlight if slot is not in the past
                        const slotDateForHighlight = new Date(slot.iso);
                        const nowForHighlight = new Date();
                        const isPastForHighlight = slotDateForHighlight.getTime() < nowForHighlight.getTime();
                        
                        const isHoverHighlight =
                          !isPastForHighlight &&
                          hoveredStartMs !== null &&
                          slot.status === "booked" &&
                          slot.booking &&
                          (() => {
                            // Check if the hovered slot belongs to the same booking
                            const hoveredBooking = businessBookings.find((b) => {
                              const bookingStart = new Date(b.date);
                              const bookingStartMs = bookingStart.getTime();
                              const bookingDurationMs = (b.service?.duration ?? slotDurationMinutes) * 60 * 1000;
                              const bookingEndMs = bookingStartMs + bookingDurationMs;
                              const slotEndMs = hoveredStartMs + slotDurationMinutes * 60 * 1000;
                              const sameDay = bookingStart.toDateString() === hoveredDayString;
                              return sameDay && bookingStartMs < slotEndMs && bookingEndMs > hoveredStartMs;
                            });
                            return hoveredBooking?.id === slot.booking.id;
                          })();

                        if (isHoverHighlight && slot.clientColor) {
                          // Use brighter version of client color on hover - maintain color, just increase opacity
                          const hoverHasMultipleBookings = slot.hasMultipleBookings && slot.overlappingCount > 1;
                          const hoverBorderClass = hoverHasMultipleBookings 
                            ? "border-2 border-yellow-400/80" 
                            : slot.clientColor.border.replace('/80', '/100');
                          
                          // Check if booking spans multiple slots
                          const hoverBookingDuration = slot.booking
                            ? (slot.booking.duration ?? slot.booking.service?.duration ?? slotDurationMinutes) * 60 * 1000
                            : 0;
                          const hoverSpansMultipleSlots = hoverBookingDuration > slotDurationMinutes * 60 * 1000;
                          
                          if (hoverSpansMultipleSlots && slot.isFirstSlot) {
                            // Brighter gradient for multi-slot bookings on hover
                            stateClasses = `${slot.clientColor.hoverGradientFirst} text-white ${hoverBorderClass} cursor-pointer transition-all duration-300 shadow-lg ${slot.clientColor.shadow}`;
                          } else if (hoverSpansMultipleSlots) {
                            // Middle/end slots - use brighter version
                            stateClasses = `${slot.clientColor.gradientFirst} text-white ${hoverBorderClass} cursor-pointer transition-all duration-300`;
                          } else {
                            // Single slot - use brighter background
                            stateClasses = `${slot.clientColor.hoverBg} text-white ${hoverBorderClass} cursor-pointer transition-all duration-300 shadow-lg ${slot.clientColor.shadow}`;
                          }
                        } else if (isHoverHighlight) {
                          // Fallback hover style - brighter purple/indigo
                          stateClasses =
                            "bg-[#6366F1]/80 text-white border border-[#6366F1]/100 shadow-lg shadow-[#6366F1]/50";
                        }

                        const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
                          // Check if slot is in the past
                          const slotDate = new Date(slot.iso);
                          const now = new Date();
                          const isPast = slotDate.getTime() < now.getTime();
                          
                          // Only handle hover for booked slots that are not in the past
                          if (slot.status === "booked" && slot.booking && !isPast) {
                            setHoveredSlot(slot.iso);
                            // Clear any existing timeout
                            if (tooltipTimeoutRef.current) {
                              clearTimeout(tooltipTimeoutRef.current);
                              tooltipTimeoutRef.current = null;
                            }
                            
                            // Store the element reference and booking before timeout
                            const targetElement = e.currentTarget;
                            const booking = slot.booking;
                            
                            // Get bounding rect immediately while element is still available
                            const rect = targetElement.getBoundingClientRect();
                            
                            // Set tooltip after a short delay
                            tooltipTimeoutRef.current = setTimeout(() => {
                              // Verify element still exists
                              if (!targetElement || !booking) {
                                return;
                              }
                              
                              // Recalculate rect in case of scroll/resize
                              const currentRect = targetElement.getBoundingClientRect();
                              
                              // For fixed positioning, use viewport coordinates (no scroll offset)
                              const tooltipWidth = 320; // w-80 = 320px
                              const tooltipHeight = 380; // approximate height
                              const viewportWidth = window.innerWidth;
                              const viewportHeight = window.innerHeight;
                              
                              // Calculate center of the slot in viewport coordinates
                              let x = currentRect.left + currentRect.width / 2;
                              let y = currentRect.top;
                              
                              // Check if tooltip would go off left edge
                              if (x - tooltipWidth / 2 < 10) {
                                x = tooltipWidth / 2 + 10;
                              }
                              // Check if tooltip would go off right edge
                              if (x + tooltipWidth / 2 > viewportWidth - 10) {
                                x = viewportWidth - tooltipWidth / 2 - 10;
                              }
                              
                              // Determine if tooltip should show above or below
                              const spaceAbove = currentRect.top;
                              const spaceBelow = viewportHeight - currentRect.bottom;
                              const showAbove = spaceAbove > tooltipHeight || spaceAbove > spaceBelow;
                              
                              if (showAbove) {
                                // Show above the slot
                                y = currentRect.top - 10;
                              } else {
                                // Show below the slot
                                y = currentRect.bottom + 10;
                              }
                              
                              // Ensure tooltip doesn't go off screen vertically
                              if (showAbove && y - tooltipHeight < 10) {
                                y = tooltipHeight + 20;
                                // If still doesn't fit, show below
                                if (y + tooltipHeight > viewportHeight - 10) {
                                  y = currentRect.bottom + 10;
                                }
                              } else if (!showAbove && y + tooltipHeight > viewportHeight - 10) {
                                y = viewportHeight - tooltipHeight - 20;
                                // If still doesn't fit, show above
                                if (y < 10) {
                                  y = currentRect.top - 10;
                                }
                              }
                              
                              setTooltipPosition({
                                x,
                                y,
                                showAbove,
                              });
                              setTooltipBooking(booking);
                            }, 100);
                          }
                        };

                        const handleMouseLeave = () => {
                          setHoveredSlot(null);
                          if (tooltipTimeoutRef.current) {
                            clearTimeout(tooltipTimeoutRef.current);
                            tooltipTimeoutRef.current = null;
                          }
                          // Delay hiding tooltip to allow moving to it
                          const hideTimeout = setTimeout(() => {
                            // Only hide if mouse is not over tooltip
                            const tooltipElement = tooltipRef.current;
                            if (!tooltipElement || !tooltipElement.matches(":hover")) {
                              setTooltipBooking(null);
                              setTooltipPosition(null);
                            }
                          }, 200);
                          // Store hide timeout to clear if needed
                          tooltipTimeoutRef.current = hideTimeout as unknown as NodeJS.Timeout;
                        };

                        // For booked slots, we want to show tooltip on hover
                        // Use a wrapper div to ensure mouse events work even with disabled buttons
                        const isBooked = slot.status === "booked" && slot.booking;
                        
                        return (
                          <div 
                            key={slot.iso} 
                            className="relative w-full"
                            onMouseEnter={isBooked ? handleMouseEnter : undefined}
                            onMouseLeave={isBooked ? handleMouseLeave : undefined}
                            style={{ pointerEvents: "auto" }}
                          >
                          <button
                            type="button"
                            disabled={slot.status === "past" || slot.status === "blocked" || slot.isBreak}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (slot.booking) {
                                setSelectedBooking(slot.booking);
                                setTooltipBooking(null);
                                setTooltipPosition(null);
                              } else if (slot.status === "available" && !slot.booking) {
                                // Open create booking modal for available slots
                                setSelectedSlotDate(slot.iso);
                                setCreateBookingModalOpen(true);
                                setTooltipBooking(null);
                                setTooltipPosition(null);
                              }
                            }}
                            className={`flex h-[44px] w-full flex-col items-center justify-center rounded-2xl px-2 text-xs font-semibold ${stateClasses}`}
                            style={{
                              cursor: slot.booking ? "pointer" : slot.status === "past" || slot.isBreak ? "not-allowed" : "pointer",
                              pointerEvents: "auto",
                            }}
                            onMouseEnter={(e) => {
                              // Also handle on button to catch all cases
                              if (isBooked) {
                                e.stopPropagation();
                                handleMouseEnter(e);
                              } else if (slot.status === "available") {
                                setHoveredAvailableSlot(slot.iso);
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (isBooked) {
                                e.stopPropagation();
                                handleMouseLeave();
                              } else if (slot.status === "available") {
                                setHoveredAvailableSlot(null);
                              }
                            }}
                          >
                            {/* Badge for multiple bookings */}
                            {slot.hasMultipleBookings && slot.overlappingCount > 1 && (
                              <div className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/90 text-[10px] font-bold text-white shadow-lg ring-2 ring-yellow-400/50">
                                {slot.overlappingCount}
                              </div>
                            )}
                            
                            {slot.status === "booked" && slot.booking ? (
                              slot.isFirstSlot ? (
                                <>
                                  <span className="w-full truncate text-[10px]">
                                    {slot.booking.client?.name || "Client"}
                                  </span>
                                  <span className="w-full truncate text-[10px] opacity-80">
                                    {slot.booking.service?.name || "Serviciu"}
                                  </span>
                                  {slot.hasMultipleBookings && slot.overlappingCount > 1 && (
                                    <span className="w-full truncate text-[9px] opacity-70 text-yellow-300">
                                      +{slot.overlappingCount - 1} rezervări
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] opacity-60">Ocupat</span>
                              )
                            ) : slot.status === "blocked" ? (
                              <span className="text-[10px] opacity-60 truncate">
                                {slot.isBreak ? "Pauză" : slot.blockingHoliday?.reason || "Blocat"}
                              </span>
                            ) : (
                              <span>{slot.label}</span>
                            )}
                          </button>
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Tooltip for booking details on hover */}
        {tooltipBooking && tooltipPosition && (
          <div
            ref={tooltipRef}
            className="fixed"
            style={{
              left: `${tooltipPosition.x}px`,
              top: `${tooltipPosition.y}px`,
              transform: tooltipPosition.showAbove 
                ? "translate(-50%, -100%)" // Show above
                : "translate(-50%, 0)", // Show below
              zIndex: 99999,
              pointerEvents: "none",
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              // Keep tooltip visible when hovering over it
              if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current);
                tooltipTimeoutRef.current = null;
              }
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              // Small delay to allow clicking buttons
              setTimeout(() => {
                setTooltipBooking(null);
                setTooltipPosition(null);
              }, 300);
            }}
          >
            {(() => {
              // Find the slot that corresponds to this booking to get all overlapping bookings
              const slotForTooltip = slotsMatrix
                ?.flat()
                .find((s) => s.booking?.id === tooltipBooking.id);
              const allBookings = slotForTooltip?.allOverlappingBookings || [tooltipBooking];
              const hasMultiple = allBookings.length > 1;

              return (
                <div 
                  className="pointer-events-auto w-80 rounded-2xl bg-[#0B0E17] p-4 shadow-2xl shadow-black/50 backdrop-blur-sm max-w-sm"
                  style={{ 
                    zIndex: 10000,
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  {hasMultiple && (
                    <div className="mb-3 rounded-lg bg-yellow-500/20 border border-yellow-400/40 px-3 py-2">
                      <p className="text-xs font-semibold text-yellow-300">
                        {allBookings.length} rezervări suprapuse la această oră
                      </p>
                    </div>
                  )}
                  
                  {allBookings.map((booking, index) => (
                    <div key={booking.id} className={index > 0 ? "mt-4 border-t border-white/10 pt-4" : ""}>
                      <div className="mb-3 border-b border-white/10 pb-3">
                        <h3 className="text-sm font-semibold text-white">{booking.client?.name || "Client"}</h3>
                        <p className="mt-1 text-xs text-white/60">{booking.client?.email || ""}</p>
                        {booking.client?.phone && (
                          <p className="mt-1 text-xs text-white/60">
                            <i className="fas fa-phone mr-1" />
                            {booking.client.phone}
                          </p>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-xs text-white/70">
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Serviciu:</span>
                          <span className="font-medium text-white">{booking.service?.name || "—"}</span>
                        </div>
                        {booking.employee && (
                          <div className="flex items-center justify-between">
                            <span className="text-white/50">Specialist:</span>
                            <span className="font-medium text-white">{booking.employee.name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Data:</span>
                          <span className="font-medium text-white">
                            {booking.date
                              ? new Date(booking.date).toLocaleString("ro-RO", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Durată:</span>
                          <span className="font-medium text-white">
                            {booking.service?.duration ? `${booking.service.duration} min` : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Preț:</span>
                          <span className="font-medium text-[#6366F1]">
                            {booking.service?.price?.toLocaleString("ro-RO", {
                              style: "currency",
                              currency: "RON",
                            }) || "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/10 pt-2">
                          <span className="text-white/50">Status:</span>
                          <span
                            className={`font-medium ${booking.paid ? "text-emerald-400" : "text-yellow-400"}`}
                          >
                            {booking.paid ? "Plătit" : "Neplătit"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Action buttons for the first booking */}
                  <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open the details section for editing/rescheduling
                        setSelectedBooking(tooltipBooking);
                        setTooltipBooking(null);
                        setTooltipPosition(null);
                        // Scroll to details section
                        setTimeout(() => {
                          document.getElementById("booking-details")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }, 100);
                      }}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                      title="Reprogramează rezervarea"
                    >
                      <i className="fas fa-calendar-alt mr-1" />
                      Reprogramează
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!tooltipCancellationStatus?.canCancel) {
                          return;
                        }
                        setBookingToCancel(tooltipBooking);
                        setTooltipBooking(null);
                        setTooltipPosition(null);
                      }}
                      disabled={!tooltipCancellationStatus?.canCancel}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        tooltipCancellationStatus?.canCancel
                          ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          : "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                      }`}
                      title={tooltipCancellationStatus?.canCancel ? "Anulează rezervarea" : tooltipCancellationStatus?.message}
                    >
                      <i className="fas fa-times mr-1" />
                      Anulează
                    </button>
                  </div>
                  {tooltipCancellationStatus && !tooltipCancellationStatus.canCancel && tooltipCancellationStatus.message && (
                    <p className="mt-2 text-xs text-red-300">{tooltipCancellationStatus.message}</p>
                  )}
                </div>
              );
            })()}
            {/* Arrow pointer */}
            {tooltipPosition.showAbove ? (
              <div
                className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2"
                style={{
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "8px solid rgba(255, 255, 255, 0.2)",
                }}
              />
            ) : (
              <div
                className="absolute left-1/2 bottom-full h-0 w-0 -translate-x-1/2 mb-[-1px]"
                style={{
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderBottom: "8px solid rgba(255, 255, 255, 0.2)",
                }}
              />
            )}
          </div>
        )}

        {/* Cancel Booking Confirmation Modal */}
        {bookingToCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">Confirmă anularea</h3>
                <p className="mt-2 text-sm text-white/60">
                  Ești sigur că vrei să anulezi rezervarea pentru{" "}
                  <strong className="text-white">{bookingToCancel.client?.name}</strong>?
                </p>
                <p className="mt-2 text-sm text-white/60">
                  Data:{" "}
                  <strong className="text-white">
                    {bookingToCancel.date
                      ? new Date(bookingToCancel.date).toLocaleString("ro-RO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </strong>
                </p>
                {bookingToCancel.paid && bookingToCancel.paymentMethod === "CARD" && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={refundPayment}
                        onChange={(e) => setRefundPayment(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-[#0B0E17] text-[#6366F1] focus:ring-[#6366F1]"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-white">
                          Faceți refund automat clientului
                        </span>
                        <p className="mt-1 text-xs text-white/60">
                          {refundPayment
                            ? "Clientul va primi refund-ul în contul său în 5-10 zile lucrătoare."
                            : "Dacă nu bifați, clientul poate reutiliza plata pentru o nouă rezervare."}
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBookingToCancel(null);
                    setRefundPayment(false);
                    setCancelSuccessMessage(null);
                    setCancelErrorMessage(null);
                  }}
                  disabled={cancellingId === bookingToCancel.id}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!bookingToCancel) return;
                    if (!bookingToCancelCancellationStatus?.canCancel) return;
                    setCancellingId(bookingToCancel.id);
                    setCancelSuccessMessage(null);
                    setCancelErrorMessage(null);
                    try {
                      const response = await cancelBooking(bookingToCancel.id, bookingToCancel.paid && bookingToCancel.paymentMethod === "CARD" ? refundPayment : undefined);
                      // Use message from backend response if available, otherwise use default
                      const successMessage = (response as any)?.message || 
                        (refundPayment && bookingToCancel.paid && bookingToCancel.paymentMethod === "CARD"
                          ? "Rezervarea a fost anulată și refund-ul a fost procesat."
                          : bookingToCancel.paid
                          ? "Rezervarea a fost anulată. Clientul poate reutiliza plata pentru o nouă rezervare."
                          : "Rezervarea a fost anulată cu succes.");
                      setCancelSuccessMessage(successMessage);
                      void fetchBookings();
                      // Close modal after 2 seconds
                      setTimeout(() => {
                        setBookingToCancel(null);
                        setRefundPayment(false);
                        setCancelSuccessMessage(null);
                      }, 2000);
                    } catch (error: any) {
                      // Show error message to user
                      const errorMessage = error?.response?.data?.error || error?.message || "Eroare la anularea rezervării.";
                      setCancelErrorMessage(errorMessage);
                    } finally {
                      setCancellingId(null);
                    }
                  }}
                  disabled={cancellingId === bookingToCancel.id || !bookingToCancelCancellationStatus?.canCancel}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancellingId === bookingToCancel.id ? "Se anulează..." : "Anulează rezervarea"}
                </button>
              </div>
              {bookingToCancelCancellationStatus && !bookingToCancelCancellationStatus.canCancel && bookingToCancelCancellationStatus.message && (
                <p className="mt-3 text-sm text-red-300">{bookingToCancelCancellationStatus.message}</p>
              )}
              {cancelSuccessMessage && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-sm font-medium text-emerald-300">{cancelSuccessMessage}</p>
                </div>
              )}
              {cancelErrorMessage && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm font-medium text-red-300">{cancelErrorMessage}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelErrorMessage(null);
                    }}
                    className="mt-2 text-xs text-red-400 hover:text-red-300"
                  >
                    Închide
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


        {businessBookings.length === 0 && !loading && viewType === "week" && (
          <section className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-center">
            <p className="text-sm text-white/60">
              Nu există programări pentru această săptămână. Programările vor apărea aici când clienții vor face
              rezervări.
            </p>
          </section>
        )}
      </main>

      {/* Create Booking Modal */}
      {createBookingModalOpen && businessId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Creează rezervare</h3>
                <p className="mt-1 text-sm text-white/60">
                  {selectedSlotDate
                    ? new Date(selectedSlotDate).toLocaleDateString("ro-RO", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateBookingModalOpen(false);
                  setSelectedClientId("");
                  setSelectedServiceId("");
                  setSelectedEmployeeIdForBooking("");
                  setPaid(false);
                  setClientSearchQuery("");
                  setSelectedSlotDate(null);
                  setShowNewClientForm(false);
                  setNewClientName("");
                  setNewClientEmail("");
                  setNewClientPhone("");
                  setCreateBookingError(null);
                }}
                className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedClientId || !selectedServiceId || !selectedSlotDate || !businessId) {
                  setCreateBookingError("Te rugăm să completezi toate câmpurile obligatorii.");
                  return;
                }
                if (selectedSlotTooSoon) {
                  setCreateBookingError(MIN_LEAD_MESSAGE);
                  return;
                }

                // Validate that selected service has enough consecutive slots available
                if (selectedServiceId && selectedSlotDate && business) {
                  const selectedService = business.services.find((s) => s.id === selectedServiceId);
                  if (selectedService) {
                    const serviceDurationMinutes = selectedService.duration;
                    const slotsNeeded = Math.ceil(serviceDurationMinutes / slotDurationMinutes);
                    
                    if (slotsNeeded > 1) {
                      // Check if we have enough consecutive slots
                      const slotDate = new Date(selectedSlotDate);
                      const dayIndex = weekDays.findIndex((d) => d.toDateString() === slotDate.toDateString());
                      if (dayIndex >= 0) {
                        const daySlots = slotsMatrix?.[dayIndex];
                        if (daySlots) {
                          const slotIndex = daySlots.findIndex((s) => s.iso === selectedSlotDate);
                          if (slotIndex >= 0) {
                            const consecutiveSlots = daySlots.slice(slotIndex, slotIndex + slotsNeeded);
                            const unavailableSlots = consecutiveSlots.filter(
                              (slot) => slot.status !== "available"
                            );
                            
                            if (unavailableSlots.length > 0) {
                              setCreateBookingError(
                                `Serviciul necesită ${slotsNeeded} sloturi consecutive. Unele sloturi nu sunt disponibile.`
                              );
                              return;
                            }
                          }
                        }
                      }
                    }
                  }
                }

                setCreatingBooking(true);
                setCreateBookingError(null);
                try {
                  await createBooking({
                    clientId: selectedClientId,
                    businessId,
                    serviceId: selectedServiceId,
                    employeeId: selectedEmployeeIdForBooking || undefined,
                    date: selectedSlotDate,
                    paid,
                  });
                  await fetchBookings();
                  setCreateBookingModalOpen(false);
                  setSelectedClientId("");
                  setSelectedServiceId("");
                  setSelectedEmployeeIdForBooking("");
                  setPaid(false);
                  setClientSearchQuery("");
                  setSelectedSlotDate(null);
                  setCreateBookingError(null);
                } catch (error: any) {
                  // Extract error message from backend
                  const errorMessage =
                    error?.response?.data?.error ||
                    error?.message ||
                    "Eroare la crearea rezervării. Te rugăm să încerci din nou.";
                  setCreateBookingError(errorMessage);
                } finally {
                  setCreatingBooking(false);
                }
              }}
              className="flex flex-col gap-6"
            >
              {/* Client Selection */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-white">Client *</label>
                  {!showNewClientForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewClientForm(true);
                        setSelectedClientId("");
                        setClientSearchQuery("");
                      }}
                      className="text-xs font-medium text-[#6366F1] hover:text-[#7C3AED] transition"
                    >
                      <i className="fas fa-plus mr-1" />
                      Adaugă client nou
                    </button>
                  )}
                </div>

                {showNewClientForm ? (
                  <div className="space-y-3 rounded-lg border border-white/10 bg-[#0B0E17]/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">Client nou</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewClientForm(false);
                          setNewClientName("");
                          setNewClientEmail("");
                          setNewClientPhone("");
                        }}
                        className="text-xs text-white/60 hover:text-white"
                      >
                        <i className="fas fa-times" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/70">Nume *</label>
                      <input
                        type="text"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="Nume client"
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/70">Email (opțional)</label>
                      <input
                        type="email"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                      />
                      <p className="text-xs text-white/50">Dacă nu introduci email, se va genera automat.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/70">Telefon (opțional)</label>
                      <input
                        type="tel"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                        placeholder="+40 7XX XXX XXX"
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!newClientName.trim()) {
                          return;
                        }
                        setCreatingClient(true);
                        try {
                          const { data: newClient } = await api.post<{ id: string; name: string; email: string; phone?: string | null }>(
                            "/auth/clients",
                            {
                              name: newClientName.trim(),
                              email: newClientEmail.trim() || undefined,
                              phone: newClientPhone.trim() || undefined,
                            }
                          );
                          setSelectedClientId(newClient.id);
                          setClientSearchQuery(newClient.name);
                          setShowNewClientForm(false);
                          setNewClientName("");
                          setNewClientEmail("");
                          setNewClientPhone("");
                          // Refresh clients list
                          const { data: updatedClients } = await api.get<Array<{ id: string; name: string; email: string; phone?: string | null }>>(
                            "/auth/clients"
                          );
                          setClients(updatedClients);
                        } catch (error) {
                          // Failed to create client - error handled by UI
                        } finally {
                          setCreatingClient(false);
                        }
                      }}
                      disabled={creatingClient || !newClientName.trim()}
                      className="w-full rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {creatingClient ? "Se creează..." : "Creează client"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={(e) => setClientSearchQuery(e.target.value)}
                        placeholder="Caută client după nume sau email..."
                        className="w-full rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                      {loadingClients && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <i className="fas fa-spinner fa-spin text-white/60" />
                        </div>
                      )}
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-[#0B0E17]/40 p-2">
                      {clients.length === 0 && !loadingClients && (
                        <p className="px-4 py-2 text-sm text-white/60">Nu s-au găsit clienți.</p>
                      )}
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setClientSearchQuery(client.name);
                          }}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                            selectedClientId === client.id
                              ? "border-[#6366F1] bg-[#6366F1]/20"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-white">{client.name}</p>
                              <p className="text-xs text-white/60">{client.email}</p>
                              {client.phone && <p className="text-xs text-white/60">{client.phone}</p>}
                            </div>
                            {selectedClientId === client.id && (
                              <i className="fas fa-check text-[#6366F1]" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Service Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-white">Serviciu *</label>
                <CustomSelect
                  value={selectedServiceId}
                  onChange={setSelectedServiceId}
                  options={[
                    { value: "", label: "Selectează serviciul" },
                    ...(business?.services.map((service) => ({
                      value: service.id,
                      label: `${service.name} - ${service.duration} min - ${service.price.toLocaleString("ro-RO", {
                        style: "currency",
                        currency: "RON",
                      })}`,
                    })) || []),
                  ]}
                  placeholder="Selectează serviciul"
                  required
                  size="lg"
                />
              </div>

              {/* Employee Selection (optional) - Hidden for SPORT_OUTDOOR */}
              {!isSportOutdoor && employees.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-white">Specialist (opțional)</label>
                  <CustomSelect
                    value={selectedEmployeeIdForBooking}
                    onChange={setSelectedEmployeeIdForBooking}
                    options={[
                      { value: "", label: "Fără specialist" },
                      ...employees.map((employee) => ({
                        value: employee.id,
                        label: employee.name,
                      })),
                    ]}
                    placeholder="Fără specialist"
                    size="lg"
                  />
                </div>
              )}

              {/* Error Message */}
              {createBookingError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <i className="fas fa-exclamation-circle mt-0.5 text-red-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-300">{createBookingError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateBookingError(null)}
                      className="text-red-400 hover:text-red-300 transition"
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                  setCreateBookingModalOpen(false);
                  setSelectedClientId("");
                  setSelectedServiceId("");
                  setSelectedEmployeeIdForBooking("");
                  setPaid(false);
                  setClientSearchQuery("");
                  setSelectedSlotDate(null);
                  setShowNewClientForm(false);
                  setNewClientName("");
                  setNewClientEmail("");
                  setNewClientPhone("");
                  setCreateBookingError(null);
                }}
                disabled={creatingBooking}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={
                    creatingBooking ||
                    !selectedClientId ||
                    !selectedServiceId ||
                    !selectedSlotDate ||
                    selectedSlotTooSoon
                  }
                  className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingBooking ? "Se creează..." : "Creează rezervare"}
                </button>
              </div>
              {selectedSlotTooSoon && (
                <p className="text-sm text-red-300">{MIN_LEAD_MESSAGE}</p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
