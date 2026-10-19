const jwt = require("jsonwebtoken");
const { User, ApiKey } = require("../models");
const { env } = require("../config/env");
const { UnauthorizedError, ForbiddenError } = require("../utils/errors");
const { hashApiKey, looksLikeApiKey } = require("../services/apiKeyService");
const { auditAction } = require("./requestAudit");

const API_KEY_LAST_USED_THROTTLE_MS = 60 * 1000;

const requireAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (!token) {
      throw new UnauthorizedError("Token ausente");
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedError("Usuario invalido");
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) return next(error);
    return next(new UnauthorizedError("Token invalido"));
  }
};

function extractApiKey(req) {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeApiKey(bearer)) return bearer;
  }
  return null;
}

async function authenticateApiKey(req, rawKey) {
  const apiKey = await ApiKey.findOne({ keyHash: hashApiKey(rawKey) });
  if (!apiKey || apiKey.revokedAt) {
    throw new UnauthorizedError("API key invalida");
  }
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    throw new UnauthorizedError("API key expirada");
  }
  const user = await User.findById(apiKey.user);
  if (!user || !user.active) {
    throw new UnauthorizedError("Usuario da API key invalido");
  }

  const now = new Date();
  if (!apiKey.lastUsedAt || now - apiKey.lastUsedAt > API_KEY_LAST_USED_THROTTLE_MS) {
    ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: now }).catch(() => {});
  }

  req.user = user;
  req.userId = user._id.toString();
  req.apiKey = apiKey;

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    await auditAction({
      actor: user._id,
      action: "api_key.request",
      resourceType: "ApiKey",
      resourceId: apiKey._id.toString(),
      metadata: { method: req.method, path: req.originalUrl.split("?")[0], keyName: apiKey.name },
      requestId: req.requestId,
    });
  }
}

const requireAuthOrApiKey = async (req, res, next) => {
  const rawKey = extractApiKey(req);
  if (!rawKey) return requireAuth(req, res, next);
  try {
    await authenticateApiKey(req, rawKey);
    return next();
  } catch (error) {
    if (error instanceof UnauthorizedError) return next(error);
    return next(new UnauthorizedError("API key invalida"));
  }
};

const requireScope = (scope) => (req, _res, next) => {
  if (!req.apiKey) return next();
  if (!req.apiKey.scopes.includes(scope)) {
    return next(new ForbiddenError(`API key sem o escopo necessario: ${scope}`));
  }
  return next();
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ForbiddenError("Sem permissao"));
  }
  return next();
};

module.exports = { requireAuth, requireAuthOrApiKey, requireScope, requireRole };
