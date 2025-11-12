"use client";

import { useState, useCallback, useMemo } from "react";

interface DatePickerProps {
  value: string; // Format: YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string; // Format: YYYY-MM-DD
  maxDate?: string; // Format: YYYY-MM-DD
  label?: string;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, minDate, maxDate, label, placeholder }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) {
      const date = new Date(value);
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return new Date();
  });

  const selectedDate = value ? new Date(value) : null;
  const minDateObj = minDate ? new Date(minDate) : null;
  const maxDateObj = maxDate ? new Date(maxDate) : null;

  const currentMonth = viewMonth.getMonth();
  const currentYear = viewMonth.getFullYear();

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  // Convert Sunday (0) to Monday (0) - adjust for Monday-first week
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  const monthNames = [
    "Ianuarie",
    "Februarie",
    "Martie",
    "Aprilie",
    "Mai",
    "Iunie",
    "Iulie",
    "August",
    "Septembrie",
    "Octombrie",
    "Noiembrie",
    "Decembrie",
  ];

  const weekDays = ["D", "L", "M", "M", "J", "V", "S"];

  const handleDateClick = useCallback(
    (day: number) => {
      const date = new Date(currentYear, currentMonth, day);
      date.setHours(0, 0, 0, 0);
      const dateString = date.toISOString().split("T")[0];

      // Check if date is within min/max range
      if (minDateObj) {
        const min = new Date(minDateObj);
        min.setHours(0, 0, 0, 0);
        if (date < min) return;
      }
      if (maxDateObj) {
        const max = new Date(maxDateObj);
        max.setHours(0, 0, 0, 0);
        if (date > max) return;
      }

      onChange(dateString);
      setIsOpen(false);
    },
    [currentYear, currentMonth, onChange, minDateObj, maxDateObj]
  );

  const handlePrevMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handleToday = useCallback(() => {
    const today = new Date();
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    if (!minDateObj || today >= minDateObj) {
      if (!maxDateObj || today <= maxDateObj) {
        onChange(today.toISOString().split("T")[0]);
        setIsOpen(false);
      }
    }
  }, [onChange, minDateObj, maxDateObj]);

  const isDateDisabled = useCallback(
    (day: number) => {
      const date = new Date(currentYear, currentMonth, day);
      date.setHours(0, 0, 0, 0);
      
      if (minDateObj) {
        const min = new Date(minDateObj);
        min.setHours(0, 0, 0, 0);
        if (date < min) return true;
      }
      if (maxDateObj) {
        const max = new Date(maxDateObj);
        max.setHours(0, 0, 0, 0);
        if (date > max) return true;
      }
      return false;
    },
    [currentYear, currentMonth, minDateObj, maxDateObj]
  );

  const isDateSelected = useCallback(
    (day: number) => {
      if (!selectedDate) return false;
      return (
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === currentMonth &&
        selectedDate.getFullYear() === currentYear
      );
    },
    [selectedDate, currentMonth, currentYear]
  );

  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
    : placeholder || "Selectează data";

  const handlePrevWeek = useCallback(() => {
    if (!selectedDate) {
      const today = new Date();
      today.setDate(today.getDate() - 7);
      const dateString = today.toISOString().split("T")[0];
      if (!minDateObj || today >= minDateObj) {
        if (!maxDateObj || today <= maxDateObj) {
          onChange(dateString);
        }
      }
      return;
    }
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    const dateString = newDate.toISOString().split("T")[0];
    
    // Check if date is within min/max range
    if (minDateObj) {
      const min = new Date(minDateObj);
      min.setHours(0, 0, 0, 0);
      if (newDate < min) return;
    }
    if (maxDateObj) {
      const max = new Date(maxDateObj);
      max.setHours(0, 0, 0, 0);
      if (newDate > max) return;
    }
    
    onChange(dateString);
  }, [selectedDate, onChange, minDateObj, maxDateObj]);

  const handleNextWeek = useCallback(() => {
    if (!selectedDate) {
      const today = new Date();
      today.setDate(today.getDate() + 7);
      const dateString = today.toISOString().split("T")[0];
      if (!minDateObj || today >= minDateObj) {
        if (!maxDateObj || today <= maxDateObj) {
          onChange(dateString);
        }
      }
      return;
    }
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    const dateString = newDate.toISOString().split("T")[0];
    
    // Check if date is within min/max range
    if (minDateObj) {
      const min = new Date(minDateObj);
      min.setHours(0, 0, 0, 0);
      if (newDate < min) return;
    }
    if (maxDateObj) {
      const max = new Date(maxDateObj);
      max.setHours(0, 0, 0, 0);
      if (newDate > max) return;
    }
    
    onChange(dateString);
  }, [selectedDate, onChange, minDateObj, maxDateObj]);

  return (
    <div className="relative">
      {label && <label className="mb-2 block text-sm text-white/70">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrevWeek}
          className="rounded-xl border border-white/10 bg-[#0B0E17]/60 p-3 text-white/70 transition hover:bg-white/10 hover:text-white"
          title="Săptămâna anterioară"
        >
          <i className="fas fa-chevron-left" />
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-left text-white outline-none transition focus:border-[#6366F1]"
        >
          <div className="flex items-center justify-between">
            <span className={selectedDate ? "text-white" : "text-white/50"}>{displayValue}</span>
            <i className="fas fa-calendar text-white/60 ml-2" />
          </div>
        </button>
        <button
          type="button"
          onClick={handleNextWeek}
          className="rounded-xl border border-white/10 bg-[#0B0E17]/60 p-3 text-white/70 transition hover:bg-white/10 hover:text-white"
          title="Săptămâna următoare"
        >
          <i className="fas fa-chevron-right" />
        </button>
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-[101] mt-2 w-full min-w-[320px] max-w-[320px] rounded-2xl border border-white/10 bg-[#0B0E17] p-4 shadow-xl shadow-black/40">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="rounded-lg border border-white/10 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-chevron-left text-sm" />
              </button>
              <h3 className="text-lg font-semibold text-white">
                {monthNames[currentMonth]} {currentYear}
              </h3>
              <button
                type="button"
                onClick={handleNextMonth}
                className="rounded-lg border border-white/10 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-chevron-right text-sm" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {weekDays.map((day, index) => (
                <div key={index} className="flex items-center justify-center p-1 text-center text-xs font-semibold text-white/60">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {/* Empty cells for days before the first day of the month */}
              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="aspect-square" />
              ))}
              {/* Days of the month */}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const disabled = isDateDisabled(day);
                const selected = isDateSelected(day);
                const today = new Date();
                const isToday =
                  day === today.getDate() &&
                  currentMonth === today.getMonth() &&
                  currentYear === today.getFullYear();

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => handleDateClick(day)}
                    disabled={disabled}
                    className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition ${
                      disabled
                        ? "cursor-not-allowed text-white/20"
                        : selected
                          ? "bg-[#6366F1] text-white font-semibold"
                          : isToday
                            ? "bg-white/10 text-white font-medium"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleToday}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Astăzi
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

