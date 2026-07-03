const qrcode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
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
let forceUnavailableUntil = null;
let connectionState = "idle";
let lastStateAt = null;
let initPromise = null;
let initStartedAt = null;
const initTimeoutMs = Number(process.env.WHATSAPP_INIT_TIMEOUT_MS || 300000);

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

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
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
    cooldownUntil: forceUnavailableUntil ? new Date(forceUnavailableUntil).toISOString() : null,
  };
}

function resolveSessionPath(targetPath) {
  if (!targetPath) return null;
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.resolve(process.cwd(), targetPath);
}

function getSessionTargets() {
  const configured = env.whatsappSessionPath || ".wwebjs_auth";
  const targets = [configured, ".wwebjs_cache"];
  const unique = [...new Set(targets.filter(Boolean))];
  return unique.map(resolveSessionPath).filter(Boolean);
}

function getSessionLockTargets() {
  const baseSessionPath = resolveSessionPath(env.whatsappSessionPath || ".wwebjs_auth");
  const profilePath = path.join(baseSessionPath, "session-clinic-system");
  return [
    path.join(profilePath, "SingletonLock"),
    path.join(profilePath, "SingletonSocket"),
    path.join(profilePath, "SingletonCookie"),
    path.join(baseSessionPath, "SingletonLock"),
    path.join(baseSessionPath, "SingletonSocket"),
    path.join(baseSessionPath, "SingletonCookie"),
  ];
}

async function cleanupSessionLocks() {
  const removed = [];
  for (const lockPath of getSessionLockTargets()) {
    try {
      await fs.promises.rm(lockPath, { force: true });
      removed.push(lockPath);
    } catch (_error) {
      // ignore lock cleanup errors
    }
  }
  if (removed.length > 0) {
    logWhatsapp("warn", "session_locks_removed", { count: removed.length });
  }
}

async function killOrphanChromiumProcesses() {
  try {
    await execFileAsync("pkill", ["-f", "session-clinic-system"], { timeout: 4000 });
    logWhatsapp("warn", "orphan_chromium_killed", { matcher: "session-clinic-system" });
  } catch (error) {
    // pkill exits with code 1 when no process matches; this is expected.
    if (error?.code !== 1) {
      logWhatsapp("warn", "orphan_chromium_kill_error", { message: error?.message });
    }
  }
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
    await cleanupSessionLocks();
    await killOrphanChromiumProcesses();
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
    forceUnavailableUntil =
      forceUnavailableUntil || Date.now() + 5 * 60 * 1000;
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
    const launchProfiles = [
      {
        name: "default",
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
      },
      {
        name: "fallback-single-process",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--mute-audio",
          "--window-size=1200,800",
        ],
      },
    ];

    for (let profileIndex = 0; profileIndex < launchProfiles.length; profileIndex += 1) {
      const profile = launchProfiles[profileIndex];
      markState(profileIndex === 0 ? "initializing" : "retrying_init");
      logWhatsapp("info", "init_attempt", {
        attempt: profileIndex + 1,
        profile: profile.name,
      });

      await cleanupSessionLocks();
      await killOrphanChromiumProcesses();

      client = new ClientLib({
      authStrategy: new LocalAuthLib({
        clientId: "clinic-system",
        dataPath: env.whatsappSessionPath,
      }),
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
      puppeteer: {
        args: profile.args,
        headless: true,
        executablePath,
        timeout: initTimeoutMs,
        protocolTimeout: initTimeoutMs,
        pipe: true,
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
              reject(
                new Error("Timeout ao iniciar WhatsApp Web. Tente reiniciar a sessao.")
              );
            }, initTimeoutMs);
          }),
        ]);
        logWhatsapp("info", "init_success", {
          memory: memorySnapshot(),
          profile: profile.name,
        });
        return;
      } catch (error) {
        const message = error?.message || "Falha ao iniciar cliente WhatsApp.";
        lastError = message;
        if (/memory|ENOMEM|out of memory|Cannot allocate memory/i.test(message)) {
          forceWebUnavailable = true;
          forceUnavailableUntil = Date.now() + 5 * 60 * 1000;
          lastError =
            "Memoria insuficiente para iniciar WhatsApp Web. Aumente memoria do Cloud Run para 2Gi ou use modo business.";
          markState("memory_error");
        } else if (/timeout/i.test(message)) {
          markState("init_timeout");
        } else {
          markState("init_error");
        }
        logWhatsapp("error", "init_error", {
          message,
          state: connectionState,
          memory: memorySnapshot(),
          profile: profile.name,
        });
        await destroyClient();

        const canRetry = profileIndex < launchProfiles.length - 1;
        const isRetryable =
          /timeout|Target closed|browser has disconnected|Protocol error|browser is already running|userDataDir/i.test(
            message
          );
        if (isRetryable) {
          await cleanupSessionLocks();
          await killOrphanChromiumProcesses();
        }
        if (canRetry && isRetryable) {
          logWhatsapp("warn", "init_retry_next_profile", {
            nextProfile: launchProfiles[profileIndex + 1].name,
          });
          continue;
        }
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    }
  })()
    .finally(() => {
      initializing = false;
      initStartedAt = null;
      initPromise = null;
    });

  return initPromise;
}

