const mongoose = require("mongoose");

const messageTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    channel: {
      type: String,
      enum: ["whatsapp", "email", "sms", "system"],
      default: "whatsapp",
    },
    enabled: { type: Boolean, default: true },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

messageTemplateSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model("MessageTemplate", messageTemplateSchema);
