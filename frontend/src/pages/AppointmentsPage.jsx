import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { getLocationColor } from "../utils/locationColors";

dayjs.extend(isoWeek);

const DAYS = [
  { key: 1, label: "Seg" },
  { key: 2, label: "Ter" },
  { key: 3, label: "Qua" },
  { key: 4, label: "Qui" },
  { key: 5, label: "Sex" },
  { key: 6, label: "Sab" },
  { key: 7, label: "Dom" },
];

const TIME_SLOTS = Array.from({ length: 24 }).map((_, index) =>
  String(index).padStart(2, "0") + ":00"
);

const emptyForm = {
  patientId: "",
  patientSearch: "",
  location: "",
  procedureType: "",
  startsAt: "",
  endsAt: "",
  notes: "",
};

function patientLabel(patient) {
  const birth = patient.birthDate ? dayjs(patient.birthDate).format("DD/MM/YYYY") : "--";
  return `${patient.fullName} - ${birth}`;
}

function toDateTimeLocal(value) {
  return dayjs(value).format("YYYY-MM-DDTHH:mm");
}

function locationCardStyle(location) {
  const color = getLocationColor(location?._id || location || "default");
  return {
    background: color.bg,
    borderColor: color.border,
    color: color.text,
  };
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 7V5.8C9 5.24772 9.44772 4.8 10 4.8H14C14.5523 4.8 15 5.24772 15 5.8V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 7L7.9 18.4C7.94099 18.9195 8.37548 19.32 8.896 19.32H15.104C15.6245 19.32 16.059 18.9195 16.1 18.4L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10 10.5V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 10.5V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function AppointmentsPage() {
  const [patients, setPatients] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [googleSync, setGoogleSync] = useState({
    loading: true,
    connected: false,
    configured: false,
    details: "",
  });
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(dayjs().startOf("isoWeek"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const navigate = useNavigate();
  const locationRouter = useLocation();

  const calculateEndsAt = (startsAtValue, procedureTypeId) => {
    if (!startsAtValue) return "";
    const startsAt = dayjs(startsAtValue);
    if (!startsAt.isValid()) return "";
    const procedure = procedures.find((item) => String(item._id) === String(procedureTypeId));
    const durationMinutes = Number(procedure?.defaultDurationMinutes || 30);
    return startsAt.add(durationMinutes, "minute").format("YYYY-MM-DDTHH:mm");
  };

  const loadGoogleSyncStatus = async () => {
    try {
      const { data } = await api.get("/integrations/google/status");
      const connected = Boolean(data?.connected);
      const configured = Boolean(data?.configured);
      const details = !configured
        ? "Integracao Google nao configurada no servidor."
        : connected
          ? data?.tokenExpiryAt
            ? `Expira em ${dayjs(data.tokenExpiryAt).format("DD/MM/YYYY HH:mm")}`
            : "Conexao ativa."
          : "Conecte na tela Integracoes para sincronizar com Google Calendar.";

      setGoogleSync({
        loading: false,
        connected,
        configured,
        details,
      });
    } catch (_error) {
      setGoogleSync({
        loading: false,
        connected: false,
        configured: false,
        details:
          "Nao foi possivel verificar status da integracao Google neste momento.",
      });
    }
  };

  const load = async () => {
    const weekFrom = weekStart.startOf("day").toISOString();
    const weekTo = weekStart.add(6, "day").endOf("day").toISOString();

    const [p, l, pr, a] = await Promise.all([
      api.get("/patients"),
      api.get("/locations"),
      api.get("/procedures"),
      api.get("/appointments", { params: { from: weekFrom, to: weekTo } }),
    ]);

    setPatients(p.data.data || []);
    setLocations(l.data.locations || []);
    setProcedures(pr.data.procedures || []);
    setAppointments(a.data.appointments || []);
  };

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || "Falha ao carregar agenda"));
  }, [weekStart.valueOf()]);

  useEffect(() => {
    loadGoogleSyncStatus().catch(() => null);
  }, []);

  useEffect(() => {
    const selected = locationRouter.state?.selectedPatient;
    if (!selected) return;
    const draft = locationRouter.state?.appointmentDraft || {};
    const draftWeekStart = locationRouter.state?.appointmentWeekStart;

    if (draftWeekStart) {
      const parsedWeek = dayjs(draftWeekStart);
      if (parsedWeek.isValid()) {
        setWeekStart(parsedWeek.startOf("isoWeek"));
      }
    }

    setForm((prev) => ({
      ...prev,
      ...draft,
      patientId: selected.id,
      patientSearch: patientLabel({
        fullName: selected.fullName,
        birthDate: selected.birthDate,
      }),
    }));
    if (locationRouter.state?.openAppointmentForm) {
      setShowForm(true);
    }

    navigate(locationRouter.pathname, { replace: true, state: null });
  }, [locationRouter.state]);

  const filteredPatients = useMemo(() => {
    const q = form.patientSearch.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => patientLabel(p).toLowerCase().includes(q))
      .slice(0, 8);
  }, [patients, form.patientSearch]);

  const weeklyGrid = useMemo(() => {
    const map = new Map();

    for (const appointment of appointments) {
      const start = dayjs(appointment.startsAt);
      const dayKey = start.isoWeekday();
      const hourKey = start.format("HH:00");
      const key = `${dayKey}-${hourKey}`;
      const list = map.get(key) || [];
      list.push(appointment);
      map.set(key, list);
    }

    return map;
  }, [appointments]);

  const openForm = (dayKey) => {
    const start = weekStart.isoWeekday(dayKey).hour(9).minute(0).second(0).millisecond(0);
    const end = start.add(30, "minute");

    setForm((prev) => ({
      ...emptyForm,
      ...prev,
      location: prev.location || locations[0]?._id || "",
      procedureType: prev.procedureType || procedures[0]?._id || "",
      startsAt: toDateTimeLocal(start),
      endsAt:
        calculateEndsAt(
          toDateTimeLocal(start),
          prev.procedureType || procedures[0]?._id || ""
        ) || toDateTimeLocal(end),
    }));
    setShowForm(true);
  };

  const openEditForm = (appointment) => {
    setForm({
      patientId: appointment.patient?._id || appointment.patient,
      patientSearch: patientLabel(appointment.patient || {}),
      location: appointment.location?._id || appointment.location,
      procedureType: appointment.procedureType?._id || appointment.procedureType,
      startsAt: toDateTimeLocal(appointment.startsAt),
      endsAt: toDateTimeLocal(appointment.endsAt),
      notes: appointment.notes || "",
      editingId: appointment._id,
    });
    setShowForm(true);
  };

  const goToAttend = (appointment) => {
    const appointmentContext = {
      id: appointment._id,
      patient: appointment.patient || null,
      procedureType: appointment.procedureType || null,
      location: appointment.location || null,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
    localStorage.setItem("active_appointment_context", JSON.stringify(appointmentContext));
    navigate("/encounters", {
      state: {
        openEncounterForm: true,
        appointmentId: appointment._id,
        appointmentContext,
      },
    });
  };

  const handleAppointmentClick = (appointment) => {
    setSelectedAppointment(appointment);
  };

  const goToPatientCreate = () => {
    const typed = form.patientSearch.trim();
    navigate("/patients", {
      state: {
        returnTo: "/appointments",
        prefillPatientName: typed,
        appointmentWeekStart: weekStart.toISOString(),
        appointmentDraft: {
          location: form.location,
          procedureType: form.procedureType,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          notes: form.notes,
        },
      },
    });
  };

  const handlePatientBlur = () => {
    const typed = form.patientSearch.trim();
    if (!typed || form.patientId) return;

    const shouldCreate = window.confirm(
      `Paciente "${typed}" nao encontrado. Deseja ir para o cadastro de paciente?`
    );

    if (shouldCreate) {
      goToPatientCreate();
    }
  };

  const selectPatient = (patient) => {
    setForm((prev) => ({
      ...prev,
      patientId: patient._id,
      patientSearch: patientLabel(patient),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      if (!form.patientId) {
        throw new Error("Selecione um paciente ou clique para cadastrar.");
      }

      const payload = {
        patient: form.patientId,
        location: form.location,
        procedureType: form.procedureType,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        notes: form.notes,
      };

      if (form.editingId) {
        await api.put(`/appointments/${form.editingId}`, payload);
      } else {
        await api.post("/appointments", payload);
      }

      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Falha ao salvar agendamento");
    }
  };

  const previousWeek = () => setWeekStart((prev) => prev.subtract(7, "day"));
  const nextWeek = () => setWeekStart((prev) => prev.add(7, "day"));
  const deleteEditingAppointment = async () => {
    if (!form.editingId) return;
    const confirmed = window.confirm("Deseja cancelar este agendamento?");
    if (!confirmed) return;

    setError("");
    try {
      await api.delete(`/appointments/${form.editingId}`);
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(
        err?.response?.data?.message || "Falha ao cancelar agendamento"
      );
    }
  };

  const printDaySummary = (dayKey) => {
    const dayMeta = DAYS.find((day) => day.key === dayKey);
    const dayDate = weekStart.isoWeekday(dayKey);
    const dayAppointments = appointments
      .filter((item) => dayjs(item.startsAt).isSame(dayDate, "day"))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const printWindow = window.open(
      "about:blank",
      "_blank",
      "width=980,height=720"
    );
    if (!printWindow) {
      setError("Nao foi possivel abrir a janela de impressao. Libere pop-ups e tente novamente.");
      return;
    }

    const rowsHtml =
      dayAppointments.length > 0
        ? dayAppointments
            .map((item) => {
              const startsAt = dayjs(item.startsAt);
              const endsAt = dayjs(item.endsAt);
              const period = `${startsAt.format("HH:mm")} - ${
                endsAt.isValid() ? endsAt.format("HH:mm") : "--:--"
              }`;
              return `
                <tr>
                  <td>${escapeHtml(period)}</td>
                  <td>${escapeHtml(item.patient?.fullName || "Sem paciente")}</td>
                  <td>${escapeHtml(item.procedureType?.name || "Sem procedimento")}</td>
                  <td>${escapeHtml(item.location?.name || "Sem local")}</td>
                  <td>${escapeHtml(item.notes || "-")}</td>
                </tr>
              `;
            })
            .join("")
        : `
          <tr>
            <td colspan="5">Nenhum agendamento para este dia.</td>
          </tr>
        `;

    const title = `Resumo de pacientes - ${dayMeta?.label || "Dia"} ${dayDate.format("DD/MM/YYYY")}`;
    const printHtml = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 20px; }
            p { margin: 0 0 16px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>Total de agendamentos: ${dayAppointments.length}</p>
          <table>
            <thead>
              <tr>
                <th>Horario</th>
                <th>Paciente</th>
                <th>Procedimento</th>
                <th>Endereco</th>
                <th>Observacoes</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <section className="stack">
      <div className="week-header">
        <h2>Agenda da Semana</h2>
        <div className="inline-actions">
          <span
            className={`status-chip ${
              googleSync.connected ? "status-chip-connected" : "status-chip-disconnected"
            }`}
            title={googleSync.details}
          >
            Google Sync:{" "}
            {googleSync.loading
              ? "Verificando..."
              : googleSync.connected
                ? "Ativo"
                : "Inativo"}
          </span>
          <button type="button" className="btn-ghost" onClick={previousWeek}>
            Semana anterior
          </button>
          <button type="button" className="btn-ghost" onClick={nextWeek}>
            Proxima semana
          </button>
        </div>
      </div>

      <div className="week-days-actions">
        {DAYS.map((day) => {
          const date = weekStart.isoWeekday(day.key);
          return (
            <div key={day.key} className="day-actions-card">
              <button
                type="button"
                className="day-add-btn"
                onClick={() => openForm(day.key)}
                title={`Novo agendamento em ${day.label}`}
              >
                + {day.label} {date.format("DD/MM")}
              </button>
              <button
                type="button"
                className="btn-ghost day-print-btn"
                onClick={() => printDaySummary(day.key)}
                title={`Imprimir resumo de ${day.label}`}
              >
                Imprimir
              </button>
            </div>
          );
        })}
      </div>

      {showForm ? (
        <form className="card form-grid" onSubmit={submit}>
          <div className="form-title-row">
            <h3>{form.editingId ? "Editar agendamento" : "Novo agendamento"}</h3>
            {form.editingId ? (
              <button
                type="button"
                className="icon-danger-button"
                title="Cancelar agendamento"
                aria-label="Cancelar agendamento"
                onClick={deleteEditingAppointment}
              >
                <TrashIcon />
              </button>
            ) : null}
          </div>

          {googleSync.loading ? (
            <p className="muted">Validando status da integracao Google...</p>
          ) : googleSync.connected ? (
            <p className="success">Google Calendar conectado: este agendamento sera sincronizado.</p>
          ) : (
            <p className="error">
              Google Calendar desconectado: o agendamento sera salvo apenas no sistema.
            </p>
          )}

          <label className="autocomplete-wrap">
            Paciente
            <input
              value={form.patientSearch}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, patientSearch: e.target.value, patientId: "" }))
              }
              onBlur={() => {
                setTimeout(() => handlePatientBlur(), 120);
              }}
              placeholder="Digite nome do paciente"
              required
            />
            {filteredPatients.length > 0 && !form.patientId ? (
              <div className="autocomplete-list">
                {filteredPatients.map((patient) => (
                  <button
                    type="button"
                    key={patient._id}
                    className="autocomplete-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectPatient(patient);
                    }}
                  >
                    {patientLabel(patient)}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          {!form.patientId && form.patientSearch.trim() ? (
            <button type="button" className="btn-ghost" onClick={goToPatientCreate}>
              Cadastrar novo paciente
            </button>
          ) : null}

          <label>
            Endereco
            <select
              value={form.location}
              onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
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
            Procedimento
            <select
              value={form.procedureType}
              onChange={(e) =>
                setForm((prev) => {
                  const nextProcedureType = e.target.value;
                  return {
                    ...prev,
                    procedureType: nextProcedureType,
                    endsAt:
                      calculateEndsAt(prev.startsAt, nextProcedureType) || prev.endsAt,
                  };
                })
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
            Inicio
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  startsAt: e.target.value,
                  endsAt:
                    calculateEndsAt(e.target.value, prev.procedureType) || prev.endsAt,
                }))
              }
              required
            />
          </label>

          <label>
            Fim
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
              required
            />
          </label>

          <label>
            Observacoes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>

          <div className="inline-actions">
            <button type="submit">Salvar agendamento</button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="week-grid-wrap card">
        <div className="week-grid">
          <div className="week-grid-head hour-col">Horario</div>
          {DAYS.map((day) => {
            const date = weekStart.isoWeekday(day.key);
            return (
              <div key={day.key} className="week-grid-head">
                {day.label} <span>{date.format("DD/MM")}</span>
              </div>
            );
          })}

          {TIME_SLOTS.map((slot) => (
            <div key={`row-${slot}`} style={{ display: "contents" }}>
              <div key={`h-${slot}`} className="week-grid-hour">
                {slot}
              </div>
              {DAYS.map((day) => {
                const key = `${day.key}-${slot}`;
                const items = weeklyGrid.get(key) || [];
                return (
                  <div key={`${key}-cell`} className="week-grid-cell">
                    {items.map((item) => (
                      <article
                        key={item._id}
                        className="week-event clickable"
                        onClick={() => handleAppointmentClick(item)}
                        title="Clique para editar ou atender"
                        style={locationCardStyle(item.location)}
                      >
                        <strong>{item.patient?.fullName}</strong>
                        <span>{item.procedureType?.name}</span>
                        <span className="location-chip" style={locationCardStyle(item.location)}>
                          {item.location?.name}
                        </span>
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedAppointment ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Acoes do agendamento</h3>
            <p>
              {selectedAppointment.patient?.fullName} -{" "}
              {dayjs(selectedAppointment.startsAt).format("DD/MM/YYYY HH:mm")}
            </p>
            <div
              className="location-chip"
              style={locationCardStyle(selectedAppointment.location)}
            >
              {selectedAppointment.location?.name || "Sem local"}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                onClick={() => {
                  openEditForm(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                Editar agendamento
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  goToAttend(selectedAppointment);
                  setSelectedAppointment(null);
                }}
              >
                Atender paciente
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedAppointment(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
