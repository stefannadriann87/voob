import express = require("express");
import bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma").default;
import type { Prisma } from "@prisma/client";
const { BusinessType } = require("@prisma/client");
const { verifyJWT } = require("../middleware/auth");
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

    return res.json(businesses);
  } catch (error) {
    console.error("Business list error:", error);
    return res.status(500).json({ error: "Eroare la listarea business-urilor." });
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
    console.error("Regenerate QR error:", error);
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
    console.error("Business insights error:", error);
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
    const fileName = `larstef-${business.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || business.id.slice(0, 8)}.${format}`;

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
    console.error("Business QR download error:", error);
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
    console.error("Add service error:", error);
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
    console.error("Update service error:", error);
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
    console.error("Delete service error:", error);
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
    console.error("Add employee error:", error);
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
    console.error("Update employee error:", error);
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
    console.error("Delete employee error:", error);
    return res.status(500).json({ error: "Eroare la ștergerea angajatului." });
  }
});

// Get working hours for a business
router.get("/:businessId/working-hours", async (req, res) => {
  const { businessId } = req.params;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { workingHours: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    return res.json({ workingHours: business.workingHours });
  } catch (error) {
    console.error("Get working hours error:", error);
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
    console.error("Update working hours error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea programului de lucru." });
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
    console.error("Get holidays error:", error);
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
    console.error("Create holiday error:", error);
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
    console.error("Delete holiday error:", error);
    return res.status(500).json({ error: "Eroare la ștergerea perioadei de concediu." });
  }
});

export = router;

