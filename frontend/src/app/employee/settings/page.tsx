"use client";

import { useEffect, useState, useCallback } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";
import EmployeeWorkingHoursSettings from "../../../components/EmployeeWorkingHoursSettings";
import EmployeeHolidaySettings from "../../../components/EmployeeHolidaySettings";
import { logger } from "../../../lib/logger";

export default function EmployeeSettingsPage() {
  const { user, hydrated } = useAuth();
  const api = useApi();
  const [services, setServices] = useState<Array<{ id: string; name: string; isAssociated: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [updatingServiceId, setUpdatingServiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch employee services
  useEffect(() => {
    if (!hydrated || !user || user.role !== "EMPLOYEE") {
      return;
    }

    const fetchServices = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<{ services: Array<{ id: string; name: string; isAssociated: boolean }>; businessId: string; businessName: string }>(
          "/employee/services"
        );
        setServices(data.services);
      } catch (err: any) {
        logger.error("Failed to fetch employee services:", err);
        setError(err.response?.data?.error || "Eroare la încărcarea serviciilor.");
      } finally {
        setLoading(false);
      }
    };

    void fetchServices();
  }, [hydrated, user, api]);

  // Toggle service association
  const handleToggleService = useCallback(
    async (serviceId: string, isAssociated: boolean) => {
      if (updatingServiceId) return;

      setUpdatingServiceId(serviceId);
      setError(null);
      try {
        if (isAssociated) {
          // Disassociate
          await api.delete(`/employee/services/${serviceId}`);
        } else {
          // Associate
          await api.post(`/employee/services/${serviceId}`);
        }
        // Update local state
        setServices((prev) =>
          prev.map((s) => (s.id === serviceId ? { ...s, isAssociated: !isAssociated } : s))
        );
      } catch (err: any) {
        logger.error("Failed to toggle service:", err);
        setError(err.response?.data?.error || "Eroare la actualizarea serviciului.");
      } finally {
        setUpdatingServiceId(null);
      }
    },
    [updatingServiceId, api]
  );

  if (!hydrated || !user || user.role !== "EMPLOYEE") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Setări</h1>
          <p className="mt-4 text-sm text-white/60">
            Configurează programul de lucru, perioadele de concediu și serviciile pe care le poți efectua.
          </p>
        </div>

        <EmployeeWorkingHoursSettings />
        <EmployeeHolidaySettings />

        {/* Employee Services Section */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Servicii disponibile</h2>
            <p className="mt-2 text-sm text-white/60">
              Selectează serviciile pe care le poți efectua. Doar serviciile selectate vor apărea pentru clienți când te aleg.
            </p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-white/60">
              <i className="fas fa-spinner fa-spin mr-2" />
              Se încarcă serviciile...
            </div>
          ) : error && services.length === 0 ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : (
            <>
              {services.length > 0 ? (
                <div className="space-y-2">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={service.isAssociated}
                        onChange={(e) => handleToggleService(service.id, service.isAssociated)}
                        disabled={updatingServiceId === service.id}
                        className="h-4 w-4 rounded border-white/30 text-[#6366F1] focus:ring-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-white">{service.name}</span>
                      </div>
                      {updatingServiceId === service.id && (
                        <i className="fas fa-spinner fa-spin text-white/60 text-xs" />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60">
                  Nu există servicii disponibile momentan.
                </div>
              )}
              {error && services.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

