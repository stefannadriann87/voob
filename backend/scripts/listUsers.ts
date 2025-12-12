import * as prismaClient from "@prisma/client";
const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function listUsers() {
  try {
    // Get all users with their businesses
    const users = await prisma.user.findMany({
      include: {
        ownedBusinesses: {
          include: {
            services: true,
          },
        },
        business: {
          include: {
            services: true,
          },
        },
      },
      orderBy: {
        email: "asc",
      },
    });

    console.log("\n📋 LISTA COMPLETĂ UTILIZATORI\n");
    console.log("=" .repeat(100));

    const businessOwners: any[] = [];
    const employees: any[] = [];
    const clients: any[] = [];

    users.forEach((user) => {
      if (user.role === Role.BUSINESS && user.ownedBusinesses.length > 0) {
        businessOwners.push(user);
      } else if (user.role === Role.EMPLOYEE || (user.role === Role.BUSINESS && user.businessId)) {
        employees.push(user);
      } else {
        clients.push(user);
      }
    });

    // Business Owners
    if (businessOwners.length > 0) {
      console.log("\n🏢 PROPRIETARI BUSINESS-URI\n");
      businessOwners.forEach((user, index) => {
        const business = user.ownedBusinesses[0];
        console.log(`\n${index + 1}. ${user.name || "N/A"}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🔑 Parolă: Password123!`);
        console.log(`   👤 Rol: ${user.role}`);
        console.log(`   🏢 Business: ${business?.name || "N/A"}`);
        console.log(`   📂 Tip: ${business?.businessType || "N/A"}`);
        console.log(`   🌐 Domain: ${business?.domain || "N/A"}`);
        console.log(`   📞 Telefon: ${business?.phone || "N/A"}`);
        console.log(`   📍 Adresă: ${business?.address || "N/A"}`);
        console.log(`   🔢 Servicii: ${business?.services?.length || 0}`);
        console.log("-".repeat(100));
      });
    }

    // Employees
    if (employees.length > 0) {
      console.log("\n👥 ANGAJAȚI\n");
      employees.forEach((user, index) => {
        const business = user.business;
        console.log(`\n${index + 1}. ${user.name || "N/A"}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🔑 Parolă: Password123!`);
        console.log(`   👤 Rol: ${user.role}`);
        if (business) {
          console.log(`   🏢 Business: ${business.name}`);
          console.log(`   📂 Tip: ${business.businessType}`);
        }
        console.log("-".repeat(100));
      });
    }

    // Clients
    if (clients.length > 0) {
      console.log("\n👤 CLIENTI\n");
      clients.forEach((user, index) => {
        console.log(`\n${index + 1}. ${user.name || "N/A"}`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🔑 Parolă: Password123!`);
        console.log(`   👤 Rol: ${user.role}`);
        console.log("-".repeat(100));
      });
    }

    // Summary Table
    console.log("\n\n📊 SUMAR\n");
    console.log("┌─────────────┬────────────────────────────────────────┬──────────────────────┬──────────────────────┐");
    console.log("│ Rol         │ Email                                   │ Business             │ Tip Business         │");
    console.log("├─────────────┼────────────────────────────────────────┼──────────────────────┼──────────────────────┤");

    businessOwners.forEach((user) => {
      const business = user.ownedBusinesses[0];
      const email = user.email.padEnd(40);
      const businessName = (business?.name || "N/A").padEnd(20);
      const businessType = (business?.businessType || "N/A").padEnd(20);
      console.log(`│ OWNER       │ ${email} │ ${businessName} │ ${businessType} │`);
    });

    employees.forEach((user) => {
      const business = user.business;
      const email = user.email.padEnd(40);
      const businessName = (business?.name || "N/A").padEnd(20);
      const businessType = (business?.businessType || "N/A").padEnd(20);
      console.log(`│ EMPLOYEE    │ ${email} │ ${businessName} │ ${businessType} │`);
    });

    clients.forEach((user) => {
      const email = user.email.padEnd(40);
      console.log(`│ CLIENT      │ ${email} │ ${"N/A".padEnd(20)} │ ${"N/A".padEnd(20)} │`);
    });

    console.log("└─────────────┴────────────────────────────────────────┴──────────────────────┴──────────────────────┘");

    console.log(`\n📈 Total utilizatori: ${users.length}`);
    console.log(`   - Proprietari: ${businessOwners.length}`);
    console.log(`   - Angajați: ${employees.length}`);
    console.log(`   - Clienți: ${clients.length}`);

    console.log("\n🔑 Toate parolele sunt: Password123!\n");
  } catch (error) {
    console.error("❌ Eroare la listarea utilizatorilor:", error);
  } finally {
    await prisma.$disconnect();
  }
}

listUsers();

