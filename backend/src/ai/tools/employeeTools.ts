
const HOUR_IN_MS = 60 * 60 * 1000;
const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;

const prisma = require("../../lib/prisma");
const { createBookingForClientToolSchema, getEmployeeAvailabilityToolSchema } = require("./toolSchemas");
const { logger } = require("../../lib/logger");

/**
 * Vizualizează rezervările employee-ului
 */
async function viewEmployeeBookings(
  args: { startDate?: string; endDate?: string; status?: string } = {},
  context: any
) {
  const { userId, businessId } = context;

  if (!businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  const where: any = {
    businessId,
    employeeId: userId, // Doar rezervările employee-ului
  };

  if (args.startDate || args.endDate) {
    where.date = {};
    if (args.startDate) where.date.gte = new Date(args.startDate);
    if (args.endDate) where.date.lte = new Date(args.endDate);
  }

  if (args.status) {
    where.status = args.status;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      service: { select: { id: true, name: true, price: true, duration: true } },
      business: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return bookings.map((b: any) => ({
    id: b.id,
    client: b.client.name,
    clientEmail: b.client.email,
    clientPhone: b.client.phone,
    service: b.service.name,
    servicePrice: b.service.price,
    serviceDuration: b.service.duration,
    date: b.date.toISOString(),
    paid: b.paid,
    status: b.status,
  }));
}

/**
 * Creează o rezervare pentru un client (employee)
 */
async function createBookingForClient(
  args: {
    clientId: string;
    serviceId: string;
    date: string;
    paid?: boolean;
  },
  context: any
) {
  // Validare input cu Zod
  const validatedArgs = createBookingForClientToolSchema.parse(args);
  
  const { userId, businessId } = context;

  if (!businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  // Verifică dacă business-ul este suspendat
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, status: true },
  });

  if (!business) {
    throw new Error("Business-ul nu a fost găsit.");
  }

  if (business.status === "SUSPENDED") {
    throw new Error("Business-ul este suspendat. Rezervările sunt oprite temporar.");
  }

  // Verifică că serviciul aparține business-ului
  const service = await prisma.service.findFirst({
    where: { id: validatedArgs.serviceId, businessId },
  });

  if (!service) {
    throw new Error("Serviciul nu a fost găsit sau nu aparține acestui business.");
  }

  // Verifică că clientul există
  const client = await prisma.user.findUnique({
    where: { id: validatedArgs.clientId, role: "CLIENT" },
  });

  if (!client) {
    throw new Error("Clientul nu a fost găsit.");
  }

  const bookingDate = new Date(validatedArgs.date);
  if (Number.isNaN(bookingDate.getTime())) {
    throw new Error("Data rezervării este invalidă.");
  }

  if (bookingDate.getTime() - Date.now() < MIN_BOOKING_LEAD_MS) {
    throw new Error("Rezervările se pot face cu minim 2 ore înainte.");
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: validatedArgs.clientId,
      businessId,
      serviceId: validatedArgs.serviceId,
      employeeId: userId, // Automat employee-ul autentificat
      date: bookingDate,
      paid: validatedArgs.paid || false,
      status: "CONFIRMED",
    },
    include: {
      client: { select: { name: true, phone: true } },
      service: { select: { name: true } },
      business: { select: { name: true, id: true } },
    },
  });

  // Trimite SMS de confirmare
  if (booking.client.phone) {
    const { sendBookingConfirmationSms } = require("../../services/smsService");
    sendBookingConfirmationSms(
      booking.client.name || "Client",
      booking.client.phone,
      booking.business.name || "Business",
      booking.date,
      booking.service?.name,
      booking.business.id
    ).catch((error: unknown) => {
      logger.error("Failed to send confirmation SMS:", error);
    });
  }

  return {
    success: true,
    message: `Rezervarea a fost creată cu succes pentru ${booking.client.name}.`,
    bookingId: booking.id,
  };
}

/**
 * Anulează o rezervare (employee)
 */
async function cancelEmployeeBooking(
  args: { bookingId: string },
  context: any
) {
  const { userId, businessId } = context;

  if (!businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id: args.bookingId,
      businessId,
      employeeId: userId, // Doar rezervările employee-ului
    },
    include: {
      client: { select: { name: true, phone: true } },
      business: { select: { id: true, name: true } },
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu îți aparține.");
  }

  // Salvează datele pentru SMS
  const clientName = booking.client?.name || "Client";
  const clientPhone = booking.client?.phone;
  const businessName = booking.business?.name || "Business";
  const bookingDate = booking.date;

  await prisma.booking.delete({ where: { id: args.bookingId } });

  // Trimite SMS de anulare
  if (clientPhone && booking.business?.id) {
    const { sendBookingCancellationSms } = require("../../services/smsService");
const { logger } = require("../../lib/logger");
    sendBookingCancellationSms(
      clientName,
      clientPhone,
      businessName,
      bookingDate,
      booking.business.id
    ).catch((error: unknown) => {
      logger.error("Failed to send cancellation SMS:", error);
    });
  }

  return { success: true, message: "Rezervarea a fost anulată cu succes." };
}

/**
 * Actualizează o rezervare (employee)
 */
async function updateEmployeeBooking(
  args: {
    bookingId: string;
    date?: string;
    serviceId?: string;
    paid?: boolean;
  },
  context: any
) {
  const { userId, businessId } = context;

  if (!businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  const booking = await prisma.booking.findFirst({
    where: {
      id: args.bookingId,
      businessId,
      employeeId: userId,
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu îți aparține.");
  }

  const updateData: any = {};

  if (args.date) {
    const newDate = new Date(args.date);
    if (Number.isNaN(newDate.getTime())) {
      throw new Error("Data rezervării este invalidă.");
    }
    if (newDate.getTime() - Date.now() < MIN_BOOKING_LEAD_MS) {
      throw new Error("Rezervările se pot face cu minim 2 ore înainte.");
    }
    updateData.date = newDate;
  }

  if (args.serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: args.serviceId, businessId },
    });
    if (!service) {
      throw new Error("Serviciul nu a fost găsit sau nu aparține acestui business.");
    }
    updateData.serviceId = args.serviceId;
  }

  if (args.paid !== undefined) {
    updateData.paid = args.paid;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("Nu ai specificat nicio modificare.");
  }

  await prisma.booking.update({
    where: { id: args.bookingId },
    data: updateData,
  });

  return { success: true, message: "Rezervarea a fost actualizată cu succes." };
}

/**
 * Verifică disponibilitatea employee-ului
 */
async function getEmployeeAvailability(
  args: { date?: string },
  context: any
) {
  const { userId, businessId } = context;

  if (!businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  const validatedArgs = getEmployeeAvailabilityToolSchema.parse(args);
  const targetDate = validatedArgs.date ? new Date(validatedArgs.date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      businessId,
      employeeId: userId,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      status: { not: "CANCELLED" },
    },
    include: {
      service: { select: { duration: true } },
    },
  });

  return {
    date: targetDate.toISOString().split("T")[0],
    totalBookings: bookings.length,
    bookings: bookings.map((b: any) => ({
      id: b.id,
      time: b.date.toISOString(),
      duration: b.service?.duration || 60,
    })),
  };
}

module.exports = {
  viewEmployeeBookings,
  createBookingForClient,
  cancelEmployeeBooking,
  updateEmployeeBooking,
  getEmployeeAvailability,
};

