import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";
import {
  asegurarEstructuraEval360ParaTraslado,
  copiarAsistenciaPorTraslado,
  copiarNotasPorTraslado,
  ensureMatriculaTrasladoHistorialTable
} from "./matricula-traslado.utils";
import { bumpProfesorPeriodoEstadosVersion } from "../periodos-profesor/periodos-profesor.utils";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"));

function getInstitutionId(req: any, res: any) {
  const institucionId = req.auth?.institucionId ?? null;

  if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }

  return Number(institucionId);
}

function invalidDateRange(fechaInicio?: string | null, fechaFin?: string | null) {
  if (!fechaInicio || !fechaFin) return false;
  return new Date(fechaInicio) > new Date(fechaFin);
}

function isValidNonNegativeId(value: any) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function isValidPositiveId(value: any) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

async function hasMateriaEspecialColumn(pool: any) {
  const result = await pool.request().query(`
    SELECT CAST(
      CASE
        WHEN COL_LENGTH('dbo.Materia', 'EsMateriaEspecial') IS NULL THEN 0
        ELSE 1
      END AS BIT
    ) AS HasColumn
  `);

  return Boolean(result.recordset[0]?.HasColumn);
}

function materiaEspecialSelectSql(hasColumn: boolean, alias?: string) {
  if (!hasColumn) {
    return "CAST(0 AS BIT)";
  }

  const prefix = alias ? `${alias}.` : "";
  return `CAST(ISNULL(${prefix}EsMateriaEspecial, 0) AS BIT)`;
}

function normalizeSqlTime(value?: string | null) {
  if (!value) return null;

  const trimmed = String(value).trim();

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed}:00`;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function jsDayToSqlWeekday(jsDay: number) {
  return jsDay === 0 ? 1 : jsDay + 1;
}

function enumerateDatesBetween(start: Date, end: Date) {
  const dates: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function formatDateOnly(value?: Date | string | null) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getMaxDate(...values: Array<Date | null | undefined>) {
  const valid = values.filter(Boolean) as Date[];
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((item) => item.getTime())));
}

function getDiaSemanaNombre(diaSemana: number) {
  return DIAS_LECTIVOS_CATALOGO.find((item) => item.DiaSemana === Number(diaSemana))?.Nombre || `Día ${diaSemana}`;
}

function getFechaClaseSyncErrorStatus(error: any) {
  const message = String(error?.message || "");
  const knownClientMessages = [
    "El período no pertenece a la institución",
    "El período está inactivo",
    "El período seleccionado debe tener fecha de inicio y fin definidas",
    "La fecha de aplicación no es válida",
    "La fecha de aplicación debe estar dentro del período seleccionado",
    "No se pudo determinar la fecha de aplicación"
  ];

  return knownClientMessages.some((item) => message.includes(item)) ? 400 : 500;
}

function buildFechaClaseSyncItem(item: any, overrides: Record<string, any> = {}) {
  return {
    FechaClaseId: item.FechaClaseId ? Number(item.FechaClaseId) : null,
    HorarioGrupoId: Number(item.HorarioGrupoId),
    GrupoMateriaId: Number(item.GrupoMateriaId),
    GrupoId: Number(item.GrupoId),
    GrupoNombre: item.GrupoNombre || "",
    GrupoNivel: item.GrupoNivel || null,
    MateriaNombre: item.MateriaNombre || "",
    PeriodoId: item.PeriodoId ? Number(item.PeriodoId) : null,
    PeriodoNombre: item.PeriodoNombre || "",
    Fecha: formatDateOnly(item.Fecha),
    BloqueHorarioId: Number(item.BloqueHorarioId),
    BloqueNombre: item.BloqueNombre || "",
    DiaSemana: Number(item.DiaSemana),
    DiaSemanaNombre: getDiaSemanaNombre(Number(item.DiaSemana)),
    TieneAsistencia: Boolean(item.TieneAsistencia),
    ...overrides
  };
}

async function writeFechaClaseSyncLogIfAvailable(
  executor: any,
  payload: {
    InstitucionId: number;
    PeriodoId: number;
    FechaCorteSolicitada: string | null;
    FechaCorteAplicada: string;
    Modo: string;
    Resumen: any;
    UsuarioId?: number | null;
  }
) {
  await executor.request()
    .input("institucionId", sql.Int, payload.InstitucionId)
    .input("periodoId", sql.Int, payload.PeriodoId)
    .input("fechaCorteSolicitada", sql.Date, payload.FechaCorteSolicitada || null)
    .input("fechaCorteAplicada", sql.Date, payload.FechaCorteAplicada)
    .input("modo", sql.NVarChar, payload.Modo)
    .input("usuarioId", sql.Int, payload.UsuarioId || null)
    .input("resumenJson", sql.NVarChar(sql.MAX), JSON.stringify(payload.Resumen || {}))
    .query(`
      IF OBJECT_ID('dbo.FechaClaseSyncLog', 'U') IS NOT NULL
      BEGIN
        INSERT INTO dbo.FechaClaseSyncLog
        (
          InstitucionId,
          PeriodoId,
          FechaCorteSolicitada,
          FechaCorteAplicada,
          Modo,
          UsuarioId,
          ResumenJson,
          CreatedAt
        )
        VALUES
        (
          @institucionId,
          @periodoId,
          @fechaCorteSolicitada,
          @fechaCorteAplicada,
          @modo,
          @usuarioId,
          @resumenJson,
          SYSDATETIME()
        )
      END
    `);
}

async function getHorarioDocenteConflictInfo(params: {
  pool: any;
  institucionId: number;
  grupoMateriaId: number;
  bloqueHorarioId: number;
  diaSemana: number;
  excludeHorarioGrupoId?: number | null;
}) {
  const { pool, institucionId, grupoMateriaId, bloqueHorarioId, diaSemana, excludeHorarioGrupoId } = params;
  const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);

  const targetResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoMateriaId", sql.Int, grupoMateriaId)
    .query(`
      SELECT TOP 1
        gm.GrupoMateriaId,
        gm.GrupoId,
        gm.MateriaId,
        ISNULL(gm.PeriodoId, 0) AS PeriodoId,
        g.Nombre AS GrupoNombre,
        g.AnioLectivoId,
        m.Nombre AS MateriaNombre,
        ${materiaEspecialSelectSql(hasEsMateriaEspecial, "m")} AS EsMateriaEspecial
      FROM dbo.GrupoMateria gm
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
      WHERE gm.GrupoMateriaId = @grupoMateriaId
        AND gm.Activo = 1
        AND g.InstitucionId = @institucionId
    `);

  if (!targetResult.recordset.length) {
    return {
      target: null,
      docentes: [],
      conflicts: []
    };
  }

  const target = targetResult.recordset[0];

  const docentesResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, Number(target.GrupoId))
    .input("materiaId", sql.Int, Number(target.MateriaId))
    .input("anioLectivoId", sql.Int, Number(target.AnioLectivoId))
    .input("periodoId", sql.Int, Number(target.PeriodoId))
    .query(`
      SELECT DISTINCT
        ad.UsuarioId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Usuario u
        ON u.UsuarioId = ad.UsuarioId
      WHERE ad.InstitucionId = @institucionId
        AND ad.Activo = 1
        AND ad.GrupoId = @grupoId
        AND ad.MateriaId = @materiaId
        AND ad.AnioLectivoId = @anioLectivoId
        AND ISNULL(ad.PeriodoId, 0) = @periodoId
    `);

  if (!docentesResult.recordset.length) {
    return {
      target,
      docentes: [],
      conflicts: []
    };
  }

  const docentes = docentesResult.recordset;
  const docenteIds = docentes.map((item: any) => Number(item.UsuarioId)).filter(Number.isFinite);
  const docentesCsv = docenteIds.join(",");

  const conflictsResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoMateriaId", sql.Int, grupoMateriaId)
    .input("bloqueHorarioId", sql.Int, bloqueHorarioId)
    .input("diaSemana", sql.Int, diaSemana)
    .input("anioLectivoId", sql.Int, Number(target.AnioLectivoId))
    .input("periodoId", sql.Int, Number(target.PeriodoId))
    .input("excludeHorarioGrupoId", sql.Int, excludeHorarioGrupoId || null)
    .input("docentesCsv", sql.NVarChar(sql.MAX), docentesCsv)
    .query(`
      SELECT DISTINCT
        ad.UsuarioId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        hg.HorarioGrupoId,
        gm.GrupoMateriaId,
        g.Nombre AS GrupoNombre,
        m.Nombre AS MateriaNombre,
        bh.Nombre AS BloqueNombre,
        ${materiaEspecialSelectSql(hasEsMateriaEspecial, "m")} AS EsMateriaEspecial
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
      INNER JOIN dbo.BloqueHorario bh
        ON bh.BloqueHorarioId = hg.BloqueHorarioId
      INNER JOIN dbo.AsignacionDocente ad
        ON ad.GrupoId = gm.GrupoId
       AND ad.MateriaId = gm.MateriaId
       AND ad.Activo = 1
       AND ad.InstitucionId = @institucionId
       AND ad.AnioLectivoId = @anioLectivoId
       AND ISNULL(ad.PeriodoId, 0) = @periodoId
      INNER JOIN dbo.Usuario u
        ON u.UsuarioId = ad.UsuarioId
      WHERE hg.Activo = 1
        AND hg.GrupoMateriaId <> @grupoMateriaId
        AND hg.BloqueHorarioId = @bloqueHorarioId
        AND hg.DiaSemana = @diaSemana
        AND (@excludeHorarioGrupoId IS NULL OR hg.HorarioGrupoId <> @excludeHorarioGrupoId)
        AND ad.UsuarioId IN (
          SELECT TRY_CAST([value] AS INT)
          FROM string_split(@docentesCsv, ',')
          WHERE TRY_CAST([value] AS INT) IS NOT NULL
        )
      ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre, g.Nombre, m.Nombre
    `);

  return {
    target,
    docentes,
    conflicts: conflictsResult.recordset || []
  };
}

async function validateHorarioDocenteConflict(params: {
  pool: any;
  institucionId: number;
  grupoMateriaId: number;
  bloqueHorarioId: number;
  diaSemana: number;
  excludeHorarioGrupoId?: number | null;
}) {
  const result = await getHorarioDocenteConflictInfo(params);
  const target = result.target;

  if (!target || !result.conflicts.length) {
    return null;
  }

  const targetEsEspecial = Boolean(target.EsMateriaEspecial);
  const blocking = result.conflicts.filter((item: any) => !(targetEsEspecial && Boolean(item.EsMateriaEspecial)));

  if (!blocking.length) {
    return null;
  }

  const first = blocking[0];
  const docente = [
    first.Nombre || "",
    first.PrimerApellido || "",
    first.SegundoApellido || ""
  ].join(" ").replace(/\s+/g, " ").trim() || first.Correo || "docente";

  const detalles = blocking
    .slice(0, 3)
    .map((item: any) => `${item.GrupoNombre} - ${item.MateriaNombre}`)
    .join(", ");

  return {
    code: "DOCENTE_HORARIO_CONFLICTO",
    message: `El docente ${docente} ya tiene horario asignado en ese día y bloque con ${detalles}. Solo se permite compartir lección cuando ambas materias están marcadas como especiales.`,
    details: blocking
  };
}

async function buildFechaClaseSyncPreview(
  pool: any,
  institucionId: number,
  periodoId: number,
  fechaCorteSolicitada?: string | null
) {
  const periodoResult = await pool.request()
    .input("periodoId", sql.Int, periodoId)
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1
        p.PeriodoId,
        p.Nombre,
        p.FechaInicio,
        p.FechaFin,
        p.Activo,
        a.AnioLectivoId,
        a.Nombre AS AnioNombre
      FROM dbo.Periodo p
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = p.AnioLectivoId
      WHERE p.PeriodoId = @periodoId
        AND a.InstitucionId = @institucionId
    `);

  if (!periodoResult.recordset.length) {
    throw new Error("El período no pertenece a la institución");
  }

  const periodo = periodoResult.recordset[0];

  if (!periodo.Activo) {
    throw new Error("El período está inactivo. Reactívalo antes de sincronizar las fechas de clase");
  }

  if (!periodo.FechaInicio || !periodo.FechaFin) {
    throw new Error("El período seleccionado debe tener fecha de inicio y fin definidas");
  }

  const hoy = startOfDay(new Date());
  const periodoInicio = startOfDay(new Date(periodo.FechaInicio));
  const periodoFin = startOfDay(new Date(periodo.FechaFin));
  const fechaSolicitada = fechaCorteSolicitada ? startOfDay(new Date(fechaCorteSolicitada)) : null;

  if (fechaSolicitada && Number.isNaN(fechaSolicitada.getTime())) {
    throw new Error("La fecha de aplicación no es válida");
  }

  if (fechaSolicitada && (fechaSolicitada < periodoInicio || fechaSolicitada > periodoFin)) {
    throw new Error("La fecha de aplicación debe estar dentro del período seleccionado");
  }

  const fechaAplicadaDate = getMaxDate(hoy, periodoInicio, fechaSolicitada);

  if (!fechaAplicadaDate) {
    throw new Error("No se pudo determinar la fecha de aplicación");
  }

  if (fechaAplicadaDate > periodoFin) {
    return {
      periodo: {
        PeriodoId: Number(periodo.PeriodoId),
        Nombre: periodo.Nombre || "",
        FechaInicio: formatDateOnly(periodo.FechaInicio),
        FechaFin: formatDateOnly(periodo.FechaFin)
      },
      fechaCorteSolicitada: fechaCorteSolicitada ? formatDateOnly(fechaCorteSolicitada) : null,
      fechaCorteAplicada: formatDateOnly(fechaAplicadaDate),
      resumen: {
        horariosActivos: 0,
        totalEsperadas: 0,
        crear: 0,
        mantener: 0,
        eliminar: 0,
        bloqueadasPorAsistencia: 0,
        conflictos: 0
      },
      crear: [],
      mantener: [],
      eliminar: [],
      bloqueadas: [],
      conflictos: []
    };
  }

  const [horariosResult, fechasExistentesResult, feriadosResult] = await Promise.all([
    pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT
          hg.HorarioGrupoId,
          hg.GrupoMateriaId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          gm.PeriodoId,
          gm.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          p.Nombre AS PeriodoNombre,
          bh.Nombre AS BloqueNombre,
          bh.OrdenVisual
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = gm.PeriodoId
        WHERE g.InstitucionId = @institucionId
          AND gm.PeriodoId = @periodoId
          AND gm.Activo = 1
          AND hg.Activo = 1
        ORDER BY g.Nombre, m.Nombre, bh.OrdenVisual
      `),
    pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("periodoId", sql.Int, periodoId)
      .input("fechaCorteAplicada", sql.Date, formatDateOnly(fechaAplicadaDate))
      .query(`
        SELECT
          fc.FechaClaseId,
          fc.HorarioGrupoId,
          fc.Fecha,
          fc.PeriodoId,
          hg.GrupoMateriaId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          gm.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          p.Nombre AS PeriodoNombre,
          bh.Nombre AS BloqueNombre,
          bh.OrdenVisual,
          CASE WHEN s.FechaClaseId IS NULL THEN 0 ELSE 1 END AS TieneAsistencia
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        LEFT JOIN dbo.AsistenciaSesion s
          ON s.FechaClaseId = fc.FechaClaseId
        WHERE g.InstitucionId = @institucionId
          AND fc.PeriodoId = @periodoId
          AND fc.Fecha >= @fechaCorteAplicada
        ORDER BY fc.Fecha, g.Nombre, m.Nombre, bh.OrdenVisual
      `),
    pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("fechaInicio", sql.Date, formatDateOnly(fechaAplicadaDate))
      .input("fechaFin", sql.Date, formatDateOnly(periodoFin))
      .query(`
        SELECT Fecha
        FROM dbo.FeriadoInstitucional
        WHERE InstitucionId = @institucionId
          AND Activo = 1
          AND Fecha BETWEEN @fechaInicio AND @fechaFin
      `)
  ]);

  const feriadosSet = new Set(
    feriadosResult.recordset.map((item: any) => formatDateOnly(item.Fecha))
  );

  const fechasFuturas = enumerateDatesBetween(fechaAplicadaDate, periodoFin);
  const fechasPorDiaSemana = new Map<number, string[]>();

  for (const fecha of fechasFuturas) {
    const fechaStr = formatDateOnly(fecha);
    if (feriadosSet.has(fechaStr)) continue;
    const diaSemana = jsDayToSqlWeekday(fecha.getDay());
    const bucket = fechasPorDiaSemana.get(diaSemana) || [];
    bucket.push(fechaStr);
    fechasPorDiaSemana.set(diaSemana, bucket);
  }

  const expectedByKey = new Map<string, any>();
  const expectedByOccupancy = new Map<string, any[]>();

  for (const horario of horariosResult.recordset) {
    const fechasEsperadas = fechasPorDiaSemana.get(Number(horario.DiaSemana)) || [];
    for (const fecha of fechasEsperadas) {
      const expectedItem = buildFechaClaseSyncItem(horario, { Fecha: fecha, TieneAsistencia: false });
      const key = `${expectedItem.HorarioGrupoId}|${expectedItem.Fecha}`;
      expectedByKey.set(key, expectedItem);

      const occupancyKey = `${expectedItem.GrupoId}|${expectedItem.Fecha}|${expectedItem.BloqueHorarioId}`;
      const current = expectedByOccupancy.get(occupancyKey) || [];
      current.push(expectedItem);
      expectedByOccupancy.set(occupancyKey, current);
    }
  }

  const existingByKey = new Map<string, any>();
  const existingByOccupancy = new Map<string, any[]>();
  const eliminar: any[] = [];
  const bloqueadas: any[] = [];
  const mantener: any[] = [];
  const keysEliminables = new Set<string>();

  for (const fechaExistente of fechasExistentesResult.recordset) {
    const currentItem = buildFechaClaseSyncItem(fechaExistente);
    const key = `${currentItem.HorarioGrupoId}|${currentItem.Fecha}`;
    existingByKey.set(key, currentItem);

    const occupancyKey = `${currentItem.GrupoId}|${currentItem.Fecha}|${currentItem.BloqueHorarioId}`;
    const current = existingByOccupancy.get(occupancyKey) || [];
    current.push(currentItem);
    existingByOccupancy.set(occupancyKey, current);

    if (expectedByKey.has(key)) {
      mantener.push(currentItem);
      continue;
    }

    if (currentItem.TieneAsistencia) {
      bloqueadas.push({
        ...currentItem,
        Motivo: "Tiene asistencia registrada y no se puede modificar"
      });
      continue;
    }

    eliminar.push({
      ...currentItem,
      Motivo: "Ya no corresponde al horario activo del período"
    });
    keysEliminables.add(key);
  }

  const conflictos: any[] = [];
  const crear: any[] = [];
  const conflictKeys = new Set<string>();

  for (const expectedItem of expectedByKey.values()) {
    const key = `${expectedItem.HorarioGrupoId}|${expectedItem.Fecha}`;
    if (existingByKey.has(key)) continue;

    const occupancyKey = `${expectedItem.GrupoId}|${expectedItem.Fecha}|${expectedItem.BloqueHorarioId}`;
    const expectedDuplicates = (expectedByOccupancy.get(occupancyKey) || []).filter(
      (item) => !(item.HorarioGrupoId === expectedItem.HorarioGrupoId && item.Fecha === expectedItem.Fecha)
    );

    if (expectedDuplicates.length) {
      if (!conflictKeys.has(key)) {
        conflictos.push({
          ...expectedItem,
          Motivo: "Hay más de un horario activo ocupando el mismo bloque en esa fecha"
        });
        conflictKeys.add(key);
      }
      continue;
    }

    const occupancies = existingByOccupancy.get(occupancyKey) || [];
    const ocupacionesActivas = occupancies.filter((item) => {
      const existingKey = `${item.HorarioGrupoId}|${item.Fecha}`;
      return !keysEliminables.has(existingKey);
    });

    if (ocupacionesActivas.length) {
      conflictos.push({
        ...expectedItem,
        Motivo: "Existe otra fecha futura ocupando ese mismo bloque y no se puede reemplazar automáticamente"
      });
      conflictKeys.add(key);
      continue;
    }

    crear.push({
      ...expectedItem,
      Motivo: "Fecha faltante según horario activo del período"
    });
  }

  return {
    periodo: {
      PeriodoId: Number(periodo.PeriodoId),
      Nombre: periodo.Nombre || "",
      FechaInicio: formatDateOnly(periodo.FechaInicio),
      FechaFin: formatDateOnly(periodo.FechaFin)
    },
    fechaCorteSolicitada: fechaCorteSolicitada ? formatDateOnly(fechaCorteSolicitada) : null,
    fechaCorteAplicada: formatDateOnly(fechaAplicadaDate),
    resumen: {
      horariosActivos: horariosResult.recordset.length,
      totalEsperadas: expectedByKey.size,
      crear: crear.length,
      mantener: mantener.length,
      eliminar: eliminar.length,
      bloqueadasPorAsistencia: bloqueadas.length,
      conflictos: conflictos.length
    },
    crear,
    mantener,
    eliminar,
    bloqueadas,
    conflictos
  };
}

const DIAS_LECTIVOS_CATALOGO = [
  { DiaSemana: 2, Nombre: "Lunes" },
  { DiaSemana: 3, Nombre: "Martes" },
  { DiaSemana: 4, Nombre: "Miércoles" },
  { DiaSemana: 5, Nombre: "Jueves" },
  { DiaSemana: 6, Nombre: "Viernes" },
  { DiaSemana: 7, Nombre: "Sábado" },
  { DiaSemana: 1, Nombre: "Domingo" }
];


async function getDocentesCatalogo(pool: any, institucionId: number) {
  return pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT
        u.UsuarioId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        STRING_AGG(r.Nombre, ', ') AS Roles
      FROM dbo.Usuario u
      INNER JOIN dbo.UsuarioRol ur
        ON ur.UsuarioId = u.UsuarioId
       AND ur.Activo = 1
      INNER JOIN dbo.Rol r
        ON r.RolId = ur.RolId
      WHERE u.InstitucionId = @institucionId
        AND u.Activo = 1
        AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
      GROUP BY
        u.UsuarioId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido
      ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre
    `);
}

async function getDocentesProfeGuia12Catalogo(pool: any, institucionId: number) {
  return pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT
        u.UsuarioId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido
      FROM dbo.Usuario u
      WHERE u.InstitucionId = @institucionId
        AND u.Activo = 1
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
    `);
}

function grupoDuodecimoWhereSql(alias = "g") {
  return `(
    ${alias}.NivelAcademico = 12
    OR LTRIM(RTRIM(ISNULL(${alias}.Nivel, N''))) LIKE N'12%'
    OR UPPER(LTRIM(RTRIM(ISNULL(${alias}.Nivel, N'')))) LIKE N'DUOD%'
    OR LTRIM(RTRIM(ISNULL(${alias}.Nombre, N''))) LIKE N'12-%'
  )`;
}

function grupoOrdenSeccionSql(alias = "g") {
  return `
    TRY_CONVERT(INT, LEFT(LTRIM(RTRIM(ISNULL(${alias}.Nombre, N''))), CHARINDEX(N'-', LTRIM(RTRIM(ISNULL(${alias}.Nombre, N''))) + N'-') - 1)),
    TRY_CONVERT(INT, SUBSTRING(LTRIM(RTRIM(ISNULL(${alias}.Nombre, N''))), CHARINDEX(N'-', LTRIM(RTRIM(ISNULL(${alias}.Nombre, N''))) + N'-') + 1, 20)),
    LTRIM(RTRIM(ISNULL(${alias}.Nombre, N'')))
  `;
}

async function getProfeGuia12AsignacionById(pool: any, institucionId: number, asignacionDocenteId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("asignacionDocenteId", sql.Int, asignacionDocenteId)
    .query(`
      SELECT TOP 1
        ad.AsignacionDocenteId,
        ad.InstitucionId,
        ad.UsuarioId,
        ad.GrupoId,
        ad.MateriaId,
        ad.AnioLectivoId,
        ad.PeriodoId,
        ad.TipoAsignacion,
        ad.Activo,
        ad.CreatedAt,
        ad.UpdatedAt,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico AS GrupoNivelAcademico,
        NULL AS MateriaNombre,
        a.Nombre AS AnioNombre,
        NULL AS PeriodoNombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Usuario u
        ON u.UsuarioId = ad.UsuarioId
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = ad.GrupoId
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = ad.AnioLectivoId
      WHERE ad.InstitucionId = @institucionId
        AND ad.AsignacionDocenteId = @asignacionDocenteId
        AND ad.TipoAsignacion = N'PROFESOR_GUIA'
        AND ad.MateriaId IS NULL
        AND ad.PeriodoId IS NULL
        AND ${grupoDuodecimoWhereSql("g")}
    `);

  return result.recordset[0] || null;
}

async function getConfiguracionCorreoEstudiante(pool: any, institucionId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1 ISNULL(DominioCorreoEstudiantil, N'@est.mep.go.cr') AS DominioCorreoEstudiantil
      FROM dbo.Institucion
      WHERE InstitucionId = @institucionId
    `);
  return { dominio: String(result.recordset[0]?.DominioCorreoEstudiantil || "@est.mep.go.cr") };
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

async function ensureCorreoNotificacionConfigTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.CorreoNotificacionConfig', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CorreoNotificacionConfig (
        CorreoNotificacionConfigId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        TipoUso NVARCHAR(30) NOT NULL,
        FromEmail NVARCHAR(320) NULL,
        ParaModo NVARCHAR(30) NOT NULL CONSTRAINT DF_CorreoNotificacionConfig_ParaModo DEFAULT(N'ALUMNO'),
        CcModo NVARCHAR(30) NOT NULL CONSTRAINT DF_CorreoNotificacionConfig_CcModo DEFAULT(N'PROFESOR'),
        AsuntoTemplate NVARCHAR(300) NULL,
        CuerpoTemplate NVARCHAR(MAX) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_CorreoNotificacionConfig_Activo DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CorreoNotificacionConfig_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL
      );
      CREATE UNIQUE INDEX UX_CorreoNotificacionConfig_InstitucionTipo
        ON dbo.CorreoNotificacionConfig (InstitucionId, TipoUso);
    END
  `);
}

async function ensureBoletaConductaConfigTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.BoletaConductaConfig', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.BoletaConductaConfig (
        InstitucionId INT NOT NULL PRIMARY KEY,
        SiguienteNumero INT NOT NULL CONSTRAINT DF_BoletaConductaConfig_SiguienteNumero DEFAULT(1),
        Prefijo NVARCHAR(80) NULL,
        AnioLectivo NVARCHAR(10) NULL,
        UpdatedAt DATETIME2 NULL
      );
    END

    IF COL_LENGTH('dbo.BoletaConductaConfig', 'Prefijo') IS NULL
      ALTER TABLE dbo.BoletaConductaConfig ADD Prefijo NVARCHAR(80) NULL;

    IF COL_LENGTH('dbo.BoletaConductaConfig', 'AnioLectivo') IS NULL
      ALTER TABLE dbo.BoletaConductaConfig ADD AnioLectivo NVARCHAR(10) NULL;
  `);
}

async function ensureSubEspecialidadTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.SubEspecialidad', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SubEspecialidad (
        SubEspecialidadId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        EspecialidadId INT NOT NULL,
        Descripcion NVARCHAR(200) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_SubEspecialidad_Activo DEFAULT(1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_SubEspecialidad_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_SubEspecialidad_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
        CONSTRAINT FK_SubEspecialidad_Especialidad FOREIGN KEY (EspecialidadId) REFERENCES dbo.Especialidad(EspecialidadId)
      );

      CREATE INDEX IX_SubEspecialidad_InstitucionEspecialidad
        ON dbo.SubEspecialidad (InstitucionId, EspecialidadId, Activo, Descripcion);
    END
  `);
}

async function ensureCertificacionEstudioConfigTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.CertificacionEstudioConfig', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.CertificacionEstudioConfig (
        InstitucionId INT NOT NULL PRIMARY KEY,
        SiguienteNumero INT NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_SiguienteNumero DEFAULT(1),
        Prefijo NVARCHAR(80) NULL,
        AnioLectivo NVARCHAR(10) NULL,
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_UpdatedAt DEFAULT(SYSDATETIME())
      );
    END

    IF COL_LENGTH('dbo.CertificacionEstudioConfig', 'Prefijo') IS NULL
      ALTER TABLE dbo.CertificacionEstudioConfig ADD Prefijo NVARCHAR(80) NULL;

    IF COL_LENGTH('dbo.CertificacionEstudioConfig', 'AnioLectivo') IS NULL
      ALTER TABLE dbo.CertificacionEstudioConfig ADD AnioLectivo NVARCHAR(10) NULL;
  `);
}

