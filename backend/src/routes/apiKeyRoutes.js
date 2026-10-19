const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listScopes,
  listApiKeys,
  createApiKey,
  revokeApiKey,
} = require("../controllers/apiKeyController");

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/scopes", listScopes);
router.get("/", listApiKeys);
router.post("/", createApiKey);
router.delete("/:id", revokeApiKey);

module.exports = router;
