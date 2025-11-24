/**
 * AI Context Interface
 * Definește contextul utilizatorului pentru AI Agent
 */

interface AIContext {
  userId: string;
  role: "CLIENT" | "BUSINESS" | "EMPLOYEE" | "SUPERADMIN";
  businessId?: string | null;
}

// Export pentru utilizare în alte module
module.exports = {};

