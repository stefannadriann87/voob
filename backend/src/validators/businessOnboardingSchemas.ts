/**
 * Business Onboarding Validation Schemas
 * Zod schemas pentru validare business onboarding requests
 */

const { z } = require("zod");
const { businessIdParamSchema } = require("./businessSchemas");

/**
 * Schema pentru înregistrare business (primul pas onboarding)
 */
const registerBusinessSchema = z.object({
  businessName: z.string().min(1, "Numele business-ului este obligatoriu").max(255),
  businessEmail: z.string().email("Email invalid").optional().nullable(),
  businessType: z.enum([
    "GENERAL",
    "BEAUTY_WELLNESS",
    "MEDICAL_DENTAL",
    "THERAPY_COACHING",
    "HOME_FREELANCE",
    "SPORT_OUTDOOR",
  ]).optional(),
});

/**
 * Schema pentru date legale business
 */
const legalInfoSchema = z.object({
  businessId: z.string().min(1, "businessId este obligatoriu"),
  legalEntityName: z.string().min(1, "Numele entității legale este obligatoriu"),
  cui: z.string().min(1, "CUI este obligatoriu"),
  tradeRegisterNumber: z.string().optional().nullable(),
  vatStatus: z.enum(["VAT_PAYER", "NON_VAT_PAYER"]).optional().nullable(),
  vatCode: z.string().optional().nullable(),
  registeredStreet: z.string().min(1, "Strada este obligatorie"),
  registeredNumber: z.string().min(1, "Numărul este obligatoriu"),
  registeredCity: z.string().min(1, "Orașul este obligatoriu"),
  registeredCounty: z.string().min(1, "Județul este obligatoriu"),
  registeredPostalCode: z.string().min(1, "Codul poștal este obligatoriu"),
  businessType: z.string().optional(),
  websiteUrl: z.string().url("URL invalid").optional().nullable(),
  businessDescription: z.string().max(2000).optional().nullable(),
});

/**
 * Schema pentru reprezentant legal
 */
const representativeSchema = z.object({
  businessId: z.string().min(1, "businessId este obligatoriu"),
  fullName: z.string().min(1, "Numele complet este obligatoriu"),
  cnp: z.string().optional().nullable(),
  nationalIdType: z.string().optional().nullable(),
  nationalIdSeries: z.string().optional().nullable(),
  nationalIdNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().or(z.date()),
  residenceAddress: z.string().min(1, "Adresa de reședință este obligatorie"),
  email: z.string().email("Email invalid"),
  phone: z.string().min(1, "Telefonul este obligatoriu"),
  roleInCompany: z.string().optional(),
  beneficialOwner: z.boolean().optional(),
});

/**
 * Schema pentru cont bancar
 */
const bankAccountSchema = z.object({
  businessId: z.string().min(1, "businessId este obligatoriu"),
  iban: z.string().min(1, "IBAN este obligatoriu"),
  bankName: z.string().min(1, "Numele băncii este obligatoriu"),
  accountHolder: z.string().min(1, "Titularul contului este obligatoriu"),
});

/**
 * Schema pentru submit KYC
 */
const submitKycSchema = z.object({
  businessId: z.string().min(1, "businessId este obligatoriu"),
});

// Re-export businessIdParamSchema from businessSchemas for convenience
const businessSchemas = require("./businessSchemas");

module.exports = {
  registerBusinessSchema,
  legalInfoSchema,
  representativeSchema,
  bankAccountSchema,
  submitKycSchema,
  businessIdParamSchema: businessSchemas.businessIdParamSchema,
};
