const { v4: uuidv4 } = require("uuid");
const { AuditLog } = require("../models");

const requestAuditMiddleware = (req, _res, next) => {
  req.requestId = req.headers["x-request-id"] || uuidv4();
  next();
};

const auditAction = async ({ actor, action, resourceType, resourceId, metadata, requestId }) => {
  try {
    await AuditLog.create({
      actor: actor || null,
      action,
      resourceType,
      resourceId: resourceId || "",
      metadata: metadata || {},
      requestId: requestId || "",
    });
  } catch (_err) {
    // Falha de auditoria nao deve interromper atendimento.
  }
};

module.exports = { requestAuditMiddleware, auditAction };
