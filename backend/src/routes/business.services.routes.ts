/**
 * Business Services Routes
 * CRITICAL FIX (TICKET-014): Extracted services management routes from business.ts
 * Handles: Create, Update, Delete services + Employee-Service associations
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { requireBusinessAccess } = require("../middleware/requireOwnership");
const { requireEmployeeServiceAccess } = require("../middleware/requireEmployeeServiceAccess");
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
} = require("../validators/businessSchemas");
const { employeeIdParamSchema } = require("../validators/employeeSchemas");
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
  // CRITICAL FIX: businessIdParamSchema expects 'id', but route param is 'businessId'
  // validateParams middleware now handles the mapping, but we still need to extract businessId correctly
  const businessId = (req.params as any).id || req.params.businessId;
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
    
    // CRITICAL FIX: Also invalidate business list cache (business_list_all_*)
    // This ensures that GET /business returns the new service immediately
    const { delByPattern } = require("../services/cacheService");
    await delByPattern("cache:business:business_list_all_*");

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
    
    // CRITICAL FIX: Also invalidate business list cache
    const { delByPattern } = require("../services/cacheService");
    await delByPattern("cache:business:business_list_all_*");

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
    
    // CRITICAL FIX: Also invalidate business list cache
    const { delByPattern } = require("../services/cacheService");
    await delByPattern("cache:business:business_list_all_*");

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
// TICKET-045: Folosește middleware comun pentru autorizare
// Get employee services (for business to manage)
// CRITICAL FIX: GET endpoint allows CLIENT read access to see available services for an employee
// CLIENT needs to see which services an employee can perform when booking
router.get("/:businessId/employees/:employeeId/services", 
  verifyJWT, 
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    const { businessId, employeeId } = req.params;
    
    if (!user) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }
    
    // CRITICAL FIX: Validate employeeId - check if it exists and is valid
    if (!employeeId) {
      logger.warn("GET /employees/:employeeId/services - Missing employeeId", {
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
      logger.warn("GET /employees/:employeeId/services - Invalid employeeId format", {
        businessId,
        employeeId,
        error: error?.errors || error?.message,
        path: req.path,
      });
      return res.status(400).json({ error: "employeeId invalid." });
    }
    
    // CRITICAL FIX: Authorization based on role
    // CLIENT: Verify business access via ClientBusiness link
    // BUSINESS/EMPLOYEE/SUPERADMIN: Use requireEmployeeServiceAccess logic
    if (user.role === "CLIENT") {
      // Get business to check if employeeId is the owner
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, ownerId: true },
      });
      
      if (!business) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
        });
      }
      
      // CRITICAL FIX: Allow business owner to be treated as an employee
      // Check if employeeId is the business owner
      const isOwner = business.ownerId === employeeId;
      
      if (!isOwner) {
        // Verify employee belongs to business (normal employee)
        const employee = await prisma.user.findUnique({
          where: { id: employeeId },
          select: { id: true, businessId: true, role: true },
        });
        
        if (!employee || employee.role !== "EMPLOYEE" || employee.businessId !== businessId) {
          return res.status(404).json({ 
            error: "Specialistul nu a fost găsit sau nu aparține acestui business.",
            code: "EMPLOYEE_NOT_FOUND",
            actionable: "Verifică că specialistul există și că aparține business-ului corect."
          });
        }
      }
      
      // Verify client has access to this business (via ClientBusinessLink)
      const clientBusinessLink = await prisma.clientBusinessLink.findUnique({
        where: {
          clientId_businessId: {
            clientId: user.userId,
            businessId: businessId,
          },
        },
      });
      
      if (!clientBusinessLink) {
        return res.status(403).json({ 
          error: "Nu ai acces la acest business.",
          code: "BUSINESS_ACCESS_DENIED",
          actionable: "Verifică că ești conectat la acest business."
        });
      }
    } else {
      // For BUSINESS/EMPLOYEE/SUPERADMIN, use requireBusinessAccess and requireEmployeeServiceAccess
      // Apply requireBusinessAccess middleware logic
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          ownerId: true,
          status: true,
          employees: {
            select: { id: true },
          },
        },
      });

      if (!business) {
        return res.status(404).json({ error: "Business-ul nu a fost găsit." });
      }

      // Verify business is ACTIVE
      if (business.status !== "ACTIVE") {
        return res.status(403).json({ error: "Business-ul este suspendat. Accesul este restricționat." });
      }

      // Verify access: business owner, employee (with allowSelfService), or SUPERADMIN
      if (user.role !== "SUPERADMIN" && business.ownerId !== user.userId) {
        // Check if employee trying to access own services
        if (user.role === "EMPLOYEE" && employeeId === user.userId) {
          const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: { canManageOwnServices: true },
          });
          if (!employee?.canManageOwnServices) {
            return res.status(403).json({ 
              error: "Nu ai permisiunea de a-ți gestiona propriile servicii.",
              code: "SELF_SERVICE_NOT_ALLOWED",
            });
          }
        } else {
          return res.status(403).json({ 
            error: "Nu ai permisiunea de a gestiona serviciile acestui specialist.",
            code: "EMPLOYEE_SERVICE_ACCESS_DENIED",
          });
        }
      }
    }

    try {
      // Get business first to check if employeeId is the owner
      const business = await prisma.business.findUnique({
        where: { id: businessId },
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
      });

      if (!business) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
        });
      }

      // CRITICAL FIX: Allow business owner to be treated as an employee
      const isOwner = business.ownerId === employeeId;
      
      let employee;
      if (isOwner) {
        // For owner, get user data but use business services
        employee = await prisma.user.findUnique({
          where: { id: employeeId },
          select: {
            id: true,
            role: true,
            businessId: true,
          },
        });
        
        if (!employee) {
          return res.status(404).json({ 
            error: "Specialistul nu a fost găsit.",
            code: "EMPLOYEE_NOT_FOUND",
            actionable: "Verifică că specialistul există."
          });
        }
      } else {
        // For normal employee, get employee with business
        employee = await prisma.user.findUnique({
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

        if (!employee || !employee.business) {
          return res.status(404).json({ 
            error: "Specialistul nu a fost găsit.",
            code: "EMPLOYEE_NOT_FOUND",
            actionable: "Verifică că specialistul există și că aparține business-ului corect."
          });
        }

        // Verify employee belongs to the correct business
        if (employee.businessId !== businessId) {
          return res.status(403).json({ 
            error: "Specialistul nu aparține acestui business.",
            code: "EMPLOYEE_BUSINESS_MISMATCH",
          });
        }
      }

      // Get associated services for this employee (works for both owner and normal employee)
      const employeeServices = await prisma.employeeService.findMany({
        where: { employeeId: employee.id },
        select: { serviceId: true },
      });

      const associatedServiceIds = new Set(employeeServices.map((es: { serviceId: string }) => es.serviceId));

      // CRITICAL FIX: Use business.services for owner, employee.business.services for normal employee
      const businessServices = isOwner ? business.services : (employee.business?.services || []);
      const finalBusinessId = isOwner ? business.id : (employee.business?.id || businessId);

      // Return services with association status
      const services = businessServices.map((service: { id: string; name: string; duration: number; price: number; notes?: string | null }) => ({
        ...service,
        isAssociated: associatedServiceIds.has(service.id),
      }));

      return res.json({
        services,
        employeeId: employee.id,
        businessId: finalBusinessId,
      });
    } catch (error: any) {
      logger.error("Get employee services error:", error);
      
      return res.status(500).json({ 
        error: "Nu am putut încărca serviciile specialistului. Te rugăm să încerci din nou.",
        code: "EMPLOYEE_SERVICES_FETCH_FAILED",
        actionable: "Dacă problema persistă, reîmprospătează pagina sau contactează suportul."
      });
    }
  }
);

// Associate service with employee (for business)
// TICKET-045: Folosește middleware comun pentru autorizare
// TICKET-046: Adaugă audit trail
router.post("/:businessId/employees/:employeeId/services/:serviceId", 
  verifyJWT, 
  requireBusinessAccess("businessId"), // Verifică acces la business
  requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId"), // TICKET-045: Verifică acces la employee services
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { businessId, employeeId, serviceId } = req.params;
    
    // CRITICAL FIX: Validate params - check if they exist and are valid
    if (!serviceId || serviceId === "undefined") {
      logger.warn("POST /employees/:employeeId/services/:serviceId - Missing or invalid serviceId", {
        businessId,
        employeeId,
        serviceId,
        path: req.path,
      });
      return res.status(400).json({ error: "serviceId este obligatoriu." });
    }
    
    // CRITICAL DEBUG: Check if schemas are defined
    if (!serviceIdParamSchema) {
      const businessSchemas = require("../validators/businessSchemas");
      logger.error("POST /employees/:employeeId/services/:serviceId - serviceIdParamSchema is undefined!", {
        businessId,
        employeeId,
        serviceId,
        availableSchemas: Object.keys(businessSchemas),
        serviceIdParamSchemaExists: !!businessSchemas.serviceIdParamSchema,
      });
      return res.status(500).json({ error: "Server configuration error." });
    }
    
    // Validate params format
    try {
      employeeIdParamSchema.parse({ employeeId });
      serviceIdParamSchema.parse({ serviceId: serviceId });
    } catch (error: any) {
      logger.warn("POST /employees/:employeeId/services/:serviceId - Invalid param format", {
        businessId,
        employeeId,
        serviceId,
        error: error?.errors || error?.message,
        errorDetails: error,
        path: req.path,
      });
      // Return more specific error message
      if (error?.errors && Array.isArray(error.errors)) {
        const errorMessages = error.errors.map((e: any) => e.message).join(", ");
        return res.status(400).json({ 
          error: `Parametri invalizi: ${errorMessages}`,
          details: error.errors,
        });
      }
      return res.status(400).json({ error: "Parametri invalizi." });
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

      if (!employee || !employee.business) {
        return res.status(404).json({ 
          error: "Specialistul nu a fost găsit.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că specialistul există și că aparține business-ului corect."
        });
      }

      // CRITICAL FIX: Allow business owner to be treated as an employee
      // Business owner can also perform services and should be manageable like employees
      const isOwner = employee.business.ownerId === employee.id;
      
      // Verify employee belongs to business OR is the owner
      if (!isOwner && employee.businessId !== businessId) {
        return res.status(403).json({ 
          error: "Specialistul nu aparține acestui business.",
          code: "EMPLOYEE_BUSINESS_MISMATCH",
          actionable: "Verifică că specialistul aparține business-ului corect."
        });
      }

      // Verify service exists and belongs to employee's business
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, businessId: true, name: true },
      });

      if (!service) {
        return res.status(404).json({ 
          error: "Serviciul nu a fost găsit.",
          code: "SERVICE_NOT_FOUND",
          actionable: "Verifică că serviciul există."
        });
      }

      // CRITICAL FIX: For owner, use businessId from business object, not employee.businessId
      // Owner doesn't have businessId set, so we use business.id
      const employeeBusinessId = isOwner ? employee.business.id : (employee.businessId || employee.business.id);
      
      if (service.businessId !== employeeBusinessId) {
        return res.status(403).json({ 
          error: "Serviciul nu aparține business-ului specialistului.",
          code: "SERVICE_BUSINESS_MISMATCH",
          actionable: "Verifică că serviciul aparține aceluiași business ca specialistul."
        });
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
        return res.status(409).json({ 
          error: "Serviciul este deja asociat cu acest specialist.",
          code: "SERVICE_ALREADY_ASSOCIATED",
          actionable: "Serviciul este deja asociat. Nu este necesară o acțiune suplimentară."
        });
      }

      // Create association and audit trail in transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // Create association
        const employeeService = await tx.employeeService.create({
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

        // TICKET-046: Create audit trail
        await tx.employeeServiceAudit.create({
          data: {
            employeeId: employee.id,
            serviceId: service.id,
            action: "ASSOCIATE",
            performedBy: authReq.user!.userId,
            performedByRole: authReq.user!.role === "SUPERADMIN" ? "SUPERADMIN" : "BUSINESS",
          },
        });

        return employeeService;
      });

      // TICKET-048: Invalidate cache
      await invalidateBusinessProfile(businessId);
      await invalidateServices(businessId);

      // TICKET-049: Log pentru notificare (va fi implementat în TICKET-049)
      logger.info("Employee service associated", {
        employeeId,
        serviceId,
        serviceName: service.name,
        performedBy: authReq.user!.userId,
        performedByRole: authReq.user!.role,
        businessId,
      });

      return res.status(201).json({ employeeService: result });
    } catch (error: any) {
      logger.error("Associate employee service error:", error);
      
      // CRITICAL FIX (TICKET-012): Specific and actionable error messages
      if (error instanceof Error) {
        const errorMessage = error.message || "";
        const errorCode = (error as any)?.code || "";
        
        if (errorCode === "P2002") {
          return res.status(409).json({ 
            error: "Serviciul este deja asociat cu acest specialist.",
            code: "SERVICE_ALREADY_ASSOCIATED",
            actionable: "Serviciul este deja asociat. Nu este necesară o acțiune suplimentară."
          });
        }
      }
      
      return res.status(500).json({ 
        error: "Nu am putut asocia serviciul cu specialistul. Te rugăm să încerci din nou.",
        code: "SERVICE_ASSOCIATION_FAILED",
        actionable: "Dacă problema persistă, contactează suportul."
      });
    }
  }
);

// Disassociate service from employee (for business)
// TICKET-045: Folosește middleware comun pentru autorizare
// TICKET-046: Adaugă audit trail
router.delete("/:businessId/employees/:employeeId/services/:serviceId", 
  verifyJWT, 
  requireBusinessAccess("businessId"), // Verifică acces la business
  requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId"), // TICKET-045: Verifică acces la employee services
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { businessId, employeeId, serviceId } = req.params;
    
    // CRITICAL FIX: Validate params - check if they exist and are valid
    if (!serviceId || serviceId === "undefined") {
      logger.warn("DELETE /employees/:employeeId/services/:serviceId - Missing or invalid serviceId", {
        businessId,
        employeeId,
        serviceId,
        path: req.path,
      });
      return res.status(400).json({ error: "serviceId este obligatoriu." });
    }
    
    // Validate params format
    try {
      employeeIdParamSchema.parse({ employeeId });
      serviceIdParamSchema.parse({ serviceId: serviceId });
    } catch (error: any) {
      logger.warn("DELETE /employees/:employeeId/services/:serviceId - Invalid param format", {
        businessId,
        employeeId,
        serviceId,
        error: error?.errors || error?.message,
        path: req.path,
      });
      return res.status(400).json({ error: "Parametri invalizi." });
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

      if (!employee || !employee.business) {
        return res.status(404).json({ 
          error: "Specialistul nu a fost găsit.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că specialistul există și că aparține business-ului corect."
        });
      }

      // Get service for audit trail
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, name: true },
      });

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
        return res.status(404).json({ 
          error: "Asocierea nu a fost găsită.",
          code: "ASSOCIATION_NOT_FOUND",
          actionable: "Serviciul nu este asociat cu acest specialist."
        });
      }

      // Delete association and create audit trail in transaction
      await prisma.$transaction(async (tx: any) => {
        // Delete association
        await tx.employeeService.delete({
          where: {
            employeeId_serviceId: {
              employeeId: employee.id,
              serviceId: serviceId,
            },
          },
        });

        // TICKET-046: Create audit trail
        await tx.employeeServiceAudit.create({
          data: {
            employeeId: employee.id,
            serviceId: serviceId,
            action: "DISASSOCIATE",
            performedBy: authReq.user!.userId,
            performedByRole: authReq.user!.role === "SUPERADMIN" ? "SUPERADMIN" : "BUSINESS",
          },
        });
      });

      // TICKET-048: Invalidate cache
      await invalidateBusinessProfile(businessId);
      await invalidateServices(businessId);

      // TICKET-049: Log pentru notificare (va fi implementat în TICKET-049)
      logger.info("Employee service disassociated", {
        employeeId,
        serviceId,
        serviceName: service?.name,
        performedBy: authReq.user!.userId,
        performedByRole: authReq.user!.role,
        businessId,
      });

      return res.json({ ok: true });
    } catch (error: any) {
      logger.error("Disassociate employee service error:", error);
      
      // CRITICAL FIX (TICKET-012): Specific and actionable error messages
      if (error instanceof Error) {
        const errorCode = (error as any)?.code || "";
        
        if (errorCode === "P2025") {
          return res.status(404).json({ 
            error: "Asocierea nu a fost găsită sau a fost deja ștearsă.",
            code: "ASSOCIATION_NOT_FOUND",
            actionable: "Serviciul nu este asociat cu acest specialist."
          });
        }
      }
      
      return res.status(500).json({ 
        error: "Nu am putut dezasocia serviciul de la specialist. Te rugăm să încerci din nou.",
        code: "SERVICE_DISASSOCIATION_FAILED",
        actionable: "Dacă problema persistă, contactează suportul."
      });
    }
  }
);

// TICKET-046: Get audit trail for employee services
router.get("/:businessId/employees/:employeeId/services/audit", 
  verifyJWT, 
  requireBusinessAccess("businessId"), // Verifică acces la business
  requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId"), // TICKET-045: Verifică acces la employee services
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { businessId, employeeId } = req.params;
    
    // Validate employeeId
    try {
      employeeIdParamSchema.parse({ employeeId });
    } catch (error) {
      return res.status(400).json({ error: "employeeId invalid." });
    }

    try {
      // Get audit trail for this employee
      const audits = await prisma.employeeServiceAudit.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
        take: 100, // Limit to last 100 entries
        include: {
          service: {
            select: {
              id: true,
              name: true,
            },
          },
          performer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return res.json({
        audits: audits.map((audit: any) => ({
          id: audit.id,
          action: audit.action,
          serviceId: audit.serviceId,
          serviceName: audit.service.name,
          performedBy: audit.performedBy,
          performerName: audit.performer.name,
          performerEmail: audit.performer.email,
          performedByRole: audit.performedByRole,
          createdAt: audit.createdAt,
        })),
        employeeId,
        businessId,
      });
    } catch (error: any) {
      logger.error("Get employee service audit error:", error);
      
      return res.status(500).json({ 
        error: "Nu am putut încărca istoricul modificărilor. Te rugăm să încerci din nou.",
        code: "AUDIT_FETCH_FAILED",
        actionable: "Dacă problema persistă, contactează suportul."
      });
    }
  }
);

export = router;
