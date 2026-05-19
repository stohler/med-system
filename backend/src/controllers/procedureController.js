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
  pricesByLocation: z
    .array(
      z.object({
        location: z.string().min(1),
        priceCents: z.number().int().min(0),
      })
    )
    .optional()
    .default([]),
  requiresPreparation: z.boolean().default(false),
  appointmentConfirmationEnabled: z.boolean().optional(),
  appointmentConfirmationTemplate: z.string().optional(),
  preparationInfoUrl: z.string().optional(),
  active: z.boolean().optional(),
});

function normalizeLocationPrices(data = {}) {
  const source = [
    ...(Array.isArray(data.locationPrices) ? data.locationPrices : []),
    ...(Array.isArray(data.pricesByLocation) ? data.pricesByLocation : []),
  ];
  const byLocation = new Map();
  for (const entry of source) {
    if (!entry?.location) continue;
    byLocation.set(String(entry.location), {
      location: String(entry.location),
      priceCents: Number(entry.priceCents || 0),
    });
  }
  return Array.from(byLocation.values());
}

const listProcedures = asyncHandler(async (_req, res) => {
  const procedures = await ProcedureType.find().sort({ name: 1 });
  res.json({ procedures });
});

const createProcedure = asyncHandler(async (req, res) => {
  const data = procedureSchema.parse(req.body);
  const procedure = await ProcedureType.create({
    name: data.name,
    description: data.description,
    defaultDurationMinutes: data.defaultDurationMinutes,
    defaultPriceCents: data.defaultPriceCents,
    requiresPreparation: data.requiresPreparation,
    appointmentConfirmationEnabled: data.appointmentConfirmationEnabled,
    appointmentConfirmationTemplate: data.appointmentConfirmationTemplate,
    preparationInfoUrl: data.preparationInfoUrl,
    active: data.active,
    locationPrices: normalizeLocationPrices(data),
  });
  res.status(201).json({ procedure });
});

const updateProcedure = asyncHandler(async (req, res) => {
  const payload = procedureSchema.partial().parse(req.body);
  const hasLocationPayload =
    Object.prototype.hasOwnProperty.call(req.body, "locationPrices") ||
    Object.prototype.hasOwnProperty.call(req.body, "pricesByLocation");
  const normalizedPayload = {
    ...payload,
    ...(hasLocationPayload
      ? { locationPrices: normalizeLocationPrices(req.body) }
      : {}),
  };
  delete normalizedPayload.pricesByLocation;
  const procedure = await ProcedureType.findByIdAndUpdate(req.params.id, normalizedPayload, {
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
