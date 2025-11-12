import express = require("express");
import bcrypt = require("bcryptjs");
import prisma from "../lib/prisma";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    name,
    domain,
    ownerId,
    services,
    employeeIds,
  }: {
    name?: string;
    domain?: string;
    ownerId?: string;
    services?: { name: string; duration: number; price: number }[];
    employeeIds?: string[];
  } = req.body;

  if (!name || !domain || !ownerId) {
    return res.status(400).json({ error: "name, domain și ownerId sunt obligatorii." });
  }

  try {
    const servicePayload =
      services?.map((service) => ({
        name: service.name,
        duration: service.duration,
        price: service.price,
      })) ?? [];

    const employeeConnect = employeeIds?.map((id) => ({ id })) ?? [];

    const business = await prisma.business.create({
      data: {
        name,
        domain,
        owner: { connect: { id: ownerId } },
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
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
        services: true,
        employees: {
          select: { id: true, name: true, email: true, phone: true, specialization: true },
        },
      },
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
      include: {
        services: true,
        owner: {
          select: { id: true, name: true, email: true },
        },
        employees: {
          select: { id: true, name: true, email: true, phone: true, specialization: true },
        },
      },
    });

    return res.json(businesses);
  } catch (error) {
    console.error("Business list error:", error);
    return res.status(500).json({ error: "Eroare la listarea business-urilor." });
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

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (existingUser) {
      return res.status(409).json({ error: "Un utilizator cu acest email există deja." });
    }

    // Generate a random password
    const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Create employee user and add to business
    const employee = await prisma.$transaction(async (tx) => {
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

export = router;

