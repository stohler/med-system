const zlib = require("node:zlib");
const { buildEncounterPdf } = require("./pdfService");

/**
 * pdfkit escreve o texto em operadores TJ como grupos hexadecimais intercalados por
 * ajustes de kerning, entao decodificar e concatenar os grupos reconstroi as frases.
 */
function decodeContentStreamText(content) {
  const groups = content.match(/<([0-9A-Fa-f]+)>/g) || [];
  return groups
    .map((group) => Buffer.from(group.slice(1, -1), "hex").toString("latin1"))
    .join("");
}

function extractPdfText(buffer) {
  const parts = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const start = buffer.indexOf("stream", cursor);
    if (start === -1) break;
    const end = buffer.indexOf("endstream", start);
    if (end === -1) break;
    const rawStart = buffer[start + 6] === 0x0d ? start + 8 : start + 7;
    const chunk = buffer.subarray(rawStart, end);
    let content;
    try {
      content = zlib.inflateSync(chunk).toString("latin1");
    } catch {
      content = chunk.toString("latin1");
    }
    parts.push(decodeContentStreamText(content));
    cursor = end + 9;
  }
  return parts.join("\n");
}

const baseEncounter = {
  _id: "6650f1a2b3c4d5e6f7a8b9c0",
  currentIllnessHistory: "Dor abdominal ha tres dias com piora noturna.",
  comorbidities: "Hipertensao arterial",
  deniesComorbidities: false,
  allergies: "",
  deniesAllergies: true,
  medicationsInUse: "Losartana 50mg",
  deniesMedicationsInUse: false,
  physicalExam: "Abdome doloroso a palpacao em epigastrio.",
  diagnosticHypothesis: "Gastrite aguda",
  conduct: "Iniciar inibidor de bomba de protons e retorno em 15 dias.",
  createdAt: new Date("2026-03-10T13:30:00.000Z"),
  updatedAt: new Date("2026-03-10T14:00:00.000Z"),
};

const basePatient = {
  fullName: "Maria Souza",
  birthDate: new Date("1980-05-20T00:00:00.000Z"),
  documentNumber: "12345678900",
  phone: "21999998888",
  email: "maria@example.com",
  address: { street: "Rua A, 100", city: "Rio de Janeiro", state: "RJ", zipCode: "20000-000" },
  allergies: ["Dipirona"],
  conditions: ["Hipertensao"],
};

describe("buildEncounterPdf", () => {
  it("gera um PDF valido com os dados completos do atendimento", async () => {
    const buffer = await buildEncounterPdf({
      encounter: baseEncounter,
      patient: basePatient,
      clinician: { name: "Dr. Joao Lima", crm: "CRM-RJ 12345", email: "joao@clinica.com" },
      appointment: {
        startsAt: new Date("2026-03-10T13:00:00.000Z"),
        endsAt: new Date("2026-03-10T13:30:00.000Z"),
        status: "completed",
        calculatedPriceCents: 35000,
        notes: "Retorno de consulta",
      },
      location: {
        name: "Unidade Centro",
        addressLine1: "Av. Rio Branco, 1",
        city: "Rio de Janeiro",
        state: "RJ",
        zipCode: "20090-000",
      },
      procedureType: { name: "Consulta" },
      exams: [
        {
          examType: "Endoscopia",
          findings: "Mucosa gastrica hiperemiada.",
          createdAt: new Date("2026-03-10T13:45:00.000Z"),
        },
      ],
      prescriptions: [
        {
          createdAt: new Date("2026-03-10T13:50:00.000Z"),
          medications: [
            { name: "Omeprazol", instructions: "1 comprimido em jejum", durationDays: 15 },
          ],
          notes: "Evitar bebidas alcoolicas",
        },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");

    const text = extractPdfText(buffer);
    expect(text).toContain("Relatorio de Atendimento");
    expect(text).toContain("Maria Souza");
    expect(text).toContain("Dr. Joao Lima");
    expect(text).toContain("Unidade Centro");
    expect(text).toContain("Consulta");
    expect(text).toContain("Gastrite aguda");
    expect(text).toContain("Endoscopia");
    expect(text).toContain("Omeprazol");
    expect(text).toContain("Realizado");
    expect(text).toContain("R$");
  });

  it("indica campos negados e listas vazias sem quebrar a geracao", async () => {
    const buffer = await buildEncounterPdf({
      encounter: {
        ...baseEncounter,
        deniesComorbidities: true,
        comorbidities: "",
        deniesMedicationsInUse: true,
        medicationsInUse: "",
      },
      patient: { fullName: "Jose Silva" },
      clinician: null,
      appointment: null,
      location: null,
      procedureType: null,
      exams: [],
      prescriptions: [],
    });

    const text = extractPdfText(buffer);
    expect(text).toContain("Paciente nega comorbidades.");
    expect(text).toContain("Paciente nega alergias.");
    expect(text).toContain("Paciente nega uso de medicamentos.");
    expect(text).toContain("Nenhum exame registrado neste atendimento.");
    expect(text).toContain("Nenhuma receita emitida neste atendimento.");
  });
});
