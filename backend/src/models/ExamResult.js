const mongoose = require("mongoose");

const examResultSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    encounter: { type: mongoose.Schema.Types.ObjectId, ref: "Encounter", default: null },
    examType: { type: String, required: true, trim: true },
    findings: { type: String, required: true },
    attachedFileUrl: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExamResult", examResultSchema);
