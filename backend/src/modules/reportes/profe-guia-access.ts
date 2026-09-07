import { getPool, sql } from "../../config/database";

export async function autorizarReporteGuia(req: any, res: any) {
  const grupoId = Number(req.query.guiaGrupoId);
  const anioLectivoId = Number(req.query.guiaAnioLectivoId);
  const periodoId = Number(req.query.guiaPeriodoId);
  const institucionId = Number(req.auth?.institucionId || 0);
  const usuarioId = Number(req.auth?.userId || req.auth?.usuarioId || req.auth?.id || 0);
  if (![grupoId, anioLectivoId, periodoId, institucionId, usuarioId].every((id) => Number.isInteger(id) && id > 0)) {
    res.status(403).json({ ok: false, message: "No tenés acceso a los reportes de este grupo guía" });
    return null;
  }
  const pool = await getPool();
  const result = await pool.request()
    .input("grupoId", sql.Int, grupoId).input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId).input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, usuarioId)
    .query(`
      SELECT TOP 1 g.Nombre AS GrupoNombre,
        CONVERT(varchar(10), p.FechaInicio, 23) AS Desde,
        CONVERT(varchar(10), p.FechaFin, 23) AS Hasta
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId AND g.InstitucionId = @institucionId
      INNER JOIN dbo.Periodo p ON p.PeriodoId = @periodoId AND p.AnioLectivoId = ad.AnioLectivoId
      WHERE ad.InstitucionId = @institucionId AND ad.UsuarioId = @usuarioId
        AND ad.GrupoId = @grupoId AND ad.AnioLectivoId = @anioLectivoId
        AND (ad.PeriodoId = @periodoId OR ad.PeriodoId IS NULL)
        AND ad.Activo = 1 AND ad.TipoAsignacion = N'PROFESOR_GUIA'
    `);
  if (!result.recordset[0]) {
    res.status(403).json({ ok: false, message: "Solo el profesor guía asignado puede consultar este grupo" });
    return null;
  }
  return { grupoId, anioLectivoId, periodoId, institucionId, ...result.recordset[0] };
}

export async function cargarFiltrosGuia(scope: any) {
  const pool = await getPool();
  const request = () => pool.request().input("grupoId", sql.Int, scope.grupoId)
    .input("anioLectivoId", sql.Int, scope.anioLectivoId).input("periodoId", sql.Int, scope.periodoId)
    .input("institucionId", sql.Int, scope.institucionId);
  const alumnos = await request().query(`
    SELECT DISTINCT e.EstudianteId, e.Identificacion, e.Nombre, e.PrimerApellido, e.SegundoApellido,
      ma.GrupoId, e.Adecuacion
    FROM dbo.Matricula ma INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
    WHERE ma.GrupoId = @grupoId AND ma.AnioLectivoId = @anioLectivoId
      AND e.InstitucionId = @institucionId AND e.Activo = 1 AND ISNULL(ma.Estado, N'') <> N'Inactiva'
    ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
  `);
  const materias = await request().query(`
    WITH MateriasBase AS (
      SELECT gm.MateriaId FROM dbo.GrupoMateria gm
      WHERE gm.GrupoId = @grupoId AND gm.Activo = 1 AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
      UNION
      SELECT ad.MateriaId FROM dbo.AsignacionDocente ad
      WHERE ad.InstitucionId = @institucionId AND ad.GrupoId = @grupoId AND ad.AnioLectivoId = @anioLectivoId
        AND ad.Activo = 1 AND (ad.PeriodoId = @periodoId OR ad.PeriodoId IS NULL) AND ad.MateriaId IS NOT NULL
    )
    SELECT DISTINCT mb.MateriaId, m.Nombre AS MateriaNombre, ISNULL(ad.UsuarioId, 0) AS ProfesorId,
      COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Nombre, N' ', u.PrimerApellido, N' ', u.SegundoApellido))), N''), N'Sin profesor asignado') AS ProfesorNombre,
      eg.GrupoClaseId, ISNULL(eg.GrupoId, @grupoId) AS GrupoConsultaId
    FROM MateriasBase mb
    INNER JOIN dbo.Materia m ON m.MateriaId = mb.MateriaId
    LEFT JOIN dbo.AsignacionDocente ad ON ad.MateriaId = mb.MateriaId AND ad.InstitucionId = @institucionId
      AND ad.GrupoId = @grupoId AND ad.AnioLectivoId = @anioLectivoId AND ad.Activo = 1
      AND (ad.PeriodoId = @periodoId OR ad.PeriodoId IS NULL)
    LEFT JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    LEFT JOIN dbo.Eval360_EstructuraGrupo eg ON eg.MateriaId = mb.MateriaId
      AND (eg.GrupoId = @grupoId OR EXISTS (
        SELECT 1 FROM dbo.GrupoClaseSeccion gcs
        WHERE gcs.GrupoClaseId = eg.GrupoClaseId AND gcs.GrupoId = @grupoId AND gcs.Activo = 1
      ))
      AND eg.AnioLectivoId = @anioLectivoId AND eg.PeriodoId = @periodoId
      AND eg.InstitucionId = @institucionId AND eg.Activo = 1
    ORDER BY m.Nombre, ProfesorNombre
  `);
  return {
    secciones: [{ GrupoId: scope.grupoId, GrupoNombre: scope.GrupoNombre }],
    alumnos: alumnos.recordset,
    materias: materias.recordset,
    desde: scope.Desde, hasta: scope.Hasta,
    profesores: [...new Map(materias.recordset.filter((m: any) => m.ProfesorId > 0).map((m: any) => [m.ProfesorId, { ProfesorId: m.ProfesorId, Nombre: m.ProfesorNombre }])).values()]
  };
}
