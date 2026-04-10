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
const initHeartbeatMs = Number(process.env.WHATSAPP_INIT_HEARTBEAT_MS || 15000);
const resetSessionOnInitTimeout =
  String(process.env.WHATSAPP_RESET_SESSION_ON_INIT_TIMEOUT || "true") ===
  "true";
const puppeteerDumpio =
  String(process.env.WHATSAPP_PUPPETEER_DUMPIO || "false") === "true";

function logWhatsapp(level, event, metadata = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...metadata,
  };
  const message = `[whatsapp-worker] ${JSON.stringify(payload)}`;
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
  const candidateFromEnv =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  const candidates = [
    candidateFromEnv,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);

  return candidates.find((filePath) => fs.existsSync(filePath));
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
    cooldownUntil: forceUnavailableUntil
      ? new Date(forceUnavailableUntil).toISOString()
      : null,
  };
}

function resolveSessionPath(targetPath) {
  if (!targetPath) return null;
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.resolve(process.cwd(), targetPath);
}

function getSessionTargets() {
  const configured = env.whatsappSessionPath || "/tmp/.wwebjs_auth";
  const targets = [
    configured,
    "/tmp/.wwebjs_cache",
    ".wwebjs_cache",
    "/app/.wwebjs_cache",
  ];
  const unique = [...new Set(targets.filter(Boolean))];
  return unique.map(resolveSessionPath).filter(Boolean);
}

function getSessionLockTargets() {
  const baseSessionPath = resolveSessionPath(
    env.whatsappSessionPath || "/tmp/.wwebjs_auth"
  );
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
      // ignore cleanup errors
    }
  }
  if (removed.length > 0) {
    logWhatsapp("warn", "session_locks_removed", { count: removed.length });
  }
}

async function clearSessionDirectories(reason = "manual_reset") {
  const removedPaths = [];
  const warnings = [];
  for (const target of getSessionTargets()) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
      removedPaths.push(target);
    } catch (error) {
      warnings.push({ target, message: error?.message || "erro ao remover caminho" });
    }
  }

  logWhatsapp("warn", "session_directories_cleared", {
    reason,
    removedCount: removedPaths.length,
    warningCount: warnings.length,
  });
  return { removedPaths, warnings };
}

async function killOrphanChromiumProcesses() {
  try {
    await execFileAsync("pkill", ["-f", "session-clinic-system"], {
      timeout: 4000,
    });
    logWhatsapp("warn", "orphan_chromium_killed", {
      matcher: "session-clinic-system",
    });
  } catch (error) {
    if (error?.code !== 1) {
      logWhatsapp("warn", "orphan_chromium_kill_error", {
        message: error?.message,
      });
    }
  }
}

