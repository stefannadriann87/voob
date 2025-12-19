import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { requireEmployeeServiceAccess } = require("../middleware/requireEmployeeServiceAccess");
const { invalidateBusinessProfile, invalidateServices } = require("../services/cacheService");
const { employeeIdParamSchema, workingHoursSchema, createHolidaySchema, holidayIdParamSchema } = require("../validators/employeeSchemas");
const { logger } = require("../lib/logger");

const router = express.Router();

// Get employee working hours
router.get("/:employeeId/working-hours", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { employeeId } = employeeIdParamSchema.parse({ employeeId: req.params.employeeId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar angajații pot accesa programul de lucru." });
  }

  // Only the employee themselves can access their working hours
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa aceste date." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { workingHours: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    // Verify user is actually an employee
    if (user.role !== "EMPLOYEE") {
      return res.status(403).json({ error: "Utilizatorul nu este un angajat." });
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

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar angajații pot actualiza programul de lucru." });
  }

  // Only the employee themselves can update their working hours
  if (authReq.user.userId !== employeeId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a actualiza aceste date." });
  }

  try {
    // Verify employee exists and is EMPLOYEE
    const existingUser = await prisma.user.findUnique({
      where: { id: employeeId },
      select: { role: true },
    });

    if (!existingUser || existingUser.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
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
    return res.status(403).json({ error: "Doar angajații pot accesa perioadele de concediu." });
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
    return res.status(403).json({ error: "Doar angajații pot crea perioade de concediu." });
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
    return res.status(403).json({ error: "Doar angajații pot șterge perioade de concediu." });
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
      error: "Doar angajații pot accesa serviciile.",
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
        error: "Angajatul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ 
        error: "Angajatul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că angajatul este asociat cu un business."
      });
    }

    // TICKET-044: Verifică canManageOwnServices (doar pentru informare, nu blochează GET)
    // GET este permis pentru a vedea serviciile, dar POST/DELETE vor verifica permisiunea

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
      businessId: employee.business.id,
      businessName: employee.business.name,
      canManageOwnServices: employee.canManageOwnServices, // TICKET-044: Returnează flag-ul pentru frontend
    });
  } catch (error) {
    logger.error("Get employee services error:", error);
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

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar angajații pot asocia servicii.",
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
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ 
        error: "Angajatul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId) {
      return res.status(404).json({ 
        error: "Angajatul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că angajatul este asociat cu un business."
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
    const result = await prisma.$transaction(async (tx) => {
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
          performedBy: authReq.user.userId,
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
      performedBy: authReq.user.userId,
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

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ 
      error: "Doar angajații pot dezasocia servicii.",
      code: "INVALID_ROLE",
      actionable: "Doar utilizatorii cu rolul de EMPLOYEE pot accesa acest endpoint."
    });
  }

  try {
    // Get employee with canManageOwnServices flag
    const employee = await prisma.user.findUnique({
      where: { id: authReq.user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
        canManageOwnServices: true, // TICKET-044: Verifică permisiunea
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ 
        error: "Angajatul nu a fost găsit.",
        code: "EMPLOYEE_NOT_FOUND",
        actionable: "Verifică că utilizatorul există și are rolul de EMPLOYEE."
      });
    }

    if (!employee.businessId) {
      return res.status(404).json({ 
        error: "Angajatul nu are un business asociat.",
        code: "EMPLOYEE_NO_BUSINESS",
        actionable: "Verifică că angajatul este asociat cu un business."
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
    await prisma.$transaction(async (tx) => {
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
          performedBy: authReq.user.userId,
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
      performedBy: authReq.user.userId,
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

export = router;

