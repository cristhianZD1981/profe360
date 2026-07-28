import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, created, ok } from "../../utils/http";
import { hasGrupoClaseSchema } from "./grupos-clase.utils";

const router = Router();
const CATALOG_CACHE_TTL_MS = 60_000;
const catalogCache = new Map<number, { at: number; data: any }>();
const catalogInFlight = new Map<number, Promise<any>>();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"));

function getInstitutionId(req: any, res: any) {
  const value = Number(req.auth?.institucionId);
  if (!Number.isInteger(value) || value <= 0) {
    badRequest(res, "El usuario no tiene institucion asignada");
    return null;
  }
  return value;
}

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map(positiveId).filter((item): item is number => item !== null)
  ));
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function dateText(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, 10) : null;
}

function duplicateName(value: unknown) {
  const base = text(value, 189) || "Grupo de clase";
  return `Copia de ${base}`.slice(0, 200);
}

function getUserId(req: any) {
  return positiveId(req.auth?.userId ?? req.auth?.usuarioId ?? req.auth?.id);
}

async function requireSchema(pool: any, res: any) {
  if (await hasGrupoClaseSchema(pool)) return true;
  res.status(409).json({
    ok: false,
    code: "GRUPOS_CLASE_SCHEMA_PENDIENTE",
    message: "Primero debe ejecutar el script SQL de grupos de clase"
  });
  return false;
}

function csv(ids: number[]) {
  return ids.join(",");
}

async function validatePayload(params: {
  pool: any;
  institucionId: number;
  payload: any;
}) {
  const { pool, institucionId, payload } = params;
  const anioLectivoId = positiveId(payload.anioLectivoId);
  const periodoId = positiveId(payload.periodoId);
  const materiaId = positiveId(payload.materiaId);
  const grupoIdPrincipal = positiveId(payload.grupoIdPrincipal);
  const grupoIds = uniqueIds(payload.grupoIds);
  const matriculaIds = uniqueIds(payload.matriculaIds);
  const usuarioIds = uniqueIds(payload.usuarioIds);
  const subEspecialidadIds = uniqueIds(payload.subEspecialidadIds);
  const horarioGrupoIds = uniqueIds(payload.horarioGrupoIds);
  const usuarioPrincipalId = positiveId(payload.usuarioPrincipalId);
  const nombre = text(payload.nombre, 200);
  const modoSeleccion = ["MANUAL", "SUBESPECIALIDAD", "MIXTO"].includes(
    String(payload.modoSeleccion || "").toUpperCase()
  )
    ? String(payload.modoSeleccion).toUpperCase()
    : "MIXTO";
  const reglaCoincidencia = String(payload.reglaCoincidencia || "").toUpperCase() === "TODAS"
    ? "TODAS"
    : "CUALQUIERA";

  const errors: string[] = [];
  if (!nombre) errors.push("El nombre es obligatorio");
  if (!anioLectivoId || !periodoId || !materiaId || !grupoIdPrincipal) {
    errors.push("Debe indicar anio, periodo, materia y seccion principal");
  }
  if (!grupoIds.length) errors.push("Debe seleccionar al menos una seccion");
  if (grupoIdPrincipal && !grupoIds.includes(grupoIdPrincipal)) {
    errors.push("La seccion principal debe estar entre las secciones seleccionadas");
  }
  if (!usuarioIds.length) errors.push("Debe seleccionar al menos un profesor");
  if (usuarioPrincipalId && !usuarioIds.includes(usuarioPrincipalId)) {
    errors.push("El profesor principal debe estar entre los profesores seleccionados");
  }
  if (!matriculaIds.length) errors.push("Debe seleccionar al menos un estudiante");
  if (!horarioGrupoIds.length) errors.push("Debe seleccionar al menos una leccion del horario");

  if (errors.length) {
    return { valid: false as const, errors };
  }

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("materiaId", sql.Int, materiaId)
    .input("grupoIds", sql.NVarChar(sql.MAX), csv(grupoIds))
    .input("matriculaIds", sql.NVarChar(sql.MAX), csv(matriculaIds))
    .input("usuarioIds", sql.NVarChar(sql.MAX), csv(usuarioIds))
    .input("subEspecialidadIds", sql.NVarChar(sql.MAX), csv(subEspecialidadIds))
    .input("horarioGrupoIds", sql.NVarChar(sql.MAX), csv(horarioGrupoIds))
    .query(`
      SELECT
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.AnioLectivo al
          WHERE al.AnioLectivoId = @anioLectivoId
            AND al.InstitucionId = @institucionId
        ) THEN 1 ELSE 0 END AS AnioValido,
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.Periodo p
          INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = p.AnioLectivoId
          WHERE p.PeriodoId = @periodoId
            AND p.AnioLectivoId = @anioLectivoId
            AND al.InstitucionId = @institucionId
        ) THEN 1 ELSE 0 END AS PeriodoValido,
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.Materia m
          WHERE m.MateriaId = @materiaId
            AND m.InstitucionId = @institucionId
            AND m.Activa = 1
        ) THEN 1 ELSE 0 END AS MateriaValida;

      SELECT COUNT(DISTINCT g.GrupoId) AS Total
      FROM dbo.Grupo g
      INNER JOIN STRING_SPLIT(@grupoIds, N',') s
        ON TRY_CONVERT(int, s.value) = g.GrupoId
      WHERE g.InstitucionId = @institucionId
        AND g.AnioLectivoId = @anioLectivoId
        AND g.Activo = 1;

      SELECT COUNT(DISTINCT ma.MatriculaId) AS Total
      FROM dbo.Matricula ma
      INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
      INNER JOIN STRING_SPLIT(@matriculaIds, N',') sm
        ON TRY_CONVERT(int, sm.value) = ma.MatriculaId
      INNER JOIN STRING_SPLIT(@grupoIds, N',') sg
        ON TRY_CONVERT(int, sg.value) = ma.GrupoId
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
      WHERE ma.AnioLectivoId = @anioLectivoId
        AND ma.Estado <> N'Inactiva'
        AND e.Activo = 1
        AND g.InstitucionId = @institucionId;

      SELECT COUNT(DISTINCT u.UsuarioId) AS Total
      FROM dbo.Usuario u
      INNER JOIN STRING_SPLIT(@usuarioIds, N',') s
        ON TRY_CONVERT(int, s.value) = u.UsuarioId
      WHERE u.InstitucionId = @institucionId
        AND u.Activo = 1
        AND EXISTS (
          SELECT 1
          FROM dbo.UsuarioRol ur
          INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
          WHERE ur.UsuarioId = u.UsuarioId
            AND ur.Activo = 1
            AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
        );

      SELECT COUNT(DISTINCT se.SubEspecialidadId) AS Total
      FROM dbo.SubEspecialidad se
      INNER JOIN STRING_SPLIT(@subEspecialidadIds, N',') s
        ON TRY_CONVERT(int, s.value) = se.SubEspecialidadId
      WHERE se.InstitucionId = @institucionId
        AND se.Activo = 1;

      SELECT COUNT(DISTINCT hg.HorarioGrupoId) AS Total
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
      INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
      INNER JOIN STRING_SPLIT(@horarioGrupoIds, N',') sh
        ON TRY_CONVERT(int, sh.value) = hg.HorarioGrupoId
      INNER JOIN STRING_SPLIT(@grupoIds, N',') sg
        ON TRY_CONVERT(int, sg.value) = gm.GrupoId
      WHERE g.InstitucionId = @institucionId
        AND gm.MateriaId = @materiaId
        AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
        AND gm.Activo = 1
        AND hg.Activo = 1;
    `);

  const header = result.recordsets[0]?.[0] || {};
  if (!header.AnioValido) errors.push("El anio no pertenece a la institucion");
  if (!header.PeriodoValido) errors.push("El periodo no pertenece al anio seleccionado");
  if (!header.MateriaValida) errors.push("La materia no pertenece a la institucion");
  if (Number(result.recordsets[1]?.[0]?.Total || 0) !== grupoIds.length) {
    errors.push("Hay secciones invalidas o de otro anio");
  }
  if (Number(result.recordsets[2]?.[0]?.Total || 0) !== matriculaIds.length) {
    errors.push("Hay estudiantes fuera de las secciones seleccionadas");
  }
  if (Number(result.recordsets[3]?.[0]?.Total || 0) !== usuarioIds.length) {
    errors.push("Hay profesores invalidos o de otra institucion");
  }
  if (Number(result.recordsets[4]?.[0]?.Total || 0) !== subEspecialidadIds.length) {
    errors.push("Hay subespecialidades invalidas");
  }
  if (Number(result.recordsets[5]?.[0]?.Total || 0) !== horarioGrupoIds.length) {
    errors.push("Hay horarios que no corresponden a la materia y secciones seleccionadas");
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      nombre,
      descripcion: text(payload.descripcion, 500) || null,
      anioLectivoId: anioLectivoId!,
      periodoId: periodoId!,
      materiaId: materiaId!,
      grupoIdPrincipal: grupoIdPrincipal!,
      grupoIds,
      matriculaIds,
      usuarioIds,
      usuarioPrincipalId: usuarioPrincipalId || usuarioIds[0],
      subEspecialidadIds,
      horarioGrupoIds,
      modoSeleccion,
      reglaCoincidencia,
      fechaInicio: text(payload.fechaInicio, 10) || null,
      fechaFin: text(payload.fechaFin, 10) || null
    }
  };
}

