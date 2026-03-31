import { useEffect, useState } from "react";
import { api } from "../api";

const initialForm = {
  fullName: "",
  birthDate: "",
  documentNumber: "",
  email: "",
  phone: "",
  notes: "",
};

export function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get("/patients");
    setPatients(data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError("Falha ao carregar pacientes"));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api.post("/patients", {
        ...form,
        birthDate: new Date(form.birthDate).toISOString(),
      });
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar paciente");
    }
  };

  return (
    <section className="stack">
      <h2>Pacientes</h2>

      <form onSubmit={submit} className="card form-grid">
        <label>
          Nome completo
          <input
            value={form.fullName}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            required
          />
        </label>
        <label>
          Nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))}
            required
          />
        </label>
        <label>
          Documento
          <input
            value={form.documentNumber}
            onChange={(e) => setForm((p) => ({ ...p, documentNumber: e.target.value }))}
            required
          />
        </label>
        <label>
          Telefone
          <input
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            required
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </label>
        <label>
          Observacoes
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </label>

        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Salvar paciente</button>
      </form>

      <div className="list">
        {patients.map((patient) => (
          <article key={patient._id} className="card-mini">
            <h3>{patient.fullName}</h3>
            <p>{patient.phone}</p>
            <p>{patient.email || "Sem email"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
