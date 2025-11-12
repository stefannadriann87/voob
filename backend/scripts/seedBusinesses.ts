import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function seedBusinesses() {
  const passwordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  // 1. Cabinet Stomatologic
  const dentistOwner = await prisma.user.upsert({
    where: { email: "dentist@larstef.app" },
    update: {},
    create: {
      email: "dentist@larstef.app",
      name: "Dr. Popescu",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const dentistBusiness = await prisma.business.upsert({
    where: { domain: "cabinet-stomatologic-dentist" },
    update: {},
    create: {
      name: "Cabinet Stomatologic Dr. Popescu",
      email: "contact@dentist.ro",
      domain: "cabinet-stomatologic-dentist",
      owner: { connect: { id: dentistOwner.id } },
      services: {
        create: [
          { name: "Consultatie", duration: 30, price: 150 },
          { name: "Detartraj", duration: 45, price: 200 },
          { name: "Albire dinti", duration: 60, price: 500 },
          { name: "Extractie masea de minte", duration: 30, price: 300 },
          { name: "Plomba", duration: 45, price: 250 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  // Create employees with businessId
  const dentistEmployee1 = await prisma.user.upsert({
    where: { email: "costel@dentist.ro" },
    update: {
      businessId: dentistBusiness.id,
    },
    create: {
      email: "costel@dentist.ro",
      name: "Dr. Costel",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: dentistBusiness.id,
    },
  });

  const dentistEmployee2 = await prisma.user.upsert({
    where: { email: "ana@dentist.ro" },
    update: {
      businessId: dentistBusiness.id,
    },
    create: {
      email: "ana@dentist.ro",
      name: "Dr. Ana",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: dentistBusiness.id,
    },
  });

  // Connect employees to business
  await prisma.business.update({
    where: { id: dentistBusiness.id },
    data: {
      employees: {
        connect: [
          { id: dentistOwner.id },
          { id: dentistEmployee1.id },
          { id: dentistEmployee2.id },
        ],
      },
    },
  });

  // 2. Avocat
  const lawyerOwner = await prisma.user.upsert({
    where: { email: "avocat@larstef.app" },
    update: {},
    create: {
      email: "avocat@larstef.app",
      name: "Avocat Ionescu",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const lawyerBusiness = await prisma.business.upsert({
    where: { domain: "cabinet-avocat-ionescu" },
    update: {},
    create: {
      name: "Cabinet Avocat Ionescu",
      email: "contact@avocat.ro",
      domain: "cabinet-avocat-ionescu",
      owner: { connect: { id: lawyerOwner.id } },
      services: {
        create: [
          { name: "Consultatie juridica", duration: 60, price: 300 },
          { name: "Redactare contract", duration: 90, price: 800 },
          { name: "Reprezentare in instanta", duration: 120, price: 1500 },
          { name: "Consultatie online", duration: 30, price: 200 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  // Create employees with businessId
  const lawyerEmployee1 = await prisma.user.upsert({
    where: { email: "maria@avocat.ro" },
    update: {
      businessId: lawyerBusiness.id,
    },
    create: {
      email: "maria@avocat.ro",
      name: "Avocat Maria",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: lawyerBusiness.id,
    },
  });

  // Connect employees to business
  await prisma.business.update({
    where: { id: lawyerBusiness.id },
    data: {
      employees: {
        connect: [
          { id: lawyerOwner.id },
          { id: lawyerEmployee1.id },
        ],
      },
    },
  });

  // 3. Psiholog
  const psychologistOwner = await prisma.user.upsert({
    where: { email: "psiholog@larstef.app" },
    update: {},
    create: {
      email: "psiholog@larstef.app",
      name: "Psiholog Maria",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const psychologistBusiness = await prisma.business.upsert({
    where: { domain: "cabinet-psiholog-maria" },
    update: {},
    create: {
      name: "Cabinet Psiholog Maria",
      email: "contact@psiholog.ro",
      domain: "cabinet-psiholog-maria",
      owner: { connect: { id: psychologistOwner.id } },
      services: {
        create: [
          { name: "Sesiune de terapie individuala", duration: 50, price: 250 },
          { name: "Sesiune de terapie de cuplu", duration: 90, price: 400 },
          { name: "Evaluare psihologica", duration: 60, price: 300 },
          { name: "Consiliere pentru copii", duration: 45, price: 200 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  // Create employees with businessId
  const psychologistEmployee1 = await prisma.user.upsert({
    where: { email: "ioana@psiholog.ro" },
    update: {
      businessId: psychologistBusiness.id,
    },
    create: {
      email: "ioana@psiholog.ro",
      name: "Psiholog Ioana",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: psychologistBusiness.id,
    },
  });

  // Connect employees to business
  await prisma.business.update({
    where: { id: psychologistBusiness.id },
    data: {
      employees: {
        connect: [
          { id: psychologistOwner.id },
          { id: psychologistEmployee1.id },
        ],
      },
    },
  });

  // 4. Cosmetica
  const cosmetologyOwner = await prisma.user.upsert({
    where: { email: "cosmetica@larstef.app" },
    update: {},
    create: {
      email: "cosmetica@larstef.app",
      name: "Salon Beauty",
      password: hashedPassword,
      role: Role.BUSINESS,
    },
  });

  const cosmetologyBusiness = await prisma.business.upsert({
    where: { domain: "salon-beauty-cosmetica" },
    update: {},
    create: {
      name: "Salon Beauty Cosmetica",
      email: "contact@cosmetica.ro",
      domain: "salon-beauty-cosmetica",
      owner: { connect: { id: cosmetologyOwner.id } },
      services: {
        create: [
          { name: "Manichiura", duration: 60, price: 150 },
          { name: "Pedicura", duration: 75, price: 180 },
          { name: "Tratament facial", duration: 90, price: 300 },
          { name: "Masaj facial", duration: 60, price: 250 },
          { name: "Epilare", duration: 45, price: 200 },
          { name: "Make-up", duration: 90, price: 350 },
        ],
      },
    },
    include: { services: true, employees: true },
  });

  // Create employees with businessId
  const cosmetologyEmployee1 = await prisma.user.upsert({
    where: { email: "cristina@cosmetica.ro" },
    update: {
      businessId: cosmetologyBusiness.id,
    },
    create: {
      email: "cristina@cosmetica.ro",
      name: "Cristina",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: cosmetologyBusiness.id,
    },
  });

  const cosmetologyEmployee2 = await prisma.user.upsert({
    where: { email: "elena@cosmetica.ro" },
    update: {
      businessId: cosmetologyBusiness.id,
    },
    create: {
      email: "elena@cosmetica.ro",
      name: "Elena",
      password: hashedPassword,
      role: Role.EMPLOYEE,
      businessId: cosmetologyBusiness.id,
    },
  });

  // Connect employees to business
  await prisma.business.update({
    where: { id: cosmetologyBusiness.id },
    data: {
      employees: {
        connect: [
          { id: cosmetologyOwner.id },
          { id: cosmetologyEmployee1.id },
          { id: cosmetologyEmployee2.id },
        ],
      },
    },
  });

  console.log("✅ Business-uri create cu succes:");
  console.table([
    {
      Business: dentistBusiness.name,
      Domain: dentistBusiness.domain,
      Services: dentistBusiness.services.length,
      Employees: dentistBusiness.employees.length,
      Owner: dentistOwner.email,
    },
    {
      Business: lawyerBusiness.name,
      Domain: lawyerBusiness.domain,
      Services: lawyerBusiness.services.length,
      Employees: lawyerBusiness.employees.length,
      Owner: lawyerOwner.email,
    },
    {
      Business: psychologistBusiness.name,
      Domain: psychologistBusiness.domain,
      Services: psychologistBusiness.services.length,
      Employees: psychologistBusiness.employees.length,
      Owner: psychologistOwner.email,
    },
    {
      Business: cosmetologyBusiness.name,
      Domain: cosmetologyBusiness.domain,
      Services: cosmetologyBusiness.services.length,
      Employees: cosmetologyBusiness.employees.length,
      Owner: cosmetologyOwner.email,
    },
  ]);

  console.log("\n📧 Credentiale pentru login:");
  console.table([
    { Business: "Cabinet Stomatologic", Email: dentistOwner.email, Password: passwordPlain },
    { Business: "Cabinet Avocat", Email: lawyerOwner.email, Password: passwordPlain },
    { Business: "Cabinet Psiholog", Email: psychologistOwner.email, Password: passwordPlain },
    { Business: "Salon Beauty", Email: cosmetologyOwner.email, Password: passwordPlain },
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

