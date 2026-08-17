const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const { env } = require("./config/env");
const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const { requestAuditMiddleware } = require("./middlewares/requestAudit");
const { sanitizeInput } = require("./middlewares/sanitizeInput");

function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  const normalizedOrigin = String(env.frontendOrigin || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/^https?:\/\//, "");

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const requestHost = String(origin)
          .trim()
          .replace(/\/$/, "")
          .replace(/^https?:\/\//, "");
        if (requestHost === normalizedOrigin) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin nao permitido"));
      },
      credentials: true,
      exposedHeaders: ["Content-Disposition"],
    })
  );
  app.use(helmet());
  app.use(compression());
  app.use(morgan("combined"));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(sanitizeInput);
  app.use(hpp());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use(requestAuditMiddleware);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "med-system-api" });
  });

  app.use("/api", routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
