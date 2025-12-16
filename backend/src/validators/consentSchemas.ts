/**
 * Consent Validation Schemas
 * Zod schemas pentru validare consent requests
 */

const { z } = require("zod");

const cuidRegex = /^c[a-z0-9]{24}$/;

/**
 * Schema pentru bookingId (param)
 */
const bookingIdParamSchema = z.object({
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid"),
});

/**
 * Schema pentru clientId (param)
 */
const clientIdParamSchema = z.object({
  clientId: z.string().regex(cuidRegex, "clientId trebuie să fie un CUID valid"),
});

/**
 * Schema pentru documentId (param)
 */
const documentIdParamSchema = z.object({
  documentId: z.string().regex(cuidRegex, "documentId trebuie să fie un CUID valid"),
});

/**
 * Schema pentru formData (consent form fields)
 */
const formDataSchema = z.object({
  cnp: z.union([
    z.string().min(1).refine((val: string) => {
      return /^\d+$/.test(val); // Only digits
    }, {
      message: "CNP-ul trebuie să conțină doar cifre",
    }).refine((val: string) => {
      return val.length === 13; // Exactly 13 digits
    }, {
      message: "CNP-ul trebuie să aibă exact 13 cifre",
    }),
    z.null(),
    z.literal(""),
  ]).optional(),
  patientAgreement: z.boolean().refine((val: boolean) => val === true, {
    message: "Consimțământul pacientului este obligatoriu",
  }),
  dataPrivacyConsent: z.boolean().optional(),
}).passthrough(); // Allow additional fields for backward compatibility

/**
 * Schema pentru signature (base64 image data URL)
 * Max 5MB (5 * 1024 * 1024 bytes)
 */
const signatureSchema = z.union([
  z.string()
    .startsWith("data:image/", "Semnătura trebuie să fie în format base64 image data URL")
    .refine((val: string) => {
      try {
        const [, base64] = val.split(",");
        if (!base64) return false;
        const size = Buffer.from(base64, "base64").length;
        return size <= 5 * 1024 * 1024; // 5MB max
      } catch {
        return false;
      }
    }, {
      message: "Semnătura nu poate depăși 5MB",
    }),
  z.null(),
]).optional();

/**
 * Schema pentru sign consent
 */
const signConsentSchema = z.object({
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid"),
  clientId: z.string().regex(cuidRegex, "clientId trebuie să fie un CUID valid"),
  signature: signatureSchema,
  formData: formDataSchema,
});

/**
 * Schema pentru upload consent
 */
const uploadConsentSchema = z.object({
  bookingId: z.string().regex(cuidRegex, "bookingId trebuie să fie un CUID valid"),
  pdfDataUrl: z.string()
    .min(1, "pdfDataUrl nu poate fi gol")
    .refine((val: string) => {
      // Check if it starts with data: (for both images and PDFs)
      if (!val.startsWith("data:")) {
        return false;
      }
      // Check if it contains base64 data
      const parts = val.split(",");
      if (parts.length < 2 || !parts[1]) {
        return false;
      }
      // Try to decode base64 to check if it's valid
      try {
        const base64 = parts[1];
        const size = Buffer.from(base64, "base64").length;
        if (size === 0) return false;
        if (size > 10 * 1024 * 1024) return false; // 10MB max
        return true;
      } catch {
        return false;
      }
    }, {
      message: "pdfDataUrl trebuie să fie în format base64 data URL valid (PDF sau imagine PNG/JPG) și să nu depășească 10MB",
    }),
  fileName: z.string().max(255).optional(),
});

/**
 * Schema pentru query params (GET /consent/)
 */
const consentListQuerySchema = z.object({
  businessId: z.string().regex(cuidRegex, "businessId trebuie să fie un CUID valid"),
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid").optional(),
  date: z.union([
    z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data trebuie să fie în format YYYY-MM-DD"),
  ]).optional(),
  search: z.string().max(255).optional(),
});

/**
 * Schema pentru query params (GET /consent/client/:clientId)
 */
const consentClientQuerySchema = z.object({
  businessId: z.string().regex(cuidRegex, "businessId trebuie să fie un CUID valid"),
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid").optional(),
});

module.exports = {
  bookingIdParamSchema,
  clientIdParamSchema,
  documentIdParamSchema,
  formDataSchema,
  signatureSchema,
  signConsentSchema,
  uploadConsentSchema,
  consentListQuerySchema,
  consentClientQuerySchema,
};
