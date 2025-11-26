import { useState, useEffect, useCallback } from "react";
import useApi from "./useApi";

export interface TrialStatus {
  isExpired: boolean;
  daysRemaining: number | null;
  trialStartDate: Date | null;
  trialEndDate: Date | null;
  hasActiveSubscription: boolean;
}

export default function useTrialStatus(businessId: string | null) {
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const fetchTrialStatus = useCallback(async () => {
    if (!businessId) {
      setTrialStatus(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get<TrialStatus>(`/subscription/check-trial/${businessId}`);
      setTrialStatus(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || "Eroare la verificarea statusului trial.";
      setError(errorMessage);
      console.error("Fetch trial status error:", err);
    } finally {
      setLoading(false);
    }
  }, [businessId, api]);

  useEffect(() => {
    fetchTrialStatus();
  }, [fetchTrialStatus]);

  return {
    trialStatus,
    loading,
    error,
    refetch: fetchTrialStatus,
  };
}

