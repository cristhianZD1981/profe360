import { Router } from "express";

import multer from "multer";

import JSZip from "jszip";

import ExcelJS from "exceljs";

import * as XLSX from "xlsx";

import { promises as fs } from "fs";

import path from "path";

import { Document, Packer, Paragraph, TextRun } from "docx";

import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";

import { getPool, sql, timedQuery } from "../../config/database";

import { badRequest, created, forbidden, ok } from "../../utils/http";

import { sendEmail } from "../../services/email.service";

import { env } from "../../config/env";

import { parseDateInputAsLocalDate } from "../../utils/date.utils";

import { normalizeWhatsAppPhone, resolveWhatsAppPhonesForNotification } from "../../utils/whatsapp.utils";

import { assertCierreCursoAbierto } from "../academico/cierre-curso.utils";

import { reaplicarTrasladosPendientesEnGrupo } from "../academico/matricula-traslado.utils";
import {
  getGrupoClasePermitido,
  hasGrupoClaseSchema,
  toOptionalGrupoClaseId
} from "../grupos-clase/grupos-clase.utils";
import {
  assertNoSuspendedStudents,
  getSuspensionVigenteApplySql,
  suspensionVigenteSelectSql
} from "../estudiantes/estudiante-suspension.utils";



const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const examenIaUpload = upload.any();

const CONTEXTO_CACHE_TTL_MS = 8000;

const contextoCache = new Map<string, { at: number; data: any }>();

const contextoInFlight = new Map<string, Promise<any>>();

const CONTEXTO_SECTION_CACHE_TTL_MS = 30000;

const contextoSectionCache = new Map<string, { at: number; data: any }>();

const BOOTSTRAP_CACHE_TTL_MS = 10000;

const bootstrapCache = new Map<string, { at: number; data: any }>();

const TRASLADOS_REAPLICADOS_TTL_MS = 5 * 60 * 1000;

const trasladosReaplicadosCache = new Map<string, number>();



router.use(requireAuth);

router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));



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



function toRequiredNumber(value: any, field: string, res: any) {

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {

    badRequest(res, `El campo ${field} es inválido`);

    return null;

  }

  return parsed;

}



function toNumberList(values: any) {

  const raw = Array.isArray(values) ? values : (values === undefined || values === null ? [] : [values]);

  return Array.from(

    new Set(

      raw

        .map((item) => Number(item))

        .filter((num) => Number.isFinite(num) && num > 0)

        .map((num) => Number(num))

    )

  );

}



function normalizeText(value: any) {

  return String(value ?? "").trim();

}



function buildPersonDisplayName(person: any) {

  const fromSingleField = normalizeText(

    person?.nombreCompleto

    || person?.NombreCompleto

    || person?.nombre

    || person?.Nombre

    || person?.name

  );

  if (fromSingleField) return fromSingleField;

  return [

    person?.Nombre,

    person?.PrimerApellido,

    person?.SegundoApellido

  ].map((part) => normalizeText(part)).filter(Boolean).join(" ");

}



async function getSessionTeacherDisplayName(pool: any, req: any, userIdOverride?: number | null) {

  const auth = getAuth(req) as any;

  const authName = buildPersonDisplayName(auth);

  if (authName) return authName;



  const userId = Number(userIdOverride || getUserId(req) || 0);

  if (!userId) return "";



  try {

    const result = await pool.request()

      .input("usuarioId", sql.Int, userId)

      .query(`

        SELECT TOP 1

          Nombre,

          PrimerApellido,

          SegundoApellido,

          Correo

        FROM dbo.Usuario

        WHERE UsuarioId = @usuarioId

      `);



    const row = result.recordset?.[0] || null;

    return buildPersonDisplayName(row) || normalizeText(row?.Correo);

  } catch {

    return "";

  }

}





function extractPruebaNumero(texto: string) {

  const match = String(texto || "").match(/(\d+(?:[.,]\d+)?)/);

  return match ? match[1].replace(",", ".") : String(texto || "").trim();

}



function toExcelJsBuffer(buffer: ArrayBuffer | Buffer) {

  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

}



function resolveLogoExtension(contentType?: string | null, source?: string | null) {

  const ct = String(contentType || "").toLowerCase();

  if (ct.includes("png")) return "png";

  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";

  if (ct.includes("gif")) return "gif";

  if (ct.includes("bmp")) return "bmp";

  if (ct.includes("webp")) return "webp";



  const ext = String(source || "").toLowerCase().split("?")[0].split(".").pop() || "";

  if (ext === "jpg") return "jpeg";

  if (ext === "jpeg") return "jpeg";

  if (ext === "png") return "png";

  if (ext === "gif") return "gif";

  if (ext === "bmp") return "bmp";

  if (ext === "webp") return "webp";

  return "png";

}



async function loadLogoBuffer(sourceUrl: string | null | undefined) {

  const candidates = [

    sourceUrl,

    path.resolve(process.cwd(), "..", "frontend", "public", "logo.png"),

    path.resolve(process.cwd(), "frontend", "public", "logo.png"),

    path.resolve(process.cwd(), "public", "logo.png")

  ].filter((value): value is string => Boolean(String(value || "").trim()));



  for (const candidate of candidates) {

    try {

      if (/^https?:\/\//i.test(candidate)) {

        const controller = new AbortController();

        const timeout = setTimeout(() => controller.abort(), 8000);

        try {

          const response = await fetch(candidate, { signal: controller.signal });

          if (!response.ok) continue;

          const arrayBuffer = await response.arrayBuffer();

          return {

            buffer: Buffer.from(arrayBuffer),

            extension: resolveLogoExtension(response.headers.get("content-type"), candidate)

          };

        } finally {

          clearTimeout(timeout);

        }

      }



      await fs.access(candidate);

      const buffer = await fs.readFile(candidate);

      return {

        buffer,

        extension: resolveLogoExtension(null, candidate)

      };

    } catch {

      continue;

    }

  }



  return null;

}



async function getTablaEspecificacionesSeccionesTexto(pool: any, actividadId: number, fallbackSeccion: string) {

  try {

    const result = await pool.request()

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT TOP 1 SeccionesJson

        FROM dbo.Eval360_ExamenIAGenerado

        WHERE ActividadIdTabla = @actividadId

          AND ISNULL(Activo, 1) = 1

        ORDER BY ExamenIAGeneradoId DESC

      `);



    const row = result.recordset?.[0];

    if (!row) return fallbackSeccion;



    const arr = (() => {

      try {

        const parsed = JSON.parse(String(row.SeccionesJson || "[]"));

        return Array.isArray(parsed) ? parsed : [];

      } catch {

        return [];

      }

    })();



    const ids = arr.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0);

    if (!ids.length) return fallbackSeccion;



    const reqSec = pool.request();

    const q = ids.map((_, idx) => `@sid${idx}`).join(",");

    ids.forEach((idSec, idx) => reqSec.input(`sid${idx}`, sql.Int, idSec));



    const secResult = await reqSec.query(`

      SELECT GrupoId, Nombre

      FROM dbo.Grupo

      WHERE GrupoId IN (${q})

    `);



    const namesById = new Map<number, string>(

      (secResult.recordset || []).map((item: any) => [Number(item.GrupoId), String(item.Nombre || "").trim()])

    );

    const ordered = ids.map((idSec) => namesById.get(idSec)).filter((value) => String(value || "").trim().length > 0);

    return ordered.length ? ordered.join(", ") : fallbackSeccion;

  } catch {

    return fallbackSeccion;

  }

}



function sanitizeEnvScalar(value: any) {

  return String(value ?? "")

    .replace(/\r/g, "\n")

    .split("\n")

    .map((part) => String(part || "").trim())

    .find((part) => part.length > 0) || "";

}



function getOpenAiApiKey() {

  return sanitizeEnvScalar(process.env.OPENAI_API_KEY);

}



function getOpenAiEvalModel() {

  return sanitizeEnvScalar(process.env.OPENAI_EVAL360_MODEL)

    || sanitizeEnvScalar(process.env.OPENAI_PLANEAMIENTO_MODEL)

    || sanitizeEnvScalar(process.env.OPENAI_MODEL)

    || "gpt-4.1-mini";

}

function getOpenAiExamModel() {

  return sanitizeEnvScalar(process.env.OPENAI_EVAL360_EXAM_MODEL)

    || sanitizeEnvScalar(process.env.OPENAI_EXAM_MODEL)

    || sanitizeEnvScalar(process.env.OPENAI_EXAMENES_MODEL)

    || "gpt-5.4";

}



function isGpt5FamilyModel(model: string) {

  return normalizeText(model).toLowerCase().includes("gpt-5");

}

function getOpenAiExamMaxOutputTokens() {

  const configured = Number(process.env.OPENAI_EVAL360_MAX_OUTPUT_TOKENS || 0);

  if (Number.isFinite(configured) && configured > 0) {

    return Math.max(4000, Math.min(24000, Math.round(configured)));

  }

  return 16000;

}



type OpenAiExamAttemptDebug = {

  stage: string;

  ok?: boolean;

  status?: number | null;

  model?: string;

  detail?: string;

};



function getContextCacheKeyFromParts(params: {

  institucionId: number;

  grupoId: number;

  materiaId: number;

  anioLectivoId: number;

  periodoId: number;

  grupoClaseId?: number | null;

}) {

  return `${params.institucionId}|${params.grupoId}|${params.materiaId}|${params.anioLectivoId}|${params.periodoId}|gc:${Number(params.grupoClaseId || 0)}`;

}



function clearContextCacheByParts(params: {

  institucionId: number;

  grupoId: number;

  materiaId: number;

  anioLectivoId: number;

  periodoId: number;

  grupoClaseId?: number | null;

}) {

  const key = getContextCacheKeyFromParts(params);

  for (const cacheKey of Array.from(contextoCache.keys())) {
    if (cacheKey === key || cacheKey.startsWith(`${key}|`)) contextoCache.delete(cacheKey);
  }

  for (const cacheKey of Array.from(contextoInFlight.keys())) {
    if (cacheKey === key || cacheKey.startsWith(`${key}|`)) contextoInFlight.delete(cacheKey);
  }

}



function getSectionCache<T>(key: string): T | null {

  const cached = contextoSectionCache.get(key);

  if (!cached) return null;

  if ((Date.now() - cached.at) > CONTEXTO_SECTION_CACHE_TTL_MS) {

    contextoSectionCache.delete(key);

    return null;

  }

  return cached.data as T;

}



function setSectionCache(key: string, data: any) {

  contextoSectionCache.set(key, { at: Date.now(), data });

}



function normalizeReplicaKey(value: any) {

  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");

}



async function getEstructurasReplicaTablaMismoGrado(executor: any, req: any, estructuraGrupoId: number) {

  const sourceResult = await new sql.Request(executor)

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT TOP 1

        eg.EstructuraGrupoId,

        eg.InstitucionId,

        eg.GrupoId,

        eg.MateriaId,

        eg.AnioLectivoId,

        eg.PeriodoId,

        LTRIM(RTRIM(ISNULL(g.Nivel, g.Nombre))) AS GrupoNivel

      FROM dbo.Eval360_EstructuraGrupo eg

      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

      WHERE eg.EstructuraGrupoId = @estructuraGrupoId

        AND ISNULL(eg.Activo, 1) = 1

    `);



  const source = sourceResult.recordset[0];

  if (!source) return [];



  const profesoresSourceResult = await new sql.Request(executor)

    .input("institucionId", sql.Int, Number(source.InstitucionId || 0))

    .input("grupoId", sql.Int, Number(source.GrupoId || 0))

    .input("materiaId", sql.Int, Number(source.MateriaId || 0))

    .input("anioLectivoId", sql.Int, Number(source.AnioLectivoId || 0))

    .input("periodoId", sql.Int, Number(source.PeriodoId || 0))

    .query(`

      SELECT DISTINCT ad.UsuarioId

      FROM dbo.AsignacionDocente ad

      WHERE ad.Activo = 1

        AND ad.InstitucionId = @institucionId

        AND ad.GrupoId = @grupoId

        AND ad.MateriaId = @materiaId

        AND ad.AnioLectivoId = @anioLectivoId

        AND ad.PeriodoId = @periodoId

        AND ad.UsuarioId IS NOT NULL

      ORDER BY ad.UsuarioId

    `);



  let profesorIds = (profesoresSourceResult.recordset || [])

    .map((row: any) => Number(row.UsuarioId || 0))

    .filter((id: number) => Number.isFinite(id) && id > 0);



  if (!profesorIds.length) {

    const userId = getUserId(req);

    if (userId) profesorIds = [userId];

  }

  if (!profesorIds.length) return [];



  const profesorPlaceholders = profesorIds.map((_, index) => `@profesorId${index}`).join(", ");

  const targetRequest = new sql.Request(executor)

    .input("institucionId", sql.Int, Number(source.InstitucionId || 0))

    .input("materiaId", sql.Int, Number(source.MateriaId || 0))

    .input("anioLectivoId", sql.Int, Number(source.AnioLectivoId || 0))

    .input("periodoId", sql.Int, Number(source.PeriodoId || 0))

    .input("grupoNivel", sql.NVarChar(120), String(source.GrupoNivel || ""))

    .input("estructuraGrupoId", sql.Int, Number(source.EstructuraGrupoId || 0));

  profesorIds.forEach((id, index) => targetRequest.input(`profesorId${index}`, sql.Int, id));



  const targetsResult = await targetRequest.query(`

      SELECT DISTINCT

        eg.EstructuraGrupoId,

        eg.GrupoId,

        g.Nombre AS GrupoNombre

      FROM dbo.AsignacionDocente ad

      INNER JOIN dbo.Eval360_EstructuraGrupo eg

        ON eg.InstitucionId = ad.InstitucionId

       AND eg.GrupoId = ad.GrupoId

       AND eg.MateriaId = ad.MateriaId

       AND eg.AnioLectivoId = ad.AnioLectivoId

       AND eg.PeriodoId = ad.PeriodoId

      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

      WHERE ad.Activo = 1

        AND ad.UsuarioId IN (${profesorPlaceholders})

        AND ad.InstitucionId = @institucionId

        AND ad.MateriaId = @materiaId

        AND ad.AnioLectivoId = @anioLectivoId

        AND ad.PeriodoId = @periodoId

        AND ISNULL(eg.Activo, 1) = 1

        AND eg.EstructuraGrupoId <> @estructuraGrupoId

        AND LTRIM(RTRIM(ISNULL(g.Nivel, g.Nombre))) = @grupoNivel

      ORDER BY GrupoNombre, EstructuraGrupoId

    `);



  return targetsResult.recordset || [];

}



async function getActividadReplicaDestino(executor: any, params: {

  sourceEstructuraGrupoId: number;

  sourceEstructuraGrupoDetalleId: number;

  sourceActividadId: number;

  targetEstructuraGrupoId: number;

}) {

  const sourceMetaResult = await new sql.Request(executor)

    .input("sourceEstructuraGrupoId", sql.Int, params.sourceEstructuraGrupoId)

    .input("sourceEstructuraGrupoDetalleId", sql.Int, params.sourceEstructuraGrupoDetalleId)

    .input("sourceActividadId", sql.Int, params.sourceActividadId)

    .query(`

      WITH source_acts AS (

        SELECT

          a.ActividadId,

          a.EstructuraGrupoDetalleId,

          a.Nombre,

          a.Descripcion,

          a.PuntosMaximos,

          a.PorcentajeDentroRubro,

          a.UsaIndicadoresPlaneamiento,

          a.Fuente,

          d.ComponenteCatalogoId,

          d.Orden AS DetalleOrden,

          ROW_NUMBER() OVER (PARTITION BY a.EstructuraGrupoDetalleId ORDER BY a.Fecha, a.ActividadId) AS ActividadOrden

        FROM dbo.Eval360_Actividad a

        INNER JOIN dbo.Eval360_EstructuraGrupoDetalle d ON d.EstructuraGrupoDetalleId = a.EstructuraGrupoDetalleId

        WHERE a.EstructuraGrupoId = @sourceEstructuraGrupoId

          AND a.EstructuraGrupoDetalleId = @sourceEstructuraGrupoDetalleId

          AND ISNULL(a.Activo, 1) = 1

      )

      SELECT TOP 1 *

      FROM source_acts

      WHERE ActividadId = @sourceActividadId

    `);



  const sourceMeta = sourceMetaResult.recordset[0];

  if (!sourceMeta) return null;



  const targetMetaResult = await new sql.Request(executor)

    .input("targetEstructuraGrupoId", sql.Int, params.targetEstructuraGrupoId)

    .input("componenteCatalogoId", sql.Int, Number(sourceMeta.ComponenteCatalogoId || 0))

    .input("detalleOrden", sql.Int, Number(sourceMeta.DetalleOrden || 0))

    .input("actividadOrden", sql.Int, Number(sourceMeta.ActividadOrden || 0))

    .query(`

      WITH target_acts AS (

        SELECT

          a.ActividadId,

          a.EstructuraGrupoDetalleId,

          ROW_NUMBER() OVER (PARTITION BY a.EstructuraGrupoDetalleId ORDER BY a.Fecha, a.ActividadId) AS ActividadOrden

        FROM dbo.Eval360_Actividad a

        INNER JOIN dbo.Eval360_EstructuraGrupoDetalle d ON d.EstructuraGrupoDetalleId = a.EstructuraGrupoDetalleId

        WHERE a.EstructuraGrupoId = @targetEstructuraGrupoId

          AND d.ComponenteCatalogoId = @componenteCatalogoId

          AND d.Orden = @detalleOrden

          AND ISNULL(a.Activo, 1) = 1

      )

      SELECT TOP 1 *

      FROM target_acts

      WHERE ActividadOrden = @actividadOrden

    `);



  const targetMeta = targetMetaResult.recordset[0];

  if (!targetMeta) return null;



  return {

    sourceMeta,

    targetActividadId: Number(targetMeta.ActividadId || 0),

    targetEstructuraGrupoDetalleId: Number(targetMeta.EstructuraGrupoDetalleId || 0)

  };

}



async function mapIndicadoresReplicaTabla(executor: any, params: {

  sourceEstructuraGrupoId: number;

  targetEstructuraGrupoId: number;

  indicadorIds: number[];

}) {

  const uniqueIds = Array.from(new Set(params.indicadorIds.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)));

  if (!uniqueIds.length) return new Map<number, number>();



  const placeholders = uniqueIds.map((_, index) => `@sourceIndicadorId${index}`).join(", ");

  const sourceReq = new sql.Request(executor)

    .input("sourceEstructuraGrupoId", sql.Int, params.sourceEstructuraGrupoId);

  uniqueIds.forEach((id, index) => sourceReq.input(`sourceIndicadorId${index}`, sql.Int, id));

  const sourceResult = await sourceReq.query(`

    SELECT

      i.IndicadorGrupoId,

      i.TipoUso,

      i.IndicadorBase,

      p.Nombre AS PlaneamientoNombre

    FROM dbo.Eval360_IndicadorGrupo i

    LEFT JOIN dbo.Planeamiento p ON p.PlaneamientoId = i.PlaneamientoId

    WHERE i.EstructuraGrupoId = @sourceEstructuraGrupoId

      AND ISNULL(i.Activo, 1) = 1

      AND i.IndicadorGrupoId IN (${placeholders})

  `);



  const targetResult = await new sql.Request(executor)

    .input("targetEstructuraGrupoId", sql.Int, params.targetEstructuraGrupoId)

    .query(`

      SELECT

        i.IndicadorGrupoId,

        i.TipoUso,

        i.IndicadorBase,

        p.Nombre AS PlaneamientoNombre

      FROM dbo.Eval360_IndicadorGrupo i

      LEFT JOIN dbo.Planeamiento p ON p.PlaneamientoId = i.PlaneamientoId

      WHERE i.EstructuraGrupoId = @targetEstructuraGrupoId

        AND ISNULL(i.Activo, 1) = 1

        AND i.TipoUso IN (N'Cotidiano', N'Tareas', N'TablaEspecificaciones')

    `);



  const targetMap = new Map<string, number>();
  const targetFallbackMap = new Map<string, number[]>();

  for (const row of (targetResult.recordset || [])) {

    const tipoUsoKey = normalizeReplicaKey(row.TipoUso);

    const indicadorBaseKey = normalizeReplicaKey(row.IndicadorBase);

    const key = [

      tipoUsoKey,

      normalizeReplicaKey(row.PlaneamientoNombre),

      indicadorBaseKey

    ].join("|");

    if (!targetMap.has(key)) targetMap.set(key, Number(row.IndicadorGrupoId || 0));

    const fallbackKey = [tipoUsoKey, indicadorBaseKey].join("|");
    const fallbackList = targetFallbackMap.get(fallbackKey) || [];
    fallbackList.push(Number(row.IndicadorGrupoId || 0));
    targetFallbackMap.set(fallbackKey, fallbackList);

  }



  const result = new Map<number, number>();

  for (const row of (sourceResult.recordset || [])) {

    const tipoUsoKey = normalizeReplicaKey(row.TipoUso);

    const indicadorBaseKey = normalizeReplicaKey(row.IndicadorBase);

    const key = [

      tipoUsoKey,

      normalizeReplicaKey(row.PlaneamientoNombre),

      indicadorBaseKey

    ].join("|");

    let targetIndicadorId = targetMap.get(key);

    if (!targetIndicadorId) {
      const fallbackKey = [tipoUsoKey, indicadorBaseKey].join("|");
      const fallbackMatches = (targetFallbackMap.get(fallbackKey) || []).filter((id) => id > 0);
      if (fallbackMatches.length === 1) {
        targetIndicadorId = Number(fallbackMatches[0] || 0);
      }
    }

    if (targetIndicadorId) result.set(Number(row.IndicadorGrupoId || 0), Number(targetIndicadorId));

  }



  return result;

}



async function validateIndicadoresRemovidosConCalificacion(executor: any, actividadId: number, indicadorIds: number[]) {

  const placeholders = indicadorIds.map((_, index) => `@keepIndicadorId${index}`).join(", ");

  const request = new sql.Request(executor).input("actividadId", sql.Int, actividadId);

  indicadorIds.forEach((id, index) => request.input(`keepIndicadorId${index}`, sql.Int, id));

  const result = await request.query(`

    SELECT DISTINCT si.IndicadorGrupoId

    FROM dbo.Eval360_SeguimientoIndicador si

    WHERE si.ActividadId = @actividadId

      ${indicadorIds.length ? `AND si.IndicadorGrupoId NOT IN (${placeholders})` : ""}

  `);

  return (result.recordset || []).length > 0;

}



async function upsertActividadIndicadores(executor: any, actividadId: number, indicadorIds: number[], asignacionesMap: Map<number, { numeroLecciones: number; puntos: number; detalleItemsJson: string }>) {

  await new sql.Request(executor)

    .input("actividadId", sql.Int, actividadId)

    .query(`

      UPDATE dbo.Eval360_ActividadIndicador

      SET Activo = 0

      WHERE ActividadId = @actividadId

    `);



  for (const indicadorId of indicadorIds) {

    const existing = await new sql.Request(executor)

      .input("actividadId", sql.Int, actividadId)

      .input("indicadorGrupoId", sql.Int, indicadorId)

      .query(`

        SELECT TOP 1 ActividadId

        FROM dbo.Eval360_ActividadIndicador

        WHERE ActividadId = @actividadId

          AND IndicadorGrupoId = @indicadorGrupoId

      `);



    if (existing.recordset[0]) {

      const reqUpdate = new sql.Request(executor)

        .input("actividadId", sql.Int, actividadId)

        .input("indicadorGrupoId", sql.Int, indicadorId);

      const asignacion = asignacionesMap.get(Number(indicadorId)) || { numeroLecciones: 0, puntos: 0, detalleItemsJson: "{}" };

      reqUpdate.input("numeroLecciones", sql.Decimal(10, 2), Number(asignacion.numeroLecciones || 0));

      reqUpdate.input("puntos", sql.Decimal(10, 2), Number(asignacion.puntos || 0));

      reqUpdate.input("detalleItemsJson", sql.NVarChar(sql.MAX), String(asignacion.detalleItemsJson || "{}"));

      await reqUpdate.query(`

        IF COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NOT NULL

           AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NOT NULL

           AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NOT NULL

        BEGIN

          UPDATE dbo.Eval360_ActividadIndicador

          SET Activo = 1,

              NumeroLecciones = @numeroLecciones,

              Puntos = @puntos,

              DetalleItemsJson = @detalleItemsJson

          WHERE ActividadId = @actividadId

            AND IndicadorGrupoId = @indicadorGrupoId

        END

        ELSE

        BEGIN

          UPDATE dbo.Eval360_ActividadIndicador

          SET Activo = 1

          WHERE ActividadId = @actividadId

            AND IndicadorGrupoId = @indicadorGrupoId

        END

      `);

    } else {

      const reqInsert = new sql.Request(executor)

        .input("actividadId", sql.Int, actividadId)

        .input("indicadorGrupoId", sql.Int, indicadorId);

      const asignacion = asignacionesMap.get(Number(indicadorId)) || { numeroLecciones: 0, puntos: 0, detalleItemsJson: "{}" };

      reqInsert.input("numeroLecciones", sql.Decimal(10, 2), Number(asignacion.numeroLecciones || 0));

      reqInsert.input("puntos", sql.Decimal(10, 2), Number(asignacion.puntos || 0));

      reqInsert.input("detalleItemsJson", sql.NVarChar(sql.MAX), String(asignacion.detalleItemsJson || "{}"));

      await reqInsert.query(`

        IF COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NOT NULL

           AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NOT NULL

           AND COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NOT NULL

        BEGIN

          INSERT INTO dbo.Eval360_ActividadIndicador

            (ActividadId, IndicadorGrupoId, Activo, NumeroLecciones, Puntos, DetalleItemsJson)

          VALUES

            (@actividadId, @indicadorGrupoId, 1, @numeroLecciones, @puntos, @detalleItemsJson)

        END

        ELSE

        BEGIN

          INSERT INTO dbo.Eval360_ActividadIndicador

            (ActividadId, IndicadorGrupoId, Activo)

          VALUES

            (@actividadId, @indicadorGrupoId, 1)

        END

      `);

    }

  }

}



async function syncTablaEspecificacionesDesdeGrupoHermanoSiFalta(executor: any, req: any, estructuraGrupoId: number) {

  if (!estructuraGrupoId) return 0;



  const existingResult = await new sql.Request(executor)

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT TOP 1 ai.ActividadId

      FROM dbo.Eval360_ActividadIndicador ai

      INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId

      INNER JOIN dbo.Eval360_IndicadorGrupo i ON i.IndicadorGrupoId = ai.IndicadorGrupoId

      WHERE a.EstructuraGrupoId = @estructuraGrupoId

        AND ISNULL(a.Activo, 1) = 1

        AND ISNULL(ai.Activo, 1) = 1

        AND ISNULL(i.Activo, 1) = 1

        AND i.TipoUso = N'TablaEspecificaciones'

        AND (

          ISNULL(ai.NumeroLecciones, 0) > 0

          OR ISNULL(ai.Puntos, 0) > 0

          OR LEN(ISNULL(ai.DetalleItemsJson, N'')) > 2

        )

    `);

  if (existingResult.recordset[0]) return 0;



  const siblingStructures = await getEstructurasReplicaTablaMismoGrado(executor, req, estructuraGrupoId);

  const siblingStructuresConPeso: Array<any> = [];

  for (const sibling of siblingStructures) {

    const siblingEstructuraId = Number(sibling.EstructuraGrupoId || 0);

    if (!siblingEstructuraId) continue;



    const siblingParametrizadaResult = await new sql.Request(executor)

      .input("estructuraGrupoId", sql.Int, siblingEstructuraId)

      .query(`

        SELECT

          SUM(CASE

            WHEN ISNULL(ai.Activo, 1) = 1

             AND ISNULL(i.Activo, 1) = 1

             AND i.TipoUso = N'TablaEspecificaciones'

             AND (

               ISNULL(ai.NumeroLecciones, 0) > 0

               OR ISNULL(ai.Puntos, 0) > 0

               OR LEN(ISNULL(ai.DetalleItemsJson, N'')) > 2

             )

            THEN 1 ELSE 0 END) AS Parametrizados

        FROM dbo.Eval360_Actividad a

        LEFT JOIN dbo.Eval360_ActividadIndicador ai ON ai.ActividadId = a.ActividadId

        LEFT JOIN dbo.Eval360_IndicadorGrupo i ON i.IndicadorGrupoId = ai.IndicadorGrupoId

        WHERE a.EstructuraGrupoId = @estructuraGrupoId

          AND ISNULL(a.Activo, 1) = 1

      `);

    siblingStructuresConPeso.push({

      ...sibling,

      Parametrizados: Number(siblingParametrizadaResult.recordset?.[0]?.Parametrizados || 0)

    });

  }



  siblingStructuresConPeso.sort((a, b) => Number(b.Parametrizados || 0) - Number(a.Parametrizados || 0));

  for (const sibling of siblingStructuresConPeso) {

    const siblingEstructuraId = Number(sibling.EstructuraGrupoId || 0);

    if (!siblingEstructuraId || Number(sibling.Parametrizados || 0) <= 0) continue;



    const sourceActivitiesResult = await new sql.Request(executor)

      .input("estructuraGrupoId", sql.Int, siblingEstructuraId)

      .query(`

        SELECT

          a.ActividadId,

          a.EstructuraGrupoDetalleId,

          a.Nombre,

          a.Fecha,

          SUM(CASE

            WHEN ISNULL(ai.NumeroLecciones, 0) > 0

              OR ISNULL(ai.Puntos, 0) > 0

              OR LEN(ISNULL(ai.DetalleItemsJson, N'')) > 2

            THEN 1 ELSE 0 END) AS Parametrizados

        FROM dbo.Eval360_Actividad a

        INNER JOIN dbo.Eval360_ActividadIndicador ai ON ai.ActividadId = a.ActividadId

        INNER JOIN dbo.Eval360_IndicadorGrupo i ON i.IndicadorGrupoId = ai.IndicadorGrupoId

        WHERE a.EstructuraGrupoId = @estructuraGrupoId

          AND ISNULL(a.Activo, 1) = 1

          AND ISNULL(ai.Activo, 1) = 1

          AND ISNULL(i.Activo, 1) = 1

          AND i.TipoUso = N'TablaEspecificaciones'

        GROUP BY a.ActividadId, a.EstructuraGrupoDetalleId, a.Nombre, a.Fecha

        HAVING SUM(CASE

          WHEN ISNULL(ai.NumeroLecciones, 0) > 0

            OR ISNULL(ai.Puntos, 0) > 0

            OR LEN(ISNULL(ai.DetalleItemsJson, N'')) > 2

          THEN 1 ELSE 0 END) > 0

        ORDER BY a.EstructuraGrupoDetalleId, a.Fecha, a.ActividadId

      `);



    const sourceActivities = sourceActivitiesResult.recordset || [];

    if (!sourceActivities.length) continue;



    let replicatedCount = 0;

    for (const sourceActivity of sourceActivities) {

      const actividadReplica = await getActividadReplicaDestino(executor, {

        sourceEstructuraGrupoId: siblingEstructuraId,

        sourceEstructuraGrupoDetalleId: Number(sourceActivity.EstructuraGrupoDetalleId || 0),

        sourceActividadId: Number(sourceActivity.ActividadId || 0),

        targetEstructuraGrupoId: estructuraGrupoId

      });

      if (!actividadReplica?.targetActividadId) continue;



      const sourceAsignacionesResult = await new sql.Request(executor)

        .input("actividadId", sql.Int, Number(sourceActivity.ActividadId || 0))

        .query(`

          SELECT

            ai.IndicadorGrupoId,

            CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NULL THEN 0 ELSE ISNULL(ai.NumeroLecciones, 0) END AS NumeroLecciones,

            CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NULL THEN 0 ELSE ISNULL(ai.Puntos, 0) END AS Puntos,

            CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NULL THEN N'{}' ELSE ISNULL(ai.DetalleItemsJson, N'{}') END AS DetalleItemsJson

          FROM dbo.Eval360_ActividadIndicador ai

          INNER JOIN dbo.Eval360_IndicadorGrupo i ON i.IndicadorGrupoId = ai.IndicadorGrupoId

          WHERE ai.ActividadId = @actividadId

            AND ISNULL(ai.Activo, 1) = 1

            AND ISNULL(i.Activo, 1) = 1

            AND i.TipoUso = N'TablaEspecificaciones'

        `);



      const sourceIndicadorIds = (sourceAsignacionesResult.recordset || []).map((row: any) => Number(row.IndicadorGrupoId || 0)).filter((id: number) => id > 0);

      if (!sourceIndicadorIds.length) continue;



      const mappedIndicadores = await mapIndicadoresReplicaTabla(executor, {

        sourceEstructuraGrupoId: siblingEstructuraId,

        targetEstructuraGrupoId: estructuraGrupoId,

        indicadorIds: sourceIndicadorIds

      });

      if (mappedIndicadores.size !== sourceIndicadorIds.length) continue;



      const targetAsignacionesMap = new Map<number, { numeroLecciones: number; puntos: number; detalleItemsJson: string }>();

      const targetIndicadorIds: number[] = [];

      for (const row of (sourceAsignacionesResult.recordset || [])) {

        const sourceIndicadorId = Number(row.IndicadorGrupoId || 0);

        const targetIndicadorId = Number(mappedIndicadores.get(sourceIndicadorId) || 0);

        if (!targetIndicadorId) continue;

        targetIndicadorIds.push(targetIndicadorId);

        targetAsignacionesMap.set(targetIndicadorId, {

          numeroLecciones: Number(row.NumeroLecciones || 0),

          puntos: Number(row.Puntos || 0),

          detalleItemsJson: String(row.DetalleItemsJson || "{}")

        });

      }

      if (!targetIndicadorIds.length) continue;



      await upsertActividadIndicadores(executor, Number(actividadReplica.targetActividadId || 0), targetIndicadorIds, targetAsignacionesMap);

      await new sql.Request(executor)

        .input("actividadId", sql.Int, Number(actividadReplica.targetActividadId || 0))

        .input("nombre", sql.NVarChar(200), normalizeText(sourceActivity.Nombre || ""))

        .query(`

          UPDATE dbo.Eval360_Actividad

          SET Nombre = @nombre,

              UpdatedAt = SYSDATETIME()

          WHERE ActividadId = @actividadId

        `);

      replicatedCount += 1;

    }



    if (replicatedCount > 0) return replicatedCount;

  }



  return 0;

}



async function upsertExamenIaReplicaRecord(executor: any, params: {

  targetEstructuraGrupoId: number;

  targetActividadId: number;

  sourceRow: any;

}) {

  const existing = await new sql.Request(executor)

    .input("estructuraGrupoId", sql.Int, params.targetEstructuraGrupoId)

    .input("actividadIdTabla", sql.Int, params.targetActividadId)

    .query(`

      SELECT TOP 1 ExamenIAGeneradoId

      FROM dbo.Eval360_ExamenIAGenerado

      WHERE EstructuraGrupoId = @estructuraGrupoId

        AND ActividadIdTabla = @actividadIdTabla

        AND Activo = 1

      ORDER BY ExamenIAGeneradoId DESC

    `);



  const request = new sql.Request(executor)

    .input("estructuraGrupoId", sql.Int, params.targetEstructuraGrupoId)

    .input("actividadIdTabla", sql.Int, params.targetActividadId)

    .input("usuarioId", sql.Int, Number(params.sourceRow.UsuarioId || 0) || null)

    .input("plantillaPromptIAId", sql.Int, Number(params.sourceRow.PlantillaPromptIAId || 0) || null)

    .input("nombre", sql.NVarChar(250), normalizeText(params.sourceRow.Nombre) || null)

    .input("materia", sql.NVarChar(150), normalizeText(params.sourceRow.Materia) || null)

    .input("grado", sql.NVarChar(120), normalizeText(params.sourceRow.Grado) || null)

    .input("periodo", sql.NVarChar(120), normalizeText(params.sourceRow.Periodo) || null)

    .input("tipoColegio", sql.NVarChar(120), normalizeText(params.sourceRow.TipoColegio) || null)

    .input("fuenteWord", sql.NVarChar(120), normalizeText(params.sourceRow.FuenteWord) || null)

    .input("tamanoWordPt", sql.Int, Number(params.sourceRow.TamanoWordPt || 11) || 11)

    .input("seccionesJson", sql.NVarChar(sql.MAX), String(params.sourceRow.SeccionesJson || "[]"))

    .input("formatoSalidaNombre", sql.NVarChar(255), normalizeText(params.sourceRow.FormatoSalidaNombre) || null)

    .input("formatoSalidaMimeType", sql.NVarChar(150), normalizeText(params.sourceRow.FormatoSalidaMimeType) || null)

    .input("formatoSalidaDocxBase64", sql.NVarChar(sql.MAX), params.sourceRow.FormatoSalidaDocxBase64 || null)

    .input("indicaciones", sql.NVarChar(sql.MAX), params.sourceRow.Indicaciones || null)

    .input("documentoApoyoNombre", sql.NVarChar(255), normalizeText(params.sourceRow.DocumentoApoyoNombre) || null)

    .input("encabezadoJson", sql.NVarChar(sql.MAX), params.sourceRow.EncabezadoJson || null)

    .input("promptGenerado", sql.NVarChar(sql.MAX), params.sourceRow.PromptGenerado || null)

    .input("resultadoIA", sql.NVarChar(sql.MAX), params.sourceRow.ResultadoIA || null);



  if (existing.recordset[0]) {

    await request

      .input("id", sql.Int, Number(existing.recordset[0].ExamenIAGeneradoId || 0))

      .query(`

        UPDATE dbo.Eval360_ExamenIAGenerado

        SET UsuarioId = @usuarioId,

            PlantillaPromptIAId = @plantillaPromptIAId,

            Nombre = @nombre,

            Materia = @materia,

            Grado = @grado,

            Periodo = @periodo,

            TipoColegio = @tipoColegio,

            FuenteWord = @fuenteWord,

            TamanoWordPt = @tamanoWordPt,

            SeccionesJson = @seccionesJson,

            FormatoSalidaNombre = @formatoSalidaNombre,

            FormatoSalidaMimeType = @formatoSalidaMimeType,

            FormatoSalidaDocxBase64 = @formatoSalidaDocxBase64,

            Indicaciones = @indicaciones,

            DocumentoApoyoNombre = @documentoApoyoNombre,

            EncabezadoJson = @encabezadoJson,

            PromptGenerado = @promptGenerado,

            ResultadoIA = @resultadoIA,

            UpdatedAt = SYSDATETIME()

        WHERE ExamenIAGeneradoId = @id

      `);

    return Number(existing.recordset[0].ExamenIAGeneradoId || 0);

  }



  const inserted = await request.query(`

    INSERT INTO dbo.Eval360_ExamenIAGenerado

      (EstructuraGrupoId, ActividadIdTabla, UsuarioId, PlantillaPromptIAId, Nombre, Materia, Grado, Periodo, TipoColegio, FuenteWord, TamanoWordPt, SeccionesJson, FormatoSalidaNombre, FormatoSalidaMimeType, FormatoSalidaDocxBase64, Indicaciones, DocumentoApoyoNombre, EncabezadoJson, PromptGenerado, ResultadoIA, Activo, CreatedAt)

    OUTPUT INSERTED.ExamenIAGeneradoId

    VALUES

      (@estructuraGrupoId, @actividadIdTabla, @usuarioId, @plantillaPromptIAId, @nombre, @materia, @grado, @periodo, @tipoColegio, @fuenteWord, @tamanoWordPt, @seccionesJson, @formatoSalidaNombre, @formatoSalidaMimeType, @formatoSalidaDocxBase64, @indicaciones, @documentoApoyoNombre, @encabezadoJson, @promptGenerado, @resultadoIA, 1, SYSDATETIME())

  `);

  return Number(inserted.recordset?.[0]?.ExamenIAGeneradoId || 0);

}



async function syncExamenIaReplicasDesdeActividad(executor: any, req: any, params: {

  sourceEstructuraGrupoId: number;

  sourceActividadId: number;

  sourceExamenRow: any;

}) {

  const actividadMetaResult = await new sql.Request(executor)

    .input("actividadId", sql.Int, params.sourceActividadId)

    .query(`

      SELECT TOP 1 ActividadId, EstructuraGrupoDetalleId

      FROM dbo.Eval360_Actividad

      WHERE ActividadId = @actividadId

        AND ISNULL(Activo, 1) = 1

    `);

  const actividadMeta = actividadMetaResult.recordset[0];

  if (!actividadMeta) return 0;



  const replicaTargets = await getEstructurasReplicaTablaMismoGrado(executor, req, params.sourceEstructuraGrupoId);

  let replicas = 0;

  for (const target of replicaTargets) {

    const actividadReplica = await getActividadReplicaDestino(executor, {

      sourceEstructuraGrupoId: params.sourceEstructuraGrupoId,

      sourceEstructuraGrupoDetalleId: Number(actividadMeta.EstructuraGrupoDetalleId || 0),

      sourceActividadId: params.sourceActividadId,

      targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0)

    });

    if (!actividadReplica?.targetActividadId) continue;

    await upsertExamenIaReplicaRecord(executor, {

      targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0),

      targetActividadId: Number(actividadReplica.targetActividadId || 0),

      sourceRow: params.sourceExamenRow

    });

    replicas += 1;

  }

  return replicas;

}



async function syncExamenIaDesdeGrupoHermanoSiFalta(executor: any, req: any, estructuraGrupoId: number) {

  const currentExamResult = await new sql.Request(executor)

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT COUNT(1) AS Total

      FROM dbo.Eval360_ExamenIAGenerado

      WHERE EstructuraGrupoId = @estructuraGrupoId

        AND Activo = 1

    `);

  const totalActual = Number(currentExamResult.recordset?.[0]?.Total || 0);

  if (totalActual > 0) return 0;



  const siblingStructures = await getEstructurasReplicaTablaMismoGrado(executor, req, estructuraGrupoId);

  let synced = 0;

  for (const sibling of siblingStructures) {

    const siblingExamsResult = await new sql.Request(executor)

      .input("estructuraGrupoId", sql.Int, Number(sibling.EstructuraGrupoId || 0))

      .query(`

        SELECT ex.*, a.EstructuraGrupoDetalleId

        FROM dbo.Eval360_ExamenIAGenerado ex

        INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ex.ActividadIdTabla

        WHERE ex.EstructuraGrupoId = @estructuraGrupoId

          AND ex.Activo = 1

          AND ISNULL(a.Activo, 1) = 1

        ORDER BY ex.ExamenIAGeneradoId DESC

      `);

    for (const row of (siblingExamsResult.recordset || [])) {

      const actividadReplica = await getActividadReplicaDestino(executor, {

        sourceEstructuraGrupoId: Number(sibling.EstructuraGrupoId || 0),

        sourceEstructuraGrupoDetalleId: Number(row.EstructuraGrupoDetalleId || 0),

        sourceActividadId: Number(row.ActividadIdTabla || 0),

        targetEstructuraGrupoId: estructuraGrupoId

      });

      if (!actividadReplica?.targetActividadId) continue;

      const existing = await new sql.Request(executor)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("actividadIdTabla", sql.Int, Number(actividadReplica.targetActividadId || 0))

        .query(`

          SELECT TOP 1 ExamenIAGeneradoId

          FROM dbo.Eval360_ExamenIAGenerado

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND ActividadIdTabla = @actividadIdTabla

            AND Activo = 1

          ORDER BY ExamenIAGeneradoId DESC

        `);

      if (existing.recordset[0]) continue;

      await upsertExamenIaReplicaRecord(executor, {

        targetEstructuraGrupoId: estructuraGrupoId,

        targetActividadId: Number(actividadReplica.targetActividadId || 0),

        sourceRow: row

      });

      synced += 1;

    }

  }

  return synced;

}



function xmlWordToText(xml: string) {

  return xml

    .replace(/<w:p[^>]*>/g, "\n")

    .replace(/<w:br[^>]*\/>/g, "\n")

    .replace(/<w:tab[^>]*\/>/g, "\t")

    .replace(/<[^>]+>/g, " ")

    .replace(/&amp;/g, "&")

    .replace(/&lt;/g, "<")

    .replace(/&gt;/g, ">")

    .replace(/&quot;/g, "\"")

    .replace(/&#39;/g, "'")

    .replace(/\r/g, "")

    .replace(/[ \t]+\n/g, "\n")

    .replace(/\n{3,}/g, "\n\n")

    .replace(/[ \t]{2,}/g, " ")

    .trim();

}



async function extractDocxText(buffer: Buffer) {

  const zip = await JSZip.loadAsync(buffer);

  const docXml = await zip.file("word/document.xml")?.async("string");

  if (!docXml) return "";

  return xmlWordToText(docXml);

}



async function hasRealExamContentInDocx(buffer: Buffer) {

  try {

    const zip = await JSZip.loadAsync(buffer);

    const xml = await zip.file("word/document.xml")?.async("string");

    if (!xml) return false;

    const plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));

    const hasQuestions = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);

    const unresolvedMarkers = (xml.match(/\{\{/g) || []).length;

    return hasQuestions && unresolvedMarkers < 8;

  } catch {

    return false;

  }

}



async function extractUploadedText(file?: Express.Multer.File | null) {

  if (!file || !file.buffer) return "";

  const name = String(file.originalname || "").toLowerCase();

  const mime = String(file.mimetype || "").toLowerCase();



  if (name.endsWith(".txt") || mime.includes("text/plain")) {

    return file.buffer.toString("utf8").trim();

  }



  if (

    name.endsWith(".docx") ||

    mime.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")

  ) {

    return (await extractDocxText(file.buffer)).trim();

  }



  if (name.endsWith(".pdf") || mime.includes("pdf")) {

    const raw = file.buffer.toString("utf8");

    return raw

      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, " ")

      .replace(/[ \t]{2,}/g, " ")

      .replace(/\n{3,}/g, "\n\n")

      .trim();

  }



  return "";

}



function xmlEscape(text: string) {

  return String(text || "")

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&apos;");

}



function stripResidualMarkersSafely(xml: string) {

  return String(xml || "").replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (_full, attrs, inner) => {

    const cleaned = String(inner || "").replace(/\{\{[^{}]{0,120}\}\}/g, "");

    return `<w:t${attrs}>${cleaned}</w:t>`;

  });

}



function buildWordParagraphsXml(text: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const lines = String(text || "").split(/\r?\n/);

  return lines.map((line) => `<w:p>${buildWordRunsXml(line || " ", style)}</w:p>`).join("");

}



function buildWordRunsXml(text: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const font = String(style?.font || "Calibri").trim() || "Calibri";

  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;

  const halfPts = Math.round(sizePt * 2);

  const bold = style?.bold ? "<w:b/><w:bCs/>" : "";

  const runProps = `<w:rPr>${bold}<w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr>`;

  const parts = String(text || "").replace(/\r/g, "").split("\n");

  const buildTextRun = (value: string) => `<w:r>${runProps}<w:t xml:space="preserve">${xmlEscape(value || " ")}</w:t></w:r>`;

  const buildLineRuns = (value: string) => {

    const tabParts = String(value || " ").split("\t");

    return tabParts.map((segment, idx) => {

      const textRun = buildTextRun(segment || " ");

      return idx === 0 ? textRun : `<w:r>${runProps}<w:tab/></w:r>${textRun}`;

    }).join("");

  };

  return parts.map((part, index) => {

    const lineRuns = buildLineRuns(part || " ");

    return index === 0 ? lineRuns : `<w:r>${runProps}<w:br/></w:r>${lineRuns}`;

  }).join("");

}



function normalizeMathForWord(input: string) {

  const supers: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };

  let text = String(input || "");

  text = text

    .replace(/\\cdot/g, "·")

    .replace(/\\times/g, "×")

    .replace(/\\div/g, "÷")

    .replace(/\\pm/g, "±")

    .replace(/\\leq/g, "=")

    .replace(/\\geq/g, "=")

    .replace(/\\neq/g, "?")

    .replace(/\\sqrt\{([^}]+)\}/g, "v($1)")

    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")

    .replace(/\$(.*?)\$/g, "$1");



  text = text.replace(/\^([0-9+\-]+)/g, (_m, g1) => String(g1).split("").map((c) => supers[c] || c).join(""));

  return text;

}



async function renderDocxFromTemplate(

  templateBase64: string,

  examText: string,

  markers?: Record<string, string>,

  sectionBlocks?: Record<string, string>,

  style?: { font?: string; sizePt?: number }

) {

  const zip = await JSZip.loadAsync(Buffer.from(String(templateBase64 || ""), "base64"));

  const normalized = normalizeMathForWord(examText);

  const targetFiles = Object.keys(zip.files).filter((name) =>

    /^word\/(document|header\d+|footer\d+)\.xml$/i.test(name)

  );

  let replacedAnyMarker = false;

  let contentTokenFound = false;

  let hasAnyMarkerToken = false;

  let insertedExamContent = false;



  for (const name of targetFiles) {

    const entry = zip.file(name);

    if (!entry) continue;

    let xml = await entry.async("string");



    if (markers && Object.keys(markers).length) {

      const p1 = replaceMarkersInParagraphXml(xml, markers, style);

      xml = p1.xml;

      if (p1.replacedAny) replacedAnyMarker = true;



      const p3 = replaceTemplateMarkers(xml, markers);

      if (p3 !== xml) replacedAnyMarker = true;

      xml = p3;

      const p4 = replaceKnownPlainMarkers(xml, markers);

      if (p4 !== xml) replacedAnyMarker = true;

      xml = p4;

    }



    if (sectionBlocks && Object.keys(sectionBlocks).length) {

      const headingAliases = {

        SR: ["SELECCION DE RESPUESTA"],

        RC: ["RESPUESTA CORTA"],

        C: ["CORRESPONDENCIA"],

        I: ["IDENTIFICACION"],

        RE: ["RESOLUCION DE EJERCICIOS"],

        RP: ["RESOLUCION DE CASOS Y PROBLEMAS", "RESOLUCION DE PROBLEMAS"],

        RR: ["RESPUESTA RESTRINGIDA"],

        RCAS: ["RESOLUCION DE CASOS", "RESOLUCION DE CASOS PROBLEMA"],

        PE: ["PRODUCCION ESCRITA"]

      };

      const beforeBlocks = xml;

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_SR", sectionBlocks.SR || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RC", sectionBlocks.RC || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_C", sectionBlocks.C || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_I", sectionBlocks.I || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RE", sectionBlocks.RE || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RP", sectionBlocks.RP || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RR", sectionBlocks.RR || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_RCAS", sectionBlocks.RCAS || "", style);

      xml = replaceBlockMarkerParagraph(xml, "PREGUNTAS_PE", sectionBlocks.PE || "", style);

      if (xml !== beforeBlocks) insertedExamContent = true;



      const beforeHeadings = xml;

      xml = injectAfterHeading(xml, headingAliases.SR, sectionBlocks.SR || "", style);

      xml = injectAfterHeading(xml, headingAliases.RC, sectionBlocks.RC || "", style);

      xml = injectAfterHeading(xml, headingAliases.C, sectionBlocks.C || "", style);

      xml = injectAfterHeading(xml, headingAliases.I, sectionBlocks.I || "", style);

      xml = injectAfterHeading(xml, headingAliases.RE, sectionBlocks.RE || "", style);

      xml = injectAfterHeading(xml, headingAliases.RP, sectionBlocks.RP || "", style);

      xml = injectAfterHeading(xml, headingAliases.RR, sectionBlocks.RR || "", style);

      xml = injectAfterHeading(xml, headingAliases.RCAS, sectionBlocks.RCAS || "", style);

      xml = injectAfterHeading(xml, headingAliases.PE, sectionBlocks.PE || "", style);

      if (xml !== beforeHeadings) insertedExamContent = true;



      xml = pruneEmptySectionHeading(xml, headingAliases.SR, !(sectionBlocks.SR || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.RC, !(sectionBlocks.RC || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.C, !(sectionBlocks.C || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.I, !(sectionBlocks.I || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.RE, !(sectionBlocks.RE || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.RP, !(sectionBlocks.RP || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.RR, !(sectionBlocks.RR || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.RCAS, !(sectionBlocks.RCAS || "").trim());

      xml = pruneEmptySectionHeading(xml, headingAliases.PE, !(sectionBlocks.PE || "").trim());

      xml = forceBoldHeadingParagraphs(xml, headingAliases.SR);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.RC);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.C);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.I);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.RE);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.RP);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.RR);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.RCAS);

      xml = forceBoldHeadingParagraphs(xml, headingAliases.PE);

    }



    // Marcador de conteo exacto de páginas del documento (Word lo recalcula al abrir/imprimir)

    xml = injectNumPagesFieldMarker(xml, "TOTAL_PAGINAS_DOCUMENTO", style);

    xml = replaceHardcodedPageCountInstruction(xml, style);



    if (/\{\{[\s\S]*?\}\}/.test(xml)) {

      hasAnyMarkerToken = true;

    }



    const hasToken = /\{\{\s*(contenido_examen|resultado_examen)\s*\}\}/i.test(xml);

    if (hasToken) {

      contentTokenFound = true;

      insertedExamContent = true;

      xml = xml.replace(/\{\{\s*(contenido_examen|resultado_examen)\s*\}\}/gi, xmlEscape(normalized));

    }



    // Barrido final por archivo: garantiza reemplazo aunque Word haya fragmentado el token.

    if (markers && Object.keys(markers).length) {

      xml = sweepRemainingMarkers(xml, markers);

      xml = forceResolveMarkersByParagraph(xml, markers, style);

    }



    zip.file(name, xml);

  }



  // Agregar contenido al final cuando no hubo inserción real del examen.

  if (!insertedExamContent) {

    const docFile = zip.file("word/document.xml");

    if (docFile) {

      let xml = await docFile.async("string");

      const paragraphsXml = buildWordParagraphsXml(normalized, style);

      if (xml.includes("</w:body>")) {

        const replaced = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${paragraphsXml}${sect}`);

        xml = replaced !== xml ? replaced : xml.replace("</w:body>", `${paragraphsXml}</w:body>`);

      } else {

        xml += paragraphsXml;

      }

      zip.file("word/document.xml", xml);

    }

  }



  // Seguro final: si por formato del machote no quedaron preguntas visibles,

  // forzar inserción del contenido del examen al final del documento.

  const docFileFinal = zip.file("word/document.xml");

  if (docFileFinal) {

    let xmlFinal = await docFileFinal.async("string");

    const plainFinal = xmlUnescape(xmlFinal.replace(/<[^>]+>/g, " "));

    const firstNumberedQuestion = String(normalized || "")

      .split(/\r?\n/)

      .map((x) => x.trim())

      .find((x) => /^\d+[\.\)]\s+/.test(x) || /^\d+\s*[:\-]\s*/.test(x)) || "";



    const hasRealQuestions = /\b1[\.\)]\s+/.test(plainFinal) || /\b2[\.\)]\s+/.test(plainFinal);

    const hasExamContent = firstNumberedQuestion

      ? plainFinal.includes(firstNumberedQuestion.slice(0, Math.min(firstNumberedQuestion.length, 25)))

      : hasRealQuestions;



    if (!hasExamContent) {

      const forced = buildWordParagraphsXml(normalized, style);

      if (xmlFinal.includes("</w:body>")) {

        const replaced = xmlFinal.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${forced}${sect}`);

        xmlFinal = replaced !== xmlFinal ? replaced : xmlFinal.replace("</w:body>", `${forced}</w:body>`);

      } else {

        xmlFinal += forced;

      }

      zip.file("word/document.xml", xmlFinal);

    }

  }



  return zip.generateAsync({ type: "nodebuffer" });

}



async function forceAppendExamToTemplate(

  templateBase64: string,

  examText: string,

  style?: { font?: string; sizePt?: number; bold?: boolean }

) {

  const zip = await JSZip.loadAsync(Buffer.from(String(templateBase64 || ""), "base64"));

  const docFile = zip.file("word/document.xml");

  if (!docFile) {

    const docFallback = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: examText || "" })] })] }] });

    return Packer.toBuffer(docFallback);

  }

  let xml = await docFile.async("string");

  const paragraphsXml = buildWordParagraphsXml(normalizeMathForWord(examText || ""), style);

  if (xml.includes("</w:body>")) {

    const replaced = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (sect) => `${paragraphsXml}${sect}`);

    xml = replaced !== xml ? replaced : xml.replace("</w:body>", `${paragraphsXml}</w:body>`);

  } else {

    xml += paragraphsXml;

  }

  zip.file("word/document.xml", xml);

  return zip.generateAsync({ type: "nodebuffer" });

}



async function hardenRenderedDocx(

  renderedBuffer: Buffer,

  markers: Record<string, string>,

  examText: string,

  style?: { font?: string; sizePt?: number; bold?: boolean }

) {

  try {

    const zip = await JSZip.loadAsync(renderedBuffer);

    const doc = zip.file("word/document.xml");

    if (!doc) return { buffer: renderedBuffer, markersLeft: -1, hasQuestions: false };

    let xml = await doc.async("string");



    xml = forceResolveMarkersByParagraph(xml, markers || {}, style);



    // Limpieza final segura: solo borra marcadores residuales dentro de nodos de texto,

    // sin tocar XML estructural que Word puede haber fragmentado entre runs.

    xml = stripResidualMarkersSafely(xml);



    let plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));

    const hasQuestions = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);

    if (!hasQuestions) {

      const forced = buildWordParagraphsXml(normalizeMathForWord(examText || ""), style);

      if (xml.includes("</w:body>")) xml = xml.replace("</w:body>", `${forced}</w:body>`);

      else xml += forced;

      plain = xmlUnescape(xml.replace(/<[^>]+>/g, " "));

    }



    zip.file("word/document.xml", xml);

    const out = await zip.generateAsync({ type: "nodebuffer" });

    const left = (xml.match(/\{\{[^{}]{0,120}\}\}/g) || []).length;

    const okQ = /\b1[\.\)]\s+\S/.test(plain) || /\b2[\.\)]\s+\S/.test(plain);

    return { buffer: out, markersLeft: left, hasQuestions: okQ, error: "" };

  } catch (err: any) {

    const msg = String(err?.message || err || "harden-error").slice(0, 180);

    return { buffer: renderedBuffer, markersLeft: -1, hasQuestions: false, error: msg };

  }

}



async function loadDefaultMachoteBase64() {

  const candidates = [

    String(process.env.EXAMEN_MACHOTE_PATH || "").trim(),

    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informática y Comp\\CURSOS ONLINE\\Material Profe en linea\\Indicaciones prueba escrita - MACHOTE IA.docx",

    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informatica y Comp\\CURSOS ONLINE\\Material Profe en linea\\Indicaciones prueba escrita - MACHOTE IA.docx"

  ].filter(Boolean);



  for (const filePath of candidates) {

    try {

      const buff = await fs.readFile(filePath);

      if (buff && buff.length > 100_000) {

        return { base64: buff.toString("base64"), path: filePath, bytes: buff.length };

      }

    } catch {

      // siguiente candidato

    }

  }



  // Búsqueda adicional por nombre dentro de rutas conocidas (resiliente a tildes/ruta exacta)

  const roots = [

    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informática y Comp\\CURSOS ONLINE\\Material Profe en linea",

    "C:\\Users\\HP\\OneDrive - Colegio de Profesionales en Informatica y Comp\\CURSOS ONLINE\\Material Profe en linea"

  ];

  for (const root of roots) {

    try {

      const files = await fs.readdir(root);

      const found = files.find((name) =>

        /indicaciones\s+prueba\s+escrita\s*-\s*machote\s*ia\.docx/i.test(String(name || ""))

      );

      if (found) {

        const fullPath = `${root}\\${found}`;

        const buff = await fs.readFile(fullPath);

        if (buff && buff.length > 100_000) return { base64: buff.toString("base64"), path: fullPath, bytes: buff.length };

      }

    } catch {

      // ignorar y continuar

    }

  }

  return { base64: "", path: "", bytes: 0 };

}



function replaceTemplateMarkers(text: string, markers: Record<string, string>) {

  let out = String(text || "");

  for (const [k, v] of Object.entries(markers || {})) {

    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), String(v ?? ""));

  }

  // Aliases robustos para año lectivo por variantes de escritura en plantillas

  const anio = String((markers as any)?.["ANO_LECTIVO"] || (markers as any)?.["ANO_LECTIVO"] || "");

  if (anio) {

    out = out.replace(/\{\{\s*A[NN]O_LECTIVO\s*\}\}/gi, anio);

    out = out.replace(/\{\{\s*A[NN]O\s+LECTIVO\s*\}\}/gi, anio);

  }

  return out;

}



function replaceKnownPlainMarkers(xml: string, markers: Record<string, string>) {

  let out = String(xml || "");

  for (const [k, v] of Object.entries(markers || {})) {

    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), xmlEscape(String(v ?? "")));

  }

  return out;

}



function replaceMarkerLooseAcrossXml(xml: string, key: string, value: string) {

  const between = "(?:<[^>]+>|\\s)*";

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const keyPattern = String(key || "")

    .split("")

    .map((ch) => esc(ch))

    .join(between);

  // Soporta:

  // - marcador limpio: {{KEY}}

  // - marcador con espacios: {{   KEY   }}

  // - marcador partido entre runs XML de Word

  const pattern = `\\{${between}\\{${between}${keyPattern}${between}\\}${between}\\}`;

  const re = new RegExp(pattern, "gi");

  return String(xml || "").replace(re, xmlEscape(String(value ?? "")));

}



function sweepRemainingMarkers(xml: string, markers: Record<string, string>) {

  let out = String(xml || "");

  for (const [k, v] of Object.entries(markers || {})) {

    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Caso normal con {{KEY}}

    out = out.replace(new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, "gi"), xmlEscape(String(v ?? "")));

    // Caso con marcador quebrado entre runs/estilos

    out = replaceMarkerLooseAcrossXml(out, k, String(v ?? ""));

    // Caso con una sola llave accidental por edición manual del machote

    out = out.replace(new RegExp(`\\{\\s*${escaped}\\s*\\}`, "gi"), xmlEscape(String(v ?? "")));

  }

  return out;

}



function parseJsonSafe(value: any) {

  try {

    return JSON.parse(String(value || "{}"));

  } catch {

    return {};

  }

}



function tryParseExamItems(resultadoIA: string) {

  const raw = String(resultadoIA || "").trim();

  if (!raw) return [] as any[];

  const findItemsArray = (value: any): any[] => {

    if (!value || typeof value !== "object") return [];

    if (Array.isArray(value)) {

      const looksLikeItems = value.some((item) =>

        item && typeof item === "object" && (

          item.tipoItem !== undefined ||

          item.enunciado !== undefined ||

          item.pregunta !== undefined ||

          item.puntaje !== undefined

        )

      );

      if (looksLikeItems) return value;

      for (const item of value) {

        const found = findItemsArray(item);

        if (found.length) return found;

      }

      return [];

    }

    const directKeys = ["items", "preguntas", "reactivos", "examenItems", "instrumentos"];

    for (const key of directKeys) {

      const found = findItemsArray(value[key]);

      if (found.length) return found;

    }

    for (const key of Object.keys(value)) {

      const found = findItemsArray(value[key]);

      if (found.length) return found;

    }

    return [];

  };

  const tryJson = (txt: string) => {

    try {

      const obj = JSON.parse(txt);

      const items = findItemsArray(obj);

      return Array.isArray(items) ? items : [];

    } catch {

      return [];

    }

  };

  let items = tryJson(raw);

  if (items.length) return items;

  const m = raw.match(/\{[\s\S]*\}/);

  if (m) items = tryJson(m[0]);

  if (items.length) return items;



  // Recuperación robusta cuando el JSON fue editado y quedó con basura alrededor:

  // extrae solo el array de "items" por balanceo de corchetes.

  const idx = raw.search(/"items"\s*:\s*\[/i);

  if (idx >= 0) {

    const start = raw.indexOf("[", idx);

    if (start >= 0) {

      let depth = 0;

      let end = -1;

      for (let i = start; i < raw.length; i += 1) {

        const ch = raw[i];

        if (ch === "[") depth += 1;

        else if (ch === "]") {

          depth -= 1;

          if (depth === 0) { end = i; break; }

        }

      }

      if (end > start) {

        const onlyArray = raw.slice(start, end + 1);

        try {

          const arr = JSON.parse(onlyArray);

          if (Array.isArray(arr)) return arr;

        } catch {

          // ignora y retorna vacío

        }

      }

    }

  }

  return items;

}



function normalizeTipoItem(tipo: string) {

  const t = String(tipo || "").toUpperCase();

  if (t.includes("SR") || t.includes("SELE")) return "SR";

  if (t.includes("RCAS") || t.includes("CASO")) return "RCAS";

  if (t.includes("RC") || t.includes("CORTA")) return "RC";

  if (t === "C" || t.includes("CORRESP")) return "C";

  if (t === "I" || t.includes("IDENT")) return "I";

  if (t.includes("RE") || t.includes("EJERC")) return "RE";

  if (t.includes("RP") || t.includes("PROBL")) return "RP";

  if (t.includes("RR") || t.includes("RESTR")) return "RR";

  if (t.includes("PE") || t.includes("PRODU")) return "PE";

  return "";

}



function buildQuestionsBlockByType(items: any[], tipo: string) {

  const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);

  if (!filtered.length) return "";

  const lines: string[] = [];

  filtered.forEach((it, idx) => lines.push(formatQuestionFromItem(it, idx)));

  return lines.join("\n");

}



function extractPercentFromText(text: string) {

  const match = String(text || "").match(/(\d+(?:[.,]\d+)?)\s*%/);

  if (!match) return null;

  const value = Number(String(match[1] || "").replace(",", "."));

  return Number.isFinite(value) ? value : null;

}



function getCorrespondenceSourceText(item: any) {

  const candidates = [item?.instrumentoCalificacion, item?.criterioCorreccion, item?.respuestaCorrecta]

    .map((value) => String(value || "").trim())

    .filter(Boolean);

  const withColumns = candidates.find((value) => /columna\s*a\s*:/i.test(value) && /columna\s*b\s*:/i.test(value));

  return withColumns || candidates[0] || "";

}



function extractFlatCorrespondenceAEntries(text: string) {

  const matches = Array.from(String(text || "").matchAll(/A\s*(\d+)\s*:\s*([^;]+)(?:;|$)/gi));

  return matches.map((match) => `${Number(match[1] || 0)}. ${String(match[2] || "").trim()}`).filter(Boolean);

}



function parseCorrespondenceMapping(text: string) {

  const result = new Map<number, number>();

  const source = String(text || "");

  for (const match of source.matchAll(/A\s*(\d+)\s*\(\s*([A-Z]|\d+)\s*\)/gi)) {

    const left = Number(match[1] || 0);

    const rawRight = String(match[2] || "").trim().toUpperCase();

    const right = /^\d+$/.test(rawRight) ? Number(rawRight) : rawRight.charCodeAt(0) - 64;

    if (left > 0 && right > 0) result.set(left, right);

  }

  return result;

}



function inferCorrespondenceDescription(entry: string) {

  const normalized = normalizeExamPlainText(entry);

  if (!normalized) return "";

  if (normalized.includes("conmutativa")) return "Cambiar el orden no altera el resultado.";

  if (normalized.includes("asociativa")) return "Cambiar la agrupacion no altera el resultado.";

  if (normalized.includes("distributiva")) return "La multiplicacion se distribuye sobre la suma o la resta.";

  if (normalized.includes("elemento neutro")) return "Existe un numero que no cambia el valor al operar.";

  if (normalized.includes("inverso aditivo")) return "La suma de un numero y su opuesto es igual a cero.";

  if (normalized.includes("inverso multiplicativo")) return "El producto de un numero por su reciproco es igual a uno.";

  return "";

}



function buildSyntheticCorrespondenceColumns(item: any) {

  const columnaA = extractFlatCorrespondenceAEntries(String(item?.criterioCorreccion || ""));

  const mapping = parseCorrespondenceMapping(String(item?.respuestaCorrecta || ""));

  if (!columnaA.length || !mapping.size) return null;

  const rightByIndex = new Map<number, string>();

  columnaA.forEach((entry, idx) => {

    const description = inferCorrespondenceDescription(entry);

    const rightSlot = mapping.get(idx + 1);

    if (description && rightSlot) rightByIndex.set(rightSlot, description);

  });

  if (!rightByIndex.size) return null;

  const maxRight = Math.max(...Array.from(rightByIndex.keys()));

  const columnaB: string[] = [];

  for (let i = 1; i <= maxRight; i += 1) {

    const desc = rightByIndex.get(i);

    if (!desc) return null;

    columnaB.push(`${i}. ${desc}`);

  }

  return { columnaA, columnaB };

}



function extractCorrespondenceLines(item: any) {

  const source = getCorrespondenceSourceText(item);

  if (!source) return [] as string[];

  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  const match = normalized.match(/columna\s*a\s*:\s*([\s\S]*?)\s*columna\s*b\s*:\s*([\s\S]*)$/i);

  if (!match) {

    const synthetic = buildSyntheticCorrespondenceColumns(item);

    if (!synthetic) return [source];

    const lines = ["   Columna A:\tColumna B:"];

    const maxRows = Math.max(synthetic.columnaA.length, synthetic.columnaB.length);

    for (let i = 0; i < maxRows; i += 1) {

      lines.push(`   ${synthetic.columnaA[i] || ""}\t${synthetic.columnaB[i] || ""}`);

    }

    return lines;

  }

  const splitList = (raw: string) => {

    const plain = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

    const byLine = plain.split(/\n+/).map((part) => String(part || "").trim()).filter(Boolean);

    if (byLine.length > 1) return byLine;

    return plain

      .split(/\s*(?=(?:\d+[.)]|[a-z][.)]))/i)

      .map((part) => String(part || "").trim().replace(/\s+/g, " "))

      .filter(Boolean);

  };

  const columnaA = splitList(match[1]);

  const columnaB = splitList(match[2]);

  const lines: string[] = [];

  if (columnaA.length && columnaB.length) {

    lines.push("   Columna A:\tColumna B:");

    const maxRows = Math.max(columnaA.length, columnaB.length);

    for (let i = 0; i < maxRows; i += 1) {

      const left = columnaA[i] || "";

      const right = columnaB[i] || "";

      lines.push(`   ${left}\t${right}`);

    }

    return lines;

  }

  if (columnaA.length) {

    lines.push("   Columna A:");

    columnaA.forEach((entry) => lines.push(`      ${entry}`));

  }

  if (columnaB.length) {

    lines.push("   Columna B:");

    columnaB.forEach((entry) => lines.push(`      ${entry}`));

  }

  return lines.length ? lines : [source];

}



function hasUsableCorrespondenceShape(item: any) {

  if (normalizeTipoItem(item?.tipoItem) !== "C") return true;

  const explicit = getCorrespondenceSourceText(item);

  if (/columna\s*a\s*:/i.test(explicit) && /columna\s*b\s*:/i.test(explicit)) return true;

  return Boolean(buildSyntheticCorrespondenceColumns(item));

}



function formatQuestionFromItem(item: any, index: number) {

  const puntaje = Number(item?.puntaje || 0);

  const enunciado = String(item?.enunciado || "").trim();

  const base = `${index + 1}. ${enunciado}${puntaje > 0 ? ` (${Math.round(puntaje)} pts)` : ""}`;

  const opciones = Array.isArray(item?.opciones) ? item.opciones : [];

  const lines = [base];

  if (opciones.length) {

    opciones.forEach((op: any, i: number) => {

      const letra = String.fromCharCode(65 + i);

      lines.push(`   ${letra}) ${String(op || "").trim()}`);

    });

    return lines.join("\n");

  }

  if (normalizeTipoItem(item?.tipoItem) === "C") {

    const correspondencia = extractCorrespondenceLines(item);

    if (correspondencia.length) {

      lines.push(...correspondencia);

      return lines.join("\n");

    }

  }

  return base;

}



function buildAnswerKeyBlockByType(items: any[], tipo: string) {

  const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);

  if (!filtered.length) return "";

  const lines: string[] = [];

  filtered.forEach((it, idx) => {

    const puntaje = Number(it?.puntaje || 0);

    const respuesta = String(it?.respuestaCorrecta || "").trim();

    const criterio = String(it?.criterioCorreccion || "").trim();

    lines.push(`${idx + 1}. ${respuesta || "(Sin respuesta)"}${puntaje > 0 ? ` (${Math.round(puntaje)} pts)` : ""}`);

    if (criterio) lines.push(`   Criterio: ${criterio}`);

  });

  return lines.join("\n");

}



function buildExamContentFromItems(items: any[]) {

  const order = ["SR", "RC", "C", "I", "RE", "RP", "RR", "RCAS", "PE"];

  const labels: Record<string, string> = {

    SR: "SELECCIÓN DE RESPUESTA",

    RC: "RESPUESTA CORTA",

    C: "CORRESPONDENCIA",

    I: "IDENTIFICACIÓN",

    RE: "RESOLUCIÓN DE EJERCICIOS",

    RP: "RESOLUCIÓN DE PROBLEMAS",

    RR: "RESPUESTA RESTRINGIDA",

    RCAS: "RESOLUCIÓN DE CASOS",

    PE: "PRODUCCIÓN ESCRITA"

  };

  const lines: string[] = [];

  for (const tipo of order) {

    const filtered = (items || []).filter((it) => normalizeTipoItem(it?.tipoItem) === tipo);

    if (!filtered.length) continue;

    lines.push(labels[tipo]);

    filtered.forEach((it, idx) => lines.push(formatQuestionFromItem(it, idx)));

    lines.push("");

  }

  return lines.join("\n").trim();

}



function buildAnswerContentFromItems(items: any[]) {

  const order = ["SR", "RC", "C", "I", "RE", "RP", "RR", "RCAS", "PE"];

  const labels: Record<string, string> = {

    SR: "CLAVE - SELECCIÓN DE RESPUESTA",

    RC: "CLAVE - RESPUESTA CORTA",

    C: "CLAVE - CORRESPONDENCIA",

    I: "CLAVE - IDENTIFICACIÓN",

    RE: "CLAVE - RESOLUCIÓN DE EJERCICIOS",

    RP: "CLAVE - RESOLUCIÓN DE PROBLEMAS",

    RR: "CLAVE - RESPUESTA RESTRINGIDA",

    RCAS: "CLAVE - RESOLUCIÓN DE CASOS",

    PE: "CLAVE - PRODUCCIÓN ESCRITA"

  };

  const lines: string[] = [];

  for (const tipo of order) {

    const block = buildAnswerKeyBlockByType(items, tipo);

    if (!block.trim()) continue;

    lines.push(labels[tipo]);

    lines.push(block);

    lines.push("");

  }

  return lines.join("\n").trim();

}



function getDetalleTipoStats(detalleRows: any[]) {

  const stats = {

    SR: { cantidad: 0, subtotal: 0 },

    RC: { cantidad: 0, subtotal: 0 },

    C: { cantidad: 0, subtotal: 0 },

    I: { cantidad: 0, subtotal: 0 },

    RE: { cantidad: 0, subtotal: 0 },

    RP: { cantidad: 0, subtotal: 0 },

    RR: { cantidad: 0, subtotal: 0 },

    RCAS: { cantidad: 0, subtotal: 0 },

    PE: { cantidad: 0, subtotal: 0 }

  } as Record<string, { cantidad: number; subtotal: number }>;

  for (const r of detalleRows || []) {

    const d = parseJsonSafe(r.DetalleItemsJson);

    const getN = (k: string) => Number(String(d?.[k] ?? "0").replace(",", ".")) || 0;

    const add = (tipo: string, c: number, v: number) => {

      if (!stats[tipo]) return;

      stats[tipo].cantidad += c;

      stats[tipo].subtotal += c * v;

    };

    add("SR", getN("seleccionRespuestaCantidad"), getN("seleccionRespuestaPuntos"));

    add("RC", getN("respuestaCortaCantidad"), getN("respuestaCortaPuntos"));

    add("C", getN("correspondenciaCantidad"), getN("correspondenciaPuntos"));

    add("I", getN("identificacionCantidad"), getN("identificacionPuntos"));

    add("RE", getN("resolucionEjerciciosCantidad"), getN("resolucionEjerciciosPuntos"));

    add("RP", getN("resolucionProblemasCantidad"), getN("resolucionProblemasPuntos"));

    add("RR", getN("respuestaRestringidaCantidad"), getN("respuestaRestringidaPuntos"));

    add("RCAS", getN("resolucionCasosCantidad"), getN("resolucionCasosPuntos"));

    add("PE", getN("produccionEscritaCantidad"), getN("produccionEscritaPuntos"));

  }

  return stats;

}



function getItemTypeLabel(tipo: string) {

  const map: Record<string, string> = {

    SR: "Seleccion de respuesta",

    RC: "Respuesta corta",

    C: "Correspondencia",

    I: "Identificacion",

    RE: "Resolucion de ejercicios",

    RP: "Resolucion de casos y problemas",

    RR: "Respuesta restringida",

    RCAS: "Resolucion de casos y problemas",

    PE: "Produccion escrita"

  };

  return map[String(tipo || "").toUpperCase()] || String(tipo || "");

}



function summarizeDetalleItems(detalleItemsJson: any) {

  const parsed = parseJsonSafe(detalleItemsJson);

  const getN = (value: any) => Number(String(value ?? "0").replace(",", ".")) || 0;

  const fields = [

    { tipo: "SR", cantidad: getN(parsed?.seleccionRespuestaCantidad), puntos: getN(parsed?.seleccionRespuestaPuntos) },

    { tipo: "RC", cantidad: getN(parsed?.respuestaCortaCantidad), puntos: getN(parsed?.respuestaCortaPuntos) },

    { tipo: "C", cantidad: getN(parsed?.correspondenciaCantidad), puntos: getN(parsed?.correspondenciaPuntos) },

    { tipo: "I", cantidad: getN(parsed?.identificacionCantidad), puntos: getN(parsed?.identificacionPuntos) },

    { tipo: "RE", cantidad: getN(parsed?.resolucionEjerciciosCantidad), puntos: getN(parsed?.resolucionEjerciciosPuntos) },

    {
      tipo: "RP",
      cantidad: getN(parsed?.resolucionProblemasCantidad) + getN(parsed?.resolucionCasosCantidad),
      puntos: Math.max(getN(parsed?.resolucionProblemasPuntos), getN(parsed?.resolucionCasosPuntos))
    },

    { tipo: "RR", cantidad: getN(parsed?.respuestaRestringidaCantidad), puntos: getN(parsed?.respuestaRestringidaPuntos) },

    { tipo: "PE", cantidad: getN(parsed?.produccionEscritaCantidad), puntos: getN(parsed?.produccionEscritaPuntos) }

  ];

  return fields

    .map((field) => {

      const cantidad = field.cantidad;

      const puntos = field.puntos;

      if (cantidad <= 0) return "";

      return `${getItemTypeLabel(field.tipo)}: ${Math.round(cantidad)} pregunta(s), ${puntos} punto(s) por pregunta`;

    })

    .filter(Boolean);

}



function summarizePlaneamientoResultado(resultadoIAJson: any) {

  const parsed = parseJsonSafe(resultadoIAJson);

  const habilidades = [

    ...splitTextLines(parsed?.competenciasGenerales),

    ...splitTextLines(parsed?.aprendizajesEsperados),

    ...splitTextLines(parsed?.indicadoresEvaluacion),

    ...splitTextLines(parsed?.estrategiasMediacion)

  ];

  const semanas = Array.isArray(parsed?.semanas) ? parsed.semanas : [];

  for (const semana of semanas) {

    habilidades.push(...splitTextLines(semana?.habilidadBase));

    habilidades.push(...splitTextLines(semana?.proposito));

    habilidades.push(...splitTextLines(semana?.indicadores));

  }

  return Array.from(new Set(habilidades.map((item) => String(item || "").trim()).filter(Boolean)));

}



function compactPromptText(value: any, maxChars = 6000) {

  const raw = String(value || "")

    .replace(/\r/g, "\n")

    .replace(/\t/g, " ")

    .replace(/[ ]{2,}/g, " ")

    .replace(/\n{3,}/g, "\n\n")

    .trim();

  if (!raw) return "";

  if (raw.length <= maxChars) return raw;

  return `${raw.slice(0, Math.max(0, maxChars - 80)).trim()}\n\n[Texto recortado para priorizar la generación del examen.]`;

}



function parseExamPayload(resultadoIA: string) {

  const raw = String(resultadoIA || "").trim();

  let parsed: any = null;

  try {

    parsed = raw ? JSON.parse(raw) : null;

  } catch {

    const match = raw.match(/\{[\s\S]*\}/);

    if (match) {

      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }

    }

  }

  const items = Array.isArray(parsed?.items) ? parsed.items : tryParseExamItems(raw);

  const advertencias = Array.isArray(parsed?.validacion?.advertencias)

    ? parsed.validacion.advertencias.map((x: any) => String(x))

    : [];

  return { parsed, items, raw, advertencias };

}



function normalizeExamPlainText(value: any) {

  return String(value || "")

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/\s+/g, " ")

    .trim();

}



function hasWeakExamPlaceholderText(value: any) {

  const text = normalizeExamPlainText(value);

  if (!text) return false;

  return [

    /opcion [abcd] vinculada con/,

    /lee la situacion \d+ y selecciona la opcion correcta relacionada con/,

    /respuesta esperada alineada con/,

    /procedimiento y resultado correctos segun/,

    /identificacion correcta segun/,

    /indicador a evaluar/,

    /desarrolla la produccion escrita \d+ relacionada con/,

    /analiza el caso \d+ y resolve lo solicitado a partir de/,

    /relaciona correctamente los elementos de la consigna \d+ asociados con/

  ].some((pattern) => pattern.test(text));

}



function isWeakExamPayload(items: any[]) {

  if (!Array.isArray(items) || !items.length) return true;

  let weakSignals = 0;

  for (const item of items) {

    if (hasWeakExamPlaceholderText(item?.enunciado)) weakSignals += 2;

    if (hasWeakExamPlaceholderText(item?.respuestaCorrecta)) weakSignals += 1;

    if (hasWeakExamPlaceholderText(item?.criterioCorreccion)) weakSignals += 1;

    const opciones = Array.isArray(item?.opciones) ? item.opciones : [];

    if (opciones.some((opt: any) => hasWeakExamPlaceholderText(opt))) weakSignals += 2;

    if (!hasUsableCorrespondenceShape(item)) weakSignals += 2;

  }

  return weakSignals >= Math.max(2, Math.ceil(items.length / 3));

}



function summarizeExamItemForLog(item: any) {

  if (!item || typeof item !== "object") return null;

  return {

    numero: Number(item?.numero || 0),

    tipoItem: String(item?.tipoItem || ""),

    aprendizajeEsperado: compactPromptText(String(item?.aprendizajeEsperado || ""), 180),

    indicadorEvaluacion: compactPromptText(String(item?.indicadorEvaluacion || ""), 180),

    enunciado: compactPromptText(String(item?.enunciado || ""), 260),

    opciones: Array.isArray(item?.opciones)

      ? item.opciones.slice(0, 4).map((opt: any) => compactPromptText(String(opt || ""), 120))

      : [],

    respuestaCorrecta: compactPromptText(String(item?.respuestaCorrecta || ""), 120),

    criterioCorreccion: compactPromptText(String(item?.criterioCorreccion || ""), 180),

    puntaje: Number(item?.puntaje || 0)

  };

}



function buildLocalExamPayload(params: {

  ctx: any;

  tiposActivos: Array<{ tipoItem: string; cantidad: number; subtotalPuntos: number; valorPorPregunta: number }>;

  indicadores: any[];

  totalLeccionesEsperado: number;

  totalPuntosEsperado: number;

  seccionesTextoFinal: string;

  tipoColegio: string;

  indicaciones: string;

  nombrePrueba: string;

  docenteNombre?: string;

}) {

  const {

    ctx,

    tiposActivos,

    indicadores,

    totalLeccionesEsperado,

    totalPuntosEsperado,

    seccionesTextoFinal,

    tipoColegio,

    indicaciones,

    nombrePrueba,

    docenteNombre

  } = params;

  const normalizedIndicadores = Array.isArray(indicadores) && indicadores.length ? indicadores : [{}];

  let itemNumber = 1;

  let indicadorCursor = 0;



  const nextIndicador = () => {

    const indicador = normalizedIndicadores[indicadorCursor % normalizedIndicadores.length] || {};

    indicadorCursor += 1;

    return indicador;

  };



  const buildItemText = (tipoItem: string, indicador: any, ordinal: number) => {

    const indicadorBase = normalizeText(indicador?.IndicadorBase) || "Indicador a evaluar";

    const aprendizaje = normalizeText(indicador?.PlaneamientoNombre) || normalizeText(indicador?.IndicadorIntermedio) || indicadorBase;

    switch (tipoItem) {

      case "SR":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Leé la situación ${ordinal} y seleccioná la opción correcta relacionada con ${indicadorBase.toLowerCase()}.`,

          opciones: [

            `Opción A vinculada con ${indicadorBase.toLowerCase()}.`,

            `Opción B vinculada con ${indicadorBase.toLowerCase()}.`,

            `Opción C vinculada con ${indicadorBase.toLowerCase()}.`,

            `Opción D vinculada con ${indicadorBase.toLowerCase()}.`

          ],

          respuestaCorrecta: "A",

          criterioCorreccion: `La respuesta correcta debe demostrar dominio del indicador: ${indicadorBase}.`

        };

      case "RC":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Respondé de forma breve la consigna ${ordinal} sobre ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Respuesta esperada alineada con ${indicadorBase}.`,

          criterioCorreccion: `Se valora precisión, procedimiento y coherencia con ${indicadorBase}.`

        };

      case "C":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Relacioná correctamente los elementos de la consigna ${ordinal} asociados con ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Correspondencia correcta según ${indicadorBase}.`,

          criterioCorreccion: `Debe establecer las relaciones correctas sin ambigüedad.`

        };

      case "I":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Identificá en la situación ${ordinal} el procedimiento o resultado correcto asociado con ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Identificación correcta según ${indicadorBase}.`,

          criterioCorreccion: `Debe reconocer con claridad el elemento matemático solicitado.`

        };

      case "RE":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Resuelve el ejercicio ${ordinal} aplicando ${indicadorBase.toLowerCase()}. Mostrá el procedimiento.`,

          opciones: [],

          respuestaCorrecta: `Procedimiento y resultado correctos según ${indicadorBase}.`,

          criterioCorreccion: `Se valora desarrollo ordenado, operaciones correctas y resultado final.`

        };

      case "RP":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Resuelve el problema ${ordinal} relacionado con ${indicadorBase.toLowerCase()}. Justificá tu respuesta.`,

          opciones: [],

          respuestaCorrecta: `Resolución correcta y justificada según ${indicadorBase}.`,

          criterioCorreccion: `Se valora interpretación, estrategia, desarrollo y justificación.`

        };

      case "RR":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Elaborá una respuesta restringida para la situación ${ordinal} usando ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Respuesta concreta y correcta según ${indicadorBase}.`,

          criterioCorreccion: `Debe responder exactamente lo solicitado, con precisión matemática.`

        };

      case "RCAS":

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Analizá el caso ${ordinal} y resolvé lo solicitado a partir de ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Análisis y resolución correctos según ${indicadorBase}.`,

          criterioCorreccion: `Se valora comprensión del caso, pertinencia del procedimiento y resultado.`

        };

      default:

        return {

          aprendizajeEsperado: aprendizaje,

          indicadorEvaluacion: indicadorBase,

          enunciado: `Desarrollá la producción escrita ${ordinal} relacionada con ${indicadorBase.toLowerCase()}.`,

          opciones: [],

          respuestaCorrecta: `Producción esperada alineada con ${indicadorBase}.`,

          criterioCorreccion: `Se valora argumentación, claridad y uso correcto del contenido matemático.`

        };

    }

  };



  const items = tiposActivos.flatMap((tipo) => {

    const cantidad = Math.max(0, Number(tipo.cantidad || 0));

    const puntaje = Number(tipo.valorPorPregunta || 0);

    return Array.from({ length: cantidad }).map((_, index) => {

      const indicador = nextIndicador();

      const base = buildItemText(tipo.tipoItem, indicador, index + 1);

      const item = {

        numero: itemNumber,

        tipoItem: tipo.tipoItem,

        aprendizajeEsperado: base.aprendizajeEsperado,

        indicadorEvaluacion: base.indicadorEvaluacion,

        enunciado: base.enunciado,

        opciones: base.opciones,

        respuestaCorrecta: base.respuestaCorrecta,

        criterioCorreccion: base.criterioCorreccion,

        puntaje

      };

      itemNumber += 1;

      return item;

    });

  });



  const totalPuntosCalculado = items.reduce((acc, item) => acc + Number(item.puntaje || 0), 0);

  return {

    encabezado: {

      direccionRegional: normalizeText(ctx?.DireccionRegional),

      centroEducativo: normalizeText(ctx?.CentroEducativo),

      docente: normalizeText(docenteNombre),

      asignatura: normalizeText(ctx?.Materia) || "Matematica",

      nivelGrado: normalizeText(ctx?.Grado),

      seccion: seccionesTextoFinal,

      periodo: normalizeText(ctx?.Periodo),

      cursoLectivo: normalizeText(ctx?.AnioLectivo),

      fechaAplicacion: ""

    },

    tablaEspecificacionesResumen: {

      prueba: nombrePrueba,

      tipoConstruccion: /DESPUES/i.test(String(indicaciones || "")) ? "DESPUES" : "ANTES",

      totalLecciones: totalLeccionesEsperado,

      totalPuntosEsperado,

      distribucionTipos: tiposActivos.map((tipo) => ({

        tipoItem: tipo.tipoItem,

        cantidad: Number(tipo.cantidad || 0),

        valorPorPregunta: Number(tipo.valorPorPregunta || 0),

        subtotalPuntos: Number(tipo.subtotalPuntos || 0)

      }))

    },

    apartados: tiposActivos.map((tipo) => ({

      tipoItem: tipo.tipoItem,

      cantidadPreguntas: Number(tipo.cantidad || 0),

      valorPorPregunta: Number(tipo.valorPorPregunta || 0),

      puntajeTotalApartado: Number(tipo.subtotalPuntos || 0)

    })),

    items,

    validacion: {

      totalItemsCalculado: items.length,

      totalPuntosCalculado,

      totalPuntosEsperado,

      coincideTotalPuntos: totalPuntosCalculado === totalPuntosEsperado,

      coincideDistribucionPorTipo: true,

      coincidePuntajeItemsVsTipos: totalPuntosCalculado === totalPuntosEsperado,

      advertencias: [

        "Examen generado en modo local de respaldo.",

        tipoColegio ? `Tipo de colegio aplicado: ${tipoColegio}.` : ""

      ].filter(Boolean)

    }

  };

}



function parseQuestionBlocksFromPlainText(text: string) {

  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const blocks: Record<string, string[]> = { SR: [], RC: [], C: [], I: [], RE: [], RP: [], RR: [], RCAS: [], PE: [] };

  let current = "";

  const mapHeading = (line: string) => {

    const u = line.toUpperCase();

    if (u.includes("SELECCIÓN DE RESPUESTA") || u.includes("SELECCION DE RESPUESTA")) return "SR";

    if (u.includes("RESPUESTA CORTA")) return "RC";

    if (u.includes("CORRESPONDENCIA")) return "C";

    if (u.includes("IDENTIFICACIÓN") || u.includes("IDENTIFICACION")) return "I";

    if (u.includes("RESOLUCIÓN DE EJERCICIOS") || u.includes("RESOLUCION DE EJERCICIOS")) return "RE";

    if (u.includes("RESOLUCIÓN DE CASOS Y PROBLEMAS") || u.includes("RESOLUCION DE CASOS Y PROBLEMAS")) return "RP";

    if (u.includes("RESOLUCIÓN DE PROBLEMAS") || u.includes("RESOLUCION DE PROBLEMAS")) return "RP";

    if (u.includes("RESPUESTA RESTRINGIDA")) return "RR";

    if (u.includes("RESOLUCIÓN DE CASOS") || u.includes("RESOLUCION DE CASOS")) return "RCAS";

    if (u.includes("PRODUCCIÓN ESCRITA") || u.includes("PRODUCCION ESCRITA")) return "PE";

    return "";

  };

  for (const ln of lines) {

    const maybe = mapHeading(ln);

    if (maybe) { current = maybe; continue; }

    if (!current) continue;

    if (/^\d+[\.\)]\s+/.test(ln) || /^[-*]\s+/.test(ln)) {

      blocks[current].push(ln);

    }

  }

  return Object.fromEntries(Object.entries(blocks).map(([k, arr]) => [k, arr.join("\n")]));

}



function normalizeHeadingForMatch(value: string) {

  return normalizeKey(value)

    .replace(/[^A-Z0-9 ]/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}



function paragraphMatchesAnyHeadingAlias(plain: string, aliases: string[]) {

  const normalized = normalizeHeadingForMatch(plain);

  return aliases.some((alias) => normalized.includes(normalizeHeadingForMatch(alias)));

}



function forceBoldHeadingParagraphs(xml: string, headingAliases: string[]) {

  return xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));

    if (!paragraphMatchesAnyHeadingAlias(plain, headingAliases)) return pXml;

    return pXml.replace(/<w:r>[\s\S]*?<\/w:r>/g, (rXml) => {

      if (/<w:b\/>/.test(rXml) || /<w:bCs\/>/.test(rXml)) return rXml;

      if (/<w:rPr>/.test(rXml)) return rXml.replace("<w:rPr>", "<w:rPr><w:b/><w:bCs/>");

      return rXml.replace("<w:r>", "<w:r><w:rPr><w:b/><w:bCs/></w:rPr>");

    });

  });

}



function injectAfterHeading(xml: string, headingAliases: string[], blockText: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  if (!blockText.trim()) return xml;

  return xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));

    if (!paragraphMatchesAnyHeadingAlias(plain, headingAliases)) return pXml;

    const add = buildWordParagraphsXml(`\n${blockText}`, style);

    return `${pXml}${add}`;

  });

}



function pruneEmptySectionHeading(xml: string, headingAliases: string[], shouldPrune: boolean) {

  if (!shouldPrune) return xml;

  return xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));

    return paragraphMatchesAnyHeadingAlias(plain, headingAliases) ? "" : pXml;

  });

}



function replaceBlockMarkerParagraph(xml: string, marker: string, blockText: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  if (!blockText.trim()) return xml;

  const key = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(`<w:p(?:\\s[^>]*)?(?<!\\/)>[\\s\\S]*?\\{\\{\\s*${key}\\s*\\}\\}[\\s\\S]*?<\\/w:p>`, "gi");

  const replacement = buildWordParagraphsXml(blockText, style);

  return xml.replace(regex, replacement);

}



function xmlUnescape(text: string) {

  return String(text || "")

    .replace(/&lt;/g, "<")

    .replace(/&gt;/g, ">")

    .replace(/&amp;/g, "&")

    .replace(/&quot;/g, "\"")

    .replace(/&apos;/g, "'");

}



function buildWordNumPagesFieldXml(style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const font = String(style?.font || "Calibri").trim() || "Calibri";

  const sizePt = Number.isFinite(Number(style?.sizePt)) ? Math.max(8, Math.min(18, Number(style?.sizePt))) : 11;

  const halfPts = Math.round(sizePt * 2);

  const bold = style?.bold ? "<w:b/><w:bCs/>" : "";

  return `<w:fldSimple w:instr=" NUMPAGES \\\\* MERGEFORMAT "><w:r><w:rPr>${bold}<w:rFonts w:ascii="${xmlEscape(font)}" w:hAnsi="${xmlEscape(font)}" w:cs="${xmlEscape(font)}"/><w:color w:val="000000"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`;

}



function injectNumPagesFieldMarker(xml: string, marker: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const fieldXml = buildWordNumPagesFieldXml(style);

  const token = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const runTokenRegex = new RegExp(

    `<w:r[\\s\\S]*?<w:t[^>]*>\\s*\\{\\{\\s*${token}\\s*\\}\\}\\s*<\\/w:t>[\\s\\S]*?<\\/w:r>`,

    "gi"

  );

  let out = String(xml || "").replace(runTokenRegex, fieldXml);

  // fallback solo token textual (si no viene en run limpio)

  out = out.replace(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "gi"), "1");

  return out;

}



function replaceHardcodedPageCountInstruction(xml: string, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const pattern = /verifique\s+que\s+la\s+prueba\s+conste\s+de\s+\d+\s+p[aá]ginas?\s+debidamente\s+numeradas\.?/i;

  const fieldXml = buildWordNumPagesFieldXml(style);

  return String(xml || "").replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const pPr = (pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/) || [])[0] || "";

    const plain = xmlUnescape(pXml.replace(/<[^>]+>/g, " "));

    if (!pattern.test(plain)) return pXml;

    const prefix = "Verifique que la prueba conste de ";

    const suffix = " paginas debidamente numeradas.";

    return `<w:p>${pPr}${buildWordRunsXml(prefix, style)}${fieldXml}${buildWordRunsXml(suffix, style)}</w:p>`;

  });

}



function replaceMarkersInParagraphXml(xml: string, markers: Record<string, string>, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  let replacedAny = false;

  const out = xml.replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const pPr = (pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/) || [])[0] || "";

    const textRaw = pXml.replace(/<[^>]+>/g, "");

    let text = xmlUnescape(textRaw);

    const before = text;

    for (const [k, v] of Object.entries(markers || {})) {

      text = text.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "gi"), String(v ?? ""));

    }

    if (text === before) return pXml;

    replacedAny = true;

    return `<w:p>${pPr}${buildWordRunsXml(text, style)}</w:p>`;

  });

  return { xml: out, replacedAny };

}



function estimateDocumentPages(text: string) {

  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim().length > 0).length;

  const estimated = Math.max(1, Math.ceil(lines / 38));

  return estimated;

}



function replaceMarkersAcrossRuns(xml: string, markers: Record<string, string>) {

  let out = String(xml || "");

  let replacedAny = false;

  const between = "(?:<[^>]+>|\\s)*";

  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const [k, v] of Object.entries(markers || {})) {

    const token = `{{${k}}}`;

    const chars = token.split("").map((ch) => esc(ch)).join(between);

    const re = new RegExp(chars, "gi");

    const before = out;

    out = out.replace(re, xmlEscape(String(v ?? "")));

    if (out !== before) replacedAny = true;

  }

  return { xml: out, replacedAny };

}



function normalizeMarkerName(value: string) {

  return String(value || "")

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^A-Z0-9_ ]/gi, "")

    .replace(/\s+/g, "_")

    .toUpperCase()

    .trim();

}



function forceResolveMarkersByParagraph(xml: string, markers: Record<string, string>, style?: { font?: string; sizePt?: number; bold?: boolean }) {

  const map = new Map<string, string>();

  for (const [k, v] of Object.entries(markers || {})) {

    map.set(normalizeMarkerName(k), String(v ?? ""));

  }



  return String(xml || "").replace(/<w:p(?:\s[^>]*)?(?<!\/)>[\s\S]*?<\/w:p>/g, (pXml) => {

    const pPr = (pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/) || [])[0] || "";

    const textRaw = pXml.replace(/<[^>]+>/g, "");

    let text = xmlUnescape(textRaw);

    if (!text.includes("{{") || !text.includes("}}")) return pXml;

    const before = text;

    text = text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, keyRaw) => {

      const key = normalizeMarkerName(String(keyRaw || ""));

      return map.has(key) ? String(map.get(key)) : "";

    });

    if (text === before) return pXml;

    return `<w:p>${pPr}${buildWordRunsXml(text, style)}</w:p>`;

  });

}



function normalizeKey(value: any) {

  return normalizeText(value)

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .toUpperCase();

}



function getCostaRicaIsoDate(date = new Date()) {

  const parts = new Intl.DateTimeFormat("en-CA", {

    timeZone: "America/Costa_Rica",

    year: "numeric",

    month: "2-digit",

    day: "2-digit"

  }).formatToParts(date);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value || "";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;

}



function normalizeIsoDateForCostaRica(value?: string | Date | null) {

  if (!value) return getCostaRicaIsoDate();

  const parsed = parseDateInputAsLocalDate(value);

  return getCostaRicaIsoDate(parsed);

}



function assertCanAccess(req: any, res: any) {

  if (isSuperAdmin(req) || isInstitutionAdmin(req) || isProfesor(req)) return true;

  forbidden(res, "No tenés permisos para acceder al módulo de evaluación");

  return false;

}

async function ensurePlantillaVisibilityColumns(pool: any) {

  await pool.request().query(`

    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'UsuarioCreadorId') IS NULL

    BEGIN

      ALTER TABLE dbo.EvaluacionPlantilla

      ADD UsuarioCreadorId INT NULL;

    END;



    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'EsPublica') IS NULL

    BEGIN

      ALTER TABLE dbo.EvaluacionPlantilla

      ADD EsPublica BIT NOT NULL CONSTRAINT DF_EvaluacionPlantilla_EsPublica_eval360 DEFAULT(1);

    END;

  `);

}



async function ensurePromptIATemplateVisibilityColumns(pool: any) {

  await pool.request().query(`

    IF COL_LENGTH('dbo.PlantillaPromptIA', 'UsuarioCreadorId') IS NULL

    BEGIN

      ALTER TABLE dbo.PlantillaPromptIA

      ADD UsuarioCreadorId INT NULL;

    END;



    IF COL_LENGTH('dbo.PlantillaPromptIA', 'EsPublica') IS NULL

    BEGIN

      ALTER TABLE dbo.PlantillaPromptIA

      ADD EsPublica BIT NOT NULL CONSTRAINT DF_PlantillaPromptIA_EsPublica_eval360 DEFAULT(1);

    END;

  `);

}



async function ensureEval360ActividadPlaneamientoColumns(pool: any) {

  await pool.request().query(`

    IF COL_LENGTH('dbo.Eval360_Actividad', 'UsaIndicadoresPlaneamiento') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_Actividad

      ADD UsaIndicadoresPlaneamiento BIT NOT NULL CONSTRAINT DF_Eval360_Actividad_UsaIndicadoresPlaneamiento DEFAULT(0);

    END;

  `);

}



async function getAsignacionPermitida(req: any, res: any, input: {

  grupoId: number;

  materiaId: number;

  anioLectivoId: number;

  periodoId: number;

  grupoClaseId?: number | null;

}) {

  if (!assertCanAccess(req, res)) return null;



  const pool = await getPool();

  const userId = getUserId(req);

  await ensureEval360GrupoClaseColumn(pool);

  const grupoClaseId = toOptionalGrupoClaseId(input.grupoClaseId);

  if (grupoClaseId && await hasGrupoClaseSchema(pool)) {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return null;

    const grupoClase = await getGrupoClasePermitido({
      pool,
      grupoClaseId,
      institucionId,
      usuarioId: userId || null,
      permitirAdministrativo: isSuperAdmin(req) || isInstitutionAdmin(req)
    });

    if (!grupoClase) {
      forbidden(res, "No tenÃ©s permisos para trabajar con ese grupo de clase");
      return null;
    }

    if (
      Number(grupoClase.GrupoIdPrincipal) !== Number(input.grupoId) ||
      Number(grupoClase.MateriaId) !== Number(input.materiaId) ||
      Number(grupoClase.AnioLectivoId) !== Number(input.anioLectivoId) ||
      Number(grupoClase.PeriodoId) !== Number(input.periodoId)
    ) {
      forbidden(res, "El grupo de clase no coincide con el grupo, materia y periodo seleccionados");
      return null;
    }

    return {
      AsignacionDocenteId: 0,
      UsuarioId: Number(grupoClase.UsuarioPrincipalId || userId || 0),
      InstitucionId: Number(grupoClase.InstitucionId),
      GrupoId: Number(grupoClase.GrupoIdPrincipal),
      GrupoNombre: grupoClase.Nombre,
      GrupoNivel: grupoClase.GrupoNivel,
      MateriaId: Number(grupoClase.MateriaId),
      MateriaNombre: grupoClase.MateriaNombre,
      AnioLectivoId: Number(grupoClase.AnioLectivoId),
      AnioNombre: grupoClase.AnioNombre,
      PeriodoId: Number(grupoClase.PeriodoId),
      PeriodoNombre: grupoClase.PeriodoNombre,
      GrupoClaseId: Number(grupoClase.GrupoClaseId)
    };
  }



  const request = pool.request()

    .input("grupoId", sql.Int, input.grupoId)

    .input("materiaId", sql.Int, input.materiaId)

    .input("anioLectivoId", sql.Int, input.anioLectivoId)

    .input("periodoId", sql.Int, input.periodoId)

    .input("usuarioId", sql.Int, userId || null);



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

      g.Nombre AS GrupoNombre,

      g.Nivel AS GrupoNivel,

      ad.MateriaId,

      m.Nombre AS MateriaNombre,

      ad.AnioLectivoId,

      al.Nombre AS AnioNombre,

      ad.PeriodoId,

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



  if (!result.recordset[0]) {

    forbidden(res, "No tenés permisos para trabajar con ese grupo, materia y periodo");

    return null;

  }



  return result.recordset[0];

}



async function getCatalogoComponentes(pool: any) {

  const result = await pool.request().query(`

    SELECT ComponenteCatalogoId, Nombre, Descripcion, Activo

    FROM dbo.Eval360_ComponenteCatalogo

    WHERE Activo = 1

    ORDER BY ComponenteCatalogoId

  `);



  return result.recordset;

}



function inferComponenteCatalogoId(nombreComponente: string, catalogo: any[]) {

  const key = normalizeKey(nombreComponente);



  const exact = catalogo.find((item) => normalizeKey(item.Nombre) === key);

  if (exact) return Number(exact.ComponenteCatalogoId);



  const reglas: Array<{ palabras: string[]; nombreCatalogo: string }> = [

    { palabras: ["COTIDIANO"], nombreCatalogo: "Trabajo cotidiano" },

    { palabras: ["TAREA"], nombreCatalogo: "Tareas" },

    { palabras: ["PROYECTO"], nombreCatalogo: "Proyecto" },

    { palabras: ["EXAM", "EXAMEN", "PRUEBA"], nombreCatalogo: "Pruebas" },

    { palabras: ["SUMATIVA", "INSTRUMENTO"], nombreCatalogo: "Instrumento de evaluación sumativa" },

    { palabras: ["PORTAFOLIO"], nombreCatalogo: "Portafolio de evidencias" },

    { palabras: ["DEMOSTRACION", "APRENDIDO"], nombreCatalogo: "Demostración de lo aprendido" },

    { palabras: ["ASISTENCIA"], nombreCatalogo: "Asistencia" }

  ];



  for (const regla of reglas) {

    if (regla.palabras.some((palabra) => key.includes(palabra))) {

      const match = catalogo.find((item) => normalizeKey(item.Nombre) === normalizeKey(regla.nombreCatalogo));

      if (match) return Number(match.ComponenteCatalogoId);

    }

  }



  return Number(catalogo[0]?.ComponenteCatalogoId || 1);

}





async function sincronizarEstructuraConPlantilla(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {

  if (!estructuraGrupoId || !plantillaBaseId) return;

  await ensureEval360ActividadPlaneamientoColumns(pool);

  await ensureEval360SeguimientoRecuperacionColumns(pool);



  const catalogo = await getCatalogoComponentes(pool);



  const componentesResult = await pool.request()

    .input("plantillaBaseId", sql.Int, plantillaBaseId)

    .query(`

      SELECT

        ec.EvaluacionComponenteId,

        COALESCE(NULLIF(LTRIM(RTRIM(ec.Nombre)), N''), ec.Descripcion) AS NombreComponente,

        ec.Descripcion,

        ec.Porcentaje,

        ec.Orden,

        ec.TipoSeguimiento,

        ec.PermitePlaneamiento

      FROM dbo.EvaluacionComponente ec

      WHERE ec.EvaluacionPlantillaId = @plantillaBaseId

        AND ISNULL(ec.Activo, 1) = 1

      ORDER BY ec.Orden, ec.EvaluacionComponenteId

    `);



  const componentes = componentesResult.recordset || [];

  if (!componentes.length) return;



  let detallesResult = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT *

      FROM dbo.Eval360_EstructuraGrupoDetalle

      WHERE EstructuraGrupoId = @estructuraGrupoId

        AND ISNULL(Activo, 1) = 1

    `);



  let detalles = detallesResult.recordset || [];



  for (const componente of componentes) {

    const nombre = normalizeText(componente.NombreComponente || componente.Descripcion);

    if (!nombre) continue;



    const existeDetalle = detalles.some((detalle: any) => normalizeKey(detalle.Nombre) === normalizeKey(nombre));

    if (!existeDetalle) {

      const componenteCatalogoId = inferComponenteCatalogoId(nombre, catalogo);

      await pool.request()

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("componenteCatalogoId", sql.Int, componenteCatalogoId)

        .input("nombre", sql.NVarChar(150), nombre)

        .input("porcentaje", sql.Decimal(5, 2), Number(componente.Porcentaje || 0))

        .input("orden", sql.Int, Number(componente.Orden || 1))

        .query(`

          INSERT INTO dbo.Eval360_EstructuraGrupoDetalle

            (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)

          VALUES

            (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())

        `);

    }

  }



  detallesResult = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT *

      FROM dbo.Eval360_EstructuraGrupoDetalle

      WHERE EstructuraGrupoId = @estructuraGrupoId

        AND ISNULL(Activo, 1) = 1

    `);

  detalles = detallesResult.recordset || [];



  for (const componente of componentes) {

    const nombreComponente = normalizeText(componente.NombreComponente || componente.Descripcion);

    const detalle = detalles.find((item: any) => normalizeKey(item.Nombre) === normalizeKey(nombreComponente));

    if (!detalle) continue;



    const actividadesPlantilla = await pool.request()

      .input("evaluacionComponenteId", sql.Int, Number(componente.EvaluacionComponenteId))

      .query(`

        SELECT

          EvaluacionActividadId,

          Descripcion,

          ISNULL(UsaIndicadoresPlaneamiento, 0) AS UsaIndicadoresPlaneamiento,

          Porcentaje,

          Fecha,

          Orden

        FROM dbo.EvaluacionActividad

        WHERE EvaluacionComponenteId = @evaluacionComponenteId

          AND ISNULL(Activo, 1) = 1

        ORDER BY Orden, EvaluacionActividadId

      `);



    for (const actividad of actividadesPlantilla.recordset || []) {

      const nombreActividad = normalizeText(actividad.Descripcion || `Actividad ${actividad.EvaluacionActividadId}`);

      if (!nombreActividad) continue;



      const existeActividad = await pool.request()

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("estructuraGrupoDetalleId", sql.Int, Number(detalle.EstructuraGrupoDetalleId))

        .input("nombre", sql.NVarChar(200), nombreActividad)

        .query(`

          SELECT TOP 1 ActividadId

          FROM dbo.Eval360_Actividad

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

            AND ISNULL(Activo, 1) = 1

            AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))

        `);



      if (!existeActividad.recordset[0]) {

        await pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .input("estructuraGrupoDetalleId", sql.Int, Number(detalle.EstructuraGrupoDetalleId))

          .input("nombre", sql.NVarChar(200), nombreActividad)

          .input("descripcion", sql.NVarChar(sql.MAX), actividad.Descripcion || null)

          .input("fecha", sql.Date, actividad.Fecha || null)

          .input("puntosMaximos", sql.Decimal(10, 2), 100)

          .input("porcentajeDentroRubro", sql.Decimal(5, 2), Number(actividad.Porcentaje || 0))

          .input("usaIndicadoresPlaneamiento", sql.Bit, Boolean(actividad.UsaIndicadoresPlaneamiento))

          .input("fuente", sql.NVarChar(50), "Plantilla")

          .query(`

            INSERT INTO dbo.Eval360_Actividad

              (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)

            VALUES

              (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, @fecha, @puntosMaximos, @porcentajeDentroRubro, @usaIndicadoresPlaneamiento, @fuente, 1, SYSDATETIME())

          `);

      } else {

        await pool.request()

          .input("actividadId", sql.Int, Number(existeActividad.recordset[0].ActividadId))

          .input("usaIndicadoresPlaneamiento", sql.Bit, Boolean(actividad.UsaIndicadoresPlaneamiento))

          .query(`

            UPDATE dbo.Eval360_Actividad

            SET UsaIndicadoresPlaneamiento = @usaIndicadoresPlaneamiento,

                UpdatedAt = SYSDATETIME()

            WHERE ActividadId = @actividadId

          `);

      }

    }

  }

}





async function estructuraNecesitaSincronizacion(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {

  if (!estructuraGrupoId || !plantillaBaseId) return false;



  const faltantes = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .input("plantillaBaseId", sql.Int, plantillaBaseId)

    .query(`

      SELECT

        SUM(CASE WHEN d.EstructuraGrupoDetalleId IS NULL THEN 1 ELSE 0 END) AS ComponentesFaltantes,

        SUM(CASE WHEN ea.EvaluacionActividadId IS NOT NULL AND a.ActividadId IS NULL THEN 1 ELSE 0 END) AS ActividadesFaltantes

      FROM dbo.EvaluacionComponente ec

      OUTER APPLY (

        SELECT TOP 1 d.EstructuraGrupoDetalleId

        FROM dbo.Eval360_EstructuraGrupoDetalle d

        WHERE d.EstructuraGrupoId = @estructuraGrupoId

          AND ISNULL(d.Activo, 1) = 1

          AND UPPER(LTRIM(RTRIM(d.Nombre))) = UPPER(LTRIM(RTRIM(COALESCE(NULLIF(ec.Nombre, N''), ec.Descripcion))))

      ) d

      OUTER APPLY (

        SELECT TOP 1 ea.EvaluacionActividadId, ea.Descripcion

        FROM dbo.EvaluacionActividad ea

        WHERE ea.EvaluacionComponenteId = ec.EvaluacionComponenteId

          AND ISNULL(ea.Activo, 1) = 1

      ) ea

      OUTER APPLY (

        SELECT TOP 1 a.ActividadId

        FROM dbo.Eval360_Actividad a

        WHERE a.EstructuraGrupoId = @estructuraGrupoId

          AND d.EstructuraGrupoDetalleId IS NOT NULL

          AND a.EstructuraGrupoDetalleId = d.EstructuraGrupoDetalleId

          AND ISNULL(a.Activo, 1) = 1

          AND ea.EvaluacionActividadId IS NOT NULL

          AND UPPER(LTRIM(RTRIM(a.Nombre))) = UPPER(LTRIM(RTRIM(COALESCE(NULLIF(ea.Descripcion, N''), CONCAT(N'Actividad ', ea.EvaluacionActividadId)))))

      ) a

      WHERE ec.EvaluacionPlantillaId = @plantillaBaseId

        AND ISNULL(ec.Activo, 1) = 1

    `);



  const row = faltantes.recordset[0] || {};

  return Number(row.ComponentesFaltantes || 0) > 0 || Number(row.ActividadesFaltantes || 0) > 0;

}



async function sincronizarEstructuraConPlantillaSiFaltan(pool: any, estructuraGrupoId: number, plantillaBaseId: number) {

  if (!estructuraGrupoId || !plantillaBaseId) return;

  await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, plantillaBaseId);

}



async function getEstructuraCompleta(pool: any, estructuraGrupoId: number) {

  const estructura = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT TOP 1

        eg.*,

        g.Nombre AS GrupoNombre,

        m.Nombre AS MateriaNombre,

        al.Nombre AS AnioNombre,

        p.Nombre AS PeriodoNombre,

        ep.Nombre AS PlantillaBaseNombre

      FROM dbo.Eval360_EstructuraGrupo eg

      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

      INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId

      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId

      LEFT JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId

      LEFT JOIN dbo.EvaluacionPlantilla ep ON ep.EvaluacionPlantillaId = eg.PlantillaBaseId

      WHERE eg.EstructuraGrupoId = @estructuraGrupoId

    `);



  const detalles = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT

        d.*,

        c.Nombre AS ComponenteCatalogoNombre

      FROM dbo.Eval360_EstructuraGrupoDetalle d

      INNER JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId

      WHERE d.EstructuraGrupoId = @estructuraGrupoId

      ORDER BY d.Orden, d.EstructuraGrupoDetalleId

    `);



  const niveles = await pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .query(`

      SELECT *

      FROM dbo.Eval360_NivelDesempenoGrupo

      WHERE EstructuraGrupoId = @estructuraGrupoId

      ORDER BY Orden, NivelDesempenoGrupoId

    `);



  return {

    estructura: estructura.recordset[0] || null,

    detalles: detalles.recordset,

    niveles: niveles.recordset

  };

}



router.get("/componentes-catalogo", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();

    const catalogo = await getCatalogoComponentes(pool);

    return ok(res, catalogo);

  } catch (error) {

    console.error("Error listando componentes Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar los componentes" });

  }

});



router.get("/plantillas", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const pool = await getPool();

    const docenteSesionNombre = await getSessionTeacherDisplayName(pool, req);

    const institucionId = getInstitutionId(req, res);

    if (institucionId === null) return;



    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);

    const periodoId = toOptionalNumber(req.query.periodoId);

    const materiaId = toOptionalNumber(req.query.materiaId);

    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";



    const request = pool.request()

      .input("institucionId", sql.Int, institucionId)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("materiaId", sql.Int, materiaId);



    const filtroActivo = incluirInactivas ? "" : "AND ep.Activo = 1";

    const filtroVisibilidadProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)

      ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)"

      : "";



    const result = await request.query(`

      SELECT

        ep.EvaluacionPlantillaId,

        ep.InstitucionId,

        ep.AnioLectivoId,

        al.Nombre AS AnioNombre,

        ep.PeriodoId,

        p.Nombre AS PeriodoNombre,

        ep.MateriaId,

        m.Nombre AS MateriaNombre,

        ep.Nombre,

        ep.UsuarioCreadorId,

        ep.EsPublica,

        ep.PermitirProfesorEditar,

        ep.DecimalesNota,

        ep.Estado,

        ep.Activo,

        SUM(CASE WHEN ec.Activo = 1 THEN ISNULL(ec.Porcentaje, 0) ELSE 0 END) AS TotalPorcentaje

      FROM dbo.EvaluacionPlantilla ep

      LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId

      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId

      LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId

      LEFT JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionPlantillaId = ep.EvaluacionPlantillaId

      WHERE ep.InstitucionId = @institucionId

        ${filtroActivo}

        AND (@anioLectivoId IS NULL OR ep.AnioLectivoId = @anioLectivoId)

        AND (@periodoId IS NULL OR ep.PeriodoId = @periodoId)

        AND (@materiaId IS NULL OR ep.MateriaId = @materiaId)

        ${filtroVisibilidadProfesor}

      GROUP BY

        ep.EvaluacionPlantillaId,

        ep.InstitucionId,

        ep.AnioLectivoId,

        al.Nombre,

        ep.PeriodoId,

        p.Nombre,

        ep.MateriaId,

        m.Nombre,

        ep.Nombre,

        ep.UsuarioCreadorId,

        ep.EsPublica,

        ep.PermitirProfesorEditar,

        ep.DecimalesNota,

        ep.Estado,

        ep.Activo

      ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC

    `);



    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error listando plantillas Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas de evaluación" });

  }

});



router.get("/plantillas/:id/detalle", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const pool = await getPool();

    await ensurePlantillaVisibilityColumns(pool);

    const institucionId = getInstitutionId(req, res);

    if (institucionId === null) return;

    const plantillaId = toRequiredNumber(req.params.id, "plantillaId", res);

    if (plantillaId === null) return;



    const plantilla = await pool.request()

      .input("institucionId", sql.Int, institucionId)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("plantillaId", sql.Int, plantillaId)

      .query(`

        SELECT

          ep.*,

          al.Nombre AS AnioNombre,

          p.Nombre AS PeriodoNombre,

          m.Nombre AS MateriaNombre

        FROM dbo.EvaluacionPlantilla ep

        LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId

        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId

        LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId

        WHERE ep.EvaluacionPlantillaId = @plantillaId

          AND ep.InstitucionId = @institucionId

          ${isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)" : ""}

      `);



    if (!plantilla.recordset[0]) return badRequest(res, "No se encontró la plantilla indicada");



    const componentes = await pool.request()

      .input("plantillaId", sql.Int, plantillaId)

      .query(`

        SELECT

          ec.EvaluacionComponenteId,

          ec.EvaluacionPlantillaId,

          ec.Descripcion,

          ec.Nombre,

          ec.Porcentaje,

          ec.Orden,

          ec.Activo

        FROM dbo.EvaluacionComponente ec

        WHERE ec.EvaluacionPlantillaId = @plantillaId

        ORDER BY ec.Orden, ec.EvaluacionComponenteId

      `);



    return ok(res, {

      plantilla: plantilla.recordset[0],

      componentes: componentes.recordset

    });

  } catch (error) {

    console.error("Error cargando detalle de plantilla Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo cargar el detalle de la plantilla" });

  }

});



router.get("/estructuras/grupo", async (req, res) => {

  try {

    const grupoId = toRequiredNumber(req.query.grupoId, "grupoId", res);

    const materiaId = toRequiredNumber(req.query.materiaId, "materiaId", res);

    const anioLectivoId = toRequiredNumber(req.query.anioLectivoId, "anioLectivoId", res);

    const periodoId = toRequiredNumber(req.query.periodoId, "periodoId", res);

    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);

    if ([grupoId, materiaId, anioLectivoId, periodoId].some((value) => value === null)) return;



    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId });

    if (!asignacion) return;



    const pool = await getPool();
    await ensureEval360GrupoClaseColumn(pool);

    const result = await pool.request()

      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))

      .input("grupoId", sql.Int, grupoId)

      .input("materiaId", sql.Int, materiaId)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("grupoClaseId", sql.Int, grupoClaseId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_EstructuraGrupo

        WHERE InstitucionId = @institucionId

          AND GrupoId = @grupoId

          AND MateriaId = @materiaId

          AND AnioLectivoId = @anioLectivoId

          AND PeriodoId = @periodoId

          AND ISNULL(GrupoClaseId, 0) = ISNULL(@grupoClaseId, 0)

          AND Activo = 1

        ORDER BY EstructuraGrupoId DESC

      `);



    const estructura = result.recordset[0];

    if (!estructura) return ok(res, null);



    const data = await getEstructuraCompleta(pool, Number(estructura.EstructuraGrupoId));

    return ok(res, data);

  } catch (error) {

    console.error("Error cargando estructura Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo cargar la estructura de evaluación" });

  }

});



router.get("/super-admin/secciones-mantenimiento", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    if (!isSuperAdmin(req)) return forbidden(res, "Solo SUPER_ADMIN puede acceder a esta opcion");

    const pool = await getPool();
    const institucionId = toOptionalNumber(req.query.institucionId);
    const grupoId = toOptionalNumber(req.query.grupoId);
    const profesorId = toOptionalNumber(req.query.profesorId);

    if (!institucionId || (!grupoId && !profesorId)) {
      return ok(res, []);
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoId", sql.Int, grupoId)
      .input("profesorId", sql.Int, profesorId)
      .query(`
      ;WITH Asignaciones AS (
        SELECT
          ad.InstitucionId,
          i.Nombre AS InstitucionNombre,
          ad.GrupoId,
          g.Nombre AS GrupoNombre,
          ad.MateriaId,
          m.Nombre AS MateriaNombre,
          ad.AnioLectivoId,
          al.Nombre AS AnioNombre,
          ad.PeriodoId,
          p.Nombre AS PeriodoNombre,
          u.Nombre AS ProfesorNombre,
          u.PrimerApellido AS ProfesorPrimerApellido,
          u.SegundoApellido AS ProfesorSegundoApellido,
          ROW_NUMBER() OVER (
            PARTITION BY ad.InstitucionId, ad.GrupoId, ad.MateriaId, ad.AnioLectivoId, ad.PeriodoId
            ORDER BY ad.AsignacionDocenteId DESC
          ) AS rn
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Institucion i ON i.InstitucionId = ad.InstitucionId
        INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
        LEFT JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
        INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
        WHERE ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          AND ad.InstitucionId = @institucionId
          AND (@grupoId IS NULL OR ad.GrupoId = @grupoId)
          AND (@profesorId IS NULL OR ad.UsuarioId = @profesorId)
      )
      SELECT
        InstitucionId,
        InstitucionNombre,
        GrupoId,
        MateriaId,
        AnioLectivoId,
        PeriodoId,
        GrupoNombre,
        MateriaNombre,
        AnioNombre,
        PeriodoNombre,
        ProfesorNombre,
        ProfesorPrimerApellido,
        ProfesorSegundoApellido
      FROM Asignaciones
      WHERE rn = 1
      ORDER BY
        InstitucionNombre,
        TRY_CONVERT(int, LEFT(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') - 1)),
        TRY_CONVERT(int, SUBSTRING(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') + 1, 20)),
        GrupoNombre,
        MateriaNombre,
        AnioNombre,
        PeriodoNombre
    `);

    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error cargando secciones de mantenimiento super admin:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar las secciones de mantenimiento" });

  }

});



router.get("/super-admin/secciones-mantenimiento/filtros", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    if (!isSuperAdmin(req)) return forbidden(res, "Solo SUPER_ADMIN puede acceder a esta opcion");

    const pool = await getPool();
    const institucionId = toOptionalNumber(req.query.institucionId);
    const grado = String(req.query.grado || "").trim();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grado", sql.NVarChar(20), grado || null)
      .query(`
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
          AND ad.MateriaId IS NOT NULL;

        SELECT DISTINCT InstitucionId, InstitucionNombre
        FROM #Base
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
            AND (@grado IS NULL OR Grado = @grado)
        ) AS Secciones
        ORDER BY
          TRY_CONVERT(int, LEFT(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') - 1)),
          TRY_CONVERT(int, SUBSTRING(GrupoNombre, CHARINDEX('-', GrupoNombre + '-') + 1, 20)),
          GrupoNombre;

        SELECT DISTINCT ProfesorId, ProfesorNombre
        FROM #Base
        WHERE @institucionId IS NOT NULL
          AND InstitucionId = @institucionId
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

    console.error("Error cargando filtros de mantenimiento super admin:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar los filtros de mantenimiento" });

  }

});



router.get("/estructuras/:id", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const pool = await getPool();

    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);

    if (estructuraGrupoId === null) return;



    const institucionId = getInstitutionId(req, res);

    if (institucionId === null) return;



    const data = await getEstructuraCompleta(pool, estructuraGrupoId);

    if (!data.estructura || (!isSuperAdmin(req) && Number(data.estructura.InstitucionId) !== institucionId)) {

      return forbidden(res, "No tenés permisos para ver esta estructura");

    }



    return ok(res, data);

  } catch (error) {

    console.error("Error cargando estructura por id Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo cargar la estructura de evaluación" });

  }

});



router.delete("/estructuras/:id/calificaciones", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    if (!assertCanAccess(req, res)) return;
    if (!isSuperAdmin(req)) return forbidden(res, "Solo SUPER_ADMIN puede eliminar calificaciones");

    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);
    if (estructuraGrupoId === null) return;
    const institucionSeleccionadaId = toOptionalNumber(req.query.institucionId);
    if (!institucionSeleccionadaId) return badRequest(res, "Debés indicar el colegio seleccionado");

    const estructuraResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_EstructuraGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1
      `);

    const estructura = estructuraResult.recordset[0] || null;
    if (!estructura) return badRequest(res, "No se encontró la estructura indicada");
    if (Number(estructura.InstitucionId || 0) !== institucionSeleccionadaId) {
      return forbidden(res, "La estructura no pertenece al colegio seleccionado");
    }

    await ensureComponenteAjusteManualTables(pool);
    await transaction.begin();

    const actividadIdsResult = await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT ActividadId
        FROM dbo.Eval360_Actividad
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND ISNULL(Activo, 1) = 1
      `);

    const actividadIds = (actividadIdsResult.recordset || [])
      .map((row: any) => Number(row.ActividadId))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    const actividadIdsClause = actividadIds.length ? actividadIds.join(",") : "NULL";

    const seguimientosBorrados = actividadIds.length
      ? await new sql.Request(transaction).query(`
          DELETE FROM dbo.Eval360_SeguimientoIndicador
          WHERE ActividadId IN (${actividadIdsClause});
        `)
      : { rowsAffected: [0] };

    const notasBorradas = actividadIds.length
      ? await new sql.Request(transaction).query(`
          DELETE FROM dbo.Eval360_NotaActividad
          WHERE ActividadId IN (${actividadIdsClause});
        `)
      : { rowsAffected: [0] };

    const ajustesBorrados = await new sql.Request(transaction)
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        DELETE FROM dbo.Eval360_ComponenteAjusteManual
        WHERE EstructuraGrupoId = @estructuraGrupoId;
      `);

    const asistenciasBorradas = await new sql.Request(transaction)
      .input("grupoId", sql.Int, Number(estructura.GrupoId || 0))
      .input("materiaId", sql.Int, Number(estructura.MateriaId || 0))
      .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId || 0))
      .input("periodoId", sql.Int, Number(estructura.PeriodoId || 0))
      .query(`
        DELETE FROM dbo.AsistenciaRegistro
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId;
      `);

    await transaction.commit();

    return ok(res, {
      estructuraGrupoId,
      actividadesBorradas: actividadIds.length,
      seguimientosBorrados: Number(seguimientosBorrados.rowsAffected?.[0] || 0),
      notasBorradas: Number(notasBorradas.rowsAffected?.[0] || 0),
      ajustesBorrados: Number(ajustesBorrados.rowsAffected?.[0] || 0),
      asistenciasBorradas: Number(asistenciasBorradas.rowsAffected?.[0] || 0)
    }, "Calificaciones eliminadas correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error eliminando calificaciones Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron eliminar las calificaciones" });
  }
});

router.delete("/estructuras/:id/plantilla-asignada", async (req, res) => {
  try {
    if (!assertCanAccess(req, res)) return;
    if (!isSuperAdmin(req)) return forbidden(res, "Solo SUPER_ADMIN puede eliminar la plantilla asignada");

    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);
    if (estructuraGrupoId === null) return;
    const institucionSeleccionadaId = toOptionalNumber(req.query.institucionId);
    if (!institucionSeleccionadaId) return badRequest(res, "Debés indicar el colegio seleccionado");

    const pool = await getPool();
    const estructuraResult = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT TOP 1 EstructuraGrupoId, InstitucionId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1;
      `);

    const estructura = estructuraResult.recordset[0] || null;
    if (!estructura) {
      return badRequest(res, "No se encontró la estructura indicada");
    }
    if (Number(estructura.InstitucionId || 0) !== institucionSeleccionadaId) {
      return forbidden(res, "La estructura no pertenece al colegio seleccionado");
    }

    const result = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        UPDATE dbo.Eval360_EstructuraGrupo
        SET PlantillaBaseId = NULL,
            UpdatedAt = SYSDATETIME()
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1;
      `);

    if (!result.rowsAffected?.[0]) {
      return badRequest(res, "No se encontró la estructura indicada");
    }

    return ok(res, { estructuraGrupoId }, "Plantilla asignada eliminada correctamente");
  } catch (error) {
    console.error("Error eliminando plantilla asignada Eval360:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar la plantilla asignada" });
  }
});

router.post("/estructuras/crear-desde-plantilla", async (req, res) => {

  const pool = await getPool();

  await ensurePlantillaVisibilityColumns(pool);
  await ensureEval360GrupoClaseColumn(pool);

  const transaction = new sql.Transaction(pool);



  try {

    const grupoId = toRequiredNumber(req.body.grupoId, "grupoId", res);

    const materiaId = toRequiredNumber(req.body.materiaId, "materiaId", res);

    const anioLectivoId = toRequiredNumber(req.body.anioLectivoId, "anioLectivoId", res);

    const periodoId = toRequiredNumber(req.body.periodoId, "periodoId", res);

    const plantillaId = toOptionalNumber(req.body.plantillaId || req.body.evaluacionPlantillaId);

    const grupoClaseId = toOptionalGrupoClaseId(req.body.grupoClaseId ?? req.query.grupoClaseId);

    const nombrePersonalizado = normalizeText(req.body.nombre);



    if ([grupoId, materiaId, anioLectivoId, periodoId].some((value) => value === null)) return;



    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId });

    if (!asignacion) return;



    const existente = await pool.request()

      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))

      .input("grupoId", sql.Int, grupoId)

      .input("materiaId", sql.Int, materiaId)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("grupoClaseId", sql.Int, grupoClaseId)

      .query(`

        SELECT TOP 1 EstructuraGrupoId, PlantillaBaseId

        FROM dbo.Eval360_EstructuraGrupo

        WHERE InstitucionId = @institucionId

          AND GrupoId = @grupoId

          AND MateriaId = @materiaId

          AND AnioLectivoId = @anioLectivoId

          AND PeriodoId = @periodoId

          AND ISNULL(GrupoClaseId, 0) = ISNULL(@grupoClaseId, 0)

          AND Activo = 1

        ORDER BY EstructuraGrupoId DESC

      `);



    const estructuraExistente = existente.recordset[0] || null;



    if (estructuraExistente && !plantillaId) {

      await sincronizarEstructuraConPlantillaSiFaltan(pool, Number(estructuraExistente.EstructuraGrupoId), Number(estructuraExistente.PlantillaBaseId || 0));

      const data = await getEstructuraCompleta(pool, Number(estructuraExistente.EstructuraGrupoId));

      return ok(res, { ...data, creada: false }, "Ya existe una estructura de evaluacion para este grupo");

    }



    if (estructuraExistente && plantillaId && Number(estructuraExistente.PlantillaBaseId || 0) !== Number(plantillaId)) {

      const calificacionesExistentes = await pool.request()

        .input("estructuraGrupoId", sql.Int, Number(estructuraExistente.EstructuraGrupoId))

        .query(`

          SELECT

            CASE

              WHEN EXISTS (

                SELECT 1

                FROM dbo.Eval360_NotaActividad na

                INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = na.ActividadId

                WHERE act.EstructuraGrupoId = @estructuraGrupoId

                  AND (

                    (na.PuntosObtenidos IS NOT NULL AND na.PuntosObtenidos > 0)

                    OR (na.PorcentajeObtenido IS NOT NULL AND na.PorcentajeObtenido > 0)

                  )

              )

              OR EXISTS (

                SELECT 1

                FROM dbo.Eval360_SeguimientoIndicador si

                INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = si.ActividadId

                WHERE act.EstructuraGrupoId = @estructuraGrupoId

                  AND ISNULL(si.ValorSeleccionado, 0) > 0

              )

              OR EXISTS (

                SELECT 1

                FROM dbo.Eval360_EstructuraGrupo eg

                INNER JOIN dbo.AsistenciaRegistro ar

                  ON ar.GrupoId = eg.GrupoId

                 AND ar.MateriaId = eg.MateriaId

                 AND ar.AnioLectivoId = eg.AnioLectivoId

                 AND ar.PeriodoId = eg.PeriodoId

                 AND ISNULL(ar.GrupoClaseId, 0) = ISNULL(eg.GrupoClaseId, 0)

                WHERE eg.EstructuraGrupoId = @estructuraGrupoId

              )

              THEN 1

              ELSE 0

            END AS TieneCalificaciones

        `);



      if (Number(calificacionesExistentes.recordset[0]?.TieneCalificaciones || 0) === 1) {

        return badRequest(res, "No se puede cambiar la plantilla porque ya existen rubros calificados");

      }

    }



    const plantillaRequest = pool.request()

      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("plantillaId", sql.Int, plantillaId)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("materiaId", sql.Int, materiaId);



    const plantillaResult = await plantillaRequest.query(`

      SELECT TOP 1

        ep.*,

        al.Nombre AS AnioNombre,

        p.Nombre AS PeriodoNombre,

        m.Nombre AS MateriaNombre

      FROM dbo.EvaluacionPlantilla ep

      LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId

      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId

      LEFT JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId

      WHERE ep.InstitucionId = @institucionId

        AND ep.Activo = 1

        AND (@plantillaId IS NULL OR ep.EvaluacionPlantillaId = @plantillaId)

        AND (@plantillaId IS NOT NULL OR ep.AnioLectivoId = @anioLectivoId)

        AND (@plantillaId IS NOT NULL OR ep.PeriodoId = @periodoId)

        AND (@plantillaId IS NOT NULL OR ep.MateriaId = @materiaId)

        ${isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)" : ""}

      ORDER BY

        CASE WHEN @plantillaId IS NOT NULL AND ep.EvaluacionPlantillaId = @plantillaId THEN 0 ELSE 1 END,

        CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END,

        ep.EvaluacionPlantillaId DESC

    `);



    const plantilla = plantillaResult.recordset[0];

    if (!plantilla) return badRequest(res, "No se encontró una plantilla de evaluación activa para este grupo, materia y periodo");



    const componentesResult = await pool.request()

      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))

      .query(`

        SELECT

          EvaluacionComponenteId,

          EvaluacionPlantillaId,

          COALESCE(NULLIF(LTRIM(RTRIM(Nombre)), N''), Descripcion) AS NombreComponente,

          Descripcion,

          Porcentaje,

          Orden,

          Activo

        FROM dbo.EvaluacionComponente

        WHERE EvaluacionPlantillaId = @plantillaId

          AND Activo = 1

        ORDER BY Orden, EvaluacionComponenteId

      `);



    const componentes = componentesResult.recordset;

    if (!componentes.length) return badRequest(res, "La plantilla seleccionada no tiene componentes activos");



    const total = componentes.reduce((sum: number, item: any) => sum + Number(item.Porcentaje || 0), 0);

    if (Number(total.toFixed(2)) !== 100) {

      return badRequest(res, `La plantilla seleccionada suma ${total.toFixed(2)}%. Debe sumar 100% para poder aplicarse`);

    }



    const catalogo = await getCatalogoComponentes(pool);





    await transaction.begin();



    if (estructuraExistente) {

      await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, Number(estructuraExistente.EstructuraGrupoId))

        .query(`

          UPDATE dbo.Eval360_EstructuraGrupo

          SET Activo = 0, UpdatedAt = SYSDATETIME()

          WHERE EstructuraGrupoId = @estructuraGrupoId

        `);

    }



    const estructuraResult = await new sql.Request(transaction)

      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))

      .input("grupoId", sql.Int, grupoId)

      .input("materiaId", sql.Int, materiaId)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("grupoClaseId", sql.Int, grupoClaseId)

      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req)) || null)

      .input("plantillaBaseId", sql.Int, Number(plantilla.EvaluacionPlantillaId))

      .input("nombre", sql.NVarChar(200), nombrePersonalizado || `${plantilla.Nombre} - ${asignacion.GrupoNombre}`)

      .input("totalPorcentaje", sql.Decimal(5, 2), 100)

      .query(`

        INSERT INTO dbo.Eval360_EstructuraGrupo

          (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, GrupoClaseId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)

        OUTPUT INSERTED.EstructuraGrupoId

        VALUES

          (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @grupoClaseId, @usuarioId, @plantillaBaseId, @nombre, @totalPorcentaje, 1, SYSDATETIME())

      `);



    const estructuraGrupoId = Number(estructuraResult.recordset[0].EstructuraGrupoId);



    for (const item of componentes) {

      const nombre = normalizeText(item.NombreComponente || item.Descripcion);

      const componenteCatalogoId = inferComponenteCatalogoId(nombre, catalogo);



      await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("componenteCatalogoId", sql.Int, componenteCatalogoId)

        .input("nombre", sql.NVarChar(150), nombre)

        .input("porcentaje", sql.Decimal(5, 2), Number(item.Porcentaje || 0))

        .input("orden", sql.Int, Number(item.Orden || 1))

        .query(`

          INSERT INTO dbo.Eval360_EstructuraGrupoDetalle

            (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)

          VALUES

            (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())

        `);

    }



    const nivelesGlobales = await pool.request()

      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))

      .query(`

        SELECT Nombre, Valor, Orden

        FROM dbo.Eval360_NivelDesempenoGlobal

        WHERE InstitucionId = @institucionId

          AND Activo = 1

        ORDER BY Orden

      `);



    const niveles = nivelesGlobales.recordset.length

      ? nivelesGlobales.recordset

      : [

          { Nombre: "Avanzado", Valor: 3, Orden: 1 },

          { Nombre: "Intermedio", Valor: 2, Orden: 2 },

          { Nombre: "Inicial", Valor: 1, Orden: 3 }

        ];



    for (const nivel of niveles) {

      await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

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



    await transaction.commit();



    await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(plantilla.EvaluacionPlantillaId));

    clearContextCacheByParts({
      institucionId: Number(asignacion.InstitucionId),
      grupoId: Number(grupoId),
      materiaId: Number(materiaId),
      anioLectivoId: Number(anioLectivoId),
      periodoId: Number(periodoId),
      grupoClaseId
    });



    const data = await getEstructuraCompleta(pool, estructuraGrupoId);

    return created(res, { ...data, creada: true }, "Estructura de evaluación creada correctamente");

  } catch (error) {

    try {

      if ((transaction as any)._aborted === false) await transaction.rollback();

    } catch {}

    console.error("Error creando estructura Eval360 desde plantilla:", error);

    return res.status(500).json({ ok: false, message: "No se pudo crear la estructura de evaluación" });

  }

});



router.put("/estructuras/:id/detalles", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    const estructuraGrupoId = toRequiredNumber(req.params.id, "estructuraGrupoId", res);

    if (estructuraGrupoId === null) return;



    const detalles = Array.isArray(req.body.detalles) ? req.body.detalles : [];

    if (!detalles.length) return badRequest(res, "Debés enviar al menos un rubro de evaluación");



    const total = detalles

      .filter((item: any) => item.activo !== false && item.Activo !== false)

      .reduce((sum: number, item: any) => sum + Number(item.porcentaje ?? item.Porcentaje ?? 0), 0);



    if (Number(total.toFixed(2)) !== 100) {

      return badRequest(res, `La estructura suma ${total.toFixed(2)}%. Debe sumar 100%`);

    }



    const estructura = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_EstructuraGrupo

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND Activo = 1

      `);



    const row = estructura.recordset[0];

    if (!row) return badRequest(res, "No se encontró la estructura indicada");



    const asignacion = await getAsignacionPermitida(req, res, {

      grupoId: Number(row.GrupoId),

      materiaId: Number(row.MateriaId),

      anioLectivoId: Number(row.AnioLectivoId),

      periodoId: Number(row.PeriodoId),

      grupoClaseId: Number(row.GrupoClaseId || 0) || null

    });

    if (!asignacion) return;



    await transaction.begin();



    for (const item of detalles) {

      const id = toOptionalNumber(item.estructuraGrupoDetalleId ?? item.EstructuraGrupoDetalleId);

      const componenteCatalogoId = toRequiredNumber(item.componenteCatalogoId ?? item.ComponenteCatalogoId, "componenteCatalogoId", res);

      const nombre = normalizeText(item.nombre ?? item.Nombre);

      const porcentaje = Number(item.porcentaje ?? item.Porcentaje ?? 0);

      const orden = Number(item.orden ?? item.Orden ?? 1);

      const activo = item.activo === false || item.Activo === false ? 0 : 1;



      if (componenteCatalogoId === null) return;

      if (!nombre) return badRequest(res, "Todos los rubros deben tener nombre");



      if (id) {

        await new sql.Request(transaction)

          .input("id", sql.Int, id)

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .input("componenteCatalogoId", sql.Int, componenteCatalogoId)

          .input("nombre", sql.NVarChar(150), nombre)

          .input("porcentaje", sql.Decimal(5, 2), porcentaje)

          .input("orden", sql.Int, orden)

          .input("activo", sql.Bit, activo)

          .query(`

            UPDATE dbo.Eval360_EstructuraGrupoDetalle

            SET ComponenteCatalogoId = @componenteCatalogoId,

                Nombre = @nombre,

                Porcentaje = @porcentaje,

                Orden = @orden,

                Activo = @activo,

                UpdatedAt = SYSDATETIME()

            WHERE EstructuraGrupoDetalleId = @id

              AND EstructuraGrupoId = @estructuraGrupoId

          `);

      } else {

        await new sql.Request(transaction)

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .input("componenteCatalogoId", sql.Int, componenteCatalogoId)

          .input("nombre", sql.NVarChar(150), nombre)

          .input("porcentaje", sql.Decimal(5, 2), porcentaje)

          .input("orden", sql.Int, orden)

          .input("activo", sql.Bit, activo)

          .query(`

            INSERT INTO dbo.Eval360_EstructuraGrupoDetalle

              (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)

            VALUES

              (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, @activo, SYSDATETIME())

          `);

      }

    }



    await new sql.Request(transaction)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("total", sql.Decimal(5, 2), 100)

      .query(`

        UPDATE dbo.Eval360_EstructuraGrupo

        SET TotalPorcentaje = @total,

            UpdatedAt = SYSDATETIME()

        WHERE EstructuraGrupoId = @estructuraGrupoId

      `);



    await transaction.commit();



    await sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(row.PlantillaBaseId || 0));



    const data = await getEstructuraCompleta(pool, estructuraGrupoId);

    return ok(res, data, "Estructura de evaluación actualizada correctamente");

  } catch (error) {

    try {

      if ((transaction as any)._aborted === false) await transaction.rollback();

    } catch {}

    console.error("Error actualizando detalles Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo actualizar la estructura de evaluación" });

  }

});





function parseJsonSeguro(value: any) {

  const raw = String(value || "").trim();

  if (!raw) return null;



  try {

    return JSON.parse(raw);

  } catch {

    return null;

  }

}



function splitTextLines(value: any) {

  if (Array.isArray(value)) {

    return value.map((item) => {

      if (item && typeof item === "object") {

        return String(

          item.Descripcion

          || item.descripcion

          || item.Indicador

          || item.indicador

          || item.indicadorBase

          || item.texto

          || item.nombre

          || ""

        ).trim();

      }



      return String(item || "").trim();

    }).filter(Boolean);

  }



  return String(value || "")

    .split(/\r?\n+/)

    .map((line) => line.trim())

    .filter(Boolean);

}



function uniqueTextList(items: string[]) {

  const map = new Map<string, string>();



  for (const item of items || []) {

    const limpio = String(item || "").trim();

    if (!limpio) continue;



    const key = normalizeKey(limpio);

    if (!map.has(key)) map.set(key, limpio);

  }



  return Array.from(map.values());

}



function construirIndicadoresFallback(indicadoresBase: string[]) {

  return indicadoresBase.map((base) => ({

    indicadorBase: base,

    indicadorAvanzado: base,

    indicadorIntermedio: generarIndicadorIntermedio(base),

    indicadorInicial: generarIndicadorInicial(base)

  }));

}



function generarIndicadorIntermedio(base: string) {

  const texto = String(base || "").trim();

  if (!texto) return "";



  return `${texto} con apoyo parcial de la persona docente, utilizando procedimientos guiados y recursos de apoyo.`;

}



function generarIndicadorInicial(base: string) {

  const texto = String(base || "").trim();

  if (!texto) return "";



  return `${texto} de forma inicial, con apoyo constante, ejemplos modelados y acompañamiento docente.`;

}



async function getEstructuraPermitidaPorId(req: any, res: any, pool: any, estructuraGrupoId: number) {

  const institucionId = getInstitutionId(req, res);

  if (institucionId === null) return null;



  const userId = getUserId(req);

  const request = pool.request()

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .input("institucionId", sql.Int, institucionId)

    .input("usuarioId", sql.Int, userId || null);



  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)

    ? `

      AND (
        EXISTS (

          SELECT 1

          FROM dbo.AsignacionDocente ad

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

            AND ad.UsuarioId = @usuarioId

        )

        OR (
          eg.GrupoClaseId IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM dbo.GrupoClaseDocente gcd
            INNER JOIN dbo.GrupoClase gc ON gc.GrupoClaseId = gcd.GrupoClaseId
            WHERE gcd.GrupoClaseId = eg.GrupoClaseId
              AND gcd.UsuarioId = @usuarioId
              AND gcd.Activo = 1
              AND gc.Activo = 1
              AND gc.InstitucionId = eg.InstitucionId
              AND gc.GrupoIdPrincipal = eg.GrupoId
              AND gc.MateriaId = eg.MateriaId
              AND gc.AnioLectivoId = eg.AnioLectivoId
              AND gc.PeriodoId = eg.PeriodoId
          )
        )
      )

    `

    : "";



  const result = await request.query(`

    SELECT TOP 1 eg.*

    FROM dbo.Eval360_EstructuraGrupo eg

    WHERE eg.EstructuraGrupoId = @estructuraGrupoId

      AND eg.InstitucionId = @institucionId

      AND eg.Activo = 1

      ${filtroProfesor}

  `);



  const row = result.recordset[0];

  if (!row) {

    forbidden(res, "No tenés permisos para usar esta estructura de evaluación");

    return null;

  }



  return row;

}

async function ensureEval360GrupoClaseColumn(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Eval360_EstructuraGrupo', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.GrupoClase', N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.Eval360_EstructuraGrupo', N'GrupoClaseId') IS NULL
    BEGIN
      ALTER TABLE dbo.Eval360_EstructuraGrupo ADD GrupoClaseId INT NULL;
    END;
  `);
}

async function responderSiEstructuraCursoCerrado(res: any, pool: any, estructura: any) {

  const input = {

    institucionId: Number(estructura?.InstitucionId || 0),

    grupoId: Number(estructura?.GrupoId || 0),

    materiaId: Number(estructura?.MateriaId || 0),

    anioLectivoId: Number(estructura?.AnioLectivoId || 0),

    periodoId: Number(estructura?.PeriodoId || 0)

  };

  if (!input.institucionId || !input.grupoId || !input.materiaId || !input.anioLectivoId || !input.periodoId) return false;

  const guard = await assertCierreCursoAbierto(pool, input);

  if (guard.abierto) return false;

  return res.status(409).json({

    ok: false,

    message: "El curso ya esta cerrado. Solicita a Direccion la reapertura para realizar cambios.",

    data: { cierre: guard.cierre || null }

  });

}



async function getIndicadoresPlaneamiento(pool: any, estructura: any, planeamientoId: number) {

  const planeamiento = await pool.request()

    .input("planeamientoId", sql.Int, planeamientoId)

    .input("grupoId", sql.Int, Number(estructura.GrupoId))

    .input("materiaId", sql.Int, Number(estructura.MateriaId))

    .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))

    .input("periodoId", sql.Int, Number(estructura.PeriodoId))

    .query(`

      SELECT TOP 1

        PlaneamientoId,

        Nombre,

        ResultadoIAJson

      FROM dbo.Planeamiento

      WHERE PlaneamientoId = @planeamientoId

        AND GrupoId = @grupoId

        AND MateriaId = @materiaId

        AND AnioLectivoId = @anioLectivoId

        AND PeriodoId = @periodoId

        AND Activo = 1

    `);



  if (!planeamiento.recordset[0]) return { planeamiento: null, indicadores: [] as string[] };



  const indicadoresTabla = await pool.request()

    .input("planeamientoId", sql.Int, planeamientoId)

    .query(`

      SELECT Descripcion

      FROM dbo.PlaneamientoIndicador

      WHERE PlaneamientoId = @planeamientoId

        AND Activo = 1

      ORDER BY PlaneamientoIndicadorId

    `);



  const resultado = parseJsonSeguro(planeamiento.recordset[0].ResultadoIAJson);

  const indicadoresJson = splitTextLines(resultado?.indicadoresEvaluacion);



  const indicadoresDesdeTabla = indicadoresTabla.recordset

    .map((item: any) => String(item.Descripcion || "").trim())

    .filter(Boolean);



  // Regla importante:

  // Eval360 debe usar solo los indicadores de evaluacion visibles en el

  // planeamiento. Los indicadores de semanas pertenecen a la mediacion y no

  // deben convertirse en un rubro adicional sin numeracion.

  // La fuente vigente para regenerar indicadores es la tabla activa del

  // planeamiento. El JSON puede quedar desfasado despues de ediciones manuales.

  const indicadores = indicadoresDesdeTabla.length > 0

    ? uniqueTextList(indicadoresDesdeTabla)

    : uniqueTextList(indicadoresJson);



  return {

    planeamiento: planeamiento.recordset[0],

    indicadores

  };

}



async function getPlantillaIndicadores(req: any, pool: any, plantillaPromptIAId?: number | null) {

  await ensurePromptIATemplateVisibilityColumns(pool);



  const result = await pool.request()

    .input("plantillaPromptIAId", sql.Int, plantillaPromptIAId || null)

    .input("usuarioId", sql.Int, getUserId(req) || null)

    .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)

    .query(`

      SELECT TOP 1

        p.Id,

        p.NombrePlantilla,

        p.IndicacionesSistema,

        p.ContextoBase,

        p.ReglasConstruccion,

        p.EstructuraSalida,

        p.FormatoRespuesta

      FROM dbo.PlantillaPromptIA p

      INNER JOIN dbo.TipoGeneracionIA t

        ON t.Id = p.TipoGeneracionIAId

      WHERE (

          UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%INDICADOR%'

          OR LTRIM(RTRIM(ISNULL(t.Nombre, N''))) COLLATE Latin1_General_100_CI_AI = N'Planeamiento didactico'

        )

        AND t.Activo = 1

        AND p.Activo = 1

        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)

        AND (@plantillaPromptIAId IS NULL OR p.Id = @plantillaPromptIAId)

      ORDER BY

        CASE WHEN @plantillaPromptIAId IS NOT NULL AND p.Id = @plantillaPromptIAId THEN 0 ELSE 1 END,

        p.Id DESC

    `);



  return result.recordset[0] || null;

}



function buildPromptIndicadores(input: {

  plantilla: any;

  indicadoresBase: string[];

  tipoUso: string;

  planeamientoNombre?: string;

  indicacionesDocente?: string;

}) {

  const indicadoresTexto = input.indicadoresBase

    .map((indicador, index) => `${index + 1}. ${indicador}`)

    .join("\n");



  return `

${input.plantilla?.IndicacionesSistema || "Sos un especialista en evaluación educativa del MEP de Costa Rica."}



${input.plantilla?.ContextoBase || ""}



Vas a generar niveles de desempeño para el seguimiento de: ${input.tipoUso}.

Planeamiento base: ${input.planeamientoNombre || "Planeamiento seleccionado"}.



Indicaciones adicionales de la persona docente:

${input.indicacionesDocente || "No se indicaron instrucciones adicionales."}



IMPORTANTE:

Las indicaciones adicionales de la persona docente deben respetarse siempre que no contradigan la estructura técnica solicitada.



Indicadores base del planeamiento:

${indicadoresTexto}



Reglas de construcción:

${input.plantilla?.ReglasConstruccion || ""}



Instrucciones obligatorias:

1. NO generés indicadores nuevos.

2. NO dividás un indicador base en varios indicadores.

3. NO usés la sección "Estructura de salida" de la plantilla para crear más filas.

4. La cantidad de objetos en el arreglo "indicadores" debe ser EXACTAMENTE ${input.indicadoresBase.length}.

5. El objeto 1 corresponde al indicador base 1, el objeto 2 al indicador base 2, y así sucesivamente.

6. El indicador avanzado debe ser exactamente el indicador base original.

7. El indicador intermedio debe describir un desempeño parcial, observable y medible.

8. El indicador inicial debe describir un desempeño básico o inicial, observable y medible.

9. Cada indicador debe estar redactado en tercera persona singular.

10. Cada indicador debe contener una sola conducta observable.

11. Usá estructura: acción + conocimiento + condición.

12. No usés markdown.

13. No agregués explicaciones fuera del JSON.



Formato de salida:

Devolvé SOLO JSON válido con esta estructura exacta:



{

  "indicadores": [

    {

      "indicadorBase": "Texto original",

      "indicadorAvanzado": "Mismo texto original",

      "indicadorIntermedio": "Texto generado",

      "indicadorInicial": "Texto generado"

    }

  ]

}



Estructura de salida de la plantilla, usada SOLO como guía de redacción, no como permiso para agregar filas:

${input.plantilla?.EstructuraSalida || ""}



Formato de respuesta de la plantilla:

${input.plantilla?.FormatoRespuesta || ""}



Recordatorio final obligatorio:

El JSON debe traer exactamente ${input.indicadoresBase.length} objetos en "indicadores".

`;

}



async function callOpenAiIndicadores(prompt: string) {

  const apiKey = getOpenAiApiKey();

  if (!apiKey) return null;

  const model = getOpenAiEvalModel();

  const body: Record<string, any> = {

    model,

    input: prompt,

    max_output_tokens: 8000

  };

  if (!isGpt5FamilyModel(model)) {

    body.temperature = 0.25;

  }



  try {

    const response = await fetch("https://api.openai.com/v1/responses", {

      method: "POST",

      headers: {

        "Authorization": `Bearer ${apiKey}`,

        "Content-Type": "application/json"

      },

      body: JSON.stringify(body)

    });



    if (!response.ok) {

      const text = await response.text();

      console.error("Error OpenAI Eval360 indicadores:", response.status, text.slice(0, 1000));

      return null;

    }



    const data: any = await response.json();

    const text = extractOpenAiResponseText(data);

    if (!text) return null;



    try {

      return JSON.parse(text);

    } catch {

      const match = text.match(/\{[\s\S]*\}/);

      if (!match) return null;



      try {

        return JSON.parse(match[0]);

      } catch (parseError) {

        console.error("Respuesta OpenAI Eval360 indicadores no es JSON válido:", parseError);

        return null;

      }

    }

  } catch (error) {

    console.error("No se pudo consultar OpenAI Eval360 indicadores; se usará fallback local:", error);

    return null;

  }

}



function normalizarIndicadoresGenerados(resultado: any, indicadoresBase: string[]) {

  const generados = Array.isArray(resultado?.indicadores) ? resultado.indicadores : [];

  const fallback = construirIndicadoresFallback(indicadoresBase);



  return indicadoresBase.map((base, index) => {

    const candidato = generados[index] || generados.find((item: any) =>

      normalizeKey(item?.indicadorBase) === normalizeKey(base)

    ) || fallback[index];



    return {

      indicadorBase: base,

      indicadorAvanzado: String(candidato?.indicadorAvanzado || base).trim() || base,

      indicadorIntermedio: String(candidato?.indicadorIntermedio || generarIndicadorIntermedio(base)).trim(),

      indicadorInicial: String(candidato?.indicadorInicial || generarIndicadorInicial(base)).trim()

    };

  });

}

function normalizarNombreSinPlaneamiento(value: any) {
  const detalle = normalizeText(value)
    .replace(/^sin\s+planeamiento\s*-?\s*/i, "")
    .trim();
  return `Sin Planeamiento${detalle ? ` - ${detalle}` : " - Habilidades"}`.slice(0, 200);
}

function buildPromptIndicadoresBaseDesdeHabilidades(input: {
  plantilla: any;
  habilidades: any[];
  cantidadPorHabilidad: number;
  materiaNombre: string;
  grado: string;
  meses: string[];
  nombre: string;
  indicacionesDocente?: string;
}) {
  const habilidadesTexto = input.habilidades.map((habilidad, index) => [
    `${index + 1}.`,
    habilidad.Mes ? `Mes: ${habilidad.Mes}.` : "",
    habilidad.Area ? `Area: ${habilidad.Area}.` : "",
    habilidad.NumeroHabilidad ? `Codigo: ${habilidad.NumeroHabilidad}.` : "",
    `Habilidad: ${habilidad.DescripcionHabilidad || ""}`
  ].filter(Boolean).join(" ")).join("\n");
  const cantidadTotal = input.habilidades.length * input.cantidadPorHabilidad;

  return `
${input.plantilla?.IndicacionesSistema || "Sos un especialista en evaluacion educativa del MEP de Costa Rica."}

${input.plantilla?.ContextoBase || ""}

Vas a crear indicadores base de evaluacion a partir de habilidades oficiales.

Nombre del conjunto: ${input.nombre}
Materia: ${input.materiaNombre}
Grado: ${input.grado || "No indicado"}
Meses seleccionados: ${input.meses.length ? input.meses.join(", ") : "Segun habilidades seleccionadas"}
Cantidad de indicadores por habilidad: ${input.cantidadPorHabilidad}
Cantidad total obligatoria de indicadores: ${cantidadTotal}

Indicaciones adicionales de la persona docente:
${input.indicacionesDocente || "No se indicaron instrucciones adicionales."}

Habilidades seleccionadas:
${habilidadesTexto}

Reglas de construccion:
${input.plantilla?.ReglasConstruccion || ""}

Instrucciones obligatorias:
1. Genera exactamente ${input.cantidadPorHabilidad} indicador(es) por cada habilidad.
2. La cantidad total de objetos en "indicadores" debe ser exactamente ${cantidadTotal}.
3. Cada indicador debe responder directamente a una habilidad seleccionada.
4. Conserva el mismo idioma predominante de las habilidades seleccionadas.
5. Cada indicador debe ser observable, medible y redactado en tercera persona singular.
6. Usa estructura: accion + conocimiento + condicion.
7. No uses markdown.
8. No agregues explicaciones fuera del JSON.

Formato de salida:
Devolve SOLO JSON valido con esta estructura exacta:

{
  "indicadores": [
    {
      "habilidadId": 123,
      "indicadorBase": "Texto del indicador base"
    }
  ]
}

Estructura de salida de la plantilla, usada como guia de redaccion:
${input.plantilla?.EstructuraSalida || ""}

Formato de respuesta de la plantilla:
${input.plantilla?.FormatoRespuesta || ""}
`;
}

function normalizarIndicadoresBaseDesdeHabilidades(resultado: any, habilidades: any[], cantidadPorHabilidad: number) {
  const generados = Array.isArray(resultado?.indicadores) ? resultado.indicadores : [];
  const esperados = habilidades.flatMap((habilidad) =>
    Array.from({ length: cantidadPorHabilidad }, (_, index) => ({ habilidad, index }))
  );
  const usados = new Set<number>();

  return uniqueTextList(esperados.map(({ habilidad, index }, expectedIndex) => {
    const habilidadId = Number(habilidad?.PlaneamientoHabilidadId || 0);
    let candidatoIndex = generados.findIndex((item: any, currentIndex: number) =>
      !usados.has(currentIndex)
      && Number(item?.habilidadId || item?.PlaneamientoHabilidadId || 0) === habilidadId
    );
    if (candidatoIndex < 0 && generados[expectedIndex]) candidatoIndex = expectedIndex;
    const candidato = candidatoIndex >= 0 ? generados[candidatoIndex] : null;
    if (candidatoIndex >= 0) usados.add(candidatoIndex);

    const textoGenerado = normalizeText(
      candidato?.indicadorBase
      || candidato?.descripcion
      || candidato?.indicador
      || candidato?.texto
    );
    if (textoGenerado) return textoGenerado;

    const descripcion = normalizeText(habilidad?.DescripcionHabilidad) || "la habilidad seleccionada";
    const sufijo = cantidadPorHabilidad > 1 ? ` (${index + 1})` : "";
    return `Demuestra dominio de ${descripcion}${sufijo}.`;
  })).slice(0, Math.max(1, habilidades.length * cantidadPorHabilidad));
}

async function getOrCreateEstructuraIndicadoresHabilidades(executor: any, params: {
  institucionId: number;
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
  usuarioId?: number | null;
  plantillaBaseId?: number | null;
  nombre: string;
}) {
  const existente = await new sql.Request(executor)
    .input("institucionId", sql.Int, params.institucionId)
    .input("grupoId", sql.Int, params.grupoId)
    .input("materiaId", sql.Int, params.materiaId)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .input("periodoId", sql.Int, params.periodoId)
    .query(`
      SELECT TOP 1 EstructuraGrupoId, GrupoId, PlantillaBaseId
      FROM dbo.Eval360_EstructuraGrupo
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND Activo = 1
      ORDER BY EstructuraGrupoId DESC
    `);

  if (existente.recordset[0]) return existente.recordset[0];

  const creada = await new sql.Request(executor)
    .input("institucionId", sql.Int, params.institucionId)
    .input("grupoId", sql.Int, params.grupoId)
    .input("materiaId", sql.Int, params.materiaId)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .input("periodoId", sql.Int, params.periodoId)
    .input("usuarioId", sql.Int, params.usuarioId || null)
    .input("plantillaBaseId", sql.Int, params.plantillaBaseId || null)
    .input("nombre", sql.NVarChar(200), `Estructura de evaluacion - ${params.nombre}`)
    .query(`
      INSERT INTO dbo.Eval360_EstructuraGrupo
        (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
      OUTPUT INSERTED.EstructuraGrupoId, INSERTED.GrupoId, INSERTED.PlantillaBaseId
      VALUES
        (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, 100, 1, SYSDATETIME())
    `);

  const estructura = creada.recordset[0];
  if (!estructura) return null;

  await new sql.Request(executor)
    .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))
    .input("institucionId", sql.Int, params.institucionId)
    .query(`
      INSERT INTO dbo.Eval360_NivelDesempenoGrupo
        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
      SELECT
        @estructuraGrupoId,
        Nombre,
        Valor,
        Orden,
        Activo
      FROM dbo.Eval360_NivelDesempenoGlobal
      WHERE InstitucionId = @institucionId
        AND Activo = 1
      ORDER BY Orden
    `);

  if (params.plantillaBaseId) {
    await sincronizarEstructuraConPlantilla(executor, Number(estructura.EstructuraGrupoId), Number(params.plantillaBaseId));
  }

  return estructura;
}



router.get("/plantillas-ia-indicadores", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const pool = await getPool();



    const cacheKey = `eval360.plantillas-ia-indicadores|u:${getUserId(req) || 0}|adm:${isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0}`;

    const cached = bootstrapCache.get(cacheKey);

    if (cached && Date.now() - cached.at <= BOOTSTRAP_CACHE_TTL_MS) {

      return ok(res, cached.data);

    }



    const request = pool.request()

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0);



    const result = await request.query(`

      SELECT

        p.Id,

        p.TipoGeneracionIAId,

        p.NombrePlantilla,

        p.IndicacionesSistema,

        p.ContextoBase,

        p.ReglasConstruccion,

        p.EstructuraSalida,

        p.FormatoRespuesta,

        p.UsuarioCreadorId,

        p.EsPublica,

        p.Activo,

        t.Nombre AS TipoGeneracionIANombre

      FROM dbo.PlantillaPromptIA p

      INNER JOIN dbo.TipoGeneracionIA t

        ON t.Id = p.TipoGeneracionIAId

      WHERE (

          UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%INDICADOR%'

          OR LTRIM(RTRIM(ISNULL(t.Nombre, N''))) COLLATE Latin1_General_100_CI_AI = N'Planeamiento didactico'

        )

        AND t.Activo = 1

        AND p.Activo = 1

        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)

      ORDER BY

        CASE WHEN LTRIM(RTRIM(ISNULL(t.Nombre, N''))) COLLATE Latin1_General_100_CI_AI = N'Planeamiento didactico' THEN 0 ELSE 1 END,

        p.NombrePlantilla

    `);



    bootstrapCache.set(cacheKey, { at: Date.now(), data: result.recordset });

    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error listando plantillas IA de indicadores:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas IA de indicadores" });

  }

});



router.get("/plantillas-ia-examenes", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const pool = await getPool();

    const tiposExamen = await pool.request().query(`

      SELECT Id

      FROM dbo.TipoGeneracionIA

      WHERE UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%EXAM%'

         OR UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%PRUEBA%'

    `);

    const tipoIds = (tiposExamen.recordset || []).map((r: any) => Number(r.Id)).filter((n: number) => Number.isFinite(n) && n > 0);

    const request = pool.request()

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)

      .input("tipoId1", sql.Int, tipoIds[0] || null)

      .input("tipoId2", sql.Int, tipoIds[1] || null)

      .input("tipoId3", sql.Int, tipoIds[2] || null)

      .input("tipoId4", sql.Int, tipoIds[3] || null);

    const result = await request.query(`

      SELECT

        p.Id,

        p.TipoGeneracionIAId,

        p.NombrePlantilla,

        p.IndicacionesSistema,

        p.ContextoBase,

        p.ReglasConstruccion,

        p.EstructuraSalida,

        p.FormatoRespuesta,

        p.UsuarioCreadorId,

        p.EsPublica,

        p.Activo

      FROM dbo.PlantillaPromptIA p

      INNER JOIN dbo.TipoGeneracionIA t ON t.Id = p.TipoGeneracionIAId

      WHERE (

          p.TipoGeneracionIAId IN (@tipoId1, @tipoId2, @tipoId3, @tipoId4)

          OR UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%EXAM%'

          OR UPPER(LTRIM(RTRIM(ISNULL(t.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE N'%PRUEBA%'

        )

        AND p.Activo = 1

        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)

      ORDER BY p.FechaCreacion DESC, p.Id DESC

    `);

    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error listando plantillas IA de exámenes:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas IA de exámenes" });

  }

});



router.get("/examenes-ia", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const estructuraGrupoId = toRequiredNumber(req.query.estructuraGrupoId, "estructuraGrupoId", res);

    if (!estructuraGrupoId) return;

    const pool = await getPool();

    const docenteSesionNombre = await getSessionTeacherDisplayName(pool, req);

    await ensureEval360ExamenIATable(pool);

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    await syncExamenIaDesdeGrupoHermanoSiFalta(pool, req, estructuraGrupoId);

    const result = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .query(`

        SELECT *

        FROM dbo.Eval360_ExamenIAGenerado

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND Activo = 1

        ORDER BY ExamenIAGeneradoId DESC

      `);

    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error listando exámenes IA:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron listar los exámenes IA" });

  }

});



router.post("/examenes-ia/generar", examenIaUpload, async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    if (!getOpenAiApiKey()) {

      console.error("OpenAI Eval360 examenes: OPENAI_API_KEY no esta configurada en el backend.");

      return res.status(503).json({

        ok: false,

        message: "La generacion de examenes con IA no esta disponible porque falta configurar OPENAI_API_KEY en el backend."

      });

    }

    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const actividadIdTabla = toRequiredNumber(req.body.actividadIdTabla, "actividadIdTabla", res);

    const plantillaPromptIAId = toOptionalNumber(req.body.plantillaPromptIAId);

    if (!estructuraGrupoId || !actividadIdTabla) return;



    const bodyAny = req.body || {};

    const rawSecciones = bodyAny.seccionGrupoIds;

    const seccionGrupoIds = (Array.isArray(rawSecciones) ? rawSecciones : (rawSecciones ? [rawSecciones] : []))

      .map((x: any) => Number(x))

      .filter((x: number) => Number.isFinite(x) && x > 0);

    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];

    const formatoSalidaFile = files.find((f) => String(f.fieldname) === "formatoSalidaArchivo") || null;

    const documentoApoyoFile = files.find((f) => String(f.fieldname) === "documentoApoyoArchivo") || null;

    if (formatoSalidaFile && !/\.docx$/i.test(String(formatoSalidaFile.originalname || ""))) {

      return badRequest(res, "El archivo de formato de salida debe ser .docx");

    }

    const tipoColegio = normalizeText(bodyAny.tipoColegio);

    const fuenteWord = normalizeText(bodyAny.fuenteWord) || "Calibri";

    const tamanoWordPt = Math.max(8, Math.min(18, Math.round(Number(bodyAny.tamanoWord || 11) || 11)));

    const indicaciones = normalizeText(bodyAny.indicaciones);

    const documentoApoyoNombre = normalizeText(bodyAny.documentoApoyoNombre || documentoApoyoFile?.originalname || "");

    const formatoSalidaNombre = normalizeText(bodyAny.formatoSalidaNombre || formatoSalidaFile?.originalname || "");

    const nombreSolicitado = normalizeText(bodyAny.nombre);

    const [documentoApoyoTexto, formatoSalidaTexto] = await Promise.all([
      extractUploadedText(documentoApoyoFile),
      extractUploadedText(formatoSalidaFile)
    ]);

    const documentoApoyoTextoCompacto = compactPromptText(documentoApoyoTexto, 5000);

    const formatoSalidaTextoCompacto = compactPromptText(formatoSalidaTexto, 5000);



    const pool = await getPool();

    const docenteSesionNombre = await getSessionTeacherDisplayName(pool, req);

    await ensureEval360ExamenIATable(pool);

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;



    const contexto = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .query(`

        SELECT TOP 1

          eg.EstructuraGrupoId,

          eg.InstitucionId,

          eg.GrupoId,

          eg.MateriaId,

          eg.AnioLectivoId,

          eg.PeriodoId,

          g.Nombre AS GrupoNombre,

          g.Nivel AS Grado,

          m.Nombre AS Materia,

          al.Nombre AS AnioLectivo,

          p.Nombre AS Periodo,

          i.Nombre AS CentroEducativo,

          CAST(NULL AS NVARCHAR(250)) AS DireccionRegional,

          CAST(NULL AS NVARCHAR(120)) AS Circuito

        FROM dbo.Eval360_EstructuraGrupo eg

        INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId

        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId

        INNER JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId

        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId

        WHERE eg.EstructuraGrupoId = @estructuraGrupoId

      `);

    const ctx = contexto.recordset[0];

    if (!ctx) return badRequest(res, "No se encontró el contexto de la estructura");



    const plantillaReq = pool.request()

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .input("esAdmin", sql.Bit, isSuperAdmin(req) || isInstitutionAdmin(req) ? 1 : 0)

      .input("plantillaPromptIAId", sql.Int, plantillaPromptIAId);

    const plantillaResult = await plantillaReq.query(`

      SELECT TOP 1 p.*

      FROM dbo.PlantillaPromptIA p

      WHERE p.Activo = 1

        AND (@plantillaPromptIAId IS NULL OR p.Id = @plantillaPromptIAId)

        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)

      ORDER BY CASE WHEN @plantillaPromptIAId IS NOT NULL AND p.Id = @plantillaPromptIAId THEN 0 ELSE 1 END, p.Id DESC

    `);

    const plantilla = plantillaResult.recordset[0];

    if (!plantilla) return badRequest(res, "No se encontró una plantilla IA de exámenes");

    const plantillaEstructuraCompacta = compactPromptText(plantilla?.EstructuraSalida, 6000);

    const plantillaFormatoRespuestaCompacta = compactPromptText(plantilla?.FormatoRespuesta, 3000);



    const indicadoresResult = await pool.request()

      .input("actividadId", sql.Int, actividadIdTabla)

      .query(`

        SELECT

          ig.IndicadorGrupoId,

          ig.PlaneamientoId,

          p.Nombre AS PlaneamientoNombre,

          ig.IndicadorBase,

          ig.IndicadorAvanzado,

          ig.IndicadorIntermedio,

          ig.IndicadorInicial,

          ai.Puntos,

          ai.NumeroLecciones,

          ai.DetalleItemsJson

        FROM dbo.Eval360_ActividadIndicador ai

        INNER JOIN dbo.Eval360_IndicadorGrupo ig ON ig.IndicadorGrupoId = ai.IndicadorGrupoId

        LEFT JOIN dbo.Planeamiento p ON p.PlaneamientoId = ig.PlaneamientoId

        WHERE ai.ActividadId = @actividadId

          AND ISNULL(ai.Activo, 1) = 1

          AND ISNULL(ig.Activo, 1) = 1

      `);

    const indicadores = indicadoresResult.recordset || [];

    if (!indicadores.length) return badRequest(res, "La tabla seleccionada no tiene indicadores asignados");

    const tiposResumen = getDetalleTipoStats(indicadores);

    const tiposActivos = Object.entries(tiposResumen)

      .filter(([, v]) => Number(v.cantidad || 0) > 0)

      .map(([k, v]) => ({

        tipoItem: k,

        cantidad: Math.round(Number(v.cantidad || 0)),

        subtotalPuntos: Math.round(Number(v.subtotal || 0)),

        valorPorPregunta: Number(v.cantidad || 0) > 0 ? Math.round(Number(v.subtotal || 0) / Number(v.cantidad || 1)) : 0

      }));

    const totalPuntosEsperado = Math.round(tiposActivos.reduce((acc, t) => acc + Number(t.subtotalPuntos || 0), 0));

    const totalLeccionesEsperado = Math.round(

      indicadores.reduce((acc: number, it: any) => acc + Number(it?.NumeroLecciones || 0), 0)

    );



    const seccionesTexto = seccionGrupoIds.length

      ? (() => {

          const q = seccionGrupoIds.map((_, idx) => `@g${idx}`).join(",");

          const reqSec = pool.request();

          seccionGrupoIds.forEach((idSec, idx) => reqSec.input(`g${idx}`, sql.Int, Number(idSec)));

          return { query: q, request: reqSec };

        })()

      : null;

    let seccionesTextoFinal = String(ctx.GrupoNombre || "");

    if (seccionesTexto) {

      const secResult = await seccionesTexto.request.query(`

        SELECT GrupoId, Nombre

        FROM dbo.Grupo

        WHERE GrupoId IN (${seccionesTexto.query})

      `);

      const byId = new Map<number, string>((secResult.recordset || []).map((row: any) => [Number(row.GrupoId), String(row.Nombre || "").trim()]));

      const ordered = seccionGrupoIds.map((idSec) => byId.get(Number(idSec))).filter((item) => String(item || "").trim().length > 0);

      if (ordered.length) seccionesTextoFinal = ordered.join(", ");

    }



    const planeamientoIds = Array.from(new Set(

      indicadores

        .map((item: any) => Number(item.PlaneamientoId || 0))

        .filter((id: number) => Number.isFinite(id) && id > 0)

    ));

    let planeamientosRelacionados: any[] = [];

    if (planeamientoIds.length) {

      const planeamientoReq = pool.request();

      const placeholders = planeamientoIds.map((_, idx) => `@pid${idx}`).join(",");

      planeamientoIds.forEach((id, idx) => planeamientoReq.input(`pid${idx}`, sql.Int, id));

      const planeamientoResult = await planeamientoReq.query(`

        SELECT PlaneamientoId, Nombre, ResultadoIAJson

        FROM dbo.Planeamiento

        WHERE PlaneamientoId IN (${placeholders})

      `);

      planeamientosRelacionados = planeamientoResult.recordset || [];

    }

    const habilidadesPlaneamiento = Array.from(new Set(

      planeamientosRelacionados.flatMap((row: any) => summarizePlaneamientoResultado(row?.ResultadoIAJson))

    ));

    const indicadoresDetalladosTexto = indicadores.map((it: any, index: number) => {

      const tipos = summarizeDetalleItems(it.DetalleItemsJson);

      return [

        `${index + 1}. Planeamiento: ${normalizeText(it.PlaneamientoNombre) || "Sin planeamiento"}`,

        `   Indicador base: ${normalizeText(it.IndicadorBase)}`,

        normalizeText(it.IndicadorAvanzado) ? `   Nivel avanzado: ${normalizeText(it.IndicadorAvanzado)}` : "",

        normalizeText(it.IndicadorIntermedio) ? `   Nivel intermedio: ${normalizeText(it.IndicadorIntermedio)}` : "",

        normalizeText(it.IndicadorInicial) ? `   Nivel inicial: ${normalizeText(it.IndicadorInicial)}` : "",

        `   Lecciones asociadas: ${Number(it.NumeroLecciones || 0)}`,

        `   Puntaje total del indicador: ${Number(it.Puntos || 0)}`,

        tipos.length ? `   Tipos de item obligatorios: ${tipos.join(" | ")}` : ""

      ].filter(Boolean).join("\n");

    }).join("\n\n");

    const reglasFormatoExtra = formatoSalidaFile

      ? `Reglas obligatorias de formato:

- Usá el archivo DOCX de salida como formato base obligatorio.

- No alterés encabezado, membrete, tablas fijas ni orden del documento.

- No agregués secciones nuevas.

- Solo completá campos variables del examen.

- Si el archivo de salida tiene espacios, tablas o apartados por tipo de pregunta, respetalos y llenalos con el contenido correspondiente.`

      : `Reglas obligatorias de formato:

- Construí una salida limpia y estructurada para examen sin agregar texto administrativo ni secciones irrelevantes.`;



    const prompt = `

${normalizeText(plantilla.IndicacionesSistema) || "Sos un asistente experto en construcción de exámenes de Matemática."}

${normalizeText(plantilla.ContextoBase)}

${normalizeText(plantilla.ReglasConstruccion)}

${reglasFormatoExtra}



Plantilla IA seleccionada y obligatoria:

- Nombre: ${normalizeText(plantilla.NombrePlantilla) || "Plantilla IA de examen"}

- Estructura de salida obligatoria:

${plantillaEstructuraCompacta || "No definida"}

- Formato de respuesta obligatorio:

${plantillaFormatoRespuestaCompacta || "Devolver unicamente JSON valido"}



Reglas obligatorias de notación matemática:

- No usar LaTeX en la salida final.

- Escribir expresiones en formato legible para Word (ejemplo: x², v(16), (a+b)/c, sen(x), log(x)).

- Evitar símbolos rotos o comandos técnicos.



Encabezado institucional (obligatorio):

- Dirección Regional: ${normalizeText(ctx.DireccionRegional)}

- Circuito: ${normalizeText(ctx.Circuito)}

- Centro Educativo: ${normalizeText(ctx.CentroEducativo)}

- Materia: ${normalizeText(ctx.Materia)}

- Grado: ${normalizeText(ctx.Grado)}

- Periodo: ${normalizeText(ctx.Periodo)}

- Tipo de colegio: ${tipoColegio || "No indicado"}

- Secciones: ${seccionesTextoFinal}



Habilidades, aprendizajes e indicadores pedagógicos recuperados del planeamiento (uso obligatorio):

${habilidadesPlaneamiento.length ? habilidadesPlaneamiento.map((item, i) => `${i + 1}. ${item}`).join("\n") : "No se encontraron habilidades estructuradas; usá los indicadores y aprendizajes del planeamiento disponible."}



Indicadores y especificación detallada para construir el examen:

${indicadoresDetalladosTexto}



Tabla de especificaciones (FUENTE PRIORITARIA Y OBLIGATORIA):

- Total de lecciones esperadas: ${totalLeccionesEsperado}

- Total de puntos esperados: ${totalPuntosEsperado}

- Distribución por tipo de ítem (exacta):

${tiposActivos.map((t) => `  - ${t.tipoItem}: ${t.cantidad} pregunta(s), ${t.valorPorPregunta} punto(s) c/u, subtotal ${t.subtotalPuntos}`).join("\n")}

- No cambies esta distribucion. Debe coincidir exactamente con la tabla de especificaciones.



Indicaciones adicionales de la persona docente (obligatorias si existen):

${indicaciones || "No se indicaron"}



Regla obligatoria sobre indicaciones docentes:

- Si la persona docente escribio indicaciones adicionales, debes cumplirlas de forma mandatoria en la redaccion y formato de las preguntas.

- No las trates como sugerencias.

- Si una indicacion pide un formato especifico dentro del enunciado, debes aplicarlo exactamente.

- Si no se indicaron instrucciones adicionales, no inventes restricciones nuevas.



Documento de apoyo adjunto:

${documentoApoyoNombre || "No adjuntado"}



Contenido extraído del documento de apoyo (si existe, uso obligatorio):

${documentoApoyoTextoCompacto || "No se pudo extraer contenido o no fue adjuntado"}



Formato de salida solicitado:

${formatoSalidaNombre || normalizeText(plantilla.FormatoRespuesta) || "JSON"}



Contenido extraído de la plantilla/formato de salida (si existe, uso obligatorio):

${formatoSalidaTextoCompacto || "No se pudo extraer contenido o no fue adjuntado"}



Devolvé contenido de examen listo para revisión docente.

Cada pregunta debe corresponder a una habilidad o aprendizaje esperado y a uno de los indicadores listados.

No inventes tipos de item fuera de los definidos por la tabla.

La suma de puntos por pregunta debe coincidir exactamente con la tabla de especificaciones.



Salida obligatoria en JSON válido (sin markdown), con esta estructura:

{

  "items": [

    {

      "numero": 1,

      "tipoItem": "SR|RC|C|I|RE|RP|RR|RCAS|PE",

      "aprendizajeEsperado": "",

      "indicadorEvaluacion": "",

      "enunciado": "",

      "opciones": [],

      "respuestaCorrecta": "",

      "criterioCorreccion": "",

      "puntaje": 0

    }

  ],

  "validacion": {

    "totalItemsCalculado": 0,

    "totalPuntosCalculado": 0,

    "totalPuntosEsperado": ${totalPuntosEsperado},

    "coincideTotalPuntos": true,

    "advertencias": []

  }

}

`;



    const promptCompacto = `

${normalizeText(plantilla.IndicacionesSistema) || "Sos un asistente experto en construccion de examenes."}

Construi un examen editable en JSON valido, sin markdown.

Usa obligatoriamente esta plantilla IA: ${normalizeText(plantilla.NombrePlantilla) || "Plantilla IA de examen"}.

Materia: ${normalizeText(ctx.Materia)}

Grado: ${normalizeText(ctx.Grado)}

Periodo: ${normalizeText(ctx.Periodo)}

Secciones: ${seccionesTextoFinal}

Tipo de colegio: ${tipoColegio || "No indicado"}



Estructura de salida obligatoria:

${plantillaEstructuraCompacta || "No definida"}



Formato de respuesta obligatorio:

${plantillaFormatoRespuestaCompacta || "Devolver unicamente JSON valido"}



Indicadores y habilidades obligatorias:

${indicadoresDetalladosTexto}

${habilidadesPlaneamiento.length ? `\nHabilidades recuperadas del planeamiento:\n${habilidadesPlaneamiento.map((item, i) => `${i + 1}. ${item}`).join("\n")}` : ""}



Tabla de especificaciones obligatoria:

- Total de lecciones esperadas: ${totalLeccionesEsperado}

- Total de puntos esperados: ${totalPuntosEsperado}

${tiposActivos.map((t) => `- ${t.tipoItem}: ${t.cantidad} pregunta(s), ${t.valorPorPregunta} punto(s) c/u, subtotal ${t.subtotalPuntos}`).join("\n")}



Indicaciones docentes:

${indicaciones || "No se indicaron"}



Regla obligatoria sobre indicaciones docentes:

- Si existen indicaciones de la persona docente, debes obedecerlas de forma mandatoria.

- No las resumas ni las sustituyas por una interpretacion mas general.

- Si no existen, no inventes indicaciones nuevas.



Usa como apoyo este resumen del archivo de salida y del documento adjunto, sin copiar basura de formato:

${formatoSalidaTextoCompacto || "Sin formato extraido"}

${documentoApoyoTextoCompacto || "Sin documento de apoyo extraido"}



No cambies la distribucion de tipos ni el puntaje total. Devolve un JSON valido con:

{

  "items": [

    {

      "numero": 1,

      "tipoItem": "SR|RC|C|I|RE|RP|RR|RCAS|PE",

      "aprendizajeEsperado": "",

      "indicadorEvaluacion": "",

      "enunciado": "",

      "opciones": [],

      "respuestaCorrecta": "",

      "criterioCorreccion": "",

      "puntaje": 0

    }

  ],

  "validacion": {

    "totalItemsCalculado": 0,

    "totalPuntosCalculado": 0,

    "totalPuntosEsperado": ${totalPuntosEsperado},

    "coincideTotalPuntos": true,

    "advertencias": []

  }

}

`.trim();



    const promptUltraEstricto = `

Sos un asistente experto en construccion de pruebas escritas de Matematica para secundaria en Costa Rica.

Debes construir preguntas reales, concretas y resolubles por estudiantes. Esta prohibido devolver texto generico o de relleno.



Prohibiciones absolutas:

- No escribir frases como "Opcion A vinculada con..."

- No escribir frases como "Lee la situacion 1..." sin desarrollar una situacion matematica real

- No devolver placeholders, plantillas vacias ni explicaciones metatecnicas

- No inventar cantidad de paginas del examen



Obligaciones:

- Usa exactamente la distribucion de la tabla de especificaciones

- Cada pregunta debe ser concreta, comprensible y tener sentido matematico real

- Si el tipo es SR, usa exactamente 3 opciones y una sola correcta

- Redacta numeros, operaciones, expresiones o mini contextos reales segun el indicador

- No agregues tipos de item con cantidad 0

- Devuelve unicamente JSON valido

- Si la persona docente escribio indicaciones adicionales, debes aplicarlas de forma mandatoria y literal cuando correspondan al formato o redaccion solicitados

- Si no hay indicaciones adicionales de la persona docente, no inventes ninguna



Contexto:

- Materia: ${normalizeText(ctx.Materia)}

- Grado: ${normalizeText(ctx.Grado)}

- Periodo: ${normalizeText(ctx.Periodo)}

- Secciones: ${seccionesTextoFinal}

- Nombre de la prueba: ${nombreSolicitado || "Prueba escrita"}



Indicadores obligatorios:

${indicadoresDetalladosTexto}



Distribucion exacta:

${tiposActivos.map((t) => `- ${t.tipoItem}: ${t.cantidad} pregunta(s), ${t.valorPorPregunta} punto(s) c/u, subtotal ${t.subtotalPuntos}`).join("\n")}



Materia vista y apoyos:

${documentoApoyoTextoCompacto || "No se adjunto documento de apoyo."}



Restricciones del formato:

${formatoSalidaTextoCompacto || "Usar solo contenido evaluativo y respetar el machote Word."}



Indicaciones obligatorias de la persona docente:

${indicaciones || "No se indicaron"}



Estructura de salida obligatoria:

{

  "items": [

    {

      "numero": 1,

      "tipoItem": "SR|RC|C|I|RE|RP|RR|RCAS|PE",

      "aprendizajeEsperado": "",

      "indicadorEvaluacion": "",

      "enunciado": "",

      "opciones": [],

      "respuestaCorrecta": "",

      "criterioCorreccion": "",

      "puntaje": 0

    }

  ],

  "validacion": {

    "totalItemsCalculado": 0,

    "totalPuntosCalculado": 0,

    "totalPuntosEsperado": ${totalPuntosEsperado},

    "coincideTotalPuntos": true,

    "advertencias": []

  }

}

`.trim();



    const openAiAttempts: OpenAiExamAttemptDebug[] = [];

    let respuestaIA = await callOpenAiGeneric(prompt, openAiAttempts);

    let respuestaIATexto = String(respuestaIA || "").trim();

    if (!respuestaIATexto) {

      console.error("OpenAI Eval360 examenes: reintentando con prompt compacto", JSON.stringify({

        actividadIdTabla,

        estructuraGrupoId,

        promptChars: prompt.length,

        promptCompactoChars: promptCompacto.length,

        documentoApoyoChars: documentoApoyoTexto.length,

        formatoSalidaChars: formatoSalidaTexto.length

      }));

      respuestaIA = await callOpenAiGeneric(promptCompacto, openAiAttempts);

      respuestaIATexto = String(respuestaIA || "").trim();

    }

    let parsed = parseExamPayload(respuestaIATexto);

    if (!respuestaIATexto || isWeakExamPayload(parsed.items)) {

      console.error("OpenAI Eval360 examenes: reintentando con prompt ultra estricto", JSON.stringify({

        actividadIdTabla,

        estructuraGrupoId,

        hadText: Boolean(respuestaIATexto),

        weakPayload: isWeakExamPayload(parsed.items),

        firstItem: summarizeExamItemForLog(Array.isArray(parsed.items) ? parsed.items[0] : null),

        rawPreview: compactPromptText(respuestaIATexto, 500)

      }));

      respuestaIA = await callOpenAiGeneric(promptUltraEstricto, openAiAttempts);

      respuestaIATexto = String(respuestaIA || "").trim();

      parsed = parseExamPayload(respuestaIATexto);

    }

    if (!respuestaIATexto || !Array.isArray(parsed.items) || !parsed.items.length) {

      console.error("OpenAI Eval360 examenes: reintentando con json estricto", JSON.stringify({

        actividadIdTabla,

        estructuraGrupoId,

        hadText: Boolean(respuestaIATexto),

        rawPreview: compactPromptText(respuestaIATexto, 500)

      }));

      const respuestaJsonEstricta = String(await callOpenAiGenericJsonStrict(promptUltraEstricto, openAiAttempts) || "").trim();

      if (respuestaJsonEstricta) {

        respuestaIATexto = respuestaJsonEstricta;

        parsed = parseExamPayload(respuestaIATexto);

      } else if (respuestaIATexto) {

        parsed = parseExamPayload(respuestaIATexto);

      }

    }

    if (!respuestaIATexto || isWeakExamPayload(parsed.items)) {

      const debugInfo = {

        model: getOpenAiExamModel(),

        hadText: Boolean(respuestaIATexto),

        firstItem: summarizeExamItemForLog(Array.isArray(parsed.items) ? parsed.items[0] : null),

        rawPreview: compactPromptText(respuestaIATexto, 700),

        openAiAttempts

      };

      console.error("OpenAI Eval360 examenes: payload rechazado por debil", JSON.stringify({

        actividadIdTabla,

        estructuraGrupoId,

        ...debugInfo

      }));

      return res.status(502).json({

        ok: false,

        message: "La IA no devolvio preguntas utilizables para el examen. Revise la plantilla, el modelo y la materia vista antes de guardar.",

        detalle: debugInfo

      });

    }

    const generadoConIA = true;

    const tipoCountGenerado: Record<string, number> = {};

    for (const item of parsed.items) {

      const tipo = normalizeTipoItem(item?.tipoItem);

      if (!tipo) continue;

      tipoCountGenerado[tipo] = (tipoCountGenerado[tipo] || 0) + 1;

    }

    const warnings: string[] = [...parsed.advertencias];

    for (const t of tiposActivos) {

      const got = Number(tipoCountGenerado[t.tipoItem] || 0);

      if (got !== Number(t.cantidad || 0)) {

        warnings.push(`Distribución incompleta en ${t.tipoItem}: esperado ${t.cantidad}, generado ${got}.`);

      }

    }

    const puntosGenerados = Math.round(parsed.items.reduce((acc: number, it: any) => acc + Number(it?.puntaje || 0), 0));

    if (puntosGenerados !== totalPuntosEsperado) {

      warnings.push(`Puntaje total generado (${puntosGenerados}) no coincide con el esperado (${totalPuntosEsperado}).`);

    }



    const resultadoPersistido = parsed.parsed && typeof parsed.parsed === "object"

      ? JSON.stringify({

          ...parsed.parsed,

          items: Array.isArray(parsed.parsed.items) && parsed.parsed.items.length ? parsed.parsed.items : parsed.items,

          encabezado: {

            ...(parsed.parsed.encabezado || {}),

            docente: docenteSesionNombre

          },

          validacion: {

            ...(parsed.parsed.validacion || {}),

            totalPuntosEsperado,

            totalPuntosCalculado: puntosGenerados,

            coincideTotalPuntos: puntosGenerados === totalPuntosEsperado,

            advertencias: warnings

          }

        })

      : respuestaIATexto;

    const userId = getUserId(req) || null;

    const nombreFinal = nombreSolicitado || `Prueba - ${normalizeText(ctx.Grado)}-${normalizeText(ctx.Materia)}, ${normalizeText(ctx.Periodo)}`;

    const insert = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("actividadIdTabla", sql.Int, actividadIdTabla)

      .input("usuarioId", sql.Int, userId)

      .input("plantillaPromptIAId", sql.Int, Number(plantilla.Id))

      .input("nombre", sql.NVarChar(250), nombreFinal)

      .input("materia", sql.NVarChar(150), normalizeText(ctx.Materia))

      .input("grado", sql.NVarChar(120), normalizeText(ctx.Grado))

      .input("periodo", sql.NVarChar(120), normalizeText(ctx.Periodo))

      .input("tipoColegio", sql.NVarChar(120), tipoColegio || null)

      .input("fuenteWord", sql.NVarChar(120), fuenteWord)

      .input("tamanoWordPt", sql.Int, tamanoWordPt)

      .input("seccionesJson", sql.NVarChar(sql.MAX), JSON.stringify(seccionGrupoIds))

      .input("formatoSalidaNombre", sql.NVarChar(255), formatoSalidaNombre || null)

      .input("formatoSalidaMimeType", sql.NVarChar(150), formatoSalidaFile?.mimetype || null)

      .input("formatoSalidaDocxBase64", sql.NVarChar(sql.MAX), (formatoSalidaFile && /\.docx$/i.test(String(formatoSalidaFile.originalname || ""))) ? formatoSalidaFile.buffer.toString("base64") : null)

      .input("indicaciones", sql.NVarChar(sql.MAX), indicaciones || null)

      .input("documentoApoyoNombre", sql.NVarChar(255), documentoApoyoNombre || null)

      .input("encabezadoJson", sql.NVarChar(sql.MAX), JSON.stringify({

        direccionRegional: normalizeText(ctx.DireccionRegional),

        circuito: normalizeText(ctx.Circuito),

        centroEducativo: normalizeText(ctx.CentroEducativo),

        docente: docenteSesionNombre,

        materia: normalizeText(ctx.Materia),

        grado: normalizeText(ctx.Grado),

        periodo: normalizeText(ctx.Periodo),

        anioLectivo: normalizeText(ctx.AnioLectivo)

      }))

      .input("promptGenerado", sql.NVarChar(sql.MAX), prompt)

      .input("resultadoIA", sql.NVarChar(sql.MAX), resultadoPersistido)

      .query(`

        INSERT INTO dbo.Eval360_ExamenIAGenerado

          (EstructuraGrupoId, ActividadIdTabla, UsuarioId, PlantillaPromptIAId, Nombre, Materia, Grado, Periodo, TipoColegio, FuenteWord, TamanoWordPt, SeccionesJson, FormatoSalidaNombre, FormatoSalidaMimeType, FormatoSalidaDocxBase64, Indicaciones, DocumentoApoyoNombre, EncabezadoJson, PromptGenerado, ResultadoIA, Activo, CreatedAt)

        OUTPUT INSERTED.*

        VALUES

          (@estructuraGrupoId, @actividadIdTabla, @usuarioId, @plantillaPromptIAId, @nombre, @materia, @grado, @periodo, @tipoColegio, @fuenteWord, @tamanoWordPt, @seccionesJson, @formatoSalidaNombre, @formatoSalidaMimeType, @formatoSalidaDocxBase64, @indicaciones, @documentoApoyoNombre, @encabezadoJson, @promptGenerado, @resultadoIA, 1, SYSDATETIME())

      `);

    try {

      await syncExamenIaReplicasDesdeActividad(pool, req, {

        sourceEstructuraGrupoId: estructuraGrupoId,

        sourceActividadId: actividadIdTabla,

        sourceExamenRow: insert.recordset[0]

      });

    } catch (replicaError) {

      console.error("OpenAI Eval360 examenes: no se pudieron sincronizar replicas del examen", replicaError);

    }

    return created(res, {

      ...insert.recordset[0],

      generadoConIA

    }, generadoConIA ? "Examen IA generado y guardado correctamente" : "Examen generado en modo local de respaldo");

  } catch (error) {

    console.error("Error generando examen IA:", error);

    const detalle = compactPromptText(getReadableError(error), 300)

      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")

      .replace(/sk-[A-Za-z0-9_-]+/gi, "sk-[redacted]");

    return res.status(500).json({

      ok: false,

      message: "No se pudo generar el examen con IA",

      detalle

    });

  }

});



router.put("/examenes-ia/:id", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const id = toRequiredNumber(req.params.id, "id", res);

    if (!id) return;

    const pool = await getPool();

    const docenteSesionNombre = await getSessionTeacherDisplayName(pool, req);

    await ensureEval360ExamenIATable(pool);

    const nombre = normalizeText(req.body.nombre);

    const indicaciones = normalizeText(req.body.indicaciones);

    const resultadoIA = normalizeText(req.body.resultadoIA);

    await pool.request()

      .input("id", sql.Int, id)

      .input("nombre", sql.NVarChar(250), nombre || null)

      .input("indicaciones", sql.NVarChar(sql.MAX), indicaciones || null)

      .input("resultadoIA", sql.NVarChar(sql.MAX), resultadoIA || null)

      .query(`

        UPDATE dbo.Eval360_ExamenIAGenerado

        SET Nombre = COALESCE(@nombre, Nombre),

            Indicaciones = COALESCE(@indicaciones, Indicaciones),

            ResultadoIA = COALESCE(@resultadoIA, ResultadoIA),

            UpdatedAt = SYSDATETIME()

        WHERE ExamenIAGeneradoId = @id

      `);

    const updatedResult = await pool.request()

      .input("id", sql.Int, id)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_ExamenIAGenerado

        WHERE ExamenIAGeneradoId = @id

      `);

    const updatedRow = updatedResult.recordset?.[0];

    if (updatedRow?.EstructuraGrupoId && updatedRow?.ActividadIdTabla) {

      await syncExamenIaReplicasDesdeActividad(pool, req, {

        sourceEstructuraGrupoId: Number(updatedRow.EstructuraGrupoId || 0),

        sourceActividadId: Number(updatedRow.ActividadIdTabla || 0),

        sourceExamenRow: updatedRow

      });

    }

    return ok(res, { id }, "Examen IA actualizado correctamente");

  } catch (error) {

    console.error("Error actualizando examen IA:", error);

    return res.status(500).json({ ok: false, message: "No se pudo actualizar el examen IA" });

  }

});



router.delete("/examenes-ia/:id", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const id = toRequiredNumber(req.params.id, "id", res);

    if (!id) return;

    const pool = await getPool();

    const docenteSesionNombre = await getSessionTeacherDisplayName(pool, req);

    await ensureEval360ExamenIATable(pool);

    const examResult = await pool.request()

      .input("id", sql.Int, id)

      .query(`

        SELECT TOP 1 ExamenIAGeneradoId, EstructuraGrupoId, ActividadIdTabla

        FROM dbo.Eval360_ExamenIAGenerado

        WHERE ExamenIAGeneradoId = @id

      `);

    const exam = examResult.recordset?.[0];

    if (!exam) return badRequest(res, "No se encontró el examen");



    const actividadMetaResult = await pool.request()

      .input("actividadId", sql.Int, Number(exam.ActividadIdTabla || 0))

      .query(`

        SELECT TOP 1 EstructuraGrupoDetalleId

        FROM dbo.Eval360_Actividad

        WHERE ActividadId = @actividadId

          AND ISNULL(Activo, 1) = 1

      `);

    const actividadMeta = actividadMetaResult.recordset?.[0];



    await pool.request()

      .input("id", sql.Int, id)

      .query(`

        UPDATE dbo.Eval360_ExamenIAGenerado

        SET Activo = 0, UpdatedAt = SYSDATETIME()

        WHERE ExamenIAGeneradoId = @id

      `);



    if (actividadMeta?.EstructuraGrupoDetalleId && exam?.EstructuraGrupoId && exam?.ActividadIdTabla) {

      const replicaTargets = await getEstructurasReplicaTablaMismoGrado(pool, req, Number(exam.EstructuraGrupoId || 0));

      for (const target of replicaTargets) {

        const actividadReplica = await getActividadReplicaDestino(pool, {

          sourceEstructuraGrupoId: Number(exam.EstructuraGrupoId || 0),

          sourceEstructuraGrupoDetalleId: Number(actividadMeta.EstructuraGrupoDetalleId || 0),

          sourceActividadId: Number(exam.ActividadIdTabla || 0),

          targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0)

        });

        if (!actividadReplica?.targetActividadId) continue;

        await pool.request()

          .input("estructuraGrupoId", sql.Int, Number(target.EstructuraGrupoId || 0))

          .input("actividadIdTabla", sql.Int, Number(actividadReplica.targetActividadId || 0))

          .query(`

            UPDATE dbo.Eval360_ExamenIAGenerado

            SET Activo = 0, UpdatedAt = SYSDATETIME()

            WHERE EstructuraGrupoId = @estructuraGrupoId

              AND ActividadIdTabla = @actividadIdTabla

              AND Activo = 1

          `);

      }

    }

    return ok(res, { id }, "Examen IA eliminado correctamente");

  } catch (error) {

    console.error("Error eliminando examen IA:", error);

    return res.status(500).json({ ok: false, message: "No se pudo eliminar el examen IA" });

  }

});



router.get("/examenes-ia/:id/word", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const id = toRequiredNumber(req.params.id, "id", res);

    if (!id) return;

    const pool = await getPool();

    await ensureEval360ExamenIATable(pool);

    const result = await pool.request()

      .input("id", sql.Int, id)

      .query(`

        SELECT TOP 1 ExamenIAGeneradoId, EstructuraGrupoId, UsuarioId, Nombre, Materia, Grado, Periodo, ResultadoIA, FormatoSalidaDocxBase64, ActividadIdTabla, SeccionesJson, EncabezadoJson, FuenteWord, TamanoWordPt

        FROM dbo.Eval360_ExamenIAGenerado

        WHERE ExamenIAGeneradoId = @id

          AND Activo = 1

      `);

    const row = result.recordset?.[0];

    if (!row) return badRequest(res, "No se encontró el examen");

    const modo = normalizeKey(req.query.modo || "EXAMEN");

    const parsedPayload = parseExamPayload(String(row.ResultadoIA || ""));

    const contenidoBase =

      parsedPayload.items.length > 0

        ? (modo.includes("RESP") ? buildAnswerContentFromItems(parsedPayload.items) : buildExamContentFromItems(parsedPayload.items))

        : String(row.ResultadoIA || "").trim();

    const contenido = normalizeMathForWord(contenidoBase || "(Sin contenido)");

    const actividadIdTabla = Number(row.ActividadIdTabla || 0);

    const seccionesArr = (() => {

      try {

        const arr = JSON.parse(String(row.SeccionesJson || "[]"));

        return Array.isArray(arr) ? arr : [];

      } catch {

        return [];

      }

    })();

    const seccionesIds = seccionesArr.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x > 0);

    const seccionesLabel = seccionesIds.length

      ? (() => {

          const q = seccionesIds.map((_, i) => `@sid${i}`).join(",");

          return { q, ids: seccionesIds };

        })()

      : null;

    let seccionTexto = "";

    if (seccionesLabel) {

      const reqSec = pool.request();

      seccionesLabel.ids.forEach((idSec, idx) => reqSec.input(`sid${idx}`, sql.Int, idSec));

      const secResult = await reqSec.query(`

        SELECT GrupoId, Nombre

        FROM dbo.Grupo

        WHERE GrupoId IN (${seccionesLabel.q})

      `);

      const namesById = new Map<number, string>(

        (secResult.recordset || []).map((r: any) => [Number(r.GrupoId), String(r.Nombre || "").trim()])

      );

      const ordered = seccionesLabel.ids.map((idSec) => namesById.get(idSec)).filter((x) => String(x || "").trim().length > 0);

      seccionTexto = ordered.join(", ");

    }



    const detResult = actividadIdTabla > 0

      ? await pool.request()

          .input("actividadId", sql.Int, actividadIdTabla)

          .query(`

            SELECT DetalleItemsJson

            FROM dbo.Eval360_ActividadIndicador

            WHERE ActividadId = @actividadId

              AND ISNULL(Activo, 1) = 1

          `)

      : { recordset: [] as any[] };

    const actividadInfo = actividadIdTabla > 0

      ? await pool.request()

          .input("actividadId", sql.Int, actividadIdTabla)

          .query(`

            SELECT TOP 1

              ActividadId,

              PuntosMaximos,

              PorcentajeDentroRubro

            FROM dbo.Eval360_Actividad

            WHERE ActividadId = @actividadId

          `)

      : { recordset: [] as any[] };

    const actividadRow = actividadInfo.recordset?.[0] || null;

    const rowsDetalle = detResult.recordset || [];

    const sum = {

      sr_c: 0, sr_v: 0, sr_p: 0,

      rc_c: 0, rc_v: 0, rc_p: 0,

      c_c: 0, c_v: 0, c_p: 0,

      i_c: 0, i_v: 0, i_p: 0,

      re_c: 0, re_v: 0, re_p: 0,

      rp_c: 0, rp_v: 0, rp_p: 0,

      rr_c: 0, rr_v: 0, rr_p: 0,

      rcas_c: 0, rcas_v: 0, rcas_p: 0,

      pe_c: 0, pe_v: 0, pe_p: 0

    };

    const avg = (tot: number, c: number) => c > 0 ? Math.round(tot / c) : 0;

    for (const r of rowsDetalle) {

      const d = parseJsonSafe(r.DetalleItemsJson);

      const getN = (k: string) => Number(String(d?.[k] ?? "0").replace(",", ".")) || 0;

      const srC = getN("seleccionRespuestaCantidad"); const srV = getN("seleccionRespuestaPuntos");

      const rcC = getN("respuestaCortaCantidad"); const rcV = getN("respuestaCortaPuntos");

      const cC = getN("correspondenciaCantidad"); const cV = getN("correspondenciaPuntos");

      const iC = getN("identificacionCantidad"); const iV = getN("identificacionPuntos");

      const reC = getN("resolucionEjerciciosCantidad"); const reV = getN("resolucionEjerciciosPuntos");

      const rpC = getN("resolucionProblemasCantidad"); const rpV = getN("resolucionProblemasPuntos");

      const rrC = getN("respuestaRestringidaCantidad"); const rrV = getN("respuestaRestringidaPuntos");

      const rcasC = getN("resolucionCasosCantidad"); const rcasV = getN("resolucionCasosPuntos");

      const peC = getN("produccionEscritaCantidad"); const peV = getN("produccionEscritaPuntos");

      sum.sr_c += srC; sum.sr_v += srV; sum.sr_p += srC * srV;

      sum.rc_c += rcC; sum.rc_v += rcV; sum.rc_p += rcC * rcV;

      sum.c_c += cC; sum.c_v += cV; sum.c_p += cC * cV;

      sum.i_c += iC; sum.i_v += iV; sum.i_p += iC * iV;

      sum.re_c += reC; sum.re_v += reV; sum.re_p += reC * reV;

      sum.rp_c += rpC; sum.rp_v += rpV; sum.rp_p += rpC * rpV;

      sum.rr_c += rrC; sum.rr_v += rrV; sum.rr_p += rrC * rrV;

      sum.rcas_c += rcasC; sum.rcas_v += rcasV; sum.rcas_p += rcasC * rcasV;

      sum.pe_c += peC; sum.pe_v += peV; sum.pe_p += peC * peV;

    }

    const totalPuntos = Math.round(sum.sr_p + sum.rc_p + sum.c_p + sum.i_p + sum.re_p + sum.rp_p + sum.rr_p + sum.rcas_p + sum.pe_p);

    const totalPaginasEstimadas = estimateDocumentPages(contenido);

    // Regla: el porcentaje de la prueba debe venir del porcentaje configurado del rubro/prueba.

    // PuntosMaximos representa puntos de escala interna, no porcentaje.

    const porcentajeDesdeNombre = extractPercentFromText(String(row.Nombre || ""));

    const porcentajePrueba = Number(

      porcentajeDesdeNombre

      ?? actividadRow?.PorcentajeDentroRubro

      ?? actividadRow?.PuntosMaximos

      ?? 0

    );

    const encabezado = parseJsonSafe(row.EncabezadoJson);

    const estiloWord = {

      font: normalizeText(row.FuenteWord) || "Calibri",

      sizePt: Math.max(8, Math.min(18, Number(row.TamanoWordPt || 11) || 11))

    };

    const nombreAsignatura = String(row.Materia || "Matemática");

    const nombreDocente = String(encabezado?.docente || await getSessionTeacherDisplayName(pool, req, Number(row.UsuarioId || 0)) || "");

    const markers: Record<string, string> = {

      NOMBRE_CENTRO_EDUCATIVO: `${String(encabezado?.centroEducativo || "Centro Educativo")}\n`,

      NOMBRE_ASIGNATURA: nombreAsignatura,

      Asignatura: nombreAsignatura,

      "Asignatura ": nombreAsignatura,

      NOMBRE_DOCENTE: nombreDocente,

      ANO_LECTIVO: String(encabezado?.anioLectivo || ""),

      "AÑO_LECTIVO": String(encabezado?.anioLectivo || ""),

      PERIODO_ROMANO: "I",

      PERIODO_ORDINAL: `${String(row.Periodo || "Semestre")}\n`,

      GRADO_NUMERO: String(row.Grado || ""),

      GRADO_LETRAS_1: String(row.Grado || ""),

      GRADO_LETRAS_2: "",

      CANTIDAD_PREGUNTAS_SR: String(Math.round(sum.sr_c)),

      VALOR_PREGUNTA_SR: String(avg(sum.sr_v, rowsDetalle.length || 1)),

      CANTIDAD_PREGUNTAS_RC: String(Math.round(sum.rc_c)),

      VALOR_PREGUNTA_RC: String(avg(sum.rc_v, rowsDetalle.length || 1)),

      PUNTAJE_TOTAL_PRUEBA: String(totalPuntos || 0),

      TOTAL_PUNTOS_PRUEBA: String(totalPuntos || 0),

      CANTIDAD_PUNTOS_PRUEBA: String(totalPuntos || 0),

      TOTAL_PAGINAS_DOCUMENTO: String(totalPaginasEstimadas || 1),

      PUNTAJE_APARTADO_SR: String(Math.round(sum.sr_p)),

      PUNTAJE_APARTADO_RC: String(Math.round(sum.rc_p)),

      PUNTAJE_APARTADO_C: String(Math.round(sum.c_p)),

      PUNTAJE_APARTADO_I: String(Math.round(sum.i_p)),

      PUNTAJE_APARTADO_RE: String(Math.round(sum.re_p)),

      PUNTAJE_APARTADO_RP: String(Math.round(sum.rp_p)),

      PUNTAJE_APARTADO_RR: String(Math.round(sum.rr_p)),

      PUNTAJE_APARTADO_RCAS: String(Math.round(sum.rcas_p)),

      PUNTAJE_APARTADO_PE: String(Math.round(sum.pe_p)),

      PUNTOS_REACTIVOS_RE_RP_RR_PE: String(Math.round(porcentajePrueba || 0)),

      PORCENTAJE_TOTAL_PRUEBA: String(Math.round(porcentajePrueba || 0)),

      ELEMENTOS_IDENTIFICACION_I: "elementos",

      COMPLETAR_ESPACIOS_I: "los espacios",

      ACCION_RESPUESTA_I: "escriba el dato",

      COMPLETAR_ESPACIOS_C: "los conceptos",

      ELEMENTOS_RELACION_C: "la letra o número",

      MODO_USO_RELACION_C: "una, varias o ninguna vez.",

      LECCION_INICIO: "",

      LECCION_FIN: "",

      FECHA_APLICACION: getCostaRicaIsoDate(),

      SECCION: seccionTexto || (seccionesIds.length ? seccionesIds.join(", ") : ""),

      SESSION: seccionTexto || (seccionesIds.length ? seccionesIds.join(", ") : ""),

      CONTENIDO_EXAMEN: contenido,

      RESULTADO_EXAMEN: contenido

    };

    const items = parsedPayload.items;

    const blocksFromText = parseQuestionBlocksFromPlainText(contenido);

    const sectionBlocksBase: Record<string, string> = {

      SR: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "SR") : buildQuestionsBlockByType(items, "SR")) || String((blocksFromText as any).SR || ""),

      RC: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RC") : buildQuestionsBlockByType(items, "RC")) || String((blocksFromText as any).RC || ""),

      C: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "C") : buildQuestionsBlockByType(items, "C")) || String((blocksFromText as any).C || ""),

      I: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "I") : buildQuestionsBlockByType(items, "I")) || String((blocksFromText as any).I || ""),

      RE: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RE") : buildQuestionsBlockByType(items, "RE")) || String((blocksFromText as any).RE || ""),

      RP: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RP") : buildQuestionsBlockByType(items, "RP")) || String((blocksFromText as any).RP || ""),

      RR: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RR") : buildQuestionsBlockByType(items, "RR")) || String((blocksFromText as any).RR || ""),

      RCAS: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "RCAS") : buildQuestionsBlockByType(items, "RCAS")) || String((blocksFromText as any).RCAS || ""),

      PE: (modo.includes("RESP") ? buildAnswerKeyBlockByType(items, "PE") : buildQuestionsBlockByType(items, "PE")) || String((blocksFromText as any).PE || "")

    };

    const bloqueCasosProblemas = [sectionBlocksBase.RP, sectionBlocksBase.RCAS].filter((value) => String(value || "").trim()).join("\n\n");

    const sectionBlocks: Record<string, string> = {
      ...sectionBlocksBase,
      RP: bloqueCasosProblemas,
      RCAS: ""
    };

    let buffer: Buffer;

    let renderMode = "no-template";

    let templateBase64 = String(row.FormatoSalidaDocxBase64 || "");

    const defaultMachoteInfo = await loadDefaultMachoteBase64();

    const defaultMachote = String(defaultMachoteInfo.base64 || "");

    // Prioridad 1: usar el archivo de salida asociado al examen generado.

    // Solo usar machote institucional cuando no exista un DOCX válido en el registro.

    if (!templateBase64) {

      const fallbackTpl = await pool.request()

        .input("estructuraGrupoId", sql.Int, Number(row.EstructuraGrupoId || 0))

        .input("id", sql.Int, id)

        .query(`

          SELECT TOP 1 FormatoSalidaDocxBase64

          FROM dbo.Eval360_ExamenIAGenerado

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND ExamenIAGeneradoId <> @id

            AND Activo = 1

            AND FormatoSalidaDocxBase64 IS NOT NULL

            AND LEN(FormatoSalidaDocxBase64) > 1000

          ORDER BY ExamenIAGeneradoId DESC

        `);

      templateBase64 = String(fallbackTpl.recordset?.[0]?.FormatoSalidaDocxBase64 || "");

      if (!templateBase64) {

        const fallbackGlobalTpl = await pool.request()

          .input("id", sql.Int, id)

          .query(`

            SELECT TOP 1 FormatoSalidaDocxBase64

            FROM dbo.Eval360_ExamenIAGenerado

            WHERE ExamenIAGeneradoId <> @id

              AND Activo = 1

              AND FormatoSalidaDocxBase64 IS NOT NULL

              AND LEN(FormatoSalidaDocxBase64) > 300

            ORDER BY ExamenIAGeneradoId DESC

          `);

        templateBase64 = String(fallbackGlobalTpl.recordset?.[0]?.FormatoSalidaDocxBase64 || "");

      }

      if (!templateBase64) {

        templateBase64 = defaultMachote;

      }

    }



    if (!templateBase64) {

      return badRequest(res, "No se encontró un machote DOCX válido para generar el examen. Subí nuevamente 'Indicaciones prueba escrita - MACHOTE IA.docx' al crear el examen.");

    }



    if (templateBase64) {

      // Prioridad: respetar siempre el machote y sus marcadores.

      // Evitamos degradar por heurísticas de validación que pueden dar falsos negativos.

      const fromTemplate = await renderDocxFromTemplate(templateBase64, contenido, markers, sectionBlocks, estiloWord);

      if (fromTemplate && fromTemplate.length > 0) {

        buffer = fromTemplate;

        renderMode = "template-sections";

      } else {

        // último recurso: mantener machote y anexar contenido.

        buffer = await forceAppendExamToTemplate(templateBase64, contenido, estiloWord);

        renderMode = "template-append-fallback";

      }

    }

    const hardened = await hardenRenderedDocx(buffer, markers, contenido, estiloWord);

    buffer = hardened.buffer;

    let recoveryError = "";

    // Si endurecimiento falla o no encuentra preguntas, forzar anexado visible.

    if (!hardened.hasQuestions) {

      const recoveryBase64 = String(defaultMachote || templateBase64 || "");

      try {

        // Importante: reconstruir siempre desde el machote base válido.

        buffer = await forceAppendExamToTemplate(recoveryBase64, contenido, estiloWord);

        renderMode = "template-recovery-append";

      } catch (err: any) {

        recoveryError = String(err?.message || err || "recovery-append-failed").slice(0, 180);

        // último seguro: devolver el machote íntegro, no un doc pequeño corrupto.

        if (recoveryBase64) {

          try {

            buffer = Buffer.from(recoveryBase64, "base64");

            renderMode = "template-recovery-raw";

          } catch {

            // mantener buffer previo

          }

        }

      }

    }

    const suffix = modo.includes("RESP") ? "_respuestas" : "_examen";

    const ts = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");

    const filename = `${String(row.Nombre || "examen").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "examen"}${suffix}_${ts}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    res.setHeader("Pragma", "no-cache");

    res.setHeader("Expires", "0");

    res.setHeader("Access-Control-Expose-Headers", "X-Render-Mode, X-Word-Renderer-Version, X-Template-Source, X-Template-Bytes, X-Template-Path, X-Items-Count, X-Markers-Left, X-Doc-Has-Questions, X-Harden-Error, Content-Disposition, Content-Length");

    res.setHeader("X-Render-Mode", renderMode);

    res.setHeader("X-Word-Renderer-Version", "v2026-05-18-04");

    res.setHeader("X-Template-Source", defaultMachote ? "default-machote-local" : "db");

    res.setHeader("X-Template-Bytes", String(Number(defaultMachoteInfo.bytes || 0)));

    res.setHeader("X-Template-Path", String(defaultMachoteInfo.path || ""));

    res.setHeader("X-Items-Count", String(Array.isArray(parsedPayload.items) ? parsedPayload.items.length : 0));

    res.setHeader("X-Markers-Left", String(Number(hardened.markersLeft ?? -1)));

    res.setHeader("X-Doc-Has-Questions", hardened.hasQuestions ? "1" : "0");

    const hardenError = String((hardened as any).error || "");

    res.setHeader("X-Harden-Error", String([hardenError, recoveryError].filter(Boolean).join(" | ")));

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.send(buffer);

  } catch (error) {

    console.error("Error generando Word de examen IA:", error);

    return res.status(500).json({ ok: false, message: "No se pudo generar el archivo Word" });

  }

});



router.get("/tablas-especificaciones/:actividadId/excel", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;

    const actividadId = toRequiredNumber(req.params.actividadId, "actividadId", res);

    if (!actividadId) return;

    const pool = await getPool();



    const actividadCtx = await pool.request()

      .input("actividadId", sql.Int, actividadId)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        SELECT TOP 1

          a.ActividadId,

          a.Nombre AS ActividadNombre,

          a.EstructuraGrupoId,

          eg.InstitucionId,

          eg.GrupoId,

          eg.MateriaId,

          eg.AnioLectivoId,

          eg.PeriodoId,

          g.Nombre AS SeccionNombre,

          m.Nombre AS MateriaNombre,

          al.Nombre AS AnioNombre,

          p.Nombre AS PeriodoNombre,

          i.LogoUrl AS InstitucionLogoUrl,

          profesor.NombreCompleto AS DocenteNombre

        FROM dbo.Eval360_Actividad a

        INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = a.EstructuraGrupoId

        INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId

        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId

        LEFT JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId

        LEFT JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId

        OUTER APPLY (

          SELECT TOP 1

            LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, ''), ' ', ISNULL(u.PrimerApellido, ''), ' ', ISNULL(u.SegundoApellido, '')))) AS NombreCompleto

          FROM dbo.AsignacionDocente ad

          INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

          ORDER BY CASE WHEN ad.UsuarioId = @usuarioId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC

        ) profesor

        WHERE a.ActividadId = @actividadId

      `);

    const actividad = actividadCtx.recordset?.[0];

    if (!actividad) return badRequest(res, "No se encontro la actividad de la tabla de especificaciones");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(actividad.EstructuraGrupoId));

    if (!estructura) return;



    const result = await pool.request()

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT

          ig.IndicadorGrupoId,

          ig.PlaneamientoId,

          ig.IndicadorBase,

          ai.NumeroLecciones,

          ai.Puntos,

          ai.DetalleItemsJson

        FROM dbo.Eval360_ActividadIndicador ai

        INNER JOIN dbo.Eval360_IndicadorGrupo ig ON ig.IndicadorGrupoId = ai.IndicadorGrupoId

        WHERE ai.ActividadId = @actividadId

          AND ISNULL(ai.Activo, 1) = 1

        ORDER BY ig.IndicadorGrupoId

      `);



    const rows = (result.recordset || []).map((r: any) => {

      const d = parseJsonSafe(r.DetalleItemsJson);

      return {

        IndicadorGrupoId: Number(r.IndicadorGrupoId || 0),

        PlaneamientoId: Number(r.PlaneamientoId || 0),

        Indicador: String(r.IndicadorBase || ""),

        NumeroLecciones: Number(r.NumeroLecciones || 0),

        Puntos: Number(r.Puntos || 0),

        SR_Cantidad: Number(d?.seleccionRespuestaCantidad || 0),

        SR_Valor: Number(d?.seleccionRespuestaPuntos || 0),

        RC_Cantidad: Number(d?.respuestaCortaCantidad || 0),

        RC_Valor: Number(d?.respuestaCortaPuntos || 0),

        C_Cantidad: Number(d?.correspondenciaCantidad || 0),

        C_Valor: Number(d?.correspondenciaPuntos || 0),

        I_Cantidad: Number(d?.identificacionCantidad || 0),

        I_Valor: Number(d?.identificacionPuntos || 0),

        RE_Cantidad: Number(d?.resolucionEjerciciosCantidad || 0),

        RE_Valor: Number(d?.resolucionEjerciciosPuntos || 0),

        RP_Cantidad: Number(d?.resolucionProblemasCantidad || 0),

        RP_Valor: Number(d?.resolucionProblemasPuntos || 0),

        RR_Cantidad: Number(d?.respuestaRestringidaCantidad || 0),

        RR_Valor: Number(d?.respuestaRestringidaPuntos || 0),

        RCas_Cantidad: Number(d?.resolucionCasosCantidad || 0),

        RCas_Valor: Number(d?.resolucionCasosPuntos || 0),

        PE_Cantidad: Number(d?.produccionEscritaCantidad || 0),

        PE_Valor: Number(d?.produccionEscritaPuntos || 0)

      };

    });



    const seccionesTexto = await getTablaEspecificacionesSeccionesTexto(

      pool,

      actividadId,

      String(actividad.SeccionNombre || "Seccion")

    );

    const docenteNombre = String(

      actividad.DocenteNombre

      || await getSessionTeacherDisplayName(pool, req)

      || ""

    ).trim();

    const logo = await loadLogoBuffer(String(actividad.InstitucionLogoUrl || ""));

    const workbook = new ExcelJS.Workbook();

    workbook.creator = docenteNombre || "PROFE360";

    workbook.created = new Date();

    workbook.modified = new Date();

    workbook.subject = "Tabla de especificaciones";

    workbook.title = String(actividad.ActividadNombre || "Tabla de especificaciones");

    workbook.company = "PROFE360";

    workbook.properties.date1904 = false;



    const worksheet = workbook.addWorksheet("TablaEspecificaciones", {

      views: [{ state: "frozen", xSplit: 0, ySplit: 12 }]

    });



    worksheet.pageSetup = {

      orientation: "landscape",

      fitToPage: true,

      fitToWidth: 1,

      fitToHeight: 0,

      paperSize: 9,

      horizontalCentered: false,

      verticalCentered: false

    };



    worksheet.columns = [

      { width: 42 },

      { width: 12 },

      { width: 10 },

      { width: 10 }, { width: 10 },

      { width: 10 }, { width: 10 },

      { width: 10 }, { width: 10 },

      { width: 10 }, { width: 10 },

      { width: 12 }, { width: 12 },

      { width: 12 }, { width: 12 },

      { width: 12 }, { width: 12 },

      { width: 12 }, { width: 12 },

      { width: 12 }, { width: 12 }

    ];



    worksheet.getRow(1).height = 54;

    worksheet.getRow(2).height = 24;

    worksheet.getRow(3).height = 10;

    worksheet.getRow(4).height = 20;

    worksheet.getRow(5).height = 20;

    worksheet.getRow(6).height = 20;

    worksheet.getRow(7).height = 20;

    worksheet.getRow(8).height = 20;

    worksheet.getRow(9).height = 20;

    worksheet.getRow(11).height = 26;

    worksheet.getRow(12).height = 34;



    if (logo) {

      const imageId = workbook.addImage({

        buffer: logo.buffer as any,

        extension: logo.extension as any

      });

      worksheet.addImage(imageId, {

        tl: { col: 0, row: 0 },

        ext: { width: 120, height: 120 }

      });

    }



    worksheet.mergeCells("C1:U2");

    worksheet.getCell("C1").value = "TABLA DE ESPECIFICACIONES";

    worksheet.getCell("C1").font = { bold: true, size: 18, color: { argb: "FF0F172A" } };

    worksheet.getCell("C1").alignment = { horizontal: "center", vertical: "middle" };



    const metaRows = [

      ["Docente", docenteNombre || "-"],

      ["Asignatura", String(actividad.MateriaNombre || "-")],

      ["Seccion(es)", seccionesTexto || "-"],

      ["Ano", String(actividad.AnioNombre || "-")],

      ["Periodo", String(actividad.PeriodoNombre || "-")],

      ["Prueba escrita", extractPruebaNumero(String(actividad.ActividadNombre || actividadId))]

    ];



    metaRows.forEach((row, index) => {

      const excelRow = 4 + index;

      worksheet.getCell(`A${excelRow}`).value = row[0];

      worksheet.getCell(`B${excelRow}`).value = row[1];

      worksheet.getCell(`A${excelRow}`).font = { bold: true, color: { argb: "FF0F172A" } };

      worksheet.getCell(`A${excelRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

      worksheet.getCell(`A${excelRow}`).border = {

        top: { style: "thin", color: { argb: "FF94A3B8" } },

        left: { style: "thin", color: { argb: "FF94A3B8" } },

        bottom: { style: "thin", color: { argb: "FF94A3B8" } },

        right: { style: "thin", color: { argb: "FF94A3B8" } }

      };

      worksheet.getCell(`B${excelRow}`).alignment = { wrapText: true, vertical: "middle" };

      worksheet.getCell(`B${excelRow}`).border = {

        top: { style: "thin", color: { argb: "FF94A3B8" } },

        left: { style: "thin", color: { argb: "FF94A3B8" } },

        bottom: { style: "thin", color: { argb: "FF94A3B8" } },

        right: { style: "thin", color: { argb: "FF94A3B8" } }

      };

    });



    const itemDefs = [

      { key: "SR", label: "Seleccion de respuesta", cantidad: "SR_Cantidad", valor: "SR_Valor" },

      { key: "RC", label: "Respuesta corta", cantidad: "RC_Cantidad", valor: "RC_Valor" },

      { key: "C", label: "Correspondencia", cantidad: "C_Cantidad", valor: "C_Valor" },

      { key: "I", label: "Identificacion", cantidad: "I_Cantidad", valor: "I_Valor" },

      { key: "RE", label: "Resolucion de ejercicios", cantidad: "RE_Cantidad", valor: "RE_Valor" },

      { key: "RP", label: "Resolucion de problemas", cantidad: "RP_Cantidad", valor: "RP_Valor" },

      { key: "RR", label: "Respuesta restringida", cantidad: "RR_Cantidad", valor: "RR_Valor" },

      { key: "RCas", label: "Resolucion de casos", cantidad: "RCas_Cantidad", valor: "RCas_Valor" },

      { key: "PE", label: "Produccion escrita", cantidad: "PE_Cantidad", valor: "PE_Valor" }

    ];



    const headerRow1 = 11;

    const headerRow2 = 12;

    worksheet.mergeCells(`A${headerRow1}:A${headerRow2}`);

    worksheet.mergeCells(`B${headerRow1}:B${headerRow2}`);

    worksheet.mergeCells(`C${headerRow1}:C${headerRow2}`);

    worksheet.getCell(`A${headerRow1}`).value = "Indicador";

    worksheet.getCell(`B${headerRow1}`).value = "Numero de lecciones";

    worksheet.getCell(`C${headerRow1}`).value = "Puntos";



    [worksheet.getCell(`A${headerRow1}`), worksheet.getCell(`B${headerRow1}`), worksheet.getCell(`C${headerRow1}`)].forEach((cell) => {

      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };

      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C81" } };

      cell.border = {

        top: { style: "thin", color: { argb: "FF1E3A5F" } },

        left: { style: "thin", color: { argb: "FF1E3A5F" } },

        bottom: { style: "thin", color: { argb: "FF1E3A5F" } },

        right: { style: "thin", color: { argb: "FF1E3A5F" } }

      };

    });



    let colIndex = 4;

    for (const def of itemDefs) {

      const startCol = colIndex;

      const endCol = colIndex + 1;

      worksheet.mergeCells(headerRow1, startCol, headerRow1, endCol);

      worksheet.getCell(headerRow1, startCol).value = def.label;

      worksheet.getCell(headerRow2, startCol).value = "Cantidad";

      worksheet.getCell(headerRow2, endCol).value = "Valor";



      for (const coord of [[headerRow1, startCol], [headerRow2, startCol], [headerRow2, endCol]]) {

        const cell = worksheet.getCell(coord[0], coord[1]);

        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };

        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C81" } };

        cell.border = {

          top: { style: "thin", color: { argb: "FF1E3A5F" } },

          left: { style: "thin", color: { argb: "FF1E3A5F" } },

          bottom: { style: "thin", color: { argb: "FF1E3A5F" } },

          right: { style: "thin", color: { argb: "FF1E3A5F" } }

        };

      }



      colIndex += 2;

    }



    const dataStartRow = 13;

    rows.forEach((row: any, index: number) => {

      const excelRow = dataStartRow + index;

      const values = [

        row.Indicador,

        row.NumeroLecciones,

        row.Puntos,

        row.SR_Cantidad, row.SR_Valor,

        row.RC_Cantidad, row.RC_Valor,

        row.C_Cantidad, row.C_Valor,

        row.I_Cantidad, row.I_Valor,

        row.RE_Cantidad, row.RE_Valor,

        row.RP_Cantidad, row.RP_Valor,

        row.RR_Cantidad, row.RR_Valor,

        row.RCas_Cantidad, row.RCas_Valor,

        row.PE_Cantidad, row.PE_Valor

      ];



      values.forEach((value, columnIndex) => {

        const cell = worksheet.getCell(excelRow, columnIndex + 1);

        cell.value = value;

        cell.border = {

          top: { style: "thin", color: { argb: "FFD5DCE6" } },

          left: { style: "thin", color: { argb: "FFD5DCE6" } },

          bottom: { style: "thin", color: { argb: "FFD5DCE6" } },

          right: { style: "thin", color: { argb: "FFD5DCE6" } }

        };

        cell.alignment = columnIndex === 0

          ? { wrapText: true, vertical: "middle" }

          : { horizontal: "center", vertical: "middle" };

        if (columnIndex === 1) cell.numFmt = "0.00";

        if (columnIndex === 2) cell.numFmt = "0.00";

        if (columnIndex >= 3 && columnIndex % 2 === 1) {

          cell.numFmt = "0.00";

        }

        if (columnIndex >= 3 && columnIndex % 2 === 0) {

          cell.numFmt = "0";

        }

      });

    });



    const totalRow = dataStartRow + rows.length;

    worksheet.getCell(totalRow, 1).value = "SUMA TOTAL";

    worksheet.getCell(totalRow, 1).font = { bold: true, color: { argb: "FF0F172A" } };

    worksheet.getCell(totalRow, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } };

    worksheet.getCell(totalRow, 1).border = {

      top: { style: "medium", color: { argb: "FF0F4C81" } },

      left: { style: "medium", color: { argb: "FF0F4C81" } },

      bottom: { style: "medium", color: { argb: "FF0F4C81" } },

      right: { style: "medium", color: { argb: "FF0F4C81" } }

    };



    const sumColumns = [2, 3, ...Array.from({ length: itemDefs.length * 2 }, (_, idx) => idx + 4)];

    sumColumns.forEach((columnNumber) => {

      const columnLetter = worksheet.getColumn(columnNumber).letter;

      const formulaRange = rows.length > 0 ? `${columnLetter}${dataStartRow}:${columnLetter}${totalRow - 1}` : null;

      const total = rows.length > 0

        ? rows.reduce((acc: number, _row: any, rowIndex: number) => {

            const value = Number(worksheet.getCell(dataStartRow + rowIndex, columnNumber).value || 0);

            return acc + (Number.isFinite(value) ? value : 0);

          }, 0)

        : 0;

      const cell = worksheet.getCell(totalRow, columnNumber);

      cell.value = formulaRange

        ? { formula: `SUM(${formulaRange})`, result: total }

        : total;

      cell.font = { bold: true, color: { argb: "FF0F172A" } };

      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } };

      cell.border = {

        top: { style: "medium", color: { argb: "FF0F4C81" } },

        left: { style: "medium", color: { argb: "FF0F4C81" } },

        bottom: { style: "medium", color: { argb: "FF0F4C81" } },

        right: { style: "medium", color: { argb: "FF0F4C81" } }

      };

      cell.alignment = { horizontal: "center", vertical: "middle" };

      if (columnNumber === 2 || columnNumber === 3 || columnNumber % 2 === 1) cell.numFmt = "0.00";

      if (columnNumber >= 4 && columnNumber % 2 === 0) cell.numFmt = "0";

    });



    worksheet.autoFilter = {

      from: { row: headerRow1, column: 1 },

      to: { row: totalRow, column: 21 }

    };



    const rawBuffer: any = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer as any);

    const safeName = String(actividad.ActividadNombre || "tabla_especificaciones").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");

    const filename = `${safeName || "tabla_especificaciones"}_${actividadId}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    return res.send(buffer);

  } catch (error) {

    console.error("Error exportando tabla de especificaciones a Excel:", error);

    return res.status(500).json({ ok: false, message: "No se pudo descargar la tabla de especificaciones en Excel" });

  }

});

router.get("/indicadores", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const estructuraGrupoId = toOptionalNumber(req.query.estructuraGrupoId);

    const planeamientoId = toOptionalNumber(req.query.planeamientoId);

    const tipoUso = normalizeText(req.query.tipoUso);

    const pool = await getPool();



    let estructuraIdFinal = estructuraGrupoId;



    if (planeamientoId && !estructuraIdFinal) {

      const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, null);

      if (!contexto) return;

      estructuraIdFinal = Number(contexto.estructura.EstructuraGrupoId);

    }



    if (!estructuraIdFinal) {

      return badRequest(res, "Debés indicar estructuraGrupoId o planeamientoId");

    }



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraIdFinal);

    if (!estructura) return;



    const request = pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraIdFinal);



    const filters = [
      "i.EstructuraGrupoId = @estructuraGrupoId",
      "ISNULL(i.Activo, 1) = 1"
    ];



    if (planeamientoId) {

      request.input("planeamientoId", sql.Int, planeamientoId);

      filters.push("i.PlaneamientoId = @planeamientoId");

    }



    if (tipoUso) {

      request.input("tipoUso", sql.NVarChar(50), tipoUso);

      filters.push("i.TipoUso = @tipoUso");

    }



    const result = await request.query(`

      SELECT

        i.*

      FROM dbo.Eval360_IndicadorGrupo i

      WHERE ${filters.join(" AND ")}

      ORDER BY

        CASE i.TipoUso

          WHEN N'Cotidiano' THEN 1

          WHEN N'Tareas' THEN 2

          WHEN N'TablaEspecificaciones' THEN 3

          ELSE 9

        END,

        i.IndicadorGrupoId

      OPTION (MAX_GRANT_PERCENT = 1)

    `);



    return ok(res, result.recordset);

  } catch (error) {

    console.error("Error listando indicadores Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron cargar los indicadores" });

  }

});



async function getEstructuraDesdePlaneamiento(req: any, res: any, pool: any, planeamientoId: number, estructuraGrupoId?: number | null) {

  const institucionId = getInstitutionId(req, res);

  if (institucionId === null) return null;



  const userId = getUserId(req);



  if (estructuraGrupoId) {

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return null;



    const planeamientoLookup = await pool.request()

      .input("planeamientoId", sql.Int, planeamientoId)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .query(`

        SELECT TOP 1 p.*

        FROM dbo.Planeamiento p

        INNER JOIN dbo.Eval360_EstructuraGrupo eg

          ON eg.GrupoId = p.GrupoId

         AND eg.MateriaId = p.MateriaId

         AND eg.AnioLectivoId = p.AnioLectivoId

         AND eg.PeriodoId = p.PeriodoId

        WHERE p.PlaneamientoId = @planeamientoId

          AND eg.EstructuraGrupoId = @estructuraGrupoId

          AND p.Activo = 1

      `);



    if (!planeamientoLookup.recordset[0]) {

      badRequest(res, "El planeamiento seleccionado no pertenece a la estructura indicada");

      return null;

    }



    return {

      estructura,

      planeamiento: planeamientoLookup.recordset[0]

    };

  }



  const request = pool.request()

    .input("planeamientoId", sql.Int, planeamientoId)

    .input("institucionId", sql.Int, institucionId)

    .input("usuarioId", sql.Int, userId || null);



  const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)

    ? `

      AND EXISTS (

        SELECT 1

        FROM dbo.AsignacionDocente ad

        WHERE ad.Activo = 1

          AND ad.InstitucionId = p.InstitucionId

          AND ad.GrupoId = p.GrupoId

          AND ad.MateriaId = p.MateriaId

          AND ad.AnioLectivoId = p.AnioLectivoId

          AND ad.PeriodoId = p.PeriodoId

          AND ad.UsuarioId = @usuarioId

      )

    `

    : "";



  const planeamientoResult = await request.query(`

    SELECT TOP 1 p.*

    FROM dbo.Planeamiento p

    WHERE p.PlaneamientoId = @planeamientoId

      AND p.InstitucionId = @institucionId

      AND p.Activo = 1

      ${filtroProfesor}

  `);



  const planeamiento = planeamientoResult.recordset[0];



  if (!planeamiento) {

    forbidden(res, "No tenés permisos para usar este planeamiento o no existe");

    return null;

  }



  const estructuraResult = await pool.request()

    .input("institucionId", sql.Int, institucionId)

    .input("grupoId", sql.Int, Number(planeamiento.GrupoId))

    .input("materiaId", sql.Int, Number(planeamiento.MateriaId))

    .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))

    .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))

    .query(`

      SELECT TOP 1 *

      FROM dbo.Eval360_EstructuraGrupo

      WHERE InstitucionId = @institucionId

        AND GrupoId = @grupoId

        AND MateriaId = @materiaId

        AND AnioLectivoId = @anioLectivoId

        AND PeriodoId = @periodoId

        AND Activo = 1

      ORDER BY EstructuraGrupoId DESC

    `);



  if (estructuraResult.recordset[0]) {

    return {

      estructura: estructuraResult.recordset[0],

      planeamiento

    };

  }



  const createResult = await pool.request()

    .input("institucionId", sql.Int, institucionId)

    .input("grupoId", sql.Int, Number(planeamiento.GrupoId))

    .input("materiaId", sql.Int, Number(planeamiento.MateriaId))

    .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))

    .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))

    .input("usuarioId", sql.Int, Number(planeamiento.UsuarioId || userId || 0) || null)

    .input("nombre", sql.NVarChar(200), `Estructura de evaluación - ${planeamiento.Nombre || "Planeamiento"}`)

    .query(`

      INSERT INTO dbo.Eval360_EstructuraGrupo

        (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)

      OUTPUT INSERTED.*

      VALUES

        (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, NULL, @nombre, 100, 1, SYSDATETIME())

    `);



  const estructuraCreada = createResult.recordset[0];



  await pool.request()

    .input("estructuraGrupoId", sql.Int, Number(estructuraCreada.EstructuraGrupoId))

    .input("institucionId", sql.Int, institucionId)

    .query(`

      INSERT INTO dbo.Eval360_NivelDesempenoGrupo

        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)

      SELECT

        @estructuraGrupoId,

        Nombre,

        Valor,

        Orden,

        Activo

      FROM dbo.Eval360_NivelDesempenoGlobal

      WHERE InstitucionId = @institucionId

        AND Activo = 1

      ORDER BY Orden

    `);



  return {

    estructura: estructuraCreada,

    planeamiento

  };

}





router.post("/indicadores/generar-desde-planeamiento", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;



    const planeamientoId = toRequiredNumber(req.body.planeamientoId, "planeamientoId", res);

    const estructuraGrupoId = toOptionalNumber(req.body.estructuraGrupoId);

    const plantillaPromptIAId = toOptionalNumber(req.body.plantillaPromptIAId);

    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);

    const tiposUsoRaw = Array.isArray(req.body.tiposUso) ? req.body.tiposUso : ["Cotidiano", "Tareas", "TablaEspecificaciones"];

    const grupoIdsSolicitados = toNumberList(req.body.grupoIds);



    if (planeamientoId === null) return;



    const tiposUso = tiposUsoRaw

      .map((item: any) => normalizeText(item))

      .filter((item: string) => ["Cotidiano", "Tareas", "TablaEspecificaciones"].includes(item));



    if (!tiposUso.length) return badRequest(res, "Debés indicar al menos un tipo de uso válido");



    const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, estructuraGrupoId);

    if (!contexto) return;



    const estructura = contexto.estructura;

    const { planeamiento, indicadores } = await getIndicadoresPlaneamiento(pool, estructura, planeamientoId);



    if (!planeamiento) return badRequest(res, "No se encontró el planeamiento seleccionado");

    if (!indicadores.length) return badRequest(res, "El planeamiento seleccionado no tiene indicadores de evaluación");



    const plantilla = await getPlantillaIndicadores(req, pool, plantillaPromptIAId);

    if (!plantilla) return badRequest(res, "No se encontró una plantilla IA activa de indicadores");



    const resultadosPorTipo: Record<string, any[]> = {};



    for (const tipoUso of tiposUso) {

      const prompt = buildPromptIndicadores({

        plantilla,

        indicadoresBase: indicadores,

        tipoUso,

        planeamientoNombre: planeamiento.Nombre,

        indicacionesDocente

      });



      const aiResult = await callOpenAiIndicadores(prompt);

      resultadosPorTipo[tipoUso] = normalizarIndicadoresGenerados(aiResult, indicadores);

    }



    const grupoIdsDestino = grupoIdsSolicitados.length

      ? grupoIdsSolicitados

      : [Number(estructura.GrupoId)];

    const placeholdersGrupos = grupoIdsDestino.map((_, index) => `@gid${index}`).join(", ");

    const requestEstructuras = pool.request()

      .input("institucionId", sql.Int, Number(estructura.InstitucionId))

      .input("materiaId", sql.Int, Number(estructura.MateriaId))

      .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))

      .input("periodoId", sql.Int, Number(estructura.PeriodoId))

      .input("usuarioId", sql.Int, getUserId(req) || null);

    grupoIdsDestino.forEach((grupoId, index) => requestEstructuras.input(`gid${index}`, sql.Int, grupoId));



    const filtroProfesor = isProfesor(req)

      ? `

        AND EXISTS (

          SELECT 1

          FROM dbo.AsignacionDocente ad

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

            AND ad.UsuarioId = @usuarioId

        )

      `

      : "";



    const estructurasDestinoResult = await requestEstructuras.query(`

      SELECT

        eg.EstructuraGrupoId,

        eg.GrupoId

      FROM dbo.Eval360_EstructuraGrupo eg

      WHERE eg.InstitucionId = @institucionId

        AND eg.MateriaId = @materiaId

        AND eg.AnioLectivoId = @anioLectivoId

        AND eg.PeriodoId = @periodoId

        AND eg.Activo = 1

        AND eg.GrupoId IN (${placeholdersGrupos})

        ${filtroProfesor}

    `);

    await transaction.begin();



    const estructurasDestino = [...(estructurasDestinoResult.recordset || [])];

    const plantillaBaseId = Number(estructura.PlantillaBaseId || 0);

    const gruposConEstructura = new Set(estructurasDestino.map((item: any) => Number(item.GrupoId)));

    const gruposSinEstructura = grupoIdsDestino.filter((grupoId) => !gruposConEstructura.has(Number(grupoId)));



    if (gruposSinEstructura.length && plantillaBaseId > 0) {

      for (const grupoId of gruposSinEstructura) {

        const creada = await new sql.Request(transaction)

          .input("institucionId", sql.Int, Number(estructura.InstitucionId))

          .input("grupoId", sql.Int, Number(grupoId))

          .input("materiaId", sql.Int, Number(estructura.MateriaId))

          .input("anioLectivoId", sql.Int, Number(estructura.AnioLectivoId))

          .input("periodoId", sql.Int, Number(estructura.PeriodoId))

          .input("usuarioId", sql.Int, getUserId(req) || null)

          .input("plantillaBaseId", sql.Int, plantillaBaseId)

          .input("nombre", sql.NVarChar(200), `Estructura de evaluación - ${planeamiento.Nombre || "Planeamiento"}`)

          .query(`

            INSERT INTO dbo.Eval360_EstructuraGrupo

              (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)

            OUTPUT INSERTED.EstructuraGrupoId, INSERTED.GrupoId

            VALUES

              (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, 100, 1, SYSDATETIME())

          `);



        const estructuraCreada = creada.recordset[0];

        if (!estructuraCreada) continue;



        await new sql.Request(transaction)

          .input("estructuraGrupoId", sql.Int, Number(estructuraCreada.EstructuraGrupoId))

          .input("institucionId", sql.Int, Number(estructura.InstitucionId))

          .query(`

            INSERT INTO dbo.Eval360_NivelDesempenoGrupo

              (EstructuraGrupoId, Nombre, Valor, Orden, Activo)

            SELECT

              @estructuraGrupoId,

              Nombre,

              Valor,

              Orden,

              Activo

            FROM dbo.Eval360_NivelDesempenoGlobal

            WHERE InstitucionId = @institucionId

              AND Activo = 1

            ORDER BY Orden

          `);



        await sincronizarEstructuraConPlantilla(

          transaction,

          Number(estructuraCreada.EstructuraGrupoId),

          plantillaBaseId

        );



        estructurasDestino.push({

          EstructuraGrupoId: Number(estructuraCreada.EstructuraGrupoId),

          GrupoId: Number(estructuraCreada.GrupoId)

        });

      }

    }



    if (!estructurasDestino.length) {

      return badRequest(res, "No hay secciones con plantilla de evaluación activa para aplicar los indicadores");

    }



    // Limpieza preventiva: si antes se generaron indicadores extra por el JSON

    // del planeamiento o por una respuesta de IA más larga, se desactivan para

    // que la pantalla muestre únicamente los indicadores base reales del planeamiento.

    const basesPermitidas = new Set(indicadores.map((base) => normalizeKey(base)));

    const tiposPermitidos = new Set(tiposUso.map((tipo) => normalizeKey(tipo)));

    for (const estructuraDestino of estructurasDestino) {

      const estructuraDestinoId = Number(estructuraDestino.EstructuraGrupoId);

      const grupoDestinoId = Number(estructuraDestino.GrupoId || 0);

      let planeamientoDestinoId = planeamientoId;

      if (grupoDestinoId && grupoDestinoId !== Number(planeamiento.GrupoId || 0)) {

        const planeamientoDestinoResult = await new sql.Request(transaction)

          .input("institucionId", sql.Int, Number(estructura.InstitucionId))

          .input("grupoId", sql.Int, grupoDestinoId)

          .input("materiaId", sql.Int, Number(planeamiento.MateriaId))

          .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))

          .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))

          .input("nombre", sql.NVarChar(200), String(planeamiento.Nombre || "").trim())

          .query(`

            SELECT TOP 1 PlaneamientoId

            FROM dbo.Planeamiento

            WHERE InstitucionId = @institucionId

              AND GrupoId = @grupoId

              AND MateriaId = @materiaId

              AND AnioLectivoId = @anioLectivoId

              AND PeriodoId = @periodoId

              AND Activo = 1

              AND LTRIM(RTRIM(ISNULL(Nombre, N''))) = @nombre

            ORDER BY PlaneamientoId DESC

          `);

        const planeamientoDestino = Number(planeamientoDestinoResult.recordset[0]?.PlaneamientoId || 0);

        if (planeamientoDestino > 0) {

          planeamientoDestinoId = planeamientoDestino;

        } else {

          const planeamientoFallbackResult = await new sql.Request(transaction)

            .input("institucionId", sql.Int, Number(estructura.InstitucionId))

            .input("grupoId", sql.Int, grupoDestinoId)

            .input("materiaId", sql.Int, Number(planeamiento.MateriaId))

            .input("anioLectivoId", sql.Int, Number(planeamiento.AnioLectivoId))

            .input("periodoId", sql.Int, Number(planeamiento.PeriodoId))

            .query(`

              SELECT TOP 1 PlaneamientoId

              FROM dbo.Planeamiento

              WHERE InstitucionId = @institucionId

                AND GrupoId = @grupoId

                AND MateriaId = @materiaId

                AND AnioLectivoId = @anioLectivoId

                AND PeriodoId = @periodoId

                AND Activo = 1

              ORDER BY PlaneamientoId DESC

            `);

          const planeamientoFallback = Number(planeamientoFallbackResult.recordset[0]?.PlaneamientoId || 0);

          if (planeamientoFallback > 0) planeamientoDestinoId = planeamientoFallback;

        }

      }

      const existentesParaPlaneamiento = await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)

        .input("planeamientoId", sql.Int, planeamientoDestinoId)

        .query(`

          SELECT IndicadorGrupoId, IndicadorBase, TipoUso

          FROM dbo.Eval360_IndicadorGrupo

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND PlaneamientoId = @planeamientoId

        `);



      const idsNoPermitidos = existentesParaPlaneamiento.recordset

        .filter((item: any) => !basesPermitidas.has(normalizeKey(item.IndicadorBase)) || !tiposPermitidos.has(normalizeKey(item.TipoUso)))

        .map((item: any) => Number(item.IndicadorGrupoId))

        .filter(Boolean);



      for (const indicadorGrupoId of idsNoPermitidos) {

        await new sql.Request(transaction)

          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

          .query(`

            UPDATE dbo.Eval360_IndicadorGrupo

            SET Activo = 0,

                UpdatedAt = SYSDATETIME()

            WHERE IndicadorGrupoId = @indicadorGrupoId

          `);

      }



      for (const tipoUso of tiposUso) {

        for (const item of resultadosPorTipo[tipoUso]) {

          const existing = await new sql.Request(transaction)

            .input("estructuraGrupoId", sql.Int, estructuraDestinoId)

            .input("planeamientoId", sql.Int, planeamientoDestinoId)

            .input("tipoUso", sql.NVarChar(50), tipoUso)

            .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)

            .query(`

              SELECT TOP 1 IndicadorGrupoId

              FROM dbo.Eval360_IndicadorGrupo

              WHERE EstructuraGrupoId = @estructuraGrupoId

                AND PlaneamientoId = @planeamientoId

                AND TipoUso = @tipoUso

                AND IndicadorBase = @indicadorBase

            `);



          if (existing.recordset[0]) {

            await new sql.Request(transaction)

              .input("indicadorGrupoId", sql.Int, existing.recordset[0].IndicadorGrupoId)

              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)

              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)

              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)

              .query(`

                UPDATE dbo.Eval360_IndicadorGrupo

                SET IndicadorAvanzado = @indicadorAvanzado,

                    IndicadorIntermedio = @indicadorIntermedio,

                    IndicadorInicial = @indicadorInicial,

                    Activo = 1,

                    UpdatedAt = SYSDATETIME()

                WHERE IndicadorGrupoId = @indicadorGrupoId

              `);

          } else {

            await new sql.Request(transaction)

              .input("estructuraGrupoId", sql.Int, estructuraDestinoId)

              .input("planeamientoId", sql.Int, planeamientoDestinoId)

              .input("tipoUso", sql.NVarChar(50), tipoUso)

              .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)

              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)

              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)

              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)

              .query(`

                INSERT INTO dbo.Eval360_IndicadorGrupo

                  (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)

                VALUES

                  (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())

              `);

          }

        }

      }

    }



    await transaction.commit();



    const indicadoresGuardados = await pool.request()

      .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))

      .input("planeamientoId", sql.Int, planeamientoId)

      .query(`

        SELECT *

        FROM dbo.Eval360_IndicadorGrupo

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND PlaneamientoId = @planeamientoId

          AND Activo = 1

        ORDER BY

          CASE TipoUso

            WHEN N'Cotidiano' THEN 1

            WHEN N'Tareas' THEN 2

            WHEN N'TablaEspecificaciones' THEN 3

            ELSE 9

          END,

          IndicadorGrupoId

      `);



    return created(res, {

      estructuraGrupoId: Number(estructura.EstructuraGrupoId),

      planeamientoId,

      plantillaPromptIAId: plantilla.Id,

      generadoConIA: !!getOpenAiApiKey(),

      estructurasAplicadas: estructurasDestino.length,

      gruposSolicitados: grupoIdsDestino,

      indicadores: indicadoresGuardados.recordset

    }, "Indicadores generados correctamente desde el planeamiento");

  } catch (error) {

    try {

      await transaction.rollback();

    } catch {}

    console.error("Error generando indicadores Eval360 desde planeamiento:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron generar los indicadores desde el planeamiento" });

  }

});

router.post("/indicadores/generar-desde-habilidades", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);

  try {

    if (!assertCanAccess(req, res)) return;

    const grupoId = toRequiredNumber(req.body.grupoId, "grupoId", res);

    const materiaId = toRequiredNumber(req.body.materiaId, "materiaId", res);

    const anioLectivoId = toRequiredNumber(req.body.anioLectivoId, "anioLectivoId", res);

    const periodoId = toRequiredNumber(req.body.periodoId, "periodoId", res);

    const plantillaPromptIAId = toOptionalNumber(req.body.plantillaPromptIAId);

    const habilidadesIds = toNumberList(req.body.habilidadesIds);

    const meses = (Array.isArray(req.body.meses) ? req.body.meses : [])
      .map((item: any) => normalizeText(item))
      .filter(Boolean);

    const cantidadPorHabilidad = Math.max(1, Math.min(10, Number(req.body.cantidadPorHabilidad || 1) || 1));

    const nombrePlaneamiento = normalizarNombreSinPlaneamiento(req.body.nombre);

    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);

    const tiposUsoRaw = Array.isArray(req.body.tiposUso) ? req.body.tiposUso : ["Cotidiano", "Tareas", "TablaEspecificaciones"];

    const tiposUso = tiposUsoRaw
      .map((item: any) => normalizeText(item))
      .filter((item: string) => ["Cotidiano", "Tareas", "TablaEspecificaciones"].includes(item));

    if ([grupoId, materiaId, anioLectivoId, periodoId].some((value) => value === null)) return;

    if (!habilidadesIds.length) return badRequest(res, "Seleccioná al menos una habilidad");

    if (!meses.length) return badRequest(res, "Seleccioná al menos un mes");

    if (!tiposUso.length) return badRequest(res, "Debés indicar al menos una rúbrica válida");

    const asignacionBase = await getAsignacionPermitida(req, res, {
      grupoId: Number(grupoId),
      materiaId: Number(materiaId),
      anioLectivoId: Number(anioLectivoId),
      periodoId: Number(periodoId)
    });

    if (!asignacionBase) return;

    const grupoIdsDestino = Array.from(new Set([
      Number(grupoId),
      ...toNumberList(req.body.grupoIds)
    ])).filter((item) => Number.isFinite(item) && item > 0);

    const asignacionesDestino: any[] = [];

    for (const grupoDestinoId of grupoIdsDestino) {

      const asignacion = await getAsignacionPermitida(req, res, {
        grupoId: Number(grupoDestinoId),
        materiaId: Number(materiaId),
        anioLectivoId: Number(anioLectivoId),
        periodoId: Number(periodoId)
      });

      if (!asignacion) return;

      asignacionesDestino.push(asignacion);

    }

    const plantilla = await getPlantillaIndicadores(req, pool, plantillaPromptIAId);

    if (!plantilla) return badRequest(res, "No se encontró una plantilla IA activa de indicadores");

    const placeholdersHabilidades = habilidadesIds.map((_, index) => `@hid${index}`).join(", ");

    const habilidadesRequest = pool.request()
      .input("institucionId", sql.Int, Number(asignacionBase.InstitucionId))
      .input("materiaId", sql.Int, Number(materiaId));

    habilidadesIds.forEach((id, index) => habilidadesRequest.input(`hid${index}`, sql.Int, id));

    meses.forEach((mes, index) => habilidadesRequest.input(`mes${index}`, sql.NVarChar(100), mes));

    const filtroMeses = meses.length
      ? `AND h.Mes IN (${meses.map((_, index) => `@mes${index}`).join(", ")})`
      : "";

    const habilidadesResult = await habilidadesRequest.query(`
      SELECT
        h.PlaneamientoHabilidadId,
        h.InstitucionId,
        h.MateriaId,
        COALESCE(m.Nombre, h.MateriaNombre) AS MateriaNombre,
        h.TipoColegio,
        h.Ciclo,
        h.Grado,
        h.Mes,
        h.Area,
        h.NumeroHabilidad,
        h.DescripcionHabilidad,
        h.DocumentoReferencia
      FROM dbo.PlaneamientoHabilidad h
      LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
      WHERE h.PlaneamientoHabilidadId IN (${placeholdersHabilidades})
        AND (h.InstitucionId = @institucionId OR h.InstitucionId IS NULL)
        AND h.MateriaId = @materiaId
        AND ISNULL(h.Activo, 1) = 1
        ${filtroMeses}
      ORDER BY h.Mes, h.Area, TRY_CONVERT(INT, h.NumeroHabilidad), h.NumeroHabilidad
    `);

    const habilidades = habilidadesResult.recordset || [];

    if (habilidades.length !== habilidadesIds.length) {
      return badRequest(res, "Una o más habilidades seleccionadas no están disponibles para los filtros indicados");
    }

    const promptBases = buildPromptIndicadoresBaseDesdeHabilidades({
      plantilla,
      habilidades,
      cantidadPorHabilidad,
      materiaNombre: String(asignacionBase.MateriaNombre || ""),
      grado: String(asignacionBase.GrupoNivel || ""),
      meses,
      nombre: nombrePlaneamiento,
      indicacionesDocente
    });

    const aiBases = await callOpenAiIndicadores(promptBases);

    const indicadoresBase = normalizarIndicadoresBaseDesdeHabilidades(aiBases, habilidades, cantidadPorHabilidad);

    if (!indicadoresBase.length) return badRequest(res, "No se pudieron crear indicadores desde las habilidades seleccionadas");

    const resultadosPorTipo: Record<string, any[]> = {};

    for (const tipoUso of tiposUso) {

      const prompt = buildPromptIndicadores({
        plantilla,
        indicadoresBase,
        tipoUso,
        planeamientoNombre: nombrePlaneamiento,
        indicacionesDocente
      });

      const aiResult = await callOpenAiIndicadores(prompt);

      resultadosPorTipo[tipoUso] = normalizarIndicadoresGenerados(aiResult, indicadoresBase);

    }

    const estructuraBaseResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacionBase.InstitucionId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, Number(materiaId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("periodoId", sql.Int, Number(periodoId))
      .query(`
        SELECT TOP 1 EstructuraGrupoId, PlantillaBaseId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    const plantillaBaseId = Number(estructuraBaseResult.recordset[0]?.PlantillaBaseId || 0) || null;

    await transaction.begin();

    const planeamientosPorGrupo = new Map<number, number>();

    const estructurasDestino: any[] = [];

    for (const asignacion of asignacionesDestino) {

      const grupoDestinoId = Number(asignacion.GrupoId);

      const estructuraDestino = await getOrCreateEstructuraIndicadoresHabilidades(transaction, {
        institucionId: Number(asignacion.InstitucionId),
        grupoId: grupoDestinoId,
        materiaId: Number(materiaId),
        anioLectivoId: Number(anioLectivoId),
        periodoId: Number(periodoId),
        usuarioId: Number(asignacion.UsuarioId || getUserId(req) || 0) || null,
        plantillaBaseId,
        nombre: nombrePlaneamiento
      });

      if (!estructuraDestino) continue;

      estructurasDestino.push(estructuraDestino);

      const planeamientoExistente = await new sql.Request(transaction)
        .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
        .input("grupoId", sql.Int, grupoDestinoId)
        .input("materiaId", sql.Int, Number(materiaId))
        .input("anioLectivoId", sql.Int, Number(anioLectivoId))
        .input("periodoId", sql.Int, Number(periodoId))
        .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req) || 0) || null)
        .input("nombre", sql.NVarChar(200), nombrePlaneamiento)
        .query(`
          SELECT TOP 1 PlaneamientoId
          FROM dbo.Planeamiento
          WHERE InstitucionId = @institucionId
            AND GrupoId = @grupoId
            AND MateriaId = @materiaId
            AND AnioLectivoId = @anioLectivoId
            AND PeriodoId = @periodoId
            AND UsuarioId = @usuarioId
            AND LTRIM(RTRIM(ISNULL(Nombre, N''))) = @nombre
            AND Activo = 1
          ORDER BY PlaneamientoId DESC
        `);

      let planeamientoDestinoId = Number(planeamientoExistente.recordset[0]?.PlaneamientoId || 0);

      if (!planeamientoDestinoId) {

        const creado = await new sql.Request(transaction)
          .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
          .input("anioLectivoId", sql.Int, Number(anioLectivoId))
          .input("periodoId", sql.Int, Number(periodoId))
          .input("grupoId", sql.Int, grupoDestinoId)
          .input("materiaId", sql.Int, Number(materiaId))
          .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req) || 0) || null)
          .input("nombre", sql.NVarChar(200), nombrePlaneamiento)
          .input("observaciones", sql.NVarChar(sql.MAX), "Indicadores creados desde habilidades con IA")
          .query(`
            INSERT INTO dbo.Planeamiento
              (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, Activo, CreatedAt)
            OUTPUT INSERTED.PlaneamientoId
            VALUES
              (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, NULL, NULL, @observaciones, 1, SYSDATETIME())
          `);

        planeamientoDestinoId = Number(creado.recordset[0]?.PlaneamientoId || 0);

      }

      if (!planeamientoDestinoId) continue;

      planeamientosPorGrupo.set(grupoDestinoId, planeamientoDestinoId);

      const basesPermitidas = new Set(indicadoresBase.map((base) => normalizeKey(base)));

      const indicadoresPlaneamientoExistentes = await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, planeamientoDestinoId)
        .query(`
          SELECT PlaneamientoIndicadorId, Descripcion
          FROM dbo.PlaneamientoIndicador
          WHERE PlaneamientoId = @planeamientoId
        `);

      for (const row of indicadoresPlaneamientoExistentes.recordset || []) {

        if (!basesPermitidas.has(normalizeKey(row.Descripcion))) {

          await new sql.Request(transaction)
            .input("planeamientoIndicadorId", sql.Int, Number(row.PlaneamientoIndicadorId))
            .query(`
              UPDATE dbo.PlaneamientoIndicador
              SET Activo = 0
              WHERE PlaneamientoIndicadorId = @planeamientoIndicadorId
            `);

        }

      }

      for (const indicadorBase of indicadoresBase) {

        const existente = (indicadoresPlaneamientoExistentes.recordset || []).find((row: any) =>
          normalizeKey(row.Descripcion) === normalizeKey(indicadorBase)
        );

        if (existente) {

          await new sql.Request(transaction)
            .input("planeamientoIndicadorId", sql.Int, Number(existente.PlaneamientoIndicadorId))
            .input("descripcion", sql.NVarChar(sql.MAX), indicadorBase)
            .query(`
              UPDATE dbo.PlaneamientoIndicador
              SET Descripcion = @descripcion,
                  Activo = 1
              WHERE PlaneamientoIndicadorId = @planeamientoIndicadorId
            `);

        } else {

          await new sql.Request(transaction)
            .input("planeamientoId", sql.Int, planeamientoDestinoId)
            .input("descripcion", sql.NVarChar(sql.MAX), indicadorBase)
            .query(`
              INSERT INTO dbo.PlaneamientoIndicador
                (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
              VALUES
                (@planeamientoId, @descripcion, NULL, 1, SYSDATETIME())
            `);

        }

      }

      const tiposPermitidos = new Set(tiposUso.map((tipo) => normalizeKey(tipo)));

      const existentesEval = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, Number(estructuraDestino.EstructuraGrupoId))
        .input("planeamientoId", sql.Int, planeamientoDestinoId)
        .query(`
          SELECT IndicadorGrupoId, IndicadorBase, TipoUso
          FROM dbo.Eval360_IndicadorGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND PlaneamientoId = @planeamientoId
        `);

      const idsNoPermitidos = existentesEval.recordset
        .filter((item: any) => !basesPermitidas.has(normalizeKey(item.IndicadorBase)) || !tiposPermitidos.has(normalizeKey(item.TipoUso)))
        .map((item: any) => Number(item.IndicadorGrupoId))
        .filter(Boolean);

      for (const indicadorGrupoId of idsNoPermitidos) {

        await new sql.Request(transaction)
          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
          .query(`
            UPDATE dbo.Eval360_IndicadorGrupo
            SET Activo = 0,
                UpdatedAt = SYSDATETIME()
            WHERE IndicadorGrupoId = @indicadorGrupoId
          `);

      }

      for (const tipoUso of tiposUso) {

        for (const item of resultadosPorTipo[tipoUso]) {

          const existing = await new sql.Request(transaction)
            .input("estructuraGrupoId", sql.Int, Number(estructuraDestino.EstructuraGrupoId))
            .input("planeamientoId", sql.Int, planeamientoDestinoId)
            .input("tipoUso", sql.NVarChar(50), tipoUso)
            .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)
            .query(`
              SELECT TOP 1 IndicadorGrupoId
              FROM dbo.Eval360_IndicadorGrupo
              WHERE EstructuraGrupoId = @estructuraGrupoId
                AND PlaneamientoId = @planeamientoId
                AND TipoUso = @tipoUso
                AND IndicadorBase = @indicadorBase
            `);

          if (existing.recordset[0]) {

            await new sql.Request(transaction)
              .input("indicadorGrupoId", sql.Int, Number(existing.recordset[0].IndicadorGrupoId))
              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)
              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)
              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)
              .query(`
                UPDATE dbo.Eval360_IndicadorGrupo
                SET IndicadorAvanzado = @indicadorAvanzado,
                    IndicadorIntermedio = @indicadorIntermedio,
                    IndicadorInicial = @indicadorInicial,
                    Activo = 1,
                    UpdatedAt = SYSDATETIME()
                WHERE IndicadorGrupoId = @indicadorGrupoId
              `);

          } else {

            await new sql.Request(transaction)
              .input("estructuraGrupoId", sql.Int, Number(estructuraDestino.EstructuraGrupoId))
              .input("planeamientoId", sql.Int, planeamientoDestinoId)
              .input("tipoUso", sql.NVarChar(50), tipoUso)
              .input("indicadorBase", sql.NVarChar(sql.MAX), item.indicadorBase)
              .input("indicadorAvanzado", sql.NVarChar(sql.MAX), item.indicadorAvanzado)
              .input("indicadorIntermedio", sql.NVarChar(sql.MAX), item.indicadorIntermedio)
              .input("indicadorInicial", sql.NVarChar(sql.MAX), item.indicadorInicial)
              .query(`
                INSERT INTO dbo.Eval360_IndicadorGrupo
                  (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
                VALUES
                  (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
              `);

          }

        }

      }

    }

    const planeamientoIdBase = Number(planeamientosPorGrupo.get(Number(grupoId)) || 0);

    const estructuraBase = estructurasDestino.find((item: any) => Number(item.GrupoId) === Number(grupoId)) || estructurasDestino[0];

    if (!planeamientoIdBase || !estructuraBase) {

      await transaction.rollback();

      return badRequest(res, "No se pudo preparar el conjunto de indicadores");

    }

    await transaction.commit();

    const indicadoresGuardados = await pool.request()
      .input("estructuraGrupoId", sql.Int, Number(estructuraBase.EstructuraGrupoId))
      .input("planeamientoId", sql.Int, planeamientoIdBase)
      .query(`
        SELECT *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND PlaneamientoId = @planeamientoId
          AND ISNULL(Activo, 1) = 1
        ORDER BY
          CASE TipoUso
            WHEN N'Cotidiano' THEN 1
            WHEN N'Tareas' THEN 2
            WHEN N'TablaEspecificaciones' THEN 3
            ELSE 9
          END,
          IndicadorGrupoId
      `);

    return created(res, {
      estructuraGrupoId: Number(estructuraBase.EstructuraGrupoId),
      planeamientoId: planeamientoIdBase,
      planeamientoNombre: nombrePlaneamiento,
      plantillaPromptIAId: plantilla.Id,
      generadoConIA: !!getOpenAiApiKey(),
      estructurasAplicadas: estructurasDestino.length,
      gruposSolicitados: grupoIdsDestino,
      indicadoresBase,
      indicadores: indicadoresGuardados.recordset
    }, "Indicadores generados correctamente desde habilidades");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error generando indicadores Eval360 desde habilidades:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron generar los indicadores desde habilidades" });

  }

});





router.post("/indicadores/planeamiento/:planeamientoId/manual", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);

  try {

    if (!assertCanAccess(req, res)) return;

    const planeamientoId = toRequiredNumber(req.params.planeamientoId, "planeamientoId", res);

    const estructuraGrupoId = toOptionalNumber(req.body.estructuraGrupoId);

    if (planeamientoId === null) return;

    const indicadorBase = normalizeText(req.body.indicadorBase);

    const indicadorAvanzado = normalizeText(req.body.indicadorAvanzado || indicadorBase);

    const indicadorIntermedio = normalizeText(req.body.indicadorIntermedio);

    const indicadorInicial = normalizeText(req.body.indicadorInicial);

    const tiposUsoRaw = Array.isArray(req.body.tiposUso) ? req.body.tiposUso : ["Cotidiano", "Tareas", "TablaEspecificaciones"];

    const tiposUso = tiposUsoRaw
      .map((item: any) => normalizeText(item))
      .filter((item: string) => ["Cotidiano", "Tareas", "TablaEspecificaciones"].includes(item));

    if (!indicadorBase || !indicadorAvanzado || !indicadorIntermedio || !indicadorInicial) {
      return badRequest(res, "Completá el indicador y sus niveles Avanzado, Intermedio e Inicial");
    }

    if (!tiposUso.length) return badRequest(res, "Seleccioná al menos una rúbrica");

    const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, Number(planeamientoId), estructuraGrupoId);

    if (!contexto) return;

    const estructura = contexto.estructura;

    await transaction.begin();

    const indicadorPlaneamientoExistente = await new sql.Request(transaction)
      .input("planeamientoId", sql.Int, Number(planeamientoId))
      .input("descripcion", sql.NVarChar(sql.MAX), indicadorBase)
      .query(`
        SELECT TOP 1 PlaneamientoIndicadorId
        FROM dbo.PlaneamientoIndicador
        WHERE PlaneamientoId = @planeamientoId
          AND Descripcion = @descripcion
      `);

    if (indicadorPlaneamientoExistente.recordset[0]) {
      await new sql.Request(transaction)
        .input("planeamientoIndicadorId", sql.Int, Number(indicadorPlaneamientoExistente.recordset[0].PlaneamientoIndicadorId))
        .input("descripcion", sql.NVarChar(sql.MAX), indicadorBase)
        .query(`
          UPDATE dbo.PlaneamientoIndicador
          SET Descripcion = @descripcion,
              Activo = 1
          WHERE PlaneamientoIndicadorId = @planeamientoIndicadorId
        `);
    } else {
      await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, Number(planeamientoId))
        .input("descripcion", sql.NVarChar(sql.MAX), indicadorBase)
        .query(`
          INSERT INTO dbo.PlaneamientoIndicador
            (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
          VALUES
            (@planeamientoId, @descripcion, NULL, 1, SYSDATETIME())
        `);
    }

    for (const tipoUso of tiposUso) {
      const existing = await new sql.Request(transaction)
        .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))
        .input("planeamientoId", sql.Int, Number(planeamientoId))
        .input("tipoUso", sql.NVarChar(50), tipoUso)
        .input("indicadorBase", sql.NVarChar(sql.MAX), indicadorBase)
        .query(`
          SELECT TOP 1 IndicadorGrupoId
          FROM dbo.Eval360_IndicadorGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND PlaneamientoId = @planeamientoId
            AND TipoUso = @tipoUso
            AND IndicadorBase = @indicadorBase
        `);

      if (existing.recordset[0]) {
        await new sql.Request(transaction)
          .input("indicadorGrupoId", sql.Int, Number(existing.recordset[0].IndicadorGrupoId))
          .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicadorAvanzado)
          .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicadorIntermedio)
          .input("indicadorInicial", sql.NVarChar(sql.MAX), indicadorInicial)
          .query(`
            UPDATE dbo.Eval360_IndicadorGrupo
            SET IndicadorAvanzado = @indicadorAvanzado,
                IndicadorIntermedio = @indicadorIntermedio,
                IndicadorInicial = @indicadorInicial,
                Activo = 1,
                UpdatedAt = SYSDATETIME()
            WHERE IndicadorGrupoId = @indicadorGrupoId
          `);
      } else {
        await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))
          .input("planeamientoId", sql.Int, Number(planeamientoId))
          .input("tipoUso", sql.NVarChar(50), tipoUso)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicadorBase)
          .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicadorAvanzado)
          .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicadorIntermedio)
          .input("indicadorInicial", sql.NVarChar(sql.MAX), indicadorInicial)
          .query(`
            INSERT INTO dbo.Eval360_IndicadorGrupo
              (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
            VALUES
              (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
          `);
      }
    }

    await transaction.commit();

    const result = await pool.request()
      .input("estructuraGrupoId", sql.Int, Number(estructura.EstructuraGrupoId))
      .input("planeamientoId", sql.Int, Number(planeamientoId))
      .query(`
        SELECT *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND PlaneamientoId = @planeamientoId
          AND ISNULL(Activo, 1) = 1
        ORDER BY
          CASE TipoUso
            WHEN N'Cotidiano' THEN 1
            WHEN N'Tareas' THEN 2
            WHEN N'TablaEspecificaciones' THEN 3
            ELSE 9
          END,
          IndicadorGrupoId
      `);

    return created(res, result.recordset, "Indicador agregado correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error agregando indicador manual Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo agregar el indicador" });

  }

});

router.put("/indicadores/:id", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const indicadorGrupoId = toRequiredNumber(req.params.id, "indicadorGrupoId", res);

    if (indicadorGrupoId === null) return;



    const pool = await getPool();



    const lookup = await pool.request()

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_IndicadorGrupo

        WHERE IndicadorGrupoId = @indicadorGrupoId

      `);



    const indicador = lookup.recordset[0];

    if (!indicador) return badRequest(res, "No se encontró el indicador");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(indicador.EstructuraGrupoId));

    if (!estructura) return;

    const indicadoresConUso = await getIndicadoresConUso(pool, [indicadorGrupoId]);

    if (indicadoresConUso.length) {

      return res.status(409).json({

        ok: false,

        message: "No se puede editar este indicador porque ya fue calificado en esta sección.",

        indicadoresConUso

      });

    }



    const indicadorAvanzado = normalizeText(req.body.indicadorAvanzado || indicador.IndicadorAvanzado);

    const indicadorIntermedio = normalizeText(req.body.indicadorIntermedio || indicador.IndicadorIntermedio);

    const indicadorInicial = normalizeText(req.body.indicadorInicial || indicador.IndicadorInicial);

    const activo = req.body.activo === undefined ? indicador.Activo : Boolean(req.body.activo);



    if (!indicadorAvanzado || !indicadorIntermedio || !indicadorInicial) {

      return badRequest(res, "Los textos de avanzado, intermedio e inicial son obligatorios");

    }



    const result = await pool.request()

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicadorAvanzado)

      .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicadorIntermedio)

      .input("indicadorInicial", sql.NVarChar(sql.MAX), indicadorInicial)

      .input("activo", sql.Bit, activo ? 1 : 0)

      .query(`

        UPDATE dbo.Eval360_IndicadorGrupo

        SET IndicadorAvanzado = @indicadorAvanzado,

            IndicadorIntermedio = @indicadorIntermedio,

            IndicadorInicial = @indicadorInicial,

            Activo = @activo,

            UpdatedAt = SYSDATETIME()

        OUTPUT INSERTED.*

        WHERE IndicadorGrupoId = @indicadorGrupoId

      `);



    return ok(res, result.recordset[0], "Indicador actualizado correctamente");

  } catch (error) {

    console.error("Error actualizando indicador Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo actualizar el indicador" });

  }

});









async function getIndicadoresConUso(pool: any, indicadorGrupoIds: number[]) {

  const ids = indicadorGrupoIds

    .map((id) => Number(id))

    .filter((id) => Number.isFinite(id) && id > 0);



  if (!ids.length) return [];



  const tablas = await pool.request().query(`

    SELECT TABLE_SCHEMA, TABLE_NAME

    FROM INFORMATION_SCHEMA.COLUMNS

    WHERE COLUMN_NAME = 'IndicadorGrupoId'

      AND TABLE_SCHEMA = 'dbo'

      AND TABLE_NAME <> 'Eval360_IndicadorGrupo'

  `);



  if (!tablas.recordset.length) return [];



  const valuesSql = ids.map((id) => `(${id})`).join(",");

  const unionSql = tablas.recordset.map((tabla: any) => {

    const schema = String(tabla.TABLE_SCHEMA).replace(/]/g, "]]" );

    const table = String(tabla.TABLE_NAME).replace(/]/g, "]]" );

    return `

      SELECT DISTINCT CAST(t.IndicadorGrupoId AS INT) AS IndicadorGrupoId,

             N'${schema}.${table}' AS TablaOrigen

      FROM [${schema}].[${table}] t

      INNER JOIN ids ON ids.IndicadorGrupoId = t.IndicadorGrupoId

    `;

  }).join("\nUNION ALL\n");



  const result = await pool.request().query(`

    WITH ids(IndicadorGrupoId) AS (

      SELECT v.IndicadorGrupoId

      FROM (VALUES ${valuesSql}) v(IndicadorGrupoId)

    )

    ${unionSql}

  `);



  return result.recordset || [];

}



function mensajeIndicadoresConUso() {

  return "No se pueden eliminar los indicadores porque ya tienen calificaciones o registros asociados en tareas o trabajo cotidiano.";

}



router.delete("/indicadores/planeamiento/:planeamientoId", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;



    const planeamientoId = toRequiredNumber(req.params.planeamientoId, "planeamientoId", res);

    if (planeamientoId === null) return;

    const grupoIdsSolicitados = toNumberList((req as any).body?.grupoIds);



    const contexto = await getEstructuraDesdePlaneamiento(req, res, pool, planeamientoId, null);

    if (!contexto) return;

    const nombrePlaneamientoBase = String(contexto?.planeamiento?.Nombre || "").trim();



    const estructuraBase = contexto.estructura;

    const grupoIdsDestino = grupoIdsSolicitados.length

      ? grupoIdsSolicitados

      : [Number(estructuraBase.GrupoId)];

    const placeholdersGrupos = grupoIdsDestino.map((_, index) => `@gid${index}`).join(", ");

    const requestEstructuras = pool.request()

      .input("institucionId", sql.Int, Number(estructuraBase.InstitucionId))

      .input("materiaId", sql.Int, Number(estructuraBase.MateriaId))

      .input("anioLectivoId", sql.Int, Number(estructuraBase.AnioLectivoId))

      .input("periodoId", sql.Int, Number(estructuraBase.PeriodoId))

      .input("usuarioId", sql.Int, getUserId(req) || null);

    grupoIdsDestino.forEach((grupoId, index) => requestEstructuras.input(`gid${index}`, sql.Int, grupoId));

    const filtroProfesor = isProfesor(req)

      ? `

        AND EXISTS (

          SELECT 1

          FROM dbo.AsignacionDocente ad

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

            AND ad.UsuarioId = @usuarioId

        )

      `

      : "";



    const estructurasDestinoResult = await requestEstructuras.query(`

      SELECT

        eg.EstructuraGrupoId

      FROM dbo.Eval360_EstructuraGrupo eg

      WHERE eg.InstitucionId = @institucionId

        AND eg.MateriaId = @materiaId

        AND eg.AnioLectivoId = @anioLectivoId

        AND eg.PeriodoId = @periodoId

        AND eg.Activo = 1

        AND eg.GrupoId IN (${placeholdersGrupos})

        ${filtroProfesor}

    `);

    const estructurasDestinoIds = (estructurasDestinoResult.recordset || [])

      .map((item: any) => Number(item.EstructuraGrupoId))

      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (!estructurasDestinoIds.length) {

      return badRequest(res, "No hay secciones con plantilla de evaluación activa para eliminar indicadores");

    }



    const indicadoresDestino: any[] = [];

    for (const estructuraGrupoId of estructurasDestinoIds) {

      const indicadoresReq = pool.request()

        .input("planeamientoId", sql.Int, planeamientoId)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId);

      if (nombrePlaneamientoBase) {

        indicadoresReq.input("nombrePlaneamientoBase", sql.NVarChar(200), nombrePlaneamientoBase);

      }

      const indicadoresResult = await indicadoresReq.query(`

          SELECT *

          FROM dbo.Eval360_IndicadorGrupo

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND (

              PlaneamientoId = @planeamientoId

              ${nombrePlaneamientoBase ? `

              OR EXISTS (

                SELECT 1

                FROM dbo.Planeamiento p

                WHERE p.PlaneamientoId = Eval360_IndicadorGrupo.PlaneamientoId

                  AND LTRIM(RTRIM(ISNULL(p.Nombre, N''))) = @nombrePlaneamientoBase

              )` : ""}

            )

            AND ISNULL(Activo, 1) = 1

        `);

      indicadoresDestino.push(...(indicadoresResult.recordset || []));

    }



    if (!indicadoresDestino.length) {

      return ok(res, { eliminados: 0 }, "No hay indicadores activos para eliminar");

    }



    const ids = Array.from(new Set(indicadoresDestino.map((item: any) => Number(item.IndicadorGrupoId)).filter(Boolean)));

    const indicadoresConUso = await getIndicadoresConUso(pool, ids);



    if (indicadoresConUso.length) {

      return res.status(409).json({

        ok: false,

        message: mensajeIndicadoresConUso(),

        indicadoresConUso

      });

    }



    await transaction.begin();



    for (const id of ids) {

      await new sql.Request(transaction)

        .input("indicadorGrupoId", sql.Int, id)

        .query(`

          UPDATE dbo.Eval360_IndicadorGrupo

          SET Activo = 0,

              UpdatedAt = SYSDATETIME()

          WHERE IndicadorGrupoId = @indicadorGrupoId

        `);

    }



    await transaction.commit();



    return ok(res, { eliminados: ids.length, estructurasAplicadas: estructurasDestinoIds.length }, "Indicadores eliminados correctamente");

  } catch (error) {

    try {

      await transaction.rollback();

    } catch {}

    console.error("Error eliminando indicadores Eval360 del planeamiento:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron eliminar los indicadores del planeamiento" });

  }

});



router.delete("/indicadores/:id", async (req, res) => {

  try {

    if (!assertCanAccess(req, res)) return;



    const indicadorGrupoId = toRequiredNumber(req.params.id, "indicadorGrupoId", res);

    if (indicadorGrupoId === null) return;



    const pool = await getPool();



    const lookup = await pool.request()

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_IndicadorGrupo

        WHERE IndicadorGrupoId = @indicadorGrupoId

      `);



    const indicador = lookup.recordset[0];

    if (!indicador) return badRequest(res, "No se encontró el indicador");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(indicador.EstructuraGrupoId));

    if (!estructura) return;



    const indicadoresConUso = await getIndicadoresConUso(pool, [indicadorGrupoId]);

    if (indicadoresConUso.length) {

      return res.status(409).json({

        ok: false,

        message: mensajeIndicadoresConUso(),

        indicadoresConUso

      });

    }



    await pool.request()

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .query(`

        UPDATE dbo.Eval360_IndicadorGrupo

        SET Activo = 0,

            UpdatedAt = SYSDATETIME()

        WHERE IndicadorGrupoId = @indicadorGrupoId

      `);



    return ok(res, null, "Indicador eliminado correctamente");

  } catch (error) {

    console.error("Error eliminando indicador Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo eliminar el indicador" });

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



function getRubroCorreoSeguimiento(tipoUso: string) {

  const key = normalizeKey(tipoUso);

  if (key.includes("TAREA")) return "Tareas";

  if (key.includes("COTIDIAN")) return "Trabajo cotidiano";

  return normalizeText(tipoUso) || "Seguimiento diario";

}



async function callOpenAiGeneric(prompt: string, debugAttempts?: OpenAiExamAttemptDebug[]) {

  const apiKey = getOpenAiApiKey();

  if (!apiKey) {

    console.error("OpenAI Eval360 examenes: OPENAI_API_KEY no esta configurada en el backend.");

    debugAttempts?.push({ stage: "responses", ok: false, status: null, model: getOpenAiExamModel(), detail: "OPENAI_API_KEY no configurada" });

    return null;

  }

  const model = getOpenAiExamModel();

  const body: Record<string, any> = {

    model,

    input: prompt,

    max_output_tokens: getOpenAiExamMaxOutputTokens()

  };

  if (!isGpt5FamilyModel(model)) {

    body.temperature = 0.2;

  }

  const response = await fetch("https://api.openai.com/v1/responses", {

    method: "POST",

    headers: {

      "Authorization": `Bearer ${apiKey}`,

      "Content-Type": "application/json"

    },

    body: JSON.stringify(body)

  });

  if (!response.ok) {

    const text = await response.text();

    console.error("Error OpenAI Eval360 exámenes:", text);

    debugAttempts?.push({

      stage: "responses",

      ok: false,

      status: response.status,

      model,

      detail: compactPromptText(text, 400)

    });

    return null;

  }

  const data: any = await response.json();

  const texto = extractOpenAiResponseText(data);

  if (!texto.trim()) {

    console.error("OpenAI Eval360 examenes respondio sin texto util:", JSON.stringify({

      id: data?.id || null,

      model: data?.model || model,

      status: data?.status || null,

      outputCount: Array.isArray(data?.output) ? data.output.length : 0,

      firstOutputType: Array.isArray(data?.output) && data.output[0] ? data.output[0]?.type || null : null,

      keys: data && typeof data === "object" ? Object.keys(data).slice(0, 20) : []

    }));

    debugAttempts?.push({

      stage: "responses",

      ok: true,

      status: 200,

      model,

      detail: compactPromptText(JSON.stringify({

        id: data?.id || null,

        status: data?.status || null,

        outputCount: Array.isArray(data?.output) ? data.output.length : 0,

        firstOutputType: Array.isArray(data?.output) && data.output[0] ? data.output[0]?.type || null : null

      }), 300)

    });

    const fallbackTexto = await callOpenAiGenericChatFallback(prompt, apiKey, model, debugAttempts);

    if (fallbackTexto.trim()) {

      return fallbackTexto;

    }

  }

  return texto;

}



async function callOpenAiGenericJsonStrict(prompt: string, debugAttempts?: OpenAiExamAttemptDebug[]) {

  const apiKey = getOpenAiApiKey();

  if (!apiKey) return "";

  const model = getOpenAiExamModel();

  return await callOpenAiGenericChatFallback(prompt, apiKey, model, debugAttempts);

}



async function callOpenAiGenericChatFallback(prompt: string, apiKey: string, model: string, debugAttempts?: OpenAiExamAttemptDebug[]) {

  try {

    const isGpt5Model = isGpt5FamilyModel(model);

    const body: Record<string, any> = {

      model,

      response_format: { type: "json_object" },

      messages: [

        {

          role: "system",

          content: "Debes devolver unicamente JSON valido, sin markdown ni texto extra."

        },

        {

          role: "user",

          content: prompt

        }

      ]

    };

    if (isGpt5Model) {

      body.max_completion_tokens = getOpenAiExamMaxOutputTokens();

    } else {

      body.temperature = 0.2;

      body.max_tokens = getOpenAiExamMaxOutputTokens();

    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {

      method: "POST",

      headers: {

        "Authorization": `Bearer ${apiKey}`,

        "Content-Type": "application/json"

      },

      body: JSON.stringify(body)

    });

    if (!response.ok) {

      const text = await response.text();

      console.error("Error OpenAI Eval360 examenes fallback chat:", response.status, text.slice(0, 1000));

      debugAttempts?.push({

        stage: "chat_completions",

        ok: false,

        status: response.status,

        model,

        detail: compactPromptText(text, 400)

      });

      return "";

    }

    const data: any = await response.json();

    const text = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!text) {

      debugAttempts?.push({

        stage: "chat_completions",

        ok: true,

        status: 200,

        model,

        detail: compactPromptText(JSON.stringify({

          id: data?.id || null,

          model: data?.model || model,

          choices: Array.isArray(data?.choices) ? data.choices.length : 0,

          finishReason: Array.isArray(data?.choices) && data?.choices?.[0] ? data.choices[0]?.finish_reason || null : null

        }), 300)

      });

    }

    return text;

  } catch (error) {

    console.error("Error OpenAI Eval360 examenes fallback chat:", error);

    debugAttempts?.push({

      stage: "chat_completions",

      ok: false,

      status: null,

      model,

      detail: compactPromptText(getReadableError(error), 300)

    });

    return "";

  }

}



function extractOpenAiResponseText(data: any) {

  const direct = String(data?.output_text || "").trim();

  if (direct) return direct;



  const collected: string[] = [];

  const visit = (node: any) => {

    if (!node) return;

    if (typeof node === "string") {

      const text = node.trim();

      if (text) collected.push(text);

      return;

    }

    if (Array.isArray(node)) {

      for (const item of node) visit(item);

      return;

    }

    if (typeof node !== "object") return;



    if (typeof node.text === "string" && node.text.trim()) {

      collected.push(node.text.trim());

    }

    if (typeof node.output_text === "string" && node.output_text.trim()) {

      collected.push(node.output_text.trim());

    }

    if (typeof node.content === "string" && node.content.trim()) {

      collected.push(node.content.trim());

    }

    if (Array.isArray(node.content)) {

      visit(node.content);

    }

    if (Array.isArray(node.output)) {

      visit(node.output);

    }

    if (Array.isArray(node.parts)) {

      visit(node.parts);

    }

    if (Array.isArray(node.messages)) {

      visit(node.messages);

    }

  };



  visit(data?.output);

  visit(data?.content);

  visit(data?.message);

  visit(data?.messages);



  return collected.join("\n").trim();

}



async function ensureEval360ExamenIATable(pool: any) {

  await pool.request().query(`

    IF OBJECT_ID('dbo.Eval360_ExamenIAGenerado', 'U') IS NULL

    BEGIN

      CREATE TABLE dbo.Eval360_ExamenIAGenerado (

        ExamenIAGeneradoId INT IDENTITY(1,1) PRIMARY KEY,

        EstructuraGrupoId INT NOT NULL,

        ActividadIdTabla INT NOT NULL,

        UsuarioId INT NULL,

        PlantillaPromptIAId INT NULL,

        Nombre NVARCHAR(250) NOT NULL,

        Materia NVARCHAR(150) NULL,

        Grado NVARCHAR(120) NULL,

        Periodo NVARCHAR(120) NULL,

        TipoColegio NVARCHAR(120) NULL,

        SeccionesJson NVARCHAR(MAX) NULL,

        FormatoSalidaNombre NVARCHAR(255) NULL,

        Indicaciones NVARCHAR(MAX) NULL,

        DocumentoApoyoNombre NVARCHAR(255) NULL,

        EncabezadoJson NVARCHAR(MAX) NULL,

        PromptGenerado NVARCHAR(MAX) NULL,

        ResultadoIA NVARCHAR(MAX) NULL,

        Activo BIT NOT NULL CONSTRAINT DF_Eval360_ExamenIAGenerado_Activo DEFAULT(1),

        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ExamenIAGenerado_CreatedAt DEFAULT(SYSDATETIME()),

        UpdatedAt DATETIME2 NULL

      );

    END;



    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FormatoSalidaMimeType') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_ExamenIAGenerado

      ADD FormatoSalidaMimeType NVARCHAR(150) NULL;

    END;



    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FormatoSalidaDocxBase64') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_ExamenIAGenerado

      ADD FormatoSalidaDocxBase64 NVARCHAR(MAX) NULL;

    END;



    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'FuenteWord') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_ExamenIAGenerado

      ADD FuenteWord NVARCHAR(120) NULL;

    END;



    IF COL_LENGTH('dbo.Eval360_ExamenIAGenerado', 'TamanoWordPt') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_ExamenIAGenerado

      ADD TamanoWordPt INT NULL;

    END;

  `);

}



async function ensureEval360SeguimientoRecuperacionColumns(pool: any) {

  await pool.request().query(`

    IF COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacion') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_SeguimientoIndicador

      ADD ActRecuperacion BIT NOT NULL CONSTRAINT DF_Eval360_SeguimientoIndicador_ActRecuperacion DEFAULT(0);

    END;



    IF COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacionTexto') IS NULL

    BEGIN

      ALTER TABLE dbo.Eval360_SeguimientoIndicador

      ADD ActRecuperacionTexto NVARCHAR(MAX) NULL;

    END;

  `);

}



function toHtmlWithLineBreaks(value: any) {

  return escapeHtml(value).replace(/\r?\n/g, "<br/>");

}



function toHtmlWithLineBreaksAndBoldMarkers(value: any) {

  return escapeHtml(value)

    .replace(/\*([^*\r\n]+)\*/g, "<strong>$1</strong>")

    .replace(/\r?\n/g, "<br/>");

}



const MAIL_FROM_NOTIFICACIONES = "info@profe360cr.com";



async function sendEmailWithFallback(input: {

  to: string;

  cc?: string;

  subject: string;

  html: string;

  text: string;

}) {

  try {

    return await sendEmail({

      from: MAIL_FROM_NOTIFICACIONES,

      to: input.to,

      cc: input.cc,

      subject: input.subject,

      html: input.html,

      text: input.text

    });

  } catch (primaryError: any) {

    const fallbackFrom = String(env.mail.fromEmail || "").trim();

    if (!fallbackFrom || fallbackFrom.toLowerCase() === MAIL_FROM_NOTIFICACIONES.toLowerCase()) {

      throw primaryError;

    }

    return await sendEmail({

      from: fallbackFrom,

      to: input.to,

      cc: input.cc,

      subject: input.subject,

      html: input.html,

      text: input.text

    });

  }

}



function getReadableError(error: any) {

  const direct =

    error?.response?.data?.error?.message ||

    error?.response?.data?.message ||

    error?.error?.message ||

    error?.message;

  if (direct && String(direct).trim()) return String(direct).trim();

  try {

    return JSON.stringify(error);

  } catch {

    return "Error desconocido enviando correo";

  }

}



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

      CREATE INDEX IX_MensajeSeguimiento_InstitucionTipo

        ON dbo.MensajeSeguimiento (InstitucionId, TipoUso, ValorNivel, Activo);

    END

  `);

}



function normalizeTipoUsoMensaje(value: any) {

  const raw = String(value || "").trim().toUpperCase();

  if (raw.includes("COTIDIAN")) return "COTIDIANO";

  if (raw.includes("TAREA")) return "TAREA";

  if (raw.includes("ASIST")) return "ASISTENCIA";

  if (raw.includes("EXAM") || raw.includes("PRUEBA")) return "EXAMEN";

  return "";

}



async function resolverMensajeSeguimiento(pool: any, institucionId: number, tipoUso: string, valorNivel?: number | null) {

  await ensureMensajesSeguimientoTable(pool);

  const tipo = normalizeTipoUsoMensaje(tipoUso);

  if (!tipo) return null;

  const result = await pool.request()

    .input("institucionId", sql.Int, institucionId)

    .input("tipoUso", sql.NVarChar(30), tipo)

    .input("valorNivel", sql.Int, (valorNivel === 0 || (valorNivel && [1, 2, 3].includes(Number(valorNivel)))) ? Number(valorNivel) : null)

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



async function getCorreoNotificacionConfig(pool: any, institucionId: number, tipoUso: string) {

  const tipo = normalizeTipoUsoMensaje(tipoUso);

  if (!tipo) return null;

  const result = await pool.request()

    .input("institucionId", sql.Int, institucionId)

    .input("tipoUso", sql.NVarChar(30), tipo)

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



function buildSeguimientoCorreo(params: {

  estudianteNombre: string;

  tipoUso: string;

  materiaNombre?: string | null;

  anioNombre?: string | null;

  indicadorBase: string;

  estadoLabel: string;

  observacion?: string | null;

}) {

  const observacion = normalizeText(params.observacion);

  const rubro = getRubroCorreoSeguimiento(params.tipoUso);

  const materia = normalizeText(params.materiaNombre) || "Materia";

  const anio = normalizeText(params.anioNombre) || "año lectivo";

  const subject = `${params.estudianteNombre}-${rubro}-${materia} año lectivo ${anio}`;

  const text = observacion || `Se informa seguimiento académico de ${params.estudianteNombre}. Rubro: ${rubro}. Indicador: ${params.indicadorBase}. Resultado: ${params.estadoLabel}.`;

  const html = `

    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">

      <h2 style="margin: 0 0 12px; color: #1e3a8a;">Seguimiento académico Profe360</h2>

      <p>${escapeHtml(text)}</p>

      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0;" />

      <p><strong>Estudiante:</strong> ${escapeHtml(params.estudianteNombre)}</p>

      <p><strong>Rubro:</strong> ${escapeHtml(rubro)}</p>

      <p><strong>Materia:</strong> ${escapeHtml(materia)}</p>

      <p><strong>Año lectivo:</strong> ${escapeHtml(anio)}</p>

      <p><strong>Indicador:</strong> ${escapeHtml(params.indicadorBase)}</p>

      <p><strong>Resultado:</strong> ${escapeHtml(params.estadoLabel)}</p>

      <p style="margin-top: 20px; color: #475569;">Este correo fue enviado desde Profe360 por seguimiento académico.</p>

    </div>`;

  return { subject, text, html };

}



function buildSeguimientoMensaje(params: {

  estudianteNombre: string;

  tipoUso: string;

  indicadorBase: string;

  estadoLabel: string;

  observacion?: string | null;

}) {

  const correo = buildSeguimientoCorreo(params);

  return { text: correo.text, html: correo.html };

}



function formatSeguimientoExamenNota(puntosObtenidos: any, puntosMaximos: any) {

  const obtenidos = Number(puntosObtenidos ?? 0);

  const maximos = Number(puntosMaximos ?? 0);

  const nota = Number.isFinite(obtenidos) && Number.isFinite(maximos) && maximos > 0

    ? (obtenidos / maximos) * 100

    : obtenidos;

  if (!Number.isFinite(nota)) return "0";

  const rounded = Math.round(nota * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");

}



function buildSeguimientoExamenMensaje(params: {

  estudianteNombre: string;

  tipoExamen?: string | null;

  materiaNombre?: string | null;

  periodoNombre?: string | null;

  anioNombre?: string | null;

  profesorNombre?: string | null;

  puntosObtenidos?: number | null;

  puntosMaximos?: number | null;

  observacion?: string | null;

  mensajePersonalizado?: string | null;

}) {

  const estudiante = normalizeText(params.estudianteNombre) || "la persona estudiante";

  const rawTipoExamen = normalizeText(params.tipoExamen) || "Examen";

  const tipoExamen = rawTipoExamen.replace(/^(el|la)\s+/i, "").trim() || rawTipoExamen;

  const tipoExamenKey = normalizeKey(tipoExamen);

  const articuloExamen = tipoExamenKey.includes("PRUEBA") ? "la" : "el";

  const tipoExamenDisplay = tipoExamenKey.includes("PRUEBA")

    ? tipoExamen.replace(/^prueba\b/i, "Prueba")

    : tipoExamen;

  const fraseExamen = `${articuloExamen} ${tipoExamenDisplay}`;

  const materia = normalizeText(params.materiaNombre) || "la materia";

  const periodo = normalizeText(params.periodoNombre) || "el per\u00edodo";

  const anio = normalizeText(params.anioNombre);

  const periodoAnio = [periodo, anio].filter(Boolean).join("-");

  const profesor = normalizeText(params.profesorNombre) || "persona docente";

  const nota = formatSeguimientoExamenNota(params.puntosObtenidos, params.puntosMaximos);

  const mensajePersonalizado = normalizeText(params.mensajePersonalizado);

  if (mensajePersonalizado) {

    return {

      text: mensajePersonalizado,

      whatsappText: mensajePersonalizado,

      htmlBody: toHtmlWithLineBreaksAndBoldMarkers(mensajePersonalizado)

    };

  }

  const text = `Estimado(a) encargado(a) legal:\n\nPor este medio se informa que el estudiante ${estudiante} obtuvo una nota de ${nota} en la asignatura de ${materia} en ${fraseExamen} del ${periodoAnio || periodo}\n\nAtentamente,\nProf. ${profesor}\nDocente de ${materia}`;

  const whatsappText = `Estimado(a) encargado(a) legal:\n\nPor este medio se informa que el estudiante *${estudiante}* obtuvo una nota de *${nota}* en la asignatura de *${materia}* en ${fraseExamen} del *${periodoAnio || periodo}*\n\nAtentamente,\nProf. *${profesor}*\nDocente de *${materia}*`;

  const htmlBody = `Estimado(a) encargado(a) legal:<br/><br/>Por este medio se informa que el estudiante <strong>${escapeHtml(estudiante)}</strong> obtuvo una nota de <strong>${escapeHtml(nota)}</strong> en la asignatura de <strong>${escapeHtml(materia)}</strong> en ${escapeHtml(articuloExamen)} <strong>${escapeHtml(tipoExamenDisplay)}</strong> del <strong>${escapeHtml(periodoAnio || periodo)}</strong><br/><br/>Atentamente,<br/>Prof. <strong>${escapeHtml(profesor)}</strong><br/>Docente de <strong>${escapeHtml(materia)}</strong>`;

  return { text, whatsappText, htmlBody };

}



async function sendWhatsAppSeguimiento(params: { telefono?: string | null; mensaje: string }) {

  const telefono = normalizeWhatsAppPhone(params.telefono);

  if (!telefono) return { enviado: false, modo: "omitido", motivo: "Sin teléfono válido de encargado" };



  const mode = String(process.env.WHATSAPP_MODE || "simulado").trim().toLowerCase();

  const provider = String(process.env.WHATSAPP_PROVIDER || "generic").trim().toLowerCase();

  const webhookUrl = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();

  const webhookToken = String(process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();

  const webhookAuthHeader = String(process.env.WHATSAPP_WEBHOOK_AUTH_HEADER || "Authorization").trim() || "Authorization";

  const fromNumber = normalizeWhatsAppPhone(process.env.WHATSAPP_FROM_NUMBER || "");



  if (mode !== "webhook" || !webhookUrl) {

    console.log("WhatsApp seguimiento simulado:", { telefono, mensaje: params.mensaje });

    return { enviado: false, modo: "simulado", telefono, motivo: webhookUrl ? "WHATSAPP_MODE no es webhook" : "WHATSAPP_WEBHOOK_URL no configurado" };

  }



  try {

    const headers: Record<string, string> = {

      "Content-Type": "application/json"

    };

    let payload: Record<string, any> = {

      telefono,

      mensaje: String(params.mensaje || ""),

      canal: "whatsapp",

      origen: "profe360-seguimiento"

    };



    if (provider === "2chat") {

      if (!webhookToken) return { enviado: false, modo: "webhook", telefono, motivo: "WHATSAPP_WEBHOOK_TOKEN no configurado para 2Chat" };

      if (!fromNumber) return { enviado: false, modo: "webhook", telefono, motivo: "WHATSAPP_FROM_NUMBER no configurado para 2Chat" };

      headers["X-User-API-Key"] = webhookToken;

      payload = {

        from_number: fromNumber,

        to_number: telefono,

        text: String(params.mensaje || "")

      };

    } else if (webhookToken) {

      headers[webhookAuthHeader] = webhookToken.toLowerCase().startsWith("bearer ")

        ? webhookToken

        : `Bearer ${webhookToken}`;

    }



    const response = await fetch(webhookUrl, {

      method: "POST",

      headers,

      body: JSON.stringify(payload)

    });



    const rawBody = await response.text();

    if (!response.ok) {

      const snippet = rawBody.slice(0, 200);

      console.error("Error enviando WhatsApp por webhook:", response.status, snippet);

      return { enviado: false, modo: "webhook", telefono, status: response.status, error: snippet || "Respuesta no OK del proveedor" };

    }



    return { enviado: true, modo: "webhook", telefono, status: response.status };

  } catch (error: any) {

    const readable = String(error?.message || error || "Error desconocido");

    console.error("Excepción enviando WhatsApp por webhook:", readable);

    return { enviado: false, modo: "webhook", telefono, error: readable };

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



async function ensureNotaEdicionAuditoriaTable(pool: any) {

  await pool.request().query(`

    IF OBJECT_ID('dbo.Eval360_NotaEdicionAuditoria', 'U') IS NULL

    BEGIN

      CREATE TABLE dbo.Eval360_NotaEdicionAuditoria (

        NotaEdicionAuditoriaId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        NotaActividadId INT NOT NULL,

        ActividadId INT NOT NULL,

        EstudianteId INT NOT NULL,

        EstructuraGrupoId INT NOT NULL,

        EstructuraGrupoDetalleId INT NOT NULL,

        PorcentajeAnterior DECIMAL(10,2) NOT NULL,

        PorcentajeNuevo DECIMAL(10,2) NOT NULL,

        NotaAnterior DECIMAL(10,2) NOT NULL,

        NotaNueva DECIMAL(10,2) NOT NULL,

        PuntosAnterior DECIMAL(10,2) NOT NULL,

        PuntosNuevo DECIMAL(10,2) NOT NULL,

        Justificacion NVARCHAR(1000) NOT NULL,

        UsuarioId INT NULL,

        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_NotaEdicionAuditoria_CreatedAt DEFAULT(SYSDATETIME())

      );

      CREATE INDEX IX_Eval360_NotaEdicionAuditoria_ActividadEstudiante

        ON dbo.Eval360_NotaEdicionAuditoria (ActividadId, EstudianteId, CreatedAt DESC);

    END

  `);

}



async function ensureComponenteAjusteManualTables(pool: any) {

  await pool.request().query(`

    IF OBJECT_ID('dbo.Eval360_ComponenteAjusteManual', 'U') IS NULL

    BEGIN

      CREATE TABLE dbo.Eval360_ComponenteAjusteManual (

        ComponenteAjusteManualId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        EstructuraGrupoId INT NOT NULL,

        EstructuraGrupoDetalleId INT NOT NULL,

        EstudianteId INT NOT NULL,

        PorcentajeObtenidoComponente DECIMAL(10,2) NOT NULL,

        Justificacion NVARCHAR(1000) NULL,

        UsuarioId INT NULL,

        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManual_CreatedAt DEFAULT(SYSDATETIME()),

        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManual_UpdatedAt DEFAULT(SYSDATETIME())

      );

      CREATE UNIQUE INDEX UX_Eval360_ComponenteAjusteManual_Key

        ON dbo.Eval360_ComponenteAjusteManual (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId);

    END



    IF OBJECT_ID('dbo.Eval360_ComponenteAjusteManualAuditoria', 'U') IS NULL

    BEGIN

      CREATE TABLE dbo.Eval360_ComponenteAjusteManualAuditoria (

        ComponenteAjusteManualAuditoriaId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        EstructuraGrupoId INT NOT NULL,

        EstructuraGrupoDetalleId INT NOT NULL,

        EstudianteId INT NOT NULL,

        PorcentajeAnterior DECIMAL(10,2) NOT NULL,

        PorcentajeNuevo DECIMAL(10,2) NOT NULL,

        Justificacion NVARCHAR(1000) NOT NULL,

        UsuarioId INT NULL,

        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Eval360_ComponenteAjusteManualAuditoria_CreatedAt DEFAULT(SYSDATETIME())

      );

      CREATE INDEX IX_Eval360_ComponenteAjusteManualAuditoria_Key

        ON dbo.Eval360_ComponenteAjusteManualAuditoria (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, CreatedAt DESC);

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



function getEstadoLabelSeguimiento(estado: string) {

  if (estado === "NO_ENTREGADO") return "No entregado";

  if (estado === "AUSENTE") return "Ausente";

  if (estado === "INTERMEDIO") return "Intermedio";

  if (estado === "AVANZADO") return "Avanzado";

  return "Inicial";

}



const MAPA_SEGUIMIENTO_NIVELES: Record<string, { valor: number; orden: number }> = {

  INICIAL: { valor: 1, orden: 1 },

  INTERMEDIO: { valor: 2, orden: 2 },

  AVANZADO: { valor: 3, orden: 3 },

  AUSENTE: { valor: 0, orden: 4 },

  NO_ENTREGADO: { valor: 0, orden: 4 }

};



function normalizarEstadoSeguimiento(value: any, tipoUso?: string) {

  const key = normalizeKey(value).replace(/\s+/g, "_");

  if (["INICIAL", "INTERMEDIO", "AVANZADO", "AUSENTE", "NO_ENTREGADO"].includes(key)) return key;

  return normalizeKey(tipoUso).includes("TAREA") ? "NO_ENTREGADO" : "AUSENTE";

}



async function getOrCreateNivelSeguimiento(transaction: any, estructuraGrupoId: number, estado: string) {

  const meta = MAPA_SEGUIMIENTO_NIVELES[estado] || MAPA_SEGUIMIENTO_NIVELES.INICIAL;

  const nombre = estado === "NO_ENTREGADO" ? "No entregado" : estado === "AUSENTE" ? "Ausente" : estado.charAt(0) + estado.slice(1).toLowerCase();



  const existing = await new sql.Request(transaction)

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .input("nombre", sql.NVarChar(100), nombre)

    .query(`

      SELECT TOP 1 NivelDesempenoGrupoId

      FROM dbo.Eval360_NivelDesempenoGrupo

      WHERE EstructuraGrupoId = @estructuraGrupoId

        AND Nombre = @nombre

    `);



  if (existing.recordset[0]) return Number(existing.recordset[0].NivelDesempenoGrupoId);



  const inserted = await new sql.Request(transaction)

    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

    .input("nombre", sql.NVarChar(100), nombre)

    .input("valor", sql.Decimal(10, 2), meta.valor)

    .input("orden", sql.Int, meta.orden)

    .query(`

      INSERT INTO dbo.Eval360_NivelDesempenoGrupo

        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)

      OUTPUT INSERTED.NivelDesempenoGrupoId

      VALUES

        (@estructuraGrupoId, @nombre, @valor, @orden, 1)

    `);



  return Number(inserted.recordset[0].NivelDesempenoGrupoId);

}



async function recalcularNotaActividadIndicadores(transaction: any, params: {

  estructuraGrupoId: number;

  estructuraGrupoDetalleId: number;

  actividadId: number;

}) {

  const estudiantesResult = await new sql.Request(transaction)

    .input("actividadId", sql.Int, params.actividadId)

    .query(`

      SELECT DISTINCT EstudianteId

      FROM dbo.Eval360_SeguimientoIndicador

      WHERE ActividadId = @actividadId

    `);



  const indicadoresResult = await new sql.Request(transaction)

    .input("actividadId", sql.Int, params.actividadId)

    .query(`

      SELECT COUNT(DISTINCT IndicadorGrupoId) AS TotalIndicadores

      FROM dbo.Eval360_ActividadIndicador

      WHERE ActividadId = @actividadId

        AND ISNULL(Activo, 1) = 1

    `);



  const totalIndicadores = Number(indicadoresResult.recordset[0]?.TotalIndicadores || 0);

  const puntosMaximos = totalIndicadores * 3;



  for (const estudiante of estudiantesResult.recordset || []) {

    const estudianteId = Number(estudiante.EstudianteId);

    const resumenResult = await new sql.Request(transaction)

      .input("actividadId", sql.Int, params.actividadId)

      .input("estudianteId", sql.Int, estudianteId)

      .query(`

        SELECT ISNULL(SUM(ValorSeleccionado), 0) AS PuntosObtenidos

        FROM dbo.Eval360_SeguimientoIndicador

        WHERE ActividadId = @actividadId

          AND EstudianteId = @estudianteId

      `);



    const puntosObtenidos = Number(resumenResult.recordset[0]?.PuntosObtenidos || 0);

    const porcentajeObtenido = puntosMaximos > 0 ? Number(((puntosObtenidos / puntosMaximos) * 100).toFixed(2)) : 0;



    await new sql.Request(transaction)

      .input("actividadId", sql.Int, params.actividadId)

      .input("estudianteId", sql.Int, estudianteId)

      .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)

      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)

      .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)

      .query(`

        UPDATE dbo.Eval360_NotaActividad

        SET PuntosObtenidos = @puntosObtenidos,

            PuntosMaximos = @puntosMaximos,

            PorcentajeObtenido = @porcentajeObtenido,

            UpdatedAt = SYSDATETIME()

        WHERE ActividadId = @actividadId

          AND EstudianteId = @estudianteId;



        IF @@ROWCOUNT = 0

        BEGIN

          INSERT INTO dbo.Eval360_NotaActividad

            (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, CreatedAt)

          VALUES

            (@actividadId, @estudianteId, @puntosObtenidos, @puntosMaximos, @porcentajeObtenido, SYSDATETIME());

        END

      `);

  }

}



async function sincronizarNotaFormalDesdeActividad(transaction: any, params: {

  estructuraGrupoId: number;

  estructuraGrupoDetalleId: number;

  actividadId: number;

}) {

  const contextoResult = await new sql.Request(transaction)

    .input("estructuraGrupoId", sql.Int, params.estructuraGrupoId)

    .input("estructuraGrupoDetalleId", sql.Int, params.estructuraGrupoDetalleId)

    .input("actividadId", sql.Int, params.actividadId)

    .query(`

      SELECT TOP 1

        eg.GrupoId,

        eg.MateriaId,

        eg.PeriodoId,

        eg.PlantillaBaseId,

        d.Nombre AS ComponenteNombre,

        a.Nombre AS ActividadNombre

      FROM dbo.Eval360_EstructuraGrupo eg

      INNER JOIN dbo.Eval360_EstructuraGrupoDetalle d ON d.EstructuraGrupoId = eg.EstructuraGrupoId

      INNER JOIN dbo.Eval360_Actividad a ON a.EstructuraGrupoDetalleId = d.EstructuraGrupoDetalleId

      WHERE eg.EstructuraGrupoId = @estructuraGrupoId

        AND d.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

        AND a.ActividadId = @actividadId

    `);



  const contexto = contextoResult.recordset[0];

  if (!contexto?.PlantillaBaseId) return;



  const actividadPlantillaResult = await new sql.Request(transaction)

    .input("plantillaId", sql.Int, Number(contexto.PlantillaBaseId))

    .input("componenteNombre", sql.NVarChar(150), contexto.ComponenteNombre || "")

    .input("actividadNombre", sql.NVarChar(200), contexto.ActividadNombre || "")

    .query(`

      SELECT TOP 1

        ea.EvaluacionActividadId,

        CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,4)) AS PorcentajeReal

      FROM dbo.EvaluacionActividad ea

      INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId

      WHERE ec.EvaluacionPlantillaId = @plantillaId

        AND ISNULL(ec.Activo, 1) = 1

        AND ISNULL(ea.Activo, 1) = 1

        AND UPPER(LTRIM(RTRIM(ec.Descripcion))) = UPPER(LTRIM(RTRIM(@componenteNombre)))

        AND UPPER(LTRIM(RTRIM(ea.Descripcion))) = UPPER(LTRIM(RTRIM(@actividadNombre)))

      ORDER BY ea.Orden, ea.EvaluacionActividadId

    `);



  const actividadPlantilla = actividadPlantillaResult.recordset[0];

  if (!actividadPlantilla) return;



  const notasResult = await new sql.Request(transaction)

    .input("actividadId", sql.Int, params.actividadId)

    .query(`

      SELECT EstudianteId, NotaObtenida

      FROM dbo.Eval360_NotaActividad

      WHERE ActividadId = @actividadId

    `);



  for (const nota of notasResult.recordset || []) {

    const notaObtenida = Number(nota.NotaObtenida || 0);

    const porcentajeGanado = Number(((notaObtenida * Number(actividadPlantilla.PorcentajeReal || 0)) / 100).toFixed(4));



    await new sql.Request(transaction)

      .input("evaluacionActividadId", sql.Int, Number(actividadPlantilla.EvaluacionActividadId))

      .input("estudianteId", sql.Int, Number(nota.EstudianteId))

      .input("grupoId", sql.Int, Number(contexto.GrupoId))

      .input("materiaId", sql.Int, Number(contexto.MateriaId))

      .input("periodoId", sql.Int, Number(contexto.PeriodoId))

      .input("nota", sql.Decimal(10, 2), notaObtenida)

      .input("porcentajeGanado", sql.Decimal(10, 4), porcentajeGanado)

      .query(`

        UPDATE dbo.EvaluacionNota

        SET Nota = @nota,

            PorcentajeGanado = @porcentajeGanado,

            UpdatedAt = SYSDATETIME()

        WHERE EvaluacionActividadId = @evaluacionActividadId

          AND EstudianteId = @estudianteId

          AND GrupoId = @grupoId

          AND MateriaId = @materiaId

          AND PeriodoId = @periodoId;



        IF @@ROWCOUNT = 0

        BEGIN

          INSERT INTO dbo.EvaluacionNota

            (EvaluacionActividadId, EstudianteId, GrupoId, MateriaId, PeriodoId, Nota, PorcentajeGanado, Observacion, CreatedAt)

          VALUES

            (@evaluacionActividadId, @estudianteId, @grupoId, @materiaId, @periodoId, @nota, @porcentajeGanado, N'Calculada desde indicadores', SYSDATETIME());

        END

      `);

  }

}



router.get("/seguimiento/contexto", async (req, res) => {

  let cacheKey = "";

  let canUseCache = false;

  try {

    const t0 = Date.now();

    if (!assertCanAccess(req, res)) return;



    const grupoId = toRequiredNumber(req.query.grupoId, "grupoId", res);

    const materiaId = toRequiredNumber(req.query.materiaId, "materiaId", res);

    const anioLectivoId = toRequiredNumber(req.query.anioLectivoId, "anioLectivoId", res);

    const periodoId = toRequiredNumber(req.query.periodoId, "periodoId", res);

    const grupoClaseId = toOptionalGrupoClaseId(req.query.grupoClaseId);

    const sincronizarSolicitado = ["1", "true", "si", "sí"].includes(

      String(req.query.sincronizar ?? "").trim().toLowerCase()

    );

    const incluirAsistencia = ["1", "true", "si", "sÃ­"].includes(

      String(req.query.incluirAsistencia ?? "").trim().toLowerCase()

    );

    const incluirEnvios = ["1", "true", "si"].includes(

      String(req.query.incluirEnvios ?? "").trim().toLowerCase()

    );

    if (grupoId === null || materiaId === null || anioLectivoId === null || periodoId === null) return;



    const asignacion = await getAsignacionPermitida(req, res, { grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId });

    if (!asignacion) return;



    const institucionId = !isSuperAdmin(req) ? getInstitutionId(req, res) : Number(asignacion.InstitucionId || 0);

    if (institucionId === null) return;



    cacheKey = `${getContextCacheKeyFromParts({ institucionId, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId })}|asis:${incluirAsistencia ? 1 : 0}|env:${incluirEnvios ? 1 : 0}`;

    canUseCache = !sincronizarSolicitado;

    if (canUseCache) {

      const cached = contextoCache.get(cacheKey);

      if (cached && Date.now() - cached.at <= CONTEXTO_CACHE_TTL_MS) {

        console.log(`[eval360.contexto.cache.hit] ${cacheKey}`);

        return ok(res, cached.data);

      }

      const inFlight = contextoInFlight.get(cacheKey);

      if (inFlight) {

        console.log(`[eval360.contexto.cache.join] ${cacheKey}`);

        const sharedData = await inFlight;

        return ok(res, sharedData);

      }

    }



    const loadContextPromise = (async () => {

      const pool = await getPool();

      await ensureComponenteAjusteManualTables(pool);
      await ensureEval360GrupoClaseColumn(pool);



      const estructuraResult = await pool.request()

      .input("grupoId", sql.Int, grupoId)

      .input("materiaId", sql.Int, materiaId)

      .input("anioLectivoId", sql.Int, anioLectivoId)

      .input("periodoId", sql.Int, periodoId)

      .input("institucionId", sql.Int, institucionId)

      .input("grupoClaseId", sql.Int, grupoClaseId)

      .query(`

        SELECT TOP 1 eg.*, ep.Nombre AS PlantillaBaseNombre

        FROM dbo.Eval360_EstructuraGrupo eg

        LEFT JOIN dbo.EvaluacionPlantilla ep ON ep.EvaluacionPlantillaId = eg.PlantillaBaseId

        WHERE eg.InstitucionId = @institucionId

          AND eg.GrupoId = @grupoId

          AND eg.MateriaId = @materiaId

          AND eg.AnioLectivoId = @anioLectivoId

          AND eg.PeriodoId = @periodoId

          AND ISNULL(eg.GrupoClaseId, 0) = ISNULL(@grupoClaseId, 0)

          AND eg.Activo = 1

        ORDER BY eg.EstructuraGrupoId DESC

      `);



      const estructura = estructuraResult.recordset[0] || null;

      const estructuraGrupoId = estructura ? Number(estructura.EstructuraGrupoId) : 0;



      if (sincronizarSolicitado && estructuraGrupoId) {

        await timedQuery("eval360.contexto.syncTablaReplica", () =>

          syncTablaEspecificacionesDesdeGrupoHermanoSiFalta(pool, req, estructuraGrupoId)

        );

      }



    if (sincronizarSolicitado && estructuraGrupoId && Number(estructura?.PlantillaBaseId || 0) > 0) {

      await timedQuery("eval360.contexto.syncFaltantes", () =>

        sincronizarEstructuraConPlantillaSiFaltan(pool, estructuraGrupoId, Number(estructura.PlantillaBaseId))

      );



      const examenPlantillaCheck = await timedQuery("eval360.contexto.syncCheckPlantillaExamen", () =>

        pool.request()

          .input("plantillaBaseId", sql.Int, Number(estructura.PlantillaBaseId))

          .query(`

            SELECT TOP 1 ec.EvaluacionComponenteId

            FROM dbo.EvaluacionComponente ec

            WHERE ec.EvaluacionPlantillaId = @plantillaBaseId

              AND ISNULL(ec.Activo, 1) = 1

              AND (

                UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'

                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'

                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'

                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'

                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'

                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'

                OR UPPER(COALESCE(ec.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'

                OR UPPER(COALESCE(ec.Descripcion, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'

              )

          `)

      );



      if (examenPlantillaCheck.recordset[0]) {

        const examenDetalleCheck = await timedQuery("eval360.contexto.syncCheckDetalleExamen", () =>

          pool.request()

            .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

            .query(`

              SELECT TOP 1 d.EstructuraGrupoDetalleId

              FROM dbo.Eval360_EstructuraGrupoDetalle d

              LEFT JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId

              WHERE d.EstructuraGrupoId = @estructuraGrupoId

                AND ISNULL(d.Activo, 1) = 1

                AND (

                  UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'

                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'

                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'

                  OR UPPER(COALESCE(d.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'

                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%EXAM%'

                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%PRUEBA%'

                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%SUMATIVA%'

                  OR UPPER(COALESCE(c.Nombre, N'')) COLLATE Latin1_General_CI_AI LIKE N'%INSTRUMENTO%'

                )

            `)

        );



        if (!examenDetalleCheck.recordset[0]) {

          await timedQuery("eval360.contexto.syncForzadoExamen", () =>

            sincronizarEstructuraConPlantilla(pool, estructuraGrupoId, Number(estructura.PlantillaBaseId))

          );

        }

      }

    }



      const plantillasSectionKey = `plantillas|${institucionId}`;

      const estudiantesSectionKey = `estudiantes|${institucionId}|${grupoId}|${anioLectivoId}|gc:${Number(grupoClaseId || 0)}`;

      const planeamientosSectionKey = `planeamientos|${institucionId}|${grupoId}|${materiaId}|${anioLectivoId}|${periodoId}`;



      const plantillasCached = getSectionCache<any>(plantillasSectionKey);

      const estudiantesCached = getSectionCache<any>(estudiantesSectionKey);

      const planeamientosCached = getSectionCache<any>(planeamientosSectionKey);



      const [plantillas, estudiantes, planeamientos] = await Promise.all([

        plantillasCached ?? timedQuery("eval360.contexto.plantillas", () => pool.request()

          .input("institucionId", sql.Int, institucionId)

          .query(`

            SELECT EvaluacionPlantillaId, Nombre, Estado, DecimalesNota, PermitirProfesorEditar

            FROM dbo.EvaluacionPlantilla

            WHERE InstitucionId = @institucionId

              AND ISNULL(Activo, 1) = 1

              AND ISNULL(Estado, N'ACTIVA') <> N'INACTIVA'

            ORDER BY Nombre

          `)),

        estudiantesCached ?? timedQuery("eval360.contexto.estudiantes", () => {

          const estudiantesRequest = pool.request()

          .input("grupoId", sql.Int, grupoId)

          .input("anioLectivoId", sql.Int, anioLectivoId);

          if (!incluirEnvios) {

            return estudiantesRequest.query(`

              ;WITH estudiantesBase AS (

                SELECT

                  e.EstudianteId,

                  e.Identificacion,

                  e.Nombre,

                  e.PrimerApellido,

                  e.SegundoApellido,

                  e.Adecuacion AS TipoAdecuacion,

                  e.Correo,

                  e.Telefono,

                  e.AutorizaWhatsAppEncargado,

                  m.MatriculaId,

                  m.Estado AS EstadoMatricula,

                  m.GrupoId,

                  m.AnioLectivoId,

                  ${suspensionVigenteSelectSql}

                FROM dbo.Matricula m

                INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
                ${getSuspensionVigenteApplySql("e")}

                WHERE m.GrupoId = @grupoId

                  AND m.AnioLectivoId = @anioLectivoId

                  AND ISNULL(e.Activo, 1) = 1

                  AND ISNULL(m.Estado, N'Activa') IN (N'Activa', N'ACTIVA', N'Activo', N'ACTIVO')

              ),

              traslados AS (

                SELECT

                  h.EstudianteId,

                  CAST(1 AS bit) AS FueTrasladado,

                  h.GrupoIdOrigen AS GrupoIdOrigenTraslado,

                  go.Nombre AS GrupoNombreOrigenTraslado,

                  h.GrupoIdDestino AS GrupoIdDestinoTraslado,

                  h.CreatedAt AS TrasladoCreatedAt,

                  ROW_NUMBER() OVER (

                    PARTITION BY h.EstudianteId

                    ORDER BY h.CreatedAt DESC, h.MatriculaTrasladoHistorialId DESC

                  ) AS rn

                FROM dbo.MatriculaTrasladoHistorial h

                INNER JOIN estudiantesBase eb

                  ON eb.EstudianteId = h.EstudianteId

                 AND eb.AnioLectivoId = h.AnioLectivoId

                 AND eb.GrupoId = h.GrupoIdDestino

                LEFT JOIN dbo.Grupo go ON go.GrupoId = h.GrupoIdOrigen

              )

              SELECT

                eb.EstudianteId,

                eb.Identificacion,

                eb.Nombre,

                eb.PrimerApellido,

                eb.SegundoApellido,

                eb.TipoAdecuacion,

                eb.Correo,

                eb.Telefono,

                eb.AutorizaWhatsAppEncargado,

                CAST(NULL AS nvarchar(400)) AS EncargadoPrincipalNombre,

                CAST(NULL AS nvarchar(320)) AS EncargadoPrincipalCorreo,

                CAST(NULL AS nvarchar(80)) AS EncargadoPrincipalTelefono,

                CAST(NULL AS nvarchar(max)) AS EncargadosWhatsAppDetalle,

                eb.MatriculaId,

                eb.EstadoMatricula,

                eb.SuspensionId,

                eb.Suspendido,

                eb.MotivoSuspension,

                eb.FechaInicioSuspension,

                eb.FechaFinSuspension,

                eb.ObservacionSuspension,

                ISNULL(t.FueTrasladado, 0) AS FueTrasladado,

                t.GrupoIdOrigenTraslado,

                t.GrupoNombreOrigenTraslado,

                t.GrupoIdDestinoTraslado,

                t.TrasladoCreatedAt

              FROM estudiantesBase eb

              LEFT JOIN traslados t

                ON t.EstudianteId = eb.EstudianteId

               AND t.rn = 1

              ORDER BY eb.PrimerApellido, eb.SegundoApellido, eb.Nombre

            `);

          }

          return estudiantesRequest.query(`

            ;WITH estudiantesBase AS (

              SELECT

                e.EstudianteId,

                e.Identificacion,

                e.Nombre,

                e.PrimerApellido,

                e.SegundoApellido,

                e.Adecuacion AS TipoAdecuacion,

                e.Correo,

                e.Telefono,

                e.AutorizaWhatsAppEncargado,

                m.MatriculaId,

                m.Estado AS EstadoMatricula,

                m.GrupoId,

                m.AnioLectivoId,

                ${suspensionVigenteSelectSql}

              FROM dbo.Matricula m

              INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
              ${getSuspensionVigenteApplySql("e")}

              WHERE m.GrupoId = @grupoId

                AND m.AnioLectivoId = @anioLectivoId

                AND ISNULL(e.Activo, 1) = 1

                AND ISNULL(m.Estado, N'Activa') IN (N'Activa', N'ACTIVA', N'Activo', N'ACTIVO')

            ),

            encargadoPrincipal AS (

              SELECT

                ee.EstudianteId,

                CONCAT(en.Nombre, N' ', ISNULL(en.PrimerApellido, N''), N' ', ISNULL(en.SegundoApellido, N'')) AS NombreCompleto,

                en.Correo,

                en.Telefono,

                ROW_NUMBER() OVER (

                  PARTITION BY ee.EstudianteId

                  ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC

                ) AS rn

              FROM dbo.EstudianteEncargado ee

              INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId

              INNER JOIN estudiantesBase eb ON eb.EstudianteId = ee.EstudianteId

              WHERE ISNULL(ee.Activo, 1) = 1

                AND ISNULL(en.Activo, 1) = 1

            ),

            encargadosWhatsApp AS (

              SELECT

                eb.EstudianteId,

                STUFF((

                  SELECT DISTINCT

                    ' | ' +

                    COALESCE(NULLIF(LTRIM(RTRIM(ee2.Parentesco)), ''), CASE WHEN en2.TipoEncargado = 'MADRE' THEN 'Madre' WHEN en2.TipoEncargado = 'PADRE' THEN 'Padre' ELSE 'Encargado' END) +

                    ': ' + LTRIM(RTRIM(ISNULL(en2.Telefono, '')))

                  FROM dbo.EstudianteEncargado ee2

                  INNER JOIN dbo.Encargado en2 ON en2.EncargadoId = ee2.EncargadoId

                  WHERE ee2.EstudianteId = eb.EstudianteId

                    AND ISNULL(ee2.Activo, 1) = 1

                    AND ISNULL(en2.Activo, 1) = 1

                    AND ISNULL(ee2.RecibeNotificaciones, 1) = 1

                    AND LTRIM(RTRIM(ISNULL(en2.Telefono, ''))) <> ''

                  FOR XML PATH(''), TYPE

                ).value('.', 'nvarchar(max)'), 1, 3, '') AS Detalle

              FROM estudiantesBase eb

            ),

            traslados AS (

              SELECT

                h.EstudianteId,

                CAST(1 AS bit) AS FueTrasladado,

                h.GrupoIdOrigen AS GrupoIdOrigenTraslado,

                go.Nombre AS GrupoNombreOrigenTraslado,

                h.GrupoIdDestino AS GrupoIdDestinoTraslado,

                h.CreatedAt AS TrasladoCreatedAt,

                ROW_NUMBER() OVER (

                  PARTITION BY h.EstudianteId

                  ORDER BY h.CreatedAt DESC, h.MatriculaTrasladoHistorialId DESC

                ) AS rn

              FROM dbo.MatriculaTrasladoHistorial h

              INNER JOIN estudiantesBase eb

                ON eb.EstudianteId = h.EstudianteId

               AND eb.AnioLectivoId = h.AnioLectivoId

               AND eb.GrupoId = h.GrupoIdDestino

              LEFT JOIN dbo.Grupo go ON go.GrupoId = h.GrupoIdOrigen

            )

            SELECT

              eb.EstudianteId,

              eb.Identificacion,

              eb.Nombre,

              eb.PrimerApellido,

              eb.SegundoApellido,

              eb.TipoAdecuacion,

              eb.Correo,

              eb.Telefono,

              eb.AutorizaWhatsAppEncargado,

              ep.NombreCompleto AS EncargadoPrincipalNombre,

              ep.Correo AS EncargadoPrincipalCorreo,

              ep.Telefono AS EncargadoPrincipalTelefono,

              ewa.Detalle AS EncargadosWhatsAppDetalle,

              eb.MatriculaId,

              eb.EstadoMatricula,

              eb.SuspensionId,

              eb.Suspendido,

              eb.MotivoSuspension,

              eb.FechaInicioSuspension,

              eb.FechaFinSuspension,

              eb.ObservacionSuspension,

              ISNULL(t.FueTrasladado, 0) AS FueTrasladado,

              t.GrupoIdOrigenTraslado,

              t.GrupoNombreOrigenTraslado,

              t.GrupoIdDestinoTraslado,

              t.TrasladoCreatedAt

            FROM estudiantesBase eb

            LEFT JOIN encargadoPrincipal ep

              ON ep.EstudianteId = eb.EstudianteId

             AND ep.rn = 1

            LEFT JOIN encargadosWhatsApp ewa

              ON ewa.EstudianteId = eb.EstudianteId

            LEFT JOIN traslados t

              ON t.EstudianteId = eb.EstudianteId

             AND t.rn = 1

            ORDER BY eb.PrimerApellido, eb.SegundoApellido, eb.Nombre

          `);

        }),

        planeamientosCached ?? timedQuery("eval360.contexto.planeamientos", () => pool.request()

          .input("grupoId", sql.Int, grupoId)

          .input("materiaId", sql.Int, materiaId)

          .input("anioLectivoId", sql.Int, anioLectivoId)

          .input("periodoId", sql.Int, periodoId)

          .query(`

            SELECT

              PlaneamientoId,

              Nombre,

              CAST(NULL AS nvarchar(200)) AS Tema,

              -- El contexto solo necesita los aprendizajes para la tabla de
              -- especificaciones; el detalle completo se carga bajo demanda.
              CAST(CONCAT(
                N'{"aprendizajesEsperados":',
                COALESCE(
                  JSON_QUERY(
                    CASE WHEN ISJSON(ResultadoIAJson) = 1 THEN ResultadoIAJson ELSE NULL END,
                    '$.aprendizajesEsperados'
                  ),
                  N'[]'
                ),
                N'}'
              ) AS nvarchar(max)) AS ResultadoIAJson,

              FechaInicio,

              FechaFin

            FROM dbo.Planeamiento

            WHERE GrupoId = @grupoId

              AND MateriaId = @materiaId

              AND AnioLectivoId = @anioLectivoId

              AND PeriodoId = @periodoId

              AND ISNULL(Activo, 1) = 1

            ORDER BY CreatedAt DESC, PlaneamientoId DESC

          `))

      ]);



      if (!plantillasCached) setSectionCache(plantillasSectionKey, plantillas);

      if (!estudiantesCached) setSectionCache(estudiantesSectionKey, estudiantes);

      if (!planeamientosCached) setSectionCache(planeamientosSectionKey, planeamientos);



      const trasladoCacheKey = `${institucionId}|${grupoId}|${anioLectivoId}`;

      const ultimaReaplicacion = trasladosReaplicadosCache.get(trasladoCacheKey) || 0;

      if (sincronizarSolicitado && (Date.now() - ultimaReaplicacion) > TRASLADOS_REAPLICADOS_TTL_MS) {

        try {

          await timedQuery("eval360.contexto.reaplicarTraslados", () =>

            reaplicarTrasladosPendientesEnGrupo(pool, {

              institucionId,

              grupoIdDestino: grupoId,

              anioLectivoId

            })

          );

          trasladosReaplicadosCache.set(trasladoCacheKey, Date.now());

        } catch (trasladoError) {

          console.error("Error reaplicando traslados en eval360.contexto:", trasladoError);

        }

      }



      let detalles: any[] = [];

      let indicadores: any[] = [];

      let seguimientos: any[] = [];

      let actividades: any[] = [];

      let actividadIndicadores: any[] = [];

      let notasActividades: any[] = [];

      let asistenciaRegistros: any[] = [];

      let componenteAjustesManuales: any[] = [];

      let mensajesSeguimiento: any[] = [];



      if (estructuraGrupoId) {

        const [detallesResult, indicadoresResult, seguimientosResult, actividadesResult, actividadIndicadoresResult, notasActividadesResult, asistenciaResult, ajustesManualesResult] = await Promise.all([

        timedQuery("eval360.contexto.detalles", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT d.*, c.Nombre AS ComponenteCatalogoNombre

            FROM dbo.Eval360_EstructuraGrupoDetalle d

            INNER JOIN dbo.Eval360_ComponenteCatalogo c ON c.ComponenteCatalogoId = d.ComponenteCatalogoId

            WHERE d.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(d.Activo, 1) = 1

            ORDER BY d.Orden, d.EstructuraGrupoDetalleId

          `)),

        timedQuery("eval360.contexto.indicadores", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT i.*, p.Nombre AS PlaneamientoNombre

            FROM dbo.Eval360_IndicadorGrupo i

            LEFT JOIN dbo.Planeamiento p ON p.PlaneamientoId = i.PlaneamientoId

            WHERE i.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(i.Activo, 1) = 1

              AND i.TipoUso IN (N'Cotidiano', N'Tareas', N'TablaEspecificaciones')

            ORDER BY p.Nombre, i.TipoUso, i.IndicadorGrupoId

          `)),

        timedQuery("eval360.contexto.seguimientos", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT

              s.SeguimientoIndicadorId,

              s.ActividadId,

              s.IndicadorGrupoId,

              s.EstudianteId,

              s.NivelDesempenoGrupoId,

              s.ValorSeleccionado,

              s.Observacion,

              CASE WHEN COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacion') IS NULL THEN CAST(0 AS bit) ELSE ISNULL(s.ActRecuperacion, 0) END AS ActRecuperacion,

              CASE WHEN COL_LENGTH('dbo.Eval360_SeguimientoIndicador', 'ActRecuperacionTexto') IS NULL THEN NULL ELSE s.ActRecuperacionTexto END AS ActRecuperacionTexto,

              ng.Nombre AS NivelNombre,

              a.EstructuraGrupoDetalleId,

              a.Nombre AS ActividadNombre,

              a.Fuente,

              ${incluirEnvios ? "ISNULL(reb.CorreoEnviado, 0)" : "CAST(0 AS bit)"} AS CorreoEnviado,

              ${incluirEnvios ? "ISNULL(reb.WaEnviado, 0)" : "CAST(0 AS bit)"} AS WaEnviado

            FROM dbo.Eval360_SeguimientoIndicador s

            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = s.ActividadId

            INNER JOIN dbo.Eval360_NivelDesempenoGrupo ng ON ng.NivelDesempenoGrupoId = s.NivelDesempenoGrupoId

            ${incluirEnvios ? `LEFT JOIN dbo.ReporteEnvioBitacora reb

              ON reb.Modulo IN (N'COTIDIANO_INDICADOR', N'TAREAS_INDICADOR')

             AND reb.RegistroClave = CONCAT(

               N'COTI_IND|',

               CONVERT(varchar(20), s.ActividadId), N'|',

               CONVERT(varchar(20), s.IndicadorGrupoId), N'|',

               CONVERT(varchar(20), s.EstudianteId)

             )` : ""}

            WHERE a.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(a.Activo, 1) = 1

          `)),

        timedQuery("eval360.contexto.actividades", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT

              a.ActividadId,

              a.EstructuraGrupoId,

              a.EstructuraGrupoDetalleId,

              a.Nombre,

              a.Descripcion,

              a.Fecha,

              a.PuntosMaximos,

              a.PorcentajeDentroRubro,

              ISNULL(a.UsaIndicadoresPlaneamiento, 0) AS UsaIndicadoresPlaneamiento,

              a.Fuente,

              a.Activo

            FROM dbo.Eval360_Actividad a

            WHERE a.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(a.Activo, 1) = 1

            ORDER BY a.Fecha, a.ActividadId

          `)),

        timedQuery("eval360.contexto.actividadIndicadores", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT

              ai.ActividadId,

              ai.IndicadorGrupoId,

              ai.Activo,

              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'NumeroLecciones') IS NULL THEN NULL ELSE ai.NumeroLecciones END AS NumeroLecciones,

              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'Puntos') IS NULL THEN NULL ELSE ai.Puntos END AS Puntos,

              CASE WHEN COL_LENGTH('dbo.Eval360_ActividadIndicador', 'DetalleItemsJson') IS NULL THEN NULL ELSE ai.DetalleItemsJson END AS DetalleItemsJson

            FROM dbo.Eval360_ActividadIndicador ai

            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId

            WHERE a.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(a.Activo, 1) = 1

              AND ISNULL(ai.Activo, 1) = 1

          `)),

        timedQuery("eval360.contexto.notasActividades", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT

              n.NotaActividadId,

              n.ActividadId,

              n.EstudianteId,

              n.PuntosObtenidos,

              n.PuntosMaximos,

              n.NotaObtenida,

              n.PorcentajeObtenido,

              n.Observacion,

              CASE WHEN nea.NotaEdicionAuditoriaId IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS FueEditado,

              ${incluirEnvios ? "ISNULL(reb.CorreoEnviado, 0)" : "CAST(0 AS bit)"} AS CorreoEnviado,

              ${incluirEnvios ? "ISNULL(reb.WaEnviado, 0)" : "CAST(0 AS bit)"} AS WaEnviado

            FROM dbo.Eval360_NotaActividad n

            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = n.ActividadId

            OUTER APPLY (

              SELECT TOP 1 x.NotaEdicionAuditoriaId

              FROM dbo.Eval360_NotaEdicionAuditoria x

              WHERE x.NotaActividadId = n.NotaActividadId

              ORDER BY x.CreatedAt DESC

            ) nea

            ${incluirEnvios ? `LEFT JOIN dbo.ReporteEnvioBitacora reb

              ON reb.Modulo IN (N'COTIDIANO_ACTIVIDAD', N'TAREAS_ACTIVIDAD')

             AND reb.RegistroClave = CONCAT(

               N'COTI_ACT|',

               CONVERT(varchar(20), n.ActividadId), N'|',

               CONVERT(varchar(20), n.EstudianteId)

             )` : ""}

            WHERE a.EstructuraGrupoId = @estructuraGrupoId

              AND ISNULL(a.Activo, 1) = 1

          `)),

        incluirAsistencia ? timedQuery("eval360.contexto.asistencia", () => pool.request()

          .input("grupoId", sql.Int, grupoId)

          .input("materiaId", sql.Int, materiaId)

          .input("anioLectivoId", sql.Int, anioLectivoId)

          .input("periodoId", sql.Int, periodoId)

          .query(`

            SELECT

              ar.AsistenciaRegistroId,

              ar.EstudianteId,

              ar.Fecha,

              ar.Estado,

              ar.MinutosTardia,

              ar.Observacion,

              ${incluirEnvios ? "ISNULL(reb.CorreoEnviado, 0)" : "CAST(0 AS bit)"} AS CorreoEnviado,

              ${incluirEnvios ? "ISNULL(reb.WaEnviado, 0)" : "CAST(0 AS bit)"} AS WaEnviado,

              CASE WHEN COL_LENGTH('dbo.AsistenciaRegistro', 'HorarioGrupoId') IS NULL THEN NULL ELSE TRY_CONVERT(int, ar.HorarioGrupoId) END AS HorarioGrupoId,

              hg.BloqueHorarioId,

              bh.Nombre AS BloqueNombre,

              CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,

              CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin

            FROM dbo.AsistenciaRegistro ar

            ${incluirEnvios ? `LEFT JOIN dbo.ReporteEnvioBitacora reb

              ON reb.Modulo = N'ASISTENCIA'

             AND reb.RegistroClave = CONCAT(

               N'ASIS|',

               CONVERT(varchar(20), ar.GrupoId), N'|',

               CONVERT(varchar(20), ar.MateriaId), N'|',

               CONVERT(varchar(20), ar.PeriodoId), N'|',

               CONVERT(varchar(10), ar.Fecha, 23), N'|',

               CONVERT(varchar(20), ar.EstudianteId), N'|',

               CONVERT(varchar(20), ISNULL(ar.HorarioGrupoId, 0))

             )` : ""}

            LEFT JOIN dbo.HorarioGrupo hg ON COL_LENGTH('dbo.AsistenciaRegistro', 'HorarioGrupoId') IS NOT NULL AND hg.HorarioGrupoId = ar.HorarioGrupoId

            LEFT JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId

            WHERE ar.GrupoId = @grupoId

              AND ar.MateriaId = @materiaId

              AND ar.AnioLectivoId = @anioLectivoId

              AND ar.PeriodoId = @periodoId

          `)) : Promise.resolve({ recordset: [] }),

        timedQuery("eval360.contexto.ajustesManuales", () => pool.request()

          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

          .query(`

            SELECT

              EstructuraGrupoId,

              EstructuraGrupoDetalleId,

              EstudianteId,

              PorcentajeObtenidoComponente,

              Justificacion,

              UpdatedAt

            FROM dbo.Eval360_ComponenteAjusteManual

            WHERE EstructuraGrupoId = @estructuraGrupoId

          `))

      ]);



        detalles = detallesResult.recordset;

        indicadores = indicadoresResult.recordset;

        seguimientos = seguimientosResult.recordset;

        actividades = actividadesResult.recordset;

        actividadIndicadores = actividadIndicadoresResult.recordset;

        notasActividades = notasActividadesResult.recordset;

        asistenciaRegistros = asistenciaResult.recordset;

        componenteAjustesManuales = ajustesManualesResult.recordset;

      }



      mensajesSeguimiento = (await timedQuery("eval360.contexto.mensajesSeguimiento", () => pool.request()

      .input("institucionId", sql.Int, Number(institucionId || 0))

      .query(`

        SELECT

          MensajeSeguimientoId,

          TipoUso,

          ValorNivel,

          Titulo,

          Cuerpo

        FROM dbo.MensajeSeguimiento

        WHERE InstitucionId = @institucionId

          AND Activo = 1

        ORDER BY TipoUso, CASE WHEN ValorNivel IS NULL THEN 0 ELSE 1 END, MensajeSeguimientoId DESC

      `))).recordset;



      const data = {

        estructura,

        detalles,

        plantillas: plantillas.recordset,

        estudiantes: estudiantes.recordset,

        planeamientos: planeamientos.recordset,

        indicadores,

        actividades,

        actividadIndicadores,

        notasActividades,

        asistenciaRegistros,

        componenteAjustesManuales,

        seguimientos,

        mensajesSeguimiento

      };

      return data;

    })();



    if (canUseCache) {

      contextoInFlight.set(cacheKey, loadContextPromise);

    }



    let data: any;

    try {

      data = await loadContextPromise;

    } finally {

      if (canUseCache) contextoInFlight.delete(cacheKey);

    }



    if (canUseCache) {

      contextoCache.set(cacheKey, { at: Date.now(), data });

    }



    console.log(`[eval360.contexto.total] ${Date.now() - t0}ms`);

    return ok(res, data);

  } catch (error) {

    console.error("Error cargando contexto de seguimiento Eval360:", error);

    if (canUseCache && cacheKey) {

      const stale = contextoCache.get(cacheKey);

      if (stale?.data) {

        console.warn(`[eval360.contexto.cache.stale] ${cacheKey}`);

        return ok(res, stale.data, "Contexto cargado desde cache reciente");

      }

    }

    return res.status(500).json({ ok: false, message: "No se pudo cargar el seguimiento de notas" });

  }

});



router.post("/seguimiento/asignar-indicadores-actividad", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;



    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);

    const permitirMultiplesActividades = Boolean(req.body.permitirMultiplesActividades);

    const indicadorIds = Array.isArray(req.body.indicadorIds) ? req.body.indicadorIds.map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0) : [];

    const asignacionesRaw = Array.isArray(req.body.asignaciones) ? req.body.asignaciones : [];

    const asignacionesMap = new Map<number, { numeroLecciones: number; puntos: number; detalleItemsJson: string }>();

    for (const item of asignacionesRaw) {

      const indicadorId = Number(item?.indicadorId || 0);

      if (!Number.isFinite(indicadorId) || indicadorId <= 0) continue;

      const numeroLecciones = Number(item?.numeroLecciones ?? 0);

      const puntos = Number(item?.puntos ?? 0);

      const detalleItems = item?.detalleItems && typeof item.detalleItems === "object" ? item.detalleItems : {};

      asignacionesMap.set(indicadorId, {

        numeroLecciones: Number.isFinite(numeroLecciones) ? numeroLecciones : 0,

        puntos: Number.isFinite(puntos) ? puntos : 0,

        detalleItemsJson: JSON.stringify(detalleItems || {})

      });

    }



    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;



    const actividadResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT TOP 1 ActividadId

        FROM dbo.Eval360_Actividad

        WHERE ActividadId = @actividadId

          AND EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo, 1) = 1

      `);



    if (!actividadResult.recordset[0]) return badRequest(res, "La actividad no pertenece al componente seleccionado");



    const placeholders = indicadorIds.map((_, index) => `@indicadorId${index}`).join(", ");

    const requestIndicadores = pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("actividadId", sql.Int, actividadId);

    indicadorIds.forEach((id: number, index: number) => requestIndicadores.input(`indicadorId${index}`, sql.Int, id));



    if (indicadorIds.length) {

      const indicadoresValidos = await requestIndicadores.query(`

        SELECT IndicadorGrupoId

        FROM dbo.Eval360_IndicadorGrupo

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND ISNULL(Activo, 1) = 1

          AND IndicadorGrupoId IN (${placeholders})

      `);

      if ((indicadoresValidos.recordset || []).length !== indicadorIds.length) {

        return badRequest(res, "Hay indicadores inválidos o fuera de este grupo");

      }



      if (!permitirMultiplesActividades) {

        const indicadoresAsignadosOtraActividad = await requestIndicadores.query(`

          SELECT DISTINCT ai.IndicadorGrupoId

          FROM dbo.Eval360_ActividadIndicador ai

          INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId

          WHERE a.EstructuraGrupoId = @estructuraGrupoId

            AND ai.IndicadorGrupoId IN (${placeholders})

            AND ai.ActividadId <> @actividadId

            AND ISNULL(ai.Activo, 1) = 1

        `);

        if ((indicadoresAsignadosOtraActividad.recordset || []).length > 0) {

          return badRequest(res, "Uno o más indicadores ya están asignados a otra actividad");

        }



        const indicadoresCalificadosOtraActividad = await requestIndicadores.query(`

          SELECT DISTINCT si.IndicadorGrupoId

          FROM dbo.Eval360_SeguimientoIndicador si

          INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = si.ActividadId

          WHERE a.EstructuraGrupoId = @estructuraGrupoId

            AND si.IndicadorGrupoId IN (${placeholders})

            AND si.ActividadId <> @actividadId

        `);

        if ((indicadoresCalificadosOtraActividad.recordset || []).length > 0) {

          return badRequest(res, "Uno o más indicadores ya tienen calificaciones en otra actividad");

        }

      }

    }



    const indicadoresCalificadosRemovidos = await requestIndicadores.query(`

      SELECT DISTINCT si.IndicadorGrupoId

      FROM dbo.Eval360_SeguimientoIndicador si

      WHERE si.ActividadId = @actividadId

        ${indicadorIds.length ? `AND si.IndicadorGrupoId NOT IN (${placeholders})` : ""}

    `);

    if ((indicadoresCalificadosRemovidos.recordset || []).length > 0) {

      return badRequest(res, "No se pueden quitar indicadores que ya tienen calificaciones en esta actividad");

    }



    await transaction.begin();



    await upsertActividadIndicadores(transaction, actividadId, indicadorIds, asignacionesMap);



    const replicaTargets = await getEstructurasReplicaTablaMismoGrado(transaction, req, estructuraGrupoId);

    let replicasOmitidas = 0;

    for (const target of replicaTargets) {

      const actividadReplica = await getActividadReplicaDestino(transaction, {

        sourceEstructuraGrupoId: estructuraGrupoId,

        sourceEstructuraGrupoDetalleId: estructuraGrupoDetalleId,

        sourceActividadId: actividadId,

        targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0)

      });

      if (!actividadReplica?.targetActividadId) {

        replicasOmitidas += 1;

        console.warn("Eval360 asignar indicadores: replica omitida por actividad faltante", {

          sourceActividadId: actividadId,

          sourceEstructuraGrupoId: estructuraGrupoId,

          targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0),

          targetGrupoNombre: String(target.GrupoNombre || "otro grupo")

        });

        continue;

      }



      const mappedIndicadores = await mapIndicadoresReplicaTabla(transaction, {

        sourceEstructuraGrupoId: estructuraGrupoId,

        targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0),

        indicadorIds

      });

      if (mappedIndicadores.size !== indicadorIds.length) {
        replicasOmitidas += 1;
        console.warn("Eval360 asignar indicadores: replica omitida por mapeo incompleto", {
          sourceActividadId: actividadId,
          sourceEstructuraGrupoId: estructuraGrupoId,
          targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0),
          targetGrupoNombre: String(target.GrupoNombre || "otro grupo"),
          totalSolicitados: indicadorIds.length,
          totalMapeados: mappedIndicadores.size
        });
        continue;

      }



      const targetIndicadorIds = indicadorIds.map((id) => Number(mappedIndicadores.get(Number(id)) || 0)).filter((id) => id > 0);

      const tieneCalificacionesTarget = await validateIndicadoresRemovidosConCalificacion(transaction, Number(actividadReplica.targetActividadId || 0), targetIndicadorIds);

      if (tieneCalificacionesTarget) {
        replicasOmitidas += 1;
        console.warn("Eval360 asignar indicadores: replica omitida por calificaciones existentes", {
          sourceActividadId: actividadId,
          sourceEstructuraGrupoId: estructuraGrupoId,
          targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0),
          targetGrupoNombre: String(target.GrupoNombre || "otro grupo")
        });
        continue;

      }



      const targetAsignacionesMap = new Map<number, { numeroLecciones: number; puntos: number; detalleItemsJson: string }>();

      for (const [sourceIndicadorId, sourceAsignacion] of Array.from(asignacionesMap.entries())) {

        const targetIndicadorId = mappedIndicadores.get(Number(sourceIndicadorId));

        if (targetIndicadorId) targetAsignacionesMap.set(Number(targetIndicadorId), sourceAsignacion);

      }



      await upsertActividadIndicadores(transaction, Number(actividadReplica.targetActividadId || 0), targetIndicadorIds, targetAsignacionesMap);



      await new sql.Request(transaction)

        .input("actividadId", sql.Int, Number(actividadReplica.targetActividadId || 0))

        .input("nombre", sql.NVarChar(200), normalizeText((actividadResult.recordset[0] as any)?.Nombre || ""))

        .query(`

          UPDATE dbo.Eval360_Actividad

          SET Nombre = @nombre,

              UpdatedAt = SYSDATETIME()

          WHERE ActividadId = @actividadId

        `);

    }



    await transaction.commit();

    clearContextCacheByParts({

      institucionId: Number((estructura as any)?.InstitucionId || 0),

      grupoId: Number((estructura as any)?.GrupoId || 0),

      materiaId: Number((estructura as any)?.MateriaId || 0),

      anioLectivoId: Number((estructura as any)?.AnioLectivoId || 0),

      periodoId: Number((estructura as any)?.PeriodoId || 0)

    });

    return ok(res, {

      actividadId,

      totalAsignados: indicadorIds.length,

      replicasAplicadas: Math.max(0, replicaTargets.length - replicasOmitidas),

      replicasOmitidas

    }, "Indicadores asignados a la actividad correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error asignando indicadores a actividad:", error);

    return res.status(500).json({ ok: false, message: "No se pudieron asignar los indicadores" });

  }

});



router.post("/seguimiento/eliminar-tabla-especificaciones", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;

    await ensureEval360ExamenIATable(pool);



    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);

    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;



    const actividadResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT TOP 1 ActividadId, Nombre

        FROM dbo.Eval360_Actividad

        WHERE ActividadId = @actividadId

          AND EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo, 1) = 1

      `);



    if (!actividadResult.recordset[0]) return badRequest(res, "La actividad no pertenece al componente seleccionado");



    await transaction.begin();



    const actividadesDestino: Array<{ estructuraGrupoId: number; actividadId: number; grupoNombre: string }> = [{

      estructuraGrupoId,

      actividadId,

      grupoNombre: String((estructura as any)?.GrupoNombre || "sección actual")

    }];



    const replicaTargets = await getEstructurasReplicaTablaMismoGrado(transaction, req, estructuraGrupoId);

    for (const target of replicaTargets) {

      const actividadReplica = await getActividadReplicaDestino(transaction, {

        sourceEstructuraGrupoId: estructuraGrupoId,

        sourceEstructuraGrupoDetalleId: estructuraGrupoDetalleId,

        sourceActividadId: actividadId,

        targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0)

      });

      if (!actividadReplica?.targetActividadId) {

        throw new Error(`No se encontro la prueba equivalente para eliminar en ${String(target.GrupoNombre || "otro grupo")}`);

      }

      actividadesDestino.push({

        estructuraGrupoId: Number(target.EstructuraGrupoId || 0),

        actividadId: Number(actividadReplica.targetActividadId || 0),

        grupoNombre: String(target.GrupoNombre || "otro grupo")

      });

    }



    const actividadIdsUnicos = Array.from(new Set(

      actividadesDestino

        .map((item) => Number(item.actividadId || 0))

        .filter((item) => Number.isFinite(item) && item > 0)

    ));

    const examPlaceholders = actividadIdsUnicos.map((_, index) => `@actividadExamen${index}`).join(", ");

    const examRequest = new sql.Request(transaction);

    actividadIdsUnicos.forEach((id, index) => examRequest.input(`actividadExamen${index}`, sql.Int, id));

    const examenesRegistrados = actividadIdsUnicos.length

      ? await examRequest.query(`

          SELECT TOP 1

            ex.ExamenIAGeneradoId,

            ex.ActividadIdTabla,

            ISNULL(NULLIF(LTRIM(RTRIM(ex.Nombre)), ''), N'Examen IA') AS Nombre

          FROM dbo.Eval360_ExamenIAGenerado ex

          WHERE ex.Activo = 1

            AND ex.ActividadIdTabla IN (${examPlaceholders})

          ORDER BY ex.ExamenIAGeneradoId DESC

        `)

      : { recordset: [] as any[] };

    if ((examenesRegistrados.recordset || []).length > 0) {

      const examen = examenesRegistrados.recordset[0];

      await transaction.rollback();

      return badRequest(res, `No se puede eliminar la tabla de especificaciones porque ya existe un examen registrado: ${String(examen?.Nombre || "Examen IA")}`);

    }



    for (const destino of actividadesDestino) {

      const indicadoresResult = await new sql.Request(transaction)

        .input("actividadId", sql.Int, Number(destino.actividadId || 0))

        .query(`

          SELECT IndicadorGrupoId

          FROM dbo.Eval360_ActividadIndicador

          WHERE ActividadId = @actividadId

            AND ISNULL(Activo, 1) = 1

        `);

      const indicadorIds = (indicadoresResult.recordset || [])

        .map((row: any) => Number(row.IndicadorGrupoId || 0))

        .filter((id: number) => Number.isFinite(id) && id > 0);



      const tieneCalificaciones = await validateIndicadoresRemovidosConCalificacion(transaction, Number(destino.actividadId || 0), []);

      if (tieneCalificaciones) {

        throw new Error(`No se puede eliminar la tabla en ${destino.grupoNombre} porque esa prueba ya tiene calificaciones registradas`);

      }



      await upsertActividadIndicadores(transaction, Number(destino.actividadId || 0), [], new Map());

    }



    await transaction.commit();

    clearContextCacheByParts({

      institucionId: Number((estructura as any)?.InstitucionId || 0),

      grupoId: Number((estructura as any)?.GrupoId || 0),

      materiaId: Number((estructura as any)?.MateriaId || 0),

      anioLectivoId: Number((estructura as any)?.AnioLectivoId || 0),

      periodoId: Number((estructura as any)?.PeriodoId || 0)

    });

    return ok(res, {

      actividadId,

      replicasAplicadas: Math.max(0, actividadesDestino.length - 1),

      actividadesAfectadas: actividadesDestino.length

    }, "Tabla de especificaciones eliminada correctamente");

  } catch (error: any) {

    try { await transaction.rollback(); } catch {}

    console.error("Error eliminando tabla de especificaciones:", error);

    const message = String(error?.message || "");

    if (message) {

      return res.status(500).json({ ok: false, message });

    }

    return res.status(500).json({ ok: false, message: "No se pudo eliminar la tabla de especificaciones" });

  }

});



router.post("/seguimiento/guardar-indicador", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;

    await ensureReporteEnvioBitacoraTable(pool);



    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const indicadorGrupoId = toRequiredNumber(req.body.indicadorGrupoId, "indicadorGrupoId", res);

    const actividadIdBody = Number(req.body.actividadId || 0);

    const tipoUso = normalizeText(req.body.tipoUso || "Cotidiano");

    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];



    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || indicadorGrupoId === null) return;

    if (!registros.length) return badRequest(res, "No hay registros para guardar");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;



    const indicadorResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_IndicadorGrupo

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND IndicadorGrupoId = @indicadorGrupoId

          AND ISNULL(Activo, 1) = 1

      `);



    const indicador = indicadorResult.recordset[0];

    if (!indicador) return badRequest(res, "No se encontró el indicador seleccionado");



    const contextoCorreoResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        SELECT TOP 1

          eg.InstitucionId,

          i.Nombre AS InstitucionNombre,

          g.Nombre AS SeccionNombre,

          m.Nombre AS MateriaNombre,

          al.Nombre AS AnioNombre,

          profesor.Correo AS ProfesorCorreo,

          profesor.NombreCompleto AS ProfesorNombreCompleto

        FROM dbo.Eval360_EstructuraGrupo eg

        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId

        INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId

        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId

        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId

        OUTER APPLY (

          SELECT TOP 1

            u.Correo,

            LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, ''), ' ', ISNULL(u.PrimerApellido, ''), ' ', ISNULL(u.SegundoApellido, '')))) AS NombreCompleto

          FROM dbo.AsignacionDocente ad

          INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

          ORDER BY CASE WHEN ad.UsuarioId = @usuarioId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC

        ) profesor

        WHERE eg.EstructuraGrupoId = @estructuraGrupoId

      `);



    const contextoCorreo = contextoCorreoResult.recordset[0] || {};



    const notificacionesPendientes: Array<{

      estudianteId: number;

      estudianteNombre: string;

      fechaNacimiento?: string | null;

      telefonoEstudiante?: string | null;

      correoEstudiante?: string | null;

      telefonosEncargados?: string[];

      autorizaWhatsApp?: boolean;

      estado: string;

      observacion?: string | null;

    }> = [];

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(estructura.InstitucionId),
      registros.map((registro: any) => Number(registro.estudianteId || registro.EstudianteId || 0))
    );
    if (bloqueoSuspension) {
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }



    await transaction.begin();



    const actividadNombre = `${tipoUso} - ${String(indicador.IndicadorBase || "Indicador").slice(0, 160)}`;

    let actividadId = Number.isFinite(actividadIdBody) && actividadIdBody > 0 ? actividadIdBody : 0;

    let actividadCreadaAutomaticamente = false;



    let fechaActividadReferencia: string | null = null;



    if (actividadId) {

      const actividadSeleccionada = await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

        .input("actividadId", sql.Int, actividadId)

        .query(`

          SELECT TOP 1 ActividadId, Fecha

          FROM dbo.Eval360_Actividad

          WHERE EstructuraGrupoId = @estructuraGrupoId

            AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

            AND ActividadId = @actividadId

            AND ISNULL(Activo, 1) = 1

        `);



      if (!actividadSeleccionada.recordset[0]) {

        await transaction.rollback();

        return badRequest(res, "La actividad seleccionada no pertenece al componente");

      }

      fechaActividadReferencia = normalizeIsoDateForCostaRica(actividadSeleccionada.recordset[0]?.Fecha || null);

    } else {

      const existingActividad = await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

        .query(`

          SELECT TOP 1 a.ActividadId, a.Fecha

          FROM dbo.Eval360_Actividad a

          INNER JOIN dbo.Eval360_ActividadIndicador ai ON ai.ActividadId = a.ActividadId

          WHERE a.EstructuraGrupoId = @estructuraGrupoId

            AND a.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

            AND ai.IndicadorGrupoId = @indicadorGrupoId

            AND ISNULL(a.Activo, 1) = 1

            AND ISNULL(ai.Activo, 1) = 1

        `);



      actividadId = Number(existingActividad.recordset[0]?.ActividadId || 0);

      if (actividadId) {

        fechaActividadReferencia = normalizeIsoDateForCostaRica(existingActividad.recordset[0]?.Fecha || null);

      }

    }



    if (!actividadId) {

      const insertedActividad = await new sql.Request(transaction)

        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

        .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

        .input("nombre", sql.NVarChar(200), actividadNombre)

        .input("descripcion", sql.NVarChar(sql.MAX), indicador.IndicadorBase || null)

        .input("fecha", sql.Date, getCostaRicaIsoDate())

        .input("puntosMaximos", sql.Decimal(10, 2), 3)

        .query(`

          INSERT INTO dbo.Eval360_Actividad

            (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)

          OUTPUT INSERTED.ActividadId

          VALUES

            (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, @fecha, @puntosMaximos, NULL, 1, N'Planeamiento', 1, SYSDATETIME())

        `);



      actividadId = Number(insertedActividad.recordset[0].ActividadId);

      actividadCreadaAutomaticamente = true;

      fechaActividadReferencia = getCostaRicaIsoDate();

    }



    const existingActividadIndicador = await new sql.Request(transaction)

      .input("actividadId", sql.Int, actividadId)

      .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

      .query(`

        SELECT TOP 1 ActividadId

        FROM dbo.Eval360_ActividadIndicador

        WHERE ActividadId = @actividadId

          AND IndicadorGrupoId = @indicadorGrupoId

          AND ISNULL(Activo, 1) = 1

      `);



    if (!existingActividadIndicador.recordset[0]) {

      if (actividadCreadaAutomaticamente) {

        await new sql.Request(transaction)

          .input("actividadId", sql.Int, actividadId)

          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

          .query(`

            INSERT INTO dbo.Eval360_ActividadIndicador

              (ActividadId, IndicadorGrupoId, Activo)

            VALUES

              (@actividadId, @indicadorGrupoId, 1)

          `);

      } else {

        await transaction.rollback();

        return badRequest(res, "El indicador no está asociado a la actividad seleccionada. Asignalo primero desde Registro diario.");

      }

    }



    for (const registro of registros) {

      const estudianteId = Number(registro.estudianteId || registro.EstudianteId || 0);

      if (!estudianteId) continue;



      const estado = normalizarEstadoSeguimiento(registro.estado, tipoUso);

      const valor = Number(MAPA_SEGUIMIENTO_NIVELES[estado]?.valor ?? 0);

      const nivelDesempenoGrupoId = await getOrCreateNivelSeguimiento(transaction, estructuraGrupoId, estado);

      const observacion = normalizeText(registro.observacion || "");

      const informarEncargado = !!registro.informarEncargado;

      const actRecuperacion = !!registro.actRecuperacion && normalizeKey(tipoUso).includes("COTIDIAN");

      const actRecuperacionTexto = actRecuperacion ? normalizeText(registro.actRecuperacionTexto || "") : "";



      const existingSeguimiento = await new sql.Request(transaction)

        .input("actividadId", sql.Int, actividadId)

        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

        .input("estudianteId", sql.Int, estudianteId)

        .query(`

          SELECT TOP 1 SeguimientoIndicadorId

          FROM dbo.Eval360_SeguimientoIndicador

          WHERE ActividadId = @actividadId

            AND IndicadorGrupoId = @indicadorGrupoId

            AND EstudianteId = @estudianteId

        `);



      if (existingSeguimiento.recordset[0]) {

        await new sql.Request(transaction)

          .input("seguimientoIndicadorId", sql.Int, Number(existingSeguimiento.recordset[0].SeguimientoIndicadorId))

          .input("nivelDesempenoGrupoId", sql.Int, nivelDesempenoGrupoId)

          .input("valorSeleccionado", sql.Decimal(10, 2), valor)

          .input("observacion", sql.NVarChar(sql.MAX), observacion || null)

          .input("actRecuperacion", sql.Bit, actRecuperacion ? 1 : 0)

          .input("actRecuperacionTexto", sql.NVarChar(sql.MAX), actRecuperacionTexto || null)

          .query(`

            UPDATE dbo.Eval360_SeguimientoIndicador

            SET NivelDesempenoGrupoId = @nivelDesempenoGrupoId,

                ValorSeleccionado = @valorSeleccionado,

                Observacion = @observacion,

                ActRecuperacion = @actRecuperacion,

                ActRecuperacionTexto = @actRecuperacionTexto,

                UpdatedAt = SYSDATETIME()

            WHERE SeguimientoIndicadorId = @seguimientoIndicadorId

          `);

      } else {

        await new sql.Request(transaction)

          .input("actividadId", sql.Int, actividadId)

          .input("indicadorGrupoId", sql.Int, indicadorGrupoId)

          .input("estudianteId", sql.Int, estudianteId)

          .input("nivelDesempenoGrupoId", sql.Int, nivelDesempenoGrupoId)

          .input("valorSeleccionado", sql.Decimal(10, 2), valor)

          .input("observacion", sql.NVarChar(sql.MAX), observacion || null)

          .input("actRecuperacion", sql.Bit, actRecuperacion ? 1 : 0)

          .input("actRecuperacionTexto", sql.NVarChar(sql.MAX), actRecuperacionTexto || null)

          .query(`

            INSERT INTO dbo.Eval360_SeguimientoIndicador

              (ActividadId, IndicadorGrupoId, EstudianteId, NivelDesempenoGrupoId, ValorSeleccionado, Observacion, ActRecuperacion, ActRecuperacionTexto, CreatedAt)

            VALUES

              (@actividadId, @indicadorGrupoId, @estudianteId, @nivelDesempenoGrupoId, @valorSeleccionado, @observacion, @actRecuperacion, @actRecuperacionTexto, SYSDATETIME())

          `);

      }



      if (informarEncargado) {

        const estudianteAviso = await new sql.Request(transaction)

          .input("estudianteId", sql.Int, estudianteId)

          .query(`

            SELECT TOP 1

              e.EstudianteId,

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



        const estudiante = estudianteAviso.recordset[0];

        if (estudiante) {

          notificacionesPendientes.push({

            estudianteId,

            estudianteNombre: [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" "),

            fechaNacimiento: estudiante.FechaNacimiento || null,

            telefonoEstudiante: estudiante.TelefonoEstudiante || null,

            correoEstudiante: estudiante.Correo,

            telefonosEncargados: String(estudiante.EncargadosTelefonos || "")

              .split("|")

              .map((item: string) => String(item || "").trim())

              .filter((item: string) => item.length > 0),

            autorizaWhatsApp: !!estudiante.AutorizaWhatsAppEncargado,

            estado,

            observacion

          });

        }

      }

    }



    await recalcularNotaActividadIndicadores(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });

    await sincronizarNotaFormalDesdeActividad(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });



    await transaction.commit();



    const resultadosNotificacion: any[] = [];

    const correoCfg = await getCorreoNotificacionConfig(pool, Number(contextoCorreo.InstitucionId || 0), tipoUso);

    for (const aviso of notificacionesPendientes) {

      const mensaje = buildSeguimientoCorreo({

        estudianteNombre: aviso.estudianteNombre,

        tipoUso,

        materiaNombre: contextoCorreo.MateriaNombre,

        anioNombre: contextoCorreo.AnioNombre,

        indicadorBase: indicador.IndicadorBase || "Indicador",

        estadoLabel: getEstadoLabelSeguimiento(aviso.estado),

        observacion: aviso.observacion

      });

      const plantillaMensaje = await resolverMensajeSeguimiento(

        pool,

        Number(contextoCorreo.InstitucionId || 0),

        tipoUso,

        Number(MAPA_SEGUIMIENTO_NIVELES[aviso.estado]?.valor || 0)

      );

      const textoFinal = normalizeText(plantillaMensaje?.Cuerpo) || mensaje.text;

      const tituloFinal = normalizeText(plantillaMensaje?.Titulo) || mensaje.subject;

      const fechaNotificacion = fechaActividadReferencia || getCostaRicaIsoDate();

      const vars = {

        fecha: fechaNotificacion,

        alumno: aviso.estudianteNombre,

        seccion: String(contextoCorreo.SeccionNombre || ""),

        materia: String(contextoCorreo.MateriaNombre || ""),

        profesor: String(contextoCorreo.ProfesorNombreCompleto || contextoCorreo.ProfesorCorreo || ""),

        colegio: String(contextoCorreo.InstitucionNombre || ""),

        lecciones: "No aplica",

        reporte: getEstadoLabelSeguimiento(aviso.estado),

        detalle: textoFinal

      };

      const subjectFinal = correoCfg?.AsuntoTemplate ? renderTemplate(String(correoCfg.AsuntoTemplate), vars) : tituloFinal;

      const bodyFinal = correoCfg?.CuerpoTemplate ? renderTemplate(String(correoCfg.CuerpoTemplate), vars) : textoFinal;

      const correoProfesorCopia = resolveNotificationCc(req, contextoCorreo.ProfesorCorreo);

      const htmlFinal = `

        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">

          <h2 style="margin: 0 0 12px; color: #1e3a8a;">${escapeHtml(subjectFinal)}</h2>

          <p>${toHtmlWithLineBreaks(bodyFinal)}</p>

        </div>

      `;



      if (aviso.correoEstudiante) {

        try {

          const correo = await sendEmailWithFallback({

            to: aviso.correoEstudiante,

            cc: correoProfesorCopia || undefined,

            subject: subjectFinal,

            html: htmlFinal,

            text: bodyFinal

          });

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", ...correo });

        } catch (mailError: any) {

          const readable = getReadableError(mailError);

          console.error("No se pudo enviar correo de seguimiento:", readable, mailError);

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", enviado: false, error: readable });

        }

      }



      {

        const telefonos = resolveWhatsAppPhonesForNotification({

          fechaNacimiento: aviso.fechaNacimiento,

          telefonoEstudiante: aviso.telefonoEstudiante,

          telefonosEncargados: aviso.telefonosEncargados,

          autorizaWhatsAppEncargado: aviso.autorizaWhatsApp

        });

        for (const telefono of telefonos) {

          const whatsapp = await sendWhatsAppSeguimiento({ telefono, mensaje: bodyFinal });

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "whatsapp", telefono, ...whatsapp });

        }

      }

    }



    const estadoEnvioPorEstudiante = new Map<number, { correoEnviado: boolean; waEnviado: boolean }>();

    for (const notif of resultadosNotificacion) {

      if (notif?.enviado !== true) continue;

      const estudianteId = Number(notif?.estudianteId || 0);

      if (!estudianteId) continue;

      const prev = estadoEnvioPorEstudiante.get(estudianteId) || { correoEnviado: false, waEnviado: false };

      if (notif?.canal === "correo") prev.correoEnviado = true;

      if (notif?.canal === "whatsapp") prev.waEnviado = true;

      estadoEnvioPorEstudiante.set(estudianteId, prev);

    }

    for (const aviso of notificacionesPendientes) {

      const estadoEnvio = estadoEnvioPorEstudiante.get(Number(aviso.estudianteId)) || { correoEnviado: false, waEnviado: false };

      const esTareas = normalizeKey(tipoUso).includes("TAREA");

      await upsertReporteEnvioBitacora(pool, {

        modulo: esTareas ? "TAREAS_INDICADOR" : "COTIDIANO_INDICADOR",

        registroClave: `COTI_IND|${actividadId}|${indicadorGrupoId}|${aviso.estudianteId}`,

        grupoId: Number(estructura?.GrupoId || 0) || null,

        materiaId: Number(estructura?.MateriaId || 0) || null,

        periodoId: Number(estructura?.PeriodoId || 0) || null,

        anioLectivoId: Number(estructura?.AnioLectivoId || 0) || null,

        estudianteId: Number(aviso.estudianteId || 0) || null,

        fecha: getCostaRicaIsoDate(),

        correoEnviado: estadoEnvio.correoEnviado,

        waEnviado: estadoEnvio.waEnviado

      });

    }



    return ok(res, { actividadId, notificaciones: resultadosNotificacion }, "Evaluación guardada correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error guardando seguimiento de indicador Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo guardar el seguimiento del indicador" });

  }

});



router.post("/seguimiento/guardar-nombre-actividad", async (req, res) => {

  const pool = await getPool();

  try {

    if (!assertCanAccess(req, res)) return;



    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);

    const nombre = String(req.body.nombre || "").trim();



    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;

    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;



    const actividadResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT TOP 1 ActividadId, Nombre

        FROM dbo.Eval360_Actividad

        WHERE ActividadId = @actividadId

          AND EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo, 1) = 1

      `);



    if (!actividadResult.recordset[0]) return badRequest(res, "La actividad no pertenece al componente seleccionado");



    await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("actividadId", sql.Int, actividadId)

      .input("nombre", sql.NVarChar(200), nombre)

      .query(`

        UPDATE dbo.Eval360_Actividad

        SET Nombre = @nombre,

            UpdatedAt = SYSDATETIME()

        WHERE ActividadId = @actividadId

          AND EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo, 1) = 1

      `);



    const replicaTargets = await getEstructurasReplicaTablaMismoGrado(pool, req, estructuraGrupoId);

    for (const target of replicaTargets) {

      const actividadReplica = await getActividadReplicaDestino(pool, {

        sourceEstructuraGrupoId: estructuraGrupoId,

        sourceEstructuraGrupoDetalleId: estructuraGrupoDetalleId,

        sourceActividadId: actividadId,

        targetEstructuraGrupoId: Number(target.EstructuraGrupoId || 0)

      });

      if (!actividadReplica?.targetActividadId) {

        throw new Error(`No se encontro la prueba equivalente para replicar el nombre en ${String(target.GrupoNombre || "otro grupo")}`);

      }

      await pool.request()

        .input("actividadId", sql.Int, Number(actividadReplica.targetActividadId || 0))

        .input("nombre", sql.NVarChar(200), nombre)

        .query(`

          UPDATE dbo.Eval360_Actividad

          SET Nombre = @nombre,

              UpdatedAt = SYSDATETIME()

          WHERE ActividadId = @actividadId

            AND ISNULL(Activo, 1) = 1

        `);

    }



    clearContextCacheByParts({

      institucionId: Number((estructura as any)?.InstitucionId || 0),

      grupoId: Number((estructura as any)?.GrupoId || 0),

      materiaId: Number((estructura as any)?.MateriaId || 0),

      anioLectivoId: Number((estructura as any)?.AnioLectivoId || 0),

      periodoId: Number((estructura as any)?.PeriodoId || 0)

    });

    return ok(res, { actividadId, nombre, replicasAplicadas: replicaTargets.length });

  } catch (error) {

    console.error("Error guardando nombre de actividad:", error);

    return res.status(500).json({ ok: false, message: "No se pudo guardar el nombre de la prueba" });

  }

});



router.post("/seguimiento/guardar-actividad", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);



  try {

    if (!assertCanAccess(req, res)) return;

    await ensureReporteEnvioBitacoraTable(pool);



    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const actividadId = toRequiredNumber(req.body.actividadId, "actividadId", res);

    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];



    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || actividadId === null) return;

    if (!registros.length) return badRequest(res, "No hay registros para guardar");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;

    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;



    const actividadResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("actividadId", sql.Int, actividadId)

      .query(`

        SELECT TOP 1 *

        FROM dbo.Eval360_Actividad

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ActividadId = @actividadId

          AND ISNULL(Activo, 1) = 1

      `);



    const actividad = actividadResult.recordset[0];

    if (!actividad) return badRequest(res, "No se encontró la actividad seleccionada");



    const puntosMaximos = Number(req.body.puntosMaximos ?? actividad.PuntosMaximos ?? 0);

    if (!Number.isFinite(puntosMaximos) || puntosMaximos <= 0) return badRequest(res, "Indicá la cantidad de puntos que vale la actividad");



    const notificacionesPendientes: Array<{

      estudianteId: number;

      estudianteNombre: string;

      fechaNacimiento?: string | null;

      telefonoEstudiante?: string | null;

      correoEstudiante?: string | null;

      telefonosEncargados?: string[];

      autorizaWhatsApp?: boolean;

      observacion?: string | null;

      mensajeEncargado?: string | null;

      puntosObtenidos?: number | null;

      puntosMaximos: number;

    }> = [];

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(estructura.InstitucionId),
      registros.map((registro: any) => Number(registro.estudianteId || registro.EstudianteId || 0))
    );
    if (bloqueoSuspension) {
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }



    await transaction.begin();



    await new sql.Request(transaction)

      .input("actividadId", sql.Int, actividadId)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)

      .query(`

        UPDATE dbo.Eval360_Actividad

        SET PuntosMaximos = @puntosMaximos,

            UpdatedAt = SYSDATETIME()

        WHERE ActividadId = @actividadId

          AND EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo, 1) = 1

      `);



    const porcentajeEvaluacion = Number(actividad.PorcentajeDentroRubro || 0);



    // Mantiene consistencia global: si cambia puntos máximos en la actividad,

    // todas las notas existentes de esa actividad quedan sincronizadas.

    await new sql.Request(transaction)

      .input("actividadId", sql.Int, actividadId)

      .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)

      .input("porcentajeEvaluacion", sql.Decimal(10, 2), porcentajeEvaluacion)

      .query(`

        UPDATE na

        SET na.PuntosMaximos = @puntosMaximos,

            na.PorcentajeObtenido =

              CASE

                WHEN na.PuntosObtenidos IS NULL THEN NULL

                WHEN @puntosMaximos <= 0 THEN NULL

                ELSE ROUND((CAST(na.PuntosObtenidos AS decimal(10,2)) / @puntosMaximos) * @porcentajeEvaluacion, 2)

              END,

            na.UpdatedAt = SYSDATETIME()

        FROM dbo.Eval360_NotaActividad na

        WHERE na.ActividadId = @actividadId

      `);



    let guardados = 0;

    for (const registro of registros) {

      const estudianteId = Number(registro.estudianteId || registro.EstudianteId || 0);

      if (!estudianteId) continue;



      const rawPuntos = registro.puntosObtenidos;

      const puntosObtenidos = rawPuntos === null || rawPuntos === undefined || String(rawPuntos).trim() === "" ? null : Number(rawPuntos);

      if (puntosObtenidos !== null && (!Number.isFinite(puntosObtenidos) || !Number.isInteger(puntosObtenidos) || puntosObtenidos < 0 || puntosObtenidos > puntosMaximos)) {

        await transaction.rollback();

        return badRequest(res, "Los puntos obtenidos deben ser enteros entre 0 y los puntos máximos de la actividad");

      }



      const porcentajeObtenido = puntosObtenidos === null ? null : Number(((puntosObtenidos / puntosMaximos) * porcentajeEvaluacion).toFixed(2));

      const observacion = normalizeText(registro.observacion || "") || null;

      const informarEncargado = !!registro.informarEncargado;

      const mensajeEncargado = normalizeText(registro.mensajeEncargado || "") || null;



      const existingNota = await new sql.Request(transaction)

        .input("actividadId", sql.Int, actividadId)

        .input("estudianteId", sql.Int, estudianteId)

        .query(`

          SELECT TOP 1 NotaActividadId

          FROM dbo.Eval360_NotaActividad

          WHERE ActividadId = @actividadId

            AND EstudianteId = @estudianteId

        `);



      if (existingNota.recordset[0]) {

        await new sql.Request(transaction)

          .input("notaActividadId", sql.Int, Number(existingNota.recordset[0].NotaActividadId))

          .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)

          .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)

          .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)

          .input("observacion", sql.NVarChar(sql.MAX), observacion)

          .query(`

            UPDATE dbo.Eval360_NotaActividad

            SET PuntosObtenidos = @puntosObtenidos,

                PuntosMaximos = @puntosMaximos,

                PorcentajeObtenido = @porcentajeObtenido,

                Observacion = @observacion,

                UpdatedAt = SYSDATETIME()

            WHERE NotaActividadId = @notaActividadId

          `);

      } else {

        await new sql.Request(transaction)

          .input("actividadId", sql.Int, actividadId)

          .input("estudianteId", sql.Int, estudianteId)

          .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)

          .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)

          .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)

          .input("observacion", sql.NVarChar(sql.MAX), observacion)

          .query(`

            INSERT INTO dbo.Eval360_NotaActividad

              (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, Observacion, CreatedAt)

            VALUES

              (@actividadId, @estudianteId, @puntosObtenidos, @puntosMaximos, @porcentajeObtenido, @observacion, SYSDATETIME())

          `);

      }



      guardados += 1;



      if (informarEncargado) {

        const estudianteAviso = await new sql.Request(transaction)

          .input("estudianteId", sql.Int, estudianteId)

          .query(`

            SELECT TOP 1

              e.EstudianteId,

              e.Nombre,

              e.PrimerApellido,

              e.SegundoApellido,

              e.FechaNacimiento,

              e.Telefono AS TelefonoEstudiante,

              e.Correo,

              e.AutorizaWhatsAppEncargado,

              enc.Telefonos AS EncargadosTelefonos,

              encCorreo.Correo AS EncargadoPrincipalCorreo

            FROM dbo.Estudiante e

            OUTER APPLY (

              SELECT TOP 1 en.Correo

              FROM dbo.EstudianteEncargado ee

              INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId

              WHERE ee.EstudianteId = e.EstudianteId

                AND ISNULL(ee.Activo, 1) = 1

                AND ISNULL(en.Activo, 1) = 1

              ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC

            ) encCorreo

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

        const estudiante = estudianteAviso.recordset[0];

        if (estudiante) {

          notificacionesPendientes.push({

            estudianteId,

            estudianteNombre: [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" "),

            fechaNacimiento: estudiante.FechaNacimiento || null,

            telefonoEstudiante: estudiante.TelefonoEstudiante || null,

            correoEstudiante: estudiante.Correo || estudiante.EncargadoPrincipalCorreo,

            telefonosEncargados: String(estudiante.EncargadosTelefonos || "")

              .split("|")

              .map((item: string) => String(item || "").trim())

              .filter((item: string) => item.length > 0),

            autorizaWhatsApp: !!estudiante.AutorizaWhatsAppEncargado,

            observacion,

            mensajeEncargado,

            puntosObtenidos,

            puntosMaximos

          });

        }

      }

    }



    await sincronizarNotaFormalDesdeActividad(transaction, { estructuraGrupoId, estructuraGrupoDetalleId, actividadId });



    await transaction.commit();



    const contextoCorreoResult = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        SELECT TOP 1

          eg.InstitucionId,

          i.Nombre AS InstitucionNombre,

          m.Nombre AS MateriaNombre,

          p.Nombre AS PeriodoNombre,

          al.Nombre AS AnioNombre,

          profesor.Correo AS ProfesorCorreo,

          profesor.NombreCompleto AS ProfesorNombreCompleto

        FROM dbo.Eval360_EstructuraGrupo eg

        INNER JOIN dbo.Institucion i ON i.InstitucionId = eg.InstitucionId

        INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId

        LEFT JOIN dbo.Periodo p ON p.PeriodoId = eg.PeriodoId

        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = eg.AnioLectivoId

        OUTER APPLY (

          SELECT TOP 1

            u.Correo,

            LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, ''), ' ', ISNULL(u.PrimerApellido, ''), ' ', ISNULL(u.SegundoApellido, '')))) AS NombreCompleto

          FROM dbo.AsignacionDocente ad

          INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId

          WHERE ad.Activo = 1

            AND ad.InstitucionId = eg.InstitucionId

            AND ad.GrupoId = eg.GrupoId

            AND ad.MateriaId = eg.MateriaId

            AND ad.AnioLectivoId = eg.AnioLectivoId

            AND ad.PeriodoId = eg.PeriodoId

          ORDER BY CASE WHEN ad.UsuarioId = @usuarioId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC

        ) profesor

        WHERE eg.EstructuraGrupoId = @estructuraGrupoId

      `);

    const contextoCorreo = contextoCorreoResult.recordset[0] || {};

    const profesorLogueadoNombre = await getSessionTeacherDisplayName(pool, req);

    const correoProfesorCopia = resolveNotificationCc(req, contextoCorreo.ProfesorCorreo);

    const resultadosNotificacion: any[] = [];



    for (const aviso of notificacionesPendientes) {

      const plantillaMensaje = await resolverMensajeSeguimiento(pool, Number(contextoCorreo.InstitucionId || 0), "EXAMEN", null);

      const mensajeDefecto = buildSeguimientoExamenMensaje({

        estudianteNombre: aviso.estudianteNombre,

        tipoExamen: actividad.Nombre || actividad.Descripcion || "Examen",

        materiaNombre: contextoCorreo.MateriaNombre,

        periodoNombre: contextoCorreo.PeriodoNombre,

        anioNombre: contextoCorreo.AnioNombre,

        profesorNombre: profesorLogueadoNombre || contextoCorreo.ProfesorNombreCompleto || contextoCorreo.ProfesorCorreo,

        puntosObtenidos: aviso.puntosObtenidos,

        puntosMaximos: aviso.puntosMaximos,

        observacion: aviso.observacion,

        mensajePersonalizado: aviso.mensajeEncargado

      });

      const cuerpoPersonalizado = normalizeText(aviso.mensajeEncargado);

      const cuerpoPlantilla = normalizeText(plantillaMensaje?.Cuerpo);

      const textoFinal = cuerpoPersonalizado || cuerpoPlantilla || mensajeDefecto.text;

      const tituloFinal = normalizeText(plantillaMensaje?.Titulo) || "Seguimiento de evaluaci\u00f3n";

      const htmlBodyFinal = (cuerpoPersonalizado || cuerpoPlantilla) ? toHtmlWithLineBreaksAndBoldMarkers(textoFinal) : mensajeDefecto.htmlBody;

      const whatsappFinal = cuerpoPersonalizado || cuerpoPlantilla || mensajeDefecto.whatsappText;

      const htmlFinal = `<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;"><h2 style="margin: 0 0 12px; color: #1e3a8a;">${escapeHtml(tituloFinal)}</h2><p>${htmlBodyFinal}</p></div>`;



      if (aviso.correoEstudiante) {

        try {

          const correo = await sendEmailWithFallback({

            to: aviso.correoEstudiante,

            cc: correoProfesorCopia || undefined,

            subject: tituloFinal,

            html: htmlFinal,

            text: textoFinal

          });

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", ...correo });

        } catch (mailError: any) {

          const readable = getReadableError(mailError);

          console.error("No se pudo enviar correo de seguimiento (actividad):", readable, mailError);

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "correo", enviado: false, error: readable });

        }

      }



      {

        const telefonos = resolveWhatsAppPhonesForNotification({

          fechaNacimiento: aviso.fechaNacimiento,

          telefonoEstudiante: aviso.telefonoEstudiante,

          telefonosEncargados: aviso.telefonosEncargados,

          autorizaWhatsAppEncargado: aviso.autorizaWhatsApp

        });

        for (const telefono of telefonos) {

          const whatsapp = await sendWhatsAppSeguimiento({ telefono, mensaje: whatsappFinal });

          resultadosNotificacion.push({ estudianteId: aviso.estudianteId, canal: "whatsapp", telefono, ...whatsapp });

        }

      }

    }



    const estadoEnvioPorEstudiante = new Map<number, { correoEnviado: boolean; waEnviado: boolean }>();

    for (const notif of resultadosNotificacion) {

      if (notif?.enviado !== true) continue;

      const estudianteId = Number(notif?.estudianteId || 0);

      if (!estudianteId) continue;

      const prev = estadoEnvioPorEstudiante.get(estudianteId) || { correoEnviado: false, waEnviado: false };

      if (notif?.canal === "correo") prev.correoEnviado = true;

      if (notif?.canal === "whatsapp") prev.waEnviado = true;

      estadoEnvioPorEstudiante.set(estudianteId, prev);

    }

    for (const aviso of notificacionesPendientes) {

      const estadoEnvio = estadoEnvioPorEstudiante.get(Number(aviso.estudianteId)) || { correoEnviado: false, waEnviado: false };

      const esTareas = normalizeKey(actividad?.Fuente || actividad?.Nombre || "").includes("TAREA");

      await upsertReporteEnvioBitacora(pool, {

        modulo: esTareas ? "TAREAS_ACTIVIDAD" : "COTIDIANO_ACTIVIDAD",

        registroClave: `COTI_ACT|${actividadId}|${aviso.estudianteId}`,

        grupoId: Number(estructura?.GrupoId || 0) || null,

        materiaId: Number(estructura?.MateriaId || 0) || null,

        periodoId: Number(estructura?.PeriodoId || 0) || null,

        anioLectivoId: Number(estructura?.AnioLectivoId || 0) || null,

        estudianteId: Number(aviso.estudianteId || 0) || null,

        fecha: getCostaRicaIsoDate(),

        correoEnviado: estadoEnvio.correoEnviado,

        waEnviado: estadoEnvio.waEnviado

      });

    }



    return ok(res, { guardados, actividadId, puntosMaximos, notificaciones: resultadosNotificacion }, "Evaluación guardada correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error guardando actividad Eval360:", error);

    return res.status(500).json({ ok: false, message: "No se pudo guardar la actividad" });

  }

});



router.put("/seguimiento/notas/:notaActividadId/porcentaje", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);

  try {

    if (!assertCanAccess(req, res)) return;

    await ensureNotaEdicionAuditoriaTable(pool);



    const notaActividadId = toRequiredNumber(req.params.notaActividadId, "notaActividadId", res);

    const porcentajeObtenido = Number(req.body?.porcentajeObtenido);

    const justificacion = normalizeText(req.body?.justificacion || "");

    if (notaActividadId === null) return;

    if (!Number.isFinite(porcentajeObtenido) || porcentajeObtenido < 0 || porcentajeObtenido > 100) {

      return badRequest(res, "El % obtenido debe estar entre 0 y 100");

    }

    if (!justificacion) {

      return badRequest(res, "La justificación es obligatoria para editar la calificación");

    }



    await transaction.begin();



    const notaResult = await new sql.Request(transaction)

      .input("notaActividadId", sql.Int, notaActividadId)

      .query(`

        SELECT TOP 1

          na.NotaActividadId,

          na.ActividadId,

          na.EstudianteId,

          na.PuntosObtenidos,

          na.PuntosMaximos,

          na.NotaObtenida,

          na.PorcentajeObtenido,

          a.EstructuraGrupoId,

          a.EstructuraGrupoDetalleId

        FROM dbo.Eval360_NotaActividad na

        INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = na.ActividadId

        WHERE na.NotaActividadId = @notaActividadId

      `);



    const nota = notaResult.recordset[0];

    if (!nota) {

      await transaction.rollback();

      return badRequest(res, "No se encontró la nota a editar");

    }



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, Number(nota.EstructuraGrupoId || 0));

    if (!estructura) {

      await transaction.rollback();

      return forbidden(res, "No tenés permiso para editar esta nota");

    }



    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) {

      await transaction.rollback();

      return;

    }

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(estructura.InstitucionId),
      [Number(nota.EstudianteId)]
    );
    if (bloqueoSuspension) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }

    const puntosMaximos = Number(nota.PuntosMaximos || 0);

    const porcentajeAnterior = Number(nota.PorcentajeObtenido || 0);

    const notaAnterior = Number(nota.NotaObtenida || 0);

    const puntosAnterior = Number(nota.PuntosObtenidos || 0);

    const porcentajeNuevo = Number(porcentajeObtenido.toFixed(2));

    const notaNueva = porcentajeNuevo;

    const puntosNuevo = Number(((porcentajeNuevo / 100) * puntosMaximos).toFixed(2));



    await new sql.Request(transaction)

      .input("notaActividadId", sql.Int, notaActividadId)

      .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeNuevo)

      .input("puntosObtenidos", sql.Decimal(10, 2), puntosNuevo)

      .query(`

        UPDATE dbo.Eval360_NotaActividad

        SET PorcentajeObtenido = @porcentajeObtenido,

            PuntosObtenidos = @puntosObtenidos,

            UpdatedAt = SYSDATETIME()

        WHERE NotaActividadId = @notaActividadId

      `);



    await new sql.Request(transaction)

      .input("notaActividadId", sql.Int, notaActividadId)

      .input("actividadId", sql.Int, Number(nota.ActividadId))

      .input("estudianteId", sql.Int, Number(nota.EstudianteId))

      .input("estructuraGrupoId", sql.Int, Number(nota.EstructuraGrupoId))

      .input("estructuraGrupoDetalleId", sql.Int, Number(nota.EstructuraGrupoDetalleId))

      .input("porcentajeAnterior", sql.Decimal(10, 2), porcentajeAnterior)

      .input("porcentajeNuevo", sql.Decimal(10, 2), porcentajeNuevo)

      .input("notaAnterior", sql.Decimal(10, 2), notaAnterior)

      .input("notaNueva", sql.Decimal(10, 2), notaNueva)

      .input("puntosAnterior", sql.Decimal(10, 2), puntosAnterior)

      .input("puntosNuevo", sql.Decimal(10, 2), puntosNuevo)

      .input("justificacion", sql.NVarChar(1000), justificacion)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        INSERT INTO dbo.Eval360_NotaEdicionAuditoria

          (NotaActividadId, ActividadId, EstudianteId, EstructuraGrupoId, EstructuraGrupoDetalleId,

           PorcentajeAnterior, PorcentajeNuevo, NotaAnterior, NotaNueva, PuntosAnterior, PuntosNuevo,

           Justificacion, UsuarioId)

        VALUES

          (@notaActividadId, @actividadId, @estudianteId, @estructuraGrupoId, @estructuraGrupoDetalleId,

           @porcentajeAnterior, @porcentajeNuevo, @notaAnterior, @notaNueva, @puntosAnterior, @puntosNuevo,

           @justificacion, @usuarioId)

      `);



    await sincronizarNotaFormalDesdeActividad(transaction, {

      estructuraGrupoId: Number(nota.EstructuraGrupoId),

      estructuraGrupoDetalleId: Number(nota.EstructuraGrupoDetalleId),

      actividadId: Number(nota.ActividadId)

    });



    await transaction.commit();

    return ok(res, {

      notaActividadId,

      porcentajeAnterior,

      porcentajeNuevo,

      justificacion

    }, "Calificación actualizada correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error actualizando % obtenido de nota:", error);

    return res.status(500).json({ ok: false, message: "No se pudo actualizar la calificación" });

  }

});



router.put("/seguimiento/componentes/ajustar-porcentaje", async (req, res) => {

  const pool = await getPool();

  const transaction = new sql.Transaction(pool);

  try {

    if (!assertCanAccess(req, res)) return;

    await ensureNotaEdicionAuditoriaTable(pool);

    await ensureComponenteAjusteManualTables(pool);



    const estructuraGrupoId = toRequiredNumber(req.body?.estructuraGrupoId, "estructuraGrupoId", res);

    const estructuraGrupoDetalleId = toRequiredNumber(req.body?.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);

    const estudianteId = toRequiredNumber(req.body?.estudianteId, "estudianteId", res);

    const porcentajeObtenidoComponente = Number(req.body?.porcentajeObtenidoComponente);

    const justificacion = normalizeText(req.body?.justificacion || "");

    if (estructuraGrupoId === null || estructuraGrupoDetalleId === null || estudianteId === null) return;

    if (!Number.isFinite(porcentajeObtenidoComponente) || porcentajeObtenidoComponente < 0) {

      return badRequest(res, "El % obtenido debe ser mayor o igual a 0");

    }

    if (!justificacion) return badRequest(res, "La justificación es obligatoria para editar la calificación");



    const estructura = await getEstructuraPermitidaPorId(req, res, pool, estructuraGrupoId);

    if (!estructura) return;



    if (await responderSiEstructuraCursoCerrado(res, pool, estructura)) return;

    const bloqueoSuspension = await assertNoSuspendedStudents(
      pool,
      Number(estructura.InstitucionId),
      [estudianteId]
    );
    if (bloqueoSuspension) {
      return res.status(409).json({
        ok: false,
        message: bloqueoSuspension.message,
        suspensiones: bloqueoSuspension.suspensiones
      });
    }

    const detalleRes = await pool.request()

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .query(`

        SELECT TOP 1 EstructuraGrupoDetalleId, Porcentaje

        FROM dbo.Eval360_EstructuraGrupoDetalle

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND ISNULL(Activo,1) = 1

      `);

    const detalle = detalleRes.recordset[0];

    if (!detalle) return badRequest(res, "No se encontró el rubro seleccionado");



    const porcentajeValor = Number(detalle.Porcentaje || 0);

    if (porcentajeObtenidoComponente > porcentajeValor) {

      return badRequest(res, `El % obtenido no puede ser mayor al % valor del rubro (${porcentajeValor.toFixed(2)}%)`);

    }



    await transaction.begin();



    const ajustePrevioRes = await new sql.Request(transaction)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("estudianteId", sql.Int, estudianteId)

      .query(`

        SELECT TOP 1 PorcentajeObtenidoComponente

        FROM dbo.Eval360_ComponenteAjusteManual

        WHERE EstructuraGrupoId = @estructuraGrupoId

          AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId

          AND EstudianteId = @estudianteId

      `);

    const porcentajeAnteriorManual = Number(ajustePrevioRes.recordset[0]?.PorcentajeObtenidoComponente || 0);



    await new sql.Request(transaction)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("estudianteId", sql.Int, estudianteId)

      .input("porcentajeObtenidoComponente", sql.Decimal(10, 2), Number(porcentajeObtenidoComponente.toFixed(2)))

      .input("justificacion", sql.NVarChar(1000), justificacion)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        MERGE dbo.Eval360_ComponenteAjusteManual AS target

        USING (

          SELECT

            @estructuraGrupoId AS EstructuraGrupoId,

            @estructuraGrupoDetalleId AS EstructuraGrupoDetalleId,

            @estudianteId AS EstudianteId

        ) AS source

        ON target.EstructuraGrupoId = source.EstructuraGrupoId

          AND target.EstructuraGrupoDetalleId = source.EstructuraGrupoDetalleId

          AND target.EstudianteId = source.EstudianteId

        WHEN MATCHED THEN

          UPDATE SET

            PorcentajeObtenidoComponente = @porcentajeObtenidoComponente,

            Justificacion = @justificacion,

            UsuarioId = @usuarioId,

            UpdatedAt = SYSDATETIME()

        WHEN NOT MATCHED THEN

          INSERT (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, PorcentajeObtenidoComponente, Justificacion, UsuarioId, CreatedAt, UpdatedAt)

          VALUES (@estructuraGrupoId, @estructuraGrupoDetalleId, @estudianteId, @porcentajeObtenidoComponente, @justificacion, @usuarioId, SYSDATETIME(), SYSDATETIME());

      `);



    await new sql.Request(transaction)

      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)

      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)

      .input("estudianteId", sql.Int, estudianteId)

      .input("porcentajeAnterior", sql.Decimal(10, 2), porcentajeAnteriorManual)

      .input("porcentajeNuevo", sql.Decimal(10, 2), Number(porcentajeObtenidoComponente.toFixed(2)))

      .input("justificacion", sql.NVarChar(1000), justificacion)

      .input("usuarioId", sql.Int, getUserId(req) || null)

      .query(`

        INSERT INTO dbo.Eval360_ComponenteAjusteManualAuditoria

          (EstructuraGrupoId, EstructuraGrupoDetalleId, EstudianteId, PorcentajeAnterior, PorcentajeNuevo, Justificacion, UsuarioId)

        VALUES

          (@estructuraGrupoId, @estructuraGrupoDetalleId, @estudianteId, @porcentajeAnterior, @porcentajeNuevo, @justificacion, @usuarioId)

      `);



    await transaction.commit();

    return ok(res, {

      estructuraGrupoDetalleId,

      estudianteId,

      porcentajeValor,

      porcentajeObtenidoComponente: Number(porcentajeObtenidoComponente.toFixed(2))

    }, "Calificación del rubro actualizada correctamente");

  } catch (error) {

    try { await transaction.rollback(); } catch {}

    console.error("Error ajustando % obtenido por rubro:", error);

    return res.status(500).json({ ok: false, message: "No se pudo ajustar la calificación del rubro" });

  }

});



export default router;















