const { Appointment, Encounter, ProcedureType } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");

const attendanceSummary = asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  const dateFilter = {};
  if (from || to) {
    dateFilter.createdAt = {};
    if (from) dateFilter.createdAt.$gte = from;
    if (to) dateFilter.createdAt.$lte = to;
  }

  const [appointments, encounters, byStatus, procedures] = await Promise.all([
    Appointment.countDocuments(dateFilter),
    Encounter.countDocuments(dateFilter),
    Appointment.aggregate([
      { $match: dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {} },
      { $group: { _id: "$status", total: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", total: 1 } },
    ]),
    ProcedureType.find({ active: true }).select({ _id: 1, name: 1 }).lean(),
  ]);

  const byProcedure = await Appointment.aggregate([
    { $match: dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {} },
    { $group: { _id: "$procedureType", total: { $sum: 1 }, revenue: { $sum: "$calculatedPriceCents" } } },
  ]);

  const procedureMap = new Map(procedures.map((p) => [String(p._id), p.name]));
  const proceduresSummary = byProcedure.map((entry) => ({
    procedureId: String(entry._id),
    procedureName: procedureMap.get(String(entry._id)) || "Procedimento removido",
    total: entry.total,
    revenueCents: entry.revenue,
  }));

  res.json({
    kpis: {
      appointments,
      encounters,
      conversionRate: appointments > 0 ? Number((encounters / appointments).toFixed(2)) : 0,
    },
    byStatus,
    byProcedure: proceduresSummary,
  });
});

module.exports = { attendanceSummary };
