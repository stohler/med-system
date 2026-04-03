const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const {
  googleAuthUrl,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
  whatsappTestMessage,
  whatsappRestart,
} = require("../controllers/integrationController");

const router = Router();

router.use(requireAuth);
router.get("/google/url", googleAuthUrl);
router.post("/google/token", googleTokenExchange);
router.get("/whatsapp/status", whatsappStatus);
router.get("/whatsapp/qr", whatsappQr);
router.post("/whatsapp/test-message", whatsappTestMessage);
router.post("/whatsapp/restart", whatsappRestart);

module.exports = router;
