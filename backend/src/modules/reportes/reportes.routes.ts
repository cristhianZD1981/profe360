import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql, timedQuery } from "../../config/database";
import { badRequest, ok } from "../../utils/http";
import { getCostaRicaIsoDate, parseDateInputAsLocalDate } from "../../utils/date.utils";

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
  const numero = String(Number(siguienteNumero || 0)).padStart(2, "0");
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
    TRY_CONVERT(int, LEFT(g.Nombre, CHARINDEX('-', g.Nombre + '-') - 1)),
    TRY_CONVERT(int, SUBSTRING(g.Nombre, CHARINDEX('-', g.Nombre + '-') + 1, 20)),
    g.Nombre
`;

const SQL_ORDER_BY_SECCION_Y_ESTUDIANTE = `
  ORDER BY
    TRY_CONVERT(int, LEFT(g.Nombre, CHARINDEX('-', g.Nombre + '-') - 1)),
    TRY_CONVERT(int, SUBSTRING(g.Nombre, CHARINDEX('-', g.Nombre + '-') + 1, 20)),
    g.Nombre,
    e.PrimerApellido,
    e.SegundoApellido,
    e.Nombre
`;

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
        e.SegundoApellido
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
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
    ORDER BY GrupoNombre, PrimerApellido, SegundoApellido, Nombre
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
          e.SegundoApellido
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
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
        bs.GrupoNombre,
        bs.PrimerApellido,
        bs.SegundoApellido,
        bs.Nombre
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
        e.SegundoApellido
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = m.EstudianteId
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
      mb.GrupoNombre,
      mb.PrimerApellido,
      mb.SegundoApellido,
      mb.Nombre,
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
  `);
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
    .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:10mm 12mm 8mm;border:1px solid #d1d5db;display:flex;flex-direction:column}
    .top-header{display:grid;grid-template-columns:430px 1fr 84px;align-items:center;border-bottom:1px solid #4b5563;padding-bottom:6px;min-height:84px}
    .top-left img{width:100%;max-height:74px;object-fit:contain}
    .top-center{padding:0 8px;font-size:12px;line-height:1.2;font-weight:400}
    .top-right img{width:70px;height:70px;object-fit:contain}
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
      hace constar que la persona estudiante ${escapeHtml(p.estudianteNombre)}, número de cédula
      ${escapeHtml(p.identificacion)}, es estudiante regular de ${escapeHtml(p.grado)}
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

    return ok(res, {
      secciones: seccionesResult.recordset,
      alumnos: alumnosResult.recordset,
      profesores: profesoresResult.recordset
    });
  } catch (error) {
    console.error("Error cargando filtros de reportes:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los filtros de reportes" });
  }
});

