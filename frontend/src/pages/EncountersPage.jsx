import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useLocation } from "react-router-dom";
import { api } from "../api";

const PAGE_SIZE = 10;

export function EncountersPage() {
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [encounterForm, setEncounterForm] = useState({
    appointment: "",
    anamnesis: "",
    evolution: "",
    diagnosis: "",
  });

  const [examForm, setExamForm] = useState({ encounterId: "", examType: "", findings: "" });
  const [surgeryForm, setSurgeryForm] = useState({
    encounterId: "",
    surgeryProcedureType: "",
    location: "",
    plannedDate: "",
    notes: "",
  });

  const locationRouter = useLocation();

  const load = async () => {
    const [appointmentsRes, encountersRes, locationsRes, proceduresRes] = await Promise.all([
      api.get("/appointments", { params: { status: "completed" } }).catch(() => ({ data: { appointments: [] } })),
      api.get("/encounters"),
      api.get("/locations"),
      api.get("/procedures"),
    ]);

    setAppointments(appointmentsRes.data.appointments || []);
    setEncounters(encountersRes.data.encounters || []);
    setLocations(locationsRes.data.locations || []);
    setProcedures(proceduresRes.data.procedures || []);
  };

  useEffect(() => {
    load().catch(() => setError("Falha ao carregar atendimentos"));
  }, []);

  useEffect(() => {
    if (locationRouter.state?.openEncounterForm && locationRouter.state?.appointmentId) {
      setEncounterForm((prev) => ({ ...prev, appointment: locationRouter.state.appointmentId }));
    }
  }, [locationRouter.state]);

  const filteredEncounters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return encounters;

    return encounters.filter((item) => {
      const patient = item.patient?.fullName || "";
      const diagnosis = item.diagnosis || "";
      const evolution = item.evolution || "";
      return `${patient} ${diagnosis} ${evolution}`.toLowerCase().includes(q);
    });
  }, [encounters, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEncounters.length / PAGE_SIZE));
  const pagedEncounters = filteredEncounters.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const createEncounter = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api.post("/encounters", encounterForm);
      setEncounterForm({ appointment: "", anamnesis: "", evolution: "", diagnosis: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Nao foi possivel salvar evolucao");
    }
  };

  const addExam = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api.post(`/encounters/${examForm.encounterId}/exams`, {
        examType: examForm.examType,
        findings: examForm.findings,
      });
      setExamForm({ encounterId: "", examType: "", findings: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao inserir exame");
    }
  };

  const scheduleSurgery = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api.post(`/encounters/${surgeryForm.encounterId}/schedule-surgery`, {
        surgeryProcedureType: surgeryForm.surgeryProcedureType,
        location: surgeryForm.location,
        plannedDate: new Date(surgeryForm.plannedDate).toISOString(),
        notes: surgeryForm.notes,
      });
      setSurgeryForm({
        encounterId: "",
        surgeryProcedureType: "",
        location: "",
        plannedDate: "",
        notes: "",
      });
      await load();
      alert("Cirurgia programada e inserida na agenda.");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao programar cirurgia");
    }
  };

  return (
    <section className="stack">
      <h2>Atendimento do paciente</h2>

      <form className="card form-grid" onSubmit={createEncounter}>
        <h3>Nova evolucao</h3>
        <label>
          Agendamento
          <select
            value={encounterForm.appointment}
            onChange={(e) => setEncounterForm((p) => ({ ...p, appointment: e.target.value }))}
            required
          >
            <option value="">Selecione</option>
            {appointments.map((a) => (
              <option key={a._id} value={a._id}>
                {a.patient?.fullName} - {a.procedureType?.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Anamnese
          <textarea value={encounterForm.anamnesis} onChange={(e) => setEncounterForm((p) => ({ ...p, anamnesis: e.target.value }))} />
        </label>
        <label>
          Evolucao
          <textarea value={encounterForm.evolution} onChange={(e) => setEncounterForm((p) => ({ ...p, evolution: e.target.value }))} />
        </label>
        <label>
          Diagnostico
          <textarea value={encounterForm.diagnosis} onChange={(e) => setEncounterForm((p) => ({ ...p, diagnosis: e.target.value }))} />
        </label>
        <button type="submit">Salvar evolucao</button>
      </form>

      <form className="card form-grid" onSubmit={addExam}>
        <h3>Inserir resultado de exame</h3>
        <label>
          Evolucao
          <select
            value={examForm.encounterId}
            onChange={(e) => setExamForm((p) => ({ ...p, encounterId: e.target.value }))}
            required
          >
            <option value="">Selecione</option>
            {encounters.map((item) => (
              <option key={item._id} value={item._id}>
                {item.patient?.fullName || item.patient}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de exame
          <input value={examForm.examType} onChange={(e) => setExamForm((p) => ({ ...p, examType: e.target.value }))} required />
        </label>
        <label>
          Resultado
          <textarea value={examForm.findings} onChange={(e) => setExamForm((p) => ({ ...p, findings: e.target.value }))} required />
        </label>
        <button type="submit">Salvar exame</button>
      </form>

      <form className="card form-grid" onSubmit={scheduleSurgery}>
        <h3>Programar cirurgia</h3>
        <label>
          Evolucao
          <select
            value={surgeryForm.encounterId}
            onChange={(e) => setSurgeryForm((p) => ({ ...p, encounterId: e.target.value }))}
            required
          >
            <option value="">Selecione</option>
            {encounters.map((item) => (
              <option key={item._id} value={item._id}>
                {item.patient?.fullName || item.patient}
              </option>
            ))}
          </select>
        </label>

        <label>
          Cirurgia
          <select
            value={surgeryForm.surgeryProcedureType}
            onChange={(e) => setSurgeryForm((p) => ({ ...p, surgeryProcedureType: e.target.value }))}
            required
          >
            <option value="">Selecione</option>
            {procedures.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Local
          <select
            value={surgeryForm.location}
            onChange={(e) => setSurgeryForm((p) => ({ ...p, location: e.target.value }))}
            required
          >
            <option value="">Selecione</option>
            {locations.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Data prevista
          <input
            type="datetime-local"
            value={surgeryForm.plannedDate}
            onChange={(e) => setSurgeryForm((p) => ({ ...p, plannedDate: e.target.value }))}
            required
          />
        </label>

        <label>
          Observacoes
          <textarea value={surgeryForm.notes} onChange={(e) => setSurgeryForm((p) => ({ ...p, notes: e.target.value }))} />
        </label>

        <button type="submit">Programar cirurgia</button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <div className="table-header">
          <h3>Lista de atendimentos</h3>
          <input
            placeholder="Procurar por paciente/diagnostico"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Diagnostico</th>
                <th>Evolucao</th>
                <th>Data</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {pagedEncounters.map((item) => (
                <tr key={item._id}>
                  <td>{item.patient?.fullName || item.patient}</td>
                  <td>{item.diagnosis || "-"}</td>
                  <td>{item.evolution || "-"}</td>
                  <td>{dayjs(item.createdAt).format("DD/MM/YYYY HH:mm")}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={async () => {
                        try {
                          const response = await api.post(
                            `/encounters/${item._id}/prescriptions`,
                            {
                              medications: [
                                {
                                  name: "Medicamento exemplo",
                                  instructions: "Tomar 1 comprimido a cada 12h",
                                  durationDays: 7,
                                },
                              ],
                              notes: "Uso orientado em consulta",
                              sendByEmail: true,
                            },
                            { responseType: "blob" }
                          );
                          const url = window.URL.createObjectURL(response.data);
                          window.open(url, "_blank");
                        } catch {
                          setError("Falha ao emitir receita");
                        }
                      }}
                    >
                      Receita
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
