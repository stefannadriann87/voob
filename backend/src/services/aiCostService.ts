/**
 * AI Cost Tracking Service
 * Gestionează limitele de cost și alerts pentru AI usage
 */

const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

const DAILY_COST_LIMIT_PER_BUSINESS = Number(process.env.AI_DAILY_COST_LIMIT_BUSINESS || 10); // $10/day per business
const DAILY_COST_LIMIT_PER_USER = Number(process.env.AI_DAILY_COST_LIMIT_USER || 5); // $5/day per user
const MONTHLY_COST_LIMIT_PER_BUSINESS = Number(process.env.AI_MONTHLY_COST_LIMIT_BUSINESS || 200); // $200/month per business
const COST_ALERT_THRESHOLD = Number(process.env.AI_COST_ALERT_THRESHOLD || 0.8); // Alert la 80% din limită

/**
 * Verifică dacă un business a depășit limita de cost zilnică
 */
async function checkDailyCostLimit(businessId: string | null): Promise<{
  allowed: boolean;
  currentCost: number;
  limit: number;
  remaining: number;
}> {
  if (!businessId) {
    return { allowed: true, currentCost: 0, limit: Infinity, remaining: Infinity };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usage = await prisma.aiUsageLog.aggregate({
    where: {
      businessId,
      createdAt: {
        gte: today,
      },
    },
    _sum: {
      costEstimate: true,
    },
  });

  const currentCost = usage._sum.costEstimate || 0;
  const limit = DAILY_COST_LIMIT_PER_BUSINESS;
  const remaining = Math.max(0, limit - currentCost);
  const allowed = currentCost < limit;

  // Alert dacă s-a atins threshold-ul
  if (currentCost >= limit * COST_ALERT_THRESHOLD) {
    logger.warn(`⚠️  AI cost alert for business ${businessId}: $${currentCost.toFixed(2)} / $${limit} (${((currentCost / limit) * 100).toFixed(1)}%)`);
  }

  return { allowed, currentCost, limit, remaining };
}

/**
 * Verifică dacă un user a depășit limita de cost zilnică
 */
async function checkUserDailyCostLimit(userId: string): Promise<{
  allowed: boolean;
  currentCost: number;
  limit: number;
  remaining: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const usage = await prisma.aiUsageLog.aggregate({
    where: {
      userId,
      createdAt: {
        gte: today,
      },
    },
    _sum: {
      costEstimate: true,
    },
  });

  const currentCost = usage._sum.costEstimate || 0;
  const limit = DAILY_COST_LIMIT_PER_USER;
  const remaining = Math.max(0, limit - currentCost);
  const allowed = currentCost < limit;

  // Alert dacă s-a atins threshold-ul
  if (currentCost >= limit * COST_ALERT_THRESHOLD) {
    logger.warn(`⚠️  AI cost alert for user ${userId}: $${currentCost.toFixed(2)} / $${limit} (${((currentCost / limit) * 100).toFixed(1)}%)`);
  }

  return { allowed, currentCost, limit, remaining };
}

/**
 * Verifică dacă un business a depășit limita de cost lunară
 */
async function checkMonthlyCostLimit(businessId: string | null): Promise<{
  allowed: boolean;
  currentCost: number;
  limit: number;
  remaining: number;
}> {
  if (!businessId) {
    return { allowed: true, currentCost: 0, limit: Infinity, remaining: Infinity };
  }

  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const usage = await prisma.aiUsageLog.aggregate({
    where: {
      businessId,
      createdAt: {
        gte: firstDayOfMonth,
      },
    },
    _sum: {
      costEstimate: true,
    },
  });

  const currentCost = usage._sum.costEstimate || 0;
  const limit = MONTHLY_COST_LIMIT_PER_BUSINESS;
  const remaining = Math.max(0, limit - currentCost);
  const allowed = currentCost < limit;

  // Alert dacă s-a atins threshold-ul
  if (currentCost >= limit * COST_ALERT_THRESHOLD) {
    logger.warn(`⚠️  AI monthly cost alert for business ${businessId}: $${currentCost.toFixed(2)} / $${limit} (${((currentCost / limit) * 100).toFixed(1)}%)`);
  }

  return { allowed, currentCost, limit, remaining };
}

/**
 * Verifică toate limitele de cost pentru un user/business
 */
async function checkAllCostLimits(userId: string, businessId: string | null): Promise<{
  allowed: boolean;
  reason?: string;
  limits: {
    userDaily: { allowed: boolean; currentCost: number; limit: number; remaining: number };
    businessDaily: { allowed: boolean; currentCost: number; limit: number; remaining: number };
    businessMonthly: { allowed: boolean; currentCost: number; limit: number; remaining: number };
  };
}> {
  const [userDaily, businessDaily, businessMonthly] = await Promise.all([
    checkUserDailyCostLimit(userId),
    checkDailyCostLimit(businessId),
    checkMonthlyCostLimit(businessId),
  ]);

  const allowed = userDaily.allowed && businessDaily.allowed && businessMonthly.allowed;
  let reason: string | undefined;

  if (!userDaily.allowed) {
    reason = `Limita zilnică de cost pentru user a fost depășită: $${userDaily.currentCost.toFixed(2)} / $${userDaily.limit}`;
  } else if (!businessDaily.allowed) {
    reason = `Limita zilnică de cost pentru business a fost depășită: $${businessDaily.currentCost.toFixed(2)} / $${businessDaily.limit}`;
  } else if (!businessMonthly.allowed) {
    reason = `Limita lunară de cost pentru business a fost depășită: $${businessMonthly.currentCost.toFixed(2)} / $${businessMonthly.limit}`;
  }

  return {
    allowed,
    reason,
    limits: {
      userDaily,
      businessDaily,
      businessMonthly,
    },
  };
}

module.exports = {
  checkDailyCostLimit,
  checkUserDailyCostLimit,
  checkMonthlyCostLimit,
  checkAllCostLimits,
  DAILY_COST_LIMIT_PER_BUSINESS,
  DAILY_COST_LIMIT_PER_USER,
  MONTHLY_COST_LIMIT_PER_BUSINESS,
};
