const dotenv = require("dotenv");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/med-system",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@consultorio.local",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:4000/api/integrations/google/callback",
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  whatsappEnabled: String(process.env.WHATSAPP_ENABLED || "true") === "true",
  whatsappMode: process.env.WHATSAPP_MODE || "web",
  whatsappWebEnabled: String(process.env.WHATSAPP_WEB_ENABLED || "true") === "true",
  whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth",
  whatsappBusinessToken: process.env.WHATSAPP_BUSINESS_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappServiceBaseUrl:
    process.env.WHATSAPP_SERVICE_BASE_URL ||
    "https://api-sandbox.moneri.com.br/v1/whatsapp-service",
  whatsappServiceToken: process.env.WHATSAPP_SERVICE_TOKEN || "",
  publicApiUrl: process.env.PUBLIC_API_URL || "",
  whatsappWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL || "",
};

module.exports = { env };
