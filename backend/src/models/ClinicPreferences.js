const mongoose = require("mongoose");

const clinicPreferencesSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: "default", unique: true },
    agendaGridStartHour: { type: Number, default: 7, min: 0, max: 23 },
    agendaGridEndHour: { type: Number, default: 19, min: 0, max: 23 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClinicPreferences", clinicPreferencesSchema);
