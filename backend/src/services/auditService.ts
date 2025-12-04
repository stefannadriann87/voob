const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

interface AuditLogPayload {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

// Acțiuni predefinite pentru audit
const AuditActions = {
  // Auth
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  LOGOUT_ALL_SESSIONS: "LOGOUT_ALL_SESSIONS",
  REGISTER: "REGISTER",
  PASSWORD_RESET_REQUEST: "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET_COMPLETE: "PASSWORD_RESET_COMPLETE",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  
  // Booking
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  BOOKING_UPDATED: "BOOKING_UPDATED",
  
  // Payment
  PAYMENT_INITIATED: "PAYMENT_INITIATED",
  PAYMENT_COMPLETED: "PAYMENT_COMPLETED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUND_COMPLETED: "REFUND_COMPLETED",
  
  // Business
  BUSINESS_CREATED: "BUSINESS_CREATED",
  BUSINESS_UPDATED: "BUSINESS_UPDATED",
  BUSINESS_DELETED: "BUSINESS_DELETED",
  
  // User
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  
  // Admin
  ADMIN_ACTION: "ADMIN_ACTION",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
  IP_BLOCKED: "IP_BLOCKED",
  IP_UNBLOCKED: "IP_UNBLOCKED",
};

async function logSystemAction({
  actorId,
  actorRole,
  action,
  entity,
  entityId,
  before,
  after,
  metadata,
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
    
    // Log și în logger pentru real-time monitoring
    logger.info(`Audit: ${action}`, {
      actorId,
      actorRole,
      entity,
      entityId,
      ...metadata,
    });
  } catch (error) {
    logger.error("Failed to persist audit log", error);
  }
}

// Helper functions pentru acțiuni comune
async function logLogin(userId: string, role: string, ip: string, success: boolean) {
  await logSystemAction({
    actorId: userId,
    actorRole: role,
    action: success ? AuditActions.LOGIN_SUCCESS : AuditActions.LOGIN_FAILED,
    entity: "User",
    entityId: userId,
    metadata: { ip },
  });
}

async function logLogout(userId: string, role: string, allSessions: boolean = false) {
  await logSystemAction({
    actorId: userId,
    actorRole: role,
    action: allSessions ? AuditActions.LOGOUT_ALL_SESSIONS : AuditActions.LOGOUT,
    entity: "User",
    entityId: userId,
  });
}

async function logPayment(
  actorId: string,
  actorRole: string,
  action: string,
  paymentId: string,
  amount: number,
  currency: string
) {
  await logSystemAction({
    actorId,
    actorRole,
    action,
    entity: "Payment",
    entityId: paymentId,
    after: { amount, currency },
  });
}

async function logBooking(
  actorId: string,
  actorRole: string,
  action: string,
  bookingId: string,
  details?: Record<string, unknown>
) {
  await logSystemAction({
    actorId,
    actorRole,
    action,
    entity: "Booking",
    entityId: bookingId,
    after: details ?? null,
  });
}

module.exports = { 
  logSystemAction, 
  AuditActions,
  logLogin,
  logLogout,
  logPayment,
  logBooking,
};

