const prisma = require("../../lib/prisma");
const { getNumericSetting } = require("../../services/settingsService");
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
  const now = new Date();
  const [
    businesses,
    bookingsCount,
    payments,
    smsUsage,
    aiUsage,
    aiCostSetting,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.booking.count(),
    prisma.payment.groupBy({
      by: ["method"],
      where: { status: "SUCCEEDED" },
      _sum: { amount: true, applicationFee: true },
    }),
    prisma.smsUsageLog.count(),
    prisma.aiUsageLog.aggregate({
      _count: { _all: true },
      _sum: { costEstimate: true, tokensUsed: true },
    }),
    getNumericSetting("openai_cost_per_1k_tokens", 0.015),
  ]);

  const totalRevenue = payments.reduce(
    (sum: number, item: typeof payments[number]) => sum + (item._sum.amount ?? 0),
    0
  );
  const platformRevenue = payments.reduce(
    (sum: number, item: typeof payments[number]) => sum + (item._sum.applicationFee ?? 0),
    0
  );

  const smsCostPerMessage = await getNumericSetting("sms_cost_per_message", 0.25);
  const openAiCostEstimate =
    aiUsage._sum.costEstimate ??
    (((aiUsage._sum.tokensUsed ?? 0) / 1000) * aiCostSetting);

  const slaPercent = await getNumericSetting("platform_sla_percent", 99.9);

  return {
    totalBusinesses: businesses,
    activeBusinesses: await prisma.business.count({ where: { status: "ACTIVE" } }),
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
}

async function getAnalyticsOverview() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

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
    }),
    prisma.booking.groupBy({
      by: ["serviceId"],
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
      take: 5,
    }),
    prisma.payment.groupBy({
      by: ["method"],
      _sum: { amount: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const totalBookings = cancellations.reduce(
    (sum: number, item: typeof cancellations[number]) => sum + item._count._all,
    0
  );
  const cancelled =
    cancellations.find((item: typeof cancellations[number]) => item.status === "CANCELLED")?._count._all ?? 0;

  return {
    bookingsDaily: dailyBookings.map((entry: typeof dailyBookings[number]) => ({
      date: entry.date.toISOString().split("T")[0],
      count: entry._count._all,
    })),
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
}

async function getAiUsageOverview() {
  const [aggregate, topBusinesses, errors] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      _count: { _all: true },
      _sum: { costEstimate: true, tokensUsed: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["businessId"],
      _count: { _all: true },
      _sum: { tokensUsed: true },
      orderBy: { _count: { _all: "desc" } },
      take: 5,
    }),
    prisma.aiUsageLog.groupBy({
      by: ["statusCode"],
      _count: { _all: true },
      where: {
        statusCode: { not: 200 },
      },
    }),
  ]);

  const businessIds = topBusinesses.map((b: typeof topBusinesses[number]) => b.businessId).filter(Boolean) as string[];
  const businessNames = await prisma.business.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, name: true },
  });

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
}

module.exports = {
  getDashboardSummary,
  getAnalyticsOverview,
  getAiUsageOverview,
};

