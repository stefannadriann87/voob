/// <reference types="node" />

const bcrypt = require("bcryptjs");
const { PrismaClient, Role } = require("@prisma/client");

const prisma = new PrismaClient();

async function addServicesAndEmployees() {
  // Prevent running in production
  const nodeEnv = process.env.NODE_ENV || process.env.ENVIRONMENT;
  if (nodeEnv === "production" || nodeEnv === "prod") {
    console.error("❌ ERROR: This seed script cannot run in production environment!");
    console.error("   Set NODE_ENV=development to run this script.");
    process.exit(1);
  }

  const defaultPasswordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(defaultPasswordPlain, 10);

  // Ensure SUPERADMIN exists
  const superAdmin = await prisma.user.upsert({
    where: { email: "stefann.adriann@gmail.com" },
    update: {
      name: "Stefan Adrian",
      password: await bcrypt.hash("Develop13#", 10),
      role: Role.SUPERADMIN,
    },
    create: {
      email: "stefann.adriann@gmail.com",
      name: "Stefan Adrian",
      password: await bcrypt.hash("Develop13#", 10),
      role: Role.SUPERADMIN,
    },
  });

  console.log("✅ SUPERADMIN verificat:");
  console.table([
    {
      role: "SUPERADMIN",
      email: superAdmin.email,
      name: superAdmin.name,
      password: "Develop13#",
    },
  ]);

  // Get all businesses
  const businesses = await prisma.business.findMany({
    include: {
      services: true,
      employees: true,
      owner: true,
    },
  });

  if (businesses.length === 0) {
    console.log("⚠️  Nu există business-uri în baza de date.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n📋 Găsite ${businesses.length} business-uri\n`);

  const results: Array<{
    businessName: string;
    servicesAdded: number;
    employeesAdded: number;
  }> = [];

  for (const business of businesses) {
    let servicesAdded = 0;
    let employeesAdded = 0;

    // Add services if business has no services
    if (business.services.length === 0) {
      const defaultServices = [
        { name: "Serviciu Standard", duration: 30, price: 100 },
        { name: "Serviciu Extins", duration: 60, price: 180 },
        { name: "Serviciu Premium", duration: 90, price: 250 },
      ];

      await prisma.service.createMany({
        data: defaultServices.map((service) => ({
          ...service,
          businessId: business.id,
        })),
      });

      servicesAdded = defaultServices.length;
      console.log(`  ✅ Adăugate ${servicesAdded} servicii pentru ${business.name}`);
    } else {
      console.log(`  ℹ️  ${business.name} are deja ${business.services.length} servicii`);
    }

    // Add employees if business has no employees (except owner)
    const employeesCount = business.employees.filter(
      (emp: { id: string }) => emp.id !== business.ownerId
    ).length;

    if (employeesCount === 0) {
      // Create employee user
      const employeeEmail = `employee@${business.domain}.app`;
      const employeeName = `Angajat ${business.name}`;

      const employee = await prisma.user.upsert({
        where: { email: employeeEmail },
        update: {
          businessId: business.id,
          role: Role.EMPLOYEE,
        },
        create: {
          email: employeeEmail,
          name: employeeName,
          password: hashedPassword,
          role: Role.EMPLOYEE,
          businessId: business.id,
        },
      });

      // Connect employee to business
      await prisma.business.update({
        where: { id: business.id },
        data: {
          employees: {
            connect: { id: employee.id },
          },
        },
      });

      employeesAdded = 1;
      console.log(`  ✅ Adăugat angajat pentru ${business.name}: ${employeeEmail}`);
    } else {
      console.log(`  ℹ️  ${business.name} are deja ${employeesCount} angajați`);
    }

    results.push({
      businessName: business.name,
      servicesAdded,
      employeesAdded,
    });
  }

  console.log("\n📊 Rezumat:");
  console.table(results);

  console.log("\n🔑 Credentiale pentru login:");
  console.table([
    {
      Role: "SUPERADMIN",
      Email: "stefann.adriann@gmail.com",
      Password: "Develop13#",
    },
    {
      Role: "EMPLOYEE",
      Email: "employee@{business-domain}.app",
      Password: defaultPasswordPlain,
    },
  ]);
}

addServicesAndEmployees()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
