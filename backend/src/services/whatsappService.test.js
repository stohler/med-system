const { _private } = require("./whatsappService");

describe("whatsappService phone formatting", () => {
  it("formats external service phone payload with +55 country code", () => {
    expect(_private.formatWhatsappServicePhone("21997005937")).toBe("+5521997005937");
    expect(_private.formatWhatsappServicePhone("5521997005937")).toBe("+5521997005937");
    expect(_private.formatWhatsappServicePhone("+55 (21) 99700-5937")).toBe(
      "+5521997005937"
    );
  });

  it("keeps internal WhatsApp phone normalization as digits only", () => {
    expect(_private.normalizeWhatsappPhone("+55 (21) 99700-5937")).toBe(
      "5521997005937"
    );
  });
});
