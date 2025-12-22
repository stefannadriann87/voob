// @ts-nocheck - Script file excluded from tsconfig compilation
const bcryptLib = require("bcryptjs");
const prismaClientModule = require("@prisma/client");
const PrismaClientConstructor = prismaClientModule.PrismaClient;
const RoleType = prismaClientModule.Role;

const prismaInstance = new PrismaClientConstructor();

async function addServicesAndEmployees() {
  // Prevent running in production
  const nodeEnv = process.env.NODE_ENV || process.env.ENVIRONMENT;
  if (nodeEnv === "production" || nodeEnv === "prod") {
    console.error("❌ ERROR: This seed script cannot run in production environment!");
    console.error("   Set NODE_ENV=development to run this script.");
    process.exit(1);
  }

  const defaultPasswordPlain = "Password123!";
  const hashedPassword = await bcryptLib.hash(defaultPasswordPlain, 10);

  // Ensure SUPERADMIN exists
  const superAdmin = await prismaInstance.user.upsert({
    where: { email: "stefann.adriann@gmail.com" },
    update: {
      name: "Stefan Adrian",
      password: await bcrypt.hash("Develop13#", 10),
      role: RoleEnum.SUPERADMIN,
    },
    create: {
      email: "stefann.adriann@gmail.com",
      name: "Stefan Adrian",
      password: await bcrypt.hash("Develop13#", 10),
      role: RoleEnum.SUPERADMIN,
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
  const businesses = await prismaInstance.business.findMany({
    include: {
      services: true,
      employees: true,
      owner: true,
    },
  });

  if (businesses.length === 0) {
    console.log("⚠️  Nu există business-uri în baza de date.");
    await prismaInstance.$disconnect();
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

      await prismaInstance.service.createMany({
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
      const employeeName = `Specialist ${business.name}`;

      const employee = await prismaInstance.user.upsert({
        where: { email: employeeEmail },
        update: {
          businessId: business.id,
          role: RoleType.EMPLOYEE,
        },
        create: {
          email: employeeEmail,
          name: employeeName,
          password: hashedPassword,
          role: RoleType.EMPLOYEE,
          businessId: business.id,
        },
      });

      // Connect employee to business
      await prismaInstance.business.update({
        where: { id: business.id },
        data: {
          employees: {
            connect: { id: employee.id },
          },
        },
      });

      employeesAdded = 1;
      console.log(`  ✅ Adăugat specialist pentru ${business.name}: ${employeeEmail}`);
    } else {
      console.log(`  ℹ️  ${business.name} are deja ${employeesCount} specialiști`);
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
    await prismaInstance.$disconnect();
  });
