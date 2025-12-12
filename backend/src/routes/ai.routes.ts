/**
 * AI Routes
 */

const express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { aiChatHandler } = require("../controllers/ai.controller");
const { buildAIContext } = require("../ai/contextBuilder");
const { runAIAgent } = require("../ai/agent");
const { toolsByRole } = require("../ai/permissions");
const { aiRateLimiter } = require("../middleware/aiRateLimit");
const { sanitizeAiMessage, sanitizeConversationHistory, validateAiMessage } = require("../lib/aiSanitize");
const { checkAllCostLimits } = require("../services/aiCostService");
const { logger } = require("../lib/logger");

const router = express.Router();

/**
 * POST /api/ai/chat
 * Endpoint pentru AI chat cu function calling (nou)
 */
router.post("/chat", verifyJWT, aiRateLimiter, aiChatHandler);

/**
 * POST /api/ai/agent
 * Endpoint principal pentru AI Agent (compatibilitate cu vechiul sistem)
 */
router.post("/agent", verifyJWT, aiRateLimiter, async (req: any, res: any) => {
  try {
    const authReq = req;
    const user = authReq.user;

    if (!user) {
      logger.error("❌ No user in request");
      return res.status(401).json({ error: "Utilizator neautentificat." });
    }


    const { message: rawMessage, conversationHistory: rawHistory = [] }: { message?: string; conversationHistory?: any[] } = req.body;

    // Validare și sanitizare input
    const validation = validateAiMessage(rawMessage);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error || "Mesaj invalid." });
    }

    const message = sanitizeAiMessage(rawMessage || "");
    const conversationHistory = sanitizeConversationHistory(rawHistory);

    // Verifică limitele de cost
    const costCheck = await checkAllCostLimits(user.userId, user.businessId || null);
    if (!costCheck.allowed) {
      logger.warn(`❌ AI cost limit exceeded for user ${user.userId}: ${costCheck.reason}`);
      return res.status(429).json({
        error: "Limita de cost pentru AI a fost depășită. Te rugăm să încerci mai târziu.",
        reason: costCheck.reason,
      });
    }


    // Construiește contextul AI
    const context = await buildAIContext(user);

    // Validează context-ul înainte de folosire
    if (!context || !context.userId || !context.role) {
      logger.error("❌ Invalid context built for user:", user.userId);
      return res.status(500).json({ error: "Eroare la construirea contextului AI." });
    }

    // Gestionează cererea AI folosind noul agent
    const result = await runAIAgent({
      message,
      context,
      conversationHistory,
    });

    return res.json({
      response: result.reply,
      tools: toolsByRole[context.role],
      toolCalls: result.toolCalls,
    });
  } catch (error: any) {
    logger.error("❌ AI Agent error:", error);
    logger.error("Error stack:", error.stack);
    return res.status(500).json({ error: error.message || "Eroare la procesarea cererii AI." });
  }
});

module.exports = router;

