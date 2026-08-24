import { Router } from "express";
import ExcelJS from "exceljs";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql, timedQuery } from "../../config/database";
import { badRequest, ok } from "../../utils/http";
import { getCostaRicaIsoDate, parseDateInputAsLocalDate } from "../../utils/date.utils";
import {
  CIERRE_CURSO_ESTADO_CERRADO,
  CIERRE_CURSO_ESTADO_REABIERTO,
  ensureCierreAcademicoCursoTables
} from "../academico/cierre-curso.utils";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType
} from "docx";
import {
  getSuspensionVigenteApplySql,
  suspensionVigenteSelectSql
} from "../estudiantes/estudiante-suspension.utils";

const router = Router();
router.use(requireAuth);

function getUserId(req: any) {
  return Number(req.auth?.userId || req.auth?.usuarioId || req.auth?.id || 0) || 0;
}

function hasAnyRole(req: any, allowed: string[]) {
  const roles = Array.isArray(req.auth?.roles) ? req.auth.roles.map((item: any) => String(item || "").toUpperCase()) : [];
  return allowed.some((role) => roles.includes(String(role || "").toUpperCase()));
}

function isAdminReportUser(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
}

function isSuperAdmin(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function buildConsecutivoCodigo(prefijo?: string | null, siguienteNumero?: number | null, anioLectivo?: string | null) {
  const prefijoSeguro = String(prefijo || "").trim();
  const anioSeguro = String(anioLectivo || "").trim();
  const numero = String(Number(siguienteNumero || 0)).padStart(3, "0");
  return [prefijoSeguro, numero, anioSeguro].filter(Boolean).join("-");
}

function buildAsistenciaAlert(totalLecciones: number, tardias: number, ausenciasInjustificadas: number) {
  const ausenciasEquivalentes = Number((Number(tardias || 0) * 0.5 + Number(ausenciasInjustificadas || 0)).toFixed(2));
  const porcentajeAusencias = totalLecciones > 0
    ? Number(((ausenciasEquivalentes / totalLecciones) * 100).toFixed(2))
    : 0;
  const alertaTemprana = porcentajeAusencias < 15
    ? "Bien"
    : (porcentajeAusencias < 20 ? "Posible Alerta" : "Alerta");
  return { ausenciasEquivalentes, porcentajeAusencias, alertaTemprana };
}

const SQL_ORDER_BY_SECCION = `
  ORDER BY
    TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)),
    TRY_CONVERT(int, SUBSTRING(g.Nombre, CHARINDEX('-', g.Nombre + '-') + 1, 20)),
    g.Nombre
`;

const SQL_ORDER_BY_SECCION_Y_ESTUDIANTE = `
  ORDER BY
    TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)),
    TRY_CONVERT(int, SUBSTRING(g.Nombre, CHARINDEX('-', g.Nombre + '-') + 1, 20)),
    g.Nombre,
    e.PrimerApellido,
    e.SegundoApellido,
    e.Nombre
`;

function safeExcelFileNamePart(value: any) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "seccion";
}

const HORARIO_DIAS = [
  { diaSemana: 2, nombre: "Lunes" },
  { diaSemana: 3, nombre: "Martes" },
  { diaSemana: 4, nombre: "Miércoles" },
  { diaSemana: 5, nombre: "Jueves" },
  { diaSemana: 6, nombre: "Viernes" }
];

function getHorarioBloqueLabel(bloque: any) {
  const nombre = String(bloque?.Nombre || "").trim();
  const inicio = String(bloque?.HoraInicio || "").trim();
  const fin = String(bloque?.HoraFin || "").trim();
  return inicio && fin ? `${nombre} (${inicio}-${fin})` : nombre;
}

function getHorarioBloqueNoLectivo(nombre: any) {
  const normalized = String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("almuerzo")) return "ALMUERZO";
  if (normalized.includes("recreo") || normalized.includes("descanso")) return "RECREO";
  return "";
}

async function buildHorarioProfesorData(
  pool: any,
  institucionId: number,
  usuarioId: number,
  puedeVerTodos: boolean,
  anioLectivoIdSolicitado: number | null,
  profesorIdSolicitado: number | null
) {
  const profesorId = puedeVerTodos ? profesorIdSolicitado : usuarioId;
  const filtroProfesor = profesorId ? "AND u.UsuarioId = @profesorId" : "";

  const anioResult = await timedQuery("reportes.horario-profesor.anio", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoIdSolicitado)
    .query(`
      SELECT TOP 1
        al.AnioLectivoId,
        al.Nombre AS AnioNombre
      FROM dbo.AnioLectivo al
      WHERE al.InstitucionId = @institucionId
        AND (@anioLectivoId IS NULL OR al.AnioLectivoId = @anioLectivoId)
      ORDER BY
        CASE WHEN @anioLectivoId IS NOT NULL THEN 0 ELSE ISNULL(al.Activo, 0) END DESC,
        al.FechaInicio DESC,
        al.AnioLectivoId DESC
    `));

  const anio = anioResult.recordset[0];
  if (!anio) return null;
  const anioLectivoId = Number(anio.AnioLectivoId);

  const horarioCandidatosSql = `
    WITH HorariosPorPeriodo AS (
      SELECT
        hd.UsuarioId AS ProfesorId,
        gm.PeriodoId,
        p.Nombre AS PeriodoNombre,
        ISNULL(p.NumeroOrden, 0) AS NumeroOrden,
        COUNT(DISTINCT hg.HorarioGrupoId) AS TotalLecciones
      FROM dbo.HorarioDocente hd
      INNER JOIN dbo.HorarioGrupo hg
        ON hg.HorarioGrupoId = hd.HorarioGrupoId
       AND hg.Activo = 1
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
       AND g.InstitucionId = @institucionId
       AND g.AnioLectivoId = @anioLectivoId
       AND g.Activo = 1
      INNER JOIN dbo.Periodo p
        ON p.PeriodoId = gm.PeriodoId
       AND p.AnioLectivoId = @anioLectivoId
      WHERE hd.Activo = 1
        AND (@profesorId IS NULL OR hd.UsuarioId = @profesorId)
      GROUP BY hd.UsuarioId, gm.PeriodoId, p.Nombre, p.NumeroOrden
    ),
    PeriodoElegido AS (
      SELECT
        ProfesorId,
        PeriodoId,
        PeriodoNombre,
        NumeroOrden,
        TotalLecciones,
        ROW_NUMBER() OVER (
          PARTITION BY ProfesorId
          ORDER BY TotalLecciones DESC, NumeroOrden DESC, PeriodoId DESC
        ) AS Posicion
      FROM HorariosPorPeriodo
    )
  `;

  const [bloquesResult, profesoresResult, periodosElegidosResult, entradasResult] = await Promise.all([
    timedQuery("reportes.horario-profesor.bloques", () => pool.request()
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
        ORDER BY bh.OrdenVisual, bh.HoraInicio, bh.BloqueHorarioId
      `)),
    timedQuery("reportes.horario-profesor.profesores", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("profesorId", sql.Int, profesorId)
      .query(`
        SELECT DISTINCT
          u.UsuarioId AS ProfesorId,
          u.Correo,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido
        FROM dbo.Usuario u
        WHERE u.InstitucionId = @institucionId
          AND u.Activo = 1
          ${filtroProfesor}
          AND EXISTS (
            SELECT 1
            FROM dbo.UsuarioRol ur
            INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
            WHERE ur.UsuarioId = u.UsuarioId
              AND ur.Activo = 1
              AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
          )
          AND EXISTS (
            SELECT 1
            FROM dbo.HorarioDocente hd
            INNER JOIN dbo.HorarioGrupo hg
              ON hg.HorarioGrupoId = hd.HorarioGrupoId
             AND hg.Activo = 1
            INNER JOIN dbo.GrupoMateria gm
              ON gm.GrupoMateriaId = hg.GrupoMateriaId
             AND gm.Activo = 1
            INNER JOIN dbo.Grupo g
              ON g.GrupoId = gm.GrupoId
             AND g.InstitucionId = @institucionId
             AND g.AnioLectivoId = @anioLectivoId
             AND g.Activo = 1
            WHERE hd.UsuarioId = u.UsuarioId
              AND hd.Activo = 1
          )
        ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre, u.UsuarioId
      `)),
    timedQuery("reportes.horario-profesor.periodos-elegidos", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("profesorId", sql.Int, profesorId)
      .query(`
        ${horarioCandidatosSql}
        SELECT
          ProfesorId,
          PeriodoId,
          PeriodoNombre,
          TotalLecciones
        FROM PeriodoElegido
        WHERE Posicion = 1
      `)),
    timedQuery("reportes.horario-profesor.entradas", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("profesorId", sql.Int, profesorId)
      .query(`
        ${horarioCandidatosSql}
        SELECT DISTINCT
          hd.UsuarioId AS ProfesorId,
          pe.PeriodoId,
          pe.PeriodoNombre,
          hg.HorarioGrupoId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          gm.GrupoId,
          g.Nombre AS GrupoNombre,
          gm.MateriaId,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo
        FROM PeriodoElegido pe
        INNER JOIN dbo.HorarioDocente hd
          ON hd.UsuarioId = pe.ProfesorId
         AND hd.Activo = 1
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = hd.HorarioGrupoId
         AND hg.Activo = 1
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
         AND gm.PeriodoId = pe.PeriodoId
         AND gm.Activo = 1
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
         AND g.InstitucionId = @institucionId
         AND g.AnioLectivoId = @anioLectivoId
         AND g.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
         AND m.Activa = 1
        INNER JOIN dbo.Usuario u
          ON u.UsuarioId = hd.UsuarioId
         AND u.InstitucionId = @institucionId
         AND u.Activo = 1
        WHERE pe.Posicion = 1
        ORDER BY hd.UsuarioId, hg.DiaSemana, hg.BloqueHorarioId, g.Nombre, m.Nombre
      `))
  ]);

  const entradasPorProfesor = new Map<number, any[]>();
  for (const entrada of entradasResult.recordset || []) {
    const id = Number(entrada.ProfesorId || 0);
    if (!entradasPorProfesor.has(id)) entradasPorProfesor.set(id, []);
    entradasPorProfesor.get(id)!.push(entrada);
  }

  const periodoPorProfesor = new Map<number, any>();
  for (const item of periodosElegidosResult.recordset || []) {
    periodoPorProfesor.set(Number(item.ProfesorId), item);
  }

  const profesores = (profesoresResult.recordset || []).map((item: any) => ({
    profesorId: Number(item.ProfesorId),
    correo: String(item.Correo || ""),
    nombre: [item.PrimerApellido, item.SegundoApellido, item.Nombre]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    periodoId: Number(periodoPorProfesor.get(Number(item.ProfesorId))?.PeriodoId || 0) || null,
    periodoNombre: String(periodoPorProfesor.get(Number(item.ProfesorId))?.PeriodoNombre || ""),
    totalLecciones: Number(periodoPorProfesor.get(Number(item.ProfesorId))?.TotalLecciones || 0),
    entradas: entradasPorProfesor.get(Number(item.ProfesorId)) || []
  }));

  return {
    anioLectivoId,
    anioNombre: String(anio.AnioNombre || ""),
    bloques: bloquesResult.recordset || [],
    profesores
  };
}

async function buildHorarioSeccionData(
  pool: any,
  institucionId: number,
  anioLectivoIdSolicitado: number | null,
  grupoIdSolicitado: number | null
) {
  const anioResult = await timedQuery("reportes.horario-seccion.anio", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoIdSolicitado)
    .query(`
      SELECT TOP 1
        al.AnioLectivoId,
        al.Nombre AS AnioNombre
      FROM dbo.AnioLectivo al
      WHERE al.InstitucionId = @institucionId
        AND (@anioLectivoId IS NULL OR al.AnioLectivoId = @anioLectivoId)
      ORDER BY
        CASE WHEN @anioLectivoId IS NOT NULL THEN 0 ELSE ISNULL(al.Activo, 0) END DESC,
        al.FechaInicio DESC,
        al.AnioLectivoId DESC
    `));

  const anio = anioResult.recordset[0];
  if (!anio) return null;
  const anioLectivoId = Number(anio.AnioLectivoId);

  const horarioCandidatosSql = `
    WITH HorariosPorPeriodo AS (
      SELECT
        gm.GrupoId,
        gm.PeriodoId,
        p.Nombre AS PeriodoNombre,
        ISNULL(p.NumeroOrden, 0) AS NumeroOrden,
        COUNT(DISTINCT hg.HorarioGrupoId) AS TotalLecciones
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
       AND g.InstitucionId = @institucionId
       AND g.AnioLectivoId = @anioLectivoId
       AND g.Activo = 1
      INNER JOIN dbo.Periodo p
        ON p.PeriodoId = gm.PeriodoId
       AND p.AnioLectivoId = @anioLectivoId
      WHERE hg.Activo = 1
        AND (@grupoId IS NULL OR gm.GrupoId = @grupoId)
      GROUP BY gm.GrupoId, gm.PeriodoId, p.Nombre, p.NumeroOrden
    ),
    PeriodoElegido AS (
      SELECT
        GrupoId,
        PeriodoId,
        PeriodoNombre,
        NumeroOrden,
        TotalLecciones,
        ROW_NUMBER() OVER (
          PARTITION BY GrupoId
          ORDER BY TotalLecciones DESC, NumeroOrden DESC, PeriodoId DESC
        ) AS Posicion
      FROM HorariosPorPeriodo
    )
  `;

  const [bloquesResult, seccionesResult, periodosElegidosResult, entradasResult] = await Promise.all([
    timedQuery("reportes.horario-seccion.bloques", () => pool.request()
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
        ORDER BY bh.OrdenVisual, bh.HoraInicio, bh.BloqueHorarioId
      `)),
    timedQuery("reportes.horario-seccion.secciones", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoId", sql.Int, grupoIdSolicitado)
      .query(`
        SELECT
          g.GrupoId,
          g.Nombre AS GrupoNombre
        FROM dbo.Grupo g
        WHERE g.InstitucionId = @institucionId
          AND g.AnioLectivoId = @anioLectivoId
          AND g.Activo = 1
          AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
          AND EXISTS (
            SELECT 1
            FROM dbo.GrupoMateria gm
            INNER JOIN dbo.HorarioGrupo hg
              ON hg.GrupoMateriaId = gm.GrupoMateriaId
             AND hg.Activo = 1
            WHERE gm.GrupoId = g.GrupoId
              AND gm.Activo = 1
          )
        ${SQL_ORDER_BY_SECCION}
      `)),
    timedQuery("reportes.horario-seccion.periodos-elegidos", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoId", sql.Int, grupoIdSolicitado)
      .query(`
        ${horarioCandidatosSql}
        SELECT
          GrupoId,
          PeriodoId,
          PeriodoNombre,
          TotalLecciones
        FROM PeriodoElegido
        WHERE Posicion = 1
      `)),
    timedQuery("reportes.horario-seccion.entradas", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoId", sql.Int, grupoIdSolicitado)
      .query(`
        ${horarioCandidatosSql}
        SELECT DISTINCT
          gm.GrupoId,
          g.Nombre AS GrupoNombre,
          pe.PeriodoId,
          pe.PeriodoNombre,
          hg.HorarioGrupoId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          gm.MateriaId,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          hd.UsuarioId AS ProfesorId,
          u.Correo AS ProfesorCorreo,
          LTRIM(RTRIM(CONCAT(ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N''), N' ', ISNULL(u.Nombre, N'')))) AS ProfesorNombre
        FROM PeriodoElegido pe
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoId = pe.GrupoId
         AND gm.PeriodoId = pe.PeriodoId
         AND gm.Activo = 1
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.GrupoMateriaId = gm.GrupoMateriaId
         AND hg.Activo = 1
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
         AND g.InstitucionId = @institucionId
         AND g.AnioLectivoId = @anioLectivoId
         AND g.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
         AND m.Activa = 1
        LEFT JOIN dbo.HorarioDocente hd
          ON hd.HorarioGrupoId = hg.HorarioGrupoId
         AND hd.Activo = 1
        LEFT JOIN dbo.Usuario u
          ON u.UsuarioId = hd.UsuarioId
         AND u.InstitucionId = @institucionId
         AND u.Activo = 1
        WHERE pe.Posicion = 1
        ORDER BY gm.GrupoId, hg.DiaSemana, hg.BloqueHorarioId, m.Nombre, ProfesorNombre
      `))
  ]);

  const entradasPorSeccion = new Map<number, any[]>();
  for (const entrada of entradasResult.recordset || []) {
    const id = Number(entrada.GrupoId || 0);
    if (!entradasPorSeccion.has(id)) entradasPorSeccion.set(id, []);
    entradasPorSeccion.get(id)!.push(entrada);
  }

  const periodoPorSeccion = new Map<number, any>();
  for (const item of periodosElegidosResult.recordset || []) {
    periodoPorSeccion.set(Number(item.GrupoId), item);
  }

  const secciones = (seccionesResult.recordset || []).map((item: any) => ({
    grupoId: Number(item.GrupoId),
    nombre: String(item.GrupoNombre || ""),
    periodoId: Number(periodoPorSeccion.get(Number(item.GrupoId))?.PeriodoId || 0) || null,
    periodoNombre: String(periodoPorSeccion.get(Number(item.GrupoId))?.PeriodoNombre || ""),
    totalLecciones: Number(periodoPorSeccion.get(Number(item.GrupoId))?.TotalLecciones || 0),
    entradas: entradasPorSeccion.get(Number(item.GrupoId)) || []
  }));

  return {
    anioLectivoId,
    anioNombre: String(anio.AnioNombre || ""),
    bloques: bloquesResult.recordset || [],
    secciones
  };
}

