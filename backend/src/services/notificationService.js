const { MessageTemplate } = require("../models");
const { sendWhatsappNotification } = require("./whatsappService");

const CONSULTATION_REMINDER_KEY = "consultation_reminder_1_day_before";

const DEFAULT_APPOINTMENT_TEMPLATE = `Confirmado agendamento

Agendamento: {{appointmentDate}} - {{appointmentTime}}
{{locationName}} - {{procedureName}}
{{locationAddress}}

As informacoes de preparo e orientacoes sobre o exame podem ser encontradas nesse link:

{{preparationInfoUrl}}

A nao realizacao correta do preparo, conforme orientado, pode acarretar a nao
realizacao do exame.`;

function formatDate(value) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatTime(value) {
  const date = new Date(value);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function buildAddressLine(location) {
  if (!location) return "-";
  const cityUf = [location.city, location.state].filter(Boolean).join(" - ");
  const parts = [location.addressLine1, cityUf, location.zipCode].filter(Boolean);
  return parts.join(", ") || "-";
}

function renderTemplate(template, context) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, token) => {
    return String(context[token] ?? "");
  });
}

async function resolveTemplate(procedure) {
  if (procedure?.appointmentConfirmationTemplate?.trim()) {
    return procedure.appointmentConfirmationTemplate.trim();
  }
  const globalTemplate = await MessageTemplate.findOne({
    key: CONSULTATION_REMINDER_KEY,
    enabled: true,
  }).lean();
  if (globalTemplate?.content) {
    return String(globalTemplate.content);
  }
  return DEFAULT_APPOINTMENT_TEMPLATE;
}

async function buildAppointmentNotificationMessage({ appointment, patient, procedure, location }) {
  const context = {
    patientName: patient?.fullName || "",
    appointmentDate: formatDate(appointment?.startsAt),
    appointmentTime: formatTime(appointment?.startsAt),
    appointmentDateTime: `${formatDate(appointment?.startsAt)} - ${formatTime(
      appointment?.startsAt
    )}`,
    locationName: location?.name || "",
    locationAddress: buildAddressLine(location),
    procedureName: procedure?.name || "",
    preparationInfoUrl: procedure?.preparationInfoUrl || "",
    notes: appointment?.notes || "",
  };
  const template = await resolveTemplate(procedure);
  return renderTemplate(template, context);
}

async function sendAppointmentNotification({ appointment, patient, procedure, location }) {
  if (!patient?.phone) return { sent: false };
  if (!procedure?.appointmentConfirmationEnabled) return { sent: false };
  const text = await buildAppointmentNotificationMessage({
    appointment,
    patient,
    procedure,
    location,
  });
  const sent = await sendWhatsappNotification({ phone: patient.phone, text }).catch(() => false);
  return { sent, text };
}

module.exports = {
  buildAppointmentNotificationMessage,
  sendAppointmentNotification,
};
