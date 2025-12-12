import express = require("express");
import bcrypt = require("bcryptjs");
import jwt = require("jsonwebtoken");
import nodemailer = require("nodemailer");
const { randomBytes } = require("node:crypto");
const prisma = require("../lib/prisma");
const { Role, BusinessType } = require("@prisma/client");
import type { Role as RoleType, BusinessType as BusinessTypeType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
const { generateBusinessQrDataUrl } = require("../lib/qr");
const { verifyCaptcha, isCaptchaScoreValid } = require("../services/captchaService");
const { createRefreshToken, revokeAllUserRefreshTokens } = require("../services/refreshTokenService");
const { loginSchema, forgotPasswordSchema, passwordSchema } = require("../validators/authSchemas");
const {
  getClientIp,
  checkSuspiciousPattern,
  recordRegistrationAttempt,
} = require("../services/rateLimitService");
const { rateLimitRegistration, rateLimitLogin } = require("../middleware/rateLimit");
const { JWT_COOKIE_NAME, extractToken } = require("../middleware/auth");

const router = express.Router();

const { validateEnv, getEnv, getEnvNumber, getEnvBool } = require("../lib/envValidator");
const { logger } = require("../lib/logger");

const JWT_SECRET = validateEnv("JWT_SECRET", { required: true, minLength: 32 });
const FRONTEND_URL = getEnv("FRONTEND_URL", "http://localhost:3000");
const RESET_TOKEN_EXPIRATION_MINUTES = getEnvNumber("RESET_TOKEN_EXP_MINUTES", 60);

// Cookie configuration pentru JWT
const isProduction = process.env.NODE_ENV === "production";
const JWT_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h în milisecunde

const getJwtCookieOptions = (): express.CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "strict" : "lax",
  path: "/",
  maxAge: JWT_COOKIE_MAX_AGE,
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `business-${Date.now()}`;

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true,
      });

const sendResetEmail = async (to: string, resetLink: string) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "no-reply@voob.io",
    to,
    subject: "Resetare parolă VOOB",
    text: `Salut!\n\nAi solicitat resetarea parolei contului tău VOOB. Accesează linkul de mai jos pentru a seta o parolă nouă:\n\n${resetLink}\n\nDacă nu ai făcut tu această solicitare, ignoră acest mesaj.`,
  };

  const info = await transporter.sendMail(mailOptions);
  if (!process.env.SMTP_HOST) {
    console.info("[Email Preview] Reset password link:", resetLink);
  } else {
    console.info("[Email dispatched]", info.messageId ?? "unknown-id");
  }
};

type TokenPayload = {
  userId: string;
  role: RoleType;
};


const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    (req as express.Request & { user?: TokenPayload }).user = payload;
    next();
  } catch (error) {
    logger.error("JWT verification failed in authenticate middleware", error);
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
};

