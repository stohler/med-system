const { z } = require("zod");
const {
  Encounter,
  Appointment,
  ProcedureType,
  ClinicLocation,
  ExamResult,
  Prescription,
  Patient,
  User,
} = require("../models");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError, NotFoundError } = require("../utils/errors");
const { buildPrescriptionPdf } = require("../services/pdfService");
const { sendMail } = require("../services/emailService");

const encounterSchema = z.object({
  appointment: z.string().min(1),
  historyOfPresentIllness: z.string().optional().default(""),
  comorbidities: z.string().optional().default(""),
  denyComorbidities: z.boolean().optional().default(false),
  allergies: z.string().optional().default(""),
  denyAllergies: z.boolean().optional().default(false),
  currentMedications: z.string().optional().default(""),
  denyCurrentMedications: z.boolean().optional().default(false),
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

const createEncounter = asyncHandler(async (req, res) => {
  const payload = encounterSchema.parse(req.body);
  const appointment = await Appointment.findById(payload.appointment);
  if (!appointment) {
    throw new NotFoundError("Agendamento nao encontrado");
  }

  const existing = await Encounter.findOne({ appointment: appointment._id });
  if (existing) {
    throw new AppError("Ja existe evolucao para este agendamento", 409);
  }

  const encounter = await Encounter.create({
    appointment: appointment._id,
    patient: appointment.patient,
    clinician: req.userId,
    historyOfPresentIllness: payload.historyOfPresentIllness,
    comorbidities: payload.denyComorbidities ? "" : payload.comorbidities,
    denyComorbidities: payload.denyComorbidities,
    allergies: payload.denyAllergies ? "" : payload.allergies,
    denyAllergies: payload.denyAllergies,
    currentMedications: payload.denyCurrentMedications
      ? ""
      : payload.currentMedications,
    denyCurrentMedications: payload.denyCurrentMedications,
    physicalExam: payload.physicalExam,
    diagnosticHypothesis: payload.diagnosticHypothesis,
    conduct: payload.conduct,
  });

  appointment.status = "completed";
  await appointment.save();

  res.status(201).json({ encounter });
});

const listEncounters = asyncHandler(async (req, res) => {
  const query = {};
  if (req.query.patient) query.patient = req.query.patient;
  const encounters = await Encounter.find(query)
    .sort({ createdAt: -1 })
    .populate(["patient", "clinician", "appointment"]);
  res.json({ encounters });
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

  const locationPrice = (procedure.pricesByLocation || []).find(
    (entry) => String(entry.location) === String(location._id)
  );
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
  listEncounters,
  addExamResult,
  issuePrescription,
  scheduleSurgery,
};
