"use strict";

import express = require("express");
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
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
};

// DEPRECATED: POST /api/user/attach-business a fost mutat la /client/link
// Acest endpoint este păstrat pentru backward compatibility temporar
// TODO: Șterge după ce frontend-ul este actualizat să folosească /client/link
// Folosește /client/link în loc de acest endpoint (are validare Zod și verificare business status)

export = router;

