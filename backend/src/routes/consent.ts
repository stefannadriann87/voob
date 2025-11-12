import express = require("express");
const prisma = require("../lib/prisma").default;

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    bookingId,
    pdfUrl,
    signature,
  }: { bookingId?: number; pdfUrl?: string; signature?: string } = req.body;

  if (!bookingId || !pdfUrl || !signature) {
    return res.status(400).json({
      error: "bookingId, pdfUrl și signature sunt obligatorii.",
    });
  }

  try {
    const consent = await prisma.consent.upsert({
      where: { bookingId },
      update: {
        pdfUrl,
        signature,
      },
      create: {
        booking: { connect: { id: bookingId } },
        pdfUrl,
        signature,
      },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            client: { select: { id: true, name: true, email: true } },
            business: { select: { id: true, name: true } },
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    return res.status(201).json(consent);
  } catch (error) {
    console.error("Consent create error:", error);
    return res.status(500).json({ error: "Eroare la salvarea consimțământului." });
  }
});

router.get("/:bookingId", async (req, res) => {
  const bookingId = Number(req.params.bookingId);

  if (Number.isNaN(bookingId)) {
    return res.status(400).json({ error: "bookingId invalid." });
  }

  try {
    const consent = await prisma.consent.findUnique({
      where: { bookingId },
      include: {
        booking: {
          select: {
            id: true,
            date: true,
            client: { select: { id: true, name: true, email: true } },
            business: { select: { id: true, name: true } },
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!consent) {
      return res.status(404).json({ error: "Consimțământ inexistent pentru booking." });
    }

    return res.json(consent);
  } catch (error) {
    console.error("Consent get error:", error);
    return res.status(500).json({ error: "Eroare la preluarea consimțământului." });
  }
});

export = router;

