const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { env } = require("../config/env");
const { UnauthorizedError, ForbiddenError } = require("../utils/errors");

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

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ForbiddenError("Sem permissao"));
  }
  return next();
};

module.exports = { requireAuth, requireRole };
