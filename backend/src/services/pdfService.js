const PDFDocument = require("pdfkit");

function buildPrescriptionPdf({ patientName, doctorName, crm, medications, notes, issuedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

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
    doc.end();
  });
}

module.exports = { buildPrescriptionPdf };
