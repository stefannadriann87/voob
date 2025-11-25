import express = require("express");
import type {
  Prisma,
  BusinessType,
  BookingStatus,
} from "@prisma/client";
const { PaymentMethod, BookingPaymentStatus } = require("@prisma/client");
const prisma = require("../lib/prisma").default;
const {
  sendBookingConfirmationSms,
  sendBookingCancellationSms,
} = require("../services/smsService");
const { getStripeClient } = require("../services/stripeService");
const { verifyJWT } = require("../middleware/auth");

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

router.post("/", async (req, res) => {
  const {
    clientId,
    businessId,
    serviceId,
    employeeId,
    date,
    paid,
    paymentMethod,
    paymentReused,
  }: {
    clientId?: string;
    businessId?: string;
    serviceId?: string;
    employeeId?: string;
    date?: string;
    paid?: boolean;
    paymentMethod?: typeof PaymentMethod[keyof typeof PaymentMethod];
    paymentReused?: boolean;
  } = req.body;

  if (!clientId || !businessId || !serviceId || !date) {
    return res.status(400).json({
      error: "clientId, businessId, serviceId și date sunt obligatorii.",
    });
  }

  const bookingDate = new Date(date);
  if (Number.isNaN(bookingDate.getTime())) {
    return res.status(400).json({ error: "Data rezervării este invalidă." });
  }

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
        select: { id: true },
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

    const needsConsent = businessNeedsConsent(business.businessType);
    const initialStatus: BookingStatus = needsConsent ? "PENDING_CONSENT" : "CONFIRMED";

    const isPaid = paid ?? false;
    const paymentStatus: typeof BookingPaymentStatus[keyof typeof BookingPaymentStatus] = isPaid ? "PAID" : "PENDING";

    const booking = await prisma.booking.create({
      data: {
        client: { connect: { id: clientId } },
        business: { connect: { id: businessId } },
        service: { connect: { id: serviceId } },
        ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
        date: new Date(date),
        paid: isPaid,
        paymentMethod: paymentMethod ?? PaymentMethod.OFFLINE,
        paymentStatus,
        paymentReused: paymentReused ?? false,
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
        console.error("Failed to send confirmation SMS:", error);
        // Nu aruncăm eroarea, doar logăm
      });
    }

    return res.status(201).json(booking);
  } catch (error) {
    console.error("Booking create error:", error);
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
    console.error("Booking list error:", error);
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
    });

    if (!existingBooking) {
      return res.status(404).json({ error: "Rezervarea nu există." });
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
    console.error("Booking update error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea rezervării." });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "ID rezervare lipsă." });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        consentForm: true,
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Rezervarea nu există sau a fost deja ștearsă." });
    }

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

    // Salvează datele pentru SMS înainte de ștergere
    const clientName = booking.client?.name || "Client";
    const clientPhone = booking.client?.phone;
    const businessName = booking.business?.name || "Business";
    const bookingDate = booking.date;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (booking.consentForm) {
        await tx.consentForm.delete({ where: { bookingId: id } });
      }
      await tx.booking.delete({ where: { id } });
    });

    // Trimite SMS de anulare după ștergerea rezervării
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
          console.error("Failed to send cancellation SMS:", error);
          // Nu aruncăm eroarea, doar logăm
        }
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Booking delete error:", error);
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
        select: { id: true },
      }),
    ]);

    if (!business || !service) {
      return res.status(404).json({ error: "Business-ul sau serviciul nu au fost găsite." });
    }

    if (business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Rezervările sunt oprite temporar." });
    }

    const needsConsent = businessNeedsConsent(business.businessType);
    const initialStatus: BookingStatus = needsConsent ? "PENDING_CONSENT" : "CONFIRMED";

    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const isKlarna = payment.method === PaymentMethod.KLARNA;
    const succeeded = intent.status === "succeeded";

    if (!isKlarna && !succeeded) {
      return res.status(400).json({ error: "Plata nu este confirmată." });
    }

    const paid = !isKlarna && succeeded;
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
    console.error("Booking confirm error:", error);
    return res.status(500).json({ error: "Nu am putut confirma rezervarea." });
  }
});

export = router;

