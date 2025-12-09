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
  console.log("🔒 Rate limit login middleware - START");
  const ip = getClientIp(req);
  console.log("🔒 IP:", ip);

  try {
    // Verifică blacklist
    const blacklisted = await isIpBlacklisted(ip);
    if (blacklisted) {
      console.log("❌ IP blacklisted:", ip);
      return res.status(403).json({
        error: "Accesul de la această adresă IP este blocat temporar. Te rugăm să contactezi suportul.",
      });
    }

    // Verifică rate limit
    const limit = await checkLoginLimit(ip);
    if (!limit.allowed) {
      console.log("❌ Rate limit exceeded:", { ip, remaining: limit.remaining });
      return res.status(429).json({
        error: `Prea multe încercări de login. Te rugăm să aștepți 15 minute. (${limit.remaining} încercări rămase)`,
        remaining: limit.remaining,
      });
    }

    console.log("✅ Rate limit login middleware - PASSED");
    next();
  } catch (error) {
    console.error("❌ Rate limit login error:", error);
    // Fail open în development pentru a nu bloca debugging
    if (process.env.NODE_ENV === "development") {
      console.log("⚠️ Development mode: allowing request despite rate limit error");
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

