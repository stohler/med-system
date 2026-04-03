import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

const PAGE_SIZE = 10;

const encounterInitial = {
  appointment: "",
  historyOfCurrentIllness: "",
  comorbidities: "",
  comorbiditiesDenied: false,
  allergies: "",
  allergiesDenied: false,
  medicationsInUse: "",
  medicationsDenied: false,
  physicalExam: "",
  diagnosticHypothesis: "",
  conduct: "",
};

export function EncountersPage() {
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showExamSection, setShowExamSection] = useState(false);

  const [encounterForm, setEncounterForm] = useState(encounterInitial);
  const [examForm, setExamForm] = useState({ encounterId: "", examType: "", findings: "" });
  const [surgeryForm, setSurgeryForm] = useState({
    surgeryProcedureType: "",
    location: "",
    plannedDate: "",
    notes: "",
  });

  const locationRouter = useLocation();
  const navigate = useNavigate();

  const selectedAppointment = useMemo(
    () => appointments.find((item) => item._id === encounterForm.appointment) || null,
    [appointments, encounterForm.appointment]
  );

  const selectedEncounterForSurgery = useMemo(
    () => encounters.find((item) => item._id === examForm.encounterId) || null,
    [encounters, examForm.encounterId]
  );

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
      const diagnosis = item.diagnosticHypothesis || item.diagnosis || "";
      const conduct = item.conduct || "";
      return `${patient} ${diagnosis} ${conduct}`.toLowerCase().includes(q);
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
      setEncounterForm(encounterInitial);
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
      setShowExamSection(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao inserir exame");
    }
  };

  const scheduleSurgery = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (!examForm.encounterId) {
        throw new Error("Selecione uma evolucao para programar cirurgia.");
      }
      await api.post(`/encounters/${examForm.encounterId}/schedule-surgery`, {
        surgeryProcedureType: surgeryForm.surgeryProcedureType,
        location: surgeryForm.location,
        plannedDate: new Date(surgeryForm.plannedDate).toISOString(),
        notes: surgeryForm.notes,
      });
      setSurgeryForm({
        surgeryProcedureType: "",
        location: "",
        plannedDate: "",
        notes: "",
      });
      await load();
      alert("Cirurgia programada e inserida na agenda.");
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Falha ao programar cirurgia");
    }
  };

  return (
    <section className="stack">
      <div className="table-header">
        <h2>Atendimento do paciente</h2>
        <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
          Voltar
        </button>
      </div>

      {selectedAppointment ? (
        <div className="card patient-header">
          <strong>{selectedAppointment.patient?.fullName}</strong>
          <span>Nascimento: {selectedAppointment.patient?.birthDate ? dayjs(selectedAppointment.patient.birthDate).format("DD/MM/YYYY") : "-"}</span>
          <span>Procedimento: {selectedAppointment.procedureType?.name || "-"}</span>
          <span>Local: {selectedAppointment.location?.name || "-"}</span>
        </div>
      ) : null}

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
          Historia da doenca atual
          <textarea
            value={encounterForm.historyOfCurrentIllness}
            onChange={(e) => setEncounterForm((p) => ({ ...p, historyOfCurrentIllness: e.target.value }))}
          />
        </label>

        <div className="grid-cards">
          <label>
            <span className="inline-actions"><strong>Comorbidades</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.comorbiditiesDenied}
                  onChange={(e) => setEncounterForm((p) => ({ ...p, comorbiditiesDenied: e.target.checked }))}
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.comorbidities}
              onChange={(e) => setEncounterForm((p) => ({ ...p, comorbidities: e.target.value }))}
              disabled={encounterForm.comorbiditiesDenied}
            />
          </label>

          <label>
            <span className="inline-actions"><strong>Alergias</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.allergiesDenied}
                  onChange={(e) => setEncounterForm((p) => ({ ...p, allergiesDenied: e.target.checked }))}
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.allergies}
              onChange={(e) => setEncounterForm((p) => ({ ...p, allergies: e.target.value }))}
              disabled={encounterForm.allergiesDenied}
            />
          </label>

          <label>
            <span className="inline-actions"><strong>Medicamentos em uso</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.medicationsDenied}
                  onChange={(e) => setEncounterForm((p) => ({ ...p, medicationsDenied: e.target.checked }))}
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.medicationsInUse}
              onChange={(e) => setEncounterForm((p) => ({ ...p, medicationsInUse: e.target.value }))}
              disabled={encounterForm.medicationsDenied}
            />
          </label>
        </div>

        <label>
          Exame fisico
          <textarea
            value={encounterForm.physicalExam}
            onChange={(e) => setEncounterForm((p) => ({ ...p, physicalExam: e.target.value }))}
          />
        </label>

        <label>
          Hipotese diagnostica
          <textarea
            value={encounterForm.diagnosticHypothesis}
            onChange={(e) => setEncounterForm((p) => ({ ...p, diagnosticHypothesis: e.target.value }))}
          />
        </label>

        <label>
          Conduta
          <textarea
            value={encounterForm.conduct}
            onChange={(e) => setEncounterForm((p) => ({ ...p, conduct: e.target.value }))}
          />
        </label>

        <button type="submit">Salvar evolucao</button>
      </form>

      <div className="inline-actions">
        <button type="button" className="btn-ghost" onClick={() => setShowExamSection((prev) => !prev)}>
          {showExamSection ? "Ocultar resultado de exames" : "Adicionar resultado de exames"}
        </button>
      </div>

      {showExamSection ? (
        <form className="card form-grid" onSubmit={addExam}>
          <h3>Inserir resultado de exame (opcional)</h3>
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
      ) : null}

      <form className="card form-grid" onSubmit={scheduleSurgery}>
        <h3>Programar cirurgia</h3>
        <label>
          Paciente
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

        {selectedAppointment?.patient ? (
          <div className="card-mini">
            <strong>Paciente:</strong> {selectedAppointment.patient.fullName || "-"}
          </div>
        ) : null}

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
                <th>Hipotese</th>
                <th>Conduta</th>
                <th>Data</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {pagedEncounters.map((item) => (
                <tr key={item._id}>
                  <td>{item.patient?.fullName || item.patient}</td>
                  <td>{item.diagnosticHypothesis || item.diagnosis || "-"}</td>
                  <td>{item.conduct || "-"}</td>
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
