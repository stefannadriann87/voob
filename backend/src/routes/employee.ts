import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
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
router.get("/services", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar angajații pot accesa serviciile." });
  }

  try {
    // Get employee with business
    const employee = await prisma.user.findUnique({
      where: { id: authReq.user.userId },
      select: {
        id: true,
        role: true,
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

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    if (!employee.businessId || !employee.business) {
      return res.status(404).json({ error: "Employee-ul nu are un business asociat." });
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
      businessId: employee.business.id,
      businessName: employee.business.name,
    });
  } catch (error) {
    logger.error("Get employee services error:", error);
    return res.status(500).json({ error: "Eroare la obținerea serviciilor." });
  }
});

// Associate service with employee
router.post("/services/:serviceId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { serviceId } = req.params;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar angajații pot asocia servicii." });
  }

  try {
    // Get employee with business
    const employee = await prisma.user.findUnique({
      where: { id: authReq.user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
    }

    if (!employee.businessId) {
      return res.status(404).json({ error: "Employee-ul nu are un business asociat." });
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
      return res.status(403).json({ error: "Serviciul nu aparține business-ului tău." });
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
      return res.status(409).json({ error: "Serviciul este deja asociat." });
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
    return res.status(500).json({ error: "Eroare la asocierea serviciului." });
  }
});

// Disassociate service from employee
router.delete("/services/:serviceId", verifyJWT, async (req, res) => {
  const authReq = req as express.Request & { user?: { userId: string; role: string } };
  const { serviceId } = req.params;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is EMPLOYEE
  if (authReq.user.role !== "EMPLOYEE") {
    return res.status(403).json({ error: "Doar angajații pot dezasocia servicii." });
  }

  try {
    // Get employee
    const employee = await prisma.user.findUnique({
      where: { id: authReq.user.userId },
      select: {
        id: true,
        role: true,
        businessId: true,
      },
    });

    if (!employee || employee.role !== "EMPLOYEE") {
      return res.status(404).json({ error: "Employee-ul nu a fost găsit." });
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
    return res.status(500).json({ error: "Eroare la dezasocierea serviciului." });
  }
});

export = router;

