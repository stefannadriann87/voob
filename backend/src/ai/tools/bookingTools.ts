/**
 * Booking Tools pentru AI Agent
 * Toate tools-urile au RBAC (Role-Based Access Control)
 */

const prisma = require("../../lib/prisma");
const { createBookingToolSchema, cancelBookingToolSchema } = require("./toolSchemas");
const { logger } = require("../../lib/logger");
const { sendBookingCancellationSms } = require("../../services/smsService");

const HOUR_IN_MS = 60 * 60 * 1000;
const MIN_BOOKING_LEAD_MS = 2 * HOUR_IN_MS;
const CANCELLATION_LIMIT_MS = 23 * HOUR_IN_MS;
const REMINDER_GRACE_MS = 1 * HOUR_IN_MS;

const MIN_LEAD_MESSAGE = "Rezervările se pot face cu minim 2 ore înainte.";
const CANCELLATION_LIMIT_MESSAGE = "Rezervarea nu mai poate fi anulată. Ai depășit limita de anulare.";
const REMINDER_LIMIT_MESSAGE = "Timpul de anulare după reminder a expirat.";

/**
 * Anulează o rezervare cu verificare RBAC
 */
async function cancelBooking(
  args: { bookingId: string },
  context: any
): Promise<string> {
  // Validare input cu Zod
  const { bookingId } = cancelBookingToolSchema.parse(args);
  const { userId, role, businessId } = context;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      business: { select: { id: true, name: true } },
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită.");
  }

  // RBAC: CLIENT -> poate doar bookingul lui
  if (role === "CLIENT" && booking.clientId !== userId) {
    throw new Error("Nu ai permisiunea să anulezi această rezervare. Poți anula doar rezervările tale.");
  }

  // RBAC: BUSINESS / EMPLOYEE -> doar din business-ul lor
  if ((role === "BUSINESS" || role === "EMPLOYEE") && booking.businessId !== businessId) {
    throw new Error("Nu ai permisiunea să anulezi această rezervare. Rezervarea aparține altui business.");
  }

  // SUPERADMIN poate anula orice rezervare (nu are restricții)

  // Verifică regulile de anulare înainte de ștergere
  const now = new Date();
  const bookingDateObj = new Date(booking.date);
  if (booking.reminderSentAt) {
    const reminderDate = new Date(booking.reminderSentAt);
    if (!Number.isNaN(reminderDate.getTime()) && now.getTime() > reminderDate.getTime() + REMINDER_GRACE_MS) {
      throw new Error(REMINDER_LIMIT_MESSAGE);
    }
  }

  if (bookingDateObj.getTime() - now.getTime() < CANCELLATION_LIMIT_MS) {
    throw new Error(CANCELLATION_LIMIT_MESSAGE);
  }

  // Salvează datele pentru SMS înainte de ștergere
  const clientName = booking.client?.name || "Client";
  const clientPhone = booking.client?.phone;
  const businessName = booking.business?.name || "Business";
  const bookingDate = booking.date;

  // Șterge rezervarea
  await prisma.booking.delete({
    where: { id: bookingId },
  });

  // Trimite SMS de anulare dacă clientul are telefon
  if (clientPhone) {
    sendBookingCancellationSms(
      clientName,
      clientPhone,
      businessName,
      bookingDate,
      booking.business?.id
    ).catch(
      (error: unknown) => {
        logger.error("Failed to send cancellation SMS:", error);
      }
    );
  }

  return `Rezervarea ${bookingId} a fost anulată cu succes.`;
}

/**
 * Creează o nouă rezervare
 * Acceptă fie ID-uri, fie nume pentru business, service, employee
 */