router.get("/estado-esquema", async (_req, res) => {
  try {
    const pool = await getPool();
    return ok(res, { listo: await hasGrupoClaseSchema(pool, true) });
  } catch (error) {
    console.error("Error verificando esquema de grupos de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudo verificar el esquema" });
  }
});

router.get("/catalogos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;

    const cached = catalogCache.get(institucionId);
    if (cached && Date.now() - cached.at <= CATALOG_CACHE_TTL_MS) {
      return ok(res, cached.data);
    }

    let loadPromise = catalogInFlight.get(institucionId);
    if (!loadPromise) {
      loadPromise = pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
        SELECT AnioLectivoId, Nombre, FechaInicio, FechaFin, Activo
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
        ORDER BY Activo DESC, FechaInicio DESC, AnioLectivoId DESC;

        SELECT p.PeriodoId, p.AnioLectivoId, p.Nombre, p.NumeroOrden, p.FechaInicio, p.FechaFin, p.Activo
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = p.AnioLectivoId
        WHERE al.InstitucionId = @institucionId
        ORDER BY al.FechaInicio DESC, p.NumeroOrden;

        SELECT GrupoId, AnioLectivoId, Nombre, Nivel, Jornada, Activo
        FROM dbo.Grupo
        WHERE InstitucionId = @institucionId
        ORDER BY Activo DESC,
          TRY_CONVERT(int, LEFT(Nombre, CHARINDEX(N'-', Nombre + N'-') - 1)),
          TRY_CONVERT(int, SUBSTRING(Nombre, CHARINDEX(N'-', Nombre + N'-') + 1, 20)),
          Nombre;

        SELECT MateriaId, Codigo, Nombre, Descripcion, Activa
        FROM dbo.Materia
        WHERE InstitucionId = @institucionId
        ORDER BY Activa DESC, Nombre;

        SELECT EspecialidadId, Descripcion, PermiteMultiplesPorSeccion, Activo
        FROM dbo.Especialidad
        WHERE InstitucionId = @institucionId
        ORDER BY Activo DESC, Descripcion;

        SELECT
          se.SubEspecialidadId,
          se.EspecialidadId,
          e.Descripcion AS EspecialidadNombre,
          se.Descripcion,
          se.Activo
        FROM dbo.SubEspecialidad se
        INNER JOIN dbo.Especialidad e ON e.EspecialidadId = se.EspecialidadId
        WHERE se.InstitucionId = @institucionId
        ORDER BY se.Activo DESC, e.Descripcion, se.Descripcion;

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
            INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
            WHERE ur.UsuarioId = u.UsuarioId
              AND ur.Activo = 1
              AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
          )
        ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre;

        SELECT mse.MateriaId, mse.SubEspecialidadId
        FROM dbo.MateriaSubEspecialidad mse
        INNER JOIN dbo.Materia m ON m.MateriaId = mse.MateriaId
        WHERE mse.Activo = 1
          AND m.InstitucionId = @institucionId;
      `)
        .then((result) => ({
          anios: result.recordsets[0] || [],
          periodos: result.recordsets[1] || [],
          grupos: result.recordsets[2] || [],
          materias: result.recordsets[3] || [],
          especialidades: result.recordsets[4] || [],
          subEspecialidades: result.recordsets[5] || [],
          profesores: result.recordsets[6] || [],
          materiasSubEspecialidad: result.recordsets[7] || []
        }));
      catalogInFlight.set(institucionId, loadPromise);
    }

    try {
      const data = await loadPromise;
      catalogCache.set(institucionId, { at: Date.now(), data });
      return ok(res, data);
    } finally {
      catalogInFlight.delete(institucionId);
    }
  } catch (error) {
    console.error("Error cargando catalogos de grupos de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los catalogos" });
  }
});

router.post("/horarios-disponibles", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const anioLectivoId = positiveId(req.body.anioLectivoId);
    const periodoId = positiveId(req.body.periodoId);
    const materiaId = positiveId(req.body.materiaId);
    const grupoIds = uniqueIds(req.body.grupoIds);
    const usuarioIds = uniqueIds(req.body.usuarioIds);

    if (!anioLectivoId || !periodoId || !materiaId || !grupoIds.length) {
      return badRequest(res, "Debe indicar ano, periodo, materia y secciones");
    }

    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("grupoIds", sql.NVarChar(sql.MAX), csv(grupoIds))
      .input("usuarioIds", sql.NVarChar(sql.MAX), csv(usuarioIds))
      .query(`
        WITH HorariosFiltrados AS (
          SELECT
            hg.HorarioGrupoId,
            gm.GrupoId,
            gm.MateriaId,
            gm.PeriodoId,
            hg.DiaSemana,
            hg.BloqueHorarioId,
            bh.Nombre AS BloqueNombre,
            CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
            CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin,
            bh.OrdenVisual,
            g.Nombre AS GrupoNombre,
            m.Nombre AS MateriaNombre,
            CAST(CASE WHEN @usuarioIds <> N'' AND EXISTS (
              SELECT 1
              FROM dbo.HorarioDocente hd
              INNER JOIN STRING_SPLIT(@usuarioIds, N',') su
                ON TRY_CONVERT(int, su.value) = hd.UsuarioId
              WHERE hd.HorarioGrupoId = hg.HorarioGrupoId
                AND hd.Activo = 1
            ) THEN 1 ELSE 0 END AS bit) AS AsignadoProfesor,
            ROW_NUMBER() OVER (
              PARTITION BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
              ORDER BY
                CASE WHEN gm.PeriodoId = @periodoId THEN 0 ELSE 1 END,
                hg.HorarioGrupoId DESC
            ) AS Posicion
          FROM dbo.HorarioGrupo hg
          INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
          INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
          INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
          INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
          INNER JOIN STRING_SPLIT(@grupoIds, N',') sg
            ON TRY_CONVERT(int, sg.value) = gm.GrupoId
          WHERE g.InstitucionId = @institucionId
            AND g.AnioLectivoId = @anioLectivoId
            AND gm.MateriaId = @materiaId
            AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
            AND hg.Activo = 1
            AND gm.Activo = 1
        )
        SELECT
          HorarioGrupoId,
          GrupoId,
          MateriaId,
          PeriodoId,
          DiaSemana,
          BloqueHorarioId,
          BloqueNombre,
          HoraInicio,
          HoraFin,
          OrdenVisual,
          GrupoNombre,
          MateriaNombre,
          AsignadoProfesor
        FROM HorariosFiltrados
        WHERE Posicion = 1
        ORDER BY
          CASE WHEN DiaSemana = 1 THEN 8 ELSE DiaSemana END,
          OrdenVisual,
          GrupoNombre;
      `);

    return ok(res, result.recordset || []);
  } catch (error) {
    console.error("Error cargando horarios disponibles del grupo de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las lecciones" });
  }
});

router.post("/candidatos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const anioLectivoId = positiveId(req.body.anioLectivoId);
    const grupoIds = uniqueIds(req.body.grupoIds);
    const subEspecialidadIds = uniqueIds(req.body.subEspecialidadIds);
    const regla = String(req.body.reglaCoincidencia || "").toUpperCase() === "TODAS"
      ? "TODAS"
      : "CUALQUIERA";
    if (!anioLectivoId || !grupoIds.length) {
      return badRequest(res, "Debe indicar anio y secciones");
    }

    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("grupoIds", sql.NVarChar(sql.MAX), csv(grupoIds))
      .input("subEspecialidadIds", sql.NVarChar(sql.MAX), csv(subEspecialidadIds))
      .input("totalSubEspecialidades", sql.Int, subEspecialidadIds.length)
      .input("regla", sql.NVarChar(20), regla)
      .query(`
        ;WITH GruposSeleccionados AS (
          SELECT DISTINCT TRY_CONVERT(int, value) AS GrupoId
          FROM STRING_SPLIT(@grupoIds, N',')
          WHERE TRY_CONVERT(int, value) IS NOT NULL
        ),
        SubEspecialidadesSeleccionadas AS (
          SELECT DISTINCT TRY_CONVERT(int, value) AS SubEspecialidadId
          FROM STRING_SPLIT(@subEspecialidadIds, N',')
          WHERE TRY_CONVERT(int, value) IS NOT NULL
        ),
        Base AS (
          SELECT
            ma.MatriculaId,
            ma.EstudianteId,
            ma.GrupoId,
            g.Nombre AS GrupoNombre,
            COALESCE(
              NULLIF(LTRIM(RTRIM(detalle.EspecialidadDescripcion)), N''),
              NULLIF(LTRIM(RTRIM(detalle.Especialidad)), N''),
              NULLIF(LTRIM(RTRIM(g.Especialidad)), N''),
              N''
            ) AS Especialidad,
            e.Identificacion,
            e.Nombre,
            e.PrimerApellido,
            e.SegundoApellido,
            e.Adecuacion AS TipoAdecuacion
          FROM dbo.Matricula ma
          INNER JOIN GruposSeleccionados gs
            ON gs.GrupoId = ma.GrupoId
          INNER JOIN dbo.Grupo g
            ON g.GrupoId = ma.GrupoId
           AND g.InstitucionId = @institucionId
          INNER JOIN dbo.Estudiante e
            ON e.EstudianteId = ma.EstudianteId
           AND e.Activo = 1
          OUTER APPLY (
            SELECT TOP 1
              md.Especialidad,
              esp.Descripcion AS EspecialidadDescripcion
            FROM dbo.MatriculaDetalle md
            LEFT JOIN dbo.Especialidad esp
              ON esp.EspecialidadId = md.EspecialidadId
            WHERE md.MatriculaId = ma.MatriculaId
            ORDER BY md.MatriculaDetalleId DESC
          ) detalle
          WHERE ma.AnioLectivoId = @anioLectivoId
            AND ma.Estado <> N'Inactiva'
        ),
        Coincidencias AS (
          SELECT
            mse.MatriculaId,
            COUNT(DISTINCT mse.SubEspecialidadId) AS TotalCoincidencias
          FROM dbo.MatriculaSubEspecialidad mse
          INNER JOIN Base b
            ON b.MatriculaId = mse.MatriculaId
          INNER JOIN SubEspecialidadesSeleccionadas ss
            ON ss.SubEspecialidadId = mse.SubEspecialidadId
          WHERE mse.Activo = 1
          GROUP BY mse.MatriculaId
        )
        SELECT
          b.MatriculaId,
          b.EstudianteId,
          b.GrupoId,
          b.GrupoNombre,
          b.Especialidad,
          b.Identificacion,
          b.Nombre,
          b.PrimerApellido,
          b.SegundoApellido,
          b.TipoAdecuacion,
          CAST(CASE
            WHEN @totalSubEspecialidades = 0 THEN 1
            WHEN @regla = N'TODAS' AND ISNULL(c.TotalCoincidencias, 0) = @totalSubEspecialidades THEN 1
            WHEN @regla = N'CUALQUIERA' AND ISNULL(c.TotalCoincidencias, 0) > 0 THEN 1
            ELSE 0
          END AS bit) AS Sugerido,
          ISNULL(perfil.SubEspecialidades, N'') AS SubEspecialidades,
          ISNULL(perfil.SubEspecialidadIds, N'') AS SubEspecialidadIds
        FROM Base b
        LEFT JOIN Coincidencias c
          ON c.MatriculaId = b.MatriculaId
        OUTER APPLY (
          SELECT
            STUFF((
              SELECT N' | ' + se.Descripcion
              FROM dbo.MatriculaSubEspecialidad mse
              INNER JOIN dbo.SubEspecialidad se
                ON se.SubEspecialidadId = mse.SubEspecialidadId
              WHERE mse.MatriculaId = b.MatriculaId
                AND mse.Activo = 1
                AND se.Activo = 1
              ORDER BY se.Descripcion
              FOR XML PATH(N''), TYPE
            ).value(N'.', N'nvarchar(max)'), 1, 3, N'') AS SubEspecialidades,
            STUFF((
              SELECT N',' + CONVERT(nvarchar(20), mse.SubEspecialidadId)
              FROM dbo.MatriculaSubEspecialidad mse
              WHERE mse.MatriculaId = b.MatriculaId
                AND mse.Activo = 1
              ORDER BY mse.SubEspecialidadId
              FOR XML PATH(N''), TYPE
            ).value(N'.', N'nvarchar(max)'), 1, 1, N'') AS SubEspecialidadIds
        ) perfil
        ORDER BY b.GrupoNombre, b.PrimerApellido, b.SegundoApellido, b.Nombre
        OPTION (RECOMPILE);
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error cargando candidatos de grupo de clase:", error);
    if ((error as any)?.code === "ETIMEOUT" || (error as any)?.originalError?.code === "ETIMEOUT") {
      return res.status(504).json({
        ok: false,
        message: "No se pudieron cargar los estudiantes. La consulta tardó demasiado."
      });
    }
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los estudiantes" });
  }
});

