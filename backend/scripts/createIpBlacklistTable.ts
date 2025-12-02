const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function createIpBlacklistTable() {
  try {
    // Execute raw SQL to create the table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IpBlacklist" (
        "id" TEXT NOT NULL,
        "ipAddress" TEXT NOT NULL,
        "reason" TEXT,
        "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "IpBlacklist_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IpBlacklist_ipAddress_key" ON "IpBlacklist"("ipAddress");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "IpBlacklist_ipAddress_idx" ON "IpBlacklist"("ipAddress");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "IpBlacklist_expiresAt_idx" ON "IpBlacklist"("expiresAt");
    `);

    console.log("✅ Tabelul IpBlacklist a fost creat cu succes!");
  } catch (error) {
    console.error("❌ Eroare la crearea tabelului:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createIpBlacklistTable();

