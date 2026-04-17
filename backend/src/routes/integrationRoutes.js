const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const {
  googleAuthUrl,
  googleCallback,
  googleStatus,
  googleDisconnect,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
  whatsappTestMessage,
  whatsappRestart,
  whatsappResetSession,
} = require("../controllers/integrationController");

const router = Router();

router.get("/google/callback", googleCallback);

router.use(requireAuth);
router.get("/google/url", googleAuthUrl);
router.get("/google/status", googleStatus);
router.post("/google/token", googleTokenExchange);
router.post("/google/disconnect", googleDisconnect);
router.get("/whatsapp/status", whatsappStatus);
router.get("/whatsapp/qr", whatsappQr);
router.post("/whatsapp/test-message", whatsappTestMessage);
router.post("/whatsapp/restart", whatsappRestart);
router.post("/whatsapp/reset-session", whatsappResetSession);

module.exports = router;