router.get("/gestion-profe", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const tipo = String(req.query.tipo || "NOTAS").toUpperCase();
  const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
  const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
  const profesorId = req.query.profesorId ? Number(req.query.profesorId) : null;
  const desde = String(req.query.desde || "").trim() || null;
  const hasta = String(req.query.hasta || "").trim() || null;
  const vistaPor = String(req.query.vistaPor || "SECCION").trim().toUpperCase();

  const request = pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("profesorId", sql.Int, profesorId)
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
      return badRequest(res, "Vista de boletas invÃ¡lida");
    }
    if (vistaPor === "ALUMNO" && !estudianteId) {
      return badRequest(res, "DebÃ©s seleccionar un alumno para este reporte");
    }
    if (vistaPor === "SECCION" && !grupoId) {
      return badRequest(res, "DebÃ©s seleccionar una secciÃ³n para este reporte");
    }
    if (vistaPor === "PROFESOR" && !(profesorId || (!isAdminReportUser(req) && getUserId(req)))) {
      return badRequest(res, "DebÃ©s seleccionar un profesor para este reporte");
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
      ORDER BY b.Fecha DESC, b.Consecutivo DESC, b.BoletaConductaId DESC
    `));

    const rows = result.recordset.map((item: any) => ({
      boletaConductaId: Number(item.BoletaConductaId || 0),
      numeroBoleta: String(item.CodigoBoleta || "").trim() || String(Number(item.Consecutivo || 0)).padStart(2, "0"),
      nombre: [item.PrimerApellido, item.SegundoApellido, item.Nombre].filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      cedula: String(item.Identificacion || ""),
      seccion: String(item.Seccion || item.GrupoNombre || ""),
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
  if (!["IMAS", "TRASLADO", "OTROS"].includes(motivoTramite)) {
    return badRequest(res, "Motivo inválido");
  }

  if (motivoTramite === "TRASLADO" && !otroColegioDestino) {
    return badRequest(res, "Debés indicar el nombre del otro colegio");
  }

  await ensureCertificacionEstudioTables(pool);
  await ensureUsuarioSexoColumn(pool);

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
        u.Sexo,
        NULLIF(LTRIM(RTRIM(ISNULL(u.Cargo, ''))), '') AS Cargo,
        r.Nombre AS RolNombre
      FROM dbo.Usuario u
      LEFT JOIN dbo.UsuarioRol ur ON ur.UsuarioId = u.UsuarioId AND ISNULL(ur.Activo, 1) = 1
      LEFT JOIN dbo.Rol r ON r.RolId = ur.RolId
      WHERE u.UsuarioId = @usuarioId
    `);
  const firmante = firmanteResult.recordset[0] || {};
  const suscrito = [firmante.Nombre, firmante.PrimerApellido, firmante.SegundoApellido].filter(Boolean).join(" ").trim();
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
        g.GrupoId,
        g.Nombre AS GrupoNombre,
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
    const htmlFinal = buildConstanciaHtml({
      institucion,
      codigoConstancia,
      suscrito,
      textoSuscrito,
      puesto,
      codigoPresupuestario: String(institucion.CodigoPresupuestario || ""),
      estudianteNombre,
      identificacion: String(estudiante.Identificacion || ""),
      grado: String(estudiante.GrupoNombre || estudiante.GradoNombre || ""),
      tipoEducacion,
      motivoTramite,
      cursoLectivo,
      lugarEmision,
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

    await new sql.Request(transaction)
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
        VALUES
          (@institucionId, @consecutivo, @codigoConstancia, @estudianteId, @grupoId, @estudianteNombre, @identificacion, @grupoNombre, @suscrito, @puesto, @codigoPresupuestario, @tipoEducacion, @motivoTramite, @cursoLectivo, @otroColegioDestino, @lugarEmision, @htmlSnapshot, @fechaEmision, @createdByUsuarioId);
      `);

    await transaction.commit();

    return ok(res, {
      codigoConstancia,
      consecutivo: next,
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
        CONVERT(varchar(10), cer.FechaEmision, 103) AS FechaEmisionTexto
      FROM dbo.CertificacionEstudioRegistro cer
      WHERE cer.InstitucionId = @institucionId
        AND (@motivoTramite IS NULL OR cer.MotivoTramite = @motivoTramite)
        AND (@grupoId IS NULL OR cer.GrupoId = @grupoId)
        AND (@estudianteId IS NULL OR cer.EstudianteId = @estudianteId)
        AND (
          @q IS NULL
          OR LOWER(ISNULL(cer.EstudianteNombre, '')) LIKE '%' + @q + '%'
          OR LOWER(ISNULL(cer.Identificacion, '')) LIKE '%' + @q + '%'
        )
      ORDER BY cer.Consecutivo ASC, cer.CertificacionEstudioId ASC
    `);

  return ok(res, result.recordset);
});

router.get("/certificaciones/constancia-estudio/:certificacionId", async (req, res) => {
  const pool = await getPool();
  const institucionId = Number(req.auth?.institucionId || 0);
  const certificacionId = Number(req.params.certificacionId || 0);
  if (!certificacionId) return badRequest(res, "CertificaciÃ³n invÃ¡lida");

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
  if (!row) return res.status(404).json({ ok: false, message: "No se encontrÃ³ la certificaciÃ³n" });

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
          Codigo = ISNULL(NULLIF(b.CodigoBoleta, N''), RIGHT(N'00' + CONVERT(varchar(20), ISNULL(b.Consecutivo, 0)), 2)),
          Detalle = ISNULL(b.DetalleHechos, N''),
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
        Codigo = ISNULL(NULLIF(cer.CodigoConstancia, N''), N'CONST-' + RIGHT(N'0000' + CONVERT(varchar(20), ISNULL(cer.Consecutivo, 0)), 4)),
        Detalle = ISNULL(cer.MotivoTramite, N''),
        CorreoEnviado = N'-',
        WhatsAppEnviado = N'-'
      FROM dbo.CertificacionEstudioRegistro cer
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
