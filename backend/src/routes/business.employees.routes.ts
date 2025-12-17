/**
 * Business Employees Routes
 * CRITICAL FIX (TICKET-014): Extracted employees management routes from business.ts
 * Handles: Create, Update, Delete employees
 */

import express = require("express");
import bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { requireBusinessAccess } = require("../middleware/requireOwnership");
const { 
  invalidateBusinessProfile,
  getBusinessProfile,
  setBusinessProfile,
  TTL,
} = require("../services/cacheService");
const { logger } = require("../lib/logger");
const { validate, validateQuery } = require("../middleware/validate");
const { paginationQuerySchema, getPaginationParams, buildPaginationResponse } = require("../validators/paginationSchemas");
const { createEmployeeSchema, updateEmployeeSchema } = require("../validators/businessSchemas");
const { checkEmployeeLimit } = require("../services/subscriptionService");

const router = express.Router();

// CRITICAL FIX (TICKET-009, TICKET-010): Get employees list with caching and pagination
router.get("/:businessId/employees", verifyJWT, requireBusinessAccess("businessId"), validateQuery(paginationQuerySchema), async (req, res) => {
  const { businessId } = req.params;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Parse pagination parameters
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50; // Default 50 items
    const { skip, take } = getPaginationParams(page, limit);

    // Get total count for pagination
    const total = await prisma.user.count({
      where: { 
        businessId,
        role: "EMPLOYEE",
      },
    });

    // Fetch employees from database
    const employees = await prisma.user.findMany({
      where: { 
        businessId,
        role: "EMPLOYEE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        specialization: true,
        avatar: true,
      },
      skip,
      take,
      orderBy: { name: "asc" },
    });

    // Build paginated response
    const response = buildPaginationResponse(employees, total, page, limit);

    return res.json(response);
  } catch (error: any) {
    logger.error("Failed to get employees", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      
      // Check for business not found
      if (errorMessage.includes("Business") || errorMessage.includes("not found")) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l accesa."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut încărca lista de angajați. Te rugăm să încerci din nou.",
      code: "EMPLOYEES_FETCH_FAILED",
      actionable: "Dacă problema persistă, reîmprospătează pagina sau contactează suportul."
    });
  }
});

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
  } catch (error: any) {
    logger.error("Employee creation failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for duplicate email
      if (errorMessage.includes("Un utilizator cu acest email există deja") || 
          errorMessage.includes("Unique constraint") ||
          errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Un utilizator cu acest email există deja în sistem.",
          code: "EMAIL_ALREADY_EXISTS",
          actionable: "Folosește un alt email sau verifică dacă angajatul este deja înregistrat."
        });
      }
      
      // Check for foreign key constraint errors
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("Record to connect not found") ||
          errorCode === "P2025") {
        return res.status(400).json({ 
          error: "Business-ul nu a fost găsit sau nu ai permisiunea de a adăuga angajați pentru acest business.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l gestiona."
        });
      }
      
      // Check for employee limit
      if (errorMessage.includes("limita") || errorMessage.includes("limit")) {
        return res.status(403).json({ 
          error: errorMessage || "Ai atins limita de angajați pentru planul tău.",
          code: "EMPLOYEE_LIMIT_REACHED",
          actionable: "Upgrade la un plan superior sau șterge angajați existenți pentru a adăuga alții."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut adăuga angajatul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_CREATION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
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
  } catch (error: any) {
    logger.error("Employee update failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for not found errors
      if (errorMessage.includes("nu a fost găsit") || 
          errorMessage.includes("Record to update not found") || 
          errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Angajatul nu a fost găsit sau nu aparține acestui business.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că angajatul există și că aparține business-ului corect."
        });
      }
      
      // Check for duplicate email
      if (errorMessage.includes("Un utilizator cu acest email există deja") || 
          errorMessage.includes("Unique constraint") ||
          errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Un utilizator cu acest email există deja în sistem.",
          code: "EMAIL_ALREADY_EXISTS",
          actionable: "Folosește un alt email pentru acest angajat."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut actualiza angajatul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_UPDATE_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
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
  } catch (error: any) {
    logger.error("Employee deletion failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for not found errors
      if (errorMessage.includes("nu a fost găsit") || 
          errorMessage.includes("Record to delete does not exist") || 
          errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Angajatul nu a fost găsit sau a fost deja șters.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că angajatul există înainte de a-l șterge."
        });
      }
      
      // Check for foreign key constraint errors (employee is referenced)
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("violates foreign key constraint") ||
          errorCode === "P2003") {
        return res.status(409).json({ 
          error: "Nu poți șterge acest angajat deoarece are rezervări asociate.",
          code: "EMPLOYEE_IN_USE",
          actionable: "Anulează sau finalizează toate rezervările pentru acest angajat înainte de a-l șterge."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut șterge angajatul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_DELETION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

export = router;
