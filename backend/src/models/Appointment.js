const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicLocation", required: true },
    procedureType: { type: mongoose.Schema.Types.ObjectId, ref: "ProcedureType", required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "confirmed", "completed", "cancelled", "no_show"],
      default: "scheduled",
    },
    notes: { type: String, default: "" },
    calculatedPriceCents: { type: Number, required: true, min: 0 },
    googleEventId: { type: String, default: "" },
    notificationPreviewMessage: { type: String, default: "" },
    notificationSentAt: { type: Date, default: null },
    notificationChannel: { type: String, default: "" },
    notificationStatus: { type: String, default: "" },
    notificationDecision: { type: String, default: "" },
  },
  { timestamps: true }
);

appointmentSchema.index({ location: 1, startsAt: 1, endsAt: 1 });
appointmentSchema.index({ patient: 1, startsAt: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
