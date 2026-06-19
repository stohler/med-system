const mongoose = require("mongoose");
const { ForbiddenError } = require("./errors");

function normalizedAllowedLocationIds(user) {
  if (!user || user.role !== "reception") return null;
  const raw = Array.isArray(user.allowedLocationIds) ? user.allowedLocationIds : [];
  return raw.map((id) => String(id));
}

function receptionLocationFilter(user) {
  const ids = normalizedAllowedLocationIds(user);
  if (ids === null) return null;
  if (ids.length === 0) {
    return { _id: { $in: [] } };
  }
  return { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } };
}

function assertLocationAllowedForReception(user, locationId) {
  if (!user || user.role !== "reception") return;
  const loc = String(locationId || "");
  const allowed = normalizedAllowedLocationIds(user) || [];
  if (!loc || !allowed.includes(loc)) {
    throw new ForbiddenError("Sem permissao para este endereco");
  }
}

module.exports = {
  normalizedAllowedLocationIds,
  receptionLocationFilter,
  assertLocationAllowedForReception,
};
