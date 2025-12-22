import { AxiosError } from "axios";
import { useCallback, useState } from "react";
import useApi from "./useApi";
import type { BusinessTypeValue } from "../constants/businessTypes";

export type BookingStatus = "PENDING_CONSENT" | "CONFIRMED" | "CANCELLED";

export interface Booking {
  id: string;
  clientId: string;
  businessId: string;
  serviceId?: string | null;
  courtId?: string | null;
  employeeId?: string | null;
  date: string;
  reminderSentAt?: string | null;
  paid: boolean;
  paymentReused?: boolean;
  paymentMethod?: "CARD" | "OFFLINE" | null;
  status: BookingStatus;
  duration?: number | null; // Durata în minute (opțional, override service duration)
  business: { id: string; name: string; businessType: BusinessTypeValue };
  service?: { id: string; name: string; duration: number; price: number } | null;
  court?: { id: string; name: string; number: number } | null;
  client: { id: string; name: string; email: string; phone?: string | null };
  employee?: { id: string; name: string; email: string } | null;
  consentForm?: {
    id: string;
    pdfUrl: string;
    templateType?: BusinessTypeValue | null;
    formData?: Record<string, unknown> | null;
    createdAt: string;
  } | null;
}

interface CreateBookingInput {
  clientId: string;
  businessId: string;
  serviceId?: string;
  courtId?: string;
  employeeId?: string;
  date: string;
  duration?: number; // Duration in minutes (for SPORT_OUTDOOR bookings)
  paid?: boolean;
  paymentMethod?: string;
  paymentReused?: boolean;
}

export default function useBookings() {
  const api = useApi();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async (options?: { silent?: boolean }) => {
    // CRITICAL FIX: Don't set loading for silent/polling requests to avoid flicker
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const { data } = await api.get<Booking[] | { data: Booking[]; pagination: any }>("/booking");
      
      // Handle paginated response (from /booking) or direct array (for backward compatibility)
      const bookingsArray = Array.isArray(data) ? data : (data as { data: Booking[] }).data;
      
      // CRITICAL FIX: Only update state if bookings actually changed to avoid unnecessary re-renders
      setBookings((prevBookings) => {
        // Deep comparison: check if bookings actually changed
        if (prevBookings.length !== bookingsArray.length) {
          return bookingsArray;
        }
        
        // Create maps for quick lookup
        const prevMap = new Map(prevBookings.map(b => [b.id, b]));
        const newMap = new Map(bookingsArray.map(b => [b.id, b]));
        
        // Check if any booking was added, removed, or modified
        let hasChanges = false;
        
        // Check for new or modified bookings
        for (const newBooking of bookingsArray) {
          const prevBooking = prevMap.get(newBooking.id);
          if (!prevBooking) {
            hasChanges = true; // New booking added
            break;
          }
          // Compare key fields that might change
          if (
            prevBooking.status !== newBooking.status ||
            prevBooking.date !== newBooking.date ||
            prevBooking.paid !== newBooking.paid ||
            prevBooking.employeeId !== newBooking.employeeId ||
            prevBooking.serviceId !== newBooking.serviceId
          ) {
            hasChanges = true; // Booking modified
            break;
          }
        }
        
        // Check for removed bookings
        if (!hasChanges) {
          for (const prevBooking of prevBookings) {
            if (!newMap.has(prevBooking.id)) {
              hasChanges = true; // Booking removed
              break;
            }
          }
        }
        
        // Only update if there are actual changes
        return hasChanges ? bookingsArray : prevBookings;
      });
      
      return bookingsArray;
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Eroare la listarea rezervărilor.");
      setError(message);
      throw err;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [api]);

  const getBooking = useCallback(
    async (id: string) => {
      const existing = bookings.find((item) => item.id === id);
      if (existing) return existing;

      const data = await fetchBookings();
      const booking = data.find((item) => item.id === id);
      if (!booking) {
        throw new Error("Rezervare inexistentă.");
      }
      return booking;
    },
    [bookings, fetchBookings]
  );

  const createBooking = useCallback(
    async (input: CreateBookingInput, optimisticBooking?: Booking) => {
      // Optimistic update: add booking immediately if provided
      if (optimisticBooking) {
        setBookings((prev) => [optimisticBooking, ...prev]);
      }

      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<Booking>("/booking", input);
        // Replace optimistic booking with real one
        if (optimisticBooking) {
          setBookings((prev) => prev.map((b) => (b.id === optimisticBooking.id ? data : b)));
        } else {
          setBookings((prev) => [data, ...prev]);
        }
        return data;
      } catch (err) {
        // Rollback optimistic update on error
        if (optimisticBooking) {
          setBookings((prev) => prev.filter((b) => b.id !== optimisticBooking.id));
        }
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la crearea rezervării.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const createBookingFromAI = useCallback(
    async (prompt: string) => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return `Am reținut cererea: "${prompt}". Verific disponibilitatea și îți trimit confirmarea.`;
      } catch {
        return "Nu am reușit să procesez cererea. Încearcă din nou.";
      }
    },
    []
  );

  const updateBooking = useCallback(
    async (id: string, data: { serviceId?: string; employeeId?: string | null; date?: string; paid?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const { data: updatedBooking } = await api.put<Booking>(`/booking/${id}`, data);
        setBookings((prev) => prev.map((booking) => (booking.id === id ? updatedBooking : booking)));
        return updatedBooking;
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la actualizarea rezervării.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  const cancelBooking = useCallback(
    async (id: string, refundPayment?: boolean, optimistic?: boolean) => {
      // Optimistic update: mark as cancelled immediately
      const originalBooking = bookings.find((b) => b.id === id);
      if (optimistic && originalBooking) {
        setBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "CANCELLED" as const } : b))
        );
      }

      setLoading(true);
      setError(null);
      try {
        const response = await api.delete(`/booking/${id}`, {
          data: refundPayment !== undefined ? { refundPayment } : undefined,
        });
        // After cancellation, fetch bookings again to get updated status
        // For paid bookings, status will be CANCELLED (not deleted)
        // For unpaid bookings, booking will be removed
        const updatedBookings = await fetchBookings();
        // Update local state with fetched bookings
        setBookings(updatedBookings);
        // Return response data so caller can access message
        return response.data;
      } catch (err) {
        // Rollback optimistic update on error
        if (optimistic && originalBooking) {
          setBookings((prev) =>
            prev.map((b) => (b.id === id ? originalBooking : b))
          );
        }
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Eroare la anularea rezervării.");
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [api, fetchBookings, bookings]
  );

  return {
    bookings,
    loading,
    error,
    fetchBookings,
    createBooking,
    getBooking,
    createBookingFromAI,
    updateBooking,
    cancelBooking,
  };
}

