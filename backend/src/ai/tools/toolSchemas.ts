/**
 * AI Tools Validation Schemas
 * Zod schemas pentru validare input în AI tools
 */

const { z } = require("zod");

// CUID pattern
const cuidRegex = /^c[a-z0-9]{24}$/;

/**
 * Schema pentru createBooking tool
 */
const createBookingToolSchema = z.object({
  clientId: z.string().regex(cuidRegex).optional(),
  businessId: z.string().regex(cuidRegex).optional(),
  businessName: z.string().max(255).optional(),
  serviceId: z.string().regex(cuidRegex).optional(),
  serviceName: z.string().max(255).optional(),
  employeeId: z.string().regex(cuidRegex).optional(),
  employeeName: z.string().max(255).optional(),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
  paid: z.boolean().optional().default(false),
}).refine((data) => {
  // Fie businessId, fie businessName trebuie să fie furnizat (sau ambele)
  return !!(data.businessId || data.businessName);
}, {
  message: "Trebuie să furnizezi fie businessId, fie businessName",
});

/**
 * Schema pentru cancelBooking tool
 */
const cancelBookingToolSchema = z.object({
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid"),
});

/**
 * Schema pentru createBookingForClient (employee)
 */
const createBookingForClientToolSchema = z.object({
  clientId: z.string().regex(cuidRegex, "clientId trebuie să fie un CUID valid"),
  serviceId: z.string().regex(cuidRegex, "serviceId trebuie să fie un CUID valid"),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
  paid: z.boolean().optional().default(false),
});

/**
 * Schema pentru createBusinessBooking (business)
 */
const createBusinessBookingToolSchema = z.object({
  clientId: z.string().regex(cuidRegex, "clientId trebuie să fie un CUID valid"),
  serviceId: z.string().regex(cuidRegex, "serviceId trebuie să fie un CUID valid"),
  employeeId: z.string().regex(cuidRegex).optional().nullable(),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
  paid: z.boolean().optional().default(false),
});

/**
 * Schema pentru viewBookings (filters)
 */
const viewBookingsToolSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
});

/**
 * Schema pentru getEmployeeAvailability tool
 */
const getEmployeeAvailabilityToolSchema = z.object({
  date: z.string().datetime().optional(),
});

module.exports = {
  createBookingToolSchema,
  cancelBookingToolSchema,
  createBookingForClientToolSchema,
  createBusinessBookingToolSchema,
  viewBookingsToolSchema,
getEmployeeAvailabilityToolSchema,

};
