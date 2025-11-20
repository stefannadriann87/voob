import express = require("express");
import bcrypt = require("bcryptjs");
import jwt = require("jsonwebtoken");
import nodemailer = require("nodemailer");
const { randomBytes } = require("node:crypto");
const prisma = require("../lib/prisma").default;
const { Role, BusinessType } = require("@prisma/client");
import type { Role as RoleType, BusinessType as BusinessTypeType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
const { generateBusinessQrDataUrl } = require("../lib/qr");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const RESET_TOKEN_EXPIRATION_MINUTES = Number(process.env.RESET_TOKEN_EXP_MINUTES || 60);

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
    from: process.env.EMAIL_FROM || "no-reply@larstef.app",
    to,
    subject: "Resetare parolă LARSTEF",
    text: `Salut!\n\nAi solicitat resetarea parolei contului tău LARSTEF. Accesează linkul de mai jos pentru a seta o parolă nouă:\n\n${resetLink}\n\nDacă nu ai făcut tu această solicitare, ignoră acest mesaj.`,
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
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Token lipsă." });
    }
    const payload = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    (req as express.Request & { user?: TokenPayload }).user = payload;
    next();
  } catch (error) {
    console.error("JWT verify error:", error);
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
};

router.post("/register", async (req, res) => {
  const {
    email,
    password,
    name,
    phone,
    role,
    businessName,
    businessType,
  }: {
    email?: string;
    password?: string;
    name?: string;
    phone?: string;
    role?: RoleType | string;
    businessName?: string;
    businessType?: BusinessTypeType | string;
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, nume și parolă sunt obligatorii." });
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
      return res.status(409).json({ error: "Email deja folosit." });
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
        },
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
          console.error("Register QR generation error:", qrError);
        }

        return { user: createdUser, business: businessWithQr };
      }

      return { user: createdUser, business: null };
    });

    const { password: _password, ...userResponse } = result.user;

    return res.status(201).json({
      user: userResponse,
      business: result.business,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Eroare la crearea utilizatorului." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password, role }: { email?: string; password?: string; role?: RoleType | string } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email și parolă sunt obligatorii." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        business: true,
      },
    });
    if (!user) {
      return res.status(401).json({ error: "Date de autentificare invalide." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Date de autentificare invalide." });
    }

    // If role is provided, verify it matches the user's role (for backward compatibility)
    // Otherwise, use the role from the database automatically
    const expectedRole = typeof role === "string" ? (role.toUpperCase() as RoleType) : undefined;
    if (expectedRole && user.role !== expectedRole) {
      return res.status(401).json({ error: "Rolul selectat nu corespunde contului." });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    const { password: _password, ...userResponse } = user;

    return res.json({
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Eroare la autentificare." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email }: { email?: string } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email obligatoriu." });
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
    await sendResetEmail(email, resetLink);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Eroare la trimiterea emailului de resetare." });
  }
});

router.post("/reset-password", async (req, res) => {
  const { token, password }: { token?: string; password?: string } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token și parolă sunt obligatorii." });
  }

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: "Token invalid sau expirat." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ]);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Eroare la resetarea parolei." });
  }
});

router.get("/me", authenticate, async (req, res) => {
  const authReq = req as express.Request & { user?: TokenPayload };
  try {
    const user = await prisma.user.findUnique({
      where: { id: authReq.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        specialization: true,
        avatar: true,
        role: true,
        business: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Utilizatorul nu există." });
    }

    return res.json({ user });
  } catch (error) {
    console.error("Me endpoint error:", error);
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
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        specialization: true,
        avatar: true,
        role: true,
        business: true,
        createdAt: true,
      },
    });

    return res.json({ user });
  } catch (error) {
    console.error("Update user error:", error);
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
    console.error("Get clients error:", error);
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
    const clientEmail = email?.trim() || `guest-${Date.now()}@larstef.app`;
    
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
    console.error("Create client error:", error);
    return res.status(500).json({ error: "Eroare la crearea clientului." });
  }
});

export = router;

