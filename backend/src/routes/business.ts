import express = require("express");
import bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
import type { Prisma } from "@prisma/client";
const { BusinessType } = require("@prisma/client");
const { verifyJWT } = require("../middleware/auth");
const { logger } = require("../lib/logger");
const {
  generateBusinessQrDataUrl,
  generateBusinessQrBuffer,
  generateBusinessQrSvg,
} = require("../lib/qr");
const { checkEmployeeLimit } = require("../services/subscriptionService");

const router = express.Router();

const defaultBusinessInclude = {
  owner: {
    select: { id: true, email: true, name: true },
  },
  services: true,
  employees: {
    select: { id: true, name: true, email: true, phone: true, specialization: true, avatar: true },
  },
};

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

router.post("/", async (req, res) => {
  const {
    name,
    domain,
    ownerId,
    services,
    employeeIds,
    businessType,
  }: {
    name?: string;
    domain?: string;
    ownerId?: string;
    services?: { name: string; duration: number; price: number }[];
    employeeIds?: string[];
    businessType?: string;
  } = req.body;

  if (!name || !domain || !ownerId) {
    return res.status(400).json({ error: "name, domain și ownerId sunt obligatorii." });
  }

  const normalizedBusinessType =
    typeof businessType === "string" && Object.values(BusinessType).includes(businessType.toUpperCase())
      ? (businessType.toUpperCase() as typeof BusinessType[keyof typeof BusinessType])
      : BusinessType.GENERAL;

  try {
    const servicePayload =
      services?.map((service) => ({
        name: service.name,
        duration: service.duration,
        price: service.price,
      })) ?? [];

    const employeeConnect = employeeIds?.map((id) => ({ id })) ?? [];

    const createdBusiness = await prisma.business.create({
      data: {
        name,
        domain,
        owner: { connect: { id: ownerId } },
        businessType: normalizedBusinessType,
        ...(servicePayload.length > 0
          ? {
              services: {
                create: servicePayload,
              },
            }
          : {}),
        ...(employeeConnect.length > 0
          ? {
              employees: {
                connect: employeeConnect,
              },
            }
          : {}),
      },
    });

    try {
      const { dataUrl } = await generateBusinessQrDataUrl(createdBusiness.id);
      await prisma.business.update({
        where: { id: createdBusiness.id },
        data: { qrCodeUrl: dataUrl },
      });
    } catch (qrError) {
      console.error("Business QR generation error:", qrError);
    }

    const business = await prisma.business.findUnique({
      where: { id: createdBusiness.id },
      include: defaultBusinessInclude,
    });

    return res.status(201).json(business);
  } catch (error) {
    console.error("Business create error:", error);
    return res.status(500).json({ error: "Eroare la crearea business-ului." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      include: defaultBusinessInclude,
    });

    // Calculate slotDuration for each business if not set
    const businessesWithSlotDuration = await Promise.all(
      businesses.map(async (business: any) => {
        if (business.slotDuration !== null && business.slotDuration !== undefined) {
          return business;
        }

        // Calculate from minimum service duration
        const services = business.services || [];
        if (services.length === 0) {
          return { ...business, slotDuration: 60 }; // Default to 60 minutes
        }

        const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration));
        // Round to nearest valid slot duration (30, 60, 90, 120, etc.) - doar multipli de 30
        // Slot duration nu poate fi mai mare decât durata minimă a serviciului
        const validDurations = [30, 60, 90, 120, 150, 180];
        const calculatedSlotDuration = validDurations.reduce((prev, curr) => {
          if (curr > minDuration) return prev; // Nu folosim slot duration mai mare decât durata minimă
          return Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev;
        }, 30); // Default minim 30 minute

        return { ...business, slotDuration: calculatedSlotDuration };
      })
    );

    return res.json(businessesWithSlotDuration);
  } catch (error) {
    logger.error("Failed to list businesses", error);
    const errorMessage = error instanceof Error ? error.message : "Eroare necunoscută";
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Business list error details", { errorMessage, errorStack });
    return res.status(500).json({ 
      error: "Eroare la listarea business-urilor.",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    });
  }
});