async function resolveInstitucionCurrentYear(pool: any, institucionId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1 Nombre
      FROM dbo.AnioLectivo
      WHERE InstitucionId = @institucionId
      ORDER BY CASE WHEN Activo = 1 THEN 0 ELSE 1 END, FechaInicio DESC, AnioLectivoId DESC
    `);
  const raw = String(result.recordset[0]?.Nombre || "").trim();
  const match = raw.match(/\d{4}/);
  return match?.[0] || String(new Date().getFullYear());
}

function buildConsecutivoCodigo(prefijo: string, siguienteNumero: number, anioLectivo: string) {
  const prefijoSeguro = String(prefijo || "").trim();
  const anioSeguro = String(anioLectivo || "").trim();
  const numero = String(Number(siguienteNumero || 0)).padStart(3, "0");
  return [prefijoSeguro, numero, anioSeguro].filter(Boolean).join("-");
}

function normalizeTipoUsoMensaje(value: any) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (["COTIDIANO", "TAREA", "ASISTENCIA", "EXAMEN"].includes(raw)) return raw;
  return "";
}

function isValorNivelPermitido(tipoUso: string, valorNivel: number | null) {
  if (valorNivel === null) return true;
  if (tipoUso === "ASISTENCIA") return [1, 2, 3].includes(Number(valorNivel));
  if (tipoUso === "TAREA") return [0, 1, 2, 3].includes(Number(valorNivel));
  return [1, 2, 3].includes(Number(valorNivel));
}

/* =========================================================
   CATALOGOS
   ========================================================= */
router.get("/catalogos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const pool = await getPool();
    const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);

    const [anios, estudiantes, grupos, periodos, materias, especialidades, tiposAdecuacion, tiposEstudiante, rutasTransporte, docentes, bloques, feriados, diasLectivos, configCorreo] = await Promise.all([
      pool.request()
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
          ORDER BY FechaInicio DESC
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            EstudianteId,
            Identificacion,
            Nombre,
            PrimerApellido,
            SegundoApellido,
            matriculaActual.GrupoId AS GrupoActualId,
            matriculaActual.GrupoNombre AS GrupoActualNombre,
            matriculaActual.EspecialidadActualId AS EspecialidadActualId,
            matriculaActual.EspecialidadActual AS EspecialidadActual,
            Activo
          FROM dbo.Estudiante
          OUTER APPLY (
            SELECT TOP 1
              m.GrupoId,
              g.Nombre AS GrupoNombre,
              md.EspecialidadId AS EspecialidadActualId,
              COALESCE(
                NULLIF(LTRIM(RTRIM(esp.Descripcion)), ''),
                NULLIF(LTRIM(RTRIM(md.Especialidad)), ''),
                NULLIF(LTRIM(RTRIM(g.Especialidad)), '')
              ) AS EspecialidadActual
            FROM dbo.Matricula m
            INNER JOIN dbo.Grupo g
              ON g.GrupoId = m.GrupoId
            LEFT JOIN dbo.MatriculaDetalle md
              ON md.MatriculaId = m.MatriculaId
            LEFT JOIN dbo.Especialidad esp
              ON esp.EspecialidadId = md.EspecialidadId
            WHERE m.EstudianteId = dbo.Estudiante.EstudianteId
              AND m.Estado = N'Activa'
            ORDER BY m.AnioLectivoId DESC, m.MatriculaId DESC
          ) AS matriculaActual
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY PrimerApellido, SegundoApellido, Nombre
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            g.GrupoId,
            g.AnioLectivoId,
            g.Nombre,
            g.Nivel,
            g.NivelAcademico,
            g.Jornada,
            g.Activo,
            a.Nombre AS AnioNombre
          FROM dbo.Grupo g
          INNER JOIN dbo.AnioLectivo a
            ON a.AnioLectivoId = g.AnioLectivoId
          WHERE g.InstitucionId = @institucionId
            AND g.Activo = 1
          ORDER BY g.Nombre
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            p.PeriodoId,
            p.AnioLectivoId,
            p.Nombre,
            p.NumeroOrden,
            p.FechaInicio,
            p.FechaFin,
            p.Activo,
            a.Nombre AS AnioNombre
          FROM dbo.Periodo p
          INNER JOIN dbo.AnioLectivo a
            ON a.AnioLectivoId = p.AnioLectivoId
          WHERE a.InstitucionId = @institucionId
            AND p.Activo = 1
          ORDER BY a.FechaInicio DESC, p.NumeroOrden ASC
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            MateriaId,
            InstitucionId,
            Codigo,
            Nombre,
            Descripcion,
            ${materiaEspecialSelectSql(hasEsMateriaEspecial)} AS EsMateriaEspecial,
            Activa AS Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.Materia
          WHERE (InstitucionId = @institucionId OR EsGlobal = 1)
            AND Activa = 1
          ORDER BY Nombre
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            EspecialidadId,
            InstitucionId,
            Descripcion,
            PermiteMultiplesPorSeccion,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.Especialidad
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Descripcion
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            TipoAdecuacionId,
            InstitucionId,
            Descripcion,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.TipoAdecuacion
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Descripcion
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            TipoEstudianteId,
            InstitucionId,
            Descripcion,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.TipoEstudiante
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Descripcion
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            RutaTransporteId,
            InstitucionId,
            Descripcion,
            Responsable,
            LugarInicio,
            LugarFin,
            CapacidadEstudiantes,
            HoraInicio,
            HoraFin,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.RutaTransporte
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Descripcion
        `),

      getDocentesCatalogo(pool, institucionId),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            BloqueHorarioId,
            InstitucionId,
            Nombre,
            HoraInicio,
            HoraFin,
            OrdenVisual
          FROM dbo.BloqueHorario
          WHERE InstitucionId = @institucionId
          ORDER BY OrdenVisual, HoraInicio
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            FeriadoId,
            InstitucionId,
            Fecha,
            Nombre,
            Descripcion,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.FeriadoInstitucional
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Fecha ASC
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT
            DiaLectivoId,
            InstitucionId,
            DiaSemana,
            Nombre,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.DiaLectivoInstitucion
          WHERE InstitucionId = @institucionId
          ORDER BY CASE WHEN DiaSemana = 1 THEN 8 ELSE DiaSemana END
        `),

      getConfiguracionCorreoEstudiante(pool, institucionId)
    ]);

    return ok(res, {
      aniosLectivos: anios.recordset,
      estudiantes: estudiantes.recordset,
      grupos: grupos.recordset,
      periodos: periodos.recordset,
      materias: materias.recordset,
      especialidades: especialidades.recordset,
      tiposEstudiante: tiposEstudiante.recordset,
      tiposAdecuacion: tiposAdecuacion.recordset,
      rutasTransporte: rutasTransporte.recordset,
      docentes: docentes.recordset,
      bloquesHorarios: bloques.recordset,
      feriados: feriados.recordset,
      diasLectivos: diasLectivos.recordset,
      configuracionCorreoEstudiante: configCorreo
    });
  } catch (error) {
    console.error("Error cargando catálogos académicos:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al cargar catálogos académicos"
    });
  }
});

router.get("/configuracion-correo-estudiante", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    const config = await getConfiguracionCorreoEstudiante(pool, institucionId);
    return ok(res, config);
  } catch (error) {
    console.error("Error al cargar configuración de correo estudiantil:", error);
    return res.status(500).json({ ok: false, message: "Error interno al cargar la configuración de correo" });
  }
});

router.put("/configuracion-correo-estudiante", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const dominio = String(req.body?.dominio || "").trim();
    if (!dominio) return badRequest(res, "dominio es obligatorio");
    const dominioNormalizado = dominio.startsWith("@") ? dominio : `@${dominio}`;
    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("dominio", sql.NVarChar, dominioNormalizado)
      .query(`
        UPDATE dbo.Institucion
        SET DominioCorreoEstudiantil = @dominio, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.InstitucionId, INSERTED.DominioCorreoEstudiantil
        WHERE InstitucionId = @institucionId
      `);
    return ok(res, { dominio: result.recordset[0]?.DominioCorreoEstudiantil || dominioNormalizado }, "Configuración de correo estudiantil actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar configuración de correo estudiantil:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar la configuración de correo" });
  }
});

router.get("/boleta-conducta-config", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    await ensureBoletaConductaConfigTable(pool);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
        BEGIN
          INSERT INTO dbo.BoletaConductaConfig (InstitucionId, SiguienteNumero)
          VALUES (@institucionId, 1)
        END
        SELECT TOP 1 SiguienteNumero
        FROM dbo.BoletaConductaConfig
        WHERE InstitucionId = @institucionId
      `);
    return ok(res, { siguienteNumero: Number(result.recordset[0]?.SiguienteNumero || 1) });
  } catch (error) {
    console.error("Error cargando configuración de boleta de conducta:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la configuración de boleta de conducta" });
  }
});

router.put("/boleta-conducta-config", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const siguienteNumero = Number(req.body?.siguienteNumero || 0);
    if (!Number.isInteger(siguienteNumero) || siguienteNumero <= 0) {
      return badRequest(res, "El consecutivo inicial debe ser un número entero mayor a 0");
    }
    const pool = await getPool();
    await ensureBoletaConductaConfigTable(pool);
    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("siguienteNumero", sql.Int, siguienteNumero)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
        BEGIN
          UPDATE dbo.BoletaConductaConfig
          SET SiguienteNumero = @siguienteNumero,
              UpdatedAt = SYSDATETIME()
          WHERE InstitucionId = @institucionId
        END
        ELSE
        BEGIN
          INSERT INTO dbo.BoletaConductaConfig (InstitucionId, SiguienteNumero, UpdatedAt)
          VALUES (@institucionId, @siguienteNumero, SYSDATETIME())
        END
      `);
    return ok(res, { siguienteNumero }, "Consecutivo de boleta de conducta actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando configuración de boleta de conducta:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la configuración de boleta de conducta" });
  }
});

router.get("/configuracion-correo-notificaciones", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    await ensureCorreoNotificacionConfigTable(pool);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TipoUso, FromEmail, ParaModo, CcModo, AsuntoTemplate, CuerpoTemplate, Activo
        FROM dbo.CorreoNotificacionConfig
        WHERE InstitucionId = @institucionId
          AND Activo = 1
      `);
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error cargando configuración de correos de notificación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la configuración de correos" });
  }
});

router.put("/configuracion-correo-notificaciones/:tipoUso", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const tipoUso = normalizeTipoUsoMensaje(req.params.tipoUso);
    if (!tipoUso) return badRequest(res, "Tipo inválido");
    const fromEmail = String(req.body?.fromEmail || "").trim() || null;
    const paraModo = String(req.body?.paraModo || "ALUMNO").trim().toUpperCase();
    const ccModo = String(req.body?.ccModo || "PROFESOR").trim().toUpperCase();
    const asuntoTemplate = String(req.body?.asuntoTemplate || "").trim() || null;
    const cuerpoTemplate = String(req.body?.cuerpoTemplate || "").trim() || null;

    const pool = await getPool();
    await ensureCorreoNotificacionConfigTable(pool);
    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoUso", sql.NVarChar(30), tipoUso)
      .input("fromEmail", sql.NVarChar(320), fromEmail)
      .input("paraModo", sql.NVarChar(30), paraModo)
      .input("ccModo", sql.NVarChar(30), ccModo)
      .input("asuntoTemplate", sql.NVarChar(300), asuntoTemplate)
      .input("cuerpoTemplate", sql.NVarChar(sql.MAX), cuerpoTemplate)
      .query(`
        MERGE dbo.CorreoNotificacionConfig AS target
        USING (SELECT @institucionId AS InstitucionId, @tipoUso AS TipoUso) AS source
          ON target.InstitucionId = source.InstitucionId AND target.TipoUso = source.TipoUso
        WHEN MATCHED THEN
          UPDATE SET FromEmail=@fromEmail, ParaModo=@paraModo, CcModo=@ccModo, AsuntoTemplate=@asuntoTemplate, CuerpoTemplate=@cuerpoTemplate, Activo=1, UpdatedAt=SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (InstitucionId, TipoUso, FromEmail, ParaModo, CcModo, AsuntoTemplate, CuerpoTemplate, Activo)
          VALUES (@institucionId, @tipoUso, @fromEmail, @paraModo, @ccModo, @asuntoTemplate, @cuerpoTemplate, 1);
      `);
    return ok(res, null, "Configuración de correo actualizada correctamente");
  } catch (error) {
    console.error("Error actualizando configuración de correos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la configuración de correos" });
  }
});

router.get("/mensajes-seguimiento", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    await ensureMensajesSeguimientoTable(pool);
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          MensajeSeguimientoId,
          InstitucionId,
          TipoUso,
          ValorNivel,
          Titulo,
          Cuerpo,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.MensajeSeguimiento
        WHERE InstitucionId = @institucionId
          ${incluirInactivos ? "" : "AND Activo = 1"}
        ORDER BY TipoUso, CASE WHEN ValorNivel IS NULL THEN 99 ELSE ValorNivel END, MensajeSeguimientoId DESC
      `);
    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando mensajes de seguimiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los mensajes" });
  }
});

router.post("/mensajes-seguimiento", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const tipoUso = normalizeTipoUsoMensaje(req.body.tipoUso);
    const valorNivelRaw = req.body.valorNivel;
    const valorNivel = valorNivelRaw === null || valorNivelRaw === undefined || String(valorNivelRaw).trim() === ""
      ? null
      : Number(valorNivelRaw);
    const titulo = String(req.body.titulo || "").trim() || null;
    const cuerpo = String(req.body.cuerpo || "").trim();

    if (!tipoUso) return badRequest(res, "Tipo de mensaje inválido");
    if (!isValorNivelPermitido(tipoUso, valorNivel)) {
      return badRequest(res, tipoUso === "ASISTENCIA"
        ? "Para asistencia el nivel debe ser Ausencia (1) o Tardía (2)"
        : (tipoUso === "TAREA"
          ? "Para tareas el nivel debe ser 0 (No entregado), 1, 2 o 3"
          : "El nivel debe ser 1, 2 o 3"));
    }
    if (!cuerpo) return badRequest(res, "El cuerpo del mensaje es obligatorio");

    const pool = await getPool();
    await ensureMensajesSeguimientoTable(pool);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoUso", sql.NVarChar(30), tipoUso)
      .input("valorNivel", sql.Int, valorNivel)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("cuerpo", sql.NVarChar(sql.MAX), cuerpo)
      .query(`
        INSERT INTO dbo.MensajeSeguimiento
          (InstitucionId, TipoUso, ValorNivel, Titulo, Cuerpo, Activo)
        OUTPUT INSERTED.*
        VALUES
          (@institucionId, @tipoUso, @valorNivel, @titulo, @cuerpo, 1)
      `);
    return created(res, result.recordset[0], "Mensaje creado correctamente");
  } catch (error) {
    console.error("Error creando mensaje de seguimiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear el mensaje" });
  }
});

router.put("/mensajes-seguimiento/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return badRequest(res, "Id inválido");

    const tipoUso = normalizeTipoUsoMensaje(req.body.tipoUso);
    const valorNivelRaw = req.body.valorNivel;
    const valorNivel = valorNivelRaw === null || valorNivelRaw === undefined || String(valorNivelRaw).trim() === ""
      ? null
      : Number(valorNivelRaw);
    const titulo = String(req.body.titulo || "").trim() || null;
    const cuerpo = String(req.body.cuerpo || "").trim();
    const activo = req.body.activo === undefined ? true : Boolean(req.body.activo);

    if (!tipoUso) return badRequest(res, "Tipo de mensaje inválido");
    if (!isValorNivelPermitido(tipoUso, valorNivel)) {
      return badRequest(res, tipoUso === "ASISTENCIA"
        ? "Para asistencia el nivel debe ser Ausencia (1) o Tardía (2)"
        : (tipoUso === "TAREA"
          ? "Para tareas el nivel debe ser 0 (No entregado), 1, 2 o 3"
          : "El nivel debe ser 1, 2 o 3"));
    }
    if (!cuerpo) return badRequest(res, "El cuerpo del mensaje es obligatorio");

    const pool = await getPool();
    await ensureMensajesSeguimientoTable(pool);
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("tipoUso", sql.NVarChar(30), tipoUso)
      .input("valorNivel", sql.Int, valorNivel)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("cuerpo", sql.NVarChar(sql.MAX), cuerpo)
      .input("activo", sql.Bit, activo)
      .query(`
        UPDATE dbo.MensajeSeguimiento
        SET TipoUso = @tipoUso,
            ValorNivel = @valorNivel,
            Titulo = @titulo,
            Cuerpo = @cuerpo,
            Activo = @activo,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE MensajeSeguimientoId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset[0]) return res.status(404).json({ ok: false, message: "Mensaje no encontrado" });
    return ok(res, result.recordset[0], "Mensaje actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando mensaje de seguimiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el mensaje" });
  }
});

router.delete("/mensajes-seguimiento/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return badRequest(res, "Id inválido");
    const pool = await getPool();
    await ensureMensajesSeguimientoTable(pool);
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.MensajeSeguimiento
        SET Activo = 0,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MensajeSeguimientoId
        WHERE MensajeSeguimientoId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset[0]) return res.status(404).json({ ok: false, message: "Mensaje no encontrado" });
    return ok(res, null, "Mensaje eliminado correctamente");
  } catch (error) {
    console.error("Error eliminando mensaje de seguimiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el mensaje" });
  }
});


/* =========================================================
   ESPECIALIDADES
   ========================================================= */
router.get("/especialidades", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .query(`
        SELECT
          EspecialidadId,
          InstitucionId,
          Descripcion,
          PermiteMultiplesPorSeccion,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivas = 1 OR Activo = 1)
          AND (@q = '%%' OR Descripcion LIKE @q)
        ORDER BY Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar especialidades:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar especialidades" });
  }
});

router.post("/especialidades", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const descripcion = String(req.body?.descripcion || "").trim();
    const permiteMultiplesPorSeccion = !!req.body?.permiteMultiplesPorSeccion;

    if (!descripcion) {
      return badRequest(res, "La descripción es obligatoria");
    }

    const pool = await getPool();

    const duplicada = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 EspecialidadId, Activo
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe una especialidad con esa descripción" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .input("permiteMultiplesPorSeccion", sql.Bit, permiteMultiplesPorSeccion)
      .query(`
        INSERT INTO dbo.Especialidad
        (
          InstitucionId,
          Descripcion,
          PermiteMultiplesPorSeccion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @descripcion,
          @permiteMultiplesPorSeccion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Especialidad creada correctamente");
  } catch (error) {
    console.error("Error al crear especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear especialidad" });
  }
});

router.put("/especialidades/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const descripcion = String(req.body?.descripcion || "").trim();
    const permiteMultiplesPorSeccion = !!req.body?.permiteMultiplesPorSeccion;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!descripcion) {
      return badRequest(res, "La descripción es obligatoria");
    }

    const pool = await getPool();

    const duplicada = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 EspecialidadId
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
          AND EspecialidadId <> @id
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otra especialidad con esa descripción" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .input("permiteMultiplesPorSeccion", sql.Bit, permiteMultiplesPorSeccion)
      .query(`
        UPDATE dbo.Especialidad
        SET
          Descripcion = @descripcion,
          PermiteMultiplesPorSeccion = @permiteMultiplesPorSeccion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE EspecialidadId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Especialidad no encontrada" });
    }

    return ok(res, result.recordset[0], "Especialidad actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar especialidad" });
  }
});

router.delete("/especialidades/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Especialidad
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.EspecialidadId
        WHERE EspecialidadId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Especialidad no encontrada" });
    }

    return ok(res, { EspecialidadId: id }, "Especialidad desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar especialidad" });
  }
});

router.patch("/especialidades/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Especialidad
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE EspecialidadId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Especialidad no encontrada" });
    }

    return ok(res, result.recordset[0], "Especialidad reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar especialidad" });
  }
});

/* =========================================================
   SUB ESPECIALIDADES
   ========================================================= */
router.get("/subespecialidades", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const especialidadId = req.query.especialidadId ? Number(req.query.especialidadId) : null;
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    if (especialidadId !== null && !isValidPositiveId(especialidadId)) {
      return badRequest(res, "Id de especialidad invÃ¡lido");
    }

    const pool = await getPool();
    await ensureSubEspecialidadTable(pool);

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("especialidadId", sql.Int, especialidadId)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .query(`
        SELECT
          se.SubEspecialidadId,
          se.InstitucionId,
          se.EspecialidadId,
          e.Descripcion AS EspecialidadDescripcion,
          se.Descripcion,
          se.Activo,
          se.CreatedAt,
          se.UpdatedAt
        FROM dbo.SubEspecialidad se
        INNER JOIN dbo.Especialidad e
          ON e.EspecialidadId = se.EspecialidadId
          AND e.InstitucionId = se.InstitucionId
        WHERE se.InstitucionId = @institucionId
          AND (@incluirInactivas = 1 OR se.Activo = 1)
          AND (@especialidadId IS NULL OR se.EspecialidadId = @especialidadId)
          AND (
            @q = '%%'
            OR se.Descripcion LIKE @q
            OR e.Descripcion LIKE @q
          )
        ORDER BY e.Descripcion, se.Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar sub especialidades:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar sub especialidades" });
  }
});

router.post("/subespecialidades", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const especialidadId = Number(req.body?.especialidadId);
    const descripcion = String(req.body?.descripcion || "").trim();

    if (!isValidPositiveId(especialidadId)) {
      return badRequest(res, "La especialidad es obligatoria");
    }

    if (!descripcion) {
      return badRequest(res, "La descripciÃ³n de la sub especialidad es obligatoria");
    }

    const pool = await getPool();
    await ensureSubEspecialidadTable(pool);

    const especialidad = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .query(`
        SELECT TOP 1 EspecialidadId
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
          AND EspecialidadId = @especialidadId
          AND Activo = 1
      `);

    if (!especialidad.recordset.length) {
      return res.status(404).json({ ok: false, message: "Especialidad no encontrada o inactiva" });
    }

    const duplicada = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 SubEspecialidadId, Activo
        FROM dbo.SubEspecialidad
        WHERE InstitucionId = @institucionId
          AND EspecialidadId = @especialidadId
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe una sub especialidad con esa descripciÃ³n para la especialidad seleccionada" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        INSERT INTO dbo.SubEspecialidad
        (
          InstitucionId,
          EspecialidadId,
          Descripcion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @especialidadId,
          @descripcion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Sub especialidad creada correctamente");
  } catch (error) {
    console.error("Error al crear sub especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear sub especialidad" });
  }
});

router.put("/subespecialidades/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const especialidadId = Number(req.body?.especialidadId);
    const descripcion = String(req.body?.descripcion || "").trim();

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id invÃ¡lido");
    }

    if (!isValidPositiveId(especialidadId)) {
      return badRequest(res, "La especialidad es obligatoria");
    }

    if (!descripcion) {
      return badRequest(res, "La descripciÃ³n de la sub especialidad es obligatoria");
    }

    const pool = await getPool();
    await ensureSubEspecialidadTable(pool);

    const especialidad = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .query(`
        SELECT TOP 1 EspecialidadId
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
          AND EspecialidadId = @especialidadId
          AND Activo = 1
      `);

    if (!especialidad.recordset.length) {
      return res.status(404).json({ ok: false, message: "Especialidad no encontrada o inactiva" });
    }

    const duplicada = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 SubEspecialidadId
        FROM dbo.SubEspecialidad
        WHERE InstitucionId = @institucionId
          AND EspecialidadId = @especialidadId
          AND SubEspecialidadId <> @id
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otra sub especialidad con esa descripciÃ³n para la especialidad seleccionada" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("especialidadId", sql.Int, especialidadId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        UPDATE dbo.SubEspecialidad
        SET
          EspecialidadId = @especialidadId,
          Descripcion = @descripcion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE SubEspecialidadId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Sub especialidad no encontrada" });
    }

    return ok(res, result.recordset[0], "Sub especialidad actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar sub especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar sub especialidad" });
  }
});

router.delete("/subespecialidades/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id invÃ¡lido");
    }

    const pool = await getPool();
    await ensureSubEspecialidadTable(pool);

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.SubEspecialidad
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.SubEspecialidadId
        WHERE SubEspecialidadId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Sub especialidad no encontrada" });
    }

    return ok(res, { SubEspecialidadId: id }, "Sub especialidad desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar sub especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar sub especialidad" });
  }
});

router.patch("/subespecialidades/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id invÃ¡lido");
    }

    const pool = await getPool();
    await ensureSubEspecialidadTable(pool);

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE se
        SET se.Activo = 1, se.UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.SubEspecialidad se
        INNER JOIN dbo.Especialidad e
          ON e.EspecialidadId = se.EspecialidadId
          AND e.InstitucionId = se.InstitucionId
        WHERE se.SubEspecialidadId = @id
          AND se.InstitucionId = @institucionId
          AND e.Activo = 1
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Sub especialidad no encontrada o especialidad inactiva" });
    }

    return ok(res, result.recordset[0], "Sub especialidad reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar sub especialidad:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar sub especialidad" });
  }
});

/* =========================================================
   TIPOS DE ESTUDIANTE
   ========================================================= */
router.get("/tipos-estudiante", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          TipoEstudianteId,
          InstitucionId,
          Descripcion,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.TipoEstudiante
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Descripcion LIKE @q
          )
        ORDER BY Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar tipos de estudiante:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar tipos de estudiante" });
  }
});

router.get("/consecutivos-config", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    await ensureBoletaConductaConfigTable(pool);
    await ensureCertificacionEstudioConfigTable(pool);
    const anioLectivoVigente = await resolveInstitucionCurrentYear(pool, institucionId);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoVigente", sql.NVarChar(10), anioLectivoVigente)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
        BEGIN
          INSERT INTO dbo.BoletaConductaConfig (InstitucionId, SiguienteNumero, Prefijo, AnioLectivo)
          VALUES (@institucionId, 1, N'BOLETA', @anioLectivoVigente);
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.CertificacionEstudioConfig WHERE InstitucionId = @institucionId)
        BEGIN
          INSERT INTO dbo.CertificacionEstudioConfig (InstitucionId, SiguienteNumero, Prefijo, AnioLectivo, UpdatedAt)
          VALUES (@institucionId, 1, N'CERTIFICACION', @anioLectivoVigente, SYSDATETIME());
        END;

        SELECT TOP 1
          SiguienteNumero,
          ISNULL(NULLIF(LTRIM(RTRIM(Prefijo)), N''), N'BOLETA') AS Prefijo,
          ISNULL(NULLIF(LTRIM(RTRIM(AnioLectivo)), N''), @anioLectivoVigente) AS AnioLectivo
        FROM dbo.BoletaConductaConfig
        WHERE InstitucionId = @institucionId;

        SELECT TOP 1
          SiguienteNumero,
          ISNULL(NULLIF(LTRIM(RTRIM(Prefijo)), N''), N'CERTIFICACION') AS Prefijo,
          ISNULL(NULLIF(LTRIM(RTRIM(AnioLectivo)), N''), @anioLectivoVigente) AS AnioLectivo
        FROM dbo.CertificacionEstudioConfig
        WHERE InstitucionId = @institucionId;
      `);

    const boletas = result.recordsets[0]?.[0] || {};
    const certificaciones = result.recordsets[1]?.[0] || {};
    return ok(res, {
      boletas: {
        prefijo: String(boletas.Prefijo || "BOLETA"),
        siguienteNumero: Number(boletas.SiguienteNumero || 1),
        anioLectivo: String(boletas.AnioLectivo || anioLectivoVigente),
        ejemploCodigo: buildConsecutivoCodigo(String(boletas.Prefijo || "BOLETA"), Number(boletas.SiguienteNumero || 1), String(boletas.AnioLectivo || anioLectivoVigente))
      },
      certificaciones: {
        prefijo: String(certificaciones.Prefijo || "CERTIFICACION"),
        siguienteNumero: Number(certificaciones.SiguienteNumero || 1),
        anioLectivo: String(certificaciones.AnioLectivo || anioLectivoVigente),
        ejemploCodigo: buildConsecutivoCodigo(String(certificaciones.Prefijo || "CERTIFICACION"), Number(certificaciones.SiguienteNumero || 1), String(certificaciones.AnioLectivo || anioLectivoVigente))
      }
    });
  } catch (error) {
    console.error("Error cargando configuración de consecutivos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la configuración de consecutivos" });
  }
});

router.put("/consecutivos-config", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const tipo = String(req.body?.tipo || "").trim().toUpperCase();
    const prefijo = String(req.body?.prefijo || "").trim();
    const anioLectivo = String(req.body?.anioLectivo || "").trim();
    const siguienteNumero = Number(req.body?.siguienteNumero || 0);
    if (!["BOLETA", "CERTIFICACION"].includes(tipo)) {
      return badRequest(res, "Tipo de consecutivo inválido");
    }
    if (!prefijo) return badRequest(res, "Debés indicar el dato del colegio o prefijo");
    if (!Number.isInteger(siguienteNumero) || siguienteNumero <= 0) {
      return badRequest(res, "El consecutivo inicial debe ser un número entero mayor a 0");
    }
    if (!/^\d{4}$/.test(anioLectivo)) {
      return badRequest(res, "Debés indicar un año lectivo válido de 4 dígitos");
    }
    const pool = await getPool();
    await ensureBoletaConductaConfigTable(pool);
    await ensureCertificacionEstudioConfigTable(pool);
    if (tipo === "BOLETA") {
      await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("prefijo", sql.NVarChar(80), prefijo)
        .input("siguienteNumero", sql.Int, siguienteNumero)
        .input("anioLectivo", sql.NVarChar(10), anioLectivo)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.BoletaConductaConfig WHERE InstitucionId = @institucionId)
          BEGIN
            UPDATE dbo.BoletaConductaConfig
            SET Prefijo = @prefijo,
                SiguienteNumero = @siguienteNumero,
                AnioLectivo = @anioLectivo,
                UpdatedAt = SYSDATETIME()
            WHERE InstitucionId = @institucionId
          END
          ELSE
          BEGIN
            INSERT INTO dbo.BoletaConductaConfig (InstitucionId, Prefijo, SiguienteNumero, AnioLectivo, UpdatedAt)
            VALUES (@institucionId, @prefijo, @siguienteNumero, @anioLectivo, SYSDATETIME())
          END
        `);
    } else {
      await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("prefijo", sql.NVarChar(80), prefijo)
        .input("siguienteNumero", sql.Int, siguienteNumero)
        .input("anioLectivo", sql.NVarChar(10), anioLectivo)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.CertificacionEstudioConfig WHERE InstitucionId = @institucionId)
          BEGIN
            UPDATE dbo.CertificacionEstudioConfig
            SET Prefijo = @prefijo,
                SiguienteNumero = @siguienteNumero,
                AnioLectivo = @anioLectivo,
                UpdatedAt = SYSDATETIME()
            WHERE InstitucionId = @institucionId
          END
          ELSE
          BEGIN
            INSERT INTO dbo.CertificacionEstudioConfig (InstitucionId, Prefijo, SiguienteNumero, AnioLectivo, UpdatedAt)
            VALUES (@institucionId, @prefijo, @siguienteNumero, @anioLectivo, SYSDATETIME())
          END
        `);
    }
    return ok(res, {
      tipo,
      prefijo,
      siguienteNumero,
      anioLectivo,
      ejemploCodigo: buildConsecutivoCodigo(prefijo, siguienteNumero, anioLectivo)
    }, "Consecutivo actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando configuración de consecutivos:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la configuración de consecutivos" });
  }
});

router.post("/tipos-estudiante", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const descripcion = String(req.body?.descripcion || "").trim();
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 TipoEstudianteId
        FROM dbo.TipoEstudiante
        WHERE InstitucionId = @institucionId
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe un tipo de estudiante con esa descripción" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        INSERT INTO dbo.TipoEstudiante
        (
          InstitucionId,
          Descripcion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @descripcion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Tipo de estudiante creado correctamente");
  } catch (error) {
    console.error("Error al crear tipo de estudiante:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear tipo de estudiante" });
  }
});

router.put("/tipos-estudiante/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const descripcion = String(req.body?.descripcion || "").trim();
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicado = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 TipoEstudianteId
        FROM dbo.TipoEstudiante
        WHERE InstitucionId = @institucionId
          AND TipoEstudianteId <> @id
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otro tipo de estudiante con esa descripción" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        UPDATE dbo.TipoEstudiante
        SET
          Descripcion = @descripcion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE TipoEstudianteId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de estudiante no encontrado" });
    }
    return ok(res, result.recordset[0], "Tipo de estudiante actualizado correctamente");
  } catch (error) {
    console.error("Error al actualizar tipo de estudiante:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar tipo de estudiante" });
  }
});

router.delete("/tipos-estudiante/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.TipoEstudiante
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.TipoEstudianteId
        WHERE TipoEstudianteId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de estudiante no encontrado" });
    }
    return ok(res, { TipoEstudianteId: id }, "Tipo de estudiante desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar tipo de estudiante:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar tipo de estudiante" });
  }
});

router.patch("/tipos-estudiante/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.TipoEstudiante
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE TipoEstudianteId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de estudiante no encontrado" });
    }
    return ok(res, result.recordset[0], "Tipo de estudiante reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar tipo de estudiante:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar tipo de estudiante" });
  }
});

/* =========================================================
   TIPOS DE ADECUACION
   ========================================================= */
router.get("/tipos-adecuacion", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          TipoAdecuacionId,
          InstitucionId,
          Descripcion,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.TipoAdecuacion
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Descripcion LIKE @q
          )
        ORDER BY Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar tipos de adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar tipos de adecuación" });
  }
});

router.post("/tipos-adecuacion", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const descripcion = String(req.body?.descripcion || "").trim();
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 TipoAdecuacionId
        FROM dbo.TipoAdecuacion
        WHERE InstitucionId = @institucionId
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe un tipo de adecuación con esa descripción" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        INSERT INTO dbo.TipoAdecuacion
        (
          InstitucionId,
          Descripcion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @descripcion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Tipo de adecuación creado correctamente");
  } catch (error) {
    console.error("Error al crear tipo de adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear tipo de adecuación" });
  }
});

router.put("/tipos-adecuacion/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const descripcion = String(req.body?.descripcion || "").trim();
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicado = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 TipoAdecuacionId
        FROM dbo.TipoAdecuacion
        WHERE InstitucionId = @institucionId
          AND TipoAdecuacionId <> @id
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otro tipo de adecuación con esa descripción" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        UPDATE dbo.TipoAdecuacion
        SET
          Descripcion = @descripcion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE TipoAdecuacionId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de adecuación no encontrado" });
    }
    return ok(res, result.recordset[0], "Tipo de adecuación actualizado correctamente");
  } catch (error) {
    console.error("Error al actualizar tipo de adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar tipo de adecuación" });
  }
});

router.delete("/tipos-adecuacion/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.TipoAdecuacion
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.TipoAdecuacionId
        WHERE TipoAdecuacionId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de adecuación no encontrado" });
    }
    return ok(res, { TipoAdecuacionId: id }, "Tipo de adecuación desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar tipo de adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar tipo de adecuación" });
  }
});

router.patch("/tipos-adecuacion/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.TipoAdecuacion
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE TipoAdecuacionId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Tipo de adecuación no encontrado" });
    }
    return ok(res, result.recordset[0], "Tipo de adecuación reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar tipo de adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar tipo de adecuación" });
  }
});

/* =========================================================
   ADECUACIONES
   ========================================================= */
router.get("/adecuaciones", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          a.AdecuacionCatalogoId,
          a.InstitucionId,
          a.TipoAdecuacionId,
          ta.Descripcion AS Adecuacion,
          a.Tipo,
          a.Descripcion,
          a.Activo,
          a.CreatedAt,
          a.UpdatedAt
        FROM dbo.AdecuacionCatalogo a
        INNER JOIN dbo.TipoAdecuacion ta
          ON ta.TipoAdecuacionId = a.TipoAdecuacionId
        WHERE a.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR a.Activo = 1)
          AND (
            @q = '%%'
            OR ta.Descripcion LIKE @q
            OR a.Tipo LIKE @q
            OR a.Descripcion LIKE @q
          )
        ORDER BY ta.Descripcion, a.Tipo, a.Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar adecuaciones:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar adecuaciones" });
  }
});

router.post("/adecuaciones", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const tipoAdecuacionId = Number(req.body?.tipoAdecuacionId || 0);
    const tipo = String(req.body?.tipo || "").trim();
    const descripcion = String(req.body?.descripcion || "").trim();

    if (!isValidNonNegativeId(tipoAdecuacionId)) return badRequest(res, "tipoAdecuacionId es obligatorio");
    if (!tipo || !descripcion) return badRequest(res, "tipo y descripcion son obligatorios");

    const pool = await getPool();
    const tipoAdecuacion = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoAdecuacionId", sql.Int, tipoAdecuacionId)
      .query(`
        SELECT TOP 1 TipoAdecuacionId
        FROM dbo.TipoAdecuacion
        WHERE InstitucionId = @institucionId
          AND TipoAdecuacionId = @tipoAdecuacionId
      `);
    if (!tipoAdecuacion.recordset.length) {
      return res.status(404).json({ ok: false, message: "La adecuación seleccionada no existe" });
    }

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoAdecuacionId", sql.Int, tipoAdecuacionId)
      .input("tipo", sql.NVarChar, tipo)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 AdecuacionCatalogoId
        FROM dbo.AdecuacionCatalogo
        WHERE InstitucionId = @institucionId
          AND TipoAdecuacionId = @tipoAdecuacionId
          AND UPPER(LTRIM(RTRIM(Tipo))) = UPPER(LTRIM(RTRIM(@tipo)))
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe una adecuación con esa combinación" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("tipoAdecuacionId", sql.Int, tipoAdecuacionId)
      .input("tipo", sql.NVarChar, tipo)
      .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
      .query(`
        INSERT INTO dbo.AdecuacionCatalogo
        (
          InstitucionId,
          TipoAdecuacionId,
          Tipo,
          Descripcion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @tipoAdecuacionId,
          @tipo,
          @descripcion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Adecuación creada correctamente");
  } catch (error) {
    console.error("Error al crear adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear la adecuación" });
  }
});

