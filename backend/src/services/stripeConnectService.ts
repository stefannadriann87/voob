/**
 * Stripe Connect Service
 * Gestionează crearea și verificarea conturilor Stripe Connect pentru business-uri
 */

const { getStripeClient } = require("./stripeService");
const prisma = require("../lib/prisma");

/**
 * Creează un Stripe Connect account pentru un business
 * @param businessId - ID-ul business-ului
 * @returns Stripe Connect account ID
 */
async function createConnectAccount(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      legalInfo: true,
      representative: true,
      bankAccount: true,
    },
  });

  if (!business) {
    throw new Error("Business-ul nu a fost găsit.");
  }

  if (!business.legalInfo || !business.representative) {
    throw new Error("Business-ul nu are datele legale complete.");
  }

  const stripe = getStripeClient();

  // Creează contul Stripe Connect
  const account = await stripe.accounts.create({
    type: "express", // Express account pentru onboarding rapid
    country: "RO",
    email: business.email || business.owner.email,
    business_type: business.legalInfo.businessType === "PFA" ? "individual" : "company",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: business.legalInfo.legalEntityName,
      url: business.legalInfo.websiteUrl || undefined,
      mcc: "7299", // General business services
    },
    company: business.legalInfo.businessType !== "PFA" ? {
      name: business.legalInfo.legalEntityName,
      tax_id: business.legalInfo.cui,
      address: {
        line1: `${business.legalInfo.registeredStreet} ${business.legalInfo.registeredNumber}`,
        city: business.legalInfo.registeredCity,
        postal_code: business.legalInfo.registeredPostalCode,
        country: "RO",
      },
    } : undefined,
    individual: business.legalInfo.businessType === "PFA" ? {
      first_name: business.representative.fullName.split(" ")[0] || business.representative.fullName,
      last_name: business.representative.fullName.split(" ").slice(1).join(" ") || "",
      email: business.representative.email,
      phone: business.representative.phone,
      dob: {
        day: business.representative.dateOfBirth.getDate(),
        month: business.representative.dateOfBirth.getMonth() + 1,
        year: business.representative.dateOfBirth.getFullYear(),
      },
      address: {
        line1: business.representative.residenceAddress,
        country: "RO",
      },
    } : undefined,
  });

  // Salvează account ID în BusinessKycStatus
  await prisma.businessKycStatus.upsert({
    where: { businessId },
    update: {
      stripeConnectAccountId: account.id,
      stripeVerificationStatus: account.charges_enabled ? "verified" : "pending",
      status: "IN_REVIEW",
    },
    create: {
      businessId,
      stripeConnectAccountId: account.id,
      stripeVerificationStatus: account.charges_enabled ? "verified" : "pending",
      status: "IN_REVIEW",
      submittedAt: new Date(),
    },
  });

  return account.id;
}

/**
 * Creează un link de onboarding pentru Stripe Connect
 * @param accountId - ID-ul contului Stripe Connect
 * @param returnUrl - URL-ul de return după onboarding
 * @returns Link de onboarding
 */
async function createOnboardingLink(
  accountId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripeClient();

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: returnUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return accountLink.url;
}

// Upload documente REMOVAT
// Stripe Connect va gestiona documentele direct prin onboarding link
// Business-ul va uploada documentele direct în Stripe, nu prin platforma noastră

/**
 * Obține statusul de verificare Stripe pentru un account
 * @param accountId - ID-ul contului Stripe Connect
 * @returns Status de verificare
 */
async function getVerificationStatus(accountId: string): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  verificationStatus: string;
}> {
  const stripe = getStripeClient();

  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled || false,
    payoutsEnabled: account.payouts_enabled || false,
    detailsSubmitted: account.details_submitted || false,
    verificationStatus: account.charges_enabled ? "verified" : "pending",
  };
}

// Funcție de mapare REMOVAT - nu mai avem nevoie

module.exports = {
  createConnectAccount,
  createOnboardingLink,
  getVerificationStatus,
};