async function getWhatsappQrCode() {
  if (!env.whatsappEnabled || env.whatsappMode !== "web") {
    return null;
  }

  if (!client && !initializing) {
    initWhatsApp().catch((error) => {
      logWhatsapp("error", "init_background_error", {
        message: error?.message || "falha em init em background",
      });
    });
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
    await cleanupSessionLocks();
    await killOrphanChromiumProcesses();
    lastQrDataUrl = null;
    lastError = "";
    markState("restarting");
    forceWebUnavailable = false;
    forceUnavailableUntil = null;
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

async function resetWhatsAppSession() {
  logWhatsapp("warn", "session_reset_requested", { memory: memorySnapshot() });
  await destroyClient();
  await cleanupSessionLocks();
  await killOrphanChromiumProcesses();

  const removedPaths = [];
  const warnings = [];
  for (const target of getSessionTargets()) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
      removedPaths.push(target);
      logWhatsapp("info", "session_path_removed", { target });
    } catch (error) {
      warnings.push({ target, message: error?.message || "erro ao remover caminho" });
      logWhatsapp("warn", "session_path_remove_error", {
        target,
        message: error?.message,
      });
    }
  }

  lastQrDataUrl = null;
  ready = false;
  initializing = false;
  initPromise = null;
  initStartedAt = null;
  forceWebUnavailable = false;
  forceUnavailableUntil = null;
  lastError = "";
  markState("session_reset");

  const status = getWhatsappStatus();
  logWhatsapp("info", "session_reset_finished", {
    removedCount: removedPaths.length,
    warningsCount: warnings.length,
    memory: memorySnapshot(),
  });

  return { status, removedPaths, warnings };
}

