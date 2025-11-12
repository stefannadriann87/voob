const prisma = require("../../lib/prisma").default;

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

/**
 * Vizualizează rezervările business-ului
 */
async function viewBusinessBookings(context: AIContext) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const bookings = await prisma.booking.findMany({
    where: { businessId: context.businessId },
    include: {
      service: true,
      client: { select: { name: true, email: true, phone: true } },
      employee: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 20,
  });

  return bookings.map((b: any) => ({
    id: b.id,
    service: b.service.name,
    client: b.client.name,
    clientEmail: b.client.email,
    clientPhone: b.client.phone,
    date: b.date,
    paid: b.paid,
    employee: b.employee?.name,
  }));
}

/**
 * Creează o nouă rezervare
 */
async function createBooking(
  context: AIContext,
  args: {
    clientId: string;
    serviceId: string;
    employeeId?: string;
    date: string;
    paid?: boolean;
  }
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: args.clientId,
      businessId: context.businessId,
      serviceId: args.serviceId,
      employeeId: args.employeeId,
      date: new Date(args.date),
      paid: args.paid || false,
    },
    include: {
      service: true,
      client: { select: { name: true, email: true } },
    },
  });

  return {
    id: booking.id,
    service: booking.service.name,
    client: booking.client.name,
    date: booking.date,
  };
}

/**
 * Anulează o rezervare
 */
async function cancelBooking(context: AIContext, args: { bookingId: string }) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const booking = await prisma.booking.findFirst({
    where: { id: args.bookingId, businessId: context.businessId },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu aparține acestui business.");
  }

  await prisma.booking.delete({ where: { id: args.bookingId } });

  return { success: true, message: "Rezervarea a fost anulată." };
}

/**
 * Generează un raport de activitate
 */
async function generateReport(
  context: AIContext,
  args: { period: { start: string; end: string } }
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      businessId: context.businessId,
      date: {
        gte: new Date(args.period.start),
        lte: new Date(args.period.end),
      },
    },
    include: {
      service: true,
      client: { select: { name: true } },
    },
  });

  const totalRevenue = bookings.filter((b: any) => b.paid).reduce((sum: number, b: any) => sum + b.service.price, 0);

  return {
    period: args.period,
    totalBookings: bookings.length,
    totalRevenue,
    paidBookings: bookings.filter((b: any) => b.paid).length,
    bookings: bookings.map((b: any) => ({
      date: b.date,
      service: b.service.name,
      client: b.client.name,
      paid: b.paid,
      amount: b.service.price,
    })),
  };
}

module.exports = { viewBusinessBookings, createBooking, cancelBooking, generateReport };

