/**
 * Business Courts Routes
 * CRITICAL FIX (TICKET-014): Extracted courts management routes from business.ts
 * Handles: Create, Update, Delete courts + Pricing + Availability
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { logger } = require("../lib/logger");
import type { AuthenticatedRequest } from "./business.shared.d";

const router = express.Router();

// Get courts
router.get("/:businessId/courts", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.params;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, businessType: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    // Verificare permisiuni
    if (!authReq.user) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }
    
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";
    const isClient = authReq.user?.role === "CLIENT";
    const isSportOutdoor = business.businessType === "SPORT_OUTDOOR";

    // Pentru SPORT_OUTDOOR, permitem și clienților să vadă terenurile
    // Pentru business-uri normale, doar owner și superadmin
    const hasPermission = isOwner || isSuperAdmin || (isClient && isSportOutdoor);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Nu ai permisiunea de a vizualiza terenurile acestui business.",
      });
    }

    const courts = await prisma.court.findMany({
      where: { businessId },
      include: {
        pricing: {
          orderBy: { timeSlot: "asc" },
        },
      },
      orderBy: { number: "asc" },
    });

    return res.json({ courts });
  } catch (error) {
    logger.error("Get courts failed", error);
    return res.status(500).json({ error: "Eroare la obținerea terenurilor." });
  }
});

// Create court
router.post("/:businessId/courts", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.params;
  const { name, number }: { name?: string; number?: number } = req.body;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, businessType: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    if (business.businessType !== "SPORT_OUTDOOR") {
      return res.status(400).json({ error: "Terenurile pot fi adăugate doar pentru business type SPORT_OUTDOOR." });
    }

    // Verificare permisiuni
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a adăuga terenuri." });
    }

    if (!name || !number) {
      return res.status(400).json({ error: "Numele și numărul terenului sunt obligatorii." });
    }

    // Verificare dacă numărul terenului există deja
    const existingCourt = await prisma.court.findUnique({
      where: {
        businessId_number: {
          businessId,
          number,
        },
      },
    });

    if (existingCourt) {
      return res.status(400).json({ error: `Terenul cu numărul ${number} există deja.` });
    }

    const court = await prisma.court.create({
      data: {
        businessId,
        name,
        number,
      },
      include: {
        pricing: true,
      },
    });

    return res.status(201).json({ court });
  } catch (error) {
    logger.error("Create court failed", error);
    return res.status(500).json({ error: "Eroare la crearea terenului." });
  }
});

// Update court
router.put("/:businessId/courts/:courtId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, courtId } = req.params;
  const { name, number, isActive }: { name?: string; number?: number; isActive?: boolean } = req.body;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    // Verificare permisiuni
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza terenurile." });
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { businessId: true, number: true },
    });

    if (!court || court.businessId !== businessId) {
      return res.status(404).json({ error: "Terenul nu există." });
    }

    // Dacă se schimbă numărul, verifică dacă există deja
    if (number !== undefined && number !== court.number) {
      const existingCourt = await prisma.court.findUnique({
        where: {
          businessId_number: {
            businessId,
            number,
          },
        },
      });

      if (existingCourt) {
        return res.status(400).json({ error: `Terenul cu numărul ${number} există deja.` });
      }
    }

    type CourtUpdateData = {
      name?: string;
      number?: number;
      isActive?: boolean;
    };
    const updateData: CourtUpdateData = {};
    if (name !== undefined) updateData.name = name;
    if (number !== undefined) updateData.number = number;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedCourt = await prisma.court.update({
      where: { id: courtId },
      data: updateData,
      include: {
        pricing: {
          orderBy: { timeSlot: "asc" },
        },
      },
    });

    return res.json({ court: updatedCourt });
  } catch (error) {
    logger.error("Update court failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea terenului." });
  }
});

// Delete court
router.delete("/:businessId/courts/:courtId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, courtId } = req.params;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    // Verificare permisiuni
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge terenurile." });
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { businessId: true, bookings: { take: 1 } },
    });

    if (!court || court.businessId !== businessId) {
      return res.status(404).json({ error: "Terenul nu există." });
    }

    // Verificare dacă există booking-uri viitoare
    if (court.bookings.length > 0) {
      return res.status(400).json({ error: "Nu poți șterge un teren care are booking-uri asociate." });
    }

    await prisma.court.delete({
      where: { id: courtId },
    });

    return res.json({ message: "Terenul a fost șters cu succes." });
  } catch (error) {
    logger.error("Delete court failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea terenului." });
  }
});

// Get court pricing
router.get("/:businessId/courts/:courtId/pricing", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, courtId } = req.params;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    // Verificare permisiuni
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza tarifele." });
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { businessId: true },
    });

    if (!court || court.businessId !== businessId) {
      return res.status(404).json({ error: "Terenul nu există." });
    }

    const pricing = await prisma.courtPricing.findMany({
      where: { courtId },
      orderBy: { timeSlot: "asc" },
    });

    return res.json({ pricing });
  } catch (error) {
    logger.error("Get court pricing failed", error);
    return res.status(500).json({ error: "Eroare la obținerea tarifelor." });
  }
});

// Update court pricing
router.put("/:businessId/courts/:courtId/pricing", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, courtId } = req.params;
  const { pricing }: { pricing?: Array<{ timeSlot: string; price: number; startHour: number; endHour: number }> } = req.body;

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu există." });
    }

    // Verificare permisiuni
    const isOwner = business.ownerId === authReq.user?.userId;
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza tarifele." });
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      select: { businessId: true },
    });

    if (!court || court.businessId !== businessId) {
      return res.status(404).json({ error: "Terenul nu există." });
    }

    if (!pricing || !Array.isArray(pricing) || pricing.length !== 3) {
      return res.status(400).json({ error: "Trebuie să furnizezi exact 3 tarife (MORNING, AFTERNOON, NIGHT)." });
    }

    // Validare tarife
    const validTimeSlots = ["MORNING", "AFTERNOON", "NIGHT"];
    for (const price of pricing) {
      if (!validTimeSlots.includes(price.timeSlot)) {
        return res.status(400).json({ error: `TimeSlot invalid: ${price.timeSlot}. Trebuie să fie MORNING, AFTERNOON sau NIGHT.` });
      }
      if (price.price < 0) {
        return res.status(400).json({ error: "Prețul nu poate fi negativ." });
      }
      if (price.startHour < 0 || price.startHour > 23 || price.endHour < 0 || price.endHour > 23) {
        return res.status(400).json({ error: "Orele trebuie să fie între 0 și 23." });
      }
      if (price.startHour >= price.endHour) {
        return res.status(400).json({ error: "Ora de început trebuie să fie mai mică decât ora de sfârșit." });
      }
    }

    // Șterge tarifele existente și creează altele noi
    await prisma.$transaction(async (tx: any) => {
      await tx.courtPricing.deleteMany({
        where: { courtId },
      });

      await tx.courtPricing.createMany({
        data: pricing.map((p) => ({
          courtId,
          timeSlot: p.timeSlot as "MORNING" | "AFTERNOON" | "NIGHT",
          price: p.price,
          startHour: p.startHour,
          endHour: p.endHour,
        })),
      });
    });

    const updatedPricing = await prisma.courtPricing.findMany({
      where: { courtId },
      orderBy: { timeSlot: "asc" },
    });

    return res.json({ pricing: updatedPricing });
  } catch (error) {
    logger.error("Update court pricing failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea tarifelor." });
  }
});

// Get court availability
router.get("/:businessId/courts/:courtId/availability", async (req, res) => {
  const { businessId, courtId } = req.params;
  const { date } = req.query;

  try {
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "Parametrul 'date' este obligatoriu (format: YYYY-MM-DD)." });
    }

    const selectedDate = new Date(date);
    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).json({ error: "Data nu este validă." });
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      include: {
        business: {
          select: {
            id: true,
            workingHours: true,
            businessType: true,
          },
        },
        pricing: {
          orderBy: { timeSlot: "asc" },
        },
        bookings: {
          where: {
            date: {
              gte: new Date(selectedDate.setHours(0, 0, 0, 0)),
              lt: new Date(selectedDate.setHours(23, 59, 59, 999)),
            },
            status: {
              not: "CANCELLED",
            },
          },
          select: {
            id: true,
            date: true,
          },
        },
      },
    });

    if (!court || court.businessId !== businessId) {
      return res.status(404).json({ error: "Terenul nu există." });
    }

    if (court.business.businessType !== "SPORT_OUTDOOR") {
      return res.status(400).json({ error: "Acest endpoint este disponibil doar pentru business type SPORT_OUTDOOR." });
    }

    // Parse working hours
    type WorkingHours = {
      [key: string]: {
        enabled: boolean;
        slots: Array<{ start: string; end: string }>;
      };
    };
    const workingHours = court.business.workingHours as WorkingHours | null;
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[dayOfWeek] as string;

    if (!workingHours || !dayName || !workingHours[dayName] || !workingHours[dayName].enabled) {
      return res.json({
        available: [],
        pricing: court.pricing,
      });
    }

    const daySchedule = workingHours[dayName];
    type Slot = { hour: number; available: boolean; price: number; timeSlot: string };
    const slots: Slot[] = [];

    // Generează toate orele din programul de funcționare
    for (const slot of daySchedule.slots || []) {
      const [startHour, startMinute] = slot.start.split(":").map(Number);
      const [endHour, endMinute] = slot.end.split(":").map(Number);

      // Skip invalid time slots
      if (startHour === undefined || endHour === undefined || isNaN(startHour) || isNaN(endHour)) {
        continue;
      }

      for (let hour = startHour; hour < endHour; hour++) {
        // Verifică dacă ora este deja rezervată
        const isBooked = court.bookings.some((booking: { date: Date }) => {
          const bookingDate = new Date(booking.date);
          return bookingDate.getHours() === hour;
        });

        // Determină timeSlot-ul și prețul
        let timeSlot = "MORNING";
        let price = 0;

        for (const pricing of court.pricing) {
          if (pricing.startHour !== undefined && pricing.endHour !== undefined) {
            if (hour >= pricing.startHour && hour < pricing.endHour) {
              timeSlot = pricing.timeSlot;
              price = pricing.price;
              break;
            }
          }
        }

        slots.push({
          hour,
          available: !isBooked,
          price,
          timeSlot,
        });
      }
    }

    return res.json({
      available: slots,
      pricing: court.pricing,
    });
  } catch (error) {
    logger.error("Get court availability failed", error);
    return res.status(500).json({ error: "Eroare la obținerea disponibilității terenului." });
  }
});

export = router;
