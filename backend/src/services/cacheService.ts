/**
 * Cache Service
 * Redis caching pentru date frecvent accesate
 */

const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");

// TTL defaults (în secunde)
const TTL = {
  SHORT: 60,           // 1 minut
  MEDIUM: 300,         // 5 minute
  LONG: 3600,          // 1 oră
  BUSINESS_PROFILE: 600,    // 10 minute
  WORKING_HOURS: 1800,      // 30 minute
  SERVICES_LIST: 900,       // 15 minute
  USER_PROFILE: 300,        // 5 minute
};

// Prefix-uri pentru namespace-uri cache
const PREFIX = {
  BUSINESS: "cache:business:",
  WORKING_HOURS: "cache:working_hours:",
  SERVICES: "cache:services:",
  USER: "cache:user:",
};

/**
 * Get value from cache
 */
async function get<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    if (!redis || !redis.isOpen) return null;
    
    const value = await redis.get(key);
    if (!value) return null;
    
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error("Cache get error", error, { key });
    return null;
  }
}

/**
 * Set value in cache
 */
async function set(key: string, value: unknown, ttlSeconds: number = TTL.MEDIUM): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis || !redis.isOpen) return false;
    
    await redis.setEx(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.error("Cache set error", error, { key });
    return false;
  }
}

/**
 * Delete from cache
 */
async function del(key: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis || !redis.isOpen) return false;
    
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error("Cache del error", error, { key });
    return false;
  }
}

/**
 * Delete multiple keys by pattern
 */
async function delByPattern(pattern: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    if (!redis || !redis.isOpen) return 0;
    
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    
    await redis.del(keys);
    return keys.length;
  } catch (error) {
    logger.error("Cache delByPattern error", error, { pattern });
    return 0;
  }
}

// Helper functions pentru entități specifice

/**
 * Cache business profile
 */
async function getBusinessProfile(businessId: string) {
  return get(`${PREFIX.BUSINESS}${businessId}`);
}

async function setBusinessProfile(businessId: string, profile: unknown) {
  return set(`${PREFIX.BUSINESS}${businessId}`, profile, TTL.BUSINESS_PROFILE);
}

async function invalidateBusinessProfile(businessId: string) {
  return del(`${PREFIX.BUSINESS}${businessId}`);
}

/**
 * Cache working hours
 */
async function getWorkingHours(businessId: string, employeeId?: string) {
  const key = employeeId 
    ? `${PREFIX.WORKING_HOURS}${businessId}:${employeeId}`
    : `${PREFIX.WORKING_HOURS}${businessId}`;
  return get(key);
}

async function setWorkingHours(businessId: string, workingHours: unknown, employeeId?: string) {
  const key = employeeId 
    ? `${PREFIX.WORKING_HOURS}${businessId}:${employeeId}`
    : `${PREFIX.WORKING_HOURS}${businessId}`;
  return set(key, workingHours, TTL.WORKING_HOURS);
}

async function invalidateWorkingHours(businessId: string) {
  return delByPattern(`${PREFIX.WORKING_HOURS}${businessId}*`);
}

/**
 * Cache services list
 */
async function getServices(businessId: string) {
  return get(`${PREFIX.SERVICES}${businessId}`);
}

async function setServices(businessId: string, services: unknown) {
  return set(`${PREFIX.SERVICES}${businessId}`, services, TTL.SERVICES_LIST);
}

async function invalidateServices(businessId: string) {
  return del(`${PREFIX.SERVICES}${businessId}`);
}

/**
 * Cache user profile
 */
async function getUserProfile(userId: string) {
  return get(`${PREFIX.USER}${userId}`);
}

async function setUserProfile(userId: string, profile: unknown) {
  return set(`${PREFIX.USER}${userId}`, profile, TTL.USER_PROFILE);
}

async function invalidateUserProfile(userId: string) {
  return del(`${PREFIX.USER}${userId}`);
}

/**
 * Cache-aside pattern helper
 * Încearcă să citească din cache, dacă nu există, execută callback și cachează rezultatul
 */
async function getOrSet<T>(
  key: string, 
  fetchFn: () => Promise<T>, 
  ttlSeconds: number = TTL.MEDIUM
): Promise<T> {
  // Încearcă cache
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch from source
  const data = await fetchFn();
  
  // Cachează pentru viitor (async, nu așteaptă)
  set(key, data, ttlSeconds).catch(() => {});
  
  return data;
}


/**
 * Get cached business (generic - can be used for business list too)
 */
async function getCachedBusiness(key: string): Promise<any | null> {
  return await get(key);
}

/**
 * Cache business profile or list
 */
async function cacheBusinessProfile(key: string, data: any, ttlSeconds: number = TTL.BUSINESS_PROFILE): Promise<void> {
  await set(key, data, ttlSeconds);
}

/**
 * Get cached services list
 */
async function getCachedServices(key: string): Promise<any | null> {
  return await get(PREFIX.SERVICES + key);
}

/**
 * Cache services list
 */
async function cacheServicesList(key: string, data: any, ttlSeconds: number = TTL.SERVICES_LIST): Promise<void> {
  await set(PREFIX.SERVICES + key, data, ttlSeconds);
}

module.exports = {
  getCachedBusiness,
  cacheBusinessProfile,
  getCachedServices,
  cacheServicesList,
  TTL,
  PREFIX,
  get,
  set,
  del,
  delByPattern,
  getBusinessProfile,
  setBusinessProfile,
  invalidateBusinessProfile,
  getWorkingHours,
  setWorkingHours,
  invalidateWorkingHours,
  getServices,
  setServices,
  invalidateServices,
  getUserProfile,
  setUserProfile,
  invalidateUserProfile,
  getOrSet,
};

