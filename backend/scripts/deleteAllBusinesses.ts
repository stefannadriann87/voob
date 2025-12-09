import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Șterge toate business-urile din baza de date
 * Usage: npx ts-node scripts/deleteAllBusinesses.ts
 */
async function deleteAllBusinesses() {
  console.log("\n🗑️  Șterg toate business-urile...\n");

  // Șterge în ordine pentru a respecta constrângerile de foreign key
  // Prisma va șterge automat în cascade datorită onDelete: Cascade

  // 1. Șterge bookings
  const bookingsDeleted = await prisma.booking.deleteMany({});
  console.log(`✅ Șterse ${bookingsDeleted.count} rezervări`);

  // 2. Șterge services
  const servicesDeleted = await prisma.service.deleteMany({});
  console.log(`✅ Șterse ${servicesDeleted.count} servicii`);

  // 3. Șterge courts și court pricing
  const courtPricingDeleted = await prisma.courtPricing.deleteMany({});
  console.log(`✅ Șterse ${courtPricingDeleted.count} tarife terenuri`);

  const courtsDeleted = await prisma.court.deleteMany({});
  console.log(`✅ Șterse ${courtsDeleted.count} terenuri`);

  // 4. Șterge client business links
  const linksDeleted = await prisma.clientBusinessLink.deleteMany({});
  console.log(`✅ Șterse ${linksDeleted.count} link-uri client-business`);

  // 5. Șterge payments
  const paymentsDeleted = await prisma.payment.deleteMany({});
  console.log(`✅ Șterse ${paymentsDeleted.count} plăți`);

  // 6. Șterge invoices
  const invoicesDeleted = await prisma.invoice.deleteMany({});
  console.log(`✅ Șterse ${invoicesDeleted.count} facturi`);

  // 7. Șterge employees (users cu businessId)
  const employeesDeleted = await prisma.user.updateMany({
    where: { role: "EMPLOYEE" },
    data: { businessId: null },
  });
  console.log(`✅ Actualizați ${employeesDeleted.count} angajați (businessId setat la null)`);

  // 8. Șterge business owners (users cu role BUSINESS)
  const businessOwners = await prisma.user.findMany({
    where: { role: "BUSINESS" },
    select: { id: true, email: true },
  });
  console.log(`📊 Găsiți ${businessOwners.length} business owners`);

  // 9. Șterge business-urile
  const businessesDeleted = await prisma.business.deleteMany({});
  console.log(`✅ Șterse ${businessesDeleted.count} business-uri`);

  // 8. Șterge business owners (opțional - comentat pentru a păstra userii)
  // const ownersDeleted = await prisma.user.deleteMany({
  //   where: { role: "BUSINESS" },
  // });
  // console.log(`✅ Șterse ${ownersDeleted.count} business owners`);

  console.log("\n✅ Toate business-urile au fost șterse cu succes!\n");
}

deleteAllBusinesses()
  .catch((error) => {
    console.error("❌ Eroare:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

