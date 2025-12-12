"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import BusinessCard from "../../../components/BusinessCard";
import ServiceCard from "../../../components/ServiceCard";
import CourtCard from "../../../components/CourtCard";
import DatePicker from "../../../components/DatePicker";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import { requiresConsentForBusiness } from "../../../constants/consentTemplates";
import useApi from "../../../hooks/useApi";
import useWorkingHours from "../../../hooks/useWorkingHours";
import useCourts from "../../../hooks/useCourts";
import { isBookingTooSoon, MIN_LEAD_MESSAGE, MIN_BOOKING_LEAD_MS } from "../../../utils/bookingRules";
import { getWeekStart, formatDayLabel, getDefaultHours } from "../../../utils/calendarUtils";
import { formatInTimezone, isPastInTimezone, toUTC } from "../../../utils/timezoneUtils";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

type PaymentMethod = "card" | "offline";

type ConsentFieldBase = {
  id: string;
  label: string;
  required?: boolean;
  helperText?: string;
};

type ConsentTemplateField =
  | (ConsentFieldBase & { type: "text" | "date"; placeholder?: string })
  | (ConsentFieldBase & { type: "textarea"; placeholder?: string })
  | (ConsentFieldBase & { type: "checkbox" });

type ConsentTemplate = {
  title: string;
  description: string;
  fields: ConsentTemplateField[];
};

// Calendar utilities importate din utils/calendarUtils

