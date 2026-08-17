import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql, timedQuery } from "../../config/database";
import { badRequest, forbidden, ok } from "../../utils/http";
import {
  CIERRE_CURSO_ESTADO_CERRADO,
  CIERRE_CURSO_ESTADO_REABIERTO,
  assertCierreCursoAbierto,
  ensureCierreAcademicoCursoTables,
  getCierreAcademicoCurso,
  isCierreCursoCerrado
} from "../academico/cierre-curso.utils";
import { ensureMatriculaTrasladoHistorialTable } from "../academico/matricula-traslado.utils";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import multer from "multer";
import JSZip from "jszip";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, Header, ImageRun, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel, TableLayoutType } from "docx";
import { sendEmail, sendEmailsBatch } from "../../services/email.service";
import { getCostaRicaIsoDate } from "../../utils/date.utils";
import { normalizeWhatsAppPhone, resolveWhatsAppPhonesForNotification } from "../../utils/whatsapp.utils";
import {
  getGrupoClaseEstudiantesPermitidos,
  getGrupoClasePermitido,
  hasGrupoClaseSchema,
  toOptionalGrupoClaseId
} from "../grupos-clase/grupos-clase.utils";
import {
  assertNoSuspendedStudents,
  getSuspensionVigenteApplySql,
  suspensionVigenteSelectSql
} from "../estudiantes/estudiante-suspension.utils";
import {
  getProfesorPeriodoEstadosVersion,
  hasProfesorPeriodoSchema,
  isPeriodoProfesorHabilitado
} from "../periodos-profesor/periodos-profesor.utils";

const router = Router();
const uploadApoyoEducativo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const BOOTSTRAP_CACHE_TTL_MS = 10000;
const APOYO_SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
const bootstrapCache = new Map<string, { at: number; data: any }>();
const bootstrapInFlight = new Map<string, Promise<any>>();
let apoyoEducativoReadyCache: { at: number; ready: boolean } | null = null;
let apoyoEducativoInformeColumnsEnsuredAt = 0;
let estudianteApoyoColumnsCache: { at: number; columns: {
  hasAdecuacion: boolean;
  hasTieneAdecuacion: boolean;
  hasNivelFuncionamiento: boolean;
  hasObservaciones: boolean;
} } | null = null;
const MIS_GRUPOS_PERF_LOG_PATH = join(tmpdir(), "profe360-mis-grupos-perf.jsonl");

function writeLocalMisGruposPerfTrace(trace: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || process.env.RENDER) return;
  void appendFile(MIS_GRUPOS_PERF_LOG_PATH, `${JSON.stringify(trace)}\n`, "utf8")
    .catch((error) => console.warn("[PERF][gestion.mis-grupos.trace-error]", error));
}

function getPoolPerfStats(pool: any) {
  return {
    size: Number(pool?.size || 0),
    available: Number(pool?.available || 0),
    pending: Number(pool?.pending || 0),
    borrowed: Number(pool?.borrowed || 0)
  };
}

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

router.use(async (req: any, res: any, next: any) => {
  try {
    if (!isProfesor(req) || isInstitutionAdmin(req) || isSuperAdmin(req)) return next();
    const periodoId = toOptionalNumber(req.body?.periodoId ?? req.query?.periodoId);
    if (!periodoId) return next();
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    const habilitado = await isPeriodoProfesorHabilitado({
      pool,
      institucionId,
      usuarioId: getUserId(req),
      periodoId
    });
    if (!habilitado) return forbidden(res, "El periodo esta inhabilitado para este profesor");
    return next();
  } catch (error) {
    return next(error);
  }
});

type AuthUser = {
  userId?: number;
  usuarioId?: number;
  correo?: string;
  institucionId?: number | null;
  roles?: string[];
};

function getAuth(req: any): AuthUser {
  return req.auth || {};
}

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.userId || auth.usuarioId || 0);
}

function resolveNotificationCc(req: any, ...candidates: any[]) {
  const values = [getAuth(req)?.correo, ...candidates]
    .map((value) => String(value || "").trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
  return values[0] || "";
}

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return (auth.roles || []).some((role) => roles.includes(role));
}

function isSuperAdmin(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function isInstitutionAdmin(req: any) {
  return hasAnyRole(req, ["ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
}

function isProfesor(req: any) {
  return hasAnyRole(req, ["PROFESOR", "PROFESOR_GUIA"]);
}

function getInstitutionId(req: any, res: any) {
  const auth = getAuth(req);
  const institucionId = auth.institucionId ?? null;

  if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }

  return Number(institucionId);
}

function toOptionalNumber(value: any) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function normalizeKey(value: any) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeLike(value: any) {
  const text = normalizeText(value);
  return `%${text}%`;
}

function assertCanAccessProfessorModule(req: any, res: any) {
  if (isSuperAdmin(req) || isInstitutionAdmin(req) || isProfesor(req)) return true;
  forbidden(res, "No tenés permisos para acceder a Gestión del Profe");
  return false;
}

async function getCorreoNotificacionConfig(pool: any, institucionId: number, tipoUso: string) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), String(tipoUso || "").toUpperCase())
    .query(`
      SELECT TOP 1 FromEmail, ParaModo, CcModo, AsuntoTemplate, CuerpoTemplate
      FROM dbo.CorreoNotificacionConfig
      WHERE InstitucionId = @institucionId
        AND TipoUso = @tipoUso
        AND Activo = 1
    `);
  return result.recordset[0] || null;
}

function renderTemplate(text: string, vars: Record<string, string>) {
  let out = String(text || "");
  for (const key of Object.keys(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), vars[key] || "");
  }
  return out;
}

function leccionOrdinalLabel(numero: number) {
  const n = Number(numero || 0);
  const ord: Record<number, string> = {
    1: "Primera",
    2: "Segunda",
    3: "Tercera",
    4: "Cuarta",
    5: "Quinta",
    6: "Sexta",
    7: "Setima",
    8: "Octava",
    9: "Novena",
    10: "Decima",
    11: "Undecima",
    12: "Duodecima"
  };
  if (!Number.isFinite(n) || n <= 0) return "Leccion";
  return ord[n] ? `${ord[n]} (Leccion ${n})` : `Leccion ${n}`;
}

const MAIL_FROM_NOTIFICACIONES = "info@profe360cr.com";

async function ensureMensajesSeguimientoTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.MensajeSeguimiento', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MensajeSeguimiento (
        MensajeSeguimientoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        TipoUso NVARCHAR(30) NOT NULL,
        ValorNivel INT NULL,
        Titulo NVARCHAR(200) NULL,
        Cuerpo NVARCHAR(MAX) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_MensajeSeguimiento_Activo DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MensajeSeguimiento_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL
      );
    END
  `);
}

async function resolverMensajeSeguimiento(pool: any, institucionId: number, tipoUso: "ASISTENCIA" | "COTIDIANO" | "TAREA" | "EXAMEN", valorNivel?: number | null) {
  await ensureMensajesSeguimientoTable(pool);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), tipoUso)
    .input("valorNivel", sql.Int, valorNivel ?? null)
    .query(`
      SELECT TOP 1 Titulo, Cuerpo
      FROM dbo.MensajeSeguimiento
      WHERE InstitucionId = @institucionId
        AND TipoUso = @tipoUso
        AND Activo = 1
        AND (ValorNivel = @valorNivel OR ValorNivel IS NULL)
      ORDER BY CASE WHEN ValorNivel = @valorNivel THEN 0 ELSE 1 END, MensajeSeguimientoId DESC
    `);
  return result.recordset[0] || null;
}

async function ensureApoyoEducativoTablesReady(pool: any) {
  if (apoyoEducativoReadyCache && Date.now() - apoyoEducativoReadyCache.at <= APOYO_SCHEMA_CACHE_TTL_MS) {
    return apoyoEducativoReadyCache.ready;
  }

  const result = await timedQuery("gestion.apoyos.schema.ready", () => pool.request().query(`
    SELECT
      CASE
        WHEN OBJECT_ID('dbo.TipoAdecuacion', 'U') IS NOT NULL
         AND OBJECT_ID('dbo.AdecuacionCatalogo', 'U') IS NOT NULL
         AND OBJECT_ID('dbo.ApoyoEducativo', 'U') IS NOT NULL
         AND OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NOT NULL
         AND OBJECT_ID('dbo.ApoyoEducativoDetalle', 'U') IS NOT NULL
        THEN CAST(1 AS bit)
        ELSE CAST(0 AS bit)
      END AS Ready
  `));
  const ready = !!result.recordset[0]?.Ready;
  apoyoEducativoReadyCache = { at: Date.now(), ready };
  return ready;
}

async function ensureApoyoEducativoInformeColumns(pool: any) {
  if (Date.now() - apoyoEducativoInformeColumnsEnsuredAt <= APOYO_SCHEMA_CACHE_TTL_MS) return;

  await timedQuery("gestion.apoyos.schema.informeColumns", () => pool.request().query(`
    IF OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeNombre') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeNombre NVARCHAR(255) NULL;
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeMimeType') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeMimeType NVARCHAR(150) NULL;
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeDocx') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeDocx VARBINARY(MAX) NULL;
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeGeneradoAt') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeGeneradoAt DATETIME2 NULL;
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'PlantillaNombre') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD PlantillaNombre NVARCHAR(255) NULL;
      IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'DatosInformeJson') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD DatosInformeJson NVARCHAR(MAX) NULL;
    END
  `));
  apoyoEducativoInformeColumnsEnsuredAt = Date.now();
}

function parseCsvIds(value: any) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number(String(item).trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

async function getEstudianteApoyoColumns(pool: any) {
  if (estudianteApoyoColumnsCache && Date.now() - estudianteApoyoColumnsCache.at <= APOYO_SCHEMA_CACHE_TTL_MS) {
    return estudianteApoyoColumnsCache.columns;
  }

  const result = await timedQuery("gestion.apoyos.schema.estudianteColumns", () => pool.request().query(`
    SELECT name
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Estudiante')
      AND name IN ('Adecuacion', 'TieneAdecuacion', 'NivelFuncionamiento', 'Observaciones')
  `));

  const names = new Set((result.recordset || []).map((item: any) => String(item.name || "")));
  const columns = {
    hasAdecuacion: names.has("Adecuacion"),
    hasTieneAdecuacion: names.has("TieneAdecuacion"),
    hasNivelFuncionamiento: names.has("NivelFuncionamiento"),
    hasObservaciones: names.has("Observaciones")
  };
  estudianteApoyoColumnsCache = { at: Date.now(), columns };
  return columns;
}

function parseMaybeJsonArray(value: any) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function joinNameParts(parts: any[]) {
  return parts.map((item) => normalizeText(item)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function formatDateApoyoCR(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function edadAniosMeses(fechaNacimiento: any) {
  if (!fechaNacimiento) return "";
  const birth = new Date(fechaNacimiento);
  if (Number.isNaN(birth.getTime())) return "";
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = Number(todayParts.find((p) => p.type === "year")?.value || 0);
  const m = Number(todayParts.find((p) => p.type === "month")?.value || 1) - 1;
  const d = Number(todayParts.find((p) => p.type === "day")?.value || 1);
  const today = new Date(Date.UTC(y, m, d));
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  let months = today.getUTCMonth() - birth.getUTCMonth();
  if (today.getUTCDate() < birth.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${Math.max(0, years)} años${months ? ` y ${months} meses` : ""}`;
}

function classifyApoyoTipo(tipo: any) {
  const key = normalizeKey(tipo);
  if (key.includes("MATERIAL") || key.includes("TECNOLOG")) return "material";
  if (key.includes("ORGANIZ")) return "organizativo";
  if (key.includes("EVALU")) return "evaluacion";
  return "curricular";
}

function normalizarIntensidadApoyo(value: any, fallback = "Moderada") {
  const key = normalizeKey(value);
  if (key === "ALTA" || key.startsWith("ALTA ")) return "Alta";
  if (key === "MODERADA" || key.startsWith("MODERADA ")) return "Moderada";
  if (key === "BAJA" || key.startsWith("BAJA ")) return "Baja";
  return fallback;
}

function textoApoyoGeneradoEsValido(value: any) {
  const text = normalizeText(value);
  const key = normalizeKey(text);
  if (text.length < 12) return false;
  return !key.includes("REGISTRO DE APLICACION DE LA ESTRATEGIA")
    && !key.includes("SE APLICA CONSIDERANDO EL NIVEL DE FUNCIONAMIENTO");
}

function extraerTextoRespuestaOpenAI(data: any) {
  const direct = normalizeText(data?.output_text);
  if (direct) return direct;

  const output = Array.isArray(data?.output) ? data.output : [];
  for (const message of output) {
    if (message?.type !== "message") continue;
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const part of content) {
      const text = normalizeText(part?.text || part?.output_text);
      if (text) return text;
    }
  }

  return "";
}

function metodoFallback(descripcion: string, tipo = "") {
  const base = `${descripcion}`.trim();
  const key = normalizeKey(base);
  const tipoKey = normalizeKey(tipo);
  const intensity = /MAS TIEMPO|TIEMPO ADICIONAL|AJUSTAR LOS APRENDIZAJES|DISMINUIR LA LONGITUD|PRUEBA ESPECIFICA|DIVIDIR LA ACTIVIDAD|TUTOR ESPECIALISTA/.test(key)
    ? "Alta"
    : "Moderada";

  let evidencia = "Registro de aplicación y seguimiento de la estrategia durante las actividades de clase.";
  let observaciones = "Favorece la participación y el acceso del estudiante a las actividades de aprendizaje.";

  if (/MAS TIEMPO|TIEMPO ADICIONAL/.test(key)) {
    evidencia = "Tiempo adicional registrado en actividades de clase y evaluaciones.";
    observaciones = "Favorece el ritmo de trabajo y reduce la presión durante las actividades evaluativas.";
  } else if (/AJUSTAR LOS APRENDIZAJES/.test(key)) {
    evidencia = "Planeamiento y actividades ajustados al nivel de desempeño del estudiante.";
    observaciones = "Permite adecuar los aprendizajes y las actividades a las necesidades educativas identificadas.";
  } else if (/SENAS|GESTOS/.test(key)) {
    evidencia = "Apoyos gestuales aplicados durante las explicaciones y actividades de clase.";
    observaciones = "Facilita la comprensión de instrucciones y la comunicación durante el aprendizaje.";
  } else if (/DISMINUIR LA LONGITUD|CANTIDAD DE LAS TAREAS/.test(key)) {
    evidencia = "Tareas ajustadas en extensión y cantidad según el propósito de aprendizaje.";
    observaciones = "Disminuye la sobrecarga y favorece la finalización de las actividades.";
  } else if (/PRUEBA ESPECIFICA/.test(key)) {
    evidencia = "Instrumento de evaluación específico aplicado y registrado.";
    observaciones = "Permite valorar los aprendizajes con condiciones de acceso más adecuadas.";
  } else if (/TAMANO DE LA LETRA/.test(key)) {
    evidencia = "Instrumento evaluativo ajustado con un tamaño de letra legible.";
    observaciones = "Facilita la lectura y la comprensión de las consignas de evaluación.";
  } else if (/EVALUACIONES CORTAS/.test(key)) {
    evidencia = "Evaluaciones cortas aplicadas de forma periódica y registradas.";
    observaciones = "Permite valorar los aprendizajes en segmentos manejables y con menor fatiga.";
  } else if (/CERCA DE COMPANEROS/.test(key)) {
    evidencia = "Ubicación estratégica aplicada durante las actividades individuales y grupales.";
    observaciones = "Favorece la atención y el acompañamiento positivo durante las lecciones.";
  } else if (/VER LA PIZARRA/.test(key)) {
    evidencia = "Ubicación cercana a la pizarra aplicada durante las lecciones.";
    observaciones = "Facilita el acceso visual a las instrucciones y los materiales de clase.";
  } else if (/ORGANIZAR EL TIEMPO|CLIMA ORGANIZACIONAL/.test(key)) {
    evidencia = "Horario y organización del aula ajustados según las actividades planificadas.";
    observaciones = "Mejora la gestión del tiempo y mantiene un ambiente de trabajo más ordenado.";
  } else if (/RUTINAS DE TRABAJO/.test(key)) {
    evidencia = "Rutinas de trabajo establecidas y revisadas con el estudiante.";
    observaciones = "Aporta estructura y favorece una mayor autonomía en las tareas.";
  } else if (tipoKey.includes("EVALU")) {
    evidencia = "Estrategia evaluativa aplicada y registrada durante el proceso de valoración.";
    observaciones = "Favorece una evaluación accesible y coherente con las necesidades educativas del estudiante.";
  }

  return {
    estrategia: base,
    intensidad: intensity,
    evidencia,
    observaciones
  };
}

async function generarTextosApoyoConIA(contexto: any, catalogos: any[]) {
  const fallback = new Map<number, any>();
  for (const item of catalogos) fallback.set(Number(item.AdecuacionCatalogoId), metodoFallback(item.Descripcion || "", item.Tipo || ""));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !catalogos.length) return fallback;
  const model = process.env.OPENAI_APOYO_EDUCATIVO_MODEL || process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini";
  const prompt = `
Generá datos breves y profesionales para un informe de apoyos educativos en Costa Rica.
Devolvé SOLO JSON válido con esta forma:
{"items":[{"id":123,"intensidad":"...","evidencia":"...","observaciones":"..."}]}

Reglas obligatorias:
- En intensidad usá exclusivamente uno de estos valores: "Alta", "Moderada" o "Baja".
- Redactá evidencia y observaciones concretas para cada estrategia; no usés textos genéricos.
- No escribás "Registro de aplicación de la estrategia" ni "Se aplica considerando el nivel de funcionamiento".
- La observación debe describir el efecto pedagógico esperado del apoyo, no repetir la condición del estudiante.

Contexto:
Estudiante: ${contexto.estudianteNombre}
Adecuación: ${contexto.tipoAdecuacion}
Nivel de funcionamiento: ${contexto.nivelFuncionamiento}
Condición/observaciones: ${contexto.observaciones}
Docente responsable: ${contexto.responsable}

Estrategias seleccionadas:
${catalogos.map((item) => `- id ${item.AdecuacionCatalogoId}: [${item.Tipo}] ${item.Descripcion}`).join("\n")}
`;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: prompt })
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error(`[apoyo-educativo] OpenAI respondió ${response.status} con el modelo ${model}: ${detail}`);
      return fallback;
    }
    const data: any = await response.json();
    const text = extraerTextoRespuestaOpenAI(data);
    if (!text) throw new Error("La respuesta de OpenAI no incluyó texto de salida");
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    for (const item of parsed.items || []) {
      const id = Number(item.id);
      const existing = fallback.get(id) || {};
      fallback.set(id, {
        ...existing,
        intensidad: normalizarIntensidadApoyo(item.intensidad, existing.intensidad),
        evidencia: textoApoyoGeneradoEsValido(item.evidencia) ? normalizeText(item.evidencia) : existing.evidencia,
        observaciones: textoApoyoGeneradoEsValido(item.observaciones) ? normalizeText(item.observaciones) : existing.observaciones
      });
    }
  } catch (error) {
    console.error("No se pudo generar texto IA para apoyo educativo; se usará fallback:", error);
  }
  return fallback;
}

function docText(text: any, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text: String(text || ""), bold: opts.bold, size: opts.size || 20, color: opts.color });
}

function docP(text: any, opts: { bold?: boolean; size?: number; heading?: any; align?: any; color?: string } = {}) {
  return new Paragraph({
    heading: opts.heading,
    alignment: opts.align,
    spacing: { after: 90 },
    children: [docText(text, opts)]
  });
}

function docCell(children: any[], opts: { width?: number; fill?: string; span?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.span,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "777777" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "777777" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "777777" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "777777" }
    },
    children: children.length ? children : [docP("")]
  });
}

const DOCX_NO_BORDER = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
const DOCX_HEADER_CELL_BORDERS = {
  top: DOCX_NO_BORDER,
  bottom: DOCX_NO_BORDER,
  left: DOCX_NO_BORDER,
  right: DOCX_NO_BORDER
};

function getImageTypeFromUrl(url: string, contentType = ""): "jpg" | "png" | "gif" | "bmp" {
  const source = `${contentType} ${url}`.toLowerCase();
  if (source.includes("image/png") || /\.png(\?|#|$)/i.test(url)) return "png";
  if (source.includes("image/gif") || /\.gif(\?|#|$)/i.test(url)) return "gif";
  if (source.includes("image/bmp") || /\.bmp(\?|#|$)/i.test(url)) return "bmp";
  return "jpg";
}

async function fetchDocxImage(url: any, width: number, height: number, altText: string) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return null;

  try {
    if (/^data:image\//i.test(rawUrl)) {
      const match = rawUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
      if (!match || /image\/(webp|svg\+xml)/i.test(match[1])) return null;
      return new ImageRun({
        type: getImageTypeFromUrl(rawUrl, match[1]),
        data: Buffer.from(match[2], "base64"),
        transformation: { width, height },
        altText: { title: altText, description: altText, name: altText }
      });
    }

    if (!/^https?:\/\//i.test(rawUrl)) return null;
    const response = await fetch(rawUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (/image\/(webp|svg\+xml)/i.test(contentType) || /\.(webp|svg)(\?|#|$)/i.test(rawUrl)) return null;
    return new ImageRun({
      type: getImageTypeFromUrl(rawUrl, contentType),
      data: Buffer.from(await response.arrayBuffer()),
      transformation: { width, height },
      altText: { title: altText, description: altText, name: altText }
    });
  } catch {
    return null;
  }
}

async function buildApoyoEducativoHeader(data: any) {
  const membrete = await fetchDocxImage(data.membreteUrl, 506, 68, "Membrete institucional");
  const logo = await fetchDocxImage(data.logoUrl, 144, 68, "Logo institucional");

  return new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: {
          top: DOCX_NO_BORDER,
          left: DOCX_NO_BORDER,
          right: DOCX_NO_BORDER,
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "26355F" },
          insideHorizontal: DOCX_NO_BORDER,
          insideVertical: DOCX_NO_BORDER
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 7800, type: WidthType.DXA },
                borders: DOCX_HEADER_CELL_BORDERS,
                children: [
                  new Paragraph({
                    children: membrete ? [membrete] : [],
                    spacing: { before: 0, after: 80 }
                  })
                ]
              }),
              new TableCell({
                width: { size: 2280, type: WidthType.DXA },
                borders: DOCX_HEADER_CELL_BORDERS,
                children: [
                  new Paragraph({
                    children: logo ? [logo] : [],
                    alignment: AlignmentType.RIGHT,
                    spacing: { before: 0, after: 80 }
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function rowKV(label: string, value: any) {
  return new TableRow({ children: [docCell([docP(label, { bold: true })], { width: 3600, fill: "F2F2F2" }), docCell([docP(value || "")], { width: 5760 })] });
}

function supportTable(title: string, rows: any[], mode: "metodologica" | "evaluativa", responsable: string) {
  const header = mode === "metodologica"
    ? ["Estrategia Implementada", "Intensidad y frecuencia", "Responsable", "Observaciones"]
    : ["Estrategia Evaluativa", "Evidencia", "Responsable", "Observaciones"];
  const body = rows.length ? rows : [{ estrategia: "No aplica", intensidad: "No aplica", evidencia: "No aplica", observaciones: "No aplica" }];
  return [
    docP(title, { bold: true }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ children: header.map((h) => docCell([docP(h, { bold: true, align: AlignmentType.CENTER })], { fill: "EAF2F8" })) }),
        ...body.map((item) => new TableRow({
          children: mode === "metodologica"
            ? [
                docCell([docP(item.estrategia)]),
                docCell([docP(item.intensidad)]),
                docCell([docP(responsable)]),
                docCell([docP(item.observaciones)])
              ]
            : [
                docCell([docP(item.estrategia)]),
                docCell([docP(item.evidencia)]),
                docCell([docP(responsable)]),
                docCell([docP(item.observaciones)])
              ]
        }))
      ]
    }),
    docP("")
  ];
}

async function buildApoyoEducativoDocx(data: any) {
  const header = await buildApoyoEducativoHeader(data);
  const curricularMetodo = data.items.filter((x: any) => x.seccion === "curricular" && x.modo === "metodologica");
  const curricularEval = data.items.filter((x: any) => x.modo === "evaluativa" && x.seccion === "curricular");
  const materialMetodo = data.items.filter((x: any) => x.seccion === "material");
  const organizativoMetodo = data.items.filter((x: any) => x.seccion === "organizativo");
  const evaluativasGenerales = data.items.filter((x: any) => x.modo === "evaluativa");
  const seguimientoRows = Array.from({ length: 5 }, (_, index) =>
    new TableRow({
      children: [
        docCell([docP("")]),
        docCell([docP("")]),
        docCell([docP("")]),
        docCell([docP("")]),
        docCell([docP(index === 0 ? data.responsable : "")])
      ]
    })
  );

  const children: any[] = [
    docP("Plantilla para Registro de Apoyos Educativos", { bold: true, size: 28, align: AlignmentType.CENTER }),
    docP("I. Datos Administrativos", { bold: true, heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        rowKV("Dirección Regional", data.regional),
        rowKV("Circuito Educativo", data.circuito),
        rowKV("Institución Educativa", data.institucion),
        rowKV("Código Presupuestario", data.codigoPresupuestario),
        rowKV("Docente", data.docente),
        rowKV("Asignatura o especialidad", data.asignaturas),
        rowKV("Sección", data.seccion),
        rowKV("Curso Lectivo", data.cursoLectivo),
        rowKV("Periodo Lectivo", data.periodoLectivo),
        rowKV("Fecha", data.fecha)
      ]
    }),
    docP("II. Información General de la Persona Estudiante", { bold: true, heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        rowKV("Nombre completo", data.estudianteNombre),
        rowKV("Edad", data.edad),
        rowKV("Nivel Educativo", data.nivelFuncionamiento),
        rowKV("Condición identificada (si aplica)", data.observaciones),
        rowKV("Persona encargada legal", data.encargado)
      ]
    }),
    docP("III. Apoyos Educativos Personales", { bold: true, heading: HeadingLevel.HEADING_2 }),
    ...supportTable("Estrategias Metodológicas", [], "metodologica", data.responsable),
    ...supportTable("Estrategias Evaluativas", [], "evaluativa", data.responsable),
    docP("IV. Apoyos Educativos Curriculares", { bold: true, heading: HeadingLevel.HEADING_2 }),
    docP(`Nombre de Apoyo Educativo Curricular: ${String(data.tipoAdecuacion || "").toUpperCase()}.`, { bold: true }),
    ...supportTable("Estrategias Metodológicas", curricularMetodo, "metodologica", data.responsable),
    ...supportTable("Estrategias Evaluativas", curricularEval, "evaluativa", data.responsable),
    docP("V. Apoyos Educativos Materiales y Tecnológicos", { bold: true, heading: HeadingLevel.HEADING_2 }),
    ...supportTable("Estrategias Metodológicas", materialMetodo, "metodologica", data.responsable),
    ...supportTable("Estrategias Evaluativas", evaluativasGenerales, "evaluativa", data.responsable),
    docP("VI. Apoyos Educativos Organizativos", { bold: true, heading: HeadingLevel.HEADING_2 }),
    ...supportTable("Estrategias Metodológicas", organizativoMetodo, "metodologica", data.responsable),
    ...supportTable("Estrategias Evaluativas", evaluativasGenerales, "evaluativa", data.responsable),
    docP("VII. Seguimiento y Valoración de los Apoyos", { bold: true, heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: ["Fecha", "Apoyo implementado", "Resultados observados", "Ajustes requeridos", "Responsable"].map((h) => docCell([docP(h, { bold: true })], { fill: "F2F2F2" })) }),
        ...seguimientoRows
      ]
    }),
    docP(""),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            docCell([docP("Actor", { bold: true })], { width: 3000, fill: "B7B7B7" }),
            docCell([docP("Nombre Completo", { bold: true })], { width: 2600, fill: "B7B7B7" }),
            docCell([docP("Firma", { bold: true })], { width: 3300, fill: "B7B7B7" }),
            docCell([docP("Puesto / Parentesco", { bold: true })], { width: 1700, fill: "B7B7B7" })
          ]
        }),
        new TableRow({
          children: [
            docCell([docP("Persona que elabora el informe", { bold: true })], { width: 3000 }),
            docCell([docP(data.docente)], { width: 2600 }),
            docCell([docP("")], { width: 3300 }),
            docCell([docP(data.puestoDocente || "Docente")], { width: 1700 })
          ]
        }),
        new TableRow({
          children: [
            docCell([docP("Persona directora del Centro Educativo", { bold: true })], { width: 3000 }),
            docCell([docP(data.directoraNombre || "")], { width: 2600 }),
            docCell([docP("")], { width: 3300 }),
            docCell([docP(data.directoraPuesto || "Directora del Centro Educativo")], { width: 1700 })
          ]
        }),
        new TableRow({
          children: [
            docCell([docP("Padre/Madre/Encargado legal", { bold: true })], { width: 3000 }),
            docCell([docP(data.encargado)], { width: 2600 }),
            docCell([docP("")], { width: 3300 }),
            docCell([docP(data.encargadoParentesco || "Encargado legal")], { width: 1700 })
          ]
        })
      ]
    }),
    docP("Cc. Expediente único del proceso educativo de la persona estudiante.", { size: 18 })
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 1080, bottom: 900, left: 1080, header: 360, footer: 360 }
          }
        },
        headers: {
          default: header
        },
        children
      }
    ]
  });
  return Packer.toBuffer(doc);
}

function getXmlAttr(xml: string, attr: string) {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.match(new RegExp(`${escaped}="([^"]+)"`))?.[1] || "";
}

function upsertContentTypeOverride(contentTypesXml: string, partName: string, contentType: string) {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    "</Types>",
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
  );
}

function upsertContentTypeDefault(contentTypesXml: string, extension: string, contentType: string) {
  if (contentTypesXml.includes(`Extension="${extension}"`)) return contentTypesXml;
  return contentTypesXml.replace(
    "</Types>",
    `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`
  );
}

