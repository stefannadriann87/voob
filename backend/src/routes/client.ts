"use strict";

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { validate, validateQuery } = require("../middleware/validate");
const { paginationQuerySchema, getPaginationParams, buildPaginationResponse } = require("../validators/paginationSchemas");
const { linkClientSchema } = require("../validators/businessSchemas");
const { logger } = require("../lib/logger");

const router = express.Router();

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

const businessInclude = {
  owner: {
    select: { id: true, name: true, email: true },
  },
  services: true,
  employees: {
    select: { id: true, name: true, email: true, phone: true, specialization: true, avatar: true },
  },
  // businessType is included by default when using include, but we ensure it's available
};

router.post("/link", verifyJWT, validate(linkClientSchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, method } = linkClientSchema.parse(req.body);

  if (!authReq.user || authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot scana QR-ul unui business." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: businessInclude,
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    // Check if business is suspended
    if (business.status === "SUSPENDED") {
      return res.status(403).json({ error: "Business-ul este suspendat. Nu poți să te conectezi momentan." });
    }

    await prisma.clientBusinessLink.upsert({
      where: {
        clientId_businessId: {
          clientId: authReq.user.userId,
          businessId,
        },
      },
      update: {
        method: method || "MANUAL",
      },
      create: {
        clientId: authReq.user.userId,
        businessId,
        method: method || "MANUAL",
      },
    });

    // Fetch updated business list (pentru compatibilitate cu /api/user/attach-business)
    const links = await prisma.clientBusinessLink.findMany({
      where: { 
        clientId: authReq.user.userId,
        business: {
          status: { not: "SUSPENDED" },
        },
      },
      include: {
        business: {
          include: businessInclude,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const businesses = links.map((link: { business: any }) => {
      const b = link.business;
      if (b.slotDuration !== null && b.slotDuration !== undefined) {
        return b;
      }
      const services = b.services || [];
      if (services.length === 0) {
        return { ...b, slotDuration: 60 };
      }
      const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration));
      const validDurations = [15, 30, 45, 60];
      const calculatedSlotDuration = validDurations.reduce((prev, curr) =>
        Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev
      );
      return { ...b, slotDuration: calculatedSlotDuration };
    });

    return res.status(201).json({
      success: true,
      business,
      businesses,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Client link error:", error);
    return res.status(500).json({ error: "Nu am putut conecta clientul la acest business." });
  }
});

// CRITICAL FIX (TICKET-010): Add pagination to client businesses endpoint
router.get("/businesses", verifyJWT, validateQuery(paginationQuerySchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user || authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot accesa lista de business-uri conectate." });
  }

  try {
    // Parse pagination parameters from validated query or fallback to defaults
    const validatedQuery = (req as any).validatedQuery || {};
    const page = validatedQuery.page || Number(req.query.page) || 1;
    const limit = validatedQuery.limit || Number(req.query.limit) || 50; // Default 50 items
    const { skip, take } = getPaginationParams(page, limit);

    // Get total count for pagination
    const total = await prisma.clientBusinessLink.count({
      where: { 
        clientId: authReq.user.userId,
        business: {
          status: { not: "SUSPENDED" }, // Exclude suspended businesses
        },
      },
    });

    const links = await prisma.clientBusinessLink.findMany({
      where: { 
        clientId: authReq.user.userId,
        business: {
          status: { not: "SUSPENDED" }, // Exclude suspended businesses
        },
      },
      include: {
        business: {
          include: businessInclude,
        },
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const businesses = links.map((link: { business: any }) => {
      const business = link.business;
      // Calculate slotDuration if not set
      if (business.slotDuration !== null && business.slotDuration !== undefined) {
        return business;
      }

      const services = business.services || [];
      if (services.length === 0) {
        return { ...business, slotDuration: 60 }; // Default to 60 minutes
      }

      const minDuration = Math.min(...services.map((s: { duration: number }) => s.duration));
      // Round to nearest valid slot duration (15, 30, 45, 60)
      const validDurations = [15, 30, 45, 60];
      const calculatedSlotDuration = validDurations.reduce((prev, curr) =>
        Math.abs(curr - minDuration) < Math.abs(prev - minDuration) ? curr : prev
      );

      return { ...business, slotDuration: calculatedSlotDuration };
    });

    // Build paginated response
    const response = buildPaginationResponse(businesses, total, page, limit);
    return res.json(response);
  } catch (error) {
    logger.error("Client linked businesses error:", error);
    return res.status(500).json({ error: "Nu am putut încărca business-urile conectate." });
  }
});

export = router;


