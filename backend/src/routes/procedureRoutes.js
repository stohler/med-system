const { Router } = require("express");
const {
  createProcedure,
  listProcedures,
  updateProcedure,
  updateProcedurePriceByLocation,
} = require("../controllers/procedureController");
const { requireAuth, requireAuthOrApiKey, requireScope, requireRole } = require("../middlewares/auth");

const router = Router();

router.get("/", requireAuthOrApiKey, requireScope("catalog:read"), listProcedures);
router.post("/", requireAuth, requireRole("admin"), createProcedure);
router.put("/:id", requireAuth, requireRole("admin"), updateProcedure);
router.put(
  "/:id/location-prices/:locationId",
  requireAuth,
  requireRole("admin"),
  updateProcedurePriceByLocation
);

module.exports = router;