async function applyTemplateHeaderFooter(generatedBuffer: Buffer, templateBuffer?: Buffer | null) {
  if (!templateBuffer?.length) return generatedBuffer;

  try {
    const generatedZip = await JSZip.loadAsync(generatedBuffer);
    const templateZip = await JSZip.loadAsync(templateBuffer);
    const templateDocumentXml = await templateZip.file("word/document.xml")?.async("string");
    const templateRelsXml = await templateZip.file("word/_rels/document.xml.rels")?.async("string");
    const generatedDocumentXml = await generatedZip.file("word/document.xml")?.async("string");
    let generatedRelsXml = await generatedZip.file("word/_rels/document.xml.rels")?.async("string");
    let contentTypesXml = await generatedZip.file("[Content_Types].xml")?.async("string");

    if (!templateDocumentXml || !templateRelsXml || !generatedDocumentXml || !generatedRelsXml || !contentTypesXml) {
      return generatedBuffer;
    }

    const sectPrMatch = templateDocumentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    const generatedSectPrMatch = generatedDocumentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
    if (!sectPrMatch || !generatedSectPrMatch) return generatedBuffer;

    const relMap = new Map<string, string>();
    for (const match of templateRelsXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const rel = match[0];
      const id = getXmlAttr(rel, "Id");
      const target = getXmlAttr(rel, "Target");
      if (id && target) relMap.set(id, target);
    }

    const refs: Array<{ tag: string; oldId: string; target: string; newId: string }> = [];
    let index = 1;
    for (const match of sectPrMatch[0].matchAll(/<w:(footerReference)\b[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
      const tag = match[0];
      const oldId = match[2];
      const target = relMap.get(oldId);
      if (!target || !/^(header|footer)\d+\.xml$/i.test(target)) continue;
      refs.push({ tag, oldId, target, newId: `rIdApoyo${index++}` });
    }
    if (!refs.length) return generatedBuffer;

    for (const ref of refs) {
      const sourcePath = `word/${ref.target}`;
      const content = await templateZip.file(sourcePath)?.async("uint8array");
      if (!content) continue;
      generatedZip.file(sourcePath, content);
      const relsPath = `word/_rels/${ref.target}.rels`;
      const relsContent = await templateZip.file(relsPath)?.async("uint8array");
      if (relsContent) generatedZip.file(relsPath, relsContent);
      const partName = `/word/${ref.target}`;
      const contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";
      contentTypesXml = upsertContentTypeOverride(contentTypesXml, partName, contentType);
    }

    for (const fileName of Object.keys(templateZip.files)) {
      if (!/^word\/media\//i.test(fileName)) continue;
      const content = await templateZip.file(fileName)?.async("uint8array");
      if (content) generatedZip.file(fileName, content);
    }

    const templateContentTypes = await templateZip.file("[Content_Types].xml")?.async("string");
    if (templateContentTypes) {
      for (const match of templateContentTypes.matchAll(/<Default\b[^>]*Extension="([^"]+)"[^>]*ContentType="([^"]+)"[^>]*\/>/g)) {
        contentTypesXml = upsertContentTypeDefault(contentTypesXml, match[1], match[2]);
      }
    }

    for (const ref of refs) {
      generatedRelsXml = generatedRelsXml.replace(
        "</Relationships>",
        `<Relationship Id="${ref.newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="${ref.target}"/></Relationships>`
      );
    }

    const refsXml = refs.map((ref) => ref.tag.replace(`r:id="${ref.oldId}"`, `r:id="${ref.newId}"`)).join("");
    const cleanedSectPr = generatedSectPrMatch[0].replace(/<w:footerReference\b[^>]*\/>/g, "");
    const nextSectPr = cleanedSectPr.replace(/(<w:pgSz\b|<w:pgMar\b|<\/w:sectPr>)/, `${refsXml}$1`);
    generatedZip.file("word/document.xml", generatedDocumentXml.replace(generatedSectPrMatch[0], nextSectPr));
    generatedZip.file("word/_rels/document.xml.rels", generatedRelsXml);
    generatedZip.file("[Content_Types].xml", contentTypesXml);

    return generatedZip.generateAsync({ type: "nodebuffer" });
  } catch (error) {
    console.error("No se pudo copiar encabezado/pie de la plantilla de apoyo educativo:", error);
    return generatedBuffer;
  }
}

router.get("/mis-grupos/filtros-admin", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    if (!isSuperAdmin(req) && !isInstitutionAdmin(req)) {
      return forbidden(res, "Solo el perfil administrativo puede consultar estos filtros");
    }

    const pool = await getPool();
    const institucionSeleccionadaId = toOptionalNumber(req.query.institucionId);

    let institucionFiltroId = institucionSeleccionadaId;
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      institucionFiltroId = institucionId;
      if (institucionSeleccionadaId && institucionSeleccionadaId !== institucionId) {
        return forbidden(res, "No podés consultar filtros de otro colegio");
      }
    }

    const request = pool.request()
      .input("institucionId", sql.Int, institucionFiltroId);

    const filtroInstitucion = institucionFiltroId ? "AND ad.InstitucionId = @institucionId" : "";

    const result = await request.query(`
      CREATE TABLE #Base (
        InstitucionId int NOT NULL,
        InstitucionNombre nvarchar(250) NOT NULL,
        GrupoId int NOT NULL,
        GrupoNombre nvarchar(120) NOT NULL,
        Grado nvarchar(20) NULL,
        ProfesorId int NOT NULL,
        ProfesorNombre nvarchar(250) NOT NULL
      );

      INSERT INTO #Base (
        InstitucionId,
        InstitucionNombre,
        GrupoId,
        GrupoNombre,
        Grado,
        ProfesorId,
        ProfesorNombre
      )
      SELECT DISTINCT
        ad.InstitucionId,
        i.Nombre AS InstitucionNombre,
        ad.GrupoId,
        g.Nombre AS GrupoNombre,
        LEFT(g.Nombre, CHARINDEX('-', g.Nombre + '-') - 1) AS Grado,
        ad.UsuarioId AS ProfesorId,
        LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, N''), N' ', ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N'')))) AS ProfesorNombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Institucion i ON i.InstitucionId = ad.InstitucionId
      INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
      INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
      WHERE ad.Activo = 1
        AND ad.MateriaId IS NOT NULL
        ${filtroInstitucion};

      SELECT InstitucionId, InstitucionNombre
      FROM (
        SELECT DISTINCT InstitucionId, InstitucionNombre
        FROM #Base
      ) AS Instituciones
      ORDER BY InstitucionNombre;

      SELECT Grado
      FROM (
        SELECT DISTINCT Grado
        FROM #Base
        WHERE @institucionId IS NOT NULL
          AND InstitucionId = @institucionId
      ) AS Grados
      ORDER BY TRY_CONVERT(int, Grado), Grado;

      SELECT GrupoId, GrupoNombre
      FROM (
        SELECT DISTINCT GrupoId, GrupoNombre
        FROM #Base
        WHERE @institucionId IS NOT NULL
          AND InstitucionId = @institucionId
      ) AS Secciones
      ORDER BY
        TRY_CONVERT(int, LEFT(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') - 1)),
        TRY_CONVERT(int, SUBSTRING(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') + 1, 20)),
        GrupoNombre;

      SELECT ProfesorId, ProfesorNombre
      FROM (
        SELECT DISTINCT ProfesorId, ProfesorNombre
        FROM #Base
        WHERE @institucionId IS NOT NULL
          AND InstitucionId = @institucionId
      ) AS Profesores
      ORDER BY ProfesorNombre;

      DROP TABLE #Base;
    `);

    return ok(res, {
      instituciones: result.recordsets[0] || [],
      grados: result.recordsets[1] || [],
      secciones: result.recordsets[2] || [],
      profesores: result.recordsets[3] || []
    });
  } catch (error) {
    console.error("Error cargando filtros administrativos de gestion-profe:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los filtros administrativos" });
  }
});

router.get("/mis-grupos", async (req, res) => {
  const tMisGruposTotal = Date.now();
  const perfTrace: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    cache: "miss"
  };
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const tPool = Date.now();
    const pool = await getPool();
    perfTrace.poolMs = Date.now() - tPool;
    perfTrace.poolAtRouteStart = getPoolPerfStats(pool);
    console.log(
      `[SQL][gestion.mis-grupos.pool] ${perfTrace.poolMs}ms`
      + ` size=${Number((pool as any).size || 0)}`
      + ` available=${Number((pool as any).available || 0)}`
      + ` pending=${Number((pool as any).pending || 0)}`
      + ` borrowed=${Number((pool as any).borrowed || 0)}`
    );
    const auth = getAuth(req);
    const userId = getUserId(req);
    perfTrace.scope = isSuperAdmin(req)
      ? "super-admin"
      : (isInstitutionAdmin(req) ? "institution-admin" : "professor");
    const q = normalizeLike(req.query.q);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const materiaId = toOptionalNumber(req.query.materiaId);
    const grupoId = toOptionalNumber(req.query.grupoId);
    const profesorId = toOptionalNumber(req.query.profesorId);
    const institucionSeleccionadaId = toOptionalNumber(req.query.institucionId);
    const grado = String(req.query.grado || "").trim();
    perfTrace.filterShape = {
      q: q !== "%%",
      anio: anioLectivoId !== null,
      periodo: periodoId !== null,
      materia: materiaId !== null,
      grupo: grupoId !== null,
      profesor: profesorId !== null,
      institucion: institucionSeleccionadaId !== null,
      grado: grado.length > 0
    };
    const cacheKey = [
      "gestion.mis-grupos",
      `u:${userId || 0}`,
      `inst:${isSuperAdmin(req) ? "sa" : String(getAuth(req).institucionId ?? "")}`,
      `q:${String(q || "")}`,
      `a:${anioLectivoId ?? ""}`,
      `p:${periodoId ?? ""}`,
      `m:${materiaId ?? ""}`,
      `g:${grupoId ?? ""}`,
      `profsel:${profesorId ?? ""}`,
      `instsel:${institucionSeleccionadaId ?? ""}`,
      `grado:${grado}`,
      `prof:${isProfesor(req) ? 1 : 0}`,
      `adm:${isInstitutionAdmin(req) ? 1 : 0}`,
      `sa:${isSuperAdmin(req) ? 1 : 0}`,
      `ppe:${getProfesorPeriodoEstadosVersion()}`
    ].join("|");
    const cached = bootstrapCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= BOOTSTRAP_CACHE_TTL_MS) {
      perfTrace.cache = "hit";
      perfTrace.payloadRows = Array.isArray(cached.data) ? cached.data.length : null;
      console.log("[PERF][gestion.mis-grupos.cache-hit]");
      return ok(res, cached.data);
    }
    const inFlight = bootstrapInFlight.get(cacheKey);
    if (inFlight) {
      perfTrace.cache = "in-flight";
      console.log("[PERF][gestion.mis-grupos.in-flight-hit]");
      const shared = await inFlight;
      perfTrace.payloadRows = Array.isArray(shared) ? shared.length : null;
      return ok(res, shared);
    }
    const request = pool.request()
      .input("q", sql.NVarChar(250), q)
      .input("usuarioId", sql.Int, userId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("grupoId", sql.Int, grupoId)
      .input("profesorId", sql.Int, profesorId)
      .input("grado", sql.NVarChar(20), grado || null);

    let filtroInstitucion = "";
    let institucionFiltroId: number | null = null;
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      institucionFiltroId = institucionId;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
      if (institucionSeleccionadaId && institucionSeleccionadaId !== institucionId) {
        return forbidden(res, "No podés consultar grupos de otro colegio");
      }
    } else if (institucionSeleccionadaId) {
      institucionFiltroId = institucionSeleccionadaId;
      request.input("institucionId", sql.Int, institucionSeleccionadaId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : (profesorId ? "AND ad.UsuarioId = @profesorId" : "");

    const profesorPeriodoSchemaReady = await hasProfesorPeriodoSchema(pool);
    const filtroPeriodoProfesor = profesorPeriodoSchemaReady
      && isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? `AND NOT EXISTS (
          SELECT 1
          FROM dbo.ProfesorPeriodoEstado ppe
          WHERE ppe.InstitucionId = ad.InstitucionId
            AND ppe.UsuarioId = ad.UsuarioId
            AND ppe.AnioLectivoId = ad.AnioLectivoId
            AND ppe.PeriodoId = ad.PeriodoId
            AND ppe.Habilitado = 0
        )`
      : "";

    const filtroGrado = grado
      ? "AND LEFT(g.Nombre, CHARINDEX('-', g.Nombre + '-') - 1) = @grado"
      : "";

    const loadPromise = (async () => {
      const tCierreSchema = Date.now();
      await ensureCierreAcademicoCursoTables(pool);
      perfTrace.schemaCierreMs = Date.now() - tCierreSchema;
      console.log(`[SQL][gestion.mis-grupos.schema-cierre] ${perfTrace.schemaCierreMs}ms`);

      const tMisGrupos = Date.now();
      perfTrace.poolBeforeListado = getPoolPerfStats(pool);
      const result = await request.query(`
        SELECT
          ad.AsignacionDocenteId,
          ad.UsuarioId,
          ad.InstitucionId,
          ad.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.Jornada AS GrupoJornada,
          g.NivelAcademico AS GrupoNivelAcademico,
          g.Especialidad AS GrupoEspecialidad,
          ad.MateriaId,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          ad.AnioLectivoId,
          al.Nombre AS AnioNombre,
          ad.PeriodoId,
          p.Nombre AS PeriodoNombre,
          ad.TipoAsignacion,
          ad.Activo,
          u.Nombre AS ProfesorNombre,
          u.PrimerApellido AS ProfesorPrimerApellido,
          u.SegundoApellido AS ProfesorSegundoApellido,
          ISNULL(ma.TotalEstudiantes, 0) AS TotalEstudiantes,
          COALESCE(epSesion.EvaluacionPlantillaId, ep.EvaluacionPlantillaId) AS EvaluacionPlantillaId,
          COALESCE(epSesion.Nombre, ep.Nombre) AS EvaluacionPlantillaNombre,
          COALESCE(epSesion.Estado, ep.Estado) AS EvaluacionPlantillaEstado,
          CASE WHEN eg.EstructuraGrupoId IS NULL THEN 0 ELSE 1 END AS TieneEstructuraEvaluacion,
          CAST(0 AS bit) AS TieneCalificacionesEvaluacion,
          CASE WHEN cc.Estado = N'CERRADO_DOCENTE' THEN 1 ELSE 0 END AS CursoCerrado,
          cc.Estado AS CierreCursoEstado,
          cc.CerradoAt AS CierreCursoCerradoAt,
          cc.ReabiertoAt AS CierreCursoReabiertoAt
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
        LEFT JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
        INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
        OUTER APPLY (
          SELECT COUNT(DISTINCT ma2.MatriculaId) AS TotalEstudiantes
          FROM dbo.Matricula ma2
          WHERE ma2.GrupoId = ad.GrupoId
            AND ma2.AnioLectivoId = ad.AnioLectivoId
            AND ma2.Estado <> N'Inactiva'
        ) ma
        OUTER APPLY (
          SELECT TOP 1
            ep2.EvaluacionPlantillaId,
            ep2.Nombre,
            ep2.Estado
          FROM dbo.EvaluacionPlantilla ep2
          WHERE ep2.InstitucionId = ad.InstitucionId
            AND ep2.AnioLectivoId = ad.AnioLectivoId
            AND ep2.PeriodoId = ad.PeriodoId
            AND ep2.MateriaId = ad.MateriaId
            AND ep2.Activo = 1
          ORDER BY
            CASE WHEN ep2.Estado = N'ACTIVA' THEN 0 ELSE 1 END,
            ep2.EvaluacionPlantillaId DESC
        ) ep
        OUTER APPLY (
          SELECT TOP 1
            eg2.EstructuraGrupoId,
            eg2.PlantillaBaseId
          FROM dbo.Eval360_EstructuraGrupo eg2
          WHERE eg2.InstitucionId = ad.InstitucionId
            AND eg2.GrupoId = ad.GrupoId
            AND eg2.MateriaId = ad.MateriaId
            AND eg2.AnioLectivoId = ad.AnioLectivoId
            AND eg2.PeriodoId = ad.PeriodoId
            AND eg2.GrupoClaseId IS NULL
            AND eg2.Activo = 1
          ORDER BY eg2.EstructuraGrupoId DESC
        ) eg
        LEFT JOIN dbo.EvaluacionPlantilla epSesion
          ON epSesion.EvaluacionPlantillaId = eg.PlantillaBaseId
        OUTER APPLY (
          SELECT TOP 1
            c.Estado,
            c.CerradoAt,
            c.ReabiertoAt
          FROM dbo.CierreAcademicoCurso c
          WHERE c.InstitucionId = ad.InstitucionId
            AND c.GrupoId = ad.GrupoId
            AND c.MateriaId = ad.MateriaId
            AND c.AnioLectivoId = ad.AnioLectivoId
            AND c.PeriodoId = ad.PeriodoId
            AND c.GrupoClaseId IS NULL
            AND c.Activo = 1
          ORDER BY c.UpdatedAt DESC, c.CierreAcademicoCursoId DESC
        ) cc
        WHERE ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          AND (@anioLectivoId IS NULL OR ad.AnioLectivoId = @anioLectivoId)
          AND (@periodoId IS NULL OR ad.PeriodoId = @periodoId)
          AND (@materiaId IS NULL OR ad.MateriaId = @materiaId)
          AND (@grupoId IS NULL OR ad.GrupoId = @grupoId)
          AND (
            @q = N'%%'
            OR g.Nombre LIKE @q
            OR ISNULL(g.Nivel, N'') LIKE @q
            OR ISNULL(m.Nombre, N'') LIKE @q
            OR ISNULL(m.Codigo, N'') LIKE @q
            OR ISNULL(p.Nombre, N'') LIKE @q
            OR ISNULL(al.Nombre, N'') LIKE @q
          )
          ${filtroInstitucion}
          ${filtroProfesor}
          ${filtroPeriodoProfesor}
          ${filtroGrado}
        ORDER BY al.Nombre DESC, p.NumeroOrden, g.Nombre, m.Nombre
        OPTION (MAXDOP 1, MAX_GRANT_PERCENT = 0.5)
      `);
      perfTrace.listadoMs = Date.now() - tMisGrupos;
      perfTrace.listadoRows = result.recordset?.length || 0;
      perfTrace.poolAfterListado = getPoolPerfStats(pool);
      console.log(`[SQL][gestion.mis-grupos.listado] ${perfTrace.listadoMs}ms`);

      const asignacionIds = Array.from(new Set(
        (result.recordset || [])
          .map((item: any) => Number(item.AsignacionDocenteId))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      ));

      if (asignacionIds.length > 0) {
        const tCalificaciones = Date.now();
        const calificacionesRequest = pool.request();
        let calificacionesCanceladasPorTiempo = false;
        const calificacionesTimeout = setTimeout(() => {
          calificacionesCanceladasPorTiempo = true;
          calificacionesRequest.cancel();
        }, 2500);
        const asignacionParams = asignacionIds.map((asignacionId, index) => {
          const paramName = `asignacionId${index}`;
          calificacionesRequest.input(paramName, sql.Int, asignacionId);
          return `@${paramName}`;
        });

        try {
          const calificacionesResult = await calificacionesRequest.query(`
            SET NOCOUNT ON;
            SET LOCK_TIMEOUT 1500;

            BEGIN TRY
              SELECT
                ad.AsignacionDocenteId,
                CAST(CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM dbo.Eval360_Actividad act
                    INNER JOIN dbo.Eval360_NotaActividad na ON na.ActividadId = act.ActividadId
                    WHERE act.EstructuraGrupoId = eg.EstructuraGrupoId
                      AND (
                        (na.PuntosObtenidos IS NOT NULL AND na.PuntosObtenidos > 0)
                        OR (na.PorcentajeObtenido IS NOT NULL AND na.PorcentajeObtenido > 0)
                      )
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.Eval360_Actividad act
                    INNER JOIN dbo.Eval360_SeguimientoIndicador si ON si.ActividadId = act.ActividadId
                    WHERE act.EstructuraGrupoId = eg.EstructuraGrupoId
                      AND ISNULL(si.ValorSeleccionado, 0) > 0
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM dbo.AsistenciaRegistro ar
                    WHERE ar.GrupoId = ad.GrupoId
                      AND ar.MateriaId = ad.MateriaId
                      AND ar.AnioLectivoId = ad.AnioLectivoId
                      AND ar.PeriodoId = ad.PeriodoId
                  )
                  THEN 1
                  ELSE 0
                END AS bit) AS TieneCalificacionesEvaluacion
              FROM dbo.AsignacionDocente ad
              OUTER APPLY (
                SELECT TOP 1 eg2.EstructuraGrupoId
                FROM dbo.Eval360_EstructuraGrupo eg2
                WHERE eg2.InstitucionId = ad.InstitucionId
                  AND eg2.GrupoId = ad.GrupoId
                  AND eg2.MateriaId = ad.MateriaId
                  AND eg2.AnioLectivoId = ad.AnioLectivoId
                  AND eg2.PeriodoId = ad.PeriodoId
                  AND eg2.Activo = 1
                ORDER BY eg2.EstructuraGrupoId DESC
              ) eg
              WHERE ad.AsignacionDocenteId IN (${asignacionParams.join(", ")})
              OPTION (MAXDOP 1, MAX_GRANT_PERCENT = 0.5);

              SET LOCK_TIMEOUT -1;
            END TRY
            BEGIN CATCH
              SET LOCK_TIMEOUT -1;
              THROW;
            END CATCH;
          `);

          const calificacionesPorAsignacion = new Map<number, number>(
            (calificacionesResult.recordset || []).map((item: any) => [
              Number(item.AsignacionDocenteId),
              Number(item.TieneCalificacionesEvaluacion || 0)
            ])
          );
          for (const item of result.recordset || []) {
            item.TieneCalificacionesEvaluacion =
              calificacionesPorAsignacion.get(Number(item.AsignacionDocenteId)) || 0;
          }
          perfTrace.calificacionesRows = calificacionesResult.recordset?.length || 0;
        } catch (error: any) {
          const sqlErrors = [
            error,
            error?.originalError?.info,
            ...(Array.isArray(error?.precedingErrors) ? error.precedingErrors : [])
          ];
          const isLockTimeout = sqlErrors.some((item) => Number(item?.number) === 1222);
          if (!isLockTimeout && !calificacionesCanceladasPorTiempo) throw error;

          // Ante contencion, conservar la regla mas restrictiva: no permitir cambiar plantilla.
          for (const item of result.recordset || []) {
            item.TieneCalificacionesEvaluacion = 1;
          }
          perfTrace.calificacionesFallback = calificacionesCanceladasPorTiempo
            ? "request-timeout"
            : "lock-timeout";
          console.warn(
            `[SQL][gestion.mis-grupos.calificaciones] ${perfTrace.calificacionesFallback}; usando estado conservador`
          );
        } finally {
          clearTimeout(calificacionesTimeout);
          perfTrace.calificacionesMs = Date.now() - tCalificaciones;
          console.log(`[SQL][gestion.mis-grupos.calificaciones] ${perfTrace.calificacionesMs}ms`);
        }
      } else {
        perfTrace.calificacionesMs = 0;
        perfTrace.calificacionesRows = 0;
      }

    let gruposClaseRows: any[] = [];
    const tGrupoClaseSchema = Date.now();
    const grupoClaseSchemaReady = await hasGrupoClaseSchema(pool);
    perfTrace.schemaGrupoClaseMs = Date.now() - tGrupoClaseSchema;
    perfTrace.grupoClaseSchemaReady = grupoClaseSchemaReady;
    console.log(`[SQL][gestion.mis-grupos.schema-grupo-clase] ${perfTrace.schemaGrupoClaseMs}ms`);
    if (grupoClaseSchemaReady) {
      await pool.request().query(`
        IF OBJECT_ID(N'dbo.Eval360_EstructuraGrupo', N'U') IS NOT NULL
           AND COL_LENGTH(N'dbo.Eval360_EstructuraGrupo', N'GrupoClaseId') IS NULL
        BEGIN
          ALTER TABLE dbo.Eval360_EstructuraGrupo ADD GrupoClaseId INT NULL;
        END;
      `);

      const usuarioFiltroGrupoClase = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
        ? userId
        : profesorId;
      const tGruposClase = Date.now();
      const clasesResult = await pool.request()
        .input("institucionId", sql.Int, institucionFiltroId)
        .input("usuarioFiltroId", sql.Int, usuarioFiltroGrupoClase)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("materiaId", sql.Int, materiaId)
        .input("grupoId", sql.Int, grupoId)
        .input("grado", sql.NVarChar(20), grado || null)
        .input("q", sql.NVarChar(250), q)
        .query(`
          SELECT
            COALESCE(ad.AsignacionDocenteId, 0) AS AsignacionDocenteId,
            docente.UsuarioId,
            gc.InstitucionId,
            gc.GrupoClaseId,
            gc.GrupoIdPrincipal AS GrupoId,
            gc.Nombre AS GrupoNombre,
            gp.Nivel AS GrupoNivel,
            gp.Jornada AS GrupoJornada,
            gp.NivelAcademico AS GrupoNivelAcademico,
            gp.Especialidad AS GrupoEspecialidad,
            gc.MateriaId,
            m.Nombre AS MateriaNombre,
            m.Codigo AS MateriaCodigo,
            gc.AnioLectivoId,
            al.Nombre AS AnioNombre,
            p.PeriodoId,
            p.Nombre AS PeriodoNombre,
            N'GRUPO_CLASE' AS TipoAsignacion,
            gc.Activo,
            docente.Nombre AS ProfesorNombre,
            docente.PrimerApellido AS ProfesorPrimerApellido,
            docente.SegundoApellido AS ProfesorSegundoApellido,
            (SELECT COUNT(*)
             FROM dbo.GrupoClaseEstudiante gce
             WHERE gce.GrupoClaseId = gc.GrupoClaseId
               AND gce.Activo = 1) AS TotalEstudiantes,
            CAST(CASE WHEN EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseLeccionPatron patron
              WHERE patron.GrupoClaseId = gc.GrupoClaseId
                AND patron.Activo = 1
                AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.HorarioGrupo hg
                  INNER JOIN dbo.GrupoMateria gm
                    ON gm.GrupoMateriaId = hg.GrupoMateriaId
                   AND gm.Activo = 1
                  WHERE hg.DiaSemana = patron.DiaSemana
                    AND hg.BloqueHorarioId = patron.BloqueHorarioId
                    AND hg.Activo = 1
                    AND gm.MateriaId = gc.MateriaId
                    AND (gm.PeriodoId = p.PeriodoId OR gm.PeriodoId IS NULL)
                    AND EXISTS (
                      SELECT 1
                      FROM dbo.GrupoClaseSeccion gcsHorario
                      WHERE gcsHorario.GrupoClaseId = gc.GrupoClaseId
                        AND gcsHorario.GrupoId = gm.GrupoId
                        AND gcsHorario.Activo = 1
                    )
                )
            ) THEN 1 ELSE 0 END AS bit) AS SinHorario,
            epSesion.EvaluacionPlantillaId AS EvaluacionPlantillaId,
            epSesion.Nombre AS EvaluacionPlantillaNombre,
            epSesion.Estado AS EvaluacionPlantillaEstado,
            CASE WHEN eg.EstructuraGrupoId IS NULL THEN 0 ELSE 1 END AS TieneEstructuraEvaluacion,
            CAST(0 AS bit) AS TieneCalificacionesEvaluacion,
            CAST(CASE WHEN cc.Estado = N'${CIERRE_CURSO_ESTADO_CERRADO}' THEN 1 ELSE 0 END AS bit) AS CursoCerrado,
            cc.Estado AS CierreCursoEstado,
            cc.CerradoAt AS CierreCursoCerradoAt,
            cc.ReabiertoAt AS CierreCursoReabiertoAt,
            STUFF((
              SELECT N',' + CONVERT(nvarchar(20), gcs2.GrupoId)
              FROM dbo.GrupoClaseSeccion gcs2
              WHERE gcs2.GrupoClaseId = gc.GrupoClaseId
                AND gcs2.Activo = 1
              ORDER BY gcs2.GrupoId
              FOR XML PATH(N''), TYPE
            ).value(N'.', N'nvarchar(max)'), 1, 1, N'') AS GrupoIdsOrigenCsv,
            STUFF((
              SELECT N',' + CONVERT(nvarchar(20), gcd2.UsuarioId)
              FROM dbo.GrupoClaseDocente gcd2
              WHERE gcd2.GrupoClaseId = gc.GrupoClaseId
                AND gcd2.Activo = 1
              ORDER BY gcd2.UsuarioId
              FOR XML PATH(N''), TYPE
            ).value(N'.', N'nvarchar(max)'), 1, 1, N'') AS UsuarioIdsCsv,
            STUFF((
              SELECT N', ' + g2.Nombre
              FROM dbo.GrupoClaseSeccion gcs2
              INNER JOIN dbo.Grupo g2 ON g2.GrupoId = gcs2.GrupoId
              WHERE gcs2.GrupoClaseId = gc.GrupoClaseId
                AND gcs2.Activo = 1
              ORDER BY g2.Nombre
              FOR XML PATH(N''), TYPE
            ).value(N'.', N'nvarchar(max)'), 1, 2, N'') AS SeccionesOrigen
          FROM dbo.GrupoClase gc
          INNER JOIN dbo.Grupo gp ON gp.GrupoId = gc.GrupoIdPrincipal
          INNER JOIN dbo.Materia m ON m.MateriaId = gc.MateriaId
          INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
          INNER JOIN dbo.Periodo p
            ON (
              gc.AplicaTodosPeriodos = 1
              AND p.AnioLectivoId = gc.AnioLectivoId
              AND p.Activo = 1
            ) OR (
              gc.AplicaTodosPeriodos = 0
              AND p.PeriodoId = gc.PeriodoId
            )
          OUTER APPLY (
            SELECT TOP 1
              gcd.UsuarioId,
              u.Nombre,
              u.PrimerApellido,
              u.SegundoApellido
            FROM dbo.GrupoClaseDocente gcd
            INNER JOIN dbo.Usuario u ON u.UsuarioId = gcd.UsuarioId
            WHERE gcd.GrupoClaseId = gc.GrupoClaseId
              AND gcd.Activo = 1
              AND (@usuarioFiltroId IS NULL OR gcd.UsuarioId = @usuarioFiltroId)
            ORDER BY
              CASE WHEN gcd.UsuarioId = @usuarioFiltroId THEN 0 ELSE 1 END,
              gcd.EsPrincipal DESC,
              gcd.GrupoClaseDocenteId
          ) docente
          OUTER APPLY (
            SELECT TOP 1 ad2.AsignacionDocenteId
            FROM dbo.AsignacionDocente ad2
            WHERE ad2.InstitucionId = gc.InstitucionId
              AND ad2.UsuarioId = docente.UsuarioId
              AND ad2.GrupoId = gc.GrupoIdPrincipal
              AND ad2.MateriaId = gc.MateriaId
              AND ad2.AnioLectivoId = gc.AnioLectivoId
              AND ad2.PeriodoId = p.PeriodoId
              AND ad2.Activo = 1
            ORDER BY ad2.AsignacionDocenteId DESC
          ) ad
          OUTER APPLY (
            SELECT TOP 1
              eg2.EstructuraGrupoId,
              eg2.PlantillaBaseId
            FROM dbo.Eval360_EstructuraGrupo eg2
            WHERE eg2.InstitucionId = gc.InstitucionId
              AND eg2.GrupoId = gc.GrupoIdPrincipal
              AND eg2.MateriaId = gc.MateriaId
              AND eg2.AnioLectivoId = gc.AnioLectivoId
              AND eg2.PeriodoId = p.PeriodoId
              AND ISNULL(dbo.fn_GrupoClaseCanonicoId(eg2.GrupoClaseId), 0) = dbo.fn_GrupoClaseCanonicoId(gc.GrupoClaseId)
              AND eg2.Activo = 1
            ORDER BY eg2.EstructuraGrupoId DESC
          ) eg
          LEFT JOIN dbo.EvaluacionPlantilla epSesion
            ON epSesion.EvaluacionPlantillaId = eg.PlantillaBaseId
          OUTER APPLY (
            SELECT TOP 1
              c.Estado,
              c.CerradoAt,
              c.ReabiertoAt
            FROM dbo.CierreAcademicoCurso c
            WHERE c.InstitucionId = gc.InstitucionId
              AND c.GrupoId = gc.GrupoIdPrincipal
              AND c.MateriaId = gc.MateriaId
              AND c.AnioLectivoId = gc.AnioLectivoId
              AND c.PeriodoId = p.PeriodoId
              AND dbo.fn_GrupoClaseCanonicoId(c.GrupoClaseId) = dbo.fn_GrupoClaseCanonicoId(gc.GrupoClaseId)
              AND c.Activo = 1
            ORDER BY c.UpdatedAt DESC, c.CierreAcademicoCursoId DESC
          ) cc
          WHERE gc.Activo = 1
            AND gc.GrupoClaseCanonicoId IS NULL
            AND docente.UsuarioId IS NOT NULL
            AND (@institucionId IS NULL OR gc.InstitucionId = @institucionId)
            AND (@anioLectivoId IS NULL OR gc.AnioLectivoId = @anioLectivoId)
            AND (@periodoId IS NULL OR p.PeriodoId = @periodoId)
            AND (@materiaId IS NULL OR gc.MateriaId = @materiaId)
            AND (
              @grupoId IS NULL
              OR EXISTS (
                SELECT 1
                FROM dbo.GrupoClaseSeccion gcs
                WHERE gcs.GrupoClaseId = gc.GrupoClaseId
                  AND gcs.GrupoId = @grupoId
                  AND gcs.Activo = 1
              )
            )
            AND (
              @grado IS NULL
              OR EXISTS (
                SELECT 1
                FROM dbo.GrupoClaseSeccion gcs
                INNER JOIN dbo.Grupo g ON g.GrupoId = gcs.GrupoId
                WHERE gcs.GrupoClaseId = gc.GrupoClaseId
                  AND gcs.Activo = 1
                  AND LEFT(g.Nombre, CHARINDEX(N'-', g.Nombre + N'-') - 1) = @grado
              )
            )
            AND (
              @q = N'%%'
              OR gc.Nombre LIKE @q
              OR m.Nombre LIKE @q
              OR EXISTS (
                SELECT 1
                FROM dbo.GrupoClaseSeccion gcs
                INNER JOIN dbo.Grupo g ON g.GrupoId = gcs.GrupoId
                WHERE gcs.GrupoClaseId = gc.GrupoClaseId
                  AND gcs.Activo = 1
                  AND g.Nombre LIKE @q
              )
            )
            ${profesorPeriodoSchemaReady && isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? `
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.ProfesorPeriodoEstado ppe
              WHERE ppe.InstitucionId = gc.InstitucionId
                AND ppe.UsuarioId = docente.UsuarioId
                AND ppe.AnioLectivoId = gc.AnioLectivoId
                AND ppe.PeriodoId = p.PeriodoId
                AND ppe.Habilitado = 0
            )` : ""}
          ORDER BY al.Nombre DESC, p.NumeroOrden, gc.Nombre, m.Nombre
          OPTION (MAXDOP 1, MAX_GRANT_PERCENT = 0.5);
        `);
      perfTrace.gruposClaseMs = Date.now() - tGruposClase;
      gruposClaseRows = clasesResult.recordset || [];
      perfTrace.gruposClaseRows = gruposClaseRows.length;
      console.log(`[SQL][gestion.mis-grupos.grupos-clase] ${perfTrace.gruposClaseMs}ms`);
    }

    const gruposUnicos = new Map<string, any>();

    const coberturasGrupoClase = new Set<string>();
    for (const item of gruposClaseRows) {
      const grupoIdsOrigen = String(item.GrupoIdsOrigenCsv || "")
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      const usuarioIds = String(item.UsuarioIdsCsv || "")
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      for (const grupoOrigenId of grupoIdsOrigen) {
        for (const usuarioOrigenId of usuarioIds) {
          coberturasGrupoClase.add([
            usuarioOrigenId,
            grupoOrigenId,
            item.MateriaId,
            item.AnioLectivoId,
            item.PeriodoId
          ].join("|"));
        }
      }
    }

    const asignacionesBaseVisibles = (result.recordset || []).filter((item: any) => !coberturasGrupoClase.has([
      Number(item.UsuarioId || 0),
      Number(item.GrupoId || 0),
      Number(item.MateriaId || 0),
      Number(item.AnioLectivoId || 0),
      Number(item.PeriodoId || 0)
    ].join("|")));

    for (const item of [...asignacionesBaseVisibles, ...gruposClaseRows]) {
      const key = [
        item.GrupoClaseId || 0,
        item.GrupoId,
        item.MateriaId,
        item.AnioLectivoId,
        item.PeriodoId
      ].map((value) => String(value ?? "")).join("|");

      if (!gruposUnicos.has(key)) {
        gruposUnicos.set(key, item);
      }
    }

    const payload = Array.from(gruposUnicos.values());
    perfTrace.payloadRows = payload.length;
    bootstrapCache.set(cacheKey, { at: Date.now(), data: payload });
    return payload;
    })();
    bootstrapInFlight.set(cacheKey, loadPromise);

    let payload: any[];
    try {
      payload = await loadPromise;
    } finally {
      bootstrapInFlight.delete(cacheKey);
    }
    return ok(res, payload);
  } catch (error) {
    console.error("Error cargando mis grupos:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los grupos del profesor" });
  } finally {
    perfTrace.totalMs = Date.now() - tMisGruposTotal;
    console.log(`[PERF][gestion.mis-grupos.total] ${perfTrace.totalMs}ms`);
    writeLocalMisGruposPerfTrace(perfTrace);
  }
});