router.put("/matriculas/:matriculaId/subespecialidades", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await requireSchema(pool, res)) return;
    const matriculaId = positiveId(req.params.matriculaId);
    const ids = uniqueIds(req.body.subEspecialidadIds);
    if (!matriculaId) return badRequest(res, "Matricula invalida");

    const valid = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("matriculaId", sql.Int, matriculaId)
      .input("ids", sql.NVarChar(sql.MAX), csv(ids))
      .query(`
        SELECT CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.Matricula ma
          INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
          WHERE ma.MatriculaId = @matriculaId
            AND g.InstitucionId = @institucionId
        ) THEN 1 ELSE 0 END AS MatriculaValida;

        SELECT COUNT(DISTINCT se.SubEspecialidadId) AS Total
        FROM dbo.SubEspecialidad se
        INNER JOIN STRING_SPLIT(@ids, N',') s
          ON TRY_CONVERT(int, s.value) = se.SubEspecialidadId
        WHERE se.InstitucionId = @institucionId
          AND se.Activo = 1;
      `);

    if (!valid.recordsets[0]?.[0]?.MatriculaValida) {
      return badRequest(res, "La matricula no pertenece a la institucion");
    }
    if (Number(valid.recordsets[1]?.[0]?.Total || 0) !== ids.length) {
      return badRequest(res, "Hay subespecialidades invalidas");
    }

    await transaction.begin();
    await new sql.Request(transaction)
      .input("matriculaId", sql.Int, matriculaId)
      .query(`
        UPDATE dbo.MatriculaSubEspecialidad
        SET Activo = 0,
            FechaHasta = COALESCE(FechaHasta, CONVERT(date, SYSDATETIME())),
            UpdatedAt = SYSDATETIME()
        WHERE MatriculaId = @matriculaId
          AND Activo = 1;
      `);

    for (const id of ids) {
      await new sql.Request(transaction)
        .input("matriculaId", sql.Int, matriculaId)
        .input("subEspecialidadId", sql.Int, id)
        .query(`
          INSERT INTO dbo.MatriculaSubEspecialidad
            (MatriculaId, SubEspecialidadId, FechaDesde, Activo, CreatedAt)
          VALUES
            (@matriculaId, @subEspecialidadId, CONVERT(date, SYSDATETIME()), 1, SYSDATETIME());
        `);
    }

    await transaction.commit();
    return ok(res, { matriculaId, subEspecialidadIds: ids }, "Perfil tecnico actualizado");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error actualizando subespecialidades de matricula:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el perfil tecnico" });
  }
});

