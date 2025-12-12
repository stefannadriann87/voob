/**
 * Refresh Token Service
 * Gestionează generarea și validarea refresh tokens
 */

const { randomBytes } = require("node:crypto");
const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

const REFRESH_TOKEN_EXPIRATION_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || 30); // 30 zile
const REFRESH_TOKEN_LENGTH = 64; // 64 bytes = 128 hex characters

/**
 * Generează un refresh token
 */
function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_LENGTH / 2).toString("hex");
}

/**
 * Creează un refresh token pentru un user
 */
async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRATION_DAYS);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  logger.debug(`Refresh token created for user ${userId}`);
  return token;
}

/**
 * Validează un refresh token
 */
async function validateRefreshToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  error?: string;
}> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token invalid" };
  }

  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, role: true } } },
  });

  if (!refreshToken) {
    return { valid: false, error: "Token nu a fost găsit" };
  }

  if (refreshToken.revoked) {
    return { valid: false, error: "Token a fost revocat" };
  }

  if (refreshToken.expiresAt < new Date()) {
    // Șterge token-ul expirat
    await prisma.refreshToken.delete({ where: { id: refreshToken.id } }).catch(() => {});
    return { valid: false, error: "Token expirat" };
  }

  return { valid: true, userId: refreshToken.userId };
}

/**
 * Revocă un refresh token
 */
async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { token },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });

  logger.debug(`Refresh token revoked: ${token.substring(0, 10)}...`);
}

/**
 * Revocă toate refresh tokens pentru un user (la logout sau schimbare parolă)
 */
async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revoked: false,
    },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });

  logger.debug(`All refresh tokens revoked for user ${userId}`);
}

/**
 * Șterge refresh tokens expirate (cleanup)
 */
async function cleanupExpiredRefreshTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  logger.debug(`Cleaned up ${result.count} expired refresh tokens`);
  return result.count;
}

module.exports = {
  generateRefreshToken,
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  cleanupExpiredRefreshTokens,
  REFRESH_TOKEN_EXPIRATION_DAYS,
};