router.post("/register", rateLimitRegistration, async (req, res) => {
  const {
    email,
    password,
    name,
    phone,
    role,
    businessName,
    businessType,
    captchaToken,
  }: {
    email?: string;
    password?: string;
    name?: string;
    phone?: string;
    role?: RoleType | string;
    businessName?: string;
    businessType?: BusinessTypeType | string;
    captchaToken?: string;
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, nume și parolă sunt obligatorii." });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  // Verifică CAPTCHA
  if (!captchaToken) {
    await recordRegistrationAttempt(email, ip, userAgent, false, "CAPTCHA token lipsă");
    return res.status(400).json({ error: "Verificare CAPTCHA necesară." });
  }

  const captchaResult = await verifyCaptcha(captchaToken, ip);
  if (!captchaResult.success || !isCaptchaScoreValid(captchaResult.score)) {
    await recordRegistrationAttempt(
      email,
      ip,
      userAgent,
      false,
      `CAPTCHA invalid (score: ${captchaResult.score})`,
      captchaResult.score
    );
    return res.status(400).json({
      error: "Verificare CAPTCHA eșuată. Te rugăm să reîmprospătezi pagina și să încerci din nou.",
    });
  }

  // Verifică pattern suspect (multiple conturi de la același IP)
  const suspicious = await checkSuspiciousPattern(ip);
  if (suspicious.suspicious) {
    await recordRegistrationAttempt(
      email,
      ip,
      userAgent,
      false,
      `Pattern suspect: ${suspicious.count} conturi în 24h`,
      captchaResult.score
    );
    return res.status(429).json({
      error: "Prea multe înregistrări de la această adresă IP. Te rugăm să aștepți.",
    });
  }

  let normalizedRole: RoleType;
  if (typeof role === "string") {
    normalizedRole = role.toUpperCase() as RoleType;
  } else if (role) {
    normalizedRole = role;
  } else {
    normalizedRole = Role.CLIENT;
  }
  if (!Object.values(Role).includes(normalizedRole)) {
    return res.status(400).json({ error: `Rolul trebuie să fie unul dintre: ${Object.values(Role).join(", ")}.` });
  }

  if (normalizedRole === Role.BUSINESS && !businessName?.trim()) {
    return res.status(400).json({ error: "Numele businessului este obligatoriu pentru conturile Business." });
  }

  let normalizedBusinessType: BusinessTypeType = BusinessType.GENERAL;
  if (businessType) {
    const candidate =
      typeof businessType === "string" ? businessType.toUpperCase() : (businessType as BusinessTypeType);
    if (Object.values(BusinessType).includes(candidate as BusinessTypeType)) {
      normalizedBusinessType = candidate as BusinessTypeType;
    } else {
      return res
        .status(400)
        .json({ error: `Tipul de business trebuie să fie unul dintre: ${Object.values(BusinessType).join(", ")}.` });
    }
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await recordRegistrationAttempt(
        email,
        ip,
        userAgent,
        false,
        "Email deja înregistrat",
        captchaResult.score
      );
      // Mesaj generic pentru a preveni email enumeration
      // Nu dezvăluim dacă email-ul există sau nu
      return res.status(400).json({ 
        error: "Nu s-a putut crea contul. Verifică datele introduse sau încearcă să te autentifici." 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone: phone?.trim() || null,
          role: normalizedRole,
          registrationIp: ip || null,
        } as any, // Type assertion pentru a evita eroarea TypeScript temporar
      });

      if (normalizedRole === Role.BUSINESS) {
        const business = await tx.business.create({
          data: {
            name: businessName!.trim(),
            email,
            domain: slugify(businessName!),
            ownerId: createdUser.id,
            businessType: normalizedBusinessType,
            employees: {
              connect: { id: createdUser.id },
            },
          },
        });

        await tx.user.update({
          where: { id: createdUser.id },
          data: {
            businessId: business.id,
          },
        });

        let businessWithQr = business;
        try {
          const { dataUrl } = await generateBusinessQrDataUrl(business.id);
          businessWithQr = await tx.business.update({
            where: { id: business.id },
            data: { qrCodeUrl: dataUrl },
          });
        } catch (qrError) {
          logger.error("QR code generation failed during registration", qrError);
        }

        return { user: createdUser, business: businessWithQr };
      }

      return { user: createdUser, business: null };
    });

    const { password: _password, ...userResponse } = result.user;

    // Salvează registration attempt (success)
    await recordRegistrationAttempt(email, ip, userAgent, true, undefined, captchaResult.score);

    return res.status(201).json({
      user: userResponse,
      business: result.business,
    });
  } catch (error) {
    logger.error("Registration failed", error);
    await recordRegistrationAttempt(
      email,
      ip,
      userAgent,
      false,
      `Eroare server: ${error instanceof Error ? error.message : "Unknown error"}`,
      captchaResult.score
    );
    return res.status(500).json({ error: "Eroare la crearea utilizatorului." });
  }
});

