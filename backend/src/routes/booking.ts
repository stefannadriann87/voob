import express = require("express");
const prisma = require("../lib/prisma").default;
import type { Prisma } from "@prisma/client";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    clientId,
    businessId,
    serviceId,
    employeeId,
    date,
    paid,
    consent,
  }: {
    clientId?: string;
    businessId?: string;
    serviceId?: string;
    employeeId?: string;
    date?: string;
    paid?: boolean;
    consent?: { pdfUrl: string; signature: string };
  } = req.body;

  if (!clientId || !businessId || !serviceId || !date) {
    return res.status(400).json({
      error: "clientId, businessId, serviceId și date sunt obligatorii.",
    });
  }

  try {
    const consentPayload = consent
      ? {
          pdfUrl: consent.pdfUrl,
          signature: consent.signature,
        }
      : null;

    const booking = await prisma.booking.create({
      data: {
        client: { connect: { id: clientId } },
        business: { connect: { id: businessId } },
        service: { connect: { id: serviceId } },
        ...(employeeId ? { employee: { connect: { id: employeeId } } } : {}),
        date: new Date(date),
        paid: paid ?? false,
        ...(consentPayload
          ? {
              consent: {
                create: consentPayload,
              },
            }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        business: { select: { id: true, name: true } },
        service: true,
        employee: employeeId ? { select: { id: true, name: true, email: true } } : false,
        consent: true,
      },
    });

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
        business: { select: { id: true, name: true } },
        service: true,
        employee: { select: { id: true, name: true, email: true } },
        consent: true,
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
        business: { select: { id: true, name: true } },
        service: true,
        employee: { select: { id: true, name: true, email: true } },
        consent: true,
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
      include: { consent: true },
    });

    if (!booking) {
      return res.status(404).json({ error: "Rezervarea nu există sau a fost deja ștearsă." });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (booking.consent) {
        await tx.consent.delete({ where: { bookingId: id } });
      }
      await tx.booking.delete({ where: { id } });
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Booking delete error:", error);
    return res.status(500).json({ error: "Eroare la anularea rezervării." });
  }
});

export = router;

