/// <reference types="node" />

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function updateOldPaymentMethods() {
  console.log("🔄 Actualizare metode de plată vechi...\n");

  try {
    // Actualizează Payment records - folosim SQL raw direct
    const paymentResult = await prisma.$executeRawUnsafe(`
      UPDATE "Payment"
      SET method = 'CARD'::"PaymentMethod"
      WHERE method::text IN ('APPLE_PAY', 'GOOGLE_PAY', 'KLARNA')
    `);
    console.log(`✅ Actualizat ${paymentResult} înregistrări în tabela Payment`);

    // Actualizează Booking records
    const bookingResult = await prisma.$executeRawUnsafe(`
      UPDATE "Booking"
      SET "paymentMethod" = 'CARD'::"PaymentMethod"
      WHERE "paymentMethod"::text IN ('APPLE_PAY', 'GOOGLE_PAY', 'KLARNA')
    `);
    console.log(`✅ Actualizat ${bookingResult} înregistrări în tabela Booking`);

    // Actualizează Invoice records (dacă există)
    try {
      const invoiceResult = await prisma.$executeRawUnsafe(`
        UPDATE "Invoice"
        SET "paymentMethod" = 'CARD'::"PaymentMethod"
        WHERE "paymentMethod"::text IN ('APPLE_PAY', 'GOOGLE_PAY', 'KLARNA')
      `);
      console.log(`✅ Actualizat ${invoiceResult} înregistrări în tabela Invoice`);
    } catch (error: any) {
      // Ignoră eroarea dacă câmpul nu există
      if (!error.message.includes("column") && !error.message.includes("does not exist")) {
        throw error;
      }
      console.log("ℹ️  Tabela Invoice nu are câmpul paymentMethod sau nu există date de actualizat");
    }

    // Actualizează Subscription records (dacă există billingMethod)
    try {
      const subscriptionResult = await prisma.$executeRawUnsafe(`
        UPDATE "Subscription"
        SET "billingMethod" = 'CARD'::"PaymentMethod"
        WHERE "billingMethod"::text IN ('APPLE_PAY', 'GOOGLE_PAY', 'KLARNA')
      `);
      console.log(`✅ Actualizat ${subscriptionResult} înregistrări în tabela Subscription`);
    } catch (error: any) {
      // Ignoră eroarea dacă câmpul nu există
      if (!error.message.includes("column") && !error.message.includes("does not exist")) {
        throw error;
      }
      console.log("ℹ️  Tabela Subscription nu are câmpul billingMethod sau nu există date de actualizat");
    }

    console.log("\n✅ Actualizare completă! Acum poți rula 'npx prisma db push'");
  } catch (error) {
    console.error("❌ Eroare la actualizare:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateOldPaymentMethods()
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
