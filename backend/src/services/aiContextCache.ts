/**
 * AI Context Cache Service
 * Cache pentru context-ul AI pentru a reduce query-urile la baza de date
 */

const NodeCache = require("node-cache");
const { logger } = require("../lib/logger");

// Cache TTL: 5 minute (configurabil prin env)
const CACHE_TTL_SECONDS = Number(process.env.AI_CONTEXT_CACHE_TTL || 300); // 5 minute default

// Cache instance
const contextCache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Don't clone objects (better performance)
});

/**
 * Generează cheia de cache pentru un user
 */
function getCacheKey(userId: string, role: string, businessId?: string | null): string {
  return `ai_context:${userId}:${role}:${businessId || "none"}`;
}

/**
 * Obține context-ul din cache
 */
function getCachedContext(userId: string, role: string, businessId?: string | null): any | null {
  const key = getCacheKey(userId, role, businessId);
  const cached = contextCache.get(key);
  
  if (cached) {
    logger.debug(`✅ AI context cache hit for user ${userId}`);
    return cached;
  }
  
  logger.debug(`❌ AI context cache miss for user ${userId}`);
  return null;
}

/**
 * Salvează context-ul în cache
 */
function setCachedContext(
  userId: string,
  role: string,
  businessId: string | null | undefined,
  context: any
): void {
  const key = getCacheKey(userId, role, businessId);
  contextCache.set(key, context);
  logger.debug(`💾 AI context cached for user ${userId}`);
}

/**
 * Șterge context-ul din cache (pentru invalidare manuală)
 */
function invalidateContext(userId: string, role: string, businessId?: string | null): void {
  const key = getCacheKey(userId, role, businessId);
  contextCache.del(key);
  logger.debug(`🗑️  AI context cache invalidated for user ${userId}`);
}

/**
 * Șterge toate context-urile pentru un user (când se schimbă datele)
 */
function invalidateUserContexts(userId: string): void {
  const keys = contextCache.keys();
  const userKeys = keys.filter((key) => key.startsWith(`ai_context:${userId}:`));
  userKeys.forEach((key) => contextCache.del(key));
  logger.debug(`🗑️  All AI context caches invalidated for user ${userId}`);
}

/**
 * Șterge toate context-urile pentru un business (când se schimbă datele business-ului)
 */
function invalidateBusinessContexts(businessId: string): void {
  const keys = contextCache.keys();
  const businessKeys = keys.filter((key) => key.includes(`:${businessId}`));
  businessKeys.forEach((key) => contextCache.del(key));
  logger.debug(`🗑️  All AI context caches invalidated for business ${businessId}`);
}

/**
 * Obține statistici despre cache
 */
function getCacheStats(): {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const stats = contextCache.getStats();
  return {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0,
  };
}

module.exports = {
  getCachedContext,
  setCachedContext,
  invalidateContext,
  invalidateUserContexts,
  invalidateBusinessContexts,
  getCacheStats,
  CACHE_TTL_SECONDS,
};
