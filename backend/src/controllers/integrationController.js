const { asyncHandler } = require("../utils/asyncHandler");
const axios = require("axios");
const crypto = require("crypto");
const { env } = require("../config/env");
const { User, Patient, WhatsAppMessage } = require("../models");
const {
  getGoogleAuthUrl,
  getGoogleTokens,
  saveGoogleTokensForUser,
  getGoogleConnectionStatusForUser,
  clearGoogleTokensForUser,
} = require("../services/googleCalendarService");
const {
  getWhatsappStatus,
  getWhatsappQrCode,
  initWhatsApp,
  restartWhatsApp,
  resetWhatsAppSession,
  sendWhatsappNotification,
} = require("../services/whatsappService");
const {
  whatsappPhoneMatchVariants,
  buildPatientPhoneMatchQuery,
} = require("../utils/whatsappPhoneMatch");

function serviceEndpoint(pathname) {
  let base = String(env.whatsappServiceBaseUrl || "").trim();
  if (!base) return "";
  try {
    const parsed = new URL(base);
    const hostname = String(parsed.hostname || "").toLowerCase();
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local");
    if (parsed.protocol === "http:" && !isLocalHost) {
      parsed.protocol = "https:";
      base = parsed.toString();
    }
  } catch (_error) {
    // Mantem valor original quando nao for URL parseavel.
  }
  return `${base.replace(/\/+$/, "")}${pathname}`;
}

function webhookBaseFromRequest(req) {
  const explicit = String(env.publicApiUrl || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "";
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
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

function signStateFragment(encodedPayload) {
  return crypto
    .createHmac("sha256", String(env.jwtSecret || "dev-secret-change-me"))
    .update(String(encodedPayload))
    .digest("base64url");
}

function parseStatePayload(rawState) {
  const fallback = {
    flow: String(rawState || "clinic-system"),
    frontendOrigin: "",
    userId: "",
    trusted: false,
  };
  const stateValue = String(rawState || "").trim();
  if (!stateValue) return fallback;

  const parts = stateValue.split(".");
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [encodedPayload, signature] = parts;
    const expectedSignature = signStateFragment(encodedPayload);
    if (signature !== expectedSignature) {
      return fallback;
    }
    try {
      const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        flow: String(parsed.flow || "clinic-system"),
        frontendOrigin: String(parsed.frontendOrigin || "").trim(),
        userId: String(parsed.userId || "").trim(),
        trusted: true,
      };
    } catch (_error) {
      return fallback;
    }
  }

  try {
    const decoded = Buffer.from(stateValue, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      flow: String(parsed.flow || "clinic-system"),
      frontendOrigin: String(parsed.frontendOrigin || "").trim(),
      userId: "",
      trusted: false,
    };
  } catch (_error) {
    return fallback;
  }
}

