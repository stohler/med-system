const { env } = require("../config/env");

function getDisplayTimeZone() {
  return env.displayTimezone || "America/Sao_Paulo";
}

function formatDisplayDate(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: getDisplayTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatDisplayTime(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: getDisplayTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

module.exports = {
  getDisplayTimeZone,
  formatDisplayDate,
  formatDisplayTime,
};
