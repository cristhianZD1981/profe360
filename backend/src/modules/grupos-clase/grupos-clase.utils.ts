import { sql } from "../../config/database";

let schemaCache: { ready: boolean; checkedAt: number } | null = null;
const SCHEMA_CACHE_MS = 30_000;

export function toOptionalGrupoClaseId(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function hasGrupoClaseSchema(pool: any, force = false) {
  if (!force && schemaCache && Date.now() - schemaCache.checkedAt < SCHEMA_CACHE_MS) {
    return schemaCache.ready;
  }

  const result = await pool.request().query(`
    SELECT CAST(
      CASE
        WHEN OBJECT_ID(N'dbo.GrupoClase', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.GrupoClaseEstudiante', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.GrupoClaseDocente', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.GrupoClaseSeccion', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.GrupoClaseHorario', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.GrupoClaseLeccionPatron', N'U') IS NOT NULL
         AND OBJECT_ID(N'dbo.ProfesorPeriodoEstado', N'U') IS NOT NULL
         AND COL_LENGTH(N'dbo.GrupoClase', N'AplicaTodosPeriodos') IS NOT NULL
         AND COL_LENGTH(N'dbo.GrupoClase', N'GrupoClaseCanonicoId') IS NOT NULL
        THEN 1 ELSE 0
      END AS BIT
    ) AS Ready
  `);

  const ready = Boolean(result.recordset[0]?.Ready);
  schemaCache = { ready, checkedAt: Date.now() };
  return ready;
}

export async function getGrupoClasePermitido(params: {
  pool: any;
  grupoClaseId: number;
  institucionId: number;
  usuarioId?: number | null;
  permitirAdministrativo?: boolean;
  periodoId?: number | null;
}) {
  const result = await params.pool.request()
    .input("grupoClaseId", sql.Int, params.grupoClaseId)
    .input("institucionId", sql.Int, params.institucionId)
    .input("usuarioId", sql.Int, params.usuarioId || null)
    .input("permitirAdministrativo", sql.Bit, Boolean(params.permitirAdministrativo))
    .input("periodoId", sql.Int, params.periodoId || null)
    .query(`
      SELECT TOP 1
        gc.GrupoClaseId,
        gc.InstitucionId,
        gc.AnioLectivoId,
        periodo.PeriodoId,
        gc.MateriaId,
        gc.GrupoIdPrincipal,
        gc.Nombre,
        gc.Activo,
        g.Nivel AS GrupoNivel,
        m.Nombre AS MateriaNombre,
        al.Nombre AS AnioNombre,
        periodo.Nombre AS PeriodoNombre,
        principal.UsuarioId AS UsuarioPrincipalId
      FROM dbo.GrupoClase gc
      INNER JOIN dbo.Grupo g ON g.GrupoId = gc.GrupoIdPrincipal
      INNER JOIN dbo.Materia m ON m.MateriaId = gc.MateriaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
      INNER JOIN dbo.Periodo periodo
        ON periodo.PeriodoId = CASE
          WHEN gc.AplicaTodosPeriodos = 1 AND @periodoId IS NOT NULL THEN @periodoId
          ELSE gc.PeriodoId
        END
      OUTER APPLY (
        SELECT TOP 1 gcd.UsuarioId
        FROM dbo.GrupoClaseDocente gcd
        WHERE gcd.GrupoClaseId = gc.GrupoClaseId
          AND gcd.Activo = 1
        ORDER BY gcd.EsPrincipal DESC, gcd.GrupoClaseDocenteId
      ) principal
      WHERE gc.GrupoClaseId = @grupoClaseId
        AND gc.InstitucionId = @institucionId
        AND gc.Activo = 1
        AND (
          gc.AplicaTodosPeriodos = 0
          OR (
            periodo.AnioLectivoId = gc.AnioLectivoId
            AND (@periodoId IS NULL OR periodo.Activo = 1)
          )
        )
        AND (
          @permitirAdministrativo = 1
          OR EXISTS (
            SELECT 1
            FROM dbo.GrupoClaseDocente gcd
            WHERE gcd.GrupoClaseId = gc.GrupoClaseId
              AND gcd.UsuarioId = @usuarioId
              AND gcd.Activo = 1
          )
        )
        AND (
          @periodoId IS NULL
          OR @permitirAdministrativo = 1
          OR NOT EXISTS (
            SELECT 1
            FROM dbo.ProfesorPeriodoEstado ppe
            WHERE ppe.InstitucionId = gc.InstitucionId
              AND ppe.UsuarioId = @usuarioId
              AND ppe.AnioLectivoId = gc.AnioLectivoId
              AND ppe.PeriodoId = periodo.PeriodoId
              AND ppe.Habilitado = 0
          )
        )
    `);

  return result.recordset[0] || null;
}

export async function getGrupoClaseEstudiantesPermitidos(
  pool: any,
  grupoClaseId: number
) {
  const result = await pool.request()
    .input("grupoClaseId", sql.Int, grupoClaseId)
    .query(`
      SELECT DISTINCT
        ma.MatriculaId,
        ma.EstudianteId,
        ma.GrupoId
      FROM dbo.GrupoClaseEstudiante gce
      INNER JOIN dbo.Matricula ma
        ON ma.MatriculaId = gce.MatriculaId
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = ma.EstudianteId
      WHERE gce.GrupoClaseId = @grupoClaseId
        AND gce.Activo = 1
        AND (gce.FechaDesde IS NULL OR gce.FechaDesde <= CONVERT(date, SYSDATETIME()))
        AND (gce.FechaHasta IS NULL OR gce.FechaHasta >= CONVERT(date, SYSDATETIME()))
        AND ma.Estado <> N'Inactiva'
        AND e.Activo = 1
    `);

  return result.recordset || [];
}
