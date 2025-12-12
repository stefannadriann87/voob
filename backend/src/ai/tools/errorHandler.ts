/**
 * Unified Error Handler pentru AI Tools
 * Unifică error handling în toate tools-urile
 */

const { logger } = require("../../lib/logger");
const { ZodError } = require("zod");

/**
 * Formatează eroarea într-un format consistent pentru AI
 */
function formatToolError(error: any): string {
  // Zod validation errors
  if (error instanceof ZodError) {
    const errors = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    return `Eroare de validare: ${errors}`;
  }

  // Prisma errors
  if (error.code === "P2002") {
    return "Eroare: Date duplicate. Acest înregistrare există deja.";
  }

  if (error.code === "P2025") {
    return "Eroare: Înregistrarea nu a fost găsită.";
  }

  // Standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Unknown errors
  logger.error("Unknown error type in AI tool:", error);
  return "Eroare neașteptată. Te rugăm să încerci din nou.";
}

/**
 * Wrapper pentru tools care unifică error handling
 */
async function withToolErrorHandling<T>(
  toolName: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const formattedError = formatToolError(error);
    logger.error(`❌ AI Tool ${toolName} error:`, error);
    throw new Error(formattedError);
  }
}

module.exports = {
  formatToolError,
  withToolErrorHandling,
};
