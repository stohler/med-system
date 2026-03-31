const mongoose = require("mongoose");

const procedureTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    defaultDurationMinutes: { type: Number, required: true, min: 10, default: 30 },
    defaultPriceCents: { type: Number, required: true, min: 0, default: 0 },
    requiresPreparation: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProcedureType", procedureTypeSchema);
