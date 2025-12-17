import express = require("express");
import type {
  BusinessType,
  BookingStatus,
} from "@prisma/client";
const Prisma = require("@prisma/client").Prisma;
const { PaymentMethod, BookingPaymentStatus } = require("@prisma/client");
const prisma = require("../lib/prisma");
const {
  sendBookingConfirmationSms,
  sendBookingCancellationSms,
} = require("../services/smsService");
const { getStripeClient } = require("../services/stripeService");
const { sendEmail } = require("../services/emailService");
const { verifyJWT } = require("../middleware/auth");
const { requireBookingAccess } = require("../middleware/requireOwnership");
const { paginationQuerySchema, getPaginationParams, buildPaginationResponse } = require("../validators/paginationSchemas");
const { validate, validateQuery } = require("../middleware/validate");
const {
  createBookingSchema,
  updateBookingSchema,
  bookingIdParamSchema,
  deleteBookingSchema,
} = require("../validators/bookingSchemas");
const { logger } = require("../lib/logger");

const router = express.Router();

const HOUR_IN_MS = 60 * 60 * 1000;
const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;
const CANCELLATION_LIMIT_MS = 23 * HOUR_IN_MS;
const REMINDER_GRACE_MS = 1 * HOUR_IN_MS;

const MIN_LEAD_MESSAGE = "Rezervările se pot face cu minim 2 ore înainte.";
const CANCELLATION_LIMIT_MESSAGE = "Rezervarea nu mai poate fi anulată. Ai depășit limita de anulare.";
const REMINDER_LIMIT_MESSAGE = "Timpul de anulare după reminder a expirat.";

const CONSENT_REQUIRED_TYPES: BusinessType[] = ["MEDICAL_DENTAL", "THERAPY_COACHING"];

const businessNeedsConsent = (type?: BusinessType | null) =>
  !!type && CONSENT_REQUIRED_TYPES.includes(type);

// CRITICAL FIX (TICKET-012): Import working hours validator
const { isIntervalWithinWorkingHours, getWorkingHoursErrorMessage } = require("../utils/workingHoursValidator");

/**
 * POST /booking
 * Creează o nouă rezervare
 * 
 * @route POST /booking
 * @access Private (JWT required)
 * @param {string} clientId - ID-ul clientului (opțional pentru CLIENT, folosește automat userId)
 * @param {string} businessId - ID-ul business-ului
 * @param {string} [serviceId] - ID-ul serviciului (obligatoriu pentru non-SPORT_OUTDOOR)
 * @param {string} [courtId] - ID-ul terenului (obligatoriu pentru SPORT_OUTDOOR)
 * @param {string} [employeeId] - ID-ul angajatului (opțional)
 * @param {string} date - Data și ora rezervării (ISO format)
 * @param {boolean} [paid=false] - Dacă rezervarea este plătită
 * @param {string} [paymentMethod] - Metoda de plată (CARD, OFFLINE)
 * @param {boolean} [paymentReused=false] - Dacă plata a fost reutilizată dintr-o rezervare anulată
 * @param {string} [clientNotes] - Note de la client
 * @param {number} [duration] - Durata în minute (override pentru service duration)
 * @returns {Object} Booking object cu toate detaliile
 * @throws {400} Dacă datele sunt invalide sau rezervarea este prea aproape
 * @throws {403} Dacă clientul nu are acces la business sau business-ul este suspendat
 * @throws {404} Dacă business, service, court sau employee nu există
 * @throws {409} Dacă există suprapunere cu alte rezervări sau este în afara programului
 */
