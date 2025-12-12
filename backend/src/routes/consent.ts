import express = require("express");
import type { Prisma, BusinessType } from "@prisma/client";
const pdfLib = require("pdf-lib") as typeof import("pdf-lib");
const { PDFDocument, StandardFonts } = pdfLib;
const prisma = require("../lib/prisma");
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { signConsentSchema, uploadConsentSchema, bookingIdParamSchema, clientIdParamSchema, documentIdParamSchema, consentListQuerySchema, consentClientQuerySchema } = require("../validators/consentSchemas");
const { logger } = require("../lib/logger");

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

type ConsentDocumentWithBooking = Awaited<
  ReturnType<typeof prisma.consentDocument.findMany>
>[number];

type BookingWithConsentForm = Awaited<
  ReturnType<typeof prisma.booking.findMany>
>[number];

const router = express.Router();

const CONSENT_REQUIRED_TYPES: BusinessType[] = ["MEDICAL_DENTAL", "THERAPY_COACHING"];

const consentTemplate = {
  title: "Formular de informare și consimțământ stomatologic",
  description:
    "Prin completarea și semnarea acestui formular, confirmi că ai înțeles natura procedurii, riscurile și alternativele propuse.",
  fields: [
    { id: "patientName", label: "Numele complet al pacientului", type: "text", required: true },
    { id: "birthDate", label: "Data nașterii", type: "date", required: true },
    { id: "procedure", label: "Procedura recomandată", type: "text", required: true },
    {
      id: "treatmentDetails",
      label: "Descriere tratament și alternative",
      type: "textarea",
      required: true,
      placeholder:
        "Include detalii despre tratamentul recomandat și alte opțiuni discutate (ex: obturație, extracție, implant).",
    },
    {
      id: "risks",
      label: "Riscuri discutate (sângerare, sensibilitate, infecții etc.)",
      type: "textarea",
      required: true,
    },
    {
      id: "medicalNotes",
      label: "Afecțiuni medicale / medicamente curente",
      type: "textarea",
      required: false,
    },
    {
      id: "patientAgreement",
      label: "Declar că am înțeles procedura și îmi dau acordul pentru efectuarea tratamentului.",
      type: "checkbox",
      required: true,
    },
  ],
};

const normalizeSignature = (signature: string) => {
  if (!signature.startsWith("data:image")) {
    throw new Error("Semnătura trebuie să fie în format base64 image data URL.");
  }
  const [, base64] = signature.split(",");
  if (!base64) {
    throw new Error("Semnătura nu conține date base64.");
  }
  return Buffer.from(base64, "base64");
};

const convertImageDataUrlToPdf = async (dataUrl: string) => {
  const [meta, base64] = dataUrl.split(",");
  if (!meta || !base64) {
    throw new Error("Fișierul încărcat nu conține date valide.");
  }
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1];
  if (!mimeType || !mimeType.startsWith("image/")) {
    throw new Error("Format imagine invalid.");
  }
  const imageBytes = Buffer.from(base64, "base64");
  const pdfDoc = await PDFDocument.create();
  let embeddedImage;
  if (mimeType === "image/png") {
    embeddedImage = await pdfDoc.embedPng(imageBytes);
  } else {
    embeddedImage = await pdfDoc.embedJpg(imageBytes);
  }
  const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: embeddedImage.width,
    height: embeddedImage.height,
  });
  const pdfBytes = await pdfDoc.save();
  return `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`;
};

const sanitizeForPdf = (value: unknown) => {
  if (value === undefined || value === null) {
    return "-";
  }
  try {
    const normalized = String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return normalized.replace(/[^\x20-\x7E\n]/g, "?");
  } catch {
    return String(value);
  }
};

const businessNeedsConsent = (type?: BusinessType | null) =>
  !!type && CONSENT_REQUIRED_TYPES.includes(type);

router.get("/template", (_req, res) => {
  return res.json({ template: consentTemplate });
});

