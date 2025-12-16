/**
 * Script pentru a expira trial-ul pentru un business specific
 * Usage: npx ts-node backend/scripts/expireTrialForBusiness.ts medical@voob.io
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function expireTrialForBusiness(ownerEmail: string) {
  try {
    console.log(`\n🔍 Căutând business-ul pentru ${ownerEmail}...`);

    // Găsește user-ul
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

    console.log(`\n✅ Business găsit: ${business.name} (ID: ${business.id})`);

    // Verifică dacă are subscription activ
    if (business.subscriptions.length > 0) {
      console.log(`⚠️  Business-ul are deja un subscription activ.`);
      console.log(`   Subscription ID: ${business.subscriptions[0].id}`);
      console.log(`   Status: ${business.subscriptions[0].status}`);
      console.log(`\n💡 Pentru a testa fluxul, trebuie să anulezi mai întâi subscription-ul.`);
      return;
    }

    // Setează trialEndDate în trecut (cu 1 zi în urmă)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const updatedBusiness = await prisma.business.update({
      where: { id: business.id },
      data: {
        trialEndDate: yesterday,
        trialStartDate: new Date(yesterday.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 zile în urmă
      },
    });

    console.log(`\n✅ Trial-ul a fost setat ca expirat!`);
    console.log(`   Trial Start: ${updatedBusiness.trialStartDate?.toLocaleString("ro-RO")}`);
    console.log(`   Trial End: ${updatedBusiness.trialEndDate?.toLocaleString("ro-RO")}`);
    console.log(`\n🎯 Acum poți testa fluxul complet:`);
    console.log(`   1. Loghează-te cu ${ownerEmail}`);
    console.log(`   2. Ar trebui să vezi modala TrialExpiredModal`);
    console.log(`   3. Alege un plan`);
    console.log(`   4. Completează checkout-ul Stripe`);
    console.log(`   5. Vezi modala de success și primește email-ul de confirmare`);
    console.log(`\n`);
  } catch (error) {
    console.error("❌ Eroare:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Rulează script-ul
const ownerEmail = process.argv[2];

if (!ownerEmail) {
  console.error("❌ Te rugăm să furnizezi email-ul owner-ului.");
  console.log("Usage: npx ts-node backend/scripts/expireTrialForBusiness.ts medical@voob.io");
  process.exit(1);
}

expireTrialForBusiness(ownerEmail);
