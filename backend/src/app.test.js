const request = require("supertest");
const { createApp } = require("./app");

describe("health", () => {
  it("retorna status ok", async () => {
    const app = createApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
