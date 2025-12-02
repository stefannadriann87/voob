/**
 * Business Onboarding Routes
 * Gestionează procesul de onboarding pentru business-uri noi
 */

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const prisma = require("../lib/prisma");
const { validateIBAN, validateIBANOwnership } = require("../services/ibanValidator");
const { validateCUI } = require("../services/cuiValidator");
const { startTrial } = require("../services/trialService");
// documentStorage REMOVAT - nu mai avem nevoie de upload documente
const {
  createConnectAccount,
  createOnboardingLink,
  getVerificationStatus,
} = require("../services/stripeConnectService");

const router = express.Router();

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * POST /business-onboarding/register
 * Creează un business nou cu trial
 */
router.post("/register", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const {
    businessName,
    businessEmail,
    businessType,
  }: {
    businessName?: string;
    businessEmail?: string;
    businessType?: string;
  } = req.body;

  if (!businessName) {
    return res.status(400).json({ error: "Numele business-ului este obligatoriu." });
  }

  if (authReq.user?.role !== "BUSINESS") {
    return res.status(403).json({ error: "Doar utilizatorii cu rol BUSINESS pot crea business-uri." });
  }

  try {
    // Verifică dacă user-ul are deja un business
    const existingBusiness = await prisma.business.findFirst({
      where: { ownerId: authReq.user.userId },
    });

    if (existingBusiness) {
      return res.status(409).json({ error: "Ai deja un business creat." });
    }

    // Creează business-ul cu trial
    const business = await prisma.business.create({
      data: {
        name: businessName.trim(),
        email: businessEmail?.trim() || null,
        domain: businessName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || `business-${Date.now()}`,
        ownerId: authReq.user.userId,
        businessType: businessType || "GENERAL",
      },
    });

    // Pornește trial
    const { trialStartDate, trialEndDate } = await startTrial(business.id);

    // Creează subscription cu status TRIAL
    const proPlan = await prisma.subscriptionPlan.findUnique({
      where: { name: "LARSTEF PRO" },
    });

    if (proPlan) {
      await prisma.subscription.create({
        data: {
          businessId: business.id,
          planId: proPlan.id,
          status: "TRIAL",
          currentPeriodStart: trialStartDate,
          currentPeriodEnd: trialEndDate,
          billingMethod: "OFFLINE",
          amount: 0, // Trial este gratuit
          currency: "RON",
        },
      });
    }

    return res.status(201).json({
      business: {
        id: business.id,
        name: business.name,
        email: business.email,
        domain: business.domain,
        trialStartDate,
        trialEndDate,
      },
    });
  } catch (error) {
    console.error("Business onboarding register error:", error);
    return res.status(500).json({ error: "Eroare la crearea business-ului." });
  }
});

/**
 * POST /business-onboarding/legal-info
 * Salvează datele legale ale business-ului
 */
router.post("/legal-info", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const {
    businessId,
    legalEntityName,
    cui,
    tradeRegisterNumber,
    vatStatus,
    vatCode,
    registeredStreet,
    registeredNumber,
    registeredCity,
    registeredCounty,
    registeredPostalCode,
    businessType,
    websiteUrl,
    businessDescription,
  } = req.body;

  if (!businessId || !legalEntityName || !cui) {
    return res.status(400).json({ error: "businessId, legalEntityName și CUI sunt obligatorii." });
  }

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
  }

  // Validează CUI
  const cuiValidation = validateCUI(cui);
  if (!cuiValidation.valid) {
    return res.status(400).json({ error: cuiValidation.error });
  }

  try {
    const legalInfo = await prisma.businessLegalInfo.upsert({
      where: { businessId },
      update: {
        legalEntityName,
        cui,
        tradeRegisterNumber: tradeRegisterNumber || null,
        vatStatus: vatStatus || null,
        vatCode: vatCode || null,
        registeredStreet,
        registeredNumber,
        registeredCity,
        registeredCounty,
        registeredPostalCode,
        businessType,
        websiteUrl: websiteUrl || null,
        businessDescription: businessDescription || null,
      },
      create: {
        businessId,
        legalEntityName,
        cui,
        tradeRegisterNumber: tradeRegisterNumber || null,
        vatStatus: vatStatus || null,
        vatCode: vatCode || null,
        registeredStreet,
        registeredNumber,
        registeredCity,
        registeredCounty,
        registeredPostalCode,
        businessType,
        websiteUrl: websiteUrl || null,
        businessDescription: businessDescription || null,
      },
    });

    return res.json(legalInfo);
  } catch (error) {
    console.error("Legal info save error:", error);
    return res.status(500).json({ error: "Eroare la salvarea datelor legale." });
  }
});

/**
 * POST /business-onboarding/representative
 * Salvează datele reprezentantului legal
 */
router.post("/representative", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const {
    businessId,
    fullName,
    cnp,
    nationalIdType,
    nationalIdSeries,
    nationalIdNumber,
    dateOfBirth,
    residenceAddress,
    email,
    phone,
    roleInCompany,
    beneficialOwner,
  } = req.body;

  if (!businessId || !fullName || !dateOfBirth || !email || !phone) {
    return res.status(400).json({ error: "businessId, fullName, dateOfBirth, email și phone sunt obligatorii." });
  }

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
  }

  try {
    const representative = await prisma.businessRepresentative.upsert({
      where: { businessId },
      update: {
        fullName,
        cnp: cnp || null,
        nationalIdType: nationalIdType || null,
        nationalIdSeries: nationalIdSeries || null,
        nationalIdNumber: nationalIdNumber || null,
        dateOfBirth: new Date(dateOfBirth),
        residenceAddress,
        email,
        phone,
        roleInCompany: roleInCompany || "REPRESENTATIVE",
        beneficialOwner: beneficialOwner !== undefined ? beneficialOwner : true,
      },
      create: {
        businessId,
        fullName,
        cnp: cnp || null,
        nationalIdType: nationalIdType || null,
        nationalIdSeries: nationalIdSeries || null,
        nationalIdNumber: nationalIdNumber || null,
        dateOfBirth: new Date(dateOfBirth),
        residenceAddress,
        email,
        phone,
        roleInCompany: roleInCompany || "REPRESENTATIVE",
        beneficialOwner: beneficialOwner !== undefined ? beneficialOwner : true,
      },
    });

    return res.json(representative);
  } catch (error) {
    console.error("Representative save error:", error);
    return res.status(500).json({ error: "Eroare la salvarea datelor reprezentantului." });
  }
});

