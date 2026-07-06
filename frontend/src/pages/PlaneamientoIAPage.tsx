import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type Materia = {
  MateriaId: number;
  Nombre: string;
  Codigo?: string | null;
  Activo?: boolean;
};

type AnioLectivo = {
  AnioLectivoId: number;
  Nombre: string;
};

type Periodo = {
  PeriodoId: number;
  AnioLectivoId: number;
  Nombre: string;
  NumeroOrden: number;
  AnioNombre?: string | null;
};

type Grupo = {
  GrupoId: number;
  AnioLectivoId: number;
  Nombre: string;
  Nivel?: string | null;
};

type Habilidad = {
  PlaneamientoHabilidadId: number;
  MateriaId?: number | null;
  MateriaNombre?: string | null;
  TipoColegio: string | null;
  Ciclo?: string | null;
  Grado: string | null;
  Mes: string | null;
  Area?: string | null;
  NumeroHabilidad?: string | null;
  DescripcionHabilidad: string;
  DocumentoReferencia?: string | null;
  Activo: boolean;
};

type PlantillaIA = {
  Id: number;
  TipoGeneracionIAId: number;
  TipoGeneracionIANombre?: string | null;
  NombrePlantilla: string;
  Activo: boolean;
};

type ResultadoPlaneamiento = {
  nombre?: string;
  enfoque?: string;
  advertencia?: string;
  semanas?: Array<{
    semana: number;
    habilidadBase?: string;
    proposito?: string;
    mediacionPedagogica?: string[];
    indicadores?: string[];
    trabajoCotidiano?: string[];
    tareas?: string[];
    evaluacionSugerida?: {
      cotidiano?: string;
      tarea?: string;
      prueba?: string;
    };
    recursos?: string[];
  }>;
};

type Catalogos = {
  materias: Materia[];
  anios: AnioLectivo[];
  periodos: Periodo[];
  grupos: Grupo[];
  tiposColegio: string[];
  grados: string[];
  meses: string[];
  areas: string[];
};

const emptyCatalogos: Catalogos = {
  materias: [],
  anios: [],
  periodos: [],
  grupos: [],
  tiposColegio: [],
  grados: [],
  meses: [],
  areas: []
};

const initialHabilidadForm = {
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

const initialGeneratorForm = {
  plantillaPromptIAId: "",
  materiaId: "",
  materiaNombre: "",
  tipoColegio: "",
  grado: "",
  mes: "",
  tema: "",
  semanas: "4"
};

const initialSaveForm = {
  anioLectivoId: "",
  periodoId: "",
  grupoId: "",
  materiaId: "",
  nombre: "",
  fechaInicio: "",
  fechaFin: "",
  observaciones: ""
};

const inputStyle: React.CSSProperties = {
  width: "100%"
};

function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || fallback;
}

function asArray(value?: string[]) {
  return Array.isArray(value) ? value : [];
}

