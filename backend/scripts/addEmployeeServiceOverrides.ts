/**
 * Script to add override columns to EmployeeService table
 * Run this before deploying the new schema changes
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function addEmployeeServiceOverrides() {
  try {
    console.log("🔧 Adăugând coloanele de override pentru EmployeeService...\n");

    // Check if columns already exist
    const checkColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'EmployeeService' 
      AND column_name IN ('price', 'duration', 'notes')
    `);

    const existingColumns = (checkColumns as Array<{ column_name: string }>).map((c) => c.column_name);
    
    if (existingColumns.includes("price") && existingColumns.includes("duration") && existingColumns.includes("notes")) {
      console.log("✅ Coloanele de override există deja în tabelul EmployeeService.");
      return;
    }

    // Add price column if it doesn't exist
    if (!existingColumns.includes("price")) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "EmployeeService" 
        ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION;
      `);
      console.log("✅ Coloana 'price' a fost adăugată.");
    }

    // Add duration column if it doesn't exist
    if (!existingColumns.includes("duration")) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "EmployeeService" 
        ADD COLUMN IF NOT EXISTS "duration" INTEGER;
      `);
      console.log("✅ Coloana 'duration' a fost adăugată.");
    }

    // Add notes column if it doesn't exist
    if (!existingColumns.includes("notes")) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "EmployeeService" 
        ADD COLUMN IF NOT EXISTS "notes" TEXT;
      `);
      console.log("✅ Coloana 'notes' a fost adăugată.");
    }

    console.log("\n✅ Toate coloanele de override au fost adăugate cu succes!");
  } catch (error: any) {
    console.error("❌ Eroare la adăugarea coloanelor:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addEmployeeServiceOverrides();

