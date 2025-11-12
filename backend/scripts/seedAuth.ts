import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function seed() {
  const passwordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@larstef.app" },
    update: {},
    create: {
      email: "superadmin@larstef.app",
      name: "Sorin SuperAdmin",
      password: hashedPassword,
      role: Role.SUPERADMIN,
    },
  });

  const businessOwnerPassword = await bcrypt.hash(passwordPlain, 10);
  const businessOwner = await prisma.user.upsert({
    where: { email: "owner@freshcuts.app" },
    update: {},
    create: {
      email: "owner@freshcuts.app",
      name: "Andrei Business",
      password: businessOwnerPassword,
      role: Role.BUSINESS,
    },
  });

  const business = await prisma.business.upsert({
    where: { domain: "fresh-cuts" },
    update: {},
    create: {
      name: "Fresh Cuts Studio",
      email: "contact@freshcuts.app",
      domain: "fresh-cuts",
      owner: { connect: { id: businessOwner.id } },
      employees: { connect: { id: businessOwner.id } },
      services: {
        create: [
          { name: "Tuns bărbați", duration: 45, price: 120 },
          { name: "Styling premium", duration: 60, price: 180 },
        ],
      },
    },
    include: { services: true },
  });

  const employeePassword = await bcrypt.hash(passwordPlain, 10);
  const employee = await prisma.user.upsert({
    where: { email: "employee@freshcuts.app" },
    update: {
      businessId: business.id,
    },
    create: {
      email: "employee@freshcuts.app",
      name: "Ioana Employee",
      password: employeePassword,
      role: Role.EMPLOYEE,
      businessId: business.id,
    },
  });

  const clientPassword = await bcrypt.hash(passwordPlain, 10);
  const client = await prisma.user.upsert({
    where: { email: "client@larstef.app" },
    update: {},
    create: {
      email: "client@larstef.app",
      name: "Mihai Client",
      password: clientPassword,
      role: Role.CLIENT,
    },
  });

  const firstService = business.services?.[0];
  if (firstService) {
    await prisma.booking.create({
      data: {
        client: { connect: { id: client.id } },
        business: { connect: { id: business.id } },
        service: { connect: { id: firstService.id } },
        date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        paid: true,
      },
    });
  }

  console.table([
    { role: "SUPERADMIN", email: superAdmin.email, password: passwordPlain },
    { role: "BUSINESS", email: businessOwner.email, password: passwordPlain },
    { role: "EMPLOYEE", email: employee.email, password: passwordPlain },
    { role: "CLIENT", email: client.email, password: passwordPlain },
  ]);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

