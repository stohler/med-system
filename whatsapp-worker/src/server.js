const { createApp } = require("./app");
const { env } = require("./config/env");

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WhatsApp Worker rodando em http://localhost:${env.port}`);
});
