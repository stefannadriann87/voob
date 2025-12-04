/**
 * Redis Client
 * Singleton pentru conexiunea Redis
 */

const { createClient } = require("redis");
const { logger } = require("./logger");

let redisClient: any = null;
let connectionAttempted = false;

async function getRedisClient() {
  // Dacă Redis nu e configurat, returnează null (folosim fallback la DB)
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // Evită încercări repetate de conectare dacă a eșuat deja
  if (connectionAttempted && !redisClient) {
    return null;
  }

  const redisUrl = process.env.REDIS_URL;

  try {
    connectionAttempted = true;
    redisClient = createClient({
      url: redisUrl,
    });

    redisClient.on("error", (err: any) => {
      // Log doar o dată, nu la fiecare eroare
      if (redisClient) {
        logger.warn("Redis Client Error - using DB fallback", { error: err.message });
        redisClient = null;
      }
    });

    redisClient.on("connect", () => {
      logger.info("Redis Client Connected");
    });

    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    return redisClient;
  } catch (error: any) {
    logger.warn("Redis connection failed - using DB fallback", { error: error?.message });
    redisClient = null;
    return null;
  }
}

/**
 * Închide conexiunea Redis (pentru cleanup)
 */
async function closeRedisClient() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  getRedisClient,
  closeRedisClient,
};

