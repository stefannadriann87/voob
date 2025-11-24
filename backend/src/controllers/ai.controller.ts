/**
 * AI Controller
 */

import express = require("express");
const { runAIAgent } = require("../ai/agent");

interface AuthenticatedRequest extends express.Request {
  aiContext?: any;
}

const aiChatHandler = async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const { message }: { message?: string } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Mesajul este obligatoriu." });
  }

  if (!authReq.aiContext) {
    return res.status(401).json({ error: "Utilizator neautentificat." });
  }

  try {
    const result = await runAIAgent({
      message,
      context: authReq.aiContext,
    });

    return res.json(result);
  } catch (error: any) {
    console.error("AI Controller error:", error);
    return res.status(500).json({
      error: error.message || "Eroare la procesarea cererii AI.",
    });
  }
};

module.exports = { aiChatHandler };