function serializeStatePayload(payload) {
  const safe = {
    flow: String(payload?.flow || "clinic-system"),
    frontendOrigin: String(payload?.frontendOrigin || "").trim(),
    userId: String(payload?.userId || "").trim(),
    issuedAt: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(safe), "utf8").toString(
    "base64url"
  );
  const signature = signStateFragment(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function normalizeOriginValue(origin) {
  const raw = String(origin || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function resolveWebhookUrl(req) {
  const explicit = String(env.whatsappWebhookUrl || "").trim();
  if (explicit) return explicit;
  const apiBase = webhookBaseFromRequest(req);
  if (!apiBase) return "";
  return `${apiBase}/api/integrations/whatsapp/webhook`;
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

function normalizePhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function normalizeIncomingWhatsappPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const withoutJid = raw.replace(/@c\.us$/i, "");
  const digits = withoutJid.replace(/\D/g, "");
  if (!digits) return "";
  return normalizePhoneNumber(digits);
}

function nestedIncomingMessage(body) {
  const m = body?.message;
  if (m && typeof m === "object" && !Array.isArray(m)) return m;
  return null;
}

function extractIncomingText(body) {
  const nested = nestedIncomingMessage(body);
  if (nested) {
    const t = nested.text ?? nested.body ?? nested.caption;
    if (t != null && String(t).trim() !== "") return String(t);
  }
  const topMessage = body?.message;
  return (
    body?.text ||
    (typeof topMessage === "string" ? topMessage : "") ||
    body?.body ||
    body?.data?.text ||
    (typeof body?.data?.message === "string" ? body.data.message : "") ||
    (body?.data?.message && typeof body.data.message === "object"
      ? String(body.data.message.text ?? body.data.message.body ?? body.data.message.caption ?? "")
      : "") ||
    body?.data?.body ||
    ""
  );
}

function isReadyButSendFailed(statusCode, data) {
  return (
    Number(statusCode) >= 500 &&
    data &&
    data.sent === false &&
    Boolean(data.status?.ready)
  );
}

async function requestWhatsappExternalService(
  req,
  { method, pathname, body, includeWebhook = false }
) {
  const url = serviceEndpoint(pathname);
  if (!url) {
    return null;
  }

  const token = String(env.whatsappServiceToken || "").trim();
  const webhookUrl = includeWebhook ? resolveWebhookUrl(req) : "";
  const payloadWithWebhook =
    method.toLowerCase() === "post" || method.toLowerCase() === "get"
      ? {
          ...(body || {}),
          ...(webhookUrl ? { webhookUrl } : {}),
        }
      : body;
  const lowerMethod = String(method || "get").toLowerCase();

  return axios({
    method,
    url,
    ...(lowerMethod === "get"
      ? { params: payloadWithWebhook }
      : { data: payloadWithWebhook }),
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
}

async function proxyWhatsappToExternalService(
  req,
  res,
  { method, pathname, body, includeWebhook = false }
) {
  if (!serviceEndpoint(pathname)) {
    return false;
  }

  try {
    const response = await requestWhatsappExternalService(req, {
      method,
      pathname,
      body,
      includeWebhook,
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
    userId: req.userId || req.user?._id?.toString?.() || "",
  });
  const url = getGoogleAuthUrl(oauthState);
  res.json({ url });
});

const googleCallback = asyncHandler(async (req, res) => {
  const rawState = String(req.query.state || "");
  const parsedState = parseStatePayload(rawState);
  const state = parsedState.flow;
  const stateUserId = String(parsedState.userId || "");
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
          message: "Google Calendar autorizado com sucesso.",
          error: null,
          tokens: null,
        };

        if (stateUserId && parsedState.trusted) {
          const user = await User.findById(stateUserId);
          if (user && user.active) {
            await saveGoogleTokensForUser(user, tokens);
            payload.message =
              "Google Calendar autorizado e vinculado ao usuario com sucesso.";
          } else {
            payload.message =
              "Google autorizado, mas nao foi possivel vincular ao usuario informado.";
          }
        } else {
          payload.message =
            "Google autorizado, mas sem vinculo de usuario confiavel no callback.";
        }
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
  if (!tokens) {
    return res.status(400).json({
      error: true,
      message: "Integracao Google nao configurada no servidor.",
      details: null,
    });
  }
  await saveGoogleTokensForUser(req.user, tokens);
  return res.json({ status: getGoogleConnectionStatusForUser(req.user) });
});

const googleStatus = asyncHandler(async (req, res) => {
  return res.json(getGoogleConnectionStatusForUser(req.user));
});

const googleDisconnect = asyncHandler(async (req, res) => {
  await clearGoogleTokensForUser(req.user);
  return res.json(getGoogleConnectionStatusForUser(req.user));
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
    includeWebhook: true,
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

const whatsappWebhook = asyncHandler(async (req, res) => {
  const inner = nestedIncomingMessage(req.body);
  const from =
    (inner && (inner.from || inner.fromPnJid || inner.fromJid)) ||
    req.body?.from ||
    req.body?.phone ||
    req.body?.sender ||
    req.body?.data?.from ||
    req.body?.data?.phone ||
    "";
  const normalizedFrom = normalizeIncomingWhatsappPhone(from);
  const text = String(extractIncomingText(req.body) || "").trim();
  const eventType = String(req.body?.event || req.body?.type || "incoming_message");
  const toRaw = inner?.to || req.body?.to || req.body?.data?.to || "";
  const toNormalized = toRaw ? normalizeIncomingWhatsappPhone(toRaw) : "";
  let receivedAt = new Date();
  if (req.body?.receivedAt) {
    const parsed = new Date(req.body.receivedAt);
    if (!Number.isNaN(parsed.getTime())) receivedAt = parsed;
  }

  let linkedPatientId = null;
  if (normalizedFrom) {
    const variants = whatsappPhoneMatchVariants(normalizedFrom);
    const matchQuery = buildPatientPhoneMatchQuery(variants);
    let patient = matchQuery
      ? await Patient.findOne(matchQuery).select("_id phoneNormalized phone")
      : null;
    if (patient?._id && !patient.phoneNormalized && patient.phone) {
      await Patient.updateOne(
        { _id: patient._id },
        { $set: { phoneNormalized: normalizePhoneNumber(patient.phone) } }
      ).catch(() => null);
    }
    if (patient?._id) {
      linkedPatientId = patient._id;
    }
  }

  if (text || normalizedFrom) {
    const providerMessageId =
      req.body?.messageId ||
      (inner && inner.id) ||
      req.body?.id ||
      req.body?.data?.id ||
      "";
    await WhatsAppMessage.create({
      patient: linkedPatientId,
      direction: "incoming",
      from: normalizedFrom || from,
      phoneNormalized: normalizedFrom,
      to: toNormalized || toRaw,
      text,
      providerMessageId: String(providerMessageId || ""),
      eventType,
      matchedBy: linkedPatientId ? "phone" : "unmatched",
      rawPayload: req.body,
      receivedAt,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    "[whatsapp][webhook] evento recebido",
    JSON.stringify({
      receivedAt: new Date().toISOString(),
      eventType,
      from: normalizedFrom || from,
      hasMessage: Boolean(text),
      linkedPatientId: linkedPatientId ? String(linkedPatientId) : null,
    })
  );
  res.status(200).json({ ok: true });
});

const whatsappTestMessage = asyncHandler(async (req, res) => {
  if (serviceEndpoint("/test-message")) {
    try {
      const response = await requestWhatsappExternalService(req, {
        method: "post",
        pathname: "/test-message",
        body: req.body,
        includeWebhook: true,
      });
      const data = response?.data || {};
      if (isReadyButSendFailed(response?.status, data)) {
        return res.status(422).json({
          sent: false,
          message:
            "Servico WhatsApp conectado, mas nao conseguiu enviar a mensagem de teste. Verifique se o numero esta no formato DDI+DDD+numero (somente digitos) e se o contato possui WhatsApp ativo.",
          status: data.status || null,
          details: {
            normalizedPhone: normalizePhoneNumber(req.body?.phone),
            providerMessage: data.message || "",
            providerConnectionState: data.status?.connectionState || "",
          },
        });
      }
      return res.status(response.status).json(data);
    } catch (error) {
      return res.status(503).json({
        error: true,
        message:
          error?.message ||
          "Falha ao conectar com servico dedicado do WhatsApp.",
        details: null,
      });
    }
  }

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
    includeWebhook: true,
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
    includeWebhook: true,
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
  googleStatus,
  googleDisconnect,
  whatsappStatus,
  whatsappQr,
  whatsappWebhook,
  whatsappTestMessage,
  whatsappRestart,
  whatsappResetSession,
};