router.post("/sign", verifyJWT, validate(signConsentSchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { bookingId, clientId, signature, formData } = signConsentSchema.parse(req.body);

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  // Verify role is CLIENT
  if (authReq.user.role !== "CLIENT") {
    return res.status(403).json({ error: "Doar clienții pot semna consimțământul." });
  }

  // Verify clientId matches authenticated user
  if (authReq.user.userId !== clientId) {
    return res.status(403).json({ error: "Nu poți semna pentru o programare care nu îți aparține." });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true, businessType: true } },
        service: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking-ul nu există." });
    }

    if (!booking.business) {
      return res.status(404).json({ error: "Business-ul asociat nu mai există." });
    }

    if (!booking.service) {
      return res.status(422).json({
        error: "Serviciul asociat programării nu mai există. Reîncearcă selecția serviciului.",
      });
    }

    if (!booking.client) {
      return res.status(403).json({ error: "Nu am putut identifica clientul programării." });
    }

    if (booking.clientId !== clientId) {
      return res.status(403).json({ error: "Nu poți semna pentru o programare care nu îți aparține." });
    }

    if (businessNeedsConsent(booking.business.businessType) === false) {
      return res.status(400).json({ error: "Acest business nu necesită consimțământ digital." });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;

    const drawText = (text: string, x: number, y: number, options: { size?: number } = {}) => {
      page.drawText(text, { x, y, size: options.size ?? fontSize, font });
    };
    const drawSafeText = (value: unknown, x: number, y: number, options: { size?: number } = {}) => {
      drawText(sanitizeForPdf(value), x, y, options);
    };

    let cursorY = 800;
    drawSafeText("Formular informare și consimțământ stomatologic", 40, cursorY, { size: 14 });
    cursorY -= 30;
    drawSafeText(`Pacient: ${formData["patientName"] ?? booking.client.name ?? "-"}`, 40, cursorY);
    cursorY -= 20;
    drawSafeText(`Data nașterii: ${formData["birthDate"] ?? "-"}`, 40, cursorY);
    cursorY -= 20;
    drawSafeText(`Procedură: ${formData["procedure"] ?? booking.service.name ?? "-"}`, 40, cursorY);
    cursorY -= 20;
    drawSafeText(`Business: ${booking.business.name ?? "-"}`, 40, cursorY);
    cursorY -= 20;
    const bookingDateLabel =
      booking.date instanceof Date ? booking.date.toLocaleString("ro-RO") : new Date(booking.date).toLocaleString("ro-RO");
    drawSafeText(`Dată programare: ${bookingDateLabel}`, 40, cursorY);
    cursorY -= 30;
    drawSafeText("Descriere tratament și alternative:", 40, cursorY);
    cursorY -= 18;
    const wrapText = (value: unknown) => {
      const sanitized = sanitizeForPdf(value ?? "-");
      return sanitized.match(/.{1,90}/g) ?? [sanitized];
    };
    wrapText(formData["treatmentDetails"]).forEach((line) => {
      drawSafeText(line, 40, cursorY);
      cursorY -= 16;
    });
    cursorY -= 10;
    drawSafeText("Riscuri discutate:", 40, cursorY);
    cursorY -= 18;
    wrapText(formData["risks"]).forEach((line) => {
      drawSafeText(line, 40, cursorY);
      cursorY -= 16;
    });
    cursorY -= 10;
    drawSafeText("Mențiuni medicale:", 40, cursorY);
    cursorY -= 18;
    wrapText(formData["medicalNotes"]).forEach((line) => {
      drawSafeText(line, 40, cursorY);
      cursorY -= 16;
    });
    cursorY -= 40;
    
    // Only add signature if provided
    if (signature) {
      try {
        const signatureBytes = normalizeSignature(signature);
        drawSafeText("Semnătură pacient:", 40, cursorY + 60);
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        page.drawImage(signatureImage, {
          x: 40,
          y: cursorY,
          width: 200,
          height: 60,
        });
        cursorY -= 80;
      } catch (error) {
        logger.warn("Nu am putut insera semnătura în PDF", error);
        cursorY -= 40;
      }
    } else {
      drawSafeText("Consimțământ confirmat electronic (fără semnătură digitală)", 40, cursorY);
      cursorY -= 40;
    }
    drawSafeText(`Data semnării: ${new Date().toLocaleDateString("ro-RO")}`, 40, cursorY);

    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const pdfUrl = `data:application/pdf;base64,${pdfBase64}`;

    // Prepare data object
    // Use a default value for signature if not provided (to avoid null constraint violations)
    const consentFormData: any = {
      pdfUrl,
      signature: signature || "ELECTRONIC_CONSENT", // Default value when no signature is provided
      templateType: booking.business.businessType,
      formData,
    };

    const consentForm = await prisma.consentForm.upsert({
      where: { bookingId },
      update: consentFormData,
      create: {
        booking: { connect: { id: bookingId } },
        client: { connect: { id: booking.clientId } },
        business: { connect: { id: booking.businessId } },
        ...consentFormData,
      },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            status: true,
            service: { select: { id: true, name: true } },
            business: { select: { id: true, name: true, businessType: true } },
            client: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    await prisma.consentDocument.create({
      data: {
        bookingId,
        clientId: booking.clientId,
        businessId: booking.businessId,
        pdfUrl,
        fileName: null,
        source: "DIGITAL_SIGNATURE",
      },
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
    });

    return res.status(201).json({ consentForm });
  } catch (error) {
    logger.error("Consent sign error", error);
    const response: { error: string; details?: string } = {
      error: "Nu am putut genera consimțământul.",
    };
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      response.details = error.message;
    }
    return res.status(500).json(response);
  }
});

