import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../toast";
import {
  AGENT_SCOPES,
  EXPIRATION_OPTIONS,
  SCOPE_OPTIONS,
  STATUS_LABELS,
  apiKeyStatus,
} from "../utils/apiKeyUtils";

const emptyForm = {
  name: "",
  userId: "",
  scopes: [...AGENT_SCOPES],
  expiresInDays: "",
};

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

export function ApiKeysPage() {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = useCallback(async () => {
    const [keysResponse, usersResponse] = await Promise.all([
      api.get("/api-keys"),
      api.get("/users"),
    ]);
    setApiKeys(keysResponse.data.apiKeys || []);
    setUsers((usersResponse.data.users || []).filter((user) => user.active !== false));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar API keys"));
  }, [load]);

  const toggleScope = (scope) => {
    setForm((prev) => {
      const next = new Set(prev.scopes);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return { ...prev, scopes: [...next] };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.scopes.length === 0) {
      setError("Selecione ao menos uma permissao.");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), scopes: form.scopes };
      if (form.userId) payload.userId = form.userId;
      if (form.expiresInDays) payload.expiresInDays = Number(form.expiresInDays);
      const { data } = await api.post("/api-keys", payload);
      setCreatedKey({ name: data.apiKey.name, key: data.key });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao criar API key");
    } finally {
      setSaving(false);
    }
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(createdKey.key);
      toast.success("Chave copiada.");
    } catch (_err) {
      toast.error("Nao foi possivel copiar. Selecione e copie manualmente.");
    }
  };

  const confirmRevoke = async () => {
    const target = revokeTarget;
    setRevokeTarget(null);
    try {
      await api.delete(`/api-keys/${target.id}`);
      toast.success("API key revogada.");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao revogar API key");
    }
  };

  const ownerLabel = (apiKey) => {
    const owner = apiKey.user;
    if (owner && typeof owner === "object") return owner.name || owner.email || "-";
    return users.find((user) => user.id === owner)?.name || "-";
  };

  return (
    <section className="stack">
      <div className="page-title-row">
        <h2>API Keys</h2>
      </div>
      <p className="muted">
        Chaves para agentes de IA (como o Grok Bot) gerenciarem pacientes e agenda pela API, sem
        usar esta interface. Cada chave herda o perfil e os enderecos permitidos do usuario
        escolhido e so acessa as permissoes selecionadas.
      </p>

      {error ? <p className="error">{error}</p> : null}

      {createdKey ? (
        <div className="card form-grid" role="status">
          <h3>Chave criada: {createdKey.name}</h3>
          <p className="muted">
            Copie e guarde esta chave agora. Por seguranca, ela nao sera exibida novamente.
          </p>
          <input readOnly value={createdKey.key} onFocus={(e) => e.target.select()} />
          <div className="modal-actions">
            <button type="button" onClick={copyKey}>
              Copiar chave
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreatedKey(null)}>
              Ja guardei a chave
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid-cards">
        <form className="card form-grid" onSubmit={submit}>
          <h3>Nova API key</h3>
          <label>
            Nome
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Grok Bot"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            Usuario dono da chave
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">Eu mesmo</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </label>
          <label>
            Expiracao
            <select
              value={form.expiresInDays}
              onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))}
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="form-grid">
            <legend>Permissoes</legend>
            {SCOPE_OPTIONS.map((scope) => (
              <label key={scope.value} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
                <span>{scope.label}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={saving}>
            {saving ? "Criando..." : "Criar API key"}
          </button>
        </form>

        <div className="card">
          <h3>Chaves cadastradas</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Chave</th>
                  <th>Usuario</th>
                  <th>Permissoes</th>
                  <th>Ultimo uso</th>
                  <th>Expira em</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      Nenhuma API key criada.
                    </td>
                  </tr>
                ) : null}
                {apiKeys.map((apiKey) => {
                  const status = apiKeyStatus(apiKey);
                  return (
                    <tr key={apiKey.id}>
                      <td>{apiKey.name}</td>
                      <td>
                        <code>{apiKey.prefix}...</code>
                      </td>
                      <td>{ownerLabel(apiKey)}</td>
                      <td>{apiKey.scopes.join(", ")}</td>
                      <td>{formatDateTime(apiKey.lastUsedAt)}</td>
                      <td>{formatDateTime(apiKey.expiresAt)}</td>
                      <td>{STATUS_LABELS[status]}</td>
                      <td>
                        {status === "revoked" ? null : (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setRevokeTarget(apiKey)}
                          >
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {revokeTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Revogar API key</h3>
            <p>
              Revogar a chave <strong>{revokeTarget.name}</strong>? Quem a utiliza perdera o
              acesso imediatamente e esta acao nao pode ser desfeita.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setRevokeTarget(null)}>
                Cancelar
              </button>
              <button type="button" onClick={confirmRevoke}>
                Revogar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
