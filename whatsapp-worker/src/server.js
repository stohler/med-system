const { createApp } = require("./app");
const { env } = require("./config/env");
const { initWhatsApp } = require("./services/whatsappService");

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WhatsApp Worker rodando em http://localhost:${env.port}`);
  initWhatsApp().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[whatsapp-worker] falha ao iniciar no bootstrap:", error?.message);
  });
});
