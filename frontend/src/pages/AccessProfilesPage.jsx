import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "doctor", label: "Medico" },
  { value: "assistant", label: "Assistente" },
  { value: "reception", label: "Recepcao (agenda por endereco)" },
];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "assistant",
  crm: "",
  allowedLocationIds: [],
  active: true,
};

export function AccessProfilesPage() {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");

  const load = useCallback(async () => {
    const [u, l] = await Promise.all([api.get("/users"), api.get("/locations")]);
    setUsers(u.data.users || []);
    setLocations(l.data.locations || []);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar usuarios"));
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId("");
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "assistant",
      crm: user.crm || "",
      allowedLocationIds: Array.isArray(user.allowedLocationIds) ? [...user.allowedLocationIds] : [],
      active: user.active !== false,
    });
    setError("");
    setMessage("");
  };

  const toggleLocation = (locationId) => {
    const id = String(locationId);
    setForm((prev) => {
      const set = new Set(prev.allowedLocationIds.map(String));
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, allowedLocationIds: [...set] };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          crm: form.role === "doctor" ? form.crm : "",
          active: form.active,
          allowedLocationIds: form.role === "reception" ? form.allowedLocationIds : [],
        };
        if (form.password.trim()) payload.password = form.password.trim();
        await api.patch(`/users/${editingId}`, payload);
        setMessage("Usuario atualizado.");
      } else {
        if (!form.password.trim()) {
          setError("Senha obrigatoria para novo usuario.");
          return;
        }
        await api.post("/users", {
          name: form.name,
          email: form.email,
          password: form.password.trim(),
          role: form.role,
          crm: form.role === "doctor" ? form.crm : "",
          allowedLocationIds: form.role === "reception" ? form.allowedLocationIds : [],
        });
        setMessage("Usuario criado.");
      }
      await load();
      resetForm();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao salvar usuario");
    }
  };

  return (
    <section className="stack">
      <div className="page-title-row">
        <h2>Perfis de acesso</h2>
      </div>
      <p className="muted">
        Gerencie usuarios e o perfil de recepcao restrita (agenda e pacientes apenas nos enderecos
        selecionados).
      </p>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <div className="grid-cards">
        <form className="card form-grid" onSubmit={submit}>
          <h3>{editingId ? "Editar usuario" : "Novo usuario"}</h3>
          <label>
            Nome
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Senha {editingId ? "(deixe em branco para manter)" : ""}
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              minLength={editingId ? 0 : 6}
            />
          </label>
          <label>
            Papel
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {form.role === "doctor" ? (
            <label>
              CRM
              <input value={form.crm} onChange={(e) => setForm((f) => ({ ...f, crm: e.target.value }))} />
            </label>
          ) : null}
          {form.role === "reception" ? (
            <fieldset className="form-grid">
              <legend>Enderecos permitidos na agenda</legend>
              {locations.length === 0 ? (
                <p className="muted">Cadastre enderecos em Configuracoes.</p>
              ) : (
                locations.map((loc) => (
                  <label key={loc._id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.allowedLocationIds.map(String).includes(String(loc._id))}
                      onChange={() => toggleLocation(loc._id)}
                    />
                    <span>{loc.name}</span>
                  </label>
                ))
              )}
            </fieldset>
          ) : null}
          {editingId ? (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>Usuario ativo</span>
            </label>
          ) : null}
          <div className="form-title-row">
            <button type="submit">{editingId ? "Salvar alteracoes" : "Criar usuario"}</button>
            {editingId ? (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Cancelar edicao
              </button>
            ) : null}
          </div>
        </form>

        <div className="card">
          <h3>Usuarios cadastrados</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {ROLE_OPTIONS.find((r) => r.value === u.role)?.label || u.role}
                      {u.role === "reception" && u.allowedLocationIds?.length ? (
                        <span className="muted">
                          {" "}
                          ({u.allowedLocationIds.length} endereco
                          {u.allowedLocationIds.length > 1 ? "s" : ""})
                        </span>
                      ) : null}
                    </td>
                    <td>{u.active === false ? "Inativo" : "Ativo"}</td>
                    <td>
                      <button type="button" className="btn-ghost" onClick={() => startEdit(u)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
