const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listLocations,
  createLocation,
  updateLocation,
} = require("../controllers/locationController");

const router = Router();

router.use(requireAuth);
router.get("/", listLocations);
router.post("/", requireRole("admin"), createLocation);
router.put("/:id", requireRole("admin"), updateLocation);

module.exports = router;