router.put("/materias/:materiaId/subespecialidades", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await requireSchema(pool, res)) return;
    const materiaId = positiveId(req.params.materiaId);
    const ids = uniqueIds(req.body.subEspecialidadIds);
    if (!materiaId) return badRequest(res, "Materia invalida");

    const valid = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("materiaId", sql.Int, materiaId)
      .input("ids", sql.NVarChar(sql.MAX), csv(ids))
      .query(`
        SELECT CASE WHEN EXISTS (
          SELECT 1 FROM dbo.Materia
          WHERE MateriaId = @materiaId
            AND InstitucionId = @institucionId
        ) THEN 1 ELSE 0 END AS MateriaValida;

        SELECT COUNT(DISTINCT se.SubEspecialidadId) AS Total
        FROM dbo.SubEspecialidad se
        INNER JOIN STRING_SPLIT(@ids, N',') s
          ON TRY_CONVERT(int, s.value) = se.SubEspecialidadId
        WHERE se.InstitucionId = @institucionId
          AND se.Activo = 1;
      `);
    if (!valid.recordsets[0]?.[0]?.MateriaValida) return badRequest(res, "Materia invalida");
    if (Number(valid.recordsets[1]?.[0]?.Total || 0) !== ids.length) {
      return badRequest(res, "Hay subespecialidades invalidas");
    }

    await transaction.begin();
    await new sql.Request(transaction)
      .input("materiaId", sql.Int, materiaId)
      .query(`
        UPDATE dbo.MateriaSubEspecialidad
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE MateriaId = @materiaId
          AND Activo = 1;
      `);
    for (const id of ids) {
      await new sql.Request(transaction)
        .input("materiaId", sql.Int, materiaId)
        .input("subEspecialidadId", sql.Int, id)
        .query(`
          INSERT INTO dbo.MateriaSubEspecialidad
            (MateriaId, SubEspecialidadId, Activo, CreatedAt)
          VALUES (@materiaId, @subEspecialidadId, 1, SYSDATETIME());
        `);
    }
    await transaction.commit();
    catalogCache.delete(institucionId);
    return ok(res, { materiaId, subEspecialidadIds: ids }, "Relacion de materia actualizada");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error actualizando materia-subespecialidad:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la materia" });
  }
});

