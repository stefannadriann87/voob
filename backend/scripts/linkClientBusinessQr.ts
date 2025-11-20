/// <reference types="node" />

import prismaClient = require("@prisma/client");
import qrLib = require("../src/lib/qr");

const { PrismaClient } = prismaClient;
const prisma = new PrismaClient();
const generateBusinessQrDataUrl: (businessId: string) => Promise<{ dataUrl: string; payload: string }> =
  (qrLib as any).generateBusinessQrDataUrl;

const TARGET_DOMAINS = [
  "cabinet-stomatologic-dentist",
  "cabinet-avocat-ionescu",
  "salon-beauty-cosmetica",
  "salon-haircut-studio",
];

async function ensureQrAndLinkClient() {
  const clientEmail = process.env.CLIENT_EMAIL || "client@larstef.app";

  const client = await prisma.user.findUnique({
    where: { email: clientEmail },
    select: { id: true, email: true },
  });

  if (!client) {
    throw new Error(`Client with email ${clientEmail} not found.`);
  }

  const businesses = await prisma.business.findMany({
    where: { domain: { in: TARGET_DOMAINS } },
    select: { id: true, name: true, domain: true, qrCodeUrl: true },
  });

  if (businesses.length === 0) {
    console.warn("No target businesses found to update.");
    return;
  }

  const results: Array<{
    name: string;
    domain: string;
    qrUpdated: boolean;
    linkCreated: boolean;
  }> = [];

  for (const business of businesses) {
    let qrUpdated = false;
    let linkCreated = false;

    if (!business.qrCodeUrl) {
      const { dataUrl } = await generateBusinessQrDataUrl(business.id);
      await prisma.business.update({
        where: { id: business.id },
        data: { qrCodeUrl: dataUrl },
      });
      qrUpdated = true;
    }

    const link = await prisma.clientBusinessLink.upsert({
      where: {
        clientId_businessId: {
          clientId: client.id,
          businessId: business.id,
        },
      },
      update: {},
      create: {
        clientId: client.id,
        businessId: business.id,
      },
    });

    linkCreated = link.createdAt ? true : false;

    results.push({
      name: business.name,
      domain: business.domain,
      qrUpdated,
      linkCreated,
    });
  }

  console.table(
    results.map((item) => ({
      Business: item.name,
      Domain: item.domain,
      "QR Updated": item.qrUpdated ? "yes" : "existing",
      "Client Linked": item.linkCreated ? "created" : "existing",
    }))
  );
}

ensureQrAndLinkClient()
  .catch((error) => {
    console.error("Failed to update QR/client links:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