function getUniqueWorksheetName(value: string, usedNames: Set<string>) {
  const base = String(value || "Profesor")
    .replace(/[\\/*?:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Profesor";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffixText = ` ${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function buildReporteSeccionData(pool: any, institucionId: number, grupoId: number) {
  const grupoResult = await timedQuery("reportes.gestion-profe.secciones.grupo", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .query(`
      SELECT TOP 1
        g.GrupoId,
        g.Nombre AS GrupoNombre
      FROM dbo.Grupo g
      WHERE g.InstitucionId = @institucionId
        AND g.GrupoId = @grupoId
    `));

  const grupo = grupoResult.recordset[0];
  if (!grupo) return null;

  const result = await timedQuery("reportes.gestion-profe.secciones", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .query(`
      WITH AlumnosSeccion AS (
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Nombre,
          e.Adecuacion,
          ${suspensionVigenteSelectSql},
          ROW_NUMBER() OVER (
            PARTITION BY e.EstudianteId
            ORDER BY m.MatriculaId DESC
          ) AS rn
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        ${getSuspensionVigenteApplySql("e")}
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
          AND g.InstitucionId = @institucionId
          AND g.GrupoId = @grupoId
          AND ISNULL(m.Estado, N'') <> N'Inactiva'
      )
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY PrimerApellido, SegundoApellido, Nombre, EstudianteId
        ) AS linea,
        Identificacion AS cedula,
        PrimerApellido AS apellido1,
        SegundoApellido AS apellido2,
        Nombre AS nombre,
        Adecuacion AS adecuacion,
        Suspendido AS suspendido,
        MotivoSuspension AS motivoSuspension,
        FechaInicioSuspension AS fechaInicioSuspension,
        FechaFinSuspension AS fechaFinSuspension,
        ObservacionSuspension AS observacionSuspension
      FROM AlumnosSeccion
      WHERE rn = 1
      ORDER BY PrimerApellido, SegundoApellido, Nombre, EstudianteId
    `));

  return {
    seccion: String(grupo.GrupoNombre || ""),
    rows: result.recordset
  };
}

function getAdecuacionReporteStyleKind(value: any): "SIGNIFICATIVA" | "NO_SIGNIFICATIVA" | null {
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

function toRoundedNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(digits));
}

function calcularPuntosAsistenciaArticulo37(totalLecciones: number, ausenciasEquivalentes: number) {
  if (!totalLecciones) return 0;
  const porcentajeAusencias = (Number(ausenciasEquivalentes || 0) * 100) / Number(totalLecciones || 1);
  if (porcentajeAusencias >= 50) return 0;
  if (porcentajeAusencias >= 40) return 1;
  if (porcentajeAusencias >= 30) return 2;
  if (porcentajeAusencias >= 20) return 3;
  if (porcentajeAusencias >= 10) return 4;
  return 5;
}

async function buildPromediosAcademicosPreview(params: {
  pool: any;
  institucionId: number;
  anioLectivoId: number;
  periodoId: number | null;
  grupoId: number | null;
  modo: "PERIODO" | "ANUAL";
}) {
  const { pool, institucionId, anioLectivoId, periodoId, grupoId, modo } = params;

  const periodosResult = await timedQuery("reportes.promedios.periodos", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("grupoId", sql.Int, grupoId)
    .input("modo", sql.NVarChar(20), modo)
    .query(`
      SELECT
        p.PeriodoId,
        p.Nombre AS PeriodoNombre,
        p.NumeroOrden,
        a.Nombre AS AnioNombre
      FROM dbo.Periodo p
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = p.AnioLectivoId
      WHERE a.InstitucionId = @institucionId
        AND p.AnioLectivoId = @anioLectivoId
        AND p.Activo = 1
        AND (@modo = N'ANUAL' OR p.PeriodoId = @periodoId)
        AND (
          @modo <> N'ANUAL'
          OR EXISTS (
            SELECT 1
            FROM dbo.GrupoMateria gm
            INNER JOIN dbo.Grupo g
              ON g.GrupoId = gm.GrupoId
            INNER JOIN dbo.Materia ma
              ON ma.MateriaId = gm.MateriaId
            WHERE g.InstitucionId = @institucionId
              AND gm.Activo = 1
              AND ISNULL(ma.Activa, 1) = 1
              AND ma.Nombre COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
              AND ISNULL(ma.Codigo, N'') COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
              AND (gm.PeriodoId = p.PeriodoId OR gm.PeriodoId IS NULL)
              AND (@grupoId IS NULL OR gm.GrupoId = @grupoId)
          )
        )
      ORDER BY p.NumeroOrden, p.PeriodoId
    `));

  const periodos = periodosResult.recordset || [];
  if (!periodos.length) {
    return {
      resumen: {
        modo,
        anioLectivoId,
        periodoId,
        grupoId,
        totalEstudiantes: 0,
        completos: 0,
        incompletos: 0,
        promedioGeneral: null,
        advertencia: "No hay períodos activos para los filtros seleccionados."
      },
      rows: []
    };
  }

  const result = await timedQuery("reportes.promedios.preview", () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("grupoId", sql.Int, grupoId)
    .input("modo", sql.NVarChar(20), modo)
    .query(`
      WITH PeriodosObjetivo AS (
        SELECT p.PeriodoId, p.Nombre AS PeriodoNombre, p.NumeroOrden
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE a.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.Activo = 1
          AND (@modo = N'ANUAL' OR p.PeriodoId = @periodoId)
          AND (
            @modo <> N'ANUAL'
            OR EXISTS (
              SELECT 1
              FROM dbo.GrupoMateria gm
              INNER JOIN dbo.Grupo g
                ON g.GrupoId = gm.GrupoId
              INNER JOIN dbo.Materia ma
                ON ma.MateriaId = gm.MateriaId
              WHERE g.InstitucionId = @institucionId
                AND gm.Activo = 1
                AND ISNULL(ma.Activa, 1) = 1
                AND ma.Nombre COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
                AND ISNULL(ma.Codigo, N'') COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
                AND (gm.PeriodoId = p.PeriodoId OR gm.PeriodoId IS NULL)
                AND (@grupoId IS NULL OR gm.GrupoId = @grupoId)
            )
          )
      ),
      EstudiantesActuales AS (
        SELECT *
        FROM (
          SELECT
            m.MatriculaId,
            m.EstudianteId,
            m.GrupoId,
            e.Identificacion,
            e.PrimerApellido,
            e.SegundoApellido,
            e.Nombre,
            e.Adecuacion,
            g.Nombre AS GrupoNombre,
            ROW_NUMBER() OVER (
              PARTITION BY m.EstudianteId
              ORDER BY
                CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(m.Estado, N'')))) = N'ACTIVA' THEN 0 ELSE 1 END,
                m.MatriculaId DESC
            ) AS rn
          FROM dbo.Matricula m
          INNER JOIN dbo.Estudiante e
            ON e.EstudianteId = m.EstudianteId
          INNER JOIN dbo.Grupo g
            ON g.GrupoId = m.GrupoId
          WHERE e.InstitucionId = @institucionId
            AND e.Activo = 1
            AND g.InstitucionId = @institucionId
            AND m.AnioLectivoId = @anioLectivoId
            AND ISNULL(m.Estado, N'') <> N'Inactiva'
        ) base
        WHERE rn = 1
          AND (@grupoId IS NULL OR GrupoId = @grupoId)
      ),
      MateriasPeriodo AS (
        SELECT
          gm.GrupoId,
          gm.MateriaId,
          p.PeriodoId,
          MIN(gm.GrupoMateriaId) AS GrupoMateriaId
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Materia ma
          ON ma.MateriaId = gm.MateriaId
        INNER JOIN PeriodosObjetivo p
          ON gm.PeriodoId = p.PeriodoId OR gm.PeriodoId IS NULL
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE g.InstitucionId = @institucionId
          AND gm.Activo = 1
          AND ISNULL(ma.Activa, 1) = 1
          AND ma.Nombre COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
          AND ISNULL(ma.Codigo, N'') COLLATE Latin1_General_CI_AI NOT LIKE N'%GUIA%'
        GROUP BY gm.GrupoId, gm.MateriaId, p.PeriodoId
      ),
      NotasMateria AS (
        SELECT
          en.EstudianteId,
          en.GrupoId,
          en.MateriaId,
          en.PeriodoId,
          COUNT(en.EvaluacionNotaId) AS RegistrosNota,
          SUM(CAST(ISNULL(en.PorcentajeGanado, 0) AS DECIMAL(10,4))) AS AcumuladoEvaluacion
        FROM dbo.EvaluacionNota en
        INNER JOIN PeriodosObjetivo p
          ON p.PeriodoId = en.PeriodoId
        GROUP BY en.EstudianteId, en.GrupoId, en.MateriaId, en.PeriodoId
      ),
      TotalLecciones AS (
        SELECT
          ar.GrupoId,
          ar.MateriaId,
          ar.PeriodoId,
          COUNT(DISTINCT CONCAT(CONVERT(varchar(10), ar.Fecha, 23), '-', ISNULL(CONVERT(varchar(20), ar.HorarioGrupoId), '0'))) AS TotalLecciones
        FROM dbo.AsistenciaRegistro ar
        INNER JOIN PeriodosObjetivo p
          ON p.PeriodoId = ar.PeriodoId
        WHERE ar.AnioLectivoId = @anioLectivoId
        GROUP BY ar.GrupoId, ar.MateriaId, ar.PeriodoId
      ),
      AusenciasEstudiante AS (
        SELECT
          ar.EstudianteId,
          ar.GrupoId,
          ar.MateriaId,
          ar.PeriodoId,
          SUM(CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ar.Estado, N'')))) IN (N'AUSENTE_INJUSTIFICADA', N'TARDIA_MAYOR_10') THEN 1.0
            WHEN UPPER(LTRIM(RTRIM(ISNULL(ar.Estado, N'')))) = N'TARDIA_MENOR_10' THEN 0.5
            ELSE 0.0
          END) AS AusenciasEquivalentes
        FROM dbo.AsistenciaRegistro ar
        INNER JOIN PeriodosObjetivo p
          ON p.PeriodoId = ar.PeriodoId
        WHERE ar.AnioLectivoId = @anioLectivoId
        GROUP BY ar.EstudianteId, ar.GrupoId, ar.MateriaId, ar.PeriodoId
      )
      SELECT
        ea.EstudianteId,
        ea.Identificacion,
        ea.PrimerApellido,
        ea.SegundoApellido,
        ea.Nombre,
        ea.Adecuacion,
        ea.GrupoId,
        ea.GrupoNombre,
        p.PeriodoId,
        p.PeriodoNombre,
        p.NumeroOrden,
        mp.MateriaId,
        ma.Nombre AS MateriaNombre,
        ISNULL(nm.RegistrosNota, 0) AS RegistrosNota,
        ISNULL(nm.AcumuladoEvaluacion, 0) AS AcumuladoEvaluacion,
        ISNULL(tl.TotalLecciones, 0) AS TotalLecciones,
        ISNULL(ae.AusenciasEquivalentes, 0) AS AusenciasEquivalentes
      FROM EstudiantesActuales ea
      CROSS JOIN PeriodosObjetivo p
      LEFT JOIN MateriasPeriodo mp
        ON mp.GrupoId = ea.GrupoId
       AND mp.PeriodoId = p.PeriodoId
      LEFT JOIN dbo.Materia ma
        ON ma.MateriaId = mp.MateriaId
      LEFT JOIN NotasMateria nm
        ON nm.EstudianteId = ea.EstudianteId
       AND nm.GrupoId = ea.GrupoId
       AND nm.MateriaId = mp.MateriaId
       AND nm.PeriodoId = p.PeriodoId
      LEFT JOIN TotalLecciones tl
        ON tl.GrupoId = ea.GrupoId
       AND tl.MateriaId = mp.MateriaId
       AND tl.PeriodoId = p.PeriodoId
      LEFT JOIN AusenciasEstudiante ae
        ON ae.EstudianteId = ea.EstudianteId
       AND ae.GrupoId = ea.GrupoId
       AND ae.MateriaId = mp.MateriaId
       AND ae.PeriodoId = p.PeriodoId
      ORDER BY
        ea.PrimerApellido,
        ea.SegundoApellido,
        ea.Nombre,
        TRY_CONVERT(int, LEFT(LTRIM(ea.GrupoNombre), PATINDEX('%[^0-9]%', LTRIM(ea.GrupoNombre) + 'X') - 1)),
        TRY_CONVERT(int, SUBSTRING(ea.GrupoNombre, CHARINDEX('-', ea.GrupoNombre + '-') + 1, 20)),
        ea.GrupoNombre,
        p.NumeroOrden,
        ma.Nombre
    `));

  const periodosOrdenados = periodos.map((item: any) => ({
    periodoId: Number(item.PeriodoId),
    nombre: String(item.PeriodoNombre || ""),
    orden: Number(item.NumeroOrden || 0),
    anioNombre: String(item.AnioNombre || "")
  }));

  const estudiantes = new Map<number, any>();
  for (const row of result.recordset || []) {
    const estudianteId = Number(row.EstudianteId);
    if (!estudiantes.has(estudianteId)) {
      estudiantes.set(estudianteId, {
        estudianteId,
        cedula: String(row.Identificacion || ""),
        apellido1: String(row.PrimerApellido || ""),
        apellido2: String(row.SegundoApellido || ""),
        nombre: String(row.Nombre || ""),
        seccion: String(row.GrupoNombre || ""),
        adecuacion: String(row.Adecuacion || ""),
        periodos: new Map<number, any>()
      });
    }

    const estudiante = estudiantes.get(estudianteId);
    const periodoIdRow = Number(row.PeriodoId);
    if (!estudiante.periodos.has(periodoIdRow)) {
      estudiante.periodos.set(periodoIdRow, {
        periodoId: periodoIdRow,
        nombre: String(row.PeriodoNombre || ""),
        materiasEsperadas: 0,
        materiasConNota: 0,
        sumaNotas: 0,
        materiasSinNota: [] as string[]
      });
    }

    const periodo = estudiante.periodos.get(periodoIdRow);
    const materiaId = Number(row.MateriaId || 0);
    if (!materiaId) continue;

    periodo.materiasEsperadas += 1;
    const materiaNombre = String(row.MateriaNombre || "").trim() || `Materia ${materiaId}`;
    const registrosNota = Number(row.RegistrosNota || 0);
    const acumulado = Number(row.AcumuladoEvaluacion || 0);
    const totalLecciones = Number(row.TotalLecciones || 0);
    const ausenciasEquivalentes = Number(row.AusenciasEquivalentes || 0);
    const asistencia = calcularPuntosAsistenciaArticulo37(totalLecciones, ausenciasEquivalentes);
    const notaFinal = Math.max(0, Math.min(100, Number((acumulado + asistencia).toFixed(2))));

    if (registrosNota > 0) {
      periodo.materiasConNota += 1;
      periodo.sumaNotas += notaFinal;
    } else {
      periodo.materiasSinNota.push(materiaNombre);
    }
  }

  const rows = Array.from(estudiantes.values()).map((estudiante: any, index: number) => {
    for (const periodo of periodosOrdenados) {
      if (!estudiante.periodos.has(periodo.periodoId)) {
        estudiante.periodos.set(periodo.periodoId, {
          periodoId: periodo.periodoId,
          nombre: periodo.nombre,
          materiasEsperadas: 0,
          materiasConNota: 0,
          sumaNotas: 0,
          materiasSinNota: []
        });
      }
    }

    const periodosAlumno = periodosOrdenados.map((periodo) => estudiante.periodos.get(periodo.periodoId));
    const advertencias: string[] = [];

    for (const periodo of periodosAlumno) {
      if (!periodo.materiasEsperadas) {
        advertencias.push(`${periodo.nombre}: no hay materias activas configuradas.`);
      } else if (periodo.materiasSinNota.length) {
        const lista = periodo.materiasSinNota.slice(0, 4).join(", ");
        const extra = periodo.materiasSinNota.length > 4 ? ` y ${periodo.materiasSinNota.length - 4} más` : "";
        advertencias.push(`${periodo.nombre}: faltan notas en ${lista}${extra}.`);
      }
    }

    const periodosConPromedio = periodosAlumno
      .map((periodo) => periodo.materiasConNota > 0 ? periodo.sumaNotas / periodo.materiasConNota : null)
      .filter((value) => value !== null) as number[];

    const materiasEsperadas = periodosAlumno.reduce((total, item) => total + Number(item.materiasEsperadas || 0), 0);
    const materiasConNota = periodosAlumno.reduce((total, item) => total + Number(item.materiasConNota || 0), 0);
    const promedio = modo === "ANUAL"
      ? (periodosConPromedio.length ? periodosConPromedio.reduce((total, value) => total + value, 0) / periodosConPromedio.length : null)
      : (periodosAlumno[0]?.materiasConNota > 0 ? periodosAlumno[0].sumaNotas / periodosAlumno[0].materiasConNota : null);

    const estado = advertencias.length ? "Incompleto" : "Completo";
    const advertenciaTexto = advertencias.length
      ? `${advertencias.slice(0, 3).join(" ")}${advertencias.length > 3 ? ` ${advertencias.length - 3} advertencia(s) adicional(es).` : ""}`
      : "";

    return {
      linea: index + 1,
      cedula: estudiante.cedula,
      apellido1: estudiante.apellido1,
      apellido2: estudiante.apellido2,
      nombre: estudiante.nombre,
      seccion: estudiante.seccion,
      adecuacion: estudiante.adecuacion,
      periodos: `${periodosConPromedio.length}/${periodosOrdenados.length}`,
      materias: `${materiasConNota}/${materiasEsperadas}`,
      promedio: toRoundedNumber(promedio),
      estado,
      advertencias: advertenciaTexto
    };
  });

  const promediosValidos = rows
    .map((row: any) => Number(row.promedio))
    .filter((value: number) => Number.isFinite(value));

  return {
    resumen: {
      modo,
      anioLectivoId,
      anioLectivo: String(periodosOrdenados[0]?.anioNombre || ""),
      periodoId: modo === "PERIODO" ? Number(periodoId || 0) : null,
      periodo: modo === "PERIODO" ? String(periodosOrdenados[0]?.nombre || "") : "Anual",
      grupoId,
      totalEstudiantes: rows.length,
      completos: rows.filter((row: any) => row.estado === "Completo").length,
      incompletos: rows.filter((row: any) => row.estado !== "Completo").length,
      promedioGeneral: promediosValidos.length
        ? toRoundedNumber(promediosValidos.reduce((total: number, value: number) => total + value, 0) / promediosValidos.length)
        : null
    },
    rows
  };
}

async function ensureBoletaConductaEnvioReportColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.BoletaConducta', 'CodigoBoleta') IS NULL
    BEGIN
      ALTER TABLE dbo.BoletaConducta
      ADD CodigoBoleta NVARCHAR(120) NULL;
    END;

    IF COL_LENGTH('dbo.BoletaConductaEnvio', 'CorreoEnviado') IS NULL
    BEGIN
      ALTER TABLE dbo.BoletaConductaEnvio
      ADD CorreoEnviado BIT NOT NULL CONSTRAINT DF_BoletaConductaEnvio_CorreoEnviado_Reportes DEFAULT(0);
    END;

    IF COL_LENGTH('dbo.BoletaConductaEnvio', 'WhatsAppEnviado') IS NULL
    BEGIN
      ALTER TABLE dbo.BoletaConductaEnvio
      ADD WhatsAppEnviado BIT NOT NULL CONSTRAINT DF_BoletaConductaEnvio_WhatsAppEnviado_Reportes DEFAULT(0);
    END;
  `);
}

async function buildReporteAsistenciaGeneral(params: {
  req: any;
  pool: any;
  institucionId: number;
  grupoId: number | null;
  estudianteId: number | null;
  profesorId: number | null;
  desde: string | null;
  hasta: string | null;
  vistaPor: "ALUMNO" | "SECCION" | "PROFESOR";
}) {
  const { req, pool, institucionId, grupoId, estudianteId, desde, hasta, vistaPor } = params;
  const userId = getUserId(req);
  const profesorId = isAdminReportUser(req) ? params.profesorId : (userId || null);

  const commonRequest = () => pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("profesorId", sql.Int, profesorId)
    .input("usuarioId", sql.Int, userId || null)
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta);

  const baseStudentsResult = await timedQuery(`reportes.asistencia.${vistaPor.toLowerCase()}.base`, () => commonRequest().query(`
    WITH BaseStudents AS (
      SELECT DISTINCT
        m.AnioLectivoId,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        e.Adecuacion,
        ${suspensionVigenteSelectSql}
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      ${getSuspensionVigenteApplySql("e")}
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND e.Activo = 1
        AND ISNULL(m.Estado, N'') <> N'Inactiva'
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
        AND (
          @profesorId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.AsignacionDocente ad
            WHERE ad.InstitucionId = @institucionId
              AND ad.AnioLectivoId = m.AnioLectivoId
              AND ad.GrupoId = g.GrupoId
              AND ad.UsuarioId = @profesorId
              AND ad.MateriaId IS NOT NULL
              AND ad.Activo = 1
          )
          OR EXISTS (
            SELECT 1
            FROM dbo.AsistenciaRegistro arx
            WHERE arx.EstudianteId = e.EstudianteId
              AND arx.GrupoId = g.GrupoId
              AND arx.AnioLectivoId = m.AnioLectivoId
              AND arx.UsuarioRegistroId = @profesorId
              AND (@desde IS NULL OR arx.Fecha >= @desde)
              AND (@hasta IS NULL OR arx.Fecha <= @hasta)
          )
        )
    )
    SELECT *
    FROM BaseStudents
    ORDER BY PrimerApellido, SegundoApellido, Nombre, GrupoNombre, EstudianteId
  `));

  if (vistaPor === "PROFESOR") {
    const resumenProfesorResult = await timedQuery("reportes.asistencia.profesor.resumen", () => commonRequest().query(`
      WITH BaseStudents AS (
        SELECT DISTINCT
          m.AnioLectivoId,
          g.GrupoId,
          g.Nombre AS GrupoNombre,
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion,
          ${suspensionVigenteSelectSql}
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
        ${getSuspensionVigenteApplySql("e")}
        INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
        WHERE e.InstitucionId = @institucionId
          AND e.Activo = 1
          AND ISNULL(m.Estado, N'') <> N'Inactiva'
          AND (
            EXISTS (
              SELECT 1
              FROM dbo.AsignacionDocente ad
              WHERE ad.InstitucionId = @institucionId
                AND ad.AnioLectivoId = m.AnioLectivoId
                AND ad.GrupoId = g.GrupoId
                AND ad.UsuarioId = @profesorId
                AND ad.MateriaId IS NOT NULL
                AND ad.Activo = 1
            )
            OR EXISTS (
              SELECT 1
              FROM dbo.AsistenciaRegistro arx
              WHERE arx.EstudianteId = e.EstudianteId
                AND arx.GrupoId = g.GrupoId
                AND arx.AnioLectivoId = m.AnioLectivoId
                AND arx.UsuarioRegistroId = @profesorId
                AND (@desde IS NULL OR arx.Fecha >= @desde)
                AND (@hasta IS NULL OR arx.Fecha <= @hasta)
            )
          )
      ),
      MateriasProfesor AS (
        SELECT DISTINCT
          bs.AnioLectivoId,
          bs.GrupoId,
          bs.EstudianteId,
          gm.MateriaId
        FROM BaseStudents bs
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoId = bs.GrupoId
         AND gm.Activo = 1
        WHERE EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.InstitucionId = @institucionId
            AND ad.AnioLectivoId = bs.AnioLectivoId
            AND ad.GrupoId = bs.GrupoId
            AND ad.MateriaId = gm.MateriaId
            AND ad.UsuarioId = @profesorId
            AND ad.Activo = 1
        )
        UNION
        SELECT DISTINCT
          bs.AnioLectivoId,
          bs.GrupoId,
          bs.EstudianteId,
          arx.MateriaId
        FROM BaseStudents bs
        INNER JOIN dbo.AsistenciaRegistro arx
          ON arx.EstudianteId = bs.EstudianteId
         AND arx.GrupoId = bs.GrupoId
         AND arx.AnioLectivoId = bs.AnioLectivoId
        WHERE arx.UsuarioRegistroId = @profesorId
          AND (@desde IS NULL OR arx.Fecha >= @desde)
          AND (@hasta IS NULL OR arx.Fecha <= @hasta)
      ),
      ResumenProfesor AS (
        SELECT
          mp.EstudianteId,
          mp.GrupoId,
          mp.AnioLectivoId,
          COUNT(ar.AsistenciaRegistroId) AS TotalLecciones,
          SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'PRESENTE' THEN 1 ELSE 0 END) AS Presentes,
          SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'AUSENTE_JUSTIFICADA' THEN 1 ELSE 0 END) AS AusenciasJustificadas,
          SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) IN (N'AUSENTE_INJUSTIFICADA', N'TARDIA_MAYOR_10') THEN 1 ELSE 0 END) AS AusenciasInjustificadas,
          SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'TARDIA_MENOR_10' THEN 1 ELSE 0 END) AS Tardias,
          SUM(CASE WHEN ISNULL(reb.CorreoEnviado, 0) = 1 THEN 1 ELSE 0 END) AS CantidadCorreosEnviados,
          SUM(CASE WHEN ISNULL(reb.WaEnviado, 0) = 1 THEN 1 ELSE 0 END) AS CantidadWhatsAppEnviados
        FROM MateriasProfesor mp
        LEFT JOIN dbo.AsistenciaRegistro ar
          ON ar.EstudianteId = mp.EstudianteId
         AND ar.GrupoId = mp.GrupoId
         AND ar.AnioLectivoId = mp.AnioLectivoId
         AND ar.MateriaId = mp.MateriaId
         AND (@desde IS NULL OR ar.Fecha >= @desde)
         AND (@hasta IS NULL OR ar.Fecha <= @hasta)
         AND (
           ar.UsuarioRegistroId = @profesorId
           OR EXISTS (
             SELECT 1
             FROM dbo.AsignacionDocente ad
             WHERE ad.InstitucionId = @institucionId
               AND ad.AnioLectivoId = ar.AnioLectivoId
               AND ad.GrupoId = ar.GrupoId
               AND ad.MateriaId = ar.MateriaId
               AND ad.UsuarioId = @profesorId
               AND ad.Activo = 1
           )
         )
        LEFT JOIN dbo.ReporteEnvioBitacora reb
          ON reb.Modulo = N'ASISTENCIA'
         AND reb.RegistroClave = CONCAT(
           N'ASIS|',
           CONVERT(varchar(20), ar.GrupoId), N'|',
           CONVERT(varchar(20), ar.MateriaId), N'|',
           CONVERT(varchar(20), ar.PeriodoId), N'|',
           CONVERT(varchar(10), ar.Fecha, 23), N'|',
           CONVERT(varchar(20), ar.EstudianteId), N'|',
           CONVERT(varchar(20), ar.HorarioGrupoId)
         )
        GROUP BY
          mp.EstudianteId,
          mp.GrupoId,
          mp.AnioLectivoId
      )
      SELECT
        bs.EstudianteId,
        bs.Identificacion,
        bs.Nombre,
        bs.PrimerApellido,
        bs.SegundoApellido,
        bs.Adecuacion,
        bs.Suspendido,
        bs.MotivoSuspension,
        bs.FechaInicioSuspension,
        bs.FechaFinSuspension,
        bs.ObservacionSuspension,
        bs.GrupoNombre,
        ISNULL(rp.TotalLecciones, 0) AS TotalLecciones,
        ISNULL(rp.Presentes, 0) AS Presentes,
        ISNULL(rp.AusenciasJustificadas, 0) AS AusenciasJustificadas,
        ISNULL(rp.AusenciasInjustificadas, 0) AS AusenciasInjustificadas,
        ISNULL(rp.Tardias, 0) AS Tardias,
        ISNULL(rp.CantidadCorreosEnviados, 0) AS CantidadCorreosEnviados,
        ISNULL(rp.CantidadWhatsAppEnviados, 0) AS CantidadWhatsAppEnviados
      FROM BaseStudents bs
      LEFT JOIN ResumenProfesor rp
        ON rp.EstudianteId = bs.EstudianteId
       AND rp.GrupoId = bs.GrupoId
       AND rp.AnioLectivoId = bs.AnioLectivoId
      ORDER BY
        bs.PrimerApellido,
        bs.SegundoApellido,
        bs.Nombre,
        bs.GrupoNombre,
        bs.EstudianteId
    `));

    const rows = resumenProfesorResult.recordset.map((student: any) => {
      const totalLecciones = Number(student.TotalLecciones || 0);
      const tardias = Number(student.Tardias || 0);
      const ausenciasJustificadas = Number(student.AusenciasJustificadas || 0);
      const ausenciasInjustificadas = Number(student.AusenciasInjustificadas || 0);
      const presentes = Number(student.Presentes || 0);
      const cantidadCorreosEnviados = Number(student.CantidadCorreosEnviados || 0);
      const cantidadWhatsAppEnviados = Number(student.CantidadWhatsAppEnviados || 0);
      const alert = buildAsistenciaAlert(totalLecciones, tardias, ausenciasInjustificadas);

      return {
        estudianteId: Number(student.EstudianteId || 0),
        alumno: [student.PrimerApellido, student.SegundoApellido, student.Nombre].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
        identificacion: String(student.Identificacion || ""),
        seccion: String(student.GrupoNombre || ""),
        adecuacion: String(student.Adecuacion || ""),
        suspendido: student.Suspendido,
        motivoSuspension: student.MotivoSuspension || null,
        fechaInicioSuspension: student.FechaInicioSuspension || null,
        fechaFinSuspension: student.FechaFinSuspension || null,
        observacionSuspension: student.ObservacionSuspension || null,
        alertaTemprana: alert.alertaTemprana,
        totalLecciones,
        tardias,
        ausenciasJustificadas,
        ausenciasInjustificadas,
        presentes,
        cantidadCorreosEnviados,
        cantidadWhatsAppEnviados,
        detalle: []
      };
    });

    return {
      vistaPor,
      profesorId,
      rows
    };
  }

  const detalleResult = await timedQuery(`reportes.asistencia.${vistaPor.toLowerCase()}.detalle`, () => commonRequest().query(`
    WITH BaseStudents AS (
      SELECT DISTINCT
        m.AnioLectivoId,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        e.Adecuacion,
        ${suspensionVigenteSelectSql}
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      ${getSuspensionVigenteApplySql("e")}
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND e.Activo = 1
        AND ISNULL(m.Estado, N'') <> N'Inactiva'
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
        AND (
          @profesorId IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.AsignacionDocente ad
            WHERE ad.InstitucionId = @institucionId
              AND ad.AnioLectivoId = m.AnioLectivoId
              AND ad.GrupoId = g.GrupoId
              AND ad.UsuarioId = @profesorId
              AND ad.MateriaId IS NOT NULL
              AND ad.Activo = 1
          )
          OR EXISTS (
            SELECT 1
            FROM dbo.AsistenciaRegistro arx
            WHERE arx.EstudianteId = e.EstudianteId
              AND arx.GrupoId = g.GrupoId
              AND arx.AnioLectivoId = m.AnioLectivoId
              AND arx.UsuarioRegistroId = @profesorId
              AND (@desde IS NULL OR arx.Fecha >= @desde)
              AND (@hasta IS NULL OR arx.Fecha <= @hasta)
          )
        )
    ),
    MateriasBase AS (
      SELECT DISTINCT
        bs.AnioLectivoId,
        bs.GrupoId,
        bs.GrupoNombre,
        bs.EstudianteId,
        bs.Identificacion,
        bs.Nombre,
        bs.PrimerApellido,
        bs.SegundoApellido,
        bs.Adecuacion,
        bs.Suspendido,
        bs.MotivoSuspension,
        bs.FechaInicioSuspension,
        bs.FechaFinSuspension,
        bs.ObservacionSuspension,
        gm.MateriaId,
        m.Nombre AS MateriaNombre
      FROM BaseStudents bs
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoId = bs.GrupoId
       AND gm.Activo = 1
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
      WHERE @profesorId IS NULL
         OR EXISTS (
           SELECT 1
           FROM dbo.AsignacionDocente ad
           WHERE ad.InstitucionId = @institucionId
             AND ad.AnioLectivoId = bs.AnioLectivoId
             AND ad.GrupoId = bs.GrupoId
             AND ad.MateriaId = gm.MateriaId
             AND ad.UsuarioId = @profesorId
             AND ad.Activo = 1
         )
         OR EXISTS (
           SELECT 1
           FROM dbo.AsistenciaRegistro arx
           WHERE arx.EstudianteId = bs.EstudianteId
             AND arx.GrupoId = bs.GrupoId
             AND arx.AnioLectivoId = bs.AnioLectivoId
             AND arx.MateriaId = gm.MateriaId
             AND arx.UsuarioRegistroId = @profesorId
             AND (@desde IS NULL OR arx.Fecha >= @desde)
             AND (@hasta IS NULL OR arx.Fecha <= @hasta)
         )
    ),
    AsistenciaAgg AS (
      SELECT
        ar.EstudianteId,
        ar.GrupoId,
        ar.AnioLectivoId,
        ar.MateriaId,
        COUNT(ar.AsistenciaRegistroId) AS TotalLecciones,
        SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'PRESENTE' THEN 1 ELSE 0 END) AS Presentes,
        SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'AUSENTE_JUSTIFICADA' THEN 1 ELSE 0 END) AS AusenciasJustificadas,
        SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) IN (N'AUSENTE_INJUSTIFICADA', N'TARDIA_MAYOR_10') THEN 1 ELSE 0 END) AS AusenciasInjustificadas,
        SUM(CASE WHEN UPPER(ISNULL(ar.Estado, N'')) = N'TARDIA_MENOR_10' THEN 1 ELSE 0 END) AS Tardias,
        SUM(CASE WHEN ISNULL(reb.CorreoEnviado, 0) = 1 THEN 1 ELSE 0 END) AS CantidadCorreosEnviados,
        SUM(CASE WHEN ISNULL(reb.WaEnviado, 0) = 1 THEN 1 ELSE 0 END) AS CantidadWhatsAppEnviados
      FROM dbo.AsistenciaRegistro ar
      LEFT JOIN dbo.ReporteEnvioBitacora reb
        ON reb.Modulo = N'ASISTENCIA'
       AND reb.RegistroClave = CONCAT(
         N'ASIS|',
         CONVERT(varchar(20), ar.GrupoId), N'|',
         CONVERT(varchar(20), ar.MateriaId), N'|',
         CONVERT(varchar(20), ar.PeriodoId), N'|',
         CONVERT(varchar(10), ar.Fecha, 23), N'|',
         CONVERT(varchar(20), ar.EstudianteId), N'|',
         CONVERT(varchar(20), ar.HorarioGrupoId)
       )
      WHERE (@desde IS NULL OR ar.Fecha >= @desde)
        AND (@hasta IS NULL OR ar.Fecha <= @hasta)
        AND EXISTS (
          SELECT 1
          FROM BaseStudents bs
          WHERE bs.EstudianteId = ar.EstudianteId
            AND bs.GrupoId = ar.GrupoId
            AND bs.AnioLectivoId = ar.AnioLectivoId
        )
        AND (
          @profesorId IS NULL
          OR ar.UsuarioRegistroId = @profesorId
          OR EXISTS (
            SELECT 1
            FROM dbo.AsignacionDocente ad
            WHERE ad.InstitucionId = @institucionId
              AND ad.AnioLectivoId = ar.AnioLectivoId
              AND ad.GrupoId = ar.GrupoId
              AND ad.MateriaId = ar.MateriaId
              AND ad.UsuarioId = @profesorId
              AND ad.Activo = 1
          )
        )
      GROUP BY
        ar.EstudianteId,
        ar.GrupoId,
        ar.AnioLectivoId,
        ar.MateriaId
    )
    SELECT
      mb.GrupoId,
      mb.GrupoNombre,
      mb.EstudianteId,
      mb.Identificacion,
      mb.Nombre,
      mb.PrimerApellido,
      mb.SegundoApellido,
      mb.Adecuacion,
      mb.Suspendido,
      mb.MotivoSuspension,
      mb.FechaInicioSuspension,
      mb.FechaFinSuspension,
      mb.ObservacionSuspension,
      mb.MateriaId,
      mb.MateriaNombre,
      prof.ProfesorId AS ProfesorId,
      prof.ProfesorNombre AS ProfesorNombre,
      selectedProf.ProfesorId AS ProfesorIdRegistro,
      selectedProf.ProfesorNombre AS ProfesorNombreRegistro,
      ISNULL(aa.TotalLecciones, 0) AS TotalLecciones,
      ISNULL(aa.Presentes, 0) AS Presentes,
      ISNULL(aa.AusenciasJustificadas, 0) AS AusenciasJustificadas,
      ISNULL(aa.AusenciasInjustificadas, 0) AS AusenciasInjustificadas,
      ISNULL(aa.Tardias, 0) AS Tardias,
      ISNULL(aa.CantidadCorreosEnviados, 0) AS CantidadCorreosEnviados,
      ISNULL(aa.CantidadWhatsAppEnviados, 0) AS CantidadWhatsAppEnviados
    FROM MateriasBase mb
    OUTER APPLY (
      SELECT TOP 1
        ad.UsuarioId AS ProfesorId,
        LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, N''), N' ', ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N'')))) AS ProfesorNombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
      WHERE ad.InstitucionId = @institucionId
        AND ad.AnioLectivoId = mb.AnioLectivoId
        AND ad.GrupoId = mb.GrupoId
        AND ad.MateriaId = mb.MateriaId
        AND ad.Activo = 1
        AND (@profesorId IS NULL OR ad.UsuarioId = @profesorId)
      ORDER BY
        CASE WHEN @profesorId IS NOT NULL AND ad.UsuarioId = @profesorId THEN 0 ELSE 1 END,
        ad.AsignacionDocenteId DESC
    ) prof
    OUTER APPLY (
      SELECT TOP 1
        u.UsuarioId AS ProfesorId,
        LTRIM(RTRIM(CONCAT(ISNULL(u.Nombre, N''), N' ', ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N'')))) AS ProfesorNombre
      FROM dbo.Usuario u
      WHERE u.UsuarioId = @profesorId
    ) selectedProf
    LEFT JOIN AsistenciaAgg aa
      ON aa.EstudianteId = mb.EstudianteId
     AND aa.GrupoId = mb.GrupoId
     AND aa.AnioLectivoId = mb.AnioLectivoId
     AND aa.MateriaId = mb.MateriaId
    ORDER BY
      mb.PrimerApellido,
      mb.SegundoApellido,
      mb.Nombre,
      mb.GrupoNombre,
      mb.EstudianteId,
      mb.MateriaNombre
  `));

  const detallePorEstudiante = new Map<number, any[]>();
  for (const item of detalleResult.recordset) {
    const totalLecciones = Number(item.TotalLecciones || 0);
    const tardias = Number(item.Tardias || 0);
    const ausenciasJustificadas = Number(item.AusenciasJustificadas || 0);
    const ausenciasInjustificadas = Number(item.AusenciasInjustificadas || 0);
    const presentes = Number(item.Presentes || 0);
    const cantidadCorreosEnviados = Number(item.CantidadCorreosEnviados || 0);
    const cantidadWhatsAppEnviados = Number(item.CantidadWhatsAppEnviados || 0);
    const alert = buildAsistenciaAlert(totalLecciones, tardias, ausenciasInjustificadas);

    const detail = {
      materiaId: Number(item.MateriaId || 0),
      materia: String(item.MateriaNombre || ""),
      profesorId: Number(item.ProfesorId || item.ProfesorIdRegistro || 0) || null,
      profesor: String(item.ProfesorNombre || item.ProfesorNombreRegistro || "").trim() || "Sin profesor asignado",
      alertaTemprana: alert.alertaTemprana,
      totalLecciones,
      tardias,
      ausenciasJustificadas,
      ausenciasInjustificadas,
      presentes,
      cantidadCorreosEnviados,
      cantidadWhatsAppEnviados
    };

    const key = Number(item.EstudianteId || 0);
    const list = detallePorEstudiante.get(key) || [];
    list.push(detail);
    detallePorEstudiante.set(key, list);
  }

  const resumen = baseStudentsResult.recordset.map((student: any) => {
    const detalle = detallePorEstudiante.get(Number(student.EstudianteId || 0)) || [];
    const totalLecciones = detalle.reduce((acc, item) => acc + Number(item.totalLecciones || 0), 0);
    const tardias = detalle.reduce((acc, item) => acc + Number(item.tardias || 0), 0);
    const ausenciasJustificadas = detalle.reduce((acc, item) => acc + Number(item.ausenciasJustificadas || 0), 0);
    const ausenciasInjustificadas = detalle.reduce((acc, item) => acc + Number(item.ausenciasInjustificadas || 0), 0);
    const presentes = detalle.reduce((acc, item) => acc + Number(item.presentes || 0), 0);
    const cantidadCorreosEnviados = detalle.reduce((acc, item) => acc + Number(item.cantidadCorreosEnviados || 0), 0);
    const cantidadWhatsAppEnviados = detalle.reduce((acc, item) => acc + Number(item.cantidadWhatsAppEnviados || 0), 0);
    const alert = buildAsistenciaAlert(totalLecciones, tardias, ausenciasInjustificadas);

    return {
      estudianteId: Number(student.EstudianteId || 0),
      alumno: [student.PrimerApellido, student.SegundoApellido, student.Nombre].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      identificacion: String(student.Identificacion || ""),
      seccion: String(student.GrupoNombre || ""),
      adecuacion: String(student.Adecuacion || ""),
      suspendido: student.Suspendido,
      motivoSuspension: student.MotivoSuspension || null,
      fechaInicioSuspension: student.FechaInicioSuspension || null,
      fechaFinSuspension: student.FechaFinSuspension || null,
      observacionSuspension: student.ObservacionSuspension || null,
      alertaTemprana: alert.alertaTemprana,
      totalLecciones,
      tardias,
      ausenciasJustificadas,
      ausenciasInjustificadas,
      presentes,
      cantidadCorreosEnviados,
      cantidadWhatsAppEnviados,
      detalle
    };
  });

  return {
    vistaPor,
    profesorId,
    rows: resumen
  };
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaLargaCR(value?: Date | string | null) {
  const date = parseDateInputAsLocalDate(value, new Date());
  if (Number.isNaN(date.getTime())) return "";
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `${date.getDate()} días del mes de ${meses[date.getMonth()]} del ${date.getFullYear()}`;
}

async function ensureCertificacionEstudioTables(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.CertificacionEstudioConfig', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CertificacionEstudioConfig (
        InstitucionId INT NOT NULL PRIMARY KEY,
        SiguienteNumero INT NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_SiguienteNumero DEFAULT(1),
        Prefijo NVARCHAR(40) NULL,
        AnioLectivo NVARCHAR(10) NULL,
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_UpdatedAt DEFAULT(SYSDATETIME())
      );
    END;

    IF OBJECT_ID('dbo.CertificacionEstudioRegistro', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CertificacionEstudioRegistro (
        CertificacionEstudioId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        Consecutivo INT NOT NULL,
        CodigoConstancia NVARCHAR(120) NOT NULL,
        EstudianteId INT NOT NULL,
        GrupoId INT NULL,
        EstudianteNombre NVARCHAR(220) NULL,
        Identificacion NVARCHAR(60) NULL,
        GrupoNombre NVARCHAR(120) NULL,
        Suscrito NVARCHAR(200) NOT NULL,
        Puesto NVARCHAR(200) NOT NULL,
        CodigoPresupuestario NVARCHAR(50) NULL,
        TipoEducacion NVARCHAR(80) NOT NULL,
        MotivoTramite NVARCHAR(120) NOT NULL,
        CursoLectivo NVARCHAR(20) NULL,
        OtroColegioDestino NVARCHAR(250) NULL,
        LugarEmision NVARCHAR(250) NULL,
        HtmlSnapshot NVARCHAR(MAX) NULL,
        FechaEmision DATE NOT NULL,
        CreatedByUsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioRegistro_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_CertificacionEstudioRegistro_InstitucionConsecutivo
        ON dbo.CertificacionEstudioRegistro(InstitucionId, Consecutivo);
      CREATE INDEX IX_CertificacionEstudioRegistro_Estudiante
        ON dbo.CertificacionEstudioRegistro(InstitucionId, EstudianteId, CreatedAt DESC);
    END;

    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'EstudianteNombre') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD EstudianteNombre NVARCHAR(220) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'Identificacion') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD Identificacion NVARCHAR(60) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'GrupoNombre') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD GrupoNombre NVARCHAR(120) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'CursoLectivo') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD CursoLectivo NVARCHAR(20) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'OtroColegioDestino') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD OtroColegioDestino NVARCHAR(250) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'LugarEmision') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD LugarEmision NVARCHAR(250) NULL;
    IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'HtmlSnapshot') IS NULL
      ALTER TABLE dbo.CertificacionEstudioRegistro ADD HtmlSnapshot NVARCHAR(MAX) NULL;

    IF COL_LENGTH('dbo.CertificacionEstudioConfig', 'AnioLectivo') IS NULL
      ALTER TABLE dbo.CertificacionEstudioConfig ADD AnioLectivo NVARCHAR(10) NULL;
  `);
}

async function ensureUsuarioSexoColumn(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Usuario', 'Sexo') IS NULL
      ALTER TABLE dbo.Usuario ADD Sexo NVARCHAR(20) NULL;

    IF COL_LENGTH('dbo.Usuario', 'Titulo') IS NULL
      ALTER TABLE dbo.Usuario ADD Titulo NVARCHAR(100) NULL;
  `);
}

async function ensureInstitucionPlColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Institucion', 'CodigoPresupuestarioPL') IS NULL
      ALTER TABLE dbo.Institucion ADD CodigoPresupuestarioPL NVARCHAR(100) NULL;

    IF COL_LENGTH('dbo.Institucion', 'DescripcionCodigoPresupuestarioPL') IS NULL
      ALTER TABLE dbo.Institucion ADD DescripcionCodigoPresupuestarioPL NVARCHAR(255) NULL;
  `);
}

function joinNonEmpty(parts: any[], separator = " ") {
  return parts
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(separator)
    .trim();
}

function normalizeEducationLabel(value: any) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "GENERAL BASICA") return "General Básica";
  if (normalized === "DIVERSIFICADA") return "Diversificada";
  if (normalized === "ESPECIAL") return "Especial";
  return String(value || "").trim();
}

function normalizeWhitespace(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildNombreConTitulo(titulo: any, nombreCompleto: any) {
  const tituloNormalizado = normalizeWhitespace(titulo);
  const nombreNormalizado = normalizeWhitespace(nombreCompleto);
  return joinNonEmpty([tituloNormalizado, nombreNormalizado]);
}

function isPlanNacionalStudent(tipoEstudiante: any) {
  const normalized = normalizeWhitespace(tipoEstudiante)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return normalized.includes("PLAN NACIONAL");
}

function getNivelAcademicoLiteral(value: any) {
  const nivel = Number(value || 0);
  const labels: Record<number, string> = {
    1: "primer",
    2: "segundo",
    3: "tercer",
    4: "cuarto",
    5: "quinto",
    6: "sexto",
    7: "sétimo",
    8: "octavo",
    9: "noveno",
    10: "décimo",
    11: "undécimo",
    12: "duodécimo"
  };
  return labels[nivel] ? `${labels[nivel]} nivel` : "";
}

function getMotivoConstanciaLabel(motivoTramite: string, otroColegioDestino?: string) {
  const motivo = String(motivoTramite || "").trim().toUpperCase();
  if (motivo === "TRASLADO") {
    const destino = normalizeWhitespace(otroColegioDestino);
    return destino ? `para Trámite de Traslado al ${destino}` : "para Trámite de Traslado";
  }
  if (motivo === "CCSS") return "para trámite ante la CCSS";
  if (motivo === "PODER_JUDICIAL") return "para trámite ante el Poder Judicial";
  if (motivo === "PERSONAL") return "para trámite personal";
  return "para trámite ante el IMAS";
}

function stripPrefixedLabel(value: any, prefixPattern: RegExp) {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  return raw.replace(prefixPattern, "").trim();
}

function buildConstanciaHtml(params: {
  institucion: any;
  codigoConstancia: string;
  suscrito: string;
  textoSuscrito: string;
  puesto: string;
  codigoPresupuestario: string;
  estudianteNombre: string;
  identificacion: string;
  grado: string;
  tipoEducacion: string;
  motivoTramite: string;
  cursoLectivo: string;
  lugarEmision: string;
  otroColegioDestino?: string;
  fechaEmision: Date;
}) {
  const p = params;
  const nombreInstitucionCabecera =
    p.institucion?.NombreOficialBoleta ||
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    "";
  const ciudad = String(p.lugarEmision || "").trim() || "Costa Rica";
  const textoMotivo = p.motivoTramite === "TRASLADO"
    ? `Tramite de Traslado${p.otroColegioDestino ? ` al ${p.otroColegioDestino}` : " al otro colegio"}`
    : p.motivoTramite === "CCSS"
      ? "tramites ante la CCSS"
      : p.motivoTramite === "PODER_JUDICIAL"
        ? "tramites ante el Poder Judicial"
        : p.motivoTramite === "PERSONAL"
          ? "tramites de uso personal"
          : (p.motivoTramite === "OTROS" ? "otros tramites" : "tramites ante el IMAS");

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Constancia ${escapeHtml(p.codigoConstancia)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.4;color:#1f2937;background:#f3f4f6;margin:0;padding:0}
    .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:10mm 12mm 8mm;border:0;display:flex;flex-direction:column}
    .top-header{width:100%;border-bottom:1px solid #4b5563;padding-bottom:6px}
    .top-header-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .top-header-table td{vertical-align:middle;padding:0}
    .top-left{width:270px}
    .top-left img{display:block;width:100%;max-width:270px;height:auto;max-height:54px;object-fit:contain}
    .top-center{padding:0 14px;font-size:11px;line-height:1.15;font-weight:400;overflow-wrap:anywhere}
    .top-right{width:78px;text-align:right}
    .top-right img{display:inline-block;width:62px;height:auto;max-width:62px;max-height:62px;object-fit:contain}
    h1{text-align:center;margin:32px 0 6px;font-size:12pt;font-weight:700;letter-spacing:0}
    h2{text-align:center;margin:0 0 20px;font-size:12pt;font-weight:700;letter-spacing:0}
    .texto{font-size:12pt;line-height:1.5;text-align:justify;margin:0 0 16px}
    .firma{margin-top:32px;font-size:12pt;line-height:1.8}
    .ultima{margin-top:auto;text-align:center;font-size:12pt;color:#334155}
    .pie{margin-top:12px;padding-top:8px;border-top:2px solid #93c5fd;text-align:center;font-size:16px;color:#475569}
    @page{size:A4;margin:0}
    @media print{body{background:#fff}.page{border:0;margin:0;width:210mm;min-height:297mm;page-break-after:avoid}}
  </style>
</head>
<body>
  <div class="page">
    <div class="top-header">
      <div class="top-left">${p.institucion?.MembreteUrl ? `<img src="${escapeHtml(p.institucion.MembreteUrl)}" alt="Membrete" />` : ""}</div>
      <div class="top-center">
        <div>${escapeHtml(p.institucion?.RegionalEducativa || "")}</div>
        <div>${p.institucion?.CircuitoEducativo ? `Supervisión de Centros Educativos, ${escapeHtml(p.institucion.CircuitoEducativo)}` : ""}</div>
        <div>${escapeHtml(nombreInstitucionCabecera)}</div>
      </div>
      <div class="top-right">${p.institucion?.LogoUrl ? `<img src="${escapeHtml(p.institucion.LogoUrl)}" alt="Logo" />` : ""}</div>
    </div>

    <h1>Constancia</h1>
    <h2>${escapeHtml(p.codigoConstancia)}</h2>

    <p class="texto">
      ${escapeHtml(p.textoSuscrito)}, ${escapeHtml(p.suscrito)}, en calidad de ${escapeHtml(p.puesto)} del
      ${escapeHtml(nombreInstitucionCabecera)}, código presupuestario ${escapeHtml(p.codigoPresupuestario)},
      hace constar que la persona estudiante <strong>${escapeHtml(p.estudianteNombre)}</strong>, número de cédula
      <strong>${escapeHtml(p.identificacion)}</strong>, es estudiante regular de ${escapeHtml(p.grado)}
      de la Educación ${escapeHtml(p.tipoEducacion)}.
      En el curso lectivo ${escapeHtml(p.cursoLectivo)}.
    </p>

    <p class="texto">
      Dado en ${escapeHtml(ciudad)}, a los ${escapeHtml(fechaLargaCR(p.fechaEmision))},
      a solicitud de la persona encargada para ${escapeHtml(textoMotivo)}.
    </p>

    <div class="firma">
      <div>${escapeHtml(p.suscrito)}</div>
      <div>${escapeHtml(p.puesto)}</div>
      <div>${escapeHtml(nombreInstitucionCabecera)}</div>
    </div>

    <div class="ultima">************************Última línea************************<br/>***Cualquier anotación debajo de esta línea, anula este documento***</div>
    <div class="pie">
      ${escapeHtml(p.institucion?.DireccionExacta || p.institucion?.Direccion || "")}<br/>
      ${escapeHtml(p.institucion?.TelefonoPrincipal || "")} ${p.institucion?.CorreoPrincipal ? ` / ${escapeHtml(p.institucion.CorreoPrincipal)}` : ""}
    </div>
  </div>
</body>
</html>`;
}

function buildConstanciaHtmlV2(params: {
  institucion: any;
  codigoConstancia: string;
  suscrito: string;
  textoSuscrito: string;
  puesto: string;
  codigoPresupuestario: string;
  estudianteNombre: string;
  identificacion: string;
  grado: string;
  tipoEducacion: string;
  motivoTramite: string;
  cursoLectivo: string;
  lugarEmision: string;
  nombreEncargado: string;
  esPlanNacional?: boolean;
  programaPlanNacional?: string;
  otroColegioDestino?: string;
  fechaEmision: Date;
}) {
  const p = params;
  const nombreInstitucionParrafo =
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    p.institucion?.NombreOficialBoleta ||
    "";
  const nombreInstitucionFirma = normalizeWhitespace(
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    p.institucion?.NombreOficialBoleta ||
    ""
  ).toLocaleUpperCase("es-CR");
  const circuitoValor = stripPrefixedLabel(p.institucion?.CircuitoEducativo, /^circuito\s*/i);
  const regionalValor = stripPrefixedLabel(
    p.institucion?.RegionalEducativa,
    /^direcci[oó]n\s+regional(\s+de)?\s*/i
  );
  const ciudad = String(p.lugarEmision || "").trim() || "Costa Rica";
  const textoMotivo = getMotivoConstanciaLabel(p.motivoTramite, p.otroColegioDestino);
  const tituloConstancia = String(p.motivoTramite || "").trim().toUpperCase() === "TRASLADO"
    ? "Constancia de Traslado"
    : "Constancia de estudiante";
  const tipoEducacionLabel = p.esPlanNacional
    ? "Especial"
    : normalizeEducationLabel(p.tipoEducacion);
  const detallePresupuestario = p.esPlanNacional
    ? joinNonEmpty(
        [
          p.codigoPresupuestario ? `código presupuestario ${p.codigoPresupuestario}` : "",
          normalizeWhitespace(
            p.programaPlanNacional ||
            "III Ciclo y IV Ciclo Diversificado Vocacional (Plan Nacional)"
          ).replace(/^código presupuestario\s+/i, "")
        ],
        ", "
      )
    : (p.codigoPresupuestario ? `código presupuestario ${p.codigoPresupuestario}` : "");
  const circuitoRegional = joinNonEmpty(
    [
      circuitoValor ? `del circuito ${circuitoValor}` : "",
      regionalValor ? `de la Dirección Regional de ${regionalValor}` : ""
    ],
    " "
  );
  const detalleInstitucional = joinNonEmpty([detallePresupuestario, circuitoRegional], ", ");
  const direccionFooter = normalizeWhitespace(p.institucion?.DireccionExacta || p.institucion?.Direccion || "");
  const telefonoFooter = normalizeWhitespace(p.institucion?.TelefonoPrincipal || "");
  const correoFooter = normalizeWhitespace(p.institucion?.CorreoPrincipal || "");
  const contactoFooter = joinNonEmpty(
    [telefonoFooter ? `Teléfono ${telefonoFooter}` : "", correoFooter],
    ", "
  );
  const puestoParrafo = normalizeWhitespace(p.puesto).toLocaleLowerCase("es-CR");
  const bloqueRegularidad = p.esPlanNacional
    ? `es estudiante regular de ${escapeHtml(p.grado)}, de la Educación ${escapeHtml(tipoEducacionLabel)}, Programa de Plan Nacional, en el curso lectivo ${escapeHtml(p.cursoLectivo)}.`
    : `es estudiante regular de la sección ${escapeHtml(p.grado)} de la Educación ${escapeHtml(tipoEducacionLabel)}, en el curso lectivo ${escapeHtml(p.cursoLectivo)}.`;

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Constancia ${escapeHtml(p.codigoConstancia)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.4;color:#111827;background:#f3f4f6;margin:0;padding:0}
    .page{width:216mm;min-height:279mm;margin:0 auto;background:#fff;padding:16mm 19.05mm 8mm;border:0;display:flex;flex-direction:column}
    .top-header{width:100%;border-bottom:1px solid #26355f;padding-bottom:6px;margin-bottom:0;overflow:hidden}
    .top-header-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
    .top-header-table td{vertical-align:middle;padding:0}
    .top-left{width:134mm}
    .top-left img{display:block;width:134mm;max-width:134mm;height:18mm;max-height:18mm;object-fit:contain;object-position:left center}
    .top-right{width:38mm;text-align:right}
    .top-right img{display:inline-block;width:38mm;max-width:38mm;height:18mm;max-height:18mm;object-fit:contain;object-position:right center}
    h1{text-align:center;margin:28px 0 6px;font-size:12pt;font-weight:700;letter-spacing:0}
    h2{text-align:center;margin:0 0 20px;font-size:12pt;font-weight:700;letter-spacing:0}
    .texto{font-size:12pt;line-height:1.45;text-align:justify;text-indent:0;margin:0 0 14px}
    .firma{margin-top:2.9em;font-size:12pt;line-height:1.35;text-align:left}
    .colegio-firma{font-weight:700;margin-bottom:2.9em}
    .firmante-firma{margin-bottom:1.45em}
    .ultima{text-align:center;font-size:12pt;color:#111827;line-height:1.35;margin:0}
    .footer-wrap{margin-top:auto;padding-top:8mm}
    .footer-blue{background:#242f63;color:#fff;text-align:center;font-size:12pt;font-weight:700;line-height:1.15;padding:3mm 4mm;margin:0}
    @page{size:Letter;margin:25.4mm 19.05mm}
    @media print{body{background:#fff}.page{border:0;margin:0;page-break-after:avoid}}
  </style>
</head>
<body>
  <div class="page">
    <div class="top-header">
      <table class="top-header-table" role="presentation">
        <tr>
          <td class="top-left">${p.institucion?.MembreteUrl ? `<img src="${escapeHtml(p.institucion.MembreteUrl)}" alt="Membrete" width="506" height="68" style="display:block;width:134mm;max-width:134mm;height:18mm;max-height:18mm;object-fit:contain;object-position:left center;" />` : ""}</td>
          <td class="top-right">${p.institucion?.LogoUrl ? `<img src="${escapeHtml(p.institucion.LogoUrl)}" alt="Logo institucional" width="144" height="68" style="display:inline-block;width:38mm;max-width:38mm;height:18mm;max-height:18mm;object-fit:contain;object-position:right center;" />` : ""}</td>
        </tr>
      </table>
    </div>

    <h1>${escapeHtml(tituloConstancia)}</h1>
    <h2>${escapeHtml(p.codigoConstancia)}</h2>

    <p class="texto">${escapeHtml(p.textoSuscrito)}, ${escapeHtml(p.suscrito)}, en calidad de ${escapeHtml(puestoParrafo)} del ${escapeHtml(nombreInstitucionParrafo)}${detalleInstitucional ? `, ${escapeHtml(detalleInstitucional)}` : ""}, hace constar que ${p.esPlanNacional ? "el estudiante" : "la persona estudiante"} <strong>${escapeHtml(p.estudianteNombre)}</strong>, número de cédula <strong>${escapeHtml(p.identificacion)}</strong>, ${bloqueRegularidad}</p>

    <p class="texto">
      Dado en ${escapeHtml(ciudad)}, a los ${escapeHtml(fechaLargaCR(p.fechaEmision))},
      a solicitud de la persona encargada ${escapeHtml(p.nombreEncargado || "")}, ${escapeHtml(textoMotivo)}.
    </p>

    <div class="firma">
      <div class="colegio-firma">${escapeHtml(nombreInstitucionFirma)}</div>
      <div class="firmante-firma">
        <div>${escapeHtml(p.suscrito)}</div>
        <div>${escapeHtml(p.puesto)}</div>
      </div>
      <div class="ultima">************************Última línea************************<br/><br/>***Cualquier anotación debajo de esta línea, anula este documento***</div>
    </div>

    <div class="footer-wrap">
      <div class="footer-blue">
        <div>${escapeHtml(direccionFooter)}</div>
        ${contactoFooter ? `<div>${escapeHtml(contactoFooter)}</div>` : ""}
      </div>
    </div>
  </div>
</body>
</html>`;
}

const DOCX_FONT = "Arial";
const DOCX_NO_BORDER = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
const DOCX_CELL_BORDERS = {
  top: DOCX_NO_BORDER,
  bottom: DOCX_NO_BORDER,
  left: DOCX_NO_BORDER,
  right: DOCX_NO_BORDER
};

function docxRun(text: any, options: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: DOCX_FONT,
    size: options.size || 24,
    bold: !!options.bold,
    color: options.color
  });
}

function docxParagraph(
  children: TextRun[] | string,
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    spacingAfter?: number;
    spacingBefore?: number;
  } = {}
) {
  const runs = Array.isArray(children) ? children : [docxRun(children, { bold: options.bold })];
  return new Paragraph({
    children: runs,
    alignment: options.alignment,
    spacing: {
      before: options.spacingBefore || 0,
      after: options.spacingAfter || 0,
      line: 276
    }
  });
}

function docxCell(children: Paragraph[], options: any = {}) {
  return new TableCell({
    children,
    borders: DOCX_CELL_BORDERS,
    verticalAlign: VerticalAlignTable.CENTER,
    ...options
  });
}

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
      if (!match) return null;
      if (/image\/(webp|svg\+xml)/i.test(match[1])) return null;
      const buffer = Buffer.from(match[2], "base64");
      return new ImageRun({
        type: getImageTypeFromUrl(rawUrl, match[1]),
        data: buffer,
        transformation: { width, height },
        altText: { title: altText, description: altText, name: altText }
      });
    }

    if (!/^https?:\/\//i.test(rawUrl)) return null;
    const response = await fetch(rawUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "";
    if (/image\/(webp|svg\+xml)/i.test(contentType) || /\.(webp|svg)(\?|#|$)/i.test(rawUrl)) return null;
    return new ImageRun({
      type: getImageTypeFromUrl(rawUrl, contentType),
      data: Buffer.from(arrayBuffer),
      transformation: { width, height },
      altText: { title: altText, description: altText, name: altText }
    });
  } catch {
    return null;
  }
}

function htmlToPlainText(value: any) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractConstanciaSnapshotInfo(htmlSnapshot: any) {
  const plain = htmlToPlainText(htmlSnapshot);
  const textoSuscrito = plain.match(/\b(La suscrita|El suscrito|La persona suscrita)\b/i)?.[1] || "";
  const encargado = plain.match(/a solicitud de la persona encargada\s+(.+?),\s+(?:para|por|seg[uú]n|a solicitud|tr[aá]mites?)/i)?.[1] || "";
  return {
    textoSuscrito,
    nombreEncargado: normalizeWhitespace(encargado)
  };
}

async function buildConstanciaDocx(params: {
  institucion: any;
  codigoConstancia: string;
  suscrito: string;
  textoSuscrito: string;
  puesto: string;
  codigoPresupuestario: string;
  estudianteNombre: string;
  identificacion: string;
  grado: string;
  tipoEducacion: string;
  motivoTramite: string;
  cursoLectivo: string;
  lugarEmision: string;
  nombreEncargado: string;
  esPlanNacional?: boolean;
  programaPlanNacional?: string;
  otroColegioDestino?: string;
  fechaEmision: Date;
}) {
  const p = params;
  const nombreInstitucionParrafo =
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    p.institucion?.NombreOficialBoleta ||
    "";
  const nombreInstitucionFirma = normalizeWhitespace(
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    p.institucion?.NombreOficialBoleta ||
    ""
  ).toLocaleUpperCase("es-CR");
  const circuitoValor = stripPrefixedLabel(p.institucion?.CircuitoEducativo, /^circuito\s*/i);
  const regionalValor = stripPrefixedLabel(
    p.institucion?.RegionalEducativa,
    /^direcci[oó]n\s+regional(\s+de)?\s*/i
  );
  const ciudad = String(p.lugarEmision || "").trim() || "Costa Rica";
  const textoMotivo = getMotivoConstanciaLabel(p.motivoTramite, p.otroColegioDestino);
  const tituloConstancia = String(p.motivoTramite || "").trim().toUpperCase() === "TRASLADO"
    ? "Constancia de Traslado"
    : "Constancia de estudiante";
  const tipoEducacionLabel = p.esPlanNacional
    ? "Especial"
    : normalizeEducationLabel(p.tipoEducacion);
  const detallePresupuestario = p.esPlanNacional
    ? joinNonEmpty(
        [
          p.codigoPresupuestario ? `código presupuestario ${p.codigoPresupuestario}` : "",
          normalizeWhitespace(
            p.programaPlanNacional ||
            "III Ciclo y IV Ciclo Diversificado Vocacional (Plan Nacional)"
          ).replace(/^código presupuestario\s+/i, "")
        ],
        ", "
      )
    : (p.codigoPresupuestario ? `código presupuestario ${p.codigoPresupuestario}` : "");
  const circuitoRegional = joinNonEmpty(
    [
      circuitoValor ? `del circuito ${circuitoValor}` : "",
      regionalValor ? `de la Dirección Regional de ${regionalValor}` : ""
    ],
    " "
  );
  const detalleInstitucional = joinNonEmpty([detallePresupuestario, circuitoRegional], ", ");
  const direccionFooter = normalizeWhitespace(p.institucion?.DireccionExacta || p.institucion?.Direccion || "");
  const telefonoFooter = normalizeWhitespace(p.institucion?.TelefonoPrincipal || "");
  const correoFooter = normalizeWhitespace(p.institucion?.CorreoPrincipal || "");
  const contactoFooter = joinNonEmpty(
    [telefonoFooter ? `Teléfono ${telefonoFooter}` : "", correoFooter],
    ", "
  );
  const puestoParrafo = normalizeWhitespace(p.puesto).toLocaleLowerCase("es-CR");
  const textoRegularidad = p.esPlanNacional
    ? `, número de cédula ${p.identificacion}, es estudiante regular de ${p.grado}, de la Educación ${tipoEducacionLabel}, Programa de Plan Nacional, en el curso lectivo ${p.cursoLectivo}.`
    : `, número de cédula ${p.identificacion}, es estudiante regular de la sección ${p.grado} de la Educación ${tipoEducacionLabel}, en el curso lectivo ${p.cursoLectivo}.`;

  const membrete = await fetchDocxImage(p.institucion?.MembreteUrl, 506, 68, "Membrete institucional");
  const logo = await fetchDocxImage(p.institucion?.LogoUrl, 144, 68, "Logo institucional");
  const headerTable = new Table({
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
          docxCell([
            new Paragraph({
              children: membrete ? [membrete] : [],
              spacing: { before: 0, after: 80 }
            })
          ], { width: { size: 7800, type: WidthType.DXA } }),
          docxCell([
            new Paragraph({
              children: logo ? [logo] : [],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 0, after: 80 }
            })
          ], { width: { size: 2280, type: WidthType.DXA } })
        ]
      })
    ]
  });

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: DOCX_NO_BORDER,
      bottom: DOCX_NO_BORDER,
      left: DOCX_NO_BORDER,
      right: DOCX_NO_BORDER,
      insideHorizontal: DOCX_NO_BORDER,
      insideVertical: DOCX_NO_BORDER
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: DOCX_CELL_BORDERS,
            shading: { fill: "242F63" },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: [
              docxParagraph(direccionFooter, {
                alignment: AlignmentType.CENTER,
                bold: true,
                spacingAfter: 0
              }),
              docxParagraph(contactoFooter, {
                alignment: AlignmentType.CENTER,
                bold: true,
                spacingAfter: 0
              })
            ]
          })
        ]
      })
    ]
  });

  const firstParagraphRuns = [
    docxRun(`${p.textoSuscrito}, ${p.suscrito}, en calidad de ${puestoParrafo} del ${nombreInstitucionParrafo}${detalleInstitucional ? `, ${detalleInstitucional}` : ""}, hace constar que ${p.esPlanNacional ? "el estudiante" : "la persona estudiante"} `),
    docxRun(p.estudianteNombre, { bold: true }),
    docxRun(", número de cédula "),
    docxRun(p.identificacion, { bold: true }),
    docxRun(textoRegularidad.replace(`, número de cédula ${p.identificacion}`, ""))
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 900, right: 1080, bottom: 1440, left: 1080, header: 360, footer: 360 }
          }
        },
        headers: {
          default: new Header({ children: [headerTable] })
        },
        footers: {
          default: new Footer({ children: [footerTable] })
        },
        children: [
          docxParagraph(tituloConstancia, { alignment: AlignmentType.CENTER, bold: true, spacingBefore: 420, spacingAfter: 120 }),
          docxParagraph(p.codigoConstancia, { alignment: AlignmentType.CENTER, bold: true, spacingAfter: 360 }),
          docxParagraph(firstParagraphRuns, { alignment: AlignmentType.JUSTIFIED, spacingAfter: 240 }),
          docxParagraph(
            `Dado en ${ciudad}, a los ${fechaLargaCR(p.fechaEmision)}, a solicitud de la persona encargada ${p.nombreEncargado || "sin nombre registrado"}, ${textoMotivo}.`,
            { alignment: AlignmentType.JUSTIFIED, spacingAfter: 520 }
          ),
          docxParagraph(nombreInstitucionFirma, { bold: true, spacingAfter: 520 }),
          docxParagraph(p.suscrito, { spacingAfter: 0 }),
          docxParagraph(p.puesto, { spacingAfter: 240 }),
          docxParagraph("************************Última línea************************", { alignment: AlignmentType.CENTER, spacingAfter: 240 }),
          docxParagraph("***Cualquier anotación debajo de esta línea, anula este documento***", { alignment: AlignmentType.CENTER })
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

router.get("/academico", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId).query(`
    SELECT TOP 50 g.Nombre AS Grupo, m.Nombre AS Materia, COUNT(DISTINCT mat.EstudianteId) AS Estudiantes
    FROM dbo.Grupo g
    LEFT JOIN dbo.GrupoMateria gm ON gm.GrupoId = g.GrupoId
    LEFT JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
    LEFT JOIN dbo.Matricula mat ON mat.GrupoId = g.GrupoId
    WHERE g.InstitucionId = @institucionId
    GROUP BY g.Nombre, m.Nombre
    ORDER BY g.Nombre
  `);
  return ok(res, result.recordset);
});

router.get("/padres", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId).query(`
    SELECT TOP 50 e.Nombre, e.PrimerApellido, e.SegundoApellido, enc.Nombre AS Encargado, enc.Correo, enc.Telefono
    FROM dbo.Estudiante e
    LEFT JOIN dbo.EstudianteEncargado ee ON ee.EstudianteId = e.EstudianteId AND ee.EsPrincipal = 1
    LEFT JOIN dbo.Encargado enc ON enc.EncargadoId = ee.EncargadoId
    WHERE e.InstitucionId = @institucionId
    ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
  `);
  return ok(res, result.recordset);
});

router.get("/boletas-conducta", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId).query(`
    SELECT TOP 300
      b.BoletaConductaId,
      b.Consecutivo,
      b.CodigoBoleta,
      b.Fecha,
      b.Seccion,
      b.DetalleHechos,
      b.LugarAcontecimiento,
      b.NombreFuncionario,
      e.EstudianteId,
      e.Identificacion,
      e.Nombre,
      e.PrimerApellido,
      e.SegundoApellido,
      e.Adecuacion AS TipoAdecuacion,
      ISNULL(envios.TotalEnvios, 0) AS TotalEnviosCorreo,
      ISNULL(envios.TotalExitos, 0) AS TotalEnviosExitosos
    FROM dbo.BoletaConducta b
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
    OUTER APPLY (
      SELECT
        COUNT(1) AS TotalEnvios,
        SUM(CASE WHEN ISNULL(be.Enviado, 0) = 1 THEN 1 ELSE 0 END) AS TotalExitos
      FROM dbo.BoletaConductaEnvio be
      WHERE be.BoletaConductaId = b.BoletaConductaId
    ) envios
    WHERE b.InstitucionId = @institucionId
    ORDER BY b.Fecha DESC, b.Consecutivo DESC, b.BoletaConductaId DESC
  `);
  return ok(res, result.recordset);
});

router.get("/gestion-filtros", async (req, res) => {
  try {
    const pool = await getPool();
    const usuarioId = getUserId(req);
    const filtroProfesor = isAdminReportUser(req) ? "" : "AND u.UsuarioId = @usuarioId";
    const institucionId = Number(req.auth?.institucionId || 0);

    const aniosResult = await timedQuery("reportes.gestion-filtros.anios", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          AnioLectivoId,
          Nombre,
          FechaInicio,
          FechaFin,
          Activo
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND Activo = 1
        ORDER BY FechaInicio DESC, AnioLectivoId DESC
      `));

    const periodosResult = await timedQuery("reportes.gestion-filtros.periodos", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          p.PeriodoId,
          p.AnioLectivoId,
          p.Nombre,
          p.NumeroOrden,
          p.FechaInicio,
          p.FechaFin,
          a.Nombre AS AnioNombre
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE a.InstitucionId = @institucionId
          AND p.Activo = 1
        ORDER BY a.FechaInicio DESC, p.NumeroOrden ASC
      `));

    const seccionesResult = await timedQuery("reportes.gestion-filtros.secciones", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT g.GrupoId, g.Nombre AS GrupoNombre
        FROM dbo.Grupo g
        WHERE g.InstitucionId = @institucionId
        ${SQL_ORDER_BY_SECCION}
      `));

    const alumnosResult = await timedQuery("reportes.gestion-filtros.alumnos", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion,
          g.GrupoId,
          g.Nombre AS GrupoNombre
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
        WHERE e.InstitucionId = @institucionId
          AND m.Estado = 'ACTIVA'
        ${SQL_ORDER_BY_SECCION_Y_ESTUDIANTE}
      `));

    const profesoresResult = await timedQuery("reportes.gestion-filtros.profesores", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId || null)
      .query(`
        SELECT
          u.UsuarioId AS ProfesorId,
          u.Correo,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido
        FROM dbo.Usuario u
        WHERE u.InstitucionId = @institucionId
          AND u.Activo = 1
          ${filtroProfesor}
          AND EXISTS (
            SELECT 1
            FROM dbo.UsuarioRol ur
            INNER JOIN dbo.Rol r
              ON r.RolId = ur.RolId
            WHERE ur.UsuarioId = u.UsuarioId
              AND ur.Activo = 1
              AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
          )
        ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre
      `));

    const tiposEstudianteResult = await timedQuery("reportes.gestion-filtros.tipos-estudiante", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        WITH TiposNormalizados AS (
          SELECT DISTINCT
            Valor = CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) = N'PLAN NACIONAL' THEN N'PLAN NACIONAL'
              WHEN UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) = N'REGULAR' THEN N'REGULAR'
              WHEN UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) IN (N'TRASLADO', N'TRASLADOS') THEN N'TRASLADOS'
              ELSE NULL
            END
          FROM dbo.TipoEstudiante
          WHERE InstitucionId = @institucionId
            AND Activo = 1
        )
        SELECT
          Valor,
          Descripcion = CASE Valor
            WHEN N'PLAN NACIONAL' THEN N'Plan Nacional'
            WHEN N'REGULAR' THEN N'Regular'
            WHEN N'TRASLADOS' THEN N'Traslados'
            ELSE Valor
          END
        FROM TiposNormalizados
        WHERE Valor IS NOT NULL
        ORDER BY Descripcion
      `));

    const tiposAdecuacionResult = await timedQuery("reportes.gestion-filtros.tipos-adecuacion", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TipoAdecuacionId, Descripcion
        FROM dbo.TipoAdecuacion
        WHERE InstitucionId = @institucionId
          AND Activo = 1
          AND UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) NOT IN (N'REGULAR', N'SIN ADECUACION', N'SIN ADECUACIÓN', N'SELECCIONE', N'NO')
        ORDER BY Descripcion
      `));

    return ok(res, {
      aniosLectivos: aniosResult.recordset,
      periodos: periodosResult.recordset,
      secciones: seccionesResult.recordset,
      alumnos: alumnosResult.recordset,
      profesores: profesoresResult.recordset,
      tiposEstudiante: tiposEstudianteResult.recordset,
      tiposAdecuacion: tiposAdecuacionResult.recordset
    });
  } catch (error) {
    console.error("Error cargando filtros de reportes:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los filtros de reportes" });
  }
});

router.get("/horario-profesor", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const usuarioId = getUserId(req);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const profesorId = req.query.profesorId ? Number(req.query.profesorId) : null;

    if (!institucionId) return badRequest(res, "No se pudo determinar la institución");
    if (anioLectivoId !== null && (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0)) {
      return badRequest(res, "El año lectivo seleccionado no es válido");
    }
    if (profesorId !== null && (!Number.isInteger(profesorId) || profesorId <= 0)) {
      return badRequest(res, "El profesor seleccionado no es válido");
    }

    const reporte = await buildHorarioProfesorData(
      pool,
      institucionId,
      usuarioId,
      isAdminReportUser(req),
      anioLectivoId,
      profesorId
    );

    if (!reporte) {
      return badRequest(res, "No hay un año lectivo disponible para esta institución");
    }

    if (profesorId && !reporte.profesores.length) {
      return res.status(404).json({ ok: false, message: "El profesor seleccionado no existe o no está disponible" });
    }

    return ok(res, reporte);
  } catch (error) {
    console.error("Error consultando horario de profesores:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar el horario de profesores" });
  }
});

router.get("/horario-profesor/excel", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const usuarioId = getUserId(req);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const profesorId = req.query.profesorId ? Number(req.query.profesorId) : null;

    if (!institucionId) return badRequest(res, "No se pudo determinar la institución");
    if (anioLectivoId !== null && (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0)) {
      return badRequest(res, "El año lectivo seleccionado no es válido");
    }
    if (profesorId !== null && (!Number.isInteger(profesorId) || profesorId <= 0)) {
      return badRequest(res, "El profesor seleccionado no es válido");
    }

    const reporte = await buildHorarioProfesorData(
      pool,
      institucionId,
      usuarioId,
      isAdminReportUser(req),
      anioLectivoId,
      profesorId
    );

    if (!reporte) {
      return badRequest(res, "No hay un año lectivo disponible para esta institución");
    }
    if (!reporte.profesores.length) {
      return badRequest(res, "No hay profesores disponibles para exportar");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Profe360";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = "Horario de profesores";
    workbook.subject = `Horarios ${reporte.anioNombre}`;
    workbook.company = "Profe360";

    const usedSheetNames = new Set<string>();
    const bloques = [...reporte.bloques].sort((a: any, b: any) =>
      Number(a.OrdenVisual || 0) - Number(b.OrdenVisual || 0)
      || Number(a.BloqueHorarioId || 0) - Number(b.BloqueHorarioId || 0)
    );

    for (const profesor of reporte.profesores) {
      const worksheet = workbook.addWorksheet(getUniqueWorksheetName(profesor.nombre, usedSheetNames), {
        views: [{ state: "frozen", ySplit: 4, xSplit: 1 }]
      });
      worksheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        horizontalCentered: true,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.2,
          footer: 0.2
        }
      };
      worksheet.columns = [
        { width: 25 },
        { width: 27 },
        { width: 27 },
        { width: 27 },
        { width: 27 },
        { width: 27 }
      ];

      worksheet.mergeCells("A1:F1");
      worksheet.getCell("A1").value = "Horario del profesor";
      worksheet.getCell("A1").font = { bold: true, size: 17, color: { argb: "FF0F172A" } };
      worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(1).height = 25;

      worksheet.mergeCells("A2:F2");
      worksheet.getCell("A2").value = profesor.nombre || profesor.correo;
      worksheet.getCell("A2").font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
      worksheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

      worksheet.mergeCells("A3:F3");
      worksheet.getCell("A3").value = [reporte.anioNombre, profesor.periodoNombre].filter(Boolean).join(" - ");
      worksheet.getCell("A3").font = { bold: true, size: 11, color: { argb: "FF475569" } };
      worksheet.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };

      const headerRow = worksheet.getRow(4);
      headerRow.values = ["Lección", ...HORARIO_DIAS.map((dia) => dia.nombre)];
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF0F172A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F2" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF94A3B8" } },
          left: { style: "thin", color: { argb: "FF94A3B8" } },
          bottom: { style: "thin", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: "FF94A3B8" } }
        };
      });

      let rowNumber = 5;
      for (const bloque of bloques) {
        const tipoNoLectivo = getHorarioBloqueNoLectivo(bloque.Nombre);
        const label = getHorarioBloqueLabel(bloque);
        if (tipoNoLectivo) {
          worksheet.mergeCells(rowNumber, 1, rowNumber, 6);
          const cell = worksheet.getCell(rowNumber, 1);
          cell.value = label;
          cell.font = {
            bold: true,
            color: { argb: tipoNoLectivo === "ALMUERZO" ? "FF166534" : "FF92400E" }
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: tipoNoLectivo === "ALMUERZO" ? "FFD1FAE5" : "FFFEF3C7" }
          };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF94A3B8" } },
            left: { style: "thin", color: { argb: "FF94A3B8" } },
            bottom: { style: "thin", color: { argb: "FF94A3B8" } },
            right: { style: "thin", color: { argb: "FF94A3B8" } }
          };
          worksheet.getRow(rowNumber).height = 21;
          rowNumber += 1;
          continue;
        }

        const row = worksheet.getRow(rowNumber);
        row.getCell(1).value = label;
        row.getCell(1).font = { bold: true, color: { argb: "FF0F172A" } };
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        HORARIO_DIAS.forEach((dia, dayIndex) => {
          const entradas = profesor.entradas.filter((entrada: any) =>
            Number(entrada.BloqueHorarioId) === Number(bloque.BloqueHorarioId)
            && Number(entrada.DiaSemana) === dia.diaSemana
          );
          const textos = Array.from(new Set(entradas.map((entrada: any) =>
            `${String(entrada.GrupoNombre || "").trim()} ${String(entrada.MateriaNombre || "").trim()}`.trim()
          ).filter(Boolean)));
          const cell = row.getCell(dayIndex + 2);
          cell.value = textos.length ? textos.join("\n") : "Libre";
          cell.font = {
            bold: true,
            color: { argb: textos.length ? "FF1E3A8A" : "FF475569" }
          };
          cell.fill = textos.length
            ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }
            : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } }
          };
        });
        row.height = 34;
        rowNumber += 1;
      }

      worksheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: 6 }
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const profesorNombre = reporte.profesores.length === 1 ? reporte.profesores[0].nombre : "todos-los-profesores";
    const fileName = `horario-profesor-${safeExcelFileNamePart(profesorNombre)}-${safeExcelFileNamePart(reporte.anioNombre)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error exportando horario de profesores:", error);
    return res.status(500).json({ ok: false, message: "No se pudo exportar el horario de profesores" });
  }
});

router.get("/horario-seccion", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

    if (!institucionId) return badRequest(res, "No se pudo determinar la instituciÃ³n");
    if (anioLectivoId !== null && (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0)) {
      return badRequest(res, "El aÃ±o lectivo seleccionado no es vÃ¡lido");
    }
    if (grupoId !== null && (!Number.isInteger(grupoId) || grupoId <= 0)) {
      return badRequest(res, "La secciÃ³n seleccionada no es vÃ¡lida");
    }

    const reporte = await buildHorarioSeccionData(pool, institucionId, anioLectivoId, grupoId);

    if (!reporte) {
      return badRequest(res, "No hay un aÃ±o lectivo disponible para esta instituciÃ³n");
    }

    if (grupoId && !reporte.secciones.length) {
      return res.status(404).json({ ok: false, message: "La secciÃ³n seleccionada no existe o no tiene horario disponible" });
    }

    return ok(res, reporte);
  } catch (error) {
    console.error("Error consultando horario de secciones:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar el horario de secciones" });
  }
});

