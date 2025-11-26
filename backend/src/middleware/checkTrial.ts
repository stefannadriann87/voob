/**
 * Check Trial Middleware
 * Verifică dacă trial-ul a expirat și blochează accesul dacă da
 */

import { Request, Response, NextFunction } from "express";
const { isTrialExpired } = require("../services/trialService");
const prisma = require("../lib/prisma").default;

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * Middleware care verifică dacă trial-ul a expirat
 * Dacă da, returnează 403 cu { trialExpired: true }
 * 
 * Folosit pe toate rutele business (except subscription, billing, support)
 */
export function checkTrial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Skip pentru rutele de subscription, billing, support
  const allowedPaths = ["/subscription", "/platform-settings", "/business-onboarding"];
  const path = req.path;
  
  if (allowedPaths.some(allowed => path.includes(allowed))) {
    return next();
  }

  // Doar pentru utilizatori BUSINESS
  if (req.user?.role !== "BUSINESS") {
    return next();
  }

  // Obține businessId din request (poate fi în params, body sau query)
  const businessId = req.params.businessId || req.body.businessId || req.query.businessId;

  if (!businessId) {
    // Dacă nu avem businessId, încercăm să-l găsim din user
    prisma.user
      .findUnique({
        where: { id: req.user.userId },
        include: {
          ownedBusinesses: {
            select: { id: true },
            take: 1,
          },
        },
      })
      .then((user: any) => {
        if (user?.ownedBusinesses?.[0]?.id) {
          checkTrialForBusiness(user.ownedBusinesses[0].id, req, res, next);
        } else {
          next();
        }
      })
      .catch(() => next());
    return;
  }

  checkTrialForBusiness(businessId, req, res, next);
}

async function checkTrialForBusiness(
  businessId: string,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const expired = await isTrialExpired(businessId);

    if (expired) {
      return res.status(403).json({
        error: "Trial-ul a expirat. Te rugăm să activezi un plan de abonament.",
        trialExpired: true,
      });
    }

    next();
  } catch (error) {
    console.error("Check trial middleware error:", error);
    // În caz de eroare, permitem accesul (fail open)
    next();
  }
}

module.exports = { checkTrial };

