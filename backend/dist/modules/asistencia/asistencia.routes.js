"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.use((0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));
function getInstitutionId(req, res) {
    const institucionId = req.auth?.institucionId ?? null;
    if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
        (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        return null;
    }
    return Number(institucionId);
}
function getUserId(req) {
    return Number(req.auth?.userId || req.auth?.usuarioId || 0);
}
function hasRole(req, roleName) {
    const roles = Array.isArray(req.auth?.roles) ? req.auth.roles : [];
    return roles.includes(roleName);
}
function isAdminUser(req) {
    return (hasRole(req, "SUPER_ADMIN") ||
        hasRole(req, "ADMIN_INSTITUCIONAL") ||
        hasRole(req, "ADMINISTRATIVO"));
}
function isValidNonNegativeId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0;
}
async function getFechaClaseContext(pool, institucionId, fechaClaseId) {
    const result = await pool
        .request()
        .input("institucionId", database_1.sql.Int, institucionId)
        .input("fechaClaseId", database_1.sql.Int, fechaClaseId)
        .query(`
      SELECT TOP 1
        fc.FechaClaseId,
        fc.Fecha,
        fc.PeriodoId,
        fc.HorarioGrupoId,
        gm.GrupoMateriaId,
        gm.GrupoId,
        gm.MateriaId,
        p.AnioLectivoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.Nombre AS MateriaNombre,
        p.Nombre AS PeriodoNombre,
        a.Nombre AS AnioNombre,
        ses.AsistenciaSesionId,
        ses.DocenteId AS DocenteSesionId,
        ad.UsuarioId AS DocenteUsuarioId,
        d.DocenteId AS DocenteId
      FROM dbo.FechaClase fc
      INNER JOIN dbo.HorarioGrupo hg
        ON hg.HorarioGrupoId = fc.HorarioGrupoId
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
      INNER JOIN dbo.Periodo p
        ON p.PeriodoId = fc.PeriodoId
      INNER JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = p.AnioLectivoId
      LEFT JOIN dbo.AsistenciaSesion ses
        ON ses.FechaClaseId = fc.FechaClaseId
      OUTER APPLY
      (
        SELECT TOP 1 ad.UsuarioId
        FROM dbo.AsignacionDocente ad
        WHERE ad.InstitucionId = @institucionId
          AND ad.GrupoId = gm.GrupoId
          AND ad.AnioLectivoId = p.AnioLectivoId
          AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
          AND ad.Activo = 1
          AND ISNULL(ad.MateriaId, 0) = ISNULL(gm.MateriaId, 0)
          AND (ad.PeriodoId = fc.PeriodoId OR ad.PeriodoId IS NULL)
        ORDER BY
          CASE WHEN ad.PeriodoId = fc.PeriodoId THEN 0 ELSE 1 END,
          ad.AsignacionDocenteId DESC
      ) ad
      LEFT JOIN dbo.Docente d
        ON d.UsuarioId = ad.UsuarioId
       AND d.Activo = 1
      WHERE g.InstitucionId = @institucionId
        AND fc.FechaClaseId = @fechaClaseId
    `);
    return result.recordset[0] || null;
}
async function getMatriculadosActivosByClase(pool, grupoId, anioLectivoId) {
    const result = await pool
        .request()
        .input("grupoId", database_1.sql.Int, grupoId)
        .input("anioLectivoId", database_1.sql.Int, anioLectivoId)
        .query(`
      SELECT
        m.MatriculaId,
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = m.EstudianteId
      WHERE m.GrupoId = @grupoId
        AND m.AnioLectivoId = @anioLectivoId
        AND m.Estado = N'Activa'
        AND e.Activo = 1
      ORDER BY e.Nombre, e.PrimerApellido, e.SegundoApellido
    `);
    return result.recordset;
}
/* =========================================================
   CATALOGOS
   ========================================================= */
