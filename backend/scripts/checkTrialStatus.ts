/**
 * Script pentru a verifica statusul trial-ului pentru un business
 * Usage: npx ts-node backend/scripts/checkTrialStatus.ts medical@voob.io
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkTrialStatus(ownerEmail: string) {
  try {
    console.log(`\n🔍 Verificând statusul trial-ului pentru ${ownerEmail}...\n`);

    const user = await prisma.user.findUnique({
      where: { email: ownerEmail },
      include: {
        ownedBusinesses: {
          include: {
            subscriptions: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });

    if (!user) {
      console.error(`❌ Utilizatorul cu email ${ownerEmail} nu a fost găsit.`);
      return;
    }

    if (user.ownedBusinesses.length === 0) {
      console.error(`❌ Utilizatorul ${ownerEmail} nu are business-uri asociate.`);
      return;
    }

    const business = user.ownedBusinesses[0];

    console.log(`📊 Business: ${business.name}`);
    console.log(`   ID: ${business.id}`);
    console.log(`   Trial Start: ${business.trialStartDate ? business.trialStartDate.toLocaleString("ro-RO") : "N/A"}`);
    console.log(`   Trial End: ${business.trialEndDate ? business.trialEndDate.toLocaleString("ro-RO") : "N/A"}`);
    console.log(`   Current Date: ${new Date().toLocaleString("ro-RO")}`);
    
    const hasActiveSubscription = business.subscriptions.length > 0;
    console.log(`   Has Active Subscription: ${hasActiveSubscription ? "✅ DA" : "❌ NU"}`);
    
    if (hasActiveSubscription) {
      console.log(`   Subscription ID: ${business.subscriptions[0].id}`);
      console.log(`   Subscription Status: ${business.subscriptions[0].status}`);
    }

    if (!business.trialEndDate) {
      console.log(`\n⚠️  Business-ul nu are trialEndDate setat!`);
      return;
    }

    const now = new Date();
    const isExpired = now > business.trialEndDate;
    
    console.log(`\n${isExpired ? "🔴" : "🟢"} Trial Status: ${isExpired ? "EXPIRAT" : "ACTIV"}`);
    
    if (!isExpired) {
      const diffTime = business.trialEndDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      console.log(`   Zile rămase: ${daysRemaining}`);
    }

    console.log(`\n📋 Condiții pentru afișarea modalei:`);
    console.log(`   1. User role = BUSINESS: ${user.role === "BUSINESS" ? "✅" : "❌"}`);
    console.log(`   2. BusinessId exists: ✅`);
    console.log(`   3. No active subscription: ${!hasActiveSubscription ? "✅" : "❌"}`);
    console.log(`   4. Trial expired: ${isExpired ? "✅" : "❌"}`);
    
    const shouldShowModal = 
      user.role === "BUSINESS" && 
      !hasActiveSubscription && 
      isExpired;
    
    console.log(`\n${shouldShowModal ? "✅" : "❌"} Modala ar trebui să se afișeze: ${shouldShowModal ? "DA" : "NU"}`);
    
    if (!shouldShowModal) {
      console.log(`\n💡 Motive pentru care modala nu se afișează:`);
      if (user.role !== "BUSINESS") {
        console.log(`   - User-ul nu are rolul BUSINESS`);
      }
      if (hasActiveSubscription) {
        console.log(`   - Business-ul are un subscription activ`);
      }
      if (!isExpired) {
        console.log(`   - Trial-ul nu a expirat încă`);
      }
    }
  } catch (error) {
    console.error("❌ Eroare:", error);
  } finally {
    await prisma.$disconnect();
  }
}

const ownerEmail = process.argv[2];

if (!ownerEmail) {
  console.error("❌ Te rugăm să furnizezi email-ul owner-ului.");
  console.log("Usage: npx ts-node backend/scripts/checkTrialStatus.ts medical@voob.io");
  process.exit(1);
}

checkTrialStatus(ownerEmail);
