// @ts-nocheck
import React from "react";

export type GrupoProfesor = {
  AsignacionDocenteId: number;
  UsuarioId: number;
  InstitucionId: number;
  GrupoId: number;
  GrupoNombre: string;
  GrupoNivel?: string | null;
  GrupoJornada?: string | null;
  MateriaId: number;
  MateriaNombre: string;
  MateriaCodigo?: string | null;
  AnioLectivoId: number;
  AnioNombre: string;
  PeriodoId: number;
  PeriodoNombre: string;
  TipoAsignacion?: string | null;
  ProfesorNombre?: string | null;
  ProfesorPrimerApellido?: string | null;
  ProfesorSegundoApellido?: string | null;
  TotalEstudiantes: number;
  EvaluacionPlantillaId?: number | null;
  EvaluacionPlantillaNombre?: string | null;
  EvaluacionPlantillaEstado?: string | null;
  TieneEstructuraEvaluacion?: boolean | number | null;
  TieneCalificacionesEvaluacion?: boolean | number | null;
  CursoCerrado?: boolean | number | null;
  CierreCursoEstado?: string | null;
  CierreCursoCerradoAt?: string | null;
  CierreCursoReabiertoAt?: string | null;
};

export type EstudianteGrupo = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  Correo?: string | null;
  Telefono?: string | null;
  EncargadoPrincipalNombre?: string | null;
  EncargadoPrincipalCorreo?: string | null;
  EncargadoPrincipalTelefono?: string | null;
  EncargadosWhatsAppDetalle?: string | null;
  AutorizaWhatsAppEncargado?: boolean | number;
  MatriculaId: number;
  EstadoMatricula: string;
  FueTrasladado?: boolean | number;
  GrupoIdOrigenTraslado?: number | null;
  GrupoNombreOrigenTraslado?: string | null;
  GrupoIdDestinoTraslado?: number | null;
  TrasladoCreatedAt?: string | null;
};

export type ApoyoEducativoSeccion = {
  GrupoId: number;
  GrupoNombre: string;
  AnioLectivoId?: number | null;
  AnioNombre?: string | null;
  PeriodoId?: number | null;
  PeriodoNombre?: string | null;
};

export type ApoyoEducativoCatalogoItem = {
  AdecuacionCatalogoId: number;
  TipoAdecuacionId: number;
  Adecuacion: string;
  Tipo: string;
  Descripcion: string;
  TipoAdecuacion?: string | null;
};

export type ApoyoEducativoResumenItem = {
  EstudianteId: number;
  Identificacion: string;
  NombreCompleto: string;
  Edad?: number | null;
  GrupoId: number;
  Seccion: string;
  PeriodoId?: number | null;
  PeriodoNombre?: string | null;
  TieneAdecuacion?: boolean | null;
  TipoAdecuacion?: string | null;
  NivelFuncionamiento?: string | null;
  Observaciones?: string | null;
};

export type ApoyoEducativoInformeItem = {
  ApoyoEducativoId: number;
  ApoyoEducativoEstudianteId: number;
  EstudianteId: number;
  GrupoId: number;
  PeriodoId?: number | null;
  PeriodoNombre?: string | null;
  InformeNombre?: string | null;
  InformeGeneradoAt?: string | null;
  PlantillaNombre?: string | null;
};

export type Plantilla = {
  EvaluacionPlantillaId: number;
  Nombre: string;
  DecimalesNota: number;
  Estado: string;
  PermitirProfesorEditar: boolean;
};

export type Componente = {
  EvaluacionComponenteId: number;
  EvaluacionPlantillaId: number;
  Descripcion: string;
  Porcentaje: number;
  Orden: number;
  Activo: boolean;
};

export type Actividad = {
  EvaluacionActividadId: number;
  EvaluacionComponenteId: number;
  Descripcion: string;
  Porcentaje: number;
  Fecha?: string | null;
  Orden: number;
  Activo: boolean;
  ComponentePorcentaje: number;
  PorcentajeReal: number;
};

export type Nota = {
  EvaluacionNotaId: number;
  EvaluacionActividadId: number;
  EstudianteId: number;
  GrupoId: number;
  MateriaId: number;
  PeriodoId: number;
  Nota: number;
  PorcentajeGanado: number;
  Observacion?: string | null;
};

export type NivelDesempeno = {
  NivelDesempenoId: number;
  Descripcion: string;
  Valor: number;
  Activo?: boolean;
};



