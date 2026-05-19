export function DashboardPage() {
  return (
    <section className="stack">
      <h2>Visao geral do consultorio</h2>
      <div className="grid-cards">
        <article className="card-mini">
          <h3>Seguranca</h3>
          <p>JWT, rate limit, sanitizacao e auditoria para HIPAA/LGPD.</p>
        </article>
        <article className="card-mini">
          <h3>Agenda</h3>
          <p>Consultas e procedimentos com multiplos enderecos e valores.</p>
        </article>
        <article className="card-mini">
          <h3>Atendimento</h3>
          <p>Evolucao clinica, exames e emissao de receita PDF/email.</p>
        </article>
      </div>
    </section>
  );
}
