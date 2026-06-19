const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  getClinicPreferences,
  updateClinicPreferences,
} = require("../controllers/clinicPreferencesController");

const router = Router();
router.use(requireAuth);
router.get("/", getClinicPreferences);
router.put("/", requireRole("admin"), updateClinicPreferences);

module.exports = router;
