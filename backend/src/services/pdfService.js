const PDFDocument = require("pdfkit");
const { formatDisplayDate, formatDisplayTime } = require("../utils/displayTime");

const PLACEHOLDER = "-";

function renderToBuffer(render) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      render(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function buildPrescriptionPdf({ patientName, doctorName, crm, medications, notes, issuedAt }) {
  return renderToBuffer((doc) => {
    doc.fontSize(18).text("Receita Medica", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Paciente: ${patientName}`);
    doc.text(`Medico(a): ${doctorName} - CRM: ${crm || "N/A"}`);
    doc.text(`Emitida em: ${new Date(issuedAt).toLocaleString("pt-BR")}`);
    doc.moveDown();
    doc.text("Prescricao:");

    medications.forEach((item, idx) => {
      doc.text(`${idx + 1}. ${item.name} - ${item.instructions} (${item.durationDays} dias)`);
    });

    if (notes) {
      doc.moveDown();
      doc.text(`Observacoes: ${notes}`);
    }

    doc.moveDown(2);
    doc.text("Assinatura: __________________________");
  });
}

function formatDateTime(value) {
  const date = formatDisplayDate(value);
  if (!date) return "";
  const time = formatDisplayTime(value);
  return time ? `${date} ${time}` : date;
}

function formatCurrencyFromCents(cents) {
  if (typeof cents !== "number" || Number.isNaN(cents)) return "";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

const APPOINTMENT_STATUS_LABELS = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Realizado",
  cancelled: "Cancelado",
  no_show: "Falta",
};

function formatPatientAddress(address) {
  if (!address) return "";
  const street = [address.street, address.complement].filter(Boolean).join(" - ");
  const cityState = [address.city, address.state].filter(Boolean).join("/");
  return [street, cityState, address.zipCode].filter(Boolean).join(", ");
}

function formatLocationAddress(location) {
  if (!location) return "";
  const street = [location.addressLine1, location.addressLine2].filter(Boolean).join(" - ");
  const cityState = [location.city, location.state].filter(Boolean).join("/");
  return [street, cityState, location.zipCode].filter(Boolean).join(", ");
}

function describeDeniableField(denied, value, deniedLabel) {
  if (denied) return deniedLabel;
  return value && String(value).trim() ? value : PLACEHOLDER;
}

function buildEncounterPdf({
  encounter,
  patient,
  clinician,
  appointment,
  location,
  procedureType,
  exams = [],
  prescriptions = [],
  generatedAt = new Date(),
}) {
  return renderToBuffer((doc) => {
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const sectionTitle = (title) => {
      doc.moveDown(0.8);
      if (doc.y + 60 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      doc.fontSize(13).font("Helvetica-Bold").text(title);
      doc
        .moveTo(doc.page.margins.left, doc.y + 2)
        .lineTo(doc.page.margins.left + contentWidth, doc.y + 2)
        .stroke("#999999");
      doc.moveDown(0.5);
      doc.fontSize(11).font("Helvetica");
    };

    const field = (label, value) => {
      const text = value && String(value).trim() ? String(value) : PLACEHOLDER;
      doc.font("Helvetica-Bold").fontSize(11).text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(text);
    };

    const paragraph = (label, value) => {
      const text = value && String(value).trim() ? String(value) : PLACEHOLDER;
      doc.font("Helvetica-Bold").fontSize(11).text(label);
      doc.font("Helvetica").fontSize(11).text(text, { align: "justify" });
      doc.moveDown(0.4);
    };

    doc.fontSize(18).font("Helvetica-Bold").text("Relatorio de Atendimento", { align: "center" });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#555555")
      .text(`Documento gerado em ${formatDateTime(generatedAt)}`, { align: "center" })
      .text(`Identificador do atendimento: ${encounter?._id || PLACEHOLDER}`, { align: "center" })
      .fillColor("#000000");

    sectionTitle("Dados do paciente");
    const age = calculateAge(patient?.birthDate);
    field("Nome", patient?.fullName);
    field(
      "Nascimento",
      patient?.birthDate
        ? `${formatDisplayDate(patient.birthDate)}${age != null ? ` (${age} anos)` : ""}`
        : ""
    );
    field("Documento", patient?.documentNumber);
    field("Telefone", patient?.phone);
    field("E-mail", patient?.email);
    field("Endereco", formatPatientAddress(patient?.address));
    field("Alergias cadastradas", (patient?.allergies || []).join(", "));
    field("Condicoes cadastradas", (patient?.conditions || []).join(", "));

    sectionTitle("Dados do agendamento");
    field("Data/hora", formatDateTime(appointment?.startsAt));
    field(
      "Termino previsto",
      appointment?.endsAt ? formatDateTime(appointment.endsAt) : ""
    );
    field("Procedimento", procedureType?.name);
    field("Local", location?.name);
    field("Endereco do local", formatLocationAddress(location));
    field(
      "Status",
      appointment?.status ? APPOINTMENT_STATUS_LABELS[appointment.status] || appointment.status : ""
    );
    field("Valor", formatCurrencyFromCents(appointment?.calculatedPriceCents));
    field("Observacoes do agendamento", appointment?.notes);

    sectionTitle("Profissional responsavel");
    field("Nome", clinician?.name);
    field("CRM", clinician?.crm);
    field("E-mail", clinician?.email);

    sectionTitle("Evolucao clinica");
    field("Registrado em", formatDateTime(encounter?.createdAt));
    field("Ultima atualizacao", formatDateTime(encounter?.updatedAt));
    doc.moveDown(0.4);
    paragraph(
      "Historia da doenca atual",
      encounter?.currentIllnessHistory || encounter?.evolution
    );
    paragraph(
      "Comorbidades",
      describeDeniableField(
        encounter?.deniesComorbidities,
        encounter?.comorbidities,
        "Paciente nega comorbidades."
      )
    );
    paragraph(
      "Alergias",
      describeDeniableField(
        encounter?.deniesAllergies,
        encounter?.allergies,
        "Paciente nega alergias."
      )
    );
    paragraph(
      "Medicamentos em uso",
      describeDeniableField(
        encounter?.deniesMedicationsInUse,
        encounter?.medicationsInUse,
        "Paciente nega uso de medicamentos."
      )
    );
    paragraph("Exame fisico", encounter?.physicalExam);
    paragraph(
      "Hipotese diagnostica",
      encounter?.diagnosticHypothesis || encounter?.diagnosis
    );
    paragraph("Conduta", encounter?.conduct);

    sectionTitle("Resultados de exames");
    if (exams.length === 0) {
      doc.text("Nenhum exame registrado neste atendimento.");
    } else {
      exams.forEach((exam, index) => {
        doc
          .font("Helvetica-Bold")
          .text(`${index + 1}. ${exam.examType || PLACEHOLDER}`, { continued: true })
          .font("Helvetica")
          .text(` - ${formatDateTime(exam.createdAt)}`);
        doc.text(exam.findings || PLACEHOLDER, { align: "justify" });
        if (exam.attachedFileUrl) {
          doc.text(`Anexo: ${exam.attachedFileUrl}`);
        }
        doc.moveDown(0.4);
      });
    }

    sectionTitle("Receitas emitidas");
    if (prescriptions.length === 0) {
      doc.text("Nenhuma receita emitida neste atendimento.");
    } else {
      prescriptions.forEach((prescription, index) => {
        doc
          .font("Helvetica-Bold")
          .text(`${index + 1}. Emitida em ${formatDateTime(prescription.createdAt)}`);
        doc.font("Helvetica");
        (prescription.medications || []).forEach((medication) => {
          doc.text(
            `   - ${medication.name} | ${medication.instructions} | ${medication.durationDays} dia(s)`
          );
        });
        if (prescription.notes) {
          doc.text(`   Observacoes: ${prescription.notes}`);
        }
        doc.moveDown(0.4);
      });
    }

    doc.moveDown(2);
    doc.text("Assinatura: __________________________", { align: "right" });
    doc
      .fontSize(9)
      .fillColor("#555555")
      .text(
        "Documento sigiloso. Uso restrito ao paciente e a equipe assistencial responsavel.",
        { align: "center" }
      )
      .fillColor("#000000");
  });
}

module.exports = { buildPrescriptionPdf, buildEncounterPdf };
