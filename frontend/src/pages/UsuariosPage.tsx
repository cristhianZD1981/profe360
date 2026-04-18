import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type User = {
  UsuarioId: number;
  InstitucionId: number | null;
  InstitucionNombre?: string | null;
  InstitucionNombreComercial?: string | null;
  Correo: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido?: string | null;
  Telefono?: string | null;
  Roles: string;
  Activo: boolean;
};

type Role = {
  RolId: number;
  Nombre: string;
};

type Institution = {
  InstitucionId: number;
  Nombre: string;
  NombreComercial?: string | null;
  Activo: boolean;
};

const initialForm = {
  institucionId: "",
  correo: "",
  password: "",
  nombre: "",
  primerApellido: "",
  segundoApellido: "",
  telefono: "",
  roleNames: ["PROFESOR"]
};

const ROLES_PERMITIDOS_SUPER_ADMIN = [
  "SUPER_ADMIN",
  "ADMIN_INSTITUCIONAL",
  "PROFESOR",
  "PROFESOR_GUIA",
  "ADMINISTRATIVO",
  "PADRE_FAMILIA"
];

const ROLES_PERMITIDOS_GESTION_INSTITUCIONAL = [
  "PROFESOR",
  "PROFESOR_GUIA",
  "ADMINISTRATIVO",
  "PADRE_FAMILIA"
];

function parseJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