router.get("/catalogos", async (req, res) => {
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const pool = await (0, database_1.getPool)();
        const [anios, periodos, grupos, materias, estados] = await Promise.all([
            pool.request()
                .input("institucionId", database_1.sql.Int, institucionId)
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
                .input("institucionId", database_1.sql.Int, institucionId)
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
                .input("institucionId", database_1.sql.Int, institucionId)
                .query(`
          SELECT
            g.GrupoId,
            g.AnioLectivoId,
            g.Nombre,
            g.Nivel,
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
                .input("institucionId", database_1.sql.Int, institucionId)
                .query(`
          SELECT
            MateriaId,
            Nombre,
            Codigo,
            Descripcion,
            Activa AS Activo
          FROM dbo.Materia
          WHERE InstitucionId = @institucionId
            AND Activa = 1
          ORDER BY Nombre
        `),
            pool.request()
                .input("institucionId", database_1.sql.Int, institucionId)
                .query(`
          SELECT
            EstadoAsistenciaId,
            InstitucionId,
            Nombre,
            Codigo,
            PorcentajeAsistencia,
            ColorHex,
            Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.EstadoAsistencia
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY EstadoAsistenciaId
        `)
        ]);
        return (0, http_1.ok)(res, {
            aniosLectivos: anios.recordset,
            periodos: periodos.recordset,
            grupos: grupos.recordset,
            materias: materias.recordset,
            estadosAsistencia: estados.recordset
        });
    }
    catch (error) {
        console.error("Error cargando catálogos de asistencia:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al cargar catálogos de asistencia"
        });
    }
});
/* =========================================================
   CLASES PROGRAMADAS
   ========================================================= */
router.get("/fechas-clase", async (req, res) => {
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const q = String(req.query.q || "").trim();
        const anioLectivoId = req.query.anioLectivoId
            ? Number(req.query.anioLectivoId)
            : null;
        const periodoId = req.query.periodoId
            ? Number(req.query.periodoId)
            : null;
        const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
        const materiaId = req.query.materiaId
            ? Number(req.query.materiaId)
            : null;
        const fecha = req.query.fecha ? String(req.query.fecha) : null;
        const soloPendientes = String(req.query.soloPendientes || "false") === "true";
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("institucionId", database_1.sql.Int, institucionId)
            .input("q", database_1.sql.NVarChar, `%${q}%`)
            .input("anioLectivoId", database_1.sql.Int, anioLectivoId)
            .input("periodoId", database_1.sql.Int, periodoId)
            .input("grupoId", database_1.sql.Int, grupoId)
            .input("materiaId", database_1.sql.Int, materiaId)
            .input("fecha", database_1.sql.Date, fecha || null)
            .input("soloPendientes", database_1.sql.Bit, soloPendientes)
            .query(`
        SELECT
          fc.FechaClaseId,
          fc.Fecha,
          fc.PeriodoId,
          fc.EsExtraordinaria,
          fc.Observacion,
          hg.HorarioGrupoId,
          gm.GrupoMateriaId,
          gm.GrupoId,
          gm.MateriaId,
          p.AnioLectivoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          p.Nombre AS PeriodoNombre,
          a.Nombre AS AnioNombre,
          ses.AsistenciaSesionId,
          CASE
            WHEN ses.AsistenciaSesionId IS NULL THEN CAST(0 AS BIT)
            ELSE CAST(1 AS BIT)
          END AS TieneAsistencia,
          ad.UsuarioId AS DocenteAsignadoId,
          u.Correo AS DocenteCorreo,
          CONCAT(
            u.Nombre,
            CASE WHEN u.PrimerApellido IS NOT NULL THEN ' ' + u.PrimerApellido ELSE '' END,
            CASE WHEN u.SegundoApellido IS NOT NULL THEN ' ' + u.SegundoApellido ELSE '' END
          ) AS DocenteNombre
        FROM dbo.FechaClase fc
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        LEFT JOIN dbo.FeriadoInstitucional fi
          ON fi.InstitucionId = g.InstitucionId
         AND fi.Fecha = fc.Fecha
         AND fi.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        INNER JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        LEFT JOIN dbo.AsistenciaSesion ses
          ON ses.FechaClaseId = fc.FechaClaseId
        OUTER APPLY
        (
          SELECT TOP 1 ad.UsuarioId
          FROM dbo.AsignacionDocente ad
          WHERE ad.InstitucionId = @institucionId
            AND ad.GrupoId = gm.GrupoId
            AND ad.AnioLectivoId = p.AnioLectivoId
            AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
            AND ad.Activo = 1
            AND ISNULL(ad.MateriaId, 0) = ISNULL(gm.MateriaId, 0)
            AND (ad.PeriodoId = fc.PeriodoId OR ad.PeriodoId IS NULL)
          ORDER BY
            CASE WHEN ad.PeriodoId = fc.PeriodoId THEN 0 ELSE 1 END,
            ad.AsignacionDocenteId DESC
        ) ad
        LEFT JOIN dbo.Usuario u
          ON u.UsuarioId = ad.UsuarioId
        WHERE g.InstitucionId = @institucionId
          AND fi.FeriadoId IS NULL
          AND (@anioLectivoId IS NULL OR p.AnioLectivoId = @anioLectivoId)
          AND (@periodoId IS NULL OR fc.PeriodoId = @periodoId)
          AND (@grupoId IS NULL OR gm.GrupoId = @grupoId)
          AND (@materiaId IS NULL OR gm.MateriaId = @materiaId)
          AND (@fecha IS NULL OR fc.Fecha = @fecha)
          AND (@soloPendientes = 0 OR ses.AsistenciaSesionId IS NULL)
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR m.Nombre LIKE @q
            OR p.Nombre LIKE @q
            OR a.Nombre LIKE @q
            OR CONVERT(NVARCHAR(10), fc.Fecha, 23) LIKE @q
          )
        ORDER BY fc.Fecha DESC, g.Nombre, m.Nombre
      `);
        return (0, http_1.ok)(res, result.recordset);
    }
    catch (error) {
        console.error("Error al listar fechas de clase:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al listar fechas de clase"
        });
    }
});
/* =========================================================
   ESTUDIANTES POR CLASE
   ========================================================= */
router.get("/fechas-clase/:id/estudiantes", async (req, res) => {
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const fechaClaseId = Number(req.params.id);
        if (!isValidNonNegativeId(fechaClaseId)) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const pool = await (0, database_1.getPool)();
        const context = await getFechaClaseContext(pool, institucionId, fechaClaseId);
        if (!context) {
            return res.status(404).json({
                ok: false,
                message: "Clase no encontrada"
            });
        }
        const estudiantes = await pool
            .request()
            .input("grupoId", database_1.sql.Int, context.GrupoId)
            .input("anioLectivoId", database_1.sql.Int, context.AnioLectivoId)
            .input("asistenciaSesionId", database_1.sql.Int, context.AsistenciaSesionId ?? null)
            .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          da.DetalleAsistenciaId,
          da.EstadoAsistenciaId,
          da.Observacion
        FROM dbo.Matricula m
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = m.EstudianteId
        LEFT JOIN dbo.DetalleAsistencia da
          ON da.EstudianteId = e.EstudianteId
         AND da.AsistenciaSesionId = @asistenciaSesionId
        WHERE m.GrupoId = @grupoId
          AND m.AnioLectivoId = @anioLectivoId
          AND m.Estado = N'Activa'
          AND e.Activo = 1
        ORDER BY e.Nombre, e.PrimerApellido, e.SegundoApellido
      `);
        return (0, http_1.ok)(res, {
            clase: context,
            estudiantes: estudiantes.recordset
        });
    }
    catch (error) {
        console.error("Error al listar estudiantes de la clase:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al cargar estudiantes de la clase"
        });
    }
});
/* =========================================================
   LISTAR SESIONES
   ========================================================= */
