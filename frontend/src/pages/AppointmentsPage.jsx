import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

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

export function AppointmentsPage() {
  const [patients, setPatients] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(dayjs().startOf("isoWeek"));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const navigate = useNavigate();
  const locationRouter = useLocation();

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
    const selected = locationRouter.state?.selectedPatient;
    if (!selected) return;

    setForm((prev) => ({
      ...prev,
      patientId: selected.id,
      patientSearch: `${selected.fullName} - ${dayjs(selected.birthDate).format("DD/MM/YYYY")}`,
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
      ...prev,
      location: prev.location || locations[0]?._id || "",
      procedureType: prev.procedureType || procedures[0]?._id || "",
      startsAt: toDateTimeLocal(start),
      endsAt: toDateTimeLocal(end),
    }));
    setShowForm(true);
  };

  const goToPatientCreate = () => {
    const typed = form.patientSearch.trim();
    navigate("/patients", {
      state: {
        returnTo: "/appointments",
        prefillPatientName: typed,
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

      await api.post("/appointments", {
        patient: form.patientId,
        location: form.location,
        procedureType: form.procedureType,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        notes: form.notes,
      });

      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Falha ao salvar agendamento");
    }
  };

  const previousWeek = () => setWeekStart((prev) => prev.subtract(7, "day"));
  const nextWeek = () => setWeekStart((prev) => prev.add(7, "day"));

  return (
    <section className="stack">
      <div className="week-header">
        <h2>Agenda da Semana</h2>
        <div className="inline-actions">
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
            <button
              key={day.key}
              type="button"
              className="day-add-btn"
              onClick={() => openForm(day.key)}
              title={`Novo agendamento em ${day.label}`}
            >
              + {day.label} {date.format("DD/MM")}
            </button>
          );
        })}
      </div>

      {showForm ? (
        <form className="card form-grid" onSubmit={submit}>
          <h3>Novo agendamento</h3>

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
              onChange={(e) => setForm((prev) => ({ ...prev, procedureType: e.target.value }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
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
            <>
              <div key={`h-${slot}`} className="week-grid-hour">
                {slot}
              </div>
              {DAYS.map((day) => {
                const key = `${day.key}-${slot}`;
                const items = weeklyGrid.get(key) || [];
                return (
                  <div key={`${key}-cell`} className="week-grid-cell">
                    {items.map((item) => (
                      <article key={item._id} className="week-event">
                        <strong>{item.patient?.fullName}</strong>
                        <span>{item.procedureType?.name}</span>
                        <span>{item.location?.name}</span>
                      </article>
                    ))}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </section>
  );
}
