/**
 * Trial Service
 * Gestionează logica de free trial pentru business-uri
 */

const prisma = require("../lib/prisma");

const TRIAL_DURATION_DAYS = 30;

/**
 * Pornește trial pentru un business
 * @param businessId - ID-ul business-ului
 * @returns Trial dates
 */
async function startTrial(businessId: string): Promise<{
  trialStartDate: Date;
  trialEndDate: Date;
}> {
  const now = new Date();
  const trialStartDate = now;
  const trialEndDate = new Date(now);
  trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DURATION_DAYS);

  await prisma.business.update({
    where: { id: businessId },
    data: {
      trialStartDate,
      trialEndDate,
    },
  });

  return { trialStartDate, trialEndDate };
}

/**
 * Verifică dacă trial-ul a expirat pentru un business
 * @param businessId - ID-ul business-ului
 * @returns true dacă trial-ul a expirat
 */
async function isTrialExpired(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      trialEndDate: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!business) {
    return true; // Dacă business-ul nu există, considerăm că e expirat
  }

  // Dacă are subscription activ, trial-ul nu mai contează
  if (business.subscriptions.length > 0) {
    return false;
  }

  // Dacă nu are trialEndDate, considerăm că nu are trial
  if (!business.trialEndDate) {
    return true;
  }

  const now = new Date();
  return now > business.trialEndDate;
}

/**
 * Verifică statusul trial-ului pentru un business
 * @param businessId - ID-ul business-ului
 * @returns Status trial
 */
async function checkTrialStatus(businessId: string): Promise<{
  isExpired: boolean;
  daysRemaining: number | null;
  trialStartDate: Date | null;
  trialEndDate: Date | null;
  hasActiveSubscription: boolean;
}> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      trialStartDate: true,
      trialEndDate: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!business) {
    return {
      isExpired: true,
      daysRemaining: null,
      trialStartDate: null,
      trialEndDate: null,
      hasActiveSubscription: false,
    };
  }

  const hasActiveSubscription = business.subscriptions.length > 0;

  // Dacă are subscription activ, trial-ul nu mai contează
  if (hasActiveSubscription) {
    return {
      isExpired: false,
      daysRemaining: null,
      trialStartDate: business.trialStartDate,
      trialEndDate: business.trialEndDate,
      hasActiveSubscription: true,
    };
  }

  // Dacă nu are trialEndDate, considerăm că nu are trial
  if (!business.trialEndDate) {
    return {
      isExpired: true,
      daysRemaining: null,
      trialStartDate: business.trialStartDate,
      trialEndDate: business.trialEndDate,
      hasActiveSubscription: false,
    };
  }

  const now = new Date();
  const isExpired = now > business.trialEndDate;

  let daysRemaining: number | null = null;
  if (!isExpired) {
    const diffTime = business.trialEndDate.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    isExpired,
    daysRemaining,
    trialStartDate: business.trialStartDate,
    trialEndDate: business.trialEndDate,
    hasActiveSubscription: false,
  };
}

module.exports = {
  startTrial,
  isTrialExpired,
  checkTrialStatus,
  TRIAL_DURATION_DAYS,
};