router.get("/horario-seccion/excel", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

    if (!institucionId) return badRequest(res, "No se pudo determinar la instituciÃ³n");
    if (anioLectivoId !== null && (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0)) {
      return badRequest(res, "El aÃ±o lectivo seleccionado no es vÃ¡lido");
    }
    if (grupoId !== null && (!Number.isInteger(grupoId) || grupoId <= 0)) {
      return badRequest(res, "La secciÃ³n seleccionada no es vÃ¡lida");
    }

    const reporte = await buildHorarioSeccionData(pool, institucionId, anioLectivoId, grupoId);

    if (!reporte) {
      return badRequest(res, "No hay un aÃ±o lectivo disponible para esta instituciÃ³n");
    }
    if (!reporte.secciones.length) {
      return badRequest(res, "No hay secciones disponibles para exportar");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Profe360";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = "Horario de secciones";
    workbook.subject = `Horarios ${reporte.anioNombre}`;
    workbook.company = "Profe360";

    const usedSheetNames = new Set<string>();
    const bloques = [...reporte.bloques].sort((a: any, b: any) =>
      Number(a.OrdenVisual || 0) - Number(b.OrdenVisual || 0)
      || Number(a.BloqueHorarioId || 0) - Number(b.BloqueHorarioId || 0)
    );

    for (const seccion of reporte.secciones) {
      const worksheet = workbook.addWorksheet(getUniqueWorksheetName(seccion.nombre, usedSheetNames), {
        views: [{ state: "frozen", ySplit: 4, xSplit: 1 }]
      });
      worksheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        horizontalCentered: true,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.2,
          footer: 0.2
        }
      };
      worksheet.columns = [
        { width: 25 },
        { width: 32 },
        { width: 32 },
        { width: 32 },
        { width: 32 },
        { width: 32 }
      ];

      worksheet.mergeCells("A1:F1");
      worksheet.getCell("A1").value = "Horario de secciÃ³n";
      worksheet.getCell("A1").font = { bold: true, size: 17, color: { argb: "FF0F172A" } };
      worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(1).height = 25;

      worksheet.mergeCells("A2:F2");
      worksheet.getCell("A2").value = seccion.nombre;
      worksheet.getCell("A2").font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };
      worksheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };

      worksheet.mergeCells("A3:F3");
      worksheet.getCell("A3").value = [reporte.anioNombre, seccion.periodoNombre].filter(Boolean).join(" - ");
      worksheet.getCell("A3").font = { bold: true, size: 11, color: { argb: "FF475569" } };
      worksheet.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };

      const headerRow = worksheet.getRow(4);
      headerRow.values = ["LecciÃ³n", ...HORARIO_DIAS.map((dia) => dia.nombre)];
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF0F172A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F2" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF94A3B8" } },
          left: { style: "thin", color: { argb: "FF94A3B8" } },
          bottom: { style: "thin", color: { argb: "FF94A3B8" } },
          right: { style: "thin", color: { argb: "FF94A3B8" } }
        };
      });

      let rowNumber = 5;
      for (const bloque of bloques) {
        const tipoNoLectivo = getHorarioBloqueNoLectivo(bloque.Nombre);
        const label = getHorarioBloqueLabel(bloque);
        if (tipoNoLectivo) {
          worksheet.mergeCells(rowNumber, 1, rowNumber, 6);
          const cell = worksheet.getCell(rowNumber, 1);
          cell.value = label;
          cell.font = {
            bold: true,
            color: { argb: tipoNoLectivo === "ALMUERZO" ? "FF166534" : "FF92400E" }
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: tipoNoLectivo === "ALMUERZO" ? "FFD1FAE5" : "FFFEF3C7" }
          };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF94A3B8" } },
            left: { style: "thin", color: { argb: "FF94A3B8" } },
            bottom: { style: "thin", color: { argb: "FF94A3B8" } },
            right: { style: "thin", color: { argb: "FF94A3B8" } }
          };
          worksheet.getRow(rowNumber).height = 21;
          rowNumber += 1;
          continue;
        }

        const row = worksheet.getRow(rowNumber);
        row.getCell(1).value = label;
        row.getCell(1).font = { bold: true, color: { argb: "FF0F172A" } };
        row.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

        HORARIO_DIAS.forEach((dia, dayIndex) => {
          const entradas = seccion.entradas.filter((entrada: any) =>
            Number(entrada.BloqueHorarioId) === Number(bloque.BloqueHorarioId)
            && Number(entrada.DiaSemana) === dia.diaSemana
          );
          const textos = Array.from(new Set(entradas.map((entrada: any) => {
            const profesor = String(entrada.ProfesorNombre || entrada.ProfesorCorreo || "Sin profesor").trim();
            const materia = String(entrada.MateriaNombre || "").trim();
            return [profesor, materia].filter(Boolean).join("\n");
          }).filter(Boolean)));
          const cell = row.getCell(dayIndex + 2);
          cell.value = textos.length ? textos.join("\n\n") : "Libre";
          cell.font = {
            bold: true,
            color: { argb: textos.length ? "FF1E3A8A" : "FF475569" }
          };
          cell.fill = textos.length
            ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }
            : { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        });

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } }
          };
        });
        row.height = 48;
        rowNumber += 1;
      }

      worksheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: 6 }
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const seccionNombre = reporte.secciones.length === 1 ? reporte.secciones[0].nombre : "todas-las-secciones";
    const fileName = `horario-seccion-${safeExcelFileNamePart(seccionNombre)}-${safeExcelFileNamePart(reporte.anioNombre)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error exportando horario de secciones:", error);
    return res.status(500).json({ ok: false, message: "No se pudo exportar el horario de secciones" });
  }
});

router.get("/gestion-profe/secciones/excel", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : 0;

    if (!grupoId) {
      return badRequest(res, "Seleccioná una sección para exportar el reporte");
    }

    const reporte = await buildReporteSeccionData(pool, institucionId, grupoId);
    if (!reporte) {
      return badRequest(res, "La sección seleccionada no existe para esta institución");
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Profe360";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = `Lista de alumnos de la sección ${reporte.seccion}`;
    workbook.title = `Sección ${reporte.seccion}`;
    workbook.company = "Profe360";
    workbook.properties.date1904 = false;

    const worksheet = workbook.addWorksheet("Seccion", {
      views: [{ state: "frozen", ySplit: 2 }]
    });

    worksheet.pageSetup = {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      horizontalCentered: true,
      verticalCentered: false,
      printTitlesRow: "1:2",
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.2,
        footer: 0.2
      }
    };

    worksheet.columns = [
      { key: "linea", width: 6 },
      { key: "cedula", width: 16 },
      { key: "apellido1", width: 22 },
      { key: "apellido2", width: 22 },
      { key: "nombre", width: 26 }
    ];

    worksheet.mergeCells("A1:E1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = `Sección ${reporte.seccion}`;
    titleCell.font = { bold: true, size: 16, color: { argb: "FF000000" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 24;

    const headerRow = worksheet.getRow(2);
    headerRow.values = ["#", "Cédula", "Apellido 1", "Apellido 2", "Nombre"];
    headerRow.height = 18;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF000000" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF334155" } },
        left: { style: "thin", color: { argb: "FF334155" } },
        bottom: { style: "thin", color: { argb: "FF334155" } },
        right: { style: "thin", color: { argb: "FF334155" } }
      };
    });

    reporte.rows.forEach((item: any, idx: number) => {
      const rowNumber = idx + 3;
      const row = worksheet.getRow(rowNumber);
      row.values = [
        Number(item.linea || idx + 1),
        String(item.cedula || ""),
        String(item.apellido1 || ""),
        String(item.apellido2 || ""),
        String(item.nombre || "")
      ];
      row.height = 18;
      const adecuacionStyleKind = getAdecuacionReporteStyleKind(item.adecuacion);
      const fillColor = adecuacionStyleKind === "SIGNIFICATIVA"
        ? "FFDCFCE7"
        : adecuacionStyleKind === "NO_SIGNIFICATIVA"
          ? "FFE0F2FE"
          : idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
        cell.alignment = {
          horizontal: colNumber === 1 ? "center" : "left",
          vertical: "middle",
          wrapText: false
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF64748B" } },
          left: { style: "thin", color: { argb: "FF64748B" } },
          bottom: { style: "thin", color: { argb: "FF64748B" } },
          right: { style: "thin", color: { argb: "FF64748B" } }
        };
        if (adecuacionStyleKind === "SIGNIFICATIVA") {
          cell.font = { ...(cell.font || {}), bold: true };
        }
        if (adecuacionStyleKind === "NO_SIGNIFICATIVA") {
          cell.font = { ...(cell.font || {}), color: { argb: "FF64748B" } };
        }
      });
      worksheet.getCell(`B${rowNumber}`).numFmt = "@";
      worksheet.getCell(`B${rowNumber}`).alignment = { horizontal: "left", vertical: "middle", wrapText: false };
    });

    worksheet.autoFilter = {
      from: "A2",
      to: "E2"
    };

    const rawBuffer: any = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
    const fileName = `seccion-${safeExcelFileNamePart(reporte.seccion)}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length");
    res.setHeader("Content-Length", String(buffer.length));
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando reporte de sección en Excel:", error);
    return res.status(500).json({ ok: false, message: "No se pudo exportar el reporte de sección" });
  }
});