router.get("/sesiones", async (req, res) => {
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const q = String(req.query.q || "").trim();
        const anioLectivoId = req.query.anioLectivoId
            ? Number(req.query.anioLectivoId)
            : null;
        const periodoId = req.query.periodoId
            ? Number(req.query.periodoId)
            : null;
        const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
        const materiaId = req.query.materiaId
            ? Number(req.query.materiaId)
            : null;
        const fecha = req.query.fecha ? String(req.query.fecha) : null;
        const pool = await (0, database_1.getPool)();
        const result = await pool
            .request()
            .input("institucionId", database_1.sql.Int, institucionId)
            .input("q", database_1.sql.NVarChar, `%${q}%`)
            .input("anioLectivoId", database_1.sql.Int, anioLectivoId)
            .input("periodoId", database_1.sql.Int, periodoId)
            .input("grupoId", database_1.sql.Int, grupoId)
            .input("materiaId", database_1.sql.Int, materiaId)
            .input("fecha", database_1.sql.Date, fecha || null)
            .query(`
        SELECT
          ses.AsistenciaSesionId,
          ses.FechaClaseId,
          ses.DocenteId,
          ses.FechaRegistro,
          ses.ObservacionGeneral,
          ses.UpdatedAt,
          fc.Fecha,
          g.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.MateriaId,
          m.Nombre AS MateriaNombre,
          p.PeriodoId,
          p.Nombre AS PeriodoNombre,
          a.AnioLectivoId,
          a.Nombre AS AnioNombre,
          CONCAT(
            u.Nombre,
            CASE WHEN u.PrimerApellido IS NOT NULL THEN ' ' + u.PrimerApellido ELSE '' END,
            CASE WHEN u.SegundoApellido IS NOT NULL THEN ' ' + u.SegundoApellido ELSE '' END
          ) AS DocenteNombre,
          (
            SELECT COUNT(*)
            FROM dbo.DetalleAsistencia da
            WHERE da.AsistenciaSesionId = ses.AsistenciaSesionId
          ) AS TotalDetalles
        FROM dbo.AsistenciaSesion ses
        INNER JOIN dbo.FechaClase fc
          ON fc.FechaClaseId = ses.FechaClaseId
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        LEFT JOIN dbo.FeriadoInstitucional fi
          ON fi.InstitucionId = g.InstitucionId
         AND fi.Fecha = fc.Fecha
         AND fi.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        INNER JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        INNER JOIN dbo.Docente d
          ON d.DocenteId = ses.DocenteId
        INNER JOIN dbo.Usuario u
          ON u.UsuarioId = d.UsuarioId
        WHERE g.InstitucionId = @institucionId
          AND (@anioLectivoId IS NULL OR a.AnioLectivoId = @anioLectivoId)
          AND (@periodoId IS NULL OR p.PeriodoId = @periodoId)
          AND (@grupoId IS NULL OR g.GrupoId = @grupoId)
          AND (@materiaId IS NULL OR m.MateriaId = @materiaId)
          AND (@fecha IS NULL OR fc.Fecha = @fecha)
          AND (
            @q = '%%'
            OR g.Nombre LIKE @q
            OR g.Nivel LIKE @q
            OR m.Nombre LIKE @q
            OR p.Nombre LIKE @q
            OR a.Nombre LIKE @q
            OR u.Nombre LIKE @q
            OR u.PrimerApellido LIKE @q
            OR u.SegundoApellido LIKE @q
            OR CONVERT(NVARCHAR(10), fc.Fecha, 23) LIKE @q
          )
        ORDER BY fc.Fecha DESC, ses.AsistenciaSesionId DESC
      `);
        return (0, http_1.ok)(res, result.recordset);
    }
    catch (error) {
        console.error("Error al listar sesiones de asistencia:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al listar sesiones de asistencia"
        });
    }
});
/* =========================================================
   VER SESION
   ========================================================= */
