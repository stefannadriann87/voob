/**
 * AI Controller
 */

import express = require("express");
const { runAIAgent } = require("../ai/agent");
const { logger } = require("../lib/logger");
const { sanitizeAiMessage, sanitizeConversationHistory, validateAiMessage } = require("../lib/aiSanitize");
const { checkAllCostLimits } = require("../services/aiCostService");

interface AuthenticatedRequest extends express.Request {
  aiContext?: any;
  user?: any;
}

const aiChatHandler = async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const { message: rawMessage }: { message?: string } = req.body;

  // Validare și sanitizare input
  const validation = validateAiMessage(rawMessage);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error || "Mesaj invalid." });
  }

  const message = sanitizeAiMessage(rawMessage || "");
  
  if (!message) {
    return res.status(400).json({ error: "Mesajul este obligatoriu." });
  }

  if (!authReq.aiContext) {
    return res.status(401).json({ error: "Utilizator neautentificat." });
  }

  // Verifică limitele de cost
  if (authReq.user) {
    const costCheck = await checkAllCostLimits(authReq.user.userId, authReq.user.businessId || null);
    if (!costCheck.allowed) {
      logger.warn(`❌ AI cost limit exceeded for user ${authReq.user.userId}: ${costCheck.reason}`);
      return res.status(429).json({
        error: "Limita de cost pentru AI a fost depășită. Te rugăm să încerci mai târziu.",
        reason: costCheck.reason,
      });
    }
  }

  // Validează context-ul înainte de folosire
  if (!authReq.aiContext || !authReq.aiContext.userId || !authReq.aiContext.role) {
    logger.error("❌ Invalid AI context in request");
    return res.status(500).json({ error: "Eroare: context AI invalid." });
  }

  try {
    const result = await runAIAgent({
      message,
      context: authReq.aiContext,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error("AI Controller error:", error);
    return res.status(500).json({
      error: error.message || "Eroare la procesarea cererii AI.",
    });
  }
};

module.exports = { aiChatHandler };
