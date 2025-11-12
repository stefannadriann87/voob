const prisma = require("../../lib/prisma").default;

/**
 * Vizualizează toate business-urile
 */
async function viewAllBusinesses() {
  const businesses = await prisma.business.findMany({
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { bookings: true, services: true, employees: true } },
    },
  });

  return businesses.map((b: any) => ({
    id: b.id,
    name: b.name,
    domain: b.domain,
    owner: b.owner.name,
    bookingsCount: b._count.bookings,
    servicesCount: b._count.services,
    employeesCount: b._count.employees,
  }));
}

/**
 * Vizualizează tranzacțiile
 */
async function viewTransactions(args: { period: { start: string; end: string } }) {
  const bookings = await prisma.booking.findMany({
    where: {
      paid: true,
      date: {
        gte: new Date(args.period.start),
        lte: new Date(args.period.end),
      },
    },
    include: {
      service: true,
      business: { select: { name: true } },
      client: { select: { name: true } },
    },
  });

  const totalRevenue = bookings.reduce((sum: number, b: any) => sum + b.service.price, 0);

  return {
    period: args.period,
    totalTransactions: bookings.length,
    totalRevenue,
    transactions: bookings.map((b: any) => ({
      id: b.id,
      date: b.date,
      business: b.business.name,
      client: b.client.name,
      service: b.service.name,
      amount: b.service.price,
    })),
  };
}

/**
 * Generează un raport global
 */
async function generateGlobalReport(args: { period: { start: string; end: string } }) {
  const bookings = await prisma.booking.findMany({
    where: {
      date: {
        gte: new Date(args.period.start),
        lte: new Date(args.period.end),
      },
    },
    include: {
      service: true,
      business: { select: { name: true } },
    },
  });

  const businesses = await prisma.business.findMany();
  const totalRevenue = bookings.filter((b: any) => b.paid).reduce((sum: number, b: any) => sum + b.service.price, 0);

  return {
    period: args.period,
    totalBusinesses: businesses.length,
    totalBookings: bookings.length,
    totalRevenue,
    paidBookings: bookings.filter((b: any) => b.paid).length,
  };
}

module.exports = { viewAllBusinesses, viewTransactions, generateGlobalReport };