router.get("/", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";
    const anioLectivoId = positiveId(req.query.anioLectivoId);
    const periodoId = positiveId(req.query.periodoId);
    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("incluirInactivos", sql.Bit, incluirInactivos)
      .query(`
        SELECT
          gc.GrupoClaseId,
          gc.Nombre,
          gc.Descripcion,
          gc.AnioLectivoId,
          al.Nombre AS AnioNombre,
          gc.PeriodoId,
          p.Nombre AS PeriodoNombre,
          gc.MateriaId,
          m.Nombre AS MateriaNombre,
          gc.GrupoIdPrincipal,
          gp.Nombre AS GrupoPrincipalNombre,
          gc.ModoSeleccion,
          gc.ReglaCoincidencia,
          gc.FechaInicio,
          gc.FechaFin,
          gc.Activo,
          (SELECT COUNT(*) FROM dbo.GrupoClaseEstudiante gce WHERE gce.GrupoClaseId = gc.GrupoClaseId AND gce.Activo = 1) AS TotalEstudiantes,
          (SELECT COUNT(*) FROM dbo.GrupoClaseDocente gcd WHERE gcd.GrupoClaseId = gc.GrupoClaseId AND gcd.Activo = 1) AS TotalProfesores,
          STUFF((
            SELECT N', ' + g.Nombre
            FROM dbo.GrupoClaseSeccion gcs
            INNER JOIN dbo.Grupo g ON g.GrupoId = gcs.GrupoId
            WHERE gcs.GrupoClaseId = gc.GrupoClaseId AND gcs.Activo = 1
            ORDER BY g.Nombre
            FOR XML PATH(N''), TYPE
          ).value(N'.', N'nvarchar(max)'), 1, 2, N'') AS Secciones,
          STUFF((
            SELECT N', ' + LTRIM(RTRIM(CONCAT(u.Nombre, N' ', ISNULL(u.PrimerApellido, N''), N' ', ISNULL(u.SegundoApellido, N''))))
            FROM dbo.GrupoClaseDocente gcd
            INNER JOIN dbo.Usuario u ON u.UsuarioId = gcd.UsuarioId
            WHERE gcd.GrupoClaseId = gc.GrupoClaseId AND gcd.Activo = 1
            ORDER BY gcd.EsPrincipal DESC, u.PrimerApellido, u.SegundoApellido, u.Nombre
            FOR XML PATH(N''), TYPE
          ).value(N'.', N'nvarchar(max)'), 1, 2, N'') AS Profesores
        FROM dbo.GrupoClase gc
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
        INNER JOIN dbo.Periodo p ON p.PeriodoId = gc.PeriodoId
        INNER JOIN dbo.Materia m ON m.MateriaId = gc.MateriaId
        INNER JOIN dbo.Grupo gp ON gp.GrupoId = gc.GrupoIdPrincipal
        WHERE gc.InstitucionId = @institucionId
          AND (@incluirInactivos = 1 OR gc.Activo = 1)
          AND (@anioLectivoId IS NULL OR gc.AnioLectivoId = @anioLectivoId)
          AND (@periodoId IS NULL OR gc.PeriodoId = @periodoId)
        ORDER BY al.FechaInicio DESC, p.NumeroOrden, gc.Nombre;
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando grupos de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los grupos de clase" });
  }
});

router.get("/:grupoClaseId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const grupoClaseId = positiveId(req.params.grupoClaseId);
    if (!grupoClaseId) return badRequest(res, "Grupo de clase invalido");
    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        SELECT *
        FROM dbo.GrupoClase
        WHERE GrupoClaseId = @grupoClaseId
          AND InstitucionId = @institucionId;

        SELECT GrupoId
        FROM dbo.GrupoClaseSeccion
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT SubEspecialidadId
        FROM dbo.GrupoClaseSubEspecialidad
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT MatriculaId
        FROM dbo.GrupoClaseEstudiante
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT UsuarioId, EsPrincipal
        FROM dbo.GrupoClaseDocente
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT HorarioGrupoId, EsPrincipal
        FROM dbo.GrupoClaseHorario
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
      `);

    const header = result.recordsets[0]?.[0];
    if (!header) return res.status(404).json({ ok: false, message: "Grupo de clase no encontrado" });
    return ok(res, {
      ...header,
      grupoIds: (result.recordsets[1] || []).map((row: any) => Number(row.GrupoId)),
      subEspecialidadIds: (result.recordsets[2] || []).map((row: any) => Number(row.SubEspecialidadId)),
      matriculaIds: (result.recordsets[3] || []).map((row: any) => Number(row.MatriculaId)),
      usuarioIds: (result.recordsets[4] || []).map((row: any) => Number(row.UsuarioId)),
      usuarioPrincipalId: Number((result.recordsets[4] || []).find((row: any) => row.EsPrincipal)?.UsuarioId || 0) || null,
      horarioGrupoIds: (result.recordsets[5] || []).map((row: any) => Number(row.HorarioGrupoId))
    });
  } catch (error) {
    console.error("Error cargando grupo de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el grupo de clase" });
  }
});

