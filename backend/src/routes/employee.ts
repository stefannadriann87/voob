import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { requireEmployeeServiceAccess } = require("../middleware/requireEmployeeServiceAccess");
const { invalidateBusinessProfile, invalidateServices } = require("../services/cacheService");
const { employeeIdParamSchema, workingHoursSchema, createHolidaySchema, holidayIdParamSchema, updateEmployeeServiceSchema } = require("../validators/employeeSchemas");
const { logger } = require("../lib/logger");

const router = express.Router();

// Get employee working hours
// CRITICAL FIX: Allow business owner to access their own working hours as a specialist
router.get("/:employeeId/working-hours", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Only the user themselves can access their working hours
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { 
        workingHours: true, 
        role: true,
        ownedBusinesses: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Utilizatorul nu a fost găsit." });
    }

    // CRITICAL FIX: Allow EMPLOYEE role OR BUSINESS role (if owner wants to be a specialist)
    // Business owner can also manage their own working hours as a specialist
    if (user.role !== "EMPLOYEE" && user.role !== "BUSINESS") {
      return res.status(403).json({ error: "Utilizatorul nu este un specialist sau business owner." });
    }

    // If BUSINESS role, verify they own at least one business (they can be a specialist)
    if (user.role === "BUSINESS" && (!user.ownedBusinesses || user.ownedBusinesses.length === 0)) {
      return res.status(403).json({ error: "Business owner-ul trebuie să aibă cel puțin un business pentru a gestiona working hours." });
    }

    return res.json({ workingHours: user.workingHours });
  } catch (error) {
    logger.error("Get employee working hours error:", error);
    return res.status(500).json({ error: "Eroare la obținerea programului de lucru." });
  }
});

// Update employee working hours
router.put("/:employeeId/working-hours", verifyJWT, validate(workingHoursSchema), async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });
  const { workingHours } = workingHoursSchema.parse(req.body);

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Only the user themselves can update their working hours
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a actualiza aceste date." });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { 
        role: true,
        ownedBusinesses: {
          select: { id: true },
        },
      },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "Utilizatorul nu a fost găsit." });
    }

    // CRITICAL FIX: Allow EMPLOYEE role OR BUSINESS role (if owner wants to be a specialist)
    // Business owner can also manage their own working hours as a specialist
    if (existingUser.role !== "EMPLOYEE" && existingUser.role !== "BUSINESS") {
      return res.status(403).json({ error: "Utilizatorul nu este un specialist sau business owner." });
    }

    // If BUSINESS role, verify they own at least one business (they can be a specialist)
    if (existingUser.role === "BUSINESS" && (!existingUser.ownedBusinesses || existingUser.ownedBusinesses.length === 0)) {
      return res.status(403).json({ error: "Business owner-ul trebuie să aibă cel puțin un business pentru a gestiona working hours." });
    }

    const updatedUser = await prisma.user.update({
      where: { id: employeeId },
      data: {
        workingHours: workingHours || null,
      },
      select: { workingHours: true },
    });

    return res.json({ workingHours: updatedUser.workingHours });
  } catch (error) {
    logger.error("Update employee working hours error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea programului de lucru." });
  }
});

// Get employee holidays
router.get("/:employeeId/holidays", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar specialiștii pot accesa perioadele de concediu." });
  }

  // Only the employee themselves can access their holidays
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
  }

  try {
    // Verify employee exists
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { role: true },
    });

    if (!user || user.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    const holidays = await prisma.employeeHoliday.findMany({
      where: { employeeId },
      orderBy: { startDate: "asc" },
    });

    return res.json({ holidays });
  } catch (error) {
    logger.error("Get employee holidays error:", error);
    return res.status(500).json({ error: "Eroare la obținerea perioadelor de concediu." });
  }
});

// Create employee holiday
router.post("/:employeeId/holidays", verifyJWT, validate(createHolidaySchema), async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });
  const { startDate, endDate, reason } = createHolidaySchema.parse(req.body);

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar specialiștii pot crea perioade de concediu." });
  }

  // Only the employee themselves can create holidays
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a crea perioade de concediu." });
  }

  try {
    // Verify employee exists
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { role: true },
    });

    if (!user || user.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    const holiday = await prisma.employeeHoliday.create({
      data: {
        employeeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason?.trim() || null,
      },
    });

    return res.status(201).json({ holiday });
  } catch (error) {
    logger.error("Create employee holiday error:", error);
    return res.status(500).json({ error: "Eroare la crearea perioadei de concediu." });
  }
});

