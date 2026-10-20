import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiKeysPage } from "./ApiKeysPage";
import { ToastProvider } from "../toast";
import { api } from "../api";

vi.mock("../api", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const users = [{ id: "u1", name: "Recepcao Bot", role: "reception", active: true }];

function renderPage() {
  return render(
    <ToastProvider>
      <ApiKeysPage />
    </ToastProvider>
  );
}

describe("ApiKeysPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.get.mockImplementation((url) => {
      if (url === "/users") return Promise.resolve({ data: { users } });
      return Promise.resolve({
        data: {
          apiKeys: [
            {
              id: "k1",
              name: "Grok Bot",
              prefix: "msk_AbCdEf",
              user: { name: "Recepcao Bot" },
              scopes: ["patients:read"],
              revokedAt: null,
              expiresAt: null,
              lastUsedAt: null,
            },
          ],
        },
      });
    });
  });

  it("lista as chaves existentes sem expor o valor completo", async () => {
    renderPage();
    expect(await screen.findByText("Grok Bot")).toBeTruthy();
    expect(screen.getByText("msk_AbCdEf...")).toBeTruthy();
    expect(screen.getByText("Ativa")).toBeTruthy();
  });

  it("cria a chave e exibe o valor para copia", async () => {
    api.post.mockResolvedValue({
      data: { apiKey: { id: "k2", name: "Novo Bot" }, key: "msk_segredo123" },
    });
    renderPage();
    await screen.findByText("Grok Bot");

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Bot" } });
    fireEvent.change(screen.getByLabelText("Usuario dono da chave"), { target: { value: "u1" } });
    fireEvent.change(screen.getByLabelText("Expiracao"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar API key" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api-keys", {
        name: "Novo Bot",
        scopes: [
          "patients:read",
          "patients:write",
          "appointments:read",
          "appointments:write",
          "catalog:read",
        ],
        userId: "u1",
        expiresInDays: 90,
      })
    );
    expect(await screen.findByDisplayValue("msk_segredo123")).toBeTruthy();
  });

  it("revoga a chave apos confirmacao", async () => {
    api.delete.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByText("Grok Bot");

    fireEvent.click(screen.getByRole("button", { name: "Revogar" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector("button:last-child"));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api-keys/k1"));
  });
});
