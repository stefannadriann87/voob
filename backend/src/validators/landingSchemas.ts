/**
 * Landing Page Validation Schemas
 * Zod schemas pentru validare landing page requests
 */

const { z } = require("zod");

/**
 * Schema pentru available slots query
 */
const availableSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data trebuie să fie în format YYYY-MM-DD"),
});

/**
 * Schema pentru phone (format românesc: 07xxxxxxxx sau +407xxxxxxxx)
 */
const phoneSchema = z.string()
  .regex(/^(\+40|0)[0-9]{9}$/, "Numărul de telefon trebuie să fie în format românesc (07xxxxxxxx sau +407xxxxxxxx)")
  .min(10, "Numărul de telefon trebuie să aibă cel puțin 10 cifre")
  .max(13, "Numărul de telefon nu poate depăși 13 caractere");

/**
 * Schema pentru demo booking
 */
const demoBookingSchema = z.object({
  firstName: z.string()
    .min(1, "Prenumele este obligatoriu")
    .max(100, "Prenumele nu poate depăși 100 caractere")
    .regex(/^[a-zA-ZăâîșțĂÂÎȘȚ\s-]+$/, "Prenumele poate conține doar litere, spații și cratime"),
  lastName: z.string()
    .min(1, "Numele este obligatoriu")
    .max(100, "Numele nu poate depăși 100 caractere")
    .regex(/^[a-zA-ZăâîșțĂÂÎȘȚ\s-]+$/, "Numele poate conține doar litere, spații și cratime"),
  email: z.string()
    .email("Email invalid")
    .max(255, "Email-ul nu poate depăși 255 caractere"),
  phone: phoneSchema,
  dateTime: z.string().datetime({ message: "Data și ora trebuie să fie în format ISO 8601" }),
  captchaToken: z.string().optional(), // CAPTCHA token pentru verificare
}).refine((data: { firstName: string; lastName: string; email: string; phone: string; dateTime: string; captchaToken?: string }) => {
  const slotDate = new Date(data.dateTime);
  const now = Date.now();
  const threeMonthsFromNow = new Date(now);
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
  
  return slotDate.getTime() > now && slotDate.getTime() <= threeMonthsFromNow.getTime();
}, {
  message: "Data selectată trebuie să fie în viitor, dar nu mai departe de 3 luni",
  path: ["dateTime"],
});

module.exports = {
  availableSlotsQuerySchema,
  demoBookingSchema,
  phoneSchema,
};
