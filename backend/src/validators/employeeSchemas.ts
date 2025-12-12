/**
 * Employee Validation Schemas
 * Zod schemas pentru validare employee requests
 */

const { z } = require("zod");

const cuidRegex = /^c[a-z0-9]{24}$/;

/**
 * Schema pentru employeeId (param)
 */
const employeeIdParamSchema = z.object({
  employeeId: z.string().regex(cuidRegex, "employeeId trebuie să fie un CUID valid"),
});

/**
 * Schema pentru working hours
 */
const workingHoursSchema = z.object({
  workingHours: z.any().optional().nullable(), // TODO: Define proper structure
});

/**
 * Schema pentru create holiday
 */
const createHolidaySchema = z.object({
  startDate: z.string().datetime({ message: "startDate trebuie să fie o dată validă (ISO 8601)" }),
  endDate: z.string().datetime({ message: "endDate trebuie să fie o dată validă (ISO 8601)" }),
  reason: z.string().max(500, "Motivul nu poate depăși 500 caractere").optional().nullable(),
}).refine((data: { startDate: string; endDate: string; reason?: string | null }) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start < end;
}, {
  message: "Data de început trebuie să fie înainte de data de sfârșit",
  path: ["endDate"],
});

/**
 * Schema pentru holidayId (param)
 */
const holidayIdParamSchema = z.object({
  holidayId: z.string().regex(cuidRegex, "holidayId trebuie să fie un CUID valid"),
});

module.exports = {
  employeeIdParamSchema,
  workingHoursSchema,
  createHolidaySchema,
  holidayIdParamSchema,
};
