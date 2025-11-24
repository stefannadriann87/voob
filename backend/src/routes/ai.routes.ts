/**
 * AI Routes
 */

const express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { aiChatHandler } = require("../controllers/ai.controller");
const { buildAIContext } = require("../ai/contextBuilder");
const { runAIAgent } = require("../ai/agent");
const { toolsByRole } = require("../ai/permissions");

const router = express.Router();

/**
 * POST /api/ai/chat
 * Endpoint pentru AI chat cu function calling (nou)
 */
router.post("/chat", verifyJWT, aiChatHandler);

/**
 * POST /api/ai/agent
 * Endpoint principal pentru AI Agent (compatibilitate cu vechiul sistem)
 */
router.post("/agent", verifyJWT, async (req: any, res: any) => {
  try {
    console.log("🔵 AI Agent request received");
    const authReq = req;
    const user = authReq.user;

    if (!user) {
      console.error("❌ No user in request");
      return res.status(401).json({ error: "Utilizator neautentificat." });
    }

    console.log("✅ User authenticated:", { userId: user.userId, role: user.role });

    const { message, conversationHistory = [] }: { message?: string; conversationHistory?: any[] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Mesajul este obligatoriu." });
    }

    console.log("📝 Processing message:", message.substring(0, 50) + "...");

    // Construiește contextul AI
    const context = await buildAIContext(user);
    console.log("🔧 Context built:", { userId: context.userId, role: context.role, businessId: context.businessId });

    // Gestionează cererea AI folosind noul agent
    const result = await runAIAgent({
      message,
      context,
    });
    console.log("✅ AI response generated");

    return res.json({
      response: result.reply,
      tools: toolsByRole[context.role],
      toolCalls: result.toolCalls,
    });
  } catch (error: any) {
    console.error("❌ AI Agent error:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({ error: error.message || "Eroare la procesarea cererii AI." });
  }
});

module.exports = router;