router.get("/sesiones/:id", async (req, res) => {
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const id = Number(req.params.id);
        if (!isValidNonNegativeId(id)) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const pool = await (0, database_1.getPool)();
        const sesion = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, institucionId)
            .query(`
        SELECT TOP 1
          ses.AsistenciaSesionId,
          ses.FechaClaseId,
          ses.DocenteId,
          ses.FechaRegistro,
          ses.ObservacionGeneral,
          ses.UpdatedAt,
          fc.Fecha,
          g.GrupoId,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.MateriaId,
          m.Nombre AS MateriaNombre,
          p.PeriodoId,
          p.Nombre AS PeriodoNombre,
          a.AnioLectivoId,
          a.Nombre AS AnioNombre,
          CONCAT(
            u.Nombre,
            CASE WHEN u.PrimerApellido IS NOT NULL THEN ' ' + u.PrimerApellido ELSE '' END,
            CASE WHEN u.SegundoApellido IS NOT NULL THEN ' ' + u.SegundoApellido ELSE '' END
          ) AS DocenteNombre
        FROM dbo.AsistenciaSesion ses
        INNER JOIN dbo.FechaClase fc
          ON fc.FechaClaseId = ses.FechaClaseId
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        LEFT JOIN dbo.FeriadoInstitucional fi
          ON fi.InstitucionId = g.InstitucionId
         AND fi.Fecha = fc.Fecha
         AND fi.Activo = 1
        INNER JOIN dbo.Materia m
          ON m.MateriaId = gm.MateriaId
        INNER JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        INNER JOIN dbo.AnioLectivo a
          ON a.AnioLectivoId = p.AnioLectivoId
        INNER JOIN dbo.Docente d
          ON d.DocenteId = ses.DocenteId
        INNER JOIN dbo.Usuario u
          ON u.UsuarioId = d.UsuarioId
        WHERE ses.AsistenciaSesionId = @id
          AND g.InstitucionId = @institucionId
      `);
        if (!sesion.recordset.length) {
            return res.status(404).json({
                ok: false,
                message: "Sesión de asistencia no encontrada"
            });
        }
        const detalles = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .query(`
        SELECT
          da.DetalleAsistenciaId,
          da.AsistenciaSesionId,
          da.EstudianteId,
          da.EstadoAsistenciaId,
          da.Observacion,
          da.FechaHoraRegistro,
          da.UpdatedAt,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          ea.EstadoAsistenciaId AS EstadoCatalogoId,
          ea.Nombre AS EstadoNombre,
          ea.Codigo AS EstadoCodigo,
          ea.PorcentajeAsistencia,
          ea.ColorHex
        FROM dbo.DetalleAsistencia da
        INNER JOIN dbo.Estudiante e
          ON e.EstudianteId = da.EstudianteId
        INNER JOIN dbo.EstadoAsistencia ea
          ON ea.EstadoAsistenciaId = da.EstadoAsistenciaId
        WHERE da.AsistenciaSesionId = @id
        ORDER BY e.Nombre, e.PrimerApellido, e.SegundoApellido
      `);
        return (0, http_1.ok)(res, {
            sesion: sesion.recordset[0],
            detalles: detalles.recordset
        });
    }
    catch (error) {
        console.error("Error al ver sesión de asistencia:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al ver sesión de asistencia"
        });
    }
});
/* =========================================================
   CREAR SESION DE ASISTENCIA
   ========================================================= */