router.post("/", verifyJWT, validate(createBookingSchema), async (req, res) => {
  const {
    clientId,
    businessId,
    serviceId,
    courtId,
    employeeId,
    date,
    paid,
    paymentMethod,
    paymentReused,
    clientNotes,
    duration,
  } = req.body; // Body este deja validat de middleware

  // CRITICAL FIX (TICKET-010): Validare completă pentru date
  const bookingDate = new Date(date);
  
  // Validare: date trebuie să fie valid Date object
  if (isNaN(bookingDate.getTime())) {
    return res.status(400).json({ error: "Data rezervării este invalidă." });
  }

  // Validare: date trebuie să fie în viitor (minimum 2 ore)
  const now = new Date();
  const timeDiff = bookingDate.getTime() - now.getTime();
  if (timeDiff < MIN_BOOKING_LEAD_MS) {
    return res.status(400).json({ error: MIN_LEAD_MESSAGE });
  }

  // Validare: date nu trebuie să fie prea departe în viitor (max 1 an)
  const MAX_BOOKING_ADVANCE_MS = 365 * 24 * 60 * 60 * 1000; // 1 an
  if (timeDiff > MAX_BOOKING_ADVANCE_MS) {
    return res.status(400).json({ error: "Nu poți face rezervări cu mai mult de 1 an înainte." });
  }

  try {
    // Get authenticated user from request
    // CRITICAL FIX (TICKET-015): Use proper type instead of `any`
    interface AuthenticatedRequest extends express.Request {
      user?: {
        userId: string;
        role: string;
        businessId?: string;
      };
    }
    const authReq = req as AuthenticatedRequest;
    const authenticatedUserId = authReq.user?.userId;
    const authenticatedRole = authReq.user?.role;

    // Verify client has access to this business (unless superadmin or business owner)
    if (authenticatedRole === "CLIENT" && authenticatedUserId === clientId) {
      try {
        const clientLink = await prisma.clientBusinessLink.findUnique({
          where: {
            clientId_businessId: {
              clientId,
              businessId,
            },
          },
        });

        if (!clientLink) {
          return res.status(403).json({ 
            error: "Nu ai acces la acest business. Te rugăm să te conectezi la business-ul respectiv." 
          });
        }
      } catch (linkError: any) {
        logger.error("Error checking client business link:", linkError);
        // If link check fails due to DB error, allow booking to proceed
        // (might be a new client or the link table might not exist yet)
      }
    }

    // CRITICAL FIX (TICKET-012): Load business with working hours for validation
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessType: true, status: true, workingHours: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Rezervările sunt oprite temporar." });
    }

    // SPORT_OUTDOOR: folosește courts, nu services
    const isSportOutdoor = business.businessType === "SPORT_OUTDOOR";
    
    let bookingStart: Date;
    let bookingEnd: Date;
    let serviceDurationMinutes: number;
    let court: any = null;
    let service: any = null;
    
    if (isSportOutdoor) {
      // Validare pentru SPORT_OUTDOOR
      if (!courtId) {
        return res.status(400).json({ error: "Terenul (courtId) este obligatoriu pentru business type SPORT_OUTDOOR." });
      }
      if (serviceId) {
        return res.status(400).json({ error: "Serviciile (serviceId) nu sunt permise pentru business type SPORT_OUTDOOR. Folosește terenuri (courtId)." });
      }
      if (employeeId) {
        return res.status(400).json({ error: "Angajații (employeeId) nu sunt permisi pentru business type SPORT_OUTDOOR." });
      }

      // Verifică terenul
      court = await prisma.court.findFirst({
        where: { id: courtId, businessId, isActive: true },
        include: {
          pricing: {
            orderBy: { timeSlot: "asc" },
          },
        },
      });

      if (!court) {
        return res.status(404).json({ error: "Terenul nu a fost găsit sau nu este activ." });
      }

      // CRITICAL FIX (TICKET-010): Validare completă pentru duration în SPORT_OUTDOOR
      // Pentru SPORT_OUTDOOR, durata trebuie să fie multiplu de 60 minute (60, 120, 180, etc.)
      // Dacă nu este specificat, default la 60 minute
      if (duration !== undefined && duration !== null) {
        // Validare: duration trebuie să fie între 60 și 480 minute (1-8 ore)
        if (duration < 60 || duration > 480) {
          return res.status(400).json({ 
            error: "Pentru business type SPORT_OUTDOOR, durata trebuie să fie între 60 și 480 minute (1-8 ore)." 
          });
        }
        if (duration % 60 !== 0) {
          return res.status(400).json({ 
            error: "Pentru business type SPORT_OUTDOOR, durata trebuie să fie multiplu de 60 minute (60, 120, 180, etc.)" 
          });
        }
        serviceDurationMinutes = duration;
      } else {
        serviceDurationMinutes = 60; // Default 1 oră
      }

      bookingStart = new Date(bookingDate);
      bookingEnd = new Date(bookingStart.getTime() + serviceDurationMinutes * 60 * 1000);

      // Note: Overlap check is now done inside the transaction to prevent race conditions
      // Early validation is skipped here to avoid duplicate code - all checks happen atomically in transaction
    } else {
      // Logica normală pentru business types non-SPORT_OUTDOOR
      if (!serviceId) {
        return res.status(400).json({ error: "Serviciul (serviceId) este obligatoriu." });
      }

      service = await prisma.service.findFirst({
        where: { id: serviceId, businessId },
        select: { id: true, duration: true, price: true },
      });

      if (!service) {
        return res.status(404).json({ error: "Serviciul nu a fost găsit pentru acest business." });
      }

      // CRITICAL FIX (TICKET-010): Validare completă pentru duration în business types normale
      // Calculate booking end time based on service duration or override duration
      serviceDurationMinutes = duration ?? service.duration;
      
      // Validare: duration trebuie să fie multiplu de 30 minute pentru business types normale
      if (duration !== undefined && duration !== null) {
        if (duration < 15 || duration > 480) {
          return res.status(400).json({ 
            error: "Durata trebuie să fie între 15 și 480 minute." 
          });
        }
        if (duration % 30 !== 0) {
          return res.status(400).json({ 
            error: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)" 
          });
        }
      }
      
      // Validare: service duration trebuie să fie valid
      if (!service.duration || service.duration < 15 || service.duration > 480) {
        return res.status(400).json({ 
          error: "Durata serviciului este invalidă. Contactează business-ul pentru detalii." 
        });
      }
      
      bookingStart = new Date(bookingDate);
      bookingEnd = new Date(bookingStart.getTime() + serviceDurationMinutes * 60 * 1000);

      // Note: Overlap check is now done inside the transaction to prevent race conditions
      // Early validation is skipped here to avoid duplicate code - all checks happen atomically in transaction
    }

    // CRITICAL FIX (TICKET-012): Validate working hours for business
    try {
      let workingHoursToCheck = business.workingHours as any;
      
      // Dacă există employeeId, verifică working hours ale employee-ului (dacă există)
      if (employeeId && !isSportOutdoor) {
        try {
          const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { workingHours: true },
          });
          
          // Dacă employee are working hours custom, folosește-le; altfel folosește business working hours
          if (employee?.workingHours) {
            workingHoursToCheck = employee.workingHours;
          }
        } catch (employeeError: any) {
          logger.error("Error fetching employee working hours", { error: employeeError, employeeId });
          // Continue with business working hours if employee fetch fails
        }
      }

      // Verifică dacă booking-ul este în working hours
      if (!isIntervalWithinWorkingHours(bookingStart, bookingEnd, workingHoursToCheck)) {
        const dayNames = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
        const dayName = dayNames[bookingStart.getDay()];
        return res.status(409).json({
          error: getWorkingHoursErrorMessage(dayName),
          code: "OUTSIDE_WORKING_HOURS",
          actionable: "Selectează un interval de timp în care business-ul este deschis."
        });
      }
    } catch (workingHoursError: any) {
      logger.error("Error validating working hours", { error: workingHoursError, businessId, employeeId });
      // Continue if working hours validation fails (backward compatibility)
      // Nu blocăm booking-ul dacă validarea working hours eșuează
    }

    // VALIDATION: Check for business holidays
    try {
      const businessHolidays = await prisma.holiday.findMany({
        where: {
          businessId,
          startDate: { lte: bookingEnd },
          endDate: { gte: bookingStart },
        },
      });

      if (businessHolidays.length > 0) {
        const holiday = businessHolidays[0];
        const reason = holiday.reason ? ` (${holiday.reason})` : "";
        return res.status(409).json({
          error: `Intervalul selectat se suprapune cu o perioadă de închidere a business-ului${reason}.`,
        });
      }
    } catch (holidayError: any) {
      logger.error("Error checking business holidays:", holidayError);
      // Continue if holiday check fails
    }

    // VALIDATION: Check for employee holidays (if employee is specified) - nu se aplică pentru SPORT_OUTDOOR
    if (employeeId && !isSportOutdoor) {
      try {
        const employeeHolidays = await prisma.employeeHoliday.findMany({
          where: {
            employeeId,
            startDate: { lte: bookingEnd },
            endDate: { gte: bookingStart },
          },
        });

        if (employeeHolidays.length > 0) {
          const holiday = employeeHolidays[0];
          const reason = holiday.reason ? ` (${holiday.reason})` : "";
          return res.status(409).json({
            error: `Angajatul este în concediu în perioada selectată${reason}.`,
          });
        }
      } catch (employeeHolidayError: any) {
        logger.error("Error checking employee holidays:", employeeHolidayError);
        // Continue if employee holiday check fails
      }
    }

    const needsConsent = businessNeedsConsent(business.businessType);
    const initialStatus: BookingStatus = needsConsent ? "PENDING_CONSENT" : "CONFIRMED";

    const isPaid = paid ?? false;
    const paymentStatus: typeof BookingPaymentStatus[keyof typeof BookingPaymentStatus] = isPaid ? "PAID" : "PENDING";
    const isPaymentReused = paymentReused ?? false;

    // If payment is being reused, find and mark the cancelled paid booking as reused
    if (isPaymentReused) {
      // Find the most recent cancelled paid booking for this client and business
      // that hasn't been reused yet
      const cancelledPaidBooking = await prisma.booking.findFirst({
        where: {
          clientId,
          businessId,
          status: "CANCELLED",
          paid: true,
          paymentReused: false,
        },
        orderBy: {
          date: "desc", // Most recent first
        },
      });

      if (cancelledPaidBooking) {
        // Mark the cancelled booking's payment as reused
        await prisma.booking.update({
          where: { id: cancelledPaidBooking.id },
          data: { paymentReused: true },
        });
      }
    }

    // Verify employee belongs to business if employeeId is provided
    if (employeeId) {
      try {
        // First check if this is the business owner
        const businessOwner = await prisma.business.findUnique({
          where: { id: businessId },
          select: { ownerId: true },
        });

        // If it's the owner, allow it
        if (businessOwner?.ownerId === employeeId) {
          // Owner can be used as employee, continue
        } else {
          // Check if it's an employee of the business
          const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { businessId: true, role: true },
          });

          if (!employee) {
            return res.status(400).json({ 
              error: "Angajatul nu a fost găsit." 
            });
          }

          if (employee.businessId !== businessId) {
            return res.status(400).json({ 
              error: "Angajatul nu aparține acestui business." 
            });
          }

          // Verify employee can perform the service (if serviceId is provided and not SPORT_OUTDOOR)
          if (serviceId && !isSportOutdoor) {
            const employeeService = await prisma.employeeService.findUnique({
              where: {
                employeeId_serviceId: {
                  employeeId: employeeId,
                  serviceId: serviceId,
                },
              },
            });

            // If no association found, check if business has no restrictions (backward compatibility)
            // For now, we allow booking if no association exists (backward compatibility)
            // In the future, you might want to make this stricter
            // if (!employeeService) {
            //   return res.status(400).json({
            //     error: "Angajatul nu poate efectua acest serviciu.",
            //   });
            // }
          }
        }
      } catch (employeeError: any) {
        logger.error("Error verifying employee:", employeeError);
        // Continue if employee verification fails
      }
    }

    logger.info("Creating booking", { clientId, businessId, serviceId, courtId, employeeId, date, initialStatus });
    
    // CRITICAL FIX: Wrap overlap check and booking creation in a transaction to prevent race conditions
    // This ensures that if two users try to book the same slot simultaneously, only one will succeed
    const booking = await prisma.$transaction(async (tx: any) => {
      // Re-check for overlapping bookings within the transaction (with row locking)
      // This prevents race conditions where two requests check overlap at the same time
      const overlapBufferMs = 2 * HOUR_IN_MS;
      
      if (isSportOutdoor) {
        // For SPORT_OUTDOOR: check court overlap
        const overlappingBookings = await tx.booking.findMany({
          where: {
            courtId,
            businessId,
            status: { not: "CANCELLED" },
            date: {
              gte: new Date(bookingStart.getTime() - overlapBufferMs),
              lte: new Date(bookingEnd.getTime() + overlapBufferMs),
            },
          },
          select: {
            id: true,
            date: true,
            duration: true,
          },
        });

        for (const existingBooking of overlappingBookings) {
          const existingStart = new Date(existingBooking.date);
          const existingDuration = existingBooking.duration ?? 60;
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

          if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
            throw new Error("Terenul este deja rezervat pentru această perioadă.");
          }
        }
      } else {
        // For non-SPORT_OUTDOOR: check employee or business overlap
        if (employeeId) {
          const overlappingBookings = await tx.booking.findMany({
            where: {
              employeeId,
              businessId,
              status: { not: "CANCELLED" },
              date: {
                gte: new Date(bookingStart.getTime() - overlapBufferMs),
                lte: new Date(bookingEnd.getTime() + overlapBufferMs),
              },
            },
            select: {
              id: true,
              date: true,
              duration: true,
              service: { select: { duration: true } },
            },
          });

          for (const existingBooking of overlappingBookings) {
            const existingStart = new Date(existingBooking.date);
            const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
            const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

            if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
              throw new Error("Există deja o rezervare care se suprapune cu intervalul selectat pentru acest angajat.");
            }
          }
        } else {
          const overlappingBookings = await tx.booking.findMany({
            where: {
              businessId,
              employeeId: null,
              status: { not: "CANCELLED" },
              date: {
                gte: new Date(bookingStart.getTime() - overlapBufferMs),
                lte: new Date(bookingEnd.getTime() + overlapBufferMs),
              },
            },
            select: {
              id: true,
              date: true,
              duration: true,
              service: { select: { duration: true } },
            },
          });

          for (const existingBooking of overlappingBookings) {
            const existingStart = new Date(existingBooking.date);
            const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
            const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

            if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
              throw new Error("Există deja o rezervare care se suprapune cu intervalul selectat.");
            }
          }
        }
      }

      // Prepare booking data
      // CRITICAL FIX (TICKET-015): Use proper type instead of `any`
      type BookingCreateData = {
        client: { connect: { id: string } };
        business: { connect: { id: string } };
        service?: { connect: { id: string } };
        court?: { connect: { id: string } };
        employee?: { connect: { id: string } };
        date: Date;
        paid: boolean;
        paymentMethod: string;
        paymentStatus: string;
        paymentReused: boolean;
        status: string;
        duration?: number;
        price?: number;
        clientNotes?: string | null;
      };
      const bookingData: BookingCreateData = {
        client: { connect: { id: clientId } },
        business: { connect: { id: businessId } },
        date: new Date(date),
        paid: isPaid,
        paymentMethod: paymentMethod ?? PaymentMethod.OFFLINE,
        paymentStatus,
        paymentReused: isPaymentReused,
        status: initialStatus,
      };

      // SPORT_OUTDOOR: folosește courtId, nu serviceId
      if (isSportOutdoor) {
        bookingData.court = { connect: { id: courtId } };
        bookingData.duration = serviceDurationMinutes;
        
        // Calculează prețul bazat pe timeSlot
        const bookingHour = bookingDate.getHours();
        if (court && court.pricing) {
          let bookingPrice = 0;
          for (const pricing of court.pricing) {
            // CRITICAL FIX (TICKET-015): Handle optional startHour/endHour
            if (pricing.startHour !== undefined && pricing.endHour !== undefined) {
              if (bookingHour >= pricing.startHour && bookingHour < pricing.endHour) {
                bookingPrice = pricing.price;
                break;
              }
            } else {
              // Fallback: use timeSlot parsing if startHour/endHour not available
              // This is a temporary fix - ideally pricing should always have startHour/endHour
              bookingPrice = pricing.price;
            }
          }
          bookingData.price = bookingPrice;
        }
      } else {
        bookingData.service = { connect: { id: serviceId } };
        
        if (duration) {
          bookingData.duration = duration;
        }

        if (employeeId) {
          bookingData.employee = { connect: { id: employeeId } };
        }

        if (clientNotes) {
          bookingData.clientNotes = clientNotes;
        }
      }

      // CRITICAL FIX (TICKET-002): Create booking and payment atomically within the transaction
      const createdBooking = await tx.booking.create({
        data: bookingData,
        include: {
          client: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true, businessType: true } },
          service: !isSportOutdoor,
          court: isSportOutdoor ? { include: { pricing: true } } : false,
          employee: employeeId && !isSportOutdoor ? { select: { id: true, name: true, email: true } } : false,
          consentForm: true,
        },
      });

      // CRITICAL FIX (TICKET-002): Create Payment record for offline payments (atomic with booking creation)
      if (isPaid && (paymentMethod === PaymentMethod.OFFLINE || paymentMethod === PaymentMethod.CASH)) {
        // Calculate payment amount
        let paymentAmount = 0;
        if (isSportOutdoor) {
          // For SPORT_OUTDOOR: use bookingData.price (calculated from court pricing)
          paymentAmount = bookingData.price ?? 0;
        } else {
          // For non-SPORT_OUTDOOR: use service.price
          paymentAmount = service?.price ?? 0;
        }

        if (paymentAmount > 0) {
          await tx.payment.create({
            data: {
              businessId,
              bookingId: createdBooking.id,
              amount: paymentAmount,
              currency: "RON",
              method: paymentMethod === PaymentMethod.OFFLINE ? PaymentMethod.OFFLINE : PaymentMethod.CASH,
              status: "SUCCEEDED", // Offline payments are considered succeeded immediately
              gateway: "offline",
              metadata: {
                bookingId: createdBooking.id,
                clientId,
                paymentMethod: paymentMethod,
              },
            },
          });
        } else {
          logger.warn("Payment amount is 0 for paid booking", {
            bookingId: createdBooking.id,
            isSportOutdoor,
            servicePrice: service?.price,
            bookingPrice: bookingData.price,
          });
        }
      }

      return createdBooking;
    }, {
      // Use Serializable isolation level for maximum protection against race conditions
      // This ensures that concurrent transactions are serialized, preventing phantom reads
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000, // 10 second timeout
    });

    // Trimite SMS de confirmare dacă rezervarea este confirmată (nu necesită consimțământ)
    if (initialStatus === "CONFIRMED" && booking.client.phone) {
      // Fire-and-forget: nu așteptăm răspunsul pentru a nu bloca request-ul
      const serviceOrCourtName = isSportOutdoor ? booking.court?.name : booking.service?.name;
      sendBookingConfirmationSms(
        booking.client.name || "Client",
        booking.client.phone,
        booking.business.name || "Business",
        booking.date,
        serviceOrCourtName,
        booking.business.id
      ).catch((error: unknown) => {
        logger.error("Failed to send confirmation SMS", error);
        // Nu aruncăm eroarea, doar logăm
      });
    }

    return res.status(201).json(booking);
  } catch (error: any) {
    logger.error("Booking creation failed", { 
      error: error?.message || error, 
      stack: error instanceof Error ? error.stack : undefined, 
      code: error?.code,
      meta: error?.meta,
      body: req.body 
    });
    
    // Return more descriptive error messages
    if (error instanceof Error) {
      // Check for Prisma errors
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for overlap errors (thrown from transaction)
      if (errorMessage.includes("deja rezervat") || 
          errorMessage.includes("se suprapune") ||
          errorMessage.includes("Terenul este deja rezervat") ||
          errorMessage.includes("Există deja o rezervare")) {
        return res.status(409).json({ 
          error: errorMessage 
        });
      }
      
      // Check for foreign key constraint errors
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("Record to update not found") ||
          errorMessage.includes("Record to connect not found") ||
          errorCode === "P2025") {
        return res.status(400).json({ 
          error: "Date invalide. Verifică că business-ul, serviciul și clientul există." 
        });
      }
      
      // Check for unique constraint errors
      if (errorMessage.includes("Unique constraint") || 
          errorMessage.includes("duplicate key") ||
          errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Rezervarea există deja pentru acest interval." 
        });
      }
      
      // Check for transaction serialization errors (race condition detected)
      if (errorCode === "P2034" || errorMessage.includes("serialization failure") || errorMessage.includes("could not serialize")) {
        return res.status(409).json({ 
          error: "Rezervarea nu a putut fi procesată. Te rugăm să încerci din nou." 
        });
      }
      
      // Check for Prisma connection/database errors
      if (errorMessage.includes("prisma") || 
          errorMessage.includes("database") || 
          errorMessage.includes("connection") ||
          errorCode === "P1001" ||
          errorCode === "P1002" ||
          errorCode === "P1008") {
        // Return detailed error in development
        const isDevelopment = process.env.NODE_ENV !== "production";
        return res.status(500).json({ 
          error: isDevelopment 
            ? `Eroare de conexiune la baza de date: ${errorMessage}` 
            : "Eroare de conexiune la baza de date. Te rugăm să încerci din nou." 
        });
      }
      
      // Return the actual error message in development, generic in production
      const isDevelopment = process.env.NODE_ENV !== "production";
      return res.status(500).json({ 
        error: isDevelopment 
          ? `Eroare la crearea rezervării: ${errorMessage} (Code: ${errorCode})` 
          : "Eroare la crearea rezervării. Te rugăm să încerci din nou." 
      });
    }
    
    return res.status(500).json({ error: "Eroare la crearea rezervării. Te rugăm să încerci din nou." });
  }
});