function normalizeCierreCursoReporteRow(row: any) {
  let advertencias: string[] = [];
  try {
    const parsed = row.AdvertenciasJson ? JSON.parse(String(row.AdvertenciasJson)) : [];
    advertencias = Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    advertencias = [];
  }

  return {
    cierreAcademicoCursoId: Number(row.CierreAcademicoCursoId || 0),
    institucionId: Number(row.InstitucionId || 0),
    grupoId: Number(row.GrupoId || 0),
    grupoNombre: String(row.GrupoNombre || ""),
    materiaId: Number(row.MateriaId || 0),
    materiaNombre: String(row.MateriaNombre || ""),
    materiaCodigo: row.MateriaCodigo || null,
    anioLectivoId: Number(row.AnioLectivoId || 0),
    anioNombre: String(row.AnioNombre || ""),
    periodoId: Number(row.PeriodoId || 0),
    periodoNombre: String(row.PeriodoNombre || ""),
    estado: String(row.Estado || ""),
    promedioGeneral: row.PromedioGeneral === null || row.PromedioGeneral === undefined ? null : Number(row.PromedioGeneral),
    totalEstudiantes: Number(row.TotalEstudiantes || 0),
    totalCompletos: Number(row.TotalCompletos || 0),
    totalIncompletos: Number(row.TotalIncompletos || 0),
    docente: String(row.DocenteNombre || "").trim(),
    cerradoPor: String(row.CerradoPorNombre || "").trim(),
    cerradoAt: row.CerradoAt || null,
    reabiertoPor: String(row.ReabiertoPorNombre || "").trim(),
    reabiertoAt: row.ReabiertoAt || null,
    motivoReapertura: row.MotivoReapertura || null,
    advertencias
  };
}

