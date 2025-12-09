/**
 * Global Rate Limiting Middleware
 * Aplică rate limiting pe toate rutele API (exceptând webhooks)
 */

import express = require("express");
const { getClientIp } = require("../services/rateLimitService");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");

interface RateLimitOptions {
  windowMs: number; // Window în milisecunde
  max: number; // Max requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const createRateLimiter = (options: RateLimitOptions & { perPath?: boolean; methodsToLimit?: string[] }) => {
  const { 
    windowMs, 
    max, 
    message = "Too many requests from this IP, please try again later.",
    perPath = false, // default: rate limit per IP, nu per path
    methodsToLimit = ["GET", "POST", "PUT", "DELETE", "PATCH"], // default: toate metodele
  } = options;

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Log pentru debugging (doar pentru /auth/login)
    if (req.path === "/auth/login" && req.method === "POST") {
      console.log("🌐 Global rate limiter - /auth/login request");
    }

    // Skip rate limiting pentru webhooks (au propriul sistem de verificare)
    if (req.path.startsWith("/webhooks/") || req.path.startsWith("/billing/webhooks")) {
      return next();
    }

    // Skip rate limiting pentru health checks
    if (req.path.startsWith("/health")) {
      return next();
    }

    // Skip dacă metoda nu e în lista de limitare
    if (!methodsToLimit.includes(req.method)) {
      return next();
    }

    const ip = getClientIp(req);
    if (!ip) {
      console.log("⚠️ No IP found, skipping rate limit");
      return next();
    }

    try {
      const redis = await getRedisClient();
      // Key: per IP global sau per IP + path
      const key = perPath 
        ? `rate_limit:${ip}:${req.path}` 
        : `rate_limit:global:${ip}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      if (redis && redis.isOpen) {
        // Folosește Redis pentru rate limiting (sliding window cu sorted set)
        const count = await redis.zCount(key, windowStart, now);
        
        if (count >= max) {
          logger.warn("Rate limit exceeded", { ip, path: req.path, count, max });
          return res.status(429).json({ error: message });
        }

        // Adaugă request-ul curent
        await redis.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
        // Elimină entries vechi și setează expirare
        await redis.zRemRangeByScore(key, 0, windowStart);
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }
      // Dacă Redis nu e disponibil, permite request-ul (fail open pentru development)
      // În production, Redis ar trebui să fie disponibil

      next();
    } catch (error) {
      // Dacă rate limiting eșuează, permite request-ul (fail open)
      logger.error("Rate limiting error", error);
      next();
    }
  };
};

// Rate limiter global: 500 requests per 15 minute per IP (mai permisiv pentru dezvoltare)
// Un page load poate face 10-20 API calls, deci 500 permite ~25-50 page loads
const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 500,
  message: "Prea multe cereri de la acest IP. Te rugăm să aștepți câteva minute.",
  perPath: false, // Rate limit global per IP
});

// Rate limiter strict pentru booking creation: 20 requests per minute
const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minut
  max: 20,
  message: "Prea multe cereri de rezervare. Te rugăm să aștepți câteva secunde.",
  perPath: true, // Rate limit per path pentru booking
  methodsToLimit: ["POST", "DELETE"], // Doar POST și DELETE, nu GET
});

// Rate limiter pentru payment intents: 10 requests per minute
const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minut
  max: 10,
  message: "Prea multe cereri de plată. Te rugăm să aștepți câteva secunde.",
  perPath: true,
  methodsToLimit: ["POST"], // Doar POST
});

module.exports = {
  globalRateLimiter,
  bookingRateLimiter,
  paymentRateLimiter,
};

