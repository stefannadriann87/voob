/**
 * Health Check Endpoint
 * Pentru monitoring și verificare status aplicație
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");
const { createRateLimiter } = require("../middleware/globalRateLimit");
const { getClientIp } = require("../services/rateLimitService");

const router = express.Router();

// Rate limiter specific pentru health checks (100 requests/minute per IP)
const healthRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minut
  max: 100,
  message: "Prea multe cereri de health check. Te rugăm să aștepți câteva secunde.",
  perPath: true,
  methodsToLimit: ["GET"],
});

// Cache pentru health check results (10 secunde)
let healthCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 10 * 1000; // 10 secunde

// Helper pentru timeout
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, serviceName: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${serviceName} health check timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
};

interface ServiceStatus {
  status: "connected" | "disconnected" | "not_configured" | "degraded";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    stripe: ServiceStatus;
    email: ServiceStatus;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

/**
 * GET /health
 * Health check endpoint pentru monitoring
 */
router.get("/", healthRateLimiter, async (req: express.Request, res: express.Response) => {
  // IMPORTANT FIX: Verifică cache
  const now = Date.now();
  if (healthCache && (now - healthCache.timestamp) < CACHE_TTL) {
    return res.status(healthCache.data.status === "healthy" || healthCache.data.status === "degraded" ? 200 : 503)
      .json(healthCache.data);
  }

  const startTime = Date.now();
  
  const health: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    services: {
      database: { status: "disconnected" },
      redis: { status: "not_configured" },
      stripe: { status: "not_configured" },
      email: { status: "not_configured" },
    },
    memory: {
      used: 0,
      total: 0,
      percentage: 0,
    },
  };

  // Memory usage
  const memUsage = process.memoryUsage();
  health.memory = {
    used: Math.round(memUsage.heapUsed / 1024 / 1024),
    total: Math.round(memUsage.heapTotal / 1024 / 1024),
    percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
  };

  // Verifică conexiunea la database (cu timeout)
  try {
    const dbStart = Date.now();
    await withTimeout(prisma.$queryRaw`SELECT 1`, 5000, "Database");
    health.services.database = { 
      status: "connected",
      latencyMs: Date.now() - dbStart
    };
  } catch (error: any) {
    health.status = "unhealthy";
    health.services.database = { 
      status: "disconnected",
      error: error.message 
    };
    logger.error("Database health check failed", error);
  }

  // Verifică conexiunea la Redis (opțional, cu timeout)
  try {
    const redis = await getRedisClient();
    if (redis && redis.isOpen) {
      const redisStart = Date.now();
      await withTimeout(redis.ping(), 3000, "Redis");
      health.services.redis = { 
        status: "connected",
        latencyMs: Date.now() - redisStart
      };
    } else {
      health.services.redis = { status: "not_configured" };
    }
  } catch (error: any) {
    health.services.redis = { 
      status: "disconnected",
      error: error.message 
    };
    // Redis failure nu face aplicația unhealthy (are fallback)
    logger.warn("Redis health check failed (non-critical)", error);
  }

  // Verifică Stripe (cu timeout)
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const { getStripeClient } = require("../services/stripeService");
      const stripe = getStripeClient();
      const stripeStart = Date.now();
      await withTimeout(stripe.balance.retrieve(), 5000, "Stripe");
      health.services.stripe = { 
        status: "connected",
        latencyMs: Date.now() - stripeStart
      };
    } catch (error: any) {
      health.services.stripe = { 
        status: "degraded",
        error: error.message 
      };
      if (health.status === "healthy") {
        health.status = "degraded";
      }
    }
  }

  // Verifică Email (SMTP)
  if (process.env.SMTP_HOST) {
    health.services.email = { status: "connected" };
  }

  // IMPORTANT FIX: Salvează în cache
  healthCache = { data: health, timestamp: now };

  const statusCode = health.status === "healthy" ? 200 : 
                     health.status === "degraded" ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/ready
 * Readiness check - verifică dacă aplicația este gata să primească trafic
 */
router.get("/ready", healthRateLimiter, async (req: express.Request, res: express.Response) => {
  try {
    // Verifică doar database (critic, cu timeout)
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, "Database");
    res.status(200).json({ status: "ready", timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error("Readiness check failed", error);
    res.status(503).json({ status: "not_ready", error: "Database unavailable" });
  }
});

/**
 * GET /health/live
 * Liveness check - verifică dacă aplicația rulează
 */
router.get("/live", healthRateLimiter, (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
});

export = router;