router.get("/", verifyJWT, validateQuery(paginationQuerySchema), async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string; businessId?: string } };
  const userRole = authReq.user?.role;
  const userId = authReq.user?.userId;
  const userBusinessId = authReq.user?.businessId;
  
  // Parse pagination parameters
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const { skip, take } = getPaginationParams(page, limit);

  try {
    // Build where clause based on user role
    // CRITICAL FIX (TICKET-015): Use proper Prisma type instead of `any`
    type BookingWhereInput = {
      clientId?: string | undefined;
      businessId?: string | { in: string[] } | undefined;
      employeeId?: string | undefined;
      status?: { not: string } | undefined;
      date?: { gte?: Date; lte?: Date } | undefined;
    };
    const where: BookingWhereInput = {};
    
    if (userRole === "CLIENT" && userId) {
      where.clientId = userId;
    } else if (userRole === "BUSINESS") {
      // CRITICAL FIX (TICKET-015): Use proper types instead of `any`
      type BusinessIdResult = { id: string };
      const businesses = await prisma.business.findMany({ 
        where: { ownerId: userId }, 
        select: { id: true } 
      });
      where.businessId = userBusinessId || { in: businesses.map((b: BusinessIdResult) => b.id) };
    } else if (userRole === "EMPLOYEE") {
      // Employees can see bookings for their business
      const employee = await prisma.user.findUnique({ where: { id: userId }, select: { businessId: true } });
      if (employee?.businessId) {
        where.businessId = employee.businessId;
      } else {
        return res.status(403).json({ error: "Nu ai permisiunea de a vedea rezervările." });
      }
    } else if (userRole !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a vedea rezervările." });
    }
    // SUPERADMIN can see all bookings (no where clause)
    const bookings = await prisma.booking.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      skip,
      take,
      orderBy: { date: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: true,
        employee: { select: { id: true, name: true, email: true } },
        consentForm: true,
      },
    });

    // Get total count for pagination
      const total = await prisma.booking.count({ 
      where: Object.keys(where).length > 0 ? where : undefined 
    });
  
  return res.json(buildPaginationResponse(bookings, total, page, limit));
  } catch (error) {
    logger.error("Failed to list bookings", error);
    return res.status(500).json({ error: "Eroare la listarea rezervărilor." });
  }
});