export default function UsuariosPage() {
  const { user } = useAuth();

  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [instituciones, setInstituciones] = useState<Institution[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const authInfo = useMemo(() => {
    const token =
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token") ||
      "";
    return token ? parseJwt(token) : null;
  }, []);

  const userRoles: string[] = user?.roles || authInfo?.roles || [];
  const userInstitucionId = user?.institucionId
    ? String(user.institucionId)
    : authInfo?.institucionId
      ? String(authInfo.institucionId)
      : "";

  const isSuperAdmin = userRoles.includes("SUPER_ADMIN");
  const isAdminInstitucional = userRoles.includes("ADMIN_INSTITUCIONAL");
  const isAdministrativo = userRoles.includes("ADMINISTRATIVO");
  const canManageUsers =
    isSuperAdmin || isAdminInstitucional || isAdministrativo;

  const rolesDisponibles = useMemo(() => {
    if (isSuperAdmin) {
      return roles.filter((r) => ROLES_PERMITIDOS_SUPER_ADMIN.includes(r.Nombre));
    }

    if (isAdminInstitucional || isAdministrativo) {
      return roles.filter((r) =>
        ROLES_PERMITIDOS_GESTION_INSTITUCIONAL.includes(r.Nombre)
      );
    }

    return [];
  }, [roles, isSuperAdmin, isAdminInstitucional, isAdministrativo]);

  async function load(query = "") {
    try {
      const requests: Promise<any>[] = [
        api.get("/usuarios", { params: { q: query } }),
        api.get("/catalogos/roles")
      ];

      if (isSuperAdmin) {
        requests.push(api.get("/instituciones", { params: { incluirInactivas: false } }));
      }

      const responses = await Promise.all(requests);

      const usersResponse = responses[0];
      const rolesResponse = responses[1];
      const institucionesResponse = responses[2];

      setItems(usersResponse.data.data ?? []);
      setRoles(rolesResponse.data.data ?? []);

      if (isSuperAdmin) {
        setInstituciones(
          (institucionesResponse?.data?.data ?? []).filter(
            (item: Institution) => item.Activo
          )
        );
      } else {
        setInstituciones([]);
      }
    } catch (error) {
      console.error("Error cargando usuarios:", error);
      setErrorMessage("No se pudo cargar la información de usuarios");
    }
  }

  useEffect(() => {
    load();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!editingId) {
      setForm((prev) => ({
        ...prev,
        institucionId: isSuperAdmin ? prev.institucionId : userInstitucionId,
        roleNames: [
          isSuperAdmin
            ? prev.roleNames[0] || "PROFESOR"
            : (
                ROLES_PERMITIDOS_GESTION_INSTITUCIONAL.includes(prev.roleNames[0])
                  ? prev.roleNames[0]
                  : "PROFESOR"
              )
        ]
      }));
    }
  }, [editingId, isSuperAdmin, userInstitucionId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para gestionar usuarios");
      return;
    }

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const payload: any = {
        correo: form.correo,
        nombre: form.nombre,
        primerApellido: form.primerApellido || null,
        segundoApellido: form.segundoApellido || null,
        telefono: form.telefono || null,
        roleNames: form.roleNames
      };

      if (isSuperAdmin) {
        payload.institucionId = form.institucionId ? Number(form.institucionId) : null;
      }

      if (editingId) {
        await api.put(`/usuarios/${editingId}`, payload);
        setMessage("Usuario actualizado correctamente");
      } else {
        payload.password = form.password;
        await api.post("/usuarios", payload);
        setMessage("Usuario creado correctamente");
      }

      setForm({
        ...initialForm,
        institucionId: isSuperAdmin ? "" : userInstitucionId,
        roleNames: ["PROFESOR"]
      });
      setEditingId(null);
      await load(search);
    } catch (error: any) {
      console.error("Error guardando usuario:", error);
      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo guardar el usuario";

      setErrorMessage(backendMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(item: User) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para editar usuarios");
      return;
    }

    setMessage("");
    setErrorMessage("");
    setEditingId(item.UsuarioId);

    const firstRole = item.Roles
      ? item.Roles.split(",").map((x) => x.trim()).filter(Boolean)[0] || "PROFESOR"
      : "PROFESOR";

    const roleSeguro = isSuperAdmin
      ? firstRole
      : (
          ROLES_PERMITIDOS_GESTION_INSTITUCIONAL.includes(firstRole)
            ? firstRole
            : "PROFESOR"
        );

    setForm({
      institucionId: item.InstitucionId ? String(item.InstitucionId) : "",
      correo: item.Correo || "",
      password: "",
      nombre: item.Nombre || "",
      primerApellido: item.PrimerApellido || "",
      segundoApellido: item.SegundoApellido || "",
      telefono: item.Telefono || "",
      roleNames: [roleSeguro]
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm({
      ...initialForm,
      institucionId: isSuperAdmin ? "" : userInstitucionId,
      roleNames: ["PROFESOR"]
    });
    setMessage("");
    setErrorMessage("");
  }

  async function handleDelete(id: number) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para desactivar usuarios");
      return;
    }

    const confirmado = window.confirm("¿Deseás desactivar este usuario?");
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      await api.delete(`/usuarios/${id}`);
      setMessage("Usuario desactivado correctamente");

      if (editingId === id) {
        setEditingId(null);
        setForm({
          ...initialForm,
          institucionId: isSuperAdmin ? "" : userInstitucionId,
          roleNames: ["PROFESOR"]
        });
      }

      await load(search);
    } catch (error: any) {
      console.error("Error desactivando usuario:", error);
      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo desactivar el usuario";

      setErrorMessage(backendMessage);
    }
  }

  async function handleReactivate(id: number) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para reactivar usuarios");
      return;
    }

    setMessage("");
    setErrorMessage("");

    try {
      await api.patch(`/usuarios/${id}/reactivar`);
      setMessage("Usuario reactivado correctamente");
      await load(search);
    } catch (error: any) {
      console.error("Error reactivando usuario:", error);
      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo reactivar el usuario";

      setErrorMessage(backendMessage);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search);
  }

  return (
    <div className="two-col">
      <section className="card">
        <h3>{editingId ? "Editar usuario" : "Crear usuario"}</h3>

        {message && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#ecfdf3",
              color: "#166534",
              border: "1px solid #bbf7d0"
            }}
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca"
            }}
          >
            {errorMessage}
          </div>
        )}

        {canManageUsers ? (
          <form className="form" onSubmit={handleSubmit}>
            {isSuperAdmin && (
              <label>
                Institución
                <select
                  value={form.institucionId}
                  onChange={(e) =>
                    setForm({ ...form, institucionId: e.target.value })
                  }
                >
                  <option value="">Seleccione</option>
                  {instituciones.map((inst) => (
                    <option key={inst.InstitucionId} value={inst.InstitucionId}>
                      {inst.NombreComercial || inst.Nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Correo
              <input
                type="email"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
              />
            </label>

            {!editingId && (
              <label>
                Contraseña
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
            )}

            <label>
              Nombre
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </label>

            <label>
              Primer apellido
              <input
                value={form.primerApellido}
                onChange={(e) => setForm({ ...form, primerApellido: e.target.value })}
              />
            </label>

            <label>
              Segundo apellido
              <input
                value={form.segundoApellido}
                onChange={(e) => setForm({ ...form, segundoApellido: e.target.value })}
              />
            </label>

            <label>
              Teléfono
              <input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </label>

            <label>
              Rol
              <select
                value={form.roleNames[0]}
                onChange={(e) => setForm({ ...form, roleNames: [e.target.value] })}
              >
                {rolesDisponibles.map((role) => (
                  <option key={role.RolId} value={role.Nombre}>
                    {role.Nombre}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={loading}>
                {loading
                  ? editingId ? "Actualizando..." : "Guardando..."
                  : editingId ? "Actualizar" : "Guardar"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : (
          <div style={{ color: "#6b7280" }}>
            Este rol no tiene permisos para crear o modificar usuarios
          </div>
        )}
      </section>

      <section className="card">
        <h3>Usuarios</h3>

        <form
          onSubmit={handleSearch}
          style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}
        >
          <input
            placeholder="Buscar por correo o nombre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: "240px",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid #d1d5db"
            }}
          />

          <button className="primary-btn" type="submit">
            Buscar
          </button>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              load("");
            }}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              padding: "10px 14px",
              background: "#fff",
              cursor: "pointer"
            }}
          >
            Limpiar
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Correo</th>
                <th>Nombre</th>
                <th>Institución</th>
                <th>Roles</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const institucionNombre =
                  item.InstitucionNombreComercial ||
                  item.InstitucionNombre ||
                  (item.InstitucionId ? `ID ${item.InstitucionId}` : "Global");

                return (
                  <tr key={item.UsuarioId}>
                    <td>{item.UsuarioId}</td>
                    <td>{item.Correo}</td>
                    <td>
                      {item.Nombre} {item.PrimerApellido || ""}
                    </td>
                    <td>{institucionNombre}</td>
                    <td>{item.Roles || "Sin rol"}</td>
                    <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                    <td>
                      {canManageUsers ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            style={{
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              cursor: "pointer"
                            }}
                          >
                            Editar
                          </button>

                          {item.Activo ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.UsuarioId)}
                              style={{
                                border: "1px solid #fecaca",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReactivate(item.UsuarioId)}
                              style={{
                                border: "1px solid #bbf7d0",
                                background: "#ecfdf3",
                                color: "#166534",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#6b7280" }}>Solo lectura</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!items.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>
                    No hay usuarios registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}