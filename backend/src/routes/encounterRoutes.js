const { Router } = require("express");
const {
  createEncounter,
  updateEncounter,
  listEncounters,
  getEncounterById,
  exportEncounterPdf,
  addExamResult,
  issuePrescription,
  scheduleSurgery,
} = require("../controllers/encounterController");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = Router();

router.use(requireAuth);
router.get("/", listEncounters);
router.get("/:id", getEncounterById);
router.get("/:id/pdf", exportEncounterPdf);
router.post("/", requireRole("doctor", "admin"), createEncounter);
router.put("/:id", requireRole("doctor", "admin"), updateEncounter);
router.post("/:id/exams", requireRole("doctor", "admin"), addExamResult);
router.post("/:id/prescriptions", requireRole("doctor", "admin"), issuePrescription);
router.post("/:id/schedule-surgery", requireRole("doctor", "admin"), scheduleSurgery);

module.exports = router;
