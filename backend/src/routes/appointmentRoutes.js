const { Router } = require("express");
const {
  createAppointment,
  previewAppointmentMessage,
  listAppointments,
  updateAppointment,
  deleteAppointment,
} = require("../controllers/appointmentController");
const { requireAuth } = require("../middlewares/auth");

const router = Router();

router.use(requireAuth);
router.get("/", listAppointments);
router.post("/preview-message", previewAppointmentMessage);
router.post("/", createAppointment);
router.put("/:id", updateAppointment);
router.delete("/:id", deleteAppointment);

module.exports = router;
