const { z } = require("zod");
const { ClinicLocation } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { NotFoundError } = require("../utils/errors");

const locationSchema = z.object({
  name: z.string().min(2),
  addressLine1: z.string().min(4),
  addressLine2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  zipCode: z.string().min(4),
  consultationPriceCents: z.number().int().min(0),
  timezone: z.string().optional(),
  active: z.boolean().optional(),
});

const listLocations = asyncHandler(async (_req, res) => {
  const locations = await ClinicLocation.find().sort({ name: 1 });
  res.json({ locations });
});

const createLocation = asyncHandler(async (req, res) => {
  const payload = locationSchema.parse(req.body);
  const location = await ClinicLocation.create(payload);
  res.status(201).json({ location });
});

const updateLocation = asyncHandler(async (req, res) => {
  const payload = locationSchema.partial().parse(req.body);
  const location = await ClinicLocation.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });

  if (!location) {
    throw new NotFoundError("Endereco nao encontrado");
  }

  res.json({ location });
});

module.exports = { listLocations, createLocation, updateLocation };
