const { ZodError } = require("zod");
const { BadRequestError } = require("../utils/errors");

const objectIdRegex = /^[a-f\d]{24}$/i;

function validateRequest(schema) {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new BadRequestError("Dados invalidos", {
            issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          })
        );
      }
      return next(error);
    }
  };
}

module.exports = { validateRequest, objectIdRegex };
