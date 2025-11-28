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
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
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

const CONSENT_REQUIRED_TYPES: BusinessType[] = ["STOMATOLOGIE", "OFTALMOLOGIE", "PSIHOLOGIE", "TERAPIE"];

const businessNeedsConsent = (type?: BusinessType | null) =>
  !!type && CONSENT_REQUIRED_TYPES.includes(type);

router.post("/", validate(createBookingSchema), async (req, res) => {
  const {
    clientId,
    businessId,
    serviceId,
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
    const [business, service] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, businessType: true, status: true },
      }),
      prisma.service.findFirst({
        where: { id: serviceId, businessId },
        select: { id: true, duration: true },
      }),
    ]);

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Rezervările sunt oprite temporar." });
    }

    if (!service) {
      return res.status(404).json({ error: "Serviciul nu a fost găsit pentru acest business." });
    }

    // Calculate booking end time based on service duration or override duration
    const serviceDurationMinutes = duration ?? service.duration;
    const bookingStart = new Date(bookingDate);
    const bookingEnd = new Date(bookingStart.getTime() + serviceDurationMinutes * 60 * 1000);

    // VALIDATION: Check for overlapping bookings with the same employee
    if (employeeId) {
      const overlappingBookings = await prisma.booking.findMany({
        where: {
          employeeId,
          businessId,
          status: { not: "CANCELLED" }, // Exclude cancelled bookings
          date: {
            // Check for overlap: bookingStart < existingEnd && bookingEnd > existingStart
            // We need to check bookings that overlap with our time range
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS), // Start search from 24h before
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS), // End search 24h after
          },
        },
        include: {
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
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS),
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS),
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

    // VALIDATION: Check for employee holidays (if employee is specified)
    if (employeeId) {
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

    const booking = await prisma.booking.create({
      data: {
        client: { connect: { id: clientId } },
        business: { connect: { id: businessId } },
        service: { connect: { id: serviceId } },
        ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
        date: new Date(date),
        ...(duration ? { duration } : {}),
        paid: isPaid,
        paymentMethod: paymentMethod ?? PaymentMethod.OFFLINE,
        paymentStatus,
        paymentReused: isPaymentReused,
        status: initialStatus,
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: true,
        employee: employeeId ? { select: { id: true, name: true, email: true } } : false,
        consentForm: true,
      },
    });

    // Trimite SMS de confirmare dacă rezervarea este confirmată (nu necesită consimțământ)
    if (initialStatus === "CONFIRMED" && booking.client.phone) {
      // Fire-and-forget: nu așteptăm răspunsul pentru a nu bloca request-ul
      sendBookingConfirmationSms(
        booking.client.name || "Client",
        booking.client.phone,
        booking.business.name || "Business",
        booking.date,
        booking.service?.name,
        booking.business.id
      ).catch((error: unknown) => {
        logger.error("Failed to send confirmation SMS", error);
        // Nu aruncăm eroarea, doar logăm
      });
    }

    return res.status(201).json(booking);
  } catch (error) {
    logger.error("Booking creation failed", error);
    return res.status(500).json({ error: "Eroare la crearea rezervării." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { date: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: true,
        employee: { select: { id: true, name: true, email: true } },
        consentForm: true,
      },
    });

    return res.json(bookings);
  } catch (error) {
    logger.error("Failed to list bookings", error);
    return res.status(500).json({ error: "Eroare la listarea rezervărilor." });
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    serviceId,
    employeeId,
    date,
    paid,
  }: {
    serviceId?: string;
    employeeId?: string | null;
    date?: string;
    paid?: boolean;
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: "ID rezervare lipsă." });
  }

  try {
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, duration: true } },
      },
    });

    if (!existingBooking) {
      return res.status(404).json({ error: "Rezervarea nu există." });
    }

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
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS),
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS),
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
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS),
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS),
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

router.delete("/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "ID rezervare lipsă." });
  }

  try {
    const authReq = req as express.Request & { user?: { userId: string; role: string; businessId?: string } };
    const userRole = authReq.user?.role;
    const userId = authReq.user?.userId;
    const userBusinessId = authReq.user?.businessId;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        consentForm: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true, ownerId: true, employees: { select: { id: true } } } },
        service: { select: { id: true, name: true, price: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Rezervarea nu există sau a fost deja ștearsă." });
    }

    // If booking is already cancelled, return error
    if (booking.status === "CANCELLED") {
      return res.status(400).json({ error: "Rezervarea a fost deja anulată." });
    }

    // Authorization check: only client, business owner, employee of the business, or superadmin can cancel
    const isClient = userRole === "CLIENT" && booking.clientId === userId;
    const isBusinessOwner = userRole === "BUSINESS" && booking.business.ownerId === userId;
    const isEmployee = userRole === "EMPLOYEE" && booking.business.employees.some((emp: { id: string }) => emp.id === userId);
    const isSuperAdmin = userRole === "SUPERADMIN";

    if (!isClient && !isBusinessOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a anula această rezervare." });
    }

    // Time limits only apply to clients
    // Business, employee, and superadmin can cancel anytime
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

    // Salvează datele pentru SMS înainte de anulare
    const clientName = booking.client?.name || "Client";
    const clientPhone = booking.client?.phone;
    const businessName = booking.business?.name || "Business";
    const bookingDate = booking.date;
    const isPaid = booking.paid === true;

    // If booking is paid, set status to CANCELLED instead of deleting
    // This allows the client to reuse the payment for a new booking
    if (isPaid) {
      await prisma.booking.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    } else {
      // For unpaid bookings, we can delete them completely
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (booking.consentForm) {
          await tx.consentForm.delete({ where: { bookingId: id } });
        }
        await tx.booking.delete({ where: { id } });
      });
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

    return res.json({ success: true });
  } catch (error) {
    logger.error("Booking deletion failed", error);
    return res.status(500).json({ error: "Eroare la anularea rezervării." });
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
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS),
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS),
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
            gte: new Date(bookingStart.getTime() - 24 * HOUR_IN_MS),
            lte: new Date(bookingEnd.getTime() + 24 * HOUR_IN_MS),
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
        console.error("Failed to send confirmation SMS:", error);
      });
    }

    return res.json(booking);
  } catch (error) {
    logger.error("Booking confirmation failed", error);
    return res.status(500).json({ error: "Nu am putut confirma rezervarea." });
  }
});

export = router;

