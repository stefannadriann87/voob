"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import BookingCard from "../../../components/BookingCard";
import useAuth from "../../../hooks/useAuth";
import useBookings, { type Booking } from "../../../hooks/useBookings";
import useBusiness from "../../../hooks/useBusiness";
import useApi from "../../../hooks/useApi";
import useCourts from "../../../hooks/useCourts";
import { logger } from "../../../lib/logger";

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

export default function BusinessDashboardPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { bookings, fetchBookings, cancelBooking } = useBookings();
  const { businesses, fetchBusinesses, addService, updateService, deleteService, addEmployee, updateEmployee, deleteEmployee } = useBusiness();
  const api = useApi();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  // CRITICAL FIX (TICKET-018): Removed manual state - using React Hook Form instead
  const [serviceFeedback, setServiceFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeeSpecialization, setEmployeeSpecialization] = useState("");
  const [employeeCanManageOwnServices, setEmployeeCanManageOwnServices] = useState(false); // TICKET-044: Control flag pentru self-service
  const [employeeFeedback, setEmployeeFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // Employee services management
  const [employeeServices, setEmployeeServices] = useState<Array<{ id: string; name: string; duration: number; price: number; notes?: string | null; isAssociated: boolean }>>([]);
  const [loadingEmployeeServices, setLoadingEmployeeServices] = useState(false);
  const [updatingEmployeeService, setUpdatingEmployeeService] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  
  // Court management state
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [courtName, setCourtName] = useState("");
  const [courtNumber, setCourtNumber] = useState("");
  const [courtFeedback, setCourtFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [courtToDelete, setCourtToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingCourtId, setDeletingCourtId] = useState<string | null>(null);
  
  // Court pricing state
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [selectedCourtForPricing, setSelectedCourtForPricing] = useState<string | null>(null);
  const [morningPrice, setMorningPrice] = useState("");
  const [morningStartHour, setMorningStartHour] = useState("8");
  const [morningEndHour, setMorningEndHour] = useState("12");
  const [afternoonPrice, setAfternoonPrice] = useState("");
  const [afternoonStartHour, setAfternoonStartHour] = useState("12");
  const [afternoonEndHour, setAfternoonEndHour] = useState("18");
  const [nightPrice, setNightPrice] = useState("");
  const [nightStartHour, setNightStartHour] = useState("18");
  const [nightEndHour, setNightEndHour] = useState("22");
  const [pricingFeedback, setPricingFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingPricing, setSavingPricing] = useState(false);

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

  // Detect if business is SPORT_OUTDOOR
  const isSportOutdoor = business?.businessType === "SPORT_OUTDOOR";
  const { courts, loading: courtsLoading, refreshCourts } = useCourts(isSportOutdoor ? business?.id ?? null : null);

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
        logger.error("Cancel booking error:", error);
      } finally {
        setCancellingBookingId(null);
      }
    },
    [cancelBooking, fetchBookings]
  );

  // CRITICAL FIX (TICKET-018): React Hook Form schema for service form
  const serviceFormSchema = z.object({
    name: z.string().min(1, "Numele serviciului este obligatoriu").max(100, "Numele este prea lung"),
    duration: z.number()
      .min(30, "Durata minimă este 30 minute")
      .max(480, "Durata maximă este 480 minute")
      .refine(
        (val) => val % 30 === 0,
        "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)"
      ),
    price: z.number().min(0, "Prețul trebuie să fie pozitiv").max(100000, "Prețul este prea mare"),
    notes: z.string().max(500, "Notițele sunt prea lungi").optional().or(z.literal("")),
  });

  type ServiceFormData = z.infer<typeof serviceFormSchema>;

  const {
    register: registerService,
    handleSubmit: handleSubmitServiceForm,
    reset: resetServiceForm,
    formState: { errors: serviceFormErrors, isSubmitting: isSubmittingService },
    setValue: setServiceValue,
    watch: watchService,
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      duration: 30,
      price: 150,
      notes: "",
    },
    mode: "onChange", // Validate on change for better UX
  });

  const handleOpenServiceModal = useCallback((serviceId?: string) => {
    if (serviceId && business) {
      // Editing existing service
      const service = business.services.find((s) => s.id === serviceId);
      if (service) {
        setEditingServiceId(serviceId);
        resetServiceForm({
          name: service.name,
          duration: service.duration,
          price: service.price,
          notes: service.notes || "",
        });
      }
    } else {
      // Adding new service
      setEditingServiceId(null);
      resetServiceForm({
        name: "",
        duration: 30,
        price: 150,
        notes: "",
      });
    }
    setServiceFeedback(null);
    setServiceModalOpen(true);
  }, [business, resetServiceForm]);

  const handleCloseServiceModal = useCallback(() => {
    setServiceModalOpen(false);
    setEditingServiceId(null);
    resetServiceForm({
      name: "",
      duration: 30,
      price: 150,
      notes: "",
    });
    setServiceFeedback(null);
  }, [resetServiceForm]);

  // CRITICAL FIX (TICKET-018): React Hook Form submit handler
  const onSubmitService = useCallback(async (data: ServiceFormData) => {
    if (!business?.id) return;

    try {
      if (editingServiceId) {
        // Update existing service
        await updateService(
          business.id,
          editingServiceId,
          data.name.trim(),
          data.duration,
          data.price,
          data.notes?.trim() || undefined
        );
        setServiceFeedback({ type: "success", message: "Serviciu actualizat cu succes." });
      } else {
        // Add new service
        await addService({
          businessId: business.id,
          name: data.name.trim(),
          duration: data.duration,
          price: data.price,
          notes: data.notes?.trim() || undefined,
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
      logger.error("Service operation failed:", error);
      setServiceFeedback({ 
        type: "error", 
        message: editingServiceId 
          ? "Nu am putut actualiza serviciul. Încearcă din nou." 
          : "Nu am putut adăuga serviciul. Încearcă din nou." 
      });
    }
  }, [business, editingServiceId, updateService, addService, fetchBusinesses, handleCloseServiceModal]);

  const handleDeleteService = useCallback(async () => {
    if (!serviceToDelete || !business?.id) return;
    
    setDeletingServiceId(serviceToDelete.id);
    try {
      await deleteService(business.id, serviceToDelete.id);
      setServiceToDelete(null);
      // Refresh businesses to get updated data
      void fetchBusinesses();
    } catch (error) {
      logger.error("Delete service failed:", error);
      setServiceToDelete(null);
    } finally {
      setDeletingServiceId(null);
    }
  }, [serviceToDelete, business?.id, deleteService, fetchBusinesses]);

  // Toggle employee service association
  const handleToggleEmployeeService = useCallback(
    async (serviceId: string, isAssociated: boolean) => {
      // CRITICAL FIX: Validate serviceId before making request
      if (!serviceId || serviceId === "undefined" || !editingEmployeeId || !business?.id || updatingEmployeeService) {
        console.error("handleToggleEmployeeService: Invalid parameters", {
          serviceId,
          editingEmployeeId,
          businessId: business?.id,
          updatingEmployeeService,
        });
        return;
      }

      setUpdatingEmployeeService(serviceId);
      
      // CRITICAL FIX: Optimistically update UI immediately to prevent flickering
      // Update local state BEFORE API call for instant feedback
      setEmployeeServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, isAssociated: !isAssociated } : s))
      );
      
      try {
        if (isAssociated) {
          // Disassociate
          await api.delete(`/business/${business.id}/employees/${editingEmployeeId}/services/${serviceId}`);
        } else {
          // Associate
          await api.post(`/business/${business.id}/employees/${editingEmployeeId}/services/${serviceId}`);
        }
        
        // CRITICAL FIX: Don't call fetchBusinesses() here - it causes flickering
        // The local state is already updated optimistically above
        // We'll refresh business data only when modal closes or employee is saved
      } catch (error) {
        // CRITICAL FIX: Revert optimistic update on error
        setEmployeeServices((prev) =>
          prev.map((s) => (s.id === serviceId ? { ...s, isAssociated: isAssociated } : s))
        );
        
        logger.error("Failed to toggle employee service:", error);
        setEmployeeFeedback({
          type: "error",
          message: "Eroare la actualizarea serviciilor employee-ului.",
        });
      } finally {
        setUpdatingEmployeeService(null);
      }
    },
    [editingEmployeeId, business?.id, updatingEmployeeService, api]
  );

  // Fetch employee services and canManageOwnServices when editing employee
  useEffect(() => {
    if (!employeeModalOpen || !editingEmployeeId || !business?.id) {
      setEmployeeServices([]);
      setEmployeeCanManageOwnServices(false); // TICKET-044: Reset flag
      return;
    }

    const fetchEmployeeData = async () => {
      // CRITICAL FIX: Validate editingEmployeeId before making request
      if (!editingEmployeeId || !business?.id || !business?.services) {
        setLoadingEmployeeServices(false);
        return;
      }
      
      setLoadingEmployeeServices(true);
      try {
        // CRITICAL FIX: Use business.services as source of truth, only fetch association status from API
        // This ensures consistency - the services shown in employee modal are the same as in Services section
        const { data: servicesData } = await api.get<{ services: Array<{ id: string; name: string; duration: number; price: number; notes?: string | null; isAssociated: boolean }> }>(
          `/business/${business.id}/employees/${editingEmployeeId}/services`
        );
        
        // Create a map of association status from API response
        const associationMap = new Map<string, boolean>();
        servicesData.services.forEach((service) => {
          associationMap.set(service.id, service.isAssociated);
        });
        
        // Use business.services as source of truth, add isAssociated from API
        const servicesWithAssociation = business.services.map((service) => ({
          id: service.id,
          name: service.name,
          duration: service.duration,
          price: service.price,
          notes: service.notes,
          isAssociated: associationMap.get(service.id) || false,
        }));
        
        setEmployeeServices(servicesWithAssociation);
        
        // CRITICAL FIX: Fetch employee data to get canManageOwnServices flag
        const employee = business.employees?.find((e) => e.id === editingEmployeeId);
        if (employee && employee.canManageOwnServices !== undefined) {
          setEmployeeCanManageOwnServices(employee.canManageOwnServices);
        } else {
          // Fallback: fetch from API if not in business.employees
          try {
            const { data: employeeData } = await api.get(`/business/${business.id}/employees/${editingEmployeeId}`);
            if (employeeData?.canManageOwnServices !== undefined) {
              setEmployeeCanManageOwnServices(employeeData.canManageOwnServices);
            }
          } catch (err) {
            // Ignore error, use default false
            logger.warn("Could not fetch employee canManageOwnServices flag:", err);
          }
        }
      } catch (error: any) {
        logger.error("Failed to fetch employee services:", error);
        // If 404, employee doesn't exist - reset editing state and close modal
        if (error?.response?.status === 404) {
          setEditingEmployeeId(null);
          setEmployeeModalOpen(false);
          setEmployeeServices([]);
          setEmployeeCanManageOwnServices(false);
          return;
        }
        // If other error, show all services as not associated (backward compatibility)
        // CRITICAL FIX: Use business.services as source of truth
        if (business?.services) {
          setEmployeeServices(
            business.services.map((s) => ({ 
              id: s.id, 
              name: s.name, 
              duration: s.duration,
              price: s.price,
              notes: s.notes,
              isAssociated: false 
            }))
          );
        }
      } finally {
        setLoadingEmployeeServices(false);
      }
    };

    void fetchEmployeeData();
  }, [employeeModalOpen, editingEmployeeId, business?.id, business?.services, business?.employees, api]);

  // Court management handlers
  const handleOpenCourtModal = useCallback((courtId?: string) => {
    if (courtId && courts.length > 0) {
      const court = courts.find((c) => c.id === courtId);
      if (court) {
        setEditingCourtId(courtId);
        setCourtName(court.name);
        setCourtNumber(court.number.toString());
      }
    } else {
      setEditingCourtId(null);
      setCourtName("");
      setCourtNumber("");
    }
    setCourtFeedback(null);
    setCourtModalOpen(true);
  }, [courts]);

  const handleCloseCourtModal = useCallback(() => {
    setCourtModalOpen(false);
    setEditingCourtId(null);
    setCourtName("");
    setCourtNumber("");
    setCourtFeedback(null);
  }, []);

  const handleSubmitCourt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business?.id) return;

    const number = Number(courtNumber);

    if (!courtName.trim() || Number.isNaN(number) || number <= 0) {
      setCourtFeedback({ type: "error", message: "Completează un nume și un număr valid pentru teren." });
      return;
    }

    try {
      if (editingCourtId) {
        // Update existing court
        await api.put(`/business/${business.id}/courts/${editingCourtId}`, {
          name: courtName.trim(),
          number,
        });
        setCourtFeedback({ type: "success", message: "Teren actualizat cu succes." });
      } else {
        // Add new court
        await api.post(`/business/${business.id}/courts`, {
          name: courtName.trim(),
          number,
        });
        setCourtFeedback({ type: "success", message: "Teren adăugat cu succes." });
      }
      
      // Close modal after a short delay to show success message
      setTimeout(() => {
        handleCloseCourtModal();
        // Refresh courts
        refreshCourts();
      }, 1000);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || "Eroare la operațiunea cu terenul.";
      setCourtFeedback({ 
        type: "error", 
        message: editingCourtId 
          ? `Nu am putut actualiza terenul: ${errorMessage}` 
          : `Nu am putut adăuga terenul: ${errorMessage}` 
      });
    }
  };

  const handleDeleteCourt = useCallback(async () => {
    if (!courtToDelete || !business?.id) return;
    
    setDeletingCourtId(courtToDelete.id);
    try {
      await api.delete(`/business/${business.id}/courts/${courtToDelete.id}`);
      setCourtToDelete(null);
      // Refresh courts
      refreshCourts();
    } catch (error: any) {
      logger.error("Delete court failed:", error);
      setCourtToDelete(null);
    } finally {
      setDeletingCourtId(null);
    }
  }, [courtToDelete, business?.id, api]);

  const handleOpenPricingModal = useCallback((courtId: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (court && court.pricing) {
      setSelectedCourtForPricing(courtId);
      
      // Set pricing values from existing pricing
      const morning = court.pricing.find((p) => p.timeSlot === "MORNING");
      const afternoon = court.pricing.find((p) => p.timeSlot === "AFTERNOON");
      const night = court.pricing.find((p) => p.timeSlot === "NIGHT");
      
      if (morning) {
        setMorningPrice(morning.price.toString());
        setMorningStartHour(morning.startHour.toString());
        setMorningEndHour(morning.endHour.toString());
      } else {
        setMorningPrice("");
        setMorningStartHour("8");
        setMorningEndHour("12");
      }
      
      if (afternoon) {
        setAfternoonPrice(afternoon.price.toString());
        setAfternoonStartHour(afternoon.startHour.toString());
        setAfternoonEndHour(afternoon.endHour.toString());
      } else {
        setAfternoonPrice("");
        setAfternoonStartHour("12");
        setAfternoonEndHour("18");
      }
      
      if (night) {
        setNightPrice(night.price.toString());
        setNightStartHour(night.startHour.toString());
        setNightEndHour(night.endHour.toString());
      } else {
        setNightPrice("");
        setNightStartHour("18");
        setNightEndHour("22");
      }
    } else {
      // New pricing - set defaults
      setSelectedCourtForPricing(courtId);
      setMorningPrice("");
      setMorningStartHour("8");
      setMorningEndHour("12");
      setAfternoonPrice("");
      setAfternoonStartHour("12");
      setAfternoonEndHour("18");
      setNightPrice("");
      setNightStartHour("18");
      setNightEndHour("22");
    }
    setPricingFeedback(null);
    setPricingModalOpen(true);
  }, [courts]);

  const handleClosePricingModal = useCallback(() => {
    setPricingModalOpen(false);
    setSelectedCourtForPricing(null);
    setPricingFeedback(null);
  }, []);

  const handleSubmitPricing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business?.id || !selectedCourtForPricing) return;

    const morningPriceNum = Number(morningPrice);
    const afternoonPriceNum = Number(afternoonPrice);
    const nightPriceNum = Number(nightPrice);
    const morningStart = Number(morningStartHour);
    const morningEnd = Number(morningEndHour);
    const afternoonStart = Number(afternoonStartHour);
    const afternoonEnd = Number(afternoonEndHour);
    const nightStart = Number(nightStartHour);
    const nightEnd = Number(nightEndHour);

    if (
      Number.isNaN(morningPriceNum) || morningPriceNum < 0 ||
      Number.isNaN(afternoonPriceNum) || afternoonPriceNum < 0 ||
      Number.isNaN(nightPriceNum) || nightPriceNum < 0 ||
      Number.isNaN(morningStart) || morningStart < 0 || morningStart > 23 ||
      Number.isNaN(morningEnd) || morningEnd < 0 || morningEnd > 23 ||
      Number.isNaN(afternoonStart) || afternoonStart < 0 || afternoonStart > 23 ||
      Number.isNaN(afternoonEnd) || afternoonEnd < 0 || afternoonEnd > 23 ||
      Number.isNaN(nightStart) || nightStart < 0 || nightStart > 23 ||
      Number.isNaN(nightEnd) || nightEnd < 0 || nightEnd > 23 ||
      morningStart >= morningEnd ||
      afternoonStart >= afternoonEnd ||
      nightStart >= nightEnd
    ) {
      setPricingFeedback({ type: "error", message: "Completează prețuri valide și intervale de ore corecte (0-23, start < end)." });
      return;
    }

    setSavingPricing(true);
    setPricingFeedback(null);
    
    try {
      await api.put(`/business/${business.id}/courts/${selectedCourtForPricing}/pricing`, {
        pricing: [
          {
            timeSlot: "MORNING",
            price: morningPriceNum,
            startHour: morningStart,
            endHour: morningEnd,
          },
          {
            timeSlot: "AFTERNOON",
            price: afternoonPriceNum,
            startHour: afternoonStart,
            endHour: afternoonEnd,
          },
          {
            timeSlot: "NIGHT",
            price: nightPriceNum,
            startHour: nightStart,
            endHour: nightEnd,
          },
        ],
      });
      
      setPricingFeedback({ type: "success", message: "Tarife actualizate cu succes." });
      
      setTimeout(() => {
        handleClosePricingModal();
        refreshCourts();
      }, 1000);
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || "Eroare la actualizarea tarifelor.";
      setPricingFeedback({ type: "error", message: errorMessage });
    } finally {
      setSavingPricing(false);
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
    if (user.role === "CLIENT") {
      router.replace("/client/dashboard");
      return;
    }
    void Promise.all([fetchBookings(), fetchBusinesses()]);
  }, [hydrated, user, router, fetchBookings, fetchBusinesses]);

  useEffect(() => {
    if (!hydrated || !business?.id || user?.role === "CLIENT") {
      setInsights(null);
      return;
    }

    let isActive = true;
    setInsightsLoading(true);
    setInsightsError(null);

    api
      .get<BusinessInsights>(`/business/${business.id}/insights`)
      .then((response) => {
        if (!isActive) return;
        setInsights(response.data);
      })
      .catch((error: any) => {
        if (!isActive) return;
        const message =
          error?.response?.data?.error ??
          error?.message ??
          "Nu am putut încărca insight-urile.";
        setInsightsError(message);
      })
      .finally(() => {
        if (isActive) {
          setInsightsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [api, business?.id, hydrated, user?.role]);

  if (!hydrated) {
    return null;
  }
  if (!user || user.role === "CLIENT") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Business Dashboard - VOOB</title>
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
                  .reduce((acc, booking) => {
                    // For SPORT_OUTDOOR, we need to calculate price from court pricing
                    // For now, use service price if available, otherwise 0
                    const price = booking.service?.price || 0;
                    return acc + price;
                  }, 0)
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
                    serviceName={booking.service?.name ?? booking.court?.name ?? "Rezervare"}
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

        {/* Services Section - Hidden for SPORT_OUTDOOR */}
        {!isSportOutdoor && (
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
            {business?.services.map((service, index) => (
              <div
                key={service.id || `service-${index}`}
                className="group relative rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-6 transition hover:border-[#6366F1]/60 hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                    <p className="mt-2 text-sm text-white/60">
                      Durată: {service.duration} min
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#6366F1]">
                      {service.price != null
                        ? service.price.toLocaleString("ro-RO", {
                            style: "currency",
                            currency: "RON",
                          })
                        : "Preț neconfigurat"}
                    </p>
                    {service.notes && (
                      <p className="mt-2 text-sm text-pink-400">{service.notes}</p>
                    )}
                  </div>
                  <div className="ml-4 flex gap-2 mobile:opacity-100 desktop:opacity-0 transition-opacity group-hover:opacity-100">
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
        )}

        {/* Employees Section - Hidden for SPORT_OUTDOOR */}
        {!isSportOutdoor && (
          <section id="employees" className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Specialiști</h2>
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
              Adaugă specialist
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
                  <div className="ml-4 flex gap-2 mobile:opacity-100 desktop:opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEmployeeId(employee.id);
                        setEmployeeName(employee.name);
                        setEmployeeEmail(employee.email);
                        setEmployeePhone(employee.phone || "");
                        setEmployeeSpecialization(employee.specialization || "");
                        // CRITICAL FIX: Load canManageOwnServices flag
                        setEmployeeCanManageOwnServices(employee.canManageOwnServices || false);
                        setEmployeeFeedback(null);
                        setEmployeeModalOpen(true);
                      }}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-[#6366F1]/20 hover:text-[#6366F1]"
                      title="Editează specialist"
                    >
                      <i className="fas fa-edit text-sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmployeeToDelete({ id: employee.id, name: employee.name })}
                      className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-red-500/20 hover:text-red-400"
                      title="Șterge specialist"
                    >
                      <i className="fas fa-trash text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(!business?.employees || business.employees.length === 0) && (
              <div className="col-span-full rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-white/60">
                Nu ai specialiști adăugați. Adaugă specialiști pentru a gestiona programările.
              </div>
            )}
          </div>
        </section>
        )}

        {/* Courts Section - Only for SPORT_OUTDOOR */}
        {isSportOutdoor && (
          <section id="courts" className="flex flex-col gap-6 mobile:px-0 py-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Terenuri</h2>
              <button
                type="button"
                onClick={() => handleOpenCourtModal()}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Adaugă teren
              </button>
            </div>
            <div className="grid gap-2 desktop:gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courtsLoading ? (
                <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                  Se încarcă terenurile...
                </div>
              ) : courts.length > 0 ? (
                courts
                  .filter((court) => court.isActive)
                  .map((court) => {
                    const priceRange = court.pricing && court.pricing.length > 0
                      ? {
                          min: Math.min(...court.pricing.map((p) => p.price)),
                          max: Math.max(...court.pricing.map((p) => p.price)),
                        }
                      : null;
                    
                    return (
                      <div
                        key={court.id}
                        className="group relative rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-6 transition hover:border-[#6366F1]/60 hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-white">{court.name}</h3>
                            <p className="mt-2 text-sm text-white/60">
                              Teren {court.number}
                            </p>
                            {priceRange ? (
                              <p className="mt-1 text-sm font-medium text-[#6366F1]">
                                {priceRange.min === priceRange.max
                                  ? `${priceRange.min.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}/oră`
                                  : `${priceRange.min.toLocaleString("ro-RO", { style: "currency", currency: "RON" })} - ${priceRange.max.toLocaleString("ro-RO", { style: "currency", currency: "RON" })}/oră`}
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-white/40">
                                Tarife neconfigurate
                              </p>
                            )}
                          </div>
                          <div className="ml-4 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleOpenPricingModal(court.id)}
                              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-[#6366F1]/20 hover:text-[#6366F1]"
                              title="Configurează tarife"
                            >
                              <i className="fas fa-euro-sign text-sm" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCourtModal(court.id)}
                              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-[#6366F1]/20 hover:text-[#6366F1]"
                              title="Editează teren"
                            >
                              <i className="fas fa-edit text-sm" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCourtToDelete({ id: court.id, name: court.name })}
                              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-red-500/20 hover:text-red-400"
                              title="Șterge teren"
                            >
                              <i className="fas fa-trash text-sm" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
                  Adaugă primul teren pentru a-l face disponibil clienților tăi.
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

              {/* CRITICAL FIX (TICKET-018): React Hook Form implementation */}
              <form onSubmit={handleSubmitServiceForm(onSubmitService)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Nume serviciu *</span>
                    <input
                      {...registerService("name")}
                      placeholder="Ex: Tuns modern"
                      className={`rounded-xl border bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition ${
                        serviceFormErrors.name
                          ? "border-red-500/50 focus:border-red-500"
                          : "border-white/10 focus:border-[#6366F1]"
                      }`}
                    />
                    {serviceFormErrors.name && (
                      <span className="text-xs text-red-400">{serviceFormErrors.name.message}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Durată (minute) *</span>
                    <div className="relative">
                      <input
                        type="number"
                        min={30}
                        max={480}
                        step={30}
                        {...registerService("duration", { 
                          valueAsNumber: true,
                          onChange: (e) => {
                            // CRITICAL FIX: Round to nearest multiple of 30 when user types
                            const value = Number(e.target.value);
                            if (!isNaN(value) && value > 0) {
                              const rounded = Math.round(value / 30) * 30;
                              const finalValue = Math.max(30, Math.min(480, rounded)); // Clamp between 30 and 480
                              // Only update if value changed to avoid infinite loops
                              if (finalValue !== watchService("duration")) {
                                setServiceValue("duration", finalValue, { shouldValidate: true });
                              }
                            }
                          },
                        })}
                        placeholder="30, 60, 90, 120..."
                        className={`w-full rounded-xl border bg-[#0B0E17]/60 px-4 py-3 pr-12 text-white outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          serviceFormErrors.duration
                            ? "border-red-500/50 focus:border-red-500"
                            : "border-white/10 focus:border-[#6366F1]"
                        }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const current = watchService("duration") || 30;
                            setServiceValue("duration", Math.min(480, current + 30));
                          }}
                          className="flex h-4 w-6 items-center justify-center rounded-t border border-white/20 bg-white/5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <i className="fas fa-chevron-up text-[10px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const current = watchService("duration") || 30;
                            setServiceValue("duration", Math.max(30, current - 30)); // CRITICAL FIX: Minimum is 30, not 15
                          }}
                          className="flex h-4 w-6 items-center justify-center rounded-b border border-white/20 border-t-0 bg-white/5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <i className="fas fa-chevron-down text-[10px]" />
                        </button>
                      </div>
                    </div>
                    {serviceFormErrors.duration ? (
                      <span className="text-xs text-red-400">{serviceFormErrors.duration.message}</span>
                    ) : watchService("duration") && watchService("duration")! % 30 === 0 ? (
                      <span className="text-xs text-green-400">✓ Durată validă</span>
                    ) : (
                      <span className="text-xs text-white/50">Doar multipli de 30 minute (30, 60, 90, 120, etc.)</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Preț (RON) *</span>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        {...registerService("price", { valueAsNumber: true })}
                        placeholder="150.00"
                        className={`w-full rounded-xl border bg-[#0B0E17]/60 px-4 py-3 pr-12 text-white outline-none transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          serviceFormErrors.price
                            ? "border-red-500/50 focus:border-red-500"
                            : "border-white/10 focus:border-[#6366F1]"
                        }`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const current = watchService("price") || 0;
                            setServiceValue("price", current + 10);
                          }}
                          className="flex h-4 w-6 items-center justify-center rounded-t border border-white/20 bg-white/5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <i className="fas fa-chevron-up text-[10px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const current = watchService("price") || 0;
                            setServiceValue("price", Math.max(0, current - 10));
                          }}
                          className="flex h-4 w-6 items-center justify-center rounded-b border border-white/20 border-t-0 bg-white/5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <i className="fas fa-chevron-down text-[10px]" />
                        </button>
                      </div>
                    </div>
                    {serviceFormErrors.price && (
                      <span className="text-xs text-red-400">{serviceFormErrors.price.message}</span>
                    )}
                  </label>
                </div>
                <label className="flex mt-6 flex-col gap-2 text-sm">
                  <span className="text-white/70">Observații</span>
                  <textarea
                    {...registerService("notes")}
                    placeholder="Adaugă observații sau note despre acest serviciu..."
                    rows={3}
                    className={`rounded-xl border bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition resize-none ${
                      serviceFormErrors.notes
                        ? "border-red-500/50 focus:border-red-500"
                        : "border-white/10 focus:border-[#6366F1]"
                    }`}
                  />
                  {serviceFormErrors.notes && (
                    <span className="text-xs text-red-400">{serviceFormErrors.notes.message}</span>
                  )}
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
                    disabled={isSubmittingService}
                    className="rounded-xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmittingService
                      ? "Se salvează..."
                      : editingServiceId
                        ? "Salvează modificările"
                        : "Adaugă servicii"}
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
                {insightsLoading
                  ? "Analizăm tiparele de rezervări pentru a evidenția ferestrele fierbinți..."
                  : insightsError
                  ? insightsError
                  : insights && insights.topSlots.length > 0
                  ? `Cele mai active ferestre: ${insights.topSlots
                      .slice(0, 2)
                      .map((slot) => `${slot.day} ${slot.hour} (${slot.count} rezervări)`)
                      .join(" • ")}. Trimite campanii în aceste intervale pentru a maximiza upsell-ul.`
                  : "Încă nu avem suficiente date pentru a recomanda ore de promoții. Revin-o după ce acumulezi câteva rezervări."}
              </p>
              {!insightsLoading && !insightsError && insights && insights.topSlots.length > 0 && (
                <ul className="mt-4 space-y-2 text-xs text-white/80">
                  {insights.topSlots.slice(0, 3).map((slot) => (
                    <li key={`${slot.day}-${slot.hour}`} className="flex items-start gap-2">
                      <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-[#A5B4FC]" />
                      <span>
                        {slot.day} • {slot.hour} — {slot.count} rezervări
                        {slot.examples.length > 0 && (
                          <span className="block text-white/50">
                            Exemple:{" "}
                            {slot.examples
                              .map((example) => `${example.client} (${example.service})`)
                              .join(", ")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 desktop:p-5">
              <p className="text-sm font-semibold">Clienți în risc de inactivitate</p>
              <p className="mt-2 text-sm text-white/70">
                {insightsLoading
                  ? "Identificăm clienții care nu au mai revenit recent..."
                  : insightsError
                  ? insightsError
                  : insights && insights.inactiveClients.length > 0
                  ? `${insights.inactiveClients.length} ${
                      insights.inactiveClients.length === 1 ? "client" : "clienți"
                    } nu au mai rezervat în ultimele 3 luni. Trimite-le un voucher sau un SMS personalizat.`
                  : "Toți clienții activi au revenit în ultimele 90 de zile. Continuă să menții ritmul!"}
              </p>
              {!insightsLoading && !insightsError && insights && insights.inactiveClients.length > 0 && (
                <ul className="mt-4 space-y-2 text-xs text-white/80">
                  {insights.inactiveClients.map((client) => (
                    <li key={`${client.email}-${client.lastBooking}`} className="flex items-start gap-2">
                      <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-white/60" />
                      <span>
                        {client.name} ({client.email || "—"}) — ultima vizită{" "}
                        {new Date(client.lastBooking).toLocaleDateString("ro-RO", {
                          day: "2-digit",
                          month: "short",
                        })}
                        <span className="block text-white/50">
                          {client.daysSince} zile fără rezervare
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Employee Modal */}
        {employeeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-4">
            <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0B0E17] shadow-xl shadow-black/40 flex flex-col max-h-[90vh]">
              {/* Header - Fixed */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {editingEmployeeId ? "Editează specialist" : "Adaugă specialist"}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {editingEmployeeId 
                      ? "Actualizează informațiile despre specialist" 
                      : "Completează informațiile pentru noul specialist"}
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
                    setEmployeeCanManageOwnServices(false); // TICKET-044: Reset flag
                    setEmployeeFeedback(null);
                    setEmployeeServices([]);
                  }}
                  className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <form
                  id="employee-form"
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
                        // TICKET-044: Include canManageOwnServices în update
                        await api.put(`/business/${business.id}/employees/${editingEmployeeId}`, {
                          name: employeeName.trim(),
                          email: employeeEmail.trim(),
                          phone: employeePhone.trim() || undefined,
                          specialization: employeeSpecialization.trim() || undefined,
                          canManageOwnServices: employeeCanManageOwnServices, // TICKET-044: Actualizează flag-ul
                        });
                        setEmployeeFeedback({ type: "success", message: "Specialist actualizat cu succes!" });
                      } else {
                        // Add new employee
                        await addEmployee({
                          businessId: business.id,
                          name: employeeName.trim(),
                          email: employeeEmail.trim(),
                          phone: employeePhone.trim() || undefined,
                          specialization: employeeSpecialization.trim() || undefined,
                        });
                        setEmployeeFeedback({ type: "success", message: "Specialist adăugat cu succes!" });
                      }
                      setTimeout(() => {
                        setEmployeeModalOpen(false);
                        setEditingEmployeeId(null);
                        setEmployeeName("");
                        setEmployeeEmail("");
                        setEmployeePhone("");
                        setEmployeeSpecialization("");
                        setEmployeeCanManageOwnServices(false); // TICKET-044: Reset flag
                        setEmployeeFeedback(null);
                        setEmployeeServices([]);
                        // CRITICAL FIX: Refresh business data when modal closes to sync with server
                        void fetchBusinesses();
                      }, 1000);
                    } catch (error: any) {
                      // Extract error message from Axios response if available
                      const errorMessage = error?.response?.data?.error 
                        || error?.message 
                        || (error instanceof Error ? error.message : null)
                        || (editingEmployeeId 
                          ? "Eroare la actualizarea specialistului." 
                          : "Eroare la adăugarea specialistului.");
                      
                      setEmployeeFeedback({
                        type: "error",
                        message: errorMessage,
                      });
                    } finally {
                      setAddingEmployee(false);
                    }
                  }}
                  className="flex flex-col gap-4"
                >
                  {/* Input fields in responsive grid: 1 column on mobile, 2 columns on desktop */}
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                  </div>

                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                  </div>

                {/* TICKET-044: Can Manage Own Services Toggle - Only show when editing existing employee */}
                {editingEmployeeId && (
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4 cursor-pointer transition hover:bg-[#0B0E17]/60">
                    <input
                      type="checkbox"
                      checked={employeeCanManageOwnServices}
                      onChange={(e) => setEmployeeCanManageOwnServices(e.target.checked)}
                      className="h-4 w-4 rounded border-white/30 text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-white/80 block">
                        Permite gestionarea propriilor servicii
                      </span>
                      <p className="text-xs text-white/50 mt-1">
                        Dacă este activat, specialistul poate adăuga sau șterge servicii pentru el însuși
                      </p>
                    </div>
                  </label>
                )}

                {/* Services Section - Only show when editing existing employee */}
                {editingEmployeeId && business?.services && business.services.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                    <label className="text-sm font-semibold text-white/80">
                      Servicii disponibile
                    </label>
                    <p className="text-xs text-white/50">
                      Selectează serviciile pe care le poate efectua acest specialist
                    </p>
                    {loadingEmployeeServices ? (
                      <div className="py-4 text-center text-sm text-white/60">
                        <i className="fas fa-spinner fa-spin mr-2" />
                        Se încarcă serviciile...
                      </div>
                    ) : (
                      <div className="max-h-48 space-y-2 overflow-y-auto">
                        {employeeServices.map((service, index) => (
                          <label
                            key={service.id || `service-${index}`}
                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:bg-white/10 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={service.isAssociated}
                              onChange={(e) => {
                                // CRITICAL FIX: Validate service.id before calling handler
                                if (!service.id || service.id === "undefined") {
                                  console.error("Cannot toggle service: service.id is invalid", service);
                                  return;
                                }
                                handleToggleEmployeeService(service.id, service.isAssociated);
                              }}
                              disabled={updatingEmployeeService === service.id || !service.id || service.id === "undefined"}
                              className="h-4 w-4 rounded border-white/30 text-[#6366F1] focus:ring-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed transition-none"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-white">{service.name}</span>
                            </div>
                            {updatingEmployeeService === service.id && (
                              <i className="fas fa-spinner fa-spin text-white/60 text-xs" />
                            )}
                          </label>
                        ))}
                        {employeeServices.length === 0 && (
                          <p className="py-4 text-center text-sm text-white/60">
                            Nu există servicii disponibile.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                </form>
              </div>

              {/* Footer - Fixed */}
              <div className="flex gap-3 p-6 border-t border-white/10">
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
                  form="employee-form"
                  disabled={addingEmployee}
                  className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addingEmployee 
                    ? (editingEmployeeId ? "Se actualizează..." : "Se adaugă...") 
                    : (editingEmployeeId ? "Salvează modificările" : "Adaugă specialist")}
                </button>
              </div>
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
                  Ești sigur că vrei să ștergi specialistul <strong className="text-white">"{employeeToDelete.name}"</strong>? 
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
                      // If the deleted employee was being edited, reset editing state and close modal
                      if (editingEmployeeId === employeeToDelete.id) {
                        setEditingEmployeeId(null);
                        setEmployeeModalOpen(false);
                        setEmployeeServices([]);
                      }
                      void fetchBusinesses();
                    } catch (error) {
                      logger.error("Delete employee failed:", error);
                      setEmployeeToDelete(null);
                    } finally {
                      setDeletingEmployeeId(null);
                    }
                  }}
                  disabled={deletingEmployeeId === employeeToDelete.id}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingEmployeeId === employeeToDelete.id ? "Se șterge..." : "Șterge specialist"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Court Modal (Add/Edit) */}
        {courtModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={handleCloseCourtModal}>
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">
                    {editingCourtId ? "Editează teren" : "Adaugă teren"}
                  </h3>
                  <p className="mt-2 text-sm text-white/60">
                    {editingCourtId 
                      ? "Actualizează informațiile despre teren" 
                      : "Completează informațiile pentru noul teren"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseCourtModal}
                  className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <form onSubmit={handleSubmitCourt} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Nume teren *</span>
                    <input
                      value={courtName}
                      onChange={(event) => setCourtName(event.target.value)}
                      placeholder="Ex: Teren Fotbal 1"
                      required
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Număr teren *</span>
                    <input
                      type="number"
                      min={1}
                      value={courtNumber}
                      onChange={(event) => setCourtNumber(event.target.value)}
                      placeholder="Ex: 1"
                      required
                      className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                </div>

                {courtFeedback && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      courtFeedback.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/40 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {courtFeedback.message}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleCloseCourtModal}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                  >
                    Renunță
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                  >
                    {editingCourtId ? "Salvează modificările" : "Adaugă teren"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Court Confirmation Modal */}
        {courtToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white">Confirmă ștergerea</h3>
                <p className="mt-2 text-sm text-white/60">
                  Ești sigur că vrei să ștergi terenul <strong className="text-white">"{courtToDelete.name}"</strong>? 
                  Această acțiune nu poate fi anulată.
                </p>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCourtToDelete(null)}
                  disabled={deletingCourtId === courtToDelete.id}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCourt}
                  disabled={deletingCourtId === courtToDelete.id}
                  className="rounded-2xl bg-red-500/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingCourtId === courtToDelete.id ? "Se șterge..." : "Șterge teren"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Court Pricing Modal */}
        {pricingModalOpen && selectedCourtForPricing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={handleClosePricingModal}>
            <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-semibold text-white">Configurează tarife</h3>
                  <p className="mt-2 text-sm text-white/60">
                    Setează prețurile pentru dimineață, după-amiază și nocturn
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClosePricingModal}
                  className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <form onSubmit={handleSubmitPricing} className="space-y-6">
                {/* Morning Pricing */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <h4 className="mb-4 text-lg font-semibold text-white">Dimineață</h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de început</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={morningStartHour}
                        onChange={(e) => setMorningStartHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de sfârșit</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={morningEndHour}
                        onChange={(e) => setMorningEndHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Preț (RON/oră) *</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={morningPrice}
                        onChange={(e) => setMorningPrice(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                  </div>
                </div>

                {/* Afternoon Pricing */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <h4 className="mb-4 text-lg font-semibold text-white">După-amiază</h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de început</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={afternoonStartHour}
                        onChange={(e) => setAfternoonStartHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de sfârșit</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={afternoonEndHour}
                        onChange={(e) => setAfternoonEndHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Preț (RON/oră) *</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={afternoonPrice}
                        onChange={(e) => setAfternoonPrice(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                  </div>
                </div>

                {/* Night Pricing */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <h4 className="mb-4 text-lg font-semibold text-white">Nocturn</h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de început</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={nightStartHour}
                        onChange={(e) => setNightStartHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Ora de sfârșit</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={nightEndHour}
                        onChange={(e) => setNightEndHour(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-sm">
                      <span className="text-white/70">Preț (RON/oră) *</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={nightPrice}
                        onChange={(e) => setNightPrice(e.target.value)}
                        required
                        className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                      />
                    </label>
                  </div>
                </div>

                {pricingFeedback && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      pricingFeedback.type === "success"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-red-500/40 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {pricingFeedback.message}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClosePricingModal}
                    disabled={savingPricing}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Renunță
                  </button>
                  <button
                    type="submit"
                    disabled={savingPricing}
                    className="rounded-xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingPricing ? "Se salvează..." : "Salvează tarife"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

