import { AxiosError } from "axios";
import { useCallback, useState } from "react";
import useApi from "./useApi";

export interface Booking {
  id: string;
  clientId: string;
  businessId: string;
  serviceId: string;
  employeeId?: string | null;
  date: string;
  paid: boolean;
  business: { id: string; name: string };
  service: { id: string; name: string; duration: number; price: number };
  client: { id: string; name: string; email: string; phone?: string | null };
  employee?: { id: string; name: string; email: string } | null;
  consent?: { id: string; pdfUrl: string; signature: string };
}

interface CreateBookingInput {
  clientId: string;
  businessId: string;
  serviceId: string;
  employeeId?: string;
  date: string;
  paid?: boolean;
  consent?: { pdfUrl: string; signature: string };
}

export default function useBookings() {
  const api = useApi();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Booking[]>("/booking");
      setBookings(data);
      return data;
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Eroare la listarea rezervărilor.");
      setError(message);
      throw err;
    } finally {
      setLoading(false);
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
    async (input: CreateBookingInput) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<Booking>("/booking", input);
        setBookings((prev) => [data, ...prev]);
        return data;
      } catch (err) {
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
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        await api.delete(`/booking/${id}`);
        setBookings((prev) => prev.filter((booking) => booking.id !== id));
      } catch (err) {
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
    [api]
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