export default function PlaneamientoIAPage() {
  const [catalogos, setCatalogos] = useState<Catalogos>(emptyCatalogos);
  const [habilidades, setHabilidades] = useState<Habilidad[]>([]);
  const [plantillasIA, setPlantillasIA] = useState<PlantillaIA[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [habilidadForm, setHabilidadForm] = useState(initialHabilidadForm);
  const [generatorForm, setGeneratorForm] = useState(initialGeneratorForm);
  const [saveForm, setSaveForm] = useState(initialSaveForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [resultado, setResultado] = useState<ResultadoPlaneamiento | null>(null);
  const [generatedWithAI, setGeneratedWithAI] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);
  const [loadingHabilidades, setLoadingHabilidades] = useState(false);
  const [loadingPlantillasIA, setLoadingPlantillasIA] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [showHabilidadForm, setShowHabilidadForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGenerator, setShowGenerator] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [archivoExcel, setArchivoExcel] = useState<File | null>(null);

  const [filters, setFilters] = useState({
    materiaId: "",
    tipoColegio: "",
    grado: "",
    mes: "",
    area: "",
    q: "",
    incluirInactivas: false
  });

  const periodosFiltrados = useMemo(() => {
    if (!saveForm.anioLectivoId) return catalogos.periodos;
    return catalogos.periodos.filter((p) => String(p.AnioLectivoId) === String(saveForm.anioLectivoId));
  }, [catalogos.periodos, saveForm.anioLectivoId]);

  const gruposFiltrados = useMemo(() => {
    if (!saveForm.anioLectivoId) return catalogos.grupos;
    return catalogos.grupos.filter((g) => String(g.AnioLectivoId) === String(saveForm.anioLectivoId));
  }, [catalogos.grupos, saveForm.anioLectivoId]);

  useEffect(() => {
    loadCatalogos();
    loadPlantillasIA();
  }, []);

  useEffect(() => {
    loadHabilidades();
  }, []);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  async function loadCatalogos() {
    setLoadingCatalogos(true);
    clearMessages();
    try {
      const response = await api.get("/planeamiento-ia/catalogos");
      setCatalogos(response.data?.data || emptyCatalogos);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los catálogos"));
    } finally {
      setLoadingCatalogos(false);
    }
  }

  async function loadPlantillasIA() {
    setLoadingPlantillasIA(true);
    try {
      const response = await api.get("/ia/plantillas", {
        params: {
          tipoGeneracionIAId: 1
        }
      });
      setPlantillasIA(response.data?.data || []);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar las plantillas IA"));
    } finally {
      setLoadingPlantillasIA(false);
    }
  }

  async function loadHabilidades(customFilters = filters) {
    setLoadingHabilidades(true);
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
      setHabilidades(response.data?.data || []);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar las habilidades"));
    } finally {
      setLoadingHabilidades(false);
    }
  }

  function resetHabilidadForm() {
    setHabilidadForm(initialHabilidadForm);
    setEditingId(null);
    setShowHabilidadForm(false);
  }

  function handleEditHabilidad(item: Habilidad) {
    clearMessages();
    setEditingId(item.PlaneamientoHabilidadId);
    setHabilidadForm({
      materiaId: item.MateriaId ? String(item.MateriaId) : "",
      materiaNombre: item.MateriaNombre || "",
      tipoColegio: item.TipoColegio || "",
      ciclo: item.Ciclo || "",
      grado: item.Grado || "",
      mes: item.Mes || "",
      area: item.Area || "",
      numeroHabilidad: item.NumeroHabilidad || "",
      descripcionHabilidad: item.DescripcionHabilidad || "",
      documentoReferencia: item.DocumentoReferencia || ""
    });
    setShowHabilidadForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmitHabilidad(e: FormEvent) {
    e.preventDefault();
    setLoadingSave(true);
    clearMessages();

    try {
      const payload = {
        ...habilidadForm,
        materiaId: habilidadForm.materiaId || null
      };

      if (editingId !== null) {
        await api.put(`/planeamiento-ia/habilidades/${editingId}`, payload);
        setMessage("Habilidad actualizada correctamente");
      } else {
        await api.post("/planeamiento-ia/habilidades", payload);
        setMessage("Habilidad creada correctamente");
      }

      resetHabilidadForm();
      await Promise.all([loadCatalogos(), loadHabilidades()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar la habilidad"));
    } finally {
      setLoadingSave(false);
    }
  }

  async function handleDeleteHabilidad(id: number) {
    if (!window.confirm("¿Deseás desactivar esta habilidad?")) return;
    clearMessages();
    try {
      await api.delete(`/planeamiento-ia/habilidades/${id}`);
      setMessage("Habilidad desactivada correctamente");
      if (editingId === id) resetHabilidadForm();
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo desactivar la habilidad"));
    }
  }

  async function handleReactivateHabilidad(id: number) {
    clearMessages();
    try {
      await api.patch(`/planeamiento-ia/habilidades/${id}/reactivar`);
      setMessage("Habilidad reactivada correctamente");
      await loadHabilidades();
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo reactivar la habilidad"));
    }
  }

  async function handleImportExcel(e: FormEvent) {
    e.preventDefault();
    if (!archivoExcel) {
      setErrorMessage("Debés seleccionar un archivo Excel");
      return;
    }

    setLoadingImport(true);
    clearMessages();
    try {
      const formData = new FormData();
      formData.append("archivo", archivoExcel);
      const response = await api.post("/planeamiento-ia/habilidades/importar-excel", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const data = response.data?.data || {};
      setMessage(`Importación lista. Leídos: ${data.totalLeidos || 0}. Procesados: ${data.procesados || 0}. Omitidos: ${data.omitidos || 0}.`);
      setArchivoExcel(null);
      setShowImport(false);
      await Promise.all([loadCatalogos(), loadHabilidades()]);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo importar el Excel"));
    } finally {
      setLoadingImport(false);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function seleccionarTodasVisibles() {
    setSelectedIds(habilidades.filter((h) => h.Activo).map((h) => h.PlaneamientoHabilidadId));
  }

  function limpiarSeleccion() {
    setSelectedIds([]);
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!selectedIds.length) {
      setErrorMessage("Seleccioná al menos una habilidad");
      return;
    }

    setLoadingGenerate(true);
    clearMessages();
    try {
      const materia = catalogos.materias.find((m) => String(m.MateriaId) === String(generatorForm.materiaId));
      const response = await api.post("/planeamiento-ia/generar-planeamiento", {
        ...generatorForm,
        plantillaPromptIAId: generatorForm.plantillaPromptIAId ? Number(generatorForm.plantillaPromptIAId) : null,
        materiaNombre: generatorForm.materiaNombre || materia?.Nombre || "",
        habilidadesIds: selectedIds
      });

      const data = response.data?.data || {};
      const generated = data.resultado || null;
      setResultado(generated);
      setGeneratedWithAI(!!data.generadoConIA);
      setSaveForm((prev) => ({
        ...prev,
        materiaId: generatorForm.materiaId || prev.materiaId,
        nombre: generated?.nombre || prev.nombre,
        observaciones: generated?.advertencia || prev.observaciones
      }));
      setShowSave(true);
      setMessage(data.generadoConIA ? "Planeamiento generado con IA" : "Planeamiento generado en modo local. Configurá OPENAI_API_KEY para usar IA real.");
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo generar el planeamiento"));
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handleSavePlaneamiento(e: FormEvent) {
    e.preventDefault();
    if (!resultado) return;

    setLoadingSave(true);
    clearMessages();
    try {
      await api.post("/planeamiento-ia/guardar-planeamiento", {
        ...saveForm,
        resultado
      });
      setMessage("Planeamiento guardado correctamente en Gestión del Profe");
      setShowSave(false);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error, "No se pudo guardar el planeamiento"));
    } finally {
      setLoadingSave(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>IA para planeamientos</h2>
        <p>
          Seleccioná tipo de colegio, materia, grado, mes y habilidades. El sistema usa esas habilidades como base para generar un borrador de planeamiento, indicadores, trabajo cotidiano, tareas y evaluación sugerida.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="primary-btn" onClick={() => setShowGenerator((prev) => !prev)}>
            {showGenerator ? "Ocultar generador" : "Generar planeamiento"}
          </button>
          <button type="button" className="primary-btn" onClick={() => { clearMessages(); setShowHabilidadForm(true); }}>
            Agregar habilidad
          </button>
          <button type="button" className="primary-btn" onClick={() => setShowImport((prev) => !prev)}>
            Importar Excel
          </button>
          <button type="button" onClick={() => { loadCatalogos(); loadHabilidades(); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
            Actualizar
          </button>
        </div>
      </section>

      {message && <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>{message}</div>}
      {errorMessage && <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>{errorMessage}</div>}

      {showImport && (
        <section className="card">
          <h3>Importar habilidades desde Excel</h3>
          <p>El Excel debe tener columnas como: Materia, Colegio, Ciclo, Grado, mes, Área, Número de Habilidad, Descripción de la Habilidad y Documento de referencia.</p>
          <form className="form" onSubmit={handleImportExcel}>
            <label>
              Archivo Excel
              <input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivoExcel(e.target.files?.[0] || null)} />
            </label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={loadingImport}>{loadingImport ? "Importando..." : "Importar"}</button>
              <button type="button" onClick={() => { setArchivoExcel(null); setShowImport(false); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {showHabilidadForm && (
        <section className="card">
          <h3>{editingId !== null ? "Editar habilidad" : "Crear habilidad"}</h3>
          <form className="form" onSubmit={handleSubmitHabilidad}>
            <label>
              Materia
              <select value={habilidadForm.materiaId} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, materiaId: e.target.value, materiaNombre: "" }))}>
                <option value="">Seleccione o escriba una materia</option>
                {catalogos.materias.map((m) => <option key={m.MateriaId} value={m.MateriaId}>{m.Nombre}</option>)}
              </select>
            </label>
            {!habilidadForm.materiaId && (
              <label>
                Materia escrita
                <input value={habilidadForm.materiaNombre} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, materiaNombre: e.target.value }))} placeholder="Ejemplo: Matemática" />
              </label>
            )}
            <label>
              Tipo de colegio
              <input value={habilidadForm.tipoColegio} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, tipoColegio: e.target.value }))} placeholder="Académico, Técnico, Nocturno..." required />
            </label>
            <label>
              Ciclo
              <input value={habilidadForm.ciclo} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, ciclo: e.target.value }))} placeholder="Tercer ciclo, Diversificado..." />
            </label>
            <label>
              Grado
              <input value={habilidadForm.grado} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, grado: e.target.value }))} placeholder="Sétimo, Octavo..." required />
            </label>
            <label>
              Mes
              <input value={habilidadForm.mes} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, mes: e.target.value }))} placeholder="Febrero, Marzo..." required />
            </label>
            <label>
              Área
              <input value={habilidadForm.area} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, area: e.target.value }))} placeholder="Números, Geometría..." />
            </label>
            <label>
              Número de habilidad
              <input value={habilidadForm.numeroHabilidad} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, numeroHabilidad: e.target.value }))} />
            </label>
            <label>
              Descripción de la habilidad
              <textarea rows={4} value={habilidadForm.descripcionHabilidad} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, descripcionHabilidad: e.target.value }))} required />
            </label>
            <label>
              Documento de referencia
              <input value={habilidadForm.documentoReferencia} onChange={(e) => setHabilidadForm((prev) => ({ ...prev, documentoReferencia: e.target.value }))} />
            </label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={loadingSave}>{loadingSave ? "Guardando..." : editingId !== null ? "Actualizar" : "Guardar"}</button>
              <button type="button" onClick={resetHabilidadForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
            </div>
          </form>
        </section>
      )}

      {showGenerator && (
        <section className="card">
          <h3>Generar planeamiento con IA</h3>
          <form className="form" onSubmit={handleGenerate}>
            <label>
              Plantilla IA
              <select
                value={generatorForm.plantillaPromptIAId}
                onChange={(e) => setGeneratorForm((prev) => ({ ...prev, plantillaPromptIAId: e.target.value }))}
              >
                <option value="">Usar plantilla activa más reciente</option>
                {plantillasIA.map((p) => (
                  <option key={p.Id} value={p.Id}>{p.NombrePlantilla}</option>
                ))}
              </select>
              {loadingPlantillasIA && <small>Cargando plantillas...</small>}
            </label>
            <label>
              Materia
              <select value={generatorForm.materiaId} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, materiaId: e.target.value }))}>
                <option value="">Seleccione</option>
                {catalogos.materias.map((m) => <option key={m.MateriaId} value={m.MateriaId}>{m.Nombre}</option>)}
              </select>
            </label>
            <label>
              Tipo de colegio
              <input list="tiposColegio" value={generatorForm.tipoColegio} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, tipoColegio: e.target.value }))} />
              <datalist id="tiposColegio">{asArray(catalogos.tiposColegio).map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <label>
              Grado
              <input list="grados" value={generatorForm.grado} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, grado: e.target.value }))} />
              <datalist id="grados">{asArray(catalogos.grados).map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <label>
              Mes
              <input list="meses" value={generatorForm.mes} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, mes: e.target.value }))} />
              <datalist id="meses">{asArray(catalogos.meses).map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <label>
              Tema o énfasis del mes
              <input value={generatorForm.tema} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, tema: e.target.value }))} placeholder="Opcional" />
            </label>
            <label>
              Cantidad de semanas
              <input type="number" min={1} max={8} value={generatorForm.semanas} onChange={(e) => setGeneratorForm((prev) => ({ ...prev, semanas: e.target.value }))} />
            </label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={loadingGenerate}>{loadingGenerate ? "Generando..." : "Generar con IA"}</button>
              <button type="button" onClick={seleccionarTodasVisibles} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Seleccionar visibles</button>
              <button type="button" onClick={limpiarSeleccion} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Limpiar selección</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h3>Banco de habilidades</h3>
        <form className="form" onSubmit={(e) => { e.preventDefault(); loadHabilidades(); }}>
          <label>
            Materia
            <select value={filters.materiaId} onChange={(e) => setFilters((prev) => ({ ...prev, materiaId: e.target.value }))}>
              <option value="">Todas</option>
              {catalogos.materias.map((m) => <option key={m.MateriaId} value={m.MateriaId}>{m.Nombre}</option>)}
            </select>
          </label>
          <label>
            Tipo de colegio
            <input list="filterTiposColegio" value={filters.tipoColegio} onChange={(e) => setFilters((prev) => ({ ...prev, tipoColegio: e.target.value }))} />
            <datalist id="filterTiposColegio">{asArray(catalogos.tiposColegio).map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label>
            Grado
            <input list="filterGrados" value={filters.grado} onChange={(e) => setFilters((prev) => ({ ...prev, grado: e.target.value }))} />
            <datalist id="filterGrados">{asArray(catalogos.grados).map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label>
            Mes
            <input list="filterMeses" value={filters.mes} onChange={(e) => setFilters((prev) => ({ ...prev, mes: e.target.value }))} />
            <datalist id="filterMeses">{asArray(catalogos.meses).map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label>
            Área
            <input list="filterAreas" value={filters.area} onChange={(e) => setFilters((prev) => ({ ...prev, area: e.target.value }))} />
            <datalist id="filterAreas">{asArray(catalogos.areas).map((x) => <option key={x} value={x} />)}</datalist>
          </label>
          <label>
            Buscar
            <input value={filters.q} onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))} placeholder="habilidad, Área, número..." />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" checked={filters.incluirInactivas} onChange={(e) => setFilters((prev) => ({ ...prev, incluirInactivas: e.target.checked }))} />
            Incluir inactivas
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" disabled={loadingHabilidades}>{loadingHabilidades ? "Buscando..." : "Buscar"}</button>
            <button type="button" onClick={() => { const clean = { materiaId: "", tipoColegio: "", grado: "", mes: "", area: "", q: "", incluirInactivas: false }; setFilters(clean); loadHabilidades(clean); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Limpiar</button>
          </div>
        </form>

        <div style={{ overflowX: "auto", marginTop: "14px" }}>
          <table>
            <thead>
              <tr>
                <th>Usar</th>
                <th>Materia</th>
                <th>Tipo</th>
                <th>Grado</th>
                <th>Mes</th>
                <th>Área</th>
                <th>#</th>
                <th>Habilidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {habilidades.map((h) => (
                <tr key={h.PlaneamientoHabilidadId}>
                  <td><input type="checkbox" checked={selectedIds.includes(h.PlaneamientoHabilidadId)} disabled={!h.Activo} onChange={() => toggleSelected(h.PlaneamientoHabilidadId)} /></td>
                  <td>{h.MateriaNombre || "-"}</td>
                  <td>{h.TipoColegio || "-"}</td>
                  <td>{h.Grado || "-"}</td>
                  <td>{h.Mes || "-"}</td>
                  <td>{h.Area || "-"}</td>
                  <td>{h.NumeroHabilidad || "-"}</td>
                  <td style={{ minWidth: "320px" }}>{h.DescripcionHabilidad}</td>
                  <td>{h.Activo ? "Activo" : "Inactivo"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => handleEditHabilidad(h)} style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "6px 10px", background: "#fff", cursor: "pointer" }}>Editar</button>
                      {h.Activo ? (
                        <button type="button" onClick={() => handleDeleteHabilidad(h.PlaneamientoHabilidadId)} style={{ border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", padding: "6px 10px", background: "#fff", cursor: "pointer" }}>Desactivar</button>
                      ) : (
                        <button type="button" onClick={() => handleReactivateHabilidad(h.PlaneamientoHabilidadId)} style={{ border: "1px solid #bbf7d0", color: "#166534", borderRadius: "8px", padding: "6px 10px", background: "#fff", cursor: "pointer" }}>Reactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!habilidades.length && (
                <tr><td colSpan={10}>{loadingCatalogos || loadingHabilidades ? "Cargando..." : "No hay habilidades con esos filtros"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {resultado && (
        <section className="card">
          <h3>{resultado.nombre || "Planeamiento generado"}</h3>
          <p><strong>Origen:</strong> {generatedWithAI ? "Generado con IA" : "Generado en modo local"}</p>
          {resultado.enfoque && <p><strong>Enfoque:</strong> {resultado.enfoque}</p>}
          {resultado.advertencia && <p style={{ color: "#92400e" }}><strong>Revisión docente:</strong> {resultado.advertencia}</p>}

          {(resultado.semanas || []).map((semana) => (
            <div key={semana.semana} style={{ border: "1px solid #d1d5db", borderRadius: "12px", padding: "14px", marginTop: "12px" }}>
              <h4>Semana {semana.semana}</h4>
              {semana.habilidadBase && <p><strong>Habilidad base:</strong> {semana.habilidadBase}</p>}
              {semana.proposito && <p><strong>Propésito:</strong> {semana.proposito}</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                <div><strong>Mediación pedagógica</strong><ul>{(semana.mediacionPedagogica || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><strong>Indicadores</strong><ul>{(semana.indicadores || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><strong>Trabajo cotidiano</strong><ul>{(semana.trabajoCotidiano || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><strong>Tareas</strong><ul>{(semana.tareas || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><strong>Evaluación sugerida</strong><ul><li>Cotidiano: {semana.evaluacionSugerida?.cotidiano || "-"}</li><li>Tarea: {semana.evaluacionSugerida?.tarea || "-"}</li><li>Prueba: {semana.evaluacionSugerida?.prueba || "-"}</li></ul></div>
                <div><strong>Recursos</strong><ul>{(semana.recursos || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
            <button type="button" className="primary-btn" onClick={() => setShowSave((prev) => !prev)}>{showSave ? "Ocultar guardado" : "Guardar como planeamiento"}</button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(resultado, null, 2))} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Copiar JSON</button>
          </div>
        </section>
      )}

      {resultado && showSave && (
        <section className="card">
          <h3>Guardar en planeamientos</h3>
          <form className="form" onSubmit={handleSavePlaneamiento}>
            <label>
              Año lectivo
              <select value={saveForm.anioLectivoId} onChange={(e) => setSaveForm((prev) => ({ ...prev, anioLectivoId: e.target.value, periodoId: "", grupoId: "" }))} required>
                <option value="">Seleccione</option>
                {catalogos.anios.map((a) => <option key={a.AnioLectivoId} value={a.AnioLectivoId}>{a.Nombre}</option>)}
              </select>
            </label>
            <label>
              Periodo
              <select value={saveForm.periodoId} onChange={(e) => setSaveForm((prev) => ({ ...prev, periodoId: e.target.value }))} required>
                <option value="">Seleccione</option>
                {periodosFiltrados.map((p) => <option key={p.PeriodoId} value={p.PeriodoId}>{p.AnioNombre ? `${p.AnioNombre} - ` : ""}{p.Nombre}</option>)}
              </select>
            </label>
            <label>
              Grupo
              <select value={saveForm.grupoId} onChange={(e) => setSaveForm((prev) => ({ ...prev, grupoId: e.target.value }))} required>
                <option value="">Seleccione</option>
                {gruposFiltrados.map((g) => <option key={g.GrupoId} value={g.GrupoId}>{g.Nombre}{g.Nivel ? ` - ${g.Nivel}` : ""}</option>)}
              </select>
            </label>
            <label>
              Materia
              <select value={saveForm.materiaId} onChange={(e) => setSaveForm((prev) => ({ ...prev, materiaId: e.target.value }))} required>
                <option value="">Seleccione</option>
                {catalogos.materias.map((m) => <option key={m.MateriaId} value={m.MateriaId}>{m.Nombre}</option>)}
              </select>
            </label>
            <label>
              Nombre del planeamiento
              <input style={inputStyle} value={saveForm.nombre} onChange={(e) => setSaveForm((prev) => ({ ...prev, nombre: e.target.value }))} required />
            </label>
            <label>
              Fecha inicio
              <input type="date" value={saveForm.fechaInicio} onChange={(e) => setSaveForm((prev) => ({ ...prev, fechaInicio: e.target.value }))} />
            </label>
            <label>
              Fecha fin
              <input type="date" value={saveForm.fechaFin} onChange={(e) => setSaveForm((prev) => ({ ...prev, fechaFin: e.target.value }))} />
            </label>
            <label>
              Observaciones
              <textarea rows={3} value={saveForm.observaciones} onChange={(e) => setSaveForm((prev) => ({ ...prev, observaciones: e.target.value }))} />
            </label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary-btn" disabled={loadingSave}>{loadingSave ? "Guardando..." : "Guardar planeamiento"}</button>
              <button type="button" onClick={() => setShowSave(false)} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>Cancelar</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}




