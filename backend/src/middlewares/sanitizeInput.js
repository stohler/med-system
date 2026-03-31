function sanitizeObject(input) {
  if (!input || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      input[i] = sanitizeObject(input[i]);
    }
    return input;
  }

  for (const key of Object.keys(input)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete input[key];
      continue;
    }
    input[key] = sanitizeObject(input[key]);
  }

  return input;
}

function sanitizeInput(req, _res, next) {
  sanitizeObject(req.body);
  sanitizeObject(req.params);
  sanitizeObject(req.query);
  next();
}

module.exports = { sanitizeInput };