router.post("/upload", verifyJWT, validate(uploadConsentSchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { bookingId, pdfDataUrl, fileName } = uploadConsentSchema.parse(req.body);

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    let storedPdfUrl = pdfDataUrl;
    if (pdfDataUrl.startsWith("data:image/")) {
      storedPdfUrl = await convertImageDataUrlToPdf(pdfDataUrl);
    } else if (!pdfDataUrl.startsWith("data:application/pdf")) {
      return res
        .status(400)
        .json({ error: "Formatul fișierului trebuie să fie PDF sau imagine (PNG/JPG) în format base64." });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        business: { select: { id: true, ownerId: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking-ul nu există." });
    }

    const employees = await prisma.user.findMany({
      where: { businessId: booking.businessId, role: "EMPLOYEE" },
      select: { id: true },
    });

    const isOwner = booking.business.ownerId === authReq.user.userId;
    const isEmployee = employees.some((employee: { id: string }) => employee.id === authReq.user?.userId);
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a încărca documente pentru această rezervare." });
    }

    const consentForm = await prisma.consentForm.upsert({
      where: { bookingId },
      update: {
        pdfUrl: storedPdfUrl,
        signature: "BUSINESS_UPLOAD",
        templateType: booking.business.businessType,
        formData: {
          uploadFileName: fileName ?? null,
        },
      },
      create: {
        booking: { connect: { id: bookingId } },
        client: { connect: { id: booking.clientId } },
        business: { connect: { id: booking.businessId } },
        pdfUrl: storedPdfUrl,
        signature: "BUSINESS_UPLOAD",
        templateType: booking.business.businessType,
        formData: {
          uploadFileName: fileName ?? null,
        },
      },
    });

    await prisma.consentDocument.create({
      data: {
        bookingId,
        clientId: booking.clientId,
        businessId: booking.businessId,
        pdfUrl: storedPdfUrl,
        fileName: fileName ?? null,
        source: "BUSINESS_UPLOAD",
      },
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
    });

    return res.status(201).json({ consentForm });
  } catch (error) {
    logger.error("Consent upload error", error);
    return res.status(500).json({ error: "Nu am putut încărca documentul." });
  }
});

router.get("/client/:clientId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { clientId } = clientIdParamSchema.parse({ clientId: req.params.clientId });
  const queryParams = consentClientQuerySchema.parse({
    businessId: req.query.businessId,
    employeeId: req.query.employeeId,
  });
  const { businessId, employeeId } = queryParams;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true, employees: { select: { id: true } } },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const isOwner = business.ownerId === authReq.user.userId;
    const isEmployee = business.employees.some((employee: { id: string }) => employee.id === authReq.user!.userId);
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza documentele acestui client." });
    }

    // Dacă e employee și cere filtrare pe employeeId, verifică că e propriul ID
    if (employeeId && isEmployee && !isOwner && !isSuperAdmin) {
      if (employeeId !== authReq.user.userId) {
        return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza documentele altui angajat." });
      }
    }

    // Construiește where clause pentru documents
    const documentWhereClause: any = { businessId, clientId };
    if (employeeId) {
      documentWhereClause.booking = { employeeId };
    }

    const documents = await prisma.consentDocument.findMany({
      where: documentWhereClause,
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            employeeId: true,
            service: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const bookingIdsWithDocuments = new Set(
      documents.map((doc: ConsentDocumentWithBooking) => doc.bookingId)
    );

    // Construiește where clause pentru legacy bookings
    const legacyWhereClause: any = {
      businessId,
      clientId,
      consentForm: {
        isNot: null,
      },
    };
    if (employeeId) {
      legacyWhereClause.employeeId = employeeId;
    }

    const legacyBookings = await prisma.booking.findMany({
      where: legacyWhereClause,
      include: {
        consentForm: {
          select: { id: true, pdfUrl: true, createdAt: true },
        },
        service: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true, email: true } },
      },
    });

    const legacyDocuments = legacyBookings
      .filter(
        (booking: BookingWithConsentForm) =>
          booking.consentForm?.pdfUrl && !bookingIdsWithDocuments.has(booking.id)
      )
      .map((booking: BookingWithConsentForm) => ({
        id: `legacy-${booking.id}`,
        bookingId: booking.id,
        clientId: booking.clientId,
        businessId: booking.businessId,
        pdfUrl: booking.consentForm?.pdfUrl ?? "",
        fileName: `consent-${booking.service?.name ?? "document"}.pdf`,
        source: "DIGITAL_SIGNATURE" as const,
        createdAt: booking.consentForm?.createdAt ?? booking.createdAt,
        booking: {
          id: booking.id,
          date: booking.date,
          service: booking.service ? { id: booking.service.id, name: booking.service.name } : null,
          employee: booking.employee ? { id: booking.employee.id, name: booking.employee.name, email: booking.employee.email } : null,
        },
      }));

    const mergedDocuments = [...documents, ...legacyDocuments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json({ documents: mergedDocuments });
  } catch (error) {
    logger.error("Consent client documents error", error);
    const response: { error: string; details?: string } = {
      error: "Nu am putut prelua documentele clientului.",
    };
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      response.details = error.message;
    }
    return res.status(500).json(response);
  }
});

