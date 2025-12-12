/**
 * Input Sanitization Utilities
 * Previne XSS și injection attacks prin sanitizare input
 */

/**
 * Sanitizează un string eliminând caractere periculoase
 * @param input - String-ul de sanitizat
 * @returns String sanitizat
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Elimină tag-uri HTML
  let sanitized = input.replace(/<[^>]*>/g, "");

  // Escape caractere speciale
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitizează un email (elimină caractere periculoase, păstrează format email)
 * @param email - Email-ul de sanitizat
 * @returns Email sanitizat
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") {
    return "";
  }

  // Elimină tag-uri HTML și caractere periculoase, păstrează format email valid
  let sanitized = email.replace(/<[^>]*>/g, "");
  sanitized = sanitized.replace(/[<>"']/g, "");
  sanitized = sanitized.trim().toLowerCase();

  return sanitized;
}

/**
 * Sanitizează un număr de telefon
 * @param phone - Numărul de telefon de sanitizat
 * @returns Număr de telefon sanitizat
 */
export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== "string") {
    return "";
  }

  // Păstrează doar cifre, spații, +, - și paranteze
  let sanitized = phone.replace(/[^\d\s+\-()]/g, "");
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitizează un obiect recursiv
 * @param obj - Obiectul de sanitizat
 * @returns Obiect sanitizat
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object" || obj instanceof FormData) {
    return obj;
  }

  const sanitized = { ...obj };

  for (const key in sanitized) {
    if (typeof sanitized[key] === "string") {
      sanitized[key] = sanitizeString(sanitized[key]) as any;
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeObject(sanitized[key]) as any;
    } else if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map((item: any) => 
        typeof item === "string" ? sanitizeString(item) : 
        typeof item === "object" ? sanitizeObject(item) : 
        item
      ) as any;
    }
  }

  return sanitized;
}

/**
 * Sanitizează un array de string-uri
 * @param arr - Array-ul de sanitizat
 * @returns Array sanitizat
 */
export function sanitizeArray(arr: (string | null | undefined)[]): string[] {
  if (!Array.isArray(arr)) {
    return [];
  }

  return arr.map((item) => sanitizeString(item)).filter((item) => item.length > 0);
}
