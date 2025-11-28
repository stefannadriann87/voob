import express = require("express");
import type { Request, Response } from "express";
const { randomBytes } = require("node:crypto");
const prisma = require("../lib/prisma");
const { sendSms } = require("../services/smsService");
const { sendEmail } = require("../services/emailService");

const router = express.Router();

const WORKING_HOURS = {
  start: 15,
  end: 19,
  slotLength: 60,
  allowedDays: [1, 2, 3, 4, 5], // Monday-Friday
};

const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || process.env.EMAIL_FROM;

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const formatSlotLabel = (date: Date) =>
  date.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

const formatIcsDate = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

const buildIcsEvent = (params: {
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
  meetLink: string;
}) => {
  const { start, durationMinutes, summary, description, meetLink } = params;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LARSTEF//Demo Booking//RO",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${Buffer.from(`${start.toISOString()}-${meetLink}`).toString("hex")}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "LOCATION:Online (Google Meet)",
    `URL:${meetLink}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

const parseDateOnly = (value: string) => {
  if (!value || !dateRegex.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const generateSlotsForDate = (date: Date) => {
  if (!WORKING_HOURS.allowedDays.includes(date.getDay())) {
    return [];
  }
  const slots: Date[] = [];
  const slot = new Date(date);
  slot.setHours(WORKING_HOURS.start, 0, 0, 0);

  const end = new Date(date);
  end.setHours(WORKING_HOURS.end, 0, 0, 0);

  while (slot < end) {
    slots.push(new Date(slot));
    slot.setMinutes(slot.getMinutes() + WORKING_HOURS.slotLength);
  }
  return slots;
};

const generateMeetLink = () => {
  const code = randomBytes(6).toString("hex").slice(0, 10);
  return `https://meet.google.com/${code}`;
};

router.get("/available-slots", async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date?: string };

    const parsedDate = parseDateOnly(date || "");
    if (!parsedDate) {
      return res.status(400).json({ error: "Parametrul date este invalid. Folosește formatul YYYY-MM-DD." });
    }

    if (!WORKING_HOURS.allowedDays.includes(parsedDate.getDay())) {
      return res.json({ date, slots: [] });
    }

    const dayStart = new Date(parsedDate);
    const dayEnd = new Date(parsedDate);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const bookings = await prisma.demoBooking.findMany({
      where: {
        dateTime: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      select: { dateTime: true },
    });

    const takenSet = new Set(bookings.map((booking: { dateTime: Date }) => booking.dateTime.getTime()));
    const now = Date.now();

    const slots = generateSlotsForDate(parsedDate)
      .filter((slot) => slot.getTime() > now)
      .filter((slot) => !takenSet.has(slot.getTime()))
      .map((slot) => ({
        iso: slot.toISOString(),
        label: formatSlotLabel(slot),
      }));

    return res.json({
      date,
      slots,
    });
  } catch (error) {
    console.error("Available slots error:", error);
    return res.status(500).json({ error: "Nu am putut încărca intervalele disponibile." });
  }
});

router.post("/demo-booking", async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, phone, dateTime }: { firstName?: string; lastName?: string; email?: string; phone?: string; dateTime?: string } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !phone?.trim() || !dateTime) {
      return res.status(400).json({ error: "Toate câmpurile sunt obligatorii." });
    }

    const slotDate = new Date(dateTime);
    if (Number.isNaN(slotDate.getTime())) {
      return res.status(400).json({ error: "Data selectată este invalidă." });
    }

    if (slotDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: "Nu poți programa un demo în trecut." });
    }

    const minutes = slotDate.getMinutes();
    const seconds = slotDate.getSeconds();
    const hours = slotDate.getHours();

    if (seconds !== 0 || slotDate.getMilliseconds() !== 0 || minutes % WORKING_HOURS.slotLength !== 0) {
      return res.status(400).json({ error: "Intervalul selectat nu este valid." });
    }

    if (hours < WORKING_HOURS.start || hours >= WORKING_HOURS.end) {
      return res
        .status(400)
        .json({ error: "Programările sunt disponibile între 15:00 și 19:00, de luni până vineri." });
    }

    if (!WORKING_HOURS.allowedDays.includes(slotDate.getDay())) {
      return res
        .status(400)
        .json({ error: "Programările sunt disponibile doar de luni până vineri." });
    }

    const existingBooking = await prisma.demoBooking.findFirst({
      where: { dateTime: slotDate },
    });

    if (existingBooking) {
      return res.status(409).json({ error: "Acest interval este deja ocupat. Te rugăm să alegi altă oră." });
    }

    const meetLink = generateMeetLink();

    const demoBooking = await prisma.demoBooking.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        dateTime: slotDate,
        meetLink,
      },
    });

    const formattedDate = slotDate.toLocaleDateString("ro-RO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const formattedTime = slotDate.toLocaleTimeString("ro-RO", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const icsContent = buildIcsEvent({
      start: slotDate,
      durationMinutes: WORKING_HOURS.slotLength,
      summary: "Demo LARSTEF",
      description: `Demo LARSTEF cu ${firstName} ${lastName}`,
      meetLink,
    });

    // Fire-and-forget notifications
    sendSms({
      phone,
      message: `Salut ${firstName}! Programarea ta pentru demo LARSTEF este confirmată pe ${formattedDate} la ${formattedTime}. Link Meet: ${meetLink}`,
    }).catch((error: unknown) => console.error("Demo SMS error:", error));

    sendEmail({
      to: email,
      subject: "Demo LARSTEF confirmat",
      text: `Salut ${firstName},\n\nDemo-ul tău este programat pe ${formattedDate} la ${formattedTime}.\nLink Google Meet: ${meetLink}\n\nȚi-am atașat și un calendar invite.\n\nEchipa LARSTEF`,
      icalEvent: {
        method: "REQUEST",
        content: icsContent,
      },
    }).catch((error: unknown) => console.error("Demo client email error:", error));

    if (ADMIN_EMAIL) {
      sendEmail({
        to: ADMIN_EMAIL,
        subject: "Nou demo LARSTEF programat",
        text: `Detalii demo:\nNume: ${firstName} ${lastName}\nEmail: ${email}\nTelefon: ${phone}\nData: ${formattedDate}\nOra: ${formattedTime}\nMeet: ${meetLink}`,
      }).catch((error: unknown) => console.error("Demo admin email error:", error));
    }

    return res.status(201).json({
      success: true,
      booking: {
        id: demoBooking.id,
        dateTime: demoBooking.dateTime,
        meetLink: demoBooking.meetLink,
      },
    });
  } catch (error) {
    console.error("Demo booking error:", error);
    return res.status(500).json({ error: "Nu am putut crea rezervarea pentru demo." });
  }
});

module.exports = router;

