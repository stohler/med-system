import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

const PAGE_SIZE = 10;

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
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const navigate = useNavigate();
  const location = useLocation();

  const fromAgenda = useMemo(() => {
    const state = location.state || {};
    return state.returnTo === "/appointments";
  }, [location.state]);

  useEffect(() => {
    if (location.state?.prefillPatientName) {
      setForm((prev) => ({ ...prev, fullName: location.state.prefillPatientName }));
      setShowForm(true);
    }
  }, [location.state]);

  const load = async () => {
    const { data } = await api.get("/patients");
    setPatients(data.data || []);
  };

  useEffect(() => {
    load().catch(() => setError("Falha ao carregar pacientes"));
  }, []);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) =>
      `${patient.fullName} ${patient.documentNumber || ""} ${patient.phone || ""} ${patient.email || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [patients, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  const pagedPatients = filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const resetForm = () => {
    setEditingId("");
    setForm(initialForm);
    setShowForm(false);
  };

  const startEdit = (patient) => {
    setEditingId(patient._id);
    setForm({
      fullName: patient.fullName || "",
      birthDate: patient.birthDate ? dayjs(patient.birthDate).format("YYYY-MM-DD") : "",
      documentNumber: patient.documentNumber || "",
      email: patient.email || "",
      phone: patient.phone || "",
      notes: patient.notes || "",
    });
    setShowForm(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const payload = {
        ...form,
        birthDate: form.birthDate
          ? new Date(`${form.birthDate}T00:00:00`).toISOString()
          : "",
      };

      let saved;
      if (editingId) {
        const { data } = await api.put(`/patients/${editingId}`, payload);
        saved = data.data;
      } else {
        const { data } = await api.post("/patients", payload);
        saved = data.data;
      }

      await load();

      if (fromAgenda) {
        navigate("/appointments", {
          state: {
            selectedPatient: {
              id: saved._id,
              fullName: saved.fullName,
              birthDate: saved.birthDate,
            },
            openAppointmentForm: true,
          },
          replace: true,
        });
        return;
      }

      setMessage(editingId ? "Paciente atualizado com sucesso." : "Paciente cadastrado com sucesso.");
      resetForm();
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar paciente");
    }
  };

  return (
    <section className="stack">
      <div className="table-header">
        <h2>Pacientes</h2>
        <button
          type="button"
          onClick={() => {
            setEditingId("");
            setForm(initialForm);
            setShowForm(true);
          }}
        >
          + Adicionar paciente
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      {showForm ? (
        <form onSubmit={submit} className="card form-grid">
          <h3>{editingId ? "Editar paciente" : "Novo paciente"}</h3>
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
            />
          </label>
          <label>
            Documento
            <input
              value={form.documentNumber}
              onChange={(e) => setForm((p) => ({ ...p, documentNumber: e.target.value }))}
            />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
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

          <div className="inline-actions">
            <button type="submit">{editingId ? "Atualizar" : "Cadastrar"}</button>
            <button type="button" className="btn-ghost" onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div className="card table-wrap">
        <div className="table-header">
          <h3>Lista</h3>
          <input
            placeholder="Buscar paciente"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Nascimento</th>
              <th>Documento</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {pagedPatients.map((patient) => (
              <tr key={patient._id}>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => navigate(`/patients/${patient._id}`)}
                  >
                    {patient.fullName}
                  </button>
                </td>
                <td>{patient.birthDate ? dayjs(patient.birthDate).format("DD/MM/YYYY") : "-"}</td>
                <td>{patient.documentNumber || "-"}</td>
                <td>{patient.phone || "-"}</td>
                <td>{patient.email || "-"}</td>
                <td>
                  <button type="button" className="btn-ghost" onClick={() => startEdit(patient)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inline-actions">
          <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span>
            Pagina {page} de {totalPages}
          </span>
          <button type="button" className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Proxima
          </button>
        </div>
      </div>
    </section>
  );
}
