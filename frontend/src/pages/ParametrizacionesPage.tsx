import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/auth";

type OpcionParametrizacion = {
  title: string;
  path: string;
  allowedRoles: string[];
};

const PARAMETRIZACIONES_ROLES = [
  "SUPER_ADMIN"
];

const opciones: OpcionParametrizacion[] = [
  {
    title: "Evaluaciones",
    path: "/parametrizaciones/evaluaciones",
    allowedRoles: PARAMETRIZACIONES_ROLES
  },
  {
    title: "Prompt IA",
    path: "/parametrizaciones/promt-ia",
    allowedRoles: PARAMETRIZACIONES_ROLES
  }
];

function normalizeRole(role: string) {
  return role.trim().toUpperCase();
}

function hasAccess(userRoles: string[] = [], allowedRoles: string[] = []) {
  if (!allowedRoles.length) return true;

  const normalizedUserRoles = userRoles.map(normalizeRole);
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

  return normalizedAllowedRoles.some((role) => normalizedUserRoles.includes(role));
}

export default function ParametrizacionesPage() {
  const { user } = useAuth();
  const roles = user?.roles || [];

  return (
    <div className="stack">
      <section className="card">
        <h2>Parametrizaciones</h2>
        <p className="muted">
          Configurá evaluaciones y plantillas de Prompt IA.
        </p>

        <div className="param-top-nav" role="tablist" aria-label="Opciones de parametrizaciones">
          {opciones.map((opcion) => {
            const allowed = hasAccess(roles, opcion.allowedRoles);

            if (!allowed) {
              return (
                <span
                  key={opcion.path}
                  className="param-top-link inactive"
                  title="No tenés acceso con el rol actual"
                  aria-disabled="true"
                >
                  {opcion.title}
                </span>
              );
            }

            return (
              <NavLink
                key={opcion.path}
                to={opcion.path}
                className={({ isActive }) => `param-top-link ${isActive ? "active" : ""}`}
              >
                {opcion.title}
              </NavLink>
            );
          })}
        </div>
      </section>

      <Outlet />
    </div>
  );
}