router.post("/:businessId/generate-qr", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (
      !authReq.user ||
      (authReq.user.role !== "SUPERADMIN" && authReq.user.userId !== business.ownerId)
    ) {
      return res.status(403).json({ error: "Nu ai permisiunea de a regenera acest QR." });
    }

    const { dataUrl } = await generateBusinessQrDataUrl(businessId);
    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { qrCodeUrl: dataUrl },
      select: { id: true, qrCodeUrl: true },
    });

    return res.json({ qrCodeUrl: updated.qrCodeUrl });
  } catch (error) {
    logger.error("QR code regeneration failed", error);
    return res.status(500).json({ error: "Nu am putut regenera codul QR." });
  }
});

router.get("/:businessId/insights", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, employees: { select: { id: true } } },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const userId = authReq.user?.userId;
    const role = authReq.user?.role;
    const isOwner = !!userId && business.ownerId === userId;
    const isEmployee =
      !!userId && business.employees.some((employee: { id: string }) => employee.id === userId);
    const isSuperAdmin = role === "SUPERADMIN";
    let isLinkedClient = false;

    if (!isOwner && !isEmployee && !isSuperAdmin && role === "CLIENT" && userId) {
      const link = await prisma.clientBusinessLink.findFirst({
        where: { businessId, clientId: userId },
        select: { id: true },
      });
      isLinkedClient = !!link;
    }

    if (!isOwner && !isEmployee && !isSuperAdmin && !isLinkedClient) {
      return res.status(403).json({ error: "Nu ai acces la aceste insight-uri." });
    }

    const bookings = await prisma.booking.findMany({
      where: { businessId },
      include: {
        client: { select: { id: true, name: true, email: true } },
        service: { select: { name: true } },
      },
    });

    if (bookings.length === 0) {
      return res.json({
        topSlots: [],
        inactiveClients: [],
      });
    }

    type SlotStat = {
      day: string;
      hour: string;
      count: number;
      examples: { client: string; service: string; date: string }[];
    };

    const slotStats = new Map<string, SlotStat>();
    const lastBookingPerClient = new Map<
      string,
      { name: string; email: string; lastBooking: Date }
    >();

    for (const booking of bookings) {
      const bookingDate = new Date(booking.date);
      const weekday = bookingDate.toLocaleDateString("ro-RO", {
        weekday: "long",
      });
      const hour = `${bookingDate.getHours().toString().padStart(2, "0")}:00`;
      const slotKey = `${weekday}-${hour}`;

      if (!slotStats.has(slotKey)) {
        slotStats.set(slotKey, {
          day: weekday,
          hour,
          count: 0,
          examples: [],
        });
      }

      const slot = slotStats.get(slotKey)!;
      slot.count += 1;
      if (slot.examples.length < 3) {
        slot.examples.push({
          client: booking.client?.name ?? "Client",
          service: booking.service?.name ?? "Serviciu",
          date: bookingDate.toLocaleString("ro-RO"),
        });
      }

      if (booking.client?.id) {
        const clientId = booking.client.id;
        const existing = lastBookingPerClient.get(clientId);
        if (!existing || existing.lastBooking < bookingDate) {
          lastBookingPerClient.set(clientId, {
            name: booking.client.name ?? "Client",
            email: booking.client.email ?? "",
            lastBooking: bookingDate,
          });
        }
      }
    }

    const topSlots = Array.from(slotStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const INACTIVE_THRESHOLD_DAYS = 90;
    const threshold = Date.now() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const inactiveClients = Array.from(lastBookingPerClient.values())
      .filter((entry) => entry.lastBooking.getTime() < threshold)
      .sort((a, b) => a.lastBooking.getTime() - b.lastBooking.getTime())
      .slice(0, 5)
      .map((entry) => ({
        name: entry.name,
        email: entry.email,
        lastBooking: entry.lastBooking,
        daysSince: Math.floor((Date.now() - entry.lastBooking.getTime()) / (1000 * 60 * 60 * 24)),
      }));

    return res.json({
      topSlots,
      inactiveClients,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to fetch business insights", error);
    return res.status(500).json({ error: "Nu am putut genera insight-urile." });
  }
});