export type PlaneamientoHabilidad = {
  PlaneamientoHabilidadId: number;
  InstitucionId?: number | null;
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
  Activo?: boolean;
};

export type PlaneamientoIaResultadoSemana = {
  semana?: number;
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
};

export type PlaneamientoIaResultado = {
  nombre?: string;
  enfoque?: string;
  advertencia?: string;
  periodicidad?: string;
  competenciaGeneral?: string;
  competenciasGenerales?: string[];
  aprendizajesEsperados?: string[];
  estrategiasMediacion?: string[] | string;
  estrategiaAdecuacionSignificativa?: {
    aplica?: boolean;
    colorResaltado?: string;
    titulo?: string;
    proposito?: string;
    actividadAdaptada?: string;
    apoyoDocente?: string;
    recursoAjustado?: string;
    productoEsperado?: string;
    evaluacionAjustada?: string;
    textoVisible?: string;
  };
  indicadoresEvaluacion?: string[];
  trabajoCotidiano?: string[];
  tareas?: string[];
  evaluacionSugerida?: string[];
  recursos?: string[];
  reflexionesDocentes?: {
    queFunciono?: string;
    queNoFunciono?: string;
    quePuedoMejorar?: string;
  };
  observaciones?: string;
  semanas?: PlaneamientoIaResultadoSemana[];
};

