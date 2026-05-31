import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, ok } from "../../utils/http";

const router = Router();
router.use(requireAuth);

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fechaLargaCR(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
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
        Suscrito NVARCHAR(200) NOT NULL,
        Puesto NVARCHAR(200) NOT NULL,
        CodigoPresupuestario NVARCHAR(50) NULL,
        TipoEducacion NVARCHAR(80) NOT NULL,
        MotivoTramite NVARCHAR(120) NOT NULL,
        FechaEmision DATE NOT NULL,
        CreatedByUsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioRegistro_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE UNIQUE INDEX UX_CertificacionEstudioRegistro_InstitucionConsecutivo
        ON dbo.CertificacionEstudioRegistro(InstitucionId, Consecutivo);
      CREATE INDEX IX_CertificacionEstudioRegistro_Estudiante
        ON dbo.CertificacionEstudioRegistro(InstitucionId, EstudianteId, CreatedAt DESC);
    END;
  `);
}

function buildConstanciaHtml(params: {
  institucion: any;
  codigoConstancia: string;
  suscrito: string;
  puesto: string;
  codigoPresupuestario: string;
  estudianteNombre: string;
  identificacion: string;
  grado: string;
  tipoEducacion: string;
  motivoTramite: string;
  fechaEmision: Date;
}) {
  const p = params;
  const nombreInstitucionCabecera =
    p.institucion?.NombreOficialBoleta ||
    p.institucion?.NombreComercial ||
    p.institucion?.Nombre ||
    "";
  const ciudad = String(p.institucion?.DireccionExacta || p.institucion?.Direccion || "").split(",")[0] || "Costa Rica";
  const textoMotivo = p.motivoTramite === "TRASLADO" ? "traslado a otro colegio" : "trámites ante el IMAS";

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Constancia ${escapeHtml(p.codigoConstancia)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f3f4f6;margin:0;padding:0}
    .page{width:900px;margin:18px auto;background:#fff;padding:10px 20px 24px;border:1px solid #d1d5db}
    .top-header{display:grid;grid-template-columns:430px 1fr 84px;align-items:center;border-bottom:1px solid #4b5563;padding-bottom:6px;min-height:84px}
    .top-left img{width:100%;max-height:74px;object-fit:contain}
    .top-center{padding:0 8px;font-size:12px;line-height:1.2;font-weight:700}
    .top-right img{width:70px;height:70px;object-fit:contain}
    h1{text-align:center;margin:56px 0 10px;font-size:44px;letter-spacing:1px}
    h2{text-align:center;margin:0 0 34px;font-size:36px;letter-spacing:2px}
    .texto{font-size:32px;line-height:1.56;text-align:justify;margin:0 0 24px}
    .firma{margin-top:56px;font-size:30px;line-height:1.5}
    .ultima{margin-top:30px;text-align:center;font-size:20px;color:#334155}
    .pie{margin-top:34px;padding-top:8px;border-top:2px solid #93c5fd;text-align:center;font-size:16px;color:#475569}
    @media print{body{background:#fff}.page{border:0;margin:0;width:100%}}
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
      L@ Suscrit@, <strong>${escapeHtml(p.suscrito)}</strong>, en calidad de <strong>${escapeHtml(p.puesto)}</strong> del
      <strong>${escapeHtml(nombreInstitucionCabecera)}</strong>, código presupuestario <strong>${escapeHtml(p.codigoPresupuestario)}</strong>,
      hace constar que la persona estudiante <strong>${escapeHtml(p.estudianteNombre)}</strong>, número de cédula
      <strong>${escapeHtml(p.identificacion)}</strong>, es estudiante regular de <strong>${escapeHtml(p.grado)}</strong>
      de la Educación <strong>${escapeHtml(p.tipoEducacion)}</strong>.
    </p>

    <p class="texto">
      Dado en <strong>${escapeHtml(ciudad)}</strong>, a los <strong>${escapeHtml(fechaLargaCR(p.fechaEmision))}</strong>,
      a solicitud de la persona encargada para <strong>${escapeHtml(textoMotivo)}</strong>.
    </p>

    <div class="firma">
      <div><strong>${escapeHtml(p.suscrito)}</strong></div>
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
      ORDER BY g.Nombre, e.PrimerApellido, e.SegundoApellido, e.Nombre
    `);
    return ok(res, result.recordset);
  }

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
      ORDER BY g.Nombre, e.PrimerApellido, e.SegundoApellido, e.Nombre
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
  const codigoPresupuestarioBody = String(req.body?.codigoPresupuestario || "").trim();
  const tipoEducacion = String(req.body?.tipoEducacion || "").trim().toUpperCase();
  const motivoTramite = String(req.body?.motivoTramite || "").trim().toUpperCase();
  const fechaEmision = req.body?.fechaEmision ? new Date(req.body.fechaEmision) : new Date();
  const userId = Number(req.auth?.userId || req.auth?.usuarioId || req.auth?.id || 0);

  if (!estudianteId) return badRequest(res, "Seleccioná el estudiante");
  if (!["GENERAL BASICA", "DIVERSIFICADA", "ESPECIAL"].includes(tipoEducacion)) {
    return badRequest(res, "Tipo de educación inválido");
  }
  if (!["IMAS", "TRASLADO"].includes(motivoTramite)) {
    return badRequest(res, "Motivo inválido");
  }

  await ensureCertificacionEstudioTables(pool);

  const institucionResult = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1
        InstitucionId, Nombre, NombreComercial, NombreOficialBoleta,
        CorreoPrincipal, TelefonoPrincipal, Direccion, DireccionExacta,
        LogoUrl, MembreteUrl, RegionalEducativa, CircuitoEducativo, CodigoPresupuestario
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
        NULLIF(LTRIM(RTRIM(ISNULL(u.Cargo, ''))), '') AS Cargo,
        r.Nombre AS RolNombre
      FROM dbo.Usuario u
      LEFT JOIN dbo.UsuarioRol ur ON ur.UsuarioId = u.UsuarioId AND ISNULL(ur.Activo, 1) = 1
      LEFT JOIN dbo.Rol r ON r.RolId = ur.RolId
      WHERE u.UsuarioId = @usuarioId
    `);
  const firmante = firmanteResult.recordset[0] || {};
  const suscrito = [firmante.Nombre, firmante.PrimerApellido, firmante.SegundoApellido].filter(Boolean).join(" ").trim();
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
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(60), g.Nivel))), ''),
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(60), g.NivelAcademico))), ''),
          g.Nombre
        ) AS GradoNombre
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g ON g.GrupoId = m.GrupoId
      WHERE e.InstitucionId = @institucionId
        AND e.EstudianteId = @estudianteId
        AND m.Estado = 'ACTIVA'
        AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
      ORDER BY m.UpdatedAt DESC, m.MatriculaId DESC
    `);
  const estudiante = estudianteResult.recordset[0];
  if (!estudiante) return badRequest(res, "No se encontró matrícula activa para este estudiante");

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const configReq = new sql.Request(transaction);
    configReq.input("institucionId", sql.Int, institucionId);
    const config = await configReq.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.CertificacionEstudioConfig WHERE InstitucionId=@institucionId)
      BEGIN
        INSERT INTO dbo.CertificacionEstudioConfig (InstitucionId, SiguienteNumero, Prefijo, UpdatedAt)
        VALUES (@institucionId, 1, N'CONST', SYSDATETIME());
      END;
      SELECT TOP 1 SiguienteNumero, ISNULL(Prefijo, N'CONST') AS Prefijo
      FROM dbo.CertificacionEstudioConfig
      WHERE InstitucionId=@institucionId;
    `);
    const next = Number(config.recordset[0]?.SiguienteNumero || 1);
    const prefijo = String(config.recordset[0]?.Prefijo || "CONST").trim() || "CONST";
    const year = fechaEmision.getFullYear();
    const codigoConstancia = `${prefijo}-${String(next).padStart(4, "0")}-${year}`;

    await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        UPDATE dbo.CertificacionEstudioConfig
        SET SiguienteNumero = SiguienteNumero + 1,
            UpdatedAt = SYSDATETIME()
        WHERE InstitucionId = @institucionId;
      `);

    await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("consecutivo", sql.Int, next)
      .input("codigoConstancia", sql.NVarChar(120), codigoConstancia)
      .input("estudianteId", sql.Int, Number(estudiante.EstudianteId))
      .input("grupoId", sql.Int, Number(estudiante.GrupoId || 0) || null)
      .input("suscrito", sql.NVarChar(200), suscrito)
      .input("puesto", sql.NVarChar(200), puesto)
      .input("codigoPresupuestario", sql.NVarChar(50), codigoPresupuestarioBody || String(institucion.CodigoPresupuestario || ""))
      .input("tipoEducacion", sql.NVarChar(80), tipoEducacion)
      .input("motivoTramite", sql.NVarChar(120), motivoTramite)
      .input("fechaEmision", sql.Date, fechaEmision)
      .input("createdByUsuarioId", sql.Int, Number((req.auth as any)?.usuarioId || 0) || null)
      .query(`
        INSERT INTO dbo.CertificacionEstudioRegistro
          (InstitucionId, Consecutivo, CodigoConstancia, EstudianteId, GrupoId, Suscrito, Puesto, CodigoPresupuestario, TipoEducacion, MotivoTramite, FechaEmision, CreatedByUsuarioId)
        VALUES
          (@institucionId, @consecutivo, @codigoConstancia, @estudianteId, @grupoId, @suscrito, @puesto, @codigoPresupuestario, @tipoEducacion, @motivoTramite, @fechaEmision, @createdByUsuarioId);
      `);

    await transaction.commit();

    const estudianteNombre = [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" ");
    const html = buildConstanciaHtml({
      institucion,
      codigoConstancia,
      suscrito,
      puesto,
      codigoPresupuestario: codigoPresupuestarioBody || String(institucion.CodigoPresupuestario || ""),
      estudianteNombre,
      identificacion: String(estudiante.Identificacion || ""),
      grado: String(estudiante.GrupoNombre || estudiante.GradoNombre || ""),
      tipoEducacion,
      motivoTramite,
      fechaEmision
    });

    return ok(res, {
      codigoConstancia,
      consecutivo: next,
      html,
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
export default router;
