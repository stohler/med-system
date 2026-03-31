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
  await initWhatsApp();
  const qrCodeDataUrl = await getWhatsappQrCode();
  res.json({ qrCodeDataUrl });
});

module.exports = {
  googleAuthUrl,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
};