router.put("/adecuaciones/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const tipoAdecuacionId = Number(req.body?.tipoAdecuacionId || 0);
    const tipo = String(req.body?.tipo || "").trim();
    const descripcion = String(req.body?.descripcion || "").trim();

    if (!isValidNonNegativeId(tipoAdecuacionId)) return badRequest(res, "tipoAdecuacionId es obligatorio");
    if (!tipo || !descripcion) return badRequest(res, "tipo y descripcion son obligatorios");

    const pool = await getPool();
    const duplicado = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("tipoAdecuacionId", sql.Int, tipoAdecuacionId)
      .input("tipo", sql.NVarChar, tipo)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 AdecuacionCatalogoId
        FROM dbo.AdecuacionCatalogo
        WHERE InstitucionId = @institucionId
          AND AdecuacionCatalogoId <> @id
          AND TipoAdecuacionId = @tipoAdecuacionId
          AND UPPER(LTRIM(RTRIM(Tipo))) = UPPER(LTRIM(RTRIM(@tipo)))
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otra adecuación con esa combinación" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("tipoAdecuacionId", sql.Int, tipoAdecuacionId)
      .input("tipo", sql.NVarChar, tipo)
      .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
      .query(`
        UPDATE dbo.AdecuacionCatalogo
        SET
          TipoAdecuacionId = @tipoAdecuacionId,
          Tipo = @tipo,
          Descripcion = @descripcion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE AdecuacionCatalogoId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Adecuación no encontrada" });
    }
    return ok(res, result.recordset[0], "Adecuación actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar la adecuación" });
  }
});

router.delete("/adecuaciones/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AdecuacionCatalogo
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AdecuacionCatalogoId
        WHERE AdecuacionCatalogoId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Adecuación no encontrada" });
    }
    return ok(res, { AdecuacionCatalogoId: id }, "Adecuación desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar la adecuación" });
  }
});

router.patch("/adecuaciones/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AdecuacionCatalogo
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE AdecuacionCatalogoId = @id
          AND InstitucionId = @institucionId
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Adecuación no encontrada" });
    }
    return ok(res, result.recordset[0], "Adecuación reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar adecuación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar la adecuación" });
  }
});


/* =========================================================
   RUTAS DE TRANSPORTE
   ========================================================= */
router.get("/rutas-transporte", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .query(`
        SELECT
          RutaTransporteId,
          InstitucionId,
          Descripcion,
          Responsable,
          LugarInicio,
          LugarFin,
          CapacidadEstudiantes,
          HoraInicio,
          HoraFin,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.RutaTransporte
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivas = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Descripcion LIKE @q
            OR Responsable LIKE @q
            OR LugarInicio LIKE @q
            OR LugarFin LIKE @q
          )
        ORDER BY Descripcion
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar rutas de transporte:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar rutas de transporte" });
  }
});

router.post("/rutas-transporte", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const descripcion = String(req.body?.descripcion || "").trim();
    const responsable = String(req.body?.responsable || "").trim();
    const lugarInicio = String(req.body?.lugarInicio || "").trim();
    const lugarFin = String(req.body?.lugarFin || "").trim();
    const capacidadEstudiantes = req.body?.capacidadEstudiantes ? Number(req.body.capacidadEstudiantes) : null;
    const horaInicio = req.body?.horaInicio || null;
    const horaFin = req.body?.horaFin || null;

    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicada = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 RutaTransporteId
        FROM dbo.RutaTransporte
        WHERE InstitucionId = @institucionId
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe una ruta con esa descripción" });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .input("responsable", sql.NVarChar, responsable || null)
      .input("lugarInicio", sql.NVarChar, lugarInicio || null)
      .input("lugarFin", sql.NVarChar, lugarFin || null)
      .input("capacidadEstudiantes", sql.Int, capacidadEstudiantes)
      .input("horaInicio", sql.NVarChar, horaInicio)
      .input("horaFin", sql.NVarChar, horaFin)
      .query(`
        INSERT INTO dbo.RutaTransporte
        (
          InstitucionId,
          Descripcion,
          Responsable,
          LugarInicio,
          LugarFin,
          CapacidadEstudiantes,
          HoraInicio,
          HoraFin,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @descripcion,
          @responsable,
          @lugarInicio,
          @lugarFin,
          @capacidadEstudiantes,
          @horaInicio,
          @horaFin,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Ruta de transporte creada correctamente");
  } catch (error) {
    console.error("Error al crear ruta de transporte:", error);
    return res.status(500).json({ ok: false, message: "Error interno al crear ruta de transporte" });
  }
});

router.put("/rutas-transporte/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const descripcion = String(req.body?.descripcion || "").trim();
    const responsable = String(req.body?.responsable || "").trim();
    const lugarInicio = String(req.body?.lugarInicio || "").trim();
    const lugarFin = String(req.body?.lugarFin || "").trim();
    const capacidadEstudiantes = req.body?.capacidadEstudiantes ? Number(req.body.capacidadEstudiantes) : null;
    const horaInicio = req.body?.horaInicio || null;
    const horaFin = req.body?.horaFin || null;

    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const pool = await getPool();
    const duplicada = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        SELECT TOP 1 RutaTransporteId
        FROM dbo.RutaTransporte
        WHERE InstitucionId = @institucionId
          AND RutaTransporteId <> @id
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);

    if (duplicada.recordset.length) {
      return res.status(409).json({ ok: false, message: "Ya existe otra ruta con esa descripción" });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar, descripcion)
      .input("responsable", sql.NVarChar, responsable || null)
      .input("lugarInicio", sql.NVarChar, lugarInicio || null)
      .input("lugarFin", sql.NVarChar, lugarFin || null)
      .input("capacidadEstudiantes", sql.Int, capacidadEstudiantes)
      .input("horaInicio", sql.NVarChar, horaInicio)
      .input("horaFin", sql.NVarChar, horaFin)
      .query(`
        UPDATE dbo.RutaTransporte
        SET
          Descripcion = @descripcion,
          Responsable = @responsable,
          LugarInicio = @lugarInicio,
          LugarFin = @lugarFin,
          CapacidadEstudiantes = @capacidadEstudiantes,
          HoraInicio = @horaInicio,
          HoraFin = @horaFin,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE RutaTransporteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Ruta de transporte no encontrada" });
    }

    return ok(res, result.recordset[0], "Ruta de transporte actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar ruta de transporte:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar ruta de transporte" });
  }
});

router.delete("/rutas-transporte/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.RutaTransporte
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.RutaTransporteId
        WHERE RutaTransporteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Ruta de transporte no encontrada" });
    }

    return ok(res, { RutaTransporteId: id }, "Ruta de transporte desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar ruta de transporte:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar ruta de transporte" });
  }
});

router.patch("/rutas-transporte/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.RutaTransporte
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE RutaTransporteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Ruta de transporte no encontrada" });
    }

    return ok(res, result.recordset[0], "Ruta de transporte reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar ruta de transporte:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar ruta de transporte" });
  }
});

/* =========================================================
   AÑOS LECTIVOS
   ========================================================= */
router.get("/anios-lectivos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          AnioLectivoId,
          Nombre,
          FechaInicio,
          FechaFin,
          Activo
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR CONVERT(NVARCHAR(10), FechaInicio, 23) LIKE @q
            OR CONVERT(NVARCHAR(10), FechaFin, 23) LIKE @q
          )
        ORDER BY FechaInicio DESC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar años lectivos:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar años lectivos"
    });
  }
});

router.post("/anios-lectivos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { nombre, fechaInicio, fechaFin } = req.body;

    if (!nombre || !fechaInicio || !fechaFin) {
      return badRequest(res, "nombre, fechaInicio y fechaFin son obligatorios");
    }

    if (invalidDateRange(fechaInicio, fechaFin)) {
      return badRequest(res, "La fechaInicio no puede ser mayor que la fechaFin");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT TOP 1 AnioLectivoId
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND Nombre = @nombre
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "ANIO_LECTIVO_DUPLICADO",
        message: "Ya existe un año lectivo con ese nombre"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        INSERT INTO dbo.AnioLectivo
        (
          InstitucionId,
          Nombre,
          FechaInicio,
          FechaFin,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @nombre,
          @fechaInicio,
          @fechaFin,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Año lectivo creado correctamente");
  } catch (error: any) {
    console.error("Error al crear año lectivo:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "ANIO_LECTIVO_DUPLICADO",
        message: "Ya existe un año lectivo con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear año lectivo"
    });
  }
});

router.put("/anios-lectivos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { nombre, fechaInicio, fechaFin } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre || !fechaInicio || !fechaFin) {
      return badRequest(res, "nombre, fechaInicio y fechaFin son obligatorios");
    }

    if (invalidDateRange(fechaInicio, fechaFin)) {
      return badRequest(res, "La fechaInicio no puede ser mayor que la fechaFin");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 AnioLectivoId
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND Nombre = @nombre
          AND AnioLectivoId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "ANIO_LECTIVO_DUPLICADO",
        message: "Ya existe otro año lectivo con ese nombre"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        UPDATE dbo.AnioLectivo
        SET
          Nombre = @nombre,
          FechaInicio = @fechaInicio,
          FechaFin = @fechaFin,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE AnioLectivoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Año lectivo no encontrado"
      });
    }

    return ok(res, result.recordset[0], "Año lectivo actualizado correctamente");
  } catch (error: any) {
    console.error("Error al actualizar año lectivo:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "ANIO_LECTIVO_DUPLICADO",
        message: "Ya existe otro año lectivo con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar año lectivo"
    });
  }
});

router.delete("/anios-lectivos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AnioLectivo
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AnioLectivoId
        WHERE AnioLectivoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Año lectivo no encontrado"
      });
    }

    return ok(res, { AnioLectivoId: id }, "Año lectivo desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar año lectivo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar año lectivo"
    });
  }
});

router.patch("/anios-lectivos/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AnioLectivo
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AnioLectivoId
        WHERE AnioLectivoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Año lectivo no encontrado"
      });
    }

    return ok(res, { AnioLectivoId: id }, "Año lectivo reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar año lectivo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar año lectivo"
    });
  }
});

/* =========================================================
   PERIODOS
   ========================================================= */
router.get("/periodos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          p.PeriodoId,
          p.AnioLectivoId,
          p.Nombre,
          p.NumeroOrden,
          p.FechaInicio,
          p.FechaFin,
          p.Activo,
          a.Nombre AS AnioNombre
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE a.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR p.Activo = 1)
          AND (
            @q = '%%'
            OR p.Nombre LIKE @q
            OR a.Nombre LIKE @q
            OR CAST(p.NumeroOrden AS NVARCHAR(10)) LIKE @q
          )
        ORDER BY a.FechaInicio DESC, p.NumeroOrden ASC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar periodos:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar periodos"
    });
  }
});

router.post("/periodos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { anioLectivoId, nombre, numeroOrden, fechaInicio, fechaFin } = req.body;

    if (!isValidNonNegativeId(anioLectivoId) || !nombre || !isValidNonNegativeId(numeroOrden) || !fechaInicio || !fechaFin) {
      return badRequest(res, "anioLectivoId, nombre, numeroOrden, fechaInicio y fechaFin son obligatorios");
    }

    if (invalidDateRange(fechaInicio, fechaFin)) {
      return badRequest(res, "La fechaInicio no puede ser mayor que la fechaFin");
    }

    const pool = await getPool();

    const anioValido = await pool.request()
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 AnioLectivoId
        FROM dbo.AnioLectivo
        WHERE AnioLectivoId = @anioLectivoId
          AND InstitucionId = @institucionId
      `);

    if (!anioValido.recordset.length) {
      return badRequest(res, "El año lectivo no pertenece a la institución");
    }

    const duplicado = await pool.request()
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("numeroOrden", sql.Int, Number(numeroOrden))
      .query(`
        SELECT TOP 1 PeriodoId
        FROM dbo.Periodo
        WHERE AnioLectivoId = @anioLectivoId
          AND (Nombre = @nombre OR NumeroOrden = @numeroOrden)
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "PERIODO_DUPLICADO",
        message: "Ya existe un período con ese nombre o número de orden en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("numeroOrden", sql.Int, Number(numeroOrden))
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        INSERT INTO dbo.Periodo
        (
          AnioLectivoId,
          Nombre,
          NumeroOrden,
          FechaInicio,
          FechaFin,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @anioLectivoId,
          @nombre,
          @numeroOrden,
          @fechaInicio,
          @fechaFin,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Período creado correctamente");
  } catch (error: any) {
    console.error("Error al crear período:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "PERIODO_DUPLICADO",
        message: "Ya existe un período con ese nombre o número de orden en ese año lectivo"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear período"
    });
  }
});

router.put("/periodos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { anioLectivoId, nombre, numeroOrden, fechaInicio, fechaFin } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(anioLectivoId) || !nombre || !isValidNonNegativeId(numeroOrden) || !fechaInicio || !fechaFin) {
      return badRequest(res, "anioLectivoId, nombre, numeroOrden, fechaInicio y fechaFin son obligatorios");
    }

    if (invalidDateRange(fechaInicio, fechaFin)) {
      return badRequest(res, "La fechaInicio no puede ser mayor que la fechaFin");
    }

    const pool = await getPool();

    const anioValido = await pool.request()
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 AnioLectivoId
        FROM dbo.AnioLectivo
        WHERE AnioLectivoId = @anioLectivoId
          AND InstitucionId = @institucionId
      `);

    if (!anioValido.recordset.length) {
      return badRequest(res, "El año lectivo no pertenece a la institución");
    }

    const duplicado = await pool.request()
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("numeroOrden", sql.Int, Number(numeroOrden))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 PeriodoId
        FROM dbo.Periodo
        WHERE AnioLectivoId = @anioLectivoId
          AND (Nombre = @nombre OR NumeroOrden = @numeroOrden)
          AND PeriodoId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "PERIODO_DUPLICADO",
        message: "Ya existe otro período con ese nombre o número de orden en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("numeroOrden", sql.Int, Number(numeroOrden))
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .query(`
        UPDATE p
        SET
          p.AnioLectivoId = @anioLectivoId,
          p.Nombre = @nombre,
          p.NumeroOrden = @numeroOrden,
          p.FechaInicio = @fechaInicio,
          p.FechaFin = @fechaFin,
          p.UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @id
          AND a.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Período no encontrado"
      });
    }

    return ok(res, result.recordset[0], "Período actualizado correctamente");
  } catch (error: any) {
    console.error("Error al actualizar período:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "PERIODO_DUPLICADO",
        message: "Ya existe otro período con ese nombre o número de orden en ese año lectivo"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar período"
    });
  }
});

router.delete("/periodos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE p
        SET
          p.Activo = 0,
          p.UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.PeriodoId
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @id
          AND a.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Período no encontrado"
      });
    }

    return ok(res, { PeriodoId: id }, "Período desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar período:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar período"
    });
  }
});

router.patch("/periodos/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE p
        SET
          p.Activo = 1,
          p.UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.PeriodoId
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @id
          AND a.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Período no encontrado"
      });
    }

    await pool.request()
      .input("id", sql.Int, id)
      .input("usuarioRegistroId", sql.Int, Number(req.auth?.userId ?? req.auth?.usuarioId ?? 0) || null)
      .query(`
        IF OBJECT_ID(N'dbo.ProfesorPeriodoEstado', N'U') IS NOT NULL
           AND OBJECT_ID(N'dbo.ProfesorPeriodoEstadoHistorial', N'U') IS NOT NULL
        BEGIN
          INSERT INTO dbo.ProfesorPeriodoEstadoHistorial
            (InstitucionId, UsuarioId, AnioLectivoId, PeriodoId, Habilitado, Origen, UsuarioRegistroId)
          SELECT
            ppe.InstitucionId,
            ppe.UsuarioId,
            ppe.AnioLectivoId,
            ppe.PeriodoId,
            1,
            N'REACTIVACION_PERIODO',
            @usuarioRegistroId
          FROM dbo.ProfesorPeriodoEstado ppe
          WHERE ppe.PeriodoId = @id
            AND ppe.Habilitado = 0;

          UPDATE dbo.ProfesorPeriodoEstado
          SET Habilitado = 1,
              UsuarioRegistroId = @usuarioRegistroId,
              UpdatedAt = SYSDATETIME()
          WHERE PeriodoId = @id
            AND Habilitado = 0;
        END;
      `);
    bumpProfesorPeriodoEstadosVersion();

    return ok(res, { PeriodoId: id }, "Período reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar período:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar período"
    });
  }
});

/* =========================================================
   GRUPOS
   ========================================================= */
router.get("/grupos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          g.GrupoId,
          g.AnioLectivoId,
          g.Nombre,
          g.Nivel,
          g.NivelAcademico,
          g.Jornada,
          g.Activo,
          a.Nombre AS AnioNombre
        FROM dbo.Grupo g
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = g.AnioLectivoId
        WHERE g.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR g.Activo = 1)
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR g.Jornada LIKE @q
            OR a.Nombre LIKE @q
          )
        ORDER BY g.GrupoId DESC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar grupos:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar grupos"
    });
  }
});

router.post("/grupos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { anioLectivoId, nombre, nivel, jornada } = req.body;

    if (!isValidNonNegativeId(anioLectivoId) || !nombre) {
      return badRequest(res, "anioLectivoId y nombre son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT TOP 1 GrupoId
        FROM dbo.Grupo
        WHERE InstitucionId = @institucionId
          AND AnioLectivoId = @anioLectivoId
          AND Nombre = @nombre
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_DUPLICADO",
        message: "Ya existe un grupo con ese nombre en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("nivel", sql.NVarChar, nivel || null)
      .input("jornada", sql.NVarChar, jornada || null)
      .query(`
        INSERT INTO dbo.Grupo
        (
          InstitucionId,
          SedeId,
          AnioLectivoId,
          Nombre,
          Nivel,
          Jornada,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          NULL,
          @anioLectivoId,
          @nombre,
          @nivel,
          @jornada,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Grupo creado correctamente");
  } catch (error: any) {
    console.error("Error al crear grupo:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_DUPLICADO",
        message: "Ya existe un grupo con ese nombre en ese año lectivo"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear grupo"
    });
  }
});

router.put("/grupos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { anioLectivoId, nombre, nivel, jornada } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(anioLectivoId) || !nombre) {
      return badRequest(res, "anioLectivoId y nombre son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 GrupoId
        FROM dbo.Grupo
        WHERE InstitucionId = @institucionId
          AND AnioLectivoId = @anioLectivoId
          AND Nombre = @nombre
          AND GrupoId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_DUPLICADO",
        message: "Ya existe otro grupo con ese nombre en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("nombre", sql.NVarChar, nombre)
      .input("nivel", sql.NVarChar, nivel || null)
      .input("jornada", sql.NVarChar, jornada || null)
      .query(`
        UPDATE dbo.Grupo
        SET
          AnioLectivoId = @anioLectivoId,
          Nombre = @nombre,
          Nivel = @nivel,
          Jornada = @jornada,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE GrupoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Grupo no encontrado"
      });
    }

    return ok(res, result.recordset[0], "Grupo actualizado correctamente");
  } catch (error: any) {
    console.error("Error al actualizar grupo:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_DUPLICADO",
        message: "Ya existe otro grupo con ese nombre en ese año lectivo"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar grupo"
    });
  }
});

router.delete("/grupos/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Grupo
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoId
        WHERE GrupoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Grupo no encontrado"
      });
    }

    return ok(res, { GrupoId: id }, "Grupo desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar grupo"
    });
  }
});

router.patch("/grupos/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Grupo
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoId
        WHERE GrupoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Grupo no encontrado"
      });
    }

    return ok(res, { GrupoId: id }, "Grupo reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar grupo"
    });
  }
});

/* =========================================================
   MATERIAS
   ========================================================= */
router.get("/materias", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const pool = await getPool();
    const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .query(`
        SELECT
          MateriaId,
          InstitucionId,
          Codigo,
          Nombre,
          Descripcion,
          ${materiaEspecialSelectSql(hasEsMateriaEspecial)} AS EsMateriaEspecial,
          Activa AS Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.Materia
        WHERE (InstitucionId = @institucionId OR EsGlobal = 1)
          AND (@incluirInactivas = 1 OR Activa = 1)
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR Codigo LIKE @q
            OR Descripcion LIKE @q
          )
        ORDER BY Nombre
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar materias:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar materias"
    });
  }
});

router.post("/materias", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { nombre, codigo, descripcion, esMateriaEspecial } = req.body;

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const pool = await getPool();
    const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("codigo", sql.NVarChar, codigo || null)
      .query(`
        SELECT TOP 1 MateriaId
        FROM dbo.Materia
        WHERE (InstitucionId = @institucionId OR EsGlobal = 1)
          AND (Nombre = @nombre OR (@codigo IS NOT NULL AND Codigo = @codigo))
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATERIA_DUPLICADA",
        message: "Ya existe una materia con ese nombre o código"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("codigo", sql.NVarChar, codigo || null)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion || null)
      .input("esMateriaEspecial", sql.Bit, esMateriaEspecial ? 1 : 0)
      .query(hasEsMateriaEspecial
        ? `
            INSERT INTO dbo.Materia
            (
              InstitucionId,
              Codigo,
              Nombre,
              Descripcion,
              EsMateriaEspecial,
              Activa,
              CreatedAt
            )
            OUTPUT
              INSERTED.MateriaId,
              INSERTED.InstitucionId,
              INSERTED.Codigo,
              INSERTED.Nombre,
              INSERTED.Descripcion,
              CAST(ISNULL(INSERTED.EsMateriaEspecial, 0) AS BIT) AS EsMateriaEspecial,
              INSERTED.Activa AS Activo,
              INSERTED.CreatedAt,
              INSERTED.UpdatedAt
            VALUES
            (
              @institucionId,
              @codigo,
              @nombre,
              @descripcion,
              @esMateriaEspecial,
              1,
              SYSDATETIME()
            )
          `
        : `
            INSERT INTO dbo.Materia
            (
              InstitucionId,
              Codigo,
              Nombre,
              Descripcion,
              Activa,
              CreatedAt
            )
            OUTPUT
              INSERTED.MateriaId,
              INSERTED.InstitucionId,
              INSERTED.Codigo,
              INSERTED.Nombre,
              INSERTED.Descripcion,
              CAST(0 AS BIT) AS EsMateriaEspecial,
              INSERTED.Activa AS Activo,
              INSERTED.CreatedAt,
              INSERTED.UpdatedAt
            VALUES
            (
              @institucionId,
              @codigo,
              @nombre,
              @descripcion,
              1,
              SYSDATETIME()
            )
          `);

    return created(res, result.recordset[0], "Materia creada correctamente");
  } catch (error: any) {
    console.error("Error al crear materia:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "MATERIA_DUPLICADA",
        message: "Ya existe una materia con ese nombre o código"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear materia"
    });
  }
});

router.put("/materias/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { nombre, codigo, descripcion, esMateriaEspecial } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const pool = await getPool();
    const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("codigo", sql.NVarChar, codigo || null)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MateriaId
        FROM dbo.Materia
        WHERE InstitucionId = @institucionId
          AND MateriaId <> @id
          AND (Nombre = @nombre OR (@codigo IS NOT NULL AND Codigo = @codigo))
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATERIA_DUPLICADA",
        message: "Ya existe otra materia con ese nombre o código"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("codigo", sql.NVarChar, codigo || null)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion || null)
      .input("esMateriaEspecial", sql.Bit, esMateriaEspecial ? 1 : 0)
      .query(hasEsMateriaEspecial
        ? `
            UPDATE dbo.Materia
            SET
              Codigo = @codigo,
              Nombre = @nombre,
              Descripcion = @descripcion,
              EsMateriaEspecial = @esMateriaEspecial,
              UpdatedAt = SYSDATETIME()
            OUTPUT
              INSERTED.MateriaId,
              INSERTED.InstitucionId,
              INSERTED.Codigo,
              INSERTED.Nombre,
              INSERTED.Descripcion,
              CAST(ISNULL(INSERTED.EsMateriaEspecial, 0) AS BIT) AS EsMateriaEspecial,
              INSERTED.Activa AS Activo,
              INSERTED.CreatedAt,
              INSERTED.UpdatedAt
            WHERE MateriaId = @id
              AND InstitucionId = @institucionId
          `
        : `
            UPDATE dbo.Materia
            SET
              Codigo = @codigo,
              Nombre = @nombre,
              Descripcion = @descripcion,
              UpdatedAt = SYSDATETIME()
            OUTPUT
              INSERTED.MateriaId,
              INSERTED.InstitucionId,
              INSERTED.Codigo,
              INSERTED.Nombre,
              INSERTED.Descripcion,
              CAST(0 AS BIT) AS EsMateriaEspecial,
              INSERTED.Activa AS Activo,
              INSERTED.CreatedAt,
              INSERTED.UpdatedAt
            WHERE MateriaId = @id
              AND InstitucionId = @institucionId
          `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Materia actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar materia:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "MATERIA_DUPLICADA",
        message: "Ya existe otra materia con ese nombre o código"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar materia"
    });
  }
});

router.delete("/materias/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Materia
        SET
          Activa = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MateriaId
        WHERE MateriaId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia no encontrada"
      });
    }

    return ok(res, { MateriaId: id }, "Materia desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar materia:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar materia"
    });
  }
});

router.patch("/materias/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Materia
        SET
          Activa = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MateriaId
        WHERE MateriaId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia no encontrada"
      });
    }

    return ok(res, { MateriaId: id }, "Materia reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar materia:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar materia"
    });
  }
});


async function getGrupoInfoParaMatricula(params: {
  pool: any;
  institucionId: number;
  grupoId: number;
  anioLectivoId: number;
}) {
  const { pool, institucionId, grupoId, anioLectivoId } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .query(`
      SELECT TOP 1
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico,
        g.Especialidad,
        g.AnioLectivoId
      FROM dbo.Grupo g
      WHERE g.GrupoId = @grupoId
        AND g.AnioLectivoId = @anioLectivoId
        AND g.Activo = 1
        AND g.InstitucionId = @institucionId
    `);

  return result.recordset[0] || null;
}