async function saveChildren(transaction: any, grupoClaseId: number, data: any, usuarioId: number | null) {
  const request = new sql.Request(transaction);
  await request.input("grupoClaseId", sql.Int, grupoClaseId).query(`
    UPDATE dbo.GrupoClaseSeccion SET Activo = 0, UpdatedAt = SYSDATETIME()
    WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
    UPDATE dbo.GrupoClaseSubEspecialidad SET Activo = 0, UpdatedAt = SYSDATETIME()
    WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
    UPDATE dbo.GrupoClaseEstudiante
    SET Activo = 0, FechaHasta = COALESCE(FechaHasta, CONVERT(date, SYSDATETIME())), UpdatedAt = SYSDATETIME()
    WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
    UPDATE dbo.GrupoClaseDocente SET Activo = 0, UpdatedAt = SYSDATETIME()
    WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
    UPDATE dbo.GrupoClaseHorario SET Activo = 0, UpdatedAt = SYSDATETIME()
    WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
  `);

  for (const grupoId of data.grupoIds) {
    await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("grupoId", sql.Int, grupoId)
      .query(`
        INSERT INTO dbo.GrupoClaseSeccion (GrupoClaseId, GrupoId, Activo)
        VALUES (@grupoClaseId, @grupoId, 1);
      `);
  }
  for (const subEspecialidadId of data.subEspecialidadIds) {
    await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("subEspecialidadId", sql.Int, subEspecialidadId)
      .query(`
        INSERT INTO dbo.GrupoClaseSubEspecialidad (GrupoClaseId, SubEspecialidadId, Activo)
        VALUES (@grupoClaseId, @subEspecialidadId, 1);
      `);
  }
  for (const matriculaId of data.matriculaIds) {
    await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("matriculaId", sql.Int, matriculaId)
      .input("origen", sql.NVarChar(20), data.modoSeleccion === "MANUAL" ? "MANUAL" : "SUBESPECIALIDAD")
      .input("usuarioId", sql.Int, usuarioId)
      .input("fechaInicio", sql.Date, data.fechaInicio)
      .input("fechaFin", sql.Date, data.fechaFin)
      .query(`
        INSERT INTO dbo.GrupoClaseEstudiante
          (GrupoClaseId, MatriculaId, OrigenAsignacion, FechaDesde, FechaHasta, Activo, UsuarioRegistroId)
        VALUES
          (@grupoClaseId, @matriculaId, @origen, @fechaInicio, @fechaFin, 1, @usuarioId);
      `);
  }
  for (const profesorId of data.usuarioIds) {
    await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("usuarioId", sql.Int, profesorId)
      .input("esPrincipal", sql.Bit, profesorId === data.usuarioPrincipalId)
      .query(`
        INSERT INTO dbo.GrupoClaseDocente (GrupoClaseId, UsuarioId, EsPrincipal, Activo)
        VALUES (@grupoClaseId, @usuarioId, @esPrincipal, 1);
      `);
  }
  for (let index = 0; index < data.horarioGrupoIds.length; index += 1) {
    await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("horarioGrupoId", sql.Int, data.horarioGrupoIds[index])
      .input("esPrincipal", sql.Bit, index === 0)
      .query(`
        INSERT INTO dbo.GrupoClaseHorario (GrupoClaseId, HorarioGrupoId, EsPrincipal, Activo)
        VALUES (@grupoClaseId, @horarioGrupoId, @esPrincipal, 1);
      `);
  }
}