router.get("/cierre-cursos", async (req, res) => {
  try {
    if (!isAdminReportUser(req)) {
      return res.status(403).json({ ok: false, message: "Solo Dirección o Administración puede consultar cursos cerrados" });
    }

    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

    await ensureCierreAcademicoCursoTables(pool);

    const result = await timedQuery("reportes.cierre-cursos.listado", () => pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .query(`
        SELECT
          c.CierreAcademicoCursoId,
          c.InstitucionId,
          c.GrupoId,
          g.Nombre AS GrupoNombre,
          c.MateriaId,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          c.AnioLectivoId,
          al.Nombre AS AnioNombre,
          c.PeriodoId,
          p.Nombre AS PeriodoNombre,
          p.NumeroOrden,
          c.Estado,
          c.PromedioGeneral,
          c.TotalEstudiantes,
          c.TotalCompletos,
          c.TotalIncompletos,
          c.AdvertenciasJson,
          c.CerradoAt,
          c.ReabiertoAt,
          c.MotivoReapertura,
          LTRIM(RTRIM(CONCAT(ISNULL(doc.Nombre, N''), N' ', ISNULL(doc.PrimerApellido, N''), N' ', ISNULL(doc.SegundoApellido, N'')))) AS DocenteNombre,
          LTRIM(RTRIM(CONCAT(ISNULL(cerradoPor.Nombre, N''), N' ', ISNULL(cerradoPor.PrimerApellido, N''), N' ', ISNULL(cerradoPor.SegundoApellido, N'')))) AS CerradoPorNombre,
          LTRIM(RTRIM(CONCAT(ISNULL(reabiertoPor.Nombre, N''), N' ', ISNULL(reabiertoPor.PrimerApellido, N''), N' ', ISNULL(reabiertoPor.SegundoApellido, N'')))) AS ReabiertoPorNombre
        FROM dbo.CierreAcademicoCurso c
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = c.GrupoId
         AND g.InstitucionId = c.InstitucionId
        LEFT JOIN dbo.Materia m
          ON m.MateriaId = c.MateriaId
        INNER JOIN dbo.AnioLectivo al
          ON al.AnioLectivoId = c.AnioLectivoId
         AND al.InstitucionId = c.InstitucionId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = c.PeriodoId
        LEFT JOIN dbo.Usuario doc
          ON doc.UsuarioId = c.UsuarioDocenteId
        LEFT JOIN dbo.Usuario cerradoPor
          ON cerradoPor.UsuarioId = c.CerradoPorUsuarioId
        LEFT JOIN dbo.Usuario reabiertoPor
          ON reabiertoPor.UsuarioId = c.ReabiertoPorUsuarioId
        WHERE c.InstitucionId = @institucionId
          AND c.Activo = 1
          AND c.Estado = N'${CIERRE_CURSO_ESTADO_CERRADO}'
          AND (@anioLectivoId IS NULL OR c.AnioLectivoId = @anioLectivoId)
          AND (@periodoId IS NULL OR c.PeriodoId = @periodoId)
          AND (@grupoId IS NULL OR c.GrupoId = @grupoId)
        ORDER BY
          al.FechaInicio DESC,
          p.NumeroOrden ASC,
          TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)),
          TRY_CONVERT(int, SUBSTRING(g.Nombre, CHARINDEX('-', g.Nombre + '-') + 1, 20)),
          g.Nombre,
          m.Nombre
      `));

    return ok(res, result.recordset.map(normalizeCierreCursoReporteRow));
  } catch (error) {
    console.error("Error consultando cursos cerrados:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron consultar los cursos cerrados" });
  }
});