router.get("/:businessId/qr", async (req, res) => {
  const { businessId } = req.params;
  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const formatParam = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "png";
    const format = formatParam === "svg" ? "svg" : "png";
    const downloadParam = typeof req.query.download === "string" ? req.query.download.toLowerCase() : "";
    const download = ["1", "true", "yes"].includes(downloadParam);
    const fileName = `voob-${business.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || business.id.slice(0, 8)}.${format}`;

    if (format === "svg") {
      const { svg } = await generateBusinessQrSvg(businessId);
      res.setHeader("Content-Type", "image/svg+xml");
      if (download) {
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      }
      return res.send(svg);
    }

    const { buffer } = await generateBusinessQrBuffer(businessId);
    res.setHeader("Content-Type", "image/png");
    if (download) {
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    }
    return res.send(buffer);
  } catch (error) {
    logger.error("QR code download failed", error);
    return res.status(500).json({ error: "Nu am putut genera codul QR." });
  }
});

router.post("/:businessId/services", async (req, res) => {
  const { businessId } = req.params;
  const { name, duration, price, notes }: { name?: string; duration?: number; price?: number; notes?: string } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }
  if (!name || typeof duration !== "number" || typeof price !== "number") {
    return res
      .status(400)
      .json({ error: "name, duration și price sunt obligatorii pentru creare serviciu." });
  }

  // Validare: durata trebuie să fie multiplu de 30 minute
  if (duration % 30 !== 0) {
    return res.status(400).json({ 
      error: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)" 
    });
  }

  try {
    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        duration,
        price,
        notes: notes?.trim() || null,
        business: { connect: { id: businessId } },
      },
    });

    return res.status(201).json(service);
  } catch (error) {
    logger.error("Service creation failed", error);
    return res.status(500).json({ error: "Eroare la adăugarea serviciului." });
  }
});

router.put("/:businessId/services/:serviceId", async (req, res) => {
  const { businessId, serviceId } = req.params;
  const { name, duration, price, notes }: { name?: string; duration?: number; price?: number; notes?: string } = req.body;

  if (!businessId || !serviceId) {
    return res.status(400).json({ error: "businessId și serviceId sunt obligatorii." });
  }
  if (!name || typeof duration !== "number" || typeof price !== "number") {
    return res
      .status(400)
      .json({ error: "name, duration și price sunt obligatorii pentru actualizare serviciu." });
  }

  // Validare: durata trebuie să fie multiplu de 30 minute
  if (duration % 30 !== 0) {
    return res.status(400).json({ 
      error: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)" 
    });
  }

  try {
    // Verify that the service belongs to the business
    const existingService = await prisma.service.findFirst({
      where: {
        id: serviceId,
        businessId: businessId,
      },
    });

    if (!existingService) {
      return res.status(404).json({ error: "Serviciul nu a fost găsit sau nu aparține acestui business." });
    }

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        name: name.trim(),
        duration,
        price,
        notes: notes?.trim() || null,
      },
    });

    return res.json(service);
  } catch (error) {
    logger.error("Service update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea serviciului." });
  }
});

