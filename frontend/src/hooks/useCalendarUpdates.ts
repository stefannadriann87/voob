import { useEffect, useRef, useCallback } from "react";
import useBookings from "./useBookings";
import { logger } from "../lib/logger";

interface UseCalendarUpdatesOptions {
  enabled?: boolean;
  interval?: number; // Polling interval in milliseconds (default: 60000 = 60 seconds)
  businessId?: string | null;
  onUpdate?: () => void;
}

/**
 * Hook for real-time calendar updates using polling
 * Automatically pauses when tab is inactive to reduce unnecessary requests
 */
export default function useCalendarUpdates({
  enabled = true,
  interval = 60000, // 60 seconds default (reduced frequency)
  businessId,
  onUpdate,
}: UseCalendarUpdatesOptions = {}) {
  const { fetchBookings } = useBookings();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const isPageVisibleRef = useRef(true);

  const pollForUpdates = useCallback(async () => {
    if (isPollingRef.current) return; // Prevent concurrent polls
    if (!enabled) return;
    if (!isPageVisibleRef.current) return; // Don't poll when tab is inactive

    try {
      isPollingRef.current = true;
      await fetchBookings();
      onUpdate?.();
    } catch (error) {
      logger.error("Error polling for calendar updates:", error);
    } finally {
      isPollingRef.current = false;
    }
  }, [enabled, fetchBookings, onUpdate]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      if (isPageVisibleRef.current) {
        // Tab became visible, fetch immediately and resume polling
        pollForUpdates();
      }
      // When tab becomes hidden, polling will naturally stop (pollForUpdates checks isPageVisibleRef)
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    isPageVisibleRef.current = !document.hidden;

    // Initial fetch only if page is visible
    if (isPageVisibleRef.current) {
      pollForUpdates();
    }

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      pollForUpdates();
    }, interval);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, pollForUpdates]);

  // Manual refresh function
  const refresh = useCallback(() => {
    pollForUpdates();
  }, [pollForUpdates]);

  return {
    refresh,
    isPolling: isPollingRef.current,
  };
}

