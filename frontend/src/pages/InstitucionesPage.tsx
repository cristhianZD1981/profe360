import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type Institution = {
  InstitucionId: number;
  TipoClienteId: number;
  Nombre: string;
  NombreComercial: string | null;
  CedulaJuridica: string | null;
  CorreoPrincipal: string | null;
  TelefonoPrincipal: string | null;
  Direccion: string | null;
  CodigoPresupuestario?: string | null;
  CodigoPresupuestarioPL?: string | null;
  DescripcionCodigoPresupuestarioPL?: string | null;
  DireccionExacta?: string | null;
  LogoUrl: string | null;
  MembreteUrl: string | null;
  NombreOficialBoleta: string | null;
  RegionalEducativa: string | null;
  CircuitoEducativo: string | null;
  Activo: boolean;
};

const initialForm = {
  tipoClienteId: 1,
  nombre: "",
  nombreComercial: "",
  cedulaJuridica: "",
  correoPrincipal: "",
  telefonoPrincipal: "",
  direccion: "",
  codigoPresupuestario: "",
  codigoPresupuestarioPL: "",
  descripcionCodigoPresupuestarioPL: "",
  direccionExacta: "",
  logoUrl: "",
  membreteUrl: "",
  nombreOficialBoleta: "",
  regionalEducativa: "",
  circuitoEducativo: ""
};

function parseJwt(token: string) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