router.post("/login", rateLimitLogin, async (req, res) => {
  const { email, password, role, captchaToken }: { email?: string; password?: string; role?: RoleType | string; captchaToken?: string } = req.body;

  // Validate input with Zod schema
  try {
    loginSchema.parse({ email, password, role, captchaToken });
  } catch (error: any) {
    return res.status(400).json({ error: error.errors?.[0]?.message || "Date invalide." });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  // Verify CAPTCHA
  if (!captchaToken) {
    return res.status(400).json({ error: "Verificare CAPTCHA necesară." });
  }

  const captchaResult = await verifyCaptcha(captchaToken, ip);
  if (!captchaResult.success || !isCaptchaScoreValid(captchaResult.score)) {
    return res.status(400).json({
      error: "Verificare CAPTCHA eșuată. Te rugăm să reîmprospătezi pagina și să încerci din nou.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
        },
        ownedBusinesses: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
          take: 1, // Take first business (most users have only one)
        },
      },
    });
    if (!user) {
      return res.status(401).json({ error: "Date de autentificare invalide." });
    }

    const validPassword = await bcrypt.compare(password as string, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Date de autentificare invalide." });
    }

    // If role is provided, verify it matches the user's role (for backward compatibility)
    // Otherwise, use the role from the database automatically
    const expectedRole = typeof role === "string" ? (role.toUpperCase() as RoleType) : undefined;
    if (expectedRole && user.role !== expectedRole) {
      return res.status(401).json({ error: "Rolul selectat nu corespunde contului." });
    }

    // Access token: 24h (securitate mai bună)
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "24h",
    });

    // Refresh token: 30 zile (pentru re-autentificare automată)
    const refreshToken = await createRefreshToken(user.id);

    // For BUSINESS role, use ownedBusinesses[0] as business; for EMPLOYEE, use business relation
    const businessData = user.role === "BUSINESS" && user.ownedBusinesses?.[0] 
      ? user.ownedBusinesses[0] 
      : user.business;

    // Remove password and ownedBusinesses, but keep business field to override it
    const { password: _password, ownedBusinesses, business: _oldBusiness, ...userResponse } = user;
    // Create response object with explicit business field
    const userResponseWithBusiness = {
      ...userResponse,
      business: businessData, // Explicitly set business field
    };

    // Debug: Log business data pentru debugging (ALWAYS log, not just in development)
    if (process.env.NODE_ENV === "development") {
      logger.info("Login response user data", {
        userId: user.id,
        role: user.role,
        hasOwnedBusinesses: !!user.ownedBusinesses?.length,
        ownedBusinessesCount: user.ownedBusinesses?.length || 0,
        businessData: businessData ? {
          id: businessData.id,
          name: businessData.name,
          businessType: businessData.businessType,
        } : null,
      });
    }

    // Setează JWT în HttpOnly cookie (nu poate fi accesat din JavaScript)
    const cookieOptions = getJwtCookieOptions();
    res.cookie(JWT_COOKIE_NAME, token, cookieOptions);

    // Debug: Log cookie set pentru debugging
    if (process.env.NODE_ENV === "development") {
      logger.info("JWT cookie set", {
        cookieName: JWT_COOKIE_NAME,
        cookieOptions: {
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          sameSite: cookieOptions.sameSite,
          path: cookieOptions.path,
        },
        userId: user.id,
        role: user.role,
      });
    }

    // Returnează user fără token (token-ul este în cookie)
    // TEST: Return businessData separately to verify it's calculated correctly
    return res.json({
      user: userResponseWithBusiness,
      refreshToken,
    });
  } catch (error) {
    logger.error("Login failed", { error, email, stack: error instanceof Error ? error.stack : undefined });
    // Return more descriptive error messages
    if (error instanceof Error) {
      // Check for Prisma errors
      if (error.message.includes("prisma") || error.message.includes("database") || error.message.includes("connection")) {
        return res.status(500).json({ 
          error: "Eroare de conexiune la baza de date. Te rugăm să încerci din nou." 
        });
      }
      // Check for JWT errors
      if (error.message.includes("jwt") || error.message.includes("token")) {
        return res.status(500).json({ 
          error: "Eroare la generarea token-ului de autentificare." 
        });
      }
      // Return the actual error message in development, generic in production
      const isDevelopment = process.env.NODE_ENV !== "production";
      return res.status(500).json({ 
        error: isDevelopment 
          ? `Eroare la autentificare: ${error.message}` 
          : "Eroare la autentificare. Te rugăm să încerci din nou." 
      });
    }
    return res.status(500).json({ error: "Eroare la autentificare. Te rugăm să încerci din nou." });
  }
});

router.post("/forgot-password", rateLimitLogin, async (req, res) => {
  const { email, captchaToken }: { email?: string; captchaToken?: string } = req.body;

  // Validate input with Zod schema
  try {
    forgotPasswordSchema.parse({ email });
  } catch (error: any) {
    return res.status(400).json({ error: error.errors?.[0]?.message || "Email invalid." });
  }

  const ip = getClientIp(req);

  // Verify CAPTCHA
  if (!captchaToken) {
    return res.status(400).json({ error: "Verificare CAPTCHA necesară." });
  }

  const captchaResult = await verifyCaptcha(captchaToken, ip);
  if (!captchaResult.success || !isCaptchaScoreValid(captchaResult.score)) {
    return res.status(400).json({
      error: "Verificare CAPTCHA eșuată. Te rugăm să reîmprospătezi pagina și să încerci din nou.",
    });
  }

  // Validate input with Zod schema
  try {
    forgotPasswordSchema.parse({ email, captchaToken });
  } catch (error: any) {
    return res.status(400).json({ error: error.errors?.[0]?.message || "Date invalide." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ ok: true });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRATION_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    const resetLink = `${FRONTEND_URL}/auth/reset-password?token=${token}`;
    await sendResetEmail(email as string, resetLink);

    return res.json({ ok: true });
  } catch (error) {
    logger.error("Forgot password request failed", error);
    return res.status(500).json({ error: "Eroare la trimiterea emailului de resetare." });
  }
});

