const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    instructions: { type: String, required: true, trim: true },
    durationDays: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    encounter: { type: mongoose.Schema.Types.ObjectId, ref: "Encounter", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    medications: { type: [medicationSchema], default: [] },
    notes: { type: String, default: "" },
    signedAt: { type: Date, default: () => new Date() },
    pdfName: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prescription", prescriptionSchema);
