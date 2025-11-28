/**
 * Health Check Endpoint
 * Pentru monitoring și verificare status aplicație
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");

const router = express.Router();

/**
 * GET /health
 * Health check endpoint pentru monitoring
 */
router.get("/", async (req: express.Request, res: express.Response) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: "unknown",
      redis: "unknown",
    },
  };

  // Verifică conexiunea la database
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = "connected";
  } catch (error) {
    health.status = "unhealthy";
    health.services.database = "disconnected";
    logger.error("Database health check failed", error);
  }

  // Verifică conexiunea la Redis (opțional)
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      health.services.redis = "connected";
    } else {
      health.services.redis = "not_configured";
    }
  } catch (error) {
    health.services.redis = "disconnected";
    // Redis failure nu face aplicația unhealthy (are fallback)
    logger.warn("Redis health check failed (non-critical)", error);
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
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

