"use strict";

import express = require("express");
const prisma = require("../lib/prisma").default;
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

router.post("/link", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId }: { businessId?: string } = req.body ?? {};

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
      update: {},
      create: {
        clientId: authReq.user.userId,
        businessId,
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

    const businesses = links.map((link) => link.business);
    return res.json(businesses);
  } catch (error) {
    console.error("Client linked businesses error:", error);
    return res.status(500).json({ error: "Nu am putut încărca business-urile conectate." });
  }
});

export = router;


