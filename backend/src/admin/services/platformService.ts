const { Role, PaymentMethod } = require("@prisma/client");
type PaymentMethodEnum = (typeof PaymentMethod)[keyof typeof PaymentMethod];
type RoleEnum = (typeof Role)[keyof typeof Role];

type AggregatedPaymentStats = {
  businessId: string;
  businessName: string;
  totalProcessed: number;
  applicationFee: number;
  methods: Record<PaymentMethodEnum, number>;
};

function buildEmptyMethodBuckets(): Record<PaymentMethodEnum, number> {
  const buckets = {} as Record<PaymentMethodEnum, number>;
  Object.values(PaymentMethod).forEach((method) => {
    buckets[method as PaymentMethodEnum] = 0;
  });
  return buckets;
}

function createAggregatedPayment(businessId: string, businessName: string): AggregatedPaymentStats {
  return {
    businessId,
    businessName,
    totalProcessed: 0,
    applicationFee: 0,
    methods: buildEmptyMethodBuckets(),
  };
}

const prisma = require("../../lib/prisma");
const { upsertSettings } = require("../../services/settingsService");
const { logSystemAction } = require("../../services/auditService");
const { logger } = require("../../lib/logger");

async function listSubscriptions() {
  const subscriptions = await prisma.subscription.findMany({
    orderBy: { currentPeriodStart: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      amount: true,
      billingMethod: true,
      currentPeriodEnd: true,
      business: { select: { id: true, name: true } },
      plan: { select: { name: true } },
    },
  });

  return subscriptions.map((sub: typeof subscriptions[number]) => ({
    id: sub.id,
    businessId: sub.business.id,
    businessName: sub.business.name,
    planName: sub.plan.name,
    amount: sub.amount,
    billingMethod: sub.billingMethod,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
  }));
}

async function listPlatformPayments() {
  const payments = await prisma.payment.groupBy({
    by: ["businessId", "method"],
    where: { status: "SUCCEEDED" },
    _sum: { amount: true, applicationFee: true },
  });

  const businessIds = Array.from(new Set(payments.map((p: typeof payments[number]) => p.businessId))).filter(Boolean) as string[];
  const businessTuples = (
    await prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, name: true },
    })
  ).map((business: { id: string; name: string }) => [business.id, business.name] as [string, string]);
  const businessMap = new Map<string, string>(businessTuples);

  const aggregated: Record<string, AggregatedPaymentStats> = {};

  for (const payment of payments as Array<typeof payments[number]>) {
    if (!payment.businessId) continue;
    const stats =
      aggregated[payment.businessId] ??
      (aggregated[payment.businessId] = createAggregatedPayment(
        payment.businessId,
        businessMap.get(payment.businessId) ?? "Business"
      ));
    stats.totalProcessed += payment._sum.amount ?? 0;
    stats.applicationFee += payment._sum.applicationFee ?? 0;
    if (payment.method) {
      const method = payment.method as PaymentMethodEnum;
      stats.methods[method] = (stats.methods[method] ?? 0) + (payment._sum.amount ?? 0);
    }
  }

  return Object.values(aggregated);
}

async function getPlatformSettings() {
  try {
    const settings = await prisma.platformSettings.findMany({
      orderBy: { key: "asc" },
    });
    return settings.map((setting: typeof settings[number]) => ({
      key: setting.key,
      value: setting.value,
      description: setting.description,
      updatedAt: setting.updatedAt.toISOString(),
    }));
  } catch (error: any) {
    logger.error("Error fetching platform settings:", error);
    // If table doesn't exist or is empty, return empty array
    if (error.message?.includes("does not exist") || error.message?.includes("Unknown table")) {
      logger.warn("PlatformSettings table does not exist, returning empty array");
      return [];
    }
    throw error;
  }
}

async function updatePlatformSettings(
  settings: { key: string; value: string; description?: string }[],
  actor: { id?: string; role?: RoleEnum }
) {
  await upsertSettings(settings);
  await logSystemAction({
    actorId: actor.id,
    actorRole: actor.role,
    action: "PLATFORM_SETTINGS_UPDATE",
    entity: "PLATFORM_SETTING",
    entityId: settings.map((s) => s.key).join(","),
    after: settings,
  });
}

async function getSystemLogs(limit: number = 50) {
  const logs = await prisma.systemAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((log: typeof logs[number]) => ({
    id: log.id,
    actorId: log.actorId,
    actorRole: log.actorRole,
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
    createdAt: log.createdAt.toISOString(),
    before: log.before,
    after: log.after,
  }));
}

module.exports = {
  listSubscriptions,
  listPlatformPayments,
  getPlatformSettings,
  updatePlatformSettings,
  getSystemLogs,
};

