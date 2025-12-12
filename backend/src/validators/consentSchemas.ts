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
  patientName: z.string().min(1, "Numele pacientului este obligatoriu").max(255),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data nașterii trebuie să fie în format YYYY-MM-DD"),
  procedure: z.string().min(1, "Procedura este obligatorie").max(500),
  treatmentDetails: z.string().min(1, "Detaliile tratamentului sunt obligatorii").max(2000),
  risks: z.string().min(1, "Riscurile sunt obligatorii").max(2000),
  medicalNotes: z.string().max(2000).optional().nullable(),
  patientAgreement: z.boolean().refine((val) => val === true, {
    message: "Consimțământul pacientului este obligatoriu",
  }),
}).passthrough(); // Allow additional fields

/**
 * Schema pentru signature (base64 image data URL)
 * Max 5MB (5 * 1024 * 1024 bytes)
 */
const signatureSchema = z.string()
  .startsWith("data:image/", "Semnătura trebuie să fie în format base64 image data URL")
  .refine((val) => {
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
  })
  .optional();

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
    .startsWith("data:", "pdfDataUrl trebuie să fie în format base64 data URL")
    .refine((val) => {
      try {
        const [, base64] = val.split(",");
        if (!base64) return false;
        const size = Buffer.from(base64, "base64").length;
        return size <= 10 * 1024 * 1024; // 10MB max
      } catch {
        return false;
      }
    }, {
      message: "PDF-ul nu poate depăși 10MB",
    }),
  fileName: z.string().max(255).optional(),
});

/**
 * Schema pentru query params (GET /consent/)
 */
const consentListQuerySchema = z.object({
  businessId: z.string().regex(cuidRegex, "businessId trebuie să fie un CUID valid"),
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid").optional(),
  date: z.string().datetime({ message: "Data trebuie să fie în format ISO 8601" }).optional(),
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
