import { useState, useCallback } from "react";
import { sanitizeString, sanitizeEmail, sanitizePhone } from "../lib/sanitize";
import { validateEmail, validatePassword, validateName, validatePhone, validateString } from "../lib/validation";

interface ValidationErrors {
  [key: string]: string | undefined;
}

/**
 * Hook pentru validare și sanitizare form-uri
 */
export function useFormValidation<T extends Record<string, any>>(initialValues: T) {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [values, setValues] = useState<T>(initialValues);

  /**
   * Sanitizează și validează un câmp
   */
  const validateField = useCallback((name: string, value: any, type?: "email" | "password" | "name" | "phone" | "string" | "number") => {
    let sanitized = value;
    let validation: { valid: boolean; error?: string } = { valid: true };

    // Sanitizare bazată pe tip
    if (typeof value === "string") {
      if (type === "email") {
        sanitized = sanitizeEmail(value);
        validation = validateEmail(sanitized);
      } else if (type === "password") {
        sanitized = value; // Nu sanitizăm parola (păstrăm caractere speciale)
        validation = validatePassword(sanitized);
      } else if (type === "name") {
        sanitized = sanitizeString(value);
        validation = validateName(sanitized);
      } else if (type === "phone") {
        sanitized = sanitizePhone(value);
        validation = validatePhone(sanitized);
      } else {
        sanitized = sanitizeString(value);
        validation = validateString(sanitized);
      }
    }

    // Update errors
    setErrors((prev) => ({
      ...prev,
      [name]: validation.valid ? undefined : validation.error,
    }));

    return { sanitized, valid: validation.valid };
  }, []);

  /**
   * Update value cu sanitizare automată
   */
  const setValue = useCallback((name: string, value: any, type?: "email" | "password" | "name" | "phone" | "string") => {
    let sanitized = value;

    if (typeof value === "string") {
      if (type === "email") {
        sanitized = sanitizeEmail(value);
      } else if (type === "phone") {
        sanitized = sanitizePhone(value);
      } else if (type !== "password") {
        sanitized = sanitizeString(value);
      }
    }

    setValues((prev) => ({
      ...prev,
      [name]: sanitized,
    }));

    // Auto-validate on change
    if (type) {
      validateField(name, sanitized, type);
    }
  }, [validateField]);

  /**
   * Validează toate câmpurile
   */
  const validateAll = useCallback((fields: Array<{ name: string; type?: "email" | "password" | "name" | "phone" | "string" }>) => {
    let allValid = true;
    const newErrors: ValidationErrors = {};

    fields.forEach(({ name, type }) => {
      const value = values[name];
      const result = validateField(name, value, type);
      if (!result.valid) {
        allValid = false;
        // Error is already set by validateField in setErrors
      }
    });

    // Get errors from state (they were set by validateField)
    setErrors((prev) => ({ ...prev }));
    return allValid;
  }, [values, validateField]);

  return {
    values,
    errors,
    setValue,
    validateField,
    validateAll,
    setErrors,
  };
}
