const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { attendanceSummary } = require("../controllers/reportController");

const router = Router();

router.use(requireAuth);
router.get("/attendance", requireRole("admin", "doctor"), attendanceSummary);

module.exports = router;
