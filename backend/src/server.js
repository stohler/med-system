const { createApp } = require("./app");
const { connectDatabase } = require("./config/database");
const { env } = require("./config/env");

const app = createApp();

const start = async () => {
  await connectDatabase(env.mongodbUri);

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend rodando em http://localhost:${env.port}`);
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Falha ao iniciar backend:", error);
  process.exit(1);
});

module.exports = { app };