router.get("/apoyos-educativos/bootstrap", async (req, res) => {
  const t0 = Date.now();
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const pool = await getPool();
    const ready = await ensureApoyoEducativoTablesReady(pool);
    if (ready) await ensureApoyoEducativoInformeColumns(pool);

    const columnasEstudiante = await getEstudianteApoyoColumns(pool);

    const userId = getUserId(req);
    const grupoIds = parseCsvIds(req.query.grupoIds);
    const gruposCsv = grupoIds.join(",");

    const request = pool.request()
      .input("usuarioId", sql.Int, userId)
      .input("grupoIds", sql.NVarChar(sql.MAX), gruposCsv);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = !isSuperAdmin(req) ? "AND ad.UsuarioId = @usuarioId" : "";

    const baseCte = `
      ;WITH GruposBase AS (
        SELECT DISTINCT
          ad.InstitucionId,
          ad.AnioLectivoId,
          al.Nombre AS AnioNombre,
          ad.PeriodoId,
          p.Nombre AS PeriodoNombre,
          ad.GrupoId,
          g.Nombre AS GrupoNombre
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
        WHERE ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          ${filtroInstitucion}
          ${filtroProfesor}
      ),
      GruposFiltrados AS (
        SELECT *
        FROM GruposBase
        WHERE (
          NULLIF(@grupoIds, '') IS NULL
          OR GrupoId IN (
            SELECT DISTINCT TRY_CAST(value AS INT)
            FROM STRING_SPLIT(@grupoIds, ',')
            WHERE TRY_CAST(value AS INT) IS NOT NULL
          )
        )
      ),
      GruposFiltradosUnicos AS (
        SELECT
          GrupoId,
          MIN(PeriodoId) AS PeriodoId,
          MIN(PeriodoNombre) AS PeriodoNombre
        FROM GruposFiltrados
        GROUP BY GrupoId
      )
    `;

    const seccionesResult = await timedQuery("gestion.apoyos.bootstrap.secciones", () => request.query(`
      ${baseCte}
      SELECT
        GrupoId,
        GrupoNombre,
        AnioLectivoId,
        AnioNombre,
        PeriodoId,
        PeriodoNombre
      FROM GruposFiltrados
      ORDER BY GrupoNombre, AnioNombre DESC, PeriodoNombre
    `));

    const tieneAdecuacionSelect = columnasEstudiante.hasTieneAdecuacion
      ? "CAST(ISNULL(e.TieneAdecuacion, 0) AS BIT)"
      : "CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(e.Adecuacion, N''))), N'') IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END";
    const tipoAdecuacionSelect = columnasEstudiante.hasAdecuacion
      ? "NULLIF(LTRIM(RTRIM(e.Adecuacion)), '')"
      : "CAST(NULL AS NVARCHAR(250))";
    const adecuacionValidaWhere = columnasEstudiante.hasAdecuacion
      ? "NULLIF(LTRIM(RTRIM(ISNULL(e.Adecuacion, N''))), N'') IS NOT NULL AND UPPER(LTRIM(RTRIM(ISNULL(e.Adecuacion, N'')))) NOT IN (N'REGULAR', N'SIN ADECUACION', N'SIN ADECUACIÓN', N'SELECCIONE', N'NO')"
      : "1 = 1";
    const apoyoEducativoWhere = columnasEstudiante.hasTieneAdecuacion
      ? `ISNULL(e.TieneAdecuacion, 0) = 1 AND ${adecuacionValidaWhere}`
      : adecuacionValidaWhere;
    const nivelFuncionamientoSelect = columnasEstudiante.hasNivelFuncionamiento
      ? "NULLIF(LTRIM(RTRIM(e.NivelFuncionamiento)), '')"
      : "CAST(NULL AS NVARCHAR(250))";
    const observacionesSelect = columnasEstudiante.hasObservaciones
      ? "NULLIF(LTRIM(RTRIM(e.Observaciones)), '')"
      : "CAST(NULL AS NVARCHAR(MAX))";
    const apoyoEducativoWhereStrict = `${apoyoEducativoWhere} AND UPPER(LTRIM(RTRIM(ISNULL(e.Adecuacion, N'')))) IN (N'SIGNIFICATIVA', N'NO SIGNIFICATIVA', N'TODAS')`;

    const estudiantesResult = await timedQuery("gestion.apoyos.bootstrap.estudiantes", () => request.query(`
      ${baseCte}
      SELECT DISTINCT
        e.EstudianteId,
        e.Identificacion,
        LTRIM(RTRIM(CONCAT(ISNULL(e.Nombre, ''), ' ', ISNULL(e.PrimerApellido, ''), ' ', ISNULL(e.SegundoApellido, '')))) AS NombreCompleto,
        CASE
          WHEN e.FechaNacimiento IS NULL THEN NULL
          ELSE DATEDIFF(YEAR, e.FechaNacimiento, CAST(GETDATE() AS DATE))
               - CASE
                   WHEN DATEADD(YEAR, DATEDIFF(YEAR, e.FechaNacimiento, CAST(GETDATE() AS DATE)), e.FechaNacimiento) > CAST(GETDATE() AS DATE)
                   THEN 1 ELSE 0
                 END
        END AS Edad,
        gf.GrupoId,
        gf.GrupoNombre AS Seccion,
        gf.PeriodoId,
        gf.PeriodoNombre,
        ${tieneAdecuacionSelect} AS TieneAdecuacion,
        ${tipoAdecuacionSelect} AS TipoAdecuacion,
        ${nivelFuncionamientoSelect} AS NivelFuncionamiento,
        ${observacionesSelect} AS Observaciones
      FROM GruposFiltrados gf
      INNER JOIN dbo.Matricula ma
        ON ma.GrupoId = gf.GrupoId
       AND ma.AnioLectivoId = gf.AnioLectivoId
       AND ma.Estado <> N'Inactiva'
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = ma.EstudianteId
       AND e.Activo = 1
      WHERE ${apoyoEducativoWhereStrict}
      ORDER BY gf.GrupoNombre, NombreCompleto
    `));

    const adecuacionesResult = ready
      ? await timedQuery("gestion.apoyos.bootstrap.adecuaciones", () => request.query(`
          SELECT
            a.AdecuacionCatalogoId,
            a.TipoAdecuacionId,
            ta.Descripcion AS Adecuacion,
            a.Tipo,
            a.Descripcion,
            ta.Descripcion AS TipoAdecuacion
          FROM dbo.AdecuacionCatalogo a
          INNER JOIN dbo.TipoAdecuacion ta
            ON ta.TipoAdecuacionId = a.TipoAdecuacionId
          WHERE a.Activo = 1
            AND ta.Activo = 1
            AND UPPER(LTRIM(RTRIM(ISNULL(ta.Descripcion, N'')))) IN (N'SIGNIFICATIVA', N'NO SIGNIFICATIVA', N'TODAS')
            AND UPPER(LTRIM(RTRIM(ISNULL(ta.Descripcion, N'')))) NOT IN (N'REGULAR', N'SIN ADECUACION', N'SIN ADECUACIÓN', N'SELECCIONE', N'NO')
            ${!isSuperAdmin(req) ? "AND a.InstitucionId = @institucionId" : ""}
          ORDER BY ta.Descripcion, a.Tipo, a.Descripcion
        `))
      : { recordset: [] as any[] };

    const informesResult = ready
      ? await timedQuery("gestion.apoyos.bootstrap.informes", () => request.query(`
          ${baseCte}
          SELECT TOP (500)
            ae.ApoyoEducativoId,
            aee.ApoyoEducativoEstudianteId,
            aee.EstudianteId,
            aee.GrupoId,
            gf.PeriodoId,
            gf.PeriodoNombre,
            aee.InformeNombre,
            aee.InformeGeneradoAt,
            aee.PlantillaNombre
          FROM dbo.ApoyoEducativoEstudiante aee
          INNER JOIN dbo.ApoyoEducativo ae
            ON ae.ApoyoEducativoId = aee.ApoyoEducativoId
           AND ae.Activo = 1
          INNER JOIN GruposFiltradosUnicos gf
            ON gf.GrupoId = aee.GrupoId
          WHERE aee.InformeGeneradoAt IS NOT NULL
            AND aee.InformeNombre IS NOT NULL
            AND ae.UsuarioId = @usuarioId
          ORDER BY aee.InformeGeneradoAt DESC, aee.ApoyoEducativoEstudianteId DESC
        `))
      : { recordset: [] as any[] };

    console.log(`[gestion.apoyos.bootstrap.total] ${Date.now() - t0}ms`);

    return ok(res, {
      secciones: seccionesResult.recordset,
      estudiantes: estudiantesResult.recordset,
      adecuaciones: adecuacionesResult.recordset,
      informes: informesResult.recordset,
      soporteGeneracion: ready
    });
  } catch (error) {
    console.error("Error cargando apoyos educativos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la información de apoyos educativos" });
  }
});

router.post("/apoyos-educativos/generar", uploadApoyoEducativo.single("plantilla"), async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const ready = await ensureApoyoEducativoTablesReady(pool);
    if (!ready) {
      return badRequest(res, "Debés correr primero el script de BD de apoyos educativos para habilitar esta función");
    }

    await ensureApoyoEducativoInformeColumns(pool);

    const userId = getUserId(req);
    const institucionId = isSuperAdmin(req)
      ? toOptionalNumber(req.body?.institucionId)
      : getInstitutionId(req, res);
    if (!institucionId) return;

    const grupoIds = parseMaybeJsonArray(req.body?.grupoIds)
      .map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0);
    const periodoId = toOptionalNumber(req.body?.periodoId);
    const estudianteIds = parseMaybeJsonArray(req.body?.estudianteIds)
      .map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0);
    const adecuacionIds = parseMaybeJsonArray(req.body?.adecuacionIds)
      .map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0);
    const plantillaNombre = String((req as any).file?.originalname || req.body?.plantillaNombre || "plantilla-apoyos-educativos.docx").slice(0, 255);

    if (!grupoIds.length) {
      return badRequest(res, "Seleccioná al menos una sección");
    }
    if (!estudianteIds.length) {
      return badRequest(res, "Seleccioná al menos un estudiante");
    }
    if (!adecuacionIds.length) {
      return badRequest(res, "Seleccioná al menos un apoyo educativo");
    }

    const request = pool.request()
      .input("usuarioId", sql.Int, userId)
      .input("institucionId", sql.Int, institucionId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoIds", sql.NVarChar(sql.MAX), grupoIds.join(","))
      .input("estudianteIds", sql.NVarChar(sql.MAX), estudianteIds.join(","))
      .input("adecuacionIds", sql.NVarChar(sql.MAX), adecuacionIds.join(","));

    const filtroProfesor = !isSuperAdmin(req) ? "AND ad.UsuarioId = @usuarioId" : "";

    const gruposPermitidosResult = await request.query(`
      ;WITH GruposPermitidos AS (
        SELECT DISTINCT ad.GrupoId
        FROM dbo.AsignacionDocente ad
        WHERE ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          AND ad.InstitucionId = @institucionId
          AND (@periodoId IS NULL OR ad.PeriodoId = @periodoId)
          ${filtroProfesor}
      )
      SELECT GrupoId
      FROM GruposPermitidos
      WHERE GrupoId IN (
        SELECT DISTINCT TRY_CAST(value AS INT)
        FROM STRING_SPLIT(@grupoIds, ',')
        WHERE TRY_CAST(value AS INT) IS NOT NULL
      )
    `);

    const gruposPermitidos = new Set<number>((gruposPermitidosResult.recordset || []).map((item: any) => Number(item.GrupoId)));
    if (gruposPermitidos.size !== grupoIds.length) {
      return forbidden(res, "Hay secciones seleccionadas que no pertenecen a tus grupos asignados");
    }

    const estudiantesPermitidosResult = await request.query(`
      SELECT DISTINCT
        ma.EstudianteId,
        ma.GrupoId,
        g.Nombre AS Seccion,
        al.Nombre AS AnioNombre,
        adPeriodo.PeriodoId,
        p.Nombre AS PeriodoNombre,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        e.FechaNacimiento,
        e.Adecuacion AS TipoAdecuacion,
        e.NivelFuncionamiento,
        e.Observaciones,
        enc.NombreCompleto AS EncargadoNombre,
        enc.Parentesco AS EncargadoParentesco
      FROM dbo.Matricula ma
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = ma.EstudianteId
       AND e.Activo = 1
      INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ma.AnioLectivoId
      OUTER APPLY (
        SELECT TOP 1 ad2.PeriodoId
        FROM dbo.AsignacionDocente ad2
        WHERE ad2.GrupoId = ma.GrupoId
          AND ad2.AnioLectivoId = ma.AnioLectivoId
          AND ad2.InstitucionId = @institucionId
          AND ad2.Activo = 1
          AND (@periodoId IS NULL OR ad2.PeriodoId = @periodoId)
        ORDER BY ad2.PeriodoId DESC
      ) adPeriodo
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = adPeriodo.PeriodoId
      OUTER APPLY (
        SELECT TOP 1
          LTRIM(RTRIM(CONCAT(ISNULL(en.Nombre, ''), ' ', ISNULL(en.PrimerApellido, ''), ' ', ISNULL(en.SegundoApellido, '')))) AS NombreCompleto,
          COALESCE(
            NULLIF(LTRIM(RTRIM(ee.Parentesco)), ''),
            CASE
              WHEN UPPER(ISNULL(en.TipoEncargado, '')) = 'MADRE' THEN N'Madre de familia'
              WHEN UPPER(ISNULL(en.TipoEncargado, '')) = 'PADRE' THEN N'Padre de familia'
              ELSE N'Encargado legal'
            END
          ) AS Parentesco
        FROM dbo.EstudianteEncargado ee
        INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
        WHERE ee.EstudianteId = e.EstudianteId
          AND ee.Activo = 1
        ORDER BY ee.EsPrincipal DESC, ee.EstudianteEncargadoId DESC
      ) enc
      WHERE ma.Estado <> N'Inactiva'
        AND ma.GrupoId IN (
          SELECT DISTINCT TRY_CAST(value AS INT)
          FROM STRING_SPLIT(@grupoIds, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
        )
        AND ma.EstudianteId IN (
          SELECT DISTINCT TRY_CAST(value AS INT)
          FROM STRING_SPLIT(@estudianteIds, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
        )
    `);

    const estudiantesPermitidos = estudiantesPermitidosResult.recordset || [];
    const estudiantesPermitidosIds = new Set<number>(estudiantesPermitidos.map((item: any) => Number(item.EstudianteId)));
    if (estudiantesPermitidosIds.size !== estudianteIds.length) {
      return badRequest(res, "Hay estudiantes seleccionados que no pertenecen a las secciones elegidas");
    }

    const adecuacionesPermitidasResult = await request.query(`
      SELECT
        a.AdecuacionCatalogoId,
        a.TipoAdecuacionId,
        ta.Descripcion AS Adecuacion,
        a.Tipo,
        a.Descripcion
      FROM dbo.AdecuacionCatalogo a
      INNER JOIN dbo.TipoAdecuacion ta ON ta.TipoAdecuacionId = a.TipoAdecuacionId
      WHERE a.InstitucionId = @institucionId
        AND a.Activo = 1
        AND ta.Activo = 1
        AND a.AdecuacionCatalogoId IN (
          SELECT DISTINCT TRY_CAST(value AS INT)
          FROM STRING_SPLIT(@adecuacionIds, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
        )
    `);

    if ((adecuacionesPermitidasResult.recordset || []).length !== adecuacionIds.length) {
      return badRequest(res, "Hay apoyos educativos seleccionados que no están disponibles");
    }

    const institucionResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 Nombre, NombreComercial, NombreOficialBoleta, RegionalEducativa, CircuitoEducativo, CodigoPresupuestario, LogoUrl, MembreteUrl
        FROM dbo.Institucion
        WHERE InstitucionId = @institucionId
      `);
    const docenteResult = await pool.request()
      .input("usuarioId", sql.Int, userId)
      .query(`SELECT TOP 1 Titulo, Nombre, PrimerApellido, SegundoApellido FROM dbo.Usuario WHERE UsuarioId = @usuarioId`);
    const directoraResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          u.Titulo,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          u.Cargo
        FROM dbo.Usuario u
        LEFT JOIN dbo.UsuarioRol ur
          ON ur.UsuarioId = u.UsuarioId
         AND ur.Activo = 1
        LEFT JOIN dbo.Rol r
          ON r.RolId = ur.RolId
        WHERE u.InstitucionId = @institucionId
          AND u.Activo = 1
          AND (
            UPPER(ISNULL(u.Cargo, '')) LIKE '%DIRECTOR%'
            OR UPPER(ISNULL(r.Nombre, '')) LIKE '%DIRECTOR%'
          )
        ORDER BY
          CASE
            WHEN UPPER(ISNULL(u.Cargo, '')) LIKE '%DIRECTOR%' THEN 0
            WHEN UPPER(ISNULL(r.Nombre, '')) LIKE '%DIRECTOR%' THEN 1
            ELSE 2
          END,
          u.UsuarioId
      `);
    const materiasResult = await request.query(`
      SELECT DISTINCT m.Nombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
      WHERE ad.Activo = 1
        AND ad.InstitucionId = @institucionId
        ${filtroProfesor}
        AND ad.GrupoId IN (
          SELECT DISTINCT TRY_CAST(value AS INT)
          FROM STRING_SPLIT(@grupoIds, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
        )
      ORDER BY m.Nombre
    `);

    const institucion = institucionResult.recordset[0] || {};
    const docente = docenteResult.recordset[0] || {};
    const directora = directoraResult.recordset[0] || {};
    const docenteNombre = joinNameParts([docente.Titulo, docente.Nombre, docente.PrimerApellido, docente.SegundoApellido]);
    const directoraNombre = joinNameParts([directora.Titulo, directora.Nombre, directora.PrimerApellido, directora.SegundoApellido]);
    const materiasTexto = (materiasResult.recordset || []).map((item: any) => normalizeText(item.Nombre)).filter(Boolean).join(", ");
    const responsable = docenteNombre;
    const puestoDocente = materiasTexto ? `Docente de ${materiasTexto}` : "Docente";
    const directoraPuesto = normalizeText(directora.Cargo || "") || "Directora del Centro Educativo";
    const catalogos = adecuacionesPermitidasResult.recordset || [];
    const informesPreparados: any[] = [];

    for (const estudiante of estudiantesPermitidos) {
      const estudianteNombre = joinNameParts([estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido]);
      const contextoInforme = {
        estudianteNombre,
        tipoAdecuacion: estudiante.TipoAdecuacion,
        nivelFuncionamiento: estudiante.NivelFuncionamiento,
        observaciones: estudiante.Observaciones,
        responsable
      };
      const textosIA = await generarTextosApoyoConIA(contextoInforme, catalogos);
      const items = catalogos.map((catalogo: any) => {
        const tipo = classifyApoyoTipo(catalogo.Tipo);
        const ai = textosIA.get(Number(catalogo.AdecuacionCatalogoId)) || metodoFallback(catalogo.Descripcion, catalogo.Tipo || "");
        return {
          id: Number(catalogo.AdecuacionCatalogoId),
          seccion: tipo === "evaluacion" ? "curricular" : tipo,
          modo: tipo === "evaluacion" ? "evaluativa" : "metodologica",
          estrategia: catalogo.Descripcion,
          intensidad: ai.intensidad,
          evidencia: ai.evidencia,
          observaciones: ai.observaciones
        };
      });
      const dataInforme = {
        regional: institucion.RegionalEducativa || "",
        circuito: institucion.CircuitoEducativo || "",
        institucion: institucion.NombreOficialBoleta || institucion.NombreComercial || institucion.Nombre || "",
        codigoPresupuestario: institucion.CodigoPresupuestario || "",
        membreteUrl: institucion.MembreteUrl || "",
        logoUrl: institucion.LogoUrl || "",
        docente: docenteNombre,
        asignaturas: materiasTexto,
        responsable,
        seccion: estudiante.Seccion,
        cursoLectivo: estudiante.AnioNombre,
        periodoLectivo: estudiante.PeriodoNombre,
        fecha: formatDateApoyoCR(),
        estudianteNombre,
        edad: edadAniosMeses(estudiante.FechaNacimiento),
        nivelFuncionamiento: estudiante.NivelFuncionamiento || "",
        observaciones: estudiante.Observaciones || "",
        encargado: estudiante.EncargadoNombre || "",
        encargadoParentesco: estudiante.EncargadoParentesco || "Encargado legal",
        tipoAdecuacion: estudiante.TipoAdecuacion || "",
        directoraNombre,
        directoraPuesto,
        puestoDocente,
        items
      };
      const baseBuffer = await buildApoyoEducativoDocx(dataInforme);
      const buffer = await applyTemplateHeaderFooter(baseBuffer, (req as any).file?.buffer || null);
      const informeNombre = `informe-apoyo-${String(estudianteNombre || estudiante.EstudianteId).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80)}.docx`;
      informesPreparados.push({ estudiante, dataInforme, buffer, informeNombre });
    }

    await transaction.begin();

    const headerResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, userId)
      .query(`
        INSERT INTO dbo.ApoyoEducativo
        (
          InstitucionId,
          UsuarioId,
          CreatedAt,
          UpdatedAt,
          Activo
        )
        OUTPUT INSERTED.ApoyoEducativoId
        VALUES
        (
          @institucionId,
          @usuarioId,
          SYSDATETIME(),
          SYSDATETIME(),
          1
        )
      `);

    const apoyoEducativoId = Number(headerResult.recordset[0]?.ApoyoEducativoId || 0);
    if (!apoyoEducativoId) {
      throw new Error("No se pudo generar el encabezado del apoyo educativo");
    }

    const informesGenerados: any[] = [];
    for (const item of informesPreparados) {
      const estudiante = item.estudiante;
      const inserted = await new sql.Request(transaction)
        .input("apoyoEducativoId", sql.Int, apoyoEducativoId)
        .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
        .input("grupoId", sql.Int, Number(estudiante.GrupoId))
        .input("informeNombre", sql.NVarChar(255), item.informeNombre)
        .input("informeMimeType", sql.NVarChar(150), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .input("informeDocx", sql.VarBinary(sql.MAX), item.buffer)
        .input("plantillaNombre", sql.NVarChar(255), plantillaNombre)
        .input("datosInformeJson", sql.NVarChar(sql.MAX), JSON.stringify(item.dataInforme))
        .query(`
          INSERT INTO dbo.ApoyoEducativoEstudiante
          (
            ApoyoEducativoId,
            EstudianteId,
            GrupoId,
            InformeNombre,
            InformeMimeType,
            InformeDocx,
            InformeGeneradoAt,
            PlantillaNombre,
            DatosInformeJson,
            CreatedAt
          )
          OUTPUT INSERTED.ApoyoEducativoEstudianteId, INSERTED.InformeNombre, INSERTED.InformeGeneradoAt
          VALUES
          (
            @apoyoEducativoId,
            @estudianteId,
            @grupoId,
            @informeNombre,
            @informeMimeType,
            @informeDocx,
            SYSDATETIME(),
            @plantillaNombre,
            @datosInformeJson,
            SYSDATETIME()
          )
        `);
      informesGenerados.push({
        ApoyoEducativoEstudianteId: Number(inserted.recordset[0]?.ApoyoEducativoEstudianteId || 0),
        EstudianteId: Number(estudiante.EstudianteId),
        GrupoId: Number(estudiante.GrupoId),
        InformeNombre: item.informeNombre,
        InformeGeneradoAt: inserted.recordset[0]?.InformeGeneradoAt
      });
    }

    for (const adecuacionId of adecuacionIds) {
      await new sql.Request(transaction)
        .input("apoyoEducativoId", sql.Int, apoyoEducativoId)
        .input("adecuacionCatalogoId", sql.Int, Number(adecuacionId))
        .query(`
          INSERT INTO dbo.ApoyoEducativoDetalle
          (
            ApoyoEducativoId,
            AdecuacionCatalogoId,
            CreatedAt
          )
          VALUES
          (
            @apoyoEducativoId,
            @adecuacionCatalogoId,
            SYSDATETIME()
          )
        `);
    }

    await transaction.commit();

    return ok(res, {
      ApoyoEducativoId: apoyoEducativoId,
      totalEstudiantes: estudiantesPermitidos.length,
      totalAdecuaciones: adecuacionIds.length,
      informes: informesGenerados
    }, "Informes educativos generados correctamente");
  } catch (error) {
    if (transaction._aborted !== true && transaction._acquiredConnection) {
      try { await transaction.rollback(); } catch {}
    }
    console.error("Error generando apoyo educativo:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el apoyo educativo" });
  }
});

