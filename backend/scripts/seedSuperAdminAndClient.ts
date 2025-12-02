import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function seed() {
  const passwordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  // 1. Create/Update SuperAdmin
  const superAdmin = await prisma.user.upsert({
    where: { email: "stefann.adriann@gmail.com" },
    update: {
      name: "Stefan Adrian",
      password: hashedPassword,
      phone: "0748293830",
      role: Role.SUPERADMIN,
    },
    create: {
      email: "stefann.adriann@gmail.com",
      name: "Stefan Adrian",
      password: hashedPassword,
      phone: "0748293830",
      role: Role.SUPERADMIN,
    },
  });

  console.log("✅ SuperAdmin creat/actualizat cu succes:");
  console.table([
    { 
      role: "SUPERADMIN", 
      email: superAdmin.email, 
      name: superAdmin.name,
      phone: superAdmin.phone,
      password: passwordPlain 
    },
  ]);

  // 2. Create Client with all businesses linked
  const client = await prisma.user.upsert({
    where: { email: "client@larstef.app" },
    update: {
      name: "Client Test",
      password: hashedPassword,
      role: Role.CLIENT,
    },
    create: {
      email: "client@larstef.app",
      name: "Client Test",
      password: hashedPassword,
      role: Role.CLIENT,
    },
  });

  // Get all businesses
  const allBusinesses = await prisma.business.findMany({
    select: { id: true, name: true },
  });

  console.log(`\n📋 Găsite ${allBusinesses.length} business-uri`);

  // Create links for all businesses
  const links = [];
  for (const business of allBusinesses) {
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
        method: "SEED",
      },
    });
    links.push({ business: business.name, linked: true });
  }

  console.log("\n✅ Client creat cu toate business-urile link-uite:");
  console.table([
    { 
      role: "CLIENT", 
      email: client.email, 
      name: client.name,
      password: passwordPlain,
      businessesLinked: allBusinesses.length
    },
  ]);

  console.log("\n📊 Business-uri link-uite:");
  console.table(links);

  console.log("\n🔑 Credentiale pentru login:");
  console.table([
    { 
      Role: "SUPERADMIN", 
      Email: superAdmin.email, 
      Password: passwordPlain 
    },
    { 
      Role: "CLIENT", 
      Email: client.email, 
      Password: passwordPlain 
    },
  ]);
}

seed()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

