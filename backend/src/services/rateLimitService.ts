/**
 * Rate Limit Service
 * Gestionează rate limiting folosind Redis
 */

const prisma = require("../lib/prisma");
const { getRedisClient } = require("../lib/redis");
const { logger } = require("../lib/logger");

const REGISTRATION_RATE_LIMIT = Number(process.env.REGISTRATION_RATE_LIMIT || 5); // Max 5 înregistrări/24h
const LOGIN_RATE_LIMIT = Number(process.env.LOGIN_RATE_LIMIT || 10); // Max 10 attempts/15min
const LOGIN_FAILED_LIMIT = Number(process.env.LOGIN_FAILED_LIMIT || 5); // Max 5 failed înainte de blocare

// Progressive lockout: 1h -> 24h -> 7 zile -> permanent
const LOCKOUT_DURATIONS_HOURS = [1, 24, 168, null]; // null = permanent

/**
 * Obține IP-ul din request
 */
function getClientIp(req: any): string {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

/**
 * Verifică dacă IP-ul poate înregistra (rate limit)
 */
async function checkRegistrationLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = await getRedisClient();
    if (redis && redis.isOpen) {
      const key = `registration:${ip}`;
      const windowSeconds = 24 * 60 * 60; // 24 ore

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const remaining = Math.max(0, REGISTRATION_RATE_LIMIT - count);

      return {
        allowed: count <= REGISTRATION_RATE_LIMIT,
        remaining,
      };
    }
  } catch (error) {
    // Redis nu e disponibil, folosim fallback la DB (silent în production)
  }
  
  // Fallback la DB dacă Redis nu e disponibil
  const count = await prisma.registrationAttempt.count({
    where: {
      ipAddress: ip,
      success: true,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Ultimele 24h
      },
    },
  });

  return {
    allowed: count < REGISTRATION_RATE_LIMIT,
    remaining: Math.max(0, REGISTRATION_RATE_LIMIT - count),
  };
}

/**
 * Verifică dacă IP-ul poate încerca login (rate limit)
 */
async function checkLoginLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = await getRedisClient();
    if (redis && redis.isOpen) {
      const key = `login:${ip}`;
      const windowSeconds = 15 * 60; // 15 minute

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const remaining = Math.max(0, LOGIN_RATE_LIMIT - count);

      return {
        allowed: count <= LOGIN_RATE_LIMIT,
        remaining,
      };
    }
  } catch (error) {
    // Redis nu e disponibil, folosim fallback la DB (silent în production)
  }
  
  // Fallback la DB dacă Redis nu e disponibil
  const count = await prisma.loginAttempt.count({
    where: {
      ipAddress: ip,
      createdAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000), // Ultimele 15 min
      },
    },
  });

  return {
    allowed: count < LOGIN_RATE_LIMIT,
    remaining: Math.max(0, LOGIN_RATE_LIMIT - count),
  };
}

/**
 * Verifică dacă IP-ul este blacklistat
 */
async function isIpBlacklisted(ip: string): Promise<boolean> {
  const blacklist = await prisma.ipBlacklist.findFirst({
    where: {
      ipAddress: ip,
      OR: [
        { expiresAt: null }, // Permanent
        { expiresAt: { gt: new Date() } }, // Nu a expirat
      ],
    },
  });

  return !!blacklist;
}

/**
 * Blochează un IP (temporar sau permanent)
 */
async function blockIp(ip: string, reason?: string, durationHours?: number): Promise<void> {
  const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;

  await prisma.ipBlacklist.upsert({
    where: { ipAddress: ip },
    update: {
      reason,
      expiresAt,
      blockedAt: new Date(),
    },
    create: {
      ipAddress: ip,
      reason,
      expiresAt,
    },
  });
}

/**
 * Obține numărul de înregistrări recente de la un IP
 */
