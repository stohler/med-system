import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../state";

const links = [
  ["/", "Dashboard"],
  ["/patients", "Pacientes"],
  ["/appointments", "Agenda"],
  ["/encounters", "Atendimento"],
  ["/reports", "Relatorios"],
  ["/integrations", "Integracoes"],
];

export function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="logo">
          Clinica
        </Link>
        <div className="topbar-user">
          <span>{user?.name}</span>
          <button type="button" onClick={logout} className="btn-ghost">
            Sair
          </button>
        </div>
      </header>

      <nav className="bottom-nav">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "") }>
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="page">{children}</main>
    </div>
  );
}
