const { google } = require("googleapis");
const { env } = require("../config/env");
const { encryptText, decryptText } = require("../utils/crypto");

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeGoogleTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return null;
  return {
    access_token: tokens.access_token || "",
    refresh_token: tokens.refresh_token || "",
    scope: tokens.scope || "",
    token_type: tokens.token_type || "",
    expiry_date: Number(tokens.expiry_date || 0) || 0,
  };
}

function serializeGoogleTokens(tokens) {
  const normalized = normalizeGoogleTokens(tokens);
  if (!normalized) return "";
  return encryptText(JSON.stringify(normalized));
}

function deserializeGoogleTokens(encryptedPayload) {
  if (!encryptedPayload) return null;
  try {
    const raw = decryptText(encryptedPayload);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeGoogleTokens(parsed);
  } catch (_error) {
    return null;
  }
}

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
  return normalizeGoogleTokens(tokens);
}

function getStoredGoogleTokensForUser(user) {
  if (!user) return null;
  return deserializeGoogleTokens(user.googleCalendarTokensEncrypted);
}

async function saveGoogleTokensForUser(user, tokens) {
  if (!user) return null;
  const normalized = normalizeGoogleTokens(tokens);
  if (!normalized) return null;

  user.googleCalendarTokensEncrypted = serializeGoogleTokens(normalized);
  user.googleCalendarConnectedAt = new Date();
  user.googleCalendarTokenExpiryAt = parseDate(normalized.expiry_date) || null;
  await user.save();
  return normalized;
}

async function clearGoogleTokensForUser(user) {
  if (!user) return;
  user.googleCalendarTokensEncrypted = "";
  user.googleCalendarConnectedAt = null;
  user.googleCalendarTokenExpiryAt = null;
  await user.save();
}

function getGoogleConnectionStatusForUser(user) {
  const configured = Boolean(
    env.googleClientId && env.googleClientSecret && env.googleRedirectUri
  );
  const tokens = getStoredGoogleTokensForUser(user);
  const hasAccessToken = Boolean(tokens?.access_token);
  const hasRefreshToken = Boolean(tokens?.refresh_token);
  const tokenExpiryAt = parseDate(tokens?.expiry_date);
  const accessTokenExpired = tokenExpiryAt
    ? tokenExpiryAt.getTime() <= Date.now()
    : false;

  const connected =
    configured &&
    Boolean(tokens) &&
    (hasRefreshToken || (hasAccessToken && !accessTokenExpired));

  return {
    configured,
    connected,
    connectedAt: user?.googleCalendarConnectedAt || null,
    tokenExpiryAt: tokenExpiryAt || null,
    hasAccessToken,
    hasRefreshToken,
    accessTokenExpired,
  };
}

function buildCalendarEventRequestBody({ appointment, patient, procedure, location }) {
  return {
    summary: `${procedure.name} - ${patient.fullName}`,
    description: `Paciente: ${patient.fullName}\nDocumento: ${patient.documentNumber || "-"}\nObservacoes: ${appointment.notes || "-"}`,
    location: `${location.name} - ${location.addressLine1}`,
    start: { dateTime: appointment.startsAt.toISOString() },
    end: { dateTime: appointment.endsAt.toISOString() },
  };
}

async function createCalendarEvent({ tokens, appointment, patient, procedure, location }) {
  const client = getOAuthClient();
  if (!client || !tokens) return null;

  client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: client });

  const event = await calendar.events.insert({
    calendarId: env.googleCalendarId,
    requestBody: buildCalendarEventRequestBody({
      appointment,
      patient,
      procedure,
      location,
    }),
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
    requestBody: buildCalendarEventRequestBody({
      appointment,
      patient,
      procedure,
      location,
    }),
  });

  return event.data;
}

module.exports = {
  getGoogleAuthUrl,
  getGoogleTokens,
  getStoredGoogleTokensForUser,
  saveGoogleTokensForUser,
  clearGoogleTokensForUser,
  getGoogleConnectionStatusForUser,
  createCalendarEvent,
  updateCalendarEvent,
};