async function getRecentRegistrationsFromIp(ip: string, hours: number = 24): Promise<number> {
  return prisma.registrationAttempt.count({
    where: {
      ipAddress: ip,
      success: true,
      createdAt: {
        gte: new Date(Date.now() - hours * 60 * 60 * 1000),
      },
    },
  });
}

/**
 * Salvează registration attempt în DB
 */
async function recordRegistrationAttempt(
  email: string,
  ip: string,
  userAgent: string | undefined,
  success: boolean,
  failureReason?: string,
  captchaScore?: number
): Promise<void> {
  try {
    await prisma.registrationAttempt.create({
      data: {
        email,
        ipAddress: ip,
        userAgent,
        success,
        failureReason,
        captchaScore,
      },
    });
  } catch (error) {
    logger.error("Error recording registration attempt", error);
  }
}

/**
 * Salvează login attempt în DB
 */
async function recordLoginAttempt(
  email: string | undefined,
  ip: string,
  userAgent: string | undefined,
  success: boolean,
  failureReason?: string
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        email: email || null,
        ipAddress: ip,
        userAgent,
        success,
        failureReason,
      },
    });
  } catch (error) {
    logger.error("Error recording login attempt", error);
  }
}

/**
 * Verifică dacă există pattern suspect (multiple conturi de la același IP)
 */
async function checkSuspiciousPattern(ip: string): Promise<{ suspicious: boolean; count: number }> {
  const count = await getRecentRegistrationsFromIp(ip, 24);
  // Dacă > 3 conturi în 24h de la același IP = suspect
  return {
    suspicious: count > 3,
    count,
  };
}

/**
 * Obține numărul de blocări anterioare pentru un IP (pentru progressive lockout)
 */
async function getPreviousBlockCount(ip: string): Promise<number> {
  // Numără câte blocări a avut IP-ul în ultimele 30 de zile
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const blocks = await prisma.ipBlacklist.findMany({
    where: {
      ipAddress: ip,
      blockedAt: { gte: thirtyDaysAgo },
    },
  });
  
  return blocks.length;
}

/**
 * Verifică failed login attempts și blochează IP cu progressive lockout
 * Prima blocare: 1 oră
 * A doua blocare: 24 ore
 * A treia blocare: 7 zile
 * A patra+ blocare: permanent
 */
async function checkAndBlockFailedLogins(ip: string): Promise<boolean> {
  const failedCount = await prisma.loginAttempt.count({
    where: {
      ipAddress: ip,
      success: false,
      createdAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000), // Ultimele 15 min
      },
    },
  });

  if (failedCount >= LOGIN_FAILED_LIMIT) {
    // Progressive lockout
    const previousBlocks = await getPreviousBlockCount(ip);
    const lockoutIndex = Math.min(previousBlocks, LOCKOUT_DURATIONS_HOURS.length - 1);
    const lockoutDuration = LOCKOUT_DURATIONS_HOURS[lockoutIndex];
    
    const reason = lockoutDuration 
      ? `Prea multe încercări eșuate (${failedCount}). Blocare ${lockoutIndex + 1}: ${lockoutDuration}h`
      : `Prea multe încercări eșuate (${failedCount}). Blocare permanentă.`;
    
    await blockIp(ip, reason, lockoutDuration ?? undefined);
    
    logger.warn("IP blocked due to failed logins", { 
      ip, 
      failedCount, 
      blockNumber: lockoutIndex + 1,
      duration: lockoutDuration ? `${lockoutDuration}h` : "permanent"
    });
    
    return true; // IP blocat
  }

  return false;
}

module.exports = {
  getClientIp,
  checkRegistrationLimit,
  checkLoginLimit,
  isIpBlacklisted,
  blockIp,
  getRecentRegistrationsFromIp,
  recordRegistrationAttempt,
  recordLoginAttempt,
  checkSuspiciousPattern,
  checkAndBlockFailedLogins,
  getPreviousBlockCount,
};