router.post("/sesiones", async (req, res) => {
    let transaction = null;
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const userId = getUserId(req);
        const { fechaClaseId, observacionGeneral, detalles } = req.body;
        if (!isValidNonNegativeId(fechaClaseId)) {
            return (0, http_1.badRequest)(res, "fechaClaseId es obligatorio");
        }
        if (!Array.isArray(detalles) || detalles.length === 0) {
            return (0, http_1.badRequest)(res, "Debés enviar al menos un detalle de asistencia");
        }
        const pool = await (0, database_1.getPool)();
        const context = await getFechaClaseContext(pool, institucionId, Number(fechaClaseId));
        if (!context) {
            return res.status(404).json({
                ok: false,
                message: "Clase no encontrada"
            });
        }
        if (context.AsistenciaSesionId !== null && context.AsistenciaSesionId !== undefined) {
            return res.status(409).json({
                ok: false,
                code: "ASISTENCIA_YA_EXISTE",
                message: "Ya existe una sesión de asistencia para esta clase"
            });
        }
        const docenteId = Number(context.DocenteId ?? -1);
        const docenteUsuarioId = Number(context.DocenteUsuarioId ?? -1);
        if (docenteId < 0) {
            return (0, http_1.badRequest)(res, "La clase no tiene un docente válido registrado en la tabla Docente");
        }
        if (!isAdminUser(req) && docenteUsuarioId !== userId) {
            return res.status(403).json({
                ok: false,
                message: "No tenés permiso para registrar asistencia de una clase que no te corresponde"
            });
        }
        const matriculados = await getMatriculadosActivosByClase(pool, context.GrupoId, context.AnioLectivoId);
        const validStudentIds = new Set(matriculados.map((x) => Number(x.EstudianteId)));
        for (const item of detalles) {
            if (!validStudentIds.has(Number(item.estudianteId))) {
                return (0, http_1.badRequest)(res, `El estudiante ${item.estudianteId} no pertenece al grupo activo de esta clase`);
            }
            if (!isValidNonNegativeId(item.estadoAsistenciaId)) {
                return (0, http_1.badRequest)(res, `El estudiante ${item.estudianteId} no tiene estado de asistencia`);
            }
        }
        transaction = new database_1.sql.Transaction(pool);
        await transaction.begin();
        const sesionRequest = new database_1.sql.Request(transaction);
        const sesionInsert = await sesionRequest
            .input("fechaClaseId", database_1.sql.Int, Number(fechaClaseId))
            .input("docenteId", database_1.sql.Int, docenteId)
            .input("observacionGeneral", database_1.sql.NVarChar, observacionGeneral || null)
            .query(`
        INSERT INTO dbo.AsistenciaSesion
        (
          FechaClaseId,
          DocenteId,
          FechaRegistro,
          ObservacionGeneral
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @fechaClaseId,
          @docenteId,
          SYSDATETIME(),
          @observacionGeneral
        )
      `);
        const sesion = sesionInsert.recordset[0];
        for (const item of detalles) {
            const detailRequest = new database_1.sql.Request(transaction);
            await detailRequest
                .input("asistenciaSesionId", database_1.sql.Int, sesion.AsistenciaSesionId)
                .input("estudianteId", database_1.sql.Int, Number(item.estudianteId))
                .input("estadoAsistenciaId", database_1.sql.Int, Number(item.estadoAsistenciaId))
                .input("observacion", database_1.sql.NVarChar, item.observacion || null)
                .query(`
          INSERT INTO dbo.DetalleAsistencia
          (
            AsistenciaSesionId,
            EstudianteId,
            EstadoAsistenciaId,
            Observacion,
            FechaHoraRegistro
          )
          VALUES
          (
            @asistenciaSesionId,
            @estudianteId,
            @estadoAsistenciaId,
            @observacion,
            SYSDATETIME()
          )
        `);
        }
        await transaction.commit();
        return (0, http_1.created)(res, {
            AsistenciaSesionId: sesion.AsistenciaSesionId,
            FechaClaseId: Number(fechaClaseId)
        }, "Asistencia guardada correctamente");
    }
    catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            }
            catch { }
        }
        console.error("Error al crear sesión de asistencia:", error);
        if (error?.number === 2627 || error?.number === 2601) {
            return res.status(409).json({
                ok: false,
                code: "ASISTENCIA_DUPLICADA",
                message: "La asistencia ya fue registrada para esta clase"
            });
        }
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al guardar asistencia"
        });
    }
});
/* =========================================================
   ACTUALIZAR SESION DE ASISTENCIA
   ========================================================= */