router.delete("/:businessId/services/:serviceId", async (req, res) => {
  const { businessId, serviceId } = req.params;

  if (!businessId || !serviceId) {
    return res.status(400).json({ error: "businessId și serviceId sunt obligatorii." });
  }

  try {
    // Verify that the service belongs to the business
    const existingService = await prisma.service.findFirst({
      where: {
        id: serviceId,
        businessId: businessId,
      },
    });

    if (!existingService) {
      return res.status(404).json({ error: "Serviciul nu a fost găsit sau nu aparține acestui business." });
    }

    await prisma.service.delete({
      where: { id: serviceId },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error("Service deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea serviciului." });
  }
});

router.post("/:businessId/employees", async (req, res) => {
  const { businessId } = req.params;
  const {
    name,
    email,
    phone,
    specialization,
  }: {
    name?: string;
    email?: string;
    phone?: string;
    specialization?: string;
  } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }
  if (!name || !email) {
    return res.status(400).json({ error: "name și email sunt obligatorii pentru crearea unui employee." });
  }

  try {
    // Verify that the business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Check employee limit based on subscription plan
    const employeeLimitCheck = await checkEmployeeLimit(businessId);
    if (!employeeLimitCheck.canAdd) {
      return res.status(403).json({
        error: employeeLimitCheck.error || "Ai atins limita de angajați pentru planul tău.",
        currentCount: employeeLimitCheck.currentCount,
        maxAllowed: employeeLimitCheck.maxAllowed,
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existingUser) {
      return res.status(409).json({ error: "Un utilizator cu acest email există deja." });
    }

    // Generate a random password
    const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Create employee user and add to business
    const employee = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          email: email.trim(),
          password: hashedPassword,
          name: name.trim(),
          phone: phone?.trim() || null,
          specialization: specialization?.trim() || null,
          role: "EMPLOYEE",
          businessId: businessId,
        },
      });

      // Add employee to business
      await tx.business.update({
        where: { id: businessId },
        data: {
          employees: {
            connect: { id: createdUser.id },
          },
        },
      });

      return createdUser;
    });

    const { password: _password, ...employeeResponse } = employee;

    return res.status(201).json(employeeResponse);
  } catch (error) {
    logger.error("Employee creation failed", error);
    return res.status(500).json({ error: "Eroare la adăugarea employee-ului." });
  }
});

// Update an employee
router.put("/:businessId/employees/:employeeId", async (req, res) => {
  const { businessId, employeeId } = req.params;
  const {
    name,
    email,
    phone,
    specialization,
  }: {
    name?: string;
    email?: string;
    phone?: string;
    specialization?: string;
  } = req.body;

  if (!businessId || !employeeId) {
    return res.status(400).json({ error: "businessId și employeeId sunt obligatorii." });
  }

  if (!name || !email) {
    return res.status(400).json({ error: "name și email sunt obligatorii pentru actualizarea unui employee." });
  }

  try {
    // Verify that the business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        employees: {
          where: { id: employeeId },
        },
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.employees.length === 0) {
      return res.status(404).json({ error: "Angajatul nu a fost găsit sau nu aparține acestui business." });
    }

    // Check if email is being changed and if it already exists
    if (email.trim() !== business.employees[0].email) {
      const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (existingUser) {
        return res.status(409).json({ error: "Un utilizator cu acest email există deja." });
      }
    }

    // Update employee user
    const updatedEmployee = await prisma.user.update({
      where: { id: employeeId },
      data: {
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        specialization: specialization?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        specialization: true,
      },
    });

    return res.json(updatedEmployee);
  } catch (error) {
    logger.error("Employee update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea angajatului." });
  }
});

// Delete an employee from a business
router.delete("/:businessId/employees/:employeeId", async (req, res) => {
  const { businessId, employeeId } = req.params;

  if (!businessId || !employeeId) {
    return res.status(400).json({ error: "businessId și employeeId sunt obligatorii." });
  }

  try {
    // Verify that the business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        employees: {
          where: { id: employeeId },
        },
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.employees.length === 0) {
      return res.status(404).json({ error: "Angajatul nu a fost găsit sau nu aparține acestui business." });
    }

    // Remove employee from business
    await prisma.business.update({
      where: { id: businessId },
      data: {
        employees: {
          disconnect: { id: employeeId },
        },
      },
    });

    // Optionally delete the user if they are only an employee (not owner)
    // For now, we'll just disconnect them from the business
    // You might want to check if they have bookings before deleting

    return res.json({ success: true });
  } catch (error) {
    logger.error("Employee deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea angajatului." });
  }
});

