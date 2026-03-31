const mongoose = require("mongoose");

const encounterSchema = new mongoose.Schema(
  {
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    clinician: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    anamnesis: { type: String, default: "" },
    evolution: { type: String, default: "" },
    diagnosis: { type: String, default: "" },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Encounter", encounterSchema);