/**
 * PUT /booking/:id
 * Actualizează o rezervare existentă
 * 
 * @route PUT /booking/:id
 * @access Private (JWT required, booking access required)
 * @param {string} id - ID-ul rezervării
 * @param {string} [serviceId] - ID-ul noului serviciu
 * @param {string} [employeeId] - ID-ul noului angajat (null pentru a elimina)
 * @param {string} [date] - Noua dată (ISO format)
 * @param {string} [clientNotes] - Note actualizate de la client
 * @param {string} [status] - Statusul rezervării
 * @param {number} [duration] - Durata în minute (override)
 * @param {boolean} [paid] - Statusul de plată
 * @returns {Object} Booking object actualizat
 * @throws {400} Dacă datele sunt invalide
 * @throws {403} Dacă business-ul este suspendat sau user-ul nu are acces
 * @throws {404} Dacă rezervarea nu există
 * @throws {409} Dacă există suprapunere sau este în afara programului
 */
router.put("/:id", verifyJWT, requireBookingAccess("id"), validate(updateBookingSchema), async (req, res) => {
  const { id } = req.params;
  const { serviceId, employeeId, date, clientNotes, status, duration, paid } = updateBookingSchema.parse(req.body);

  try {
    // Fetch booking with business info for status check
    const bookingWithBusiness = await prisma.booking.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, duration: true } },
        business: { select: { id: true, status: true } },
      },
    });

    if (!bookingWithBusiness) {
      return res.status(404).json({ error: "Rezervarea nu există." });
    }

    // Check if business is suspended
    if (bookingWithBusiness.business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Modificările sunt oprite temporar." });
    }

    const existingBooking = bookingWithBusiness;

    // Determine the final values after update
    const finalServiceId = serviceId ?? existingBooking.serviceId;
    const finalEmployeeId = employeeId !== undefined ? (employeeId || null) : existingBooking.employeeId;
    const finalDate = date ? new Date(date) : existingBooking.date;

    // Get service duration (use existing service if serviceId not changed, or fetch new one)
    let serviceDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
    if (serviceId && serviceId !== existingBooking.serviceId) {
      const newService = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { duration: true },
      });
      if (newService) {
        serviceDuration = newService.duration;
      }
    }

    // Calculate booking end time
    const bookingStart = new Date(finalDate);
    const bookingEnd = new Date(bookingStart.getTime() + serviceDuration * 60 * 1000);

    // VALIDATION: Check for overlapping bookings (excluding the current booking being updated)
    const overlapBufferMs = 2 * HOUR_IN_MS; // 2 ore buffer
    if (finalEmployeeId) {
      const overlappingBookings = await prisma.booking.findMany({
        where: {
          employeeId: finalEmployeeId,
          businessId: existingBooking.businessId,
          id: { not: id }, // Exclude the current booking
          status: { not: "CANCELLED" },
          date: {
            gte: new Date(bookingStart.getTime() - overlapBufferMs),
            lte: new Date(bookingEnd.getTime() + overlapBufferMs),
          },
        },
        include: {
          service: { select: { duration: true } },
        },
      });

      for (const overlappingBooking of overlappingBookings) {
        const existingStart = new Date(overlappingBooking.date);
        const existingDuration = overlappingBooking.duration ?? overlappingBooking.service?.duration ?? 60;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

        if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
          return res.status(409).json({
            error: "Există deja o rezervare care se suprapune cu intervalul selectat pentru acest angajat.",
          });
        }
      }
    } else {
      // Check for overlapping bookings without employee
      const overlappingBookings = await prisma.booking.findMany({
        where: {
          businessId: existingBooking.businessId,
          employeeId: null,
          id: { not: id },
          status: { not: "CANCELLED" },
          date: {
            gte: new Date(bookingStart.getTime() - overlapBufferMs),
            lte: new Date(bookingEnd.getTime() + overlapBufferMs),
          },
        },
        include: {
          service: { select: { duration: true } },
        },
      });

      for (const overlappingBooking of overlappingBookings) {
        const existingStart = new Date(overlappingBooking.date);
        const existingDuration = overlappingBooking.duration ?? overlappingBooking.service?.duration ?? 60;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

        if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
          return res.status(409).json({
            error: "Există deja o rezervare care se suprapune cu intervalul selectat.",
          });
        }
      }
    }

    // VALIDATION: Check for business holidays
    const businessHolidays = await prisma.holiday.findMany({
      where: {
        businessId: existingBooking.businessId,
        startDate: { lte: bookingEnd },
        endDate: { gte: bookingStart },
      },
    });

    if (businessHolidays.length > 0) {
      const holiday = businessHolidays[0];
      const reason = holiday.reason ? ` (${holiday.reason})` : "";
      return res.status(409).json({
        error: `Intervalul selectat se suprapune cu o perioadă de închidere a business-ului${reason}.`,
      });
    }

    // VALIDATION: Check for employee holidays (if employee is specified)
    if (finalEmployeeId) {
      const employeeHolidays = await prisma.employeeHoliday.findMany({
        where: {
          employeeId: finalEmployeeId,
          startDate: { lte: bookingEnd },
          endDate: { gte: bookingStart },
        },
      });

      if (employeeHolidays.length > 0) {
        const holiday = employeeHolidays[0];
        const reason = holiday.reason ? ` (${holiday.reason})` : "";
        return res.status(409).json({
          error: `Angajatul este în concediu în perioada selectată${reason}.`,
        });
      }
    }

    const updateData: {
      serviceId?: string;
      employeeId?: string | null;
      date?: Date;
      paid?: boolean;
    } = {};

    if (serviceId) updateData.serviceId = serviceId;
    if (employeeId !== undefined) updateData.employeeId = employeeId || null;
    if (date) updateData.date = new Date(date);
    if (paid !== undefined) updateData.paid = paid;

    const booking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: true,
        employee: { select: { id: true, name: true, email: true } },
        consentForm: true,
      },
    });

    return res.json(booking);
  } catch (error) {
    logger.error("Booking update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea rezervării." });
  }
});

/**
 * DELETE /booking/:id
 * Anulează sau șterge o rezervare
 * 
 * @route DELETE /booking/:id
 * @access Private (JWT required, booking access required)
 * @param {string} id - ID-ul rezervării
 * @param {boolean} [refundPayment=false] - Dacă să se facă refund pentru plăți cu card
 * @returns {Object} Mesaj de succes
 * @description
 * - Pentru rezervări plătite: setează status la CANCELLED (nu șterge)
 * - Pentru rezervări neplătite: șterge complet rezervarea
 * - Trimite email și SMS de notificare clientului
 * - Dacă refundPayment=true, procesează refund prin Stripe
 * @throws {400} Dacă rezervarea a fost deja anulată
 * @throws {403} Dacă user-ul nu are acces sau limita de anulare a expirat
 * @throws {404} Dacă rezervarea nu există
 */
