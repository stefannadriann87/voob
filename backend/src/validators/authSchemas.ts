/**
 * Auth Validation Schemas
 * Zod schemas pentru validare auth requests cu password policy
 */

const { z } = require("zod");

/**
 * Password Policy:
 * - Minim 8 caractere
 * - Cel puțin o literă mare
 * - Cel puțin o literă mică
 * - Cel puțin o cifră
 * - Cel puțin un caracter special
 */
const passwordSchema = z
  .string()
  .min(8, "Parola trebuie să aibă minim 8 caractere")
  .regex(/[A-Z]/, "Parola trebuie să conțină cel puțin o literă mare")
  .regex(/[a-z]/, "Parola trebuie să conțină cel puțin o literă mică")
  .regex(/[0-9]/, "Parola trebuie să conțină cel puțin o cifră")
  .regex(/[^A-Za-z0-9]/, "Parola trebuie să conțină cel puțin un caracter special (!@#$%^&*)");

/**
 * Schema pentru înregistrare
 */
const registerSchema = z.object({
  email: z
    .string()
    .email("Email invalid")
    .max(255, "Email-ul nu poate depăși 255 caractere"),
  password: passwordSchema,
  name: z
    .string()
    .min(2, "Numele trebuie să aibă minim 2 caractere")
    .max(100, "Numele nu poate depăși 100 caractere"),
  phone: z
    .string()
    .regex(/^(\+40|0)[0-9]{9}$/, "Număr de telefon invalid (format: 07xxxxxxxx sau +407xxxxxxxx)")
    .optional()
    .nullable(),
  role: z.enum(["CLIENT", "BUSINESS", "EMPLOYEE"]).optional(),
  businessName: z
    .string()
    .min(2, "Numele business-ului trebuie să aibă minim 2 caractere")
    .max(200, "Numele business-ului nu poate depăși 200 caractere")
    .optional(),
  businessType: z
    .enum(["GENERAL", "BEAUTY_WELLNESS", "MEDICAL_DENTAL", "THERAPY_COACHING", "SPORT_OUTDOOR", "HOME_FREELANCE"])
    .optional(),
  captchaToken: z.string().optional(),
});

/**
 * Schema pentru login
 */
const loginSchema = z.object({
  email: z.string().email("Email invalid"),
  password: z.string().min(1, "Parola este obligatorie"),
  role: z.enum(["CLIENT", "BUSINESS", "EMPLOYEE", "SUPERADMIN"]).optional(),
  captchaToken: z.string().optional(),
});

/**
 * Schema pentru forgot password
 */
const forgotPasswordSchema = z.object({
  email: z.string().email("Email invalid"),
});

/**
 * Schema pentru reset password
 */
const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token obligatoriu"),
  password: passwordSchema,
});

/**
 * Schema pentru update profile
 */
const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Numele trebuie să aibă minim 2 caractere")
    .max(100, "Numele nu poate depăși 100 caractere")
    .optional(),
  phone: z
    .string()
    .regex(/^(\+40|0)?[0-9]{9,10}$/, "Număr de telefon invalid")
    .optional()
    .nullable(),
  specialization: z.string().max(200).optional().nullable(),
  avatar: z.string().url("URL avatar invalid").optional().nullable(),
});

/**
 * Validare password strength (pentru UI feedback)
 */
function getPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push("Adaugă cel puțin 8 caractere");

  if (password.length >= 12) score++;

  if (/[A-Z]/.test(password)) score++;
  else feedback.push("Adaugă o literă mare");

  if (/[a-z]/.test(password)) score++;
  else feedback.push("Adaugă o literă mică");

  if (/[0-9]/.test(password)) score++;
  else feedback.push("Adaugă o cifră");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push("Adaugă un caracter special");

  return { score, feedback };
}

module.exports = {
  passwordSchema,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  getPasswordStrength,
};