// Get working hours for a business
router.get("/:businessId/working-hours", async (req, res) => {
  const { businessId } = req.params;
  const { employeeId } = req.query as { employeeId?: string };

  logger.info(
    `GET /business/${businessId}/working-hours - Request received${employeeId ? ` (employeeId=${employeeId})` : ""}`
  );

  if (!businessId) {
    logger.warn("GET /business/:businessId/working-hours - Missing businessId");
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // If an employeeId is provided, try to return that employee's schedule first
    if (employeeId) {
      const employee = await prisma.user.findFirst({
        where: {
          id: employeeId,
          OR: [
            { businessId },
            {
              ownedBusinesses: {
                some: {
                  id: businessId,
                },
              },
            },
          ],
        },
        select: { workingHours: true },
      });

      if (!employee) {
        logger.warn(
          `GET /business/${businessId}/working-hours - Employee ${employeeId} not linked to this business`
        );
        return res.status(404).json({ error: "Angajatul nu aparține acestui business." });
      }

      if (employee.workingHours) {
        logger.info(
          `GET /business/${businessId}/working-hours - Returning employee ${employeeId} schedule`
        );
        return res.json({ workingHours: employee.workingHours, source: "employee" });
      }

      logger.info(
        `GET /business/${businessId}/working-hours - Employee ${employeeId} has no custom schedule, falling back to business hours`
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { workingHours: true },
    });

    if (!business) {
      logger.warn(`GET /business/${businessId}/working-hours - Business not found`);
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    logger.info(
      `GET /business/${businessId}/working-hours - Returning business schedule${employeeId ? " (fallback)" : ""}`
    );
    return res.json({ workingHours: business.workingHours, source: "business" });
  } catch (error) {
    logger.error("Failed to fetch working hours", error);
    return res.status(500).json({ error: "Eroare la obținerea programului de lucru." });
  }
});

// Update working hours for a business
router.put("/:businessId/working-hours", async (req, res) => {
  const { businessId } = req.params;
  const { workingHours }: { workingHours?: any } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verify that the business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: businessId },
      data: {
        workingHours: workingHours || null,
      },
      select: { workingHours: true },
    });

    return res.json({ workingHours: updatedBusiness.workingHours });
  } catch (error) {
    logger.error("Working hours update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea programului de lucru." });
  }
});

// Update slot duration for a business
/**
 * PUT /business/:businessId
 * Actualizează informațiile unui business
 */
router.put("/:businessId", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;
  const { name, email, address, phone, latitude, longitude, businessType } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza acest business." });
    }

    // Validare
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return res.status(400).json({ error: "Numele business-ului este obligatoriu." });
    }

    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email-ul nu este valid." });
    }

    // Verifică dacă email-ul este deja folosit de alt business
    if (email !== undefined && email) {
      const existingBusiness = await prisma.business.findFirst({
        where: {
          email: email,
          id: { not: businessId },
        },
      });

      if (existingBusiness) {
        return res.status(409).json({ error: "Acest email este deja folosit de alt business." });
      }
    }

    // Actualizează business-ul
    const updateData: any = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (email !== undefined) {
      updateData.email = email && email.trim() ? email.trim() : null;
    }
    if (address !== undefined) {
      updateData.address = address && address.trim() ? address.trim() : null;
    }
    if (phone !== undefined) {
      updateData.phone = phone && phone.trim() ? phone.trim() : null;
    }
    if (latitude !== undefined) {
      updateData.latitude = latitude !== null && latitude !== undefined ? parseFloat(latitude) : null;
    }
    if (longitude !== undefined) {
      updateData.longitude = longitude !== null && longitude !== undefined ? parseFloat(longitude) : null;
    }
    if (businessType !== undefined) {
      // Validare businessType
      const normalizedBusinessType =
        typeof businessType === "string" && Object.values(BusinessType).includes(businessType.toUpperCase())
          ? (businessType.toUpperCase() as typeof BusinessType[keyof typeof BusinessType])
          : null;
      
      if (!normalizedBusinessType) {
        return res.status(400).json({ 
          error: `Tipul de business este invalid. Tipuri valide: ${Object.values(BusinessType).join(", ")}` 
        });
      }
      
      updateData.businessType = normalizedBusinessType;
    }

    // Verifică dacă există date de actualizat
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Nu există date de actualizat." });
    }

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: updateData,
      include: defaultBusinessInclude,
    });

    logger.info(`Business ${businessId} updated by user ${authReq.user?.userId}`);

    return res.json(updated);
  } catch (error: any) {
    logger.error("Business update failed", error);
    console.error("Business update error details:", error);
    // Returnează mesajul de eroare mai detaliat pentru debugging
    const errorMessage = error?.message || "Eroare la actualizarea business-ului.";
    return res.status(500).json({ error: errorMessage });
  }
});

