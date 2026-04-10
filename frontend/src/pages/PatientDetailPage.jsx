import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useParams } from "react-router-dom";
import { api } from "../api";

export function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState(null);
  const [encounters, setEncounters] = useState([]);
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
                  <td>{dayjs(encounter.createdAt).format("DD/MM/YYYY HH:mm")}</td>
                  <td>{encounter.diagnosis || "-"}</td>
                  <td>{encounter.evolution || "-"}</td>
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
    </section>
  );
}