router.delete("/:id", verifyJWT, requireBookingAccess("id"), async (req, res) => {
  // Validate params
  const { id } = bookingIdParamSchema.parse({ id: req.params.id });
  // Validate body if present
  const body = req.body && Object.keys(req.body).length > 0 ? deleteBookingSchema.parse(req.body) : {};
  const { refundPayment } = body;

  try {
    const authReq = req as express.Request & { user?: { userId: string; role: string; businessId?: string } };
    const userRole = authReq.user?.role;
    const userId = authReq.user?.userId;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        consentForm: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, ownerId: true, employees: { select: { id: true } }, status: true } },
        service: { select: { id: true, name: true, price: true } },
        employee: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Rezervarea nu există sau a fost deja ștearsă." });
    }

    // If booking is already cancelled, return error
    // IMPORTANT: Verificăm înainte de orice altă operațiune pentru a preveni trimiterea multiplă de email-uri
    if (booking.status === "CANCELLED") {
      return res.status(400).json({ error: "Rezervarea a fost deja anulată." });
    }

    // Time limits only apply to clients
    // Business, employee, and superadmin can cancel anytime
    // Check user permissions
    const isBusinessOwner = booking.business.ownerId === userId;
    // CRITICAL FIX (TICKET-015): Use proper type instead of `any`
    type Employee = { id: string; name: string; email: string; phone: string | null; specialization: string | null; avatar: string | null };
    const isEmployee = booking.business.employees.some((emp: Employee) => emp.id === userId);
    const isSuperAdmin = userRole === "SUPERADMIN";
    const isClient = userRole === "CLIENT";

    const bypassTimeLimits = isBusinessOwner || isEmployee || isSuperAdmin;

    if (!bypassTimeLimits) {
      const now = new Date();
      const bookingDateObj = new Date(booking.date);
      if (booking.reminderSentAt) {
        const reminderDate = new Date(booking.reminderSentAt);
        if (!Number.isNaN(reminderDate.getTime()) && now.getTime() > reminderDate.getTime() + REMINDER_GRACE_MS) {
          return res.status(400).json({ error: REMINDER_LIMIT_MESSAGE });
        }
      }

      if (bookingDateObj.getTime() - now.getTime() < CANCELLATION_LIMIT_MS) {
        return res.status(400).json({ error: CANCELLATION_LIMIT_MESSAGE });
      }
    }

    // Salvează datele pentru notificări înainte de anulare
    const clientName = booking.client?.name || "Client";
    const clientEmail = booking.client?.email;
    const clientPhone = booking.client?.phone;
    const businessName = booking.business?.name || "Business";
    const bookingDate = booking.date;
    const isPaid = booking.paid === true;
    const serviceName = booking.service?.name || "Serviciu";
    const servicePrice = booking.service?.price || 0;
    const employeeName = booking.employee?.name;

    // Găsește Payment asociat cu booking-ul (dacă există)
    const payment = isPaid
      ? await prisma.payment.findFirst({
          where: {
            bookingId: id,
            status: "SUCCEEDED",
          },
        })
      : null;

    let refundPerformed = false;
    let refundError: Error | null = null;

    // LOGICA DE REFUND:
    // - Dacă clientul anulează: refund automat pentru CARD, credit pentru OFFLINE
    // - Dacă business/employee anulează: business decide (refundPayment parameter)
    const shouldRefund = isClient
      ? isPaid && booking.paymentMethod === "CARD" && payment?.externalPaymentId
      : refundPayment === true && isPaid && payment?.externalPaymentId;

    // Dacă rezervarea e plătită și există Payment cu Stripe, procesează refund-ul
    if (shouldRefund && payment) {
      try {
        // IMPORTANT FIX: Verifică dacă payment-ul este deja REFUNDED în DB (înainte de orice altă operațiune)
        if (payment.status === "REFUNDED") {
          logger.warn("Payment already refunded in DB", { paymentId: payment.id, bookingId: id });
          refundPerformed = true; // Consideră că refund-ul a fost deja făcut
        } else {
          // Verifică dacă payment-ul are externalPaymentId
          if (!payment.externalPaymentId) {
            logger.warn("Payment has no externalPaymentId, cannot process refund", { 
              paymentId: payment.id, 
              bookingId: id 
            });
            refundError = new Error("Payment-ul nu are externalPaymentId asociat.");
          } else {
            const stripe = getStripeClient();
            // Caută PaymentIntent sau Charge pentru refund

            try {
              // Încearcă să găsească PaymentIntent
              const paymentIntent = await stripe.paymentIntents.retrieve(payment.externalPaymentId);
              if (paymentIntent.status === "succeeded") {
                // Găsește charge-ul asociat
                const charges = await stripe.charges.list({
                  payment_intent: payment.externalPaymentId,
                  limit: 1,
                });

                if (charges.data.length > 0) {
                  const charge = charges.data[0];
                  
                  // IMPORTANT FIX: Verifică dacă charge-ul are deja refund
                  if (charge.refunded) {
                    logger.warn("Charge already refunded", { chargeId: charge.id, bookingId: id });
                    refundPerformed = true; // Consideră că refund-ul a fost deja făcut
                  } else {
                    // IMPORTANT FIX: Validare amount - folosește amount-ul minim pentru a evita over-refund
                    const chargeAmount = charge.amount; // în cenți
                    const paymentAmountCents = Math.round(payment.amount * 100);
                    const refundAmount = Math.min(chargeAmount, paymentAmountCents);

                    // Face refund complet
                    const refund = await stripe.refunds.create({
                      charge: charge.id,
                      amount: refundAmount,
                    });

                    refundPerformed = true;
                    logger.info(`Refund created for booking ${id}: ${refund.id}`, {
                      refundAmount,
                      chargeAmount,
                      paymentAmountCents,
                    });
                  }
                }
              }
            } catch (stripeError: any) {
            // Dacă nu e PaymentIntent, poate fi un Charge direct
            if (stripeError.code === "resource_missing") {
              try {
                const charge = await stripe.charges.retrieve(payment.externalPaymentId);
                
                // IMPORTANT FIX: Verifică dacă charge-ul are deja refund
                if (charge.refunded) {
                  logger.warn("Charge already refunded", { chargeId: charge.id, bookingId: id });
                  refundPerformed = true; // Consideră că refund-ul a fost deja făcut
                } else if (charge.paid) {
                  // IMPORTANT FIX: Validare amount - folosește amount-ul minim pentru a evita over-refund
                  const chargeAmount = charge.amount; // în cenți
                  const paymentAmountCents = Math.round(payment.amount * 100);
                  const refundAmount = Math.min(chargeAmount, paymentAmountCents);

                  const refund = await stripe.refunds.create({
                    charge: charge.id,
                    amount: refundAmount,
                  });
                  refundPerformed = true;
                  logger.info(`Refund created for booking ${id}: ${refund.id}`, {
                    refundAmount,
                    chargeAmount,
                    paymentAmountCents,
                  });
                }
              } catch (chargeError: any) {
                refundError = new Error(`Stripe refund failed: ${chargeError.message}`);
                logger.error("Stripe refund error", chargeError);
              }
            } else {
              refundError = new Error(`Stripe refund failed: ${stripeError.message}`);
              logger.error("Stripe refund error", stripeError);
            }
          }
          }
        }

        // Actualizează status Payment la REFUNDED dacă refund-ul a reușit
        if (refundPerformed && payment) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "REFUNDED" },
          });
        }
      } catch (error: any) {
        refundError = error;
        logger.error("Refund processing failed", error);
        // Nu aruncăm eroarea aici, continuăm cu anularea booking-ului
        // dar vom informa utilizatorul despre problema de refund
      }
    }

    // IMPORTANT: Folosim updateMany cu condiție pentru a preveni race conditions și trimiterea multiplă de email-uri
    // Actualizăm doar dacă status-ul nu este deja CANCELLED
    let bookingWasCancelled = false;
    
    if (isPaid) {
      // If booking is paid, set status to CANCELLED instead of deleting
      // This allows the client to reuse the payment for a new booking (if no refund)
      const updateResult = await prisma.booking.updateMany({
        where: { 
          id,
          status: { not: "CANCELLED" } // Actualizează doar dacă nu este deja anulat
        },
        data: { status: "CANCELLED" },
      });
      bookingWasCancelled = updateResult.count > 0;
    } else {
      // For unpaid bookings, we can delete them completely
      // Verificăm dacă booking-ul există și nu este deja anulat înainte de ștergere
      const existingBooking = await prisma.booking.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      
      if (existingBooking && existingBooking.status !== "CANCELLED") {
        await prisma.$transaction(async (tx: any) => {
          if (booking.consentForm) {
            await tx.consentForm.delete({ where: { bookingId: id } });
          }
          await tx.booking.delete({ where: { id } });
        });
        bookingWasCancelled = true;
      }
    }
    
    // Dacă booking-ul a fost deja anulat de alt request, nu trimitem email-uri
    if (!bookingWasCancelled) {
      logger.warn("Booking was already cancelled, skipping notifications", { bookingId: id });
      return res.status(400).json({ error: "Rezervarea a fost deja anulată." });
    }

    // Trimite SMS de anulare după anularea rezervării
    if (clientPhone) {
      // Fire-and-forget: nu așteptăm răspunsul pentru a nu bloca request-ul
      sendBookingCancellationSms(
        clientName,
        clientPhone,
        businessName,
        bookingDate,
        booking.business?.id
      ).catch(
        (error: unknown) => {
          logger.error("Failed to send cancellation SMS", error);
          // Nu aruncăm eroarea, doar logăm
        }
      );
    }

    // Trimite email de notificare clientului
    if (clientEmail) {
      const isCancelledByBusiness = isBusinessOwner || isEmployee || isSuperAdmin;
      const bookingDateFormatted = new Date(bookingDate).toLocaleString("ro-RO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let emailSubject = "Rezervarea ta a fost anulată";
      let emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #6366F1; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #6366F1; }
            .refund-info { background: #e8f5e9; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #4caf50; }
            .credit-info { background: #fff3e0; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #ff9800; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${emailSubject}</h2>
            </div>
            <div class="content">
              <p>Bună ${clientName},</p>
              ${isCancelledByBusiness ? `<p>Ne pare rău să te informăm că rezervarea ta a fost anulată de către <strong>${businessName}</strong>.</p>` : `<p>Rezervarea ta a fost anulată.</p>`}
              
              <div class="info-box">
                <h3>Detalii rezervare:</h3>
                <p><strong>Data și ora:</strong> ${bookingDateFormatted}</p>
                <p><strong>Serviciu:</strong> ${serviceName}</p>
                ${employeeName ? `<p><strong>Specialist:</strong> ${employeeName}</p>` : ""}
                <p><strong>Preț:</strong> ${servicePrice.toFixed(2)} RON</p>
              </div>

              ${isPaid
                ? refundPerformed
                  ? `<div class="refund-info">
                      <h3>💰 Refund procesat</h3>
                      <p>Plata ta în valoare de <strong>${servicePrice.toFixed(2)} RON</strong> va fi returnată în contul tău în 5-10 zile lucrătoare.</p>
                      <p>Dacă nu primești refund-ul în acest interval, te rugăm să ne contactezi.</p>
                    </div>`
                  : booking.paymentMethod === "CARD"
                  ? `<div class="credit-info">
                      <h3>💳 Credit disponibil</h3>
                      <p>Plata ta în valoare de <strong>${servicePrice.toFixed(2)} RON</strong> poate fi reutilizată pentru o nouă rezervare.</p>
                      <p>Poți folosi acest credit când faci o nouă programare la <strong>${businessName}</strong>.</p>
                    </div>`
                  : `<div class="credit-info">
                      <h3>💳 Credit disponibil</h3>
                      <p>Plata ta în valoare de <strong>${servicePrice.toFixed(2)} RON</strong> poate fi reutilizată pentru o nouă rezervare.</p>
                      <p>Poți folosi acest credit când faci o nouă programare la <strong>${businessName}</strong>.</p>
                    </div>`
                : ""}

              <p>Dacă ai întrebări sau dorești să faci o nouă rezervare, te rugăm să ne contactezi.</p>
              
              <div class="footer">
                <p>Cu respect,<br>Echipa VOOB</p>
                <p>Acest email a fost trimis automat. Te rugăm să nu răspunzi la acest email.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      sendEmail({
        to: clientEmail,
        subject: emailSubject,
        html: emailHtml,
      }).catch((error: unknown) => {
        logger.error("Failed to send cancellation email", error);
        // Nu aruncăm eroarea, doar logăm
      });
    }

    // Returnează răspuns cu informații despre refund
    let successMessage = "Rezervarea a fost anulată cu succes.";
    if (isPaid) {
      if (refundPerformed) {
        successMessage = isClient
          ? "Rezervarea a fost anulată și refund-ul a fost procesat. Veți primi banii înapoi în 5-10 zile lucrătoare."
          : "Rezervarea a fost anulată și refund-ul a fost procesat.";
      } else if (isClient && booking.paymentMethod === "CARD") {
        // Client a anulat dar refund-ul nu s-a putut face (eroare)
        successMessage = "Rezervarea a fost anulată. Refund-ul va fi procesat în curând.";
      } else if (isClient && booking.paymentMethod === "OFFLINE") {
        successMessage = "Rezervarea a fost anulată. Plata poate fi reutilizată pentru o nouă rezervare.";
      } else if (!isClient) {
        successMessage = "Rezervarea a fost anulată. Clientul poate reutiliza plata pentru o nouă rezervare.";
      }
    }

    return res.json({
      success: true,
      refundPerformed,
      refundError: refundError ? refundError.message : null,
      message: successMessage,
    });
  } catch (error) {
    logger.error("Booking deletion failed", error);
    const errorMessage = error instanceof Error ? error.message : "Eroare necunoscută";
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Booking deletion error details", { errorMessage, errorStack, bookingId: id });
    return res.status(500).json({ 
      error: "Eroare la anularea rezervării.",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    });
  }
});

