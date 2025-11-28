import { useCallback, useEffect, useMemo, useState } from "react";
import useApi from "./useApi";
import { getDefaultHours } from "../utils/calendarUtils";

type WorkingHoursSlot = {
  start: string;
  end: string;
};

type DaySchedule = {
  enabled: boolean;
  slots: WorkingHoursSlot[];
};

type WorkingHours = {
  sunday?: DaySchedule;
  monday?: DaySchedule;
  tuesday?: DaySchedule;
  wednesday?: DaySchedule;
  thursday?: DaySchedule;
  friday?: DaySchedule;
  saturday?: DaySchedule;
};

interface UseWorkingHoursOptions {
  businessId?: string | null;
  employeeId?: string | null;
  slotDurationMinutes?: number; // Default: 60
}

export default function useWorkingHours({
  businessId,
  employeeId,
  slotDurationMinutes = 60,
}: UseWorkingHoursOptions) {
  const api = useApi();
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine which ID to use and the endpoint
  const targetId = businessId || employeeId;
  const endpoint = businessId
    ? `/business/${businessId}/working-hours`
    : employeeId
      ? `/employee/${employeeId}/working-hours`
      : null;

  // Fetch working hours
  useEffect(() => {
    if (!endpoint || !targetId) {
      setWorkingHours(null);
      setError(null);
      return;
    }

    let isActive = true;
    setLoading(true);
    setError(null);

    const fetchWorkingHours = async () => {
      try {
        const { data } = await api.get<{ workingHours: WorkingHours }>(endpoint);
        if (isActive) {
          setWorkingHours(data.workingHours);
          setError(null);
        }
      } catch (err: any) {
        if (isActive) {
          console.error("Failed to fetch working hours:", err?.message || err);
          setWorkingHours(null);
          setError(err?.response?.data?.error || err?.message || "Eroare la încărcarea orelor de lucru");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void fetchWorkingHours();

    return () => {
      isActive = false;
    };
  }, [endpoint, targetId, api]);

  // Function to get available hours for a specific day
  const getAvailableHoursForDay = useCallback(
    (date: Date): string[] => {
      if (!workingHours) return getDefaultHours(slotDurationMinutes); // Fallback to default hours if no working hours set

      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayName = dayNames[date.getDay()] as keyof WorkingHours;
      const daySchedule = workingHours[dayName];

      if (!daySchedule || !daySchedule.enabled || !daySchedule.slots || daySchedule.slots.length === 0) {
        return []; // Day is disabled or has no slots
      }

      // Generate all hours from all slots for this day
      const availableHours: string[] = [];
      daySchedule.slots.forEach((slot: WorkingHoursSlot) => {
        const [startH, startM] = slot.start.split(":").map(Number);
        const [endH, endM] = slot.end.split(":").map(Number);

        let currentH = startH;
        let currentM = startM;

        while (currentH < endH || (currentH === endH && currentM < endM)) {
          const hourStr = `${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}`;
          if (!availableHours.includes(hourStr)) {
            availableHours.push(hourStr);
          }

          // Move to next hour based on slot duration
          currentM += slotDurationMinutes;
          if (currentM >= 60) {
            currentM = 0;
            currentH += 1;
          }
        }
      });

      return availableHours.sort();
    },
    [workingHours, slotDurationMinutes]
  );

  return {
    workingHours,
    loading,
    error,
    getAvailableHoursForDay,
  };
}

