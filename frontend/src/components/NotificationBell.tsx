"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import useAuth from "../hooks/useAuth";
import useBookings from "../hooks/useBookings";
import useBusiness from "../hooks/useBusiness";

export default function NotificationBell() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { bookings, fetchBookings, loading: bookingsLoading } = useBookings();
  const { businesses, fetchBusinesses, loading: businessesLoading } = useBusiness();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current business
  const business = useMemo(() => {
    if (businesses.length === 0) {
      return null;
    }

    const userBusinessId = user?.business?.id;
    if (userBusinessId) {
      const match = businesses.find((item) => item.id === userBusinessId);
      if (match) {
        return match;
      }
    }

    if (user?.id) {
      const owned = businesses.find((item) => item.ownerId === user.id);
      if (owned) {
        return owned;
      }

      const employeeBusiness = businesses.find((item) =>
        item.employees.some((employee) => employee.id === user.id)
      );
      if (employeeBusiness) {
        return employeeBusiness;
      }
    }

    return businesses[0] ?? null;
  }, [businesses, user]);

  // Filter bookings for this business - only future bookings (including today)
  const upcomingBookings = useMemo(() => {
    if (!business?.id) {
      return [];
    }
    
    // Filter bookings for this business
    const businessBookings = bookings.filter((booking) => booking.businessId === business.id);
    
    if (businessBookings.length === 0) {
      return [];
    }
    
    // Get current date/time for comparison
    const now = new Date();
    
    // Filter only future bookings (including today's future bookings)
    const filtered = businessBookings.filter((booking) => {
      const bookingDate = new Date(booking.date);
      // Include all bookings that are in the future (even if same day but later time)
      return bookingDate.getTime() > now.getTime();
    });

    // Sort by date (soonest first)
    const sorted = filtered.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return sorted.slice(0, 10); // Limit to 10 most recent
  }, [bookings, business?.id]);

  const notificationCount = upcomingBookings.length;

  // Fetch businesses and bookings when component mounts
  // CRITICAL FIX: Use useRef to prevent infinite loop
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    
    if (user?.role === "BUSINESS") {
      // Fetch businesses first if not loaded (only once)
      if (businesses.length === 0 && !hasFetchedRef.current) {
        hasFetchedRef.current = true;
        void fetchBusinesses();
      }
      // Fetch bookings
      void fetchBookings();
    }
    // Reset flag if user changes
    if (user?.role !== "BUSINESS") {
      hasFetchedRef.current = false;
    }
  }, [user?.role, hydrated]); // Removed fetchBusinesses, fetchBookings, businesses.length from dependencies

  // Refresh bookings when dropdown opens
  useEffect(() => {
    if (isOpen && user?.role === "BUSINESS" && business?.id) {
      void fetchBookings();
    }
  }, [isOpen, user?.role, business?.id, fetchBookings]);

  // Auto-refresh bookings every 30 seconds
  useEffect(() => {
    if (user?.role !== "BUSINESS" || !business?.id) return;

    const interval = setInterval(() => {
      void fetchBookings();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [user?.role, business?.id, fetchBookings]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Only show for BUSINESS role
  if (user?.role !== "BUSINESS") {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 sm:bottom-6 sm:left-6 md:bottom-auto md:left-auto md:top-4 md:right-4" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
        aria-label="Notificări"
      >
        <Bell className="h-5 w-5 text-white" />
        {notificationCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#6366F1] text-xs font-semibold text-white">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 md:bottom-auto md:left-auto md:right-0 md:mb-0 md:mt-2 w-80 rounded-2xl border border-white/10 bg-[#0B0E17] shadow-xl shadow-black/40">
          <div className="border-b border-white/10 p-4">
            <h3 className="text-lg font-semibold text-white">Programări viitoare</h3>
            <p className="mt-1 text-xs text-white/60">
              {notificationCount === 0
                ? "Nu ai programări viitoare"
                : `${notificationCount} programări viitoare`}
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {bookingsLoading ? (
              <div className="p-6 text-center text-sm text-white/60">
                <p>Se încarcă...</p>
              </div>
            ) : notificationCount === 0 ? (
              <div className="p-6 text-center text-sm text-white/60">
                <p>Nu ai programări viitoare</p>
                {bookings.length > 0 && (
                  <p className="mt-2 text-xs text-white/40">
                    ({bookings.filter((b) => b.businessId === business?.id).length} programări totale pentru acest business)
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {upcomingBookings.map((booking) => {
                  const bookingDate = new Date(booking.date);
                  const isToday =
                    bookingDate.toDateString() === new Date().toDateString();
                  const isTomorrow =
                    bookingDate.toDateString() ===
                    new Date(Date.now() + 24 * 60 * 60 * 1000).toDateString();

                  return (
                    <div
                      key={booking.id}
                      className="p-4 transition hover:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">
                            {booking.client?.name}
                          </p>
                          <p className="mt-1 text-sm text-white/70 truncate">
                            {booking.service?.name}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                            <i className="fas fa-calendar" />
                            <span>
                              {isToday
                                ? "Astăzi"
                                : isTomorrow
                                  ? "Mâine"
                                  : bookingDate.toLocaleDateString("ro-RO", {
                                      day: "numeric",
                                      month: "short",
                                    })}
                              {" • "}
                              {bookingDate.toLocaleTimeString("ro-RO", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {booking.employee && (
                            <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                              <i className="fas fa-user" />
                              <span>{booking.employee.name}</span>
                            </div>
                          )}
                          {!booking.paid && (
                            <div className="mt-2">
                              <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-300">
                                Neplătit
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {notificationCount > 0 && (
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push("/business/bookings");
                }}
                className="w-full rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
              >
                Vezi toate programările
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