export function toTextList(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function toTextValue(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

export function normalizePlaneamientoIaResultado(input: any): PlaneamientoIaResultado {
  const data = (input && typeof input === "object") ? input : {};
  const reflexiones = (data.reflexionesDocentes && typeof data.reflexionesDocentes === "object")
    ? data.reflexionesDocentes
    : {};
  const adecuacion = (data.estrategiaAdecuacionSignificativa && typeof data.estrategiaAdecuacionSignificativa === "object")
    ? data.estrategiaAdecuacionSignificativa
    : {};

  return {
    ...data,
    nombre: toTextValue(data.nombre),
    enfoque: toTextValue(data.enfoque),
    periodicidad: toTextValue(data.periodicidad),
    competenciaGeneral: toTextValue(data.competenciaGeneral),
    aprendizajesEsperados: toTextList(data.aprendizajesEsperados),
    estrategiasMediacion: toTextValue(data.estrategiasMediacion),
    indicadoresEvaluacion: toTextList(data.indicadoresEvaluacion),
    trabajoCotidiano: toTextList(data.trabajoCotidiano),
    tareas: toTextList(data.tareas),
    evaluacionSugerida: toTextList(data.evaluacionSugerida),
    recursos: toTextList(data.recursos),
    observaciones: toTextValue(data.observaciones),
    reflexionesDocentes: {
      queFunciono: toTextValue(reflexiones.queFunciono),
      queNoFunciono: toTextValue(reflexiones.queNoFunciono),
      quePuedoMejorar: toTextValue(reflexiones.quePuedoMejorar)
    },
    estrategiaAdecuacionSignificativa: {
      ...adecuacion,
      aplica: !!adecuacion.aplica,
      textoVisible: toTextValue(adecuacion.textoVisible),
      titulo: toTextValue(adecuacion.titulo),
      colorResaltado: toTextValue(adecuacion.colorResaltado)
    }
  };
}

export type PlaneamientoIaForm = {
  materiaId: string;
  grado: string;
  grupoId: string;
  grupoIds: string[];
  filtroTipo: "" | "mes" | "area";
  mes: string;
  area: string;
  tema: string;
  semanas: string;
  tipoColegio: string;
  fechaInicio: string;
  fechaFin: string;
  periodicidad: string;
  competenciaGeneral: string;
  indicaciones: string;
  busquedaTexto: string;
  habilidadesIds: number[];
};

export type PlantillaPromptIA = {
  Id: number;
  TipoGeneracionIAId: number;
  TipoGeneracionIANombre?: string | null;
  NombrePlantilla: string;
  IndicacionesSistema?: string | null;
  ContextoBase?: string | null;
  ReglasConstruccion?: string | null;
  EstructuraSalida?: string | null;
  FormatoRespuesta?: string | null;
  Activo?: boolean | number;
};


export type Eval360Plantilla = {
  EvaluacionPlantillaId: number;
  Nombre: string;
  MateriaNombre?: string | null;
  AnioNombre?: string | null;
  PeriodoNombre?: string | null;
  Estado?: string | null;
  TotalPorcentaje?: number | null;
  PermitirProfesorEditar?: boolean;
};

export type Eval360Detalle = {
  EstructuraGrupoDetalleId?: number;
  ComponenteCatalogoId: number;
  Nombre: string;
  Porcentaje: number;
  Orden: number;
  Activo?: boolean | number;
  ComponenteCatalogoNombre?: string | null;
};

export type Eval360Nivel = {
  NivelDesempenoGrupoId?: number;
  Nombre: string;
  Valor: number;
  Orden: number;
  Activo?: boolean | number;
};

export type Eval360Estructura = {
  EstructuraGrupoId: number;
  Nombre: string;
  PlantillaBaseId?: number | null;
  PlantillaBaseNombre?: string | null;
  TotalPorcentaje?: number | null;
  GrupoNombre?: string | null;
  MateriaNombre?: string | null;
  AnioNombre?: string | null;
  PeriodoNombre?: string | null;
};

export type Eval360EstructuraData = {
  estructura: Eval360Estructura | null;
  detalles: Eval360Detalle[];
  niveles: Eval360Nivel[];
  creada?: boolean;
};


export type Eval360Indicador = {
  IndicadorGrupoId: number;
  EstructuraGrupoId: number;
  PlaneamientoId?: number | null;
  TipoUso: "Cotidiano" | "Tareas" | "TablaEspecificaciones" | string;
  IndicadorBase: string;
  IndicadorAvanzado: string;
  IndicadorIntermedio: string;
  IndicadorInicial: string;
  Activo?: boolean | number;
};


export type SeguimientoEvaluacionDetalle = Eval360Detalle & {
  PermiteIndicadoresPlaneamiento?: boolean | number;
  TipoIndicadorPlaneamiento?: string | null;
  TipoSeguimiento?: string | null;
  ComponenteCatalogoNombre?: string | null;
};

export type SeguimientoActividad = {
  ActividadId: number;
  EstructuraGrupoId: number;
  EstructuraGrupoDetalleId: number;
  Nombre: string;
  Descripcion?: string | null;
  Fecha?: string | null;
  PuntosMaximos: number;
  PorcentajeDentroRubro?: number | null;
  UsaIndicadoresPlaneamiento?: boolean | number;
  Fuente?: string | null;
  Activo?: boolean | number;
};

export type SeguimientoNotaActividad = {
  NotaActividadId: number;
  ActividadId: number;
  EstudianteId: number;
  PuntosObtenidos?: number | null;
  PuntosMaximos?: number | null;
  NotaObtenida?: number | null;
  PorcentajeObtenido?: number | null;
  Observacion?: string | null;
};

export type SeguimientoAsistenciaRegistro = {
  AsistenciaRegistroId: number;
  EstudianteId: number;
  Fecha: string;
  Estado: string;
  MinutosTardia?: number | null;
  Observacion?: string | null;
  HorarioGrupoId?: number | null;
  BloqueHorarioId?: number | null;
  BloqueNombre?: string | null;
  HoraInicio?: string | null;
  HoraFin?: string | null;
};

export type SeguimientoEvaluacionContexto = {
  estructura: Eval360Estructura | null;
  detalles: SeguimientoEvaluacionDetalle[];
  plantillas: Eval360Plantilla[];
  estudiantes: EstudianteGrupo[];
  planeamientos: Array<Pick<Planeamiento, "PlaneamientoId" | "Nombre" | "FechaInicio" | "FechaFin" | "ResultadoIAJson"> & { Tema?: string | null }>;
  indicadores: Array<Eval360Indicador & { PlaneamientoNombre?: string | null }>;
  actividades: SeguimientoActividad[];
  actividadIndicadores?: Array<{
    ActividadId: number;
    IndicadorGrupoId: number;
    Activo?: boolean | number;
    NumeroLecciones?: number | null;
    Puntos?: number | null;
    DetalleItemsJson?: string | null;
  }>;
  notasActividades: SeguimientoNotaActividad[];
  asistenciaRegistros?: SeguimientoAsistenciaRegistro[];
  mensajesSeguimiento?: Array<{
    MensajeSeguimientoId: number;
    TipoUso: string;
    ValorNivel?: number | null;
    Titulo?: string | null;
    Cuerpo?: string | null;
  }>;
  seguimientos: Array<{
    SeguimientoIndicadorId: number;
    ActividadId: number;
    IndicadorGrupoId: number;
    EstudianteId: number;
    NivelDesempenoGrupoId: number;
    ValorSeleccionado: number;
    Observacion?: string | null;
    ActRecuperacion?: boolean | number | null;
    ActRecuperacionTexto?: string | null;
    NivelNombre: string;
    EstructuraGrupoDetalleId: number;
  }>;
};

export type ExamenIaDraft = {
  tablaId: string;
  plantillaId: string;
  seccionIds: string[];
  archivoFormato: File | null;
  indicaciones: string;
  documentoApoyo: File | null;
  nombre: string;
  tipoColegio: string;
  fuenteWord: string;
  tamanoWord: string;
};

export type ExamenIaCreado = {
  id: string;
  actividadIdTabla: string;
  nombre: string;
  materia: string;
  grado: string;
  periodo: string;
  secciones: string[];
  tablaNombre: string;
  plantillaNombre: string;
  indicaciones: string;
  resultadoIA?: string;
  creadoEn: string;
};

export type SeguimientoEstado = "INICIAL" | "INTERMEDIO" | "AVANZADO" | "AUSENTE" | "NO_ENTREGADO";
export type SeguimientoDrafts = Record<string, SeguimientoEstado | "">;
export type SeguimientoInformarDraft = { informar: boolean; observacion: string };
export type SeguimientoInformarDrafts = Record<string, SeguimientoInformarDraft>;
export type SeguimientoRecuperacionDraft = { activa: boolean; texto: string };
export type SeguimientoRecuperacionDrafts = Record<string, SeguimientoRecuperacionDraft>;
export type SeguimientoExamenDraft = { puntosObtenidos: string; observacion: string };
export type SeguimientoExamenDrafts = Record<string, SeguimientoExamenDraft>;
export type SeguimientoActividadInformarDraft = { informar: boolean; observacion: string; mensajeEditado?: boolean };
export type SeguimientoActividadInformarDrafts = Record<string, SeguimientoActividadInformarDraft>;
export type SeguimientoActividadPuntosMaximosDrafts = Record<string, string>;
export const initialPlaneamientoIaForm: PlaneamientoIaForm = {
  materiaId: "",
  grado: "",
  grupoId: "",
  grupoIds: [],
  filtroTipo: "",
  mes: "",
  area: "",
  tema: "",
  semanas: "4",
  tipoColegio: "Académico",
  fechaInicio: "",
  fechaFin: "",
  periodicidad: "",
  competenciaGeneral: "",
  indicaciones: "",
  busquedaTexto: "",
  habilidadesIds: []
};
export type Planeamiento = {
  PlaneamientoId: number;
  InstitucionId: number;
  AnioLectivoId: number;
  PeriodoId: number;
  GrupoId: number;
  MateriaId: number;
  UsuarioId: number;
  Nombre: string;
  FechaInicio?: string | null;
  FechaFin?: string | null;
  Observaciones?: string | null;
  ResultadoIAJson?: string | null;
  Activo: boolean;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
};

export type PlaneamientoIndicador = {
  PlaneamientoIndicadorId?: number;
  PlaneamientoId?: number;
  Descripcion: string;
  NivelDesempenoId?: number | null;
  NivelDescripcion?: string | null;
  NivelValor?: number | null;
};

export type PlaneamientoForm = {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  observaciones: string;
  indicadores: PlaneamientoIndicador[];
};

export type DetalleGrupo = {
  asignacion: GrupoProfesor;
  estudiantes: EstudianteGrupo[];
  plantilla: Plantilla | null;
  componentes: Componente[];
  actividades: Actividad[];
  notas: Nota[];
};



export type AsistenciaRegistro = {
  AsistenciaRegistroId?: number;
  EstudianteId: number;
  HorarioGrupoId?: number | null;
  BloqueHorarioId?: number | null;
  Estado: EstadoAsistencia;
  MinutosTardia?: number | null;
  Observacion?: string | null;
};

export type ResumenAsistencia = {
  EstudianteId: number;
  Identificacion: string;
  Nombre: string;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  TotalLecciones: number;
  AusenciasInjustificadasEquivalentes: number;
  PorcentajeAusencias: number;
  PorcentajeAsignadoArticulo37: number;
};

export type AsistenciaLeccion = {
  HorarioGrupoId: number;
  BloqueHorarioId: number;
  Nombre: string;
  HoraInicio: string;
  HoraFin: string;
  OrdenVisual?: number | null;
  DiaSemana?: number | null;
};

export type AsistenciaDraft = Record<string, {
  estado: EstadoAsistencia;
  minutosTardia: string;
  observacion: string;
  notificarEncargado?: boolean;
}>;
export type AsistenciaNotificacionEstado = Record<string, { correoEnviado?: boolean; waEnviado?: boolean }>;

export type NoteDrafts = Record<string, string>;
export type ActivePanel = "" | "asistencia" | "notas" | "seguimiento" | "horario" | "planeamientos" | "examenes_tabla" | "bitacora" | "reportes";
export type TipoReporteGestion = "ASISTENCIA" | "COTIDIANO" | "TAREAS" | "EXAMENES" | "MENSAJES" | "BOLETAS" | "NOTAS" | "BITACORA";


export type HorarioBloque = {
  BloqueHorarioId: number;
  Nombre: string;
  HoraInicio: string;
  HoraFin: string;
  OrdenVisual: number;
};

export type HorarioEntrada = {
  HorarioGrupoId: number;
  BloqueHorarioId: number;
  DiaSemana: number;
  GrupoId: number;
  GrupoNombre: string;
  MateriaId: number;
  MateriaNombre: string;
  MateriaCodigo?: string | null;
};

export type EstadoAsistencia = "PRESENTE" | "AUSENTE_JUSTIFICADA" | "AUSENTE_INJUSTIFICADA" | "TARDIA_MENOR_10" | "TARDIA_MAYOR_10";
export type AuditoriaEnvioFila = {
  ReporteEnvioBitacoraId: number;
  Modulo: string;
  ModuloNombre: string;
  RegistroClave: string;
  Fecha: string;
  CorreoEnviado: boolean;
  WaEnviado: boolean;
  UltimoEnvioAt?: string | null;
  EstudianteId?: number | null;
  Identificacion?: string | null;
  Nombre?: string | null;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
};
export type BoletaConductaReporte = {
  BoletaConductaId: number;
  Consecutivo: number;
  CodigoBoleta?: string | null;
  Fecha: string;
  Seccion?: string | null;
  NombreFuncionario?: string | null;
  EstudianteId?: number | null;
  Identificacion?: string | null;
  Nombre?: string | null;
  PrimerApellido?: string | null;
  SegundoApellido?: string | null;
  TotalEnviosCorreo?: number | null;
  TotalEnviosExitosos?: number | null;
};
export type BitacoraGestion = {
  BitacoraGrupoId: number;
  GrupoId: number;
  MateriaId: number;
  AnioLectivoId: number;
  PeriodoId: number;
  FechaRegistro: string;
  TemasDesarrollados: string;
  Observaciones?: string | null;
  HechosRelevantes?: string | null;
  UsuarioId?: number | null;
  NombreUsuario?: string | null;
};

export const initialPlaneamientoForm: PlaneamientoForm = {
  nombre: "",
  fechaInicio: "",
  fechaFin: "",
  observaciones: "",
  indicadores: [{ Descripcion: "", NivelDesempenoId: null }]
};

export const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
  color: "#e5eefb",
  display: "grid",
  gap: "8px"
};

export const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "#ffffff",
  color: "#e5eefb",
  cursor: "pointer"
};

