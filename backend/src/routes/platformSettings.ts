/**
 * Platform Settings Routes
 * Gestionează setările platform owner (doar SUPERADMIN)
 */

import express = require("express");
const { verifyJWT } = require("../middleware/auth");
const prisma = require("../lib/prisma").default;

const router = express.Router();

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
    console.error("Get platform settings error:", error);
    return res.status(500).json({ error: "Eroare la obținerea setărilor platform." });
  }
});

/**
 * PUT /platform-settings/:key
 * Actualizează o setare platform owner
 */
router.put("/:key", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { key } = req.params;
  const { value, description } = req.body;
  const authReq = req as AuthenticatedRequest;

  if (authReq.user?.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Doar SUPERADMIN poate modifica setările platform." });
  }

  if (!value) {
    return res.status(400).json({ error: "value este obligatoriu." });
  }

  try {
    const setting = await prisma.platformSettings.upsert({
      where: { key },
      update: {
        value,
        description: description || undefined,
        updatedBy: authReq.user.userId,
      },
      create: {
        key,
        value,
        description: description || undefined,
        updatedBy: authReq.user.userId,
      },
    });

    return res.json(setting);
  } catch (error) {
    console.error("Update platform setting error:", error);
    return res.status(500).json({ error: "Eroare la actualizarea setării platform." });
  }
});

/**
 * GET /platform-settings/:key
 * Returnează o setare specifică
 */
router.get("/:key", verifyJWT, async (req: express.Request, res: express.Response) => {
  const { key } = req.params;
  const authReq = req as AuthenticatedRequest;

  if (authReq.user?.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Doar SUPERADMIN poate accesa setările platform." });
  }

  try {
    const setting = await prisma.platformSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      return res.status(404).json({ error: "Setarea nu a fost găsită." });
    }

    return res.json(setting);
  } catch (error) {
    console.error("Get platform setting error:", error);
    return res.status(500).json({ error: "Eroare la obținerea setării platform." });
  }
});

export = router;

