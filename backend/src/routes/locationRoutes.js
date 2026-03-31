const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const {
  listLocations,
  createLocation,
  updateLocation,
} = require("../controllers/locationController");

const router = Router();

router.use(requireAuth);
router.get("/", listLocations);
router.post("/", createLocation);
router.put("/:id", updateLocation);

module.exports = router;
