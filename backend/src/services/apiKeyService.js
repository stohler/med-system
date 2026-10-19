const crypto = require("crypto");

const API_KEY_PREFIX = "msk_";

const API_KEY_SCOPES = [
  "patients:read",
  "patients:write",
  "patients:delete",
  "appointments:read",
  "appointments:write",
  "appointments:delete",
  "appointments:notify",
  "catalog:read",
];

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

function generateApiKey() {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return {
    key,
    prefix: key.slice(0, API_KEY_PREFIX.length + 6),
    keyHash: hashApiKey(key),
  };
}

function looksLikeApiKey(value) {
  return typeof value === "string" && value.startsWith(API_KEY_PREFIX);
}

module.exports = {
  API_KEY_PREFIX,
  API_KEY_SCOPES,
  hashApiKey,
  generateApiKey,
  looksLikeApiKey,
};