router.put("/:businessId/slot-duration", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const { slotDuration }: { slotDuration?: number } = req.body;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Validate slotDuration if provided
  if (slotDuration !== undefined && slotDuration !== null) {
    const validDurations = [15, 30, 45, 60];
    if (!validDurations.includes(slotDuration)) {
      return res.status(400).json({
        error: "slotDuration trebuie să fie unul dintre: 15, 30, 45, 60 minute.",
      });
    }
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Authorization: only owner or superadmin can update
    const userId = authReq.user?.userId;
    const role = authReq.user?.role;
    const isOwner = !!userId && business.ownerId === userId;
    const isSuperAdmin = role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza slot duration." });
    }

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { slotDuration: slotDuration ?? null },
      include: defaultBusinessInclude,
    });

    // Calculate slotDuration if set to null (for response)
    let finalSlotDuration = updated.slotDuration;
    if (finalSlotDuration === null) {
      const services = updated.services || [];
      if (services.length > 0) {
        const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration));
        const validDurations = [15, 30, 45, 60];
        finalSlotDuration = validDurations.reduce((prev, curr) =>
          Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev
        );
      } else {
        finalSlotDuration = 60;
      }
    }

    return res.json({ ...updated, slotDuration: finalSlotDuration });
  } catch (error) {
    logger.error("Failed to update slot duration", error);
    return res.status(500).json({ error: "Eroare la actualizarea slot duration." });
  }
});

// Get holidays for a business
router.get("/:businessId/holidays", async (req, res) => {
  const { businessId } = req.params;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const holidays = await prisma.holiday.findMany({
      where: { businessId },
      orderBy: { startDate: "asc" },
    });

    return res.json({ holidays });
  } catch (error) {
    logger.error("Failed to fetch holidays", error);
    return res.status(500).json({ error: "Eroare la obținerea perioadelor de concediu." });
  }
});

// Create a holiday period
router.post("/:businessId/holidays", async (req, res) => {
  const { businessId } = req.params;
  const { startDate, endDate, reason }: { startDate?: string; endDate?: string; reason?: string } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate și endDate sunt obligatorii." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ error: "Data de început trebuie să fie înainte de data de sfârșit." });
    }

    // Check for overlapping holidays
    const overlapping = await prisma.holiday.findFirst({
      where: {
        businessId,
        OR: [
          {
            AND: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
          },
        ],
      },
    });

    if (overlapping) {
      return res.status(409).json({ error: "Există deja o perioadă de concediu care se suprapune cu această perioadă." });
    }

    const holiday = await prisma.holiday.create({
      data: {
        businessId,
        startDate: start,
        endDate: end,
        reason: reason?.trim() || null,
      },
    });

    return res.status(201).json({ holiday });
  } catch (error) {
    logger.error("Holiday creation failed", error);
    return res.status(500).json({ error: "Eroare la crearea perioadei de concediu." });
  }
});