router.get("/apoyos-educativos/informes/:id/word", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return badRequest(res, "Informe inválido");

    const pool = await getPool();
    await ensureApoyoEducativoInformeColumns(pool);
    const request = pool.request()
      .input("id", sql.Int, id)
      .input("usuarioId", sql.Int, getUserId(req));

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ae.InstitucionId = @institucionId";
    }

    const result = await request.query(`
      SELECT TOP 1
        aee.InformeNombre,
        aee.InformeMimeType,
        aee.InformeDocx
      FROM dbo.ApoyoEducativoEstudiante aee
      INNER JOIN dbo.ApoyoEducativo ae
        ON ae.ApoyoEducativoId = aee.ApoyoEducativoId
       AND ae.Activo = 1
      WHERE aee.ApoyoEducativoEstudianteId = @id
        AND aee.InformeDocx IS NOT NULL
        AND ae.UsuarioId = @usuarioId
        ${filtroInstitucion}
    `);

    const row = result.recordset[0];
    if (!row?.InformeDocx) return res.status(404).json({ ok: false, message: "No se encontró el informe educativo" });

    const fileName = String(row.InformeNombre || `informe-apoyo-${id}.docx`).replace(/["\r\n]/g, "");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", row.InformeMimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(row.InformeDocx));
  } catch (error) {
    console.error("Error descargando informe educativo:", error);
    return res.status(500).json({ ok: false, message: "No se pudo descargar el informe educativo" });
  }
});

router.delete("/apoyos-educativos/informes/:id", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return badRequest(res, "Informe inválido");

    const pool = await getPool();
    await ensureApoyoEducativoInformeColumns(pool);
    const request = pool.request()
      .input("id", sql.Int, id)
      .input("usuarioId", sql.Int, getUserId(req));

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ae.InstitucionId = @institucionId";
    }

    const result = await request.query(`
      UPDATE aee
      SET InformeNombre = NULL,
          InformeMimeType = NULL,
          InformeDocx = NULL,
          InformeGeneradoAt = NULL,
          PlantillaNombre = NULL,
          DatosInformeJson = NULL
      OUTPUT INSERTED.ApoyoEducativoEstudianteId
      FROM dbo.ApoyoEducativoEstudiante aee
      INNER JOIN dbo.ApoyoEducativo ae
        ON ae.ApoyoEducativoId = aee.ApoyoEducativoId
       AND ae.Activo = 1
      WHERE aee.ApoyoEducativoEstudianteId = @id
        AND ae.UsuarioId = @usuarioId
        ${filtroInstitucion}
    `);

    if (!result.recordset.length) return res.status(404).json({ ok: false, message: "No se encontró el registro del informe educativo" });
    return ok(res, { ApoyoEducativoEstudianteId: id }, "Informe educativo eliminado correctamente");
  } catch (error) {
    console.error("Error eliminando informe educativo:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el informe educativo" });
  }
});


router.get("/mi-horario", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const pool = await getPool();
    await ensureMatriculaTrasladoHistorialTable(pool);
    const userId = getUserId(req);
    const profesorIdSolicitado = toOptionalNumber(req.query.profesorId);
    const puedeConsultarOtroProfesor = isInstitutionAdmin(req) || isSuperAdmin(req);
    if (profesorIdSolicitado && profesorIdSolicitado !== userId && !puedeConsultarOtroProfesor) {
      return forbidden(res, "No podés consultar el horario de otro profesor");
    }
    const horarioUsuarioId = profesorIdSolicitado || userId;
    let anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    let periodoId = toOptionalNumber(req.query.periodoId);

    let institucionId: number | null = null;
    if (!isSuperAdmin(req)) {
      institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
    } else {
      institucionId = toOptionalNumber(req.query.institucionId);
    }

    if (!institucionId) {
      return badRequest(res, "Debés indicar la institución para consultar el horario");
    }

    if (!anioLectivoId || !periodoId) {
      const asignacionBaseRequest = pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("usuarioId", sql.Int, horarioUsuarioId);

      const asignacionBase = await asignacionBaseRequest.query(`
        SELECT TOP 1
          ad.AnioLectivoId,
          ad.PeriodoId
        FROM dbo.AsignacionDocente ad
        LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
        WHERE ad.InstitucionId = @institucionId
          AND ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          AND ad.UsuarioId = @usuarioId
        ORDER BY
          ISNULL(al.Activo, 0) DESC,
          ad.AnioLectivoId DESC,
          ISNULL(p.NumeroOrden, 0) DESC,
          ad.PeriodoId DESC
      `);

      anioLectivoId = anioLectivoId || toOptionalNumber(asignacionBase.recordset[0]?.AnioLectivoId);
      periodoId = periodoId || toOptionalNumber(asignacionBase.recordset[0]?.PeriodoId);
    }

    if (!anioLectivoId || !periodoId) {
      return ok(res, { bloques: [], entradas: [] });
    }

    const bloques = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          bh.BloqueHorarioId,
          bh.Nombre,
          CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
          CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin,
          bh.OrdenVisual
        FROM dbo.BloqueHorario bh
        WHERE bh.InstitucionId = @institucionId
        ORDER BY bh.OrdenVisual, bh.HoraInicio
      `);

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, horarioUsuarioId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId);

    const entradas = await request.query(`
      ;WITH AsignacionesPeriodo AS (
        SELECT DISTINCT
          ad.GrupoId,
          ad.MateriaId,
          ad.AnioLectivoId,
          ad.PeriodoId
        FROM dbo.AsignacionDocente ad
        WHERE ad.InstitucionId = @institucionId
          AND ad.UsuarioId = @usuarioId
          AND ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          AND ad.AnioLectivoId = @anioLectivoId
          AND ad.PeriodoId = @periodoId
      ),
      HorariosCandidatos AS (
        SELECT
          hg.HorarioGrupoId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          ap.GrupoId,
          g.Nombre AS GrupoNombre,
          ap.MateriaId,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          ap.AnioLectivoId,
          al.Nombre AS AnioNombre,
          ap.PeriodoId AS PeriodoId,
          pFiltro.Nombre AS PeriodoNombre,
          CASE
            WHEN gm.PeriodoId = @periodoId THEN 0
            WHEN gm.PeriodoId IS NULL THEN 1
            ELSE 2
          END AS PrioridadPeriodo,
          CASE WHEN hd.HorarioDocenteId IS NULL THEN 1 ELSE 0 END AS PrioridadVinculoDocente,
          ABS(ISNULL(pHorario.NumeroOrden, 0) - ISNULL(pFiltro.NumeroOrden, 0)) AS DistanciaPeriodo
        FROM AsignacionesPeriodo ap
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = ap.GrupoId
         AND g.Activo = 1
         AND g.InstitucionId = @institucionId
         AND g.AnioLectivoId = ap.AnioLectivoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoId = ap.GrupoId
         AND gm.MateriaId = ap.MateriaId
         AND gm.Activo = 1
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.GrupoMateriaId = gm.GrupoMateriaId
         AND hg.Activo = 1
        LEFT JOIN dbo.HorarioDocente hd
          ON hd.HorarioGrupoId = hg.HorarioGrupoId
         AND hd.UsuarioId = @usuarioId
         AND hd.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = ap.MateriaId
         AND m.Activa = 1
        LEFT JOIN dbo.AnioLectivo al
          ON al.AnioLectivoId = ap.AnioLectivoId
        LEFT JOIN dbo.Periodo pHorario
          ON pHorario.PeriodoId = gm.PeriodoId
        LEFT JOIN dbo.Periodo pFiltro
          ON pFiltro.PeriodoId = @periodoId
        WHERE hd.HorarioDocenteId IS NOT NULL
           OR NOT EXISTS (
             SELECT 1
             FROM dbo.HorarioDocente hdExplicito
             INNER JOIN dbo.HorarioGrupo hgExplicito
               ON hgExplicito.HorarioGrupoId = hdExplicito.HorarioGrupoId
              AND hgExplicito.Activo = 1
             INNER JOIN dbo.GrupoMateria gmExplicito
               ON gmExplicito.GrupoMateriaId = hgExplicito.GrupoMateriaId
              AND gmExplicito.Activo = 1
             INNER JOIN dbo.Grupo gExplicito
               ON gExplicito.GrupoId = gmExplicito.GrupoId
              AND gExplicito.Activo = 1
              AND gExplicito.InstitucionId = @institucionId
              AND gExplicito.AnioLectivoId = @anioLectivoId
             WHERE hdExplicito.UsuarioId = @usuarioId
               AND hdExplicito.Activo = 1
               AND gmExplicito.GrupoId = ap.GrupoId
               AND gmExplicito.MateriaId = ap.MateriaId
               AND gmExplicito.PeriodoId = @periodoId
           )
      ),
      HorariosPriorizados AS (
        SELECT
          *,
          MIN(PrioridadPeriodo) OVER (PARTITION BY GrupoId, MateriaId) AS MejorPrioridadPeriodo
        FROM HorariosCandidatos
      ),
      EntradasBase AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY BloqueHorarioId, DiaSemana, GrupoId, MateriaId
            ORDER BY
              PrioridadVinculoDocente,
              DistanciaPeriodo,
              HorarioGrupoId DESC
          ) AS rn
        FROM HorariosPriorizados
        WHERE PrioridadPeriodo = MejorPrioridadPeriodo
      )
      SELECT
        HorarioGrupoId,
        BloqueHorarioId,
        DiaSemana,
        GrupoId,
        GrupoNombre,
        MateriaId,
        MateriaNombre,
        MateriaCodigo,
        AnioLectivoId,
        AnioNombre,
        PeriodoId,
        PeriodoNombre
      FROM EntradasBase
      WHERE rn = 1
      ORDER BY DiaSemana, BloqueHorarioId, GrupoNombre, MateriaNombre
    `);

    return ok(res, {
      bloques: bloques.recordset || [],
      entradas: entradas.recordset || []
    });
  } catch (error) {
    console.error("Error cargando mi horario:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el horario del profesor" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId", async (req, res) => {
  try {
    const t0 = Date.now();
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const userId = getUserId(req);
    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    const accessRequest = pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("usuarioId", sql.Int, userId);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      accessRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const tAccess = Date.now();
    const access = grupoClaseId
      ? { recordset: [await getAsignacionPermitida(
          req,
          res,
          grupoId,
          materiaId,
          anioLectivoId,
          periodoId,
          grupoClaseId
        )].filter(Boolean) }
      : await accessRequest.query(`
      SELECT TOP 1
        ad.AsignacionDocenteId,
        ad.InstitucionId,
        ad.GrupoId,
        ad.MateriaId,
        ad.AnioLectivoId,
        ad.PeriodoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
      INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
      WHERE ad.Activo = 1
        AND ad.GrupoId = @grupoId
        AND ad.MateriaId = @materiaId
        AND ad.AnioLectivoId = @anioLectivoId
        AND ad.PeriodoId = @periodoId
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    console.log(`[SQL][gestion.detalle.acceso] ${Date.now() - tAccess}ms`);
    const asignacion = access.recordset[0];
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar este grupo y materia");

    const tEstudiantes = Date.now();
    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion AS TipoAdecuacion,
          e.Correo,
          e.Telefono,
          enc.NombreCompleto AS EncargadoPrincipalNombre,
          enc.Correo AS EncargadoPrincipalCorreo,
          enc.Telefono AS EncargadoPrincipalTelefono,
          encWa.Detalle AS EncargadosWhatsAppDetalle,
          e.AutorizaWhatsAppEncargado,
          ma.MatriculaId,
          ma.Estado AS EstadoMatricula,
          ISNULL(traslado.FueTrasladado, 0) AS FueTrasladado,
          traslado.GrupoIdOrigenTraslado,
          traslado.GrupoNombreOrigenTraslado,
          traslado.GrupoIdDestinoTraslado,
          traslado.TrasladoCreatedAt,
          ${suspensionVigenteSelectSql}
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        ${getSuspensionVigenteApplySql("e")}
        OUTER APPLY (
          SELECT TOP 1
            LTRIM(RTRIM(CONCAT(ISNULL(en.Nombre, ''), ' ', ISNULL(en.PrimerApellido, ''), ' ', ISNULL(en.SegundoApellido, '')))) AS NombreCompleto,
            en.Correo,
            en.Telefono
          FROM dbo.EstudianteEncargado ee
          INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
          WHERE ee.EstudianteId = e.EstudianteId
            AND ISNULL(ee.Activo, 1) = 1
            AND ISNULL(en.Activo, 1) = 1
          ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC
        ) enc
        OUTER APPLY (
          SELECT
            STUFF((
              SELECT DISTINCT
                ' | ' +
                COALESCE(NULLIF(LTRIM(RTRIM(ee2.Parentesco)), ''), CASE WHEN en2.TipoEncargado = 'MADRE' THEN 'Madre' WHEN en2.TipoEncargado = 'PADRE' THEN 'Padre' ELSE 'Encargado' END) +
                ': ' + LTRIM(RTRIM(ISNULL(en2.Telefono, '')))
              FROM dbo.EstudianteEncargado ee2
              INNER JOIN dbo.Encargado en2 ON en2.EncargadoId = ee2.EncargadoId
              WHERE ee2.EstudianteId = e.EstudianteId
                AND ISNULL(ee2.Activo, 1) = 1
                AND ISNULL(en2.Activo, 1) = 1
                AND ISNULL(ee2.RecibeNotificaciones, 1) = 1
                AND LTRIM(RTRIM(ISNULL(en2.Telefono, ''))) <> ''
              FOR XML PATH(''), TYPE
            ).value('.', 'nvarchar(max)'), 1, 3, '') AS Detalle
        ) encWa
        OUTER APPLY (
          SELECT TOP 1
            CAST(1 AS bit) AS FueTrasladado,
            h.GrupoIdOrigen AS GrupoIdOrigenTraslado,
            go.Nombre AS GrupoNombreOrigenTraslado,
            h.GrupoIdDestino AS GrupoIdDestinoTraslado,
            h.CreatedAt AS TrasladoCreatedAt
          FROM dbo.MatriculaTrasladoHistorial h
          LEFT JOIN dbo.Grupo go ON go.GrupoId = h.GrupoIdOrigen
          WHERE h.EstudianteId = e.EstudianteId
            AND h.AnioLectivoId = ma.AnioLectivoId
            AND h.GrupoIdDestino = ma.GrupoId
          ORDER BY h.CreatedAt DESC, h.MatriculaTrasladoHistorialId DESC
        ) traslado
        WHERE ma.AnioLectivoId = @anioLectivoId
          AND (
            (@grupoClaseId IS NULL AND ma.GrupoId = @grupoId)
            OR (
              @grupoClaseId IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM dbo.GrupoClaseEstudiante gce
                WHERE gce.GrupoClaseId = @grupoClaseId
                  AND gce.MatriculaId = ma.MatriculaId
                  AND gce.Activo = 1
              )
            )
          )
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    console.log(`[SQL][gestion.detalle.estudiantes] ${Date.now() - tEstudiantes}ms`);
    const tPlantilla = Date.now();
    const plantillaResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .query(`
        SELECT TOP 1
          ep.EvaluacionPlantillaId,
          ep.Nombre,
          ep.DecimalesNota,
          ep.Estado,
          ep.PermitirProfesorEditar
        FROM dbo.EvaluacionPlantilla ep
        WHERE ep.InstitucionId = @institucionId
          AND ep.AnioLectivoId = @anioLectivoId
          AND ep.PeriodoId = @periodoId
          AND ep.MateriaId = @materiaId
          AND ep.Activo = 1
        ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
      `);

    console.log(`[SQL][gestion.detalle.plantilla] ${Date.now() - tPlantilla}ms`);
    const plantilla = plantillaResult.recordset[0] || null;
    let componentes: any[] = [];
    let actividades: any[] = [];
    let notas: any[] = [];

    if (plantilla) {
      const tPlantillaDetalle = Date.now();
      const componentesResult = await pool.request()
        .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
        .query(`
          SELECT
            EvaluacionComponenteId,
            EvaluacionPlantillaId,
            Descripcion,
            Porcentaje,
            Orden,
            Activo
          FROM dbo.EvaluacionComponente
          WHERE EvaluacionPlantillaId = @plantillaId
            AND Activo = 1
          ORDER BY Orden, EvaluacionComponenteId
        `);

      const actividadesResult = await pool.request()
        .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
        .query(`
          SELECT
            ea.EvaluacionActividadId,
            ea.EvaluacionComponenteId,
            ea.Descripcion,
            ea.Porcentaje,
            ea.Fecha,
            ea.Orden,
            ea.Activo,
            ec.Porcentaje AS ComponentePorcentaje,
            CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,2)) AS PorcentajeReal
          FROM dbo.EvaluacionActividad ea
          INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
          WHERE ec.EvaluacionPlantillaId = @plantillaId
            AND ec.Activo = 1
            AND ea.Activo = 1
          ORDER BY ec.Orden, ea.Orden, ea.EvaluacionActividadId
        `);

      const notasResult = await pool.request()
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("periodoId", sql.Int, periodoId)
        .input("grupoClaseId", sql.Int, grupoClaseId)
        .query(`
          SELECT
            EvaluacionNotaId,
            EvaluacionActividadId,
            EstudianteId,
            GrupoId,
            MateriaId,
            PeriodoId,
            Nota,
            PorcentajeGanado,
            Observacion
          FROM dbo.EvaluacionNota
          WHERE GrupoId = @grupoId
            AND MateriaId = @materiaId
            AND PeriodoId = @periodoId
            AND ISNULL(dbo.fn_GrupoClaseCanonicoId(GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)
        `);

      componentes = componentesResult.recordset;
      actividades = actividadesResult.recordset;
      notas = notasResult.recordset;
      console.log(`[SQL][gestion.detalle.rubrosNotas] ${Date.now() - tPlantillaDetalle}ms`);
    }

    console.log(`[gestion.detalle.total] ${Date.now() - t0}ms`);
    return ok(res, {
      asignacion,
      grupoClaseId,
      estudiantes: estudiantesResult.recordset,
      plantilla,
      componentes,
      actividades,
      notas
    });
  } catch (error) {
    console.error("Error cargando detalle del grupo del profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el detalle del grupo" });
  }
});


router.post("/mis-grupos/:grupoId/materias/:materiaId/notas", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const userId = getUserId(req);
    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId ?? req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId ?? req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body.grupoClaseId ?? req.query.grupoClaseId);
    const notas = Array.isArray(req.body.notas) ? req.body.notas : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    if (notas.length === 0) {
      return badRequest(res, "No se recibieron notas para guardar");
    }

    const accessRequest = pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("usuarioId", sql.Int, userId);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      accessRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const access = grupoClaseId
      ? { recordset: [await getAsignacionPermitida(
          req,
          res,
          grupoId,
          materiaId,
          anioLectivoId,
          periodoId,
          grupoClaseId
        )].filter(Boolean) }
      : await accessRequest.query(`
      SELECT TOP 1
        ad.AsignacionDocenteId,
        ad.InstitucionId,
        ad.GrupoId,
        ad.MateriaId,
        ad.AnioLectivoId,
        ad.PeriodoId
      FROM dbo.AsignacionDocente ad
      WHERE ad.Activo = 1
        AND ad.GrupoId = @grupoId
        AND ad.MateriaId = @materiaId
        AND ad.AnioLectivoId = @anioLectivoId
        AND ad.PeriodoId = @periodoId
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    const asignacion = access.recordset[0];
    if (!asignacion) return forbidden(res, "No tenés permisos para registrar notas en este grupo y materia");

    if (await responderSiCursoCerrado(res, pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    })) return;

    const plantillaResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .query(`
        SELECT TOP 1
          ep.EvaluacionPlantillaId,
          ep.DecimalesNota,
          ep.Estado
        FROM dbo.EvaluacionPlantilla ep
        WHERE ep.InstitucionId = @institucionId
          AND ep.AnioLectivoId = @anioLectivoId
          AND ep.PeriodoId = @periodoId
          AND ep.MateriaId = @materiaId
          AND ep.Activo = 1
        ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
      `);

    const plantilla = plantillaResult.recordset[0];
    if (!plantilla) {
      return badRequest(res, "No existe una plantilla de evaluación activa o disponible para este grupo y materia");
    }

    const actividadesResult = await pool.request()
      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .query(`
        SELECT
          ea.EvaluacionActividadId,
          CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,4)) AS PorcentajeReal
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ec.EvaluacionPlantillaId = @plantillaId
          AND ec.Activo = 1
          AND ea.Activo = 1
      `);

    const actividadesPermitidas = new Map<number, number>();
    for (const actividad of actividadesResult.recordset) {
      actividadesPermitidas.set(Number(actividad.EvaluacionActividadId), Number(actividad.PorcentajeReal || 0));
    }

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT DISTINCT e.EstudianteId
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.AnioLectivoId = @anioLectivoId
          AND (
            (@grupoClaseId IS NULL AND ma.GrupoId = @grupoId)
            OR (
              @grupoClaseId IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM dbo.GrupoClaseEstudiante gce
                WHERE gce.GrupoClaseId = @grupoClaseId
                  AND gce.MatriculaId = ma.MatriculaId
                  AND gce.Activo = 1
              )
            )
          )
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
      `);

    const estudiantesPermitidos = new Set<number>(estudiantesResult.recordset.map((item: any) => Number(item.EstudianteId)));

    const notasNormalizadas = notas.map((item: any) => ({
      estudianteId: Number(item.estudianteId),
      evaluacionActividadId: Number(item.evaluacionActividadId),
      nota: item.nota === null || item.nota === undefined || String(item.nota).trim() === "" ? null : Number(item.nota),
      observacion: normalizeText(item.observacion).slice(0, 500)
    }));

    for (const item of notasNormalizadas) {
      if (!Number.isFinite(item.estudianteId) || !estudiantesPermitidos.has(item.estudianteId)) {
        return badRequest(res, "Se recibió un estudiante que no pertenece al grupo seleccionado");
      }

      if (!Number.isFinite(item.evaluacionActividadId) || !actividadesPermitidas.has(item.evaluacionActividadId)) {
        return badRequest(res, "Se recibió una actividad evaluativa inválida para la plantilla seleccionada");
      }

      if (item.nota !== null && (!Number.isFinite(item.nota) || item.nota < 0 || item.nota > 100)) {
        return badRequest(res, "Las notas deben estar entre 0 y 100");
      }
    }

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(asignacion.InstitucionId),
      notasNormalizadas.map((item: any) => item.estudianteId)
    );
    if (bloqueoSuspension) {
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }

    await transaction.begin();

    let guardadas = 0;
    let eliminadas = 0;

    for (const item of notasNormalizadas) {
      const porcentajeReal = actividadesPermitidas.get(item.evaluacionActividadId) || 0;

      if (item.nota === null) {
        const deleteRequest = new sql.Request(transaction);
        await deleteRequest
          .input("evaluacionActividadId", sql.Int, item.evaluacionActividadId)
          .input("estudianteId", sql.Int, item.estudianteId)
          .input("grupoId", sql.Int, grupoId)
          .input("materiaId", sql.Int, materiaId)
          .input("periodoId", sql.Int, periodoId)
          .input("grupoClaseId", sql.Int, grupoClaseId)
          .query(`
            DELETE FROM dbo.EvaluacionNota
            WHERE EvaluacionActividadId = @evaluacionActividadId
              AND EstudianteId = @estudianteId
              AND GrupoId = @grupoId
              AND MateriaId = @materiaId
              AND PeriodoId = @periodoId
              AND ISNULL(dbo.fn_GrupoClaseCanonicoId(GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)
          `);
        eliminadas += 1;
        continue;
      }

      const porcentajeGanado = Number(((item.nota * porcentajeReal) / 100).toFixed(4));
      const saveRequest = new sql.Request(transaction);
      await saveRequest
        .input("evaluacionActividadId", sql.Int, item.evaluacionActividadId)
        .input("estudianteId", sql.Int, item.estudianteId)
        .input("horarioGrupoId", sql.Int, item.horarioGrupoId)
        .input("bloqueHorarioId", sql.Int, item.bloqueHorarioId)
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("periodoId", sql.Int, periodoId)
        .input("grupoClaseId", sql.Int, grupoClaseId)
        .input("nota", sql.Decimal(10, 2), item.nota)
        .input("porcentajeGanado", sql.Decimal(10, 4), porcentajeGanado)
        .input("observacion", sql.NVarChar(500), item.observacion || null)
        .query(`
          MERGE dbo.EvaluacionNota AS target
          USING (
            SELECT
              @evaluacionActividadId AS EvaluacionActividadId,
              @estudianteId AS EstudianteId,
              @horarioGrupoId AS HorarioGrupoId,
              @bloqueHorarioId AS BloqueHorarioId,
              @grupoId AS GrupoId,
              @materiaId AS MateriaId,
              @periodoId AS PeriodoId,
              @grupoClaseId AS GrupoClaseId
          ) AS source
          ON target.EvaluacionActividadId = source.EvaluacionActividadId
             AND target.EstudianteId = source.EstudianteId
             AND target.HorarioGrupoId = source.HorarioGrupoId
             AND target.GrupoId = source.GrupoId
             AND target.MateriaId = source.MateriaId
             AND target.PeriodoId = source.PeriodoId
             AND ISNULL(dbo.fn_GrupoClaseCanonicoId(target.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(source.GrupoClaseId), 0)
          WHEN MATCHED THEN
            UPDATE SET
              Nota = @nota,
              PorcentajeGanado = @porcentajeGanado,
              Observacion = @observacion,
              UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (EvaluacionActividadId, EstudianteId, GrupoId, MateriaId, PeriodoId, GrupoClaseId, Nota, PorcentajeGanado, Observacion, CreatedAt)
            VALUES (@evaluacionActividadId, @estudianteId, @grupoId, @materiaId, @periodoId, @grupoClaseId, @nota, @porcentajeGanado, @observacion, SYSDATETIME());
        `);

      guardadas += 1;
    }

    await transaction.commit();

    return ok(res, {
      guardadas,
      eliminadas,
      message: "Notas guardadas correctamente"
    });
  } catch (error) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}
    console.error("Error guardando notas del profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron guardar las notas" });
  }
});



