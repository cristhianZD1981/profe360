import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/http";
import EvaluacionParametrizacionPage from "./EvaluacionParametrizacionPage";
import HabilidadesPlaneamientoAcademicoPage from "./HabilidadesPlaneamientoAcademicoPage";

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
  EspecialidadId?: number | null;
  Especialidad?: string | null;
  EspecialidadDescripcion?: string | null;
  PermiteMultiplesPorSeccion?: boolean;
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

type MatriculaImportResultRow = {
  fila: number;
  cedula: string;
  seccion: string;
  estudiante?: string | null;
  grupo?: string | null;
  matriculaId?: number | null;
  estado: "CREADO" | "ACTUALIZADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
  motivo: string;
};

type MatriculaImportResult = {
  totalRegistros: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalActualizados: number;
  totalReactivados: number;
  totalOmitidos: number;
  resultados: MatriculaImportResultRow[];
};

type MatriculaImportProgress = MatriculaImportResult & {
  jobId: string;
  status: "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";
  procesados: number;
  porcentaje: number;
  error?: string | null;
};

type AcademicoBulkImportKey =
  | "grupos"
  | "materias"
  | "asignaciones-docentes"
  | "grupos-materia"
  | "horarios-grupo"
  | "feriados";

type AcademicoBulkImportRow = {
  fila: number;
  referencia: string;
  estado: "CREADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
  motivo: string;
};

type AcademicoBulkImportResult = {
  totalRegistros: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalReactivados: number;
  totalOmitidos: number;
  resultados: AcademicoBulkImportRow[];
};

type AcademicoBulkImportProgress = AcademicoBulkImportResult & {
  jobId: string;
  status: "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";
  procesados: number;
  porcentaje: number;
  error?: string | null;
};

type Materia = {
  MateriaId: number;
  InstitucionId?: number;
  Codigo: string | null;
  Nombre: string;
  Descripcion: string | null;
  EsMateriaEspecial?: boolean;
  Activo: boolean;
};

type Especialidad = {
  EspecialidadId: number;
  InstitucionId?: number;
  Descripcion: string;
  PermiteMultiplesPorSeccion: boolean;
  Activo: boolean;
};

type TipoEstudiante = {
  TipoEstudianteId: number;
  InstitucionId?: number;
  Descripcion: string;
  Activo: boolean;
};

type TipoAdecuacion = {
  TipoAdecuacionId: number;
  InstitucionId?: number;
  Descripcion: string;
  Activo: boolean;
};

type AdecuacionItem = {
  AdecuacionCatalogoId: number;
  InstitucionId?: number;
  TipoAdecuacionId: number;
  Adecuacion: string;
  Tipo: string;
  Descripcion: string;
  Activo: boolean;
};