// Delete a holiday period
router.delete("/:businessId/holidays/:holidayId", async (req, res) => {
  const { businessId, holidayId } = req.params;

  if (!businessId || !holidayId) {
    return res.status(400).json({ error: "businessId și holidayId sunt obligatorii." });
  }

  try {
    // Verify that the holiday belongs to the business
    const holiday = await prisma.holiday.findFirst({
      where: {
        id: holidayId,
        businessId: businessId,
      },
    });

    if (!holiday) {
      return res.status(404).json({ error: "Perioada de concediu nu a fost găsită sau nu aparține acestui business." });
    }

    await prisma.holiday.delete({
      where: { id: holidayId },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error("Holiday deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea perioadei de concediu." });
  }
});

/**
 * POST /business/:businessId/cancel-subscription
 * Anulează abonamentul Stripe pentru un business
 */
router.post("/:businessId/cancel-subscription", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a anula abonamentul pentru acest business." });
    }

    // Verifică dacă există subscription
    const subscription = await prisma.subscription.findFirst({
      where: { businessId },
      select: { id: true, stripeSubscriptionId: true, status: true },
    });

    if (!subscription) {
      return res.status(404).json({ error: "Nu există abonament activ pentru acest business." });
    }

    if (subscription.status === "CANCELED") {
      return res.status(400).json({ error: "Abonamentul este deja anulat." });
    }

    // Anulează subscription în Stripe
    const { cancelSubscription } = require("../modules/billing/billing.service");
    const { getStripeClient } = require("../services/stripeService");
    const stripe = getStripeClient();

    if (subscription.stripeSubscriptionId) {
      try {
        // Anulează subscription (va continua până la sfârșitul perioadei plătite)
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (stripeError: any) {
        logger.error("Stripe subscription cancellation failed", stripeError);
        // Continuă chiar dacă Stripe eșuează, actualizăm în DB
      }
    }

    // Actualizează statusul în DB
    await prisma.subscription.updateMany({
      where: { businessId },
      data: {
        status: "CANCELED",
        autoBillingEnabled: false,
      },
    });

    logger.info(`Subscription canceled for business ${businessId} by user ${authReq.user?.userId}`);

    return res.json({
      success: true,
      message: "Abonamentul a fost anulat cu succes. Business-ul va rămâne activ până la expirarea perioadei plătite.",
    });
  } catch (error) {
    logger.error("Cancel subscription failed", error);
    return res.status(500).json({ error: "Eroare la anularea abonamentului." });
  }
});

/**
 * DELETE /business/:businessId
 * Șterge permanent un business și toate datele asociate
 */
