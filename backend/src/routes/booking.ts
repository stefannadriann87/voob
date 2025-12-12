import express = require("express");
import type {
  Prisma,
  BusinessType,
  BookingStatus,
} from "@prisma/client";
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

  const bookingDate = new Date(date);
  // Validarea de date este deja făcută de Zod (datetime format)

  const now = new Date();
  if (bookingDate.getTime() - now.getTime() < MIN_BOOKING_LEAD_MS) {
    return res.status(400).json({ error: MIN_LEAD_MESSAGE });
  }

  try {
    // Get authenticated user from request
    const authReq = req as any;
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

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, businessType: true, status: true },
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

      // Pentru SPORT_OUTDOOR, durata trebuie să fie multiplu de 60 minute (60, 120, 180, etc.)
      // Dacă nu este specificat, default la 60 minute
      if (duration !== undefined && duration !== null) {
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

      // Verificare suprapunere pentru teren
      // Optimizat: folosește range mai mic (2 ore buffer) și select specific pentru performanță
      const overlapBufferMs = 2 * HOUR_IN_MS; // 2 ore buffer (suficient pentru verificare suprapunere)
      const overlappingBookings = await prisma.booking.findMany({
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
        // Folosește duration din booking sau default 60 minute
        const existingDuration = existingBooking.duration ?? 60;
        const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

        if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
          return res.status(409).json({
            error: "Terenul este deja rezervat pentru această perioadă.",
          });
        }
      }
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

      // Calculate booking end time based on service duration or override duration
      serviceDurationMinutes = duration ?? service.duration;
      bookingStart = new Date(bookingDate);
      bookingEnd = new Date(bookingStart.getTime() + serviceDurationMinutes * 60 * 1000);

      // VALIDATION: Check for overlapping bookings with the same employee
      if (employeeId) {
        // Optimizat: folosește range mai mic (2 ore buffer) și select specific
        const overlapBufferMs = 2 * HOUR_IN_MS; // 2 ore buffer
        const overlappingBookings = await prisma.booking.findMany({
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

        // Check each existing booking for actual overlap
        for (const existingBooking of overlappingBookings) {
          const existingStart = new Date(existingBooking.date);
          const existingDuration = existingBooking.duration ?? existingBooking.service?.duration ?? 60;
          const existingEnd = new Date(existingStart.getTime() + existingDuration * 60 * 1000);

          // Check if bookings overlap: bookingStart < existingEnd && bookingEnd > existingStart
          if (bookingStart.getTime() < existingEnd.getTime() && bookingEnd.getTime() > existingStart.getTime()) {
            return res.status(409).json({
              error: "Există deja o rezervare care se suprapune cu intervalul selectat pentru acest angajat.",
            });
          }
        }
      } else {
        // If no employee specified, check for overlapping bookings without employee
        const overlappingBookings = await prisma.booking.findMany({
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
            return res.status(409).json({
              error: "Există deja o rezervare care se suprapune cu intervalul selectat.",
            });
          }
        }
      }
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
        }
      } catch (employeeError: any) {
        logger.error("Error verifying employee:", employeeError);
        // Continue if employee verification fails
      }
    }

    logger.info("Creating booking", { clientId, businessId, serviceId, courtId, employeeId, date, initialStatus });
    
    // Prepare booking data
    const bookingData: any = {
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
      // Durata este deja validată mai sus (multiplu de 60 minute)
      bookingData.duration = serviceDurationMinutes;
      
      // Calculează prețul bazat pe timeSlot (folosind court deja încărcat)
      const bookingHour = bookingDate.getHours();
      if (court && court.pricing) {
        let bookingPrice = 0;
        for (const pricing of court.pricing) {
          if (bookingHour >= pricing.startHour && bookingHour < pricing.endHour) {
            bookingPrice = pricing.price;
            break;
          }
        }
        // Prețul va fi folosit mai jos pentru Payment dacă e necesar
        bookingData.price = bookingPrice;
      }
    } else {
      // Logica normală pentru business types non-SPORT_OUTDOOR
      bookingData.service = { connect: { id: serviceId } };
      
      if (duration) {
        bookingData.duration = duration;
      }

      // Only connect employee if employeeId is provided and valid
      if (employeeId) {
        bookingData.employee = { connect: { id: employeeId } };
      }
    }

    const booking = await prisma.booking.create({
      data: bookingData,
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: !isSportOutdoor,
        court: isSportOutdoor ? { include: { pricing: true } } : false,
        employee: employeeId && !isSportOutdoor ? { select: { id: true, name: true, email: true } } : false,
        consentForm: true,
      },
    }).catch((createError: any) => {
      logger.error("Error creating booking in Prisma:", { 
        error: createError.message, 
        stack: createError.stack,
        code: createError.code,
        meta: createError.meta,
        bookingData: { clientId, businessId, serviceId, employeeId }
      });
      throw createError;
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
    const where: any = {};
    
    if (userRole === "CLIENT") {
      where.clientId = userId;
    } else if (userRole === "BUSINESS") {
      where.businessId = userBusinessId || { in: await prisma.business.findMany({ where: { ownerId: userId }, select: { id: true } }).then((bs: any[]) => (bs as any[]).map((b: any) => b.id)) };
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
    const isEmployee = booking.business.employees.some((emp: any) => emp.id === userId);
    const isSuperAdmin = userRole === "SUPERADMIN";

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
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

router.post("/confirm", verifyJWT, async (req, res) => {
  const { paymentIntentId }: { paymentIntentId?: string } = req.body;

  if (!paymentIntentId) {
    return res.status(400).json({ error: "paymentIntentId este obligatoriu." });
  }

  try {
    const payment = await prisma.payment.findFirst({
      where: { externalPaymentId: paymentIntentId },
    });

    if (!payment) {
      return res.status(404).json({ error: "Plata nu a fost găsită." });
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

    // CRITIC FIX: Verifică dacă payment-ul este SUCCEEDED înainte de a crea booking
    // Dacă DB nu e actualizat, verifică direct cu Stripe
    if (payment.status !== "SUCCEEDED") {
      const stripe = getStripeClient();
      const stripeIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (stripeIntent.status === "succeeded") {
        // Stripe confirmă plata - actualizează DB-ul
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED" },
        });
        logger.info("Payment status updated from Stripe", { paymentId: payment.id, stripeStatus: stripeIntent.status });
      } else {
        // Stripe nu confirmă plata
        return res.status(400).json({ 
          error: `Plata nu este confirmată. Status Stripe: ${stripeIntent.status}` 
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
      return res.status(400).json({ error: "Datele pentru rezervare nu sunt complete." });
    }

    const authUser = (req as express.Request & { user?: { userId: string } }).user;
    if (!authUser || authUser.userId !== pending.clientId) {
      return res.status(403).json({ error: "Nu poți confirma această plată." });
    }

    const [business, service] = await Promise.all([
      prisma.business.findUnique({
        where: { id: pending.businessId },
        select: { id: true, name: true, businessType: true, status: true },
      }),
      prisma.service.findFirst({
        where: { id: pending.serviceId, businessId: pending.businessId },
        select: { id: true, duration: true },
      }),
    ]);

    if (!business || !service) {
      return res.status(404).json({ error: "Business-ul sau serviciul nu au fost găsite." });
    }

    if (business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Rezervările sunt oprite temporar." });
    }

    // Calculate booking end time
    const bookingStart = new Date(pending.date);
    const serviceDuration = service.duration;
    const bookingEnd = new Date(bookingStart.getTime() + serviceDuration * 60 * 1000);

    // VALIDATION: Check for overlapping bookings with the same employee
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

    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const succeeded = intent.status === "succeeded";

    if (!succeeded) {
      return res.status(400).json({ error: "Plata nu este confirmată." });
    }

    const paid = succeeded;
    const bookingPaymentStatus: typeof BookingPaymentStatus[keyof typeof BookingPaymentStatus] = paid ? "PAID" : "PENDING";
    const paymentStatus = succeeded ? "SUCCEEDED" : "PENDING";

    const booking = await prisma.booking.create({
      data: {
        client: { connect: { id: pending.clientId } },
        business: { connect: { id: pending.businessId } },
        service: { connect: { id: pending.serviceId } },
        ...(pending.employeeId ? { employee: { connect: { id: pending.employeeId } } } : {}),
        date: new Date(pending.date),
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

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        bookingId: booking.id,
        status: paymentStatus,
      },
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
  } catch (error) {
    logger.error("Booking confirmation failed", error);
    return res.status(500).json({ error: "Nu am putut confirma rezervarea." });
  }
});

export = router;

