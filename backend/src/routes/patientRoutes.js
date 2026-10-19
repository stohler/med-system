const { Router } = require("express");
const { z } = require("zod");
const {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
} = require("../controllers/patientController");
const { requireAuthOrApiKey, requireScope } = require("../middlewares/auth");
const { validateRequest } = require("../validators/common");

const router = Router();

const patientSchema = z.object({
  fullName: z.string().min(3),
  birthDate: z.string().datetime().optional().or(z.literal("")),
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

router.use(requireAuthOrApiKey);
router.get("/", requireScope("patients:read"), listPatients);
router.get("/:id", requireScope("patients:read"), getPatientById);
router.post("/", requireScope("patients:write"), validateRequest(patientSchema), createPatient);
router.put(
  "/:id",
  requireScope("patients:write"),
  validateRequest(patientSchema.partial()),
  updatePatient
);
router.delete("/:id", requireScope("patients:delete"), deletePatient);

module.exports = router;
