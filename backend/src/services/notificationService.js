const { sendMail } = require("./emailService");
const { getWhatsappStatus, sendWhatsappNotification } = require("./whatsappService");

async function sendAppointmentNotification({ patient, appointment }) {
  const formatted = new Date(appointment.startsAt).toLocaleString("pt-BR");
  const message = `Ola ${patient.fullName}, seu atendimento esta agendado para ${formatted}.`;

  let whatsappSent = false;
  const status = getWhatsappStatus();
  if (status.enabled && patient.phone) {
    whatsappSent = await sendWhatsappNotification({
      phone: patient.phone,
      text: message,
    }).catch(() => false);
  }

  let emailSent = false;
  if (patient.email) {
    const sent = await sendMail({
      to: patient.email,
      subject: "Confirmacao de agendamento",
      html: `<p>${message}</p>`,
      text: message,
    }).catch(() => null);
    emailSent = Boolean(sent);
  }

  return { whatsappSent, emailSent };
}

module.exports = { sendAppointmentNotification };
