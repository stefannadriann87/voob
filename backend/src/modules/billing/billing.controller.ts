/**
 * Billing Controller
 * Controllers pentru rutele de billing
 */

import express = require("express");
const billingService = require("./billing.service");

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * POST /billing/setup-intent
 * Creează SetupIntent pentru salvarea cardului
 */
export async function createSetupIntentController(
  req: express.Request,
  res: express.Response
) {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Verifică autorizarea
  const prisma = require("../../lib/prisma").default;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    const clientSecret = await billingService.createSetupIntent(businessId);
    return res.json({ client_secret: clientSecret });
  } catch (error: any) {
    console.error("Create setup intent error:", error);
    return res.status(500).json({ error: error.message || "Eroare la crearea SetupIntent." });
  }
}

/**
 * POST /billing/subscribe
 * Activează subscription pentru un business
 */
export async function subscribeController(req: express.Request, res: express.Response) {
  const authReq = req as AuthenticatedRequest;
  const { businessId, planId, payment_method_id, auto_billing_consent, ip_address } = req.body;

  if (!businessId || !planId || !payment_method_id) {
    return res
      .status(400)
      .json({ error: "businessId, planId și payment_method_id sunt obligatorii." });
  }

  if (!auto_billing_consent) {
    return res.status(400).json({ error: "Consimțământul pentru auto-billing este obligatoriu." });
  }

  // Verifică autorizarea
  const prisma = require("../../lib/prisma").default;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    const result = await billingService.createSubscription(businessId, planId, payment_method_id, {
      consent: auto_billing_consent,
      ip: ip_address || req.ip || "unknown",
    });

    return res.json({
      success: true,
      subscriptionId: result.subscriptionId,
      customerId: result.customerId,
    });
  } catch (error: any) {
    console.error("Subscribe error:", error);
    return res.status(500).json({ error: error.message || "Eroare la activarea subscription-ului." });
  }
}

/**
 * POST /billing/cancel
 * Anulează subscription pentru un business
 */
export async function cancelController(req: express.Request, res: express.Response) {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Verifică autorizarea
  const prisma = require("../../lib/prisma").default;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    await billingService.cancelSubscription(businessId);
    return res.json({ success: true, message: "Subscription anulat cu succes." });
  } catch (error: any) {
    console.error("Cancel subscription error:", error);
    return res.status(500).json({ error: error.message || "Eroare la anularea subscription-ului." });
  }
}

/**
 * GET /billing/status/:businessId
 * Obține statusul subscription-ului pentru un business
 */
export async function getStatusController(req: express.Request, res: express.Response) {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.params;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Verifică autorizarea
  const prisma = require("../../lib/prisma").default;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    const status = await billingService.getSubscriptionStatus(businessId);
    return res.json(status);
  } catch (error: any) {
    console.error("Get status error:", error);
    return res.status(500).json({ error: error.message || "Eroare la obținerea statusului." });
  }
}

module.exports = {
  createSetupIntentController,
  subscribeController,
  cancelController,
  getStatusController,
};

