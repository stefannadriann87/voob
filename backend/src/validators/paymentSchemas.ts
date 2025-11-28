/**
 * Payment Validation Schemas
 * Zod schemas pentru validare payment requests
 */

const { z } = require("zod");

const cuidRegex = /^c[a-z0-9]{24}$/;

/**
 * Schema pentru creare payment intent
 */
const createPaymentIntentSchema = z.object({
  businessId: z.string().regex(cuidRegex, "businessId trebuie să fie un CUID valid"),
  serviceId: z.string().regex(cuidRegex, "serviceId trebuie să fie un CUID valid"),
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid").nullable().optional(),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
  paymentMethod: z.enum(["card", "offline", "klarna"], {
    errorMap: () => ({ message: "Metoda de plată trebuie să fie: card, offline sau klarna" }),
  }),
  clientNotes: z.string().max(1000, "Notele clientului nu pot depăși 1000 caractere").optional().nullable(),
  duration: z.number().int().positive().optional().nullable(),
});

/**
 * Schema pentru confirmare payment
 */
const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1, "paymentIntentId este obligatoriu"),
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid").optional(),
});

module.exports = {
  createPaymentIntentSchema,
  confirmPaymentSchema,
};

