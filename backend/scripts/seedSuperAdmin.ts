import bcrypt = require("bcryptjs");
import prismaClient = require("@prisma/client");

const { PrismaClient, Role } = prismaClient;
const prisma = new PrismaClient();

async function seed() {
  const passwordPlain = "Develop13#";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "stefann.adriann@gmail.com" },
    update: {
      name: "Stefan Adrian",
      password: hashedPassword,
      phone: "0748293830",
      role: Role.SUPERADMIN,
    },
    create: {
      email: "stefann.adriann@gmail.com",
      name: "Stefan Adrian",
      password: hashedPassword,
      phone: "0748293830",
      role: Role.SUPERADMIN,
    },
  });

  console.log("SuperAdmin creat/actualizat cu succes:");
  console.table([
    { 
      role: "SUPERADMIN", 
      email: superAdmin.email, 
      name: superAdmin.name,
      phone: superAdmin.phone,
      password: passwordPlain 
    },
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

