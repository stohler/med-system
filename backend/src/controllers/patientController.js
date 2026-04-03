const { Patient, Consent, Encounter } = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { encryptText, decryptText } = require("../utils/crypto");

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function buildPatientPayload(body) {
  const payload = { ...body };
  const documentNumber = normalizeOptionalString(payload.documentNumber);
  const phone = normalizeOptionalString(payload.phone);

  if (documentNumber === undefined) {
    delete payload.documentNumber;
  } else {
    payload.documentNumber = documentNumber;
  }

  if (phone === undefined) {
    delete payload.phone;
  } else {
    payload.phone = phone;
  }

  return payload;
}

const listPatients = asyncHandler(async (req, res) => {
  const q = req.query.q?.trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
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

  const [total, data] = await Promise.all([
    Patient.countDocuments(where),
    Patient.find(where)
      .sort({ fullName: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
  ]);

  const sanitized = data.map((p) => ({
    ...p.toObject(),
    notes: decryptText(p.encryptedNotes),
  }));
  return res.json({ data: sanitized, total, page, pageSize });
});

const getPatientById = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ message: "Paciente nao encontrado" });
  }

  const encounters = await Encounter.find({ patient: patient._id })
    .sort({ createdAt: -1 })
    .populate(["appointment", "clinician"])
    .limit(200);

  return res.json({
    data: {
      ...patient.toObject(),
      notes: decryptText(patient.encryptedNotes),
    },
    encounters,
  });
});

const createPatient = asyncHandler(async (req, res) => {
  const payload = buildPatientPayload(req.body);
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
  const payload = buildPatientPayload(req.body);
  if (payload.notes !== undefined) {
    payload.encryptedNotes = encryptText(payload.notes);
    delete payload.notes;
  }

  const unset = {};
  if (
    Object.prototype.hasOwnProperty.call(req.body, "documentNumber") &&
    normalizeOptionalString(req.body.documentNumber) === undefined
  ) {
    unset.documentNumber = "";
  }
  if (
    Object.prototype.hasOwnProperty.call(req.body, "phone") &&
    normalizeOptionalString(req.body.phone) === undefined
  ) {
    unset.phone = "";
  }

  const updateOperation = {};
  if (Object.keys(payload).length > 0) {
    updateOperation.$set = payload;
  }
  if (Object.keys(unset).length > 0) {
    updateOperation.$unset = unset;
  }

  if (Object.keys(updateOperation).length === 0) {
    const unchanged = await Patient.findById(req.params.id);
    if (!unchanged) {
      return res.status(404).json({ message: "Paciente nao encontrado" });
    }
    return res.json({ data: unchanged });
  }

  const patient = await Patient.findByIdAndUpdate(req.params.id, updateOperation, {
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

module.exports = {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
};
