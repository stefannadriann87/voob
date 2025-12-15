/// <reference types="node" />

const bcrypt = require("bcryptjs");
const { PrismaClient, Role, BusinessType } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedComplete() {
  // Prevent running in production
  const nodeEnv = process.env.NODE_ENV || process.env.ENVIRONMENT;
  if (nodeEnv === "production" || nodeEnv === "prod") {
    console.error("❌ ERROR: This seed script cannot run in production environment!");
    console.error("   Set NODE_ENV=development to run this script.");
    process.exit(1);
  }

  const defaultPasswordPlain = "Password123!";
  const superAdminPasswordPlain = "Develop13#";
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordPlain, 10);
  const hashedSuperAdminPassword = await bcrypt.hash(superAdminPasswordPlain, 10);

  console.log("🌱 Starting complete seed...\n");

  // 1. Create/Update SUPERADMIN
  const superAdmin = await prisma.user.upsert({
    where: { email: "stefann.adriann@gmail.com" },
    update: {
      name: "Stefan Adrian",
      password: hashedSuperAdminPassword,
      role: Role.SUPERADMIN,
    },
    create: {
      email: "stefann.adriann@gmail.com",
      name: "Stefan Adrian",
      password: hashedSuperAdminPassword,
      role: Role.SUPERADMIN,
    },
  });

  console.log("✅ SUPERADMIN creat/actualizat");

  // 2. Create Subscription Plans
  const [proPlan, businessPlan] = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: "VOOB PRO" },
      update: {
        price: 149,
        smsIncluded: 150,
        maxEmployees: 1,
        description: "Plan de bază cu 1 utilizator și 150 SMS/lună",
      },
      create: {
        name: "VOOB PRO",
        price: 149,
        currency: "RON",
        billingCycle: "MONTHLY",
        smsIncluded: 150,
        maxEmployees: 1,
        description: "Plan de bază cu 1 utilizator și 150 SMS/lună",
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: "VOOB BUSINESS" },
      update: {
        price: 299,
        smsIncluded: 500,
        maxEmployees: 5,
        description: "Plan premium cu 5 utilizatori și 500 SMS/lună",
      },
      create: {
        name: "VOOB BUSINESS",
        price: 299,
        currency: "RON",
        billingCycle: "MONTHLY",
        smsIncluded: 500,
        maxEmployees: 5,
        description: "Plan premium cu 5 utilizatori și 500 SMS/lună",
      },
    }),
  ]);

  console.log("✅ Planuri de abonament create");

  // 3. Create Businesses with Services and Employees - ALL BUSINESS TYPES
  const businessesData = [
    {
      ownerEmail: "general@voob.io",
      ownerName: "General Business Owner",
      businessName: "General Business",
      businessEmail: "contact@general.ro",
      domain: "general-business",
      businessType: BusinessType.GENERAL,
      services: [
        { name: "Serviciu Standard", duration: 30, price: 100 },
        { name: "Serviciu Extins", duration: 60, price: 180 },
        { name: "Serviciu Premium", duration: 90, price: 250 },
        { name: "Serviciu Deluxe", duration: 120, price: 350 },
      ],
      employees: [
        { email: "angajat1@general.ro", name: "Angajat 1 General" },
        { email: "angajat2@general.ro", name: "Angajat 2 General" },
      ],
    },
    {
      ownerEmail: "beauty@voob.io",
      ownerName: "Salon Beauty Owner",
      businessName: "Salon Beauty & Wellness",
      businessEmail: "contact@beautywellness.ro",
      domain: "salon-beauty-wellness",
      businessType: BusinessType.BEAUTY_WELLNESS,
      services: [
        { name: "Manichiura", duration: 60, price: 150 },
        { name: "Pedicura", duration: 60, price: 180 },
        { name: "Tratament facial", duration: 90, price: 300 },
        { name: "Masaj relaxare", duration: 60, price: 250 },
        { name: "Epilare", duration: 30, price: 200 },
        { name: "Make-up profesional", duration: 90, price: 350 },
      ],
      employees: [
        { email: "cristina@beautywellness.ro", name: "Cristina" },
        { email: "maria@beautywellness.ro", name: "Maria" },
      ],
    },
    {
      ownerEmail: "medical@voob.io",
      ownerName: "Dr. Popescu",
      businessName: "Cabinet Medical & Dental Dr. Popescu",
      businessEmail: "contact@medicaldental.ro",
      domain: "cabinet-medical-dental",
      businessType: BusinessType.MEDICAL_DENTAL,
      services: [
        { name: "Consultatie medicala", duration: 30, price: 200 },
        { name: "Consultatie stomatologica", duration: 30, price: 150 },
        { name: "Detartraj", duration: 30, price: 200 },
        { name: "Albire dinti", duration: 60, price: 500 },
        { name: "Extractie masea de minte", duration: 30, price: 300 },
        { name: "Plomba", duration: 30, price: 250 },
      ],
      employees: [
        { email: "asistenta@medicaldental.ro", name: "Asistenta Medicala" },
      ],
    },
    {
      ownerEmail: "therapy@voob.io",
      ownerName: "Psiholog Ionescu",
      businessName: "Centru Terapie & Coaching",
      businessEmail: "contact@therapycoaching.ro",
      domain: "centru-terapie-coaching",
      businessType: BusinessType.THERAPY_COACHING,
      services: [
        { name: "Sesiune psihoterapie individuala", duration: 60, price: 300 },
        { name: "Sesiune psihoterapie de cuplu", duration: 90, price: 450 },
        { name: "Coaching personal", duration: 60, price: 250 },
        { name: "Coaching profesional", duration: 60, price: 300 },
        { name: "Consiliere psihologica", duration: 60, price: 200 },
        { name: "Sesiune grup terapeutic", duration: 90, price: 150 },
      ],
      employees: [
        { email: "psiholog@therapycoaching.ro", name: "Psiholog Ionescu" },
        { email: "coach@therapycoaching.ro", name: "Coach Popescu" },
      ],
    },
    {
      ownerEmail: "sport@voob.io",
      ownerName: "Antrenor Georgescu",
      businessName: "Club Sport & Outdoor",
      businessEmail: "contact@sportoutdoor.ro",
      domain: "club-sport-outdoor",
      businessType: BusinessType.SPORT_OUTDOOR,
      services: [
        { name: "Antrenament personal", duration: 60, price: 200 },
        { name: "Antrenament in grup", duration: 60, price: 80 },
        { name: "Clasa yoga", duration: 60, price: 100 },
        { name: "Clasa pilates", duration: 60, price: 100 },
        { name: "Tura ciclism", duration: 120, price: 150 },
        { name: "Tura hiking", duration: 180, price: 200 },
        { name: "Consiliere nutritie sportiva", duration: 60, price: 250 },
      ],
      employees: [
        { email: "antrenor@sportoutdoor.ro", name: "Antrenor Georgescu" },
        { email: "instructor@sportoutdoor.ro", name: "Instructor Marin" },
      ],
    },
    {
      ownerEmail: "home@voob.io",
      ownerName: "Freelancer Dumitrescu",
      businessName: "Servicii Home & Freelance",
      businessEmail: "contact@homefreelance.ro",
      domain: "servicii-home-freelance",
      businessType: BusinessType.HOME_FREELANCE,
      services: [
        { name: "Curatenie generala", duration: 120, price: 200 },
        { name: "Curatenie profunda", duration: 180, price: 350 },
        { name: "Montaj mobila", duration: 90, price: 300 },
        { name: "Reparatii electrice", duration: 60, price: 250 },
        { name: "Reparatii sanitare", duration: 60, price: 280 },
        { name: "Design grafic", duration: 120, price: 400 },
        { name: "Consultanta IT", duration: 60, price: 350 },
      ],
      employees: [
        { email: "curatenie@homefreelance.ro", name: "Specialist Curatenie" },
        { email: "reparatii@homefreelance.ro", name: "Tehnician Reparatii" },
        { email: "design@homefreelance.ro", name: "Designer Grafic" },
      ],
    },
  ];

  const createdBusinesses = [];

  for (const businessData of businessesData) {
    // Create owner
    const owner = await prisma.user.upsert({
      where: { email: businessData.ownerEmail },
      update: {},
      create: {
        email: businessData.ownerEmail,
        name: businessData.ownerName,
        password: hashedDefaultPassword,
        role: Role.BUSINESS,
      },
    });

    // Create or update business
    const business = await prisma.business.upsert({
      where: { domain: businessData.domain },
      update: {
        businessType: businessData.businessType,
        currentPlanId: proPlan.id,
        name: businessData.businessName,
        email: businessData.businessEmail,
      },
      create: {
        name: businessData.businessName,
        email: businessData.businessEmail,
        domain: businessData.domain,
        businessType: businessData.businessType,
        owner: { connect: { id: owner.id } },
        currentPlan: { connect: { id: proPlan.id } },
      },
      include: { services: true, employees: true },
    });

    // Add services that don't exist yet
    const existingServiceNames = business.services.map((s: { name: string }) => s.name);
    const servicesToCreate = businessData.services.filter(
      (service: { name: string }) => !existingServiceNames.includes(service.name)
    );

    if (servicesToCreate.length > 0) {
      await prisma.service.createMany({
        data: servicesToCreate.map((service: { name: string; duration: number; price: number }) => ({
          name: service.name,
          duration: service.duration,
          price: service.price,
          businessId: business.id,
        })),
      });
    }

    // Create employees
    const employeeUsers = [];
    for (const empData of businessData.employees) {
      const employee = await prisma.user.upsert({
        where: { email: empData.email },
        update: {
          businessId: business.id,
          role: Role.EMPLOYEE,
        },
        create: {
          email: empData.email,
          name: empData.name,
          password: hashedDefaultPassword,
          role: Role.EMPLOYEE,
          businessId: business.id,
        },
      });
      employeeUsers.push(employee);
    }

    // Connect owner and employees to business
    await prisma.business.update({
      where: { id: business.id },
      data: {
        employees: {
          connect: [
            { id: owner.id },
            ...employeeUsers.map((emp) => ({ id: emp.id })),
          ],
        },
      },
    });

    // Refresh business to get updated services count
    const finalBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: { services: true, employees: true },
    });

    createdBusinesses.push({
      business: finalBusiness || business,
      owner,
      employees: employeeUsers,
    });

    const serviceCount = finalBusiness?.services.length || business.services.length;
    const newServicesCount = servicesToCreate.length;
    if (newServicesCount > 0) {
      console.log(`✅ Business creat/actualizat: ${business.name} (${serviceCount} servicii total, ${newServicesCount} servicii noi adăugate, ${employeeUsers.length} angajați)`);
    } else {
      console.log(`✅ Business creat/actualizat: ${business.name} (${serviceCount} servicii, ${employeeUsers.length} angajați)`);
    }
  }

  // 4. Create Clients
  const clientsData = [
    { email: "client1@voob.io", name: "Ion Popescu", phone: "+40712345678" },
    { email: "client2@voob.io", name: "Maria Ionescu", phone: "+40712345679" },
    { email: "client3@voob.io", name: "Alexandru Georgescu", phone: "+40712345680" },
    { email: "client4@voob.io", name: "Ana Dumitrescu", phone: "+40712345681" },
  ];

  const createdClients = [];
  for (const clientData of clientsData) {
    const client = await prisma.user.upsert({
      where: { email: clientData.email },
      update: {},
      create: {
        email: clientData.email,
        name: clientData.name,
        password: hashedDefaultPassword,
        role: Role.CLIENT,
        phone: clientData.phone,
      },
    });
    createdClients.push(client);
  }

  console.log(`✅ ${createdClients.length} clienți creați`);

  // 5. Link all clients to all businesses
  for (const client of createdClients) {
    for (const { business } of createdBusinesses) {
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
          method: "SEED",
        },
      });
    }
  }

  console.log("✅ Clienți linkați la toate business-urile");

  // 6. Summary
  console.log("\n📊 REZUMAT COMPLET:\n");
  console.log("=" .repeat(80));

  console.log("\n👤 SUPERADMIN:");
  console.table([
    {
      Role: "SUPERADMIN",
      Email: superAdmin.email,
      Name: superAdmin.name,
      Password: superAdminPasswordPlain,
    },
  ]);

  console.log("\n🏢 BUSINESS-URI:");
  const businessTable = createdBusinesses.map(({ business, owner, employees }) => ({
    Business: business.name,
    Domain: business.domain,
    Owner: owner.email,
    Services: business.services.length,
    Employees: employees.length,
    Type: business.businessType,
  }));
  console.table(businessTable);

  console.log("\n👥 ANGAJAȚI:");
  const employeesTable = [];
  for (const { business, employees } of createdBusinesses) {
    for (const emp of employees) {
      employeesTable.push({
        Business: business.name,
        Email: emp.email,
        Name: emp.name,
        Password: defaultPasswordPlain,
      });
    }
  }
  console.table(employeesTable);

  console.log("\n👤 CLIENTI:");
  const clientsTable = createdClients.map((client) => ({
    Email: client.email,
    Name: client.name,
    Phone: client.phone,
    Password: defaultPasswordPlain,
  }));
  console.table(clientsTable);

  console.log("\n🔑 CREDENTIALE PENTRU LOGIN:\n");
  console.table([
    {
      Role: "SUPERADMIN",
      Email: "stefann.adriann@gmail.com",
      Password: superAdminPasswordPlain,
    },
    {
      Role: "BUSINESS OWNER",
      Email: "general@voob.io / beauty@voob.io / medical@voob.io / therapy@voob.io / sport@voob.io / home@voob.io",
      Password: defaultPasswordPlain,
    },
    {
      Role: "EMPLOYEE",
      Email: "angajat1@general.ro / cristina@beautywellness.ro / etc.",
      Password: defaultPasswordPlain,
    },
    {
      Role: "CLIENT",
      Email: "client1@voob.io / client2@voob.io / etc.",
      Password: defaultPasswordPlain,
    },
  ]);

  console.log("\n✅ Seed complet finalizat cu succes!\n");
}

seedComplete()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
