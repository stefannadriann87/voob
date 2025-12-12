import express = require("express");
import jwt = require("jsonwebtoken");
import type { Role as RoleType } from "@prisma/client";
const { validateEnv } = require("../lib/envValidator");
const { logger } = require("../lib/logger");

// Validează JWT_SECRET - aruncă eroare dacă nu este setat (nu mai folosim fallback)
const JWT_SECRET = validateEnv("JWT_SECRET", {
  required: true,
  minLength: 32,
});

// Numele cookie-ului pentru JWT
const JWT_COOKIE_NAME = "voob_auth";

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
  cookies: { [key: string]: string };
}

/**
 * Extrage JWT din request
 * Prioritate: 1. HttpOnly Cookie, 2. Authorization Header (backward compatibility)
 */
const extractToken = (req: express.Request): string | null => {
  const cookieReq = req as AuthenticatedRequest;
  
  // 1. Prioritate: HttpOnly Cookie (securitate maximă)
  if (cookieReq.cookies && cookieReq.cookies[JWT_COOKIE_NAME]) {
    return cookieReq.cookies[JWT_COOKIE_NAME];
  }
  
  // 2. Fallback: Authorization header (pentru backward compatibility și mobile apps)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1] || null;
  }
  
  return null;
};

const verifyJWT = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = extractToken(req);
  
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
  } catch (error: any) {
    // Check if token is expired
    if (error.name === "TokenExpiredError") {
      logger.debug("JWT token expired", { tokenPrefix: token.substring(0, 10) + "..." });
      return res.status(401).json({ 
        error: "Token expirat. Te rugăm să folosești refresh token pentru a obține un token nou.",
        code: "TOKEN_EXPIRED",
        requiresRefresh: true,
      });
    }
    
    logger.error("JWT verification failed", error, { tokenPrefix: token.substring(0, 10) + "..." });
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
};

module.exports = { verifyJWT, JWT_COOKIE_NAME, extractToken };

