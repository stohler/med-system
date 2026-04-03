const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    birthDate: { type: Date, required: true },
    documentNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      complement: { type: String, default: "" },
    },
    allergies: [{ type: String, trim: true }],
    conditions: [{ type: String, trim: true }],
    consentLgpdAt: { type: Date, default: null },
    encryptedNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

patientSchema.index({ fullName: 1 });
patientSchema.index({ documentNumber: 1 });
patientSchema.index({ phone: 1 });

module.exports = mongoose.model("Patient", patientSchema);
