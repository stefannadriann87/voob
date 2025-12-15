const prisma = require("../../lib/prisma");
const { getNumericSetting } = require("../../services/settingsService");
const { logger } = require("../../lib/logger");
import type { DashboardSummary } from "../types";

function buildPaymentDistribution(
  groups: Array<{ method: string | null; _sum: { amount: number | null } }>
): Record<string, number> {
  const distribution: Record<string, number> = {
    CARD: 0,
    OFFLINE: 0,
  };

  for (const entry of groups) {
    if (!entry.method) continue;
    if (!(entry.method in distribution)) continue;
    distribution[entry.method] = Number(entry._sum.amount ?? 0);
  }

  return distribution;
}

async function getDashboardSummary(): Promise<DashboardSummary> {
  try {
    const now = new Date();
    const [
      businesses,
      bookingsCount,
      payments,
      smsUsage,
      aiUsage,
      aiCostSetting,
    ] = await Promise.all([
      prisma.business.count().catch((err: any) => {
        logger.error("Error counting businesses", err);
        return 0;
      }),
      prisma.booking.count().catch((err: any) => {
        logger.error("Error counting bookings", err);
        return 0;
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { status: "SUCCEEDED" },
        _sum: { amount: true, applicationFee: true },
      }).catch((err: any) => {
        logger.error("Error grouping payments", err);
        return [];
      }),
      prisma.smsUsageLog.count().catch((err: any) => {
        logger.error("Error counting SMS usage", err);
        return 0;
      }),
      prisma.aiUsageLog.aggregate({
        _count: { _all: true },
        _sum: { costEstimate: true, tokensUsed: true },
      }).catch((err: any) => {
        logger.error("Error aggregating AI usage", err);
        return { _count: { _all: 0 }, _sum: { costEstimate: null, tokensUsed: null } };
      }),
      getNumericSetting("openai_cost_per_1k_tokens", 0.015).catch((err: any) => {
        logger.error("Error getting AI cost setting", err);
        return 0.015;
      }),
    ]);

    const totalRevenue = payments.reduce(
      (sum: number, item: typeof payments[number]) => sum + (item._sum.amount ?? 0),
      0
    );
    const platformRevenue = payments.reduce(
      (sum: number, item: typeof payments[number]) => sum + (item._sum.applicationFee ?? 0),
      0
    );

    const smsCostPerMessage = await getNumericSetting("sms_cost_per_message", 0.25).catch(() => 0.25);
    const openAiCostEstimate =
      aiUsage._sum.costEstimate ??
      (((aiUsage._sum.tokensUsed ?? 0) / 1000) * aiCostSetting);

    const slaPercent = await getNumericSetting("platform_sla_percent", 99.9).catch(() => 99.9);
    const activeBusinesses = await prisma.business.count({ where: { status: "ACTIVE" } }).catch(() => 0);

    return {
      totalBusinesses: businesses,
      activeBusinesses,
      totalBookings: bookingsCount,
      totalRevenue,
      platformRevenue,
      smsUsage: {
        totalMessages: smsUsage,
        estimatedCost: Number((smsUsage * smsCostPerMessage).toFixed(2)),
      },
      aiUsage: {
        totalRequests: aiUsage._count._all,
        estimatedCost: Number(openAiCostEstimate?.toFixed(4)),
      },
      paymentDistribution: buildPaymentDistribution(payments),
      slaPercent,
      generatedAt: now.toISOString(),
    };
  } catch (error: any) {
    logger.error("Error in getDashboardSummary", error);
    // Return default structure on error
    const now = new Date();
    return {
      totalBusinesses: 0,
      activeBusinesses: 0,
      totalBookings: 0,
      totalRevenue: 0,
      platformRevenue: 0,
      smsUsage: {
        totalMessages: 0,
        estimatedCost: 0,
      },
      aiUsage: {
        totalRequests: 0,
        estimatedCost: 0,
      },
      paymentDistribution: {
        CARD: 0,
        OFFLINE: 0,
      },
      slaPercent: 99.9,
      generatedAt: now.toISOString(),
    };
  }
}