async function createBooking(
  args: {
    clientId?: string;
    businessId?: string;
    businessName?: string;
    serviceId?: string;
    serviceName?: string;
    employeeId?: string;
    employeeName?: string;
    date: string;
    paid?: boolean;
  },
  context: any
): Promise<string> {
  // Validare input cu Zod
  const validatedArgs = createBookingToolSchema.parse(args);
  
  const { clientId, businessId, businessName, serviceId, serviceName, employeeId, employeeName, date, paid = false } = validatedArgs;
  const { userId, role, businessId: userBusinessId, linkedBusinesses, businessServices, businessEmployees } = context;

  // Pentru CLIENT: folosește userId ca clientId și caută business-ul din lista sa
  let finalClientId = clientId || userId;
  let finalBusinessId = businessId;
  let finalServiceId = serviceId;
  let finalEmployeeId = employeeId;

  // RBAC: CLIENT poate crea rezervări pentru el însuși
  if (role === "CLIENT" && clientId && clientId !== userId) {
    throw new Error("Nu poți crea rezervări pentru alți clienți.");
  }

  // Caută business după nume dacă nu este dat ID-ul
  if (!finalBusinessId && businessName) {
    if (role === "CLIENT" && linkedBusinesses) {
      const business = linkedBusinesses.find(
        (b: any) => b.name.toLowerCase().includes(businessName.toLowerCase())
      );
      if (business) {
        // Verifică dacă business-ul este suspendat
        if (business.status === "SUSPENDED") {
          throw new Error("Business-ul este suspendat. Rezervările sunt oprite temporar.");
        }
        finalBusinessId = business.id;
      } else {
        throw new Error(`Business-ul "${businessName}" nu a fost găsit în lista ta de business-uri conectate.`);
      }
    } else if (role === "BUSINESS" || role === "EMPLOYEE") {
      // Pentru business/employee, folosește business-ul lor
      finalBusinessId = userBusinessId;
    } else {
      throw new Error("Nu ai permisiunea să creezi rezervări pentru acest business.");
    }
  }

  // Dacă nu avem businessId, folosește primul business din listă (pentru CLIENT)
  if (!finalBusinessId && role === "CLIENT" && linkedBusinesses && linkedBusinesses.length > 0) {
    finalBusinessId = linkedBusinesses[0].id;
  }

  if (!finalBusinessId) {
    throw new Error("Business-ul nu a fost găsit sau nu ai acces la el.");
  }

  // Caută serviciul după nume dacă nu este dat ID-ul
  if (!finalServiceId && serviceName) {
    let services: any[] = [];
    
    if (role === "CLIENT" && linkedBusinesses) {
      const business = linkedBusinesses.find((b: any) => b.id === finalBusinessId);
      services = business?.services || [];
    } else if ((role === "BUSINESS" || role === "EMPLOYEE") && businessServices) {
      services = businessServices;
    } else {
      // Caută în baza de date
      const business = await prisma.business.findUnique({
        where: { id: finalBusinessId },
        include: { services: true },
      });
      services = business?.services || [];
    }

    const service = services.find((s: any) =>
      s.name.toLowerCase().includes(serviceName.toLowerCase())
    );
    if (service) {
      finalServiceId = service.id;
    } else {
      throw new Error(`Serviciul "${serviceName}" nu a fost găsit la acest business.`);
    }
  }

  // Caută employee după nume dacă nu este dat ID-ul
  if (!finalEmployeeId && employeeName) {
    let employees: any[] = [];
    
    if (role === "CLIENT" && linkedBusinesses) {
      const business = linkedBusinesses.find((b: any) => b.id === finalBusinessId);
      employees = business?.employees || [];
    } else if ((role === "BUSINESS" || role === "EMPLOYEE") && businessEmployees) {
      employees = businessEmployees;
    } else {
      // Caută în baza de date
      const business = await prisma.business.findUnique({
        where: { id: finalBusinessId },
        include: { employees: true },
      });
      employees = business?.employees || [];
    }

    const employee = employees.find((e: any) =>
      e.name.toLowerCase().includes(employeeName.toLowerCase())
    );
    if (employee) {
      finalEmployeeId = employee.id;
    } else {
      throw new Error(`Angajatul "${employeeName}" nu a fost găsit la acest business.`);
    }
  }

  // RBAC: BUSINESS / EMPLOYEE -> doar pentru business-ul lor
  if ((role === "BUSINESS" || role === "EMPLOYEE") && finalBusinessId !== userBusinessId) {
    throw new Error("Nu poți crea rezervări pentru alt business.");
  }

  // Verifică existența entităților
  const [business, service, client] = await Promise.all([
    prisma.business.findUnique({ where: { id: finalBusinessId } }),
    prisma.service.findUnique({ where: { id: finalServiceId } }),
    prisma.user.findUnique({ where: { id: finalClientId } }),
  ]);

  if (!business) throw new Error("Business-ul nu a fost găsit.");
  if (business.status === "SUSPENDED") {
    throw new Error("Business-ul este suspendat. Rezervările sunt oprite temporar.");
  }
  if (!service) throw new Error("Serviciul nu a fost găsit.");
  if (!client) throw new Error("Clientul nu a fost găsit.");

  // Verifică employee dacă este specificat
  if (finalEmployeeId) {
    const employee = await prisma.user.findUnique({ where: { id: finalEmployeeId } });
    if (!employee || employee.businessId !== finalBusinessId) {
      throw new Error("Angajatul nu a fost găsit sau nu aparține acestui business.");
    }

    // Verify employee can perform the service (if serviceId is provided)
    if (finalServiceId) {
      const employeeService = await prisma.employeeService.findUnique({
        where: {
          employeeId_serviceId: {
            employeeId: finalEmployeeId,
            serviceId: finalServiceId,
          },
        },
      });

      // If no association found, check if business has no restrictions (backward compatibility)
      // For now, we allow booking if no association exists (backward compatibility)
      // In the future, you might want to make this stricter
      // if (!employeeService) {
      //   throw new Error("Angajatul nu poate efectua acest serviciu.");
      // }
    }
  }

  const bookingDateObj = new Date(date);
  if (Number.isNaN(bookingDateObj.getTime())) {
    throw new Error("Data rezervării este invalidă.");
  }

  if (bookingDateObj.getTime() - Date.now() < MIN_BOOKING_LEAD_MS) {
    throw new Error(MIN_LEAD_MESSAGE);
  }

  const booking = await prisma.booking.create({
    data: {
      clientId: finalClientId,
      businessId: finalBusinessId,
      serviceId: finalServiceId,
      employeeId: finalEmployeeId || null,
      date: bookingDateObj,
      paid: paid ?? false,
      status: "CONFIRMED",
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      business: { select: { id: true, name: true } },
      service: { select: { name: true } },
    },
  });

  // Trimite SMS de confirmare dacă clientul are telefon
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

  return `Rezervarea a fost creată cu succes. ID: ${booking.id}`;
}

