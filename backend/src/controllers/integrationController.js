const { asyncHandler } = require("../utils/asyncHandler");
const axios = require("axios");
const { env } = require("../config/env");
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

function serviceEndpoint(pathname) {
  const base = String(env.whatsappServiceBaseUrl || "").trim();
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}${pathname}`;
}

function normalizePostMessageOrigins() {
  const rawOrigins = Array.isArray(env.frontendOrigins)
    ? env.frontendOrigins
    : [env.frontendOrigin];
  const normalized = new Set();
  for (const origin of rawOrigins) {
    const raw = String(origin || "").trim().replace(/\/+$/, "");
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) {
      normalized.add(raw);
      continue;
    }
    normalized.add(`https://${raw}`);
    normalized.add(`http://${raw}`);
  }
  return [...normalized];
}

function parseStatePayload(rawState) {
  const fallback = { flow: String(rawState || "clinic-system"), frontendOrigin: "" };
  const stateValue = String(rawState || "").trim();
  if (!stateValue) return fallback;
  try {
    const decoded = Buffer.from(stateValue, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") return fallback;
    const flow = String(parsed.flow || "clinic-system");
    const frontendOrigin = String(parsed.frontendOrigin || "").trim();
    return { flow, frontendOrigin };
  } catch (_error) {
    return fallback;
  }
}

function serializeStatePayload(payload) {
  const safe = {
    flow: String(payload?.flow || "clinic-system"),
    frontendOrigin: String(payload?.frontendOrigin || "").trim(),
  };
  return Buffer.from(JSON.stringify(safe), "utf8").toString("base64url");
}

function normalizeOriginValue(origin) {
  const raw = String(origin || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function computeOAuthFrontendOrigin(req) {
  const requestOrigin = normalizeOriginValue(req.headers.origin || "");
  if (requestOrigin) return requestOrigin;
  const knownOrigins = normalizePostMessageOrigins();
  const preferredKnown =
    knownOrigins.find((item) => String(item).startsWith("https://")) ||
    knownOrigins[0] ||
    "";
  return preferredKnown;
}

function buildIntegrationsUrl(frontendOrigin, payload) {
  const origin = normalizeOriginValue(frontendOrigin);
  if (!origin) return "";
  const params = new URLSearchParams();
  params.set("google_oauth", payload?.ok ? "connected" : "error");
  params.set("google_oauth_at", new Date().toISOString());
  if (payload?.message) {
    params.set("google_oauth_message", String(payload.message));
  }
  return `${origin.replace(/\/+$/, "")}/integrations?${params.toString()}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function proxyWhatsappToExternalService(req, res, { method, pathname, body }) {
  const url = serviceEndpoint(pathname);
  if (!url) {
    return false;
  }

  const token = String(env.whatsappServiceToken || "").trim();

  try {
    const response = await axios({
      method,
      url,
      data: body,
      timeout: 180000,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              "x-worker-token": token,
              "x-service-token": token,
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
    return true;
  } catch (error) {
    res.status(503).json({
      error: true,
      message:
        error?.message ||
        "Falha ao conectar com servico dedicado do WhatsApp.",
      details: null,
    });
    return true;
  }
}

const googleAuthUrl = asyncHandler(async (req, res) => {
  const frontendOrigin = computeOAuthFrontendOrigin(req);
  const oauthState = serializeStatePayload({
    flow: "clinic-system",
    frontendOrigin,
  });
  const url = getGoogleAuthUrl(oauthState);
  res.json({ url });
});

const googleCallback = asyncHandler(async (req, res) => {
  const rawState = String(req.query.state || "");
  const parsedState = parseStatePayload(rawState);
  const state = parsedState.flow;
  const stateFrontendOrigin = normalizeOriginValue(parsedState.frontendOrigin);
  const oauthError = String(req.query.error || "");
  const code = String(req.query.code || "");

  let payload = {
    ok: false,
    state,
    message: "Falha ao concluir autorizacao com Google Calendar.",
    error: null,
    tokens: null,
  };

  if (oauthError) {
    payload = {
      ...payload,
      error: oauthError,
      message: `Google retornou erro de autorizacao: ${oauthError}`,
    };
  } else if (!code) {
    payload = {
      ...payload,
      error: "missing_code",
      message: "Codigo de autorizacao nao informado no callback.",
    };
  } else {
    try {
      const tokens = await getGoogleTokens(code);
      if (!tokens) {
        payload = {
          ...payload,
          error: "google_not_configured",
          message:
            "Integracao Google nao configurada no servidor. Verifique GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.",
        };
      } else {
        payload = {
          ok: true,
          state,
          message:
            "Google Calendar autorizado com sucesso. Volte para a tela de Integracoes.",
          error: null,
          tokens,
        };
      }
    } catch (error) {
      payload = {
        ...payload,
        error: "token_exchange_failed",
        message:
          error?.message ||
          "Nao foi possivel trocar o codigo por token do Google.",
      };
    }
  }

  const targets = [...new Set([stateFrontendOrigin, ...normalizePostMessageOrigins()].filter(Boolean))];
  const preferredFrontendOrigin =
    targets.find((item) => String(item).startsWith("https://")) || targets[0] || "";
  const integrationsUrl = buildIntegrationsUrl(preferredFrontendOrigin, payload);
  const safePayloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const safeTargetsJson = JSON.stringify(targets).replace(/</g, "\\u003c");
  const safeIntegrationsUrlJson = JSON.stringify(integrationsUrl).replace(
    /</g,
    "\\u003c"
  );
  const safeIntegrationsUrlAttr = escapeHtml(integrationsUrl || "#");
  const statusColor = payload.ok ? "#166534" : "#991b1b";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(payload.ok ? 200 : 400).send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Calendar - Integracao</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
      .card { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
      h1 { margin: 0 0 10px; font-size: 20px; color: ${statusColor}; }
      p { margin: 0 0 10px; line-height: 1.45; }
      pre { background: #f1f5f9; border-radius: 8px; padding: 10px; overflow: auto; font-size: 12px; }
      .muted { color: #64748b; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${payload.ok ? "Integracao concluida" : "Falha na integracao"}</h1>
      <p>${payload.message}</p>
      <p class="muted">Esta janela pode ser fechada.</p>
      <p class="muted"><a id="go-integrations" href="${safeIntegrationsUrlAttr}">Voltar para Integracoes</a></p>
      <pre id="payload"></pre>
    </div>
    <script>
      (function () {
        var payload = ${safePayloadJson};
        var targets = ${safeTargetsJson};
        var integrationsUrl = ${safeIntegrationsUrlJson};
        var pre = document.getElementById("payload");
        var integrationsAnchor = document.getElementById("go-integrations");
        pre.textContent = JSON.stringify(payload, null, 2);
        var goToIntegrations = function () {
          if (window.opener && integrationsUrl) {
            try {
              window.opener.location.replace(integrationsUrl);
              window.opener.focus();
            } catch (_error) {}
            try {
              window.close();
            } catch (_error) {}
          }
          if (integrationsUrl) {
            window.location.replace(integrationsUrl);
            return;
          }
          window.location.replace("/");
        };

        if (integrationsAnchor) {
          integrationsAnchor.addEventListener("click", function (event) {
            event.preventDefault();
            goToIntegrations();
          });
        }

        if (window.opener) {
          for (var i = 0; i < targets.length; i += 1) {
            try {
              window.opener.postMessage(
                { source: "med-google-oauth", payload: payload },
                targets[i]
              );
            } catch (_error) {}
          }
          setTimeout(function () {
            try { window.close(); } catch (_error) {}
            if (!window.closed && integrationsUrl) {
              window.location.replace(integrationsUrl);
            }
          }, 300);
          return;
        }

        if (integrationsUrl) {
          setTimeout(function () {
            window.location.replace(integrationsUrl);
          }, 1200);
        }
      })();
    </script>
  </body>
</html>`);
});

const googleTokenExchange = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const tokens = await getGoogleTokens(code);
  res.json({ tokens });
});