router.post("/reset-password", rateLimitLogin, async (req, res) => {
  const { token, password, captchaToken }: { token?: string; password?: string; captchaToken?: string } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token și parola sunt obligatorii." });
  }

  const ip = getClientIp(req);

  // Verify CAPTCHA
  if (!captchaToken) {
    return res.status(400).json({ error: "Verificare CAPTCHA necesară." });
  }

  const captchaResult = await verifyCaptcha(captchaToken, ip);
  if (!captchaResult.success || !isCaptchaScoreValid(captchaResult.score)) {
    return res.status(400).json({
      error: "Verificare CAPTCHA eșuată. Te rugăm să reîmprospătezi pagina și să încerci din nou.",
    });
  }

  // Validate password policy
  try {
    passwordSchema.parse(password);
  } catch (error: any) {
    return res.status(400).json({ error: error.errors?.[0]?.message || "Parola nu respectă politica de securitate." });
  }

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: "Token invalid sau expirat." });
    }

    const hashedPassword = await bcrypt.hash(password as string, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),

    ]);

    return res.json({ ok: true });
  } catch (error) {    logger.error("Password reset failed", error);
    return res.status(500).json({ error: "Eroare la resetarea parolei." });
  }
});

router.get("/me", authenticate, async (req, res) => {
  const authReq = req as express.Request & { user?: TokenPayload };
  try {
    const user = await prisma.user.findUnique({
      where: { id: authReq.user!.userId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
        },
        ownedBusinesses: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
          take: 1, // Take first business (most users have only one)
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Utilizatorul nu există." });
    }

    // For BUSINESS role, use ownedBusinesses[0] as business; for EMPLOYEE, use business relation
    const businessData = user.role === "BUSINESS" && user.ownedBusinesses?.[0] 
      ? user.ownedBusinesses[0] 
      : user.business;

    const { ownedBusinesses, ...userResponse } = user;
    const userResponseWithBusiness = {
      ...userResponse,
      business: businessData,
    };

    // Debug: Log business data pentru debugging (ALWAYS log, not just in development)
    if (process.env.NODE_ENV === "development") {
      logger.info("/auth/me response user data", {
        userId: user.id,
        role: user.role,
        hasOwnedBusinesses: !!user.ownedBusinesses?.length,
        ownedBusinessesCount: user.ownedBusinesses?.length || 0,
        businessData: businessData ? {
          id: businessData.id,
          name: businessData.name,
          businessType: businessData.businessType,
        } : null,
      });
    }

    return res.json({ user: userResponseWithBusiness });
  } catch (error) {
    logger.error("Get user info failed", error);
    return res.status(500).json({ error: "Eroare la obținerea datelor utilizatorului." });
  }
});

router.put("/me", authenticate, async (req, res) => {
  const authReq = req as express.Request & { user?: TokenPayload };
  const { phone, name, specialization, avatar }: { phone?: string; name?: string; specialization?: string; avatar?: string } = req.body;

  try {
    const updateData: { phone?: string | null; name?: string; specialization?: string | null; avatar?: string | null } = {};
    if (phone !== undefined) {
      updateData.phone = phone?.trim() || null;
    }
    if (name !== undefined && name.trim()) {
      updateData.name = name.trim();
    }
    if (specialization !== undefined) {
      updateData.specialization = specialization?.trim() || null;
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar?.trim() || null;
    }

    const user = await prisma.user.update({
      where: { id: authReq.user!.userId },
      data: updateData,
      include: {
        business: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
        },
        ownedBusinesses: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
          take: 1, // Take first business (most users have only one)
        },
      },
    });

    // For BUSINESS role, use ownedBusinesses[0] as business; for EMPLOYEE, use business relation
    const businessData = user.role === "BUSINESS" && user.ownedBusinesses?.[0] 
      ? user.ownedBusinesses[0] 
      : user.business;

    const { ownedBusinesses, ...userResponse } = user;
    const userResponseWithBusiness = {
      ...userResponse,
      business: businessData,
    };

    return res.json({ user: userResponseWithBusiness });
  } catch (error) {
    logger.error("Update user failed", error);
    return res.status(500).json({ error: "Eroare la actualizarea utilizatorului." });
  }
});