async function getEspecialidadInfoParaMatricula(params: {
  pool: any;
  institucionId: number;
  especialidadId?: number | null;
}) {
  const { pool, institucionId, especialidadId } = params;

  if (!especialidadId) return null;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("especialidadId", sql.Int, especialidadId)
    .query(`
      SELECT TOP 1
        EspecialidadId,
        Descripcion,
        PermiteMultiplesPorSeccion,
        Activo
      FROM dbo.Especialidad
      WHERE EspecialidadId = @especialidadId
        AND InstitucionId = @institucionId
        AND Activo = 1
    `);

  return result.recordset[0] || null;
}

async function getUltimaMatriculaHistorica(params: {
  pool: any;
  institucionId: number;
  estudianteId: number;
  anioLectivoIdActual: number;
}) {
  const { pool, institucionId, estudianteId, anioLectivoIdActual } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("anioLectivoIdActual", sql.Int, anioLectivoIdActual)
    .query(`
      SELECT TOP 1
        m.MatriculaId,
        m.AnioLectivoId,
        m.Estado,
        m.FechaMatricula,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico,
        md.MatriculaDetalleId,
        md.EsRepitente
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = m.GrupoId
      LEFT JOIN dbo.MatriculaDetalle md
        ON md.MatriculaId = m.MatriculaId
      WHERE e.InstitucionId = @institucionId
        AND m.EstudianteId = @estudianteId
        AND m.AnioLectivoId < @anioLectivoIdActual
      ORDER BY
        m.AnioLectivoId DESC,
        m.MatriculaId DESC
    `);

  return result.recordset[0] || null;
}

function validarProgresionAcademica(params: {
  nivelAnterior: number | null;
  nivelNuevo: number | null;
  esRepitente: boolean;
  permiteExcepcionProgresion: boolean;
  justificacionExcepcion?: string | null;
}) {
  const {
    nivelAnterior,
    nivelNuevo,
    esRepitente,
    permiteExcepcionProgresion,
    justificacionExcepcion
  } = params;

  if (!nivelNuevo || !nivelAnterior) {
    return {
      permitido: true,
      motivo: null
    };
  }

  if (nivelNuevo === nivelAnterior) {
    if (esRepitente) {
      return {
        permitido: true,
        motivo: "REPITENCIA_PERMITIDA"
      };
    }

    return {
      permitido: false,
      motivo: "REQUIERE_MARCAR_REPITENTE",
      message: `El estudiante viene del nivel ${nivelAnterior}. Para volver a matricularlo en el mismo nivel debés marcarlo como repitente`
    };
  }

  if (nivelNuevo === nivelAnterior + 1) {
    return {
      permitido: true,
      motivo: "PROGRESION_NORMAL"
    };
  }

  if (permiteExcepcionProgresion) {
    if (!String(justificacionExcepcion || "").trim()) {
      return {
        permitido: false,
        motivo: "JUSTIFICACION_OBLIGATORIA",
        message: "Debés indicar una justificación para permitir una excepción en la progresión académica"
      };
    }

    return {
      permitido: true,
      motivo: "EXCEPCION_AUTORIZADA"
    };
  }

  return {
    permitido: false,
    motivo: "PROGRESION_INVALIDA",
    message: `No se permite matricular al estudiante en el nivel ${nivelNuevo} si su último nivel registrado fue ${nivelAnterior}. El siguiente nivel esperado sería ${nivelAnterior + 1}, salvo repitencia o excepción con justificación`
  };
}

type MatriculaImportPayload = {
  fila: number;
  cedula: string;
  seccion: string;
  fechaMatricula?: string | null;
  tipoMatricula?: string | null;
  especialidad?: string | null;
  observacion?: string | null;
  esRepitente: boolean;
  permiteExcepcionProgresion: boolean;
  justificacionExcepcion?: string | null;
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

type MatriculaImportJobStatus = "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";

type MatriculaImportJob = {
  id: string;
  institucionId: number;
  usuarioId: number | null;
  anioLectivoId: number;
  status: MatriculaImportJobStatus;
  totalRegistros: number;
  procesados: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalActualizados: number;
  totalReactivados: number;
  totalOmitidos: number;
  resultados: MatriculaImportResultRow[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const matriculaImportJobs = new Map<string, MatriculaImportJob>();
const MATRICULA_IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

function normalizeImportHeader(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_.-]+/g, "");
}

function getImportValue(row: any, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeImportHeader);
  const entry = Object.entries(row || {}).find(([key]) =>
    normalizedAliases.includes(normalizeImportHeader(key))
  );
  return entry ? entry[1] : "";
}

