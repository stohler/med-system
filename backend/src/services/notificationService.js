const { MessageTemplate } = require("../models");
const { sendWhatsappNotification } = require("./whatsappService");
const { formatDisplayDate, formatDisplayTime } = require("../utils/displayTime");

const CONSULTATION_REMINDER_KEY = "consultation_reminder_1_day_before";

const DEFAULT_APPOINTMENT_TEMPLATE = `Confirmado agendamento

Agendamento: {{appointmentDate}} - {{appointmentTime}}
{{locationName}} - {{procedureName}}
{{locationAddress}}
Valor: {{procedurePriceBrl}}

As informacoes de preparo e orientacoes sobre o exame podem ser encontradas nesse link:

{{preparationInfoUrl}}

A nao realizacao correta do preparo, conforme orientado, pode acarretar a nao
realizacao do exame.`;

function buildAddressLine(location) {
  if (!location) return "-";
  const cityUf = [location.city, location.state].filter(Boolean).join(" - ");
  const parts = [location.addressLine1, cityUf, location.zipCode].filter(Boolean);
  return parts.join(", ") || "-";
}

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatCentsToBrl(cents) {
  return BRL_FORMATTER.format((Number(cents || 0) || 0) / 100);
}

function resolveProcedurePriceCents(procedure, locationId) {
  const locationPrices = Array.isArray(procedure?.locationPrices)
    ? procedure.locationPrices
    : [];
  const locationOverride = locationPrices.find(
    (item) => String(item?.location) === String(locationId)
  );
  if (locationOverride) {
    return Number(locationOverride.priceCents || 0);
  }
  return Number(procedure?.defaultPriceCents || 0);
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
    appointmentDate: formatDisplayDate(appointment?.startsAt),
    appointmentTime: formatDisplayTime(appointment?.startsAt),
    appointmentDateTime: `${formatDisplayDate(appointment?.startsAt)} - ${formatDisplayTime(
      appointment?.startsAt
    )}`,
    locationName: location?.name || "",
    locationAddress: buildAddressLine(location),
    procedureName: procedure?.name || "",
    procedurePriceBrl: formatCentsToBrl(
      resolveProcedurePriceCents(procedure, location?._id || appointment?.location)
    ),
    procedurePrice: formatCentsToBrl(
      resolveProcedurePriceCents(procedure, location?._id || appointment?.location)
    ),
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
