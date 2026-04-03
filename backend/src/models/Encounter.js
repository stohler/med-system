const mongoose = require("mongoose");

const encounterSchema = new mongoose.Schema(
  {
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    clinician: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    anamnesis: { type: String, default: "" },
    currentIllnessHistory: { type: String, default: "" },
    comorbidities: { type: String, default: "" },
    deniesComorbidities: { type: Boolean, default: false },
    allergies: { type: String, default: "" },
    deniesAllergies: { type: Boolean, default: false },
    medicationsInUse: { type: String, default: "" },
    deniesMedicationsInUse: { type: Boolean, default: false },
    physicalExam: { type: String, default: "" },
    diagnosticHypothesis: { type: String, default: "" },
    conduct: { type: String, default: "" },
    evolution: { type: String, default: "" },
    diagnosis: { type: String, default: "" },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

encounterSchema.index({ appointment: 1, createdAt: -1 });

module.exports = mongoose.model("Encounter", encounterSchema);
