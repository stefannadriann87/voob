const prisma = require("../../lib/prisma");

const HOUR_IN_MS = 60 * 60 * 1000;
const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;
const CANCELLATION_LIMIT_MS = 23 * HOUR_IN_MS;
const REMINDER_GRACE_MS = 1 * HOUR_IN_MS;

const MIN_LEAD_MESSAGE = "Rezervările se pot face cu minim 2 ore înainte.";
const CANCELLATION_LIMIT_MESSAGE = "Rezervarea nu mai poate fi anulată. Ai depășit limita de anulare.";
const REMINDER_LIMIT_MESSAGE = "Timpul de anulare după reminder a expirat.";

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

/**
 * Vizualizează rezervările business-ului
 */
async function viewBusinessBookings(args: any = {}, context: AIContext) {
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
 * Creează o nouă rezervare (pentru business - folosește bookingTools.createBooking în loc)
 */
async function createBusinessBooking(
  args: {
    clientId: string;
    serviceId: string;
    employeeId?: string;
    date: string;
    paid?: boolean;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const bookingDate = new Date(args.date);
  if (Number.isNaN(bookingDate.getTime())) {
    throw new Error("Data rezervării este invalidă.");
  }

  if (bookingDate.getTime() - Date.now() < MIN_BOOKING_LEAD_MS) {
    throw new Error(MIN_LEAD_MESSAGE);
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: args.clientId,
      businessId: context.businessId,
      serviceId: args.serviceId,
      employeeId: args.employeeId,
      date: bookingDate,
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
 * Anulează o rezervare (pentru business - folosește bookingTools.cancelBooking în loc)
 */
async function cancelBusinessBooking(args: { bookingId: string }, context: AIContext) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const booking = await prisma.booking.findFirst({
    where: { id: args.bookingId, businessId: context.businessId },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu aparține acestui business.");
  }

  const now = new Date();
  const bookingDate = new Date(booking.date);

  if (booking.reminderSentAt) {
    const reminderDate = new Date(booking.reminderSentAt);
    if (!Number.isNaN(reminderDate.getTime()) && now.getTime() > reminderDate.getTime() + REMINDER_GRACE_MS) {
      throw new Error(REMINDER_LIMIT_MESSAGE);
    }
  }

  if (bookingDate.getTime() - now.getTime() < CANCELLATION_LIMIT_MS) {
    throw new Error(CANCELLATION_LIMIT_MESSAGE);
  }

  await prisma.booking.delete({ where: { id: args.bookingId } });

  return { success: true, message: "Rezervarea a fost anulată." };
}

/**
 * Generează un raport de activitate
 */
async function generateReport(
  args: { period: { start: string; end: string } },
  context: AIContext
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

/**
 * Listează employee-ii business-ului
 */
async function listEmployees(
  args: any = {},
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const employees = await prisma.user.findMany({
    where: {
      businessId: context.businessId,
      role: "EMPLOYEE",
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      specialization: true,
      avatar: true,
    },
    orderBy: { name: "asc" },
  });

  return employees;
}

/**
 * Creează un employee nou
 */
async function createEmployee(
  args: {
    name: string;
    email: string;
    phone?: string;
    specialization?: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  // Verifică dacă email-ul există deja
  const existingUser = await prisma.user.findUnique({
    where: { email: args.email.trim() },
  });

  if (existingUser) {
    throw new Error("Un utilizator cu acest email există deja.");
  }

  const bcrypt = require("bcryptjs");
  const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  const employee = await prisma.user.create({
    data: {
      email: args.email.trim(),
      password: hashedPassword,
      name: args.name.trim(),
      phone: args.phone?.trim() || null,
      specialization: args.specialization?.trim() || null,
      role: "EMPLOYEE",
      businessId: context.businessId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      specialization: true,
    },
  });

  return {
    success: true,
    message: `Employee-ul ${employee.name} a fost creat cu succes.`,
    employee,
    temporaryPassword: randomPassword, // Pentru informare (nu se trimite în producție)
  };
}

/**
 * Actualizează un employee
 */
async function updateEmployee(
  args: {
    employeeId: string;
    name?: string;
    email?: string;
    phone?: string;
    specialization?: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const employee = await prisma.user.findFirst({
    where: {
      id: args.employeeId,
      businessId: context.businessId,
      role: "EMPLOYEE",
    },
  });

  if (!employee) {
    throw new Error("Employee-ul nu a fost găsit sau nu aparține acestui business.");
  }

  const updateData: any = {};
  if (args.name) updateData.name = args.name.trim();
  if (args.email) {
    // Verifică dacă noul email există deja
    const existingUser = await prisma.user.findUnique({
      where: { email: args.email.trim() },
    });
    if (existingUser && existingUser.id !== args.employeeId) {
      throw new Error("Un utilizator cu acest email există deja.");
    }
    updateData.email = args.email.trim();
  }
  if (args.phone !== undefined) updateData.phone = args.phone?.trim() || null;
  if (args.specialization !== undefined) updateData.specialization = args.specialization?.trim() || null;

  const updatedEmployee = await prisma.user.update({
    where: { id: args.employeeId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      specialization: true,
    },
  });

  return {
    success: true,
    message: `Employee-ul ${updatedEmployee.name} a fost actualizat cu succes.`,
    employee: updatedEmployee,
  };
}

/**
 * Șterge un employee
 */
async function deleteEmployee(
  args: { employeeId: string },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const employee = await prisma.user.findFirst({
    where: {
      id: args.employeeId,
      businessId: context.businessId,
      role: "EMPLOYEE",
    },
  });

  if (!employee) {
    throw new Error("Employee-ul nu a fost găsit sau nu aparține acestui business.");
  }

  await prisma.user.delete({
    where: { id: args.employeeId },
  });

  return {
    success: true,
    message: `Employee-ul ${employee.name} a fost șters cu succes.`,
  };
}

/**
 * Listează serviciile business-ului
 */
async function listServices(
  args: any = {},
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const services = await prisma.service.findMany({
    where: { businessId: context.businessId },
    select: {
      id: true,
      name: true,
      duration: true,
      price: true,
      notes: true,
    },
    orderBy: { name: "asc" },
  });

  return services;
}

/**
 * Creează un serviciu nou
 */
async function createService(
  args: {
    name: string;
    duration: number;
    price: number;
    notes?: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  if (!args.name || typeof args.duration !== "number" || typeof args.price !== "number") {
    throw new Error("name, duration și price sunt obligatorii.");
  }

  const service = await prisma.service.create({
    data: {
      name: args.name.trim(),
      duration: args.duration,
      price: args.price,
      notes: args.notes?.trim() || null,
      business: { connect: { id: context.businessId } },
    },
  });

  return {
    success: true,
    message: `Serviciul ${service.name} a fost creat cu succes.`,
    service,
  };
}

/**
 * Actualizează un serviciu
 */
async function updateService(
  args: {
    serviceId: string;
    name?: string;
    duration?: number;
    price?: number;
    notes?: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const service = await prisma.service.findFirst({
    where: {
      id: args.serviceId,
      businessId: context.businessId,
    },
  });

  if (!service) {
    throw new Error("Serviciul nu a fost găsit sau nu aparține acestui business.");
  }

  const updateData: any = {};
  if (args.name) updateData.name = args.name.trim();
  if (args.duration !== undefined) updateData.duration = args.duration;
  if (args.price !== undefined) updateData.price = args.price;
  if (args.notes !== undefined) updateData.notes = args.notes?.trim() || null;

  const updatedService = await prisma.service.update({
    where: { id: args.serviceId },
    data: updateData,
  });

  return {
    success: true,
    message: `Serviciul ${updatedService.name} a fost actualizat cu succes.`,
    service: updatedService,
  };
}

/**
 * Șterge un serviciu
 */
async function deleteService(
  args: { serviceId: string },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const service = await prisma.service.findFirst({
    where: {
      id: args.serviceId,
      businessId: context.businessId,
    },
  });

  if (!service) {
    throw new Error("Serviciul nu a fost găsit sau nu aparține acestui business.");
  }

  await prisma.service.delete({
    where: { id: args.serviceId },
  });

  return {
    success: true,
    message: `Serviciul ${service.name} a fost șters cu succes.`,
  };
}

/**
 * Actualizează working hours pentru business
 */
async function updateWorkingHours(
  args: {
    day: string;
    hours: { start: string; end: string }[];
    enabled?: boolean;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const business = await prisma.business.findUnique({
    where: { id: context.businessId },
    select: { workingHours: true },
  });

  if (!business) {
    throw new Error("Business-ul nu a fost găsit.");
  }

  const workingHours = (business.workingHours as any) || {};
  workingHours[args.day.toLowerCase()] = {
    enabled: args.enabled !== undefined ? args.enabled : true,
    hours: args.hours,
  };

  await prisma.business.update({
    where: { id: context.businessId },
    data: { workingHours },
  });

  return {
    success: true,
    message: `Programul de lucru pentru ${args.day} a fost actualizat cu succes.`,
  };
}

/**
 * Adaugă o sărbătoare (holiday)
 */
async function addHoliday(
  args: {
    startDate: string;
    endDate: string;
    description?: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const startDate = new Date(args.startDate);
  const endDate = new Date(args.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Datele sunt invalide.");
  }

  if (startDate > endDate) {
    throw new Error("Data de început trebuie să fie înainte de data de sfârșit.");
  }

  const holiday = await prisma.holiday.create({
    data: {
      businessId: context.businessId,
      startDate,
      endDate,
      description: args.description?.trim() || null,
    },
  });

  return {
    success: true,
    message: "Sărbătoarea a fost adăugată cu succes.",
    holiday,
  };
}

/**
 * Generează statistici avansate pentru business
 */
async function generateAdvancedStats(
  args: {
    startDate: string;
    endDate: string;
  },
  context: AIContext
) {
  if (!context.businessId) {
    throw new Error("Business ID required");
  }

  const bookings = await prisma.booking.findMany({
    where: {
      businessId: context.businessId,
      date: {
        gte: new Date(args.startDate),
        lte: new Date(args.endDate),
      },
    },
    include: {
      service: { select: { id: true, name: true, price: true, duration: true } },
      client: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
  });

  const totalRevenue = bookings
    .filter((b: any) => b.paid)
    .reduce((sum: number, b: any) => sum + (b.service?.price || 0), 0);

  const totalBookings = bookings.length;
  const paidBookings = bookings.filter((b: any) => b.paid).length;
  const unpaidBookings = totalBookings - paidBookings;

  // Top servicii
  const serviceStats: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach((b: any) => {
    const serviceName = b.service?.name || "Necunoscut";
    if (!serviceStats[serviceName]) {
      serviceStats[serviceName] = { count: 0, revenue: 0 };
    }
    serviceStats[serviceName].count++;
    if (b.paid) {
      serviceStats[serviceName].revenue += b.service?.price || 0;
    }
  });

  const topServices = Object.entries(serviceStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Top clienți
  const clientStats: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach((b: any) => {
    const clientName = b.client?.name || "Necunoscut";
    if (!clientStats[clientName]) {
      clientStats[clientName] = { count: 0, revenue: 0 };
    }
    clientStats[clientName].count++;
    if (b.paid) {
      clientStats[clientName].revenue += b.service?.price || 0;
    }
  });

  const topClients = Object.entries(clientStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Top employee-i
  const employeeStats: Record<string, { count: number; revenue: number }> = {};
  bookings.forEach((b: any) => {
    const employeeName = b.employee?.name || "Necunoscut";
    if (!employeeStats[employeeName]) {
      employeeStats[employeeName] = { count: 0, revenue: 0 };
    }
    employeeStats[employeeName].count++;
    if (b.paid) {
      employeeStats[employeeName].revenue += b.service?.price || 0;
    }
  });

  const topEmployees = Object.entries(employeeStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    period: { start: args.startDate, end: args.endDate },
    summary: {
      totalBookings,
      paidBookings,
      unpaidBookings,
      totalRevenue,
      averageRevenue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    },
    topServices,
    topClients,
    topEmployees,
  };
}

module.exports = {
  viewBusinessBookings,
  createBusinessBooking,
  cancelBusinessBooking,
  generateReport,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listServices,
  createService,
  updateService,
  deleteService,
  updateWorkingHours,
  addHoliday,
  generateAdvancedStats,
};