export function getGestionPanelButtonStyle(panel: ActivePanel): React.CSSProperties {
  const base: React.CSSProperties = {
    ...secondaryButtonStyle,
    fontWeight: 800
  };
  if (panel === "planeamientos") return { ...base, background: "#ecfeff", borderColor: "#67e8f9", color: "#0e7490" };
  if (panel === "seguimiento") return { ...base, background: "#ecfccb", borderColor: "#bef264", color: "#3f6212" };
  if (panel === "examenes_tabla") return { ...base, background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" };
  if (panel === "notas") return { ...base, background: "#f3e8ff", borderColor: "#d8b4fe", color: "#6b21a8" };
  if (panel === "bitacora") return { ...base, background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" };
  if (panel === "reportes") return { ...base, background: "#fef9c3", borderColor: "#fde047", color: "#854d0e" };
  return base;
}

export const inputNotaStyle: React.CSSProperties = {
  width: "90px",
  minWidth: "90px",
  border: "1px solid #94a3b8",
  borderRadius: "8px",
  padding: "8px 10px",
  textAlign: "right",
  background: "#122033",
  color: "#f8fafc"
};

export const requiredBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "#dcfce7",
  border: "1px solid #86efac",
  color: "#166534",
  fontSize: "11px",
  fontWeight: 900
};

export const optionalBadgeStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "#fef3c7",
  border: "1px solid #fcd34d",
  color: "#92400e",
  fontSize: "11px",
  fontWeight: 900
};
export const stickyTableHeaderStyle: React.CSSProperties = {
  minWidth: "220px",
  position: "sticky",
  left: 0,
  background: "#0f1b2d",
  color: "#e5edf8",
  zIndex: 2,
  borderColor: "#334155"
};

