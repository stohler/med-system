import { describe, expect, it } from "vitest";
import { apiKeyStatus, AGENT_SCOPES, SCOPE_OPTIONS } from "./apiKeyUtils";

describe("apiKeyStatus", () => {
  const now = new Date("2030-01-10T00:00:00.000Z");

  it("identifica chave ativa", () => {
    expect(apiKeyStatus({ revokedAt: null, expiresAt: null }, now)).toBe("active");
    expect(apiKeyStatus({ expiresAt: "2030-02-01T00:00:00.000Z" }, now)).toBe("active");
  });

  it("identifica chave revogada e expirada", () => {
    expect(apiKeyStatus({ revokedAt: "2030-01-01T00:00:00.000Z" }, now)).toBe("revoked");
    expect(apiKeyStatus({ expiresAt: "2030-01-01T00:00:00.000Z" }, now)).toBe("expired");
  });
});

describe("escopos", () => {
  it("o conjunto recomendado usa apenas escopos validos", () => {
    const valid = SCOPE_OPTIONS.map((s) => s.value);
    expect(AGENT_SCOPES.every((s) => valid.includes(s))).toBe(true);
  });
});
