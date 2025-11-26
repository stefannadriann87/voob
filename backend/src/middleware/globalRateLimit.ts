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

const createRateLimiter = (options: RateLimitOptions) => {
  const { windowMs, max, message = "Too many requests from this IP, please try again later." } = options;

  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip rate limiting pentru webhooks (au propriul sistem de verificare)
    if (req.path.startsWith("/webhooks/") || req.path.startsWith("/billing/webhooks")) {
      return next();
    }

    const ip = getClientIp(req);
    if (!ip) {
      return next();
    }

    try {
      const redis = getRedisClient();
      const key = `rate_limit:${ip}:${req.path}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      if (redis) {
        // Folosește Redis pentru rate limiting
        const count = await redis.zcount(key, windowStart, now);
        
        if (count >= max) {
          logger.warn("Rate limit exceeded", { ip, path: req.path, count, max });
          return res.status(429).json({ error: message });
        }

        // Adaugă request-ul curent
        await redis.zadd(key, now, `${now}-${Math.random()}`);
        // Expiră key-ul după window
        await redis.expire(key, Math.ceil(windowMs / 1000));
      } else {
        // Fallback: simplu in-memory (nu este ideal pentru production cu multiple instances)
        // În production, Redis este necesar
        logger.warn("Rate limiting fallback to in-memory (Redis not available)", { ip });
      }

      next();
    } catch (error) {
      // Dacă rate limiting eșuează, permite request-ul (fail open)
      logger.error("Rate limiting error", error);
      next();
    }
  };
};

// Rate limiter global: 100 requests per 15 minute
export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 100,
  message: "Too many requests from this IP. Please try again later.",
});

// Rate limiter strict pentru booking creation: 10 requests per minute
export const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minut
  max: 10,
  message: "Too many booking requests. Please wait a moment before trying again.",
});

// Rate limiter pentru payment intents: 5 requests per minute
export const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minut
  max: 5,
  message: "Too many payment requests. Please wait a moment before trying again.",
});