function toImportString(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNullableImportString(value: any) {
  const text = toImportString(value);
  return text || null;
}

function toImportBoolean(value: any) {
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["si", "s", "true", "1", "x", "yes"].includes(text);
}

function cleanupMatriculaImportJobs() {
  const now = Date.now();
  for (const [id, job] of matriculaImportJobs.entries()) {
    if (now - job.updatedAt > MATRICULA_IMPORT_JOB_TTL_MS) {
      matriculaImportJobs.delete(id);
    }
  }
}

function createMatriculaImportJob(params: {
  institucionId: number;
  usuarioId: number | null;
  anioLectivoId: number;
  totalRegistros: number;
}) {
  cleanupMatriculaImportJobs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: MatriculaImportJob = {
    id,
    institucionId: params.institucionId,
    usuarioId: params.usuarioId,
    anioLectivoId: params.anioLectivoId,
    status: "PENDIENTE",
    totalRegistros: params.totalRegistros,
    procesados: 0,
    totalOk: 0,
    totalError: 0,
    totalCreados: 0,
    totalActualizados: 0,
    totalReactivados: 0,
    totalOmitidos: 0,
    resultados: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  matriculaImportJobs.set(id, job);
  return job;
}

function updateMatriculaImportJobTotals(job: MatriculaImportJob) {
  job.procesados = job.resultados.length;
  job.totalCreados = job.resultados.filter((item) => item.estado === "CREADO").length;
  job.totalActualizados = job.resultados.filter((item) => item.estado === "ACTUALIZADO").length;
  job.totalReactivados = job.resultados.filter((item) => item.estado === "REACTIVADO").length;
  job.totalOmitidos = job.resultados.filter((item) => item.estado === "OMITIDO").length;
  job.totalError = job.resultados.filter((item) => item.estado === "ERROR").length;
  job.totalOk = job.totalCreados + job.totalActualizados + job.totalReactivados;
  job.updatedAt = Date.now();
}

function serializeMatriculaImportJob(job: MatriculaImportJob) {
  return {
    jobId: job.id,
    status: job.status,
    totalRegistros: job.totalRegistros,
    procesados: job.procesados,
    totalOk: job.totalOk,
    totalError: job.totalError,
    totalCreados: job.totalCreados,
    totalActualizados: job.totalActualizados,
    totalReactivados: job.totalReactivados,
    totalOmitidos: job.totalOmitidos,
    porcentaje: job.totalRegistros ? Math.round((job.procesados / job.totalRegistros) * 100) : 0,
    error: job.error || null,
    resultados: job.status === "COMPLETADO" || job.status === "ERROR"
      ? job.resultados
      : job.resultados.slice(-20)
  };
}

function buildMatriculaImportResult(totalRegistros: number, resultados: MatriculaImportResultRow[]) {
  const totalCreados = resultados.filter((item) => item.estado === "CREADO").length;
  const totalActualizados = resultados.filter((item) => item.estado === "ACTUALIZADO").length;
  const totalReactivados = resultados.filter((item) => item.estado === "REACTIVADO").length;
  const totalOmitidos = resultados.filter((item) => item.estado === "OMITIDO").length;
  const totalError = resultados.filter((item) => item.estado === "ERROR").length;

  return {
    totalRegistros,
    totalOk: totalCreados + totalActualizados + totalReactivados,
    totalError,
    totalCreados,
    totalActualizados,
    totalReactivados,
    totalOmitidos,
    resultados
  };
}

function parseMatriculaImportRowsFromFile(file?: Express.Multer.File): MatriculaImportPayload[] {
  if (!file?.buffer) {
    const error: any = new Error("Debes adjuntar un archivo Excel");
    error.status = 400;
    throw error;
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes("Matriculas")
    ? "Matriculas"
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

  if (!rows.length) {
    const error: any = new Error("El archivo no contiene registros para importar");
    error.status = 400;
    throw error;
  }

  return rows.map((row, index) => ({
    fila: index + 2,
    cedula: toImportString(getImportValue(row, [
      "cedula",
      "cedula alumno",
      "cedula estudiante",
      "identificacion",
      "identificacion alumno",
      "identificacion estudiante"
    ])),
    seccion: toImportString(getImportValue(row, [
      "seccion",
      "grupo",
      "grupo nombre",
      "nombre grupo"
    ])),
    fechaMatricula: toImportDateString(getImportValue(row, ["fecha matricula", "fecha"])) || null,
    tipoMatricula: toNullableImportString(getImportValue(row, ["tipo matricula", "tipo"])),
    especialidad: toNullableImportString(getImportValue(row, ["especialidad"])),
    observacion: toNullableImportString(getImportValue(row, ["observacion", "observaciones"])),
    esRepitente: toImportBoolean(getImportValue(row, ["repitente", "es repitente"])),
    permiteExcepcionProgresion: toImportBoolean(getImportValue(row, [
      "excepcion progresion",
      "permite excepcion progresion",
      "permitir excepcion"
    ])),
    justificacionExcepcion: toNullableImportString(getImportValue(row, [
      "justificacion excepcion",
      "justificacion"
    ]))
  }));
}

async function findEstudianteParaMatricula(pool: any, institucionId: number, cedula: string) {
  const cedulaLimpia = cedula.replace(/[\s-]/g, "");
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("cedula", sql.NVarChar, cedula)
    .input("cedulaLimpia", sql.NVarChar, cedulaLimpia)
    .query(`
      SELECT TOP 1
        EstudianteId,
        Identificacion,
        Nombre,
        PrimerApellido,
        SegundoApellido,
        Activo
      FROM dbo.Estudiante
      WHERE InstitucionId = @institucionId
        AND (
          LTRIM(RTRIM(Identificacion)) = @cedula
          OR REPLACE(REPLACE(LTRIM(RTRIM(Identificacion)), N'-', N''), N' ', N'') = @cedulaLimpia
        )
      ORDER BY Activo DESC, EstudianteId DESC
    `);

  return result.recordset[0] || null;
}

async function findGrupoPorSeccionParaMatricula(params: {
  pool: any;
  institucionId: number;
  anioLectivoId: number;
  seccion: string;
}) {
  const { pool, institucionId, anioLectivoId, seccion } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("seccion", sql.NVarChar, seccion)
    .query(`
      SELECT TOP 1
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico,
        g.Especialidad,
        g.AnioLectivoId
      FROM dbo.Grupo g
      WHERE g.InstitucionId = @institucionId
        AND g.AnioLectivoId = @anioLectivoId
        AND g.Activo = 1
        AND (
          UPPER(LTRIM(RTRIM(g.Nombre))) = UPPER(LTRIM(RTRIM(@seccion)))
          OR UPPER(REPLACE(LTRIM(RTRIM(g.Nombre)), N' ', N'')) = UPPER(REPLACE(LTRIM(RTRIM(@seccion)), N' ', N''))
          OR UPPER(LTRIM(RTRIM(ISNULL(g.Nivel, N'')))) = UPPER(LTRIM(RTRIM(@seccion)))
        )
      ORDER BY g.GrupoId
    `);

  return result.recordset[0] || null;
}

function getEstudianteNombre(row: any) {
  return [
    row?.Nombre,
    row?.PrimerApellido,
    row?.SegundoApellido
  ].filter(Boolean).join(" ").trim();
}

async function upsertDetalleMatriculaImportada(params: {
  transaction: any;
  matriculaId: number;
  grupoInfo: any;
  payload: MatriculaImportPayload;
}) {
  const { transaction, matriculaId, grupoInfo, payload } = params;

  const existeDetalle = await transaction.request()
    .input("matriculaId", sql.Int, matriculaId)
    .query(`
      SELECT TOP 1 MatriculaDetalleId
      FROM dbo.MatriculaDetalle
      WHERE MatriculaId = @matriculaId
    `);

  const request = transaction.request()
    .input("matriculaId", sql.Int, matriculaId)
    .input("tipoMatricula", sql.NVarChar, payload.tipoMatricula || "Importacion")
    .input("nivelAcademico", sql.TinyInt, Number(grupoInfo.NivelAcademico || 0) || null)
    .input("especialidadId", sql.Int, null)
    .input("especialidad", sql.NVarChar, payload.especialidad || grupoInfo.Especialidad || null)
    .input("seccionTexto", sql.NVarChar, grupoInfo.GrupoNombre || payload.seccion || null)
    .input("rutaTransporte", sql.NVarChar, null)
    .input("esRepitente", sql.Bit, !!payload.esRepitente)
    .input("permiteExcepcionProgresion", sql.Bit, !!payload.permiteExcepcionProgresion)
    .input("justificacionExcepcion", sql.NVarChar, payload.justificacionExcepcion || null)
    .input("correoEnvioBoleta", sql.NVarChar, null)
    .input("observacionesDetalle", sql.NVarChar, payload.observacion || null);

  if (existeDetalle.recordset.length > 0) {
    await request.query(`
      UPDATE dbo.MatriculaDetalle
      SET
        TipoMatricula = @tipoMatricula,
        NivelAcademico = @nivelAcademico,
        EspecialidadId = @especialidadId,
        Especialidad = @especialidad,
        SeccionTexto = @seccionTexto,
        RutaTransporte = @rutaTransporte,
        EsRepitente = @esRepitente,
        PermiteExcepcionProgresion = @permiteExcepcionProgresion,
        JustificacionExcepcion = @justificacionExcepcion,
        CorreoEnvioBoleta = @correoEnvioBoleta,
        Observaciones = @observacionesDetalle,
        UpdatedAt = SYSDATETIME()
      WHERE MatriculaId = @matriculaId
    `);
    return;
  }

  await request.query(`
    INSERT INTO dbo.MatriculaDetalle
    (
      MatriculaId,
      TipoMatricula,
      NivelAcademico,
      EspecialidadId,
      Especialidad,
      SeccionTexto,
      RutaTransporte,
      EsRepitente,
      PermiteExcepcionProgresion,
      JustificacionExcepcion,
      CorreoEnvioBoleta,
      Observaciones,
      CreatedAt
    )
    VALUES
    (
      @matriculaId,
      @tipoMatricula,
      @nivelAcademico,
      @especialidadId,
      @especialidad,
      @seccionTexto,
      @rutaTransporte,
      @esRepitente,
      @permiteExcepcionProgresion,
      @justificacionExcepcion,
      @correoEnvioBoleta,
      @observacionesDetalle,
      SYSDATETIME()
    )
  `);
}

async function procesarMatriculaImportada(params: {
  pool: any;
  institucionId: number;
  usuarioId: number | null;
  anioLectivoId: number;
  estudiante: any;
  grupoInfo: any;
  payload: MatriculaImportPayload;
}): Promise<MatriculaImportResultRow> {
  const { pool, institucionId, usuarioId, anioLectivoId, estudiante, grupoInfo, payload } = params;
  const transaction = new sql.Transaction(pool);
  let started = false;

  try {
    await transaction.begin();
    started = true;

    const activaMismoAnio = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.GrupoId,
          g.Nombre AS GrupoNombre
        FROM dbo.Matricula m
        LEFT JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        WHERE m.EstudianteId = @estudianteId
          AND m.AnioLectivoId = @anioLectivoId
          AND m.Estado = N'Activa'
        ORDER BY m.MatriculaId DESC
      `);

    const duplicada = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
      .input("grupoId", sql.Int, Number(grupoInfo.GrupoId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT TOP 1 MatriculaId, Estado
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
        ORDER BY MatriculaId DESC
      `);

    const ultimaMatricula = await getUltimaMatriculaHistorica({
      pool: transaction,
      institucionId,
      estudianteId: Number(estudiante.EstudianteId),
      anioLectivoIdActual: anioLectivoId
    });

    const resultadoValidacion = validarProgresionAcademica({
      nivelAnterior: ultimaMatricula?.NivelAcademico ?? null,
      nivelNuevo: Number(grupoInfo.NivelAcademico || 0) || null,
      esRepitente: !!payload.esRepitente,
      permiteExcepcionProgresion: !!payload.permiteExcepcionProgresion,
      justificacionExcepcion: payload.justificacionExcepcion || null
    });

    if (!resultadoValidacion.permitido) {
      await transaction.rollback();
      started = false;
      return {
        fila: payload.fila,
        cedula: payload.cedula,
        seccion: payload.seccion,
        estudiante: getEstudianteNombre(estudiante),
        grupo: grupoInfo.GrupoNombre || null,
        matriculaId: null,
        estado: "ERROR",
        motivo: resultadoValidacion.message || "No cumple la progresion academica"
      };
    }

    if (activaMismoAnio.recordset.length > 0) {
      const activa = activaMismoAnio.recordset[0];

      await transaction.request()
        .input("matriculaId", sql.Int, activa.MatriculaId)
        .input("grupoId", sql.Int, Number(grupoInfo.GrupoId))
        .input("fechaMatricula", sql.Date, payload.fechaMatricula || null)
        .input("observacion", sql.NVarChar, payload.observacion || null)
        .input("usuarioActualizaId", sql.Int, usuarioId)
        .query(`
          UPDATE dbo.Matricula
          SET
            GrupoId = @grupoId,
            FechaMatricula = ISNULL(@fechaMatricula, FechaMatricula),
            Observacion = @observacion,
            UsuarioActualizaId = @usuarioActualizaId,
            Estado = N'Activa',
            UpdatedAt = SYSDATETIME()
          WHERE MatriculaId = @matriculaId
        `);

      await upsertDetalleMatriculaImportada({
        transaction,
        matriculaId: activa.MatriculaId,
        grupoInfo,
        payload
      });

      await transaction.commit();
      started = false;

      const mismoGrupo = Number(activa.GrupoId) === Number(grupoInfo.GrupoId);
      return {
        fila: payload.fila,
        cedula: payload.cedula,
        seccion: payload.seccion,
        estudiante: getEstudianteNombre(estudiante),
        grupo: grupoInfo.GrupoNombre || null,
        matriculaId: activa.MatriculaId,
        estado: "ACTUALIZADO",
        motivo: mismoGrupo
          ? "Matricula activa actualizada desde la importacion"
          : `Matricula activa actualizada y movida desde ${activa.GrupoNombre || "otro grupo"}`
      };
    }

    if (duplicada.recordset.length > 0) {
      const existente = duplicada.recordset[0];

      if (existente.Estado === "Activa") {
        await transaction.rollback();
        started = false;
        return {
          fila: payload.fila,
          cedula: payload.cedula,
          seccion: payload.seccion,
          estudiante: getEstudianteNombre(estudiante),
          grupo: grupoInfo.GrupoNombre || null,
          matriculaId: existente.MatriculaId,
          estado: "OMITIDO",
          motivo: "Ya existe una matricula activa para esta seccion"
        };
      }

      await transaction.request()
        .input("matriculaId", sql.Int, existente.MatriculaId)
        .input("fechaMatricula", sql.Date, payload.fechaMatricula || null)
        .input("observacion", sql.NVarChar, payload.observacion || null)
        .input("usuarioActualizaId", sql.Int, usuarioId)
        .query(`
          UPDATE dbo.Matricula
          SET
            Estado = N'Activa',
            FechaMatricula = ISNULL(@fechaMatricula, FechaMatricula),
            Observacion = @observacion,
            UsuarioActualizaId = @usuarioActualizaId,
            UpdatedAt = SYSDATETIME()
          WHERE MatriculaId = @matriculaId
        `);

      await upsertDetalleMatriculaImportada({
        transaction,
        matriculaId: existente.MatriculaId,
        grupoInfo,
        payload
      });

      await transaction.commit();
      started = false;

      return {
        fila: payload.fila,
        cedula: payload.cedula,
        seccion: payload.seccion,
        estudiante: getEstudianteNombre(estudiante),
        grupo: grupoInfo.GrupoNombre || null,
        matriculaId: existente.MatriculaId,
        estado: "REACTIVADO",
        motivo: "Matricula inactiva reactivada y actualizada"
      };
    }

    const insertMatricula = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
      .input("grupoId", sql.Int, Number(grupoInfo.GrupoId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("fechaMatricula", sql.Date, payload.fechaMatricula || null)
      .input("observacion", sql.NVarChar, payload.observacion || null)
      .input("usuarioRegistroId", sql.Int, usuarioId)
      .query(`
        INSERT INTO dbo.Matricula
        (
          EstudianteId,
          GrupoId,
          AnioLectivoId,
          Estado,
          FechaMatricula,
          Observacion,
          UsuarioRegistroId,
          CreatedAt
        )
        OUTPUT INSERTED.MatriculaId
        VALUES
        (
          @estudianteId,
          @grupoId,
          @anioLectivoId,
          N'Activa',
          ISNULL(@fechaMatricula, CAST(GETDATE() AS DATE)),
          @observacion,
          @usuarioRegistroId,
          SYSDATETIME()
        )
      `);

    const matriculaId = Number(insertMatricula.recordset[0].MatriculaId);
    await upsertDetalleMatriculaImportada({
      transaction,
      matriculaId,
      grupoInfo,
      payload
    });

    await transaction.commit();
    started = false;

    return {
      fila: payload.fila,
      cedula: payload.cedula,
      seccion: payload.seccion,
      estudiante: getEstudianteNombre(estudiante),
      grupo: grupoInfo.GrupoNombre || null,
      matriculaId,
      estado: "CREADO",
      motivo: "Matricula creada correctamente"
    };
  } catch (error) {
    if (started) {
      try {
        await transaction.rollback();
      } catch {}
    }
    throw error;
  }
}

async function processMatriculaImportRows(params: {
  rows: MatriculaImportPayload[];
  institucionId: number;
  usuarioId: number | null;
  anioLectivoId: number;
  job?: MatriculaImportJob;
}) {
  const { rows, institucionId, usuarioId, anioLectivoId, job } = params;
  const pool = await getPool();
  const resultados: MatriculaImportResultRow[] = [];

  if (job) {
    job.status = "PROCESANDO";
    job.updatedAt = Date.now();
  }

  for (const payload of rows) {
    let resultado: MatriculaImportResultRow;

    try {
      if (!payload.cedula || !payload.seccion) {
        resultado = {
          fila: payload.fila,
          cedula: payload.cedula,
          seccion: payload.seccion,
          estado: "ERROR",
          motivo: "La cédula y la sección son obligatorias"
        };
      } else {
        const estudiante = await findEstudianteParaMatricula(pool, institucionId, payload.cedula);
        if (!estudiante) {
          resultado = {
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estado: "ERROR",
            motivo: "No existe un estudiante con esa cédula en la institución"
          };
        } else if (!estudiante.Activo) {
          resultado = {
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estudiante: getEstudianteNombre(estudiante),
            estado: "ERROR",
            motivo: "El estudiante existe, pero esta inactivo"
          };
        } else {
          const grupoInfo = await findGrupoPorSeccionParaMatricula({
            pool,
            institucionId,
            anioLectivoId,
            seccion: payload.seccion
          });

          if (!grupoInfo) {
            resultado = {
              fila: payload.fila,
              cedula: payload.cedula,
              seccion: payload.seccion,
              estudiante: getEstudianteNombre(estudiante),
              estado: "ERROR",
              motivo: "No existe un grupo activo con esa sección para el año lectivo seleccionado"
            };
          } else {
            resultado = await procesarMatriculaImportada({
              pool,
              institucionId,
              usuarioId,
              anioLectivoId,
              estudiante,
              grupoInfo,
              payload
            });
          }
        }
      }
    } catch (error: any) {
      console.error("Error procesando fila de importacion de matriculas:", error);
      resultado = {
        fila: payload.fila,
        cedula: payload.cedula,
        seccion: payload.seccion,
        estado: "ERROR",
        motivo: error?.message || "No se pudo procesar la fila"
      };
    }

    resultados.push(resultado);

    if (job) {
      job.resultados.push(resultado);
      updateMatriculaImportJobTotals(job);
    }
  }

  if (job) {
    job.status = "COMPLETADO";
    updateMatriculaImportJobTotals(job);
  }

  return buildMatriculaImportResult(rows.length, resultados);
}

/* =========================================================
   MATRICULAS
   ========================================================= */
router.get("/matriculas", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .query(`
        SELECT
          m.MatriculaId,
          m.EstudianteId,
          m.GrupoId,
          m.AnioLectivoId,
          m.Estado,
          m.FechaMatricula,
          m.Observacion,
          m.CreatedAt,
          m.UpdatedAt,
          md.MatriculaDetalleId,
          md.TipoMatricula,
          md.NivelAcademico,
          md.EspecialidadId,
          md.Especialidad,
          esp.Descripcion AS EspecialidadDescripcion,
          esp.PermiteMultiplesPorSeccion,
          md.SeccionTexto,
          md.RutaTransporte,
          md.EsRepitente,
          md.PermiteExcepcionProgresion,
          md.JustificacionExcepcion,
          md.CorreoEnvioBoleta,
          md.Observaciones AS ObservacionesDetalle,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Adecuacion AS TipoAdecuacion,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.NivelAcademico AS GrupoNivelAcademico,
          g.Especialidad AS GrupoEspecialidad,
          a.Nombre AS AnioNombre
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = m.AnioLectivoId
        LEFT JOIN dbo.MatriculaDetalle md
          ON md.MatriculaId = m.MatriculaId
        LEFT JOIN dbo.Especialidad esp
          ON esp.EspecialidadId = md.EspecialidadId
        WHERE e.InstitucionId = @institucionId
          AND (@incluirInactivas = 1 OR m.Estado = N'Activa')
          AND (
            @q = '%%'
            OR e.Identificacion LIKE @q
            OR e.Nombre LIKE @q
            OR e.PrimerApellido LIKE @q
            OR e.SegundoApellido LIKE @q
            OR g.Nombre LIKE @q
            OR a.Nombre LIKE @q
            OR md.TipoMatricula LIKE @q
            OR md.Especialidad LIKE @q
            OR esp.Descripcion LIKE @q
          )
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre, m.MatriculaId
        OPTION (MAX_GRANT_PERCENT = 1)
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar matrículas:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar matrículas"
    });
  }
});

router.get("/matriculas/plantilla-excel", async (_req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const instrucciones = [
      { Campo: "cedula", Obligatorio: "Si", Descripcion: "Cédula o identificación del estudiante ya registrado" },
      { Campo: "seccion", Obligatorio: "Si", Descripcion: "Nombre de la sección/grupo activo en el año lectivo seleccionado" },
      { Campo: "fecha matricula", Obligatorio: "No", Descripcion: "Fecha en formato AAAA-MM-DD. Si se deja vacia se usa la fecha actual" },
      { Campo: "tipo matricula", Obligatorio: "No", Descripcion: "Ejemplo: Regular" },
      { Campo: "especialidad", Obligatorio: "No", Descripcion: "Descripcion de la especialidad que se desea dejar registrada en la matricula" },
      { Campo: "observacion", Obligatorio: "No", Descripcion: "Observacion general de la matricula" },
      { Campo: "repitente", Obligatorio: "No", Descripcion: "Indicar Si/No cuando aplica" },
      { Campo: "excepcion progresion", Obligatorio: "No", Descripcion: "Indicar Si/No si se autoriza excepcion de progresion" },
      { Campo: "justificacion excepcion", Obligatorio: "No", Descripcion: "Justificacion cuando se usa excepcion de progresion" }
    ];
    const ejemplo = [
      {
        cedula: "401230125",
        seccion: "12-1",
        "fecha matricula": "",
        "tipo matricula": "Regular",
        especialidad: "Contabilidad",
        observacion: "",
        repitente: "No",
        "excepcion progresion": "No",
        "justificacion excepcion": ""
      }
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(instrucciones), "Instrucciones");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ejemplo), "Matriculas");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="plantilla_importacion_matriculas.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Error generando plantilla de matriculas:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo generar la plantilla de matriculas"
    });
  }
});

router.post("/matriculas/importar-excel/iniciar", upload.single("archivo"), async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const anioLectivoId = Number(req.body?.anioLectivoId);
    if (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0) {
      return badRequest(res, "Debes seleccionar el anio lectivo para la importacion");
    }

    const rows = parseMatriculaImportRowsFromFile(req.file);
    const usuarioId = (req.auth as any)?.usuarioId || (req.auth as any)?.userId || (req.auth as any)?.id || null;
    const job = createMatriculaImportJob({
      institucionId,
      usuarioId,
      anioLectivoId,
      totalRegistros: rows.length
    });

    setImmediate(() => {
      processMatriculaImportRows({
        rows,
        institucionId,
        usuarioId,
        anioLectivoId,
        job
      }).catch((error) => {
        console.error("Error procesando importacion de matriculas:", error);
        job.status = "ERROR";
        job.error = error?.message || "No se pudo procesar el archivo Excel";
        job.updatedAt = Date.now();
      });
    });

    return ok(res, serializeMatriculaImportJob(job), "Importacion de matriculas iniciada");
  } catch (error: any) {
    if (error?.status === 400) return badRequest(res, error.message);

    console.error("Error iniciando importacion de matriculas:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo iniciar la importacion de matriculas"
    });
  }
});

router.get("/matriculas/importar-excel/progreso/:jobId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    cleanupMatriculaImportJobs();
    const job = matriculaImportJobs.get(String(req.params.jobId || ""));

    if (!job || job.institucionId !== institucionId) {
      return res.status(404).json({
        ok: false,
        message: "No se encontro la importacion solicitada"
      });
    }

    return ok(res, serializeMatriculaImportJob(job));
  } catch (error) {
    console.error("Error consultando progreso de importacion de matriculas:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo consultar el progreso de la importacion"
    });
  }
});

router.get("/matriculas/importar-excel/resumen/:jobId/excel", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    cleanupMatriculaImportJobs();
    const job = matriculaImportJobs.get(String(req.params.jobId || ""));

    if (!job || job.institucionId !== institucionId) {
      return res.status(404).json({
        ok: false,
        message: "No se encontro la importacion solicitada"
      });
    }

    const wb = XLSX.utils.book_new();
    const resumen = [
      { Concepto: "Total registros", Valor: job.totalRegistros },
      { Concepto: "Procesados", Valor: job.procesados },
      { Concepto: "Creados", Valor: job.totalCreados },
      { Concepto: "Actualizados", Valor: job.totalActualizados },
      { Concepto: "Reactivados y actualizados", Valor: job.totalReactivados },
      { Concepto: "Omitidos", Valor: job.totalOmitidos },
      { Concepto: "Errores", Valor: job.totalError },
      { Concepto: "Estado", Valor: job.status }
    ];
    const detalle = job.resultados.map((item) => ({
      Fila: item.fila,
      Cedula: item.cedula,
      Seccion: item.seccion,
      Estudiante: item.estudiante || "",
      Grupo: item.grupo || "",
      MatriculaId: item.matriculaId || "",
      Estado: item.estado,
      Motivo: item.motivo
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="resumen_importacion_matriculas_${job.id}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando resumen de importacion de matriculas:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo exportar el resumen de importacion"
    });
  }
});

router.post("/matriculas/importar-excel", upload.single("archivo"), async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const anioLectivoId = Number(req.body?.anioLectivoId);
    if (!Number.isInteger(anioLectivoId) || anioLectivoId <= 0) {
      return badRequest(res, "Debes seleccionar el anio lectivo para la importacion");
    }

    const rows = parseMatriculaImportRowsFromFile(req.file);
    const pool = await getPool();
    const usuarioId = (req.auth as any)?.usuarioId || (req.auth as any)?.userId || (req.auth as any)?.id || null;
    const resultados: MatriculaImportResultRow[] = [];

    for (const payload of rows) {
      try {
        if (!payload.cedula || !payload.seccion) {
          resultados.push({
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estado: "ERROR",
            motivo: "La cédula y la sección son obligatorias"
          });
          continue;
        }

        const estudiante = await findEstudianteParaMatricula(pool, institucionId, payload.cedula);
        if (!estudiante) {
          resultados.push({
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estado: "ERROR",
            motivo: "No existe un estudiante con esa cédula en la institución"
          });
          continue;
        }

        if (!estudiante.Activo) {
          resultados.push({
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estudiante: getEstudianteNombre(estudiante),
            estado: "ERROR",
            motivo: "El estudiante existe, pero esta inactivo"
          });
          continue;
        }

        const grupoInfo = await findGrupoPorSeccionParaMatricula({
          pool,
          institucionId,
          anioLectivoId,
          seccion: payload.seccion
        });

        if (!grupoInfo) {
          resultados.push({
            fila: payload.fila,
            cedula: payload.cedula,
            seccion: payload.seccion,
            estudiante: getEstudianteNombre(estudiante),
            estado: "ERROR",
            motivo: "No existe un grupo activo con esa sección para el año lectivo seleccionado"
          });
          continue;
        }

        const resultado = await procesarMatriculaImportada({
          pool,
          institucionId,
          usuarioId,
          anioLectivoId,
          estudiante,
          grupoInfo,
          payload
        });

        resultados.push(resultado);
      } catch (error: any) {
        console.error("Error procesando fila de importacion de matriculas:", error);
        resultados.push({
          fila: payload.fila,
          cedula: payload.cedula,
          seccion: payload.seccion,
          estado: "ERROR",
          motivo: error?.message || "No se pudo procesar la fila"
        });
      }
    }

    const totalCreados = resultados.filter((item) => item.estado === "CREADO").length;
    const totalActualizados = resultados.filter((item) => item.estado === "ACTUALIZADO").length;
    const totalReactivados = resultados.filter((item) => item.estado === "REACTIVADO").length;
    const totalOmitidos = resultados.filter((item) => item.estado === "OMITIDO").length;
    const totalError = resultados.filter((item) => item.estado === "ERROR").length;

    return ok(res, {
      totalRegistros: rows.length,
      totalOk: totalCreados + totalActualizados + totalReactivados,
      totalError,
      totalCreados,
      totalActualizados,
      totalReactivados,
      totalOmitidos,
      resultados
    }, "Importacion de matriculas procesada correctamente");
  } catch (error: any) {
    if (error?.status === 400) return badRequest(res, error.message);

    console.error("Error importando matriculas:", error);
    return res.status(500).json({
      ok: false,
      message: "No se pudo importar el archivo de matriculas"
    });
  }
});

router.get("/matriculas/:id/detalle", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const matriculaResult = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.EstudianteId,
          m.GrupoId,
          m.AnioLectivoId,
          m.Estado,
          m.FechaMatricula,
          m.Observacion,
          md.MatriculaDetalleId,
          md.TipoMatricula,
          md.NivelAcademico,
          md.EspecialidadId,
          md.Especialidad,
          esp.Descripcion AS EspecialidadDescripcion,
          esp.PermiteMultiplesPorSeccion,
          md.SeccionTexto,
          md.RutaTransporte,
          md.EsRepitente,
          md.PermiteExcepcionProgresion,
          md.JustificacionExcepcion,
          md.CorreoEnvioBoleta,
          md.Observaciones AS ObservacionesDetalle,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Correo AS CorreoEstudiante,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.NivelAcademico AS GrupoNivelAcademico,
          g.Especialidad AS GrupoEspecialidad,
          a.Nombre AS AnioNombre
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = m.AnioLectivoId
        LEFT JOIN dbo.MatriculaDetalle md
          ON md.MatriculaId = m.MatriculaId
        WHERE m.MatriculaId = @id
          AND e.InstitucionId = @institucionId
      `);

    if (!matriculaResult.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    const matricula = matriculaResult.recordset[0];

    const historialResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, matricula.EstudianteId)
      .query(`
        SELECT
          m.MatriculaId,
          m.AnioLectivoId,
          m.Estado,
          m.FechaMatricula,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          g.NivelAcademico,
          md.EsRepitente
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = m.GrupoId
        LEFT JOIN dbo.MatriculaDetalle md
          ON md.MatriculaId = m.MatriculaId
        LEFT JOIN dbo.Especialidad esp
          ON esp.EspecialidadId = md.EspecialidadId
        WHERE e.InstitucionId = @institucionId
          AND m.EstudianteId = @estudianteId
        ORDER BY m.AnioLectivoId DESC, m.MatriculaId DESC
      `);

    return ok(res, {
      matricula,
      historial: historialResult.recordset
    });
  } catch (error) {
    console.error("Error al cargar detalle de matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al cargar el detalle de matrícula"
    });
  }
});

router.post("/matriculas", async (req, res) => {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return;

  const transactionPool = await getPool();
  const transaction = new sql.Transaction(transactionPool);

  try {
    const {
      estudianteId,
      grupoId,
      anioLectivoId,
      fechaMatricula,
      observacion,
      tipoMatricula,
      nivelAcademico,
      especialidadId,
      especialidad,
      seccionTexto,
      rutaTransporte,
      esRepitente,
      permiteExcepcionProgresion,
      justificacionExcepcion,
      correoEnvioBoleta,
      observacionesDetalle
    } = req.body;

    if (!isValidNonNegativeId(estudianteId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId)) {
      return badRequest(res, "estudianteId, grupoId y anioLectivoId son obligatorios");
    }

    await transaction.begin();

    const activaMismoAnio = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND AnioLectivoId = @anioLectivoId
          AND Estado = N'Activa'
      `);

    if (activaMismoAnio.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_ACTIVA_EN_ANIO",
        message: "El estudiante ya tiene una matrícula activa en ese año lectivo"
      });
    }

    const duplicada = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .query(`
        SELECT TOP 1 MatriculaId, Estado
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
      `);

    if (duplicada.recordset.length > 0) {
      const existente = duplicada.recordset[0];
      await transaction.rollback();

      if (existente.Estado !== "Activa") {
        return res.status(409).json({
          ok: false,
          code: "MATRICULA_INACTIVA",
          matriculaId: existente.MatriculaId,
          message: "Ya existe una matrícula inactiva para este estudiante en ese grupo y año. Podés reactivarla."
        });
      }

      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe una matrícula para este estudiante en ese grupo y año"
      });
    }

    const grupoInfo = await getGrupoInfoParaMatricula({
      pool: transaction,
      institucionId,
      grupoId: Number(grupoId),
      anioLectivoId: Number(anioLectivoId)
    });

    if (!grupoInfo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        code: "GRUPO_NO_VALIDO",
        message: "El grupo no existe, no está activo o no pertenece al año lectivo indicado"
      });
    }

    const especialidadInfo = await getEspecialidadInfoParaMatricula({
      pool: transaction,
      institucionId,
      especialidadId: especialidadId ? Number(especialidadId) : null
    });

    if (especialidadId && !especialidadInfo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        code: "ESPECIALIDAD_NO_VALIDA",
        message: "La especialidad no existe, está inactiva o no pertenece a la institución"
      });
    }

    const ultimaMatricula = await getUltimaMatriculaHistorica({
      pool: transaction,
      institucionId,
      estudianteId: Number(estudianteId),
      anioLectivoIdActual: Number(anioLectivoId)
    });

    const resultadoValidacion = validarProgresionAcademica({
      nivelAnterior: ultimaMatricula?.NivelAcademico ?? null,
      nivelNuevo: Number(grupoInfo.NivelAcademico || nivelAcademico || 0) || null,
      esRepitente: !!esRepitente,
      permiteExcepcionProgresion: !!permiteExcepcionProgresion,
      justificacionExcepcion: justificacionExcepcion || null
    });

    if (!resultadoValidacion.permitido) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        code: resultadoValidacion.motivo,
        message: resultadoValidacion.message
      });
    }

    const insertMatricula = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("fechaMatricula", sql.Date, fechaMatricula || null)
      .input("observacion", sql.NVarChar, observacion || null)
      .input("usuarioRegistroId", sql.Int, (req.auth as any)?.usuarioId || (req.auth as any)?.userId || (req.auth as any)?.id || null)
      .query(`
        INSERT INTO dbo.Matricula
        (
          EstudianteId,
          GrupoId,
          AnioLectivoId,
          Estado,
          FechaMatricula,
          Observacion,
          UsuarioRegistroId,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @estudianteId,
          @grupoId,
          @anioLectivoId,
          N'Activa',
          ISNULL(@fechaMatricula, CAST(GETDATE() AS DATE)),
          @observacion,
          @usuarioRegistroId,
          SYSDATETIME()
        )
      `);

    const matricula = insertMatricula.recordset[0];

    await transaction.request()
      .input("matriculaId", sql.Int, matricula.MatriculaId)
      .input("tipoMatricula", sql.NVarChar, tipoMatricula || null)
      .input("nivelAcademico", sql.TinyInt, Number(grupoInfo.NivelAcademico || nivelAcademico || 0) || null)
      .input("especialidadId", sql.Int, especialidadInfo?.EspecialidadId || null)
      .input("especialidad", sql.NVarChar, especialidadInfo?.Descripcion || especialidad || grupoInfo.Especialidad || null)
      .input("seccionTexto", sql.NVarChar, seccionTexto || grupoInfo.GrupoNombre || null)
      .input("rutaTransporte", sql.NVarChar, rutaTransporte || null)
      .input("esRepitente", sql.Bit, !!esRepitente)
      .input("permiteExcepcionProgresion", sql.Bit, !!permiteExcepcionProgresion)
      .input("justificacionExcepcion", sql.NVarChar, justificacionExcepcion || null)
      .input("correoEnvioBoleta", sql.NVarChar, correoEnvioBoleta || null)
      .input("observacionesDetalle", sql.NVarChar, observacionesDetalle || null)
      .query(`
        INSERT INTO dbo.MatriculaDetalle
        (
          MatriculaId,
          TipoMatricula,
          NivelAcademico,
          Especialidad,
          SeccionTexto,
          RutaTransporte,
          EsRepitente,
          PermiteExcepcionProgresion,
          JustificacionExcepcion,
          CorreoEnvioBoleta,
          Observaciones,
          CreatedAt
        )
        VALUES
        (
          @matriculaId,
          @tipoMatricula,
          @nivelAcademico,
          @especialidad,
          @seccionTexto,
          @rutaTransporte,
          @esRepitente,
          @permiteExcepcionProgresion,
          @justificacionExcepcion,
          @correoEnvioBoleta,
          @observacionesDetalle,
          SYSDATETIME()
        )
      `);

    await transaction.commit();

    return created(res, {
      ...matricula,
      NivelAcademico: grupoInfo.NivelAcademico,
      GrupoNombre: grupoInfo.GrupoNombre,
      GrupoNivel: grupoInfo.GrupoNivel
    }, "Matrícula creada correctamente");
  } catch (error: any) {
    console.error("Error al crear matrícula:", error);

    try {
      await transaction.rollback();
    } catch {}

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe una matrícula para este estudiante en ese grupo y año"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear matrícula"
    });
  }
});

router.put("/matriculas/:id", async (req, res) => {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return;

  const transactionPool = await getPool();
  const transaction = new sql.Transaction(transactionPool);
  const usuarioTrasladoId = Number((req.auth as any)?.usuarioId || (req.auth as any)?.userId || (req.auth as any)?.id || 0) || null;

  try {
    const id = Number(req.params.id);
    const {
      estudianteId,
      grupoId,
      anioLectivoId,
      fechaMatricula,
      observacion,
      tipoMatricula,
      nivelAcademico,
      especialidadId,
      especialidad,
      seccionTexto,
      rutaTransporte,
      esRepitente,
      permiteExcepcionProgresion,
      justificacionExcepcion,
      correoEnvioBoleta,
      observacionesDetalle
    } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(estudianteId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId)) {
      return badRequest(res, "estudianteId, grupoId y anioLectivoId son obligatorios");
    }

    await ensureMatriculaTrasladoHistorialTable(transactionPool);
    await transaction.begin();

    const matriculaActual = await transaction.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.EstudianteId,
          m.GrupoId,
          m.AnioLectivoId
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
        WHERE m.MatriculaId = @id
          AND e.InstitucionId = @institucionId
      `);

    if (!matriculaActual.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    const grupoIdAnterior = Number(matriculaActual.recordset[0].GrupoId || 0);
    const estudianteIdAnterior = Number(matriculaActual.recordset[0].EstudianteId || 0);
    const anioLectivoIdAnterior = Number(matriculaActual.recordset[0].AnioLectivoId || 0);
    const cambioGrupo = Number(grupoId) !== grupoIdAnterior;

    const activaMismoAnio = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND AnioLectivoId = @anioLectivoId
          AND Estado = N'Activa'
          AND MatriculaId <> @id
      `);

    if (activaMismoAnio.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_ACTIVA_EN_ANIO",
        message: "El estudiante ya tiene otra matrícula activa en ese año lectivo"
      });
    }

    const duplicada = await transaction.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND MatriculaId <> @id
      `);

    if (duplicada.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe otra matrícula para este estudiante en ese grupo y año"
      });
    }

    const grupoInfo = await getGrupoInfoParaMatricula({
      pool: transaction,
      institucionId,
      grupoId: Number(grupoId),
      anioLectivoId: Number(anioLectivoId)
    });

    if (!grupoInfo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        code: "GRUPO_NO_VALIDO",
        message: "El grupo no existe, no está activo o no pertenece al año lectivo indicado"
      });
    }

    const especialidadInfo = await getEspecialidadInfoParaMatricula({
      pool: transaction,
      institucionId,
      especialidadId: especialidadId ? Number(especialidadId) : null
    });

    if (especialidadId && !especialidadInfo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        code: "ESPECIALIDAD_NO_VALIDA",
        message: "La especialidad no existe, está inactiva o no pertenece a la institución"
      });
    }

    const ultimaMatricula = await getUltimaMatriculaHistorica({
      pool: transaction,
      institucionId,
      estudianteId: Number(estudianteId),
      anioLectivoIdActual: Number(anioLectivoId)
    });

    const resultadoValidacion = validarProgresionAcademica({
      nivelAnterior: ultimaMatricula?.NivelAcademico ?? null,
      nivelNuevo: Number(grupoInfo.NivelAcademico || nivelAcademico || 0) || null,
      esRepitente: !!esRepitente,
      permiteExcepcionProgresion: !!permiteExcepcionProgresion,
      justificacionExcepcion: justificacionExcepcion || null
    });

    if (!resultadoValidacion.permitido) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        code: resultadoValidacion.motivo,
        message: resultadoValidacion.message
      });
    }

    const updateMatricula = await transaction.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("fechaMatricula", sql.Date, fechaMatricula || null)
      .input("observacion", sql.NVarChar, observacion || null)
      .input("usuarioActualizaId", sql.Int, usuarioTrasladoId)
      .query(`
        UPDATE dbo.Matricula
        SET
          EstudianteId = @estudianteId,
          GrupoId = @grupoId,
          AnioLectivoId = @anioLectivoId,
          FechaMatricula = ISNULL(@fechaMatricula, FechaMatricula),
          Observacion = @observacion,
          UsuarioActualizaId = @usuarioActualizaId,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE MatriculaId = @id
          AND EXISTS (
            SELECT 1
            FROM dbo.Estudiante e
            WHERE e.EstudianteId = dbo.Matricula.EstudianteId
              AND e.InstitucionId = @institucionId
          )
      `);

    if (!updateMatricula.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    if (cambioGrupo && estudianteIdAnterior > 0 && grupoIdAnterior > 0 && anioLectivoIdAnterior > 0) {
      const trasladoTotales = await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("estudianteId", sql.Int, estudianteIdAnterior)
        .input("grupoIdOrigen", sql.Int, grupoIdAnterior)
        .input("anioLectivoId", sql.Int, anioLectivoIdAnterior)
        .query(`
          SELECT
            (
              SELECT COUNT(1)
              FROM dbo.EvaluacionNota en
              INNER JOIN dbo.EvaluacionActividad act ON act.EvaluacionActividadId = en.EvaluacionActividadId
              INNER JOIN dbo.EvaluacionComponente comp ON comp.EvaluacionComponenteId = act.EvaluacionComponenteId
              INNER JOIN dbo.EvaluacionPlantilla pla ON pla.EvaluacionPlantillaId = comp.EvaluacionPlantillaId
              WHERE en.EstudianteId = @estudianteId
                AND en.GrupoId = @grupoIdOrigen
                AND pla.InstitucionId = @institucionId
                AND pla.AnioLectivoId = @anioLectivoId
            ) AS TotalNotasClasicas,
            (
              SELECT COUNT(1)
              FROM dbo.Eval360_NotaActividad na
              INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = na.ActividadId
              INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = a.EstructuraGrupoId
              WHERE na.EstudianteId = @estudianteId
                AND eg.InstitucionId = @institucionId
                AND eg.GrupoId = @grupoIdOrigen
                AND eg.AnioLectivoId = @anioLectivoId
                AND ISNULL(eg.Activo, 1) = 1
            ) AS TotalNotasEval360,
            (
              SELECT COUNT(1)
              FROM dbo.Eval360_SeguimientoIndicador si
              INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = si.ActividadId
              INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = a.EstructuraGrupoId
              WHERE si.EstudianteId = @estudianteId
                AND eg.InstitucionId = @institucionId
                AND eg.GrupoId = @grupoIdOrigen
                AND eg.AnioLectivoId = @anioLectivoId
                AND ISNULL(eg.Activo, 1) = 1
            ) AS TotalSeguimientos
        `);

      await asegurarEstructuraEval360ParaTraslado(transaction, {
        institucionId,
        grupoIdOrigen: grupoIdAnterior,
        grupoIdDestino: Number(grupoId),
        anioLectivoId: anioLectivoIdAnterior,
        usuarioId: usuarioTrasladoId
      });

      await copiarNotasPorTraslado(transaction, {
        institucionId,
        estudianteId: estudianteIdAnterior,
        grupoIdOrigen: grupoIdAnterior,
        grupoIdDestino: Number(grupoId),
        anioLectivoId: anioLectivoIdAnterior
      });

      const totalAsistenciasCopiadas = await copiarAsistenciaPorTraslado(transaction, {
        estudianteId: estudianteIdAnterior,
        grupoIdOrigen: grupoIdAnterior,
        grupoIdDestino: Number(grupoId),
        anioLectivoId: anioLectivoIdAnterior,
        usuarioId: usuarioTrasladoId
      });

      await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("matriculaId", sql.Int, id)
        .input("estudianteId", sql.Int, estudianteIdAnterior)
        .input("anioLectivoId", sql.Int, anioLectivoIdAnterior)
        .input("grupoIdOrigen", sql.Int, grupoIdAnterior)
        .input("grupoIdDestino", sql.Int, Number(grupoId))
        .input("usuarioTrasladoId", sql.Int, usuarioTrasladoId)
        .input("observacion", sql.NVarChar, observacion || null)
        .input("totalNotasClasicasCopiadas", sql.Int, Number(trasladoTotales.recordset[0]?.TotalNotasClasicas || 0))
        .input("totalNotasEval360Copiadas", sql.Int, Number(trasladoTotales.recordset[0]?.TotalNotasEval360 || 0))
        .input("totalSeguimientosCopiados", sql.Int, Number(trasladoTotales.recordset[0]?.TotalSeguimientos || 0))
        .input("totalAsistenciasCopiadas", sql.Int, totalAsistenciasCopiadas)
        .query(`
          INSERT INTO dbo.MatriculaTrasladoHistorial
            (InstitucionId, MatriculaId, EstudianteId, AnioLectivoId, GrupoIdOrigen, GrupoIdDestino, UsuarioTrasladoId, Observacion, TotalNotasClasicasCopiadas, TotalNotasEval360Copiadas, TotalSeguimientosCopiados, TotalAsistenciasCopiadas, CreatedAt)
          VALUES
            (@institucionId, @matriculaId, @estudianteId, @anioLectivoId, @grupoIdOrigen, @grupoIdDestino, @usuarioTrasladoId, @observacion, @totalNotasClasicasCopiadas, @totalNotasEval360Copiadas, @totalSeguimientosCopiados, @totalAsistenciasCopiadas, SYSDATETIME())
        `);
    }

    const existeDetalle = await transaction.request()
      .input("matriculaId", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaDetalleId
        FROM dbo.MatriculaDetalle
        WHERE MatriculaId = @matriculaId
      `);

    const especialidadIdSql = especialidadInfo?.EspecialidadId
      ? Number(especialidadInfo.EspecialidadId)
      : null;

    if (existeDetalle.recordset.length > 0) {
      await transaction.request()
        .input("matriculaId", sql.Int, id)
        .input("tipoMatricula", sql.NVarChar, tipoMatricula || null)
        .input("nivelAcademico", sql.TinyInt, Number(grupoInfo.NivelAcademico || nivelAcademico || 0) || null)
        .input("especialidad", sql.NVarChar, especialidad || grupoInfo.Especialidad || null)
        .input("seccionTexto", sql.NVarChar, seccionTexto || grupoInfo.GrupoNombre || null)
        .input("rutaTransporte", sql.NVarChar, rutaTransporte || null)
        .input("esRepitente", sql.Bit, !!esRepitente)
        .input("permiteExcepcionProgresion", sql.Bit, !!permiteExcepcionProgresion)
        .input("justificacionExcepcion", sql.NVarChar, justificacionExcepcion || null)
        .input("correoEnvioBoleta", sql.NVarChar, correoEnvioBoleta || null)
        .input("observacionesDetalle", sql.NVarChar, observacionesDetalle || null)
        .query(`
          UPDATE dbo.MatriculaDetalle
          SET
            TipoMatricula = @tipoMatricula,
            NivelAcademico = @nivelAcademico,
            EspecialidadId = ${especialidadIdSql === null ? "NULL" : especialidadIdSql},
            Especialidad = @especialidad,
            SeccionTexto = @seccionTexto,
            RutaTransporte = @rutaTransporte,
            EsRepitente = @esRepitente,
            PermiteExcepcionProgresion = @permiteExcepcionProgresion,
            JustificacionExcepcion = @justificacionExcepcion,
            CorreoEnvioBoleta = @correoEnvioBoleta,
            Observaciones = @observacionesDetalle,
            UpdatedAt = SYSDATETIME()
          WHERE MatriculaId = @matriculaId
        `);
    } else {
      await transaction.request()
        .input("matriculaId", sql.Int, id)
        .input("tipoMatricula", sql.NVarChar, tipoMatricula || null)
        .input("nivelAcademico", sql.TinyInt, Number(grupoInfo.NivelAcademico || nivelAcademico || 0) || null)
        .input("especialidad", sql.NVarChar, especialidad || grupoInfo.Especialidad || null)
        .input("seccionTexto", sql.NVarChar, seccionTexto || grupoInfo.GrupoNombre || null)
        .input("rutaTransporte", sql.NVarChar, rutaTransporte || null)
        .input("esRepitente", sql.Bit, !!esRepitente)
        .input("permiteExcepcionProgresion", sql.Bit, !!permiteExcepcionProgresion)
        .input("justificacionExcepcion", sql.NVarChar, justificacionExcepcion || null)
        .input("correoEnvioBoleta", sql.NVarChar, correoEnvioBoleta || null)
        .input("observacionesDetalle", sql.NVarChar, observacionesDetalle || null)
        .query(`
          INSERT INTO dbo.MatriculaDetalle
          (
            MatriculaId,
            TipoMatricula,
            NivelAcademico,
            EspecialidadId,
            Especialidad,
            SeccionTexto,
            RutaTransporte,
            EsRepitente,
            PermiteExcepcionProgresion,
            JustificacionExcepcion,
            CorreoEnvioBoleta,
            Observaciones,
            CreatedAt
          )
          VALUES
          (
            @matriculaId,
            @tipoMatricula,
            @nivelAcademico,
            ${especialidadIdSql === null ? "NULL" : especialidadIdSql},
            @especialidad,
            @seccionTexto,
            @rutaTransporte,
            @esRepitente,
            @permiteExcepcionProgresion,
            @justificacionExcepcion,
            @correoEnvioBoleta,
            @observacionesDetalle,
            SYSDATETIME()
          )
        `);
    }

    await transaction.commit();

    return ok(res, updateMatricula.recordset[0], "Matrícula actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar matrícula:", error);

    try {
      await transaction.rollback();
    } catch {}

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe otra matrícula para este estudiante en ese grupo y año"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar matrícula"
    });
  }
});

router.delete("/matriculas/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Matricula
        SET
          Estado = N'Inactiva',
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MatriculaId
        WHERE MatriculaId = @id
          AND EXISTS (
            SELECT 1
            FROM dbo.Estudiante e
            WHERE e.EstudianteId = dbo.Matricula.EstudianteId
              AND e.InstitucionId = @institucionId
          )
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    return ok(res, { MatriculaId: id }, "Matrícula desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar matrícula"
    });
  }
});

router.patch("/matriculas/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const actual = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.EstudianteId,
          m.AnioLectivoId
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        WHERE m.MatriculaId = @id
          AND e.InstitucionId = @institucionId
      `);

    if (!actual.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    const row = actual.recordset[0];

    const activaMismoAnio = await pool.request()
      .input("estudianteId", sql.Int, row.EstudianteId)
      .input("anioLectivoId", sql.Int, row.AnioLectivoId)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND AnioLectivoId = @anioLectivoId
          AND Estado = N'Activa'
          AND MatriculaId <> @id
      `);

    if (activaMismoAnio.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_ACTIVA_EN_ANIO",
        message: "No se puede reactivar porque el estudiante ya tiene otra matrícula activa en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Matricula
        SET
          Estado = N'Activa',
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE MatriculaId = @id
          AND EXISTS (
            SELECT 1
            FROM dbo.Estudiante e
            WHERE e.EstudianteId = dbo.Matricula.EstudianteId
              AND e.InstitucionId = @institucionId
          )
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Matrícula reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar matrícula"
    });
  }
});

router.put("/matriculas/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { estudianteId, grupoId, anioLectivoId, fechaMatricula, observacion } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(estudianteId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId)) {
      return badRequest(res, "estudianteId, grupoId y anioLectivoId son obligatorios");
    }

    const pool = await getPool();

    const activaMismoAnio = await pool.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND AnioLectivoId = @anioLectivoId
          AND Estado = N'Activa'
          AND MatriculaId <> @id
      `);

    if (activaMismoAnio.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_ACTIVA_EN_ANIO",
        message: "El estudiante ya tiene otra matrícula activa en ese año lectivo"
      });
    }

    const duplicada = await pool.request()
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND MatriculaId <> @id
      `);

    if (duplicada.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe otra matrícula para este estudiante en ese grupo y año"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("estudianteId", sql.Int, Number(estudianteId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("fechaMatricula", sql.Date, fechaMatricula || null)
      .input("observacion", sql.NVarChar, observacion || null)
      .query(`
        UPDATE dbo.Matricula
        SET
          EstudianteId = @estudianteId,
          GrupoId = @grupoId,
          AnioLectivoId = @anioLectivoId,
          FechaMatricula = ISNULL(@fechaMatricula, FechaMatricula),
          Observacion = @observacion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE MatriculaId = @id
          AND EXISTS (
            SELECT 1
            FROM dbo.Estudiante e
            WHERE e.EstudianteId = dbo.Matricula.EstudianteId
              AND e.InstitucionId = @institucionId
          )
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Matrícula actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar matrícula:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_DUPLICADA",
        message: "Ya existe otra matrícula para este estudiante en ese grupo y año"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar matrícula"
    });
  }
});

router.delete("/matriculas/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.Matricula
        SET
          Estado = N'Inactiva',
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MatriculaId
        WHERE MatriculaId = @id
          AND EXISTS (
            SELECT 1
            FROM dbo.Estudiante e
            WHERE e.EstudianteId = dbo.Matricula.EstudianteId
              AND e.InstitucionId = @institucionId
          )
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    return ok(res, { MatriculaId: id }, "Matrícula desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar matrícula"
    });
  }
});

