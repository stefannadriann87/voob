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
const { employeeIdParamSchema } = require("../validators/employeeSchemas");
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
        canManageOwnServices: true, // TICKET-044: Include flag-ul în listă
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
      error: "Nu am putut încărca lista de specialiști. Te rugăm să încerci din nou.",
      code: "EMPLOYEES_FETCH_FAILED",
      actionable: "Dacă problema persistă, reîmprospătează pagina sau contactează suportul."
    });
  }
});

// Get single employee
router.get("/:businessId/employees/:employeeId", 
  verifyJWT, 
  requireBusinessAccess("businessId"),
  async (req, res) => {
    const { businessId, employeeId } = req.params;
    
    // CRITICAL FIX: Validate employeeId - check if it exists and is valid
    if (!employeeId) {
      logger.warn("GET /employees/:employeeId - Missing employeeId", {
        businessId,
        employeeId,
        path: req.path,
      });
      return res.status(400).json({ error: "employeeId este obligatoriu." });
    }
    
    // Validate employeeId format
    try {
      employeeIdParamSchema.parse({ employeeId });
    } catch (error: any) {
      logger.warn("GET /employees/:employeeId - Invalid employeeId format", {
        businessId,
        employeeId,
        error: error?.errors || error?.message,
        path: req.path,
      });
      return res.status(400).json({ error: "employeeId invalid." });
    }

    try {
      // Verify that the business exists
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, ownerId: true },
      });

      if (!business) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l accesa.",
        });
      }

      // Get employee - ensure employee belongs to this business and is EMPLOYEE role
      const employee = await prisma.user.findUnique({
        where: { 
          id: employeeId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          specialization: true,
          avatar: true,
          canManageOwnServices: true, // TICKET-044: Include flag-ul
          workingHours: true,
          role: true,
          businessId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!employee) {
        return res.status(404).json({ 
          error: "Specialistul nu a fost găsit.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că specialistul există.",
        });
      }

      // CRITICAL FIX: Allow business owner to be treated as an employee
      // Business owner can also perform services and should appear in the employees list
      if (employee.id === business.ownerId) {
        // Owner is allowed - return owner data as if it were an employee
        // Remove sensitive fields before returning
        const { businessId: _businessId, role: _role, ...employeeResponse } = employee;
        return res.json(employeeResponse);
      }

      // Verify employee belongs to this business
      if (employee.businessId !== businessId) {
        return res.status(403).json({ 
          error: "Specialistul nu aparține acestui business.",
          code: "EMPLOYEE_BUSINESS_MISMATCH",
          actionable: "Verifică că specialistul aparține business-ului corect.",
        });
      }

      // Verify employee has EMPLOYEE role (only if not owner)
      if (employee.role !== "EMPLOYEE") {
        return res.status(403).json({ 
          error: "Utilizatorul nu este un specialist.",
          code: "NOT_AN_EMPLOYEE",
          actionable: "Verifică că utilizatorul are rolul de EMPLOYEE.",
        });
      }

      // Remove sensitive fields before returning
      const { businessId: _businessId, role: _role, ...employeeResponse } = employee;

      return res.json(employeeResponse);
    } catch (error: any) {
      logger.error("Failed to get employee", error);
      
      // CRITICAL FIX (TICKET-012): Specific and actionable error messages
      if (error instanceof Error) {
        const errorMessage = error.message || "";
        const errorCode = (error as any)?.code || "";
        
        // Check for not found errors
        if (errorMessage.includes("nu a fost găsit") || 
            errorCode === "P2025") {
          return res.status(404).json({ 
            error: "Specialistul nu a fost găsit.",
            code: "EMPLOYEE_NOT_FOUND",
            actionable: "Verifică că specialistul există și că aparține business-ului corect.",
          });
        }
      }
      
      return res.status(500).json({ 
        error: "Nu am putut încărca datele specialistului. Te rugăm să încerci din nou.",
        code: "EMPLOYEE_FETCH_FAILED",
        actionable: "Dacă problema persistă, contactează suportul.",
      });
    }
  }
);

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
        error: employeeLimitCheck.error || "Ai atins limita de specialiști pentru planul tău.",
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
          actionable: "Folosește un alt email sau verifică dacă specialistul este deja înregistrat."
        });
      }
      
      // Check for foreign key constraint errors
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("Record to connect not found") ||
          errorCode === "P2025") {
        return res.status(400).json({ 
          error: "Business-ul nu a fost găsit sau nu ai permisiunea de a adăuga specialiști pentru acest business.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l gestiona."
        });
      }
      
      // Check for employee limit
      if (errorMessage.includes("limita") || errorMessage.includes("limit")) {
        return res.status(403).json({ 
          error: errorMessage || "Ai atins limita de specialiști pentru planul tău.",
          code: "EMPLOYEE_LIMIT_REACHED",
          actionable: "Upgrade la un plan superior sau șterge specialiști existenți pentru a adăuga alții."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut adăuga specialistul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_CREATION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Update employee
router.put("/:businessId/employees/:employeeId", verifyJWT, requireBusinessAccess("businessId"), validate(updateEmployeeSchema), async (req, res) => {
  const { businessId, employeeId } = req.params;
  const {
    name,
    email,
    phone,
    specialization,
    canManageOwnServices, // TICKET-044: Business owner controlează dacă employee-ul poate gestiona propriile servicii
  }: {
    name?: string;
    email?: string;
    phone?: string;
    specialization?: string;
    canManageOwnServices?: boolean;
  } = req.body;

  // CRITICAL FIX: Validate employeeId - check if it exists and is valid
  if (!businessId || !employeeId) {
    return res.status(400).json({ error: "businessId și employeeId sunt obligatorii." });
  }

  // Validate employeeId format
  try {
    employeeIdParamSchema.parse({ employeeId });
  } catch (error: any) {
    logger.warn("PUT /employees/:employeeId - Invalid employeeId format", {
      businessId,
      employeeId,
      error: error?.errors || error?.message,
      path: req.path,
    });
    return res.status(400).json({ error: "employeeId invalid." });
  }
  
  // CRITICAL FIX: For UPDATE, name and email are optional
  // User can update only canManageOwnServices or other fields without changing name/email
  // No need to require name and email for updates

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
      return res.status(404).json({ error: "Specialistul nu a fost găsit sau nu aparține acestui business." });
    }

    // CRITICAL FIX: Build update data object only with provided fields
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) {
      // Check if email is being changed and if it already exists
      if (email.trim() !== business.employees[0].email) {
        const existingUser = await prisma.user.findUnique({ where: { email: email.trim() } });
        if (existingUser) {
          return res.status(409).json({ 
            error: "Un utilizator cu acest email există deja în sistem.",
            code: "EMAIL_ALREADY_EXISTS",
            actionable: "Folosește un alt email pentru acest specialist."
          });
        }
      }
      updateData.email = email.trim();
    }
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (specialization !== undefined) updateData.specialization = specialization?.trim() || null;
    if (canManageOwnServices !== undefined) updateData.canManageOwnServices = canManageOwnServices; // TICKET-044: Actualizează flag-ul
    
    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        error: "Nu ai furnizat niciun câmp pentru actualizare.",
        code: "NO_UPDATE_FIELDS",
        actionable: "Furnizează cel puțin un câmp pentru actualizare (name, email, phone, specialization, canManageOwnServices)."
      });
    }
    
    const updatedEmployee = await prisma.user.update({
      where: { id: employeeId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        specialization: true,
        canManageOwnServices: true, // TICKET-044: Returnează flag-ul
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
          error: "Specialistul nu a fost găsit sau nu aparține acestui business.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că specialistul există și că aparține business-ului corect."
        });
      }
      
      // Check for duplicate email
      if (errorMessage.includes("Un utilizator cu acest email există deja") || 
          errorMessage.includes("Unique constraint") ||
          errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Un utilizator cu acest email există deja în sistem.",
          code: "EMAIL_ALREADY_EXISTS",
          actionable: "Folosește un alt email pentru acest specialist."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut actualiza specialistul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_UPDATE_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Delete employee
router.delete("/:businessId/employees/:employeeId", 
  verifyJWT, 
  requireBusinessAccess("businessId"), // CRITICAL FIX: Adăugat requireBusinessAccess pentru securitate
  async (req, res) => {
    const { businessId, employeeId } = req.params;

    // CRITICAL FIX: Validate employeeId - check if it exists and is valid
    if (!businessId || !employeeId) {
      return res.status(400).json({ error: "businessId și employeeId sunt obligatorii." });
    }

    // Validate employeeId format
    try {
      employeeIdParamSchema.parse({ employeeId });
    } catch (error: any) {
      logger.warn("DELETE /employees/:employeeId - Invalid employeeId format", {
        businessId,
        employeeId,
        error: error?.errors || error?.message,
        path: req.path,
      });
      return res.status(400).json({ error: "employeeId invalid." });
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
      return res.status(404).json({ error: "Specialistul nu a fost găsit sau nu aparține acestui business." });
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
          error: "Specialistul nu a fost găsit sau a fost deja șters.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că specialistul există înainte de a-l șterge."
        });
      }
      
      // Check for foreign key constraint errors (employee is referenced)
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("violates foreign key constraint") ||
          errorCode === "P2003") {
        return res.status(409).json({ 
          error: "Nu poți șterge acest specialist deoarece are rezervări asociate.",
          code: "EMPLOYEE_IN_USE",
          actionable: "Anulează sau finalizează toate rezervările pentru acest specialist înainte de a-l șterge."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut șterge specialistul. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_DELETION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

export = router;
