const { z } = require("zod");
const {
  Encounter,
  Appointment,
  ProcedureType,
  ClinicLocation,
  ExamResult,
  Prescription,
  Patient,
  WhatsAppMessage,
  User,
} = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError, NotFoundError, ForbiddenError } = require("../utils/errors");
const { buildPrescriptionPdf, buildEncounterPdf } = require("../services/pdfService");
const { sendMail } = require("../services/emailService");

const encounterSchema = z.object({
  appointment: z.string().min(1),
  historyOfPresentIllness: z.string().optional(),
  historyOfCurrentIllness: z.string().optional(),
  comorbidities: z.string().optional().default(""),
  denyComorbidities: z.boolean().optional(),
  comorbiditiesDenied: z.boolean().optional(),
  allergies: z.string().optional().default(""),
  denyAllergies: z.boolean().optional(),
  allergiesDenied: z.boolean().optional(),
  currentMedications: z.string().optional(),
  medicationsInUse: z.string().optional(),
  denyCurrentMedications: z.boolean().optional(),
  medicationsDenied: z.boolean().optional(),
  physicalExam: z.string().optional().default(""),
  diagnosticHypothesis: z.string().optional().default(""),
  conduct: z.string().optional().default(""),
});

const examSchema = z.object({
  examType: z.string().min(2),
  findings: z.string().min(3),
  attachedFileUrl: z.string().optional().default(""),
});

const prescriptionSchema = z.object({
  medications: z
    .array(
      z.object({
        name: z.string().min(2),
        instructions: z.string().min(3),
        durationDays: z.number().int().min(1),
      })
    )
    .min(1),
  notes: z.string().optional().default(""),
  sendByEmail: z.boolean().optional().default(false),
});

const scheduleSurgerySchema = z.object({
  surgeryProcedureType: z.string().min(1),
  location: z.string().min(1),
  plannedDate: z.coerce.date(),
  notes: z.string().optional().default(""),
});

const updateEncounterSchema = z.object({
  historyOfPresentIllness: z.string().optional(),
  historyOfCurrentIllness: z.string().optional(),
  comorbidities: z.string().optional(),
  denyComorbidities: z.boolean().optional(),
  comorbiditiesDenied: z.boolean().optional(),
  allergies: z.string().optional(),
  denyAllergies: z.boolean().optional(),
  allergiesDenied: z.boolean().optional(),
  currentMedications: z.string().optional(),
  medicationsInUse: z.string().optional(),
  denyCurrentMedications: z.boolean().optional(),
  medicationsDenied: z.boolean().optional(),
  physicalExam: z.string().optional(),
  diagnosticHypothesis: z.string().optional(),
  conduct: z.string().optional(),
});

const createEncounter = asyncHandler(async (req, res) => {
  const payload = encounterSchema.parse(req.body);
  const deniesComorbidities =
    payload.comorbiditiesDenied ?? payload.denyComorbidities ?? false;
  const deniesAllergies = payload.allergiesDenied ?? payload.denyAllergies ?? false;
  const deniesMedications =
    payload.medicationsDenied ?? payload.denyCurrentMedications ?? false;
  const currentIllnessHistory =
    payload.historyOfCurrentIllness ?? payload.historyOfPresentIllness ?? "";
  const medicationsInUse = payload.medicationsInUse ?? payload.currentMedications ?? "";

  const appointment = await Appointment.findById(payload.appointment);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }

  let encounter;
  try {
    encounter = await Encounter.create({
      appointment: appointment._id,
      patient: appointment.patient,
      clinician: req.userId,
      currentIllnessHistory,
      comorbidities: deniesComorbidities ? "" : payload.comorbidities,
      deniesComorbidities,
      allergies: deniesAllergies ? "" : payload.allergies,
      deniesAllergies,
      medicationsInUse: deniesMedications ? "" : medicationsInUse,
      deniesMedicationsInUse: deniesMedications,
      physicalExam: payload.physicalExam,
      diagnosticHypothesis: payload.diagnosticHypothesis,
      conduct: payload.conduct,
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.appointment) {
      throw new AppError(
        "Indice antigo de banco detectado para agendamento unico. Reinicie o backend para aplicar migracao de indice.",
        409
      );
    }
    throw error;
  }

  appointment.status = "completed";
  await appointment.save();

  res.status(201).json({ encounter });
});

