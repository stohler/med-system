const { Router } = require("express");
const {
  createProcedure,
  listProcedures,
  updateProcedure,
  updateProcedurePriceByLocation,
} = require("../controllers/procedureController");
const { requireAuth, requireRole } = require("../middlewares/auth");

const router = Router();

router.use(requireAuth);
router.get("/", listProcedures);
router.post("/", requireRole("admin"), createProcedure);
router.put("/:id", requireRole("admin"), updateProcedure);
router.put(
  "/:id/location-prices/:locationId",
  requireRole("admin"),
  updateProcedurePriceByLocation
);

module.exports = router;
