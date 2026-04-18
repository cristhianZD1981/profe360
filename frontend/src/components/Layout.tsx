import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth";

const items = [
  ["Dashboard", "/"],
  ["Instituciones", "/instituciones"],
  ["Usuarios", "/usuarios"],
  ["Estudiantes", "/estudiantes"],
  ["Académico", "/academico"],
  ["Horarios", "/horarios"],
  ["Asistencia", "/asistencia"],
  ["Reportes", "/reportes"]
];

export default function Layout() {
  const { user, logout } = useAuth();

  const institucionNombre =
    user?.institucionNombreComercial ||
    user?.institucionNombre ||
    "Sin institución";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="Profe360" />
          <div>
            <h1>Profe360</h1>
            <p>Menos carga, más enseñanza</p>
          </div>
        </div>

        <nav className="menu">
          {items.map(([label, path]) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `menu-link ${isActive ? "active" : ""}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap"
            }}
          >
            {user?.institucionLogoUrl ? (
              <img
                src={user.institucionLogoUrl}
                alt={institucionNombre}
                style={{
                  width: "48px",
                  height: "48px",
                  objectFit: "contain",
                  borderRadius: "10px",
                  background: "#fff",
                  padding: "4px"
                }}
              />
            ) : null}

            <div style={{ display: "flex", flexDirection: "column" }}>
              <strong>{user?.nombre}</strong>
              <span>{user?.roles.join(", ")}</span>
              <span style={{ fontSize: "13px", opacity: 0.9 }}>
                {institucionNombre}
              </span>
            </div>
          </div>

          <button onClick={logout} className="ghost-btn">
            Salir
          </button>
        </header>

        <Outlet />
      </main>
    </div>
  );
}