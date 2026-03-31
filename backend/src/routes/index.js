const { Router } = require("express");
const authRoutes = require("./authRoutes");
const patientRoutes = require("./patientRoutes");
const locationRoutes = require("./locationRoutes");
const procedureRoutes = require("./procedureRoutes");
const appointmentRoutes = require("./appointmentRoutes");
const encounterRoutes = require("./encounterRoutes");
const reportRoutes = require("./reportRoutes");
const integrationRoutes = require("./integrationRoutes");

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "med-system-api" });
});

router.use("/auth", authRoutes);
router.use("/patients", patientRoutes);
router.use("/locations", locationRoutes);
router.use("/procedures", procedureRoutes);
router.use("/appointments", appointmentRoutes);
router.use("/encounters", encounterRoutes);
router.use("/reports", reportRoutes);
router.use("/integrations", integrationRoutes);

module.exports = router;
