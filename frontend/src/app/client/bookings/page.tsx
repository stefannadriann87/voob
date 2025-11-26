"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import BusinessCard from "../../../components/BusinessCard";
import ServiceCard from "../../../components/ServiceCard";
import DatePicker from "../../../components/DatePicker";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import { requiresConsentForBusiness } from "../../../constants/consentTemplates";
import useApi from "../../../hooks/useApi";
import { isBookingTooSoon, MIN_LEAD_MESSAGE, MIN_BOOKING_LEAD_MS } from "../../../utils/bookingRules";
import { HOURS, getWeekStart, formatDayLabel } from "../../../utils/calendarUtils";

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
  const [workingHours, setWorkingHours] = useState<any>(null);
  const openConsentModal = useCallback(
    async (newBooking: Booking) => {
      console.log("=== openConsentModal CALLED ===", {
        id: newBooking.id,
        businessId: newBooking.businessId,
        businessName: newBooking.business?.name,
        businessType: newBooking.business?.businessType,
        status: newBooking.status,
      });
      
      // Set booking first
      setConsentBooking(newBooking);
      
      // Clear any previous state
      setConsentError(null);
      setConsentTemplate(null);
      setConsentValues({});
      setDataPrivacyConsent(false);
      setConsentLoading(true);
      
      // Show modal immediately
      console.log("Setting showConsentModal to true");
      setShowConsentModal(true);
      
      try {
        const { data } = await api.get<{ template: ConsentTemplate }>("/consent/template");
        console.log("Consent template loaded:", data.template);
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
        console.log("Consent modal loading finished, showConsentModal should be:", true);
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
    if (business) {
      console.log("Selected business updated:", {
        id: business.id,
        name: business.name,
        businessType: business.businessType,
        hasBusinessType: !!business.businessType,
      });
    }
    return business;
  }, [availableBusinesses, selectedBusinessId]);
  const selectedServiceId =
    selectedBusinessId != null ? serviceSelections[selectedBusinessId] ?? null : null;

  const selectedService = useMemo(
    () => selectedBusiness?.services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedBusiness, selectedServiceId]
  );

  const selectedEmployeeId =
    selectedBusinessId != null ? employeeSelections[selectedBusinessId] ?? null : null;

  const selectedEmployee = useMemo(
    () => selectedBusiness?.employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [selectedBusiness, selectedEmployeeId]
  );

  // Fetch working hours when business is selected
  useEffect(() => {
    if (!selectedBusinessId) {
      setWorkingHours(null);
      return;
    }
    const fetchWorkingHours = async () => {
      try {
        const { data } = await api.get<{ workingHours: any }>(`/business/${selectedBusinessId}/working-hours`);
        setWorkingHours(data.workingHours);
      } catch (error: any) {
        // Network errors or API errors - fallback to default hours
        console.error("Failed to fetch working hours:", error?.message || error);
        // Set to null on error, will fallback to default hours in getAvailableHoursForDay
        setWorkingHours(null);
      }
    };
    void fetchWorkingHours();
  }, [selectedBusinessId, api]);

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

  const serviceDurationMinutes = selectedService?.duration ?? 60;
  const slotDurationMinutes = 60;
  const serviceDurationMs = serviceDurationMinutes * 60 * 1000;

  const focusedDate = useMemo(() => (calendarDate ? new Date(calendarDate) : null), [calendarDate]);

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
      initial[field.id] = booking.service.name;
      return;
    }
    initial[field.id] = "";
  });
  return initial;
};

  const slotsMatrix = useMemo(() => {
    if (!selectedServiceId) return null;

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
        const slotEndMs = slotStartMs + serviceDurationMs;
        const iso = slotDate.toISOString();
        const isPast = slotStartMs < now;
        const isTooSoon = !isPast && slotStartMs < minBookingTime;

        const isBooked = relevantBookings.some((booking) => {
          const bookingStart = new Date(booking.date);
          const bookingStartMs = bookingStart.getTime();
          const bookingDurationMs = (booking.service?.duration ?? slotDurationMinutes) * 60 * 1000;
          const bookingEndMs = bookingStartMs + bookingDurationMs;
          const sameDay = bookingStart.toDateString() === slotDate.toDateString();
          return sameDay && bookingStartMs < slotEndMs && bookingEndMs > slotStartMs;
        });

        let status: "available" | "booked" | "past" | "selected" | "blocked" = "available";
        if (isPast) status = "past";
        if (isBooked) status = "booked";
        if (isTooSoon) status = "blocked";
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
    getAvailableHoursForDay,
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
    return sortedHours.length > 0 ? sortedHours : HOURS;
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
    setShowConsentModal(false);
    setConsentBooking(null);
    setConsentTemplate(null);
    setConsentValues({});
    setDataPrivacyConsent(false);
    setSuccessMessage("Consimțământ semnat cu succes! Rezervarea a fost confirmată.");
    setTimeout(() => setSuccessMessage(null), 2000);
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
    if (!user || !selectedBusinessId || !selectedServiceId || !selectedDate) {
      setConfirmationError("Selectează businessul, serviciul și intervalul orar.");
      return;
    }

    const slotDate = new Date(selectedDate);
    if (Number.isNaN(slotDate.getTime())) {
      setConfirmationError("Data selectată nu este validă.");
      return;
    }

    if (bookingTooSoon) {
      setConfirmationError(MIN_LEAD_MESSAGE);
      return;
    }

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
      setConfirmationError("Intervalul selectat tocmai a devenit indisponibil. Alege altă oră.");
      return;
    }

    try {
      setConfirmationError(null);
      setPaymentProcessing(true);

      if (selectedPayment === "offline" || paymentAlreadyMade) {
        const booking = await createBooking({
          clientId: user.id,
          businessId: selectedBusinessId,
          serviceId: selectedServiceId,
          employeeId: selectedEmployeeId || undefined,
          date: isoDate,
          paid: paymentAlreadyMade,
          paymentMethod: "OFFLINE",
          paymentReused: paymentAlreadyMade,
        });
        // Check if consent is required based on business type
        // Use booking.business.businessType as fallback if selectedBusiness is not available
        const businessType = selectedBusiness?.businessType ?? booking.business?.businessType;
        const needsConsent = requiresConsentForBusiness(businessType);

        // Debug logging - detailed check
        console.log("=== CONSENT CHECK (OFFLINE) ===", {
          selectedBusinessId: selectedBusiness?.id,
          selectedBusinessName: selectedBusiness?.name,
          selectedBusinessType: selectedBusiness?.businessType,
          selectedBusinessTypeType: typeof selectedBusiness?.businessType,
          bookingBusinessId: booking.business?.id,
          bookingBusinessName: booking.business?.name,
          bookingBusinessType: booking.business?.businessType,
          bookingBusinessTypeType: typeof booking.business?.businessType,
          finalBusinessType: businessType,
          finalBusinessTypeType: typeof businessType,
          needsConsent,
          bookingStatus: booking.status,
          bookingStatusType: typeof booking.status,
          willOpenModal: needsConsent && booking.status === "PENDING_CONSENT",
        });

        // Check if consent is required - use string comparison to be safe
        const bookingStatus = String(booking.status).toUpperCase();
        const needsConsentModal = needsConsent && bookingStatus === "PENDING_CONSENT";
        
        console.log("=== FINAL CONSENT CHECK (OFFLINE) ===", {
          needsConsent,
          bookingStatus: booking.status,
          bookingStatusNormalized: bookingStatus,
          needsConsentModal,
          willOpenModal: needsConsentModal,
          CONSENT_REQUIRED_TYPES: ["STOMATOLOGIE", "OFTALMOLOGIE", "PSIHOLOGIE", "TERAPIE"],
          isStomatologie: businessType === "STOMATOLOGIE",
        });

        // Force check: if business is STOMATOLOGIE and status is PENDING_CONSENT, open modal
        const isStomatologie = businessType === "STOMATOLOGIE" || booking.business?.businessType === "STOMATOLOGIE";
        const isPendingConsent = bookingStatus === "PENDING_CONSENT" || booking.status === "PENDING_CONSENT";
        
        if (needsConsentModal || (isStomatologie && isPendingConsent)) {
          console.log("Opening consent modal for booking:", booking.id, {
            needsConsentModal,
            isStomatologie,
            isPendingConsent,
            forceOpen: !needsConsentModal && isStomatologie && isPendingConsent,
          });
          // Close confirmation modal first
          closeConfirmationModal();
          // Small delay to ensure modal is closed before opening consent modal
          await new Promise((resolve) => setTimeout(resolve, 100));
          await openConsentModal(booking);
          return;
        } else {
          console.log("NOT opening consent modal. Reason:", {
            needsConsent,
            bookingStatus: booking.status,
            bookingStatusNormalized: bookingStatus,
            conditionMet: needsConsentModal,
            isStomatologie,
            isPendingConsent,
            businessType,
          });
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
          serviceId: selectedServiceId,
          employeeId: selectedEmployeeId || undefined,
          date: isoDate,
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
    openConsentModal,
    paymentAlreadyMade,
    paymentIntentId,
    selectedBusiness,
    selectedBusinessId,
    selectedDate,
    selectedEmployeeId,
    selectedPayment,
    selectedServiceId,
    serviceDurationMs,
    slotsMatrix,
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

      // Debug logging - detailed check
      console.log("=== CONSENT CHECK (STRIPE) ===", {
        selectedBusinessId: selectedBusiness?.id,
        selectedBusinessName: selectedBusiness?.name,
        selectedBusinessType: selectedBusiness?.businessType,
        selectedBusinessTypeType: typeof selectedBusiness?.businessType,
        bookingBusinessId: booking.data.business?.id,
        bookingBusinessName: booking.data.business?.name,
        bookingBusinessType: booking.data.business?.businessType,
        bookingBusinessTypeType: typeof booking.data.business?.businessType,
        finalBusinessType: businessType,
        finalBusinessTypeType: typeof businessType,
        needsConsent,
        bookingStatus: booking.data.status,
        bookingStatusType: typeof booking.data.status,
        willOpenModal: needsConsent && booking.data.status === "PENDING_CONSENT",
      });

      // Check if consent is required - use string comparison to be safe
      const bookingStatus = String(booking.data.status).toUpperCase();
      const needsConsentModal = needsConsent && bookingStatus === "PENDING_CONSENT";
      
      console.log("=== FINAL CONSENT CHECK (STRIPE) ===", {
        needsConsent,
        bookingStatus: booking.data.status,
        bookingStatusNormalized: bookingStatus,
        needsConsentModal,
        willOpenModal: needsConsentModal,
        CONSENT_REQUIRED_TYPES: ["STOMATOLOGIE", "OFTALMOLOGIE", "PSIHOLOGIE", "TERAPIE"],
        isStomatologie: businessType === "STOMATOLOGIE",
      });

      // Force check: if business is STOMATOLOGIE and status is PENDING_CONSENT, open modal
      const isStomatologie = businessType === "STOMATOLOGIE" || booking.data.business?.businessType === "STOMATOLOGIE";
      const isPendingConsent = bookingStatus === "PENDING_CONSENT" || booking.data.status === "PENDING_CONSENT";
      
      if (needsConsentModal || (isStomatologie && isPendingConsent)) {
        console.log("Opening consent modal for booking:", booking.data.id, {
          needsConsentModal,
          isStomatologie,
          isPendingConsent,
          forceOpen: !needsConsentModal && isStomatologie && isPendingConsent,
        });
        // Close confirmation modal first
        closeConfirmationModal();
        // Small delay to ensure modal is closed before opening consent modal
        await new Promise((resolve) => setTimeout(resolve, 100));
        await openConsentModal(booking.data);
        return;
      } else {
        console.log("NOT opening consent modal. Reason:", {
          needsConsent,
          bookingStatus: booking.data.status,
          bookingStatusNormalized: bookingStatus,
          conditionMet: needsConsentModal,
          isStomatologie,
          isPendingConsent,
          businessType,
        });
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
        <title>Rezervări - LARSTEF</title>
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
                <h2 className="text-xl font-semibold">2. Alege serviciul</h2>
                <div className="grid gap-4 sm:grid-cols-2 justify-items-start">
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
                </div>
              </div>

              <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6" data-calendar-section>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">3. Alege data și ora</h2>
                    <p className="text-xs text-white/50">
                      Zilele sunt pe coloane, orele pe rânduri. Alege un interval disponibil din această săptămână.
                    </p>
                    {selectedEmployee && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                        <i className="fas fa-user" />
                        <span>Specialist: <span className="font-semibold">{selectedEmployee.name}</span></span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
                    {/* Calendar picker */}
                    <div className="hidden sm:block">
                      <DatePicker
                        value={calendarDate}
                        onChange={(date) => {
                          setCalendarDate(date);
                          setSelectedDate("");
                          setHoveredSlot(null);
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
                                  "bg-[#0B0E17]/60 text-white/70 hover:bg-white/10 border border-white/10";
                                if (slot.status === "booked") {
                                  stateClasses =
                                    "bg-red-500/20 text-red-300 border border-red-400/40 cursor-not-allowed";
                                } else if (slot.status === "past") {
                                  stateClasses =
                                    "bg-[#0B0E17]/15 text-white/30 border border-white/5 cursor-not-allowed";
                                } else if (slot.status === "blocked") {
                                  stateClasses =
                                    "bg-[#0B0E17]/20 text-white/35 border border-white/5 cursor-not-allowed";
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
                                    className={`flex h-[52px] w-full items-center justify-center rounded-2xl px-3 text-xs font-semibold transition ${
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
                                  >
                                    {slot.status === "booked" ? "Ocupat" : slot.label}
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
                    ? "Plata a fost procesată, iar rezervarea este confirmată. Vei primi email și SMS."
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
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <i className="fas fa-check text-2xl" />
                </div>
                <h4 className="mt-4 text-2xl font-semibold text-white">Totul este gata!</h4>
                <p className="mt-2 text-sm text-white/70">{successMessage ?? "Rezervarea și plata au fost procesate cu succes."}</p>
                {recentBooking && (
                  <div className="mt-6 flex flex-col gap-2 text-sm text-white/70">
                    <div className="flex items-center justify-center gap-2">
                      <i className="fas fa-building text-white/50" />
                      <span>{recentBooking.business.name}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <i className="fas fa-spa text-white/50" />
                      <span>{recentBooking.service?.name}</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <i className="fas fa-clock text-white/50" />
                      <span>{new Date(recentBooking.date).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

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
              <div className="mt-6 flex flex-wrap justify-end gap-3">
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
                    router.push("/client/bookings");
                  }}
                  className="rounded-2xl bg-[#6366F1] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                >
                  Vezi rezervările
                </button>
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
                  Serviciu: <strong>{consentBooking.service.name}</strong> •{" "}
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
              <button
                type="button"
                onClick={() => {
                  if (selectedBusinessId != null && pendingServiceId) {
                    // Clear employee selection (optional)
                    setEmployeeSelections((prev) => {
                      const next = { ...prev };
                      delete next[selectedBusinessId];
                      return next;
                    });
                    // Set service selection without employee
                    setServiceSelections((prev) => ({
                      ...prev,
                      [selectedBusinessId]: pendingServiceId,
                    }));
                    // Close popup
                    setShowEmployeePopup(false);
                    setPendingServiceId(null);
                  }
                }}
                className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-4 text-left transition hover:border-[#6366F1]/60 hover:bg-[#6366F1]/10"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/60">
                    <i className="fas fa-question" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Nu contează</h3>
                    <p className="text-xs text-white/60">Orice specialist disponibil</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