router.patch("/matriculas/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const actual = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          m.MatriculaId,
          m.EstudianteId,
          m.AnioLectivoId
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        WHERE m.MatriculaId = @id
          AND e.InstitucionId = @institucionId
      `);

    if (!actual.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Matrícula no encontrada"
      });
    }

    const row = actual.recordset[0];

    const activaMismoAnio = await pool.request()
      .input("estudianteId", sql.Int, row.EstudianteId)
      .input("anioLectivoId", sql.Int, row.AnioLectivoId)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaId
        FROM dbo.Matricula
        WHERE EstudianteId = @estudianteId
          AND AnioLectivoId = @anioLectivoId
          AND Estado = N'Activa'
          AND MatriculaId <> @id
      `);

    if (activaMismoAnio.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "MATRICULA_ACTIVA_EN_ANIO",
        message: "El estudiante ya tiene una matrícula activa en ese año lectivo"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Matricula
        SET
          Estado = N'Activa',
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.MatriculaId
        WHERE MatriculaId = @id
      `);

    return ok(res, { MatriculaId: id }, "Matrícula reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar matrícula:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar matrícula"
    });
  }
});

/* =========================================================
   ASIGNACION DOCENTE
   ========================================================= */
router.get("/asignaciones-docentes", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          ad.AsignacionDocenteId,
          ad.InstitucionId,
          ad.UsuarioId,
          ad.GrupoId,
          ad.MateriaId,
          ad.AnioLectivoId,
          ad.PeriodoId,
          ad.TipoAsignacion,
          ad.Activo,
          ad.CreatedAt,
          ad.UpdatedAt,
          u.Correo,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          a.Nombre AS AnioNombre,
          p.Nombre AS PeriodoNombre
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Usuario u
          ON u.UsuarioId = ad.UsuarioId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = ad.GrupoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Materia m
          ON m.MateriaId = ad.MateriaId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = ad.PeriodoId
        WHERE ad.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR ad.Activo = 1)
          AND (
            @q = '%%'
            OR u.Correo LIKE @q
            OR u.Nombre LIKE @q
            OR u.PrimerApellido LIKE @q
            OR u.SegundoApellido LIKE @q
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR a.Nombre LIKE @q
            OR ISNULL(m.Nombre, '') LIKE @q
            OR ad.TipoAsignacion LIKE @q
          )
        ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre, ad.AsignacionDocenteId
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar asignaciones docentes:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar asignaciones docentes"
    });
  }
});

router.post("/asignaciones-docentes", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const {
      usuarioId,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      tipoAsignacion
    } = req.body;

    if (!isValidNonNegativeId(usuarioId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId) || !tipoAsignacion) {
      return badRequest(res, "usuarioId, grupoId, anioLectivoId y tipoAsignacion son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, Number(usuarioId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, materiaId ?? null)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
      .query(`
        SELECT TOP 1 AsignacionDocenteId
        FROM dbo.AsignacionDocente
        WHERE InstitucionId = @institucionId
          AND UsuarioId = @usuarioId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND TipoAsignacion = @tipoAsignacion
          AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
          AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "ASIGNACION_DOCENTE_DUPLICADA",
        message: "Ya existe una asignación docente con esos datos"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, Number(usuarioId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, materiaId ?? null)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
      .query(`
        INSERT INTO dbo.AsignacionDocente
        (
          InstitucionId,
          UsuarioId,
          GrupoId,
          MateriaId,
          AnioLectivoId,
          PeriodoId,
          TipoAsignacion,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @usuarioId,
          @grupoId,
          @materiaId,
          @anioLectivoId,
          @periodoId,
          @tipoAsignacion,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Asignación docente creada correctamente");
  } catch (error: any) {
    console.error("Error al crear asignación docente:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "ASIGNACION_DOCENTE_DUPLICADA",
        message: "Ya existe una asignación docente con esos datos"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear asignación docente"
    });
  }
});

router.put("/asignaciones-docentes/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const {
      usuarioId,
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId,
      tipoAsignacion
    } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(usuarioId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId) || !tipoAsignacion) {
      return badRequest(res, "usuarioId, grupoId, anioLectivoId y tipoAsignacion son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, Number(usuarioId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, materiaId ?? null)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 AsignacionDocenteId
        FROM dbo.AsignacionDocente
        WHERE InstitucionId = @institucionId
          AND UsuarioId = @usuarioId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND TipoAsignacion = @tipoAsignacion
          AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
          AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
          AND AsignacionDocenteId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "ASIGNACION_DOCENTE_DUPLICADA",
        message: "Ya existe otra asignación docente con esos datos"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, Number(usuarioId))
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, materiaId ?? null)
      .input("anioLectivoId", sql.Int, Number(anioLectivoId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET
          UsuarioId = @usuarioId,
          GrupoId = @grupoId,
          MateriaId = @materiaId,
          AnioLectivoId = @anioLectivoId,
          PeriodoId = @periodoId,
          TipoAsignacion = @tipoAsignacion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE AsignacionDocenteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Asignación docente no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Asignación docente actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar asignación docente:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "ASIGNACION_DOCENTE_DUPLICADA",
        message: "Ya existe otra asignación docente con esos datos"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar asignación docente"
    });
  }
});

router.delete("/asignaciones-docentes/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AsignacionDocenteId
        WHERE AsignacionDocenteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Asignación docente no encontrada"
      });
    }

    return ok(res, { AsignacionDocenteId: id }, "Asignación docente desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar asignación docente:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar asignación docente"
    });
  }
});

router.patch("/asignaciones-docentes/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AsignacionDocenteId
        WHERE AsignacionDocenteId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Asignación docente no encontrada"
      });
    }

    return ok(res, { AsignacionDocenteId: id }, "Asignación docente reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar asignación docente:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar asignación docente"
    });
  }
});

/* =========================================================
   PROFE GUIA 12
   ========================================================= */
router.get("/profes-guia-12", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";
    const requestedAnioLectivoId = Number(req.query.anioLectivoId || 0);

    const pool = await getPool();

    const aniosResult = await pool.request()
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
        ORDER BY
          CASE
            WHEN CAST(GETDATE() AS DATE) BETWEEN ISNULL(FechaInicio, '19000101') AND ISNULL(FechaFin, '29991231') THEN 0
            ELSE 1
          END,
          FechaInicio DESC,
          AnioLectivoId DESC
      `);

    const aniosLectivos = aniosResult.recordset;
    const anioLectivoActivo = aniosLectivos.find((item: any) => Number(item.AnioLectivoId) === requestedAnioLectivoId)
      || aniosLectivos[0]
      || null;
    const anioLectivoId = anioLectivoActivo ? Number(anioLectivoActivo.AnioLectivoId) : 0;

    const docentesPromise = getDocentesProfeGuia12Catalogo(pool, institucionId);

    if (!anioLectivoId) {
      const docentes = await docentesPromise;
      return ok(res, {
        aniosLectivos,
        anioLectivoActivo: null,
        anioLectivoId: null,
        grupos: [],
        docentes: docentes.recordset,
        asignaciones: []
      });
    }

    const [grupos, asignaciones, docentes] = await Promise.all([
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .query(`
          SELECT
            g.GrupoId,
            g.AnioLectivoId,
            g.Nombre,
            g.Nivel,
            g.NivelAcademico,
            g.Jornada,
            g.Activo,
            a.Nombre AS AnioNombre
          FROM dbo.Grupo g
          INNER JOIN dbo.AnioLectivo a
            ON a.AnioLectivoId = g.AnioLectivoId
          WHERE g.InstitucionId = @institucionId
            AND g.AnioLectivoId = @anioLectivoId
            AND g.Activo = 1
            AND ${grupoDuodecimoWhereSql("g")}
          ORDER BY ${grupoOrdenSeccionSql("g")}
        `),
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("incluirInactivos", sql.Bit, incluirInactivos)
        .query(`
          SELECT
            ad.AsignacionDocenteId,
            ad.InstitucionId,
            ad.UsuarioId,
            ad.GrupoId,
            ad.MateriaId,
            ad.AnioLectivoId,
            ad.PeriodoId,
            ad.TipoAsignacion,
            ad.Activo,
            ad.CreatedAt,
            ad.UpdatedAt,
            u.Correo,
            u.Nombre,
            u.PrimerApellido,
            u.SegundoApellido,
            g.Nombre AS GrupoNombre,
            g.Nivel AS GrupoNivel,
            g.NivelAcademico AS GrupoNivelAcademico,
            NULL AS MateriaNombre,
            a.Nombre AS AnioNombre,
            NULL AS PeriodoNombre
          FROM dbo.AsignacionDocente ad
          INNER JOIN dbo.Usuario u
            ON u.UsuarioId = ad.UsuarioId
          INNER JOIN dbo.Grupo g
            ON g.GrupoId = ad.GrupoId
          INNER JOIN dbo.AnioLectivo a
            ON a.AnioLectivoId = ad.AnioLectivoId
          WHERE ad.InstitucionId = @institucionId
            AND ad.AnioLectivoId = @anioLectivoId
            AND (@incluirInactivos = 1 OR ad.Activo = 1)
            AND ad.TipoAsignacion = N'PROFESOR_GUIA'
            AND ad.MateriaId IS NULL
            AND ad.PeriodoId IS NULL
            AND ${grupoDuodecimoWhereSql("g")}
          ORDER BY ${grupoOrdenSeccionSql("g")}, ad.Activo DESC, ad.AsignacionDocenteId DESC
        `),
      docentesPromise
    ]);

    return ok(res, {
      aniosLectivos,
      anioLectivoActivo,
      anioLectivoId,
      grupos: grupos.recordset,
      docentes: docentes.recordset,
      asignaciones: asignaciones.recordset
    });
  } catch (error) {
    console.error("Error al listar profes guía 12:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar profesores guía de duodécimo"
    });
  }
});

async function validateProfeGuia12Input(pool: any, institucionId: number, payload: any) {
  const usuarioId = Number(payload.usuarioId);
  const grupoId = Number(payload.grupoId);
  const anioLectivoId = Number(payload.anioLectivoId);

  if (!isValidNonNegativeId(usuarioId) || !isValidNonNegativeId(grupoId) || !isValidNonNegativeId(anioLectivoId)) {
    throw Object.assign(new Error("Docente, sección y año lectivo son obligatorios"), { statusCode: 400 });
  }

  const docente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, usuarioId)
    .query(`
      SELECT TOP 1 u.UsuarioId
      FROM dbo.Usuario u
      INNER JOIN dbo.UsuarioRol ur
        ON ur.UsuarioId = u.UsuarioId
       AND ur.Activo = 1
      INNER JOIN dbo.Rol r
        ON r.RolId = ur.RolId
      WHERE u.InstitucionId = @institucionId
        AND u.UsuarioId = @usuarioId
        AND u.Activo = 1
        AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
    `);

  if (!docente.recordset.length) {
    throw Object.assign(new Error("El docente seleccionado no existe o no está activo en este colegio"), { statusCode: 400 });
  }

  const grupo = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .query(`
      SELECT TOP 1
        g.GrupoId,
        g.AnioLectivoId,
        g.Nombre,
        g.Nivel,
        g.NivelAcademico
      FROM dbo.Grupo g
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = g.AnioLectivoId
      WHERE g.InstitucionId = @institucionId
        AND g.GrupoId = @grupoId
        AND g.AnioLectivoId = @anioLectivoId
        AND g.Activo = 1
        AND a.Activo = 1
        AND ${grupoDuodecimoWhereSql("g")}
    `);

  if (!grupo.recordset.length) {
    throw Object.assign(new Error("La sección seleccionada no pertenece al año lectivo activo o no es de duodécimo"), { statusCode: 400 });
  }

  return { usuarioId, grupoId, anioLectivoId };
}

router.post("/profes-guia-12", async (req, res) => {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return;

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const { usuarioId, grupoId, anioLectivoId } = await validateProfeGuia12Input(pool, institucionId, req.body);

    await transaction.begin();

    await transaction.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET Activo = 0,
            UpdatedAt = SYSDATETIME()
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND Activo = 1
          AND TipoAsignacion = N'PROFESOR_GUIA'
          AND MateriaId IS NULL
          AND PeriodoId IS NULL
      `);

    const existing = await transaction.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId)
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT TOP 1 AsignacionDocenteId
        FROM dbo.AsignacionDocente
        WHERE InstitucionId = @institucionId
          AND UsuarioId = @usuarioId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND TipoAsignacion = N'PROFESOR_GUIA'
          AND MateriaId IS NULL
          AND PeriodoId IS NULL
        ORDER BY AsignacionDocenteId DESC
      `);

    let asignacionDocenteId = Number(existing.recordset[0]?.AsignacionDocenteId || 0);

    if (asignacionDocenteId) {
      await transaction.request()
        .input("asignacionDocenteId", sql.Int, asignacionDocenteId)
        .input("institucionId", sql.Int, institucionId)
        .query(`
          UPDATE dbo.AsignacionDocente
          SET Activo = 1,
              UpdatedAt = SYSDATETIME()
          WHERE AsignacionDocenteId = @asignacionDocenteId
            AND InstitucionId = @institucionId
        `);
    } else {
      const inserted = await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("usuarioId", sql.Int, usuarioId)
        .input("grupoId", sql.Int, grupoId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .query(`
          INSERT INTO dbo.AsignacionDocente
          (
            InstitucionId,
            UsuarioId,
            GrupoId,
            MateriaId,
            AnioLectivoId,
            PeriodoId,
            TipoAsignacion,
            Activo,
            CreatedAt
          )
          OUTPUT INSERTED.AsignacionDocenteId
          VALUES
          (
            @institucionId,
            @usuarioId,
            @grupoId,
            NULL,
            @anioLectivoId,
            NULL,
            N'PROFESOR_GUIA',
            1,
            SYSDATETIME()
          )
        `);

      asignacionDocenteId = Number(inserted.recordset[0]?.AsignacionDocenteId || 0);
    }

    await transaction.commit();

    const row = await getProfeGuia12AsignacionById(pool, institucionId, asignacionDocenteId);
    return created(res, row, "Profesor guía de duodécimo guardado correctamente");
  } catch (error: any) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}

    console.error("Error al guardar profe guía 12:", error);
    return res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.message || "Error interno al guardar el profesor guía de duodécimo"
    });
  }
});

router.put("/profes-guia-12/:id", async (req, res) => {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return;

  const id = Number(req.params.id);
  if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const { usuarioId, grupoId, anioLectivoId } = await validateProfeGuia12Input(pool, institucionId, req.body);

    const current = await getProfeGuia12AsignacionById(pool, institucionId, id);
    if (!current) {
      return res.status(404).json({ ok: false, message: "Asignación de profesor guía no encontrada" });
    }

    await transaction.begin();

    await transaction.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET Activo = 0,
            UpdatedAt = SYSDATETIME()
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND AnioLectivoId = @anioLectivoId
          AND AsignacionDocenteId <> @id
          AND Activo = 1
          AND TipoAsignacion = N'PROFESOR_GUIA'
          AND MateriaId IS NULL
          AND PeriodoId IS NULL
      `);

    await transaction.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId)
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET UsuarioId = @usuarioId,
            GrupoId = @grupoId,
            MateriaId = NULL,
            AnioLectivoId = @anioLectivoId,
            PeriodoId = NULL,
            TipoAsignacion = N'PROFESOR_GUIA',
            Activo = 1,
            UpdatedAt = SYSDATETIME()
        WHERE AsignacionDocenteId = @id
          AND InstitucionId = @institucionId
      `);

    await transaction.commit();

    const row = await getProfeGuia12AsignacionById(pool, institucionId, id);
    return ok(res, row, "Profesor guía de duodécimo actualizado correctamente");
  } catch (error: any) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}

    console.error("Error al actualizar profe guía 12:", error);
    return res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.message || "Error interno al actualizar el profesor guía de duodécimo"
    });
  }
});

router.delete("/profes-guia-12/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.AsignacionDocente
        SET Activo = 0,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.AsignacionDocenteId
        WHERE AsignacionDocenteId = @id
          AND InstitucionId = @institucionId
          AND TipoAsignacion = N'PROFESOR_GUIA'
          AND MateriaId IS NULL
          AND PeriodoId IS NULL
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ ok: false, message: "Asignación de profesor guía no encontrada" });
    }

    return ok(res, { AsignacionDocenteId: id }, "Profesor guía de duodécimo eliminado correctamente");
  } catch (error) {
    console.error("Error al eliminar profe guía 12:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al eliminar el profesor guía de duodécimo"
    });
  }
});

/* =========================================================
   BLOQUES HORARIOS
   ========================================================= */
router.get("/bloques-horarios", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .query(`
        SELECT
          BloqueHorarioId,
          InstitucionId,
          Nombre,
          HoraInicio,
          HoraFin,
          OrdenVisual,
          CreatedAt,
          UpdatedAt
        FROM dbo.BloqueHorario
        WHERE InstitucionId = @institucionId
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR CONVERT(NVARCHAR(8), HoraInicio, 108) LIKE @q
            OR CONVERT(NVARCHAR(8), HoraFin, 108) LIKE @q
          )
        ORDER BY OrdenVisual, HoraInicio
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar bloques horarios:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar bloques horarios"
    });
  }
});

router.post("/bloques-horarios", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { nombre, horaInicio, horaFin, ordenVisual } = req.body;

    const horaInicioSql = normalizeSqlTime(horaInicio);
    const horaFinSql = normalizeSqlTime(horaFin);

    if (!nombre || !horaInicioSql || !horaFinSql || !isValidNonNegativeId(ordenVisual)) {
      return badRequest(res, "nombre, horaInicio, horaFin y ordenVisual son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("horaInicio", sql.VarChar(8), horaInicioSql)
      .input("horaFin", sql.VarChar(8), horaFinSql)
      .query(`
        SELECT TOP 1 BloqueHorarioId
        FROM dbo.BloqueHorario
        WHERE InstitucionId = @institucionId
          AND (
            Nombre = @nombre
            OR (
              HoraInicio = CAST(@horaInicio AS time)
              AND HoraFin = CAST(@horaFin AS time)
            )
          )
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "BLOQUE_HORARIO_DUPLICADO",
        message: "Ya existe un bloque horario con ese nombre u horario"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("horaInicio", sql.VarChar(8), horaInicioSql)
      .input("horaFin", sql.VarChar(8), horaFinSql)
      .input("ordenVisual", sql.Int, Number(ordenVisual))
      .query(`
        INSERT INTO dbo.BloqueHorario
        (
          InstitucionId,
          Nombre,
          HoraInicio,
          HoraFin,
          OrdenVisual,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @nombre,
          CAST(@horaInicio AS time),
          CAST(@horaFin AS time),
          @ordenVisual,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Bloque horario creado correctamente");
  } catch (error: any) {
    console.error("Error al crear bloque horario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al crear bloque horario"
    });
  }
});

router.put("/bloques-horarios/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { nombre, horaInicio, horaFin, ordenVisual } = req.body;

    const horaInicioSql = normalizeSqlTime(horaInicio);
    const horaFinSql = normalizeSqlTime(horaFin);

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre || !horaInicioSql || !horaFinSql || !isValidNonNegativeId(ordenVisual)) {
      return badRequest(res, "nombre, horaInicio, horaFin y ordenVisual son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("horaInicio", sql.VarChar(8), horaInicioSql)
      .input("horaFin", sql.VarChar(8), horaFinSql)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 BloqueHorarioId
        FROM dbo.BloqueHorario
        WHERE InstitucionId = @institucionId
          AND BloqueHorarioId <> @id
          AND (
            Nombre = @nombre
            OR (
              HoraInicio = CAST(@horaInicio AS time)
              AND HoraFin = CAST(@horaFin AS time)
            )
          )
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "BLOQUE_HORARIO_DUPLICADO",
        message: "Ya existe otro bloque horario con ese nombre u horario"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("horaInicio", sql.VarChar(8), horaInicioSql)
      .input("horaFin", sql.VarChar(8), horaFinSql)
      .input("ordenVisual", sql.Int, Number(ordenVisual))
      .query(`
        UPDATE dbo.BloqueHorario
        SET
          Nombre = @nombre,
          HoraInicio = CAST(@horaInicio AS time),
          HoraFin = CAST(@horaFin AS time),
          OrdenVisual = @ordenVisual,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE BloqueHorarioId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Bloque horario no encontrado"
      });
    }

    return ok(res, result.recordset[0], "Bloque horario actualizado correctamente");
  } catch (error: any) {
    console.error("Error al actualizar bloque horario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar bloque horario"
    });
  }
});

router.delete("/bloques-horarios/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        DELETE FROM dbo.BloqueHorario
        WHERE BloqueHorarioId = @id
          AND InstitucionId = @institucionId
      `);

    return ok(res, { BloqueHorarioId: id }, "Bloque horario eliminado correctamente");
  } catch (error) {
    console.error("Error al eliminar bloque horario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al eliminar bloque horario"
    });
  }
});

/* =========================================================
   MATERIAS POR GRUPO
   ========================================================= */
router.get("/grupos-materia", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          gm.GrupoMateriaId,
          gm.GrupoId,
          gm.MateriaId,
          gm.PeriodoId,
          gm.Activo,
          gm.CreatedAt,
          gm.UpdatedAt,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          m.Codigo AS MateriaCodigo,
          p.Nombre AS PeriodoNombre
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = gm.PeriodoId
        WHERE g.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR gm.Activo = 1)
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR m.Nombre LIKE @q
            OR ISNULL(m.Codigo, '') LIKE @q
            OR ISNULL(p.Nombre, '') LIKE @q
          )
        ORDER BY gm.GrupoMateriaId DESC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar materias por grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar materias por grupo"
    });
  }
});

router.post("/grupos-materia", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { grupoId, materiaId, periodoId } = req.body;

    if (!isValidNonNegativeId(grupoId) || !isValidNonNegativeId(materiaId)) {
      return badRequest(res, "grupoId y materiaId son obligatorios");
    }

    const pool = await getPool();

    const grupoValido = await pool.request()
      .input("grupoId", sql.Int, Number(grupoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 GrupoId
        FROM dbo.Grupo
        WHERE GrupoId = @grupoId
          AND InstitucionId = @institucionId
      `);

    if (!grupoValido.recordset.length) {
      return badRequest(res, "El grupo no pertenece a la institución");
    }

    const materiaValida = await pool.request()
      .input("materiaId", sql.Int, Number(materiaId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 MateriaId
        FROM dbo.Materia
        WHERE MateriaId = @materiaId
          AND InstitucionId = @institucionId
      `);

    if (!materiaValida.recordset.length) {
      return badRequest(res, "La materia no pertenece a la institución");
    }

    const duplicado = await pool.request()
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, Number(materiaId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .query(`
        SELECT TOP 1 GrupoMateriaId, Activo
        FROM dbo.GrupoMateria
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_MATERIA_DUPLICADA",
        message: "Ya existe una parametrización de materia para ese grupo y período"
      });
    }

    const result = await pool.request()
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, Number(materiaId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .query(`
        INSERT INTO dbo.GrupoMateria
        (
          GrupoId,
          MateriaId,
          PeriodoId,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @grupoId,
          @materiaId,
          @periodoId,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Materia por grupo creada correctamente");
  } catch (error: any) {
    console.error("Error al crear materia por grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al crear materia por grupo"
    });
  }
});

router.put("/grupos-materia/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { grupoId, materiaId, periodoId } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(grupoId) || !isValidNonNegativeId(materiaId)) {
      return badRequest(res, "grupoId y materiaId son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, Number(materiaId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 GrupoMateriaId
        FROM dbo.GrupoMateria
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
          AND GrupoMateriaId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "GRUPO_MATERIA_DUPLICADA",
        message: "Ya existe otra parametrización de materia para ese grupo y período"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("grupoId", sql.Int, Number(grupoId))
      .input("materiaId", sql.Int, Number(materiaId))
      .input("periodoId", sql.Int, periodoId ?? null)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE gm
        SET
          GrupoId = @grupoId,
          MateriaId = @materiaId,
          PeriodoId = @periodoId,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE gm.GrupoMateriaId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia por grupo no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Materia por grupo actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar materia por grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar materia por grupo"
    });
  }
});

router.delete("/grupos-materia/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE gm
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoMateriaId
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE gm.GrupoMateriaId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia por grupo no encontrada"
      });
    }

    return ok(res, { GrupoMateriaId: id }, "Materia por grupo desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar materia por grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar materia por grupo"
    });
  }
});

router.patch("/grupos-materia/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE gm
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoMateriaId
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE gm.GrupoMateriaId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Materia por grupo no encontrada"
      });
    }

    return ok(res, { GrupoMateriaId: id }, "Materia por grupo reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar materia por grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar materia por grupo"
    });
  }
});

/* =========================================================
   HORARIO DE CLASES
   ========================================================= */
router.get("/horarios-grupo", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          hg.HorarioGrupoId,
          hg.GrupoMateriaId,
          hg.BloqueHorarioId,
          hg.DiaSemana,
          hg.Activo,
          hg.CreatedAt,
          hg.UpdatedAt,
          g.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.MateriaId,
          m.Nombre AS MateriaNombre,
          p.PeriodoId,
          p.Nombre AS PeriodoNombre,
          bh.Nombre AS BloqueNombre,
          bh.HoraInicio,
          bh.HoraFin
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = gm.PeriodoId
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        WHERE g.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR hg.Activo = 1)
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR m.Nombre LIKE @q
            OR bh.Nombre LIKE @q
            OR CAST(hg.DiaSemana AS NVARCHAR(10)) LIKE @q
          )
        ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre, m.Nombre
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar horarios de grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar horarios de grupo"
    });
  }
});

router.post("/horarios-grupo", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { grupoMateriaId, bloqueHorarioId, diaSemana } = req.body;

    if (!isValidNonNegativeId(grupoMateriaId) || !isValidNonNegativeId(bloqueHorarioId) || !isValidNonNegativeId(diaSemana)) {
      return badRequest(res, "grupoMateriaId, bloqueHorarioId y diaSemana son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("bloqueHorarioId", sql.Int, Number(bloqueHorarioId))
      .input("diaSemana", sql.Int, Number(diaSemana))
      .query(`
        SELECT TOP 1 HorarioGrupoId
        FROM dbo.HorarioGrupo
        WHERE GrupoMateriaId = @grupoMateriaId
          AND BloqueHorarioId = @bloqueHorarioId
          AND DiaSemana = @diaSemana
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "HORARIO_GRUPO_DUPLICADO",
        message: "Ya existe un horario para esa materia, bloque y día"
      });
    }

    const conflictoDocente = await validateHorarioDocenteConflict({
      pool,
      institucionId,
      grupoMateriaId: Number(grupoMateriaId),
      bloqueHorarioId: Number(bloqueHorarioId),
      diaSemana: Number(diaSemana)
    });

    if (conflictoDocente) {
      return res.status(409).json({
        ok: false,
        code: conflictoDocente.code,
        message: conflictoDocente.message,
        data: conflictoDocente.details
      });
    }

    const result = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("bloqueHorarioId", sql.Int, Number(bloqueHorarioId))
      .input("diaSemana", sql.Int, Number(diaSemana))
      .query(`
        INSERT INTO dbo.HorarioGrupo
        (
          GrupoMateriaId,
          BloqueHorarioId,
          DiaSemana,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @grupoMateriaId,
          @bloqueHorarioId,
          @diaSemana,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Horario de clase creado correctamente");
  } catch (error: any) {
    console.error("Error al crear horario de grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al crear horario de clase"
    });
  }
});

router.put("/horarios-grupo/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { grupoMateriaId, bloqueHorarioId, diaSemana } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(grupoMateriaId) || !isValidNonNegativeId(bloqueHorarioId) || !isValidNonNegativeId(diaSemana)) {
      return badRequest(res, "grupoMateriaId, bloqueHorarioId y diaSemana son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("bloqueHorarioId", sql.Int, Number(bloqueHorarioId))
      .input("diaSemana", sql.Int, Number(diaSemana))
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 HorarioGrupoId
        FROM dbo.HorarioGrupo
        WHERE GrupoMateriaId = @grupoMateriaId
          AND BloqueHorarioId = @bloqueHorarioId
          AND DiaSemana = @diaSemana
          AND HorarioGrupoId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "HORARIO_GRUPO_DUPLICADO",
        message: "Ya existe otro horario para esa materia, bloque y día"
      });
    }

    const conflictoDocente = await validateHorarioDocenteConflict({
      pool,
      institucionId,
      grupoMateriaId: Number(grupoMateriaId),
      bloqueHorarioId: Number(bloqueHorarioId),
      diaSemana: Number(diaSemana),
      excludeHorarioGrupoId: id
    });

    if (conflictoDocente) {
      return res.status(409).json({
        ok: false,
        code: conflictoDocente.code,
        message: conflictoDocente.message,
        data: conflictoDocente.details
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("bloqueHorarioId", sql.Int, Number(bloqueHorarioId))
      .input("diaSemana", sql.Int, Number(diaSemana))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE hg
        SET
          GrupoMateriaId = @grupoMateriaId,
          BloqueHorarioId = @bloqueHorarioId,
          DiaSemana = @diaSemana,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE hg.HorarioGrupoId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Horario de clase no encontrado"
      });
    }

    return ok(res, result.recordset[0], "Horario de clase actualizado correctamente");
  } catch (error) {
    console.error("Error al actualizar horario de grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar horario de clase"
    });
  }
});

router.delete("/horarios-grupo/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE hg
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.HorarioGrupoId
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE hg.HorarioGrupoId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Horario de clase no encontrado"
      });
    }

    return ok(res, { HorarioGrupoId: id }, "Horario de clase desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar horario de grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar horario de clase"
    });
  }
});

router.patch("/horarios-grupo/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE hg
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.HorarioGrupoId
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE hg.HorarioGrupoId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Horario de clase no encontrado"
      });
    }

    return ok(res, { HorarioGrupoId: id }, "Horario de clase reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar horario de grupo:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar horario de clase"
    });
  }
});

/* =========================================================
   DIAS LECTIVOS
   ========================================================= */
router.get("/dias-lectivos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          DiaLectivoId,
          InstitucionId,
          DiaSemana,
          Nombre,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.DiaLectivoInstitucion
        WHERE InstitucionId = @institucionId
        ORDER BY CASE WHEN DiaSemana = 1 THEN 8 ELSE DiaSemana END
      `);

    const existentes = result.recordset as any[];
    const merged = DIAS_LECTIVOS_CATALOGO.map((dia) => {
      const found = existentes.find((x) => Number(x.DiaSemana) === Number(dia.DiaSemana));
      return found || {
        DiaLectivoId: null,
        InstitucionId: institucionId,
        DiaSemana: dia.DiaSemana,
        Nombre: dia.Nombre,
        Activo: dia.DiaSemana >= 2 && dia.DiaSemana <= 6,
        CreatedAt: null,
        UpdatedAt: null
      };
    });

    return ok(res, merged);
  } catch (error) {
    console.error("Error al listar días lectivos:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar días lectivos" });
  }
});

router.put("/dias-lectivos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const dias = Array.isArray(req.body?.dias) ? req.body.dias : null;
    if (!dias || !dias.length) {
      return badRequest(res, "Debés enviar la lista de días lectivos");
    }

    const diasNormalizados = dias.map((d: any) => ({
      diaSemana: Number(d.diaSemana),
      activo: Boolean(d.activo)
    }));

    const diasValidos = new Set(DIAS_LECTIVOS_CATALOGO.map((d) => d.DiaSemana));
    if (diasNormalizados.some((d: any) => !diasValidos.has(d.diaSemana))) {
      return badRequest(res, "Hay días de semana inválidos en la solicitud");
    }

    const pool = await getPool();

    for (const diaBase of DIAS_LECTIVOS_CATALOGO) {
      const incoming = diasNormalizados.find((d: any) => d.diaSemana === diaBase.DiaSemana);
      const activo = incoming ? incoming.activo : false;

      await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("diaSemana", sql.Int, diaBase.DiaSemana)
        .input("nombre", sql.NVarChar, diaBase.Nombre)
        .input("activo", sql.Bit, activo)
        .query(`
          MERGE dbo.DiaLectivoInstitucion AS target
          USING (
            SELECT
              @institucionId AS InstitucionId,
              @diaSemana AS DiaSemana,
              @nombre AS Nombre,
              @activo AS Activo
          ) AS source
          ON target.InstitucionId = source.InstitucionId
         AND target.DiaSemana = source.DiaSemana
          WHEN MATCHED THEN
            UPDATE SET
              Nombre = source.Nombre,
              Activo = source.Activo,
              UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (InstitucionId, DiaSemana, Nombre, Activo, CreatedAt)
            VALUES (source.InstitucionId, source.DiaSemana, source.Nombre, source.Activo, SYSDATETIME());
        `);
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          DiaLectivoId,
          InstitucionId,
          DiaSemana,
          Nombre,
          Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.DiaLectivoInstitucion
        WHERE InstitucionId = @institucionId
        ORDER BY CASE WHEN DiaSemana = 1 THEN 8 ELSE DiaSemana END
      `);

    return ok(res, result.recordset, "Días lectivos actualizados correctamente");
  } catch (error) {
    console.error("Error al actualizar días lectivos:", error);
    return res.status(500).json({ ok: false, message: "Error interno al actualizar días lectivos" });
  }
});

/* =========================================================
   FERIADOS
   ========================================================= */
router.get("/feriados", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          FeriadoId, InstitucionId, Fecha, Nombre, Descripcion, Activo, CreatedAt, UpdatedAt
        FROM dbo.FeriadoInstitucional
        WHERE InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR ISNULL(Descripcion, '') LIKE @q
            OR CONVERT(NVARCHAR(10), Fecha, 23) LIKE @q
          )
        ORDER BY Fecha ASC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar feriados:", error);
    return res.status(500).json({ ok: false, message: "Error interno al listar feriados" });
  }
});

router.post("/feriados", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { fecha, nombre, descripcion } = req.body;
    if (!fecha || !nombre) return badRequest(res, "fecha y nombre son obligatorios");

    const pool = await getPool();
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("fecha", sql.Date, fecha)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion || null)
      .query(`
        INSERT INTO dbo.FeriadoInstitucional
        (
          InstitucionId, Fecha, Nombre, Descripcion, Activo, CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId, @fecha, @nombre, @descripcion, 1, SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Feriado creado correctamente");
  } catch (error: any) {
    console.error("Error al crear feriado:", error);
    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({ ok: false, code: "FERIADO_DUPLICADO", message: "Ya existe un feriado registrado para esa fecha" });
    }
    return res.status(500).json({ ok: false, message: "Error interno al crear feriado" });
  }
});

