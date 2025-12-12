/**
 * Frontend Validation Utilities
 * Validare consistentă folosind reguli simple (fără dependențe externe)
 */

/**
 * Validează un email
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email-ul este obligatoriu" };
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Email-ul este obligatoriu" };
  }

  // Regex simplu pentru validare email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Email-ul nu este valid" };
  }

  if (trimmed.length > 255) {
    return { valid: false, error: "Email-ul nu poate depăși 255 caractere" };
  }

  return { valid: true };
}

/**
 * Validează o parolă
 */
export function validatePassword(
  password: string,
  options?: { minLength?: number; requireUppercase?: boolean; requireNumber?: boolean }
): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Parola este obligatorie" };
  }

  const minLength = options?.minLength || 6;
  if (password.length < minLength) {
    return { valid: false, error: `Parola trebuie să aibă cel puțin ${minLength} caractere` };
  }

  if (options?.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, error: "Parola trebuie să conțină cel puțin o literă mare" };
  }

  if (options?.requireNumber && !/[0-9]/.test(password)) {
    return { valid: false, error: "Parola trebuie să conțină cel puțin o cifră" };
  }

  return { valid: true };
}

/**
 * Validează un nume
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Numele este obligatoriu" };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Numele este obligatoriu" };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: "Numele trebuie să aibă cel puțin 2 caractere" };
  }

  if (trimmed.length > 255) {
    return { valid: false, error: "Numele nu poate depăși 255 caractere" };
  }

  return { valid: true };
}

/**
 * Validează un număr de telefon (format românesc)
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "Telefonul este obligatoriu" };
  }

  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return { valid: true }; // Telefonul este opțional
  }

  // Format românesc: 07XXXXXXXX sau +407XXXXXXXX
  const phoneRegex = /^(\+40|0)?[0-9]{9}$/;
  const digitsOnly = trimmed.replace(/[\s\-()]/g, "");

  if (!phoneRegex.test(digitsOnly)) {
    return { valid: false, error: "Numărul de telefon nu este valid (format: 07XXXXXXXX)" };
  }

  return { valid: true };
}

/**
 * Validează un string generic
 */
export function validateString(
  value: string,
  options?: { minLength?: number; maxLength?: number; required?: boolean }
): { valid: boolean; error?: string } {
  const required = options?.required ?? false;
  const minLength = options?.minLength;
  const maxLength = options?.maxLength;

  if (required && (!value || typeof value !== "string" || value.trim().length === 0)) {
    return { valid: false, error: "Câmpul este obligatoriu" };
  }

  if (!value || typeof value !== "string") {
    return { valid: true }; // Dacă nu e required, empty e OK
  }

  const trimmed = value.trim();

  if (minLength && trimmed.length < minLength) {
    return { valid: false, error: `Câmpul trebuie să aibă cel puțin ${minLength} caractere` };
  }

  if (maxLength && trimmed.length > maxLength) {
    return { valid: false, error: `Câmpul nu poate depăși ${maxLength} caractere` };
  }

  return { valid: true };
}

/**
 * Validează un număr
 */
export function validateNumber(
  value: number | string,
  options?: { min?: number; max?: number; required?: boolean }
): { valid: boolean; error?: string } {
  const required = options?.required ?? false;

  if (required && (value === null || value === undefined || value === "")) {
    return { valid: false, error: "Câmpul este obligatoriu" };
  }

  if (value === null || value === undefined || value === "") {
    return { valid: true }; // Dacă nu e required, empty e OK
  }

  const num = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(num)) {
    return { valid: false, error: "Valoarea trebuie să fie un număr" };
  }

  if (options?.min !== undefined && num < options.min) {
    return { valid: false, error: `Valoarea trebuie să fie cel puțin ${options.min}` };
  }

  if (options?.max !== undefined && num > options.max) {
    return { valid: false, error: `Valoarea trebuie să fie cel mult ${options.max}` };
  }

  return { valid: true };
}
