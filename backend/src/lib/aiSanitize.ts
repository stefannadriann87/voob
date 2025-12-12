/**
 * AI Input Sanitization
 * Previne prompt injection attacks prin sanitizare și limitare input
 */

const { logger } = require("./logger");

const MAX_MESSAGE_LENGTH = Number(process.env.AI_MAX_MESSAGE_LENGTH || 2000); // Max 2000 caractere
const MAX_CONVERSATION_HISTORY = Number(process.env.AI_MAX_CONVERSATION_HISTORY || 20); // Max 20 mesaje în istoric

/**
 * Sanitizează un mesaj AI eliminând caractere periculoase și prompt injection attempts
 */
function sanitizeAiMessage(message: string): string {
  if (!message || typeof message !== "string") {
    return "";
  }

  // Elimină tag-uri HTML
  let sanitized = message.replace(/<[^>]*>/g, "");

  // Escape caractere speciale care pot fi folosite pentru prompt injection
  sanitized = sanitized
    .replace(/```/g, "") // Elimină code blocks
    .replace(/---/g, "") // Elimină separatori markdown
    .replace(/\[SYSTEM\]/gi, "") // Elimină tag-uri de sistem
    .replace(/\[USER\]/gi, "")
    .replace(/\[ASSISTANT\]/gi, "")
    .replace(/ignore previous instructions/gi, "") // Elimină prompt injection attempts
    .replace(/forget everything/gi, "")
    .replace(/new instructions/gi, "")
    .replace(/system prompt/gi, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limitează lungimea
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH);
    logger.warn(`AI message truncated to ${MAX_MESSAGE_LENGTH} characters`);
  }

  return sanitized;
}

/**
 * Sanitizează istoricul conversației
 */
function sanitizeConversationHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(history)) {
    return [];
  }

  // Limitează numărul de mesaje
  const limited = history.slice(-MAX_CONVERSATION_HISTORY);

  // Sanitizează fiecare mesaj
  return limited.map((msg) => ({
    role: msg.role,
    content: sanitizeAiMessage(msg.content || ""),
  }));
}

/**
 * Validează un mesaj AI
 */
function validateAiMessage(message: string): { valid: boolean; error?: string } {
  if (!message || typeof message !== "string") {
    return { valid: false, error: "Mesajul este obligatoriu" };
  }

  if (message.trim().length === 0) {
    return { valid: false, error: "Mesajul nu poate fi gol" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Mesajul nu poate depăși ${MAX_MESSAGE_LENGTH} caractere`,
    };
  }

  return { valid: true };
}

module.exports = {
  sanitizeAiMessage,
  sanitizeConversationHistory,
  validateAiMessage,
  MAX_MESSAGE_LENGTH,
  MAX_CONVERSATION_HISTORY,
};
