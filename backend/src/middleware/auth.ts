import express = require("express");
import jwt = require("jsonwebtoken");
const { Role } = require("@prisma/client");
import type { Role as RoleType } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

interface AuthUser {
  userId: string;
  role: RoleType;
  businessId?: string;
}

interface AIContext {
  userId: string;
  role: "CLIENT" | "BUSINESS" | "EMPLOYEE" | "SUPERADMIN";
  businessId?: string | null;
}

interface AuthenticatedRequest extends express.Request {
  user?: AuthUser;
  aiContext?: AIContext;
}

const verifyJWT = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token lipsă." });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token lipsă." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthUser;
    (req as AuthenticatedRequest).user = payload;
    
    // Set AI context
    (req as AuthenticatedRequest).aiContext = {
      userId: payload.userId,
      role: payload.role as "CLIENT" | "BUSINESS" | "EMPLOYEE" | "SUPERADMIN",
      businessId: payload.businessId || null,
    };
    
    next();
  } catch (error) {
    console.error("JWT verify error:", error);
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
};

module.exports = { verifyJWT };

