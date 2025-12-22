/**
 * Business Routes - Main Router
 * CRITICAL FIX (TICKET-014): Modularized business routes
 * This file now imports and mounts all business-related route modules
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { BusinessType } = require("@prisma/client");
const { verifyJWT } = require("../middleware/auth");
const { requireBusinessAccess } = require("../middleware/requireOwnership");
const {
  cacheBusinessProfile, 
  getCachedBusiness,
  getBusinessProfile,
  setBusinessProfile,
  invalidateBusinessProfile,
  getServices,
  setServices,
  invalidateServices,
  TTL,
} = require("../services/cacheService");
const { logger } = require("../lib/logger");
const { validate, validateParams, validateQuery } = require("../middleware/validate");
const { createBusinessRouteSchema, updateBusinessSchema, businessIdParamSchema } = require("../validators/businessSchemas");
const { paginationQuerySchema, getPaginationParams, buildPaginationResponse } = require("../validators/paginationSchemas");
const {
  generateBusinessQrDataUrl,
  generateBusinessQrBuffer,
  generateBusinessQrSvg,
} = require("../lib/qr");
import type { AuthenticatedRequest } from "./business.shared.d";
const { defaultBusinessInclude } = require("./business.shared");

// Import modular routes
const businessServicesRouter = require("./business.services.routes");
const businessEmployeesRouter = require("./business.employees.routes");
const businessCourtsRouter = require("./business.courts.routes");

const router = express.Router();

// Debug middleware to log all requests to business router
router.use((req, res, next) => {
  // Log all requests that match employee services pattern
  if (req.path.includes("employees") && req.path.includes("services")) {
    logger.info("🔍 Business router - Request received (BEFORE route matching)", {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      url: req.url,
      params: req.params,
      route: req.route?.path,
    });
  }
  next();
});

router.post("/", verifyJWT, validate(createBusinessRouteSchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { name, domain, ownerId, services, employeeIds, businessType } = createBusinessRouteSchema.parse(req.body);

  // RBAC: Verify that ownerId matches authenticated user (unless SUPERADMIN)
  if (authReq.user?.role !== "SUPERADMIN" && ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu poți crea un business pentru alt utilizator." });
  }

  // RBAC: Verify that user doesn't already have a business
  const existingBusiness = await prisma.business.findFirst({
    where: { ownerId: ownerId },
  });

  if (existingBusiness) {
    return res.status(409).json({ error: "Utilizatorul are deja un business creat." });
  }

  const normalizedBusinessType =
    typeof businessType === "string" && Object.values(BusinessType).includes(businessType.toUpperCase())
      ? (businessType.toUpperCase() as typeof BusinessType[keyof typeof BusinessType])
      : BusinessType.GENERAL;

  try {
    const servicePayload =
      services?.map((service: { name: string; duration: number; price: number }) => ({
        name: service.name,
        duration: service.duration,
        price: service.price,
      })) ?? [];

    const employeeConnect = employeeIds?.map((id: string) => ({ id })) ?? [];

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
      logger.error("Business QR generation error:", qrError);
    }

    const business = await prisma.business.findUnique({
      where: { id: createdBusiness.id },
      include: defaultBusinessInclude,
    });

    return res.status(201).json(business);
  } catch (error) {
    logger.error("Business create error:", error);
    return res.status(500).json({ error: "Eroare la crearea business-ului." });
  }
});

// CRITICAL FIX (TICKET-010): Add pagination to business list endpoint
router.get("/", verifyJWT, validateQuery(paginationQuerySchema), async (req, res) => {
  try {
    // Parse pagination parameters
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50; // Default 50 items
    const { skip, take } = getPaginationParams(page, limit);

    // Check cache first (cache key includes pagination params)
    // CRITICAL FIX: Use proper cache key format matching delByPattern
    const cacheKey = `cache:business:business_list_all_page_${page}_limit_${limit}`;
    
    // CRITICAL FIX: Verify getCachedBusiness is a function before calling
    if (typeof getCachedBusiness !== "function") {
      logger.error("getCachedBusiness is not a function", { 
        type: typeof getCachedBusiness,
        cacheService: typeof require("../services/cacheService"),
      });
      throw new Error("Cache service not properly initialized");
    }
    
    const cached = await getCachedBusiness(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get total count for pagination
    const total = await prisma.business.count();

    // Fetch businesses with services in a single query (avoid N+1)
    // CRITICAL FIX: Use defaultBusinessInclude.services: true to get ALL service fields (id, name, duration, price, notes)
    // Previously only selected { duration: true }, which caused new services to not appear and missing fields
    const businesses = await prisma.business.findMany({
      include: {
        ...defaultBusinessInclude,
        // services: true is already included in defaultBusinessInclude, so we don't need to override it
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    // Calculate slotDuration for each business if not set (in-memory, no additional queries)
    // CRITICAL FIX: Also include business owner in employees list (owner can perform services)
    const businessesWithSlotDuration = businesses.map((business: any) => {
        if (business.slotDuration !== null && business.slotDuration !== undefined) {
          // Still need to add owner to employees list
          const employees = business.employees || [];
          const ownerInEmployees = employees.some((emp: any) => emp.id === business.owner?.id);
          if (!ownerInEmployees && business.owner) {
            // Add owner as first employee in the list
            business.employees = [
              {
                id: business.owner.id,
                name: business.owner.name,
                email: business.owner.email,
                phone: null,
                specialization: null,
                avatar: null,
              },
              ...employees,
            ];
          }
          return business;
        }

        // Calculate from minimum service duration
        const services = business.services || [];
        if (services.length === 0) {
          // Still need to add owner to employees list
          const employees = business.employees || [];
          const ownerInEmployees = employees.some((emp: any) => emp.id === business.owner?.id);
          if (!ownerInEmployees && business.owner) {
            business.employees = [
              {
                id: business.owner.id,
                name: business.owner.name,
                email: business.owner.email,
                phone: null,
                specialization: null,
                avatar: null,
              },
              ...employees,
            ];
          }
          return { ...business, slotDuration: 60 }; // Default to 60 minutes
        }

        // CRITICAL FIX: Services now include all fields (id, name, duration, price, notes), not just duration
        const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration || 60));
        // Round to nearest valid slot duration (30, 60, 90, 120, etc.) - doar multipli de 30
        // Slot duration nu poate fi mai mare decât durata minimă a serviciului
        const validDurations = [30, 60, 90, 120, 150, 180];
        const calculatedSlotDuration = validDurations.reduce((prev, curr) => {
          if (curr > minDuration) return prev; // Nu folosim slot duration mai mare decât durata minimă
          return Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev;
        }, 30); // Default minim 30 minute

        // CRITICAL FIX: Add owner to employees list if not already present
        const employees = business.employees || [];
        const ownerInEmployees = employees.some((emp: any) => emp.id === business.owner?.id);
        if (!ownerInEmployees && business.owner) {
          // Add owner as first employee in the list
          business.employees = [
            {
              id: business.owner.id,
              name: business.owner.name,
              email: business.owner.email,
              phone: null,
              specialization: null,
              avatar: null,
            },
            ...employees,
          ];
        }

        return { ...business, slotDuration: calculatedSlotDuration };
      });

    // Build paginated response
    const response = buildPaginationResponse(businessesWithSlotDuration, total, page, limit);

    // Cache the result (shorter TTL for paginated results)
    await cacheBusinessProfile(cacheKey, response, 180); // 3 minutes
    
    return res.json(response);
  } catch (error) {
    logger.error("Failed to list businesses", error);
    const errorMessage = error instanceof Error ? error.message : "Eroare necunoscută";
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("Business list error details", { errorMessage, errorStack });
    return res.status(500).json({ 
      error: "Eroare la listarea business-urilor.",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    });
  }
});

// Mount modular routes BEFORE specific routes to ensure they are registered
// IMPORTANT: Mount employee services routes BEFORE employee CRUD routes to avoid routing conflicts
router.use("/", businessServicesRouter);
router.use("/", businessEmployeesRouter);
router.use("/", businessCourtsRouter);

// CRITICAL FIX: Specific routes MUST be defined BEFORE generic /:businessId route
// to avoid Express matching the generic route first

// Get working hours for a business
router.get("/:businessId/working-hours", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const { employeeId } = req.query as { employeeId?: string };

  logger.info(
    `GET /business/${businessId}/working-hours - Request received${employeeId ? ` (employeeId=${employeeId})` : ""}`
  );

  if (!businessId) {
    logger.warn("GET /business/:businessId/working-hours - Missing businessId");
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // If an employeeId is provided, try to return that employee's schedule first
    if (employeeId) {
      const employee = await prisma.user.findFirst({
        where: {
          id: employeeId,
          OR: [
            { businessId },
            {
              ownedBusinesses: {
                some: {
                  id: businessId,
                },
              },
            },
          ],
        },
        select: { workingHours: true },
      });

      if (!employee) {
        logger.warn(
          `GET /business/${businessId}/working-hours - Employee ${employeeId} not linked to this business`
        );
        return res.status(404).json({ error: "Specialistul nu aparține acestui business." });
      }

      if (employee.workingHours) {
        logger.info(
          `GET /business/${businessId}/working-hours - Returning employee ${employeeId} schedule`
        );
        return res.json({ workingHours: employee.workingHours, source: "employee" });
      }

      logger.info(
        `GET /business/${businessId}/working-hours - Employee ${employeeId} has no custom schedule, falling back to business hours`
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { workingHours: true },
    });

    if (!business) {
      logger.warn(`GET /business/${businessId}/working-hours - Business not found`);
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    logger.info(
      `GET /business/${businessId}/working-hours - Returning business schedule${employeeId ? " (fallback)" : ""}`
    );
    return res.json({ workingHours: business.workingHours, source: "business" });
  } catch (error) {
    logger.error("Failed to fetch working hours", error);
    return res.status(500).json({ error: "Eroare la obținerea programului de lucru." });
  }
});

// Get courts for a business
// CRITICAL FIX: Mutat din business.courts.routes.ts și definit ÎNAINTE de /:businessId
// 
// AUTHORIZATION MATRIX FOR COURTS:
// ┌─────────────┬──────────┬──────────┬──────────┬──────────┐
// │ HTTP Method │ CLIENT   │ BUSINESS │ EMPLOYEE │ SUPERADMIN│
// ├─────────────┼──────────┼──────────┼──────────┼──────────┤
// │ GET /courts │ ✅ ALLOW │ ✅ ALLOW │ ✅ ALLOW │ ✅ ALLOW │
// │ POST /courts│ ❌ DENY  │ ✅ ALLOW │ ❌ DENY  │ ✅ ALLOW │
// │ PUT /courts │ ❌ DENY  │ ✅ ALLOW │ ❌ DENY  │ ✅ ALLOW │
// │ DELETE      │ ❌ DENY  │ ✅ ALLOW │ ❌ DENY  │ ✅ ALLOW │
// └─────────────┴──────────┴──────────┴──────────┴──────────┘
//
// RATIONALE:
// - READ (GET): CLIENT users MUST be able to view courts for SPORT_OUTDOOR businesses
//   to make bookings. This is a public read operation (authenticated only).
// - WRITE (POST/PUT/DELETE): Only BUSINESS owners and SUPERADMIN can modify courts.
//   This ensures data integrity and prevents unauthorized modifications.
//
// NOTE: This endpoint is identical to /working-hours - no ownership checks for READ.
router.get("/:businessId/courts", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  logger.info(`GET /business/${businessId}/courts - Request received`, {
    businessId,
    userId: authReq.user?.userId,
    userRole: authReq.user?.role,
    path: req.path,
    originalUrl: req.originalUrl,
  });

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică doar existența business-ului (exact ca /working-hours)
    // NO OWNERSHIP CHECK - CLIENT users are allowed to read courts
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      logger.warn(`GET /business/${businessId}/courts - Business not found`);
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Returnează toate courts active (pentru toți userii autentificați)
    // CLIENT, BUSINESS, EMPLOYEE, SUPERADMIN - all authenticated users can read
    const courts = await prisma.court.findMany({
      where: { 
        businessId,
        isActive: true, // Doar courts active pentru toți
      },
      include: {
        pricing: {
          orderBy: { timeSlot: "asc" },
        },
      },
      orderBy: { number: "asc" },
    });

    logger.info(`GET /business/${businessId}/courts - Returning ${courts.length} courts to ${authReq.user?.role}`);
    return res.json({ courts });
  } catch (error) {
    logger.error("Get courts failed", error);
    return res.status(500).json({ error: "Eroare la obținerea terenurilor." });
  }
});

// CRITICAL FIX (TICKET-009): Get individual business with caching
// NOTE: This route must be AFTER specific routes (working-hours, courts, etc.) to avoid intercepting them
router.get("/:businessId", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Check cache first
    const cached = await getBusinessProfile(businessId);
    if (cached) {
      return res.json(cached);
    }

    // Fetch business with all related data
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: defaultBusinessInclude,
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Verify access (owner, employee, or SUPERADMIN)
    const isOwner = business.ownerId === authReq.user?.userId;
    const isEmployee = business.employees.some((emp: { id: string }) => emp.id === authReq.user?.userId);
    const isSuperAdmin = authReq.user?.role === "SUPERADMIN";

    if (!isOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
    }

    // Cache the result
    await setBusinessProfile(businessId, business);

    return res.json(business);
  } catch (error) {
    logger.error("Failed to get business", error);
    return res.status(500).json({ error: "Eroare la obținerea business-ului." });
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
    logger.error("QR code regeneration failed", error);
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
    logger.error("Failed to fetch business insights", error);
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
    const fileName = `voob-${business.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || business.id.slice(0, 8)}.${format}`;

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
    logger.error("QR code download failed", error);
    return res.status(500).json({ error: "Nu am putut genera codul QR." });
  }
});

// CRITICAL FIX (TICKET-014): Services routes moved to business.services.routes.ts
// Removed duplicate routes - now imported via businessServicesRouter

// CRITICAL FIX: Specific routes (working-hours, courts) are now defined BEFORE generic /:businessId
// This ensures Express matches specific routes first

// Update working hours for a business
router.put("/:businessId/working-hours", verifyJWT, async (req, res) => {
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
    logger.error("Working hours update failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea programului de lucru." });
  }
});

// Update business
router.put("/:businessId", verifyJWT, requireBusinessAccess("businessId"), validateParams(businessIdParamSchema), validate(updateBusinessSchema), async (req, res) => {
  // CRITICAL FIX: businessIdParamSchema expects 'id', but route param is 'businessId'
  // validateParams middleware now handles the mapping
  const businessId = (req.params as any).id || req.params.businessId;
  const authReq = req as AuthenticatedRequest;
  const { name, email, businessType } = updateBusinessSchema.parse(req.body);
  const body = req.body as { address?: string; phone?: string; latitude?: string | number; longitude?: string | number };
  const address: string | undefined = body.address;
  const phone: string | undefined = body.phone;
  const latitude: string | number | undefined = body.latitude;
  const longitude: string | number | undefined = body.longitude;

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza acest business." });
    }

    // Validare
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return res.status(400).json({ error: "Numele business-ului este obligatoriu." });
    }

    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email-ul nu este valid." });
    }

    // Verifică dacă email-ul este deja folosit de alt business
    if (email !== undefined && email) {
      const existingBusiness = await prisma.business.findFirst({
        where: {
          email: email,
          id: { not: businessId },
        },
      });

      if (existingBusiness) {
        return res.status(409).json({ error: "Acest email este deja folosit de alt business." });
      }
    }

    // Actualizează business-ul
    type BusinessUpdateData = {
      name?: string;
      email?: string | null;
      address?: string | null;
      phone?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      businessType?: string;
    };
    const updateData: BusinessUpdateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (email !== undefined) {
      updateData.email = email && email.trim() ? email.trim() : null;
    }
    if (address !== undefined) {
      updateData.address = address && address.trim() ? address.trim() : null;
    }
    if (phone !== undefined) {
      updateData.phone = phone && phone.trim() ? phone.trim() : null;
    }
    if (latitude !== undefined) {
      updateData.latitude = latitude !== null && latitude !== undefined ? (typeof latitude === 'string' ? parseFloat(latitude) : latitude) : null;
    }
    if (longitude !== undefined) {
      updateData.longitude = longitude !== null && longitude !== undefined ? (typeof longitude === 'string' ? parseFloat(longitude) : longitude) : null;
    }
    if (businessType !== undefined) {
      // Validare businessType
      const normalizedBusinessType =
        typeof businessType === "string" && Object.values(BusinessType).includes(businessType.toUpperCase())
          ? (businessType.toUpperCase() as typeof BusinessType[keyof typeof BusinessType])
          : null;
      
      if (!normalizedBusinessType) {
        return res.status(400).json({ 
          error: `Tipul de business este invalid. Tipuri valide: ${Object.values(BusinessType).join(", ")}` 
        });
      }
      
      updateData.businessType = normalizedBusinessType;
    }

    // Verifică dacă există date de actualizat
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Nu există date de actualizat." });
    }

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: updateData,
      include: defaultBusinessInclude,
    });

    logger.info(`Business ${businessId} updated by user ${authReq.user?.userId}`);

    // CRITICAL FIX (TICKET-009): Invalidate cache when business is updated
    await invalidateBusinessProfile(businessId);

    return res.json(updated);
  } catch (error: any) {
    logger.error("Business update failed", error);
    logger.error("Business update error details:", error);
    // Returnează mesajul de eroare mai detaliat pentru debugging
    const errorMessage = error?.message || "Eroare la actualizarea business-ului.";
    return res.status(500).json({ error: errorMessage });
  }
});

// Update slot duration
router.put("/:businessId/slot-duration", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const { slotDuration }: { slotDuration?: number } = req.body;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Validate slotDuration if provided
  if (slotDuration !== undefined && slotDuration !== null) {
    const validDurations = [15, 30, 45, 60];
    if (!validDurations.includes(slotDuration)) {
      return res.status(400).json({
        error: "slotDuration trebuie să fie unul dintre: 15, 30, 45, 60 minute.",
      });
    }
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Authorization: only owner or superadmin can update
    const userId = authReq.user?.userId;
    const role = authReq.user?.role;
    const isOwner = !!userId && business.ownerId === userId;
    const isSuperAdmin = role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a actualiza slot duration." });
    }

    const updated = await prisma.business.update({
      where: { id: businessId },
      data: { slotDuration: slotDuration ?? null },
      include: defaultBusinessInclude,
    });

    // Calculate slotDuration if set to null (for response)
    let finalSlotDuration = updated.slotDuration;
    if (finalSlotDuration === null) {
      const services = updated.services || [];
      if (services.length > 0) {
        const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration));
        const validDurations = [15, 30, 45, 60];
        finalSlotDuration = validDurations.reduce((prev, curr) =>
          Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev
        );
      } else {
        finalSlotDuration = 60;
      }
    }

    return res.json({ ...updated, slotDuration: finalSlotDuration });
  } catch (error) {
    logger.error("Failed to update slot duration", error);
    return res.status(500).json({ error: "Eroare la actualizarea slot duration." });
  }
});

// Get holidays for a business
router.get("/:businessId/holidays", verifyJWT, async (req, res) => {
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
    logger.error("Failed to fetch holidays", error);
    return res.status(500).json({ error: "Eroare la obținerea perioadelor de concediu." });
  }
});

// Create a holiday period
router.post("/:businessId/holidays", verifyJWT, async (req, res) => {
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
    logger.error("Holiday creation failed", error);
    return res.status(500).json({ error: "Eroare la crearea perioadei de concediu." });
  }
});

// Delete a holiday period
router.delete("/:businessId/holidays/:holidayId", verifyJWT, async (req, res) => {
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
    logger.error("Holiday deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea perioadei de concediu." });
  }
});

// Cancel subscription
router.post("/:businessId/cancel-subscription", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a anula abonamentul pentru acest business." });
    }

    // Verifică dacă există subscription
    const subscription = await prisma.subscription.findFirst({
      where: { businessId },
      select: { id: true, stripeSubscriptionId: true, status: true },
    });

    if (!subscription) {
      return res.status(404).json({ error: "Nu există abonament activ pentru acest business." });
    }

    if (subscription.status === "CANCELED") {
      return res.status(400).json({ error: "Abonamentul este deja anulat." });
    }

    // Anulează subscription în Stripe
    const { getStripeClient } = require("../services/stripeService");
    const stripe = getStripeClient();

    if (subscription.stripeSubscriptionId) {
      try {
        // Anulează subscription (va continua până la sfârșitul perioadei plătite)
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (stripeError: any) {
        logger.error("Stripe subscription cancellation failed", stripeError);
        // Continuă chiar dacă Stripe eșuează, actualizăm în DB
      }
    }

    // Actualizează statusul în DB
    await prisma.subscription.updateMany({
      where: { businessId },
      data: {
        status: "CANCELED",
        autoBillingEnabled: false,
      },
    });

    logger.info(`Subscription canceled for business ${businessId} by user ${authReq.user?.userId}`);

    return res.json({
      success: true,
      message: "Abonamentul a fost anulat cu succes. Business-ul va rămâne activ până la expirarea perioadei plătite.",
    });
  } catch (error) {
    logger.error("Cancel subscription failed", error);
    return res.status(500).json({ error: "Eroare la anularea abonamentului." });
  }
});

// Delete business
router.delete("/:businessId", verifyJWT, async (req, res) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    // Verifică autorizarea
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, name: true },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    if (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN") {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge acest business." });
    }

    // Anulează subscription-ul Stripe dacă există
    const subscriptions = await prisma.subscription.findMany({
      where: { businessId },
      select: { stripeSubscriptionId: true },
    });

    const { getStripeClient } = require("../services/stripeService");
    const stripe = getStripeClient();

    for (const sub of subscriptions) {
      if (sub.stripeSubscriptionId) {
        try {
          // Șterge complet subscription-ul din Stripe
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        } catch (stripeError: any) {
          logger.error("Stripe subscription deletion failed", stripeError);
          // Continuă chiar dacă Stripe eșuează
        }
      }
    }

    // Șterge toate datele asociate (Prisma va gestiona cascade-ul pentru relațiile cu onDelete: Cascade)
    // Dar trebuie să ștergem manual relațiile care nu au cascade

    // Șterge employees (User cu businessId)
    await prisma.user.updateMany({
      where: { businessId },
      data: { businessId: null },
    });

    // Șterge clientLinks
    await prisma.clientBusinessLink.deleteMany({
      where: { businessId },
    });

    // Șterge subscriptions
    await prisma.subscription.deleteMany({
      where: { businessId },
    });

    // Șterge services (ar trebui să aibă cascade pentru bookings, dar să fim siguri)
    await prisma.service.deleteMany({
      where: { businessId },
    });

    // Șterge bookings (ar trebui să aibă cascade pentru payments, dar să fim siguri)
    await prisma.booking.deleteMany({
      where: { businessId },
    });

    // Șterge payments
    await prisma.payment.deleteMany({
      where: { businessId },
    });

    // Șterge invoices
    await prisma.invoice.deleteMany({
      where: { businessId },
    });

    // Șterge consentDocuments și consentForms
    await prisma.consentDocument.deleteMany({
      where: { businessId },
    });

    await prisma.consentForm.deleteMany({
      where: { businessId },
    });

    // Șterge smsUsageLogs și aiUsageLogs
    await prisma.smsUsageLog.deleteMany({
      where: { businessId },
    });

    await prisma.aiUsageLog.deleteMany({
      where: { businessId },
    });

    // Șterge business onboarding data
    await prisma.businessBankAccount.deleteMany({
      where: { businessId },
    });

    await prisma.businessKycStatus.deleteMany({
      where: { businessId },
    });

    await prisma.businessLegalInfo.deleteMany({
      where: { businessId },
    });

    await prisma.businessRepresentative.deleteMany({
      where: { businessId },
    });

    // Șterge holidays (ar trebui să aibă cascade, dar să fim siguri)
    await prisma.holiday.deleteMany({
      where: { businessId },
    });

    // Șterge business-ul în sine
    await prisma.business.delete({
      where: { id: businessId },
    });

    logger.info(`Business ${businessId} (${business.name}) deleted by user ${authReq.user?.userId}`);

    return res.json({
      success: true,
      message: "Business-ul a fost șters permanent cu succes.",
    });
  } catch (error) {
    logger.error("Business deletion failed", error);
    return res.status(500).json({ error: "Eroare la ștergerea business-ului." });
  }
});

// CRITICAL FIX (TICKET-014): Court routes moved to business.courts.routes.ts
// Removed duplicate routes - now imported via businessCourtsRouter

export = router;

