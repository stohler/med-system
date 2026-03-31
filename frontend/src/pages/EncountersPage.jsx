import { useEffect, useState } from "react";
import { api } from "../api";

export function EncountersPage() {
  const [appointments, setAppointments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [error, setError] = useState("");
  const [encounterForm, setEncounterForm] = useState({
    appointment: "",
    anamnesis: "",
    evolution: "",
    diagnosis: "",
  });

  const [examForm, setExamForm] = useState({ encounterId: "", examType: "", findings: "" });

  const load = async () => {
    const [appointmentsRes, encountersRes] = await Promise.all([
      api.get("/appointments", { params: { status: "completed" } }).catch(() => ({ data: { appointments: [] } })),
      api.get("/encounters"),
    ]);

    setAppointments(appointmentsRes.data.appointments || []);
    setEncounters(encountersRes.data.encounters || []);
  };

  useEffect(() => {
    load().catch(() => setError("Falha ao carregar atendimentos"));
  }, []);

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

      {error ? <p className="error">{error}</p> : null}

      <div className="list">
        {encounters.map((item) => (
          <article className="card-mini" key={item._id}>
            <h3>{item.patient?.fullName || item.patient}</h3>
            <p>{item.diagnosis || "Sem diagnostico"}</p>
            <p>{item.evolution || "Sem evolucao"}</p>
            <a className="inline-link" href="#" onClick={async (e) => {
              e.preventDefault();
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
            }}>
              Emitir receita (PDF/email)
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