async function sendViaWhatsappBusiness({ phone, text }) {
  if (!env.whatsappBusinessToken || !env.whatsappPhoneNumberId) return false;

  const normalized = normalizeWhatsappPhone(phone);
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

function normalizeWhatsappPhone(phone) {
  const digitsOnly = String(phone || "").replace(/\D/g, "");
  if (!digitsOnly) return "";
  if (digitsOnly.startsWith("55")) return digitsOnly;
  return `55${digitsOnly}`;
}

function formatWhatsappServicePhone(phone) {
  const normalized = normalizeWhatsappPhone(phone);
  return normalized ? `+${normalized}` : "";
}

function normalizeWhatsappServiceBaseUrl() {
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
  return base.replace(/\/+$/, "");
}

function maskPhoneForLog(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function resolveWhatsappWebhookUrl(webhookUrl) {
  const explicit = String(webhookUrl || env.whatsappWebhookUrl || "").trim();
  if (explicit) return explicit;
  const publicApi = String(env.publicApiUrl || "").trim();
  if (!publicApi) return "";
  return `${publicApi.replace(/\/+$/, "")}/api/integrations/whatsapp/webhook`;
}

async function sendViaWhatsappService({ phone, text, webhookUrl }) {
  const base = normalizeWhatsappServiceBaseUrl();
  if (!base) return false;

  const token = String(env.whatsappServiceToken || "").trim();
  const resolvedWebhookUrl = resolveWhatsappWebhookUrl(webhookUrl);
  const workerUrl = `${base}/send-text`;
  const servicePhone = formatWhatsappServicePhone(phone);
  const payload = {
    phone: servicePhone,
    text,
    ...(resolvedWebhookUrl ? { webhookUrl: resolvedWebhookUrl } : {}),
  };
  const response = await axios({
    method: "post",
    url: workerUrl,
    data: payload,
    timeout: 180000,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            "x-service-token": token,
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
    validateStatus: () => true,
  });

  return {
    sent: Boolean(response?.data?.sent),
    provider: "service",
    httpStatus: Number(response?.status || 0),
    providerPayload: response?.data ?? null,
    workerRequestPayload: payload,
    workerResponsePayload: response?.data ?? null,
    workerUrl,
    webhookConfigured: Boolean(resolvedWebhookUrl),
  };
}

async function sendWhatsappNotificationDetailed({ phone, text, webhookUrl, source = "unknown" }) {
  if (!env.whatsappEnabled || !phone || !text) {
    return {
      sent: false,
      provider: "none",
      reason: "invalid_payload_or_disabled",
    };
  }

  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) {
    return {
      sent: false,
      provider: "none",
      reason: "invalid_phone",
    };
  }

  if (normalizeWhatsappServiceBaseUrl()) {
    try {
      const result = await sendViaWhatsappService({ phone: normalized, text, webhookUrl });
      if (!result.sent) {
        logWhatsapp("warn", "provider_service_send_failed", {
          source,
          phone: maskPhoneForLog(normalized),
          httpStatus: result.httpStatus,
          webhookConfigured: result.webhookConfigured,
          workerUrl: result.workerUrl || "",
          workerRequestPayload: result.workerRequestPayload || null,
          workerResponsePayload: result.workerResponsePayload || null,
          providerPayload: result.providerPayload,
        });
      }
      return result;
    } catch (error) {
      const httpStatus = Number(error?.response?.status || 0);
      const workerUrl = `${normalizeWhatsappServiceBaseUrl()}/send-text`;
      const resolvedWebhookUrl = resolveWhatsappWebhookUrl(webhookUrl);
      const servicePhone = formatWhatsappServicePhone(normalized);
      const workerRequestPayload = {
        phone: servicePhone,
        text,
        ...(resolvedWebhookUrl ? { webhookUrl: resolvedWebhookUrl } : {}),
      };
      const providerPayload = error?.response?.data ?? null;
      logWhatsapp("error", "provider_service_send_error", {
        source,
        phone: maskPhoneForLog(normalized),
        httpStatus,
        error: error?.message || "unknown_error",
        workerUrl,
        workerRequestPayload,
        workerResponsePayload: providerPayload,
        providerPayload,
      });
      return {
        sent: false,
        provider: "service",
        reason: "request_error",
        httpStatus,
        providerPayload,
        workerUrl,
        workerRequestPayload,
        workerResponsePayload: providerPayload,
      };
    }
  }

  if (env.whatsappMode === "business") {
    try {
      await sendViaWhatsappBusiness({ phone: normalized, text });
      return { sent: true, provider: "business" };
    } catch (error) {
      const httpStatus = Number(error?.response?.status || 0);
      const providerPayload = error?.response?.data ?? null;
      logWhatsapp("error", "provider_business_send_error", {
        source,
        phone: maskPhoneForLog(normalized),
        httpStatus,
        error: error?.message || "unknown_error",
        providerPayload,
      });
      return {
        sent: false,
        provider: "business",
        reason: "request_error",
        httpStatus,
        providerPayload,
      };
    }
  }

  if (!ready || !client) {
    const status = getWhatsappStatus();
    logWhatsapp("warn", "provider_web_not_ready", {
      source,
      phone: maskPhoneForLog(normalized),
      status: {
        ready: status.ready,
        connectionState: status.connectionState,
        lastError: status.lastError,
      },
    });
    return {
      sent: false,
      provider: "web",
      reason: "not_ready",
      providerPayload: {
        status: {
          ready: status.ready,
          connectionState: status.connectionState,
          lastError: status.lastError || "",
        },
      },
    };
  }

  try {
    await client.sendMessage(`${normalized}@c.us`, text);
    return { sent: true, provider: "web" };
  } catch (error) {
    logWhatsapp("error", "provider_web_send_error", {
      source,
      phone: maskPhoneForLog(normalized),
      error: error?.message || "unknown_error",
    });
    return {
      sent: false,
      provider: "web",
      reason: "send_error",
      providerPayload: { message: error?.message || "unknown_error" },
    };
  }
}

async function sendWhatsappNotification({ phone, text, webhookUrl }) {
  const result = await sendWhatsappNotificationDetailed({
    phone,
    text,
    webhookUrl,
    source: "generic",
  });
  return Boolean(result?.sent);
}

module.exports = {
  getWhatsappStatus,
  initWhatsApp,
  getWhatsappQrCode,
  restartWhatsApp,
  resetWhatsAppSession,
  sendWhatsappNotification,
  sendWhatsappNotificationDetailed,
  _private: {
    normalizeWhatsappPhone,
    formatWhatsappServicePhone,
  },
};
