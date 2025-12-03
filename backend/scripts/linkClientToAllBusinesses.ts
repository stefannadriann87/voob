import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

/**
 * Linkează un client la toate business-urile din sistem
 * Usage: npx ts-node scripts/linkClientToAllBusinesses.ts [clientEmail]
 */
async function linkClientToAllBusinesses() {
  const clientEmail = process.argv[2] || "client@larstef.app";

  console.log(`\n🔍 Căutăm clientul: ${clientEmail}\n`);

  const client = await prisma.user.findUnique({
    where: { email: clientEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!client) {
    console.error(`❌ Clientul cu email ${clientEmail} nu a fost găsit.`);
    console.log("\n💡 Clienți disponibili:");
    const allClients = await prisma.user.findMany({
      where: { role: Role.CLIENT },
      select: { email: true, name: true },
      take: 10,
    });
    allClients.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.email} (${c.name})`);
    });
    await prisma.$disconnect();
    process.exit(1);
  }

  if (client.role !== Role.CLIENT) {
    console.error(`❌ Utilizatorul ${clientEmail} nu este un CLIENT (rol: ${client.role})`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`✅ Client găsit: ${client.name} (${client.email})\n`);

  // Get all businesses
  const allBusinesses = await prisma.business.findMany({
    select: { id: true, name: true, email: true, domain: true },
    orderBy: { name: "asc" },
  });

  if (allBusinesses.length === 0) {
    console.log("⚠️ Nu există business-uri în sistem.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📋 Găsite ${allBusinesses.length} business-uri:\n`);

  // Check existing links
  const existingLinks = await prisma.clientBusinessLink.findMany({
    where: { clientId: client.id },
    select: { businessId: true },
  });
  const existingBusinessIds = new Set(existingLinks.map((link) => link.businessId));

  // Create links for all businesses
  const results = [];
  for (const business of allBusinesses) {
    const alreadyLinked = existingBusinessIds.has(business.id);
    
    if (!alreadyLinked) {
      await prisma.clientBusinessLink.upsert({
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
          method: "MANUAL",
        },
      });
    }

    results.push({
      name: business.name,
      email: business.email,
      domain: business.domain,
      status: alreadyLinked ? "✅ Deja link-uit" : "🆕 Link creat",
    });
  }

  console.table(results);

  const newLinks = results.filter((r) => r.status === "🆕 Link creat").length;
  const totalLinks = await prisma.clientBusinessLink.count({
    where: { clientId: client.id },
  });

  console.log(`\n📊 Rezumat:`);
  console.log(`  - Link-uri noi create: ${newLinks}`);
  console.log(`  - Total link-uri pentru client: ${totalLinks}`);
  console.log(`\n✅ Clientul ${client.email} are acum acces la toate business-urile!\n`);
}

linkClientToAllBusinesses()
  .catch((error) => {
    console.error("❌ Eroare:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

