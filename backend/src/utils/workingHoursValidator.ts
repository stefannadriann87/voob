/**
 * Working Hours Validator
 * Utilitare pentru validarea working hours în booking creation
 */

const { logger } = require("../lib/logger");

type WorkingHours = {
  [key: string]: {
    enabled: boolean;
    slots: Array<{ start: string; end: string }>;
  };
};

/**
 * Verifică dacă o dată/ora este în working hours
 * @param bookingDate - Data și ora rezervării
 * @param workingHours - Working hours JSON din business sau employee
 * @returns true dacă este în working hours, false altfel
 */
function isWithinWorkingHours(bookingDate: Date, workingHours: WorkingHours | null | undefined): boolean {
  if (!workingHours || typeof workingHours !== "object") {
    // Dacă nu există working hours configurate, permite booking (backward compatibility)
    logger.warn("No working hours configured, allowing booking", { bookingDate });
    return true;
  }

  // Obține ziua săptămânii (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = bookingDate.getDay();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[dayOfWeek];

  // Verifică dacă ziua este activă
  const daySchedule = workingHours[dayName];
  if (!daySchedule || !daySchedule.enabled) {
    return false;
  }

  // Obține ora din booking (format HH:MM)
  const bookingHour = bookingDate.getHours();
  const bookingMinute = bookingDate.getMinutes();
  const bookingTimeMinutes = bookingHour * 60 + bookingMinute;

  // Verifică dacă booking-ul se încadrează în vreun slot
  if (!daySchedule.slots || daySchedule.slots.length === 0) {
    return false;
  }

  for (const slot of daySchedule.slots) {
    const [startHour, startMinute] = slot.start.split(":").map(Number);
    const [endHour, endMinute] = slot.end.split(":").map(Number);
    
    const startTimeMinutes = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    // Verifică dacă booking-ul începe în acest slot
    if (bookingTimeMinutes >= startTimeMinutes && bookingTimeMinutes < endTimeMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * Verifică dacă un interval de booking (start + duration) este complet în working hours
 * @param bookingStart - Data și ora de început
 * @param bookingEnd - Data și ora de sfârșit
 * @param workingHours - Working hours JSON
 * @returns true dacă întreg intervalul este în working hours
 */
function isIntervalWithinWorkingHours(
  bookingStart: Date,
  bookingEnd: Date,
  workingHours: WorkingHours | null | undefined
): boolean {
  if (!workingHours || typeof workingHours !== "object") {
    // Dacă nu există working hours configurate, permite booking
    logger.warn("No working hours configured, allowing booking", { bookingStart, bookingEnd });
    return true;
  }

  // Verifică dacă începutul este în working hours
  if (!isWithinWorkingHours(bookingStart, workingHours)) {
    return false;
  }

  // Verifică dacă sfârșitul este în working hours
  if (!isWithinWorkingHours(bookingEnd, workingHours)) {
    return false;
  }

  // Pentru durate mai lungi, ar trebui să verificăm și intervalul intermediar
  // Dar pentru simplitate, verificăm doar start și end
  // Dacă durata este foarte mare (> 4 ore), ar trebui să verificăm și orele intermediare
  const durationHours = (bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60 * 60);
  if (durationHours > 4) {
    // Pentru durate mari, verificăm și câteva puncte intermediare
    const checkPoints = Math.ceil(durationHours / 2); // Verifică la fiecare 2 ore
    for (let i = 1; i < checkPoints; i++) {
      const checkTime = new Date(bookingStart.getTime() + (i * 2 * 60 * 60 * 1000));
      if (checkTime >= bookingEnd) break;
      if (!isWithinWorkingHours(checkTime, workingHours)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Obține mesajul de eroare pentru working hours
 */
function getWorkingHoursErrorMessage(dayName?: string): string {
  if (dayName) {
    return `Rezervarea nu poate fi făcută în ${dayName}. Business-ul nu este deschis în această zi.`;
  }
  return "Rezervarea nu poate fi făcută în afara orelor de lucru ale business-ului.";
}

module.exports = {
  isWithinWorkingHours,
  isIntervalWithinWorkingHours,
  getWorkingHoursErrorMessage,
};
