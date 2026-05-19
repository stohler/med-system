class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

class BadRequestError extends AppError {
  constructor(message = "Requisicao invalida", details = null) {
    super(message, 400, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Nao autorizado", details = null) {
    super(message, 401, details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Acesso negado", details = null) {
    super(message, 403, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Recurso nao encontrado", details = null) {
    super(message, 404, details);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
};