router.post("/", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await requireSchema(pool, res)) return;
    const validation = await validatePayload({ pool, institucionId, payload: req.body });
    if (!validation.valid) return badRequest(res, "Revise los datos del grupo", validation.errors);
    const data = validation.data!;

    await transaction.begin();
    const inserted = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, data.anioLectivoId)
      .input("periodoId", sql.Int, data.periodoId)
      .input("materiaId", sql.Int, data.materiaId)
      .input("grupoIdPrincipal", sql.Int, data.grupoIdPrincipal)
      .input("nombre", sql.NVarChar(200), data.nombre)
      .input("descripcion", sql.NVarChar(500), data.descripcion)
      .input("modoSeleccion", sql.NVarChar(20), data.modoSeleccion)
      .input("reglaCoincidencia", sql.NVarChar(20), data.reglaCoincidencia)
      .input("fechaInicio", sql.Date, data.fechaInicio)
      .input("fechaFin", sql.Date, data.fechaFin)
      .input("usuarioId", sql.Int, getUserId(req))
      .query(`
        INSERT INTO dbo.GrupoClase
          (InstitucionId, AnioLectivoId, PeriodoId, MateriaId, GrupoIdPrincipal,
           Nombre, Descripcion, ModoSeleccion, ReglaCoincidencia, FechaInicio,
           FechaFin, Activo, UsuarioCreadorId)
        OUTPUT INSERTED.GrupoClaseId
        VALUES
          (@institucionId, @anioLectivoId, @periodoId, @materiaId, @grupoIdPrincipal,
           @nombre, @descripcion, @modoSeleccion, @reglaCoincidencia, @fechaInicio,
           @fechaFin, 1, @usuarioId);
      `);
    const grupoClaseId = Number(inserted.recordset[0].GrupoClaseId);
    await saveChildren(transaction, grupoClaseId, data, getUserId(req));
    await transaction.commit();
    return created(res, { grupoClaseId }, "Grupo de clase creado correctamente");
  } catch (error: any) {
    try { await transaction.rollback(); } catch {}
    console.error("Error creando grupo de clase:", error);
    if (error?.number === 2601 || error?.number === 2627) {
      return res.status(409).json({ ok: false, message: "El grupo contiene relaciones duplicadas" });
    }
    return res.status(500).json({ ok: false, message: "No se pudo crear el grupo de clase" });
  }
});

router.post("/:grupoClaseId/duplicar", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await requireSchema(pool, res)) return;
    const grupoClaseIdOrigen = positiveId(req.params.grupoClaseId);
    if (!grupoClaseIdOrigen) return badRequest(res, "Grupo de clase invalido");

    const source = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoClaseId", sql.Int, grupoClaseIdOrigen)
      .query(`
        SELECT TOP 1
          GrupoClaseId,
          AnioLectivoId,
          PeriodoId,
          MateriaId,
          GrupoIdPrincipal,
          Nombre,
          Descripcion,
          ModoSeleccion,
          ReglaCoincidencia,
          FechaInicio,
          FechaFin
        FROM dbo.GrupoClase
        WHERE GrupoClaseId = @grupoClaseId
          AND InstitucionId = @institucionId
          AND Activo = 1;

        SELECT GrupoId
        FROM dbo.GrupoClaseSeccion
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT SubEspecialidadId
        FROM dbo.GrupoClaseSubEspecialidad
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT MatriculaId
        FROM dbo.GrupoClaseEstudiante
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT UsuarioId, EsPrincipal
        FROM dbo.GrupoClaseDocente
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;

        SELECT HorarioGrupoId
        FROM dbo.GrupoClaseHorario
        WHERE GrupoClaseId = @grupoClaseId AND Activo = 1;
      `);

    const header = source.recordsets[0]?.[0];
    if (!header) {
      return res.status(404).json({ ok: false, message: "Grupo de clase no encontrado" });
    }

    const profesores = source.recordsets[4] || [];
    const payload = {
      nombre: text(req.body?.nombre, 200) || duplicateName(header.Nombre),
      descripcion: header.Descripcion,
      anioLectivoId: Number(header.AnioLectivoId),
      periodoId: Number(header.PeriodoId),
      materiaId: Number(header.MateriaId),
      grupoIdPrincipal: Number(header.GrupoIdPrincipal),
      grupoIds: (source.recordsets[1] || []).map((row: any) => Number(row.GrupoId)),
      subEspecialidadIds: (source.recordsets[2] || []).map((row: any) => Number(row.SubEspecialidadId)),
      matriculaIds: (source.recordsets[3] || []).map((row: any) => Number(row.MatriculaId)),
      usuarioIds: profesores.map((row: any) => Number(row.UsuarioId)),
      usuarioPrincipalId: Number(profesores.find((row: any) => row.EsPrincipal)?.UsuarioId || 0) || null,
      horarioGrupoIds: (source.recordsets[5] || []).map((row: any) => Number(row.HorarioGrupoId)),
      modoSeleccion: header.ModoSeleccion || "MIXTO",
      reglaCoincidencia: header.ReglaCoincidencia || "CUALQUIERA",
      fechaInicio: dateText(header.FechaInicio),
      fechaFin: dateText(header.FechaFin)
    };

    const validation = await validatePayload({ pool, institucionId, payload });
    if (!validation.valid) return badRequest(res, "No se pudo duplicar el grupo", validation.errors);
    const data = validation.data!;

    await transaction.begin();
    const inserted = await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, data.anioLectivoId)
      .input("periodoId", sql.Int, data.periodoId)
      .input("materiaId", sql.Int, data.materiaId)
      .input("grupoIdPrincipal", sql.Int, data.grupoIdPrincipal)
      .input("nombre", sql.NVarChar(200), data.nombre)
      .input("descripcion", sql.NVarChar(500), data.descripcion)
      .input("modoSeleccion", sql.NVarChar(20), data.modoSeleccion)
      .input("reglaCoincidencia", sql.NVarChar(20), data.reglaCoincidencia)
      .input("fechaInicio", sql.Date, data.fechaInicio)
      .input("fechaFin", sql.Date, data.fechaFin)
      .input("usuarioId", sql.Int, getUserId(req))
      .query(`
        INSERT INTO dbo.GrupoClase
          (InstitucionId, AnioLectivoId, PeriodoId, MateriaId, GrupoIdPrincipal,
           Nombre, Descripcion, ModoSeleccion, ReglaCoincidencia, FechaInicio,
           FechaFin, Activo, UsuarioCreadorId)
        OUTPUT INSERTED.GrupoClaseId
        VALUES
          (@institucionId, @anioLectivoId, @periodoId, @materiaId, @grupoIdPrincipal,
           @nombre, @descripcion, @modoSeleccion, @reglaCoincidencia, @fechaInicio,
           @fechaFin, 1, @usuarioId);
      `);
    const grupoClaseId = Number(inserted.recordset[0].GrupoClaseId);
    await saveChildren(transaction, grupoClaseId, data, getUserId(req));
    await transaction.commit();
    catalogCache.delete(institucionId);
    return created(res, { grupoClaseId }, "Grupo de clase duplicado correctamente");
  } catch (error: any) {
    try { await transaction.rollback(); } catch {}
    console.error("Error duplicando grupo de clase:", error);
    if (error?.number === 2601 || error?.number === 2627) {
      return res.status(409).json({ ok: false, message: "El grupo contiene relaciones duplicadas" });
    }
    return res.status(500).json({ ok: false, message: "No se pudo duplicar el grupo de clase" });
  }
});

