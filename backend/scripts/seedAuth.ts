import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function seed() {
  const defaultPasswordPlain = "Password123!";
  const superAdminEmail = "stefann.adriann@gmail.com";
  const superAdminPasswordPlain = "Develop13#";

  const hashedSuperAdminPassword = await bcrypt.hash(superAdminPasswordPlain, 10);
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordPlain, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: "Sorin SuperAdmin",
      password: hashedSuperAdminPassword,
      role: Role.SUPERADMIN,
    },
  });

  const businessOwner = await prisma.user.upsert({
    where: { email: "owner@freshcuts.app" },
    update: {},
    create: {
      email: "owner@freshcuts.app",
      name: "Andrei Business",
      password: hashedDefaultPassword,
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

  const employee = await prisma.user.upsert({
    where: { email: "employee@freshcuts.app" },
    update: {
      businessId: business.id,
    },
    create: {
      email: "employee@freshcuts.app",
      name: "Ioana Employee",
      password: hashedDefaultPassword,
      role: Role.EMPLOYEE,
      businessId: business.id,
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@larstef.app" },
    update: {},
    create: {
      email: "client@larstef.app",
      name: "Mihai Client",
      password: hashedDefaultPassword,
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
    { role: "SUPERADMIN", email: superAdmin.email, password: superAdminPasswordPlain },
    { role: "BUSINESS", email: businessOwner.email, password: defaultPasswordPlain },
    { role: "EMPLOYEE", email: employee.email, password: defaultPasswordPlain },
    { role: "CLIENT", email: client.email, password: defaultPasswordPlain },
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

