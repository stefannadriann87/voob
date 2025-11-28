"use strict";

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");

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

router.post("/link", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, method }: { businessId?: string; method?: string } = req.body ?? {};

  if (!authReq.user || authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot scana QR-ul unui business." });
  }

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: businessInclude,
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
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

    return res.status(201).json(business);
  } catch (error) {
    console.error("Client link error:", error);
    return res.status(500).json({ error: "Nu am putut conecta clientul la acest business." });
  }
});

router.get("/businesses", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user || authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot accesa lista de business-uri conectate." });
  }

  try {
    const links = await prisma.clientBusinessLink.findMany({
      where: { clientId: authReq.user.userId },
      include: {
        business: {
          include: businessInclude,
        },
      },
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
    return res.json(businesses);
  } catch (error) {
    console.error("Client linked businesses error:", error);
    return res.status(500).json({ error: "Nu am putut încărca business-urile conectate." });
  }
});

export = router;


