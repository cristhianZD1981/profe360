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
  DisponibleTodos?: boolean;
  InstitucionesDisponibles?: number[];
  Activo: boolean;
};

type Institucion = {
  InstitucionId: number;
  Nombre: string;
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

type ResumenHabilidades = {
  total: number;
  activas: number;
  inactivas: number;
  materiasDistintas: number;
  gradosDistintos: number;
  tiposColegioDistintos: number;
  porMateria: { label: string; cantidad: number }[];
  porGrado: { label: string; cantidad: number }[];
  porTipoColegio: { label: string; cantidad: number }[];
};

const gradosValidos = [
  ...Array.from({ length: 12 }, (_, index) => String(index + 1)),
  ...Array.from({ length: 6 }, (_, index) => `${index + 7} PN`)
];

function cicloPorGrado(valor: string) {
  const grado = Number(String(valor || "").match(/^\d+/)?.[0] || 0);
  if (grado >= 1 && grado <= 3) return "Primer Ciclo";
  if (grado >= 4 && grado <= 6) return "Segundo Ciclo";
  if (grado >= 7 && grado <= 9) return "Tercer Ciclo";
  if (grado >= 10 && grado <= 12) return "Cuarto Ciclo";
  return "";
}

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
  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const canCreateHabilidades = isSuperAdmin;

  const [catalogos, setCatalogos] = useState<Catalogos>(emptyCatalogos);
  const [resumen, setResumen] = useState<ResumenHabilidades | null>(null);
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);
  const [habilidades, setHabilidades] = useState<Habilidad[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRestoreGrados, setShowRestoreGrados] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [archivoExcel, setArchivoExcel] = useState<File | null>(null);
  const [archivoRespaldoGrados, setArchivoRespaldoGrados] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoringGrados, setRestoringGrados] = useState(false);
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
  const [disponibleTodos, setDisponibleTodos] = useState(true);
  const [institucionesIds, setInstitucionesIds] = useState<number[]>([]);

  const selectedMateria = useMemo(
    () => catalogos.materias.find((materia) => String(materia.MateriaId) === String(form.materiaId)),
    [catalogos.materias, form.materiaId]
  );

  const statsLocal = useMemo(() => {
    const total = habilidades.length;
    const activas = habilidades.filter((item) => !!item.Activo).length;
    const inactivas = Math.max(0, total - activas);

    const porMateriaMap = new Map<string, number>();
    const porGradoMap = new Map<string, number>();
    const porTipoColegioMap = new Map<string, number>();

    for (const item of habilidades) {
      const materia = String(item.MateriaNombre || "Sin materia").trim() || "Sin materia";
      const grado = String(item.Grado || "Sin grado").trim() || "Sin grado";
      const tipoColegio = String(item.TipoColegio || "Sin tipo").trim() || "Sin tipo";
      porMateriaMap.set(materia, (porMateriaMap.get(materia) || 0) + 1);
      porGradoMap.set(grado, (porGradoMap.get(grado) || 0) + 1);
      porTipoColegioMap.set(tipoColegio, (porTipoColegioMap.get(tipoColegio) || 0) + 1);
    }

    const toSorted = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([label, cantidad]) => ({ label, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad || a.label.localeCompare(b.label, "es"));

    const porMateria = toSorted(porMateriaMap);
    const porGrado = toSorted(porGradoMap);
    const porTipoColegio = toSorted(porTipoColegioMap);

    return {
      total,
      activas,
      inactivas,
      materiasDistintas: porMateria.length,
      gradosDistintos: porGrado.length,
      tiposColegioDistintos: porTipoColegio.length,
      porMateria,
      porGrado,
      porTipoColegio
    };
  }, [habilidades]);

  const stats = resumen || statsLocal;

  function canEditHabilidad(item: Habilidad) {
    return isSuperAdmin && !!item;
  }

  useEffect(() => {
    loadCatalogos();
    loadInstituciones();
    loadResumen();
    loadHabilidades();
  }, []);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function loadInstituciones() {
    try {
      const response = await api.get("/planeamiento-ia/habilidades/instituciones");
      setInstituciones(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los colegios"));
    }
  }

  async function loadResumen() {
    try {
      const response = await api.get("/planeamiento-ia/habilidades/resumen");
      const data = response.data?.data;
      if (data) setResumen(data);
    } catch (error: any) {
      // La lista sigue disponible aunque el resumen no pueda cargarse.
      console.error("No se pudo cargar el resumen de habilidades", error);
    }
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
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "grado" && cicloPorGrado(value) ? { ciclo: cicloPorGrado(value) } : {})
    }));
  }

  function openNewForm() {
    if (!canCreateHabilidades) {
      setErrorMessage("No tenés permisos para agregar habilidades");
      return;
    }
    clearMessages();
    setEditingId(null);
    setForm(initialForm);
    setDisponibleTodos(true);
    setInstitucionesIds([]);
    setMinimized(false);
    setShowForm(true);
  }

  function openEditForm(item: Habilidad) {
    if (!canEditHabilidad(item)) {
      setErrorMessage("Solo podés editar habilidades creadas por vos");
      return;
    }
    clearMessages();
    setEditingId(item.PlaneamientoHabilidadId);
    setDisponibleTodos(item.DisponibleTodos !== false);
    setInstitucionesIds(Array.isArray(item.InstitucionesDisponibles) ? item.InstitucionesDisponibles.map(Number).filter(Boolean) : []);
    setForm({
      materiaId: item.MateriaId ? String(item.MateriaId) : "",
      materiaNombre: item.MateriaNombre || "",
      tipoColegio: item.TipoColegio || "Académico",
      ciclo: cicloPorGrado(item.Grado || "") || item.Ciclo || "",
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
    setDisponibleTodos(true);
    setInstitucionesIds([]);
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
        documentoReferencia: form.documentoReferencia || null,
        disponibleTodos,
        institucionesIds
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
      setErrorMessage("Solo podés inhabilitar habilidades creadas por vos");
      return;
    }

    if (!window.confirm("¿Deseás inhabilitar esta habilidad?")) return;
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
      setErrorMessage("Solo podés reactivar habilidades creadas por vos");
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
      data.append("disponibleTodos", String(disponibleTodos));
      data.append("institucionesIds", JSON.stringify(institucionesIds));
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

  async function handleRestoreGrados(e: FormEvent) {
    e.preventDefault();
    clearMessages();
    if (!archivoRespaldoGrados) return setErrorMessage("Seleccioná el Excel descargado antes de la normalización");
    if (!window.confirm("Se restaurarán únicamente los grados afectados que quedaron como 1. ¿Deseás continuar?")) return;
    setRestoringGrados(true);
    try {
      const data = new FormData();
      data.append("archivo", archivoRespaldoGrados);
      const response = await api.post("/planeamiento-ia/habilidades/restaurar-grados-excel", data, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const result = response.data?.data || {};
      const registrosActualizados = result.actualizadas ?? result.recuperadas ?? 0;
      setMessage(`${response.data?.message || "Grados actualizados"}. Registros actualizados: ${registrosActualizados}.`);
      setArchivoRespaldoGrados(null);
      setShowRestoreGrados(false);
      await loadCatalogos();
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron restaurar los grados"));
    } finally {
      setRestoringGrados(false);
    }
  }

  async function handleDescargarHabilidades() {
    clearMessages();
    try {
      const response = await api.get("/planeamiento-ia/habilidades/exportar", {
        params: {
          materiaId: filters.materiaId || undefined,
          grado: filters.grado || undefined,
          mes: filters.mes || undefined
        },
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "habilidades_planeamiento.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron descargar las habilidades"));
    }
  }

  function toggleInstitucion(institucionId: number) {
    setInstitucionesIds((prev) => prev.includes(institucionId)
      ? prev.filter((id) => id !== institucionId)
      : [...prev, institucionId]);
  }

  function renderDisponibilidad() {
    return (
      <fieldset style={{ margin: "12px 0", border: "1px solid #dbe4f0", borderRadius: "12px", padding: "12px" }}>
        <legend style={{ fontWeight: 800 }}>Disponibilidad para colegios</legend>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <input type="radio" checked={disponibleTodos} onChange={() => setDisponibleTodos(true)} />
          Todos los colegios
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="radio" checked={!disponibleTodos} onChange={() => setDisponibleTodos(false)} />
          Solo colegios seleccionados
        </label>
        {!disponibleTodos && (
          <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px" }}>
            {instituciones.map((institucion) => (
              <label key={institucion.InstitucionId} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <input
                  type="checkbox"
                  checked={institucionesIds.includes(institucion.InstitucionId)}
                  onChange={() => toggleInstitucion(institucion.InstitucionId)}
                />
                {institucion.Nombre}
              </label>
            ))}
            {!instituciones.length && <span>No hay colegios activos disponibles.</span>}
          </div>
        )}
      </fieldset>
    );
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
            <button type="button" style={secondaryButtonStyle} onClick={handleDescargarHabilidades}>Descargar habilidades</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => { setMinimized(false); setShowImport((prev) => !prev); }} disabled={!canCreateHabilidades}>Importar Excel</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => { setMinimized(false); setShowRestoreGrados((prev) => !prev); }} disabled={!canCreateHabilidades}>Actualizar grados desde Excel</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => setMinimized(true)}>Minimizar</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => setMinimized(false)}>Maximizar</button>
          </div>
        </div>

        {message && <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>{message}</div>}
        {errorMessage && <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>{errorMessage}</div>}

        <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: "12px", padding: "10px", background: "rgba(255,255,255,0.04)" }}>
            <strong>Total registros</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.total}</div>
          </div>
          <div style={{ border: "1px solid #bbf7d0", borderRadius: "12px", padding: "10px", background: "#ecfdf3", color: "#166534" }}>
            <strong>Activas</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.activas}</div>
          </div>
          <div style={{ border: "1px solid #fecaca", borderRadius: "12px", padding: "10px", background: "#fef2f2", color: "#991b1b" }}>
            <strong>Inactivas</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.inactivas}</div>
          </div>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: "12px", padding: "10px", background: "rgba(255,255,255,0.04)" }}>
            <strong>Materias</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.materiasDistintas}</div>
          </div>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: "12px", padding: "10px", background: "rgba(255,255,255,0.04)" }}>
            <strong>Grados</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.gradosDistintos}</div>
          </div>
          <div style={{ border: "1px solid #dbe4f0", borderRadius: "12px", padding: "10px", background: "rgba(255,255,255,0.04)" }}>
            <strong>Tipos de colegio</strong>
            <div style={{ fontSize: "24px", fontWeight: 800 }}>{stats.tiposColegioDistintos}</div>
          </div>
        </div>

        <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
            <strong>Registros por Materia</strong>
            <div style={{ marginTop: "8px", display: "grid", gap: "4px" }}>
              {stats.porMateria.slice(0, 6).map((item) => (
                <div key={`mat-${item.label}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{item.label}</span>
                  <strong>{item.cantidad}</strong>
                </div>
              ))}
              {!stats.porMateria.length && <span style={{ opacity: 0.7 }}>Sin datos</span>}
            </div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
            <strong>Registros por Grado</strong>
            <div style={{ marginTop: "8px", display: "grid", gap: "4px" }}>
              {stats.porGrado.slice(0, 6).map((item) => (
                <div key={`gra-${item.label}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{item.label}</span>
                  <strong>{item.cantidad}</strong>
                </div>
              ))}
              {!stats.porGrado.length && <span style={{ opacity: 0.7 }}>Sin datos</span>}
            </div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px" }}>
            <strong>Otros: Tipo de colegio</strong>
            <div style={{ marginTop: "8px", display: "grid", gap: "4px" }}>
              {stats.porTipoColegio.slice(0, 6).map((item) => (
                <div key={`tip-${item.label}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <span>{item.label}</span>
                  <strong>{item.cantidad}</strong>
                </div>
              ))}
              {!stats.porTipoColegio.length && <span style={{ opacity: 0.7 }}>Sin datos</span>}
            </div>
          </div>
        </div>

        {minimized ? (
          <div style={{ marginTop: "12px", padding: "12px", border: "1px dashed #cbd5e1", borderRadius: "12px", color: "#475569" }}>
            Panel minimizado. Presioná “Maximizar” para ver formularios y listado.
          </div>
        ) : null}

        {!minimized && showImport && (
          <form onSubmit={handleImport} className="form" style={{ marginTop: "14px", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "14px" }}>
            <h4>Importar habilidades desde Excel</h4>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivoExcel(e.target.files?.[0] || null)} />
            {renderDisponibilidad()}
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

        {!minimized && showRestoreGrados && (
          <form onSubmit={handleRestoreGrados} className="form" style={{ marginTop: "14px", border: "1px solid #f59e0b", borderRadius: "14px", padding: "14px", background: "#fffbeb", color: "#1e293b" }}>
            <h4 style={{ margin: 0, color: "#92400e" }}>Actualizar habilidades desde Excel</h4>
            <p style={{ margin: 0, color: "#334155" }}>Usá el mismo formato de la descarga. El ID identifica cada habilidad y el sistema actualiza los campos editados, incluyendo materia, tipo, ciclo, grado, mes, descripción, estado y disponibilidad.</p>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivoRespaldoGrados(e.target.files?.[0] || null)} />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={restoringGrados}>{restoringGrados ? "Actualizando..." : "Actualizar grados"}</button>
              <button type="button" style={secondaryButtonStyle} disabled={restoringGrados} onClick={() => { setShowRestoreGrados(false); setArchivoRespaldoGrados(null); }}>Cancelar</button>
            </div>
          </form>
        )}

        {!minimized && showForm && (
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
                <select value={form.tipoColegio} onChange={(e) => updateForm("tipoColegio", e.target.value)}>
                  <option value="Académico">Académico</option>
                  <option value="Técnico">Técnico</option>
                  <option value="Plan Nacional">Plan Nacional</option>
                </select>
              </label>
              <label>
                Ciclo
                <input value={form.ciclo} readOnly placeholder="Se asigna según el grado" />
              </label>
              <label>
                Grado
                <select value={form.grado} onChange={(e) => updateForm("grado", e.target.value)}>
                  <option value="">Seleccionar grado</option>
                  {!gradosValidos.includes(form.grado) && form.grado && <option value={form.grado}>{form.grado}</option>}
                  {gradosValidos.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
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
            {renderDisponibilidad()}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={saving}>{saving ? "Guardando..." : "Guardar habilidad"}</button>
              <button type="button" style={secondaryButtonStyle} onClick={closeForm}>Cancelar</button>
            </div>
          </form>
        )}
      </section>

      {!minimized && (
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
          <button type="button" style={secondaryButtonStyle} onClick={handleDescargarHabilidades}>Descargar resultado</button>
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
                <th>Disponible para</th>
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
                  <td>{item.DisponibleTodos !== false ? "Todos los colegios" : `${item.InstitucionesDisponibles?.length || 0} colegio(s)`}</td>
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
                  <td colSpan={10} style={{ textAlign: "center", padding: "16px" }}>
                    {loading ? "Cargando habilidades..." : "No hay habilidades registradas con esos filtros"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}