const whatsappStatus = asyncHandler(async (_req, res) => {
  const proxied = await proxyWhatsappToExternalService(_req, res, {
    method: "get",
    pathname: "/status",
  });
  if (proxied) return;
  res.json(getWhatsappStatus());
});

const whatsappQr = asyncHandler(async (req, res) => {
  const proxied = await proxyWhatsappToExternalService(req, res, {
    method: "get",
    pathname: "/qr",
  });
  if (proxied) return;
  try {
    // eslint-disable-next-line no-console
    console.log("[whatsapp] solicitacao de QR recebida");
    // Nao bloquear a request aguardando init completa.
    initWhatsApp().catch(() => null);
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
  const proxied = await proxyWhatsappToExternalService(req, res, {
    method: "post",
    pathname: "/test-message",
    body: req.body,
  });
  if (proxied) return;

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
  const proxied = await proxyWhatsappToExternalService(_req, res, {
    method: "post",
    pathname: "/restart",
  });
  if (proxied) return;

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
  const proxied = await proxyWhatsappToExternalService(_req, res, {
    method: "post",
    pathname: "/reset-session",
  });
  if (proxied) return;

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
  googleCallback,
  googleTokenExchange,
  whatsappStatus,
  whatsappQr,
  whatsappTestMessage,
  whatsappRestart,
  whatsappResetSession,
};
