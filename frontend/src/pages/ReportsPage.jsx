import { useState } from "react";
import { api } from "../api";

export function ReportsPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const { data } = await api.get("/reports/attendance");
      setReport(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao carregar relatorio");
    }
  };

  return (
    <section className="stack">
      <h2>Relatorios de atendimento</h2>
      <button type="button" onClick={load}>Gerar relatorio</button>
      {error ? <p className="error">{error}</p> : null}
      {report ? (
        <div className="card">
          <p>Total de agendamentos: {report.kpis.appointments}</p>
          <p>Total de atendimentos: {report.kpis.encounters}</p>
          <p>Taxa de conversao: {report.kpis.conversionRate}</p>
          <h3>Por status</h3>
          <ul>
            {report.byStatus.map((item) => (
              <li key={item.status}>{item.status}: {item.total}</li>
            ))}
          </ul>
          <h3>Por procedimento</h3>
          <ul>
            {report.byProcedure.map((item) => (
              <li key={item.procedureId}>
                {item.procedureName}: {item.total} ({(item.revenueCents / 100).toFixed(2)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
