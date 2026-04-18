import { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type AnioLectivo = {
  AnioLectivoId: number;
  Nombre: string;
  FechaInicio: string | null;
  FechaFin: string | null;
  Activo: boolean;
};

type Periodo = {
  PeriodoId: number;
  AnioLectivoId: number;
  Nombre: string;
  NumeroOrden: number;
  FechaInicio: string | null;
  FechaFin: string | null;
  Activo: boolean;
  AnioNombre?: string | null;
};

type EstudianteCatalogo = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  Activo: boolean;
};

type Grupo = {
  GrupoId: number;
  AnioLectivoId: number;
  Nombre: string;
  Nivel: string | null;
  Jornada: string | null;
  NivelAcademico?: number | null;
  Especialidad?: string | null;
  Activo: boolean;
  AnioNombre?: string | null;
};

type Matricula = {
  MatriculaId: number;
  EstudianteId: number;
  GrupoId: number;
  AnioLectivoId: number;
  Estado: string;
  FechaMatricula: string | null;
  Observacion: string | null;
  Identificacion: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  GrupoNombre: string | null;
  GrupoNivel: string | null;
  AnioNombre: string | null;
  MatriculaDetalleId?: number | null;
  TipoMatricula?: string | null;
  NivelAcademico?: number | null;
  Especialidad?: string | null;
  SeccionTexto?: string | null;
  RutaTransporte?: string | null;
  EsRepitente?: boolean;
  PermiteExcepcionProgresion?: boolean;
  JustificacionExcepcion?: string | null;
  CorreoEnvioBoleta?: string | null;
  ObservacionesDetalle?: string | null;
  GrupoNivelAcademico?: number | null;
  GrupoEspecialidad?: string | null;
};

type Materia = {
  MateriaId: number;
  InstitucionId?: number;
  Codigo: string | null;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
};

type DocenteCatalogo = {
  UsuarioId: number;
  Correo: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  Roles?: string | null;
};

type AsignacionDocente = {
  AsignacionDocenteId: number;
  InstitucionId: number;
  UsuarioId: number;
  GrupoId: number;
  MateriaId: number | null;
  AnioLectivoId: number;
  PeriodoId: number | null;
  TipoAsignacion: string;
  Activo: boolean;
  Correo: string;
  Nombre: string;
  PrimerApellido: string | null;
  SegundoApellido: string | null;
  GrupoNombre: string | null;
  GrupoNivel: string | null;
  MateriaNombre: string | null;
  AnioNombre: string | null;
  PeriodoNombre: string | null;
};

type BloqueHorario = {
  BloqueHorarioId: number;
  InstitucionId: number;
  Nombre: string;
  HoraInicio: string;
  HoraFin: string;
  OrdenVisual: number;
};

type GrupoMateria = {
  GrupoMateriaId: number;
  GrupoId: number;
  MateriaId: number;
  PeriodoId: number | null;
  Activo: boolean;
  GrupoNombre: string | null;
  GrupoNivel: string | null;
  MateriaNombre: string | null;
  MateriaCodigo: string | null;
  PeriodoNombre: string | null;
};

type HorarioGrupo = {
  HorarioGrupoId: number;
  GrupoMateriaId: number;
  BloqueHorarioId: number;
  DiaSemana: number;
  Activo: boolean;
  GrupoId: number;
  GrupoNombre: string | null;
  GrupoNivel: string | null;
  MateriaId: number;
  MateriaNombre: string | null;
  PeriodoId: number | null;
  PeriodoNombre: string | null;
  BloqueNombre: string | null;
  HoraInicio: string | null;
  HoraFin: string | null;
};

type Feriado = {
  FeriadoId: number;
  InstitucionId: number;
  Fecha: string;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
};

type DiaLectivoConfig = {
  DiaLectivoId: number | null;
  InstitucionId: number;
  DiaSemana: number;
  Nombre: string;
  Activo: boolean;
};

type FechaClase = {
  FechaClaseId: number;
  HorarioGrupoId: number;
  Fecha: string;
  PeriodoId: number;
  EsExtraordinaria: boolean;
  Observacion: string | null;
  GrupoNombre: string | null;
  GrupoNivel: string | null;
  MateriaNombre: string | null;
  PeriodoNombre: string | null;
  BloqueNombre: string | null;
  HoraInicio: string | null;
  HoraFin: string | null;
  DiaSemana: number | null;
};

const initialAnioForm = {
  nombre: "",
  fechaInicio: "",
  fechaFin: ""
};

const initialPeriodoForm = {
  anioLectivoId: "",
  nombre: "",
  numeroOrden: "",
  fechaInicio: "",
  fechaFin: ""
};

const initialGrupoForm = {
  anioLectivoId: "",
  nombre: "",
  nivel: "",
  jornada: ""
};

const initialMatriculaForm = {
  estudianteId: "",
  grupoId: "",
  anioLectivoId: "",
  fechaMatricula: "",
  observacion: "",
  tipoMatricula: "",
  nivelAcademico: "",
  especialidad: "",
  seccionTexto: "",
  rutaTransporte: "",
  esRepitente: false,
  permiteExcepcionProgresion: false,
  justificacionExcepcion: "",
  correoEnvioBoleta: "",
  observacionesDetalle: ""
};

const initialMateriaForm = {
  codigo: "",
  nombre: "",
  descripcion: ""
};

const initialAsignacionForm = {
  usuarioId: "",
  grupoId: "",
  materiaId: "",
  anioLectivoId: "",
  periodoId: "",
  tipoAsignacion: "PROFESOR_MATERIA"
};

const initialBloqueForm = {
  nombre: "",
  horaInicio: "",
  horaFin: "",
  ordenVisual: ""
};

const initialGrupoMateriaForm = {
  grupoId: "",
  materiaId: "",
  periodoId: ""
};

const initialHorarioForm = {
  grupoMateriaId: "",
  bloqueHorarioId: "",
  diaSemana: ""
};

const initialFechaClaseForm = {
  horarioGrupoId: "",
  fecha: "",
  periodoId: "",
  esExtraordinaria: false,
  observacion: "",
  grupoMateriaId: "",
  bloqueHorarioIdInicial: "",
  diaSemana: "",
  cantidadLeccionesPorDia: "1",
  fechaDesde: "",
  bloqueHorarioIdInicialNuevo: "",
  diaSemanaNuevo: "",
  cantidadLeccionesPorDiaNueva: "1"
};

function formatDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatTime(value?: string | null) {
  if (!value) return "";

  if (value.includes("T")) {
    const timePart = value.split("T")[1] || "";
    return timePart.slice(0, 5);
  }

  if (value.includes(":")) {
    return value.slice(0, 5);
  }

  return value;
}

function getStudentFullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.Nombre, item.PrimerApellido || "", item.SegundoApellido || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTeacherFullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.Nombre, item.PrimerApellido || "", item.SegundoApellido || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function diaSemanaLabel(value?: number | null) {
  switch (Number(value)) {
    case 1: return "Domingo";
    case 2: return "Lunes";
    case 3: return "Martes";
    case 4: return "Miércoles";
    case 5: return "Jueves";
    case 6: return "Viernes";
    case 7: return "Sábado";
    default: return "";
  }
}

type TabKey =
  | "anios"
  | "periodos"
  | "grupos"
  | "matriculas"
  | "materias"
  | "asignaciones"
  | "bloques"
  | "gruposMateria"
  | "horarios"
  | "fechasClase"
  | "feriados"
  | "diasLectivos"
  | "configuracionCorreo";

