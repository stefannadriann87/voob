/**
 * Redis Client
 * Singleton pentru conexiunea Redis
 */

import { createClient } from "redis";

let redisClient: any = null;

export async function getRedisClient() {
  // Dacă Redis nu e instalat sau configurat, returnează null (folosim fallback la DB)
  if (!createClient || !process.env.REDIS_URL) {
    return null;
  }

  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    redisClient = createClient({
      url: redisUrl,
    });

    redisClient.on("error", (err: any) => {
      console.warn("Redis Client Error (using DB fallback):", err.message);
      redisClient = null; // Reset pentru a încerca reconectare la următoarea cerere
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis Client Connected");
    });

    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    return redisClient;
  } catch (error) {
    console.warn("Redis connection failed (using DB fallback):", error);
    return null;
  }
}

/**
 * Închide conexiunea Redis (pentru cleanup)
 */
export async function closeRedisClient() {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

module.exports = {
  getRedisClient,
  closeRedisClient,
};

