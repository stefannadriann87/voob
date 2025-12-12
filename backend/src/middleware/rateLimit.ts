/**
 * Rate Limit Middleware
 * Middleware pentru rate limiting pe rute
 */

import express = require("express");
const {
  getClientIp,
  checkRegistrationLimit,
  checkLoginLimit,
  isIpBlacklisted,
} = require("../services/rateLimitService");
const { logger } = require("../lib/logger");

/**
 * Middleware pentru rate limiting la înregistrare
 */
async function rateLimitRegistration(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const ip = getClientIp(req);

  // Verifică blacklist
  const blacklisted = await isIpBlacklisted(ip);
  if (blacklisted) {
    return res.status(403).json({
      error: "Accesul de la această adresă IP este blocat temporar. Te rugăm să contactezi suportul.",
    });
  }

  // Verifică rate limit
  const limit = await checkRegistrationLimit(ip);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Ai depășit limita de înregistrări. Te rugăm să încerci mâine. (${limit.remaining} încercări rămase)`,
      remaining: limit.remaining,
    });
  }

  next();
}

/**
 * Middleware pentru rate limiting la login
 */
async function rateLimitLogin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const ip = getClientIp(req);

  try {
    // Verifică blacklist
    const blacklisted = await isIpBlacklisted(ip);
    if (blacklisted) {
      return res.status(403).json({
        error: "Accesul de la această adresă IP este blocat temporar. Te rugăm să contactezi suportul.",
      });
    }

    // Verifică rate limit
    const limit = await checkLoginLimit(ip);
    if (!limit.allowed) {
      return res.status(429).json({
        error: `Prea multe încercări de login. Te rugăm să aștepți 15 minute. (${limit.remaining} încercări rămase)`,
        remaining: limit.remaining,
      });
    }

    next();
  } catch (error) {
    logger.error("❌ Rate limit login error:", error);
    // Fail open în development pentru a nu bloca debugging
    if (process.env.NODE_ENV === "development") {
      return next();
    }
    // În production, blochează request-ul dacă există erori
    return res.status(500).json({
      error: "Eroare la verificarea limitelor de acces. Te rugăm să încerci din nou.",
    });
  }
}

module.exports = {
  rateLimitRegistration,
  rateLimitLogin,
};

