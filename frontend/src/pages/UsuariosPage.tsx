import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type User = {
  UsuarioId: number;
  InstitucionId: number | null;
  InstitucionNombre?: string | null;
  InstitucionNombreComercial?: string | null;
  Correo: string;
  NumeroCedula?: string | null;
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

type ImportResultRow = {
  fila: number;
  correo: string;
  estado: "OK" | "ERROR";
  motivo: string;
};

const initialForm = {
  institucionId: "",
  correo: "",
  numeroCedula: "",
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

  const [archivoImportacion, setArchivoImportacion] = useState<File | null>(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRegistros: number;
    totalOk: number;
    totalError: number;
    resultados: ImportResultRow[];
  } | null>(null);

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
        requests.push(
          api.get("/instituciones", { params: { incluirInactivas: false } })
        );
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

  function resetForm() {
    setForm({
      ...initialForm,
      institucionId: isSuperAdmin ? "" : userInstitucionId,
      roleNames: ["PROFESOR"]
    });
    setEditingId(null);
  }

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
        correo: form.correo.trim(),
        numeroCedula: form.numeroCedula.trim(),
        nombre: form.nombre.trim(),
        primerApellido: form.primerApellido || null,
        segundoApellido: form.segundoApellido || null,
        telefono: form.telefono || null,
        roleNames: form.roleNames
      };

      if (isSuperAdmin) {
        payload.institucionId = form.institucionId
          ? Number(form.institucionId)
          : null;
      }

      if (editingId) {
        await api.put(`/usuarios/${editingId}`, payload);
        setMessage("Usuario actualizado correctamente");
      } else {
        await api.post("/usuarios", payload);
        setMessage(
          "Usuario creado correctamente. La clave inicial es el número de cédula"
        );
      }

      resetForm();
      await load(search);
    } catch (error: any) {
      console.error("Error guardando usuario:", error);
      const backendMessage =
        error?.response?.data?.message || "No se pudo guardar el usuario";

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
      numeroCedula: item.NumeroCedula || "",
      nombre: item.Nombre || "",
      primerApellido: item.PrimerApellido || "",
      segundoApellido: item.SegundoApellido || "",
      telefono: item.Telefono || "",
      roleNames: [roleSeguro]
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    resetForm();
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
        resetForm();
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

  async function handleResetPassword(item: User) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para restablecer contraseñas");
      return;
    }

    const confirmado = window.confirm(
      `¿Deseás enviar un enlace de restablecimiento a ${item.Correo}?`
    );
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/usuarios/${item.UsuarioId}/restablecer-clave`);
      setMessage(
        response.data?.message ||
          `Se envió el enlace de restablecimiento a ${item.Correo}`
      );
    } catch (error: any) {
      console.error("Error restableciendo la clave:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          "No se pudo enviar el enlace de restablecimiento"
      );
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search);
  }

  async function handleDescargarPlantilla() {
    try {
      setMessage("");
      setErrorMessage("");

      const response = await api.get("/usuarios/plantilla-excel", {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_usuarios.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Plantilla descargada correctamente");
    } catch (error: any) {
      console.error("Error descargando plantilla:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo descargar la plantilla"
      );
    }
  }

  async function handleImportarExcel(e: FormEvent) {
    e.preventDefault();

    if (!archivoImportacion) {
      setErrorMessage("Debés seleccionar un archivo Excel");
      return;
    }

    setImportandoExcel(true);
    setMessage("");
    setErrorMessage("");
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportacion);

      const response = await api.post("/usuarios/importar-excel", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      setImportResult(response.data?.data || null);
      setMessage("Importación procesada correctamente");
      setArchivoImportacion(null);
      await load(search);
    } catch (error: any) {
      console.error("Error importando usuarios:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          "No se pudo importar el archivo Excel"
      );
    } finally {
      setImportandoExcel(false);
    }
  }

  return (
    <div className="two-col">
      <div style={{ display: "grid", gap: "16px" }}>
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

              <label>
                Número de cédula
                <input
                  value={form.numeroCedula}
                  onChange={(e) =>
                    setForm({ ...form, numeroCedula: e.target.value })
                  }
                />
              </label>

              <div
                style={{
                  marginTop: "-6px",
                  marginBottom: "4px",
                  fontSize: "13px",
                  color: "#6b7280"
                }}
              >
                La clave inicial del usuario será su número de cédula
              </div>

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
                  onChange={(e) =>
                    setForm({ ...form, primerApellido: e.target.value })
                  }
                />
              </label>

              <label>
                Segundo apellido
                <input
                  value={form.segundoApellido}
                  onChange={(e) =>
                    setForm({ ...form, segundoApellido: e.target.value })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, roleNames: [e.target.value] })
                  }
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
                    ? editingId
                      ? "Actualizando..."
                      : "Guardando..."
                    : editingId
                      ? "Actualizar"
                      : "Guardar"}
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
          <h3>Incluir desde lista</h3>
          <p style={{ marginTop: 0, color: "#6b7280" }}>
            Podés descargar una plantilla, completarla y luego importarla en Excel
          </p>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
            <button
              type="button"
              className="primary-btn"
              onClick={handleDescargarPlantilla}
            >
              Descargar plantilla
            </button>
          </div>

          <form className="form" onSubmit={handleImportarExcel}>
            <label>
              Archivo Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  setArchivoImportacion(e.target.files?.[0] || null)
                }
              />
            </label>

            <button className="primary-btn" disabled={importandoExcel}>
              {importandoExcel ? "Importando..." : "Importar usuarios"}
            </button>
          </form>

          {importResult && (
            <div style={{ marginTop: "16px", display: "grid", gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  fontSize: "14px"
                }}
              >
                <span><strong>Total:</strong> {importResult.totalRegistros}</span>
                <span><strong>Correctos:</strong> {importResult.totalOk}</span>
                <span><strong>Errores:</strong> {importResult.totalError}</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Correo</th>
                      <th>Estado</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.resultados.map((row, index) => (
                      <tr key={`${row.fila}-${index}`}>
                        <td>{row.fila}</td>
                        <td>{row.correo}</td>
                        <td>{row.estado}</td>
                        <td>{row.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h3>Usuarios</h3>

        <form
          onSubmit={handleSearch}
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "12px",
            flexWrap: "wrap"
          }}
        >
          <input
            placeholder="Buscar por correo, nombre o cédula"
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
                <th>Cédula</th>
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
                    <td>{item.NumeroCedula || ""}</td>
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

                          {item.Activo && (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(item)}
                              style={{
                                border: "1px solid #ddd6fe",
                                background: "#f5f3ff",
                                color: "#6d28d9",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Restablecer clave
                            </button>
                          )}

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
                  <td colSpan={8} style={{ textAlign: "center", padding: "16px" }}>
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