router.put("/sesiones/:id", async (req, res) => {
    let transaction = null;
    try {
        const institucionId = getInstitutionId(req, res);
        if (institucionId === null)
            return;
        const userId = getUserId(req);
        const id = Number(req.params.id);
        const { observacionGeneral, detalles } = req.body;
        if (!isValidNonNegativeId(id)) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!Array.isArray(detalles) || detalles.length === 0) {
            return (0, http_1.badRequest)(res, "Debés enviar al menos un detalle de asistencia");
        }
        const pool = await (0, database_1.getPool)();
        const sesionActual = await pool
            .request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, institucionId)
            .query(`
        SELECT TOP 1
          ses.AsistenciaSesionId,
          ses.FechaClaseId,
          ses.DocenteId,
          d.UsuarioId AS DocenteUsuarioId,
          gm.GrupoId,
          p.AnioLectivoId
        FROM dbo.AsistenciaSesion ses
        INNER JOIN dbo.Docente d
          ON d.DocenteId = ses.DocenteId
        INNER JOIN dbo.FechaClase fc
          ON fc.FechaClaseId = ses.FechaClaseId
        INNER JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = fc.HorarioGrupoId
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        INNER JOIN dbo.Grupo g
          ON g.GrupoId = gm.GrupoId
        INNER JOIN dbo.Periodo p
          ON p.PeriodoId = fc.PeriodoId
        WHERE ses.AsistenciaSesionId = @id
          AND g.InstitucionId = @institucionId
      `);
        if (!sesionActual.recordset.length) {
            return res.status(404).json({
                ok: false,
                message: "Sesión de asistencia no encontrada"
            });
        }
        const sesion = sesionActual.recordset[0];
        if (!isAdminUser(req) && Number(sesion.DocenteUsuarioId) !== userId) {
            return res.status(403).json({
                ok: false,
                message: "No tenés permiso para modificar esta asistencia"
            });
        }
        const matriculados = await getMatriculadosActivosByClase(pool, sesion.GrupoId, sesion.AnioLectivoId);
        const validStudentIds = new Set(matriculados.map((x) => Number(x.EstudianteId)));
        for (const item of detalles) {
            if (!validStudentIds.has(Number(item.estudianteId))) {
                return (0, http_1.badRequest)(res, `El estudiante ${item.estudianteId} no pertenece al grupo activo de esta clase`);
            }
            if (!isValidNonNegativeId(item.estadoAsistenciaId)) {
                return (0, http_1.badRequest)(res, `El estudiante ${item.estudianteId} no tiene estado de asistencia`);
            }
        }
        transaction = new database_1.sql.Transaction(pool);
        await transaction.begin();
        const sesionRequest = new database_1.sql.Request(transaction);
        await sesionRequest
            .input("id", database_1.sql.Int, id)
            .input("observacionGeneral", database_1.sql.NVarChar, observacionGeneral || null)
            .query(`
        UPDATE dbo.AsistenciaSesion
        SET
          ObservacionGeneral = @observacionGeneral,
          UpdatedAt = SYSDATETIME()
        WHERE AsistenciaSesionId = @id
      `);
        const deleteRequest = new database_1.sql.Request(transaction);
        await deleteRequest
            .input("id", database_1.sql.Int, id)
            .query(`
        DELETE FROM dbo.DetalleAsistencia
        WHERE AsistenciaSesionId = @id
      `);
        for (const item of detalles) {
            const detailRequest = new database_1.sql.Request(transaction);
            await detailRequest
                .input("asistenciaSesionId", database_1.sql.Int, id)
                .input("estudianteId", database_1.sql.Int, Number(item.estudianteId))
                .input("estadoAsistenciaId", database_1.sql.Int, Number(item.estadoAsistenciaId))
                .input("observacion", database_1.sql.NVarChar, item.observacion || null)
                .query(`
          INSERT INTO dbo.DetalleAsistencia
          (
            AsistenciaSesionId,
            EstudianteId,
            EstadoAsistenciaId,
            Observacion,
            FechaHoraRegistro,
            UpdatedAt
          )
          VALUES
          (
            @asistenciaSesionId,
            @estudianteId,
            @estadoAsistenciaId,
            @observacion,
            SYSDATETIME(),
            SYSDATETIME()
          )
        `);
        }
        await transaction.commit();
        return (0, http_1.ok)(res, { AsistenciaSesionId: id }, "Asistencia actualizada correctamente");
    }
    catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            }
            catch { }
        }
        console.error("Error al actualizar sesión de asistencia:", error);
        return res.status(500).json({
            ok: false,
            message: error?.originalError?.info?.message ||
                error?.message ||
                "Error interno al actualizar asistencia"
        });
    }
});
exports.default = router;
