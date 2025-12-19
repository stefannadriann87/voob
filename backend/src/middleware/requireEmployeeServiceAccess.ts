/**
 * Employee Service Access Middleware
 * TICKET-045: Unifică logică de autorizare pentru employee services
 * Verifică dacă user-ul are permisiunea de a gestiona serviciile pentru un employee
 */

import express = require("express");
const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
    businessId?: string;
  };
}

interface RequireEmployeeServiceAccessOptions {
  /**
   * Dacă employee-ul poate gestiona propriile servicii (self-service)
   * Dacă true, verifică și canManageOwnServices flag
   */
  allowSelfService?: boolean;
}

/**
 * Verifică dacă user-ul are permisiunea de a gestiona serviciile pentru un employee
 * 
 * Logica:
 * 1. Dacă e business owner -> permite
 * 2. Dacă e employee și allowSelfService=true -> verifică canManageOwnServices
 * 3. Altfel -> respinge
 * 
 * @param options - Opțiuni pentru middleware
 * @param employeeIdParam - Numele parametrului din URL care conține employeeId (default: "employeeId")
 */
const requireEmployeeServiceAccess = (
  options: RequireEmployeeServiceAccessOptions = {},
  employeeIdParam: string = "employeeId"
) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }

    const { allowSelfService = false } = options;
    const employeeId = req.params[employeeIdParam];

    if (!employeeId) {
      return res.status(400).json({ error: "employeeId este obligatoriu." });
    }

    try {
      // SuperAdmin poate accesa orice
      if (user.role === "SUPERADMIN") {
        return next();
      }

      // Get employee with business
      const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          role: true,
          businessId: true,
          canManageOwnServices: true, // TICKET-044: Verifică permisiunea
          business: {
            select: {
              id: true,
              ownerId: true,
              status: true,
            },
          },
        },
      });

      if (!employee || employee.role !== "EMPLOYEE") {
        return res.status(404).json({ 
          error: "Angajatul nu a fost găsit.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că angajatul există și că are rolul de EMPLOYEE."
        });
      }

      if (!employee.businessId || !employee.business) {
        return res.status(404).json({ 
          error: "Angajatul nu are un business asociat.",
          code: "EMPLOYEE_NO_BUSINESS",
          actionable: "Verifică că angajatul este asociat cu un business."
        });
      }

      // CRITICAL FIX (TICKET-004): Verify business is ACTIVE
      if (employee.business.status !== "ACTIVE") {
        logger.warn("Attempt to access employee services for inactive business", {
          userId: user.userId,
          role: user.role,
          businessId: employee.business.id,
          status: employee.business.status,
        });
        return res.status(403).json({ 
          error: "Business-ul este suspendat. Accesul este restricționat.",
          code: "BUSINESS_INACTIVE",
          actionable: "Contactează suportul pentru mai multe informații."
        });
      }

      // Verifică dacă e business owner
      if (employee.business.ownerId === user.userId) {
        return next();
      }

      // Verifică dacă e employee și are permisiunea de self-service
      if (user.role === "EMPLOYEE" && allowSelfService) {
        // Verifică că employee-ul încearcă să-și gestioneze propriile servicii
        if (employee.id !== user.userId) {
          return res.status(403).json({ 
            error: "Nu poți gestiona serviciile altor angajați.",
            code: "CANNOT_MANAGE_OTHER_EMPLOYEES",
            actionable: "Poți gestiona doar propriile servicii."
          });
        }

        // TICKET-044: Verifică canManageOwnServices flag
        if (!employee.canManageOwnServices) {
          return res.status(403).json({ 
            error: "Nu ai permisiunea de a-ți gestiona propriile servicii. Contactează business owner-ul.",
            code: "SELF_SERVICE_NOT_ALLOWED",
            actionable: "Contactează business owner-ul pentru a obține permisiunea."
          });
        }

        return next();
      }

      logger.warn("Unauthorized employee service access attempt", {
        userId: user.userId,
        role: user.role,
        employeeId,
        businessId: employee.business.id,
        allowSelfService,
        canManageOwnServices: employee.canManageOwnServices,
      });

      return res.status(403).json({ 
        error: "Nu ai permisiunea de a gestiona serviciile acestui angajat.",
        code: "EMPLOYEE_SERVICE_ACCESS_DENIED",
        actionable: "Doar business owner-ul poate gestiona serviciile angajaților."
      });
    } catch (error) {
      logger.error("Employee service access verification failed", error);
      return res.status(500).json({ 
        error: "Eroare la verificarea accesului.",
        code: "ACCESS_VERIFICATION_ERROR",
        actionable: "Te rugăm să încerci din nou."
      });
    }
  };
};

module.exports = {
  requireEmployeeServiceAccess,
};
