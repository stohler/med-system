const { Router } = require("express");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { listUsers, createUser, updateUser } = require("../controllers/userController");

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);

module.exports = router;
