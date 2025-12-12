/**
 * Subscription Plan Validation Service
 * 
 * Validează limitele planurilor de abonament:
 * - Numărul maxim de angajați
 * - Limita de SMS pe lună
 */

const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

interface PlanLimits {
  maxEmployees: number | null;
  smsIncluded: number | null;
}

/**
 * Obține limitele planului pentru un business
 */
async function getBusinessPlanLimits(businessId: string): Promise<PlanLimits | null> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        currentPlan: {
          select: {
            maxEmployees: true,
            smsIncluded: true,
          },
        },
      },
    });

    if (!business || !business.currentPlan) {
      return null;
    }

    return {
      maxEmployees: business.currentPlan.maxEmployees,
      smsIncluded: business.currentPlan.smsIncluded,
    };
  } catch (error) {
    logger.error("Error getting business plan limits:", error);
    return null;
  }
}

/**
 * Verifică dacă business-ul poate adăuga mai mulți angajați
 * 
 * @param businessId - ID-ul business-ului
 * @returns { canAdd: boolean, currentCount: number, maxAllowed: number | null, error?: string }
 */
async function checkEmployeeLimit(businessId: string): Promise<{
  canAdd: boolean;
  currentCount: number;
  maxAllowed: number | null;
  error?: string;
}> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        currentPlan: {
          select: {
            name: true,
            maxEmployees: true,
          },
        },
        employees: {
          select: { id: true },
        },
      },
    });

    if (!business) {
      return {
        canAdd: false,
        currentCount: 0,
        maxAllowed: null,
        error: "Business-ul nu a fost găsit.",
      };
    }

    if (!business.currentPlan) {
      return {
        canAdd: false,
        currentCount: 0,
        maxAllowed: null,
        error: "Business-ul nu are un plan de abonament activ.",
      };
    }

    // Numără doar angajații (exclude owner)
    const currentEmployeeCount = business.employees.length;
    const maxEmployees = business.currentPlan.maxEmployees;

    // Dacă nu există limită (null), permite oricâți
    if (maxEmployees === null) {
      return {
        canAdd: true,
        currentCount: currentEmployeeCount,
        maxAllowed: null,
      };
    }

    if (currentEmployeeCount >= maxEmployees) {
      const planName = business.currentPlan.name;
      return {
        canAdd: false,
        currentCount: currentEmployeeCount,
        maxAllowed: maxEmployees,
        error: `Ai atins limita de ${maxEmployees} ${maxEmployees === 1 ? "utilizator" : "utilizatori"} pentru planul ${planName}.${planName === "VOOB PRO" ? " Upgrade la BUSINESS pentru până la 5 utilizatori." : " Contactează suportul pentru upgrade."}`,
      };
    }

    return {
      canAdd: true,
      currentCount: currentEmployeeCount,
      maxAllowed: maxEmployees,
    };
  } catch (error) {
    logger.error("Error checking employee limit:", error);
    return {
      canAdd: false,
      currentCount: 0,
      maxAllowed: null,
      error: "Eroare la verificarea limitei de angajați.",
    };
  }
}

/**
 * Obține numărul de SMS-uri trimise de un business în luna curentă
 */
async function getCurrentSmsUsage(
  businessId: string,
  month?: number,
  year?: number
): Promise<number> {
  try {
    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1; // JavaScript months are 0-indexed
    const targetYear = year ?? now.getFullYear();

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const count = await prisma.smsUsageLog.count({
      where: {
        businessId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    return count;
  } catch (error) {
    logger.error("Error getting current SMS usage:", error);
    return 0;
  }
}

/**
 * Verifică dacă business-ul poate trimite SMS
 * 
 * @param businessId - ID-ul business-ului
 * @returns { canSend: boolean, currentUsage: number, limit: number | null, error?: string }
 */
async function checkSmsLimit(businessId: string): Promise<{
  canSend: boolean;
  currentUsage: number;
  limit: number | null;
  error?: string;
}> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        currentPlan: {
          select: {
            name: true,
            smsIncluded: true,
          },
        },
      },
    });

    if (!business) {
      return {
        canSend: false,
        currentUsage: 0,
        limit: null,
        error: "Business-ul nu a fost găsit.",
      };
    }

    if (!business.currentPlan) {
      return {
        canSend: false,
        currentUsage: 0,
        limit: null,
        error: "Business-ul nu are un plan de abonament activ.",
      };
    }

    const smsLimit = business.currentPlan.smsIncluded;
    const currentUsage = await getCurrentSmsUsage(businessId);

    // Dacă nu există limită (null), permite oricâte
    if (smsLimit === null) {
      return {
        canSend: true,
        currentUsage,
        limit: null,
      };
    }

    if (currentUsage >= smsLimit) {
      const planName = business.currentPlan.name;
      return {
        canSend: false,
        currentUsage,
        limit: smsLimit,
        error: `Ai atins limita de ${smsLimit} SMS/lună pentru planul ${planName}.${planName === "VOOB PRO" ? " Upgrade la BUSINESS pentru 500 SMS/lună." : " Contactează suportul pentru upgrade."}`,
      };
    }

    return {
      canSend: true,
      currentUsage,
      limit: smsLimit,
    };
  } catch (error) {
    logger.error("Error checking SMS limit:", error);
    return {
      canSend: false,
      currentUsage: 0,
      limit: null,
      error: "Eroare la verificarea limitei de SMS.",
    };
  }
}

/**
 * Verifică dacă un business poate face upgrade/downgrade la un plan
 * 
 * @param businessId - ID-ul business-ului
 * @param newPlanId - ID-ul noului plan
 * @returns { canUpgrade: boolean, error?: string }
 */
async function canChangePlan(
  businessId: string,
  newPlanId: string
): Promise<{ canUpgrade: boolean; error?: string }> {
  try {
    const [business, newPlan] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        include: {
          employees: { select: { id: true } },
          currentPlan: { select: { name: true, maxEmployees: true } },
        },
      }),
      prisma.subscriptionPlan.findUnique({
        where: { id: newPlanId },
        select: { name: true, maxEmployees: true },
      }),
    ]);

    if (!business || !newPlan) {
      return {
        canUpgrade: false,
        error: "Business-ul sau planul nu a fost găsit.",
      };
    }

    const currentEmployeeCount = business.employees.length;
    const newMaxEmployees = newPlan.maxEmployees;

    // Dacă noul plan are limită și business-ul are mai mulți angajați
    if (newMaxEmployees !== null && currentEmployeeCount > newMaxEmployees) {
      return {
        canUpgrade: false,
        error: `Nu poți schimba la planul ${newPlan.name}. Ai ${currentEmployeeCount} ${currentEmployeeCount === 1 ? "angajat" : "angajați"}, iar ${newPlan.name} permite doar ${newMaxEmployees} ${newMaxEmployees === 1 ? "utilizator" : "utilizatori"}. Șterge angajații în exces sau alege alt plan.`,
      };
    }

    return { canUpgrade: true };
  } catch (error) {
    logger.error("Error checking plan change:", error);
    return {
      canUpgrade: false,
      error: "Eroare la verificarea schimbării planului.",
    };
  }
}

module.exports = {
  getBusinessPlanLimits,
  checkEmployeeLimit,
  getCurrentSmsUsage,
  checkSmsLimit,
  canChangePlan,
};

