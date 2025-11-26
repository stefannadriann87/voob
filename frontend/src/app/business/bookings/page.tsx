"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "../../../components/DatePicker";
import useAuth from "../../../hooks/useAuth";
import useBookings, { Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import useApi from "../../../hooks/useApi";
import {
  getBookingCancellationStatus,
  isBookingTooSoon,
  MIN_LEAD_MESSAGE,
  MIN_BOOKING_LEAD_MS,
} from "../../../utils/bookingRules";

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

// Color palette for clients - 15 vibrant colors in a cohesive palette (red excluded to avoid confusion with cancelled bookings)
const CLIENT_COLORS = [
  { bg: "bg-blue-500/60", border: "border-blue-500/80", hover: "hover:bg-blue-500/70", shadow: "shadow-blue-500/40" },
  { bg: "bg-purple-500/60", border: "border-purple-500/80", hover: "hover:bg-purple-500/70", shadow: "shadow-purple-500/40" },
  { bg: "bg-pink-500/60", border: "border-pink-500/80", hover: "hover:bg-pink-500/70", shadow: "shadow-pink-500/40" },
  { bg: "bg-indigo-500/60", border: "border-indigo-500/80", hover: "hover:bg-indigo-500/70", shadow: "shadow-indigo-500/40" },
  { bg: "bg-cyan-500/60", border: "border-cyan-500/80", hover: "hover:bg-cyan-500/70", shadow: "shadow-cyan-500/40" },
  { bg: "bg-emerald-500/60", border: "border-emerald-500/80", hover: "hover:bg-emerald-500/70", shadow: "shadow-emerald-500/40" },
  { bg: "bg-teal-500/60", border: "border-teal-500/80", hover: "hover:bg-teal-500/70", shadow: "shadow-teal-500/40" },
  { bg: "bg-violet-500/60", border: "border-violet-500/80", hover: "hover:bg-violet-500/70", shadow: "shadow-violet-500/40" },
  { bg: "bg-fuchsia-500/60", border: "border-fuchsia-500/80", hover: "hover:bg-fuchsia-500/70", shadow: "shadow-fuchsia-500/40" },
  { bg: "bg-rose-500/60", border: "border-rose-500/80", hover: "hover:bg-rose-500/70", shadow: "shadow-rose-500/40" },
  { bg: "bg-amber-500/60", border: "border-amber-500/80", hover: "hover:bg-amber-500/70", shadow: "shadow-amber-500/40" },
  { bg: "bg-orange-500/60", border: "border-orange-500/80", hover: "hover:bg-orange-500/70", shadow: "shadow-orange-500/40" },
  { bg: "bg-lime-500/60", border: "border-lime-500/80", hover: "hover:bg-lime-500/70", shadow: "shadow-lime-500/40" },
  { bg: "bg-sky-500/60", border: "border-sky-500/80", hover: "hover:bg-sky-500/70", shadow: "shadow-sky-500/40" },
  { bg: "bg-yellow-500/60", border: "border-yellow-500/80", hover: "hover:bg-yellow-500/70", shadow: "shadow-yellow-500/40" },
];

// Simple hash function to consistently assign colors to clients
const getClientColor = (clientId: string): typeof CLIENT_COLORS[0] => {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CLIENT_COLORS.length;
  return CLIENT_COLORS[index];
};

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
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [hoveredAvailableSlot, setHoveredAvailableSlot] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [tooltipBooking, setTooltipBooking] = useState<Booking | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; showAbove: boolean } | null>(null);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(tooltipBooking.date, tooltipBooking.reminderSentAt);
  }, [tooltipBooking, bypassCancellationLimits]);
  const selectedBookingCancellationStatus = useMemo(() => {
    if (!selectedBooking) return null;
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(selectedBooking.date, selectedBooking.reminderSentAt);
  }, [selectedBooking, bypassCancellationLimits]);
  const bookingToCancelCancellationStatus = useMemo(() => {
    if (!bookingToCancel) return null;
    if (bypassCancellationLimits) return { canCancel: true };
    return getBookingCancellationStatus(bookingToCancel.date, bookingToCancel.reminderSentAt);
  }, [bookingToCancel, bypassCancellationLimits]);
  const [workingHours, setWorkingHours] = useState<any>(null);
  const [holidays, setHolidays] = useState<Array<{ id: string; startDate: string; endDate: string; reason: string | null }>>([]);

  const businessId = user?.business?.id;

  // Fetch working hours
  useEffect(() => {
    if (!businessId) return;
    const fetchWorkingHours = async () => {
      try {
        const { data } = await api.get<{ workingHours: any }>(`/business/${businessId}/working-hours`);
        setWorkingHours(data.workingHours);
      } catch (error) {
        console.error("Failed to fetch working hours:", error);
      }
    };
    void fetchWorkingHours();
  }, [businessId, api]);

  // Fetch holidays
  useEffect(() => {
    if (!businessId) return;
    const fetchHolidays = async () => {
      try {
        const { data } = await api.get<{ holidays: Array<{ id: string; startDate: string; endDate: string; reason: string | null }> }>(`/business/${businessId}/holidays`);
        setHolidays(data.holidays);
      } catch (error) {
        console.error("Failed to fetch holidays:", error);
      }
    };
    void fetchHolidays();
  }, [businessId, api]);

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
    void Promise.all([fetchBookings(), fetchBusinesses()]);
  }, [hydrated, user, fetchBookings, fetchBusinesses, router]);

  // Listen for booking created events from AI chat
  useEffect(() => {
    const handleBookingCreated = () => {
      console.log("🔄 Refreshing bookings after AI created a booking");
      void fetchBookings();
    };

    window.addEventListener("larstef:booking-created", handleBookingCreated);
    return () => {
      window.removeEventListener("larstef:booking-created", handleBookingCreated);
    };
  }, [fetchBookings]);

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
        console.error("Failed to fetch clients:", error);
        setClients([]);
      } finally {
        setLoadingClients(false);
      }
    };
    const timeoutId = setTimeout(fetchClients, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [createBookingModalOpen, clientSearchQuery, api]);
  
  // Get business with employees
  const business = useMemo(() => {
    if (!businessId) return null;
    return businesses.find((b) => b.id === businessId);
  }, [businesses, businessId]);

  // Filter bookings by business and optionally by employee
  const businessBookings = useMemo(() => {
    if (!businessId) return [];
    let filtered = bookings.filter((booking) => booking.businessId === businessId);
    
    // Filter by selected employee if one is selected
    if (selectedEmployeeId) {
      filtered = filtered.filter((booking) => booking.employeeId === selectedEmployeeId);
    }
    
    return filtered;
  }, [bookings, businessId, selectedEmployeeId]);

  // Get all employees from business, sorted by name
  const employees = useMemo(() => {
    if (!business?.employees) return [];
    return [...business.employees].sort((a, b) => a.name.localeCompare(b.name));
  }, [business?.employees]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  const slotDurationMinutes = 60;

  // Get available hours for a specific day based on working hours
  const getAvailableHoursForDay = useCallback((date: Date): string[] => {
    if (!workingHours) return HOURS; // Fallback to default hours if no working hours set
    
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[date.getDay()] as keyof typeof workingHours;
    const daySchedule = workingHours[dayName];
    
    if (!daySchedule || !daySchedule.enabled || !daySchedule.slots || daySchedule.slots.length === 0) {
      return []; // Day is disabled or has no slots
    }
    
    // Generate all hours from all slots for this day
    const availableHours: string[] = [];
    daySchedule.slots.forEach((slot: { start: string; end: string }) => {
      const [startH, startM] = slot.start.split(":").map(Number);
      const [endH, endM] = slot.end.split(":").map(Number);
      
      let currentH = startH;
      let currentM = startM;
      
      while (currentH < endH || (currentH === endH && currentM < endM)) {
        const hourStr = `${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}`;
        if (!availableHours.includes(hourStr)) {
          availableHours.push(hourStr);
        }
        
        // Move to next hour
        currentM += slotDurationMinutes;
        if (currentM >= 60) {
          currentM = 0;
          currentH += 1;
        }
      }
    });
    
    return availableHours.sort();
  }, [workingHours, slotDurationMinutes]);

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
        const isBlocked = !!blockingHoliday;

        const booking = businessBookings.find((b) => {
          const bookingStart = new Date(b.date);
          const bookingStartMs = bookingStart.getTime();
          const bookingDurationMs = (b.service?.duration ?? slotDurationMinutes) * 60 * 1000;
          const bookingEndMs = bookingStartMs + bookingDurationMs;
          const slotEndMs = slotStartMs + slotDurationMinutes * 60 * 1000;
          const sameDay = bookingStart.toDateString() === slotDate.toDateString();
          // Check if booking overlaps with this slot
          return sameDay && bookingStartMs < slotEndMs && bookingEndMs > slotStartMs;
        });

        let status: "available" | "booked" | "past" | "blocked" = "available";
        if (isPast) status = "past";
        if (isBlocked || isTooSoon) status = "blocked";
        if (booking) status = "booked";

        // Check if this is the first slot of the booking (to show details only on the first slot)
        // A slot is the first slot if the booking starts at or very close to this slot's start time
        const isFirstSlotOfBooking =
          booking &&
          Math.abs(new Date(booking.date).getTime() - slotStartMs) < 5 * 60 * 1000; // 5 minutes tolerance

        // Get client color if booking exists
        const clientColor = booking?.clientId ? getClientColor(booking.clientId) : null;

        return {
          iso,
          label: slotDate.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" }),
          status,
          booking: booking || null,
          isFirstSlot: isFirstSlotOfBooking || false,
          clientColor: clientColor || null,
          blockingHoliday: blockingHoliday || null,
        };
      });
    });
  }, [weekDays, businessBookings, getAvailableHoursForDay, holidays, slotDurationMinutes]);

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
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-white mb-2">Calendar programări</h1>
              <p className="text-xs text-white/50">
                Zilele sunt pe coloane, orele pe rânduri. Click pe o rezervare pentru detalii.
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

          {/* Employee Tabs */}
          {employees.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setSelectedEmployeeId(null)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  selectedEmployeeId === null
                    ? "bg-[#6366F1] text-white"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                Toți
              </button>
              {employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    selectedEmployeeId === employee.id
                      ? "bg-[#6366F1] text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {employee.name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-center text-sm text-white/60">
              Se încarcă programările...
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
                            "bg-red-500/20 text-white/40 border border-red-500/30 cursor-not-allowed";
                        } else if (slot.status === "booked") {
                          // Check if slot is in the past
                          const slotDate = new Date(slot.iso);
                          const now = new Date();
                          const isPast = slotDate.getTime() < now.getTime();
                          
                          if (isPast) {
                            // Past booked slots should be disabled
                            stateClasses =
                              "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed opacity-60";
                          } else {
                            // Use client-specific color if available
                            if (slot.clientColor) {
                              // Keep the same color on hover, just make it slightly brighter
                              stateClasses = `${slot.clientColor.bg} text-white border ${slot.clientColor.border} cursor-pointer transition-all duration-200`;
                            } else {
                              // Fallback to default purple if no client color
                              stateClasses =
                                "bg-[#6366F1]/50 text-white border border-[#6366F1]/70 cursor-pointer transition-all duration-200";
                            }
                          }
                        } else if (slot.status === "past") {
                          stateClasses =
                            "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed";
                        } else if (slot.status === "available") {
                          // Enhanced hover styles for available slots
                          if (isHoveredAvailable) {
                            stateClasses =
                              "bg-[#6366F1]/40 text-white border border-[#6366F1] cursor-pointer shadow-lg shadow-[#6366F1]/50 scale-[1.02] transition-all duration-200 z-10";
                          } else {
                            stateClasses =
                              "bg-[#0B0E17]/60 text-white/70 border border-white/10 hover:bg-[#6366F1]/20 hover:border-[#6366F1]/50 hover:text-white cursor-pointer transition-all duration-200";
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
                          // Use a brighter version of the client color on hover
                          stateClasses = `${slot.clientColor.bg.replace('/60', '/80')} text-white ${slot.clientColor.border.replace('/80', '/100')} border shadow-lg ${slot.clientColor.shadow}`;
                        } else if (isHoverHighlight) {
                          // Fallback hover style
                          stateClasses =
                            "bg-[#6366F1]/70 text-white border border-[#6366F1]/90 shadow-lg shadow-[#6366F1]/40";
                        }

                        const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
                          // Check if slot is in the past
                          const slotDate = new Date(slot.iso);
                          const now = new Date();
                          const isPast = slotDate.getTime() < now.getTime();
                          
                          // Only handle hover for booked slots that are not in the past
                          if (slot.status === "booked" && slot.booking && !isPast) {
                            console.log("🔵 Mouse entered booked slot:", slot.booking.id, slot.booking.client?.name, "Slot ISO:", slot.iso);
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
                                console.log("⚠️ Element or booking no longer available");
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
                              
                              console.log("🟢 Setting tooltip position:", { x, y, showAbove, bookingId: booking.id });
                              setTooltipPosition({
                                x,
                                y,
                                showAbove,
                              });
                              setTooltipBooking(booking);
                              console.log("✅ Tooltip state set, booking:", booking.client?.name);
                            }, 100);
                          }
                        };

                        const handleMouseLeave = () => {
                          console.log("Mouse left slot");
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
                              console.log("Hiding tooltip");
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
                            disabled={slot.status === "past" || slot.status === "blocked"}
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
                            className={`flex h-[52px] w-full flex-col items-center justify-center rounded-2xl px-2 text-xs font-semibold ${stateClasses}`}
                            style={{
                              cursor: slot.booking ? "pointer" : slot.status === "past" ? "not-allowed" : "pointer",
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
                            {slot.status === "booked" && slot.booking ? (
                              slot.isFirstSlot ? (
                                <>
                                  <span className="w-full truncate text-[10px]">
                                    {slot.booking.client?.name || "Client"}
                                  </span>
                                  <span className="w-full truncate text-[10px] opacity-80">
                                    {slot.booking.service?.name || "Serviciu"}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] opacity-60">Ocupat</span>
                              )
                            ) : slot.status === "blocked" ? (
                              <span className="text-[10px] opacity-60 truncate">
                                {slot.blockingHoliday?.reason || "Blocat"}
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
              console.log("🟡 Mouse entered tooltip");
              // Keep tooltip visible when hovering over it
              if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current);
                tooltipTimeoutRef.current = null;
              }
            }}
            onMouseLeave={(e) => {
              e.stopPropagation();
              console.log("🔴 Mouse left tooltip");
              // Small delay to allow clicking buttons
              setTimeout(() => {
                setTooltipBooking(null);
                setTooltipPosition(null);
              }, 300);
            }}
          >
            <div 
              className="pointer-events-auto w-80 rounded-2xl bg-[#0B0E17] p-4 shadow-2xl shadow-black/50 backdrop-blur-sm"
              style={{ 
                zIndex: 10000,
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.8), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
              }}
            >
              <div className="mb-3 border-b border-white/10 pb-3">
                <h3 className="text-sm font-semibold text-white">{tooltipBooking.client?.name || "Client"}</h3>
                <p className="mt-1 text-xs text-white/60">{tooltipBooking.client?.email || ""}</p>
                {tooltipBooking.client?.phone && (
                  <p className="mt-1 text-xs text-white/60">
                    <i className="fas fa-phone mr-1" />
                    {tooltipBooking.client.phone}
                  </p>
                )}
              </div>
              
              <div className="space-y-2 text-xs text-white/70">
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Serviciu:</span>
                  <span className="font-medium text-white">{tooltipBooking.service?.name || "—"}</span>
                </div>
                {tooltipBooking.employee && (
                  <div className="flex items-center justify-between">
                    <span className="text-white/50">Specialist:</span>
                    <span className="font-medium text-white">{tooltipBooking.employee.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Data:</span>
                  <span className="font-medium text-white">
                    {tooltipBooking.date
                      ? new Date(tooltipBooking.date).toLocaleString("ro-RO", {
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
                    {tooltipBooking.service?.duration ? `${tooltipBooking.service.duration} min` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Preț:</span>
                  <span className="font-medium text-[#6366F1]">
                    {tooltipBooking.service?.price?.toLocaleString("ro-RO", {
                      style: "currency",
                      currency: "RON",
                    }) || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-white/50">Status:</span>
                  <span
                    className={`font-medium ${tooltipBooking.paid ? "text-emerald-400" : "text-yellow-400"}`}
                  >
                    {tooltipBooking.paid ? "Plătit" : "Neplătit"}
                  </span>
                </div>
              </div>

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
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setBookingToCancel(null)}
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
                    try {
                      await cancelBooking(bookingToCancel.id);
                      setBookingToCancel(null);
                      void fetchBookings();
                    } catch (error) {
                      console.error("Cancel booking failed:", error);
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
            </div>
          </div>
        )}

        {selectedBooking && (
          <section id="booking-details" className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Detalii rezervare</h2>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg border border-white/10 px-3 py-1 text-sm text-white/60 transition hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Client</span>
                <span className="font-semibold text-white">{selectedBooking.client?.name || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Email</span>
                <span className="font-semibold text-white">{selectedBooking.client?.email || "—"}</span>
              </div>
              {selectedBooking.client?.phone && (
                <div className="flex items-center justify-between">
                  <span>Telefon</span>
                  <span className="font-semibold text-white">{selectedBooking.client.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Serviciu</span>
                <span className="font-semibold text-white">{selectedBooking.service?.name || "—"}</span>
              </div>
              {selectedBooking.employee && (
                <div className="flex items-center justify-between">
                  <span>Specialist</span>
                  <span className="font-semibold text-white">{selectedBooking.employee.name || "—"}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>Durată</span>
                <span className="font-semibold text-white">
                  {selectedBooking.service?.duration ? `${selectedBooking.service.duration} min` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Data și ora</span>
                <span className="font-semibold text-white">
                  {selectedBooking.date
                    ? new Date(selectedBooking.date).toLocaleString("ro-RO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Preț</span>
                <span className="font-semibold text-[#6366F1]">
                  {selectedBooking.service?.price?.toLocaleString("ro-RO", {
                    style: "currency",
                    currency: "RON",
                  }) || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-white/10 pt-3">
                <span>Status plată</span>
                <span
                  className={`font-semibold ${selectedBooking.paid ? "text-emerald-400" : "text-yellow-400"}`}
                >
                  {selectedBooking.paid ? "Plătit" : "Neplătit"}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedBooking) return;
                    try {
                      await updateBooking(selectedBooking.id, {
                        paid: !selectedBooking.paid,
                      });
                      void fetchBookings();
                    } catch (error) {
                      console.error("Update booking failed:", error);
                    }
                  }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Marchează {selectedBooking.paid ? "neplătit" : "plătit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedBooking || !selectedBookingCancellationStatus?.canCancel) return;
                    setBookingToCancel(selectedBooking);
                  }}
                  disabled={!selectedBookingCancellationStatus?.canCancel}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    selectedBookingCancellationStatus?.canCancel
                      ? "bg-red-500/80 text-white hover:bg-red-500"
                      : "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                  }`}
                >
                  Anulează rezervarea
                </button>
              </div>
              {selectedBookingCancellationStatus && !selectedBookingCancellationStatus.canCancel && selectedBookingCancellationStatus.message && (
                <p className="mt-2 text-sm text-red-300">{selectedBookingCancellationStatus.message}</p>
              )}
            </div>
          </section>
        )}

        {businessBookings.length === 0 && !loading && (
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
                  return;
                }
                if (selectedSlotTooSoon) {
                  return;
                }

                setCreatingBooking(true);
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
                } catch (error) {
                  console.error("Failed to create booking:", error);
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
                          console.error("Failed to create client:", error);
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
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                >
                  <option value="">Selectează serviciul</option>
                  {business?.services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {service.duration} min - {service.price.toLocaleString("ro-RO", {
                        style: "currency",
                        currency: "RON",
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employee Selection (optional) */}
              {employees.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-white">Specialist (opțional)</label>
                  <select
                    value={selectedEmployeeIdForBooking}
                    onChange={(e) => setSelectedEmployeeIdForBooking(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  >
                    <option value="">Fără specialist</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Paid Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="paid"
                  checked={paid}
                  onChange={(e) => setPaid(e.target.checked)}
                  className="h-5 w-5 rounded border-white/20 bg-[#0B0E17]/60 text-[#6366F1] focus:ring-[#6366F1]"
                />
                <label htmlFor="paid" className="text-sm font-medium text-white">
                  Rezervare plătită
                </label>
              </div>

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
