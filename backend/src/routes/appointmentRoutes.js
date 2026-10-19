const { Router } = require("express");
const {
  createAppointment,
  previewAppointmentMessage,
  listAppointments,
  updateAppointment,
  resendAppointmentTemplateMessage,
  sendAgendaConfirmationMessage,
  deleteAppointment,
} = require("../controllers/appointmentController");
const { requireAuthOrApiKey, requireScope } = require("../middlewares/auth");

const router = Router();

router.use(requireAuthOrApiKey);
router.get("/", requireScope("appointments:read"), listAppointments);
router.post("/preview-message", requireScope("appointments:read"), previewAppointmentMessage);
router.post("/", requireScope("appointments:write"), createAppointment);
router.post(
  "/:id/resend-template",
  requireScope("appointments:notify"),
  resendAppointmentTemplateMessage
);
router.post(
  "/:id/send-confirmation",
  requireScope("appointments:notify"),
  sendAgendaConfirmationMessage
);
router.put("/:id", requireScope("appointments:write"), updateAppointment);
router.delete("/:id", requireScope("appointments:delete"), deleteAppointment);

module.exports = router;
