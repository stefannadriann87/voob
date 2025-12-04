/**
 * Health Check Endpoint
 * Pentru monitoring și verificare status aplicație
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");

const router = express.Router();

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
router.get("/", async (req: express.Request, res: express.Response) => {
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

  // Verifică conexiunea la database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
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

  // Verifică conexiunea la Redis (opțional)
  try {
    const redis = await getRedisClient();
    if (redis && redis.isOpen) {
      const redisStart = Date.now();
      await redis.ping();
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

  // Verifică Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const { getStripeClient } = require("../services/stripeService");
      const stripe = getStripeClient();
      const stripeStart = Date.now();
      await stripe.balance.retrieve();
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

  const statusCode = health.status === "healthy" ? 200 : 
                     health.status === "degraded" ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/ready
 * Readiness check - verifică dacă aplicația este gata să primească trafic
 */
router.get("/ready", async (req: express.Request, res: express.Response) => {
  try {
    // Verifică doar database (critic)
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error("Readiness check failed", error);
    res.status(503).json({ status: "not_ready", error: "Database unavailable" });
  }
});

/**
 * GET /health/live
 * Liveness check - verifică dacă aplicația rulează
 */
router.get("/live", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
});

export = router;

