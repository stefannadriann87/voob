import * as bcrypt from "bcryptjs";
import { PrismaClient, Role, BusinessType, TimeSlot } from "@prisma/client";
const prisma = new PrismaClient();

async function seedBusinesses() {
  const passwordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  // 1. GENERAL Business
  const generalOwner = await prisma.user.upsert({
    where: { email: "general@voob.io" },
    update: {},
    create: {
      email: "general@voob.io",
      name: "General Business",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const generalBusiness = await prisma.business.upsert({
    where: { domain: "general-business" },
    update: { businessType: BusinessType.GENERAL },
    create: {
      name: "General Business",
      email: "contact@general.ro",
      domain: "general-business",
      businessType: BusinessType.GENERAL,
      owner: { connect: { id: generalOwner.id } },
      services: {
        create: [
          { name: "Serviciu Standard", duration: 30, price: 100 },
          { name: "Serviciu Extins", duration: 60, price: 180 },
          { name: "Serviciu Premium", duration: 90, price: 250 },
          { name: "Serviciu Deluxe", duration: 120, price: 350 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  const generalEmployee = await prisma.user.upsert({
    where: { email: "angajat@general.ro" },
    update: { businessId: generalBusiness.id },
    create: {
      email: "angajat@general.ro",
      name: "Angajat General",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: generalBusiness.id,
    },
  });

  await prisma.business.update({
    where: { id: generalBusiness.id },
    data: {
      employees: {
        connect: [{ id: generalOwner.id }, { id: generalEmployee.id }],
      },
    },
  });

  // 2. Beauty & Wellness
  const beautyOwner = await prisma.user.upsert({
    where: { email: "beauty@voob.io" },
    update: {},
    create: {
      email: "beauty@voob.io",
      name: "Salon Beauty & Wellness",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const beautyBusiness = await prisma.business.upsert({
    where: { domain: "salon-beauty-wellness" },
    update: { businessType: BusinessType.BEAUTY_WELLNESS },
    create: {
      name: "Salon Beauty & Wellness",
      email: "contact@beautywellness.ro",
      domain: "salon-beauty-wellness",
      businessType: BusinessType.BEAUTY_WELLNESS,
      owner: { connect: { id: beautyOwner.id } },
      services: {
        create: [
          { name: "Manichiura", duration: 60, price: 150 },
          { name: "Pedicura", duration: 60, price: 180 },
          { name: "Tratament facial", duration: 90, price: 300 },
          { name: "Masaj relaxare", duration: 60, price: 250 },
          { name: "Epilare", duration: 30, price: 200 },
          { name: "Make-up profesional", duration: 90, price: 350 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  const beautyEmployee = await prisma.user.upsert({
    where: { email: "cristina@beautywellness.ro" },
    update: { businessId: beautyBusiness.id },
    create: {
      email: "cristina@beautywellness.ro",
      name: "Cristina",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: beautyBusiness.id,
    },
  });

  await prisma.business.update({
    where: { id: beautyBusiness.id },
    data: {
      employees: {
        connect: [{ id: beautyOwner.id }, { id: beautyEmployee.id }],
      },
    },
  });

  // 3. Medical & Dental
  const medicalOwner = await prisma.user.upsert({
    where: { email: "medical@voob.io" },
    update: {},
    create: {
      email: "medical@voob.io",
      name: "Dr. Popescu",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const medicalBusiness = await prisma.business.upsert({
    where: { domain: "cabinet-medical-dental" },
    update: { businessType: BusinessType.MEDICAL_DENTAL },
    create: {
      name: "Cabinet Medical & Dental Dr. Popescu",
      email: "contact@medicaldental.ro",
      domain: "cabinet-medical-dental",
      businessType: BusinessType.MEDICAL_DENTAL,
      owner: { connect: { id: medicalOwner.id } },
      services: {
        create: [
          { name: "Consultatie medicala", duration: 30, price: 200 },
          { name: "Consultatie stomatologica", duration: 30, price: 150 },
          { name: "Detartraj", duration: 30, price: 200 },
          { name: "Albire dinti", duration: 60, price: 500 },
          { name: "Extractie masea de minte", duration: 30, price: 300 },
          { name: "Plomba", duration: 30, price: 250 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  const medicalEmployee1 = await prisma.user.upsert({
    where: { email: "costel@medicaldental.ro" },
    update: { businessId: medicalBusiness.id },
    create: {
      email: "costel@medicaldental.ro",
      name: "Dr. Costel",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: medicalBusiness.id,
    },
  });

  const medicalEmployee2 = await prisma.user.upsert({
    where: { email: "ana@medicaldental.ro" },
    update: { businessId: medicalBusiness.id },
    create: {
      email: "ana@medicaldental.ro",
      name: "Dr. Ana",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: medicalBusiness.id,
    },
  });

  await prisma.business.update({
    where: { id: medicalBusiness.id },
    data: {
      employees: {
        connect: [{ id: medicalOwner.id }, { id: medicalEmployee1.id }, { id: medicalEmployee2.id }],
      },
    },
  });

  // 4. Therapy & Coaching
  const therapyOwner = await prisma.user.upsert({
    where: { email: "therapy@voob.io" },
    update: {},
    create: {
      email: "therapy@voob.io",
      name: "Psiholog Maria",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const therapyBusiness = await prisma.business.upsert({
    where: { domain: "cabinet-therapy-coaching" },
    update: { businessType: BusinessType.THERAPY_COACHING },
    create: {
      name: "Cabinet Therapy & Coaching",
      email: "contact@therapycoaching.ro",
      domain: "cabinet-therapy-coaching",
      businessType: BusinessType.THERAPY_COACHING,
      owner: { connect: { id: therapyOwner.id } },
      services: {
        create: [
          { name: "Sesiune de terapie individuala", duration: 60, price: 250 },
          { name: "Sesiune de terapie de cuplu", duration: 90, price: 400 },
          { name: "Sesiune de coaching", duration: 60, price: 300 },
          { name: "Evaluare psihologica", duration: 60, price: 300 },
          { name: "Consiliere pentru copii", duration: 30, price: 200 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  const therapyEmployee = await prisma.user.upsert({
    where: { email: "ioana@therapycoaching.ro" },
    update: { businessId: therapyBusiness.id },
    create: {
      email: "ioana@therapycoaching.ro",
      name: "Psiholog Ioana",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: therapyBusiness.id,
    },
  });

  await prisma.business.update({
    where: { id: therapyBusiness.id },
    data: {
      employees: {
        connect: [{ id: therapyOwner.id }, { id: therapyEmployee.id }],
      },
    },
  });

  // 5. Sport & Outdoor (SPORT_OUTDOOR) - FĂRĂ servicii, DOAR terenuri
  const sportOwner = await prisma.user.upsert({
    where: { email: "sport@voob.io" },
    update: {},
    create: {
      email: "sport@voob.io",
      name: "Sport & Outdoor Center",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const sportBusiness = await prisma.business.upsert({
    where: { domain: "sport-outdoor-center" },
    update: { businessType: BusinessType.SPORT_OUTDOOR },
    create: {
      name: "Sport & Outdoor Center",
      email: "contact@sportoutdoor.ro",
      domain: "sport-outdoor-center",
      businessType: BusinessType.SPORT_OUTDOOR,
      owner: { connect: { id: sportOwner.id } },
      // NU creăm servicii pentru SPORT_OUTDOOR
    },
    include: { services: true, employees: true, courts: true },
  });

  // Creează terenuri pentru SPORT_OUTDOOR
  const court1 = await prisma.court.upsert({
    where: {
      businessId_number: {
        businessId: sportBusiness.id,
        number: 1,
      },
    },
    update: {},
    create: {
      businessId: sportBusiness.id,
      name: "Teren Tenis 1",
      number: 1,
      isActive: true,
      pricing: {
        create: [
          {
            timeSlot: TimeSlot.MORNING,
            price: 80,
            startHour: 8,
            endHour: 12,
          },
          {
            timeSlot: TimeSlot.AFTERNOON,
            price: 100,
            startHour: 12,
            endHour: 18,
          },
          {
            timeSlot: TimeSlot.NIGHT,
            price: 120,
            startHour: 18,
            endHour: 22,
          },
        ],
      },
    },
    include: { pricing: true },
  });

  const court2 = await prisma.court.upsert({
    where: {
      businessId_number: {
        businessId: sportBusiness.id,
        number: 2,
      },
    },
    update: {},
    create: {
      businessId: sportBusiness.id,
      name: "Teren Tenis 2",
      number: 2,
      isActive: true,
      pricing: {
        create: [
          {
            timeSlot: TimeSlot.MORNING,
            price: 80,
            startHour: 8,
            endHour: 12,
          },
          {
            timeSlot: TimeSlot.AFTERNOON,
            price: 100,
            startHour: 12,
            endHour: 18,
          },
          {
            timeSlot: TimeSlot.NIGHT,
            price: 120,
            startHour: 18,
            endHour: 22,
          },
        ],
      },
    },
    include: { pricing: true },
  });

  const court3 = await prisma.court.upsert({
    where: {
      businessId_number: {
        businessId: sportBusiness.id,
        number: 3,
      },
    },
    update: {},
    create: {
      businessId: sportBusiness.id,
      name: "Teren Fotbal",
      number: 3,
      isActive: true,
      pricing: {
        create: [
          {
            timeSlot: TimeSlot.MORNING,
            price: 150,
            startHour: 8,
            endHour: 12,
          },
          {
            timeSlot: TimeSlot.AFTERNOON,
            price: 200,
            startHour: 12,
            endHour: 18,
          },
          {
            timeSlot: TimeSlot.NIGHT,
            price: 250,
            startHour: 18,
            endHour: 22,
          },
        ],
      },
    },
    include: { pricing: true },
  });

  // NU creăm employees pentru SPORT_OUTDOOR

  // 6. Home & Freelance Services
  const homeOwner = await prisma.user.upsert({
    where: { email: "home@voob.io" },
    update: {},
    create: {
      email: "home@voob.io",
      name: "Home Services Pro",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const homeBusiness = await prisma.business.upsert({
    where: { domain: "home-freelance-services" },
    update: { businessType: BusinessType.HOME_FREELANCE },
    create: {
      name: "Home & Freelance Services",
      email: "contact@homeservices.ro",
      domain: "home-freelance-services",
      businessType: BusinessType.HOME_FREELANCE,
      owner: { connect: { id: homeOwner.id } },
      services: {
        create: [
          { name: "Curatenie generala", duration: 180, price: 300 },
          { name: "Curatenie profunda", duration: 240, price: 500 },
          { name: "Instalare mobila", duration: 120, price: 250 },
          { name: "Reparatii diverse", duration: 90, price: 200 },
          { name: "Montare TV / electrocasnice", duration: 60, price: 150 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  const homeEmployee = await prisma.user.upsert({
    where: { email: "marius@homeservices.ro" },
    update: { businessId: homeBusiness.id },
    create: {
      email: "marius@homeservices.ro",
      name: "Marius Handyman",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: homeBusiness.id,
    },
  });

  await prisma.business.update({
    where: { id: homeBusiness.id },
    data: {
      employees: {
        connect: [{ id: homeOwner.id }, { id: homeEmployee.id }],
      },
    },
  });

  // Refresh businesses to get updated data
  const generalBusinessFinal = await prisma.business.findUnique({
    where: { id: generalBusiness.id },
    include: { services: true, employees: true, courts: true },
  });
  const beautyBusinessFinal = await prisma.business.findUnique({
    where: { id: beautyBusiness.id },
    include: { services: true, employees: true, courts: true },
  });
  const medicalBusinessFinal = await prisma.business.findUnique({
    where: { id: medicalBusiness.id },
    include: { services: true, employees: true, courts: true },
  });
  const therapyBusinessFinal = await prisma.business.findUnique({
    where: { id: therapyBusiness.id },
    include: { services: true, employees: true, courts: true },
  });
  const sportBusinessFinal = await prisma.business.findUnique({
    where: { id: sportBusiness.id },
    include: { services: true, employees: true, courts: { include: { pricing: true } } },
  });
  const homeBusinessFinal = await prisma.business.findUnique({
    where: { id: homeBusiness.id },
    include: { services: true, employees: true, courts: true },
  });

  const summary = [
    {
      Business: generalBusinessFinal!.name,
      Type: "GENERAL",
      Domain: generalBusinessFinal!.domain,
      Services: generalBusinessFinal!.services.length,
      Courts: generalBusinessFinal!.courts.length,
      Employees: generalBusinessFinal!.employees.length,
      Owner: generalOwner.email,
    },
    {
      Business: beautyBusinessFinal!.name,
      Type: "Beauty & Wellness",
      Domain: beautyBusinessFinal!.domain,
      Services: beautyBusinessFinal!.services.length,
      Courts: beautyBusinessFinal!.courts.length,
      Employees: beautyBusinessFinal!.employees.length,
      Owner: beautyOwner.email,
    },
    {
      Business: medicalBusinessFinal!.name,
      Type: "Medical & Dental",
      Domain: medicalBusinessFinal!.domain,
      Services: medicalBusinessFinal!.services.length,
      Courts: medicalBusinessFinal!.courts.length,
      Employees: medicalBusinessFinal!.employees.length,
      Owner: medicalOwner.email,
    },
    {
      Business: therapyBusinessFinal!.name,
      Type: "Therapy & Coaching",
      Domain: therapyBusinessFinal!.domain,
      Services: therapyBusinessFinal!.services.length,
      Courts: therapyBusinessFinal!.courts.length,
      Employees: therapyBusinessFinal!.employees.length,
      Owner: therapyOwner.email,
    },
    {
      Business: sportBusinessFinal!.name,
      Type: "Sport & Outdoor",
      Domain: sportBusinessFinal!.domain,
      Services: sportBusinessFinal!.services.length,
      Courts: sportBusinessFinal!.courts.length,
      Employees: sportBusinessFinal!.employees.length,
      Owner: sportOwner.email,
    },
    {
      Business: homeBusinessFinal!.name,
      Type: "Home & Freelance",
      Domain: homeBusinessFinal!.domain,
      Services: homeBusinessFinal!.services.length,
      Courts: homeBusinessFinal!.courts.length,
      Employees: homeBusinessFinal!.employees.length,
      Owner: homeOwner.email,
    },
  ];

  console.log("✅ Business-uri create cu succes pentru toate categoriile:");
  console.table(summary);

  console.log("\n📧 Credentiale pentru login:");
  console.table([
    { Business: "General", Email: generalOwner.email, Password: passwordPlain },
    { Business: "Beauty & Wellness", Email: beautyOwner.email, Password: passwordPlain },
    { Business: "Medical & Dental", Email: medicalOwner.email, Password: passwordPlain },
    { Business: "Therapy & Coaching", Email: therapyOwner.email, Password: passwordPlain },
    { Business: "Sport & Outdoor", Email: sportOwner.email, Password: passwordPlain },
    { Business: "Home & Freelance", Email: homeOwner.email, Password: passwordPlain },
  ]);

  console.log("\n🏟️  Terenuri create pentru Sport & Outdoor:");
  console.table([
    { Court: court1.name, Number: court1.number, Pricing: `${court1.pricing.length} tarife` },
    { Court: court2.name, Number: court2.number, Pricing: `${court2.pricing.length} tarife` },
    { Court: court3.name, Number: court3.number, Pricing: `${court3.pricing.length} tarife` },
  ]);
}

seedBusinesses()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