router.delete("/:businessId", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, name: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge acest business." });
    }

    // Anulează subscription-ul Stripe dacă există
    const subscriptions = await prisma.subscription.findMany({
      where: { businessId },
      select: { stripeSubscriptionId: true },
    });

    const { getStripeClient } = require("../services/stripeService");
    const stripe = getStripeClient();

    for (const sub of subscriptions) {
      if (sub.stripeSubscriptionId) {
        try {
          // Șterge complet subscription-ul din Stripe
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        } catch (stripeError: any) {
          logger.error("Stripe subscription deletion failed", stripeError);
          // Continuă chiar dacă Stripe eșuează
        }
      }
    }

    // Șterge toate datele asociate (Prisma va gestiona cascade-ul pentru relațiile cu onDelete: Cascade)
    // Dar trebuie să ștergem manual relațiile care nu au cascade

    // Șterge employees (User cu businessId)
    await prisma.user.updateMany({
      where: { businessId },
      data: { businessId: null },
    });

    // Șterge clientLinks
    await prisma.clientBusinessLink.deleteMany({
      where: { businessId },
    });

    // Șterge subscriptions
    await prisma.subscription.deleteMany({
      where: { businessId },
    });

    // Șterge services (ar trebui să aibă cascade pentru bookings, dar să fim siguri)
    await prisma.service.deleteMany({
      where: { businessId },
    });

    // Șterge bookings (ar trebui să aibă cascade pentru payments, dar să fim siguri)
    await prisma.booking.deleteMany({
      where: { businessId },
    });

    // Șterge payments
    await prisma.payment.deleteMany({
      where: { businessId },
    });

    // Șterge invoices
    await prisma.invoice.deleteMany({
      where: { businessId },
    });

    // Șterge consentDocuments și consentForms
    await prisma.consentDocument.deleteMany({
      where: { businessId },
    });

    await prisma.consentForm.deleteMany({
      where: { businessId },
    });

    // Șterge smsUsageLogs și aiUsageLogs
    await prisma.smsUsageLog.deleteMany({
      where: { businessId },
    });

    await prisma.aiUsageLog.deleteMany({
      where: { businessId },
    });

    // Șterge business onboarding data
    await prisma.businessBankAccount.deleteMany({
      where: { businessId },
    });

    await prisma.businessKycStatus.deleteMany({
      where: { businessId },
    });

    await prisma.businessLegalInfo.deleteMany({
      where: { businessId },
    });

    await prisma.businessRepresentative.deleteMany({
      where: { businessId },
    });

    // Șterge holidays (ar trebui să aibă cascade, dar să fim siguri)
    await prisma.holiday.deleteMany({
      where: { businessId },
    });

    // Șterge business-ul în sine
    await prisma.business.delete({
      where: { id: businessId },
    });

    logger.info(`Business ${businessId} (${business.name}) deleted by user ${authReq.user?.userId}`);

    return res.json({
      success: true,
      message: "Business-ul a fost șters permanent cu succes.",
    });
  } catch (error) {
    logger.error("Business deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea business-ului." });
  }
});

// ============================================
// COURT MANAGEMENT ENDPOINTS (SPORT_OUTDOOR)
// ============================================

/**
 * GET /business/:businessId/courts
 * Obține toate terenurile unui business
 */
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

/**
 * POST /business/:businessId/courts
 * Creează un teren nou
 */
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

/**
 * PUT /business/:businessId/courts/:courtId
 * Actualizează un teren
 */
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
      select: { businessId: true },
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

    const updateData: any = {};
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

/**
 * DELETE /business/:businessId/courts/:courtId
 * Șterge un teren
 */
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

/**
 * GET /business/:businessId/courts/:courtId/pricing
 * Obține tarifele unui teren
 */
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

/**
 * PUT /business/:businessId/courts/:courtId/pricing
 * Actualizează tarifele unui teren
 */
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

/**
 * GET /business/:businessId/courts/:courtId/availability
 * Obține disponibilitatea unui teren pentru o dată specifică
 */
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
    const workingHours = court.business.workingHours as any;
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[dayOfWeek] as string;

    if (!workingHours || !dayName || !workingHours[dayName] || !workingHours[dayName].enabled) {
      return res.json({
        available: [],
        pricing: court.pricing,
      });
    }

    const daySchedule = workingHours[dayName] as any;
    const slots: Array<{ hour: number; available: boolean; price: number; timeSlot: string }> = [];

    // Generează toate orele din programul de funcționare
    for (const slot of daySchedule.slots || []) {
      const [startHour, startMinute] = slot.start.split(":").map(Number);
      const [endHour, endMinute] = slot.end.split(":").map(Number);

      for (let hour = startHour; hour < endHour; hour++) {
        // Verifică dacă ora este deja rezervată
        const isBooked = court.bookings.some((booking: any) => {
          const bookingDate = new Date(booking.date);
          return bookingDate.getHours() === hour;
        });

        // Determină timeSlot-ul și prețul
        let timeSlot = "MORNING";
        let price = 0;

        for (const pricing of court.pricing) {
          if (hour >= pricing.startHour && hour < pricing.endHour) {
            timeSlot = pricing.timeSlot;
            price = pricing.price;
            break;
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

