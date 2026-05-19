const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const {
  listMessageTemplates,
  upsertMessageTemplates,
} = require("../controllers/messageTemplateController");

const router = Router();

router.use(requireAuth);
router.get("/", listMessageTemplates);
router.put("/", requireRole("admin"), upsertMessageTemplates);

module.exports = router;
