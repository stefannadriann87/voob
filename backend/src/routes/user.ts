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
};

/**
 * Attach business to user account (for QR code flow)
 * POST /api/user/attach-business
 */
router.post("/attach-business", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, attachedVia }: { businessId?: string; attachedVia?: string } = req.body ?? {};

  if (!authReq.user || authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot atașa business-uri." });
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

    // Upsert to avoid duplicates
    await prisma.clientBusinessLink.upsert({
      where: {
        clientId_businessId: {
          clientId: authReq.user.userId,
          businessId,
        },
      },
      update: {
        method: attachedVia || "QR",
      },
      create: {
        clientId: authReq.user.userId,
        businessId,
        method: attachedVia || "QR",
      },
    });

    // Fetch updated business list
    const links = await prisma.clientBusinessLink.findMany({
      where: { clientId: authReq.user.userId },
      include: {
        business: {
          include: businessInclude,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const businesses = links.map((link: typeof links[number]) => link.business);

    return res.status(201).json({
      success: true,
      business,
      businesses, // Return updated list
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Attach business error:", error);
    return res.status(500).json({ error: "Nu am putut atașa business-ul la cont." });
  }
});

export = router;

