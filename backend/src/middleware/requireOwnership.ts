/**
 * Ownership Verification Middleware
 * Verifică dacă user-ul are acces la resursa solicitată (business, booking, etc.)
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

/**
 * Verifică dacă user-ul este owner sau employee al business-ului
 * @param businessIdParam - Numele parametrului din URL care conține businessId (default: "businessId" sau "id")
 */
const requireBusinessAccess = (businessIdParam: string = "businessId") => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }

    // SuperAdmin poate accesa orice business
    if (user.role === "SUPERADMIN") {
      return next();
    }

    // Extrage businessId din params sau body
    const businessId = req.params[businessIdParam] || req.params.id || req.body.businessId;

    if (!businessId) {
      return res.status(400).json({ error: "businessId este obligatoriu." });
    }

    try {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          ownerId: true,
          employees: {
            select: { id: true },
          },
        },
      });

      if (!business) {
        return res.status(404).json({ error: "Business-ul nu a fost găsit." });
      }

      // Verifică dacă user-ul este owner
      if (business.ownerId === user.userId) {
        return next();
      }

      // Verifică dacă user-ul este employee
      if (business.employees.some((emp: { id: string }) => emp.id === user.userId)) {
        return next();
      }

      // Verifică dacă user-ul are businessId în token (pentru business users)
      if (user.businessId === businessId) {
        return next();
      }

      logger.warn("Unauthorized business access attempt", {
        userId: user.userId,
        role: user.role,
        businessId,
      });

      return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
    } catch (error) {
      logger.error("Business access verification failed", error);
      return res.status(500).json({ error: "Eroare la verificarea accesului." });
    }
  };
};

/**
 * Verifică dacă user-ul are acces la booking (client, business owner, employee, sau SuperAdmin)
 * @param bookingIdParam - Numele parametrului din URL care conține bookingId (default: "id")
 */
const requireBookingAccess = (bookingIdParam: string = "id") => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      return res.status(401).json({ error: "Autentificare necesară." });
    }

    // SuperAdmin poate accesa orice booking
    if (user.role === "SUPERADMIN") {
      return next();
    }

    const bookingId = req.params[bookingIdParam] || req.params.id || req.body.bookingId;

    if (!bookingId) {
      return res.status(400).json({ error: "bookingId este obligatoriu." });
    }

    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          clientId: true,
          businessId: true,
          employeeId: true,
          business: {
            select: {
              ownerId: true,
              employees: {
                select: { id: true },
              },
            },
          },
        },
      });

      if (!booking) {
        return res.status(404).json({ error: "Rezervarea nu a fost găsită." });
      }

      // Client poate accesa doar propriile bookings
      if (user.role === "CLIENT" && booking.clientId === user.userId) {
        return next();
      }

      // Business owner poate accesa bookings pentru business-ul său
      if (user.role === "BUSINESS" && booking.business.ownerId === user.userId) {
        return next();
      }

      // Employee poate accesa bookings pentru business-ul său
      if (user.role === "EMPLOYEE") {
        const isEmployee = booking.business.employees.some((emp: { id: string }) => emp.id === user.userId);
        if (isEmployee) {
          return next();
        }
      }

      logger.warn("Unauthorized booking access attempt", {
        userId: user.userId,
        role: user.role,
        bookingId,
      });

      return res.status(403).json({ error: "Nu ai permisiunea de a accesa această rezervare." });
    } catch (error) {
      logger.error("Booking access verification failed", error);
      return res.status(500).json({ error: "Eroare la verificarea accesului." });
    }
  };
};

module.exports = {
  requireBusinessAccess,
  requireBookingAccess,
};