function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toHtmlWithLineBreaks(value: any) {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

function fullName(row: any) {
  return [row?.PrimerApellido || "", row?.SegundoApellido || "", row?.Nombre || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAdecuacionReportStyleKind(value: any): "SIGNIFICATIVA" | "NO_SIGNIFICATIVA" | null {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (normalized.includes("no significativa")) return "NO_SIGNIFICATIVA";
  if (normalized.includes("significativa")) return "SIGNIFICATIVA";
  return null;
}

function getAdecuacionReportHtmlStyle(value: any, index: number) {
  const kind = getAdecuacionReportStyleKind(value);
  if (kind === "SIGNIFICATIVA") return "background:#dcfce7;font-weight:800;";
  if (kind === "NO_SIGNIFICATIVA") return "background:#e0f2fe;color:#64748b;";
  return `background:${index % 2 === 0 ? "#ffffff" : "#f8fafc"};`;
}

function formatNumber(value: any, decimals = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0.00";
  return number.toFixed(decimals);
}

function formatDateCR(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function ensureBitacoraGrupoTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.BitacoraGrupo', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BitacoraGrupo (
        BitacoraGrupoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        GrupoId INT NOT NULL,
        MateriaId INT NOT NULL,
        AnioLectivoId INT NOT NULL,
        PeriodoId INT NOT NULL,
        FechaRegistro DATE NOT NULL CONSTRAINT DF_BitacoraGrupo_FechaRegistro DEFAULT(CONVERT(date, SYSDATETIME())),
        TemasDesarrollados NVARCHAR(MAX) NOT NULL,
        Observaciones NVARCHAR(MAX) NULL,
        HechosRelevantes NVARCHAR(MAX) NULL,
        UsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BitacoraGrupo_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_BitacoraGrupo_UpdatedAt DEFAULT(SYSDATETIME())
      );
      CREATE INDEX IX_BitacoraGrupo_Busqueda
        ON dbo.BitacoraGrupo (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, FechaRegistro DESC, BitacoraGrupoId DESC);
    END

    IF OBJECT_ID(N'dbo.GrupoClase', N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.BitacoraGrupo', N'GrupoClaseId') IS NULL
      ALTER TABLE dbo.BitacoraGrupo ADD GrupoClaseId INT NULL;

    IF OBJECT_ID(N'dbo.GrupoClase', N'U') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM sys.foreign_keys
         WHERE parent_object_id = OBJECT_ID(N'dbo.BitacoraGrupo')
           AND name = N'FK_BitacoraGrupo_GrupoClase'
       )
      ALTER TABLE dbo.BitacoraGrupo WITH CHECK
        ADD CONSTRAINT FK_BitacoraGrupo_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
  `);
}

function getReadableError(error: any) {
  if (!error) return "Error desconocido";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  return "Error desconocido";
}

async function sendWhatsAppSeguimiento(params: { telefono?: string | null; mensaje: string }) {
  const telefono = normalizeWhatsAppPhone(params.telefono);
  if (!telefono) return { enviado: false, modo: "omitido", motivo: "Sin teléfono válido de encargado" };

  const mode = String(process.env.WHATSAPP_MODE || "simulado").trim().toLowerCase();
  if (mode !== "webhook") {
    console.log("WhatsApp simulado:", { telefono, mensaje: params.mensaje });
    return { enviado: true, modo: "simulado" };
  }

  const provider = String(process.env.WHATSAPP_PROVIDER || "").trim().toLowerCase();
  const url = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  const token = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const fromNumber = String(process.env.WHATSAPP_FROM_NUMBER || "").trim();
  const authHeader = String(process.env.WHATSAPP_WEBHOOK_AUTH_HEADER || "Authorization").trim() || "Authorization";

  if (!url) return { enviado: false, modo: "webhook", motivo: "Falta WHATSAPP_WEBHOOK_URL" };
  if (!token) return { enviado: false, modo: "webhook", motivo: "Falta WHATSAPP_WEBHOOK_TOKEN" };

  let payload: any = {};
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "2chat") {
    if (!fromNumber) return { enviado: false, modo: "webhook", motivo: "Falta WHATSAPP_FROM_NUMBER para provider 2chat" };
    headers["X-User-API-Key"] = token;
    payload = {
      from_number: fromNumber,
      to_number: telefono,
      text: params.mensaje
    };
  } else {
    headers[authHeader] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    payload = {
      canal: "whatsapp",
      to: telefono,
      telefono,
      phone: telefono,
      message: params.mensaje,
      text: params.mensaje
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const body = await response.text();

    if (!response.ok) {
      console.error("Error enviando WhatsApp por webhook:", response.status, body);
      return { enviado: false, modo: "webhook", status: response.status, motivo: body || `HTTP ${response.status}` };
    }

    return { enviado: true, modo: "webhook", status: response.status };
  } catch (error: any) {
    console.error("Error enviando WhatsApp por webhook:", error);
    return { enviado: false, modo: "webhook", motivo: getReadableError(error) };
  }
}

async function ensureReporteEnvioBitacoraTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.ReporteEnvioBitacora', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ReporteEnvioBitacora (
        ReporteEnvioBitacoraId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Modulo NVARCHAR(40) NOT NULL,
        RegistroClave NVARCHAR(200) NOT NULL,
        GrupoId INT NULL,
        MateriaId INT NULL,
        PeriodoId INT NULL,
        AnioLectivoId INT NULL,
        EstudianteId INT NULL,
        Fecha DATE NULL,
        CorreoEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Correo DEFAULT(0),
        WaEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Wa DEFAULT(0),
        UltimoEnvioAt DATETIME2 NULL,
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_UpdatedAt DEFAULT(SYSDATETIME()),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_ReporteEnvioBitacora_ModuloClave ON dbo.ReporteEnvioBitacora(Modulo, RegistroClave);
      CREATE INDEX IX_ReporteEnvioBitacora_Filtros ON dbo.ReporteEnvioBitacora(GrupoId, MateriaId, PeriodoId, AnioLectivoId, EstudianteId, Fecha);
    END
  `);
}

async function upsertReporteEnvioBitacora(pool: any, payload: {
  modulo: string;
  registroClave: string;
  grupoId?: number | null;
  materiaId?: number | null;
  periodoId?: number | null;
  anioLectivoId?: number | null;
  estudianteId?: number | null;
  fecha?: string | null;
  correoEnviado?: boolean;
  waEnviado?: boolean;
}) {
  await pool.request()
    .input("modulo", sql.NVarChar(40), String(payload.modulo || "").trim().toUpperCase())
    .input("registroClave", sql.NVarChar(200), String(payload.registroClave || "").trim())
    .input("grupoId", sql.Int, payload.grupoId || null)
    .input("materiaId", sql.Int, payload.materiaId || null)
    .input("periodoId", sql.Int, payload.periodoId || null)
    .input("anioLectivoId", sql.Int, payload.anioLectivoId || null)
    .input("estudianteId", sql.Int, payload.estudianteId || null)
    .input("fecha", sql.Date, payload.fecha || null)
    .input("correoEnviado", sql.Bit, payload.correoEnviado ? 1 : 0)
    .input("waEnviado", sql.Bit, payload.waEnviado ? 1 : 0)
    .query(`
      MERGE dbo.ReporteEnvioBitacora AS target
      USING (
        SELECT
          @modulo AS Modulo,
          @registroClave AS RegistroClave
      ) AS source
      ON target.Modulo = source.Modulo
         AND target.RegistroClave = source.RegistroClave
      WHEN MATCHED THEN
        UPDATE SET
          GrupoId = COALESCE(@grupoId, target.GrupoId),
          MateriaId = COALESCE(@materiaId, target.MateriaId),
          PeriodoId = COALESCE(@periodoId, target.PeriodoId),
          AnioLectivoId = COALESCE(@anioLectivoId, target.AnioLectivoId),
          EstudianteId = COALESCE(@estudianteId, target.EstudianteId),
          Fecha = COALESCE(@fecha, target.Fecha),
          CorreoEnviado = CASE WHEN @correoEnviado = 1 THEN 1 ELSE target.CorreoEnviado END,
          WaEnviado = CASE WHEN @waEnviado = 1 THEN 1 ELSE target.WaEnviado END,
          UltimoEnvioAt = CASE WHEN @correoEnviado = 1 OR @waEnviado = 1 THEN SYSDATETIME() ELSE target.UltimoEnvioAt END,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (Modulo, RegistroClave, GrupoId, MateriaId, PeriodoId, AnioLectivoId, EstudianteId, Fecha, CorreoEnviado, WaEnviado, UltimoEnvioAt, UpdatedAt, CreatedAt)
        VALUES (@modulo, @registroClave, @grupoId, @materiaId, @periodoId, @anioLectivoId, @estudianteId, @fecha, @correoEnviado, @waEnviado, CASE WHEN @correoEnviado = 1 OR @waEnviado = 1 THEN SYSDATETIME() ELSE NULL END, SYSDATETIME(), SYSDATETIME());
        `);
}

function sanitizeResultadoIAJsonForList(value: any) {
  if (!value) return value;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return value;

    if (parsed.plantillaFormatoDocx?.base64) {
      parsed.plantillaFormatoDocx = {
        nombre: parsed.plantillaFormatoDocx.nombre || parsed.plantillaFormatoNombre || "plantilla_formato.docx",
        mimeType: parsed.plantillaFormatoDocx.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        guardadaEnServidor: true
      };
    }

    return typeof value === "string" ? JSON.stringify(parsed) : parsed;
  } catch {
    return value;
  }
}

async function buildReporteFormalData(
  req: any,
  res: any,
  grupoId: number,
  materiaId: number,
  anioLectivoId: number,
  periodoId: number,
  grupoClaseId?: number | null
) {
  const asignacion = await getAsignacionPermitida(
    req,
    res,
    grupoId,
    materiaId,
    anioLectivoId,
    periodoId,
    grupoClaseId
  );
  if (!asignacion) return null;

  const pool = await getPool();

  const contextoResult = await pool.request()
    .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req)))
    .query(`
      SELECT TOP 1
        i.*,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.Jornada AS GrupoJornada,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre,
        u.Nombre AS ProfesorNombre,
        u.PrimerApellido AS ProfesorPrimerApellido,
        u.SegundoApellido AS ProfesorSegundoApellido,
        u.Cargo AS ProfesorCargo
      FROM dbo.Institucion i
      INNER JOIN dbo.Grupo g ON g.InstitucionId = i.InstitucionId AND g.GrupoId = @grupoId
      INNER JOIN dbo.Materia m ON m.MateriaId = @materiaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = @anioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = @periodoId
      LEFT JOIN dbo.Usuario u ON u.UsuarioId = @usuarioId
      WHERE i.InstitucionId = @institucionId
    `);

  const contexto = contextoResult.recordset[0] || {};
  if (grupoClaseId && asignacion.GrupoNombre) contexto.GrupoNombre = asignacion.GrupoNombre;

  const estudiantesResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("grupoClaseId", sql.Int, grupoClaseId || null)
    .query(`
      SELECT
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        e.Adecuacion AS TipoAdecuacion,
        ma.MatriculaId
      FROM dbo.Matricula ma
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
      WHERE (
          (@grupoClaseId IS NULL AND ma.GrupoId = @grupoId)
          OR (
            @grupoClaseId IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseEstudiante gce
              WHERE gce.GrupoClaseId = @grupoClaseId
                AND gce.MatriculaId = ma.MatriculaId
                AND gce.Activo = 1
                AND (gce.FechaDesde IS NULL OR gce.FechaDesde <= CONVERT(date, SYSDATETIME()))
                AND (gce.FechaHasta IS NULL OR gce.FechaHasta >= CONVERT(date, SYSDATETIME()))
            )
          )
        )
        AND ma.AnioLectivoId = @anioLectivoId
        AND ma.Estado <> N'Inactiva'
        AND e.Activo = 1
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
    `);

  const plantillaResult = await pool.request()
    .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("materiaId", sql.Int, materiaId)
    .query(`
      SELECT TOP 1
        ep.EvaluacionPlantillaId,
        ep.Nombre,
        ep.DecimalesNota,
        ep.Estado
      FROM dbo.EvaluacionPlantilla ep
      WHERE ep.InstitucionId = @institucionId
        AND ep.AnioLectivoId = @anioLectivoId
        AND ep.PeriodoId = @periodoId
        AND ep.MateriaId = @materiaId
        AND ep.Activo = 1
      ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
    `);

  const plantilla = plantillaResult.recordset[0] || null;
  let actividades: any[] = [];
  let notas: any[] = [];

  if (plantilla) {
    const actividadesResult = await pool.request()
      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .query(`
        SELECT
          ea.EvaluacionActividadId,
          ea.Descripcion,
          ea.Porcentaje,
          ea.Fecha,
          ea.Orden,
          ec.Descripcion AS ComponenteDescripcion,
          ec.Porcentaje AS ComponentePorcentaje,
          CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,2)) AS PorcentajeReal
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ec.EvaluacionPlantillaId = @plantillaId
          AND ec.Activo = 1
          AND ea.Activo = 1
        ORDER BY ec.Orden, ea.Orden, ea.EvaluacionActividadId
      `);
    actividades = actividadesResult.recordset;

    const notasResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId || null)
      .query(`
        SELECT
          EvaluacionActividadId,
          EstudianteId,
          Nota,
          PorcentajeGanado
        FROM dbo.EvaluacionNota
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND PeriodoId = @periodoId
          AND ISNULL(dbo.fn_GrupoClaseCanonicoId(GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)
      `);
    notas = notasResult.recordset;
  }

  const resumenAsistencia = await buildResumenAsistencia(
    grupoId,
    materiaId,
    anioLectivoId,
    periodoId,
    grupoClaseId
  );
  const notasMap = new Map<string, any>();
  for (const nota of notas) notasMap.set(`${nota.EstudianteId}-${nota.EvaluacionActividadId}`, nota);
  const asistenciaMap = new Map<number, any>();
  for (const item of resumenAsistencia) asistenciaMap.set(Number(item.EstudianteId), item);

  const estudiantes = estudiantesResult.recordset.map((estudiante: any) => {
    const detalleNotas = actividades.map((actividad: any) => {
      const nota = notasMap.get(`${estudiante.EstudianteId}-${actividad.EvaluacionActividadId}`);
      return {
        actividadId: actividad.EvaluacionActividadId,
        nota: nota?.Nota ?? null,
        porcentajeGanado: Number(nota?.PorcentajeGanado || 0)
      };
    });
    const acumuladoEvaluacion = detalleNotas.reduce((total: number, item: any) => total + Number(item.porcentajeGanado || 0), 0);
    const asistencia = asistenciaMap.get(Number(estudiante.EstudianteId)) || {};

    return {
      ...estudiante,
      NombreCompleto: fullName(estudiante),
      detalleNotas,
      acumuladoEvaluacion: Number(acumuladoEvaluacion.toFixed(2)),
      totalLecciones: Number(asistencia.TotalLecciones || 0),
      ausenciasEquivalentes: Number(asistencia.AusenciasInjustificadasEquivalentes || 0),
      porcentajeAusencias: Number(asistencia.PorcentajeAusencias || 0),
      porcentajeAsistencia: Number(asistencia.PorcentajeAsignadoArticulo37 || 0),
      promedioFinal: Number((acumuladoEvaluacion + Number(asistencia.PorcentajeAsignadoArticulo37 || 0)).toFixed(2))
    };
  });

  return {
    contexto,
    plantilla,
    actividades,
    estudiantes,
    generadoEn: new Date()
  };
}

async function getAsignacionPermitida(
  req: any,
  res: any,
  grupoId: number,
  materiaId: number,
  anioLectivoId: number,
  periodoId: number,
  grupoClaseId?: number | null
) {
  const pool = await getPool();
  const userId = getUserId(req);

  if (grupoClaseId) {
    if (!await hasGrupoClaseSchema(pool)) return null;
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return null;
    const grupoClase = await getGrupoClasePermitido({
      pool,
      grupoClaseId,
      institucionId,
      usuarioId: userId,
      permitirAdministrativo: isSuperAdmin(req) || isInstitutionAdmin(req),
      periodoId
    });
    if (!grupoClase
      || Number(grupoClase.GrupoIdPrincipal) !== grupoId
      || Number(grupoClase.MateriaId) !== materiaId
      || Number(grupoClase.AnioLectivoId) !== anioLectivoId
    ) {
      return null;
    }

    const result = await pool.request()
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("usuarioId", sql.Int, userId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT TOP 1
          COALESCE(ad.AsignacionDocenteId, 0) AS AsignacionDocenteId,
          gcd.UsuarioId,
          gc.InstitucionId,
          gc.GrupoIdPrincipal AS GrupoId,
          gc.GrupoClaseId,
          gc.MateriaId,
          gc.AnioLectivoId,
          p.PeriodoId,
          gc.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          al.Nombre AS AnioNombre,
          p.Nombre AS PeriodoNombre,
          u.Nombre AS ProfesorNombre,
          u.PrimerApellido AS ProfesorPrimerApellido,
          u.SegundoApellido AS ProfesorSegundoApellido
        FROM dbo.GrupoClase gc
        INNER JOIN dbo.Grupo g ON g.GrupoId = gc.GrupoIdPrincipal
        INNER JOIN dbo.Materia m ON m.MateriaId = gc.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
        INNER JOIN dbo.Periodo p ON p.PeriodoId = @periodoId
        INNER JOIN dbo.GrupoClaseDocente gcd
          ON gcd.GrupoClaseId = gc.GrupoClaseId
         AND gcd.Activo = 1
        INNER JOIN dbo.Usuario u ON u.UsuarioId = gcd.UsuarioId
        LEFT JOIN dbo.AsignacionDocente ad
          ON ad.InstitucionId = gc.InstitucionId
         AND ad.UsuarioId = gcd.UsuarioId
         AND ad.GrupoId = gc.GrupoIdPrincipal
         AND ad.MateriaId = gc.MateriaId
         AND ad.AnioLectivoId = gc.AnioLectivoId
         AND ad.PeriodoId = p.PeriodoId
         AND ad.Activo = 1
        WHERE gc.GrupoClaseId = @grupoClaseId
          AND gc.Activo = 1
          AND p.AnioLectivoId = gc.AnioLectivoId
          AND (gc.AplicaTodosPeriodos = 1 OR gc.PeriodoId = p.PeriodoId)
        ORDER BY
          CASE WHEN gcd.UsuarioId = @usuarioId THEN 0 ELSE 1 END,
          gcd.EsPrincipal DESC,
          gcd.GrupoClaseDocenteId
      `);
    return result.recordset[0] || null;
  }

  const request = pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("usuarioId", sql.Int, userId);

  let filtroInstitucion = "";
  if (!isSuperAdmin(req)) {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return null;
    request.input("institucionId", sql.Int, institucionId);
    filtroInstitucion = "AND ad.InstitucionId = @institucionId";
  }

  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
    ? "AND ad.UsuarioId = @usuarioId"
    : "";

  const result = await request.query(`
    SELECT TOP 1
      ad.AsignacionDocenteId,
      ad.UsuarioId,
      ad.InstitucionId,
      ad.GrupoId,
      ad.MateriaId,
      ad.AnioLectivoId,
      ad.PeriodoId,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      u.Nombre AS ProfesorNombre,
      u.PrimerApellido AS ProfesorPrimerApellido,
      u.SegundoApellido AS ProfesorSegundoApellido
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.Activo = 1
      AND ad.GrupoId = @grupoId
      AND ad.MateriaId = @materiaId
      AND ad.AnioLectivoId = @anioLectivoId
      AND ad.PeriodoId = @periodoId
      ${filtroInstitucion}
      ${filtroProfesor}
  `);

  return result.recordset[0] || null;
}

function normalizeCierreCursoRow(row: any) {
  if (!row) return null;

  let advertencias: string[] = [];
  try {
    const parsed = row.AdvertenciasJson ? JSON.parse(String(row.AdvertenciasJson)) : [];
    advertencias = Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    advertencias = [];
  }

  return {
    CierreAcademicoCursoId: Number(row.CierreAcademicoCursoId || 0),
    InstitucionId: Number(row.InstitucionId || 0),
    GrupoId: Number(row.GrupoId || 0),
    MateriaId: Number(row.MateriaId || 0),
    AnioLectivoId: Number(row.AnioLectivoId || 0),
    PeriodoId: Number(row.PeriodoId || 0),
    GrupoClaseId: row.GrupoClaseId === null || row.GrupoClaseId === undefined ? null : Number(row.GrupoClaseId),
    UsuarioDocenteId: row.UsuarioDocenteId === null || row.UsuarioDocenteId === undefined ? null : Number(row.UsuarioDocenteId),
    Estado: String(row.Estado || "ABIERTO"),
    Cerrado: isCierreCursoCerrado(row),
    PromedioGeneral: row.PromedioGeneral === null || row.PromedioGeneral === undefined ? null : Number(row.PromedioGeneral),
    TotalEstudiantes: Number(row.TotalEstudiantes || 0),
    TotalCompletos: Number(row.TotalCompletos || 0),
    TotalIncompletos: Number(row.TotalIncompletos || 0),
    CerradoPorUsuarioId: row.CerradoPorUsuarioId === null || row.CerradoPorUsuarioId === undefined ? null : Number(row.CerradoPorUsuarioId),
    CerradoAt: row.CerradoAt || null,
    ReabiertoPorUsuarioId: row.ReabiertoPorUsuarioId === null || row.ReabiertoPorUsuarioId === undefined ? null : Number(row.ReabiertoPorUsuarioId),
    ReabiertoAt: row.ReabiertoAt || null,
    MotivoReapertura: row.MotivoReapertura || null,
    Advertencias: advertencias
  };
}

function buildCierreCursoPreview(data: any, cierreActual: any = null) {
  const actividades = Array.isArray(data?.actividades) ? data.actividades : [];
  const estudiantesBase = Array.isArray(data?.estudiantes) ? data.estudiantes : [];
  const totalActividades = actividades.length;
  const advertenciasCurso = new Set<string>();

  if (!data?.plantilla) {
    advertenciasCurso.add("No hay plantilla de evaluacion configurada para este periodo.");
  } else if (totalActividades === 0) {
    advertenciasCurso.add("No hay actividades evaluativas configuradas en la plantilla.");
  }

  const estudiantes = estudiantesBase.map((estudiante: any) => {
    const detalleNotas = Array.isArray(estudiante?.detalleNotas) ? estudiante.detalleNotas : [];
    const notasRegistradas = detalleNotas.filter((nota: any) => nota?.nota !== null && nota?.nota !== undefined && String(nota?.nota).trim() !== "").length;
    const advertencias: string[] = [];

    if (!data?.plantilla) {
      advertencias.push("Sin plantilla de evaluacion.");
    } else if (totalActividades === 0) {
      advertencias.push("Sin actividades evaluativas.");
    } else if (notasRegistradas < totalActividades) {
      advertencias.push(`Faltan ${totalActividades - notasRegistradas} de ${totalActividades} notas.`);
    }

    if (Number(estudiante?.totalLecciones || 0) <= 0) {
      advertencias.push("Sin asistencia registrada para el Articulo 37.");
    }

    for (const advertencia of advertencias) advertenciasCurso.add(advertencia);

    return {
      EstudianteId: Number(estudiante?.EstudianteId || 0),
      Identificacion: estudiante?.Identificacion || "",
      NombreCompleto: estudiante?.NombreCompleto || fullName(estudiante),
      NotasRegistradas: notasRegistradas,
      TotalActividades: totalActividades,
      AcumuladoEvaluacion: Number(estudiante?.acumuladoEvaluacion || 0),
      TotalLecciones: Number(estudiante?.totalLecciones || 0),
      PorcentajeAsistencia: Number(estudiante?.porcentajeAsistencia || 0),
      PromedioFinal: Number(estudiante?.promedioFinal || 0),
      Estado: advertencias.length ? "Incompleto" : "Completo",
      Advertencias: advertencias
    };
  });

  const totalEstudiantes = estudiantes.length;
  const totalCompletos = estudiantes.filter((estudiante: any) => estudiante.Estado === "Completo").length;
  const totalIncompletos = totalEstudiantes - totalCompletos;
  const sumaPromedios = estudiantes.reduce((total: number, estudiante: any) => total + Number(estudiante.PromedioFinal || 0), 0);
  const promedioGeneral = totalEstudiantes > 0 ? Number((sumaPromedios / totalEstudiantes).toFixed(2)) : null;

  return {
    contexto: {
      InstitucionId: Number(data?.contexto?.InstitucionId || 0),
      InstitucionNombre: data?.contexto?.Nombre || "",
      GrupoId: Number(data?.contexto?.GrupoId || 0),
      GrupoNombre: data?.contexto?.GrupoNombre || "",
      MateriaId: Number(data?.contexto?.MateriaId || 0),
      MateriaNombre: data?.contexto?.MateriaNombre || "",
      AnioNombre: data?.contexto?.AnioNombre || "",
      PeriodoNombre: data?.contexto?.PeriodoNombre || "",
      ProfesorNombre: [data?.contexto?.ProfesorNombre || "", data?.contexto?.ProfesorPrimerApellido || "", data?.contexto?.ProfesorSegundoApellido || ""].join(" ").replace(/\s+/g, " ").trim()
    },
    resumen: {
      totalEstudiantes,
      totalCompletos,
      totalIncompletos,
      promedioGeneral,
      estado: totalIncompletos > 0 || advertenciasCurso.size > 0 ? "Incompleto" : "Completo",
      totalActividades
    },
    estudiantes,
    advertencias: Array.from(advertenciasCurso),
    cierreActual: normalizeCierreCursoRow(cierreActual),
    generadoEn: new Date().toISOString()
  };
}

async function responderSiCursoCerrado(res: any, pool: any, input: {
  institucionId: number;
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
  grupoClaseId?: number | null;
}) {
  const guard = await assertCierreCursoAbierto(pool, input);
  if (guard.abierto) return false;

  return res.status(409).json({
    ok: false,
    message: "El curso ya esta cerrado. Solicita a Direccion la reapertura para realizar cambios.",
    data: {
      cierre: normalizeCierreCursoRow(guard.cierre)
    }
  });
}

async function insertarAuditoriaCierreCurso(pool: any, input: {
  cierreId: number;
  accion: string;
  usuarioId: number | null;
  motivo?: string | null;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  snapshot?: any;
}) {
  await pool.request()
    .input("cierreId", sql.Int, input.cierreId)
    .input("accion", sql.NVarChar(40), input.accion)
    .input("usuarioId", sql.Int, input.usuarioId)
    .input("motivo", sql.NVarChar(1000), input.motivo || null)
    .input("estadoAnterior", sql.NVarChar(40), input.estadoAnterior || null)
    .input("estadoNuevo", sql.NVarChar(40), input.estadoNuevo || null)
    .input("snapshotJson", sql.NVarChar(sql.MAX), input.snapshot ? JSON.stringify(input.snapshot) : null)
    .query(`
      INSERT INTO dbo.CierreAcademicoCursoAuditoria
        (CierreAcademicoCursoId, Accion, UsuarioId, Motivo, EstadoAnterior, EstadoNuevo, SnapshotJson, CreatedAt)
      VALUES
        (@cierreId, @accion, @usuarioId, @motivo, @estadoAnterior, @estadoNuevo, @snapshotJson, SYSDATETIME())
        `);
}

async function copiarPlaneamientosDesdeSeccionMismoGradoSiFaltan(pool: any, input: {
  institucionId: number;
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
  usuarioId: number;
}) {
  const existentesResult = await pool.request()
    .input("institucionId", sql.Int, input.institucionId)
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, input.usuarioId)
    .query(`
      SELECT
        PlaneamientoId,
        Nombre,
        ResultadoIAJson,
        Activo,
        UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI AS NombreKey,
        CONVERT(VARCHAR(10), FechaInicio, 23) AS FechaInicioKey,
        CONVERT(VARCHAR(10), FechaFin, 23) AS FechaFinKey
      FROM dbo.Planeamiento
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND UsuarioId = @usuarioId
    `);

  const planeamientosDestinoPorKey = new Map<string, number>(
    (existentesResult.recordset || []).map((item: any) => [[
      String(item.NombreKey || ""),
      String(item.FechaInicioKey || ""),
      String(item.FechaFinKey || "")
    ].join("|"), Number(item.PlaneamientoId)])
  );
  const planeamientosDestino = existentesResult.recordset || [];

  const origenResult = await pool.request()
    .input("institucionId", sql.Int, input.institucionId)
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, input.usuarioId)
    .query(`
      WITH destino AS (
        SELECT TOP 1
          GrupoId,
          Nombre,
          Nivel,
          NivelAcademico,
          LEFT(REPLACE(Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(Nombre, N' ', N'') + N'-') - 1) AS GradoNombre
        FROM dbo.Grupo
        WHERE GrupoId = @grupoId
      ),
      grupos_origen AS (
        SELECT
          g.GrupoId,
          COUNT(DISTINCT p.PlaneamientoId) AS TotalPlaneamientos,
          COUNT(DISTINCT i.IndicadorGrupoId) AS TotalIndicadoresIa,
          MAX(p.CreatedAt) AS UltimoPlaneamiento
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
        CROSS JOIN destino d
        INNER JOIN dbo.Planeamiento p
          ON p.InstitucionId = ad.InstitucionId
         AND p.AnioLectivoId = ad.AnioLectivoId
         AND p.PeriodoId = ad.PeriodoId
         AND p.MateriaId = ad.MateriaId
         AND p.UsuarioId = ad.UsuarioId
         AND p.GrupoId = ad.GrupoId
         AND p.Activo = 1
        LEFT JOIN dbo.Eval360_EstructuraGrupo eg
          ON eg.InstitucionId = ad.InstitucionId
         AND eg.GrupoId = ad.GrupoId
         AND eg.MateriaId = ad.MateriaId
         AND eg.AnioLectivoId = ad.AnioLectivoId
         AND eg.PeriodoId = ad.PeriodoId
         AND eg.Activo = 1
        LEFT JOIN dbo.Eval360_IndicadorGrupo i
          ON i.EstructuraGrupoId = eg.EstructuraGrupoId
         AND i.PlaneamientoId = p.PlaneamientoId
         AND i.Activo = 1
        WHERE ad.Activo = 1
          AND ad.InstitucionId = @institucionId
          AND ad.AnioLectivoId = @anioLectivoId
          AND ad.PeriodoId = @periodoId
          AND ad.MateriaId = @materiaId
          AND ad.UsuarioId = @usuarioId
          AND ad.GrupoId <> @grupoId
          AND (
            (g.NivelAcademico IS NOT NULL AND d.NivelAcademico IS NOT NULL AND g.NivelAcademico = d.NivelAcademico)
            OR UPPER(LTRIM(RTRIM(ISNULL(g.Nivel, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(d.Nivel, N''))))
            OR LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) = d.GradoNombre
          )
        GROUP BY g.GrupoId
      )
      SELECT TOP 1 GrupoId
      FROM grupos_origen
      ORDER BY TotalIndicadoresIa DESC, TotalPlaneamientos DESC, UltimoPlaneamiento DESC, GrupoId DESC
    `);

  const grupoOrigenId = Number(origenResult.recordset[0]?.GrupoId || 0);
  if (!grupoOrigenId) return { copiado: false, grupoOrigenId: null, totalPlaneamientosCopiados: 0 };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const planeamientosOrigen = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoOrigenId", sql.Int, grupoOrigenId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .input("usuarioId", sql.Int, input.usuarioId)
      .query(`
        SELECT *
        FROM dbo.Planeamiento
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoOrigenId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND UsuarioId = @usuarioId
          AND Activo = 1
        ORDER BY FechaInicio, PlaneamientoId
      `);

    const planeamientoMap = new Map<number, number>();
    let totalPlaneamientosCopiados = 0;
    for (const planeamiento of planeamientosOrigen.recordset || []) {
      const planeamientoKey = [
        String(planeamiento.Nombre || "").trim().toUpperCase(),
        planeamiento.FechaInicio ? new Date(planeamiento.FechaInicio).toISOString().slice(0, 10) : "",
        planeamiento.FechaFin ? new Date(planeamiento.FechaFin).toISOString().slice(0, 10) : ""
      ].join("|");

      const planeamientoDestinoExistenteId = planeamientosDestinoPorKey.get(planeamientoKey)
        || Number(planeamientosDestino.find((item: any) =>
          normalizeKey(item.Nombre) === normalizeKey(planeamiento.Nombre)
          || (!!item.ResultadoIAJson && !!planeamiento.ResultadoIAJson && String(item.ResultadoIAJson) === String(planeamiento.ResultadoIAJson))
        )?.PlaneamientoId || 0);
      if (planeamientoDestinoExistenteId) {
        planeamientoMap.set(Number(planeamiento.PlaneamientoId), planeamientoDestinoExistenteId);
        continue;
      }

      const insert = await new sql.Request(transaction)
        .input("institucionId", sql.Int, input.institucionId)
        .input("anioLectivoId", sql.Int, input.anioLectivoId)
        .input("periodoId", sql.Int, input.periodoId)
        .input("grupoId", sql.Int, input.grupoId)
        .input("materiaId", sql.Int, input.materiaId)
        .input("usuarioId", sql.Int, input.usuarioId)
        .input("nombre", sql.NVarChar(200), planeamiento.Nombre)
        .input("fechaInicio", sql.Date, planeamiento.FechaInicio || null)
        .input("fechaFin", sql.Date, planeamiento.FechaFin || null)
        .input("observaciones", sql.NVarChar(sql.MAX), planeamiento.Observaciones || null)
        .input("resultadoIAJson", sql.NVarChar(sql.MAX), planeamiento.ResultadoIAJson || null)
        .query(`
          INSERT INTO dbo.Planeamiento
            (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, ResultadoIAJson, Activo, CreatedAt)
          OUTPUT INSERTED.PlaneamientoId
          VALUES
            (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, @resultadoIAJson, 1, SYSDATETIME())
        `);
      const nuevoPlaneamientoId = Number(insert.recordset[0]?.PlaneamientoId || 0);
      planeamientoMap.set(Number(planeamiento.PlaneamientoId), nuevoPlaneamientoId);
      totalPlaneamientosCopiados += 1;

      const indicadores = await new sql.Request(transaction)
        .input("planeamientoOrigenId", sql.Int, Number(planeamiento.PlaneamientoId))
        .query(`
          SELECT Descripcion, NivelDesempenoId, Activo
          FROM dbo.PlaneamientoIndicador
          WHERE PlaneamientoId = @planeamientoOrigenId
            AND Activo = 1
          ORDER BY PlaneamientoIndicadorId
        `);

      for (const indicador of indicadores.recordset || []) {
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("descripcion", sql.NVarChar(sql.MAX), indicador.Descripcion)
          .input("nivelDesempenoId", sql.Int, indicador.NivelDesempenoId || null)
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            VALUES
              (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
          `);
      }
    }

    const estructuraDestino = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoId", sql.Int, input.grupoId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .query(`
        SELECT TOP 1 EstructuraGrupoId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    let estructuraDestinoId = Number(estructuraDestino.recordset[0]?.EstructuraGrupoId || 0);
    const estructuraOrigen = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoOrigenId", sql.Int, grupoOrigenId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoOrigenId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    const estructuraOrigenRow = estructuraOrigen.recordset[0];
    const detalleMap = new Map<number, number>();
    const actividadMap = new Map<number, number>();
    const indicadorGrupoMap = new Map<number, number>();

    if (estructuraOrigenRow && estructuraDestinoId) {
      const detallesOrigen = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_EstructuraGrupoDetalle WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, EstructuraGrupoDetalleId`);
      for (const detalle of detallesOrigen.recordset || []) {
        const detalleDestino = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("nombre", sql.NVarChar(150), detalle.Nombre || "")
          .query(`
            SELECT TOP 1 EstructuraGrupoDetalleId
            FROM dbo.Eval360_EstructuraGrupoDetalle
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND Activo = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
          `);
        if (detalleDestino.recordset[0]) {
          detalleMap.set(Number(detalle.EstructuraGrupoDetalleId), Number(detalleDestino.recordset[0].EstructuraGrupoDetalleId));
        }
      }

      const actividadesOrigen = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_Actividad WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY ActividadId`);
      for (const actividad of actividadesOrigen.recordset || []) {
        const nuevoDetalleId = detalleMap.get(Number(actividad.EstructuraGrupoDetalleId));
        if (!nuevoDetalleId) continue;
        const actividadDestino = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("estructuraGrupoDetalleId", sql.Int, nuevoDetalleId)
          .input("nombre", sql.NVarChar(200), actividad.Nombre || "")
          .query(`
            SELECT TOP 1 ActividadId
            FROM dbo.Eval360_Actividad
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
              AND Activo = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
          `);
        if (actividadDestino.recordset[0]) {
          actividadMap.set(Number(actividad.ActividadId), Number(actividadDestino.recordset[0].ActividadId));
        }
      }
    } else if (estructuraOrigenRow && !estructuraDestinoId) {
      const nuevaEstructura = await new sql.Request(transaction)
        .input("institucionId", sql.Int, input.institucionId)
        .input("grupoId", sql.Int, input.grupoId)
        .input("materiaId", sql.Int, input.materiaId)
        .input("anioLectivoId", sql.Int, input.anioLectivoId)
        .input("periodoId", sql.Int, input.periodoId)
        .input("usuarioId", sql.Int, input.usuarioId)
        .input("plantillaBaseId", sql.Int, estructuraOrigenRow.PlantillaBaseId || null)
        .input("nombre", sql.NVarChar(200), estructuraOrigenRow.Nombre || "Estructura de evaluación")
        .input("totalPorcentaje", sql.Decimal(5, 2), Number(estructuraOrigenRow.TotalPorcentaje || 100))
        .query(`
          INSERT INTO dbo.Eval360_EstructuraGrupo
            (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
          OUTPUT INSERTED.EstructuraGrupoId
          VALUES
            (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, @totalPorcentaje, 1, SYSDATETIME())
        `);
      estructuraDestinoId = Number(nuevaEstructura.recordset[0]?.EstructuraGrupoId || 0);

      const detalles = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_EstructuraGrupoDetalle WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, EstructuraGrupoDetalleId`);
      for (const detalle of detalles.recordset || []) {
        const nuevoDetalle = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("componenteCatalogoId", sql.Int, detalle.ComponenteCatalogoId || null)
          .input("nombre", sql.NVarChar(150), detalle.Nombre)
          .input("porcentaje", sql.Decimal(5, 2), Number(detalle.Porcentaje || 0))
          .input("orden", sql.Int, Number(detalle.Orden || 1))
          .query(`
            INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
              (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
            OUTPUT INSERTED.EstructuraGrupoDetalleId
            VALUES
              (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())
          `);
        detalleMap.set(Number(detalle.EstructuraGrupoDetalleId), Number(nuevoDetalle.recordset[0]?.EstructuraGrupoDetalleId || 0));
      }

      const niveles = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_NivelDesempenoGrupo WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, NivelDesempenoGrupoId`);
      for (const nivel of niveles.recordset || []) {
        await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("nombre", sql.NVarChar(100), nivel.Nombre)
          .input("valor", sql.Decimal(5, 2), Number(nivel.Valor || 0))
          .input("orden", sql.Int, Number(nivel.Orden || 1))
          .query(`
            INSERT INTO dbo.Eval360_NivelDesempenoGrupo
              (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
            VALUES
              (@estructuraGrupoId, @nombre, @valor, @orden, 1)
          `);
      }

      const actividades = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_Actividad WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY ActividadId`);
      for (const actividad of actividades.recordset || []) {
        const nuevoDetalleId = detalleMap.get(Number(actividad.EstructuraGrupoDetalleId));
        if (!nuevoDetalleId) continue;
        const nuevaActividad = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("estructuraGrupoDetalleId", sql.Int, nuevoDetalleId)
          .input("nombre", sql.NVarChar(200), actividad.Nombre)
          .input("descripcion", sql.NVarChar(sql.MAX), actividad.Descripcion || null)
          .input("fecha", sql.Date, actividad.Fecha || null)
          .input("puntosMaximos", sql.Decimal(10, 2), Number(actividad.PuntosMaximos || 100))
          .input("porcentajeDentroRubro", sql.Decimal(5, 2), actividad.PorcentajeDentroRubro === null ? null : Number(actividad.PorcentajeDentroRubro || 0))
          .input("usaIndicadoresPlaneamiento", sql.Bit, !!actividad.UsaIndicadoresPlaneamiento)
          .input("fuente", sql.NVarChar(50), actividad.Fuente || null)
          .query(`
            INSERT INTO dbo.Eval360_Actividad
              (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)
            OUTPUT INSERTED.ActividadId
            VALUES
              (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, @fecha, @puntosMaximos, @porcentajeDentroRubro, @usaIndicadoresPlaneamiento, @fuente, 1, SYSDATETIME())
          `);
        actividadMap.set(Number(actividad.ActividadId), Number(nuevaActividad.recordset[0]?.ActividadId || 0));
      }
    }

    if (estructuraOrigenRow && estructuraDestinoId) {
      const indicadoresGrupo = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_IndicadorGrupo WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY IndicadorGrupoId`);
      for (const indicador of indicadoresGrupo.recordset || []) {
        const nuevoPlaneamientoId = planeamientoMap.get(Number(indicador.PlaneamientoId));
        if (!nuevoPlaneamientoId) continue;
        const indicadorExistente = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("tipoUso", sql.NVarChar(50), indicador.TipoUso)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicador.IndicadorBase || "")
          .query(`
            SELECT TOP 1 IndicadorGrupoId
            FROM dbo.Eval360_IndicadorGrupo
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND PlaneamientoId = @planeamientoId
              AND ISNULL(Activo, 1) = 1
              AND ISNULL(TipoUso, N'') = ISNULL(@tipoUso, N'')
              AND UPPER(LTRIM(RTRIM(ISNULL(IndicadorBase, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@indicadorBase, N''))))
          `);
        if (indicadorExistente.recordset[0]) {
          indicadorGrupoMap.set(Number(indicador.IndicadorGrupoId), Number(indicadorExistente.recordset[0].IndicadorGrupoId));
          continue;
        }
        const nuevoIndicador = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("tipoUso", sql.NVarChar(50), indicador.TipoUso)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicador.IndicadorBase)
          .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicador.IndicadorAvanzado)
          .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicador.IndicadorIntermedio)
          .input("indicadorInicial", sql.NVarChar(sql.MAX), indicador.IndicadorInicial)
          .query(`
            INSERT INTO dbo.Eval360_IndicadorGrupo
              (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
            OUTPUT INSERTED.IndicadorGrupoId
            VALUES
              (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
          `);
        indicadorGrupoMap.set(Number(indicador.IndicadorGrupoId), Number(nuevoIndicador.recordset[0]?.IndicadorGrupoId || 0));
      }

      if (actividadMap.size && indicadorGrupoMap.size) {
        const asignaciones = await new sql.Request(transaction)
          .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
          .query(`
            SELECT ai.ActividadId, ai.IndicadorGrupoId
            FROM dbo.Eval360_ActividadIndicador ai
            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId
            WHERE a.EstructuraGrupoId = @estructuraOrigenId
              AND ai.Activo = 1
          `);
        for (const asignacion of asignaciones.recordset || []) {
          const nuevaActividadId = actividadMap.get(Number(asignacion.ActividadId));
          const nuevoIndicadorId = indicadorGrupoMap.get(Number(asignacion.IndicadorGrupoId));
          if (!nuevaActividadId || !nuevoIndicadorId) continue;
          await new sql.Request(transaction)
            .input("actividadId", sql.Int, nuevaActividadId)
            .input("indicadorGrupoId", sql.Int, nuevoIndicadorId)
            .query(`
              INSERT INTO dbo.Eval360_ActividadIndicador
                (ActividadId, IndicadorGrupoId, Activo)
              VALUES
                (@actividadId, @indicadorGrupoId, 1)
            `);
        }
      }
    }

    await transaction.commit();
    return {
      copiado: totalPlaneamientosCopiados > 0,
      grupoOrigenId,
      totalPlaneamientosCopiados
    };
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  }
}

