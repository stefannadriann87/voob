/**
 * Script pentru a fixa business-ul SPORT_OUTDOOR
 * - Verifică dacă există business-ul "Club Sport & Outdoor"
 * - Creează business-ul dacă nu există
 * - Asigură că are status ACTIVE
 * - Creează courts dacă nu există
 * - Linkează client1@voob.io la business
 */

import { PrismaClient, BusinessType, BusinessStatus, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function fixSportBusiness() {
  try {
    console.log("🔍 Verificare business SPORT_OUTDOOR...");

    // 1. Găsește sau creează owner-ul
    const ownerEmail = "sport@voob.io";
    let owner = await prisma.user.findUnique({
      where: { email: ownerEmail },
    });

    if (!owner) {
      console.log("📝 Creare owner sport@voob.io...");
      const hashedPassword = await bcrypt.hash("password123", 10);
      owner = await prisma.user.create({
        data: {
          email: ownerEmail,
          name: "Sport & Outdoor Owner",
          password: hashedPassword,
          role: Role.BUSINESS,
        },
      });
      console.log("✅ Owner creat:", owner.id);
    } else {
      console.log("✅ Owner există:", owner.id);
    }

    // 2. Găsește sau creează business-ul
    const businessDomain = "club-sport-outdoor";
    let business = await prisma.business.findUnique({
      where: { domain: businessDomain },
      include: {
        courts: true,
      },
    });

    if (!business) {
      console.log("📝 Creare business Club Sport & Outdoor...");
      business = await prisma.business.create({
        data: {
          name: "Club Sport & Outdoor",
          email: "contact@sportoutdoor.ro",
          domain: businessDomain,
          businessType: BusinessType.SPORT_OUTDOOR,
          status: BusinessStatus.ACTIVE, // CRITICAL: Setează explicit ACTIVE
          owner: { connect: { id: owner.id } },
        },
        include: {
          courts: true,
        },
      });
      console.log("✅ Business creat:", business.id);
    } else {
      // Asigură-te că business-ul este ACTIVE
      if (business.status !== BusinessStatus.ACTIVE) {
        console.log("⚠️  Business-ul este SUSPENDED, setăm ACTIVE...");
        business = await prisma.business.update({
          where: { id: business.id },
          data: { status: BusinessStatus.ACTIVE },
          include: {
            courts: true,
          },
        });
        console.log("✅ Business setat la ACTIVE");
      } else {
        console.log("✅ Business există și este ACTIVE:", business.id);
      }
    }

    // 3. Creează courts dacă nu există
    if (!business.courts || business.courts.length === 0) {
      console.log("📝 Creare courts...");
      
      const courts = [
        { name: "Teren 1", number: 1 },
        { name: "Teren 2", number: 2 },
        { name: "Teren 3", number: 3 },
      ];

      for (const courtData of courts) {
        const court = await prisma.court.upsert({
          where: {
            businessId_number: {
              businessId: business.id,
              number: courtData.number,
            },
          },
          update: {
            isActive: true,
          },
          create: {
            businessId: business.id,
            name: courtData.name,
            number: courtData.number,
            isActive: true,
          },
        });

        // Creează pricing pentru fiecare court
        const pricingData = [
          { timeSlot: "MORNING" as const, price: 50, startHour: 8, endHour: 12 },
          { timeSlot: "AFTERNOON" as const, price: 80, startHour: 12, endHour: 18 },
          { timeSlot: "NIGHT" as const, price: 100, startHour: 18, endHour: 22 },
        ];

        for (const priceData of pricingData) {
          await prisma.courtPricing.upsert({
            where: {
              courtId_timeSlot: {
                courtId: court.id,
                timeSlot: priceData.timeSlot,
              },
            },
            update: priceData,
            create: {
              courtId: court.id,
              ...priceData,
            },
          });
        }

        console.log(`✅ Court ${courtData.name} creat cu pricing`);
      }
    } else {
      console.log(`✅ Business-ul are deja ${business.courts.length} courts`);
    }

    // 4. Linkează client1@voob.io la business
    const clientEmail = "client1@voob.io";
    const client = await prisma.user.findUnique({
      where: { email: clientEmail },
    });

    if (client) {
      const link = await prisma.clientBusinessLink.upsert({
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
          method: "MANUAL",
        },
      });
      console.log("✅ Client linkat la business:", link.id);
    } else {
      console.log("⚠️  Client client1@voob.io nu există, va trebui creat separat");
    }

    // 5. Verificare finală
    const finalBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        courts: {
          include: {
            pricing: true,
          },
        },
        owner: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    console.log("\n📊 Rezumat:");
    console.log("Business ID:", finalBusiness?.id);
    console.log("Business Name:", finalBusiness?.name);
    console.log("Business Domain:", finalBusiness?.domain);
    console.log("Business Status:", finalBusiness?.status);
    console.log("Business Type:", finalBusiness?.businessType);
    console.log("Courts Count:", finalBusiness?.courts.length);
    console.log("Owner:", finalBusiness?.owner.email);

    console.log("\n✅ Fix completat cu succes!");

  } catch (error) {
    console.error("❌ Eroare la fix:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixSportBusiness()
  .then(() => {
    console.log("✅ Script finalizat");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Eroare:", error);
    process.exit(1);
  });
