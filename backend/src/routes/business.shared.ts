/**
 * Shared types and constants for business routes
 * CRITICAL FIX (TICKET-014): Extracted shared code for modular business routes
 */

import express = require("express");

const defaultBusinessInclude = {
  owner: {
    select: { id: true, email: true, name: true },
  },
  services: true,
  employees: {
    select: { id: true, name: true, email: true, phone: true, specialization: true, avatar: true },
  },
};

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
    businessId?: string;
  };
}

// Export both CommonJS and ES module style
module.exports = {
  defaultBusinessInclude,
};

// Export type for TypeScript (must be separate from module.exports)
export type { AuthenticatedRequest };
export { defaultBusinessInclude };
