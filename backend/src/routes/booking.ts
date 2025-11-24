import express = require("express");
const prisma = require("../lib/prisma").default;
import type { Prisma, BusinessType, BookingStatus } from "@prisma/client";
const {
  sendBookingConfirmationSms,
  sendBookingCancellationSms,
} = require("../services/smsService");

const router = express.Router();

const CONSENT_REQUIRED_TYPES: BusinessType[] = [
  "STOMATOLOGIE",
  "OFTALMOLOGIE",
  "PSIHOLOGIE",
  "TERAPIE",
  "BEAUTY",
];

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
  }: {
    clientId?: string;
    businessId?: string;
    serviceId?: string;
    employeeId?: string;
    date?: string;
    paid?: boolean;
  } = req.body;

  if (!clientId || !businessId || !serviceId || !date) {
    return res.status(400).json({
      error: "clientId, businessId, serviceId și date sunt obligatorii.",
    });
  }

  try {
    const [business, service] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, businessType: true },
      }),
      prisma.service.findFirst({
        where: { id: serviceId, businessId },
        select: { id: true },
      }),
    ]);

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (!service) {
      return res.status(404).json({ error: "Serviciul nu a fost găsit pentru acest business." });
    }

    const needsConsent = businessNeedsConsent(business.businessType);
    const initialStatus: BookingStatus = needsConsent ? "PENDING_CONSENT" : "CONFIRMED";

    const booking = await prisma.booking.create({
      data: {
        client: { connect: { id: clientId } },
        business: { connect: { id: businessId } },
        service: { connect: { id: serviceId } },
        ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
        date: new Date(date),
        paid: paid ?? false,
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
        booking.service?.name
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
      sendBookingCancellationSms(clientName, clientPhone, businessName, bookingDate).catch(
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

export = router;

