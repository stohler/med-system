const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    purpose: { type: String, required: true, trim: true },
    granted: { type: Boolean, default: true },
    method: { type: String, enum: ["digital", "paper", "voice"], default: "digital" },
    notes: { type: String, default: "" },
    grantedAt: { type: Date, default: () => new Date() },
    revokedAt: { type: Date, default: null },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Consent", consentSchema);
