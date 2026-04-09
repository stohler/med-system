const { asyncHandler } = require("../utils/asyncHandler");
const {
  getGoogleAuthUrl,
  getGoogleTokens,
} = require("../services/googleCalendarService");
const {
  getWhatsappStatus,
  getWhatsappQrCode,
  initWhatsApp,
  restartWhatsApp,
  resetWhatsAppSession,
  sendWhatsappNotification,
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
    // eslint-disable-next-line no-console
    console.log("[whatsapp] solicitacao de QR recebida");
    await initWhatsApp();
    const qrCodeDataUrl = await getWhatsappQrCode();
    const status = getWhatsappStatus();
    // eslint-disable-next-line no-console
    console.log("[whatsapp] status apos requisicao QR", status);

    if (!qrCodeDataUrl) {
      if (status.ready) {
        return res.json({
          qrCodeDataUrl: null,
          reason: "WhatsApp ja conectado. Use o teste de envio para validar a sessao.",
          status,
        });
      }

      const inProgressStates = new Set([
        "initializing",
        "restarting",
        "loading",
        "authenticated",
        "session_reset",
      ]);
      if (status.initializing || inProgressStates.has(status.connectionState)) {
        return res.json({
          qrCodeDataUrl: null,
          reason: "WhatsApp Web esta inicializando. Aguarde alguns segundos e tente novamente.",
          status,
        });
      }

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

const whatsappTestMessage = asyncHandler(async (req, res) => {
  const phone = String(req.body.phone || "").trim();
  const text =
    String(req.body.text || "").trim() ||
    "Teste de envio do sistema clinico.";

  if (!phone) {
    return res.status(400).json({ sent: false, message: "Informe o numero para teste." });
  }

  try {
    const sent = await sendWhatsappNotification({ phone, text });
    if (!sent) {
      return res.status(503).json({
        sent: false,
        message:
          "WhatsApp ainda nao esta pronto para envio. Verifique status da conexao antes de testar.",
        status: getWhatsappStatus(),
      });
    }
    return res.json({ sent: true, message: "Mensagem de teste enviada com sucesso." });
  } catch (error) {
    return res.status(503).json({
      sent: false,
      message: error?.message || "Falha ao enviar mensagem de teste.",
      status: getWhatsappStatus(),
    });
  }
});

const whatsappRestart = asyncHandler(async (_req, res) => {
  // eslint-disable-next-line no-console
  console.log("[whatsapp] solicitacao de reinicio recebida");
  const status = await restartWhatsApp();
  // eslint-disable-next-line no-console
  console.log("[whatsapp] status apos reinicio", status);
  if (!status.ready && status.lastError) {
    return res.status(503).json({
      restarted: false,
      message: `Reinicio concluido com alerta: ${status.lastError}`,
      status,
    });
  }
  return res.json({
    restarted: true,
    message: "Cliente WhatsApp reiniciado. Gere um novo QR Code e escaneie novamente.",
    status: status || getWhatsappStatus(),
  });
});

const whatsappResetSession = asyncHandler(async (_req, res) => {
  // eslint-disable-next-line no-console
  console.log("[whatsapp] solicitacao de reset de sessao recebida");
  const result = await resetWhatsAppSession();
  initWhatsApp().catch(() => null);
  return res.json({
    reset: true,
    message:
      "Sessao WhatsApp resetada. Gere um novo QR Code para conectar novamente.",
    status: result.status || getWhatsappStatus(),
    removedPaths: result.removedPaths || [],
    warnings: result.warnings || [],
  });
});

module.exports = {
  googleAuthUrl,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
  whatsappTestMessage,
  whatsappRestart,
  whatsappResetSession,
};
