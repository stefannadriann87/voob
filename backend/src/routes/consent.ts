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
    {
      id: "cnp",
      label: "CNP",
      type: "text",
      required: false,
      placeholder: "CNP (opțional)",
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

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

const convertImageDataUrlToPdf = async (dataUrl: string) => {
  const [meta, base64] = dataUrl.split(",");
  if (!meta || !base64) {
    throw new Error("Fișierul încărcat nu conține date valide.");
  }
  
  // CRITICAL FIX (TICKET-005): Validate file size before processing
  const base64Length = base64.length;
  // Base64 encoding increases size by ~33%, so we estimate original size
  const estimatedSize = (base64Length * 3) / 4;
  
  if (estimatedSize > MAX_IMAGE_SIZE) {
    logger.warn("File size exceeds limit", { 
      estimatedSize, 
      maxSize: MAX_IMAGE_SIZE,
      base64Length 
    });
    throw new Error(`Fișierul este prea mare. Dimensiunea maximă permisă este ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`);
  }
  
  // Extract MIME type - handle both "data:image/png;base64" and "data:image/png" formats
  const mimeMatch = meta.match(/data:(.*?)(;base64)?$/);
  const mimeType = mimeMatch?.[1];
  
  // CRITICAL FIX (TICKET-005): Validate MIME type completely
  if (!mimeType) {
    throw new Error("Tipul de fișier nu a putut fi determinat.");
  }
  
  // Only allow specific image types
  const allowedImageTypes = ["image/png", "image/jpeg", "image/jpg"];
  if (!allowedImageTypes.includes(mimeType.toLowerCase())) {
    logger.warn("Invalid image MIME type", { meta, mimeType });
    throw new Error(`Format imagine invalid. Tipuri permise: PNG, JPG, JPEG.`);
  }
  
  const imageBytes = Buffer.from(base64, "base64");
  
  // CRITICAL FIX (TICKET-005): Validate actual decoded size
  if (imageBytes.length > MAX_IMAGE_SIZE) {
    logger.warn("Decoded image size exceeds limit", { 
      actualSize: imageBytes.length, 
      maxSize: MAX_IMAGE_SIZE 
    });
    throw new Error(`Fișierul este prea mare. Dimensiunea maximă permisă este ${MAX_IMAGE_SIZE / 1024 / 1024}MB.`);
  }
  const pdfDoc = await PDFDocument.create();
  let embeddedImage;
  
  try {
    if (mimeType === "image/png") {
      embeddedImage = await pdfDoc.embedPng(imageBytes);
    } else if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      embeddedImage = await pdfDoc.embedJpg(imageBytes);
    } else {
      // Try PNG first, then JPG as fallback
      try {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } catch {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }
    }
  } catch (error) {
    logger.error("Error embedding image", { error, mimeType });
    throw new Error("Nu am putut procesa imaginea. Te rog verifică formatul fișierului.");
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
    let text = String(value);
    // Mapare explicită pentru caracterele românești comune
    const charMap: Record<string, string> = {
      "ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t",
      "Ă": "A", "Â": "A", "Î": "I", "Ș": "S", "Ț": "T",
      "ş": "s", "ţ": "t", // Variante alternative (compatibilitate cu encoding-uri vechi)
      "Ş": "S", "Ţ": "T",
    };
    
    // Înlocuiește caracterele românești
    text = text.replace(/[ăâîșțĂÂÎȘȚăâîşţĂÂÎŞŢ]/g, (char) => charMap[char] || char);
    
    // Elimină diacriticele rămase
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Elimină orice caracter non-ASCII rămas (păstrează doar ASCII + newline)
    text = text.replace(/[^\x20-\x7E\n\r]/g, "?");
    
    return text;
  } catch {
    // Fallback: elimină toate caracterele non-ASCII
    return String(value).replace(/[^\x20-\x7E\n\r]/g, "?");
  }
};

const businessNeedsConsent = (type?: BusinessType | null) =>
  !!type && CONSENT_REQUIRED_TYPES.includes(type);

router.get("/template", (_req, res) => {
  // Return updated consent template with only CNP and patientAgreement
  return res.json({ template: consentTemplate });
});

