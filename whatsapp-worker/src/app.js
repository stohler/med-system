const express = require("express");
const {
  getWhatsappStatus,
  getWhatsappQrCode,
  initWhatsApp,
  restartWhatsApp,
  resetWhatsAppSession,
  sendWhatsappNotification,
} = require("./services/whatsappService");
const { env } = require("./config/env");

function authMiddleware(req, res, next) {
  if (!env.workerAuthToken) {
    return next();
  }
  const headerToken = req.headers["x-worker-token"];
  const bearer = req.headers.authorization || "";
  const bearerToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  const providedToken = String(headerToken || bearerToken || "");
  if (!providedToken || providedToken !== env.workerAuthToken) {
    return res.status(401).json({ error: true, message: "Nao autorizado." });
  }
  return next();
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "whatsapp-worker" });
  });

  app.use(authMiddleware);

  app.get("/status", (_req, res) => {
    res.json(getWhatsappStatus());
  });

  app.get("/qr", async (_req, res) => {
    initWhatsApp().catch(() => null);
    const qrCodeDataUrl = await getWhatsappQrCode();
    const status = getWhatsappStatus();

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
      if (status.lastError) {
        reason = status.lastError;
      }
      return res.status(503).json({ qrCodeDataUrl: null, reason, status });
    }

    return res.json({ qrCodeDataUrl, status });
  });

  app.post("/restart", async (_req, res) => {
    const status = await restartWhatsApp();
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
      status,
    });
  });

  app.post("/reset-session", async (_req, res) => {
    const result = await resetWhatsAppSession();
    initWhatsApp().catch(() => null);
    return res.json({
      reset: true,
      message: "Sessao WhatsApp resetada. Gere um novo QR Code para conectar novamente.",
      status: result.status,
      removedPaths: result.removedPaths || [],
      warnings: result.warnings || [],
    });
  });

  app.post("/test-message", async (req, res) => {
    // eslint-disable-next-line no-console
    console.log(
      "[whatsapp-worker][test-message][request_payload]",
      JSON.stringify(req.body || null)
    );
    const phone = String(req.body.phone || "").trim();
    const text =
      String(req.body.text || "").trim() ||
      "Teste de envio do sistema clinico.";

    if (!phone) {
      return res.status(400).json({ sent: false, message: "Informe o numero para teste." });
    }

    const sent = await sendWhatsappNotification({ phone, text }).catch(() => false);
    if (!sent) {
      // eslint-disable-next-line no-console
      console.warn(
        "[whatsapp-worker][test-message][send_failed]",
        JSON.stringify({
          requestPayload: req.body || null,
          computedPayload: { phone, text },
          status: getWhatsappStatus(),
        })
      );
      return res.status(503).json({
        sent: false,
        message:
          "WhatsApp ainda nao esta pronto para envio. Verifique status da conexao antes de testar.",
        status: getWhatsappStatus(),
      });
    }
    return res.json({ sent: true, message: "Mensagem de teste enviada com sucesso." });
  });

  return app;
}

module.exports = { createApp };