function PaymentFormComponent({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Eroare la trimiterea formularului.");
      setIsProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/client/bookings?payment=success`,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Plata a eșuat.");
      setIsProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isProcessing ? "Se procesează..." : "Plătește acum"}
      </button>
    </form>
  );
}

export default function ClientBookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hydrated } = useAuth();
  const { businesses, fetchBusinesses } = useBusiness();
  const { bookings, fetchBookings, createBooking, loading } = useBookings();
  const api = useApi();

  const [businessIdOverride, setBusinessIdOverride] = useState<string | null>(null);
  const [serviceSelections, setServiceSelections] = useState<Record<string, string>>({});
  const [courtSelections, setCourtSelections] = useState<Record<string, string>>({});
  const [sportOutdoorDuration, setSportOutdoorDuration] = useState<number>(60); // Default 60 minute pentru SPORT_OUTDOOR
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [pendingCourtId, setPendingCourtId] = useState<string | null>(null);
  const [employeeSelections, setEmployeeSelections] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const bookingTooSoon = useMemo(() => (selectedDate ? isBookingTooSoon(selectedDate) : false), [selectedDate]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("card");
  const [paymentAlreadyMade, setPaymentAlreadyMade] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [viewType, setViewType] = useState<"week" | "day">("week");
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [showEmployeePopup, setShowEmployeePopup] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentBooking, setConsentBooking] = useState<Booking | null>(null);
  const [consentTemplate, setConsentTemplate] = useState<ConsentTemplate | null>(null);
  const [consentValues, setConsentValues] = useState<Record<string, boolean | string>>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [dataPrivacyConsent, setDataPrivacyConsent] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState<"review" | "success">("review");
  const [recentBooking, setRecentBooking] = useState<Booking | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const openConsentModal = useCallback(
    async (newBooking: Booking) => {
      // Set booking first
      setConsentBooking(newBooking);
      
      // Clear any previous state
      setConsentError(null);
      setConsentTemplate(null);
      setConsentValues({});
      setDataPrivacyConsent(false);
      setConsentLoading(true);
      
      // Show modal immediately
      setShowConsentModal(true);
      
      try {
        const { data } = await api.get<{ template: ConsentTemplate }>("/consent/template");
        setConsentTemplate(data.template);
        setConsentValues(buildConsentInitialValues(data.template, newBooking));
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Nu am putut încărca formularul de consimțământ.");
        console.error("Error loading consent template:", message);
        setConsentError(message);
      } finally {
        setConsentLoading(false);
      }
    },
    [api]
  );


  const handleServiceSelection = (serviceId: string) => {
    if (!selectedBusinessId) return;
    if (selectedBusiness && selectedBusiness.employees.length > 0) {
      setPendingServiceId(serviceId);
      setShowEmployeePopup(true);
    } else {
      setServiceSelections((prev) => ({
        ...prev,
        [selectedBusinessId]: serviceId,
      }));
    }
  };

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "CLIENT") {
      // Redirect to appropriate dashboard based on role
      switch (user.role) {
        case "BUSINESS":
          router.replace("/business/dashboard");
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
    void fetchBusinesses({ scope: "linked" });
    void fetchBookings();
  }, [hydrated, user, fetchBusinesses, fetchBookings, router]);

  // Initialize from URL params (for reschedule flow)
  useEffect(() => {
    if (!hydrated || !businesses.length || initializedFromUrl) {
      return;
    }

    const urlBusinessId = searchParams.get("businessId");
    const urlServiceId = searchParams.get("serviceId");
    const urlDate = searchParams.get("date");

    if (urlBusinessId && urlServiceId && urlDate) {
      // Set business
      if (businesses.find((b) => b.id === urlBusinessId)) {
        setBusinessIdOverride(urlBusinessId);
        
        // Set service
        setServiceSelections((prev) => ({
          ...prev,
          [urlBusinessId]: urlServiceId,
        }));

        // Set week to the week containing the booking date
        const bookingDate = new Date(urlDate);
        const weekStartForDate = getWeekStart(bookingDate);
        setWeekStart(weekStartForDate);

        // Set selected date
        setSelectedDate(urlDate);

        setInitializedFromUrl(true);

        // Scroll to calendar after a delay to ensure everything is rendered
        setTimeout(() => {
          const calendarSection = document.querySelector('[data-calendar-section]');
          if (calendarSection) {
            calendarSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 800);
      }
    }
  }, [hydrated, businesses, searchParams, initializedFromUrl]);

  // Scroll to calendar section when hash is present (fallback)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#calendar" && !initializedFromUrl) {
      setTimeout(() => {
        const calendarSection = document.querySelector('[data-calendar-section]');
        if (calendarSection) {
          calendarSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 500);
    }
  }, [initializedFromUrl]);

  // Filter businesses to only show selected ones from localStorage
  const availableBusinesses = useMemo(() => {
    if (typeof window === "undefined" || user?.role !== "CLIENT") {
      return businesses;
    }
    const savedIds = localStorage.getItem("selectedBusinessIds");
    if (savedIds) {
      try {
        const ids = JSON.parse(savedIds) as string[];
        if (ids.length > 0) {
          return businesses.filter((b) => ids.includes(b.id));
        }
      } catch (error) {
        console.error("Error parsing selected business IDs:", error);
      }
    }
    return businesses;
  }, [businesses, user?.role]);

  const selectedBusinessId = businessIdOverride ?? availableBusinesses[0]?.id ?? null;
  const selectedBusiness = useMemo(() => {
    const business = availableBusinesses.find((business) => business.id === selectedBusinessId) ?? null;
    return business;
  }, [availableBusinesses, selectedBusinessId]);
  
  // Detect if business is SPORT_OUTDOOR
  const isSportOutdoor = selectedBusiness?.businessType === "SPORT_OUTDOOR";
  
  // Get courts for SPORT_OUTDOOR businesses
  const { courts, loading: courtsLoading, error: courtsError } = useCourts(isSportOutdoor ? selectedBusinessId : null);
  
  const selectedServiceId =
    !isSportOutdoor && selectedBusinessId != null ? serviceSelections[selectedBusinessId] ?? null : null;
  const selectedCourtId =
    isSportOutdoor && selectedBusinessId != null ? courtSelections[selectedBusinessId] ?? null : null;

  const selectedService = useMemo(
    () => selectedBusiness?.services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedBusiness, selectedServiceId]
  );
  
  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === selectedCourtId) ?? null,
    [courts, selectedCourtId]
  );

  const selectedEmployeeId =
    selectedBusinessId != null ? employeeSelections[selectedBusinessId] ?? null : null;

  const selectedEmployee = useMemo(
    () => selectedBusiness?.employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [selectedBusiness, selectedEmployeeId]
  );

  // Get slot duration from business, or calculate from minimum service duration, or default to 60
  // For SPORT_OUTDOOR, always use 60 minutes (1 hour)
  const slotDurationMinutes = useMemo(() => {
    if (!selectedBusiness) return 60;
    if (isSportOutdoor) return 60; // SPORT_OUTDOOR always uses 1 hour slots
    if (selectedBusiness.slotDuration !== null && selectedBusiness.slotDuration !== undefined) {
      return selectedBusiness.slotDuration;
    }
    // Calculate from minimum service duration
    // Slot duration trebuie să fie multiplu de 30 minute și nu mai mare decât durata minimă
    if (selectedBusiness.services && selectedBusiness.services.length > 0) {
      const minDuration = Math.min(...selectedBusiness.services.map((s) => s.duration));
      // Round to nearest valid slot duration (30, 60, 90, 120, etc.) - doar multipli de 30
      const validDurations = [30, 60, 90, 120, 150, 180];
      return validDurations.reduce((prev, curr) => {
        if (curr > minDuration) return prev; // Nu folosim slot duration mai mare decât durata minimă
        return Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev;
      }, 30); // Default minim 30 minute
    }
    return 60; // Default
  }, [selectedBusiness, isSportOutdoor]);

  // Use working hours hook (after selectedBusinessId and slotDurationMinutes are defined)
  const { workingHours, getAvailableHoursForDay: getAvailableHoursForDayFromHook, isBreakTime } = useWorkingHours({
    businessId: selectedBusinessId,
    employeeId: selectedEmployeeId,
    slotDurationMinutes,
  });

  // DISABLED: Automatic polling removed to prevent excessive requests
  // Real-time updates will happen only on:
  // - Manual refresh (user action)
  // - After creating/canceling a booking
  // - After page becomes visible (if needed)
  // useCalendarUpdates({
  //   enabled: false, // Disabled to prevent excessive requests
  //   interval: 60000,
  //   businessId: selectedBusinessId,
  //   onUpdate: () => {},
  // });

  // Auto-create payment intent when online payment method is selected
  useEffect(() => {
    const createPaymentIntent = async () => {
      // Only create if:
      // - Online payment method selected (not offline)
      // - All required data is present
      // - No existing clientSecret
      // - Not processing payment already
      if (
        !user ||
        !selectedBusinessId ||
        !selectedServiceId ||
        !selectedDate ||
        selectedPayment === "offline" ||
        paymentAlreadyMade ||
        clientSecret ||
        paymentProcessing ||
        bookingTooSoon
      ) {
        return;
      }

      try {
        setPaymentProcessing(true);
        const slotDate = new Date(selectedDate);
        const isoDate = slotDate.toISOString();

        const intentResponse = await api.post("/payments/create-intent", {
          businessId: selectedBusinessId,
          serviceId: selectedServiceId,
          employeeId: selectedEmployeeId || undefined,
          date: isoDate,
          paymentMethod: selectedPayment,
        });

        const { clientSecret: secret, paymentIntentId: intentId } = intentResponse.data;
        setClientSecret(secret);
        setPaymentIntentId(intentId);
      } catch (err: any) {
        console.error("Auto payment intent creation failed:", err);
        // Don't show error to user, they can retry by clicking submit
      } finally {
        setPaymentProcessing(false);
      }
    };

    // Small delay to avoid creating intent on every keystroke
    const timeoutId = setTimeout(() => {
      void createPaymentIntent();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    user,
    selectedBusinessId,
    selectedServiceId,
    selectedDate,
    selectedPayment,
    paymentAlreadyMade,
    clientSecret,
    paymentProcessing,
    bookingTooSoon,
    selectedEmployeeId,
    api,
  ]);

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

  const relevantBookings = useMemo(() => {
    if (!selectedBusinessId) return [];
    return bookings.filter((booking) => {
      const matchesBusiness = booking.businessId === selectedBusinessId;
      // If an employee is selected, only show bookings for that employee
      if (selectedEmployeeId) {
        return matchesBusiness && booking.employeeId === selectedEmployeeId;
      }
      return matchesBusiness;
    });
  }, [bookings, selectedBusinessId, selectedEmployeeId]);

  // Find the most recent cancelled paid booking for the same business
  // This allows the user to reuse payment when reprogramming after cancellation
  // Also calculates price difference for refund or additional payment
  // 
  // Use cases:
  // 1. Client cancelled a paid booking → can reuse payment for new booking
  // 2. Client cancelled multiple paid bookings → use the most recent one
  // 3. Payment already reused → don't show option
  // 4. Different business → don't show option
  const cancelledPaidBooking = useMemo(() => {
    if (!selectedBusinessId || !user) return null;
    
    // Find all cancelled, paid bookings for the same business that haven't been reused
    const eligibleBookings = bookings.filter((booking) => {
      const isSameBusiness = booking.businessId === selectedBusinessId;
      const isCancelled = booking.status === "CANCELLED";
      const isPaid = booking.paid === true;
      const isOwnBooking = booking.clientId === user.id;
      const notReused = booking.paymentReused !== true; // Payment hasn't been reused yet
      
      return isSameBusiness && isCancelled && isPaid && isOwnBooking && notReused;
    });

    if (eligibleBookings.length === 0) return null;

    // Return the most recent cancelled paid booking (by date)
    // Sort by booking date descending to get the most recent
    const mostRecent = eligibleBookings.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // Most recent first
    })[0];

    return mostRecent;
  }, [bookings, selectedBusinessId, user]);

  const hasCancelledPaidBooking = !!cancelledPaidBooking;

  // Calculate price difference between cancelled booking and new booking
  const priceDifference = useMemo(() => {
    if (!cancelledPaidBooking || !selectedService) return null;
    
    const previousPrice = cancelledPaidBooking.service?.price || 0;
    const newPrice = selectedService.price || 0;
    const difference = previousPrice - newPrice;
    
    return {
      previousPrice,
      newPrice,
      difference, // Positive means refund, negative means additional payment
    };
  }, [cancelledPaidBooking, selectedService]);

  // Pentru SPORT_OUTDOOR, folosește sportOutdoorDuration; pentru altele, durata serviciului
  const serviceDurationMinutes = isSportOutdoor 
    ? sportOutdoorDuration 
    : (selectedService?.duration ?? 60);
  const serviceDurationMs = serviceDurationMinutes * 60 * 1000;

  const focusedDate = useMemo(() => (calendarDate ? new Date(calendarDate) : null), [calendarDate]);

  // Use getAvailableHoursForDay from hook
  const getAvailableHoursForDay = getAvailableHoursForDayFromHook;

const buildConsentInitialValues = (template: ConsentTemplate, booking: Booking) => {
  const initial: Record<string, boolean | string> = {};
  template.fields.forEach((field) => {
    if (field.type === "checkbox") {
      initial[field.id] = false;
      return;
    }
    if (field.id === "patientName") {
      initial[field.id] = booking.client.name;
      return;
    }
    if (field.id === "procedure") {
      initial[field.id] = booking.service?.name || booking.court?.name || "";
      return;
    }
    initial[field.id] = "";
  });
  return initial;
};

  const slotsMatrix = useMemo(() => {
    if (!selectedServiceId) return null;

    const businessTimezone = selectedBusiness?.timezone || "Europe/Bucharest";
    const selectedStart = selectedDate ? new Date(selectedDate).getTime() : null;
    const selectedEnd = selectedStart !== null ? selectedStart + serviceDurationMs : null;
    const now = Date.now();
    const minBookingTime = now + MIN_BOOKING_LEAD_MS;

    return weekDays.map((day) => {
      const availableHours = getAvailableHoursForDay(day);
      return availableHours.map((hour: string) => {
        const [h, m] = hour.split(":").map(Number);
        const slotDate = new Date(day);
        slotDate.setHours(h, m, 0, 0);
        const slotStartMs = slotDate.getTime();
        const slotEndMs = slotStartMs + slotDurationMinutes * 60 * 1000; // Slot duration, not service duration
        const iso = slotDate.toISOString();
        // Check if past using business timezone
        const isPast = isPastInTimezone(slotDate, businessTimezone);
        const isTooSoon = !isPast && slotStartMs < minBookingTime;

        // Check if this slot is a break/pause period
        const isBreak = isBreakTime(day, hour);

        // Check if this slot is booked by any existing booking
        // A slot is booked if the booking overlaps with this slot's time range
        const isBooked = relevantBookings.some((booking) => {
          const bookingStart = new Date(booking.date);
          const bookingStartMs = bookingStart.getTime();
          // Use booking.duration if available, otherwise service.duration, otherwise default to slotDurationMinutes
          const bookingDurationMs = (booking.duration ?? booking.service?.duration ?? slotDurationMinutes) * 60 * 1000;
          const bookingEndMs = bookingStartMs + bookingDurationMs;
          const sameDay = bookingStart.toDateString() === slotDate.toDateString();
          // Check overlap: bookingStart < slotEnd && bookingEnd > slotStart
          return sameDay && bookingStartMs < slotEndMs && bookingEndMs > slotStartMs;
        });

        // Check if this slot has enough consecutive slots available for the service
        // Only check if a service is selected and it requires more than one slot
        const slotsNeeded = selectedServiceId ? Math.ceil(serviceDurationMinutes / slotDurationMinutes) : 1;
        const hasEnoughConsecutiveSlots = (() => {
          if (slotsNeeded <= 1) return true; // Single slot service, always available if not booked
          if (isBooked || isPast) return false; // Can't use booked or past slots
          
          // Find the current slot index in the available hours for this day
          const currentSlotIndex = availableHours.findIndex((h) => h === hour);
          if (currentSlotIndex === -1) return false;
          
          // Check if we have enough consecutive slots from this position
          const remainingSlots = availableHours.length - currentSlotIndex;
          if (remainingSlots < slotsNeeded) return false; // Not enough slots remaining in the day
          
          // Check each consecutive slot to see if it's available
          for (let i = 0; i < slotsNeeded; i++) {
            const nextHourIndex = currentSlotIndex + i;
            if (nextHourIndex >= availableHours.length) return false;
            
            const nextHour = availableHours[nextHourIndex];
            const [nextH, nextM] = nextHour.split(":").map(Number);
            const nextSlotDate = new Date(day);
            nextSlotDate.setHours(nextH, nextM, 0, 0);
            const nextSlotStartMs = nextSlotDate.getTime();
            const nextSlotEndMs = nextSlotStartMs + slotDurationMinutes * 60 * 1000;
            
            // Check if this consecutive slot is past
            const nextSlotIsPast = isPastInTimezone(nextSlotDate, businessTimezone);
            if (nextSlotIsPast) return false;
            
            // Check if this consecutive slot is too soon
            const nextSlotIsTooSoon = !nextSlotIsPast && nextSlotStartMs < minBookingTime;
            if (nextSlotIsTooSoon) return false;
            
            // Check if this consecutive slot is booked
            const nextSlotIsBooked = relevantBookings.some((booking) => {
              const bookingStart = new Date(booking.date);
              const bookingStartMs = bookingStart.getTime();
              const bookingDurationMs = (booking.duration ?? booking.service?.duration ?? slotDurationMinutes) * 60 * 1000;
              const bookingEndMs = bookingStartMs + bookingDurationMs;
              const sameDay = bookingStart.toDateString() === nextSlotDate.toDateString();
              return sameDay && bookingStartMs < nextSlotEndMs && bookingEndMs > nextSlotStartMs;
            });
            
            if (nextSlotIsBooked) return false;
          }
          
          return true; // All consecutive slots are available
        })();

        let status: "available" | "booked" | "past" | "selected" | "blocked" = "available";
        if (isPast) status = "past";
        if (isBooked) status = "booked";
        if (isTooSoon || isBreak) status = "blocked";
        // Block slot if it doesn't have enough consecutive slots available for the service
        if (!hasEnoughConsecutiveSlots && selectedServiceId && !isPast && !isBooked && !isTooSoon && !isBreak) {
          status = "blocked";
        }
        if (
          selectedStart !== null &&
          selectedEnd !== null &&
          slotStartMs >= selectedStart &&
          slotStartMs < selectedEnd
        ) {
          status = "selected";
        }

        // Store reason for blocking if applicable
        const blockReason = !hasEnoughConsecutiveSlots && selectedServiceId && !isPast && !isBooked && !isTooSoon
          ? `Serviciul necesită ${slotsNeeded} sloturi consecutive. Sloturile următoare nu sunt disponibile.`
          : null;

        return {
          iso,
          label: formatInTimezone(slotDate, "HH:mm", businessTimezone),
          status,
          blockReason, // Reason why slot is blocked (for tooltip)
          isBreak, // Flag to indicate if this is a break/pause period
        };
      });
    });
  }, [
    weekDays,
    selectedServiceId,
    relevantBookings,
    selectedDate,
    getAvailableHoursForDay,
    serviceDurationMs,
    serviceDurationMinutes,
    slotDurationMinutes,
    selectedBusiness?.timezone,
    isBreakTime,
  ]);

  const uniqueHours = useMemo(() => {
    const allHours = new Set<string>();
    slotsMatrix?.forEach((daySlots) => {
      daySlots.forEach((slot) => {
        const slotDate = new Date(slot.iso);
        const hourStr = `${String(slotDate.getHours()).padStart(2, "0")}:${String(slotDate.getMinutes()).padStart(2, "0")}`;
        allHours.add(hourStr);
      });
    });
    const sortedHours = Array.from(allHours).sort();
    return sortedHours.length > 0 ? sortedHours : getDefaultHours(slotDurationMinutes);
  }, [slotsMatrix]);

  const closeConfirmationModal = useCallback(() => {
    setShowConfirmationModal(false);
    setConfirmationStep("review");
    setRecentBooking(null);
    setSuccessMessage(null);
    setConfirmationError(null);
    setClientSecret(null);
    setPaymentIntentId(null);
  }, []);

  const resetBookingForm = useCallback(() => {
    setSelectedDate("");
    setServiceSelections({});
    setEmployeeSelections({});
    setBusinessIdOverride(null);
    setPaymentAlreadyMade(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setPaymentProcessing(false);
    setSelectedPayment("card");
  }, []);

  // Reset paymentAlreadyMade when business or service changes
  // because the cancelled paid booking is specific to a business/service
  useEffect(() => {
    setPaymentAlreadyMade(false);
  }, [selectedBusinessId, selectedServiceId]);

const handleConsentModalClose = () => {
  setShowConsentModal(false);
  setConsentBooking(null);
  setConsentTemplate(null);
  setConsentValues({});
  setConsentError(null);
  setConsentLoading(false);
  setConsentSubmitting(false);
  setDataPrivacyConsent(false);
};

const handleConsentSubmit = async () => {
  if (!consentBooking || !consentTemplate || !user) return;
  setConsentError(null);
  
  // Check if data privacy consent is given
  if (!dataPrivacyConsent) {
    setConsentError("Te rugăm să confirmi acordul pentru procesarea datelor personale.");
    return;
  }
  
  const missingField = consentTemplate.fields.find((field) => {
    if (!field.required) return false;
    const value = consentValues[field.id];
    if (field.type === "checkbox") {
      return !value;
    }
    return !(typeof value === "string" && value.trim().length > 0);
  });
  if (missingField) {
    setConsentError("Te rugăm să completezi toate câmpurile obligatorii.");
    return;
  }

  setConsentSubmitting(true);
  try {
    await api.post("/consent/sign", {
      bookingId: consentBooking.id,
      clientId: user.id,
      signature: null, // No signature required
      formData: consentValues,
    });
    
    // Salvează booking-ul pentru modala de succes
    const completedBooking = { ...consentBooking };
    
    // Închide modala de consent
    setShowConsentModal(false);
    setConsentTemplate(null);
    setConsentValues({});
    setDataPrivacyConsent(false);
    
    // Afișează modala de succes
    setRecentBooking(completedBooking);
    setConfirmationStep("success");
    setShowConfirmationModal(true);
    setConsentBooking(null);
    
    resetBookingForm();
    void fetchBookings();
  } catch (err) {
    const axiosError = err as AxiosError<{ error?: string }>;
    const message =
      axiosError.response?.data?.error ??
      axiosError.message ??
      (err instanceof Error ? err.message : "Nu am putut salva consimțământul.");
    setConsentError(message);
  } finally {
    setConsentSubmitting(false);
  }
};


  const handleConfirmBooking = useCallback(async () => {
    if (!user || !selectedBusinessId || !selectedDate) {
      setConfirmationError("Selectează businessul și intervalul orar.");
      return;
    }
    
    // For SPORT_OUTDOOR, require courtId; for others, require serviceId
    if (isSportOutdoor && !selectedCourtId) {
      setConfirmationError("Selectează terenul și intervalul orar.");
      return;
    }
    if (!isSportOutdoor && !selectedServiceId) {
      setConfirmationError("Selectează serviciul și intervalul orar.");
      return;
    }

    const businessTimezone = selectedBusiness?.timezone || "Europe/Bucharest";
    const slotDate = new Date(selectedDate);
    if (Number.isNaN(slotDate.getTime())) {
      setConfirmationError("Data selectată nu este validă.");
      return;
    }
    
    // Convert to UTC using business timezone
    const utcDate = toUTC(slotDate, businessTimezone);

    if (bookingTooSoon) {
      setConfirmationError(MIN_LEAD_MESSAGE);
      return;
    }

    // VALIDATION: Check that all consecutive slots needed for the service are available
    const slotsNeeded = Math.ceil(serviceDurationMinutes / slotDurationMinutes);
    const slotDateDay = slotDate.toDateString();
    const slotDateHour = slotDate.getHours();
    const slotDateMinute = slotDate.getMinutes();
    
    // Find the day in slotsMatrix
    const dayIndex = weekDays.findIndex((day) => day.toDateString() === slotDateDay);
    if (dayIndex === -1) {
      setConfirmationError("Data selectată nu este în intervalul vizibil.");
      return;
    }

    const daySlots = slotsMatrix?.[dayIndex];
    if (!daySlots) {
      setConfirmationError("Nu s-au putut încărca sloturile pentru această zi.");
      return;
    }

    // Find the starting slot
    const startingSlotIndex = daySlots.findIndex((slot) => {
      const slotDateObj = new Date(slot.iso);
      return (
        slotDateObj.getHours() === slotDateHour &&
        slotDateObj.getMinutes() === slotDateMinute
      );
    });

    if (startingSlotIndex === -1) {
      setConfirmationError("Slotul selectat nu este disponibil.");
      return;
    }

    // Check that all consecutive slots needed are available
    const slotsToCheck = daySlots.slice(startingSlotIndex, startingSlotIndex + slotsNeeded);
    const unavailableSlots = slotsToCheck.filter(
      (slot) => slot.status !== "available" && slot.status !== "selected"
    );

    if (unavailableSlots.length > 0) {
      const unavailableSlot = unavailableSlots[0];
      if (unavailableSlot.status === "booked") {
        setConfirmationError(
          `Serviciul necesită ${slotsNeeded} sloturi consecutive. Unele sloturi sunt deja ocupate.`
        );
      } else if (unavailableSlot.status === "past") {
        setConfirmationError("Nu poți rezerva în trecut.");
      } else if (unavailableSlot.status === "blocked") {
        setConfirmationError("Unele sloturi necesare sunt blocate sau prea apropiate de momentul actual.");
      } else {
        setConfirmationError(
          `Serviciul necesită ${slotsNeeded} sloturi consecutive. Unele sloturi nu sunt disponibile.`
        );
      }
      return;
    }

    const isoDate = utcDate.toISOString();
    const conflict = slotsMatrix?.some((daySlots) =>
      daySlots.some((slot) => {
        if (slot.status === "booked") {
          const slotTime = new Date(slot.iso).getTime();
          const startTime = utcDate.getTime();
          const endTime = startTime + serviceDurationMs;
          return slotTime >= startTime && slotTime < endTime;
        }
        return false;
      })
    );

    if (conflict) {
      setConfirmationError("Intervalul selectat tocmai a devenit indisponibil. Alege altă oră.");
      return;
    }

    try {
      setConfirmationError(null);
      setPaymentProcessing(true);

      if (selectedPayment === "offline" || paymentAlreadyMade) {
        // Create optimistic booking for immediate UI update
        const optimisticBookingId = `temp-${Date.now()}`;
        const optimisticBooking: Booking = {
          id: optimisticBookingId,
          clientId: user.id,
          businessId: selectedBusinessId,
          serviceId: isSportOutdoor ? null : (selectedServiceId || null),
          courtId: isSportOutdoor ? (selectedCourtId || null) : null,
          employeeId: isSportOutdoor ? null : (selectedEmployeeId || null),
          date: isoDate,
          paid: paymentAlreadyMade,
          paymentReused: paymentAlreadyMade,
          status: "CONFIRMED",
          business: selectedBusiness
            ? {
                id: selectedBusiness.id,
                name: selectedBusiness.name,
                businessType: selectedBusiness.businessType,
              }
            : { id: "", name: "", businessType: "GENERAL" },
          service: isSportOutdoor ? null : (selectedService
            ? {
                id: selectedService.id,
                name: selectedService.name,
                duration: selectedService.duration,
                price: selectedService.price,
              }
            : null),
          court: isSportOutdoor ? (selectedCourt
            ? {
                id: selectedCourt.id,
                name: selectedCourt.name,
                number: selectedCourt.number,
              }
            : null) : null,
          client: {
            id: user.id,
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || null,
          },
          employee: isSportOutdoor ? null : (selectedEmployee
            ? {
                id: selectedEmployee.id,
                name: selectedEmployee.name,
                email: selectedEmployee.email,
              }
            : null),
        };

        const booking = await createBooking(
          {
            clientId: user.id,
            businessId: selectedBusinessId,
            serviceId: isSportOutdoor ? undefined : (selectedServiceId || undefined),
            courtId: isSportOutdoor ? (selectedCourtId || undefined) : undefined,
            employeeId: isSportOutdoor ? undefined : (selectedEmployeeId || undefined),
            date: isoDate,
            duration: isSportOutdoor ? sportOutdoorDuration : undefined,
            paid: paymentAlreadyMade,
            paymentMethod: "OFFLINE",
            paymentReused: paymentAlreadyMade,
          },
          optimisticBooking
        );
        // Check if consent is required based on business type
        // Use booking.business.businessType as fallback if selectedBusiness is not available
        const businessType = selectedBusiness?.businessType ?? booking.business?.businessType;
        const needsConsent = requiresConsentForBusiness(businessType);

        // Check if consent is required - use string comparison to be safe
        const bookingStatus = String(booking.status).toUpperCase();
        const needsConsentModal = needsConsent && bookingStatus === "PENDING_CONSENT";

        // Force check: if business is MEDICAL_DENTAL and status is PENDING_CONSENT, open modal
        const isMedicalDental = businessType === "MEDICAL_DENTAL" || booking.business?.businessType === "MEDICAL_DENTAL";
        const isPendingConsent = bookingStatus === "PENDING_CONSENT" || booking.status === "PENDING_CONSENT";
        
        if (needsConsentModal || (isMedicalDental && isPendingConsent)) {
          // Close confirmation modal first
          closeConfirmationModal();
          // Small delay to ensure modal is closed before opening consent modal
          await new Promise((resolve) => setTimeout(resolve, 100));
          await openConsentModal(booking);
          return;
        }
        setRecentBooking(booking);
        setConfirmationStep("success");
        setSuccessMessage("Rezervare creată cu succes! Vei primi confirmarea pe email.");
        resetBookingForm();
        void fetchBookings();
        return;
      }

      if (!clientSecret || !paymentIntentId) {
        const intentResponse = await api.post("/payments/create-intent", {
          businessId: selectedBusinessId,
          serviceId: isSportOutdoor ? undefined : selectedServiceId,
          courtId: isSportOutdoor ? selectedCourtId : undefined,
          employeeId: isSportOutdoor ? undefined : (selectedEmployeeId || undefined),
          date: isoDate,
          duration: isSportOutdoor ? sportOutdoorDuration : undefined,
          paymentMethod: selectedPayment,
        });

        const { clientSecret: secret, paymentIntentId: intentId } = intentResponse.data;
        setClientSecret(secret);
        setPaymentIntentId(intentId);
        return;
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Nu am putut procesa rezervarea.");
      setConfirmationError(message);
    } finally {
      setPaymentProcessing(false);
    }
  }, [
    api,
    bookingTooSoon,
    clientSecret,
    closeConfirmationModal,
    createBooking,
    fetchBookings,
    isSportOutdoor,
    openConsentModal,
    paymentAlreadyMade,
    paymentIntentId,
    selectedBusiness,
    selectedBusinessId,
    selectedCourt,
    selectedCourtId,
    selectedDate,
    selectedEmployee,
    selectedEmployeeId,
    selectedPayment,
    selectedService,
    selectedServiceId,
    serviceDurationMs,
    serviceDurationMinutes,
    slotDurationMinutes,
    slotsMatrix,
    sportOutdoorDuration,
    weekDays,
    user,
  ]);

  const handlePaymentSuccess = useCallback(async () => {
    if (!paymentIntentId) return;

    try {
      const booking = await api.post("/booking/confirm", { paymentIntentId });
      // Check if consent is required based on business type
      // Use booking.business.businessType as fallback if selectedBusiness is not available
      const businessType = selectedBusiness?.businessType ?? booking.data.business?.businessType;
      const needsConsent = requiresConsentForBusiness(businessType);

      // Check if consent is required - use string comparison to be safe
      const bookingStatus = String(booking.data.status).toUpperCase();
      const needsConsentModal = needsConsent && bookingStatus === "PENDING_CONSENT";

      // Force check: if business is MEDICAL_DENTAL and status is PENDING_CONSENT, open modal
      const isMedicalDental = businessType === "MEDICAL_DENTAL" || booking.data.business?.businessType === "MEDICAL_DENTAL";
      const isPendingConsent = bookingStatus === "PENDING_CONSENT" || booking.data.status === "PENDING_CONSENT";
      
      if (needsConsentModal || (isMedicalDental && isPendingConsent)) {
        // Close confirmation modal first
        closeConfirmationModal();
        // Small delay to ensure modal is closed before opening consent modal
        await new Promise((resolve) => setTimeout(resolve, 100));
        await openConsentModal(booking.data);
        return;
      }
      setRecentBooking(booking.data);
      setConfirmationStep("success");
      setShowConfirmationModal(true);
      setSuccessMessage("Rezervare creată cu succes! Vei primi confirmarea pe email.");
      resetBookingForm();
      setClientSecret(null);
      setPaymentIntentId(null);
      void fetchBookings();
    } catch (err: any) {
      console.error("Booking confirmation failed:", err);
    }
  }, [api, closeConfirmationModal, fetchBookings, openConsentModal, paymentIntentId, resetBookingForm, selectedBusiness]);

  if (!hydrated) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Rezervări - VOOB</title>
      </Head>
      <div className="flex w-full max-w-full flex-col gap-10">
          <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-3 desktop:p-8">
            <h1 className="text-3xl font-semibold">Creează o rezervare</h1>
            <p className="mt-2 text-sm text-white/60">
              Alege businessul, serviciul și ora potrivită. Plata se poate face online sau la fața locului.
            </p>
          </section>

          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
            className="flex w-full flex-col gap-10"
          >
            <div className="flex w-full flex-col gap-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <h2 className="text-xl font-semibold">1. Alege businessul</h2>
                  {user?.role !== "CLIENT" && (
                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 px-3 py-3 desktop:px-4 desktop:py-2 text-xs font-semibold text-white/60 transition hover:bg-white/10"
                    >
                      Vezi businessurile mele
                    </button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 justify-items-start">
                  {availableBusinesses.map((business) => (
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
                  {availableBusinesses.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                      Nu ești conectat la niciun business. Scanează codul QR în{" "}
                      <span className="text-white font-semibold">Client → Scanează QR</span> pentru a începe.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold">
                  {isSportOutdoor ? "2. Alege terenul" : "2. Alege serviciul"}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 justify-items-start">
                  {isSportOutdoor ? (
                    // Display courts for SPORT_OUTDOOR
                    <>
                      {courtsLoading ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                          Se încarcă terenurile...
                        </div>
                      ) : courts.length > 0 ? (
                        courts
                          .map((court) => (
                            <CourtCard
                              key={court.id}
                              id={court.id}
                              name={court.name}
                              number={court.number}
                              pricing={court.pricing}
                              selected={court.id === selectedCourtId}
                              onSelect={(courtId) => {
                                if (selectedBusinessId != null) {
                                  // Deschide modală pentru selectarea duratei
                                  setPendingCourtId(courtId);
                                  setShowDurationModal(true);
                                }
                              }}
                            />
                          ))
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                          {courtsError ? (
                            <div className="text-red-400 mb-2">Eroare: {courtsError}</div>
                          ) : selectedBusinessId ? (
                            <>
                              Businessul selectat nu are terenuri configurate încă.
                              {process.env.NODE_ENV === "development" && (
                                <div className="mt-2 text-xs text-yellow-500">
                                  Debug: businessId={selectedBusinessId}, isSportOutdoor={isSportOutdoor ? "true" : "false"}
                                </div>
                              )}
                            </>
                          ) : (
                            "Selectează un business pentru a vedea terenurile."
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    // Display services for non-SPORT_OUTDOOR
                    <>
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
                              handleServiceSelection(serviceId);
                            }
                          }}
                        />
                      ))}
                      {selectedBusiness && selectedBusiness.services.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                          Businessul selectat nu are servicii configurate încă.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6" data-calendar-section>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">3. Alege data și ora</h2>
                    <p className="text-xs text-white/50">
                      {viewType === "week" && "Zilele sunt pe coloane, orele pe rânduri. Alege un interval disponibil din această săptămână."}
                      {viewType === "day" && "Vizualizare detaliată pentru o singură zi. Alege un interval disponibil."}
                    </p>
                    {selectedEmployee && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                        <i className="fas fa-user" />
                        <span>Specialist: <span className="font-semibold">{selectedEmployee.name}</span></span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                    {/* View Type Toggle - Mobile optimized */}
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#0B0E17]/60 p-3 overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setViewType("week")}
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
                        onClick={() => setViewType("day")}
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
                        onChange={(date) => {
                          setCalendarDate(date);
                          setSelectedDate("");
                          setHoveredSlot(null);
                          const selectedDateObj = new Date(date);
                          // In day view, set weekStart to the exact day; in week view, set to week start
                          if (viewType === "day") {
                            selectedDateObj.setHours(0, 0, 0, 0);
                            setWeekStart(selectedDateObj);
                          } else {
                            setWeekStart(getWeekStart(selectedDateObj));
                          }
                        }}
                        placeholder="Selectează data"
                        viewType={viewType}
                      />
                    </div>
                  </div>
                </div>

                {!selectedServiceId ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                    Selectează mai întâi un serviciu pentru a vedea intervalele disponibile.
                  </div>
                ) : viewType === "day" ? (
                  // Day View - O singură zi detaliată
                  <div className="space-y-4">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-semibold text-white">
                        {weekDays[0].toLocaleDateString("ro-RO", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </h3>
                    </div>
                    <div className="space-y-1 max-h-[600px] overflow-y-auto">
                      {(() => {
                        const day = weekDays[0];
                        const availableHours = getAvailableHoursForDay(day);
                        const daySlots = slotsMatrix?.[0] || [];
                        const now = Date.now();
                        
                        // Filter to show only available slots (not booked, not blocked, not past)
                        const availableSlots = availableHours
                          .map((hour: string, index: number) => {
                            const slot = daySlots[index];
                            if (!slot) return null;
                            const slotDate = new Date(slot.iso);
                            const isPast = slotDate.getTime() < now;
                            const isAvailable = slot.status === "available" && !isPast;
                            
                            if (!isAvailable) return null;
                            
                            return {
                              hour,
                              slot,
                              slotDate,
                            };
                          })
                          .filter((item): item is { hour: string; slot: typeof daySlots[0]; slotDate: Date } => item !== null);
                        
                        if (availableSlots.length === 0) {
                          return (
                            <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-center text-sm text-white/60">
                              Nu există sloturi disponibile pentru acest serviciu în această zi.
                            </div>
                          );
                        }
                        
                        return availableSlots.map(({ hour, slot, slotDate }) => (
                          <div
                            key={hour}
                            className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#0B0E17]/40 p-4 transition hover:bg-[#0B0E17]/60 cursor-pointer"
                            onClick={() => {
                              setSelectedDate(slot.iso);
                              if (serviceDurationMinutes > slotDurationMinutes) {
                                const endMs = slotDate.getTime() + serviceDurationMs;
                                setHoveredSlot(new Date(endMs).toISOString());
                              } else {
                                setHoveredSlot(null);
                              }
                              setConfirmationStep("review");
                              setRecentBooking(null);
                              setSuccessMessage(null);
                              setShowConfirmationModal(true);
                            }}
                          >
                            <div className="w-20 text-sm font-medium text-white/70">{hour}</div>
                            <div className="flex-1">
                              <div className="text-white text-sm font-medium">Disponibil</div>
                            </div>
                            <div className="text-xs text-white/50">
                              <i className="fas fa-check-circle text-emerald-400" />
                            </div>
                          </div>
                        ));
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
                        {weekDays.map((day, index) => {
                          const isFocused = focusedDate && day.toDateString() === focusedDate.toDateString();
                          return (
                            <div
                              key={`head-${index}`}
                              className={`rounded-xl px-2 py-1 text-center text-sm font-semibold ${
                                isFocused ? "bg-[#6366F1]/30 text-white" : "text-white/70"
                              }`}
                            >
                              <div>{formatDayLabel(day)}</div>
                              <div className="mt-1 text-xs text-white/40">
                                {day.toLocaleDateString("ro-RO", { month: "short" })}
                              </div>
                            </div>
                          );
                        })}

                        {uniqueHours.map((hour) => {
                          const [h, m] = hour.split(":").map(Number);
                          return (
                            <Fragment key={`row-${hour}`}>
                              {weekDays.map((day, dayIndex) => {
                                const slot = slotsMatrix?.[dayIndex]?.find((s) => {
                                  const slotDate = new Date(s.iso);
                                  return slotDate.getHours() === h && slotDate.getMinutes() === m;
                                });
                                if (!slot) {
                                  return <div key={`empty-${dayIndex}-${hour}`} className="rounded-2xl bg-[#0B0E17]/30" />;
                                }

                                const slotDate = new Date(slot.iso);
                                const slotStartMs = slotDate.getTime();
                                const hoveredStartMs = hoveredSlot ? new Date(hoveredSlot).getTime() : null;
                                const hoveredDayString = hoveredSlot ? new Date(hoveredSlot).toDateString() : null;
                                const hoveredEndMs =
                                  hoveredStartMs !== null ? hoveredStartMs + serviceDurationMs : null;
                                const isFocusedDay =
                                  focusedDate && slotDate.toDateString() === focusedDate.toDateString();

                                let stateClasses =
                                  "bg-[#0B0E17]/60 text-white/70 hover:bg-white/10 hover:scale-[1.01] border border-white/10 transition-all duration-300 ease-in-out";
                                if (slot.status === "booked") {
                                  stateClasses =
                                    "bg-red-600/30 text-red-400 border border-red-500/60 cursor-not-allowed";
                                } else if (slot.status === "past") {
                                  stateClasses =
                                    "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed";
                                } else if (slot.status === "blocked") {
                                  // Different styling for blocked slots (consecutive slots unavailable)
                                  const isBlockedDueToConsecutive = selectedServiceId && serviceDurationMinutes > slotDurationMinutes;
                                  stateClasses = isBlockedDueToConsecutive
                                    ? "bg-[#0B0E17]/20 text-white/35 border border-orange-500/30 cursor-not-allowed opacity-60"
                                    : "bg-[#0B0E17]/20 text-white/35 border border-white/5 cursor-not-allowed";
                                } else if (slot.status === "selected") {
                                  stateClasses =
                                    "bg-gradient-to-r from-indigo-500/70 via-indigo-500/60 to-indigo-500/50 text-white border border-[#6366F1]/70 shadow-lg shadow-[#6366F1]/40 scale-[1.02] transition-all duration-300 ease-out animate-pulse";
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
                                    disabled={
                                      slot.status === "booked" || slot.status === "past" || slot.status === "blocked"
                                    }
                                    onClick={() => {
                                      const slotDate = new Date(slot.iso);
                                      setSelectedDate(slot.iso);
                                      if (serviceDurationMinutes > slotDurationMinutes) {
                                        const endMs = slotDate.getTime() + serviceDurationMs;
                                        setHoveredSlot(new Date(endMs).toISOString());
                                      } else {
                                        setHoveredSlot(null);
                                      }
                                    setConfirmationStep("review");
                                    setRecentBooking(null);
                                    setSuccessMessage(null);
                                    setShowConfirmationModal(true);
                                    }}
                                    onMouseEnter={() => {
                                      if (slot.status === "available") {
                                        setHoveredSlot(slot.iso);
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredSlot((prev) => (prev === slot.iso ? null : prev));
                                    }}
                                    className={`flex h-[44px] w-full items-center justify-center rounded-2xl px-3 text-xs font-semibold transition ${
                                      isFocusedDay && slot.status === "available"
                                        ? `${stateClasses} border-[#6366F1]/40 bg-[#6366F1]/10`
                                        : stateClasses
                                    }`}
                                    style={{
                                      cursor:
                                        slot.status === "booked" || slot.status === "past" || slot.status === "blocked"
                                          ? "not-allowed"
                                          : "pointer",
                                    }}
                                    title={
                                      slot.status === "blocked" && slot.isBreak
                                        ? "Pauză"
                                        : slot.status === "blocked" && slot.blockReason
                                          ? slot.blockReason
                                          : slot.status === "blocked"
                                            ? "Slot indisponibil"
                                            : undefined
                                    }
                                  >
                                    {slot.status === "booked" ? "Ocupat" : slot.status === "blocked" && slot.isBreak ? (
                                      <>
                                        <i className="fas fa-coffee mr-1" />
                                        Pauză
                                      </>
                                    ) : slot.label}
                                  </button>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/70">
              <h3 className="text-lg font-semibold text-white">4. Confirmă rezervarea</h3>
              <p className="mt-2">
                După ce alegi un interval disponibil, se deschide automat o fereastră de confirmare unde vezi
                rezumatul, alegi metoda de plată și finalizezi rezervarea.
              </p>
              <p className="mt-2 text-white/60">
                Dacă ai plătit deja (reprogramare), poți bifa opțiunea „Plată efectuată” în fereastra de confirmare.
              </p>
            </section>
          </form>
      </div>

      {showConfirmationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6" onClick={closeConfirmationModal}>
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0E17] p-6 text-white shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">Confirmare rezervare</p>
                <h3 className="text-2xl font-semibold text-white">
                  {confirmationStep === "success" ? "Rezervare confirmată" : "Revizuiește și confirmă"}
                </h3>
                <p className="mt-1 text-sm text-white/60">
                  {confirmationStep === "success"
                    ? "Rezervarea ta a fost confirmată cu succes! Vei primi notificare pe email și SMS."
                    : "Verifică detaliile, alege metoda de plată și finalizează rezervarea."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeConfirmationModal}
                className="rounded-full border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Închide fereastra de confirmare"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {confirmationStep === "review" ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="order-2 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <h4 className="text-lg font-semibold">Rezumat rezervare</h4>
                  <div className="mt-4 flex flex-col gap-3 text-sm text-white/70">
                    <div className="flex items-center justify-between">
                      <span>Business</span>
                      <span className="font-semibold text-white">{selectedBusiness?.name ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Serviciu</span>
                      <span className="font-semibold text-white">{selectedService?.name ?? "—"}</span>
                    </div>
                    {selectedEmployee && (
                      <div className="flex items-center justify-between">
                        <span>Specialist</span>
                        <span className="font-semibold text-white">{selectedEmployee.name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span>Data &amp; ora</span>
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
                      <span>Durată</span>
                      <span className="font-semibold text-white">{selectedService?.duration ?? 60} min</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/10 pt-3">
                      <span>Total</span>
                      <span className="text-xl font-semibold text-[#6366F1]">
                        {selectedService?.price?.toLocaleString("ro-RO", {
                          style: "currency",
                          currency: "RON",
                        }) ?? "—"}
                      </span>
                    </div>
                    {priceDifference && priceDifference.difference !== 0 && (
                      <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-3 text-xs text-white/70">
                        <div className="flex items-center justify-between">
                          <span>Anterior</span>
                          <span>
                            {priceDifference.previousPrice.toLocaleString("ro-RO", {
                              style: "currency",
                              currency: "RON",
                            })}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span>Acum</span>
                          <span>
                            {priceDifference.newPrice.toLocaleString("ro-RO", {
                              style: "currency",
                              currency: "RON",
                            })}
                          </span>
                        </div>
                        <div
                          className={`mt-2 flex items-center justify-between border-t border-white/10 pt-2 ${
                            priceDifference.difference > 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          <span>{priceDifference.difference > 0 ? "Diferență de returnat" : "Diferență de plată"}</span>
                          <span>
                            {priceDifference.difference > 0 ? "+" : ""}
                            {priceDifference.difference.toLocaleString("ro-RO", {
                              style: "currency",
                              currency: "RON",
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="order-1 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold mb-4">Metoda de plată</h4>
                      {hasCancelledPaidBooking && (
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                            paymentAlreadyMade
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/80 hover:bg-emerald-500/15"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={paymentAlreadyMade}
                            onChange={(event) => {
                              setPaymentAlreadyMade(event.target.checked);
                              if (event.target.checked) {
                                setSelectedPayment("offline");
                              }
                            }}
                            className="h-3.5 w-3.5 rounded border-white/20 bg-transparent text-emerald-500 focus:ring-emerald-500"
                          />
                          Plată efectuată
                        </label>
                      )}
                    </div>
                    {paymentAlreadyMade && cancelledPaidBooking && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200/90">
                        <p className="font-semibold mb-1">Reutilizezi plata de la rezervarea anulată</p>
                        <p className="text-emerald-200/70">
                          Suma plătită anterior:{" "}
                          {cancelledPaidBooking.service?.price?.toLocaleString("ro-RO", {
                            style: "currency",
                            currency: "RON",
                          })}
                        </p>
                        {priceDifference && priceDifference.difference !== 0 && (
                          <p className="mt-2 font-semibold">
                            {priceDifference.difference > 0 ? (
                              <span className="text-emerald-300">
                                Vei primi înapoi: {Math.abs(priceDifference.difference).toLocaleString("ro-RO", {
                                  style: "currency",
                                  currency: "RON",
                                })}
                              </span>
                            ) : (
                              <span className="text-amber-300">
                                Trebuie să plătești în plus: {Math.abs(priceDifference.difference).toLocaleString("ro-RO", {
                                  style: "currency",
                                  currency: "RON",
                                })}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className={`mt-4 grid gap-4 ${
                      paymentAlreadyMade ? "pointer-events-none opacity-40" : "opacity-100"
                    }`}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { value: "card", label: "Card", icon: "fas fa-credit-card" },
                        { value: "offline", label: "Plată la locație", icon: "fas fa-wallet" },
                      ].map((method) => (
                        <label
                          key={method.value}
                          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition ${
                            selectedPayment === method.value
                              ? "border-[#6366F1] bg-[#6366F1]/15 text-white"
                              : "border-white/10 bg-[#0B0E17]/40 text-white/70 hover:border-[#6366F1]/50 hover:bg-[#6366F1]/10"
                          }`}
                        >
                          <input
                            type="radio"
                            name="payment"
                            value={method.value}
                            checked={selectedPayment === method.value}
                            onChange={() => setSelectedPayment(method.value as PaymentMethod)}
                            className="hidden"
                          />
                          {method.icon && <i className={`${method.icon} text-base`} />}
                          <span>{method.label}</span>
                        </label>
                      ))}
                    </div>

                    {selectedPayment === "offline" && (
                      <p className="text-xs text-white/60">
                        Confirmi rezervarea acum și achiți la locație. Vei primi toate detaliile pe email/SMS.
                      </p>
                    )}
                  </div>

                  {!paymentAlreadyMade && paymentProcessing && !clientSecret && selectedPayment !== "offline" && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Se pregătește formularul de plată...
                    </div>
                  )}

                  {!paymentAlreadyMade && clientSecret && selectedPayment !== "offline" && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <Elements
                        stripe={stripePromise}
                        options={{
                          clientSecret,
                          appearance: {
                            theme: "night",
                            variables: {
                              colorPrimary: "#6366F1",
                              colorBackground: "#0B0E17",
                              colorText: "#ffffff",
                              colorDanger: "#ef4444",
                              fontFamily: "system-ui, sans-serif",
                              spacingUnit: "4px",
                              borderRadius: "12px",
                            },
                          },
                        }}
                      >
                        <PaymentFormComponent onSuccess={handlePaymentSuccess} />
                      </Elements>
                    </div>
                  )}

                </div>
              </div>
            ) : null}

            {confirmationError && (
              <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {confirmationError}
              </p>
            )}

            {confirmationStep === "review" ? (
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeConfirmationModal}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Renunță
                </button>
                {(selectedPayment === "offline" || paymentAlreadyMade) && (
                  <button
                    type="button"
                    onClick={() => void handleConfirmBooking()}
                    disabled={paymentProcessing || bookingTooSoon}
                    className="rounded-2xl bg-[#6366F1] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paymentProcessing ? "Se procesează..." : "Confirmă rezervarea"}
                  </button>
                )}
                {!paymentAlreadyMade &&
                  selectedPayment !== "offline" &&
                  (!clientSecret || !paymentIntentId) && (
                    <button
                      type="button"
                      onClick={() => void handleConfirmBooking()}
                      disabled={
                        paymentProcessing ||
                        bookingTooSoon ||
                        !selectedBusinessId ||
                        !selectedServiceId ||
                        !selectedDate
                      }
                      className="rounded-2xl border border-[#6366F1] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6366F1]/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {paymentProcessing ? "Se pregătește..." : "Pregătește plata"}
                    </button>
                  )}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                {/* Success Header */}
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                    <i className="fas fa-check text-2xl" />
                  </div>
                  <h4 className="mt-4 text-2xl font-semibold text-white">Totul este gata!</h4>
                  <p className="mt-2 text-sm text-white/70">Rezervarea ta a fost confirmată cu succes. Vei primi notificare pe email și SMS.</p>
                </div>
                
                {/* Booking Details */}
                {recentBooking && (
                  <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-white/60">
                          <i className="fas fa-building w-4 text-center" />
                          Business
                        </span>
                        <span className="font-semibold text-white">{recentBooking.business?.name ?? "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-white/60">
                          <i className="fas fa-spa w-4 text-center" />
                          Serviciu
                        </span>
                        <span className="font-semibold text-white">{recentBooking.service?.name ?? "—"}</span>
                      </div>
                      {recentBooking.employee && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-white/60">
                            <i className="fas fa-user-md w-4 text-center" />
                            Specialist
                          </span>
                          <span className="font-semibold text-white">{recentBooking.employee.name}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-white/60">
                          <i className="fas fa-clock w-4 text-center" />
                          Data și ora
                        </span>
                        <span className="font-semibold text-white">
                          {new Date(recentBooking.date).toLocaleString("ro-RO", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <span className="flex items-center gap-2 text-white/60">
                          <i className="fas fa-receipt w-4 text-center" />
                          Total plătit
                        </span>
                        <span className="text-lg font-bold text-emerald-400">
                          {recentBooking.service?.price?.toLocaleString("ro-RO", {
                            style: "currency",
                            currency: "RON",
                          }) ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={closeConfirmationModal}
                    className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    Închide
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeConfirmationModal();
                      router.push("/client/dashboard");
                    }}
                    className="rounded-2xl bg-[#6366F1] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                  >
                    <i className="fas fa-calendar-check mr-2" />
                    Vezi rezervările mele
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showConsentModal && consentBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6" onClick={handleConsentModalClose}>
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50">Consimțământ digital</p>
                <h3 className="text-2xl font-semibold text-white">{consentBooking.business.name}</h3>
                <p className="mt-1 text-sm text-white/60">
                  {consentBooking.service ? "Serviciu" : "Teren"}: <strong>{consentBooking.service?.name || consentBooking.court?.name || "N/A"}</strong> •{" "}
                  {new Date(consentBooking.date).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleConsentModalClose}
                className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            {consentLoading && (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                Se încarcă formularul de consimțământ...
              </p>
            )}

            {!consentLoading && consentTemplate ? (
              <div className="flex flex-col gap-6">
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-white/70">{consentTemplate.description}</p>
                  <div className="mt-4 flex flex-col gap-4">
                    {consentTemplate.fields.map((field) => {
                      // Check if field is required and not filled
                      const isFieldInvalid = field.required && (() => {
                        const value = consentValues[field.id];
                        if (field.type === "checkbox") {
                          return !value;
                        }
                        return !(typeof value === "string" && value.trim().length > 0);
                      })();

                      if (field.type === "checkbox") {
                        return (
                          <label key={field.id} className="flex items-start gap-3 text-sm text-white/80">
                            <input
                              type="checkbox"
                              checked={Boolean(consentValues[field.id])}
                              onChange={(event) => {
                                setConsentError(null);
                                setConsentValues((prev) => ({ ...prev, [field.id]: event.target.checked }));
                              }}
                              className={`mt-1 h-4 w-4 rounded text-[#6366F1] focus:ring-[#6366F1] ${
                                isFieldInvalid ? "border-red-500" : "border-white/30"
                              }`}
                            />
                            <span>
                              {field.label}
                              {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                              {"helperText" in field && field.helperText && (
                                <p className="text-xs text-white/50">{field.helperText}</p>
                              )}
                            </span>
                          </label>
                        );
                      }

                      if (field.type === "textarea") {
                        return (
                          <label key={field.id} className="flex flex-col gap-2 text-sm text-white/80">
                            <span>
                              {field.label}
                              {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                            </span>
                            <textarea
                              rows={4}
                              placeholder={"placeholder" in field ? field.placeholder : undefined}
                              value={(consentValues[field.id] as string) ?? ""}
                              onChange={(event) => {
                                setConsentError(null);
                                setConsentValues((prev) => ({ ...prev, [field.id]: event.target.value }));
                              }}
                              className={`rounded-2xl border bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition ${
                                isFieldInvalid
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-white/10 focus:border-[#6366F1]"
                              }`}
                            />
                          </label>
                        );
                      }

                      return (
                        <label key={field.id} className="flex flex-col gap-2 text-sm text-white/80">
                          <span>
                            {field.label}
                            {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                          </span>
                          <input
                            type={field.type === "date" ? "date" : "text"}
                            placeholder={"placeholder" in field ? field.placeholder : undefined}
                            value={(consentValues[field.id] as string) ?? ""}
                            onChange={(event) => {
                            setConsentError(null);
                              setConsentValues((prev) => ({ ...prev, [field.id]: event.target.value }));
                            }}
                            className={`rounded-2xl border bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert ${
                              isFieldInvalid
                                ? "border-red-500 focus:border-red-500"
                                : "border-white/10 focus:border-[#6366F1]"
                            }`}
                            style={
                              field.type === "date"
                                ? {
                                    colorScheme: "white",
                                  }
                                : undefined
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className="flex items-start gap-3 text-sm text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dataPrivacyConsent}
                      onChange={(event) => {
                        setDataPrivacyConsent(event.target.checked);
                        setConsentError(null);
                      }}
                      className="mt-1 h-4 w-4 rounded border-white/30 text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <span>
                      Confirm că sunt de acord cu procesarea datelor mele personale conform acestui formular de consimțământ și a politicii de confidențialitate.
                      <span className="ml-1 text-[#F59E0B]">*</span>
                    </span>
                  </label>
                </div>

                {consentError && (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                    {consentError}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleConsentModalClose}
                    className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    Renunță
                  </button>
                  <button
                    type="button"
                    disabled={consentSubmitting || consentLoading || !dataPrivacyConsent}
                    onClick={handleConsentSubmit}
                    className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {consentSubmitting ? "Se trimite..." : "Confirmă consimțământul"}
                  </button>
                </div>
              </div>
            ) : null}
            {!consentLoading && !consentTemplate && (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {consentError ?? "Nu am putut încărca formularul de consimțământ. Încearcă din nou."}
              </p>
            )}
          </div>
        </div>
      )}

      {showEmployeePopup && selectedBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowEmployeePopup(false)}>
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">Alege specialistul</h3>
                <p className="mt-2 text-sm text-white/60">
                  Selectează la cine vrei să faci programarea pentru acest serviciu
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEmployeePopup(false);
                  setPendingServiceId(null);
                }}
                className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {selectedBusiness.employees.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => {
                    if (selectedBusinessId != null && pendingServiceId) {
                      // Set employee selection
                      setEmployeeSelections((prev) => ({
                        ...prev,
                        [selectedBusinessId]: employee.id,
                      }));
                      // Set service selection
                      setServiceSelections((prev) => ({
                        ...prev,
                        [selectedBusinessId]: pendingServiceId,
                      }));
                      // Close popup
                      setShowEmployeePopup(false);
                      setPendingServiceId(null);
                    }
                  }}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:border-[#6366F1]/60 hover:bg-[#6366F1]/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-white/10">
                      {employee.avatar ? (
                        <img src={employee.avatar} alt={employee.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-emerald-500/20 text-emerald-400">
                          <i className="fas fa-user" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{employee.name}</h3>
                      <p className="text-xs text-white/60">{employee.email}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Duration Selection Modal for SPORT_OUTDOOR */}
      {showDurationModal && pendingCourtId && selectedBusinessId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => {
          setShowDurationModal(false);
          setPendingCourtId(null);
        }}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">Selectează durata rezervării</h3>
                <p className="mt-2 text-sm text-white/60">
                  Câte ore vrei să rezervi terenul?
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDurationModal(false);
                  setPendingCourtId(null);
                }}
                className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((hours) => {
                const durationMinutes = hours * 60;
                return (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      // Set court selection
                      setCourtSelections((prev) => ({
                        ...prev,
                        [selectedBusinessId]: pendingCourtId,
                      }));
                      // Set duration
                      setSportOutdoorDuration(durationMinutes);
                      // Close modal
                      setShowDurationModal(false);
                      setPendingCourtId(null);
                    }}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                      sportOutdoorDuration === durationMinutes
                        ? "border-[#6366F1] bg-[#6366F1]/20 text-white"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {hours === 1 ? "1 oră" : `${hours} ore`}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-white/50 text-center">
              Minim 1 oră, maxim 10 ore
            </p>
          </div>
        </div>
      )}
    </>
  );
}
