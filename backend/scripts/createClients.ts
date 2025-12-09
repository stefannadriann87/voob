import * as bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient();

async function createClients() {
  const passwordPlain = "Password123!";
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  // Obține toate business-urile pentru a le linka cu clienții
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, businessType: true },
  });

  console.log(`\n📊 Găsite ${businesses.length} business-uri pentru linkare\n`);

  // 1. Client 1
  const client1 = await prisma.user.upsert({
    where: { email: "client1@voob.io" },
    update: {},
    create: {
      email: "client1@voob.io",
      name: "Ion Popescu",
      password: hashedPassword,
      role: Role.CLIENT,
      phone: "+40712345678",
    },
  });

  // 2. Client 2
  const client2 = await prisma.user.upsert({
    where: { email: "client2@voob.io" },
    update: {},
    create: {
      email: "client2@voob.io",
      name: "Maria Ionescu",
      password: hashedPassword,
      role: Role.CLIENT,
      phone: "+40712345679",
    },
  });

  // 3. Client 3
  const client3 = await prisma.user.upsert({
    where: { email: "client3@voob.io" },
    update: {},
    create: {
      email: "client3@voob.io",
      name: "Alexandru Georgescu",
      password: hashedPassword,
      role: Role.CLIENT,
      phone: "+40712345680",
    },
  });

  // 4. Client 4
  const client4 = await prisma.user.upsert({
    where: { email: "client4@voob.io" },
    update: {},
    create: {
      email: "client4@voob.io",
      name: "Ana Dumitrescu",
      password: hashedPassword,
      role: Role.CLIENT,
      phone: "+40712345681",
    },
  });

  // Linkează toți clienții cu toate business-urile
  const links = [];
  for (const business of businesses) {
    // Client 1 - linkat cu toate
    links.push({
      clientId: client1.id,
      businessId: business.id,
    });
    // Client 2 - linkat cu toate
    links.push({
      clientId: client2.id,
      businessId: business.id,
    });
    // Client 3 - linkat cu toate
    links.push({
      clientId: client3.id,
      businessId: business.id,
    });
    // Client 4 - linkat cu toate
    links.push({
      clientId: client4.id,
      businessId: business.id,
    });
  }

  // Șterge link-urile existente pentru acești clienți
  await prisma.clientBusinessLink.deleteMany({
    where: {
      clientId: {
        in: [client1.id, client2.id, client3.id, client4.id],
      },
    },
  });

  // Creează link-urile noi
  for (const link of links) {
    await prisma.clientBusinessLink.upsert({
      where: {
        clientId_businessId: {
          clientId: link.clientId,
          businessId: link.businessId,
        },
      },
      update: {},
      create: link,
    });
  }

  console.log("✅ Clienți creați cu succes:");
  console.table([
    {
      Nume: client1.name,
      Email: client1.email,
      Telefon: client1.phone,
      BusinessLink: `${businesses.length} business-uri`,
    },
    {
      Nume: client2.name,
      Email: client2.email,
      Telefon: client2.phone,
      BusinessLink: `${businesses.length} business-uri`,
    },
    {
      Nume: client3.name,
      Email: client3.email,
      Telefon: client3.phone,
      BusinessLink: `${businesses.length} business-uri`,
    },
    {
      Nume: client4.name,
      Email: client4.email,
      Telefon: client4.phone,
      BusinessLink: `${businesses.length} business-uri`,
    },
  ]);

  console.log("\n📧 Credentiale pentru login:");
  console.table([
    { Client: client1.name, Email: client1.email, Password: passwordPlain },
    { Client: client2.name, Email: client2.email, Password: passwordPlain },
    { Client: client3.name, Email: client3.email, Password: passwordPlain },
    { Client: client4.name, Email: client4.email, Password: passwordPlain },
  ]);

  console.log("\n✅ Toți clienții sunt linkați cu toate business-urile!\n");
}

createClients()
  .catch((error) => {
    console.error("❌ Eroare:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

