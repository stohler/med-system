import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useParams } from "react-router-dom";
import { api } from "../api";

export function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [encounterDetailsLoading, setEncounterDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [patientRes, encountersRes] = await Promise.all([
      api.get(`/patients/${id}`),
      api.get("/encounters", { params: { patient: id } }),
    ]);
    setPatient(patientRes.data.data);
    setEncounters(encountersRes.data.encounters || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar paciente"));
  }, [id]);

  const encounterAppointmentDate = useMemo(() => {
    if (!selectedEncounter?.appointment?.startsAt) return "-";
    return dayjs(selectedEncounter.appointment.startsAt).format("DD/MM/YYYY HH:mm");
  }, [selectedEncounter]);

  const encounterLocationName = useMemo(() => {
    return selectedEncounter?.appointment?.location?.name || "-";
  }, [selectedEncounter]);

  const encounterProcedureName = useMemo(() => {
    return selectedEncounter?.appointment?.procedureType?.name || "-";
  }, [selectedEncounter]);

  const openEncounterDetails = async (encounterId) => {
    setError("");
    setEncounterDetailsLoading(true);
    try {
      const { data } = await api.get(`/encounters/${encounterId}`);
      setSelectedEncounter(data.encounter || null);
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao carregar detalhes do atendimento");
    } finally {
      setEncounterDetailsLoading(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.put(`/patients/${id}`, {
        fullName: patient.fullName,
        birthDate: patient.birthDate
          ? new Date(`${dayjs(patient.birthDate).format("YYYY-MM-DD")}T00:00:00`).toISOString()
          : "",
        documentNumber: patient.documentNumber,
        email: patient.email || "",
        phone: patient.phone,
        notes: patient.notes || "",
      });
      setMessage("Paciente atualizado com sucesso.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao atualizar paciente");
    }
  };

  if (!patient) {
    return <section className="stack">{error ? <p className="error">{error}</p> : <p>Carregando...</p>}</section>;
  }

  return (
    <section className="stack">
      <h2>Detalhes do paciente</h2>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="success">{message}</p> : null}

      <form className="card form-grid" onSubmit={save}>
        <label>
          Nome
          <input value={patient.fullName} onChange={(e) => setPatient((p) => ({ ...p, fullName: e.target.value }))} required />
        </label>
        <label>
          Nascimento
          <input
            type="date"
            value={patient.birthDate ? dayjs(patient.birthDate).format("YYYY-MM-DD") : ""}
            onChange={(e) => setPatient((p) => ({ ...p, birthDate: e.target.value }))}
          />
        </label>
        <label>
          Documento
          <input value={patient.documentNumber || ""} onChange={(e) => setPatient((p) => ({ ...p, documentNumber: e.target.value }))} />
        </label>
        <label>
          Telefone
          <input value={patient.phone || ""} onChange={(e) => setPatient((p) => ({ ...p, phone: e.target.value }))} />
        </label>
        <label>
          E-mail
          <input value={patient.email || ""} onChange={(e) => setPatient((p) => ({ ...p, email: e.target.value }))} />
        </label>
        <label>
          Observacoes
          <textarea value={patient.notes || ""} onChange={(e) => setPatient((p) => ({ ...p, notes: e.target.value }))} />
        </label>
        <button type="submit">Salvar alteracoes</button>
      </form>

      <div className="card">
        <h3>Atendimentos realizados</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Diagnostico</th>
                <th>Evolucao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {encounters.map((encounter) => (
                <tr key={encounter._id}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => openEncounterDetails(encounter._id)}
                    >
                      {dayjs(encounter.createdAt).format("DD/MM/YYYY HH:mm")}
                    </button>
                  </td>
                  <td>{encounter.diagnosticHypothesis || encounter.diagnosis || "-"}</td>
                  <td>{encounter.currentIllnessHistory || encounter.evolution || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={async () => {
                        try {
                          const response = await api.post(
                            `/encounters/${encounter._id}/prescriptions`,
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
      </div>

      {selectedEncounter ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card modal-card-large">
            <div className="table-header">
              <h3>Detalhes do atendimento</h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedEncounter(null)}
              >
                Fechar
              </button>
            </div>

            <div className="clinical-header">
              <div>
                <strong>Paciente</strong>
                <span>{patient.fullName || "-"}</span>
              </div>
              <div>
                <strong>Nascimento</strong>
                <span>
                  {patient.birthDate ? dayjs(patient.birthDate).format("DD/MM/YYYY") : "-"}
                </span>
              </div>
              <div>
                <strong>Procedimento</strong>
                <span>{encounterProcedureName}</span>
              </div>
              <div>
                <strong>Local</strong>
                <span>{encounterLocationName}</span>
              </div>
              <div>
                <strong>Data/Hora agendamento</strong>
                <span>{encounterAppointmentDate}</span>
              </div>
              <div>
                <strong>Evolucao em</strong>
                <span>{dayjs(selectedEncounter.createdAt).format("DD/MM/YYYY HH:mm")}</span>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Historia da doenca atual
                <textarea
                  readOnly
                  value={selectedEncounter.currentIllnessHistory || ""}
                />
              </label>

              <div className="grid-cards">
                <label>
                  <span className="inline-actions">
                    <strong>Comorbidades</strong>
                    <span className="muted">
                      {selectedEncounter.deniesComorbidities ? "Nega" : "Relata"}
                    </span>
                  </span>
                  <textarea
                    readOnly
                    value={
                      selectedEncounter.deniesComorbidities
                        ? "Paciente nega comorbidades."
                        : selectedEncounter.comorbidities || ""
                    }
                  />
                </label>

                <label>
                  <span className="inline-actions">
                    <strong>Alergias</strong>
                    <span className="muted">
                      {selectedEncounter.deniesAllergies ? "Nega" : "Relata"}
                    </span>
                  </span>
                  <textarea
                    readOnly
                    value={
                      selectedEncounter.deniesAllergies
                        ? "Paciente nega alergias."
                        : selectedEncounter.allergies || ""
                    }
                  />
                </label>

                <label>
                  <span className="inline-actions">
                    <strong>Medicamentos em uso</strong>
                    <span className="muted">
                      {selectedEncounter.deniesMedicationsInUse ? "Nega" : "Relata"}
                    </span>
                  </span>
                  <textarea
                    readOnly
                    value={
                      selectedEncounter.deniesMedicationsInUse
                        ? "Paciente nega uso de medicamentos."
                        : selectedEncounter.medicationsInUse || ""
                    }
                  />
                </label>
              </div>

              <label>
                Exame fisico
                <textarea readOnly value={selectedEncounter.physicalExam || ""} />
              </label>

              <label>
                Hipotese diagnostica
                <textarea readOnly value={selectedEncounter.diagnosticHypothesis || ""} />
              </label>

              <label>
                Conduta
                <textarea readOnly value={selectedEncounter.conduct || ""} />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {encounterDetailsLoading ? (
        <div className="modal-backdrop" role="status" aria-live="polite">
          <div className="modal-card">
            <p>Carregando detalhes do atendimento...</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
