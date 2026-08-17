const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../app");
const { signToken } = require("../services/tokenService");
const {
  User,
  Patient,
  ClinicLocation,
  ProcedureType,
  Appointment,
  Encounter,
  ExamResult,
} = require("../models");

let mongoServer;
let app;
let doctorToken;
let receptionToken;
let encounterId;

async function seedEncounter() {
  const doctor = await User.create({
    name: "Dra. Ana Prado",
    email: "ana@clinica.com",
    passwordHash: "hash",
    role: "doctor",
    crm: "CRM-SP 55555",
  });
  const reception = await User.create({
    name: "Recepcao",
    email: "recepcao@clinica.com",
    passwordHash: "hash",
    role: "reception",
  });
  const patient = await Patient.create({
    fullName: "Carlos Andrade",
    birthDate: new Date("1975-02-10T00:00:00.000Z"),
    documentNumber: "98765432100",
    phone: "21988887777",
    email: "carlos@example.com",
  });
  const location = await ClinicLocation.create({
    name: "Unidade Barra",
    addressLine1: "Av. das Americas, 500",
    city: "Rio de Janeiro",
    state: "RJ",
    zipCode: "22640-100",
    consultationPriceCents: 20000,
  });
  const procedureType = await ProcedureType.create({
    name: "Colonoscopia",
    defaultDurationMinutes: 60,
    defaultPriceCents: 80000,
  });
  const appointment = await Appointment.create({
    patient: patient._id,
    location: location._id,
    procedureType: procedureType._id,
    startsAt: new Date("2026-04-01T12:00:00.000Z"),
    endsAt: new Date("2026-04-01T13:00:00.000Z"),
    status: "completed",
    calculatedPriceCents: 100000,
  });
  const encounter = await Encounter.create({
    appointment: appointment._id,
    patient: patient._id,
    clinician: doctor._id,
    currentIllnessHistory: "Sangramento intestinal ha uma semana.",
    comorbidities: "Diabetes tipo 2",
    allergies: "",
    deniesAllergies: true,
    medicationsInUse: "Metformina",
    physicalExam: "Sem alteracoes relevantes.",
    diagnosticHypothesis: "Polipo intestinal",
    conduct: "Solicitar biopsia.",
  });
  await ExamResult.create({
    patient: patient._id,
    encounter: encounter._id,
    examType: "Colonoscopia",
    findings: "Polipo sessil em colon descendente.",
    createdBy: doctor._id,
  });

  doctorToken = signToken({ sub: doctor._id.toString() });
  receptionToken = signToken({ sub: reception._id.toString() });
  encounterId = encounter._id.toString();
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: "med-system-test" });
  app = createApp();
  await seedEncounter();
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe("GET /api/encounters/:id/pdf", () => {
  it("exporta o atendimento como arquivo PDF", async () => {
    const response = await request(app)
      .get(`/api/encounters/${encounterId}/pdf`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .buffer()
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(
      "atendimento-carlos-andrade-"
    );
    expect(response.body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(response.body.length).toBeGreaterThan(1000);
  });

  it("retorna 404 para atendimento inexistente", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const response = await request(app)
      .get(`/api/encounters/${missingId}/pdf`)
      .set("Authorization", `Bearer ${doctorToken}`);

    expect(response.status).toBe(404);
  });

  it("bloqueia perfil de recepcao", async () => {
    const response = await request(app)
      .get(`/api/encounters/${encounterId}/pdf`)
      .set("Authorization", `Bearer ${receptionToken}`);

    expect(response.status).toBe(403);
  });

  it("exige autenticacao", async () => {
    const response = await request(app).get(`/api/encounters/${encounterId}/pdf`);
    expect(response.status).toBe(401);
  });
});
