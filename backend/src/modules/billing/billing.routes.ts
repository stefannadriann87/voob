/**
 * Billing Routes
 * Rute pentru gestionarea billing-ului recurent
 */

import express = require("express");
const { verifyJWT } = require("../../middleware/auth");
const {
  createSetupIntentController,
  subscribeController,
  cancelController,
  getStatusController,
} = require("./billing.controller");

const router = express.Router();

// Toate rutele necesită autentificare
router.post("/setup-intent", verifyJWT, createSetupIntentController);
router.post("/subscribe", verifyJWT, subscribeController);
router.post("/cancel", verifyJWT, cancelController);
router.get("/status/:businessId", verifyJWT, getStatusController);

module.exports = router;