router.post("/cierre-cursos/:cierreId/reabrir", async (req, res) => {
  try {
    if (!isAdminReportUser(req)) {
      return res.status(403).json({ ok: false, message: "Solo Dirección o Administración puede reabrir cursos cerrados" });
    }

    const pool = await getPool();
    const institucionId = Number(req.auth?.institucionId || 0);
    const cierreId = Number(req.params.cierreId || 0);
    const motivo = String(req.body?.motivo || "").trim().slice(0, 1000);
    if (!cierreId) return badRequest(res, "Cierre inválido");
    if (!motivo) return badRequest(res, "El motivo de reapertura es obligatorio");

    await ensureCierreAcademicoCursoTables(pool);

    const actualResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("cierreId", sql.Int, cierreId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.CierreAcademicoCurso
        WHERE InstitucionId = @institucionId
          AND CierreAcademicoCursoId = @cierreId
          AND Activo = 1
      `);

    const cierreActual = actualResult.recordset[0];
    if (!cierreActual) return res.status(404).json({ ok: false, message: "No se encontró el cierre seleccionado" });
    if (String(cierreActual.Estado || "").toUpperCase() !== CIERRE_CURSO_ESTADO_CERRADO) {
      return badRequest(res, "El curso no está cerrado actualmente");
    }

    const usuarioId = getUserId(req) || null;
    const update = await pool.request()
      .input("cierreId", sql.Int, cierreId)
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
    await pool.request()
      .input("cierreId", sql.Int, cierreId)
      .input("accion", sql.NVarChar(40), "REAPERTURA_DIRECCION")
      .input("usuarioId", sql.Int, usuarioId)
      .input("motivo", sql.NVarChar(1000), motivo)
      .input("estadoAnterior", sql.NVarChar(40), cierreActual.Estado || null)
      .input("estadoNuevo", sql.NVarChar(40), CIERRE_CURSO_ESTADO_REABIERTO)
      .input("snapshotJson", sql.NVarChar(sql.MAX), JSON.stringify(cierreReabierto || {}))
      .query(`
        INSERT INTO dbo.CierreAcademicoCursoAuditoria
          (CierreAcademicoCursoId, Accion, UsuarioId, Motivo, EstadoAnterior, EstadoNuevo, SnapshotJson, CreatedAt)
        VALUES
          (@cierreId, @accion, @usuarioId, @motivo, @estadoAnterior, @estadoNuevo, @snapshotJson, SYSDATETIME())
      `);

    return ok(res, {
      cierreAcademicoCursoId: cierreId,
      estado: CIERRE_CURSO_ESTADO_REABIERTO,
      reabiertoAt: cierreReabierto?.ReabiertoAt || null
    }, "Curso reabierto correctamente");
  } catch (error) {
    console.error("Error reabriendo curso desde reportes:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reabrir el curso" });
  }
});

router.get("/gestion-profe", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const tipo = String(req.query.tipo || "NOTAS").toUpperCase();
  const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
  const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
  const profesorId = req.query.profesorId ? Number(req.query.profesorId) : null;
  const q = String(req.query.q || "").trim();
  const gradoRaw = req.query.grado ? Number(req.query.grado) : null;
  const grado = Number.isFinite(gradoRaw) ? gradoRaw : null;
  const tipoEstudiante = String(req.query.tipoEstudiante || "").trim().toUpperCase() || null;
  const adecuacion = String(req.query.adecuacion || "").trim() || null;
  const desde = String(req.query.desde || "").trim() || null;
  const hasta = String(req.query.hasta || "").trim() || null;
  const vistaPor = String(req.query.vistaPor || "SECCION").trim().toUpperCase();
  const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
  const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;
  const modoPromedios = String(req.query.modoPromedios || "PERIODO").trim().toUpperCase() === "ANUAL" ? "ANUAL" : "PERIODO";

  const request = pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("profesorId", sql.Int, profesorId)
    .input("q", sql.NVarChar(200), q ? `%${q}%` : null)
    .input("grado", sql.Int, grado)
    .input("tipoEstudiante", sql.NVarChar(50), tipoEstudiante)
    .input("adecuacion", sql.NVarChar(200), adecuacion)
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta);

  if (tipo === "CONSTANCIA_ESTUDIO") {
    const result = await request.query(`
      SELECT
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND m.Estado = 'ACTIVA'
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre, g.Nombre, e.EstudianteId
    `);
    return ok(res, result.recordset);
  }

  if (tipo === "PROMEDIOS_ACADEMICOS") {
    if (!isAdminReportUser(req)) {
      return res.status(403).json({ ok: false, message: "Solo administración puede consultar la vista previa de promedios académicos" });
    }
    if (!anioLectivoId) {
      return badRequest(res, "Seleccioná el año lectivo para consultar promedios académicos");
    }
    if (modoPromedios === "PERIODO" && !periodoId) {
      return badRequest(res, "Seleccioná el período para consultar la vista previa");
    }

    const preview = await buildPromediosAcademicosPreview({
      pool,
      institucionId,
      anioLectivoId,
      periodoId,
      grupoId,
      modo: modoPromedios
    });
    return ok(res, preview);
  }

  if (tipo === "SECCIONES") {
    if (!grupoId) {
      return badRequest(res, "Seleccioná una sección para consultar el reporte");
    }

    const reporte = await buildReporteSeccionData(pool, institucionId, grupoId);
    if (!reporte) {
      return badRequest(res, "La sección seleccionada no existe para esta institución");
    }

    return ok(res, reporte);
  }

  if (tipo === "ESTUDIANTES") {
    try {
      const result = await timedQuery("reportes.gestion-profe.estudiantes", () => request.query(`
        WITH TipoEstudianteFiltro AS (
          SELECT te.TipoEstudianteId
          FROM dbo.TipoEstudiante te
          WHERE te.InstitucionId = @institucionId
            AND te.Activo = 1
            AND (
              (@tipoEstudiante = N'PLAN NACIONAL' AND UPPER(LTRIM(RTRIM(ISNULL(te.Descripcion, N'')))) = N'PLAN NACIONAL')
              OR (@tipoEstudiante = N'REGULAR' AND UPPER(LTRIM(RTRIM(ISNULL(te.Descripcion, N'')))) = N'REGULAR')
              OR (@tipoEstudiante = N'TRASLADOS' AND UPPER(LTRIM(RTRIM(ISNULL(te.Descripcion, N'')))) IN (N'TRASLADO', N'TRASLADOS'))
            )
        ),
        BaseEstudiantes AS (
          SELECT
            m.MatriculaId,
            m.Estado AS EstadoMatricula,
            m.AnioLectivoId,
            e.EstudianteId,
            e.Identificacion,
            e.TipoIdentificacion,
            e.PrimerApellido,
            e.SegundoApellido,
            e.Nombre,
            e.FechaNacimiento,
            e.Sexo,
            e.Correo,
            e.Telefono,
            e.Nacionalidad,
            e.CodigoCarnet,
            e.TipoEstudianteId,
            e.RutaTransporteId,
            e.RutaTransporteHabitual,
            e.Repitente,
            e.Refugiado,
            e.AutorizaWhatsAppEncargado,
            e.TieneAdecuacion,
            e.Adecuacion,
            e.NivelFuncionamiento,
            e.Discapacidad,
            e.TipoDiscapacidad,
            e.Enfermedad,
            e.ObservacionMedica,
            e.Observaciones,
            ${suspensionVigenteSelectSql},
            g.GrupoId,
            g.Nombre AS GrupoNombre,
            TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)) AS GradoNumero
          FROM dbo.Matricula m
          INNER JOIN dbo.Estudiante e
            ON e.EstudianteId = m.EstudianteId
          ${getSuspensionVigenteApplySql("e")}
          INNER JOIN dbo.Grupo g
            ON g.GrupoId = m.GrupoId
          WHERE e.InstitucionId = @institucionId
            AND e.Activo = 1
            AND ISNULL(m.Estado, N'') <> N'Inactiva'
            AND TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)) BETWEEN 7 AND 12
            AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
            AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
            AND (@grado IS NULL OR TRY_CONVERT(int, LEFT(LTRIM(g.Nombre), PATINDEX('%[^0-9]%', LTRIM(g.Nombre) + 'X') - 1)) = @grado)
            AND (
              @tipoEstudiante IS NULL
              OR EXISTS (
                SELECT 1
                FROM TipoEstudianteFiltro tf
                WHERE tf.TipoEstudianteId = e.TipoEstudianteId
              )
            )
            AND (
              @adecuacion IS NULL
              OR UPPER(LTRIM(RTRIM(ISNULL(e.Adecuacion, N'')))) = UPPER(LTRIM(RTRIM(@adecuacion)))
            )
            AND (
              @q IS NULL
              OR e.Identificacion LIKE @q
              OR e.Nombre LIKE @q
              OR e.PrimerApellido LIKE @q
              OR e.SegundoApellido LIKE @q
              OR LTRIM(RTRIM(CONCAT(
                ISNULL(e.PrimerApellido, N''),
                CASE WHEN NULLIF(LTRIM(RTRIM(e.SegundoApellido)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(e.SegundoApellido)) ELSE N'' END,
                CASE WHEN NULLIF(LTRIM(RTRIM(e.Nombre)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(e.Nombre)) ELSE N'' END
              ))) LIKE @q
            )
        ),
        EncargadosRanked AS (
          SELECT
            ee.EstudianteId,
            ROW_NUMBER() OVER (
              PARTITION BY ee.EstudianteId
              ORDER BY
                CASE WHEN ISNULL(ee.EsPrincipal, 0) = 1 THEN 0 ELSE 1 END,
                CASE enc.TipoEncargado WHEN 'MADRE' THEN 1 WHEN 'PADRE' THEN 2 ELSE 3 END,
                ee.EstudianteEncargadoId DESC
            ) AS rn,
            ee.Parentesco,
            enc.Identificacion,
            enc.Correo,
            enc.Telefono,
            enc.TelefonoSecundario,
            enc.DireccionExacta,
            LTRIM(RTRIM(CONCAT(
              ISNULL(enc.Nombre, N''),
              CASE WHEN NULLIF(LTRIM(RTRIM(enc.PrimerApellido)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(enc.PrimerApellido)) ELSE N'' END,
              CASE WHEN NULLIF(LTRIM(RTRIM(enc.SegundoApellido)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(enc.SegundoApellido)) ELSE N'' END
            ))) AS NombreCompleto
          FROM dbo.EstudianteEncargado ee
          INNER JOIN dbo.Encargado enc
            ON enc.EncargadoId = ee.EncargadoId
          INNER JOIN (SELECT DISTINCT EstudianteId FROM BaseEstudiantes) be
            ON be.EstudianteId = ee.EstudianteId
          WHERE ee.Activo = 1
        ),
        EncargadosPivot AS (
          SELECT
            EstudianteId,
            MAX(CASE WHEN rn = 1 THEN NombreCompleto END) AS Encargado1Nombre,
            MAX(CASE WHEN rn = 1 THEN Identificacion END) AS Encargado1Identificacion,
            MAX(CASE WHEN rn = 1 THEN Parentesco END) AS Encargado1Parentesco,
            MAX(CASE WHEN rn = 1 THEN Correo END) AS Encargado1Correo,
            MAX(CASE WHEN rn = 1 THEN Telefono END) AS Encargado1Telefono,
            MAX(CASE WHEN rn = 1 THEN TelefonoSecundario END) AS Encargado1TelefonoSecundario,
            MAX(CASE WHEN rn = 1 THEN DireccionExacta END) AS Encargado1Direccion,
            MAX(CASE WHEN rn = 2 THEN NombreCompleto END) AS Encargado2Nombre,
            MAX(CASE WHEN rn = 2 THEN Identificacion END) AS Encargado2Identificacion,
            MAX(CASE WHEN rn = 2 THEN Parentesco END) AS Encargado2Parentesco,
            MAX(CASE WHEN rn = 2 THEN Correo END) AS Encargado2Correo,
            MAX(CASE WHEN rn = 2 THEN Telefono END) AS Encargado2Telefono,
            MAX(CASE WHEN rn = 2 THEN TelefonoSecundario END) AS Encargado2TelefonoSecundario,
            MAX(CASE WHEN rn = 2 THEN DireccionExacta END) AS Encargado2Direccion
          FROM EncargadosRanked
          WHERE rn IN (1, 2)
          GROUP BY EstudianteId
        )
        SELECT
          b.Identificacion AS [Cédula],
          b.TipoIdentificacion AS [Tipo Identificación],
          b.PrimerApellido AS [Primer Apellido],
          b.SegundoApellido AS [Segundo Apellido],
          b.Nombre AS [Nombre],
          LTRIM(RTRIM(CONCAT(
            ISNULL(b.PrimerApellido, N''),
            CASE WHEN NULLIF(LTRIM(RTRIM(b.SegundoApellido)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(b.SegundoApellido)) ELSE N'' END,
            CASE WHEN NULLIF(LTRIM(RTRIM(b.Nombre)), N'') IS NOT NULL THEN N' ' + LTRIM(RTRIM(b.Nombre)) ELSE N'' END
          ))) AS [Nombre Completo],
          CONVERT(varchar(10), b.FechaNacimiento, 103) AS [Fecha Nacimiento],
          b.Sexo AS [Sexo],
          b.Correo AS [Correo],
          b.Telefono AS [Teléfono],
          b.Nacionalidad AS [Nacionalidad],
          b.CodigoCarnet AS [Código Carnet],
          ISNULL(te.Descripcion, N'') AS [Tipo Estudiante],
          ISNULL(rt.Descripcion, N'') AS [Ruta Transporte],
          COALESCE(NULLIF(LTRIM(RTRIM(rt.Descripcion)), N''), NULLIF(LTRIM(RTRIM(b.RutaTransporteHabitual)), N''), N'') AS [Ruta Transporte Habitual],
          b.GradoNumero AS [Grado],
          b.GrupoNombre AS [Sección],
          CASE WHEN ISNULL(b.Repitente, 0) = 1 THEN N'Sí' ELSE N'No' END AS [Repitente],
          CASE WHEN ISNULL(b.Refugiado, 0) = 1 THEN N'Sí' ELSE N'No' END AS [Refugiado],
          CASE WHEN ISNULL(b.AutorizaWhatsAppEncargado, 0) = 1 THEN N'Sí' ELSE N'No' END AS [Autoriza WhatsApp Encargado],
          CASE WHEN ISNULL(b.TieneAdecuacion, 0) = 1 THEN N'Sí' ELSE N'No' END AS [Tiene Adecuación],
          b.Adecuacion AS [Tipo de Adecuación],
          b.NivelFuncionamiento AS [Nivel de Funcionamiento],
          b.Discapacidad AS [Discapacidad],
          b.TipoDiscapacidad AS [Tipo Discapacidad],
          b.Enfermedad AS [Enfermedad],
          b.ObservacionMedica AS [Observación Médica],
          b.Observaciones AS [Observaciones],
          b.EstadoMatricula AS [Estado Matrícula],
          ISNULL(a.Nombre, N'') AS [Curso Lectivo],
          ep.Encargado1Nombre AS [Encargado 1],
          ep.Encargado1Identificacion AS [Cédula Encargado 1],
          ep.Encargado1Parentesco AS [Parentesco 1],
          ep.Encargado1Correo AS [Correo Encargado 1],
          ep.Encargado1Telefono AS [Teléfono Encargado 1],
          ep.Encargado1TelefonoSecundario AS [Teléfono Secundario Encargado 1],
          ep.Encargado1Direccion AS [Dirección Encargado 1],
          ep.Encargado2Nombre AS [Encargado 2],
          ep.Encargado2Identificacion AS [Cédula Encargado 2],
          ep.Encargado2Parentesco AS [Parentesco 2],
          ep.Encargado2Correo AS [Correo Encargado 2],
          ep.Encargado2Telefono AS [Teléfono Encargado 2],
          ep.Encargado2TelefonoSecundario AS [Teléfono Secundario Encargado 2],
          ep.Encargado2Direccion AS [Dirección Encargado 2],
          b.MatriculaId AS [Matrícula ID],
          b.EstudianteId AS [Estudiante ID],
          b.Suspendido,
          b.MotivoSuspension,
          b.FechaInicioSuspension,
          b.FechaFinSuspension,
          b.ObservacionSuspension
        FROM BaseEstudiantes b
        LEFT JOIN dbo.TipoEstudiante te
          ON te.TipoEstudianteId = b.TipoEstudianteId
        LEFT JOIN dbo.RutaTransporte rt
          ON rt.RutaTransporteId = b.RutaTransporteId
        LEFT JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = b.AnioLectivoId
        LEFT JOIN EncargadosPivot ep
          ON ep.EstudianteId = b.EstudianteId
        ORDER BY
          b.PrimerApellido,
          b.SegundoApellido,
          b.Nombre,
          b.GradoNumero,
          TRY_CONVERT(int, SUBSTRING(b.GrupoNombre, CHARINDEX('-', b.GrupoNombre + '-') + 1, 20)),
          b.GrupoNombre,
          b.EstudianteId
        OPTION (RECOMPILE)
      `));
      return ok(res, result.recordset);
    } catch (error: any) {
      console.error("Error generando reporte de estudiantes:", error);
      const isTimeout = String(error?.code || error?.number || "").toUpperCase() === "ETIMEOUT";
      return res.status(isTimeout ? 504 : 500).json({
        ok: false,
        message: isTimeout
          ? "La consulta del reporte de estudiantes tardó demasiado. Probá con un filtro más específico o intentá de nuevo."
          : "No se pudo generar el reporte de estudiantes"
      });
    }
  }

  const filtrosBase = `
    (@grupoId IS NULL OR base.GrupoId = @grupoId)
    AND (@estudianteId IS NULL OR base.EstudianteId = @estudianteId)
  `;

  if (tipo === "ASISTENCIA") {
    if (!["ALUMNO", "SECCION", "PROFESOR"].includes(vistaPor)) {
      return badRequest(res, "Vista de asistencia inválida");
    }
    if (vistaPor === "ALUMNO" && !estudianteId) {
      return badRequest(res, "Debés seleccionar un alumno para este reporte");
    }
    if (vistaPor === "SECCION" && !grupoId) {
      return badRequest(res, "Debés seleccionar una sección para este reporte");
    }
    if (vistaPor === "PROFESOR" && !(profesorId || (!isAdminReportUser(req) && getUserId(req)))) {
      return badRequest(res, "Debés seleccionar un profesor para este reporte");
    }

    try {
      const result = await buildReporteAsistenciaGeneral({
        req,
        pool,
        institucionId,
        grupoId,
        estudianteId,
        profesorId,
        desde,
        hasta,
        vistaPor: vistaPor as "ALUMNO" | "SECCION" | "PROFESOR"
      });
      return ok(res, result);
    } catch (error: any) {
      console.error("Error generando reporte general de asistencia:", error);
      const isTimeout = String(error?.code || error?.number || "").toUpperCase() === "ETIMEOUT";
      return res.status(isTimeout ? 504 : 500).json({
        ok: false,
        message: isTimeout
          ? "La consulta del reporte de asistencia tardó demasiado. Probá con un filtro más específico o intentá de nuevo."
          : "No se pudo generar el reporte de asistencia"
      });
    }
  }

  if (tipo === "MENSAJES") {
    const result = await request.query(`
      SELECT
        reb.ReporteEnvioBitacoraId,
        reb.Modulo,
        reb.Fecha,
        reb.CorreoEnviado,
        reb.WaEnviado,
        reb.UltimoEnvioAt,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido
      FROM dbo.ReporteEnvioBitacora reb
      LEFT JOIN dbo.Grupo g ON g.GrupoId = reb.GrupoId
      LEFT JOIN dbo.Estudiante e ON e.EstudianteId = reb.EstudianteId
      WHERE (
          g.InstitucionId = @institucionId
          OR e.InstitucionId = @institucionId
        )
        AND (@grupoId IS NULL OR reb.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR reb.EstudianteId = @estudianteId)
        AND (@desde IS NULL OR reb.Fecha >= @desde)
        AND (@hasta IS NULL OR reb.Fecha <= @hasta)
      ORDER BY reb.Fecha DESC, reb.ReporteEnvioBitacoraId DESC
    `);
    return ok(res, result.recordset);
  }

  if (tipo === "BOLETAS") {
    await ensureBoletaConductaEnvioReportColumns(pool);

    if (!["ALUMNO", "SECCION", "PROFESOR"].includes(vistaPor)) {
      return badRequest(res, "Vista de boletas inválida");
    }
    if (vistaPor === "ALUMNO" && !estudianteId) {
      return badRequest(res, "Debés seleccionar un alumno para este reporte");
    }
    if (vistaPor === "SECCION" && !grupoId) {
      return badRequest(res, "Debés seleccionar una sección para este reporte");
    }
    if (vistaPor === "PROFESOR" && !(profesorId || (!isAdminReportUser(req) && getUserId(req)))) {
      return badRequest(res, "Debés seleccionar un profesor para este reporte");
    }

    const profesorFiltroId = isAdminReportUser(req) ? profesorId : (getUserId(req) || null);
    const boletasRequest = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoId", sql.Int, grupoId)
      .input("estudianteId", sql.Int, estudianteId)
      .input("profesorFiltroId", sql.Int, profesorFiltroId)
      .input("desde", sql.Date, desde)
      .input("hasta", sql.Date, hasta);

    const result = await timedQuery(`reportes.boletas.${vistaPor.toLowerCase()}`, () => boletasRequest.query(`
      SELECT
        b.BoletaConductaId,
        b.Consecutivo,
        b.CodigoBoleta,
        b.Fecha,
        CONVERT(varchar(10), b.Fecha, 103) AS FechaTexto,
        b.Seccion,
        g.Nombre AS GrupoNombre,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        e.Adecuacion,
        ISNULL(envio.CorreoEnviado, 0) AS CorreoEnviado,
        ISNULL(envio.WhatsAppEnviado, 0) AS WhatsAppEnviado
      FROM dbo.BoletaConducta b
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
      LEFT JOIN dbo.Grupo g
        ON g.GrupoId = b.GrupoId
      OUTER APPLY (
        SELECT TOP 1
          CorreoEnviado = CASE
            WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'CorreoEnviado') IS NOT NULL THEN ISNULL(be.CorreoEnviado, 0)
            WHEN ISNULL(be.Enviado, 0) = 1 THEN 1
            ELSE 0
          END,
          WhatsAppEnviado = CASE
            WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'WhatsAppEnviado') IS NOT NULL THEN ISNULL(be.WhatsAppEnviado, 0)
            ELSE 0
          END
        FROM dbo.BoletaConductaEnvio be
        WHERE be.BoletaConductaId = b.BoletaConductaId
        ORDER BY be.CreatedAt DESC, be.BoletaConductaEnvioId DESC
      ) envio
      WHERE b.InstitucionId = @institucionId
        AND (@desde IS NULL OR b.Fecha >= @desde)
        AND (@hasta IS NULL OR b.Fecha <= @hasta)
        AND (@estudianteId IS NULL OR b.EstudianteId = @estudianteId)
        AND (@grupoId IS NULL OR b.GrupoId = @grupoId)
        AND (
          @profesorFiltroId IS NULL
          OR b.UsuarioReportaId = @profesorFiltroId
        )
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre, b.Fecha DESC, b.Consecutivo DESC, b.BoletaConductaId DESC
    `));

    const rows = result.recordset.map((item: any) => ({
      boletaConductaId: Number(item.BoletaConductaId || 0),
      numeroBoleta: String(item.CodigoBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(3, "0"),
      nombre: [item.PrimerApellido, item.SegundoApellido, item.Nombre].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      cedula: String(item.Identificacion || ""),
      seccion: String(item.Seccion || item.GrupoNombre || ""),
      adecuacion: String(item.Adecuacion || ""),
      fecha: String(item.FechaTexto || ""),
      envioCorreo: Number(item.CorreoEnviado || 0) ? "Si" : "No",
      envioWhatsApp: Number(item.WhatsAppEnviado || 0) ? "Si" : "No"
    }));
    return ok(res, { vistaPor, profesorId: profesorFiltroId, rows });
  }

  if (tipo === "BITACORA") {
    const result = await request.query(`
      SELECT
        b.BitacoraGrupoId,
        b.FechaRegistro,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        m.MateriaId,
        m.Nombre AS MateriaNombre,
        b.TemasDesarrollados,
        b.Observaciones,
        b.HechosRelevantes,
        ISNULL(CONCAT(u.Nombre, ' ', u.PrimerApellido, ' ', ISNULL(u.SegundoApellido, '')), '') AS Usuario
      FROM dbo.BitacoraGrupo b
      INNER JOIN dbo.Grupo g ON g.GrupoId = b.GrupoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = b.MateriaId
      LEFT JOIN dbo.Usuario u ON u.UsuarioId = b.UsuarioId
      WHERE b.InstitucionId = @institucionId
        AND (@grupoId IS NULL OR b.GrupoId = @grupoId)
        AND (@desde IS NULL OR b.FechaRegistro >= @desde)
        AND (@hasta IS NULL OR b.FechaRegistro <= @hasta)
      ORDER BY b.FechaRegistro DESC, b.BitacoraGrupoId DESC
    `);
    return ok(res, result.recordset);
  }

  if (tipo === "NOTAS") {
    const result = await request.query(`
      SELECT
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        COUNT(en.EvaluacionNotaId) AS Registros,
        AVG(CAST(en.Nota AS DECIMAL(10,2))) AS Promedio
      FROM dbo.EvaluacionNota en
      INNER JOIN dbo.EvaluacionActividad ea ON ea.EvaluacionActividadId = en.EvaluacionActividadId
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = en.EstudianteId
      INNER JOIN dbo.Grupo g ON g.GrupoId = en.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND (@grupoId IS NULL OR en.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR en.EstudianteId = @estudianteId)
        AND (@desde IS NULL OR ea.Fecha >= @desde)
        AND (@hasta IS NULL OR ea.Fecha <= @hasta)
      GROUP BY g.GrupoId, g.Nombre, e.EstudianteId, e.Identificacion, e.Nombre, e.PrimerApellido, e.SegundoApellido
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre, g.Nombre, e.EstudianteId
    `);
    return ok(res, result.recordset);
  }

  if (tipo === "AUDITORIA_CAMBIOS") {
    const result = await request.query(`
      SELECT
        CAST('AJUSTE_RUBRO' AS NVARCHAR(40)) AS TipoCambio,
        cam.CreatedAt AS FechaCambio,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        m.MateriaId,
        m.Nombre AS MateriaNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        d.Nombre AS RubroNombre,
        CAST(cam.PorcentajeAnterior AS DECIMAL(10,2)) AS ValorAnterior,
        CAST(cam.PorcentajeNuevo AS DECIMAL(10,2)) AS ValorNuevo,
        cam.Justificacion,
        ISNULL(CONCAT(u.Nombre, ' ', u.PrimerApellido, ' ', ISNULL(u.SegundoApellido, '')), '') AS Usuario
      FROM dbo.Eval360_ComponenteAjusteManualAuditoria cam
      INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = cam.EstructuraGrupoId
      INNER JOIN dbo.Eval360_EstructuraGrupoDetalle d ON d.EstructuraGrupoDetalleId = cam.EstructuraGrupoDetalleId
      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = cam.EstudianteId
      LEFT JOIN dbo.Usuario u ON u.UsuarioId = cam.UsuarioId
      WHERE eg.InstitucionId = @institucionId
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
        AND (@desde IS NULL OR CONVERT(date, cam.CreatedAt) >= @desde)
        AND (@hasta IS NULL OR CONVERT(date, cam.CreatedAt) <= @hasta)

      UNION ALL

      SELECT
        CAST('EDICION_ACTIVIDAD' AS NVARCHAR(40)) AS TipoCambio,
        nea.CreatedAt AS FechaCambio,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        m.MateriaId,
        m.Nombre AS MateriaNombre,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        a.Nombre AS RubroNombre,
        CAST(nea.PorcentajeAnterior AS DECIMAL(10,2)) AS ValorAnterior,
        CAST(nea.PorcentajeNuevo AS DECIMAL(10,2)) AS ValorNuevo,
        nea.Justificacion,
        ISNULL(CONCAT(u.Nombre, ' ', u.PrimerApellido, ' ', ISNULL(u.SegundoApellido, '')), '') AS Usuario
      FROM dbo.Eval360_NotaEdicionAuditoria nea
      INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = nea.ActividadId
      INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = a.EstructuraGrupoId
      INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = nea.EstudianteId
      LEFT JOIN dbo.Usuario u ON u.UsuarioId = nea.UsuarioId
      WHERE eg.InstitucionId = @institucionId
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
        AND (@desde IS NULL OR CONVERT(date, nea.CreatedAt) >= @desde)
        AND (@hasta IS NULL OR CONVERT(date, nea.CreatedAt) <= @hasta)

      ORDER BY FechaCambio DESC
    `);
    return ok(res, result.recordset);
  }

  const tipoLike = tipo === "COTIDIANO"
    ? "%COTIDIAN%"
    : tipo === "TAREAS"
      ? "%TAREA%"
      : "%EXAM%";

  request.input("tipoLike", sql.NVarChar(40), tipoLike);
  const result = await request.query(`
    SELECT
      g.GrupoId,
      g.Nombre AS GrupoNombre,
      e.EstudianteId,
      e.Identificacion,
      e.Nombre,
      e.PrimerApellido,
      e.SegundoApellido,
      COUNT(na.NotaActividadId) AS Registros,
      AVG(CAST(ISNULL(na.NotaObtenida, na.PorcentajeObtenido) AS DECIMAL(10,2))) AS Promedio
    FROM dbo.Eval360_NotaActividad na
    INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = na.ActividadId
    INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = a.EstructuraGrupoId
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = na.EstudianteId
    INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
    WHERE e.InstitucionId = @institucionId
      AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
      AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
      AND (@desde IS NULL OR a.Fecha >= @desde)
      AND (@hasta IS NULL OR a.Fecha <= @hasta)
      AND UPPER(ISNULL(a.Fuente, ISNULL(a.Nombre, ''))) LIKE @tipoLike
    GROUP BY g.GrupoId, g.Nombre, e.EstudianteId, e.Identificacion, e.Nombre, e.PrimerApellido, e.SegundoApellido
    ORDER BY g.Nombre, e.PrimerApellido, e.SegundoApellido, e.Nombre
  `);
  return ok(res, result.recordset);
});

router.post("/certificaciones/constancia-estudio/generar", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  if (!institucionId) return badRequest(res, "No se encontró la institución del usuario");

  const estudianteId = Number(req.body?.estudianteId || 0);
  const grupoId = req.body?.grupoId ? Number(req.body.grupoId) : null;
  const tipoEducacion = String(req.body?.tipoEducacion || "").trim().toUpperCase();
  const motivoTramite = String(req.body?.motivoTramite || "").trim().toUpperCase();
  const otroColegioDestino = String(req.body?.otroColegioDestino || "").trim();
  const fechaEmision = parseDateInputAsLocalDate(
    req.body?.fechaEmision || getCostaRicaIsoDate()
  );
  const userId = Number(req.auth?.userId || req.auth?.usuarioId || req.auth?.id || 0);

  if (!estudianteId) return badRequest(res, "Seleccioná el estudiante");
  if (!["GENERAL BASICA", "DIVERSIFICADA", "ESPECIAL"].includes(tipoEducacion)) {
    return badRequest(res, "Tipo de educación inválido");
  }
  if (!["IMAS", "CCSS", "PODER_JUDICIAL", "PERSONAL", "TRASLADO"].includes(motivoTramite)) {
    return badRequest(res, "Motivo inválido");
  }

  if (motivoTramite === "TRASLADO" && !otroColegioDestino) {
    return badRequest(res, "Debés indicar el nombre del otro colegio");
  }

  await ensureCertificacionEstudioTables(pool);
  await ensureUsuarioSexoColumn(pool);
  await ensureInstitucionPlColumns(pool);

  const institucionResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1
        InstitucionId, Nombre, NombreComercial, NombreOficialBoleta,
        CorreoPrincipal, TelefonoPrincipal, Direccion, DireccionExacta,
        LogoUrl, MembreteUrl, RegionalEducativa, CircuitoEducativo, CodigoPresupuestario,
        CodigoPresupuestarioPL, DescripcionCodigoPresupuestarioPL
      FROM dbo.Institucion
      WHERE InstitucionId = @institucionId
    `);
  const institucion = institucionResult.recordset[0];
  if (!institucion) return badRequest(res, "No se encontró la institución");

  const firmanteResult = await pool.request()
    .input("usuarioId", sql.Int, userId || null)
    .query(`
      SELECT TOP 1
        u.UsuarioId,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.Sexo,
        u.Titulo,
        NULLIF(LTRIM(RTRIM(ISNULL(u.Cargo, ''))), '') AS Cargo,
        r.Nombre AS RolNombre
      FROM dbo.Usuario u
      LEFT JOIN dbo.UsuarioRol ur ON ur.UsuarioId = u.UsuarioId AND ISNULL(ur.Activo, 1) = 1
      LEFT JOIN dbo.Rol r ON r.RolId = ur.RolId
      WHERE u.UsuarioId = @usuarioId
    `);
  const firmante = firmanteResult.recordset[0] || {};
  const nombreFirmante = [firmante.Nombre, firmante.PrimerApellido, firmante.SegundoApellido].filter(Boolean).join(" ").trim();
  const suscrito = buildNombreConTitulo(firmante.Titulo, nombreFirmante);
  const sexoFirmante = String(firmante.Sexo || "").trim().toUpperCase();
  const textoSuscrito = sexoFirmante === "FEMENINO"
    ? "La suscrita"
    : sexoFirmante === "MASCULINO"
      ? "El suscrito"
      : "La persona suscrita";
  const puesto = String(firmante.Cargo || "").trim() || (
    String(firmante.RolNombre || "").trim() === "ADMINISTRATIVO"
      ? "Administrativo"
      : String(firmante.RolNombre || "").trim() === "PROFESOR"
        ? "Profesor"
        : "Funcionari@"
  );
  if (!suscrito) return badRequest(res, "No se pudo resolver la persona firmante desde el usuario logueado");

  const estudianteResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("grupoId", sql.Int, grupoId)
    .query(`
      SELECT TOP 1
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        te.Descripcion AS TipoEstudianteDescripcion,
        enc.NombreEncargadoPrincipal,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico,
        a.Nombre AS AnioLectivoNombre,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(60), g.Nivel))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(60), g.NivelAcademico))), ''),
          g.Nombre
        ) AS GradoNombre
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      LEFT JOIN dbo.AnioLectivo a ON a.AnioLectivoId = m.AnioLectivoId
      LEFT JOIN dbo.TipoEstudiante te ON te.TipoEstudianteId = e.TipoEstudianteId
      OUTER APPLY (
        SELECT TOP 1
          LTRIM(RTRIM(CONCAT(
            ISNULL(NULLIF(LTRIM(RTRIM(enc.Nombre)), ''), ''),
            CASE WHEN NULLIF(LTRIM(RTRIM(enc.PrimerApellido)), '') IS NOT NULL THEN ' ' + LTRIM(RTRIM(enc.PrimerApellido)) ELSE '' END,
            CASE WHEN NULLIF(LTRIM(RTRIM(enc.SegundoApellido)), '') IS NOT NULL THEN ' ' + LTRIM(RTRIM(enc.SegundoApellido)) ELSE '' END
          ))) AS NombreEncargadoPrincipal
        FROM dbo.EstudianteEncargado ee
        INNER JOIN dbo.Encargado enc ON enc.EncargadoId = ee.EncargadoId
        WHERE ee.EstudianteId = e.EstudianteId
          AND ISNULL(ee.Activo, 1) = 1
        ORDER BY
          CASE WHEN ISNULL(ee.EsPrincipal, 0) = 1 THEN 0 ELSE 1 END,
          ee.EstudianteEncargadoId DESC
      ) enc
      WHERE e.InstitucionId = @institucionId
        AND e.EstudianteId = @estudianteId
        AND m.Estado = 'ACTIVA'
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
      ORDER BY m.UpdatedAt DESC, m.MatriculaId DESC
    `);
  const estudiante = estudianteResult.recordset[0];
  if (!estudiante) return badRequest(res, "No se encontró matrícula activa para este estudiante");

  const estudianteNombre = [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" ");
  const cursoLectivo = String(estudiante.AnioLectivoNombre || "").match(/\d{4}/)?.[0] || String(fechaEmision.getFullYear());
  const lugarEmision = String(institucion.Direccion || "").trim() || String(institucion.DireccionExacta || "").split(",")[0].trim() || "Costa Rica";
  const esPlanNacional = isPlanNacionalStudent(estudiante.TipoEstudianteDescripcion);
  const nombreEncargado = normalizeWhitespace(estudiante.NombreEncargadoPrincipal) || "sin nombre registrado";
  const programaPlanNacional = joinNonEmpty([
    normalizeWhitespace(
      institucion.DescripcionCodigoPresupuestarioPL ||
      "III Ciclo y IV Ciclo Diversificado Vocacional (Plan Nacional)"
    ).replace(/^código presupuestario\s+/i, "")
  ], ", ");
  const gradoPlanNacional = getNivelAcademicoLiteral(estudiante.NivelAcademico)
    || normalizeWhitespace(estudiante.GrupoNivel)
    || normalizeWhitespace(estudiante.GradoNombre)
    || normalizeWhitespace(estudiante.GrupoNombre);
  const gradoConstancia = esPlanNacional
    ? gradoPlanNacional
    : String(estudiante.GrupoNombre || estudiante.GradoNombre || "");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const configReq = new sql.Request(transaction);
    configReq.input("institucionId", sql.Int, institucionId);
    configReq.input("cursoLectivo", sql.NVarChar(10), cursoLectivo);
    const config = await configReq.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.CertificacionEstudioConfig WHERE InstitucionId=@institucionId)
      BEGIN
        INSERT INTO dbo.CertificacionEstudioConfig (InstitucionId, SiguienteNumero, Prefijo, AnioLectivo, UpdatedAt)
        VALUES (@institucionId, 1, N'CERTIFICACION', @cursoLectivo, SYSDATETIME());
      END;
      SELECT TOP 1
        SiguienteNumero,
        ISNULL(NULLIF(LTRIM(RTRIM(Prefijo)), N''), N'CERTIFICACION') AS Prefijo,
        ISNULL(NULLIF(LTRIM(RTRIM(AnioLectivo)), N''), @cursoLectivo) AS AnioLectivo
      FROM dbo.CertificacionEstudioConfig
      WHERE InstitucionId=@institucionId;
    `);
    const next = Number(config.recordset[0]?.SiguienteNumero || 1);
    const prefijo = String(config.recordset[0]?.Prefijo || "CERTIFICACION").trim() || "CERTIFICACION";
    const anioLectivoConfig = String(config.recordset[0]?.AnioLectivo || cursoLectivo).trim() || cursoLectivo;
    const codigoConstancia = buildConsecutivoCodigo(prefijo, next, anioLectivoConfig);
    const htmlFinal = buildConstanciaHtmlV2({
      institucion,
      codigoConstancia,
      suscrito,
      textoSuscrito,
      puesto,
      codigoPresupuestario: esPlanNacional
        ? String(institucion.CodigoPresupuestarioPL || "")
        : String(institucion.CodigoPresupuestario || ""),
      estudianteNombre,
      identificacion: String(estudiante.Identificacion || ""),
      grado: gradoConstancia,
      tipoEducacion: normalizeEducationLabel(tipoEducacion),
      motivoTramite,
      cursoLectivo,
      lugarEmision,
      nombreEncargado,
      esPlanNacional,
      programaPlanNacional,
      otroColegioDestino,
      fechaEmision
    });

    await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.CertificacionEstudioConfig
        SET SiguienteNumero = SiguienteNumero + 1,
            UpdatedAt = SYSDATETIME()
        WHERE InstitucionId = @institucionId;
      `);

    const insertResult = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("consecutivo", sql.Int, next)
      .input("codigoConstancia", sql.NVarChar(120), codigoConstancia)
      .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
      .input("grupoId", sql.Int, Number(estudiante.GrupoId || 0) || null)
      .input("estudianteNombre", sql.NVarChar(220), estudianteNombre)
      .input("identificacion", sql.NVarChar(60), String(estudiante.Identificacion || ""))
      .input("grupoNombre", sql.NVarChar(120), String(estudiante.GrupoNombre || estudiante.GradoNombre || ""))
      .input("suscrito", sql.NVarChar(200), suscrito)
      .input("puesto", sql.NVarChar(200), puesto)
      .input("codigoPresupuestario", sql.NVarChar(50), String(institucion.CodigoPresupuestario || ""))
      .input("tipoEducacion", sql.NVarChar(80), tipoEducacion)
      .input("motivoTramite", sql.NVarChar(120), motivoTramite)
      .input("cursoLectivo", sql.NVarChar(20), cursoLectivo)
      .input("otroColegioDestino", sql.NVarChar(250), otroColegioDestino || null)
      .input("lugarEmision", sql.NVarChar(250), lugarEmision)
      .input("htmlSnapshot", sql.NVarChar(sql.MAX), htmlFinal)
      .input("fechaEmision", sql.Date, fechaEmision)
      .input("createdByUsuarioId", sql.Int, Number((req.auth as any)?.usuarioId || 0) || null)
      .query(`
        INSERT INTO dbo.CertificacionEstudioRegistro
          (InstitucionId, Consecutivo, CodigoConstancia, EstudianteId, GrupoId, EstudianteNombre, Identificacion, GrupoNombre, Suscrito, Puesto, CodigoPresupuestario, TipoEducacion, MotivoTramite, CursoLectivo, OtroColegioDestino, LugarEmision, HtmlSnapshot, FechaEmision, CreatedByUsuarioId)
        OUTPUT INSERTED.CertificacionEstudioId AS CertificacionEstudioId
        VALUES
          (@institucionId, @consecutivo, @codigoConstancia, @estudianteId, @grupoId, @estudianteNombre, @identificacion, @grupoNombre, @suscrito, @puesto, @codigoPresupuestario, @tipoEducacion, @motivoTramite, @cursoLectivo, @otroColegioDestino, @lugarEmision, @htmlSnapshot, @fechaEmision, @createdByUsuarioId);
      `);
    const certificacionEstudioId = Number(insertResult.recordset?.[0]?.CertificacionEstudioId || 0);

    await transaction.commit();

    return ok(res, {
      codigoConstancia,
      consecutivo: next,
      certificacionEstudioId,
      html: htmlFinal,
      suscrito,
      puesto,
      estudiante: {
        estudianteId: estudiante.EstudianteId,
        nombre: estudianteNombre,
        identificacion: estudiante.Identificacion,
        grupoNombre: estudiante.GrupoNombre
      }
    }, "Constancia generada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  }
});

