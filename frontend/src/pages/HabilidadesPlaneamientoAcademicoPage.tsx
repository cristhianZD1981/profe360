import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type Materia = {
  MateriaId: number;
  Nombre: string;
  Codigo?: string | null;
};

type Habilidad = {
  PlaneamientoHabilidadId: number;
  MateriaId?: number | null;
  MateriaNombre?: string | null;
  TipoColegio?: string | null;
  Ciclo?: string | null;
  Grado?: string | null;
  Mes?: string | null;
  Area?: string | null;
  NumeroHabilidad?: string | null;
  DescripcionHabilidad: string;
  DocumentoReferencia?: string | null;
  UsuarioCreadorId?: number | null;
  Activo: boolean;
};

type Catalogos = {
  materias: Materia[];
  tiposColegio: string[];
  grados: string[];
  meses: string[];
  areas: string[];
};

const emptyCatalogos: Catalogos = {
  materias: [],
  tiposColegio: [],
  grados: [],
  meses: [],
  areas: []
};

const initialForm = {
  materiaId: "",
  materiaNombre: "",
  tipoColegio: "Académico",
  ciclo: "",
  grado: "",
  mes: "",
  area: "",
  numeroHabilidad: "",
  descripcionHabilidad: "",
  documentoReferencia: ""
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "#fff",
  cursor: "pointer"
};

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

