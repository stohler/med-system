const { Patient, Consent } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { encryptText, decryptText } = require("../utils/crypto");

const listPatients = asyncHandler(async (req, res) => {
  const q = req.query.q?.trim();
  const where = q
    ? {
        $or: [
          { fullName: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { phone: { $regex: q, $options: "i" } },
          { documentNumber: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  const data = await Patient.find(where).sort({ fullName: 1 }).limit(200);
  const sanitized = data.map((p) => ({
    ...p.toObject(),
    notes: decryptText(p.encryptedNotes),
  }));
  return res.json({ data: sanitized });
});

const createPatient = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.notes) {
    payload.encryptedNotes = encryptText(payload.notes);
    delete payload.notes;
  }

  const patient = await Patient.create(payload);

  if (req.body.consentLgpdAt) {
    await Consent.create({
      patient: patient._id,
      purpose: "atendimento_clinico",
      granted: true,
      grantedAt: req.body.consentLgpdAt,
      grantedBy: req.userId,
    });
  }

  return res.status(201).json({ data: patient });
});

const updatePatient = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (payload.notes !== undefined) {
    payload.encryptedNotes = encryptText(payload.notes);
    delete payload.notes;
  }

  const patient = await Patient.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });

  if (!patient) {
    return res.status(404).json({ message: "Paciente nao encontrado" });
  }
  return res.json({ data: patient });
});

const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findByIdAndDelete(req.params.id);
  if (!patient) {
    return res.status(404).json({ message: "Paciente nao encontrado" });
  }
  return res.status(204).send();
});

module.exports = { listPatients, createPatient, updatePatient, deletePatient };
