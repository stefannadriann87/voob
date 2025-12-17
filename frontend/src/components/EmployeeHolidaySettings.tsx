"use client";

import { useCallback, useEffect, useState } from "react";
import useApi from "../hooks/useApi";
import useAuth from "../hooks/useAuth";
import DatePicker from "./DatePicker";
import { logger } from "../lib/logger";

interface Holiday {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export default function EmployeeHolidaySettings() {
  const api = useApi();
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch holidays on mount
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const fetchHolidays = async () => {
      setLoading(true);
      try {
        const { data } = await api.get<{ holidays: Holiday[] }>(`/employee/${user.id}/holidays`);
        setHolidays(data.holidays);
      } catch (error) {
        logger.error("Failed to fetch holidays:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchHolidays();
  }, [user?.id, api]);

  const handleOpenModal = useCallback(() => {
    setStartDate("");
    setEndDate("");
    setReason("");
    setMessage(null);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setStartDate("");
    setEndDate("");
    setReason("");
    setMessage(null);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setMessage({ type: "error", text: "Utilizatorul nu a fost găsit." });
      return;
    }

    if (!startDate || !endDate) {
      setMessage({ type: "error", text: "Selectează data de început și data de sfârșit." });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      setMessage({ type: "error", text: "Data de început trebuie să fie înainte de data de sfârșit." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { data } = await api.post<{ holiday: Holiday }>(`/employee/${user.id}/holidays`, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        reason: reason.trim() || null,
      });
      setHolidays((prev) => [...prev, data.holiday].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
      setMessage({ type: "success", text: "Perioada de concediu a fost adăugată cu succes!" });
      setTimeout(() => {
        handleCloseModal();
      }, 1000);
    } catch (error: any) {
      logger.error("Failed to create holiday:", error);
      setMessage({
        type: "error",
        text: error?.response?.data?.error || "Eroare la adăugarea perioadei de concediu.",
      });
    } finally {
      setSaving(false);
    }
  }, [user?.id, startDate, endDate, reason, api, handleCloseModal]);

  const handleDelete = useCallback(async (holidayId: string) => {
    if (!user?.id) return;

    setDeletingId(holidayId);
    try {
      await api.delete(`/employee/${user.id}/holidays/${holidayId}`);
      setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
    } catch (error) {
      logger.error("Failed to delete holiday:", error);
    } finally {
      setDeletingId(null);
    }
  }, [user?.id, api]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
        Se încarcă perioadele de concediu...
      </div>
    );
  }

  return (
    <div className="desktop:rounded-2xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Concedii și blocări</h2>
          <p className="mt-2 text-sm text-white/60">
            Blochează programările pentru perioade specifice (concediu, închidere temporară, etc.).
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenModal}
          className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
        >
          <i className="fas fa-plus mr-2" />
          Adaugă perioadă
        </button>
      </div>

      {holidays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0E17]/40 p-6 text-center text-sm text-white/60">
          Nu ai perioade de concediu configurate. Adaugă o perioadă pentru a bloca programările.
        </div>
      ) : (
        <div className="space-y-3">
          {holidays.map((holiday) => {
            const start = new Date(holiday.startDate);
            const end = new Date(holiday.endDate);
            const isPast = end < new Date();

            return (
              <div
                key={holiday.id}
                className={`flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0B0E17]/40 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  isPast ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-calendar text-xs text-white/60" />
                      <span className="text-sm font-medium text-white">
                        {start.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                      <span className="text-white/40">-</span>
                      <span className="text-sm font-medium text-white">
                        {end.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    </div>
                    {isPast && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">Trecut</span>
                    )}
                  </div>
                  {holiday.reason && (
                    <p className="mt-2 text-sm text-white/70">
                      <i className="fas fa-info-circle mr-2 text-xs" />
                      {holiday.reason}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(holiday.id)}
                  disabled={deletingId === holiday.id}
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingId === holiday.id ? (
                    <i className="fas fa-spinner fa-spin" />
                  ) : (
                    <i className="fas fa-trash" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Holiday Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4" onClick={handleCloseModal}>
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Adaugă perioadă de concediu</h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 text-sm">
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    minDate={new Date().toISOString().split("T")[0]}
                    label="Data de început *"
                    placeholder="Selectează data de început"
                  />
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    minDate={startDate || new Date().toISOString().split("T")[0]}
                    label="Data de sfârșit *"
                    placeholder="Selectează data de sfârșit"
                  />
                </div>
              </div>
              <label className="flex flex-col gap-2 text-sm mt-6">
                <span className="text-white/70">Motiv (opțional)</span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Concediu, Închidere temporară"
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              {message && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    message.type === "success"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-red-500/40 bg-red-500/10 text-red-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={saving || !startDate || !endDate}
                  className="rounded-xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Se adaugă..." : "Adaugă perioadă"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

