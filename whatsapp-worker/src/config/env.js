const dotenv = require("dotenv");

dotenv.config();

const env = {
  port: Number(process.env.PORT || 8080),
  workerAuthToken: process.env.WHATSAPP_WORKER_TOKEN || "",
  whatsappEnabled: String(process.env.WHATSAPP_ENABLED || "true") === "true",
  whatsappMode: process.env.WHATSAPP_MODE || "web",
  whatsappWebEnabled: String(process.env.WHATSAPP_WEB_ENABLED || "true") === "true",
  whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH || "/tmp/.wwebjs_auth",
};

module.exports = { env };