router.get("/mis-grupos/:grupoId/materias/:materiaId/planeamientos", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    res.set("Cache-Control", "no-store");

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar planeamientos de este grupo y materia");

    const pool = await getPool();
    const debeSincronizarPlaneamientos = String(req.query.sincronizar ?? "true") !== "false";
    const sincronizacionPlaneamientos = debeSincronizarPlaneamientos
      ? await copiarPlaneamientosDesdeSeccionMismoGradoSiFaltan(pool, {
          institucionId: Number(asignacion.InstitucionId),
          grupoId,
          materiaId,
          anioLectivoId,
          periodoId,
          usuarioId: Number(asignacion.UsuarioId)
        })
      : { copiado: false, grupoOrigenId: null, totalPlaneamientosCopiados: 0 };

    // Run these reads in sequence to avoid SQL Server memory waits when they
    // are launched together. The result sets are independent.
    const planeamientosResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          p.PlaneamientoId,
          p.InstitucionId,
          p.AnioLectivoId,
          p.PeriodoId,
          p.GrupoId,
          p.MateriaId,
          p.UsuarioId,
          p.Nombre,
          p.FechaInicio,
          p.FechaFin,
          p.Observaciones,
          CAST(CASE WHEN p.ResultadoIAJson IS NULL THEN 0 ELSE 1 END AS BIT) AS TieneResultadoIA,
          ISNULL(indicadoresIa.TotalIndicadoresIAGenerados, 0) AS TotalIndicadoresIAGenerados,
          p.Activo,
          p.CreatedAt,
          p.UpdatedAt
        FROM dbo.Planeamiento p
        OUTER APPLY (
          SELECT TOP 1 eg.EstructuraGrupoId
          FROM dbo.Eval360_EstructuraGrupo eg
          WHERE eg.InstitucionId = p.InstitucionId
            AND eg.AnioLectivoId = p.AnioLectivoId
            AND eg.PeriodoId = p.PeriodoId
            AND eg.GrupoId = p.GrupoId
            AND eg.MateriaId = p.MateriaId
            AND eg.Activo = 1
          ORDER BY eg.EstructuraGrupoId DESC
        ) estructuraActual
        OUTER APPLY (
          SELECT COUNT(1) AS TotalIndicadoresIAGenerados
          FROM dbo.Eval360_IndicadorGrupo i
          WHERE i.PlaneamientoId = p.PlaneamientoId
            AND i.EstructuraGrupoId = estructuraActual.EstructuraGrupoId
            AND ISNULL(i.Activo, 1) = 1
        ) indicadoresIa
        WHERE p.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.PeriodoId = @periodoId
          AND p.GrupoId = @grupoId
          AND p.MateriaId = @materiaId
          AND p.UsuarioId = @usuarioId
          AND p.Activo = 1
        ORDER BY p.FechaInicio DESC, p.PlaneamientoId DESC
      `);

    const indicadoresResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          pi.PlaneamientoIndicadorId,
          pi.PlaneamientoId,
          pi.Descripcion,
          pi.NivelDesempenoId,
          nd.Descripcion AS NivelDescripcion,
          nd.Valor AS NivelValor,
          pi.Activo
        FROM dbo.PlaneamientoIndicador pi
        INNER JOIN dbo.Planeamiento p ON p.PlaneamientoId = pi.PlaneamientoId
        LEFT JOIN dbo.NivelDesempeno nd ON nd.NivelDesempenoId = pi.NivelDesempenoId
        WHERE p.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.PeriodoId = @periodoId
          AND p.GrupoId = @grupoId
          AND p.MateriaId = @materiaId
          AND p.UsuarioId = @usuarioId
          AND p.Activo = 1
          AND pi.Activo = 1
        ORDER BY pi.PlaneamientoId, pi.PlaneamientoIndicadorId
      `);

    const indicadoresEval360Result = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          i.*,
          ISNULL(p.Nombre, N'') AS PlaneamientoNombreOrigen
        FROM dbo.Eval360_IndicadorGrupo i
        INNER JOIN dbo.Eval360_EstructuraGrupo eg
          ON eg.EstructuraGrupoId = i.EstructuraGrupoId
        LEFT JOIN dbo.Planeamiento p
          ON p.PlaneamientoId = i.PlaneamientoId
        WHERE eg.InstitucionId = @institucionId
          AND eg.AnioLectivoId = @anioLectivoId
          AND eg.PeriodoId = @periodoId
          AND eg.GrupoId = @grupoId
          AND eg.MateriaId = @materiaId
          AND eg.Activo = 1
          AND eg.EstructuraGrupoId = (
            SELECT TOP 1 egActual.EstructuraGrupoId
            FROM dbo.Eval360_EstructuraGrupo egActual
            WHERE egActual.InstitucionId = @institucionId
              AND egActual.AnioLectivoId = @anioLectivoId
              AND egActual.PeriodoId = @periodoId
              AND egActual.GrupoId = @grupoId
              AND egActual.MateriaId = @materiaId
              AND egActual.Activo = 1
            ORDER BY egActual.EstructuraGrupoId DESC
          )
          AND (p.PlaneamientoId IS NULL OR p.Activo = 1)
          AND ISNULL(i.Activo, 1) = 1
        ORDER BY
          i.PlaneamientoId,
          CASE i.TipoUso
            WHEN N'Cotidiano' THEN 1
            WHEN N'Tareas' THEN 2
            WHEN N'TablaEspecificaciones' THEN 3
            ELSE 9
          END,
          i.IndicadorGrupoId
        OPTION (MAX_GRANT_PERCENT = 1)
      `);

    return ok(res, {
      planeamientos: planeamientosResult.recordset,
      indicadores: indicadoresResult.recordset,
      indicadoresEval360: indicadoresEval360Result.recordset,
      sincronizacion: sincronizacionPlaneamientos
    });
  } catch (error) {
    console.error("Error cargando planeamientos:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los planeamientos" });
  }
});

router.get("/planeamientos/:planeamientoId/detalle", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento invalido");

    const pool = await getPool();
    const request = pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("usuarioId", sql.Int, getUserId(req));

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND p.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND p.UsuarioId = @usuarioId"
      : "";

    const result = await request.query(`
      SELECT TOP 1
        p.PlaneamientoId,
        p.InstitucionId,
        p.AnioLectivoId,
        p.PeriodoId,
        p.GrupoId,
        p.MateriaId,
        p.UsuarioId,
        p.Nombre,
        p.FechaInicio,
        p.FechaFin,
        p.Observaciones,
        CASE
          WHEN ISJSON(p.ResultadoIAJson) = 1
            THEN JSON_MODIFY(p.ResultadoIAJson, '$.plantillaFormatoDocx.base64', NULL)
          ELSE p.ResultadoIAJson
        END AS ResultadoIAJson,
        p.Activo,
        p.CreatedAt,
        p.UpdatedAt
      FROM dbo.Planeamiento p
      WHERE p.PlaneamientoId = @planeamientoId
        AND p.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    const planeamiento = result.recordset[0];
    if (!planeamiento) return forbidden(res, "No tenes permisos para consultar este planeamiento");

    return ok(res, {
      planeamiento: {
        ...planeamiento,
        TieneResultadoIA: !!planeamiento.ResultadoIAJson,
        ResultadoIAJson: sanitizeResultadoIAJsonForList(planeamiento.ResultadoIAJson)
      }
    });
  } catch (error) {
    console.error("Error cargando detalle del planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el detalle del planeamiento" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/planeamientos", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId);
    const nombre = normalizeText(req.body.nombre);
    const fechaInicio = normalizeText(req.body.fechaInicio) || null;
    const fechaFin = normalizeText(req.body.fechaFin) || null;
    const observaciones = normalizeText(req.body.observaciones) || null;
    const indicadores = Array.isArray(req.body.indicadores) ? req.body.indicadores : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!nombre) return badRequest(res, "El nombre del planeamiento es obligatorio");

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para crear planeamientos en este grupo y materia");

    await transaction.begin();

    const insertPlaneamiento = new sql.Request(transaction);
    const planeamientoResult = await insertPlaneamiento
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .input("nombre", sql.NVarChar(200), nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
      .query(`
        INSERT INTO dbo.Planeamiento
          (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, Activo, CreatedAt)
        OUTPUT INSERTED.PlaneamientoId
        VALUES
          (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, 1, SYSDATETIME())
      `);

    const planeamientoId = Number(planeamientoResult.recordset[0]?.PlaneamientoId);

    for (const item of indicadores) {
      const descripcion = normalizeText(item.descripcion);
      if (!descripcion) continue;
      const nivelDesempenoId = toOptionalNumber(item.nivelDesempenoId);
      const indicadorRequest = new sql.Request(transaction);
      await indicadorRequest
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
        .input("nivelDesempenoId", sql.Int, nivelDesempenoId)
        .query(`
          INSERT INTO dbo.PlaneamientoIndicador
            (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
          VALUES
            (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
        `);
    }

    await transaction.commit();
    return ok(res, { PlaneamientoId: planeamientoId, message: "Planeamiento guardado correctamente" });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error guardando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar el planeamiento" });
  }
});

router.put("/planeamientos/:planeamientoId", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    const nombre = normalizeText(req.body.nombre);
    const fechaInicio = normalizeText(req.body.fechaInicio) || null;
    const fechaFin = normalizeText(req.body.fechaFin) || null;
    const observaciones = normalizeText(req.body.observaciones) || null;
    const indicadores = Array.isArray(req.body.indicadores) ? req.body.indicadores : [];

    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");
    if (!nombre) return badRequest(res, "El nombre del planeamiento es obligatorio");

    const pool = await getPool();
    const lookupRequest = pool.request().input("planeamientoId", sql.Int, planeamientoId).input("usuarioId", sql.Int, getUserId(req));
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      lookupRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND p.InstitucionId = @institucionId";
    }
    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND p.UsuarioId = @usuarioId" : "";
    const lookup = await lookupRequest.query(`
      SELECT TOP 1 p.*
      FROM dbo.Planeamiento p
      WHERE p.PlaneamientoId = @planeamientoId
        AND p.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
    `);
    if (!lookup.recordset[0]) return forbidden(res, "No tenés permisos para editar este planeamiento");

    await transaction.begin();

    const updateRequest = new sql.Request(transaction);
    await updateRequest
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("nombre", sql.NVarChar(200), nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
      .query(`
        UPDATE dbo.Planeamiento
        SET Nombre = @nombre,
            FechaInicio = @fechaInicio,
            FechaFin = @fechaFin,
            Observaciones = @observaciones,
            UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoId = @planeamientoId
      `);

    const clearRequest = new sql.Request(transaction);
    await clearRequest
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        UPDATE dbo.PlaneamientoIndicador
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoId = @planeamientoId
      `);

    for (const item of indicadores) {
      const descripcion = normalizeText(item.descripcion);
      if (!descripcion) continue;
      const nivelDesempenoId = toOptionalNumber(item.nivelDesempenoId);
      const indicadorRequest = new sql.Request(transaction);
      await indicadorRequest
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
        .input("nivelDesempenoId", sql.Int, nivelDesempenoId)
        .query(`
          INSERT INTO dbo.PlaneamientoIndicador
            (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
          VALUES
            (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
        `);
    }

    await transaction.commit();
    return ok(res, { message: "Planeamiento actualizado correctamente" });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error actualizando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el planeamiento" });
  }
});

router.delete("/planeamientos/:planeamientoId", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");

    const pool = await getPool();
    const request = pool.request().input("planeamientoId", sql.Int, planeamientoId).input("usuarioId", sql.Int, getUserId(req));
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND InstitucionId = @institucionId";
    }
    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND UsuarioId = @usuarioId" : "";

    const indicadoresIaResult = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT COUNT(1) AS TotalIndicadoresIA
        FROM dbo.Eval360_IndicadorGrupo
        WHERE PlaneamientoId = @planeamientoId
          AND ISNULL(Activo, 1) = 1
      `);

    const totalIndicadoresIA = Number(indicadoresIaResult.recordset?.[0]?.TotalIndicadoresIA || 0);
    if (totalIndicadoresIA > 0) {
      return res.status(409).json({
        ok: false,
        message: "No se puede eliminar este planeamiento porque ya tiene indicadores generados con IA. Primero eliminá los indicadores IA asociados al planeamiento.",
        data: { totalIndicadoresIA }
      });
    }

    const result = await request.query(`
      UPDATE dbo.Planeamiento
      SET Activo = 0, UpdatedAt = SYSDATETIME()
      WHERE PlaneamientoId = @planeamientoId
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    if ((result.rowsAffected?.[0] || 0) === 0) return forbidden(res, "No tenés permisos para desactivar este planeamiento");
    return ok(res, { message: "Planeamiento desactivado correctamente" });
  } catch (error) {
    console.error("Error desactivando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo desactivar el planeamiento" });
  }
});

router.delete("/planeamientos/:planeamientoId/eliminar-definitivo", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");

    const alcanceRaw = String(req.query.alcance || req.body?.alcance || "seccion").trim().toLowerCase();
    const alcance = alcanceRaw === "todas" ? "todas" : "seccion";

    const pool = await getPool();
    const lookupRequest = pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("usuarioId", sql.Int, getUserId(req));

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      lookupRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND p.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND p.UsuarioId = @usuarioId"
      : "";

    const lookup = await lookupRequest.query(`
      SELECT TOP 1
        p.PlaneamientoId,
        p.InstitucionId,
        p.AnioLectivoId,
        p.PeriodoId,
        p.GrupoId,
        p.MateriaId,
        p.UsuarioId,
        p.Nombre,
        p.FechaInicio,
        p.FechaFin,
        p.ResultadoIAJson,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico AS GrupoNivelAcademico
      FROM dbo.Planeamiento p
      INNER JOIN dbo.Grupo g ON g.GrupoId = p.GrupoId
      WHERE p.PlaneamientoId = @planeamientoId
        AND p.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    const base = lookup.recordset[0];
    if (!base) return forbidden(res, "No tenés permisos para eliminar este planeamiento");

    const toDateKey = (value: any) => (value ? new Date(value).toISOString().slice(0, 10) : "");
    const baseNombreKey = normalizeKey(base.Nombre || "");
    const baseInicioKey = toDateKey(base.FechaInicio);
    const baseFinKey = toDateKey(base.FechaFin);
    const baseResultadoIA = String(base.ResultadoIAJson || "");

    let idsObjetivo: number[] = [Number(base.PlaneamientoId)];
    const detalleObjetivo = new Map<number, { grupoId: number; grupoNombre: string }>([
      [Number(base.PlaneamientoId), { grupoId: Number(base.GrupoId), grupoNombre: String(base.GrupoNombre || "") }]
    ]);

    if (alcance === "todas") {
      const gruposMismoGradoResult = await pool.request()
        .input("institucionId", sql.Int, Number(base.InstitucionId))
        .input("anioLectivoId", sql.Int, Number(base.AnioLectivoId))
        .input("periodoId", sql.Int, Number(base.PeriodoId))
        .input("materiaId", sql.Int, Number(base.MateriaId))
        .input("usuarioId", sql.Int, Number(base.UsuarioId))
        .input("grupoBaseId", sql.Int, Number(base.GrupoId))
        .query(`
          WITH base_grupo AS (
            SELECT TOP 1
              g.GrupoId,
              g.Nivel,
              g.NivelAcademico,
              LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) AS GradoNombre
            FROM dbo.Grupo g
            WHERE g.GrupoId = @grupoBaseId
          )
          SELECT DISTINCT
            g.GrupoId,
            g.Nombre AS GrupoNombre
          FROM dbo.AsignacionDocente ad
          INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
          CROSS JOIN base_grupo bg
          WHERE ad.Activo = 1
            AND ad.InstitucionId = @institucionId
            AND ad.AnioLectivoId = @anioLectivoId
            AND ad.PeriodoId = @periodoId
            AND ad.MateriaId = @materiaId
            AND ad.UsuarioId = @usuarioId
            AND (
              ad.GrupoId = @grupoBaseId
              OR (g.NivelAcademico IS NOT NULL AND bg.NivelAcademico IS NOT NULL AND g.NivelAcademico = bg.NivelAcademico)
              OR UPPER(LTRIM(RTRIM(ISNULL(g.Nivel, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(bg.Nivel, N''))))
              OR LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) = bg.GradoNombre
            )
        `);

      const gruposMismoGradoIds = (gruposMismoGradoResult.recordset || []).map((item: any) => Number(item.GrupoId)).filter((id: number) => id > 0);
      if (gruposMismoGradoIds.length > 0) {
        const idsClause = gruposMismoGradoIds.join(",");
        const candidatosResult = await pool.request()
          .input("institucionId", sql.Int, Number(base.InstitucionId))
          .input("anioLectivoId", sql.Int, Number(base.AnioLectivoId))
          .input("periodoId", sql.Int, Number(base.PeriodoId))
          .input("materiaId", sql.Int, Number(base.MateriaId))
          .input("usuarioId", sql.Int, Number(base.UsuarioId))
          .query(`
            SELECT
              p.PlaneamientoId,
              p.GrupoId,
              g.Nombre AS GrupoNombre,
              p.Nombre,
              p.FechaInicio,
              p.FechaFin,
              p.ResultadoIAJson
            FROM dbo.Planeamiento p
            INNER JOIN dbo.Grupo g ON g.GrupoId = p.GrupoId
            WHERE p.InstitucionId = @institucionId
              AND p.AnioLectivoId = @anioLectivoId
              AND p.PeriodoId = @periodoId
              AND p.MateriaId = @materiaId
              AND p.UsuarioId = @usuarioId
              AND p.Activo = 1
              AND p.GrupoId IN (${idsClause})
          `);

        idsObjetivo = (candidatosResult.recordset || [])
          .filter((item: any) => {
            const sameByNameAndDates =
              normalizeKey(item.Nombre || "") === baseNombreKey
              && toDateKey(item.FechaInicio) === baseInicioKey
              && toDateKey(item.FechaFin) === baseFinKey;
            const sameByIaJson =
              !!baseResultadoIA
              && !!item.ResultadoIAJson
              && String(item.ResultadoIAJson) === baseResultadoIA;
            // El alcance "todas" debe reunir únicamente copias del mismo
            // planeamiento entre secciones. Coincidir solo por el nombre y
            // fechas, o solo por un JSON reutilizado, podía incluir versiones
            // ajenas y bloquear la eliminación por indicadores de otra copia.
            return Number(item.PlaneamientoId) === Number(base.PlaneamientoId)
              || (sameByNameAndDates && sameByIaJson);
          })
          .map((item: any) => {
            const id = Number(item.PlaneamientoId);
            detalleObjetivo.set(id, {
              grupoId: Number(item.GrupoId),
              grupoNombre: String(item.GrupoNombre || "")
            });
            return id;
          });
      }
    }

    idsObjetivo = Array.from(new Set(idsObjetivo)).filter((id) => Number.isFinite(id) && id > 0);
    if (!idsObjetivo.length) return badRequest(res, "No se encontraron planeamientos para eliminar");

    const idsObjetivoClause = idsObjetivo.join(",");
    const indicadoresResult = await pool.request().query(`
      SELECT
        ig.PlaneamientoId,
        COUNT(1) AS TotalIndicadoresIA
      FROM dbo.Eval360_IndicadorGrupo ig
      WHERE ig.PlaneamientoId IN (${idsObjetivoClause})
        AND ISNULL(ig.Activo, 1) = 1
      GROUP BY ig.PlaneamientoId
    `);

    const bloqueados = (indicadoresResult.recordset || []).map((row: any) => {
      const id = Number(row.PlaneamientoId);
      const detalle = detalleObjetivo.get(id);
      return {
        planeamientoId: id,
        totalIndicadoresIA: Number(row.TotalIndicadoresIA || 0),
        grupoId: Number(detalle?.grupoId || 0),
        grupoNombre: String(detalle?.grupoNombre || "")
      };
    });

    if (bloqueados.length > 0) {
      const grupos = bloqueados.map((item: any) => item.grupoNombre).filter(Boolean).join(", ");
      return res.status(409).json({
        ok: false,
        message: alcance === "todas"
          ? `No se puede eliminar para todas las secciones porque hay indicadores IA activos en: ${grupos || "una o más secciones"}.`
          : "No se puede eliminar este planeamiento porque ya tiene indicadores generados con IA en esta sección.",
        data: { bloqueados, alcance }
      });
    }

    await transaction.begin();

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.PlaneamientoIndicador
      WHERE PlaneamientoId IN (${idsObjetivoClause});
    `);

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.Planeamiento
      WHERE PlaneamientoId IN (${idsObjetivoClause});
    `);

    await transaction.commit();

    return ok(res, {
      message: alcance === "todas"
        ? `Planeamiento eliminado en ${idsObjetivo.length} sección(es) del mismo grado`
        : "Planeamiento eliminado correctamente de esta sección",
      alcance,
      totalEliminados: idsObjetivo.length
    });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error eliminando planeamiento definitivo en gestión profe:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el planeamiento" });
  }
});


const asistenciaEstadosPermitidos = new Set([
  "PRESENTE",
  "AUSENTE_JUSTIFICADA",
  "AUSENTE_INJUSTIFICADA",
  "TARDIA_MENOR_10",
  "TARDIA_MAYOR_10"
]);

