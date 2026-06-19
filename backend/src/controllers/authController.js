const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { signToken } = require("../services/tokenService");
const { asyncHandler } = require("../utils/asyncHandler");
const { BadRequestError, UnauthorizedError } = require("../utils/errors");

const PUBLIC_REGISTER_ROLES = new Set(["admin", "doctor", "assistant"]);

function sanitizeUser(user) {
  const ids = Array.isArray(user.allowedLocationIds) ? user.allowedLocationIds : [];
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    crm: user.crm,
    active: user.active !== false,
    allowedLocationIds: ids.map((id) => String(id)),
  };
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, crm } = req.body;
  if (!name || !email || !password) {
    throw new BadRequestError("Nome, email e senha sao obrigatorios.");
  }

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) {
    throw new BadRequestError("Ja existe usuario com este email.");
  }

  const requestedRole = role || "doctor";
  if (!PUBLIC_REGISTER_ROLES.has(requestedRole)) {
    throw new BadRequestError("Papel de usuario nao permitido no cadastro publico.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: requestedRole,
    crm: crm || "",
    allowedLocationIds: [],
  });

  const token = signToken({ sub: user._id.toString(), role: user.role });
  res.status(201).json({ token, user: sanitizeUser(user) });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) {
    throw new UnauthorizedError("Credenciais invalidas.");
  }

  const isValid = await bcrypt.compare(password || "", user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError("Credenciais invalidas.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ sub: user._id.toString(), role: user.role });
  res.json({ token, user: sanitizeUser(user) });
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

module.exports = {
  register,
  login,
  me,
  sanitizeUser,
};