export default function HabilidadesPlaneamientoAcademicoPage() {
  const { user } = useAuth();
  const roles = user?.roles || [];
  const currentUserId = Number(user?.userId || 0);
  const isAdminRole = roles.some((role) => ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"].includes(role));
  const isProfesorRole = roles.some((role) => ["PROFESOR", "PROFESOR_GUIA"].includes(role));
  const canCreateHabilidades = isAdminRole || isProfesorRole;

  const [catalogos, setCatalogos] = useState<Catalogos>(emptyCatalogos);
  const [habilidades, setHabilidades] = useState<Habilidad[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [archivoExcel, setArchivoExcel] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [filters, setFilters] = useState({
    materiaId: "",
    tipoColegio: "",
    grado: "",
    mes: "",
    area: "",
    q: "",
    incluirInactivas: false
  });

  const selectedMateria = useMemo(
    () => catalogos.materias.find((materia) => String(materia.MateriaId) === String(form.materiaId)),
    [catalogos.materias, form.materiaId]
  );

  function canEditHabilidad(item: Habilidad) {
    if (isAdminRole) return true;
    if (!isProfesorRole) return false;
    return currentUserId > 0 && Number(item.UsuarioCreadorId || 0) === currentUserId;
  }

  useEffect(() => {
    loadCatalogos();
    loadHabilidades();
  }, []);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function loadCatalogos() {
    try {
      const response = await api.get("/planeamiento-ia/catalogos");
      const data = response.data?.data || {};
      setCatalogos({
        materias: Array.isArray(data.materias) ? data.materias : [],
        tiposColegio: Array.isArray(data.tiposColegio) ? data.tiposColegio : [],
        grados: Array.isArray(data.grados) ? data.grados : [],
        meses: Array.isArray(data.meses) ? data.meses : [],
        areas: Array.isArray(data.areas) ? data.areas : []
      });
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los catálogos de habilidades"));
    }
  }

  async function loadHabilidades(customFilters = filters) {
    setLoading(true);
    clearMessages();
    try {
      const response = await api.get("/planeamiento-ia/habilidades", {
        params: {
          materiaId: customFilters.materiaId || undefined,
          tipoColegio: customFilters.tipoColegio || undefined,
          grado: customFilters.grado || undefined,
          mes: customFilters.mes || undefined,
          area: customFilters.area || undefined,
          q: customFilters.q || undefined,
          incluirInactivas: customFilters.incluirInactivas
        }
      });
      setHabilidades(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar las habilidades"));
    } finally {
      setLoading(false);
    }
  }

  function updateForm(field: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openNewForm() {
    if (!canCreateHabilidades) {
      setErrorMessage("No tenés permisos para agregar habilidades");
      return;
    }
    clearMessages();
    setEditingId(null);
    setForm(initialForm);
    setShowForm(true);
  }

  function openEditForm(item: Habilidad) {
    if (!canEditHabilidad(item)) {
      setErrorMessage("Solo podés editar habilidades creadas por vos");
      return;
    }
    clearMessages();
    setEditingId(item.PlaneamientoHabilidadId);
    setForm({
      materiaId: item.MateriaId ? String(item.MateriaId) : "",
      materiaNombre: item.MateriaNombre || "",
      tipoColegio: item.TipoColegio || "Académico",
      ciclo: item.Ciclo || "",
      grado: item.Grado || "",
      mes: item.Mes || "",
      area: item.Area || "",
      numeroHabilidad: item.NumeroHabilidad || "",
      descripcionHabilidad: item.DescripcionHabilidad || "",
      documentoReferencia: item.DocumentoReferencia || ""
    });
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(initialForm);
    setShowForm(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    clearMessages();

    const materiaNombre = selectedMateria?.Nombre || form.materiaNombre;
    if (!form.materiaId && !materiaNombre.trim()) return setErrorMessage("Debés indicar la materia");
    if (!form.tipoColegio.trim()) return setErrorMessage("Debés indicar el tipo de colegio");
    if (!form.grado.trim()) return setErrorMessage("Debés indicar el grado");
    if (!form.mes.trim()) return setErrorMessage("Debés indicar el mes");
    if (!form.descripcionHabilidad.trim()) return setErrorMessage("Debés indicar la descripción de la habilidad");

    setSaving(true);
    try {
      const payload = {
        materiaId: form.materiaId ? Number(form.materiaId) : null,
        materiaNombre,
        tipoColegio: form.tipoColegio,
        ciclo: form.ciclo || null,
        grado: form.grado,
        mes: form.mes,
        area: form.area || null,
        numeroHabilidad: form.numeroHabilidad || null,
        descripcionHabilidad: form.descripcionHabilidad,
        documentoReferencia: form.documentoReferencia || null
      };

      const response = editingId
        ? await api.put(`/planeamiento-ia/habilidades/${editingId}`, payload)
        : await api.post("/planeamiento-ia/habilidades", payload);

      setMessage(response.data?.message || (editingId ? "Habilidad actualizada correctamente" : "Habilidad agregada correctamente"));
      closeForm();
      await loadCatalogos();
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar la habilidad"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable(id: number) {
    const item = habilidades.find((habilidad) => Number(habilidad.PlaneamientoHabilidadId) === Number(id));
    if (!item || !canEditHabilidad(item)) {
      setErrorMessage("Solo podes inhabilitar habilidades creadas por vos");
      return;
    }

    if (!window.confirm("Deseas inhabilitar esta habilidad?")) return;
    clearMessages();
    try {
      const response = await api.delete(`/planeamiento-ia/habilidades/${id}`);
      setMessage(response.data?.message || "Habilidad inhabilitada correctamente");
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo inhabilitar la habilidad"));
    }
  }

  async function handleReactivate(id: number) {
    const item = habilidades.find((habilidad) => Number(habilidad.PlaneamientoHabilidadId) === Number(id));
    if (!item || !canEditHabilidad(item)) {
      setErrorMessage("Solo podes reactivar habilidades creadas por vos");
      return;
    }

    clearMessages();
    try {
      const response = await api.patch(`/planeamiento-ia/habilidades/${id}/reactivar`);
      setMessage(response.data?.message || "Habilidad reactivada correctamente");
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar la habilidad"));
    }
  }

  async function handleImport(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    if (!archivoExcel) return setErrorMessage("Debes seleccionar un archivo Excel");

    setImportProgress(5);
    setImportResult(null);
    setImporting(true);

    const timer = setInterval(() => {
      setImportProgress((prev) => {
        if (prev === null) return 5;
        if (prev >= 85) return prev;
        return prev + 10;
      });
    }, 250);

    try {
      const data = new FormData();
      data.append("archivo", archivoExcel);
      const response = await api.post("/planeamiento-ia/habilidades/importar-excel", data, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setImportProgress(100);
      setImportResult(response.data?.data || null);
      setMessage(response.data?.message || "Archivo importado correctamente");
      setArchivoExcel(null);
      await loadCatalogos();
      await loadHabilidades();
    } catch (error: any) {
      setImportProgress(null);
      setErrorMessage(getErrorMessage(error, "No se pudo importar el archivo"));
    } finally {
      clearInterval(timer);
      setImporting(false);
    }
  }

  async function handleDescargarPlantilla() {
    clearMessages();
    try {
      const response = await api.get("/planeamiento-ia/habilidades/plantilla", {
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "plantilla_habilidades_planeamiento.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo descargar la plantilla"));
    }
  }

  function descargarReporteImportacion() {
    if (!importResult?.resultados?.length) return;
    const header = "Fila,Estado,Motivo,HabilidadId";
    const lines = importResult.resultados.map((item: any) =>
      [item.fila ?? "", item.estado ?? "", item.motivo ?? "", item.habilidadId ?? ""]
        .map((value: any) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "reporte_importacion_habilidades.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  }

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    loadHabilidades(filters);
  }

  return (
    <div className="stack">
      <section className="card" style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h3 style={{ marginBottom: "4px" }}>Mantenimiento de habilidades para planeamiento</h3>
            <p style={{ margin: 0, opacity: 0.75 }}>
              Administrá las habilidades que después utilizará el docente para generar planeamientos con apoyo de IA
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" className="primary-btn" onClick={openNewForm} disabled={!canCreateHabilidades}>Agregar habilidad</button>
            <button type="button" style={secondaryButtonStyle} onClick={handleDescargarPlantilla}>Descargar plantilla</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => setShowImport((prev) => !prev)} disabled={!canCreateHabilidades}>Importar Excel</button>
          </div>
        </div>

        {message && <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>{message}</div>}
        {errorMessage && <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>{errorMessage}</div>}

        {showImport && (
          <form onSubmit={handleImport} className="form" style={{ marginTop: "14px", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
            <h4>Importar habilidades desde Excel</h4>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivoExcel(e.target.files?.[0] || null)} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={importing}>{importing ? "Importando..." : "Importar"}</button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  setShowImport(false);
                  setImportProgress(null);
                  setImportResult(null);
                }}
              >
                Cancelar
              </button>
            </div>

            {(importing || importProgress !== null) && (
              <div className="processing-indicator" role="status" aria-live="polite">
                <div className="processing-body">
                  <strong>{importing ? "Importando archivo..." : "Importación completada"}</strong>
                  <div className="processing-progress-track">
                    <div className="processing-progress-bar" style={{ width: `${Math.max(0, Math.min(100, importProgress || 0))}%` }} />
                  </div>
                  <div className="processing-progress-meta">
                    <span>{Math.round(importProgress || 0)}%</span>
                  </div>
                </div>
              </div>
            )}

            {importResult && (
              <div style={{ marginTop: "12px", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
                <strong>Reporte final</strong>
                <div style={{ marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <span>Total: {importResult.totalLeidos || 0}</span>
                  <span>Insertados: {importResult.insertados || 0}</span>
                  <span>Duplicados: {importResult.duplicados || 0}</span>
                  <span>Omitidos: {importResult.omitidos || 0}</span>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <button type="button" style={secondaryButtonStyle} onClick={descargarReporteImportacion}>
                    Descargar reporte
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {showForm && (
          <form onSubmit={handleSave} className="form" style={{ marginTop: "14px", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
            <h4>{editingId ? "Editar habilidad" : "Nueva habilidad"}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <label>
                Materia
                <select value={form.materiaId} onChange={(e) => updateForm("materiaId", e.target.value)}>
                  <option value="">Seleccionar materia</option>
                  {catalogos.materias.map((materia) => <option key={materia.MateriaId} value={materia.MateriaId}>{materia.Nombre}</option>)}
                </select>
              </label>
              <label>
                Materia manual
                <input value={form.materiaNombre} onChange={(e) => updateForm("materiaNombre", e.target.value)} placeholder="Solo si no está en el catálogo" />
              </label>
              <label>
                Tipo de colegio
                <input list="habilidades-tipos-colegio" value={form.tipoColegio} onChange={(e) => updateForm("tipoColegio", e.target.value)} />
                <datalist id="habilidades-tipos-colegio">{catalogos.tiposColegio.map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label>
                Ciclo
                <input value={form.ciclo} onChange={(e) => updateForm("ciclo", e.target.value)} placeholder="Ejemplo: Tercer ciclo" />
              </label>
              <label>
                Grado
                <input list="habilidades-grados" value={form.grado} onChange={(e) => updateForm("grado", e.target.value)} />
                <datalist id="habilidades-grados">{catalogos.grados.map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label>
                Mes
                <input list="habilidades-meses" value={form.mes} onChange={(e) => updateForm("mes", e.target.value)} />
                <datalist id="habilidades-meses">{catalogos.meses.map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label>
                Área
                <input list="habilidades-areas" value={form.area} onChange={(e) => updateForm("area", e.target.value)} />
                <datalist id="habilidades-areas">{catalogos.areas.map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label>
                Número de habilidad
                <input value={form.numeroHabilidad} onChange={(e) => updateForm("numeroHabilidad", e.target.value)} />
              </label>
              <label>
                Documento de referencia
                <input value={form.documentoReferencia} onChange={(e) => updateForm("documentoReferencia", e.target.value)} />
              </label>
            </div>
            <label>
              Descripción de la habilidad
              <textarea rows={3} value={form.descripcionHabilidad} onChange={(e) => updateForm("descripcionHabilidad", e.target.value)} required />
            </label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={saving}>{saving ? "Guardando..." : "Guardar habilidad"}</button>
              <button type="button" style={secondaryButtonStyle} onClick={closeForm}>Cancelar</button>
            </div>
          </form>
        )}
      </section>

      <section className="card" style={{ marginBottom: 0 }}>
        <h4>Buscar habilidades</h4>
        <form onSubmit={handleFilterSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", alignItems: "end" }}>
          <label>
            Materia
            <select value={filters.materiaId} onChange={(e) => setFilters((prev) => ({ ...prev, materiaId: e.target.value }))}>
              <option value="">Todas</option>
              {catalogos.materias.map((materia) => <option key={materia.MateriaId} value={materia.MateriaId}>{materia.Nombre}</option>)}
            </select>
          </label>
          <label>
            Tipo colegio
            <select value={filters.tipoColegio} onChange={(e) => setFilters((prev) => ({ ...prev, tipoColegio: e.target.value }))}>
              <option value="">Todos</option>
              {catalogos.tiposColegio.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Grado
            <select value={filters.grado} onChange={(e) => setFilters((prev) => ({ ...prev, grado: e.target.value }))}>
              <option value="">Todos</option>
              {catalogos.grados.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Mes
            <select value={filters.mes} onChange={(e) => setFilters((prev) => ({ ...prev, mes: e.target.value }))}>
              <option value="">Todos</option>
              {catalogos.meses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Área
            <select value={filters.area} onChange={(e) => setFilters((prev) => ({ ...prev, area: e.target.value }))}>
              <option value="">Todas</option>
              {catalogos.areas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Buscar texto
            <input value={filters.q} onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))} placeholder="Habilidad, área o número" />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "10px" }}>
            <input type="checkbox" checked={filters.incluirInactivas} onChange={(e) => setFilters((prev) => ({ ...prev, incluirInactivas: e.target.checked }))} />
            Incluir inactivas
          </label>
          <button className="primary-btn" type="submit">Buscar</button>
        </form>

        <div className="table-wrap" style={{ marginTop: "14px" }}>
          <table>
            <thead>
              <tr>
                <th>Materia</th>
                <th>Tipo colegio</th>
                <th>Grado</th>
                <th>Mes</th>
                <th>Área</th>
                <th>Número</th>
                <th>Habilidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {habilidades.map((item) => (
                <tr key={item.PlaneamientoHabilidadId}>
                  <td>{item.MateriaNombre || ""}</td>
                  <td>{item.TipoColegio || ""}</td>
                  <td>{item.Grado || ""}</td>
                  <td>{item.Mes || ""}</td>
                  <td>{item.Area || ""}</td>
                  <td>{item.NumeroHabilidad || ""}</td>
                  <td style={{ minWidth: "320px" }}>{item.DescripcionHabilidad}</td>
                  <td>{item.Activo ? "Activa" : "Inactiva"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => openEditForm(item)}
                        disabled={!canEditHabilidad(item)}
                        title={!canEditHabilidad(item) ? "Solo podés editar habilidades creadas por vos" : undefined}
                      >
                        Editar
                      </button>
                      {item.Activo ? (
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => handleDisable(item.PlaneamientoHabilidadId)}
                          disabled={!canEditHabilidad(item)}
                          title={!canEditHabilidad(item) ? "Solo podés inhabilitar habilidades creadas por vos" : undefined}
                        >
                          Inhabilitar
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => handleReactivate(item.PlaneamientoHabilidadId)}
                          disabled={!canEditHabilidad(item)}
                          title={!canEditHabilidad(item) ? "Solo podés reactivar habilidades creadas por vos" : undefined}
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!habilidades.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>
                    {loading ? "Cargando habilidades..." : "No hay habilidades registradas con esos filtros"}
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






