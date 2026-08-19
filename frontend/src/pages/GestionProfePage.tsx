// @ts-nocheck
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";
import { getCostaRicaIsoDate, getCostaRicaIsoDateWithOffset } from "../utils/date";
import { getAdecuacionListHtmlStyle, getAdecuacionStyleKind } from "../utils/adecuacionStyles";
import { debePropagarPrimeraSeleccionAsistencia } from "../utils/asistenciaRules";
import {
  type ActivePanel,
  type Actividad,
  type ApoyoEducativoCatalogoItem,
  type ApoyoEducativoInformeItem,
  type ApoyoEducativoResumenItem,
  type ApoyoEducativoSeccion,
  type AsistenciaDraft,
  type AsistenciaLeccion,
  type AsistenciaNotificacionEstado,
  type AsistenciaRegistro,
  type AuditoriaEnvioFila,
  type BitacoraGestion,
  type BoletaConductaReporte,
  type Componente,
  type DetalleGrupo,
  type EstadoAsistencia,
  type EstudianteGrupo,
  type Eval360Detalle,
  type Eval360Estructura,
  type Eval360EstructuraData,
  type Eval360Indicador,
  type Eval360Nivel,
  type Eval360Plantilla,
  type ExamenIaCreado,
  type ExamenIaDraft,
  type GrupoProfesor,
  type HorarioBloque,
  type HorarioEntrada,
  type NivelDesempeno,
  type Nota,
  type NoteDrafts,
  type Planeamiento,
  type PlaneamientoForm,
  type PlaneamientoHabilidad,
  type PlaneamientoIaForm,
  type PlaneamientoReferenciaAnalisis,
  type PlaneamientoIaResultado,
  type PlaneamientoIndicador,
  type Plantilla,
  type PlantillaPromptIA,
  type ResumenAsistencia,
  type SeguimientoActividad,
  type SeguimientoActividadInformarDraft,
  type SeguimientoActividadInformarDrafts,
  type SeguimientoActividadPuntosMaximosDrafts,
  type SeguimientoAsistenciaRegistro,
  type SeguimientoDrafts,
  type SeguimientoEstado,
  type SeguimientoEvaluacionContexto,
  type SeguimientoEvaluacionDetalle,
  type SeguimientoExamenDraft,
  type SeguimientoExamenDrafts,
  type SeguimientoInformarDraft,
  type SeguimientoInformarDrafts,
  type SeguimientoNotaActividad,
  type TipoReporteGestion,
  PanelErrorBoundary,
  buildNoteKey,
  cardStyle,
  clampNota,
  compararGruposProfesor,
  deduplicarGruposProfesor,
  formatNota,
  formatPercent,
  getBloqueHorarioLabel,
  getCorreoHabilitadoEstudiante,
  getDetalleSeccionPlaneamiento,
  getEstadoSeguimientoLabel,
  getEstadoSeguimientoValor,
  getFullName,
  getGestionPanelButtonStyle,
  getGradoPlaneamientoFromGrupo,
  getNombreSeccionPlaneamiento,
  getSeguimientoActividadKey,
  getSeguimientoDraftKey,
  getTelefonoWhatsAppHabilitado,
  getTipoBloqueNoLectivo,
  getTipoSeguimientoFromDetalle,
  getTooltipSeguimiento,
  helperDarkBoxStyle,
  initialPlaneamientoForm,
  initialPlaneamientoIaForm,
  inputNotaStyle,
  isTipoAsistenciaSeguimiento,
  isTipoCotidianoSeguimiento,
  isTipoExamenSeguimiento,
  isTipoIndicadorSeguimiento,
  normalizarSeguimientoKey,
  normalizePlaneamientoIaResultado,
  normalizarGradoPlaneamiento,
  optionalBadgeStyle,
  ordenarMeses,
  requiredBadgeStyle,
  sanitizeNotaInput,
  secondaryButtonStyle,
  stickyTableCellStyle,
  stickyTableHeaderStyle,
} from "./GestionProfePage.helpers";

function getGrupoClaseParams(item?: GrupoProfesor | null) {
  return item?.GrupoClaseId ? { grupoClaseId: Number(item.GrupoClaseId) } : {};
}

function getGrupoProfesorKey(item?: GrupoProfesor | null) {
  if (!item) return "";
  return [
    item.GrupoClaseId || 0,
    item.GrupoId,
    item.MateriaId,
    item.AnioLectivoId,
    item.PeriodoId
  ].join("|");
}

const SUSPENSION_ROW_BG = "#ffe4e6";

function isEstudianteSuspendido(item?: any) {
  const value = String(item?.Suspendido ?? "").trim().toLowerCase();
  return item?.Suspendido === true
    || item?.Suspendido === 1
    || value === "true"
    || value === "1"
    || value === "si"
    || value === "sí"
    || Number(item?.SuspensionId || 0) > 0
    || Boolean(item?.MotivoSuspension && item?.FechaFinSuspension);
}

function getSuspensionTooltip(item?: any) {
  if (!isEstudianteSuspendido(item)) return "";
  const motivo = String(item?.MotivoSuspension || "No indicado").trim();
  const fechaFin = String(item?.FechaFinSuspension || "").slice(0, 10) || "sin fecha fin";
  return `Alumno Suspendido, Motivo: ${motivo}, hasta: ${fechaFin}`;
}

function getGestionRowBg(item: any, fallback: string) {
  return isEstudianteSuspendido(item) ? SUSPENSION_ROW_BG : fallback;
}

function getHorarioGrupoMateriaKey(item?: any) {
  if (!item) return "";
  return [
    Number(item.GrupoId || 0),
    Number(item.MateriaId || 0)
  ].join("|");
}

function getHorarioAsignacionKey(item?: any) {
  if (!item) return "";
  return [
    Number(item.GrupoId || 0),
    Number(item.MateriaId || 0),
    Number(item.AnioLectivoId || 0),
    Number(item.PeriodoId || 0)
  ].join("|");
}

function normalizeAdecuacionText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isValidApoyoAdecuacion(value?: string | null) {
  const normalized = normalizeAdecuacionText(value);
  return !!normalized && !["regular", "sin adecuacion", "seleccione", "no"].includes(normalized);
}

function isApoyoAdecuacionIncluida(value?: string | null) {
  return ["significativa", "no significativa", "todas"].includes(normalizeAdecuacionText(value));
}

function getApoyoAdecuacionLabel(value?: string | null) {
  const normalized = normalizeAdecuacionText(value);
  if (normalized === "significativa") return "Significativa";
  if (normalized === "no significativa") return "No Significativa";
  if (normalized === "todas") return "Todas";
  return String(value || "").trim();
}

function normalizarMesPlaneamiento(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function habilidadCorrespondeMes(mesHabilidad: string, mesSeleccionado: string) {
  const habilidad = normalizarMesPlaneamiento(mesHabilidad);
  const seleccionado = normalizarMesPlaneamiento(mesSeleccionado);
  if (!habilidad || !seleccionado) return false;
  if (habilidad === seleccionado) return true;

  const periodosCompuestos: Record<string, string[]> = {
    "f-m": ["febrero", "marzo"],
    "a-m-j": ["abril", "mayo", "junio"],
    "j-a-s": ["julio", "agosto", "setiembre", "septiembre"],
    "o-n-d": ["octubre", "noviembre", "diciembre"],
    "noviembre-diciembre": ["noviembre", "diciembre"],
    "setiembre-octubre": ["setiembre", "septiembre", "octubre"],
    "septiembre-octubre": ["setiembre", "septiembre", "octubre"]
  };

  return (periodosCompuestos[habilidad] || []).includes(seleccionado);
}

function isPlaneamientoDesdeHabilidades(planeamiento?: Planeamiento | null) {
  const nombre = normalizarMesPlaneamiento(planeamiento?.Nombre || "");
  return nombre.startsWith("sin planeamiento");
}

function getNombrePlaneamientoDesdeHabilidades(nombre?: string | null) {
  const detalle = String(nombre || "").trim();
  return detalle ? `Sin Planeamiento - ${detalle}` : "Sin Planeamiento - Habilidades";
}

function apoyoCatalogoCoincideConTiposPermitidos(
  adecuacionCatalogo: string | null | undefined,
  tiposPermitidos: Set<string>
) {
  const adecuacionNormalizada = normalizeAdecuacionText(adecuacionCatalogo);
  if (!adecuacionNormalizada) return false;
  if (!tiposPermitidos.size) return true;
  if (adecuacionNormalizada === "todas") {
    return Array.from(tiposPermitidos).some((item) =>
      ["significativa", "no significativa", "todas"].includes(item)
    );
  }
  return tiposPermitidos.has(adecuacionNormalizada) || tiposPermitidos.has("todas");
}

function getApoyoEducativoEstudianteKey(item: ApoyoEducativoResumenItem) {
  return [
    String(item?.EstudianteId || "").trim(),
    String(item?.GrupoId || "").trim(),
    String(item?.Identificacion || "").trim(),
    String(item?.NombreCompleto || "").trim(),
    String(item?.Edad ?? "").trim(),
    String(item?.Seccion || "").trim(),
    normalizeAdecuacionText(item?.TipoAdecuacion),
    String(item?.NivelFuncionamiento || "").trim()
  ].join("|");
}

function dedupeApoyoEducativoEstudiantes(items: ApoyoEducativoResumenItem[]) {
  const map = new Map<string, ApoyoEducativoResumenItem>();
  for (const item of items || []) {
    if (!item) continue;
    const key = getApoyoEducativoEstudianteKey(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

const MIS_GRUPOS_TODOS_KEY = "__TODOS__";
const DEFAULT_TIPOS_USO_INDICADORES = ["Cotidiano", "Tareas", "TablaEspecificaciones"];

function getIndicadoresDestinoKey(grupo?: GrupoProfesor | null) {
  if (!grupo) return "";
  const grupoId = Number(grupo.GrupoId || 0);
  if (!grupoId) return "";
  const grupoClaseId = Number(grupo.GrupoClaseId || 0);
  return `${grupoId}|${grupoClaseId > 0 ? grupoClaseId : 0}`;
}

const initialIndicadoresHabilidadesForm = {
  nombre: "",
  meses: [],
  habilidadesIds: [],
  cantidadPorHabilidad: "1",
  plantillaPromptIAId: "",
  indicacionesDocente: "",
  grupoIds: [],
  tiposUso: DEFAULT_TIPOS_USO_INDICADORES
};

const initialIndicadorManualForm = {
  open: false,
  indicadorBase: "",
  indicadorAvanzado: "",
  indicadorIntermedio: "",
  indicadorInicial: "",
  tiposUso: DEFAULT_TIPOS_USO_INDICADORES
};

function getGrupoHorarioPredeterminado(items: GrupoProfesor[]) {
  return [...(items || [])].sort((a, b) => {
    const anio = Number(b?.AnioLectivoId || 0) - Number(a?.AnioLectivoId || 0);
    if (anio !== 0) return anio;
    const periodo = Number(b?.PeriodoId || 0) - Number(a?.PeriodoId || 0);
    if (periodo !== 0) return periodo;
    return compararGruposProfesor(a, b);
  })[0] || null;
}

function getMisGruposPeriodoLabel(periodoNombre: string, periodoId?: number | string | null) {
  const texto = String(periodoNombre || "").trim();
  const porNumero = texto.match(/(\d+)/);
  if (porNumero) return `Periodo ${porNumero[1]}`;

  const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const porRomano = texto.toUpperCase().match(/\b(X|IX|VIII|VII|VI|V|IV|III|II|I)\b/);
  if (porRomano) {
    const indice = romanos.indexOf(porRomano[1]);
    if (indice !== -1) return `Periodo ${indice + 1}`;
  }

  if (periodoId !== undefined && periodoId !== null && String(periodoId).trim()) {
    return `Periodo ${periodoId}`;
  }

  return texto || "Periodo";
}

export default function GestionProfePage() {
  const { user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoProfesor[]>([]);
  const [selected, setSelected] = useState<GrupoProfesor | null>(null);
  const [detalle, setDetalle] = useState<DetalleGrupo | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
  const [q, setQ] = useState("");
  const [misGruposPeriodosSeleccionados, setMisGruposPeriodosSeleccionados] = useState<string[]>([MIS_GRUPOS_TODOS_KEY]);
  const [adminInstitucionesFiltro, setAdminInstitucionesFiltro] = useState<any[]>([]);
  const [adminGradosFiltro, setAdminGradosFiltro] = useState<any[]>([]);
  const [adminProfesoresFiltro, setAdminProfesoresFiltro] = useState<any[]>([]);
  const [adminModoCarga, setAdminModoCarga] = useState<"GRADO" | "PROFESOR">("GRADO");
  const [adminInstitucionId, setAdminInstitucionId] = useState("");
  const [adminGrado, setAdminGrado] = useState("");
  const [adminProfesorId, setAdminProfesorId] = useState("");
  const [loadingAdminFiltros, setLoadingAdminFiltros] = useState(false);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [loadingDetalleCardId, setLoadingDetalleCardId] = useState<number | null>(null);
  const [savingNotas, setSavingNotas] = useState(false);
  const [eval360Plantillas, setEval360Plantillas] = useState<Eval360Plantilla[]>([]);
  const [eval360PlantillaId, setEval360PlantillaId] = useState("");
  const [mostrarSelectorCambioPlantilla, setMostrarSelectorCambioPlantilla] = useState(false);
  const [eval360Estructura, setEval360Estructura] = useState<Eval360EstructuraData | null>(null);
  const [eval360DetallesDraft, setEval360DetallesDraft] = useState<Eval360Detalle[]>([]);
  const [loadingEval360, setLoadingEval360] = useState(false);
  const [savingEval360, setSavingEval360] = useState(false);
  const [savingEval360Progress, setSavingEval360Progress] = useState(0);
  const savingEval360TimerRef = useRef<number | null>(null);
  const [eval360PlantillasIaIndicadores, setEval360PlantillasIaIndicadores] = useState<PlantillaPromptIA[]>([]);
  const [eval360PlantillaIaIndicadorId, setEval360PlantillaIaIndicadorId] = useState("");
  const [eval360PlaneamientoId, setEval360PlaneamientoId] = useState("");
  const [eval360IndicacionesIa, setEval360IndicacionesIa] = useState("");
  const [eval360TiposUso, setEval360TiposUso] = useState<string[]>(["Cotidiano", "Tareas", "TablaEspecificaciones"]);
  const [eval360Indicadores, setEval360Indicadores] = useState<Eval360Indicador[]>([]);
  const [loadingEval360Indicadores, setLoadingEval360Indicadores] = useState(false);
  const [generatingEval360Indicadores, setGeneratingEval360Indicadores] = useState(false);
  const [generatingEval360IndicadoresProgress, setGeneratingEval360IndicadoresProgress] = useState(0);
  const generatingEval360IndicadoresTimerRef = useRef<number | null>(null);
  const [savingEval360IndicadorId, setSavingEval360IndicadorId] = useState<number | null>(null);
  const [deletingEval360PlaneamientoId, setDeletingEval360PlaneamientoId] = useState<number | null>(null);
  const [deletingEval360PlaneamientoProgress, setDeletingEval360PlaneamientoProgress] = useState(0);
  const deletingEval360PlaneamientoTimerRef = useRef<number | null>(null);
  const [savingEval360PlaneamientoCambiosId, setSavingEval360PlaneamientoCambiosId] = useState<number | null>(null);
  const [savingEval360PlaneamientoCambiosProgress, setSavingEval360PlaneamientoCambiosProgress] = useState(0);
  const savingEval360PlaneamientoCambiosTimerRef = useRef<number | null>(null);
  const [eval360IndicadoresPorPlaneamiento, setEval360IndicadoresPorPlaneamiento] = useState<Record<number, Eval360Indicador[]>>({});
  const [eval360PanelIndicadoresOpen, setEval360PanelIndicadoresOpen] = useState<Record<number, boolean>>({});
  const [eval360IndicacionesPorPlaneamiento, setEval360IndicacionesPorPlaneamiento] = useState<Record<number, string>>({});
  const [eval360GrupoIdsPorPlaneamiento, setEval360GrupoIdsPorPlaneamiento] = useState<Record<number, string[]>>({});
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
  const [loadingPlaneamientoDetalleId, setLoadingPlaneamientoDetalleId] = useState<number | null>(null);
  const [savingPlaneamiento, setSavingPlaneamiento] = useState(false);
  const [planeamientoIaForm, setPlaneamientoIaForm] = useState<PlaneamientoIaForm>(initialPlaneamientoIaForm);
  const [habilidadesIa, setHabilidadesIa] = useState<PlaneamientoHabilidad[]>([]);
  const [loadingHabilidadesIa, setLoadingHabilidadesIa] = useState(false);
  const [indicadoresHabilidadesOpen, setIndicadoresHabilidadesOpen] = useState(false);
  const [indicadoresHabilidadesForm, setIndicadoresHabilidadesForm] = useState(initialIndicadoresHabilidadesForm);
  const [generatingIndicadoresHabilidades, setGeneratingIndicadoresHabilidades] = useState(false);
  const [generatingIndicadoresHabilidadesProgress, setGeneratingIndicadoresHabilidadesProgress] = useState(0);
  const [generatingIndicadoresHabilidadesEtapa, setGeneratingIndicadoresHabilidadesEtapa] = useState("");
  const generatingIndicadoresHabilidadesTimerRef = useRef<number | null>(null);
  const [indicadorManualPorPlaneamiento, setIndicadorManualPorPlaneamiento] = useState<Record<number, typeof initialIndicadorManualForm>>({});
  const [savingIndicadorManualPlaneamientoId, setSavingIndicadorManualPlaneamientoId] = useState<number | null>(null);
  const [generatingPlaneamientoIa, setGeneratingPlaneamientoIa] = useState(false);
  const [generatingPlaneamientoIaProgress, setGeneratingPlaneamientoIaProgress] = useState(0);
  const [generatingPlaneamientoIaEtapa, setGeneratingPlaneamientoIaEtapa] = useState("");
  const generatingPlaneamientoIaTimerRef = useRef<number | null>(null);
  const [savingPlaneamientoIa, setSavingPlaneamientoIa] = useState(false);
  const [revisandoPlaneamientoIa, setRevisandoPlaneamientoIa] = useState(false);
  const [corrigiendoPlaneamientoIaProgress, setCorrigiendoPlaneamientoIaProgress] = useState(0);
  const [corrigiendoPlaneamientoIaEtapa, setCorrigiendoPlaneamientoIaEtapa] = useState("");
  const corrigiendoPlaneamientoIaTimerRef = useRef<number | null>(null);
  const [revisionPlaneamientoIaPendiente, setRevisionPlaneamientoIaPendiente] = useState(true);
  const [savingPlaneamientoIaProgress, setSavingPlaneamientoIaProgress] = useState(0);
  const [savingPlaneamientoIaEtapa, setSavingPlaneamientoIaEtapa] = useState("");
  const savingPlaneamientoIaTimerRef = useRef<number | null>(null);
  const [deletingPlaneamientoId, setDeletingPlaneamientoId] = useState<number | null>(null);
  const [deletingPlaneamientoProgress, setDeletingPlaneamientoProgress] = useState(0);
  const deletingPlaneamientoTimerRef = useRef<number | null>(null);
  const [ultimoPlaneamientoIa, setUltimoPlaneamientoIa] = useState<PlaneamientoIaResultado | null>(null);
  const [editingPlaneamientoIaId, setEditingPlaneamientoIaId] = useState<number | null>(null);
  const indicadoresOriginalesPlaneamientoIaRef = useRef<string[]>([]);
  const [documentoApoyoIa, setDocumentoApoyoIa] = useState<File[]>([]);
  const [plantillaFormatoIa, setPlantillaFormatoIa] = useState<File | null>(null);
  const [promptPlaneamientoIa, setPromptPlaneamientoIa] = useState("");
  const [promptPlaneamientoIaConstruido, setPromptPlaneamientoIaConstruido] = useState(false);
  const [promptPlaneamientoIaMejorado, setPromptPlaneamientoIaMejorado] = useState(false);
  const [mejorandoPromptPlaneamientoIa, setMejorandoPromptPlaneamientoIa] = useState(false);
  const [mejorandoPromptPlaneamientoIaProgress, setMejorandoPromptPlaneamientoIaProgress] = useState(0);
  const [mejorandoPromptPlaneamientoIaEtapa, setMejorandoPromptPlaneamientoIaEtapa] = useState("");
  const mejorandoPromptPlaneamientoIaTimerRef = useRef<number | null>(null);
  const [analizandoReferenciaIa, setAnalizandoReferenciaIa] = useState(false);
  const [analisisReferenciaIa, setAnalisisReferenciaIa] = useState<PlaneamientoReferenciaAnalisis | null>(null);
  const [seccionModeloReferenciaIaId, setSeccionModeloReferenciaIaId] = useState("");
  const [plantillasPlaneamientoIa, setPlantillasPlaneamientoIa] = useState<PlantillaPromptIA[]>([]);
  const [plantillaPlaneamientoIaId, setPlantillaPlaneamientoIaId] = useState<string>("");
  const [loadingPlantillasPlaneamientoIa, setLoadingPlantillasPlaneamientoIa] = useState(false);
  const [planeamientoIaFormOpen, setPlaneamientoIaFormOpen] = useState(false);
  const [asistenciaFecha, setAsistenciaFecha] = useState(() => getCostaRicaIsoDate());
  const [asistenciaDrafts, setAsistenciaDrafts] = useState<AsistenciaDraft>({});
  const [asistenciaDraftsBase, setAsistenciaDraftsBase] = useState<AsistenciaDraft>({});
  const [asistenciaNotificaciones, setAsistenciaNotificaciones] = useState<AsistenciaNotificacionEstado>({});
  const [asistenciaYaCalificada, setAsistenciaYaCalificada] = useState(false);
  const [asistenciaLecciones, setAsistenciaLecciones] = useState<AsistenciaLeccion[]>([]);
  const [resumenAsistencia, setResumenAsistencia] = useState<ResumenAsistencia[]>([]);
  const [loadingAsistencia, setLoadingAsistencia] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [savingAsistenciaProgress, setSavingAsistenciaProgress] = useState(0);
  const [savedAsistencia, setSavedAsistencia] = useState(false);
  const savingAsistenciaTimerRef = useRef<number | null>(null);
  const [seguimientoContexto, setSeguimientoContexto] = useState<SeguimientoEvaluacionContexto | null>(null);
  const [loadingSeguimiento, setLoadingSeguimiento] = useState(false);
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [savingSeguimientoModo, setSavingSeguimientoModo] = useState<"actividad" | "indicador" | "asignacion" | "eliminar" | null>(null);
  const [savingSeguimientoProgress, setSavingSeguimientoProgress] = useState(0);
  const [savedSeguimientoModo, setSavedSeguimientoModo] = useState<"actividad" | "indicador" | "asignacion" | "eliminar" | null>(null);
  const savingSeguimientoTimerRef = useRef<number | null>(null);
  const [tablaEliminandoActividadId, setTablaEliminandoActividadId] = useState<number | null>(null);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [horarioVisible, setHorarioVisible] = useState(false);
  const [horarioBloques, setHorarioBloques] = useState<HorarioBloque[]>([]);
  const [horarioEntradas, setHorarioEntradas] = useState<HorarioEntrada[]>([]);
  const [auditoriaEnviosDesde, setAuditoriaEnviosDesde] = useState(() => getCostaRicaIsoDateWithOffset(-30));
  const [auditoriaEnviosHasta, setAuditoriaEnviosHasta] = useState(() => getCostaRicaIsoDate());
  const [auditoriaEnvios, setAuditoriaEnvios] = useState<AuditoriaEnvioFila[]>([]);
  const [tipoReporteGestion, setTipoReporteGestion] = useState<TipoReporteGestion>("NOTAS");
  const [boletasConductaReporte, setBoletasConductaReporte] = useState<BoletaConductaReporte[]>([]);
  const [loadingBoletasReporte, setLoadingBoletasReporte] = useState(false);
  const [loadingAuditoriaEnvios, setLoadingAuditoriaEnvios] = useState(false);
  const [bitacorasGrupo, setBitacorasGrupo] = useState<BitacoraGestion[]>([]);
  const [loadingBitacora, setLoadingBitacora] = useState(false);
  const [savingBitacora, setSavingBitacora] = useState(false);
  const [editingBitacoraId, setEditingBitacoraId] = useState<number | null>(null);
  const [bitacoraForm, setBitacoraForm] = useState({
    temasDesarrollados: "",
    observaciones: "",
    hechosRelevantes: ""
  });
  const [cierreCurso, setCierreCurso] = useState<any | null>(null);
  const [cierreCursoPreview, setCierreCursoPreview] = useState<any | null>(null);
  const [loadingCierreCurso, setLoadingCierreCurso] = useState(false);
  const [savingCierreCurso, setSavingCierreCurso] = useState(false);
  const asistenciaInFlightKeyRef = useRef<string>("");
  const asistenciaPrimeraSeleccionRegistradaRef = useRef<Set<string>>(new Set());
  const auditoriaInFlightKeyRef = useRef<string>("");
  const bitacoraInFlightKeyRef = useRef<string>("");
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
  const [tablaActividadIdsSeleccionadas, setTablaActividadIdsSeleccionadas] = useState<string[]>([]);
  const [tablaPruebasConfirmadas, setTablaPruebasConfirmadas] = useState(false);
  const [tablaPlaneamientoIds, setTablaPlaneamientoIds] = useState<string[]>([]);
  const [tablaPlaneamientosConfirmados, setTablaPlaneamientosConfirmados] = useState(false);
  const [tablaNombrePruebaDrafts, setTablaNombrePruebaDrafts] = useState<Record<number, string>>({});
  const [tablaNombresGuardados, setTablaNombresGuardados] = useState(false);
  const [tablaActividadIndicadoresDraft, setTablaActividadIndicadoresDraft] = useState<Record<number, number[]>>({});
  const [tablaMatrizMinimizada, setTablaMatrizMinimizada] = useState(true);
  const [tablaMatrizEditando, setTablaMatrizEditando] = useState(true);
  const [tablaEspecificacionEditando, setTablaEspecificacionEditando] = useState(true);
  const [tablaFormatoMinimizado, setTablaFormatoMinimizado] = useState(false);
  const [tablaEditandoActividadId, setTablaEditandoActividadId] = useState<number | null>(null);
  const [tablaEspecificacionesFormOpen, setTablaEspecificacionesFormOpen] = useState(false);
  const [tablaVerGuardadasOpen, setTablaVerGuardadasOpen] = useState(true);
  const [tablaGuardadasItemsMinimizados, setTablaGuardadasItemsMinimizados] = useState<Record<number, boolean>>({});
  const [crearExamenesOpen, setCrearExamenesOpen] = useState(false);
  const [loadingPlantillasExamenIa, setLoadingPlantillasExamenIa] = useState(false);
  const [plantillasExamenIa, setPlantillasExamenIa] = useState<PlantillaPromptIA[]>([]);
  const [examenesCreados, setExamenesCreados] = useState<ExamenIaCreado[]>([]);
  const [examenesCreadosOculto, setExamenesCreadosOculto] = useState(false);
  const [editingExamenId, setEditingExamenId] = useState<string>("");
  const [examenTablaActivaId, setExamenTablaActivaId] = useState<string>("");
  const [examenIaGeneradoId, setExamenIaGeneradoId] = useState<string>("");
  const [examenIaResultadoDraft, setExamenIaResultadoDraft] = useState<string>("");
  const [generandoExamenIa, setGenerandoExamenIa] = useState(false);
  const [savingExamenIaProgress, setSavingExamenIaProgress] = useState(0);
  const [savingExamenIaMode, setSavingExamenIaMode] = useState<"generar" | "guardar" | "eliminar" | null>(null);
  const [savingExamenIaPhase, setSavingExamenIaPhase] = useState("");
  const [savingExamenIaElapsedSeconds, setSavingExamenIaElapsedSeconds] = useState(0);
  const [deletingExamenIaId, setDeletingExamenIaId] = useState<string>("");
  const [pendingScrollExamenId, setPendingScrollExamenId] = useState<string>("");
  const savingExamenIaTimerRef = useRef<number | null>(null);
  const savingExamenIaStartedAtRef = useRef<number>(0);
  const generadorExamenRef = useRef<HTMLDivElement | null>(null);
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
  const [notaPorcentajeDrafts, setNotaPorcentajeDrafts] = useState<Record<string, string>>({});
  const [savingNotaPorcentajeKey, setSavingNotaPorcentajeKey] = useState<string>("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [apoyoEducativoVisible, setApoyoEducativoVisible] = useState(false);
  const [loadingApoyoEducativo, setLoadingApoyoEducativo] = useState(false);
  const [savingApoyoEducativo, setSavingApoyoEducativo] = useState(false);
  const [apoyoEducativoProgress, setApoyoEducativoProgress] = useState(0);
  const [deletingApoyoEducativoInformeId, setDeletingApoyoEducativoInformeId] = useState<number | null>(null);
  const [apoyoEducativoGeneratorOpen, setApoyoEducativoGeneratorOpen] = useState(false);
  const [apoyoEducativoSecciones, setApoyoEducativoSecciones] = useState<ApoyoEducativoSeccion[]>([]);
  const [apoyoEducativoEstudiantes, setApoyoEducativoEstudiantes] = useState<ApoyoEducativoResumenItem[]>([]);
  const [apoyoEducativoCatalogo, setApoyoEducativoCatalogo] = useState<ApoyoEducativoCatalogoItem[]>([]);
  const [apoyoEducativoInformes, setApoyoEducativoInformes] = useState<ApoyoEducativoInformeItem[]>([]);
  const [apoyoEducativoPlantilla, setApoyoEducativoPlantilla] = useState<File | null>(null);
  const [apoyoEducativoResumenSearch, setApoyoEducativoResumenSearch] = useState("");
  const [apoyoEducativoResumenGrupoId, setApoyoEducativoResumenGrupoId] = useState("");
  const [apoyoEducativoPeriodoId, setApoyoEducativoPeriodoId] = useState("");
  const [apoyoEducativoResumenTipoAdecuacion, setApoyoEducativoResumenTipoAdecuacion] = useState("");
  const [apoyoEducativoGeneradorTipoAdecuacion, setApoyoEducativoGeneradorTipoAdecuacion] = useState("");
  const [apoyoEducativoGrupoIdsSeleccionados, setApoyoEducativoGrupoIdsSeleccionados] = useState<string[]>([]);
  const [apoyoEducativoAlumnosDisponibles, setApoyoEducativoAlumnosDisponibles] = useState<ApoyoEducativoResumenItem[]>([]);
  const [apoyoEducativoEstudianteIdsSeleccionados, setApoyoEducativoEstudianteIdsSeleccionados] = useState<string[]>([]);
  const [apoyoEducativoFiltroAdecuacion, setApoyoEducativoFiltroAdecuacion] = useState("");
  const [apoyoEducativoFiltroTipo, setApoyoEducativoFiltroTipo] = useState("");
  const [apoyoEducativoCatalogoResultados, setApoyoEducativoCatalogoResultados] = useState<ApoyoEducativoCatalogoItem[]>([]);
  const [apoyoEducativoCatalogoIdsSeleccionados, setApoyoEducativoCatalogoIdsSeleccionados] = useState<string[]>([]);
  const [apoyoEducativoPasoAlumnosConfirmado, setApoyoEducativoPasoAlumnosConfirmado] = useState(false);
  const [apoyoEducativoListaAlumnosMinimizada, setApoyoEducativoListaAlumnosMinimizada] = useState(true);
  const initialLoadStartedRef = useRef(false);
  const horarioRequestIdRef = useRef(0);
  const apoyoEducativoListaRef = useRef<HTMLDivElement | null>(null);
  const tablaMatrizRef = useRef<HTMLDivElement | null>(null);
  const userRoles = useMemo(() => (Array.isArray(user?.roles) ? user.roles : []), [user?.roles]);
  const isSuperAdminRole = useMemo(() => userRoles.includes("SUPER_ADMIN"), [userRoles]);
  const isGestionAdminRole = useMemo(
    () => userRoles.some((role) => ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"].includes(role)),
    [userRoles]
  );
  const cursoGestionCerrado = useMemo(
    () => Boolean(cierreCurso?.Cerrado) || String(cierreCurso?.Estado || "").toUpperCase() === "CERRADO_DOCENTE",
    [cierreCurso]
  );
  const panelesBloqueadosPorCierre = useMemo<ActivePanel[]>(
    () => ["planeamientos", "seguimiento", "examenes_tabla"],
    []
  );
  const panelBloqueadoPorCierre = (panel: ActivePanel) =>
    cursoGestionCerrado && panelesBloqueadosPorCierre.includes(panel);
  const getGestionPanelButtonStyleCierre = (panel: ActivePanel): React.CSSProperties => {
    const base = getGestionPanelButtonStyle(panel);
    if (!panelBloqueadoPorCierre(panel)) return base;
    return {
      ...base,
      background: "#f1f5f9",
      borderColor: "#cbd5e1",
      color: "#64748b",
      cursor: "not-allowed",
      opacity: 0.58,
      boxShadow: "none"
    };
  };

  useEffect(() => {
    if (!cursoGestionCerrado || !panelesBloqueadosPorCierre.includes(activePanel)) return;
    setActivePanel("");
  }, [activePanel, cursoGestionCerrado, panelesBloqueadosPorCierre]);

  useEffect(() => {
    return () => {
      if (deletingEval360PlaneamientoTimerRef.current !== null) {
        window.clearInterval(deletingEval360PlaneamientoTimerRef.current);
        deletingEval360PlaneamientoTimerRef.current = null;
      }
      if (savingSeguimientoTimerRef.current !== null) {
        window.clearInterval(savingSeguimientoTimerRef.current);
        savingSeguimientoTimerRef.current = null;
      }
      if (savingAsistenciaTimerRef.current !== null) {
        window.clearInterval(savingAsistenciaTimerRef.current);
        savingAsistenciaTimerRef.current = null;
      }
    };
  }, []);
  const detalleGrupoRef = useRef<HTMLElement | null>(null);
  const apoyoEducativoRef = useRef<HTMLElement | null>(null);

  const gruposOrdenados = useMemo(() => {
    return [...grupos].sort(compararGruposProfesor);
  }, [grupos]);
  const grupoHorarioPredeterminado = useMemo(
    () => getGrupoHorarioPredeterminado(gruposOrdenados),
    [gruposOrdenados]
  );

  const periodosDisponiblesMisGrupos = useMemo(() => {
    const periodosMap = new Map<string, { id: string; label: string; nombre: string; orden: number }>();
    gruposOrdenados.forEach((item, index) => {
      const id = String(item?.PeriodoId ?? "").trim();
      if (!id || periodosMap.has(id)) return;
      periodosMap.set(id, {
        id,
        nombre: String(item?.PeriodoNombre || "").trim(),
        label: getMisGruposPeriodoLabel(String(item?.PeriodoNombre || ""), item?.PeriodoId),
        orden: Number(item?.PeriodoId || index + 1)
      });
    });
    return Array.from(periodosMap.values()).sort((a, b) => {
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.label.localeCompare(b.label, "es");
    });
  }, [gruposOrdenados]);

  const gruposFiltradosPorPeriodo = useMemo(() => {
    if (misGruposPeriodosSeleccionados.includes(MIS_GRUPOS_TODOS_KEY)) {
      return gruposOrdenados;
    }
    const periodosActivos = new Set(misGruposPeriodosSeleccionados);
    return gruposOrdenados.filter((item) => periodosActivos.has(String(item?.PeriodoId ?? "").trim()));
  }, [gruposOrdenados, misGruposPeriodosSeleccionados]);

  const apoyoEducativoEstudiantesValidos = useMemo(() => {
    return (apoyoEducativoEstudiantes || []).filter((item) => {
      return !!item && !!item.TieneAdecuacion && isApoyoAdecuacionIncluida(item.TipoAdecuacion);
    });
  }, [apoyoEducativoEstudiantes]);

  const apoyoEducativoEstudiantesUnicos = useMemo(() => {
    return dedupeApoyoEducativoEstudiantes(apoyoEducativoEstudiantesValidos);
  }, [apoyoEducativoEstudiantesValidos]);

  const apoyoEducativoPeriodos = useMemo(() => {
    const map = new Map<string, { PeriodoId: number; PeriodoNombre: string }>();
    for (const item of apoyoEducativoSecciones || []) {
      const id = Number(item?.PeriodoId || 0);
      const nombre = String(item?.PeriodoNombre || "").trim();
      if (!id || !nombre || map.has(String(id))) continue;
      map.set(String(id), { PeriodoId: id, PeriodoNombre: nombre });
    }
    return Array.from(map.values()).sort((a, b) => a.PeriodoNombre.localeCompare(b.PeriodoNombre, "es"));
  }, [apoyoEducativoSecciones]);

  const apoyoEducativoSeccionesUnicasTotal = useMemo(() => {
    return new Set(
      (apoyoEducativoSecciones || []).map((item) => [
        String(item?.GrupoNombre || "").trim(),
        String(item?.AnioNombre || "").trim(),
        String(item?.PeriodoId || "").trim(),
        String(item?.PeriodoNombre || "").trim()
      ].join("|"))
    ).size;
  }, [apoyoEducativoSecciones]);

  const apoyoEducativoSeccionesFiltradas = useMemo(() => {
    if (!apoyoEducativoPeriodoId) return apoyoEducativoSecciones;
    return (apoyoEducativoSecciones || []).filter((item) => String(item.PeriodoId || "") === String(apoyoEducativoPeriodoId));
  }, [apoyoEducativoPeriodoId, apoyoEducativoSecciones]);

  const apoyoEducativoSeccionesAgrupadas = useMemo(() => {
    const map = new Map<string, {
      key: string;
      GrupoNombre: string;
      AnioNombre?: string | null;
      PeriodoId?: number | null;
      PeriodoNombre?: string | null;
      grupoIds: string[];
    }>();

    for (const item of apoyoEducativoSeccionesFiltradas || []) {
      const key = [
        String(item?.GrupoNombre || "").trim(),
        String(item?.AnioNombre || "").trim(),
        String(item?.PeriodoId || "").trim(),
        String(item?.PeriodoNombre || "").trim()
      ].join("|");
      const grupoId = String(item?.GrupoId || "").trim();
      if (!grupoId) continue;
      const actual = map.get(key);
      if (actual) {
        if (!actual.grupoIds.includes(grupoId)) actual.grupoIds.push(grupoId);
      } else {
        map.set(key, {
          key,
          GrupoNombre: item.GrupoNombre,
          AnioNombre: item.AnioNombre,
          PeriodoId: item.PeriodoId,
          PeriodoNombre: item.PeriodoNombre,
          grupoIds: [grupoId]
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const seccion = String(a.GrupoNombre || "").localeCompare(String(b.GrupoNombre || ""), "es", { numeric: true, sensitivity: "base" });
      if (seccion !== 0) return seccion;
      return String(a.PeriodoNombre || "").localeCompare(String(b.PeriodoNombre || ""), "es", { sensitivity: "base" });
    });
  }, [apoyoEducativoSeccionesFiltradas]);

  const apoyoEducativoEstudiantesFiltradosPorContexto = useMemo(() => {
    const gruposPermitidos = new Set((apoyoEducativoSeccionesFiltradas || []).map((item) => String(item.GrupoId)));
    const filtrados = apoyoEducativoEstudiantesValidos.filter((item) => {
      if (!item) return false;
      if (gruposPermitidos.size && !gruposPermitidos.has(String(item.GrupoId))) return false;
      if (apoyoEducativoPeriodoId && String(item.PeriodoId || "") !== String(apoyoEducativoPeriodoId)) return false;
      return true;
    });
    return dedupeApoyoEducativoEstudiantes(filtrados);
  }, [apoyoEducativoEstudiantesValidos, apoyoEducativoSeccionesFiltradas, apoyoEducativoPeriodoId]);

  useEffect(() => {
    setMisGruposPeriodosSeleccionados((prev) => {
      if (!periodosDisponiblesMisGrupos.length) {
        return prev.length === 1 && prev[0] === MIS_GRUPOS_TODOS_KEY ? prev : [MIS_GRUPOS_TODOS_KEY];
      }
      if (prev.includes(MIS_GRUPOS_TODOS_KEY)) return prev;

      const idsValidos = new Set(periodosDisponiblesMisGrupos.map((item) => item.id));
      const siguientes = prev.filter((id) => idsValidos.has(id));
      if (!siguientes.length || siguientes.length === periodosDisponiblesMisGrupos.length) {
        return [MIS_GRUPOS_TODOS_KEY];
      }
      if (siguientes.length === prev.length) return prev;
      return siguientes;
    });
  }, [periodosDisponiblesMisGrupos]);

  const apoyoEducativoResumenFiltrado = useMemo(() => {
    return [...apoyoEducativoEstudiantesUnicos].sort((a, b) => {
      const seccion = String(a.Seccion || "").localeCompare(String(b.Seccion || ""), "es", { numeric: true, sensitivity: "base" });
      if (seccion !== 0) return seccion;
      return String(a.NombreCompleto || "").localeCompare(String(b.NombreCompleto || ""), "es", { sensitivity: "base" });
    });
  }, [apoyoEducativoEstudiantesUnicos]);

  const apoyoEducativoTiposAdecuacionEstudiantes = useMemo(() => {
    const tiposMap = new Map<string, string>();
    apoyoEducativoEstudiantesFiltradosPorContexto.forEach((item) => {
      if (!isApoyoAdecuacionIncluida(item.TipoAdecuacion)) return;
      const normalized = normalizeAdecuacionText(item.TipoAdecuacion);
      if (!normalized || tiposMap.has(normalized)) return;
      tiposMap.set(normalized, getApoyoAdecuacionLabel(item.TipoAdecuacion));
    });
    return Array.from(tiposMap.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [apoyoEducativoEstudiantesFiltradosPorContexto]);

  useEffect(() => {
    if (
      apoyoEducativoGeneradorTipoAdecuacion
      && !apoyoEducativoTiposAdecuacionEstudiantes.some(
        (item) => normalizeAdecuacionText(item) === normalizeAdecuacionText(apoyoEducativoGeneradorTipoAdecuacion)
      )
    ) {
      setApoyoEducativoGeneradorTipoAdecuacion("");
    }
  }, [apoyoEducativoGeneradorTipoAdecuacion, apoyoEducativoTiposAdecuacionEstudiantes]);

  const apoyoEducativoAlumnosDisponiblesFiltrados = useMemo(() => {
    if (!apoyoEducativoGeneradorTipoAdecuacion) return apoyoEducativoAlumnosDisponibles;
    return apoyoEducativoAlumnosDisponibles.filter(
      (item) => normalizeAdecuacionText(item.TipoAdecuacion) === normalizeAdecuacionText(apoyoEducativoGeneradorTipoAdecuacion)
    );
  }, [apoyoEducativoAlumnosDisponibles, apoyoEducativoGeneradorTipoAdecuacion]);

  useEffect(() => {
    if (
      apoyoEducativoResumenTipoAdecuacion
      && !apoyoEducativoTiposAdecuacionEstudiantes.some(
        (item) => normalizeAdecuacionText(item) === normalizeAdecuacionText(apoyoEducativoResumenTipoAdecuacion)
      )
    ) {
      setApoyoEducativoResumenTipoAdecuacion("");
    }
  }, [apoyoEducativoResumenTipoAdecuacion, apoyoEducativoTiposAdecuacionEstudiantes]);

  const apoyoEducativoOpcionesAdecuacion = useMemo(() => {
    const estudiantesSeleccionados = apoyoEducativoAlumnosDisponibles.filter((item) => apoyoEducativoEstudianteIdsSeleccionados.includes(String(item.EstudianteId)));
    const tiposPermitidos = new Set(
      (estudiantesSeleccionados.length ? estudiantesSeleccionados : apoyoEducativoAlumnosDisponibles)
        .map((item) => normalizeAdecuacionText(item.TipoAdecuacion))
        .filter(Boolean)
    );
    return Array.from(
      new Set(
        (apoyoEducativoCatalogo || [])
          .map((item) => String(item.Adecuacion || "").trim())
          .filter((item) => {
            if (!isApoyoAdecuacionIncluida(item)) return false;
            return apoyoCatalogoCoincideConTiposPermitidos(item, tiposPermitidos);
          })
      )
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [apoyoEducativoCatalogo, apoyoEducativoAlumnosDisponibles, apoyoEducativoEstudianteIdsSeleccionados]);

  const apoyoEducativoOpcionesTipo = useMemo(() => {
    return Array.from(new Set((apoyoEducativoCatalogo || []).map((item) => String(item.Tipo || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [apoyoEducativoCatalogo]);

  const tienePlantillaSeguimientoAsignada = Boolean(
    seguimientoContexto?.estructura?.EstructuraGrupoId
    || seguimientoContexto?.estructura?.PlantillaBaseId
    || eval360Estructura?.estructura?.EstructuraGrupoId
  );

  const debeMostrarSelectorPlantillaSeguimiento = !loadingSeguimiento && (
    mostrarSelectorCambioPlantilla || !tienePlantillaSeguimientoAsignada
  );

  const apoyoEducativoInformesPorEstudiante = useMemo(() => {
    const map = new Map<string, ApoyoEducativoInformeItem[]>();
    const vistos = new Set<string>();
    for (const informe of apoyoEducativoInformes || []) {
      const informeKey = String(informe.ApoyoEducativoEstudianteId || "").trim();
      if (informeKey && vistos.has(informeKey)) continue;
      if (informeKey) vistos.add(informeKey);
      const key = `${informe.EstudianteId}|${informe.GrupoId}`;
      const current = map.get(key) || [];
      current.push(informe);
      map.set(key, current);
    }
    return map;
  }, [apoyoEducativoInformes]);

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

  const seguimientoDetallesSeleccionados = useMemo(() => {
    const detalles = seguimientoContexto?.detalles || eval360DetallesDraft || [];
    if (!seguimientoTipo) return [];
    return (detalles as SeguimientoEvaluacionDetalle[]).filter((item) => {
      if (item.Activo === false || item.Activo === 0) return false;
      return getTipoSeguimientoFromDetalle(item) === seguimientoTipo;
    });
  }, [seguimientoContexto?.detalles, eval360DetallesDraft, seguimientoTipo]);

  const seguimientoActividadesFiltradas = useMemo(() => {
    const actividades = seguimientoContexto?.actividades || [];
    const detalleIds = new Set(
      seguimientoDetallesSeleccionados
        .map((item) => Number(item.EstructuraGrupoDetalleId || 0))
        .filter((id) => id > 0)
    );
    if (!detalleIds.size) return [];
    return ordenarActividadesEvaluativas(
      actividades.filter((actividad) =>
        detalleIds.has(Number(actividad.EstructuraGrupoDetalleId || 0))
        && actividad.Activo !== false
        && actividad.Activo !== 0
      )
    );
  }, [seguimientoContexto?.actividades, seguimientoDetallesSeleccionados]);

  const seguimientoActividadSeleccionada = useMemo(() => {
    return seguimientoActividadesFiltradas.find((item) => String(item.ActividadId) === String(seguimientoActividadId)) || seguimientoActividadesFiltradas[0] || null;
  }, [seguimientoActividadesFiltradas, seguimientoActividadId]);

  const seguimientoDetalleSeleccionado = useMemo(() => {
    const detalleActividadId = Number(seguimientoActividadSeleccionada?.EstructuraGrupoDetalleId || 0);
    if (detalleActividadId > 0) {
      return seguimientoDetallesSeleccionados.find((item) => Number(item.EstructuraGrupoDetalleId || 0) === detalleActividadId) || seguimientoDetallesSeleccionados[0] || null;
    }
    return seguimientoDetallesSeleccionados[0] || null;
  }, [seguimientoDetallesSeleccionados, seguimientoActividadSeleccionada?.EstructuraGrupoDetalleId]);

  const seguimientoComponenteTieneActividadesPlaneamiento = useMemo(() => {
    return seguimientoActividadesFiltradas.some((actividad) => Boolean(actividad.UsaIndicadoresPlaneamiento));
  }, [seguimientoActividadesFiltradas]);

  const seguimientoModoHibridoTareas = useMemo(() => {
    return seguimientoComponenteTieneActividadesPlaneamiento && Boolean(seguimientoActividadSeleccionada);
  }, [seguimientoComponenteTieneActividadesPlaneamiento, seguimientoActividadSeleccionada]);

  const mostrarSelectorActividadIndicador = useMemo(() => {
    if (!seguimientoComponenteTieneActividadesPlaneamiento) return false;
    if (!isTipoIndicadorSeguimiento(seguimientoTipo)) return false;
    if (isTipoCotidianoSeguimiento(seguimientoTipo) && seguimientoActividadesFiltradas.length <= 1) return false;
    return true;
  }, [seguimientoComponenteTieneActividadesPlaneamiento, seguimientoTipo, seguimientoActividadesFiltradas.length]);

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
    const actividadesConPlaneamiento = seguimientoActividadesFiltradas.filter((actividad) => Boolean(actividad.UsaIndicadoresPlaneamiento));
    if (!actividadesConPlaneamiento.length) return [];
    if (actividadesConPlaneamiento.length === seguimientoActividadesFiltradas.length) return seguimientoActividadesFiltradas;
    if (isTipoIndicadorSeguimiento(seguimientoTipo)) return seguimientoActividadesFiltradas;
    return actividadesConPlaneamiento;
  }, [seguimientoActividadesFiltradas, seguimientoTipo]);

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

  const tablaActividadesObjetivo = useMemo(() => {
    if (activePanel !== "examenes_tabla") return [];
    if (!tablaActividadIdsSeleccionadas.length) return [];
    return tablaActividadesExamen.filter((actividad) => tablaActividadIdsSeleccionadas.includes(String(actividad.ActividadId)));
  }, [activePanel, tablaActividadesExamen, tablaActividadIdsSeleccionadas]);

  const tablaIndicadoresEspecificaciones = useMemo(() => {
    try {
      if (activePanel !== "examenes_tabla") return [];
      const planeamientosSeleccionados = new Map(
        (seguimientoContexto?.planeamientos || [])
          .filter((planeamiento) => tablaPlaneamientoIds.includes(String(planeamiento.PlaneamientoId)))
          .map((planeamiento) => [
            String(planeamiento.PlaneamientoId),
            String(planeamiento.Nombre || "").trim().toLowerCase()
          ])
      );
      return (seguimientoContexto?.indicadores || []).filter((indicador) => {
        if (!indicador) return false;
        if (normalizarSeguimientoKey(indicador.TipoUso) !== "TABLAESPECIFICACIONES") return false;
        if (tablaPlaneamientoIds.length > 0) {
          const indicadorPlaneamientoId = String(indicador.PlaneamientoId || "");
          if (tablaPlaneamientoIds.includes(indicadorPlaneamientoId)) {
            return indicador.Activo !== false && indicador.Activo !== 0;
          }
          const nombreIndicador = String(
            (indicador as any)?.PlaneamientoNombre ||
            (indicador as any)?.PlaneamientoNombreOrigen ||
            ""
          ).trim().toLowerCase();
          if (!nombreIndicador) return false;
          const coincidePorNombre = Array.from(planeamientosSeleccionados.values()).includes(nombreIndicador);
          if (!coincidePorNombre) return false;
        }
        return indicador.Activo !== false && indicador.Activo !== 0;
      });
    } catch (error) {
      console.error("Error calculando indicadores de tabla:", error);
      return [];
    }
  }, [activePanel, seguimientoContexto?.indicadores, tablaPlaneamientoIds]);

  const tablaPlaneamientosSeleccionados = useMemo(() => {
    if (activePanel !== "examenes_tabla") return [];
    return (seguimientoContexto?.planeamientos || []).filter((planeamiento) =>
      tablaPlaneamientoIds.includes(String(planeamiento.PlaneamientoId))
    );
  }, [activePanel, seguimientoContexto?.planeamientos, tablaPlaneamientoIds]);

  const tablaIndicadoresRender = useMemo(() => {
    if (activePanel !== "examenes_tabla") return [];
    return tablaIndicadoresEspecificaciones.slice(0, 250);
  }, [activePanel, tablaIndicadoresEspecificaciones]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla" || tablaMatrizMinimizada || !tablaEspecificacionesFormOpen) return;
    const timer = window.setTimeout(() => {
      tablaMatrizRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activePanel, tablaEspecificacionesFormOpen, tablaMatrizMinimizada]);

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
    for (const actividad of tablaActividadesObjetivo) {
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

  const seguimientoFaltanAsignacionesActividad = useMemo(() => {
    if (!isTipoIndicadorSeguimiento(seguimientoTipo)) return false;
    if (!seguimientoModoHibridoTareas) return false;
    if (!seguimientoActividadSeleccionada?.ActividadId) return false;
    if (seguimientoIndicadoresFiltrados.length > 0) return false;

    const tipoKey = normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "TAREAS" : "COTIDIANO";
    const indicadoresTipo = (seguimientoContexto?.indicadores || []).filter((indicador) => {
      if (normalizarSeguimientoKey(indicador.TipoUso) !== tipoKey) return false;
      if (seguimientoPlaneamientoId && String(indicador.PlaneamientoId || "") !== seguimientoPlaneamientoId) return false;
      return true;
    });
    if (!indicadoresTipo.length) return false;

    const asignadosActividad = new Set((seguimientoIndicadoresActividadAsignados || []).map((id) => Number(id)));
    const tieneAsignadoEnActividad = indicadoresTipo.some((indicador) => asignadosActividad.has(Number(indicador.IndicadorGrupoId)));
    return !tieneAsignadoEnActividad;
  }, [
    seguimientoTipo,
    seguimientoModoHibridoTareas,
    seguimientoActividadSeleccionada?.ActividadId,
    seguimientoIndicadoresFiltrados.length,
    seguimientoContexto?.indicadores,
    seguimientoPlaneamientoId,
    seguimientoIndicadoresActividadAsignados
  ]);

  const seguimientoPasosEvaluacion = useMemo(() => {
    if (!seguimientoTipo) {
      return [
        "Seleccioná el Rubro a Calificar.",
        "Verificá el listado de estudiantes y el período.",
        "Completa las calificaciones y guarda."
      ];
    }

    if (isTipoAsistenciaSeguimiento(seguimientoTipo)) {
      return [
        "Seleccioná la fecha de asistencia.",
        "Marcá el estado por lección para cada estudiante.",
        "Guardá la asistencia para aplicar el cálculo del rubro."
      ];
    }

    if (seguimientoModoActividadDirecta) {
      return [
        "Seleccioná la actividad evaluativa del rubro.",
        "Definí los puntos máximos y registrá los puntos obtenidos.",
        "Presioná Calificar para guardar la evaluación."
      ];
    }

    return [
      "Seleccioná el indicador del rubro.",
      "Marca el nivel por estudiante (Inicial, Intermedio, Avanzado o No entregado/Ausente).",
      "Presioná Calificar para guardar la evaluación."
    ];
  }, [seguimientoTipo, seguimientoModoActividadDirecta]);

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

  const dedupeActividadesLogicas = (items: any[]) => {
    const map = new Map<string, any>();
    for (const actividad of items || []) {
      const key = [
        Number(actividad?.EstructuraGrupoDetalleId || 0),
        normalizarSeguimientoKey(String(actividad?.Nombre || "")),
        normalizarSeguimientoKey(String(actividad?.Fuente || "")),
        String(actividad?.Fecha || "").slice(0, 10),
        Number(actividad?.PuntosMaximos || 0).toFixed(2),
        Number(actividad?.PorcentajeDentroRubro || 0).toFixed(2),
      ].join("|");
      const actual = map.get(key);
      if (!actual || Number(actividad?.ActividadId || 0) > Number(actual?.ActividadId || 0)) {
        map.set(key, actividad);
      }
    }
    return Array.from(map.values());
  };

  function ordenarActividadesEvaluativas(items: any[]) {
    return [...(items || [])].sort((a, b) => {
      const aa = getSeguimientoActividadLabel(a);
      const bb = getSeguimientoActividadLabel(b);
      const ma = aa.match(/(\d+)/);
      const mb = bb.match(/(\d+)/);
      if (ma && mb) {
        const na = Number(ma[1] || 0);
        const nb = Number(mb[1] || 0);
        if (na !== nb) return na - nb;
      }
      return aa.localeCompare(bb, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  function getSeguimientoActividadLabel(actividad: any) {
    return String(
      actividad?.Nombre
      || actividad?.Descripcion
      || actividad?.ActividadNombre
      || `Actividad ${actividad?.ActividadId || ""}`
    ).trim();
  }

  const dedupeSeguimientosActividadIndicador = (items: any[]) => {
    const map = new Map<string, any>();
    for (const item of items || []) {
      const key = [
        Number(item?.ActividadId || 0),
        Number(item?.IndicadorGrupoId || 0),
        Number(item?.EstudianteId || 0),
      ].join("|");
      const actual = map.get(key);
      if (!actual || Number(item?.SeguimientoIndicadorId || 0) > Number(actual?.SeguimientoIndicadorId || 0)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  };

  const dedupeSeguimientosActividadIndicadorLogico = (items: any[], indicadoresCatalogo: any[]) => {
    const indicadorPorId = new Map<number, any>();
    for (const indicador of indicadoresCatalogo || []) {
      indicadorPorId.set(Number(indicador?.IndicadorGrupoId || 0), indicador);
    }
    const map = new Map<string, any>();
    for (const item of items || []) {
      const indicador = indicadorPorId.get(Number(item?.IndicadorGrupoId || 0));
      const key = [
        Number(item?.ActividadId || 0),
        Number(item?.EstudianteId || 0),
        normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
        normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
      ].join("|");
      const actual = map.get(key);
      if (!actual || Number(item?.SeguimientoIndicadorId || 0) > Number(actual?.SeguimientoIndicadorId || 0)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  };

  const agruparIndicadoresLogicos = (ids: Iterable<number>, indicadoresCatalogo: any[], tipo: "COTIDIANO" | "TAREAS") => {
    const indicadorPorId = new Map<number, any>();
    for (const indicador of indicadoresCatalogo || []) {
      indicadorPorId.set(Number(indicador?.IndicadorGrupoId || 0), indicador);
    }

    const columnasMap = new Map<string, { nombre: string; indicadorIds: number[] }>();
    for (const rawId of ids) {
      const id = Number(rawId || 0);
      if (id <= 0) continue;
      const indicador = indicadorPorId.get(id);
      const nombre = String(indicador?.IndicadorBase || `Indicador ${id}`);
      const key = indicador
        ? [
            tipo,
            normalizarSeguimientoKey(nombre),
          ].join("|")
        : `ID|${id}`;
      const actual = columnasMap.get(key);
      if (actual) {
        if (!actual.indicadorIds.includes(id)) actual.indicadorIds.push(id);
      } else {
        columnasMap.set(key, { nombre, indicadorIds: [id] });
      }
    }

    return Array.from(columnasMap.values()).sort((a, b) => {
      const aa = String(a.nombre || "");
      const bb = String(b.nombre || "");
      const ma = aa.match(/^(\d+)(?:\.(\d+))?/);
      const mb = bb.match(/^(\d+)(?:\.(\d+))?/);
      if (ma && mb) {
        const a1 = Number(ma[1] || 0);
        const b1 = Number(mb[1] || 0);
        if (a1 !== b1) return a1 - b1;
        const a2 = Number(ma[2] || 0);
        const b2 = Number(mb[2] || 0);
        if (a2 !== b2) return a2 - b2;
      }
      return aa.localeCompare(bb);
    });
  };

  const consolidadoAlumnos = useMemo(() => {
    const detalles = seguimientoContexto?.detalles || [];
    const estudiantes = seguimientoContexto?.estudiantes || [];
    const actividades = seguimientoContexto?.actividades || [];
    const notas = seguimientoContexto?.notasActividades || [];
    const seguimientos = seguimientoContexto?.seguimientos || [];
    const indicadores = seguimientoContexto?.indicadores || [];
    const actividadIndicadores = seguimientoContexto?.actividadIndicadores || [];
    const asistencia = seguimientoContexto?.asistenciaRegistros || [];
    const ajustesManuales = seguimientoContexto?.componenteAjustesManuales || [];
    const ajustesMap = new Map<string, number>();
    for (const item of ajustesManuales) {
      const estudianteId = Number(item?.EstudianteId || 0);
      const detalleId = Number(item?.EstructuraGrupoDetalleId || 0);
      const porcentaje = Number(item?.PorcentajeObtenidoComponente);
      if (estudianteId > 0 && detalleId > 0 && Number.isFinite(porcentaje)) {
        ajustesMap.set(`${estudianteId}-${detalleId}`, porcentaje);
      }
    }

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
      if (key.includes("AUSENTE_JUSTIFICADA")) return 0;
      if (key.includes("TARDIA_MENOR")) return 0.5;
      if (key.includes("AUSENTE_INJUSTIFICADA") || key.includes("TARDIA_MAYOR")) return 1;
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
      let porcentajeGanadoOriginal = 0;
      let evaluados = 0;
      let pendientes = 0;
      let resumen = "Sin registros";
      let detallesLista: Array<{ key: string; titulo: string; subtitulo: string; nota: number; porcentaje: number; estado?: string; correoEnviado?: boolean; waEnviado?: boolean }> = [];

      if (tipoKey.includes("ASIST")) {
        const registros = asistencia.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const totalLecciones = registros.length;
        const ausencias = registros.reduce((acc, item) => acc + ausenciaEquivalente(item.Estado), 0);
        const porcentajeAusencias = totalLecciones ? (ausencias / totalLecciones) * 100 : 0;
        const puntosArticulo = escalaArticulo37(porcentajeAusencias);
        porcentajeGanado = totalLecciones
          ? Number((((puntosArticulo / 5) * porcentajeComponente).toFixed(2)))
          : 0;
        nota = porcentajeComponente ? (porcentajeGanado / porcentajeComponente) * 100 : 0;
        porcentajeEvaluado = totalLecciones > 0 ? porcentajeComponente : 0;
        evaluados = totalLecciones;
        pendientes = totalLecciones ? 0 : 1;
        resumen = totalLecciones
          ? `${totalLecciones} lecciones registradas / ${ausencias.toFixed(2)} ausencias equivalentes / ${porcentajeAusencias.toFixed(2)}% ausencias`
          : "Sin asistencia registrada";
        detallesLista = registros.map((registro) => {
          const notif = asistenciaNotificaciones[
            asistenciaDraftKey(Number(estudiante.EstudianteId), Number(registro.HorarioGrupoId || 0))
          ] || {};
          return {
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
            estado: registro.Estado || "Presente",
            correoEnviado: Boolean((registro as any)?.CorreoEnviado || (registro as any)?.NotificacionCorreoEnviado || notif?.correoEnviado),
            waEnviado: Boolean((registro as any)?.WaEnviado || (registro as any)?.WhatsappEnviado || (registro as any)?.NotificacionWaEnviado || notif?.waEnviado)
          };
        });
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
        const indicadoresTipo = indicadores.filter((indicador) => {
          const tipoIndicador = normalizarSeguimientoKey(indicador.TipoUso);
          return tipoKey.includes("COTIDIAN")
            ? tipoIndicador.includes("COTIDIAN")
            : tipoIndicador.includes("TAREA");
        });
        const seguimientosEstudiante = seguimientos.filter((item) => Number(item.EstudianteId) === Number(estudiante.EstudianteId));
        const actividadesDetalle = dedupeActividadesLogicas(
          actividades.filter((actividad) => Number(actividad.EstructuraGrupoDetalleId) === detalleId)
        );
        const indicadorIds = new Set(indicadoresTipo.map((indicador) => Number(indicador.IndicadorGrupoId)));
        const actividadesResumen = actividadesDetalle.map((actividad) => {
          const registrosActividad = dedupeSeguimientosActividadIndicadorLogico(
            seguimientosEstudiante.filter((item) =>
              Number(item.ActividadId) === Number(actividad.ActividadId)
              && indicadorIds.has(Number(item.IndicadorGrupoId))
            ),
            indicadoresTipo
          );
          const notaActividadRegistro = notas.find((n) =>
            Number((n as any).ActividadId) === Number(actividad.ActividadId)
            && Number((n as any).EstudianteId) === Number(estudiante.EstudianteId)
          );
          const indicadoresAsignados = actividadIndicadores
            .filter((item) =>
              Number(item.ActividadId) === Number(actividad.ActividadId)
              && indicadorIds.has(Number(item.IndicadorGrupoId))
              && item.Activo !== false
              && item.Activo !== 0
            )
            .map((item) => {
              const indicador = indicadoresTipo.find((indicador) => Number(indicador.IndicadorGrupoId) === Number(item.IndicadorGrupoId));
              return [
                normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
                normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
              ].join("|");
            });
          const totalAsignados = new Set(indicadoresAsignados.filter(Boolean)).size || indicadoresTipo.length;
          const puntos = registrosActividad.reduce((acc, item) => acc + Number(item.ValorSeleccionado || 0), 0);
          const indicadoresEvaluados = new Set(registrosActividad.map((item) => {
            const indicador = indicadoresTipo.find((entry) => Number(entry.IndicadorGrupoId) === Number(item.IndicadorGrupoId));
            return [
              normalizarSeguimientoKey(String(indicador?.TipoUso || "")),
              normalizarSeguimientoKey(String(indicador?.IndicadorBase || "")),
            ].join("|");
          })).size;
          const maximo = totalAsignados * 3;
          const notaActividad = maximo ? (puntos / maximo) * 100 : 0;
          const pesoActividad = Number(actividad.PorcentajeDentroRubro || 0) > 0 ? Number(actividad.PorcentajeDentroRubro || 0) / 100 : (actividadesDetalle.length ? 1 / actividadesDetalle.length : 0);
          const correoEnviadoSeguimiento = registrosActividad.some((item: any) => Boolean(item?.CorreoEnviado || item?.NotificacionCorreoEnviado));
          const waEnviadoSeguimiento = registrosActividad.some((item: any) => Boolean(item?.WaEnviado || item?.WhatsappEnviado || item?.NotificacionWaEnviado));
          const correoEnviadoNota = Boolean((notaActividadRegistro as any)?.CorreoEnviado || (notaActividadRegistro as any)?.NotificacionCorreoEnviado);
          const waEnviadoNota = Boolean((notaActividadRegistro as any)?.WaEnviado || (notaActividadRegistro as any)?.WhatsappEnviado || (notaActividadRegistro as any)?.NotificacionWaEnviado);
          const correoEnviado = correoEnviadoSeguimiento || correoEnviadoNota;
          const waEnviado = waEnviadoSeguimiento || waEnviadoNota;
          return { actividad, registrosActividad, indicadoresEvaluados, totalAsignados, notaActividad, pesoActividad, correoEnviado, waEnviado };
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
        porcentajeGanado = Math.min(porcentajeComponente, porcentajeGanado);
        porcentajeEvaluado = Math.min(porcentajeComponente, porcentajeEvaluado);
        evaluados = actividadesResumen.reduce((acc, item) => acc + item.indicadoresEvaluados, 0);
        pendientes = actividadesDetalle.length
          ? actividadesResumen.reduce((acc, item) => acc + Math.max(0, item.totalAsignados - item.indicadoresEvaluados), 0)
          : Math.max(0, indicadoresTipo.length - evaluados);
        resumen = actividadesDetalle.length
          ? `${actividadesResumen.filter((item) => item.indicadoresEvaluados > 0).length}/${actividadesDetalle.length} actividades con indicadores`
          : `${evaluados}/${indicadoresTipo.length} indicadores calificados`;

        // Tareas debe contar los mismos indicadores lógicos que su reporte.
        // Así se evita que una tarea calificada aparezca como pendiente en Registro de Notas.
        if (tipoKey.includes("TAREA")) {
          const actividadIdsDetalle = new Set(actividadesDetalle.map((actividad) => Number(actividad.ActividadId)).filter((id) => id > 0));
          const indicadorIdsAsignados = new Set(
            actividadIndicadores
              .filter((item) => actividadIdsDetalle.has(Number(item.ActividadId)) && item.Activo !== false && item.Activo !== 0)
              .map((item) => Number(item.IndicadorGrupoId))
              .filter((id) => id > 0)
          );
          const indicadorIdsConSeguimiento = new Set(
            seguimientos
              .filter((item) => Number(item.EstructuraGrupoDetalleId) === detalleId)
              .map((item) => Number(item.IndicadorGrupoId))
              .filter((id) => id > 0)
          );
          const indicadoresLogicos = agruparIndicadoresLogicos(
            new Set<number>([...indicadorIdsAsignados, ...indicadorIdsConSeguimiento]),
            indicadores,
            "TAREAS"
          );
          const registrosTarea = dedupeSeguimientosActividadIndicadorLogico(
            seguimientosEstudiante.filter((item) => Number(item.EstructuraGrupoDetalleId) === detalleId),
            indicadoresTipo
          );
          const valoresTarea = indicadoresLogicos.map((columna) => {
            const ids = new Set((columna.indicadorIds || []).map((id) => Number(id)).filter((id) => id > 0));
            const registrosIndicador = registrosTarea.filter((item) => ids.has(Number(item.IndicadorGrupoId)));
            if (!registrosIndicador.length) return null;
            return (registrosIndicador.reduce((acc, item) => acc + Number(item.ValorSeleccionado || 0), 0) / registrosIndicador.length / 3) * 100;
          }).filter((valor): valor is number => valor !== null);

          if (indicadoresLogicos.length) {
            evaluados = valoresTarea.length;
            pendientes = Math.max(0, indicadoresLogicos.length - evaluados);
            porcentajeEvaluado = Number(((evaluados / indicadoresLogicos.length) * porcentajeComponente).toFixed(2));
            const promedioTarea = valoresTarea.length ? promedioNumeros(valoresTarea) : 0;
            porcentajeGanado = Number(((promedioTarea / 100) * porcentajeEvaluado).toFixed(2));
            nota = porcentajeComponente ? Math.min(100, (porcentajeGanado / porcentajeComponente) * 100) : 0;
            resumen = `${evaluados}/${indicadoresLogicos.length} indicadores calificados`;
          }
        }
        detallesLista = actividadesResumen.map((item) => ({
          key: `act-ind-${item.actividad.ActividadId}`,
          titulo: item.actividad.Nombre || "Actividad",
          subtitulo: `${item.indicadoresEvaluados}/${item.totalAsignados} indicadores evaluados`,
          nota: item.notaActividad,
          porcentaje: (item.notaActividad / 100) * porcentajeComponente * item.pesoActividad,
          estado: item.indicadoresEvaluados ? "Calificada" : "Pendiente",
          correoEnviado: Boolean((item as any).correoEnviado),
          waEnviado: Boolean((item as any).waEnviado)
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
            estado: registro?.NivelNombre || (valor === 0 && registro ? "Ausente / No entregado" : "Pendiente"),
            correoEnviado: Boolean((registro as any)?.CorreoEnviado || (registro as any)?.NotificacionCorreoEnviado),
            waEnviado: Boolean((registro as any)?.WaEnviado || (registro as any)?.WhatsappEnviado || (registro as any)?.NotificacionWaEnviado)
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
          actividadId: Number(item.actividad.ActividadId),
          notaActividadId: Number(item.notaItem?.NotaActividadId || 0),
          fueEditado: Number(item.notaItem?.FueEditado || 0) === 1,
          porcentajeObtenido: Number(item.notaItem?.PorcentajeObtenido ?? item.notaCalculada ?? 0),
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
          estado: item.tieneRegistroCalificado ? "Calificada" : "Pendiente",
          correoEnviado: Boolean((item.notaItem as any)?.CorreoEnviado || (item.notaItem as any)?.NotificacionCorreoEnviado),
          waEnviado: Boolean((item.notaItem as any)?.WaEnviado || (item.notaItem as any)?.WhatsappEnviado || (item.notaItem as any)?.NotificacionWaEnviado)
        }));
      }

      porcentajeGanadoOriginal = porcentajeGanado;
      const ajusteManual = ajustesMap.get(`${Number(estudiante.EstudianteId)}-${detalleId}`);
      const tieneAjusteManual = Number.isFinite(ajusteManual);
      if (tieneAjusteManual) {
        porcentajeGanado = Number(ajusteManual);
        nota = porcentajeComponente > 0 ? Math.min(100, (porcentajeGanado / porcentajeComponente) * 100) : 0;
        porcentajeEvaluado = porcentajeComponente;
        resumen = `Ajuste manual aplicado en Registro de Notas (${formatPercent(porcentajeGanado)}).`;
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
        detalles: detallesLista,
        ajustadoManual: tieneAjusteManual,
        porcentajeGanadoOriginal,
        porcentajeGanadoAjustado: tieneAjusteManual ? porcentajeGanado : null
      };
    }

    return estudiantes.map((estudiante) => {
      const componentes = detalles.map((detalleItem) => calcularComponente(detalleItem, estudiante));
      const totalEvaluado = Math.min(100, componentes.reduce((acc, item) => acc + Number((item as any).porcentajeEvaluado || 0), 0));
      const totalGanado = Math.min(100, componentes.reduce((acc, item) => acc + Number(item.porcentajeGanado || 0), 0));
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

  const estudiantesTrasladadosSet = useMemo(() => {
    const ids = new Set<number>();
    for (const estudiante of (seguimientoContexto?.estudiantes || [])) {
      if (Number(estudiante?.FueTrasladado || 0) === 1) ids.add(Number(estudiante.EstudianteId));
    }
    for (const estudiante of (detalle?.estudiantes || [])) {
      if (Number((estudiante as any)?.FueTrasladado || 0) === 1) ids.add(Number(estudiante.EstudianteId));
    }
    return ids;
  }, [seguimientoContexto?.estudiantes, detalle?.estudiantes]);

  const isEstudianteTrasladado = (estudianteId: number) => estudiantesTrasladadosSet.has(Number(estudianteId));
  const getTransferRowBg = (estudianteId: number, fallback: string) => (
    isEstudianteTrasladado(estudianteId) ? "#fff7cc" : fallback
  );
  const getTransferCellBg = (estudianteId: number, fallback: string) => (
    isEstudianteTrasladado(estudianteId) ? "#fffbeb" : fallback
  );


  useEffect(() => {
    if (!seguimientoTipo && seguimientoComponentes.length) {
      setSeguimientoTipo(seguimientoComponentes[0].tipo);
    }
  }, [seguimientoComponentes, seguimientoTipo]);

  useEffect(() => {
    if (activePanel !== "seguimiento") return;
    if (!selected) return;
    if (!asistenciaFecha) return;
    if (!isTipoAsistenciaSeguimiento(seguimientoTipo)) return;

    setSavedAsistencia(false);
    setAsistenciaNotificaciones({});
    void loadAsistencia(selected, asistenciaFecha);
  }, [
    activePanel,
    selected?.GrupoId,
    selected?.MateriaId,
    selected?.AnioLectivoId,
    selected?.PeriodoId,
    asistenciaFecha,
    seguimientoTipo
  ]);

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
    const seccionesUnicas = new Map<number, GrupoProfesor>();
    for (const grupo of grupos) {
        const mismoMateria = !materiaId || Number(grupo.MateriaId) === materiaId;
        const grupoGrado = getGradoPlaneamientoFromGrupo(grupo);
        const mismoGrado = !grado || grupoGrado === grado;
        const grupoId = Number(grupo.GrupoId || 0);
        if (mismoMateria && mismoGrado && grupoId > 0 && !seccionesUnicas.has(grupoId)) {
          seccionesUnicas.set(grupoId, grupo);
        }
    }
    return Array.from(seccionesUnicas.values())
      .sort((a, b) => String(a.GrupoNombre).localeCompare(String(b.GrupoNombre), undefined, { numeric: true }));
  }, [grupos, planeamientoIaForm.materiaId, planeamientoIaForm.grado, selected?.MateriaId, selected?.GrupoNivel, selected?.GrupoNombre]);

  const seccionesMismoGradoMateriaSeleccionado = useMemo(() => {
    if (!selected) return [] as GrupoProfesor[];
    const materiaId = Number(selected.MateriaId || 0);
    const grado = normalizarGradoPlaneamiento(getGradoPlaneamientoFromGrupo(selected) || "");
    const seccionesUnicas = new Map<string, GrupoProfesor>();
    for (const grupo of grupos) {
      if (Number(grupo.MateriaId || 0) !== materiaId) continue;
      const grupoGrado = normalizarGradoPlaneamiento(getGradoPlaneamientoFromGrupo(grupo) || "");
      const grupoId = Number(grupo.GrupoId || 0);
      const destinoKey = getIndicadoresDestinoKey(grupo);
      if ((!grado || grupoGrado === grado) && grupoId > 0 && destinoKey && !seccionesUnicas.has(destinoKey)) {
        seccionesUnicas.set(destinoKey, grupo);
      }
    }
    return Array.from(seccionesUnicas.values())
      .sort((a, b) => String(a.GrupoNombre).localeCompare(String(b.GrupoNombre), undefined, { numeric: true }));
  }, [grupos, selected]);

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

  const habilidadesFiltradasIa = useMemo(() => {
    return habilidadesIa.filter((habilidad) => {
      const mes = String(habilidad.Mes || "").trim();

      if (
        mesesSeleccionadosIa.length > 0
        && !mesesSeleccionadosIa.some((mesSeleccionado) => habilidadCorrespondeMes(mes, mesSeleccionado))
      ) return false;

      return true;
    });
  }, [habilidadesIa, mesesSeleccionadosIa]);

  const habilidadesFiltradasIndicadoresHabilidades = useMemo(() => {
    return habilidadesIa.filter((habilidad) => {
      const mes = String(habilidad.Mes || "").trim();
      if (
        indicadoresHabilidadesForm.meses.length > 0
        && !indicadoresHabilidadesForm.meses.some((mesSeleccionado) => habilidadCorrespondeMes(mes, mesSeleccionado))
      ) return false;
      return true;
    });
  }, [habilidadesIa, indicadoresHabilidadesForm.meses]);

  const nombreIndicadoresHabilidadesPreview = useMemo(() => {
    return getNombrePlaneamientoDesdeHabilidades(indicadoresHabilidadesForm.nombre);
  }, [indicadoresHabilidadesForm.nombre]);

  const firmaDatosPromptPlaneamientoIa = useMemo(() => JSON.stringify({
    nombre: planeamientoIaForm.nombre,
    materiaId: planeamientoIaForm.materiaId,
    grado: planeamientoIaForm.grado,
    grupoIds: planeamientoIaForm.grupoIds,
    mes: planeamientoIaForm.mes,
    periodicidad: planeamientoIaForm.periodicidad,
    fechaInicio: planeamientoIaForm.fechaInicio,
    fechaFin: planeamientoIaForm.fechaFin,
    competenciaGeneral: planeamientoIaForm.competenciaGeneral,
    habilidadesIds: planeamientoIaForm.habilidadesIds,
    indicaciones: planeamientoIaForm.indicaciones,
    tema: planeamientoIaForm.tema,
    area: planeamientoIaForm.area,
    materiaSeleccionadaId: selected?.MateriaId || null,
    grupoSeleccionadoId: selected?.GrupoId || null,
    archivosApoyo: documentoApoyoIa.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
    referencia: plantillaFormatoIa
      ? `${plantillaFormatoIa.name}:${plantillaFormatoIa.size}:${plantillaFormatoIa.lastModified}`
      : ""
  }), [
    planeamientoIaForm.nombre,
    planeamientoIaForm.materiaId,
    planeamientoIaForm.grado,
    planeamientoIaForm.grupoIds,
    planeamientoIaForm.mes,
    planeamientoIaForm.periodicidad,
    planeamientoIaForm.fechaInicio,
    planeamientoIaForm.fechaFin,
    planeamientoIaForm.competenciaGeneral,
    planeamientoIaForm.habilidadesIds,
    planeamientoIaForm.indicaciones,
    planeamientoIaForm.tema,
    planeamientoIaForm.area,
    selected?.MateriaId,
    selected?.GrupoId,
    documentoApoyoIa,
    plantillaFormatoIa
  ]);

  useEffect(() => {
    if (activePanel !== "planeamientos") return;
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
  }, [activePanel, planeamientoIaForm.materiaId, planeamientoIaForm.grado]);

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
        TipoAdecuacion: estudiante.TipoAdecuacion || estudiante.Adecuacion || null,
        NotasRegistradas: notasRegistradas,
        TotalActividades: detalle.actividades.length,
        AcumuladoEvaluacion: acumuladoEvaluacion,
        AusenciasEquivalentes: Number(asistencia?.AusenciasInjustificadasEquivalentes || 0),
        PorcentajeAusencias: Number(asistencia?.PorcentajeAusencias || 0),
        PorcentajeAsistencia: Number(asistencia?.PorcentajeAsignadoArticulo37 || 0),
        TotalLecciones: Number(asistencia?.TotalLecciones || 0),
        PromedioFinal: Number((acumuladoEvaluacion + Number(asistencia?.PorcentajeAsignadoArticulo37 || 0)).toFixed(2))
      };
    });

    const promedioAcumulado = filas.length
      ? filas.reduce((total, fila) => total + fila.AcumuladoEvaluacion, 0) / filas.length
      : 0;

    const promedioAsistencia = filas.length
      ? filas.reduce((total, fila) => total + fila.PorcentajeAsistencia, 0) / filas.length
      : 0;

    const promedioFinal = filas.length
      ? filas.reduce((total, fila) => total + fila.PromedioFinal, 0) / filas.length
      : 0;

    return {
      filas,
      promedioAcumulado,
      promedioAsistencia,
      promedioFinal,
      totalEstudiantes: filas.length
    };
  }, [detalle, noteDrafts, resumenAsistencia]);

  const promedioFinalPorEstudiante = useMemo(() => {
    const map = new Map<number, number>();
    for (const fila of resumenReportes.filas) {
      map.set(Number(fila.EstudianteId), Number(fila.PromedioFinal || 0));
    }
    return map;
  }, [resumenReportes]);

  const resumenReportesPorTipo = useMemo(() => {
    const estudiantes = detalle?.estudiantes || [];
    const actividades = seguimientoContexto?.actividades || [];
    const notasActividades = seguimientoContexto?.notasActividades || [];
    const detalles = seguimientoContexto?.detalles || [];
    const detallePorId = new Map<number, SeguimientoEvaluacionDetalle>();
    for (const item of detalles) detallePorId.set(Number(item.EstructuraGrupoDetalleId), item);

    const filtrarActividades = (tipo: "COTIDIANO" | "TAREAS" | "EXAMENES") => {
      return actividades.filter((actividad) => {
        const detalleItem = detallePorId.get(Number(actividad.EstructuraGrupoDetalleId));
        const tipoBase = normalizarSeguimientoKey(detalleItem?.TipoSeguimiento || detalleItem?.ComponenteCatalogoNombre || actividad.Fuente || "");
        if (tipo === "COTIDIANO") return tipoBase.includes("COTIDIAN");
        if (tipo === "TAREAS") return tipoBase.includes("TAREA");
        return tipoBase.includes("EXAMEN") || tipoBase.includes("PRUEBA") || tipoBase.includes("TABLA") || tipoBase.includes("ESPECIFIC");
      });
    };

    const construir = (tipo: "COTIDIANO" | "TAREAS" | "EXAMENES") => {
      const acts = dedupeActividadesLogicas(filtrarActividades(tipo));
      const ids = new Set(acts.map((a) => Number(a.ActividadId)));
      const filas = estudiantes.map((estudiante) => {
        const notas = notasActividades.filter((n) => Number(n.EstudianteId) === Number(estudiante.EstudianteId) && ids.has(Number(n.ActividadId)));
        const evaluadas = notas.filter((n) => n.PuntosObtenidos !== null && n.PuntosObtenidos !== undefined);
        const promedio = evaluadas.length
          ? evaluadas.reduce((acc, n) => acc + Number(n.PorcentajeObtenido || n.NotaObtenida || 0), 0) / evaluadas.length
          : 0;
        return {
          EstudianteId: estudiante.EstudianteId,
          NombreCompleto: getFullName(estudiante),
          Identificacion: estudiante.Identificacion,
          TipoAdecuacion: estudiante.TipoAdecuacion || estudiante.Adecuacion || null,
          ActividadesRegistradas: evaluadas.length,
          TotalActividades: acts.length,
          Promedio: promedio
        };
      });
      return { filas, totalActividades: acts.length };
    };

    return {
      cotidiano: construir("COTIDIANO"),
      tareas: construir("TAREAS"),
      examenes: construir("EXAMENES")
    };
  }, [detalle?.estudiantes, seguimientoContexto?.actividades, seguimientoContexto?.detalles, seguimientoContexto?.notasActividades]);

  const detalleReportesPorTipo = useMemo(() => {
    const estudiantes = detalle?.estudiantes || [];
    const actividades = seguimientoContexto?.actividades || [];
    const notasActividades = seguimientoContexto?.notasActividades || [];
    const seguimientos = seguimientoContexto?.seguimientos || [];
    const actividadIndicadores = seguimientoContexto?.actividadIndicadores || [];
    const indicadores = seguimientoContexto?.indicadores || [];
    const detalles = seguimientoContexto?.detalles || [];
    const detallePorId = new Map<number, SeguimientoEvaluacionDetalle>();
    for (const item of detalles) detallePorId.set(Number(item.EstructuraGrupoDetalleId), item);

    const filtrarActividades = (tipo: "COTIDIANO" | "TAREAS" | "EXAMENES") => {
      return actividades.filter((actividad) => {
        const detalleItem = detallePorId.get(Number(actividad.EstructuraGrupoDetalleId));
        const tipoBase = normalizarSeguimientoKey(detalleItem?.TipoSeguimiento || detalleItem?.ComponenteCatalogoNombre || actividad.Fuente || "");
        if (tipo === "COTIDIANO") return tipoBase.includes("COTIDIAN");
        if (tipo === "TAREAS") return tipoBase.includes("TAREA");
        return tipoBase.includes("EXAMEN") || tipoBase.includes("PRUEBA") || tipoBase.includes("TABLA") || tipoBase.includes("ESPECIFIC");
      });
    };

    const construir = (tipo: "COTIDIANO" | "TAREAS" | "EXAMENES") => {
      const esIndicadorTipo = (valor: string) => {
        const key = normalizarSeguimientoKey(valor || "");
        if (tipo === "COTIDIANO") return key.includes("COTIDIAN");
        return key.includes("TAREA");
      };

      if (tipo === "COTIDIANO" || tipo === "TAREAS") {
        const detalleIdsTipo = detalles
          .filter((d) => normalizarSeguimientoKey(d?.TipoSeguimiento || d?.ComponenteCatalogoNombre || "").includes(tipo === "COTIDIANO" ? "COTIDIAN" : "TAREA"))
          .map((d) => Number(d.EstructuraGrupoDetalleId || 0))
          .filter((v) => v > 0);
        const rubroValorTotal = Array.from(new Set(detalleIdsTipo)).reduce((acc, id) => acc + Number(detallePorId.get(id)?.Porcentaje || 0), 0);
        const actividadesTipo = dedupeActividadesLogicas(
          actividades.filter((a) => detalleIdsTipo.includes(Number(a.EstructuraGrupoDetalleId || 0)))
        );
        const actividadIdsTipo = new Set(actividadesTipo.map((a) => Number(a.ActividadId)).filter((id) => id > 0));
        const indicadorIdsAsignados = new Set(
          actividadIndicadores
            .filter((item) => actividadIdsTipo.has(Number(item.ActividadId)) && item.Activo !== false && item.Activo !== 0)
            .map((item) => Number(item.IndicadorGrupoId))
            .filter((id) => id > 0)
        );
        const indicadorIdsConSeguimiento = new Set(
          seguimientos
            .filter((s) => detalleIdsTipo.includes(Number(s.EstructuraGrupoDetalleId || 0)))
            .map((s) => Number(s.IndicadorGrupoId))
            .filter((id) => id > 0)
        );
        const indicadorIdsTipo = new Set<number>([...indicadorIdsAsignados, ...indicadorIdsConSeguimiento]);
        const columns = agruparIndicadoresLogicos(indicadorIdsTipo, indicadores, tipo);

        const rows = estudiantes.map((estudiante) => {
          const registrosEstudiante = dedupeSeguimientosActividadIndicadorLogico(
            seguimientos.filter(
              (s) =>
                Number(s.EstudianteId) === Number(estudiante.EstudianteId)
                && detalleIdsTipo.includes(Number(s.EstructuraGrupoDetalleId || 0))
            ),
            indicadores.filter((i) => esIndicadorTipo(String(i?.TipoUso || "")))
          );
          const notasEstudiante = notasActividades.filter((n) => Number((n as any).EstudianteId) === Number(estudiante.EstudianteId));
          const valoresNumericos: number[] = [];
          const valoresCols = columns.map((col) => {
            const idsColumna = new Set((col.indicadorIds || []).map((id) => Number(id)).filter((id) => id > 0));
            const regs = registrosEstudiante.filter((r) => idsColumna.has(Number(r.IndicadorGrupoId)));
            if (!regs.length) return "-";
            const promedioValor = regs.reduce((acc, r) => acc + Number(r.ValorSeleccionado || 0), 0) / regs.length;
            const porcentaje = Number(((promedioValor / 3) * 100).toFixed(2));
            valoresNumericos.push(porcentaje);
            const correoSeg = regs.some((r: any) => Boolean(r?.CorreoEnviado || r?.NotificacionCorreoEnviado));
            const waSeg = regs.some((r: any) => Boolean(r?.WaEnviado || r?.WhatsappEnviado || r?.NotificacionWaEnviado));
            const actividadIds = new Set(regs.map((r) => Number((r as any).ActividadId || 0)).filter((id) => id > 0));
            const notaActividad = notasEstudiante.filter((n: any) => actividadIds.has(Number(n?.ActividadId || 0)));
            const correoNota = notaActividad.some((n: any) => Boolean(n?.CorreoEnviado || n?.NotificacionCorreoEnviado));
            const waNota = notaActividad.some((n: any) => Boolean(n?.WaEnviado || n?.WhatsappEnviado || n?.NotificacionWaEnviado));
            const correo = correoSeg || correoNota;
            const wa = waSeg || waNota;
            const recuperacion = regs.some((r: any) => Boolean(r?.ActRecuperacion || r?.actividadRecuperacion));
            const etiqueta = [correo ? "Correo" : "", wa ? "WA" : "", recuperacion ? "Recuperación" : ""].filter(Boolean).join("/");
            return etiqueta ? `${porcentaje.toFixed(2)}% (${etiqueta})` : `${porcentaje.toFixed(2)}%`;
          });

          const totalIndicadores = columns.length;
          const evaluados = valoresNumericos.length;
          const porcentajeEvaluado = totalIndicadores > 0
            ? Number((((evaluados / totalIndicadores) * rubroValorTotal)).toFixed(2))
            : 0;
          const promedioIndicadores = evaluados > 0
            ? (valoresNumericos.reduce((acc, v) => acc + Number(v || 0), 0) / evaluados)
            : 0;
          const porcentajeGanado = Number(((promedioIndicadores / 100) * porcentajeEvaluado).toFixed(2));

          return {
            EstudianteId: Number(estudiante.EstudianteId),
            NombreCompleto: getFullName(estudiante),
            Identificacion: String(estudiante.Identificacion || ""),
            TipoAdecuacion: estudiante.TipoAdecuacion || estudiante.Adecuacion || null,
            RegistradasCalificadas: `${evaluados}/${totalIndicadores}`,
            porcentajeEvaluado,
            porcentajeGanado,
            cols: valoresCols
          };
        });
        return { columns, rows };
      }

      const acts = dedupeActividadesLogicas(filtrarActividades("EXAMENES"));
      const detalleIdsTipo = Array.from(new Set(acts.map((a) => Number(a.EstructuraGrupoDetalleId || 0)).filter((v) => v > 0)));
      const rubroValorTotal = detalleIdsTipo.reduce((acc, id) => acc + Number(detallePorId.get(id)?.Porcentaje || 0), 0);
      const sumaPesosConfig = acts.reduce((acc, item) => {
        const peso = Number(item.PorcentajeDentroRubro || 0);
        return acc + (Number.isFinite(peso) && peso > 0 ? peso : 0);
      }, 0);
      const columns = acts.map((a) => ({
        actividadId: Number(a.ActividadId),
        nombre: String(a.Nombre || `Examen ${a.ActividadId}`)
      }));
      const rows = estudiantes.map((estudiante) => {
        const notas = notasActividades.filter((n) => Number(n.EstudianteId) === Number(estudiante.EstudianteId));
        const porActividad = new Map<number, any>();
        for (const nota of notas) porActividad.set(Number(nota.ActividadId), nota);
        const valoresCols = columns.map((col) => {
          const nota = porActividad.get(col.actividadId);
          if (!nota) return "-";
          const tieneCalif = nota.PuntosObtenidos !== null && nota.PuntosObtenidos !== undefined;
          if (!tieneCalif) return "Registrada";
          const puntosObtenidos = Number(nota.PuntosObtenidos || 0);
          const puntosMaximos = Number(nota.PuntosMaximos || 0);
          const notaPorcentaje = puntosMaximos > 0
            ? (puntosObtenidos / puntosMaximos) * 100
            : Number(nota.PorcentajeObtenido || nota.NotaObtenida || 0);
          return `${Number(notaPorcentaje || 0).toFixed(2)}% (${puntosObtenidos.toFixed(2)}/${puntosMaximos.toFixed(2)})`;
        });
        const totalActividades = columns.length;
        const calificadasNotas = columns
          .map((col) => porActividad.get(col.actividadId))
          .filter((n) => n && n.PuntosObtenidos !== null && n.PuntosObtenidos !== undefined);
        const calificadas = calificadasNotas.length;
        let porcentajeEvaluado = 0;
        let porcentajeGanado = 0;
        if (totalActividades > 0) {
          for (const col of columns) {
            const nota = porActividad.get(col.actividadId);
            if (!nota || nota.PuntosObtenidos === null || nota.PuntosObtenidos === undefined) continue;
            const actividad = acts.find((a) => Number(a.ActividadId) === Number(col.actividadId));
            const pesoActividad = sumaPesosConfig > 0
              ? Math.max(0, Number(actividad?.PorcentajeDentroRubro || 0))
              : (rubroValorTotal / totalActividades);
            const puntosObtenidos = Number(nota.PuntosObtenidos || 0);
            const puntosMaximos = Number(nota.PuntosMaximos || actividad?.PuntosMaximos || 0);
            const notaPct = puntosMaximos > 0
              ? (puntosObtenidos / puntosMaximos) * 100
              : Number(nota.PorcentajeObtenido || nota.NotaObtenida || 0);
            porcentajeEvaluado += pesoActividad;
            porcentajeGanado += (Number(notaPct || 0) / 100) * pesoActividad;
          }
        }
        porcentajeEvaluado = Number(porcentajeEvaluado.toFixed(2));
        porcentajeGanado = Number(porcentajeGanado.toFixed(2));

        return {
          EstudianteId: Number(estudiante.EstudianteId),
          NombreCompleto: getFullName(estudiante),
          Identificacion: String(estudiante.Identificacion || ""),
          TipoAdecuacion: estudiante.TipoAdecuacion || estudiante.Adecuacion || null,
          RegistradasCalificadas: `${calificadas}/${totalActividades}`,
          porcentajeEvaluado,
          porcentajeGanado,
          cols: valoresCols
        };
      });
      return { columns, rows };
    };

    return {
      cotidiano: construir("COTIDIANO"),
      tareas: construir("TAREAS"),
      examenes: construir("EXAMENES")
    };
  }, [detalle?.estudiantes, seguimientoContexto?.actividades, seguimientoContexto?.detalles, seguimientoContexto?.notasActividades, seguimientoContexto?.seguimientos, seguimientoContexto?.actividadIndicadores, seguimientoContexto?.indicadores]);

  const reporteAsistenciaDetallado = useMemo(() => {
    const estudiantes = detalle?.estudiantes || [];
    const registros = seguimientoContexto?.asistenciaRegistros || [];
    const detallesSeguimiento = seguimientoContexto?.detalles || [];
    const porcentajeComponenteAsistencia = detallesSeguimiento
      .filter((d: any) => normalizarSeguimientoKey(String(d?.TipoSeguimiento || d?.ComponenteCatalogoNombre || "")).includes("ASIST"))
      .reduce((acc: number, d: any) => acc + Number(d?.Porcentaje || 0), 0);
    const formatFecha = (raw: string) => {
      const src = String(raw || "");
      const iso = src.slice(0, 10);
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      const d = new Date(src);
      if (!Number.isFinite(d.getTime())) return src;
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      return `${dd}/${mm}/${yyyy}`;
    };
    const keyEstado = (estado: string) => normalizarSeguimientoKey(estado || "");
    const esAusenciaInjustificada = (estado: string) => {
      const k = keyEstado(estado);
      if (k.includes("AUSENTE_JUSTIFICADA")) return false;
      if (k.includes("TARDIA_MAYOR")) return true;
      if (k.includes("AUSENTE_INJUSTIFICADA")) return true;
      return false;
    };
    const estadoCodigo = (estado: string) => {
      const k = keyEstado(estado);
      if (k.includes("PRESENTE")) return "P";
      if (k.includes("TARDIA_MENOR")) return "T";
      if (k.includes("AUSENTE_JUSTIFICADA")) return "AJ";
      if (esAusenciaInjustificada(estado)) return "AI";
      return "-";
    };
    const ordenados = [...registros].sort((a: any, b: any) => {
      const fa = String(a?.Fecha || "");
      const fb = String(b?.Fecha || "");
      if (fa !== fb) return fa.localeCompare(fb);
      const ha = String(a?.HoraInicio || "");
      const hb = String(b?.HoraInicio || "");
      if (ha !== hb) return ha.localeCompare(hb);
      return Number(a?.HorarioGrupoId || 0) - Number(b?.HorarioGrupoId || 0);
    });
    const columnasMap = new Map<string, any>();
    for (const r of ordenados) {
      const fechaIso = String(r?.Fecha || "").slice(0, 10);
      const fechaLabel = formatFecha(String(r?.Fecha || ""));
      const bloque = String(r?.BloqueNombre || "Lección");
      const columnaKey = `${fechaIso}|${String(r?.HorarioGrupoId || "")}|${bloque}`;
      if (!columnasMap.has(columnaKey)) {
        columnasMap.set(columnaKey, {
          key: columnaKey,
          fechaIso,
          fechaLabel,
          bloque,
          horarioGrupoId: Number(r?.HorarioGrupoId || 0)
        });
      }
    }
    const columnas = Array.from(columnasMap.values());
    const gruposFechaMap = new Map<string, { fechaIso: string; fechaLabel: string; columns: any[] }>();
    for (const col of columnas) {
      const key = String(col.fechaIso);
      if (!gruposFechaMap.has(key)) {
        gruposFechaMap.set(key, { fechaIso: key, fechaLabel: String(col.fechaLabel || key), columns: [] });
      }
      gruposFechaMap.get(key)!.columns.push(col);
    }
    const gruposFecha = Array.from(gruposFechaMap.values()).sort((a, b) => a.fechaIso.localeCompare(b.fechaIso));
    const columnasPlanas = gruposFecha.flatMap((g) => g.columns);
    const registrosPorEstudiante = new Map<number, any[]>();
    for (const r of registros as any[]) {
      const estId = Number(r?.EstudianteId || 0);
      if (!registrosPorEstudiante.has(estId)) registrosPorEstudiante.set(estId, []);
      registrosPorEstudiante.get(estId)!.push(r);
    }

    const rows = estudiantes.map((est) => {
      const estRegs = registrosPorEstudiante.get(Number(est.EstudianteId)) || [];
      const totalLecciones = estRegs.length;
      const tardias = estRegs.filter((r: any) => keyEstado(String(r?.Estado || "")).includes("TARDIA_MENOR")).length;
      const ausJust = estRegs.filter((r: any) => keyEstado(String(r?.Estado || "")).includes("AUSENTE_JUSTIFICADA")).length;
      const ausInjust = estRegs.filter((r: any) => esAusenciaInjustificada(String(r?.Estado || ""))).length;
      const ausEquiv = estRegs.reduce((acc: number, r: any) => {
        const estado = String(r?.Estado || "");
        if (keyEstado(estado).includes("TARDIA_MENOR")) return acc + 0.5;
        if (esAusenciaInjustificada(estado)) return acc + 1;
        return acc;
      }, 0);
      const pctAus = totalLecciones > 0 ? (ausEquiv / totalLecciones) * 100 : 0;
      const notaAsistencia = totalLecciones > 0 ? (((() => {
        if (pctAus >= 50) return 0;
        if (pctAus >= 40) return 1;
        if (pctAus >= 30) return 2;
        if (pctAus >= 20) return 3;
        if (pctAus >= 10) return 4;
        return 5;
      })() / 5) * 100) : 0;
      const porcentajeGanadoAsistencia = Number(((notaAsistencia / 100) * porcentajeComponenteAsistencia).toFixed(2));
      const alerta = pctAus < 15 ? "Bien" : (pctAus < 20 ? "Posible Alerta" : "Alerta");
      const alertaBg = pctAus < 15 ? "#dcfce7" : (pctAus < 20 ? "#fef9c3" : "#fee2e2");
      const alertaColor = pctAus < 15 ? "#166534" : (pctAus < 20 ? "#854d0e" : "#991b1b");
      const porColumna = new Map<string, string>();
      const regPorColumna = new Map<string, any>();
      for (const x of estRegs as any[]) {
        const k = `${String(x?.Fecha || "").slice(0, 10)}|${String(x?.HorarioGrupoId || "")}|${String(x?.BloqueNombre || "Lección")}`;
        if (!regPorColumna.has(k)) regPorColumna.set(k, x);
      }
      for (const col of columnasPlanas) {
        const r = regPorColumna.get(col.key);
        if (!r) {
          porColumna.set(col.key, "-");
          continue;
        }
        const codigo = estadoCodigo(String(r?.Estado || ""));
        const tags: string[] = [];
        if (Boolean((r as any)?.CorreoEnviado)) tags.push("Correo");
        if (Boolean((r as any)?.WaEnviado)) tags.push("WA");
        porColumna.set(col.key, tags.length ? `${codigo} (${tags.join("/")})` : codigo);
      }
      return {
        estudianteId: Number(est.EstudianteId),
        nombre: getFullName(est),
        identificacion: String(est.Identificacion || ""),
        tipoAdecuacion: est.TipoAdecuacion || est.Adecuacion || null,
        nota: porcentajeGanadoAsistencia,
        promedioFinal: Number(promedioFinalPorEstudiante.get(Number(est.EstudianteId)) || 0),
        alerta,
        alertaBg,
        alertaColor,
        tardias,
        ausJust,
        ausInjust,
        porColumna
      };
    });
    return { gruposFecha, columnas, columnasPlanas, rows };
  }, [detalle?.estudiantes, seguimientoContexto?.asistenciaRegistros, seguimientoContexto?.detalles, promedioFinalPorEstudiante]);

  const ultimaBitacora = useMemo(() => {
    if (!bitacorasGrupo.length) return null;
    return bitacorasGrupo[0];
  }, [bitacorasGrupo]);

  const boletasConductaFiltradas = useMemo(() => {
    const grupoNombre = String(selected?.GrupoNombre || "").trim().toUpperCase();
    if (!grupoNombre) return boletasConductaReporte;
    return boletasConductaReporte.filter((item) => String(item.Seccion || "").trim().toUpperCase() === grupoNombre);
  }, [boletasConductaReporte, selected?.GrupoNombre]);

  function exportarReporteCsv() {
    if (!detalle || resumenReportes.filas.length === 0) return;

    const headers = [
      "Estudiante",
      "Identificación",
      "Total actividades",
      "Lecciones registradas",
      "Ausencias equivalentes",
      "% ausencias",
      "% asistencia Artículo 37",
      "Promedio final"
    ];

    const rows = resumenReportes.filas.map((fila) => [
      fila.NombreCompleto,
      fila.Identificacion,
      String(fila.TotalActividades),
      String(fila.TotalLecciones),
      fila.AusenciasEquivalentes.toFixed(2),
      fila.PorcentajeAusencias.toFixed(2),
      fila.PorcentajeAsistencia.toFixed(2),
      fila.PromedioFinal.toFixed(2)
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
          periodoId: selected.PeriodoId,
          ...getGrupoClaseParams(selected)
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
          periodoId: selected.PeriodoId,
          ...getGrupoClaseParams(selected)
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
      const data = error?.response?.data;
      let detalle = "";
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text);
          detalle = parsed?.message || text;
        } catch {
          detalle = "";
        }
      }
      alert(detalle || error?.response?.data?.message || "No se pudo generar la plantilla Word del planeamiento");
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

  function escapeHtmlExport(value: any) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function exportarTablaGenericaExcel(
    fileName: string,
    titulo: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    adecuaciones: Array<string | null | undefined> = []
  ) {
    const thead = `<tr>${headers.map((h) => `<th style="border:1px solid #cbd5e1;padding:8px;background:#f1f5f9">${escapeHtmlExport(h)}</th>`).join("")}</tr>`;
    const tbody = rows.map((row, rowIndex) => {
      const rowStyle = getAdecuacionListHtmlStyle(adecuaciones[rowIndex], rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc");
      return `<tr>${row.map((cell) => `<td style="border:1px solid #cbd5e1;padding:8px;${rowStyle}">${escapeHtmlExport(cell)}</td>`).join("")}</tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><h3>${escapeHtmlExport(titulo)}</h3><table style="border-collapse:collapse">${thead}${tbody}</table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    descargarBlob(blob, `${fileName}.xls`);
  }

  function exportarTablaGenericaPdf(
    titulo: string,
    headers: string[],
    rows: Array<Array<string | number>>,
    adecuaciones: Array<string | null | undefined> = []
  ) {
    const thead = `<tr>${headers.map((h) => `<th>${escapeHtmlExport(h)}</th>`).join("")}</tr>`;
    const tbody = rows.map((row, rowIndex) => {
      const rowStyle = getAdecuacionListHtmlStyle(adecuaciones[rowIndex], rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc");
      return `<tr>${row.map((cell) => `<td style="${rowStyle}">${escapeHtmlExport(cell)}</td>`).join("")}</tr>`;
    }).join("");
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtmlExport(titulo)}</title>
<style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px}th{background:#f1f5f9}</style>
</head><body><h2>${escapeHtmlExport(titulo)}</h2><table>${thead}${tbody}</table><script>window.onload=function(){window.print();}</script></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function exportarReporteActualExcel() {
    if (!selected) return;
    if (tipoReporteGestion === "NOTAS") return void exportarReporteExcel();
    if (tipoReporteGestion === "MENSAJES") return void exportarAuditoriaEnviosExcel();

    const base = `${selected.GrupoNombre}-${selected.MateriaNombre}`.replace(/\s+/g, "-");
    if (tipoReporteGestion === "ASISTENCIA") {
      const headers = ["Estudiante", "Identificación", "Total lecciones", "Ausencias equivalentes", "% ausencias", "% asistencia Art. 37", "Promedio final"];
      const rows = resumenReportes.filas.map((f) => [f.NombreCompleto, f.Identificacion, f.TotalLecciones, f.AusenciasEquivalentes.toFixed(2), f.PorcentajeAusencias.toFixed(2), f.PorcentajeAsistencia.toFixed(2), f.PromedioFinal.toFixed(2)]);
      return exportarTablaGenericaExcel(`reporte-asistencia-${base}`, "Reporte de Asistencia", headers, rows, resumenReportes.filas.map((f) => f.TipoAdecuacion));
    }
    if (tipoReporteGestion === "COTIDIANO" || tipoReporteGestion === "TAREAS" || tipoReporteGestion === "EXAMENES") {
      const fuente = tipoReporteGestion === "COTIDIANO" ? detalleReportesPorTipo.cotidiano : tipoReporteGestion === "TAREAS" ? detalleReportesPorTipo.tareas : detalleReportesPorTipo.examenes;
      const headers = ["Estudiante", "Identificación", "Actividades registradas/calificadas", ...fuente.columns.map((c) => c.nombre), "% evaluado", "% ganado", "Promedio final"];
      const rows = fuente.rows.map((f) => [f.NombreCompleto, f.Identificacion, f.RegistradasCalificadas, ...f.cols, `${Number(f.porcentajeEvaluado || 0).toFixed(2)}%`, `${Number(f.porcentajeGanado || 0).toFixed(2)}%`, `${Number(promedioFinalPorEstudiante.get(Number(f.EstudianteId)) || 0).toFixed(2)}%`]);
      return exportarTablaGenericaExcel(`reporte-${tipoReporteGestion.toLowerCase()}-${base}`, `Reporte de ${tipoReporteGestion}`, headers, rows, fuente.rows.map((f) => f.TipoAdecuacion));
    }
    if (tipoReporteGestion === "BOLETAS") {
      const headers = ["N°", "Fecha", "Estudiante", "Sección", "Funcionario", "Envíos correo"];
      const rows = boletasConductaFiltradas.map((b) => [String(b.CodigoBoleta || "").trim() || String(Number(b.Consecutivo || 0)).padStart(3, "0"), String(b.Fecha || "").slice(0, 10), [b.PrimerApellido || "", b.SegundoApellido || "", b.Nombre || ""].join(" ").replace(/\s+/g, " ").trim(), b.Seccion || "", b.NombreFuncionario || "", `${Number(b.TotalEnviosExitosos || 0)} / ${Number(b.TotalEnviosCorreo || 0)}`]);
      return exportarTablaGenericaExcel(`reporte-boletas-${base}`, "Reporte de Boletas", headers, rows, boletasConductaFiltradas.map((b) => b.TipoAdecuacion));
    }
    if (tipoReporteGestion === "BITACORA") {
      const headers = ["Fecha", "Temas desarrollados", "Observaciones", "Hechos relevantes", "Usuario"];
      const rows = bitacorasGrupo.map((b) => [String(b.FechaRegistro || "").slice(0, 10), b.TemasDesarrollados || "", b.Observaciones || "", b.HechosRelevantes || "", b.NombreUsuario || ""]);
      return exportarTablaGenericaExcel(`reporte-bitacora-${base}`, "Reporte de Bitácora", headers, rows);
    }
  }

  function exportarReporteActualPdf() {
    if (!selected) return;
    if (tipoReporteGestion === "NOTAS") return void exportarReportePdf();

    if (tipoReporteGestion === "MENSAJES") {
      const headers = ["Fecha", "Módulo", "Estudiante", "Identificación", "Correo", "WA", "Último envío"];
      const rows = auditoriaEnvios.map((f) => [f.Fecha ? String(f.Fecha).slice(0, 10) : "", f.ModuloNombre || f.Modulo, [f.Nombre, f.PrimerApellido, f.SegundoApellido].filter(Boolean).join(" "), f.Identificacion || "", f.CorreoEnviado ? "Enviado" : "No", f.WaEnviado ? "Enviado" : "No", f.UltimoEnvioAt ? String(f.UltimoEnvioAt).slice(0, 19).replace("T", " ") : ""]);
      return exportarTablaGenericaPdf("Reporte de mensajes enviados", headers, rows, auditoriaEnvios.map((f) => f.TipoAdecuacion));
    }

    if (tipoReporteGestion === "ASISTENCIA") {
      const headers = ["Estudiante", "Identificación", "Total lecciones", "Ausencias equivalentes", "% ausencias", "% asistencia Art. 37", "Promedio final"];
      const rows = resumenReportes.filas.map((f) => [f.NombreCompleto, f.Identificacion, f.TotalLecciones, f.AusenciasEquivalentes.toFixed(2), f.PorcentajeAusencias.toFixed(2), f.PorcentajeAsistencia.toFixed(2), f.PromedioFinal.toFixed(2)]);
      return exportarTablaGenericaPdf("Reporte de Asistencia", headers, rows, resumenReportes.filas.map((f) => f.TipoAdecuacion));
    }
    if (tipoReporteGestion === "COTIDIANO" || tipoReporteGestion === "TAREAS" || tipoReporteGestion === "EXAMENES") {
      const fuente = tipoReporteGestion === "COTIDIANO" ? detalleReportesPorTipo.cotidiano : tipoReporteGestion === "TAREAS" ? detalleReportesPorTipo.tareas : detalleReportesPorTipo.examenes;
      const headers = ["Estudiante", "Identificación", "Actividades registradas/calificadas", ...fuente.columns.map((c) => c.nombre), "% evaluado", "% ganado", "Promedio final"];
      const rows = fuente.rows.map((f) => [f.NombreCompleto, f.Identificacion, f.RegistradasCalificadas, ...f.cols, `${Number(f.porcentajeEvaluado || 0).toFixed(2)}%`, `${Number(f.porcentajeGanado || 0).toFixed(2)}%`, `${Number(promedioFinalPorEstudiante.get(Number(f.EstudianteId)) || 0).toFixed(2)}%`]);
      return exportarTablaGenericaPdf(`Reporte de ${tipoReporteGestion}`, headers, rows, fuente.rows.map((f) => f.TipoAdecuacion));
    }
    if (tipoReporteGestion === "BOLETAS") {
      const headers = ["N°", "Fecha", "Estudiante", "Sección", "Funcionario", "Envíos correo"];
      const rows = boletasConductaFiltradas.map((b) => [String(b.CodigoBoleta || "").trim() || String(Number(b.Consecutivo || 0)).padStart(3, "0"), String(b.Fecha || "").slice(0, 10), [b.PrimerApellido || "", b.SegundoApellido || "", b.Nombre || ""].join(" ").replace(/\s+/g, " ").trim(), b.Seccion || "", b.NombreFuncionario || "", `${Number(b.TotalEnviosExitosos || 0)} / ${Number(b.TotalEnviosCorreo || 0)}`]);
      return exportarTablaGenericaPdf("Reporte de Boletas", headers, rows, boletasConductaFiltradas.map((b) => b.TipoAdecuacion));
    }
    if (tipoReporteGestion === "BITACORA") {
      const headers = ["Fecha", "Temas desarrollados", "Observaciones", "Hechos relevantes", "Usuario"];
      const rows = bitacorasGrupo.map((b) => [String(b.FechaRegistro || "").slice(0, 10), b.TemasDesarrollados || "", b.Observaciones || "", b.HechosRelevantes || "", b.NombreUsuario || ""]);
      return exportarTablaGenericaPdf("Reporte de Bitácora", headers, rows);
    }
  }

  async function cargarAuditoriaEnvios(item = selected) {
    if (!item) return;
    const reqKey = `${item.GrupoId}|${item.MateriaId}|${item.AnioLectivoId}|${item.PeriodoId}|${auditoriaEnviosDesde}|${auditoriaEnviosHasta}`;
    if (auditoriaInFlightKeyRef.current === reqKey) return;
    auditoriaInFlightKeyRef.current = reqKey;
    setLoadingAuditoriaEnvios(true);
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/reportes/auditoria-envios`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          desde: auditoriaEnviosDesde,
          hasta: auditoriaEnviosHasta
        }
      });
      const data = response.data?.data || {};
      setAuditoriaEnvios(Array.isArray(data.filas) ? data.filas : []);
    } catch (error: any) {
      console.error("Error cargando auditoría de envíos:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la auditoría de envíos");
    } finally {
      setLoadingAuditoriaEnvios(false);
      if (auditoriaInFlightKeyRef.current === reqKey) auditoriaInFlightKeyRef.current = "";
    }
  }

  async function exportarAuditoriaEnviosExcel() {
    if (!selected) return;
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/reportes/auditoria-envios/excel`, {
        params: {
          anioLectivoId: selected.AnioLectivoId,
          periodoId: selected.PeriodoId,
          desde: auditoriaEnviosDesde,
          hasta: auditoriaEnviosHasta
        },
        responseType: "blob"
      });
      descargarBlob(response.data, `auditoria-envios-${selected.GrupoNombre}-${selected.MateriaNombre}-${auditoriaEnviosDesde}-a-${auditoriaEnviosHasta}.xlsx`);
    } catch (error: any) {
      console.error("Error exportando auditoría de envíos:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo exportar la auditoría de envíos");
    }
  }

  async function cargarBoletasConductaReporte() {
    setLoadingBoletasReporte(true);
    try {
      const response = await api.get("/reportes/boletas-conducta");
      const data = response.data?.data || response.data || [];
      setBoletasConductaReporte(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error cargando boletas de conducta:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el reporte de boletas");
    } finally {
      setLoadingBoletasReporte(false);
    }
  }

  function asistenciaDraftComparable(draft?: { estado: EstadoAsistencia; minutosTardia: string; observacion: string; notificarEncargado?: boolean }) {
    const estado = draft?.estado || "PRESENTE";
    const minutos = draft?.minutosTardia === "" || draft?.minutosTardia == null ? 0 : Number(draft.minutosTardia);
    return {
      estado,
      minutosTardia: Number.isFinite(minutos) ? minutos : 0,
      observacion: String(draft?.observacion || "").trim()
    };
  }

function estadoAsistenciaLabel(estado: EstadoAsistencia) {
    switch (estado) {
      case "PRESENTE": return "Presente";
      case "AUSENTE_JUSTIFICADA": return "Ausente justificada";
      case "AUSENTE_INJUSTIFICADA": return "Ausente injustificada";
      case "TARDIA_MENOR_10": return "Tardía menor a 10 min";
      case "TARDIA_MAYOR_10": return "Ausente (Llega 10 minutos tarde)";
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
  if (estado === "TARDIA_MAYOR_10") {
    return String(porNivel(3)?.Cuerpo || "").trim();
  }
  return "";
}

const ESTADOS_ASISTENCIA_INFORMAR_ENCARGADO = new Set<EstadoAsistencia>([
  "AUSENTE_INJUSTIFICADA",
  "TARDIA_MENOR_10",
  "TARDIA_MAYOR_10"
]);

function debeInformarEncargadoPorEstadoAsistencia(estado: EstadoAsistencia) {
  return ESTADOS_ASISTENCIA_INFORMAR_ENCARGADO.has(estado);
}

function formatFechaAsistenciaMensaje(value?: string | null) {
  const iso = String(value || "").slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso || "Sin fecha";
}

function getMensajeAsistenciaFallback(estado: EstadoAsistencia) {
  if (estado === "AUSENTE_JUSTIFICADA") {
    return "Se informa la ausencia justificada registrada para el estudiante.";
  }
  if (estado === "PRESENTE") {
    return "Se informa el estado de asistencia registrado para el estudiante.";
  }
  return `Se informa el estado registrado: ${estadoAsistenciaLabel(estado)}.`;
}

function getAsistenciaEncargadoTooltip(params: {
  estudiante: EstudianteGrupo;
  leccion: AsistenciaLeccion;
  draft: { estado: EstadoAsistencia; minutosTardia: string; observacion: string; notificarEncargado?: boolean };
  fecha: string;
  materia?: string | null;
}) {
  if (!params.draft?.notificarEncargado) return "Informar al encargado";
  const estado = params.draft.estado || "PRESENTE";
  const observacion = String(params.draft.observacion || "").trim();
  const mensaje = observacion || getMensajeAsistenciaFallback(estado);
  const minutos = params.draft.minutosTardia !== "" && params.draft.minutosTardia != null
    ? `\nMinutos tarde: ${params.draft.minutosTardia}`
    : "";

  return [
    "Mensaje que se enviara al encargado:",
    "",
    `Estudiante: ${getFullName(params.estudiante)}`,
    `Fecha: ${formatFechaAsistenciaMensaje(params.fecha)}`,
    `Materia: ${String(params.materia || "Materia").trim()}`,
    `Leccion: ${String(params.leccion?.Nombre || "Leccion").trim()}`,
    `Estado: ${estadoAsistenciaLabel(estado)}${minutos}`,
    "",
    mensaje
  ].join("\n");
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

  function getTablaCasosProblemasCantidad(detalle: ReturnType<typeof getTablaDetalle>) {
    const problemas = Number(String(detalle.resolucionProblemasCantidad || "0").replace(",", ".")) || 0;
    const casos = Number(String(detalle.resolucionCasosCantidad || "0").replace(",", ".")) || 0;
    return String(Math.round(problemas + casos));
  }

  function getTablaCasosProblemasPuntos(detalle: ReturnType<typeof getTablaDetalle>) {
    const problemas = Number(String(detalle.resolucionProblemasPuntos || "0").replace(",", ".")) || 0;
    const casos = Number(String(detalle.resolucionCasosPuntos || "0").replace(",", ".")) || 0;
    return String(Math.round(Math.max(problemas, casos)));
  }

  function updateTablaCasosProblemasDetalle(actividadId: number, indicadorId: number, field: "cantidad" | "puntos", value: string) {
    const normalizedValue = String(value || "").replace(/[^\d]/g, "");
    const key = getTablaDetalleKey(actividadId, indicadorId);
    const actual = getTablaDetalle(actividadId, indicadorId);
    setTablaDetalleDrafts((prev) => ({
      ...prev,
      [key]: {
        ...actual,
        resolucionProblemasCantidad: field === "cantidad" ? normalizedValue : actual.resolucionProblemasCantidad,
        resolucionProblemasPuntos: field === "puntos" ? normalizedValue : actual.resolucionProblemasPuntos,
        resolucionCasosCantidad: "0",
        resolucionCasosPuntos: "0"
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
        const restricciones = getTablaRestriccionesDetalle(detalle);
        if (Number(puntosItems) !== Number(puntosCalculadosFila)) filasIncompletas += 1;
        if (restricciones.length > 0) filasIncompletas += 1;
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
    const nombreManual = String(actividad.Nombre || "").trim();
    if (nombreManual) return nombreManual;
    return `Prueba ${index + 1} - ${Number(actividad.PorcentajeDentroRubro || 0).toFixed(2)}%`;
  }

  function getPruebaExamenLabel(actividad: SeguimientoActividad) {
    const idx = tablaActividadesExamen.findIndex((item) => Number(item.ActividadId) === Number(actividad.ActividadId));
    return `Prueba (examen) ${idx >= 0 ? idx + 1 : Number(actividad.ActividadId)}`;
  }

  function getPuntosPorItems(detalle: ReturnType<typeof getTablaDetalle>) {
    const casosProblemasCantidad = getTablaCasosProblemasCantidad(detalle);
    const casosProblemasPuntos = getTablaCasosProblemasPuntos(detalle);
    const pares: Array<[string, string]> = [
      [detalle.seleccionRespuestaCantidad, detalle.seleccionRespuestaPuntos],
      [detalle.respuestaCortaCantidad, detalle.respuestaCortaPuntos],
      [detalle.correspondenciaCantidad, detalle.correspondenciaPuntos],
      [detalle.identificacionCantidad, detalle.identificacionPuntos],
      [detalle.resolucionEjerciciosCantidad, detalle.resolucionEjerciciosPuntos],
      [casosProblemasCantidad, casosProblemasPuntos],
      [detalle.respuestaRestringidaCantidad, detalle.respuestaRestringidaPuntos],
      [detalle.produccionEscritaCantidad, detalle.produccionEscritaPuntos]
    ];
    return pares.reduce((acc, [c, p]) => {
      const cantidad = Number(String(c || "0").replace(",", "."));
      const puntos = Number(String(p || "0").replace(",", "."));
      return acc + (Number.isFinite(cantidad) ? cantidad : 0) * (Number.isFinite(puntos) ? puntos : 0);
    }, 0);
  }

  function getLeccionesPorItems(detalle: ReturnType<typeof getTablaDetalle>) {
    const casosProblemasCantidad = getTablaCasosProblemasCantidad(detalle);
    const cantidades: string[] = [
      detalle.seleccionRespuestaCantidad,
      detalle.respuestaCortaCantidad,
      detalle.correspondenciaCantidad,
      detalle.identificacionCantidad,
      detalle.resolucionEjerciciosCantidad,
      casosProblemasCantidad,
      detalle.respuestaRestringidaCantidad,
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
      { key: "Resolucion de casos y problemas", cantidad: getTablaCasosProblemasCantidad(detalle), valor: getTablaCasosProblemasPuntos(detalle) },
      { key: "Respuesta restringida", cantidad: detalle.respuestaRestringidaCantidad, valor: detalle.respuestaRestringidaPuntos },
      { key: "Produccion escrita", cantidad: detalle.produccionEscritaCantidad, valor: detalle.produccionEscritaPuntos }
    ];
  }

  function getTablaRestriccionPuntaje(tipo: string, cantidad: string, valor: string) {
    const cantidadNum = Number(String(cantidad || "0").replace(",", "."));
    if (!Number.isFinite(cantidadNum) || cantidadNum < 1) return "";
    const valorNum = Number(String(valor || "0").replace(",", "."));
    if (!Number.isFinite(valorNum) || valorNum <= 0) return "Debe indicar un puntaje valido.";
    if (tipo === "SR" && valorNum !== 1) return "Seleccion de respuesta solo permite puntaje 1.";
    if ((tipo === "RC" || tipo === "C" || tipo === "I") && (valorNum < 1 || valorNum > 5)) {
      return "Este item solo permite puntajes entre 1 y 5.";
    }
    return "";
  }

  function getTablaRestriccionesDetalle(detalle: ReturnType<typeof getTablaDetalle>) {
    return [
      getTablaRestriccionPuntaje("SR", detalle.seleccionRespuestaCantidad, detalle.seleccionRespuestaPuntos),
      getTablaRestriccionPuntaje("RC", detalle.respuestaCortaCantidad, detalle.respuestaCortaPuntos),
      getTablaRestriccionPuntaje("C", detalle.correspondenciaCantidad, detalle.correspondenciaPuntos),
      getTablaRestriccionPuntaje("I", detalle.identificacionCantidad, detalle.identificacionPuntos)
    ].filter(Boolean);
  }

  function getTablaPuntajeHint(tipo: string) {
    if (tipo === "SR") return "Puntaje permitido: solo 1 punto.";
    if (tipo === "RC" || tipo === "C" || tipo === "I") return "Puntaje permitido: entre 1 y 5 puntos.";
    return "Ingresa el valor por pregunta para este item.";
  }

  function getTablaPuntajeInputStyle(tipo: string, cantidad: string, valor: string) {
    const invalido = Boolean(getTablaRestriccionPuntaje(tipo, cantidad, valor));
    return {
      width: "54px",
      marginLeft: "6px",
      color: "#0f172a",
      border: invalido ? "1px solid #dc2626" : "1px solid #94a3b8",
      background: invalido ? "#fee2e2" : "#ffffff"
    } as const;
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
  }, [tablaActividadesObjetivo, seguimientoContexto?.actividadIndicadores]);
  const tablaPruebasPendientes = useMemo(
    () => tablaActividadesObjetivo.filter((a) => !tablaActividadParametrizadaMap.get(Number(a.ActividadId))),
    [tablaActividadesObjetivo, tablaActividadParametrizadaMap]
  );
  const tablaPruebasGuardadas = useMemo(
    () => tablaActividadesObjetivo.filter((a) => Boolean(tablaActividadParametrizadaMap.get(Number(a.ActividadId)))),
    [tablaActividadesObjetivo, tablaActividadParametrizadaMap]
  );
  const tablaPruebasGuardadasTodas = useMemo(
    () => tablaActividadesExamen.filter((a) => Boolean(tablaActividadParametrizadaMap.get(Number(a.ActividadId)))),
    [tablaActividadesExamen, tablaActividadParametrizadaMap]
  );
  const tablaActividadesDisponiblesPaso0 = useMemo(
    () => tablaActividadesExamen.filter((actividad) => {
      const actividadId = Number(actividad.ActividadId);
      if (Number(tablaEditandoActividadId || 0) === actividadId) return true;
      return !tablaActividadParametrizadaMap.get(actividadId);
    }),
    [tablaActividadesExamen, tablaActividadParametrizadaMap, tablaEditandoActividadId]
  );
  const tablaPuedeCrearExamenes = useMemo(
    () => tablaPruebasGuardadas.length > 0 && tablaPruebasPendientes.length === 0,
    [tablaPruebasGuardadas.length, tablaPruebasPendientes.length]
  );
  const tablaNombresCompletos = useMemo(
    () => tablaActividadesObjetivo.every((actividad) => String(tablaNombrePruebaDrafts[Number(actividad.ActividadId)] || "").trim().length > 0),
    [tablaActividadesObjetivo, tablaNombrePruebaDrafts]
  );
  const tablaHayAsignacionesMatriz = useMemo(
    () => tablaActividadesObjetivo.some((a) => getTablaIndicadoresAsignadosActividad(Number(a.ActividadId)).length > 0),
    [tablaActividadesObjetivo, tablaActividadIndicadoresDraftMap, tablaActividadIndicadoresBaseMap]
  );
  const tablaPaso0Completo = tablaPruebasConfirmadas && tablaActividadesObjetivo.length > 0;
  const tablaPaso1Completo = tablaPaso0Completo && tablaPlaneamientosConfirmados && tablaPlaneamientosSeleccionados.length > 0;
  const tablaMatrizGuardada = useMemo(
    () => tablaActividadesObjetivo.some((actividad) => (tablaActividadIndicadoresBaseMap.get(Number(actividad.ActividadId))?.size || 0) > 0),
    [tablaActividadesObjetivo, tablaActividadIndicadoresBaseMap]
  );
  const tablaPaso2Activo = tablaPaso1Completo && !tablaMatrizGuardada;
  const tablaPaso2Completo = tablaMatrizGuardada;
  const tablaPaso3Habilitado = tablaPaso2Completo;
  const tablaPaso3Completo = tablaPruebasGuardadas.length > 0 && tablaPruebasPendientes.length === 0;
  const tablaPasosCompletados = [tablaPaso0Completo, tablaPaso1Completo, tablaPaso2Completo, tablaPaso3Completo].filter(Boolean).length;
  const tablaProgresoPct = Math.round((tablaPasosCompletados / 4) * 100);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    if (!tablaActividadesObjetivo.length) {
      if (tablaPruebaSeleccionadaId) setTablaPruebaSeleccionadaId("");
      return;
    }
    const actividadEditandoId = Number(tablaEditandoActividadId || 0);
    if (actividadEditandoId > 0) {
      const existeEditando = tablaActividadesObjetivo.some((item) => Number(item.ActividadId) === actividadEditandoId);
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
  }, [activePanel, tablaActividadesObjetivo, tablaPruebasPendientes, tablaPruebaSeleccionadaId, tablaEditandoActividadId]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    setTablaMatrizEditando(true);
    setTablaEspecificacionEditando(false);
    setTablaNombresGuardados(false);
  }, [activePanel, seguimientoContexto?.estructura?.EstructuraGrupoId]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    if (!tablaActividadesExamen.length) return;

    const actividadEditandoId = Number(tablaEditandoActividadId || 0);
    const actividadesConMatriz = tablaActividadesExamen.filter(
      (actividad) => (tablaActividadIndicadoresBaseMap.get(Number(actividad.ActividadId))?.size || 0) > 0
    );
    const actividadesConMatrizPendientes = actividadesConMatriz.filter(
      (actividad) => !tablaActividadParametrizadaMap.get(Number(actividad.ActividadId))
    );

    if (actividadEditandoId > 0) {
      const actividadEditando = tablaActividadesExamen.find((actividad) => Number(actividad.ActividadId) === actividadEditandoId);
      if (!actividadEditando) return;

      const actividadIds = [String(actividadEditando.ActividadId)];
      setTablaActividadIdsSeleccionadas((prev) => (prev.length === 1 && prev[0] === actividadIds[0] ? prev : actividadIds));
      setTablaPruebasConfirmadas(true);

      const indicadoresAsignadosEditando = new Set<number>();
      for (const indicadorId of Array.from(tablaActividadIndicadoresBaseMap.get(actividadEditandoId) || [])) {
        indicadoresAsignadosEditando.add(Number(indicadorId));
      }

      const planeamientoIds = new Set<string>();
      const planeamientosPorNombre = new Map<string, string>();
      for (const planeamiento of (seguimientoContexto?.planeamientos || [])) {
        const nombre = String(planeamiento.Nombre || "").trim().toLowerCase();
        if (nombre) planeamientosPorNombre.set(nombre, String(planeamiento.PlaneamientoId));
      }
      for (const indicador of (seguimientoContexto?.indicadores || [])) {
        if (!indicadoresAsignadosEditando.has(Number(indicador.IndicadorGrupoId))) continue;
        const planeamientoId = String(indicador.PlaneamientoId || "").trim();
        if (planeamientoId) {
          planeamientoIds.add(planeamientoId);
          continue;
        }
        const nombre = String((indicador as any)?.PlaneamientoNombre || (indicador as any)?.PlaneamientoNombreOrigen || "").trim().toLowerCase();
        const matchedId = planeamientosPorNombre.get(nombre);
        if (matchedId) planeamientoIds.add(matchedId);
      }
      if (planeamientoIds.size > 0) {
        const planeamientoIdsArray = Array.from(planeamientoIds);
        setTablaPlaneamientoIds((prev) => {
          const prevSet = new Set(prev);
          const iguales = prev.length === planeamientoIdsArray.length && planeamientoIdsArray.every((id) => prevSet.has(id));
          return iguales ? prev : planeamientoIdsArray;
        });
        setTablaPlaneamientosConfirmados(true);
      }
      if (String(tablaPruebaSeleccionadaId) !== String(actividadEditandoId)) {
        setTablaPruebaSeleccionadaId(String(actividadEditandoId));
      }
      setTablaEspecificacionEditando(true);
      return;
    }

    if (tablaEspecificacionesFormOpen) return;
    if (!actividadesConMatrizPendientes.length) return;

    const actividadIds = actividadesConMatrizPendientes.map((actividad) => String(actividad.ActividadId));
    const actividadIdsSet = new Set(actividadIds);

    setTablaActividadIdsSeleccionadas((prev) => {
      if (prev.length) return prev;
      return actividadIds;
    });
    setTablaPruebasConfirmadas(true);

    if (!tablaPruebaSeleccionadaId) {
      const primeraActividadId = actividadIds.find((id) => actividadIdsSet.has(id));
      if (primeraActividadId) setTablaPruebaSeleccionadaId(primeraActividadId);
    }
  }, [
    activePanel,
    tablaActividadesExamen,
    tablaActividadIndicadoresBaseMap,
    tablaActividadParametrizadaMap,
    seguimientoContexto?.indicadores,
    seguimientoContexto?.planeamientos,
    tablaPruebaSeleccionadaId,
    tablaEditandoActividadId,
    tablaEspecificacionesFormOpen
  ]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    setTablaNombrePruebaDrafts((prev) => {
      const next = { ...prev };
      for (const actividad of tablaActividadesExamen) {
        const actividadId = Number(actividad.ActividadId);
        if (!next[actividadId]) {
          next[actividadId] = String(actividad.Nombre || "").trim();
        }
      }
      return next;
    });
    if (tablaActividadesExamen.length > 0) {
      const todasConNombre = tablaActividadesExamen.every((actividad) => String(actividad.Nombre || "").trim().length > 0);
      setTablaNombresGuardados(todasConNombre);
    }
  }, [activePanel, tablaActividadesExamen]);

  useEffect(() => {
    if (activePanel !== "examenes_tabla") return;
    if (!selected) return;
    if (!seguimientoContexto?.estructura?.EstructuraGrupoId) return;
    setExamenIaDraft((prev) => ({
      ...prev,
      tipoColegio: prev.tipoColegio || String(selected.GrupoJornada || "")
    }));
    if (!plantillasExamenIa.length) {
      loadPlantillasExamenIa();
    }
    loadExamenesIa();
  }, [activePanel, selected?.GrupoId, seguimientoContexto?.estructura?.EstructuraGrupoId]);

  async function guardarMatrizAsignacionPruebas() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para guardar la matriz de asignación");
      return;
    }
    if (!tablaActividadesObjetivo.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    setSavingSeguimiento(true);
    startSeguimientoSaving("actividad");
    setMessage("");
    setErrorMessage("");
    try {
      for (const actividad of tablaActividadesObjetivo) {
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
      setTablaMatrizMinimizada(true);
      setTablaEspecificacionEditando(true);
      stopSeguimientoSaving(true, "actividad");
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
      setGeneratingIndicadoresHabilidadesProgress(100);
      setGeneratingIndicadoresHabilidadesEtapa("Indicadores generados correctamente");
    } catch (error: any) {
      console.error("Error guardando matriz de asignación por prueba:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la matriz de asignación por prueba");
      stopSeguimientoSaving(false, "actividad");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  function confirmarPlaneamientosTabla() {
    if (!tablaPaso0Completo) {
      setErrorMessage("Escogé primero una o varias pruebas o exámenes");
      return;
    }
    if (!tablaPlaneamientoIds.length) {
      setErrorMessage("Seleccioná uno o varios planeamientos antes de continuar");
      return;
    }
    setErrorMessage("");
    setMessage("Planeamientos guardados. Continua con el Paso 1.3: matriz de asignacion por prueba.");
    setTablaPlaneamientosConfirmados(true);
    setTablaMatrizMinimizada(false);
    setTablaMatrizEditando(true);
    setTablaEspecificacionEditando(false);
  }

  function confirmarPruebasTabla() {
    if (!tablaActividadIdsSeleccionadas.length) {
      setErrorMessage("Seleccioná una o varias pruebas o exámenes antes de continuar");
      return;
    }
    setErrorMessage("");
    setMessage("Pruebas seleccionadas correctamente. Ahora continua con el Paso 1.2.");
    setTablaPruebasConfirmadas(true);
    setTablaEspecificacionesFormOpen(true);
    setTablaPlaneamientosConfirmados(false);
    setTablaMatrizEditando(true);
    setTablaEspecificacionEditando(false);
  }

  function cancelarCreacionTablaEspecificaciones() {
    setTablaEspecificacionesFormOpen(false);
    setTablaEditandoActividadId(null);
    setTablaActividadIdsSeleccionadas([]);
    setTablaPruebasConfirmadas(false);
    setTablaPlaneamientoIds([]);
    setTablaPlaneamientosConfirmados(false);
    setTablaPruebaSeleccionadaId("");
    setTablaMatrizEditando(true);
    setTablaEspecificacionEditando(false);
    setTablaMatrizMinimizada(true);
    setTablaFormatoMinimizado(false);
    setErrorMessage("");
    setMessage("");
  }

  async function guardarNombresPruebasTabla() {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para guardar los nombres de las pruebas");
      return;
    }
    if (!tablaActividadesExamen.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    if (!tablaNombresCompletos) {
      setErrorMessage("Debés escribir el nombre de cada prueba antes de continuar");
      return;
    }
    setSavingSeguimiento(true);
    startSeguimientoSaving("actividad");
    setMessage("");
    setErrorMessage("");
    try {
      for (const actividad of tablaActividadesObjetivo) {
        const actividadId = Number(actividad.ActividadId);
        await api.post("/eval360/seguimiento/guardar-nombre-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
          actividadId,
          nombre: String(tablaNombrePruebaDrafts[actividadId] || "").trim()
        });
      }
      setTablaNombresGuardados(true);
      setMessage("Nombres de las pruebas guardados correctamente");
      stopSeguimientoSaving(true, "actividad");
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error guardando nombres de las pruebas:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron guardar los nombres de las pruebas");
      stopSeguimientoSaving(false, "actividad");
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
    startSeguimientoSaving("eliminar");
    setTablaEliminandoActividadId(Number(actividadObjetivoId || 0) || null);
    setMessage("");
    setErrorMessage("");
    try {
      const actividadesObjetivo = actividadObjetivoId
        ? tablaActividadesExamen.filter((a) => Number(a.ActividadId) === Number(actividadObjetivoId))
        : tablaActividadesObjetivo;
      if (!actividadesObjetivo.length) {
        throw new Error("No se encontró la prueba seleccionada para eliminar");
      }
      for (const actividad of actividadesObjetivo) {
        await api.post("/eval360/seguimiento/eliminar-tabla-especificaciones", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
          actividadId: actividad.ActividadId
        });
      }
      const actividadIdsEliminadas = new Set(actividadesObjetivo.map((actividad) => Number(actividad.ActividadId)));
      setTablaDetalleDrafts((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const actividadId = Number(String(key).split("-")[0] || 0);
          if (actividadIdsEliminadas.has(actividadId)) delete next[key];
        }
        return next;
      });
      setTablaActividadIndicadoresDraft((prev) => {
        const next = { ...prev };
        for (const actividadId of actividadIdsEliminadas) {
          delete next[actividadId];
        }
        return next;
      });
      setTablaPuntosTotalesPrueba((prev) => {
        const next = { ...prev };
        for (const actividadId of actividadIdsEliminadas) {
          delete next[actividadId];
        }
        return next;
      });
      setTablaNombrePruebaDrafts((prev) => {
        const next = { ...prev };
        for (const actividadId of actividadIdsEliminadas) {
          delete next[actividadId];
        }
        return next;
      });
      setTablaEspecificacionEditando(true);
      setTablaMatrizEditando(true);
      setTablaEditandoActividadId(null);
      setTablaActividadIdsSeleccionadas((prev) => prev.filter((id) => !actividadIdsEliminadas.has(Number(id))));
      setTablaPruebasConfirmadas(false);
      setTablaPlaneamientosConfirmados(false);
      setTablaPruebaSeleccionadaId("");
      setMessage("Tabla de especificaciones eliminada correctamente");
      stopSeguimientoSaving(true, "eliminar");
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error eliminando tabla de especificaciones:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar la tabla de especificaciones");
      stopSeguimientoSaving(false, "eliminar");
    } finally {
      setSavingSeguimiento(false);
      setTablaEliminandoActividadId(null);
    }
  }

  async function reiniciarPruebaTabla(actividadObjetivoId: number) {
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId) {
      setErrorMessage("Seleccioná un grupo para reiniciar la prueba");
      return;
    }
    const actividad = tablaActividadesObjetivo.find((item) => Number(item.ActividadId) === Number(actividadObjetivoId));
    if (!actividad) {
      setErrorMessage("No se encontró la prueba seleccionada");
      return;
    }
    const confirmar = window.confirm(`¿Seguro que querés reiniciar esta prueba y arrancar de cero?\n\n${getPruebaLabel(actividad, tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividadObjetivoId)))}`);
    if (!confirmar) return;
    setSavingSeguimiento(true);
    setMessage("");
    setErrorMessage("");
    try {
      await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
        estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
        estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
        actividadId: actividad.ActividadId,
        indicadorIds: [],
        asignaciones: [],
        permitirMultiplesActividades: true
      });
      await api.post("/eval360/seguimiento/guardar-nombre-actividad", {
        estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
        estructuraGrupoDetalleId: actividad.EstructuraGrupoDetalleId,
        actividadId: actividad.ActividadId,
        nombre: ""
      });
      setTablaNombrePruebaDrafts((prev) => ({ ...prev, [Number(actividad.ActividadId)]: "" }));
      setTablaDetalleDrafts((prev) => {
        const next = { ...prev };
        delete next[Number(actividad.ActividadId)];
        return next;
      });
      setTablaActividadIndicadoresDraft((prev) => {
        const next = { ...prev };
        delete next[Number(actividad.ActividadId)];
        return next;
      });
      setTablaPuntosTotalesPrueba((prev) => {
        const next = { ...prev };
        delete next[Number(actividad.ActividadId)];
        return next;
      });
      setTablaPlaneamientoIds([]);
      setTablaPlaneamientosConfirmados(false);
      setTablaNombresGuardados(false);
      setTablaMatrizEditando(true);
      setTablaEspecificacionEditando(false);
      setTablaMatrizMinimizada(true);
      setTablaFormatoMinimizado(false);
      setTablaEditandoActividadId(null);
      setTablaPruebaSeleccionadaId("");
      setMessage("La prueba se reinició correctamente");
      await loadSeguimientoEvaluacion(selected);
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error reiniciando la prueba:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo reiniciar la prueba");
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
    if (!tablaActividadesObjetivo.length) {
      setErrorMessage("No hay pruebas de Exámenes configuradas para esta sección");
      return;
    }
    const actividadIdSeleccionada = Number(tablaPruebaSeleccionadaId || 0);
    if (!actividadIdSeleccionada) {
      setErrorMessage("Seleccioná la prueba que querés guardar");
      return;
    }
    const actividad = tablaActividadesObjetivo.find((a) => Number(a.ActividadId) === actividadIdSeleccionada);
    if (!actividad) {
      setErrorMessage("La prueba seleccionada no es válida");
      return;
    }
    setSavingSeguimiento(true);
    startSeguimientoSaving("asignacion");
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
              resolucionProblemasCantidad: Number(getTablaCasosProblemasCantidad(detalle)) || 0,
              resolucionProblemasPuntos: Number(getTablaCasosProblemasPuntos(detalle)) || 0,
              resolucionCasosCantidad: 0,
              resolucionCasosPuntos: 0,
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
      setTablaEspecificacionesFormOpen(false);
      setTablaVerGuardadasOpen(true);
      setTablaMatrizMinimizada(true);
      setTablaFormatoMinimizado(false);
      stopSeguimientoSaving(true, "asignacion");
      await loadSeguimientoEvaluacion(selected);
      if (!tablaPruebaSeleccionadaId && tablaActividadesObjetivo.length > 0) {
        setTablaPruebaSeleccionadaId(String(tablaActividadesObjetivo[0].ActividadId));
      }
      setActivePanel("examenes_tabla");
    } catch (error: any) {
      console.error("Error guardando tabla de especificaciones:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la tabla de especificaciones");
      stopSeguimientoSaving(false, "asignacion");
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
    const actividadIdActiva = String(examenTablaActivaId || "").trim();
    const tablasBase = actividadIdActiva
      ? tablaPruebasGuardadasTodas.filter((actividad) => String(actividad.ActividadId) === actividadIdActiva)
      : tablaPruebasGuardadasTodas;
    return tablasBase.map((actividad) => ({
      id: String(actividad.ActividadId),
      nombre: `${getPruebaExamenLabel(actividad)} (sección actual)`
    }));
  }

  function delayMs(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function startExamenIaProgress(mode: "generar" | "guardar" | "eliminar") {
    savingExamenIaStartedAtRef.current = Date.now();
    setSavingExamenIaElapsedSeconds(0);
    setSavingExamenIaPhase(
      mode === "generar"
        ? "Preparando datos de la tabla de especificaciones..."
        : (mode === "guardar" ? "Guardando cambios del examen..." : "Eliminando examen...")
    );
    setSavingExamenIaProgress(mode === "generar" ? 8 : 12);
    if (savingExamenIaTimerRef.current !== null) {
      window.clearInterval(savingExamenIaTimerRef.current);
      savingExamenIaTimerRef.current = null;
    }
    savingExamenIaTimerRef.current = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - savingExamenIaStartedAtRef.current) / 1000));
      setSavingExamenIaElapsedSeconds(elapsed);
      if (mode === "generar") {
        setSavingExamenIaPhase(
          elapsed < 4
            ? "Preparando datos de la tabla de especificaciones..."
            : (elapsed < 35
                ? "La IA está construyendo las preguntas..."
                : "La IA sigue trabajando; algunas tablas tardan más por cantidad de ítems o documentos adjuntos...")
        );
        setSavingExamenIaProgress((prev) => {
          const cap = elapsed < 4 ? 22 : (elapsed < 20 ? 48 : (elapsed < 60 ? 66 : 76));
          return Math.min(cap, prev + Math.max(1, Math.round((cap - prev) * 0.08)));
        });
        return;
      }
      setSavingExamenIaProgress((prev) => Math.min(88, prev + Math.max(1, Math.round((88 - prev) * 0.14))));
    }, 900);
  }

  function formatProgressElapsed(seconds: number) {
    if (!seconds) return "";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}m ${String(rest).padStart(2, "0")}s`;
  }

  function mapExamenIaRow(row: any, fallback: Partial<ExamenIaCreado> = {}): ExamenIaCreado {
    return {
      id: String(row?.ExamenIAGeneradoId || fallback.id || ""),
      actividadIdTabla: String(row?.ActividadIdTabla || fallback.actividadIdTabla || ""),
      nombre: String(row?.Nombre || fallback.nombre || ""),
      materia: String(row?.Materia || fallback.materia || ""),
      grado: String(row?.Grado || fallback.grado || ""),
      periodo: String(row?.Periodo || fallback.periodo || ""),
      secciones: (() => {
        if (Array.isArray(fallback.secciones) && !row?.SeccionesJson) return fallback.secciones;
        try {
          const arr = JSON.parse(String(row?.SeccionesJson || "[]"));
          return Array.isArray(arr) ? arr.map((x: any) => String(x)) : [];
        } catch { return []; }
      })(),
      tablaNombre: String(row?.ActividadNombre || fallback.tablaNombre || `Actividad ${row?.ActividadIdTabla || fallback.actividadIdTabla || ""}`),
      plantillaNombre: String(row?.PlantillaPromptIAId || fallback.plantillaNombre || ""),
      indicaciones: String(row?.Indicaciones || fallback.indicaciones || ""),
      resultadoIA: String(row?.ResultadoIA || fallback.resultadoIA || ""),
      creadoEn: String(row?.CreatedAt || fallback.creadoEn || getCostaRicaIsoDate()).slice(0, 10)
    };
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
    const tablaActivaId = String(examenIaDraft.tablaId || "");
    try {
      setGenerandoExamenIa(true);
      const progressMode = editingExamenId || examenIaGeneradoId ? "guardar" : "generar";
      setSavingExamenIaMode(progressMode);
      startExamenIaProgress(progressMode);
      if (editingExamenId || examenIaGeneradoId) {
        const idToUpdate = editingExamenId || examenIaGeneradoId;
        await api.put(`/eval360/examenes-ia/${idToUpdate}`, {
          nombre: nombreFinal,
          indicaciones: (examenIaDraft.indicaciones || "").trim(),
          resultadoIA: (examenIaResultadoDraft || "").trim()
        });
        setSavingExamenIaPhase("Actualizando lista de exámenes...");
        setSavingExamenIaProgress((prev) => Math.max(prev, 90));
        await loadExamenesIa();
        setTablaVerGuardadasOpen(true);
        setTablaGuardadasItemsMinimizados((prev) => ({ ...prev, [Number(tablaActivaId || 0)]: false }));
        setPendingScrollExamenId(String(idToUpdate));
        setMessage("Examen guardado correctamente.");
      } else {
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
        setSavingExamenIaPhase("Enviando datos y solicitando generación a la IA...");
        const response = await api.post("/eval360/examenes-ia/generar", form);
        setSavingExamenIaPhase("Validando respuesta y preparando el resultado editable...");
        setSavingExamenIaProgress((prev) => Math.max(prev, 84));
        const row = response?.data?.data || response?.data || {};
        const generatedId = String(row?.ExamenIAGeneradoId || "");
        const resultado = String(row?.ResultadoIA || "");
        const examenGenerado = mapExamenIaRow(row, {
          id: generatedId,
          actividadIdTabla: tablaActivaId,
          nombre: nombreFinal,
          materia,
          grado,
          periodo,
          secciones: seccionesIds.map((id) => String(id)),
          tablaNombre: getPruebaExamenLabel(tablaActividadesExamen.find((a) => String(a.ActividadId) === tablaActivaId) || null),
          indicaciones: (examenIaDraft.indicaciones || "").trim(),
          resultadoIA: resultado
        });
        const resultadoFinal = String((resultado || examenGenerado.resultadoIA || "")).trim();
        const generatedIdFinal = generatedId || String(examenGenerado.id || "");
        setExamenIaGeneradoId(generatedIdFinal);
        setExamenIaResultadoDraft(resultadoFinal);
        if (!resultadoFinal) {
          throw new Error("La generación terminó, pero no devolvió contenido editable para el examen.");
        }
        setExamenesCreados((prev) => [
          { ...examenGenerado, id: generatedIdFinal, resultadoIA: resultadoFinal },
          ...prev.filter((item) => String(item.id) !== generatedIdFinal)
        ]);
        setPendingScrollExamenId(generatedIdFinal);
        setSavingExamenIaPhase("Mostrando examen generado...");
        setSavingExamenIaProgress((prev) => Math.max(prev, 96));
        setMessage("Examen generado. Revisalo, ajustalo y luego guardalo.");
        setTablaVerGuardadasOpen(true);
        setTablaGuardadasItemsMinimizados((prev) => ({ ...prev, [Number(tablaActivaId || 0)]: false }));
      }
      if (savingExamenIaTimerRef.current !== null) {
        window.clearInterval(savingExamenIaTimerRef.current);
        savingExamenIaTimerRef.current = null;
      }
      setSavingExamenIaProgress(100);
      await delayMs(700);
      if (editingExamenId || examenIaGeneradoId) {
        setEditingExamenId("");
        setExamenIaGeneradoId("");
        setExamenIaResultadoDraft("");
        setCrearExamenesOpen(false);
        setExamenTablaActivaId("");
      }
    } catch (error: any) {
      console.error("Error guardando/generando examen IA:", error);
      setErrorMessage(error?.response?.data?.message || error?.message || "No se pudo generar el examen con IA");
      if (savingExamenIaTimerRef.current !== null) {
        window.clearInterval(savingExamenIaTimerRef.current);
        savingExamenIaTimerRef.current = null;
      }
      setSavingExamenIaProgress(0);
      return;
    } finally {
      setGenerandoExamenIa(false);
      window.setTimeout(() => {
        setSavingExamenIaProgress(0);
        setSavingExamenIaMode(null);
        setSavingExamenIaPhase("");
        setSavingExamenIaElapsedSeconds(0);
      }, 500);
    }
  }

  async function eliminarExamenCreado(examenId: string, actividadIdTabla: string) {
    const confirmar = window.confirm("¿Seguro que querés eliminar este examen generado?");
    if (!confirmar) return;
    setGenerandoExamenIa(true);
    setSavingExamenIaMode("eliminar");
    setDeletingExamenIaId(String(examenId));
    startExamenIaProgress("eliminar");
    try {
      await api.delete(`/eval360/examenes-ia/${examenId}`);
      await loadExamenesIa();
      setTablaVerGuardadasOpen(true);
      setTablaGuardadasItemsMinimizados((prev) => ({ ...prev, [Number(actividadIdTabla || 0)]: false }));
      setMessage("Examen eliminado correctamente.");
      if (String(editingExamenId) === String(examenId) || String(examenIaGeneradoId) === String(examenId)) {
        setEditingExamenId("");
        setExamenIaGeneradoId("");
        setExamenIaResultadoDraft("");
        setCrearExamenesOpen(false);
        setExamenTablaActivaId("");
      }
      if (savingExamenIaTimerRef.current !== null) {
        window.clearInterval(savingExamenIaTimerRef.current);
        savingExamenIaTimerRef.current = null;
      }
      setSavingExamenIaProgress(100);
    } catch (error: any) {
      console.error("Error eliminando examen IA:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el examen");
      if (savingExamenIaTimerRef.current !== null) {
        window.clearInterval(savingExamenIaTimerRef.current);
        savingExamenIaTimerRef.current = null;
      }
      setSavingExamenIaProgress(0);
    } finally {
      setGenerandoExamenIa(false);
      setDeletingExamenIaId("");
      window.setTimeout(() => {
        setSavingExamenIaProgress(0);
        setSavingExamenIaMode(null);
        setSavingExamenIaPhase("");
        setSavingExamenIaElapsedSeconds(0);
      }, 500);
    }
  }

function updateAsistenciaDraft(
  estudianteId: number,
  horarioGrupoId: number,
  field: "estado" | "minutosTardia" | "observacion" | "notificarEncargado",
  value: string | boolean,
  options: { aplicarReglaPrimeraSeleccion?: boolean } = {}
) {
  const key = asistenciaDraftKey(estudianteId, horarioGrupoId);
  const leccionesEstudiante = asistenciaLecciones.length ? asistenciaLecciones : getAsistenciaLeccionesFallback();
  const esPrimeraSeleccion =
    field === "estado"
    && Boolean(options.aplicarReglaPrimeraSeleccion)
    && registrarPrimeraSeleccionAsistencia(estudianteId);
  const debePropagarEstado = field === "estado"
    && debePropagarPrimeraSeleccionAsistencia(String(value), esPrimeraSeleccion, leccionesEstudiante.length);

  setAsistenciaDrafts((prev) => {
    const buildNextDraft = (draftKey: string) => {
      const previo = prev[draftKey] || {
        estado: "PRESENTE" as EstadoAsistencia,
        minutosTardia: "",
        observacion: "",
        notificarEncargado: false
      };
      const estadoNuevo = (field === "estado" ? (value as EstadoAsistencia) : (previo.estado || "PRESENTE")) as EstadoAsistencia;
      const mensajeSugerido = getMensajeAsistenciaPreconfigurado(seguimientoContexto?.mensajesSeguimiento || [], estadoNuevo);
      const observacionSiguiente =
        field === "observacion"
          ? String(value)
          : (field === "estado" ? (mensajeSugerido || "") : String(previo.observacion || ""));
      const notificarEncargadoSiguiente =
        field === "notificarEncargado"
          ? Boolean(value)
          : field === "estado"
            ? debeInformarEncargadoPorEstadoAsistencia(estadoNuevo)
            : Boolean(previo.notificarEncargado);

      return {
        estado: previo.estado || "PRESENTE",
        minutosTardia: previo.minutosTardia || "",
        observacion: observacionSiguiente,
        notificarEncargado: notificarEncargadoSiguiente,
        [field]: field === "estado" ? value as EstadoAsistencia : field === "notificarEncargado" ? Boolean(value) : String(value)
      };
    };

    if (field !== "estado") {
      return {
        ...prev,
        [key]: buildNextDraft(key)
      };
    }

    if (!debePropagarEstado) {
      return {
        ...prev,
        [key]: buildNextDraft(key)
      };
    }

    const next = { ...prev };
    leccionesEstudiante.forEach((leccion) => {
      const draftKey = asistenciaDraftKey(estudianteId, leccion.HorarioGrupoId);
      next[draftKey] = buildNextDraft(draftKey);
    });
    return next;
  });
}

function registrarPrimeraSeleccionAsistencia(estudianteId: number) {
  const contextoKey = `${getGrupoProfesorKey(selected || detalle?.asignacion)}|${asistenciaFecha}|${estudianteId}`;
  if (asistenciaPrimeraSeleccionRegistradaRef.current.has(contextoKey)) return false;
  asistenciaPrimeraSeleccionRegistradaRef.current.add(contextoKey);
  return true;
}

  function getResumenAsistencia(estudianteId: number) {
    return resumenAsistencia.find((item) => Number(item.EstudianteId) === Number(estudianteId));
  }


  async function loadGrupos(search = q) {
    setLoadingGrupos(true);
    setErrorMessage("");
    try {
      const response = await api.get("/gestion-profe/mis-grupos", {
        params: {
          q: search,
          institucionId: isGestionAdminRole ? (adminInstitucionId || undefined) : undefined,
          grado: isGestionAdminRole && adminModoCarga === "GRADO" ? (adminGrado || undefined) : undefined,
          profesorId: isGestionAdminRole && adminModoCarga === "PROFESOR" ? (adminProfesorId || undefined) : undefined
        }
      });
      const data = response.data?.data || response.data || [];
      const gruposCargados = Array.isArray(data)
        ? deduplicarGruposProfesor(data).sort(compararGruposProfesor)
        : [];
      setGrupos(gruposCargados);
      if (horarioVisible && gruposCargados[0]) {
        await loadMiHorario(getGrupoHorarioPredeterminado(gruposCargados));
      }
    } catch (error: any) {
      console.error("Error cargando Gestión del Profe:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar los grupos asignados");
    } finally {
      setLoadingGrupos(false);
    }
  }

  async function loadAdminGestionFiltros(nextInstitucionId?: string) {
    if (!isGestionAdminRole) return;
    setLoadingAdminFiltros(true);
    setErrorMessage("");
    try {
      const response = await api.get("/gestion-profe/mis-grupos/filtros-admin", {
        params: {
          institucionId: nextInstitucionId || undefined
        }
      });
      const data = response.data?.data || response.data || {};
      const instituciones = Array.isArray(data.instituciones) ? data.instituciones : [];
      const grados = Array.isArray(data.grados) ? data.grados : [];
      const profesores = Array.isArray(data.profesores) ? data.profesores : [];
      setAdminInstitucionesFiltro(instituciones);
      setAdminGradosFiltro(grados);
      setAdminProfesoresFiltro(profesores);
    } catch (error: any) {
      console.error("Error cargando filtros administrativos de Gestión del Profe:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar los filtros administrativos");
    } finally {
      setLoadingAdminFiltros(false);
    }
  }

  function resetApoyoEducativoGenerator() {
    setApoyoEducativoGeneratorOpen(false);
    setApoyoEducativoGrupoIdsSeleccionados([]);
    setApoyoEducativoAlumnosDisponibles([]);
    setApoyoEducativoEstudianteIdsSeleccionados([]);
    setApoyoEducativoListaAlumnosMinimizada(true);
    setApoyoEducativoGeneradorTipoAdecuacion("");
    setApoyoEducativoFiltroAdecuacion("");
    setApoyoEducativoFiltroTipo("");
    setApoyoEducativoCatalogoResultados([]);
    setApoyoEducativoCatalogoIdsSeleccionados([]);
    setApoyoEducativoPasoAlumnosConfirmado(false);
  }

  async function loadApoyoEducativoData() {
    setLoadingApoyoEducativo(true);
    setErrorMessage("");
    try {
      const response = await api.get("/gestion-profe/apoyos-educativos/bootstrap", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" }
      });
      const data = response.data?.data || response.data || {};
      setApoyoEducativoSecciones(Array.isArray(data.secciones) ? data.secciones.filter(Boolean) : []);
      setApoyoEducativoEstudiantes(Array.isArray(data.estudiantes) ? data.estudiantes.filter(Boolean) : []);
      setApoyoEducativoCatalogo(Array.isArray(data.adecuaciones) ? data.adecuaciones.filter(Boolean) : []);
      setApoyoEducativoInformes(Array.isArray(data.informes) ? data.informes.filter(Boolean) : []);
    } catch (error: any) {
      console.error("Error cargando apoyos educativos:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el panel de apoyos educativos");
    } finally {
      setLoadingApoyoEducativo(false);
    }
  }

  async function openApoyoEducativoPanel() {
    setApoyoEducativoVisible(true);
    if (!apoyoEducativoSecciones.length && !loadingApoyoEducativo) {
      await loadApoyoEducativoData();
    }
    setTimeout(() => {
      apoyoEducativoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }

  function handleBuscarAlumnosApoyoEducativo() {
    if (!apoyoEducativoGrupoIdsSeleccionados.length) {
      setErrorMessage("Seleccioná al menos una sección para generar el apoyo educativo");
      return;
    }
    setErrorMessage("");
    const permitidos = new Set(apoyoEducativoGrupoIdsSeleccionados.map((item) => String(item)));
    const resultados = apoyoEducativoEstudiantesFiltradosPorContexto.filter((item) =>
      !!item
      && permitidos.has(String(item.GrupoId))
    );
    setApoyoEducativoAlumnosDisponibles(resultados);
    setApoyoEducativoEstudianteIdsSeleccionados([]);
    setApoyoEducativoListaAlumnosMinimizada(false);
    setApoyoEducativoPasoAlumnosConfirmado(false);
    setApoyoEducativoFiltroAdecuacion("");
    setApoyoEducativoCatalogoResultados([]);
    setApoyoEducativoCatalogoIdsSeleccionados([]);
    setTimeout(() => {
      apoyoEducativoListaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 140);
  }

  function handleConfirmarAlumnosApoyoEducativo() {
    if (!apoyoEducativoEstudianteIdsSeleccionados.length) {
      setErrorMessage("Marcá al menos un estudiante para continuar");
      return;
    }
    setErrorMessage("");
    setApoyoEducativoPasoAlumnosConfirmado(true);
  }

  function handleBuscarCatalogoApoyoEducativo() {
    if (!apoyoEducativoPasoAlumnosConfirmado) {
      setErrorMessage("Confirmá primero los estudiantes seleccionados");
      return;
    }
    setErrorMessage("");
    const estudiantesSeleccionados = apoyoEducativoAlumnosDisponibles.filter((item) =>
      apoyoEducativoEstudianteIdsSeleccionados.includes(String(item.EstudianteId))
    );
    const adecuacionesPermitidas = new Set(
      (estudiantesSeleccionados.length ? estudiantesSeleccionados : apoyoEducativoAlumnosDisponibles)
        .map((item) => normalizeAdecuacionText(item.TipoAdecuacion))
        .filter(Boolean)
    );
    const resultados = (apoyoEducativoCatalogo || []).filter((item) => {
      if (!item) return false;
      if (!isValidApoyoAdecuacion(item.Adecuacion)) return false;
      if (!apoyoCatalogoCoincideConTiposPermitidos(item.Adecuacion, adecuacionesPermitidas)) return false;
      const coincideAdecuacion = !apoyoEducativoFiltroAdecuacion
        || normalizeAdecuacionText(item.Adecuacion) === normalizeAdecuacionText(apoyoEducativoFiltroAdecuacion);
      const coincideTipo = !apoyoEducativoFiltroTipo || String(item.Tipo) === String(apoyoEducativoFiltroTipo);
      return coincideAdecuacion && coincideTipo;
    });
    setApoyoEducativoCatalogoResultados(resultados);
    setApoyoEducativoCatalogoIdsSeleccionados([]);
  }

  async function handleGuardarApoyoEducativo() {
    if (!apoyoEducativoGrupoIdsSeleccionados.length) {
      setErrorMessage("Seleccioná al menos una sección");
      return;
    }
    if (!apoyoEducativoEstudianteIdsSeleccionados.length) {
      setErrorMessage("Seleccioná al menos un estudiante");
      return;
    }
    if (!apoyoEducativoCatalogoIdsSeleccionados.length) {
      setErrorMessage("Seleccioná al menos un apoyo educativo");
      return;
    }
    if (!apoyoEducativoPlantilla) {
      setErrorMessage("Cargá la plantilla Word para generar los informes educativos");
      return;
    }

    setSavingApoyoEducativo(true);
    setApoyoEducativoProgress(8);
    setErrorMessage("");
    let progressTimer: number | null = window.setInterval(() => {
      setApoyoEducativoProgress((prev) => Math.min(92, prev + Math.max(1, Math.round((92 - prev) * 0.12))));
    }, 650);
    try {
      const formData = new FormData();
      formData.append("grupoIds", JSON.stringify(apoyoEducativoGrupoIdsSeleccionados.map(Number)));
      formData.append("estudianteIds", JSON.stringify(apoyoEducativoEstudianteIdsSeleccionados.map(Number)));
      formData.append("adecuacionIds", JSON.stringify(apoyoEducativoCatalogoIdsSeleccionados.map(Number)));
      formData.append("periodoId", apoyoEducativoPeriodoId || "");
      formData.append("plantilla", apoyoEducativoPlantilla);
      const response = await api.post("/gestion-profe/apoyos-educativos/generar", formData);
      const data = response.data?.data || response.data || {};
      setMessage(
        response.data?.message
        || `Apoyo educativo generado para ${data.totalEstudiantes || apoyoEducativoEstudianteIdsSeleccionados.length} estudiante(s)`
      );
      setApoyoEducativoProgress(100);
      resetApoyoEducativoGenerator();
      await loadApoyoEducativoData();
    } catch (error: any) {
      console.error("Error guardando apoyo educativo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo generar el apoyo educativo");
    } finally {
      if (progressTimer !== null) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      setSavingApoyoEducativo(false);
      window.setTimeout(() => setApoyoEducativoProgress(0), 900);
    }
  }

  async function handleDescargarInformeApoyoEducativo(informeId: number, fileName?: string | null) {
    try {
      const response = await api.get(`/gestion-profe/apoyos-educativos/informes/${informeId}/word`, {
        params: { _: Date.now() },
        responseType: "blob"
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName || `informe-apoyo-${informeId}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error: any) {
      console.error("Error descargando informe educativo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo abrir el informe educativo");
    }
  }

  async function handleEliminarInformeApoyoEducativo(informeId: number) {
    const confirmado = window.confirm("¿Deseás eliminar este informe educativo generado?");
    if (!confirmado) return;
    setDeletingApoyoEducativoInformeId(informeId);
    setErrorMessage("");
    try {
      await api.delete(`/gestion-profe/apoyos-educativos/informes/${informeId}`, {
        params: { _: Date.now() }
      });
      setApoyoEducativoInformes((prev) => prev.filter((item) => Number(item.ApoyoEducativoEstudianteId) !== Number(informeId)));
      setMessage("Informe educativo eliminado correctamente");
    } catch (error: any) {
      console.error("Error eliminando informe educativo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el informe educativo");
    } finally {
      setDeletingApoyoEducativoInformeId(null);
    }
  }

  async function loadPlantillasAsignables(item = selected) {
    if (!item) return;
    setLoadingEval360(true);
    try {
      const response = await api.get("/eval360/plantillas", {
        params: {
          anioLectivoId: item.AnioLectivoId,
          incluirInactivas: false
        }
      });
      let plantillas = unwrapApiData(response) || [];

      // Fallback: si no hay plantillas por año/período, mostrar las activas de la institución.
      if (!Array.isArray(plantillas) || !plantillas.length) {
        const fallbackResponse = await api.get("/eval360/plantillas", {
          params: { incluirInactivas: false }
        });
        plantillas = unwrapApiData(fallbackResponse) || [];
      }

      const ordenadas = Array.isArray(plantillas)
        ? [...plantillas].sort((a: any, b: any) => {
            const aMismoPeriodo = Number(a?.PeriodoId) === Number(item.PeriodoId) ? 0 : 1;
            const bMismoPeriodo = Number(b?.PeriodoId) === Number(item.PeriodoId) ? 0 : 1;
            if (aMismoPeriodo !== bMismoPeriodo) return aMismoPeriodo - bMismoPeriodo;
            const aActiva = String(a?.Estado || "").toUpperCase() === "ACTIVA" ? 0 : 1;
            const bActiva = String(b?.Estado || "").toUpperCase() === "ACTIVA" ? 0 : 1;
            if (aActiva !== bActiva) return aActiva - bActiva;
            return String(a?.Nombre || "").localeCompare(String(b?.Nombre || ""));
          })
        : [];

      setEval360Plantillas(ordenadas);
    } catch (error: any) {
      console.error("Error cargando plantillas asignables:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron cargar las plantillas disponibles");
    } finally {
      setLoadingEval360(false);
    }
  }

  async function loadDetalle(item: GrupoProfesor, cargarContenidoCompleto = false) {
    setLoadingDetalleCardId(cargarContenidoCompleto ? item.AsignacionDocenteId : null);
    setSelected(item);
    setDetalle({
      asignacion: item,
      estudiantes: [],
      plantilla: item.EvaluacionPlantillaId ? {
        EvaluacionPlantillaId: Number(item.EvaluacionPlantillaId),
        Nombre: String(item.EvaluacionPlantillaNombre || ""),
        DecimalesNota: 2,
        Estado: String(item.EvaluacionPlantillaEstado || ""),
        PermitirProfesorEditar: false
      } : null,
      componentes: [],
      actividades: [],
      notas: []
    });
    setNoteDrafts({});
    setPlaneamientos([]);
    setPlaneamientoIndicadores([]);
    setAsistenciaDrafts({});
    setAsistenciaLecciones([]);
    asistenciaPrimeraSeleccionRegistradaRef.current.clear();
    setResumenAsistencia([]);
    setEval360Plantillas([]);
    setEval360PlantillaId("");
    setMostrarSelectorCambioPlantilla(false);
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
    setIndicadoresHabilidadesOpen(false);
    setIndicadoresHabilidadesForm({
      ...initialIndicadoresHabilidadesForm,
      grupoIds: [String(item.GrupoId || "")].filter(Boolean),
      plantillaPromptIAId: eval360PlantillaIaIndicadorId || ""
    });
    setIndicadorManualPorPlaneamiento({});
    setSavingIndicadorManualPlaneamientoId(null);
    setSeguimientoContexto(null);
    setSeguimientoTipo("");
    setSeguimientoPlaneamientoId("");
    setSeguimientoEstadoFiltro("NO_CALIFICADO");
    setSeguimientoIndicadorId("");
    setSeguimientoDrafts({});
    setSeguimientoActividadIndicadoresDraft({});
    setSeguimientoMatrizAsignacionMinimizada(true);
    setBitacorasGrupo([]);
    setBitacoraForm({ temasDesarrollados: "", observaciones: "", hechosRelevantes: "" });
    setCierreCurso(null);
    setCierreCursoPreview(null);
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
    setDocumentoApoyoIa([]);
    setPlantillaFormatoIa(null);
    setAnalisisReferenciaIa(null);
    setActivePanel("");
    setMessage("");
    setErrorMessage("");
    void cargarCierreCurso(item, true);
    if (!item.EvaluacionPlantillaId) {
      void loadPlantillasAsignables(item);
    }
    if (!cargarContenidoCompleto) {
      setLoadingDetalle(false);
      return;
    }
    setLoadingDetalle(true);

    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          ...getGrupoClaseParams(item)
        }
      });
      const data = response.data?.data || response.data || null;
      setDetalle(data);
      setNoteDrafts(buildDraftsFromDetalle(data));
    } catch (error: any) {
      console.error("Error cargando detalle del grupo:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el detalle del grupo seleccionado");
    } finally {
      setLoadingDetalle(false);
      setLoadingDetalleCardId(null);
    }
  }

  useEffect(() => {
    if (loadingDetalle) return;
    if (!selected || !detalle) return;
    setTimeout(() => {
      detalleGrupoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [loadingDetalle, selected?.AsignacionDocenteId, selected?.GrupoClaseId, detalle, activePanel]);


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
            periodoId: item.PeriodoId,
            ...getGrupoClaseParams(item)
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
    setSavingEval360Progress(8);
    if (savingEval360TimerRef.current !== null) {
      window.clearInterval(savingEval360TimerRef.current);
      savingEval360TimerRef.current = null;
    }
    savingEval360TimerRef.current = window.setInterval(() => {
      setSavingEval360Progress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 280);
    setMessage("");
    setErrorMessage("");

    try {
      const gruposDestino = selected.GrupoClaseId || mostrarSelectorCambioPlantilla
        ? [selected]
        : seccionesMismoGradoMateriaSeleccionado.filter((g) => Number(g.MateriaId) === Number(selected.MateriaId));

      if (!gruposDestino.length) {
        setErrorMessage("No hay secciones disponibles para aplicar la plantilla");
        setSavingEval360Progress(0);
        return;
      }

      let principalData: any = null;
      let aplicadas = 0;
      const errores: string[] = [];

      for (const grupo of gruposDestino) {
        try {
          const response = await api.post("/eval360/estructuras/crear-desde-plantilla", {
            grupoId: grupo.GrupoId,
            materiaId: grupo.MateriaId,
            anioLectivoId: grupo.AnioLectivoId,
            periodoId: grupo.PeriodoId,
            ...getGrupoClaseParams(grupo),
            plantillaId: eval360PlantillaId || null,
            nombre: "Evaluación " + grupo.GrupoNombre + " - " + grupo.MateriaNombre + " - " + grupo.PeriodoNombre
          });
          const data = unwrapApiData(response);
          aplicadas += 1;
          if (Number(grupo.GrupoId) === Number(selected.GrupoId)) {
            principalData = data;
          }
        } catch (error: any) {
          errores.push(`${grupo.GrupoNombre}: ${error?.response?.data?.message || "No se pudo aplicar"}`);
        }
      }

      if (principalData) {
        setEval360Estructura(principalData || null);
        setEval360DetallesDraft(Array.isArray(principalData?.detalles) ? principalData.detalles : []);
      }

      if (mostrarSelectorCambioPlantilla) {
        setMessage(aplicadas > 0 ? `Plantilla cambiada correctamente en ${aplicadas}/1 sección` : "");
      } else {
        const totalDestino = gruposDestino.length;
        setMessage(
          aplicadas > 0
            ? `Plantilla asignada en ${aplicadas}/${totalDestino} sección(es) del mismo grado`
            : ""
        );
      }
      if (errores.length) {
        setErrorMessage("Algunas secciones no se pudieron aplicar: " + errores.join(" | "));
      }
      setSavingEval360Progress(100);
      await loadEval360Data(selected);
      await loadGrupos(q);
    } catch (error: any) {
      console.error("Error creando estructura Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo crear la estructura de evaluación");
      setSavingEval360Progress(0);
    } finally {
      if (savingEval360TimerRef.current !== null) {
        window.clearInterval(savingEval360TimerRef.current);
        savingEval360TimerRef.current = null;
      }
      setSavingEval360(false);
    }
  }


  async function loadSeguimientoEvaluacion(item = selected, options: { incluirAsistencia?: boolean; incluirEnvios?: boolean; sincronizar?: boolean } = {}) {
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
          ...getGrupoClaseParams(item),
          incluirAsistencia: options.incluirAsistencia ? 1 : undefined,
          incluirEnvios: options.incluirEnvios ? 1 : undefined,
          sincronizar: options.sincronizar ? 1 : undefined,
          _ts: Date.now()
        }
      });
      const dataRaw = unwrapApiData(response) || null;
      const data = (() => {
        if (!dataRaw) return dataRaw;
        const estudiantesDetalle = detalle?.estudiantes || [];
        const estudiantesPermitidos = item.GrupoClaseId && estudiantesDetalle.length
          ? new Set(estudiantesDetalle.map((row: any) => Number(row.EstudianteId)))
          : null;
        const filtrarPorEstudiante = (rows: any) => {
          const list = Array.isArray(rows) ? rows : [];
          if (!estudiantesPermitidos) return list;
          return list.filter((row: any) => estudiantesPermitidos.has(Number(row.EstudianteId)));
        };
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
        return {
          ...dataRaw,
          plantillas: Array.isArray(dataRaw.plantillas) ? dataRaw.plantillas : [],
          estudiantes: filtrarPorEstudiante(dataRaw.estudiantes),
          planeamientos: Array.isArray(dataRaw.planeamientos) ? dataRaw.planeamientos : [],
          detalles,
          indicadores: Array.isArray(dataRaw.indicadores) ? dataRaw.indicadores : [],
          seguimientos: filtrarPorEstudiante(dataRaw.seguimientos),
          actividades: actividadesAjustadas,
          actividadIndicadores: Array.isArray(dataRaw.actividadIndicadores) ? dataRaw.actividadIndicadores : [],
          notasActividades: filtrarPorEstudiante(dataRaw.notasActividades),
          asistenciaRegistros: filtrarPorEstudiante(dataRaw.asistenciaRegistros),
          componenteAjustesManuales: filtrarPorEstudiante(dataRaw.componenteAjustesManuales),
          mensajesSeguimiento: filtrarPorEstudiante(dataRaw.mensajesSeguimiento)
        };
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
    const currentDraft = getSeguimientoExamenDraft(actividadId, estudianteId);
    const nextDraft = {
      ...currentDraft,
      ...patch
    };
    setSeguimientoExamenDrafts((prev) => ({
      ...prev,
      [key]: {
        ...nextDraft
      }
    }));
    const aviso = seguimientoActividadInformarDrafts[key];
    if (aviso?.informar && !aviso.mensajeEditado) {
      const actividad = (seguimientoContexto?.actividades || []).find((item) => Number(item.ActividadId) === Number(actividadId)) || seguimientoActividadSeleccionada;
      const estudiante = (seguimientoContexto?.estudiantes || []).find((item) => Number(item.EstudianteId) === Number(estudianteId));
      if (actividad && estudiante) {
        setSeguimientoActividadInformarDrafts((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || aviso),
            observacion: buildMensajeSeguimientoExamenEncargado({ actividad, estudiante, draft: nextDraft }),
            mensajeEditado: false
          }
        }));
      }
    }
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

  function formatNotaMensajeExamen(nota: number) {
    const value = Number(nota || 0);
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
  }

  function getNombreEstudianteMensaje(estudiante: any) {
    return [estudiante?.Nombre || "", estudiante?.PrimerApellido || "", estudiante?.SegundoApellido || ""]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      || getFullName(estudiante);
  }

  function getProfesorLogueadoMensaje() {
    return String(user?.nombre || "").trim() || "Profesor";
  }

  function getAnioLectivoMensaje() {
    return String(selected?.AnioNombre || selected?.AnioLectivoId || "").trim();
  }

  function getFraseActividadNotificacion(actividad?: SeguimientoActividad | null) {
    const raw = getSeguimientoActividadLabel(actividad || {});
    const sinArticulo = raw.replace(/^(el|la)\s+/i, "").trim() || raw || "Examen";
    const key = normalizarSeguimientoKey(sinArticulo);
    const articulo = key.includes("PRUEBA") ? "la" : "el";
    const nombre = key.includes("PRUEBA")
      ? sinArticulo.replace(/^prueba\b/i, "Prueba")
      : sinArticulo;
    return `${articulo} ${nombre}`;
  }

  function buildMensajeSeguimientoExamenEncargado(params: {
    actividad?: SeguimientoActividad | null;
    estudiante: any;
    draft?: SeguimientoExamenDraft;
    puntosMaximos?: number;
  }) {
    const puntosMaximosActividad = Number.isFinite(Number(params.puntosMaximos))
      ? Number(params.puntosMaximos)
      : Number(String(getSeguimientoActividadPuntosMaximos(params.actividad || null)).replace(",", "."));
    const draft = params.draft || getSeguimientoExamenDraft(Number(params.actividad?.ActividadId || 0), Number(params.estudiante?.EstudianteId || 0));
    const nota = calcularNotaExamen(draft.puntosObtenidos, puntosMaximosActividad);
    const estudianteNombre = getNombreEstudianteMensaje(params.estudiante);
    const materia = String(selected?.MateriaNombre || "").trim() || "la materia";
    const periodo = String(selected?.PeriodoNombre || "").trim() || "el período";
    const periodoAnio = [periodo, getAnioLectivoMensaje()].filter(Boolean).join("-");
    const profesor = getProfesorLogueadoMensaje();

    return `Estimado(a) encargado(a) legal:\n\nPor este medio se informa que el estudiante *${estudianteNombre}* obtuvo una nota de *${formatNotaMensajeExamen(nota)}* en la asignatura de *${materia}* en ${getFraseActividadNotificacion(params.actividad)} del *${periodoAnio || periodo}*\n\nAtentamente,\nProf. *${profesor}*\nDocente de *${materia}*`;
  }

  function calcularPorcentajeGanadoExamen(nota: number, actividad?: SeguimientoActividad | null, detalleItem?: SeguimientoEvaluacionDetalle | null) {
    void detalleItem;
    const pe = Number(actividad?.PorcentajeDentroRubro || 0);
    return Number(((Number(nota || 0) / 100) * pe).toFixed(2));
  }

  function abrirGeneradorExamenParaTabla(actividad: SeguimientoActividad, examen?: ExamenIaCreado) {
    const actividadId = String(actividad.ActividadId);
    const idxPrueba = tablaActividadesExamen.findIndex((a) => String(a.ActividadId) === actividadId);
    const grado = String(selected?.GrupoNivel || selected?.GrupoNombre || "").trim() || "Grado";
    const materia = String(selected?.MateriaNombre || "").trim() || "Materia";
    const periodo = String(selected?.PeriodoNombre || "").trim() || "Periodo";
    const nombreDefault = `${getPruebaLabel(actividad, idxPrueba)}-${grado}-${materia}, ${periodo}`;

    setExamenTablaActivaId(actividadId);
    setCrearExamenesOpen(true);
    setEditingExamenId(examen?.id || "");
    setExamenIaGeneradoId("");
    setExamenIaResultadoDraft(examen?.resultadoIA || "");
    setExamenIaDraft((prev) => ({
      ...prev,
      tablaId: actividadId,
      nombre: examen?.nombre || nombreDefault,
      indicaciones: examen?.indicaciones || prev.indicaciones || ""
    }));
    if (!plantillasExamenIa.length) loadPlantillasExamenIa();
  }

  useEffect(() => {
    if (!crearExamenesOpen || !examenTablaActivaId) return;
    window.setTimeout(() => {
      generadorExamenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [crearExamenesOpen, examenTablaActivaId]);

  useEffect(() => {
    if (!pendingScrollExamenId) return;
    const target = document.getElementById(`examen-tabla-${pendingScrollExamenId}`);
    if (!target) return;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollExamenId("");
    }, 120);
  }, [pendingScrollExamenId, examenesCreados, tablaVerGuardadasOpen]);

  async function guardarEdicionPorcentajeNota(params: {
    notaActividadId: number;
    actividadId: number;
    estudianteId: number;
    porcentajeActual: number;
  }) {
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para editar calificaciones.");
      return;
    }
    const key = getSeguimientoActividadKey(params.actividadId, params.estudianteId);
    const draftValue = String(notaPorcentajeDrafts[key] ?? "").trim();
    const porcentajeNuevo = Number(draftValue);
    if (!Number.isFinite(porcentajeNuevo) || porcentajeNuevo < 0 || porcentajeNuevo > 100) {
      setErrorMessage("El % obtenido debe estar entre 0 y 100");
      return;
    }
    if (Number(porcentajeNuevo.toFixed(2)) === Number(Number(params.porcentajeActual || 0).toFixed(2))) {
      setMessage("No hay cambios en el % obtenido");
      return;
    }
    const justificacion = String(window.prompt("Justificación obligatoria del cambio de nota:") || "").trim();
    if (!justificacion) {
      setErrorMessage("Debés ingresar una justificación para modificar la calificación");
      return;
    }

    setSavingNotaPorcentajeKey(key);
    setErrorMessage("");
    setMessage("");
    try {
      await api.put(`/eval360/seguimiento/notas/${params.notaActividadId}/porcentaje`, {
        porcentajeObtenido: porcentajeNuevo,
        justificacion
      });
      setMessage(`Calificación actualizada. Nota anterior: ${formatPercent(params.porcentajeActual)} | Nueva nota: ${formatPercent(porcentajeNuevo)}`);
      await loadSeguimientoEvaluacion(selected);
    } catch (error: any) {
      console.error("Error actualizando % obtenido:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo actualizar la calificación");
    } finally {
      setSavingNotaPorcentajeKey("");
    }
  }

  function getMinimoPuntosPorPorcentajeActividad(actividad?: SeguimientoActividad | null) {
    const raw = Number(actividad?.PorcentajeDentroRubro || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Acepta ambos formatos: 20 o 0.20
    return raw > 1 ? raw : (raw * 100);
  }

  function toNumeroComparacion(value: any) {
    const cleaned = String(value ?? "")
      .replace("%", "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
      .trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  function getPendientesCalificarActividad(actividadId: number) {
    const estudiantes = seguimientoContexto?.estudiantes || [];
    let pendientes = 0;
    for (const estudiante of estudiantes) {
      const draft = getSeguimientoExamenDraft(actividadId, Number(estudiante.EstudianteId));
      const texto = String(draft.puntosObtenidos || "").trim();
      if (texto === "") pendientes += 1;
    }
    return pendientes;
  }

  function startSeguimientoSaving(modo: "actividad" | "indicador" | "asignacion" | "eliminar") {
    setSavingSeguimientoModo(modo);
    setSavedSeguimientoModo(null);
    setSavingSeguimientoProgress(8);
    if (savingSeguimientoTimerRef.current !== null) {
      window.clearInterval(savingSeguimientoTimerRef.current);
      savingSeguimientoTimerRef.current = null;
    }
    savingSeguimientoTimerRef.current = window.setInterval(() => {
      setSavingSeguimientoProgress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 380);
  }

  function stopSeguimientoSaving(success: boolean, modo: "actividad" | "indicador" | "asignacion" | "eliminar") {
    if (savingSeguimientoTimerRef.current !== null) {
      window.clearInterval(savingSeguimientoTimerRef.current);
      savingSeguimientoTimerRef.current = null;
    }
    if (success) {
      setSavingSeguimientoProgress(100);
      setSavedSeguimientoModo(modo);
      window.setTimeout(() => setSavingSeguimientoProgress(0), 600);
    } else {
      setSavingSeguimientoProgress(0);
    }
    setSavingSeguimientoModo(null);
  }

  async function guardarSeguimientoActividad() {
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para guardar calificaciones.");
      return;
    }
    const estructuraGrupoDetalleId = Number(seguimientoActividadSeleccionada?.EstructuraGrupoDetalleId || seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || 0);
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !estructuraGrupoDetalleId || !seguimientoActividadSeleccionada) {
      setErrorMessage("Seleccioná el grupo, la plantilla, el componente y la actividad para guardar");
      return;
    }

    const puntosMaximos = toNumeroComparacion(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada));
    if (!Number.isFinite(puntosMaximos) || puntosMaximos <= 0) {
      setErrorMessage("Indicá la cantidad de puntos que vale la actividad");
      return;
    }
    const minimoPorcentaje = toNumeroComparacion(getMinimoPuntosPorPorcentajeActividad(seguimientoActividadSeleccionada));
    if (Number.isFinite(minimoPorcentaje) && minimoPorcentaje > 0 && puntosMaximos < minimoPorcentaje) {
      window.alert(`El valor de "Puntos que vale" no puede ser menor al porcentaje del examen (${minimoPorcentaje.toFixed(2)}).`);
      setErrorMessage(`El valor de "Puntos que vale" no puede ser menor al porcentaje del examen (${minimoPorcentaje.toFixed(2)}).`);
      return;
    }

    const registros = (seguimientoContexto.estudiantes || [])
      .filter((estudiante) => !isEstudianteSuspendido(estudiante))
      .map((estudiante) => {
      const draft = getSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
      const aviso = getSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId);
      const puntosTexto = String(draft.puntosObtenidos || "").trim();
      return {
        estudianteId: estudiante.EstudianteId,
        puntosObtenidos: puntosTexto === "" ? null : Number(puntosTexto),
        observacion: draft.observacion || "",
        informarEncargado: aviso.informar,
        mensajeEncargado: aviso.informar && aviso.mensajeEditado ? String(aviso.observacion || "").trim() : undefined
      };
    });

    const registrosConCambios = registros.filter((item) => {
      const existente = (seguimientoContexto?.notasActividades || []).find((nota) =>
        Number(nota.ActividadId) === Number(seguimientoActividadSeleccionada.ActividadId)
        && Number(nota.EstudianteId) === Number(item.estudianteId)
      );
      const puntosPrevios = existente?.PuntosObtenidos === null || existente?.PuntosObtenidos === undefined ? null : Number(existente.PuntosObtenidos);
      const observacionPrevia = String(existente?.Observacion || "").trim();
      const observacionNueva = String(item.observacion || "").trim();
      const cambioPuntos = !(puntosPrevios === null && item.puntosObtenidos === null) && Number(puntosPrevios ?? -999999) !== Number(item.puntosObtenidos ?? -999999);
      const cambioObservacion = observacionPrevia !== observacionNueva;
      const cambioInformar = Boolean(item.informarEncargado);
      return cambioPuntos || cambioObservacion || cambioInformar;
    });

    const invalid = registros.find((item) => item.puntosObtenidos !== null && (!Number.isFinite(Number(item.puntosObtenidos)) || !Number.isInteger(Number(item.puntosObtenidos)) || Number(item.puntosObtenidos) < 0 || Number(item.puntosObtenidos) > puntosMaximos));
    if (invalid) {
      window.alert("Hay puntos obtenidos mayores a los puntos que vale la actividad. Ajustá los valores marcados en rojo.");
      setErrorMessage("Los puntos obtenidos deben ser números enteros entre 0 y " + puntosMaximos);
      return;
    }
    const puntosMaximosPrevios = Number(seguimientoActividadSeleccionada.PuntosMaximos || 0);
    const cambioPuntosMaximos = Number.isFinite(puntosMaximosPrevios)
      ? Number(puntosMaximos.toFixed(2)) !== Number(puntosMaximosPrevios.toFixed(2))
      : true;

    if (!registrosConCambios.length && !cambioPuntosMaximos) {
      setMessage("No hay cambios para guardar.");
      return;
    }

    setSavingSeguimiento(true);
    startSeguimientoSaving("actividad");
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/seguimiento/guardar-actividad", {
        estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
        estructuraGrupoDetalleId,
        actividadId: seguimientoActividadSeleccionada.ActividadId,
        puntosMaximos,
        registros: registrosConCambios
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
      stopSeguimientoSaving(true, "actividad");
    } catch (error: any) {
      console.error("Error guardando actividad:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la actividad");
      stopSeguimientoSaving(false, "actividad");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  async function guardarSeguimientoIndicador() {
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para calificar.");
      return;
    }
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || !seguimientoIndicadorSeleccionado || (seguimientoModoHibridoTareas && !seguimientoActividadSeleccionada)) {
      setErrorMessage("Seleccioná el grupo, la plantilla, el componente y el indicador para guardar");
      return;
    }

    const registros = (seguimientoContexto.estudiantes || [])
      .filter((estudiante) => !isEstudianteSuspendido(estudiante))
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
    startSeguimientoSaving("indicador");
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
      setSeguimientoIndicadorId("");
      stopSeguimientoSaving(true, "indicador");
    } catch (error: any) {
      console.error("Error guardando seguimiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el seguimiento");
      stopSeguimientoSaving(false, "indicador");
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
          planeamientoId: planId || undefined,
          ...getGrupoClaseParams(selected)
        }
      });
      const data = unwrapApiData(response) || [];
      const indicadores = Array.isArray(data)
        ? (planId ? data : getEval360IndicadoresActivos(data))
        : [];
      setEval360Indicadores(indicadores);
      if (planId) {
        setEval360IndicadoresPorPlaneamiento((prev) => ({
          ...prev,
          [planId]: indicadores
        }));
        actualizarTotalIndicadoresIaPlaneamiento(planId, getEval360IndicadoresActivos(indicadores).length);
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
        setEval360GrupoIdsPorPlaneamiento((actual) => {
          if (actual[planeamientoId]?.length) return actual;
          const defaults = selected?.GrupoId ? [String(selected.GrupoId)] : [];
          return { ...actual, [planeamientoId]: defaults };
        });
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

  function getGrupoIdsGeneracionPlaneamiento(planeamientoId: number) {
    const ids = (eval360GrupoIdsPorPlaneamiento[planeamientoId] || [])
      .map((item) => Number(item))
      .filter((id) => Number.isFinite(id) && id > 0);
    return Array.from(new Set(ids));
  }

  function abrirIndicadoresDesdeHabilidades() {
    if (!selected) {
      setErrorMessage("Seleccioná una sección antes de agregar indicadores desde habilidades");
      return;
    }

    const nextOpen = !indicadoresHabilidadesOpen;
    if (nextOpen) {
      loadEval360PlantillasIaIndicadores();
      loadHabilidadesIa(selected.MateriaId, getGradoPlaneamientoFromGrupo(selected), false);
      setPlaneamientoIaFormOpen(false);
      setIndicadoresHabilidadesForm((prev) => ({
        ...initialIndicadoresHabilidadesForm,
        plantillaPromptIAId: prev.plantillaPromptIAId || eval360PlantillaIaIndicadorId || "",
        grupoIds: [getIndicadoresDestinoKey(selected)].filter(Boolean),
        tiposUso: [...DEFAULT_TIPOS_USO_INDICADORES]
      }));
    }
    setIndicadoresHabilidadesOpen(nextOpen);
  }

  function updateIndicadoresHabilidadesField(field: string, value: any) {
    setIndicadoresHabilidadesForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleIndicadoresHabilidadesMes(mes: string) {
    setIndicadoresHabilidadesForm((prev) => {
      const exists = prev.meses.includes(mes);
      const meses = exists ? prev.meses.filter((item) => item !== mes) : [...prev.meses, mes];
      const habilidadesVisibles = habilidadesIa
        .filter((habilidad) => !meses.length || meses.some((mesSeleccionado) => habilidadCorrespondeMes(String(habilidad.Mes || ""), mesSeleccionado)))
        .map((habilidad) => Number(habilidad.PlaneamientoHabilidadId));
      return {
        ...prev,
        meses,
        habilidadesIds: prev.habilidadesIds.filter((id) => habilidadesVisibles.includes(Number(id)))
      };
    });
  }

  function toggleIndicadoresHabilidadesId(habilidadId: number) {
    setIndicadoresHabilidadesForm((prev) => {
      const exists = prev.habilidadesIds.includes(habilidadId);
      return {
        ...prev,
        habilidadesIds: exists
          ? prev.habilidadesIds.filter((id) => Number(id) !== Number(habilidadId))
          : [...prev.habilidadesIds, habilidadId]
      };
    });
  }

  function toggleIndicadoresHabilidadesGrupo(destinoKey: string) {
    setIndicadoresHabilidadesForm((prev) => {
      const exists = prev.grupoIds.includes(destinoKey);
      const next = exists
        ? prev.grupoIds.filter((item) => item !== destinoKey)
        : Array.from(new Set([...prev.grupoIds, destinoKey]));
      return { ...prev, grupoIds: next.length ? next : prev.grupoIds };
    });
  }

  function toggleIndicadoresHabilidadesTipoUso(tipo: string) {
    setIndicadoresHabilidadesForm((prev) => {
      const exists = prev.tiposUso.includes(tipo);
      const next = exists ? prev.tiposUso.filter((item) => item !== tipo) : [...prev.tiposUso, tipo];
      return { ...prev, tiposUso: next.length ? next : prev.tiposUso };
    });
  }

  async function generarIndicadoresDesdeHabilidades() {
    if (!selected) {
      setErrorMessage("Seleccioná una sección antes de agregar indicadores desde habilidades");
      return;
    }

    const cantidadPorHabilidad = Number(indicadoresHabilidadesForm.cantidadPorHabilidad || 1);
    const destinosDisponibles = new Map<string, GrupoProfesor>();
    [selected, ...seccionesMismoGradoMateriaSeleccionado].filter(Boolean).forEach((grupo: GrupoProfesor) => {
      const key = getIndicadoresDestinoKey(grupo);
      if (key) destinosDisponibles.set(key, grupo);
    });
    const destinos = indicadoresHabilidadesForm.grupoIds
      .map((key) => destinosDisponibles.get(key))
      .filter((grupo): grupo is GrupoProfesor => !!grupo)
      .map((grupo) => ({
        grupoId: Number(grupo.GrupoId),
        grupoClaseId: Number(grupo.GrupoClaseId || 0) || null
      }));
    const grupoIdsDestino = Array.from(new Set(destinos.map((item) => item.grupoId)));

    if (!indicadoresHabilidadesForm.habilidadesIds.length) {
      setErrorMessage("Seleccioná al menos una habilidad");
      return;
    }
    if (!indicadoresHabilidadesForm.meses.length) {
      setErrorMessage("Seleccioná al menos un mes");
      return;
    }
    if (!grupoIdsDestino.length) {
      setErrorMessage("Seleccioná al menos una sección");
      return;
    }
    if (!cantidadPorHabilidad || cantidadPorHabilidad < 1) {
      setErrorMessage("La cantidad por habilidad debe ser mayor o igual a 1");
      return;
    }

    const operacionId = crearOperacionIdPlaneamientoIa("indicadores-habilidades");
    setGeneratingIndicadoresHabilidades(true);
    setGeneratingIndicadoresHabilidadesProgress(0);
    setGeneratingIndicadoresHabilidadesEtapa("Preparando generacion de indicadores");
    iniciarMonitoreoProgresoEval360(
      operacionId,
      setGeneratingIndicadoresHabilidadesProgress,
      setGeneratingIndicadoresHabilidadesEtapa,
      generatingIndicadoresHabilidadesTimerRef
    );
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/indicadores/generar-desde-habilidades", {
        operacionId,
        grupoId: selected.GrupoId,
        materiaId: selected.MateriaId,
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        ...getGrupoClaseParams(selected),
        plantillaPromptIAId: indicadoresHabilidadesForm.plantillaPromptIAId || eval360PlantillaIaIndicadorId || null,
        nombre: indicadoresHabilidadesForm.nombre,
        meses: indicadoresHabilidadesForm.meses,
        habilidadesIds: indicadoresHabilidadesForm.habilidadesIds,
        cantidadPorHabilidad,
        indicacionesDocente: indicadoresHabilidadesForm.indicacionesDocente,
        grupoIds: grupoIdsDestino,
        destinos,
        tiposUso: indicadoresHabilidadesForm.tiposUso
      });

      const data = unwrapApiData(response) || {};
      const planeamientoId = Number(data.planeamientoId || 0);
      const indicadores = Array.isArray(data.indicadores) ? data.indicadores : [];

      if (planeamientoId) {
        setEval360IndicadoresPorPlaneamiento((prev) => ({ ...prev, [planeamientoId]: indicadores }));
        actualizarTotalIndicadoresIaPlaneamiento(planeamientoId, getEval360IndicadoresActivos(indicadores).length);
        setEval360PanelIndicadoresOpen((prev) => ({ ...prev, [planeamientoId]: true }));
        setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: false }));
      }

      await loadPlaneamientos(selected, { mostrarLoading: false });
      await loadSeguimientoEvaluacion(selected);
      setIndicadoresHabilidadesOpen(false);
      setIndicadoresHabilidadesForm({
        ...initialIndicadoresHabilidadesForm,
        grupoIds: [getIndicadoresDestinoKey(selected)].filter(Boolean),
        tiposUso: [...DEFAULT_TIPOS_USO_INDICADORES]
      });
      setMessage(response?.data?.message || `Indicadores creados desde habilidades para ${Number(data.estructurasAplicadas || 0)}/${destinos.length} sección(es).`);
    } catch (error: any) {
      console.error("Error generando indicadores desde habilidades:", error);
      setGeneratingIndicadoresHabilidadesEtapa("No se pudieron generar los indicadores");
      setErrorMessage(error?.response?.data?.message || "No se pudieron crear los indicadores desde habilidades");
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(generatingIndicadoresHabilidadesTimerRef);
      setGeneratingIndicadoresHabilidades(false);
      window.setTimeout(() => {
        setGeneratingIndicadoresHabilidadesProgress(0);
        setGeneratingIndicadoresHabilidadesEtapa("");
      }, 900);
    }
  }

  function getIndicadorManualForm(planeamientoId: number) {
    return indicadorManualPorPlaneamiento[planeamientoId] || initialIndicadorManualForm;
  }

  function updateIndicadorManualForm(planeamientoId: number, field: string, value: any) {
    setIndicadorManualPorPlaneamiento((prev) => ({
      ...prev,
      [planeamientoId]: {
        ...initialIndicadorManualForm,
        ...(prev[planeamientoId] || {}),
        [field]: value
      }
    }));
  }

  function toggleIndicadorManualTipoUso(planeamientoId: number, tipo: string) {
    const form = getIndicadorManualForm(planeamientoId);
    const exists = form.tiposUso.includes(tipo);
    const next = exists ? form.tiposUso.filter((item) => item !== tipo) : [...form.tiposUso, tipo];
    updateIndicadorManualForm(planeamientoId, "tiposUso", next.length ? next : form.tiposUso);
  }

  async function agregarIndicadorManualPlaneamiento(planeamientoId: number, estructuraGrupoId?: number) {
    const form = getIndicadorManualForm(planeamientoId);
    if (!String(form.indicadorBase || "").trim()) {
      setErrorMessage("Escribí el indicador base antes de guardarlo");
      return;
    }

    setSavingIndicadorManualPlaneamientoId(planeamientoId);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/eval360/indicadores/planeamiento/${planeamientoId}/manual`, {
        estructuraGrupoId: estructuraGrupoId || eval360Estructura?.estructura?.EstructuraGrupoId || null,
        indicadorBase: form.indicadorBase,
        indicadorAvanzado: form.indicadorAvanzado,
        indicadorIntermedio: form.indicadorIntermedio,
        indicadorInicial: form.indicadorInicial,
        tiposUso: form.tiposUso
      });
      const data = unwrapApiData(response) || [];
      const indicadores = Array.isArray(data) ? data : [];
      setEval360IndicadoresPorPlaneamiento((prev) => ({ ...prev, [planeamientoId]: indicadores }));
      actualizarTotalIndicadoresIaPlaneamiento(planeamientoId, getEval360IndicadoresActivos(indicadores).length);
      setIndicadorManualPorPlaneamiento((prev) => ({
        ...prev,
        [planeamientoId]: { ...initialIndicadorManualForm, tiposUso: [...DEFAULT_TIPOS_USO_INDICADORES] }
      }));
      setMessage(response?.data?.message || "Indicador agregado correctamente");
    } catch (error: any) {
      console.error("Error agregando indicador manual:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo agregar el indicador");
    } finally {
      setSavingIndicadorManualPlaneamientoId(null);
    }
  }

  async function generarEval360IndicadoresDesdePlaneamiento(planeamientoIdParam?: number) {
    if (!selected) {
      setErrorMessage("Seleccioná una sección antes de generar indicadores");
      return;
    }
    const estructuraGrupoId = Number(eval360Estructura?.estructura?.EstructuraGrupoId || 0);
    const planeamientoId = Number(planeamientoIdParam || eval360PlaneamientoId || 0);
    const tiposUso = ["Cotidiano", "Tareas", "TablaEspecificaciones"];
    const indicacionesDocente = planeamientoIdParam ? getEval360IndicacionesPlaneamiento(planeamientoId) : eval360IndicacionesIa;
    const grupoIdsDestino = getGrupoIdsGeneracionPlaneamiento(planeamientoId);
    if (!grupoIdsDestino.length) {
      setErrorMessage("Seleccioná al menos una sección para generar los indicadores");
      return;
    }

    if (!planeamientoId) {
      setErrorMessage("Seleccioná un planeamiento guardado para tomar sus indicadores");
      return;
    }
    setGeneratingEval360Indicadores(true);
    setGeneratingEval360IndicadoresProgress(8);
    if (generatingEval360IndicadoresTimerRef.current !== null) {
      window.clearInterval(generatingEval360IndicadoresTimerRef.current);
      generatingEval360IndicadoresTimerRef.current = null;
    }
    generatingEval360IndicadoresTimerRef.current = window.setInterval(() => {
      setGeneratingEval360IndicadoresProgress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 280);
    setGeneratingEval360PlaneamientoId(planeamientoId);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post("/eval360/indicadores/generar-desde-planeamiento", {
        estructuraGrupoId: estructuraGrupoId || null,
        planeamientoId,
        plantillaPromptIAId: eval360PlantillaIaIndicadorId || null,
        indicacionesDocente: indicacionesDocente || "",
        grupoIds: grupoIdsDestino,
        tiposUso
      });

      const data = unwrapApiData(response) || {};
      const indicadores = Array.isArray(data.indicadores) ? data.indicadores : [];
      setEval360Indicadores(indicadores);
      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        [planeamientoId]: indicadores
      }));
      actualizarTotalIndicadoresIaPlaneamiento(planeamientoId, getEval360IndicadoresActivos(indicadores).length);
      setEval360PanelIndicadoresOpen((prev) => ({ ...prev, [planeamientoId]: true }));
      setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: false }));
      const estructurasAplicadas = Number(data.estructurasAplicadas || 0);
      const totalDestino = grupoIdsDestino.length;
      setMessage(`Indicadores generados y asignados en ${estructurasAplicadas}/${totalDestino} secciones`);
      setGeneratingEval360IndicadoresProgress(100);
      await loadEval360Indicadores(Number(data.estructuraGrupoId || estructuraGrupoId || 0), planeamientoId);
    } catch (error: any) {
      console.error("Error generando indicadores Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron generar los indicadores desde el planeamiento");
      setGeneratingEval360IndicadoresProgress(0);
    } finally {
      if (generatingEval360IndicadoresTimerRef.current !== null) {
        window.clearInterval(generatingEval360IndicadoresTimerRef.current);
        generatingEval360IndicadoresTimerRef.current = null;
      }
      setGeneratingEval360Indicadores(false);
      setGeneratingEval360PlaneamientoId(null);
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
    setSavingEval360PlaneamientoCambiosProgress(8);
    if (savingEval360PlaneamientoCambiosTimerRef.current !== null) {
      window.clearInterval(savingEval360PlaneamientoCambiosTimerRef.current);
      savingEval360PlaneamientoCambiosTimerRef.current = null;
    }
    savingEval360PlaneamientoCambiosTimerRef.current = window.setInterval(() => {
      setSavingEval360PlaneamientoCambiosProgress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 280);
    setMessage("");
    setErrorMessage("");

    try {
      const resultados = await Promise.allSettled(indicadoresActuales.map((indicador) => api.put("/eval360/indicadores/" + indicador.IndicadorGrupoId, {
        indicadorAvanzado: indicador.IndicadorAvanzado,
        indicadorIntermedio: indicador.IndicadorIntermedio,
        indicadorInicial: indicador.IndicadorInicial,
        activo: indicador.Activo !== false && indicador.Activo !== 0
      })));

      const guardados = resultados.filter((r) => r.status === "fulfilled").length;
      const bloqueadosPorCalificacion = resultados.filter((r) =>
        r.status === "rejected" && Number((r as any).reason?.response?.status || 0) === 409
      ).length;
      const fallos = resultados.length - guardados - bloqueadosPorCalificacion;

      if (guardados > 0) {
        setMessage(`Se guardaron ${guardados} indicadores en esta sección.`);
      } else {
        setMessage("");
      }

      if (bloqueadosPorCalificacion > 0 || fallos > 0) {
        const partes: string[] = [];
        if (bloqueadosPorCalificacion > 0) {
          partes.push(`${bloqueadosPorCalificacion} no se editaron porque ya tienen calificación.`);
        }
        if (fallos > 0) {
          partes.push(`${fallos} tuvieron error al guardar.`);
        }
        setErrorMessage(partes.join(" "));
      }

      setSavingEval360PlaneamientoCambiosProgress(100);
      const estructuraGrupoId = Number(indicadoresActuales[0]?.EstructuraGrupoId || 0) || undefined;
      await loadEval360Indicadores(estructuraGrupoId, planeamientoId);
      if (guardados > 0 && bloqueadosPorCalificacion === 0 && fallos === 0) {
        setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: true }));
        setEval360PanelIndicadoresOpen((prev) => ({ ...prev, [planeamientoId]: false }));
      }
    } catch (error: any) {
      console.error("Error guardando cambios de indicadores Eval360:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron guardar los cambios de los indicadores");
      setSavingEval360PlaneamientoCambiosProgress(0);
    } finally {
      if (savingEval360PlaneamientoCambiosTimerRef.current !== null) {
        window.clearInterval(savingEval360PlaneamientoCambiosTimerRef.current);
        savingEval360PlaneamientoCambiosTimerRef.current = null;
      }
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
        const idsEliminados = new Set(grupoIndicadores.map((item) => Number(item.IndicadorGrupoId)));
        const restantes = (eval360IndicadoresPorPlaneamiento[planId] || [])
          .filter((item) => !idsEliminados.has(Number(item.IndicadorGrupoId)));
        limpiarIndicadoresEliminadosLocalmente(planId, grupoIndicadores);
        actualizarTotalIndicadoresIaPlaneamiento(planId, getEval360IndicadoresActivos(restantes).length);
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

    if (!selected) return;
    const opcion = window.prompt(
      "¿Cómo querés eliminar los indicadores?\n\n1 = Solo esta sección\n2 = Todas las secciones del mismo grado\n\nEscribí 1 o 2.",
      "1"
    );
    if (opcion === null) return;

    const valor = String(opcion).trim();
    if (valor !== "1" && valor !== "2") {
      setErrorMessage("Opción inválida. Escribí 1 o 2.");
      return;
    }

    const grupoIdsDestino = valor === "2"
      ? seccionesMismoGradoMateriaSeleccionado.map((item) => Number(item.GrupoId)).filter((id) => Number.isFinite(id) && id > 0)
      : [Number(selected.GrupoId)];

    setDeletingEval360PlaneamientoId(planeamientoId);
    setDeletingEval360PlaneamientoProgress(8);
    if (deletingEval360PlaneamientoTimerRef.current !== null) {
      window.clearInterval(deletingEval360PlaneamientoTimerRef.current);
      deletingEval360PlaneamientoTimerRef.current = null;
    }
    deletingEval360PlaneamientoTimerRef.current = window.setInterval(() => {
      setDeletingEval360PlaneamientoProgress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 260);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.delete("/eval360/indicadores/planeamiento/" + planeamientoId, {
        data: { grupoIds: grupoIdsDestino }
      });

      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        [planeamientoId]: []
      }));

      setEval360Indicadores((prev) => prev.filter((item) => Number(item.PlaneamientoId || 0) !== Number(planeamientoId)));
      actualizarTotalIndicadoresIaPlaneamiento(planeamientoId, 0);
      setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: false }));
      const data = unwrapApiData(response) || {};
      const estructurasAplicadas = Number(data.estructurasAplicadas || 0);
      const eliminados = Number(data.eliminados || 0);
      setMessage(`Se eliminaron ${eliminados} indicadores en ${estructurasAplicadas} secciones.`);
      setDeletingEval360PlaneamientoProgress(100);
      await loadEval360Indicadores(undefined, planeamientoId);
    } catch (error: any) {
      console.error("Error eliminando todos los indicadores Eval360:", error);
      const message = error?.response?.data?.message || "No se pudieron eliminar los indicadores";
      setErrorMessage(message);
      setDeletingEval360PlaneamientoProgress(0);
    } finally {
      if (deletingEval360PlaneamientoTimerRef.current !== null) {
        window.clearInterval(deletingEval360PlaneamientoTimerRef.current);
        deletingEval360PlaneamientoTimerRef.current = null;
      }
      setDeletingEval360PlaneamientoId(null);
    }
  }

  function etiquetaTipoUso(tipo: string) {
    if (tipo === "Cotidiano") return "Trabajo cotidiano";
    if (tipo === "Tareas") return "Tareas";
    if (tipo === "TablaEspecificaciones") return "Tabla de especificaciones";
    return tipo;
  }

  function actualizarTotalIndicadoresIaPlaneamiento(planeamientoId: number, total: number) {
    setPlaneamientos((prev) => prev.map((planeamiento) =>
      Number(planeamiento.PlaneamientoId) === Number(planeamientoId)
        ? { ...planeamiento, TotalIndicadoresIAGenerados: Math.max(0, Number(total || 0)) }
        : planeamiento
    ));
  }

  function getTotalIndicadoresIaPlaneamiento(planeamiento: Planeamiento, indicadoresPlaneamiento: Eval360Indicador[]) {
    return Math.max(
      Number(planeamiento.TotalIndicadoresIAGenerados || 0),
      getEval360IndicadoresActivos(indicadoresPlaneamiento || []).length
    );
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
          ...getGrupoClaseParams(item),
          sincronizar: options.sincronizar === true ? true : false,
          _ts: Date.now()
        }
      });
      const data = response.data?.data || response.data || {};
      const planeamientosData = Array.isArray(data.planeamientos) ? data.planeamientos : [];
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
      const indicadoresPorPlanMap = Object.fromEntries(indicadoresPorPlan) as Record<number, Eval360Indicador[]>;

      setPlaneamientos(planeamientosData.map((planeamiento: Planeamiento) => {
        const planeamientoId = Number(planeamiento.PlaneamientoId || 0);
        const totalIndicadores = Math.max(
          Number(planeamiento.TotalIndicadoresIAGenerados || 0),
          getEval360IndicadoresActivos(indicadoresPorPlanMap[planeamientoId] || []).length
        );

        return {
          ...planeamiento,
          TotalIndicadoresIAGenerados: totalIndicadores
        };
      }));

      setEval360IndicadoresPorPlaneamiento((prev) => ({
        ...prev,
        ...indicadoresPorPlanMap
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

  async function openEditPlaneamiento(item: Planeamiento) {
    setMessage("");
    setErrorMessage("");
    setActivePanel("planeamientos");

    let planeamiento = item;
    const tieneResultadoIa = !!item.ResultadoIAJson || !!item.TieneResultadoIA;

    if (tieneResultadoIa && !item.ResultadoIAJson) {
      setLoadingPlaneamientoDetalleId(item.PlaneamientoId);
      try {
        const response = await api.get(`/gestion-profe/planeamientos/${item.PlaneamientoId}/detalle`);
        const data = unwrapApiData(response) || {};
        const detalle = data.planeamiento;
        if (!detalle) throw new Error("El API no devolvio el detalle del planeamiento");

        planeamiento = { ...item, ...detalle };
        setPlaneamientos((prev) => prev.map((actual) =>
          Number(actual.PlaneamientoId) === Number(item.PlaneamientoId) ? planeamiento : actual
        ));
      } catch (error: any) {
        console.error("Error cargando el detalle del planeamiento:", error);
        setErrorMessage(error?.response?.data?.message || "No se pudo abrir el planeamiento");
        return;
      } finally {
        setLoadingPlaneamientoDetalleId(null);
      }
    }

    const indicadoresActivosPlaneamiento = planeamientoIndicadores
      .filter((indicador) => Number(indicador.PlaneamientoId || 0) === Number(planeamiento.PlaneamientoId || 0))
      .map((indicador) => String(indicador.Descripcion || "").trim())
      .filter(Boolean);

    if (planeamiento.ResultadoIAJson) {
      try {
        const parsed = typeof planeamiento.ResultadoIAJson === "string"
          ? JSON.parse(planeamiento.ResultadoIAJson)
          : planeamiento.ResultadoIAJson;

        indicadoresOriginalesPlaneamientoIaRef.current = indicadoresActivosPlaneamiento;

        setUltimoPlaneamientoIa(normalizePlaneamientoIaResultado({
          ...(parsed || {}),
          indicadoresEvaluacion: indicadoresActivosPlaneamiento,
          nombre: parsed?.nombre || planeamiento.Nombre || "Planeamiento didáctico",
          observaciones: parsed?.observaciones || planeamiento.Observaciones || ""
        }));
        setRevisionPlaneamientoIaPendiente(true);
        setPlaneamientoIaForm((prev) => ({
          ...prev,
          periodicidad: String(parsed?.periodicidad || prev.periodicidad || ""),
          competenciaGeneral: String(parsed?.competenciaGeneral || (Array.isArray(parsed?.competenciasGenerales) ? (parsed.competenciasGenerales[0] || "") : "") || prev.competenciaGeneral || "")
        }));
        setEditingPlaneamientoIaId(planeamiento.PlaneamientoId);
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
      .filter((indicador) => indicador.PlaneamientoId === planeamiento.PlaneamientoId)
      .map((indicador) => ({
        PlaneamientoIndicadorId: indicador.PlaneamientoIndicadorId,
        PlaneamientoId: indicador.PlaneamientoId,
        Descripcion: indicador.Descripcion,
        NivelDesempenoId: indicador.NivelDesempenoId || null,
        NivelDescripcion: indicador.NivelDescripcion,
        NivelValor: indicador.NivelValor
      }));

    setEditingPlaneamientoId(planeamiento.PlaneamientoId);
    setEditingPlaneamientoIaId(null);
    setPlaneamientoForm({
      nombre: planeamiento.Nombre || "",
      fechaInicio: planeamiento.FechaInicio ? String(planeamiento.FechaInicio).slice(0, 10) : "",
      fechaFin: planeamiento.FechaFin ? String(planeamiento.FechaFin).slice(0, 10) : "",
      observaciones: planeamiento.Observaciones || "",
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
    setDeletingPlaneamientoId(id);
    setDeletingPlaneamientoProgress(8);
    if (deletingPlaneamientoTimerRef.current !== null) {
      window.clearInterval(deletingPlaneamientoTimerRef.current);
      deletingPlaneamientoTimerRef.current = null;
    }
    deletingPlaneamientoTimerRef.current = window.setInterval(() => {
      setDeletingPlaneamientoProgress((prev) => (prev >= 92 ? 92 : prev + 7));
    }, 260);

    try {
      const response = await api.delete(`/gestion-profe/planeamientos/${id}`);
      const result = response.data?.data || {};
      setMessage(result.message || "Planeamiento desactivado correctamente");
      setDeletingPlaneamientoProgress(100);
      if (editingPlaneamientoId === id) resetPlaneamientoForm();
      removerPlaneamientoLocal(id);
    } catch (error: any) {
      console.error("Error desactivando planeamiento:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo desactivar el planeamiento");
      setDeletingPlaneamientoProgress(0);
    } finally {
      if (deletingPlaneamientoTimerRef.current !== null) {
        window.clearInterval(deletingPlaneamientoTimerRef.current);
        deletingPlaneamientoTimerRef.current = null;
      }
      setTimeout(() => {
        setDeletingPlaneamientoId((curr) => (curr === id ? null : curr));
      }, 250);
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
    setDeletingPlaneamientoId(id);
    setDeletingPlaneamientoProgress(8);
    if (deletingPlaneamientoTimerRef.current !== null) {
      window.clearInterval(deletingPlaneamientoTimerRef.current);
      deletingPlaneamientoTimerRef.current = null;
    }
    deletingPlaneamientoTimerRef.current = window.setInterval(() => {
      setDeletingPlaneamientoProgress((prev) => (prev >= 92 ? 92 : prev + 7));
    }, 260);

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
      setDeletingPlaneamientoProgress(100);
      if (editingPlaneamientoId === id) resetPlaneamientoForm();
      await loadPlaneamientos(selected, { mostrarLoading: false });
    } catch (error: any) {
      console.error("Error eliminando planeamiento:", error);
      const dataError = error?.response?.data?.data || {};
      const bloqueados = Array.isArray(dataError.bloqueados) ? dataError.bloqueados : [];
      const totalIndicadores = bloqueados.reduce((total: number, item: any) => total + Number(item.totalIndicadoresIA || 0), 0);

      if (error?.response?.status === 409 && alcance === "seccion" && totalIndicadores > 0) {
        const eliminarIndicadores = window.confirm(
          `Este planeamiento tiene ${totalIndicadores} indicador(es) activos. ¿Deseás eliminarlos también para borrar el planeamiento?\n\nSi ya tienen calificaciones o registros, la aplicación conservará el bloqueo de seguridad.`
        );

        if (eliminarIndicadores) {
          try {
            const indicadoresResponse = await api.delete(`/eval360/indicadores/planeamiento/${id}`, {
              data: {
                grupoIds: [Number(selected.GrupoId)],
                ...getGrupoClaseParams(selected)
              }
            });
            const indicadoresEliminados = Number(unwrapApiData(indicadoresResponse)?.eliminados || 0);
            if (!indicadoresEliminados) {
              setErrorMessage("Este planeamiento no tiene indicadores en la sección actual; pertenece a otra sección paralela y no se eliminará desde aquí.");
              setDeletingPlaneamientoProgress(0);
              return;
            }
            await api.delete(`/gestion-profe/planeamientos/${id}/eliminar-definitivo`, {
              params: { alcance }
            });
            setMessage("Se eliminaron los indicadores y el planeamiento correctamente.");
            setDeletingPlaneamientoProgress(100);
            if (editingPlaneamientoId === id) resetPlaneamientoForm();
            await loadPlaneamientos(selected, { mostrarLoading: false });
            return;
          } catch (errorIndicadores: any) {
            console.error("Error eliminando indicadores antes del planeamiento:", errorIndicadores);
            setErrorMessage(errorIndicadores?.response?.data?.message || "No se pudieron eliminar los indicadores asociados al planeamiento");
          }
        } else {
          setErrorMessage("Primero eliminá los indicadores asociados al planeamiento desde la opción “Ver indicadores a partir de habilidades”.");
        }
      } else {
        setErrorMessage(error?.response?.data?.message || "No se pudo eliminar el planeamiento");
      }
      setDeletingPlaneamientoProgress(0);
    } finally {
      if (deletingPlaneamientoTimerRef.current !== null) {
        window.clearInterval(deletingPlaneamientoTimerRef.current);
        deletingPlaneamientoTimerRef.current = null;
      }
      setTimeout(() => {
        setDeletingPlaneamientoId((curr) => (curr === id ? null : curr));
      }, 250);
    }
  }

  function getSeguimientoActividadInformarDraft(actividadId: number, estudianteId: number): SeguimientoActividadInformarDraft {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    if (seguimientoActividadInformarDrafts[key]) return seguimientoActividadInformarDrafts[key];
    return { informar: false, observacion: "", mensajeEditado: false };
  }

  function updateSeguimientoActividadInformarDraft(actividadId: number, estudianteId: number, patch: Partial<SeguimientoActividadInformarDraft>) {
    const key = getSeguimientoActividadKey(actividadId, estudianteId);
    const actividad = (seguimientoContexto?.actividades || []).find((item) => Number(item.ActividadId) === Number(actividadId)) || seguimientoActividadSeleccionada;
    const estudiante = (seguimientoContexto?.estudiantes || []).find((item) => Number(item.EstudianteId) === Number(estudianteId));
    const mensajeSugerido = actividad && estudiante
      ? buildMensajeSeguimientoExamenEncargado({
          actividad,
          estudiante,
          draft: getSeguimientoExamenDraft(actividadId, estudianteId)
        })
      : "";

    setSeguimientoActividadInformarDrafts((prev) => {
      const current = prev[key] || getSeguimientoActividadInformarDraft(actividadId, estudianteId);
      const editandoTexto = patch.observacion !== undefined;
      const nextInformar = patch.informar !== undefined ? Boolean(patch.informar) : current.informar;
      const nextMensajeEditado = editandoTexto ? true : Boolean(current.mensajeEditado);
      const nextObservacion = editandoTexto
        ? String(patch.observacion || "")
        : (patch.informar === true && !current.mensajeEditado ? mensajeSugerido : current.observacion);

      return {
        ...prev,
        [key]: {
          ...current,
          ...patch,
          informar: nextInformar,
          observacion: nextObservacion,
          mensajeEditado: nextMensajeEditado
        }
      };
    });
  }

  function updatePlaneamientoIaField(field: keyof Omit<PlaneamientoIaForm, "habilidadesIds">, value: string) {
    if ((field === "materiaId" || field === "grado") && selected) {
      return;
    }
    if (ultimoPlaneamientoIa) setRevisionPlaneamientoIaPendiente(true);

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

    const gruposUnicos = Array.from(new Map(
      encontrados.map((grupo) => [Number(grupo.GrupoId), grupo])
    ).values());

    return gruposUnicos.length ? gruposUnicos : selected ? [selected] : [];
  }

  function getGrupoPlaneamientoIa() {
    return getGruposPlaneamientoIa()[0] || selected;
  }

  function construirPromptPlaneamientoIa() {
    const gruposSeleccionados = getGruposPlaneamientoIa();
    const grupoBase = gruposSeleccionados[0];
    const materiaId = Number(selected?.MateriaId || grupoBase?.MateriaId || planeamientoIaForm.materiaId || 0);
    const materia = materiasAsignadas.find((item) => Number(item.MateriaId) === materiaId) || selected || grupoBase;
    const grado = getGradoPlaneamientoFromGrupo(selected)
      || getGradoPlaneamientoFromGrupo(grupoBase)
      || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
    const habilidadesSeleccionadas = habilidadesIa.filter((habilidad) =>
      planeamientoIaForm.habilidadesIds.includes(Number(habilidad.PlaneamientoHabilidadId))
    );

    if (!materiaId || !grado || !gruposSeleccionados.length || !habilidadesSeleccionadas.length) {
      return "";
    }

    const secciones = gruposSeleccionados
      .map((grupo) => getNombreSeccionPlaneamiento(grupo))
      .filter(Boolean)
      .join(", ");
    const nombreSugerido = `${mesesSeleccionadosTextoIa || "Mes"} - ${grado || "Grado"} - ${materia?.MateriaNombre || "Materia"}`;
    const archivos = [
      ...documentoApoyoIa.map((file) => `- Archivo de apoyo: ${file.name}`),
      ...(plantillaFormatoIa ? [`- Referencia obligatoria de estructura, idioma y diseño Word: ${plantillaFormatoIa.name}`] : [])
    ];
    const habilidades = habilidadesSeleccionadas.map((habilidad, index) => (
      `${index + 1}. ${habilidad.DescripcionHabilidad}`
    )).join("\n");

    return [
      "Generar un planeamiento didáctico completo, listo para guardar si supera las validaciones del sistema.",
      `Nombre del planeamiento: ${planeamientoIaForm.nombre.trim() || nombreSugerido}.`,
      `Materia: ${materia?.MateriaCodigo ? `${materia.MateriaCodigo} - ` : ""}${materia?.MateriaNombre || "Materia"}.`,
      `Grado: ${grado}.`,
      `Secciones asignadas al docente: ${secciones}. El mismo planeamiento se guardará solo en estas secciones.`,
      `Meses: ${mesesSeleccionadosTextoIa || "según las habilidades seleccionadas"}.`,
      `Periodicidad: ${planeamientoIaForm.periodicidad || "por definir"}.`,
      `Fechas: ${planeamientoIaForm.fechaInicio || "sin fecha de inicio"} a ${planeamientoIaForm.fechaFin || "sin fecha de fin"}.`,
      `Competencia general: ${planeamientoIaForm.competenciaGeneral || "por definir"}.`,
      "Habilidades seleccionadas, que deben conservarse literalmente y en este orden:",
      habilidades,
      planeamientoIaForm.indicaciones.trim()
        ? `Indicaciones obligatorias del docente (deben cumplirse sin excepción):\n${planeamientoIaForm.indicaciones.trim()}`
        : "Indicaciones del docente: aplicar mediación contextualizada, DUA e indicadores observables.",
      archivos.length ? `Archivos disponibles:\n${archivos.join("\n")}` : "No se adjuntaron archivos adicionales.",
      "Las instrucciones escritas por la persona docente son obligatorias y tienen prioridad sobre ejemplos, plantillas o reglas genéricas.",
      "La referencia Word es obligatoria y única: conservá solo su diseño, tablas y encabezados; eliminá todo dato del plan anterior y llenalo únicamente con la información nueva. No la tratés como un segundo ejemplo ni combines estructuras.",
      "Revisá las Estrategias de mediación del planeamiento de referencia y usalas obligatoriamente como guía de estructura, encabezados, orden y secuencia pedagógica. Conservá sus tipos pedagógicos generales, pero redactá nuevamente los nombres de actividades, consignas, preguntas, ejercicios, ejemplos, recursos concretos y productos para las habilidades actuales. No copiés contenido sustantivo anterior ni interpretés números internos del Word como encabezados.",
      "Si el machote, ejemplo o material de referencia está en inglés, toda la salida nueva debe quedar en inglés."
    ].join("\n\n");
  }

  async function analizarReferenciaPlaneamientoIa(file: File | null) {
    setAnalisisReferenciaIa(null);
    if (!file) return;

    setAnalizandoReferenciaIa(true);
    try {
      const formData = new FormData();
      formData.append("archivoReferencia", file);
      const response = await api.post("/planeamiento-ia/analizar-referencia", formData, {
        timeout: 40000
      });
      const data = response.data?.data || response.data || {};
      const analisis = data as PlaneamientoReferenciaAnalisis;
      setAnalisisReferenciaIa(analisis);
      setSeccionModeloReferenciaIaId(analisis.seccionModeloPredeterminadaId || analisis.seccionesModelo?.[0]?.id || "");
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || "No se pudo analizar el planeamiento de referencia");
    } finally {
      setAnalizandoReferenciaIa(false);
    }
  }

  async function crearPromptPlaneamientoIa() {
    if (analizandoReferenciaIa || !analisisReferenciaIa?.esDocx) {
      setErrorMessage("Esperá a que el Word de referencia termine de analizarse antes de construir el prompt");
      return;
    }
    const prompt = construirPromptPlaneamientoIa();
    if (!prompt) {
      setErrorMessage("Completá materia, grado, al menos una sección y una habilidad antes de crear el prompt");
      return;
    }
    setPromptPlaneamientoIa(prompt);
    setPromptPlaneamientoIaConstruido(true);
    setPromptPlaneamientoIaMejorado(false);
    setErrorMessage("");
    setMessage("Prompt construido sin gastar IA. Podés generar el planeamiento o revisarlo con IA si necesitás una mejora adicional.");
    return;

    if (!grupoBase || !materiaId || !grupoId) {
      setMessage("Prompt construido. Revisá el texto y generá el planeamiento.");
      return;
    }

    const operacionId = crearOperacionIdPlaneamientoIa("construir-prompt");
    setMejorandoPromptPlaneamientoIa(true);
    setMejorandoPromptPlaneamientoIaProgress(0);
    setMejorandoPromptPlaneamientoIaEtapa("Construyendo y revisando el prompt");
    iniciarMonitoreoProgresoPlaneamientoIa(
      operacionId,
      setMejorandoPromptPlaneamientoIaProgress,
      setMejorandoPromptPlaneamientoIaEtapa,
      mejorandoPromptPlaneamientoIaTimerRef
    );

    try {
      const response = await api.post("/planeamiento-ia/mejorar-prompt", {
        operacionId,
        prompt,
        grupoId,
        materiaId,
        anioLectivoId: grupoBase.AnioLectivoId || selected?.AnioLectivoId,
        periodoId: grupoBase.PeriodoId || selected?.PeriodoId
      }, { timeout: 70000 });
      const data = response.data?.data || response.data || {};
      const promptMejorado = String(data.prompt || "").trim();
      if (!promptMejorado) throw new Error("La IA no devolvió un prompt revisado");
      setPromptPlaneamientoIa(promptMejorado);
      setPromptPlaneamientoIaConstruido(true);
      setPromptPlaneamientoIaMejorado(true);
      setMejorandoPromptPlaneamientoIaProgress(100);
      setMejorandoPromptPlaneamientoIaEtapa("Prompt construido y revisado");
      setMessage("Prompt construido y revisado con IA. Ya podés generar el planeamiento.");
    } catch (error: any) {
      setMejorandoPromptPlaneamientoIaEtapa("No se pudo completar la revisión del prompt");
      setPromptPlaneamientoIa(prompt);
      setPromptPlaneamientoIaConstruido(true);
      setPromptPlaneamientoIaMejorado(false);
      setMessage("Prompt construido. La revisión automática no respondió, pero podés revisar el texto y generar el planeamiento.");
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(mejorandoPromptPlaneamientoIaTimerRef);
      setMejorandoPromptPlaneamientoIa(false);
    }
  }

  function crearOperacionIdPlaneamientoIa(prefijo: string) {
    const identificador = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    return `${prefijo}-${identificador}`;
  }

  function detenerMonitoreoProgresoPlaneamientoIa(timerRef: React.MutableRefObject<number | null>) {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function iniciarMonitoreoProgresoPlaneamientoIa(
    operacionId: string,
    setPorcentaje: React.Dispatch<React.SetStateAction<number>>,
    setEtapa: React.Dispatch<React.SetStateAction<string>>,
    timerRef: React.MutableRefObject<number | null>
  ) {
    detenerMonitoreoProgresoPlaneamientoIa(timerRef);
    let consultando = false;

    const consultar = async () => {
      if (consultando) return;
      consultando = true;
      try {
        const response = await api.get(`/planeamiento-ia/progreso/${encodeURIComponent(operacionId)}`, {
          timeout: 10000
        });
        const data = response.data?.data || response.data || {};
        const porcentaje = Math.min(100, Math.max(0, Number(data.porcentaje || 0)));
        setPorcentaje(porcentaje);
        if (data.etapa) setEtapa(String(data.etapa));
      } catch {
        // La solicitud principal continúa; un fallo transitorio del sondeo no debe cancelarla.
      } finally {
        consultando = false;
      }
    };

    void consultar();
    timerRef.current = window.setInterval(() => void consultar(), 500);
  }

  function iniciarMonitoreoProgresoEval360(
    operacionId: string,
    setPorcentaje: React.Dispatch<React.SetStateAction<number>>,
    setEtapa: React.Dispatch<React.SetStateAction<string>>,
    timerRef: React.MutableRefObject<number | null>
  ) {
    detenerMonitoreoProgresoPlaneamientoIa(timerRef);
    let consultando = false;

    const consultar = async () => {
      if (consultando) return;
      consultando = true;
      try {
        const response = await api.get(`/eval360/progreso/${encodeURIComponent(operacionId)}`, {
          timeout: 10000
        });
        const data = response.data?.data || response.data || {};
        const porcentaje = Math.min(100, Math.max(0, Number(data.porcentaje || 0)));
        setPorcentaje(porcentaje);
        if (data.etapa) setEtapa(String(data.etapa));
      } catch {
        // La solicitud principal continua; un fallo transitorio del sondeo no debe cancelarla.
      } finally {
        consultando = false;
      }
    };

    void consultar();
    timerRef.current = window.setInterval(() => void consultar(), 500);
  }

  async function mejorarPromptPlaneamientoIa() {
    const promptBase = promptPlaneamientoIa.trim();
    const grupoBase = getGrupoPlaneamientoIa();
    const materiaId = Number(selected?.MateriaId || grupoBase?.MateriaId || planeamientoIaForm.materiaId || 0);
    const grupoId = Number(grupoBase?.GrupoId || selected?.GrupoId || 0);

    if (!promptPlaneamientoIaConstruido || !promptBase || !grupoBase || !materiaId || !grupoId) {
      setErrorMessage("Construí primero el prompt con los datos del planeamiento");
      return;
    }

    const operacionId = crearOperacionIdPlaneamientoIa("mejorar-prompt");
    setMejorandoPromptPlaneamientoIa(true);
    setMejorandoPromptPlaneamientoIaProgress(0);
    setMejorandoPromptPlaneamientoIaEtapa("Preparando la solicitud");
    iniciarMonitoreoProgresoPlaneamientoIa(
      operacionId,
      setMejorandoPromptPlaneamientoIaProgress,
      setMejorandoPromptPlaneamientoIaEtapa,
      mejorandoPromptPlaneamientoIaTimerRef
    );
    setErrorMessage("");
    try {
      const response = await api.post("/planeamiento-ia/mejorar-prompt", {
        operacionId,
        prompt: promptBase,
        grupoId,
        materiaId,
        anioLectivoId: grupoBase.AnioLectivoId || selected?.AnioLectivoId,
        periodoId: grupoBase.PeriodoId || selected?.PeriodoId
      }, { timeout: 70000 });
      const data = response.data?.data || response.data || {};
      const promptMejorado = String(data.prompt || "").trim();
      if (!promptMejorado) throw new Error("La IA no devolvió un prompt mejorado");
      setPromptPlaneamientoIa(promptMejorado);
      setPromptPlaneamientoIaConstruido(true);
      setPromptPlaneamientoIaMejorado(true);
      setMejorandoPromptPlaneamientoIaProgress(100);
      setMejorandoPromptPlaneamientoIaEtapa("Prompt mejorado");
      setMessage("Prompt mejorado con IA. Ya podés generar el planeamiento.");
    } catch (error: any) {
      setMejorandoPromptPlaneamientoIaEtapa("No se pudo completar la mejora");
      setErrorMessage(error?.response?.data?.message || error?.message || "No se pudo mejorar el prompt con IA");
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(mejorandoPromptPlaneamientoIaTimerRef);
      setMejorandoPromptPlaneamientoIa(false);
    }
  }

  useEffect(() => {
    if (!planeamientoIaFormOpen) return;
    setPromptPlaneamientoIa("");
    setPromptPlaneamientoIaConstruido(false);
    setPromptPlaneamientoIaMejorado(false);
  }, [
    planeamientoIaFormOpen,
    firmaDatosPromptPlaneamientoIa
  ]);

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
    if (!estructuraGrupoId) return [] as ExamenIaCreado[];
    try {
      const response = await api.get("/eval360/examenes-ia", { params: { estructuraGrupoId } });
      const data = response.data?.data || response.data || [];
      const rows = Array.isArray(data) ? data : [];
      const mapped: ExamenIaCreado[] = rows.map((row: any) => mapExamenIaRow(row));
      setExamenesCreados(mapped);
      return mapped;
    } catch (error) {
      console.error("Error cargando exámenes IA:", error);
      setExamenesCreados([]);
      return [] as ExamenIaCreado[];
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
    const promptDocente = promptPlaneamientoIaConstruido ? promptPlaneamientoIa.trim() : "";

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

    if (!plantillaFormatoIa) {
      setErrorMessage("Adjuntá el planeamiento de referencia que definirá la estructura de esta generación");
      return;
    }

    if (analizandoReferenciaIa || !analisisReferenciaIa?.esDocx) {
      setErrorMessage("Esperá a que el Word de referencia termine de analizarse antes de generar el planeamiento");
      return;
    }

    if (!planeamientoIaForm.periodicidad) {
      setErrorMessage("Seleccioná la periodicidad del planeamiento");
      return;
    }

    if (!planeamientoIaForm.competenciaGeneral) {
      setErrorMessage("Seleccioná una competencia general");
      return;
    }

    if (!promptDocente) {
      setErrorMessage("Construí primero el prompt con los datos del planeamiento");
      return;
    }

    const operacionId = crearOperacionIdPlaneamientoIa("generar-planeamiento");
    setGeneratingPlaneamientoIa(true);
    setGeneratingPlaneamientoIaProgress(0);
    setGeneratingPlaneamientoIaEtapa("Preparando datos y archivos");
    iniciarMonitoreoProgresoPlaneamientoIa(
      operacionId,
      setGeneratingPlaneamientoIaProgress,
      setGeneratingPlaneamientoIaEtapa,
      generatingPlaneamientoIaTimerRef
    );
    setMessage("");
    setErrorMessage("");
    if (ultimoPlaneamientoIa) setRevisionPlaneamientoIaPendiente(true);

    const temaCompleto = [
      planeamientoIaForm.tema ? `Tema o énfasis: ${planeamientoIaForm.tema}` : "",
      mesesSeleccionadosTextoIa ? `Meses seleccionados: ${mesesSeleccionadosTextoIa}` : "",
      planeamientoIaForm.area ? `Área: ${planeamientoIaForm.area}` : ""
    ].filter(Boolean).join("\n\n");

    try {
      const formData = new FormData();
      formData.append("operacionId", operacionId);
      formData.append("nombrePlaneamiento", planeamientoIaForm.nombre.trim());
      formData.append("periodicidad", planeamientoIaForm.periodicidad);
      formData.append("materiaId", String(materiaId));
      formData.append("materiaNombre", materia?.MateriaNombre || "");
      formData.append("tipoColegio", planeamientoIaForm.tipoColegio || "Académico");
      formData.append("grado", grado);
      formData.append("mes", mesesSeleccionadosTextoIa || "");
      formData.append("area", planeamientoIaForm.area || "");
      formData.append("tema", temaCompleto);
      formData.append("indicacionesDocente", planeamientoIaForm.indicaciones || "");
      formData.append("promptDocente", promptDocente);
      formData.append("referenciaObligatoria", "true");
      formData.append("semanas", String(Number(planeamientoIaForm.semanas || 4)));
      if (plantillaPlaneamientoIaId) formData.append("plantillaPromptIAId", plantillaPlaneamientoIaId);
      if (seccionModeloReferenciaIaId) formData.append("seccionModeloReferenciaId", seccionModeloReferenciaIaId);
      habilidadesIds.forEach((id) => formData.append("habilidadesIds[]", String(id)));
      documentoApoyoIa.forEach((file) => formData.append("documentoApoyo", file));
      formData.append("archivoReferencia", plantillaFormatoIa);

      const generarResponse = await api.post("/planeamiento-ia/generar-planeamiento", formData, {
        timeout: 300000
      });

      const generadoData = generarResponse.data?.data || generarResponse.data || {};
      let resultado: PlaneamientoIaResultado = normalizePlaneamientoIaResultado(generadoData.resultado || generadoData);
      if (planeamientoIaForm.nombre.trim()) resultado.nombre = planeamientoIaForm.nombre.trim();
      resultado.periodicidad = planeamientoIaForm.periodicidad;
      resultado.competenciaGeneral = planeamientoIaForm.competenciaGeneral;
      resultado.competenciasGenerales = planeamientoIaForm.competenciaGeneral ? [planeamientoIaForm.competenciaGeneral] : [];

      setUltimoPlaneamientoIa(resultado);
      const generadoListoParaGuardar = resultado.controlCalidad?.puedeGuardar === true;
      setRevisionPlaneamientoIaPendiente(!generadoListoParaGuardar);
      setGeneratingPlaneamientoIaProgress(100);
      setGeneratingPlaneamientoIaEtapa(
        generadoListoParaGuardar
          ? "Planeamiento generado y validado"
          : "Planeamiento generado con observaciones"
      );
      if (generadoListoParaGuardar) {
        setMessage("Planeamiento generado y validado. Ya está listo para guardar.");
      } else {
        const pendientes = (resultado.controlCalidad?.verificaciones || [])
          .filter((item) => item.estado === "error")
          .map((item) => item.detalle)
          .join(" ");
        setMessage("Planeamiento generado con observaciones. Presioná \"Corregir con IA\" para aplicar los ajustes y habilitar el guardado.");
        setErrorMessage(
          pendientes
            ? `La validación encontró ajustes pendientes: ${pendientes}`
            : "La validación encontró ajustes pendientes antes de guardar."
        );
      }
    } catch (error: any) {
      console.error("Error generando planeamiento con IA:", error);
      setGeneratingPlaneamientoIaEtapa("No se pudo completar la generación");
      const isTimeout = error?.code === "ECONNABORTED" || String(error?.message || "").toLowerCase().includes("timeout");
      setErrorMessage(
        isTimeout
          ? "La generación y revisión del planeamiento tardaron demasiado. Intentá nuevamente."
          : (error?.response?.data?.message || error?.message || "No se pudo generar el planeamiento con IA")
      );
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(generatingPlaneamientoIaTimerRef);
      setGeneratingPlaneamientoIa(false);
    }
  }

  function updateResultadoIaField(field: keyof PlaneamientoIaResultado, value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      [field]: value
    }));
  }

  function updateResultadoIaArray(field: keyof PlaneamientoIaResultado, value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    const lines = value.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      [field]: lines
    }));
  }

  function updateResultadoIaCampoReferencia(field: string, value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      camposReferencia: {
        ...(prev?.camposReferencia || {}),
        [field]: value
      }
    }));
  }

  function updateResultadoIaIndicador(index: number, value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => {
      const current = Array.isArray(prev?.indicadoresEvaluacion) ? [...prev!.indicadoresEvaluacion] : [];
      while (current.length <= index) current.push("");
      current[index] = value;
      return {
        ...(prev || {}),
        indicadoresEvaluacion: current
      };
    });
  }

  function addResultadoIaIndicador() {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      indicadoresEvaluacion: [...(Array.isArray(prev?.indicadoresEvaluacion) ? prev!.indicadoresEvaluacion : []), ""]
    }));
  }

  function removeResultadoIaIndicador(index: number) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => {
      const current = Array.isArray(prev?.indicadoresEvaluacion) ? [...prev!.indicadoresEvaluacion] : [];
      const next = current.filter((_, i) => i !== index);
      return {
        ...(prev || {}),
        indicadoresEvaluacion: next
      };
    });
  }

  function moveResultadoIaIndicador(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => {
      const current = Array.isArray(prev?.indicadoresEvaluacion) ? [...prev!.indicadoresEvaluacion] : [];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return prev || {};
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return {
        ...(prev || {}),
        indicadoresEvaluacion: current
      };
    });
  }

  function updateResultadoIaReflexion(field: "queFunciono" | "queNoFunciono" | "quePuedoMejorar", value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      reflexionesDocentes: {
        ...(prev?.reflexionesDocentes || {}),
        [field]: value
      }
    }));
  }

  function updateResultadoIaAdecuacion(field: string, value: string) {
    setRevisionPlaneamientoIaPendiente(true);
    setUltimoPlaneamientoIa((prev) => ({
      ...(prev || {}),
      estrategiaAdecuacionSignificativa: {
        ...(prev?.estrategiaAdecuacionSignificativa || {}),
        aplica: true,
        [field]: value
      }
    }));
  }

  async function solicitarRevisionPlaneamientoIa(
    resultadoEntrada: PlaneamientoIaResultado,
    operacionId?: string
  ): Promise<PlaneamientoIaResultado> {
    const gruposSeleccionados = getGruposPlaneamientoIa();
    const grupoSeleccionado = gruposSeleccionados[0];
    const materiaId = Number(selected?.MateriaId || grupoSeleccionado?.MateriaId || planeamientoIaForm.materiaId || 0);
    if (!grupoSeleccionado || !materiaId) {
      throw new Error("Seleccioná grupo y materia antes de revisar el planeamiento");
    }

    const materiaNombre = selected?.MateriaNombre || grupoSeleccionado?.MateriaNombre || "Materia";
    const grado = getGradoPlaneamientoFromGrupo(selected)
      || getGradoPlaneamientoFromGrupo(grupoSeleccionado)
      || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
    const nombreSugerido = `${mesesSeleccionadosTextoIa || "Mes"} - ${grado || "Grado"} - ${materiaNombre}`;
    const nombre = String(resultadoEntrada.nombre || planeamientoIaForm.nombre || nombreSugerido).trim()
      || nombreSugerido;
    const resultadoParaRevision: PlaneamientoIaResultado = {
      ...resultadoEntrada,
      nombre,
      mes: mesesSeleccionadosTextoIa || "",
      grado,
      periodicidad: planeamientoIaForm.periodicidad,
      competenciaGeneral: planeamientoIaForm.competenciaGeneral,
      competenciasGenerales: planeamientoIaForm.competenciaGeneral
        ? [planeamientoIaForm.competenciaGeneral]
        : [],
      materiaNombre,
      MateriaNombre: materiaNombre
    } as PlaneamientoIaResultado;

    // El Word ya fue analizado al generar el resultado. Reenviarlo en cada
    // corrección convertía el JSON en una carga de 25+ MB sin aportar nada a
    // la IA; el archivo se conserva localmente y se adjunta de nuevo solo al
    // guardar si el resultado revisado aún no lo incluye.
    const { plantillaFormatoDocx: _plantillaFormatoDocx, documentoWordInterno: _documentoWordInterno, ...resultadoLigero } = resultadoParaRevision as any;

    const response = await api.post("/planeamiento-ia/revisar-planeamiento", {
      operacionId,
      resultado: resultadoLigero,
      nombre,
      materiaNombre,
      grado,
      mes: mesesSeleccionadosTextoIa || "",
      tema: planeamientoIaForm.tema || ""
    }, {
      timeout: 300000
    });
    const data = response.data?.data || response.data || {};
    return normalizePlaneamientoIaResultado(data.resultado || data);
  }

  async function revisarPlaneamientoIaGenerado(mostrarMensaje = true): Promise<PlaneamientoIaResultado | null> {
    if (!ultimoPlaneamientoIa) return null;

    const operacionId = crearOperacionIdPlaneamientoIa("corregir-planeamiento");
    setRevisandoPlaneamientoIa(true);
    setCorrigiendoPlaneamientoIaProgress(0);
    setCorrigiendoPlaneamientoIaEtapa("Preparando la corrección automática");
    iniciarMonitoreoProgresoPlaneamientoIa(
      operacionId,
      setCorrigiendoPlaneamientoIaProgress,
      setCorrigiendoPlaneamientoIaEtapa,
      corrigiendoPlaneamientoIaTimerRef
    );
    setErrorMessage("");
    if (mostrarMensaje) setMessage("");

    try {
      const revisado = await solicitarRevisionPlaneamientoIa(ultimoPlaneamientoIa, operacionId);
      setUltimoPlaneamientoIa(revisado);
      const corregidoListoParaGuardar = revisado.controlCalidad?.puedeGuardar === true;
      setRevisionPlaneamientoIaPendiente(!corregidoListoParaGuardar);
      setCorrigiendoPlaneamientoIaProgress(corregidoListoParaGuardar ? 100 : 98);
      setCorrigiendoPlaneamientoIaEtapa(
        corregidoListoParaGuardar
          ? "Planeamiento corregido y listo para guardar"
          : "La corrección aún encontró datos pendientes"
      );

      if (corregidoListoParaGuardar) {
        if (mostrarMensaje) setMessage("Corregido con IA. Ya podés guardar el planeamiento.");
      } else {
        const pendientes = (revisado.controlCalidad?.verificaciones || [])
          .filter((item) => item.estado === "error")
          .map((item) => item.detalle)
          .join(" ");
        setErrorMessage(`La IA todavía no completó todos los ajustes. Podés volver a presionar “Corregir con IA”. ${pendientes}`.trim());
      }
      return revisado;
    } catch (error: any) {
      console.error("Error revisando planeamiento generado:", error);
      setCorrigiendoPlaneamientoIaEtapa("No se pudo completar la corrección");
      setErrorMessage(error?.response?.data?.message || "No se pudo corregir el planeamiento con IA");
      return null;
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(corrigiendoPlaneamientoIaTimerRef);
      setRevisandoPlaneamientoIa(false);
    }
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

    if (!planeamientoIaForm.periodicidad) {
      setErrorMessage("Seleccioná la periodicidad antes de guardar");
      return;
    }
    if (!planeamientoIaForm.competenciaGeneral) {
      setErrorMessage("Seleccioná una competencia general antes de guardar");
      return;
    }
    const operacionId = crearOperacionIdPlaneamientoIa("guardar-planeamiento");
    setSavingPlaneamientoIa(true);
    setSavingPlaneamientoIaProgress(0);
    setSavingPlaneamientoIaEtapa("Preparando el guardado");
    iniciarMonitoreoProgresoPlaneamientoIa(
      operacionId,
      setSavingPlaneamientoIaProgress,
      setSavingPlaneamientoIaEtapa,
      savingPlaneamientoIaTimerRef
    );
    setMessage("");
    setErrorMessage("");

    try {
      let resultadoRevisado = ultimoPlaneamientoIa;
      // Recupera resultados generados antes de que la referencia se conservara
      // correctamente: si el DOCX aún está adjunto, se incorpora sin llamar a
      // la IA para que el backend pueda reanalizarlo y guardar el plan.
      if (!resultadoRevisado.plantillaFormatoDocx?.base64 && plantillaFormatoIa) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("No se pudo leer el Word de referencia adjunto"));
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(plantillaFormatoIa);
        });
        const base64 = dataUrl.split(",", 2)[1] || "";
        if (!base64) throw new Error("No se pudo conservar el Word de referencia adjunto");
        resultadoRevisado = {
          ...resultadoRevisado,
          plantillaFormatoNombre: plantillaFormatoIa.name,
          documentoReferenciaNombre: resultadoRevisado.documentoReferenciaNombre || plantillaFormatoIa.name,
          plantillaFormatoDocx: {
            nombre: plantillaFormatoIa.name,
            mimeType: plantillaFormatoIa.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            base64
          }
        };
      }

      const nombreMateriaSeleccionada = selected?.MateriaNombre || grupoSeleccionado?.MateriaNombre || "Materia";
      const gradoSeleccionado = getGradoPlaneamientoFromGrupo(selected) || getGradoPlaneamientoFromGrupo(grupoSeleccionado) || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
      const nombrePlaneamientoSugerido = `${mesesSeleccionadosTextoIa || "Mes"} - ${gradoSeleccionado || "Grado"} - ${nombreMateriaSeleccionada}`;
      const nombrePlaneamientoCorrecto = String(
        resultadoRevisado?.nombre || planeamientoIaForm.nombre || nombrePlaneamientoSugerido
      ).trim() || nombrePlaneamientoSugerido;
      const observacionesUsuario = String(resultadoRevisado?.observaciones || "").trim();
      const indicadoresEditados = (Array.isArray(resultadoRevisado?.indicadoresEvaluacion) ? resultadoRevisado.indicadoresEvaluacion : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);

      const crearPayload = (grupo: GrupoProfesor, indiceGuardado: number, totalGuardados: number) => {
        const resultadoNormalizado = {
          ...resultadoRevisado,
          indicadoresEvaluacion: indicadoresEditados,
          observaciones: observacionesUsuario,
          nombre: nombrePlaneamientoCorrecto,
          mes: mesesSeleccionadosTextoIa || "",
          grado: gradoSeleccionado,
          periodicidad: planeamientoIaForm.periodicidad,
          competenciaGeneral: planeamientoIaForm.competenciaGeneral,
          competenciasGenerales: planeamientoIaForm.competenciaGeneral ? [planeamientoIaForm.competenciaGeneral] : [],
          materiaNombre: nombreMateriaSeleccionada,
          MateriaNombre: nombreMateriaSeleccionada
        };

        return {
        operacionId,
        indiceGuardado,
        totalGuardados,
        anioLectivoId: selected?.AnioLectivoId || grupo.AnioLectivoId,
        periodoId: selected?.PeriodoId || grupo.PeriodoId,
        grupoId: Number(grupo.GrupoId),
        materiaId,
        nombre: nombrePlaneamientoCorrecto,
        mes: mesesSeleccionadosTextoIa || "",
        grado: gradoSeleccionado,
        materiaNombre: nombreMateriaSeleccionada,
        fechaInicio: planeamientoIaForm.fechaInicio || null,
        fechaFin: planeamientoIaForm.fechaFin || null,
        observaciones: observacionesUsuario || null,
        resultado: resultadoNormalizado
        };
      };

      // La exportación prepara y persiste el Word en el servidor. Se invoca sin
      // descargarlo para que el botón de descarga esté disponible al terminar.
      const prepararWordInterno = async (planeamientoId: number) => {
        if (!planeamientoId) return false;
        try {
          await api.get(`/planeamiento-ia/planeamientos/${planeamientoId}/exportar-word`, {
            responseType: "blob",
            timeout: 120000
          });
          return true;
        } catch (error) {
          console.error("No se pudo preparar el Word interno del planeamiento:", error);
          return false;
        }
      };
      const wordsPendientes: number[] = [];

      const totalValidacion = gruposSeleccionados.length;
      const validacionPrevia = await api.post("/planeamiento-ia/validar-guardado-planeamiento", {
        resultado: crearPayload(grupoSeleccionado, 0, totalValidacion).resultado,
        nombre: nombrePlaneamientoCorrecto
      });
      const datosValidacion = validacionPrevia.data?.data || validacionPrevia.data || {};
      const resultadoValidado = normalizePlaneamientoIaResultado(datosValidacion.resultado || resultadoRevisado);
      setUltimoPlaneamientoIa(resultadoValidado);
      if (datosValidacion.listoParaGuardar !== true) {
        setRevisionPlaneamientoIaPendiente(true);
        const pendientes = (datosValidacion.verificaciones || [])
          .filter((item: any) => item.estado === "error")
          .map((item: any) => item.detalle)
          .join(" ");
        setSavingPlaneamientoIaEtapa("El planeamiento requiere ajustes antes de guardar");
        setErrorMessage(`El guardado no se inició. ${pendientes || "Revisá los ajustes pendientes."}`.trim());
        return;
      }
      resultadoRevisado = resultadoValidado;

      if (editingPlaneamientoIaId) {
        const normalizarIndicadoresParaComparar = (items: string[]) => items
          .map((item) => String(item || "").trim().replace(/\s+/g, " ").toLocaleLowerCase())
          .filter(Boolean);
        const indicadoresCambiaron = JSON.stringify(normalizarIndicadoresParaComparar(indicadoresEditados))
          !== JSON.stringify(normalizarIndicadoresParaComparar(indicadoresOriginalesPlaneamientoIaRef.current));
        if (indicadoresCambiaron) {
          const confirmaReemplazoIndicadores = window.confirm(
            "Los indicadores asociados cambiarán para coincidir con esta actualización del planeamiento. ¿Deseás continuar?"
          );
          if (!confirmaReemplazoIndicadores) {
            setSavingPlaneamientoIaEtapa("Actualización cancelada por la persona docente");
            return;
          }
        }
        const gruposExtras = gruposSeleccionados.filter((grupo) => Number(grupo.GrupoId) !== Number(grupoSeleccionado.GrupoId));
        const totalGuardados = 1 + gruposExtras.length;
        await api.put(
          `/planeamiento-ia/planeamientos/${editingPlaneamientoIaId}/resultado`,
          crearPayload(grupoSeleccionado, 0, totalGuardados)
        );
        if (!await prepararWordInterno(editingPlaneamientoIaId)) wordsPendientes.push(editingPlaneamientoIaId);

        if (gruposExtras.length > 0) {
          for (let index = 0; index < gruposExtras.length; index += 1) {
            const respuestaGuardado = await api.post(
              "/planeamiento-ia/guardar-planeamiento",
              crearPayload(gruposExtras[index], index + 1, totalGuardados)
            );
            const planeamientoId = Number(respuestaGuardado.data?.data?.planeamientoId || respuestaGuardado.data?.planeamientoId || 0);
            if (!await prepararWordInterno(planeamientoId)) wordsPendientes.push(planeamientoId);
          }
          setMessage(`Planeamiento actualizado y copiado en ${gruposExtras.length} sección(es) adicional(es)`);
        } else {
          setMessage("Planeamiento actualizado correctamente");
        }
      } else {
        for (let index = 0; index < gruposSeleccionados.length; index += 1) {
          const respuestaGuardado = await api.post(
            "/planeamiento-ia/guardar-planeamiento",
            crearPayload(gruposSeleccionados[index], index, gruposSeleccionados.length)
          );
          const planeamientoId = Number(respuestaGuardado.data?.data?.planeamientoId || respuestaGuardado.data?.planeamientoId || 0);
          if (!await prepararWordInterno(planeamientoId)) wordsPendientes.push(planeamientoId);
        }
        setMessage(`Planeamiento generado con IA y guardado en ${gruposSeleccionados.length} sección(es)`);
      }
      if (wordsPendientes.length) {
        setErrorMessage("El planeamiento se guardó, pero el Word interno no pudo prepararse. Podés usar el botón Descargar Word para intentarlo nuevamente.");
      }
      setUltimoPlaneamientoIa(null);
      setEditingPlaneamientoIaId(null);
      indicadoresOriginalesPlaneamientoIaRef.current = [];
      setDocumentoApoyoIa([]);
      setPlantillaFormatoIa(null);
      setAnalisisReferenciaIa(null);
      setSavingPlaneamientoIaProgress(100);
      setSavingPlaneamientoIaEtapa("Planeamiento guardado");
      setPlaneamientoIaFormOpen(false);

      if (selected && gruposSeleccionados.some((grupo) => Number(grupo.GrupoId) === Number(selected.GrupoId)) && Number(selected.MateriaId) === materiaId) {
        await loadPlaneamientos(selected);
      } else {
        await loadDetalle(grupoSeleccionado);
        setActivePanel("planeamientos");
      }
    } catch (error: any) {
      console.error("Error guardando planeamiento generado:", error);
      setSavingPlaneamientoIaEtapa("No se pudo completar el guardado");
      setRevisionPlaneamientoIaPendiente(true);
      setMessage("El guardado encontró una validación pendiente. Corregí con IA y volvé a guardar.");
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar el planeamiento generado");
    } finally {
      detenerMonitoreoProgresoPlaneamientoIa(savingPlaneamientoIaTimerRef);
      setSavingPlaneamientoIa(false);
    }
  }


  async function loadAsistencia(item = selected, fecha = asistenciaFecha) {
    if (!item) return;
    const reqKey = `${getGrupoProfesorKey(item)}|${fecha}`;
    if (asistenciaInFlightKeyRef.current === reqKey) return;
    asistenciaInFlightKeyRef.current = reqKey;
    setLoadingAsistencia(true);
    setErrorMessage("");

    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/asistencia`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          ...getGrupoClaseParams(item),
          fecha
        }
      });
      const data = response.data?.data || response.data || {};
      const estudiantes = detalle?.estudiantes?.length ? detalle.estudiantes : (data.estudiantes || []);
      if (Array.isArray(data.estudiantes) && data.estudiantes.length) {
        setDetalle((prev) => prev ? { ...prev, estudiantes: data.estudiantes } : prev);
      }
      const lecciones = Array.isArray(data.lecciones) ? data.lecciones : [];
      const registros = Array.isArray(data.registros) ? data.registros : [];
      setAsistenciaLecciones(lecciones);
      const drafts = buildAsistenciaDrafts(estudiantes, registros, lecciones);
      setAsistenciaDrafts(drafts);
      setAsistenciaDraftsBase(drafts);
      asistenciaPrimeraSeleccionRegistradaRef.current.clear();
      setAsistenciaYaCalificada(registros.length > 0);
      const notificacionesCargadas: AsistenciaNotificacionEstado = {};
      for (const registro of registros) {
        const key = asistenciaDraftKey(Number(registro?.EstudianteId || 0), Number(registro?.HorarioGrupoId || 0));
        notificacionesCargadas[key] = {
          correoEnviado: Boolean(registro?.CorreoEnviado),
          waEnviado: Boolean(registro?.WaEnviado)
        };
      }
      setAsistenciaNotificaciones(notificacionesCargadas);
      setResumenAsistencia(Array.isArray(data.resumen) ? data.resumen : []);
    } catch (error: any) {
      console.error("Error cargando asistencia:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la asistencia");
    } finally {
      setLoadingAsistencia(false);
      if (asistenciaInFlightKeyRef.current === reqKey) asistenciaInFlightKeyRef.current = "";
    }
  }

  async function loadBitacora(item = selected) {
    if (!item) return;
    const reqKey = getGrupoProfesorKey(item);
    if (bitacoraInFlightKeyRef.current === reqKey) return;
    bitacoraInFlightKeyRef.current = reqKey;
    setLoadingBitacora(true);
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/bitacora`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          ...getGrupoClaseParams(item)
        }
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setBitacorasGrupo(rows);
    } catch (error: any) {
      console.error("Error cargando bitácora:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar la bitácora");
    } finally {
      setLoadingBitacora(false);
      if (bitacoraInFlightKeyRef.current === reqKey) bitacoraInFlightKeyRef.current = "";
    }
  }

  async function cargarCierreCurso(item = selected, soloEstado = false) {
    if (!item) return;
    setLoadingCierreCurso(true);
    try {
      const response = await api.get(`/gestion-profe/mis-grupos/${item.GrupoId}/materias/${item.MateriaId}/cierre`, {
        params: {
          anioLectivoId: item.AnioLectivoId,
          periodoId: item.PeriodoId,
          ...getGrupoClaseParams(item),
          soloEstado: soloEstado ? "true" : undefined
        }
      });
      const data = response.data?.data || {};
      setCierreCurso(data.cierre || null);
      actualizarCierreCursoEnListado(item, data.cierre || null);
      if (!soloEstado) setCierreCursoPreview(data.preview || null);
    } catch (error: any) {
      console.error("Error cargando cierre del curso:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el cierre del curso");
    } finally {
      setLoadingCierreCurso(false);
    }
  }

  function actualizarCierreCursoEnListado(item: GrupoProfesor, cierre: any | null) {
    const estado = String(cierre?.Estado || "").toUpperCase();
    const cerrado = Boolean(cierre?.Cerrado) || estado === "CERRADO_DOCENTE";
    setGrupos((prev) => prev.map((grupo) => {
      const mismoCurso = Number(grupo.GrupoId) === Number(item.GrupoId)
        && Number(grupo.MateriaId) === Number(item.MateriaId)
        && Number(grupo.AnioLectivoId) === Number(item.AnioLectivoId)
        && Number(grupo.PeriodoId) === Number(item.PeriodoId)
        && Number(grupo.GrupoClaseId || 0) === Number(item.GrupoClaseId || 0);
      if (!mismoCurso) return grupo;
      return {
        ...grupo,
        CursoCerrado: cerrado ? 1 : 0,
        CierreCursoEstado: cierre?.Estado || null,
        CierreCursoCerradoAt: cierre?.CerradoAt || null,
        CierreCursoReabiertoAt: cierre?.ReabiertoAt || null
      };
    }));
  }

  async function cerrarCursoSeleccionado() {
    if (!selected) return;
    const incompletos = Number(cierreCursoPreview?.resumen?.totalIncompletos || 0);
    const mensaje = incompletos > 0
      ? `El curso tiene ${incompletos} estudiante(s) con advertencias. Se cerrara como Incompleto. Deseas continuar?`
      : "Deseas cerrar este curso? Al cerrarlo se bloquean nuevas notas, asistencia y bitacora hasta que Direccion lo reabra.";
    if (!window.confirm(mensaje)) return;

    setSavingCierreCurso(true);
    try {
      setMessage("");
      setErrorMessage("");
      const response = await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/cierre`, {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        ...getGrupoClaseParams(selected)
      });
      const data = response.data?.data || {};
      setCierreCurso(data.cierre || null);
      actualizarCierreCursoEnListado(selected, data.cierre || null);
      setCierreCursoPreview(data.preview || null);
      setMessage(response.data?.message || "Curso cerrado correctamente");
    } catch (error: any) {
      console.error("Error cerrando curso:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cerrar el curso");
    } finally {
      setSavingCierreCurso(false);
    }
  }

  async function reabrirCursoSeleccionado() {
    if (!selected || !isGestionAdminRole) return;
    const motivo = window.prompt("Indica el motivo de reapertura");
    if (!motivo || !motivo.trim()) return;

    setSavingCierreCurso(true);
    try {
      setMessage("");
      setErrorMessage("");
      const response = await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/cierre/reabrir`, {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        ...getGrupoClaseParams(selected),
        motivo: motivo.trim()
      });
      const data = response.data?.data || {};
      setCierreCurso(data.cierre || null);
      actualizarCierreCursoEnListado(selected, data.cierre || null);
      await cargarCierreCurso(selected);
      setMessage(response.data?.message || "Curso reabierto correctamente");
    } catch (error: any) {
      console.error("Error reabriendo curso:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo reabrir el curso");
    } finally {
      setSavingCierreCurso(false);
    }
  }

  async function guardarBitacora() {
    if (!selected) return;
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para guardar cambios.");
      return;
    }
    if (!String(bitacoraForm.temasDesarrollados || "").trim()) {
      setErrorMessage("Temas desarrollados es obligatorio");
      return;
    }
    setSavingBitacora(true);
    try {
      setErrorMessage("");
      setMessage("");
      const payload = {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        ...getGrupoClaseParams(selected),
        temasDesarrollados: bitacoraForm.temasDesarrollados,
        observaciones: bitacoraForm.observaciones,
        hechosRelevantes: bitacoraForm.hechosRelevantes
      };
      if (editingBitacoraId !== null) {
        await api.put(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/bitacora/${editingBitacoraId}`, payload);
      } else {
        await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/bitacora`, payload);
      }
      setBitacoraForm({ temasDesarrollados: "", observaciones: "", hechosRelevantes: "" });
      const fueEdicion = editingBitacoraId !== null;
      setEditingBitacoraId(null);
      await loadBitacora(selected);
      setMessage(fueEdicion ? "Bitácora actualizada correctamente" : "Bitácora guardada correctamente");
    } catch (error: any) {
      console.error("Error guardando bitácora:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la bitácora");
    } finally {
      setSavingBitacora(false);
    }
  }

  async function handleSaveAsistencia() {
    if (!selected || !detalle) return;
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para guardar asistencia.");
      return;
    }

    const leccionesUsar = asistenciaLecciones.length ? asistenciaLecciones : getAsistenciaLeccionesFallback();
    const estudiantesGestionables = detalle.estudiantes.filter((estudiante) => !isEstudianteSuspendido(estudiante));
    const registros = estudiantesGestionables.flatMap((estudiante) =>
      leccionesUsar.map((leccion) => {
        const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
        const draft = asistenciaDrafts[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
        const draftBase = asistenciaDraftsBase[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
        const actual = asistenciaDraftComparable(draft);
        const base = asistenciaDraftComparable(draftBase);
        const changed = actual.estado !== base.estado
          || actual.minutosTardia !== base.minutosTardia
          || actual.observacion !== base.observacion
          || Boolean(draft.notificarEncargado);
        if (!changed) return null;
        return {
          key,
          estudianteId: estudiante.EstudianteId,
          horarioGrupoId: leccion.HorarioGrupoId || null,
          bloqueHorarioId: leccion.BloqueHorarioId || null,
          estado: actual.estado,
          minutosTardia: actual.minutosTardia,
          observacion: actual.observacion || null,
          notificarEncargado: Boolean(draft.notificarEncargado)
        };
      })
    ).filter(Boolean) as any[];

    let registrosGuardar = registros;
    if (!asistenciaYaCalificada) {
      registrosGuardar = estudiantesGestionables.flatMap((estudiante) =>
        leccionesUsar.map((leccion) => {
          const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
          const draft = asistenciaDrafts[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
          const actual = asistenciaDraftComparable(draft);
          return {
            key,
            estudianteId: estudiante.EstudianteId,
            horarioGrupoId: leccion.HorarioGrupoId || null,
            bloqueHorarioId: leccion.BloqueHorarioId || null,
            estado: actual.estado || "PRESENTE",
            minutosTardia: actual.minutosTardia,
            observacion: actual.observacion || null,
            notificarEncargado: Boolean(draft.notificarEncargado)
          };
        })
      );
    }

    if (registrosGuardar.length === 0) {
      setMessage(estudiantesGestionables.length === 0 ? "No hay estudiantes habilitados para guardar asistencia" : "No hay cambios en asistencia para guardar");
      setSavedAsistencia(asistenciaYaCalificada);
      return;
    }

    const invalid = registrosGuardar.find((item) => !Number.isFinite(item.minutosTardia) || item.minutosTardia < 0);
    if (invalid) {
      setErrorMessage("Los minutos de tardía deben ser un número válido");
      return;
    }

    setSavingAsistencia(true);
    setSavedAsistencia(false);
    setSavingAsistenciaProgress(8);
    if (savingAsistenciaTimerRef.current !== null) {
      window.clearInterval(savingAsistenciaTimerRef.current);
      savingAsistenciaTimerRef.current = null;
    }
    savingAsistenciaTimerRef.current = window.setInterval(() => {
      setSavingAsistenciaProgress((prev) => (prev >= 92 ? 92 : prev + 6));
    }, 320);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.post(`/gestion-profe/mis-grupos/${selected.GrupoId}/materias/${selected.MateriaId}/asistencia`, {
        anioLectivoId: selected.AnioLectivoId,
        periodoId: selected.PeriodoId,
        ...getGrupoClaseParams(selected),
        fecha: asistenciaFecha,
        registros: registrosGuardar.map((item) => ({
          estudianteId: item.estudianteId,
          horarioGrupoId: item.horarioGrupoId,
          bloqueHorarioId: item.bloqueHorarioId,
          estado: item.estado,
          minutosTardia: item.minutosTardia,
          observacion: item.observacion,
          notificarEncargado: item.notificarEncargado
        }))
      });
      const result = response.data?.data || {};
      const notificacionesEstado: AsistenciaNotificacionEstado = {};
      for (const item of registrosGuardar) {
        const k = String(item.key || asistenciaDraftKey(item.estudianteId, item.horarioGrupoId));
        notificacionesEstado[k] = { correoEnviado: false, waEnviado: false };
      }
      const notificaciones = Array.isArray(result?.notificaciones) ? result.notificaciones : [];
      for (const notif of notificaciones) {
        if (notif?.enviado !== true) continue;
        const estudianteId = Number(notif?.estudianteId || 0);
        if (!estudianteId) continue;
        for (const item of registrosGuardar) {
          if (Number(item.estudianteId) !== estudianteId || !item.notificarEncargado) continue;
          const k = String(item.key || asistenciaDraftKey(item.estudianteId, item.horarioGrupoId));
          const prev = notificacionesEstado[k] || {};
          if (notif?.canal === "correo") prev.correoEnviado = true;
          if (notif?.canal === "whatsapp") prev.waEnviado = true;
          notificacionesEstado[k] = prev;
        }
      }
      // Respaldo visual: si se marcó informar y no llegó detalle por canal,
      // mostramos el/los medios disponibles del estudiante para que sí aparezca en la columna final.
      for (const item of registrosGuardar) {
        if (!item?.notificarEncargado) continue;
        const k = String(item.key || asistenciaDraftKey(item.estudianteId, item.horarioGrupoId));
        const prev = notificacionesEstado[k] || {};
        if (!prev.correoEnviado && !prev.waEnviado) {
          const estudianteFila = (detalle?.estudiantes || []).find((e) => Number(e.EstudianteId) === Number(item.estudianteId));
          prev.correoEnviado = Boolean(getCorreoHabilitadoEstudiante(estudianteFila as any));
          prev.waEnviado = Boolean(getTelefonoWhatsAppHabilitado(estudianteFila as any));
          notificacionesEstado[k] = prev;
        }
      }
      setAsistenciaNotificaciones(notificacionesEstado);
      setMessage(result.message || "Asistencia guardada correctamente");
      setSavingAsistenciaProgress(100);
      setSavedAsistencia(true);
      setAsistenciaYaCalificada(true);
      setResumenAsistencia(Array.isArray(result.resumen) ? result.resumen : []);
      await loadAsistencia(selected, asistenciaFecha);
      await loadGrupos(q);
    } catch (error: any) {
      console.error("Error guardando asistencia:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo guardar la asistencia");
      setSavingAsistenciaProgress(0);
    } finally {
      if (savingAsistenciaTimerRef.current !== null) {
        window.clearInterval(savingAsistenciaTimerRef.current);
        savingAsistenciaTimerRef.current = null;
      }
      setSavingAsistencia(false);
    }
  }

  async function handleSaveNotas() {
    if (!selected || !detalle) return;
    if (cursoGestionCerrado) {
      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para guardar notas.");
      return;
    }

    if (!detalle.plantilla) {
      setErrorMessage("No hay una plantilla de evaluación para este grupo y materia");
      return;
    }

    const estudiantesGestionables = detalle.estudiantes.filter((estudiante) => !isEstudianteSuspendido(estudiante));
    const notas = estudiantesGestionables.flatMap((estudiante) =>
      detalle.actividades.map((actividad) => {
        const value = getDraftValue(estudiante.EstudianteId, actividad.EvaluacionActividadId);
        return {
          estudianteId: estudiante.EstudianteId,
          evaluacionActividadId: actividad.EvaluacionActividadId,
          nota: value === "" ? null : Number(value)
        };
      })
    );

    if (notas.length === 0) {
      setMessage("No hay estudiantes habilitados para guardar notas");
      return;
    }

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
        ...getGrupoClaseParams(selected),
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
    if (isGestionAdminRole) {
      if (!adminInstitucionId) {
        setErrorMessage("Seleccioná el colegio antes de cargar las secciones.");
        return;
      }
      if (adminModoCarga === "GRADO" && !adminGrado) {
        setErrorMessage("Seleccioná el grado a consultar.");
        return;
      }
      if (adminModoCarga === "PROFESOR" && !adminProfesorId) {
        setErrorMessage("Seleccioná el profesor a consultar.");
        return;
      }
    }
    loadGrupos(q);
  }

  function toggleMisGruposPeriodo(periodoId: string) {
    setMisGruposPeriodosSeleccionados((prev) => {
      if (periodoId === MIS_GRUPOS_TODOS_KEY) {
        return [MIS_GRUPOS_TODOS_KEY];
      }

      const base = prev.includes(MIS_GRUPOS_TODOS_KEY) ? [] : [...prev];
      const yaSeleccionado = base.includes(periodoId);
      const siguientes = yaSeleccionado
        ? base.filter((id) => id !== periodoId)
        : [...base, periodoId];

      if (!siguientes.length || siguientes.length >= periodosDisponiblesMisGrupos.length) {
        return [MIS_GRUPOS_TODOS_KEY];
      }

      return siguientes;
    });
  }

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    if (isGestionAdminRole) {
      const institucionInicial = !isSuperAdminRole && user?.institucionId ? String(user.institucionId) : "";
      if (institucionInicial) {
        setAdminInstitucionId(institucionInicial);
      }
      loadAdminGestionFiltros(institucionInicial);
    } else {
      loadGrupos("");
    }
    loadNivelesDesempeno();
  }, [isGestionAdminRole, isSuperAdminRole, user?.institucionId]);

  useEffect(() => {
    if (activePanel === "reportes" && selected) {
      cargarAuditoriaEnvios(selected);
    }
  }, [activePanel, selected?.GrupoId, selected?.MateriaId, selected?.PeriodoId, selected?.AnioLectivoId]);

  async function loadMiHorario(item = selected) {
    const itemHorario = item || selected || grupoHorarioPredeterminado;

    if (!itemHorario) {
      setHorarioBloques([]);
      setHorarioEntradas([]);
      return;
    }

    const requestId = horarioRequestIdRef.current + 1;
    horarioRequestIdRef.current = requestId;
    setLoadingHorario(true);
    setErrorMessage("");
    setHorarioBloques([]);
    setHorarioEntradas([]);

    try {
      const params: Record<string, any> = {};
      if (itemHorario?.AnioLectivoId) params.anioLectivoId = itemHorario.AnioLectivoId;
      if (itemHorario?.PeriodoId) params.periodoId = itemHorario.PeriodoId;
      const profesorHorarioId = itemHorario?.UsuarioId
        || (isGestionAdminRole && adminModoCarga === "PROFESOR" ? adminProfesorId : "");
      if (profesorHorarioId) params.profesorId = profesorHorarioId;
      if (itemHorario?.InstitucionId || adminInstitucionId) {
        params.institucionId = itemHorario?.InstitucionId || adminInstitucionId;
      }
      params._ts = Date.now();

      const response = await api.get("/gestion-profe/mi-horario", {
        params,
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      });
      if (requestId !== horarioRequestIdRef.current) return;
      const data = response.data?.data || response.data || {};
      setHorarioBloques(Array.isArray(data.bloques) ? data.bloques : []);
      setHorarioEntradas(Array.isArray(data.entradas) ? data.entradas : []);
    } catch (error: any) {
      if (requestId !== horarioRequestIdRef.current) return;
      console.error("Error cargando mi horario:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudo cargar el horario del profesor");
    } finally {
      if (requestId === horarioRequestIdRef.current) setLoadingHorario(false);
    }
  }

  useEffect(() => {
    if (!horarioVisible) return;
    const itemHorario = selected || grupoHorarioPredeterminado;
    if (!itemHorario) return;
    void loadMiHorario(itemHorario);
  }, [
    horarioVisible,
    selected?.UsuarioId,
    selected?.AnioLectivoId,
    selected?.PeriodoId,
    grupoHorarioPredeterminado?.UsuarioId,
    grupoHorarioPredeterminado?.AnioLectivoId,
    grupoHorarioPredeterminado?.PeriodoId,
    adminProfesorId,
    adminInstitucionId
  ]);

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
    if (!selected || !seguimientoContexto?.estructura?.EstructuraGrupoId || !seguimientoActividadSeleccionada) {
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
    startSeguimientoSaving("asignacion");
    setMessage("");
    setErrorMessage("");
    try {
      for (const actividad of actividadesAGuardar) {
        const actividadId = Number(actividad.ActividadId || 0);
        const estructuraGrupoDetalleId = Number(actividad.EstructuraGrupoDetalleId || seguimientoDetalleSeleccionado?.EstructuraGrupoDetalleId || 0);
        await api.post("/eval360/seguimiento/asignar-indicadores-actividad", {
          estructuraGrupoId: seguimientoContexto.estructura.EstructuraGrupoId,
          estructuraGrupoDetalleId,
          actividadId,
          indicadorIds: getSeguimientoIndicadoresAsignadosActividad(actividadId)
        });
      }
      setMessage("Indicadores asignados correctamente");
      await loadSeguimientoEvaluacion(selected);
      if (activePanel === "notas") await loadDetalle(selected);
      setSeguimientoMatrizAsignacionMinimizada(true);
      stopSeguimientoSaving(true, "asignacion");
    } catch (error: any) {
      console.error("Error asignando indicadores:", error);
      setErrorMessage(error?.response?.data?.message || "No se pudieron asignar los indicadores");
      stopSeguimientoSaving(false, "asignacion");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  function getHorarioEntradas(bloqueId: number, diaSemana: number) {
    return horarioEntradas.filter((item) => Number(item.BloqueHorarioId) === Number(bloqueId) && Number(item.DiaSemana) === Number(diaSemana));
  }

  async function seleccionarMateriaDesdeHorario(entrada: HorarioEntrada) {
    const candidatos = grupos.filter((grupo) =>
      Number(grupo.GrupoId) === Number(entrada.GrupoId) &&
      Number(grupo.MateriaId) === Number(entrada.MateriaId)
    );
    const contextoHorario = selected || grupoHorarioPredeterminado;
    const entradaAnioLectivoId = Number(entrada.AnioLectivoId || contextoHorario?.AnioLectivoId || 0);
    const entradaPeriodoId = Number(entrada.PeriodoId || contextoHorario?.PeriodoId || 0);
    const grupoMateria = candidatos.find((grupo) =>
      (!entradaAnioLectivoId || Number(grupo.AnioLectivoId) === entradaAnioLectivoId) &&
      (!entradaPeriodoId || Number(grupo.PeriodoId) === entradaPeriodoId)
    ) || (!entradaAnioLectivoId && !entradaPeriodoId ? candidatos[0] : null);

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

  const horarioReferencia = selected || grupoHorarioPredeterminado || null;
  const horarioContextoGrupos = useMemo(() => {
    if (!horarioReferencia) return [] as GrupoProfesor[];
    return gruposOrdenados.filter((item) =>
      Number(item.AnioLectivoId) === Number(horarioReferencia.AnioLectivoId) &&
      Number(item.PeriodoId) === Number(horarioReferencia.PeriodoId)
    );
  }, [gruposOrdenados, horarioReferencia]);

  const horarioEntradasKeys = useMemo(() => {
    const keys = new Set<string>();
    horarioEntradas.forEach((item) => {
      if (item.AnioLectivoId && item.PeriodoId) {
        keys.add(getHorarioAsignacionKey(item));
      } else {
        keys.add(getHorarioGrupoMateriaKey(item));
      }
    });
    return keys;
  }, [horarioEntradas]);

  const horarioPendientes = useMemo(() => {
    return horarioContextoGrupos.filter((item) => (
      !horarioEntradasKeys.has(getHorarioAsignacionKey(item)) &&
      !horarioEntradasKeys.has(getHorarioGrupoMateriaKey(item))
    ));
  }, [horarioContextoGrupos, horarioEntradasKeys]);

  const horarioResumen = useMemo(() => {
    const gruposConHorario = new Set<string>();
    horarioEntradas.forEach((item) => {
      gruposConHorario.add(item.AnioLectivoId && item.PeriodoId
        ? getHorarioAsignacionKey(item)
        : getHorarioGrupoMateriaKey(item));
    });

    return {
      totalAsignacionesPeriodo: horarioContextoGrupos.length,
      totalLeccionesProgramadas: horarioEntradas.length,
      totalMateriasConHorario: gruposConHorario.size,
      totalPendientes: horarioPendientes.length
    };
  }, [horarioContextoGrupos, horarioEntradas, horarioPendientes]);

  const gruposParaPromptPlaneamientoIa = getGruposPlaneamientoIa();
  const grupoBaseParaPromptPlaneamientoIa = gruposParaPromptPlaneamientoIa[0];
  const materiaParaPromptPlaneamientoIa = Number(
    selected?.MateriaId
      || grupoBaseParaPromptPlaneamientoIa?.MateriaId
      || planeamientoIaForm.materiaId
      || 0
  );
  const gradoParaPromptPlaneamientoIa = getGradoPlaneamientoFromGrupo(selected)
    || getGradoPlaneamientoFromGrupo(grupoBaseParaPromptPlaneamientoIa)
    || normalizarGradoPlaneamiento(planeamientoIaForm.grado);
  const faltantesPromptPlaneamientoIa = [
    !materiaParaPromptPlaneamientoIa ? "materia" : "",
    !gradoParaPromptPlaneamientoIa ? "grado" : "",
    !gruposParaPromptPlaneamientoIa.length ? "sección" : "",
    !mesesSeleccionadosIa.length ? "mes o meses" : "",
    !planeamientoIaForm.periodicidad ? "periodicidad" : "",
    !planeamientoIaForm.competenciaGeneral ? "competencia general" : "",
    !planeamientoIaForm.habilidadesIds.length ? "habilidades" : "",
    !plantillaFormatoIa ? "planeamiento de referencia" : "",
    !analisisReferenciaIa?.esDocx ? "análisis de la referencia" : ""
  ].filter(Boolean);
  const datosPromptPlaneamientoIaCompletos = faltantesPromptPlaneamientoIa.length === 0
    && !loadingHabilidadesIa
    && !analizandoReferenciaIa;
  const promptPlaneamientoIaListo = promptPlaneamientoIaConstruido && Boolean(promptPlaneamientoIa.trim());
  const puedeConstruirPromptPlaneamientoIa = datosPromptPlaneamientoIaCompletos
    && !ultimoPlaneamientoIa
    && !generatingPlaneamientoIa
    && !mejorandoPromptPlaneamientoIa;
  const puedeGenerarPlaneamientoIa = promptPlaneamientoIaListo
    && !ultimoPlaneamientoIa
    && !generatingPlaneamientoIa
    && !mejorandoPromptPlaneamientoIa;
  const planeamientoIaListoParaGuardar = Boolean(
    ultimoPlaneamientoIa
    && ultimoPlaneamientoIa.controlCalidad?.puedeGuardar === true
    && !(ultimoPlaneamientoIa.controlCalidad?.verificaciones || []).some((item) => item.estado === "error")
    && !revisionPlaneamientoIaPendiente
  );
  const verificacionesPlaneamientoIa = ultimoPlaneamientoIa?.controlCalidad?.verificaciones || [];
  const planeamientoIaTieneErrores = verificacionesPlaneamientoIa.some((item) => item.estado === "error");
  const planeamientoIaTieneAdvertencias = verificacionesPlaneamientoIa.some((item) => item.estado === "alerta");
  const estadoPlaneamientoIa = planeamientoIaListoParaGuardar
    ? "listo"
    : planeamientoIaTieneErrores || revisionPlaneamientoIaPendiente
      ? "error"
      : planeamientoIaTieneAdvertencias
        ? "advertencias"
        : "error";
  const etiquetaEstadoPlaneamientoIa = estadoPlaneamientoIa === "listo"
    ? "Listo para guardar"
    : estadoPlaneamientoIa === "advertencias"
      ? "Advertencias: confirmación docente requerida"
      : "Error: requiere ajustes";

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
              }}
            >
              {horarioVisible ? "Ocultar horario" : "Ver horario"}
            </button>
            {horarioVisible && (
              <button type="button" style={secondaryButtonStyle} onClick={() => loadMiHorario(selected || grupoHorarioPredeterminado)} disabled={loadingHorario}>
                {loadingHorario ? "Actualizando..." : "Actualizar horario"}
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
            marginBottom: "12px"
          }}
        >
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 800 }}>Grupos del período</div>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalAsignacionesPeriodo}</strong>
          </div>
          <div style={{ background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#166534", fontWeight: 800 }}>Lecciones programadas</div>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalLeccionesProgramadas}</strong>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#334155", fontWeight: 800 }}>Materias con horario</div>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalMateriasConHorario}</strong>
          </div>
          <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
            <div style={{ fontSize: "12px", color: "#c2410c", fontWeight: 800 }}>Pendientes de horario</div>
            <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalPendientes}</strong>
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
            {horarioResumen.totalAsignacionesPeriodo > 0 && horarioResumen.totalLeccionesProgramadas === 0 && (
              <div style={{ marginBottom: "12px", padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>
                <strong style={{ display: "block", marginBottom: "6px" }}>Todavía no hay horario cargado para tus grupos de este período.</strong>
                <span style={{ display: "block", marginBottom: horarioPendientes.length ? "10px" : 0 }}>
                  Tus grupos sí están asignados, pero aún no existe configuración de horario de clases para mostrarlos en el calendario.
                </span>
                {horarioPendientes.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {horarioPendientes.slice(0, 12).map((item) => (
                      <span
                        key={`pendiente-horario-${item.AsignacionDocenteId}`}
                        style={{
                          border: "1px solid #fdba74",
                          background: "#ffffff",
                          color: "#9a3412",
                          borderRadius: "999px",
                          padding: "6px 10px",
                          fontWeight: 800,
                          fontSize: "13px"
                        }}
                      >
                        {item.GrupoNombre} - {item.MateriaNombre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
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
        {isGestionAdminRole ? (
          <div style={{ display: "grid", gap: "12px", marginBottom: "14px" }}>
            <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Colegio
                <select
                  value={adminInstitucionId}
                  disabled={loadingAdminFiltros || (!isSuperAdminRole && !!user?.institucionId)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAdminInstitucionId(value);
                    setAdminGrado("");
                    setAdminProfesorId("");
                    setGrupos([]);
                    setSelected(null);
                    setDetalle(null);
                    void loadAdminGestionFiltros(value);
                  }}
                >
                  <option value="">{loadingAdminFiltros ? "Cargando..." : "Seleccioná un colegio"}</option>
                  {adminInstitucionesFiltro.map((item) => (
                    <option key={item.InstitucionId} value={item.InstitucionId}>{item.InstitucionNombre}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                Modo de carga
                <select
                  value={adminModoCarga}
                  onChange={(e) => {
                    const value = e.target.value as "GRADO" | "PROFESOR";
                    setAdminModoCarga(value);
                    setAdminGrado("");
                    setAdminProfesorId("");
                    setGrupos([]);
                    setSelected(null);
                    setDetalle(null);
                  }}
                >
                  <option value="GRADO">Colegio + grado</option>
                  <option value="PROFESOR">Colegio + profesor</option>
                </select>
              </label>

              {adminModoCarga === "GRADO" ? (
                <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                  Grado
                  <select
                    value={adminGrado}
                    disabled={!adminInstitucionId || loadingAdminFiltros}
                    onChange={(e) => {
                      setAdminGrado(e.target.value);
                      setGrupos([]);
                      setSelected(null);
                      setDetalle(null);
                    }}
                  >
                    <option value="">{loadingAdminFiltros ? "Cargando..." : "Seleccioná un grado"}</option>
                    {adminGradosFiltro.map((item) => (
                      <option key={item.Grado} value={item.Grado}>{item.Grado}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={{ display: "grid", gap: "6px", color: "#0f172a", fontWeight: 700 }}>
                  Profesor
                  <select
                    value={adminProfesorId}
                    disabled={!adminInstitucionId || loadingAdminFiltros}
                    onChange={(e) => {
                      setAdminProfesorId(e.target.value);
                      setGrupos([]);
                      setSelected(null);
                      setDetalle(null);
                    }}
                  >
                    <option value="">{loadingAdminFiltros ? "Cargando..." : "Seleccioná un profesor"}</option>
                    {adminProfesoresFiltro.map((item) => (
                      <option key={item.ProfesorId} value={item.ProfesorId}>{item.ProfesorNombre}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        ) : null}
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
              setMisGruposPeriodosSeleccionados([MIS_GRUPOS_TODOS_KEY]);
              if (isGestionAdminRole) {
                setAdminModoCarga("GRADO");
                const institucionInicial = !isSuperAdminRole && user?.institucionId ? String(user.institucionId) : "";
                setAdminInstitucionId(institucionInicial);
                setAdminGrado("");
                setAdminProfesorId("");
                setGrupos([]);
                setSelected(null);
                setDetalle(null);
                void loadAdminGestionFiltros(institucionInicial);
              } else {
                loadGrupos("");
              }
            }}
          >
            Limpiar
          </button>
        </form>

        {periodosDisponiblesMisGrupos.length ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "16px",
              alignItems: "center"
            }}
          >
            <span style={{ color: "#cbd5e1", fontWeight: 800, fontSize: "0.92rem" }}>Períodos activos:</span>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(148, 163, 184, 0.35)",
                background: misGruposPeriodosSeleccionados.includes(MIS_GRUPOS_TODOS_KEY)
                  ? "linear-gradient(135deg, rgba(45, 212, 191, 0.20), rgba(250, 204, 21, 0.18))"
                  : "rgba(15, 23, 42, 0.28)",
                color: "#f8fafc",
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              <input
                type="checkbox"
                checked={misGruposPeriodosSeleccionados.includes(MIS_GRUPOS_TODOS_KEY)}
                onChange={() => toggleMisGruposPeriodo(MIS_GRUPOS_TODOS_KEY)}
              />
              Todos
            </label>
            {periodosDisponiblesMisGrupos.map((periodo) => {
              const checked = misGruposPeriodosSeleccionados.includes(MIS_GRUPOS_TODOS_KEY)
                || misGruposPeriodosSeleccionados.includes(periodo.id);
              return (
                <label
                  key={periodo.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "999px",
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    background: checked
                      ? "rgba(59, 130, 246, 0.18)"
                      : "rgba(15, 23, 42, 0.28)",
                    color: "#f8fafc",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMisGruposPeriodo(periodo.id)}
                  />
                  {periodo.label}
                </label>
              );
            })}
          </div>
        ) : null}

        {loadingGrupos ? (
          <p>Cargando grupos...</p>
        ) : grupos.length === 0 ? (
          <p>No hay grupos asignados para mostrar.</p>
        ) : gruposFiltradosPorPeriodo.length === 0 ? (
          <p>No hay grupos para los períodos seleccionados.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
            {gruposFiltradosPorPeriodo.map((item) => {
              const itemKey = getGrupoProfesorKey(item);
              const isSelected = getGrupoProfesorKey(selected) === itemKey;
              const tienePlantilla = !!item.EvaluacionPlantillaNombre;
              const tieneCalificaciones = Boolean(Number(item.TieneCalificacionesEvaluacion || 0));
              const puedeCambiarPlantilla = tienePlantilla && !tieneCalificaciones;
              const estadoCierreListado = String(item.CierreCursoEstado || "").toUpperCase();
              const cursoCerradoListado = Boolean(Number(item.CursoCerrado || 0)) || estadoCierreListado === "CERRADO_DOCENTE";
              const cursoCerradoTarjeta = isSelected ? (cursoGestionCerrado || cursoCerradoListado) : cursoCerradoListado;
              const paletaFondos = [
                { bg: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)", borde: "#cbd5e1" },
                { bg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", borde: "#bfdbfe" },
                { bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)", borde: "#a7f3d0" },
                { bg: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)", borde: "#fdba74" },
                { bg: "linear-gradient(135deg, #fdf4ff 0%, #f5d0fe 100%)", borde: "#e9d5ff" }
              ];
              const fondo = paletaFondos[Math.abs(Number(item.GrupoClaseId || item.AsignacionDocenteId || 0)) % paletaFondos.length];
              return (
                <button
                  key={itemKey}
                  type="button"
                  onClick={() => loadDetalle(item)}
                  disabled={loadingDetalle}
                  style={{
                    ...cardStyle,
                    textAlign: "left",
                    cursor: "pointer",
                    background: isSelected ? "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)" : fondo.bg,
                    borderColor: isSelected ? "#2563eb" : fondo.borde,
                    color: "#0f172a",
                    boxShadow: isSelected ? "0 10px 24px rgba(37, 99, 235, 0.22)" : "0 4px 12px rgba(15, 23, 42, 0.10)",
                    transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                    transform: isSelected ? "translateY(-1px)" : "none"
                  }}
                >
                  <strong>{item.GrupoNombre}</strong>
                  {item.SeccionesOrigen ? <span>Secciones: {item.SeccionesOrigen}</span> : null}
                  <span>{item.MateriaCodigo ? `${item.MateriaCodigo} - ` : ""}{item.MateriaNombre}</span>
                  <span style={{ opacity: 0.75 }}>{item.AnioNombre} / {item.PeriodoNombre}</span>
                  {Boolean(Number(item.SinHorario || 0)) ? (
                    <span style={{ display: "inline-flex", width: "fit-content", padding: "5px 9px", borderRadius: "999px", background: "#fffbeb", border: "1px solid #f59e0b", color: "#92400e", fontWeight: 900 }}>
                      Sin horario
                    </span>
                  ) : null}
                  {cursoCerradoTarjeta ? (
                    <span style={{ display: "inline-flex", width: "fit-content", padding: "5px 9px", borderRadius: "999px", background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", fontWeight: 900 }}>
                      Curso Cerrado
                    </span>
                  ) : null}
                  {!tienePlantilla ? (
                    <span style={{ color: "#b91c1c", fontWeight: 700 }}>Sin plantilla activa</span>
                  ) : puedeCambiarPlantilla && !cursoCerradoTarjeta ? (
                    <span style={{ color: "#166534", fontWeight: 700 }}>
                      Plantilla de evaluacion:{" "}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={async (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          await loadDetalle(item);
                          await loadPlantillasAsignables(item);
                          setActivePanel("seguimiento");
                          setMostrarSelectorCambioPlantilla(true);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          await loadDetalle(item);
                          await loadPlantillasAsignables(item);
                          setActivePanel("seguimiento");
                          setMostrarSelectorCambioPlantilla(true);
                        }}
                        style={{ color: "#166534", textDecoration: "underline", cursor: "pointer" }}
                        title="Cambiar plantilla"
                      >
                        {item.EvaluacionPlantillaNombre}
                      </span>
                    </span>
                  ) : (
                    <span style={{ opacity: 0.75 }}>
                      Plantilla de evaluacion: {item.EvaluacionPlantillaNombre}
                    </span>
                  )}
                  <span style={{ opacity: 0.75 }}>Estudiantes: {item.TotalEstudiantes || 0}</span>
                  {loadingDetalle && loadingDetalleCardId === item.AsignacionDocenteId ? (
                    <span style={{ marginTop: "6px", color: "#1d4ed8", fontWeight: 800 }}>Cargando sesión...</span>
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { void openApoyoEducativoPanel(); }}
              style={{
                ...cardStyle,
                textAlign: "left",
                cursor: "pointer",
                justifyContent: "center",
                minHeight: "148px",
                background: apoyoEducativoVisible ? "linear-gradient(135deg, #ecfeff 0%, #f8fafc 100%)" : "#ffffff",
                border: apoyoEducativoVisible ? "2px solid #2dd4bf" : "2px solid #cbd5e1",
                color: "#0f172a",
                boxShadow: apoyoEducativoVisible ? "0 14px 28px rgba(45, 212, 191, 0.18)" : "0 10px 24px rgba(15, 23, 42, 0.10)"
              }}
            >
              <strong style={{ fontSize: "24px", lineHeight: 1.1, color: "#0f172a" }}>Apoyo Educativo</strong>
              <span style={{ fontWeight: 700, color: "#0f766e" }}>(Adecuaciones)</span>
              <span style={{ color: "#0f766e", fontWeight: 700 }}>
                Ver estudiantes y generar apoyos
              </span>
            </button>
          </div>
        )}
      </section>

      {apoyoEducativoVisible && (
        <section
          ref={apoyoEducativoRef}
          style={{
            marginTop: "18px",
            padding: "18px",
            borderRadius: "18px",
            backgroundColor: "#071b29",
            backgroundImage: "radial-gradient(circle at top right, rgba(20,184,166,0.16), transparent 32%), linear-gradient(180deg, rgba(15,34,51,0.98), rgba(7,27,41,0.99))",
            color: "#e5eefb",
            border: "1px solid rgba(148, 163, 184, 0.28)",
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.26)",
            backdropFilter: "blur(6px)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3>Apoyo Educativo (Adecuaciones)</h3>
              <p style={{ margin: 0, opacity: 0.9, color: "#cbd5e1" }}>
                Listado consolidado de estudiantes de todas las secciones asignadas al profesor.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  resetApoyoEducativoGenerator();
                  setApoyoEducativoGeneratorOpen(true);
                  if (!apoyoEducativoSecciones.length) {
                    void loadApoyoEducativoData();
                  }
                }}
              >
                Generar Apoyo Educativo
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  resetApoyoEducativoGenerator();
                  setApoyoEducativoVisible(false);
                }}
              >
                Minimizar
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={() => { void loadApoyoEducativoData(); }}>
                {loadingApoyoEducativo ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
          </div>

          {loadingApoyoEducativo ? (
            <div style={{ marginTop: "16px", padding: "14px", borderRadius: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontWeight: 800 }}>
              Cargando información de apoyos educativos...
            </div>
          ) : (
            <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
              <div style={{ padding: "12px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.24)", background: "rgba(255,255,255,0.06)", color: "#f8fafc" }}>
                <strong style={{ display: "block", color: "#5eead4" }}>Secciones cargadas</strong>
                <span style={{ fontSize: "22px", fontWeight: 900 }}>{apoyoEducativoSeccionesUnicasTotal}</span>
              </div>
              <div style={{ padding: "12px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.24)", background: "rgba(255,255,255,0.06)", color: "#f8fafc" }}>
                <strong style={{ display: "block", color: "#5eead4" }}>Estudiantes cargados</strong>
                <span style={{ fontSize: "22px", fontWeight: 900 }}>{apoyoEducativoEstudiantesUnicos.length}</span>
              </div>
              <div style={{ padding: "12px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.24)", background: "rgba(255,255,255,0.06)", color: "#f8fafc" }}>
                <strong style={{ display: "block", color: "#5eead4" }}>Apoyos cargados</strong>
                <span style={{ fontSize: "22px", fontWeight: 900 }}>{apoyoEducativoCatalogo.length}</span>
              </div>
              {!apoyoEducativoSecciones.length && !apoyoEducativoEstudiantesUnicos.length ? (
                <div style={{ gridColumn: "1 / -1", padding: "12px", borderRadius: "14px", border: "1px solid #fdba74", background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>
                  No llegaron datos de apoyo educativo para este docente.
                </div>
              ) : null}
            </div>
          )}

          {apoyoEducativoGeneratorOpen && (
            <div style={{ marginTop: "16px", display: "grid", gap: "14px", padding: "14px", borderRadius: "16px", border: "1px solid rgba(45, 212, 191, 0.55)", background: "rgba(15, 34, 51, 0.82)", color: "#e5eefb" }}>
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ color: "#0f766e" }}>1. Escogé la o las secciones</strong>
                  <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        apoyoEducativoSeccionesAgrupadas.length > 0
                        && apoyoEducativoSeccionesAgrupadas.every((item) => item.grupoIds.every((grupoId) => apoyoEducativoGrupoIdsSeleccionados.includes(grupoId)))
                      }
                      onChange={(event) => {
                        const todosLosGrupos = Array.from(new Set(apoyoEducativoSeccionesAgrupadas.flatMap((item) => item.grupoIds)));
                        setApoyoEducativoGrupoIdsSeleccionados(
                          event.target.checked ? todosLosGrupos : []
                        );
                      }}
                    />
                    Marcar todas
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                  <label>
                    Período
                    <select value={apoyoEducativoPeriodoId} onChange={(event) => {
                      setApoyoEducativoPeriodoId(event.target.value);
                      setApoyoEducativoGrupoIdsSeleccionados([]);
                      setApoyoEducativoAlumnosDisponibles([]);
                      setApoyoEducativoEstudianteIdsSeleccionados([]);
                      setApoyoEducativoPasoAlumnosConfirmado(false);
                      setApoyoEducativoCatalogoResultados([]);
                      setApoyoEducativoCatalogoIdsSeleccionados([]);
                      setApoyoEducativoListaAlumnosMinimizada(true);
                    }}>
                      <option value="">Todos los períodos</option>
                      {apoyoEducativoPeriodos.map((item) => (
                        <option key={`apoyo-periodo-${item.PeriodoId}`} value={item.PeriodoId}>{item.PeriodoNombre}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                  {apoyoEducativoSeccionesAgrupadas.map((item) => {
                    const checked = item.grupoIds.every((grupoId) => apoyoEducativoGrupoIdsSeleccionados.includes(grupoId));
                    return (
                      <label key={`apoyo-seccion-${item.key}`} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "10px 12px", borderRadius: "12px", border: checked ? "1px solid #2dd4bf" : "1px solid rgba(148, 163, 184, 0.28)", background: checked ? "rgba(45, 212, 191, 0.16)" : "rgba(255,255,255,0.06)", color: "#e5eefb", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setApoyoEducativoGrupoIdsSeleccionados((prev) => event.target.checked
                              ? Array.from(new Set([...prev, ...item.grupoIds]))
                              : prev.filter((value) => !item.grupoIds.includes(value)));
                          }}
                        />
                        <span>
                          <strong style={{ display: "block" }}>{item.GrupoNombre}</strong>
                          <span style={{ color: "#cbd5e1", fontSize: "13px" }}>{item.AnioNombre || ""} {item.PeriodoNombre ? `/ ${item.PeriodoNombre}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" className="primary-btn" onClick={handleBuscarAlumnosApoyoEducativo}>
                    Buscar estudiantes
                  </button>
                  <button type="button" style={secondaryButtonStyle} onClick={resetApoyoEducativoGenerator}>
                    Cerrar generador
                  </button>
                </div>
              </div>

              {apoyoEducativoAlumnosDisponibles.length > 0 && (
                <div ref={apoyoEducativoListaRef} style={{ display: "grid", gap: "8px", scrollMarginTop: "90px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ color: "#0f766e" }}>2. Seleccioná los estudiantes</strong>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" style={secondaryButtonStyle} onClick={() => setApoyoEducativoListaAlumnosMinimizada((prev) => !prev)}>
                        {apoyoEducativoListaAlumnosMinimizada ? "Mostrar lista" : "Minimizar lista"}
                      </button>
                      <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span>Tipo de adecuación</span>
                        <select
                          value={apoyoEducativoGeneradorTipoAdecuacion}
                          onChange={(event) => setApoyoEducativoGeneradorTipoAdecuacion(event.target.value)}
                        >
                          <option value="">Todas</option>
                          {apoyoEducativoTiposAdecuacionEstudiantes.map((item) => (
                            <option key={`apoyo-generador-adecuacion-${item}`} value={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={
                            apoyoEducativoAlumnosDisponiblesFiltrados.length > 0
                            && apoyoEducativoAlumnosDisponiblesFiltrados.every((item) =>
                              apoyoEducativoEstudianteIdsSeleccionados.includes(String(item.EstudianteId))
                            )
                          }
                          onChange={(event) => {
                            const idsVisibles = apoyoEducativoAlumnosDisponiblesFiltrados.map((item) => String(item.EstudianteId));
                            setApoyoEducativoEstudianteIdsSeleccionados((prev) => (
                              event.target.checked
                                ? Array.from(new Set([...prev, ...idsVisibles]))
                                : prev.filter((value) => !idsVisibles.includes(value))
                            ));
                          }}
                        />
                        Seleccionar todos
                      </label>
                    </div>
                  </div>
                  {apoyoEducativoListaAlumnosMinimizada ? (
                    <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px dashed rgba(148, 163, 184, 0.45)", background: "rgba(255,255,255,0.04)", color: "#cbd5e1" }}>
                      Lista minimizada. Hay {apoyoEducativoAlumnosDisponiblesFiltrados.length} estudiante(s) disponibles.
                    </div>
                  ) : (
                  <div className="table-wrap">
                    <table className="adecuacion-zebra-list">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Cédula</th>
                          <th>Nombre</th>
                          <th>Edad</th>
                          <th>Sección</th>
                          <th>Tipo de adecuación</th>
                          <th>Nivel de funcionamiento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apoyoEducativoAlumnosDisponiblesFiltrados.map((item) => (
                          <tr
                            key={`apoyo-estudiante-${item.EstudianteId}-${item.GrupoId}`}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={apoyoEducativoEstudianteIdsSeleccionados.includes(String(item.EstudianteId))}
                                onChange={(event) => {
                                  setApoyoEducativoEstudianteIdsSeleccionados((prev) => event.target.checked
                                    ? Array.from(new Set([...prev, String(item.EstudianteId)]))
                                    : prev.filter((value) => value !== String(item.EstudianteId)));
                                }}
                              />
                            </td>
                            <td>{item.Identificacion}</td>
                            <td>{item.NombreCompleto}</td>
                            <td>{item.Edad ?? "-"}</td>
                            <td>{item.Seccion}</td>
                            <td>{item.TipoAdecuacion || "-"}</td>
                            <td>{item.NivelFuncionamiento || "-"}</td>
                          </tr>
                        ))}
                        {!apoyoEducativoAlumnosDisponiblesFiltrados.length && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>No hay estudiantes para el tipo de adecuación seleccionado.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  )}
                  <div>
                    <button type="button" className="primary-btn" onClick={handleConfirmarAlumnosApoyoEducativo}>
                      Aceptar estudiantes
                    </button>
                  </div>
                </div>
              )}

              {apoyoEducativoPasoAlumnosConfirmado && (
                <div style={{ display: "grid", gap: "10px" }}>
                  <strong style={{ color: "#0f766e" }}>3. Filtrá los apoyos educativos</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                    <label>
                      Adecuación
                      <select value={apoyoEducativoFiltroAdecuacion} onChange={(event) => setApoyoEducativoFiltroAdecuacion(event.target.value)}>
                        <option value="">Todas</option>
                        {apoyoEducativoOpcionesAdecuacion.map((item) => (
                          <option key={`apoyo-adecuacion-${item}`} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select value={apoyoEducativoFiltroTipo} onChange={(event) => setApoyoEducativoFiltroTipo(event.target.value)}>
                        <option value="">Todos</option>
                        {apoyoEducativoOpcionesTipo.map((item) => (
                          <option key={`apoyo-tipo-${item}`} value={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div>
                    <button type="button" className="primary-btn" onClick={handleBuscarCatalogoApoyoEducativo}>
                      Buscar apoyos
                    </button>
                  </div>
                </div>
              )}

              {apoyoEducativoCatalogoResultados.length > 0 && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ color: "#0f766e" }}>4. Seleccioná las descripciones que querés aplicar</strong>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={apoyoEducativoCatalogoResultados.length > 0 && apoyoEducativoCatalogoIdsSeleccionados.length === apoyoEducativoCatalogoResultados.length}
                        onChange={(event) => {
                          setApoyoEducativoCatalogoIdsSeleccionados(
                            event.target.checked ? apoyoEducativoCatalogoResultados.map((item) => String(item.AdecuacionCatalogoId)) : []
                          );
                        }}
                      />
                      Seleccionar todos
                    </label>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th>Adecuación</th>
                          <th>Tipo</th>
                          <th>Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apoyoEducativoCatalogoResultados.map((item) => (
                          <tr key={`catalogo-apoyo-${item.AdecuacionCatalogoId}`}>
                            <td>
                              <input
                                type="checkbox"
                                checked={apoyoEducativoCatalogoIdsSeleccionados.includes(String(item.AdecuacionCatalogoId))}
                                onChange={(event) => {
                                  setApoyoEducativoCatalogoIdsSeleccionados((prev) => event.target.checked
                                    ? Array.from(new Set([...prev, String(item.AdecuacionCatalogoId)]))
                                    : prev.filter((value) => value !== String(item.AdecuacionCatalogoId)));
                                }}
                              />
                            </td>
                            <td>{item.Adecuacion}</td>
                            <td>{item.Tipo}</td>
                            <td>{item.Descripcion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label style={{ display: "grid", gap: "6px", color: "#e5eefb", fontWeight: 700 }}>
                    Cargar plantilla Word
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) => setApoyoEducativoPlantilla(event.target.files?.[0] || null)}
                      style={{ color: "#f8fafc" }}
                    />
                    {apoyoEducativoPlantilla ? (
                      <span style={{ color: "#cbd5e1", fontSize: "13px" }}>{apoyoEducativoPlantilla.name}</span>
                    ) : null}
                  </label>
                  <div>
                    <button type="button" className="primary-btn" onClick={handleGuardarApoyoEducativo} disabled={savingApoyoEducativo}>
                      {savingApoyoEducativo ? "Generando informes..." : "Generar Informes Educativos"}
                    </button>
                    {savingApoyoEducativo || apoyoEducativoProgress > 0 ? (
                      <div style={{ marginTop: "10px", display: "grid", gap: "6px", minWidth: "280px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: "13px", fontWeight: 700 }}>
                          <span>Generando informes educativos</span>
                          <span>{apoyoEducativoProgress}%</span>
                        </div>
                        <div style={{ height: "10px", borderRadius: "999px", overflow: "hidden", background: "rgba(148, 163, 184, 0.24)", border: "1px solid rgba(148, 163, 184, 0.30)" }}>
                          <div style={{ width: `${apoyoEducativoProgress}%`, height: "100%", borderRadius: "999px", background: "linear-gradient(90deg, #2dd4bf, #facc15)", transition: "width 260ms ease" }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {!apoyoEducativoGeneratorOpen && (
            <>
              {loadingApoyoEducativo ? (
                <p style={{ marginTop: "16px" }}>Cargando apoyos educativos...</p>
              ) : (
                <div className="table-wrap" style={{ marginTop: "16px" }}>
                  <table className="adecuacion-zebra-list">
                    <thead>
                      <tr>
                        <th>Cédula</th>
                        <th>Nombre</th>
                        <th>Edad</th>
                        <th>Sección</th>
                        <th>Tipo de adecuación</th>
                        <th>Nivel de funcionamiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apoyoEducativoResumenFiltrado.map((item) => {
                        const informes = apoyoEducativoInformesPorEstudiante.get(`${item.EstudianteId}|${item.GrupoId}`) || [];
                        return (
                          <React.Fragment key={`resumen-apoyo-${item.EstudianteId}-${item.GrupoId}`}>
                            <tr
                              className="adecuacion-student-row"
                              data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                            >
                              <td>{item.Identificacion}</td>
                              <td>{item.NombreCompleto}</td>
                              <td>{item.Edad ?? "-"}</td>
                              <td>{item.Seccion}</td>
                              <td>{item.TipoAdecuacion || "-"}</td>
                              <td>{item.NivelFuncionamiento || "-"}</td>
                            </tr>
                            {informes.map((informe) => (
                              <tr
                                key={`informe-apoyo-${informe.ApoyoEducativoEstudianteId}`}
                                className="adecuacion-student-row"
                                data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                                style={{ background: "rgba(20, 184, 166, 0.08)" }}
                              >
                                <td colSpan={6} style={{ padding: "10px 14px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                    <span>
                                      Informe educativo generado: {informe.InformeGeneradoAt ? new Date(informe.InformeGeneradoAt).toLocaleDateString("es-CR") : "-"}
                                      {informe.PlantillaNombre ? ` / Plantilla: ${informe.PlantillaNombre}` : ""}
                                    </span>
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      <button
                                        type="button"
                                        style={secondaryButtonStyle}
                                        onClick={() => void handleDescargarInformeApoyoEducativo(informe.ApoyoEducativoEstudianteId, informe.InformeNombre)}
                                      >
                                        Abrir en Word
                                      </button>
                                      <button
                                        type="button"
                                        style={{ ...secondaryButtonStyle, borderColor: "#fca5a5", color: "#7f1d1d", background: "#fee2e2" }}
                                        disabled={deletingApoyoEducativoInformeId === informe.ApoyoEducativoEstudianteId}
                                        onClick={() => void handleEliminarInformeApoyoEducativo(informe.ApoyoEducativoEstudianteId)}
                                      >
                                        {deletingApoyoEducativoInformeId === informe.ApoyoEducativoEstudianteId ? "Eliminando..." : "Eliminar"}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {!apoyoEducativoResumenFiltrado.length && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "18px" }}>
                            No hay estudiantes para mostrar en apoyos educativos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section id="detalle-grupo-profesor" className="card" ref={detalleGrupoRef}>
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
            <button type="button" className="primary-btn" onClick={() => loadDetalle(selected, true)} disabled={loadingDetalle || savingNotas}>
              {loadingDetalle ? "Actualizando..." : "Actualizar"}
            </button>
          )}
        </div>

        {!selected ? (
          <p style={{ marginTop: "12px" }}>Seleccioná un grupo para ver estudiantes y estructura de evaluación.</p>
        ) : loadingDetalle ? (
          <div style={{ marginTop: "12px", padding: "12px", borderRadius: "12px", background: "#dbeafe", border: "1px solid #60a5fa", color: "#1e3a8a", fontWeight: 800 }}>
            Cargando sesión seleccionada...
          </div>
        ) : detalle ? (
          <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
            {(() => {
              const nombrePlantillaActiva = seguimientoContexto?.estructura?.PlantillaBaseNombre || eval360Estructura?.estructura?.PlantillaBaseNombre || detalle.plantilla?.Nombre || "";
              const cargandoPlantilla = loadingSeguimiento;
              if (nombrePlantillaActiva || cargandoPlantilla) return null;

              return (
                <div style={{ display: "grid", gap: "8px", padding: "10px 12px", borderRadius: "12px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412" }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <strong>Sin plantilla activa</strong>
                  <select
                    style={{ minWidth: "240px", color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px 10px", fontWeight: 700 }}
                    value={eval360PlantillaId}
                    onChange={(event) => setEval360PlantillaId(event.target.value)}
                    disabled={savingEval360 || loadingSeguimiento}
                  >
                    <option value="">{loadingEval360 ? "Cargando plantillas..." : "Seleccionar plantilla"}</option>
                    {(seguimientoContexto?.plantillas || eval360Plantillas).map((plantilla) => (
                      <option key={plantilla.EvaluacionPlantillaId} value={plantilla.EvaluacionPlantillaId}>{plantilla.Nombre}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={async () => { await crearEval360DesdePlantilla(); if (selected) { await loadSeguimientoEvaluacion(selected, { sincronizar: true }); } }}
                    disabled={!eval360PlantillaId || savingEval360 || !selected}
                  >
                    {savingEval360 ? "Asignando..." : "Asignar plantilla"}
                  </button>
                  {savingEval360 ? (
                    <div style={{ width: "260px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden", border: "1px solid #cbd5e1" }}>
                      <div style={{ width: `${savingEval360Progress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                    </div>
                  ) : null}
                  </div>
                  {message && /Plantilla asignada|Plantilla cambiada/i.test(message) ? (
                    <div style={{ fontSize: "13px", color: "#166534", fontWeight: 700 }}>
                      {message}
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {cursoGestionCerrado ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", padding: "10px 12px", borderRadius: "12px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontWeight: 900 }}>
                <span>Curso cerrado</span>
                <small style={{ color: "#7f1d1d", fontWeight: 700 }}>
                  Planeamiento e Indicadores, Evaluaciones y Tabla de Especificaciones y Exámenes quedan inactivos hasta que Dirección reabra el curso.
                </small>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                className={activePanel === "planeamientos" && !panelBloqueadoPorCierre("planeamientos") ? "primary-btn" : undefined}
                style={activePanel === "planeamientos" && !panelBloqueadoPorCierre("planeamientos") ? undefined : getGestionPanelButtonStyleCierre("planeamientos")}
                onClick={() => { setActivePanel("planeamientos"); loadPlaneamientos(selected); loadPlantillasPlaneamientoIa(); loadEval360PlantillasIaIndicadores(); }}
                disabled={panelBloqueadoPorCierre("planeamientos")}
                title={panelBloqueadoPorCierre("planeamientos") ? "Curso cerrado. Solicita a Dirección la reapertura." : undefined}
              >
                Planeamiento e Indicadores
              </button>
              <button
                type="button"
                className={activePanel === "seguimiento" && !panelBloqueadoPorCierre("seguimiento") ? "primary-btn" : undefined}
                style={activePanel === "seguimiento" && !panelBloqueadoPorCierre("seguimiento") ? undefined : getGestionPanelButtonStyleCierre("seguimiento")}
                onClick={() => { setActivePanel("seguimiento"); loadSeguimientoEvaluacion(selected); }}
                disabled={panelBloqueadoPorCierre("seguimiento")}
                title={panelBloqueadoPorCierre("seguimiento") ? "Curso cerrado. Solicita a Dirección la reapertura." : undefined}
              >
                Evaluaciones
              </button>
              <button type="button" className={activePanel === "bitacora" ? "primary-btn" : undefined} style={activePanel === "bitacora" ? undefined : getGestionPanelButtonStyle("bitacora")} onClick={() => { setActivePanel("bitacora"); loadBitacora(selected); }}>Bitácora</button>
              <button type="button" className={activePanel === "reportes" ? "primary-btn" : undefined} style={activePanel === "reportes" ? undefined : getGestionPanelButtonStyle("reportes")} onClick={() => { setActivePanel("reportes"); loadAsistencia(selected); loadSeguimientoEvaluacion(selected, { incluirAsistencia: true, incluirEnvios: true }); cargarAuditoriaEnvios(selected); cargarBoletasConductaReporte(); loadBitacora(selected); cargarCierreCurso(selected); }}>Reportes</button>
              <button type="button" className={activePanel === "notas" ? "primary-btn" : undefined} style={activePanel === "notas" ? undefined : getGestionPanelButtonStyle("notas")} onClick={() => { setActivePanel("notas"); loadAsistencia(selected); loadSeguimientoEvaluacion(selected, { incluirAsistencia: true }); }}>Registro de Notas</button>
              <button
                type="button"
                className={activePanel === "examenes_tabla" && !panelBloqueadoPorCierre("examenes_tabla") ? "primary-btn" : undefined}
                style={activePanel === "examenes_tabla" && !panelBloqueadoPorCierre("examenes_tabla") ? undefined : getGestionPanelButtonStyleCierre("examenes_tabla")}
                onClick={() => { setTablaMatrizMinimizada(true); setActivePanel("examenes_tabla"); if (selected) loadSeguimientoEvaluacion(selected); }}
                disabled={panelBloqueadoPorCierre("examenes_tabla")}
                title={panelBloqueadoPorCierre("examenes_tabla") ? "Curso cerrado. Solicita a Dirección la reapertura." : undefined}
              >
                Tabla de Especificaciones y Exámenes
              </button>
            </div>

            <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "12px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a" }}>
              <strong style={{ display: "block", marginBottom: "6px" }}>Último registro de Bitácora incluido</strong>
              {!ultimaBitacora ? (
                <span style={{ color: "#64748b" }}>No hay registros de bitácora para esta sección.</span>
              ) : (
                <div style={{ display: "grid", gap: "4px" }}>
                  <span><strong>Fecha:</strong> {String(ultimaBitacora.FechaRegistro || "").slice(0, 10)}</span>
                  <span><strong>Tema desarrollado:</strong> {ultimaBitacora.TemasDesarrollados || "-"}</span>
                  <span><strong>Observaciones:</strong> {ultimaBitacora.Observaciones || "-"}</span>
                  <span><strong>Hechos relevantes:</strong> {ultimaBitacora.HechosRelevantes || "-"}</span>
                </div>
              )}
            </div>


            {activePanel === "bitacora" && (
              <div style={{ display: "grid", gap: "14px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontWeight: 900, fontSize: "20px" }}>Bitácora</h4>
                    <p style={{ margin: 0, color: "#334155", fontWeight: 700 }}>
                      Registro diario de temas desarrollados, observaciones y hechos relevantes.
                    </p>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadBitacora(selected)} disabled={loadingBitacora || !selected}>
                    {loadingBitacora ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <strong>Temas desarrollados</strong>
                    <textarea rows={3} value={bitacoraForm.temasDesarrollados} onChange={(e) => setBitacoraForm((p) => ({ ...p, temasDesarrollados: e.target.value }))} placeholder="Detalle de temas desarrollados" style={{ border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px", color: "#0f172a" }} />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <strong>Observaciones</strong>
                    <textarea rows={3} value={bitacoraForm.observaciones} onChange={(e) => setBitacoraForm((p) => ({ ...p, observaciones: e.target.value }))} placeholder="Observaciones generales" style={{ border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px", color: "#0f172a" }} />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <strong>Hechos relevantes</strong>
                    <textarea rows={3} value={bitacoraForm.hechosRelevantes} onChange={(e) => setBitacoraForm((p) => ({ ...p, hechosRelevantes: e.target.value }))} placeholder="Hechos relevantes del día" style={{ border: "1px solid #94a3b8", borderRadius: "10px", padding: "8px", color: "#0f172a" }} />
                  </label>
                  <div style={{ color: "#475569", fontWeight: 700, fontSize: "12px" }}>Fecha de inclusión: automática del sistema.</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button type="button" className="primary-btn" onClick={guardarBitacora} disabled={savingBitacora || !selected || cursoGestionCerrado}>
                      {savingBitacora ? "Guardando..." : (editingBitacoraId !== null ? "Guardar cambios" : "Guardar bitácora")}
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={() => {
                        setBitacoraForm({ temasDesarrollados: "", observaciones: "", hechosRelevantes: "" });
                        setEditingBitacoraId(null);
                        setActivePanel("");
                      }}
                      disabled={savingBitacora}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>

                <div style={{ border: "1px solid #cbd5e1", borderRadius: "12px", overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "left" }}>Fecha</th>
                        <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "left" }}>Temas desarrollados</th>
                        <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "left" }}>Observaciones</th>
                        <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "left" }}>Hechos relevantes</th>
                        <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!bitacorasGrupo.length ? (
                        <tr><td colSpan={5} style={{ padding: "10px", textAlign: "center", color: "#64748b" }}>No hay registros de bitácora.</td></tr>
                      ) : bitacorasGrupo.map((fila) => (
                        <tr key={fila.BitacoraGrupoId}>
                          <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{String(fila.FechaRegistro || "").slice(0, 10)}</td>
                          <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{fila.TemasDesarrollados || "-"}</td>
                          <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{fila.Observaciones || "-"}</td>
                          <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{fila.HechosRelevantes || "-"}</td>
                          <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                            <button
                              type="button"
                              style={{ ...secondaryButtonStyle, padding: "5px 8px", fontSize: "12px" }}
                              disabled={savingBitacora || cursoGestionCerrado}
                              onClick={() => {
                                setEditingBitacoraId(Number(fila.BitacoraGrupoId));
                                setBitacoraForm({
                                  temasDesarrollados: fila.TemasDesarrollados || "",
                                  observaciones: fila.Observaciones || "",
                                  hechosRelevantes: fila.HechosRelevantes || ""
                                });
                                setActivePanel("bitacora");
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                          <table className="adecuacion-zebra-list" style={{ width: "100%", minWidth: `${680 + componentesTabla.length * 120}px`, borderCollapse: "collapse", color: "#0f172a", fontSize: "12px" }}>
                            <thead>
                              <tr>
                                <th rowSpan={2} style={{ ...thBase, textAlign: "left", minWidth: "150px" }}>Alumno</th>
                                {componentesTabla.map((componente) => {
                                  const palette = getComponentePalette(componente);
                                  return (
                                    <th key={`header-componente-${componente.EstructuraGrupoDetalleId}`} colSpan={2} style={{ ...thBase, background: palette.header }}>
                                      {`${componente.Nombre || componente.ComponenteCatalogoNombre || "Componente"} (${formatPercent(Number(componente.Porcentaje || 0))})`}
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
                                const rowBg = abierto ? "#eff6ff" : getTransferRowBg(Number(alumno.estudiante?.EstudianteId || 0), zebraRowBg);
                                return (
                                  <React.Fragment key={`consolidado-alumno-${alumno.key}`}>
                                    <tr
                                      className="adecuacion-student-row"
                                      data-adecuacion={getAdecuacionStyleKind(alumno.estudiante?.TipoAdecuacion || alumno.estudiante?.Adecuacion) || undefined}
                                      style={{ background: rowBg }}
                                    >
                                      <td style={{ ...tdBase, textAlign: "left", fontWeight: 900, background: rowBg }}>
                                        <div style={{ display: "grid", gap: "4px" }}>
                                          <span>{alumno.nombre}</span>
                                          {Number(alumno.estudiante?.FueTrasladado || 0) === 1 ? (
                                            <span style={{ fontSize: "10px", fontWeight: 900, color: "#92400e" }}>
                                              Alumno trasladado{String(alumno.estudiante?.GrupoNombreOrigenTraslado || "").trim()
                                                ? ` desde sección ${String(alumno.estudiante?.GrupoNombreOrigenTraslado || "").trim()}`
                                                : Number(alumno.estudiante?.GrupoIdOrigenTraslado || 0) > 0
                                                  ? ` desde sección ${alumno.estudiante?.GrupoIdOrigenTraslado}`
                                                  : ""}
                                            </span>
                                          ) : null}
                                        </div>
                                      </td>
                                      {componentesTabla.map((detalleItem) => {
                                        const componente = buscarComponenteAlumno(alumno, detalleItem);
                                        const palette = getComponentePalette(detalleItem);
                                        const keyAjuste = `${alumno.key}-${detalleItem.EstructuraGrupoDetalleId}`;
                                        const valorActual = Number(componente?.porcentajeGanado || 0);
                                        return (
                                          <React.Fragment key={`valor-${alumno.key}-${detalleItem.EstructuraGrupoDetalleId}`}>
                                            <td style={{ ...tdBase, background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), palette.cell) }}>
                                              {formatPercent(isTipoExamenSeguimiento(getTipoSeguimientoFromDetalle(detalleItem))
                                                ? Number(componente?.porcentajeEvaluado ?? 0)
                                                : Number(componente?.porcentajeComponente ?? detalleItem.Porcentaje ?? 0))}
                                            </td>
                                            <td style={{ ...tdBase, color: "#166534", fontWeight: 900, background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), palette.cell) }}>
                                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                                                <span>{formatPercent(valorActual)}</span>
                                                <button
                                                  type="button"
                                                  style={{
                                                    ...secondaryButtonStyle,
                                                    padding: "3px 7px",
                                                    fontSize: "11px",
                                                    color: (componente as any).ajustadoManual ? "#b91c1c" : (secondaryButtonStyle as any).color,
                                                    borderColor: (componente as any).ajustadoManual ? "#ef4444" : (secondaryButtonStyle as any).borderColor,
                                                    fontWeight: 800
                                                  }}
                                                  disabled={savingNotaPorcentajeKey === keyAjuste || cursoGestionCerrado}
                                                  onClick={async () => {
                                                    if (cursoGestionCerrado) {
                                                      setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para editar calificaciones.");
                                                      return;
                                                    }
                                                    const valor = Number(componente?.porcentajeComponente || detalleItem.Porcentaje || 0);
                                                    const nuevoTxt = String(window.prompt(`Nuevo % obtenido para ${alumno.nombre} en ${detalleItem.Nombre} (máximo ${valor.toFixed(2)}):`, valorActual.toFixed(2)) || "").trim();
                                                    const nuevo = Number(nuevoTxt);
                                                    if (!Number.isFinite(nuevo)) {
                                                      setErrorMessage("Valor inválido para % obtenido");
                                                      return;
                                                    }
                                                    if (nuevo < 0 || nuevo > valor) {
                                                      setErrorMessage(`El % obtenido debe estar entre 0 y ${valor.toFixed(2)}`);
                                                      return;
                                                    }
                                                    const justificacion = String(window.prompt("Justificación obligatoria del cambio:") || "").trim();
                                                    if (!justificacion) {
                                                      setErrorMessage("Debés ingresar una justificación");
                                                      return;
                                                    }
                                                    try {
                                                      setSavingNotaPorcentajeKey(keyAjuste);
                                                      setErrorMessage("");
                                                      setMessage("");
                                                      await api.put("/eval360/seguimiento/componentes/ajustar-porcentaje", {
                                                        estructuraGrupoId: Number(seguimientoContexto?.estructura?.EstructuraGrupoId || 0),
                                                        estructuraGrupoDetalleId: Number(detalleItem.EstructuraGrupoDetalleId),
                                                        estudianteId: Number(alumno.estudiante?.EstudianteId || 0),
                                                        porcentajeObtenidoComponente: nuevo,
                                                        justificacion
                                                      });
                                                      setMessage(`Calificación actualizada. Nota anterior: ${formatPercent(valorActual)} | Nueva nota: ${formatPercent(nuevo)}`);
                                                      await loadSeguimientoEvaluacion(selected);
                                                    } catch (error: any) {
                                                      console.error("Error ajustando % obtenido por rubro:", error);
                                                      setErrorMessage(error?.response?.data?.message || "No se pudo actualizar la calificación");
                                                    } finally {
                                                      setSavingNotaPorcentajeKey("");
                                                    }
                                                  }}
                                                >
                                                  {cursoGestionCerrado ? "Cerrado" : (savingNotaPorcentajeKey === keyAjuste ? "..." : ((componente as any).ajustadoManual ? "Editado" : "Editar"))}
                                                </button>
                                              </div>
                                            </td>
                                          </React.Fragment>
                                        );
                                      })}
                                      <td style={{ ...tdBase, background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), promedioCellBg) }}>{formatPercent(Number((alumno as any).totalEvaluado || 0))}</td>
                                      <td style={{ ...tdBase, color: "#166534", fontWeight: 900, background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), promedioCellBg) }}>{formatPercent(alumno.totalGanado)}</td>
                                      <td style={{ ...tdBase, background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), accionCellBg) }}>
                                        <button type="button" style={{ ...secondaryButtonStyle, padding: "5px 8px", fontSize: "12px" }} onClick={() => setNotasDetalleAbierto(abierto ? "" : alumno.key)}>
                                          {abierto ? "Ocultar" : "Ver detalle"}
                                        </button>
                                      </td>
                                    </tr>
                                    {abierto && (
                                      <tr>
                                        <td colSpan={totalColumnasDetalle} style={{ padding: "12px", background: getTransferCellBg(Number(alumno.estudiante?.EstudianteId || 0), "#f8fafc"), border: "1px solid #e2e8f0" }}>
                                          <div style={{ display: "grid", gap: "12px" }}>
                                            <strong style={{ color: "#0f172a", fontSize: "16px" }}>Detalle de calificaciones de {alumno.nombre}</strong>
                                            {alumno.componentes.map((componente) => (
                                              <div key={componente.key} style={{ border: "1px solid #cbd5e1", borderRadius: "12px", background: "#ffffff", overflow: "hidden" }}>
                                                <div style={{
                                                  display: "grid",
                                                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                                                  gap: "8px",
                                                  padding: "10px",
                                                  background: (componente as any).ajustadoManual ? "#ffedd5" : "#e2e8f0",
                                                  color: "#0f172a",
                                                  fontWeight: 900,
                                                  fontSize: "12px",
                                                  borderBottom: (componente as any).ajustadoManual ? "1px solid #fb923c" : "none"
                                                }}>
                                                  <span>{componente.nombre}</span>
                                                  <span>% comp.: {formatPercent(componente.porcentajeComponente)}</span>
                                                  <span>Porcentaje Evaluado: {formatPercent(Number((componente as any).porcentajeEvaluado ?? 0))}</span>
                                                  <span style={{ color: (componente as any).ajustadoManual ? "#c2410c" : "#166534" }}>
                                                    Ganado: {formatPercent(Number((componente as any).ajustadoManual ? ((componente as any).porcentajeGanadoOriginal ?? componente.porcentajeGanado) : componente.porcentajeGanado))}
                                                    {(componente as any).ajustadoManual ? ` | Ajustado: ${formatPercent(Number((componente as any).porcentajeGanadoAjustado || 0))}` : ""}
                                                  </span>
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
                                                          <th style={{ padding: "7px", border: "1px solid #cbd5e1", textAlign: "left" }}>{cursoGestionCerrado ? "Modo lectura" : "Editar % obtenido"}</th>
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
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", fontWeight: 800 }}>
                                                              <div style={{ display: "grid", gap: "4px" }}>
                                                                <span>{formatPercent(detalleItem.nota)}</span>
                                                                {((detalleItem as any).correoEnviado || (detalleItem as any).waEnviado) ? (
                                                                  <small style={{ fontWeight: 700, color: "#1d4ed8" }}>
                                                                    {[
                                                                      (detalleItem as any).correoEnviado ? "Correo enviado" : "",
                                                                      (detalleItem as any).waEnviado ? "WA enviado" : ""
                                                                    ].filter(Boolean).join(" / ")}
                                                                  </small>
                                                                ) : null}
                                                              </div>
                                                            </td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0", fontWeight: 900, color: "#166534" }}>{formatPercent(detalleItem.porcentaje)}</td>
                                                            <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}>
                                                              {Number((detalleItem as any).notaActividadId || 0) > 0 ? (
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                  {Number((detalleItem as any).fueEditado || 0) === 1 ? (
                                                                    <span style={{ color: "#b91c1c", fontWeight: 800, fontSize: "12px" }}>Editado</span>
                                                                  ) : null}
                                                                  <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={100}
                                                                    step="0.01"
                                                                    disabled={cursoGestionCerrado}
                                                                    style={{
                                                                      ...inputNotaStyle,
                                                                      minWidth: "86px",
                                                                      width: "86px",
                                                                      padding: "4px 6px",
                                                                      fontSize: "12px",
                                                                      background: cursoGestionCerrado ? "#e2e8f0" : inputNotaStyle.background,
                                                                      color: cursoGestionCerrado ? "#64748b" : inputNotaStyle.color,
                                                                      cursor: cursoGestionCerrado ? "not-allowed" : "text"
                                                                    }}
                                                                    value={
                                                                      notaPorcentajeDrafts[getSeguimientoActividadKey(Number((detalleItem as any).actividadId || 0), Number(alumno.estudiante?.EstudianteId || 0))]
                                                                      ?? String(Number((detalleItem as any).porcentajeObtenido || detalleItem.nota || 0).toFixed(2))
                                                                    }
                                                                    onChange={(e) => {
                                                                      const k = getSeguimientoActividadKey(Number((detalleItem as any).actividadId || 0), Number(alumno.estudiante?.EstudianteId || 0));
                                                                      setNotaPorcentajeDrafts((prev) => ({ ...prev, [k]: e.target.value }));
                                                                    }}
                                                                  />
                                                                  <button
                                                                    type="button"
                                                                    style={{
                                                                      ...secondaryButtonStyle,
                                                                      padding: "4px 8px",
                                                                      fontSize: "12px",
                                                                      color: Number((detalleItem as any).fueEditado || 0) === 1 ? "#b91c1c" : (secondaryButtonStyle as any).color,
                                                                      borderColor: Number((detalleItem as any).fueEditado || 0) === 1 ? "#ef4444" : (secondaryButtonStyle as any).borderColor,
                                                                      fontWeight: 800
                                                                    }}
                                                                    disabled={savingNotaPorcentajeKey === getSeguimientoActividadKey(Number((detalleItem as any).actividadId || 0), Number(alumno.estudiante?.EstudianteId || 0)) || cursoGestionCerrado}
                                                                    onClick={() => {
                                                                      if (cursoGestionCerrado) {
                                                                        setErrorMessage("El curso esta cerrado. Solicita a Direccion la reapertura para editar calificaciones.");
                                                                        return;
                                                                      }
                                                                      guardarEdicionPorcentajeNota({
                                                                        notaActividadId: Number((detalleItem as any).notaActividadId),
                                                                        actividadId: Number((detalleItem as any).actividadId),
                                                                        estudianteId: Number(alumno.estudiante?.EstudianteId || 0),
                                                                        porcentajeActual: Number((detalleItem as any).porcentajeObtenido || detalleItem.nota || 0)
                                                                      });
                                                                    }}
                                                                  >
                                                                    {savingNotaPorcentajeKey === getSeguimientoActividadKey(Number((detalleItem as any).actividadId || 0), Number(alumno.estudiante?.EstudianteId || 0))
                                                                      ? "Guardando..."
                                                                      : (cursoGestionCerrado ? "Cerrado" : (Number((detalleItem as any).fueEditado || 0) === 1 ? "Editado" : "Guardar"))}
                                                                  </button>
                                                                </div>
                                                              ) : (
                                                                <span style={{ color: "#64748b", fontWeight: 700 }}>No aplica</span>
                                                              )}
                                                            </td>
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
                  <button type="button" style={secondaryButtonStyle} onClick={() => loadMiHorario(selected || grupoHorarioPredeterminado)} disabled={loadingHorario}>
                    {loadingHorario ? "Actualizando..." : "Actualizar horario"}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "10px"
                  }}
                >
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 800 }}>Grupos del período</div>
                    <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalAsignacionesPeriodo}</strong>
                  </div>
                  <div style={{ background: "#ecfdf3", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#166534", fontWeight: 800 }}>Lecciones programadas</div>
                    <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalLeccionesProgramadas}</strong>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#334155", fontWeight: 800 }}>Materias con horario</div>
                    <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalMateriasConHorario}</strong>
                  </div>
                  <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#c2410c", fontWeight: 800 }}>Pendientes de horario</div>
                    <strong style={{ color: "#0f172a", fontSize: "22px" }}>{horarioResumen.totalPendientes}</strong>
                  </div>
                </div>

                {loadingHorario ? (
                  <p style={{ color: "#0f172a", fontWeight: 700 }}>Cargando horario...</p>
                ) : horarioBloques.length === 0 ? (
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontWeight: 800 }}>
                    No hay bloques de horario configurados para la institución.
                  </div>
                ) : (
                  <>
                    {horarioResumen.totalAsignacionesPeriodo > 0 && horarioResumen.totalLeccionesProgramadas === 0 && (
                      <div style={{ padding: "14px", borderRadius: "14px", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>
                        <strong style={{ display: "block", marginBottom: "6px" }}>Tus grupos están asignados, pero aún no tienen horario configurado.</strong>
                        <span style={{ display: "block", marginBottom: horarioPendientes.length ? "10px" : 0 }}>
                          Mientras no exista `Horario de clases` para estas materias por grupo, el calendario semanal aparecerá libre.
                        </span>
                        {horarioPendientes.length > 0 && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {horarioPendientes.slice(0, 12).map((item) => (
                              <span
                                key={`panel-pendiente-horario-${item.AsignacionDocenteId}`}
                                style={{
                                  border: "1px solid #fdba74",
                                  background: "#ffffff",
                                  color: "#9a3412",
                                  borderRadius: "999px",
                                  padding: "6px 10px",
                                  fontWeight: 800,
                                  fontSize: "13px"
                                }}
                              >
                                {item.GrupoNombre} - {item.MateriaNombre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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

                {loadingSeguimiento ? (
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontWeight: 800 }}>
                    Cargando seguimiento diario...
                  </div>
                ) : debeMostrarSelectorPlantillaSeguimiento ? (
                  <div style={{ display: "grid", gap: "12px", padding: "14px", background: "white", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
                    <strong>{mostrarSelectorCambioPlantilla ? "Cambiar plantilla de evaluación" : "Primera vez en este grupo"}</strong>
                    <span style={{ color: "#475569" }}>
                      {mostrarSelectorCambioPlantilla
                        ? "Seleccioná la nueva plantilla que se va a usar en esta sección."
                        : "Seleccioná la plantilla de parametrización de evaluación que se va a usar para esta sección. Esta asignación queda guardada para el grupo, materia, año y periodo seleccionados."}
                    </span>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={{ color: "#0f172a", fontWeight: 700 }}>Plantilla</span>
                      <select style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }} value={eval360PlantillaId} onChange={(event) => setEval360PlantillaId(event.target.value)} disabled={savingEval360 || loadingSeguimiento}>
                        <option value="">Seleccionar plantilla</option>
                        {(seguimientoContexto?.plantillas || eval360Plantillas).map((plantilla) => (
                          <option key={plantilla.EvaluacionPlantillaId} value={plantilla.EvaluacionPlantillaId}>{plantilla.Nombre}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="primary-btn" onClick={async () => { await crearEval360DesdePlantilla(); setMostrarSelectorCambioPlantilla(false); await loadSeguimientoEvaluacion(selected, { sincronizar: true }); }} disabled={!eval360PlantillaId || savingEval360 || !selected}>
                      {savingEval360 ? (mostrarSelectorCambioPlantilla ? "Cambiando..." : "Asignando...") : (mostrarSelectorCambioPlantilla ? "Cambiar plantilla" : "Asignar plantilla")}
                    </button>
                    {savingEval360 ? (
                      <div style={{ width: "320px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155", marginTop: "8px" }}>
                        <div style={{ width: `${savingEval360Progress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                      </div>
                    ) : null}
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
                      <label style={{
                        display: "grid",
                        gap: "8px",
                        padding: "14px",
                        borderRadius: "16px",
                        background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
                        border: "2px solid #fb923c",
                        borderTop: "6px solid #ea580c",
                        boxShadow: "0 12px 28px rgba(249, 115, 22, 0.20)",
                        position: "relative"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "999px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#ea580c",
                            color: "#ffffff",
                            fontSize: "18px",
                            fontWeight: 900,
                            boxShadow: "0 6px 14px rgba(234, 88, 12, 0.28)"
                          }}>★</span>
                          <span style={{ color: "#9a3412", fontWeight: 900, fontSize: "18px", letterSpacing: "0.3px", textTransform: "uppercase" }}>Rubro a Calificar</span>
                        </div>
                        <small style={{ color: "#7c2d12", fontWeight: 700, fontSize: "13px" }}>Elegí aquí el rubro que vas a trabajar en seguimiento diario.</small>
                        <select style={{
                          color: "#0f172a",
                          background: "#ffffff",
                          border: "2px solid #f97316",
                          borderRadius: "12px",
                          padding: "12px 14px",
                          fontSize: "16px",
                          fontWeight: 800,
                          boxShadow: "0 0 0 3px rgba(249, 115, 22, 0.14)",
                          minHeight: "48px"
                        }} value={seguimientoTipo} onChange={(event) => { setSeguimientoTipo(event.target.value); setSeguimientoIndicadorId(""); }}>
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

                    <div style={{ display: "grid", gap: "8px", padding: "12px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "12px" }}>
                      <strong style={{ color: "#9a3412" }}>Paso a paso para evaluar este rubro</strong>
                      <ol style={{ margin: 0, paddingLeft: "18px", color: "#7c2d12", fontWeight: 600 }}>
                        {seguimientoPasosEvaluacion.map((paso, index) => (
                          <li key={`paso-seg-${index}`} style={{ marginBottom: "4px" }}>{paso}</li>
                        ))}
                      </ol>
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
                                asistenciaPrimeraSeleccionRegistradaRef.current.clear();
                                setSavedAsistencia(false);
                                setAsistenciaNotificaciones({});
                              }}
                              style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px", fontWeight: 800 }}
                            />
                          </label>
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
                              <table className="gestion-asistencia-list adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
                                <thead>
                                  <tr style={{ background: "#cbd5e1", color: "#0f172a" }}>
                                    <th style={{ minWidth: "230px", padding: "10px", textAlign: "left" }}>Alumno</th>
                                    <th style={{ minWidth: "170px", padding: "10px", textAlign: "left" }}>Lección</th>
                                    {(["PRESENTE", "AUSENTE_JUSTIFICADA", "AUSENTE_INJUSTIFICADA", "TARDIA_MENOR_10", "TARDIA_MAYOR_10"] as EstadoAsistencia[]).map((estado) => (
                                      <th key={estado} style={{ padding: "10px", textAlign: "center" }}>{estadoAsistenciaLabel(estado)}</th>
                                    ))}
                                    <th style={{ minWidth: "120px", padding: "10px" }} title="Minutos de tardía (solo cuando corresponde)">Minutos tarde</th>
                                    <th style={{ minWidth: "120px", padding: "10px" }} title="Marcar para notificar al encargado del estudiante">Informar al encargado</th>
                                    <th style={{ minWidth: "160px", padding: "10px" }}>Estado envío</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(detalle?.estudiantes || seguimientoContexto.estudiantes || []).flatMap((estudiante, estudianteIndex) =>
                                    asistenciaLecciones.map((leccion, leccionIndex) => {
                                      const key = asistenciaDraftKey(estudiante.EstudianteId, leccion.HorarioGrupoId);
                                      const draft = asistenciaDrafts[key] || { estado: "PRESENTE" as EstadoAsistencia, minutosTardia: "", observacion: "", notificarEncargado: false };
                                      const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                      const adecuacionKind = getAdecuacionStyleKind(estudiante.TipoAdecuacion || estudiante.Adecuacion);
                                      const suspendido = isEstudianteSuspendido(estudiante);
                                      const suspensionTooltip = getSuspensionTooltip(estudiante);
                                      return (
                                        <tr
                                          key={`seg-asis-${estudiante.EstudianteId}-${leccion.HorarioGrupoId}`}
                                          className="adecuacion-student-row"
                                          data-adecuacion={adecuacionKind || undefined}
                                          title={suspensionTooltip || undefined}
                                          style={{ background: getGestionRowBg(estudiante, zebraBg) }}
                                        >
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
                                            {leccionIndex === 0 ? (
                                              <>
                                                {getFullName(estudiante)}
                                                {suspendido ? <div style={{ color: "#be123c", fontWeight: 900, fontSize: "12px" }}>Alumno Suspendido</div> : null}
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
                                                  disabled={cursoGestionCerrado || suspendido}
                                                  onClick={() => {
                                                    if (draft.estado === estado) registrarPrimeraSeleccionAsistencia(estudiante.EstudianteId);
                                                  }}
                                                  onChange={() => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "estado", estado, { aplicarReglaPrimeraSeleccion: true })}
                                                  style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                                />
                                              </td>
                                            ))}
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <input type="number" min="0" title={suspensionTooltip || "Minutos de tardía"} aria-label="Minutos de tardía" value={draft.minutosTardia} disabled={cursoGestionCerrado || suspendido} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "minutosTardia", e.target.value)} style={{ width: "110px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px", background: suspendido ? "#f1f5f9" : "#ffffff" }} />
                                          </td>
                                          <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                            <input
                                              type="checkbox"
                                              title={getAsistenciaEncargadoTooltip({
                                                estudiante,
                                                leccion,
                                                draft,
                                                fecha: asistenciaFecha,
                                                materia: selected?.MateriaNombre
                                              })}
                                              aria-label="Informar al encargado"
                                              checked={Boolean(draft.notificarEncargado)}
                                              disabled={cursoGestionCerrado || suspendido}
                                              onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, leccion.HorarioGrupoId, "notificarEncargado", e.target.checked)}
                                              style={{ accentColor: "#2563eb", width: "18px", height: "18px" }}
                                            />
                                          </td>
                                          <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", color: "#166534", fontWeight: 700, fontSize: "12px" }}>
                                            {(() => {
                                              const estadoNotif = asistenciaNotificaciones[key];
                                              if (!estadoNotif) return "";
                                              const etiquetas: string[] = [];
                                              if (estadoNotif.correoEnviado) etiquetas.push("Correo enviado");
                                              if (estadoNotif.waEnviado) etiquetas.push("WA enviado");
                                              return etiquetas.join(" / ");
                                            })()}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ display: "grid", gap: "8px", justifyItems: "start", marginTop: "6px" }}>
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={handleSaveAsistencia}
                                disabled={savingAsistencia || loadingAsistencia || !detalle?.estudiantes?.length || cursoGestionCerrado}
                                style={savedAsistencia ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff" } : undefined}
                              >
                                {savingAsistencia ? "Guardando..." : (savedAsistencia ? "Guardado" : (asistenciaYaCalificada ? "Asistencia calificada" : "Guardar asistencia"))}
                              </button>
                              {savingAsistencia ? (
                                <div style={{ width: "280px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                                  <div style={{ width: `${savingAsistenciaProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : seguimientoModoActividadDirecta ? (
                      <div style={{ display: "grid", gap: "12px" }}>
                        <label style={{
                          display: "grid",
                          gap: "8px",
                          padding: "12px",
                          borderRadius: "14px",
                          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                          border: "2px solid #60a5fa",
                          boxShadow: "0 10px 24px rgba(37, 99, 235, 0.16)"
                        }}>
                          <span style={{ color: "#1d4ed8", fontWeight: 900, fontSize: "18px", letterSpacing: "0.2px" }}>Actividad evaluativa</span>
                          <small style={{ color: "#1e3a8a", fontWeight: 700 }}>Seleccioná aquí la actividad que vas a calificar.</small>
                          <select style={{ color: "#0f172a", background: "#ffffff", border: "2px solid #2563eb", borderRadius: "12px", padding: "12px 14px", fontSize: "16px", fontWeight: 800, boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)" }} value={seguimientoActividadSeleccionada?.ActividadId ? String(seguimientoActividadSeleccionada.ActividadId) : ""} onChange={(event) => setSeguimientoActividadId(event.target.value)}>
                            {seguimientoActividadesFiltradas.length === 0 ? <option value="">No hay actividades configuradas para este componente</option> : null}
                            {seguimientoActividadesFiltradas.map((actividad) => {
                              const puntos = Math.round(Number(actividad.PuntosMaximos || 0));
                              const pe = Math.round(Number(actividad.PorcentajeDentroRubro || 0));
                              const actividadLabel = getSeguimientoActividadLabel(actividad);
                              const labelExamen = `${actividadLabel} - ${puntos}pts - ${pe}%`;
                              return (
                                <option key={actividad.ActividadId} value={actividad.ActividadId}>
                                  {isTipoExamenSeguimiento(seguimientoTipo) ? labelExamen : `${actividadLabel} - ${Number(actividad.PuntosMaximos || 0).toFixed(2)} pts`}
                                </option>
                              );
                            })}
                          </select>
                        </label>

                        {seguimientoActividadSeleccionada ? (
                          <div style={{ display: "grid", gap: "12px" }}>
                            {(() => {
                              const puntosDraft = Number(String(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)).replace(",", "."));
                              const minimo = getMinimoPuntosPorPorcentajeActividad(seguimientoActividadSeleccionada);
                              const invalido = Number.isFinite(puntosDraft) && minimo > 0 && puntosDraft < minimo;
                              return (
                            <div style={{ display: "grid", gap: "8px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", padding: "12px", background: "white", border: invalido ? "2px solid #ef4444" : "1px solid #e2e8f0", borderRadius: "14px" }}>
                              <div>
                                <strong>{getSeguimientoActividadLabel(seguimientoActividadSeleccionada)}</strong>
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
                                  style={{
                                    color: invalido ? "#b91c1c" : "#0f172a",
                                    border: invalido ? "2px solid #ef4444" : "1px solid #94a3b8",
                                    borderRadius: "8px",
                                    padding: "8px",
                                    background: invalido ? "#fef2f2" : "#ffffff",
                                    fontWeight: invalido ? 700 : 500
                                  }}
                                />
                                {invalido ? (
                                  <small style={{ color: "#b91c1c", fontWeight: 700 }}>
                                    Debe ser igual o mayor a {minimo.toFixed(2)}.
                                  </small>
                                ) : null}
                                <small style={{ color: "#475569", fontWeight: 700 }}>
                                  Validando examen: {getSeguimientoActividadLabel(seguimientoActividadSeleccionada)} (mínimo: {minimo.toFixed(2)})
                                </small>
                              </label>
                            </div>
                            {invalido ? (
                              <div style={{ color: "#b91c1c", fontWeight: 800, background: "#fef2f2", border: "1px solid #ef4444", borderRadius: "10px", padding: "8px 10px" }}>
                                No podés guardar: "Puntos que vale" ({Number.isFinite(puntosDraft) ? puntosDraft.toFixed(2) : "0.00"}) es menor al porcentaje de la prueba ({minimo.toFixed(2)}).
                              </div>
                            ) : null}
                            </div>
                              );
                            })()}
                            <div style={{ overflowX: "auto", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "14px" }}>
                              <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
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
                                    const valorPuntos = String(draft.puntosObtenidos || "").trim() === "" ? NaN : Number(draft.puntosObtenidos);
                                    const filaConError = Number.isFinite(valorPuntos) && Number.isFinite(puntosMaximosActividad) && valorPuntos > puntosMaximosActividad;
                                    const nota = calcularNotaExamen(draft.puntosObtenidos, puntosMaximosActividad);
                                    const porcentajeGanado = calcularPorcentajeGanadoExamen(nota, seguimientoActividadSeleccionada, seguimientoDetalleSeleccionado);
                                    const zebraBg = estudianteIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
                                    const suspendido = isEstudianteSuspendido(estudiante);
                                    const suspensionTooltip = getSuspensionTooltip(estudiante);
                                    return (
                                      <tr
                                        key={`exam-${estudiante.EstudianteId}`}
                                        className="adecuacion-student-row"
                                        data-adecuacion={getAdecuacionStyleKind(estudiante.TipoAdecuacion || estudiante.Adecuacion) || undefined}
                                        title={suspensionTooltip || undefined}
                                        style={{
                                          background: suspendido ? SUSPENSION_ROW_BG : (filaConError ? "#fef2f2" : zebraBg),
                                          boxShadow: filaConError ? "inset 0 0 0 2px #ef4444" : "none"
                                        }}
                                      >
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
                                          {getFullName(estudiante)}
                                          {suspendido ? <div style={{ color: "#be123c", fontWeight: 900, fontSize: "12px" }}>Alumno Suspendido</div> : null}
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>{estudiante.Identificacion}</div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            Correo: {getCorreoHabilitadoEstudiante(estudiante) || "No definido"}
                                          </div>
                                          <div style={{ color: "#475569", fontWeight: 500, fontSize: "12px" }}>
                                            WA: {getTelefonoWhatsAppHabilitado(estudiante) || "No habilitado"}
                                          </div>
                                        </td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                          {(() => {
                                            const excedido = filaConError;
                                            return (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={draft.puntosObtenidos}
                                            disabled={cursoGestionCerrado || suspendido}
                                            title={suspensionTooltip || undefined}
                                            onChange={(e) => {
                                              const limpio = String(e.target.value || "").replace(/\D+/g, "");
                                              if (limpio === "") {
                                                updateSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { puntosObtenidos: "" });
                                                return;
                                              }
                                              updateSeguimientoExamenDraft(
                                                seguimientoActividadSeleccionada.ActividadId,
                                                estudiante.EstudianteId,
                                                { puntosObtenidos: String(limpio) }
                                              );
                                            }}
                                            style={{
                                              width: "130px",
                                              color: excedido ? "#b91c1c" : "#0f172a",
                                              border: excedido ? "2px solid #ef4444" : "1px solid #94a3b8",
                                              background: suspendido ? "#f1f5f9" : (excedido ? "#fef2f2" : "#ffffff"),
                                              borderRadius: "8px",
                                              padding: "7px",
                                              fontWeight: excedido ? 700 : 500,
                                              cursor: suspendido ? "not-allowed" : "text"
                                            }}
                                          />
                                            );
                                          })()}
                                        </td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0" }}>{Number(puntosMaximosActividad || 0).toFixed(2)}</td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{nota.toFixed(2)}</td>
                                        <td style={{ textAlign: "center", padding: "10px", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{porcentajeGanado.toFixed(2)}%</td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}><input value={draft.observacion} disabled={cursoGestionCerrado || suspendido} title={suspensionTooltip || undefined} onChange={(e) => updateSeguimientoExamenDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { observacion: e.target.value })} placeholder="Observación" style={{ minWidth: "220px", color: "#0f172a", border: "1px solid #94a3b8", borderRadius: "8px", padding: "7px", background: suspendido ? "#f1f5f9" : "#ffffff", cursor: suspendido ? "not-allowed" : "text" }} /></td>
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
                                          <label title="Informar al encargado" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "1px solid #94a3b8", borderRadius: "8px", background: aviso.informar ? "#dbeafe" : "#ffffff" }}>
                                            <input type="checkbox" checked={aviso.informar} disabled={cursoGestionCerrado || suspendido} onChange={(event) => updateSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { informar: event.target.checked })} style={{ accentColor: "#2563eb", width: "18px", height: "18px" }} />
                                          </label>
                                          {aviso.informar ? (
                                            <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                              <span style={{ color: "#475569", fontSize: "12px", fontWeight: 700 }}>Mensaje que se enviará</span>
                                              <textarea value={aviso.observacion} disabled={cursoGestionCerrado || suspendido} onChange={(event) => updateSeguimientoActividadInformarDraft(seguimientoActividadSeleccionada.ActividadId, estudiante.EstudianteId, { observacion: event.target.value, mensajeEditado: true })} placeholder="Mensaje para el encargado" rows={5} style={{ width: "100%", minWidth: "320px", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: suspendido ? "#f1f5f9" : "#ffffff", lineHeight: 1.4 }} />
                                            </div>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div style={{ display: "grid", gap: "8px", justifyItems: "start", marginTop: "6px" }}>
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={guardarSeguimientoActividad}
                                disabled={
                                  savingSeguimiento
                                  || !seguimientoActividadSeleccionada
                                  || toNumeroComparacion(getSeguimientoActividadPuntosMaximos(seguimientoActividadSeleccionada)) <= 0
                                  || cursoGestionCerrado
                                }
                                style={savedSeguimientoModo === "actividad" ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff" } : undefined}
                              >
                                {savingSeguimiento && savingSeguimientoModo === "actividad" ? "Guardando..." : (savedSeguimientoModo === "actividad" ? "Guardado" : "Guardar Calificaciones")}
                              </button>
                              <span style={{ color: "#b45309", fontWeight: 700 }}>
                                {getPendientesCalificarActividad(Number(seguimientoActividadSeleccionada.ActividadId || 0))} registros pendientes de calificar
                              </span>
                              {savingSeguimiento && savingSeguimientoModo === "actividad" ? (
                                <div style={{ width: "280px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                                  <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                                </div>
                              ) : null}
                            </div>
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
                        {mostrarSelectorActividadIndicador ? (
                          <label style={{
                            display: "grid",
                            gap: "8px",
                            padding: "12px",
                            borderRadius: "14px",
                            background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                            border: "2px solid #60a5fa",
                            boxShadow: "0 10px 24px rgba(37, 99, 235, 0.16)"
                          }}>
                            <span style={{ color: "#1d4ed8", fontWeight: 900, fontSize: "18px", letterSpacing: "0.2px" }}>Actividad evaluativa</span>
                            <small style={{ color: "#1e3a8a", fontWeight: 700 }}>Elegí la tarea o actividad de cotidiano que vas a trabajar.</small>
                            <select style={{ color: "#0f172a", background: "#ffffff", border: "2px solid #2563eb", borderRadius: "12px", padding: "12px 14px", fontSize: "16px", fontWeight: 800, boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)" }} value={seguimientoActividadSeleccionada?.ActividadId ? String(seguimientoActividadSeleccionada.ActividadId) : ""} onChange={(event) => setSeguimientoActividadId(event.target.value)}>
                              {seguimientoActividadesFiltradas.length === 0 ? <option value="">No hay actividades configuradas para este componente</option> : null}
                              {seguimientoActividadesFiltradas.map((actividad) => (
                                <option key={actividad.ActividadId} value={actividad.ActividadId}>
                                  {getSeguimientoActividadLabel(actividad)} - {Number(actividad.PorcentajeDentroRubro || 0).toFixed(2)}%
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
                              <button type="button" style={{ ...secondaryButtonStyle, background: "#fef3c7", borderColor: "#f59e0b", color: "#92400e", fontWeight: 800 }} onClick={() => setSeguimientoMatrizAsignacionMinimizada(true)}>
                                Minimizar
                              </button>
                              <button type="button" style={{ ...secondaryButtonStyle, background: "#dcfce7", borderColor: "#22c55e", color: "#166534", fontWeight: 800 }} onClick={() => setSeguimientoMatrizAsignacionMinimizada(false)}>
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
                                  <th key={`head-act-${actividad.ActividadId}`} style={{ padding: "8px", textAlign: "center", minWidth: "110px" }}>{getSeguimientoActividadLabel(actividad)}</th>
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
                          <div style={{ display: "grid", gap: "8px", justifyItems: "start" }}>
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={guardarAsignacionIndicadoresActividad}
                              disabled={savingSeguimiento || !seguimientoActividadSeleccionada}
                              style={savedSeguimientoModo === "asignacion" ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff" } : undefined}
                            >
                              {savingSeguimiento && savingSeguimientoModo === "asignacion" ? "Guardando..." : (savedSeguimientoModo === "asignacion" ? "Guardado" : "Guardar asignación de indicadores")}
                            </button>
                            {savingSeguimiento && savingSeguimientoModo === "asignacion" ? (
                              <div style={{ width: "280px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                                <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                              </div>
                            ) : null}
                          </div>
                        </div>
                        ) : null}

                        <label style={{
                          display: "grid",
                          gap: "8px",
                          padding: "12px",
                          borderRadius: "14px",
                          background: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
                          border: "2px solid #22d3ee",
                          boxShadow: "0 10px 24px rgba(6, 182, 212, 0.16)"
                        }}>
                          <span style={{ color: "#0f766e", fontWeight: 900, fontSize: "18px", letterSpacing: "0.2px" }}>Indicador del planeamiento</span>
                          <small style={{ color: "#155e75", fontWeight: 700 }}>Seleccioná aquí el indicador exacto que vas a evaluar en cotidiano o tareas.</small>
                          <select
                            style={{
                              color: "#0f172a",
                              background: (seguimientoIndicadoresFiltrados.length === 0 && (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA"))) ? "#fef2f2" : "#ffffff",
                              border: (seguimientoIndicadoresFiltrados.length === 0 && (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA"))) ? "2px solid #ef4444" : "2px solid #0891b2",
                              borderRadius: "12px",
                              padding: "12px 14px",
                              fontSize: "16px",
                              fontWeight: (seguimientoIndicadoresFiltrados.length === 0 && (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA"))) ? 800 : 800,
                              boxShadow: (seguimientoIndicadoresFiltrados.length === 0 && (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA")))
                                ? "0 0 0 3px rgba(239, 68, 68, 0.12)"
                                : "0 0 0 3px rgba(8, 145, 178, 0.12)"
                            }}
                            value={seguimientoIndicadorSeleccionado?.IndicadorGrupoId ? String(seguimientoIndicadorSeleccionado.IndicadorGrupoId) : ""}
                            onChange={(event) => setSeguimientoIndicadorId(event.target.value)}
                          >
                            {seguimientoIndicadoresFiltrados.length === 0 ? (
                              <option value="">
                                {(normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA"))
                                  ? (seguimientoFaltanAsignacionesActividad
                                    ? "Hay indicadores del rubro, pero faltan asignarlos a esta actividad. Hacelo en este panel, sección 'Asignar indicadores a actividades'."
                                    : "No hay indicadores asignados. Agregalos en Planeamiento e Indicadores.")
                                  : "No hay indicadores para este filtro"}
                              </option>
                            ) : null}
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
                              <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#ffffff", fontSize: "14px" }}>
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
                                    const suspendido = isEstudianteSuspendido(estudiante);
                                    const suspensionTooltip = getSuspensionTooltip(estudiante);
                                    return (
                                      <tr
                                        key={estudiante.EstudianteId}
                                        className="adecuacion-student-row"
                                        data-adecuacion={getAdecuacionStyleKind(estudiante.TipoAdecuacion || estudiante.Adecuacion) || undefined}
                                        title={suspensionTooltip || undefined}
                                        style={{ background: getGestionRowBg(estudiante, zebraBg) }}
                                      >
                                        <td style={{ padding: "10px", borderBottom: "1px solid #e2e8f0", color: "#0f172a", fontWeight: 700 }}>
                                          {getFullName(estudiante)}
                                          {suspendido ? <div style={{ color: "#be123c", fontWeight: 900, fontSize: "12px" }}>Alumno Suspendido</div> : null}
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
                                              disabled={cursoGestionCerrado || suspendido}
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
                                                disabled={cursoGestionCerrado || suspendido}
                                                onChange={(event) => updateSeguimientoRecuperacionDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { activa: event.target.checked })}
                                              />
                                            </label>
                                            {recuperacion.activa ? (
                                              <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                                <textarea
                                                  value={recuperacion.texto}
                                                  disabled={cursoGestionCerrado || suspendido}
                                                  onChange={(event) => updateSeguimientoRecuperacionDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { texto: event.target.value })}
                                                  placeholder="Detalle de recuperación"
                                                  rows={2}
                                                  style={{ width: "100%", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: suspendido ? "#f1f5f9" : "#ffffff" }}
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
                                              disabled={cursoGestionCerrado || suspendido}
                                              onChange={(event) => updateSeguimientoInformarDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { informar: event.target.checked })}
                                            />
                                          </label>
                                          {aviso.informar ? (
                                            <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
                                              <textarea
                                                value={aviso.observacion}
                                                disabled={cursoGestionCerrado || suspendido}
                                                onChange={(event) => updateSeguimientoInformarDraft(seguimientoIndicadorSeleccionado.IndicadorGrupoId, estudiante.EstudianteId, { observacion: event.target.value })}
                                                placeholder="Observaciones para el encargado"
                                                rows={2}
                                                style={{ width: "100%", color: "#0f172a", border: "1px solid #64748b", borderRadius: "10px", padding: "8px", background: suspendido ? "#f1f5f9" : "#ffffff" }}
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
                              <div style={{ display: "grid", gap: "8px", justifyItems: "start", marginTop: "6px" }}>
                                <button
                                  type="button"
                                  className="primary-btn"
                                  onClick={guardarSeguimientoIndicador}
                                  disabled={savingSeguimiento || !seguimientoIndicadorSeleccionado || cursoGestionCerrado}
                                  style={savedSeguimientoModo === "indicador" ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff" } : undefined}
                                >
                                  {savingSeguimiento && savingSeguimientoModo === "indicador" ? "Guardando..." : (savedSeguimientoModo === "indicador" ? "Guardado" : "Calificar")}
                                </button>
                                {savingSeguimiento && savingSeguimientoModo === "indicador" ? (
                                  <div style={{ width: "280px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}>
                                    <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                                  </div>
                                ) : null}
                              </div>
                              <span style={{ color: "#475569" }}>Inicial = 1, Intermedio = 2, Avanzado = 3, {normalizarSeguimientoKey(seguimientoTipo).includes("TAREA") ? "No entregado" : "Ausente"} = 0</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "14px",
                              background: (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA")) ? "#fef2f2" : "white",
                              border: (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA")) ? "1px solid #ef4444" : "1px dashed #cbd5e1",
                              borderRadius: "14px",
                              color: (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA")) ? "#b91c1c" : "#475569",
                              fontWeight: (normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA")) ? 700 : 500
                            }}
                          >
                            {(normalizarSeguimientoKey(seguimientoTipo).includes("COTIDIAN") || normalizarSeguimientoKey(seguimientoTipo).includes("TAREA"))
                              ? (seguimientoFaltanAsignacionesActividad
                                ? "Hay indicadores de este rubro, pero no están asignados a la actividad seleccionada. Asignalos en 'Asignar indicadores a actividades' y luego calificá."
                                : "No hay indicadores asignados para este rubro. Debés agregarlos desde el módulo Planeamiento e Indicadores.")
                              : "No hay indicadores disponibles para evaluar con esos filtros."}
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
                      {savingEval360 ? (
                        <div style={{ width: "320px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                          <div style={{ width: `${savingEval360Progress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                        </div>
                      ) : null}
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
                  <button type="button" className="primary-btn" onClick={handleSaveNotas} disabled={savingNotas || !detalle.plantilla || detalle.actividades.length === 0 || cursoGestionCerrado}>
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
                          asistenciaPrimeraSeleccionRegistradaRef.current.clear();
                          setAsistenciaNotificaciones({});
                        }}
                      />
                    </label>
                    <button type="button" className="primary-btn" onClick={handleSaveAsistencia} disabled={savingAsistencia || loadingAsistencia || !asistenciaLecciones.length || !detalle.estudiantes.length || cursoGestionCerrado}>
                      {savingAsistencia ? "Guardando asistencia..." : (asistenciaYaCalificada ? "Asistencia calificada" : "Guardar asistencia")}
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
                ) : !asistenciaLecciones.length ? (
                  <div style={{ padding: "12px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "12px", color: "#9a3412", fontWeight: 800 }}>
                    No hay lecciones configuradas para esta fecha. Elegí una fecha con lecciones para calificar asistencia.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="adecuacion-zebra-list">
                      <thead>
                        <tr>
                          <th style={stickyTableHeaderStyle}>Estudiante</th>
                          <th>Identificación</th>
                          <th>Estado</th>
                          <th>Minutos tarde</th>
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
                          const suspendido = isEstudianteSuspendido(estudiante);
                          const suspensionTooltip = getSuspensionTooltip(estudiante);
                          return (
                            <tr
                              key={`asis-${estudiante.EstudianteId}`}
                              className="adecuacion-student-row"
                              data-adecuacion={getAdecuacionStyleKind(estudiante.TipoAdecuacion || estudiante.Adecuacion) || undefined}
                              title={suspensionTooltip || undefined}
                              style={{ background: getGestionRowBg(estudiante, zebraBg) }}
                            >
                              <td style={stickyTableCellStyle}>
                                {getFullName(estudiante)}
                                {suspendido ? <div style={{ color: "#be123c", fontWeight: 900, fontSize: "12px" }}>Alumno Suspendido</div> : null}
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
                                <select value={draft.estado} disabled={cursoGestionCerrado || suspendido} title={suspensionTooltip || undefined} onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId, "estado", e.target.value, { aplicarReglaPrimeraSeleccion: true })}>
                                  <option value="PRESENTE">Presente</option>
                                  <option value="AUSENTE_JUSTIFICADA">Ausente justificada</option>
                                  <option value="AUSENTE_INJUSTIFICADA">Ausente injustificada</option>
                                  <option value="TARDIA_MENOR_10">Tardía menor a 10 min</option>
                                  <option value="TARDIA_MAYOR_10">Ausente (Llega 10 minutos tarde)</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  value={draft.minutosTardia}
                                  disabled={cursoGestionCerrado || suspendido}
                                  title={suspensionTooltip || undefined}
                                  onChange={(e) => updateAsistenciaDraft(estudiante.EstudianteId, primeraLeccion.HorarioGrupoId, "minutosTardia", e.target.value)}
                                  placeholder="0"
                                  style={{ width: "110px", background: suspendido ? "#f1f5f9" : undefined }}
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
                          setIndicadoresHabilidadesOpen(false);
                          loadPlantillasPlaneamientoIa();
                          setPlaneamientoIaForm((prev) => ({
                            ...prev,
                            materiaId: String(selected.MateriaId || ""),
                            grado: getGradoPlaneamientoFromGrupo(selected),
                            grupoId: String(selected.GrupoId || ""),
                            grupoIds: [String(selected.GrupoId || "")].filter(Boolean),
                            area: "",
                            busquedaTexto: "",
                            habilidadesIds: []
                          }));
                          setDocumentoApoyoIa([]);
                          setPlantillaFormatoIa(null);
                          setAnalisisReferenciaIa(null);
                          setPromptPlaneamientoIa("");
                          setPromptPlaneamientoIaConstruido(false);
                          setPromptPlaneamientoIaMejorado(false);
                          setEditingPlaneamientoIaId(null);
                          setUltimoPlaneamientoIa(null);
                        }
                        setPlaneamientoIaFormOpen((prev) => !prev);
                      }}
                    >
                      {planeamientoIaFormOpen ? "Ocultar generación IA" : "Agregar planeamiento con IA"}
                    </button>
                    <button
                      type="button"
                      style={{ ...secondaryButtonStyle, background: "#ccfbf1", borderColor: "#5eead4", color: "#115e59", fontWeight: 900 }}
                      onClick={abrirIndicadoresDesdeHabilidades}
                    >
                      {indicadoresHabilidadesOpen ? "Ocultar indicadores desde habilidades" : "Agregar Indicadores desde Habilidades"}
                    </button>
                  </div>
                </div>

                <div style={{ ...helperDarkBoxStyle, display: "grid", gap: "8px" }}>
                  <strong>Paso a paso</strong>
                  <div>1. Completá los datos requeridos y adjuntá el planeamiento de referencia.</div>
                  <div>2. Presioná “Construir prompt” para crearlo y revisarlo con IA.</div>
                  <div>3. Presioná “Generar planeamiento”. Si aparece alguna observación, podés corregirla con IA antes de guardar.</div>
                  <div>4. Cuando el resultado esté correcto, guardalo y continuá con sus indicadores.</div>
                </div>

                {indicadoresHabilidadesOpen && (
                  <div style={{ ...cardStyle, background: "#0f2f2e", color: "#ecfeff", border: "1px solid #2dd4bf", display: "grid", gap: "12px", fontSize: "15px", lineHeight: 1.35 }}>
                    <div>
                      <strong>Agregar indicadores desde habilidades</strong>
                      <p style={{ margin: "4px 0 0", color: "#bff7ee" }}>
                        Se crearán indicadores ligados a {selected?.MateriaNombre || "la materia"} y al grupo seleccionado. El nombre quedará como: <strong>{nombreIndicadoresHabilidadesPreview}</strong>.
                      </p>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                      <label style={{ color: "#ecfeff" }}>
                        Nombre del conjunto
                        <input
                          value={indicadoresHabilidadesForm.nombre}
                          onChange={(event) => updateIndicadoresHabilidadesField("nombre", event.target.value)}
                          placeholder="Ejemplo: Semana 3"
                          style={{ background: "#123b3a", color: "#ecfeff", border: "1px solid #5eead4", fontSize: "15px" }}
                        />
                      </label>
                      <label style={{ color: "#ecfeff" }}>
                        Plantilla IA de indicadores
                        <select
                          value={indicadoresHabilidadesForm.plantillaPromptIAId || eval360PlantillaIaIndicadorId}
                          onChange={(event) => updateIndicadoresHabilidadesField("plantillaPromptIAId", event.target.value)}
                          style={{ background: "#123b3a", color: "#ecfeff", border: "1px solid #5eead4", fontSize: "15px" }}
                        >
                          <option value="">Usar plantilla activa recomendada</option>
                          {eval360PlantillasIaIndicadores.map((plantilla) => (
                            <option key={`hab-plantilla-${plantilla.Id}`} value={plantilla.Id}>
                              {plantilla.NombrePlantilla}{plantilla.TipoGeneracionIANombre ? ` (${plantilla.TipoGeneracionIANombre})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ color: "#ecfeff" }}>
                        Indicadores por habilidad
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={indicadoresHabilidadesForm.cantidadPorHabilidad}
                          onChange={(event) => updateIndicadoresHabilidadesField("cantidadPorHabilidad", event.target.value)}
                          placeholder="1"
                          style={{ background: "#123b3a", color: "#ecfeff", border: "1px solid #5eead4", fontSize: "15px" }}
                        />
                      </label>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      <strong style={{ color: "#ecfeff" }}>Meses</strong>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {mesesHabilidades.length ? mesesHabilidades.map((mes) => {
                          const checked = indicadoresHabilidadesForm.meses.includes(mes);
                          return (
                            <label key={`mes-ind-hab-${mes}`} style={{ display: "flex", alignItems: "center", gap: "6px", background: checked ? "#134e4a" : "#123b3a", border: "1px solid #5eead4", borderRadius: "8px", padding: "6px 8px", fontWeight: 800 }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleIndicadoresHabilidadesMes(mes)} />
                              {mes}
                            </label>
                          );
                        }) : (
                          <span style={{ color: "#bff7ee" }}>{loadingHabilidadesIa ? "Cargando habilidades..." : "No hay meses disponibles para esta materia y grado."}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        <strong style={{ color: "#ecfeff" }}>Habilidades</strong>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => updateIndicadoresHabilidadesField("habilidadesIds", habilidadesFiltradasIndicadoresHabilidades.map((h) => Number(h.PlaneamientoHabilidadId)))}
                          disabled={!habilidadesFiltradasIndicadoresHabilidades.length}
                        >
                          Seleccionar todas
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: "6px", maxHeight: "260px", overflowY: "auto", background: "#082f2e", border: "1px solid #5eead4", borderRadius: "8px", padding: "8px" }}>
                        {habilidadesFiltradasIndicadoresHabilidades.length ? habilidadesFiltradasIndicadoresHabilidades.map((habilidad) => {
                          const habilidadId = Number(habilidad.PlaneamientoHabilidadId);
                          const checked = indicadoresHabilidadesForm.habilidadesIds.includes(habilidadId);
                          return (
                            <label key={`hab-ind-${habilidadId}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px", alignItems: "start", color: "#ecfeff", padding: "6px", borderRadius: "6px", background: checked ? "#134e4a" : "transparent" }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleIndicadoresHabilidadesId(habilidadId)} />
                              <span>
                                <strong>{habilidad.NumeroHabilidad ? `${habilidad.NumeroHabilidad}. ` : ""}</strong>{habilidad.DescripcionHabilidad}
                                <small style={{ display: "block", color: "#bff7ee" }}>{[habilidad.Mes, habilidad.Area].filter(Boolean).join(" - ")}</small>
                              </span>
                            </label>
                          );
                        }) : (
                          <span style={{ color: "#bff7ee" }}>Seleccioná uno o varios meses para ver las habilidades disponibles.</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
                      <div style={{ display: "grid", gap: "8px", background: "#082f2e", border: "1px solid #5eead4", borderRadius: "8px", padding: "10px" }}>
                        <strong style={{ color: "#ecfeff" }}>Secciones</strong>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#ecfeff", fontWeight: 800, width: "fit-content", maxWidth: "100%" }}>
                          <span>Aplicar a todas las secciones del mismo grado</span>
                          <input
                            type="checkbox"
                            checked={seccionesMismoGradoMateriaSeleccionado.length > 0 && indicadoresHabilidadesForm.grupoIds.length === seccionesMismoGradoMateriaSeleccionado.length}
                            onChange={(event) => updateIndicadoresHabilidadesField(
                              "grupoIds",
                              event.target.checked
                                ? seccionesMismoGradoMateriaSeleccionado.map(getIndicadoresDestinoKey).filter(Boolean)
                                : [getIndicadoresDestinoKey(selected)].filter(Boolean)
                            )}
                            style={{ width: "16px", height: "16px", margin: 0, flexShrink: 0 }}
                          />
                        </label>
                        <div style={{ display: "flex", gap: "8px 14px", flexWrap: "wrap", alignItems: "center" }}>
                          {seccionesMismoGradoMateriaSeleccionado.map((grupo) => {
                            const destinoKey = getIndicadoresDestinoKey(grupo);
                            return (
                              <label key={`hab-sec-${destinoKey}`} style={{ display: "inline-flex", gap: "8px", alignItems: "center", color: "#ecfeff", fontWeight: 800, width: "fit-content", maxWidth: "100%" }}>
                                <span>{grupo.GrupoNombre}</span>
                                <input
                                  type="checkbox"
                                  checked={indicadoresHabilidadesForm.grupoIds.includes(destinoKey)}
                                  onChange={() => toggleIndicadoresHabilidadesGrupo(destinoKey)}
                                  style={{ width: "16px", height: "16px", margin: 0, flexShrink: 0 }}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "8px", background: "#082f2e", border: "1px solid #5eead4", borderRadius: "8px", padding: "10px" }}>
                        <strong style={{ color: "#ecfeff" }}>Rúbricas a calificar</strong>
                        {[
                          { key: "Cotidiano", label: "Trabajo cotidiano" },
                          { key: "Tareas", label: "Tareas" },
                          { key: "TablaEspecificaciones", label: "Tabla de especificaciones" }
                        ].map((item) => (
                          <label key={`hab-tipo-${item.key}`} style={{ display: "inline-flex", gap: "8px", alignItems: "center", color: "#ecfeff", fontWeight: 800, width: "fit-content", maxWidth: "100%" }}>
                            <span>{item.label}</span>
                            <input
                              type="checkbox"
                              checked={indicadoresHabilidadesForm.tiposUso.includes(item.key)}
                              onChange={() => toggleIndicadoresHabilidadesTipoUso(item.key)}
                              style={{ width: "16px", height: "16px", margin: 0, flexShrink: 0 }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <label style={{ color: "#ecfeff" }}>
                      Indicaciones para la IA
                      <textarea
                        value={indicadoresHabilidadesForm.indicacionesDocente}
                        onChange={(event) => updateIndicadoresHabilidadesField("indicacionesDocente", event.target.value)}
                        rows={3}
                        placeholder="Opcional: tono, nivel de detalle o condición especial."
                        style={{ background: "#123b3a", color: "#ecfeff", border: "1px solid #5eead4", fontSize: "15px" }}
                      />
                    </label>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="primary-btn" onClick={generarIndicadoresDesdeHabilidades} disabled={generatingIndicadoresHabilidades}>
                        {generatingIndicadoresHabilidades ? "Generando indicadores..." : "Generar indicadores desde habilidades"}
                      </button>
                      <button type="button" style={secondaryButtonStyle} onClick={() => setIndicadoresHabilidadesOpen(false)} disabled={generatingIndicadoresHabilidades}>
                        Cancelar
                      </button>
                    </div>

                    {(generatingIndicadoresHabilidades || generatingIndicadoresHabilidadesProgress > 0) && (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div className="processing-progress-track" aria-label="Progreso de generacion de indicadores desde habilidades">
                          <div
                            className="processing-progress-bar"
                            style={{ width: `${Math.max(0, Math.min(100, generatingIndicadoresHabilidadesProgress))}%` }}
                          />
                        </div>
                        <div className="processing-progress-meta" style={{ color: "#ecfeff" }}>
                          <span>{Math.max(0, Math.min(100, Math.round(generatingIndicadoresHabilidadesProgress)))}%</span>
                          <span>{generatingIndicadoresHabilidadesEtapa || "Procesando indicadores"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}



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
                        Revisá el contexto del grupo, elegí las habilidades y agregá indicaciones solo si necesitás orientar a la IA.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "8px" }}>
                    {[
                      { label: "1. Completar datos", ready: datosPromptPlaneamientoIaCompletos, optional: false },
                      { label: "2. Construir y revisar prompt", ready: promptPlaneamientoIaListo, optional: false },
                      { label: "3. Generar planeamiento", ready: Boolean(ultimoPlaneamientoIa), optional: false }
                    ].map((step) => (
                      <div
                        key={step.label}
                        style={{
                          border: step.ready ? "1px solid #22c55e" : "1px solid #38516f",
                          background: step.ready ? "#123c2d" : "#122033",
                          borderRadius: "6px",
                          padding: "8px 10px",
                          color: step.ready ? "#dcfce7" : "#c6d7eb",
                          fontWeight: 800,
                          fontSize: "13px",
                          textAlign: "center"
                        }}
                      >
                        <span style={{ display: "block" }}>{step.label}</span>
                        <small style={{ color: step.ready ? "#86efac" : "#9fb3ca" }}>
                          {step.ready ? "Listo" : (step.optional ? "Opcional" : "Pendiente")}
                        </small>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <strong style={{ color: "#e5eefb" }}>1. Contexto del planeamiento</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
                    <label style={{ color: "#e5eefb" }}>
                      Nombre del planeamiento
                      <input
                        value={planeamientoIaForm.nombre}
                        onChange={(e) => updatePlaneamientoIaField("nombre", e.target.value)}
                        placeholder="Ejemplo: Agosto - Octavo - Matemática"
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>
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
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <span style={{ fontWeight: 900, color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>Secciones</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </div>
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

                    <label style={{ color: "#e5eefb", display: "none" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <span style={{ fontWeight: 900, color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>Plantilla IA</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </span>
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span>Planeamiento de referencia</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </span>
                      <input
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file && file.size > 20 * 1024 * 1024) {
                            setPlantillaFormatoIa(null);
                            setAnalisisReferenciaIa(null);
                            setSeccionModeloReferenciaIaId("");
                            e.target.value = "";
                            setErrorMessage("El planeamiento de referencia no puede superar 20 MB");
                            return;
                          }
                          setPlantillaFormatoIa(file);
                          if (file) {
                            setErrorMessage("");
                            void analizarReferenciaPlaneamientoIa(file);
                          } else {
                            setAnalisisReferenciaIa(null);
                            setSeccionModeloReferenciaIaId("");
                          }
                        }}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                      <small style={{ display: "block", color: "#a8b7c9", marginTop: "4px" }}>
                        El Word de referencia define obligatoriamente idioma, diseño, tablas, encabezados y estructura pedagógica. El contenido anterior se sustituye por el nuevo.
                      </small>
                      {plantillaFormatoIa && (
                        <small style={{ display: "block", color: "#67e8f9", marginTop: "4px" }}>
                          Formato seleccionado: {plantillaFormatoIa.name}
                        </small>
                      )}
                      {analizandoReferenciaIa && (
                        <div style={{ marginTop: "8px", padding: "10px", border: "1px solid #4b6583", background: "#10243a", color: "#dbeafe" }}>
                          Analizando idioma, tablas y estructura de mediación...
                        </div>
                      )}
                      {!analizandoReferenciaIa && analisisReferenciaIa && (
                        <div style={{ marginTop: "8px", padding: "10px", border: "1px solid #2f6f55", background: "#102a24", color: "#dcfce7", display: "grid", gap: "7px" }}>
                          <strong>{analisisReferenciaIa.listo ? "Archivo entendido y listo" : "Archivo recibido con observaciones"}</strong>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                              Idioma: {analisisReferenciaIa.idiomaNombre}
                            </span>
                            {analisisReferenciaIa.esDocx && (
                              <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                                {analisisReferenciaIa.cantidadTablas} tabla(s) detectada(s)
                              </span>
                            )}
                            {analisisReferenciaIa.estructuraEstrategias.length > 0 && (
                              <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                                {analisisReferenciaIa.estructuraEstrategias.length} fase(s) de mediación
                              </span>
                            )}
                            {analisisReferenciaIa.perfilEstrategias && (
                              <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                                Detalle {analisisReferenciaIa.perfilEstrategias.nivelDetalle}
                              </span>
                            )}
                            {(analisisReferenciaIa.perfilEstrategias?.cantidadActividadesNumeradas ?? 0) > 0 && (
                              <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                                {analisisReferenciaIa.perfilEstrategias?.cantidadActividadesNumeradas} actividades detectadas
                              </span>
                            )}
                            {(analisisReferenciaIa.perfilEstrategias?.cantidadPreguntas ?? 0) > 0 && (
                              <span style={{ padding: "3px 7px", border: "1px solid #4b8c72", background: "#163c31", fontSize: "12px" }}>
                                {analisisReferenciaIa.perfilEstrategias?.cantidadPreguntas} bloques con preguntas
                              </span>
                            )}
                          </div>
                          {analisisReferenciaIa.estructuraEstrategias.length > 0 && (
                            <small style={{ color: "#bbf7d0" }}>
                              Secuencia detectada: {analisisReferenciaIa.estructuraEstrategias.join(" → ")}
                            </small>
                          )}
                          {(analisisReferenciaIa.seccionesModelo?.length ?? 0) > 1 && (
                            <label style={{ display: "grid", gap: "4px", color: "#dcfce7", fontSize: "13px" }}>
                              Sección del Word que se usará como modelo
                              <select
                                value={seccionModeloReferenciaIaId}
                                onChange={(event) => setSeccionModeloReferenciaIaId(event.target.value)}
                                style={{ background: "#163c31", color: "#dcfce7", border: "1px solid #4b8c72" }}
                              >
                                {(analisisReferenciaIa.seccionesModelo || []).map((seccion) => (
                                  <option key={seccion.id} value={seccion.id}>
                                    Tabla {seccion.indiceTabla}: {seccion.etiqueta}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {analisisReferenciaIa.advertencias.map((advertencia, index) => (
                            <small key={`${advertencia}-${index}`} style={{ color: "#fde68a" }}>{advertencia}</small>
                          ))}
                        </div>
                      )}
                    </label>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <strong style={{ color: "#e5eefb" }}>2. Período y alcance</strong>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                    <label style={{ color: "#e5eefb" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <span style={{ fontWeight: 900, color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>Mes o meses</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </span>
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
                      <small style={{ color: "#b8c7da" }}>Ctrl + clic para seleccionar varios meses. Si no seleccionás ninguno, se muestran todos.</small>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      Cantidad de semanas
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={planeamientoIaForm.semanas}
                        onChange={(e) => updatePlaneamientoIaField("semanas", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <span style={{ fontWeight: 900, color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>Periodicidad</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </span>
                      <select
                        value={planeamientoIaForm.periodicidad}
                        onChange={(e) => updatePlaneamientoIaField("periodicidad", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      >
                        <option value="">Seleccioná una opción</option>
                        <option value="mes">Mes</option>
                        <option value="bimestre">Bimestre</option>
                        <option value="trimestre">Trimestre</option>
                        <option value="semestre">Semestre</option>
                      </select>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <span style={{ fontWeight: 900, color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>Competencia general</span>
                        <span style={requiredBadgeStyle}>Requerido</span>
                      </span>
                      <select
                        value={planeamientoIaForm.competenciaGeneral}
                        onChange={(e) => updatePlaneamientoIaField("competenciaGeneral", e.target.value)}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      >
                        <option value="">Seleccioná una opción</option>
                        <option value="Competencias para la ciudadanía responsable y solidaria">Competencias para la ciudadanía responsable y solidaria</option>
                        <option value="Competencias para la vida: sociales, emocionales y de aprendizaje">Competencias para la vida: sociales, emocionales y de aprendizaje</option>
                        <option value="Competencias para el empleo digno y el emprendimiento">Competencias para el empleo digno y el emprendimiento</option>
                      </select>
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
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "999px", background: "rgba(251, 146, 60, 0.18)", border: "1px solid rgba(251, 146, 60, 0.45)" }}>
                        <strong style={{ color: "#fff7ed", fontSize: "15px", letterSpacing: "0.2px" }}>3. Seleccioná las habilidades</strong>
                        <span style={requiredBadgeStyle}>Requerido</span>
                        <span style={{ padding: "2px 10px", borderRadius: "999px", background: "#164e63", border: "1px solid #22d3ee", color: "#67e8f9", fontWeight: 800, fontSize: "12px" }}>
                          {planeamientoIaForm.habilidadesIds.length} seleccionadas
                        </span>
                      </div>
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
                        Las habilidades se cargan automáticamente con la materia y el grado del grupo seleccionado.
                      </div>
                    ) : habilidadesFiltradasIa.length === 0 ? (
                      <div style={{ padding: "12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #e5e7eb", color: "#b8c7da" }}>
                        No hay habilidades para el mes seleccionado. Probá dejando el mes en blanco para verlas todas.
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

                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ color: "#e5eefb" }}>4. Indicaciones</strong>
                      <span style={optionalBadgeStyle}>Opcional</span>
                    </div>
                    <label style={{ color: "#e5eefb" }}>
                      Indicaciones, consideraciones o premisas para la IA
                      <textarea
                        rows={4}
                        value={planeamientoIaForm.indicaciones}
                        onChange={(e) => updatePlaneamientoIaField("indicaciones", e.target.value)}
                        placeholder="Ejemplo: grupo con rezago, usar un ejemplo de la página 12 del documento, incluir adecuación curricular..."
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                      <small style={{ color: "#b8c7da" }}>Cuando escribás indicaciones, se aplican como requisitos obligatorios para la generación.</small>
                    </label>

                    <label style={{ color: "#e5eefb" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                        <span>Documentos e imágenes de apoyo para la IA</span>
                        <span style={optionalBadgeStyle}>Opcional</span>
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".txt,.csv,.json,.md,.pdf,.doc,.docx,image/*,.png,.jpg,.jpeg,.gif,.webp"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const maxSize = 20 * 1024 * 1024;
                          const excedido = files.find((file) => file.size > maxSize);
                          const cantidadImagenes = files.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name)).length;
                          if (excedido) {
                            setDocumentoApoyoIa([]);
                            e.target.value = "";
                            setErrorMessage(`El archivo ${excedido.name} supera 20 MB`);
                            return;
                          }
                          if (cantidadImagenes > 4) {
                            setDocumentoApoyoIa([]);
                            e.target.value = "";
                            setErrorMessage("Podés adjuntar hasta cuatro imágenes por planeamiento");
                            return;
                          }
                          setDocumentoApoyoIa(files);
                          if (files.length) setErrorMessage("");
                        }}
                        style={{ background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583" }}
                      />
                      <small style={{ color: "#b8c7da" }}>
                        Podés subir varios documentos o imágenes de hasta 20 MB y pedir páginas, ejercicios o elementos visuales concretos.
                      </small>
                      {documentoApoyoIa.length > 0 && (
                        <div style={{ marginTop: "6px", display: "grid", gap: "4px" }}>
                          <small style={{ color: "#67e8f9" }}>
                            Documentos seleccionados: {documentoApoyoIa.length}
                          </small>
                          {documentoApoyoIa.map((file, index) => (
                            <small key={`${file.name}-${index}`} style={{ color: "#b8c7da", display: "flex", gap: "8px", alignItems: "center" }}>
                              <span>{file.name}</span>
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={() => setDocumentoApoyoIa((prev) => prev.filter((_, i) => i !== index))}
                                style={{ padding: "2px 8px", fontSize: "12px" }}
                              >
                                Quitar
                              </button>
                            </small>
                          ))}
                        </div>
                      )}
                    </label>
                  </div>

                  <div style={{ padding: "14px", background: "#122033", border: "1px solid #38516f", borderRadius: "6px", display: "grid", gap: "12px" }}>
                    <div>
                      <strong style={{ color: "#e5eefb" }}>5. Preparar y generar</strong>
                      <p style={{ margin: "4px 0 0", color: "#b8c7da" }}>
                        Seguí los botones de izquierda a derecha. Mejorar el prompt con IA es recomendado, pero no obligatorio.
                      </p>
                    </div>

                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: datosPromptPlaneamientoIaCompletos ? "1px solid #2f6f55" : "1px solid #a16207",
                        background: datosPromptPlaneamientoIaCompletos ? "#102a24" : "#3b2a12",
                        color: datosPromptPlaneamientoIaCompletos ? "#dcfce7" : "#fef3c7"
                      }}
                    >
                      {ultimoPlaneamientoIa
                        ? "El planeamiento ya fue generado. Continuá con las acciones que aparecen debajo del resultado."
                        : !datosPromptPlaneamientoIaCompletos
                        ? `Antes de construir el prompt completá: ${faltantesPromptPlaneamientoIa.join(", ")}.`
                        : !promptPlaneamientoIaListo
                          ? "Datos completos. El siguiente paso es construir el prompt."
                          : promptPlaneamientoIaMejorado
                            ? "Prompt construido, revisado y listo. Podés generar el planeamiento."
                            : "Prompt construido y listo. Podés revisarlo o generar el planeamiento."}
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        className={promptPlaneamientoIaListo ? "ghost-btn" : "primary-btn"}
                        onClick={crearPromptPlaneamientoIa}
                        disabled={!puedeConstruirPromptPlaneamientoIa}
                        title={ultimoPlaneamientoIa ? "Usá las acciones debajo del resultado" : (datosPromptPlaneamientoIaCompletos ? "Construir y revisar el prompt con IA" : "Completá primero los datos requeridos")}
                      >
                        1. Construir prompt
                      </button>
                      {promptPlaneamientoIaListo && !promptPlaneamientoIaMejorado ? (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => { void mejorarPromptPlaneamientoIa(); }}
                          disabled={mejorandoPromptPlaneamientoIa || generatingPlaneamientoIa || savingPlaneamientoIa || revisandoPlaneamientoIa}
                          title="Opcional: usa IA para revisar el prompt antes de generar"
                        >
                          {mejorandoPromptPlaneamientoIa ? "Revisando prompt..." : "Revisar prompt con IA"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={generarPlaneamientoConIa}
                        disabled={!puedeGenerarPlaneamientoIa}
                        title={ultimoPlaneamientoIa ? "Descartá el resultado actual si necesitás generar otro planeamiento" : (promptPlaneamientoIaListo ? "Generar el planeamiento con el prompt actual" : "Construí primero el prompt")}
                      >
                        {generatingPlaneamientoIa
                          ? "Generando planeamiento..."
                          : "2. Generar planeamiento"}
                      </button>
                    </div>

                    {mejorandoPromptPlaneamientoIa ? (
                      <div style={{ width: "420px", maxWidth: "100%", display: "grid", gap: "5px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#dbeafe", fontSize: "0.86rem" }}>
                          <span>{mejorandoPromptPlaneamientoIaEtapa || "Construyendo y revisando prompt"}</span>
                          <strong>{Math.round(mejorandoPromptPlaneamientoIaProgress)}%</strong>
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Avance de construcción y revisión del prompt con IA"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(mejorandoPromptPlaneamientoIaProgress)}
                          style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}
                        >
                          <div style={{ width: `${mejorandoPromptPlaneamientoIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                        </div>
                      </div>
                    ) : null}

                    {promptPlaneamientoIaListo ? (
                      <label style={{ color: "#e5eefb" }}>
                        Prompt que se enviará
                        <textarea
                          rows={10}
                          value={promptPlaneamientoIa}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPromptPlaneamientoIa(value);
                            setPromptPlaneamientoIaConstruido(Boolean(value.trim()));
                            setPromptPlaneamientoIaMejorado(false);
                          }}
                          style={{ marginTop: "6px", background: "#1f324a", color: "#e5eefb", border: "1px solid #4b6583", minHeight: "190px" }}
                        />
                        <small style={{ color: "#b8c7da" }}>
                          Podés editarlo. Si cambiás los datos del formulario, deberás construirlo nuevamente.
                        </small>
                      </label>
                    ) : null}
                  </div>
                  {generatingPlaneamientoIa ? (
                    <div style={{ width: "520px", maxWidth: "100%", display: "grid", gap: "5px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#dbeafe", fontSize: "0.86rem" }}>
                        <span>{generatingPlaneamientoIaEtapa || "Generando planeamiento con IA"}</span>
                        <strong>{Math.round(generatingPlaneamientoIaProgress)}%</strong>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Avance de generación del planeamiento con IA"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(generatingPlaneamientoIaProgress)}
                        style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}
                      >
                        <div style={{ width: `${generatingPlaneamientoIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                      </div>
                    </div>
                  ) : null}

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
                      {generatingPlaneamientoIa
                        ? `${generatingPlaneamientoIaEtapa || "Generando la propuesta"} (${Math.round(generatingPlaneamientoIaProgress)}%).`
                        : (errorMessage || message)}
                    </div>
                  )}

                  {ultimoPlaneamientoIa && (
                    <div style={{ padding: "14px", borderRadius: "14px", background: "#122033", border: "1px solid #38516f", color: "#e5eefb", display: "grid", gap: "12px" }}>
                      <div>
                        <strong>Revisión del planeamiento generado</strong>
                        <p style={{ margin: "4px 0 0", color: "#b8c7da" }}>
                          La IA compara la propuesta con el documento de referencia y completa los ajustes necesarios antes de guardarla.
                        </p>
                      </div>

                      {ultimoPlaneamientoIa.controlCalidad && (
                        <div
                          style={{
                            padding: "12px",
                            border: estadoPlaneamientoIa === "listo" ? "1px solid #3f8f6b" : estadoPlaneamientoIa === "advertencias" ? "1px solid #b58928" : "1px solid #dc665f",
                            background: estadoPlaneamientoIa === "listo" ? "#102a24" : estadoPlaneamientoIa === "advertencias" ? "#3b3117" : "#3a1f24",
                            display: "grid",
                            gap: "8px"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                            <strong>
                              {etiquetaEstadoPlaneamientoIa}
                            </strong>
                          </div>
                          <div style={{ display: "grid", gap: "6px" }}>
                            {ultimoPlaneamientoIa.controlCalidad.usoIa ? (
                              <small style={{ color: "#bfdbfe" }}>
                                Tokens IA: entrada {Number(ultimoPlaneamientoIa.controlCalidad.usoIa.inputTokens || 0).toLocaleString("es-CR")}, salida {Number(ultimoPlaneamientoIa.controlCalidad.usoIa.outputTokens || 0).toLocaleString("es-CR")}, total {Number(ultimoPlaneamientoIa.controlCalidad.usoIa.totalTokens || 0).toLocaleString("es-CR")}.
                              </small>
                            ) : null}
                            {(ultimoPlaneamientoIa.controlCalidad.verificaciones || []).map((item) => (
                              <div
                                key={item.codigo}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "18px 1fr",
                                  gap: "7px",
                                  color: item.estado === "error" ? "#fecaca" : item.estado === "alerta" ? "#fde68a" : "#bbf7d0",
                                  fontSize: "13px"
                                }}
                              >
                                <span aria-hidden="true">{item.estado === "ok" ? "✓" : item.estado === "alerta" ? "!" : "×"}</span>
                                <span><strong>{item.etiqueta}:</strong> {item.detalle}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                        <label>
                          Periodicidad
                          <select
                            value={planeamientoIaForm.periodicidad}
                            onChange={(e) => updatePlaneamientoIaField("periodicidad", e.target.value)}
                          >
                            <option value="">Seleccioná una opción</option>
                            <option value="mes">Mes</option>
                            <option value="bimestre">Bimestre</option>
                            <option value="trimestre">Trimestre</option>
                            <option value="semestre">Semestre</option>
                          </select>
                        </label>
                        <label>
                          Competencia general
                          <select
                            value={planeamientoIaForm.competenciaGeneral}
                            onChange={(e) => updatePlaneamientoIaField("competenciaGeneral", e.target.value)}
                          >
                            <option value="">Seleccioná una opción</option>
                            <option value="Competencias para la ciudadanía responsable y solidaria">Competencias para la ciudadanía responsable y solidaria</option>
                            <option value="Competencias para la vida: sociales, emocionales y de aprendizaje">Competencias para la vida: sociales, emocionales y de aprendizaje</option>
                            <option value="Competencias para el empleo digno y el emprendimiento">Competencias para el empleo digno y el emprendimiento</option>
                          </select>
                        </label>
                      </div>

                      <label>
                        Aprendizajes esperados
                        <textarea
                          rows={4}
                          value={(ultimoPlaneamientoIa.aprendizajesEsperados || []).join("\n")}
                          onChange={(e) => updateResultadoIaArray("aprendizajesEsperados", e.target.value)}
                        />
                      </label>

                      <label>
                        Criterios de evaluación
                        <textarea
                          rows={4}
                          value={(ultimoPlaneamientoIa.criteriosEvaluacion || []).join("\n")}
                          onChange={(e) => updateResultadoIaArray("criteriosEvaluacion", e.target.value)}
                        />
                      </label>

                      {Object.keys(ultimoPlaneamientoIa.camposReferencia || {}).length > 0 && (
                        <div style={{ display: "grid", gap: "10px" }}>
                          <strong>Datos nuevos para el machote</strong>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
                            {Object.entries(ultimoPlaneamientoIa.camposReferencia || {}).map(([campo, valor]) => (
                              <label key={campo}>
                                {campo}
                                <textarea
                                  rows={2}
                                  value={valor || ""}
                                  onChange={(e) => updateResultadoIaCampoReferencia(campo, e.target.value)}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

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
                      <div style={{ display: "grid", gap: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                          <strong>Indicadores de evaluación</strong>
                          <button type="button" style={secondaryButtonStyle} onClick={addResultadoIaIndicador}>
                            Agregar indicador
                          </button>
                        </div>
                        <small style={{ color: "#93c5fd" }}>Podés arrastrar y soltar para ordenar (ejemplo: 3.2 debajo de 3.1).</small>
                        {((ultimoPlaneamientoIa.indicadoresEvaluacion || []).length ? ultimoPlaneamientoIa.indicadoresEvaluacion : [""]).map((indicador, index) => (
                          <div
                            key={`ia-ind-${index}`}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", String(index));
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const fromIndex = Number(event.dataTransfer.getData("text/plain"));
                              if (!Number.isFinite(fromIndex)) return;
                              moveResultadoIaIndicador(fromIndex, index);
                            }}
                            style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", alignItems: "end", border: "1px dashed #334155", borderRadius: "10px", padding: "8px" }}
                          >
                            <label style={{ margin: 0 }}>
                              Indicador {index + 1}
                              <textarea
                                rows={2}
                                value={indicador || ""}
                                onChange={(e) => updateResultadoIaIndicador(index, e.target.value)}
                                placeholder="Escribí el indicador"
                              />
                            </label>
                            <button type="button" style={secondaryButtonStyle} onClick={() => removeResultadoIaIndicador(index)}>
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>

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

                      <div style={{ display: "grid", gap: "8px", justifyItems: "start" }}>
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: planeamientoIaListoParaGuardar ? "1px solid #2f6f55" : "1px solid #a16207",
                            background: planeamientoIaListoParaGuardar ? "#102a24" : "#3b2a12",
                            color: planeamientoIaListoParaGuardar ? "#dcfce7" : "#fef3c7"
                          }}
                        >
                          {planeamientoIaListoParaGuardar
                            ? "Planeamiento validado. Ya podés guardar."
                            : "Hay observaciones pendientes. Presioná “Corregir con IA” para aplicar los ajustes y habilitar el guardado."}
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {!planeamientoIaListoParaGuardar ? (
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={() => { void revisarPlaneamientoIaGenerado(true); }}
                              disabled={savingPlaneamientoIa || revisandoPlaneamientoIa || generatingPlaneamientoIa}
                            >
                              {revisandoPlaneamientoIa ? "Corrigiendo con IA..." : "Corregir con IA"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={guardarPlaneamientoIaGenerado}
                            disabled={savingPlaneamientoIa || revisandoPlaneamientoIa || generatingPlaneamientoIa || !planeamientoIaListoParaGuardar}
                            title={planeamientoIaListoParaGuardar ? "Guardar el planeamiento validado" : "Corregí primero el planeamiento con IA"}
                          >
                            {savingPlaneamientoIa
                              ? (revisandoPlaneamientoIa ? "Revisando antes de guardar..." : "Guardando...")
                              : (editingPlaneamientoIaId ? "Actualizar planeamiento" : "Guardar planeamiento")}
                          </button>
                          <button type="button" style={secondaryButtonStyle} onClick={() => { setUltimoPlaneamientoIa(null); setEditingPlaneamientoIaId(null); }} disabled={savingPlaneamientoIa || revisandoPlaneamientoIa || generatingPlaneamientoIa}>
                            Descartar
                          </button>
                        </div>
                        {revisandoPlaneamientoIa ? (
                          <div style={{ width: "460px", maxWidth: "100%", display: "grid", gap: "5px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#dbeafe", fontSize: "0.86rem" }}>
                              <span>{corrigiendoPlaneamientoIaEtapa || "Corrigiendo planeamiento"}</span>
                              <strong>{Math.round(corrigiendoPlaneamientoIaProgress)}%</strong>
                            </div>
                            <div
                              role="progressbar"
                              aria-label="Avance de la corrección del planeamiento"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(corrigiendoPlaneamientoIaProgress)}
                              style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}
                            >
                              <div style={{ width: `${corrigiendoPlaneamientoIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                            </div>
                          </div>
                        ) : null}
                        {savingPlaneamientoIa ? (
                          <div style={{ width: "460px", maxWidth: "100%", display: "grid", gap: "5px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", color: "#dbeafe", fontSize: "0.86rem" }}>
                              <span>{savingPlaneamientoIaEtapa || "Guardando planeamiento"}</span>
                              <strong>{Math.round(savingPlaneamientoIaProgress)}%</strong>
                            </div>
                            <div
                              role="progressbar"
                              aria-label="Avance del guardado del planeamiento"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(savingPlaneamientoIaProgress)}
                              style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}
                            >
                              <div style={{ width: `${savingPlaneamientoIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #22d3ee 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                            </div>
                          </div>
                        ) : null}
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
                          const indicadoresPlaneamientoCargados = Object.prototype.hasOwnProperty.call(eval360IndicadoresPorPlaneamiento, planeamientoId);
                          const indicadoresMinimizados = !!eval360IndicadoresMinimizados[planeamientoId];
                          const totalIndicadoresGenerados = getTotalIndicadoresIaPlaneamiento(planeamiento, indicadoresPlaneamiento);
                          const tieneIndicadoresGenerados = totalIndicadoresGenerados > 0;
                          const esDesdeHabilidades = isPlaneamientoDesdeHabilidades(planeamiento);
                          const indicadorAccionLabel = panelOpen
                            ? (esDesdeHabilidades ? "Ocultar indicadores de habilidades" : "Ocultar indicadores IA")
                            : esDesdeHabilidades
                              ? (tieneIndicadoresGenerados ? "Ver indicadores a partir de habilidades" : "Agregar indicadores desde habilidades")
                              : (tieneIndicadoresGenerados ? "Ver indicadores generados con IA" : "Generar Indicadores con IA");
                          const indicadorAccionStyle = esDesdeHabilidades
                            ? { ...secondaryButtonStyle, background: "#ccfbf1", borderColor: "#5eead4", color: "#115e59", fontWeight: 900 }
                            : { ...secondaryButtonStyle, background: "#ede9fe", borderColor: "#c4b5fd", color: "#5b21b6", fontWeight: 800 };
                          const indicadorManualForm = getIndicadorManualForm(planeamientoId);

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
                                    {!esDesdeHabilidades && (
                                      <button type="button" className="primary-btn" onClick={() => exportarPlaneamientoWord(planeamiento)}>Generar plantilla Word</button>
                                    )}
                                    <button
                                      type="button"
                                      style={{ ...secondaryButtonStyle, background: "#dbeafe", borderColor: "#93c5fd", color: "#1e3a8a", fontWeight: 800 }}
                                      onClick={() => void openEditPlaneamiento(planeamiento)}
                                      disabled={loadingPlaneamientoDetalleId === planeamientoId}
                                    >
                                      {loadingPlaneamientoDetalleId === planeamientoId ? "Abriendo..." : "Editar"}
                                    </button>
                                    <button
                                      type="button"
                                      style={{ ...secondaryButtonStyle, background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e", fontWeight: 800 }}
                                      onClick={() => handleDeletePlaneamiento(planeamiento.PlaneamientoId)}
                                      disabled={deletingPlaneamientoId === planeamientoId}
                                    >
                                      {deletingPlaneamientoId === planeamientoId ? "Procesando..." : "Desactivar"}
                                    </button>
                                    <button
                                      type="button"
                                      style={{ ...secondaryButtonStyle, background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b", fontWeight: 800 }}
                                      onClick={() => handleHardDeletePlaneamiento(planeamiento.PlaneamientoId)}
                                      disabled={deletingPlaneamientoId === planeamientoId}
                                    >
                                      {deletingPlaneamientoId === planeamientoId ? "Eliminando..." : "Eliminar"}
                                    </button>
                                    <button
                                      type="button"
                                      style={indicadorAccionStyle}
                                      onClick={() => togglePanelIndicadoresPlaneamiento(planeamientoId)}
                                    >
                                      {indicadorAccionLabel}
                                    </button>
                                  </div>
                                  {deletingPlaneamientoId === planeamientoId ? (
                                    <div style={{ marginTop: "8px", width: "280px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                                      <div style={{ width: `${deletingPlaneamientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #ef4444 0%, #f59e0b 100%)", transition: "width 240ms ease" }} />
                                    </div>
                                  ) : null}
                                </td>
                              </tr>

                              {panelOpen && (
                                <tr key={`indicadores-${planeamiento.PlaneamientoId}`} style={{ background: "#0b1728", color: "#e5eefb" }}>
                                  <td colSpan={4} style={{ padding: "12px" }}>
                                    <div style={{ display: "grid", gap: "12px", padding: "14px", border: "1px solid #bfdbfe", borderRadius: "16px", background: "#ffffff", color: "#0f172a" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                        <div>
                                          <h4 style={{ margin: "0 0 4px", color: "#0f172a" }}>
                                            {esDesdeHabilidades ? "Indicadores desde habilidades" : "Indicadores IA"} de: {planeamiento.Nombre}
                                          </h4>
                                          <p style={{ margin: 0, color: "#1e293b", fontWeight: 700, lineHeight: 1.45 }}>
                                            {esDesdeHabilidades
                                              ? "Se muestran los indicadores creados desde habilidades y sus niveles Avanzado, Intermedio e Inicial."
                                              : "Se toman los indicadores de evaluación de este planeamiento y se generan niveles Avanzado, Intermedio e Inicial."}
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
                                              {savingEval360PlaneamientoCambiosId === planeamientoId ? (
                                                <div style={{ width: "320px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                                                  <div style={{ width: `${savingEval360PlaneamientoCambiosProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                                                </div>
                                              ) : null}
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
                                              {deletingEval360PlaneamientoId === planeamientoId ? (
                                                <div style={{ width: "320px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                                                  <div style={{ width: `${deletingEval360PlaneamientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #ef4444 0%, #f59e0b 100%)", transition: "width 240ms ease" }} />
                                                </div>
                                              ) : null}
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {!tieneIndicadoresGenerados && !esDesdeHabilidades && (
                                        <>
                                      <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", display: "grid", gap: "4px" }}>
                                            <strong>Paso a paso</strong>
                                            <div>1. Elegí la plantilla IA de indicadores (opcional).</div>
                                            <div>2. Escribí indicaciones claras para la IA (opcional).</div>
                                            <div>3. Presioná “Generar indicadores con IA”.</div>
                                            <div>4. Revisá niveles (Avanzado, Intermedio, Inicial) y guardá cambios.</div>
                                          </div>
                                      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(340px, 420px)", gap: "10px", alignItems: "end" }}>
                                            <label style={{ display: "grid", gap: "6px" }}>
                                              <span style={{ fontWeight: 700, color: "#0f172a" }}>Plantilla IA de indicadores</span>
                                              <select value={eval360PlantillaIaIndicadorId} onChange={(event) => setEval360PlantillaIaIndicadorId(event.target.value)}>
                                                <option value="">Usar plantilla activa recomendada</option>
                                                {eval360PlantillasIaIndicadores.map((plantilla) => (
                                                  <option key={plantilla.Id} value={plantilla.Id}>
                                                    {plantilla.NombrePlantilla}{plantilla.TipoGeneracionIANombre ? ` (${plantilla.TipoGeneracionIANombre})` : ""}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                          </div>

                                          <div style={{ display: "grid", gap: "8px", padding: "8px", border: "1px solid #334155", borderRadius: "10px", background: "#000000", maxWidth: "420px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                              <strong style={{ color: "#ffffff", opacity: 1, WebkitTextFillColor: "#ffffff", textShadow: "0 0 1px rgba(255,255,255,0.35)" }}>Secciones</strong>
                                              <span style={requiredBadgeStyle}>Requerido</span>
                                            </div>
                                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", paddingBottom: "4px", borderBottom: "1px dashed #bfdbfe" }}>
                                              <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ffffff", opacity: 1, WebkitTextFillColor: "#ffffff", fontWeight: 600 }}>
                                                <input
                                                  type="checkbox"
                                                  style={{ width: "13px", height: "13px", margin: 0, accentColor: "#ffffff" }}
                                                  checked={
                                                    seccionesMismoGradoMateriaSeleccionado.length > 0
                                                    && (eval360GrupoIdsPorPlaneamiento[planeamientoId] || []).length === seccionesMismoGradoMateriaSeleccionado.length
                                                  }
                                                  onChange={(event) => {
                                                    setEval360GrupoIdsPorPlaneamiento((prev) => ({
                                                      ...prev,
                                                      [planeamientoId]: event.target.checked
                                                        ? seccionesMismoGradoMateriaSeleccionado.map((item) => String(item.GrupoId))
                                                        : []
                                                    }));
                                                  }}
                                                />
                                                <span style={{ color: "#ffffff", opacity: 1, WebkitTextFillColor: "#ffffff" }}>Seleccionar todas</span>
                                              </label>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(120px, 1fr))", gap: "4px 10px", border: "1px solid #475569", borderRadius: "8px", background: "#000000", padding: "6px 8px" }}>
                                              {seccionesMismoGradoMateriaSeleccionado.map((grupo) => {
                                                const checked = (eval360GrupoIdsPorPlaneamiento[planeamientoId] || []).includes(String(grupo.GrupoId));
                                                return (
                                                  <label key={`sec-ind-${planeamientoId}-${grupo.GrupoId}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px", color: "#ffffff", opacity: 1, WebkitTextFillColor: "#ffffff", fontWeight: 700, fontSize: "12px", whiteSpace: "nowrap", padding: "2px 4px", borderRadius: "6px", background: checked ? "#111111" : "transparent" }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      style={{ width: "13px", height: "13px", margin: 0, accentColor: "#ffffff" }}
                                                      onChange={(event) => {
                                                        const grupoId = String(grupo.GrupoId);
                                                        setEval360GrupoIdsPorPlaneamiento((prev) => {
                                                          const actuales = prev[planeamientoId] || [];
                                                          const next = event.target.checked
                                                            ? Array.from(new Set([...actuales, grupoId]))
                                                            : actuales.filter((item) => item !== grupoId);
                                                          return { ...prev, [planeamientoId]: next };
                                                        });
                                                      }}
                                                    />
                                                    <span style={{ color: "#ffffff", opacity: 1, WebkitTextFillColor: "#ffffff" }}>{grupo.GrupoNombre}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>

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

                                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                            <button
                                              type="button"
                                              className="primary-btn"
                                              onClick={() => generarEval360IndicadoresDesdePlaneamiento(planeamientoId)}
                                              disabled={generatingEval360PlaneamientoId === planeamientoId}
                                            >
                                              {generatingEval360PlaneamientoId === planeamientoId ? "Generando indicadores..." : "Generar indicadores con IA"}
                                            </button>
                                            <button
                                              type="button"
                                              style={secondaryButtonStyle}
                                              onClick={() => setEval360IndicadoresMinimizados((prev) => ({ ...prev, [planeamientoId]: true }))}
                                              disabled={generatingEval360PlaneamientoId === planeamientoId}
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                          {generatingEval360PlaneamientoId === planeamientoId ? (
                                            <div style={{ width: "320px", maxWidth: "100%", height: "10px", borderRadius: "999px", background: "#1e293b", overflow: "hidden", border: "1px solid #334155" }}>
                                              <div style={{ width: `${generatingEval360IndicadoresProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22d3ee 100%)", transition: "width 240ms ease" }} />
                                            </div>
                                          ) : null}
                                        </>
                                      )}

                                      {!indicadoresMinimizados && (tieneIndicadoresGenerados || esDesdeHabilidades) && (
                                        <div style={{ display: "grid", gap: "10px", padding: "10px", border: "1px solid #99f6e4", borderRadius: "12px", background: "#f0fdfa" }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                            <strong style={{ color: "#115e59" }}>Agregar más indicadores</strong>
                                            <button
                                              type="button"
                                              style={{ ...secondaryButtonStyle, background: "#ccfbf1", borderColor: "#5eead4", color: "#115e59", fontWeight: 900 }}
                                              onClick={() => updateIndicadorManualForm(planeamientoId, "open", !indicadorManualForm.open)}
                                            >
                                              {indicadorManualForm.open ? "Cerrar" : "Agregar indicador"}
                                            </button>
                                          </div>

                                          {indicadorManualForm.open && (
                                            <div style={{ display: "grid", gap: "10px" }}>
                                              <label style={{ display: "grid", gap: "6px", color: "#0f172a" }}>
                                                <span style={{ fontWeight: 800 }}>Indicador base</span>
                                                <textarea
                                                  value={indicadorManualForm.indicadorBase}
                                                  onChange={(event) => updateIndicadorManualForm(planeamientoId, "indicadorBase", event.target.value)}
                                                  rows={2}
                                                  placeholder="Escribí el indicador que se usará como base."
                                                  style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #99f6e4", borderRadius: "10px", padding: "10px" }}
                                                />
                                              </label>
                                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                                                <label style={{ display: "grid", gap: "6px", color: "#0f172a" }}>
                                                  <span style={{ fontWeight: 800, color: "#166534" }}>Avanzado</span>
                                                  <textarea value={indicadorManualForm.indicadorAvanzado} onChange={(event) => updateIndicadorManualForm(planeamientoId, "indicadorAvanzado", event.target.value)} rows={2} style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #99f6e4", borderRadius: "10px", padding: "10px" }} />
                                                </label>
                                                <label style={{ display: "grid", gap: "6px", color: "#0f172a" }}>
                                                  <span style={{ fontWeight: 800, color: "#92400e" }}>Intermedio</span>
                                                  <textarea value={indicadorManualForm.indicadorIntermedio} onChange={(event) => updateIndicadorManualForm(planeamientoId, "indicadorIntermedio", event.target.value)} rows={2} style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #99f6e4", borderRadius: "10px", padding: "10px" }} />
                                                </label>
                                                <label style={{ display: "grid", gap: "6px", color: "#0f172a" }}>
                                                  <span style={{ fontWeight: 800, color: "#991b1b" }}>Inicial</span>
                                                  <textarea value={indicadorManualForm.indicadorInicial} onChange={(event) => updateIndicadorManualForm(planeamientoId, "indicadorInicial", event.target.value)} rows={2} style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #99f6e4", borderRadius: "10px", padding: "10px" }} />
                                                </label>
                                              </div>
                                              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", color: "#0f172a" }}>
                                                {[
                                                  { key: "Cotidiano", label: "Trabajo cotidiano" },
                                                  { key: "Tareas", label: "Tareas" },
                                                  { key: "TablaEspecificaciones", label: "Tabla de especificaciones" }
                                                ].map((item) => (
                                                  <label key={`manual-tipo-${planeamientoId}-${item.key}`} style={{ display: "flex", gap: "6px", alignItems: "center", fontWeight: 800 }}>
                                                    <input
                                                      type="checkbox"
                                                      checked={indicadorManualForm.tiposUso.includes(item.key)}
                                                      onChange={() => toggleIndicadorManualTipoUso(planeamientoId, item.key)}
                                                    />
                                                    {item.label}
                                                  </label>
                                                ))}
                                              </div>
                                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                                <button
                                                  type="button"
                                                  className="primary-btn"
                                                  onClick={() => agregarIndicadorManualPlaneamiento(planeamientoId, Number(indicadoresPlaneamiento[0]?.EstructuraGrupoId || eval360Estructura?.estructura?.EstructuraGrupoId || 0))}
                                                  disabled={savingIndicadorManualPlaneamientoId === planeamientoId}
                                                >
                                                  {savingIndicadorManualPlaneamientoId === planeamientoId ? "Guardando..." : "Guardar indicador"}
                                                </button>
                                                <button
                                                  type="button"
                                                  style={secondaryButtonStyle}
                                                  onClick={() => setIndicadorManualPorPlaneamiento((prev) => ({ ...prev, [planeamientoId]: { ...initialIndicadorManualForm, tiposUso: [...DEFAULT_TIPOS_USO_INDICADORES] } }))}
                                                  disabled={savingIndicadorManualPlaneamientoId === planeamientoId}
                                                >
                                                  Cancelar
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
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
                                                    <strong style={{ color: "#334155" }}>{esDesdeHabilidades ? "Indicador base desde habilidad" : "Indicador base del planeamiento"}</strong>
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
                                        ) : tieneIndicadoresGenerados && (!indicadoresPlaneamientoCargados || loadingEval360Indicadores) ? (
                                          <div style={{ padding: "12px", borderRadius: "12px", background: "#eff6ff", color: "#1e3a8a", border: "1px solid #bfdbfe", fontWeight: 800 }}>
                                            Cargando indicadores generados con IA...
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
                    <h4 style={{ margin: "0 0 4px", color: "#f8fafc", fontWeight: 900, fontSize: "20px" }}>Tabla de Especificaciones y Exámenes</h4>
                    <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 700 }}>
                      Gestioná la matriz y las tablas por prueba.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => {
                        if (tablaEspecificacionesFormOpen) {
                          cancelarCreacionTablaEspecificaciones();
                          return;
                        }
                        setTablaEditandoActividadId(null);
                        setTablaActividadIdsSeleccionadas([]);
                        setTablaPruebasConfirmadas(false);
                        setTablaPlaneamientoIds([]);
                        setTablaPlaneamientosConfirmados(false);
                        setTablaPruebaSeleccionadaId("");
                        setTablaEspecificacionesFormOpen(true);
                        setTablaEspecificacionEditando(false);
                        setTablaMatrizEditando(true);
                        setTablaMatrizMinimizada(true);
                        setTablaFormatoMinimizado(false);
                      }}
                      disabled={loadingSeguimiento || !selected}
                    >
                      {tablaEspecificacionesFormOpen ? "Ocultar tabla de especificaciones" : "Agregar tabla de especificaciones"}
                    </button>
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      onClick={() => {
                        setTablaVerGuardadasOpen((prev) => {
                          return !prev;
                        });
                      }}
                      disabled={loadingSeguimiento || !selected}
                    >
                      {tablaVerGuardadasOpen ? "Ocultar lista de tablas guardadas" : "Ver tablas de especificaciones guardadas"}
                    </button>
                  </div>
                </div>

                {loadingSeguimiento ? (
                  <div style={{ padding: "12px", borderRadius: "12px", background: "#0b305f", border: "1px solid #3b82f6", color: "#dbeafe", fontWeight: 700 }}>
                    Cargando exámenes e indicadores...
                  </div>
                ) : null}

                {tablaEspecificacionesFormOpen ? (
                  <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #2563eb", background: "#0a1f3d" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ color: "#f8fafc" }}>Avance de la tabla de especificaciones</strong>
                      <span style={{ color: "#dbeafe", fontWeight: 800 }}>{tablaProgresoPct}% completado</span>
                    </div>
                    <div style={{ width: "100%", height: "12px", borderRadius: "999px", background: "#12345e", overflow: "hidden", border: "1px solid #3b82f6" }}>
                      <div style={{ width: `${tablaProgresoPct}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                      {[
                        { label: "Paso 1.1", done: tablaPaso0Completo },
                        { label: "Paso 1.2", done: tablaPaso1Completo },
                        { label: "Paso 1.3", done: tablaPaso2Completo },
                        { label: "Paso 1.4", done: tablaPaso3Completo }
                      ].map((item) => (
                        <div key={item.label} style={{ padding: "8px 10px", borderRadius: "10px", border: `1px solid ${item.done ? "#86efac" : "#93c5fd"}`, background: item.done ? "#dcfce7" : "#eff6ff", color: item.done ? "#166534" : "#1d4ed8", fontWeight: 800, textAlign: "center" }}>
                          {item.done ? `${item.label} completado` : `${item.label} pendiente`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {tablaVerGuardadasOpen ? (
                <div style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: "1px solid #1f3b63", background: "#0b2342" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <strong style={{ color: "#f8fafc" }}>Lista de Tablas de especificaciones guardadas</strong>
                  </div>
                  {!tablaPruebasGuardadasTodas.length ? (
                    <small style={{ color: "#cbd5e1" }}>No hay tablas de especificaciones creadas.</small>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {tablaPruebasGuardadasTodas.map((actividad) => {
                        const idx = tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividad.ActividadId));
                        const examenesPorTabla = examenesCreados.filter((ex) => String(ex.actividadIdTabla) === String(actividad.ActividadId));
                        const tablaGuardadaMinimizada = !!tablaGuardadasItemsMinimizados[Number(actividad.ActividadId)];
                        return (
                          <div key={`tabla-guardada-${actividad.ActividadId}`} style={{ display: "grid", gap: "8px", border: "1px solid #2b4e7a", borderRadius: "10px", padding: "8px 10px", background: "#0a1f3d" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                              <span style={{ color: "#f8fafc", fontWeight: 700 }}>{getPruebaExamenLabel(actividad)}</span>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="primary-btn"
                                  onClick={() => abrirGeneradorExamenParaTabla(actividad)}
                                  disabled={savingSeguimiento}
                                  style={{ background: "#0f766e", borderColor: "#0f766e", color: "#ffffff" }}
                                >
                                  Generar Examen
                                </button>
                                <button
                                  type="button"
                                  style={{ ...secondaryButtonStyle, background: "#eff6ff", borderColor: "#60a5fa", color: "#1d4ed8" }}
                                  onClick={() => descargarTablaEspecificacionesExcel(Number(actividad.ActividadId))}
                                  disabled={savingSeguimiento}
                                >
                                  Descargar Tabla de especificaciones
                                </button>
                                <button
                                  type="button"
                                  style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }}
                                  onClick={() => {
                                    const actividadId = Number(actividad.ActividadId);
                                    setTablaGuardadasItemsMinimizados((prev) => {
                                      const next = !prev[actividadId];
                                      if (next) {
                                        setTablaEspecificacionesFormOpen(false);
                                        setTablaEditandoActividadId(null);
                                      }
                                      return { ...prev, [actividadId]: next };
                                    });
                                  }}
                                >
                                  {tablaGuardadaMinimizada ? "Maximizar" : "Minimizar"}
                                </button>
                                <button
                                  type="button"
                                  style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }}
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
                                  style={{ ...secondaryButtonStyle, background: "#fef2f2", borderColor: "#fca5a5", color: "#b91c1c" }}
                                  onClick={() => eliminarTablaEspecificaciones(Number(actividad.ActividadId))}
                                  disabled={savingSeguimiento}
                                >
                                  {savingSeguimiento && savingSeguimientoModo === "eliminar" && Number(tablaEliminandoActividadId || 0) === Number(actividad.ActividadId) ? "Eliminando..." : "Eliminar"}
                                </button>
                              </div>
                            </div>
                            {savingSeguimiento && savingSeguimientoModo === "eliminar" && Number(tablaEliminandoActividadId || 0) === Number(actividad.ActividadId) ? (
                              <div style={{ display: "grid", gap: "6px", paddingTop: "4px" }}>
                                <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                                  Eliminando esta tabla en todas las secciones del mismo grado...
                                </div>
                                <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#dbeafe", overflow: "hidden", border: "1px solid #93c5fd" }}>
                                  <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                                </div>
                                <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "13px" }}>
                                  {savingSeguimientoProgress}% completado
                                </div>
                              </div>
                            ) : null}
                            {tablaGuardadaMinimizada ? (
                              <div style={{ padding: "10px", border: "1px dashed #2b4e7a", borderRadius: "10px", color: "#cbd5e1", background: "#081a33" }}>
                                Tabla minimizada. Hay {examenesPorTabla.length} examen(es) generado(s) para esta tabla.
                              </div>
                            ) : examenesPorTabla.length ? (
                              <div style={{ display: "grid", gap: "6px", paddingTop: "4px" }}>
                                {examenesPorTabla.map((ex) => (
                                  <div id={`examen-tabla-${ex.id}`} key={`examen-tabla-${ex.id}`} style={{ display: "grid", gap: "8px", padding: "8px 10px", borderRadius: "10px", border: "1px solid #1f3b63", background: "#081a33" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                                      <div style={{ display: "grid", gap: "2px" }}>
                                        <strong style={{ color: "#f8fafc" }}>{ex.nombre}</strong>
                                        <small style={{ color: "#cbd5e1" }}>Generado: {ex.creadoEn}</small>
                                      </div>
                                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                        <button type="button" style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }} onClick={() => abrirGeneradorExamenParaTabla(actividad, ex)}>Editar examen</button>
                                        <button type="button" style={{ ...secondaryButtonStyle, background: "#ecfeff", borderColor: "#67e8f9", color: "#155e75" }} onClick={() => descargarExamenWord(ex.id)}>Ver Examen en Word</button>
                                        <button type="button" style={{ ...secondaryButtonStyle, background: "#f5f3ff", borderColor: "#c4b5fd", color: "#5b21b6" }} onClick={() => descargarExamenWord(ex.id, "respuestas")}>Ver Respuestas en Word</button>
                                        <button
                                          type="button"
                                          style={{ ...secondaryButtonStyle, background: "#fef2f2", borderColor: "#fca5a5", color: "#b91c1c" }}
                                          onClick={() => eliminarExamenCreado(ex.id, String(actividad.ActividadId))}
                                          disabled={generandoExamenIa}
                                        >
                                          {savingExamenIaMode === "eliminar" && String(deletingExamenIaId) === String(ex.id) ? "Eliminando..." : "Eliminar"}
                                        </button>
                                      </div>
                                    </div>
                                    {savingExamenIaMode === "eliminar" && String(deletingExamenIaId) === String(ex.id) ? (
                                      <div style={{ display: "grid", gap: "6px" }}>
                                        <div style={{ color: "#fecaca", fontWeight: 800 }}>
                                          Eliminando examen...
                                        </div>
                                        <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#fee2e2", overflow: "hidden", border: "1px solid #fca5a5" }}>
                                          <div style={{ width: `${savingExamenIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #f97316 0%, #ef4444 100%)", transition: "width 240ms ease" }} />
                                        </div>
                                        <div style={{ color: "#fca5a5", fontWeight: 700, fontSize: "13px" }}>
                                          {savingExamenIaProgress}% completado
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                ) : null}

                <div
                  ref={generadorExamenRef}
                  style={{
                    display: crearExamenesOpen && !!examenTablaActivaId ? "grid" : "none",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "16px",
                    border: "1px solid #1f3b63",
                    background: "#0b2342",
                    width: "100%",
                    overflowY: "auto",
                    marginTop: "8px",
                    boxShadow: "0 24px 60px rgba(2, 6, 23, 0.45)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <strong style={{ color: "#f8fafc" }}>Generacion de Examen a partir de una tabla de especificaciones</strong>
                    <button type="button" style={secondaryButtonStyle} onClick={() => { setCrearExamenesOpen(false); setExamenTablaActivaId(""); setEditingExamenId(""); setExamenIaGeneradoId(""); }}>
                      Cerrar
                    </button>
                  </div>

                    <div style={{ display: "grid", gap: "10px", fontSize: "15px" }}>
                      {generandoExamenIa && savingExamenIaMode ? (
                        <div style={{ display: "grid", gap: "6px", padding: "10px 12px", borderRadius: "12px", border: "1px solid #3b82f6", background: "#082f49" }}>
                          <div style={{ color: "#e0f2fe", fontWeight: 800 }}>
                            {savingExamenIaMode === "generar"
                              ? "Generando examen..."
                              : (savingExamenIaMode === "guardar" ? "Guardando examen..." : "Eliminando examen...")}
                          </div>
                          {savingExamenIaPhase ? (
                            <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "13px" }}>
                              {savingExamenIaPhase}
                            </div>
                          ) : null}
                          <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#dbeafe", overflow: "hidden", border: "1px solid #93c5fd" }}>
                            <div style={{ width: `${savingExamenIaProgress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                          </div>
                          <div style={{ color: "#bfdbfe", fontWeight: 700, fontSize: "13px" }}>
                            {savingExamenIaProgress}% completado{savingExamenIaElapsedSeconds ? ` · ${formatProgressElapsed(savingExamenIaElapsedSeconds)}` : ""}
                          </div>
                        </div>
                      ) : null}
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
                          {generandoExamenIa
                            ? (savingExamenIaMode === "guardar" ? "Guardando..." : "Generando...")
                            : (examenIaGeneradoId || editingExamenId ? "Guardar examen" : "Generar examen")}
                        </button>
                        {examenIaGeneradoId || editingExamenId ? (
                          <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord(editingExamenId || examenIaGeneradoId)}>
                            Ver Examen en Word
                          </button>
                        ) : null}
                        {examenIaGeneradoId || editingExamenId ? (
                          <button type="button" style={secondaryButtonStyle} onClick={() => descargarExamenWord((editingExamenId || examenIaGeneradoId), "respuestas")}>
                            Ver Respuestas en Word
                          </button>
                        ) : null}
                        <button type="button" style={secondaryButtonStyle} onClick={() => { setCrearExamenesOpen(false); setExamenIaGeneradoId(""); setExamenIaResultadoDraft(""); setEditingExamenId(""); }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                </div>

                {tablaEspecificacionesFormOpen ? (
                <>
                <div style={{ display: "grid", gap: "10px", padding: "12px", borderRadius: "12px", border: `1px solid ${tablaPaso0Completo ? "#166534" : "#1f3b63"}`, background: tablaPaso0Completo ? "#052e16" : "#0b2342" }}>
                  {tablaEditandoActividadId ? (
                    <div style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1e3a8a", fontWeight: 800 }}>
                      Estás editando: {(() => {
                        const actividadEditando = tablaActividadesExamen.find((item) => Number(item.ActividadId) === Number(tablaEditandoActividadId));
                        return actividadEditando ? getPruebaExamenLabel(actividadEditando) : `Prueba (examen) ${tablaEditandoActividadId}`;
                      })()}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#f8fafc" }}>Paso 1.1: Escoger una o varias pruebas o examenes</strong>
                      <span style={{ background: tablaPaso0Completo ? "#dcfce7" : "#dbeafe", color: tablaPaso0Completo ? "#166534" : "#1d4ed8", border: `1px solid ${tablaPaso0Completo ? "#86efac" : "#93c5fd"}`, borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                        {tablaPaso0Completo ? "Completado" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                  <small style={{ color: "#cbd5e1" }}>
                    Antes de todo, escogé si querés trabajar la tabla de especificaciones para Prueba (examen) 1, Prueba (examen) 2 o las que correspondan. Podés seleccionar una o varias.
                  </small>
                  {!tablaActividadesExamen.length ? (
                    <small style={{ color: "#cbd5e1" }}>No hay pruebas de Exámenes configuradas para esta sección.</small>
                  ) : (
                    <div style={{ display: "grid", gap: "8px", maxWidth: "640px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: "#f8fafc", fontWeight: 700 }}>Pruebas disponibles (Paso 1.1)</span>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }}
                            onClick={() => {
                              setTablaActividadIdsSeleccionadas(tablaActividadesDisponiblesPaso0.map((actividad) => String(actividad.ActividadId)));
                              setTablaPruebasConfirmadas(false);
                              setTablaPlaneamientosConfirmados(false);
                            }}
                            disabled={savingSeguimiento || !tablaActividadesDisponiblesPaso0.length}
                          >
                            Seleccionar todas
                          </button>
                          <button
                            type="button"
                            style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }}
                            onClick={() => {
                              setTablaActividadIdsSeleccionadas([]);
                              setTablaPruebasConfirmadas(false);
                              setTablaPlaneamientosConfirmados(false);
                            }}
                            disabled={savingSeguimiento || !tablaActividadIdsSeleccionadas.length}
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {tablaActividadesExamen.map((actividad) => {
                          const actividadId = String(actividad.ActividadId);
                          const checked = tablaActividadIdsSeleccionadas.includes(actividadId);
                          const bloqueadaPorTablaGuardada = Number(tablaEditandoActividadId || 0) !== Number(actividad.ActividadId) && Boolean(tablaActividadParametrizadaMap.get(Number(actividad.ActividadId)));
                          return (
                            <label
                              key={`tabla-act-${actividad.ActividadId}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "10px 12px",
                                borderRadius: "10px",
                                border: `1px solid ${bloqueadaPorTablaGuardada ? "#94a3b8" : checked ? "#67e8f9" : "#94a3b8"}`,
                                background: bloqueadaPorTablaGuardada ? "#e2e8f0" : checked ? "#ecfeff" : "#ffffff",
                                color: bloqueadaPorTablaGuardada ? "#64748b" : "#0f172a",
                                cursor: bloqueadaPorTablaGuardada ? "not-allowed" : "pointer",
                                opacity: bloqueadaPorTablaGuardada ? 0.85 : 1
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={savingSeguimiento || bloqueadaPorTablaGuardada}
                                onChange={() => {
                                  setTablaActividadIdsSeleccionadas((prev) => (
                                    prev.includes(actividadId)
                                      ? prev.filter((id) => id !== actividadId)
                                      : [...prev, actividadId]
                                  ));
                                  setTablaPruebasConfirmadas(false);
                                  setTablaPlaneamientosConfirmados(false);
                                }}
                              />
                              <div style={{ display: "grid", gap: "2px" }}>
                                <span style={{ fontWeight: 700 }}>{getPruebaExamenLabel(actividad)}</span>
                                {bloqueadaPorTablaGuardada ? (
                                  <small style={{ color: "#475569", fontWeight: 700 }}>Tabla de especificaciones ya creada</small>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={confirmarPruebasTabla}
                          disabled={!tablaActividadIdsSeleccionadas.length}
                          style={tablaPaso0Completo ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff", opacity: 0.9 } : undefined}
                        >
                          {tablaPaso0Completo ? "Guardado" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          style={{ ...secondaryButtonStyle, background: "#f8fafc", borderColor: "#94a3b8", color: "#0f172a" }}
                          onClick={cancelarCreacionTablaEspecificaciones}
                          disabled={savingSeguimiento}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {!crearExamenesOpen && tablaPaso0Completo ? (
                <>
                <div style={{ display: "grid", gap: "6px", maxWidth: "640px", padding: "12px", borderRadius: "12px", border: `1px solid ${tablaPaso1Completo ? "#166534" : "#93c5fd"}`, background: tablaPaso1Completo ? "#052e16" : "#0b2342" }}>
                  <span style={{ color: "#f8fafc", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span>Paso 1.2: Escoger los planeamientos a evaluar</span>
                    <span style={{ background: tablaPaso1Completo ? "#dcfce7" : "#dbeafe", color: tablaPaso1Completo ? "#166534" : "#1d4ed8", border: `1px solid ${tablaPaso1Completo ? "#86efac" : "#93c5fd"}`, borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                      {tablaPaso1Completo ? "Completado" : "Pendiente"}
                    </span>
                  </span>
                  <select
                    multiple
                    size={Math.min(6, Math.max(3, (seguimientoContexto?.planeamientos || []).length || 3))}
                    style={{ color: "#0f172a", background: "#ffffff", border: "1px solid #94a3b8", borderRadius: "10px", padding: "9px 10px" }}
                    value={tablaPlaneamientoIds}
                    onChange={(event) => {
                      const ids = Array.from(event.target.selectedOptions).map((opt) => opt.value);
                      setTablaPlaneamientoIds(ids);
                      setTablaPlaneamientosConfirmados(false);
                    }}
                  >
                    {(seguimientoContexto?.planeamientos || []).map((planeamiento) => (
                      <option key={planeamiento.PlaneamientoId} value={planeamiento.PlaneamientoId}>{planeamiento.Nombre}</option>
                    ))}
                  </select>
                  <small style={{ color: "#cbd5e1" }}>Escogé uno o varios planeamientos. Al darle Guardar, se abrirá el Paso 1.3 para asignar los indicadores por prueba.</small>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={confirmarPlaneamientosTabla}
                      disabled={!tablaPaso0Completo || !tablaPlaneamientoIds.length}
                      style={tablaPaso1Completo ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff", opacity: 0.9 } : undefined}
                    >
                      {tablaPaso1Completo ? "Guardado" : "Guardar"}
                    </button>
                  </div>
                </div>

                {!tablaPaso0Completo ? (
                  <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1e3a8a", fontWeight: 700 }}>
                    Guarda primero la seleccion de una o varias pruebas o examenes para habilitar el Paso 1.2.
                  </div>
                ) : null}

                {tablaPaso1Completo && tablaPlaneamientosSeleccionados.length ? (
                  <div style={{ display: "grid", gap: "6px", padding: "12px 14px", borderRadius: "12px", border: `1px solid ${tablaPaso2Completo ? "#86efac" : "#93c5fd"}`, background: tablaPaso2Completo ? "#ecfdf3" : "#eff6ff", color: "#0f172a" }}>
                    <strong style={{ color: "#1d4ed8" }}>
                      Planeamientos seleccionados: {tablaPlaneamientosSeleccionados.map((planeamiento) => planeamiento.Nombre).join(", ")}
                    </strong>
                    <span style={{ color: "#334155", fontWeight: 600 }}>
                      Se encontraron {tablaIndicadoresEspecificaciones.length} indicadores para asignar en la matriz del Paso 1.3.
                    </span>
                  </div>
                ) : null}

                {tablaPaso1Completo ? (
                <div ref={tablaMatrizRef} style={{ display: "grid", gap: "8px", padding: "12px", borderRadius: "12px", border: `1px solid ${tablaPaso2Completo ? "#166534" : tablaPaso2Activo ? "#2563eb" : "#1f3b63"}`, background: tablaPaso2Completo ? "#052e16" : "#0b2342", scrollMarginTop: "110px" }}>
                  {tablaEditandoActividadId ? (
                    <div style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1e3a8a", fontWeight: 800 }}>
                      Matriz correspondiente a: {(() => {
                        const actividadEditando = tablaActividadesExamen.find((item) => Number(item.ActividadId) === Number(tablaEditandoActividadId));
                        return actividadEditando ? getPruebaExamenLabel(actividadEditando) : `Prueba (examen) ${tablaEditandoActividadId}`;
                      })()}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong style={{ color: "#f8fafc" }}>Paso 1.3: Matriz de asignacion por prueba</strong>
                      <span style={{ background: tablaPaso2Completo ? "#dcfce7" : tablaPaso2Activo ? "#dbeafe" : "#fef3c7", color: tablaPaso2Completo ? "#166534" : tablaPaso2Activo ? "#1d4ed8" : "#92400e", border: `1px solid ${tablaPaso2Completo ? "#86efac" : tablaPaso2Activo ? "#93c5fd" : "#fcd34d"}`, borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                        {tablaPaso2Completo ? "Completado" : tablaPaso2Activo ? "En proceso" : "Pendiente de asignar"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {tablaPaso2Completo ? (
                        <>
                          <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() => setTablaMatrizEditando(true)}
                            disabled={savingSeguimiento || !tablaActividadesObjetivo.length}
                          >
                            Editar
                          </button>
                          <button type="button" style={secondaryButtonStyle} onClick={() => setTablaMatrizMinimizada(true)}>Minimizar</button>
                          <button type="button" style={secondaryButtonStyle} onClick={() => setTablaMatrizMinimizada(false)}>Maximizar</button>
                        </>
                      ) : null}
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
                      Matriz minimizada. Hay {tablaIndicadoresEspecificaciones.length} indicadores y {tablaActividadesObjetivo.length} pruebas seleccionadas.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", border: "1px solid #93c5fd", borderRadius: "10px", background: "#f8fbff", boxShadow: "inset 0 0 0 1px rgba(148, 163, 184, 0.18)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", color: "#0f172a", background: "#f8fbff", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#dbeafe" }}>
                            <th style={{ padding: "10px 8px", textAlign: "left", minWidth: "260px", color: "#0f172a", borderBottom: "1px solid #93c5fd" }}>Aprendizaje / Indicador</th>
                            {tablaActividadesObjetivo.map((actividad) => (
                              <th key={`tabla-head-${actividad.ActividadId}`} style={{ padding: "10px 8px", textAlign: "center", minWidth: "220px", color: "#0f172a", borderBottom: "1px solid #93c5fd" }}>
                                <div style={{ fontWeight: 800, color: "#0f172a" }}>{getPruebaLabel(actividad, tablaActividadesExamen.findIndex((a) => Number(a.ActividadId) === Number(actividad.ActividadId)))}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tablaIndicadoresRender.map((indicador) => {
                            const indicadorId = Number(indicador.IndicadorGrupoId);
                            const bloqueado = !tablaMatrizEditando || seguimientoIndicadorTieneCalificacion(indicadorId) || tablaIndicadoresUsadosGuardados.has(indicadorId);
                            return (
                              <tr key={`tabla-ind-${indicadorId}`} style={{ background: bloqueado ? "#f8fafc" : "#ffffff" }}>
                                <td style={{ padding: "10px 8px", borderTop: "1px solid #dbeafe", color: "#0f172a" }}>
                                  <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.45 }}>{indicador.IndicadorBase}</div>
                                  <small style={{ color: "#334155", fontWeight: 600 }}>{indicador.PlaneamientoNombre || "Planeamiento"}</small>
                                </td>
                                {tablaActividadesObjetivo.map((actividad) => {
                                  const actividadId = Number(actividad.ActividadId);
                                  const checked = getTablaIndicadoresAsignadosActividad(actividadId).includes(indicadorId);
                                  return (
                                    <td key={`tabla-${indicadorId}-${actividadId}`} style={{ textAlign: "center", padding: "10px 8px", borderTop: "1px solid #dbeafe", background: bloqueado ? "#f8fafc" : "#ffffff" }}>
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
                              <td colSpan={Math.max(2, tablaActividadesObjetivo.length + 1)} style={{ padding: "12px 10px", color: "#334155", background: "#ffffff" }}>
                                {tablaPlaneamientosSeleccionados.length
                                  ? `No hay indicadores de Tabla de especificaciones para asignar en: ${tablaPlaneamientosSeleccionados.map((planeamiento) => planeamiento.Nombre).join(", ")}.`
                                  : "No hay indicadores de tipo Tabla de especificaciones para asignar."}
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
                  {savingSeguimiento && savingSeguimientoModo === "actividad" ? (
                    <div style={{ display: "grid", gap: "6px" }}>
                      <div style={{ color: "#dbeafe", fontWeight: 800 }}>
                        Guardando matriz de asignacion...
                      </div>
                      <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#12345e", overflow: "hidden", border: "1px solid #3b82f6" }}>
                        <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                      </div>
                      <div style={{ color: "#e0f2fe", fontWeight: 700, fontSize: "13px" }}>
                        {savingSeguimientoProgress}% completado
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-start" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={guardarMatrizAsignacionPruebas}
                      disabled={savingSeguimiento || !tablaActividadesObjetivo.length || !tablaMatrizEditando}
                      style={savedSeguimientoModo === "actividad" || !tablaMatrizEditando ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff", opacity: 0.9 } : undefined}
                    >
                      {savingSeguimiento && savingSeguimientoModo === "actividad" ? "Guardando..." : (!tablaMatrizEditando ? "Guardado" : "Guardar")}
                    </button>
                  </div>
                </div>
                ) : null}

                {tablaPaso3Habilitado && Number(tablaPruebaSeleccionadaId || 0) > 0 ? (
                  <div style={{ display: "grid", gap: "10px", padding: "12px", border: `1px solid ${tablaPaso3Completo ? "#86efac" : "#cbd5e1"}`, borderRadius: "12px", background: tablaPaso3Completo ? "#f0fdf4" : "#ffffff", color: "#0f172a", opacity: 1, pointerEvents: tablaEspecificacionEditando ? "auto" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <strong style={{ color: "#0f172a" }}>Paso 1.4: Asignacion de Puntaje a los Indicadores</strong>
                        <span style={{ background: tablaPaso3Completo ? "#dcfce7" : "#fef3c7", color: tablaPaso3Completo ? "#166534" : "#92400e", border: `1px solid ${tablaPaso3Completo ? "#86efac" : "#fcd34d"}`, borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 800 }}>
                          {tablaPaso3Completo ? "Completado" : `Pendientes: ${tablaPruebasPendientes.length}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {tablaEspecificacionesGuardadas ? (
                          <>
                            <button type="button" style={secondaryButtonStyle} onClick={() => setTablaEspecificacionEditando(true)} disabled={savingSeguimiento || !tablaActividadesObjetivo.length}>
                              Editar
                            </button>
                            <button type="button" style={{ ...secondaryButtonStyle, borderColor: "#fecaca", color: "#991b1b" }} onClick={() => eliminarTablaEspecificaciones(Number(tablaPruebaSeleccionadaId || tablaEditandoActividadId || 0) || undefined)} disabled={savingSeguimiento || (!tablaEspecificacionesGuardadas && !tablaEditandoActividadId)}>
                              {savingSeguimiento && savingSeguimientoModo === "eliminar" ? "Eliminando..." : "Eliminar"}
                            </button>
                            <button type="button" style={secondaryButtonStyle} onClick={() => setTablaFormatoMinimizado(true)}>Minimizar</button>
                            <button type="button" style={secondaryButtonStyle} onClick={() => setTablaFormatoMinimizado(false)}>Maximizar</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {savingSeguimiento && savingSeguimientoModo === "eliminar" ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ color: "#991b1b", fontWeight: 800 }}>
                          Eliminando la tabla de especificaciones de esta prueba y de las secciones del mismo grado...
                        </div>
                        <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#fee2e2", overflow: "hidden", border: "1px solid #fca5a5" }}>
                          <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #f97316 0%, #ef4444 100%)", transition: "width 240ms ease" }} />
                        </div>
                        <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: "13px" }}>
                          {savingSeguimientoProgress}% completado
                        </div>
                      </div>
                    ) : null}
                    <div style={{ marginBottom: "2px", color: "#334155", fontWeight: 700 }}>
                      Nombre de guardado: {getNombreGuardadoTabla()}
                    </div>
                    {(() => {
                      const actividadActual = tablaActividadesExamen.find((item) => Number(item.ActividadId) === Number(tablaPruebaSeleccionadaId || tablaEditandoActividadId || 0));
                      return actividadActual ? (
                        <div style={{ marginBottom: "6px", padding: "10px 12px", borderRadius: "10px", border: "1px solid #93c5fd", background: "#eff6ff", color: "#1e3a8a", fontWeight: 800 }}>
                          Estás trabajando en: {getPruebaExamenLabel(actividadActual)}
                        </div>
                      ) : null;
                    })()}
                    {!tablaEspecificacionEditando ? (
                      <div style={{ marginBottom: "6px", color: "#334155", fontWeight: 700 }}>
                        Modo lectura. Usá "Editar" para habilitar cambios.
                      </div>
                    ) : null}
                    {!tablaValidacionPruebaSeleccionada.coincide ? (
                      <div style={{ marginBottom: "6px", color: "#991b1b", fontWeight: 700 }}>
                        {tablaValidacionPruebaSeleccionada.filasIncompletas > 0
                        ? `No se puede guardar: hay ${tablaValidacionPruebaSeleccionada.filasIncompletas} fila(s) incompleta(s) o con restricción inválida. Debés indicar ítem, cantidad de preguntas y puntos del indicador. Además: SR = 1 punto; RC/C/I = entre 1 y 5 puntos.`
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
                            ? tablaActividadesObjetivo.filter((a) => Number(a.ActividadId) === Number(tablaEditandoActividadId))
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
                        <option value="ANTES">Después de la Prueba</option>
                        <option value="DESPUES">Antes de la Prueba</option>
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
                    <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "10px", background: "#ffffff" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", color: "#0f172a", background: "#ffffff" }}>
                        <thead>
                          <tr style={{ background: "#dbeafe" }}>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "200px", fontSize: "16px", color: "#0f172a" }}>Aprendizaje</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "260px", fontSize: "16px", color: "#0f172a" }}>Indicadores</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "110px", color: "#0f172a" }}>Número de lecciones</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", minWidth: "80px", color: "#0f172a" }}>Puntos</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Selección de respuesta</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Respuesta corta</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Correspondencia</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Identificación</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Resolución de ejercicios</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a", minWidth: "210px" }}>Resolucion de Casos y Problemas</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Respuesta restringida</th>
                            <th style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }}>Producción escrita</th>
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
                            const restriccionesFila = getTablaRestriccionesDetalle(detalle);
                            const sinPuntosAntes = tablaTipoFormato === "ANTES" && !(Number.isFinite(puntosFormula) && puntosFormula > 0);
                            const leccionesManualNum = Number(String(detalle.numeroLecciones || "0").replace(",", "."));
                            const sumaItemsFila = getPuntosPorItems(detalle);
                            const filaIncompleta = itemCampos.some((c) => isItemParIncompleto(c.cantidad, c.valor))
                              || restriccionesFila.length > 0
                              || (tablaTipoFormato === "DESPUES" && (!Number.isInteger(leccionesManualNum) || leccionesManualNum <= 0 || Number(sumaItemsFila) !== Number(puntosFormula)))
                              || sinPuntosAntes;
                            return (
                              <tr key={`fmt-${indicador.IndicadorGrupoId}-${idx}`} style={{ background: filaIncompleta ? "#fff1f2" : (idx % 2 === 0 ? "#ffffff" : "#f8fbff") }}>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", fontSize: "15px", color: "#0f172a", fontWeight: 600 }}>{aprendizaje}</td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", fontSize: "15px", color: "#0f172a" }}>{indicador.IndicadorBase}</td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={tablaTipoFormato === "ANTES" ? String(Math.round(Number(leccionesFormula || 0))) : String(Number(leccionesFormula || 0))}
                                    readOnly={tablaTipoFormato === "ANTES"}
                                    onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "numeroLecciones", e.target.value)}
                                    title={tablaTipoFormato === "ANTES" ? "Número de lecciones calculado automáticamente." : "Número de lecciones del indicador (entero mayor a 0)."}
                                    style={{ width: "80px", textAlign: "center", background: tablaTipoFormato === "ANTES" ? "#f1f5f9" : "#ffffff", color: "#0f172a", border: "1px solid #94a3b8" }}
                                  />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={String(Number(puntosFormula || 0))}
                                    readOnly
                                    title={tablaTipoFormato === "ANTES" ? "Puntos del indicador calculados desde ítems (cantidad x valor)." : "Puntos del indicador calculados con la fórmula: (puntos totales / lecciones totales) * lecciones del indicador."}
                                    style={{ width: "80px", textAlign: "center", background: "#f1f5f9", color: "#0f172a", border: "1px solid #94a3b8" }}
                                  />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Selección de respuesta: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.seleccionRespuestaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "seleccionRespuestaCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title={`Selección de respuesta: Valor por pregunta. ${getTablaPuntajeHint("SR")}`} type="text" inputMode="numeric" value={detalle.seleccionRespuestaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "seleccionRespuestaPuntos", e.target.value)} style={getTablaPuntajeInputStyle("SR", detalle.seleccionRespuestaCantidad, detalle.seleccionRespuestaPuntos)} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Respuesta corta: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.respuestaCortaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaCortaCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title={`Respuesta corta: Valor por pregunta. ${getTablaPuntajeHint("RC")}`} type="text" inputMode="numeric" value={detalle.respuestaCortaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaCortaPuntos", e.target.value)} style={getTablaPuntajeInputStyle("RC", detalle.respuestaCortaCantidad, detalle.respuestaCortaPuntos)} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Correspondencia: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.correspondenciaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "correspondenciaCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title={`Correspondencia: Valor por pregunta. ${getTablaPuntajeHint("C")}`} type="text" inputMode="numeric" value={detalle.correspondenciaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "correspondenciaPuntos", e.target.value)} style={getTablaPuntajeInputStyle("C", detalle.correspondenciaCantidad, detalle.correspondenciaPuntos)} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Identificación: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.identificacionCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "identificacionCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title={`Identificación: Valor por pregunta. ${getTablaPuntajeHint("I")}`} type="text" inputMode="numeric" value={detalle.identificacionPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "identificacionPuntos", e.target.value)} style={getTablaPuntajeInputStyle("I", detalle.identificacionCantidad, detalle.identificacionPuntos)} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Resolución de ejercicios: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.resolucionEjerciciosCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionEjerciciosCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title="Resolución de ejercicios: Valor por pregunta" type="text" inputMode="numeric" value={detalle.resolucionEjerciciosPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "resolucionEjerciciosPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Resolucion de casos y problemas: Cantidad de preguntas" type="text" inputMode="numeric" value={getTablaCasosProblemasCantidad(detalle)} onChange={(e) => updateTablaCasosProblemasDetalle(actividadId, Number(indicador.IndicadorGrupoId), "cantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title="Resolucion de casos y problemas: Valor por pregunta" type="text" inputMode="numeric" value={getTablaCasosProblemasPuntos(detalle)} onChange={(e) => updateTablaCasosProblemasDetalle(actividadId, Number(indicador.IndicadorGrupoId), "puntos", e.target.value)} style={{ width: "54px", marginLeft: "6px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Respuesta restringida: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.respuestaRestringidaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaRestringidaCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title="Respuesta restringida: Valor por pregunta" type="text" inputMode="numeric" value={detalle.respuestaRestringidaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "respuestaRestringidaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                </td>
                                <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>
                                  <input title="Producción escrita: Cantidad de preguntas" type="text" inputMode="numeric" value={detalle.produccionEscritaCantidad} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "produccionEscritaCantidad", e.target.value)} style={{ width: "54px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
                                  <input title="Producción escrita: Valor por pregunta" type="text" inputMode="numeric" value={detalle.produccionEscritaPuntos} onChange={(e) => updateTablaDetalle(actividadId, Number(indicador.IndicadorGrupoId), "produccionEscritaPuntos", e.target.value)} style={{ width: "54px", marginLeft: "6px", color: "#0f172a", border: "1px solid #94a3b8", background: "#ffffff" }} />
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
                          const totalRPyRCas = {
                            preguntas: totalRP.preguntas + totalRCas.preguntas,
                            puntos: totalRP.puntos + totalRCas.puntos
                          };
                          const totalPE = sumItem("produccionEscritaCantidad", "produccionEscritaPuntos");
                          rows.push(
                            <tr key="fmt-total-preg" style={{ background: "#e2e8f0", fontWeight: 800, color: "#0f172a" }}>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }} colSpan={2}>Totales Preguntas</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#0f172a" }}>
                                {tablaTipoFormato === "ANTES" ? String(totalLeccionesMostradas) : Math.round(Number(totalLeccionesMostradas || 0))}
                              </td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#0f172a" }}></td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalSR.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRC.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalC.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalI.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRE.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRPyRCas.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRR.preguntas)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalPE.preguntas)}</td>
                            </tr>
                          );
                          rows.push(
                            <tr key="fmt-total-pts" style={{ background: "#dbe4f0", fontWeight: 800, color: "#0f172a" }}>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", color: "#0f172a" }} colSpan={2}>Totales Puntos</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#0f172a" }}></td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", color: "#0f172a" }}>
                                {Math.round(
                                  indicadoresPrueba.reduce((acc, indicador) => acc + getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones), 0)
                                )}
                              </td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalSR.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRC.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalC.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalI.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRE.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRPyRCas.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalRR.puntos)}</td>
                              <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "center", fontSize: "12px", color: "#0f172a" }}>{Math.round(totalPE.puntos)}</td>
                            </tr>
                          );
                          const totalPuntosCalculado = Number(
                            indicadoresPrueba.reduce((acc, indicador) => acc + getPuntosFormulaPruebaSeleccionada(Number(indicador.IndicadorGrupoId), totalLecciones), 0).toFixed(2)
                          );
                          const diferencia = Number((totalPuntosCalculado - puntosEsperadosPrueba).toFixed(2));
                          const coincideTotal = Math.abs(diferencia) < 0.01;
                          rows.push(
                            <tr key="fmt-validacion" style={{ background: coincideTotal ? "#ecfdf5" : "#fef2f2" }}>
                              <td colSpan={12} style={{ padding: "10px", border: "1px solid #cbd5e1", color: coincideTotal ? "#166534" : "#991b1b", fontWeight: 700 }}>
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
                    {savingSeguimiento && savingSeguimientoModo === "asignacion" ? (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <div style={{ color: "#0f172a", fontWeight: 800 }}>
                          Guardando asignaciones e indicadores del examen...
                        </div>
                        <div style={{ width: "100%", height: "10px", borderRadius: "999px", background: "#dbeafe", overflow: "hidden", border: "1px solid #93c5fd" }}>
                          <div style={{ width: `${savingSeguimientoProgress}%`, height: "100%", background: "linear-gradient(90deg, #2563eb 0%, #22c55e 100%)", transition: "width 240ms ease" }} />
                        </div>
                        <div style={{ color: "#1e3a8a", fontWeight: 700, fontSize: "13px" }}>
                          {savingSeguimientoProgress}% completado
                        </div>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-start" }}>
                      <button type="button" className="primary-btn" onClick={guardarAsignacionTablaEspecificaciones} disabled={savingSeguimiento || !tablaActividadesObjetivo.length || !tablaHayAsignacionesMatriz || !tablaValidacionPruebaSeleccionada.coincide || !tablaEspecificacionEditando} style={savedSeguimientoModo === "asignacion" || !tablaEspecificacionEditando ? { background: "#16a34a", borderColor: "#15803d", color: "#ffffff", opacity: 0.9 } : undefined}>
                        {savingSeguimiento && savingSeguimientoModo === "asignacion" ? "Guardando..." : (!tablaEspecificacionEditando ? "Guardado" : "Guardar")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "12px", borderRadius: "12px", border: "1px dashed #2b4e7a", background: "#0a1f3d", color: "#cbd5e1", fontWeight: 700 }}>
                    {tablaPruebasPendientes.length
                      ? "Seleccioná una prueba pendiente para parametrizar su tabla de especificaciones."
                      : "No hay pruebas pendientes por parametrizar. Podés editar o eliminar una tabla ya guardada en el listado superior."}
                  </div>
                )}
                </>
                ) : !crearExamenesOpen ? (
                  <div style={{ padding: "12px", borderRadius: "12px", border: "1px dashed #2b4e7a", background: "#0a1f3d", color: "#cbd5e1", fontWeight: 700 }}>
                    Guarda el Paso 1.1 para que aparezca el Paso 1.2.
                  </div>
                ) : null}
                {!tablaPuedeCrearExamenes ? (
                  <div style={{ padding: "12px", borderRadius: "12px", border: "1px dashed #f59e0b", background: "#2b1b08", color: "#fde68a", fontWeight: 700 }}>
                    El botón "Crear Exámenes" aparecerá cuando todas las pruebas tengan listas sus asignaciones e indicadores guardados.
                  </div>
                ) : null}
                </>
                ) : null}
              </div>
              </PanelErrorBoundary>
            )}

            {activePanel === "reportes" && (
              <div style={{ display: "grid", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "flex-start", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <h4 style={{ marginBottom: "4px" }}>Reportes del grupo</h4>
                    <p style={{ margin: 0, opacity: 0.75 }}>
                      Seleccioná el tipo de reporte por sección para consultar y exportar información.
                    </p>
                    <div className="gestion-report-type-selector">
                      <span className="gestion-report-type-selector__label">Tipo de reporte</span>
                      <select className="gestion-report-type-selector__select" value={tipoReporteGestion} onChange={(e) => setTipoReporteGestion(e.target.value as TipoReporteGestion)}>
                        <option value="ASISTENCIA">Reporte de Asistencia</option>
                        <option value="COTIDIANO">Reporte de Cotidiano</option>
                        <option value="TAREAS">Reporte de Tareas</option>
                        <option value="EXAMENES">Reporte de Exámenes</option>
                        <option value="MENSAJES">Reporte de mensajes enviados</option>
                        <option value="BITACORA">Reporte de Bitácora</option>
                        <option value="BOLETAS">Reporte de Boletas</option>
                        <option value="NOTAS">Reporte de Notas de Asistencia</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "12px", padding: "14px", border: "1px solid #cbd5e1", borderRadius: "12px", background: "#ffffff", color: "#0f172a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <h4 style={{ margin: "0 0 4px", color: "#0f172a", fontWeight: 900 }}>Cierre del curso</h4>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: cursoGestionCerrado ? "#fee2e2" : (String(cierreCurso?.Estado || "").toUpperCase() === "REABIERTO_DIRECCION" ? "#fef3c7" : "#dcfce7"),
                          color: cursoGestionCerrado ? "#991b1b" : (String(cierreCurso?.Estado || "").toUpperCase() === "REABIERTO_DIRECCION" ? "#92400e" : "#166534"),
                          border: cursoGestionCerrado ? "1px solid #fecaca" : (String(cierreCurso?.Estado || "").toUpperCase() === "REABIERTO_DIRECCION" ? "1px solid #fde68a" : "1px solid #bbf7d0"),
                          fontWeight: 900
                        }}>
                          {loadingCierreCurso ? "Cargando..." : (cursoGestionCerrado ? "Cerrado por docente" : (String(cierreCurso?.Estado || "").toUpperCase() === "REABIERTO_DIRECCION" ? "Reabierto por Direccion" : "Abierto"))}
                        </span>
                        {cierreCurso?.CerradoAt ? (
                          <span style={{ color: "#475569", fontWeight: 700 }}>Cerrado: {new Date(cierreCurso.CerradoAt).toLocaleString("es-CR")}</span>
                        ) : null}
                        {cierreCurso?.ReabiertoAt ? (
                          <span style={{ color: "#475569", fontWeight: 700 }}>Reabierto: {new Date(cierreCurso.ReabiertoAt).toLocaleString("es-CR")}</span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" style={secondaryButtonStyle} onClick={() => cargarCierreCurso(selected)} disabled={!selected || loadingCierreCurso || savingCierreCurso}>
                        Actualizar
                      </button>
                      <button type="button" className="primary-btn" onClick={cerrarCursoSeleccionado} disabled={!selected || loadingCierreCurso || savingCierreCurso || cursoGestionCerrado}>
                        {savingCierreCurso && !cursoGestionCerrado ? "Cerrando..." : "Cerrar curso"}
                      </button>
                      {isGestionAdminRole && cursoGestionCerrado ? (
                        <button type="button" style={secondaryButtonStyle} onClick={reabrirCursoSeleccionado} disabled={!selected || loadingCierreCurso || savingCierreCurso}>
                          {savingCierreCurso ? "Reabriendo..." : "Reabrir curso"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
                    <div style={{ ...cardStyle, background: "#f8fafc", color: "#0f172a" }}>
                      <strong>Estado de datos</strong>
                      <span style={{ fontSize: "22px", fontWeight: 900 }}>{cierreCursoPreview?.resumen?.estado || "-"}</span>
                    </div>
                    <div style={{ ...cardStyle, background: "#f8fafc", color: "#0f172a" }}>
                      <strong>Promedio general</strong>
                      <span style={{ fontSize: "22px", fontWeight: 900 }}>{cierreCursoPreview?.resumen?.promedioGeneral ?? "-"}</span>
                    </div>
                    <div style={{ ...cardStyle, background: "#f8fafc", color: "#0f172a" }}>
                      <strong>Estudiantes</strong>
                      <span style={{ fontSize: "22px", fontWeight: 900 }}>{cierreCursoPreview?.resumen?.totalEstudiantes ?? "-"}</span>
                    </div>
                    <div style={{ ...cardStyle, background: "#f8fafc", color: "#0f172a" }}>
                      <strong>Incompletos</strong>
                      <span style={{ fontSize: "22px", fontWeight: 900, color: Number(cierreCursoPreview?.resumen?.totalIncompletos || 0) > 0 ? "#b91c1c" : "#166534" }}>{cierreCursoPreview?.resumen?.totalIncompletos ?? "-"}</span>
                    </div>
                  </div>

                  {Array.isArray(cierreCursoPreview?.advertencias) && cierreCursoPreview.advertencias.length ? (
                    <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 800 }}>
                      {cierreCursoPreview.advertencias.slice(0, 3).join(" ")}
                      {cierreCursoPreview.advertencias.length > 3 ? ` y ${cierreCursoPreview.advertencias.length - 3} advertencia(s) mas.` : ""}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" className="primary-btn" onClick={exportarReporteActualExcel} disabled={!selected}>
                    Exportar Excel
                  </button>
                  <button type="button" className="primary-btn" onClick={exportarReporteActualPdf} disabled={!selected}>
                    Exportar PDF
                  </button>
                </div>
                {(() => {
                  const reportTableStyle = { width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" } as const;
                  const reportHeaderStyle = { background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" } as const;
                  const reportSubHeaderStyle = { background: "#eff6ff", color: "#0f172a", border: "1px solid #bfdbfe", padding: "7px", fontWeight: 700, textAlign: "center" as const } as const;
                  const reportCellStyle = { border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" } as const;
                  const reportCellCenterStyle = { ...reportCellStyle, textAlign: "center" as const };
                  const reportBannerStyle = {
                    textAlign: "left" as const,
                    background: "#ecfeff",
                    color: "#0f172a",
                    border: "1px solid #99f6e4",
                    padding: "8px 10px",
                    fontWeight: 800
                  };
                  return null;
                })()}

                {tipoReporteGestion === "NOTAS" && (
                  <>
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
                    <strong>Promedio final</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{formatPercent(resumenReportes.promedioFinal)}</span>
                  </div>
                  <div style={cardStyle}>
                    <strong>Actividades evaluativas</strong>
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>{detalle.actividades.length}</span>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" }}>
                    <thead>
                      <tr>
                        <th className="gestion-report-active-title"
                          colSpan={7}
                          style={{
                            textAlign: "left",
                            background: "#ecfeff",
                            color: "#0f172a",
                            border: "1px solid #99f6e4",
                            padding: "8px 10px",
                            fontWeight: 800
                          }}
                        >
                          Resumen general de notas del grupo: {resumenReportes.totalEstudiantes} estudiantes
                        </th>
                      </tr>
                      <tr>
                        <th style={{ minWidth: "220px", background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Estudiante</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Identificación</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Lecciones registradas</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Ausencias equivalentes</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% ausencias</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% asistencia Art. 37</th>
                        <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Promedio final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenReportes.filas.map((fila) => (
                        <tr
                          key={fila.EstudianteId}
                          className="adecuacion-student-row"
                          data-adecuacion={getAdecuacionStyleKind(fila.TipoAdecuacion) || undefined}
                          style={{ background: getTransferRowBg(Number(fila.EstudianteId), "#ffffff") }}
                        >
                          <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", fontWeight: 700 }}>{fila.NombreCompleto}</td>
                          <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.Identificacion}</td>
                          <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.TotalLecciones}</td>
                          <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.AusenciasEquivalentes.toFixed(2)}</td>
                          <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{formatPercent(fila.PorcentajeAusencias)}</td>
                          <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{formatPercent(fila.PorcentajeAsistencia)}</td>
                          <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{formatPercent(fila.PromedioFinal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={helperDarkBoxStyle}>
                  <strong>Nota:</strong> el porcentaje de asistencia se calcula con las reglas del Artículo 37 usando las ausencias injustificadas equivalentes registradas hasta el momento.
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" style={secondaryButtonStyle} onClick={exportarReporteCsv} disabled={resumenReportes.filas.length === 0}>
                    Exportar CSV
                  </button>
                </div>
                  </>
                )}

                {tipoReporteGestion === "ASISTENCIA" && (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                      <button type="button" style={secondaryButtonStyle} onClick={() => selected && loadAsistencia(selected)} disabled={loadingAsistencia}>
                        {loadingAsistencia ? "Actualizando..." : "Actualizar asistencia"}
                      </button>
                    </div>
                    <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" }}>
                      <thead>
                        <tr>
                          <th className="gestion-report-active-title"
                            colSpan={7 + reporteAsistenciaDetallado.columnas.length}
                            style={{
                              textAlign: "left",
                              background: "#ecfeff",
                              color: "#0f172a",
                              border: "1px solid #99f6e4",
                              padding: "8px 10px",
                              fontWeight: 800
                            }}
                          >
                            Total de lecciones con lista tomada: {reporteAsistenciaDetallado.columnas.length}
                          </th>
                        </tr>
                        <tr>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Estudiante</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Identificación</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% ganado</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Alerta temprana</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Tardías</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Ausencias justificadas</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Ausencias injustificadas</th>
                          {reporteAsistenciaDetallado.gruposFecha.map((g) => (
                            <th key={`fecha-head-${g.fechaIso}`} colSpan={g.columns.length} style={{ textAlign: "center", background: "#bfdbfe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px", fontWeight: 800 }}>{g.fechaLabel}</th>
                          ))}
                        </tr>
                        <tr>
                          <th colSpan={7} style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}></th>
                          {reporteAsistenciaDetallado.columnasPlanas.map((c: any) => (
                            <th key={`bloque-head-${c.key}`} style={{ textAlign: "center", background: "#eff6ff", color: "#0f172a", border: "1px solid #bfdbfe", padding: "7px", fontWeight: 700 }}>{c.bloque}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reporteAsistenciaDetallado.columnas.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: "12px", border: "1px solid #cbd5e1", background: "#fff7ed", color: "#9a3412", fontWeight: 700 }}>
                              No hay listas de asistencia registradas para mostrar fechas y lecciones.
                            </td>
                          </tr>
                        ) : null}
                        {reporteAsistenciaDetallado.rows.map((fila) => (
                          <tr
                            key={fila.estudianteId}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(fila.tipoAdecuacion) || undefined}
                            style={{ background: getTransferRowBg(Number(fila.estudianteId), "#ffffff") }}
                          >
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", fontWeight: 700 }}>{fila.nombre}</td>
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.identificacion}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", background: "#ffffff", fontWeight: 800 }}>
                              <span style={{ color: "#0f172a", fontWeight: 900, opacity: 1 }}>{fila.nota.toFixed(2)}%</span>
                            </td>
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", fontWeight: 800, color: fila.alertaColor, background: fila.alertaBg }}>{fila.alerta}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.tardias}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.ausJust}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.ausInjust}</td>
                            {reporteAsistenciaDetallado.columnasPlanas.map((c: any) => (
                              <td key={`asis-cell-${fila.estudianteId}-${c.key}`} style={{ textAlign: "center", fontWeight: 700, border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>
                                {fila.porColumna.get(c.key) || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: "8px", color: "#cbd5e1", fontSize: "12px" }}>
                      T = Tardía, P = Presente, AI = Ausencia injustificada, AJ = Ausencia justificada.
                    </div>
                  </div>
                )}

                {tipoReporteGestion === "COTIDIANO" && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" }}>
                      <thead>
                        <tr>
                          <th className="gestion-report-active-title" colSpan={5 + detalleReportesPorTipo.cotidiano.columns.length} style={{ textAlign: "left", background: "#ecfeff", color: "#0f172a", border: "1px solid #99f6e4", padding: "8px 10px", fontWeight: 800 }}>
                            Reporte de Cotidiano: {detalleReportesPorTipo.cotidiano.columns.length} columnas de evaluación
                          </th>
                        </tr>
                        <tr>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Estudiante</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Identificación</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Actividades registradas/calificadas</th>
                          {detalleReportesPorTipo.cotidiano.columns.map((col) => (
                            <th key={`cot-col-${col.actividadId}`} style={{ textAlign: "center", background: "#eff6ff", color: "#0f172a", border: "1px solid #bfdbfe", padding: "7px", fontWeight: 700 }}>{col.nombre}</th>
                          ))}
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% evaluado</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% ganado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleReportesPorTipo.cotidiano.rows.map((fila) => (
                          <tr
                            key={fila.EstudianteId}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(fila.TipoAdecuacion) || undefined}
                            style={{ background: getTransferRowBg(Number(fila.EstudianteId), "#ffffff") }}
                          >
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", fontWeight: 700 }}>{fila.NombreCompleto}</td>
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.Identificacion}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.RegistradasCalificadas}</td>
                            {fila.cols.map((valor, idx) => (
                              <td key={`cot-v-${fila.EstudianteId}-${idx}`} style={{ textAlign: "center", fontWeight: 700, border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{valor}</td>
                            ))}
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeEvaluado || 0).toFixed(2)}%</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeGanado || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tipoReporteGestion === "TAREAS" && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" }}>
                      <thead>
                        <tr>
                          <th className="gestion-report-active-title" colSpan={5 + detalleReportesPorTipo.tareas.columns.length} style={{ textAlign: "left", background: "#ecfeff", color: "#0f172a", border: "1px solid #99f6e4", padding: "8px 10px", fontWeight: 800 }}>
                            Reporte de Tareas: {detalleReportesPorTipo.tareas.columns.length} columnas de evaluación
                          </th>
                        </tr>
                        <tr>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Estudiante</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Identificación</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Actividades registradas/calificadas</th>
                          {detalleReportesPorTipo.tareas.columns.map((col) => (
                            <th key={`tar-col-${col.actividadId}`} style={{ textAlign: "center", background: "#eff6ff", color: "#0f172a", border: "1px solid #bfdbfe", padding: "7px", fontWeight: 700 }}>{col.nombre}</th>
                          ))}
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% evaluado</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% ganado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleReportesPorTipo.tareas.rows.map((fila) => (
                          <tr
                            key={fila.EstudianteId}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(fila.TipoAdecuacion) || undefined}
                            style={{ background: getTransferRowBg(Number(fila.EstudianteId), "#ffffff") }}
                          >
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", fontWeight: 700 }}>{fila.NombreCompleto}</td>
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.Identificacion}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.RegistradasCalificadas}</td>
                            {fila.cols.map((valor, idx) => (
                              <td key={`tar-v-${fila.EstudianteId}-${idx}`} style={{ textAlign: "center", fontWeight: 700, border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{valor}</td>
                            ))}
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeEvaluado || 0).toFixed(2)}%</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeGanado || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tipoReporteGestion === "EXAMENES" && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="adecuacion-zebra-list" style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px", color: "#0f172a", background: "#ffffff" }}>
                      <thead>
                        <tr>
                          <th className="gestion-report-active-title" colSpan={5 + detalleReportesPorTipo.examenes.columns.length} style={{ textAlign: "left", background: "#ecfeff", color: "#0f172a", border: "1px solid #99f6e4", padding: "8px 10px", fontWeight: 800 }}>
                            Reporte de Exámenes: {detalleReportesPorTipo.examenes.columns.length} columnas de evaluación
                          </th>
                        </tr>
                        <tr>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Estudiante</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Identificación</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>Actividades registradas/calificadas</th>
                          {detalleReportesPorTipo.examenes.columns.map((col) => (
                            <th key={`exa-col-${col.actividadId}`} style={{ textAlign: "center", background: "#eff6ff", color: "#0f172a", border: "1px solid #bfdbfe", padding: "7px", fontWeight: 700 }}>{col.nombre}</th>
                          ))}
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% evaluado</th>
                          <th style={{ background: "#dbeafe", color: "#0f172a", border: "1px solid #93c5fd", padding: "8px" }}>% ganado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleReportesPorTipo.examenes.rows.map((fila) => (
                          <tr
                            key={fila.EstudianteId}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(fila.TipoAdecuacion) || undefined}
                            style={{ background: getTransferRowBg(Number(fila.EstudianteId), "#ffffff") }}
                          >
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a", fontWeight: 700 }}>{fila.NombreCompleto}</td>
                            <td style={{ border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.Identificacion}</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{fila.RegistradasCalificadas}</td>
                            {fila.cols.map((valor, idx) => (
                              <td key={`exa-v-${fila.EstudianteId}-${idx}`} style={{ textAlign: "center", fontWeight: 700, border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{valor}</td>
                            ))}
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeEvaluado || 0).toFixed(2)}%</td>
                            <td style={{ textAlign: "center", border: "1px solid #cbd5e1", padding: "7px", color: "#0f172a" }}>{Number(fila.porcentajeGanado || 0).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {tipoReporteGestion === "BOLETAS" && (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={helperDarkBoxStyle}>
                        Boletas de conducta de la sección seleccionada.
                      </div>
                      <button type="button" style={secondaryButtonStyle} onClick={cargarBoletasConductaReporte} disabled={loadingBoletasReporte}>
                        {loadingBoletasReporte ? "Cargando..." : "Actualizar boletas"}
                      </button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="adecuacion-zebra-list">
                        <thead>
                          <tr>
                            <th>N°</th>
                            <th>Fecha</th>
                            <th>Estudiante</th>
                            <th>Sección</th>
                            <th>Funcionario</th>
                            <th>Envíos correo</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boletasConductaFiltradas.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>
                                No hay boletas registradas para esta sección.
                              </td>
                            </tr>
                          ) : boletasConductaFiltradas.map((item) => (
                            <tr
                              key={item.BoletaConductaId}
                              className="adecuacion-student-row"
                              data-adecuacion={getAdecuacionStyleKind(item.TipoAdecuacion) || undefined}
                            >
                              <td>{String(item.CodigoBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(3, "0")}</td>
                              <td>{String(item.Fecha || "").slice(0, 10)}</td>
                              <td>{[item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre || ""].join(" ").replace(/\s+/g, " ").trim()}</td>
                              <td>{item.Seccion || ""}</td>
                              <td>{item.NombreFuncionario || ""}</td>
                              <td>{Number(item.TotalEnviosExitosos || 0)} / {Number(item.TotalEnviosCorreo || 0)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="primary-btn"
                                  style={{ padding: "6px 10px" }}
                                  onClick={() => window.open(`/boletas/conducta/${item.BoletaConductaId}?modo=reimprimir`, "_blank")}
                                >
                                  Reimprimir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tipoReporteGestion === "MENSAJES" && (

                <div style={{ ...helperDarkBoxStyle, display: "grid", gap: "10px", marginTop: "8px", padding: "12px", borderRadius: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "end" }}>
                    <div>
                      <h4 style={{ margin: 0 }}>Auditoría de envíos (Asistencia, Cotidiano y Tareas)</h4>
                      <small style={{ color: "#cbd5e1" }}>Control de reportes enviados por correo y WhatsApp por estudiante.</small>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
                      <label style={{ display: "grid", gap: "4px" }}>
                        Desde
                        <input type="date" value={auditoriaEnviosDesde} onChange={(e) => setAuditoriaEnviosDesde(e.target.value)} />
                      </label>
                      <label style={{ display: "grid", gap: "4px" }}>
                        Hasta
                        <input type="date" value={auditoriaEnviosHasta} onChange={(e) => setAuditoriaEnviosHasta(e.target.value)} />
                      </label>
                      <button type="button" className="primary-btn" onClick={() => cargarAuditoriaEnvios(selected)} disabled={loadingAuditoriaEnvios || !selected}>
                        {loadingAuditoriaEnvios ? "Cargando..." : "Consultar"}
                      </button>
                      <button type="button" className="primary-btn" onClick={exportarAuditoriaEnviosExcel} disabled={!selected}>
                        Exportar auditoría Excel
                      </button>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="adecuacion-zebra-list">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Módulo</th>
                          <th>Estudiante</th>
                          <th>Identificación</th>
                          <th>Correo</th>
                          <th>WA</th>
                          <th>Último envío</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditoriaEnvios.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: "center", opacity: 0.75 }}>No hay registros en el rango seleccionado.</td>
                          </tr>
                        ) : auditoriaEnvios.map((fila) => (
                          <tr
                            key={fila.ReporteEnvioBitacoraId}
                            className="adecuacion-student-row"
                            data-adecuacion={getAdecuacionStyleKind(fila.TipoAdecuacion) || undefined}
                          >
                            <td>{fila.Fecha ? String(fila.Fecha).slice(0, 10) : ""}</td>
                            <td>{fila.ModuloNombre || fila.Modulo}</td>
                            <td>{[fila.Nombre, fila.PrimerApellido, fila.SegundoApellido].filter(Boolean).join(" ")}</td>
                            <td>{fila.Identificacion || ""}</td>
                            <td style={{ color: fila.CorreoEnviado ? "#166534" : "#991b1b", fontWeight: 700 }}>{fila.CorreoEnviado ? "Enviado" : "No"}</td>
                            <td style={{ color: fila.WaEnviado ? "#166534" : "#991b1b", fontWeight: 700 }}>{fila.WaEnviado ? "Enviado" : "No"}</td>
                            <td>{fila.UltimoEnvioAt ? String(fila.UltimoEnvioAt).slice(0, 19).replace("T", " ") : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                {tipoReporteGestion === "BITACORA" && (
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                      <button type="button" style={secondaryButtonStyle} onClick={() => selected && loadBitacora(selected)} disabled={loadingBitacora}>
                        {loadingBitacora ? "Actualizando..." : "Actualizar bitácora"}
                      </button>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Temas desarrollados</th>
                          <th>Observaciones</th>
                          <th>Hechos relevantes</th>
                          <th>Usuario</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bitacorasGrupo.length === 0 ? (
                          <tr><td colSpan={5} style={{ textAlign: "center", padding: "10px" }}>No hay registros de bitácora.</td></tr>
                        ) : bitacorasGrupo.map((fila) => (
                          <tr key={fila.BitacoraGrupoId}>
                            <td>{String(fila.FechaRegistro || "").slice(0, 10)}</td>
                            <td>{fila.TemasDesarrollados || "-"}</td>
                            <td>{fila.Observaciones || "-"}</td>
                            <td>{fila.HechosRelevantes || "-"}</td>
                            <td>{fila.NombreUsuario || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                {cursoGestionCerrado ? (
                  <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "12px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontWeight: 900 }}>
                    Curso Cerrado. Las notas quedan en modo lectura hasta que Dirección reabra el curso.
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <button type="button" className="primary-btn" onClick={handleSaveNotas} disabled={savingNotas || !detalle.plantilla || detalle.actividades.length === 0 || cursoGestionCerrado}>
                    {savingNotas ? "Guardando notas..." : "Guardar notas"}
                  </button>
                </div>

                <table className="adecuacion-zebra-list">
                  <thead>
                    <tr>
                      <th style={stickyTableHeaderStyle}>Estudiante</th>
                      <th>Identificación</th>
                      {detalle.actividades.map((actividad) => (
                        <th key={actividad.EvaluacionActividadId} style={{ minWidth: "150px" }}>
                          <div style={{ display: "grid", gap: "4px" }}>
                            <span>{actividad.Descripcion}</span>
                            <small style={{ opacity: 0.7 }}>Vale {formatPercent(actividad.PorcentajeReal)}</small>
                            <small style={{ opacity: 0.9, fontWeight: 700 }}>
                              Puntos vale: {(() => {
                                const act = (seguimientoContexto?.actividades || []).find((a) => {
                                  const nomA = String(a.Nombre || "").trim().toLowerCase();
                                  const nomB = String(actividad.Descripcion || "").trim().toLowerCase();
                                  return nomA === nomB;
                                });
                                const puntos = Number(act?.PuntosMaximos || 0);
                                return Number.isFinite(puntos) ? puntos.toFixed(2) : "0.00";
                              })()}
                            </small>
                          </div>
                        </th>
                      ))}
                      <th>% acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.estudiantes.map((estudiante) => {
                      const acumulado = calcularAcumuladoEstudiante(estudiante.EstudianteId);
                      const suspendido = isEstudianteSuspendido(estudiante);
                      const suspensionTooltip = getSuspensionTooltip(estudiante);

                      return (
                        <tr
                          key={estudiante.EstudianteId}
                          className="adecuacion-student-row"
                          data-adecuacion={getAdecuacionStyleKind(estudiante.TipoAdecuacion || estudiante.Adecuacion) || undefined}
                          title={suspensionTooltip || undefined}
                          style={suspendido ? { background: SUSPENSION_ROW_BG } : undefined}
                        >
                          <td style={stickyTableCellStyle}>
                            {getFullName(estudiante)}
                            {suspendido ? <div style={{ color: "#be123c", fontWeight: 900, fontSize: "12px" }}>Alumno Suspendido</div> : null}
                          </td>
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
                                    disabled={cursoGestionCerrado || suspendido}
                                    title={suspensionTooltip || undefined}
                                    style={{
                                      ...inputNotaStyle,
                                      background: cursoGestionCerrado || suspendido ? "#e2e8f0" : inputNotaStyle.background,
                                      color: cursoGestionCerrado || suspendido ? "#64748b" : inputNotaStyle.color,
                                      cursor: cursoGestionCerrado || suspendido ? "not-allowed" : "text"
                                    }}
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










