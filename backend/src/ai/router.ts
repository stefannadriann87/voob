import type { Request, Response } from "express";
const express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { buildAIContext } = require("./contextBuilder");
const { handleAIRequest } = require("./agent");
const { toolsByRole } = require("./permissions");

const router = express.Router();

/**
 * POST /api/ai/agent
 * Endpoint principal pentru AI Agent
 */
router.post("/agent", verifyJWT, async (req: Request, res: Response) => {
  try {
    console.log("🔵 AI Agent request received");
    const authReq = req as any;
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

    // Gestionează cererea AI
    const response = await handleAIRequest(context, message, conversationHistory);
    console.log("✅ AI response generated");

    return res.json({
      response,
      tools: toolsByRole[context.role],
    });
  } catch (error: any) {
    console.error("❌ AI Agent error:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({ error: error.message || "Eroare la procesarea cererii AI." });
  }
});

module.exports = router;

