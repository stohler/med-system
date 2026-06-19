import { Link, NavLink } from "react-router-dom";
import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "../state";
import { navItemsForRole } from "../navConfig";

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(true);

  const links = useMemo(() => navItemsForRole(user?.role || "assistant"), [user?.role]);

  return (
    <div className="app-shell side-menu-layout">
      <aside className={`left-menu ${collapsed ? "collapsed" : "expanded"}`}>
        <div className="left-menu-header">
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
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "active" : "")}
                title={item.label}
              >
                <span className="menu-icon" aria-hidden>
                  <Icon size={18} strokeWidth={2} />
                </span>
                {!collapsed ? <span>{item.label}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        <button type="button" onClick={logout} className="btn-ghost menu-logout" title="Sair">
          <span className="menu-icon" aria-hidden>
            <LogOut size={18} strokeWidth={2} />
          </span>
          {!collapsed ? <span>Sair</span> : null}
        </button>
      </aside>

      <main className="page">{children}</main>
    </div>
  );
}
