const { Router } = require("express");
const { requireAuth, requireAuthOrApiKey, requireScope, requireRole } = require("../middlewares/auth");
const {
  listLocations,
  createLocation,
  updateLocation,
} = require("../controllers/locationController");

const router = Router();

router.get("/", requireAuthOrApiKey, requireScope("catalog:read"), listLocations);
router.post("/", requireAuth, requireRole("admin"), createLocation);
router.put("/:id", requireAuth, requireRole("admin"), updateLocation);

module.exports = router;
