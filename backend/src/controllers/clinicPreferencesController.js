const { z } = require("zod");
const { ClinicPreferences } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/errors");

const SINGLETON_KEY = "default";

const updateSchema = z.object({
  agendaGridStartHour: z.coerce.number().int().min(0).max(23),
  agendaGridEndHour: z.coerce.number().int().min(0).max(23),
});

async function getOrCreatePreferences() {
  let doc = await ClinicPreferences.findOne({ singletonKey: SINGLETON_KEY });
  if (!doc) {
    doc = await ClinicPreferences.create({ singletonKey: SINGLETON_KEY });
  }
  return doc;
}

const getClinicPreferences = asyncHandler(async (_req, res) => {
  const doc = await getOrCreatePreferences();
  res.json({
    agendaGridStartHour: doc.agendaGridStartHour,
    agendaGridEndHour: doc.agendaGridEndHour,
  });
});

const updateClinicPreferences = asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  if (body.agendaGridStartHour >= body.agendaGridEndHour) {
    throw new AppError("Horario inicial da grade deve ser menor que o final", 400);
  }
  const doc = await ClinicPreferences.findOneAndUpdate(
    { singletonKey: SINGLETON_KEY },
    {
      singletonKey: SINGLETON_KEY,
      agendaGridStartHour: body.agendaGridStartHour,
      agendaGridEndHour: body.agendaGridEndHour,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({
    agendaGridStartHour: doc.agendaGridStartHour,
    agendaGridEndHour: doc.agendaGridEndHour,
  });
});

module.exports = {
  getClinicPreferences,
  updateClinicPreferences,
};
