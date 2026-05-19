const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "doctor", "assistant"],
      default: "assistant",
    },
    crm: { type: String, default: "" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    googleCalendarTokensEncrypted: { type: String, default: "" },
    googleCalendarConnectedAt: { type: Date, default: null },
    googleCalendarTokenExpiryAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
