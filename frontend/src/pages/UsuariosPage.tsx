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
  Cargo?: string | null;
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
  cargo: "",
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

const USERS_PAGE_SIZE = 100;

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
  const [loadingListado, setLoadingListado] = useState(false);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isFormExpanded, setIsFormExpanded] = useState(false);

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

  async function load(query = "", nextPage = page) {
    const cleanQuery = String(query || "").trim();
    setLoadingListado(true);
    try {
      const requests: Promise<any>[] = [
        api.get("/catalogos/roles")
      ];

      if (cleanQuery) {
        requests.unshift(
          api.get("/usuarios", {
            params: { q: cleanQuery, page: nextPage, pageSize: USERS_PAGE_SIZE }
          })
        );
      }

      if (isSuperAdmin) {
        requests.push(
          api.get("/instituciones", { params: { incluirInactivas: false } })
        );
      }

      const responses = await Promise.all(requests);

      const usersResponse = cleanQuery ? responses[0] : null;
      const rolesResponse = cleanQuery ? responses[1] : responses[0];
      const institucionesResponse = cleanQuery ? responses[2] : responses[1];

      if (cleanQuery && usersResponse) {
        const usersData = usersResponse.data.data ?? [];
        if (Array.isArray(usersData)) {
          setItems(usersData);
          setTotalItems(usersData.length);
          setPage(nextPage);
        } else {
          setItems(usersData.items ?? []);
          setTotalItems(Number(usersData.total || 0));
          setPage(Number(usersData.page || nextPage));
        }
      } else {
        setItems([]);
        setTotalItems(0);
        setPage(1);
      }

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
    } finally {
      setLoadingListado(false);
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

  function openCreateForm() {
    resetForm();
    setMessage("");
    setErrorMessage("");
    setIsFormExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        cargo: form.cargo || null,
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
      setIsFormExpanded(false);
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
      cargo: item.Cargo || "",
      roleNames: [roleSeguro]
    });
    setIsFormExpanded(true);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    resetForm();
    setMessage("");
    setErrorMessage("");
    setIsFormExpanded(false);
  }

  async function handleInactivate(id: number) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para inactivar usuarios");
      return;
    }

    const confirmado = window.confirm("¿Deseás inactivar este usuario?");
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      await api.patch(`/usuarios/${id}/inactivar`);
      setMessage("Usuario inactivado correctamente");

      if (editingId === id) {
        resetForm();
        setIsFormExpanded(false);
      }

      await load(search);
    } catch (error: any) {
      console.error("Error inactivando usuario:", error);
      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo inactivar el usuario";

      setErrorMessage(backendMessage);
    }
  }

  async function handleDeletePermanent(id: number) {
    if (!canManageUsers) {
      setErrorMessage("No tenés permisos para eliminar usuarios");
      return;
    }

    const confirmado = window.confirm(
      "¿Deseás eliminar este usuario definitivamente?\n\nEsta acción no se puede deshacer"
    );
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      await api.delete(`/usuarios/${id}/eliminar`);
      setMessage("Usuario eliminado correctamente");

      if (editingId === id) {
        resetForm();
        setIsFormExpanded(false);
      }

      await load(search);
    } catch (error: any) {
      console.error("Error eliminando usuario:", error);
      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo eliminar el usuario";

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
      `¿Deseás restablecer la clave de ${item.Correo} a su número de cédula?\n\nEl sistema enviará un correo al usuario`
    );
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/usuarios/${item.UsuarioId}/restablecer-clave`);
      setMessage(
        response.data?.message ||
          `La clave fue restablecida y se notificó a ${item.Correo}`
      );
    } catch (error: any) {
      console.error("Error restableciendo la clave:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          "No se pudo restablecer la clave"
      );
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search, 1);
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

  const totalPages = Math.max(1, Math.ceil(totalItems / USERS_PAGE_SIZE));
  const pageStart = totalItems ? (page - 1) * USERS_PAGE_SIZE + 1 : 0;
  const pageEnd = totalItems ? Math.min(totalItems, pageStart + items.length - 1) : 0;

  return (
    <div className="two-col">
      <div style={{ display: "grid", gap: "16px" }}>
        <section className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "12px"
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>
                {isFormExpanded
                  ? editingId
                    ? "Editar usuario"
                    : "Crear usuario"
                  : "Usuarios"}
              </h3>
            </div>

            {canManageUsers && !isFormExpanded && (
              <button
                type="button"
                className="primary-btn"
                onClick={openCreateForm}
              >
                Agregar usuario
              </button>
            )}
          </div>

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
            isFormExpanded ? (
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
                    color: "#cbd5e1"
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
                  Cargo
                  <input
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    placeholder="Ejemplo: Directora, Profesor, Auxiliar Administrativo"
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

                  <button
                    type="button"
                    onClick={handleCancelEdit}
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
            ) : null
          ) : (
            <div style={{ color: "#6b7280" }}>
              Este rol no tiene permisos para crear o modificar usuarios
            </div>
          )}
        </section>

        <section className="card">
          <h3>Incluir desde lista</h3>
          <p style={{ marginTop: 0, color: "#cbd5e1" }}>
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
              load("", 1);
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
            Limpiar
          </button>
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
          <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
            {loadingListado
              ? "Cargando usuarios..."
              : `Mostrando ${pageStart}-${pageEnd} de ${totalItems} usuarios`}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              disabled={loadingListado || page <= 1}
              onClick={() => load(search, page - 1)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", background: "#fff", cursor: page <= 1 ? "not-allowed" : "pointer", color: "#111827" }}
            >
              Anterior
            </button>
            <span style={{ color: "#cbd5e1", fontWeight: 800 }}>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={loadingListado || page >= totalPages}
              onClick={() => load(search, page + 1)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", background: "#fff", cursor: page >= totalPages ? "not-allowed" : "pointer", color: "#111827" }}
            >
              Siguiente
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Correo</th>
                <th>Cédula</th>
                <th>Nombre</th>
                <th>Cargo</th>
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
                      {[item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
                        .join(" ")
                        .replace(/\s+/g, " ")
                        .trim()}
                    </td>
                    <td>{item.Cargo || ""}</td>
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
                              onClick={() => handleInactivate(item.UsuarioId)}
                              style={{
                                border: "1px solid #fde68a",
                                background: "#fffbeb",
                                color: "#92400e",
                                borderRadius: "8px",
                                padding: "6px 10px",
                                cursor: "pointer"
                              }}
                            >
                              Inactivar
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

                          <button
                            type="button"
                            onClick={() => handleDeletePermanent(item.UsuarioId)}
                            style={{
                              border: "1px solid #fecaca",
                              background: "#fef2f2",
                              color: "#b91c1c",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              cursor: "pointer"
                            }}
                          >
                            Eliminar
                          </button>
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
                  <td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>
                    {search.trim()
                      ? "No hay usuarios que coincidan con la bésqueda"
                      : "Digite un correo, nombre o cédula para buscar usuarios"}
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




