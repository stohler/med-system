const { AppError } = require("../utils/errors");

const notFoundHandler = (_req, _res, next) => {
  next(new AppError("Rota nao encontrada", 404));
};

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Erro interno";

  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    error: true,
    message,
    details: err.details || null,
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
