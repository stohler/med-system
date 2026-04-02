import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../state";

const links = [
  { to: "/", label: "Agenda", icon: "AG" },
  { to: "/patients", label: "Pacientes", icon: "PA" },
  { to: "/encounters", label: "Atendimento", icon: "AT" },
  { to: "/reports", label: "Relatorios", icon: "RE" },
  { to: "/settings", label: "Configuracoes", icon: "CF" },
  { to: "/integrations", label: "Integracoes", icon: "IN" },
];

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="app-shell side-menu-layout">
      <main className="page">{children}</main>

      <aside className={`right-menu ${collapsed ? "collapsed" : "expanded"}`}>
        <div className="right-menu-header">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? ">>" : "<<"}
          </button>
          {!collapsed ? (
            <>
              <Link to="/" className="logo">
                Clinica
              </Link>
              <p>{user?.name}</p>
            </>
          ) : null}
        </div>

        <nav className="side-nav">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "active" : "")}
              title={item.label}
            >
              <span className="menu-icon">{item.icon}</span>
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>

        <button type="button" onClick={logout} className="btn-ghost menu-logout" title="Sair">
          <span className="menu-icon">SA</span>
          {!collapsed ? <span>Sair</span> : null}
        </button>
      </aside>
    </div>
  );
}