router.put("/:grupoClaseId", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await requireSchema(pool, res)) return;
    const grupoClaseId = positiveId(req.params.grupoClaseId);
    if (!grupoClaseId) return badRequest(res, "Grupo de clase invalido");
    const validation = await validatePayload({ pool, institucionId, payload: req.body });
    if (!validation.valid) return badRequest(res, "Revise los datos del grupo", validation.errors);
    const data = validation.data!;

    await transaction.begin();
    const updated = await new sql.Request(transaction)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, data.anioLectivoId)
      .input("periodoId", sql.Int, data.periodoId)
      .input("materiaId", sql.Int, data.materiaId)
      .input("grupoIdPrincipal", sql.Int, data.grupoIdPrincipal)
      .input("nombre", sql.NVarChar(200), data.nombre)
      .input("descripcion", sql.NVarChar(500), data.descripcion)
      .input("modoSeleccion", sql.NVarChar(20), data.modoSeleccion)
      .input("reglaCoincidencia", sql.NVarChar(20), data.reglaCoincidencia)
      .input("fechaInicio", sql.Date, data.fechaInicio)
      .input("fechaFin", sql.Date, data.fechaFin)
      .query(`
        UPDATE dbo.GrupoClase
        SET AnioLectivoId = @anioLectivoId,
            PeriodoId = @periodoId,
            MateriaId = @materiaId,
            GrupoIdPrincipal = @grupoIdPrincipal,
            Nombre = @nombre,
            Descripcion = @descripcion,
            ModoSeleccion = @modoSeleccion,
            ReglaCoincidencia = @reglaCoincidencia,
            FechaInicio = @fechaInicio,
            FechaFin = @fechaFin,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoClaseId
        WHERE GrupoClaseId = @grupoClaseId
          AND InstitucionId = @institucionId;
      `);
    if (!updated.recordset[0]) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: "Grupo de clase no encontrado" });
    }
    await saveChildren(transaction, grupoClaseId, data, getUserId(req));
    await transaction.commit();
    return ok(res, { grupoClaseId }, "Grupo de clase actualizado correctamente");
  } catch (error: any) {
    try { await transaction.rollback(); } catch {}
    console.error("Error actualizando grupo de clase:", error);
    if (error?.number === 2601 || error?.number === 2627) {
      return res.status(409).json({ ok: false, message: "El grupo contiene relaciones duplicadas" });
    }
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el grupo de clase" });
  }
});

router.delete("/:grupoClaseId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const grupoClaseId = positiveId(req.params.grupoClaseId);
    if (!grupoClaseId) return badRequest(res, "Grupo de clase invalido");
    const pool = await getPool();
    if (!await requireSchema(pool, res)) return;
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("grupoClaseId", sql.Int, grupoClaseId)
      .query(`
        UPDATE dbo.GrupoClase
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.GrupoClaseId
        WHERE GrupoClaseId = @grupoClaseId
          AND InstitucionId = @institucionId
          AND Activo = 1;
      `);
    if (!result.recordset[0]) {
      return res.status(404).json({ ok: false, message: "Grupo de clase no encontrado" });
    }
    return ok(res, { grupoClaseId }, "Grupo de clase desactivado correctamente");
  } catch (error) {
    console.error("Error desactivando grupo de clase:", error);
    return res.status(500).json({ ok: false, message: "No se pudo desactivar el grupo de clase" });
  }
});

export default router;
