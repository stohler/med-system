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
let initPromise = null;
let initStartedAt = null;
const initTimeoutMs = Number(process.env.WHATSAPP_INIT_TIMEOUT_MS || 90000);

function logWhatsapp(level, event, metadata = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...metadata,
  };
  const message = `[whatsapp] ${JSON.stringify(payload)}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(message);
    return;
  }
  if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(message);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(message);
}

function memorySnapshot() {
  const toMb = (value) => Math.round((value / 1024 / 1024) * 10) / 10;
  const usage = process.memoryUsage();
  return {
    rssMb: toMb(usage.rss),
    heapUsedMb: toMb(usage.heapUsed),
    heapTotalMb: toMb(usage.heapTotal),
    externalMb: toMb(usage.external),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  logWhatsapp("info", "destroy_client_start");
  try {
    await client.destroy();
    logWhatsapp("info", "destroy_client_success");
  } catch (_error) {
    logWhatsapp("warn", "destroy_client_error", { message: _error?.message });
  } finally {
    client = null;
    ready = false;
    initializing = false;
    initPromise = null;
    initStartedAt = null;
    markState("idle");
  }
}

function markState(state) {
  connectionState = state;
  lastStateAt = new Date().toISOString();
}

async function initWhatsApp() {
  if (initPromise) {
    return initPromise;
  }

  if (initializing && initStartedAt && Date.now() - initStartedAt > initTimeoutMs + 15000) {
    logWhatsapp("warn", "init_stuck_detected", {
      runningMs: Date.now() - initStartedAt,
      state: connectionState,
    });
    await destroyClient();
    initializing = false;
  }

  if (forceWebUnavailable) {
    lastError =
      "WhatsApp Web desabilitado neste ambiente por limite de memoria/estabilidade.";
    logWhatsapp("warn", "init_skipped_force_unavailable", { lastError });
    return;
  }
  if (!env.whatsappEnabled || env.whatsappMode !== "web") return;
  if (!ClientLib || !LocalAuthLib || !env.whatsappWebEnabled) {
    lastError = "WhatsApp Web indisponivel no ambiente atual.";
    markState("unavailable");
    logWhatsapp("warn", "init_unavailable_environment", {
      libraryLoaded: Boolean(ClientLib && LocalAuthLib),
      webSessionEnabled: env.whatsappWebEnabled,
    });
    return;
  }
  if (initializing || client) return;

  initStartedAt = Date.now();
  initializing = true;
  lastError = "";
  markState("initializing");
  const executablePath = getChromiumPath();
  logWhatsapp("info", "init_start", { executablePath, initTimeoutMs, memory: memorySnapshot() });

  initPromise = (async () => {
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
          "--disable-gpu",
          "--no-zygote",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--mute-audio",
          "--disable-features=site-per-process,Translate,BackForwardCache,AcceptCHFrame,MediaRouter",
          "--window-size=1200,800",
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
      logWhatsapp("info", "event_qr_generated");
    });

    client.on("authenticated", () => {
      lastError = "";
      markState("authenticated");
      logWhatsapp("info", "event_authenticated");
    });

    client.on("loading_screen", (_percent, message) => {
      if (message) {
        lastError = `Conectando WhatsApp: ${message}`;
      }
      markState("loading");
      logWhatsapp("info", "event_loading", { message: message || "" });
    });

    client.on("ready", () => {
      ready = true;
      lastQrDataUrl = null;
      lastError = "";
      markState("ready");
      logWhatsapp("info", "event_ready");
    });

    client.on("auth_failure", (message) => {
      ready = false;
      lastError = message || "Falha de autenticacao WhatsApp.";
      markState("auth_failure");
      logWhatsapp("error", "event_auth_failure", { message: lastError });
    });

    client.on("disconnected", () => {
      ready = false;
      lastError = "Sessao WhatsApp desconectada.";
      markState("disconnected");
      logWhatsapp("warn", "event_disconnected");
    });

    client.on("change_state", (state) => {
      markState(String(state || "").toLowerCase() || "unknown");
      logWhatsapp("info", "event_change_state", { state });
      if (state === "CONFLICT" || state === "UNPAIRED") {
        ready = false;
      }
    });

    let timeoutHandle = null;
    try {
      await Promise.race([
        client.initialize(),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error("Timeout ao iniciar WhatsApp Web. Tente reiniciar a sessao."));
          }, initTimeoutMs);
        }),
      ]);
      logWhatsapp("info", "init_success", { memory: memorySnapshot() });
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
      logWhatsapp("error", "init_error", { message, state: connectionState, memory: memorySnapshot() });
      await destroyClient();
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      initializing = false;
      initStartedAt = null;
      initPromise = null;
    }
  })();

  return initPromise;
}

async function getWhatsappQrCode() {
  if (!env.whatsappEnabled || env.whatsappMode !== "web") {
    return null;
  }

  if (!client && !initializing) {
    await initWhatsApp();
  }

  if (initializing && !lastQrDataUrl) {
    // Espera curta para reduzir respostas prematuras 503 logo apos reinicio.
    for (let i = 0; i < 6; i += 1) {
      await sleep(500);
      if (lastQrDataUrl || ready || !initializing) break;
    }
  }

  return lastQrDataUrl;
}

async function restartWhatsApp() {
  logWhatsapp("info", "restart_requested");
  try {
    await destroyClient();
    lastQrDataUrl = null;
    lastError = "";
    markState("restarting");
    forceWebUnavailable = false;
    await initWhatsApp();
  } catch (error) {
    lastError = error?.message || "Falha ao reiniciar cliente WhatsApp.";
    markState("restart_error");
    logWhatsapp("error", "restart_error", { message: lastError });
  }
  const status = getWhatsappStatus();
  logWhatsapp("info", "restart_finished", { ...status, memory: memorySnapshot() });
  return status;
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