/**
 * POST /booking/confirm
 * Confirmă o rezervare (pentru flow-uri cu payment intent)
 * 
 * @route POST /booking/confirm
 * @access Private (JWT required)
 * @param {string} paymentIntentId - ID-ul payment intent-ului de la Stripe
 * @returns {Object} Booking object confirmat
 * @throws {400} Dacă payment intent-ul nu există sau este invalid
 * @throws {404} Dacă rezervarea asociată nu există
 * @throws {409} Dacă rezervarea a fost deja confirmată sau anulată
 */
router.post("/confirm", verifyJWT, async (req, res) => {
  const { paymentIntentId }: { paymentIntentId?: string } = req.body;

  // CRITICAL FIX (TICKET-011): Validare completă pentru paymentIntentId
  if (!paymentIntentId || typeof paymentIntentId !== "string" || paymentIntentId.trim().length === 0) {
    return res.status(400).json({ 
      error: "paymentIntentId este obligatoriu.",
      code: "MISSING_PAYMENT_INTENT_ID",
      actionable: "Asigură-te că furnizezi un paymentIntentId valid."
    });
  }

  // Validare format paymentIntentId (Stripe format: pi_xxx)
  if (!paymentIntentId.startsWith("pi_") && !paymentIntentId.startsWith("cs_")) {
    return res.status(400).json({ 
      error: "Format paymentIntentId invalid.",
      code: "INVALID_PAYMENT_INTENT_FORMAT",
      actionable: "Asigură-te că folosești un paymentIntentId valid de la Stripe."
    });
  }

  try {
    // CRITICAL FIX (TICKET-011): Error handling robust pentru database query
    let payment;
    try {
      payment = await prisma.payment.findFirst({
        where: { externalPaymentId: paymentIntentId },
      });
    } catch (dbError: any) {
      logger.error("Database error fetching payment", { 
        error: dbError.message, 
        paymentIntentId 
      });
      return res.status(500).json({ 
        error: "Nu am putut verifica statusul plății. Te rugăm să încerci din nou.",
        code: "DATABASE_ERROR",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
      });
    }

    if (!payment) {
      return res.status(404).json({ 
        error: "Plata nu a fost găsită în sistem.",
        code: "PAYMENT_NOT_FOUND",
        actionable: "Verifică că ai completat procesul de plată sau contactează suportul."
      });
    }

    // CRITIC FIX: Verifică dacă payment-ul este deja confirmat și are booking
    if (payment.status === "SUCCEEDED" && payment.bookingId) {
      // Payment deja procesat, returnează booking existent
      const existing = await prisma.booking.findUnique({
        where: { id: payment.bookingId },
        include: {
          client: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true, businessType: true } },
          service: true,
          employee: { select: { id: true, name: true, email: true } },
          consentForm: true,
        },
      });
      if (existing) {
        return res.json(existing);
      }
    }

    // CRITICAL FIX (TICKET-011): Error handling robust pentru Stripe status check
    // Verifică dacă payment-ul este SUCCEEDED înainte de a crea booking
    // Dacă DB nu e actualizat, verifică direct cu Stripe
    if (payment.status !== "SUCCEEDED") {
      const stripe = getStripeClient();
      if (!stripe) {
        logger.error("Stripe client not initialized");
        return res.status(500).json({ 
          error: "Serviciul de plată nu este disponibil momentan.",
          code: "PAYMENT_GATEWAY_UNAVAILABLE",
          actionable: "Te rugăm să încerci din nou în câteva momente."
        });
      }

      let stripeIntent;
      try {
        stripeIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (stripeError: any) {
        logger.error("Stripe API error retrieving payment intent", { 
          error: stripeError.message, 
          code: stripeError.code,
          type: stripeError.type,
          paymentIntentId
        });

        if (stripeError.type === "StripeInvalidRequestError") {
          return res.status(400).json({ 
            error: "Payment intent invalid sau expirat.",
            code: "INVALID_PAYMENT_INTENT",
            actionable: "Te rugăm să inițiezi o nouă plată."
          });
        }

        return res.status(500).json({ 
          error: "Nu am putut verifica statusul plății. Te rugăm să încerci din nou.",
          code: "STRIPE_ERROR",
          actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
        });
      }
      
      if (stripeIntent.status === "succeeded") {
        // Stripe confirmă plata - actualizează DB-ul
        try {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED" },
          });
          logger.info("Payment status updated from Stripe", { paymentId: payment.id, stripeStatus: stripeIntent.status });
        } catch (updateError: any) {
          logger.error("Database error updating payment status", { 
            error: updateError.message, 
            paymentId: payment.id 
          });
          // Continue anyway - payment is succeeded in Stripe
        }
      } else if (stripeIntent.status === "requires_payment_method") {
        return res.status(400).json({ 
          error: "Plata nu a fost completată. Te rugăm să încerci din nou.",
          code: "PAYMENT_REQUIRES_METHOD",
          actionable: "Completează procesul de plată sau încearcă cu o altă metodă de plată."
        });
      } else if (stripeIntent.status === "canceled") {
        return res.status(400).json({ 
          error: "Plata a fost anulată.",
          code: "PAYMENT_CANCELED",
          actionable: "Te rugăm să inițiezi o nouă plată."
        });
      } else {
        // Stripe nu confirmă plata
        return res.status(400).json({ 
          error: `Plata nu este confirmată. Status: ${stripeIntent.status}`,
          code: "PAYMENT_NOT_SUCCEEDED",
          actionable: "Te rugăm să completezi procesul de plată sau să contactezi suportul."
        });
      }
    }

    if (payment.bookingId) {
      const existing = await prisma.booking.findUnique({
        where: { id: payment.bookingId },
        include: {
          client: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true, businessType: true } },
          service: true,
          employee: { select: { id: true, name: true, email: true } },
          consentForm: true,
        },
      });
      return res.json(existing);
    }

    const metadata = (payment.metadata ?? {}) as {
      pendingBooking?: {
        clientId?: string;
        businessId?: string;
        serviceId?: string;
        employeeId?: string | null;
        date?: string;
        clientNotes?: string | null;
      };
    };

    const pending = metadata.pendingBooking;
    if (
      !pending ||
      !pending.clientId ||
      !pending.businessId ||
      !pending.serviceId ||
      !pending.date
    ) {
      logger.error("Incomplete booking data in payment metadata", { 
        paymentId: payment.id, 
        metadata 
      });
      return res.status(400).json({ 
        error: "Datele pentru rezervare nu sunt complete în sistemul de plată.",
        code: "INCOMPLETE_BOOKING_DATA",
        actionable: "Te rugăm să contactezi suportul pentru a rezolva problema."
      });
    }

    // CRITICAL FIX (TICKET-011): Validare clientId
    const authUser = (req as express.Request & { user?: { userId: string } }).user;
    if (!authUser || !authUser.userId) {
      return res.status(401).json({ 
        error: "Autentificare necesară.",
        code: "UNAUTHORIZED",
        actionable: "Te rugăm să te autentifici înainte de a continua."
      });
    }

    if (authUser.userId !== pending.clientId) {
      logger.warn("User trying to confirm payment for different client", { 
        userId: authUser.userId, 
        pendingClientId: pending.clientId,
        paymentId: payment.id
      });
      return res.status(403).json({ 
        error: "Nu poți confirma această plată. Plata aparține unui alt client.",
        code: "PAYMENT_OWNERSHIP_MISMATCH",
        actionable: "Asigură-te că ești autentificat cu contul corect."
      });
    }

    // CRITICAL FIX (TICKET-011): Error handling robust pentru business/service lookup
    let business, service;
    try {
      [business, service] = await Promise.all([
        prisma.business.findUnique({
          where: { id: pending.businessId },
          select: { id: true, name: true, businessType: true, status: true },
        }),
        prisma.service.findFirst({
          where: { id: pending.serviceId, businessId: pending.businessId },
          select: { id: true, duration: true },
        }),
      ]);
    } catch (dbError: any) {
      logger.error("Database error fetching business/service", { 
        error: dbError.message, 
        businessId: pending.businessId,
        serviceId: pending.serviceId
      });
      return res.status(500).json({ 
        error: "Nu am putut verifica datele business-ului sau serviciului.",
        code: "DATABASE_ERROR",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul."
      });
    }

    if (!business) {
      return res.status(404).json({ 
        error: "Business-ul nu a fost găsit sau a fost șters.",
        code: "BUSINESS_NOT_FOUND",
        actionable: "Contactează suportul pentru a rezolva problema."
      });
    }

    if (!service) {
      return res.status(404).json({ 
        error: "Serviciul nu a fost găsit sau a fost șters.",
        code: "SERVICE_NOT_FOUND",
        actionable: "Serviciul selectat nu mai există. Te rugăm să selectezi alt serviciu."
      });
    }

    if (business.status === "SUSPENDED") {
      return res.status(403).json({ 
        error: "Business-ul este suspendat. Rezervările sunt oprite temporar.",
        code: "BUSINESS_SUSPENDED",
        actionable: "Contactează business-ul pentru mai multe informații."
      });
    }

    // Calculate booking end time
    const bookingStart = new Date(pending.date);
    const serviceDuration = service.duration;
    const bookingEnd = new Date(bookingStart.getTime() + serviceDuration * 60 * 1000);

    // CRITICAL FIX (TICKET-012): Validate working hours for business/employee
    // CRITICAL FIX (TICKET-015): Use proper type instead of `any`
    type WorkingHours = {
      [key: string]: {
        enabled: boolean;
        slots: Array<{ start: string; end: string }>;
      };
    };
    try {
      let workingHoursToCheck = business.workingHours as WorkingHours | null;
      
      // Dacă există employeeId, verifică working hours ale employee-ului (dacă există)
      if (pending.employeeId) {
        try {
          const employee = await prisma.user.findUnique({
            where: { id: pending.employeeId },
            select: { workingHours: true },
          });
          
          // Dacă employee are working hours custom, folosește-le; altfel folosește business working hours
          if (employee?.workingHours) {
            workingHoursToCheck = employee.workingHours;
          }
        } catch (employeeError: any) {
          logger.error("Error fetching employee working hours", { error: employeeError, employeeId: pending.employeeId });
          // Continue with business working hours if employee fetch fails
        }
      }

      // Verifică dacă booking-ul este în working hours
      if (!isIntervalWithinWorkingHours(bookingStart, bookingEnd, workingHoursToCheck)) {
        const dayNames = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
        const dayName = dayNames[bookingStart.getDay()];
        return res.status(409).json({
          error: getWorkingHoursErrorMessage(dayName),
          code: "OUTSIDE_WORKING_HOURS",
          actionable: "Selectează un interval de timp în care business-ul este deschis."
        });
      }
    } catch (workingHoursError: any) {
      logger.error("Error validating working hours", { error: workingHoursError, businessId: pending.businessId, employeeId: pending.employeeId });
      // Continue if working hours validation fails (backward compatibility)
    }

    // VALIDATION: Check for overlapping bookings with the same employee
    const overlapBufferMs = 2 * HOUR_IN_MS; // 2 ore buffer
    if (pending.employeeId) {
      const overlappingBookings = await prisma.booking.findMany({
        where: {
          employeeId: pending.employeeId,
          businessId: pending.businessId,
          status: { not: "CANCELLED" },
          date: {
            gte: new Date(bookingStart.getTime() - overlapBufferMs),
            lte: new Date(bookingEnd.getTime() + overlapBufferMs),
          },
        },
        include: {
          service: { select: { duration: true } },
        },
      });

      for (const existingBooking of overlappingBookings) {
        const existingStart = new Date(existingBooking.date);
        const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

        if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
          return res.status(409).json({
            error: "Există deja o rezervare care se suprapune cu intervalul selectat pentru acest angajat.",
          });
        }
      }
    } else {
      // Check for overlapping bookings without employee
      const overlappingBookings = await prisma.booking.findMany({
        where: {
          businessId: pending.businessId,
          employeeId: null,
          status: { not: "CANCELLED" },
          date: {
            gte: new Date(bookingStart.getTime() - overlapBufferMs),
            lte: new Date(bookingEnd.getTime() + overlapBufferMs),
          },
        },
        include: {
          service: { select: { duration: true } },
        },
      });

      for (const existingBooking of overlappingBookings) {
        const existingStart = new Date(existingBooking.date);
        const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

        if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
          return res.status(409).json({
            error: "Există deja o rezervare care se suprapune cu intervalul selectat.",
          });
        }
      }
    }

    // VALIDATION: Check for business holidays
    const businessHolidays = await prisma.holiday.findMany({
      where: {
        businessId: pending.businessId,
        startDate: { lte: bookingEnd },
        endDate: { gte: bookingStart },
      },
    });

    if (businessHolidays.length > 0) {
      const holiday = businessHolidays[0];
      const reason = holiday.reason ? ` (${holiday.reason})` : "";
      return res.status(409).json({
        error: `Intervalul selectat se suprapune cu o perioadă de închidere a business-ului${reason}.`,
      });
    }

    // VALIDATION: Check for employee holidays (if employee is specified)
    if (pending.employeeId) {
      const employeeHolidays = await prisma.employeeHoliday.findMany({
        where: {
          employeeId: pending.employeeId,
          startDate: { lte: bookingEnd },
          endDate: { gte: bookingStart },
        },
      });

      if (employeeHolidays.length > 0) {
        const holiday = employeeHolidays[0];
        const reason = holiday.reason ? ` (${holiday.reason})` : "";
        return res.status(409).json({
          error: `Angajatul este în concediu în perioada selectată${reason}.`,
        });
      }
    }

    const needsConsent = businessNeedsConsent(business.businessType);
    const initialStatus: BookingStatus = needsConsent ? "PENDING_CONSENT" : "CONFIRMED";

    // CRITICAL FIX (TICKET-011): Error handling robust pentru Stripe verification
    const stripe = getStripeClient();
    if (!stripe) {
      logger.error("Stripe client not initialized");
      return res.status(500).json({ 
        error: "Serviciul de plată nu este disponibil momentan.",
        code: "PAYMENT_GATEWAY_UNAVAILABLE",
        actionable: "Te rugăm să încerci din nou în câteva momente."
      });
    }

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (stripeError: any) {
      logger.error("Stripe API error retrieving payment intent", { 
        error: stripeError.message, 
        code: stripeError.code,
        type: stripeError.type,
        paymentIntentId
      });
      return res.status(500).json({ 
        error: "Nu am putut verifica statusul plății. Te rugăm să încerci din nou.",
        code: "STRIPE_ERROR",
        actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
      });
    }

    const succeeded = intent.status === "succeeded";

    if (!succeeded) {
      return res.status(400).json({ 
        error: `Plata nu este confirmată. Status: ${intent.status}`,
        code: "PAYMENT_NOT_SUCCEEDED",
        actionable: "Te rugăm să completezi procesul de plată sau să contactezi suportul."
      });
    }

    const paid = succeeded;
    const bookingPaymentStatus: typeof BookingPaymentStatus[keyof typeof BookingPaymentStatus] = paid ? "PAID" : "PENDING";
    const paymentStatus = succeeded ? "SUCCEEDED" : "PENDING";

    // CRITICAL FIX: Wrap booking creation and payment update in a transaction for atomicity
    // This ensures that if booking creation fails, payment is not updated, and vice versa
    const booking = await prisma.$transaction(async (tx: any) => {
      // Re-check for overlapping bookings within the transaction (same as in POST /booking)
      const overlapBufferMs = 2 * HOUR_IN_MS;
      
      if (pending.employeeId && pending.businessId && pending.serviceId) {
        const overlappingBookings = await tx.booking.findMany({
          where: {
            employeeId: pending.employeeId,
            businessId: pending.businessId,
            status: { not: "CANCELLED" },
            date: {
              gte: new Date(bookingStart.getTime() - overlapBufferMs),
              lte: new Date(bookingEnd.getTime() + overlapBufferMs),
            },
          },
          include: {
            service: { select: { duration: true } },
          },
          select: {
            id: true,
            date: true,
            duration: true,
            service: { select: { duration: true } },
          },
        });

        for (const existingBooking of overlappingBookings) {
          const existingStart = new Date(existingBooking.date);
          const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

          if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
            throw new Error("Există deja o rezervare care se suprapune cu intervalul selectat pentru acest angajat.");
          }
        }
      } else if (pending.businessId && pending.serviceId) {
        const overlappingBookings = await tx.booking.findMany({
          where: {
            businessId: pending.businessId,
            employeeId: null,
            status: { not: "CANCELLED" },
            date: {
              gte: new Date(bookingStart.getTime() - overlapBufferMs),
              lte: new Date(bookingEnd.getTime() + overlapBufferMs),
            },
          },
          include: {
            service: { select: { duration: true } },
          },
          select: {
            id: true,
            date: true,
            duration: true,
            service: { select: { duration: true } },
          },
        });

        for (const existingBooking of overlappingBookings) {
          const existingStart = new Date(existingBooking.date);
          const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

          if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
            throw new Error("Există deja o rezervare care se suprapune cu intervalul selectat.");
          }
        }
      }

      // Create booking within the transaction
      // CRITICAL FIX: Validate all required fields before creating booking
      if (!pending.clientId || !pending.businessId || !pending.serviceId || !pending.date) {
        throw new Error("Datele pentru rezervare nu sunt complete.");
      }

      // Type assertion pentru a evita erorile TypeScript (datele sunt deja validate mai sus)
      const clientId = pending.clientId as string;
      const businessId = pending.businessId as string;
      const serviceId = pending.serviceId as string;
      const bookingDate = pending.date as string;

      const newBooking = await tx.booking.create({
        data: {
          client: { connect: { id: clientId } },
          business: { connect: { id: businessId } },
          service: { connect: { id: serviceId } },
          ...(pending.employeeId ? { employee: { connect: { id: pending.employeeId } } } : {}),
          date: new Date(bookingDate),
          paid,
          paymentMethod: payment.method,
          paymentStatus: bookingPaymentStatus,
          paymentReused: false,
          status: initialStatus,
        },
        include: {
          client: { select: { id: true, name: true, email: true, phone: true } },
          business: { select: { id: true, name: true, businessType: true } },
          service: true,
          employee: pending.employeeId ? { select: { id: true, name: true, email: true } } : false,
          consentForm: true,
        },
      });

      // Update payment within the same transaction
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          bookingId: newBooking.id,
          status: paymentStatus,
        },
      });

      return newBooking;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });

    if (paid && initialStatus === "CONFIRMED" && booking.client.phone) {
      sendBookingConfirmationSms(
        booking.client.name || "Client",
        booking.client.phone,
        booking.business.name || "Business",
        booking.date,
        booking.service?.name,
        booking.business.id
      ).catch((error: unknown) => {
        logger.error("Failed to send confirmation SMS", error);
      });
    }

    return res.json(booking);
  } catch (error: any) {
    logger.error("Booking confirmation failed", { 
      error: error?.message || error, 
      stack: error instanceof Error ? error.stack : undefined,
      code: error?.code,
      paymentIntentId
    });
    
    // CRITICAL FIX (TICKET-011): Error handling specific și actionable
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Handle overlap errors from transaction
      if (errorMessage.includes("deja rezervat") || 
          errorMessage.includes("se suprapune") ||
          errorMessage.includes("Există deja o rezervare")) {
        return res.status(409).json({ 
          error: errorMessage,
          code: "BOOKING_OVERLAP",
          actionable: "Selectează un alt interval de timp pentru rezervare."
        });
      }
      
      // Handle transaction serialization errors
      if (errorCode === "P2034" || errorMessage.includes("serialization failure") || errorMessage.includes("could not serialize")) {
        return res.status(409).json({ 
          error: "Rezervarea nu a putut fi procesată din cauza unui conflict. Te rugăm să încerci din nou.",
          code: "TRANSACTION_CONFLICT",
          actionable: "Așteaptă câteva secunde și încearcă din nou."
        });
      }

      // Handle Prisma errors
      if (errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Rezervarea există deja în sistem.",
          code: "DUPLICATE_BOOKING",
          actionable: "Verifică lista de rezervări sau contactează suportul."
        });
      }

      if (errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Datele rezervării nu mai sunt valide.",
          code: "BOOKING_DATA_INVALID",
          actionable: "Te rugăm să inițiezi o nouă rezervare."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut confirma rezervarea. Te rugăm să încerci din nou.",
      code: "INTERNAL_ERROR",
      actionable: "Te rugăm să încerci din nou sau să contactezi suportul dacă problema persistă."
    });
  }
});

export = router;

