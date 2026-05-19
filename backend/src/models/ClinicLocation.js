const mongoose = require("mongoose");

const clinicLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, default: "", trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    consultationPriceCents: { type: Number, required: true, min: 0 },
    timezone: { type: String, default: "America/Sao_Paulo" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClinicLocation", clinicLocationSchema);
