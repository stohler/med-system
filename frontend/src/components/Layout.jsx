import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../state";

const links = [
  ["/", "Agenda"],
  ["/patients", "Pacientes"],
  ["/encounters", "Atendimento"],
  ["/reports", "Relatorios"],
  ["/settings", "Configuracoes"],
  ["/integrations", "Integracoes"],
];

export function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell side-menu-layout">
      <aside className="right-menu">
        <div className="right-menu-header">
          <Link to="/" className="logo">
            Clinica
          </Link>
          <p>{user?.name}</p>
        </div>
        <nav className="side-nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "") }>
              {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={logout} className="btn-ghost menu-logout">
          Sair
        </button>
      </aside>

      <main className="page">{children}</main>
    </div>
  );
}
