import { format, parseISO } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Converts a date from business timezone to UTC
 * @param date - Date in business timezone
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns Date in UTC
 */
export function toUTC(date: Date, timezone: string = "Europe/Bucharest"): Date {
  return fromZonedTime(date, timezone);
}

/**
 * Converts a UTC date to business timezone
 * @param utcDate - Date in UTC
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns Date in business timezone
 */
export function fromUTC(utcDate: Date | string, timezone: string = "Europe/Bucharest"): Date {
  const date = typeof utcDate === "string" ? parseISO(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

/**
 * Formats a date in business timezone
 * @param date - Date to format (UTC or local)
 * @param formatStr - Format string (e.g., "HH:mm", "yyyy-MM-dd HH:mm")
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns Formatted date string
 */
export function formatInTimezone(
  date: Date | string,
  formatStr: string,
  timezone: string = "Europe/Bucharest"
): string {
  const zonedDate = fromUTC(date, timezone);
  return format(zonedDate, formatStr);
}

/**
 * Gets the current time in business timezone
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns Current date in business timezone
 */
export function getCurrentTimeInTimezone(timezone: string = "Europe/Bucharest"): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Checks if a date is in the past based on business timezone
 * @param date - Date to check (UTC)
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns true if date is in the past
 */
export function isPastInTimezone(date: Date | string, timezone: string = "Europe/Bucharest"): boolean {
  const zonedDate = fromUTC(date, timezone);
  const now = getCurrentTimeInTimezone(timezone);
  return zonedDate < now;
}

/**
 * Creates a date in business timezone from date and time strings
 * @param dateStr - Date string (e.g., "2024-01-15")
 * @param timeStr - Time string (e.g., "14:30")
 * @param timezone - Business timezone (e.g., "Europe/Bucharest")
 * @returns Date in UTC
 */
export function createDateInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string = "Europe/Bucharest"
): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return toUTC(date, timezone);
}

