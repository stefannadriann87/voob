import crypto = require("crypto");
import { SmsUsageType, Role } from "@prisma/client";

const prisma = require("../lib/prisma").default;

interface SmsUsagePayload {
  businessId?: string | null;
  type?: SmsUsageType;
  messageId?: string | null;
  phone?: string | null;
  cost?: number | null;
  metadata?: Record<string, unknown> | null;
}

async function recordSmsUsage({
  businessId,
  type,
  messageId,
  phone,
  cost,
  metadata,
}: SmsUsagePayload): Promise<void> {
  try {
    const phoneHash = phone
      ? crypto.createHash("sha256").update(phone).digest("hex")
      : null;

    await prisma.smsUsageLog.create({
      data: {
        businessId: businessId ?? undefined,
        type: type ?? "NOTIFICATION",
        messageId: messageId ?? undefined,
        phoneHash: phoneHash ?? undefined,
        cost: cost ?? undefined,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("Failed to record SMS usage:", error);
  }
}

interface AiUsagePayload {
  businessId?: string | null;
  userId?: string | null;
  userRole?: Role | null;
  toolName?: string | null;
  tokensUsed?: number | null;
  costEstimate?: number | null;
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
}

async function recordAiUsage({
  businessId,
  userId,
  userRole,
  toolName,
  tokensUsed,
  costEstimate,
  statusCode,
  metadata,
}: AiUsagePayload): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        businessId: businessId ?? undefined,
        userId: userId ?? undefined,
        userRole: userRole ?? undefined,
        toolName: toolName ?? undefined,
        tokensUsed: tokensUsed ?? undefined,
        costEstimate: costEstimate ?? undefined,
        statusCode: statusCode ?? undefined,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("Failed to record AI usage:", error);
  }
}

module.exports = {
  recordSmsUsage,
  recordAiUsage,
};

