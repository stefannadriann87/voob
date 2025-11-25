import { PaymentMethod, Role } from "@prisma/client";

const prisma = require("../../lib/prisma").default;
const { upsertSettings } = require("../../services/settingsService");
const { logSystemAction } = require("../../services/auditService");

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

  return subscriptions.map((sub) => ({
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

  const businessIds = Array.from(new Set(payments.map((p) => p.businessId))).filter(Boolean) as string[];
  const businessMap = new Map(
    (
      await prisma.business.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, name: true },
      })
    ).map((business) => [business.id, business.name])
  );

  const aggregated: Record<
    string,
    {
      businessId: string;
      businessName: string;
      totalProcessed: number;
      applicationFee: number;
      methods: Record<PaymentMethod, number>;
    }
  > = {};

  for (const payment of payments) {
    if (!payment.businessId) continue;
    if (!aggregated[payment.businessId]) {
      aggregated[payment.businessId] = {
        businessId: payment.businessId,
        businessName: businessMap.get(payment.businessId) ?? "Business",
        totalProcessed: 0,
        applicationFee: 0,
        methods: {
          CARD: 0,
          APPLE_PAY: 0,
          GOOGLE_PAY: 0,
          KLARNA: 0,
          OFFLINE: 0,
        },
      };
    }
    aggregated[payment.businessId].totalProcessed += payment._sum.amount ?? 0;
    aggregated[payment.businessId].applicationFee += payment._sum.applicationFee ?? 0;
    if (payment.method) {
      aggregated[payment.businessId].methods[payment.method] += payment._sum.amount ?? 0;
    }
  }

  return Object.values(aggregated);
}

async function getPlatformSettings() {
  const settings = await prisma.platformSetting.findMany({
    orderBy: { key: "asc" },
  });
  return settings.map((setting) => ({
    key: setting.key,
    value: setting.value,
    description: setting.description,
    updatedAt: setting.updatedAt.toISOString(),
  }));
}

async function updatePlatformSettings(
  settings: { key: string; value: string; description?: string }[],
  actor: { id?: string; role?: Role }
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

  return logs.map((log) => ({
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