/**
 * Listează rezervările în funcție de rol
 */
async function listBookings(
  {
    startDate,
    endDate,
    status,
  }: {
    startDate?: string;
    endDate?: string;
    status?: "PENDING_CONSENT" | "CONFIRMED" | "CANCELLED";
  } = {},
  context: any
): Promise<any[]> {
  const { userId, role, businessId } = context;

  let where: any = {};

  // RBAC: CLIENT -> doar rezervările lui
  if (role === "CLIENT") {
    where.clientId = userId;
  }
  // RBAC: BUSINESS / EMPLOYEE -> doar rezervările business-ului lor
  else if (role === "BUSINESS" || role === "EMPLOYEE") {
    if (!businessId) {
      throw new Error("Nu ai un business asociat.");
    }
    where.businessId = businessId;
  }
  // SUPERADMIN -> toate rezervările (fără restricții)

  // Filtre opționale
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }

  if (status) {
    where.status = status;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      business: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, price: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 50, // Limităm la 50 pentru performanță
  });

  return bookings.map((b: any) => ({
    id: b.id,
    client: b.client.name,
    business: b.business.name,
    service: b.service.name,
    date: b.date.toISOString(),
    status: b.status,
    paid: b.paid,
    employee: b.employee?.name || null,
  }));
}

/**
 * Generează raport de venituri pentru business
 */
async function generateRevenueReport(
  {
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  },
  context: any
): Promise<any> {
  const { userId, role, businessId } = context;

  // RBAC: Doar BUSINESS, EMPLOYEE sau SUPERADMIN
  if (role === "CLIENT") {
    throw new Error("Clienții nu pot genera rapoarte de venituri.");
  }

  // RBAC: BUSINESS / EMPLOYEE -> doar pentru business-ul lor
  if ((role === "BUSINESS" || role === "EMPLOYEE") && !businessId) {
    throw new Error("Nu ai un business asociat.");
  }

  const where: any = {
    status: "CONFIRMED",
    date: {
      gte: new Date(startDate),
      lte: new Date(endDate),
    },
  };

  if (role === "BUSINESS" || role === "EMPLOYEE") {
    where.businessId = businessId;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      service: { select: { price: true } },
    },
  });

  const totalRevenue = bookings.reduce((sum: number, b: any) => sum + (b.service?.price || 0), 0);
  const totalBookings = bookings.length;
  const paidBookings = bookings.filter((b: any) => b.paid).length;

  return {
    period: { start: startDate, end: endDate },
    totalRevenue,
    totalBookings,
    paidBookings,
    unpaidBookings: totalBookings - paidBookings,
    averageRevenue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
  };
}

/**
 * Descarcă PDF-ul de consimțământ pentru o rezervare
 */
async function downloadConsentPDF(
  { bookingId }: { bookingId: string },
  context: any
): Promise<string> {
  const { userId, role, businessId } = context;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      consentForm: true,
      client: { select: { id: true } },
      business: { select: { id: true } },
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită.");
  }

  // RBAC: CLIENT -> doar pentru rezervările lui
  if (role === "CLIENT" && booking.clientId !== userId) {
    throw new Error("Nu ai permisiunea să accesezi acest document.");
  }

  // RBAC: BUSINESS / EMPLOYEE -> doar pentru business-ul lor
  if ((role === "BUSINESS" || role === "EMPLOYEE") && booking.businessId !== businessId) {
    throw new Error("Nu ai permisiunea să accesezi acest document.");
  }

  if (!booking.consentForm) {
    throw new Error("Nu există formular de consimțământ pentru această rezervare.");
  }

  return booking.consentForm.pdfUrl;
}

