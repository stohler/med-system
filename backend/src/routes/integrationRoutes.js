const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const {
  googleAuthUrl,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
} = require("../controllers/integrationController");

const router = Router();

router.use(requireAuth);
router.get("/google/url", googleAuthUrl);
router.post("/google/token", googleTokenExchange);
router.get("/whatsapp/status", whatsappStatus);
router.get("/whatsapp/qr", whatsappQr);

module.exports = router;
