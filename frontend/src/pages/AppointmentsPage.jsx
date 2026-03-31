import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { api } from "../api";

export function AppointmentsPage() {
  const [patients, setPatients] = useState([]);
  const [locations, setLocations] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patient: "",
    location: "",
    procedureType: "",
    startsAt: "",
    endsAt: "",
    notes: "",
  });

  const load = async () => {
    const [p, l, pr, a] = await Promise.all([
      api.get("/patients"),
      api.get("/locations"),
      api.get("/procedures"),
      api.get("/appointments"),
    ]);
    setPatients(p.data.data || []);
    setLocations(l.data.locations || []);
    setProcedures(pr.data.procedures || []);
    setAppointments(a.data.appointments || []);
  };

  useEffect(() => {
    load().catch(() => setError("Falha ao carregar agenda"));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await api.post("/appointments", {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      });
      setForm({ patient: "", location: "", procedureType: "", startsAt: "", endsAt: "", notes: "" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao salvar agendamento");
    }
  };

  return (
    <section className="stack">
      <h2>Agenda</h2>

      <form className="card form-grid" onSubmit={submit}>
        <label>
          Paciente
          <select value={form.patient} onChange={(e) => setForm((p) => ({ ...p, patient: e.target.value }))} required>
            <option value="">Selecione</option>
            {patients.map((item) => (
              <option key={item._id} value={item._id}>{item.fullName}</option>
            ))}
          </select>
        </label>

        <label>
          Endereco
          <select value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} required>
            <option value="">Selecione</option>
            {locations.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label>
          Procedimento
          <select value={form.procedureType} onChange={(e) => setForm((p) => ({ ...p, procedureType: e.target.value }))} required>
            <option value="">Selecione</option>
            {procedures.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </select>
        </label>

        <label>
          Inicio
          <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))} required />
        </label>

        <label>
          Fim
          <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))} required />
        </label>

        <label>
          Observacoes
          <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        </label>

        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Agendar</button>
      </form>

      <div className="list">
        {appointments.map((item) => (
          <article className="card-mini" key={item._id}>
            <h3>{item.patient?.fullName}</h3>
            <p>{item.procedureType?.name} em {item.location?.name}</p>
            <p>{dayjs(item.startsAt).format("DD/MM/YYYY HH:mm")} - {dayjs(item.endsAt).format("HH:mm")}</p>
            <p>Status: {item.status}</p>
            <p>Valor: R$ {(item.calculatedPriceCents / 100).toFixed(2)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