export default function AcademicoPage() {
  const [tab, setTab] = useState<TabKey>("anios");

  const [anios, setAnios] = useState<AnioLectivo[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteCatalogo[]>([]);
  const [gruposCatalogo, setGruposCatalogo] = useState<Grupo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [materiasCatalogo, setMateriasCatalogo] = useState<Materia[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [docentesCatalogo, setDocentesCatalogo] = useState<DocenteCatalogo[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionDocente[]>([]);
  const [bloquesCatalogo, setBloquesCatalogo] = useState<BloqueHorario[]>([]);
  const [bloques, setBloques] = useState<BloqueHorario[]>([]);
  const [gruposMateria, setGruposMateria] = useState<GrupoMateria[]>([]);
  const [horarios, setHorarios] = useState<HorarioGrupo[]>([]);
  const [fechasClase, setFechasClase] = useState<FechaClase[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [diasLectivos, setDiasLectivos] = useState<DiaLectivoConfig[]>([]);

  const [anioForm, setAnioForm] = useState(initialAnioForm);
  const [periodoForm, setPeriodoForm] = useState(initialPeriodoForm);
  const [grupoForm, setGrupoForm] = useState(initialGrupoForm);
  const [matriculaForm, setMatriculaForm] = useState(initialMatriculaForm);
  const [materiaForm, setMateriaForm] = useState(initialMateriaForm);
  const [asignacionForm, setAsignacionForm] = useState(initialAsignacionForm);
  const [bloqueForm, setBloqueForm] = useState(initialBloqueForm);
  const [grupoMateriaForm, setGrupoMateriaForm] = useState(initialGrupoMateriaForm);
  const [horarioForm, setHorarioForm] = useState(initialHorarioForm);
  const [fechaClaseForm, setFechaClaseForm] = useState(initialFechaClaseForm);
  const [feriadoForm, setFeriadoForm] = useState({ fecha: "", nombre: "", descripcion: "" });

  const [editingAnioId, setEditingAnioId] = useState<number | null>(null);
  const [editingPeriodoId, setEditingPeriodoId] = useState<number | null>(null);
  const [editingGrupoId, setEditingGrupoId] = useState<number | null>(null);
  const [editingMatriculaId, setEditingMatriculaId] = useState<number | null>(null);
  const [editingMateriaId, setEditingMateriaId] = useState<number | null>(null);
  const [editingAsignacionId, setEditingAsignacionId] = useState<number | null>(null);
  const [editingBloqueId, setEditingBloqueId] = useState<number | null>(null);
  const [editingGrupoMateriaId, setEditingGrupoMateriaId] = useState<number | null>(null);
  const [editingHorarioId, setEditingHorarioId] = useState<number | null>(null);
  const [editingFechaClaseId, setEditingFechaClaseId] = useState<number | null>(null);
  const [editingFeriadoId, setEditingFeriadoId] = useState<number | null>(null);

  const [reactivableMatriculaId, setReactivableMatriculaId] = useState<number | null>(null);

  const [anioSearch, setAnioSearch] = useState("");
  const [periodoSearch, setPeriodoSearch] = useState("");
  const [grupoSearch, setGrupoSearch] = useState("");
  const [matriculaSearch, setMatriculaSearch] = useState("");
  const [materiaSearch, setMateriaSearch] = useState("");
  const [asignacionSearch, setAsignacionSearch] = useState("");
  const [bloqueSearch, setBloqueSearch] = useState("");
  const [grupoMateriaSearch, setGrupoMateriaSearch] = useState("");
  const [horarioSearch, setHorarioSearch] = useState("");
  const [fechaClaseSearch, setFechaClaseSearch] = useState("");
  const [feriadoSearch, setFeriadoSearch] = useState("");

  const [incluirAniosInactivos, setIncluirAniosInactivos] = useState(false);
  const [incluirPeriodosInactivos, setIncluirPeriodosInactivos] = useState(false);
  const [incluirGruposInactivos, setIncluirGruposInactivos] = useState(false);
  const [incluirMatriculasInactivas, setIncluirMatriculasInactivas] = useState(false);
  const [incluirMateriasInactivas, setIncluirMateriasInactivas] = useState(false);
  const [incluirAsignacionesInactivas, setIncluirAsignacionesInactivas] = useState(false);
  const [incluirGrupoMateriaInactivas, setIncluirGrupoMateriaInactivas] = useState(false);
  const [incluirHorariosInactivos, setIncluirHorariosInactivos] = useState(false);
  const [incluirFeriadosInactivos, setIncluirFeriadosInactivos] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [loadingAnio, setLoadingAnio] = useState(false);
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);
  const [loadingGrupo, setLoadingGrupo] = useState(false);
  const [loadingMatricula, setLoadingMatricula] = useState(false);
  const [loadingMateria, setLoadingMateria] = useState(false);
  const [loadingAsignacion, setLoadingAsignacion] = useState(false);
  const [loadingBloque, setLoadingBloque] = useState(false);
  const [loadingGrupoMateria, setLoadingGrupoMateria] = useState(false);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [loadingFechaClase, setLoadingFechaClase] = useState(false);
  const [loadingFeriado, setLoadingFeriado] = useState(false);
  const [loadingDiasLectivos, setLoadingDiasLectivos] = useState(false);
  const [correoEstudianteDominio, setCorreoEstudianteDominio] = useState("@est.mep.go.cr");
  const [loadingConfigCorreo, setLoadingConfigCorreo] = useState(false);

  const gruposActivos = useMemo(
    () => gruposCatalogo.filter((g) => g.Activo),
    [gruposCatalogo]
  );

  const aniosActivos = useMemo(
    () => anios.filter((a) => a.Activo),
    [anios]
  );

  const materiasActivas = useMemo(
    () => materiasCatalogo.filter((m) => m.Activo),
    [materiasCatalogo]
  );

  const gruposMateriaActivas = useMemo(
    () => gruposMateria.filter((gm) => gm.Activo),
    [gruposMateria]
  );

  async function loadCatalogos() {
    const response = await api.get("/academico/catalogos");
    const data = response.data?.data || {};

    setAnios(data.aniosLectivos || []);
    setEstudiantes(data.estudiantes || []);
    setGruposCatalogo(data.grupos || []);
    setPeriodos(data.periodos || []);
    setMateriasCatalogo(data.materias || []);
    setDocentesCatalogo(data.docentes || []);
    setBloquesCatalogo(data.bloquesHorarios || []);
    setFeriados(data.feriados || []);
    setDiasLectivos(data.diasLectivos || []);
    setCorreoEstudianteDominio(String(data.configuracionCorreoEstudiante?.dominio || "@est.mep.go.cr"));
  }

  async function loadAnios(query = "", incluirInactivos = incluirAniosInactivos) {
    const response = await api.get("/academico/anios-lectivos", {
      params: { q: query, incluirInactivos }
    });
    setAnios(response.data?.data || []);
  }

  async function loadPeriodos(query = "", incluirInactivos = incluirPeriodosInactivos) {
    const response = await api.get("/academico/periodos", {
      params: { q: query, incluirInactivos }
    });
    setPeriodos(response.data?.data || []);
  }

  async function loadGrupos(query = "", incluirInactivos = incluirGruposInactivos) {
    const response = await api.get("/academico/grupos", {
      params: { q: query, incluirInactivos }
    });
    setGrupos(response.data?.data || []);
  }

  async function loadMatriculas(query = "", incluirInactivas = incluirMatriculasInactivas) {
    const response = await api.get("/academico/matriculas", {
      params: { q: query, incluirInactivas }
    });
    setMatriculas(response.data?.data || []);
  }

  async function loadMaterias(query = "", incluirInactivas = incluirMateriasInactivas) {
    const response = await api.get("/academico/materias", {
      params: { q: query, incluirInactivas }
    });
    setMaterias(response.data?.data || []);
  }

  async function loadAsignaciones(query = "", incluirInactivos = incluirAsignacionesInactivas) {
    const response = await api.get("/academico/asignaciones-docentes", {
      params: { q: query, incluirInactivos }
    });
    setAsignaciones(response.data?.data || []);
  }

  async function loadBloques(query = "") {
    const response = await api.get("/academico/bloques-horarios", {
      params: { q: query }
    });
    setBloques(response.data?.data || []);
  }

  async function loadGruposMateria(query = "", incluirInactivos = incluirGrupoMateriaInactivas) {
    const response = await api.get("/academico/grupos-materia", {
      params: { q: query, incluirInactivos }
    });
    setGruposMateria(response.data?.data || []);
  }

  async function loadHorarios(query = "", incluirInactivos = incluirHorariosInactivos) {
    const response = await api.get("/academico/horarios-grupo", {
      params: { q: query, incluirInactivos }
    });
    setHorarios(response.data?.data || []);
  }

  async function loadFechasClase(query = "") {
    const response = await api.get("/academico/fechas-clase", {
      params: { q: query }
    });
    setFechasClase(response.data?.data || []);
  }

  async function loadFeriados(query = "", incluirInactivos = incluirFeriadosInactivos) {
    const response = await api.get("/academico/feriados", {
      params: { q: query, incluirInactivos }
    });
    setFeriados(response.data?.data || []);
  }

  async function loadDiasLectivos() {
    const response = await api.get("/academico/dias-lectivos");
    setDiasLectivos(response.data?.data || []);
  }

  function handleToggleDiaLectivo(diaSemana: number) {
    setDiasLectivos((prev) =>
      prev.map((item) =>
        item.DiaSemana === diaSemana
          ? { ...item, Activo: !item.Activo }
          : item
      )
    );
  }

  async function handleGuardarDiasLectivos() {
    setLoadingDiasLectivos(true);
    clearMessages();

    try {
      await api.put("/academico/dias-lectivos", {
        dias: diasLectivos.map((item) => ({
          diaSemana: item.DiaSemana,
          activo: item.Activo
        }))
      });

      setMessage("Días lectivos actualizados correctamente");
      await Promise.all([loadDiasLectivos(), loadCatalogos()]);
    } catch (error: any) {
      console.error("Error guardando días lectivos:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudieron guardar los días lectivos"
      );
    } finally {
      setLoadingDiasLectivos(false);
    }
  }

  async function loadAll() {
    try {
      setErrorMessage("");
      await Promise.all([
        loadCatalogos(),
        loadAnios("", incluirAniosInactivos),
        loadPeriodos("", incluirPeriodosInactivos),
        loadGrupos("", incluirGruposInactivos),
        loadMatriculas("", incluirMatriculasInactivas),
        loadMaterias("", incluirMateriasInactivas),
        loadAsignaciones("", incluirAsignacionesInactivas),
        loadBloques(""),
        loadGruposMateria("", incluirGrupoMateriaInactivas),
        loadHorarios("", incluirHorariosInactivos),
        loadFechasClase(""),
        loadFeriados("", incluirFeriadosInactivos),
        loadDiasLectivos()
      ]);
    } catch (error: any) {
      console.error("Error cargando módulo académico:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar el módulo académico"
      );
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function resetAnioForm() {
    setAnioForm(initialAnioForm);
    setEditingAnioId(null);
  }

  function resetPeriodoForm() {
    setPeriodoForm(initialPeriodoForm);
    setEditingPeriodoId(null);
  }

  function resetGrupoForm() {
    setGrupoForm(initialGrupoForm);
    setEditingGrupoId(null);
  }

function resetMatriculaForm() {
  setMatriculaForm(initialMatriculaForm);
  setEditingMatriculaId(null);
  setReactivableMatriculaId(null);
}

  function resetMateriaForm() {
    setMateriaForm(initialMateriaForm);
    setEditingMateriaId(null);
  }

  function resetAsignacionForm() {
    setAsignacionForm(initialAsignacionForm);
    setEditingAsignacionId(null);
  }

  function resetBloqueForm() {
    setBloqueForm(initialBloqueForm);
    setEditingBloqueId(null);
  }

  function resetGrupoMateriaForm() {
    setGrupoMateriaForm(initialGrupoMateriaForm);
    setEditingGrupoMateriaId(null);
  }

  function resetHorarioForm() {
    setHorarioForm(initialHorarioForm);
    setEditingHorarioId(null);
  }

  function resetFechaClaseForm() {
    setFechaClaseForm(initialFechaClaseForm);
    setEditingFechaClaseId(null);
  }

  function resetFeriadoForm() {
    setFeriadoForm({ fecha: "", nombre: "", descripcion: "" });
    setEditingFeriadoId(null);
  }

  async function handleAnioSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingAnio(true);
    clearMessages();

    try {
      const payload = {
        nombre: anioForm.nombre,
        fechaInicio: anioForm.fechaInicio,
        fechaFin: anioForm.fechaFin
      };

      if (editingAnioId !== null) {
        await api.put(`/academico/anios-lectivos/${editingAnioId}`, payload);
        setMessage("Año lectivo actualizado correctamente");
      } else {
        await api.post("/academico/anios-lectivos", payload);
        setMessage("Año lectivo creado correctamente");
      }

      resetAnioForm();
      await Promise.all([
        loadAnios(anioSearch, incluirAniosInactivos),
        loadCatalogos(),
        loadGrupos(grupoSearch, incluirGruposInactivos),
        loadMatriculas(matriculaSearch, incluirMatriculasInactivas),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas)
      ]);
    } catch (error: any) {
      console.error("Error guardando año lectivo:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar el año lectivo"
      );
    } finally {
      setLoadingAnio(false);
    }
  }

  async function handlePeriodoSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingPeriodo(true);
    clearMessages();

    try {
      const payload = {
        anioLectivoId: Number(periodoForm.anioLectivoId),
        nombre: periodoForm.nombre,
        numeroOrden: Number(periodoForm.numeroOrden),
        fechaInicio: periodoForm.fechaInicio,
        fechaFin: periodoForm.fechaFin
      };

      if (editingPeriodoId !== null) {
        await api.put(`/academico/periodos/${editingPeriodoId}`, payload);
        setMessage("Período actualizado correctamente");
      } else {
        await api.post("/academico/periodos", payload);
        setMessage("Período creado correctamente");
      }

      resetPeriodoForm();
      await Promise.all([
        loadPeriodos(periodoSearch, incluirPeriodosInactivos),
        loadCatalogos(),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas),
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadFechasClase(fechaClaseSearch)
      ]);
    } catch (error: any) {
      console.error("Error guardando período:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar el período"
      );
    } finally {
      setLoadingPeriodo(false);
    }
  }

  async function handleGrupoSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingGrupo(true);
    clearMessages();

    try {
      const payload = {
        anioLectivoId: Number(grupoForm.anioLectivoId),
        nombre: grupoForm.nombre,
        nivel: grupoForm.nivel || null,
        jornada: grupoForm.jornada || null
      };

      if (editingGrupoId !== null) {
        await api.put(`/academico/grupos/${editingGrupoId}`, payload);
        setMessage("Grupo actualizado correctamente");
      } else {
        await api.post("/academico/grupos", payload);
        setMessage("Grupo creado correctamente");
      }

      resetGrupoForm();
      await Promise.all([
        loadGrupos(grupoSearch, incluirGruposInactivos),
        loadCatalogos(),
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas)
      ]);
    } catch (error: any) {
      console.error("Error guardando grupo:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar el grupo"
      );
    } finally {
      setLoadingGrupo(false);
    }
  }

  async function handleMatriculaSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingMatricula(true);
    clearMessages();
    setReactivableMatriculaId(null);

    try {
      const payload = {
        estudianteId: Number(matriculaForm.estudianteId),
        grupoId: Number(matriculaForm.grupoId),
        anioLectivoId: Number(matriculaForm.anioLectivoId),
        fechaMatricula: matriculaForm.fechaMatricula || null,
        observacion: matriculaForm.observacion || null,
        tipoMatricula: matriculaForm.tipoMatricula || null,
        nivelAcademico: matriculaForm.nivelAcademico ? Number(matriculaForm.nivelAcademico) : null,
        especialidad: matriculaForm.especialidad || null,
        seccionTexto: matriculaForm.seccionTexto || null,
        rutaTransporte: matriculaForm.rutaTransporte || null,
        esRepitente: !!matriculaForm.esRepitente,
        permiteExcepcionProgresion: !!matriculaForm.permiteExcepcionProgresion,
        justificacionExcepcion: matriculaForm.justificacionExcepcion || null,
        correoEnvioBoleta: matriculaForm.correoEnvioBoleta || null,
        observacionesDetalle: matriculaForm.observacionesDetalle || null
      };

      if (editingMatriculaId !== null) {
        await api.put(`/academico/matriculas/${editingMatriculaId}`, payload);
        setMessage("Matrícula actualizada correctamente");
      } else {
        await api.post("/academico/matriculas", payload);
        setMessage("Matrícula creada correctamente");
      }

      resetMatriculaForm();
      await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
    } catch (error: any) {
      console.error("Error guardando matrícula:", error);

      const backendCode = error?.response?.data?.code;
      if (backendCode === "MATRICULA_INACTIVA") {
        setReactivableMatriculaId(error?.response?.data?.matriculaId || null);
      }

      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la matrícula"
      );
    } finally {
      setLoadingMatricula(false);
    }
  }

  async function handleMateriaSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingMateria(true);
    clearMessages();

    try {
      const payload = {
        codigo: materiaForm.codigo || null,
        nombre: materiaForm.nombre,
        descripcion: materiaForm.descripcion || null
      };

      if (editingMateriaId !== null) {
        await api.put(`/academico/materias/${editingMateriaId}`, payload);
        setMessage("Materia actualizada correctamente");
      } else {
        await api.post("/academico/materias", payload);
        setMessage("Materia creada correctamente");
      }

      resetMateriaForm();
      await Promise.all([
        loadMaterias(materiaSearch, incluirMateriasInactivas),
        loadCatalogos(),
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas)
      ]);
    } catch (error: any) {
      console.error("Error guardando materia:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la materia"
      );
    } finally {
      setLoadingMateria(false);
    }
  }

  async function handleAsignacionSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingAsignacion(true);
    clearMessages();

    try {
      const payload = {
        usuarioId: Number(asignacionForm.usuarioId),
        grupoId: Number(asignacionForm.grupoId),
        materiaId: asignacionForm.materiaId ? Number(asignacionForm.materiaId) : null,
        anioLectivoId: Number(asignacionForm.anioLectivoId),
        periodoId: asignacionForm.periodoId ? Number(asignacionForm.periodoId) : null,
        tipoAsignacion: asignacionForm.tipoAsignacion
      };

      if (editingAsignacionId !== null) {
        await api.put(`/academico/asignaciones-docentes/${editingAsignacionId}`, payload);
        setMessage("Asignación docente actualizada correctamente");
      } else {
        await api.post("/academico/asignaciones-docentes", payload);
        setMessage("Asignación docente creada correctamente");
      }

      resetAsignacionForm();
      await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
    } catch (error: any) {
      console.error("Error guardando asignación docente:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la asignación docente"
      );
    } finally {
      setLoadingAsignacion(false);
    }
  }

  async function handleBloqueSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingBloque(true);
    clearMessages();

    try {
      const payload = {
        nombre: bloqueForm.nombre,
        horaInicio: bloqueForm.horaInicio,
        horaFin: bloqueForm.horaFin,
        ordenVisual: Number(bloqueForm.ordenVisual)
      };

      if (editingBloqueId !== null) {
        await api.put(`/academico/bloques-horarios/${editingBloqueId}`, payload);
        setMessage("Bloque horario actualizado correctamente");
      } else {
        await api.post("/academico/bloques-horarios", payload);
        setMessage("Bloque horario creado correctamente");
      }

      resetBloqueForm();
      await Promise.all([
        loadBloques(bloqueSearch),
        loadCatalogos(),
        loadHorarios(horarioSearch, incluirHorariosInactivos)
      ]);
    } catch (error: any) {
      console.error("Error guardando bloque horario:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar el bloque horario"
      );
    } finally {
      setLoadingBloque(false);
    }
  }

  async function handleGrupoMateriaSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingGrupoMateria(true);
    clearMessages();

    try {
      const payload = {
        grupoId: Number(grupoMateriaForm.grupoId),
        materiaId: Number(grupoMateriaForm.materiaId),
        periodoId: grupoMateriaForm.periodoId ? Number(grupoMateriaForm.periodoId) : null
      };

      if (editingGrupoMateriaId !== null) {
        await api.put(`/academico/grupos-materia/${editingGrupoMateriaId}`, payload);
        setMessage("Materia por grupo actualizada correctamente");
      } else {
        await api.post("/academico/grupos-materia", payload);
        setMessage("Materia por grupo creada correctamente");
      }

      resetGrupoMateriaForm();
      await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
    } catch (error: any) {
      console.error("Error guardando materia por grupo:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la materia por grupo"
      );
    } finally {
      setLoadingGrupoMateria(false);
    }
  }

  async function handleHorarioSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingHorario(true);
    clearMessages();

    try {
      const payload = {
        grupoMateriaId: Number(horarioForm.grupoMateriaId),
        bloqueHorarioId: Number(horarioForm.bloqueHorarioId),
        diaSemana: Number(horarioForm.diaSemana)
      };

      if (editingHorarioId !== null) {
        await api.put(`/academico/horarios-grupo/${editingHorarioId}`, payload);
        setMessage("Horario de clase actualizado correctamente");
      } else {
        await api.post("/academico/horarios-grupo", payload);
        setMessage("Horario de clase creado correctamente");
      }

      resetHorarioForm();
      await Promise.all([
        loadHorarios(horarioSearch, incluirHorariosInactivos),
        loadFechasClase(fechaClaseSearch)
      ]);
    } catch (error: any) {
      console.error("Error guardando horario de clase:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar el horario de clase"
      );
    } finally {
      setLoadingHorario(false);
    }
  }

  async function handleFechaClaseSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingFechaClase(true);
    clearMessages();

    try {
      const payload = {
        horarioGrupoId: Number(fechaClaseForm.horarioGrupoId),
        fecha: fechaClaseForm.fecha,
        periodoId: Number(fechaClaseForm.periodoId),
        esExtraordinaria: fechaClaseForm.esExtraordinaria,
        observacion: fechaClaseForm.observacion || null
      };

      if (editingFechaClaseId !== null) {
        await api.put(`/academico/fechas-clase/${editingFechaClaseId}`, payload);
        setMessage("Fecha de clase actualizada correctamente");
      } else {
        await api.post("/academico/fechas-clase", payload);
        setMessage("Fecha de clase creada correctamente");
      }

      resetFechaClaseForm();
      await loadFechasClase(fechaClaseSearch);
    } catch (error: any) {
      console.error("Error guardando fecha de clase:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo guardar la fecha de clase"
      );
    } finally {
      setLoadingFechaClase(false);
    }
  }

  async function handleGenerarFechasAutomaticas(e: FormEvent) {
  e.preventDefault();
  setLoadingFechaClase(true);
  clearMessages();

  try {
    const payload = {
      grupoMateriaId: Number(fechaClaseForm.grupoMateriaId),
      periodoId: Number(fechaClaseForm.periodoId),
      bloqueHorarioIdInicial: Number(fechaClaseForm.bloqueHorarioIdInicial),
      diaSemana: Number(fechaClaseForm.diaSemana),
      cantidadLeccionesPorDia: Number(fechaClaseForm.cantidadLeccionesPorDia)
    };

    const response = await api.post("/academico/fechas-clase/generar-automatico", payload);
    const data = response.data?.data;

    setMessage(
      `Fechas generadas correctamente. Total insertadas: ${data?.totalFechasInsertadas ?? 0}${
        data?.conflictos?.length ? ` | Conflictos omitidos: ${data.conflictos.length}` : ""
      }${data?.omitidasPorFeriado?.length ? ` | Feriados omitidos: ${data.omitidasPorFeriado.length}` : ""}`
    );

    await loadFechasClase(fechaClaseSearch);
  } catch (error: any) {
    console.error("Error generando fechas automáticas:", error);
    setErrorMessage(
      error?.response?.data?.message || "No se pudieron generar las fechas de clase automáticamente"
    );
  } finally {
    setLoadingFechaClase(false);
  }
}