/**
 * POST /business-onboarding/bank-account
 * Salvează și validează contul bancar
 */
router.post("/bank-account", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId, iban, bankName, accountHolder } = req.body;

  if (!businessId || !iban || !bankName || !accountHolder) {
    return res.status(400).json({ error: "businessId, IBAN, bankName și accountHolder sunt obligatorii." });
  }

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { legalInfo: true },
    select: { ownerId: true, legalInfo: { select: { legalEntityName: true } } },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
  }

  // Validează IBAN
  const ibanValidation = validateIBAN(iban);
  if (!ibanValidation.valid) {
    return res.status(400).json({ error: ibanValidation.error });
  }

  // Validează ownership dacă există legalInfo
  if (business.legalInfo) {
    const ownershipValidation = validateIBANOwnership(iban, business.legalInfo.legalEntityName);
    if (!ownershipValidation.valid) {
      return res.status(400).json({ error: ownershipValidation.error });
    }
  }

  try {
    const bankAccount = await prisma.businessBankAccount.upsert({
      where: { businessId },
      update: {
        iban,
        bankName,
        accountHolder,
        validated: false, // Va fi validat manual sau prin Stripe
      },
      create: {
        businessId,
        iban,
        bankName,
        accountHolder,
        validated: false,
      },
    });

    return res.json(bankAccount);
  } catch (error) {
    console.error("Bank account save error:", error);
    return res.status(500).json({ error: "Eroare la salvarea contului bancar." });
  }
});

// Upload documente REMOVAT - Stripe Connect va gestiona documentele pentru verificare KYC
// Aceasta evită probleme GDPR și responsabilități legale legate de stocarea documentelor

/**
 * POST /business-onboarding/submit-kyc
 * Trimite datele pentru verificare KYC prin Stripe Connect
 */
router.post("/submit-kyc", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;
  const { businessId } = req.body;

  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      legalInfo: true,
      representative: true,
      bankAccount: true,
    },
    select: { ownerId: true },
  });

  if (!business || business.ownerId !== authReq.user?.userId) {
    return res.status(403).json({ error: "Nu ai permisiunea de a modifica acest business." });
  }

  if (!business.legalInfo || !business.representative || !business.bankAccount) {
    return res.status(400).json({ error: "Datele legale, reprezentantul și contul bancar trebuie să fie completate." });
  }

  try {
    // Creează Stripe Connect account
    const accountId = await createConnectAccount(businessId);

    // Creează link de onboarding
    const returnUrl = `${process.env.FRONTEND_URL || "http://localhost:3001"}/business/onboarding/kyc-return`;
    const onboardingUrl = await createOnboardingLink(accountId, returnUrl);

    return res.json({
      accountId,
      onboardingUrl,
      message: "Cont Stripe Connect creat. Completează onboarding-ul pentru verificare.",
    });
  } catch (error) {
    console.error("KYC submit error:", error);
    return res.status(500).json({ error: "Eroare la crearea contului Stripe Connect." });
  }
});

/**
 * GET /business-onboarding/status/:businessId
 * Returnează statusul onboarding-ului
 */
router.get("/status/:businessId", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { businessId } = req.params;
  const authReq = req as AuthenticatedRequest;

  // Verifică autorizarea
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { ownerId: true },
  });

  if (!business || (business.ownerId !== authReq.user?.userId && authReq.user?.role !== "SUPERADMIN")) {
    return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest business." });
  }

  try {
    const [legalInfo, representative, bankAccount, kycStatus] = await Promise.all([
      prisma.businessLegalInfo.findUnique({ where: { businessId } }).catch((err: any) => {
        console.error("Error fetching legalInfo:", err);
        return null;
      }),
      prisma.businessRepresentative.findUnique({ where: { businessId } }).catch((err: any) => {
        console.error("Error fetching representative:", err);
        return null;
      }),
      prisma.businessBankAccount.findUnique({ where: { businessId } }).catch((err: any) => {
        console.error("Error fetching bankAccount:", err);
        return null;
      }),
      prisma.businessKycStatus.findUnique({ where: { businessId } }).catch((err: any) => {
        console.error("Error fetching kycStatus:", err);
        return null;
      }),
    ]);

    let verificationStatus = null;
    if (kycStatus?.stripeConnectAccountId) {
      try {
        verificationStatus = await getVerificationStatus(kycStatus.stripeConnectAccountId);
      } catch (error) {
        console.error("Error getting verification status:", error);
        // Don't fail the whole request if verification status fails
      }
    }

    return res.json({
      legalInfo: !!legalInfo,
      representative: !!representative,
      bankAccount: !!bankAccount,
      kycStatus: kycStatus?.status || "PENDING",
      verificationStatus,
      isComplete: !!(legalInfo && representative && bankAccount),
    });
  } catch (error: any) {
    console.error("Onboarding status error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isDevelopment = process.env.NODE_ENV !== "production";
    return res.status(500).json({ 
      error: "Eroare la obținerea statusului onboarding.",
      details: isDevelopment ? errorMessage : undefined
    });
  }
});

export = router;