// Updated PDF generation with full form text - v2
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
    let currentPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 10;
    const lineHeight = 14;
    const marginX = 50;
    const maxWidth = 495; // A4 width - 2*margin

    const drawText = (text: string, x: number, y: number, options: { size?: number; font?: typeof font | typeof boldFont } = {}) => {
      const textFont = options.font || font;
      currentPage.drawText(text, { x, y, size: options.size ?? fontSize, font: textFont });
    };
    const drawSafeText = (value: unknown, x: number, y: number, options: { size?: number; font?: typeof font | typeof boldFont } = {}) => {
      drawText(sanitizeForPdf(value), x, y, options);
    };

    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    let cursorY = 800;

    // Titlu
    drawSafeText("FORMULAR DE INFORMARE SI CONSINTAMANT AL PACIENTULUI", marginX, cursorY, { size: 12, font: boldFont });
    cursorY -= 15;
    drawSafeText("INFORMAT PRIVIND TRATAMENTUL STOMATOLOGIC", marginX, cursorY, { size: 12, font: boldFont });
    cursorY -= 25;

    // Informații pacient - completează automat numele, prenumele și CNP-ul
    const patientName = booking.client.name ?? "";
    const cnp = (formData["cnp"] && typeof formData["cnp"] === "string" && formData["cnp"].trim().length > 0) ? formData["cnp"] : "";
    
    // Sanitize patient name and CNP before using them (for width calculations)
    const patientNameSanitizedForWidth = sanitizeForPdf(patientName);
    const cnpSanitized = sanitizeForPdf(cnp);
    
    // Linia cu nume și prenume + CNP - formatată exact ca în formular
    const nameLabel = "Nume si prenume pacient ";
    const nameLabelSanitized = sanitizeForPdf(nameLabel);
    const nameLabelWidth = font.widthOfTextAtSize(nameLabelSanitized, fontSize);
    drawSafeText(nameLabelSanitized, marginX, cursorY, { size: fontSize });
    
    // Calculează poziția pentru nume
    const nameStartX = marginX + nameLabelWidth;
    const dotsBeforeCNP = 95; // Număr de puncte până la "CNP"
    const dotsWidth = font.widthOfTextAtSize(".", fontSize);
    const nameMaxWidth = dotsBeforeCNP * dotsWidth;
    
    // Desenează numele pacientului
    if (patientNameSanitizedForWidth) {
      const nameWidth = font.widthOfTextAtSize(patientNameSanitizedForWidth, fontSize);
      if (nameWidth <= nameMaxWidth) {
        drawSafeText(patientNameSanitizedForWidth, nameStartX, cursorY, { size: fontSize });
        // Desenează punctele după nume
        const dotsAfterName = Math.floor((nameMaxWidth - nameWidth) / dotsWidth);
        drawSafeText(".".repeat(dotsAfterName), nameStartX + nameWidth, cursorY, { size: fontSize });
      } else {
        // Dacă numele este prea lung, trunchiază-l
        let truncatedName = patientNameSanitizedForWidth;
        while (font.widthOfTextAtSize(truncatedName, fontSize) > nameMaxWidth && truncatedName.length > 0) {
          truncatedName = truncatedName.slice(0, -1);
        }
        drawSafeText(truncatedName, nameStartX, cursorY, { size: fontSize });
      }
    } else {
      // Dacă nu există nume, desenează doar punctele
      drawSafeText(".".repeat(dotsBeforeCNP), nameStartX, cursorY, { size: fontSize });
    }
    
    // Desenează "CNP"
    const cnpLabel = " CNP ";
    const cnpLabelSanitized = sanitizeForPdf(cnpLabel);
    const cnpLabelX = nameStartX + nameMaxWidth;
    drawSafeText(cnpLabelSanitized, cnpLabelX, cursorY, { size: fontSize });
    
    // Desenează CNP-ul și punctele după
    const cnpLabelWidth = font.widthOfTextAtSize(cnpLabelSanitized, fontSize);
    const cnpStartX = cnpLabelX + cnpLabelWidth;
    const dotsAfterCNP = 40; // Număr de puncte după CNP
    const cnpMaxWidth = dotsAfterCNP * dotsWidth;
    
    if (cnpSanitized) {
      const cnpWidth = font.widthOfTextAtSize(cnpSanitized, fontSize);
      if (cnpWidth <= cnpMaxWidth) {
        drawSafeText(cnpSanitized, cnpStartX, cursorY, { size: fontSize });
        const dotsAfterCnp = Math.floor((cnpMaxWidth - cnpWidth) / dotsWidth);
        drawSafeText(".".repeat(dotsAfterCnp), cnpStartX + cnpWidth, cursorY, { size: fontSize });
      } else {
        // Dacă CNP-ul este prea lung, trunchiază-l
        let truncatedCnp = cnpSanitized;
        while (font.widthOfTextAtSize(truncatedCnp, fontSize) > cnpMaxWidth && truncatedCnp.length > 0) {
          truncatedCnp = truncatedCnp.slice(0, -1);
        }
        drawSafeText(truncatedCnp, cnpStartX, cursorY, { size: fontSize });
      }
    } else {
      // Dacă nu există CNP, desenează doar punctele
      drawSafeText(".".repeat(dotsAfterCNP), cnpStartX, cursorY, { size: fontSize });
    }
    
    cursorY -= lineHeight;
    cursorY -= 10;

    // Textul complet al formularului exact ca în cerință
    // Sanitize business name before using it in form text
    const businessName = sanitizeForPdf(booking.business.name ?? "");
    
    // Textul formularului cu toate caracterele românești sanitizate
    const formTextRaw = `Sunt de acord ca echipa medicala: ${businessName} sa efectueze examinarea, diagnosticele, recomandarile si actele medicale necesare in cazul meu.

Etapele necesare pentru tratarea afecțiunii(lor) mele stomatologice mi-au fost explicate și includ: obturații, lucrări protetice fixe, radiografii, extracții, tratamente endodontice, tratament parodontal, proteze mobilizabile, tratament ortodontic, altele.

Am fost informat cu privire la diagnosticul afecțiunilor mele dentare, la alternativele de tratament ale acestor afecțiuni (dacă ele există), precum și la consecințele ne-intervenției terapeutice. Am înțeles ca există riscuri inerente și potențiale pentru orice plan de tratament sau intervenție terapeutică. Deși nu apar în mod obișnuit, aceste riscuri se pot manifesta, după cum urmează:

RADIOGRAFII
Pentru precizarea diagnosticului şi stabilirea planului de tratament pot fi necesare serii repetate de radiografii sau alte metode de investigare imagistică (tomografie computerizată, teleradiografie de profil, repetarea examenului radiologic în diferite incidenţe). Refuzul de a face aceste radiografii sau investigaţii imagistice poate avea consecinţe negative asupra rezultatului final, mergând până la eşecul tratamentului. In timpul tratamentului pot apărea informaţii diagnostice neprevăzute, care să extindă amploarea şi/sau tipul intervenţiilor. Sunt de acord ca echipa medicală menţionată anterior să realizeze şi intervenţiile neprevăzute în momentul iniţierii tratamentului.

SCHIMBĂRI ÎN PLANUL DE TRATAMENT:
Am înțeles că în timpul procedurilor terapeutice planificate pot apărea informații diagnostice neprevăzute, care să extindă amploarea și/sau timpul intervenției(ilor). Autorizez prin aceasta persoana(ele) prevăzută(e) la paragraful 1 să realizeze și intervențiile neprevăzute în momentul inițierii tratamentului.

MEDICAMENTATIE:
Anestezicele, antibioticele, sau alte medicamente şi substanţe pot cauza diverse reacţii alergice care se pot manifesta prin, fără a se limita la: eritem (roşeaţă), tumefacţii (umflături), dureri, până la şoc anafilactic. Am informat medicul asupra faptului că sunt alergic(ă) la următoarele substanţe:………………………………………………………………………………….

Consimt la administrarea anestezicelor necesare.

ANESTEZIA:
După anestezie poate apărea, fără a se limita la: reducerea sau pierderea sensibilităţii dinţilor vecini, a buzelor, limbii şi a ţesuturilor înconjurătoare (parestezie/anestezie) pe o perioadă nedeterminată de timp, apariţia temporară a unui hematom local, zonă uşor dureroasă la locul de injecţie, tumefacţie (umflătură) temporară a obrazului sau a ţesuturilor înconjurătoare.

OBTURAŢII (PLOMBE):
Realizarea sau înlocuirea obturaţiiIor pot produce – fără a se limita la: hipersensibilitate temporară a dintelui, inflamaţie a pulpei dentare cu necesitatea ulterioară a tratamentului endodontic (de canal), apariţia unor fisuri/fracturi ale smalţului dentar, longevitate mai redusă a restaurărilor în raport cu cele precedente. În timp, obturaţiile estetice îşi pot modifica culoarea din cauza alimentelor colorate, a fumatului, etc.

TRATAMENTUL ENDODONTIC (DE CANAL):
Tratamentul de canal nu garantează salvarea dintelui şi există situaţii în care, în ciuda tuturor eforturilor depuse pentru salvarea dintelui, acesta trebuie extras. Alternativele tratamentului de canal sunt reprezentate de extracţia dintelui sau nonintervenţie. Este obligatorie finalizarea tratamentului endodontic. În timpul sau după efectuarea tratamentului de canal pot apărea următoarele, fără a se limita la: durere, tumefacţie (umflătură), infecţie, reinfecţie, iritarea sau lezarea mucoasei bucale înconjurătoare, afectare parodontală (pierderea suportului osos şi mobilizarea dintelui ca urmare a infecţiei), ruperea unor instrumente (cum ar fi acele de canal) în interiorul rădăcinii dintelui, perforaţia coroanei sau a rădăcinii dintelui. Rata de succes a tratamentului endodontic este de 85-95% şi uneori tratamentul endodontic trebuie repetat sau/şi pot fi necesare mici intervenţii chirurgicale asupra dintelui respectiv, sau poate fi necesară reluarea tratamentului. Tratamentul de canal poate necesita uneori mai multe şedinţe pentru a fi finalizat. De asemenea, tratamentul de canal poate determina colorarea dintelui şi o susceptibilitate mai mare la fractură a dintelui; de aceea este obligatoriu ca după finalizarea tratamentului endodontic dintele să primească o restaurare definitivă: obturaţie sau coroană.

TRATAMENTUL DE ALBIRE:
După tratamentul de albire este posibil ca dinţii să prezinte hipersensibilitate persistentă. În timpul şi după tratamentul de albire este posibilă apariţia sensibilităţii/leziunilor la nivelul gingiei. Intensitatea şi durata efectului de albire este variabilă.

EXTRACŢIA DENTARĂ:
După extracţia dentară poate apărea, prin afectarea nervilor din vecinătate, fără a se limita la: reducerea/pierderea sensibilităţii dinţilor vecini, a buzelor, limbii şi a ţesuturilor înconjurătoare (parestezie/anestezie) pe o perioadă nedeterminată de timp. Riscurile pe care le presupun extracţia dentară, pot fi, fără a se limita la: durere, tumefacţie (umflătură), învineţire, alveolită (infecţie), vindecare întârziată, afectarea dinţilor şi a restaurărilor din vecinătate sau de pe arcada antagonistă, deschiderea sinusurilor maxilare, a foselor nazale, fractura rădăcinilor şi împingerea lor în sinusul maxilar, în fosele nazale sau în spaţiile înconjurătoare, în canalul mandibular sau în gaura mentală, aspirarea şi/sau înghiţirea de corpi străini, spasme musculare locale, fractura maxilarului sau a mandibulei, afectarea nervilor din vecinătate cu reducerea/pierderea sensibilităţii dinţilor vecini, a buzelor, limbii şi a ţesuturilor înconjurătoare (parestezie/anestezie) pe o perioadă nedeterminată de timp, lezarea unor vase de sânge de vecinătate: arteră alveolară, maxilară, palatină sau ramuri mucozale sau intraosoase ale acestora. Am înţeles că în cazul accidentelor din timpul anesteziei, a complicaţiilor intraoperatorii, accidentelor și incidentelor postextracţionale poate apărea necesitatea unui tratament de specialitate la un medic chirurg maxilo-facial, tratament de specialitate al cărui cost intră în responsabilitatea mea.

BOALA PARODONTALĂ.
Problemele parodontale manifestate prin afectarea gingiei și a osului adiacent pot duce la pierderea mai rapida a dinților, lucrărilor protetice si implanturilor. Planul de tratament mi-a fost explicat și cuprinde: un program de întreținere/dispensarizare, intervenții de scaling, chiuretaj gingival și planare radiculară și în unele cazuri intervenții parodontale, inclusiv chirurgicale, asupra dinților, gingiei și osului, adiție osoasă și/sau extracții. Absența intervenției poate agrava starea de sănătate parodontală.

SCALING, CHIURETAJ GINGIVAL, PLANARE RADICULARĂ:
După intervențiile de scaling, chiuretaj gingival și planare radiculară, dinții vor avea o mobilitate inițial crescută iar gingiile se vor retrage. Rădăcinile dentare astfel expuse vor fi mai sensibile. De obicei, hipermobilitatea și hipersensibilitatea se remit spontan în circa șase luni, însă pot necesita tratament suplimentar. Rădăcinile expuse au o structură mai poroasă decât smalțul dinților și sunt astfel mai susceptibile la retenția alimentelor și colorație decât restul suprafețelor dentare. Retracția gingivală din zona frontală maxilară poate duce la modificări de fonație care poate necesita intervenție terapeutică suplimentară. Dupa intervențiile de scaling, chiuretaj gingival și planare radiculară este necesară o reevaluare diagnostică, în urma căreia pot fi recomandate și alte intervenții parodontale.

INTERVENȚII CHIRURGICALE PARODONTALE:
Intervențiile parodontale sunt indicate în cazul persistenței pungilor parodontale/ infecției. Aceste intervenții au ca scop reducerea/eliminarea pungilor parodontale patologice și curățarea riguroasă a suprafețelor radiculare. Insă, există situații în care după tratament parodontal, datorită unor factori cum ar fi faza avansată a bolii parodontale, absența unui program susținut de întreținere/dispensarizare, factori nutriționali, endocrini, afecțiuni generale etc, problemele parodontale pot persista sau chiar se pot agrava, mergând până la pierderea dinților.

LUCRĂRI PROTETICE
Lucrări protetice fixe
Pentru aplicarea lucrărilor protetice fixe este necesară prepararea (şlefuirea) dinţilor sau este necesară inserţia implanturilor dentare (atunci când agregarea se face pe implante). Este foarte important să se respecte programările pentru probe în diverse etape de lucru şi pentru cimentarea finală, deoarece întârzierile pot duce la afectarea integrităţii dinţilor şlefuiţi, a bonturilor implantare şi/sau a implantelor, şi la alte modificări ce pot necesita refacerea lucrărilor protetice si/sau a implantelor, cu costuri adiţionale care cad în responsabilitatea pacientului. După cimentarea faţetelor/coroanelor/punţilor poate apărea sensibilitate la nivelul dinţilor pe care acestea sunt aplicate, sau la nivelul porţiunii gingivale din zona corpului de punte. Ceramica dentară (porţelanul) este casantă; acrilatul dentar sau compozitul dentar se pot desprinde (faţete sau suprafeţe întregi). Faţetele/coroanele din ceramică, zirconiu sau compozit, fără suport metalic, sunt restaurări fragile, care se pot fisura sau fractura relativ uşor, chiar în cazurile în care sunt corect concepute şi realizate

Proteze mobilizabile
Purtarea unei proteze mobilizabile poate fi dificilă. Pot apărea zone dureroase persistente, modificări de fonaţie (vorbire) şi dificultăţi în masticaţie. Eficienţa unei proteze totale este de aproximativ 30% faţă de eficienţa unei arcade dentare integre. Protezarea imediată (plasarea protezei imediat după extracţiile dinţilor) poate fi dureroasă. Protezarea imediată necesită ajustări, căptuşiri şi rebazări. De asemenea, sunt necesare căptuşiri sau rebazări ale protezelor la anumite intervale de timp. Este responsabilitatea pacientului de a respecta programarea pentru şedinţa de aplicare a protezei/protezelor mobilizabile pe câmpul protetic, deoarece întârzierile pot necesita refacerea protezei/protezelor şi/sau a implantelor de sprijin (atunci când agregarea se face pe implante) cu costuri adiţionale care intră în responsabilitatea pacientului. După cimentarea lucrărilor fixe si dupa aplicarea în cavitatea bucală a protezelor mobilizabile se recomandă: NU se va muşca din fructe (mere, etc); orice necesită „muşcătură" trebuie tăiat în bucăţi mai mici; NU se vor zdrobi mieji de nucă, alune, boabe de cafea, oase din mâncare, sâmburi sau orice alte alimente dure sau lemnoase, protezele putându-se mişca datorită forţelor masticatorii mari; NU se va încerca perforarea / desfacerea / tăierea / ruperea / tracţionarea cu lucrările, sau cu orice alt dinte cu care lucrările intră în contact, capace de sticle, ambalaje alimentare sau nealimentare, folii de orice tip sau a altor materiale de uzanţă zilnică; NU vor fi ţinute cu lucrările obiecte dure; NU se practică sporturi agresive. Orice modificare a integrităţii lucrărilor protetice fixe sau mobilizabile trebuie anunţată în cel mai scurt timp echipei medicale, pentru a putea minimiza efectele asupra dinţilor pe care se ancorează dar şi asupra celorlalţi dinţi si lucrări și asupra ţesuturilor moi inconjuratoare, sau asupra implantelor existente la nivelul cavităţii orale. Nicio formă de protezare fixă sau mobilizabilă nu este difinitivă, orice piesă protetică necesitând la un moment-dat ajustare sau refacere (în aceeaşi formă sau în formă nouă) în funcţie de evoluţia oaselor maxilare, a edentaţiilor, a mucoaselor şi a gingiei acoperitoare, a uzurii normale a dinţilor protezelor, a modificărilor suferite de implantele inserate, sau a modificării lucrărilor protetice fixe sau mobilizabile existente.

BRUXISMUL, ALTE PARAFUNCŢII OCLUZALE:
Obiceiurile nefuncţionale care determină suprasolicitarea arcadelor dentare, cum ar fi: bruxismul (scrâşnitul dinţilor), încleştarea maxilarelor, onicofagia (roaderea unghiilor) etc., pot determina pierderea prematură a restaurărilor dentare, a protezelor mobilizabile, a implantelor, uzură patologică/fisuri/fracturi ale dinţilor naturali uzură accentuată/fisuri/fracturi ale dinților sau ale bazelor protezelor fixe sau mobilizabile, modificarea structurilor de suport – rezorbții osoase sau boselarea proceselor alveolare, anchiloza rădăcinilor sau a implantelor, parodontite/periimplantite, hipercalcificări ale canalelor radiculare şi mobilizarea dinţilor sau a implantelor existente.

ÎNTREŢINEREA ŞI DISPENSARIZAREA:
Pentru a asigura funcţionalitatea şi longevitatea restaurărilor stomatologice, a dinţilor şi a ţesuturilor de suport ale acestora este necesar ca pacientul să se prezinte de cel puţin două ori pe an pentru control, igienizare profesională, precum şi pentru remedierea precoce a eventualelor probleme apărute. Nerespectarea acestor reguli poate determina eşecul prematur al tratamentelor, cu apariţia unor complicaţii locale sau la distanţă.

Sunt pe deplin de acord cu recomandările medicului / echipei medicale în îngrijirea căruia / căreia mă aflu, înţelegând că nerespectarea acestor recomandări poate duce la un rezultat final mai puţin decât optim sau chiar la eşecul tratamentului.

Declar că mi-au fost furnizate informaţii legate de serviciile medicale disponibile, despre starea mea de sănătate, diagnostic, prognostic, natura şi scopul tratamentului propus, intervenţiile şi strategia terapeutică propuse, riscurile şi consecinţele tratamentului, alternativele viabile de tratament, riscurile potenţiale, riscurile neefectuării tratamentului, riscurile nerespectării recomandărilor medicale şi a costului estimativ al tratamentului.

Sunt de acord cu recoltarea, păstrarea şi folosirea produselor biologice.

Am fost înştiinţat de dreptul la o a doua opinie medicală.

Am avut oportunitatea să pun întrebările pe care le-am dorit privind planul de tratament și tuturor întrebărilor li s-a răspuns satisfăcător.

Certific că știu să scriu și să citesc în limba română și că am înțeles în totalitate acest text.

Declar că am înţeles toate informaţiile furnizate mai sus de către echipa medicală enumerată anterior, că am prezentat echipei medicale doar informaţii adevărate şi îmi exprim consimţământul informat pentru efectuarea actelor medicale.

DATA ${new Date().toLocaleDateString("ro-RO")} PACIENT ${patientNameSanitizedForWidth} MEDIC ${businessName}`;
    
    // Sanitize the entire form text to remove Romanian characters
    const formText = sanitizeForPdf(formTextRaw);

    const formLines = formText.split("\n");
    formLines.forEach((line) => {
      if (line.trim()) {
        const wrappedLines = wrapText(line.trim(), maxWidth, fontSize);
        wrappedLines.forEach((wrappedLine) => {
          if (cursorY < 100) {
            // Add new page if needed
            currentPage = pdfDoc.addPage([595.28, 841.89]);
            cursorY = 800;
          }
          drawSafeText(wrappedLine, marginX, cursorY, { size: fontSize });
          cursorY -= lineHeight;
        });
        cursorY -= 2; // Small spacing between paragraphs
      } else {
        cursorY -= lineHeight / 2; // Empty line spacing
      }
    });

    cursorY -= 20;
    
    // Semnătură și data
    if (cursorY < 150) {
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      cursorY = 800;
    }

    cursorY -= 20;
    drawSafeText("Semnatura pacient:", marginX, cursorY, { size: fontSize, font: boldFont });
    cursorY -= 30;

    if (signature) {
      try {
        const signatureBytes = normalizeSignature(signature);
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        currentPage.drawImage(signatureImage, {
          x: marginX,
          y: cursorY - 60,
          width: 200,
          height: 60,
        });
        cursorY -= 80;
      } catch (error) {
        logger.warn("Nu am putut insera semnătura în PDF", error);
        drawSafeText("(Semnatura digitala)", marginX, cursorY, { size: fontSize });
        cursorY -= 30;
      }
    } else {
      drawSafeText("Consintamant confirmat electronic (fara semnatura digitala)", marginX, cursorY, { size: fontSize });
      cursorY -= 30;
    }

    cursorY -= 10;
    const dateText = sanitizeForPdf(`Data semnarii: ${new Date().toLocaleDateString("ro-RO")}`);
    drawSafeText(dateText, marginX, cursorY, { size: fontSize });

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
    const response: { error: string; details?: string; stack?: string } = {
      error: "Nu am putut genera consimțământul.",
    };
    if (process.env.NODE_ENV !== "production") {
      if (error instanceof Error) {
        response.details = error.message;
        if (error.stack) {
          response.stack = error.stack;
        }
      } else {
        response.details = String(error);
      }
    }
    return res.status(500).json(response);
  }
});

