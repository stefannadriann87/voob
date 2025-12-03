import prismaClient = require("@prisma/client");
const { PrismaClient, BusinessType } = prismaClient;
const prisma = new PrismaClient();

/**
 * Șterge link-urile pentru business-urile de test și lasă doar cele reale
 * Usage: npx ts-node scripts/cleanupTestBusinesses.ts [clientEmail]
 */
async function cleanupTestBusinesses() {
  const clientEmail = process.argv[2] || "client@larstef.app";

  console.log(`\n🔍 Căutăm clientul: ${clientEmail}\n`);

  const client = await prisma.user.findFirst({
    where: { role: "CLIENT", email: clientEmail },
    select: { id: true, email: true, name: true },
  });

  if (!client) {
    console.error(`❌ Clientul cu email ${clientEmail} nu a fost găsit.`);
    console.log("\n💡 Clienți disponibili:");
    const allClients = await prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { email: true, name: true },
      take: 10,
    });
    allClients.forEach((c: any, i: number) => {
      console.log(`  ${i + 1}. ${c.email} (${c.name})`);
    });
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Client găsit: ${client.name} (${client.email})\n`);

  // Get all links
  const links = await prisma.clientBusinessLink.findMany({
    where: { clientId: client.id },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          businessType: true,
          domain: true,
          email: true,
        },
      },
    },
  });

  console.log(`📊 Total link-uri: ${links.length}\n`);

  // Identify test businesses
  const testBusinessIds: string[] = [];
  const realBusinessIds: string[] = [];

  links.forEach((link: any) => {
    const name = link.business.name.toLowerCase();
    const domain = link.business.domain.toLowerCase();
    const email = link.business.email?.toLowerCase() || "";

    const isTest =
      name.includes("test business") ||
      name.includes("payment test") ||
      name.includes("other business") ||
      domain.startsWith("test-") ||
      email.includes("@test.com");

    if (isTest) {
      testBusinessIds.push(link.business.id);
    } else {
      realBusinessIds.push(link.business.id);
    }
  });

  console.log(`🧪 Business-uri de test găsite: ${testBusinessIds.length}`);
  console.log(`✅ Business-uri reale: ${realBusinessIds.length}\n`);

  if (testBusinessIds.length === 0) {
    console.log("✅ Nu există business-uri de test de șters!\n");
    await prisma.$disconnect();
    return;
  }

  // Show some test businesses
  const testBusinesses = links.filter((link: any) =>
    testBusinessIds.includes(link.business.id)
  );
  console.log("📋 Business-uri de test care vor fi șterse (primele 10):");
  testBusinesses.slice(0, 10).forEach((link: any, i: number) => {
    console.log(
      `  ${i + 1}. ${link.business.name} (${link.business.businessType})`
    );
  });
  if (testBusinesses.length > 10) {
    console.log(`  ... și încă ${testBusinesses.length - 10}`);
  }

  // Show real businesses that will remain
  const realBusinesses = links.filter((link: any) =>
    realBusinessIds.includes(link.business.id)
  );
  console.log("\n✅ Business-uri reale care vor rămâne:");
  realBusinesses.forEach((link: any, i: number) => {
    console.log(
      `  ${i + 1}. ${link.business.name} (${link.business.businessType})`
    );
  });

  // Delete test business links
  console.log(`\n🗑️  Șterg ${testBusinessIds.length} link-uri pentru business-uri de test...`);

  const deleted = await prisma.clientBusinessLink.deleteMany({
    where: {
      clientId: client.id,
      businessId: { in: testBusinessIds },
    },
  });

  console.log(`✅ Șterse ${deleted.count} link-uri\n`);

  // Verify remaining links
  const remainingLinks = await prisma.clientBusinessLink.findMany({
    where: { clientId: client.id },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          businessType: true,
        },
      },
    },
  });

  console.log(`📊 Link-uri rămase: ${remainingLinks.length}`);
  console.log("\n📋 Business-uri rămase:");
  remainingLinks.forEach((link: any, i: number) => {
    console.log(
      `  ${i + 1}. ${link.business.name} (${link.business.businessType})`
    );
  });

  console.log("\n✅ Cleanup completat!\n");
}

cleanupTestBusinesses()
  .catch((error) => {
    console.error("❌ Eroare:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