async function getAnalyticsOverview() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  try {
    const [dailyBookings, serviceMix, paymentSplit, cancellations] = await Promise.all([
      prisma.booking.groupBy({
        by: ["date"],
        where: {
          date: {
            gte: thirtyDaysAgo,
          },
        },
        _count: { _all: true },
        orderBy: { date: "asc" },
      }).catch((err: any) => {
        logger.error("Error grouping bookings by date", err);
        return [];
      }),
      prisma.booking.groupBy({
        by: ["serviceId"],
        _count: { _all: true },
        orderBy: { _count: { _all: "desc" } },
        take: 5,
      }).catch((err: any) => {
        logger.error("Error grouping bookings by service", err);
        return [];
      }),
      prisma.payment.groupBy({
        by: ["method"],
        _sum: { amount: true },
      }).catch((err: any) => {
        logger.error("Error grouping payments by method", err);
        return [];
      }),
      prisma.booking.groupBy({
        by: ["status"],
        _count: { _all: true },
      }).catch((err: any) => {
        logger.error("Error grouping bookings by status", err);
        return [];
      }),
    ]);

    const totalBookings = cancellations.reduce(
      (sum: number, item: typeof cancellations[number]) => sum + item._count._all,
      0
    );
    const cancelled =
      cancellations.find((item: typeof cancellations[number]) => item.status === "CANCELLED")?._count._all ?? 0;

    // Group by date string to ensure uniqueness (in case of timezone issues)
    const dailyMap = new Map<string, number>();
    dailyBookings.forEach((entry: typeof dailyBookings[number]) => {
      const dateStr = entry.date.toISOString().split("T")[0];
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + entry._count._all);
    });

    return {
      bookingsDaily: Array.from(dailyMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      serviceMix: await Promise.all(
        serviceMix.map(async (entry: typeof serviceMix[number]) => {
          const service = await prisma.service.findUnique({
            where: { id: entry.serviceId },
            select: { name: true },
          });
          return {
            serviceName: service?.name ?? "Serviciu",
            count: entry._count._all,
          };
        })
      ),
      paymentSplit: paymentSplit.map((entry: typeof paymentSplit[number]) => ({
        method: entry.method,
        amount: entry._sum.amount ?? 0,
      })),
      cancellationRate: totalBookings === 0 ? 0 : Number(((cancelled / totalBookings) * 100).toFixed(2)),
    };
  } catch (error: any) {
    logger.error("Error in getAnalyticsOverview", error);
    // Return empty structure on error
    return {
      bookingsDaily: [],
      serviceMix: [],
      paymentSplit: [],
      cancellationRate: 0,
    };
  }
}

async function getAiUsageOverview() {
  try {
    const [aggregate, topBusinesses, errors] = await Promise.all([
      prisma.aiUsageLog.aggregate({
        _count: { _all: true },
        _sum: { costEstimate: true, tokensUsed: true },
      }).catch((err: any) => {
        logger.error("Error aggregating AI usage", err);
        return { _count: { _all: 0 }, _sum: { costEstimate: null, tokensUsed: null } };
      }),
      prisma.aiUsageLog.groupBy({
        by: ["businessId"],
        _count: { _all: true },
        _sum: { tokensUsed: true },
        orderBy: { _count: { _all: "desc" } },
        take: 5,
      }).catch((err: any) => {
        logger.error("Error grouping AI usage by business:", err);
        return [];
      }),
      prisma.aiUsageLog.groupBy({
        by: ["statusCode"],
        _count: { _all: true },
        where: {
          statusCode: { not: 200 },
        },
      }).catch((err: any) => {
        logger.error("Error grouping AI usage by status code:", err);
        return [];
      }),
    ]);

    const businessIds = topBusinesses.map((b: typeof topBusinesses[number]) => b.businessId).filter(Boolean) as string[];
    const businessNames = businessIds.length > 0 
      ? await prisma.business.findMany({
          where: { id: { in: businessIds } },
          select: { id: true, name: true },
        }).catch((err: any) => {
          logger.error("Error fetching business names", err);
          return [];
        })
      : [];

    const businessNameMap = new Map(
      businessNames.map((b: typeof businessNames[number]) => [b.id, b.name] as [string, string])
    );

    return {
      totalRequests: aggregate._count._all,
      estimatedCost: aggregate._sum.costEstimate ?? 0,
      tokensUsed: aggregate._sum.tokensUsed ?? 0,
      topBusinesses: topBusinesses.map((entry: typeof topBusinesses[number]) => ({
        businessId: entry.businessId,
        businessName: entry.businessId ? businessNameMap.get(entry.businessId) ?? "Business" : "N/A",
        requests: entry._count._all,
        tokens: entry._sum.tokensUsed ?? 0,
      })),
      errors: errors.map((entry: typeof errors[number]) => ({
        statusCode: entry.statusCode,
        count: entry._count._all,
      })),
    };
  } catch (error: any) {
    logger.error("Error in getAiUsageOverview", error);
    // Return empty structure on error
    return {
      totalRequests: 0,
      estimatedCost: 0,
      tokensUsed: 0,
      topBusinesses: [],
      errors: [],
    };
  }
}

module.exports = {
  getDashboardSummary,
  getAnalyticsOverview,
  getAiUsageOverview,
};

