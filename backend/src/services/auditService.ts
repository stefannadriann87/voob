const prisma = require("../lib/prisma");

interface AuditLogPayload {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

async function logSystemAction({
  actorId,
  actorRole,
  action,
  entity,
  entityId,
  before,
  after,
}: AuditLogPayload): Promise<void> {
  try {
    await prisma.systemAuditLog.create({
      data: {
        actorId: actorId ?? null,
        actorRole: actorRole ?? null,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        before: before ?? undefined,
        after: after ?? undefined,
      },
    });
  } catch (error) {
    console.error("Failed to persist audit log:", error);
  }
}

module.exports = { logSystemAction };