const updateEncounter = asyncHandler(async (req, res) => {
  const payload = updateEncounterSchema.parse(req.body);
  const encounter = await Encounter.findById(req.params.id);
  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const deniesComorbidities =
    payload.comorbiditiesDenied ?? payload.denyComorbidities ?? encounter.deniesComorbidities;
  const deniesAllergies =
    payload.allergiesDenied ?? payload.denyAllergies ?? encounter.deniesAllergies;
  const deniesMedications =
    payload.medicationsDenied ??
    payload.denyCurrentMedications ??
    encounter.deniesMedicationsInUse;

  if (payload.historyOfCurrentIllness !== undefined || payload.historyOfPresentIllness !== undefined) {
    encounter.currentIllnessHistory =
      payload.historyOfCurrentIllness ?? payload.historyOfPresentIllness ?? "";
  }

  encounter.deniesComorbidities = Boolean(deniesComorbidities);
  encounter.deniesAllergies = Boolean(deniesAllergies);
  encounter.deniesMedicationsInUse = Boolean(deniesMedications);

  if (encounter.deniesComorbidities) {
    encounter.comorbidities = "";
  } else if (payload.comorbidities !== undefined) {
    encounter.comorbidities = payload.comorbidities;
  }

  if (encounter.deniesAllergies) {
    encounter.allergies = "";
  } else if (payload.allergies !== undefined) {
    encounter.allergies = payload.allergies;
  }

  const medicationsInUse = payload.medicationsInUse ?? payload.currentMedications;
  if (encounter.deniesMedicationsInUse) {
    encounter.medicationsInUse = "";
  } else if (medicationsInUse !== undefined) {
    encounter.medicationsInUse = medicationsInUse;
  }

  if (payload.physicalExam !== undefined) {
    encounter.physicalExam = payload.physicalExam;
  }
  if (payload.diagnosticHypothesis !== undefined) {
    encounter.diagnosticHypothesis = payload.diagnosticHypothesis;
  }
  if (payload.conduct !== undefined) {
    encounter.conduct = payload.conduct;
  }

  await encounter.save();
  res.json({ encounter });
});

const listEncounters = asyncHandler(async (req, res) => {
  if (req.user?.role === "reception") {
    throw new ForbiddenError("Sem permissao");
  }
  const query = {};
  if (req.query.patient) query.patient = req.query.patient;
  const encounters = await Encounter.find(query)
    .sort({ createdAt: -1 })
    .populate("patient")
    .populate("clinician")
    .populate({
      path: "appointment",
      populate: [
        { path: "location", select: "name addressLine1 city state zipCode" },
        { path: "procedureType", select: "name" },
      ],
    });
  res.json({ encounters });
});

const getEncounterById = asyncHandler(async (req, res) => {
  if (req.user?.role === "reception") {
    throw new ForbiddenError("Sem permissao");
  }
  const encounter = await Encounter.findById(req.params.id)
    .populate("patient")
    .populate("clinician")
    .populate({
      path: "appointment",
      populate: [
        { path: "location", select: "name addressLine1 city state zipCode" },
        { path: "procedureType", select: "name" },
      ],
    });

  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const exams = await ExamResult.find({ encounter: encounter._id })
    .sort({ createdAt: -1 })
    .lean();

  const patient = encounter.patient || null;
  const normalizedPhone = String(patient?.phoneNormalized || "").trim();
  const whatsappMessages = normalizedPhone
    ? await WhatsAppMessage.find({
        $or: [{ patient: patient?._id || null }, { phoneNormalized: normalizedPhone }],
      })
        .sort({ receivedAt: -1 })
        .limit(100)
        .lean()
    : await WhatsAppMessage.find({ patient: patient?._id || null })
        .sort({ receivedAt: -1 })
        .limit(100)
        .lean();

  res.json({ encounter, exams, whatsappMessages });
});

