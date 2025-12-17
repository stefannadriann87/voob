/**
 * Business Employees Routes
 * CRITICAL FIX (TICKET-014): Extracted employees management routes from business.ts
 * Handles: Create, Update, Delete employees
 */

import express = require("express");
import bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
import type { Prisma } from "@prisma/client";
const { verifyJWT } = require("../middleware/auth");
const { requireBusinessAccess } = require("../middleware/requireOwnership");
const { invalidateBusinessProfile } = require("../services/cacheService");
const { logger } = require("../lib/logger");
const { validate } = require("../middleware/validate");
const { createEmployeeSchema, updateEmployeeSchema } = require("../validators/businessSchemas");
const { checkEmployeeLimit } = require("../services/subscriptionService");
import { AuthenticatedRequest } from "./business.shared";

const router = express.Router();

// Create employee
router.post("/:businessId/employees", verifyJWT, requireBusinessAccess("businessId"), validate(createEmployeeSchema), async (req, res) => {
  const { businessId } = req.params;
  const { email, name, phone } = createEmployeeSchema.parse(req.body);
  const { specialization } = req.body as { specialization?: string };

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
    const employee = await prisma.$transaction(async (tx: any) => {
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

    // CRITICAL FIX (TICKET-009): Invalidate cache when employee is created
    await invalidateBusinessProfile(businessId);

    return res.status(201).json(employeeResponse);
  } catch (error) {
    logger.error("Employee creation failed", error);
    return res.status(500).json({ error: "Eroare la adăugarea employee-ului." });
  }
});

// Update employee
router.put("/:businessId/employees/:employeeId", verifyJWT, validate(updateEmployeeSchema), async (req, res) => {
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

    // CRITICAL FIX (TICKET-009): Invalidate cache when employee is updated
    await invalidateBusinessProfile(businessId);

    return res.json(updatedEmployee);
  } catch (error) {
    logger.error("Employee update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea angajatului." });
  }
});

// Delete employee
router.delete("/:businessId/employees/:employeeId", verifyJWT, async (req, res) => {
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

    // CRITICAL FIX (TICKET-009): Invalidate cache when employee is deleted
    await invalidateBusinessProfile(businessId);

    // Optionally delete the user if they are only an employee (not owner)
    // For now, we'll just disconnect them from the business
    // You might want to check if they have bookings before deleting

    return res.json({ success: true });
  } catch (error) {
    logger.error("Employee deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea angajatului." });
  }
});

export = router;