type RutaTransporte = {
  RutaTransporteId: number;
  InstitucionId?: number;
  Descripcion: string;
  Responsable: string | null;
  LugarInicio: string | null;
  LugarFin: string | null;
  CapacidadEstudiantes: number | null;
  HoraInicio: string | null;
  HoraFin: string | null;
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

type FechaClaseSyncItem = {
  FechaClaseId: number | null;
  HorarioGrupoId: number;
  GrupoMateriaId: number;
  GrupoId: number;
  GrupoNombre: string;
  GrupoNivel: string | null;
  MateriaNombre: string;
  PeriodoId: number | null;
  PeriodoNombre: string;
  Fecha: string;
  BloqueHorarioId: number;
  BloqueNombre: string;
  DiaSemana: number;
  DiaSemanaNombre: string;
  TieneAsistencia: boolean;
  Motivo?: string | null;
};

type FechaClaseSyncPreview = {
  periodo: {
    PeriodoId: number;
    Nombre: string;
    FechaInicio: string;
    FechaFin: string;
  };
  fechaCorteSolicitada: string | null;
  fechaCorteAplicada: string;
  resumen: {
    horariosActivos: number;
    totalEsperadas: number;
    crear: number;
    mantener: number;
    eliminar: number;
    bloqueadasPorAsistencia: number;
    conflictos: number;
  };
  crear: FechaClaseSyncItem[];
  mantener: FechaClaseSyncItem[];
  eliminar: FechaClaseSyncItem[];
  bloqueadas: FechaClaseSyncItem[];
  conflictos: FechaClaseSyncItem[];
  aplicado?: {
    crear: number;
    eliminar: number;
  };
};

type MensajeSeguimiento = {
  MensajeSeguimientoId: number;
  TipoUso: "COTIDIANO" | "TAREA" | "ASISTENCIA" | "EXAMEN";
  ValorNivel: number | null;
  Titulo: string | null;
  Cuerpo: string;
  Activo: boolean;
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
  especialidadId: "",
  especialidad: "",
  seccionTexto: "",
  rutaTransporte: "",
  esRepitente: false,
  permiteExcepcionProgresion: false,
  justificacionExcepcion: "",
  correoEnvioBoleta: "",
  observacionesDetalle: ""
};

type AcademicoNavigationState = {
  openTab?: TabKey;
  matriculaPrefill?: Partial<typeof initialMatriculaForm> & {
    estudianteId?: string | number;
    grupoId?: string | number;
    anioLectivoId?: string | number;
  };
};

type AcademicoPageProps = {
  initialTab?: TabKey;
  visibleTabs?: TabKey[];
};


function normalizeNivelParaCiclo(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function getCicloPorNivel(value: any) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeNivelParaCiclo(raw);

  const numeroMatch = normalized.match(/\d+/);
  const numero = numeroMatch ? Number(numeroMatch[0]) : null;

  if (
    numero !== null &&
    numero >= 1 &&
    numero <= 3
  ) {
    return "Primer Ciclo";
  }

  if (
    numero !== null &&
    numero >= 4 &&
    numero <= 6
  ) {
    return "Segundo Ciclo";
  }

  if (
    numero !== null &&
    numero >= 7 &&
    numero <= 9
  ) {
    return "Tercer Ciclo";
  }

  if (
    numero !== null &&
    numero >= 10 &&
    numero <= 12
  ) {
    return "Cuarto Ciclo";
  }

  if (["PRIMERO", "SEGUNDO", "TERCERO"].some((nivel) => normalized.includes(nivel))) return "Primer Ciclo";
  if (["CUARTO", "QUINTO", "SEXTO"].some((nivel) => normalized.includes(nivel))) return "Segundo Ciclo";
  if (["SETIMO", "SEPTIMO", "OCTAVO", "NOVENO"].some((nivel) => normalized.includes(nivel))) return "Tercer Ciclo";
  if (["DECIMO", "UNDECIMO", "UNDECIMO", "DUODECIMO", "DUODECIMO"].some((nivel) => normalized.includes(nivel))) return "Cuarto Ciclo";

  return "Sin ciclo definido";
}

const initialMateriaForm = {
  codigo: "",
  nombre: "",
  descripcion: "",
  esMateriaEspecial: false
};

type CorreoNotificacionConfig = {
  TipoUso: string;
  FromEmail?: string | null;
  ParaModo?: string | null;
  CcModo?: string | null;
  AsuntoTemplate?: string | null;
  CuerpoTemplate?: string | null;
};

const initialMensajeSeguimientoForm = {
  tipoUso: "COTIDIANO",
  valorNivel: "",
  titulo: "",
  cuerpo: ""
};

function getEtiquetaNivelMensaje(tipoUso: string, valorNivel: number | null | undefined) {
  if (valorNivel === null || valorNivel === undefined) return "General";
  if (String(tipoUso || "").toUpperCase() === "ASISTENCIA") {
    if (Number(valorNivel) === 1) return "Ausencia";
    if (Number(valorNivel) === 2) return "Tardía";
  }
  if (String(tipoUso || "").toUpperCase() === "TAREA" && Number(valorNivel) === 0) return "No entregado";
  if (Number(valorNivel) === 1) return "Inicial";
  if (Number(valorNivel) === 2) return "Intermedio";
  if (Number(valorNivel) === 3) return "Avanzado";
  return String(valorNivel);
}

const initialEspecialidadForm = {
  descripcion: "",
  permiteMultiplesPorSeccion: false
};

const initialTipoEstudianteForm = {
  descripcion: ""
};

const initialTipoAdecuacionForm = {
  descripcion: ""
};

const initialAdecuacionForm = {
  tipoAdecuacionId: "",
  tipo: "",
  descripcion: ""
};

const initialRutaTransporteForm = {
  descripcion: "",
  responsable: "",
  lugarInicio: "",
  lugarFin: "",
  capacidadEstudiantes: "",
  horaInicio: "",
  horaFin: ""
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

const initialFechaClaseSyncForm = {
  periodoId: "",
  fechaCorte: ""
};

const academicoBulkImportLabels: Record<AcademicoBulkImportKey, { title: string; filename: string }> = {
  grupos: { title: "grupos", filename: "plantilla_importacion_grupos.xlsx" },
  materias: { title: "materias", filename: "plantilla_importacion_materias.xlsx" },
  "asignaciones-docentes": { title: "asignaciones docentes", filename: "plantilla_importacion_asignaciones_docentes.xlsx" },
  "grupos-materia": { title: "materias por grupo", filename: "plantilla_importacion_materias_por_grupo.xlsx" },
  "horarios-grupo": { title: "horarios de clase", filename: "plantilla_importacion_horarios_clase.xlsx" },
  feriados: { title: "feriados", filename: "plantilla_importacion_feriados.xlsx" }
};

const initialAcademicoBulkImportFiles: Record<AcademicoBulkImportKey, File | null> = {
  grupos: null,
  materias: null,
  "asignaciones-docentes": null,
  "grupos-materia": null,
  "horarios-grupo": null,
  feriados: null
};

const initialAcademicoBulkImportBooleanState: Record<AcademicoBulkImportKey, boolean> = {
  grupos: false,
  materias: false,
  "asignaciones-docentes": false,
  "grupos-materia": false,
  "horarios-grupo": false,
  feriados: false
};

const initialAcademicoBulkImportProgressState: Record<AcademicoBulkImportKey, AcademicoBulkImportProgress | null> = {
  grupos: null,
  materias: null,
  "asignaciones-docentes": null,
  "grupos-materia": null,
  "horarios-grupo": null,
  feriados: null
};

const initialAcademicoBulkImportResultState: Record<AcademicoBulkImportKey, AcademicoBulkImportResult | null> = {
  grupos: null,
  materias: null,
  "asignaciones-docentes": null,
  "grupos-materia": null,
  "horarios-grupo": null,
  feriados: null
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
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTeacherFullName(item: {
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
}) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
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
  | "tiposEstudiante"
  | "tiposAdecuacion"
  | "adecuaciones"
  | "especialidades"
  | "rutasTransporte"
  | "evaluacion"
  | "materias"
  | "asignaciones"
  | "bloques"
  | "gruposMateria"
  | "horarios"
  | "fechasClase"
  | "feriados"
  | "diasLectivos"
  | "configuracionCorreo"
  | "habilidadesPlaneamiento"
  | "mensajes";


type FormSectionKey =
  | "anios"
  | "periodos"
  | "grupos"
  | "matriculas"
  | "tiposEstudiante"
  | "tiposAdecuacion"
  | "adecuaciones"
  | "especialidades"
  | "rutasTransporte"
  | "materias"
  | "asignaciones"
  | "bloques"
  | "gruposMateria"
  | "horarios"
  | "feriados"
  | "diasLectivos"
  | "configuracionCorreo";

const initialOpenSections: Record<FormSectionKey, boolean> = {
  anios: false,
  periodos: false,
  grupos: false,
  matriculas: false,
  tiposEstudiante: false,
  tiposAdecuacion: false,
  adecuaciones: false,
  especialidades: false,
  rutasTransporte: false,
  materias: false,
  asignaciones: false,
  bloques: false,
  gruposMateria: false,
  horarios: false,
  feriados: false,
  diasLectivos: false,
  configuracionCorreo: false
};

export default function AcademicoPage({ initialTab = "anios", visibleTabs }: AcademicoPageProps) {
  const location = useLocation();
  const consumedNavigationKeyRef = useRef<string | null>(null);
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [anios, setAnios] = useState<AnioLectivo[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudianteCatalogo[]>([]);
  const [gruposCatalogo, setGruposCatalogo] = useState<Grupo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [tiposEstudiante, setTiposEstudiante] = useState<TipoEstudiante[]>([]);
  const [tiposAdecuacion, setTiposAdecuacion] = useState<TipoAdecuacion[]>([]);
  const [adecuaciones, setAdecuaciones] = useState<AdecuacionItem[]>([]);
  const [especialidadesCatalogo, setEspecialidadesCatalogo] = useState<Especialidad[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [rutasTransporteCatalogo, setRutasTransporteCatalogo] = useState<RutaTransporte[]>([]);
  const [rutasTransporte, setRutasTransporte] = useState<RutaTransporte[]>([]);
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
  const [mensajesSeguimiento, setMensajesSeguimiento] = useState<MensajeSeguimiento[]>([]);

  const [anioForm, setAnioForm] = useState(initialAnioForm);
  const [periodoForm, setPeriodoForm] = useState(initialPeriodoForm);
  const [grupoForm, setGrupoForm] = useState(initialGrupoForm);
  const [matriculaForm, setMatriculaForm] = useState(initialMatriculaForm);
  const [tipoEstudianteForm, setTipoEstudianteForm] = useState(initialTipoEstudianteForm);
  const [tipoAdecuacionForm, setTipoAdecuacionForm] = useState(initialTipoAdecuacionForm);
  const [adecuacionForm, setAdecuacionForm] = useState(initialAdecuacionForm);
  const [especialidadForm, setEspecialidadForm] = useState(initialEspecialidadForm);
  const [rutaTransporteForm, setRutaTransporteForm] = useState(initialRutaTransporteForm);
  const [materiaForm, setMateriaForm] = useState(initialMateriaForm);
  const [asignacionForm, setAsignacionForm] = useState(initialAsignacionForm);
  const [bloqueForm, setBloqueForm] = useState(initialBloqueForm);
  const [grupoMateriaForm, setGrupoMateriaForm] = useState(initialGrupoMateriaForm);
  const [horarioForm, setHorarioForm] = useState(initialHorarioForm);
  const [fechaClaseForm, setFechaClaseForm] = useState(initialFechaClaseForm);
  const [fechaClaseSyncForm, setFechaClaseSyncForm] = useState(() => ({
    ...initialFechaClaseSyncForm,
    fechaCorte: formatDate(new Date().toISOString())
  }));
  const [fechaClaseSyncPreview, setFechaClaseSyncPreview] = useState<FechaClaseSyncPreview | null>(null);
  const [feriadoForm, setFeriadoForm] = useState({ fecha: "", nombre: "", descripcion: "" });
  const [mensajeSeguimientoForm, setMensajeSeguimientoForm] = useState(initialMensajeSeguimientoForm);

  const [editingAnioId, setEditingAnioId] = useState<number | null>(null);
  const [editingPeriodoId, setEditingPeriodoId] = useState<number | null>(null);
  const [editingGrupoId, setEditingGrupoId] = useState<number | null>(null);
  const [editingMatriculaId, setEditingMatriculaId] = useState<number | null>(null);
  const [editingTipoEstudianteId, setEditingTipoEstudianteId] = useState<number | null>(null);
  const [editingTipoAdecuacionId, setEditingTipoAdecuacionId] = useState<number | null>(null);
  const [editingAdecuacionId, setEditingAdecuacionId] = useState<number | null>(null);
  const [editingEspecialidadId, setEditingEspecialidadId] = useState<number | null>(null);
  const [editingRutaTransporteId, setEditingRutaTransporteId] = useState<number | null>(null);
  const [editingMateriaId, setEditingMateriaId] = useState<number | null>(null);
  const [editingAsignacionId, setEditingAsignacionId] = useState<number | null>(null);
  const [editingBloqueId, setEditingBloqueId] = useState<number | null>(null);
  const [editingGrupoMateriaId, setEditingGrupoMateriaId] = useState<number | null>(null);
  const [editingHorarioId, setEditingHorarioId] = useState<number | null>(null);
  const [editingFechaClaseId, setEditingFechaClaseId] = useState<number | null>(null);
  const [editingFeriadoId, setEditingFeriadoId] = useState<number | null>(null);
  const [editingMensajeSeguimientoId, setEditingMensajeSeguimientoId] = useState<number | null>(null);

  const [reactivableMatriculaId, setReactivableMatriculaId] = useState<number | null>(null);
  const [matriculaImportAnioId, setMatriculaImportAnioId] = useState("");
  const [archivoImportacionMatricula, setArchivoImportacionMatricula] = useState<File | null>(null);
  const [importandoMatriculas, setImportandoMatriculas] = useState(false);
  const [matriculaImportResult, setMatriculaImportResult] = useState<MatriculaImportResult | null>(null);
  const [matriculaImportProgress, setMatriculaImportProgress] = useState<MatriculaImportProgress | null>(null);
  const matriculaImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [academicoBulkImportFiles, setAcademicoBulkImportFiles] = useState<Record<AcademicoBulkImportKey, File | null>>(initialAcademicoBulkImportFiles);
  const [academicoBulkImportLoading, setAcademicoBulkImportLoading] = useState<Record<AcademicoBulkImportKey, boolean>>(initialAcademicoBulkImportBooleanState);
  const [academicoBulkImportProgress, setAcademicoBulkImportProgress] = useState<Record<AcademicoBulkImportKey, AcademicoBulkImportProgress | null>>(initialAcademicoBulkImportProgressState);
  const [academicoBulkImportResult, setAcademicoBulkImportResult] = useState<Record<AcademicoBulkImportKey, AcademicoBulkImportResult | null>>(initialAcademicoBulkImportResultState);
  const academicoBulkImportFileRefs = useRef<Record<AcademicoBulkImportKey, HTMLInputElement | null>>({
    grupos: null,
    materias: null,
    "asignaciones-docentes": null,
    "grupos-materia": null,
    "horarios-grupo": null,
    feriados: null
  });

  const [anioSearch, setAnioSearch] = useState("");
  const [periodoSearch, setPeriodoSearch] = useState("");
  const [grupoSearch, setGrupoSearch] = useState("");
  const [matriculaSearch, setMatriculaSearch] = useState("");
  const [matriculaHasSearched, setMatriculaHasSearched] = useState(false);
  const [tipoEstudianteSearch, setTipoEstudianteSearch] = useState("");
  const [tipoAdecuacionSearch, setTipoAdecuacionSearch] = useState("");
  const [adecuacionSearch, setAdecuacionSearch] = useState("");
  const [especialidadSearch, setEspecialidadSearch] = useState("");
  const [rutaTransporteSearch, setRutaTransporteSearch] = useState("");
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
  const [incluirTiposEstudianteInactivos, setIncluirTiposEstudianteInactivos] = useState(false);
  const [incluirTiposAdecuacionInactivos, setIncluirTiposAdecuacionInactivos] = useState(false);
  const [incluirAdecuacionesInactivas, setIncluirAdecuacionesInactivas] = useState(false);
  const [incluirEspecialidadesInactivas, setIncluirEspecialidadesInactivas] = useState(false);
  const [incluirRutasTransporteInactivas, setIncluirRutasTransporteInactivas] = useState(false);
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
  const [loadingTipoEstudiante, setLoadingTipoEstudiante] = useState(false);
  const [loadingTipoAdecuacion, setLoadingTipoAdecuacion] = useState(false);
  const [loadingAdecuacion, setLoadingAdecuacion] = useState(false);
  const [loadingEspecialidad, setLoadingEspecialidad] = useState(false);
  const [loadingRutaTransporte, setLoadingRutaTransporte] = useState(false);
  const [loadingMateria, setLoadingMateria] = useState(false);
  const [loadingAsignacion, setLoadingAsignacion] = useState(false);
  const [loadingBloque, setLoadingBloque] = useState(false);
  const [loadingGrupoMateria, setLoadingGrupoMateria] = useState(false);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [loadingFechaClase, setLoadingFechaClase] = useState(false);
  const [loadingFechaClaseSync, setLoadingFechaClaseSync] = useState(false);
  const [loadingFeriado, setLoadingFeriado] = useState(false);
  const [loadingDiasLectivos, setLoadingDiasLectivos] = useState(false);
  const [loadingMensajesSeguimiento, setLoadingMensajesSeguimiento] = useState(false);
  const [correoEstudianteDominio, setCorreoEstudianteDominio] = useState("@est.mep.go.cr");
  const [correoEstudianteDominioGuardado, setCorreoEstudianteDominioGuardado] = useState("@est.mep.go.cr");
  const [loadingConfigCorreo, setLoadingConfigCorreo] = useState(false);
  const [correoNotificacionConfigs, setCorreoNotificacionConfigs] = useState<CorreoNotificacionConfig[]>([]);
  const [correoNotificacionTipo, setCorreoNotificacionTipo] = useState("COTIDIANO");
  const [correoNotificacionMinimizado, setCorreoNotificacionMinimizado] = useState(true);
  const [correoNotificacionForm, setCorreoNotificacionForm] = useState({
    fromEmail: "info@profe360cr.com",
    paraModo: "ALUMNO",
    ccModo: "PROFESOR",
    asuntoTemplate: "",
    cuerpoTemplate: ""
  });
  const [boletaConductaConsecutivo, setBoletaConductaConsecutivo] = useState("1");
  const [openSections, setOpenSections] = useState<Record<FormSectionKey, boolean>>(initialOpenSections);

  function openSection(section: FormSectionKey) {
    setOpenSections((prev) => ({ ...prev, [section]: true }));
  }

  function closeSection(section: FormSectionKey) {
    setOpenSections((prev) => ({ ...prev, [section]: false }));
  }

  function isSectionOpen(section: FormSectionKey) {
    return openSections[section];
  }

  const gruposActivos = useMemo(
    () => gruposCatalogo.filter((g) => g.Activo),
    [gruposCatalogo]
  );

  const aniosActivos = useMemo(
    () => anios.filter((a) => a.Activo),
    [anios]
  );

  const especialidadesActivas = useMemo(
    () => especialidadesCatalogo.filter((e) => e.Activo),
    [especialidadesCatalogo]
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
    setEspecialidadesCatalogo(data.especialidades || []);
    setTiposEstudiante(data.tiposEstudiante || []);
    setTiposAdecuacion(data.tiposAdecuacion || []);
    setRutasTransporteCatalogo(data.rutasTransporte || []);
    setMateriasCatalogo(data.materias || []);
    setDocentesCatalogo(data.docentes || []);
    setBloquesCatalogo(data.bloquesHorarios || []);
    setFeriados(data.feriados || []);
    setDiasLectivos(data.diasLectivos || []);
    const dominioConfigurado = String(data.configuracionCorreoEstudiante?.dominio || "@est.mep.go.cr");
    setCorreoEstudianteDominio(dominioConfigurado);
    setCorreoEstudianteDominioGuardado(dominioConfigurado);
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
    const cleanQuery = String(query || "").trim();

    if (!cleanQuery) {
      setMatriculas([]);
      setMatriculaHasSearched(false);
      return;
    }

    const response = await api.get("/academico/matriculas", {
      params: { q: cleanQuery, incluirInactivas }
    });
    setMatriculas(response.data?.data || []);
    setMatriculaHasSearched(true);
  }

  async function loadEspecialidades(query = "", incluirInactivas = incluirEspecialidadesInactivas) {
    const response = await api.get("/academico/especialidades", {
      params: { q: query, incluirInactivas }
    });
    setEspecialidades(response.data?.data || []);
  }

  async function loadTiposEstudiante(query = "", incluirInactivos = incluirTiposEstudianteInactivos) {
    const response = await api.get("/academico/tipos-estudiante", {
      params: { q: query, incluirInactivos }
    });
    setTiposEstudiante(response.data?.data || []);
  }

  async function loadTiposAdecuacion(query = "", incluirInactivos = incluirTiposAdecuacionInactivos) {
    const response = await api.get("/academico/tipos-adecuacion", {
      params: { q: query, incluirInactivos }
    });
    setTiposAdecuacion(response.data?.data || []);
  }

  async function loadAdecuaciones(query = "", incluirInactivos = incluirAdecuacionesInactivas) {
    const response = await api.get("/academico/adecuaciones", {
      params: { q: query, incluirInactivos }
    });
    setAdecuaciones(response.data?.data || []);
  }

  async function loadRutasTransporte(query = "", incluirInactivas = incluirRutasTransporteInactivas) {
    const response = await api.get("/academico/rutas-transporte", {
      params: { q: query, incluirInactivas }
    });
    setRutasTransporte(response.data?.data || []);
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

  async function loadMensajesSeguimiento() {
    const response = await api.get("/academico/mensajes-seguimiento");
    setMensajesSeguimiento(response.data?.data || []);
  }

  async function loadCorreoNotificacionConfigs() {
    const response = await api.get("/academico/configuracion-correo-notificaciones");
    const data = response.data?.data || [];
    setCorreoNotificacionConfigs(data);
  }

  async function loadBoletaConductaConfig() {
    const response = await api.get("/academico/boleta-conducta-config");
    const data = response.data?.data || {};
    setBoletaConductaConsecutivo(String(data?.siguienteNumero || 1));
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
      closeSection("diasLectivos");
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

  async function handleCancelarDiasLectivos() {
    clearMessages();
    await loadDiasLectivos();
    closeSection("diasLectivos");
  }

  function handleCancelarConfigCorreo() {
    clearMessages();
    setCorreoEstudianteDominio(correoEstudianteDominioGuardado);
    closeSection("configuracionCorreo");
  }

  async function loadAll() {
    try {
      setErrorMessage("");

      // Importante: antes se cargaban todos los endpoints académicos al mismo tiempo.
      // Eso saturaba SQL Server y provocaba timeouts de 15 segundos en catálogos.
      // Ahora se cargan los catálogos base y luego cada pestaña carga su listado cuando se abre.
      await loadCatalogos();
    } catch (error: any) {
      console.error("Error cargando catálogos académicos:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar el módulo académico"
      );
    }
  }

  async function loadTabData(tabToLoad: TabKey) {
    try {
      setErrorMessage("");

      switch (tabToLoad) {
        case "anios":
          await loadAnios(anioSearch, incluirAniosInactivos);
          break;
        case "periodos":
          await loadPeriodos(periodoSearch, incluirPeriodosInactivos);
          break;
        case "grupos":
          await loadGrupos(grupoSearch, incluirGruposInactivos);
          break;
        case "matriculas":
          await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
          break;
        case "tiposEstudiante":
          await loadTiposEstudiante(tipoEstudianteSearch, incluirTiposEstudianteInactivos);
          break;
        case "tiposAdecuacion":
          await loadTiposAdecuacion(tipoAdecuacionSearch, incluirTiposAdecuacionInactivos);
          break;
        case "adecuaciones":
          await loadAdecuaciones(adecuacionSearch, incluirAdecuacionesInactivas);
          break;
        case "especialidades":
          await loadEspecialidades(especialidadSearch, incluirEspecialidadesInactivas);
          break;
        case "rutasTransporte":
          await loadRutasTransporte(rutaTransporteSearch, incluirRutasTransporteInactivas);
          break;
        case "materias":
          await loadMaterias(materiaSearch, incluirMateriasInactivas);
          break;
        case "asignaciones":
          await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
          break;
        case "bloques":
          await loadBloques(bloqueSearch);
          break;
        case "gruposMateria":
          await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
          break;
        case "horarios":
          await loadHorarios(horarioSearch, incluirHorariosInactivos);
          break;
        case "fechasClase":
          await loadFechasClase(fechaClaseSearch);
          break;
        case "feriados":
          await loadFeriados(feriadoSearch, incluirFeriadosInactivos);
          break;
        case "diasLectivos":
          await loadDiasLectivos();
          break;
        case "configuracionCorreo":
          await Promise.all([loadCatalogos(), loadCorreoNotificacionConfigs(), loadBoletaConductaConfig()]);
          break;
        case "mensajes":
          await Promise.all([loadMensajesSeguimiento(), loadCorreoNotificacionConfigs(), loadBoletaConductaConfig()]);
          break;
        default:
          break;
      }
    } catch (error: any) {
      console.error(`Error cargando pestaña académica ${tabToLoad}:`, error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo cargar la información de esta sección"
      );
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadTabData(tab);
  }, [tab]);

  useEffect(() => {
    const navigationState = (location.state || null) as AcademicoNavigationState | null;

    if (!navigationState) return;
    if (consumedNavigationKeyRef.current === location.key) return;

    if (navigationState.openTab !== "matriculas" && !navigationState.matriculaPrefill) return;

    const hasRequestedAnio =
      navigationState.matriculaPrefill?.anioLectivoId !== undefined &&
      navigationState.matriculaPrefill?.anioLectivoId !== null &&
      String(navigationState.matriculaPrefill?.anioLectivoId) !== "";

    if (!hasRequestedAnio && anios.length === 0) return;

    consumedNavigationKeyRef.current = location.key;
    openMatriculaPrefilled(navigationState.matriculaPrefill);
  }, [location.key, location.state, anios.length]);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function buildTodayForInput() {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const local = new Date(today.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 10);
  }


  function openMatriculaPrefilled(prefill?: AcademicoNavigationState["matriculaPrefill"]) {
    clearMessages();
    setTab("matriculas");
    openSection("matriculas");
    setEditingMatriculaId(null);
    setReactivableMatriculaId(null);

    const defaultAnioId =
      prefill?.anioLectivoId !== undefined && prefill?.anioLectivoId !== null && String(prefill.anioLectivoId) !== ""
        ? String(prefill.anioLectivoId)
        : aniosActivos.length > 0
          ? String(aniosActivos[0].AnioLectivoId)
          : "";

    setMatriculaForm({
      ...initialMatriculaForm,
      estudianteId:
        prefill?.estudianteId !== undefined && prefill?.estudianteId !== null
          ? String(prefill.estudianteId)
          : "",
      grupoId:
        prefill?.grupoId !== undefined && prefill?.grupoId !== null
          ? String(prefill.grupoId)
          : "",
      anioLectivoId: defaultAnioId,
      fechaMatricula: prefill?.fechaMatricula || buildTodayForInput(),
      observacion: prefill?.observacion || "",
      tipoMatricula: prefill?.tipoMatricula || "",
      especialidadId:
        prefill?.especialidadId !== undefined && prefill?.especialidadId !== null && String(prefill.especialidadId) !== ""
          ? String(prefill.especialidadId)
          : "",
      nivelAcademico:
        prefill?.nivelAcademico !== undefined && prefill?.nivelAcademico !== null && String(prefill.nivelAcademico) !== ""
          ? String(prefill.nivelAcademico)
          : "",
      especialidad: prefill?.especialidad || "",
      seccionTexto: prefill?.seccionTexto || "",
      rutaTransporte: prefill?.rutaTransporte || "",
      esRepitente: !!prefill?.esRepitente,
      permiteExcepcionProgresion: !!prefill?.permiteExcepcionProgresion,
      justificacionExcepcion: prefill?.justificacionExcepcion || "",
      correoEnvioBoleta: prefill?.correoEnvioBoleta || "",
      observacionesDetalle: prefill?.observacionesDetalle || ""
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetAnioForm() {
    setAnioForm(initialAnioForm);
    setEditingAnioId(null);
    closeSection("anios");
  }

  function resetPeriodoForm() {
    setPeriodoForm(initialPeriodoForm);
    setEditingPeriodoId(null);
    closeSection("periodos");
  }

  function resetGrupoForm() {
    setGrupoForm(initialGrupoForm);
    setEditingGrupoId(null);
    closeSection("grupos");
  }

function resetMatriculaForm() {
  setMatriculaForm(initialMatriculaForm);
  setEditingMatriculaId(null);
  setReactivableMatriculaId(null);
  closeSection("matriculas");
}

  function resetTipoEstudianteForm() {
    setTipoEstudianteForm(initialTipoEstudianteForm);
    setEditingTipoEstudianteId(null);
    closeSection("tiposEstudiante");
  }

  function resetTipoAdecuacionForm() {
    setTipoAdecuacionForm(initialTipoAdecuacionForm);
    setEditingTipoAdecuacionId(null);
    closeSection("tiposAdecuacion");
  }

  function resetAdecuacionForm() {
    setAdecuacionForm(initialAdecuacionForm);
    setEditingAdecuacionId(null);
    closeSection("adecuaciones");
  }

  function resetEspecialidadForm() {
    setEspecialidadForm(initialEspecialidadForm);
    setEditingEspecialidadId(null);
    closeSection("especialidades");
  }

  function resetRutaTransporteForm() {
    setRutaTransporteForm(initialRutaTransporteForm);
    setEditingRutaTransporteId(null);
    closeSection("rutasTransporte");
  }

  function resetMateriaForm() {
    setMateriaForm(initialMateriaForm);
    setEditingMateriaId(null);
    closeSection("materias");
  }

  function resetAsignacionForm() {
    setAsignacionForm(initialAsignacionForm);
    setEditingAsignacionId(null);
    closeSection("asignaciones");
  }

  function resetBloqueForm() {
    setBloqueForm(initialBloqueForm);
    setEditingBloqueId(null);
    closeSection("bloques");
  }

  function resetGrupoMateriaForm() {
    setGrupoMateriaForm(initialGrupoMateriaForm);
    setEditingGrupoMateriaId(null);
    closeSection("gruposMateria");
  }

  function resetHorarioForm() {
    setHorarioForm(initialHorarioForm);
    setEditingHorarioId(null);
    closeSection("horarios");
  }

  function resetFechaClaseForm() {
    setFechaClaseForm(initialFechaClaseForm);
    setEditingFechaClaseId(null);
  }

  function resetFechaClaseSyncForm() {
    setFechaClaseSyncForm({
      ...initialFechaClaseSyncForm,
      fechaCorte: formatDate(new Date().toISOString())
    });
    setFechaClaseSyncPreview(null);
  }

  function resetFeriadoForm() {
    setFeriadoForm({ fecha: "", nombre: "", descripcion: "" });
    setEditingFeriadoId(null);
    closeSection("feriados");
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
        especialidadId: matriculaForm.especialidadId ? Number(matriculaForm.especialidadId) : null,
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

  async function handleDescargarPlantillaMatriculas() {
    try {
      clearMessages();
      const response = await api.get("/academico/matriculas/plantilla-excel", {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_importacion_matriculas.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Plantilla de matrículas descargada correctamente");
    } catch (error: any) {
      console.error("Error descargando plantilla de matrículas:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo descargar la plantilla de matrículas");
    }
  }

  async function runImportarMatriculas() {
    if (!matriculaImportAnioId) {
      setErrorMessage("Debes seleccionar el año lectivo para la importación");
      return;
    }

    if (!archivoImportacionMatricula) {
      setErrorMessage("Debes seleccionar un archivo Excel para importar");
      return;
    }

    setImportandoMatriculas(true);
    clearMessages();
    setMatriculaImportResult(null);
    setMatriculaImportProgress({
      jobId: "pending-local",
      status: "PENDIENTE",
      totalRegistros: 0,
      totalOk: 0,
      totalError: 0,
      totalCreados: 0,
      totalActualizados: 0,
      totalReactivados: 0,
      totalOmitidos: 0,
      resultados: [],
      procesados: 0,
      porcentaje: 0,
      error: null
    });

    try {
      const formData = new FormData();
      formData.append("anioLectivoId", matriculaImportAnioId);
      formData.append("archivo", archivoImportacionMatricula);

      const response = await api.post("/academico/matriculas/importar-excel/iniciar", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const initialProgress: MatriculaImportProgress = response.data?.data;
      const jobId = initialProgress?.jobId;

      if (!jobId) {
        throw new Error("No se recibió el identificador de la importación");
      }

      setMatriculaImportProgress(initialProgress);

      let finalProgress = initialProgress;
      while (!["COMPLETADO", "ERROR"].includes(finalProgress.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const progressResponse = await api.get(`/academico/matriculas/importar-excel/progreso/${jobId}`);
        finalProgress = progressResponse.data?.data;
        setMatriculaImportProgress(finalProgress);
      }

      if (finalProgress.status === "ERROR") {
        throw new Error(finalProgress.error || "No se pudo procesar la importación");
      }

      setMatriculaImportResult({
        totalRegistros: finalProgress.totalRegistros,
        totalOk: finalProgress.totalOk,
        totalError: finalProgress.totalError,
        totalCreados: finalProgress.totalCreados,
        totalActualizados: finalProgress.totalActualizados,
        totalReactivados: finalProgress.totalReactivados,
        totalOmitidos: finalProgress.totalOmitidos,
        resultados: finalProgress.resultados || []
      });
      setMessage("Importación de matrículas procesada correctamente");
      setArchivoImportacionMatricula(null);
      if (matriculaImportFileInputRef.current) {
        matriculaImportFileInputRef.current.value = "";
      }

      await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
    } catch (error: any) {
      console.error("Error importando matrículas:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo importar el archivo de matrículas"
      );
    } finally {
      setImportandoMatriculas(false);
    }
  }

  async function handleImportarMatriculas(e: FormEvent) {
    e.preventDefault();
    await runImportarMatriculas();
  }

  async function handleImportarMatriculasClick() {
    await runImportarMatriculas();
  }

  async function handleDescargarResumenMatriculas() {
    const jobId = matriculaImportProgress?.jobId;
    if (!jobId) {
      setErrorMessage("No hay un resumen de importación disponible para exportar");
      return;
    }

    try {
      clearMessages();
      const response = await api.get(`/academico/matriculas/importar-excel/resumen/${jobId}/excel`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resumen_importacion_matriculas.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error descargando resumen de matrículas:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo exportar el resumen de importación");
    }
  }

  async function refreshAfterAcademicoBulkImport(kind: AcademicoBulkImportKey) {
    if (kind === "grupos") {
      await Promise.all([
        loadGrupos(grupoSearch, incluirGruposInactivos),
        loadCatalogos(),
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas)
      ]);
      return;
    }

    if (kind === "materias") {
      await Promise.all([
        loadMaterias(materiaSearch, incluirMateriasInactivas),
        loadCatalogos(),
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas)
      ]);
      return;
    }

    if (kind === "asignaciones-docentes") {
      await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
      return;
    }

    if (kind === "grupos-materia") {
      await Promise.all([
        loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas),
        loadCatalogos(),
        loadHorarios(horarioSearch, incluirHorariosInactivos)
      ]);
      return;
    }

    if (kind === "horarios-grupo") {
      await Promise.all([
        loadHorarios(horarioSearch, incluirHorariosInactivos),
        loadFechasClase(fechaClaseSearch)
      ]);
      return;
    }

    await Promise.all([
      loadFeriados(feriadoSearch, incluirFeriadosInactivos),
      loadCatalogos(),
      loadFechasClase(fechaClaseSearch)
    ]);
  }

  function clearAcademicoBulkImport(kind: AcademicoBulkImportKey) {
    setAcademicoBulkImportFiles((prev) => ({ ...prev, [kind]: null }));
    setAcademicoBulkImportProgress((prev) => ({ ...prev, [kind]: null }));
    setAcademicoBulkImportResult((prev) => ({ ...prev, [kind]: null }));
    const input = academicoBulkImportFileRefs.current[kind];
    if (input) input.value = "";
  }

  async function handleDescargarPlantillaAcademico(kind: AcademicoBulkImportKey) {
    try {
      clearMessages();
      const response = await api.get(`/academico/importaciones/${kind}/plantilla-excel`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = academicoBulkImportLabels[kind].filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage(`Plantilla de ${academicoBulkImportLabels[kind].title} descargada correctamente`);
    } catch (error: any) {
      console.error("Error descargando plantilla:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo descargar la plantilla");
    }
  }

  async function handleImportarAcademicoBulk(kind: AcademicoBulkImportKey, e: FormEvent) {
    e.preventDefault();

    const file = academicoBulkImportFiles[kind];
    if (!file) {
      setErrorMessage("Debes seleccionar un archivo Excel para importar");
      return;
    }

    setAcademicoBulkImportLoading((prev) => ({ ...prev, [kind]: true }));
    setAcademicoBulkImportProgress((prev) => ({ ...prev, [kind]: null }));
    setAcademicoBulkImportResult((prev) => ({ ...prev, [kind]: null }));
    clearMessages();

    try {
      const formData = new FormData();
      formData.append("archivo", file);

      const response = await api.post(`/academico/importaciones/${kind}/iniciar`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const initialProgress: AcademicoBulkImportProgress = response.data?.data;
      const jobId = initialProgress?.jobId;
      if (!jobId) {
        throw new Error("No se recibió el identificador de la importación");
      }

      setAcademicoBulkImportProgress((prev) => ({ ...prev, [kind]: initialProgress }));

      let finalProgress = initialProgress;
      while (!["COMPLETADO", "ERROR"].includes(finalProgress.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const progressResponse = await api.get(`/academico/importaciones/${kind}/progreso/${jobId}`);
        finalProgress = progressResponse.data?.data;
        setAcademicoBulkImportProgress((prev) => ({ ...prev, [kind]: finalProgress }));
      }

      if (finalProgress.status === "ERROR") {
        throw new Error(finalProgress.error || "No se pudo procesar la importación");
      }

      setAcademicoBulkImportResult((prev) => ({
        ...prev,
        [kind]: {
          totalRegistros: finalProgress.totalRegistros,
          totalOk: finalProgress.totalOk,
          totalError: finalProgress.totalError,
          totalCreados: finalProgress.totalCreados,
          totalReactivados: finalProgress.totalReactivados,
          totalOmitidos: finalProgress.totalOmitidos,
          resultados: finalProgress.resultados || []
        }
      }));
      setAcademicoBulkImportFiles((prev) => ({ ...prev, [kind]: null }));
      const input = academicoBulkImportFileRefs.current[kind];
      if (input) input.value = "";

      setMessage(`Importación de ${academicoBulkImportLabels[kind].title} procesada correctamente`);
      await refreshAfterAcademicoBulkImport(kind);
    } catch (error: any) {
      console.error("Error importando archivo:", error);
      setErrorMessage(error?.response?.data?.message || error?.message || "No se pudo importar el archivo Excel");
    } finally {
      setAcademicoBulkImportLoading((prev) => ({ ...prev, [kind]: false }));
    }
  }

  async function handleDescargarResumenAcademicoBulk(kind: AcademicoBulkImportKey) {
    const jobId = academicoBulkImportProgress[kind]?.jobId;
    if (!jobId) {
      setErrorMessage("No hay un resumen de importación disponible para exportar");
      return;
    }

    try {
      clearMessages();
      const response = await api.get(`/academico/importaciones/${kind}/resumen/${jobId}/excel`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resumen_${academicoBulkImportLabels[kind].filename}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error descargando resumen:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo exportar el resumen de importación");
    }
  }

  function renderAcademicoBulkImportPanel(kind: AcademicoBulkImportKey) {
    const label = academicoBulkImportLabels[kind].title;
    const loading = academicoBulkImportLoading[kind];
    const progress = academicoBulkImportProgress[kind];
    const result = academicoBulkImportResult[kind];
    const file = academicoBulkImportFiles[kind];

    return (
      <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
        <h4 style={{ margin: "0 0 12px" }}>Importar {label}</h4>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
          <button
            type="button"
            className="primary-btn"
            onClick={() => handleDescargarPlantillaAcademico(kind)}
            disabled={loading}
          >
            Descargar plantilla
          </button>
        </div>
        <form
          className="form"
          onSubmit={(e) => handleImportarAcademicoBulk(kind, e)}
          aria-busy={loading}
        >
          <label>
            Archivo Excel
            <input
              ref={(element) => {
                academicoBulkImportFileRefs.current[kind] = element;
              }}
              type="file"
              accept=".xlsx,.xls"
              disabled={loading}
              onChange={(e) => setAcademicoBulkImportFiles((prev) => ({ ...prev, [kind]: e.target.files?.[0] || null }))}
            />
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primary-btn" disabled={loading || !file}>
              {loading ? "Importando..." : "Importar registros"}
            </button>
            <button
              type="button"
              onClick={() => clearAcademicoBulkImport(kind)}
              style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
            >
              Limpiar importación
            </button>
          </div>
        </form>

        {(loading || progress) && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "10px",
              background: "#0f172a",
              color: "#e5f3ff"
            }}
          >
            <strong>{loading ? `Procesando importación de ${label}` : `Importación de ${label} finalizada`}</strong>
            <div style={{ marginTop: "4px", opacity: 0.85 }}>
              {progress ? `${progress.procesados} de ${progress.totalRegistros} registros procesados` : "Preparando archivo..."}
            </div>
            <div className="processing-progress-track" aria-label={`Progreso de importación de ${label}`}>
              <div
                className="processing-progress-bar"
                style={{ width: `${Math.max(0, Math.min(100, progress?.porcentaje || 0))}%` }}
              />
            </div>
            <div className="processing-progress-meta">
              <span>{progress?.porcentaje || 0}%</span>
              <span>Creados: {progress?.totalCreados || 0}</span>
              <span>Reactivados: {progress?.totalReactivados || 0}</span>
              <span>Omitidos: {progress?.totalOmitidos || 0}</span>
              <span>Errores: {progress?.totalError || 0}</span>
            </div>
          </div>
        )}

        {result && (
          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
              <span><strong>Total:</strong> {result.totalRegistros}</span>
              <span><strong>Creados:</strong> {result.totalCreados}</span>
              <span><strong>Reactivados:</strong> {result.totalReactivados}</span>
              <span><strong>Omitidos:</strong> {result.totalOmitidos}</span>
              <span><strong>Errores:</strong> {result.totalError}</span>
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => handleDescargarResumenAcademicoBulk(kind)}
              style={{ marginBottom: "12px" }}
            >
              Exportar resumen a Excel
            </button>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Referencia</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.resultados.slice(0, 20).map((item) => (
                    <tr key={`${kind}-${item.fila}-${item.referencia}`}>
                      <td>{item.fila}</td>
                      <td>{item.referencia}</td>
                      <td>{item.estado}</td>
                      <td>{item.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  async function handleEspecialidadSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingEspecialidad(true);
    clearMessages();

    try {
      const payload = {
        descripcion: especialidadForm.descripcion,
        permiteMultiplesPorSeccion: !!especialidadForm.permiteMultiplesPorSeccion
      };

      if (!payload.descripcion.trim()) {
        setErrorMessage("La descripción de la especialidad es obligatoria");
        return;
      }

      if (editingEspecialidadId !== null) {
        await api.put(`/academico/especialidades/${editingEspecialidadId}`, payload);
        setMessage("Especialidad actualizada correctamente");
      } else {
        await api.post("/academico/especialidades", payload);
        setMessage("Especialidad creada correctamente");
      }

      resetEspecialidadForm();
      await Promise.all([
        loadEspecialidades(especialidadSearch, incluirEspecialidadesInactivas),
        loadCatalogos(),
        loadMatriculas(matriculaSearch, incluirMatriculasInactivas)
      ]);
    } catch (error: any) {
      console.error("Error guardando especialidad:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la especialidad");
    } finally {
      setLoadingEspecialidad(false);
    }
  }

  async function handleTipoEstudianteSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingTipoEstudiante(true);
    clearMessages();

    try {
      const payload = {
        descripcion: tipoEstudianteForm.descripcion
      };

      if (!payload.descripcion.trim()) {
        setErrorMessage("La descripción del tipo de estudiante es obligatoria");
        return;
      }

      if (editingTipoEstudianteId !== null) {
        await api.put(`/academico/tipos-estudiante/${editingTipoEstudianteId}`, payload);
        setMessage("Tipo de estudiante actualizado correctamente");
      } else {
        await api.post("/academico/tipos-estudiante", payload);
        setMessage("Tipo de estudiante creado correctamente");
      }

      resetTipoEstudianteForm();
      await Promise.all([
        loadTiposEstudiante(tipoEstudianteSearch, incluirTiposEstudianteInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      console.error("Error guardando tipo de estudiante:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el tipo de estudiante");
    } finally {
      setLoadingTipoEstudiante(false);
    }
  }

  async function handleTipoAdecuacionSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingTipoAdecuacion(true);
    clearMessages();

    try {
      const payload = {
        descripcion: tipoAdecuacionForm.descripcion
      };

      if (!payload.descripcion.trim()) {
        setErrorMessage("La descripción del tipo de adecuación es obligatoria");
        return;
      }

      if (editingTipoAdecuacionId !== null) {
        await api.put(`/academico/tipos-adecuacion/${editingTipoAdecuacionId}`, payload);
        setMessage("Tipo de adecuación actualizado correctamente");
      } else {
        await api.post("/academico/tipos-adecuacion", payload);
        setMessage("Tipo de adecuación creado correctamente");
      }

      resetTipoAdecuacionForm();
      await Promise.all([
        loadTiposAdecuacion(tipoAdecuacionSearch, incluirTiposAdecuacionInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      console.error("Error guardando tipo de adecuación:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el tipo de adecuación");
    } finally {
      setLoadingTipoAdecuacion(false);
    }
  }

  async function handleAdecuacionSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingAdecuacion(true);
    clearMessages();

    try {
      const payload = {
        tipoAdecuacionId: Number(adecuacionForm.tipoAdecuacionId || 0),
        tipo: adecuacionForm.tipo,
        descripcion: adecuacionForm.descripcion
      };

      if (!payload.tipoAdecuacionId) {
        setErrorMessage("La adecuación es obligatoria");
        return;
      }

      if (!payload.tipo.trim() || !payload.descripcion.trim()) {
        setErrorMessage("Tipo y descripción son obligatorios");
        return;
      }

      if (editingAdecuacionId !== null) {
        await api.put(`/academico/adecuaciones/${editingAdecuacionId}`, payload);
        setMessage("Adecuación actualizada correctamente");
      } else {
        await api.post("/academico/adecuaciones", payload);
        setMessage("Adecuación creada correctamente");
      }

      resetAdecuacionForm();
      await loadAdecuaciones(adecuacionSearch, incluirAdecuacionesInactivas);
    } catch (error: any) {
      console.error("Error guardando adecuación:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la adecuación");
    } finally {
      setLoadingAdecuacion(false);
    }
  }


  async function handleRutaTransporteSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingRutaTransporte(true);
    clearMessages();

    try {
      const payload = {
        descripcion: rutaTransporteForm.descripcion,
        responsable: rutaTransporteForm.responsable || null,
        lugarInicio: rutaTransporteForm.lugarInicio || null,
        lugarFin: rutaTransporteForm.lugarFin || null,
        capacidadEstudiantes: rutaTransporteForm.capacidadEstudiantes ? Number(rutaTransporteForm.capacidadEstudiantes) : null,
        horaInicio: rutaTransporteForm.horaInicio || null,
        horaFin: rutaTransporteForm.horaFin || null
      };

      if (editingRutaTransporteId !== null) {
        await api.put(`/academico/rutas-transporte/${editingRutaTransporteId}`, payload);
        setMessage("Ruta de transporte actualizada correctamente");
      } else {
        await api.post("/academico/rutas-transporte", payload);
        setMessage("Ruta de transporte creada correctamente");
      }

      resetRutaTransporteForm();
      await Promise.all([
        loadRutasTransporte(rutaTransporteSearch, incluirRutasTransporteInactivas),
        loadCatalogos()
      ]);
    } catch (error: any) {
      console.error("Error guardando ruta de transporte:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la ruta de transporte");
    } finally {
      setLoadingRutaTransporte(false);
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
        descripcion: materiaForm.descripcion || null,
        esMateriaEspecial: !!materiaForm.esMateriaEspecial
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

  async function handleFechaClaseSyncPreview(e: FormEvent) {
    e.preventDefault();
    setLoadingFechaClaseSync(true);
    clearMessages();

    try {
      const payload = {
        periodoId: Number(fechaClaseSyncForm.periodoId),
        fechaCorte: fechaClaseSyncForm.fechaCorte || null
      };

      const response = await api.post("/academico/fechas-clase/sync-periodo/preview", payload);
      const data = response.data?.data as FechaClaseSyncPreview;

      setFechaClaseSyncPreview(data);
      setMessage(
        `Vista previa lista. Crear: ${data?.resumen?.crear ?? 0} | Eliminar: ${data?.resumen?.eliminar ?? 0} | Bloqueadas: ${data?.resumen?.bloqueadasPorAsistencia ?? 0} | Conflictos: ${data?.resumen?.conflictos ?? 0}`
      );
    } catch (error: any) {
      console.error("Error generando la vista previa de fechas:", error);
      setFechaClaseSyncPreview(null);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo generar la vista previa de sincronización"
      );
    } finally {
      setLoadingFechaClaseSync(false);
    }
  }

  async function handleFechaClaseSyncApply() {
    if (!fechaClaseSyncPreview) {
      setErrorMessage("Primero debes generar la vista previa del período");
      return;
    }

    const confirmado = window.confirm(
      "Se aplicarán cambios solo sobre fechas futuras. Las fechas con asistencia y el histórico anterior no se tocarán. ¿Deseás continuar?"
    );

    if (!confirmado) return;

    setLoadingFechaClaseSync(true);
    clearMessages();

    try {
      const payload = {
        periodoId: Number(fechaClaseSyncForm.periodoId),
        fechaCorte: fechaClaseSyncForm.fechaCorte || null
      };

      const response = await api.post("/academico/fechas-clase/sync-periodo/apply", payload);
      const data = response.data?.data as FechaClaseSyncPreview;

      setFechaClaseSyncPreview(data);
      setMessage(
        `Sincronización aplicada. Creadas: ${data?.aplicado?.crear ?? 0} | Eliminadas: ${data?.aplicado?.eliminar ?? 0} | Bloqueadas: ${data?.resumen?.bloqueadasPorAsistencia ?? 0} | Conflictos pendientes: ${data?.resumen?.conflictos ?? 0}`
      );

      await loadFechasClase(fechaClaseSearch);
    } catch (error: any) {
      console.error("Error aplicando sincronización de fechas:", error);
      setErrorMessage(
        error?.response?.data?.message || "No se pudo aplicar la sincronización del período"
      );
    } finally {
      setLoadingFechaClaseSync(false);
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
    openSection("feriados");
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
    const confirmado = window.confirm("¿Deseás eliminar este feriado?");
    if (!confirmado) return;
    clearMessages();
    try {
      await api.delete(`/academico/feriados/${id}`);
      setMessage("Feriado eliminado correctamente");
      if (editingFeriadoId === id) resetFeriadoForm();
      await Promise.all([loadFeriados(feriadoSearch, incluirFeriadosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el feriado");
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
    openSection("anios");
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
    openSection("periodos");
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
    openSection("grupos");
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
    openSection("matriculas");
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
      especialidadId: item.EspecialidadId ? String(item.EspecialidadId) : "",
      especialidad: item.EspecialidadDescripcion || item.Especialidad || item.GrupoEspecialidad || "",
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

  function handleEditEspecialidad(item: Especialidad) {
    setTab("especialidades");
    openSection("especialidades");
    clearMessages();
    setEditingEspecialidadId(item.EspecialidadId);
    setEspecialidadForm({
      descripcion: item.Descripcion || "",
      permiteMultiplesPorSeccion: !!item.PermiteMultiplesPorSeccion
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditTipoEstudiante(item: TipoEstudiante) {
    setTab("tiposEstudiante");
    openSection("tiposEstudiante");
    clearMessages();
    setEditingTipoEstudianteId(item.TipoEstudianteId);
    setTipoEstudianteForm({
      descripcion: item.Descripcion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditTipoAdecuacion(item: TipoAdecuacion) {
    setTab("tiposAdecuacion");
    openSection("tiposAdecuacion");
    clearMessages();
    setEditingTipoAdecuacionId(item.TipoAdecuacionId);
    setTipoAdecuacionForm({
      descripcion: item.Descripcion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditAdecuacion(item: AdecuacionItem) {
    setTab("adecuaciones");
    openSection("adecuaciones");
    clearMessages();
    setEditingAdecuacionId(item.AdecuacionCatalogoId);
    setAdecuacionForm({
      tipoAdecuacionId: String(item.TipoAdecuacionId || ""),
      tipo: item.Tipo || "",
      descripcion: item.Descripcion || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditRutaTransporte(item: RutaTransporte) {
    setTab("rutasTransporte");
    openSection("rutasTransporte");
    clearMessages();
    setEditingRutaTransporteId(item.RutaTransporteId);
    setRutaTransporteForm({
      descripcion: item.Descripcion || "",
      responsable: item.Responsable || "",
      lugarInicio: item.LugarInicio || "",
      lugarFin: item.LugarFin || "",
      capacidadEstudiantes: item.CapacidadEstudiantes !== null && item.CapacidadEstudiantes !== undefined ? String(item.CapacidadEstudiantes) : "",
      horaInicio: formatTime(item.HoraInicio),
      horaFin: formatTime(item.HoraFin)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditMateria(item: Materia) {
    setTab("materias");
    openSection("materias");
    clearMessages();
    setEditingMateriaId(item.MateriaId);
    setMateriaForm({
      codigo: item.Codigo || "",
      nombre: item.Nombre || "",
      descripcion: item.Descripcion || "",
      esMateriaEspecial: !!item.EsMateriaEspecial
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditAsignacion(item: AsignacionDocente) {
    setTab("asignaciones");
    openSection("asignaciones");
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
    openSection("bloques");
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
    openSection("gruposMateria");
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
    openSection("horarios");
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
    const confirmado = window.confirm("¿Deseás eliminar este año lectivo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/anios-lectivos/${id}`);
      setMessage("Año lectivo eliminado correctamente");
      if (editingAnioId === id) resetAnioForm();
      await Promise.all([loadAnios(anioSearch, incluirAniosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el año lectivo");
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
    const confirmado = window.confirm("¿Deseás eliminar este período?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/periodos/${id}`);
      setMessage("Período eliminado correctamente");
      if (editingPeriodoId === id) resetPeriodoForm();
      await Promise.all([loadPeriodos(periodoSearch, incluirPeriodosInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el período");
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
    const confirmado = window.confirm("¿Deseás eliminar este grupo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/grupos/${id}`);
      setMessage("Grupo eliminado correctamente");
      if (editingGrupoId === id) resetGrupoForm();
      await Promise.all([loadGrupos(grupoSearch, incluirGruposInactivos), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el grupo");
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
    const confirmado = window.confirm("¿Deseás eliminar esta matrícula?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/matriculas/${id}`);
      setMessage("Matrícula eliminada correctamente");
      if (editingMatriculaId === id) resetMatriculaForm();
      await loadMatriculas(matriculaSearch, incluirMatriculasInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la matrícula");
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

  async function handleDeleteEspecialidad(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar esta especialidad?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/especialidades/${id}`);
      setMessage("Especialidad eliminada correctamente");
      if (editingEspecialidadId === id) resetEspecialidadForm();
      await Promise.all([loadEspecialidades(especialidadSearch, incluirEspecialidadesInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la especialidad");
    }
  }

  async function handleDeleteTipoEstudiante(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar este tipo de estudiante?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/tipos-estudiante/${id}`);
      setMessage("Tipo de estudiante eliminado correctamente");
      if (editingTipoEstudianteId === id) resetTipoEstudianteForm();
      await Promise.all([
        loadTiposEstudiante(tipoEstudianteSearch, incluirTiposEstudianteInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el tipo de estudiante");
    }
  }

  async function handleReactivateTipoEstudiante(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/tipos-estudiante/${id}/reactivar`);
      setMessage("Tipo de estudiante reactivado correctamente");
      await Promise.all([
        loadTiposEstudiante(tipoEstudianteSearch, incluirTiposEstudianteInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el tipo de estudiante");
    }
  }

  async function handleDeleteTipoAdecuacion(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar este tipo de adecuación?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/tipos-adecuacion/${id}`);
      setMessage("Tipo de adecuación eliminado correctamente");
      if (editingTipoAdecuacionId === id) resetTipoAdecuacionForm();
      await Promise.all([
        loadTiposAdecuacion(tipoAdecuacionSearch, incluirTiposAdecuacionInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el tipo de adecuación");
    }
  }

  async function handleReactivateTipoAdecuacion(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/tipos-adecuacion/${id}/reactivar`);
      setMessage("Tipo de adecuación reactivado correctamente");
      await Promise.all([
        loadTiposAdecuacion(tipoAdecuacionSearch, incluirTiposAdecuacionInactivos),
        loadCatalogos()
      ]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar el tipo de adecuación");
    }
  }

  async function handleDeleteAdecuacion(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar esta adecuación?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/adecuaciones/${id}`);
      setMessage("Adecuación eliminada correctamente");
      if (editingAdecuacionId === id) resetAdecuacionForm();
      await loadAdecuaciones(adecuacionSearch, incluirAdecuacionesInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la adecuación");
    }
  }

  async function handleReactivateAdecuacion(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/adecuaciones/${id}/reactivar`);
      setMessage("Adecuación reactivada correctamente");
      await loadAdecuaciones(adecuacionSearch, incluirAdecuacionesInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la adecuación");
    }
  }

  async function handleReactivateEspecialidad(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/especialidades/${id}/reactivar`);
      setMessage("Especialidad reactivada correctamente");
      await Promise.all([loadEspecialidades(especialidadSearch, incluirEspecialidadesInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la especialidad");
    }
  }

  async function handleDeleteRutaTransporte(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar esta ruta de transporte?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/rutas-transporte/${id}`);
      setMessage("Ruta de transporte eliminada correctamente");
      if (editingRutaTransporteId === id) resetRutaTransporteForm();
      await Promise.all([loadRutasTransporte(rutaTransporteSearch, incluirRutasTransporteInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la ruta de transporte");
    }
  }

  async function handleReactivateRutaTransporte(id: number) {
    clearMessages();
    try {
      await api.patch(`/academico/rutas-transporte/${id}/reactivar`);
      setMessage("Ruta de transporte reactivada correctamente");
      await Promise.all([loadRutasTransporte(rutaTransporteSearch, incluirRutasTransporteInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo reactivar la ruta de transporte");
    }
  }

  async function handleDeleteMateria(id: number) {
    const confirmado = window.confirm("¿Deseás eliminar esta materia?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/materias/${id}`);
      setMessage("Materia eliminada correctamente");
      if (editingMateriaId === id) resetMateriaForm();
      await Promise.all([loadMaterias(materiaSearch, incluirMateriasInactivas), loadCatalogos()]);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la materia");
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
    const confirmado = window.confirm("¿Deseás eliminar esta asignación docente?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/asignaciones-docentes/${id}`);
      setMessage("Asignación docente eliminada correctamente");
      if (editingAsignacionId === id) resetAsignacionForm();
      await loadAsignaciones(asignacionSearch, incluirAsignacionesInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la asignación docente");
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
    const confirmado = window.confirm("¿Deseás eliminar esta materia por grupo?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/grupos-materia/${id}`);
      setMessage("Materia por grupo eliminada correctamente");
      if (editingGrupoMateriaId === id) resetGrupoMateriaForm();
      await loadGruposMateria(grupoMateriaSearch, incluirGrupoMateriaInactivas);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la materia por grupo");
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
    const confirmado = window.confirm("¿Deseás eliminar este horario de clase?");
    if (!confirmado) return;
    clearMessages();

    try {
      await api.delete(`/academico/horarios-grupo/${id}`);
      setMessage("Horario de clase eliminado correctamente");
      if (editingHorarioId === id) resetHorarioForm();
      await loadHorarios(horarioSearch, incluirHorariosInactivos);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el horario de clase");
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

  async function handleEspecialidadSearch(e: FormEvent) {
    e.preventDefault();
    await loadEspecialidades(especialidadSearch, incluirEspecialidadesInactivas);
  }

  async function handleTipoEstudianteSearch(e: FormEvent) {
    e.preventDefault();
    await loadTiposEstudiante(tipoEstudianteSearch, incluirTiposEstudianteInactivos);
  }

  async function handleTipoAdecuacionSearch(e: FormEvent) {
    e.preventDefault();
    await loadTiposAdecuacion(tipoAdecuacionSearch, incluirTiposAdecuacionInactivos);
  }

  async function handleAdecuacionSearch(e: FormEvent) {
    e.preventDefault();
    await loadAdecuaciones(adecuacionSearch, incluirAdecuacionesInactivas);
  }

  async function handleRutaTransporteSearch(e: FormEvent) {
    e.preventDefault();
    await loadRutasTransporte(rutaTransporteSearch, incluirRutasTransporteInactivas);
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
      const dominioGuardado = String(data?.dominio || correoEstudianteDominio);
      setCorreoEstudianteDominio(dominioGuardado);
      setCorreoEstudianteDominioGuardado(dominioGuardado);
      setMessage('Configuración de correo estudiantil actualizada correctamente');
      closeSection("configuracionCorreo");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo actualizar la configuración de correo');
    } finally {
      setLoadingConfigCorreo(false);
    }
  }

  useEffect(() => {
    const cfg = correoNotificacionConfigs.find((item) => String(item.TipoUso || "").toUpperCase() === correoNotificacionTipo);
    setCorreoNotificacionForm({
      fromEmail: cfg?.FromEmail || "info@profe360cr.com",
      paraModo: cfg?.ParaModo || "ALUMNO",
      ccModo: cfg?.CcModo || "PROFESOR",
      asuntoTemplate: cfg?.AsuntoTemplate || "",
      cuerpoTemplate: cfg?.CuerpoTemplate || ""
    });
  }, [correoNotificacionTipo, correoNotificacionConfigs]);

  async function handleCorreoNotificacionSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingConfigCorreo(true);
    clearMessages();
    try {
      await api.put(`/academico/configuracion-correo-notificaciones/${correoNotificacionTipo}`, correoNotificacionForm);
      setMessage("Parámetros de correo de notificación actualizados correctamente");
      await loadCorreoNotificacionConfigs();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la configuración de correo de notificación");
    } finally {
      setLoadingConfigCorreo(false);
    }
  }

  async function handleBoletaConductaConfigSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingConfigCorreo(true);
    clearMessages();
    try {
      const siguienteNumero = Number(boletaConductaConsecutivo || 0);
      await api.put("/academico/boleta-conducta-config", { siguienteNumero });
      setMessage("Consecutivo de boleta de conducta actualizado correctamente");
      await loadBoletaConductaConfig();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el consecutivo de boleta de conducta");
    } finally {
      setLoadingConfigCorreo(false);
    }
  }

  function resetMensajeSeguimientoForm() {
    setMensajeSeguimientoForm(initialMensajeSeguimientoForm);
    setEditingMensajeSeguimientoId(null);
  }

  async function handleMensajeSeguimientoSubmit(e: FormEvent) {
    e.preventDefault();
    setLoadingMensajesSeguimiento(true);
    clearMessages();
    try {
      const payload = {
        tipoUso: mensajeSeguimientoForm.tipoUso,
        valorNivel: mensajeSeguimientoForm.valorNivel === "" ? null : Number(mensajeSeguimientoForm.valorNivel),
        titulo: mensajeSeguimientoForm.titulo,
        cuerpo: mensajeSeguimientoForm.cuerpo
      };
      if (editingMensajeSeguimientoId) {
        await api.put(`/academico/mensajes-seguimiento/${editingMensajeSeguimientoId}`, payload);
        setMessage("Mensaje actualizado correctamente");
      } else {
        await api.post("/academico/mensajes-seguimiento", payload);
        setMessage("Mensaje creado correctamente");
      }
      resetMensajeSeguimientoForm();
      await loadMensajesSeguimiento();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el mensaje");
    } finally {
      setLoadingMensajesSeguimiento(false);
    }
  }

  async function handleDeleteMensajeSeguimiento(id: number) {
    const confirmed = window.confirm("¿Eliminar este mensaje?");
    if (!confirmed) return;
    setLoadingMensajesSeguimiento(true);
    clearMessages();
    try {
      await api.delete(`/academico/mensajes-seguimiento/${id}`);
      setMessage("Mensaje eliminado correctamente");
      await loadMensajesSeguimiento();
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el mensaje");
    } finally {
      setLoadingMensajesSeguimiento(false);
    }
  }

  const tabButtons: { key: TabKey; label: string; tone: string; help: string }[] = [
    { key: "anios", label: "Año Lectivo", tone: "#2563eb", help: "Base del curso lectivo" },
    { key: "periodos", label: "Periodos", tone: "#2563eb", help: "Trimestres o periodos" },
    { key: "diasLectivos", label: "Días Lectivos", tone: "#2563eb", help: "Días hábiles de clase" },
    { key: "feriados", label: "Feriados", tone: "#2563eb", help: "Excepciones del calendario" },
    { key: "grupos", label: "Gestión de grupos", tone: "#0d9488", help: "Secciones del centro educativo" },
    { key: "tiposEstudiante", label: "Tipo de estudiante", tone: "#0d9488", help: "Clasificación estudiantil" },
    { key: "tiposAdecuacion", label: "Tipo Adecuación", tone: "#0d9488", help: "Clasificación de adecuaciones" },
    { key: "adecuaciones", label: "Apoyos Educativos (Adecuaciones)", tone: "#0d9488", help: "Catálogo de apoyos y ajustes" },
    { key: "especialidades", label: "Especialidades", tone: "#0d9488", help: "Oferta académica técnica" },
    { key: "rutasTransporte", label: "Rutas", tone: "#0d9488", help: "Logística de transporte" },
    { key: "materias", label: "Materias", tone: "#0d9488", help: "Catálogo de asignaturas" },
    { key: "matriculas", label: "Matrícula", tone: "#7c3aed", help: "Ingreso del estudiante al grupo" },
    { key: "gruposMateria", label: "Materias por grupo", tone: "#16a34a", help: "Qué recibe cada grupo" },
    { key: "asignaciones", label: "Asignación Docentes", tone: "#16a34a", help: "Qué docente atiende cada grupo" },
    { key: "bloques", label: "Bloque Horario", tone: "#f59e0b", help: "Franja horaria disponible" },
    { key: "horarios", label: "Horario de clases", tone: "#f59e0b", help: "Cruce de grupo, materia y bloque" },
    { key: "fechasClase", label: "Fecha de clases", tone: "#f59e0b", help: "Generación o ajuste por fecha" },
    { key: "evaluacion", label: "Parametrización de Evaluaciones", tone: "#7c3aed", help: "Esquema de evaluación" },
    { key: "habilidadesPlaneamiento", label: "Habilidades de Planeamiento", tone: "#7c3aed", help: "Base para planeamiento IA" },
    { key: "configuracionCorreo", label: "Correo Institucional", tone: "#db2777", help: "Plantillas y dominio" },
    { key: "mensajes", label: "Mensajes", tone: "#db2777", help: "Mensajería de seguimiento" }
  ];

  const visibleTabButtons = visibleTabs?.length
    ? tabButtons.filter((item) => visibleTabs.includes(item.key))
    : tabButtons;

  function getTabButtonStyle(item: (typeof tabButtons)[number]) {
    const isActive = tab === item.key;
    return {
      opacity: isActive ? 1 : 0.88,
      background: isActive
        ? `linear-gradient(135deg, ${item.tone}, #ffffff)`
        : `linear-gradient(135deg, ${item.tone}, ${item.tone})`,
      color: isActive ? "#04111f" : "#f8fafc",
      boxShadow: isActive ? `0 0 0 2px ${item.tone}55, 0 12px 24px ${item.tone}33` : `0 8px 18px ${item.tone}22`,
      border: isActive ? `1px solid ${item.tone}` : `1px solid ${item.tone}aa`,
      transition: "all 0.2s ease"
    };
  }

  return (
    <div className="stack">
      <section className="card">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
          {visibleTabButtons.map((item) => (
            <button
              key={item.key}
              type="button"
              className="primary-btn admin-tab-btn"
              onClick={() => setTab(item.key)}
              title={item.help}
              style={getTabButtonStyle(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: "16px", color: "#cbd5e1", fontSize: "0.95rem" }}>
          Orden sugerido: calendario, estructura académica, operación docente y comunicación institucional.
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


        {tab === "habilidadesPlaneamiento" && <HabilidadesPlaneamientoAcademicoPage />}

        {tab === "configuracionCorreo" && (
          <div className={isSectionOpen("configuracionCorreo") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("configuracionCorreo") ? (
                <>
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
                  <button type="button" onClick={handleCancelarConfigCorreo} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Configuración de correo estudiantil</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); openSection("configuracionCorreo"); }}>
                      Editar configuración
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Uso de esta configuración</h3>
              <div className="stack">
                <div>El usuario del estudiante y del acceso de padre de familia se formará con el número de identificación más este dominio</div>
                <div><strong>Ejemplo:</strong> 102340567{correoEstudianteDominio.startsWith('@') ? correoEstudianteDominio : '@' + correoEstudianteDominio}</div>
                <div>La clave inicial será el número de identificación y en el primer ingreso se solicitará el cambio</div>
              </div>
            </section>
            <section className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Parámetros de notificación</h3>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setCorreoNotificacionMinimizado((prev) => !prev)}
                >
                  {correoNotificacionMinimizado ? "Editar" : "Minimizar"}
                </button>
              </div>
              {!correoNotificacionMinimizado ? (
              <>
              <form className="form" onSubmit={handleCorreoNotificacionSubmit}>
                <label>
                  Tema
                  <select value={correoNotificacionTipo} onChange={(e) => setCorreoNotificacionTipo(e.target.value)}>
                    <option value="COTIDIANO">Cotidiano</option>
                    <option value="TAREA">Tarea</option>
                    <option value="ASISTENCIA">Asistencia</option>
                  </select>
                </label>
                <label>
                  De
                  <input value={correoNotificacionForm.fromEmail} onChange={(e) => setCorreoNotificacionForm((prev) => ({ ...prev, fromEmail: e.target.value }))} />
                </label>
                <label>
                  Para
                  <select value={correoNotificacionForm.paraModo} onChange={(e) => setCorreoNotificacionForm((prev) => ({ ...prev, paraModo: e.target.value }))}>
                    <option value="ALUMNO">Correo del Alumno</option>
                    <option value="ENCARGADO">Correo del Encargado</option>
                  </select>
                </label>
                <label>
                  CC
                  <select value={correoNotificacionForm.ccModo} onChange={(e) => setCorreoNotificacionForm((prev) => ({ ...prev, ccModo: e.target.value }))}>
                    <option value="PROFESOR">Profesor reporta</option>
                    <option value="NINGUNO">Sin copia</option>
                  </select>
                </label>
                <label>
                  Asunto (plantilla)
                  <input value={correoNotificacionForm.asuntoTemplate} onChange={(e) => setCorreoNotificacionForm((prev) => ({ ...prev, asuntoTemplate: e.target.value }))} placeholder="Ejemplo: {{reporte}} - {{alumno}} - {{fecha}}" />
                </label>
                <label>
                  Cuerpo (plantilla)
                  <textarea rows={6} value={correoNotificacionForm.cuerpoTemplate} onChange={(e) => setCorreoNotificacionForm((prev) => ({ ...prev, cuerpoTemplate: e.target.value }))} placeholder="Variables: {{fecha}}, {{alumno}}, {{seccion}}, {{materia}}, {{lecciones}}, {{profesor}}, {{colegio}}, {{detalle}}" />
                </label>
                <button className="primary-btn" disabled={loadingConfigCorreo}>{loadingConfigCorreo ? "Guardando..." : "Guardar parámetros"}</button>
              </form>
              <div className="table-wrap" style={{ marginTop: "12px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Tema</th>
                      <th>De</th>
                      <th>Para</th>
                      <th>CC</th>
                      <th>Asunto</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correoNotificacionConfigs.map((item) => (
                      <tr key={`cfg-noti-${item.TipoUso}`}>
                        <td>{item.TipoUso}</td>
                        <td>{item.FromEmail || "-"}</td>
                        <td>{item.ParaModo || "-"}</td>
                        <td>{item.CcModo || "-"}</td>
                        <td>{item.AsuntoTemplate || "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="primary-btn"
                            style={{ padding: "6px 10px" }}
                            onClick={() => {
                              setCorreoNotificacionTipo(String(item.TipoUso || "COTIDIANO").toUpperCase());
                              setCorreoNotificacionForm({
                                fromEmail: item.FromEmail || "info@profe360cr.com",
                                paraModo: item.ParaModo || "ALUMNO",
                                ccModo: item.CcModo || "PROFESOR",
                                asuntoTemplate: item.AsuntoTemplate || "",
                                cuerpoTemplate: item.CuerpoTemplate || ""
                              });
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!correoNotificacionConfigs.length && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "12px" }}>
                          No hay parámetros guardados todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
              ) : (
                <p style={{ marginTop: "8px", marginBottom: 0 }}>Sección minimizada. Presioná <strong>Editar</strong> para ver y modificar parámetros.</p>
              )}
            </section>
          </div>
        )}

        {tab === "mensajes" && (
          <div className="stack">
            <div className="card">
              <h3>Mensajes para informar al encargado</h3>
              <p style={{ marginTop: 0 }}>Definí plantillas para cotidiano, tarea, asistencia y exámenes. Se pueden configurar por nivel 1/2/3 o generales.</p>
              <form onSubmit={handleMensajeSeguimientoSubmit} className="stack" style={{ gap: "10px" }}>
                <label>Tipo
                  <select value={mensajeSeguimientoForm.tipoUso} onChange={(e) => {
                    const tipoUso = e.target.value;
                    setMensajeSeguimientoForm((prev) => ({
                      ...prev,
                      tipoUso,
                      valorNivel: tipoUso === "ASISTENCIA"
                        ? (prev.valorNivel === "1" || prev.valorNivel === "2" || prev.valorNivel === "3" ? prev.valorNivel : "")
                        : prev.valorNivel
                    }));
                  }}>
                    <option value="COTIDIANO">Cotidiano</option>
                    <option value="TAREA">Tarea</option>
                    <option value="ASISTENCIA">Asistencia</option>
                    <option value="EXAMEN">Examen</option>
                  </select>
                </label>
                <label>Nivel (opcional)
                  <select value={mensajeSeguimientoForm.valorNivel} onChange={(e) => setMensajeSeguimientoForm((prev) => ({ ...prev, valorNivel: e.target.value }))}>
                    <option value="">General</option>
                    {mensajeSeguimientoForm.tipoUso === "ASISTENCIA" ? (
                      <>
                        <option value="1">Ausencia</option>
                        <option value="2">Tardía menor a 10 min</option>
                        <option value="3">Tardía mayor a 10 min</option>
                      </>
                    ) : mensajeSeguimientoForm.tipoUso === "TAREA" ? (
                      <>
                        <option value="0">No entregado</option>
                        <option value="1">1 (Inicial)</option>
                        <option value="2">2 (Intermedio)</option>
                        <option value="3">3 (Avanzado)</option>
                      </>
                    ) : (
                      <>
                        <option value="1">1 (Inicial)</option>
                        <option value="2">2 (Intermedio)</option>
                        <option value="3">3 (Avanzado)</option>
                      </>
                    )}
                  </select>
                </label>
                <label>Título (opcional)
                  <input value={mensajeSeguimientoForm.titulo} onChange={(e) => setMensajeSeguimientoForm((prev) => ({ ...prev, titulo: e.target.value }))} />
                </label>
                <label>Mensaje
                  <textarea rows={4} value={mensajeSeguimientoForm.cuerpo} onChange={(e) => setMensajeSeguimientoForm((prev) => ({ ...prev, cuerpo: e.target.value }))} />
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" className="primary-btn" disabled={loadingMensajesSeguimiento}>{editingMensajeSeguimientoId ? "Actualizar" : "Guardar"}</button>
                  <button type="button" className="primary-btn" style={{ background: "#0f172a" }} onClick={resetMensajeSeguimientoForm}>Agregar nuevo</button>
                </div>
              </form>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Nivel</th>
                    <th>Título</th>
                    <th>Mensaje</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {mensajesSeguimiento.map((item) => (
                    <tr key={item.MensajeSeguimientoId}>
                      <td>{item.TipoUso}</td>
                      <td>{getEtiquetaNivelMensaje(item.TipoUso, item.ValorNivel)}</td>
                      <td>{item.Titulo || "-"}</td>
                      <td>{item.Cuerpo}</td>
                      <td style={{ display: "flex", gap: "6px" }}>
                        <button type="button" className="primary-btn" style={{ padding: "6px 10px" }} onClick={() => {
                          setEditingMensajeSeguimientoId(item.MensajeSeguimientoId);
                          setMensajeSeguimientoForm({
                            tipoUso: item.TipoUso,
                            valorNivel: item.ValorNivel === null || item.ValorNivel === undefined ? "" : String(item.ValorNivel),
                            titulo: item.Titulo || "",
                            cuerpo: item.Cuerpo || ""
                          });
                        }}>Editar</button>
                        <button type="button" onClick={() => handleDeleteMensajeSeguimiento(item.MensajeSeguimientoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {!mensajesSeguimiento.length && (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: "14px" }}>No hay mensajes configurados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Boleta de conducta: consecutivo</h3>
              <p style={{ marginTop: 0 }}>Definí el número desde el cual iniciará el consecutivo de la boleta de reporte de conducta.</p>
              <form onSubmit={handleBoletaConductaConfigSubmit} style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
                <label style={{ minWidth: "220px" }}>
                  Siguiente número
                  <input
                    type="number"
                    min="1"
                    value={boletaConductaConsecutivo}
                    onChange={(e) => setBoletaConductaConsecutivo(e.target.value)}
                  />
                </label>
                <button type="submit" className="primary-btn" disabled={loadingConfigCorreo}>
                  {loadingConfigCorreo ? "Guardando..." : "Guardar consecutivo"}
                </button>
              </form>
            </div>
            <div className="card">
              <h3>Plantillas de configuración de correo</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tema</th>
                      <th>De</th>
                      <th>Para</th>
                      <th>CC</th>
                      <th>Asunto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correoNotificacionConfigs.map((item) => (
                      <tr key={`cfg-correo-${item.TipoUso}`}>
                        <td>{item.TipoUso}</td>
                        <td>{item.FromEmail || "-"}</td>
                        <td>{item.ParaModo || "-"}</td>
                        <td>{item.CcModo || "-"}</td>
                        <td>{item.AsuntoTemplate || "-"}</td>
                      </tr>
                    ))}
                    {!correoNotificacionConfigs.length && (
                      <tr><td colSpan={5} style={{ textAlign: "center", padding: "14px" }}>No hay plantillas de correo configuradas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "anios" && (
          <div className={isSectionOpen("anios") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("anios") ? (
                <>
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
                  <button type="button" onClick={resetAnioForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Años lectivos</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetAnioForm(); openSection("anios"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar año lectivo
                    </button>
                  </div>
                </>
              )}
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
                              <button type="button" onClick={() => handleDeleteAnio(item.AnioLectivoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("periodos") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("periodos") ? (
                <>
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
                  <button type="button" onClick={resetPeriodoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Períodos</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetPeriodoForm(); openSection("periodos"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar período
                    </button>
                  </div>
                </>
              )}
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
                              <button type="button" onClick={() => handleDeletePeriodo(item.PeriodoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("grupos") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("grupos") ? (
                <>
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
                  <button type="button" onClick={resetGrupoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Gestión de grupos</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetGrupoForm(); openSection("grupos"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar grupo
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("grupos")}
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
                    <tr><th>ID</th><th>Año lectivo</th><th>Grupo</th><th>Nivel</th><th>Ciclo</th><th>Jornada</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((item) => (
                      <tr key={item.GrupoId}>
                        <td>{item.GrupoId}</td>
                        <td>{item.AnioNombre || ""}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.Nivel || ""}</td>
                        <td>{getCicloPorNivel(item.Nivel)}</td>
                        <td>{item.Jornada || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditGrupo(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteGrupo(item.GrupoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("matriculas") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("matriculas") ? (
                <>
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
    <select
      value={matriculaForm.especialidadId}
      onChange={(e) => {
        const especialidadId = e.target.value;
        const especialidadSeleccionada = especialidadesCatalogo.find(
          (item) => String(item.EspecialidadId) === String(especialidadId)
        );

        setMatriculaForm((prev: any) => ({
          ...prev,
          especialidadId,
          especialidad: especialidadSeleccionada?.Descripcion || ""
        }));
      }}
    >
      <option value="">Sin especialidad</option>
      {especialidadesActivas.map((item) => (
        <option key={item.EspecialidadId} value={item.EspecialidadId}>
          {item.Descripcion}
          {item.PermiteMultiplesPorSeccion ? " - permite varias por sección" : ""}
        </option>
      ))}
    </select>
    <small style={{ opacity: 0.75 }}>
      Este campo no es obligatorio. Las especialidades se administran desde el botón Especialidades.
    </small>
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
  </div>
</form>
                </>
              ) : (
                <>
                  <h3>Matrículas</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetMatriculaForm(); openSection("matriculas"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar matrícula
                    </button>
                  </div>
                </>
              )}
              <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                <h4 style={{ margin: "0 0 12px" }}>Importar matrículas</h4>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleDescargarPlantillaMatriculas}
                    disabled={importandoMatriculas}
                  >
                    Descargar plantilla
                  </button>
                </div>
                <form className="form" onSubmit={handleImportarMatriculas} aria-busy={importandoMatriculas}>
                  <label>
                    Año lectivo
                    <select
                      value={matriculaImportAnioId}
                      onChange={(e) => setMatriculaImportAnioId(e.target.value)}
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
                    Archivo Excel
                    <input
                      ref={matriculaImportFileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      disabled={importandoMatriculas}
                      onChange={(e) => setArchivoImportacionMatricula(e.target.files?.[0] || null)}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => { void handleImportarMatriculasClick(); }}
                      disabled={importandoMatriculas || !archivoImportacionMatricula}
                    >
                      {importandoMatriculas ? "Importando..." : "Importar matrículas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setArchivoImportacionMatricula(null);
                        setMatriculaImportResult(null);
                        setMatriculaImportProgress(null);
                        if (matriculaImportFileInputRef.current) {
                          matriculaImportFileInputRef.current.value = "";
                        }
                      }}
                      style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
                    >
                      Limpiar importación
                    </button>
                  </div>
                  {importandoMatriculas && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.95rem",
                        color: "rgba(191, 219, 254, 0.95)"
                      }}
                    >
                      Iniciando importación de matrículas...
                    </div>
                  )}
                  {!importandoMatriculas && errorMessage && (
                    <div
                      style={{
                        marginTop: "10px",
                        fontSize: "0.95rem",
                        color: "#fca5a5"
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </form>

                {importandoMatriculas && (
                  <div className="processing-indicator" role="status" aria-live="polite">
                    <span className="processing-spinner" aria-hidden="true" />
                    <div className="processing-body">
                      <strong>Procesando importación de matrículas</strong>
                      <span>
                        {matriculaImportProgress
                          ? matriculaImportProgress.jobId === "pending-local"
                            ? "Enviando archivo e iniciando importación..."
                            : `${matriculaImportProgress.procesados} de ${matriculaImportProgress.totalRegistros} registros procesados`
                          : "Preparando archivo..."}
                      </span>
                      <div className="processing-progress-track" aria-label="Progreso de importación de matrículas">
                        <div
                          className="processing-progress-bar"
                          style={{ width: `${Math.max(0, Math.min(100, matriculaImportProgress?.porcentaje || 0))}%` }}
                        />
                      </div>
                      <div className="processing-progress-meta">
                        <span>{matriculaImportProgress?.porcentaje || 0}%</span>
                        <span>Creadas: {matriculaImportProgress?.totalCreados || 0}</span>
                        <span>Actualizadas: {matriculaImportProgress?.totalActualizados || 0}</span>
                        <span>Reactivadas: {matriculaImportProgress?.totalReactivados || 0}</span>
                        <span>Omitidas: {matriculaImportProgress?.totalOmitidos || 0}</span>
                        <span>Errores: {matriculaImportProgress?.totalError || 0}</span>
                      </div>
                      <span>No refresques ni cierres esta pantalla hasta que aparezca el resultado.</span>
                    </div>
                  </div>
                )}

                {matriculaImportResult && (
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                      <span><strong>Total:</strong> {matriculaImportResult.totalRegistros}</span>
                      <span><strong>Creadas:</strong> {matriculaImportResult.totalCreados}</span>
                      <span><strong>Actualizadas:</strong> {matriculaImportResult.totalActualizados}</span>
                      <span><strong>Reactivadas:</strong> {matriculaImportResult.totalReactivados}</span>
                      <span><strong>Omitidas:</strong> {matriculaImportResult.totalOmitidos}</span>
                      <span><strong>Errores:</strong> {matriculaImportResult.totalError}</span>
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleDescargarResumenMatriculas}
                      style={{ marginBottom: "12px" }}
                    >
                      Exportar resumen a Excel
                    </button>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Fila</th>
                            <th>Cédula</th>
                            <th>Sección</th>
                            <th>Estado</th>
                            <th>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matriculaImportResult.resultados.slice(0, 20).map((item) => (
                            <tr key={`${item.fila}-${item.cedula}-${item.seccion}`}>
                              <td>{item.fila}</td>
                              <td>{item.cedula}</td>
                              <td>{item.seccion}</td>
                              <td>{item.estado}</td>
                              <td>{item.motivo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de matrículas</h3>
              <form onSubmit={handleMatriculaSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por estudiante, grupo o año" value={matriculaSearch} onChange={(e) => setMatriculaSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setMatriculaSearch(""); setMatriculas([]); setMatriculaHasSearched(false); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
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
                              <button type="button" onClick={() => handleDeleteMatricula(item.MatriculaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateMatricula(item.MatriculaId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!matriculas.length && <tr><td colSpan={11} style={{ textAlign: "center", padding: "16px" }}>{matriculaHasSearched ? "No hay matrículas que coincidan con la bésqueda" : "Digite estudiante, grupo o año para buscar matrículas"}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}


        {tab === "tiposEstudiante" && (
          <div className={isSectionOpen("tiposEstudiante") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("tiposEstudiante") ? (
                <>
                  <h3>{editingTipoEstudianteId !== null ? "Editar tipo de estudiante" : "Crear tipo de estudiante"}</h3>
                  <form className="form" onSubmit={handleTipoEstudianteSubmit}>
                    <label>
                      Descripción
                      <input
                        value={tipoEstudianteForm.descripcion}
                        onChange={(e) => setTipoEstudianteForm({ ...tipoEstudianteForm, descripcion: e.target.value })}
                        placeholder="Ejemplo: Regular, Adecuación"
                        required
                      />
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loadingTipoEstudiante}>
                        {loadingTipoEstudiante ? (editingTipoEstudianteId !== null ? "Actualizando..." : "Guardando...") : (editingTipoEstudianteId !== null ? "Actualizar" : "Guardar")}
                      </button>
                      <button type="button" onClick={resetTipoEstudianteForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3>Tipo de estudiante</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetTipoEstudianteForm(); openSection("tiposEstudiante"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar tipo de estudiante
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de tipos de estudiante</h3>
              <form onSubmit={handleTipoEstudianteSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por descripción" value={tipoEstudianteSearch} onChange={(e) => setTipoEstudianteSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setTipoEstudianteSearch(""); loadTiposEstudiante("", incluirTiposEstudianteInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirTiposEstudianteInactivos} onChange={(e) => setIncluirTiposEstudianteInactivos(e.target.checked)} />
                Incluir tipos inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {tiposEstudiante.map((item) => (
                      <tr key={item.TipoEstudianteId}>
                        <td>{item.TipoEstudianteId}</td>
                        <td>{item.Descripcion}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditTipoEstudiante(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteTipoEstudiante(item.TipoEstudianteId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateTipoEstudiante(item.TipoEstudianteId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!tiposEstudiante.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: "16px" }}>No hay tipos de estudiante registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}


        {tab === "tiposAdecuacion" && (
          <div className={isSectionOpen("tiposAdecuacion") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("tiposAdecuacion") ? (
                <>
                  <h3>{editingTipoAdecuacionId !== null ? "Editar tipo de adecuación" : "Crear tipo de adecuación"}</h3>
                  <form className="form" onSubmit={handleTipoAdecuacionSubmit}>
                    <label>
                      Descripción
                      <input
                        value={tipoAdecuacionForm.descripcion}
                        onChange={(e) => setTipoAdecuacionForm({ ...tipoAdecuacionForm, descripcion: e.target.value })}
                        placeholder="Ejemplo: Curricular, No significativa"
                        required
                      />
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loadingTipoAdecuacion}>
                        {loadingTipoAdecuacion ? (editingTipoAdecuacionId !== null ? "Actualizando..." : "Guardando...") : (editingTipoAdecuacionId !== null ? "Actualizar" : "Guardar")}
                      </button>
                      <button type="button" onClick={resetTipoAdecuacionForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3>Tipo de adecuación</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetTipoAdecuacionForm(); openSection("tiposAdecuacion"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar tipo de adecuación
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de tipos de adecuación</h3>
              <form onSubmit={handleTipoAdecuacionSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por descripción" value={tipoAdecuacionSearch} onChange={(e) => setTipoAdecuacionSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setTipoAdecuacionSearch(""); loadTiposAdecuacion("", incluirTiposAdecuacionInactivos); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirTiposAdecuacionInactivos} onChange={(e) => setIncluirTiposAdecuacionInactivos(e.target.checked)} />
                Incluir tipos inactivos
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {tiposAdecuacion.map((item) => (
                      <tr key={item.TipoAdecuacionId}>
                        <td>{item.TipoAdecuacionId}</td>
                        <td>{item.Descripcion}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditTipoAdecuacion(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteTipoAdecuacion(item.TipoAdecuacionId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateTipoAdecuacion(item.TipoAdecuacionId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!tiposAdecuacion.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: "16px" }}>No hay tipos de adecuación registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "adecuaciones" && (
          <div className={isSectionOpen("adecuaciones") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("adecuaciones") ? (
                <>
                  <h3>{editingAdecuacionId !== null ? "Editar adecuación" : "Crear adecuación"}</h3>
                  <form className="form" onSubmit={handleAdecuacionSubmit}>
                    <label>
                      Adecuación
                      <select
                        value={adecuacionForm.tipoAdecuacionId}
                        onChange={(e) => setAdecuacionForm({ ...adecuacionForm, tipoAdecuacionId: e.target.value })}
                        required
                      >
                        <option value="">Seleccione</option>
                        {tiposAdecuacion.filter((item) => item.Activo).map((item) => (
                          <option key={item.TipoAdecuacionId} value={item.TipoAdecuacionId}>
                            {item.Descripcion}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <input
                        value={adecuacionForm.tipo}
                        onChange={(e) => setAdecuacionForm({ ...adecuacionForm, tipo: e.target.value })}
                        placeholder="Ejemplo: Apoyos Curriculares (Metodología)"
                        required
                      />
                    </label>
                    <label>
                      Descripción
                      <textarea
                        value={adecuacionForm.descripcion}
                        onChange={(e) => setAdecuacionForm({ ...adecuacionForm, descripcion: e.target.value })}
                        rows={4}
                        placeholder="Detalle de la adecuación"
                        required
                      />
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loadingAdecuacion}>
                        {loadingAdecuacion ? (editingAdecuacionId !== null ? "Actualizando..." : "Guardando...") : (editingAdecuacionId !== null ? "Actualizar" : "Guardar")}
                      </button>
                      <button type="button" onClick={resetAdecuacionForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3>Adecuación</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetAdecuacionForm(); openSection("adecuaciones"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar nueva
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de adecuaciones</h3>
              <form onSubmit={handleAdecuacionSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por tipo o descripción" value={adecuacionSearch} onChange={(e) => setAdecuacionSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setAdecuacionSearch(""); loadAdecuaciones("", incluirAdecuacionesInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirAdecuacionesInactivas} onChange={(e) => setIncluirAdecuacionesInactivas(e.target.checked)} />
                Incluir adecuaciones inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Adecuación</th><th>Tipo</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {adecuaciones.map((item) => (
                      <tr key={item.AdecuacionCatalogoId}>
                        <td>{item.AdecuacionCatalogoId}</td>
                        <td>{item.Adecuacion}</td>
                        <td>{item.Tipo}</td>
                        <td>{item.Descripcion}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditAdecuacion(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteAdecuacion(item.AdecuacionCatalogoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateAdecuacion(item.AdecuacionCatalogoId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!adecuaciones.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "16px" }}>No hay adecuaciones registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}


        {tab === "especialidades" && (
          <div className={isSectionOpen("especialidades") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("especialidades") ? (
                <>
                  <h3>{editingEspecialidadId !== null ? "Editar especialidad" : "Crear especialidad"}</h3>
                  <form className="form" onSubmit={handleEspecialidadSubmit}>
                    <label>
                      Descripción
                      <input
                        value={especialidadForm.descripcion}
                        onChange={(e) => setEspecialidadForm({ ...especialidadForm, descripcion: e.target.value })}
                        placeholder="Ejemplo: Contabilidad, Informática, Turismo"
                        required
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={!!especialidadForm.permiteMultiplesPorSeccion}
                        onChange={(e) => setEspecialidadForm({ ...especialidadForm, permiteMultiplesPorSeccion: e.target.checked })}
                      />
                      <span>
                        Permitir diferentes especialidades en una misma sección durante la misma lección
                        <small style={{ display: "block", opacity: 0.75 }}>
                          Marcá esta opción cuando una misma sección pueda dividirse por especialidades, por ejemplo Contabilidad, Informática y Turismo en la misma franja de clase.
                        </small>
                      </span>
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loadingEspecialidad}>
                        {loadingEspecialidad ? (editingEspecialidadId !== null ? "Actualizando..." : "Guardando...") : (editingEspecialidadId !== null ? "Actualizar" : "Guardar")}
                      </button>
                      <button type="button" onClick={resetEspecialidadForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3>Especialidades</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetEspecialidadForm(); openSection("especialidades"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar especialidad
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de especialidades</h3>
              <form onSubmit={handleEspecialidadSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por descripción" value={especialidadSearch} onChange={(e) => setEspecialidadSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setEspecialidadSearch(""); loadEspecialidades("", incluirEspecialidadesInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirEspecialidadesInactivas} onChange={(e) => setIncluirEspecialidadesInactivas(e.target.checked)} />
                Incluir especialidades inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Descripción</th><th>Varias por sección</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {especialidades.map((item) => (
                      <tr key={item.EspecialidadId}>
                        <td>{item.EspecialidadId}</td>
                        <td>{item.Descripcion}</td>
                        <td>{item.PermiteMultiplesPorSeccion ? "Sí" : "No"}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditEspecialidad(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteEspecialidad(item.EspecialidadId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateEspecialidad(item.EspecialidadId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!especialidades.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>No hay especialidades registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}


        {tab === "rutasTransporte" && (
          <div className={isSectionOpen("rutasTransporte") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("rutasTransporte") ? (
                <>
                  <h3>{editingRutaTransporteId !== null ? "Editar ruta" : "Crear ruta"}</h3>
                  <form className="form" onSubmit={handleRutaTransporteSubmit}>
                    <label>
                      Descripción
                      <input value={rutaTransporteForm.descripcion} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, descripcion: e.target.value })} placeholder="Ejemplo: Ruta Norte" required />
                    </label>
                    <label>
                      Responsable
                      <input value={rutaTransporteForm.responsable} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, responsable: e.target.value })} placeholder="Nombre del responsable" />
                    </label>
                    <label>
                      Lugar de inicio
                      <input value={rutaTransporteForm.lugarInicio} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, lugarInicio: e.target.value })} />
                    </label>
                    <label>
                      Lugar de fin
                      <input value={rutaTransporteForm.lugarFin} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, lugarFin: e.target.value })} />
                    </label>
                    <label>
                      Capacidad de estudiantes
                      <input type="number" min="0" value={rutaTransporteForm.capacidadEstudiantes} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, capacidadEstudiantes: e.target.value })} />
                    </label>
                    <label>
                      Hora de inicio
                      <input type="time" value={rutaTransporteForm.horaInicio} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, horaInicio: e.target.value })} />
                    </label>
                    <label>
                      Hora de fin
                      <input type="time" value={rutaTransporteForm.horaFin} onChange={(e) => setRutaTransporteForm({ ...rutaTransporteForm, horaFin: e.target.value })} />
                    </label>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={loadingRutaTransporte}>
                        {loadingRutaTransporte ? (editingRutaTransporteId !== null ? "Actualizando..." : "Guardando...") : (editingRutaTransporteId !== null ? "Actualizar" : "Guardar")}
                      </button>
                      <button type="button" onClick={resetRutaTransporteForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <h3>Rutas</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetRutaTransporteForm(); openSection("rutasTransporte"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar ruta
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="card" style={{ marginBottom: 0 }}>
              <h3>Listado de rutas</h3>
              <form onSubmit={handleRutaTransporteSearch} style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <input placeholder="Buscar por descripción, responsable o lugares" value={rutaTransporteSearch} onChange={(e) => setRutaTransporteSearch(e.target.value)} style={{ flex: 1, minWidth: "240px" }} />
                <button className="primary-btn" type="submit">Buscar</button>
                <button type="button" onClick={() => { setRutaTransporteSearch(""); loadRutasTransporte("", incluirRutasTransporteInactivas); }} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Limpiar
                </button>
              </form>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input type="checkbox" checked={incluirRutasTransporteInactivas} onChange={(e) => setIncluirRutasTransporteInactivas(e.target.checked)} />
                Incluir rutas inactivas
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Descripción</th><th>Responsable</th><th>Inicio</th><th>Fin</th><th>Capacidad</th><th>Horario</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {rutasTransporte.map((item) => (
                      <tr key={item.RutaTransporteId}>
                        <td>{item.RutaTransporteId}</td>
                        <td>{item.Descripcion}</td>
                        <td>{item.Responsable || ""}</td>
                        <td>{item.LugarInicio || ""}</td>
                        <td>{item.LugarFin || ""}</td>
                        <td>{item.CapacidadEstudiantes ?? ""}</td>
                        <td>{[formatTime(item.HoraInicio), formatTime(item.HoraFin)].filter(Boolean).join(" - ")}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditRutaTransporte(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteRutaTransporte(item.RutaTransporteId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateRutaTransporte(item.RutaTransporteId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!rutasTransporte.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: "16px" }}>No hay rutas registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "evaluacion" && (
          <EvaluacionParametrizacionPage />
        )}

        {tab === "materias" && (
          <div className={isSectionOpen("materias") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("materias") ? (
                <>
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={!!materiaForm.esMateriaEspecial}
                    onChange={(e) => setMateriaForm({ ...materiaForm, esMateriaEspecial: e.target.checked })}
                    style={{ marginTop: "3px" }}
                  />
                  <span>
                    Materia especial
                    <small style={{ display: "block", color: "#64748b", marginTop: "4px" }}>
                      Permití que un profesor comparta esta lección con varios grupos solo cuando las materias del cruce estén marcadas como especiales.
                    </small>
                  </span>
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingMateria}>
                    {loadingMateria ? (editingMateriaId !== null ? "Actualizando..." : "Guardando...") : (editingMateriaId !== null ? "Actualizar" : "Guardar")}
                  </button>
                  <button type="button" onClick={resetMateriaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Materias</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetMateriaForm(); openSection("materias"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar materia
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("materias")}
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
                    <tr><th>ID</th><th>Código</th><th>Nombre</th><th>Especial</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {materias.map((item) => (
                      <tr key={item.MateriaId}>
                        <td>{item.MateriaId}</td>
                        <td>{item.Codigo || ""}</td>
                        <td>{item.Nombre}</td>
                        <td>{item.EsMateriaEspecial ? "Sí" : "No"}</td>
                        <td>{item.Descripcion || ""}</td>
                        <td>{item.Activo ? "Activo" : "Inactivo"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => handleEditMateria(item)} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Editar</button>
                            {item.Activo ? (
                              <button type="button" onClick={() => handleDeleteMateria(item.MateriaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
                            ) : (
                              <button type="button" onClick={() => handleReactivateMateria(item.MateriaId)} style={{ border: "1px solid #bbf7d0", background: "#ecfdf3", color: "#166534", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Reactivar</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!materias.length && <tr><td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>No hay materias registradas</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "asignaciones" && (
          <div className={isSectionOpen("asignaciones") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("asignaciones") ? (
                <>
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
                  <button type="button" onClick={resetAsignacionForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Asignación docente</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetAsignacionForm(); openSection("asignaciones"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar asignación
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("asignaciones-docentes")}
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
                              <button type="button" onClick={() => handleDeleteAsignacion(item.AsignacionDocenteId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("bloques") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("bloques") ? (
                <>
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
                  <button type="button" onClick={resetBloqueForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Bloques horarios</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetBloqueForm(); openSection("bloques"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar bloque horario
                    </button>
                  </div>
                </>
              )}
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
          <div className={isSectionOpen("gruposMateria") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("gruposMateria") ? (
                <>
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
                  <button type="button" onClick={resetGrupoMateriaForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Materias por grupo</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetGrupoMateriaForm(); openSection("gruposMateria"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar materia por grupo
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("grupos-materia")}
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
                              <button type="button" onClick={() => handleDeleteGrupoMateria(item.GrupoMateriaId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("horarios") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("horarios") ? (
                <>
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
                  <button type="button" onClick={resetHorarioForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Horario de clases</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetHorarioForm(); openSection("horarios"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar horario
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("horarios-grupo")}
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
                              <button type="button" onClick={() => handleDeleteHorario(item.HorarioGrupoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
          <div className={isSectionOpen("diasLectivos") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("diasLectivos") ? (
                <>
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
                <button type="button" onClick={handleCancelarDiasLectivos} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
                </>
              ) : (
                <>
                  <h3>Configuración de días lectivos</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); openSection("diasLectivos"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Editar días lectivos
                    </button>
                  </div>
                </>
              )}
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
          <div className={isSectionOpen("feriados") ? "two-col" : "stack"}>
            <section className="card" style={{ marginBottom: 0 }}>
              {isSectionOpen("feriados") ? (
                <>
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
                  <button type="button" onClick={resetFeriadoForm} style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
                </>
              ) : (
                <>
                  <h3>Feriados</h3>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={() => { clearMessages(); resetFeriadoForm(); openSection("feriados"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      Agregar feriado
                    </button>
                  </div>
                </>
              )}
              {renderAcademicoBulkImportPanel("feriados")}
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
                              <button type="button" onClick={() => handleDeleteFeriado(item.FeriadoId)} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", padding: "6px 10px", cursor: "pointer" }}>Eliminar</button>
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
              <h3>Sincronización por período</h3>
              <p style={{ marginTop: 0, color: "#475569", lineHeight: 1.5 }}>
                Este proceso recalcula las fechas de clase del período completo y solo aplica cambios a fechas futuras.
                El histórico anterior y las fechas con asistencia registrada se conservan.
              </p>

              <form className="form" onSubmit={handleFechaClaseSyncPreview}>
                <label>
                  Período
                  <select
                    value={fechaClaseSyncForm.periodoId}
                    onChange={(e) => setFechaClaseSyncForm({ ...fechaClaseSyncForm, periodoId: e.target.value })}
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
                  Aplicar desde
                  <input
                    type="date"
                    value={fechaClaseSyncForm.fechaCorte}
                    onChange={(e) => setFechaClaseSyncForm({ ...fechaClaseSyncForm, fechaCorte: e.target.value })}
                  />
                </label>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button className="primary-btn" disabled={loadingFechaClaseSync}>
                    {loadingFechaClaseSync ? "Analizando..." : "Analizar período"}
                  </button>
                  <button
                    type="button"
                    onClick={handleFechaClaseSyncApply}
                    disabled={loadingFechaClaseSync || !fechaClaseSyncPreview}
                    style={{
                      border: "1px solid #bbf7d0",
                      background: fechaClaseSyncPreview ? "#16a34a" : "#dcfce7",
                      color: fechaClaseSyncPreview ? "#fff" : "#166534",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      cursor: loadingFechaClaseSync || !fechaClaseSyncPreview ? "not-allowed" : "pointer",
                      opacity: loadingFechaClaseSync || !fechaClaseSyncPreview ? 0.7 : 1
                    }}
                  >
                    {loadingFechaClaseSync ? "Aplicando..." : "Sincronizar fechas futuras"}
                  </button>
                  <button
                    type="button"
                    onClick={resetFechaClaseSyncForm}
                    style={{ border: "1px solid #d1d5db", borderRadius: "10px", padding: "10px 14px", background: "#fff", cursor: "pointer" }}
                  >
                    Limpiar
                  </button>
                </div>
              </form>

              {fechaClaseSyncPreview && (
                <div style={{ marginTop: "18px", display: "grid", gap: "14px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "10px"
                    }}
                  >
                    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#1d4ed8" }}>Horarios activos</div>
                      <strong>{fechaClaseSyncPreview.resumen.horariosActivos}</strong>
                    </div>
                    <div style={{ background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#166534" }}>Crear</div>
                      <strong>{fechaClaseSyncPreview.resumen.crear}</strong>
                    </div>
                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#c2410c" }}>Eliminar</div>
                      <strong>{fechaClaseSyncPreview.resumen.eliminar}</strong>
                    </div>
                    <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#334155" }}>Mantener</div>
                      <strong>{fechaClaseSyncPreview.resumen.mantener}</strong>
                    </div>
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#b91c1c" }}>Bloqueadas</div>
                      <strong>{fechaClaseSyncPreview.resumen.bloqueadasPorAsistencia}</strong>
                    </div>
                    <div style={{ background: "#faf5ff", border: "1px solid #d8b4fe", borderRadius: "12px", padding: "12px" }}>
                      <div style={{ fontSize: "12px", color: "#7c3aed" }}>Conflictos</div>
                      <strong>{fechaClaseSyncPreview.resumen.conflictos}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: "13px", color: "#475569" }}>
                    Período aplicado: <strong>{fechaClaseSyncPreview.periodo.Nombre}</strong> | Rango del período: {formatDate(fechaClaseSyncPreview.periodo.FechaInicio)} a {formatDate(fechaClaseSyncPreview.periodo.FechaFin)} | Fecha efectiva de cambio: {formatDate(fechaClaseSyncPreview.fechaCorteAplicada)}
                  </div>

                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <h4 style={{ marginBottom: "8px" }}>Fechas a crear</h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Grupo</th>
                              <th>Materia</th>
                              <th>Bloque</th>
                              <th>Día</th>
                              <th>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fechaClaseSyncPreview.crear.slice(0, 15).map((item, index) => (
                              <tr key={`${item.HorarioGrupoId}-${item.Fecha}-${index}`}>
                                <td>{formatDate(item.Fecha)}</td>
                                <td>{item.GrupoNombre} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                                <td>{item.MateriaNombre}</td>
                                <td>{item.BloqueNombre}</td>
                                <td>{item.DiaSemanaNombre}</td>
                                <td>{item.Motivo || ""}</td>
                              </tr>
                            ))}
                            {!fechaClaseSyncPreview.crear.length && (
                              <tr><td colSpan={6} style={{ textAlign: "center", padding: "12px" }}>No hay fechas nuevas por crear</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h4 style={{ marginBottom: "8px" }}>Fechas que no se tocarán</h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Grupo</th>
                              <th>Materia</th>
                              <th>Bloque</th>
                              <th>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fechaClaseSyncPreview.bloqueadas.slice(0, 15).map((item, index) => (
                              <tr key={`${item.FechaClaseId}-${index}`}>
                                <td>{formatDate(item.Fecha)}</td>
                                <td>{item.GrupoNombre} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                                <td>{item.MateriaNombre}</td>
                                <td>{item.BloqueNombre}</td>
                                <td>{item.Motivo || ""}</td>
                              </tr>
                            ))}
                            {!fechaClaseSyncPreview.bloqueadas.length && (
                              <tr><td colSpan={5} style={{ textAlign: "center", padding: "12px" }}>No hay fechas bloqueadas por asistencia</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h4 style={{ marginBottom: "8px" }}>Conflictos detectados</h4>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Grupo</th>
                              <th>Materia</th>
                              <th>Bloque</th>
                              <th>Motivo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fechaClaseSyncPreview.conflictos.slice(0, 15).map((item, index) => (
                              <tr key={`${item.HorarioGrupoId}-${item.Fecha}-conflicto-${index}`}>
                                <td>{formatDate(item.Fecha)}</td>
                                <td>{item.GrupoNombre} {item.GrupoNivel ? `- ${item.GrupoNivel}` : ""}</td>
                                <td>{item.MateriaNombre}</td>
                                <td>{item.BloqueNombre}</td>
                                <td>{item.Motivo || ""}</td>
                              </tr>
                            ))}
                            {!fechaClaseSyncPreview.conflictos.length && (
                              <tr><td colSpan={5} style={{ textAlign: "center", padding: "12px" }}>No se detectaron conflictos para este período</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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




