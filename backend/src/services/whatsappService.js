const qrcode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const { env } = require("../config/env");

let ClientLib = null;
let LocalAuthLib = null;
try {
  const wpp = require("whatsapp-web.js");
  ClientLib = wpp.Client;
  LocalAuthLib = wpp.LocalAuth;
} catch (_err) {
  ClientLib = null;
  LocalAuthLib = null;
}

let client;
let lastQrDataUrl = null;
let ready = false;
let initializing = false;
let lastError = "";
let forceWebUnavailable = false;
let connectionState = "idle";
let lastStateAt = null;
const initTimeoutMs = Number(process.env.WHATSAPP_INIT_TIMEOUT_MS || 90000);

function getChromiumPath() {
  const candidateFromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  const candidates = [
    candidateFromEnv,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);

  return candidates.find((path) => fs.existsSync(path));
}

function getWhatsappStatus() {
  return {
    enabled: env.whatsappEnabled,
    mode: env.whatsappMode,
    ready,
    hasQr: Boolean(lastQrDataUrl),
    initializing,
    webSessionEnabled: env.whatsappWebEnabled,
    libraryLoaded: Boolean(ClientLib && LocalAuthLib),
    lastError: lastError || null,
    connectionState,
    lastStateAt,
  };
}

async function destroyClient() {
  if (!client) return;
  try {
    await client.destroy();
  } catch (_error) {
    // noop
  } finally {
    client = null;
    ready = false;
    initializing = false;
  }
}

function markState(state) {
  connectionState = state;
  lastStateAt = new Date().toISOString();
}

async function initWhatsApp() {
  if (forceWebUnavailable) {
    lastError =
      "WhatsApp Web desabilitado neste ambiente por limite de memoria/estabilidade.";
    return;
  }
  if (!env.whatsappEnabled || env.whatsappMode !== "web") return;
  if (!ClientLib || !LocalAuthLib || !env.whatsappWebEnabled) {
    lastError = "WhatsApp Web indisponivel no ambiente atual.";
    markState("unavailable");
    return;
  }
  if (initializing || client) return;

  initializing = true;
  markState("initializing");
  const executablePath = getChromiumPath();
  client = new ClientLib({
    authStrategy: new LocalAuthLib({
      clientId: "clinic-system",
      dataPath: env.whatsappSessionPath,
    }),
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: {
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--disable-gpu",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--mute-audio",
      ],
      headless: true,
      executablePath,
    },
  });

  client.on("qr", async (qr) => {
    lastQrDataUrl = await qrcode.toDataURL(qr);
    ready = false;
    lastError = "";
    markState("qr");
  });

  client.on("authenticated", () => {
    lastError = "";
    markState("authenticated");
  });

  client.on("loading_screen", (_percent, message) => {
    if (message) {
      lastError = `Conectando WhatsApp: ${message}`;
    }
    markState("loading");
  });

  client.on("ready", () => {
    ready = true;
    lastQrDataUrl = null;
    lastError = "";
    markState("ready");
  });

  client.on("auth_failure", (message) => {
    ready = false;
    lastError = message || "Falha de autenticacao WhatsApp.";
    markState("auth_failure");
  });

  client.on("disconnected", () => {
    ready = false;
    lastError = "Sessao WhatsApp desconectada.";
    markState("disconnected");
  });

  client.on("change_state", (state) => {
    markState(String(state || "").toLowerCase() || "unknown");
    if (state === "CONFLICT" || state === "UNPAIRED") {
      ready = false;
    }
  });

  try {
    await Promise.race([
      client.initialize(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeout ao iniciar WhatsApp Web. Tente reiniciar a sessao."));
        }, initTimeoutMs);
      }),
    ]);
  } catch (error) {
    const message = error?.message || "Falha ao iniciar cliente WhatsApp.";
    lastError = message;
    if (/memory|ENOMEM|Target closed|browser has disconnected/i.test(message)) {
      forceWebUnavailable = true;
      lastError =
        "Memoria insuficiente para iniciar WhatsApp Web. Aumente memoria do Cloud Run para 2Gi ou use modo business.";
      markState("memory_error");
    } else if (/timeout/i.test(message)) {
      markState("init_timeout");
    } else {
      markState("init_error");
    }
    await destroyClient();
  } finally {
    initializing = false;
  }
}

async function getWhatsappQrCode() {
  if (!env.whatsappEnabled || env.whatsappMode !== "web") {
    return null;
  }

  if (!client && !initializing) {
    await initWhatsApp();
  }

  return lastQrDataUrl;
}

async function restartWhatsApp() {
  await destroyClient();
  lastQrDataUrl = null;
  lastError = "";
  markState("restarting");
  forceWebUnavailable = false;
  await initWhatsApp();
}

async function sendViaWhatsappBusiness({ phone, text }) {
  if (!env.whatsappBusinessToken || !env.whatsappPhoneNumberId) return false;

  const normalized = String(phone || "").replace(/\D/g, "");
  if (!normalized) return false;

  const url = `https://graph.facebook.com/v22.0/${env.whatsappPhoneNumberId}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${env.whatsappBusinessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return true;
}

async function sendWhatsappNotification({ phone, text }) {
  if (!env.whatsappEnabled || !phone || !text) return false;

  if (env.whatsappMode === "business") {
    return sendViaWhatsappBusiness({ phone, text });
  }

  if (!ready || !client) return false;
  const normalized = String(phone).replace(/\D/g, "");
  if (!normalized) return false;

  await client.sendMessage(`${normalized}@c.us`, text);
  return true;
}

module.exports = {
  getWhatsappStatus,
  initWhatsApp,
  getWhatsappQrCode,
  restartWhatsApp,
  sendWhatsappNotification,
};