function calcularValorAusenciaArticulo37(estado: string) {
  switch (estado) {
    case "AUSENTE_INJUSTIFICADA": return 1;
    case "TARDIA_MAYOR_10": return 1;
    case "TARDIA_MENOR_10": return 0.5;
    default: return 0;
  }
}

function calcularPorcentajeArticulo37(porcentajeAusencias: number) {
  if (porcentajeAusencias >= 50) return 0;
  if (porcentajeAusencias >= 40) return 1;
  if (porcentajeAusencias >= 30) return 2;
  if (porcentajeAusencias >= 20) return 3;
  if (porcentajeAusencias >= 10) return 4;
  return 5;
}


function getDiaSemanaEscolar(fecha: string) {
  const date = new Date(`${fecha}T00:00:00`);
  const jsDay = date.getDay();
  return jsDay + 1;
}

async function buildResumenAsistencia(
  grupoId: number,
  materiaId: number,
  anioLectivoId: number,
  periodoId: number,
  grupoClaseId?: number | null
) {
  const pool = await getPool();
  const filtroGrupoClaseResumen = grupoClaseId
    ? "AND ISNULL(dbo.fn_GrupoClaseCanonicoId(GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)"
    : "";
  const filtroGrupoClaseResumenAlias = grupoClaseId
    ? "AND ISNULL(dbo.fn_GrupoClaseCanonicoId(ar.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)"
    : "";

  const leccionesResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("grupoClaseId", sql.Int, grupoClaseId || null)
    .query(`
      SELECT COUNT(DISTINCT CONCAT(
        CONVERT(varchar(10), ar.Fecha, 23),
        N'-',
        CASE
          WHEN @grupoClaseId IS NOT NULL
            THEN ISNULL(CONVERT(varchar(20), COALESCE(ar.BloqueHorarioId, hg.BloqueHorarioId, ar.HorarioGrupoId)), N'0')
          ELSE ISNULL(CONVERT(varchar(20), ar.HorarioGrupoId), N'0')
        END
      )) AS TotalLecciones
      FROM dbo.AsistenciaRegistro ar
      LEFT JOIN dbo.HorarioGrupo hg
        ON hg.HorarioGrupoId = ar.HorarioGrupoId
      WHERE ar.GrupoId = @grupoId
        AND ar.MateriaId = @materiaId
        AND ar.AnioLectivoId = @anioLectivoId
        AND ar.PeriodoId = @periodoId
        ${filtroGrupoClaseResumen}
    `);

  const totalLecciones = Number(leccionesResult.recordset[0]?.TotalLecciones || 0);

  const registrosResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("grupoClaseId", sql.Int, grupoClaseId || null)
    .query(`
      ;WITH registros AS (
        SELECT
          ar.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          ar.Estado,
          ar.Fecha,
          ar.HorarioGrupoId,
          ROW_NUMBER() OVER (
            PARTITION BY
              ar.EstudianteId,
              ar.Fecha,
              CASE
                WHEN @grupoClaseId IS NOT NULL
                  THEN ISNULL(CONVERT(varchar(20), COALESCE(ar.BloqueHorarioId, hg.BloqueHorarioId, ar.HorarioGrupoId)), N'0')
                ELSE ISNULL(CONVERT(varchar(20), ar.HorarioGrupoId), N'0')
              END
            ORDER BY ISNULL(ar.UpdatedAt, ar.CreatedAt) DESC, ar.AsistenciaRegistroId DESC
          ) AS Posicion
        FROM dbo.AsistenciaRegistro ar
        LEFT JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = ar.HorarioGrupoId
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ar.EstudianteId
        WHERE ar.GrupoId = @grupoId
          AND ar.MateriaId = @materiaId
          AND ar.AnioLectivoId = @anioLectivoId
          AND ar.PeriodoId = @periodoId
          ${filtroGrupoClaseResumenAlias}
      )
      SELECT
        EstudianteId,
        Identificacion,
        Nombre,
        PrimerApellido,
        SegundoApellido,
        Estado
      FROM registros
      WHERE Posicion = 1
      ORDER BY PrimerApellido, SegundoApellido, Nombre, Fecha, HorarioGrupoId
    `);

  const resumenMap = new Map<number, any>();
  for (const row of registrosResult.recordset) {
    const estudianteId = Number(row.EstudianteId);
    if (!resumenMap.has(estudianteId)) {
      resumenMap.set(estudianteId, {
        EstudianteId: estudianteId,
        Identificacion: row.Identificacion,
        Nombre: row.Nombre,
        PrimerApellido: row.PrimerApellido,
        SegundoApellido: row.SegundoApellido,
        TotalLecciones: totalLecciones,
        AusenciasInjustificadasEquivalentes: 0,
        PorcentajeAusencias: 0,
        PorcentajeAsignadoArticulo37: 5
      });
    }

    const resumen = resumenMap.get(estudianteId);
    resumen.AusenciasInjustificadasEquivalentes += calcularValorAusenciaArticulo37(String(row.Estado || ""));
  }

  for (const resumen of resumenMap.values()) {
    resumen.AusenciasInjustificadasEquivalentes = Number(resumen.AusenciasInjustificadasEquivalentes.toFixed(2));
    resumen.PorcentajeAusencias = totalLecciones > 0
      ? Number(((resumen.AusenciasInjustificadasEquivalentes * 100) / totalLecciones).toFixed(2))
      : 0;
    resumen.PorcentajeAsignadoArticulo37 = calcularPorcentajeArticulo37(resumen.PorcentajeAusencias);
  }

  return Array.from(resumenMap.values());
}

