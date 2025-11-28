const prisma = require("../../lib/prisma");
const { sendBookingCancellationSms } = require("../../services/smsService");

const HOUR_IN_MS = 60 * 60 * 1000;
const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;
const CANCELLATION_LIMIT_MS = 23 * HOUR_IN_MS;

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
  linkedBusinesses?: any[];
}

/**
 * Vizualizează rezervările clientului
 */
async function viewClientBookings(
  args: { startDate?: string; endDate?: string; status?: string } = {},
  context: AIContext
) {
  const where: any = { clientId: context.userId };
  
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
      service: { select: { id: true, name: true, price: true, duration: true } },
      business: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return bookings.map((b: any) => ({
    id: b.id,
    service: b.service.name,
    servicePrice: b.service.price,
    serviceDuration: b.service.duration,
    business: b.business.name,
    businessId: b.business.id,
    date: b.date.toISOString(),
    paid: b.paid,
    status: b.status,
    employee: b.employee?.name || null,
  }));
}

/**
 * Anulează o rezervare proprie
 */
async function cancelOwnBooking(
  args: { bookingId: string },
  context: AIContext
) {
  const booking = await prisma.booking.findFirst({
    where: { id: args.bookingId, clientId: context.userId },
    include: {
      client: { select: { name: true, phone: true } },
      business: { select: { id: true, name: true } },
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită sau nu îți aparține.");
  }

  // Verifică regulile de anulare
  const now = new Date();
  const bookingDate = new Date(booking.date);
  
  if (bookingDate.getTime() - now.getTime() < CANCELLATION_LIMIT_MS) {
    throw new Error("Rezervarea nu mai poate fi anulată. Limita este de 23 de ore înainte.");
  }

  // Salvează datele pentru SMS înainte de ștergere
  const clientName = booking.client?.name || "Client";
  const clientPhone = booking.client?.phone;
  const businessName = booking.business?.name || "Business";
  const bookingDateValue = booking.date;

  await prisma.booking.delete({ where: { id: args.bookingId } });

  // Trimite SMS de anulare
  if (clientPhone && booking.business?.id) {
    sendBookingCancellationSms(
      clientName,
      clientPhone,
      businessName,
      bookingDateValue,
      booking.business.id
    ).catch((error: unknown) => {
      console.error("Failed to send cancellation SMS:", error);
    });
  }

  return { success: true, message: "Rezervarea a fost anulată cu succes." };
}

/**
 * Actualizează o rezervare proprie
 */
async function updateOwnBooking(
  args: {
    bookingId: string;
    date?: string;
    serviceId?: string;
    employeeId?: string;
  },
  context: AIContext
) {
  const booking = await prisma.booking.findFirst({
    where: { id: args.bookingId, clientId: context.userId },
    include: {
      service: true,
      business: true,
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
      where: { id: args.serviceId, businessId: booking.businessId },
    });
    if (!service) {
      throw new Error("Serviciul nu a fost găsit sau nu aparține acestui business.");
    }
    updateData.serviceId = args.serviceId;
  }

  if (args.employeeId) {
    const employee = await prisma.user.findFirst({
      where: { id: args.employeeId, businessId: booking.businessId, role: "EMPLOYEE" },
    });
    if (!employee) {
      throw new Error("Angajatul nu a fost găsit sau nu aparține acestui business.");
    }
    updateData.employeeId = args.employeeId;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("Nu ai specificat nicio modificare.");
  }

  const updatedBooking = await prisma.booking.update({
    where: { id: args.bookingId },
    data: updateData,
    include: {
      service: { select: { name: true } },
      business: { select: { name: true } },
      employee: { select: { name: true } },
    },
  });

  return {
    success: true,
    message: "Rezervarea a fost actualizată cu succes.",
    booking: {
      id: updatedBooking.id,
      date: updatedBooking.date.toISOString(),
      service: updatedBooking.service?.name,
      business: updatedBooking.business?.name,
      employee: updatedBooking.employee?.name || null,
    },
  };
}

/**
 * Obține informații despre un business
 */
async function getBusinessInfo(
  args: { businessId?: string; businessName?: string },
  context: AIContext
) {
  let business;

  if (args.businessId) {
    business = await prisma.business.findUnique({
      where: { id: args.businessId },
      include: {
        services: {
          select: {
            id: true,
            name: true,
            price: true,
            duration: true,
            description: true,
          },
        },
        employees: {
          where: { role: "EMPLOYEE" },
          select: {
            id: true,
            name: true,
            specialization: true,
            avatar: true,
          },
        },
      },
    });
  } else if (args.businessName && context.linkedBusinesses) {
    const found = context.linkedBusinesses.find((b: any) =>
      b.name.toLowerCase().includes(args.businessName!.toLowerCase())
    );
    if (found) {
      business = await prisma.business.findUnique({
        where: { id: found.id },
        include: {
          services: {
            select: {
              id: true,
              name: true,
              price: true,
              duration: true,
              description: true,
            },
          },
          employees: {
            where: { role: "EMPLOYEE" },
            select: {
              id: true,
              name: true,
              specialization: true,
              avatar: true,
            },
          },
        },
      });
    }
  }

  if (!business) {
    throw new Error("Business-ul nu a fost găsit sau nu ai acces la el.");
  }

  // Verifică dacă clientul are acces la acest business
  if (context.role === "CLIENT") {
    const hasAccess = context.linkedBusinesses?.some((b: any) => b.id === business.id);
    if (!hasAccess) {
      throw new Error("Nu ai acces la acest business.");
    }
  }

  return {
    id: business.id,
    name: business.name,
    services: business.services,
    employees: business.employees,
    workingHours: business.workingHours,
  };
}

/**
 * Obține sloturi disponibile pentru un business și serviciu
 */
async function getAvailableSlots(
  args: {
    businessId?: string;
    businessName?: string;
    serviceId?: string;
    serviceName?: string;
    date: string;
    employeeId?: string;
  },
  context: AIContext
) {
  let businessId = args.businessId;
  let serviceId = args.serviceId;

  // Găsește business-ul
  if (!businessId && args.businessName && context.linkedBusinesses) {
    const found = context.linkedBusinesses.find((b: any) =>
      b.name.toLowerCase().includes(args.businessName!.toLowerCase())
    );
    if (found) {
      businessId = found.id;
    }
  }

  if (!businessId && context.linkedBusinesses && context.linkedBusinesses.length > 0) {
    businessId = context.linkedBusinesses[0].id;
  }

  if (!businessId) {
    throw new Error("Business-ul nu a fost găsit sau nu ai acces la el.");
  }

  // Verifică accesul
  if (context.role === "CLIENT") {
    const hasAccess = context.linkedBusinesses?.some((b: any) => b.id === businessId);
    if (!hasAccess) {
      throw new Error("Nu ai acces la acest business.");
    }
  }

  // Găsește serviciul
  if (!serviceId && args.serviceName) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { services: true },
    });
    if (business) {
      const service = business.services.find((s: any) =>
        s.name.toLowerCase().includes(args.serviceName!.toLowerCase())
      );
      if (service) {
        serviceId = service.id;
      }
    }
  }

  if (!serviceId) {
    throw new Error("Serviciul nu a fost găsit.");
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    throw new Error("Serviciul nu a fost găsit.");
  }

  const targetDate = new Date(args.date);
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error("Data este invalidă.");
  }

  // Obține working hours pentru business
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { workingHours: true, slotDuration: true },
  });

  // Obține rezervările existente pentru acea zi
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existingBookings = await prisma.booking.findMany({
    where: {
      businessId,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      status: { not: "CANCELLED" },
      ...(args.employeeId && { employeeId: args.employeeId }),
    },
    include: {
      service: { select: { duration: true } },
    },
  });

  // Generează sloturi disponibile (simplificat - ar trebui să folosească logica din useWorkingHours)
  const slotDuration = business?.slotDuration || 60;
  const serviceDuration = service.duration || slotDuration;
  const slotsNeeded = Math.ceil(serviceDuration / slotDuration);

  // TODO: Implementare logică completă de generare sloturi bazată pe working hours
  // Pentru moment, returnăm un mesaj informativ
  return {
    businessId,
    serviceId,
    date: args.date,
    serviceDuration,
    slotDuration,
    slotsNeeded,
    message: "Folosește funcția createBooking pentru a rezerva un slot disponibil.",
    existingBookingsCount: existingBookings.length,
  };
}

module.exports = {
  viewClientBookings,
  cancelOwnBooking,
  updateOwnBooking,
  getBusinessInfo,
  getAvailableSlots,
};

