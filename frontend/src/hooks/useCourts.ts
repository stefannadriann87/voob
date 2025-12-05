import { useState, useEffect } from "react";
import useApi from "./useApi";

export interface Court {
  id: string;
  name: string;
  number: number;
  isActive: boolean;
  pricing?: Array<{
    id: string;
    timeSlot: "MORNING" | "AFTERNOON" | "NIGHT";
    price: number;
    startHour: number;
    endHour: number;
  }>;
}

export default function useCourts(businessId: string | null) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const api = useApi();

  const refreshCourts = () => {
    setRefreshToken((prev) => prev + 1);
  };

  useEffect(() => {
    if (!businessId) {
      setCourts([]);
      return;
    }

    const fetchCourts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/business/${businessId}/courts`);
        setCourts(response.data.courts || []);
      } catch (err: any) {
        setError(err.response?.data?.error || "Eroare la încărcarea terenurilor.");
        setCourts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCourts();
  }, [businessId, api, refreshToken]);

  return { courts, loading, error, refreshCourts };
}

