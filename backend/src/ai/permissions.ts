import type { Role } from "@prisma/client";

// Mapare tools disponibile pentru fiecare rol
const toolsByRole: Record<Role, string[]> = {
  CLIENT: ["viewBookings", "cancelOwnBooking"],
  BUSINESS: ["viewBookings", "createBooking", "cancelBooking", "generateReport"],
  EMPLOYEE: ["viewBookings", "createBooking", "cancelBooking"],
  SUPERADMIN: ["viewAllBusinesses", "viewTransactions", "generateGlobalReport"],
};

// Verifică dacă un tool este permis pentru un rol
function isToolAllowed(role: Role, toolName: string): boolean {
  return toolsByRole[role]?.includes(toolName) ?? false;
}

module.exports = { toolsByRole, isToolAllowed };