router.get("/mis-grupos/:grupoId/materias/:materiaId/asistencia", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    const fecha = normalizeText(req.query.fecha) || getCostaRicaIsoDate();

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const asignacion = await getAsignacionPermitida(
      req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar asistencia de este grupo y materia");

    const pool = await getPool();
    await ensureReporteEnvioBitacoraTable(pool);
    const diaSemana = getDiaSemanaEscolar(fecha);
    const filtroLeccionesGrupo = grupoClaseId
      ? `
            AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
            AND EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseSeccion gcs
              WHERE gcs.GrupoClaseId = @grupoClaseId
                AND gcs.GrupoId = gm.GrupoId
                AND gcs.Activo = 1
            )
            AND EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseLeccionPatron patron
              WHERE patron.GrupoClaseId = @grupoClaseId
                AND patron.DiaSemana = hg.DiaSemana
                AND patron.BloqueHorarioId = hg.BloqueHorarioId
                AND patron.Activo = 1
            )`
      : "AND gm.GrupoId = @grupoId";
    const filtroEstudiantesGrupo = grupoClaseId
      ? `
          AND EXISTS (
            SELECT 1
            FROM dbo.GrupoClaseEstudiante gce
            WHERE gce.GrupoClaseId = @grupoClaseId
              AND gce.MatriculaId = ma.MatriculaId
              AND gce.Activo = 1
          )`
      : "AND ma.GrupoId = @grupoId";
    const filtroRegistrosGrupoClase = grupoClaseId
      ? "AND ISNULL(dbo.fn_GrupoClaseCanonicoId(ar.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)"
      : "";

    const leccionesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .input("diaSemana", sql.Int, diaSemana)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        ;WITH lecciones AS (
          SELECT
            hg.HorarioGrupoId,
            hg.BloqueHorarioId,
            bh.Nombre,
            CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
            CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin,
            bh.OrdenVisual,
            hg.DiaSemana,
            CASE
              WHEN gm.PeriodoId = @periodoId THEN 0
              WHEN gm.PeriodoId IS NULL THEN 1
              ELSE 2
            END AS PrioridadPeriodo
          FROM dbo.HorarioGrupo hg
          INNER JOIN dbo.GrupoMateria gm
            ON gm.GrupoMateriaId = hg.GrupoMateriaId
           AND gm.Activo = 1
          INNER JOIN dbo.BloqueHorario bh
            ON bh.BloqueHorarioId = hg.BloqueHorarioId
          WHERE gm.MateriaId = @materiaId
            ${filtroLeccionesGrupo}
            AND hg.DiaSemana = @diaSemana
            AND (@grupoClaseId IS NOT NULL OR hg.Activo = 1)
        ),
        leccionesPriorizadas AS (
          SELECT *, MIN(PrioridadPeriodo) OVER () AS MejorPrioridadPeriodo
          FROM lecciones
        )
        SELECT
          MIN(HorarioGrupoId) AS HorarioGrupoId,
          BloqueHorarioId,
          Nombre,
          HoraInicio,
          HoraFin,
          OrdenVisual,
          DiaSemana,
          COUNT(DISTINCT HorarioGrupoId) AS TotalHorariosVinculados
        FROM leccionesPriorizadas
        WHERE PrioridadPeriodo = MejorPrioridadPeriodo
        GROUP BY BloqueHorarioId, Nombre, HoraInicio, HoraFin, OrdenVisual, DiaSemana
        ORDER BY OrdenVisual, HoraInicio
      `);

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion AS TipoAdecuacion,
          ma.MatriculaId,
          ${suspensionVigenteSelectSql}
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        ${getSuspensionVigenteApplySql("e")}
        WHERE ma.AnioLectivoId = @anioLectivoId
          ${filtroEstudiantesGrupo}
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    const registrosResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("fecha", sql.Date, fecha)
      .input("diaSemana", sql.Int, diaSemana)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        ;WITH lecciones AS (
          SELECT
            hg.HorarioGrupoId,
            hg.BloqueHorarioId,
            CASE
              WHEN gm.PeriodoId = @periodoId THEN 0
              WHEN gm.PeriodoId IS NULL THEN 1
              ELSE 2
            END AS PrioridadPeriodo
          FROM dbo.HorarioGrupo hg
          INNER JOIN dbo.GrupoMateria gm
            ON gm.GrupoMateriaId = hg.GrupoMateriaId
           AND gm.Activo = 1
          WHERE gm.MateriaId = @materiaId
            ${filtroLeccionesGrupo}
            AND hg.DiaSemana = @diaSemana
            AND (@grupoClaseId IS NOT NULL OR hg.Activo = 1)
        ),
        leccionesPriorizadas AS (
          SELECT *, MIN(PrioridadPeriodo) OVER () AS MejorPrioridadPeriodo
          FROM lecciones
        ),
        leccionesVisibles AS (
          SELECT
            MIN(HorarioGrupoId) AS HorarioGrupoId,
            BloqueHorarioId
          FROM leccionesPriorizadas
          WHERE PrioridadPeriodo = MejorPrioridadPeriodo
          GROUP BY BloqueHorarioId
        ),
        registros AS (
          SELECT
            ar.AsistenciaRegistroId,
            ar.EstudianteId,
            lv.HorarioGrupoId AS HorarioGrupoIdVisible,
            ar.HorarioGrupoId AS HorarioGrupoIdOriginal,
            COALESCE(ar.BloqueHorarioId, hgAr.BloqueHorarioId, lv.BloqueHorarioId) AS BloqueHorarioId,
            ar.GrupoId,
            ar.MateriaId,
            ar.AnioLectivoId,
            ar.PeriodoId,
            ar.Fecha,
            ar.Estado,
            ar.MinutosTardia,
            ar.Observacion,
            ROW_NUMBER() OVER (
              PARTITION BY ar.EstudianteId, lv.HorarioGrupoId
              ORDER BY
                CASE WHEN ar.HorarioGrupoId = lv.HorarioGrupoId THEN 0 ELSE 1 END,
                ISNULL(ar.UpdatedAt, ar.CreatedAt) DESC,
                ar.AsistenciaRegistroId DESC
            ) AS Posicion
          FROM dbo.AsistenciaRegistro ar
          LEFT JOIN dbo.HorarioGrupo hgAr
            ON hgAr.HorarioGrupoId = ar.HorarioGrupoId
          INNER JOIN leccionesVisibles lv
            ON lv.BloqueHorarioId = COALESCE(ar.BloqueHorarioId, hgAr.BloqueHorarioId)
          WHERE ar.GrupoId = @grupoId
            AND ar.MateriaId = @materiaId
            AND ar.AnioLectivoId = @anioLectivoId
            AND ar.PeriodoId = @periodoId
            AND ar.Fecha = @fecha
            ${filtroRegistrosGrupoClase}
        )
        SELECT
          r.AsistenciaRegistroId,
          r.EstudianteId,
          r.HorarioGrupoIdVisible AS HorarioGrupoId,
          r.BloqueHorarioId,
          r.GrupoId,
          r.MateriaId,
          r.AnioLectivoId,
          r.PeriodoId,
          r.Fecha,
          r.Estado,
          r.MinutosTardia,
          r.Observacion,
          ISNULL(reb.CorreoEnviado, 0) AS CorreoEnviado,
          ISNULL(reb.WaEnviado, 0) AS WaEnviado
        FROM registros r
        LEFT JOIN dbo.ReporteEnvioBitacora reb
          ON reb.Modulo = N'ASISTENCIA'
         AND reb.RegistroClave = CONCAT(
           N'ASIS|',
           CONVERT(varchar(20), r.GrupoId), N'|',
           CONVERT(varchar(20), r.MateriaId), N'|',
           CONVERT(varchar(20), r.PeriodoId), N'|',
           CONVERT(varchar(10), r.Fecha, 23), N'|',
           CONVERT(varchar(20), r.EstudianteId), N'|',
           CONVERT(varchar(20), r.HorarioGrupoIdOriginal)
         )
        WHERE r.Posicion = 1
      `);

    const resumen = await buildResumenAsistencia(grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);

    return ok(res, {
      fecha,
      diaSemana,
      lecciones: leccionesResult.recordset,
      estudiantes: estudiantesResult.recordset,
      registros: registrosResult.recordset,
      resumen,
      escalaArticulo37: [
        { desde: 0, hastaMenor: 10, porcentaje: 5 },
        { desde: 10, hastaMenor: 20, porcentaje: 4 },
        { desde: 20, hastaMenor: 30, porcentaje: 3 },
        { desde: 30, hastaMenor: 40, porcentaje: 2 },
        { desde: 40, hastaMenor: 50, porcentaje: 1 },
        { desde: 50, hastaMenor: null, porcentaje: 0 }
      ]
    });
  } catch (error) {
    console.error("Error cargando asistencia:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la asistencia" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/asistencia", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body.grupoClaseId);
    const fecha = normalizeText(req.body.fecha);
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!fecha) return badRequest(res, "La fecha de asistencia es obligatoria");
    if (registros.length === 0) return badRequest(res, "No se recibieron registros de asistencia");

    const asignacion = await getAsignacionPermitida(
      req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenés permisos para registrar asistencia en este grupo y materia");

    const pool = await getPool();
    if (await responderSiCursoCerrado(res, pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    })) return;

    await ensureReporteEnvioBitacoraTable(pool);
    const filtroEstudiantesGrupo = grupoClaseId
      ? `
          AND EXISTS (
            SELECT 1
            FROM dbo.GrupoClaseEstudiante gce
            WHERE gce.GrupoClaseId = @grupoClaseId
              AND gce.MatriculaId = ma.MatriculaId
              AND gce.Activo = 1
          )`
      : "AND ma.GrupoId = @grupoId";
    const filtroLeccionesGrupo = grupoClaseId
      ? `
            AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
            AND EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseSeccion gcs
              WHERE gcs.GrupoClaseId = @grupoClaseId
                AND gcs.GrupoId = gm.GrupoId
                AND gcs.Activo = 1
            )
            AND EXISTS (
              SELECT 1
              FROM dbo.GrupoClaseLeccionPatron patron
              WHERE patron.GrupoClaseId = @grupoClaseId
                AND patron.DiaSemana = hg.DiaSemana
                AND patron.BloqueHorarioId = hg.BloqueHorarioId
                AND patron.Activo = 1
            )`
      : "AND gm.GrupoId = @grupoId";

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT DISTINCT e.EstudianteId
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.AnioLectivoId = @anioLectivoId
          ${filtroEstudiantesGrupo}
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
      `);

    const estudiantesPermitidos = new Set<number>(estudiantesResult.recordset.map((item: any) => Number(item.EstudianteId)));

    const diaSemana = getDiaSemanaEscolar(fecha);
    const leccionesPermitidasResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .input("diaSemana", sql.Int, diaSemana)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        ;WITH lecciones AS (
          SELECT
            hg.HorarioGrupoId,
            hg.BloqueHorarioId,
            bh.Nombre AS LeccionNombre,
            CASE
              WHEN gm.PeriodoId = @periodoId THEN 0
              WHEN gm.PeriodoId IS NULL THEN 1
              ELSE 2
            END AS PrioridadPeriodo
          FROM dbo.HorarioGrupo hg
          INNER JOIN dbo.GrupoMateria gm
            ON gm.GrupoMateriaId = hg.GrupoMateriaId
           AND gm.Activo = 1
          INNER JOIN dbo.BloqueHorario bh
            ON bh.BloqueHorarioId = hg.BloqueHorarioId
          WHERE gm.MateriaId = @materiaId
            ${filtroLeccionesGrupo}
            AND hg.DiaSemana = @diaSemana
            AND (@grupoClaseId IS NOT NULL OR hg.Activo = 1)
        ),
        leccionesPriorizadas AS (
          SELECT *, MIN(PrioridadPeriodo) OVER () AS MejorPrioridadPeriodo
          FROM lecciones
        )
        SELECT
          HorarioGrupoId,
          BloqueHorarioId,
          LeccionNombre
        FROM leccionesPriorizadas
        WHERE PrioridadPeriodo = MejorPrioridadPeriodo
      `);
    const leccionesPermitidas = new Map<number, number>();
    const leccionesNombrePorHorario = new Map<number, string>();
    const horariosPorBloque = new Map<number, number[]>();
    const horariosEquivalentesPorHorario = new Map<number, number[]>();
    for (const item of leccionesPermitidasResult.recordset) {
      const horarioGrupoId = Number(item.HorarioGrupoId);
      const bloqueHorarioId = Number(item.BloqueHorarioId);
      leccionesPermitidas.set(horarioGrupoId, bloqueHorarioId);
      leccionesNombrePorHorario.set(horarioGrupoId, String(item.LeccionNombre || "").trim());
      const horarios = horariosPorBloque.get(bloqueHorarioId) || [];
      horarios.push(horarioGrupoId);
      horariosPorBloque.set(bloqueHorarioId, horarios);
    }
    for (const [bloqueHorarioId, horarios] of horariosPorBloque.entries()) {
      const ordenados = Array.from(new Set(horarios)).sort((a, b) => a - b);
      horariosPorBloque.set(bloqueHorarioId, ordenados);
      for (const horarioGrupoId of ordenados) {
        horariosEquivalentesPorHorario.set(horarioGrupoId, ordenados);
      }
    }

    const normalizadosSolicitados = registros.map((item: any) => ({
      estudianteId: Number(item.estudianteId),
      horarioGrupoId: Number(item.horarioGrupoId || 0),
      bloqueHorarioId: Number(item.bloqueHorarioId || 0),
      estado: normalizeText(item.estado) || "PRESENTE",
      minutosTardia: toOptionalNumber(item.minutosTardia) || 0,
      observacion: normalizeText(item.observacion).slice(0, 500) || null,
      notificarEncargado: Boolean(item.notificarEncargado)
    }));

    for (const item of normalizadosSolicitados) {
      if (!Number.isFinite(item.estudianteId) || !estudiantesPermitidos.has(item.estudianteId)) {
        return badRequest(res, "Se recibió un estudiante que no pertenece al grupo seleccionado");
      }
      if (!leccionesPermitidas.has(item.horarioGrupoId)) {
        return badRequest(res, "Se recibió una lección que no pertenece al horario de esa sección, materia y fecha");
      }
      item.bloqueHorarioId = leccionesPermitidas.get(item.horarioGrupoId) || item.bloqueHorarioId;
      if (!asistenciaEstadosPermitidos.has(item.estado)) {
        return badRequest(res, "Estado de asistencia inválido");
      }
      if (item.minutosTardia < 0 || item.minutosTardia > 999) {
        return badRequest(res, "Los minutos de tardía deben estar entre 0 y 999");
      }
    }

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(asignacion.InstitucionId),
      normalizadosSolicitados.map((item: any) => item.estudianteId)
    );
    if (bloqueoSuspension) {
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }

    const normalizadosExpandidos = normalizadosSolicitados.flatMap((item: any) => {
      const horariosEquivalentes = grupoClaseId
        ? (horariosEquivalentesPorHorario.get(item.horarioGrupoId) || [item.horarioGrupoId])
        : [item.horarioGrupoId];
      return horariosEquivalentes.map((horarioGrupoId) => ({
        ...item,
        horarioGrupoId,
        bloqueHorarioId: leccionesPermitidas.get(horarioGrupoId) || item.bloqueHorarioId
      }));
    });

    const normalizadosMap = new Map<string, any>();
    for (const item of normalizadosExpandidos) {
      normalizadosMap.set(`${item.estudianteId}|${item.horarioGrupoId}`, item);
    }

    const normalizados = Array.from(normalizadosMap.values());

    await transaction.begin();

    const sourceGrupoClaseSelect = grupoClaseId ? "@grupoClaseId AS GrupoClaseId," : "";
    const matchGrupoClaseClause = grupoClaseId
      ? "\n             AND ISNULL(dbo.fn_GrupoClaseCanonicoId(target.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(source.GrupoClaseId), 0)"
      : "";
    const insertGrupoClaseColumn = grupoClaseId ? ", GrupoClaseId" : "";
    const insertGrupoClaseValue = grupoClaseId ? ", @grupoClaseId" : "";

    let guardados = 0;
    for (const item of normalizados) {
      const request = new sql.Request(transaction);
      await request
        .input("estudianteId", sql.Int, item.estudianteId)
        .input("horarioGrupoId", sql.Int, item.horarioGrupoId)
        .input("bloqueHorarioId", sql.Int, item.bloqueHorarioId)
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("grupoClaseId", sql.Int, grupoClaseId)
        .input("fecha", sql.Date, fecha)
        .input("estado", sql.NVarChar(40), item.estado)
        .input("minutosTardia", sql.Int, item.minutosTardia)
        .input("observacion", sql.NVarChar(500), item.observacion)
        .input("usuarioId", sql.Int, getUserId(req))
        .query(`
          MERGE dbo.AsistenciaRegistro AS target
          USING (
            SELECT
              @estudianteId AS EstudianteId,
              @horarioGrupoId AS HorarioGrupoId,
              @bloqueHorarioId AS BloqueHorarioId,
              @grupoId AS GrupoId,
              @materiaId AS MateriaId,
              @anioLectivoId AS AnioLectivoId,
              @periodoId AS PeriodoId,
              ${sourceGrupoClaseSelect}
              @fecha AS Fecha
          ) AS source
          ON target.EstudianteId = source.EstudianteId
             AND target.HorarioGrupoId = source.HorarioGrupoId
             AND target.GrupoId = source.GrupoId
             AND target.MateriaId = source.MateriaId
             AND target.AnioLectivoId = source.AnioLectivoId
             AND target.PeriodoId = source.PeriodoId
             ${matchGrupoClaseClause}
             AND target.Fecha = source.Fecha
          WHEN MATCHED THEN
            UPDATE SET
              Estado = @estado,
              MinutosTardia = @minutosTardia,
              Observacion = @observacion,
              UsuarioRegistroId = @usuarioId,
              UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (EstudianteId, HorarioGrupoId, BloqueHorarioId, GrupoId, MateriaId, AnioLectivoId, PeriodoId${insertGrupoClaseColumn}, Fecha, Estado, MinutosTardia, Observacion, UsuarioRegistroId, CreatedAt)
            VALUES (@estudianteId, @horarioGrupoId, @bloqueHorarioId, @grupoId, @materiaId, @anioLectivoId, @periodoId${insertGrupoClaseValue}, @fecha, @estado, @minutosTardia, @observacion, @usuarioId, SYSDATETIME());
        `);
      guardados += 1;
    }

    await transaction.commit();

    const resumen = await buildResumenAsistencia(grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);

    const notificaciones: any[] = [];
    const correosPendientes: Array<{ estudianteId: number; input: Parameters<typeof sendEmailsBatch>[0][number] }> = [];
    const correoEnviadoPorEstudiante = new Map<number, boolean>();
    const waEnviadoPorEstudiante = new Map<number, boolean>();
    const registrosNotificar = normalizadosSolicitados.filter((item: any) => item.notificarEncargado);
    const porEstudiante = new Map<number, any[]>();
    for (const item of registrosNotificar) {
      const list = porEstudiante.get(Number(item.estudianteId)) || [];
      list.push(item);
      porEstudiante.set(Number(item.estudianteId), list);
    }
    const correoCfg = await getCorreoNotificacionConfig(pool, Number(getAuth(req).institucionId || 0), "ASISTENCIA");
    const institucionNombreResult = await pool.request()
      .input("institucionId", sql.Int, Number(getAuth(req).institucionId || 0))
      .query(`SELECT TOP 1 Nombre FROM dbo.Institucion WHERE InstitucionId = @institucionId`);
    const institucionNombre = String(institucionNombreResult.recordset[0]?.Nombre || "");

    for (const [estudianteId, items] of porEstudiante.entries()) {
      let waEnviado = false;
      try {
        const estudianteResult = await pool.request()
          .input("estudianteId", sql.Int, estudianteId)
          .query(`
            SELECT TOP 1
              e.EstudianteId,
              e.Identificacion,
              e.Nombre,
              e.PrimerApellido,
              e.SegundoApellido,
              e.FechaNacimiento,
              e.Telefono AS TelefonoEstudiante,
              e.Correo,
              e.AutorizaWhatsAppEncargado,
              enc.Telefonos AS EncargadosTelefonos
            FROM dbo.Estudiante e
            OUTER APPLY (
              SELECT
                STUFF((
                  SELECT DISTINCT '|' + LTRIM(RTRIM(ISNULL(en2.Telefono, '')))
                  FROM dbo.EstudianteEncargado ee2
                  INNER JOIN dbo.Encargado en2 ON en2.EncargadoId = ee2.EncargadoId
                  WHERE ee2.EstudianteId = e.EstudianteId
                    AND ISNULL(ee2.Activo, 1) = 1
                    AND ISNULL(en2.Activo, 1) = 1
                    AND ISNULL(ee2.RecibeNotificaciones, 1) = 1
                    AND LTRIM(RTRIM(ISNULL(en2.Telefono, ''))) <> ''
                  FOR XML PATH(''), TYPE
                ).value('.', 'nvarchar(max)'), 1, 1, '') AS Telefonos
            ) enc
            WHERE e.EstudianteId = @estudianteId
          `);

        const estudiante = estudianteResult.recordset[0];
        if (!estudiante) continue;

        const nombreEstudiante = [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" ");
        const detalle = items.map((item) => {
          const estadoTexto = String(item.estado || "").replace(/_/g, " ").toLowerCase();
          const leccionNombre = leccionesNombrePorHorario.get(Number(item.horarioGrupoId || 0));
          const bloque = leccionNombre || (item.bloqueHorarioId ? leccionOrdinalLabel(Number(item.bloqueHorarioId)) : "Leccion");
          return `${bloque}: ${estadoTexto}${item.observacion ? ` (${item.observacion})` : ""}`;
        }).join("\n");
        const vars = {
          fecha,
          alumno: nombreEstudiante,
          materia: String(asignacion?.MateriaNombre || ""),
          seccion: String(asignacion?.GrupoNombre || ""),
          lecciones: String(items.length),
          profesor: [asignacion?.ProfesorNombre || "", asignacion?.ProfesorPrimerApellido || "", asignacion?.ProfesorSegundoApellido || ""].join(" ").replace(/\s+/g, " ").trim(),
          colegio: institucionNombre,
          reporte: items.some((x) => String(x?.estado || "").includes("TARDIA")) && items.some((x) => String(x?.estado || "").includes("AUSENTE"))
            ? "Ausencia y tardía"
            : (items.some((x) => String(x?.estado || "").includes("TARDIA")) ? "Tardía" : "Ausencia"),
          detalle
        };
        const subject = correoCfg?.AsuntoTemplate ? renderTemplate(String(correoCfg.AsuntoTemplate), vars) : "Reporte de asistencia";
        const texto = correoCfg?.CuerpoTemplate
          ? renderTemplate(String(correoCfg.CuerpoTemplate), vars)
          : `Se registra asistencia para ${nombreEstudiante}. Fecha: ${fecha}. ${detalle}`;
        const correoProfesorCopia = resolveNotificationCc(req);

        if (estudiante.Correo) {
          correosPendientes.push({ estudianteId, input: {
            from: String(correoCfg?.FromEmail || ""),
            to: estudiante.Correo,
            cc: correoProfesorCopia || undefined,
            subject,
            text: texto,
            html: `<p>${toHtmlWithLineBreaks(texto)}</p>`,
            idempotencyKey: `asistencia-${grupoId}-${materiaId}-${periodoId}-${fecha}-${estudianteId}`
          }});
        }

        {
          const telefonos = resolveWhatsAppPhonesForNotification({
            fechaNacimiento: estudiante.FechaNacimiento,
            telefonoEstudiante: estudiante.TelefonoEstudiante,
            telefonosEncargados: String(estudiante.EncargadosTelefonos || "")
              .split("|")
              .map((item) => String(item || "").trim())
              .filter((item) => item.length > 0),
            autorizaWhatsAppEncargado: !!estudiante.AutorizaWhatsAppEncargado
          });
          for (const telefono of telefonos) {
            const whatsapp = await sendWhatsAppSeguimiento({
              telefono,
              mensaje: texto
            });
            notificaciones.push({ estudianteId, canal: "whatsapp", telefono, ...whatsapp });
            if (whatsapp?.enviado === true) waEnviado = true;
          }
        }
      } catch (notifyError: any) {
        console.error("No se pudo notificar asistencia:", notifyError);
        notificaciones.push({ estudianteId, enviado: false, error: notifyError?.message || "Error notificando" });
      }
      waEnviadoPorEstudiante.set(estudianteId, waEnviado);
    }

    if (correosPendientes.length) {
      try {
        const resultadosCorreo = await sendEmailsBatch(correosPendientes.map((item) => item.input));
        correosPendientes.forEach((pendiente, index) => {
          const correo = resultadosCorreo[index] || { enviado: false, motivo: "No se recibió respuesta del proveedor" };
          correoEnviadoPorEstudiante.set(pendiente.estudianteId, correo.enviado === true);
          notificaciones.push({ estudianteId: pendiente.estudianteId, canal: "correo", ...correo });
        });
      } catch (emailError: any) {
        console.error("No se pudo enviar el lote de correos de asistencia:", emailError);
        correosPendientes.forEach((pendiente) => {
          correoEnviadoPorEstudiante.set(pendiente.estudianteId, false);
          notificaciones.push({ estudianteId: pendiente.estudianteId, canal: "correo", enviado: false, error: emailError?.message || "Error enviando correo" });
        });
      }
    }

    for (const [estudianteId, items] of porEstudiante.entries()) {
      const correoEnviado = correoEnviadoPorEstudiante.get(estudianteId) === true;
      const waEnviado = waEnviadoPorEstudiante.get(estudianteId) === true;
      for (const item of items) {
        const registroClave = `ASIS|${grupoId}|${materiaId}|${periodoId}|${fecha}|${estudianteId}|${Number(item.horarioGrupoId || 0)}`;
        await upsertReporteEnvioBitacora(pool, {
          modulo: "ASISTENCIA",
          registroClave,
          grupoId,
          materiaId,
          periodoId,
          anioLectivoId,
          estudianteId,
          fecha,
          correoEnviado,
          waEnviado
        });
      }
    }

    return ok(res, {
      guardados,
      resumen,
      notificaciones,
      message: "Asistencia guardada correctamente"
    });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error guardando asistencia:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la asistencia" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId/bitacora", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    if (!grupoId || !materiaId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parámetros de bitácora");

    const asignacion = await getAsignacionPermitida(
      req,
      res,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenés permiso para este grupo/materia");

    const pool = await getPool();
    await ensureBitacoraGrupoTable(pool);
    const result = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT
          b.BitacoraGrupoId,
          b.GrupoId,
          b.MateriaId,
          b.AnioLectivoId,
          b.PeriodoId,
          b.FechaRegistro,
          b.TemasDesarrollados,
          b.Observaciones,
          b.HechosRelevantes,
          b.UsuarioId,
          CONCAT(ISNULL(u.Nombre,''), ' ', ISNULL(u.PrimerApellido,''), ' ', ISNULL(u.SegundoApellido,'')) AS NombreUsuario
        FROM dbo.BitacoraGrupo b
        LEFT JOIN dbo.Usuario u ON u.UsuarioId = b.UsuarioId
        WHERE b.InstitucionId = @institucionId
          AND b.GrupoId = @grupoId
          AND b.MateriaId = @materiaId
          AND b.AnioLectivoId = @anioLectivoId
          AND b.PeriodoId = @periodoId
          AND ISNULL(dbo.fn_GrupoClaseCanonicoId(b.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)
        ORDER BY b.FechaRegistro DESC, b.BitacoraGrupoId DESC
      `);
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error cargando bitácora:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la bitácora" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/bitacora", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body?.anioLectivoId);
    const periodoId = toOptionalNumber(req.body?.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body?.grupoClaseId);
    if (!grupoId || !materiaId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parámetros para guardar bitácora");

    const temasDesarrollados = normalizeText(req.body?.temasDesarrollados);
    const observaciones = normalizeText(req.body?.observaciones);
    const hechosRelevantes = normalizeText(req.body?.hechosRelevantes);
    if (!temasDesarrollados) return badRequest(res, "Temas desarrollados es obligatorio");

    const asignacion = await getAsignacionPermitida(
      req,
      res,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenés permiso para este grupo/materia");

    const pool = await getPool();
    if (await responderSiCursoCerrado(res, pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    })) return;

    await ensureBitacoraGrupoTable(pool);
    const usuarioId = getUserId(req) || null;
    const insert = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("temasDesarrollados", sql.NVarChar(sql.MAX), temasDesarrollados)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones || null)
      .input("hechosRelevantes", sql.NVarChar(sql.MAX), hechosRelevantes || null)
      .input("usuarioId", sql.Int, usuarioId)
      .query(`
        INSERT INTO dbo.BitacoraGrupo
          (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, GrupoClaseId, FechaRegistro, TemasDesarrollados, Observaciones, HechosRelevantes, UsuarioId, CreatedAt, UpdatedAt)
        OUTPUT INSERTED.BitacoraGrupoId
        VALUES
          (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @grupoClaseId, CONVERT(date, SYSDATETIME()), @temasDesarrollados, @observaciones, @hechosRelevantes, @usuarioId, SYSDATETIME(), SYSDATETIME())
      `);
    return ok(res, { bitacoraGrupoId: Number(insert.recordset[0]?.BitacoraGrupoId || 0) }, "Bitácora guardada correctamente");
  } catch (error) {
    console.error("Error guardando bitácora:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la bitácora" });
  }
});

router.put("/mis-grupos/:grupoId/materias/:materiaId/bitacora/:bitacoraId", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const bitacoraId = toOptionalNumber(req.params.bitacoraId);
    const anioLectivoId = toOptionalNumber(req.body?.anioLectivoId);
    const periodoId = toOptionalNumber(req.body?.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body?.grupoClaseId);
    if (!grupoId || !materiaId || !bitacoraId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parÃ¡metros para actualizar bitÃ¡cora");

    const temasDesarrollados = normalizeText(req.body?.temasDesarrollados);
    const observaciones = normalizeText(req.body?.observaciones);
    const hechosRelevantes = normalizeText(req.body?.hechosRelevantes);
    if (!temasDesarrollados) return badRequest(res, "Temas desarrollados es obligatorio");

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!asignacion) return forbidden(res, "No tenÃ©s permiso para este grupo/materia");

    const pool = await getPool();
    if (await responderSiCursoCerrado(res, pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    })) return;

    await ensureBitacoraGrupoTable(pool);
    const update = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("bitacoraId", sql.Int, bitacoraId)
      .input("temasDesarrollados", sql.NVarChar(sql.MAX), temasDesarrollados)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones || null)
      .input("hechosRelevantes", sql.NVarChar(sql.MAX), hechosRelevantes || null)
      .query(`
        UPDATE dbo.BitacoraGrupo
        SET TemasDesarrollados = @temasDesarrollados,
            Observaciones = @observaciones,
            HechosRelevantes = @hechosRelevantes,
            UpdatedAt = SYSDATETIME()
        WHERE BitacoraGrupoId = @bitacoraId
          AND InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND ISNULL(dbo.fn_GrupoClaseCanonicoId(GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(@grupoClaseId), 0)
      `);
    if (!update.rowsAffected?.[0]) return res.status(404).json({ ok: false, message: "No se encontrÃ³ el registro de bitÃ¡cora" });
    return ok(res, { bitacoraGrupoId: bitacoraId }, "BitÃ¡cora actualizada correctamente");
  } catch (error) {
    console.error("Error actualizando bitÃ¡cora:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la bitÃ¡cora" });
  }
});


router.get("/mis-grupos/:grupoId/materias/:materiaId/cierre", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    if (!grupoId || !materiaId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parametros para consultar el cierre");

    const asignacion = await getAsignacionPermitida(
      req,
      res,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenes permiso para este grupo/materia");

    const pool = await getPool();
    await ensureCierreAcademicoCursoTables(pool);
    const cierreActual = await getCierreAcademicoCurso(pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    });
    const cierreResponse = normalizeCierreCursoRow(cierreActual) || {
      Estado: "ABIERTO",
      Cerrado: false,
      GrupoId: grupoId,
      MateriaId: materiaId,
      AnioLectivoId: anioLectivoId,
      PeriodoId: periodoId,
      Advertencias: []
    };

    if (String(req.query.soloEstado || "").toLowerCase() === "true") {
      return ok(res, { cierre: cierreResponse, preview: null });
    }

    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!data) return;

    const preview = buildCierreCursoPreview(data, cierreActual);

    return ok(res, {
      cierre: cierreResponse,
      preview
    });
  } catch (error) {
    console.error("Error consultando cierre de curso:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar el cierre del curso" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/cierre", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body?.anioLectivoId ?? req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.body?.periodoId ?? req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body?.grupoClaseId ?? req.query.grupoClaseId);
    if (!grupoId || !materiaId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parametros para cerrar el curso");

    const asignacion = await getAsignacionPermitida(
      req,
      res,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenes permiso para cerrar este grupo/materia");

    const pool = await getPool();
    await ensureCierreAcademicoCursoTables(pool);
    const cierreActual = await getCierreAcademicoCurso(pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    });
    if (isCierreCursoCerrado(cierreActual)) {
      return res.status(409).json({
        ok: false,
        message: "El curso ya esta cerrado.",
        data: { cierre: normalizeCierreCursoRow(cierreActual) }
      });
    }

    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!data) return;

    const preview = buildCierreCursoPreview(data, cierreActual);
    const snapshotJson = JSON.stringify(preview);
    const advertenciasJson = JSON.stringify(preview.advertencias || []);
    const usuarioId = getUserId(req) || null;
    const promedioGeneral = preview.resumen.promedioGeneral === null || preview.resumen.promedioGeneral === undefined
      ? null
      : Number(preview.resumen.promedioGeneral);

    const upsert = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("usuarioDocenteId", sql.Int, Number(asignacion.UsuarioId || usuarioId || 0) || null)
      .input("promedioGeneral", sql.Decimal(10, 2), promedioGeneral)
      .input("totalEstudiantes", sql.Int, Number(preview.resumen.totalEstudiantes || 0))
      .input("totalCompletos", sql.Int, Number(preview.resumen.totalCompletos || 0))
      .input("totalIncompletos", sql.Int, Number(preview.resumen.totalIncompletos || 0))
      .input("snapshotJson", sql.NVarChar(sql.MAX), snapshotJson)
      .input("advertenciasJson", sql.NVarChar(sql.MAX), advertenciasJson)
      .input("usuarioId", sql.Int, usuarioId)
      .query(`
        MERGE dbo.CierreAcademicoCurso WITH (HOLDLOCK) AS target
        USING (
          SELECT
            @institucionId AS InstitucionId,
            @grupoId AS GrupoId,
            @materiaId AS MateriaId,
            @anioLectivoId AS AnioLectivoId,
            @periodoId AS PeriodoId,
            @grupoClaseId AS GrupoClaseId
        ) AS source
        ON target.InstitucionId = source.InstitucionId
          AND target.GrupoId = source.GrupoId
          AND target.MateriaId = source.MateriaId
          AND target.AnioLectivoId = source.AnioLectivoId
          AND target.PeriodoId = source.PeriodoId
          AND ISNULL(dbo.fn_GrupoClaseCanonicoId(target.GrupoClaseId), 0) = ISNULL(dbo.fn_GrupoClaseCanonicoId(source.GrupoClaseId), 0)
          AND target.Activo = 1
        WHEN MATCHED THEN
          UPDATE SET
            UsuarioDocenteId = @usuarioDocenteId,
            Estado = N'${CIERRE_CURSO_ESTADO_CERRADO}',
            PromedioGeneral = @promedioGeneral,
            TotalEstudiantes = @totalEstudiantes,
            TotalCompletos = @totalCompletos,
            TotalIncompletos = @totalIncompletos,
            SnapshotJson = @snapshotJson,
            AdvertenciasJson = @advertenciasJson,
            CerradoPorUsuarioId = @usuarioId,
            CerradoAt = SYSDATETIME(),
            MotivoReapertura = NULL,
            UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, GrupoClaseId, UsuarioDocenteId, Estado,
            PromedioGeneral, TotalEstudiantes, TotalCompletos, TotalIncompletos, SnapshotJson, AdvertenciasJson,
            CerradoPorUsuarioId, CerradoAt, Activo, CreatedAt, UpdatedAt
          )
          VALUES (
            @institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @grupoClaseId, @usuarioDocenteId, N'${CIERRE_CURSO_ESTADO_CERRADO}',
            @promedioGeneral, @totalEstudiantes, @totalCompletos, @totalIncompletos, @snapshotJson, @advertenciasJson,
            @usuarioId, SYSDATETIME(), 1, SYSDATETIME(), SYSDATETIME()
          )
        OUTPUT INSERTED.*;
      `);

    const cierreGuardado = upsert.recordset[0];
    await insertarAuditoriaCierreCurso(pool, {
      cierreId: Number(cierreGuardado.CierreAcademicoCursoId),
      accion: "CIERRE_DOCENTE",
      usuarioId,
      estadoAnterior: cierreActual?.Estado || null,
      estadoNuevo: CIERRE_CURSO_ESTADO_CERRADO,
      snapshot: preview
    });
    bootstrapCache.clear();

    return ok(res, {
      cierre: normalizeCierreCursoRow(cierreGuardado),
      preview
    }, preview.resumen.estado === "Completo" ? "Curso cerrado correctamente" : "Curso cerrado con advertencias");
  } catch (error) {
    console.error("Error cerrando curso:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cerrar el curso" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/cierre/reabrir", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;
    if (!isSuperAdmin(req) && !isInstitutionAdmin(req)) {
      return forbidden(res, "Solo Direccion o administracion puede reabrir cursos cerrados");
    }

    const grupoId = toOptionalNumber(req.params.grupoId);
    const materiaId = toOptionalNumber(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body?.anioLectivoId ?? req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.body?.periodoId ?? req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.body?.grupoClaseId ?? req.query.grupoClaseId);
    const motivo = normalizeText(req.body?.motivo).slice(0, 1000);
    if (!grupoId || !materiaId || !anioLectivoId || !periodoId) return badRequest(res, "Faltan parametros para reabrir el curso");
    if (!motivo) return badRequest(res, "El motivo de reapertura es obligatorio");

    const asignacion = await getAsignacionPermitida(
      req,
      res,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    );
    if (!asignacion) return forbidden(res, "No tenes permiso para reabrir este grupo/materia");

    const pool = await getPool();
    await ensureCierreAcademicoCursoTables(pool);
    const cierreActual = await getCierreAcademicoCurso(pool, {
      institucionId: Number(asignacion.InstitucionId),
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      grupoClaseId
    });
    if (!cierreActual) return badRequest(res, "Este curso no tiene un cierre registrado");
    if (!isCierreCursoCerrado(cierreActual)) {
      return badRequest(res, "El curso no esta cerrado actualmente");
    }

    const usuarioId = getUserId(req) || null;
    const update = await pool.request()
      .input("cierreId", sql.Int, Number(cierreActual.CierreAcademicoCursoId))
      .input("usuarioId", sql.Int, usuarioId)
      .input("motivo", sql.NVarChar(1000), motivo)
      .query(`
        UPDATE dbo.CierreAcademicoCurso
        SET Estado = N'${CIERRE_CURSO_ESTADO_REABIERTO}',
            ReabiertoPorUsuarioId = @usuarioId,
            ReabiertoAt = SYSDATETIME(),
            MotivoReapertura = @motivo,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE CierreAcademicoCursoId = @cierreId
          AND Activo = 1
      `);

    const cierreReabierto = update.recordset[0];
    await insertarAuditoriaCierreCurso(pool, {
      cierreId: Number(cierreReabierto.CierreAcademicoCursoId),
      accion: "REAPERTURA_DIRECCION",
      usuarioId,
      motivo,
      estadoAnterior: cierreActual.Estado || null,
      estadoNuevo: CIERRE_CURSO_ESTADO_REABIERTO,
      snapshot: normalizeCierreCursoRow(cierreReabierto)
    });
    bootstrapCache.clear();

    return ok(res, {
      cierre: normalizeCierreCursoRow(cierreReabierto)
    }, "Curso reabierto correctamente");
  } catch (error) {
    console.error("Error reabriendo curso:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reabrir el curso" });
  }
});


router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/excel", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!data) return;

    const rows: any[][] = [];
    const contexto = data.contexto;

    rows.push(["MINISTERIO DE EDUCACIÓN PÚBLICA"]);
    rows.push([String(contexto.Nombre || "Institución")]);
    rows.push([`Código presupuestario: ${contexto.CodigoPresupuestario || ""}`]);
    rows.push([`Grupo: ${contexto.GrupoNombre || ""}`, `Materia: ${contexto.MateriaNombre || ""}`, `Periodo: ${contexto.PeriodoNombre || ""}`]);
    rows.push([`Profesor: ${[contexto.ProfesorNombre || "", contexto.ProfesorPrimerApellido || "", contexto.ProfesorSegundoApellido || ""].join(" ").trim()}`]);
    rows.push([`Generado: ${formatDateCR(data.generadoEn)}`]);
    rows.push([]);

    const header = ["Estudiante", "Identificación"];
    for (const actividad of data.actividades) {
      header.push(`${actividad.ComponenteDescripcion} - ${actividad.Descripcion} (${formatNumber(actividad.PorcentajeReal)}%)`);
    }
    header.push("% acumulado evaluación", "Lecciones registradas", "Ausencias equivalentes", "% ausencias", "% asistencia Art. 37");
    header.push("Promedio final");
    rows.push(header);

    for (const estudiante of data.estudiantes) {
      const row = [estudiante.NombreCompleto, estudiante.Identificacion];
      for (const actividad of data.actividades) {
        const nota = estudiante.detalleNotas.find((item: any) => Number(item.actividadId) === Number(actividad.EvaluacionActividadId));
        row.push(nota?.nota === null || nota?.nota === undefined ? "" : Number(nota.nota));
      }
      row.push(
        estudiante.acumuladoEvaluacion,
        estudiante.totalLecciones,
        estudiante.ausenciasEquivalentes,
        estudiante.porcentajeAusencias,
        estudiante.porcentajeAsistencia,
        estudiante.promedioFinal
      );
      rows.push(row);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Reporte");
    worksheet.addRows(rows);
    worksheet.columns = header.map((_, index) => ({ width: index === 0 ? 36 : 18 }));

    const headerRowNumber = rows.findIndex((row) => row === header) + 1;
    const headerRow = worksheet.getRow(headerRowNumber);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF0F172A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });

    data.estudiantes.forEach((estudiante: any, index: number) => {
      const row = worksheet.getRow(headerRowNumber + index + 1);
      const kind = getAdecuacionReportStyleKind(estudiante.TipoAdecuacion);
      const fillColor = kind === "SIGNIFICATIVA"
        ? "FFDCFCE7"
        : kind === "NO_SIGNIFICATIVA"
          ? "FFE0F2FE"
          : index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
        if (kind === "SIGNIFICATIVA") cell.font = { ...(cell.font || {}), bold: true };
        if (kind === "NO_SIGNIFICATIVA") cell.font = { ...(cell.font || {}), color: { argb: "FF64748B" } };
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < headerRowNumber) return;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } }
        };
      });
    });

    const rawBuffer: any = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
    const fileName = `reporte-${String(contexto.GrupoNombre || "grupo").replace(/\s+/g, "-")}-${String(contexto.MateriaNombre || "materia").replace(/\s+/g, "-")}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error generando reporte Excel:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el reporte en Excel" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/pdf", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!data) return;

    const c = data.contexto;
    const profesor = [c.ProfesorNombre || "", c.ProfesorPrimerApellido || "", c.ProfesorSegundoApellido || ""].join(" ").replace(/\s+/g, " ").trim();

    const actividadHeaders = data.actividades.map((actividad: any) => `
      <th>${escapeHtml(actividad.ComponenteDescripcion)}<br><small>${escapeHtml(actividad.Descripcion)}<br>${formatNumber(actividad.PorcentajeReal)}%</small></th>
    `).join("");

    const rows = data.estudiantes.map((estudiante: any, estudianteIndex: number) => {
      const notas = data.actividades.map((actividad: any) => {
        const nota = estudiante.detalleNotas.find((item: any) => Number(item.actividadId) === Number(actividad.EvaluacionActividadId));
        return `<td class="num">${nota?.nota === null || nota?.nota === undefined ? "" : formatNumber(nota.nota, Number(data.plantilla?.DecimalesNota || 2))}</td>`;
      }).join("");

      return `
        <tr style="${getAdecuacionReportHtmlStyle(estudiante.TipoAdecuacion, estudianteIndex)}">
          <td>${escapeHtml(estudiante.NombreCompleto)}</td>
          <td>${escapeHtml(estudiante.Identificacion)}</td>
          ${notas}
          <td class="num strong">${formatNumber(estudiante.acumuladoEvaluacion)}%</td>
          <td class="num">${estudiante.totalLecciones}</td>
          <td class="num">${formatNumber(estudiante.ausenciasEquivalentes)}</td>
          <td class="num">${formatNumber(estudiante.porcentajeAusencias)}%</td>
          <td class="num strong">${formatNumber(estudiante.porcentajeAsistencia)}%</td>
          <td class="num strong">${formatNumber(estudiante.promedioFinal)}%</td>
        </tr>
      `;
    }).join("");

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte académico</title>
<style>
  @page { size: letter landscape; margin: 1.2cm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11px; }
  .membrete { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 16px; align-items: center; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-weight: 700; color: #334155; letter-spacing: 0.5px; font-size: 15px; }
  .gov { color: #64748b; font-size: 13px; }
  .inst { text-align: right; color: #334155; line-height: 1.35; }
  h1 { text-align: center; font-size: 18px; margin: 16px 0 10px; letter-spacing: 1px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 18px; margin-bottom: 14px; font-size: 11px; }
  .meta div { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #9ca3af; padding: 5px 6px; vertical-align: middle; }
  th { background: #f1f5f9; text-align: center; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
  .nota { margin-top: 12px; font-size: 10px; color: #374151; }
  .firma { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .linea { border-top: 1px solid #111827; padding-top: 6px; text-align: center; }
  .acciones { position: fixed; top: 10px; right: 10px; }
  .acciones button { padding: 8px 12px; border-radius: 8px; border: 1px solid #94a3b8; background: white; cursor: pointer; }
  @media print { .acciones { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <header class="membrete">
    <div class="brand">MINISTERIO DE<br>EDUCACIÓN PÚBLICA</div>
    <div class="gov">GOBIERNO<br>DE COSTA RICA</div>
    <div class="inst">
      <strong>${escapeHtml(c.Nombre || "Institución")}</strong><br>
      Código presupuestario: ${escapeHtml(c.CodigoPresupuestario || "")}<br>
      ${escapeHtml(c.DireccionExacta || c.Direccion || "")}
    </div>
  </header>

  <h1>REPORTE ACADÉMICO</h1>

  <section class="meta">
    <div><strong>Grupo:</strong> ${escapeHtml(c.GrupoNombre || "")}</div>
    <div><strong>Materia:</strong> ${escapeHtml(c.MateriaNombre || "")}</div>
    <div><strong>Periodo:</strong> ${escapeHtml(c.PeriodoNombre || "")}</div>
    <div><strong>Año lectivo:</strong> ${escapeHtml(c.AnioNombre || "")}</div>
    <div><strong>Docente:</strong> ${escapeHtml(profesor)}</div>
    <div><strong>Cargo:</strong> ${escapeHtml(c.ProfesorCargo || "")}</div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Estudiante</th>
        <th>Identificación</th>
        ${actividadHeaders}
        <th>% acumulado evaluación</th>
        <th>Lecciones</th>
        <th>Ausencias equivalentes</th>
        <th>% ausencias</th>
        <th>% asistencia Art. 37</th>
        <th>Promedio final</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p class="nota"><strong>Nota:</strong> el porcentaje de asistencia se calcula según el Artículo 37, usando ausencias injustificadas equivalentes registradas en el periodo.</p>

  <section class="firma">
    <div class="linea">${escapeHtml(profesor || "Docente")}<br>${escapeHtml(c.ProfesorCargo || "")}</div>
    <div class="linea">Dirección / Administración<br>${escapeHtml(c.Nombre || "")}</div>
  </section>

  <script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    console.error("Error generando reporte PDF:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el reporte en PDF" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/auditoria-envios", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);
    const desde = normalizeText(req.query.desde);
    const hasta = normalizeText(req.query.hasta);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!desde || !hasta) return badRequest(res, "Debés indicar rango de fechas");

    const asignacion = await getAsignacionPermitida(
      req, res, grupoId, materiaId, anioLectivoId, periodoId
    );
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar este reporte");

    const pool = await getPool();
    await ensureReporteEnvioBitacoraTable(pool);

    const result = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("desde", sql.Date, desde)
      .input("hasta", sql.Date, hasta)
      .query(`
        SELECT
          reb.ReporteEnvioBitacoraId,
          reb.Modulo,
          CASE
            WHEN reb.Modulo = N'ASISTENCIA' THEN N'Asistencia'
            WHEN reb.Modulo = N'COTIDIANO_INDICADOR' THEN N'Cotidiano (Indicador)'
            WHEN reb.Modulo = N'COTIDIANO_ACTIVIDAD' THEN N'Cotidiano (Actividad)'
            WHEN reb.Modulo = N'TAREAS_INDICADOR' THEN N'Tareas (Indicador)'
            WHEN reb.Modulo = N'TAREAS_ACTIVIDAD' THEN N'Tareas (Actividad)'
            ELSE reb.Modulo
          END AS ModuloNombre,
          reb.RegistroClave,
          reb.Fecha,
          reb.CorreoEnviado,
          reb.WaEnviado,
          reb.UltimoEnvioAt,
          reb.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion AS TipoAdecuacion
        FROM dbo.ReporteEnvioBitacora reb
        LEFT JOIN dbo.Estudiante e ON e.EstudianteId = reb.EstudianteId
        WHERE reb.GrupoId = @grupoId
          AND reb.MateriaId = @materiaId
          AND reb.AnioLectivoId = @anioLectivoId
          AND reb.PeriodoId = @periodoId
          AND reb.Fecha BETWEEN @desde AND @hasta
          AND reb.Modulo IN (N'ASISTENCIA', N'COTIDIANO_INDICADOR', N'COTIDIANO_ACTIVIDAD', N'TAREAS_INDICADOR', N'TAREAS_ACTIVIDAD')
        ORDER BY reb.Fecha DESC, reb.Modulo, e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    return ok(res, {
      desde,
      hasta,
      total: result.recordset.length,
      filas: result.recordset
    });
  } catch (error) {
    console.error("Error cargando auditoría de envíos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la auditoría de envíos" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/auditoria-envios/excel", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const desde = normalizeText(req.query.desde);
    const hasta = normalizeText(req.query.hasta);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!desde || !hasta) return badRequest(res, "Debés indicar rango de fechas");

    const asignacion = await getAsignacionPermitida(
      req, res, grupoId, materiaId, anioLectivoId, periodoId
    );
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar este reporte");

    const pool = await getPool();
    await ensureReporteEnvioBitacoraTable(pool);

    const result = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("desde", sql.Date, desde)
      .input("hasta", sql.Date, hasta)
      .query(`
        SELECT
          CASE
            WHEN reb.Modulo = N'ASISTENCIA' THEN N'Asistencia'
            WHEN reb.Modulo = N'COTIDIANO_INDICADOR' THEN N'Cotidiano (Indicador)'
            WHEN reb.Modulo = N'COTIDIANO_ACTIVIDAD' THEN N'Cotidiano (Actividad)'
            WHEN reb.Modulo = N'TAREAS_INDICADOR' THEN N'Tareas (Indicador)'
            WHEN reb.Modulo = N'TAREAS_ACTIVIDAD' THEN N'Tareas (Actividad)'
            ELSE reb.Modulo
          END AS ModuloNombre,
          reb.Fecha,
          ISNULL(e.Identificacion, N'') AS Identificacion,
          LTRIM(RTRIM(CONCAT(ISNULL(e.Nombre, N''), N' ', ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N'')))) AS Estudiante,
          CASE WHEN reb.CorreoEnviado = 1 THEN N'Sí' ELSE N'No' END AS CorreoEnviado,
          CASE WHEN reb.WaEnviado = 1 THEN N'Sí' ELSE N'No' END AS WaEnviado,
          reb.UltimoEnvioAt,
          reb.RegistroClave,
          e.Adecuacion AS TipoAdecuacion
        FROM dbo.ReporteEnvioBitacora reb
        LEFT JOIN dbo.Estudiante e ON e.EstudianteId = reb.EstudianteId
        WHERE reb.GrupoId = @grupoId
          AND reb.MateriaId = @materiaId
          AND reb.AnioLectivoId = @anioLectivoId
          AND reb.PeriodoId = @periodoId
          AND reb.Fecha BETWEEN @desde AND @hasta
          AND reb.Modulo IN (N'ASISTENCIA', N'COTIDIANO_INDICADOR', N'COTIDIANO_ACTIVIDAD', N'TAREAS_INDICADOR', N'TAREAS_ACTIVIDAD')
        ORDER BY reb.Fecha DESC, reb.Modulo, e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    const rows: any[][] = [];
    rows.push(["Auditoría de envíos (Asistencia, Cotidiano y Tareas)"]);
    rows.push([`Grupo: ${String(asignacion?.GrupoNombre || "")}`, `Materia: ${String(asignacion?.MateriaNombre || "")}`]);
    rows.push([`Rango: ${desde} a ${hasta}`]);
    rows.push([]);
    rows.push(["Módulo", "Fecha", "Identificación", "Estudiante", "Correo enviado", "WA enviado", "Último envío", "Clave de registro"]);

    for (const item of result.recordset) {
      rows.push([
        String(item.ModuloNombre || ""),
        formatDateCR(item.Fecha),
        String(item.Identificacion || ""),
        String(item.Estudiante || ""),
        String(item.CorreoEnviado || "No"),
        String(item.WaEnviado || "No"),
        item.UltimoEnvioAt ? formatDateCR(item.UltimoEnvioAt) : "",
        String(item.RegistroClave || "")
      ]);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("AuditoriaEnvios");
    worksheet.addRows(rows);
    worksheet.columns = [
      { width: 24 },
      { width: 14 },
      { width: 18 },
      { width: 34 },
      { width: 14 },
      { width: 12 },
      { width: 20 },
      { width: 48 }
    ];
    const tableHeaderRowNumber = 5;
    worksheet.getRow(tableHeaderRowNumber).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF0F172A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    result.recordset.forEach((item: any, index: number) => {
      const row = worksheet.getRow(tableHeaderRowNumber + index + 1);
      const kind = getAdecuacionReportStyleKind(item.TipoAdecuacion);
      const fillColor = kind === "SIGNIFICATIVA"
        ? "FFDCFCE7"
        : kind === "NO_SIGNIFICATIVA"
          ? "FFE0F2FE"
          : index % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
        if (kind === "SIGNIFICATIVA") cell.font = { ...(cell.font || {}), bold: true };
        if (kind === "NO_SIGNIFICATIVA") cell.font = { ...(cell.font || {}), color: { argb: "FF64748B" } };
      });
    });
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < tableHeaderRowNumber) return;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } }
        };
      });
    });
    const rawBuffer: any = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
    const fileName = `auditoria-envios-${String(asignacion?.GrupoNombre || "grupo").replace(/\s+/g, "-")}-${String(asignacion?.MateriaNombre || "materia").replace(/\s+/g, "-")}-${desde}-a-${hasta}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando auditoría de envíos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo exportar la auditoría de envíos" });
  }
});

export default router;