router.get("/certificaciones/constancia-estudio/registros", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const motivoTramite = String(req.query.motivoTramite || "").trim().toUpperCase() || null;
  const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
  const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
  const q = String(req.query.q || "").trim().toLowerCase();

  await ensureCertificacionEstudioTables(pool);

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("motivoTramite", sql.NVarChar(120), motivoTramite)
    .input("grupoId", sql.Int, grupoId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("q", sql.NVarChar(200), q || null)
    .query(`
      SELECT
        cer.CertificacionEstudioId,
        cer.CodigoConstancia,
        cer.Consecutivo,
        cer.EstudianteId,
        cer.GrupoId,
        cer.EstudianteNombre,
        cer.Identificacion,
        cer.GrupoNombre,
        cer.TipoEducacion,
        cer.MotivoTramite,
        cer.CursoLectivo,
        cer.OtroColegioDestino,
        e.Adecuacion AS adecuacion,
        CONVERT(varchar(10), cer.FechaEmision, 103) AS FechaEmisionTexto
      FROM dbo.CertificacionEstudioRegistro cer
      LEFT JOIN dbo.Estudiante e
        ON e.EstudianteId = cer.EstudianteId
       AND e.InstitucionId = cer.InstitucionId
      WHERE cer.InstitucionId = @institucionId
        AND (@motivoTramite IS NULL OR cer.MotivoTramite = @motivoTramite)
        AND (@grupoId IS NULL OR cer.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR cer.EstudianteId = @estudianteId)
        AND (
          @q IS NULL
          OR LOWER(ISNULL(cer.EstudianteNombre, '')) LIKE '%' + @q + '%'
          OR LOWER(ISNULL(cer.Identificacion, '')) LIKE '%' + @q + '%'
        )
      ORDER BY
        ISNULL(e.PrimerApellido, N''),
        ISNULL(e.SegundoApellido, N''),
        ISNULL(e.Nombre, cer.EstudianteNombre),
        cer.CertificacionEstudioId ASC
    `);

  return ok(res, result.recordset);
});

