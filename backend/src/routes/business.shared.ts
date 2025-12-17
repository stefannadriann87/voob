/**
 * Shared types and constants for business routes
 * CRITICAL FIX (TICKET-014): Extracted shared code for modular business routes
 */

const defaultBusinessInclude = {
  owner: {
    select: { id: true, email: true, name: true },
  },
  services: true,
  employees: {
    select: { id: true, name: true, email: true, phone: true, specialization: true, avatar: true },
  },
};

// CommonJS export
module.exports = {
  defaultBusinessInclude,
};
