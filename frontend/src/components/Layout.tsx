import { FormEvent, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";

type MenuItem = {
  label: string;
  path: string;
  allowedRoles?: string[];
};

const items: MenuItem[] = [
  { label: "Dashboard", path: "/" },
  { label: "Instituciones", path: "/instituciones" },
  {
    label: "Usuarios",
    path: "/usuarios",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]
  },
  { label: "Estudiantes", path: "/estudiantes" },
  { label: "Académico", path: "/academico" },
  { label: "Horarios", path: "/horarios" },
  { label: "Asistencia", path: "/asistencia" },
  { label: "Reportes", path: "/reportes" }
];

export default function Layout() {
  const { user, logout, setUser } = useAuth();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const institucionNombre =
    user?.institucionNombreComercial ||
    user?.institucionNombre ||
    "Sin institución";

  const visibleItems = useMemo(() => {
    const roles = user?.roles || [];
    return items.filter((item) => {
      if (!item.allowedRoles?.length) return true;
      return item.allowedRoles.some((role) => roles.includes(role));
    });
  }, [user?.roles]);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage("Debés completar todos los campos");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("La nueva clave y la confirmación deben coincidir");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/change-password", {
        currentPassword,
        newPassword
      });

      const data = response.data?.data || response.data;

      if (data?.user) {
        setUser(data.user);
      }

      setMessage("Clave actualizada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        setShowChangePassword(false);
        setMessage("");
      }, 1200);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cambiar la clave"
      );
    } finally {
      setLoading(false);
    }
  }

  const modalLabelStyle: React.CSSProperties = {
    display: "block",
    color: "#111827",
    fontWeight: 600
  };

  const modalInputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: "6px",
    background: "#ffffff",
    color: "#111827",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "12px 14px"
  };

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
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `menu-link ${isActive ? "active" : ""}`
              }
            >
              {item.label}
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
              <span>{user?.roles?.join(", ")}</span>
              <span style={{ fontSize: "13px", opacity: 0.9 }}>
                {institucionNombre}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setShowChangePassword(true);
                setMessage("");
                setErrorMessage("");
              }}
              className="ghost-btn"
              type="button"
            >
              Cambiar clave
            </button>

            <button onClick={logout} className="ghost-btn" type="button">
              Salir
            </button>
          </div>
        </header>

        <Outlet />
      </main>

      {showChangePassword && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: "16px"
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              background: "#ffffff",
              borderRadius: "18px",
              padding: "20px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
              display: "grid",
              gap: "14px",
              color: "#111827"
            }}
          >
            <div>
              <h3 style={{ margin: 0, color: "#111827" }}>Cambiar clave</h3>
              <p style={{ margin: "6px 0 0", color: "#4b5563" }}>
                Al guardar, el sistema enviará un correo de confirmación a tu cuenta
              </p>
            </div>

            {message ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "#ecfdf3",
                  color: "#166534",
                  border: "1px solid #bbf7d0"
                }}
              >
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca"
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <form
              className="form"
              onSubmit={handleChangePassword}
              style={{ gap: "14px" }}
            >
              <label style={modalLabelStyle}>
                Clave actual
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={modalInputStyle}
                />
              </label>

              <label style={modalLabelStyle}>
                Nueva clave
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={modalInputStyle}
                />
              </label>

              <label style={modalLabelStyle}>
                Confirmar nueva clave
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={modalInputStyle}
                />
              </label>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="primary-btn" disabled={loading}>
                  {loading ? "Guardando..." : "Guardar"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setMessage("");
                    setErrorMessage("");
                  }}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    background: "#fff",
                    cursor: "pointer",
                    color: "#111827"
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}