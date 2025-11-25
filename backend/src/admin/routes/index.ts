import express = require("express");
import type { BusinessStatus } from "@prisma/client";
const { verifyJWT } = require("../../middleware/auth");
const { requireSuperAdmin } = require("../middleware/requireSuperAdmin");
const {
  getDashboardSummary,
  getAnalyticsOverview,
  getAiUsageOverview,
} = require("../services/dashboardService");
const {
  listBusinessesOverview,
  getBusinessDetails,
  updateBusinessStatus,
  resetOwnerPassword,
} = require("../services/businessService");
const {
  listSubscriptions,
  listPlatformPayments,
  getPlatformSettings,
  updatePlatformSettings,
  getSystemLogs,
} = require("../services/platformService");

interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: string;
    role: string;
  };
}

const router = express.Router();

router.use(verifyJWT, requireSuperAdmin);

router.get("/dashboard/summary", async (_req, res) => {
  try {
    const summary = await getDashboardSummary();
    return res.json(summary);
  } catch (error: any) {
    console.error("Admin summary error:", error);
    return res.status(500).json({ error: "Nu am putut încărca rezumatul platformei." });
  }
});

router.get("/dashboard/analytics", async (_req, res) => {
  try {
    const analytics = await getAnalyticsOverview();
    return res.json(analytics);
  } catch (error: any) {
    console.error("Admin analytics error:", error);
    return res.status(500).json({ error: "Nu am putut genera analytics." });
  }
});

router.get("/dashboard/ai", async (_req, res) => {
  try {
    const aiUsage = await getAiUsageOverview();
    return res.json(aiUsage);
  } catch (error: any) {
    console.error("Admin AI usage error:", error);
    return res.status(500).json({ error: "Nu am putut încărca consumul AI." });
  }
});

router.get("/businesses", async (_req, res) => {
  try {
    const businesses = await listBusinessesOverview();
    return res.json(businesses);
  } catch (error: any) {
    console.error("Admin business list error:", error);
    return res.status(500).json({ error: "Nu am putut încărca business-urile." });
  }
});

router.get("/businesses/:businessId", async (req, res) => {
  const { businessId } = req.params;
  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }
  try {
    const details = await getBusinessDetails(businessId);
    return res.json(details);
  } catch (error: any) {
    console.error("Admin business details error:", error);
    return res.status(500).json({ error: error.message || "Nu am putut încărca detaliile business-ului." });
  }
});

router.patch("/businesses/:businessId/status", async (req, res) => {
  const { businessId } = req.params;
  const { status } = req.body as { status?: "ACTIVE" | "SUSPENDED" };
  if (!businessId || !status) {
    return res.status(400).json({ error: "businessId și status sunt obligatorii." });
  }
  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    return res.status(400).json({ error: "Status invalid." });
  }
  const authReq = req as AuthenticatedRequest;
  try {
    await updateBusinessStatus(businessId, status as BusinessStatus, authReq.user || {});
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Admin business status error:", error);
    return res.status(500).json({ error: error.message || "Nu am putut actualiza statusul business-ului." });
  }
});

router.post("/businesses/:businessId/reset-owner-password", async (req, res) => {
  const { businessId } = req.params;
  if (!businessId) {
    return res.status(400).json({ error: "businessId este obligatoriu." });
  }
  const authReq = req as AuthenticatedRequest;
  try {
    const result = await resetOwnerPassword(businessId, authReq.user || {});
    return res.json(result);
  } catch (error: any) {
    console.error("Admin reset owner password error:", error);
    return res.status(500).json({ error: error.message || "Nu am putut reseta parola ownerului." });
  }
});

router.get("/subscriptions", async (_req, res) => {
  try {
    const subs = await listSubscriptions();
    return res.json(subs);
  } catch (error: any) {
    console.error("Admin subscriptions error:", error);
    return res.status(500).json({ error: "Nu am putut încărca abonamentele." });
  }
});

router.get("/payments", async (_req, res) => {
  try {
    const payments = await listPlatformPayments();
    return res.json(payments);
  } catch (error: any) {
    console.error("Admin payments error:", error);
    return res.status(500).json({ error: "Nu am putut încărca plățile." });
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const settings = await getPlatformSettings();
    return res.json(settings);
  } catch (error: any) {
    console.error("Admin settings error:", error);
    return res.status(500).json({ error: "Nu am putut încărca setările platformei." });
  }
});

router.put("/settings", async (req, res) => {
  const { settings } = req.body as { settings?: { key: string; value: string; description?: string }[] };
  if (!Array.isArray(settings) || settings.length === 0) {
    return res.status(400).json({ error: "Lista de setări este obligatorie." });
  }
  const authReq = req as AuthenticatedRequest;
  try {
    await updatePlatformSettings(settings, authReq.user || {});
    return res.json({ success: true });
  } catch (error: any) {
    console.error("Admin update settings error:", error);
    return res.status(500).json({ error: "Nu am putut actualiza setările." });
  }
});

router.get("/logs", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  try {
    const logs = await getSystemLogs(Math.min(limit, 200));
    return res.json(logs);
  } catch (error: any) {
    console.error("Admin logs error:", error);
    return res.status(500).json({ error: "Nu am putut încărca log-urile de sistem." });
  }
});

module.exports = router;

