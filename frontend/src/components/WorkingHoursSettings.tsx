"use client";

import { useCallback, useEffect, useState } from "react";
import useApi from "../hooks/useApi";
import useBusiness from "../hooks/useBusiness";
import useAuth from "../hooks/useAuth";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

interface TimeSlot {
  start: string; // "09:00"
  end: string;   // "18:00"
}

interface DaySchedule {
  enabled: boolean;
  slots: TimeSlot[]; // Multiple time slots for breaks
}

interface WorkingHours {
  [key: string]: DaySchedule;
}

const DAYS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Luni" },
  { key: "tuesday", label: "Marți" },
  { key: "wednesday", label: "Miercuri" },
  { key: "thursday", label: "Joi" },
  { key: "friday", label: "Vineri" },
  { key: "saturday", label: "Sâmbătă" },
  { key: "sunday", label: "Duminică" },
];

const DEFAULT_HOURS: WorkingHours = {
  monday: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] },
  tuesday: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] },
  wednesday: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] },
  thursday: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] },
  friday: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] },
  saturday: { enabled: false, slots: [{ start: "09:00", end: "18:00" }] },
  sunday: { enabled: false, slots: [{ start: "09:00", end: "18:00" }] },
};

export default function WorkingHoursSettings() {
  const api = useApi();
  const { user } = useAuth();
  const { businesses, fetchBusinesses } = useBusiness();
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Get current business
  const business = businesses.find(
    (b) => b.ownerId === user?.id || b.employees.some((e) => e.id === user?.id) || user?.business?.id === b.id
  ) || businesses[0];

  // Fetch working hours on mount
  useEffect(() => {
    if (!business?.id) {
      void fetchBusinesses();
      return;
    }

    const fetchWorkingHours = async () => {
      setLoading(true);
      try {
        const { data } = await api.get<{ workingHours: WorkingHours | null }>(
          `/business/${business.id}/working-hours`
        );
        if (data.workingHours) {
          // Migrate old format (hours array) to new format (slots array)
          const migratedHours: WorkingHours = { ...DEFAULT_HOURS };
          Object.keys(data.workingHours).forEach((dayKey) => {
            const dayData = (data.workingHours as any)[dayKey];
            if (dayData) {
              if (Array.isArray((dayData as any).hours)) {
                // Old format: { enabled: true, hours: ["09:00", "18:00"] }
                migratedHours[dayKey] = {
                  enabled: dayData.enabled,
                  slots: [{ start: (dayData as any).hours[0], end: (dayData as any).hours[1] }],
                };
              } else if (Array.isArray(dayData.slots)) {
                // New format: { enabled: true, slots: [{ start: "09:00", end: "18:00" }] }
                migratedHours[dayKey] = dayData;
              }
            }
          });
          setWorkingHours(migratedHours);
        }
      } catch (error) {
        console.error("Failed to fetch working hours:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchWorkingHours();
  }, [business?.id, api, fetchBusinesses]);

  const handleDayToggle = useCallback((dayKey: DayKey) => {
    setWorkingHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled: !prev[dayKey].enabled,
      },
    }));
  }, []);

  const handleTimeChange = useCallback((dayKey: DayKey, slotIndex: number, field: "start" | "end", value: string) => {
    // Force time to be a multiple of 30 minutes (00 or 30)
    const [hours, minutes] = value.split(":").map(Number);
    const roundedMinutes = Math.round(minutes / 30) * 30;
    let finalHours = hours;
    let finalMinutes = roundedMinutes;
    
    if (roundedMinutes >= 60) {
      finalHours = Math.min(hours + 1, 23); // Cap at 23:00
      finalMinutes = 0;
    }

    const finalTime = `${String(finalHours).padStart(2, "0")}:${String(finalMinutes).padStart(2, "0")}`;

    setWorkingHours((prev) => {
      const newSlots = [...prev[dayKey].slots];
      newSlots[slotIndex] = {
        ...newSlots[slotIndex],
        [field]: finalTime,
      };
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          slots: newSlots,
        },
      };
    });
  }, []);

  const handleAddSlot = useCallback((dayKey: DayKey) => {
    setWorkingHours((prev) => {
      const lastSlot = prev[dayKey].slots[prev[dayKey].slots.length - 1];
      const newEndTime = lastSlot ? lastSlot.end : "18:00";
      // Add a new slot starting after the last one ends
      const newSlots = [
        ...prev[dayKey].slots,
        { start: newEndTime, end: "18:00" },
      ];
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          slots: newSlots,
        },
      };
    });
  }, []);

  const handleRemoveSlot = useCallback((dayKey: DayKey, slotIndex: number) => {
    setWorkingHours((prev) => {
      const newSlots = prev[dayKey].slots.filter((_, index) => index !== slotIndex);
      // Ensure at least one slot exists
      if (newSlots.length === 0) {
        newSlots.push({ start: "09:00", end: "18:00" });
      }
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          slots: newSlots,
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!business?.id) {
      setMessage({ type: "error", text: "Business-ul nu a fost găsit." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/business/${business.id}/working-hours`, { workingHours });
      setMessage({ type: "success", text: "Programul de lucru a fost salvat cu succes!" });
    } catch (error) {
      console.error("Failed to save working hours:", error);
      setMessage({ type: "error", text: "Eroare la salvarea programului de lucru." });
    } finally {
      setSaving(false);
    }
  }, [business?.id, workingHours, api]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
        Se încarcă programul de lucru...
      </div>
    );
  }

  return (
    <div className="desktop:rounded-2xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Program de lucru</h2>
          <p className="mt-2 text-sm text-white/60">
            Configurează zilele și orele în care business-ul tău este deschis pentru rezervări.
          </p>
        </div>
      </div>

      <div className="space-y-4 desktop:space-y-4">
        {DAYS.map((day) => {
          const daySchedule = workingHours[day.key];
          return (
            <div
              key={day.key}
              className="rounded-xl border border-white/10 bg-[#0B0E17]/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={daySchedule.enabled}
                    onChange={() => handleDayToggle(day.key)}
                    className="h-5 w-5 rounded border-white/20 bg-[#0B0E17]/60 text-[#6366F1] focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-white min-w-[100px]">{day.label}</span>
                </label>
                {!daySchedule.enabled && (
                  <span className="text-xs text-white/40 italic">Închis</span>
                )}
              </div>

              {daySchedule.enabled && (
                <div className="space-y-4">
                  {/* Prima perioadă (perioada principală de lucru) */}
                  {daySchedule.slots.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <label className="text-xs text-white/60 min-w-[50px]">De la</label>
                        <input
                          type="time"
                          value={daySchedule.slots[0].start}
                          onChange={(e) => handleTimeChange(day.key, 0, "start", e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                        />
                      </div>
                      <span className="text-white/40 hidden sm:inline">-</span>
                      <div className="flex items-center gap-2 flex-1">
                        <label className="text-xs text-white/60 min-w-[50px]">Până la</label>
                        <input
                          type="time"
                          value={daySchedule.slots[0].end}
                          onChange={(e) => handleTimeChange(day.key, 0, "end", e.target.value)}
                          className="flex-1 rounded-lg border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Zonă evidențiată pentru adăugare pauză */}
                  <div className="rounded-xl border-2 border-dashed border-[#6366F1]/40 bg-[#6366F1]/5 p-4">
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                        <i className="fas fa-coffee text-[#6366F1]" />
                        Adaugă perioadă de pauză
                      </h4>
                      <p className="text-xs text-white/60">
                        Adaugă o pauză în programul de lucru (ex: pauză de masă, pauză de cafea). Programările vor fi blocate în această perioadă.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddSlot(day.key)}
                      className="w-full rounded-xl border-2 border-[#6366F1]/50 bg-[#6366F1]/10 px-4 py-3 text-sm font-semibold text-[#6366F1] transition hover:bg-[#6366F1]/20 hover:border-[#6366F1]"
                    >
                      <i className="fas fa-plus mr-2" />
                      Adaugă perioadă (pauză)
                    </button>
                  </div>

                  {/* Inputurile pentru pauzele adăugate (slots suplimentare) */}
                  {daySchedule.slots.slice(1).map((slot, slotIndex) => {
                    const actualIndex = slotIndex + 1; // +1 pentru că am tăiat primul slot
                    return (
                      <div key={actualIndex} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <label className="text-xs text-white/60 min-w-[50px]">De la</label>
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => handleTimeChange(day.key, actualIndex, "start", e.target.value)}
                            className="flex-1 rounded-lg border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                          />
                        </div>
                        <span className="text-white/40 hidden sm:inline">-</span>
                        <div className="flex items-center gap-2 flex-1">
                          <label className="text-xs text-white/60 min-w-[50px]">Până la</label>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => handleTimeChange(day.key, actualIndex, "end", e.target.value)}
                            className="flex-1 rounded-lg border border-white/10 bg-[#0B0E17]/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366F1]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(day.key, actualIndex)}
                          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
                          title="Șterge perioada"
                        >
                          <i className="fas fa-trash text-xs" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#6366F1] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Se salvează..." : "Salvează programul"}
        </button>
      </div>
    </div>
  );
}

