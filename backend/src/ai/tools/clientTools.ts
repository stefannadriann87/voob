const prisma = require("../../lib/prisma").default;

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

/**
 * Vizualizează rezervările clientului
 */
async function viewClientBookings(context: AIContext) {
  const bookings = await prisma.booking.findMany({
    where: { clientId: context.userId },
    include: {
      service: true,
      business: { select: { name: true } },
      employee: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  return bookings.map((b: any) => ({
    id: b.id,
    service: b.service.name,
    business: b.business.name,
    date: b.date,
    paid: b.paid,
    employee: b.employee?.name,
  }));
}

/**
 * Anulează o rezervare proprie
 */
async function cancelOwnBooking(context: AIContext, args: { bookingId: string }) {
  const booking = await prisma.booking.findFirst({
    where: { id: args.bookingId, clientId: context.userId },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu îți aparține.");
  }

  await prisma.booking.delete({ where: { id: args.bookingId } });

  return { success: true, message: "Rezervarea a fost anulată." };
}

module.exports = { viewClientBookings, cancelOwnBooking };

