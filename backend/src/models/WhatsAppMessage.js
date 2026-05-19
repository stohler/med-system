const mongoose = require("mongoose");

const whatsAppMessageSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
      index: true,
    },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      default: "incoming",
    },
    from: { type: String, default: "", trim: true },
    phoneNormalized: { type: String, default: "", trim: true, index: true },
    to: { type: String, default: "", trim: true },
    text: { type: String, default: "", trim: true },
    providerMessageId: { type: String, default: "", trim: true },
    eventType: { type: String, default: "incoming_message", trim: true },
    receivedAt: { type: Date, default: Date.now, index: true },
    matchedBy: {
      type: String,
      enum: ["phone", "unmatched"],
      default: "unmatched",
    },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhatsAppMessage", whatsAppMessageSchema);
