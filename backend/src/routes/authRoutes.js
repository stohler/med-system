const { Router } = require("express");
const { login, me, register } = require("../controllers/authController");
const { requireAuth } = require("../middlewares/auth");

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

module.exports = router;
