/**
 * Booking Validation Schemas
 * Zod schemas pentru validare booking requests
 */

const { z } = require("zod");

// CUID pattern (simplified - Prisma CUID format)
const cuidRegex = /^c[a-z0-9]{24}$/;

// PaymentMethod enum values
const PaymentMethodEnum = z.enum(["CARD", "APPLEPAY", "GOOGLEPAY", "KLARNA", "OFFLINE", "CASH"]);


/**
 * Schema pentru creare booking
 * Suportă atât serviceId (pentru business types normale) cât și courtId (pentru SPORT_OUTDOOR)
 */
const createBookingSchema = z.object({
  clientId: z.string().regex(cuidRegex, "clientId trebuie să fie un CUID valid"),
  businessId: z.string().regex(cuidRegex, "businessId trebuie să fie un CUID valid"),
  serviceId: z.string().regex(cuidRegex, "serviceId trebuie să fie un CUID valid").optional().nullable(),
  courtId: z.string().regex(cuidRegex, "courtId trebuie să fie un CUID valid").optional().nullable(),
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid").nullable().optional(),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
  paid: z.boolean().optional().default(false),
  paymentMethod: PaymentMethodEnum.optional(),
  paymentReused: z.boolean().optional().default(false),
  clientNotes: z.string().max(1000, "Notele clientului nu pot depăși 1000 caractere").optional().nullable(),
  duration: z.number().int().positive().optional().nullable(), // Durata în minute
}).refine((data: any) => {
  // Fie serviceId, fie courtId trebuie să fie furnizat, dar nu ambele
  const hasServiceId = !!data.serviceId;
  const hasCourtId = !!data.courtId;
  return hasServiceId !== hasCourtId; // XOR: exact unul dintre ele trebuie să fie setat
}, {
  message: "Trebuie să furnizezi fie serviceId (pentru business types normale), fie courtId (pentru SPORT_OUTDOOR), dar nu ambele.",
});

/**
 * Schema pentru actualizare booking
 */
const updateBookingSchema = z.object({
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }).optional(),
  clientNotes: z.string().max(1000, "Notele clientului nu pot depăși 1000 caractere").optional().nullable(),
  status: z.enum(["CONFIRMED", "PENDING_CONSENT", "CANCELLED", "COMPLETED"]).optional(),
  duration: z.number().int().positive().optional().nullable(),
});

/**
 * Schema pentru confirmare booking (după payment)
 */
const confirmBookingSchema = z.object({
  paymentIntentId: z.string().min(1, "paymentIntentId este obligatoriu"),
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid").optional(),
});

/**
 * Schema pentru params (booking ID)
 */
const bookingIdParamSchema = z.object({
  id: z.string().regex(cuidRegex, "ID-ul booking-ului trebuie să fie un CUID valid"),
});

/**
 * Schema pentru query parameters (list bookings)
 */
const listBookingsQuerySchema = z.object({
  businessId: z.string().regex(cuidRegex).optional(),
  clientId: z.string().regex(cuidRegex).optional(),
  employeeId: z.string().regex(cuidRegex).optional(),
  status: z.enum(["CONFIRMED", "PENDING_CONSENT", "CANCELLED", "COMPLETED"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().max(100)).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative()).optional(),
});

module.exports = {
  createBookingSchema,
  updateBookingSchema,
  confirmBookingSchema,
  bookingIdParamSchema,
  listBookingsQuerySchema,
};

