/**
 * Business Services Routes
 * CRITICAL FIX (TICKET-014): Extracted services management routes from business.ts
 * Handles: Create, Update, Delete services + Employee-Service associations
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { requireBusinessAccess } = require("../middleware/requireOwnership");
const { 
  invalidateBusinessProfile,
  invalidateServices,
  getServices,
  setServices,
  TTL,
} = require("../services/cacheService");
const { logger } = require("../lib/logger");
const { validate, validateParams, validateQuery } = require("../middleware/validate");
const { paginationQuerySchema, getPaginationParams, buildPaginationResponse } = require("../validators/paginationSchemas");
const { 
  createServiceSchema, 
  updateServiceSchema, 
  businessIdParamSchema,
  serviceIdParamSchema,
  employeeIdParamSchema 
} = require("../validators/businessSchemas");
import type { AuthenticatedRequest } from "./business.shared.d";

const router = express.Router();

// CRITICAL FIX (TICKET-009, TICKET-010): Get services list with caching and pagination
router.get("/:businessId/services", verifyJWT, requireBusinessAccess("businessId"), validateQuery(paginationQuerySchema), async (req, res) => {
  const { businessId } = req.params;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Parse pagination parameters
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50; // Default 50 items
    const { skip, take } = getPaginationParams(page, limit);

    // Check cache first (cache key includes pagination params)
    const cacheKey = `${businessId}_page_${page}_limit_${limit}`;
    const cached = await getServices(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get total count for pagination
    const total = await prisma.service.count({
      where: { businessId },
    });

    // Fetch services from database
    const services = await prisma.service.findMany({
      where: { businessId },
      skip,
      take,
      orderBy: { name: "asc" },
    });

    // Build paginated response
    const response = buildPaginationResponse(services, total, page, limit);

    // Cache the result (shorter TTL for paginated results)
    await setServices(cacheKey, response, 180); // 3 minutes

    return res.json(response);
  } catch (error: any) {
    logger.error("Failed to get services", error);
    
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
      error: "Nu am putut încărca lista de servicii. Te rugăm să încerci din nou.",
      code: "SERVICES_FETCH_FAILED",
      actionable: "Dacă problema persistă, reîmprospătează pagina sau contactează suportul."
    });
  }
});

// Create service
router.post("/:businessId/services", verifyJWT, validateParams(businessIdParamSchema), validate(createServiceSchema), async (req, res) => {
  const { businessId } = businessIdParamSchema.parse({ businessId: req.params.businessId });
  const { name, duration, price, description, notes } = createServiceSchema.parse(req.body);

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

    // CRITICAL FIX (TICKET-009): Invalidate cache when service is created
    await invalidateServices(businessId);
    await invalidateBusinessProfile(businessId);

    return res.status(201).json(service);
  } catch (error: any) {
    logger.error("Service creation failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for foreign key constraint errors
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("Record to connect not found") ||
          errorCode === "P2025") {
        return res.status(400).json({ 
          error: "Business-ul nu a fost găsit sau nu ai permisiunea de a adăuga servicii pentru acest business.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l gestiona."
        });
      }
      
      // Check for unique constraint errors
      if (errorMessage.includes("Unique constraint") || 
          errorMessage.includes("duplicate key") ||
          errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Un serviciu cu acest nume există deja pentru acest business.",
          code: "SERVICE_DUPLICATE",
          actionable: "Folosește un nume diferit pentru serviciu."
        });
      }
      
      // Check for validation errors
      if (errorMessage.includes("Invalid") || errorMessage.includes("required")) {
        return res.status(400).json({ 
          error: "Date invalide pentru serviciu.",
          code: "INVALID_SERVICE_DATA",
          actionable: "Verifică că ai completat toate câmpurile obligatorii (nume, durată, preț) cu valori valide."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut adăuga serviciul. Te rugăm să încerci din nou.",
      code: "SERVICE_CREATION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Update service
router.put("/:businessId/services/:serviceId", verifyJWT, validate(updateServiceSchema), async (req, res) => {
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

    // CRITICAL FIX (TICKET-009): Invalidate cache when service is updated
    await invalidateServices(businessId);
    await invalidateBusinessProfile(businessId);

    return res.json(service);
  } catch (error: any) {
    logger.error("Service update failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for not found errors
      if (errorMessage.includes("Record to update not found") || errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Serviciul nu a fost găsit sau nu aparține acestui business.",
          code: "SERVICE_NOT_FOUND",
          actionable: "Verifică că serviciul există și că aparține business-ului corect."
        });
      }
      
      // Check for validation errors
      if (errorMessage.includes("Invalid") || errorMessage.includes("required")) {
        return res.status(400).json({ 
          error: "Date invalide pentru actualizare serviciu.",
          code: "INVALID_SERVICE_DATA",
          actionable: "Verifică că toate câmpurile (nume, durată, preț) au valori valide."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut actualiza serviciul. Te rugăm să încerci din nou.",
      code: "SERVICE_UPDATE_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Delete service
router.delete("/:businessId/services/:serviceId", verifyJWT, async (req, res) => {
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

    // CRITICAL FIX (TICKET-009): Invalidate cache when service is deleted
    await invalidateServices(businessId);
    await invalidateBusinessProfile(businessId);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error("Service deletion failed", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      const errorCode = (error as any)?.code || "";
      
      // Check for not found errors
      if (errorMessage.includes("Record to delete does not exist") || errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Serviciul nu a fost găsit sau a fost deja șters.",
          code: "SERVICE_NOT_FOUND",
          actionable: "Verifică că serviciul există înainte de a-l șterge."
        });
      }
      
      // Check for foreign key constraint errors (service is referenced)
      if (errorMessage.includes("Foreign key constraint") || 
          errorMessage.includes("violates foreign key constraint") ||
          errorCode === "P2003") {
        return res.status(409).json({ 
          error: "Nu poți șterge acest serviciu deoarece este folosit în rezervări existente.",
          code: "SERVICE_IN_USE",
          actionable: "Anulează sau finalizează toate rezervările pentru acest serviciu înainte de a-l șterge."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut șterge serviciul. Te rugăm să încerci din nou.",
      code: "SERVICE_DELETION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Employee Services Routes - Must be defined BEFORE employee CRUD routes to avoid routing conflicts
// Get employee services (for business to manage)
router.get("/:businessId/employees/:employeeId/services", verifyJWT, requireBusinessAccess("businessId"), async (req, res) => {
  logger.info("✅✅✅ GET /:businessId/employees/:employeeId/services ROUTE HANDLER EXECUTED ✅✅✅", {
    businessId: req.params.businessId,
    employeeId: req.params.employeeId,
    path: req.path,
    originalUrl: req.originalUrl,
    method: req.method,
    url: req.url,
    baseUrl: req.baseUrl,
    route: req.route?.path,
  });
  
  const authReq = req as AuthenticatedRequest;
  const { businessId, employeeId } = req.params;
  
  // Validate employeeId
  try {
    employeeIdParamSchema.parse({ employeeId });
  } catch (error) {
    return res.status(400).json({ error: "employeeId invalid." });
  }

  if (!authReq.user?.userId) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    // Get employee with business
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        role: true,
        businessId: true,
        business: {
          select: {
            id: true,
            ownerId: true,
            services: {
              select: {
                id: true,
                name: true,
                duration: true,
                price: true,
                notes: true,
              },
            },
          },
        },
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ error: "Employee-ul nu are un business asociat." });
    }

    // Verify business ownership or SUPERADMIN
    if (authReq.user.role !== "SUPERADMIN" && employee.business.ownerId !== authReq.user.userId) {
      return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
    }

    // Get associated services for this employee
    const employeeServices = await prisma.employeeService.findMany({
      where: { employeeId: employee.id },
      select: { serviceId: true },
    });

    const associatedServiceIds = new Set(employeeServices.map((es: { serviceId: string }) => es.serviceId));

    // Return services with association status
    const services = employee.business.services.map((service: { id: string; name: string; duration: number; price: number; notes?: string | null }) => ({
      ...service,
      isAssociated: associatedServiceIds.has(service.id),
    }));

    return res.json({
      services,
      employeeId: employee.id,
      businessId: employee.business.id,
    });
  } catch (error: any) {
    logger.error("Get employee services error:", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorMessage = error.message || "";
      
      // Check for employee not found
      if (errorMessage.includes("Employee-ul nu a fost găsit") || 
          errorMessage.includes("not found")) {
        return res.status(404).json({ 
          error: "Angajatul nu a fost găsit sau nu aparține acestui business.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că angajatul există și că aparține business-ului corect."
        });
      }
      
      // Check for business not found
      if (errorMessage.includes("Business") || errorMessage.includes("business")) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
          actionable: "Verifică că business-ul există și că ai permisiunea de a-l accesa."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut încărca serviciile angajatului. Te rugăm să încerci din nou.",
      code: "EMPLOYEE_SERVICES_FETCH_FAILED",
      actionable: "Dacă problema persistă, reîmprospătează pagina sau contactează suportul."
    });
  }
});

// Associate service with employee (for business)
router.post("/:businessId/employees/:employeeId/services/:serviceId", verifyJWT, requireBusinessAccess("businessId"), async (req, res) => {
  logger.info("POST /:businessId/employees/:employeeId/services/:serviceId called", {
    businessId: req.params.businessId,
    employeeId: req.params.employeeId,
    serviceId: req.params.serviceId,
    path: req.path,
    originalUrl: req.originalUrl,
  });
  
  const authReq = req as AuthenticatedRequest;
  const { businessId, employeeId, serviceId } = req.params;
  
  // Validate params
  try {
    employeeIdParamSchema.parse({ employeeId });
    serviceIdParamSchema.parse({ serviceId: serviceId });
  } catch (error) {
    return res.status(400).json({ error: "Parametri invalizi." });
  }

  if (!authReq.user?.userId) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    // Get employee with business
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        role: true,
        businessId: true,
        business: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ error: "Employee-ul nu are un business asociat." });
    }

    // Verify business ownership or SUPERADMIN
    if (authReq.user.role !== "SUPERADMIN" && employee.business.ownerId !== authReq.user.userId) {
      return res.status(403).json({ error: "Nu ai permisiunea de a gestiona acest employee." });
    }

    // Verify service exists and belongs to employee's business
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, businessId: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Serviciul nu a fost găsit." });
    }

    if (service.businessId !== employee.businessId) {
      return res.status(403).json({ error: "Serviciul nu aparține business-ului employee-ului." });
    }

    // Check if association already exists
    const existingAssociation = await prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: {
          employeeId: employee.id,
          serviceId: service.id,
        },
      },
    });

    if (existingAssociation) {
      return res.status(409).json({ error: "Serviciul este deja asociat cu acest employee." });
    }

    // Create association
    const employeeService = await prisma.employeeService.create({
      data: {
        employeeId: employee.id,
        serviceId: service.id,
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            notes: true,
          },
        },
      },
    });

    return res.status(201).json({ employeeService });
  } catch (error) {
    logger.error("Associate employee service error:", error);
    return res.status(500).json({ error: "Eroare la asocierea serviciului cu employee-ul." });
  }
});

// Disassociate service from employee (for business)
router.delete("/:businessId/employees/:employeeId/services/:serviceId", verifyJWT, requireBusinessAccess("businessId"), async (req, res) => {
  logger.info("DELETE /:businessId/employees/:employeeId/services/:serviceId called", {
    businessId: req.params.businessId,
    employeeId: req.params.employeeId,
    serviceId: req.params.serviceId,
    path: req.path,
    originalUrl: req.originalUrl,
  });
  
  const authReq = req as AuthenticatedRequest;
  const { businessId, employeeId, serviceId } = req.params;
  
  // Validate params
  try {
    employeeIdParamSchema.parse({ employeeId });
    serviceIdParamSchema.parse({ serviceId: serviceId });
  } catch (error) {
    return res.status(400).json({ error: "Parametri invalizi." });
  }

  if (!authReq.user?.userId) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    // Get employee with business
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        role: true,
        businessId: true,
        business: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ error: "Employee-ul nu are un business asociat." });
    }

    // Verify business ownership or SUPERADMIN
    if (authReq.user.role !== "SUPERADMIN" && employee.business.ownerId !== authReq.user.userId) {
      return res.status(403).json({ error: "Nu ai permisiunea de a gestiona acest employee." });
    }

    // Verify association exists
    const employeeService = await prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: {
          employeeId: employee.id,
          serviceId: serviceId,
        },
      },
    });

    if (!employeeService) {
      return res.status(404).json({ error: "Asocierea nu a fost găsită." });
    }

    // Delete association
    await prisma.employeeService.delete({
      where: {
        employeeId_serviceId: {
          employeeId: employee.id,
          serviceId: serviceId,
        },
      },
    });

    return res.json({ ok: true });
  } catch (error) {
    logger.error("Disassociate employee service error:", error);
    return res.status(500).json({ error: "Eroare la dezasocierea serviciului de la employee." });
  }
});

export = router;
