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
        console.log(`[useWorkingHours] Fetching working hours from: ${endpoint}`);
        const { data } = await api.get<{ workingHours: WorkingHours }>(endpoint);
        if (isActive) {
          console.log(`[useWorkingHours] Success:`, data);
          setWorkingHours(data.workingHours);
          setError(null);
        }
      } catch (err: any) {
        if (isActive) {
          console.error(`[useWorkingHours] Failed to fetch working hours from ${endpoint}:`, {
            message: err?.message,
            status: err?.response?.status,
            statusText: err?.response?.statusText,
            data: err?.response?.data,
            url: err?.config?.url,
            baseURL: err?.config?.baseURL,
          });
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

      // Sort slots by start time
      const sortedSlots = [...daySchedule.slots].sort((a, b) => {
        const [aH, aM] = a.start.split(":").map(Number);
        const [bH, bM] = b.start.split(":").map(Number);
        return aH * 60 + aM - (bH * 60 + bM);
      });

      // Generate hours from ALL slots (including breaks) so they all appear in calendar
      // Breaks will be marked as blocked using isBreakTime function
      const allHours: Set<string> = new Set();
      
      // Generate hours for each slot individually
      sortedSlots.forEach((slot) => {
        const [startH, startM] = slot.start.split(":").map(Number);
        const [endH, endM] = slot.end.split(":").map(Number);

        let currentH = startH;
        let currentM = startM;

        // Generate hours for this slot
        while (currentH < endH || (currentH === endH && currentM < endM)) {
          const hourStr = `${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}`;
          allHours.add(hourStr);

          // Move to next hour based on slot duration
          currentM += slotDurationMinutes;
          if (currentM >= 60) {
            currentM = 0;
            currentH += 1;
          }
        }
      });

      // Also generate hours for gaps between slots (pauses between working periods)
      // This ensures we show all time slots in the calendar
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentSlot = sortedSlots[i];
        const nextSlot = sortedSlots[i + 1];
        const [currentEndH, currentEndM] = currentSlot.end.split(":").map(Number);
        const [nextStartH, nextStartM] = nextSlot.start.split(":").map(Number);
        
        // Generate hours for the gap between slots
        let gapH = currentEndH;
        let gapM = currentEndM;
        const gapEnd = nextStartH * 60 + nextStartM;
        
        while (gapH * 60 + gapM < gapEnd) {
          const hourStr = `${String(gapH).padStart(2, "0")}:${String(gapM).padStart(2, "0")}`;
          allHours.add(hourStr);

          // Move to next hour based on slot duration
          gapM += slotDurationMinutes;
          if (gapM >= 60) {
            gapM = 0;
            gapH += 1;
          }
        }
      }

      return Array.from(allHours).sort();
    },
    [workingHours, slotDurationMinutes]
  );

  // Function to check if a time slot is in a break/pause period
  const isBreakTime = useCallback(
    (date: Date, hour: string): boolean => {
      if (!workingHours) return false;

      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const dayName = dayNames[date.getDay()] as keyof WorkingHours;
      const daySchedule = workingHours[dayName];

      if (!daySchedule || !daySchedule.enabled || !daySchedule.slots || daySchedule.slots.length <= 1) {
        return false; // No breaks if only one slot or no slots
      }

      // Sort slots by start time
      const sortedSlots = [...daySchedule.slots].sort((a, b) => {
        const [aH, aM] = a.start.split(":").map(Number);
        const [bH, bM] = b.start.split(":").map(Number);
        return aH * 60 + aM - (bH * 60 + bM);
      });

      const [hourH, hourM] = hour.split(":").map(Number);
      const slotTime = hourH * 60 + hourM;

      // Consider slots as breaks based on their position:
      // - If there are exactly 2 slots: the second one is a break (pauză între perioade)
      // - If there are more than 2 slots: slots in the middle (not first, not last) are breaks
      // - The last slot is NEVER a break - it's a working period
      if (sortedSlots.length === 2) {
        // If there are exactly 2 slots, the second one is the break
        const breakSlot = sortedSlots[1];
        const [startH, startM] = breakSlot.start.split(":").map(Number);
        const [endH, endM] = breakSlot.end.split(":").map(Number);
        const slotStart = startH * 60 + startM;
        const slotEnd = endH * 60 + endM;
        if (slotTime >= slotStart && slotTime < slotEnd) {
          return true;
        }
      } else if (sortedSlots.length > 2) {
        // If there are more than 2 slots, middle slots (1 to length-2) are breaks
        // The first slot (0) and last slot (length-1) are working periods
        for (let i = 1; i < sortedSlots.length - 1; i++) {
          const slot = sortedSlots[i];
          const [startH, startM] = slot.start.split(":").map(Number);
          const [endH, endM] = slot.end.split(":").map(Number);
          const slotStart = startH * 60 + startM;
          const slotEnd = endH * 60 + endM;
          if (slotTime >= slotStart && slotTime < slotEnd) {
            return true;
          }
        }
      }

      // Also check gaps between slots (pauses between working periods)
      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentSlot = sortedSlots[i];
        const nextSlot = sortedSlots[i + 1];
        const [currentEndH, currentEndM] = currentSlot.end.split(":").map(Number);
        const [nextStartH, nextStartM] = nextSlot.start.split(":").map(Number);
        const gapStart = currentEndH * 60 + currentEndM;
        const gapEnd = nextStartH * 60 + nextStartM;

        // Check if slot time falls in the gap between slots
        if (slotTime >= gapStart && slotTime < gapEnd) {
          return true;
        }
      }

      return false;
    },
    [workingHours]
  );

  return {
    workingHours,
    loading,
    error,
    getAvailableHoursForDay,
    isBreakTime,
  };
}