async function handleReprogramarDesde(e: FormEvent) {
  e.preventDefault();
  setLoadingFechaClase(true);
  clearMessages();

  try {
    const payload = {
      grupoMateriaId: Number(fechaClaseForm.grupoMateriaId),
      periodoId: Number(fechaClaseForm.periodoId),
      fechaDesde: fechaClaseForm.fechaDesde,
      bloqueHorarioIdInicialNuevo: Number(fechaClaseForm.bloqueHorarioIdInicialNuevo),
      diaSemanaNuevo: Number(fechaClaseForm.diaSemanaNuevo),
      cantidadLeccionesPorDiaNueva: Number(fechaClaseForm.cantidadLeccionesPorDiaNueva)
    };

    await api.post("/academico/fechas-clase/reprogramar-desde", payload);

    setMessage("Reprogramación aplicada correctamente desde la fecha indicada");
    await loadFechasClase(fechaClaseSearch);
  } catch (error: any) {
    console.error("Error reprogramando fechas:", error);
    setErrorMessage(
      error?.response?.data?.message || "No se pudieron reprogramar las fechas de clase"
    );
  } finally {
    setLoadingFechaClase(false);
  }
}



  async function handleFeriadoSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingFeriado(true);
    clearMessages();

    try {
      const payload = {
        fecha: feriadoForm.fecha,
        nombre: feriadoForm.nombre,
        descripcion: feriadoForm.descripcion || null
      };

      if (editingFeriadoId !== null) {
        await api.put(`/academico/feriados/${editingFeriadoId}`, payload);
        setMessage("Feriado actualizado correctamente");
      } else {
        await api.post("/academico/feriados", payload);
        setMessage("Feriado creado correctamente");
      }

      resetFeriadoForm();
      await Promise.all([loadFeriados(feriadoSearch, incluirFeriadosInactivos), loadCatalogos()]);
    } catch (error: any) {
      console.error("Error guardando feriado:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el feriado");
    } finally {
      setLoadingFeriado(false);
    }
  }

  function handleEditFeriado(item: Feriado) {
    setTab("feriados");
    clearMessages();
    setEditingFeriadoId(item.FeriadoId);
    setFeriadoForm({
      fecha: formatDate(item.Fecha),
      nombre: item.Nombre || "",
      descripcion: item.Descripcion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteFeriado(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar este feriado?");
    if (!confirmado) return;
    clearMessages();
    try {
      await api.delete(`/academico/feriados/${id}`);
      setMessage("Feriado desactivado correctamente");
      if (editingFeriadoId === id) resetFeriadoForm();
      await Promise.all([loadFeriados(feriadoSearch, incluirFeriadosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el feriado");
    }
  }

  async function handleReactivateFeriado(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/feriados/${id}/reactivar`);
      setMessage("Feriado reactivado correctamente");
      await Promise.all([loadFeriados(feriadoSearch, incluirFeriadosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el feriado");
    }
  }

  async function handleFeriadoSearch(e: FormEvent) {
    e.preventDefault();
    await loadFeriados(feriadoSearch, incluirFeriadosInactivos);
  }

  function handleEditAnio(item: AnioLectivo) {
    setTab("anios");
    clearMessages();
    setEditingAnioId(item.AnioLectivoId);
    setAnioForm({
      nombre: item.Nombre || "",
      fechaInicio: formatDate(item.FechaInicio),
      fechaFin: formatDate(item.FechaFin)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditPeriodo(item: Periodo) {
    setTab("periodos");
    clearMessages();
    setEditingPeriodoId(item.PeriodoId);
    setPeriodoForm({
      anioLectivoId: String(item.AnioLectivoId ?? ""),
      nombre: item.Nombre || "",
      numeroOrden: String(item.NumeroOrden ?? ""),
      fechaInicio: formatDate(item.FechaInicio),
      fechaFin: formatDate(item.FechaFin)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditGrupo(item: Grupo) {
    setTab("grupos");
    clearMessages();
    setEditingGrupoId(item.GrupoId);
    setGrupoForm({
      anioLectivoId: String(item.AnioLectivoId ?? ""),
      nombre: item.Nombre || "",
      nivel: item.Nivel || "",
      jornada: item.Jornada || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditMatricula(item: Matricula) {
    setTab("matriculas");
    clearMessages();
    setEditingMatriculaId(item.MatriculaId);
    setReactivableMatriculaId(null);
    setMatriculaForm({
      estudianteId: String(item.EstudianteId ?? ""),
      grupoId: String(item.GrupoId ?? ""),
      anioLectivoId: String(item.AnioLectivoId ?? ""),
      fechaMatricula: formatDate(item.FechaMatricula),
      observacion: item.Observacion || "",
      tipoMatricula: item.TipoMatricula || "",
      nivelAcademico: item.NivelAcademico ? String(item.NivelAcademico) : "",
      especialidad: item.Especialidad || item.GrupoEspecialidad || "",
      seccionTexto: item.SeccionTexto || item.GrupoNombre || "",
      rutaTransporte: item.RutaTransporte || "",
      esRepitente: !!item.EsRepitente,
      permiteExcepcionProgresion: !!item.PermiteExcepcionProgresion,
      justificacionExcepcion: item.JustificacionExcepcion || "",
      correoEnvioBoleta: item.CorreoEnvioBoleta || "",
      observacionesDetalle: item.ObservacionesDetalle || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditMateria(item: Materia) {
    setTab("materias");
    clearMessages();
    setEditingMateriaId(item.MateriaId);
    setMateriaForm({
      codigo: item.Codigo || "",
      nombre: item.Nombre || "",
      descripcion: item.Descripcion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditAsignacion(item: AsignacionDocente) {
    setTab("asignaciones");
    clearMessages();
    setEditingAsignacionId(item.AsignacionDocenteId);
    setAsignacionForm({
      usuarioId: String(item.UsuarioId ?? ""),
      grupoId: String(item.GrupoId ?? ""),
      materiaId: item.MateriaId !== null && item.MateriaId !== undefined ? String(item.MateriaId) : "",
      anioLectivoId: String(item.AnioLectivoId ?? ""),
      periodoId: item.PeriodoId !== null && item.PeriodoId !== undefined ? String(item.PeriodoId) : "",
      tipoAsignacion: item.TipoAsignacion || "PROFESOR_MATERIA"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditBloque(item: BloqueHorario) {
    setTab("bloques");
    clearMessages();
    setEditingBloqueId(item.BloqueHorarioId);
    setBloqueForm({
      nombre: item.Nombre || "",
      horaInicio: formatTime(item.HoraInicio),
      horaFin: formatTime(item.HoraFin),
      ordenVisual: String(item.OrdenVisual ?? "")
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditGrupoMateria(item: GrupoMateria) {
    setTab("gruposMateria");
    clearMessages();
    setEditingGrupoMateriaId(item.GrupoMateriaId);
    setGrupoMateriaForm({
      grupoId: String(item.GrupoId ?? ""),
      materiaId: String(item.MateriaId ?? ""),
      periodoId: item.PeriodoId !== null && item.PeriodoId !== undefined ? String(item.PeriodoId) : ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditHorario(item: HorarioGrupo) {
    setTab("horarios");
    clearMessages();
    setEditingHorarioId(item.HorarioGrupoId);
    setHorarioForm({
      grupoMateriaId: String(item.GrupoMateriaId ?? ""),
      bloqueHorarioId: String(item.BloqueHorarioId ?? ""),
      diaSemana: String(item.DiaSemana ?? "")
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditFechaClase(item: FechaClase) {
    setTab("fechasClase");
    clearMessages();
    setEditingFechaClaseId(item.FechaClaseId);
    setFechaClaseForm({
      ...initialFechaClaseForm,
      horarioGrupoId: String(item.HorarioGrupoId ?? ""),
      fecha: formatDate(item.Fecha),
      periodoId: String(item.PeriodoId ?? ""),
      esExtraordinaria: !!item.EsExtraordinaria,
      observacion: item.Observacion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteAnio(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar este año lectivo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/anios-lectivos/${id}`);
      setMessage("Año lectivo desactivado correctamente");
      if (editingAnioId === id) resetAnioForm();
      await Promise.all([loadAnios(anioSearch, incluirAniosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el año lectivo");
    }
  }

  async function handleReactivateAnio(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/anios-lectivos/${id}/reactivar`);
      setMessage("Año lectivo reactivado correctamente");
      await Promise.all([loadAnios(anioSearch, incluirAniosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el año lectivo");
    }
  }

  async function handleDeletePeriodo(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar este período?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/periodos/${id}`);
      setMessage("Período desactivado correctamente");
      if (editingPeriodoId === id) resetPeriodoForm();
      await Promise.all([loadPeriodos(periodoSearch, incluirPeriodosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el período");
    }
  }

  async function handleReactivatePeriodo(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/periodos/${id}/reactivar`);
      setMessage("Período reactivado correctamente");
      await Promise.all([loadPeriodos(periodoSearch, incluirPeriodosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el período");
    }
  }

  async function handleDeleteGrupo(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar este grupo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/grupos/${id}`);
      setMessage("Grupo desactivado correctamente");
      if (editingGrupoId === id) resetGrupoForm();
      await Promise.all([loadGrupos(grupoSearch, incluirGruposInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el grupo");
    }
  }

  async function handleReactivateGrupo(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/grupos/${id}/reactivar`);
      setMessage("Grupo reactivado correctamente");
      await Promise.all([loadGrupos(grupoSearch, incluirGruposInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el grupo");
    }
  }

  async function handleDeleteMatricula(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta matrícula?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/matriculas/${id}`);
      setMessage("Matrícula desactivada correctamente");
      if (editingMatriculaId === id) resetMatriculaForm();
      await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar la matrícula");
    }
  }

  async function handleReactivateMatricula(id?: number) {
    const finalId = id ?? reactivableMatriculaId;
    if (finalId === null || finalId === undefined) return;
    clearMessages();

    try {
      await api.patch(`/academico/matriculas/${finalId}/reactivar`);
      setMessage("Matrícula reactivada correctamente");
      setReactivableMatriculaId(null);
      resetMatriculaForm();
      await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la matrícula");
    }
  }

  async function handleDeleteMateria(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta materia?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/materias/${id}`);
      setMessage("Materia desactivada correctamente");
      if (editingMateriaId === id) resetMateriaForm();
      await Promise.all([loadMaterias(materiaSearch, incluirMateriasInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar la materia");
    }
  }

  async function handleReactivateMateria(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/materias/${id}/reactivar`);
      setMessage("Materia reactivada correctamente");
      await Promise.all([loadMaterias(materiaSearch, incluirMateriasInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la materia");
    }
  }

  async function handleDeleteAsignacion(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta asignación docente?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/asignaciones-docentes/${id}`);
      setMessage("Asignación docente desactivada correctamente");
      if (editingAsignacionId === id) resetAsignacionForm();
      await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar la asignación docente");
    }
  }

  async function handleReactivateAsignacion(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/asignaciones-docentes/${id}/reactivar`);
      setMessage("Asignación docente reactivada correctamente");
      await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la asignación docente");
    }
  }

  async function handleDeleteBloque(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar este bloque horario?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/bloques-horarios/${id}`);
      setMessage("Bloque horario eliminado correctamente");
      if (editingBloqueId === id) resetBloqueForm();
      await Promise.all([loadBloques(bloqueSearch), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el bloque horario");
    }
  }

  async function handleDeleteGrupoMateria(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar esta materia por grupo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/grupos-materia/${id}`);
      setMessage("Materia por grupo desactivada correctamente");
      if (editingGrupoMateriaId === id) resetGrupoMateriaForm();
      await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar la materia por grupo");
    }
  }

  async function handleReactivateGrupoMateria(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/grupos-materia/${id}/reactivar`);
      setMessage("Materia por grupo reactivada correctamente");
      await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la materia por grupo");
    }
  }

  async function handleDeleteHorario(id: number) {
    const confirmado = window.confirm("¿Deseás desactivar este horario de clase?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/horarios-grupo/${id}`);
      setMessage("Horario de clase desactivado correctamente");
      if (editingHorarioId === id) resetHorarioForm();
      await loadHorarios(horarioSearch, incluirHorariosInactivos);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el horario de clase");
    }
  }

  async function handleReactivateHorario(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/horarios-grupo/${id}/reactivar`);
      setMessage("Horario de clase reactivado correctamente");
      await loadHorarios(horarioSearch, incluirHorariosInactivos);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el horario de clase");
    }
  }

  async function handleDeleteFechaClase(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar esta fecha de clase?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/fechas-clase/${id}`);
      setMessage("Fecha de clase eliminada correctamente");
      if (editingFechaClaseId === id) resetFechaClaseForm();
      await loadFechasClase(fechaClaseSearch);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la fecha de clase");
    }
  }

  async function handleAnioSearch(e: FormEvent) {
    e.preventDefault();
    await loadAnios(anioSearch, incluirAniosInactivos);
  }

  async function handlePeriodoSearch(e: FormEvent) {
    e.preventDefault();
    await loadPeriodos(periodoSearch, incluirPeriodosInactivos);
  }

  async function handleGrupoSearch(e: FormEvent) {
    e.preventDefault();
    await loadGrupos(grupoSearch, incluirGruposInactivos);
  }

  async function handleMatriculaSearch(e: FormEvent) {
    e.preventDefault();
    await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
  }

  async function handleMateriaSearch(e: FormEvent) {
    e.preventDefault();
    await loadMaterias(materiaSearch, incluirMateriasInactivas);
  }

  async function handleAsignacionSearch(e: FormEvent) {
    e.preventDefault();
    await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
  }

  async function handleBloqueSearch(e: FormEvent) {
    e.preventDefault();
    await loadBloques(bloqueSearch);
  }

  async function handleGrupoMateriaSearch(e: FormEvent) {
    e.preventDefault();
    await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
  }

  async function handleHorarioSearch(e: FormEvent) {
    e.preventDefault();
    await loadHorarios(horarioSearch, incluirHorariosInactivos);
  }

  async function handleFechaClaseSearch(e: FormEvent) {
    e.preventDefault();
    await loadFechasClase(fechaClaseSearch);
  }


  async function handleConfigCorreoSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingConfigCorreo(true);
    clearMessages();
    try {
      const response = await api.put('/academico/configuracion-correo-estudiante', { dominio: correoEstudianteDominio });
      const data = response.data?.data || {};
      setCorreoEstudianteDominio(String(data?.dominio || correoEstudianteDominio));
      setMessage('Configuración de correo estudiantil actualizada correctamente');
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo actualizar la configuración de correo');
    } finally {
      setLoadingConfigCorreo(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
          <button type="button" className="primary-btn" onClick={() => setTab("anios")} style={{ opacity: tab === "anios" ? 1 : 0.75 }}>Años lectivos</button>
          <button type="button" className="primary-btn" onClick={() => setTab("periodos")} style={{ opacity: tab === "periodos" ? 1 : 0.75 }}>Períodos</button>
          <button type="button" className="primary-btn" onClick={() => setTab("grupos")} style={{ opacity: tab === "grupos" ? 1 : 0.75 }}>Gestión de grupos</button>
          <button type="button" className="primary-btn" onClick={() => setTab("matriculas")} style={{ opacity: tab === "matriculas" ? 1 : 0.75 }}>Matrículas</button>
          <button type="button" className="primary-btn" onClick={() => setTab("materias")} style={{ opacity: tab === "materias" ? 1 : 0.75 }}>Materias</button>
          <button type="button" className="primary-btn" onClick={() => setTab("asignaciones")} style={{ opacity: tab === "asignaciones" ? 1 : 0.75 }}>Asignación docente</button>
          <button type="button" className="primary-btn" onClick={() => setTab("bloques")} style={{ opacity: tab === "bloques" ? 1 : 0.75 }}>Bloques horarios</button>
          <button type="button" className="primary-btn" onClick={() => setTab("gruposMateria")} style={{ opacity: tab === "gruposMateria" ? 1 : 0.75 }}>Materias por grupo</button>
          <button type="button" className="primary-btn" onClick={() => setTab("horarios")} style={{ opacity: tab === "horarios" ? 1 : 0.75 }}>Horario de clases</button>
          <button type="button" className="primary-btn" onClick={() => setTab("fechasClase")} style={{ opacity: tab === "fechasClase" ? 1 : 0.75 }}>Fechas de clase</button>
          <button type="button" className="primary-btn" onClick={() => setTab("diasLectivos")} style={{ opacity: tab === "diasLectivos" ? 1 : 0.75 }}>Días lectivos</button>
          <button type="button" className="primary-btn" onClick={() => setTab("feriados")} style={{ opacity: tab === "feriados" ? 1 : 0.75 }}>Feriados</button>
          <button type="button" className="primary-btn" onClick={() => setTab("configuracionCorreo")} style={{ opacity: tab === "configuracionCorreo" ? 1 : 0.75 }}>Correo estudiantil</button>
        </div>

        {message && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
            {message}
          </div>
        )}

        {errorMessage && (
          <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            <div>{errorMessage}</div>
            {reactivableMatriculaId !== null && (
              <button
                type="button"
                onClick={() => handleReactivateMatricula()}
                style={{
                  marginTop: "10px",
                  border: "1px solid #fca5a5",
                  background: "#fff",
                  color: "#991b1b",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  cursor: "pointer"
                }}
              >
                Reactivar matrícula
              </button>
            )}
          </div>
        )}



        {tab === "configuracionCorreo" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Configuración de correo estudiantil</h3>
              <form className="form" onSubmit={handleConfigCorreoSubmit}>
                <label>
                  Dominio del correo estudiantil
                  <input value={correoEstudianteDominio} onChange={(e) => setCorreoEstudianteDominio(e.target.value)} placeholder="@est.mep.go.cr" />
                </label>
                <div style={{ opacity: 0.8, marginTop: '-4px' }}>
                  El correo del estudiante se generará automáticamente como identificación + dominio. Ejemplo: 102340567{correoEstudianteDominio.startsWith('@') ? correoEstudianteDominio : '@' + correoEstudianteDominio}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingConfigCorreo}>
                    {loadingConfigCorreo ? "Guardando..." : "Guardar configuración"}
                  </button>
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Uso de esta configuración</h3>
              <div className="stack">
                <div>El usuario del estudiante y del acceso de padre de familia se formará con el número de identificación más este dominio</div>
                <div><strong>Ejemplo:</strong> 102340567{correoEstudianteDominio.startsWith('@') ? correoEstudianteDominio : '@' + correoEstudianteDominio}</div>
                <div>La clave inicial será el número de identificación y en el primer ingreso se solicitará el cambio</div>
              </div>
            </section>
          </div>
        )}

        {tab === "anios" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingAnioId !== null ? "Editar año lectivo" : "Crear año lectivo"}</h3>
              <form className="form" onSubmit={handleAnioSubmit}>
                <label>
                  Nombre
                  <input value={anioForm.nombre} onChange={(e) => setAnioForm({ ...anioForm, nombre: e.target.value })} placeholder="Ejemplo: 2026" />
                </label>
                <label>
                  Fecha inicio
                  <input type="date" value={anioForm.fechaInicio} onChange={(e) => setAnioForm({ ...anioForm, fechaInicio: e.target.value })} />
                </label>
                <label>
                  Fecha fin
                  <input type="date" value={anioForm.fechaFin} onChange={(e) => setAnioForm({ ...anioForm, fechaFin: e.target.value })} />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingAnio}>
                    {loadingAnio ? (editingAnioId !== null ? "Actualizando..." : "Guardando...") : (editingAnioId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingAnioId !== null && (
                    <button type="button" onClick={resetAnioForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de años lectivos</h3>
              <form onSubmit={handleAnioSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por nombre o fecha" value={anioSearch} onChange={(e) => setAnioSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setAnioSearch(""); loadAnios("", incluirAniosInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirAniosInactivos} onChange={(e) => setIncluirAniosInactivos(e.target.checked)} />
                Incluir años lectivos inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {anios.map((item) => (
                      <tr key={item.AnioLectivoId}>
                        <td>{item.AnioLectivoId}</td>
                        <td>{item.Nombre}</td>
                        <td>{formatDate(item.FechaInicio)}</td>
                        <td>{formatDate(item.FechaFin)}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditAnio(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteAnio(item.AnioLectivoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateAnio(item.AnioLectivoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!anios.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay años lectivos registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "periodos" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingPeriodoId !== null ? "Editar período" : "Crear período"}</h3>
              <form className="form" onSubmit={handlePeriodoSubmit}>
                <label>
                  Año lectivo
                  <select value={periodoForm.anioLectivoId} onChange={(e) => setPeriodoForm({ ...periodoForm, anioLectivoId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {aniosActivos.map((anio) => <option key={anio.AnioLectivoId} value={anio.AnioLectivoId}>{anio.Nombre}</option>)}
                  </select>
                </label>
                <label>
                  Nombre
                  <input value={periodoForm.nombre} onChange={(e) => setPeriodoForm({ ...periodoForm, nombre: e.target.value })} placeholder="Ejemplo: I Trimestre" />
                </label>
                <label>
                  Número de orden
                  <input type="number" value={periodoForm.numeroOrden} onChange={(e) => setPeriodoForm({ ...periodoForm, numeroOrden: e.target.value })} placeholder="1" />
                </label>
                <label>
                  Fecha inicio
                  <input type="date" value={periodoForm.fechaInicio} onChange={(e) => setPeriodoForm({ ...periodoForm, fechaInicio: e.target.value })} />
                </label>
                <label>
                  Fecha fin
                  <input type="date" value={periodoForm.fechaFin} onChange={(e) => setPeriodoForm({ ...periodoForm, fechaFin: e.target.value })} />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingPeriodo}>
                    {loadingPeriodo ? (editingPeriodoId !== null ? "Actualizando..." : "Guardando...") : (editingPeriodoId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingPeriodoId !== null && (
                    <button type="button" onClick={resetPeriodoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de períodos</h3>
              <form onSubmit={handlePeriodoSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por período, año o orden" value={periodoSearch} onChange={(e) => setPeriodoSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setPeriodoSearch(""); loadPeriodos("", incluirPeriodosInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirPeriodosInactivos} onChange={(e) => setIncluirPeriodosInactivos(e.target.checked)} />
                Incluir períodos inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Año lectivo</th><th>Nombre</th><th>Orden</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {periodos.map((item) => (
                      <tr key={item.PeriodoId}>
                        <td>{item.PeriodoId}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.NumeroOrden}</td>
                        <td>{formatDate(item.FechaInicio)}</td>
                        <td>{formatDate(item.FechaFin)}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditPeriodo(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeletePeriodo(item.PeriodoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivatePeriodo(item.PeriodoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!periodos.length && <tr><td colSpan={8} style={{ textAlign: "center", padding: "16px" }}>No hay períodos registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "grupos" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingGrupoId !== null ? "Editar grupo" : "Crear grupo"}</h3>
              <form className="form" onSubmit={handleGrupoSubmit}>
                <label>
                  Año lectivo
                  <select value={grupoForm.anioLectivoId} onChange={(e) => setGrupoForm({ ...grupoForm, anioLectivoId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {aniosActivos.map((anio) => <option key={anio.AnioLectivoId} value={anio.AnioLectivoId}>{anio.Nombre}</option>)}
                  </select>
                </label>
                <label>
                  Nombre del grupo
                  <input value={grupoForm.nombre} onChange={(e) => setGrupoForm({ ...grupoForm, nombre: e.target.value })} placeholder="Ejemplo: 7-1" />
                </label>
                <label>
                  Nivel
                  <input value={grupoForm.nivel} onChange={(e) => setGrupoForm({ ...grupoForm, nivel: e.target.value })} placeholder="Ejemplo: Sétimo" />
                </label>
                <label>
                  Jornada
                  <input value={grupoForm.jornada} onChange={(e) => setGrupoForm({ ...grupoForm, jornada: e.target.value })} placeholder="Ejemplo: Diurna" />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingGrupo}>
                    {loadingGrupo ? (editingGrupoId !== null ? "Actualizando..." : "Guardando...") : (editingGrupoId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingGrupoId !== null && (
                    <button type="button" onClick={resetGrupoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de grupos</h3>
              <form onSubmit={handleGrupoSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por grupo, nivel, jornada o año" value={grupoSearch} onChange={(e) => setGrupoSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setGrupoSearch(""); loadGrupos("", incluirGruposInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirGruposInactivos} onChange={(e) => setIncluirGruposInactivos(e.target.checked)} />
                Incluir grupos inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Año lectivo</th><th>Grupo</th><th>Nivel</th><th>Jornada</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((item) => (
                      <tr key={item.GrupoId}>
                        <td>{item.GrupoId}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.Nivel || ""}</td>
                        <td>{item.Jornada || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditGrupo(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteGrupo(item.GrupoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateGrupo(item.GrupoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!grupos.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>No hay grupos registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "matriculas" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingMatriculaId !== null ? "Editar matrícula" : "Crear matrícula"}</h3>
<form className="form" onSubmit={handleMatriculaSubmit}>
  <label>
    Estudiante
    <select
      value={matriculaForm.estudianteId}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          estudianteId: e.target.value
        }))
      }
      required
    >
      <option value="">Seleccione</option>
      {estudiantes.map((item) => (
        <option key={item.EstudianteId} value={item.EstudianteId}>
          {item.Identificacion} - {getStudentFullName(item)}
        </option>
      ))}
    </select>
  </label>

  <label>
    Año lectivo
    <select
      value={matriculaForm.anioLectivoId}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          anioLectivoId: e.target.value
        }))
      }
      required
    >
      <option value="">Seleccione</option>
      {aniosActivos.map((item) => (
        <option key={item.AnioLectivoId} value={item.AnioLectivoId}>
          {item.Nombre}
        </option>
      ))}
    </select>
  </label>

  <label>
    Grupo
    <select
      value={matriculaForm.grupoId}
      onChange={(e) => {
        const grupoId = e.target.value;
        const grupoSeleccionado = gruposCatalogo.find(
          (g) => String(g.GrupoId) === String(grupoId)
        );

        setMatriculaForm((prev: any) => ({
          ...prev,
          grupoId,
          nivelAcademico: grupoSeleccionado?.NivelAcademico
            ? String(grupoSeleccionado.NivelAcademico)
            : "",
          especialidad: grupoSeleccionado?.Especialidad || "",
          seccionTexto: grupoSeleccionado?.Nombre || ""
        }));
      }}
      required
    >
      <option value="">Seleccione</option>
      {gruposCatalogo.map((item) => (
        <option key={item.GrupoId} value={item.GrupoId}>
          {item.Nombre} {item.Nivel ? `- ${item.Nivel}` : ""}
        </option>
      ))}
    </select>
  </label>

  <label>
    Fecha de matrícula
    <input
      type="date"
      value={matriculaForm.fechaMatricula}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          fechaMatricula: e.target.value
        }))
      }
    />
  </label>

  <label>
    Tipo de matrícula
    <input
      value={matriculaForm.tipoMatricula}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          tipoMatricula: e.target.value
        }))
      }
      placeholder="Ejemplo: Regular CTP 2026"
    />
  </label>

  <label>
    Nivel académico
    <input
      type="number"
      value={matriculaForm.nivelAcademico}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          nivelAcademico: e.target.value
        }))
      }
      placeholder="7, 8, 9, 10..."
    />
  </label>

  <label>
    Especialidad
    <input
      value={matriculaForm.especialidad}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          especialidad: e.target.value
        }))
      }
    />
  </label>

  <label>
    Sección
    <input
      value={matriculaForm.seccionTexto}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          seccionTexto: e.target.value
        }))
      }
    />
  </label>

  <label>
    Ruta de transporte
    <input
      value={matriculaForm.rutaTransporte}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          rutaTransporte: e.target.value
        }))
      }
    />
  </label>

  <label>
    Correo envío boleta
    <input
      type="email"
      value={matriculaForm.correoEnvioBoleta}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          correoEnvioBoleta: e.target.value
        }))
      }
      placeholder="correo del encargado o padre de familia"
    />
  </label>

  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <input
      type="checkbox"
      checked={!!matriculaForm.esRepitente}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          esRepitente: e.target.checked
        }))
      }
    />
    Es repitente
  </label>

  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <input
      type="checkbox"
      checked={!!matriculaForm.permiteExcepcionProgresion}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          permiteExcepcionProgresion: e.target.checked
        }))
      }
    />
    Permitir excepción de progresión
  </label>

  {matriculaForm.permiteExcepcionProgresion && (
    <label>
      Justificación de excepción
      <textarea
        rows={3}
        value={matriculaForm.justificacionExcepcion}
        onChange={(e) =>
          setMatriculaForm((prev: any) => ({
            ...prev,
            justificacionExcepcion: e.target.value
          }))
        }
        placeholder="Indicá la justificación para permitir un salto o excepción de nivel"
      />
    </label>
  )}

  <label>
    Observación general
    <textarea
      rows={2}
      value={matriculaForm.observacion}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          observacion: e.target.value
        }))
      }
    />
  </label>

  <label>
    Observaciones detalle
    <textarea
      rows={3}
      value={matriculaForm.observacionesDetalle}
      onChange={(e) =>
        setMatriculaForm((prev: any) => ({
          ...prev,
          observacionesDetalle: e.target.value
        }))
      }
    />
  </label>

  {reactivableMatriculaId !== null && (
    <div
      style={{
        marginTop: "8px",
        padding: "10px 12px",
        borderRadius: "10px",
        background: "#fff7ed",
        color: "#9a3412",
        border: "1px solid #fdba74"
      }}
    >
      Existe una matrícula inactiva similar.
      <div style={{ marginTop: "8px" }}>
        <button
          type="button"
          onClick={() => handleReactivateMatricula()}
          style={{
            border: "1px solid #fdba74",
            background: "#fff",
            color: "#9a3412",
            borderRadius: "8px",
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Reactivar matrícula
        </button>
      </div>
    </div>
  )}

  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
    <button className="primary-btn" disabled={loadingMatricula}>
      {loadingMatricula
        ? editingMatriculaId !== null
          ? "Actualizando..."
          : "Guardando..."
        : editingMatriculaId !== null
          ? "Actualizar matrícula"
          : "Guardar matrícula"}
    </button>

    {editingMatriculaId !== null && (
      <button
        type="button"
        onClick={resetMatriculaForm}
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

            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de matrículas</h3>
              <form onSubmit={handleMatriculaSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por estudiante, grupo o año" value={matriculaSearch} onChange={(e) => setMatriculaSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setMatriculaSearch(""); loadMatriculas("", incluirMatriculasInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirMatriculasInactivas} onChange={(e) => setIncluirMatriculasInactivas(e.target.checked)} />
                Incluir matrículas inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Estudiante</th>
                      <th>Grupo</th>
                      <th>Año</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Tipo</th>
                      <th>Nivel</th>
                      <th>Repitente</th>
                      <th>Excepción</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matriculas.map((item) => (
                      <tr key={item.MatriculaId}>
                        <td>{item.MatriculaId}</td>
                        <td>{item.Identificacion} - {getStudentFullName(item)}</td>
                        <td>{item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{formatDate(item.FechaMatricula)}</td>
                        <td>{item.Estado}</td>
                        <td>{item.TipoMatricula || ""}</td>
                        <td>{item.NivelAcademico || item.GrupoNivelAcademico || ""}</td>
                        <td>{item.EsRepitente ? "Sí" : "No"}</td>
                        <td>{item.PermiteExcepcionProgresion ? "Sí" : "No"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditMatricula(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            <button
                              type="button"
                              onClick={() => window.open(`/boletas/matricula/${item.MatriculaId}`, "_blank")}
                              style={{ border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}
                            >
                              Ver boleta
                            </button>
                            {item.Estado === "Activa" ? (
                              <button type="button" onClick={() => handleDeleteMatricula(item.MatriculaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateMatricula(item.MatriculaId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!matriculas.length && <tr><td colSpan={11} style={{ textAlign: "center", padding: "16px" }}>No hay matrículas registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "materias" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingMateriaId !== null ? "Editar materia" : "Crear materia"}</h3>
              <form className="form" onSubmit={handleMateriaSubmit}>
                <label>
                  Código
                  <input value={materiaForm.codigo} onChange={(e) => setMateriaForm({ ...materiaForm, codigo: e.target.value })} placeholder="Ejemplo: MAT-01" />
                </label>
                <label>
                  Nombre
                  <input value={materiaForm.nombre} onChange={(e) => setMateriaForm({ ...materiaForm, nombre: e.target.value })} placeholder="Ejemplo: Matemáticas" />
                </label>
                <label>
                  Descripción
                  <input value={materiaForm.descripcion} onChange={(e) => setMateriaForm({ ...materiaForm, descripcion: e.target.value })} placeholder="Opcional" />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingMateria}>
                    {loadingMateria ? (editingMateriaId !== null ? "Actualizando..." : "Guardando...") : (editingMateriaId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingMateriaId !== null && (
                    <button type="button" onClick={resetMateriaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de materias</h3>
              <form onSubmit={handleMateriaSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por nombre o código" value={materiaSearch} onChange={(e) => setMateriaSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setMateriaSearch(""); loadMaterias("", incluirMateriasInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirMateriasInactivas} onChange={(e) => setIncluirMateriasInactivas(e.target.checked)} />
                Incluir materias inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Código</th><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {materias.map((item) => (
                      <tr key={item.MateriaId}>
                        <td>{item.MateriaId}</td>
                        <td>{item.Codigo || ""}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.Descripcion || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditMateria(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteMateria(item.MateriaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateMateria(item.MateriaId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!materias.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay materias registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "asignaciones" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingAsignacionId !== null ? "Editar asignación docente" : "Crear asignación docente"}</h3>
              <form className="form" onSubmit={handleAsignacionSubmit}>
                <label>
                  Docente
                  <select value={asignacionForm.usuarioId} onChange={(e) => setAsignacionForm({ ...asignacionForm, usuarioId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {docentesCatalogo.map((item) => (
                      <option key={item.UsuarioId} value={item.UsuarioId}>
                        {getTeacherFullName(item)} - {item.Correo}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Grupo
                  <select value={asignacionForm.grupoId} onChange={(e) => setAsignacionForm({ ...asignacionForm, grupoId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {gruposActivos.map((item) => (
                      <option key={item.GrupoId} value={item.GrupoId}>
                        {item.Nombre} {item.Nivel ? `- ${item.Nivel}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Materia
                  <select value={asignacionForm.materiaId} onChange={(e) => setAsignacionForm({ ...asignacionForm, materiaId: e.target.value })}>
                    <option value="">Sin materia</option>
                    {materiasActivas.map((item) => (
                      <option key={item.MateriaId} value={item.MateriaId}>
                        {item.Nombre} {item.Codigo ? `- ${item.Codigo}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Año lectivo
                  <select value={asignacionForm.anioLectivoId} onChange={(e) => setAsignacionForm({ ...asignacionForm, anioLectivoId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {aniosActivos.map((item) => <option key={item.AnioLectivoId} value={item.AnioLectivoId}>{item.Nombre}</option>)}
                  </select>
                </label>
                <label>
                  Período
                  <select value={asignacionForm.periodoId} onChange={(e) => setAsignacionForm({ ...asignacionForm, periodoId: e.target.value })}>
                    <option value="">Sin período específico</option>
                    {periodos.filter((p) => p.Activo).map((item) => (
                      <option key={item.PeriodoId} value={item.PeriodoId}>
                        {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo de asignación
                  <select value={asignacionForm.tipoAsignacion} onChange={(e) => setAsignacionForm({ ...asignacionForm, tipoAsignacion: e.target.value })}>
                    <option value="PROFESOR_MATERIA">PROFESOR_MATERIA</option>
                    <option value="PROFESOR_GUIA">PROFESOR_GUIA</option>
                  </select>
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingAsignacion}>
                    {loadingAsignacion ? (editingAsignacionId !== null ? "Actualizando..." : "Guardando...") : (editingAsignacionId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingAsignacionId !== null && (
                    <button type="button" onClick={resetAsignacionForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de asignaciones docentes</h3>
              <form onSubmit={handleAsignacionSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por docente, grupo, materia o año" value={asignacionSearch} onChange={(e) => setAsignacionSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setAsignacionSearch(""); loadAsignaciones("", incluirAsignacionesInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirAsignacionesInactivas} onChange={(e) => setIncluirAsignacionesInactivas(e.target.checked)} />
                Incluir asignaciones inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Docente</th><th>Grupo</th><th>Materia</th><th>Año</th><th>Período</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {asignaciones.map((item) => (
                      <tr key={item.AsignacionDocenteId}>
                        <td>{item.AsignacionDocenteId}</td>
                        <td>{getTeacherFullName(item)}</td>
                        <td>{item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                        <td>{item.MateriaNombre || ""}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{item.PeriodoNombre || ""}</td>
                        <td>{item.TipoAsignacion}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditAsignacion(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteAsignacion(item.AsignacionDocenteId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateAsignacion(item.AsignacionDocenteId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!asignaciones.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>No hay asignaciones docentes registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "bloques" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingBloqueId !== null ? "Editar bloque horario" : "Crear bloque horario"}</h3>
              <form className="form" onSubmit={handleBloqueSubmit}>
                <label>
                  Nombre
                  <input value={bloqueForm.nombre} onChange={(e) => setBloqueForm({ ...bloqueForm, nombre: e.target.value })} placeholder="Ejemplo: Bloque 1" />
                </label>
                <label>
                  Hora inicio
                  <input type="time" value={bloqueForm.horaInicio} onChange={(e) => setBloqueForm({ ...bloqueForm, horaInicio: e.target.value })} />
                </label>
                <label>
                  Hora fin
                  <input type="time" value={bloqueForm.horaFin} onChange={(e) => setBloqueForm({ ...bloqueForm, horaFin: e.target.value })} />
                </label>
                <label>
                  Orden visual
                  <input type="number" value={bloqueForm.ordenVisual} onChange={(e) => setBloqueForm({ ...bloqueForm, ordenVisual: e.target.value })} placeholder="1" />
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingBloque}>
                    {loadingBloque ? (editingBloqueId !== null ? "Actualizando..." : "Guardando...") : (editingBloqueId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingBloqueId !== null && (
                    <button type="button" onClick={resetBloqueForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de bloques horarios</h3>
              <form onSubmit={handleBloqueSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por nombre u horario" value={bloqueSearch} onChange={(e) => setBloqueSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setBloqueSearch(""); loadBloques(""); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Nombre</th><th>Hora inicio</th><th>Hora fin</th><th>Orden</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {bloques.map((item) => (
                      <tr key={item.BloqueHorarioId}>
                        <td>{item.BloqueHorarioId}</td>
                        <td>{item.Nombre}</td>
                        <td>{formatTime(item.HoraInicio)}</td>
                        <td>{formatTime(item.HoraFin)}</td>
                        <td>{item.OrdenVisual}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditBloque(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            <button type="button" onClick={() => handleDeleteBloque(item.BloqueHorarioId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!bloques.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay bloques horarios registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "gruposMateria" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingGrupoMateriaId !== null ? "Editar materia por grupo" : "Crear materia por grupo"}</h3>
              <form className="form" onSubmit={handleGrupoMateriaSubmit}>
                <label>
                  Grupo
                  <select value={grupoMateriaForm.grupoId} onChange={(e) => setGrupoMateriaForm({ ...grupoMateriaForm, grupoId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {gruposActivos.map((item) => (
                      <option key={item.GrupoId} value={item.GrupoId}>
                        {item.Nombre} {item.Nivel ? `- ${item.Nivel}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Materia
                  <select value={grupoMateriaForm.materiaId} onChange={(e) => setGrupoMateriaForm({ ...grupoMateriaForm, materiaId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {materiasActivas.map((item) => (
                      <option key={item.MateriaId} value={item.MateriaId}>
                        {item.Nombre} {item.Codigo ? `- ${item.Codigo}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Período
                  <select value={grupoMateriaForm.periodoId} onChange={(e) => setGrupoMateriaForm({ ...grupoMateriaForm, periodoId: e.target.value })}>
                    <option value="">Sin período específico</option>
                    {periodos.filter((p) => p.Activo).map((item) => (
                      <option key={item.PeriodoId} value={item.PeriodoId}>
                        {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingGrupoMateria}>
                    {loadingGrupoMateria ? (editingGrupoMateriaId !== null ? "Actualizando..." : "Guardando...") : (editingGrupoMateriaId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingGrupoMateriaId !== null && (
                    <button type="button" onClick={resetGrupoMateriaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de materias por grupo</h3>
              <form onSubmit={handleGrupoMateriaSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por grupo, materia o período" value={grupoMateriaSearch} onChange={(e) => setGrupoMateriaSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setGrupoMateriaSearch(""); loadGruposMateria("", incluirGrupoMateriaInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirGrupoMateriaInactivas} onChange={(e) => setIncluirGrupoMateriaInactivas(e.target.checked)} />
                Incluir materias por grupo inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Grupo</th><th>Materia</th><th>Período</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {gruposMateria.map((item) => (
                      <tr key={item.GrupoMateriaId}>
                        <td>{item.GrupoMateriaId}</td>
                        <td>{item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                        <td>{item.MateriaNombre || ""} {item.MateriaCodigo ? `- ${item.MateriaCodigo}` : ""}</td>
                        <td>{item.PeriodoNombre || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditGrupoMateria(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteGrupoMateria(item.GrupoMateriaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateGrupoMateria(item.GrupoMateriaId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!gruposMateria.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay materias por grupo registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "horarios" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingHorarioId !== null ? "Editar horario de clase" : "Crear horario de clase"}</h3>
              <form className="form" onSubmit={handleHorarioSubmit}>
                <label>
                  Materia por grupo
                  <select value={horarioForm.grupoMateriaId} onChange={(e) => setHorarioForm({ ...horarioForm, grupoMateriaId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {gruposMateriaActivas.map((item) => (
                      <option key={item.GrupoMateriaId} value={item.GrupoMateriaId}>
                        {item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""} / {item.MateriaNombre || ""} {item.PeriodoNombre ? `- ${item.PeriodoNombre}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Bloque horario
                  <select value={horarioForm.bloqueHorarioId} onChange={(e) => setHorarioForm({ ...horarioForm, bloqueHorarioId: e.target.value })}>
                    <option value="">Seleccione</option>
                    {bloquesCatalogo.map((item) => (
                      <option key={item.BloqueHorarioId} value={item.BloqueHorarioId}>
                        {item.Nombre} - {formatTime(item.HoraInicio)} a {formatTime(item.HoraFin)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Día de la semana
                  <select value={horarioForm.diaSemana} onChange={(e) => setHorarioForm({ ...horarioForm, diaSemana: e.target.value })}>
                    <option value="">Seleccione</option>
                    <option value="2">Lunes</option>
                    <option value="3">Martes</option>
                    <option value="4">Miércoles</option>
                    <option value="5">Jueves</option>
                    <option value="6">Viernes</option>
                    <option value="7">Sábado</option>
                    <option value="1">Domingo</option>
                  </select>
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingHorario}>
                    {loadingHorario ? (editingHorarioId !== null ? "Actualizando..." : "Guardando...") : (editingHorarioId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  {editingHorarioId !== null && (
                    <button type="button" onClick={resetHorarioForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de horarios de clase</h3>
              <form onSubmit={handleHorarioSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por grupo, materia, bloque o día" value={horarioSearch} onChange={(e) => setHorarioSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setHorarioSearch(""); loadHorarios("", incluirHorariosInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirHorariosInactivos} onChange={(e) => setIncluirHorariosInactivos(e.target.checked)} />
                Incluir horarios inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Grupo</th><th>Materia</th><th>Período</th><th>Día</th><th>Bloque</th><th>Hora</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {horarios.map((item) => (
                      <tr key={item.HorarioGrupoId}>
                        <td>{item.HorarioGrupoId}</td>
                        <td>{item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                        <td>{item.MateriaNombre || ""}</td>
                        <td>{item.PeriodoNombre || ""}</td>
                        <td>{diaSemanaLabel(item.DiaSemana)}</td>
                        <td>{item.BloqueNombre || ""}</td>
                        <td>{formatTime(item.HoraInicio)} - {formatTime(item.HoraFin)}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditHorario(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteHorario(item.HorarioGrupoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateHorario(item.HorarioGrupoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!horarios.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>No hay horarios de clase registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        
        {tab === "diasLectivos" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Configuración de días lectivos</h3>
              <p style={{ marginTop: 0, opacity: 0.85 }}>
                Marcá uno o varios días en los que la institución imparte clases normalmente
              </p>

              <div style={{ display: "grid", gap: "10px" }}>
                {diasLectivos.map((item) => (
                  <label key={item.DiaSemana} className="dia-lectivo-item">
                    <input
                      type="checkbox"
                      checked={item.Activo}
                      onChange={() => handleToggleDiaLectivo(item.DiaSemana)}
                    />
                    <span>{item.Nombre}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" }}>
                <button className="primary-btn" type="button" disabled={loadingDiasLectivos} onClick={handleGuardarDiasLectivos}>
                  {loadingDiasLectivos ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => loadDiasLectivos()}
                  style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
                >
                  Recargar
                </button>
              </div>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Resumen</h3>
              <p style={{ marginTop: 0, opacity: 0.85 }}>
                Estos días serán utilizados por la institución para mostrar columnas en Horarios y para futuras validaciones académicas
              </p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Día</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {diasLectivos.map((item) => (
                      <tr key={item.DiaSemana}>
                        <td>{item.Nombre}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                      </tr>
                    ))}
                    {!diasLectivos.length && <tr><td colSpan={2} style={{ textAlign: "center", padding: "16px" }}>No hay días lectivos configurados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "feriados" && (
          <div className="two-col">
            <section className="card" style={{ marginBottom: 0 }}>
              <h3>{editingFeriadoId !== null ? "Editar feriado" : "Crear feriado"}</h3>

              <form className="form" onSubmit={handleFeriadoSubmit}>
                <label>
                  Fecha
                  <input type="date" value={feriadoForm.fecha} onChange={(e) => setFeriadoForm({ ...feriadoForm, fecha: e.target.value })} />
                </label>

                <label>
                  Nombre
                  <input value={feriadoForm.nombre} onChange={(e) => setFeriadoForm({ ...feriadoForm, nombre: e.target.value })} placeholder="Ejemplo: Día del Trabajador" />
                </label>

                <label>
                  Descripción
                  <input value={feriadoForm.descripcion} onChange={(e) => setFeriadoForm({ ...feriadoForm, descripcion: e.target.value })} placeholder="Opcional" />
                </label>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingFeriado}>
                    {loadingFeriado ? (editingFeriadoId !== null ? "Actualizando..." : "Guardando...") : (editingFeriadoId !== null ? "Actualizar" : "Guardar")}
                  </button>

                  {editingFeriadoId !== null && (
                    <button type="button" onClick={resetFeriadoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de feriados</h3>

              <form onSubmit={handleFeriadoSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por fecha o nombre" value={feriadoSearch} onChange={(e) => setFeriadoSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setFeriadoSearch(""); loadFeriados("", incluirFeriadosInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirFeriadosInactivos} onChange={(e) => setIncluirFeriadosInactivos(e.target.checked)} />
                Incluir feriados inactivos
              </label>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Fecha</th><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {feriados.map((item) => (
                      <tr key={item.FeriadoId}>
                        <td>{item.FeriadoId}</td>
                        <td>{formatDate(item.Fecha)}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.Descripcion || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditFeriado(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteFeriado(item.FeriadoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Desactivar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateFeriado(item.FeriadoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!feriados.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay feriados registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "fechasClase" && (
  <div className="two-col">
    <section className="card" style={{ marginBottom: 0 }}>
      <h3>Generación automática de fechas de clase</h3>

      <form className="form" onSubmit={handleGenerarFechasAutomaticas}>
        <label>
          Materia por grupo
          <select
            value={fechaClaseForm.grupoMateriaId}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, grupoMateriaId: e.target.value })}
          >
            <option value="">Seleccione</option>
            {gruposMateriaActivas.map((item) => (
              <option key={item.GrupoMateriaId} value={item.GrupoMateriaId}>
                {item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""} / {item.MateriaNombre || ""} {item.PeriodoNombre ? `- ${item.PeriodoNombre}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Período
          <select
            value={fechaClaseForm.periodoId}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, periodoId: e.target.value })}
          >
            <option value="">Seleccione</option>
            {periodos.filter((p) => p.Activo).map((item) => (
              <option key={item.PeriodoId} value={item.PeriodoId}>
                {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""} {item.FechaInicio ? `(${formatDate(item.FechaInicio)} a ${formatDate(item.FechaFin)})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sesión inicial
          <select
            value={fechaClaseForm.bloqueHorarioIdInicial}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, bloqueHorarioIdInicial: e.target.value })}
          >
            <option value="">Seleccione</option>
            {bloquesCatalogo.map((item) => (
              <option key={item.BloqueHorarioId} value={item.BloqueHorarioId}>
                {item.Nombre} - {formatTime(item.HoraInicio)} a {formatTime(item.HoraFin)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Día de la semana
          <select
            value={fechaClaseForm.diaSemana}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, diaSemana: e.target.value })}
          >
            <option value="">Seleccione</option>
            <option value="2">Lunes</option>
            <option value="3">Martes</option>
            <option value="4">Miércoles</option>
            <option value="5">Jueves</option>
            <option value="6">Viernes</option>
            <option value="7">Sábado</option>
            <option value="1">Domingo</option>
          </select>
        </label>

        <label>
          Cantidad de lecciones por día
          <input
            type="number"
            min="1"
            value={fechaClaseForm.cantidadLeccionesPorDia}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, cantidadLeccionesPorDia: e.target.value })}
          />
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary-btn" disabled={loadingFechaClase}>
            {loadingFechaClase ? "Generando..." : "Generar automáticamente"}
          </button>
        </div>
      </form>

      <hr style={{ margin: "18px 0", opacity: 0.2 }} />

      <h3>Reprogramar desde una fecha</h3>

      <form className="form" onSubmit={handleReprogramarDesde}>
        <label>
          Materia por grupo
          <select
            value={fechaClaseForm.grupoMateriaId}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, grupoMateriaId: e.target.value })}
          >
            <option value="">Seleccione</option>
            {gruposMateriaActivas.map((item) => (
              <option key={item.GrupoMateriaId} value={item.GrupoMateriaId}>
                {item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""} / {item.MateriaNombre || ""} {item.PeriodoNombre ? `- ${item.PeriodoNombre}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Período
          <select
            value={fechaClaseForm.periodoId}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, periodoId: e.target.value })}
          >
            <option value="">Seleccione</option>
            {periodos.filter((p) => p.Activo).map((item) => (
              <option key={item.PeriodoId} value={item.PeriodoId}>
                {item.Nombre} {item.AnioNombre ? `- ${item.AnioNombre}` : ""} {item.FechaInicio ? `(${formatDate(item.FechaInicio)} a ${formatDate(item.FechaFin)})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Aplicar desde esta fecha
          <input
            type="date"
            value={fechaClaseForm.fechaDesde}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, fechaDesde: e.target.value })}
          />
        </label>

        <label>
          Nueva sesión inicial
          <select
            value={fechaClaseForm.bloqueHorarioIdInicialNuevo}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, bloqueHorarioIdInicialNuevo: e.target.value })}
          >
            <option value="">Seleccione</option>
            {bloquesCatalogo.map((item) => (
              <option key={item.BloqueHorarioId} value={item.BloqueHorarioId}>
                {item.Nombre} - {formatTime(item.HoraInicio)} a {formatTime(item.HoraFin)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Nuevo día
          <select
            value={fechaClaseForm.diaSemanaNuevo}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, diaSemanaNuevo: e.target.value })}
          >
            <option value="">Seleccione</option>
            <option value="2">Lunes</option>
            <option value="3">Martes</option>
            <option value="4">Miércoles</option>
            <option value="5">Jueves</option>
            <option value="6">Viernes</option>
            <option value="7">Sábado</option>
            <option value="1">Domingo</option>
          </select>
        </label>

        <label>
          Nueva cantidad de lecciones por día
          <input
            type="number"
            min="1"
            value={fechaClaseForm.cantidadLeccionesPorDiaNueva}
            onChange={(e) => setFechaClaseForm({ ...fechaClaseForm, cantidadLeccionesPorDiaNueva: e.target.value })}
          />
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary-btn" disabled={loadingFechaClase}>
            {loadingFechaClase ? "Reprogramando..." : "Reprogramar desde fecha"}
          </button>
        </div>
      </form>
    </section>

    <section className="card" style={{ marginBottom: 0 }}>
      <h3>Listado de fechas de clase</h3>

      <form onSubmit={handleFechaClaseSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          placeholder="Buscar por grupo, materia, período o fecha"
          value={fechaClaseSearch}
          onChange={(e) => setFechaClaseSearch(e.target.value)}
          style={{ flex: 1, minWidth: "240px" }}
        />
        <button className="primary-btn" type="submit">Buscar</button>
        <button
          type="button"
          onClick={() => { setFechaClaseSearch(""); loadFechasClase(""); }}
          style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
        >
          Limpiar
        </button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Grupo</th>
              <th>Materia</th>
              <th>Período</th>
              <th>Bloque</th>
              <th>Día</th>
              <th>Extraordinaria</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {fechasClase.map((item) => (
              <tr key={item.FechaClaseId}>
                <td>{item.FechaClaseId}</td>
                <td>{formatDate(item.Fecha)}</td>
                <td>{item.GrupoNombre || ""} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                <td>{item.MateriaNombre || ""}</td>
                <td>{item.PeriodoNombre || ""}</td>
                <td>{item.BloqueNombre || ""} {item.HoraInicio ? `(${formatTime(item.HoraInicio)} - ${formatTime(item.HoraFin)})` : ""}</td>
                <td>{diaSemanaLabel(item.DiaSemana)}</td>
                <td>{item.EsExtraordinaria ? "Sí" : "No"}</td>
                <td>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => handleDeleteFechaClase(item.FechaClaseId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!fechasClase.length && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>
                  No hay fechas de clase registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  </div>
)}
        
      </section>
    </div>
  );
}