// Decode HTML entities (e.g., &#x2F; -> /)
const decodeHtmlEntities = (str: string): string => {
  return str
    .replace(/&#x2F;/g, "/")
    .replace(/&#x3D;/g, "=")
    .replace(/&#x3A;/g, ":")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

router.post("/upload", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  
  // Manual validation with better error messages
  let bookingId: string;
  let pdfDataUrl: string;
  let fileName: string | undefined;
  
  try {
    // Decode HTML entities in pdfDataUrl if present
    if (req.body?.pdfDataUrl && typeof req.body.pdfDataUrl === "string") {
      req.body.pdfDataUrl = decodeHtmlEntities(req.body.pdfDataUrl);
    }
    
    const body = uploadConsentSchema.parse(req.body);
    bookingId = body.bookingId;
    pdfDataUrl = body.pdfDataUrl;
    fileName = body.fileName;
  } catch (error) {
    logger.warn("Upload validation error", { 
      error: error instanceof Error ? error.message : String(error),
      bodyKeys: Object.keys(req.body || {}),
      pdfDataUrlType: typeof req.body?.pdfDataUrl,
      pdfDataUrlPrefix: typeof req.body?.pdfDataUrl === "string" ? req.body.pdfDataUrl.substring(0, 100) : "not a string"
    });
    
    if (error instanceof Error && error.message.includes("pdfDataUrl")) {
      return res.status(400).json({ 
        error: "Formatul fișierului trebuie să fie PDF sau imagine (PNG/JPG) în format base64.",
        details: error.message
      });
    }
    return res.status(400).json({ 
      error: "Date invalide pentru upload.",
      details: error instanceof Error ? error.message : String(error)
    });
  }

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    let storedPdfUrl = pdfDataUrl;
    
    // Validate data URL format
    if (!pdfDataUrl || typeof pdfDataUrl !== "string") {
      return res
        .status(400)
        .json({ error: "Formatul fișierului trebuie să fie PDF sau imagine (PNG/JPG) în format base64." });
    }
    
    // CRITICAL FIX (TICKET-005): Validate file size before processing
    const [meta, base64] = pdfDataUrl.split(",");
    if (!meta || !base64) {
      return res.status(400).json({ error: "Fișierul încărcat nu conține date valide." });
    }
    
    // Validate size (estimate from base64 length)
    const base64Length = base64.length;
    const estimatedSize = (base64Length * 3) / 4;
    
    // Check if it's an image (PNG, JPG, JPEG, etc.)
    if (pdfDataUrl.startsWith("data:image/")) {
      if (estimatedSize > MAX_IMAGE_SIZE) {
        logger.warn("Image file size exceeds limit", { 
          estimatedSize, 
          maxSize: MAX_IMAGE_SIZE,
          fileName 
        });
        return res.status(400).json({ 
          error: `Fișierul este prea mare. Dimensiunea maximă permisă pentru imagini este ${MAX_IMAGE_SIZE / 1024 / 1024}MB.` 
        });
      }
      storedPdfUrl = await convertImageDataUrlToPdf(pdfDataUrl);
    } 
    // Check if it's a PDF
    else if (pdfDataUrl.startsWith("data:application/pdf")) {
      // CRITICAL FIX (TICKET-005): Validate PDF size
      if (estimatedSize > MAX_PDF_SIZE) {
        logger.warn("PDF file size exceeds limit", { 
          estimatedSize, 
          maxSize: MAX_PDF_SIZE,
          fileName 
        });
        return res.status(400).json({ 
          error: `Fișierul este prea mare. Dimensiunea maximă permisă pentru PDF-uri este ${MAX_PDF_SIZE / 1024 / 1024}MB.` 
        });
      }
      
      // Validate actual decoded size for PDF
      try {
        const pdfBytes = Buffer.from(base64, "base64");
        if (pdfBytes.length > MAX_PDF_SIZE) {
          logger.warn("Decoded PDF size exceeds limit", { 
            actualSize: pdfBytes.length, 
            maxSize: MAX_PDF_SIZE,
            fileName 
          });
          return res.status(400).json({ 
            error: `Fișierul este prea mare. Dimensiunea maximă permisă pentru PDF-uri este ${MAX_PDF_SIZE / 1024 / 1024}MB.` 
          });
        }
      } catch (decodeError) {
        logger.error("Error decoding PDF base64", { error: decodeError, fileName });
        return res.status(400).json({ error: "Formatul fișierului PDF este invalid." });
      }
      
      // Already a PDF, use as is
      storedPdfUrl = pdfDataUrl;
    } 
    // Invalid format
    else {
      logger.warn("Invalid file format received", { 
        dataUrlPrefix: pdfDataUrl.substring(0, 100),
        fileName 
      });
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
        return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza documentele altui specialist." });
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

  const user = authReq.user; // TypeScript now knows user is defined

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

    const isOwner = consent.booking.business.ownerId === user.userId;
    const isClient = consent.booking.client.id === user.userId;
    const isEmployee = consent.booking.business.employees.some((employee: { id: string }) => employee.id === user.userId);
    const isSuperAdmin = user.role === "SUPERADMIN";

    if (!isOwner && !isClient && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a accesa acest consimțământ." });
    }

    return res.json(consent);
  } catch (error) {
    logger.error("Consent get error", error);
    return res.status(500).json({ error: "Eroare la preluarea consimțământului." });
  }
});

// Check if client has already signed consent for a business
router.get("/check/:clientId/:businessId", verifyJWT, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { clientId } = clientIdParamSchema.parse({ clientId: req.params.clientId });
  const businessId = req.params.businessId;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  try {
    // Verify clientId matches authenticated user if role is CLIENT
    if (authReq.user.role === "CLIENT" && authReq.user.userId !== clientId) {
      return res.status(403).json({ error: "Nu poți verifica consimțământul pentru alt client." });
    }

    // Check if client has any signed consent for this business
    const existingConsent = await prisma.consentForm.findFirst({
      where: {
        booking: {
          clientId,
          businessId,
        },
        pdfUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ hasSigned: Boolean(existingConsent) });
  } catch (error) {
    logger.error("Consent check error", error);
    return res.status(500).json({ error: "Eroare la verificarea consimțământului." });
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
        return res.status(403).json({ error: "Nu ai permisiunea de a vizualiza consimțămintele altui specialist." });
      }
    }

    // Pentru employee, permitem afișarea tuturor booking-urilor cu consimțăminte dacă nu este specificată o dată
    // Pentru owner/superadmin, filtrează după dată (implicit astăzi) doar dacă nu există search
    // Dacă există search, nu filtrăm după dată pentru a permite căutarea în toate rezultatele
    const isEmployeeOnly = isEmployee && !isOwner && !isSuperAdmin;
    const shouldFilterByDate = date && !search; // Nu filtrăm după dată dacă există search

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

    // Group bookings by client - only include clients that have at least one booking with consent or documents
    type BookingWithIncludes = typeof bookings[number];
    const clientBookingsMap = new Map<string, BookingWithIncludes[]>();
    
    bookings.forEach((booking: BookingWithIncludes) => {
      const clientId = booking.client.id;
      if (!clientBookingsMap.has(clientId)) {
        clientBookingsMap.set(clientId, []);
      }
      clientBookingsMap.get(clientId)!.push(booking);
    });

    // Convert to array of client groups - return only the latest booking per client
    // Also check if client has signed consent for this business (once per business)
    const clientGroups = await Promise.all(
      Array.from(clientBookingsMap.entries()).map(async ([clientId, clientBookings]) => {
        const firstBooking = clientBookings[0];
        
        // Sort bookings by date (most recent first) and get the latest one
        const sortedBookings = [...clientBookings].sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const latestBooking = sortedBookings[0];
        
        // Check if client has signed consent for this business (any booking with consent)
        const hasSignedConsent = clientBookings.some((booking) => Boolean(booking.consentForm));
        
        // Get the consent form if it exists (prefer the one from latest booking, or any signed one)
        const consentForm = latestBooking.consentForm || 
          clientBookings.find((b) => Boolean(b.consentForm))?.consentForm || null;
        
        return {
          client: firstBooking.client,
          latestBooking: {
            ...latestBooking,
            consentForm: consentForm,
          },
          hasSignedConsent,
        };
      })
    );
    
    // Filter to only include clients that have at least one booking with consent form
    const filteredClientGroups = clientGroups.filter((group) => group.hasSignedConsent);

    return res.json({ clientGroups: filteredClientGroups });
  } catch (error) {
    logger.error("Consent list error", error);
    const response: { error: string; details?: string; stack?: string } = {
      error: "Nu am putut prelua consimțămintele.",
    };
    if (process.env.NODE_ENV !== "production") {
      if (error instanceof Error) {
        response.details = error.message;
        if (error.stack) {
          response.stack = error.stack;
        }
      } else {
        response.details = String(error);
      }
    }
    return res.status(500).json(response);
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
          select: { 
            ownerId: true,
            employees: { select: { id: true } },
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Documentul nu a fost găsit." });
    }

    // Verifică autorizarea: owner-ul business-ului, angajații sau superadmin pot șterge
    const isOwner = document.business.ownerId === authReq.user.userId;
    const isEmployee = document.business.employees.some((employee: { id: string }) => employee.id === authReq.user!.userId);
    const isSuperAdmin = authReq.user.role === "SUPERADMIN";

    if (!isOwner && !isEmployee && !isSuperAdmin) {
      return res.status(403).json({ error: "Nu ai permisiunea de a șterge acest document." });
    }

    // Șterge documentul
    await prisma.consentDocument.delete({
      where: { id: documentId },
    });

    return res.json({ message: "Documentul a fost șters cu succes." });
  } catch (error) {
    logger.error("Consent document delete error", error);
    const response: { error: string; details?: string; stack?: string } = {
      error: "Nu am putut șterge documentul.",
    };
    if (process.env.NODE_ENV !== "production") {
      if (error instanceof Error) {
        response.details = error.message;
        if (error.stack) {
          response.stack = error.stack;
        }
      } else {
        response.details = String(error);
      }
    }
    return res.status(500).json(response);
  }
});

export = router;