export default function InstitucionesPage() {
  const [items, setItems] = useState<Institution[]>([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingMembrete, setUploadingMembrete] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [incluirInactivas, setIncluirInactivas] = useState(false);

  const authInfo = useMemo(() => {
    const token =
      localStorage.getItem("auth_token") ||
      localStorage.getItem("token") ||
      "";
    return token ? parseJwt(token) : null;
  }, []);

  const roles: string[] = authInfo?.roles || [];
  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const isAdminInstitucional = roles.includes("ADMIN_INSTITUCIONAL");

  async function load(query = "", verInactivas = incluirInactivas) {
    try {
      const response = await api.get("/instituciones", {
        params: {
          q: query,
          incluirInactivas: verInactivas
        }
      });

      const data = response.data.data ?? [];
      setItems(data);
    } catch (error) {
      console.error("Error cargando instituciones:", error);
      setErrorMessage("No se pudo cargar el listado de instituciones");
    }
  }

  useEffect(() => {
    load("", incluirInactivas);
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(initialForm);
    setMessage("");
    setErrorMessage("");
    setIsFormExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function subirArchivo(file: File, tipo: "logo" | "membrete") {
    if (tipo === "logo") setUploadingLogo(true);
    if (tipo === "membrete") setUploadingMembrete(true);

    setErrorMessage("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("archivo", file);

      const response = await api.post("/archivos/subir", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const secureUrl =
        response.data?.data?.secure_url ||
        response.data?.data?.url ||
        "";

      if (!secureUrl) {
        throw new Error("No se recibió la URL del archivo");
      }

      if (tipo === "logo") {
        setForm((prev) => ({ ...prev, logoUrl: secureUrl }));
        setMessage("Logo subido correctamente");
      } else {
        setForm((prev) => ({ ...prev, membreteUrl: secureUrl }));
        setMessage("Membrete subido correctamente");
      }
    } catch (error: any) {
      console.error(`Error subiendo ${tipo}:`, error);

      const backendMessage =
        error?.response?.data?.message ||
        `No se pudo subir el ${tipo}`;

      setErrorMessage(backendMessage);
    } finally {
      if (tipo === "logo") setUploadingLogo(false);
      if (tipo === "membrete") setUploadingMembrete(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const payload = {
        tipoClienteId: form.tipoClienteId,
        nombre: form.nombre,
        nombreComercial: form.nombreComercial || null,
        cedulaJuridica: form.cedulaJuridica || null,
        correoPrincipal: form.correoPrincipal || null,
        telefonoPrincipal: form.telefonoPrincipal || null,
        direccion: form.direccion || null,
        codigoPresupuestario: form.codigoPresupuestario || null,
        codigoPresupuestarioPL: form.codigoPresupuestarioPL || null,
        descripcionCodigoPresupuestarioPL: form.descripcionCodigoPresupuestarioPL || null,
        direccionExacta: form.direccionExacta || null,
        logoUrl: form.logoUrl || null,
        membreteUrl: form.membreteUrl || null,
        nombreOficialBoleta: form.nombreOficialBoleta || null,
        regionalEducativa: form.regionalEducativa || null,
        circuitoEducativo: form.circuitoEducativo || null
      };

      if (editingId) {
        await api.put(`/instituciones/${editingId}`, payload);
        setMessage("Institución actualizada correctamente");
      } else {
        await api.post("/instituciones", payload);
        setMessage("Institución creada correctamente");
      }

      setForm(initialForm);
      setEditingId(null);
      setIsFormExpanded(false);

      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error guardando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo guardar la institución";

      setErrorMessage(backendMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(item: Institution) {
    setMessage("");
    setErrorMessage("");
    setEditingId(item.InstitucionId);
    setForm({
      tipoClienteId: item.TipoClienteId,
      nombre: item.Nombre || "",
      nombreComercial: item.NombreComercial || "",
      cedulaJuridica: item.CedulaJuridica || "",
      correoPrincipal: item.CorreoPrincipal || "",
      telefonoPrincipal: item.TelefonoPrincipal || "",
      direccion: item.Direccion || "",
      codigoPresupuestario: item.CodigoPresupuestario || "",
      codigoPresupuestarioPL: item.CodigoPresupuestarioPL || "",
      descripcionCodigoPresupuestarioPL: item.DescripcionCodigoPresupuestarioPL || "",
      direccionExacta: item.DireccionExacta || "",
      logoUrl: item.LogoUrl || "",
      membreteUrl: item.MembreteUrl || "",
      nombreOficialBoleta: item.NombreOficialBoleta || "",
      regionalEducativa: item.RegionalEducativa || "",
      circuitoEducativo: item.CircuitoEducativo || ""
    });
    setIsFormExpanded(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(initialForm);
    setMessage("");
    setErrorMessage("");
    setIsFormExpanded(false);
  }

  async function handleDelete(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta institución?");
    if (!confirmado) return;

    setMessage("");
    setErrorMessage("");

    try {
      await api.delete(`/instituciones/${id}`);
      setMessage("Institución desactivada correctamente");

      if (editingId === id) {
        setEditingId(null);
        setForm(initialForm);
        if (isSuperAdmin) {
          setIsFormExpanded(false);
        }
      }

      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error desactivando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo desactivar la institución";

      setErrorMessage(backendMessage);
    }
  }

  async function handleReactivate(id: number) {
    setMessage("");
    setErrorMessage("");

    try {
      await api.patch(`/instituciones/${id}/reactivar`);
      setMessage("Institución reactivada correctamente");
      await load(search, incluirInactivas);
    } catch (error: any) {
      console.error("Error reactivando institución:", error);

      const backendMessage =
        error?.response?.data?.message ||
        "No se pudo reactivar la institución";

      setErrorMessage(backendMessage);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await load(search, incluirInactivas);
  }

  return (
    <div className="two-col">
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
                  ? "Editar institución"
                  : isSuperAdmin
                    ? "Crear institución"
                    : "Mi institución"
                : "Instituciones"}
            </h3>
          </div>

          {!isFormExpanded && (
            <>
              {isSuperAdmin && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={openCreateForm}
                >
                  Agregar institución
                </button>
              )}

              {!isSuperAdmin && items.length > 0 && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleEdit(items[0])}
                >
                  Editar institución
                </button>
              )}
            </>
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

        {isFormExpanded ? (
          <form className="form" onSubmit={handleSubmit}>
          {isSuperAdmin && (
            <label>
              Tipo cliente
              <input
                type="number"
                value={form.tipoClienteId}
                onChange={(e) =>
                  setForm({ ...form, tipoClienteId: Number(e.target.value || 1) })
                }
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
            Nombre comercial
            <input
              value={form.nombreComercial}
              onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })}
            />
          </label>

          <label>
            Nombre oficial para boleta
            <input
              value={form.nombreOficialBoleta}
              onChange={(e) => setForm({ ...form, nombreOficialBoleta: e.target.value })}
              placeholder="Nombre formal que saldrá en la boleta"
            />
          </label>

          <label>
            Regional educativa
            <input
              value={form.regionalEducativa}
              onChange={(e) => setForm({ ...form, regionalEducativa: e.target.value })}
            />
          </label>

          <label>
            Circuito educativo
            <input
              value={form.circuitoEducativo}
              onChange={(e) => setForm({ ...form, circuitoEducativo: e.target.value })}
            />
          </label>

          <label>
            Cédula jurídica
            <input
              value={form.cedulaJuridica}
              onChange={(e) => setForm({ ...form, cedulaJuridica: e.target.value })}
            />
          </label>

          <label>
            Correo principal
            <input
              type="email"
              value={form.correoPrincipal}
              onChange={(e) => setForm({ ...form, correoPrincipal: e.target.value })}
            />
          </label>

          <label>
            Teléfono principal
            <input
              value={form.telefonoPrincipal}
              onChange={(e) => setForm({ ...form, telefonoPrincipal: e.target.value })}
            />
          </label>

          <label>
            Dirección
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </label>

          <label>
            Código presupuestario
            <input
              value={form.codigoPresupuestario}
              onChange={(e) => setForm({ ...form, codigoPresupuestario: e.target.value })}
            />
          </label>

          <label>
            Código presupuestario PL
            <input
              value={form.codigoPresupuestarioPL}
              onChange={(e) => setForm({ ...form, codigoPresupuestarioPL: e.target.value })}
            />
          </label>

          <label>
            Descripción código presupuestario PL
            <input
              value={form.descripcionCodigoPresupuestarioPL}
              onChange={(e) =>
                setForm({ ...form, descripcionCodigoPresupuestarioPL: e.target.value })
              }
            />
          </label>

          <label>
            Dirección exacta
            <textarea
              rows={3}
              value={form.direccionExacta}
              onChange={(e) => setForm({ ...form, direccionExacta: e.target.value })}
            />
          </label>

          <div style={{ display: "grid", gap: "8px" }}>
            <label>Logo de la institución</label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirArchivo(file, "logo");
              }}
            />

            {uploadingLogo && (
              <div style={{ fontSize: "14px", color: "#475569" }}>
                Subiendo logo...
              </div>
            )}

            {form.logoUrl && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap"
                }}
              >
                <img
                  src={form.logoUrl}
                  alt="Logo institución"
                  style={{
                    width: "72px",
                    height: "72px",
                    objectFit: "contain",
                    borderRadius: "10px",
                    background: "#fff"
                  }}
                />

                <button
                  type="button"
                  onClick={() => setForm({ ...form, logoUrl: "" })}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Quitar logo
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label>Membrete institucional para boleta</label>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) subirArchivo(file, "membrete");
              }}
            />

            {uploadingMembrete && (
              <div style={{ fontSize: "14px", color: "#475569" }}>
                Subiendo membrete...
              </div>
            )}

            {form.membreteUrl && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "grid",
                  gap: "12px"
                }}
              >
                <img
                  src={form.membreteUrl}
                  alt="Membrete institución"
                  style={{
                    width: "100%",
                    maxHeight: "160px",
                    objectFit: "contain",
                    borderRadius: "10px",
                    background: "#fff"
                  }}
                />

                <button
                  type="button"
                  onClick={() => setForm({ ...form, membreteUrl: "" })}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    background: "#fff",
                    cursor: "pointer",
                    width: "fit-content"
                  }}
                >
                  Quitar membrete
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" disabled={loading || uploadingLogo || uploadingMembrete}>
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
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
        ) : null}
      </section>

      <section className="card">
        <h3>Instituciones</h3>

        {isSuperAdmin && (
          <>
            <form
              onSubmit={handleSearch}
              style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}
            >
              <input
                placeholder="Buscar por nombre, comercial, boleta o correo"
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
                  load("", incluirInactivas);
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

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <input
                type="checkbox"
                checked={incluirInactivas}
                onChange={(e) => setIncluirInactivas(e.target.checked)}
              />
              Incluir inactivas
            </label>
          </>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Logo</th>
                <th>Membrete</th>
                <th>Nombre</th>
                <th>Comercial</th>
                <th>Boleta</th>
                <th>Regional</th>
                <th>Circuito</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Código presupuestario</th>
                <th>Dirección exacta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.InstitucionId}>
                  <td>{item.InstitucionId}</td>
                  <td>
                    {item.LogoUrl ? (
                      <img
                        src={item.LogoUrl}
                        alt={item.Nombre}
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          background: "#fff"
                        }}
                      />
                    ) : (
                      ""
                    )}
                  </td>
                  <td>
                    {item.MembreteUrl ? (
                      <img
                        src={item.MembreteUrl}
                        alt={`Membrete ${item.Nombre}`}
                        style={{
                          width: "110px",
                          height: "48px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          background: "#fff"
                        }}
                      />
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{item.Nombre}</td>
                  <td>{item.NombreComercial ?? ""}</td>
                  <td>{item.NombreOficialBoleta ?? ""}</td>
                  <td>{item.RegionalEducativa ?? ""}</td>
                  <td>{item.CircuitoEducativo ?? ""}</td>
                  <td>{item.CorreoPrincipal ?? ""}</td>
                  <td>{item.TelefonoPrincipal ?? ""}</td>
                  <td>{item.CodigoPresupuestario ?? ""}</td>
                  <td>{item.DireccionExacta ?? ""}</td>
                  <td>{item.Activo ? "Activa" : "Inactiva"}</td>
                  <td>
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

                      {isSuperAdmin && item.Activo && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item.InstitucionId)}
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
                      )}

                      {isSuperAdmin && !item.Activo && (
                        <button
                          type="button"
                          onClick={() => handleReactivate(item.InstitucionId)}
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
                  </td>
                </tr>
              ))}

              {!items.length && (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center", padding: "16px" }}>
                    No hay instituciones registradas
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