async function destroyClient() {
  if (!client) return;
  logWhatsapp("info", "destroy_client_start");
  try {
    await client.destroy();
    logWhatsapp("info", "destroy_client_success");
  } catch (error) {
    logWhatsapp("warn", "destroy_client_error", { message: error?.message });
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
  if (initPromise) return initPromise;

  if (
    initializing &&
    initStartedAt &&
    Date.now() - initStartedAt > initTimeoutMs + 15000
  ) {
    await destroyClient();
    initializing = false;
  }

  if (forceWebUnavailable) {
    lastError =
      "WhatsApp Web desabilitado neste ambiente por limite de memoria/estabilidade.";
    forceUnavailableUntil = forceUnavailableUntil || Date.now() + 5 * 60 * 1000;
    return;
  }
  if (!env.whatsappEnabled || env.whatsappMode !== "web") return;
  if (!ClientLib || !LocalAuthLib || !env.whatsappWebEnabled) {
    lastError = "WhatsApp Web indisponivel no ambiente atual.";
    markState("unavailable");
    return;
  }
  if (initializing || client) return;

  initStartedAt = Date.now();
  initializing = true;
  lastError = "";
  markState("initializing");
  const executablePath = getChromiumPath();
  logWhatsapp("info", "init_start", {
    executablePath,
    initTimeoutMs,
    initHeartbeatMs,
    resetSessionOnInitTimeout,
    memory: memorySnapshot(),
  });

  initPromise = (async () => {
    const launchProfiles = [
      {
        name: "default",
        pipe: true,
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
        pipe: true,
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
      {
        name: "fallback-websocket-transport",
        pipe: false,
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
          "--remote-debugging-port=0",
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
          pipe: profile.pipe,
          dumpio: puppeteerDumpio,
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
        if (message) lastError = `Conectando WhatsApp: ${message}`;
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

      let timeoutHandle = null;
      let heartbeatHandle = null;
      try {
        heartbeatHandle = setInterval(() => {
          logWhatsapp("info", "init_waiting", {
            profile: profile.name,
            state: connectionState,
            ready,
            hasQr: Boolean(lastQrDataUrl),
            elapsedMs: initStartedAt ? Date.now() - initStartedAt : null,
            memory: memorySnapshot(),
          });
        }, initHeartbeatMs);

        await Promise.race([
          client.initialize(),
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error("Timeout ao iniciar WhatsApp Web. Tente reiniciar a sessao."));
            }, initTimeoutMs);
          }),
        ]);
        logWhatsapp("info", "init_success", { profile: profile.name });
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
          profile: profile.name,
          state: connectionState,
          memory: memorySnapshot(),
          stack: error?.stack || null,
        });
        await destroyClient();

        const canRetry = profileIndex < launchProfiles.length - 1;
        const isRetryable =
          /timeout|Target closed|browser has disconnected|Protocol error|browser is already running|userDataDir/i.test(
            message
          );
        if (isRetryable && /timeout/i.test(message) && resetSessionOnInitTimeout) {
          await clearSessionDirectories("init_timeout_retry");
        }
        if (isRetryable) {
          await cleanupSessionLocks();
          await killOrphanChromiumProcesses();
        }
        if (canRetry && isRetryable) {
          logWhatsapp("warn", "init_retry_next_profile", {
            nextProfile: launchProfiles[profileIndex + 1]?.name || null,
          });
          continue;
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (heartbeatHandle) clearInterval(heartbeatHandle);
      }
    }
  })().finally(() => {
    initializing = false;
    initStartedAt = null;
    initPromise = null;
  });

  return initPromise;
}

async function getWhatsappQrCode() {
  if (!env.whatsappEnabled || env.whatsappMode !== "web") return null;

  if (!client && !initializing) {
    initWhatsApp().catch((error) => {
      logWhatsapp("error", "init_background_error", {
        message: error?.message || "falha em init em background",
      });
    });
  }

  if (initializing && !lastQrDataUrl) {
    for (let i = 0; i < 6; i += 1) {
      await sleep(500);
      if (lastQrDataUrl || ready || !initializing) break;
    }
  }

  return lastQrDataUrl;
}

async function restartWhatsApp() {
  await destroyClient();
  await cleanupSessionLocks();
  await killOrphanChromiumProcesses();
  lastQrDataUrl = null;
  lastError = "";
  markState("restarting");
  forceWebUnavailable = false;
  forceUnavailableUntil = null;
  await initWhatsApp();
  return getWhatsappStatus();
}

async function resetWhatsAppSession() {
  await destroyClient();
  await cleanupSessionLocks();
  await killOrphanChromiumProcesses();

  const { removedPaths, warnings } = await clearSessionDirectories("manual_reset");

  lastQrDataUrl = null;
  ready = false;
  initializing = false;
  initPromise = null;
  initStartedAt = null;
  forceWebUnavailable = false;
  forceUnavailableUntil = null;
  lastError = "";
  markState("session_reset");

  return { status: getWhatsappStatus(), removedPaths, warnings };
}

async function sendViaWhatsappBusiness({ phone, text }) {
  const businessToken = process.env.WHATSAPP_BUSINESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!businessToken || !phoneNumberId) return false;

  const normalized = String(phone || "").replace(/\D/g, "");
  if (!normalized) return false;

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
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
        Authorization: `Bearer ${businessToken}`,
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
  resetWhatsAppSession,
  sendWhatsappNotification,
};