export const stickyTableCellStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "#0f1b2d",
  color: "#e5edf8",
  zIndex: 1,
  borderColor: "#334155",
  fontWeight: 600
};

export const helperDarkBoxStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "#0f1b2d",
  border: "1px solid #334155",
  color: "#e5edf8"
};

export class PanelErrorBoundary extends React.Component<{ title?: string; children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { title?: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: String(error?.message || error || "Error de renderizado") };
  }

  componentDidCatch(error: any) {
    console.error("Error en panel:", this.props.title || "panel", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "14px", border: "1px solid #fecaca", borderRadius: "12px", background: "#fff1f2", color: "#881337" }}>
          <strong>No se pudo cargar este panel.</strong>
          <div style={{ marginTop: "6px" }}>{this.state.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}


export function getFullName(item: { Nombre: string; PrimerApellido?: string | null; SegundoApellido?: string | null }) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCorreoHabilitadoEstudiante(item: EstudianteGrupo) {
  return String(item.Correo || item.EncargadoPrincipalCorreo || "").trim();
}

export function getTelefonoWhatsAppHabilitado(item: EstudianteGrupo) {
  if (!Boolean(item.AutorizaWhatsAppEncargado)) return "";
  const detalle = String(item.EncargadosWhatsAppDetalle || "").trim();
  if (detalle) return detalle;
  return String(item.EncargadoPrincipalTelefono || "").trim();
}

