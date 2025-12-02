const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function createMissingTables() {
  try {
    console.log("🔧 Creând tabelele lipsă...\n");

    // Create RegistrationAttempt table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RegistrationAttempt" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "ipAddress" TEXT NOT NULL,
        "userAgent" TEXT,
        "success" BOOLEAN NOT NULL DEFAULT false,
        "failureReason" TEXT,
        "captchaScore" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RegistrationAttempt_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RegistrationAttempt_email_idx" ON "RegistrationAttempt"("email");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RegistrationAttempt_ipAddress_idx" ON "RegistrationAttempt"("ipAddress");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RegistrationAttempt_createdAt_idx" ON "RegistrationAttempt"("createdAt");
    `);

    console.log("✅ RegistrationAttempt creat");

    // Create LoginAttempt table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LoginAttempt" (
        "id" TEXT NOT NULL,
        "email" TEXT,
        "ipAddress" TEXT NOT NULL,
        "userAgent" TEXT,
        "success" BOOLEAN NOT NULL DEFAULT false,
        "failureReason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LoginAttempt_email_idx" ON "LoginAttempt"("email");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LoginAttempt_ipAddress_idx" ON "LoginAttempt"("ipAddress");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");
    `);

    console.log("✅ LoginAttempt creat");

    // Create IpBlacklist table (if not already created)
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

    console.log("✅ IpBlacklist creat");

    console.log("\n✅ Toate tabelele au fost create cu succes!");
  } catch (error) {
    console.error("❌ Eroare la crearea tabelelor:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createMissingTables();

