const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../app");
const { signToken } = require("../services/tokenService");
const { User, ApiKey, ClinicLocation, ProcedureType, AuditLog } = require("../models");

let mongoServer;
let app;
let adminToken;
let receptionToken;
let admin;
let location;
let procedure;

async function createKey(body) {
  const response = await request(app)
    .post("/api/api-keys")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
  return response;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: "med-system-apikey-test" });
  app = createApp();

  admin = await User.create({
    name: "Admin",
    email: "admin@clinica.com",
    passwordHash: "hash",
    role: "admin",
  });
  const reception = await User.create({
    name: "Recepcao",
    email: "recepcao@clinica.com",
    passwordHash: "hash",
    role: "reception",
  });
  adminToken = signToken({ sub: admin._id.toString() });
  receptionToken = signToken({ sub: reception._id.toString() });

  location = await ClinicLocation.create({
    name: "Unidade Centro",
    addressLine1: "Rua Central, 100",
    city: "Sao Paulo",
    state: "SP",
    zipCode: "01000-000",
    consultationPriceCents: 10000,
  });
  procedure = await ProcedureType.create({
    name: "Consulta",
    defaultDurationMinutes: 30,
    defaultPriceCents: 5000,
  });
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe("gerenciamento de API keys", () => {
  it("lista os escopos disponiveis", async () => {
    const response = await request(app)
      .get("/api/api-keys/scopes")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.scopes).toContain("patients:read");
  });

  it("cria a chave, mostra o valor uma unica vez e salva apenas o hash", async () => {
    const response = await createKey({ name: "Grok Bot", scopes: ["patients:read"] });
    expect(response.status).toBe(201);
    expect(response.body.key).toMatch(/^msk_/);

    const stored = await ApiKey.findById(response.body.apiKey.id).lean();
    expect(stored.keyHash).not.toContain(response.body.key);
    expect(JSON.stringify(stored)).not.toContain(response.body.key);

    const list = await request(app)
      .get("/api/api-keys")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(response.body.key);
    expect(JSON.stringify(list.body)).not.toContain("keyHash");
  });

  it("exige perfil admin e ao menos um escopo valido", async () => {
    const forbidden = await request(app)
      .post("/api/api-keys")
      .set("Authorization", `Bearer ${receptionToken}`)
      .send({ name: "x1", scopes: ["patients:read"] });
    expect(forbidden.status).toBe(403);

    const noScopes = await createKey({ name: "Sem escopo", scopes: [] });
    expect(noScopes.status).toBeGreaterThanOrEqual(400);
    const badScope = await createKey({ name: "Escopo ruim", scopes: ["users:write"] });
    expect(badScope.status).toBeGreaterThanOrEqual(400);
  });

  it("a propria API key nao consegue gerenciar API keys", async () => {
    const created = await createKey({ name: "Bot admin", scopes: ["patients:read"] });
    const response = await request(app)
      .get("/api/api-keys")
      .set("X-API-Key", created.body.key);
    expect(response.status).toBe(401);
  });
});