/**
 * Trimite notificare SMS pentru o rezervare
 */
async function sendSMSNotification(
  {
    bookingId,
    message,
  }: {
    bookingId: string;
    message?: string;
  },
  context: any
): Promise<string> {
  const { userId, role, businessId } = context;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      business: { select: { id: true, name: true } },
      service: { select: { name: true } },
    },
  });

  if (!booking) {
    throw new Error("Rezervarea nu a fost găsită.");
  }

  // RBAC: CLIENT -> doar pentru rezervările lui
  if (role === "CLIENT" && booking.clientId !== userId) {
    throw new Error("Nu ai permisiunea să trimiți SMS pentru această rezervare.");
  }

  // RBAC: BUSINESS / EMPLOYEE -> doar pentru business-ul lor
  if ((role === "BUSINESS" || role === "EMPLOYEE") && booking.businessId !== businessId) {
    throw new Error("Nu ai permisiunea să trimiți SMS pentru această rezervare.");
  }

  if (!booking.client.phone) {
    throw new Error("Clientul nu are număr de telefon.");
  }

  const { sendSms } = require("../../services/smsService");
const { logger } = require("../../lib/logger");

  const smsMessage =
    message ||
    `Salut ${booking.client.name}, te reamintim despre rezervarea ta la ${booking.business.name} pe ${new Date(booking.date).toLocaleDateString("ro-RO")} la ${new Date(booking.date).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}.`;

  const result = await sendSms({
    phone: booking.client.phone,
    message: smsMessage,
  });

  if (!result.success) {
    throw new Error(result.error || "Eroare la trimiterea SMS-ului.");
  }

  return `SMS trimis cu succes către ${booking.client.name}.`;
}

// Export tools pentru OpenAI function calling
const bookingTools = [
  {
    type: "function" as const,
    function: {
      name: "cancelBooking",
      description: "Anulează o rezervare. Clienții pot anula doar rezervările lor. Business/Employee pot anula rezervările din business-ul lor.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării de anulat" },
        },
        required: ["bookingId"],
      },
    },
  },
    {
    type: "function" as const,
    function: {
      name: "createBooking",
      description: "Creează o nouă rezervare. Poți folosi fie ID-uri, fie nume pentru business, serviciu și angajat. Pentru clienți, clientId este automat (userId).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID-ul clientului (opțional pentru CLIENT, folosește automat userId)" },
          businessId: { type: "string", description: "ID-ul business-ului (opțional dacă dai businessName)" },
          businessName: { type: "string", description: "Numele business-ului (ex: 'hair cut studio') - opțional dacă dai businessId" },
          serviceId: { type: "string", description: "ID-ul serviciului (opțional dacă dai serviceName)" },
          serviceName: { type: "string", description: "Numele serviciului (ex: 'tuns bărbați') - opțional dacă dai serviceId" },
          employeeId: { type: "string", description: "ID-ul angajatului (opțional)" },
          employeeName: { type: "string", description: "Numele angajatului (opțional)" },
          date: { type: "string", description: "Data și ora rezervării (ISO format, ex: 2024-11-24T14:00:00)" },
          paid: { type: "boolean", description: "Dacă este plătită (default: false)" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listBookings",
      description: "Listează rezervările. Clienții văd doar rezervările lor. Business/Employee văd rezervările din business-ul lor.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format, opțional)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format, opțional)" },
          status: {
            type: "string",
            enum: ["PENDING_CONSENT", "CONFIRMED", "CANCELLED"],
            description: "Statusul rezervărilor (opțional)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generateRevenueReport",
      description: "Generează raport de venituri pentru business. Doar BUSINESS, EMPLOYEE sau SUPERADMIN pot genera rapoarte.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format)" },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "downloadConsentPDF",
      description: "Obține URL-ul PDF-ului de consimțământ pentru o rezervare. Respectă permisiunile RBAC.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sendSMSNotification",
      description: "Trimite notificare SMS pentru o rezervare. Respectă permisiunile RBAC.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării" },
          message: { type: "string", description: "Mesajul personalizat (opțional)" },
        },
        required: ["bookingId"],
      },
    },
  },
];

// Mapare nume tool -> funcție de executare
const bookingToolExecutors: Record<string, (args: any, context: any) => Promise<any>> = {
  cancelBooking,
  createBooking,
  listBookings,
  generateRevenueReport,
  downloadConsentPDF,
  sendSMSNotification,
};

module.exports = { bookingTools, bookingToolExecutors };

