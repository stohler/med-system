const { Router } = require("express");
const { z } = require("zod");
const {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
} = require("../controllers/patientController");
const { requireAuth } = require("../middlewares/auth");
const { validateRequest } = require("../validators/common");

const router = Router();

const patientSchema = z.object({
  fullName: z.string().min(3),
  birthDate: z.string().datetime(),
  documentNumber: z.string().min(5).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8).optional().or(z.literal("")),
  address: z
    .object({
      street: z.string().optional().or(z.literal("")),
      city: z.string().optional().or(z.literal("")),
      state: z.string().optional().or(z.literal("")),
      zipCode: z.string().optional().or(z.literal("")),
      complement: z.string().optional().or(z.literal("")),
    })
    .optional(),
  notes: z.string().optional().or(z.literal("")),
  consentLgpdAt: z.string().datetime().optional(),
});

router.use(requireAuth);
router.get("/", listPatients);
router.get("/:id", getPatientById);
router.post("/", validateRequest(patientSchema), createPatient);
router.put("/:id", validateRequest(patientSchema.partial()), updatePatient);
router.delete("/:id", deletePatient);

module.exports = router;
