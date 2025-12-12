/**
 * Script pentru crearea utilizatorilor de test
 */

import { PrismaClient, Role, BusinessType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedTestUsers() {
  try {
    console.log("🌱 Seeding test users...");

    const password = await bcrypt.hash("Password123!", 10);

    // Business users
    const businessUsers = [
      { email: "general@voob.io", name: "General Business", businessType: BusinessType.GENERAL },
      { email: "beauty@voob.io", name: "Beauty & Wellness", businessType: BusinessType.BEAUTY_WELLNESS },
      { email: "medical@voob.io", name: "Medical & Dental", businessType: BusinessType.MEDICAL_DENTAL },
      { email: "therapy@voob.io", name: "Therapy & Coaching", businessType: BusinessType.THERAPY_COACHING },
      { email: "sport@voob.io", name: "Sport & Outdoor", businessType: BusinessType.SPORT_OUTDOOR },
      { email: "home@voob.io", name: "Home & Freelance", businessType: BusinessType.HOME_FREELANCE },
    ];

    // Client users
    const clientUsers = [
      { email: "client1@voob.io", name: "Ion Popescu" },
      { email: "client2@voob.io", name: "Maria Ionescu" },
      { email: "client3@voob.io", name: "Alexandru Georgescu" },
      { email: "client4@voob.io", name: "Ana Dumitrescu" },
    ];

    // Create business users
    console.log("\n📊 Creating business users...");
    for (const userData of businessUsers) {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        console.log(`   ⏭️  ${userData.email} already exists, skipping...`);
        continue;
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password,
          name: userData.name,
          role: Role.BUSINESS,
        },
      });

      // Generate domain from email
      const emailParts = userData.email.split("@");
      const domain = emailParts[0] ? emailParts[0].replace(/[^a-z0-9]/g, "-") : userData.email.replace(/[^a-z0-9]/g, "-");

      // Create business
      if (!user.id) {
        throw new Error(`Failed to create user: ${userData.email}`);
      }
      const business = await prisma.business.create({
        data: {
          name: userData.name,
          email: userData.email,
          domain: domain,
          businessType: userData.businessType,
          ownerId: user.id,
          status: "ACTIVE",
        },
      });

      // Update user with businessId
      await prisma.user.update({
        where: { id: user.id },
        data: { businessId: business.id },
      });

      console.log(`   ✅ Created: ${userData.email} (${userData.businessType})`);
    }

    // Create client users
    console.log("\n👥 Creating client users...");
    for (const userData of clientUsers) {
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        console.log(`   ⏭️  ${userData.email} already exists, skipping...`);
        continue;
      }

      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password,
          name: userData.name,
          role: Role.CLIENT,
        },
      });

      console.log(`   ✅ Created: ${userData.email}`);
    }

    console.log("\n✅ Test users seeded successfully!");
    console.log("\n📝 Login credentials:");
    console.log("   Password for all users: Password123!");
    console.log("\n   Business users:");
    businessUsers.forEach((u: any) => console.log(`   - ${u.email}`));
    console.log("\n   Client users:");
    clientUsers.forEach((u: any) => console.log(`   - ${u.email}`));
  } catch (error) {
    console.error("❌ Error seeding test users:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestUsers();