// Delete employee holiday
router.delete("/:employeeId/holidays/:holidayId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });
  const { holidayId } = holidayIdParamSchema.parse({ holidayId: req.params.holidayId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar specialiștii pot șterge perioade de concediu." });
  }

  // Only the employee themselves can delete holidays
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a șterge perioade de concediu." });
  }

  try {
    // Verify employee exists
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { role: true },
    });

    if (!user || user.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    // Verify holiday exists and belongs to employee
    const holiday = await prisma.employeeHoliday.findUnique({
      where: { id: holidayId },
      select: { employeeId: true },
    });

    if (!holiday) {
      return res.status(404).json({ error: "Perioada de concediu nu a fost găsită." });
    }

    if (holiday.employeeId !== employeeId) {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge această perioadă de concediu." });
    }

    await prisma.employeeHoliday.delete({
      where: { id: holidayId },
    });

    return res.json({ ok: true });
  } catch (error) {
    logger.error("Delete employee holiday error:", error);
    return res.status(500).json({ error: "Eroare la ștergerea perioadei de concediu." });
  }
});

// Get employee services (available and associated)
// TICKET-044: Verifică canManageOwnServices
// TICKET-045: Folosește middleware comun (dar trebuie să simulăm employeeId din user)
router.get("/services", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar specialiștii pot accesa serviciile.",
      code: "INVALID_ROLE",
      actionable: "Doar utilizatorii cu rolul de EMPLOYEE pot accesa acest endpoint."
    });
  }

  try {
    // Get employee with business and canManageOwnServices flag
    const employee = await prisma.user.findUnique({
      where: { id: authReq.user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
        canManageOwnServices: true, // TICKET-044: Verifică permisiunea
        business: {
          select: {
            id: true,
            name: true,
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
      return res.status(404).json({ 
        error: "Specialistul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ 
        error: "Specialistul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că specialistul este asociat cu un business."
      });
    }

    // TICKET-044: Verifică canManageOwnServices (doar pentru informare, nu blochează GET)
    // GET este permis pentru a vedea serviciile, dar POST/DELETE vor verifica permisiunea

    // Get associated services for this employee with overrides
    // CRITICAL FIX: Handle case where columns might not exist yet (backward compatibility)
    let employeeServices;
    try {
      employeeServices = await prisma.employeeService.findMany({
        where: { employeeId: employee.id },
        select: { 
          serviceId: true,
          price: true,      // Override price
          duration: true,  // Override duration
          notes: true,     // Override notes
        },
      });
    } catch (error: any) {
      // If columns don't exist yet, fallback to old query
      // Prisma throws P2021 for unknown column, or we might get a raw SQL error
      const errorMessage = error?.message || "";
      const errorCode = error?.code || "";
      const isColumnError = 
        errorMessage.includes("Unknown column") || 
        errorMessage.includes("column") && errorMessage.includes("does not exist") ||
        errorCode === "P2021" ||
        errorMessage.includes("P2021");
      
      if (isColumnError) {
        logger.warn("EmployeeService override columns not found, using fallback query", { 
          employeeId: employee.id,
          error: errorMessage,
          code: errorCode
        });
        employeeServices = await prisma.employeeService.findMany({
          where: { employeeId: employee.id },
          select: { 
            serviceId: true,
          },
        });
        // Add null overrides for backward compatibility
        employeeServices = employeeServices.map((es: { serviceId: string }) => ({
          ...es,
          price: null,
          duration: null,
          notes: null,
        }));
      } else {
        // Log the actual error for debugging
        logger.error("Get employee services error (not a column error):", { 
          error: errorMessage,
          code: errorCode,
          stack: error?.stack
        });
        throw error;
      }
    }

    // Create a map of serviceId -> override data
    type OverrideData = { price?: number | null; duration?: number | null; notes?: string | null };
    const overrideMap = new Map<string, OverrideData>(
      employeeServices.map((es: { serviceId: string; price?: number | null; duration?: number | null; notes?: string | null }) => [
        es.serviceId,
        { price: es.price, duration: es.duration, notes: es.notes }
      ])
    );

    const associatedServiceIds = new Set(employeeServices.map((es: { serviceId: string }) => es.serviceId));

    // Return services with association status and overrides applied
    const services = employee.business.services.map((service: { id: string; name: string; duration: number; price: number; notes?: string | null }) => {
      const override: OverrideData | undefined = overrideMap.get(service.id);
      return {
        ...service,
        // Apply overrides if they exist, otherwise use service defaults
        price: override && override.price !== null && override.price !== undefined ? override.price : service.price,
        duration: override && override.duration !== null && override.duration !== undefined ? override.duration : service.duration,
        notes: override && override.notes !== null && override.notes !== undefined ? override.notes : service.notes,
        isAssociated: associatedServiceIds.has(service.id),
        hasOverrides: override ? (override.price !== null || override.duration !== null || override.notes !== null) : false,
      };
    });

    return res.json({
      services,
      businessId: employee.business.id,
      businessName: employee.business.name,
      canManageOwnServices: employee.canManageOwnServices, // TICKET-044: Returnează flag-ul pentru frontend
    });
  } catch (error: any) {
    logger.error("Get employee services error:", {
      error: error?.message || error,
      code: error?.code,
      stack: error?.stack,
      employeeId: authReq.user?.userId
    });
    
    // If it's a column error that wasn't caught earlier, try fallback
    const errorMessage = error?.message || "";
    const errorCode = error?.code || "";
    const isColumnError = 
      errorMessage.includes("Unknown column") || 
      (errorMessage.includes("column") && errorMessage.includes("does not exist")) ||
      errorCode === "P2021" ||
      errorMessage.includes("P2021");
    
    if (isColumnError) {
      logger.warn("Retrying with fallback query after catch block");
      try {
        // Fallback: return services without overrides
        const employee = await prisma.user.findUnique({
          where: { id: authReq.user.userId },
          select: {
            id: true,
            businessId: true,
            business: {
              select: {
                id: true,
                name: true,
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
            error: "Specialistul nu are un business asociat.",
            code: "EMPLOYEE_NO_BUSINESS",
          });
        }

        const employeeServices = await prisma.employeeService.findMany({
          where: { employeeId: employee.id },
          select: { serviceId: true },
        });

        const associatedServiceIds = new Set(employeeServices.map((es: { serviceId: string }) => es.serviceId));

        const services = employee.business.services.map((service: { id: string; name: string; duration: number; price: number; notes?: string | null }) => ({
          ...service,
          isAssociated: associatedServiceIds.has(service.id),
          hasOverrides: false,
        }));

        return res.json({
          services,
          businessId: employee.business.id,
          businessName: employee.business.name,
          canManageOwnServices: false,
        });
      } catch (fallbackError: any) {
        logger.error("Fallback query also failed:", fallbackError);
        return res.status(500).json({ 
          error: "Eroare la obținerea serviciilor.",
          code: "EMPLOYEE_SERVICES_FETCH_FAILED",
          actionable: "Te rugăm să încerci din nou sau să contactezi suportul."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Eroare la obținerea serviciilor.",
      code: "EMPLOYEE_SERVICES_FETCH_FAILED",
      actionable: "Te rugăm să încerci din nou sau să contactezi suportul."
    });
  }
});

// Associate service with employee
// TICKET-044: Verifică canManageOwnServices
// TICKET-046: Adaugă audit trail
// TICKET-048: Adaugă cache invalidation
router.post("/services/:serviceId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { serviceId } = req.params;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // CRITICAL FIX: Store user in a const so TypeScript knows it's defined
  const user = authReq.user;

  // Verify role is EMPLOYEE
  if (user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar specialiștii pot asocia servicii.",
      code: "INVALID_ROLE",
      actionable: "Doar utilizatorii cu rolul de EMPLOYEE pot accesa acest endpoint."
    });
  }

  try {
    // Get employee with business and canManageOwnServices flag
    const employee = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
        canManageOwnServices: true, // TICKET-044: Verifică permisiunea
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ 
        error: "Specialistul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId) {
      return res.status(404).json({ 
        error: "Specialistul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că specialistul este asociat cu un business."
      });
    }

    // TICKET-044: Verifică canManageOwnServices
    if (!employee.canManageOwnServices) {
      return res.status(403).json({ 
        error: "Nu ai permisiunea de a-ți gestiona propriile servicii. Contactează business owner-ul.",
        code: "SELF_SERVICE_NOT_ALLOWED",
        actionable: "Contactează business owner-ul pentru a obține permisiunea."
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

    if (service.businessId !== employee.businessId) {
      return res.status(403).json({ 
        error: "Serviciul nu aparține business-ului tău.",
        code: "SERVICE_BUSINESS_MISMATCH",
        actionable: "Verifică că serviciul aparține aceluiași business ca tine."
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
        error: "Serviciul este deja asociat.",
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
          performedBy: user.userId,
          performedByRole: "EMPLOYEE",
        },
      });

      return employeeService;
    });

    // TICKET-048: Invalidate cache
    await invalidateBusinessProfile(employee.businessId);
    await invalidateServices(employee.businessId);

    // TICKET-049: Log pentru notificare (va fi implementat în TICKET-049)
    logger.info("Employee service associated (self-service)", {
      employeeId: employee.id,
      serviceId,
      serviceName: service.name,
      performedBy: user.userId,
      performedByRole: "EMPLOYEE",
      businessId: employee.businessId,
    });

    return res.status(201).json({ employeeService: result });
  } catch (error: any) {
    logger.error("Associate employee service error:", error);
    
    // CRITICAL FIX (TICKET-012): Specific and actionable error messages
    if (error instanceof Error) {
      const errorCode = (error as any)?.code || "";
      
      if (errorCode === "P2002") {
        return res.status(409).json({ 
          error: "Serviciul este deja asociat.",
          code: "SERVICE_ALREADY_ASSOCIATED",
          actionable: "Serviciul este deja asociat. Nu este necesară o acțiune suplimentară."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut asocia serviciul. Te rugăm să încerci din nou.",
      code: "SERVICE_ASSOCIATION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Disassociate service from employee
// TICKET-044: Verifică canManageOwnServices
// TICKET-046: Adaugă audit trail
// TICKET-048: Adaugă cache invalidation
router.delete("/services/:serviceId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { serviceId } = req.params;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // CRITICAL FIX: Store user in a const so TypeScript knows it's defined
  const user = authReq.user;

  // Verify role is EMPLOYEE
  if (user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar specialiștii pot dezasocia servicii.",
      code: "INVALID_ROLE",
      actionable: "Doar utilizatorii cu rolul de EMPLOYEE pot accesa acest endpoint."
    });
  }

  try {
    // Get employee with canManageOwnServices flag
    const employee = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
        canManageOwnServices: true, // TICKET-044: Verifică permisiunea
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ 
        error: "Specialistul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId) {
      return res.status(404).json({ 
        error: "Specialistul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că specialistul este asociat cu un business."
      });
    }

    // TICKET-044: Verifică canManageOwnServices
    if (!employee.canManageOwnServices) {
      return res.status(403).json({ 
        error: "Nu ai permisiunea de a-ți gestiona propriile servicii. Contactează business owner-ul.",
        code: "SELF_SERVICE_NOT_ALLOWED",
        actionable: "Contactează business owner-ul pentru a obține permisiunea."
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
        actionable: "Serviciul nu este asociat cu tine."
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
          performedBy: user.userId,
          performedByRole: "EMPLOYEE",
        },
      });
    });

    // TICKET-048: Invalidate cache
    await invalidateBusinessProfile(employee.businessId);
    await invalidateServices(employee.businessId);

    // TICKET-049: Log pentru notificare (va fi implementat în TICKET-049)
    logger.info("Employee service disassociated (self-service)", {
      employeeId: employee.id,
      serviceId,
      serviceName: service?.name,
      performedBy: user.userId,
      performedByRole: "EMPLOYEE",
      businessId: employee.businessId,
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
          actionable: "Serviciul nu este asociat cu tine."
        });
      }
    }
    
    return res.status(500).json({ 
      error: "Nu am putut dezasocia serviciul. Te rugăm să încerci din nou.",
      code: "SERVICE_DISASSOCIATION_FAILED",
      actionable: "Dacă problema persistă, contactează suportul."
    });
  }
});

// Update employee service overrides (price, duration, notes)
// TICKET-044: Verifică canManageOwnServices
router.put("/services/:serviceId", verifyJWT, validate(updateEmployeeServiceSchema), async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { serviceId } = req.params;
  const { price, duration, notes } = updateEmployeeServiceSchema.parse(req.body);

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  const user = authReq.user;

  // Verify role is EMPLOYEE
  if (user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar specialiștii pot edita serviciile.",
      code: "INVALID_ROLE",
      actionable: "Doar utilizatorii cu rolul de EMPLOYEE pot accesa acest endpoint."
    });
  }

  try {
    // Get employee with business and canManageOwnServices flag
    const employee = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
        canManageOwnServices: true,
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ 
        error: "Specialistul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId) {
      return res.status(404).json({ 
        error: "Specialistul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că specialistul este asociat cu un business."
      });
    }

    // TICKET-044: Verifică canManageOwnServices
    if (!employee.canManageOwnServices) {
      return res.status(403).json({ 
        error: "Nu ai permisiunea de a-ți gestiona propriile servicii. Contactează business owner-ul.",
        code: "SELF_SERVICE_NOT_ALLOWED",
        actionable: "Contactează business owner-ul pentru a obține permisiunea."
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

    if (service.businessId !== employee.businessId) {
      return res.status(403).json({ 
        error: "Serviciul nu aparține business-ului tău.",
        code: "SERVICE_BUSINESS_MISMATCH",
        actionable: "Verifică că serviciul aparține aceluiași business ca tine."
      });
    }

    // Verify employee has this service associated
    const existingAssociation = await prisma.employeeService.findUnique({
      where: {
        employeeId_serviceId: {
          employeeId: employee.id,
          serviceId: service.id,
        },
      },
    });

    if (!existingAssociation) {
      return res.status(404).json({ 
        error: "Serviciul nu este asociat cu tine. Asociază-l mai întâi.",
        code: "SERVICE_NOT_ASSOCIATED",
        actionable: "Asociază serviciul înainte de a-l edita."
      });
    }

    // Validate inputs
    if (price !== undefined && (price < 0 || !Number.isFinite(price))) {
      return res.status(400).json({ 
        error: "Prețul trebuie să fie un număr pozitiv.",
        code: "INVALID_PRICE",
        actionable: "Introdu un preț valid (număr pozitiv)."
      });
    }

    if (duration !== undefined && (duration <= 0 || !Number.isInteger(duration) || duration % 30 !== 0)) {
      return res.status(400).json({ 
        error: "Durata trebuie să fie un număr întreg pozitiv, multiplu de 30 minute.",
        code: "INVALID_DURATION",
        actionable: "Introdu o durată validă (30, 60, 90, 120, etc. minute)."
      });
    }

    if (notes !== undefined && notes !== null && notes.length > 2000) {
      return res.status(400).json({ 
        error: "Notele nu pot depăși 2000 caractere.",
        code: "INVALID_NOTES",
        actionable: "Scurtează notele la maximum 2000 caractere."
      });
    }

    // Update or create employee service with overrides
    const updateData: { price?: number | null; duration?: number | null; notes?: string | null } = {};
    if (price !== undefined) updateData.price = price;
    if (duration !== undefined) updateData.duration = duration;
    if (notes !== undefined) updateData.notes = notes || null;

    // If all overrides are being cleared (set to null), remove them
    const result = await prisma.employeeService.update({
      where: {
        employeeId_serviceId: {
          employeeId: employee.id,
          serviceId: service.id,
        },
      },
      data: updateData,
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

    // TICKET-048: Invalidate cache
    await invalidateBusinessProfile(employee.businessId);
    await invalidateServices(employee.businessId);

    logger.info("Employee service updated (self-service)", {
      employeeId: employee.id,
      serviceId,
      serviceName: service.name,
      overrides: updateData,
      performedBy: user.userId,
      performedByRole: "EMPLOYEE",
      businessId: employee.businessId,
    });

    return res.json({
      employeeService: {
        id: result.id,
        serviceId: result.serviceId,
        price: result.price ?? result.service.price,
        duration: result.duration ?? result.service.duration,
        notes: result.notes ?? result.service.notes,
        hasOverrides: result.price !== null || result.duration !== null || result.notes !== null,
      },
    });
  } catch (error: any) {
    logger.error("Update employee service error:", error);
    
    if (error instanceof Error) {
      const errorCode = (error as any)?.code || "";
      
      if (errorCode === "P2025") {
        return res.status(404).json({ 
          error: "Asocierea nu a fost găsită.",
          code: "ASSOCIATION_NOT_FOUND",
          actionable: "Serviciul nu este asociat cu tine."
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

export = router;

