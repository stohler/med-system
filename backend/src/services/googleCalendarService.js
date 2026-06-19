const { google } = require("googleapis");
const { env } = require("../config/env");
const { encryptText, decryptText } = require("../utils/crypto");
const TOKEN_REFRESH_LEEWAY_MS = 60 * 1000;

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

function mergeGoogleTokens(currentTokens, incomingTokens) {
  const current = normalizeGoogleTokens(currentTokens) || {};
  const incoming = normalizeGoogleTokens(incomingTokens) || {};
  return normalizeGoogleTokens({
    access_token: incoming.access_token || current.access_token || "",
    refresh_token: incoming.refresh_token || current.refresh_token || "",
    scope: incoming.scope || current.scope || "",
    token_type: incoming.token_type || current.token_type || "",
    expiry_date:
      Number(incoming.expiry_date || 0) || Number(current.expiry_date || 0) || 0,
  });
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
    prompt: "consent",
    include_granted_scopes: true,
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
  const currentTokens = getStoredGoogleTokensForUser(user);
  const normalized = mergeGoogleTokens(currentTokens, tokens);
  if (!normalized) return null;

  user.googleCalendarTokensEncrypted = serializeGoogleTokens(normalized);
  user.googleCalendarConnectedAt = new Date();
  user.googleCalendarTokenExpiryAt = parseDate(normalized.expiry_date) || null;
  await user.save();
  return normalized;
}

function shouldRefreshGoogleAccessToken(tokens) {
  const normalized = normalizeGoogleTokens(tokens);
  if (!normalized) return false;
  if (!normalized.access_token) return Boolean(normalized.refresh_token);
  const expiryAt = parseDate(normalized.expiry_date);
  if (!expiryAt) return false;
  return expiryAt.getTime() <= Date.now() + TOKEN_REFRESH_LEEWAY_MS;
}

function getGoogleErrorMessage(error) {
  const apiDescription =
    error?.response?.data?.error_description || error?.response?.data?.error;
  const fallback = error?.message || "";
  return String(apiDescription || fallback || "").toLowerCase();
}

async function getValidGoogleTokensForUser(user) {
  const stored = getStoredGoogleTokensForUser(user);
  if (!stored) return null;
  if (!shouldRefreshGoogleAccessToken(stored)) return stored;
  if (!stored.refresh_token) return null;

  const client = getOAuthClient();
  if (!client) return stored;

  client.setCredentials(stored);
  try {
    await client.getAccessToken();
    const refreshed = mergeGoogleTokens(stored, client.credentials || {});
    await saveGoogleTokensForUser(user, refreshed);
    return refreshed;
  } catch (error) {
    const message = getGoogleErrorMessage(error);
    if (/invalid_grant|token has been expired|token has been revoked/.test(message)) {
      await clearGoogleTokensForUser(user);
      return null;
    }
    return stored;
  }
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

  let reason = "";
  if (!configured) reason = "google_not_configured";
  else if (!tokens) reason = "google_not_connected";
  else if (!hasAccessToken && !hasRefreshToken) reason = "google_tokens_invalid";
  else if (!hasRefreshToken && hasAccessToken && accessTokenExpired) {
    reason = "google_access_expired_without_refresh";
  }

  return {
    configured,
    connected,
    connectedAt: user?.googleCalendarConnectedAt || null,
    tokenExpiryAt: tokenExpiryAt || null,
    expiresAt: tokenExpiryAt || null,
    hasAccessToken,
    hasRefreshToken,
    accessTokenExpired,
    reason,
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
  getValidGoogleTokensForUser,
  saveGoogleTokensForUser,
  clearGoogleTokensForUser,
  getGoogleConnectionStatusForUser,
  createCalendarEvent,
  updateCalendarEvent,
};