router.get("/clients", authenticate, async (req, res) => {
  const authReq = req as express.Request & { user?: TokenPayload };
  const { search } = req.query;

  try {
    // Only business users and employees can view clients
    const currentUser = await prisma.user.findUnique({
      where: { id: authReq.user!.userId },
      select: { role: true },
    });

    if (!currentUser || (currentUser.role !== "BUSINESS" && currentUser.role !== "EMPLOYEE")) {
      return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza clienții." });
    }

    const whereClause: {
      role: "CLIENT";
      OR?: Array<{ name?: { contains: string }; email?: { contains: string } }>;
    } = {
      role: "CLIENT",
    };

    if (search && typeof search === "string" && search.trim()) {
      const searchTerm = search.trim().toLowerCase();
      whereClause.OR = [
        { name: { contains: searchTerm } },
        { email: { contains: searchTerm } },
      ];
    }

    const clients = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
      take: 50, // Limit to 50 results
      orderBy: { name: "asc" },
    });

    return res.json(clients);
  } catch (error) {
    logger.error("Get clients list failed", error);
    return res.status(500).json({ error: "Eroare la obținerea listei de clienți." });
  }
});

router.post("/clients", authenticate, async (req, res) => {
  const authReq = req as express.Request & { user?: TokenPayload };
  const { name, email, phone }: { name?: string; email?: string; phone?: string } = req.body;

  try {
    // Only business users and employees can create clients
    const currentUser = await prisma.user.findUnique({
      where: { id: authReq.user!.userId },
      select: { role: true },
    });

    if (!currentUser || (currentUser.role !== "BUSINESS" && currentUser.role !== "EMPLOYEE")) {
      return res.status(403).json({ error: "Nu ai permisiunea de a crea clienți." });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Numele este obligatoriu." });
    }

    // Generate email if not provided
    const clientEmail = email?.trim() || `guest-${Date.now()}@voob.io`;
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email: clientEmail } });
    if (existingUser) {
      return res.status(409).json({ error: "Un client cu acest email există deja." });
    }

    // Generate a random password
    const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const client = await prisma.user.create({
      data: {
        email: clientEmail,
        password: hashedPassword,
        name: name.trim(),
        phone: phone?.trim() || null,
        role: Role.CLIENT,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    return res.status(201).json(client);
  } catch (error) {
    logger.error("Create client failed", error);
    return res.status(500).json({ error: "Eroare la crearea clientului." });
  }
});

router.post("/logout", (req, res) => {
  // Șterge cookie-ul JWT
  
  // Extract user from token and revoke all refresh tokens
  try {
    const token = extractToken(req);
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as any;
        if (payload?.userId) {
          await revokeAllUserRefreshTokens(payload.userId);
        }
      } catch (error) {
        // Token might be invalid/expired - ignore
      }
    }
  } catch (error) {
    // Ignore errors during token extraction
  }
res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
  });
  return res.json({ ok: true, message: "Deconectare reușită." });
});

// TEST ENDPOINT - Remove after debugging
router.get("/test-business", async (req, res) => {
  try {
    const email = "sport@voob.io";
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
        },
        ownedBusinesses: {
          select: {
            id: true,
            name: true,
            domain: true,
            email: true,
            businessType: true,
          },
          take: 1,
        },
      },
    });
    const businessData = user?.role === "BUSINESS" && user?.ownedBusinesses?.[0] 
      ? user.ownedBusinesses[0] 
      : user?.business;
    return res.json({
      user_role: user?.role,
      ownedBusinesses: user?.ownedBusinesses,
      ownedBusinesses_0: user?.ownedBusinesses?.[0],
      business_relation: user?.business,
      businessData_calculated: businessData,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});
/**
 * POST /auth/refresh
 * Refresh access token folosind refresh token
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token este obligatoriu." });
    }

    const { validateRefreshToken } = require("../services/refreshTokenService");
    const validation = await validateRefreshToken(refreshToken);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error || "Refresh token invalid sau expirat." });
    }

    // Obține user-ul pentru a genera noul access token
    const user = await prisma.user.findUnique({
      where: { id: validation.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Utilizator nu a fost găsit." });
    }

    // Generează nou access token (24h)
    const newAccessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set cookie
    res.cookie(JWT_COOKIE_NAME, newAccessToken, getJwtCookieOptions());

    return res.json({
      token: newAccessToken,
      user: {
        userId: user.id,
        role: user.role,
      },
    });
  } catch (error: any) {
    logger.error("Refresh token error:", error);
    return res.status(500).json({ error: "Eroare la refresh token." });
  }
});



export = router;

