const { Router } = require("express");
const {
  createEncounter,
  listEncounters,
  addExamResult,
  issuePrescription,
} = require("../controllers/encounterController");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = Router();

router.use(requireAuth);
router.get("/", listEncounters);
router.post("/", requireRole("doctor", "admin"), createEncounter);
router.post("/:id/exams", requireRole("doctor", "admin"), addExamResult);
router.post("/:id/prescriptions", requireRole("doctor", "admin"), issuePrescription);

module.exports = router;
