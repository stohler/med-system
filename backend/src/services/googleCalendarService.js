const { google } = require("googleapis");
const { env } = require("../config/env");

function getOAuthClient() {
  if (!env.googleClientId || !env.googleClientSecret || !env.googleRedirectUri) {
    return null;
  }

  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri
  );
}

function getGoogleAuthUrl(state = "med-system") {
  const client = getOAuthClient();
  if (!client) return "";
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });
}

async function getGoogleTokens(code) {
  const client = getOAuthClient();
  if (!client) return null;
  const { tokens } = await client.getToken(code);
  return tokens;
}

async function createCalendarEvent({ tokens, appointment, patient, procedure, location }) {
  const client = getOAuthClient();
  if (!client || !tokens) return null;

  client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: client });

  const event = await calendar.events.insert({
    calendarId: env.googleCalendarId,
    requestBody: {
      summary: `${procedure.name} - ${patient.fullName}`,
      description: `Paciente: ${patient.fullName}\nDocumento: ${patient.documentNumber || "-"}\nObservacoes: ${appointment.notes || "-"}`,
      location: `${location.name} - ${location.addressLine1}`,
      start: { dateTime: appointment.startsAt.toISOString() },
      end: { dateTime: appointment.endsAt.toISOString() },
    },
  });

  return event.data;
}

async function updateCalendarEvent({
  tokens,
  eventId,
  appointment,
  patient,
  procedure,
  location,
}) {
  const client = getOAuthClient();
  if (!client || !tokens || !eventId) return null;

  client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: client });

  const event = await calendar.events.update({
    calendarId: env.googleCalendarId,
    eventId,
    requestBody: {
      summary: `${procedure.name} - ${patient.fullName}`,
      description: `Paciente: ${patient.fullName}\nDocumento: ${patient.documentNumber || "-"}\nObservacoes: ${appointment.notes || "-"}`,
      location: `${location.name} - ${location.addressLine1}`,
      start: { dateTime: appointment.startsAt.toISOString() },
      end: { dateTime: appointment.endsAt.toISOString() },
    },
  });

  return event.data;
}

module.exports = {
  getGoogleAuthUrl,
  getGoogleTokens,
  createCalendarEvent,
  updateCalendarEvent,
};