router.get("/certificaciones/constancia-estudio/:certificacionId", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const certificacionId = Number(req.params.certificacionId || 0);
  if (!certificacionId) return badRequest(res, "Certificación inválida");

  await ensureCertificacionEstudioTables(pool);

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("certificacionId", sql.Int, certificacionId)
    .query(`
      SELECT TOP 1
        cer.*,
        i.Nombre,
        i.NombreComercial,
        i.NombreOficialBoleta,
        i.CorreoPrincipal,
        i.TelefonoPrincipal,
        i.Direccion,
        i.DireccionExacta,
        i.LogoUrl,
        i.MembreteUrl,
        i.RegionalEducativa,
        i.CircuitoEducativo
      FROM dbo.CertificacionEstudioRegistro cer
      INNER JOIN dbo.Institucion i ON i.InstitucionId = cer.InstitucionId
      WHERE cer.InstitucionId = @institucionId
        AND cer.CertificacionEstudioId = @certificacionId
    `);

  const row = result.recordset[0];
  if (!row) return res.status(404).json({ ok: false, message: "No se encontró la certificación" });

  const html = String(row.HtmlSnapshot || "").trim() || buildConstanciaHtml({
    institucion: row,
    codigoConstancia: String(row.CodigoConstancia || ""),
    suscrito: String(row.Suscrito || ""),
    textoSuscrito: "La persona suscrita",
    puesto: String(row.Puesto || ""),
    codigoPresupuestario: String(row.CodigoPresupuestario || ""),
    estudianteNombre: String(row.EstudianteNombre || ""),
    identificacion: String(row.Identificacion || ""),
    grado: String(row.GrupoNombre || ""),
    tipoEducacion: String(row.TipoEducacion || ""),
    motivoTramite: String(row.MotivoTramite || ""),
    cursoLectivo: String(row.CursoLectivo || ""),
    lugarEmision: String(row.LugarEmision || row.Direccion || ""),
    otroColegioDestino: String(row.OtroColegioDestino || ""),
    fechaEmision: parseDateInputAsLocalDate(row.FechaEmision, new Date())
  });

  return ok(res, {
    certificacionEstudioId: Number(row.CertificacionEstudioId || 0),
    codigoConstancia: String(row.CodigoConstancia || ""),
    html
  });
});

router.get("/certificaciones/constancia-estudio/:certificacionId/word", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const certificacionId = Number(req.params.certificacionId || 0);
  if (!certificacionId) return badRequest(res, "Certificación inválida");

  await ensureCertificacionEstudioTables(pool);

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("certificacionId", sql.Int, certificacionId)
    .query(`
      SELECT TOP 1
        cer.*,
        i.Nombre,
        i.NombreComercial,
        i.NombreOficialBoleta,
        i.CorreoPrincipal,
        i.TelefonoPrincipal,
        i.Direccion,
        i.DireccionExacta,
        i.LogoUrl,
        i.MembreteUrl,
        i.RegionalEducativa,
        i.CircuitoEducativo,
        i.CodigoPresupuestario AS CodigoPresupuestarioInstitucion,
        i.CodigoPresupuestarioPL,
        i.DescripcionCodigoPresupuestarioPL
      FROM dbo.CertificacionEstudioRegistro cer
      INNER JOIN dbo.Institucion i ON i.InstitucionId = cer.InstitucionId
      WHERE cer.InstitucionId = @institucionId
        AND cer.CertificacionEstudioId = @certificacionId
    `);

  const row = result.recordset[0];
  if (!row) {
    return res.status(404).json({ ok: false, message: "No se encontró la certificación seleccionada" });
  }

  const html = "docx";
  const htmlSnapshot = String(row.HtmlSnapshot || "");
  const snapshotInfo = extractConstanciaSnapshotInfo(htmlSnapshot);
  const esPlanNacional = /plan nacional/i.test(htmlSnapshot);
  const codigoPresupuestarioDocx = esPlanNacional
    ? String(row.CodigoPresupuestarioPL || row.CodigoPresupuestario || "")
    : String(row.CodigoPresupuestario || row.CodigoPresupuestarioInstitucion || "");
  const buffer = await buildConstanciaDocx({
    institucion: row,
    codigoConstancia: String(row.CodigoConstancia || ""),
    suscrito: String(row.Suscrito || ""),
    textoSuscrito: snapshotInfo.textoSuscrito || "La persona suscrita",
    puesto: String(row.Puesto || ""),
    codigoPresupuestario: codigoPresupuestarioDocx,
    estudianteNombre: String(row.EstudianteNombre || ""),
    identificacion: String(row.Identificacion || ""),
    grado: String(row.GrupoNombre || ""),
    tipoEducacion: String(row.TipoEducacion || ""),
    motivoTramite: String(row.MotivoTramite || ""),
    cursoLectivo: String(row.CursoLectivo || ""),
    lugarEmision: String(row.LugarEmision || row.Direccion || ""),
    nombreEncargado: snapshotInfo.nombreEncargado || "sin nombre registrado",
    esPlanNacional,
    programaPlanNacional: String(row.DescripcionCodigoPresupuestarioPL || ""),
    otroColegioDestino: String(row.OtroColegioDestino || ""),
    fechaEmision: parseDateInputAsLocalDate(row.FechaEmision, new Date())
  });
  if (!html) {
    return res.status(404).json({ ok: false, message: "La certificación no tiene un documento disponible para Word" });
  }

  const fileName = `${String(row.CodigoConstancia || `constancia-${certificacionId}`)
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `constancia-${certificacionId}`}.docx`;

  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, Content-Length");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.send(buffer);
});

router.get("/admin/whatsapp/filtros", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ ok: false, message: "Solo SUPER_ADMIN puede consultar este reporte" });
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT InstitucionId, COALESCE(NULLIF(NombreComercial, N''), Nombre) AS Nombre
      FROM dbo.Institucion
      WHERE Activo = 1
      ORDER BY Nombre
    `);
    return ok(res, {
      instituciones: result.recordset,
      tipos: ["ASISTENCIA", "TAREA", "BOLETA", "EVALUACION", "GENERAL"]
    });
  } catch (error) {
    console.error("Error cargando filtros del reporte WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los filtros" });
  }
});

router.get("/admin/whatsapp", async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ ok: false, message: "Solo SUPER_ADMIN puede consultar este reporte" });
  try {
    const pool = await getPool();
    const fechaHasta = String(req.query.fechaHasta || new Date().toISOString().slice(0, 10));
    const fechaDesde = String(req.query.fechaDesde || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
    const institucionId = Number(req.query.institucionId || 0) || null;
    const tipo = String(req.query.tipo || "").trim().toUpperCase() || null;
    const addFilters = (request: any) => request
      .input("fechaDesde", sql.Date, fechaDesde)
      .input("fechaHasta", sql.Date, fechaHasta)
      .input("institucionId", sql.Int, institucionId)
      .input("tipo", sql.NVarChar(40), tipo);
    const filters = `
      w.CreatedAt >= @fechaDesde
      AND w.CreatedAt < DATEADD(day, 1, @fechaHasta)
      AND (@institucionId IS NULL OR w.InstitucionId = @institucionId)
      AND (@tipo IS NULL OR w.TipoMensaje = @tipo)
    `;
    const summaryResult = await addFilters(pool.request()).query(`
        SELECT
          COUNT_BIG(*) AS Total,
          SUM(CASE WHEN w.Estado IN (N'ACEPTADO', N'ENVIADO') THEN 1 ELSE 0 END) AS Enviados,
          SUM(CASE WHEN w.Estado = N'FALLIDO' THEN 1 ELSE 0 END) AS Fallidos,
          SUM(CASE WHEN w.Estado = N'PENDIENTE' THEN 1 ELSE 0 END) AS Pendientes,
          SUM(CASE WHEN w.Estado = N'OMITIDO' THEN 1 ELSE 0 END) AS Omitidos,
          SUM(CASE WHEN w.EsFallback = 1 THEN 1 ELSE 0 END) AS Fallback
        FROM dbo.WhatsAppEnvio w
        WHERE ${filters}
      `);
    const rowsResult = await addFilters(pool.request()).query(`
        SELECT TOP 1000
          w.WhatsAppEnvioId,
          w.CreatedAt,
          w.InstitucionId,
          COALESCE(NULLIF(i.NombreComercial, N''), i.Nombre) AS InstitucionNombre,
          w.TipoMensaje,
          w.Estado,
          w.TelefonoDestino,
          w.NumeroOrigenSnapshot,
          w.EsFallback,
          w.MotivoError,
          g.Nombre AS Seccion,
          LTRIM(RTRIM(CONCAT(ISNULL(p.Nombre, N''), N' ', ISNULL(p.PrimerApellido, N''), N' ', ISNULL(p.SegundoApellido, N'')))) AS Profesor
        FROM dbo.WhatsAppEnvio w
        LEFT JOIN dbo.Institucion i ON i.InstitucionId = w.InstitucionId
        LEFT JOIN dbo.Grupo g ON g.GrupoId = w.GrupoId
        LEFT JOIN dbo.Usuario p ON p.UsuarioId = w.ProfesorUsuarioId
        WHERE ${filters}
        ORDER BY w.CreatedAt DESC, w.WhatsAppEnvioId DESC
      `);
    return ok(res, {
      filtros: { fechaDesde, fechaHasta, institucionId, tipo },
      resumen: summaryResult.recordset[0] || {},
      rows: rowsResult.recordset
    });
  } catch (error) {
    console.error("Error consultando reporte WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar el reporte de WhatsApp" });
  }
});

router.get("/admin/consecutivos/filtros", async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, message: "Solo el super admin puede consultar estos filtros" });
  }

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT InstitucionId, Nombre
    FROM dbo.Institucion
    WHERE Activo = 1
    ORDER BY Nombre
  `);

  return ok(res, {
    instituciones: result.recordset || [],
    tipos: [
      { value: "BOLETAS_CONDUCTA", label: "Boletas de Conducta" },
      { value: "CERTIFICACIONES", label: "Certificaciones" }
    ]
  });
});

router.get("/admin/consecutivos", async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, message: "Solo el super admin puede consultar consecutivos" });
  }

  const institucionId = Number(req.query.institucionId || 0);
  const tipo = String(req.query.tipo || "").trim().toUpperCase();

  if (!institucionId) return badRequest(res, "Debés seleccionar un colegio");
  if (!["BOLETAS_CONDUCTA", "CERTIFICACIONES"].includes(tipo)) {
    return badRequest(res, "Debés seleccionar un tipo válido");
  }

  const pool = await getPool();

  if (tipo === "BOLETAS_CONDUCTA") {
    await ensureBoletaConductaEnvioReportColumns(pool);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          b.BoletaConductaId AS RegistroId,
          b.Consecutivo,
          b.CodigoBoleta,
          CONVERT(varchar(10), b.Fecha, 103) AS FechaTexto,
          [Tipo] = N'Boletas de Conducta',
          Alumno = LTRIM(RTRIM(CONCAT(ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N''), N' ', ISNULL(e.Nombre, N'')))),
          Cedula = ISNULL(e.Identificacion, N''),
          Seccion = ISNULL(NULLIF(b.Seccion, N''), ISNULL(g.Nombre, N'')),
          Codigo = ISNULL(NULLIF(b.CodigoBoleta, N''), RIGHT(N'000' + CONVERT(varchar(20), ISNULL(b.Consecutivo, 0)), 3)),
          Detalle = ISNULL(b.DetalleHechos, N''),
          adecuacion = e.Adecuacion,
          CorreoEnviado = CASE
            WHEN ISNULL(envio.CorreoEnviado, 0) = 1 THEN N'Sí'
            ELSE N'No'
          END,
          WhatsAppEnviado = CASE
            WHEN ISNULL(envio.WhatsAppEnviado, 0) = 1 THEN N'Sí'
            ELSE N'No'
          END
        FROM dbo.BoletaConducta b
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
        LEFT JOIN dbo.Grupo g ON g.GrupoId = b.GrupoId
        OUTER APPLY (
          SELECT TOP 1
            CorreoEnviado = CASE
              WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'CorreoEnviado') IS NOT NULL THEN ISNULL(be.CorreoEnviado, 0)
              WHEN ISNULL(be.Enviado, 0) = 1 THEN 1
              ELSE 0
            END,
            WhatsAppEnviado = CASE
              WHEN COL_LENGTH('dbo.BoletaConductaEnvio', 'WhatsAppEnviado') IS NOT NULL THEN ISNULL(be.WhatsAppEnviado, 0)
              ELSE 0
            END
          FROM dbo.BoletaConductaEnvio be
          WHERE be.BoletaConductaId = b.BoletaConductaId
          ORDER BY be.CreatedAt DESC, be.BoletaConductaEnvioId DESC
        ) envio
        WHERE b.InstitucionId = @institucionId
        ORDER BY b.Fecha DESC, b.Consecutivo DESC, b.BoletaConductaId DESC
      `);

    return ok(res, result.recordset || []);
  }

  await ensureCertificacionEstudioTables(pool);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT
        cer.CertificacionEstudioId AS RegistroId,
        cer.Consecutivo,
        CONVERT(varchar(10), cer.FechaEmision, 103) AS FechaTexto,
        [Tipo] = N'Certificaciones',
        Alumno = ISNULL(cer.EstudianteNombre, N''),
        Cedula = ISNULL(cer.Identificacion, N''),
        Seccion = ISNULL(cer.GrupoNombre, N''),
          Codigo = ISNULL(NULLIF(cer.CodigoConstancia, N''), N'CONST-' + RIGHT(N'000' + CONVERT(varchar(20), ISNULL(cer.Consecutivo, 0)), 3)),
        Detalle = ISNULL(cer.MotivoTramite, N''),
        adecuacion = e.Adecuacion,
        CorreoEnviado = N'-',
        WhatsAppEnviado = N'-'
      FROM dbo.CertificacionEstudioRegistro cer
      LEFT JOIN dbo.Estudiante e
        ON e.EstudianteId = cer.EstudianteId
       AND e.InstitucionId = cer.InstitucionId
      WHERE cer.InstitucionId = @institucionId
      ORDER BY cer.Consecutivo ASC, cer.CertificacionEstudioId ASC
    `);

  return ok(res, result.recordset || []);
});

router.delete("/admin/consecutivos/:tipo/:registroId", async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, message: "Solo el super admin puede eliminar consecutivos" });
  }

  const institucionId = Number(req.query.institucionId || 0);
  const tipo = String(req.params.tipo || "").trim().toUpperCase();
  const registroId = Number(req.params.registroId || 0);

  if (!institucionId) return badRequest(res, "Debés seleccionar un colegio");
  if (!registroId) return badRequest(res, "Registro inválido");
  if (!["BOLETAS_CONDUCTA", "CERTIFICACIONES"].includes(tipo)) {
    return badRequest(res, "Tipo inválido");
  }

  const pool = await getPool();

  if (tipo === "BOLETAS_CONDUCTA") {
    const exists = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("registroId", sql.Int, registroId)
      .query(`
        SELECT TOP 1 BoletaConductaId
        FROM dbo.BoletaConducta
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId = @registroId
      `);
    if (!exists.recordset[0]) {
      return res.status(404).json({ ok: false, message: "No se encontró la boleta de conducta seleccionada" });
    }

    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("registroId", sql.Int, registroId)
      .query(`
        DELETE FROM dbo.BoletaConductaEnvio
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId = @registroId;

        DELETE FROM dbo.BoletaConducta
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId = @registroId;
      `);

    return ok(res, { registroId }, "La boleta de conducta fue eliminada permanentemente");
  }

  await ensureCertificacionEstudioTables(pool);
  const exists = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("registroId", sql.Int, registroId)
    .query(`
      SELECT TOP 1 CertificacionEstudioId
      FROM dbo.CertificacionEstudioRegistro
      WHERE InstitucionId = @institucionId
        AND CertificacionEstudioId = @registroId
    `);
  if (!exists.recordset[0]) {
    return res.status(404).json({ ok: false, message: "No se encontró la certificación seleccionada" });
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("registroId", sql.Int, registroId)
    .query(`
      DELETE FROM dbo.CertificacionEstudioRegistro
      WHERE InstitucionId = @institucionId
        AND CertificacionEstudioId = @registroId
    `);

  return ok(res, { registroId }, "La certificación fue eliminada permanentemente");
});

router.post("/admin/consecutivos/eliminar-lote", async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ ok: false, message: "Solo el super admin puede eliminar consecutivos" });
  }

  const institucionId = Number(req.body?.institucionId || 0);
  const tipo = String(req.body?.tipo || "").trim().toUpperCase();
  const registroIdsRaw = Array.isArray(req.body?.registroIds) ? req.body.registroIds : [];
  const registroIds = Array.from(new Set(
    registroIdsRaw
      .map((item: any) => Number(item || 0))
      .filter((item: number) => Number.isInteger(item) && item > 0)
  ));

  if (!institucionId) return badRequest(res, "Debés seleccionar un colegio");
  if (!["BOLETAS_CONDUCTA", "CERTIFICACIONES"].includes(tipo)) {
    return badRequest(res, "Tipo inválido");
  }
  if (!registroIds.length) {
    return badRequest(res, "Debés seleccionar al menos un registro");
  }

  const pool = await getPool();
  const idsSql = registroIds.join(",");

  if (tipo === "BOLETAS_CONDUCTA") {
    const found = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT BoletaConductaId
        FROM dbo.BoletaConducta
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId IN (${idsSql})
      `);

    const foundIds = new Set((found.recordset || []).map((item: any) => Number(item.BoletaConductaId || 0)));
    const missing = registroIds.filter((item) => !foundIds.has(item));
    if (missing.length) {
      return res.status(404).json({ ok: false, message: "Uno o más registros de boletas ya no existen en ese colegio" });
    }

    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        DELETE FROM dbo.BoletaConductaEnvio
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId IN (${idsSql});

        DELETE FROM dbo.BoletaConducta
        WHERE InstitucionId = @institucionId
          AND BoletaConductaId IN (${idsSql});
      `);

    return ok(res, { totalEliminados: registroIds.length }, "Los registros seleccionados fueron eliminados permanentemente");
  }

  await ensureCertificacionEstudioTables(pool);
  const found = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT CertificacionEstudioId
      FROM dbo.CertificacionEstudioRegistro
      WHERE InstitucionId = @institucionId
        AND CertificacionEstudioId IN (${idsSql})
    `);

  const foundIds = new Set((found.recordset || []).map((item: any) => Number(item.CertificacionEstudioId || 0)));
  const missing = registroIds.filter((item) => !foundIds.has(item));
  if (missing.length) {
    return res.status(404).json({ ok: false, message: "Uno o más registros de certificaciones ya no existen en ese colegio" });
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      DELETE FROM dbo.CertificacionEstudioRegistro
      WHERE InstitucionId = @institucionId
        AND CertificacionEstudioId IN (${idsSql})
    `);

  return ok(res, { totalEliminados: registroIds.length }, "Los registros seleccionados fueron eliminados permanentemente");
});
export default router;
