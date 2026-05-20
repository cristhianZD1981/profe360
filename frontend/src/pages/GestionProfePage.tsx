// @ts-nocheck
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import api from "../lib/http";

type GrupoProfesor = {
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
};

type EstudianteGrupo = {
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
};

type Plantilla = {
  EvaluacionPlantillaId: number;
  Nombre: string;
  DecimalesNota: number;
  Estado: string;
  PermitirProfesorEditar: boolean;
};

type Componente = {
  EvaluacionComponenteId: number;
  EvaluacionPlantillaId: number;
  Descripcion: string;
  Porcentaje: number;
  Orden: number;
  Activo: boolean;
};

type Actividad = {
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

type Nota = {
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

type NivelDesempeno = {
  NivelDesempenoId: number;
  Descripcion: string;
  Valor: number;
  Activo?: boolean;
};



type PlaneamientoHabilidad = {
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

type PlaneamientoIaResultadoSemana = {
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

type PlaneamientoIaResultado = {
  nombre?: string;
  enfoque?: string;
  advertencia?: string;
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

function toTextList(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toTextValue(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizePlaneamientoIaResultado(input: any): PlaneamientoIaResultado {
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

type PlaneamientoIaForm = {
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
  indicaciones: string;
  busquedaTexto: string;
  habilidadesIds: number[];
};

type PlantillaPromptIA = {
  Id: number;
  TipoGeneracionIAId: number;
  NombrePlantilla: string;
  IndicacionesSistema?: string | null;
  ContextoBase?: string | null;
  ReglasConstruccion?: string | null;
  EstructuraSalida?: string | null;
  FormatoRespuesta?: string | null;
  Activo?: boolean | number;
};


type Eval360Plantilla = {
  EvaluacionPlantillaId: number;
  Nombre: string;
  MateriaNombre?: string | null;
  AnioNombre?: string | null;
  PeriodoNombre?: string | null;
  Estado?: string | null;
  TotalPorcentaje?: number | null;
  PermitirProfesorEditar?: boolean;
};

type Eval360Detalle = {
  EstructuraGrupoDetalleId?: number;
  ComponenteCatalogoId: number;
  Nombre: string;
  Porcentaje: number;
  Orden: number;
  Activo?: boolean | number;
  ComponenteCatalogoNombre?: string | null;
};

type Eval360Nivel = {
  NivelDesempenoGrupoId?: number;
  Nombre: string;
  Valor: number;
  Orden: number;
  Activo?: boolean | number;
};

type Eval360Estructura = {
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

type Eval360EstructuraData = {
  estructura: Eval360Estructura | null;
  detalles: Eval360Detalle[];
  niveles: Eval360Nivel[];
  creada?: boolean;
};


type Eval360Indicador = {
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


type SeguimientoEvaluacionDetalle = Eval360Detalle & {
  PermiteIndicadoresPlaneamiento?: boolean | number;
  TipoIndicadorPlaneamiento?: string | null;
  TipoSeguimiento?: string | null;
  ComponenteCatalogoNombre?: string | null;
};

type SeguimientoActividad = {
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

type SeguimientoNotaActividad = {
  NotaActividadId: number;
  ActividadId: number;
  EstudianteId: number;
  PuntosObtenidos?: number | null;
  PuntosMaximos?: number | null;
  NotaObtenida?: number | null;
  PorcentajeObtenido?: number | null;
  Observacion?: string | null;
};

type SeguimientoAsistenciaRegistro = {
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

type SeguimientoEvaluacionContexto = {
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

type ExamenIaDraft = {
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

type ExamenIaCreado = {
  id: string;
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

type SeguimientoEstado = "INICIAL" | "INTERMEDIO" | "AVANZADO" | "AUSENTE" | "NO_ENTREGADO";
type SeguimientoDrafts = Record<string, SeguimientoEstado | "">;
type SeguimientoInformarDraft = { informar: boolean; observacion: string };
type SeguimientoInformarDrafts = Record<string, SeguimientoInformarDraft>;
type SeguimientoRecuperacionDraft = { activa: boolean; texto: string };
type SeguimientoRecuperacionDrafts = Record<string, SeguimientoRecuperacionDraft>;
type SeguimientoExamenDraft = { puntosObtenidos: string; observacion: string };
type SeguimientoExamenDrafts = Record<string, SeguimientoExamenDraft>;
type SeguimientoActividadInformarDraft = { informar: boolean; observacion: string };
type SeguimientoActividadInformarDrafts = Record<string, SeguimientoActividadInformarDraft>;
type SeguimientoActividadPuntosMaximosDrafts = Record<string, string>;
const initialPlaneamientoIaForm: PlaneamientoIaForm = {
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
  indicaciones: "",
  busquedaTexto: "",
  habilidadesIds: []
};
type Planeamiento = {
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

type PlaneamientoIndicador = {
  PlaneamientoIndicadorId?: number;
  PlaneamientoId?: number;
  Descripcion: string;
  NivelDesempenoId?: number | null;
  NivelDescripcion?: string | null;
  NivelValor?: number | null;
};

type PlaneamientoForm = {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  observaciones: string;
  indicadores: PlaneamientoIndicador[];
};

type DetalleGrupo = {
  asignacion: GrupoProfesor;
  estudiantes: EstudianteGrupo[];
  plantilla: Plantilla | null;
  componentes: Componente[];
  actividades: Actividad[];
  notas: Nota[];
};



type AsistenciaRegistro = {
  AsistenciaRegistroId?: number;
  EstudianteId: number;
  HorarioGrupoId?: number | null;
  BloqueHorarioId?: number | null;
  Estado: EstadoAsistencia;
  MinutosTardia?: number | null;
  Observacion?: string | null;
};

type ResumenAsistencia = {
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

type AsistenciaLeccion = {
  HorarioGrupoId: number;
  BloqueHorarioId: number;
  Nombre: string;
  HoraInicio: string;
  HoraFin: string;
  OrdenVisual?: number | null;
  DiaSemana?: number | null;
};

type AsistenciaDraft = Record<string, {
  estado: EstadoAsistencia;
  minutosTardia: string;
  observacion: string;
  notificarEncargado?: boolean;
}>;

type NoteDrafts = Record<string, string>;
type ActivePanel = "" | "asistencia" | "notas" | "seguimiento" | "horario" | "planeamientos" | "examenes_tabla" | "reportes";


type HorarioBloque = {
  BloqueHorarioId: number;
  Nombre: string;
  HoraInicio: string;
  HoraFin: string;
  OrdenVisual: number;
};

type HorarioEntrada = {
  HorarioGrupoId: number;
  BloqueHorarioId: number;
  DiaSemana: number;
  GrupoId: number;
  GrupoNombre: string;
  MateriaId: number;
  MateriaNombre: string;
  MateriaCodigo?: string | null;
};

type EstadoAsistencia = "PRESENTE" | "AUSENTE_JUSTIFICADA" | "AUSENTE_INJUSTIFICADA" | "TARDIA_MENOR_10" | "TARDIA_MAYOR_10";

const initialPlaneamientoForm: PlaneamientoForm = {
  nombre: "",
  fechaInicio: "",
  fechaFin: "",
  observaciones: "",
  indicadores: [{ Descripcion: "", NivelDesempenoId: null }]
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
  color: "#e5eefb",
  display: "grid",
  gap: "8px"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "10px",
  padding: "10px 14px",
  background: "#ffffff",
  color: "#e5eefb",
  cursor: "pointer"
};

const inputNotaStyle: React.CSSProperties = {
  width: "90px",
  minWidth: "90px",
  border: "1px solid #94a3b8",
  borderRadius: "8px",
  padding: "8px 10px",
  textAlign: "right",
  background: "#122033",
  color: "#f8fafc"
};
const stickyTableHeaderStyle: React.CSSProperties = {
  minWidth: "220px",
  position: "sticky",
  left: 0,
  background: "#0f1b2d",
  color: "#e5edf8",
  zIndex: 2,
  borderColor: "#334155"
};

const stickyTableCellStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "#0f1b2d",
  color: "#e5edf8",
  zIndex: 1,
  borderColor: "#334155",
  fontWeight: 600
};

const helperDarkBoxStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: "12px",
  background: "#0f1b2d",
  border: "1px solid #334155",
  color: "#e5edf8"
};

class PanelErrorBoundary extends React.Component<{ title?: string; children: React.ReactNode }, { hasError: boolean; message: string }> {
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


function getFullName(item: { Nombre: string; PrimerApellido?: string | null; SegundoApellido?: string | null }) {
  return [item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCorreoHabilitadoEstudiante(item: EstudianteGrupo) {
  return String(item.Correo || item.EncargadoPrincipalCorreo || "").trim();
}

function getTelefonoWhatsAppHabilitado(item: EstudianteGrupo) {
  if (!Boolean(item.AutorizaWhatsAppEncargado)) return "";
  const detalle = String(item.EncargadosWhatsAppDetalle || "").trim();
  if (detalle) return detalle;
  return String(item.EncargadoPrincipalTelefono || "").trim();
}

function formatPercent(value?: number | string | null) {
  const number = Number(value || 0);
  return `${number.toFixed(2)}%`;
}

function normalizarSeguimientoKey(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function getTipoSeguimientoFromDetalle(item?: Partial<SeguimientoEvaluacionDetalle> | null) {
  const raw = `${item?.TipoSeguimiento || ""} ${item?.TipoIndicadorPlaneamiento || ""} ${item?.Nombre || ""} ${item?.ComponenteCatalogoNombre || ""}`;
  const key = normalizarSeguimientoKey(raw);
  if (key.includes("TAREA")) return "Tareas";
  if (key.includes("COTIDIAN")) return "Cotidiano";
  if (key.includes("ASIST")) return "Asistencia";
  if (key.includes("EXAM") || key.includes("PRUEBA") || key.includes("EXAMEN") || key.includes("EVALUACION ESCRITA") || key.includes("SUMATIVA") || key.includes("INSTRUMENTO")) return "Exámenes";
  return item?.Nombre || item?.ComponenteCatalogoNombre || "Otro";
}

function isTipoIndicadorSeguimiento(tipo: string) {
  const key = normalizarSeguimientoKey(tipo);
  return key.includes("COTIDIAN") || key.includes("TAREA");
}

function isTipoCotidianoSeguimiento(tipo: string) {
  return normalizarSeguimientoKey(tipo).includes("COTIDIAN");
}

function isTipoAsistenciaSeguimiento(tipo: string) {
  return normalizarSeguimientoKey(tipo).includes("ASIST");
}

function isTipoExamenSeguimiento(tipo: string) {
  const key = normalizarSeguimientoKey(tipo);
  return key.includes("EXAM") || key.includes("PRUEBA") || key.includes("SUMATIVA") || key.includes("INSTRUMENTO") || key.includes("EVALUACION ESCRITA");
}

function getSeguimientoActividadKey(actividadId: number | string, estudianteId: number | string) {
  return String(actividadId) + "-" + String(estudianteId);
}

function getSeguimientoDraftKey(indicadorGrupoId: number | string, estudianteId: number | string, actividadId?: number | string) {
  return `${actividadId || 0}-${indicadorGrupoId}-${estudianteId}`;
}

function getEstadoSeguimientoLabel(estado: SeguimientoEstado, tipo: string) {
  if (estado === "INICIAL") return "Inicial";
  if (estado === "INTERMEDIO") return "Intermedio";
  if (estado === "AVANZADO") return "Avanzado";
  return normalizarSeguimientoKey(tipo).includes("TAREA") ? "No entregado" : "Ausente";
}

function getEstadoSeguimientoValor(estado: SeguimientoEstado | "") {
  if (estado === "INICIAL") return 1;
  if (estado === "INTERMEDIO") return 2;
  if (estado === "AVANZADO") return 3;
  if (estado === "AUSENTE" || estado === "NO_ENTREGADO") return 0;
  return null;
}

function getTooltipSeguimiento(indicador: Partial<Eval360Indicador>, estado: SeguimientoEstado, tipo: string) {
  if (estado === "INICIAL") return indicador.IndicadorInicial || "Nivel inicial del indicador";
  if (estado === "INTERMEDIO") return indicador.IndicadorIntermedio || "Nivel intermedio del indicador";
  if (estado === "AVANZADO") return indicador.IndicadorAvanzado || "Nivel avanzado del indicador";
  return normalizarSeguimientoKey(tipo).includes("TAREA")
    ? "No entregado. No presenta evidencia para este indicador"
    : "Ausente. No registra evidencia para este indicador";
}

function formatNota(value?: number | string | null, decimales = 2) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(decimales);
}

function buildNoteKey(estudianteId: number, actividadId: number) {
  return `${estudianteId}-${actividadId}`;
}

function sanitizeNotaInput(value: string) {
  const cleaned = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function clampNota(value: string) {
  if (value.trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number < 0) return "0";
  if (number > 100) return "100";
  return value;
}

const MESES_ORDEN = [
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

function normalizarTextoOrden(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}


function normalizarGradoPlaneamiento(value: any) {
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

function getGradoPlaneamientoFromGrupo(grupo: any) {
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


function getNombreSeccionPlaneamiento(grupo: any) {
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

function getDetalleSeccionPlaneamiento(grupo: any) {
  const nombre = getNombreSeccionPlaneamiento(grupo);
  const periodo = String(grupo?.PeriodoNombre ?? grupo?.periodoNombre ?? grupo?.Periodo ?? grupo?.periodo ?? "").trim();
  const anio = String(grupo?.AnioNombre ?? grupo?.anioNombre ?? grupo?.AnioLectivoNombre ?? grupo?.anioLectivoNombre ?? "").trim();
  return [nombre, periodo, anio].filter(Boolean).join(" / ");
}

function ordenarMeses(a: string, b: string) {
  const ia = MESES_ORDEN.indexOf(normalizarTextoOrden(a));
  const ib = MESES_ORDEN.indexOf(normalizarTextoOrden(b));

  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;

  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

function deduplicarGruposProfesor(items: GrupoProfesor[]) {
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

function getGrupoOrdenParts(item: Pick<GrupoProfesor, "GrupoNombre" | "GrupoNivel" | "MateriaNombre">) {
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

function compararGruposProfesor(a: GrupoProfesor, b: GrupoProfesor) {
  const ordenA = getGrupoOrdenParts(a);
  const ordenB = getGrupoOrdenParts(b);

  if (ordenA.nivel !== ordenB.nivel) return ordenA.nivel - ordenB.nivel;
  if (ordenA.seccion !== ordenB.seccion) return ordenA.seccion - ordenB.seccion;

  const grupoCompare = String(a.GrupoNombre || "").localeCompare(String(b.GrupoNombre || ""), "es", { numeric: true, sensitivity: "base" });
  if (grupoCompare !== 0) return grupoCompare;

  return String(a.MateriaNombre || "").localeCompare(String(b.MateriaNombre || ""), "es", { numeric: true, sensitivity: "base" });
}

function formatHoraHorario(value?: string | null) {
  const texto = String(value || "").trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return texto;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function getBloqueHorarioLabel(bloque: HorarioBloque) {
  const nombre = String(bloque.Nombre || "").trim();
  const inicio = formatHoraHorario(bloque.HoraInicio);
  const fin = formatHoraHorario(bloque.HoraFin);
  return inicio && fin ? `${nombre} (${inicio}-${fin})` : nombre;
}

function normalizarBloqueHorario(nombre?: string | null) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getTipoBloqueNoLectivo(nombre?: string | null) {
  const texto = normalizarBloqueHorario(nombre);
  if (texto.includes("almuerzo")) return "almuerzo";
  if (texto.includes("recreo") || texto.includes("descanso")) return "recreo";
  return "";
}

export default function GestionProfePage() {
  const [grupos, setGrupos] = useState<GrupoProfesor[]>([]);
  const [selected, setSelected] = useState<GrupoProfesor | null>(null);
  const [detalle, setDetalle] = useState<DetalleGrupo | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
  const [q, setQ] = useState("");
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [savingNotas, setSavingNotas] = useState(false);
  const [eval360Plantillas, setEval360Plantillas] = useState<Eval360Plantilla[]>([]);
  const [eval360PlantillaId, setEval360PlantillaId] = useState("");
  const [eval360Estructura, setEval360Estructura] = useState<Eval360EstructuraData | null>(null);
  const [eval360DetallesDraft, setEval360DetallesDraft] = useState<Eval360Detalle[]>([]);
  const [loadingEval360, setLoadingEval360] = useState(false);
  const [savingEval360, setSavingEval360] = useState(false);
  const [eval360PlantillasIaIndicadores, setEval360PlantillasIaIndicadores] = useState<PlantillaPromptIA[]>([]);
  const [eval360PlantillaIaIndicadorId, setEval360PlantillaIaIndicadorId] = useState("");
  const [eval360PlaneamientoId, setEval360PlaneamientoId] = useState("");
  const [eval360IndicacionesIa, setEval360IndicacionesIa] = useState("");
  const [eval360TiposUso, setEval360TiposUso] = useState<string[]>(["Cotidiano", "Tareas", "TablaEspecificaciones"]);
  const [eval360Indicadores, setEval360Indicadores] = useState<Eval360Indicador[]>([]);
  const [loadingEval360Indicadores, setLoadingEval360Indicadores] = useState(false);
  const [generatingEval360Indicadores, setGeneratingEval360Indicadores] = useState(false);
  const [savingEval360IndicadorId, setSavingEval360IndicadorId] = useState<number | null>(null);
  const [deletingEval360PlaneamientoId, setDeletingEval360PlaneamientoId] = useState<number | null>(null);
  const [savingEval360PlaneamientoCambiosId, setSavingEval360PlaneamientoCambiosId] = useState<number | null>(null);
  const [eval360IndicadoresPorPlaneamiento, setEval360IndicadoresPorPlaneamiento] = useState<Record<number, Eval360Indicador[]>>({});
  const [eval360PanelIndicadoresOpen, setEval360PanelIndicadoresOpen] = useState<Record<number, boolean>>({});
  const [eval360IndicacionesPorPlaneamiento, setEval360IndicacionesPorPlaneamiento] = useState<Record<number, string>>({});
  const [eval360TiposUsoPorPlaneamiento, setEval360TiposUsoPorPlaneamiento] = useState<Record<number, string[]>>({});
  const [eval360IndicadoresMinimizados, setEval360IndicadoresMinimizados] = useState<Record<number, boolean>>({});
  const [generatingEval360PlaneamientoId, setGeneratingEval360PlaneamientoId] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("");
  const [nivelesDesempeno, setNivelesDesempeno] = useState<NivelDesempeno[]>([]);
  const [planeamientos, setPlaneamientos] = useState<Planeamiento[]>([]);
  const [planeamientoIndicadores, setPlaneamientoIndicadores] = useState<PlaneamientoIndicador[]>([]);
  const [planeamientoFormOpen, setPlaneamientoFormOpen] = useState(false);
  const [editingPlaneamientoId, setEditingPlaneamientoId] = useState<number | null>(null);
  const [planeamientoForm, setPlaneamientoForm] = useState<PlaneamientoForm>(initialPlaneamientoForm);
  const [loadingPlaneamientos, setLoadingPlaneamientos] = useState(false);
  const [savingPlaneamiento, setSavingPlaneamiento] = useState(false);
  const [planeamientoIaForm, setPlaneamientoIaForm] = useState<PlaneamientoIaForm>(initialPlaneamientoIaForm);
  const [habilidadesIa, setHabilidadesIa] = useState<PlaneamientoHabilidad[]>([]);
  const [loadingHabilidadesIa, setLoadingHabilidadesIa] = useState(false);
  const [generatingPlaneamientoIa, setGeneratingPlaneamientoIa] = useState(false);
  const [savingPlaneamientoIa, setSavingPlaneamientoIa] = useState(false);
  const [ultimoPlaneamientoIa, setUltimoPlaneamientoIa] = useState<PlaneamientoIaResultado | null>(null);
  const [editingPlaneamientoIaId, setEditingPlaneamientoIaId] = useState<number | null>(null);
  const [documentoApoyoIa, setDocumentoApoyoIa] = useState<File | null>(null);
  const [plantillaFormatoIa, setPlantillaFormatoIa] = useState<File | null>(null);
  const [plantillasPlaneamientoIa, setPlantillasPlaneamientoIa] = useState<PlantillaPromptIA[]>([]);
  const [plantillaPlaneamientoIaId, setPlantillaPlaneamientoIaId] = useState<string>("");
  const [loadingPlantillasPlaneamientoIa, setLoadingPlantillasPlaneamientoIa] = useState(false);
  const [planeamientoIaFormOpen, setPlaneamientoIaFormOpen] = useState(false);
  const [asistenciaFecha, setAsistenciaFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [asistenciaDrafts, setAsistenciaDrafts] = useState<AsistenciaDraft>({});
  const [asistenciaLecciones, setAsistenciaLecciones] = useState<AsistenciaLeccion[]>([]);
  const [resumenAsistencia, setResumenAsistencia] = useState<ResumenAsistencia[]>([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [seguimientoContexto, setSeguimientoContexto] = useState<SeguimientoEvaluacionContexto | null>(null);
  const [loadingSeguimiento, setLoadingSeguimiento] = useState(false);
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [horarioVisible, setHorarioVisible] = useState(false);
  const [horarioBloques, setHorarioBloques] = useState<HorarioBloque[]>([]);
  const [horarioEntradas, setHorarioEntradas] = useState<HorarioEntrada[]>([]);
  const [seguimientoTipo, setSeguimientoTipo] = useState<string>("");
  const [seguimientoPlaneamientoId, setSeguimientoPlaneamientoId] = useState<string>("");
  const [seguimientoEstadoFiltro, setSeguimientoEstadoFiltro] = useState<string>("NO_CALIFICADO");
  const [seguimientoIndicadorId, setSeguimientoIndicadorId] = useState<string>("");
  const [seguimientoDrafts, setSeguimientoDrafts] = useState<SeguimientoDrafts>({});
  const [seguimientoInformarDrafts, setSeguimientoInformarDrafts] = useState<SeguimientoInformarDrafts>({});
  const [seguimientoRecuperacionDrafts, setSeguimientoRecuperacionDrafts] = useState<SeguimientoRecuperacionDrafts>({});
  const [seguimientoActividadId, setSeguimientoActividadId] = useState<string>("");
  const [seguimientoActividadIndicadoresDraft, setSeguimientoActividadIndicadoresDraft] = useState<Record<number, number[]>>({});
  const [seguimientoMatrizAsignacionMinimizada, setSeguimientoMatrizAsignacionMinimizada] = useState(true);
  const [tablaPlaneamientoIds, setTablaPlaneamientoIds] = useState<string[]>([]);
  const [tablaActividadIndicadoresDraft, setTablaActividadIndicadoresDraft] = useState<Record<number, number[]>>({});
  const [tablaMatrizMinimizada, setTablaMatrizMinimizada] = useState(true);
  const [tablaMatrizEditando, setTablaMatrizEditando] = useState(true);
  const [tablaEspecificacionEditando, setTablaEspecificacionEditando] = useState(true);
  const [tablaFormatoMinimizado, setTablaFormatoMinimizado] = useState(false);
  const [tablaEditandoActividadId, setTablaEditandoActividadId] = useState<number | null>(null);
  const [tablaEspecificacionesFormOpen, setTablaEspecificacionesFormOpen] = useState(false);
  const [crearExamenesOpen, setCrearExamenesOpen] = useState(false);
  const [loadingPlantillasExamenIa, setLoadingPlantillasExamenIa] = useState(false);
  const [plantillasExamenIa, setPlantillasExamenIa] = useState<PlantillaPromptIA[]>([]);
  const [examenesCreados, setExamenesCreados] = useState<ExamenIaCreado[]>([]);
  const [examenesCreadosOculto, setExamenesCreadosOculto] = useState(false);
  const [editingExamenId, setEditingExamenId] = useState<string>("");
  const [examenIaGeneradoId, setExamenIaGeneradoId] = useState<string>("");
  const [examenIaResultadoDraft, setExamenIaResultadoDraft] = useState<string>("");
  const [generandoExamenIa, setGenerandoExamenIa] = useState(false);
  const [examenIaDraft, setExamenIaDraft] = useState<ExamenIaDraft>({
    tablaId: "",
    plantillaId: "",
    seccionIds: [],
    archivoFormato: null,
    indicaciones: "",
    documentoApoyo: null,
    nombre: "",
    tipoColegio: "",
    fuenteWord: "Calibri",
    tamanoWord: "11"
  });
  const [tablaPruebaSeleccionadaId, setTablaPruebaSeleccionadaId] = useState<string>("");
  const [tablaTipoFormato, setTablaTipoFormato] = useState<"ANTES" | "DESPUES">("ANTES");
  const [tablaPuntosTotalesPrueba, setTablaPuntosTotalesPrueba] = useState<Record<number, string>>({});
  const [tablaDetalleDrafts, setTablaDetalleDrafts] = useState<Record<string, {
    numeroLecciones: string;
    puntos: string;
    seleccionRespuestaCantidad: string;
    seleccionRespuestaPuntos: string;
    correspondenciaCantidad: string;
    correspondenciaPuntos: string;
    identificacionCantidad: string;
    identificacionPuntos: string;
    respuestaCortaCantidad: string;
    respuestaCortaPuntos: string;
    respuestaRestringidaCantidad: string;
    respuestaRestringidaPuntos: string;
    resolucionEjerciciosCantidad: string;
    resolucionEjerciciosPuntos: string;
    resolucionProblemasCantidad: string;
    resolucionProblemasPuntos: string;
    resolucionCasosCantidad: string;
    resolucionCasosPuntos: string;
    produccionEscritaCantidad: string;
    produccionEscritaPuntos: string;
  }>>({});
  const [seguimientoExamenDrafts, setSeguimientoExamenDrafts] = useState<SeguimientoExamenDrafts>({});
  const [seguimientoActividadInformarDrafts, setSeguimientoActividadInformarDrafts] = useState<SeguimientoActividadInformarDrafts>({});
  const [seguimientoActividadPuntosMaximosDrafts, setSeguimientoActividadPuntosMaximosDrafts] = useState<SeguimientoActividadPuntosMaximosDrafts>({});
  const [notasDetalleAbierto, setNotasDetalleAbierto] = useState<string>("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const gruposOrdenados = useMemo(() => {
    return [...grupos].sort(compararGruposProfesor);
  }, [grupos]);

  const actividadesPorComponente = useMemo(() => {
    const map = new Map<number, Actividad[]>();
    for (const actividad of detalle?.actividades || []) {
      const current = map.get(actividad.EvaluacionComponenteId) || [];
      current.push(actividad);
      map.set(actividad.EvaluacionComponenteId, current);
    }
    return map;
  }, [detalle?.actividades]);

  const notasMap = useMemo(() => {
    const map = new Map<string, Nota>();
    for (const nota of detalle?.notas || []) {
      map.set(buildNoteKey(nota.EstudianteId, nota.EvaluacionActividadId), nota);
    }
    return map;
  }, [detalle?.notas]);

  const decimales = detalle?.plantilla?.DecimalesNota ?? 2;

  const seguimientoComponentes = useMemo(() => {
    const detalles = seguimientoContexto?.detalles || eval360DetallesDraft || [];
    const map = new Map<string, SeguimientoEvaluacionDetalle>();
    for (const item of detalles as SeguimientoEvaluacionDetalle[]) {
      if (item.Activo === false || item.Activo === 0) continue;
      const tipo = getTipoSeguimientoFromDetalle(item);
      if (!map.has(tipo)) map.set(tipo, item);
    }
    return Array.from(map.entries()).map(([tipo, detalleItem]) => ({ tipo, detalle: detalleItem }));
  }, [seguimientoContexto?.detalles, eval360DetallesDraft]);

  const seguimientoDetalleSeleccionado = useMemo(() => {
    return seguimientoComponentes.find((item) => item.tipo === seguimientoTipo)?.detalle || null;
  }, [seguimientoComponentes, seguimientoTipo]);

  const seguimientoActividadesFiltradas = useMemo(() => {
    const actividades = seguimientoContexto?.actividades || [];
    if (!seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId) return [];
    return actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === Number(seguimientoDetalleSeleccionado.EstructuraGrupoDetalleId));
  }, [seguimientoContexto?.actividades, seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId]);

  const seguimientoActividadSeleccionada = useMemo(() => {
    return seguimientoActividadesFiltradas.find((item) => String(item.ActividadId) === String(seguimientoActividadId)) || seguimientoActividadesFiltradas[0] || null;
  }, [seguimientoActividadesFiltradas, seguimientoActividadId]);

  const seguimientoComponenteTieneActividadesPlaneamiento = useMemo(() => {
    return seguimientoActividadesFiltradas.some((actividad) => Boolean(actividad.UsaIndicadoresPlaneamiento));
  }, [seguimientoActividadesFiltradas]);

  const seguimientoModoHibridoTareas = useMemo(() => {
    return seguimientoComponenteTieneActividadesPlaneamiento && Boolean(seguimientoActividadSeleccionada?.UsaIndicadoresPlaneamiento);
  }, [seguimientoComponenteTieneActividadesPlaneamiento, seguimientoActividadSeleccionada?.UsaIndicadoresPlaneamiento]);

  const seguimientoModoActividadDirecta = useMemo(() => {
    const actividad = seguimientoActividadSeleccionada;
    if (!actividad || isTipoAsistenciaSeguimiento(seguimientoTipo)) return false;
    if (Boolean(actividad.UsaIndicadoresPlaneamiento)) return false;
    if (!seguimientoActividadesFiltradas.length) return false;
    if (isTipoExamenSeguimiento(seguimientoTipo)) return true;
    if (!isTipoIndicadorSeguimiento(seguimientoTipo)) return true;
    return !seguimientoComponenteTieneActividadesPlaneamiento;
  }, [seguimientoActividadSeleccionada, seguimientoTipo, seguimientoActividadesFiltradas.length, seguimientoComponenteTieneActividadesPlaneamiento]);

  const seguimientoIndicadoresActividadAsignados = useMemo(() => {
    const actividadId = Number(seguimientoActividadSeleccionada?.ActividadId || 0);
    if (!actividadId) return [];
    if (Array.isArray(seguimientoActividadIndicadoresDraft[actividadId])) return seguimientoActividadIndicadoresDraft[actividadId];
    const asignados = (seguimientoContexto?.actividadIndicadores || [])
      .filter((item) => Number(item.ActividadId) === actividadId && item.Activo !== false && item.Activo !== 0)
      .map((item) => Number(item.IndicadorGrupoId));
    return Array.from(new Set(asignados));
  }, [seguimientoActividadSeleccionada?.ActividadId, seguimientoActividadIndicadoresDraft, seguimientoContexto?.actividadIndicadores]);

  const seguimientoIndicadoresDisponiblesParaAsignar = useMemo(() => {
    if (!seguimientoModoHibridoTareas) return [];
    const tipoKey = normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "TAREAS" : "COTIDIANO";
    const actividadActualId = Number(seguimientoActividadSeleccionada?.ActividadId || 0);
    const asignaciones = seguimientoContexto?.actividadIndicadores || [];
    const seguimientos = seguimientoContexto?.seguimientos || [];
    return (seguimientoContexto?.indicadores || []).filter((indicador) => {
      if (normalizarSeguimientoKey(indicador.TipoUso) !== tipoKey) return false;
      if (seguimientoPlaneamientoId && String(indicador.PlaneamientoId || "") !== seguimientoPlaneamientoId) return false;
      const indicadorId = Number(indicador.IndicadorGrupoId);
      const asignadoEnOtraActividad = asignaciones.some((item) =>
        Number(item.IndicadorGrupoId) === indicadorId
        && Number(item.ActividadId) !== actividadActualId
        && item.Activo !== false
        && item.Activo !== 0
      );
      if (asignadoEnOtraActividad) return false;
      const tieneCalificacion = seguimientos.some((item) => Number(item.IndicadorGrupoId) === indicadorId);
      if (tieneCalificacion) return false;
      return true;
    });
  }, [seguimientoModoHibridoTareas, seguimientoTipo, seguimientoActividadSeleccionada?.ActividadId, seguimientoContexto?.indicadores, seguimientoContexto?.actividadIndicadores, seguimientoContexto?.seguimientos, seguimientoPlaneamientoId]);

  const seguimientoActividadesPlaneamiento = useMemo(() => {
    return seguimientoActividadesFiltradas.filter((actividad) => Boolean(actividad.UsaIndicadoresPlaneamiento));
  }, [seguimientoActividadesFiltradas]);

  const seguimientoIndicadoresAsignablesPorActividad = useMemo(() => {
    if (!seguimientoComponenteTieneActividadesPlaneamiento) return [];
    const tipoKey = normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "TAREAS" : "COTIDIANO";
    return (seguimientoContexto?.indicadores || []).filter((indicador) => {
      if (normalizarSeguimientoKey(indicador.TipoUso) !== tipoKey) return false;
      if (seguimientoPlaneamientoId && String(indicador.PlaneamientoId || "") !== seguimientoPlaneamientoId) return false;
      return true;
    });
  }, [seguimientoComponenteTieneActividadesPlaneamiento, seguimientoTipo, seguimientoContexto?.indicadores, seguimientoPlaneamientoId]);

  const tablaComponentesExamen = useMemo(() => {
    try {
      if (activePanel !== "examenes_tabla") return [];
      return seguimientoComponentes.filter((item) => isTipoExamenSeguimiento(item.tipo));
    } catch (error) {
      console.error("Error calculando componentes de examen:", error);
      return [];
    }
  }, [activePanel, seguimientoComponentes]);

  const tablaActividadesExamen = useMemo(() => {
    try {
      if (activePanel !== "examenes_tabla") return [];
      const detalleIds = tablaComponentesExamen.map((item) => Number(item.detalle.EstructuraGrupoDetalleId)).filter((id) => id > 0);
      if (!detalleIds.length) return [];
      return (seguimientoContexto?.actividades || []).filter((actividad) =>
        detalleIds.includes(Number(actividad.EstructuraGrupoDetalleId)) && actividad.Activo !== false && actividad.Activo !== 0
      );
    } catch (error) {
      console.error("Error calculando actividades de examen:", error);
      return [];
    }
  }, [activePanel, seguimientoContexto?.actividades, tablaComponentesExamen]);

  const tablaIndicadoresEspecificaciones = useMemo(() => {
    try {
      if (activePanel !== "examenes_tabla") return [];
      return (seguimientoContexto?.indicadores || []).filter((indicador) => {
        if (!indicador) return false;
        if (normalizarSeguimientoKey(indicador.TipoUso) !== "TABLAESPECIFICACIONES") return false;
        if (tablaPlaneamientoIds.length > 0 && !tablaPlaneamientoIds.includes(String(indicador.PlaneamientoId || ""))) return false;
        return indicador.Activo !== false && indicador.Activo !== 0;
      });
    } catch (error) {
      console.error("Error calculando indicadores de tabla:", error);
      return [];
    }
  }, [activePanel, seguimientoContexto?.indicadores, tablaPlaneamientoIds]);

  const tablaIndicadoresRender = useMemo(() => {
    if (activePanel !== "examenes_tabla") return [];
    return tablaIndicadoresEspecificaciones.slice(0, 250);
  }, [activePanel, tablaIndicadoresEspecificaciones]);

  const tablaActividadIndicadoresBaseMap = useMemo(() => {
    try {
      if (activePanel !== "examenes_tabla") return new Map<number, Set<number>>();
      const map = new Map<number, Set<number>>();
      for (const item of (seguimientoContexto?.actividadIndicadores || [])) {
        if (!item || item.Activo === false || item.Activo === 0) continue;
        const actividadId = Number(item.ActividadId || 0);
        const indicadorId = Number(item.IndicadorGrupoId || 0);
        if (!actividadId || !indicadorId) continue;
        const set = map.get(actividadId) || new Set<number>();
        set.add(indicadorId);
        map.set(actividadId, set);
      }
      return map;
    } catch (error) {
      console.error("Error calculando mapa base de actividad/indicadores:", error);
      return new Map<number, Set<number>>();
    }
  }, [activePanel, seguimientoContexto?.actividadIndicadores]);

  const tablaActividadIndicadoresDraftMap = useMemo(() => {
    if (activePanel !== "examenes_tabla") return new Map<number, Set<number>>();
    const map = new Map<number, Set<number>>();
    for (const [actividadKey, indicadores] of Object.entries(tablaActividadIndicadoresDraft || {})) {
      const actividadId = Number(actividadKey);
      if (!actividadId || !Array.isArray(indicadores)) continue;
      map.set(actividadId, new Set(indicadores.map((id) => Number(id)).filter((id) => id > 0)));
    }
    return map;
  }, [activePanel, tablaActividadIndicadoresDraft]);

  const tablaResumenAsignacion = useMemo(() => {
    const map = new Map<number, { lecciones: number; puntos: number }>();
    for (const actividad of tablaActividadesExamen) {
      const actividadId = Number(actividad.ActividadId);
      const asignados = getTablaIndicadoresAsignadosActividad(actividadId);
      const totalLecciones = asignados.length;
      const totalPuntos = Number(actividad.PuntosMaximos || 0);
      map.set(actividadId, { lecciones: totalLecciones, puntos: totalPuntos });
    }
    return map;
  }, [tablaActividadesExamen, tablaActividadIndicadoresDraftMap, tablaActividadIndicadoresBaseMap]);

  const tablaConteoAsignacion = useMemo(() => {
    const conteoPorPrueba = new Map<number, number>();
    const indicadoresTotales = tablaIndicadoresEspecificaciones.map((i) => Number(i.IndicadorGrupoId));
    const asignados = new Set<number>();
    for (const actividad of tablaActividadesExamen) {
      const actividadId = Number(actividad.ActividadId);
      const ids = getTablaIndicadoresAsignadosActividad(actividadId).map((id) => Number(id));
      const filtrados = ids.filter((id) => indicadoresTotales.includes(id));
      conteoPorPrueba.set(actividadId, filtrados.length);
      for (const id of filtrados) asignados.add(id);
    }
    const sinAsignar = indicadoresTotales.filter((id) => !asignados.has(id)).length;
    return { conteoPorPrueba, sinAsignar };
  }, [tablaActividadesExamen, tablaIndicadoresEspecificaciones, tablaActividadIndicadoresDraftMap, tablaActividadIndicadoresBaseMap]);

  const tablaAprendizajesPorPlaneamiento = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const planeamiento of (seguimientoContexto?.planeamientos || [])) {
      const planeamientoId = Number(planeamiento.PlaneamientoId || 0);
      if (!planeamientoId) continue;
      try {
        const json = planeamiento.ResultadoIAJson ? JSON.parse(String(planeamiento.ResultadoIAJson)) : null;
        const aprendizajes = Array.isArray(json?.aprendizajesEsperados)
          ? json.aprendizajesEsperados.map((item: any) => String(item || "").trim()).filter(Boolean)
          : [];
        map.set(planeamientoId, aprendizajes);
      } catch {
        map.set(planeamientoId, []);
      }
    }
    return map;
  }, [seguimientoContexto?.planeamientos]);

  function getSeguimientoIndicadoresAsignadosActividad(actividadId: number) {
    if (Array.isArray(seguimientoActividadIndicadoresDraft[actividadId])) {
      return seguimientoActividadIndicadoresDraft[actividadId].map((item) => Number(item));
    }
    const asignados = (seguimientoContexto?.actividadIndicadores || [])
      .filter((item) => Number(item.ActividadId) === Number(actividadId) && item.Activo !== false && item.Activo !== 0)
      .map((item) => Number(item.IndicadorGrupoId));
    return Array.from(new Set(asignados));
  }

  function getSeguimientoActividadAsignadaIndicador(indicadorGrupoId: number) {
    const actividades = seguimientoActividadesPlaneamiento;
    for (const actividad of actividades) {
      const asignados = getSeguimientoIndicadoresAsignadosActividad(Number(actividad.ActividadId));
      if (asignados.includes(Number(indicadorGrupoId))) return Number(actividad.ActividadId);
    }
    return 0;
  }

  function getSeguimientoEstadoAsignacionIndicador(indicadorGrupoId: number) {
    const actividadId = getSeguimientoActividadAsignadaIndicador(indicadorGrupoId);
    if (!actividadId) return "Sin Asignar";
    const calificado = (seguimientoContexto?.seguimientos || []).some((item) =>
      Number(item.ActividadId) === Number(actividadId)
      && Number(item.IndicadorGrupoId) === Number(indicadorGrupoId)
    );
    return calificado ? "Calificado" : "No Calificado";
  }

  function seguimientoIndicadorTieneCalificacion(indicadorGrupoId: number) {
    return (seguimientoContexto?.seguimientos || []).some((item) => Number(item.IndicadorGrupoId) === Number(indicadorGrupoId));
  }

  const seguimientoIndicadoresFiltrados = useMemo(() => {
    const indicadores = seguimientoContexto?.indicadores || [];
    return indicadores.filter((indicador) => {
      if (seguimientoTipo && isTipoIndicadorSeguimiento(seguimientoTipo)) {
        const tipoKey = normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "TAREAS" : "COTIDIANO";
        if (normalizarSeguimientoKey(indicador.TipoUso) !== tipoKey) return false;
      }
      if (seguimientoModoHibridoTareas && seguimientoActividadSeleccionada?.ActividadId) {
        const asignado = seguimientoIndicadoresActividadAsignados.includes(Number(indicador.IndicadorGrupoId));
        if (!asignado) return false;
      }
      if (seguimientoPlaneamientoId && String(indicador.PlaneamientoId || "") !== seguimientoPlaneamientoId) return false;

      const calificados = (seguimientoContexto?.seguimientos || []).filter((s) => {
        const mismoIndicador = Number(s.IndicadorGrupoId) === Number(indicador.IndicadorGrupoId);
        const mismaActividad = !seguimientoModoHibridoTareas || !seguimientoActividadSeleccionada?.ActividadId || Number(s.ActividadId) === Number(seguimientoActividadSeleccionada.ActividadId);
        return mismoIndicador && mismaActividad;
      });
      const estadoFiltro = normalizarSeguimientoKey(seguimientoEstadoFiltro);
      if (estadoFiltro === "NO_CALIFICADO" && calificados.length > 0) return false;
      if (estadoFiltro === "CALIFICADO" && calificados.length === 0) return false;
      if (["INICIAL", "INTERMEDIO", "AVANZADO", "AUSENTE", "NO_ENTREGADO"].includes(estadoFiltro)) {
        return calificados.some((s) => normalizarSeguimientoKey(s.NivelNombre).replace(/\s+/g, "_") === estadoFiltro);
      }
      return true;
    });
  }, [seguimientoContexto?.indicadores, seguimientoContexto?.seguimientos, seguimientoTipo, seguimientoPlaneamientoId, seguimientoEstadoFiltro, seguimientoActividadSeleccionada?.ActividadId, seguimientoIndicadoresActividadAsignados, seguimientoModoHibridoTareas]);

  const seguimientoIndicadorSeleccionado = useMemo(() => {
    return seguimientoIndicadoresFiltrados.find((item) => String(item.IndicadorGrupoId) === String(seguimientoIndicadorId)) || seguimientoIndicadoresFiltrados[0] || null;
  }, [seguimientoIndicadoresFiltrados, seguimientoIndicadorId]);

  const seguimientoResumenSeccion = useMemo(() => {
    const indicadores = (seguimientoContexto?.indicadores || []).filter((indicador) => {
      if (seguimientoTipo && isTipoIndicadorSeguimiento(seguimientoTipo)) {
        const tipoKey = normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "TAREAS" : "COTIDIANO";
        if (normalizarSeguimientoKey(indicador.TipoUso) !== tipoKey) return false;
      }
      if (seguimientoPlaneamientoId && String(indicador.PlaneamientoId || "") !== seguimientoPlaneamientoId) return false;
      return true;
    });

    const totalEstudiantes = seguimientoContexto?.estudiantes?.length || 0;
    const seguimientos = seguimientoContexto?.seguimientos || [];

    let calificados = 0;
    let noCalificados = 0;

    indicadores.forEach((indicador) => {
      const estudiantesCalificados = new Set(
        seguimientos
          .filter((seguimiento) => Number(seguimiento.IndicadorGrupoId) === Number(indicador.IndicadorGrupoId))
          .map((seguimiento) => Number(seguimiento.EstudianteId))
      );

      if (totalEstudiantes > 0 && estudiantesCalificados.size >= totalEstudiantes) {
        calificados += 1;
      } else {
        noCalificados += 1;
      }
    });

    return {
      total: indicadores.length,
      calificados,
      noCalificados,
      totalEstudiantes,
    };

  }, [seguimientoContexto?.indicadores, seguimientoContexto?.seguimientos, seguimientoContexto?.estudiantes, seguimientoTipo, seguimientoPlaneamientoId]);

  const consolidadoAlumnos = useMemo(() => {
    const detalles = seguimientoContexto?.detalles || [];
    const estudiantes = seguimientoContexto?.estudiantes || [];
    const actividades = seguimientoContexto?.actividades || [];
    const notas = seguimientoContexto?.notasActividades || [];
    const seguimientos = seguimientoContexto?.seguimientos || [];
    const indicadores = seguimientoContexto?.indicadores || [];
    const actividadIndicadores = seguimientoContexto?.actividadIndicadores || [];
    const asistencia = seguimientoContexto?.asistenciaRegistros || [];

    function promedioNumeros(valores: number[]) {
      if (!valores.length) return 0;
      return valores.reduce((acc, value) => acc + value, 0) / valores.length;
    }

    function escalaArticulo37(porcentajeAusencias: number) {
      if (porcentajeAusencias >= 50) return 0;
      if (porcentajeAusencias >= 40) return 1;
      if (porcentajeAusencias >= 30) return 2;
      if (porcentajeAusencias >= 20) return 3;
      if (porcentajeAusencias >= 10) return 4;
      return 5;
    }

    function ausenciaEquivalente(estado: string) {
      const key = normalizarSeguimientoKey(estado);
      if (key.includes("TARDIA_MENOR")) return 0.5;
      if (key.includes("AUSENTE_INJUSTIFICADA") || key.includes("TARDIA_MAYOR") || key.includes("AUSENTE")) return 1;
      return 0;
    }

    function calcularComponente(detalleItem: SeguimientoEvaluacionDetalle, estudiante: EstudianteGrupo) {
      const tipo = getTipoSeguimientoFromDetalle(detalleItem);
      const tipoKey = normalizarSeguimientoKey(tipo);
      const porcentajeComponente = Number(detalleItem.Porcentaje || 0);
      const detalleId = Number(detalleItem.EstructuraGrupoDetalleId);
      let nota = 0;
      let porcentajeEvaluado = 0;
      let porcentajeGanado = 0;
      let evaluados = 0;
      let pendientes = 0;
      let resumen = "Sin registros";
      let detallesLista: Array<{ key: string; titulo: string; subtitulo: string; nota: number; porcentaje: number; estado?: string }> = [];

      if (tipoKey.includes("ASIST")) {
        const registros = asistencia.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const totalLecciones = registros.length;
        const ausencias = registros.reduce((acc, item) => acc + ausenciaEquivalente(item.Estado), 0);
        const porcentajeAusencias = totalLecciones ? (ausencias / totalLecciones) * 100 : 0;
        const puntosArticulo = escalaArticulo37(porcentajeAusencias);
        nota = totalLecciones ? (puntosArticulo / 5) * 100 : 0;
        porcentajeGanado = (nota / 100) * porcentajeComponente;
        porcentajeEvaluado = totalLecciones > 0 ? porcentajeComponente : 0;
        evaluados = totalLecciones;
        pendientes = totalLecciones ? 0 : 1;
        resumen = totalLecciones
          ? `${totalLecciones} lecciones registradas / ${ausencias.toFixed(2)} ausencias equivalentes / ${porcentajeAusencias.toFixed(2)}% ausencias`
          : "Sin asistencia registrada";
        detallesLista = registros.map((registro) => ({
          key: `asis-${registro.AsistenciaRegistroId}`,
          titulo: `${registro.BloqueNombre || "Lección"} ${registro.HoraInicio || ""}-${registro.HoraFin || ""}`.trim(),
          subtitulo: (() => {
            const fecha = new Date(String(registro.Fecha || ""));
            if (!Number.isFinite(fecha.getTime())) return String(registro.Fecha || "");
            const dd = String(fecha.getDate()).padStart(2, "0");
            const mm = String(fecha.getMonth() + 1).padStart(2, "0");
            const yyyy = String(fecha.getFullYear());
            return `${dd}-${mm}-${yyyy}`;
          })(),
          nota: ausenciaEquivalente(registro.Estado) > 0 ? 0 : 100,
          porcentaje: 0,
          estado: registro.Estado || "Presente"
        }));
        if (!detallesLista.length) {
          detallesLista.push({
            key: `asis-vacio-${estudiante.EstudianteId}`,
            titulo: "Asistencia",
            subtitulo: "No hay lecciones registradas para este estudiante",
            nota: 0,
            porcentaje: 0,
            estado: "Pendiente"
          });
        }
      } else if (tipoKey.includes("COTIDIAN") || tipoKey.includes("TAREA")) {
        const tipoUso = tipoKey.includes("TAREA") ? "TAREAS" : "COTIDIANO";
        const indicadoresTipo = indicadores.filter((indicador) => normalizarSeguimientoKey(indicador.TipoUso) === tipoUso);
        const seguimientosEstudiante = seguimientos.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const actividadesDetalle = actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === detalleId);
        const indicadorIds = new Set(indicadoresTipo.map((indicador) => Number(indicador.IndicadorGrupoId)));
        const actividadesResumen = actividadesDetalle.map((actividad) => {
          const registrosActividad = seguimientosEstudiante.filter((item) =>
            Number(item.ActividadId) === Number(actividad.ActividadId)
            && indicadorIds.has(Number(item.IndicadorGrupoId))
          );
          const indicadoresAsignados = actividadIndicadores
            .filter((item) =>
              Number(item.ActividadId) === Number(actividad.ActividadId)
              && indicadorIds.has(Number(item.IndicadorGrupoId))
              && item.Activo !== false
              && item.Activo !== 0
            )
            .map((item) => Number(item.IndicadorGrupoId));
          const totalAsignados = new Set(indicadoresAsignados).size || indicadoresTipo.length;
          const puntos = registrosActividad.reduce((acc, item) => acc + Number(item.ValorSeleccionado || 0), 0);
          const indicadoresEvaluados = new Set(registrosActividad.map((item) => Number(item.IndicadorGrupoId))).size;
          const maximo = totalAsignados * 3;
          const notaActividad = maximo ? (puntos / maximo) * 100 : 0;
          const pesoActividad = Number(actividad.PorcentajeDentroRubro || 0) > 0 ? Number(actividad.PorcentajeDentroRubro || 0) / 100 : (actividadesDetalle.length ? 1 / actividadesDetalle.length : 0);
          return { actividad, registrosActividad, indicadoresEvaluados, totalAsignados, notaActividad, pesoActividad };
        });
        porcentajeGanado = actividadesResumen.reduce((acc, item) => acc + ((item.notaActividad / 100) * porcentajeComponente * item.pesoActividad), 0);
        nota = porcentajeComponente ? (porcentajeGanado / porcentajeComponente) * 100 : 0;
        porcentajeEvaluado = actividadesResumen.reduce((acc, item) => {
          const asignados = Math.max(0, Number(item.totalAsignados || 0));
          const evaluadosActividad = Math.max(0, Number(item.indicadoresEvaluados || 0));
          if (!asignados || !Number.isFinite(asignados)) return acc;
          const ratioEvaluado = Math.min(evaluadosActividad, asignados) / asignados;
          return acc + (ratioEvaluado * porcentajeComponente * item.pesoActividad);
        }, 0);
        evaluados = actividadesResumen.reduce((acc, item) => acc + item.indicadoresEvaluados, 0);
        pendientes = actividadesDetalle.length
          ? actividadesResumen.reduce((acc, item) => acc + Math.max(0, item.totalAsignados - item.indicadoresEvaluados), 0)
          : Math.max(0, indicadoresTipo.length - evaluados);
        resumen = actividadesDetalle.length
          ? `${actividadesResumen.filter((item) => item.indicadoresEvaluados > 0).length}/${actividadesDetalle.length} actividades con indicadores`
          : `${evaluados}/${indicadoresTipo.length} indicadores calificados`;
        detallesLista = actividadesResumen.map((item) => ({
          key: `act-ind-${item.actividad.ActividadId}`,
          titulo: item.actividad.Nombre || "Actividad",
          subtitulo: `${item.indicadoresEvaluados}/${item.totalAsignados} indicadores evaluados`,
          nota: item.notaActividad,
          porcentaje: (item.notaActividad / 100) * porcentajeComponente * item.pesoActividad,
          estado: item.indicadoresEvaluados ? "Calificada" : "Pendiente"
        }));
        if (!detallesLista.length) {
          detallesLista = indicadoresTipo.map((indicador) => {
            const registro = seguimientosEstudiante.find((item) => Number(item.EstructuraGrupoDetalleId) === detalleId && Number(item.IndicadorGrupoId) === Number(indicador.IndicadorGrupoId));
            const valor = Number(registro?.ValorSeleccionado ?? 0);
          return {
            key: `ind-${indicador.IndicadorGrupoId}`,
            titulo: indicador.IndicadorBase || "Indicador",
            subtitulo: indicador.PlaneamientoNombre || "Planeamiento",
            nota: valor ? (valor / 3) * 100 : 0,
            porcentaje: indicadoresTipo.length ? ((valor / 3) * porcentajeComponente) / indicadoresTipo.length : 0,
            estado: registro?.NivelNombre || (valor === 0 && registro ? "Ausente / No entregado" : "Pendiente")
          };
        });
        }
      } else {
        const actividadesDetalle = actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === detalleId);
        const notasEstudiante = notas.filter((notaItem) => Number(notaItem.EstudianteId) === Number(estudiante.EstudianteId));
        const notasDetalle = notasEstudiante.filter((notaItem) => actividadesDetalle.some((actividad) => Number(actividad.ActividadId) === Number(notaItem.ActividadId)));
        const notasPorActividad = actividadesDetalle.map((actividad) => {
          const notaItem = notasDetalle.find((item) => Number(item.ActividadId) === Number(actividad.ActividadId));
          const puntosObtenidos = notaItem?.PuntosObtenidos;
          const maximo = Number(notaItem?.PuntosMaximos || actividad.PuntosMaximos || 0);
          const tieneRegistroCalificado = puntosObtenidos !== null && puntosObtenidos !== undefined && Number.isFinite(Number(puntosObtenidos));
          const notaDirecta = Number(notaItem?.NotaObtenida ?? 0);
          const notaCalculada = !tieneRegistroCalificado
            ? 0
            : (notaDirecta > 0 ? notaDirecta : (maximo ? (Number(puntosObtenidos) / maximo) * 100 : 0));
          return { actividad, notaItem, notaCalculada, tieneRegistroCalificado };
        });

        const sumaPesosConfig = notasPorActividad.reduce((acc, item) => acc + Math.max(0, Number(item.actividad.PorcentajeDentroRubro || 0)), 0);
        const pesoDefault = actividadesDetalle.length ? (porcentajeComponente / actividadesDetalle.length) : 0;

        porcentajeGanado = notasPorActividad.reduce((acc, item) => {
          if (!item.tieneRegistroCalificado) return acc;
          const peActividad = sumaPesosConfig > 0
            ? Math.max(0, Number(item.actividad.PorcentajeDentroRubro || 0))
            : pesoDefault;
          return acc + ((item.notaCalculada / 100) * peActividad);
        }, 0);

        // "Porcentaje Evaluado": cuánto del componente ya tiene calificación registrada.
        porcentajeEvaluado = notasPorActividad.reduce((acc, item) => {
          if (!item.tieneRegistroCalificado) return acc;
          const peActividad = sumaPesosConfig > 0
            ? Math.max(0, Number(item.actividad.PorcentajeDentroRubro || 0))
            : pesoDefault;
          return acc + peActividad;
        }, 0);
        nota = Math.min(100, porcentajeComponente > 0 ? (porcentajeGanado / porcentajeComponente) * 100 : 0);
        evaluados = notasPorActividad.filter((item) => item.tieneRegistroCalificado).length;
        pendientes = Math.max(0, actividadesDetalle.length - evaluados);
        resumen = `${evaluados}/${actividadesDetalle.length} actividades calificadas`;
        detallesLista = notasPorActividad.map((item) => ({
          key: `act-${item.actividad.ActividadId}`,
          titulo: item.actividad.Nombre || "Actividad",
          subtitulo: `Puntos: ${Number(item.notaItem?.PuntosObtenidos || 0).toFixed(2)} / ${Number(item.notaItem?.PuntosMaximos || item.actividad.PuntosMaximos || 0).toFixed(2)}`,
          nota: item.tieneRegistroCalificado ? item.notaCalculada : 0,
          porcentaje: (() => {
            if (!item.tieneRegistroCalificado) return 0;
            const peActividad = sumaPesosConfig > 0
              ? Math.max(0, Number(item.actividad.PorcentajeDentroRubro || 0))
              : pesoDefault;
            return (item.notaCalculada / 100) * peActividad;
          })(),
          estado: item.tieneRegistroCalificado ? "Calificada" : "Pendiente"
        }));
      }

      return {
        key: `${estudiante.EstudianteId}-${detalleItem.EstructuraGrupoDetalleId}`,
        nombre: detalleItem.Nombre || detalleItem.ComponenteCatalogoNombre || tipo,
        tipo,
        porcentajeComponente,
        porcentajeEvaluado,
        nota,
        porcentajeGanado,
        evaluados,
        pendientes,
        resumen,
        detalles: detallesLista
      };
    }

    return estudiantes.map((estudiante) => {
      const componentes = detalles.map((detalleItem) => calcularComponente(detalleItem, estudiante));
      const totalEvaluado = componentes.reduce((acc, item) => acc + Number((item as any).porcentajeEvaluado || 0), 0);
      const totalGanado = componentes.reduce((acc, item) => acc + Number(item.porcentajeGanado || 0), 0);
      const promedioGeneral = componentes.length ? (totalGanado / Math.max(1, componentes.reduce((acc, item) => acc + Number(item.porcentajeComponente || 0), 0))) * 100 : 0;
      return {
        key: String(estudiante.EstudianteId),
        estudiante,
        nombre: getFullName(estudiante),
        identificacion: estudiante.Identificacion || "",
        totalEvaluado,
        totalGanado,
        promedioGeneral,
        componentes
      };
    });
  }, [seguimientoContexto]);

  const totalConsolidadoGanado = useMemo(() => {
    if (!consolidadoAlumnos.length) return 0;
    return consolidadoAlumnos.reduce((acc, item) => acc + Number(item.totalGanado || 0), 0) / consolidadoAlumnos.length;
  }, [consolidadoAlumnos]);


  useEffect(() => {
    if (!seguimientoTipo && seguimientoComponentes.length) {
      setSeguimientoTipo(seguimientoComponentes[0].tipo);
    }
  }, [seguimientoComponentes, seguimientoTipo]);

  useEffect(() => {
    if (seguimientoActividadesFiltradas.length && !seguimientoActividadesFiltradas.some((item) => String(item.ActividadId) === String(seguimientoActividadId))) {
      const primeraVinculada = seguimientoActividadesFiltradas.find((item) => Boolean(item.UsaIndicadoresPlaneamiento));
      setSeguimientoActividadId(String((primeraVinculada || seguimientoActividadesFiltradas[0]).ActividadId));
    }
    if (!seguimientoActividadesFiltradas.length && seguimientoActividadId) {
      setSeguimientoActividadId("");
    }
  }, [seguimientoActividadesFiltradas, seguimientoActividadId]);

  useEffect(() => {
    const actividadId = Number(seguimientoActividadSeleccionada?.ActividadId || 0);
    if (!actividadId) return;
    if (Array.isArray(seguimientoActividadIndicadoresDraft[actividadId])) return;
    const asignados = (seguimientoContexto?.actividadIndicadores || [])
      .filter((item) => Number(item.ActividadId) === actividadId && item.Activo !== false && item.Activo !== 0)
      .map((item) => Number(item.IndicadorGrupoId));
    setSeguimientoActividadIndicadoresDraft((prev) => ({
      ...prev,
      [actividadId]: Array.from(new Set(asignados))
    }));
  }, [seguimientoActividadSeleccionada?.ActividadId, seguimientoContexto?.actividadIndicadores, seguimientoActividadIndicadoresDraft]);

  useEffect(() => {
    if (seguimientoIndicadoresFiltrados.length && !seguimientoIndicadoresFiltrados.some((item) => String(item.IndicadorGrupoId) === String(seguimientoIndicadorId))) {
      setSeguimientoIndicadorId(String(seguimientoIndicadoresFiltrados[0].IndicadorGrupoId));
    }
    if (!seguimientoIndicadoresFiltrados.length && seguimientoIndicadorId) {
      setSeguimientoIndicadorId("");
    }
  }, [seguimientoIndicadoresFiltrados, seguimientoIndicadorId]);

  const materiasAsignadas = useMemo(() => {
    const map = new Map<number, GrupoProfesor>();
    for (const grupo of grupos) {
      if (!map.has(Number(grupo.MateriaId))) map.set(Number(grupo.MateriaId), grupo);
    }
    return Array.from(map.values()).sort((a, b) => String(a.MateriaNombre).localeCompare(String(b.MateriaNombre)));
  }, [grupos]);

  const gradosAsignados = useMemo(() => {
    const materiaId = Number(planeamientoIaForm.materiaId || selected?.MateriaId || 0);
    const valores = grupos
      .filter((grupo) => !materiaId || Number(grupo.MateriaId) === materiaId)
      .map((grupo) => getGradoPlaneamientoFromGrupo(grupo))
      .filter(Boolean);
    return Array.from(new Set(valores)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [grupos, planeamientoIaForm.materiaId, selected?.MateriaId]);

  const seccionesAsignadas = useMemo(() => {
    const materiaId = Number(planeamientoIaForm.materiaId || selected?.MateriaId || 0);
    const grado = normalizarGradoPlaneamiento(planeamientoIaForm.grado || getGradoPlaneamientoFromGrupo(selected) || "");
    return grupos
      .filter((grupo) => {
        const mismoMateria = !materiaId || Number(grupo.MateriaId) === materiaId;
        const grupoGrado = getGradoPlaneamientoFromGrupo(grupo);
        const mismoGrado = !grado || grupoGrado === grado;
        return mismoMateria && mismoGrado;
      })
      .sort((a, b) => String(a.GrupoNombre).localeCompare(String(b.GrupoNombre), undefined, { numeric: true }));
  }, [grupos, planeamientoIaForm.materiaId, planeamientoIaForm.grado, selected?.MateriaId, selected?.GrupoNivel, selected?.GrupoNombre]);

  useEffect(() => {
    if (!planeamientoIaForm.materiaId || !planeamientoIaForm.grado) return;

    const idsDisponibles = seccionesAsignadas.map((grupo) => String(grupo.GrupoId));

    setPlaneamientoIaForm((prev) => {
      const idsActualesValidos = prev.grupoIds.filter((id) => idsDisponibles.includes(id));

      if (!idsDisponibles.length) {
        if (!prev.grupoIds.length && !prev.grupoId) return prev;
        return { ...prev, grupoIds: [], grupoId: "", habilidadesIds: [] };
      }

      if (idsActualesValidos.length === prev.grupoIds.length && prev.grupoId === (idsActualesValidos[0] || "")) {
        return prev;
      }

      const idsFinales = idsActualesValidos.length ? idsActualesValidos : idsDisponibles;

      return {
        ...prev,
        grupoIds: idsFinales,
        grupoId: idsFinales[0] || "",
        habilidadesIds: idsActualesValidos.length ? prev.habilidadesIds : []
      };
    });
  }, [seccionesAsignadas, planeamientoIaForm.materiaId, planeamientoIaForm.grado]);

  const mesesHabilidades = useMemo(() => {
    return Array.from(new Set(habilidadesIa.map((h) => String(h.Mes || "").trim()).filter(Boolean)))
      .sort(ordenarMeses);
  }, [habilidadesIa]);

  const mesesSeleccionadosIa = useMemo(() => {
    return String(planeamientoIaForm.mes || "")
      .split("|")
      .map((mes) => mes.trim())
      .filter(Boolean);
  }, [planeamientoIaForm.mes]);

  const mesesSeleccionadosTextoIa = useMemo(() => {
    return mesesSeleccionadosIa.join(", ");
  }, [mesesSeleccionadosIa]);

  const areasHabilidades = useMemo(() => {
    return Array.from(new Set(habilidadesIa.map((h) => String(h.Area || "").trim()).filter(Boolean)))
      .sort(ordenarMeses);
  }, [habilidadesIa]);

  const habilidadesFiltradasIa = useMemo(() => {
    const texto = String(planeamientoIaForm.busquedaTexto || "").trim().toLowerCase();

    return habilidadesIa.filter((habilidad) => {
      const mes = String(habilidad.Mes || "").trim();
      const area = String(habilidad.Area || "").trim();

      if (mesesSeleccionadosIa.length > 0 && !mesesSeleccionadosIa.includes(mes)) return false;
      if (planeamientoIaForm.area && area !== planeamientoIaForm.area) return false;

      if (texto) {
        const contenido = [
          habilidad.MateriaNombre,
          habilidad.TipoColegio,
          habilidad.Grado,
          habilidad.Mes,
          habilidad.Area,
          habilidad.NumeroHabilidad,
          habilidad.DescripcionHabilidad,
          habilidad.DocumentoReferencia
        ].filter(Boolean).join(" ").toLowerCase();

        if (!contenido.includes(texto)) return false;
      }

      return true;
    });
  }, [habilidadesIa, mesesSeleccionadosIa, planeamientoIaForm.area, planeamientoIaForm.busquedaTexto]);

  useEffect(() => {
    const materiaId = Number(planeamientoIaForm.materiaId || 0);
    const grado = normalizarGradoPlaneamiento(planeamientoIaForm.grado);

    if (!materiaId || !grado) {
      setHabilidadesIa([]);
      setPlaneamientoIaForm((prev) => ({
        ...prev,
        filtroTipo: "",
        mes: "",
        area: "",
        habilidadesIds: []
      }));
      return;
    }

    const timer = window.setTimeout(() => {
      loadHabilidadesIa(materiaId, grado, false);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [planeamientoIaForm.materiaId, planeamientoIaForm.grado]);

  const resumenGrupo = useMemo(() => {
    if (!detalle) return { totalPorcentaje: 0, totalNotas: 0 };

    const totalPorcentaje = detalle.estudiantes.reduce((total, estudiante) => {
      return total + calcularAcumuladoEstudiante(estudiante.EstudianteId);
    }, 0);

    const totalNotas = detalle.estudiantes.reduce((total, estudiante) => {
      const notasRegistradas = detalle.actividades.filter((actividad) => {
        const value = noteDrafts[buildNoteKey(estudiante.EstudianteId, actividad.EvaluacionActividadId)];
        return value !== undefined && value !== "";
      }).length;
      return total + notasRegistradas;
    }, 0);

    return {
      totalPorcentaje,
      totalNotas
    };
  }, [detalle, noteDrafts]);


  const resumenReportes = useMemo(() => {
    if (!detalle) {
      return {
        filas: [],
        promedioAcumulado: 0,
        promedioAsistencia: 0,
        totalEstudiantes: 0
      };
    }

    const filas = detalle.estudiantes.map((estudiante) => {
      const asistencia = resumenAsistencia.find((item) => item.EstudianteId === estudiante.EstudianteId);
      const acumuladoEvaluacion = calcularAcumuladoEstudiante(estudiante.EstudianteId);
      const notasRegistradas = detalle.actividades.filter((actividad) => {
        const value = noteDrafts[buildNoteKey(estudiante.EstudianteId, actividad.EvaluacionActividadId)];
        return value !== undefined && value !== "";
      }).length;

      return {
        EstudianteId: estudiante.EstudianteId,
        NombreCompleto: getFullName(estudiante),
        Identificacion: estudiante.Identificacion,
        NotasRegistradas: notasRegistradas,
        TotalActividades: detalle.actividades.length,
        AcumuladoEvaluacion: acumuladoEvaluacion,
        AusenciasEquivalentes: Number(asistencia?.AusenciasInjustificadasEquivalentes || 0),
        PorcentajeAusencias: Number(asistencia?.PorcentajeAusencias || 0),
        PorcentajeAsistencia: Number(asistencia?.PorcentajeAsignadoArticulo37 || 0),
        TotalLecciones: Number(asistencia?.TotalLecciones || 0)
      };
    });

    const promedioAcumulado = filas.length
      ? filas.reduce((total, fila) => total + fila.AcumuladoEvaluacion, 0) / filas.length
      : 0;

    const promedioAsistencia = filas.length
      ? filas.reduce((total, fila) => total + fila.PorcentajeAsistencia, 0) / filas.length
      : 0;

    return {
      filas,
      promedioAcumulado,
      promedioAsistencia,
      totalEstudiantes: filas.length
    };
  }, [detalle, noteDrafts, resumenAsistencia]);

  function exportarReporteCsv() {
    if (!detalle || resumenReportes.filas.length === 0) return;

    const headers = [
      "Estudiante",
      "Identificación",
      "Notas registradas",
      "Total actividades",
      "% acumulado evaluación",
      "Lecciones registradas",
      "Ausencias equivalentes",
      "% ausencias",
      "% asistencia Artículo 37"
    ];

    const rows = resumenReportes.filas.map((fila) => [
      fila.NombreCompleto,
      fila.Identificacion,
      String(fila.NotasRegistradas),
      String(fila.TotalActividades),
      fila.AcumuladoEvaluacion.toFixed(2),
      String(fila.TotalLecciones),
      fila.AusenciasEquivalentes.toFixed(2),
      fila.PorcentajeAusencias.toFixed(2),
      fila.PorcentajeAsistencia.toFixed(2)
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    descargarBlob(blob, `reporte-${selected?.GrupoNombre || "grupo"}-${selected?.MateriaNombre || "materia"}.csv`);
  }

  function descargarBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\s+/g, "-").toLowerCase();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportarReporteExcel() {
    if (!selected) return;
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/reportes/excel`, {
        params: {
          anioLectivoId: selected.AnioLectivoId,
          periodoId: selected.PeriodoId
        },
        responseType: "blob"
      });
      descargarBlob(response.data, `reporte-${selected.GrupoNombre}-${selected.MateriaNombre}.xlsx`);
    } catch (error) {
      console.error("Error exportando Excel:", error);
      alert("No se pudo generar el Excel del reporte");
    }
  }

  async function exportarReportePdf() {
    if (!selected) return;
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/reportes/pdf`, {
        params: {
          anioLectivoId: selected.AnioLectivoId,
          periodoId: selected.PeriodoId
        },
        responseType: "blob"
      });
      const blob = new Blob([response.data], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error("Error exportando PDF:", error);
      alert("No se pudo generar el PDF del reporte");
    }
  }


  async function exportarPlaneamientoWord(planeamiento: Planeamiento) {
    try {
      const response = await api.get(`/planeamiento-ia/planeamientos/${planeamiento.PlaneamientoId}/exportar-word`, {
        responseType: "blob"
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
      descargarBlob(blob, `planeamiento-${planeamiento.Nombre || planeamiento.PlaneamientoId}.docx`);
    } catch (error) {
      console.error("Error exportando planeamiento a Word:", error);
      alert("No se pudo generar la plantilla Word del planeamiento");
    }
  }

  function buildDraftsFromDetalle(data: DetalleGrupo | null) {
    const drafts: NoteDrafts = {};
    for (const nota of data?.notas || []) {
      drafts[buildNoteKey(nota.EstudianteId, nota.EvaluacionActividadId)] = formatNota(nota.Nota, data?.plantilla?.DecimalesNota ?? 2);
    }
    return drafts;
  }

  function getDraftValue(estudianteId: number, actividadId: number) {
    return noteDrafts[buildNoteKey(estudianteId, actividadId)] ?? "";
  }

  function getActividadPorcentajeReal(actividadId: number) {
    const actividad = detalle?.actividades.find((item) => item.EvaluacionActividadId === actividadId);
    return Number(actividad?.PorcentajeReal || 0);
  }

  function calcularPorcentajeGanado(estudianteId: number, actividadId: number) {
    const value = getDraftValue(estudianteId, actividadId);
    if (value === "") return 0;
    const nota = Number(value);
    if (!Number.isFinite(nota)) return 0;
    const porcentajeReal = getActividadPorcentajeReal(actividadId);
    return Number(((nota * porcentajeReal) / 100).toFixed(4));
  }

  function calcularAcumuladoEstudiante(estudianteId: number) {
    return (detalle?.actividades || []).reduce((total, actividad) => {
      return total + calcularPorcentajeGanado(estudianteId, actividad.EvaluacionActividadId);
    }, 0);
  }

  function updateNotaDraft(estudianteId: number, actividadId: number, value: string) {
    const sanitized = sanitizeNotaInput(value);
    setNoteDrafts((prev) => ({
      ...prev,
      [buildNoteKey(estudianteId, actividadId)]: sanitized
    }));
  }

  function normalizeNotaOnBlur(estudianteId: number, actividadId: number) {
    const key = buildNoteKey(estudianteId, actividadId);
    const value = noteDrafts[key] ?? "";
    const clamped = clampNota(value);
    setNoteDrafts((prev) => ({
      ...prev,
      [key]: clamped === "" ? "" : formatNota(clamped, decimales)
    }));
  }

  function getAsistenciaLeccionesFallback(): AsistenciaLeccion[] {
    return [{
      HorarioGrupoId: 0,
      BloqueHorarioId: 0,
      Nombre: "Lección",
      HoraInicio: "",
      HoraFin: "",
      OrdenVisual: 0
    }];
  }

  function asistenciaDraftKey(estudianteId: number, horarioGrupoId?: number | null) {
    return `${estudianteId}-${Number(horarioGrupoId || 0)}`;
  }

  function buildAsistenciaDrafts(estudiantes: EstudianteGrupo[], registros: AsistenciaRegistro[], lecciones: AsistenciaLeccion[] = []) {
    const registrosMap = new Map<string, AsistenciaRegistro>();
    for (const registro of registros || []) {
      registrosMap.set(asistenciaDraftKey(Number(registro.EstudianteId), Number(registro.HorarioGrupoId || 0)), registro);
    }

    const leccionesUsar = lecciones.length ? lecciones : getAsistenciaLeccionesFallback();
    const drafts: AsistenciaDraft = {};

    for (const estudiante of estudiantes || []) {
      for (const leccion of leccionesUsar) {
        const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
        const registro = registrosMap.get(key);
        drafts[key] = {
          estado: (registro?.Estado || "PRESENTE") as EstadoAsistencia,
          minutosTardia: registro?.MinutosTardia !== null && registro?.MinutosTardia !== undefined ? String(registro.MinutosTardia) : "",
          observacion: registro?.Observacion || "",
          notificarEncargado: false
        };
      }
    }
    return drafts;
  }

function estadoAsistenciaLabel(estado: EstadoAsistencia) {
    switch (estado) {
      case "PRESENTE": return "Presente";
      case "AUSENTE_JUSTIFICADA": return "Ausente justificada";
      case "AUSENTE_INJUSTIFICADA": return "Ausente injustificada";
      case "TARDIA_MENOR_10": return "Tardía menor a 10 min";
      case "TARDIA_MAYOR_10": return "Tardía mayor a 10 min";
      default: return estado;
    }
}

function getTipoMensajeDesdeSeguimiento(tipo: string) {
  const key = normalizarSeguimientoKey(tipo);
  if (key.includes("TAREA")) return "TAREA";
  if (key.includes("COTIDIAN")) return "COTIDIANO";
  if (key.includes("ASIST")) return "ASISTENCIA";
  if (key.includes("EXAM") || key.includes("PRUEBA")) return "EXAMEN";
  return "";
}

function getMensajePreconfigurado(mensajes: any[], tipo: string, valorNivel?: number | null) {
  const tipoUso = getTipoMensajeDesdeSeguimiento(tipo);
  if (!tipoUso) return "";
  const lista = (Array.isArray(mensajes) ? mensajes : []).filter((m) => String(m?.TipoUso || "").toUpperCase() === tipoUso);
  if (!lista.length) return "";
  const exacto = lista.find((m) => Number(m?.ValorNivel || 0) === Number(valorNivel || 0));
  if (exacto?.Cuerpo) return String(exacto.Cuerpo).trim();
  const general = lista.find((m) => m?.ValorNivel === null || m?.ValorNivel === undefined);
  return String(general?.Cuerpo || "").trim();
}

function getMensajeAsistenciaPreconfigurado(mensajes: any[], estado: EstadoAsistencia) {
  const lista = (Array.isArray(mensajes) ? mensajes : []).filter(
    (m) => String(m?.TipoUso || "").toUpperCase() === "ASISTENCIA"
  );
  if (!lista.length) return "";
  const porNivel = (nivel: number) =>
    lista.find((m) => Number(m?.ValorNivel || 0) === nivel);

  if (estado === "AUSENTE_INJUSTIFICADA") {
    return String(porNivel(1)?.Cuerpo || "").trim();
  }
  if (estado === "TARDIA_MENOR_10") {
    return String(porNivel(2)?.Cuerpo || "").trim();
  }
  return "";
}

  function getTablaIndicadoresAsignadosActividad(actividadId: number) {
    const draft = tablaActividadIndicadoresDraftMap.get(Number(actividadId));
    if (draft) return Array.from(draft);
    return Array.from(tablaActividadIndicadoresBaseMap.get(Number(actividadId)) || []);
  }

  function toggleTablaIndicadorActividad(indicadorGrupoId: number, actividadId: number, checked: boolean) {
    if (seguimientoIndicadorTieneCalificacion(indicadorGrupoId)) return;
    setTablaActividadIndicadoresDraft((prev) => {
      const next = { ...prev };
      const indicadorIdNum = Number(indicadorGrupoId);
      const actividadDestino = Number(actividadId);

      // Un indicador solo puede estar asociado a una prueba.
      for (const actividad of tablaActividadesExamen) {
        const actId = Number(actividad.ActividadId);
        const actual = Array.isArray(next[actId]) ? next[actId] : getTablaIndicadoresAsignadosActividad(actId);
        next[actId] = actual.filter((item) => Number(item) !== indicadorIdNum);
      }

      if (checked) {
        const destinoActual = Array.isArray(next[actividadDestino]) ? next[actividadDestino] : getTablaIndicadoresAsignadosActividad(actividadDestino);
        next[actividadDestino] = Array.from(new Set([...destinoActual, indicadorIdNum]));
      }

      return next;
    });
  }

  function getTablaDetalleKey(actividadId: number, indicadorId: number) {
    return `${actividadId}-${indicadorId}`;
  }

  function parseTablaDetalleJson(raw?: string | null) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getTablaDetalle(actividadId: number, indicadorId: number) {
    const key = getTablaDetalleKey(actividadId, indicadorId);
    if (tablaDetalleDrafts[key]) return tablaDetalleDrafts[key];
    const existente = (seguimientoContexto?.actividadIndicadores || []).find((item) =>
      Number(item.ActividadId) === Number(actividadId) && Number(item.IndicadorGrupoId) === Number(indicadorId)
    );
    const detalle = parseTablaDetalleJson(existente?.DetalleItemsJson);
    return {
      numeroLecciones: existente?.NumeroLecciones !== null && existente?.NumeroLecciones !== undefined ? String(existente.NumeroLecciones) : "0",
      puntos: existente?.Puntos !== null && existente?.Puntos !== undefined ? String(existente.Puntos) : "0",
      seleccionRespuestaCantidad: String(detalle?.seleccionRespuestaCantidad ?? "0"),
      seleccionRespuestaPuntos: String(detalle?.seleccionRespuestaPuntos ?? "0"),
      correspondenciaCantidad: String(detalle?.correspondenciaCantidad ?? "0"),
      correspondenciaPuntos: String(detalle?.correspondenciaPuntos ?? "0"),
      identificacionCantidad: String(detalle?.identificacionCantidad ?? "0"),
      identificacionPuntos: String(detalle?.identificacionPuntos ?? "0"),
      respuestaCortaCantidad: String(detalle?.respuestaCortaCantidad ?? "0"),
      respuestaCortaPuntos: String(detalle?.respuestaCortaPuntos ?? "0"),
      respuestaRestringidaCantidad: String(detalle?.respuestaRestringidaCantidad ?? "0"),
      respuestaRestringidaPuntos: String(detalle?.respuestaRestringidaPuntos ?? "0"),
      resolucionEjerciciosCantidad: String(detalle?.resolucionEjerciciosCantidad ?? "0"),
      resolucionEjerciciosPuntos: String(detalle?.resolucionEjerciciosPuntos ?? "0"),
      resolucionProblemasCantidad: String(detalle?.resolucionProblemasCantidad ?? "0"),
      resolucionProblemasPuntos: String(detalle?.resolucionProblemasPuntos ?? "0"),
      resolucionCasosCantidad: String(detalle?.resolucionCasosCantidad ?? "0"),
      resolucionCasosPuntos: String(detalle?.resolucionCasosPuntos ?? "0"),
      produccionEscritaCantidad: String(detalle?.produccionEscritaCantidad ?? "0"),
      produccionEscritaPuntos: String(detalle?.produccionEscritaPuntos ?? "0")
    };
  }

  function updateTablaDetalle(actividadId: number, indicadorId: number, field: string, value: string) {
    const integerOnlyFields = new Set([
      "numeroLecciones",
      "puntos",
      "seleccionRespuestaCantidad",
      "seleccionRespuestaPuntos",
      "correspondenciaCantidad",
      "correspondenciaPuntos",
      "identificacionCantidad",
      "identificacionPuntos",
      "respuestaCortaCantidad",
      "respuestaCortaPuntos",
      "respuestaRestringidaCantidad",
      "respuestaRestringidaPuntos",
      "resolucionEjerciciosCantidad",
      "resolucionEjerciciosPuntos",
      "resolucionProblemasCantidad",
      "resolucionProblemasPuntos",
      "resolucionCasosCantidad",
      "resolucionCasosPuntos",
      "produccionEscritaCantidad",
      "produccionEscritaPuntos"
    ]);
    const normalizedValue = integerOnlyFields.has(field) ? String(value || "").replace(/[^\d]/g, "") : value;
    const key = getTablaDetalleKey(actividadId, indicadorId);
    setTablaDetalleDrafts((prev) => ({
      ...prev,
      [key]: {
        ...getTablaDetalle(actividadId, indicadorId),
        [field]: normalizedValue
      }
    }));
  }

  function getIndicadoresPruebaSeleccionada() {
    const actividadId = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadId) return [] as Array<Eval360Indicador & { PlaneamientoNombre?: string | null }>;
    const asignados = new Set(getTablaIndicadoresAsignadosActividad(actividadId).map((id) => Number(id)));
    return tablaIndicadoresEspecificaciones.filter((indicador) => asignados.has(Number(indicador.IndicadorGrupoId)));
  }

  function getTotalLeccionesPruebaSeleccionada(indicadoresPrueba: Array<Eval360Indicador & { PlaneamientoNombre?: string | null }>) {
    const actividadId = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadId) return 0;
    return indicadoresPrueba.reduce((acc, indicador) => {
      const detalle = getTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId));
      const lecciones = Number(String(detalle.numeroLecciones || "0").replace(",", "."));
      return acc + (Number.isFinite(lecciones) ? lecciones : 0);
    }, 0);
  }

  function getPuntosFormulaPruebaSeleccionada(indicadorId: number, totalLecciones: number) {
    const actividadId = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadId) return 0;
    const detalle = getTablaDetalle(actividadId, Number(indicadorId));
    if (tablaTipoFormato === "ANTES") {
      return getPuntosPorItems(detalle);
    }
    if (tablaTipoFormato === "DESPUES") {
      const actividad = tablaActividadesExamen.find((item) => Number(item.ActividadId) === actividadId);
      const esperadoBase = Number(actividad?.PuntosMaximos || 0);
      const esperadoManual = Number(String(tablaPuntosTotalesPrueba[actividadId] || "").replace(",", "."));
      const puntosTotales = Number.isFinite(esperadoManual) && esperadoManual > 0 ? esperadoManual : esperadoBase;
      const lecciones = Number(String(detalle.numeroLecciones || "0").replace(",", "."));
      if (!Number.isFinite(lecciones) || lecciones <= 0 || !Number.isFinite(totalLecciones) || totalLecciones <= 0) return 0;
      return Math.round((puntosTotales / totalLecciones) * lecciones);
    }
    if (!totalLecciones) return 0;
    const actividad = tablaActividadesExamen.find((item) => Number(item.ActividadId) === actividadId);
    const puntosPrueba = Number(actividad?.PuntosMaximos || 0);
    const lecciones = Number(String(detalle.numeroLecciones || "0").replace(",", "."));
    if (!Number.isFinite(lecciones) || lecciones <= 0) return 0;
    return (lecciones * puntosPrueba) / totalLecciones;
  }

  function getNombreGuardadoTabla() {
    const actividadId = Number(tablaPruebaSeleccionadaId || 0);
    const idx = tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === actividadId);
    const prueba = idx >= 0 ? `Prueba ${idx + 1}` : "Prueba";
    const semestre = String(selected?.PeriodoNombre || selected?.PeriodoId || "").trim() || "Semestre";
    const seccion = String(selected?.GrupoNombre || "").trim() || "Sección";
    const materia = String(selected?.MateriaNombre || "").trim() || "Materia";
    return `${prueba}, ${semestre}, ${seccion}, ${materia}`;
  }

  const tablaValidacionPruebaSeleccionada = useMemo(() => {
    const actividadId = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadId) return { coincide: false, totalCalculado: 0, esperado: 0, minimoPorcentaje: 0, diferencia: 0, filasIncompletas: 0, cumpleMinimoPorcentaje: false };
    const actividad = tablaActividadesExamen.find((a) => Number(a.ActividadId) === actividadId);
    const esperadoBase = Number(actividad?.PuntosMaximos || 0);
    const minimoPorcentaje = Number(actividad?.PorcentajeDentroRubro || 0);
    const esperadoManual = Number(String(tablaPuntosTotalesPrueba[actividadId] || "").replace(",", "."));
    const esperado = tablaTipoFormato === "DESPUES" && Number.isFinite(esperadoManual) && esperadoManual > 0 ? esperadoManual : esperadoBase;
    const indicadores = getIndicadoresPruebaSeleccionada();
    const totalLecciones = getTotalLeccionesPruebaSeleccionada(indicadores);
    let filasIncompletas = 0;
    for (const indicador of indicadores) {
      const d = getTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId));
      const campos = getDetalleCamposItems(d);
      const puntosItems = getPuntosPorItems(d);
      const tienePuntosAntes = Number.isFinite(puntosItems) && puntosItems > 0;
      if (campos.some((c) => isItemParIncompleto(c.cantidad, c.valor))) filasIncompletas += 1;
      if (tablaTipoFormato === "ANTES" && !tienePuntosAntes) filasIncompletas += 1;
      if (tablaTipoFormato === "DESPUES") {
        const leccionesNum = Number(String(d.numeroLecciones || "0").replace(",", "."));
        if (!Number.isInteger(leccionesNum) || leccionesNum <= 0) filasIncompletas += 1;
        const puntosCalculadosFila = Number(getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones).toFixed(0));
        if (Number(puntosItems) !== Number(puntosCalculadosFila)) filasIncompletas += 1;
      }
    }
    const totalCalculado = Number(
      indicadores.reduce((acc, indicador) => acc + getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones), 0).toFixed(2)
    );
    const cumpleMinimoPorcentaje = totalCalculado + 0.01 >= minimoPorcentaje;
    const diferencia = Number((totalCalculado - esperado).toFixed(2));
    const coincide = tablaTipoFormato === "ANTES"
      ? true
      : (Math.abs(totalCalculado - esperado) < 0.01);
    return {
      coincide: coincide && filasIncompletas === 0 && cumpleMinimoPorcentaje,
      totalCalculado,
      esperado,
      minimoPorcentaje,
      diferencia,
      filasIncompletas,
      cumpleMinimoPorcentaje
    };
  }, [tablaPruebaSeleccionadaId, tablaActividadesExamen, tablaDetalleDrafts, tablaActividadIndicadoresDraftMap, tablaActividadIndicadoresBaseMap, tablaTipoFormato, tablaPuntosTotalesPrueba]);

  function getPruebaLabel(actividad: SeguimientoActividad, index: number) {
    return `Prueba ${index + 1} - ${Number(actividad.PorcentajeDentroRubro || 0).toFixed(2)}%`;
  }

  function getPuntosPorItems(detalle: ReturnType<typeof getTablaDetalle>) {
    const pares: Array<[string, string]> = [
      [detalle.seleccionRespuestaCantidad, detalle.seleccionRespuestaPuntos],
      [detalle.respuestaCortaCantidad, detalle.respuestaCortaPuntos],
      [detalle.correspondenciaCantidad, detalle.correspondenciaPuntos],
      [detalle.identificacionCantidad, detalle.identificacionPuntos],
      [detalle.resolucionEjerciciosCantidad, detalle.resolucionEjerciciosPuntos],
      [detalle.resolucionProblemasCantidad, detalle.resolucionProblemasPuntos],
      [detalle.respuestaRestringidaCantidad, detalle.respuestaRestringidaPuntos],
      [detalle.resolucionCasosCantidad, detalle.resolucionCasosPuntos],
      [detalle.produccionEscritaCantidad, detalle.produccionEscritaPuntos]
    ];
    return pares.reduce((acc, [c, p]) => {
      const cantidad = Number(String(c || "0").replace(",", "."));
      const puntos = Number(String(p || "0").replace(",", "."));
      return acc + (Number.isFinite(cantidad) ? cantidad : 0) * (Number.isFinite(puntos) ? puntos : 0);
    }, 0);
  }

  function getLeccionesPorItems(detalle: ReturnType<typeof getTablaDetalle>) {
    const cantidades: string[] = [
      detalle.seleccionRespuestaCantidad,
      detalle.respuestaCortaCantidad,
      detalle.correspondenciaCantidad,
      detalle.identificacionCantidad,
      detalle.resolucionEjerciciosCantidad,
      detalle.resolucionProblemasCantidad,
      detalle.respuestaRestringidaCantidad,
      detalle.resolucionCasosCantidad,
      detalle.produccionEscritaCantidad
    ];
    return cantidades.reduce((acc, c) => {
      const v = Number(String(c || "0").replace(",", "."));
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);
  }

  function getDetalleCamposItems(detalle: ReturnType<typeof getTablaDetalle>) {
    return [
      { key: "Seleccion de respuesta", cantidad: detalle.seleccionRespuestaCantidad, valor: detalle.seleccionRespuestaPuntos },
      { key: "Respuesta corta", cantidad: detalle.respuestaCortaCantidad, valor: detalle.respuestaCortaPuntos },
      { key: "Correspondencia", cantidad: detalle.correspondenciaCantidad, valor: detalle.correspondenciaPuntos },
      { key: "Identificacion", cantidad: detalle.identificacionCantidad, valor: detalle.identificacionPuntos },
      { key: "Resolucion de ejercicios", cantidad: detalle.resolucionEjerciciosCantidad, valor: detalle.resolucionEjerciciosPuntos },
      { key: "Resolucion de problemas", cantidad: detalle.resolucionProblemasCantidad, valor: detalle.resolucionProblemasPuntos },
      { key: "Respuesta restringida", cantidad: detalle.respuestaRestringidaCantidad, valor: detalle.respuestaRestringidaPuntos },
      { key: "Resolucion de casos", cantidad: detalle.resolucionCasosCantidad, valor: detalle.resolucionCasosPuntos },
      { key: "Produccion escrita", cantidad: detalle.produccionEscritaCantidad, valor: detalle.produccionEscritaPuntos }
    ];
  }

  function isItemParIncompleto(cantidad: string, valor: string) {
    const cNum = Number(String(cantidad || "0").replace(",", "."));
    const vNum = Number(String(valor || "0").replace(",", "."));
    if (Number.isFinite(cNum) && cNum >= 1) {
      return !Number.isFinite(vNum) || vNum <= 0;
    }
    return false;
  }

  function detalleItemsJsonTieneValores(detalleItemsJson: any) {
    if (!detalleItemsJson) return false;
    let parsed: any = null;
    try {
      parsed = typeof detalleItemsJson === "string" ? JSON.parse(detalleItemsJson) : detalleItemsJson;
    } catch {
      return false;
    }
    if (!parsed || typeof parsed !== "object") return false;
    for (const value of Object.values(parsed)) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return true;
    }
    return false;
  }

  const tablaIndicadoresUsadosGuardados = useMemo(() => {
    const used = new Set<number>();
    for (const item of (seguimientoContexto?.actividadIndicadores || [])) {
      if (item.Activo === false || item.Activo === 0) continue;
      if (detalleItemsJsonTieneValores(item.DetalleItemsJson) || Number(item.NumeroLecciones || 0) > 0 || Number(item.Puntos || 0) > 0) {
        used.add(Number(item.IndicadorGrupoId));
      }
    }
    return used;
  }, [seguimientoContexto?.actividadIndicadores]);

  const tablaEspecificacionesGuardadas = useMemo(() => tablaIndicadoresUsadosGuardados.size > 0, [tablaIndicadoresUsadosGuardados]);
  const tablaActividadParametrizadaMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const actividad of tablaActividadesExamen) {
      const actividadId = Number(actividad.ActividadId);
      const registros = (seguimientoContexto?.actividadIndicadores || []).filter((item) =>
        Number(item.ActividadId) === actividadId && item.Activo !== false && item.Activo !== 0
      );
      const parametrizada = registros.some((item) =>
        detalleItemsJsonTieneValores(item.DetalleItemsJson) ||
        Number(item.NumeroLecciones || 0) > 0 ||
        Number(item.Puntos || 0) > 0
      );
      map.set(actividadId, parametrizada);
    }
    return map;
  }, [tablaActividadesExamen, seguimientoContexto?.actividadIndicadores]);
  const tablaPruebasPendientes = useMemo(
    () => tablaActividadesExamen.filter((a) => !tablaActividadParametrizadaMap.get(Number(a.ActividadId))),
    [tablaActividadesExamen, tablaActividadParametrizadaMap]
  );
  const tablaPruebasGuardadas = useMemo(
    () => tablaActividadesExamen.filter((a) => Boolean(tablaActividadParametrizadaMap.get(Number(a.ActividadId)))),
    [tablaActividadesExamen, tablaActividadParametrizadaMap]
  );
  const tablaHayAsignacionesMatriz = useMemo(
    () => tablaActividadesExamen.some((a) => getTablaIndicadoresAsignadosActividad(Number(a.ActividadId)).length > 0),
    [tablaActividadesExamen, tablaActividadIndicadoresDraftMap, tablaActividadIndicadoresBaseMap]
  );

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    if (!tablaActividadesExamen.length) {
      if (tablaPruebaSeleccionadaId) setTablaPruebaSeleccionadaId("");
      return;
    }
    const actividadEditandoId = Number(tablaEditandoActividadId || 0);
    if (actividadEditandoId > 0) {
      const existeEditando = tablaActividadesExamen.some((item) => Number(item.ActividadId) === actividadEditandoId);
      if (existeEditando && String(tablaPruebaSeleccionadaId) !== String(actividadEditandoId)) {
        setTablaPruebaSeleccionadaId(String(actividadEditandoId));
      }
      return;
    }
    if (!tablaPruebasPendientes.length) {
      if (tablaPruebaSeleccionadaId) setTablaPruebaSeleccionadaId("");
      return;
    }
    const existe = tablaPruebasPendientes.some((item) => String(item.ActividadId) === String(tablaPruebaSeleccionadaId));
    if (!tablaPruebaSeleccionadaId || !existe) {
      setTablaPruebaSeleccionadaId(String(tablaPruebasPendientes[0].ActividadId));
    }
  }, [activePanel, tablaActividadesExamen, tablaPruebasPendientes, tablaPruebaSeleccionadaId, tablaEditandoActividadId]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    setTablaMatrizEditando(true);
    setTablaEspecificacionEditando(true);
  }, [activePanel, seguimientoContexto?.estructura?.EstructuraGrupoId]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    if (!selected) return;
    setExamenIaDraft((prev) => ({
      ...prev,
      tipoColegio: prev.tipoColegio || String(selected.GrupoJornada || "")
    }));
    if (!plantillasExamenIa.length) {
      loadPlantillasExamenIa();
    }
    loadExamenesIa();
  }, [activePanel, selected?.GrupoId]);

  async function guardarMatrizAsignacionPruebas() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para guardar la matriz de asignación");
      return;
    }
    if (!tablaActividadesExamen.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");
    try {
      for (const actividad of tablaActividadesExamen) {
        const indicadorIds = getTablaIndicadoresAsignadosActividad(Number(actividad.ActividadId));
        await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
          actividadId: actividad.ActividadId,
          indicadorIds,
          asignaciones: [],
          permitirMultiplesActividades: true
        });
      }
      setMessage("Matriz de asignación por prueba guardada correctamente");
      setTablaMatrizEditando(false);
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error guardando matriz de asignación por prueba:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la matriz de asignación por prueba");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  async function eliminarTablaEspecificaciones(actividadObjetivoId?: number) {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para eliminar la tabla de especificaciones");
      return;
    }
    if (!tablaActividadesExamen.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    const confirmar = window.confirm("¿Seguro que querés eliminar la tabla de especificaciones guardada? Esto habilitará nuevamente la edición de la matriz por prueba.");
    if (!confirmar) return;
    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");
    try {
      const actividadesObjetivo = actividadObjetivoId
        ? tablaActividadesExamen.filter((a) => Number(a.ActividadId) === Number(actividadObjetivoId))
        : tablaActividadesExamen;
      for (const actividad of actividadesObjetivo) {
        const indicadorIds = getTablaIndicadoresAsignadosActividad(Number(actividad.ActividadId));
        const asignaciones = indicadorIds.map((indicadorId) => ({
          indicadorId: Number(indicadorId),
          numeroLecciones: 0,
          puntos: 0,
          detalleItems: {
            seleccionRespuestaCantidad: 0,
            seleccionRespuestaPuntos: 0,
            correspondenciaCantidad: 0,
            correspondenciaPuntos: 0,
            identificacionCantidad: 0,
            identificacionPuntos: 0,
            respuestaCortaCantidad: 0,
            respuestaCortaPuntos: 0,
            respuestaRestringidaCantidad: 0,
            respuestaRestringidaPuntos: 0,
            resolucionEjerciciosCantidad: 0,
            resolucionEjerciciosPuntos: 0,
            resolucionProblemasCantidad: 0,
            resolucionProblemasPuntos: 0,
            resolucionCasosCantidad: 0,
            resolucionCasosPuntos: 0,
            produccionEscritaCantidad: 0,
            produccionEscritaPuntos: 0
          }
        }));
        await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
          actividadId: actividad.ActividadId,
          indicadorIds,
          asignaciones,
          permitirMultiplesActividades: true
        });
      }
      setTablaDetalleDrafts({});
      setTablaEspecificacionEditando(true);
      setTablaMatrizEditando(true);
      setTablaEditandoActividadId(null);
      setMessage("Tabla de especificaciones eliminada correctamente");
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error eliminando tabla de especificaciones:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la tabla de especificaciones");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  async function descargarTablaEspecificacionesExcel(actividadId: number) {
    try {
      const response = await api.get(`/eval360/tablas-especificaciones/${actividadId}/excel`, { responseType: "blob" });
      const selectedLabel = selected ? `${selected.GrupoNombre}-${selected.MateriaNombre}` : "tabla-especificaciones";
      descargarBlob(response.data, `tabla-especificaciones-${selectedLabel}-${actividadId}.xlsx`);
    } catch (error: any) {
      console.error("Error descargando tabla de especificaciones:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo descargar la tabla de especificaciones");
    }
  }

  async function guardarAsignacionTablaEspecificaciones() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para guardar la tabla de especificaciones");
      return;
    }
    if (!tablaActividadesExamen.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    const actividadIdSeleccionada = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadIdSeleccionada) {
      setErrorMessage("Seleccioná la prueba que querés guardar");
      return;
    }
    const actividad = tablaActividadesExamen.find((a) => Number(a.ActividadId) === actividadIdSeleccionada);
    if (!actividad) {
      setErrorMessage("La prueba seleccionada no es válida");
      return;
    }
    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");
    try {
      {
        const indicadorIds = getTablaIndicadoresAsignadosActividad(Number(actividad.ActividadId));
        const totalLeccionesManual = indicadorIds.reduce((acc, indicadorId) => {
          const detalle = getTablaDetalle(Number(actividad.ActividadId), Number(indicadorId));
          const leccionesNum = Number(String(detalle.numeroLecciones || "").replace(",", "."));
          return acc + (Number.isFinite(leccionesNum) ? leccionesNum : 0);
        }, 0);
        const puntosActividad = Number(actividad.PuntosMaximos || 0);
        const totalLeccionesAntes = indicadorIds.reduce((acc, indicadorId) => {
          const detalle = getTablaDetalle(Number(actividad.ActividadId), Number(indicadorId));
          return acc + getLeccionesPorItems(detalle);
        }, 0);
        const totalPuntosAntes = indicadorIds.reduce((acc, indicadorId) => {
          const detalle = getTablaDetalle(Number(actividad.ActividadId), Number(indicadorId));
          return acc + getPuntosPorItems(detalle);
        }, 0);
        const asignaciones = indicadorIds.map((indicadorId) => {
          const detalle = getTablaDetalle(Number(actividad.ActividadId), Number(indicadorId));
          const leccionesNum = Number(String(detalle.numeroLecciones || "").replace(",", "."));
          const puntosItems = getPuntosPorItems(detalle);
          const puntosFormula = tablaTipoFormato === "ANTES"
            ? puntosItems
            : (Number.isFinite(totalLeccionesManual) && totalLeccionesManual > 0
                ? Math.round((puntosActividad / totalLeccionesManual) * (Number.isFinite(leccionesNum) ? leccionesNum : 0))
                : 0);
          const leccionesFormulaRaw = tablaTipoFormato === "ANTES"
            ? (totalPuntosAntes > 0 ? (puntosItems * (Number.isFinite(totalLeccionesAntes) ? totalLeccionesAntes : 0)) / totalPuntosAntes : 0)
            : leccionesNum;
          const leccionesFormula = tablaTipoFormato === "ANTES"
            ? Math.round(Number(leccionesFormulaRaw || 0))
            : leccionesFormulaRaw;
          return {
            indicadorId: Number(indicadorId),
            numeroLecciones: Number(leccionesFormula || 0),
            puntos: Number(puntosFormula || 0),
            detalleItems: {
              seleccionRespuestaCantidad: Number(String(detalle.seleccionRespuestaCantidad || "").replace(",", ".")) || 0,
              seleccionRespuestaPuntos: Number(String(detalle.seleccionRespuestaPuntos || "").replace(",", ".")) || 0,
              correspondenciaCantidad: Number(String(detalle.correspondenciaCantidad || "").replace(",", ".")) || 0,
              correspondenciaPuntos: Number(String(detalle.correspondenciaPuntos || "").replace(",", ".")) || 0,
              identificacionCantidad: Number(String(detalle.identificacionCantidad || "").replace(",", ".")) || 0,
              identificacionPuntos: Number(String(detalle.identificacionPuntos || "").replace(",", ".")) || 0,
              respuestaCortaCantidad: Number(String(detalle.respuestaCortaCantidad || "").replace(",", ".")) || 0,
              respuestaCortaPuntos: Number(String(detalle.respuestaCortaPuntos || "").replace(",", ".")) || 0,
              respuestaRestringidaCantidad: Number(String(detalle.respuestaRestringidaCantidad || "").replace(",", ".")) || 0,
              respuestaRestringidaPuntos: Number(String(detalle.respuestaRestringidaPuntos || "").replace(",", ".")) || 0,
              resolucionEjerciciosCantidad: Number(String(detalle.resolucionEjerciciosCantidad || "").replace(",", ".")) || 0,
              resolucionEjerciciosPuntos: Number(String(detalle.resolucionEjerciciosPuntos || "").replace(",", ".")) || 0,
              resolucionProblemasCantidad: Number(String(detalle.resolucionProblemasCantidad || "").replace(",", ".")) || 0,
              resolucionProblemasPuntos: Number(String(detalle.resolucionProblemasPuntos || "").replace(",", ".")) || 0,
              resolucionCasosCantidad: Number(String(detalle.resolucionCasosCantidad || "").replace(",", ".")) || 0,
              resolucionCasosPuntos: Number(String(detalle.resolucionCasosPuntos || "").replace(",", ".")) || 0,
              produccionEscritaCantidad: Number(String(detalle.produccionEscritaCantidad || "").replace(",", ".")) || 0,
              produccionEscritaPuntos: Number(String(detalle.produccionEscritaPuntos || "").replace(",", ".")) || 0
            }
          };
        });
        await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
          actividadId: actividad.ActividadId,
          indicadorIds,
          asignaciones,
          permitirMultiplesActividades: true
        });
      }
      setMessage("Tabla de especificaciones actualizada correctamente");
      setTablaEspecificacionEditando(false);
      setTablaMatrizEditando(false);
      setTablaEditandoActividadId(null);
      await loadSeguimientoEvaluacion(selected);
      if (!tablaPruebaSeleccionadaId && tablaActividadesExamen.length > 0) {
        setTablaPruebaSeleccionadaId(String(tablaActividadesExamen[0].ActividadId));
      }
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error guardando tabla de especificaciones:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la tabla de especificaciones");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  function getSeccionesExamenDisponibles() {
    if (!selected) return [] as GrupoProfesor[];
    return grupos
      .filter((g) =>
        Number(g.MateriaId) === Number(selected.MateriaId) &&
        String(g.GrupoNivel || "").trim() === String(selected.GrupoNivel || "").trim()
      )
      .sort((a, b) => String(a.GrupoNombre).localeCompare(String(b.GrupoNombre), undefined, { numeric: true }));
  }

  function getTablasEspecificacionesOpciones() {
    return tablaPruebasGuardadas.map((actividad, idx) => ({
      id: String(actividad.ActividadId),
      nombre: `${getPruebaLabel(actividad, idx)} (sección actual)`
    }));
  }

  async function guardarExamenCreado() {
    if (!selected) {
      setErrorMessage("Seleccioná un grupo");
      return;
    }
    if (!examenIaDraft.tablaId) {
      setErrorMessage("Seleccioná una tabla de especificaciones");
      return;
    }
    if (!examenIaDraft.plantillaId) {
      setErrorMessage("Seleccioná una plantilla de exámenes");
      return;
    }
    if (examenIaDraft.archivoFormato && !/\.docx$/i.test(String(examenIaDraft.archivoFormato.name || ""))) {
      setErrorMessage("El formato de salida debe ser un archivo .docx");
      return;
    }
    const idxPrueba = tablaActividadesExamen.findIndex((a) => String(a.ActividadId) === String(examenIaDraft.tablaId));
    const pruebaNombre = idxPrueba >= 0 ? `Prueba ${idxPrueba + 1}` : "Prueba";
    const grado = String(selected.GrupoNivel || selected.GrupoNombre || "").trim() || "Grado";
    const materia = String(selected.MateriaNombre || "").trim() || "Materia";
    const periodo = String(selected.PeriodoNombre || "").trim() || "Periodo";
    const nombreDefault = `${pruebaNombre}-${grado}-${materia}, ${periodo}`;
    const nombreFinal = (examenIaDraft.nombre || nombreDefault).trim();
    const estructuraGrupoId = Number(seguimientoContexto?.estructura?.EstructuraGrupoId || 0);
    try {
      if (editingExamenId || examenIaGeneradoId) {
        const idToUpdate = editingExamenId || examenIaGeneradoId;
        await api.put(`/eval360/examenes-ia/${idToUpdate}`, {
          nombre: nombreFinal,
          indicaciones: (examenIaDraft.indicaciones || "").trim(),
          resultadoIA: (examenIaResultadoDraft || "").trim()
        });
        await loadExamenesIa();
        setEditingExamenId("");
        setExamenIaGeneradoId("");
        setExamenIaResultadoDraft("");
        setCrearExamenesOpen(false);
        setMessage("Examen guardado correctamente.");
      } else {
        setGenerandoExamenIa(true);
        const form = new FormData();
        form.append("estructuraGrupoId", String(estructuraGrupoId));
        form.append("actividadIdTabla", String(Number(examenIaDraft.tablaId)));
        form.append("plantillaPromptIAId", String(Number(examenIaDraft.plantillaId)));
        const seccionesIds = examenIaDraft.seccionIds.length ? examenIaDraft.seccionIds.map(Number) : [Number(selected.GrupoId)];
        seccionesIds.forEach((id) => form.append("seccionGrupoIds", String(id)));
        form.append("tipoColegio", examenIaDraft.tipoColegio || "");
        form.append("fuenteWord", (examenIaDraft.fuenteWord || "Calibri").trim());
        form.append("tamanoWord", String(Number(examenIaDraft.tamanoWord || "11") || 11));
        form.append("nombre", nombreFinal);
        form.append("formatoSalidaNombre", examenIaDraft.archivoFormato?.name || "");
        form.append("indicaciones", (examenIaDraft.indicaciones || "").trim());
        form.append("documentoApoyoNombre", examenIaDraft.documentoApoyo?.name || "");
        if (examenIaDraft.archivoFormato) {
          form.append("formatoSalidaArchivo", examenIaDraft.archivoFormato);
        }
        if (examenIaDraft.documentoApoyo) {
          form.append("documentoApoyoArchivo", examenIaDraft.documentoApoyo);
        }
        const response = await api.post("/eval360/examenes-ia/generar", form);
        const row = response?.data?.data || response?.data || {};
        const generatedId = String(row?.ExamenIAGeneradoId || "");
        const resultado = String(row?.ResultadoIA || "");
        setExamenIaGeneradoId(generatedId);
        setExamenIaResultadoDraft(resultado);
        setMessage("Examen generado. Revisalo, ajustalo y luego guardalo.");
        await loadExamenesIa();
      }
    } catch (error: any) {
      console.error("Error guardando/generando examen IA:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo generar el examen con IA");
      return;
    } finally {
      setGenerandoExamenIa(false);
    }
  }

function updateAsistenciaDraft(estudianteId: number, horarioGrupoId: number, field: "estado" | "minutosTardia" | "observacion" | "notificarEncargado", value: string | boolean) {
  const key = asistenciaDraftKey(estudianteId, horarioGrupoId);
  const previo = asistenciaDrafts[key];
  const estadoNuevo = (field === "estado" ? (value as EstadoAsistencia) : (previo?.estado || "PRESENTE")) as EstadoAsistencia;
  const mensajeSugerido = getMensajeAsistenciaPreconfigurado(seguimientoContexto?.mensajesSeguimiento || [], estadoNuevo);
  const observacionSiguiente =
    field === "observacion"
      ? String(value)
      : (field === "estado" ? (mensajeSugerido || "") : String(previo?.observacion || ""));
  setAsistenciaDrafts((prev) => ({
    ...prev,
    [key]: {
      estado: prev[key]?.estado || "PRESENTE",
      minutosTardia: prev[key]?.minutosTardia || "",
      observacion: observacionSiguiente,
      notificarEncargado: prev[key]?.notificarEncargado || false,
      [field]: field === "estado" ? value as EstadoAsistencia : field === "notificarEncargado" ? Boolean(value) : String(value)
    }
  }));
}

  function getResumenAsistencia(estudianteId: number) {
    return resumenAsistencia.find((item) => Number(item.EstudianteId) === Number(estudianteId));
  }


  async function loadGrupos(search = q) {
    setLoadingGrupos(true);
    setErrorMessage("");
    try {
      const response = await api.get("/gestion-profe/mis-grupos", {
        params: { q: search }
      });
      const data = response.data?.data || response.data || [];
      setGrupos(Array.isArray(data) ? deduplicarGruposProfesor(data).sort(compararGruposProfesor) : []);
    } catch (error: any) {
      console.error("Error cargando Gestión del Profe:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar los grupos asignados");
    } finally {
      setLoadingGrupos(false);
    }
  }

  async function loadDetalle(item: GrupoProfesor) {
    setSelected(item);
    setDetalle(null);
    setNoteDrafts({});
    setPlaneamientos([]);
    setPlaneamientoIndicadores([]);
    setAsistenciaDrafts({});
    setAsistenciaLecciones([]);
    setResumenAsistencia([]);
    setEval360Plantillas([]);
    setEval360PlantillaId("");
    setEval360Estructura(null);
    setEval360DetallesDraft([]);
    setEval360Indicadores([]);
    setEval360PlantillasIaIndicadores([]);
    setEval360PlantillaIaIndicadorId("");
    setEval360PlaneamientoId("");
    setEval360IndicacionesIa("");
    setEval360TiposUso(["Cotidiano", "Tareas", "TablaEspecificaciones"]);
    setEval360IndicadoresPorPlaneamiento({});
    setEval360PanelIndicadoresOpen({});
    setEval360IndicacionesPorPlaneamiento({});
    setEval360TiposUsoPorPlaneamiento({});
    setEval360IndicadoresMinimizados({});
    setGeneratingEval360PlaneamientoId(null);
    setSeguimientoContexto(null);
    setSeguimientoTipo("");
    setSeguimientoPlaneamientoId("");
    setSeguimientoEstadoFiltro("NO_CALIFICADO");
    setSeguimientoIndicadorId("");
    setSeguimientoDrafts({});
    setSeguimientoActividadIndicadoresDraft({});
    setSeguimientoMatrizAsignacionMinimizada(true);
    resetPlaneamientoForm();
    setPlaneamientoIaForm({
      ...initialPlaneamientoIaForm,
      materiaId: String(item.MateriaId),
      grado: getGradoPlaneamientoFromGrupo(item),
      grupoId: String(item.GrupoId),
      grupoIds: [String(item.GrupoId)],
      tema: "",
      indicaciones: ""
    });
    setHabilidadesIa([]);
    setUltimoPlaneamientoIa(null);
    setEditingPlaneamientoIaId(null);
    setPlaneamientoIaFormOpen(false);
    setDocumentoApoyoIa(null);
    setPlantillaFormatoIa(null);
    setActivePanel("");
    setMessage("");
    setErrorMessage("");
    setLoadingDetalle(true);

    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId
        }
      });
      const data = response.data?.data || response.data || null;
      setDetalle(data);
      setNoteDrafts(buildDraftsFromDetalle(data));
      await Promise.all([
        loadPlaneamientos(item),
        loadSeguimientoEvaluacion(item)
      ]);
    } catch (error: any) {
      console.error("Error cargando detalle del grupo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el detalle del grupo seleccionado");
    } finally {
      setLoadingDetalle(false);
    }
  }


  async function loadNivelesDesempeno() {
    try {
      const response = await api.get("/evaluacion/niveles-desempeno", {
        params: { q: "", incluirInactivos: false }
      });
      const data = response.data?.data || response.data || [];
      setNivelesDesempeno(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error cargando niveles de desempeño:", error);
    }
  }


  function unwrapApiData(response: any) {
    return response?.data?.data ?? response?.data ?? null;
  }

  function totalEval360(detalles = eval360DetallesDraft) {
    return detalles
      .filter((item) => item.Activo !== false && item.Activo !== 0)
      .reduce((sum, item) => sum + Number(item.Porcentaje || 0), 0);
  }

  async function loadEval360Data(item = selected) {
    if (!item) return;

    setLoadingEval360(true);
    setErrorMessage("");

    try {
      const [plantillasResponse, estructuraResponse] = await Promise.all([
        api.get("/eval360/plantillas", {
          params: {
            anioLectivoId: item.AnioLectivoId,
            periodoId: item.PeriodoId,
            materiaId: item.MateriaId,
            incluirInactivas: false
          }
        }),
        api.get("/eval360/estructuras/grupo", {
          params: {
            grupoId: item.GrupoId,
            materiaId: item.MateriaId,
            anioLectivoId: item.AnioLectivoId,
            periodoId: item.PeriodoId
          }
        })
      ]);

      const plantillas = unwrapApiData(plantillasResponse) || [];
      const estructura = unwrapApiData(estructuraResponse);

      setEval360Plantillas(Array.isArray(plantillas) ? plantillas : []);
      setEval360Estructura(estructura || null);
      setEval360DetallesDraft(Array.isArray(estructura?.detalles) ? estructura.detalles : []);
      setEval360PlantillaId(estructura?.estructura?.PlantillaBaseId ? String(estructura.estructura.PlantillaBaseId) : "");

      await loadEval360PlantillasIaIndicadores();
      if (estructura?.estructura?.EstructuraGrupoId) {
        await loadEval360Indicadores(Number(estructura.estructura.EstructuraGrupoId));
      } else {
        setEval360Indicadores([]);
      }
    } catch (error: any) {
      console.error("Error cargando Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la estructura de evaluación");
    } finally {
      setLoadingEval360(false);
    }
  }

  async function crearEval360DesdePlantilla() {
    if (!selected) return;

    setSavingEval360(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/estructuras/crear-desde-plantilla", {
        grupoId: selected.GrupoId,
        materiaId: selected.MateriaId,
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        plantillaId: eval360PlantillaId || null,
        nombre: "Evaluación " + selected.GrupoNombre + " - " + selected.MateriaNombre + " - " + selected.PeriodoNombre
      });

      const data = unwrapApiData(response);
      setEval360Estructura(data || null);
      setEval360DetallesDraft(Array.isArray(data?.detalles) ? data.detalles : []);
      setMessage(response?.data?.message || "Estructura de evaluación creada correctamente");
      await loadEval360Data(selected);
    } catch (error: any) {
      console.error("Error creando estructura Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo crear la estructura de evaluación");
    } finally {
      setSavingEval360(false);
    }
  }


  async function loadSeguimientoEvaluacion(item = selected) {
    if (!item) return;
    setLoadingSeguimiento(true);
    setErrorMessage("");

    try {
      const response = await api.get("/eval360/seguimiento/contexto", {
        params: {
          grupoId: item.GrupoId,
          materiaId: item.MateriaId,
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          _ts: Date.now()
        }
      });
      const dataRaw = unwrapApiData(response) || null;
      const data = (() => {
        if (!dataRaw) return dataRaw;
        const detalles = Array.isArray(dataRaw.detalles) ? dataRaw.detalles : [];
        const actividades = Array.isArray(dataRaw.actividades) ? dataRaw.actividades : [];
        const examDetalleIds = new Set(
          detalles
            .filter((d: any) => isTipoExamenSeguimiento(getTipoSeguimientoFromDetalle(d)))
            .map((d: any) => Number(d.EstructuraGrupoDetalleId || 0))
            .filter((id: number) => id > 0)
        );
        const actividadesAjustadas = actividades.map((a: any) => ({ ...a }));
        const porDetalle = new Map<number, any[]>();
        for (const act of actividadesAjustadas) {
          const detalleId = Number(act.EstructuraGrupoDetalleId || 0);
          if (!examDetalleIds.has(detalleId)) continue;
          const arr = porDetalle.get(detalleId) || [];
          arr.push(act);
          porDetalle.set(detalleId, arr);
        }
        for (const [detalleId, acts] of porDetalle.entries()) {
          const detalle = detalles.find((d: any) => Number(d.EstructuraGrupoDetalleId || 0) === Number(detalleId));
          const porcentajeComponente = Number(detalle?.Porcentaje || 0);
          const n = acts.length || 1;
          const porcentajePorActividad = porcentajeComponente > 0 ? (porcentajeComponente / n) : 0;
          acts.forEach((act: any) => {
            act.PorcentajeDentroRubro = porcentajePorActividad;
          });
        }
        return { ...dataRaw, actividades: actividadesAjustadas };
      })();
      setSeguimientoContexto(data);
      setEval360Plantillas(Array.isArray(data?.plantillas) ? data.plantillas : []);
      setEval360Estructura(data?.estructura ? { estructura: data.estructura, detalles: data.detalles || [], niveles: [] } : null);
      setEval360DetallesDraft(Array.isArray(data?.detalles) ? data.detalles : []);
      setEval360PlantillaId(data?.estructura?.PlantillaBaseId ? String(data.estructura.PlantillaBaseId) : "");
      setSeguimientoDrafts({});
      setSeguimientoInformarDrafts({});
      setSeguimientoRecuperacionDrafts({});
      setSeguimientoExamenDrafts({});
      setSeguimientoActividadInformarDrafts({});
      setSeguimientoActividadPuntosMaximosDrafts({});
      setSeguimientoActividadIndicadoresDraft({});
    } catch (error: any) {
      console.error("Error cargando seguimiento de notas:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el seguimiento de notas");
    } finally {
      setLoadingSeguimiento(false);
    }
  }

  function updateSeguimientoDraft(indicadorGrupoId: number, estudianteId: number, estado: SeguimientoEstado) {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const key = getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId);
    const aviso = seguimientoInformarDrafts[key];
    const mensajePlantilla = getMensajePreconfigurado(
      seguimientoContexto?.mensajesSeguimiento || [],
      seguimientoTipo,
      getEstadoSeguimientoValor(estado)
    );
    setSeguimientoDrafts((prev) => ({
      ...prev,
      [key]: estado
    }));
    if (aviso?.informar) {
      setSeguimientoInformarDrafts((prev) => ({
        ...prev,
        [key]: {
          ...aviso,
          observacion: mensajePlantilla || ""
        }
      }));
    }
  }

  function updateSeguimientoInformarDraft(indicadorGrupoId: number, estudianteId: number, patch: Partial<SeguimientoInformarDraft>) {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const key = getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId);
    const estadoActual = getSeguimientoEstadoActual(indicadorGrupoId, estudianteId);
    const valorNivel = getEstadoSeguimientoValor(estadoActual);
    const mensajePlantilla = getMensajePreconfigurado(seguimientoContexto?.mensajesSeguimiento || [], seguimientoTipo, valorNivel);
    setSeguimientoInformarDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { informar: false, observacion: "" }),
        ...patch,
        observacion: patch.informar === true
          ? (patch.observacion !== undefined
              ? String(patch.observacion || "")
              : (mensajePlantilla || ""))
          : (patch.observacion !== undefined ? String(patch.observacion || "") : (prev[key]?.observacion || ""))
      }
    }));
  }

  function getSeguimientoInformarActual(indicadorGrupoId: number, estudianteId: number): SeguimientoInformarDraft {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const key = getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId);
    if (seguimientoInformarDrafts[key]) return seguimientoInformarDrafts[key];
    const existing = (seguimientoContexto?.seguimientos || []).find((s) =>
      Number(s.IndicadorGrupoId) === Number(indicadorGrupoId)
      && Number(s.EstudianteId) === Number(estudianteId)
      && (!actividadId || Number(s.ActividadId) === Number(actividadId))
    );
    return { informar: false, observacion: existing?.Observacion || "" };
  }

  function updateSeguimientoRecuperacionDraft(indicadorGrupoId: number, estudianteId: number, patch: Partial<SeguimientoRecuperacionDraft>) {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const key = getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId);
    setSeguimientoRecuperacionDrafts((prev) => {
      const base = prev[key] || getSeguimientoRecuperacionActual(indicadorGrupoId, estudianteId);
      const siguiente = {
        ...base,
        ...patch
      };
      if (patch.activa === false && patch.texto === undefined) siguiente.texto = "";
      return {
        ...prev,
        [key]: siguiente
      };
    });
  }

  function getSeguimientoRecuperacionActual(indicadorGrupoId: number, estudianteId: number): SeguimientoRecuperacionDraft {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const key = getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId);
    if (seguimientoRecuperacionDrafts[key]) return seguimientoRecuperacionDrafts[key];
    const existing = (seguimientoContexto?.seguimientos || []).find((s) =>
      Number(s.IndicadorGrupoId) === Number(indicadorGrupoId)
      && Number(s.EstudianteId) === Number(estudianteId)
      && (!actividadId || Number(s.ActividadId) === Number(actividadId))
    );
    return {
      activa: Boolean(existing?.ActRecuperacion),
      texto: String(existing?.ActRecuperacionTexto || "")
    };
  }

  function getSeguimientoEstadoActual(indicadorGrupoId: number, estudianteId: number): SeguimientoEstado | "" {
    const actividadId = seguimientoModoHibridoTareas ? (seguimientoActividadSeleccionada?.ActividadId || 0) : 0;
    const draft = seguimientoDrafts[getSeguimientoDraftKey(indicadorGrupoId, estudianteId, actividadId)];
    if (draft) return draft;
    const existing = (seguimientoContexto?.seguimientos || []).find((s) =>
      Number(s.IndicadorGrupoId) === Number(indicadorGrupoId)
      && Number(s.EstudianteId) === Number(estudianteId)
      && (!actividadId || Number(s.ActividadId) === Number(actividadId))
    );
    if (!existing) return "AVANZADO";
    const key = normalizarSeguimientoKey(existing.NivelNombre).replace(/\s+/g, "_");
    if (key.includes("NO_ENTREGADO")) return "NO_ENTREGADO";
    if (key.includes("AUSENTE")) return "AUSENTE";
    if (key.includes("INICIAL")) return "INICIAL";
    if (key.includes("INTERMEDIO")) return "INTERMEDIO";
    if (key.includes("AVANZADO")) return "AVANZADO";
    const valor = Number(existing.ValorSeleccionado || 0);
    if (valor >= 3) return "AVANZADO";
    if (valor >= 2) return "INTERMEDIO";
    if (valor >= 1) return "INICIAL";
    return normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE";
  }

  function getSeguimientoExamenDraft(actividadId: number, estudianteId: number): SeguimientoExamenDraft {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    if (seguimientoExamenDrafts[key]) return seguimientoExamenDrafts[key];
    const existing = (seguimientoContexto?.notasActividades || []).find((nota) => Number(nota.ActividadId) === Number(actividadId) && Number(nota.EstudianteId) === Number(estudianteId));
    return {
      puntosObtenidos: existing?.PuntosObtenidos !== null && existing?.PuntosObtenidos !== undefined ? String(existing.PuntosObtenidos) : "",
      observacion: existing?.Observacion || ""
    };
  }

  function updateSeguimientoExamenDraft(actividadId: number, estudianteId: number, patch: Partial<SeguimientoExamenDraft>) {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    setSeguimientoExamenDrafts((prev) => ({
      ...prev,
      [key]: {
        ...getSeguimientoExamenDraft(actividadId, estudianteId),
        ...patch
      }
    }));
  }

  function getSeguimientoActividadPuntosMaximos(actividad?: SeguimientoActividad | null) {
    if (!actividad?.ActividadId) return "";
    const key = String(actividad.ActividadId);
    if (seguimientoActividadPuntosMaximosDrafts[key] !== undefined) return seguimientoActividadPuntosMaximosDrafts[key];
    const value = actividad.PuntosMaximos !== null && actividad.PuntosMaximos !== undefined ? Number(actividad.PuntosMaximos) : 0;
    return value > 0 ? String(value) : "";
  }

  function updateSeguimientoActividadPuntosMaximos(actividadId: number, value: string) {
    setSeguimientoActividadPuntosMaximosDrafts((prev) => ({
      ...prev,
      [String(actividadId)]: value
    }));
  }

  function calcularNotaExamen(puntosObtenidos: string, puntosMaximos: number) {
    const texto = String(puntosObtenidos || "").trim();
    const obtenidos = texto === "" ? NaN : Number(texto);
    const maximos = Number(puntosMaximos || 0);
    if (!Number.isFinite(obtenidos) || !Number.isFinite(maximos) || maximos <= 0) return 0;
    return Number(((obtenidos / maximos) * 100).toFixed(2));
  }

  function calcularPorcentajeGanadoExamen(nota: number, actividad?: SeguimientoActividad | null, detalleItem?: SeguimientoEvaluacionDetalle | null) {
    void detalleItem;
    const pe = Number(actividad?.PorcentajeDentroRubro || 0);
    return Number(((Number(nota || 0) / 100) * pe).toFixed(2));
  }

  async function guardarSeguimientoActividad() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || !seguimientoActividadSeleccionada) {
      setErrorMessage("Seleccioná el grupo, la plantilla, el componente y la actividad para guardar");
      return;
    }

    const puntosMaximos = Number(String(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)).replace(",", "."));
    if (!Number.isFinite(puntosMaximos) || puntosMaximos <= 0) {
      setErrorMessage("Indicá la cantidad de puntos que vale la actividad");
      return;
    }

    const registros = (seguimientoContexto.estudiantes || []).map((estudiante) => {
      const draft = getSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
      const aviso = getSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
      const puntosTexto = String(draft.puntosObtenidos || "").trim();
      return {
        estudianteId: estudiante.EstudianteId,
        puntosObtenidos: puntosTexto === "" ? null : Number(puntosTexto),
        observacion: aviso.informar ? (aviso.observacion || draft.observacion || "") : (draft.observacion || ""),
        informarEncargado: aviso.informar
      };
    });

    const invalid = registros.find((item) => item.puntosObtenidos !== null && (!Number.isFinite(Number(item.puntosObtenidos)) || !Number.isInteger(Number(item.puntosObtenidos)) || Number(item.puntosObtenidos) < 0 || Number(item.puntosObtenidos) > puntosMaximos));
    if (invalid) {
      setErrorMessage("Los puntos obtenidos deben ser números enteros entre 0 y " + puntosMaximos);
      return;
    }

    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/seguimiento/guardar-actividad", {
        estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
        estructuraGrupoDetalleId: seguimientoDetalleSeleccionado.EstructuraGrupoDetalleId,
        actividadId: seguimientoActividadSeleccionada.ActividadId,
        puntosMaximos,
        registros
      });
      setMessage(response?.data?.message || "Evaluación guardada correctamente");
      setSeguimientoContexto((prev) => prev ? {
        ...prev,
        actividades: (prev.actividades || []).map((actividad) =>
          Number(actividad.ActividadId) === Number(seguimientoActividadSeleccionada.ActividadId)
            ? { ...actividad, PuntosMaximos: puntosMaximos }
            : actividad
        ),
        notasActividades: (prev.notasActividades || []).map((nota) =>
          Number(nota.ActividadId) === Number(seguimientoActividadSeleccionada.ActividadId)
            ? { ...nota, PuntosMaximos: puntosMaximos }
            : nota
        )
      } : prev);
      setSeguimientoActividadPuntosMaximosDrafts((prev) => ({
        ...prev,
        [String(seguimientoActividadSeleccionada.ActividadId)]: String(puntosMaximos)
      }));
      await loadSeguimientoEvaluacion(selected);
    } catch (error: any) {
      console.error("Error guardando actividad:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la actividad");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  async function guardarSeguimientoIndicador() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || !seguimientoIndicadorSeleccionado || (seguimientoModoHibridoTareas && !seguimientoActividadSeleccionada)) {
      setErrorMessage("Seleccioná el grupo, la plantilla, el componente y el indicador para guardar");
      return;
    }

    const registros = (seguimientoContexto.estudiantes || [])
      .map((estudiante) => {
        const aviso = getSeguimientoInformarActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId);
        const recuperacion = isTipoCotidianoSeguimiento(seguimientoTipo)
          ? getSeguimientoRecuperacionActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId)
          : { activa: false, texto: "" };
        return {
          estudianteId: estudiante.EstudianteId,
          estado: getSeguimientoEstadoActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId) || "AVANZADO",
          informarEncargado: aviso.informar,
          observacion: aviso.informar ? aviso.observacion : "",
          actRecuperacion: Boolean(recuperacion.activa),
          actRecuperacionTexto: recuperacion.activa ? String(recuperacion.texto || "") : ""
        };
      })
      .filter((item) => item.estado);

    if (!registros.length) {
      setErrorMessage("Marcá al menos una calificación antes de guardar");
      return;
    }

    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/seguimiento/guardar-indicador", {
        estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
        estructuraGrupoDetalleId: seguimientoDetalleSeleccionado.EstructuraGrupoDetalleId,
        actividadId: seguimientoModoHibridoTareas ? seguimientoActividadSeleccionada?.ActividadId : null,
        indicadorGrupoId: seguimientoIndicadorSeleccionado.IndicadorGrupoId,
        tipoUso: seguimientoTipo,
        registros
      });
      const data = response?.data?.data || response?.data || {};
      const notificaciones = Array.isArray(data?.notificaciones) ? data.notificaciones : [];
      const enviados = notificaciones.filter((item: any) => item?.canal === "correo" && item?.enviado).length;
      const fallidos = notificaciones.filter((item: any) => item?.canal === "correo" && item?.enviado === false).length;
      const primerFallo = notificaciones.find((item: any) => item?.canal === "correo" && item?.enviado === false);
      const primerError = primerFallo?.error || primerFallo?.motivo || (primerFallo?.modo === "simulado" ? "Envío en modo simulado" : "");
      const baseMessage = response?.data?.message || "Evaluación guardada correctamente";
      setMessage(fallidos > 0 ? `${baseMessage}. Correos enviados: ${enviados}. Fallidos: ${fallidos}.${primerError ? ` Error: ${primerError}` : ""}` : baseMessage);
      await loadSeguimientoEvaluacion(selected);
      if (activePanel === "notas") await loadDetalle(selected);
    } catch (error: any) {
      console.error("Error guardando seguimiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el seguimiento");
    } finally {
      setSavingSeguimiento(false);
    }
  }
  function updateEval360Detalle(index: number, field: "Nombre" | "Porcentaje" | "Activo", value: string | boolean) {
    setEval360DetallesDraft((prev) => prev.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      if (field === "Porcentaje") return { ...item, Porcentaje: Number(value) || 0 };
      if (field === "Activo") return { ...item, Activo: Boolean(value) };
      return { ...item, Nombre: String(value) };
    }));
  }

  async function guardarEval360Estructura() {
    if (!eval360Estructura?.estructura?.EstructuraGrupoId) return;

    const total = Number(totalEval360().toFixed(2));
    if (total !== 100) {
      setErrorMessage("La estructura suma " + total + "%. Debe sumar 100% para guardar");
      return;
    }

    setSavingEval360(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/eval360/estructuras/" + eval360Estructura.estructura.EstructuraGrupoId + "/detalles", {
        detalles: eval360DetallesDraft.map((item) => ({
          estructuraGrupoDetalleId: item.EstructuraGrupoDetalleId,
          componenteCatalogoId: item.ComponenteCatalogoId,
          nombre: item.Nombre,
          porcentaje: Number(item.Porcentaje || 0),
          orden: item.Orden,
          activo: item.Activo !== false && item.Activo !== 0
        }))
      });

      const data = unwrapApiData(response);
      setEval360Estructura(data || null);
      setEval360DetallesDraft(Array.isArray(data?.detalles) ? data.detalles : []);
      setMessage(response?.data?.message || "Estructura de evaluación actualizada correctamente");
    } catch (error: any) {
      console.error("Error guardando estructura Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la estructura de evaluación");
    } finally {
      setSavingEval360(false);
    }
  }


  async function loadEval360PlantillasIaIndicadores() {
    try {
      const response = await api.get("/eval360/plantillas-ia-indicadores");
      const data = unwrapApiData(response) || [];
      const plantillas = Array.isArray(data) ? data : [];
      setEval360PlantillasIaIndicadores(plantillas);
      setEval360PlantillaIaIndicadorId((prev) => {
        if (prev && plantillas.some((p: PlantillaPromptIA) => Number(p.Id) === Number(prev))) return prev;
        return plantillas[0]?.Id ? String(plantillas[0].Id) : "";
      });
    } catch (error: any) {
      console.error("Error cargando plantillas IA de indicadores:", error);
      setEval360PlantillasIaIndicadores([]);
    }
  }

  function getEval360TiposUsoPlaneamiento(planeamientoId: number) {
    return eval360TiposUsoPorPlaneamiento[planeamientoId] || ["Cotidiano", "Tareas", "TablaEspecificaciones"];
  }

  function getEval360IndicacionesPlaneamiento(planeamientoId: number) {
    return eval360IndicacionesPorPlaneamiento[planeamientoId] || "";
  }

  async function loadEval360Indicadores(estructuraGrupoId?: number, planeamientoId?: number) {
    const id = Number(estructuraGrupoId || eval360Estructura?.estructura?.EstructuraGrupoId || 0);
    const planId = Number(planeamientoId || eval360PlaneamientoId || 0);

    if (!id && !planId) return;

    setLoadingEval360Indicadores(true);
    setErrorMessage("");

    try {
      const response = await api.get("/eval360/indicadores", {
        params: {
          estructuraGrupoId: id || undefined,
          planeamientoId: planId || undefined
        }
      });
      const data = unwrapApiData(response) || [];
      const indicadores = Array.isArray(data) ? getEval360IndicadoresActivos(data) : [];
      setEval360Indicadores(indicadores);
      if (planId) {
        setEval360IndicadoresPorPlaneamiento((prev) => ({
          ...prev,
          [planId]: indicadores
        }));
      }
    } catch (error: any) {
      console.error("Error cargando indicadores Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar los indicadores de seguimiento");
    } finally {
      setLoadingEval360Indicadores(false);
    }
  }

  function toggleEval360TipoUso(tipo: string) {
    setEval360TiposUso((prev) => {
      const exists = prev.includes(tipo);
      const next = exists ? prev.filter((item) => item !== tipo) : [...prev, tipo];
      return next.length ? next : prev;
    });
  }

  function toggleEval360TipoUsoPlaneamiento(planeamientoId: number, tipo: string) {
    setEval360TiposUsoPorPlaneamiento((prev) => {
      const actuales = prev[planeamientoId] || ["Cotidiano", "Tareas", "TablaEspecificaciones"];
      const exists = actuales.includes(tipo);
      const next = exists ? actuales.filter((item) => item !== tipo) : [...actuales, tipo];
      return {
        ...prev,
        [planeamientoId]: next.length ? next : actuales
      };
    });
  }

  function togglePanelIndicadoresPlaneamiento(planeamientoId: number) {
    setEval360PanelIndicadoresOpen((prev) => {
      const nextOpen = !prev[planeamientoId];
      if (nextOpen) {
        loadEval360PlantillasIaIndicadores();
        loadEval360Indicadores(undefined, planeamientoId);
      }
      return {
        ...prev,
        [planeamientoId]: nextOpen
      };
    });
  }

  function toggleMinimizarIndicadoresPlaneamiento(planeamientoId: number) {
    setEval360IndicadoresMinimizados((prev) => ({
      ...prev,
      [planeamientoId]: !prev[planeamientoId]
    }));
  }

  async function generarEval360IndicadoresDesdePlaneamiento(planeamientoIdParam?: number) {
    const estructuraGrupoId = Number(eval360Estructura?.estructura?.EstructuraGrupoId || 0);
    const planeamientoId = Number(planeamientoIdParam || eval360PlaneamientoId || 0);
    const tiposUso = ["Cotidiano", "Tareas", "TablaEspecificaciones"];
    const indicacionesDocente = planeamientoIdParam ? getEval360IndicacionesPlaneamiento(planeamientoId) : eval360IndicacionesIa;

    if (!planeamientoId) {
      setErrorMessage("Seleccioná un planeamiento guardado para tomar sus indicadores");
      return;
    }
    setGeneratingEval360Indicadores(true);
    setGeneratingEval360PlaneamientoId(planeamientoId);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/indicadores/generar-desde-planeamiento", {
        estructuraGrupoId: estructuraGrupoId || null,
        planeamientoId,
        plantillaPromptIAId: eval360PlantillaIaIndicadorId || null,
        indicacionesDocente: indicacionesDocente || "",
        tiposUso
      });

      const data = unwrapApiData(response) || {};
      const indicadores = Array.isArray(data.indicadores) ? data.indicadores : [];
      setEval360Indicadores(indicadores);
      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        [planeamientoId]: indicadores
      }));
      setEval360PanelIndicadoresOpen((prev) => ({ ...prev, [planeamientoId]: true }));
      setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: false }));
      setMessage(response?.data?.message || "Indicadores generados correctamente");
      await loadEval360Indicadores(Number(data.estructuraGrupoId || estructuraGrupoId || 0), planeamientoId);
    } catch (error: any) {
      console.error("Error generando indicadores Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron generar los indicadores desde el planeamiento");
    } finally {
      setGeneratingEval360Indicadores(false);
      setGeneratingEval360PlaneamientoId(null);
    setSeguimientoContexto(null);
    setSeguimientoTipo("");
    setSeguimientoPlaneamientoId("");
    setSeguimientoEstadoFiltro("NO_CALIFICADO");
    setSeguimientoIndicadorId("");
    setSeguimientoDrafts({});
    }
  }

  function updateEval360IndicadorLocal(index: number, field: keyof Eval360Indicador, value: string | boolean) {
    setEval360Indicadores((prev) => prev.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      if (field === "Activo") return { ...item, Activo: Boolean(value) };
      return { ...item, [field]: String(value) } as Eval360Indicador;
    }));
  }

  function isEval360IndicadorActivo(indicador: Eval360Indicador) {
    return indicador.Activo !== false && indicador.Activo !== 0;
  }

  function getEval360IndicadoresActivos(indicadores: Eval360Indicador[]) {
    return indicadores.filter(isEval360IndicadorActivo);
  }

  function limpiarIndicadoresEliminadosLocalmente(planeamientoId: number, indicadoresEliminados: Eval360Indicador[]) {
    const idsEliminados = new Set(indicadoresEliminados.map((item) => Number(item.IndicadorGrupoId)));

    setEval360IndicadoresPorPlaneamiento((prev) => ({
      ...prev,
      [planeamientoId]: (prev[planeamientoId] || []).filter((item) => !idsEliminados.has(Number(item.IndicadorGrupoId)))
    }));

    setEval360Indicadores((prev) => prev.filter((item) => !idsEliminados.has(Number(item.IndicadorGrupoId))));
  }

  function updateEval360IndicadorPlaneamientoLocal(planeamientoId: number, indicadorGrupoId: number, field: keyof Eval360Indicador, value: string | boolean) {
    setEval360IndicadoresPorPlaneamiento((prev) => ({
      ...prev,
      [planeamientoId]: (prev[planeamientoId] || []).map((item) => {
        if (Number(item.IndicadorGrupoId) !== Number(indicadorGrupoId)) return item;
        if (field === "Activo") return { ...item, Activo: Boolean(value) };
        return { ...item, [field]: String(value) } as Eval360Indicador;
      })
    }));
  }

  async function guardarEval360Indicador(indicador: Eval360Indicador, planeamientoId?: number) {
    if (!indicador?.IndicadorGrupoId) return;

    setSavingEval360IndicadorId(indicador.IndicadorGrupoId);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/eval360/indicadores/" + indicador.IndicadorGrupoId, {
        indicadorAvanzado: indicador.IndicadorAvanzado,
        indicadorIntermedio: indicador.IndicadorIntermedio,
        indicadorInicial: indicador.IndicadorInicial,
        activo: indicador.Activo !== false && indicador.Activo !== 0
      });
      setMessage(response?.data?.message || "Indicador actualizado correctamente");
      await loadEval360Indicadores(Number(indicador.EstructuraGrupoId), planeamientoId || Number(indicador.PlaneamientoId || 0));
    } catch (error: any) {
      console.error("Error guardando indicador Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el indicador");
    } finally {
      setSavingEval360IndicadorId(null);
    }
  }

  async function eliminarEval360Indicador(indicador: Eval360Indicador, planeamientoId?: number) {
    if (!indicador?.IndicadorGrupoId) return;

    const confirmed = window.confirm("¿Deseás eliminar este indicador del seguimiento?");
    if (!confirmed) return;

    setSavingEval360IndicadorId(indicador.IndicadorGrupoId);
    setMessage("");
    setErrorMessage("");

    try {
      await api.delete("/eval360/indicadores/" + indicador.IndicadorGrupoId);
      const planId = planeamientoId || Number(indicador.PlaneamientoId || 0);
      if (planId) {
        limpiarIndicadoresEliminadosLocalmente(planId, [indicador]);
      }
      setMessage("Indicador eliminado correctamente");
    } catch (error: any) {
      console.error("Error eliminando indicador Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el indicador");
    } finally {
      setSavingEval360IndicadorId(null);
    }
  }

  function getIndicadoresAgrupadosPorBase(indicadores: Eval360Indicador[]) {
    const map = new Map<string, Eval360Indicador[]>();

    indicadores.forEach((indicador) => {
      const key = [indicador.IndicadorBase || "", indicador.PlaneamientoId || "", indicador.EstructuraGrupoId || ""].join("|");
      const actuales = map.get(key) || [];
      actuales.push(indicador);
      map.set(key, actuales);
    });

    return Array.from(map.values());
  }

  function getIndicadorPrincipal(grupoIndicadores: Eval360Indicador[]) {
    return grupoIndicadores[0];
  }

  function getIndicadorPorTipo(grupoIndicadores: Eval360Indicador[], tipo: string) {
    return grupoIndicadores.find((item) => item.TipoUso === tipo);
  }

  function updateEval360GrupoIndicadorPlaneamientoLocal(planeamientoId: number, grupoIndicadores: Eval360Indicador[], field: keyof Eval360Indicador, value: string | boolean, tipoUso?: string) {
    const idsGrupo = new Set(grupoIndicadores.map((item) => Number(item.IndicadorGrupoId)));

    setEval360IndicadoresPorPlaneamiento((prev) => ({
      ...prev,
      [planeamientoId]: (prev[planeamientoId] || []).map((item) => {
        const perteneceAlGrupo = idsGrupo.has(Number(item.IndicadorGrupoId));
        const perteneceAlTipo = !tipoUso || item.TipoUso === tipoUso;
        if (!perteneceAlGrupo || !perteneceAlTipo) return item;
        if (field === "Activo") return { ...item, Activo: Boolean(value) };
        return { ...item, [field]: String(value) } as Eval360Indicador;
      })
    }));
  }

  async function guardarEval360CambiosIndicadoresPlaneamiento(planeamientoId: number) {
    const indicadoresActuales = eval360IndicadoresPorPlaneamiento[planeamientoId] || [];

    if (!indicadoresActuales.length) {
      setMessage("No hay indicadores generados para guardar");
      return;
    }

    setSavingEval360PlaneamientoCambiosId(planeamientoId);
    setMessage("");
    setErrorMessage("");

    try {
      await Promise.all(indicadoresActuales.map((indicador) => api.put("/eval360/indicadores/" + indicador.IndicadorGrupoId, {
        indicadorAvanzado: indicador.IndicadorAvanzado,
        indicadorIntermedio: indicador.IndicadorIntermedio,
        indicadorInicial: indicador.IndicadorInicial,
        activo: indicador.Activo !== false && indicador.Activo !== 0
      })));

      setMessage("Cambios de indicadores guardados correctamente");
      const estructuraGrupoId = Number(indicadoresActuales[0]?.EstructuraGrupoId || 0) || undefined;
      await loadEval360Indicadores(estructuraGrupoId, planeamientoId);
    } catch (error: any) {
      console.error("Error guardando cambios de indicadores Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron guardar los cambios de los indicadores");
    } finally {
      setSavingEval360PlaneamientoCambiosId(null);
    }
  }

  async function eliminarEval360GrupoIndicadores(grupoIndicadores: Eval360Indicador[], planeamientoId: number) {
    const principal = getIndicadorPrincipal(grupoIndicadores);
    if (!principal?.IndicadorGrupoId) return;

    const confirmed = window.confirm("¿Deseás eliminar este indicador del seguimiento?");
    if (!confirmed) return;

    setSavingEval360IndicadorId(principal.IndicadorGrupoId);
    setMessage("");
    setErrorMessage("");

    try {
      await Promise.all(grupoIndicadores.map((indicador) => api.delete("/eval360/indicadores/" + indicador.IndicadorGrupoId)));
      const planId = planeamientoId || Number(principal.PlaneamientoId || 0);
      if (planId) {
        limpiarIndicadoresEliminadosLocalmente(planId, grupoIndicadores);
      }
      setMessage("Indicador eliminado correctamente");
    } catch (error: any) {
      console.error("Error eliminando indicador Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el indicador");
    } finally {
      setSavingEval360IndicadorId(null);
    }
  }

  async function eliminarTodosEval360IndicadoresPlaneamiento(planeamientoId: number) {
    const indicadoresActuales = getEval360IndicadoresActivos(eval360IndicadoresPorPlaneamiento[planeamientoId] || []);

    if (!indicadoresActuales.length) {
      setMessage("No hay indicadores generados para eliminar");
      return;
    }

    const confirmed = window.confirm("¿Deseás eliminar todos los indicadores generados con IA de este planeamiento?");
    if (!confirmed) return;

    setDeletingEval360PlaneamientoId(planeamientoId);
    setMessage("");
    setErrorMessage("");

    try {
      await api.delete("/eval360/indicadores/planeamiento/" + planeamientoId);

      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        [planeamientoId]: []
      }));

      setEval360Indicadores((prev) => prev.filter((item) => Number(item.PlaneamientoId || 0) !== Number(planeamientoId)));
      setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: false }));
      setMessage("Indicadores eliminados correctamente. Ya podés generar indicadores con IA nuevamente.");
      await loadEval360Indicadores(undefined, planeamientoId);
    } catch (error: any) {
      console.error("Error eliminando todos los indicadores Eval360:", error);
      const message = error?.response?.data?.message || "No se pudieron eliminar los indicadores";
      setErrorMessage(message);
    } finally {
      setDeletingEval360PlaneamientoId(null);
    }
  }

  function etiquetaTipoUso(tipo: string) {
    if (tipo === "Cotidiano") return "Trabajo cotidiano";
    if (tipo === "Tareas") return "Tareas";
    if (tipo === "TablaEspecificaciones") return "Tabla de especificaciones";
    return tipo;
  }

  async function loadPlaneamientos(
    item = selected,
    options: { sincronizar?: boolean; mostrarLoading?: boolean } = {}
  ) {
    if (!item) return;

    const mostrarLoading = options.mostrarLoading !== false;
    if (mostrarLoading) setLoadingPlaneamientos(true);
    setErrorMessage("");

    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/planeamientos`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          sincronizar: options.sincronizar === true ? true : false
        }
      });
      const data = response.data?.data || response.data || {};
      const planeamientosData = Array.isArray(data.planeamientos) ? data.planeamientos : [];
      setPlaneamientos(planeamientosData);
      setPlaneamientoIndicadores(Array.isArray(data.indicadores) ? data.indicadores : []);

      if (data.sincronizacion?.copiado && Number(data.sincronizacion?.totalPlaneamientosCopiados || 0) > 0) {
        setMessage(`Se copiaron ${data.sincronizacion.totalPlaneamientosCopiados} planeamiento(s) desde otra sección del mismo grado para este profesor. Podés ajustarlos para esta sección sin afectar el original.`);
      }

      const indicadoresIncluidos = Array.isArray(data.indicadoresEval360)
        ? getEval360IndicadoresActivos(data.indicadoresEval360)
        : [];
      const indicadoresIncluidosPorPlan = indicadoresIncluidos.reduce((acc, indicador) => {
        const planeamientoId = Number(indicador.PlaneamientoId || 0);
        if (!planeamientoId) return acc;
        acc[planeamientoId] = [...(acc[planeamientoId] || []), indicador];
        return acc;
      }, {} as Record<number, Eval360Indicador[]>);

      const indicadoresPorPlan = planeamientosData.map((planeamiento: Planeamiento) => {
        const planeamientoId = Number(planeamiento.PlaneamientoId || 0);
        if (!planeamientoId) return [planeamientoId, []] as [number, Eval360Indicador[]];
        return [planeamientoId, indicadoresIncluidosPorPlan[planeamientoId] || []] as [number, Eval360Indicador[]];
      });

      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        ...(Object.fromEntries(indicadoresPorPlan) as Record<number, Eval360Indicador[]>)
      }));
    } catch (error: any) {
      console.error("Error cargando planeamientos:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar los planeamientos");
    } finally {
      if (mostrarLoading) setLoadingPlaneamientos(false);
    }
  }

  function removerPlaneamientoLocal(id: number) {
    setPlaneamientos((prev) => prev.filter((item) => Number(item.PlaneamientoId) !== Number(id)));
    setPlaneamientoIndicadores((prev) => prev.filter((item) => Number(item.PlaneamientoId || 0) !== Number(id)));
    setEval360Indicadores((prev) => prev.filter((item) => Number(item.PlaneamientoId || 0) !== Number(id)));
    setEval360IndicadoresPorPlaneamiento((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEval360PanelIndicadoresOpen((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEval360IndicadoresMinimizados((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEval360IndicacionesPorPlaneamiento((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (eval360PlaneamientoId === String(id)) setEval360PlaneamientoId("");
    if (seguimientoPlaneamientoId === String(id)) setSeguimientoPlaneamientoId("");
  }

  function resetPlaneamientoForm() {
    setPlaneamientoForm(initialPlaneamientoForm);
    setEditingPlaneamientoId(null);
    setPlaneamientoFormOpen(false);
  }

  function openNewPlaneamiento() {
    setMessage("");
    setErrorMessage("");
    setEditingPlaneamientoId(null);
    setPlaneamientoForm({
      ...initialPlaneamientoForm,
      nombre: selected ? `${selected.MateriaNombre} - ${selected.PeriodoNombre}` : ""
    });
    setPlaneamientoFormOpen(true);
  }

  function openEditPlaneamiento(item: Planeamiento) {
    setMessage("");
    setErrorMessage("");
    setActivePanel("planeamientos");

    if (item.ResultadoIAJson) {
      try {
        const parsed = typeof item.ResultadoIAJson === "string"
          ? JSON.parse(item.ResultadoIAJson)
          : item.ResultadoIAJson;

        setUltimoPlaneamientoIa(normalizePlaneamientoIaResultado({
          ...(parsed || {}),
          nombre: parsed?.nombre || item.Nombre || "Planeamiento didáctico",
          observaciones: parsed?.observaciones || item.Observaciones || ""
        }));
        setEditingPlaneamientoIaId(item.PlaneamientoId);
        setPlaneamientoIaFormOpen(true);
        setPlaneamientoFormOpen(false);
        setEditingPlaneamientoId(null);
        return;
      } catch (error) {
        console.error("No se pudo leer el JSON del planeamiento generado por IA:", error);
        setErrorMessage("Este planeamiento fue generado con IA, pero no se pudo abrir con el editor avanzado. Se abrirá el editor manual.");
      }
    }

    const indicadores = planeamientoIndicadores
      .filter((indicador) => indicador.PlaneamientoId === item.PlaneamientoId)
      .map((indicador) => ({
        PlaneamientoIndicadorId: indicador.PlaneamientoIndicadorId,
        PlaneamientoId: indicador.PlaneamientoId,
        Descripcion: indicador.Descripcion,
        NivelDesempenoId: indicador.NivelDesempenoId || null,
        NivelDescripcion: indicador.NivelDescripcion,
        NivelValor: indicador.NivelValor
      }));

    setEditingPlaneamientoId(item.PlaneamientoId);
    setEditingPlaneamientoIaId(null);
    setPlaneamientoForm({
      nombre: item.Nombre || "",
      fechaInicio: item.FechaInicio ? String(item.FechaInicio).slice(0, 10) : "",
      fechaFin: item.FechaFin ? String(item.FechaFin).slice(0, 10) : "",
      observaciones: item.Observaciones || "",
      indicadores: indicadores.length > 0 ? indicadores : [{ Descripcion: "", NivelDesempenoId: null }]
    });
    setPlaneamientoFormOpen(true);
    setPlaneamientoIaFormOpen(false);
    setUltimoPlaneamientoIa(null);
  }

  function updatePlaneamientoField(field: keyof Omit<PlaneamientoForm, "indicadores">, value: string) {
    setPlaneamientoForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateIndicador(index: number, field: keyof PlaneamientoIndicador, value: string) {
    setPlaneamientoForm((prev) => ({
      ...prev,
      indicadores: prev.indicadores.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              [field]: field === "NivelDesempenoId" ? (value ? Number(value) : null) : value
            }
          : item
      )
    }));
  }

  function addIndicador() {
    setPlaneamientoForm((prev) => ({
      ...prev,
      indicadores: [...prev.indicadores, { Descripcion: "", NivelDesempenoId: null }]
    }));
  }

  function removeIndicador(index: number) {
    setPlaneamientoForm((prev) => ({
      ...prev,
      indicadores: prev.indicadores.length <= 1
        ? [{ Descripcion: "", NivelDesempenoId: null }]
        : prev.indicadores.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  async function handleSavePlaneamiento(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const indicadores = planeamientoForm.indicadores
      .map((item) => ({
        descripcion: String(item.Descripcion || "").trim(),
        nivelDesempenoId: item.NivelDesempenoId || null
      }))
      .filter((item) => item.descripcion !== "");

    if (!planeamientoForm.nombre.trim()) {
      setErrorMessage("El nombre del planeamiento es obligatorio");
      return;
    }

    if (indicadores.length === 0) {
      setErrorMessage("Agregá al menos un indicador de evaluación");
      return;
    }

    setSavingPlaneamiento(true);
    setMessage("");
    setErrorMessage("");

    const payload = {
      anioLectivoId: selected.AnioLectivoId,
      periodoId: selected.PeriodoId,
      nombre: planeamientoForm.nombre,
      fechaInicio: planeamientoForm.fechaInicio || null,
      fechaFin: planeamientoForm.fechaFin || null,
      observaciones: planeamientoForm.observaciones || null,
      indicadores
    };

    try {
      const response = editingPlaneamientoId
        ? await api.put(`/gestion-profe/planeamientos/${editingPlaneamientoId}`, payload)
        : await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/planeamientos`, payload);

      const result = response.data?.data || {};
      setMessage(result.message || "Planeamiento guardado correctamente");
      resetPlaneamientoForm();
      await loadPlaneamientos(selected);
    } catch (error: any) {
      console.error("Error guardando planeamiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el planeamiento");
    } finally {
      setSavingPlaneamiento(false);
    }
  }

  async function handleDeletePlaneamiento(id: number) {
    const confirmed = window.confirm("¿Deseás desactivar este planeamiento?");
    if (!confirmed || !selected) return;

    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.delete(`/gestion-profe/planeamientos/${id}`);
      const result = response.data?.data || {};
      setMessage(result.message || "Planeamiento desactivado correctamente");
      if (editingPlaneamientoId === id) resetPlaneamientoForm();
      removerPlaneamientoLocal(id);
    } catch (error: any) {
      console.error("Error desactivando planeamiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el planeamiento");
    }
  }

  async function handleHardDeletePlaneamiento(id: number) {
    if (!selected) return;

    const option = window.prompt(
      "¿Cómo querés eliminar este planeamiento?\n\n1 = Solo esta sección\n2 = Todas las secciones del mismo grado\n\nEscribí 1 o 2.",
      "1"
    );
    if (option === null) return;

    const clean = String(option).trim();
    if (clean !== "1" && clean !== "2") {
      setErrorMessage("Opción inválida. Escribí 1 para esta sección o 2 para todas las secciones del grado.");
      return;
    }

    const alcance = clean === "2" ? "todas" : "seccion";
    const confirmed = window.confirm(
      alcance === "todas"
        ? "Esta acción eliminará el planeamiento en todas las secciones del mismo grado donde aplique. ¿Deseás continuar?"
        : "Esta acción eliminará el planeamiento de forma definitiva en esta sección. ¿Deseás continuar?"
    );
    if (!confirmed) return;

    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.delete(`/gestion-profe/planeamientos/${id}/eliminar-definitivo`, {
        params: { alcance }
      });
      const result = response.data?.data || {};
      setMessage(
        result.message
        || (alcance === "todas"
          ? "Planeamiento eliminado para todas las secciones del grado"
          : "Planeamiento eliminado correctamente")
      );
      if (editingPlaneamientoId === id) resetPlaneamientoForm();
      await loadPlaneamientos(selected, { mostrarLoading: false });
    } catch (error: any) {
      console.error("Error eliminando planeamiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el planeamiento");
    }
  }

  function getSeguimientoActividadInformarDraft(actividadId: number, estudianteId: number): SeguimientoActividadInformarDraft {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    if (seguimientoActividadInformarDrafts[key]) return seguimientoActividadInformarDrafts[key];
    const existing = getSeguimientoExamenDraft(actividadId, estudianteId);
    return { informar: false, observacion: existing.observacion || "" };
  }

  function updateSeguimientoActividadInformarDraft(actividadId: number, estudianteId: number, patch: Partial<SeguimientoActividadInformarDraft>) {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    setSeguimientoActividadInformarDrafts((prev) => ({
      ...prev,
      [key]: {
        ...getSeguimientoActividadInformarDraft(actividadId, estudianteId),
        ...patch
      }
    }));
  }

  function updatePlaneamientoIaField(field: keyof Omit<PlaneamientoIaForm, "habilidadesIds">, value: string) {
    if ((field === "materiaId" || field === "grado") && selected) {
      return;
    }

    setPlaneamientoIaForm((prev) => {
      const next: PlaneamientoIaForm = { ...prev, [field]: value };

      if (field === "materiaId") {
        next.grado = "";
        next.grupoId = "";
        next.grupoIds = [];
        next.filtroTipo = "";
        next.mes = "";
        next.area = "";
        next.habilidadesIds = [];
        next.busquedaTexto = "";
      }

      if (field === "grado") {
        next.grupoId = "";
        next.grupoIds = [];
        next.filtroTipo = "";
        next.mes = "";
        next.area = "";
        next.habilidadesIds = [];
        next.busquedaTexto = "";
      }

      if (field === "grupoId") {
        next.grupoIds = value ? [value] : [];
        next.habilidadesIds = [];
      }

      if (field === "filtroTipo") {
        next.mes = "";
        next.area = "";
        next.habilidadesIds = [];
      }

      if (field === "mes") {
        next.area = "";
        next.habilidadesIds = [];
      }

      if (field === "area") {
        next.mes = "";
        next.habilidadesIds = [];
      }

      return next;
    });

    if (field === "materiaId" || field === "grado") {
      setHabilidadesIa([]);
      setUltimoPlaneamientoIa(null);
    }
  }

  function toggleSeccionPlaneamientoIa(grupoId: number) {
    const id = String(grupoId);
    setPlaneamientoIaForm((prev) => {
      const exists = prev.grupoIds.includes(id);
      const grupoIds = exists ? prev.grupoIds.filter((item) => item !== id) : [...prev.grupoIds, id];
      return {
        ...prev,
        grupoIds,
        grupoId: grupoIds[0] || "",
        habilidadesIds: []
      };
    });
  }

  function seleccionarTodasSeccionesPlaneamientoIa() {
    const ids = seccionesAsignadas.map((grupo) => String(grupo.GrupoId));
    setPlaneamientoIaForm((prev) => ({
      ...prev,
      grupoIds: ids,
      grupoId: ids[0] || "",
      habilidadesIds: []
    }));
  }

  function limpiarSeccionesPlaneamientoIa() {
    setPlaneamientoIaForm((prev) => ({
      ...prev,
      grupoIds: [],
      grupoId: "",
      habilidadesIds: []
    }));
  }

  function toggleHabilidadIa(id: number) {
    setPlaneamientoIaForm((prev) => {
      const exists = prev.habilidadesIds.includes(id);
      return {
        ...prev,
        habilidadesIds: exists
          ? prev.habilidadesIds.filter((item) => item !== id)
          : [...prev.habilidadesIds, id]
      };
    });
  }

  function seleccionarTodasHabilidadesIa() {
    const ids = habilidadesFiltradasIa.map((habilidad) => Number(habilidad.PlaneamientoHabilidadId));
    setPlaneamientoIaForm((prev) => ({ ...prev, habilidadesIds: ids }));
  }

  function limpiarHabilidadesIa() {
    setPlaneamientoIaForm((prev) => ({ ...prev, habilidadesIds: [] }));
  }

  function getGruposPlaneamientoIa() {
    const ids = planeamientoIaForm.grupoIds.length
      ? planeamientoIaForm.grupoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : planeamientoIaForm.grupoId
        ? [Number(planeamientoIaForm.grupoId)]
        : selected?.GrupoId
          ? [Number(selected.GrupoId)]
          : [];

    const materiaSeleccionadaId = Number(selected?.MateriaId || planeamientoIaForm.materiaId || 0);

    const encontrados = ids
      .map((id) => {
        const mismoGrupoYMateria = grupos.find((grupo) =>
          Number(grupo.GrupoId) === id &&
          (!materiaSeleccionadaId || Number(grupo.MateriaId) === materiaSeleccionadaId)
        );

        if (mismoGrupoYMateria) return mismoGrupoYMateria;

        if (selected && Number(selected.GrupoId) === id && (!materiaSeleccionadaId || Number(selected.MateriaId) === materiaSeleccionadaId)) {
          return selected;
        }

        return grupos.find((grupo) => Number(grupo.GrupoId) === id);
      })
      .filter(Boolean) as GrupoProfesor[];

    return encontrados.length ? encontrados : selected ? [selected] : [];
  }

  function getGrupoPlaneamientoIa() {
    return getGruposPlaneamientoIa()[0] || selected;
  }

  async function loadPlantillasPlaneamientoIa() {
    setLoadingPlantillasPlaneamientoIa(true);

    try {
      const response = await api.get("/ia/plantillas", { params: { tipoGeneracionIAId: 1 } });
      const data = response.data?.data || response.data || [];
      const plantillas = Array.isArray(data) ? data : [];
      setPlantillasPlaneamientoIa(plantillas);

      setPlantillaPlaneamientoIaId((prev) => {
        if (prev && plantillas.some((plantilla: PlantillaPromptIA) => Number(plantilla.Id) === Number(prev))) {
          return prev;
        }

        return plantillas[0]?.Id ? String(plantillas[0].Id) : "";
      });
    } catch (error) {
      console.error("Error cargando plantillas IA de planeamiento:", error);
      setPlantillasPlaneamientoIa([]);
    } finally {
      setLoadingPlantillasPlaneamientoIa(false);
    }
  }

  async function loadPlantillasExamenIa() {
    setLoadingPlantillasExamenIa(true);
    try {
      const response = await api.get("/eval360/plantillas-ia-examenes");
      let data = response.data?.data || response.data || [];
      let plantillas = Array.isArray(data) ? data : [];
      if (!plantillas.length) {
        const fallback = await api.get("/ia/plantillas", { params: { tipoGeneracionIAId: 2 } });
        data = fallback.data?.data || fallback.data || [];
        plantillas = Array.isArray(data) ? data : [];
      }
      setPlantillasExamenIa(plantillas);
      setExamenIaDraft((prev) => ({
        ...prev,
        plantillaId: prev.plantillaId && plantillas.some((p: PlantillaPromptIA) => Number(p.Id) === Number(prev.plantillaId))
          ? prev.plantillaId
          : (plantillas[0]?.Id ? String(plantillas[0].Id) : "")
      }));
    } catch (error) {
      console.error("Error cargando plantillas IA de exámenes:", error);
      setPlantillasExamenIa([]);
    } finally {
      setLoadingPlantillasExamenIa(false);
    }
  }

  async function loadExamenesIa() {
    const estructuraGrupoId = Number(seguimientoContexto?.estructura?.EstructuraGrupoId || 0);
    if (!estructuraGrupoId) return;
    try {
      const response = await api.get("/eval360/examenes-ia", { params: { estructuraGrupoId } });
      const data = response.data?.data || response.data || [];
      const rows = Array.isArray(data) ? data : [];
      const mapped: ExamenIaCreado[] = rows.map((row: any) => ({
        id: String(row.ExamenIAGeneradoId),
        nombre: String(row.Nombre || ""),
        materia: String(row.Materia || ""),
        grado: String(row.Grado || ""),
        periodo: String(row.Periodo || ""),
        secciones: (() => {
          try {
            const arr = JSON.parse(String(row.SeccionesJson || "[]"));
            return Array.isArray(arr) ? arr.map((x: any) => String(x)) : [];
          } catch { return []; }
        })(),
        tablaNombre: `Actividad ${row.ActividadIdTabla}`,
        plantillaNombre: String(row.PlantillaPromptIAId || ""),
        indicaciones: String(row.Indicaciones || ""),
        resultadoIA: String(row.ResultadoIA || ""),
        creadoEn: String(row.CreatedAt || "").slice(0, 10)
      }));
      setExamenesCreados(mapped);
    } catch (error) {
      console.error("Error cargando exámenes IA:", error);
      setExamenesCreados([]);
    }
  }

  async function descargarExamenWord(examenId: string, modo: "examen" | "respuestas" = "examen") {
    try {
      const response = await api.get(`/eval360/examenes-ia/${examenId}/word`, {
        params: { modo, _ts: Date.now() },
        responseType: "blob",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
      a.download = `${modo === "respuestas" ? "respuestas-examen" : "examen"}-${examenId}-${stamp}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo generar el Word");
    }
  }

  async function loadHabilidadesIa(materiaIdParam?: number, gradoParam?: string, showValidation = true) {
    const materiaId = Number(materiaIdParam || planeamientoIaForm.materiaId || selected?.MateriaId || 0);
    const grado = normalizarGradoPlaneamiento(gradoParam || getGradoPlaneamientoFromGrupo(selected) || planeamientoIaForm.grado);

    if (!materiaId || !grado) {
      if (showValidation) setErrorMessage("Seleccioná primero la materia y el grado");
      return;
    }

    setLoadingHabilidadesIa(true);
    if (showValidation) setErrorMessage("");
    setUltimoPlaneamientoIa(null);

    try {
      const response = await api.get("/planeamiento-ia/habilidades", {
        params: {
          materiaId,
          grado,
          incluirInactivas: false
        }
      });

      const data = response.data?.data || response.data || [];
      const habilidades = Array.isArray(data) ? data : [];
      setHabilidadesIa(habilidades);
      setPlaneamientoIaForm((prev) => ({
        ...prev,
        habilidadesIds: prev.habilidadesIds.filter((id) =>
          habilidades.some((habilidad: PlaneamientoHabilidad) => Number(habilidad.PlaneamientoHabilidadId) === Number(id))
        )
      }));

      if (habilidades.length === 0) {
        setErrorMessage("No hay habilidades activas para esa materia y grado. Revisá el mantenimiento en Académico");
      }
    } catch (error: any) {
      console.error("Error cargando habilidades para IA:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar las habilidades");
    } finally {
      setLoadingHabilidadesIa(false);
    }
  }

  async function generarPlaneamientoConIa() {
    const gruposSeleccionados = getGruposPlaneamientoIa();
    const grupoSeleccionado = gruposSeleccionados[0];
    const materiaId = Number(selected?.MateriaId || grupoSeleccionado?.MateriaId || planeamientoIaForm.materiaId || 0);
    const grupoId = Number(grupoSeleccionado?.GrupoId || selected?.GrupoId || 0);
    const grado = getGradoPlaneamientoFromGrupo(selected) || getGradoPlaneamientoFromGrupo(grupoSeleccionado) || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
    const materia = materiasAsignadas.find((item) => Number(item.MateriaId) === materiaId) || selected || grupoSeleccionado;
    const habilidadesIds = planeamientoIaForm.habilidadesIds;

    if (!materiaId) {
      setErrorMessage("Seleccioná la materia");
      return;
    }

    if (!grado) {
      setErrorMessage("Seleccioná el grado");
      return;
    }

    if (!grupoId || !grupoSeleccionado || !gruposSeleccionados.length) {
      setErrorMessage("Seleccioná al menos una sección");
      return;
    }

    if (!habilidadesIds.length) {
      setErrorMessage("Seleccioná al menos una habilidad");
      return;
    }

    setGeneratingPlaneamientoIa(true);
    setMessage("");
    setErrorMessage("");
    setUltimoPlaneamientoIa(null);

    const temaCompleto = [
      planeamientoIaForm.tema ? `Tema o énfasis: ${planeamientoIaForm.tema}` : "",
      mesesSeleccionadosTextoIa ? `Meses seleccionados: ${mesesSeleccionadosTextoIa}` : "",
      planeamientoIaForm.area ? `Área: ${planeamientoIaForm.area}` : ""
    ].filter(Boolean).join("\n\n");

    try {
      const formData = new FormData();
      formData.append("materiaId", String(materiaId));
      formData.append("materiaNombre", materia?.MateriaNombre || "");
      formData.append("tipoColegio", planeamientoIaForm.tipoColegio || "Académico");
      formData.append("grado", grado);
      formData.append("mes", mesesSeleccionadosTextoIa || "");
      formData.append("area", planeamientoIaForm.area || "");
      formData.append("tema", temaCompleto);
      formData.append("indicacionesDocente", planeamientoIaForm.indicaciones || "");
      formData.append("semanas", String(Number(planeamientoIaForm.semanas || 4)));
      if (plantillaPlaneamientoIaId) formData.append("plantillaPromptIAId", plantillaPlaneamientoIaId);
      habilidadesIds.forEach((id) => formData.append("habilidadesIds[]", String(id)));
      if (documentoApoyoIa) formData.append("documentoApoyo", documentoApoyoIa);
      if (plantillaFormatoIa) formData.append("plantillaFormato", plantillaFormatoIa);

      const generarResponse = await api.post("/planeamiento-ia/generar-planeamiento", formData, {
        timeout: 70000
      });

      const generadoData = generarResponse.data?.data || generarResponse.data || {};
      const resultado: PlaneamientoIaResultado = normalizePlaneamientoIaResultado(generadoData.resultado || generadoData);
      setUltimoPlaneamientoIa(resultado);
      setMessage("Planeamiento generado. Revisá y ajustá la propuesta antes de guardarla.");
    } catch (error: any) {
      console.error("Error generando planeamiento con IA:", error);
      const isTimeout = error?.code === "ECONNABORTED" || String(error?.message || "").toLowerCase().includes("timeout");
      setErrorMessage(
        isTimeout
          ? "La generación con IA tardó demasiado. Probá con menos habilidades o una plantilla más corta."
          : (error?.response?.data?.message || "No se pudo generar el planeamiento con IA")
      );
    } finally {
      setGeneratingPlaneamientoIa(false);
    }
  }

  function updateResultadoIaField(field: keyof PlaneamientoIaResultado, value: string) {
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      [field]: value
    }));
  }

  function updateResultadoIaArray(field: keyof PlaneamientoIaResultado, value: string) {
    const lines = value.split("\\n").map((line) => line.trim()).filter(Boolean);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      [field]: lines
    }));
  }

  function updateResultadoIaReflexion(field: "queFunciono" | "queNoFunciono" | "quePuedoMejorar", value: string) {
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      reflexionesDocentes: {
        ...(prev?.reflexionesDocentes || {}),
        [field]: value
      }
    }));
  }

  function updateResultadoIaAdecuacion(field: string, value: string) {
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      estrategiaAdecuacionSignificativa: {
        ...(prev?.estrategiaAdecuacionSignificativa || {}),
        aplica: true,
        [field]: value
      }
    }));
  }

  async function guardarPlaneamientoIaGenerado() {
    if (!ultimoPlaneamientoIa) return;

    const gruposSeleccionados = getGruposPlaneamientoIa();
    const grupoSeleccionado = gruposSeleccionados[0];
    const materiaId = Number(selected?.MateriaId || grupoSeleccionado?.MateriaId || planeamientoIaForm.materiaId || 0);

    if (!grupoSeleccionado || !gruposSeleccionados.length || !materiaId) {
      setErrorMessage("Seleccioná grupo, materia y al menos una sección antes de guardar el planeamiento");
      return;
    }

    setSavingPlaneamientoIa(true);
    setMessage("");
    setErrorMessage("");

    try {
      const nombreMateriaSeleccionada = selected?.MateriaNombre || grupoSeleccionado?.MateriaNombre || "Materia";
      const gradoSeleccionado = getGradoPlaneamientoFromGrupo(selected) || getGradoPlaneamientoFromGrupo(grupoSeleccionado) || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
      const nombrePlaneamientoCorrecto = `${mesesSeleccionadosTextoIa || "Mes"} - ${gradoSeleccionado || "Grado"} - ${nombreMateriaSeleccionada}`;

      const crearPayload = (grupo: GrupoProfesor) => {
        const resultadoNormalizado = {
          ...(ultimoPlaneamientoIa || {}),
          nombre: nombrePlaneamientoCorrecto,
          mes: mesesSeleccionadosTextoIa || "",
          grado: gradoSeleccionado,
          materiaNombre: nombreMateriaSeleccionada,
          MateriaNombre: nombreMateriaSeleccionada
        };

        return {
        anioLectivoId: grupo.AnioLectivoId,
        periodoId: grupo.PeriodoId,
        grupoId: Number(grupo.GrupoId),
        materiaId,
        nombre: nombrePlaneamientoCorrecto,
        mes: mesesSeleccionadosTextoIa || "",
        grado: gradoSeleccionado,
        materiaNombre: nombreMateriaSeleccionada,
        fechaInicio: planeamientoIaForm.fechaInicio || null,
        fechaFin: planeamientoIaForm.fechaFin || null,
        observaciones: [
          ultimoPlaneamientoIa.advertencia || "Borrador generado con apoyo de IA",
          ultimoPlaneamientoIa.observaciones || "",
          planeamientoIaForm.indicaciones ? `Indicaciones dadas a la IA: ${planeamientoIaForm.indicaciones}` : ""
        ].filter(Boolean).join("\\n\\n"),
        resultado: resultadoNormalizado
        };
      };

      if (editingPlaneamientoIaId) {
        await api.put(`/planeamiento-ia/planeamientos/${editingPlaneamientoIaId}/resultado`, crearPayload(grupoSeleccionado));

        const gruposExtras = gruposSeleccionados.filter((grupo) => Number(grupo.GrupoId) !== Number(grupoSeleccionado.GrupoId));
        if (gruposExtras.length > 0) {
          for (const grupo of gruposExtras) {
            await api.post("/planeamiento-ia/guardar-planeamiento", crearPayload(grupo));
          }
          setMessage(`Planeamiento actualizado y copiado en ${gruposExtras.length} sección(es) adicional(es)`);
        } else {
          setMessage("Planeamiento actualizado correctamente");
        }
      } else {
        for (const grupo of gruposSeleccionados) {
          await api.post("/planeamiento-ia/guardar-planeamiento", crearPayload(grupo));
        }
        setMessage(`Planeamiento generado con IA y guardado en ${gruposSeleccionados.length} sección(es)`);
      }
      setUltimoPlaneamientoIa(null);
      setEditingPlaneamientoIaId(null);
      setDocumentoApoyoIa(null);
      setPlantillaFormatoIa(null);

      if (selected && gruposSeleccionados.some((grupo) => Number(grupo.GrupoId) === Number(selected.GrupoId)) && Number(selected.MateriaId) === materiaId) {
        await loadPlaneamientos(selected);
      } else {
        await loadDetalle(grupoSeleccionado);
        setActivePanel("planeamientos");
      }
    } catch (error: any) {
      console.error("Error guardando planeamiento generado:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el planeamiento generado");
    } finally {
      setSavingPlaneamientoIa(false);
    }
  }


  async function loadAsistencia(item = selected, fecha = asistenciaFecha) {
    if (!item) return;
    setLoadingAsistencia(true);
    setErrorMessage("");

    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/asistencia`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          fecha
        }
      });
      const data = response.data?.data || response.data || {};
      const estudiantes = detalle?.estudiantes || data.estudiantes || [];
      const lecciones = Array.isArray(data.lecciones) ? data.lecciones : [];
      setAsistenciaLecciones(lecciones);
      setAsistenciaDrafts(buildAsistenciaDrafts(estudiantes, Array.isArray(data.registros) ? data.registros : [], lecciones));
      setResumenAsistencia(Array.isArray(data.resumen) ? data.resumen : []);
    } catch (error: any) {
      console.error("Error cargando asistencia:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la asistencia");
    } finally {
      setLoadingAsistencia(false);
    }
  }

  async function handleSaveAsistencia() {
    if (!selected || !detalle) return;

    const leccionesUsar = asistenciaLecciones.length ? asistenciaLecciones : getAsistenciaLeccionesFallback();
    const registros = detalle.estudiantes.flatMap((estudiante) =>
      leccionesUsar.map((leccion) => {
        const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
        const draft = asistenciaDrafts[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
        return {
          estudianteId: estudiante.EstudianteId,
          horarioGrupoId: leccion.HorarioGrupoId || null,
          bloqueHorarioId: leccion.BloqueHorarioId || null,
          estado: draft.estado,
          minutosTardia: draft.minutosTardia === "" ? 0 : Number(draft.minutosTardia),
          observacion: draft.observacion || null,
          notificarEncargado: Boolean(draft.notificarEncargado)
        };
      })
    );

    const invalid = registros.find((item) => !Number.isFinite(item.minutosTardia) || item.minutosTardia < 0);
    if (invalid) {
      setErrorMessage("Los minutos de tardóa deben ser un número válido");
      return;
    }

    setSavingAsistencia(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/asistencia`, {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        fecha: asistenciaFecha,
        registros
      });
      const result = response.data?.data || {};
      setMessage(result.message || "Asistencia guardada correctamente");
      setResumenAsistencia(Array.isArray(result.resumen) ? result.resumen : []);
      await loadAsistencia(selected, asistenciaFecha);
    } catch (error: any) {
      console.error("Error guardando asistencia:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la asistencia");
    } finally {
      setSavingAsistencia(false);
    }
  }

  async function handleSaveNotas() {
    if (!selected || !detalle) return;

    if (!detalle.plantilla) {
      setErrorMessage("No hay una plantilla de evaluación para este grupo y materia");
      return;
    }

    const notas = detalle.estudiantes.flatMap((estudiante) =>
      detalle.actividades.map((actividad) => {
        const value = getDraftValue(estudiante.EstudianteId, actividad.EvaluacionActividadId);
        return {
          estudianteId: estudiante.EstudianteId,
          evaluacionActividadId: actividad.EvaluacionActividadId,
          nota: value === "" ? null : Number(value)
        };
      })
    );

    const invalid = notas.find((item) => item.nota !== null && (!Number.isFinite(item.nota) || item.nota < 0 || item.nota > 100));
    if (invalid) {
      setErrorMessage("Todas las notas deben estar entre 0 y 100");
      return;
    }

    setSavingNotas(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/notas`, {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        notas
      });

      const result = response.data?.data || {};
      setMessage(result.message || "Notas guardadas correctamente");
      await loadDetalle(selected);
    } catch (error: any) {
      console.error("Error guardando notas:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron guardar las notas");
    } finally {
      setSavingNotas(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    loadGrupos(q);
  }

  useEffect(() => {
    loadGrupos("");
    loadNivelesDesempeno();
    loadPlantillasPlaneamientoIa();
    loadEval360PlantillasIaIndicadores();
  }, []);

  async function loadMiHorario(item = selected) {
    const itemHorario = item || selected || gruposOrdenados[0];

    if (!itemHorario) {
      setHorarioBloques([]);
      setHorarioEntradas([]);
      return;
    }

    setLoadingHorario(true);
    setErrorMessage("");

    try {
      const params: Record<string, any> = {};
      if (itemHorario?.AnioLectivoId) params.anioLectivoId = itemHorario.AnioLectivoId;
      if (itemHorario?.PeriodoId) params.periodoId = itemHorario.PeriodoId;

      const response = await api.get("/gestion-profe/mi-horario", { params });
      const data = response.data?.data || response.data || {};
      setHorarioBloques(Array.isArray(data.bloques) ? data.bloques : []);
      setHorarioEntradas(Array.isArray(data.entradas) ? data.entradas : []);
    } catch (error: any) {
      console.error("Error cargando mi horario:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el horario del profesor");
    } finally {
      setLoadingHorario(false);
    }
  }

  const horarioDias = [
    { key: 2, label: "Lunes" },
    { key: 3, label: "Martes" },
    { key: 4, label: "Miércoles" },
    { key: 5, label: "Jueves" },
    { key: 6, label: "Viernes" }
  ];

  function esBloqueNoLectivo(nombre?: string | null) {
    return Boolean(getTipoBloqueNoLectivo(nombre));
  }

  function toggleIndicadorAsignadoActividad(indicadorGrupoId: number, checked: boolean, actividadIdParam?: number) {
    const actividadId = Number(actividadIdParam || seguimientoActividadSeleccionada?.ActividadId || 0);
    if (!actividadId) return;
    if (seguimientoIndicadorTieneCalificacion(indicadorGrupoId)) return;
    setSeguimientoActividadIndicadoresDraft((prev) => {
      const nextState = { ...prev };
      seguimientoActividadesPlaneamiento.forEach((actividad) => {
        const currentActividadId = Number(actividad.ActividadId);
        const actual = Array.isArray(nextState[currentActividadId])
          ? nextState[currentActividadId]
          : getSeguimientoIndicadoresAsignadosActividad(currentActividadId);
        const sinIndicador = actual.filter((item) => Number(item) !== Number(indicadorGrupoId));
        nextState[currentActividadId] = currentActividadId === actividadId && checked
          ? Array.from(new Set([...sinIndicador, indicadorGrupoId]))
          : sinIndicador;
      });
      return nextState;
    });
  }

  async function guardarAsignacionIndicadoresActividad() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || !seguimientoActividadSeleccionada) {
      setErrorMessage("Selecciona grupo, componente y actividad para asignar indicadores");
      return;
    }
    const actividadesAGuardar = seguimientoComponenteTieneActividadesPlaneamiento
      ? seguimientoActividadesPlaneamiento
      : [seguimientoActividadSeleccionada];
    if (!actividadesAGuardar.length) {
      setErrorMessage("No hay actividades vinculadas a planeamiento para guardar");
      return;
    }

    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");
    try {
      for (const actividad of actividadesAGuardar) {
        const actividadId = Number(actividad.ActividadId || 0);
        await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: seguimientoDetalleSeleccionado.EstructuraGrupoDetalleId,
          actividadId,
          indicadorIds: getSeguimientoIndicadoresAsignadosActividad(actividadId)
        });
      }
      setMessage("Indicadores asignados correctamente");
      await loadSeguimientoEvaluacion(selected);
      if (activePanel === "notas") await loadDetalle(selected);
      if (activePanel === "notas") await loadDetalle(selected);
    } catch (error: any) {
      console.error("Error asignando indicadores:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron asignar los indicadores");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  function getHorarioEntradas(bloqueId: number, diaSemana: number) {
    return horarioEntradas.filter((item) => Number(item.BloqueHorarioId) === Number(bloqueId) && Number(item.DiaSemana) === Number(diaSemana));
  }

  async function seleccionarMateriaDesdeHorario(entrada: HorarioEntrada) {
    const grupoMateria = grupos.find((grupo) =>
      Number(grupo.GrupoId) === Number(entrada.GrupoId) &&
      Number(grupo.MateriaId) === Number(entrada.MateriaId)
    );

    if (!grupoMateria) {
      setErrorMessage("No se encontró esa sección y materia dentro de Mis grupos.");
      return;
    }

    await loadDetalle(grupoMateria);
    setActivePanel("");

    setTimeout(() => {
      document.getElementById("detalle-grupo-profesor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function getHorarioTexto(bloqueId: number, diaSemana: number) {
    const entradas = getHorarioEntradas(bloqueId, diaSemana);
    if (!entradas.length) return "";
    return entradas
      .map((item) => `${item.GrupoNombre} ${item.MateriaNombre}`.trim())
      .filter(Boolean)
      .join(" / ");
  }

  function renderHorarioSemanal(prefix: string) {
    const border = "1px solid #cbd5e1";
    const bloquesOrdenados = [...horarioBloques].sort((a, b) => Number(a.OrdenVisual || 0) - Number(b.OrdenVisual || 0));

    return (
      <div style={{ overflowX: "auto", border, borderRadius: "12px", background: "#ffffff" }}>
        <table style={{ width: "100%", minWidth: "860px", tableLayout: "fixed", borderCollapse: "collapse", color: "#0f172a", fontSize: "15px" }}>
          <colgroup>
            <col style={{ width: "230px" }} />
            {horarioDias.map((dia) => (
              <col key={`${prefix}-col-${dia.key}`} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: "#e2e8f0" }}>
              <th style={{ padding: "9px 8px", border, textAlign: "center", fontWeight: 900, fontSize: "16px", color: "#0f172a" }}>
                Leccion
              </th>
              {horarioDias.map((dia) => (
                <th key={`${prefix}-head-${dia.key}`} style={{ padding: "9px 5px", border, textAlign: "center", fontWeight: 900, fontSize: "16px", color: "#0f172a" }}>
                  {dia.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloquesOrdenados.map((bloque) => {
              const tipoNoLectivo = getTipoBloqueNoLectivo(bloque.Nombre);
              const esAlmuerzo = tipoNoLectivo === "almuerzo";

              if (tipoNoLectivo) {
                return (
                  <tr key={`${prefix}-${bloque.BloqueHorarioId}`}>
                    <td
                      colSpan={horarioDias.length + 1}
                      style={{
                        padding: "9px 10px",
                        border,
                        textAlign: "center",
                        background: esAlmuerzo ? "#dcfce7" : "#fef3c7",
                        color: esAlmuerzo ? "#166534" : "#92400e",
                        fontWeight: 900,
                        fontSize: "16px"
                      }}
                    >
                      {getBloqueHorarioLabel(bloque)}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={`${prefix}-${bloque.BloqueHorarioId}`} style={{ background: "#ffffff" }}>
                  <td style={{ padding: "9px 10px", border, fontWeight: 900, fontSize: "15px", lineHeight: 1.25, color: "#1e293b", textAlign: "center", verticalAlign: "middle", overflowWrap: "anywhere" }}>
                    {getBloqueHorarioLabel(bloque)}
                  </td>
                  {horarioDias.map((dia) => {
                    const entradas = getHorarioEntradas(bloque.BloqueHorarioId, dia.key);
                    return (
                      <td key={`${prefix}-${bloque.BloqueHorarioId}-${dia.key}`} style={{ padding: "5px", border, textAlign: "center", verticalAlign: "middle", color: entradas.length ? "#0f172a" : "#94a3b8" }}>
                        {entradas.length ? (
                          <div style={{ display: "grid", gap: "5px" }}>
                            {entradas.map((entrada) => {
                              const texto = `${entrada.GrupoNombre} ${entrada.MateriaNombre}`.trim();
                              return (
                                <button
                                  key={`${prefix}-${entrada.HorarioGrupoId}-${entrada.BloqueHorarioId}-${entrada.DiaSemana}`}
                                  type="button"
                                  onClick={() => seleccionarMateriaDesdeHorario(entrada)}
                                  title="Seleccionar esta seccion y materia"
                                  style={{
                                    width: "100%",
                                    minHeight: "36px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    border: "1px solid #bfdbfe",
                                    background: "#eff6ff",
                                    color: "#1e3a8a",
                                    borderRadius: "8px",
                                    padding: "7px 6px",
                                    fontWeight: 900,
                                    fontSize: "14px",
                                    lineHeight: 1.18,
                                    cursor: "pointer"
                                  }}
                                >
                                  <span style={{ overflowWrap: "anywhere" }}>{texto}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontWeight: 800, fontSize: "14px" }}>Libre</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const selectedTitle = selected
    ? `${selected.GrupoNombre} - ${selected.MateriaNombre}`
    : "Seleccione un grupo y materia";

  return (
    <div className="stack">
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ marginBottom: "6px" }}>Gestión del Profe</h2>
            <p style={{ margin: 0, opacity: 0.75 }}>
              Desde aquí el docente puede trabajar con sus grupos, registrar notas, pasar lista, manejar planeamientos y consultar reportes.
            </p>
          </div>
        </div>

        {message && (
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf3", color: "#166534", border: "1px solid #bbf7d0" }}>
            {message}
          </div>
        )}

        {errorMessage && (
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
            {errorMessage}
          </div>
        )}
      </section>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontWeight: 900 }}>Mi horario</h3>
            <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700 }}>
              Tocá una materia del horario para seleccionar automáticamente la sección y materia en Mis grupos.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                const nuevoEstado = !horarioVisible;
                setHorarioVisible(nuevoEstado);
                if (nuevoEstado && !horarioBloques.length) {
                  loadMiHorario(selected || gruposOrdenados[0]);
                }
              }}
            >
              {horarioVisible ? "Ocultar horario" : "Ver horario"}
            </button>
            {horarioVisible && (
              <button type="button" style={secondaryButtonStyle} onClick={() => loadMiHorario(selected || gruposOrdenados[0])} disabled={loadingHorario}>
                {loadingHorario ? "Actualizando..." : "Actualizar horario"}
              </button>
            )}
          </div>
        </div>

        {!horarioVisible ? (
          <div style={{ padding: "14px", borderRadius: "14px", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#0f172a", fontWeight: 800 }}>
            El horario está minimizado. Presioná “Ver horario” para desplegarlo.
          </div>
        ) : loadingHorario ? (
          <p>Cargando horario...</p>
        ) : horarioBloques.length === 0 ? (
          <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800 }}>
            No hay bloques de horario configurados para mostrar.
          </div>
        ) : (
          <>
            {renderHorarioSemanal("horario-superior")}
            <div style={{ display: "none", overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "14px", background: "#ffffff" }}>
            <table style={{ width: "100%", minWidth: "820px", borderCollapse: "collapse", color: "#0f172a" }}>
              <thead>
                <tr style={{ background: "#e2e8f0" }}>
                  <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Nombre</th>
                  <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Hora inicio</th>
                  <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Hora fin</th>
                  {horarioDias.map((dia) => (
                    <th key={dia.key} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>{dia.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...horarioBloques].sort((a, b) => Number(a.OrdenVisual || 0) - Number(b.OrdenVisual || 0)).map((bloque) => {
                  const noLectivo = esBloqueNoLectivo(bloque.Nombre);
                  return (
                    <tr key={`horario-superior-${bloque.BloqueHorarioId}`} style={{ background: noLectivo ? "#f8fafc" : "#ffffff" }}>
                      <td style={{ padding: "9px", border: "1px solid #cbd5e1", fontWeight: 800 }}>{bloque.Nombre}</td>
                      <td style={{ padding: "9px", border: "1px solid #cbd5e1" }}>{bloque.HoraInicio}</td>
                      <td style={{ padding: "9px", border: "1px solid #cbd5e1" }}>{bloque.HoraFin}</td>
                      {horarioDias.map((dia) => {
                        const entradas = getHorarioEntradas(bloque.BloqueHorarioId, dia.key);
                        return (
                          <td key={`horario-superior-${bloque.BloqueHorarioId}-${dia.key}`} style={{ padding: "6px", border: "1px solid #cbd5e1", color: entradas.length ? "#0f172a" : "#64748b" }}>
                            {entradas.length ? (
                              <div style={{ display: "grid", gap: "6px" }}>
                                {entradas.map((entrada) => {
                                  const texto = `${entrada.GrupoNombre} ${entrada.MateriaNombre}`.trim();
                                  return (
                                    <button
                                      key={`${entrada.HorarioGrupoId}-${entrada.BloqueHorarioId}-${entrada.DiaSemana}`}
                                      type="button"
                                      onClick={() => seleccionarMateriaDesdeHorario(entrada)}
                                      title="Seleccionar esta sección y materia"
                                      style={{
                                        width: "100%",
                                        textAlign: "left",
                                        border: "1px solid #bfdbfe",
                                        background: "#eff6ff",
                                        color: "#1e3a8a",
                                        borderRadius: "10px",
                                        padding: "7px 8px",
                                        fontWeight: 900,
                                        cursor: "pointer"
                                      }}
                                    >
                                      {texto}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (noLectivo ? "" : "Libre")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Mis grupos</h3>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por grupo, materia, periodo o año"
            style={{ flex: 1, minWidth: "260px" }}
          />
          <button className="primary-btn" disabled={loadingGrupos}>
            {loadingGrupos ? "Buscando..." : "Buscar"}
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setQ("");
              loadGrupos("");
            }}
          >
            Limpiar
          </button>
        </form>

        {loadingGrupos ? (
          <p>Cargando grupos...</p>
        ) : grupos.length === 0 ? (
          <p>No hay grupos asignados para mostrar.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {gruposOrdenados.map((item) => {
              const isSelected = selected?.AsignacionDocenteId === item.AsignacionDocenteId;
              return (
                <button
                  key={item.AsignacionDocenteId}
                  type="button"
                  onClick={() => loadDetalle(item)}
                  style={{
                    ...cardStyle,
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: isSelected ? "#2563eb" : "#e5e7eb",
                    boxShadow: isSelected ? "0 8px 20px rgba(37, 99, 235, 0.12)" : "none"
                  }}
                >
                  <strong>{item.GrupoNombre}</strong>
                  <span>{item.MateriaCodigo ? `${item.MateriaCodigo} - ` : ""}{item.MateriaNombre}</span>
                  <span style={{ opacity: 0.75 }}>{item.AnioNombre} / {item.PeriodoNombre}</span>
                  <span style={{ opacity: 0.75 }}>Estudiantes: {item.TotalEstudiantes || 0}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section id="detalle-grupo-profesor" className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h3>{selectedTitle}</h3>
            {selected && (
              <p style={{ margin: 0, opacity: 0.75 }}>
                {selected.AnioNombre} / {selected.PeriodoNombre}
              </p>
            )}
          </div>

          {selected && (
            <button type="button" className="primary-btn" onClick={() => loadDetalle(selected)} disabled={loadingDetalle || savingNotas}>
              {loadingDetalle ? "Actualizando..." : "Actualizar"}
            </button>
          )}
        </div>

        {!selected ? (
          <p style={{ marginTop: "12px" }}>Seleccioná un grupo para ver estudiantes y estructura de evaluación.</p>
        ) : loadingDetalle ? (
          <p style={{ marginTop: "12px" }}>Cargando detalle...</p>
        ) : detalle ? (
          <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div style={cardStyle}>
                <strong>Estudiantes</strong>
                <span style={{ fontSize: "24px", fontWeight: 700 }}>{detalle.estudiantes.length}</span>
              </div>
              <div style={{ ...cardStyle, gap: "8px" }}>
                <strong>Plantilla</strong>
                {(() => {
                  const nombrePlantillaActiva = seguimientoContexto?.estructura?.PlantillaBaseNombre || eval360Estructura?.estructura?.PlantillaBaseNombre || detalle.plantilla?.Nombre || "";
                  return nombrePlantillaActiva ? (
                    <span style={{ color: "#0f172a", fontWeight: 700 }}>{nombrePlantillaActiva}</span>
                  ) : (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <span style={{ color: "#b45309", fontWeight: 800 }}>Sin plantilla activa</span>
                      <select
                        style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px 10px", fontWeight: 700 }}
                        value={eval360PlantillaId}
                        onChange={(event) => setEval360PlantillaId(event.target.value)}
                        disabled={savingEval360 || loadingSeguimiento}
                      >
                        <option value="">Seleccionar plantilla</option>
                        {(seguimientoContexto?.plantillas || eval360Plantillas).map((plantilla) => (
                          <option key={plantilla.EvaluacionPlantillaId} value={plantilla.EvaluacionPlantillaId}>{plantilla.Nombre}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={async () => { await crearEval360DesdePlantilla(); if (selected) { await loadSeguimientoEvaluacion(selected); await loadDetalle(selected); } }}
                        disabled={!eval360PlantillaId || savingEval360 || !selected}
                      >
                        {savingEval360 ? "Asignando..." : "Asignar plantilla"}
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div style={cardStyle}>
                <strong>Actividades</strong>
                <span style={{ fontSize: "24px", fontWeight: 700 }}>{detalle.actividades.length}</span>
              </div>
              <div style={cardStyle}>
                <strong>Notas registradas</strong>
                <span style={{ fontSize: "24px", fontWeight: 700 }}>{resumenGrupo.totalNotas}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" className={activePanel === "planeamientos" ? "primary-btn" : undefined} style={activePanel === "planeamientos" ? undefined : secondaryButtonStyle} onClick={() => { setActivePanel("planeamientos"); loadPlaneamientos(selected); loadEval360PlantillasIaIndicadores(); }}>Planeamiento e Indicadores</button>
              <button type="button" className={activePanel === "seguimiento" ? "primary-btn" : undefined} style={activePanel === "seguimiento" ? undefined : secondaryButtonStyle} onClick={() => { setActivePanel("seguimiento"); loadSeguimientoEvaluacion(selected); }}>Evaluaciones</button>
              <button type="button" className={activePanel === "examenes_tabla" ? "primary-btn" : undefined} style={activePanel === "examenes_tabla" ? undefined : secondaryButtonStyle} onClick={() => { setTablaMatrizMinimizada(true); setActivePanel("examenes_tabla"); if (selected) loadSeguimientoEvaluacion(selected); }}>Tabla de Espesificaciones y Examenes</button>
              <button type="button" className={activePanel === "notas" ? "primary-btn" : undefined} style={activePanel === "notas" ? undefined : secondaryButtonStyle} onClick={() => { setActivePanel("notas"); loadSeguimientoEvaluacion(selected); }}>Registro de Notas</button>
              <button type="button" className={activePanel === "reportes" ? "primary-btn" : undefined} style={activePanel === "reportes" ? undefined : secondaryButtonStyle} onClick={() => { setActivePanel("reportes"); loadAsistencia(selected); }}>Reportes</button>
            </div>


            {activePanel === "notas" && (
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontWeight: 900, fontSize: "20px" }}>Registro de Notas</h4>
                    <p style={{ margin: 0, color: "#334155", fontWeight: 700 }}>
                      Consolidado por componente y actividad según la plantilla de evaluación asignada al grupo.
                    </p>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadSeguimientoEvaluacion(selected)} disabled={loadingSeguimiento || !selected}>
                    {loadingSeguimiento ? "Actualizando..." : "Actualizar consolidado"}
                  </button>
                </div>

                {loadingSeguimiento ? (
                  <p style={{ color: "#0f172a", fontWeight: 800 }}>Cargando registro de notas...</p>
                ) : !seguimientoContexto?.estructura ? (
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 800 }}>
                    Esta sección todavía no tiene plantilla de evaluación asignada. Asignala primero desde el bloque de Plantilla o desde Seguimiento Diario.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <div style={{ ...cardStyle, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                        <strong>Plantilla</strong>
                        <span style={{ fontWeight: 800 }}>{seguimientoContexto.estructura.PlantillaBaseNombre || "Plantilla activa"}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                        <strong>Estudiantes</strong>
                        <span style={{ fontSize: "24px", fontWeight: 900 }}>{consolidadoAlumnos.length}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#f8fafc", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                        <strong>Componentes por alumno</strong>
                        <span style={{ fontSize: "24px", fontWeight: 900 }}>{seguimientoContexto.detalles.length}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#14532d" }}>
                        <strong>Promedio % ganado</strong>
                        <span style={{ fontSize: "24px", fontWeight: 900 }}>{formatPercent(totalConsolidadoGanado)}</span>
                      </div>
                    </div>

                    {(() => {
                      const componentesTabla = seguimientoContexto.detalles || [];
                      const totalColumnasDetalle = 2 + componentesTabla.length * 2 + 2;
                      const thBase = {
                        padding: "6px 8px",
                        border: "1px solid #cbd5e1",
                        textAlign: "center" as const,
                        fontWeight: 900,
                        fontSize: "12px",
                        lineHeight: 1.15,
                        color: "#0f172a",
                        background: "#e2e8f0"
                      };
                      const tdBase = {
                        padding: "6px 8px",
                        border: "1px solid #e2e8f0",
                        textAlign: "center" as const,
                        fontWeight: 800,
                        fontSize: "12px",
                        lineHeight: 1.15,
                        color: "#0f172a",
                        background: "#ffffff"
                      };
                      const getComponentePalette = (detalleItem: SeguimientoEvaluacionDetalle) => {
                        const tipoKey = normalizarSeguimientoKey(getTipoSeguimientoFromDetalle(detalleItem));
                        if (tipoKey.includes("ASIST")) {
                          return { header: "#e0f2fe", subheader: "#f0f9ff", cell: "#f0f9ff" };
                        }
                        if (tipoKey.includes("COTIDIAN")) {
                          return { header: "#fef3c7", subheader: "#fffbeb", cell: "#fffbeb" };
                        }
                        if (tipoKey.includes("TAREA")) {
                          return { header: "#dcfce7", subheader: "#f0fdf4", cell: "#f0fdf4" };
                        }
                        return { header: "#fed7aa", subheader: "#ffedd5", cell: "#fff7ed" };
                      };
                      const promedioHeaderBg = "#dbeafe";
                      const promedioCellBg = "#eff6ff";
                      const accionHeaderBg = "#ede9fe";
                      const accionCellBg = "#f5f3ff";
                      const buscarComponenteAlumno = (alumnoItem: typeof consolidadoAlumnos[number], detalleItem: SeguimientoEvaluacionDetalle) => {
                        const detalleId = Number(detalleItem.EstructuraGrupoDetalleId);
                        const nombreDetalle = String(detalleItem.Nombre || detalleItem.ComponenteCatalogoNombre || "").trim().toLowerCase();
                        return alumnoItem.componentes.find((componente) => {
                          const keyDetalle = Number(String(componente.key || "").split("-").pop());
                          const nombreComponente = String(componente.nombre || "").trim().toLowerCase();
                          return keyDetalle === detalleId || (!!nombreDetalle && nombreComponente === nombreDetalle);
                        });
                      };

                      return (
                        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "14px", background: "#ffffff" }}>
                          <table style={{ width: "100%", minWidth: `${680 + componentesTabla.length * 120}px`, borderCollapse: "collapse", color: "#0f172a", fontSize: "12px" }}>
                            <thead>
                              <tr>
                                <th rowSpan={2} style={{ ...thBase, textAlign: "left", minWidth: "150px" }}>Alumno</th>
                                {componentesTabla.map((componente) => {
                                  const palette = getComponentePalette(componente);
                                  return (
                                    <th key={`header-componente-${componente.EstructuraGrupoDetalleId}`} colSpan={2} style={{ ...thBase, background: palette.header }}>
                                      {componente.Nombre || componente.ComponenteCatalogoNombre || "Componente"}
                                    </th>
                                  );
                                })}
                                <th colSpan={2} style={{ ...thBase, background: promedioHeaderBg }}>Promedio final</th>
                                <th rowSpan={2} style={{ ...thBase, minWidth: "90px", background: accionHeaderBg }}>Acción</th>
                              </tr>
                              <tr>
                                {componentesTabla.map((componente) => {
                                  const palette = getComponentePalette(componente);
                                  return (
                                    <React.Fragment key={`subheader-componente-${componente.EstructuraGrupoDetalleId}`}>
                                      <th style={{ ...thBase, background: palette.subheader }}>% valor</th>
                                      <th style={{ ...thBase, background: palette.subheader }}>% obtenido</th>
                                    </React.Fragment>
                                  );
                                })}
                                <th style={{ ...thBase, background: promedioCellBg }}>Evaluado</th>
                                <th style={{ ...thBase, background: promedioCellBg }}>Obtenido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {consolidadoAlumnos.map((alumno, alumnoIndex) => {
                                const abierto = notasDetalleAbierto === alumno.key;
                                const zebraRowBg = alumnoIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                return (
                                  <React.Fragment key={`consolidado-alumno-${alumno.key}`}>
                                    <tr style={{ background: abierto ? "#eff6ff" : zebraRowBg }}>
                                      <td style={{ ...tdBase, textAlign: "left", fontWeight: 900, background: abierto ? "#eff6ff" : zebraRowBg }}>{alumno.nombre}</td>
                                      {componentesTabla.map((detalleItem) => {
                                        const componente = buscarComponenteAlumno(alumno, detalleItem);
                                        const palette = getComponentePalette(detalleItem);
                                        return (
                                          <React.Fragment key={`valor-${alumno.key}-${detalleItem.EstructuraGrupoDetalleId}`}>
                                            <td style={{ ...tdBase, background: palette.cell }}>{formatPercent(Number(componente?.porcentajeComponente || detalleItem.Porcentaje || 0))}</td>
                                            <td style={{ ...tdBase, color: "#166534", fontWeight: 900, background: palette.cell }}>{formatPercent(Number(componente?.porcentajeGanado || 0))}</td>
                                          </React.Fragment>
                                        );
                                      })}
                                      <td style={{ ...tdBase, background: promedioCellBg }}>{formatPercent(Number((alumno as any).totalEvaluado || 0))}</td>
                                      <td style={{ ...tdBase, color: "#166534", fontWeight: 900, background: promedioCellBg }}>{formatPercent(alumno.totalGanado)}</td>
                                      <td style={{ ...tdBase, background: accionCellBg }}>
                                        <button type="button" style={{ ...secondaryButtonStyle, padding: "5px 8px", fontSize: "12px" }} onClick={() => setNotasDetalleAbierto(abierto ? "" : alumno.key)}>
                                          {abierto ? "Ocultar" : "Ver detalle"}
                                        </button>
                                      </td>
                                    </tr>
                                    {abierto && (
                                      <tr>
                                        <td colSpan={totalColumnasDetalle} style={{ padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                                          <div style={{ display: "grid", gap: "12px" }}>
                                            <strong style={{ color: "#0f172a", fontSize: "16px" }}>Detalle de calificaciones de {alumno.nombre}</strong>
                                            {alumno.componentes.map((componente) => (
                                              <div key={componente.key} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", background: "#ffffff", overflow: "hidden" }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "8px", padding: "10px", background: "#e2e8f0", color: "#0f172a", fontWeight: 900, fontSize: "12px" }}>
                                                  <span>{componente.nombre}</span>
                                                  <span>% comp.: {formatPercent(componente.porcentajeComponente)}</span>
                                                  <span>Porcentaje Evaluado: {formatPercent(Number((componente as any).porcentajeEvaluado ?? 0))}</span>
                                                  <span style={{ color: "#166534" }}>Ganado: {formatPercent(componente.porcentajeGanado)}</span>
                                                </div>
                                                <div style={{ padding: "10px", color: "#334155", fontWeight: 800, fontSize: "12px" }}>{componente.resumen}</div>
                                                {componente.detalles.length === 0 ? (
                                                  <div style={{ margin: "0 10px 10px", padding: "10px", borderRadius: "10px", background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74", fontWeight: 800, fontSize: "12px" }}>
                                                    No hay detalle registrado para este componente.
                                                  </div>
                                                ) : (
                                                  <div style={{ overflowX: "auto", margin: "0 10px 10px", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
                                                    <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", color: "#0f172a", fontSize: "12px" }}>
                                                      <thead>
                                                        <tr style={{ background: "#f1f5f9" }}>
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>Detalle</th>
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>Información</th>
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>Estado</th>
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>Nota</th>
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>% ganado</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {componente.detalles.map((detalleItem) => {
                                                          const estadoKey = normalizarSeguimientoKey(detalleItem.estado || "");
                                                          const subtitulo = String(detalleItem.subtitulo || "");
                                                          const usarProgreso = subtitulo.toLowerCase().includes("indicadores");
                                                          const matchProgreso = usarProgreso ? subtitulo.match(/(\d+)\s*\/\s*(\d+)/) : null;
                                                          const evaluados = matchProgreso ? Number(matchProgreso[1]) : null;
                                                          const total = matchProgreso ? Number(matchProgreso[2]) : null;
                                                          const tieneProgreso = evaluados !== null && total !== null && Number.isFinite(evaluados) && Number.isFinite(total) && total > 0;
                                                          const completoPorProgreso = !!(tieneProgreso && evaluados === total);
                                                          const pendientePorProgreso = !!(tieneProgreso && evaluados === 0);
                                                          const parcialPorProgreso = !!(tieneProgreso && evaluados > 0 && evaluados < total);
                                                          const completoPorEstado = estadoKey.includes("CALIFICAD") || estadoKey.includes("CALCULAD");
                                                          const pendientePorEstado = estadoKey.includes("PENDIENT") || estadoKey.includes("NO CALIFICAD");
                                                          const colorFondo = completoPorProgreso || (!tieneProgreso && completoPorEstado)
                                                            ? "#dcfce7"
                                                            : parcialPorProgreso
                                                              ? "#fef9c3"
                                                              : pendientePorProgreso || (!tieneProgreso && pendientePorEstado)
                                                                ? "#fee2e2"
                                                                : "#ffffff";

                                                          return (
                                                          <tr key={detalleItem.key} style={{ background: colorFondo }}>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", fontWeight: 800 }}>{detalleItem.titulo}</td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", color: "#334155" }}>{detalleItem.subtitulo}</td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}>{detalleItem.estado || "-"}</td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", fontWeight: 800 }}>{formatPercent(detalleItem.nota)}</td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", fontWeight: 900, color: "#166534" }}>{formatPercent(detalleItem.porcentaje)}</td>
                                                          </tr>
                                                        );
                                                        })}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}

                    <div style={{ padding: "12px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#334155", fontWeight: 700 }}>
                      Este consolidado toma lo registrado en Seguimiento Diario: indicadores de cotidiano/tareas, asistencia por lección y notas de actividades como exámenes u otros rubros.
                    </div>
                  </div>
                )}
              </div>
            )}


            {activePanel === "horario" && (
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontWeight: 900, fontSize: "20px" }}>Mi horario</h4>
                    <p style={{ margin: 0, color: "#334155", fontWeight: 700 }}>
                      Horario semanal generado según los grupos y materias asignadas al profesor.
                    </p>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadMiHorario(selected || gruposOrdenados[0])} disabled={loadingHorario}>
                    {loadingHorario ? "Actualizando..." : "Actualizar horario"}
                  </button>
                </div>

                {loadingHorario ? (
                  <p style={{ color: "#0f172a", fontWeight: 700 }}>Cargando horario...</p>
                ) : horarioBloques.length === 0 ? (
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800 }}>
                    No hay bloques de horario configurados para la institución.
                  </div>
                ) : (
                  <>
                    {renderHorarioSemanal("horario-panel")}
                    <div style={{ display: "none", overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "14px", background: "#ffffff" }}>
                    <table style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse", color: "#0f172a" }}>
                      <thead>
                        <tr style={{ background: "#e2e8f0" }}>
                          <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>ID</th>
                          <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Nombre</th>
                          <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Hora inicio</th>
                          <th style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>Hora fin</th>
                          {horarioDias.map((dia) => (
                            <th key={dia.key} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "left", fontWeight: 900 }}>{dia.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...horarioBloques].sort((a, b) => Number(a.OrdenVisual || 0) - Number(b.OrdenVisual || 0)).map((bloque) => {
                          const noLectivo = esBloqueNoLectivo(bloque.Nombre);
                          return (
                            <tr key={bloque.BloqueHorarioId} style={{ background: noLectivo ? "#f8fafc" : "#ffffff" }}>
                              <td style={{ padding: "9px", border: "1px solid #cbd5e1", fontWeight: 800 }}>{bloque.BloqueHorarioId}</td>
                              <td style={{ padding: "9px", border: "1px solid #cbd5e1", fontWeight: 800 }}>{bloque.Nombre}</td>
                              <td style={{ padding: "9px", border: "1px solid #cbd5e1" }}>{bloque.HoraInicio}</td>
                              <td style={{ padding: "9px", border: "1px solid #cbd5e1" }}>{bloque.HoraFin}</td>
                              {horarioDias.map((dia) => {
                                const texto = getHorarioTexto(bloque.BloqueHorarioId, dia.key);
                                return (
                                  <td key={`${bloque.BloqueHorarioId}-${dia.key}`} style={{ padding: "9px", border: "1px solid #cbd5e1", fontWeight: texto ? 800 : 600, color: texto ? "#0f172a" : "#64748b" }}>
                                    {texto || (noLectivo ? "" : "Libre")}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            )}

            {activePanel === "seguimiento" && (
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontWeight: 900, fontSize: "20px" }}>Seguimiento Diario</h4>
                    <p style={{ margin: 0, color: "#1e293b", fontWeight: 700, lineHeight: 1.45 }}>
                      Evaluá cotidiano, tareas, exámenes, asistencia y otros rubros según los componentes definidos en la plantilla.
                    </p>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadSeguimientoEvaluacion(selected)} disabled={loadingSeguimiento || !selected}>
                    {loadingSeguimiento ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>

                {(!seguimientoContexto?.estructura || !seguimientoContexto?.estructura?.PlantillaBaseId) ? (
                  <div style={{ display: "grid", gap: "12px", padding: "14px", background: "white", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
                    <strong>Primera vez en este grupo</strong>
                    <span style={{ color: "#475569" }}>Seleccioná la plantilla de parametrización de evaluación que se va a usar para esta sección. Esta asignación queda guardada para el grupo, materia, año y periodo seleccionados.</span>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ color: "#0f172a", fontWeight: 700 }}>Plantilla</span>
                      <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={eval360PlantillaId} onChange={(event) => setEval360PlantillaId(event.target.value)} disabled={savingEval360 || loadingSeguimiento}>
                        <option value="">Seleccionar plantilla</option>
                        {(seguimientoContexto?.plantillas || eval360Plantillas).map((plantilla) => (
                          <option key={plantilla.EvaluacionPlantillaId} value={plantilla.EvaluacionPlantillaId}>{plantilla.Nombre}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="primary-btn" onClick={async () => { await crearEval360DesdePlantilla(); await loadSeguimientoEvaluacion(selected); await loadDetalle(selected); }} disabled={!eval360PlantillaId || savingEval360 || !selected}>
                      {savingEval360 ? "Asignando..." : "Asignar plantilla"}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
                      <div style={{ ...cardStyle, background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                        <strong>Total indicadores</strong>
                        <span style={{ fontSize: "26px", fontWeight: 800 }}>{seguimientoResumenSeccion.total}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                        <strong>Calificados</strong>
                        <span style={{ fontSize: "26px", fontWeight: 800 }}>{seguimientoResumenSeccion.calificados}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                        <strong>No calificados</strong>
                        <span style={{ fontSize: "26px", fontWeight: 800 }}>{seguimientoResumenSeccion.noCalificados}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                        <strong>Estudiantes</strong>
                        <span style={{ fontSize: "26px", fontWeight: 800 }}>{seguimientoResumenSeccion.totalEstudiantes}</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>Ítem a evaluar</span>
                        <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoTipo} onChange={(event) => { setSeguimientoTipo(event.target.value); setSeguimientoIndicadorId(""); }}>
                          <option value="">Seleccionar</option>
                          {seguimientoComponentes.map((item) => (
                            <option key={item.tipo} value={item.tipo}>{item.tipo} - {Number(item.detalle.Porcentaje || 0).toFixed(2)}%</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>Nombre del planeamiento</span>
                        <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoPlaneamientoId} onChange={(event) => { setSeguimientoPlaneamientoId(event.target.value); setSeguimientoIndicadorId(""); }} disabled={!isTipoIndicadorSeguimiento(seguimientoTipo) || seguimientoModoActividadDirecta}>
                          <option value="">Todos</option>
                          {(seguimientoContexto.planeamientos || []).map((planeamiento) => (
                            <option key={planeamiento.PlaneamientoId} value={planeamiento.PlaneamientoId}>{planeamiento.Nombre}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#0f172a", fontWeight: 700 }}>Estado del indicador</span>
                        <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoEstadoFiltro} onChange={(event) => { setSeguimientoEstadoFiltro(event.target.value); setSeguimientoIndicadorId(""); }} disabled={!isTipoIndicadorSeguimiento(seguimientoTipo) || seguimientoModoActividadDirecta}>
                          <option value="NO_CALIFICADO">No calificado</option>
                          <option value="CALIFICADO">Calificado</option>
                          <option value="INICIAL">Inicial</option>
                          <option value="INTERMEDIO">Intermedio</option>
                          <option value="AVANZADO">Avanzado</option>
                          <option value={normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE"}>
                            {normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "No entregado" : "Ausente"}
                          </option>
                        </select>
                      </label>
                    </div>

                    {isTipoAsistenciaSeguimiento(seguimientoTipo) ? (
                      <div style={{ display: "grid", gap: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span style={{ color: "#0f172a", fontWeight: 900 }}>Día de asistencia</span>
                            <input
                              type="date"
                              value={asistenciaFecha}
                              onChange={(event) => {
                                setAsistenciaFecha(event.target.value);
                                if (selected) loadAsistencia(selected, event.target.value);
                              }}
                              style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px", fontWeight: 800 }}
                            />
                          </label>
                          <button type="button" className="primary-btn" onClick={handleSaveAsistencia} disabled={savingAsistencia || loadingAsistencia || !detalle?.estudiantes?.length}>
                            {savingAsistencia ? "Guardando..." : "Guardar asistencia"}
                          </button>
                        </div>

                        <div style={{ padding: "12px", borderRadius: "12px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#0f172a" }}>
                          <strong>Asistencia por lección</strong>
                          <div style={{ marginTop: "6px", color: "#334155", fontWeight: 700 }}>
                            Según la fecha seleccionada se cargan las lecciones reales de esta sección y materia. Cada estudiante inicia como Presente y se puede cambiar por lección.
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "6px", marginTop: "10px" }}>
                            <span>0% a menos de 10%: 5%</span>
                            <span>10% a menos de 20%: 4%</span>
                            <span>20% a menos de 30%: 3%</span>
                            <span>30% a menos de 40%: 2%</span>
                            <span>40% a menos de 50%: 1%</span>
                            <span>50% o más: 0%</span>
                          </div>
                        </div>

                        {loadingAsistencia ? (
                          <p style={{ color: "#0f172a", fontWeight: 800 }}>Cargando asistencia...</p>
                        ) : asistenciaLecciones.length === 0 ? (
                          <div style={{ padding: "14px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "14px", color: "#9a3412", fontWeight: 800 }}>
                            No hay lecciones configuradas para esta sección y materia en la fecha seleccionada. Revisá el horario del grupo.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {asistenciaLecciones.map((leccion) => (
                                <span key={`chip-leccion-${leccion.HorarioGrupoId}`} style={{ padding: "8px 10px", borderRadius: "999px", background: "#e0f2fe", color: "#075985", fontWeight: 900, border: "1px solid #7dd3fc" }}>
                                  {leccion.Nombre} {leccion.HoraInicio && leccion.HoraFin ? `${leccion.HoraInicio} - ${leccion.HoraFin}` : ""}
                                </span>
                              ))}
                            </div>

                            <div style={{ overflowX: "auto", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "14px" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
                                <thead>
                                  <tr style={{ background: "#cbd5e1", color: "#0f172a" }}>
                                    <th style={{ minWidth: "230px", padding: "10px", textAlign: "left" }}>Alumno</th>
                                    <th style={{ minWidth: "170px", padding: "10px", textAlign: "left" }}>Lección</th>
                                    {(["PRESENTE", "AUSENTE_JUSTIFICADA", "AUSENTE_INJUSTIFICADA", "TARDIA_MENOR_10", "TARDIA_MAYOR_10"] as EstadoAsistencia[]).map((estado) => (
                                      <th key={estado} style={{ padding: "10px", textAlign: "center" }}>{estadoAsistenciaLabel(estado)}</th>
                                    ))}
                                    <th style={{ minWidth: "120px", padding: "10px" }} title="Minutos de tardía (solo cuando corresponde)">Minutos tardóa</th>
                                    <th style={{ minWidth: "220px", padding: "10px" }}>Observación</th>
                                    <th style={{ minWidth: "120px", padding: "10px" }} title="Marcar para notificar al encargado del estudiante">Informar al encargado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(detalle?.estudiantes || seguimientoContexto.estudiantes || []).flatMap((estudiante, estudianteIndex) =>
                                    asistenciaLecciones.map((leccion, leccionIndex) => {
                                      const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
                                      const draft = asistenciaDrafts[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
                                      const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                      return (
                                        <tr key={`seg-asis-${estudiante.EstudianteId}-${leccion.HorarioGrupoId}`} style={{ background: zebraBg }}>
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
                                            {leccionIndex === 0 ? (
                                              <>
                                                {getFullName(estudiante)}
                                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>{estudiante.Identificacion}</div>
                                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                                  Correo: {getCorreoHabilitadoEstudiante(estudiante) || "No definido"}
                                                </div>
                                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                                  WA: {getTelefonoWhatsAppHabilitado(estudiante) || "No habilitado"}
                                                </div>
                                              </>
                                            ) : null}
                                          </td>
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 900, color: "#1e3a8a" }}>
                                            {leccion.Nombre}
                                            <div style={{ color: "#475569", fontWeight: 600, fontSize: "12px" }}>{leccion.HoraInicio} - {leccion.HoraFin}</div>
                                          </td>
                                            {(["PRESENTE", "AUSENTE_JUSTIFICADA", "AUSENTE_INJUSTIFICADA", "TARDIA_MENOR_10", "TARDIA_MAYOR_10"] as EstadoAsistencia[]).map((estado) => (
                                              <td key={estado} style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                                <input
                                                  type="radio"
                                                  title={estadoAsistenciaLabel(estado)}
                                                  aria-label={estadoAsistenciaLabel(estado)}
                                                  name={`asis-${estudiante.EstudianteId}-${leccion.HorarioGrupoId}`}
                                                  checked={draft.estado === estado}
                                                  onChange={() => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "estado", estado)}
                                                  style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                                />
                                              </td>
                                            ))}
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <input type="number" min="0" title="Minutos de tardía" aria-label="Minutos de tardía" value={draft.minutosTardia} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "minutosTardia", e.target.value)} style={{ width: "110px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px" }} />
                                          </td>
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <input value={draft.observacion} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "observacion", e.target.value)} placeholder="Observación" style={{ minWidth: "220px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px" }} />
                                          </td>
                                          <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <input type="checkbox" title="Informar al encargado" aria-label="Informar al encargado" checked={Boolean(draft.notificarEncargado)} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "notificarEncargado", e.target.checked)} style={{ accentColor: "#2563eb", width: "18px", height: "18px" }} />
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : seguimientoModoActividadDirecta ? (
                      <div style={{ display: "grid", gap: "12px" }}>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#0f172a", fontWeight: 700 }}>Actividad evaluativa</span>
                          <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoActividadSeleccionada?.ActividadId ? String(seguimientoActividadSeleccionada.ActividadId) : ""} onChange={(event) => setSeguimientoActividadId(event.target.value)}>
                            {seguimientoActividadesFiltradas.length === 0 ? <option value="">No hay actividades configuradas para este componente</option> : null}
                            {seguimientoActividadesFiltradas.map((actividad) => {
                              const puntos = Math.round(Number(actividad.PuntosMaximos || 0));
                              const pe = Math.round(Number(actividad.PorcentajeDentroRubro || 0));
                              const labelExamen = `${actividad.Nombre} - ${puntos}pts - ${pe}%`;
                              return (
                                <option key={actividad.ActividadId} value={actividad.ActividadId}>
                                  {isTipoExamenSeguimiento(seguimientoTipo) ? labelExamen : `${actividad.Nombre} - ${Number(actividad.PuntosMaximos || 0).toFixed(2)} pts`}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        {seguimientoActividadSeleccionada ? (
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", padding: "12px", background: "white", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
                              <div>
                                <strong>{seguimientoActividadSeleccionada.Nombre}</strong>
                                <div style={{ color: "#475569" }}>Actividad tomada desde parametrizaciones</div>
                              </div>
                              <label style={{ display: "grid", gap: "6px" }}>
                                <span style={{ color: "#0f172a", fontWeight: 800 }}>Puntos que vale</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)}
                                  onChange={(event) => updateSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada.ActividadId, event.target.value)}
                                  placeholder="Ej: 35"
                                  style={{ color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "8px", background: "#ffffff" }}
                                />
                              </label>
                            </div>
                            <div style={{ overflowX: "auto", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "14px" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
                                <thead>
                                  <tr style={{ background: "#cbd5e1", color: "#0f172a" }}>
                                    <th style={{ minWidth: "230px", padding: "10px", textAlign: "left" }}>Alumno</th>
                                    <th style={{ padding: "10px" }}>Puntos obtenidos</th>
                                    <th style={{ padding: "10px" }}>Puntos máximos</th>
                                    <th style={{ padding: "10px" }}>Nota</th>
                                    <th style={{ padding: "10px" }}>% ganado</th>
                                    <th style={{ minWidth: "220px", padding: "10px" }}>Observación</th>
                                    <th style={{ minWidth: "260px", padding: "10px" }}>Informar al encargado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(seguimientoContexto.estudiantes || []).map((estudiante, estudianteIndex) => {
                                    const draft = getSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
                                    const aviso = getSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
                                    const puntosMaximosActividad = Number(String(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)).replace(",", "."));
                                    const nota = calcularNotaExamen(draft.puntosObtenidos, puntosMaximosActividad);
                                    const porcentajeGanado = calcularPorcentajeGanadoExamen(nota, seguimientoActividadSeleccionada, seguimientoDetalleSeleccionado);
                                    const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                    return (
                                      <tr key={`exam-${estudiante.EstudianteId}`} style={{ background: zebraBg }}>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
                                          {getFullName(estudiante)}
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>{estudiante.Identificacion}</div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            Correo: {getCorreoHabilitadoEstudiante(estudiante) || "No definido"}
                                          </div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            WA: {getTelefonoWhatsAppHabilitado(estudiante) || "No habilitado"}
                                          </div>
                                        </td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={draft.puntosObtenidos}
                                            onChange={(e) => {
                                              const limpio = String(e.target.value || "").replace(/\D+/g, "");
                                              const maximo = Number.isFinite(puntosMaximosActividad) ? Math.max(0, Math.trunc(puntosMaximosActividad)) : 0;
                                              if (limpio === "") {
                                                updateSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { puntosObtenidos: "" });
                                                return;
                                              }
                                              const valor = Number(limpio);
                                              const acotado = Number.isFinite(valor) ? Math.min(valor, maximo) : 0;
                                              updateSeguimientoExamenDraft(
                                                seguimientoActividadSeleccionada.ActividadId,
                                                estudiante.EstudianteId,
                                                { puntosObtenidos: String(acotado) }
                                              );
                                            }}
                                            style={{ width: "130px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px" }}
                                          />
                                        </td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }}>{Number(puntosMaximosActividad || 0).toFixed(2)}</td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{nota.toFixed(2)}</td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{porcentajeGanado.toFixed(2)}%</td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}><input value={draft.observacion} onChange={(e) => updateSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { observacion: e.target.value })} placeholder="Observación" style={{ minWidth: "220px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px" }} /></td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                          <label title="Informar al encargado" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "1px solid #94a3b8", borderRadius: "8px", background: aviso.informar ? "#dbeafe" : "#ffffff" }}>
                                            <input type="checkbox" checked={aviso.informar} onChange={(event) => updateSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { informar: event.target.checked })} style={{ accentColor: "#2563eb", width: "18px", height: "18px" }} />
                                          </label>
                                          {aviso.informar ? (
                                            <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                              <textarea value={aviso.observacion} onChange={(event) => updateSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { observacion: event.target.value })} placeholder="Mensaje para el encargado" rows={2} style={{ width: "100%", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: "#ffffff" }} />
                                            </div>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <button type="button" className="primary-btn" onClick={guardarSeguimientoActividad} disabled={savingSeguimiento || !seguimientoActividadSeleccionada || Number(String(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)).replace(",", ".")) <= 0}>{savingSeguimiento ? "Guardando..." : "Guardar evaluación"}</button>
                          </div>
                        ) : (
                          <div style={{ padding: "14px", background: "white", border: "1px dashed #cbd5e1", borderRadius: "14px", color: "#475569" }}>No hay actividades configuradas para este componente.</div>
                        )}
                      </div>
                    ) : !isTipoIndicadorSeguimiento(seguimientoTipo) ? (
                      <div style={{ padding: "14px", background: "white", border: "1px dashed #cbd5e1", borderRadius: "14px", color: "#475569" }}>
                        Este rubro queda disponible según la plantilla. Si ocupa una lógica especial, se puede conectar a una actividad o repositorio específico.
                      </div>
                    ) : (
                      <>
                        {seguimientoComponenteTieneActividadesPlaneamiento ? (
                          <label style={{ display: "grid", gap: "6px" }}>
                            <span style={{ color: "#0f172a", fontWeight: 700 }}>Actividad evaluativa</span>
                            <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoActividadSeleccionada?.ActividadId ? String(seguimientoActividadSeleccionada.ActividadId) : ""} onChange={(event) => setSeguimientoActividadId(event.target.value)}>
                              {seguimientoActividadesFiltradas.length === 0 ? <option value="">No hay actividades configuradas para este componente</option> : null}
                              {seguimientoActividadesFiltradas.map((actividad) => (
                                <option key={actividad.ActividadId} value={actividad.ActividadId}>
                                  {actividad.Nombre} - {Number(actividad.PorcentajeDentroRubro || 0).toFixed(2)}%
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        {seguimientoComponenteTieneActividadesPlaneamiento ? (
                        <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#ffffff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                            <strong style={{ color: "#0f172a" }}>Asignar indicadores a actividades</strong>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button type="button" style={secondaryButtonStyle} onClick={() => setSeguimientoMatrizAsignacionMinimizada(true)}>
                                Minimizar
                              </button>
                              <button type="button" style={secondaryButtonStyle} onClick={() => setSeguimientoMatrizAsignacionMinimizada(false)}>
                                Maximizar
                              </button>
                            </div>
                          </div>
                          <small style={{ color: "#475569" }}>
                            Solo se pueden calificar indicadores que están asignados a la actividad seleccionada.
                          </small>
                          {seguimientoMatrizAsignacionMinimizada ? (
                            <div style={{ padding: "10px", border: "1px dashed #cbd5e1", borderRadius: "10px", color: "#475569", background: "#f8fafc" }}>
                              Matriz minimizada. Hay {seguimientoIndicadoresAsignablesPorActividad.length} indicadores y {seguimientoActividadesPlaneamiento.length} actividades disponibles.
                            </div>
                          ) : (
                          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ background: "#e2e8f0" }}>
                                  <th style={{ padding: "8px", textAlign: "left", minWidth: "280px" }}>Indicador</th>
                                  {seguimientoActividadesPlaneamiento.map((actividad) => (
                                    <th key={`head-act-${actividad.ActividadId}`} style={{ padding: "8px", textAlign: "center", minWidth: "110px" }}>{actividad.Nombre}</th>
                                  ))}
                                  <th style={{ padding: "8px", textAlign: "left", minWidth: "120px" }}>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {seguimientoIndicadoresAsignablesPorActividad.map((indicador) => {
                                  const indicadorId = Number(indicador.IndicadorGrupoId);
                                  const estado = getSeguimientoEstadoAsignacionIndicador(indicadorId);
                                  const bloqueado = seguimientoIndicadorTieneCalificacion(indicadorId);
                                  return (
                                    <tr key={`mat-ind-${indicadorId}`}>
                                      <td style={{ padding: "8px", borderTop: "1px solid #e2e8f0" }}>
                                        <div style={{ fontWeight: 700 }}>{indicador.IndicadorBase}</div>
                                        <small style={{ color: "#64748b" }}>{indicador.PlaneamientoNombre || "Planeamiento"}</small>
                                      </td>
                                      {seguimientoActividadesPlaneamiento.map((actividad) => {
                                        const actividadId = Number(actividad.ActividadId);
                                        const checked = getSeguimientoIndicadoresAsignadosActividad(actividadId).includes(indicadorId);
                                        return (
                                          <td key={`mat-${indicadorId}-${actividadId}`} style={{ textAlign: "center", padding: "8px", borderTop: "1px solid #e2e8f0" }}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              disabled={bloqueado}
                                              onChange={(event) => toggleIndicadorAsignadoActividad(indicadorId, event.target.checked, actividadId)}
                                              style={{ width: "18px", height: "18px", accentColor: "#2563eb" }}
                                            />
                                          </td>
                                        );
                                      })}
                                      <td style={{ padding: "8px", borderTop: "1px solid #e2e8f0", fontWeight: 800, color: estado === "Calificado" ? "#166534" : estado === "No Calificado" ? "#92400e" : "#64748b" }}>{estado}</td>
                                    </tr>
                                  );
                                })}
                                {!seguimientoIndicadoresAsignablesPorActividad.length ? (
                                  <tr>
                                    <td colSpan={seguimientoActividadesPlaneamiento.length + 2} style={{ padding: "10px", color: "#64748b" }}>No hay indicadores de este tipo para asignar.</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                          )}
                          <div style={{ display: "none" }}>
                            {seguimientoIndicadoresDisponiblesParaAsignar.map((indicador) => {
                                const checked = seguimientoIndicadoresActividadAsignados.includes(Number(indicador.IndicadorGrupoId));
                                return (
                                  <label key={`asig-${indicador.IndicadorGrupoId}`} style={{ display: "flex", gap: "8px", alignItems: "start", color: "#0f172a" }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => toggleIndicadorAsignadoActividad(Number(indicador.IndicadorGrupoId), event.target.checked)}
                                    />
                                    <span>{indicador.IndicadorBase}</span>
                                  </label>
                                );
                              })}
                            {seguimientoIndicadoresDisponiblesParaAsignar.length === 0 ? (
                              <small style={{ color: "#64748b" }}>No hay indicadores disponibles: ya fueron asignados o ya están calificados.</small>
                            ) : null}
                          </div>
                          <div>
                            <button type="button" className="primary-btn" onClick={guardarAsignacionIndicadoresActividad} disabled={savingSeguimiento || !seguimientoActividadSeleccionada}>
                              {savingSeguimiento ? "Guardando..." : "Guardar asignación de indicadores"}
                            </button>
                          </div>
                        </div>
                        ) : null}

                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#0f172a", fontWeight: 700 }}>Indicador del planeamiento</span>
                          <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={seguimientoIndicadorSeleccionado?.IndicadorGrupoId ? String(seguimientoIndicadorSeleccionado.IndicadorGrupoId) : ""} onChange={(event) => setSeguimientoIndicadorId(event.target.value)}>
                            {seguimientoIndicadoresFiltrados.length === 0 ? <option value="">No hay indicadores para este filtro</option> : null}
                            {seguimientoIndicadoresFiltrados.map((indicador) => (
                              <option key={indicador.IndicadorGrupoId} value={indicador.IndicadorGrupoId}>
                                {(indicador.PlaneamientoNombre || "Planeamiento") + " - " + indicador.IndicadorBase}
                              </option>
                            ))}
                          </select>
                        </label>

                        {seguimientoIndicadorSeleccionado ? (
                          <div style={{ display: "grid", gap: "12px" }}>
                            <div style={{ padding: "12px", background: "white", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
                              <strong>Indicador base:</strong> {seguimientoIndicadorSeleccionado.IndicadorBase}
                            </div>
                            <div style={{ overflowX: "auto", background: "#f8fafc", border: "1px solid #94a3b8", borderRadius: "14px" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
                                <thead>
                                  <tr style={{ background: "#cbd5e1", color: "#0f172a" }}>
                                    <th style={{ minWidth: "230px", color: "#0f172a", padding: "10px", borderBottom: "1px solid #cbd5e1" }}>Alumno</th>
                                    <th style={{ minWidth: "300px", color: "#0f172a", padding: "10px", borderBottom: "1px solid #cbd5e1" }}>Indicador</th>
                                    {(["INICIAL", "INTERMEDIO", "AVANZADO", normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE"] as SeguimientoEstado[]).map((estado) => (
                                      <th key={estado} style={{ color: "#0f172a", padding: "10px", borderBottom: "1px solid #cbd5e1", textAlign: "center" }} title={getTooltipSeguimiento(seguimientoIndicadorSeleccionado, estado, seguimientoTipo)}>
                                        {getEstadoSeguimientoLabel(estado, seguimientoTipo)}<br />
                                        <small style={{ color: "#334155" }}>{getEstadoSeguimientoValor(estado)} pts</small>
                                      </th>
                                    ))}
                                    {isTipoCotidianoSeguimiento(seguimientoTipo) ? (
                                      <th style={{ minWidth: "230px", color: "#0f172a", padding: "10px", borderBottom: "1px solid #cbd5e1" }}>Act. de Recuperación</th>
                                    ) : null}
                                    <th style={{ minWidth: "260px", color: "#0f172a", padding: "10px", borderBottom: "1px solid #cbd5e1" }}>Informar al encargado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(seguimientoContexto.estudiantes || []).map((estudiante, estudianteIndex) => {
                                    const actual = getSeguimientoEstadoActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId) || "AVANZADO";
                                    const aviso = getSeguimientoInformarActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId);
                                    const recuperacion = getSeguimientoRecuperacionActual(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId);
                                    const puedeWhatsApp = Boolean(estudiante.AutorizaWhatsAppEncargado);
                                    const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                    return (
                                      <tr key={estudiante.EstudianteId} style={{ background: zebraBg }}>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 700 }}>
                                          {getFullName(estudiante)}
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>{estudiante.Identificacion}</div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            Correo: {getCorreoHabilitadoEstudiante(estudiante) || "No definido"}
                                          </div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            WA: {getTelefonoWhatsAppHabilitado(estudiante) || "No habilitado"}
                                          </div>
                                        </td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", color: "#1e293b" }}>{seguimientoIndicadorSeleccionado.IndicadorBase}</td>
                                        {(["INICIAL", "INTERMEDIO", "AVANZADO", normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE"] as SeguimientoEstado[]).map((estado) => (
                                          <td key={estado} style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }} title={getTooltipSeguimiento(seguimientoIndicadorSeleccionado, estado, seguimientoTipo)}>
                                            <input
                                              type="radio"
                                              style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                              name={`seg-${seguimientoIndicadorSeleccionado.IndicadorGrupoId}-${estudiante.EstudianteId}`}
                                              checked={actual === estado}
                                              onChange={() => updateSeguimientoDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, estado)}
                                            />
                                          </td>
                                        ))}
                                        {isTipoCotidianoSeguimiento(seguimientoTipo) ? (
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <label title="Actividad de recuperación" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "1px solid #94a3b8", borderRadius: "8px", background: recuperacion.activa ? "#dbeafe" : "#ffffff" }}>
                                              <input
                                                type="checkbox"
                                                aria-label="Actividad de recuperación"
                                                style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                                checked={recuperacion.activa}
                                                onChange={(event) => updateSeguimientoRecuperacionDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { activa: event.target.checked })}
                                              />
                                            </label>
                                            {recuperacion.activa ? (
                                              <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                                <textarea
                                                  value={recuperacion.texto}
                                                  onChange={(event) => updateSeguimientoRecuperacionDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { texto: event.target.value })}
                                                  placeholder="Detalle de recuperación"
                                                  rows={2}
                                                  style={{ width: "100%", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: "#ffffff" }}
                                                />
                                              </div>
                                            ) : null}
                                          </td>
                                        ) : null}
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                          <label title="Informar al encargado" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "1px solid #94a3b8", borderRadius: "8px", background: aviso.informar ? "#dbeafe" : "#ffffff" }}>
                                            <input
                                              type="checkbox"
                                              aria-label="Informar al encargado"
                                              style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                              checked={aviso.informar}
                                              onChange={(event) => updateSeguimientoInformarDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { informar: event.target.checked })}
                                            />
                                          </label>
                                          {aviso.informar ? (
                                            <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                              <textarea
                                                value={aviso.observacion}
                                                onChange={(event) => updateSeguimientoInformarDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { observacion: event.target.value })}
                                                placeholder="Observaciones para el encargado"
                                                rows={2}
                                                style={{ width: "100%", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: "#ffffff" }}
                                              />
                                              <small style={{ color: puedeWhatsApp ? "#166534" : "#92400e" }}>
                                                Correo al estudiante. WhatsApp {puedeWhatsApp ? "habilitado" : "no autorizado"}.
                                              </small>
                                            </div>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                              <button type="button" className="primary-btn" onClick={guardarSeguimientoIndicador} disabled={savingSeguimiento || !seguimientoIndicadorSeleccionado}>
                                {savingSeguimiento ? "Guardando..." : "Guardar evaluación"}
                              </button>
                              <span style={{ color: "#475569" }}>Inicial = 1, Intermedio = 2, Avanzado = 3, {normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "No entregado" : "Ausente"} = 0</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: "14px", background: "white", border: "1px dashed #cbd5e1", borderRadius: "14px", color: "#475569" }}>
                            No hay indicadores disponibles para evaluar con esos filtros.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {false && activePanel === "notas" && (
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #dbeafe", borderRadius: "16px", background: "#eff6ff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px" }}>Estructura de evaluación editable</h4>
                    <p style={{ margin: 0, color: "#1e3a8a" }}>
                      Creá una copia de la plantilla institucional para este grupo. El profe puede ajustar rubros y porcentajes, pero el total debe sumar 100%.
                    </p>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadEval360Data(selected)} disabled={loadingEval360 || !selected}>
                    {loadingEval360 ? "Cargando..." : "Actualizar estructura"}
                  </button>
                </div>

                {!eval360Estructura?.estructura ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ fontWeight: 700, color: "#111827" }}>Plantilla institucional base</span>
                      <select value={eval360PlantillaId} onChange={(event) => setEval360PlantillaId(event.target.value)} disabled={loadingEval360 || savingEval360}>
                        <option value="">Usar plantilla institucional recomendada</option>
                        {eval360Plantillas.map((plantilla) => (
                          <option key={plantilla.EvaluacionPlantillaId} value={plantilla.EvaluacionPlantillaId}>
                            {plantilla.Nombre} {plantilla.TotalPorcentaje !== null && plantilla.TotalPorcentaje !== undefined ? "(" + Number(plantilla.TotalPorcentaje).toFixed(2) + "%)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="primary-btn" onClick={crearEval360DesdePlantilla} disabled={savingEval360 || loadingEval360 || !selected}>
                        {savingEval360 ? "Creando estructura..." : "Crear copia editable para este grupo"}
                      </button>
                      <span style={{ fontSize: "13px", color: "#1e3a8a" }}>
                        Si no elegís una plantilla, se usará la activa recomendada para este grupo, materia y periodo.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <div style={{ ...cardStyle, background: "white" }}>
                        <strong>Estructura</strong>
                        <span>{eval360Estructura.estructura.Nombre}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "white" }}>
                        <strong>Plantilla base</strong>
                        <span>{eval360Estructura.estructura.PlantillaBaseNombre || "Plantilla institucional"}</span>
                      </div>
                      <div style={{ ...cardStyle, background: "white" }}>
                        <strong>Total</strong>
                        <span style={{ fontSize: "22px", fontWeight: 800, color: Number(totalEval360().toFixed(2)) === 100 ? "#166534" : "#b91c1c" }}>
                          {totalEval360().toFixed(2)}%
                        </span>
                      </div>
                    </div>

                    <div style={{ overflowX: "auto", background: "white", borderRadius: "14px", border: "1px solid #bfdbfe" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Usar</th>
                            <th>Rubro</th>
                            <th>%</th>
                            <th>Tipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eval360DetallesDraft.map((detalleEval, index) => (
                            <tr key={detalleEval.EstructuraGrupoDetalleId || index}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={detalleEval.Activo !== false && detalleEval.Activo !== 0}
                                  onChange={(event) => updateEval360Detalle(index, "Activo", event.target.checked)}
                                />
                              </td>
                              <td style={{ minWidth: "260px" }}>
                                <input
                                  type="text"
                                  value={detalleEval.Nombre || ""}
                                  onChange={(event) => updateEval360Detalle(index, "Nombre", event.target.value)}
                                />
                              </td>
                              <td style={{ minWidth: "120px" }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={detalleEval.Porcentaje}
                                  onChange={(event) => updateEval360Detalle(index, "Porcentaje", event.target.value)}
                                />
                              </td>
                              <td>{detalleEval.ComponenteCatalogoNombre || "Componente"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="primary-btn" onClick={guardarEval360Estructura} disabled={savingEval360 || Number(totalEval360().toFixed(2)) !== 100}>
                        {savingEval360 ? "Guardando..." : "Guardar estructura"}
                      </button>
                      {Number(totalEval360().toFixed(2)) !== 100 && (
                        <span style={{ color: "#b91c1c", fontWeight: 700 }}>Debe sumar 100% para guardar</span>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      {(eval360Estructura.niveles || []).map((nivel) => (
                        <div key={nivel.NivelDesempenoGrupoId || nivel.Nombre} style={{ ...cardStyle, background: "white" }}>
                          <strong>{nivel.Nombre}</strong>
                          <span>Valor: {Number(nivel.Valor || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>


                  </div>
                )}
              </div>
            )}


            {false && activePanel === "notas" && (
              detalle.plantilla ? (
              <div style={{ overflowX: "auto" }}>
                <h4>Estructura de evaluación</h4>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button type="button" className="primary-btn" onClick={handleSaveNotas} disabled={savingNotas || !detalle.plantilla || detalle.actividades.length === 0}>
                    {savingNotas ? "Guardando notas..." : "Guardar notas"}
                  </button>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>% componente</th>
                      <th>Actividad</th>
                      <th>% dentro del componente</th>
                      <th>% real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.componentes.map((componente) => {
                      const actividades = actividadesPorComponente.get(componente.EvaluacionComponenteId) || [];
                      if (actividades.length === 0) {
                        return (
                          <tr key={`comp-${componente.EvaluacionComponenteId}`}>
                            <td>{componente.Descripcion}</td>
                            <td>{formatPercent(componente.Porcentaje)}</td>
                            <td colSpan={3}>Sin actividades</td>
                          </tr>
                        );
                      }
                      return actividades.map((actividad, index) => (
                        <tr key={actividad.EvaluacionActividadId}>
                          <td>{index === 0 ? componente.Descripcion : ""}</td>
                          <td>{index === 0 ? formatPercent(componente.Porcentaje) : ""}</td>
                          <td>{actividad.Descripcion}</td>
                          <td>{formatPercent(actividad.Porcentaje)}</td>
                          <td>{formatPercent(actividad.PorcentajeReal)}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "12px", borderRadius: "12px", background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74" }}>
                Este grupo y materia todavía no tienen una plantilla de evaluación configurada para el periodo seleccionado.
              </div>
            ))}



            {activePanel === "asistencia" && detalle && (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ marginBottom: "4px" }}>Asistencia</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      Según el Artículo 37, la asistencia asigna de 5% a 0% según el porcentaje de ausencias injustificadas del total de lecciones impartidas.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
                    <label style={{ display: "grid", gap: "4px" }}>
                      Fecha
                      <input
                        type="date"
                        value={asistenciaFecha}
                        onChange={(e) => {
                          setAsistenciaFecha(e.target.value);
                          if (selected) loadAsistencia(selected, e.target.value);
                        }}
                      />
                    </label>
                    <button type="button" className="primary-btn" onClick={handleSaveAsistencia} disabled={savingAsistencia || loadingAsistencia}>
                      {savingAsistencia ? "Guardando asistencia..." : "Guardar asistencia"}
                    </button>
                  </div>
                </div>

                <div style={helperDarkBoxStyle}>
                  <strong>Escala Artículo 37</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px", marginTop: "8px" }}>
                    <span>0% a menos de 10%: 5%</span>
                    <span>10% a menos de 20%: 4%</span>
                    <span>20% a menos de 30%: 3%</span>
                    <span>30% a menos de 40%: 2%</span>
                    <span>40% a menos de 50%: 1%</span>
                    <span>50% o más: 0%</span>
                  </div>
                  <small style={{ display: "block", marginTop: "8px", opacity: 0.75 }}>
                    Tardía injustificada menor de 10 minutos cuenta como media ausencia injustificada. Tardía injustificada mayor de 10 minutos cuenta como ausencia injustificada.
                  </small>
                </div>

                {loadingAsistencia ? (
                  <p>Cargando asistencia...</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={stickyTableHeaderStyle}>Estudiante</th>
                          <th>Identificación</th>
                          <th>Estado</th>
                          <th>Minutos tardóa</th>
                          <th>Observación</th>
                          <th>Ausencias equiv.</th>
                          <th>% ausencias</th>
                          <th>% Art. 37</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.estudiantes.map((estudiante, estudianteIndex) => {
                          const primeraLeccion = asistenciaLecciones[0] || getAsistenciaLeccionesFallback()[0];
                          const draft = asistenciaDrafts[asistenciaDraftKey(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId)] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "" };
                          const resumen = getResumenAsistencia(estudiante.EstudianteId);
                          const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                          return (
                            <tr key={`asis-${estudiante.EstudianteId}`} style={{ background: zebraBg }}>
                              <td style={stickyTableCellStyle}>
                                {getFullName(estudiante)}
                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>{estudiante.Identificacion}</div>
                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                  Correo: {getCorreoHabilitadoEstudiante(estudiante) || "No definido"}
                                </div>
                                <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                  WA: {getTelefonoWhatsAppHabilitado(estudiante) || "No habilitado"}
                                </div>
                              </td>
                              <td>{estudiante.Identificacion}</td>
                              <td>
                                <select value={draft.estado} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId, "estado", e.target.value)}>
                                  <option value="PRESENTE">Presente</option>
                                  <option value="AUSENTE_JUSTIFICADA">Ausente justificada</option>
                                  <option value="AUSENTE_INJUSTIFICADA">Ausente injustificada</option>
                                  <option value="TARDIA_MENOR_10">Tardía menor a 10 min</option>
                                  <option value="TARDIA_MAYOR_10">Tardía mayor a 10 min</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  value={draft.minutosTardia}
                                  onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId, "minutosTardia", e.target.value)}
                                  placeholder="0"
                                  style={{ width: "110px" }}
                                />
                              </td>
                              <td>
                                <input
                                  value={draft.observacion}
                                  onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId, "observacion", e.target.value)}
                                  placeholder="Observación"
                                  style={{ minWidth: "220px" }}
                                />
                              </td>
                              <td>{Number(resumen?.AusenciasInjustificadasEquivalentes || 0).toFixed(2)}</td>
                              <td>{Number(resumen?.PorcentajeAusencias || 0).toFixed(2)}%</td>
                              <td><strong>{Number(resumen?.PorcentajeAsignadoArticulo37 ?? 5).toFixed(2)}%</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activePanel === "planeamientos" && (
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ marginBottom: "4px" }}>Planeamiento e Indicadores</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      Generá planeamientos con IA según las materias, grados y secciones que tenés asignadas.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        if (!planeamientoIaFormOpen && selected) {
                          setPlaneamientoIaForm((prev) => ({
                            ...prev,
                            materiaId: String(selected.MateriaId || ""),
                            grado: getGradoPlaneamientoFromGrupo(selected),
                            grupoId: String(selected.GrupoId || ""),
                            grupoIds: [String(selected.GrupoId || "")].filter(Boolean),
                            habilidadesIds: []
                          }));
                          setDocumentoApoyoIa(null);
                          setPlantillaFormatoIa(null);
                          setEditingPlaneamientoIaId(null);
                          setUltimoPlaneamientoIa(null);
                        }
                        setPlaneamientoIaFormOpen((prev) => !prev);
                      }}
                    >
                      {planeamientoIaFormOpen ? "Ocultar generación IA" : "Agregar planeamiento con IA"}
                    </button>
                  </div>
                </div>



                {!planeamientoIaFormOpen && (
                  <div style={{ ...cardStyle, background: "#10243a", color: "#e5eefb", border: "1px solid #38516f" }}>
                    <strong>Generación de planeamiento con IA</strong>
                    <p style={{ margin: "6px 0 0", color: "#b8c7da" }}>
                      El formulario está minimizado. Presioná “Agregar planeamiento con IA” para desplegarlo.
                    </p>
                  </div>
                )}

                {planeamientoIaFormOpen && (
                  <div style={{ ...cardStyle, background: "#10243a", color: "#e5eefb", border: "1px solid #38516f" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <strong>Generar planeamiento con IA</strong>
                      <p style={{ margin: "4px 0 0", color: "#b8c7da" }}>
                        La materia y el grado se toman del grupo seleccionado en Mis grupos. Luego elegís las habilidades y las indicaciones para la IA.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
                    <label style={{ color: "#e5eefb" }}>
                      Materia
                      <div
                        style={{
                          background: "#1f324a",
                          color: "#e5eefb",
                          border: "1px solid #4b6583",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          minHeight: "42px",
                          display: "flex",
                          alignItems: "center"
                        }}
                      >
                        {selected?.MateriaCodigo ? `${selected.MateriaCodigo} - ` : ""}{selected?.MateriaNombre || "Materia no disponible"}
                      </div>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Grado
                      <div
                        style={{
                          background: "#1f324a",
                          color: "#e5eefb",
                          border: "1px solid #4b6583",
                          borderRadius: "10px",
                          padding: "10px 12px",
                          minHeight: "42px",
                          display: "flex",
                          alignItems: "center"
                        }}
                      >
                        {getGradoPlaneamientoFromGrupo(selected) || normalizarGradoPlaneamiento(planeamientoIaForm.grado) || "Grado no disponible"}
                      </div>
                    </label>
                    <div style={{ color: "#e5eefb" }}>
                      <div style={{ fontWeight: 700, marginBottom: "6px" }}>Secciones</div>
                      <div
                        style={{
                          background: "#1f324a",
                          border: "1px solid #4b6583",
                          borderRadius: "10px",
                          padding: "8px 10px",
                          display: "grid",
                          gap: "6px"
                        }}
                      >
                        {seccionesAsignadas.length === 0 ? (
                          <span style={{ color: "#a8b7c9", fontSize: "13px" }}>Seleccioná materia y grado para cargar tus secciones</span>
                        ) : (
                          <>
                            <label
                              style={{
                                display: "flex",
                                gap: "6px",
                                alignItems: "center",
                                color: "#e5eefb",
                                fontSize: "13px",
                                fontWeight: 700,
                                lineHeight: 1.2,
                                whiteSpace: "nowrap"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={seccionesAsignadas.length > 0 && planeamientoIaForm.grupoIds.length === seccionesAsignadas.length}
                                onChange={(e) => e.target.checked ? seleccionarTodasSeccionesPlaneamientoIa() : limpiarSeccionesPlaneamientoIa()}
                                style={{ margin: 0, flexShrink: 0 }}
                              />
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Seleccionar todas</span>
                            </label>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "6px 10px" }}>
                              {seccionesAsignadas.map((grupo) => {
                                const grupoId = grupo.GrupoId ?? (grupo as any).grupoId ?? (grupo as any).Id ?? (grupo as any).id;
                                const id = String(grupoId);
                                const nombreSeccion = getNombreSeccionPlaneamiento(grupo);
                                const detalleSeccion = getDetalleSeccionPlaneamiento(grupo);

                                return (
                                  <label
                                    key={`${id}-${grupo.MateriaId ?? (grupo as any).materiaId ?? ""}-${grupo.PeriodoId ?? (grupo as any).periodoId ?? ""}`}
                                    title={detalleSeccion}
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      alignItems: "center",
                                      justifyContent: "flex-start",
                                      color: "#e5eefb",
                                      fontSize: "13px",
                                      lineHeight: 1.2,
                                      whiteSpace: "nowrap",
                                      minWidth: 0,
                                      width: "100%"
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={planeamientoIaForm.grupoIds.includes(id)}
                                      onChange={() => toggleSeccionPlaneamientoIa(Number(grupoId))}
                                      style={{
                                        margin: 0,
                                        width: "16px",
                                        height: "16px",
                                        minWidth: "16px",
                                        maxWidth: "16px",
                                        flex: "0 0 16px",
                                        accentColor: "#28c5d8"
                                      }}
                                    />
                                    <span
                                      style={{
                                        display: "block",
                                        flex: "1 1 auto",
                                        minWidth: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        color: "#e5eefb"
                                      }}
                                    >
                                      {nombreSeccion}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <label style={{ color: "#e5eefb" }}>
                      Tipo de colegio
                      <input
                        value={planeamientoIaForm.tipoColegio}
                        onChange={(e) => updatePlaneamientoIaField("tipoColegio", e.target.value)}
                        placeholder="Ejemplo: Académico, Técnico, Nocturno"
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Plantilla IA
                      <select
                        value={plantillaPlaneamientoIaId}
                        onChange={(e) => setPlantillaPlaneamientoIaId(e.target.value)}
                        disabled={loadingPlantillasPlaneamientoIa}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      >
                        <option value="">Usar plantilla institucional recomendada</option>
                        {plantillasPlaneamientoIa.map((plantilla) => (
                          <option key={plantilla.Id} value={plantilla.Id}>
                            {plantilla.NombrePlantilla}
                          </option>
                        ))}
                      </select>
                      <small style={{ display: "block", color: "#a8b7c9", marginTop: "4px" }}>
                        Si no escogés una plantilla específica, se usará la plantilla institucional activa para planeamientos.
                      </small>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Plantilla o formato de salida (opcional)
                      <input
                        type="file"
                        accept=".docx,.txt,.csv,.json,.md"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file && file.size > 10 * 1024 * 1024) {
                            setPlantillaFormatoIa(null);
                            e.target.value = "";
                            setErrorMessage("La plantilla o formato de salida no puede superar 10 MB");
                            return;
                          }
                          setPlantillaFormatoIa(file);
                          if (file) setErrorMessage("");
                        }}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                      <small style={{ display: "block", color: "#a8b7c9", marginTop: "4px" }}>
                        Usalo cuando querés que esta generación siga un orden, tabla o estructura específica. Para un formato permanente, guardalo como Plantilla IA en Configuración con IA.
                      </small>
                      {plantillaFormatoIa && (
                        <small style={{ display: "block", color: "#67e8f9", marginTop: "4px" }}>
                          Formato seleccionado: {plantillaFormatoIa.name}
                        </small>
                      )}
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-start" }}>
                      <button type="button" style={secondaryButtonStyle} onClick={() => loadHabilidadesIa()} disabled={loadingHabilidadesIa}>
                        {loadingHabilidadesIa ? "Cargando..." : "Actualizar habilidades"}
                      </button>
                    </div>

                    <label style={{ color: "#e5eefb" }}>
                      Mes o meses
                      <select
                        multiple
                        value={mesesSeleccionadosIa}
                        onChange={(e) => {
                          const valores = Array.from(e.target.selectedOptions).map((option) => option.value);
                          updatePlaneamientoIaField("mes", valores.join("|"));
                        }}
                        disabled={loadingHabilidadesIa}
                        style={{ minHeight: "96px", background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      >
                        {mesesHabilidades.map((mes) => (
                          <option key={mes} value={mes}>{mes}</option>
                        ))}
                      </select>
                      <small style={{ color: "#b8c7da" }}>Ctrl + clic para seleccionar varios meses. Si no seleccionés ninguno, se muestran todos.</small>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Área
                      <select
                        value={planeamientoIaForm.area}
                        onChange={(e) => updatePlaneamientoIaField("area", e.target.value)}
                        disabled={loadingHabilidadesIa}
                      >
                        <option value="">Todas las Áreas</option>
                        {areasHabilidades.map((area) => (
                          <option key={area} value={area}>{area}</option>
                        ))}
                      </select>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Buscar texto
                      <input
                        value={planeamientoIaForm.busquedaTexto}
                        onChange={(e) => updatePlaneamientoIaField("busquedaTexto", e.target.value)}
                        placeholder="Buscar por habilidad, Área, número o referencia"
                      />
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Cantidad de semanas
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={planeamientoIaForm.semanas}
                        onChange={(e) => updatePlaneamientoIaField("semanas", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Fecha inicio
                      <input
                        type="date"
                        value={planeamientoIaForm.fechaInicio}
                        onChange={(e) => updatePlaneamientoIaField("fechaInicio", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Fecha fin
                      <input
                        type="date"
                        value={planeamientoIaForm.fechaFin}
                        onChange={(e) => updatePlaneamientoIaField("fechaFin", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>
                  </div>

                  <label style={{ color: "#e5eefb" }}>
                    Mes, tema o énfasis del planeamiento
                    <input
                      value={planeamientoIaForm.tema}
                      onChange={(e) => updatePlaneamientoIaField("tema", e.target.value)}
                      placeholder="Ejemplo: Abril, Ley de senos, Funciones, Estadéstica..."
                      style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                    />
                  </label>

                  <label style={{ color: "#e5eefb" }}>
                    Indicaciones, consideraciones o premisas para la IA
                    <textarea
                      rows={4}
                      value={planeamientoIaForm.indicaciones}
                      onChange={(e) => updatePlaneamientoIaField("indicaciones", e.target.value)}
                      placeholder="Ejemplo: considerar adecuación curricular, grupo con rezago, usar problemas contextualizados de Costa Rica, incluir trabajo colaborativo..."
                      style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                    />
                  </label>

                  <label style={{ color: "#e5eefb" }}>
                    Documento de apoyo para la IA (opcional)
                    <input
                      type="file"
                      accept=".txt,.csv,.json,.md,.pdf,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file && file.size > 10 * 1024 * 1024) {
                          setDocumentoApoyoIa(null);
                          e.target.value = "";
                          setErrorMessage("El documento de apoyo no puede superar 10 MB");
                          return;
                        }
                        setDocumentoApoyoIa(file);
                        if (file) setErrorMessage("");
                      }}
                      style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                    />
                    <small style={{ color: "#b8c7da" }}>
                      Podés adjuntar lineamientos, indicaciones o material de apoyo. Este archivo no define el formato de salida.
                    </small>
                    {documentoApoyoIa && (
                      <small style={{ display: "block", color: "#67e8f9", marginTop: "4px" }}>
                        Documento seleccionado: {documentoApoyoIa.name}
                      </small>
                    )}
                  </label>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <strong>Habilidades</strong>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" style={secondaryButtonStyle} onClick={seleccionarTodasHabilidadesIa} disabled={habilidadesFiltradasIa.length === 0}>
                          Seleccionar todas
                        </button>
                        <button type="button" style={secondaryButtonStyle} onClick={limpiarHabilidadesIa}>
                          Limpiar selección
                        </button>
                      </div>
                    </div>

                    {habilidadesIa.length === 0 ? (
                      <div style={{ padding: "12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e5e7eb", color: "#b8c7da" }}>
                        Seleccioná materia y grado para cargar las habilidades. Luego escogé si deseás filtrar por Mes o por Área.
                      </div>
                    ) : habilidadesFiltradasIa.length === 0 ? (
                      <div style={{ padding: "12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e5e7eb", color: "#b8c7da" }}>
                        No hay habilidades para la opción seleccionada. Verificá el Mes o Área escogido.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "8px", maxHeight: "280px", overflow: "auto", paddingRight: "4px" }}>
                        {habilidadesFiltradasIa.map((habilidad) => {
                          const id = Number(habilidad.PlaneamientoHabilidadId);
                          const checked = planeamientoIaForm.habilidadesIds.includes(id);
                          return (
                            <label
                              key={id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto 1fr",
                                gap: "10px",
                                alignItems: "start",
                                padding: "10px",
                                borderRadius: "12px",
                                border: checked ? "1px solid #22d3ee" : "1px solid #38516f",
                                background: checked ? "#164e63" : "#122033",
                                color: "#e5eefb",
                                cursor: "pointer"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleHabilidadIa(id)}
                                style={{ width: "18px", marginTop: "2px" }}
                              />
                              <span>
                                <strong>
                                  {habilidad.NumeroHabilidad ? `Habilidad ${habilidad.NumeroHabilidad}: ` : ""}
                                  {habilidad.Area || habilidad.Mes || "Habilidad"}
                                </strong>
                                <span style={{ display: "block", marginTop: "3px", color: "#b8c7da" }}>
                                  {habilidad.DescripcionHabilidad}
                                </span>
                                <small style={{ display: "block", marginTop: "4px", color: "#9fb3ca" }}>
                                  {habilidad.MateriaNombre || ""} {habilidad.Grado ? `| Grado: ${habilidad.Grado}` : ""} {habilidad.Mes ? `| Mes: ${habilidad.Mes}` : ""}
                                </small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <button type="button" className="primary-btn" onClick={generarPlaneamientoConIa} disabled={generatingPlaneamientoIa}>
                      {generatingPlaneamientoIa ? "Generando propuesta..." : "Generar propuesta con IA"}
                    </button>
                    <span style={{ color: "#475569" }}>
                      Seleccionadas: {planeamientoIaForm.habilidadesIds.length}
                    </span>
                  </div>

                  {(generatingPlaneamientoIa || errorMessage || message) && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: errorMessage ? "#fef2f2" : "#ecfdf3",
                        color: errorMessage ? "#991b1b" : "#166534",
                        border: errorMessage ? "1px solid #fecaca" : "1px solid #bbf7d0"
                      }}
                    >
                      {generatingPlaneamientoIa ? "Generando la propuesta. Esto puede tardar unos segundos si adjuntaste una plantilla." : (errorMessage || message)}
                    </div>
                  )}

                  {ultimoPlaneamientoIa && (
                    <div style={{ padding: "14px", borderRadius: "14px", background: "#122033", border: "1px solid #38516f", color: "#e5eefb", display: "grid", gap: "12px" }}>
                      <div>
                        <strong>Revisión del planeamiento generado</strong>
                        <p style={{ margin: "4px 0 0", color: "#b8c7da" }}>
                          Revisá y ajustá la propuesta. El sistema guardará el planeamiento únicamente cuando presionés “Guardar planeamiento”.
                        </p>
                      </div>

                      <label>
                        Nombre del planeamiento
                        <input
                          value={ultimoPlaneamientoIa.nombre || ""}
                          onChange={(e) => updateResultadoIaField("nombre", e.target.value)}
                          placeholder="Ejemplo: Tercer ciclo - I Trimestre 2026"
                        />
                      </label>

                      <label>
                        Enfoque metodológico
                        <textarea
                          rows={2}
                          value={ultimoPlaneamientoIa.enfoque || ""}
                          onChange={(e) => updateResultadoIaField("enfoque", e.target.value)}
                        />
                      </label>

                      <label>
                        Aprendizajes esperados
                        <textarea
                          rows={4}
                          value={(ultimoPlaneamientoIa.aprendizajesEsperados || []).join("\n")}
                          onChange={(e) => updateResultadoIaArray("aprendizajesEsperados", e.target.value)}
                        />
                      </label>

                      <label>
                        Estrategias de mediación
                        <textarea
                          rows={8}
                          value={typeof ultimoPlaneamientoIa.estrategiasMediacion === "string"
                            ? ultimoPlaneamientoIa.estrategiasMediacion
                            : (ultimoPlaneamientoIa.estrategiasMediacion || []).join("\n\n")}
                          onChange={(e) => updateResultadoIaField("estrategiasMediacion", e.target.value)}
                        />
                      </label>


                      {ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.aplica && (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "12px",
                            border: ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.colorResaltado === "azul" ? "2px solid #2563eb" : "1px solid #38516f",
                            background: ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.colorResaltado === "azul" ? "#dbeafe" : "#0f172a",
                            color: ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.colorResaltado === "azul" ? "#1e3a8a" : "#e5eefb"
                          }}
                        >
                          <strong>{ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.titulo || "Estrategia de mediación para adecuación significativa"}</strong>
                          {ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.colorResaltado === "azul" && (
                            <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 700 }}>[AZUL]</span>
                          )}
                          <label style={{ display: "block", marginTop: "10px" }}>
                            Texto visible de la adecuación significativa
                            <textarea
                              rows={6}
                              value={ultimoPlaneamientoIa.estrategiaAdecuacionSignificativa?.textoVisible || ""}
                              onChange={(e) => updateResultadoIaAdecuacion("textoVisible", e.target.value)}
                            />
                          </label>
                        </div>
                      )}
                      <label>
                        Indicadores de evaluación
                        <textarea
                          rows={6}
                          value={(ultimoPlaneamientoIa.indicadoresEvaluacion || []).join("\n")}
                          onChange={(e) => updateResultadoIaArray("indicadoresEvaluacion", e.target.value)}
                        />
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                        <label>
                          Trabajo cotidiano sugerido
                          <textarea
                            rows={4}
                            value={(ultimoPlaneamientoIa.trabajoCotidiano || []).join("\n")}
                            onChange={(e) => updateResultadoIaArray("trabajoCotidiano", e.target.value)}
                          />
                        </label>

                        <label>
                          Tareas sugeridas
                          <textarea
                            rows={4}
                            value={(ultimoPlaneamientoIa.tareas || []).join("\n")}
                            onChange={(e) => updateResultadoIaArray("tareas", e.target.value)}
                          />
                        </label>

                        <label>
                          Evaluación sugerida
                          <textarea
                            rows={4}
                            value={(ultimoPlaneamientoIa.evaluacionSugerida || []).join("\n")}
                            onChange={(e) => updateResultadoIaArray("evaluacionSugerida", e.target.value)}
                          />
                        </label>
                      </div>

                      <label>
                        Recursos
                        <textarea
                          rows={3}
                          value={(ultimoPlaneamientoIa.recursos || []).join("\n")}
                          onChange={(e) => updateResultadoIaArray("recursos", e.target.value)}
                        />
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                        <label>
                          ¿Qué funcionó?
                          <textarea
                            rows={2}
                            value={ultimoPlaneamientoIa.reflexionesDocentes?.queFunciono || ""}
                            onChange={(e) => updateResultadoIaReflexion("queFunciono", e.target.value)}
                          />
                        </label>
                        <label>
                          ¿Qué no funcionó?
                          <textarea
                            rows={2}
                            value={ultimoPlaneamientoIa.reflexionesDocentes?.queNoFunciono || ""}
                            onChange={(e) => updateResultadoIaReflexion("queNoFunciono", e.target.value)}
                          />
                        </label>
                        <label>
                          ¿Qué puedo mejorar?
                          <textarea
                            rows={2}
                            value={ultimoPlaneamientoIa.reflexionesDocentes?.quePuedoMejorar || ""}
                            onChange={(e) => updateResultadoIaReflexion("quePuedoMejorar", e.target.value)}
                          />
                        </label>
                      </div>

                      <label>
                        Observaciones
                        <textarea
                          rows={3}
                          value={ultimoPlaneamientoIa.observaciones || ""}
                          onChange={(e) => updateResultadoIaField("observaciones", e.target.value)}
                        />
                      </label>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button type="button" className="primary-btn" onClick={guardarPlaneamientoIaGenerado} disabled={savingPlaneamientoIa}>
                          {savingPlaneamientoIa ? "Guardando..." : (editingPlaneamientoIaId ? "Actualizar planeamiento" : "Guardar planeamiento")}
                        </button>
                        <button type="button" style={secondaryButtonStyle} onClick={() => { setUltimoPlaneamientoIa(null); setEditingPlaneamientoIaId(null); }} disabled={savingPlaneamientoIa}>
                          Descartar
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                )}

                {planeamientoFormOpen && (
                  <form className="form" onSubmit={handleSavePlaneamiento} style={{ ...cardStyle, background: "#10243a", color: "#e5eefb", border: "1px solid #38516f" }}>
                    <h4>{editingPlaneamientoId ? "Editar planeamiento" : "Nuevo planeamiento manual"}</h4>
                    <label>
                      Nombre
                      <input value={planeamientoForm.nombre} onChange={(e) => updatePlaneamientoField("nombre", e.target.value)} placeholder="Ejemplo: Tercer ciclo - I Trimestre 2026" required />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <label>
                        Fecha inicio
                        <input type="date" value={planeamientoForm.fechaInicio} onChange={(e) => updatePlaneamientoField("fechaInicio", e.target.value)} />
                      </label>
                      <label>
                        Fecha fin
                        <input type="date" value={planeamientoForm.fechaFin} onChange={(e) => updatePlaneamientoField("fechaFin", e.target.value)} />
                      </label>
                    </div>
                    <label>
                      Observaciones
                      <textarea rows={3} value={planeamientoForm.observaciones} onChange={(e) => updatePlaneamientoField("observaciones", e.target.value)} />
                    </label>

                    <div style={{ display: "grid", gap: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        <strong>Indicadores de evaluación</strong>
                        <button type="button" style={secondaryButtonStyle} onClick={addIndicador}>Agregar indicador</button>
                      </div>

                      {planeamientoForm.indicadores.map((indicador, index) => (
                        <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(180px, 260px) auto", gap: "10px", alignItems: "end" }}>
                          <label>
                            Indicador
                            <textarea rows={2} value={indicador.Descripcion} onChange={(e) => updateIndicador(index, "Descripcion", e.target.value)} placeholder="Describí el indicador o aprendizaje esperado" />
                          </label>
                          <label>
                            Nivel de desempeño
                            <select value={indicador.NivelDesempenoId || ""} onChange={(e) => updateIndicador(index, "NivelDesempenoId", e.target.value)}>
                              <option value="">Sin nivel</option>
                              {nivelesDesempeno.map((nivel) => (
                                <option key={nivel.NivelDesempenoId} value={nivel.NivelDesempenoId}>
                                  {nivel.Descripcion} ({Number(nivel.Valor || 0).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="button" style={secondaryButtonStyle} onClick={() => removeIndicador(index)}>Quitar</button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button className="primary-btn" disabled={savingPlaneamiento}>{savingPlaneamiento ? "Guardando..." : "Guardar planeamiento manual"}</button>
                      <button type="button" style={secondaryButtonStyle} onClick={resetPlaneamientoForm}>Cancelar</button>
                    </div>
                  </form>
                )}

                {loadingPlaneamientos ? (
                  <p>Cargando planeamientos...</p>
                ) : planeamientos.length === 0 ? (
                  <div style={helperDarkBoxStyle}>
                    Todavía no hay planeamientos registrados para este grupo, materia y periodo.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", border: "1px solid #38516f", borderRadius: "14px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                      <thead>
                        <tr style={{ background: "#0f2136", color: "#e5eefb" }}>
                          <th style={{ padding: "10px", textAlign: "left" }}>Planeamiento</th>
                          <th style={{ padding: "10px", textAlign: "left" }}>Fecha creación</th>
                          <th style={{ padding: "10px", textAlign: "left" }}>Rango</th>
                          <th style={{ padding: "10px", textAlign: "left" }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planeamientos.map((planeamiento) => {
                          const planeamientoId = Number(planeamiento.PlaneamientoId);
                          const panelOpen = !!eval360PanelIndicadoresOpen[planeamientoId];
                          const indicadoresPlaneamiento = eval360IndicadoresPorPlaneamiento[planeamientoId] || [];
                          const indicadoresMinimizados = !!eval360IndicadoresMinimizados[planeamientoId];
                          const tieneIndicadoresGenerados = indicadoresPlaneamiento.length > 0;

                          return (
                            <>
                              <tr key={planeamiento.PlaneamientoId} style={{ borderTop: "1px solid #38516f", background: "#10243a", color: "#e5eefb" }}>
                                <td style={{ padding: "10px", fontWeight: 700 }}>{planeamiento.Nombre}</td>
                                <td style={{ padding: "10px" }}>{planeamiento.CreatedAt ? String(planeamiento.CreatedAt).slice(0, 10) : "Sin fecha"}</td>
                                <td style={{ padding: "10px" }}>
                                  {(planeamiento.FechaInicio ? String(planeamiento.FechaInicio).slice(0, 10) : "Sin inicio")}
                                  {" - "}
                                  {(planeamiento.FechaFin ? String(planeamiento.FechaFin).slice(0, 10) : "Sin fin")}
                                </td>
                                <td style={{ padding: "10px" }}>
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    <button type="button" className="primary-btn" onClick={() => exportarPlaneamientoWord(planeamiento)}>Generar plantilla Word</button>
                                    <button type="button" style={secondaryButtonStyle} onClick={() => openEditPlaneamiento(planeamiento)}>Editar</button>
                                    <button type="button" style={secondaryButtonStyle} onClick={() => handleDeletePlaneamiento(planeamiento.PlaneamientoId)}>Desactivar</button>
                                    <button type="button" style={{ ...secondaryButtonStyle, color: "#fecaca", borderColor: "#7f1d1d" }} onClick={() => handleHardDeletePlaneamiento(planeamiento.PlaneamientoId)}>Eliminar</button>
                                    <button
                                      type="button"
                                      style={{ ...secondaryButtonStyle, color: "#dbeafe", borderColor: "#60a5fa" }}
                                      onClick={() => togglePanelIndicadoresPlaneamiento(planeamientoId)}
                                    >
                                      {panelOpen ? "Ocultar indicadores IA" : (tieneIndicadoresGenerados ? "Ver Indicadores Generados con IA" : "Generar Indicadores con IA")}
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {panelOpen && (
                                <tr key={`indicadores-${planeamiento.PlaneamientoId}`} style={{ background: "#0b1728", color: "#e5eefb" }}>
                                  <td colSpan={4} style={{ padding: "12px" }}>
                                    <div style={{ display: "grid", gap: "12px", padding: "14px", border: "1px solid #bfdbfe", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                        <div>
                                          <h4 style={{ margin: "0 0 4px", color: "#0f172a" }}>Indicadores IA de: {planeamiento.Nombre}</h4>
                                          <p style={{ margin: 0, color: "#1e293b", fontWeight: 700, lineHeight: 1.45 }}>
                                            Se toman los indicadores de evaluación de este planeamiento y se generan niveles Avanzado, Intermedio e Inicial.
                                          </p>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                          <button
                                            type="button"
                                            style={secondaryButtonStyle}
                                            onClick={() => loadEval360Indicadores(undefined, planeamientoId)}
                                            disabled={loadingEval360Indicadores}
                                          >
                                            {loadingEval360Indicadores ? "Cargando..." : "Actualizar"}
                                          </button>
                                          {tieneIndicadoresGenerados && (
                                            <>
                                              <button
                                                type="button"
                                                className="primary-btn"
                                                onClick={() => guardarEval360CambiosIndicadoresPlaneamiento(planeamientoId)}
                                                disabled={savingEval360PlaneamientoCambiosId === planeamientoId}
                                              >
                                                {savingEval360PlaneamientoCambiosId === planeamientoId ? "Guardando..." : "Guardar cambios"}
                                              </button>
                                              <button
                                                type="button"
                                                style={secondaryButtonStyle}
                                                onClick={() => toggleMinimizarIndicadoresPlaneamiento(planeamientoId)}
                                              >
                                                {indicadoresMinimizados ? "Maximizar indicadores" : "Minimizar indicadores"}
                                              </button>
                                              <button
                                                type="button"
                                                style={{ ...secondaryButtonStyle, color: "#b91c1c", borderColor: "#fecaca" }}
                                                onClick={() => eliminarTodosEval360IndicadoresPlaneamiento(planeamientoId)}
                                                disabled={deletingEval360PlaneamientoId === planeamientoId}
                                              >
                                                {deletingEval360PlaneamientoId === planeamientoId ? "Eliminando..." : "Eliminar indicadores"}
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {!tieneIndicadoresGenerados && (
                                        <>
                                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                                            <label style={{ display: "grid", gap: "6px" }}>
                                              <span style={{ fontWeight: 700, color: "#0f172a" }}>Plantilla IA de indicadores</span>
                                              <select value={eval360PlantillaIaIndicadorId} onChange={(event) => setEval360PlantillaIaIndicadorId(event.target.value)}>
                                                <option value="">Usar plantilla activa recomendada</option>
                                                {eval360PlantillasIaIndicadores.map((plantilla) => (
                                                  <option key={plantilla.Id} value={plantilla.Id}>
                                                    {plantilla.NombrePlantilla}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>

                                            <label style={{ display: "grid", gap: "6px" }}>
                                              <span style={{ fontWeight: 700, color: "#0f172a" }}>Indicaciones para la IA</span>
                                              <textarea
                                                value={getEval360IndicacionesPlaneamiento(planeamientoId)}
                                                onChange={(event) => setEval360IndicacionesPorPlaneamiento((prev) => ({ ...prev, [planeamientoId]: event.target.value }))}
                                                rows={3}
                                                placeholder="Ejemplo: redactar los niveles con lenguaje sencillo, observable y alineado al MEP."
                                                style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px" }}
                                              />
                                            </label>
                                          </div>

                                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                            <button
                                              type="button"
                                              className="primary-btn"
                                              onClick={() => generarEval360IndicadoresDesdePlaneamiento(planeamientoId)}
                                              disabled={generatingEval360PlaneamientoId === planeamientoId}
                                            >
                                              {generatingEval360PlaneamientoId === planeamientoId ? "Generando indicadores..." : "Generar indicadores con IA"}
                                            </button>
                                          </div>
                                        </>
                                      )}

                                      {!indicadoresMinimizados && (
                                        indicadoresPlaneamiento.length > 0 ? (
                                          <div style={{ display: "grid", gap: "10px" }}>
                                            {getIndicadoresAgrupadosPorBase(indicadoresPlaneamiento).map((grupoIndicadores, grupoIndex) => {
                                              const principal = getIndicadorPrincipal(grupoIndicadores);
                                              if (!principal) return null;

                                              return (
                                                <div key={`${principal.IndicadorBase}-${grupoIndex}`} style={{ display: "grid", gap: "10px", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "12px", background: "#ffffff" }}>
                                                  <div style={{ display: "grid", gap: "6px" }}>
                                                    <strong style={{ color: "#334155" }}>Indicador base del planeamiento</strong>
                                                    <div style={{ padding: "10px", borderRadius: "10px", background: "#f1f5f9", color: "#0f172a" }}>
                                                      {principal.IndicadorBase}
                                                    </div>
                                                  </div>

                                                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "12px", background: "#f8fafc" }}>
                                                    {[
                                                      { key: "Cotidiano", label: "Trabajo cotidiano" },
                                                      { key: "Tareas", label: "Tareas" },
                                                      { key: "TablaEspecificaciones", label: "Tabla de especificaciones" }
                                                    ].map((item) => {
                                                      const indicadorTipo = getIndicadorPorTipo(grupoIndicadores, item.key);
                                                      const checked = indicadorTipo ? indicadorTipo.Activo !== false && indicadorTipo.Activo !== 0 : false;

                                                      return (
                                                        <label key={item.key} style={{ display: "flex", gap: "6px", alignItems: "center", color: "#0f172a", fontWeight: 600 }}>
                                                          <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={!indicadorTipo}
                                                            onChange={(event) => updateEval360GrupoIndicadorPlaneamientoLocal(planeamientoId, grupoIndicadores, "Activo", event.target.checked, item.key)}
                                                          />
                                                          {item.label}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>

                                                  <label style={{ display: "grid", gap: "6px" }}>
                                                    <span style={{ fontWeight: 700, color: "#166534" }}>Avanzado</span>
                                                    <textarea
                                                      value={principal.IndicadorAvanzado || ""}
                                                      onChange={(event) => updateEval360GrupoIndicadorPlaneamientoLocal(planeamientoId, grupoIndicadores, "IndicadorAvanzado", event.target.value)}
                                                      rows={2}
                                                      style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px" }}
                                                    />
                                                  </label>

                                                  <label style={{ display: "grid", gap: "6px" }}>
                                                    <span style={{ fontWeight: 700, color: "#92400e" }}>Intermedio</span>
                                                    <textarea
                                                      value={principal.IndicadorIntermedio || ""}
                                                      onChange={(event) => updateEval360GrupoIndicadorPlaneamientoLocal(planeamientoId, grupoIndicadores, "IndicadorIntermedio", event.target.value)}
                                                      rows={2}
                                                      style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px" }}
                                                    />
                                                  </label>

                                                  <label style={{ display: "grid", gap: "6px" }}>
                                                    <span style={{ fontWeight: 700, color: "#991b1b" }}>Inicial</span>
                                                    <textarea
                                                      value={principal.IndicadorInicial || ""}
                                                      onChange={(event) => updateEval360GrupoIndicadorPlaneamientoLocal(planeamientoId, grupoIndicadores, "IndicadorInicial", event.target.value)}
                                                      rows={2}
                                                      style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px" }}
                                                    />
                                                  </label>

                                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                                    <button
                                                      type="button"
                                                      style={{ ...secondaryButtonStyle, color: "#b91c1c", borderColor: "#fecaca" }}
                                                      onClick={() => eliminarEval360GrupoIndicadores(grupoIndicadores, planeamientoId)}
                                                      disabled={savingEval360IndicadorId === principal.IndicadorGrupoId || savingEval360PlaneamientoCambiosId === planeamientoId}
                                                    >
                                                      {savingEval360IndicadorId === principal.IndicadorGrupoId ? "Eliminando..." : "Eliminar"}
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div style={{ padding: "12px", borderRadius: "12px", background: "#f8fafc", color: "#475569", border: "1px dashed #cbd5e1" }}>
                                            Todavía no hay indicadores generados para este planeamiento.
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activePanel === "examenes_tabla" && (
              <PanelErrorBoundary title="1: Tabla de Especificaciones">
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #1f3b63", borderRadius: "16px", background: "linear-gradient(180deg, #081a33 0%, #0b2342 100%)", color: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "#f8fafc", fontWeight: 900, fontSize: "20px" }}>Tabla de Espesificaciones y Examenes</h4>
                    <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700 }}>
                      Gestioná la matriz y las tablas por prueba.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      setTablaEspecificacionesFormOpen((prev) => !prev);
                      setTablaEspecificacionEditando(true);
                      setTablaFormatoMinimizado(false);
                    }}
                    disabled={loadingSeguimiento || !selected}
                  >
                    {tablaEspecificacionesFormOpen ? "Ocultar tabla de especificaciones" : "Agregar tabla de especificaciones"}
                  </button>
                </div>

                {loadingSeguimiento ? (
                  <div style={{ padding: "12px", borderRadius: "12px", background: "#0b305f", border: "1px solid #3b82f6", color: "#dbeafe", fontWeight: 700 }}>
                    Cargando exámenes e indicadores...
                  </div>
                ) : null}

                <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #1f3b63", background: "#0b2342" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <strong style={{ color: "#f8fafc" }}>Lista de Tablas de especificaciones guardadas</strong>
                  </div>
                  {!tablaPruebasGuardadas.length ? (
                    <small style={{ color: "#cbd5e1" }}>No hay tablas de especificaciones creadas.</small>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {tablaPruebasGuardadas.map((actividad) => {
                        const idx = tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividad.ActividadId));
                        return (
                          <div key={`tabla-guardada-${actividad.ActividadId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", border: "1px solid #2b4e7a", borderRadius: "10px", padding: "8px 10px", background: "#0a1f3d" }}>
                            <span style={{ color: "#f8fafc", fontWeight: 700 }}>{getPruebaLabel(actividad, idx)}</span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                type="button"
                                style={secondaryButtonStyle}
                                onClick={() => descargarTablaEspecificacionesExcel(Number(actividad.ActividadId))}
                                disabled={savingSeguimiento}
                              >
                                Descargar
                              </button>
                              <button
                                type="button"
                                style={secondaryButtonStyle}
                                onClick={() => {
                                  setTablaEspecificacionesFormOpen(true);
                                  setTablaEditandoActividadId(Number(actividad.ActividadId));
                                  setTablaPruebaSeleccionadaId(String(actividad.ActividadId));
                                  setTablaEspecificacionEditando(true);
                                }}
                                disabled={savingSeguimiento}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                style={{ ...secondaryButtonStyle, borderColor: "#fecaca", color: "#991b1b" }}
                                onClick={() => eliminarTablaEspecificaciones(Number(actividad.ActividadId))}
                                disabled={savingSeguimiento}
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: "10px", padding: "12px", borderRadius: "12px", border: "1px solid #1f3b63", background: "#0b2342" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <strong style={{ color: "#f8fafc" }}>Crear Examenes</strong>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        setCrearExamenesOpen((prev) => !prev);
                        if (!plantillasExamenIa.length) loadPlantillasExamenIa();
                      }}
                    >
                      {crearExamenesOpen ? "Ocultar creación de exámenes" : "Crear Examenes"}
                    </button>
                  </div>

                  {crearExamenesOpen ? (
                    <div style={{ display: "grid", gap: "10px", fontSize: "15px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px" }}>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "16px" }}>Materia</span>
                          <input value={selected?.MateriaNombre || ""} readOnly style={{ color: "#0f172a", background: "#e2e8f0", border: "1px solid #94a3b8", borderRadius: "10px", padding: "10px 12px", fontSize: "15px" }} />
                        </label>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "16px" }}>Grado</span>
                          <input value={selected?.GrupoNivel || ""} readOnly style={{ color: "#0f172a", background: "#e2e8f0", border: "1px solid #94a3b8", borderRadius: "10px", padding: "10px 12px", fontSize: "15px" }} />
                        </label>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "16px" }}>Tipo de colegio</span>
                          <select value={examenIaDraft.tipoColegio || ""} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, tipoColegio: e.target.value }))} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "10px 12px", fontSize: "15px" }}>
                            <option value="">Seleccionar tipo</option>
                            <option value="Académico">Académico</option>
                            <option value="Técnico">Técnico</option>
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "16px" }}>Fuente Word</span>
                          <select value={examenIaDraft.fuenteWord} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, fuenteWord: e.target.value }))} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "10px 12px", fontSize: "15px" }}>
                            <option value="Calibri">Calibri</option>
                            <option value="Arial">Arial</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Cambria">Cambria</option>
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: "16px" }}>Tamaño de letra</span>
                          <input
                            type="number"
                            min={8}
                            max={18}
                            step={1}
                            value={examenIaDraft.tamanoWord}
                            onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, tamanoWord: e.target.value.replace(/[^\d]/g, "") }))}
                            style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "10px 12px", fontSize: "15px" }}
                          />
                        </label>
                      </div>

                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Secciones (todas o algunas)</span>
                        <label style={{ color: "#cbd5e1", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="checkbox"
                            checked={examenIaDraft.seccionIds.length > 0 && examenIaDraft.seccionIds.length === getSeccionesExamenDisponibles().length}
                            onChange={(event) =>
                              setExamenIaDraft((prev) => ({
                                ...prev,
                                seccionIds: event.target.checked ? getSeccionesExamenDisponibles().map((g) => String(g.GrupoId)) : []
                              }))
                            }
                          />
                          Seleccionar todas
                        </label>
                        <select
                          multiple
                          size={4}
                          value={examenIaDraft.seccionIds}
                          onChange={(event) => setExamenIaDraft((prev) => ({ ...prev, seccionIds: Array.from(event.target.selectedOptions).map((o) => o.value) }))}
                          style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                        >
                          {getSeccionesExamenDisponibles().map((g) => (
                            <option key={`sec-ex-${g.GrupoId}`} value={g.GrupoId}>{g.GrupoNombre}</option>
                          ))}
                        </select>
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "10px" }}>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700 }}>Plantilla de exámenes (mía/pública)</span>
                          <select value={examenIaDraft.plantillaId} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, plantillaId: e.target.value }))} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}>
                            <option value="">{loadingPlantillasExamenIa ? "Cargando..." : "Seleccionar plantilla"}</option>
                            {plantillasExamenIa.map((p) => (
                              <option key={`plt-ex-${p.Id}`} value={p.Id}>{p.NombrePlantilla}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700 }}>Tabla de especificaciones</span>
                          <select value={examenIaDraft.tablaId} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, tablaId: e.target.value }))} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}>
                            <option value="">Seleccionar tabla</option>
                            {getTablasEspecificacionesOpciones().map((t) => (
                              <option key={`tbl-opt-${t.id}`} value={t.id}>{t.nombre}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Archivo con formato de salida</span>
                        <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, archivoFormato: e.target.files?.[0] || null }))} style={{ color: "#f8fafc" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Indicaciones, consideraciones o premisas para la IA (opcional)</span>
                        <textarea rows={3} value={examenIaDraft.indicaciones} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, indicaciones: e.target.value }))} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Documento de apoyo (opcional, pero mandatorio si se adjunta)</span>
                        <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, documentoApoyo: e.target.files?.[0] || null }))} style={{ color: "#f8fafc" }} />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Nombre del examen</span>
                        <input value={examenIaDraft.nombre} onChange={(e) => setExamenIaDraft((prev) => ({ ...prev, nombre: e.target.value }))} placeholder="Prueba XX-Grado-Materia, periodo" style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} />
                      </label>
                      {examenIaGeneradoId || editingExamenId ? (
                        <label style={{ display: "grid", gap: "6px" }}>
                          <span style={{ color: "#f8fafc", fontWeight: 700 }}>Resultado generado (editable)</span>
                          <textarea rows={12} value={examenIaResultadoDraft} onChange={(e) => setExamenIaResultadoDraft(e.target.value)} style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} />
                        </label>
                      ) : null}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" className="primary-btn" onClick={guardarExamenCreado} disabled={generandoExamenIa}>
                          {generandoExamenIa ? "Generando..." : (examenIaGeneradoId || editingExamenId ? "Guardar examen" : "Generar examen")}
                        </button>
                        {examenIaGeneradoId || editingExamenId ? (
                          <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord(editingExamenId || examenIaGeneradoId)}>
                            Generar Word
                          </button>
                        ) : null}
                        {examenIaGeneradoId || editingExamenId ? (
                          <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord((editingExamenId || examenIaGeneradoId), "respuestas")}>
                            Word Respuestas
                          </button>
                        ) : null}
                        <button type="button" style={secondaryButtonStyle} onClick={() => { setCrearExamenesOpen(false); setExamenIaGeneradoId(""); setExamenIaResultadoDraft(""); setEditingExamenId(""); }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#f8fafc" }}>Exámenes creados</strong>
                      <button type="button" style={secondaryButtonStyle} onClick={() => setExamenesCreadosOculto((prev) => !prev)}>
                        {examenesCreadosOculto ? "Mostrar" : "Ocultar"}
                      </button>
                    </div>
                    {examenesCreadosOculto ? (
                      <small style={{ color: "#cbd5e1" }}>Lista oculta.</small>
                    ) : !examenesCreados.length ? (
                      <small style={{ color: "#cbd5e1" }}>Aún no hay exámenes creados.</small>
                    ) : (
                      <div style={{ overflowX: "auto", border: "1px solid #2b4e7a", borderRadius: "10px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0", background: "#0a1f3d", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ background: "#12345e" }}>
                              <th style={{ padding: "8px", textAlign: "left" }}>Nombre</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Materia/Grado</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Tabla</th>
                              <th style={{ padding: "8px", textAlign: "left" }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {examenesCreados.map((ex) => (
                              <tr key={ex.id}>
                                <td style={{ padding: "8px", borderTop: "1px solid #1f3b63" }}>{ex.nombre}</td>
                                <td style={{ padding: "8px", borderTop: "1px solid #1f3b63" }}>{ex.materia} / {ex.grado}</td>
                                <td style={{ padding: "8px", borderTop: "1px solid #1f3b63" }}>{ex.tablaNombre}</td>
                                <td style={{ padding: "8px", borderTop: "1px solid #1f3b63" }}>
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    <button type="button" style={secondaryButtonStyle} onClick={() => { setEditingExamenId(ex.id); setExamenIaGeneradoId(""); setExamenIaResultadoDraft(ex.resultadoIA || ""); setExamenIaDraft((prev) => ({ ...prev, nombre: ex.nombre, indicaciones: ex.indicaciones })); setCrearExamenesOpen(true); }}>Editar</button>
                                    <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord(ex.id)}>Examen</button>
                                    <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord(ex.id, "respuestas")}>Resp. Examen</button>
                                    <button
                                      type="button"
                                      style={{ ...secondaryButtonStyle, borderColor: "#fecaca", color: "#991b1b" }}
                                      onClick={async () => {
                                        try {
                                          await api.delete(`/eval360/examenes-ia/${ex.id}`);
                                          await loadExamenesIa();
                                        } catch (error: any) {
                                          setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el examen");
                                        }
                                      }}
                                    >
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {tablaEspecificacionesFormOpen && !crearExamenesOpen ? (
                <>
                <label style={{ display: "grid", gap: "6px", maxWidth: "420px" }}>
                  <span style={{ color: "#f8fafc", fontWeight: 700 }}>Paso 1.1: Seleccionar uno o varios planeamientos</span>
                  <select
                    multiple
                    size={Math.min(6, Math.max(3, (seguimientoContexto?.planeamientos || []).length || 3))}
                    style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                    value={tablaPlaneamientoIds}
                    onChange={(event) => {
                      const ids = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                      setTablaPlaneamientoIds(ids);
                    }}
                  >
                    {(seguimientoContexto?.planeamientos || []).map((planeamiento) => (
                      <option key={planeamiento.PlaneamientoId} value={planeamiento.PlaneamientoId}>{planeamiento.Nombre}</option>
                    ))}
                  </select>
                  <small style={{ color: "#cbd5e1" }}>Podés seleccionar uno o varios planeamientos.</small>
                </label>

                <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #1f3b63", background: "#0b2342" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#f8fafc" }}>Paso 1.2: Matriz de asignación por prueba</strong>
                      <span style={{ background: tablaHayAsignacionesMatriz ? "#dcfce7" : "#fef3c7", color: tablaHayAsignacionesMatriz ? "#166534" : "#92400e", border: `1px solid ${tablaHayAsignacionesMatriz ? "#86efac" : "#fcd34d"}`, borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                        {tablaHayAsignacionesMatriz ? "Matriz con asignaciones" : "Pendiente de asignar"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={guardarMatrizAsignacionPruebas}
                        disabled={savingSeguimiento || !tablaActividadesExamen.length || !tablaMatrizEditando}
                      >
                        {savingSeguimiento ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => setTablaMatrizEditando(true)}
                        disabled={savingSeguimiento || !tablaActividadesExamen.length}
                      >
                        Editar
                      </button>
                      <button type="button" style={secondaryButtonStyle} onClick={() => setTablaMatrizMinimizada(true)}>Minimizar</button>
                      <button type="button" style={secondaryButtonStyle} onClick={() => setTablaMatrizMinimizada(false)}>Maximizar</button>
                    </div>
                  </div>
                  <small style={{ color: "#cbd5e1" }}>
                    Marcá en qué prueba se evalúa cada indicador. En esta pantalla solo se hace la asignación.
                  </small>
                  {!tablaMatrizEditando ? (
                    <small style={{ color: "#92400e", fontWeight: 700 }}>
                      Indicadores bloqueados después de guardar. Usá "Editar" para habilitar cambios.
                    </small>
                  ) : null}

                  {tablaMatrizMinimizada ? (
                    <div style={{ padding: "10px", border: "1px dashed #2b4e7a", borderRadius: "10px", color: "#cbd5e1", background: "#0a1f3d" }}>
                      Matriz minimizada. Hay {tablaIndicadoresEspecificaciones.length} indicadores y {tablaActividadesExamen.length} pruebas disponibles.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#e2e8f0" }}>
                            <th style={{ padding: "8px", textAlign: "left", minWidth: "260px" }}>Aprendizaje / Indicador</th>
                            {tablaActividadesExamen.map((actividad) => (
                              <th key={`tabla-head-${actividad.ActividadId}`} style={{ padding: "8px", textAlign: "center", minWidth: "220px" }}>
                                <div style={{ fontWeight: 800 }}>{getPruebaLabel(actividad, tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividad.ActividadId)))}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tablaIndicadoresRender.map((indicador) => {
                            const indicadorId = Number(indicador.IndicadorGrupoId);
                            const bloqueado = !tablaMatrizEditando || seguimientoIndicadorTieneCalificacion(indicadorId) || tablaIndicadoresUsadosGuardados.has(indicadorId);
                            return (
                              <tr key={`tabla-ind-${indicadorId}`}>
                                <td style={{ padding: "8px", borderTop: "1px solid #e2e8f0" }}>
                                  <div style={{ fontWeight: 700 }}>{indicador.IndicadorBase}</div>
                                  <small style={{ color: "#64748b" }}>{indicador.PlaneamientoNombre || "Planeamiento"}</small>
                                </td>
                                {tablaActividadesExamen.map((actividad) => {
                                  const actividadId = Number(actividad.ActividadId);
                                  const checked = getTablaIndicadoresAsignadosActividad(actividadId).includes(indicadorId);
                                  return (
                                    <td key={`tabla-${indicadorId}-${actividadId}`} style={{ textAlign: "center", padding: "8px", borderTop: "1px solid #e2e8f0" }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={bloqueado}
                                        onChange={(event) => toggleTablaIndicadorActividad(indicadorId, actividadId, event.target.checked)}
                                        style={{ width: "18px", height: "18px", accentColor: "#2563eb" }}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {!tablaIndicadoresRender.length ? (
                            <tr>
                              <td colSpan={Math.max(2, tablaActividadesExamen.length + 1)} style={{ padding: "10px", color: "#64748b" }}>
                                No hay indicadores de tipo Tabla de especificaciones para asignar.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {tablaIndicadoresEspecificaciones.length > tablaIndicadoresRender.length ? (
                    <small style={{ color: "#fbbf24" }}>
                      Se muestran {tablaIndicadoresRender.length} de {tablaIndicadoresEspecificaciones.length} indicadores para evitar bloqueo de pantalla.
                    </small>
                  ) : null}
                </div>

                {Number(tablaPruebaSeleccionadaId || 0) > 0 ? (
                  <div style={{ display: "grid", gap: "10px", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "12px", background: "#ffffff", color: "#0f172a", opacity: tablaEspecificacionEditando ? 1 : 0.75, pointerEvents: tablaEspecificacionEditando ? "auto" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong style={{ color: "#0f172a" }}>Paso 1.3: Asignación de Puntaje a los Indicadores</strong>
                        <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                          Pendientes: {tablaPruebasPendientes.length}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" className="primary-btn" onClick={guardarAsignacionTablaEspecificaciones} disabled={savingSeguimiento || !tablaActividadesExamen.length || !tablaHayAsignacionesMatriz || !tablaValidacionPruebaSeleccionada.coincide || !tablaEspecificacionEditando}>
                          {savingSeguimiento ? "Guardando..." : "Guardar"}
                        </button>
                        <button type="button" style={secondaryButtonStyle} onClick={() => setTablaEspecificacionEditando(true)} disabled={savingSeguimiento || !tablaActividadesExamen.length}>
                          Editar
                        </button>
                        <button type="button" style={{ ...secondaryButtonStyle, borderColor: "#fecaca", color: "#991b1b" }} onClick={() => eliminarTablaEspecificaciones(Number(tablaPruebaSeleccionadaId || tablaEditandoActividadId || 0) || undefined)} disabled={savingSeguimiento || (!tablaEspecificacionesGuardadas && !tablaEditandoActividadId)}>
                          Eliminar
                        </button>
                        <button type="button" style={secondaryButtonStyle} onClick={() => setTablaFormatoMinimizado(true)}>Minimizar</button>
                        <button type="button" style={secondaryButtonStyle} onClick={() => setTablaFormatoMinimizado(false)}>Maximizar</button>
                      </div>
                    </div>
                    <div style={{ marginBottom: "2px", color: "#334155", fontWeight: 700 }}>
                      Nombre de guardado: {getNombreGuardadoTabla()}
                    </div>
                    {!tablaValidacionPruebaSeleccionada.coincide ? (
                      <div style={{ marginBottom: "6px", color: "#991b1b", fontWeight: 700 }}>
                        {tablaValidacionPruebaSeleccionada.filasIncompletas > 0
                        ? `No se puede guardar: hay ${tablaValidacionPruebaSeleccionada.filasIncompletas} fila(s) incompleta(s). Debés indicar ítem, cantidad de preguntas y puntos del indicador (si cantidad >= 1, el valor no puede ser 0).`
                        : !tablaValidacionPruebaSeleccionada.cumpleMinimoPorcentaje
                        ? `No se puede guardar: el total de puntos (${tablaValidacionPruebaSeleccionada.totalCalculado.toFixed(2)}) debe ser mayor o igual al porcentaje de la prueba (${tablaValidacionPruebaSeleccionada.minimoPorcentaje.toFixed(2)}).`
                        : (tablaTipoFormato === "ANTES"
                        ? `No se puede guardar: el total de puntos calculado (${tablaValidacionPruebaSeleccionada.totalCalculado.toFixed(2)}) no coincide con el esperado de la prueba (${tablaValidacionPruebaSeleccionada.esperado.toFixed(2)}).`
                        : `No se puede guardar: el total de puntos ingresado (${tablaValidacionPruebaSeleccionada.totalCalculado.toFixed(2)}) debe coincidir exactamente con el valor de la prueba (${tablaValidacionPruebaSeleccionada.esperado.toFixed(2)}).`)}
                      </div>
                    ) : null}
                    {!tablaEspecificacionEditando ? (
                      <small style={{ color: "#475569", fontWeight: 700 }}>Modo lectura. Usá "Editar tabla de especificaciones" para habilitar cambios.</small>
                    ) : null}
                    {tablaFormatoMinimizado ? (
                      <div style={{ padding: "10px", border: "1px dashed #cbd5e1", borderRadius: "10px", color: "#475569", background: "#f8fafc" }}>
                        Formato 7.3 minimizado.
                      </div>
                    ) : (
                    <>
                    <label style={{ display: "grid", gap: "6px", maxWidth: "320px" }}>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>Prueba</span>
                      <select
                        value={tablaPruebaSeleccionadaId}
                        onChange={(event) => setTablaPruebaSeleccionadaId(event.target.value)}
                        style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                        disabled={!tablaHayAsignacionesMatriz}
                      >
                        <option value="">{tablaHayAsignacionesMatriz ? "Seleccionar prueba pendiente" : "Guardá primero la matriz de asignación"}</option>
                          {(tablaEditandoActividadId
                            ? tablaActividadesExamen.filter((a) => Number(a.ActividadId) === Number(tablaEditandoActividadId))
                            : tablaPruebasPendientes
                          ).map((actividad, idx) => (
                          <option key={`prueba-${actividad.ActividadId}`} value={actividad.ActividadId}>
                            {getPruebaLabel(actividad, tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividad.ActividadId)))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px", maxWidth: "320px" }}>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>Tipo</span>
                      <select
                        value={tablaTipoFormato}
                        onChange={(event) => setTablaTipoFormato((event.target.value as any) === "DESPUES" ? "DESPUES" : "ANTES")}
                        style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                      >
                        <option value="ANTES">Antes de la Prueba</option>
                        <option value="DESPUES">Después de la Prueba</option>
                      </select>
                    </label>
                    {tablaTipoFormato === "DESPUES" && Number(tablaPruebaSeleccionadaId || 0) > 0 ? (
                      <label style={{ display: "grid", gap: "6px", maxWidth: "320px" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>Valor total de la prueba</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={tablaPuntosTotalesPrueba[Number(tablaPruebaSeleccionadaId)] || ""}
                          onChange={(event) => setTablaPuntosTotalesPrueba((prev) => ({ ...prev, [Number(tablaPruebaSeleccionadaId)]: event.target.value }))}
                          placeholder="Ej: 20"
                          style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                        />
                      </label>
                    ) : null}
                    <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", color: "#0f172a", background: "#ffffff" }}>
                        <thead>
                          <tr style={{ background: "#dbeafe" }}>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "200px", fontSize: "16px" }}>Aprendizaje</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "260px", fontSize: "16px" }}>Indicadores</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "110px" }}>Número de lecciones</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "80px" }}>Puntos</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Selección de respuesta</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Respuesta corta</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Correspondencia</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Identificación</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Resolución de ejercicios</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Resolución de problemas</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Respuesta restringida</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Resolución de casos</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Producción escrita</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const indicadoresPrueba = getIndicadoresPruebaSeleccionada();
                            const totalLecciones = getTotalLeccionesPruebaSeleccionada(indicadoresPrueba);
                            const actividadIdSeleccionada = Number(tablaPruebaSeleccionadaId || 0);
                            const actividadSeleccionada = tablaActividadesExamen.find((a) => Number(a.ActividadId) === actividadIdSeleccionada);
                            const puntosEsperadosBase = Number(actividadSeleccionada?.PuntosMaximos || 0);
                            const puntosEsperadosManual = Number(String(tablaPuntosTotalesPrueba[actividadIdSeleccionada] || "").replace(",", "."));
                            const puntosEsperadosPrueba = (tablaTipoFormato === "DESPUES" && Number.isFinite(puntosEsperadosManual) && puntosEsperadosManual > 0)
                              ? puntosEsperadosManual
                              : puntosEsperadosBase;
                            const totalLeccionesAntes = indicadoresPrueba.reduce((acc, it) => acc + getLeccionesPorItems(getTablaDetalle(actividadIdSeleccionada, Number(it.IndicadorGrupoId))), 0);
                            const totalPuntosAntes = indicadoresPrueba.reduce((acc, it) => acc + getPuntosPorItems(getTablaDetalle(actividadIdSeleccionada, Number(it.IndicadorGrupoId))), 0);
                            const contadorPorPlaneamiento: Record<number, number> = {};
                            const rows = indicadoresPrueba.map((indicador, idx) => {
                            const actividadId = Number(tablaPruebaSeleccionadaId || 0);
                            const detalle = getTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId));
                            const planeamientoId = Number(indicador.PlaneamientoId || 0);
                            const aprendizajesPlaneamiento = tablaAprendizajesPorPlaneamiento.get(planeamientoId) || [];
                            const indicePlaneamiento = contadorPorPlaneamiento[planeamientoId] || 0;
                            const aprendizaje = aprendizajesPlaneamiento[indicePlaneamiento] || aprendizajesPlaneamiento[0] || indicador.PlaneamientoNombre || "Aprendizaje esperado";
                            contadorPorPlaneamiento[planeamientoId] = indicePlaneamiento + 1;
                            const puntosFormula = tablaTipoFormato === "ANTES"
                              ? getPuntosPorItems(detalle)
                              : (Number.isFinite(totalLecciones) && totalLecciones > 0
                                  ? Math.round((puntosEsperadosPrueba / totalLecciones) * (Number(String(detalle.numeroLecciones || "0").replace(",", ".")) || 0))
                                  : 0);
                            const leccionesFormulaRaw = tablaTipoFormato === "ANTES"
                              ? (totalPuntosAntes > 0 ? (puntosFormula * (Number.isFinite(totalLeccionesAntes) ? totalLeccionesAntes : 0)) / totalPuntosAntes : 0)
                              : Number(String(detalle.numeroLecciones || "0").replace(",", ".")) || 0;
                            const leccionesFormula = tablaTipoFormato === "ANTES"
                              ? Math.round(Number(leccionesFormulaRaw || 0))
                              : leccionesFormulaRaw;
                            const itemCampos = getDetalleCamposItems(detalle);
                            const sinPuntosAntes = tablaTipoFormato === "ANTES" && !(Number.isFinite(puntosFormula) && puntosFormula > 0);
                            const leccionesManualNum = Number(String(detalle.numeroLecciones || "0").replace(",", "."));
                            const sumaItemsFila = getPuntosPorItems(detalle);
                            const filaIncompleta = itemCampos.some((c) => isItemParIncompleto(c.cantidad, c.valor))
                              || (tablaTipoFormato === "DESPUES" && (!Number.isInteger(leccionesManualNum) || leccionesManualNum <= 0 || Number(sumaItemsFila) !== Number(puntosFormula)))
                              || sinPuntosAntes;
                            return (
                              <tr key={`fmt-${indicador.IndicadorGrupoId}-${idx}`} style={{ background: filaIncompleta ? "#fff1f2" : (idx % 2 === 0 ? "#ffffff" : "#f8fbff") }}>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", fontSize: "15px" }}>{aprendizaje}</td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", fontSize: "15px" }}>{indicador.IndicadorBase}</td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={tablaTipoFormato === "ANTES" ? String(Math.round(Number(leccionesFormula || 0))) : String(Number(leccionesFormula || 0))}
                                    readOnly={tablaTipoFormato === "ANTES"}
                                    onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "numeroLecciones", e.target.value)}
                                    title={tablaTipoFormato === "ANTES" ? "Número de lecciones calculado automáticamente." : "Número de lecciones del indicador (entero mayor a 0)."}
                                    style={{ width: "80px", textAlign: "center", background: tablaTipoFormato === "ANTES" ? "#f1f5f9" : "#ffffff" }}
                                  />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={String(Number(puntosFormula || 0))}
                                    readOnly
                                    title={tablaTipoFormato === "ANTES" ? "Puntos del indicador calculados desde ítems (cantidad x valor)." : "Puntos del indicador calculados con la fórmula: (puntos totales / lecciones totales) * lecciones del indicador."}
                                    style={{ width: "80px", textAlign: "center", background: "#f1f5f9" }}
                                  />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Selección de respuesta: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.seleccionRespuestaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "seleccionRespuestaCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Selección de respuesta: Valor por pregunta" type="text" inputMode="numeric" value={detalle.seleccionRespuestaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "seleccionRespuestaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Respuesta corta: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.respuestaCortaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaCortaCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Respuesta corta: Valor por pregunta" type="text" inputMode="numeric" value={detalle.respuestaCortaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaCortaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Correspondencia: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.correspondenciaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "correspondenciaCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Correspondencia: Valor por pregunta" type="text" inputMode="numeric" value={detalle.correspondenciaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "correspondenciaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Identificación: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.identificacionCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "identificacionCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Identificación: Valor por pregunta" type="text" inputMode="numeric" value={detalle.identificacionPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "identificacionPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Resolución de ejercicios: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.resolucionEjerciciosCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionEjerciciosCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Resolución de ejercicios: Valor por pregunta" type="text" inputMode="numeric" value={detalle.resolucionEjerciciosPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionEjerciciosPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Resolución de problemas: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.resolucionProblemasCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionProblemasCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Resolución de problemas: Valor por pregunta" type="text" inputMode="numeric" value={detalle.resolucionProblemasPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionProblemasPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Respuesta restringida: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.respuestaRestringidaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaRestringidaCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Respuesta restringida: Valor por pregunta" type="text" inputMode="numeric" value={detalle.respuestaRestringidaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaRestringidaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Resolución de casos: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.resolucionCasosCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionCasosCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Resolución de casos: Valor por pregunta" type="text" inputMode="numeric" value={detalle.resolucionCasosPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionCasosPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Producción escrita: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.produccionEscritaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "produccionEscritaCantidad", e.target.value)} style={{ width: "54px" }} />
                                  <input title="Producción escrita: Valor por pregunta" type="text" inputMode="numeric" value={detalle.produccionEscritaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "produccionEscritaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px" }} />
                                </td>
                              </tr>
                            );
                          });
                          const totalLeccionesMostradas = tablaTipoFormato === "ANTES"
                            ? indicadoresPrueba.reduce((acc, indicador) => {
                                const d = getTablaDetalle(actividadIdSeleccionada, Number(indicador.IndicadorGrupoId));
                                const p = getPuntosPorItems(d);
                                const raw = totalPuntosAntes > 0 ? (p * (Number.isFinite(totalLeccionesAntes) ? totalLeccionesAntes : 0)) / totalPuntosAntes : 0;
                                return acc + Math.round(Number(raw || 0));
                              }, 0)
                            : Number(totalLecciones || 0);
                          const sumItem = (cantidadKey: string, puntosKey: string) => {
                            const preguntas = indicadoresPrueba.reduce((acc, indicador) => {
                              const d = getTablaDetalle(actividadIdSeleccionada, Number(indicador.IndicadorGrupoId));
                              return acc + (Number(String((d as any)[cantidadKey] || "").replace(",", ".")) || 0);
                            }, 0);
                            const puntos = indicadoresPrueba.reduce((acc, indicador) => {
                              const d = getTablaDetalle(actividadIdSeleccionada, Number(indicador.IndicadorGrupoId));
                              const cantidad = Number(String((d as any)[cantidadKey] || "").replace(",", ".")) || 0;
                              const valor = Number(String((d as any)[puntosKey] || "").replace(",", ".")) || 0;
                              return acc + (cantidad * valor);
                            }, 0);
                            return { preguntas, puntos };
                          };
                          const totalSR = sumItem("seleccionRespuestaCantidad", "seleccionRespuestaPuntos");
                          const totalRC = sumItem("respuestaCortaCantidad", "respuestaCortaPuntos");
                          const totalC = sumItem("correspondenciaCantidad", "correspondenciaPuntos");
                          const totalI = sumItem("identificacionCantidad", "identificacionPuntos");
                          const totalRE = sumItem("resolucionEjerciciosCantidad", "resolucionEjerciciosPuntos");
                          const totalRP = sumItem("resolucionProblemasCantidad", "resolucionProblemasPuntos");
                          const totalRR = sumItem("respuestaRestringidaCantidad", "respuestaRestringidaPuntos");
                          const totalRCas = sumItem("resolucionCasosCantidad", "resolucionCasosPuntos");
                          const totalPE = sumItem("produccionEscritaCantidad", "produccionEscritaPuntos");
                          rows.push(
                            <tr key="fmt-total-preg" style={{ background: "#e2e8f0", fontWeight: 800 }}>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1" }} colSpan={2}>Totales Preguntas</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center" }}>
                                {tablaTipoFormato === "ANTES" ? String(totalLeccionesMostradas) : Math.round(Number(totalLeccionesMostradas || 0))}
                              </td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center" }}></td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalSR.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRC.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalC.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalI.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRE.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRP.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRR.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRCas.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalPE.preguntas)}</td>
                            </tr>
                          );
                          rows.push(
                            <tr key="fmt-total-pts" style={{ background: "#dbe4f0", fontWeight: 800 }}>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1" }} colSpan={2}>Totales Puntos</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center" }}></td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center" }}>
                                {Math.round(
                                  indicadoresPrueba.reduce((acc, indicador) => acc + getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones), 0)
                                )}
                              </td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalSR.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRC.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalC.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalI.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRE.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRP.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRR.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalRCas.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px" }}>{Math.round(totalPE.puntos)}</td>
                            </tr>
                          );
                          const totalPuntosCalculado = Number(
                            indicadoresPrueba.reduce((acc, indicador) => acc + getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones), 0).toFixed(2)
                          );
                          const diferencia = Number((totalPuntosCalculado - puntosEsperadosPrueba).toFixed(2));
                          const coincideTotal = Math.abs(diferencia) < 0.01;
                          rows.push(
                            <tr key="fmt-validacion" style={{ background: coincideTotal ? "#ecfdf5" : "#fef2f2" }}>
                              <td colSpan={13} style={{ padding: "10px", border: "1px solid #cbd5e1", color: coincideTotal ? "#166534" : "#991b1b", fontWeight: 700 }}>
                                {tablaTipoFormato === "ANTES"
                                  ? `Validación de Antes de la Prueba: total de puntos calculado ${totalPuntosCalculado.toFixed(2)}.`
                                  : (Math.abs(totalPuntosCalculado - puntosEsperadosPrueba) < 0.01
                                      ? `Validación correcta: total de puntos ingresado ${totalPuntosCalculado.toFixed(2)} coincide con la prueba (${puntosEsperadosPrueba.toFixed(2)}).`
                                      : `Validación: total de puntos ingresado ${totalPuntosCalculado.toFixed(2)} debe coincidir exactamente con la prueba (${puntosEsperadosPrueba.toFixed(2)}).`)}
                              </td>
                            </tr>
                          );
                          return rows;
                          })()}
                        </tbody>
                      </table>
                    </div>
                    </>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: "12px", borderRadius: "12px", border: "1px dashed #2b4e7a", background: "#0a1f3d", color: "#cbd5e1", fontWeight: 700 }}>
                    {tablaPruebasPendientes.length
                      ? "Seleccioná una prueba pendiente para parametrizar su tabla de especificaciones."
                      : "No hay pruebas pendientes por parametrizar. Podés editar o eliminar una tabla ya guardada en el listado superior."}
                  </div>
                )}
                </>
                ) : (
                  <div style={{ padding: "12px", borderRadius: "12px", border: "1px dashed #2b4e7a", background: "#0a1f3d", color: "#cbd5e1", fontWeight: 700 }}>
                    Seleccioná "Agregar tabla de especificaciones".
                  </div>
                )}
              </div>
              </PanelErrorBoundary>
            )}

            {activePanel === "reportes" && (
              <div style={{ display: "grid", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ marginBottom: "4px" }}>Reportes del grupo</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      Resumen de notas, acumulado evaluado y asistencia según Artículo 37.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button type="button" style={secondaryButtonStyle} onClick={() => selected && loadAsistencia(selected)} disabled={loadingAsistencia}>
                      {loadingAsistencia ? "Actualizando..." : "Actualizar asistencia"}
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={exportarReporteCsv} disabled={resumenReportes.filas.length === 0}>
                      Exportar CSV
                    </button>
                    <button type="button" className="primary-btn" onClick={exportarReporteExcel} disabled={resumenReportes.filas.length === 0 || !selected}>
                      Exportar Excel
                    </button>
                    <button type="button" className="primary-btn" onClick={exportarReportePdf} disabled={resumenReportes.filas.length === 0 || !selected}>
                      PDF / Imprimir
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                  <div style={cardStyle}>
                    <strong>Estudiantes</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{resumenReportes.totalEstudiantes}</span>
                  </div>
                  <div style={cardStyle}>
                    <strong>Promedio acumulado</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{formatPercent(resumenReportes.promedioAcumulado)}</span>
                  </div>
                  <div style={cardStyle}>
                    <strong>Promedio asistencia</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{formatPercent(resumenReportes.promedioAsistencia)}</span>
                  </div>
                  <div style={cardStyle}>
                    <strong>Actividades evaluativas</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{detalle.actividades.length}</span>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th style={{ minWidth: "220px" }}>Estudiante</th>
                        <th>Identificación</th>
                        <th>Notas registradas</th>
                        <th>% acumulado evaluación</th>
                        <th>Lecciones registradas</th>
                        <th>Ausencias equivalentes</th>
                        <th>% ausencias</th>
                        <th>% asistencia Art. 37</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenReportes.filas.map((fila) => (
                        <tr key={fila.EstudianteId}>
                          <td>{fila.NombreCompleto}</td>
                          <td>{fila.Identificacion}</td>
                          <td>{fila.NotasRegistradas} / {fila.TotalActividades}</td>
                          <td><strong>{formatPercent(fila.AcumuladoEvaluacion)}</strong></td>
                          <td>{fila.TotalLecciones}</td>
                          <td>{fila.AusenciasEquivalentes.toFixed(2)}</td>
                          <td>{formatPercent(fila.PorcentajeAusencias)}</td>
                          <td><strong>{formatPercent(fila.PorcentajeAsistencia)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={helperDarkBoxStyle}>
                  <strong>Nota:</strong> el porcentaje de asistencia se calcula con las reglas del Artículo 37 usando las ausencias injustificadas equivalentes registradas hasta el momento.
                </div>
              </div>
            )}

            {activePanel === "notas" && detalle.plantilla && detalle.actividades.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
                  <div>
                    <h4 style={{ marginBottom: "4px" }}>Registro de notas</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      Digite notas de 0 a 100. El sistema calcula automáticamente el porcentaje ganado según el peso real de cada actividad.
                    </p>
                  </div>
                  <strong>Acumulado grupal: {formatPercent(resumenGrupo.totalPorcentaje)}</strong>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button type="button" className="primary-btn" onClick={handleSaveNotas} disabled={savingNotas || !detalle.plantilla || detalle.actividades.length === 0}>
                    {savingNotas ? "Guardando notas..." : "Guardar notas"}
                  </button>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style={stickyTableHeaderStyle}>Estudiante</th>
                      <th>Identificación</th>
                      {detalle.actividades.map((actividad) => (
                        <th key={actividad.EvaluacionActividadId} style={{ minWidth: "150px" }}>
                          <div style={{ display: "grid", gap: "4px" }}>
                            <span>{actividad.Descripcion}</span>
                            <small style={{ opacity: 0.7 }}>Vale {formatPercent(actividad.PorcentajeReal)}</small>
                          </div>
                        </th>
                      ))}
                      <th>% acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.estudiantes.map((estudiante) => {
                      const acumulado = calcularAcumuladoEstudiante(estudiante.EstudianteId);

                      return (
                        <tr key={estudiante.EstudianteId}>
                          <td style={stickyTableCellStyle}>{getFullName(estudiante)}</td>
                          <td>{estudiante.Identificacion}</td>
                          {detalle.actividades.map((actividad) => {
                            const value = getDraftValue(estudiante.EstudianteId, actividad.EvaluacionActividadId);
                            const porcentajeGanado = calcularPorcentajeGanado(estudiante.EstudianteId, actividad.EvaluacionActividadId);

                            return (
                              <td key={actividad.EvaluacionActividadId}>
                                <div style={{ display: "grid", gap: "4px" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={value}
                                    onChange={(e) => updateNotaDraft(estudiante.EstudianteId, actividad.EvaluacionActividadId, e.target.value)}
                                    onBlur={() => normalizeNotaOnBlur(estudiante.EstudianteId, actividad.EvaluacionActividadId)}
                                    placeholder="0-100"
                                    style={inputNotaStyle}
                                  />
                                  <small style={{ opacity: 0.75 }}>Gana: {formatPercent(porcentajeGanado)}</small>
                                </div>
                              </td>
                            );
                          })}
                          <td><strong>{formatPercent(acumulado)}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}













