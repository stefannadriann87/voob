/**
 * Environment Variables Validator
 * Validează și asigură că toate variabilele de mediu necesare sunt setate
 */

interface EnvValidationOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  defaultValue?: string;
  allowedValues?: string[];
}

class EnvValidationError extends Error {
  constructor(public variable: string, message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Validează o variabilă de mediu
 * @param key - Numele variabilei de mediu
 * @param options - Opțiuni de validare
 * @returns Valoarea validată sau default
 * @throws EnvValidationError dacă validarea eșuează
 */
function validateEnv(key: string, options: EnvValidationOptions = {}): string {
  const {
    required = false,
    minLength,
    maxLength,
    pattern,
    defaultValue,
    allowedValues,
  } = options;

  const value = process.env[key];

  // Dacă nu este setat și nu este required, returnează default sau empty string
  if (!value) {
    if (required) {
      throw new EnvValidationError(
        key,
        `Environment variable ${key} is required but not set. Please set it in your .env file or environment.`
      );
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return "";
  }

  // Validare minLength
  if (minLength !== undefined && value.length < minLength) {
    throw new EnvValidationError(
      key,
      `Environment variable ${key} must be at least ${minLength} characters long. Current length: ${value.length}`
    );
  }

  // Validare maxLength
  if (maxLength !== undefined && value.length > maxLength) {
    throw new EnvValidationError(
      key,
      `Environment variable ${key} must be at most ${maxLength} characters long. Current length: ${value.length}`
    );
  }

  // Validare pattern
  if (pattern && !pattern.test(value)) {
    throw new EnvValidationError(
      key,
      `Environment variable ${key} does not match required pattern: ${pattern}`
    );
  }

  // Validare allowedValues
  if (allowedValues && !allowedValues.includes(value)) {
    throw new EnvValidationError(
      key,
      `Environment variable ${key} must be one of: ${allowedValues.join(", ")}. Got: ${value}`
    );
  }

  return value;
}

/**
 * Validează toate variabilele de mediu necesare la startup
 * Aruncă eroare dacă variabilele critice lipsesc
 */
function validateRequiredEnv(): void {
  const requiredVars: Array<{ key: string; options: EnvValidationOptions }> = [
    { key: "JWT_SECRET", options: { required: true, minLength: 32 } },
    { key: "DATABASE_URL", options: { required: true } },
  ];

  const errors: string[] = [];

  for (const { key, options } of requiredVars) {
    try {
      validateEnv(key, options);
    } catch (error) {
      if (error instanceof EnvValidationError) {
        errors.push(error.message);
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ Environment validation failed:");
    errors.forEach((error) => console.error(`  - ${error}`));
    console.error("\nPlease set the required environment variables and restart the server.");
    process.exit(1);
  }
}

/**
 * Helper pentru variabile opționale cu default
 */
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Helper pentru variabile boolean
 */
function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Helper pentru variabile number
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
}

module.exports = {
  validateEnv,
  validateRequiredEnv,
  getEnv,
  getEnvBool,
  getEnvNumber,
  EnvValidationError,
};

