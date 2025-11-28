/**
 * Webhook Signature Verification Middleware
 * Unifică verificarea semnăturilor pentru toate webhook-urile (Stripe, etc.)
 */

import express = require("express");
const { logger } = require("../lib/logger");

interface WebhookRequest extends express.Request {
  rawBody?: Buffer;
}

/**
 * Verifică semnătura webhook-ului Stripe
 * @param webhookSecret - Secret-ul pentru verificare (STRIPE_WEBHOOK_SECRET sau STRIPE_BILLING_WEBHOOK_SECRET)
 * @returns Express middleware
 */
const verifyStripeWebhook = (webhookSecret: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const webhookReq = req as WebhookRequest;

    if (!webhookSecret) {
      logger.error("Webhook secret not configured", { path: req.path });
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (!webhookReq.rawBody) {
      logger.error("Raw body missing for webhook verification", { path: req.path });
      return res.status(400).json({ error: "Raw body required for webhook verification" });
    }

    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      logger.warn("Missing Stripe signature header", { path: req.path });
      return res.status(400).json({ error: "Missing signature header" });
    }

    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const event = stripe.webhooks.constructEvent(webhookReq.rawBody, signature, webhookSecret);

      // Adaugă event-ul la request pentru a fi folosit în handler
      (req as express.Request & { webhookEvent?: any }).webhookEvent = event;
      next();
    } catch (error: any) {
      logger.error("Stripe webhook signature verification failed", error, {
        path: req.path,
        signature: signature?.substring(0, 20) + "...",
      });
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  };
};

/**
 * Helper pentru a obține webhook secret-ul din environment
 * @param type - Tipul webhook-ului: "payment" sau "billing"
 * @returns Webhook secret sau null
 */
const getWebhookSecret = (type: "payment" | "billing" = "payment"): string | null => {
  if (type === "billing") {
    return process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || null;
  }
  return process.env.STRIPE_WEBHOOK_SECRET || null;
};

module.exports = {
  verifyStripeWebhook,
  getWebhookSecret,
};

