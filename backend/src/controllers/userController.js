const bcrypt = require("bcryptjs");
const { z } = require("zod");
const mongoose = require("mongoose");
const { User } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { BadRequestError, NotFoundError } = require("../utils/errors");
const { sanitizeUser } = require("./authController");

const ALL_ROLES = ["admin", "doctor", "assistant", "reception"];

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ALL_ROLES),
  crm: z.string().optional().default(""),
  allowedLocationIds: z.array(z.string().min(1)).optional().default([]),
});

const patchUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(ALL_ROLES).optional(),
  crm: z.string().optional(),
  active: z.boolean().optional(),
  allowedLocationIds: z.array(z.string().min(1)).optional(),
});

function toObjectIds(ids) {
  return (ids || []).map((id) => new mongoose.Types.ObjectId(id));
}

function assertReceptionLocations(role, allowedLocationIds) {
  if (role !== "reception") return;
  if (!allowedLocationIds || allowedLocationIds.length === 0) {
    throw new BadRequestError("Recepcao restrita exige ao menos um endereco permitido.");
  }
}

const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ name: 1 }).lean();
  const payload = users.map((u) => ({
    ...sanitizeUser(u),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json({ users: payload });
});

const createUser = asyncHandler(async (req, res) => {
  const body = createUserSchema.parse(req.body);
  assertReceptionLocations(body.role, body.allowedLocationIds);

  const email = String(body.email).toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new BadRequestError("Ja existe usuario com este email.");
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await User.create({
    name: body.name,
    email,
    passwordHash,
    role: body.role,
    crm: body.role === "doctor" ? body.crm || "" : "",
    allowedLocationIds: body.role === "reception" ? toObjectIds(body.allowedLocationIds) : [],
    active: true,
  });

  res.status(201).json({ user: sanitizeUser(user) });
});

const updateUser = asyncHandler(async (req, res) => {
  const body = patchUserSchema.parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError("Usuario nao encontrado");
  }

  const nextRole = body.role ?? user.role;
  let nextAllowed = user.allowedLocationIds || [];
  if (body.allowedLocationIds !== undefined) {
    nextAllowed = toObjectIds(body.allowedLocationIds);
  } else if (body.role !== undefined && body.role !== "reception") {
    nextAllowed = [];
  }

  const idsForCheck = nextRole === "reception" ? nextAllowed.map(String) : null;
  assertReceptionLocations(nextRole, idsForCheck);

  if (body.name !== undefined) user.name = body.name;
  if (body.email !== undefined) user.email = String(body.email).toLowerCase();
  if (body.password) user.passwordHash = await bcrypt.hash(body.password, 12);
  if (body.role !== undefined) user.role = body.role;
  if (body.crm !== undefined) user.crm = body.crm;
  if (body.active !== undefined) user.active = body.active;

  if (body.allowedLocationIds !== undefined || (body.role !== undefined && nextRole !== "reception")) {
    user.allowedLocationIds = nextRole === "reception" ? nextAllowed : [];
  }

  if (body.email !== undefined) {
    const dup = await User.findOne({
      email: user.email,
      _id: { $ne: user._id },
    });
    if (dup) {
      throw new BadRequestError("Ja existe usuario com este email.");
    }
  }

  await user.save();
  res.json({ user: sanitizeUser(user) });
});

module.exports = {
  listUsers,
  createUser,
  updateUser,
};
