/// <reference types="node" />

import bcrypt from "bcryptjs";
import * as prismaClient from "@prisma/client";

const {
  PrismaClient,
  Role,
  BusinessStatus,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
  InvoiceStatus,
  SmsUsageType,
} = prismaClient;
const prisma = new PrismaClient();

async function seed() {
  // Prevent running in production
  const nodeEnv = process.env.NODE_ENV || process.env.ENVIRONMENT;
  if (nodeEnv === "production" || nodeEnv === "prod") {
    console.error("❌ ERROR: This seed script cannot run in production environment!");
    console.error("   Set NODE_ENV=development to run this script.");
    process.exit(1);
  }

  // Warn if not explicitly in development
  if (!nodeEnv || (nodeEnv !== "development" && nodeEnv !== "dev" && nodeEnv !== "test")) {
    console.warn("⚠️  WARNING: NODE_ENV is not set to 'development' or 'test'");
    console.warn("   This script is intended for development/testing only.");
    console.warn("   Continuing anyway, but please verify you're not in production...\n");
  }

  const defaultPasswordPlain = "Password123!";
  const superAdminEmail = "stefann.adriann@gmail.com";
  const superAdminPasswordPlain = "Develop13#";

  const hashedSuperAdminPassword = await bcrypt.hash(superAdminPasswordPlain, 10);
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordPlain, 10);

  const [proPlan, businessPlan] = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: "VOOB PRO" },
      update: {
        price: 149,
        smsIncluded: 150,
        maxEmployees: 1,
        description: "Plan de bază cu 1 utilizator și 150 SMS/lună",
      },
      create: {
        name: "VOOB PRO",
        price: 149,
        currency: "RON",
        billingCycle: "MONTHLY",
        smsIncluded: 150,
        maxEmployees: 1, // 1 utilizator business (doar owner, fără angajați adiționali)
        description: "Plan de bază cu 1 utilizator și 150 SMS/lună",
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: "VOOB BUSINESS" },
      update: {
        price: 299,
        smsIncluded: 500,
        maxEmployees: 5,
        description: "Plan premium cu 5 utilizatori și 500 SMS/lună",
      },
      create: {
        name: "VOOB BUSINESS",
        price: 299,
        currency: "RON",
        billingCycle: "MONTHLY",
        smsIncluded: 500,
        maxEmployees: 5, // 5 utilizatori incluși (owner + 4 angajați)
        description: "Plan premium cu 5 utilizatori și 500 SMS/lună",
      },
    }),
  ]);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: "VOOB SuperAdmin",
      password: hashedSuperAdminPassword,
      role: Role.SUPERADMIN,
    },
  });

  const businessOwner = await prisma.user.upsert({
    where: { email: "owner@freshcuts.app" },
    update: {},
    create: {
      email: "owner@freshcuts.app",
      name: "Andrei Business",
      password: hashedDefaultPassword,
      role: Role.BUSINESS,
    },
  });

  const barberBusiness = await prisma.business.upsert({
    where: { domain: "fresh-cuts" },
    update: {
      currentPlanId: proPlan.id,
      status: BusinessStatus.ACTIVE,
    },
    create: {
      name: "Fresh Cuts Studio",
      email: "contact@freshcuts.app",
      domain: "fresh-cuts",
      owner: { connect: { id: businessOwner.id } },
      employees: { connect: { id: businessOwner.id } },
      services: {
        create: [
          { name: "Tuns bărbați", duration: 45, price: 120 },
          { name: "Styling premium", duration: 60, price: 180 },
        ],
      },
      status: BusinessStatus.ACTIVE,
      currentPlan: { connect: { id: proPlan.id } },
    },
    include: { services: true },
  });

  const dentistOwner = await prisma.user.upsert({
    where: { email: "dentist@voob.io" },
    update: {},
    create: {
      email: "dentist@voob.io",
      name: "Dr. Alex Dentist",
      password: hashedDefaultPassword,
      role: Role.BUSINESS,
    },
  });

  const dentistBusiness = await prisma.business.upsert({
    where: { domain: "smile-care" },
    update: {
      currentPlanId: businessPlan.id,
      status: BusinessStatus.ACTIVE,
    },
    create: {
      name: "Smile Care Dental",
      email: "contact@smilecare.app",
      domain: "smile-care",
      owner: { connect: { id: dentistOwner.id } },
      employees: { connect: { id: dentistOwner.id } },
      services: {
        create: [
          { name: "Consultație stomatologică", duration: 30, price: 150 },
          { name: "Albire profesională", duration: 60, price: 400 },
        ],
      },
      status: BusinessStatus.ACTIVE,
      currentPlan: { connect: { id: proPlan.id } },
    },
    include: { services: true },
  });

  const employee = await prisma.user.upsert({
    where: { email: "employee@freshcuts.app" },
    update: {
      businessId: barberBusiness.id,
    },
    create: {
      email: "employee@freshcuts.app",
      name: "Ioana Employee",
      password: hashedDefaultPassword,
      role: Role.EMPLOYEE,
      businessId: barberBusiness.id,
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@voob.io" },
    update: {},
    create: {
      email: "client@voob.io",
      name: "Mihai Client",
      password: hashedDefaultPassword,
      role: Role.CLIENT,
    },
  });

  await prisma.clientBusinessLink.upsert({
    where: {
      clientId_businessId: {
        clientId: client.id,
        businessId: barberBusiness.id,
      },
    },
    update: {},
    create: {
      clientId: client.id,
      businessId: barberBusiness.id,
      method: "seed",
    },
  });

  await prisma.clientBusinessLink.upsert({
    where: {
      clientId_businessId: {
        clientId: client.id,
        businessId: dentistBusiness.id,
      },
    },
    update: {},
    create: {
      clientId: client.id,
      businessId: dentistBusiness.id,
      method: "seed",
    },
  });

  const firstService = barberBusiness.services?.[0];
  let barberBooking: Awaited<ReturnType<typeof prisma.booking.create>> | null = null;
  let barberServicePrice = 0;
  if (firstService) {
    barberServicePrice = firstService.price;
    barberBooking = await prisma.booking.create({
      data: {
        client: { connect: { id: client.id } },
        business: { connect: { id: barberBusiness.id } },
        service: { connect: { id: firstService.id } },
        date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        paid: true,
      },
    });
  }

  const dentistService = dentistBusiness.services?.[0];
  let dentistBooking: Awaited<ReturnType<typeof prisma.booking.create>> | null = null;
  let dentistServicePrice = 0;
  if (dentistService) {
    dentistServicePrice = dentistService.price;
    dentistBooking = await prisma.booking.create({
      data: {
        client: { connect: { id: client.id } },
        business: { connect: { id: dentistBusiness.id } },
        service: { connect: { id: dentistService.id } },
        date: new Date(Date.now() + 1000 * 60 * 60 * 48),
        paid: false,
      },
    });
  }

  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const barberSubscription = await prisma.subscription.create({
    data: {
      businessId: barberBusiness.id,
      planId: proPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        billingMethod: PaymentMethod.CARD,
      amount: proPlan.price,
    },
  });

  const dentistSubscription = await prisma.subscription.create({
    data: {
      businessId: dentistBusiness.id,
      planId: proPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        billingMethod: PaymentMethod.APPLE_PAY,
      amount: proPlan.price,
    },
  });

  const [barberInvoice, dentistInvoice] = await Promise.all([
    prisma.invoice.create({
      data: {
        subscriptionId: barberSubscription.id,
        businessId: barberBusiness.id,
        amount: proPlan.price,
        paymentMethod: PaymentMethod.CARD,
        status: InvoiceStatus.PAID,
        applicationFee: proPlan.price * 0.08,
      },
    }),
    prisma.invoice.create({
      data: {
        subscriptionId: dentistSubscription.id,
        businessId: dentistBusiness.id,
        amount: proPlan.price,
        paymentMethod: PaymentMethod.APPLE_PAY,
        status: InvoiceStatus.PAID,
        applicationFee: proPlan.price * 0.08,
      },
    }),
  ]);

  await prisma.payment.createMany({
    data: [
      barberBooking
        ? {
            businessId: barberBusiness.id,
            bookingId: barberBooking.id,
            amount: barberServicePrice,
            method: PaymentMethod.CARD,
            status: PaymentStatus.SUCCEEDED,
            applicationFee: barberServicePrice * 0.08,
          }
        : undefined,
      dentistBooking
        ? {
            businessId: dentistBusiness.id,
            bookingId: dentistBooking.id,
            amount: dentistServicePrice,
            method: PaymentMethod.OFFLINE,
            status: PaymentStatus.SUCCEEDED,
            isCashSelfReported: true,
          }
        : undefined,
      {
        businessId: barberBusiness.id,
        invoiceId: barberInvoice.id,
        amount: proPlan.price,
        method: PaymentMethod.CARD,
        status: PaymentStatus.SUCCEEDED,
        applicationFee: proPlan.price * 0.08,
      },
      {
        businessId: dentistBusiness.id,
        invoiceId: dentistInvoice.id,
        amount: proPlan.price,
        method: PaymentMethod.APPLE_PAY,
        status: PaymentStatus.SUCCEEDED,
        applicationFee: proPlan.price * 0.08,
      },
    ].filter(Boolean) as any[],
  });

  await prisma.smsUsageLog.createMany({
    data: [
      { businessId: barberBusiness.id, type: SmsUsageType.CONFIRMATION, cost: 0.25 },
      { businessId: barberBusiness.id, type: SmsUsageType.REMINDER, cost: 0.25 },
      { businessId: dentistBusiness.id, type: SmsUsageType.DEMO, cost: 0.25 },
    ],
  });

  await prisma.aiUsageLog.createMany({
    data: [
      {
        businessId: barberBusiness.id,
        userId: businessOwner.id,
        userRole: Role.BUSINESS,
        toolName: "createBooking",
        tokensUsed: 1200,
        costEstimate: 0.012,
        statusCode: 200,
      },
      {
        businessId: dentistBusiness.id,
        userId: dentistOwner.id,
        userRole: Role.BUSINESS,
        toolName: "listBookings",
        tokensUsed: 900,
        costEstimate: 0.009,
        statusCode: 200,
      },
    ],
  });

  await prisma.platformSettings.upsert({
    where: { key: "sms_cost_per_message" },
    update: { value: "0.25" },
    create: { key: "sms_cost_per_message", value: "0.25", description: "Cost intern per SMS trimis" },
  });

  await prisma.platformSettings.upsert({
    where: { key: "openai_cost_per_1k_tokens" },
    update: { value: "0.015" },
    create: { key: "openai_cost_per_1k_tokens", value: "0.015", description: "Estimare cost OpenAI per 1k tokens" },
  });

  await prisma.platformSettings.upsert({
    where: { key: "platform_sla_percent" },
    update: { value: "99.92" },
    create: { key: "platform_sla_percent", value: "99.92", description: "SLA lunar raportat" },
  });

  await prisma.systemAuditLog.create({
    data: {
      actorId: superAdmin.id,
      actorRole: Role.SUPERADMIN,
      action: "SEED_INIT",
      entity: "PLATFORM",
      entityId: "bootstrap",
      after: {
        businessesSeeded: 2,
        subscriptionsSeeded: 2,
      },
    },
  });

  console.table([
    { role: "SUPERADMIN", email: superAdmin.email, password: superAdminPasswordPlain },
    { role: "BUSINESS", email: businessOwner.email, password: defaultPasswordPlain },
    { role: "BUSINESS", email: dentistOwner.email, password: defaultPasswordPlain },
    { role: "EMPLOYEE", email: employee.email, password: defaultPasswordPlain },
    { role: "CLIENT", email: client.email, password: defaultPasswordPlain },
  ]);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

