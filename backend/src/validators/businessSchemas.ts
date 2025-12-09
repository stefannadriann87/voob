/**
 * Business Validation Schemas
 * Zod schemas pentru validare business requests
 */

const { z } = require("zod");

const cuidRegex = /^c[a-z0-9]{24}$/;

/**
 * Schema pentru creare business
 */
const createBusinessSchema = z.object({
  name: z.string().min(1, "Numele business-ului este obligatoriu").max(255, "Numele nu poate depăși 255 caractere"),
  email: z.string().email("Email invalid").optional().nullable(),
  businessType: z.enum(["GENERAL", "BEAUTY", "STOMATOLOGIE", "OFTALMOLOGIE", "PSIHOLOGIE", "TERAPIE"], {
    errorMap: () => ({ message: "Tipul de business este invalid" }),
  }),
});

/**
 * Schema pentru actualizare business
 */
const updateBusinessSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional().nullable(),
  businessType: z.enum(["GENERAL", "BEAUTY", "STOMATOLOGIE", "OFTALMOLOGIE", "PSIHOLOGIE", "TERAPIE"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

/**
 * Schema pentru adăugare serviciu
 * Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)
 */
const createServiceSchema = z.object({
  name: z.string().min(1, "Numele serviciului este obligatoriu").max(255),
  duration: z.number()
    .int("Durata trebuie să fie un număr întreg")
    .positive("Durata trebuie să fie un număr pozitiv")
    .refine((val) => val % 30 === 0, {
      message: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)",
    }),
  price: z.number().nonnegative("Prețul nu poate fi negativ"),
  description: z.string().max(2000).optional().nullable(),
});

/**
 * Schema pentru actualizare serviciu
 * Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)
 */
const updateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  duration: z.number()
    .int("Durata trebuie să fie un număr întreg")
    .positive("Durata trebuie să fie un număr pozitiv")
    .refine((val) => val % 30 === 0, {
      message: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)",
    })
    .optional(),
  price: z.number().nonnegative().optional(),
  description: z.string().max(2000).optional().nullable(),
});

/**
 * Schema pentru adăugare angajat
 */
const createEmployeeSchema = z.object({
  email: z.string().email("Email invalid"),
  name: z.string().min(1, "Numele este obligatoriu").max(255),
  phone: z.string().max(20).optional().nullable(),
});

/**
 * Schema pentru actualizare angajat
 */
const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
  workingHours: z.record(z.any()).optional().nullable(), // JSON object
});

/**
 * Schema pentru business ID param
 */
const businessIdParamSchema = z.object({
  id: z.string().regex(cuidRegex, "ID-ul business-ului trebuie să fie un CUID valid"),
  businessId: z.string().regex(cuidRegex).optional(), // Alternative param name
});

module.exports = {
  createBusinessSchema,
  updateBusinessSchema,
  createServiceSchema,
  updateServiceSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  businessIdParamSchema,
};

