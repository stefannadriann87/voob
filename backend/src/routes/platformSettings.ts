/**
 * Platform Settings Routes
 * Gestionează setările platform owner (doar SUPERADMIN)
 */

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { updatePlatformSettingSchema, platformKeyParamSchema } = require("../validators/platformSchemas");
const prisma = require("../lib/prisma");
const { logger } = require("../lib/logger");

const router = express.Router();

// Helper pentru sanitizare input
const sanitize = (str: string) => {
  return str.trim().replace(/[<>"']/g, ""); // Remove HTML tags și quotes
};

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * GET /platform-settings
 * Returnează toate setările platform owner
 */
router.get("/", verifyJWT, async (req: express.Request, res: express.Response) => {
  const authReq = req as AuthenticatedRequest;

  if (authReq.user?.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Doar SUPERADMIN poate accesa setările platform." });
  }

  try {
    const settings = await prisma.platformSettings.findMany({
      orderBy: { key: "asc" },
    });

    // Convert array to object for easier access
    const settingsObject: Record<string, string> = {};
    for (const setting of settings) {
      settingsObject[setting.key] = setting.value;
    }

    return res.json(settingsObject);
  } catch (error) {
    logger.error("Get platform settings error:", error);
    return res.status(500).json({ error: "Eroare la obținerea setărilor platform." });
  }
});

/**
 * PUT /platform-settings/:key
 * Actualizează o setare platform owner
 */
router.put("/:key", verifyJWT, validate(updatePlatformSettingSchema), async (req: express.Request, res: express.Response) => {
  const { key } = platformKeyParamSchema.parse({ key: req.params.key });
  const { value, description } = updatePlatformSettingSchema.parse(req.body);
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  if (authReq.user.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Doar SUPERADMIN poate modifica setările platform." });
  }

  // IMPORTANT FIX: Sanitizează input-urile
  const sanitizedKey = sanitize(key);
  const sanitizedValue = sanitize(value);
  const sanitizedDescription = description ? sanitize(description) : undefined;

  try {
    const setting = await prisma.platformSettings.upsert({
      where: { key: sanitizedKey },
      update: {
        value: sanitizedValue,
        description: sanitizedDescription || undefined,
        updatedBy: authReq.user.userId,
      },
      create: {
        key: sanitizedKey,
        value: sanitizedValue,
        description: sanitizedDescription || undefined,
        updatedBy: authReq.user.userId,
      },
    });

    logger.info("Platform setting updated", { key: sanitizedKey, updatedBy: authReq.user.userId });
    return res.json(setting);
  } catch (error) {
    logger.error("Update platform setting error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea setării platform." });
  }
});

/**
 * GET /platform-settings/:key
 * Returnează o setare specifică
 */
router.get("/:key", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { key } = platformKeyParamSchema.parse({ key: req.params.key });
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    return res.status(401).json({ error: "Autentificare necesară." });
  }

  if (authReq.user.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Doar SUPERADMIN poate accesa setările platform." });
  }

  // IMPORTANT FIX: Sanitizează key-ul
  const sanitizedKey = sanitize(key);

  try {
    const setting = await prisma.platformSettings.findUnique({
      where: { key: sanitizedKey },
    });

    if (!setting) {
      return res.status(404).json({ error: "Setarea nu a fost găsită." });
    }

    return res.json(setting);
  } catch (error) {
    logger.error("Get platform setting error:", error);
    return res.status(500).json({ error: "Eroare la obținerea setării platform." });
  }
});

export = router;

