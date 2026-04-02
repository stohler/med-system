const { z } = require("zod");
const { ProcedureType } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { NotFoundError } = require("../utils/errors");

const procedureSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  defaultDurationMinutes: z.number().int().min(10).max(600).default(30),
  defaultPriceCents: z.number().int().min(0).default(0),
  locationPrices: z
    .array(
      z.object({
        location: z.string().min(1),
        priceCents: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
  requiresPreparation: z.boolean().default(false),
  active: z.boolean().optional(),
});

const listProcedures = asyncHandler(async (_req, res) => {
  const procedures = await ProcedureType.find().sort({ name: 1 });
  res.json({ procedures });
});

const createProcedure = asyncHandler(async (req, res) => {
  const data = procedureSchema.parse(req.body);
  const procedure = await ProcedureType.create(data);
  res.status(201).json({ procedure });
});

const updateProcedure = asyncHandler(async (req, res) => {
  const payload = procedureSchema.partial().parse(req.body);
  const procedure = await ProcedureType.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!procedure) {
    throw new NotFoundError("Procedimento nao encontrado");
  }
  res.json({ procedure });
});

const updateProcedurePriceByLocation = asyncHandler(async (req, res) => {
  const priceSchema = z.object({
    priceCents: z.number().int().min(0),
  });
  const payload = priceSchema.parse(req.body);

  const procedure = await ProcedureType.findById(req.params.id);
  if (!procedure) {
    throw new NotFoundError("Procedimento nao encontrado");
  }

  const remaining = (procedure.locationPrices || []).filter(
    (item) => String(item.location) !== String(req.params.locationId)
  );

  procedure.locationPrices = [
    ...remaining,
    { location: req.params.locationId, priceCents: payload.priceCents },
  ];
  await procedure.save();

  res.json({ procedure });
});

module.exports = {
  listProcedures,
  createProcedure,
  updateProcedure,
  updateProcedurePriceByLocation,
};
