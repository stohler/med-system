/**
 * Helpers to match WhatsApp numbers (often DDI 55) with Patient.phone / phoneNormalized
 * (may be stored with or without country code).
 */

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Variants with and without leading 55 for exact-index lookups. */
function whatsappPhoneMatchVariants(normalizedDigits) {
  const d = digitsOnly(normalizedDigits);
  if (!d) return [];
  const set = new Set([d]);
  if (d.startsWith("55") && d.length > 4) {
    set.add(d.slice(2));
  }
  if (!d.startsWith("55") && d.length >= 10) {
    set.add(`55${d}`);
  }
  return [...set];
}

function buildLoosePhoneRegex(digits) {
  const normalized = digitsOnly(digits);
  if (!normalized) return null;
  const pattern = normalized.split("").join("\\D*");
  return new RegExp(`${pattern}$`);
}

/** Mongo query fragment: match patient by phoneNormalized or formatted phone field. */
function buildPatientPhoneMatchQuery(variants) {
  const list = (variants || []).filter(Boolean);
  if (!list.length) return null;
  const or = [];
  const seenRegex = new Set();
  for (const v of list) {
    or.push({ phoneNormalized: v });
  }
  for (const v of list) {
    const r = buildLoosePhoneRegex(v);
    if (r && !seenRegex.has(r.source)) {
      seenRegex.add(r.source);
      or.push({ phone: { $regex: r } });
    }
  }
  return { $or: or };
}

module.exports = {
  digitsOnly,
  whatsappPhoneMatchVariants,
  buildLoosePhoneRegex,
  buildPatientPhoneMatchQuery,
};
