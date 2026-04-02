const qrcode = require("qrcode");
const axios = require("axios");
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
  };
}

async function initWhatsApp() {
  if (!env.whatsappEnabled || env.whatsappMode !== "web") return;
  if (!ClientLib || !LocalAuthLib || !env.whatsappWebEnabled) {
    lastError = "WhatsApp Web indisponivel no ambiente atual.";
    return;
  }
  if (initializing || client) return;

  initializing = true;
  client = new ClientLib({
    authStrategy: new LocalAuthLib({
      clientId: "clinic-system",
      dataPath: env.whatsappSessionPath,
    }),
    puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  });

  client.on("qr", async (qr) => {
    lastQrDataUrl = await qrcode.toDataURL(qr);
    ready = false;
    lastError = "";
  });

  client.on("ready", () => {
    ready = true;
    lastQrDataUrl = null;
    lastError = "";
  });

  client.on("auth_failure", (message) => {
    ready = false;
    lastError = message || "Falha de autenticacao WhatsApp.";
  });

  client.on("disconnected", () => {
    ready = false;
    lastError = "Sessao WhatsApp desconectada.";
  });

  client.on("change_state", (state) => {
    if (state === "CONFLICT" || state === "UNPAIRED") {
      ready = false;
    }
  });

  try {
    await client.initialize();
  } catch (error) {
    lastError = error?.message || "Falha ao iniciar cliente WhatsApp.";
    client = null;
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
  sendWhatsappNotification,
};