describe("uso da API key", () => {
  it("gerencia pacientes e agendamentos usando X-API-Key", async () => {
    const created = await createKey({
      name: "Grok Bot",
      scopes: [
        "patients:read",
        "patients:write",
        "appointments:read",
        "appointments:write",
        "catalog:read",
      ],
    });
    const key = created.body.key;

    const locations = await request(app).get("/api/locations").set("X-API-Key", key);
    expect(locations.status).toBe(200);
    expect(locations.body.locations).toHaveLength(1);

    const procedures = await request(app).get("/api/procedures").set("X-API-Key", key);
    expect(procedures.status).toBe(200);

    const patient = await request(app)
      .post("/api/patients")
      .set("X-API-Key", key)
      .send({ fullName: "Maria Souza", phone: "11999998888" });
    expect(patient.status).toBe(201);
    const patientId = patient.body.data._id;

    const search = await request(app)
      .get("/api/patients?q=maria")
      .set("Authorization", `Bearer ${key}`);
    expect(search.status).toBe(200);
    expect(search.body.total).toBe(1);

    const detail = await request(app).get(`/api/patients/${patientId}`).set("X-API-Key", key);
    expect(detail.status).toBe(200);
    expect(detail.body.encounters).toBeUndefined();
    expect(detail.body.whatsappMessages).toBeUndefined();

    const appointment = await request(app)
      .post("/api/appointments")
      .set("X-API-Key", key)
      .send({
        patient: patientId,
        location: location._id.toString(),
        procedureType: procedure._id.toString(),
        startsAt: "2030-01-10T13:00:00.000Z",
        endsAt: "2030-01-10T13:30:00.000Z",
      });
    expect(appointment.status).toBe(201);
    const appointmentId = appointment.body.appointment._id;

    const conflict = await request(app)
      .post("/api/appointments")
      .set("X-API-Key", key)
      .send({
        patient: patientId,
        location: location._id.toString(),
        procedureType: procedure._id.toString(),
        startsAt: "2030-01-10T13:15:00.000Z",
        endsAt: "2030-01-10T13:45:00.000Z",
      });
    expect(conflict.status).toBe(409);

    const cancelled = await request(app)
      .put(`/api/appointments/${appointmentId}`)
      .set("X-API-Key", key)
      .send({ status: "cancelled" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.appointment.status).toBe("cancelled");

    const list = await request(app)
      .get("/api/appointments?from=2030-01-01T00:00:00.000Z")
      .set("X-API-Key", key);
    expect(list.status).toBe(200);
    expect(list.body.appointments).toHaveLength(1);

    const audits = await AuditLog.find({ action: "api_key.request" });
    expect(audits.length).toBeGreaterThanOrEqual(3);

    const stored = await ApiKey.findById(created.body.apiKey.id);
    expect(stored.lastUsedAt).toBeTruthy();
  });

  it("bloqueia acoes fora dos escopos concedidos", async () => {
    const created = await createKey({ name: "Somente leitura", scopes: ["patients:read"] });
    const key = created.body.key;

    const write = await request(app)
      .post("/api/patients")
      .set("X-API-Key", key)
      .send({ fullName: "Joao Silva" });
    expect(write.status).toBe(403);

    const del = await request(app)
      .delete(`/api/patients/${new mongoose.Types.ObjectId()}`)
      .set("X-API-Key", key);
    expect(del.status).toBe(403);

    const appointments = await request(app).get("/api/appointments").set("X-API-Key", key);
    expect(appointments.status).toBe(403);
  });

  it("nao da acesso a rotas fora de pacientes, agendamentos e catalogo", async () => {
    const created = await createKey({
      name: "Bot amplo",
      scopes: ["patients:read", "appointments:read", "catalog:read"],
    });
    const key = created.body.key;

    for (const path of ["/api/users", "/api/encounters", "/api/reports/summary"]) {
      const response = await request(app).get(path).set("X-API-Key", key);
      expect(response.status).toBe(401);
    }
    const createLocation = await request(app)
      .post("/api/locations")
      .set("X-API-Key", key)
      .send({});
    expect(createLocation.status).toBe(401);
  });

  it("rejeita chaves invalidas, revogadas, expiradas ou de usuario inativo", async () => {
    const invalid = await request(app).get("/api/patients").set("X-API-Key", "msk_invalida");
    expect(invalid.status).toBe(401);

    const revoked = await createKey({ name: "Revogada", scopes: ["patients:read"] });
    const revokeResponse = await request(app)
      .delete(`/api/api-keys/${revoked.body.apiKey.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body.apiKey.revokedAt).toBeTruthy();
    const afterRevoke = await request(app)
      .get("/api/patients")
      .set("X-API-Key", revoked.body.key);
    expect(afterRevoke.status).toBe(401);

    const expired = await createKey({
      name: "Expirada",
      scopes: ["patients:read"],
      expiresInDays: 1,
    });
    await ApiKey.updateOne(
      { _id: expired.body.apiKey.id },
      { expiresAt: new Date(Date.now() - 1000) }
    );
    const afterExpire = await request(app)
      .get("/api/patients")
      .set("X-API-Key", expired.body.key);
    expect(afterExpire.status).toBe(401);

    const owner = await User.create({
      name: "Bot user",
      email: "bot@clinica.com",
      passwordHash: "hash",
      role: "assistant",
    });
    const ownedKey = await createKey({
      name: "Do bot",
      scopes: ["patients:read"],
      userId: owner._id.toString(),
    });
    expect(ownedKey.status).toBe(201);
    await User.updateOne({ _id: owner._id }, { active: false });
    const inactive = await request(app)
      .get("/api/patients")
      .set("X-API-Key", ownedKey.body.key);
    expect(inactive.status).toBe(401);
  });

  it("respeita a restricao de endereco do usuario dono da chave", async () => {
    const otherLocation = await ClinicLocation.create({
      name: "Unidade Norte",
      addressLine1: "Rua Norte, 200",
      city: "Sao Paulo",
      state: "SP",
      zipCode: "02000-000",
      consultationPriceCents: 10000,
    });
    const botUser = await User.create({
      name: "Recepcao Bot",
      email: "recepcao-bot@clinica.com",
      passwordHash: "hash",
      role: "reception",
      allowedLocationIds: [location._id],
    });
    const created = await createKey({
      name: "Bot recepcao",
      scopes: ["appointments:write", "catalog:read"],
      userId: botUser._id.toString(),
    });
    const key = created.body.key;

    const locations = await request(app).get("/api/locations").set("X-API-Key", key);
    expect(locations.body.locations.map((l) => l.name)).toEqual(["Unidade Centro"]);

    const patient = await mongoose.model("Patient").create({ fullName: "Ana Lima" });
    const response = await request(app)
      .post("/api/appointments")
      .set("X-API-Key", key)
      .send({
        patient: patient._id.toString(),
        location: otherLocation._id.toString(),
        procedureType: procedure._id.toString(),
        startsAt: "2030-02-10T13:00:00.000Z",
        endsAt: "2030-02-10T13:30:00.000Z",
      });
    expect(response.status).toBe(403);
  });
});
