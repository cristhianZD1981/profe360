import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok } from "../../utils/http";

const router = Router();
router.use(requireAuth);

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
  const pool = await getPool();
  const seccionesResult = await pool.request()
    .input("institucionId", sql.Int, req.auth?.institucionId)
    .query(`
      SELECT g.GrupoId, g.Nombre AS GrupoNombre
      FROM dbo.Grupo g
      WHERE g.InstitucionId = @institucionId
      ORDER BY g.Nombre
    `);

  const alumnosResult = await pool.request()
    .input("institucionId", sql.Int, req.auth?.institucionId)
    .query(`
      SELECT
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        g.GrupoId,
        g.Nombre AS GrupoNombre
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND m.Estado = 'ACTIVA'
      ORDER BY g.Nombre, e.PrimerApellido, e.SegundoApellido, e.Nombre
    `);

  return ok(res, {
    secciones: seccionesResult.recordset,
    alumnos: alumnosResult.recordset
  });
});

router.get("/gestion-profe", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const tipo = String(req.query.tipo || "NOTAS").toUpperCase();
  const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
  const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
  const desde = String(req.query.desde || "").trim() || null;
  const hasta = String(req.query.hasta || "").trim() || null;

  const request = pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("desde", sql.Date, desde)
    .input("hasta", sql.Date, hasta);

  const filtrosBase = `
    (@grupoId IS NULL OR base.GrupoId = @grupoId)
    AND (@estudianteId IS NULL OR base.EstudianteId = @estudianteId)
  `;

  if (tipo === "ASISTENCIA") {
    const result = await request.query(`
      SELECT
        base.GrupoId,
        base.GrupoNombre,
        base.EstudianteId,
        base.Identificacion,
        base.Nombre,
        base.PrimerApellido,
        base.SegundoApellido,
        COUNT(ar.AsistenciaRegistroId) AS TotalRegistros,
        SUM(CASE WHEN ar.Estado = 'AUSENTE_INJUSTIFICADA' THEN 1 ELSE 0 END) AS AusenciasInjustificadas,
        SUM(CASE WHEN ar.Estado = 'TARDIA_MAYOR_10' THEN 1 ELSE 0 END) AS TardiasMayor10
      FROM (
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
      ) base
      LEFT JOIN dbo.AsistenciaRegistro ar
        ON ar.EstudianteId = base.EstudianteId
        AND ar.GrupoId = base.GrupoId
        AND (@desde IS NULL OR ar.Fecha >= @desde)
        AND (@hasta IS NULL OR ar.Fecha <= @hasta)
      WHERE ${filtrosBase}
      GROUP BY base.GrupoId, base.GrupoNombre, base.EstudianteId, base.Identificacion, base.Nombre, base.PrimerApellido, base.SegundoApellido
      ORDER BY base.GrupoNombre, base.PrimerApellido, base.SegundoApellido, base.Nombre
    `);
    return ok(res, result.recordset);
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
    const result = await request.query(`
      SELECT
        b.BoletaConductaId,
        b.Consecutivo,
        b.Fecha,
        b.Seccion AS GrupoNombre,
        b.NombreFuncionario,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido
      FROM dbo.BoletaConducta b
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = b.EstudianteId
      LEFT JOIN dbo.Grupo g ON g.Nombre = b.Seccion AND g.InstitucionId = @institucionId
      WHERE b.InstitucionId = @institucionId
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR e.EstudianteId = @estudianteId)
        AND (@desde IS NULL OR b.Fecha >= @desde)
        AND (@hasta IS NULL OR b.Fecha <= @hasta)
      ORDER BY b.Fecha DESC, b.Consecutivo DESC
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
      ORDER BY g.Nombre, e.PrimerApellido, e.SegundoApellido, e.Nombre
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
export default router;