function buildEncounterPdfFileName(encounter) {
  const patientSlug = String(encounter.patient?.fullName || "paciente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  const datePart = new Date(encounter.createdAt || Date.now()).toISOString().slice(0, 10);
  return `atendimento-${patientSlug || "paciente"}-${datePart}.pdf`;
}

const exportEncounterPdf = asyncHandler(async (req, res) => {
  if (req.user?.role === "reception") {
    throw new ForbiddenError("Sem permissao");
  }

  const encounter = await Encounter.findById(req.params.id)
    .populate("patient")
    .populate("clinician")
    .populate({
      path: "appointment",
      populate: [
        { path: "location" },
        { path: "procedureType" },
      ],
    });

  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const [exams, prescriptions] = await Promise.all([
    ExamResult.find({ encounter: encounter._id }).sort({ createdAt: 1 }).lean(),
    Prescription.find({ encounter: encounter._id }).sort({ createdAt: 1 }).lean(),
  ]);

  const pdfBuffer = await buildEncounterPdf({
    encounter,
    patient: encounter.patient,
    clinician: encounter.clinician,
    appointment: encounter.appointment,
    location: encounter.appointment?.location,
    procedureType: encounter.appointment?.procedureType,
    exams,
    prescriptions,
  });

  res
    .status(200)
    .setHeader("Content-Type", "application/pdf")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="${buildEncounterPdfFileName(encounter)}"`
    )
    .send(pdfBuffer);
});

const addExamResult = asyncHandler(async (req, res) => {
  const payload = examSchema.parse(req.body);
  const encounter = await Encounter.findById(req.params.id);
  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const exam = await ExamResult.create({
    patient: encounter.patient,
    encounter: encounter._id,
    examType: payload.examType,
    findings: payload.findings,
    attachedFileUrl: payload.attachedFileUrl,
    createdBy: req.userId,
  });

  res.status(201).json({ exam });
});

const issuePrescription = asyncHandler(async (req, res) => {
  const payload = prescriptionSchema.parse(req.body);
  const encounter = await Encounter.findById(req.params.id);
  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const [patient, doctor] = await Promise.all([
    Patient.findById(encounter.patient),
    User.findById(req.userId),
  ]);

  if (!patient || !doctor) {
    throw new NotFoundError("Paciente ou medico nao encontrado");
  }

  const prescription = await Prescription.create({
    encounter: encounter._id,
    patient: patient._id,
    doctor: doctor._id,
    medications: payload.medications,
    notes: payload.notes,
  });

  const pdfBuffer = await buildPrescriptionPdf({
    patientName: patient.fullName,
    doctorName: doctor.name,
    crm: doctor.crm,
    medications: payload.medications,
    notes: payload.notes,
    issuedAt: prescription.createdAt,
  });

  if (payload.sendByEmail && patient.email) {
    await sendMail({
      to: patient.email,
      subject: "Receita medica",
      text: "Segue em anexo sua receita medica.",
      attachments: [
        {
          filename: `receita-${prescription._id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }

  res
    .status(201)
    .setHeader("Content-Type", "application/pdf")
    .setHeader(
      "Content-Disposition",
      `inline; filename=receita-${prescription._id}.pdf`
    )
    .send(pdfBuffer);
});

const scheduleSurgery = asyncHandler(async (req, res) => {
  const payload = scheduleSurgerySchema.parse(req.body);
  const encounter = await Encounter.findById(req.params.id);
  if (!encounter) {
    throw new NotFoundError("Evolucao nao encontrada");
  }

  const plannedStart = new Date(payload.plannedDate);
  plannedStart.setSeconds(0, 0);
  if (plannedStart < new Date()) {
    throw new AppError("Data prevista deve ser futura.", 400);
  }

  const plannedEnd = new Date(plannedStart);
  const [procedure, location] = await Promise.all([
    ProcedureType.findById(payload.surgeryProcedureType),
    ClinicLocation.findById(payload.location),
  ]);
  if (!procedure || !location) {
    throw new NotFoundError("Procedimento ou local nao encontrado");
  }
  plannedEnd.setMinutes(plannedEnd.getMinutes() + (procedure.defaultDurationMinutes || 120));

  const locationPrice = (procedure.locationPrices || []).find(
    (entry) => String(entry.location) === String(location._id)
  );
  if ((procedure.locationPrices || []).length > 0 && !locationPrice) {
    throw new AppError("Procedimento nao disponivel para este endereco.", 400);
  }
  const calculatedPriceCents =
    (locationPrice?.priceCents ?? procedure.defaultPriceCents ?? 0) +
    (location.consultationPriceCents || 0);

  const appointment = await Appointment.create({
    patient: encounter.patient,
    location: payload.location,
    procedureType: payload.surgeryProcedureType,
    startsAt: plannedStart,
    endsAt: plannedEnd,
    status: "scheduled",
    notes: payload.notes || "Cirurgia programada em atendimento",
    calculatedPriceCents,
  });

  res.status(201).json({ appointment });
});

module.exports = {
  createEncounter,
  updateEncounter,
  listEncounters,
  getEncounterById,
  exportEncounterPdf,
  addExamResult,
  issuePrescription,
  scheduleSurgery,
};