export function formatPercent(value?: number | string | null) {
  const number = Number(value || 0);
  return `${number.toFixed(2)}%`;
}

export function normalizarSeguimientoKey(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function getTipoSeguimientoFromDetalle(item?: Partial<SeguimientoEvaluacionDetalle> | null) {
  const raw = `${item?.TipoSeguimiento || ""} ${item?.TipoIndicadorPlaneamiento || ""} ${item?.Nombre || ""} ${item?.ComponenteCatalogoNombre || ""}`;
  const key = normalizarSeguimientoKey(raw);
  if (key.includes("TAREA")) return "Tareas";
  if (key.includes("COTIDIAN")) return "Cotidiano";
  if (key.includes("ASIST")) return "Asistencia";
  if (key.includes("EXAM") || key.includes("PRUEBA") || key.includes("EXAMEN") || key.includes("EVALUACION ESCRITA") || key.includes("SUMATIVA") || key.includes("INSTRUMENTO")) return "Exámenes";
  return item?.Nombre || item?.ComponenteCatalogoNombre || "Otro";
}

export function isTipoIndicadorSeguimiento(tipo: string) {
  const key = normalizarSeguimientoKey(tipo);
  return key.includes("COTIDIAN") || key.includes("TAREA");
}

export function isTipoCotidianoSeguimiento(tipo: string) {
  return normalizarSeguimientoKey(tipo).includes("COTIDIAN");
}

export function isTipoAsistenciaSeguimiento(tipo: string) {
  return normalizarSeguimientoKey(tipo).includes("ASIST");
}

export function isTipoExamenSeguimiento(tipo: string) {
  const key = normalizarSeguimientoKey(tipo);
  return key.includes("EXAM") || key.includes("PRUEBA") || key.includes("SUMATIVA") || key.includes("INSTRUMENTO") || key.includes("EVALUACION ESCRITA");
}

export function getSeguimientoActividadKey(actividadId: number | string, estudianteId: number | string) {
  return String(actividadId) + "-" + String(estudianteId);
}

export function getSeguimientoDraftKey(indicadorGrupoId: number | string, estudianteId: number | string, actividadId?: number | string) {
  return `${actividadId || 0}-${indicadorGrupoId}-${estudianteId}`;
}

export function getEstadoSeguimientoLabel(estado: SeguimientoEstado, tipo: string) {
  if (estado === "INICIAL") return "Inicial";
  if (estado === "INTERMEDIO") return "Intermedio";
  if (estado === "AVANZADO") return "Avanzado";
  return normalizarSeguimientoKey(tipo).includes("TAREA") ? "No entregado" : "Ausente";
}

export function getEstadoSeguimientoValor(estado: SeguimientoEstado | "") {
  if (estado === "INICIAL") return 1;
  if (estado === "INTERMEDIO") return 2;
  if (estado === "AVANZADO") return 3;
  if (estado === "AUSENTE" || estado === "NO_ENTREGADO") return 0;
  return null;
}

export function getTooltipSeguimiento(indicador: Partial<Eval360Indicador>, estado: SeguimientoEstado, tipo: string) {
  if (estado === "INICIAL") return indicador.IndicadorInicial || "Nivel inicial del indicador";
  if (estado === "INTERMEDIO") return indicador.IndicadorIntermedio || "Nivel intermedio del indicador";
  if (estado === "AVANZADO") return indicador.IndicadorAvanzado || "Nivel avanzado del indicador";
  return normalizarSeguimientoKey(tipo).includes("TAREA")
    ? "No entregado. No presenta evidencia para este indicador"
    : "Ausente. No registra evidencia para este indicador";
}

export function formatNota(value?: number | string | null, decimales = 2) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(decimales);
}

