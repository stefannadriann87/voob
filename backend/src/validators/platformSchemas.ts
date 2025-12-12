/**
 * Platform Settings Validation Schemas
 * Zod schemas pentru validare platform settings requests
 */

const { z } = require("zod");

/**
 * Whitelist pentru key-uri permise (exemplu - ajustează după nevoi)
 * Dacă vrei să permiți orice key, poți folosi doar validare format
 */
const ALLOWED_KEYS = [
  "maintenance_mode",
  "registration_enabled",
  "max_employees_per_business",
  "default_subscription_plan",
  "stripe_test_mode",
  "email_notifications_enabled",
  "sms_notifications_enabled",
  // Adaugă aici key-urile permise
];

/**
 * Schema pentru key (alphanumeric + underscore, max 100 caractere)
 */
const platformKeySchema = z.string()
  .min(1, "Key-ul este obligatoriu")
  .max(100, "Key-ul nu poate depăși 100 caractere")
  .regex(/^[a-zA-Z0-9_]+$/, "Key-ul poate conține doar litere, cifre și underscore")
  .refine((key) => {
    // Dacă există whitelist, verifică
    if (ALLOWED_KEYS.length > 0) {
      return ALLOWED_KEYS.includes(key);
    }
    return true; // Dacă nu există whitelist, permite orice key valid
  }, {
    message: "Key-ul nu este permis. Te rugăm să folosești un key din lista de key-uri permise.",
  });

/**
 * Schema pentru value (max 10000 caractere)
 */
const platformValueSchema = z.string()
  .min(1, "Value-ul este obligatoriu")
  .max(10000, "Value-ul nu poate depăși 10000 caractere");

/**
 * Schema pentru update platform setting
 */
const updatePlatformSettingSchema = z.object({
  value: platformValueSchema,
  description: z.string().max(500, "Descrierea nu poate depăși 500 caractere").optional().nullable(),
});

/**
 * Schema pentru key param
 */
const platformKeyParamSchema = z.object({
  key: platformKeySchema,
});

module.exports = {
  platformKeySchema,
  platformValueSchema,
  updatePlatformSettingSchema,
  platformKeyParamSchema,
  ALLOWED_KEYS,
};
