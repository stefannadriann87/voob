/**
 * AI Rate Limiting Middleware
 * Rate limiting specific pentru endpoint-urile AI pentru a preveni abuz și costuri mari
 */

const { createRateLimiter } = require("./globalRateLimit");
const { logger } = require("../lib/logger");

// Rate limiter pentru AI: 50 requests per hour per user
const aiRateLimiter = createRateLimiter({
  max: Number(process.env.AI_RATE_LIMIT_MAX || 50),
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW || 60 * 60 * 1000), // 1 hour
  perPath: false, // Rate limit per IP/user
  methodsToLimit: ["POST"], // Doar POST requests
});

module.exports = { aiRateLimiter };