export function buildNoteKey(estudianteId: number, actividadId: number) {
  return `${estudianteId}-${actividadId}`;
}

export function sanitizeNotaInput(value: string) {
  const cleaned = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

export function clampNota(value: string) {
  if (value.trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number < 0) return "0";
  if (number > 100) return "100";
  return value;
}

export const MESES_ORDEN = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

export function normalizarTextoOrden(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}


export function normalizarGradoPlaneamiento(value: any) {
  const original = String(value || "").trim();
  if (!original) return "";

  const limpio = normalizarTextoOrden(original);

  const matchNivelSeccion = limpio.match(/^(7|8|9|10|11|12)(?:\s*[-_. ]\s*\d+)?/);
  const nivelNumerico = matchNivelSeccion ? Number(matchNivelSeccion[1]) : null;

  if (nivelNumerico === 7 || limpio.includes("setimo") || limpio.includes("septimo")) return "Séptimo";
  if (nivelNumerico === 8 || limpio.includes("octavo")) return "Octavo";
  if (nivelNumerico === 9 || limpio.includes("noveno")) return "Noveno";

  // Undécimo y duodécimo contienen "décimo". Se validan antes de décimo
  // para evitar que 11- o 12- se carguen como décimo.
  if (
    nivelNumerico === 12 ||
    limpio.includes("duodecimo") ||
    limpio.includes("duodecima") ||
    limpio.includes("duo decimo") ||
    limpio.includes("duo decima") ||
    limpio.includes("duidecimo") ||
    limpio.includes("duidecima")
  ) return "Duodécimo";

  if (nivelNumerico === 11 || limpio.includes("undecimo") || limpio.includes("undecima")) return "Undécimo";
  if (nivelNumerico === 10 || limpio === "decimo" || limpio === "decima") return "Décimo";

  return original;
}

export function getGradoPlaneamientoFromGrupo(grupo: any) {
  if (!grupo) return "";

  // Primero se toma el nombre de la sección, porque ahí viene el valor real 12-3.
  // GrupoNivel puede venir mal catalogado como Décimo en algunos datos históricos.
  const candidatosPrioritarios = [
    grupo?.GrupoNombre,
    grupo?.NombreGrupo,
    grupo?.nombreGrupo,
    grupo?.Nombre,
    grupo?.nombre,
    grupo?.SeccionNombre,
    grupo?.seccionNombre,
    grupo?.Seccion,
    grupo?.seccion,
    grupo?.Grupo,
    grupo?.grupo
  ];

  for (const valor of candidatosPrioritarios) {
    const grado = normalizarGradoPlaneamiento(valor);
    if (grado && grado !== String(valor || "").trim()) return grado;
  }

  const candidatosSecundarios = [
    grupo?.GrupoNivel,
    grupo?.Nivel,
    grupo?.nivel
  ];

  for (const valor of candidatosSecundarios) {
    const grado = normalizarGradoPlaneamiento(valor);
    if (grado) return grado;
  }

  return "";
}


export function getNombreSeccionPlaneamiento(grupo: any) {
  const posibles = [
    grupo?.GrupoNombre,
    grupo?.NombreGrupo,
    grupo?.nombreGrupo,
    grupo?.Nombre,
    grupo?.nombre,
    grupo?.SeccionNombre,
    grupo?.seccionNombre,
    grupo?.Seccion,
    grupo?.seccion,
    grupo?.Grupo,
    grupo?.grupo,
    grupo?.GrupoNivel,
    grupo?.Nivel,
    grupo?.nivel
  ];

  for (const valor of posibles) {
    const texto = String(valor ?? "").trim();
    if (texto) return texto;
  }

  const id = grupo?.GrupoId ?? grupo?.grupoId ?? grupo?.Id ?? grupo?.id ?? "";
  return id ? `Grupo ${id}` : "Sección sin nombre";
}

export function getDetalleSeccionPlaneamiento(grupo: any) {
  const nombre = getNombreSeccionPlaneamiento(grupo);
  const periodo = String(grupo?.PeriodoNombre ?? grupo?.periodoNombre ?? grupo?.Periodo ?? grupo?.periodo ?? "").trim();
  const anio = String(grupo?.AnioNombre ?? grupo?.anioNombre ?? grupo?.AnioLectivoNombre ?? grupo?.anioLectivoNombre ?? "").trim();
  return [nombre, periodo, anio].filter(Boolean).join(" / ");
}

export function ordenarMeses(a: string, b: string) {
  const ia = MESES_ORDEN.indexOf(normalizarTextoOrden(a));
  const ib = MESES_ORDEN.indexOf(normalizarTextoOrden(b));

  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;

  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

export function deduplicarGruposProfesor(items: GrupoProfesor[]) {
  const map = new Map<string, GrupoProfesor>();

  for (const item of items || []) {
    const key = [
      item.GrupoId,
      item.MateriaId,
      item.AnioLectivoId,
      item.PeriodoId
    ].map((value) => String(value ?? "")).join("|");

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export function getGrupoOrdenParts(item: Pick<GrupoProfesor, "GrupoNombre" | "GrupoNivel" | "MateriaNombre">) {
  const texto = `${item.GrupoNombre || ""} ${item.GrupoNivel || ""}`;
  const matchSeccion = texto.match(/(\d{1,2})\s*[- ]\s*(\d{1,2})/);

  if (matchSeccion) {
    return {
      nivel: Number(matchSeccion[1]),
      seccion: Number(matchSeccion[2])
    };
  }

  const matchNivel = texto.match(/\d{1,2}/);
  return {
    nivel: matchNivel ? Number(matchNivel[0]) : 999,
    seccion: 999
  };
}

export function compararGruposProfesor(a: GrupoProfesor, b: GrupoProfesor) {
  const ordenA = getGrupoOrdenParts(a);
  const ordenB = getGrupoOrdenParts(b);

  if (ordenA.nivel !== ordenB.nivel) return ordenA.nivel - ordenB.nivel;
  if (ordenA.seccion !== ordenB.seccion) return ordenA.seccion - ordenB.seccion;

  const grupoCompare = String(a.GrupoNombre || "").localeCompare(String(b.GrupoNombre || ""), "es", { numeric: true, sensitivity: "base" });
  if (grupoCompare !== 0) return grupoCompare;

  return String(a.MateriaNombre || "").localeCompare(String(b.MateriaNombre || ""), "es", { numeric: true, sensitivity: "base" });
}

export function formatHoraHorario(value?: string | null) {
  const texto = String(value || "").trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return texto;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getBloqueHorarioLabel(bloque: HorarioBloque) {
  const nombre = String(bloque.Nombre || "").trim();
  const inicio = formatHoraHorario(bloque.HoraInicio);
  const fin = formatHoraHorario(bloque.HoraFin);
  return inicio && fin ? `${nombre} (${inicio}-${fin})` : nombre;
}

export function normalizarBloqueHorario(nombre?: string | null) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getTipoBloqueNoLectivo(nombre?: string | null) {
  const texto = normalizarBloqueHorario(nombre);
  if (texto.includes("almuerzo")) return "almuerzo";
  if (texto.includes("recreo") || texto.includes("descanso")) return "recreo";
  return "";
}
