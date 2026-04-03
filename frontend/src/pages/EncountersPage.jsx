import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../toast";
import { getLocationColor } from "../utils/locationColors";

const PAGE_SIZE = 10;

const encounterInitial = {
  appointment: "",
  historyOfCurrentIllness: "",
  comorbidities: "",
  comorbiditiesDenied: true,
  allergies: "",
  allergiesDenied: true,
  medicationsInUse: "",
  medicationsDenied: true,
  physicalExam: "",
  diagnosticHypothesis: "",
  conduct: "",
};

export function EncountersPage() {
  const [encounters, setEncounters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [activeEncounterId, setActiveEncounterId] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showExamSection, setShowExamSection] = useState(false);
  const [showSurgerySection, setShowSurgerySection] = useState(false);

  const [encounterForm, setEncounterForm] = useState(encounterInitial);
  const [examForm, setExamForm] = useState({ examType: "", findings: "" });
  const [surgeryForm, setSurgeryForm] = useState({
    surgeryProcedureType: "",
    location: "",
    plannedDate: "",
    notes: "",
  });

  const locationRouter = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const hasContext = Boolean(activeAppointment?.id || activeAppointment?._id);

  const resolveLocationName = (locationRef) => {
    if (!locationRef) return "-";
    if (typeof locationRef === "object" && locationRef.name) return locationRef.name;
    return locations.find((item) => String(item._id) === String(locationRef))?.name || "-";
  };

  const load = async () => {
    const [encountersRes, locationsRes, proceduresRes] = await Promise.all([
      api.get("/encounters"),
      api.get("/locations"),
      api.get("/procedures"),
    ]);

    const loadedEncounters = encountersRes.data.encounters || [];
    setEncounters(loadedEncounters);
    setLocations(locationsRes.data.locations || []);
    setProcedures(proceduresRes.data.procedures || []);
    return loadedEncounters;
  };

  const syncEncounterFromContext = (context, sourceEncounters) => {
    if (!context) return;
    const appointmentId = context.id || context._id;
    const linked = sourceEncounters.find(
      (encounter) =>
        String(encounter.appointment?._id || encounter.appointment) ===
        String(appointmentId)
    );
    if (linked) {
      setActiveEncounterId(linked._id);
    }
  };

  useEffect(() => {
    const stateContext = locationRouter.state?.appointmentContext;
    const storageContext = localStorage.getItem("active_appointment_context");
    let parsedStorage = null;
    try {
      parsedStorage = storageContext ? JSON.parse(storageContext) : null;
    } catch (_error) {
      parsedStorage = null;
    }
    const context = stateContext || parsedStorage;
    if (context) {
      setActiveAppointment(context);
      setEncounterForm((prev) => ({
        ...prev,
        appointment: context.id || context._id || "",
      }));
    }

    load()
      .then((loadedEncounters) => {
        if (context) {
          syncEncounterFromContext(context, loadedEncounters);
        }
      })
      .catch(() => {
        const message = "Falha ao carregar atendimentos";
        setError(message);
        toast.error(message);
      });
  }, []);

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

  const lastEncounterForAppointment = useMemo(() => {
    const appointmentId = activeAppointment?.id || activeAppointment?._id;
    if (!appointmentId) return null;
    return encounters
      .filter(
        (item) =>
          String(item.appointment?._id || item.appointment) === String(appointmentId)
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }, [activeAppointment, encounters]);

  const locationColor = getLocationColor(
    activeAppointment?.location?._id || activeAppointment?.location
  );

  const totalPages = Math.max(1, Math.ceil(filteredEncounters.length / PAGE_SIZE));
  const pagedEncounters = filteredEncounters.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const createEncounter = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (!hasContext) {
        throw new Error(
          "Selecione um agendamento na agenda antes de iniciar atendimento."
        );
      }
      const { data } = await api.post("/encounters", encounterForm);
      setActiveEncounterId(data.encounter._id);
      setShowExamSection(false);
      setShowSurgerySection(false);
      await load();
      toast.success("Evolucao salva com sucesso.");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err.message ||
        "Nao foi possivel salvar evolucao";
      setError(message);
      toast.error(message);
    }
  };

  const addExam = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (!activeEncounterId) {
        throw new Error("Salve uma evolucao antes de inserir exame.");
      }
      await api.post(`/encounters/${activeEncounterId}/exams`, {
        examType: examForm.examType,
        findings: examForm.findings,
      });
      setExamForm({ examType: "", findings: "" });
      setShowExamSection(false);
      await load();
      toast.success("Resultado de exame salvo com sucesso.");
    } catch (err) {
      const message =
        err?.response?.data?.message || err.message || "Falha ao inserir exame";
      setError(message);
      toast.error(message);
    }
  };

  const scheduleSurgery = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (!activeEncounterId) {
        throw new Error("Salve uma evolucao antes de programar cirurgia.");
      }
      await api.post(`/encounters/${activeEncounterId}/schedule-surgery`, {
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
      setShowSurgerySection(false);
      await load();
      toast.success("Cirurgia programada e inserida na agenda.");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err.message ||
        "Falha ao programar cirurgia";
      setError(message);
      toast.error(message);
    }
  };

  const selectEncounterFromTable = (encounter) => {
    const appointment = encounter.appointment;
    const ctx = {
      id: appointment?._id || appointment,
      patient: encounter.patient,
      procedureType: appointment?.procedureType || null,
      location: appointment?.location || null,
      startsAt: appointment?.startsAt,
      endsAt: appointment?.endsAt,
    };
    setActiveAppointment(ctx);
    setActiveEncounterId(encounter._id);
    setEncounterForm((prev) => ({ ...prev, appointment: ctx.id }));
    localStorage.setItem("active_appointment_context", JSON.stringify(ctx));
  };

  return (
    <section className="stack">
      <div className="table-header">
        <h2>Atendimento do paciente</h2>
        <button type="button" className="btn-ghost" onClick={() => navigate(-1)}>
          Voltar
        </button>
      </div>

      {activeAppointment ? (
        <div className="clinical-header">
          <div>
            <strong>Paciente</strong>
            <span>{activeAppointment.patient?.fullName || "-"}</span>
          </div>
          <div>
            <strong>Nascimento</strong>
            <span>
              {activeAppointment.patient?.birthDate
                ? dayjs(activeAppointment.patient.birthDate).format("DD/MM/YYYY")
                : "-"}
            </span>
          </div>
          <div>
            <strong>Procedimento</strong>
            <span>{activeAppointment.procedureType?.name || "-"}</span>
          </div>
          <div>
            <strong>Local</strong>
            <span
              className="location-chip"
              style={{
                background: locationColor.bg,
                borderColor: locationColor.border,
                color: locationColor.text,
              }}
            >
              {resolveLocationName(activeAppointment.location)}
            </span>
          </div>
          <div>
            <strong>Data/Hora</strong>
            <span>
              {activeAppointment.startsAt
                ? dayjs(activeAppointment.startsAt).format("DD/MM/YYYY HH:mm")
                : "-"}
            </span>
          </div>
          <div>
            <strong>Ultima evolucao</strong>
            <span>
              {lastEncounterForAppointment?.createdAt
                ? dayjs(lastEncounterForAppointment.createdAt).format(
                    "DD/MM/YYYY HH:mm"
                  )
                : "Sem evolucao"}
            </span>
          </div>
        </div>
      ) : (
        <div className="card warning-box">
          Selecione um agendamento na agenda para iniciar a evolucao clinica.
        </div>
      )}

      <form className="card form-grid" onSubmit={createEncounter}>
        <h3>Nova evolucao</h3>
        <label>
          Historia da doenca atual
          <textarea
            value={encounterForm.historyOfCurrentIllness}
            onChange={(e) =>
              setEncounterForm((p) => ({
                ...p,
                historyOfCurrentIllness: e.target.value,
              }))
            }
            required
          />
        </label>

        <div className="grid-cards">
          <label>
            <span className="inline-actions">
              <strong>Comorbidades</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.comorbiditiesDenied}
                  onChange={(e) =>
                    setEncounterForm((p) => ({
                      ...p,
                      comorbiditiesDenied: e.target.checked,
                    }))
                  }
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.comorbidities}
              onChange={(e) =>
                setEncounterForm((p) => ({ ...p, comorbidities: e.target.value }))
              }
              disabled={encounterForm.comorbiditiesDenied}
            />
          </label>

          <label>
            <span className="inline-actions">
              <strong>Alergias</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.allergiesDenied}
                  onChange={(e) =>
                    setEncounterForm((p) => ({
                      ...p,
                      allergiesDenied: e.target.checked,
                    }))
                  }
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.allergies}
              onChange={(e) =>
                setEncounterForm((p) => ({ ...p, allergies: e.target.value }))
              }
              disabled={encounterForm.allergiesDenied}
            />
          </label>

          <label>
            <span className="inline-actions">
              <strong>Medicamentos em uso</strong>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={encounterForm.medicationsDenied}
                  onChange={(e) =>
                    setEncounterForm((p) => ({
                      ...p,
                      medicationsDenied: e.target.checked,
                    }))
                  }
                />
                Nega
              </label>
            </span>
            <textarea
              value={encounterForm.medicationsInUse}
              onChange={(e) =>
                setEncounterForm((p) => ({
                  ...p,
                  medicationsInUse: e.target.value,
                }))
              }
              disabled={encounterForm.medicationsDenied}
            />
          </label>
        </div>

        <label>
          Exame fisico
          <textarea
            value={encounterForm.physicalExam}
            onChange={(e) =>
              setEncounterForm((p) => ({ ...p, physicalExam: e.target.value }))
            }
          />
        </label>

        <label>
          Hipotese diagnostica
          <textarea
            value={encounterForm.diagnosticHypothesis}
            onChange={(e) =>
              setEncounterForm((p) => ({
                ...p,
                diagnosticHypothesis: e.target.value,
              }))
            }
          />
        </label>

        <label>
          Conduta
          <textarea
            value={encounterForm.conduct}
            onChange={(e) =>
              setEncounterForm((p) => ({ ...p, conduct: e.target.value }))
            }
          />
        </label>

        <button type="submit" disabled={!hasContext}>
          Salvar evolucao
        </button>
      </form>

      <div className="inline-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowExamSection((prev) => !prev)}
        >
          {showExamSection
            ? "Ocultar resultado de exames"
            : "Adicionar resultado de exames"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowSurgerySection((prev) => !prev)}
        >
          {showSurgerySection ? "Ocultar agendar cirurgia" : "Programar cirurgia"}
        </button>
      </div>

      {showExamSection ? (
        <form className="card form-grid" onSubmit={addExam}>
          <h3>Inserir resultado de exame (opcional)</h3>
          <label>
            Tipo de exame
            <input
              value={examForm.examType}
              onChange={(e) =>
                setExamForm((p) => ({ ...p, examType: e.target.value }))
              }
              required
            />
          </label>
          <label>
            Resultado
            <textarea
              value={examForm.findings}
              onChange={(e) =>
                setExamForm((p) => ({ ...p, findings: e.target.value }))
              }
              required
            />
          </label>
          <button type="submit" disabled={!activeEncounterId}>
            Salvar exame
          </button>
        </form>
      ) : null}

      {showSurgerySection ? (
        <form className="card form-grid" onSubmit={scheduleSurgery}>
          <h3>Programar cirurgia</h3>
          {activeAppointment?.patient ? (
            <div className="card-mini">
              <strong>Paciente:</strong> {activeAppointment.patient.fullName || "-"}
            </div>
          ) : null}

          <label>
            Cirurgia
            <select
              value={surgeryForm.surgeryProcedureType}
              onChange={(e) =>
                setSurgeryForm((p) => ({
                  ...p,
                  surgeryProcedureType: e.target.value,
                }))
              }
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
              onChange={(e) =>
                setSurgeryForm((p) => ({ ...p, location: e.target.value }))
              }
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
              onChange={(e) =>
                setSurgeryForm((p) => ({ ...p, plannedDate: e.target.value }))
              }
              required
            />
          </label>

          <label>
            Observacoes
            <textarea
              value={surgeryForm.notes}
              onChange={(e) =>
                setSurgeryForm((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </label>

          <button type="submit" disabled={!activeEncounterId}>
            Programar cirurgia
          </button>
        </form>
      ) : null}

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
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => selectEncounterFromTable(item)}
                      >
                        Selecionar
                      </button>
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
                            const message = "Falha ao emitir receita";
                            setError(message);
                            toast.error(message);
                          }
                        }}
                      >
                        Receita
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inline-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>
            Pagina {page} de {totalPages}
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Proxima
          </button>
        </div>
      </div>
    </section>
  );
}
