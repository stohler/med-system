const { asyncHandler } = require("../utils/asyncHandler");
const {
  getGoogleAuthUrl,
  getGoogleTokens,
} = require("../services/googleCalendarService");
const {
  getWhatsappStatus,
  getWhatsappQrCode,
  initWhatsApp,
} = require("../services/whatsappService");

const googleAuthUrl = asyncHandler(async (_req, res) => {
  const url = getGoogleAuthUrl("clinic-system");
  res.json({ url });
});

const googleTokenExchange = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const tokens = await getGoogleTokens(code);
  res.json({ tokens });
});

const whatsappStatus = asyncHandler(async (_req, res) => {
  res.json(getWhatsappStatus());
});

const whatsappQr = asyncHandler(async (_req, res) => {
  try {
    await initWhatsApp();
    const qrCodeDataUrl = await getWhatsappQrCode();
    const status = getWhatsappStatus();

    if (!qrCodeDataUrl) {
      let reason = "QR indisponivel no momento. Aguarde alguns segundos e tente novamente.";
      if (status.mode !== "web") {
        reason = "WHATSAPP_MODE diferente de web. Ajuste para web para usar QR Code.";
      } else if (!status.libraryLoaded) {
        reason =
          "Cliente WhatsApp Web indisponivel no ambiente. Verifique dependencias Chromium/Puppeteer.";
      } else if (!status.webSessionEnabled) {
        reason =
          "WhatsApp Web foi desabilitado no ambiente (WHATSAPP_WEB_ENABLED=false).";
      } else if (status.lastError) {
        reason = status.lastError;
      }
      return res.status(503).json({ qrCodeDataUrl: null, reason, status });
    }

    return res.json({ qrCodeDataUrl, status });
  } catch (error) {
    return res.status(503).json({
      qrCodeDataUrl: null,
      reason: error.message || "Falha ao inicializar WhatsApp Web.",
      status: getWhatsappStatus(),
    });
  }
});

module.exports = {
  googleAuthUrl,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
};