router.get("/:bookingId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { bookingId } = bookingIdParamSchema.parse({ bookingId: req.params.bookingId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    const consent = await prisma.consentForm.findUnique({
      where: { bookingId },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            status: true,
            service: { select: { id: true, name: true } },
            business: { 
              select: { 
                id: true, 
                name: true, 
                businessType: true, 
                ownerId: true,
                employees: { select: { id: true } },
              } 
            },
            client: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!consent) {
      return res.status(404).json({ error: "Consimțământ inexistent pentru această rezervare." });
    }

    const isOwner = consent.booking.business.ownerId === authReq.user.userId;
    const isClient = consent.booking.client.id === authReq.user.userId;
    const isEmployee = consent.booking.business.employees.some((employee: { id: string }) => employee.id === authReq.user.userId);
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isClient && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest consimțământ." });
    }

    return res.json(consent);
  } catch (error) {
    logger.error("Consent get error", error);
    return res.status(500).json({ error: "Eroare la preluarea consimțământului." });
  }
});

router.get("/", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const queryParams = consentListQuerySchema.parse({
    businessId: req.query.businessId,
    employeeId: req.query.employeeId,
    date: req.query.date,
    search: req.query.search,
  });
  const { businessId, employeeId, date, search } = queryParams;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        ownerId: true,
        employees: { select: { id: true } },
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business-ul nu a fost găsit." });
    }

    const isOwner = business.ownerId === authReq.user.userId;
    const isEmployee = business.employees.some((employee: { id: string }) => employee.id === authReq.user!.userId);
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza consimțămintele acestui business." });
    }

    // Dacă e employee și cere filtrare pe employeeId, verifică că e propriul ID
    if (employeeId && isEmployee && !isOwner && !isSuperAdmin) {
      if (employeeId !== authReq.user.userId) {
        return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza consimțămintele altui angajat." });
      }
    }

    // Pentru employee, permitem afișarea tuturor booking-urilor cu consimțăminte dacă nu este specificată o dată
    // Pentru owner/superadmin, filtrează după dată (implicit astăzi)
    const isEmployeeOnly = isEmployee && !isOwner && !isSuperAdmin;
    const shouldFilterByDate = date || !isEmployeeOnly;

    const whereClause: Prisma.BookingWhereInput = {
      businessId,
    };

    if (shouldFilterByDate) {
      const referenceDate = date ? new Date(date) : new Date();
      if (Number.isNaN(referenceDate.getTime())) {
        return res.status(400).json({ error: "Data selectată nu este validă." });
      }

      const dayStart = new Date(referenceDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      whereClause.date = {
        gte: dayStart,
        lt: dayEnd,
      };
    }

    // Filtrare după employeeId dacă e specificat
    if (employeeId) {
      whereClause.employeeId = employeeId;
    }

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      whereClause.OR = [
        { client: { name: { contains: trimmedSearch, mode: "insensitive" } } },
        { client: { email: { contains: trimmedSearch, mode: "insensitive" } } },
      ];
    }

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      orderBy: { date: "asc" },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        service: { select: { id: true, name: true, duration: true, price: true } },
        employee: { select: { id: true, name: true, email: true } },
        consentForm: {
          select: { id: true, pdfUrl: true, templateType: true, createdAt: true },
        },
      },
    });

    return res.json({ bookings });
  } catch (error) {
    logger.error("Consent list error", error);
    return res.status(500).json({ error: "Nu am putut prelua consimțămintele." });
  }
});

/**
 * DELETE /consent/document/:documentId
 * Șterge un document de consimțământ
 */
router.delete("/document/:documentId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { documentId } = documentIdParamSchema.parse({ documentId: req.params.documentId });

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    // Găsește documentul
    const document = await prisma.consentDocument.findUnique({
      where: { id: documentId },
      include: {
        business: {
          select: { ownerId: true },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Documentul nu a fost găsit." });
    }

    // Verifică autorizarea: doar owner-ul business-ului sau superadmin pot șterge
    const isOwner = document.business.ownerId === authReq.user.userId;
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge acest document." });
    }

    // Șterge documentul
    await prisma.consentDocument.delete({
      where: { id: documentId },
    });

    return res.json({ message: "Documentul a fost șters cu succes." });
  } catch (error) {
    logger.error("Consent document delete error", error);
    return res.status(500).json({ error: "Nu am putut șterge documentul." });
  }
});

export = router;
