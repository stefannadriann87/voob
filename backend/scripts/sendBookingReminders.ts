/**
 * Script pentru trimiterea reminder-urilor SMS pentru rezervări
 * Rulează periodic (ex: la fiecare oră) pentru a trimite reminder-uri cu 24h înainte
 * 
 * Usage: ts-node scripts/sendBookingReminders.ts
 * Sau adaugă în cron: 0 * * * * cd /path/to/backend && npm run reminder:sms
 */

const dotenv = require("dotenv");
dotenv.config();

import prismaClient = require("@prisma/client");
const { PrismaClient } = prismaClient;
const prisma = new PrismaClient();
const { sendBookingReminderSms } = require("../src/services/smsService");

interface BookingWithDetails {
  id: string;
  date: Date;
  client: {
    name: string | null;
    phone: string | null;
  } | null;
  business: {
    name: string | null;
  } | null;
  service: {
    name: string | null;
  } | null;
}

async function sendReminders() {
  try {
    console.log("🔍 Căutând rezervări pentru reminder SMS...");

    // Calculează intervalul pentru rezervările care trebuie să primească reminder
    // Căutăm rezervări care sunt între 23-25 ore în viitor (aproximativ 24h)
    const now = new Date();
    const reminderWindowStart = new Date(now);
    reminderWindowStart.setHours(reminderWindowStart.getHours() + 23);
    reminderWindowStart.setMinutes(0);
    reminderWindowStart.setSeconds(0);
    reminderWindowStart.setMilliseconds(0);

    const reminderWindowEnd = new Date(now);
    reminderWindowEnd.setHours(reminderWindowEnd.getHours() + 25);
    reminderWindowEnd.setMinutes(0);
    reminderWindowEnd.setSeconds(0);
    reminderWindowEnd.setMilliseconds(0);

    console.log(
      `📅 Căutând rezervări între ${reminderWindowStart.toISOString()} și ${reminderWindowEnd.toISOString()}`
    );

    // Găsește rezervările confirmate care sunt în fereastra de reminder
    const bookings = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        date: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd,
        },
        // Opțional: adaugă un flag pentru a evita trimiterea de reminder-uri duplicate
        // Poți adăuga un câmp `reminderSent` în schema Prisma dacă vrei
      },
      include: {
        client: {
          select: {
            name: true,
            phone: true,
          },
        },
        business: {
          select: {
            name: true,
          },
        },
        service: {
          select: {
            name: true,
          },
        },
      },
    });

    console.log(`📧 Găsite ${bookings.length} rezervări pentru reminder`);

    let successCount = 0;
    let errorCount = 0;

    for (const booking of bookings as BookingWithDetails[]) {
      if (!booking.client?.phone) {
        console.log(`⏭️  Sări peste rezervarea ${booking.id} - clientul nu are telefon`);
        continue;
      }

      try {
        const result = await sendBookingReminderSms(
          booking.client.name || "Client",
          booking.client.phone,
          booking.business?.name || "Business",
          booking.date,
          booking.service?.name,
          24 // 24 ore înainte
        );

        if (result.success) {
          console.log(`✅ Reminder trimis pentru rezervarea ${booking.id}`);
          successCount++;
        } else {
          console.error(
            `❌ Eroare la trimiterea reminder pentru rezervarea ${booking.id}: ${result.error}`
          );
          errorCount++;
        }
      } catch (error) {
        console.error(
          `❌ Eroare la trimiterea reminder pentru rezervarea ${booking.id}:`,
          error
        );
        errorCount++;
      }
    }

    console.log(
      `\n📊 Rezumat: ${successCount} trimise cu succes, ${errorCount} erori`
    );
  } catch (error) {
    console.error("❌ Eroare fatală în scriptul de reminder:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Rulează scriptul
sendReminders()
  .then(() => {
    console.log("✅ Script finalizat");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Eroare fatală:", error);
    process.exit(1);
  });

