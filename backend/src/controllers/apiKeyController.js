const { z } = require("zod");
const { ApiKey, User } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { BadRequestError, NotFoundError } = require("../utils/errors");
const { API_KEY_SCOPES, generateApiKey } = require("../services/apiKeyService");
const { auditAction } = require("../middlewares/requestAudit");

const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  userId: z.string().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

function serializeApiKey(apiKey) {
  const doc = typeof apiKey.toObject === "function" ? apiKey.toObject() : apiKey;
  return {
    id: String(doc._id),
    name: doc.name,
    prefix: doc.prefix,
    user: doc.user,
    createdBy: doc.createdBy,
    scopes: doc.scopes,
    expiresAt: doc.expiresAt,
    lastUsedAt: doc.lastUsedAt,
    revokedAt: doc.revokedAt,
    createdAt: doc.createdAt,
  };
}

const listScopes = asyncHandler(async (_req, res) => {
  res.json({ scopes: API_KEY_SCOPES });
});

const listApiKeys = asyncHandler(async (_req, res) => {
  const apiKeys = await ApiKey.find()
    .sort({ createdAt: -1 })
    .populate("user", "name email role active")
    .lean();
  res.json({ apiKeys: apiKeys.map(serializeApiKey) });
});

const createApiKey = asyncHandler(async (req, res) => {
  const body = createApiKeySchema.parse(req.body);
  const ownerId = body.userId || req.userId;

  const owner = /^[a-f\d]{24}$/i.test(ownerId) ? await User.findById(ownerId) : null;
  if (!owner) {
    throw new NotFoundError("Usuario da API key nao encontrado");
  }
  if (!owner.active) {
    throw new BadRequestError("Usuario da API key esta inativo");
  }

  const { key, prefix, keyHash } = generateApiKey();
  const apiKey = await ApiKey.create({
    name: body.name,
    prefix,
    keyHash,
    user: owner._id,
    createdBy: req.userId,
    scopes: [...new Set(body.scopes)],
    expiresAt: body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null,
  });

  await auditAction({
    actor: req.user._id,
    action: "api_key.create",
    resourceType: "ApiKey",
    resourceId: apiKey._id.toString(),
    metadata: { name: apiKey.name, scopes: apiKey.scopes, owner: owner._id.toString() },
    requestId: req.requestId,
  });

  res.status(201).json({
    apiKey: serializeApiKey(apiKey),
    key,
    warning: "Guarde esta chave agora. Ela nao sera exibida novamente.",
  });
});

const revokeApiKey = asyncHandler(async (req, res) => {
  const apiKey = /^[a-f\d]{24}$/i.test(req.params.id) ? await ApiKey.findById(req.params.id) : null;
  if (!apiKey) {
    throw new NotFoundError("API key nao encontrada");
  }
  if (!apiKey.revokedAt) {
    apiKey.revokedAt = new Date();
    await apiKey.save();
    await auditAction({
      actor: req.user._id,
      action: "api_key.revoke",
      resourceType: "ApiKey",
      resourceId: apiKey._id.toString(),
      metadata: { name: apiKey.name },
      requestId: req.requestId,
    });
  }
  res.json({ apiKey: serializeApiKey(apiKey) });
});

module.exports = { listScopes, listApiKeys, createApiKey, revokeApiKey };