router.put("/feriados/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { fecha, nombre, descripcion } = req.body;
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");
    if (!fecha || !nombre) return badRequest(res, "fecha y nombre son obligatorios");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("fecha", sql.Date, fecha)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion || null)
      .query(`
        UPDATE dbo.FeriadoInstitucional
        SET
          Fecha = @fecha,
          Nombre = @nombre,
          Descripcion = @descripcion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE FeriadoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) return res.status(404).json({ ok: false, message: "Feriado no encontrado" });
    return ok(res, result.recordset[0], "Feriado actualizado correctamente");
  } catch (error: any) {
    console.error("Error al actualizar feriado:", error);
    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({ ok: false, code: "FERIADO_DUPLICADO", message: "Ya existe un feriado registrado para esa fecha" });
    }
    return res.status(500).json({ ok: false, message: "Error interno al actualizar feriado" });
  }
});

router.delete("/feriados/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.FeriadoInstitucional
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.FeriadoId
        WHERE FeriadoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) return res.status(404).json({ ok: false, message: "Feriado no encontrado" });
    return ok(res, { FeriadoId: id }, "Feriado desactivado correctamente");
  } catch (error) {
    console.error("Error al desactivar feriado:", error);
    return res.status(500).json({ ok: false, message: "Error interno al desactivar feriado" });
  }
});

router.patch("/feriados/:id/reactivar", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) return badRequest(res, "Id inválido");

    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.FeriadoInstitucional
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.FeriadoId
        WHERE FeriadoId = @id
          AND InstitucionId = @institucionId
      `);

    if (!result.recordset.length) return res.status(404).json({ ok: false, message: "Feriado no encontrado" });
    return ok(res, { FeriadoId: id }, "Feriado reactivado correctamente");
  } catch (error) {
    console.error("Error al reactivar feriado:", error);
    return res.status(500).json({ ok: false, message: "Error interno al reactivar feriado" });
  }
});

/* =========================================================
   FECHAS DE CLASE
   ========================================================= */
router.get("/fechas-clase", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const q = String(req.query.q || "").trim();

    const pool = await getPool();

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("q", sql.NVarChar, `%${q}%`)
      .query(`
        SELECT
          fc.FechaClaseId,
          fc.HorarioGrupoId,
          fc.Fecha,
          fc.PeriodoId,
          fc.EsExtraordinaria,
          fc.Observacion,
          fc.CreatedAt,
          fc.UpdatedAt,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          p.Nombre AS PeriodoNombre,
          bh.Nombre AS BloqueNombre,
          bh.HoraInicio,
          bh.HoraFin,
          hg.DiaSemana
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        LEFT JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        WHERE g.InstitucionId = @institucionId
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR m.Nombre LIKE @q
            OR ISNULL(p.Nombre, '') LIKE @q
            OR CONVERT(NVARCHAR(10), fc.Fecha, 23) LIKE @q
          )
        ORDER BY fc.Fecha DESC, bh.OrdenVisual
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar fechas de clase:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar fechas de clase"
    });
  }
});

router.post("/fechas-clase", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { horarioGrupoId, fecha, periodoId, esExtraordinaria, observacion } = req.body;

    if (!isValidNonNegativeId(horarioGrupoId) || !fecha || !isValidNonNegativeId(periodoId)) {
      return badRequest(res, "horarioGrupoId, fecha y periodoId son obligatorios");
    }

    const pool = await getPool();

    const horarioValido = await pool.request()
      .input("horarioGrupoId", sql.Int, Number(horarioGrupoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 hg.HorarioGrupoId
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE hg.HorarioGrupoId = @horarioGrupoId
          AND g.InstitucionId = @institucionId
      `);

    if (!horarioValido.recordset.length) {
      return badRequest(res, "El horario no pertenece a la institución");
    }

    const duplicado = await pool.request()
      .input("horarioGrupoId", sql.Int, Number(horarioGrupoId))
      .input("fecha", sql.Date, fecha)
      .query(`
        SELECT TOP 1 FechaClaseId
        FROM dbo.FechaClase
        WHERE HorarioGrupoId = @horarioGrupoId
          AND Fecha = @fecha
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "FECHA_CLASE_DUPLICADA",
        message: "Ya existe una fecha de clase para ese horario y esa fecha"
      });
    }

    const result = await pool.request()
      .input("horarioGrupoId", sql.Int, Number(horarioGrupoId))
      .input("fecha", sql.Date, fecha)
      .input("periodoId", sql.Int, Number(periodoId))
      .input("esExtraordinaria", sql.Bit, esExtraordinaria ? 1 : 0)
      .input("observacion", sql.NVarChar, observacion || null)
      .query(`
        INSERT INTO dbo.FechaClase
        (
          HorarioGrupoId,
          Fecha,
          PeriodoId,
          EsExtraordinaria,
          Observacion,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @horarioGrupoId,
          @fecha,
          @periodoId,
          @esExtraordinaria,
          @observacion,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Fecha de clase creada correctamente");
  } catch (error) {
    console.error("Error al crear fecha de clase:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al crear fecha de clase"
    });
  }
});

router.put("/fechas-clase/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    const { horarioGrupoId, fecha, periodoId, esExtraordinaria, observacion } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!isValidNonNegativeId(horarioGrupoId) || !fecha || !isValidNonNegativeId(periodoId)) {
      return badRequest(res, "horarioGrupoId, fecha y periodoId son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("horarioGrupoId", sql.Int, Number(horarioGrupoId))
      .input("fecha", sql.Date, fecha)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 FechaClaseId
        FROM dbo.FechaClase
        WHERE HorarioGrupoId = @horarioGrupoId
          AND Fecha = @fecha
          AND FechaClaseId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "FECHA_CLASE_DUPLICADA",
        message: "Ya existe otra fecha de clase para ese horario y esa fecha"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("horarioGrupoId", sql.Int, Number(horarioGrupoId))
      .input("fecha", sql.Date, fecha)
      .input("periodoId", sql.Int, Number(periodoId))
      .input("esExtraordinaria", sql.Bit, esExtraordinaria ? 1 : 0)
      .input("observacion", sql.NVarChar, observacion || null)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE fc
        SET
          HorarioGrupoId = @horarioGrupoId,
          Fecha = @fecha,
          PeriodoId = @periodoId,
          EsExtraordinaria = @esExtraordinaria,
          Observacion = @observacion,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE fc.FechaClaseId = @id
          AND g.InstitucionId = @institucionId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Fecha de clase no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Fecha de clase actualizada correctamente");
  } catch (error) {
    console.error("Error al actualizar fecha de clase:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar fecha de clase"
    });
  }
});

router.delete("/fechas-clase/:id", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const id = Number(req.params.id);
    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        DELETE fc
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE fc.FechaClaseId = @id
          AND g.InstitucionId = @institucionId
      `);

    return ok(res, { FechaClaseId: id }, "Fecha de clase eliminada correctamente");
  } catch (error) {
    console.error("Error al eliminar fecha de clase:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al eliminar fecha de clase"
    });
  }
});

router.post("/fechas-clase/sync-periodo/preview", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const { periodoId, fechaCorte } = req.body;

    if (!isValidNonNegativeId(periodoId)) {
      return badRequest(res, "periodoId es obligatorio");
    }

    const pool = await getPool();
    const preview = await buildFechaClaseSyncPreview(
      pool,
      institucionId,
      Number(periodoId),
      fechaCorte || null
    );

    return ok(res, preview, "Vista previa de sincronización generada correctamente");
  } catch (error: any) {
    console.error("Error al generar la vista previa de fechas de clase:", error);
    return res.status(getFechaClaseSyncErrorStatus(error)).json({
      ok: false,
      message: error?.message || "Error interno al generar la vista previa de fechas de clase"
    });
  }
});

router.post("/fechas-clase/sync-periodo/apply", async (req, res) => {
  const institucionId = getInstitutionId(req, res);
  if (institucionId === null) return;

  const { periodoId, fechaCorte } = req.body;

  if (!isValidNonNegativeId(periodoId)) {
    return badRequest(res, "periodoId es obligatorio");
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    const preview = await buildFechaClaseSyncPreview(
      pool,
      institucionId,
      Number(periodoId),
      fechaCorte || null
    );

    await transaction.begin();

    let totalEliminadas = 0;
    let totalCreadas = 0;

    for (const item of preview.eliminar) {
      const deleteResult = await transaction.request()
        .input("fechaClaseId", sql.Int, Number(item.FechaClaseId))
        .query(`
          DELETE FROM dbo.FechaClase
          WHERE FechaClaseId = @fechaClaseId
        `);

      totalEliminadas += deleteResult.rowsAffected?.[0] || 0;
    }

    for (const item of preview.crear) {
      const existsResult = await transaction.request()
        .input("horarioGrupoId", sql.Int, Number(item.HorarioGrupoId))
        .input("fecha", sql.Date, item.Fecha)
        .query(`
          SELECT TOP 1 FechaClaseId
          FROM dbo.FechaClase
          WHERE HorarioGrupoId = @horarioGrupoId
            AND Fecha = @fecha
        `);

      if (existsResult.recordset.length) continue;

      await transaction.request()
        .input("horarioGrupoId", sql.Int, Number(item.HorarioGrupoId))
        .input("fecha", sql.Date, item.Fecha)
        .input("periodoId", sql.Int, Number(periodoId))
        .query(`
          INSERT INTO dbo.FechaClase
          (
            HorarioGrupoId,
            Fecha,
            PeriodoId,
            EsExtraordinaria,
            Observacion,
            CreatedAt
          )
          VALUES
          (
            @horarioGrupoId,
            @fecha,
            @periodoId,
            0,
            N'Sincronizada por período',
            SYSDATETIME()
          )
        `);

      totalCreadas += 1;
    }

    await writeFechaClaseSyncLogIfAvailable(transaction, {
      InstitucionId: institucionId,
      PeriodoId: Number(periodoId),
      FechaCorteSolicitada: preview.fechaCorteSolicitada,
      FechaCorteAplicada: preview.fechaCorteAplicada,
      Modo: "SYNC",
      UsuarioId: req.auth?.usuarioId ? Number(req.auth.usuarioId) : null,
      Resumen: {
        ...preview.resumen,
        aplicadasCrear: totalCreadas,
        aplicadasEliminar: totalEliminadas
      }
    });

    await transaction.commit();

    return ok(
      res,
      {
        ...preview,
        aplicado: {
          crear: totalCreadas,
          eliminar: totalEliminadas
        }
      },
      "Sincronización aplicada correctamente sobre fechas futuras"
    );
  } catch (error: any) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}

    console.error("Error al aplicar la sincronización de fechas de clase:", error);
    return res.status(getFechaClaseSyncErrorStatus(error)).json({
      ok: false,
      message: error?.message || "Error interno al aplicar la sincronización de fechas de clase"
    });
  }
});
/* =========================================================
   FECHAS DE CLASE - GENERACION AUTOMATICA
   ========================================================= */
router.post("/fechas-clase/generar-automatico", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const {
      grupoMateriaId,
      periodoId,
      bloqueHorarioIdInicial,
      diaSemana,
      cantidadLeccionesPorDia
    } = req.body;

    if (
      !isValidNonNegativeId(grupoMateriaId) ||
      !isValidNonNegativeId(periodoId) ||
      !isValidNonNegativeId(bloqueHorarioIdInicial) ||
      !isValidNonNegativeId(diaSemana) ||
      !isValidNonNegativeId(cantidadLeccionesPorDia) ||
      Number(cantidadLeccionesPorDia) < 1
    ) {
      return badRequest(
        res,
        "grupoMateriaId, periodoId, bloqueHorarioIdInicial, diaSemana y cantidadLeccionesPorDia son obligatorios"
      );
    }

    const pool = await getPool();

    const grupoMateriaResult = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          gm.GrupoMateriaId,
          gm.GrupoId,
          gm.MateriaId,
          gm.PeriodoId,
          g.InstitucionId
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE gm.GrupoMateriaId = @grupoMateriaId
          AND g.InstitucionId = @institucionId
      `);

    if (!grupoMateriaResult.recordset.length) {
      return badRequest(res, "La materia por grupo no pertenece a la institución");
    }

    const periodoResult = await pool.request()
      .input("periodoId", sql.Int, Number(periodoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          p.PeriodoId,
          p.AnioLectivoId,
          p.FechaInicio,
          p.FechaFin
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @periodoId
          AND a.InstitucionId = @institucionId
      `);

    if (!periodoResult.recordset.length) {
      return badRequest(res, "El período no pertenece a la institución");
    }

    const periodo = periodoResult.recordset[0];

    if (!periodo.FechaInicio || !periodo.FechaFin) {
      return badRequest(res, "El período seleccionado no tiene fecha de inicio y fin definidas");
    }

    const bloqueInicialResult = await pool.request()
      .input("bloqueHorarioIdInicial", sql.Int, Number(bloqueHorarioIdInicial))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          BloqueHorarioId,
          Nombre,
          HoraInicio,
          HoraFin,
          OrdenVisual
        FROM dbo.BloqueHorario
        WHERE BloqueHorarioId = @bloqueHorarioIdInicial
          AND InstitucionId = @institucionId
      `);

    if (!bloqueInicialResult.recordset.length) {
      return badRequest(res, "El bloque horario inicial no pertenece a la institución");
    }

    const bloqueInicial = bloqueInicialResult.recordset[0];

    const bloquesConsecutivos = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("ordenVisual", sql.Int, Number(bloqueInicial.OrdenVisual))
      .input("cantidad", sql.Int, Number(cantidadLeccionesPorDia))
      .query(`
        SELECT TOP (@cantidad)
          BloqueHorarioId,
          Nombre,
          HoraInicio,
          HoraFin,
          OrdenVisual
        FROM dbo.BloqueHorario
        WHERE InstitucionId = @institucionId
          AND OrdenVisual >= @ordenVisual
        ORDER BY OrdenVisual ASC
      `);

    if (bloquesConsecutivos.recordset.length !== Number(cantidadLeccionesPorDia)) {
      return badRequest(
        res,
        "No existen suficientes bloques consecutivos desde la sesión inicial para cubrir la cantidad de lecciones por día"
      );
    }

    const grupoMateria = grupoMateriaResult.recordset[0];
    const startDate = new Date(periodo.FechaInicio);
    const endDate = new Date(periodo.FechaFin);

    const fechasObjetivo = enumerateDatesBetween(startDate, endDate).filter(
      (d) => jsDayToSqlWeekday(d.getDay()) === Number(diaSemana)
    );

    if (!fechasObjetivo.length) {
      return badRequest(res, "No se encontraron fechas válidas dentro del rango del período para ese día");
    }

    const feriadosResult = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("fechaInicio", sql.Date, periodo.FechaInicio)
      .input("fechaFin", sql.Date, periodo.FechaFin)
      .query(`
        SELECT Fecha
        FROM dbo.FeriadoInstitucional
        WHERE InstitucionId = @institucionId
          AND Activo = 1
          AND Fecha BETWEEN @fechaInicio AND @fechaFin
      `);

    const feriadosSet = new Set(
      feriadosResult.recordset.map((x: any) => String(x.Fecha).slice(0, 10))
    );

    const horariosCreados: number[] = [];
    const fechasInsertadas: Array<{ FechaClaseId: number; Fecha: string; HorarioGrupoId: number }> = [];
    const conflictos: string[] = [];
    const omitidasPorFeriado: string[] = [];

    for (const bloque of bloquesConsecutivos.recordset) {
      const horarioExistente = await pool.request()
        .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
        .input("bloqueHorarioId", sql.Int, Number(bloque.BloqueHorarioId))
        .input("diaSemana", sql.Int, Number(diaSemana))
        .query(`
          SELECT TOP 1 HorarioGrupoId
          FROM dbo.HorarioGrupo
          WHERE GrupoMateriaId = @grupoMateriaId
            AND BloqueHorarioId = @bloqueHorarioId
            AND DiaSemana = @diaSemana
        `);

      let horarioGrupoId: number;

      if (horarioExistente.recordset.length) {
        horarioGrupoId = Number(horarioExistente.recordset[0].HorarioGrupoId);
      } else {
        const nuevoHorario = await pool.request()
          .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
          .input("bloqueHorarioId", sql.Int, Number(bloque.BloqueHorarioId))
          .input("diaSemana", sql.Int, Number(diaSemana))
          .query(`
            INSERT INTO dbo.HorarioGrupo
            (
              GrupoMateriaId,
              BloqueHorarioId,
              DiaSemana,
              Activo,
              CreatedAt
            )
            OUTPUT INSERTED.HorarioGrupoId
            VALUES
            (
              @grupoMateriaId,
              @bloqueHorarioId,
              @diaSemana,
              1,
              SYSDATETIME()
            )
          `);

        horarioGrupoId = Number(nuevoHorario.recordset[0].HorarioGrupoId);
        horariosCreados.push(horarioGrupoId);
      }

      for (const fecha of fechasObjetivo) {
        const fechaStr = fecha.toISOString().slice(0, 10);

        if (feriadosSet.has(fechaStr)) {
          if (!omitidasPorFeriado.includes(fechaStr)) omitidasPorFeriado.push(fechaStr);
          continue;
        }

        const choque = await pool.request()
          .input("grupoId", sql.Int, Number(grupoMateria.GrupoId))
          .input("fecha", sql.Date, fechaStr)
          .input("bloqueHorarioId", sql.Int, Number(bloque.BloqueHorarioId))
          .query(`
            SELECT TOP 1
              fc.FechaClaseId
            FROM dbo.FechaClase fc
            INNER JOIN dbo.HorarioGrupo hg
              ON hg.HorarioGrupoId = fc.HorarioGrupoId
            INNER JOIN dbo.GrupoMateria gm
              ON gm.GrupoMateriaId = hg.GrupoMateriaId
            WHERE gm.GrupoId = @grupoId
              AND fc.Fecha = @fecha
              AND hg.BloqueHorarioId = @bloqueHorarioId
          `);

        if (choque.recordset.length > 0) {
          conflictos.push(`Choque en fecha ${fechaStr} para bloque ${bloque.Nombre}`);
          continue;
        }

        const existente = await pool.request()
          .input("horarioGrupoId", sql.Int, horarioGrupoId)
          .input("fecha", sql.Date, fechaStr)
          .query(`
            SELECT TOP 1 FechaClaseId
            FROM dbo.FechaClase
            WHERE HorarioGrupoId = @horarioGrupoId
              AND Fecha = @fecha
          `);

        if (existente.recordset.length) {
          continue;
        }

        const insertResult = await pool.request()
          .input("horarioGrupoId", sql.Int, horarioGrupoId)
          .input("fecha", sql.Date, fechaStr)
          .input("periodoId", sql.Int, Number(periodoId))
          .query(`
            INSERT INTO dbo.FechaClase
            (
              HorarioGrupoId,
              Fecha,
              PeriodoId,
              EsExtraordinaria,
              Observacion,
              CreatedAt
            )
            OUTPUT INSERTED.FechaClaseId, INSERTED.Fecha, INSERTED.HorarioGrupoId
            VALUES
            (
              @horarioGrupoId,
              @fecha,
              @periodoId,
              0,
              N'Generada automáticamente',
              SYSDATETIME()
            )
          `);

        fechasInsertadas.push({
          FechaClaseId: Number(insertResult.recordset[0].FechaClaseId),
          Fecha: String(insertResult.recordset[0].Fecha).slice(0, 10),
          HorarioGrupoId: Number(insertResult.recordset[0].HorarioGrupoId)
        });
      }
    }

    return created(
      res,
      {
        totalFechasInsertadas: fechasInsertadas.length,
        fechasInsertadas,
        horariosCreados,
        conflictos,
        omitidasPorFeriado
      },
      "Fechas de clase generadas correctamente"
    );
  } catch (error) {
    console.error("Error al generar fechas de clase automáticamente:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al generar fechas de clase automáticamente"
    });
  }
});

/* =========================================================
   FECHAS DE CLASE - REPROGRAMAR DESDE FECHA
   ========================================================= */
router.post("/fechas-clase/reprogramar-desde", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const {
      grupoMateriaId,
      periodoId,
      fechaDesde,
      bloqueHorarioIdInicialNuevo,
      diaSemanaNuevo,
      cantidadLeccionesPorDiaNueva
    } = req.body;

    if (
      !isValidNonNegativeId(grupoMateriaId) ||
      !isValidNonNegativeId(periodoId) ||
      !fechaDesde ||
      !isValidNonNegativeId(bloqueHorarioIdInicialNuevo) ||
      !isValidNonNegativeId(diaSemanaNuevo) ||
      !isValidNonNegativeId(cantidadLeccionesPorDiaNueva) ||
      Number(cantidadLeccionesPorDiaNueva) < 1
    ) {
      return badRequest(
        res,
        "grupoMateriaId, periodoId, fechaDesde, bloqueHorarioIdInicialNuevo, diaSemanaNuevo y cantidadLeccionesPorDiaNueva son obligatorios"
      );
    }

    const pool = await getPool();

    const grupoMateriaResult = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          gm.GrupoMateriaId,
          gm.GrupoId,
          gm.MateriaId
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        WHERE gm.GrupoMateriaId = @grupoMateriaId
          AND g.InstitucionId = @institucionId
      `);

    if (!grupoMateriaResult.recordset.length) {
      return badRequest(res, "La materia por grupo no pertenece a la institución");
    }

    const periodoResult = await pool.request()
      .input("periodoId", sql.Int, Number(periodoId))
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          p.PeriodoId,
          p.FechaInicio,
          p.FechaFin
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @periodoId
          AND a.InstitucionId = @institucionId
      `);

    if (!periodoResult.recordset.length) {
      return badRequest(res, "El período no pertenece a la institución");
    }

    const periodo = periodoResult.recordset[0];

    if (!periodo.FechaFin) {
      return badRequest(res, "El período no tiene fecha fin definida");
    }

    const startDate = new Date(fechaDesde);
    const endDate = new Date(periodo.FechaFin);

    if (startDate > endDate) {
      return badRequest(res, "La fechaDesde no puede ser mayor que la fecha fin del período");
    }

    const fechasConAsistencia = await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("fechaDesde", sql.Date, fechaDesde)
      .query(`
        SELECT TOP 1 fc.FechaClaseId
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.AsistenciaSesion s
          ON s.FechaClaseId = fc.FechaClaseId
        WHERE hg.GrupoMateriaId = @grupoMateriaId
          AND fc.Fecha >= @fechaDesde
      `);

    if (fechasConAsistencia.recordset.length > 0) {
      return badRequest(
        res,
        "No se puede reprogramar desde esa fecha porque ya existen asistencias registradas en fechas futuras de esa materia"
      );
    }

    await pool.request()
      .input("grupoMateriaId", sql.Int, Number(grupoMateriaId))
      .input("fechaDesde", sql.Date, fechaDesde)
      .query(`
        DELETE fc
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        WHERE hg.GrupoMateriaId = @grupoMateriaId
          AND fc.Fecha >= @fechaDesde
      `);

    const fakeReq: any = {
      ...req,
      body: {
        grupoMateriaId,
        periodoId,
        bloqueHorarioIdInicial: bloqueHorarioIdInicialNuevo,
        diaSemana: diaSemanaNuevo,
        cantidadLeccionesPorDia: cantidadLeccionesPorDiaNueva
      }
    };

    return (router as any).handle(
      {
        ...fakeReq,
        method: "POST",
        url: "/fechas-clase/generar-automatico"
      },
      res,
      () => {}
    );
  } catch (error) {
    console.error("Error al reprogramar fechas de clase:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reprogramar fechas de clase"
    });
  }
});

type AcademicoBulkImportKind =
  | "grupos"
  | "materias"
  | "asignaciones-docentes"
  | "grupos-materia"
  | "horarios-grupo"
  | "feriados";

type AcademicoBulkImportResultRow = {
  fila: number;
  referencia: string;
  estado: "CREADO" | "REACTIVADO" | "OMITIDO" | "ERROR";
  motivo: string;
};

