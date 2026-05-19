const crypto = require("crypto");

function encryptText(value) {
  if (!value) return "";
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || "fallback-encryption-key")
    .digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptText(payload) {
  if (!payload) return "";
  const [ivHex, encryptedHex] = String(payload).split(":");
  if (!ivHex || !encryptedHex) return "";
  const key = crypto
    .createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || "fallback-encryption-key")
    .digest();
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = { encryptText, decryptText };
