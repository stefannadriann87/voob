const HOUR_IN_MS = 60 * 60 * 1000;

export const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;
export const CANCELLATION_LIMIT_MS = 23 * HOUR_IN_MS;
export const REMINDER_GRACE_MS = 1 * HOUR_IN_MS;

export const MIN_LEAD_MESSAGE = "Rezervările se pot face cu minim 2 ore înainte.";
export const CANCELLATION_LIMIT_MESSAGE = "Rezervarea nu mai poate fi anulată. Ai depășit limita de anulare.";
export const REMINDER_LIMIT_MESSAGE = "Timpul de anulare după reminder a expirat.";

const toDate = (value?: string | Date | null): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isBookingTooSoon = (startTime?: string | Date | null, now: Date = new Date()): boolean => {
  const bookingDate = toDate(startTime);
  if (!bookingDate) return false;
  return bookingDate.getTime() - now.getTime() < MIN_BOOKING_LEAD_MS;
};

export const getBookingCancellationStatus = (
  startTime?: string | Date | null,
  reminderSentAt?: string | Date | null,
  now: Date = new Date()
): { canCancel: boolean; message?: string } => {
  const reminderDate = toDate(reminderSentAt);
  if (reminderDate && now.getTime() > reminderDate.getTime() + REMINDER_GRACE_MS) {
    return { canCancel: false, message: REMINDER_LIMIT_MESSAGE };
  }

  const bookingDate = toDate(startTime);
  if (!bookingDate) {
    return { canCancel: false };
  }

  if (bookingDate.getTime() - now.getTime() < CANCELLATION_LIMIT_MS) {
    return { canCancel: false, message: CANCELLATION_LIMIT_MESSAGE };
  }

  return { canCancel: true };
};