type AcademicoBulkImportJob = {
  id: string;
  kind: AcademicoBulkImportKind;
  institucionId: number;
  status: "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";
  totalRegistros: number;
  procesados: number;
  totalOk: number;
  totalError: number;
  totalCreados: number;
  totalReactivados: number;
  totalOmitidos: number;
  resultados: AcademicoBulkImportResultRow[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const academicoBulkImportJobs = new Map<string, AcademicoBulkImportJob>();
const ACADEMICO_BULK_IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

const ACADEMICO_BULK_IMPORT_TEMPLATES: Record<AcademicoBulkImportKind, {
  label: string;
  sheetName: string;
  filename: string;
  instrucciones: Record<string, string>[];
  ejemplo: Record<string, any>[];
}> = {
  grupos: {
    label: "grupos",
    sheetName: "Grupos",
    filename: "plantilla_importacion_grupos.xlsx",
    instrucciones: [
      { Campo: "anio lectivo", Obligatorio: "Si", Descripcion: "Nombre o ID del año lectivo" },
      { Campo: "nombre", Obligatorio: "Si", Descripcion: "Nombre de la sección o grupo. Ejemplo: 7-1" },
      { Campo: "nivel", Obligatorio: "No", Descripcion: "Nivel académico. Ejemplo: Séptimo" },
      { Campo: "jornada", Obligatorio: "No", Descripcion: "Jornada. Ejemplo: Diurna" }
    ],
    ejemplo: [{ "anio lectivo": "2026", nombre: "7-1", nivel: "Séptimo", jornada: "Diurna" }]
  },
  materias: {
    label: "materias",
    sheetName: "Materias",
    filename: "plantilla_importacion_materias.xlsx",
    instrucciones: [
      { Campo: "codigo", Obligatorio: "No", Descripcion: "Código de la materia" },
      { Campo: "nombre", Obligatorio: "Si", Descripcion: "Nombre de la materia" },
      { Campo: "descripcion", Obligatorio: "No", Descripcion: "Descripción de la materia" }
    ],
    ejemplo: [{ codigo: "MAT", nombre: "Matemáticas", descripcion: "Matemáticas" }]
  },
  "asignaciones-docentes": {
    label: "asignaciones docentes",
    sheetName: "Asignaciones",
    filename: "plantilla_importacion_asignaciones_docentes.xlsx",
    instrucciones: [
      { Campo: "correo docente", Obligatorio: "Si", Descripcion: "Correo o ID del docente" },
      { Campo: "anio lectivo", Obligatorio: "Si", Descripcion: "Nombre o ID del año lectivo" },
      { Campo: "grupo", Obligatorio: "Si", Descripcion: "Nombre o ID del grupo" },
      { Campo: "materia", Obligatorio: "No", Descripcion: "Nombre, código o ID de materia" },
      { Campo: "periodo", Obligatorio: "No", Descripcion: "Nombre o ID del período" },
      { Campo: "tipo asignacion", Obligatorio: "Si", Descripcion: "Ejemplo: PROFESOR_MATERIA o PROFESOR_GUIA" }
    ],
    ejemplo: [{ "correo docente": "docente@colegio.com", "anio lectivo": "2026", grupo: "7-1", materia: "Matemáticas", periodo: "I Periodo", "tipo asignacion": "PROFESOR_MATERIA" }]
  },
  "grupos-materia": {
    label: "materias por grupo",
    sheetName: "MateriasGrupo",
    filename: "plantilla_importacion_materias_por_grupo.xlsx",
    instrucciones: [
      { Campo: "grupo", Obligatorio: "Si", Descripcion: "Nombre o ID del grupo" },
      { Campo: "materia", Obligatorio: "Si", Descripcion: "Nombre, código o ID de materia" },
      { Campo: "periodo", Obligatorio: "No", Descripcion: "Nombre o ID del período" }
    ],
    ejemplo: [{ grupo: "7-1", materia: "Matemáticas", periodo: "I Periodo" }]
  },
  "horarios-grupo": {
    label: "horarios de clase",
    sheetName: "Horarios",
    filename: "plantilla_importacion_horarios_clase.xlsx",
    instrucciones: [
      { Campo: "grupo", Obligatorio: "Si", Descripcion: "Nombre o ID del grupo" },
      { Campo: "materia", Obligatorio: "Si", Descripcion: "Nombre, código o ID de materia" },
      { Campo: "periodo", Obligatorio: "No", Descripcion: "Nombre o ID del período" },
      { Campo: "bloque", Obligatorio: "Si", Descripcion: "Nombre o ID del bloque horario" },
      { Campo: "dia", Obligatorio: "Si", Descripcion: "Lunes, Martes, Miércoles, Jueves, Viernes, Sábado o Domingo" }
    ],
    ejemplo: [{ grupo: "7-1", materia: "Matemáticas", periodo: "I Periodo", bloque: "Lección 1", dia: "Lunes" }]
  },
  feriados: {
    label: "feriados",
    sheetName: "Feriados",
    filename: "plantilla_importacion_feriados.xlsx",
    instrucciones: [
      { Campo: "fecha", Obligatorio: "Si", Descripcion: "Fecha en formato AAAA-MM-DD" },
      { Campo: "nombre", Obligatorio: "Si", Descripcion: "Nombre del feriado" },
      { Campo: "descripcion", Obligatorio: "No", Descripcion: "Descripción del feriado" }
    ],
    ejemplo: [{ fecha: "2026-09-15", nombre: "Día de la Independencia", descripcion: "" }]
  }
};

function cleanupAcademicoBulkImportJobs() {
  const now = Date.now();
  for (const [id, job] of academicoBulkImportJobs.entries()) {
    if (now - job.updatedAt > ACADEMICO_BULK_IMPORT_JOB_TTL_MS) {
      academicoBulkImportJobs.delete(id);
    }
  }
}

function createAcademicoBulkImportJob(kind: AcademicoBulkImportKind, institucionId: number, totalRegistros: number) {
  cleanupAcademicoBulkImportJobs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: AcademicoBulkImportJob = {
    id,
    kind,
    institucionId,
    status: "PENDIENTE",
    totalRegistros,
    procesados: 0,
    totalOk: 0,
    totalError: 0,
    totalCreados: 0,
    totalReactivados: 0,
    totalOmitidos: 0,
    resultados: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  academicoBulkImportJobs.set(id, job);
  return job;
}

function updateAcademicoBulkImportJobTotals(job: AcademicoBulkImportJob) {
  job.procesados = job.resultados.length;
  job.totalCreados = job.resultados.filter((item) => item.estado === "CREADO").length;
  job.totalReactivados = job.resultados.filter((item) => item.estado === "REACTIVADO").length;
  job.totalOmitidos = job.resultados.filter((item) => item.estado === "OMITIDO").length;
  job.totalError = job.resultados.filter((item) => item.estado === "ERROR").length;
  job.totalOk = job.totalCreados + job.totalReactivados;
  job.updatedAt = Date.now();
}

function serializeAcademicoBulkImportJob(job: AcademicoBulkImportJob) {
  return {
    jobId: job.id,
    status: job.status,
    totalRegistros: job.totalRegistros,
    procesados: job.procesados,
    totalOk: job.totalOk,
    totalError: job.totalError,
    totalCreados: job.totalCreados,
    totalReactivados: job.totalReactivados,
    totalOmitidos: job.totalOmitidos,
    porcentaje: job.totalRegistros ? Math.round((job.procesados / job.totalRegistros) * 100) : 0,
    error: job.error || null,
    resultados: job.status === "COMPLETADO" || job.status === "ERROR"
      ? job.resultados
      : job.resultados.slice(-20)
  };
}

function parseAcademicoBulkImportRows(file: Express.Multer.File | undefined, kind: AcademicoBulkImportKind) {
  if (!file?.buffer) {
    const error: any = new Error("Debes adjuntar un archivo Excel");
    error.status = 400;
    throw error;
  }

  const template = ACADEMICO_BULK_IMPORT_TEMPLATES[kind];
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.includes(template.sheetName) ? template.sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

  if (!rows.length) {
    const error: any = new Error("El archivo no contiene registros para importar");
    error.status = 400;
    throw error;
  }

  return rows;
}

function toPositiveImportId(value: any) {
  const text = toImportString(value);
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toImportDateString(value: any) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = toImportString(value);
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  }
  return text;
}

function getRowText(row: any, aliases: string[]) {
  return toImportString(getImportValue(row, aliases));
}

async function resolveAnioLectivoImport(pool: any, institucionId: number, row: any) {
  const id = toPositiveImportId(getImportValue(row, ["anioLectivoId", "anio lectivo id", "año lectivo id"]));
  const nombre = getRowText(row, ["anio lectivo", "año lectivo", "anio", "año"]);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("nombre", sql.NVarChar, nombre)
    .query(`
      SELECT TOP 1 AnioLectivoId, Nombre
      FROM dbo.AnioLectivo
      WHERE InstitucionId = @institucionId
        AND Activo = 1
        AND (
          (@id IS NOT NULL AND AnioLectivoId = @id)
          OR (@nombre <> N'' AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre))))
        )
      ORDER BY AnioLectivoId DESC
    `);
  return result.recordset[0] || null;
}

async function resolveGrupoImport(pool: any, institucionId: number, row: any, anioLectivoId?: number | null) {
  const id = toPositiveImportId(getImportValue(row, ["grupoId", "grupo id"]));
  const nombre = getRowText(row, ["grupo", "seccion", "sección", "nombre grupo"]);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("nombre", sql.NVarChar, nombre)
    .input("anioLectivoId", sql.Int, anioLectivoId || null)
    .query(`
      SELECT TOP 1 GrupoId, Nombre, AnioLectivoId
      FROM dbo.Grupo
      WHERE InstitucionId = @institucionId
        AND Activo = 1
        AND (@anioLectivoId IS NULL OR AnioLectivoId = @anioLectivoId)
        AND (
          (@id IS NOT NULL AND GrupoId = @id)
          OR (@nombre <> N'' AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre))))
        )
      ORDER BY GrupoId DESC
    `);
  return result.recordset[0] || null;
}

async function resolveMateriaImport(pool: any, institucionId: number, row: any) {
  const id = toPositiveImportId(getImportValue(row, ["materiaId", "materia id"]));
  const value = getRowText(row, ["materia", "nombre materia", "codigo materia", "código materia", "codigo"]);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("value", sql.NVarChar, value)
    .query(`
      SELECT TOP 1 MateriaId, Nombre, Codigo
      FROM dbo.Materia
      WHERE (InstitucionId = @institucionId OR EsGlobal = 1)
        AND Activa = 1
        AND (
          (@id IS NOT NULL AND MateriaId = @id)
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@value))))
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(ISNULL(Codigo, N'')))) = UPPER(LTRIM(RTRIM(@value))))
        )
      ORDER BY MateriaId DESC
    `);
  return result.recordset[0] || null;
}

async function resolvePeriodoImport(pool: any, institucionId: number, row: any, anioLectivoId?: number | null) {
  const id = toPositiveImportId(getImportValue(row, ["periodoId", "periodo id"]));
  const nombre = getRowText(row, ["periodo", "período", "nombre periodo", "nombre período"]);
  if (!id && !nombre) return null;
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("nombre", sql.NVarChar, nombre)
    .input("anioLectivoId", sql.Int, anioLectivoId || null)
    .query(`
      SELECT TOP 1 p.PeriodoId, p.Nombre, p.AnioLectivoId
      FROM dbo.Periodo p
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = p.AnioLectivoId
      WHERE a.InstitucionId = @institucionId
        AND p.Activo = 1
        AND (@anioLectivoId IS NULL OR p.AnioLectivoId = @anioLectivoId)
        AND (
          (@id IS NOT NULL AND p.PeriodoId = @id)
          OR (@nombre <> N'' AND UPPER(LTRIM(RTRIM(p.Nombre))) = UPPER(LTRIM(RTRIM(@nombre))))
        )
      ORDER BY p.PeriodoId DESC
    `);
  return result.recordset[0] || null;
}

async function resolveDocenteImport(pool: any, institucionId: number, row: any) {
  const id = toPositiveImportId(getImportValue(row, ["usuarioId", "docenteId", "docente id"]));
  const value = getRowText(row, ["correo docente", "docente", "correo", "email docente"]);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("value", sql.NVarChar, value)
    .query(`
      SELECT TOP 1 u.UsuarioId, u.Correo, u.Nombre, u.PrimerApellido, u.SegundoApellido
      FROM dbo.Usuario u
      WHERE u.InstitucionId = @institucionId
        AND u.Activo = 1
        AND EXISTS (
          SELECT 1
          FROM dbo.UsuarioRol ur
          INNER JOIN dbo.Rol r
            ON r.RolId = ur.RolId
          WHERE ur.UsuarioId = u.UsuarioId
            AND ur.Activo = 1
            AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
        )
        AND (
          (@id IS NOT NULL AND u.UsuarioId = @id)
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(u.Correo))) = UPPER(LTRIM(RTRIM(@value))))
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(CONCAT(u.Nombre, N' ', ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N''))))) = UPPER(LTRIM(RTRIM(@value))))
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(CONCAT(ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N''), N' ', u.Nombre)))) = UPPER(LTRIM(RTRIM(@value))))
        )
      ORDER BY u.UsuarioId DESC
    `);
  return result.recordset[0] || null;
}

async function resolveBloqueImport(pool: any, institucionId: number, row: any) {
  const id = toPositiveImportId(getImportValue(row, ["bloqueHorarioId", "bloque horario id", "bloqueId", "bloque id"]));
  const value = getRowText(row, ["bloque", "bloque horario", "nombre bloque"]);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("id", sql.Int, id)
    .input("value", sql.NVarChar, value)
    .query(`
      SELECT TOP 1 BloqueHorarioId, Nombre
      FROM dbo.BloqueHorario
      WHERE InstitucionId = @institucionId
        AND (
          (@id IS NOT NULL AND BloqueHorarioId = @id)
          OR (@value <> N'' AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@value))))
        )
      ORDER BY OrdenVisual, BloqueHorarioId
    `);
  return result.recordset[0] || null;
}

function resolveDiaSemanaImport(row: any) {
  const value = getImportValue(row, ["dia", "día", "dia semana", "día semana", "diaSemana"]);
  const id = toPositiveImportId(value);
  if (id && id >= 1 && id <= 7) return id;
  const normalized = normalizeImportHeader(value);
  const map: Record<string, number> = {
    domingo: 1,
    lunes: 2,
    martes: 3,
    miercoles: 4,
    jueves: 5,
    viernes: 6,
    sabado: 7
  };
  return map[normalized] || null;
}

async function resolveGrupoMateriaImport(pool: any, institucionId: number, row: any) {
  const id = toPositiveImportId(getImportValue(row, ["grupoMateriaId", "grupo materia id"]));
  if (id) {
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1 gm.GrupoMateriaId, g.Nombre AS GrupoNombre, m.Nombre AS MateriaNombre
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
        WHERE gm.GrupoMateriaId = @id
          AND gm.Activo = 1
          AND g.InstitucionId = @institucionId
      `);
    return result.recordset[0] || null;
  }

  const grupo = await resolveGrupoImport(pool, institucionId, row, null);
  if (!grupo) return null;
  const materia = await resolveMateriaImport(pool, institucionId, row);
  if (!materia) return null;
  const periodo = await resolvePeriodoImport(pool, institucionId, row, grupo.AnioLectivoId);

  const result = await pool.request()
    .input("grupoId", sql.Int, grupo.GrupoId)
    .input("materiaId", sql.Int, materia.MateriaId)
    .input("periodoId", sql.Int, periodo?.PeriodoId || null)
    .query(`
      SELECT TOP 1 gm.GrupoMateriaId, g.Nombre AS GrupoNombre, m.Nombre AS MateriaNombre
      FROM dbo.GrupoMateria gm
      INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
      INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
      WHERE gm.GrupoId = @grupoId
        AND gm.MateriaId = @materiaId
        AND ISNULL(gm.PeriodoId, 0) = ISNULL(@periodoId, 0)
        AND gm.Activo = 1
    `);
  return result.recordset[0] || null;
}

async function processGrupoImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const anio = await resolveAnioLectivoImport(pool, institucionId, row);
  const nombre = getRowText(row, ["nombre", "grupo", "seccion", "sección"]);
  const referencia = nombre || `Fila ${fila}`;
  if (!anio || !nombre) return { fila, referencia, estado: "ERROR", motivo: "anio lectivo y nombre son obligatorios" };

  const nivel = toNullableImportString(getImportValue(row, ["nivel"]));
  const jornada = toNullableImportString(getImportValue(row, ["jornada"]));
  const existente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anio.AnioLectivoId)
    .input("nombre", sql.NVarChar, nombre)
    .query(`
      SELECT TOP 1 GrupoId, Activo
      FROM dbo.Grupo
      WHERE InstitucionId = @institucionId
        AND AnioLectivoId = @anioLectivoId
        AND Nombre = @nombre
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activo) return { fila, referencia, estado: "OMITIDO", motivo: "El grupo ya existe activo" };
    await pool.request()
      .input("id", sql.Int, current.GrupoId)
      .input("nivel", sql.NVarChar, nivel)
      .input("jornada", sql.NVarChar, jornada)
      .query(`
        UPDATE dbo.Grupo
        SET Nivel = @nivel, Jornada = @jornada, Activo = 1, UpdatedAt = SYSDATETIME()
        WHERE GrupoId = @id
      `);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Grupo inactivo reactivado y actualizado" };
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anio.AnioLectivoId)
    .input("nombre", sql.NVarChar, nombre)
    .input("nivel", sql.NVarChar, nivel)
    .input("jornada", sql.NVarChar, jornada)
    .query(`
      INSERT INTO dbo.Grupo (InstitucionId, SedeId, AnioLectivoId, Nombre, Nivel, Jornada, Activo, CreatedAt)
      VALUES (@institucionId, NULL, @anioLectivoId, @nombre, @nivel, @jornada, 1, SYSDATETIME())
    `);
  return { fila, referencia, estado: "CREADO", motivo: "Grupo creado correctamente" };
}

async function processMateriaImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const hasEsMateriaEspecial = await hasMateriaEspecialColumn(pool);
  const codigo = toNullableImportString(getImportValue(row, ["codigo", "código"]));
  const nombre = getRowText(row, ["nombre", "materia"]);
  const descripcion = toNullableImportString(getImportValue(row, ["descripcion", "descripción"]));
  const esMateriaEspecial = toImportBoolean(getImportValue(row, ["materia especial", "es materia especial", "especial", "especial si/no"]));
  const referencia = nombre || codigo || `Fila ${fila}`;
  if (!nombre) return { fila, referencia, estado: "ERROR", motivo: "nombre es obligatorio" };

  const existente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("nombre", sql.NVarChar, nombre)
    .input("codigo", sql.NVarChar, codigo)
    .query(`
      SELECT TOP 1 MateriaId, Activa
      FROM dbo.Materia
      WHERE InstitucionId = @institucionId
        AND (Nombre = @nombre OR (@codigo IS NOT NULL AND Codigo = @codigo))
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activa) return { fila, referencia, estado: "OMITIDO", motivo: "La materia ya existe activa" };
    await pool.request()
      .input("id", sql.Int, current.MateriaId)
      .input("codigo", sql.NVarChar, codigo)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion)
      .input("esMateriaEspecial", sql.Bit, !!esMateriaEspecial)
      .query(hasEsMateriaEspecial
        ? `
            UPDATE dbo.Materia
            SET Codigo = @codigo, Nombre = @nombre, Descripcion = @descripcion, EsMateriaEspecial = @esMateriaEspecial, Activa = 1, UpdatedAt = SYSDATETIME()
            WHERE MateriaId = @id
          `
        : `
            UPDATE dbo.Materia
            SET Codigo = @codigo, Nombre = @nombre, Descripcion = @descripcion, Activa = 1, UpdatedAt = SYSDATETIME()
            WHERE MateriaId = @id
          `);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Materia inactiva reactivada y actualizada" };
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("codigo", sql.NVarChar, codigo)
    .input("nombre", sql.NVarChar, nombre)
    .input("descripcion", sql.NVarChar, descripcion)
    .input("esMateriaEspecial", sql.Bit, !!esMateriaEspecial)
    .query(hasEsMateriaEspecial
      ? `
          INSERT INTO dbo.Materia (InstitucionId, Codigo, Nombre, Descripcion, EsMateriaEspecial, Activa, CreatedAt)
          VALUES (@institucionId, @codigo, @nombre, @descripcion, @esMateriaEspecial, 1, SYSDATETIME())
        `
      : `
          INSERT INTO dbo.Materia (InstitucionId, Codigo, Nombre, Descripcion, Activa, CreatedAt)
          VALUES (@institucionId, @codigo, @nombre, @descripcion, 1, SYSDATETIME())
        `);
  return { fila, referencia, estado: "CREADO", motivo: "Materia creada correctamente" };
}

async function processAsignacionImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const docente = await resolveDocenteImport(pool, institucionId, row);
  const anio = await resolveAnioLectivoImport(pool, institucionId, row);
  const grupo = anio ? await resolveGrupoImport(pool, institucionId, row, anio.AnioLectivoId) : null;
  const materia = getRowText(row, ["materia", "nombre materia", "codigo materia", "código materia", "codigo"])
    ? await resolveMateriaImport(pool, institucionId, row)
    : null;
  const periodo = anio ? await resolvePeriodoImport(pool, institucionId, row, anio.AnioLectivoId) : null;
  const tipoAsignacion = getRowText(row, ["tipo asignacion", "tipo asignación", "tipoAsignacion"]) || "PROFESOR_MATERIA";
  const referencia = `${docente?.Correo || getRowText(row, ["correo docente", "docente"]) || "Docente"} / ${grupo?.Nombre || getRowText(row, ["grupo"]) || "Grupo"}`;

  if (!docente || !anio || !grupo || !tipoAsignacion) {
    return { fila, referencia, estado: "ERROR", motivo: "correo docente, anio lectivo, grupo y tipo asignacion son obligatorios y deben existir activos" };
  }

  const existente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, docente.UsuarioId)
    .input("grupoId", sql.Int, grupo.GrupoId)
    .input("materiaId", sql.Int, materia?.MateriaId || null)
    .input("anioLectivoId", sql.Int, anio.AnioLectivoId)
    .input("periodoId", sql.Int, periodo?.PeriodoId || null)
    .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
    .query(`
      SELECT TOP 1 AsignacionDocenteId, Activo
      FROM dbo.AsignacionDocente
      WHERE InstitucionId = @institucionId
        AND UsuarioId = @usuarioId
        AND GrupoId = @grupoId
        AND AnioLectivoId = @anioLectivoId
        AND TipoAsignacion = @tipoAsignacion
        AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
        AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activo) return { fila, referencia, estado: "OMITIDO", motivo: "La asignacion docente ya existe activa" };
    await pool.request()
      .input("id", sql.Int, current.AsignacionDocenteId)
      .query(`UPDATE dbo.AsignacionDocente SET Activo = 1, UpdatedAt = SYSDATETIME() WHERE AsignacionDocenteId = @id`);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Asignacion docente inactiva reactivada" };
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, docente.UsuarioId)
    .input("grupoId", sql.Int, grupo.GrupoId)
    .input("materiaId", sql.Int, materia?.MateriaId || null)
    .input("anioLectivoId", sql.Int, anio.AnioLectivoId)
    .input("periodoId", sql.Int, periodo?.PeriodoId || null)
    .input("tipoAsignacion", sql.NVarChar, tipoAsignacion)
    .query(`
      INSERT INTO dbo.AsignacionDocente (InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, TipoAsignacion, Activo, CreatedAt)
      VALUES (@institucionId, @usuarioId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @tipoAsignacion, 1, SYSDATETIME())
    `);
  return { fila, referencia, estado: "CREADO", motivo: "Asignacion docente creada correctamente" };
}

async function processGrupoMateriaImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const grupo = await resolveGrupoImport(pool, institucionId, row, null);
  const materia = await resolveMateriaImport(pool, institucionId, row);
  const periodo = grupo ? await resolvePeriodoImport(pool, institucionId, row, grupo.AnioLectivoId) : null;
  const referencia = `${grupo?.Nombre || getRowText(row, ["grupo"]) || "Grupo"} / ${materia?.Nombre || getRowText(row, ["materia"]) || "Materia"}`;

  if (!grupo || !materia) return { fila, referencia, estado: "ERROR", motivo: "grupo y materia son obligatorios y deben existir activos" };

  const existente = await pool.request()
    .input("grupoId", sql.Int, grupo.GrupoId)
    .input("materiaId", sql.Int, materia.MateriaId)
    .input("periodoId", sql.Int, periodo?.PeriodoId || null)
    .query(`
      SELECT TOP 1 GrupoMateriaId, Activo
      FROM dbo.GrupoMateria
      WHERE GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND ISNULL(PeriodoId, 0) = ISNULL(@periodoId, 0)
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activo) return { fila, referencia, estado: "OMITIDO", motivo: "La materia por grupo ya existe activa" };
    await pool.request()
      .input("id", sql.Int, current.GrupoMateriaId)
      .query(`UPDATE dbo.GrupoMateria SET Activo = 1, UpdatedAt = SYSDATETIME() WHERE GrupoMateriaId = @id`);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Materia por grupo inactiva reactivada" };
  }

  await pool.request()
    .input("grupoId", sql.Int, grupo.GrupoId)
    .input("materiaId", sql.Int, materia.MateriaId)
    .input("periodoId", sql.Int, periodo?.PeriodoId || null)
    .query(`
      INSERT INTO dbo.GrupoMateria (GrupoId, MateriaId, PeriodoId, Activo, CreatedAt)
      VALUES (@grupoId, @materiaId, @periodoId, 1, SYSDATETIME())
    `);
  return { fila, referencia, estado: "CREADO", motivo: "Materia por grupo creada correctamente" };
}

async function processHorarioImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const grupoMateria = await resolveGrupoMateriaImport(pool, institucionId, row);
  const bloque = await resolveBloqueImport(pool, institucionId, row);
  const diaSemana = resolveDiaSemanaImport(row);
  const referencia = `${grupoMateria?.GrupoNombre || getRowText(row, ["grupo"]) || "Grupo"} / ${grupoMateria?.MateriaNombre || getRowText(row, ["materia"]) || "Materia"} / ${bloque?.Nombre || getRowText(row, ["bloque"]) || "Bloque"}`;

  if (!grupoMateria || !bloque || !diaSemana) {
    return { fila, referencia, estado: "ERROR", motivo: "grupo, materia, bloque y dia son obligatorios y deben existir activos" };
  }

  const existente = await pool.request()
    .input("grupoMateriaId", sql.Int, grupoMateria.GrupoMateriaId)
    .input("bloqueHorarioId", sql.Int, bloque.BloqueHorarioId)
    .input("diaSemana", sql.Int, diaSemana)
    .query(`
      SELECT TOP 1 HorarioGrupoId, Activo
      FROM dbo.HorarioGrupo
      WHERE GrupoMateriaId = @grupoMateriaId
        AND BloqueHorarioId = @bloqueHorarioId
        AND DiaSemana = @diaSemana
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activo) return { fila, referencia, estado: "OMITIDO", motivo: "El horario ya existe activo" };

    const conflictoDocente = await validateHorarioDocenteConflict({
      pool,
      institucionId,
      grupoMateriaId: Number(grupoMateria.GrupoMateriaId),
      bloqueHorarioId: Number(bloque.BloqueHorarioId),
      diaSemana: Number(diaSemana),
      excludeHorarioGrupoId: Number(current.HorarioGrupoId)
    });

    if (conflictoDocente) {
      return { fila, referencia, estado: "ERROR", motivo: conflictoDocente.message };
    }

    await pool.request()
      .input("id", sql.Int, current.HorarioGrupoId)
      .query(`UPDATE dbo.HorarioGrupo SET Activo = 1, UpdatedAt = SYSDATETIME() WHERE HorarioGrupoId = @id`);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Horario inactivo reactivado" };
  }

  const conflictoDocente = await validateHorarioDocenteConflict({
    pool,
    institucionId,
    grupoMateriaId: Number(grupoMateria.GrupoMateriaId),
    bloqueHorarioId: Number(bloque.BloqueHorarioId),
    diaSemana: Number(diaSemana)
  });

  if (conflictoDocente) {
    return { fila, referencia, estado: "ERROR", motivo: conflictoDocente.message };
  }

  await pool.request()
    .input("grupoMateriaId", sql.Int, grupoMateria.GrupoMateriaId)
    .input("bloqueHorarioId", sql.Int, bloque.BloqueHorarioId)
    .input("diaSemana", sql.Int, diaSemana)
    .query(`
      INSERT INTO dbo.HorarioGrupo (GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt)
      VALUES (@grupoMateriaId, @bloqueHorarioId, @diaSemana, 1, SYSDATETIME())
    `);
  return { fila, referencia, estado: "CREADO", motivo: "Horario creado correctamente" };
}

async function processFeriadoImportRow(pool: any, institucionId: number, row: any, fila: number): Promise<AcademicoBulkImportResultRow> {
  const fecha = toImportDateString(getImportValue(row, ["fecha"]));
  const nombre = getRowText(row, ["nombre", "feriado"]);
  const descripcion = toNullableImportString(getImportValue(row, ["descripcion", "descripción"]));
  const referencia = fecha || nombre || `Fila ${fila}`;
  if (!fecha || !nombre) return { fila, referencia, estado: "ERROR", motivo: "fecha y nombre son obligatorios" };

  const existente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("fecha", sql.Date, fecha)
    .query(`
      SELECT TOP 1 FeriadoId, Activo
      FROM dbo.FeriadoInstitucional
      WHERE InstitucionId = @institucionId
        AND Fecha = @fecha
    `);

  if (existente.recordset.length) {
    const current = existente.recordset[0];
    if (current.Activo) return { fila, referencia, estado: "OMITIDO", motivo: "El feriado ya existe activo para esa fecha" };
    await pool.request()
      .input("id", sql.Int, current.FeriadoId)
      .input("nombre", sql.NVarChar, nombre)
      .input("descripcion", sql.NVarChar, descripcion)
      .query(`
        UPDATE dbo.FeriadoInstitucional
        SET Nombre = @nombre, Descripcion = @descripcion, Activo = 1, UpdatedAt = SYSDATETIME()
        WHERE FeriadoId = @id
      `);
    return { fila, referencia, estado: "REACTIVADO", motivo: "Feriado inactivo reactivado y actualizado" };
  }

  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("fecha", sql.Date, fecha)
    .input("nombre", sql.NVarChar, nombre)
    .input("descripcion", sql.NVarChar, descripcion)
    .query(`
      INSERT INTO dbo.FeriadoInstitucional (InstitucionId, Fecha, Nombre, Descripcion, Activo, CreatedAt)
      VALUES (@institucionId, @fecha, @nombre, @descripcion, 1, SYSDATETIME())
    `);
  return { fila, referencia, estado: "CREADO", motivo: "Feriado creado correctamente" };
}

async function processAcademicoBulkImportRow(kind: AcademicoBulkImportKind, pool: any, institucionId: number, row: any, fila: number) {
  if (kind === "grupos") return processGrupoImportRow(pool, institucionId, row, fila);
  if (kind === "materias") return processMateriaImportRow(pool, institucionId, row, fila);
  if (kind === "asignaciones-docentes") return processAsignacionImportRow(pool, institucionId, row, fila);
  if (kind === "grupos-materia") return processGrupoMateriaImportRow(pool, institucionId, row, fila);
  if (kind === "horarios-grupo") return processHorarioImportRow(pool, institucionId, row, fila);
  return processFeriadoImportRow(pool, institucionId, row, fila);
}

async function processAcademicoBulkImportRows(params: {
  kind: AcademicoBulkImportKind;
  rows: any[];
  institucionId: number;
  job: AcademicoBulkImportJob;
}) {
  const { kind, rows, institucionId, job } = params;
  const pool = await getPool();

  job.status = "PROCESANDO";
  job.updatedAt = Date.now();

  for (let index = 0; index < rows.length; index += 1) {
    let resultado: AcademicoBulkImportResultRow;
    try {
      resultado = await processAcademicoBulkImportRow(kind, pool, institucionId, rows[index], index + 2);
    } catch (error: any) {
      console.error(`Error procesando fila de importacion academica (${kind}):`, error);
      resultado = {
        fila: index + 2,
        referencia: `Fila ${index + 2}`,
        estado: "ERROR",
        motivo: error?.message || "No se pudo procesar la fila"
      };
    }

    job.resultados.push(resultado);
    updateAcademicoBulkImportJobTotals(job);
  }

  job.status = "COMPLETADO";
  updateAcademicoBulkImportJobTotals(job);
}

function isAcademicoBulkImportKind(value: any): value is AcademicoBulkImportKind {
  return Object.prototype.hasOwnProperty.call(ACADEMICO_BULK_IMPORT_TEMPLATES, String(value || ""));
}

router.get("/importaciones/:kind/plantilla-excel", async (req, res) => {
  try {
    const kind = String(req.params.kind || "") as AcademicoBulkImportKind;
    if (!isAcademicoBulkImportKind(kind)) {
      return badRequest(res, "Tipo de importacion no valido");
    }

    const template = ACADEMICO_BULK_IMPORT_TEMPLATES[kind];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template.instrucciones), "Instrucciones");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(template.ejemplo), template.sheetName);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="${template.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Error generando plantilla de importacion academica:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar la plantilla" });
  }
});

router.post("/importaciones/:kind/iniciar", upload.single("archivo"), async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const kind = String(req.params.kind || "") as AcademicoBulkImportKind;
    if (!isAcademicoBulkImportKind(kind)) {
      return badRequest(res, "Tipo de importacion no valido");
    }

    const rows = parseAcademicoBulkImportRows(req.file, kind);
    const job = createAcademicoBulkImportJob(kind, institucionId, rows.length);

    setImmediate(() => {
      processAcademicoBulkImportRows({ kind, rows, institucionId, job }).catch((error) => {
        console.error("Error procesando importacion academica:", error);
        job.status = "ERROR";
        job.error = error?.message || "No se pudo procesar el archivo Excel";
        job.updatedAt = Date.now();
      });
    });

    return ok(res, serializeAcademicoBulkImportJob(job), "Importacion iniciada");
  } catch (error: any) {
    if (error?.status === 400) return badRequest(res, error.message);
    console.error("Error iniciando importacion academica:", error);
    return res.status(500).json({ ok: false, message: "No se pudo iniciar la importacion" });
  }
});

router.get("/importaciones/:kind/progreso/:jobId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const kind = String(req.params.kind || "") as AcademicoBulkImportKind;
    if (!isAcademicoBulkImportKind(kind)) {
      return badRequest(res, "Tipo de importacion no valido");
    }

    cleanupAcademicoBulkImportJobs();
    const job = academicoBulkImportJobs.get(String(req.params.jobId || ""));
    if (!job || job.kind !== kind || job.institucionId !== institucionId) {
      return res.status(404).json({ ok: false, message: "No se encontro la importacion solicitada" });
    }

    return ok(res, serializeAcademicoBulkImportJob(job));
  } catch (error) {
    console.error("Error consultando progreso de importacion academica:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar el progreso de la importacion" });
  }
});

router.get("/importaciones/:kind/resumen/:jobId/excel", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const kind = String(req.params.kind || "") as AcademicoBulkImportKind;
    if (!isAcademicoBulkImportKind(kind)) {
      return badRequest(res, "Tipo de importacion no valido");
    }

    cleanupAcademicoBulkImportJobs();
    const job = academicoBulkImportJobs.get(String(req.params.jobId || ""));
    if (!job || job.kind !== kind || job.institucionId !== institucionId) {
      return res.status(404).json({ ok: false, message: "No se encontro la importacion solicitada" });
    }

    const template = ACADEMICO_BULK_IMPORT_TEMPLATES[kind];
    const wb = XLSX.utils.book_new();
    const resumen = [
      { Concepto: "Total registros", Valor: job.totalRegistros },
      { Concepto: "Procesados", Valor: job.procesados },
      { Concepto: "Creados", Valor: job.totalCreados },
      { Concepto: "Reactivados y actualizados", Valor: job.totalReactivados },
      { Concepto: "Omitidos por existir activos", Valor: job.totalOmitidos },
      { Concepto: "Errores", Valor: job.totalError },
      { Concepto: "Estado", Valor: job.status }
    ];
    const detalle = job.resultados.map((item) => ({
      Fila: item.fila,
      Referencia: item.referencia,
      Estado: item.estado,
      Motivo: item.motivo
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="resumen_${template.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Error exportando resumen de importacion academica:", error);
    return res.status(500).json({ ok: false, message: "No se pudo exportar el resumen de importacion" });
  }
});

export default router;

