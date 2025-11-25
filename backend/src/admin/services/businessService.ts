import bcrypt = require("bcryptjs");
import { BusinessStatus, PaymentMethod, Role } from "@prisma/client";

const prisma = require("../../lib/prisma").default;
const { logSystemAction } = require("../../services/auditService");
import type { BusinessDetail, BusinessOverviewItem } from "../types";

const TEMP_PASSWORD_LENGTH = 12;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%";
  let result = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function listBusinessesOverview(): Promise<BusinessOverviewItem[]> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      currentPlan: { select: { name: true, price: true } },
      subscriptions: {
        orderBy: { currentPeriodStart: "desc" },
        take: 1,
        select: {
          status: true,
          currentPeriodEnd: true,
          amount: true,
        },
      },
    },
  });

  const businessIds = businesses.map((b) => b.id);

  if (businessIds.length === 0) {
    return [];
  }

  const [bookingCounts, smsCounts, aiCounts] = await Promise.all([
    prisma.booking.groupBy({
      by: ["businessId"],
      where: { businessId: { in: businessIds }, date: { gte: startOfMonth } },
      _count: { _all: true },
    }),
    prisma.smsUsageLog.groupBy({
      by: ["businessId"],
      where: { businessId: { in: businessIds }, createdAt: { gte: startOfMonth } },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["businessId"],
      where: { businessId: { in: businessIds }, createdAt: { gte: startOfMonth } },
      _count: { _all: true },
    }),
  ]);

  const mapCounts = (entries: any[]) =>
    new Map(entries.map((entry) => [entry.businessId, entry._count._all]));

  const bookingsMap = mapCounts(bookingCounts);
  const smsMap = mapCounts(smsCounts);
  const aiMap = mapCounts(aiCounts);

  return businesses.map((business) => {
    const subscription = business.subscriptions[0];
    return {
      id: business.id,
      name: business.name,
      status: business.status,
      createdAt: business.createdAt.toISOString(),
      plan: business.currentPlan
        ? {
            name: business.currentPlan.name,
            price: business.currentPlan.price,
          }
        : null,
      subscriptionStatus: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      monthlyBookings: bookingsMap.get(business.id) ?? 0,
      monthlySms: smsMap.get(business.id) ?? 0,
      monthlyAi: aiMap.get(business.id) ?? 0,
    };
  });
}

async function getBusinessDetails(businessId: string): Promise<BusinessDetail> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      domain: true,
      status: true,
      businessType: true,
      workingHours: true,
      createdAt: true,
      holidays: { select: { id: true } },
      currentPlan: { select: { name: true, price: true } },
    },
  });

  if (!business) {
    throw new Error("Business-ul nu a fost găsit.");
  }

  const [subscription, invoices, paymentSummary, bookingStats, smsUsage, aiUsage] = await Promise.all([
    prisma.subscription.findFirst({
      where: { businessId },
      orderBy: { currentPeriodStart: "desc" },
      select: {
        status: true,
        amount: true,
        billingMethod: true,
        currentPeriodEnd: true,
        plan: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { businessId },
      orderBy: { issuedAt: "desc" },
      take: 10,
      select: {
        id: true,
        amount: true,
        status: true,
        paymentMethod: true,
        issuedAt: true,
      },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { businessId, status: "SUCCEEDED" },
      _sum: { amount: true, applicationFee: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { businessId },
      _count: { _all: true },
    }),
    prisma.smsUsageLog.count({ where: { businessId } }),
    prisma.aiUsageLog.count({ where: { businessId } }),
  ]);

  const bookingsTotal = bookingStats.reduce((sum, entry) => sum + entry._count._all, 0);
  const cancelled =
    bookingStats.find((entry) => entry.status === "CANCELLED")?._count._all ?? 0;
  const confirmed =
    bookingStats.find((entry) => entry.status === "CONFIRMED")?._count._all ?? 0;

  return {
    business: {
      id: business.id,
      name: business.name,
      domain: business.domain,
      status: business.status,
      businessType: business.businessType,
      createdAt: business.createdAt.toISOString(),
    },
    subscription: subscription
      ? {
          planName: subscription.plan?.name ?? business.currentPlan?.name ?? "Plan",
          status: subscription.status,
          amount: subscription.amount,
          billingMethod: subscription.billingMethod,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        }
      : null,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      amount: invoice.amount,
      status: invoice.status,
      paymentMethod: invoice.paymentMethod,
      issuedAt: invoice.issuedAt.toISOString(),
    })),
    payments: {
      totalProcessed: paymentSummary.reduce((sum, entry) => sum + (entry._sum.amount ?? 0), 0),
      applicationFee: paymentSummary.reduce(
        (sum, entry) => sum + (entry._sum.applicationFee ?? 0),
        0
      ),
      methods: paymentSummary.reduce<Record<string, number>>((acc, entry) => {
        if (!entry.method) return acc;
        acc[entry.method] = entry._sum.amount ?? 0;
        return acc;
      }, {}),
    },
    bookings: {
      total: bookingsTotal,
      confirmed,
      cancelled,
      currentMonth: await prisma.booking.count({
        where: {
          businessId,
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    },
    usage: {
      smsTotal: smsUsage,
      smsMonth: await prisma.smsUsageLog.count({
        where: {
          businessId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      aiTotal: aiUsage,
      aiMonth: await prisma.aiUsageLog.count({
        where: {
          businessId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    },
    configuration: {
      workingHours: business.workingHours,
      holidays: business.holidays.length,
    },
  };
}

async function updateBusinessStatus(
  businessId: string,
  status: BusinessStatus,
  actor: { id?: string; role?: Role }
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, status: true, name: true },
  });

  if (!business) {
    throw new Error("Business-ul nu există.");
  }

  if (business.status === status) {
    return;
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { status },
  });

  await logSystemAction({
    actorId: actor.id,
    actorRole: actor.role,
    action: "BUSINESS_STATUS_UPDATE",
    entity: "BUSINESS",
    entityId: businessId,
    before: { status: business.status },
    after: { status },
  });
}

async function resetOwnerPassword(
  businessId: string,
  actor: { id?: string; role?: Role }
): Promise<{ temporaryPassword: string }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business?.ownerId) {
    throw new Error("Business-ul nu are un owner asociat.");
  }

  const owner = await prisma.user.findUnique({ where: { id: business.ownerId } });
  if (!owner) {
    throw new Error("Contul owner nu a fost găsit.");
  }

  const temporaryPassword = generateTempPassword();
  const hashed = await bcrypt.hash(temporaryPassword, 10);

  await prisma.user.update({
    where: { id: owner.id },
    data: { password: hashed },
  });

  await logSystemAction({
    actorId: actor.id,
    actorRole: actor.role,
    action: "OWNER_PASSWORD_RESET",
    entity: "USER",
    entityId: owner.id,
    before: null,
    after: { businessId },
  });

  return { temporaryPassword };
}

module.exports = {
  listBusinessesOverview,
  getBusinessDetails,
  updateBusinessStatus,
  resetOwnerPassword,
};

