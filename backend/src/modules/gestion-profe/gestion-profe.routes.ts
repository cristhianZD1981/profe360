import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, forbidden, ok } from "../../utils/http";
import * as XLSX from "xlsx";
import { sendEmail } from "../../services/email.service";

const router = Router();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

type AuthUser = {
  userId?: number;
  usuarioId?: number;
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

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function normalizeKey(value: any) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeLike(value: any) {
  const text = normalizeText(value);
  return `%${text}%`;
}

function assertCanAccessProfessorModule(req: any, res: any) {
  if (isSuperAdmin(req) || isInstitutionAdmin(req) || isProfesor(req)) return true;
  forbidden(res, "No tenés permisos para acceder a Gestión del Profe");
  return false;
}

async function getCorreoNotificacionConfig(pool: any, institucionId: number, tipoUso: string) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), String(tipoUso || "").toUpperCase())
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

function leccionOrdinalLabel(numero: number) {
  const n = Number(numero || 0);
  const ord: Record<number, string> = {
    1: "Primera",
    2: "Segunda",
    3: "Tercera",
    4: "Cuarta",
    5: "Quinta",
    6: "Sexta",
    7: "Setima",
    8: "Octava",
    9: "Novena",
    10: "Decima",
    11: "Undecima",
    12: "Duodecima"
  };
  if (!Number.isFinite(n) || n <= 0) return "Leccion";
  return ord[n] ? `${ord[n]} (Leccion ${n})` : `Leccion ${n}`;
}

const MAIL_FROM_NOTIFICACIONES = "info@profe360cr.com";

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
    END
  `);
}

async function resolverMensajeSeguimiento(pool: any, institucionId: number, tipoUso: "ASISTENCIA" | "COTIDIANO" | "TAREA" | "EXAMEN", valorNivel?: number | null) {
  await ensureMensajesSeguimientoTable(pool);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("tipoUso", sql.NVarChar(30), tipoUso)
    .input("valorNivel", sql.Int, valorNivel ?? null)
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

router.get("/mis-grupos", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const auth = getAuth(req);
    const userId = getUserId(req);
    const q = normalizeLike(req.query.q);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const materiaId = toOptionalNumber(req.query.materiaId);
    const grupoId = toOptionalNumber(req.query.grupoId);

    const request = pool.request()
      .input("q", sql.NVarChar(250), q)
      .input("usuarioId", sql.Int, userId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("grupoId", sql.Int, grupoId);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const result = await request.query(`
      SELECT
        ad.AsignacionDocenteId,
        ad.UsuarioId,
        ad.InstitucionId,
        ad.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.Jornada AS GrupoJornada,
        g.NivelAcademico AS GrupoNivelAcademico,
        g.Especialidad AS GrupoEspecialidad,
        ad.MateriaId,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo,
        ad.AnioLectivoId,
        al.Nombre AS AnioNombre,
        ad.PeriodoId,
        p.Nombre AS PeriodoNombre,
        ad.TipoAsignacion,
        ad.Activo,
        u.Nombre AS ProfesorNombre,
        u.PrimerApellido AS ProfesorPrimerApellido,
        u.SegundoApellido AS ProfesorSegundoApellido,
        COUNT(DISTINCT ma.MatriculaId) AS TotalEstudiantes,
        ep.EvaluacionPlantillaId,
        ep.Nombre AS EvaluacionPlantillaNombre,
        ep.Estado AS EvaluacionPlantillaEstado
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
      LEFT JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
      INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
      LEFT JOIN dbo.Matricula ma
        ON ma.GrupoId = ad.GrupoId
       AND ma.AnioLectivoId = ad.AnioLectivoId
       AND ma.Estado <> N'Inactiva'
      OUTER APPLY (
        SELECT TOP 1
          ep2.EvaluacionPlantillaId,
          ep2.Nombre,
          ep2.Estado
        FROM dbo.EvaluacionPlantilla ep2
        WHERE ep2.InstitucionId = ad.InstitucionId
          AND ep2.AnioLectivoId = ad.AnioLectivoId
          AND ep2.PeriodoId = ad.PeriodoId
          AND ep2.MateriaId = ad.MateriaId
          AND ep2.Activo = 1
        ORDER BY CASE WHEN ep2.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep2.EvaluacionPlantillaId DESC
      ) ep
      WHERE ad.Activo = 1
        AND ad.MateriaId IS NOT NULL
        AND (@anioLectivoId IS NULL OR ad.AnioLectivoId = @anioLectivoId)
        AND (@periodoId IS NULL OR ad.PeriodoId = @periodoId)
        AND (@materiaId IS NULL OR ad.MateriaId = @materiaId)
        AND (@grupoId IS NULL OR ad.GrupoId = @grupoId)
        AND (
          @q = N'%%'
          OR g.Nombre LIKE @q
          OR ISNULL(g.Nivel, N'') LIKE @q
          OR ISNULL(m.Nombre, N'') LIKE @q
          OR ISNULL(m.Codigo, N'') LIKE @q
          OR ISNULL(p.Nombre, N'') LIKE @q
          OR ISNULL(al.Nombre, N'') LIKE @q
        )
        ${filtroInstitucion}
        ${filtroProfesor}
      GROUP BY
        ad.AsignacionDocenteId,
        ad.UsuarioId,
        ad.InstitucionId,
        ad.GrupoId,
        g.Nombre,
        g.Nivel,
        g.Jornada,
        g.NivelAcademico,
        g.Especialidad,
        ad.MateriaId,
        m.Nombre,
        m.Codigo,
        ad.AnioLectivoId,
        al.Nombre,
        ad.PeriodoId,
        p.Nombre,
        ad.TipoAsignacion,
        ad.Activo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        ep.EvaluacionPlantillaId,
        ep.Nombre,
        ep.Estado
      ORDER BY al.Nombre DESC, MAX(p.NumeroOrden), g.Nombre, m.Nombre
    `);

    const gruposUnicos = new Map<string, any>();

    for (const item of result.recordset || []) {
      const key = [
        item.GrupoId,
        item.MateriaId,
        item.AnioLectivoId,
        item.PeriodoId
      ].map((value) => String(value ?? "")).join("|");

      if (!gruposUnicos.has(key)) {
        gruposUnicos.set(key, item);
      }
    }

    return ok(res, Array.from(gruposUnicos.values()));
  } catch (error) {
    console.error("Error cargando mis grupos:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los grupos del profesor" });
  }
});


router.get("/mi-horario", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const userId = getUserId(req);
    let anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    let periodoId = toOptionalNumber(req.query.periodoId);

    let institucionId: number | null = null;
    if (!isSuperAdmin(req)) {
      institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
    } else {
      institucionId = toOptionalNumber(req.query.institucionId);
    }

    if (!institucionId) {
      return badRequest(res, "Debés indicar la institución para consultar el horario");
    }

    if (!anioLectivoId || !periodoId) {
      const asignacionBaseRequest = pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("usuarioId", sql.Int, userId);

      const filtroProfesorBase = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
        ? "AND ad.UsuarioId = @usuarioId"
        : "";

      const asignacionBase = await asignacionBaseRequest.query(`
        SELECT TOP 1
          ad.AnioLectivoId,
          ad.PeriodoId
        FROM dbo.AsignacionDocente ad
        LEFT JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
        LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
        WHERE ad.InstitucionId = @institucionId
          AND ad.Activo = 1
          AND ad.MateriaId IS NOT NULL
          ${filtroProfesorBase}
        ORDER BY
          ISNULL(al.Activo, 0) DESC,
          ad.AnioLectivoId DESC,
          ISNULL(p.NumeroOrden, 0) DESC,
          ad.PeriodoId DESC
      `);

      anioLectivoId = anioLectivoId || toOptionalNumber(asignacionBase.recordset[0]?.AnioLectivoId);
      periodoId = periodoId || toOptionalNumber(asignacionBase.recordset[0]?.PeriodoId);
    }

    if (!anioLectivoId || !periodoId) {
      return ok(res, { bloques: [], entradas: [] });
    }

    const bloques = await pool.request()
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
        ORDER BY bh.OrdenVisual, bh.HoraInicio
      `);

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, userId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId);

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const entradas = await request.query(`
      SELECT DISTINCT
        hg.HorarioGrupoId,
        hg.BloqueHorarioId,
        hg.DiaSemana,
        gm.GrupoId,
        g.Nombre AS GrupoNombre,
        gm.MateriaId,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
      INNER JOIN dbo.AsignacionDocente ad
        ON ad.GrupoId = gm.GrupoId
       AND ad.MateriaId = gm.MateriaId
       AND ad.Activo = 1
       AND ad.InstitucionId = @institucionId
       AND ad.AnioLectivoId = @anioLectivoId
       AND ad.PeriodoId = @periodoId
       ${filtroProfesor}
      WHERE hg.Activo = 1
      ORDER BY hg.DiaSemana, hg.BloqueHorarioId, g.Nombre, m.Nombre
    `);

    return ok(res, {
      bloques: bloques.recordset || [],
      entradas: entradas.recordset || []
    });
  } catch (error) {
    console.error("Error cargando mi horario:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el horario del profesor" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const userId = getUserId(req);
    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    const accessRequest = pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("usuarioId", sql.Int, userId);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      accessRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const access = await accessRequest.query(`
      SELECT TOP 1
        ad.AsignacionDocenteId,
        ad.InstitucionId,
        ad.GrupoId,
        ad.MateriaId,
        ad.AnioLectivoId,
        ad.PeriodoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo,
        al.Nombre AS AnioNombre,
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

    const asignacion = access.recordset[0];
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar este grupo y materia");

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          e.Correo,
          e.Telefono,
          ma.MatriculaId,
          ma.Estado AS EstadoMatricula
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.GrupoId = @grupoId
          AND ma.AnioLectivoId = @anioLectivoId
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    const plantillaResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .query(`
        SELECT TOP 1
          ep.EvaluacionPlantillaId,
          ep.Nombre,
          ep.DecimalesNota,
          ep.Estado,
          ep.PermitirProfesorEditar
        FROM dbo.EvaluacionPlantilla ep
        WHERE ep.InstitucionId = @institucionId
          AND ep.AnioLectivoId = @anioLectivoId
          AND ep.PeriodoId = @periodoId
          AND ep.MateriaId = @materiaId
          AND ep.Activo = 1
        ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
      `);

    const plantilla = plantillaResult.recordset[0] || null;
    let componentes: any[] = [];
    let actividades: any[] = [];
    let notas: any[] = [];

    if (plantilla) {
      const componentesResult = await pool.request()
        .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
        .query(`
          SELECT
            EvaluacionComponenteId,
            EvaluacionPlantillaId,
            Descripcion,
            Porcentaje,
            Orden,
            Activo
          FROM dbo.EvaluacionComponente
          WHERE EvaluacionPlantillaId = @plantillaId
            AND Activo = 1
          ORDER BY Orden, EvaluacionComponenteId
        `);

      const actividadesResult = await pool.request()
        .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
        .query(`
          SELECT
            ea.EvaluacionActividadId,
            ea.EvaluacionComponenteId,
            ea.Descripcion,
            ea.Porcentaje,
            ea.Fecha,
            ea.Orden,
            ea.Activo,
            ec.Porcentaje AS ComponentePorcentaje,
            CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,2)) AS PorcentajeReal
          FROM dbo.EvaluacionActividad ea
          INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
          WHERE ec.EvaluacionPlantillaId = @plantillaId
            AND ec.Activo = 1
            AND ea.Activo = 1
          ORDER BY ec.Orden, ea.Orden, ea.EvaluacionActividadId
        `);

      const notasResult = await pool.request()
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("periodoId", sql.Int, periodoId)
        .query(`
          SELECT
            EvaluacionNotaId,
            EvaluacionActividadId,
            EstudianteId,
            GrupoId,
            MateriaId,
            PeriodoId,
            Nota,
            PorcentajeGanado,
            Observacion
          FROM dbo.EvaluacionNota
          WHERE GrupoId = @grupoId
            AND MateriaId = @materiaId
            AND PeriodoId = @periodoId
        `);

      componentes = componentesResult.recordset;
      actividades = actividadesResult.recordset;
      notas = notasResult.recordset;
    }

    return ok(res, {
      asignacion,
      estudiantes: estudiantesResult.recordset,
      plantilla,
      componentes,
      actividades,
      notas
    });
  } catch (error) {
    console.error("Error cargando detalle del grupo del profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el detalle del grupo" });
  }
});


router.post("/mis-grupos/:grupoId/materias/:materiaId/notas", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const pool = await getPool();
    const userId = getUserId(req);
    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId ?? req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId ?? req.query.periodoId);
    const notas = Array.isArray(req.body.notas) ? req.body.notas : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    if (notas.length === 0) {
      return badRequest(res, "No se recibieron notas para guardar");
    }

    const accessRequest = pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("usuarioId", sql.Int, userId);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      accessRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND ad.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND ad.UsuarioId = @usuarioId"
      : "";

    const access = await accessRequest.query(`
      SELECT TOP 1
        ad.AsignacionDocenteId,
        ad.InstitucionId,
        ad.GrupoId,
        ad.MateriaId,
        ad.AnioLectivoId,
        ad.PeriodoId
      FROM dbo.AsignacionDocente ad
      WHERE ad.Activo = 1
        AND ad.GrupoId = @grupoId
        AND ad.MateriaId = @materiaId
        AND ad.AnioLectivoId = @anioLectivoId
        AND ad.PeriodoId = @periodoId
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    const asignacion = access.recordset[0];
    if (!asignacion) return forbidden(res, "No tenés permisos para registrar notas en este grupo y materia");

    const plantillaResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .query(`
        SELECT TOP 1
          ep.EvaluacionPlantillaId,
          ep.DecimalesNota,
          ep.Estado
        FROM dbo.EvaluacionPlantilla ep
        WHERE ep.InstitucionId = @institucionId
          AND ep.AnioLectivoId = @anioLectivoId
          AND ep.PeriodoId = @periodoId
          AND ep.MateriaId = @materiaId
          AND ep.Activo = 1
        ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
      `);

    const plantilla = plantillaResult.recordset[0];
    if (!plantilla) {
      return badRequest(res, "No existe una plantilla de evaluación activa o disponible para este grupo y materia");
    }

    const actividadesResult = await pool.request()
      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .query(`
        SELECT
          ea.EvaluacionActividadId,
          CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,4)) AS PorcentajeReal
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ec.EvaluacionPlantillaId = @plantillaId
          AND ec.Activo = 1
          AND ea.Activo = 1
      `);

    const actividadesPermitidas = new Map<number, number>();
    for (const actividad of actividadesResult.recordset) {
      actividadesPermitidas.set(Number(actividad.EvaluacionActividadId), Number(actividad.PorcentajeReal || 0));
    }

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT DISTINCT e.EstudianteId
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.GrupoId = @grupoId
          AND ma.AnioLectivoId = @anioLectivoId
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
      `);

    const estudiantesPermitidos = new Set<number>(estudiantesResult.recordset.map((item: any) => Number(item.EstudianteId)));

    const notasNormalizadas = notas.map((item: any) => ({
      estudianteId: Number(item.estudianteId),
      evaluacionActividadId: Number(item.evaluacionActividadId),
      nota: item.nota === null || item.nota === undefined || String(item.nota).trim() === "" ? null : Number(item.nota),
      observacion: normalizeText(item.observacion).slice(0, 500)
    }));

    for (const item of notasNormalizadas) {
      if (!Number.isFinite(item.estudianteId) || !estudiantesPermitidos.has(item.estudianteId)) {
        return badRequest(res, "Se recibió un estudiante que no pertenece al grupo seleccionado");
      }

      if (!Number.isFinite(item.evaluacionActividadId) || !actividadesPermitidas.has(item.evaluacionActividadId)) {
        return badRequest(res, "Se recibió una actividad evaluativa inválida para la plantilla seleccionada");
      }

      if (item.nota !== null && (!Number.isFinite(item.nota) || item.nota < 0 || item.nota > 100)) {
        return badRequest(res, "Las notas deben estar entre 0 y 100");
      }
    }

    await transaction.begin();

    let guardadas = 0;
    let eliminadas = 0;

    for (const item of notasNormalizadas) {
      const porcentajeReal = actividadesPermitidas.get(item.evaluacionActividadId) || 0;

      if (item.nota === null) {
        const deleteRequest = new sql.Request(transaction);
        await deleteRequest
          .input("evaluacionActividadId", sql.Int, item.evaluacionActividadId)
          .input("estudianteId", sql.Int, item.estudianteId)
          .input("grupoId", sql.Int, grupoId)
          .input("materiaId", sql.Int, materiaId)
          .input("periodoId", sql.Int, periodoId)
          .query(`
            DELETE FROM dbo.EvaluacionNota
            WHERE EvaluacionActividadId = @evaluacionActividadId
              AND EstudianteId = @estudianteId
              AND GrupoId = @grupoId
              AND MateriaId = @materiaId
              AND PeriodoId = @periodoId
          `);
        eliminadas += 1;
        continue;
      }

      const porcentajeGanado = Number(((item.nota * porcentajeReal) / 100).toFixed(4));
      const saveRequest = new sql.Request(transaction);
      await saveRequest
        .input("evaluacionActividadId", sql.Int, item.evaluacionActividadId)
        .input("estudianteId", sql.Int, item.estudianteId)
        .input("horarioGrupoId", sql.Int, item.horarioGrupoId)
        .input("bloqueHorarioId", sql.Int, item.bloqueHorarioId)
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("periodoId", sql.Int, periodoId)
        .input("nota", sql.Decimal(10, 2), item.nota)
        .input("porcentajeGanado", sql.Decimal(10, 4), porcentajeGanado)
        .input("observacion", sql.NVarChar(500), item.observacion || null)
        .query(`
          MERGE dbo.EvaluacionNota AS target
          USING (
            SELECT
              @evaluacionActividadId AS EvaluacionActividadId,
              @estudianteId AS EstudianteId,
              @horarioGrupoId AS HorarioGrupoId,
              @bloqueHorarioId AS BloqueHorarioId,
              @grupoId AS GrupoId,
              @materiaId AS MateriaId,
              @periodoId AS PeriodoId
          ) AS source
          ON target.EvaluacionActividadId = source.EvaluacionActividadId
             AND target.EstudianteId = source.EstudianteId
             AND target.HorarioGrupoId = source.HorarioGrupoId
             AND target.GrupoId = source.GrupoId
             AND target.MateriaId = source.MateriaId
             AND target.PeriodoId = source.PeriodoId
          WHEN MATCHED THEN
            UPDATE SET
              Nota = @nota,
              PorcentajeGanado = @porcentajeGanado,
              Observacion = @observacion,
              UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (EvaluacionActividadId, EstudianteId, GrupoId, MateriaId, PeriodoId, Nota, PorcentajeGanado, Observacion, CreatedAt)
            VALUES (@evaluacionActividadId, @estudianteId, @grupoId, @materiaId, @periodoId, @nota, @porcentajeGanado, @observacion, SYSDATETIME());
        `);

      guardadas += 1;
    }

    await transaction.commit();

    return ok(res, {
      guardadas,
      eliminadas,
      message: "Notas guardadas correctamente"
    });
  } catch (error) {
    try {
      if ((transaction as any)._aborted === false) await transaction.rollback();
    } catch {}
    console.error("Error guardando notas del profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron guardar las notas" });
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

function toHtmlWithLineBreaks(value: any) {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

function fullName(row: any) {
  return [row?.PrimerApellido || "", row?.SegundoApellido || "", row?.Nombre || ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(value: any, decimals = 2) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0.00";
  return number.toFixed(decimals);
}

function formatDateCR(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function sanitizeResultadoIAJsonForList(value: any) {
  if (!value) return value;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return value;

    if (parsed.plantillaFormatoDocx?.base64) {
      parsed.plantillaFormatoDocx = {
        nombre: parsed.plantillaFormatoDocx.nombre || parsed.plantillaFormatoNombre || "plantilla_formato.docx",
        mimeType: parsed.plantillaFormatoDocx.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        guardadaEnServidor: true
      };
    }

    return typeof value === "string" ? JSON.stringify(parsed) : parsed;
  } catch {
    return value;
  }
}

async function buildReporteFormalData(req: any, res: any, grupoId: number, materiaId: number, anioLectivoId: number, periodoId: number) {
  const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
  if (!asignacion) return null;

  const pool = await getPool();

  const contextoResult = await pool.request()
    .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("usuarioId", sql.Int, Number(asignacion.UsuarioId || getUserId(req)))
    .query(`
      SELECT TOP 1
        i.*,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.Jornada AS GrupoJornada,
        m.Nombre AS MateriaNombre,
        m.Codigo AS MateriaCodigo,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre,
        u.Nombre AS ProfesorNombre,
        u.PrimerApellido AS ProfesorPrimerApellido,
        u.SegundoApellido AS ProfesorSegundoApellido,
        u.Cargo AS ProfesorCargo
      FROM dbo.Institucion i
      INNER JOIN dbo.Grupo g ON g.InstitucionId = i.InstitucionId AND g.GrupoId = @grupoId
      INNER JOIN dbo.Materia m ON m.MateriaId = @materiaId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = @anioLectivoId
      LEFT JOIN dbo.Periodo p ON p.PeriodoId = @periodoId
      LEFT JOIN dbo.Usuario u ON u.UsuarioId = @usuarioId
      WHERE i.InstitucionId = @institucionId
    `);

  const contexto = contextoResult.recordset[0] || {};

  const estudiantesResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .query(`
      SELECT
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        ma.MatriculaId
      FROM dbo.Matricula ma
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
      WHERE ma.GrupoId = @grupoId
        AND ma.AnioLectivoId = @anioLectivoId
        AND ma.Estado <> N'Inactiva'
        AND e.Activo = 1
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
    `);

  const plantillaResult = await pool.request()
    .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("materiaId", sql.Int, materiaId)
    .query(`
      SELECT TOP 1
        ep.EvaluacionPlantillaId,
        ep.Nombre,
        ep.DecimalesNota,
        ep.Estado
      FROM dbo.EvaluacionPlantilla ep
      WHERE ep.InstitucionId = @institucionId
        AND ep.AnioLectivoId = @anioLectivoId
        AND ep.PeriodoId = @periodoId
        AND ep.MateriaId = @materiaId
        AND ep.Activo = 1
      ORDER BY CASE WHEN ep.Estado = N'ACTIVA' THEN 0 ELSE 1 END, ep.EvaluacionPlantillaId DESC
    `);

  const plantilla = plantillaResult.recordset[0] || null;
  let actividades: any[] = [];
  let notas: any[] = [];

  if (plantilla) {
    const actividadesResult = await pool.request()
      .input("plantillaId", sql.Int, Number(plantilla.EvaluacionPlantillaId))
      .query(`
        SELECT
          ea.EvaluacionActividadId,
          ea.Descripcion,
          ea.Porcentaje,
          ea.Fecha,
          ea.Orden,
          ec.Descripcion AS ComponenteDescripcion,
          ec.Porcentaje AS ComponentePorcentaje,
          CAST((ec.Porcentaje * ea.Porcentaje / 100.0) AS DECIMAL(10,2)) AS PorcentajeReal
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ec.EvaluacionPlantillaId = @plantillaId
          AND ec.Activo = 1
          AND ea.Activo = 1
        ORDER BY ec.Orden, ea.Orden, ea.EvaluacionActividadId
      `);
    actividades = actividadesResult.recordset;

    const notasResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT
          EvaluacionActividadId,
          EstudianteId,
          Nota,
          PorcentajeGanado
        FROM dbo.EvaluacionNota
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND PeriodoId = @periodoId
      `);
    notas = notasResult.recordset;
  }

  const resumenAsistencia = await buildResumenAsistencia(grupoId, materiaId, anioLectivoId, periodoId);
  const notasMap = new Map<string, any>();
  for (const nota of notas) notasMap.set(`${nota.EstudianteId}-${nota.EvaluacionActividadId}`, nota);
  const asistenciaMap = new Map<number, any>();
  for (const item of resumenAsistencia) asistenciaMap.set(Number(item.EstudianteId), item);

  const estudiantes = estudiantesResult.recordset.map((estudiante: any) => {
    const detalleNotas = actividades.map((actividad: any) => {
      const nota = notasMap.get(`${estudiante.EstudianteId}-${actividad.EvaluacionActividadId}`);
      return {
        actividadId: actividad.EvaluacionActividadId,
        nota: nota?.Nota ?? null,
        porcentajeGanado: Number(nota?.PorcentajeGanado || 0)
      };
    });
    const acumuladoEvaluacion = detalleNotas.reduce((total: number, item: any) => total + Number(item.porcentajeGanado || 0), 0);
    const asistencia = asistenciaMap.get(Number(estudiante.EstudianteId)) || {};

    return {
      ...estudiante,
      NombreCompleto: fullName(estudiante),
      detalleNotas,
      acumuladoEvaluacion: Number(acumuladoEvaluacion.toFixed(2)),
      totalLecciones: Number(asistencia.TotalLecciones || 0),
      ausenciasEquivalentes: Number(asistencia.AusenciasInjustificadasEquivalentes || 0),
      porcentajeAusencias: Number(asistencia.PorcentajeAusencias || 0),
      porcentajeAsistencia: Number(asistencia.PorcentajeAsignadoArticulo37 || 0)
    };
  });

  return {
    contexto,
    plantilla,
    actividades,
    estudiantes,
    generadoEn: new Date()
  };
}

async function getAsignacionPermitida(req: any, res: any, grupoId: number, materiaId: number, anioLectivoId: number, periodoId: number) {
  const pool = await getPool();
  const userId = getUserId(req);
  const request = pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .input("usuarioId", sql.Int, userId);

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
      ad.MateriaId,
      ad.AnioLectivoId,
      ad.PeriodoId,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      u.Nombre AS ProfesorNombre,
      u.PrimerApellido AS ProfesorPrimerApellido,
      u.SegundoApellido AS ProfesorSegundoApellido
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.Activo = 1
      AND ad.GrupoId = @grupoId
      AND ad.MateriaId = @materiaId
      AND ad.AnioLectivoId = @anioLectivoId
      AND ad.PeriodoId = @periodoId
      ${filtroInstitucion}
      ${filtroProfesor}
  `);

  return result.recordset[0] || null;
}

async function copiarPlaneamientosDesdeSeccionMismoGradoSiFaltan(pool: any, input: {
  institucionId: number;
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
  usuarioId: number;
}) {
  const existentesResult = await pool.request()
    .input("institucionId", sql.Int, input.institucionId)
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, input.usuarioId)
    .query(`
      SELECT
        PlaneamientoId,
        Nombre,
        ResultadoIAJson,
        Activo,
        UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) COLLATE Latin1_General_100_CI_AI AS NombreKey,
        CONVERT(VARCHAR(10), FechaInicio, 23) AS FechaInicioKey,
        CONVERT(VARCHAR(10), FechaFin, 23) AS FechaFinKey
      FROM dbo.Planeamiento
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND UsuarioId = @usuarioId
    `);

  const planeamientosDestinoPorKey = new Map<string, number>(
    (existentesResult.recordset || []).map((item: any) => [[
      String(item.NombreKey || ""),
      String(item.FechaInicioKey || ""),
      String(item.FechaFinKey || "")
    ].join("|"), Number(item.PlaneamientoId)])
  );
  const planeamientosDestino = existentesResult.recordset || [];

  const origenResult = await pool.request()
    .input("institucionId", sql.Int, input.institucionId)
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, input.usuarioId)
    .query(`
      WITH destino AS (
        SELECT TOP 1
          GrupoId,
          Nombre,
          Nivel,
          NivelAcademico,
          LEFT(REPLACE(Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(Nombre, N' ', N'') + N'-') - 1) AS GradoNombre
        FROM dbo.Grupo
        WHERE GrupoId = @grupoId
      ),
      grupos_origen AS (
        SELECT
          g.GrupoId,
          COUNT(DISTINCT p.PlaneamientoId) AS TotalPlaneamientos,
          COUNT(DISTINCT i.IndicadorGrupoId) AS TotalIndicadoresIa,
          MAX(p.CreatedAt) AS UltimoPlaneamiento
        FROM dbo.AsignacionDocente ad
        INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
        CROSS JOIN destino d
        INNER JOIN dbo.Planeamiento p
          ON p.InstitucionId = ad.InstitucionId
         AND p.AnioLectivoId = ad.AnioLectivoId
         AND p.PeriodoId = ad.PeriodoId
         AND p.MateriaId = ad.MateriaId
         AND p.UsuarioId = ad.UsuarioId
         AND p.GrupoId = ad.GrupoId
         AND p.Activo = 1
        LEFT JOIN dbo.Eval360_EstructuraGrupo eg
          ON eg.InstitucionId = ad.InstitucionId
         AND eg.GrupoId = ad.GrupoId
         AND eg.MateriaId = ad.MateriaId
         AND eg.AnioLectivoId = ad.AnioLectivoId
         AND eg.PeriodoId = ad.PeriodoId
         AND eg.Activo = 1
        LEFT JOIN dbo.Eval360_IndicadorGrupo i
          ON i.EstructuraGrupoId = eg.EstructuraGrupoId
         AND i.PlaneamientoId = p.PlaneamientoId
         AND i.Activo = 1
        WHERE ad.Activo = 1
          AND ad.InstitucionId = @institucionId
          AND ad.AnioLectivoId = @anioLectivoId
          AND ad.PeriodoId = @periodoId
          AND ad.MateriaId = @materiaId
          AND ad.UsuarioId = @usuarioId
          AND ad.GrupoId <> @grupoId
          AND (
            (g.NivelAcademico IS NOT NULL AND d.NivelAcademico IS NOT NULL AND g.NivelAcademico = d.NivelAcademico)
            OR UPPER(LTRIM(RTRIM(ISNULL(g.Nivel, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(d.Nivel, N''))))
            OR LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) = d.GradoNombre
          )
        GROUP BY g.GrupoId
      )
      SELECT TOP 1 GrupoId
      FROM grupos_origen
      ORDER BY TotalIndicadoresIa DESC, TotalPlaneamientos DESC, UltimoPlaneamiento DESC, GrupoId DESC
    `);

  const grupoOrigenId = Number(origenResult.recordset[0]?.GrupoId || 0);
  if (!grupoOrigenId) return { copiado: false, grupoOrigenId: null, totalPlaneamientosCopiados: 0 };

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const planeamientosOrigen = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoOrigenId", sql.Int, grupoOrigenId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .input("usuarioId", sql.Int, input.usuarioId)
      .query(`
        SELECT *
        FROM dbo.Planeamiento
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoOrigenId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND UsuarioId = @usuarioId
          AND Activo = 1
        ORDER BY FechaInicio, PlaneamientoId
      `);

    const planeamientoMap = new Map<number, number>();
    let totalPlaneamientosCopiados = 0;
    for (const planeamiento of planeamientosOrigen.recordset || []) {
      const planeamientoKey = [
        String(planeamiento.Nombre || "").trim().toUpperCase(),
        planeamiento.FechaInicio ? new Date(planeamiento.FechaInicio).toISOString().slice(0, 10) : "",
        planeamiento.FechaFin ? new Date(planeamiento.FechaFin).toISOString().slice(0, 10) : ""
      ].join("|");

      const planeamientoDestinoExistenteId = planeamientosDestinoPorKey.get(planeamientoKey)
        || Number(planeamientosDestino.find((item: any) =>
          normalizeKey(item.Nombre) === normalizeKey(planeamiento.Nombre)
          || (!!item.ResultadoIAJson && !!planeamiento.ResultadoIAJson && String(item.ResultadoIAJson) === String(planeamiento.ResultadoIAJson))
        )?.PlaneamientoId || 0);
      if (planeamientoDestinoExistenteId) {
        planeamientoMap.set(Number(planeamiento.PlaneamientoId), planeamientoDestinoExistenteId);
        continue;
      }

      const insert = await new sql.Request(transaction)
        .input("institucionId", sql.Int, input.institucionId)
        .input("anioLectivoId", sql.Int, input.anioLectivoId)
        .input("periodoId", sql.Int, input.periodoId)
        .input("grupoId", sql.Int, input.grupoId)
        .input("materiaId", sql.Int, input.materiaId)
        .input("usuarioId", sql.Int, input.usuarioId)
        .input("nombre", sql.NVarChar(200), planeamiento.Nombre)
        .input("fechaInicio", sql.Date, planeamiento.FechaInicio || null)
        .input("fechaFin", sql.Date, planeamiento.FechaFin || null)
        .input("observaciones", sql.NVarChar(sql.MAX), planeamiento.Observaciones || null)
        .input("resultadoIAJson", sql.NVarChar(sql.MAX), planeamiento.ResultadoIAJson || null)
        .query(`
          INSERT INTO dbo.Planeamiento
            (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, ResultadoIAJson, Activo, CreatedAt)
          OUTPUT INSERTED.PlaneamientoId
          VALUES
            (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, @resultadoIAJson, 1, SYSDATETIME())
        `);
      const nuevoPlaneamientoId = Number(insert.recordset[0]?.PlaneamientoId || 0);
      planeamientoMap.set(Number(planeamiento.PlaneamientoId), nuevoPlaneamientoId);
      totalPlaneamientosCopiados += 1;

      const indicadores = await new sql.Request(transaction)
        .input("planeamientoOrigenId", sql.Int, Number(planeamiento.PlaneamientoId))
        .query(`
          SELECT Descripcion, NivelDesempenoId, Activo
          FROM dbo.PlaneamientoIndicador
          WHERE PlaneamientoId = @planeamientoOrigenId
            AND Activo = 1
          ORDER BY PlaneamientoIndicadorId
        `);

      for (const indicador of indicadores.recordset || []) {
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("descripcion", sql.NVarChar(sql.MAX), indicador.Descripcion)
          .input("nivelDesempenoId", sql.Int, indicador.NivelDesempenoId || null)
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            VALUES
              (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
          `);
      }
    }

    const estructuraDestino = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoId", sql.Int, input.grupoId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .query(`
        SELECT TOP 1 EstructuraGrupoId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    let estructuraDestinoId = Number(estructuraDestino.recordset[0]?.EstructuraGrupoId || 0);
    const estructuraOrigen = await new sql.Request(transaction)
      .input("institucionId", sql.Int, input.institucionId)
      .input("grupoOrigenId", sql.Int, grupoOrigenId)
      .input("materiaId", sql.Int, input.materiaId)
      .input("anioLectivoId", sql.Int, input.anioLectivoId)
      .input("periodoId", sql.Int, input.periodoId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoOrigenId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY EstructuraGrupoId DESC
      `);

    const estructuraOrigenRow = estructuraOrigen.recordset[0];
    const detalleMap = new Map<number, number>();
    const actividadMap = new Map<number, number>();
    const indicadorGrupoMap = new Map<number, number>();

    if (estructuraOrigenRow && estructuraDestinoId) {
      const detallesOrigen = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_EstructuraGrupoDetalle WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, EstructuraGrupoDetalleId`);
      for (const detalle of detallesOrigen.recordset || []) {
        const detalleDestino = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("nombre", sql.NVarChar(150), detalle.Nombre || "")
          .query(`
            SELECT TOP 1 EstructuraGrupoDetalleId
            FROM dbo.Eval360_EstructuraGrupoDetalle
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND Activo = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
          `);
        if (detalleDestino.recordset[0]) {
          detalleMap.set(Number(detalle.EstructuraGrupoDetalleId), Number(detalleDestino.recordset[0].EstructuraGrupoDetalleId));
        }
      }

      const actividadesOrigen = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_Actividad WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY ActividadId`);
      for (const actividad of actividadesOrigen.recordset || []) {
        const nuevoDetalleId = detalleMap.get(Number(actividad.EstructuraGrupoDetalleId));
        if (!nuevoDetalleId) continue;
        const actividadDestino = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("estructuraGrupoDetalleId", sql.Int, nuevoDetalleId)
          .input("nombre", sql.NVarChar(200), actividad.Nombre || "")
          .query(`
            SELECT TOP 1 ActividadId
            FROM dbo.Eval360_Actividad
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
              AND Activo = 1
              AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
          `);
        if (actividadDestino.recordset[0]) {
          actividadMap.set(Number(actividad.ActividadId), Number(actividadDestino.recordset[0].ActividadId));
        }
      }
    } else if (estructuraOrigenRow && !estructuraDestinoId) {
      const nuevaEstructura = await new sql.Request(transaction)
        .input("institucionId", sql.Int, input.institucionId)
        .input("grupoId", sql.Int, input.grupoId)
        .input("materiaId", sql.Int, input.materiaId)
        .input("anioLectivoId", sql.Int, input.anioLectivoId)
        .input("periodoId", sql.Int, input.periodoId)
        .input("usuarioId", sql.Int, input.usuarioId)
        .input("plantillaBaseId", sql.Int, estructuraOrigenRow.PlantillaBaseId || null)
        .input("nombre", sql.NVarChar(200), estructuraOrigenRow.Nombre || "Estructura de evaluación")
        .input("totalPorcentaje", sql.Decimal(5, 2), Number(estructuraOrigenRow.TotalPorcentaje || 100))
        .query(`
          INSERT INTO dbo.Eval360_EstructuraGrupo
            (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
          OUTPUT INSERTED.EstructuraGrupoId
          VALUES
            (@institucionId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, @totalPorcentaje, 1, SYSDATETIME())
        `);
      estructuraDestinoId = Number(nuevaEstructura.recordset[0]?.EstructuraGrupoId || 0);

      const detalles = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_EstructuraGrupoDetalle WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, EstructuraGrupoDetalleId`);
      for (const detalle of detalles.recordset || []) {
        const nuevoDetalle = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("componenteCatalogoId", sql.Int, detalle.ComponenteCatalogoId || null)
          .input("nombre", sql.NVarChar(150), detalle.Nombre)
          .input("porcentaje", sql.Decimal(5, 2), Number(detalle.Porcentaje || 0))
          .input("orden", sql.Int, Number(detalle.Orden || 1))
          .query(`
            INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
              (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
            OUTPUT INSERTED.EstructuraGrupoDetalleId
            VALUES
              (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())
          `);
        detalleMap.set(Number(detalle.EstructuraGrupoDetalleId), Number(nuevoDetalle.recordset[0]?.EstructuraGrupoDetalleId || 0));
      }

      const niveles = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_NivelDesempenoGrupo WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY Orden, NivelDesempenoGrupoId`);
      for (const nivel of niveles.recordset || []) {
        await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
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

      const actividades = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_Actividad WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY ActividadId`);
      for (const actividad of actividades.recordset || []) {
        const nuevoDetalleId = detalleMap.get(Number(actividad.EstructuraGrupoDetalleId));
        if (!nuevoDetalleId) continue;
        const nuevaActividad = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("estructuraGrupoDetalleId", sql.Int, nuevoDetalleId)
          .input("nombre", sql.NVarChar(200), actividad.Nombre)
          .input("descripcion", sql.NVarChar(sql.MAX), actividad.Descripcion || null)
          .input("fecha", sql.Date, actividad.Fecha || null)
          .input("puntosMaximos", sql.Decimal(10, 2), Number(actividad.PuntosMaximos || 100))
          .input("porcentajeDentroRubro", sql.Decimal(5, 2), actividad.PorcentajeDentroRubro === null ? null : Number(actividad.PorcentajeDentroRubro || 0))
          .input("usaIndicadoresPlaneamiento", sql.Bit, !!actividad.UsaIndicadoresPlaneamiento)
          .input("fuente", sql.NVarChar(50), actividad.Fuente || null)
          .query(`
            INSERT INTO dbo.Eval360_Actividad
              (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)
            OUTPUT INSERTED.ActividadId
            VALUES
              (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @descripcion, @fecha, @puntosMaximos, @porcentajeDentroRubro, @usaIndicadoresPlaneamiento, @fuente, 1, SYSDATETIME())
          `);
        actividadMap.set(Number(actividad.ActividadId), Number(nuevaActividad.recordset[0]?.ActividadId || 0));
      }
    }

    if (estructuraOrigenRow && estructuraDestinoId) {
      const indicadoresGrupo = await new sql.Request(transaction)
        .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
        .query(`SELECT * FROM dbo.Eval360_IndicadorGrupo WHERE EstructuraGrupoId = @estructuraOrigenId AND Activo = 1 ORDER BY IndicadorGrupoId`);
      for (const indicador of indicadoresGrupo.recordset || []) {
        const nuevoPlaneamientoId = planeamientoMap.get(Number(indicador.PlaneamientoId));
        if (!nuevoPlaneamientoId) continue;
        const indicadorExistente = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("tipoUso", sql.NVarChar(50), indicador.TipoUso)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicador.IndicadorBase || "")
          .query(`
            SELECT TOP 1 IndicadorGrupoId
            FROM dbo.Eval360_IndicadorGrupo
            WHERE EstructuraGrupoId = @estructuraGrupoId
              AND PlaneamientoId = @planeamientoId
              AND ISNULL(Activo, 1) = 1
              AND ISNULL(TipoUso, N'') = ISNULL(@tipoUso, N'')
              AND UPPER(LTRIM(RTRIM(ISNULL(IndicadorBase, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@indicadorBase, N''))))
          `);
        if (indicadorExistente.recordset[0]) {
          indicadorGrupoMap.set(Number(indicador.IndicadorGrupoId), Number(indicadorExistente.recordset[0].IndicadorGrupoId));
          continue;
        }
        const nuevoIndicador = await new sql.Request(transaction)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("planeamientoId", sql.Int, nuevoPlaneamientoId)
          .input("tipoUso", sql.NVarChar(50), indicador.TipoUso)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicador.IndicadorBase)
          .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicador.IndicadorAvanzado)
          .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicador.IndicadorIntermedio)
          .input("indicadorInicial", sql.NVarChar(sql.MAX), indicador.IndicadorInicial)
          .query(`
            INSERT INTO dbo.Eval360_IndicadorGrupo
              (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
            OUTPUT INSERTED.IndicadorGrupoId
            VALUES
              (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
          `);
        indicadorGrupoMap.set(Number(indicador.IndicadorGrupoId), Number(nuevoIndicador.recordset[0]?.IndicadorGrupoId || 0));
      }

      if (actividadMap.size && indicadorGrupoMap.size) {
        const asignaciones = await new sql.Request(transaction)
          .input("estructuraOrigenId", sql.Int, Number(estructuraOrigenRow.EstructuraGrupoId))
          .query(`
            SELECT ai.ActividadId, ai.IndicadorGrupoId
            FROM dbo.Eval360_ActividadIndicador ai
            INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId
            WHERE a.EstructuraGrupoId = @estructuraOrigenId
              AND ai.Activo = 1
          `);
        for (const asignacion of asignaciones.recordset || []) {
          const nuevaActividadId = actividadMap.get(Number(asignacion.ActividadId));
          const nuevoIndicadorId = indicadorGrupoMap.get(Number(asignacion.IndicadorGrupoId));
          if (!nuevaActividadId || !nuevoIndicadorId) continue;
          await new sql.Request(transaction)
            .input("actividadId", sql.Int, nuevaActividadId)
            .input("indicadorGrupoId", sql.Int, nuevoIndicadorId)
            .query(`
              INSERT INTO dbo.Eval360_ActividadIndicador
                (ActividadId, IndicadorGrupoId, Activo)
              VALUES
                (@actividadId, @indicadorGrupoId, 1)
            `);
        }
      }
    }

    await transaction.commit();
    return {
      copiado: totalPlaneamientosCopiados > 0,
      grupoOrigenId,
      totalPlaneamientosCopiados
    };
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    throw error;
  }
}

router.get("/mis-grupos/:grupoId/materias/:materiaId/planeamientos", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) {
      return badRequest(res, "Grupo o materia inválida");
    }

    if (!anioLectivoId || !periodoId) {
      return badRequest(res, "Debés indicar año lectivo y periodo");
    }

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar planeamientos de este grupo y materia");

    const pool = await getPool();
    const debeSincronizarPlaneamientos = String(req.query.sincronizar ?? "true") !== "false";
    const sincronizacionPlaneamientos = debeSincronizarPlaneamientos
      ? await copiarPlaneamientosDesdeSeccionMismoGradoSiFaltan(pool, {
          institucionId: Number(asignacion.InstitucionId),
          grupoId,
          materiaId,
          anioLectivoId,
          periodoId,
          usuarioId: Number(asignacion.UsuarioId)
        })
      : { copiado: false, grupoOrigenId: null, totalPlaneamientosCopiados: 0 };

    const planeamientosResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          p.PlaneamientoId,
          p.InstitucionId,
          p.AnioLectivoId,
          p.PeriodoId,
          p.GrupoId,
          p.MateriaId,
          p.UsuarioId,
          p.Nombre,
          p.FechaInicio,
          p.FechaFin,
          p.Observaciones,
          p.ResultadoIAJson,
          p.Activo,
          p.CreatedAt,
          p.UpdatedAt
        FROM dbo.Planeamiento p
        WHERE p.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.PeriodoId = @periodoId
          AND p.GrupoId = @grupoId
          AND p.MateriaId = @materiaId
          AND p.UsuarioId = @usuarioId
          AND p.Activo = 1
        ORDER BY p.FechaInicio DESC, p.PlaneamientoId DESC
      `);

    const indicadoresResult = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          pi.PlaneamientoIndicadorId,
          pi.PlaneamientoId,
          pi.Descripcion,
          pi.NivelDesempenoId,
          nd.Descripcion AS NivelDescripcion,
          nd.Valor AS NivelValor,
          pi.Activo
        FROM dbo.PlaneamientoIndicador pi
        INNER JOIN dbo.Planeamiento p ON p.PlaneamientoId = pi.PlaneamientoId
        LEFT JOIN dbo.NivelDesempeno nd ON nd.NivelDesempenoId = pi.NivelDesempenoId
        WHERE p.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.PeriodoId = @periodoId
          AND p.GrupoId = @grupoId
          AND p.MateriaId = @materiaId
          AND p.UsuarioId = @usuarioId
          AND p.Activo = 1
          AND pi.Activo = 1
        ORDER BY pi.PlaneamientoId, pi.PlaneamientoIndicadorId
      `);

    const indicadoresEval360Result = await pool.request()
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .query(`
        SELECT
          i.*
        FROM dbo.Eval360_IndicadorGrupo i
        INNER JOIN dbo.Eval360_EstructuraGrupo eg
          ON eg.EstructuraGrupoId = i.EstructuraGrupoId
        INNER JOIN dbo.Planeamiento p
          ON p.PlaneamientoId = i.PlaneamientoId
        WHERE eg.InstitucionId = @institucionId
          AND eg.AnioLectivoId = @anioLectivoId
          AND eg.PeriodoId = @periodoId
          AND eg.GrupoId = @grupoId
          AND eg.MateriaId = @materiaId
          AND eg.Activo = 1
          AND p.InstitucionId = @institucionId
          AND p.AnioLectivoId = @anioLectivoId
          AND p.PeriodoId = @periodoId
          AND p.GrupoId = @grupoId
          AND p.MateriaId = @materiaId
          AND p.UsuarioId = @usuarioId
          AND p.Activo = 1
          AND i.Activo = 1
        ORDER BY
          i.PlaneamientoId,
          CASE i.TipoUso
            WHEN N'Cotidiano' THEN 1
            WHEN N'Tareas' THEN 2
            WHEN N'TablaEspecificaciones' THEN 3
            ELSE 9
          END,
          i.IndicadorGrupoId
      `);

    const planeamientos = planeamientosResult.recordset.map((planeamiento: any) => ({
      ...planeamiento,
      ResultadoIAJson: sanitizeResultadoIAJsonForList(planeamiento.ResultadoIAJson)
    }));

    return ok(res, {
      planeamientos,
      indicadores: indicadoresResult.recordset,
      indicadoresEval360: indicadoresEval360Result.recordset,
      sincronizacion: sincronizacionPlaneamientos
    });
  } catch (error) {
    console.error("Error cargando planeamientos:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los planeamientos" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/planeamientos", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId);
    const nombre = normalizeText(req.body.nombre);
    const fechaInicio = normalizeText(req.body.fechaInicio) || null;
    const fechaFin = normalizeText(req.body.fechaFin) || null;
    const observaciones = normalizeText(req.body.observaciones) || null;
    const indicadores = Array.isArray(req.body.indicadores) ? req.body.indicadores : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!nombre) return badRequest(res, "El nombre del planeamiento es obligatorio");

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para crear planeamientos en este grupo y materia");

    await transaction.begin();

    const insertPlaneamiento = new sql.Request(transaction);
    const planeamientoResult = await insertPlaneamiento
      .input("institucionId", sql.Int, Number(asignacion.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, Number(asignacion.UsuarioId))
      .input("nombre", sql.NVarChar(200), nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
      .query(`
        INSERT INTO dbo.Planeamiento
          (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, Activo, CreatedAt)
        OUTPUT INSERTED.PlaneamientoId
        VALUES
          (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, 1, SYSDATETIME())
      `);

    const planeamientoId = Number(planeamientoResult.recordset[0]?.PlaneamientoId);

    for (const item of indicadores) {
      const descripcion = normalizeText(item.descripcion);
      if (!descripcion) continue;
      const nivelDesempenoId = toOptionalNumber(item.nivelDesempenoId);
      const indicadorRequest = new sql.Request(transaction);
      await indicadorRequest
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
        .input("nivelDesempenoId", sql.Int, nivelDesempenoId)
        .query(`
          INSERT INTO dbo.PlaneamientoIndicador
            (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
          VALUES
            (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
        `);
    }

    await transaction.commit();
    return ok(res, { PlaneamientoId: planeamientoId, message: "Planeamiento guardado correctamente" });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error guardando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar el planeamiento" });
  }
});

router.put("/planeamientos/:planeamientoId", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    const nombre = normalizeText(req.body.nombre);
    const fechaInicio = normalizeText(req.body.fechaInicio) || null;
    const fechaFin = normalizeText(req.body.fechaFin) || null;
    const observaciones = normalizeText(req.body.observaciones) || null;
    const indicadores = Array.isArray(req.body.indicadores) ? req.body.indicadores : [];

    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");
    if (!nombre) return badRequest(res, "El nombre del planeamiento es obligatorio");

    const pool = await getPool();
    const lookupRequest = pool.request().input("planeamientoId", sql.Int, planeamientoId).input("usuarioId", sql.Int, getUserId(req));
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      lookupRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND p.InstitucionId = @institucionId";
    }
    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND p.UsuarioId = @usuarioId" : "";
    const lookup = await lookupRequest.query(`
      SELECT TOP 1 p.*
      FROM dbo.Planeamiento p
      WHERE p.PlaneamientoId = @planeamientoId
        AND p.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
    `);
    if (!lookup.recordset[0]) return forbidden(res, "No tenés permisos para editar este planeamiento");

    await transaction.begin();

    const updateRequest = new sql.Request(transaction);
    await updateRequest
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("nombre", sql.NVarChar(200), nombre)
      .input("fechaInicio", sql.Date, fechaInicio)
      .input("fechaFin", sql.Date, fechaFin)
      .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
      .query(`
        UPDATE dbo.Planeamiento
        SET Nombre = @nombre,
            FechaInicio = @fechaInicio,
            FechaFin = @fechaFin,
            Observaciones = @observaciones,
            UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoId = @planeamientoId
      `);

    const clearRequest = new sql.Request(transaction);
    await clearRequest
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        UPDATE dbo.PlaneamientoIndicador
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoId = @planeamientoId
      `);

    for (const item of indicadores) {
      const descripcion = normalizeText(item.descripcion);
      if (!descripcion) continue;
      const nivelDesempenoId = toOptionalNumber(item.nivelDesempenoId);
      const indicadorRequest = new sql.Request(transaction);
      await indicadorRequest
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
        .input("nivelDesempenoId", sql.Int, nivelDesempenoId)
        .query(`
          INSERT INTO dbo.PlaneamientoIndicador
            (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
          VALUES
            (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
        `);
    }

    await transaction.commit();
    return ok(res, { message: "Planeamiento actualizado correctamente" });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error actualizando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el planeamiento" });
  }
});

router.delete("/planeamientos/:planeamientoId", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");

    const pool = await getPool();
    const request = pool.request().input("planeamientoId", sql.Int, planeamientoId).input("usuarioId", sql.Int, getUserId(req));
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND InstitucionId = @institucionId";
    }
    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req) ? "AND UsuarioId = @usuarioId" : "";

    const indicadoresIaResult = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT COUNT(1) AS TotalIndicadoresIA
        FROM dbo.Eval360_IndicadorGrupo
        WHERE PlaneamientoId = @planeamientoId
          AND ISNULL(Activo, 1) = 1
      `);

    const totalIndicadoresIA = Number(indicadoresIaResult.recordset?.[0]?.TotalIndicadoresIA || 0);
    if (totalIndicadoresIA > 0) {
      return res.status(409).json({
        ok: false,
        message: "No se puede eliminar este planeamiento porque ya tiene indicadores generados con IA. Primero eliminá los indicadores IA asociados al planeamiento.",
        data: { totalIndicadoresIA }
      });
    }

    const result = await request.query(`
      UPDATE dbo.Planeamiento
      SET Activo = 0, UpdatedAt = SYSDATETIME()
      WHERE PlaneamientoId = @planeamientoId
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    if ((result.rowsAffected?.[0] || 0) === 0) return forbidden(res, "No tenés permisos para desactivar este planeamiento");
    return ok(res, { message: "Planeamiento desactivado correctamente" });
  } catch (error) {
    console.error("Error desactivando planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo desactivar el planeamiento" });
  }
});

router.delete("/planeamientos/:planeamientoId/eliminar-definitivo", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const planeamientoId = Number(req.params.planeamientoId);
    if (!Number.isFinite(planeamientoId)) return badRequest(res, "Planeamiento inválido");

    const alcanceRaw = String(req.query.alcance || req.body?.alcance || "seccion").trim().toLowerCase();
    const alcance = alcanceRaw === "todas" ? "todas" : "seccion";

    const pool = await getPool();
    const lookupRequest = pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .input("usuarioId", sql.Int, getUserId(req));

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      lookupRequest.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND p.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND p.UsuarioId = @usuarioId"
      : "";

    const lookup = await lookupRequest.query(`
      SELECT TOP 1
        p.PlaneamientoId,
        p.InstitucionId,
        p.AnioLectivoId,
        p.PeriodoId,
        p.GrupoId,
        p.MateriaId,
        p.UsuarioId,
        p.Nombre,
        p.FechaInicio,
        p.FechaFin,
        p.ResultadoIAJson,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        g.NivelAcademico AS GrupoNivelAcademico
      FROM dbo.Planeamiento p
      INNER JOIN dbo.Grupo g ON g.GrupoId = p.GrupoId
      WHERE p.PlaneamientoId = @planeamientoId
        AND p.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
    `);

    const base = lookup.recordset[0];
    if (!base) return forbidden(res, "No tenés permisos para eliminar este planeamiento");

    const toDateKey = (value: any) => (value ? new Date(value).toISOString().slice(0, 10) : "");
    const baseNombreKey = normalizeKey(base.Nombre || "");
    const baseInicioKey = toDateKey(base.FechaInicio);
    const baseFinKey = toDateKey(base.FechaFin);
    const baseResultadoIA = String(base.ResultadoIAJson || "");

    let idsObjetivo: number[] = [Number(base.PlaneamientoId)];
    const detalleObjetivo = new Map<number, { grupoId: number; grupoNombre: string }>([
      [Number(base.PlaneamientoId), { grupoId: Number(base.GrupoId), grupoNombre: String(base.GrupoNombre || "") }]
    ]);

    if (alcance === "todas") {
      const gruposMismoGradoResult = await pool.request()
        .input("institucionId", sql.Int, Number(base.InstitucionId))
        .input("anioLectivoId", sql.Int, Number(base.AnioLectivoId))
        .input("periodoId", sql.Int, Number(base.PeriodoId))
        .input("materiaId", sql.Int, Number(base.MateriaId))
        .input("usuarioId", sql.Int, Number(base.UsuarioId))
        .input("grupoBaseId", sql.Int, Number(base.GrupoId))
        .query(`
          WITH base_grupo AS (
            SELECT TOP 1
              g.GrupoId,
              g.Nivel,
              g.NivelAcademico,
              LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) AS GradoNombre
            FROM dbo.Grupo g
            WHERE g.GrupoId = @grupoBaseId
          )
          SELECT DISTINCT
            g.GrupoId,
            g.Nombre AS GrupoNombre
          FROM dbo.AsignacionDocente ad
          INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
          CROSS JOIN base_grupo bg
          WHERE ad.Activo = 1
            AND ad.InstitucionId = @institucionId
            AND ad.AnioLectivoId = @anioLectivoId
            AND ad.PeriodoId = @periodoId
            AND ad.MateriaId = @materiaId
            AND ad.UsuarioId = @usuarioId
            AND (
              ad.GrupoId = @grupoBaseId
              OR (g.NivelAcademico IS NOT NULL AND bg.NivelAcademico IS NOT NULL AND g.NivelAcademico = bg.NivelAcademico)
              OR UPPER(LTRIM(RTRIM(ISNULL(g.Nivel, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(bg.Nivel, N''))))
              OR LEFT(REPLACE(g.Nombre, N' ', N''), CHARINDEX(N'-', REPLACE(g.Nombre, N' ', N'') + N'-') - 1) = bg.GradoNombre
            )
        `);

      const gruposMismoGradoIds = (gruposMismoGradoResult.recordset || []).map((item: any) => Number(item.GrupoId)).filter((id: number) => id > 0);
      if (gruposMismoGradoIds.length > 0) {
        const idsClause = gruposMismoGradoIds.join(",");
        const candidatosResult = await pool.request()
          .input("institucionId", sql.Int, Number(base.InstitucionId))
          .input("anioLectivoId", sql.Int, Number(base.AnioLectivoId))
          .input("periodoId", sql.Int, Number(base.PeriodoId))
          .input("materiaId", sql.Int, Number(base.MateriaId))
          .input("usuarioId", sql.Int, Number(base.UsuarioId))
          .query(`
            SELECT
              p.PlaneamientoId,
              p.GrupoId,
              g.Nombre AS GrupoNombre,
              p.Nombre,
              p.FechaInicio,
              p.FechaFin,
              p.ResultadoIAJson
            FROM dbo.Planeamiento p
            INNER JOIN dbo.Grupo g ON g.GrupoId = p.GrupoId
            WHERE p.InstitucionId = @institucionId
              AND p.AnioLectivoId = @anioLectivoId
              AND p.PeriodoId = @periodoId
              AND p.MateriaId = @materiaId
              AND p.UsuarioId = @usuarioId
              AND p.Activo = 1
              AND p.GrupoId IN (${idsClause})
          `);

        idsObjetivo = (candidatosResult.recordset || [])
          .filter((item: any) => {
            const sameByNameAndDates =
              normalizeKey(item.Nombre || "") === baseNombreKey
              && toDateKey(item.FechaInicio) === baseInicioKey
              && toDateKey(item.FechaFin) === baseFinKey;
            const sameByIaJson =
              !!baseResultadoIA
              && !!item.ResultadoIAJson
              && String(item.ResultadoIAJson) === baseResultadoIA;
            return Number(item.PlaneamientoId) === Number(base.PlaneamientoId) || sameByNameAndDates || sameByIaJson;
          })
          .map((item: any) => {
            const id = Number(item.PlaneamientoId);
            detalleObjetivo.set(id, {
              grupoId: Number(item.GrupoId),
              grupoNombre: String(item.GrupoNombre || "")
            });
            return id;
          });
      }
    }

    idsObjetivo = Array.from(new Set(idsObjetivo)).filter((id) => Number.isFinite(id) && id > 0);
    if (!idsObjetivo.length) return badRequest(res, "No se encontraron planeamientos para eliminar");

    const idsObjetivoClause = idsObjetivo.join(",");
    const indicadoresResult = await pool.request().query(`
      SELECT
        ig.PlaneamientoId,
        COUNT(1) AS TotalIndicadoresIA
      FROM dbo.Eval360_IndicadorGrupo ig
      WHERE ig.PlaneamientoId IN (${idsObjetivoClause})
        AND ISNULL(ig.Activo, 1) = 1
      GROUP BY ig.PlaneamientoId
    `);

    const bloqueados = (indicadoresResult.recordset || []).map((row: any) => {
      const id = Number(row.PlaneamientoId);
      const detalle = detalleObjetivo.get(id);
      return {
        planeamientoId: id,
        totalIndicadoresIA: Number(row.TotalIndicadoresIA || 0),
        grupoId: Number(detalle?.grupoId || 0),
        grupoNombre: String(detalle?.grupoNombre || "")
      };
    });

    if (bloqueados.length > 0) {
      const grupos = bloqueados.map((item: any) => item.grupoNombre).filter(Boolean).join(", ");
      return res.status(409).json({
        ok: false,
        message: alcance === "todas"
          ? `No se puede eliminar para todas las secciones porque hay indicadores IA activos en: ${grupos || "una o más secciones"}.`
          : "No se puede eliminar este planeamiento porque ya tiene indicadores generados con IA en esta sección.",
        data: { bloqueados, alcance }
      });
    }

    await transaction.begin();

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.PlaneamientoIndicador
      WHERE PlaneamientoId IN (${idsObjetivoClause});
    `);

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.Planeamiento
      WHERE PlaneamientoId IN (${idsObjetivoClause});
    `);

    await transaction.commit();

    return ok(res, {
      message: alcance === "todas"
        ? `Planeamiento eliminado en ${idsObjetivo.length} sección(es) del mismo grado`
        : "Planeamiento eliminado correctamente de esta sección",
      alcance,
      totalEliminados: idsObjetivo.length
    });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error eliminando planeamiento definitivo en gestión profe:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el planeamiento" });
  }
});


const asistenciaEstadosPermitidos = new Set([
  "PRESENTE",
  "AUSENTE_JUSTIFICADA",
  "AUSENTE_INJUSTIFICADA",
  "TARDIA_MENOR_10",
  "TARDIA_MAYOR_10"
]);

function calcularValorAusenciaArticulo37(estado: string) {
  switch (estado) {
    case "AUSENTE_INJUSTIFICADA": return 1;
    case "TARDIA_MAYOR_10": return 1;
    case "TARDIA_MENOR_10": return 0.5;
    default: return 0;
  }
}

function calcularPorcentajeArticulo37(porcentajeAusencias: number) {
  if (porcentajeAusencias >= 50) return 0;
  if (porcentajeAusencias >= 40) return 1;
  if (porcentajeAusencias >= 30) return 2;
  if (porcentajeAusencias >= 20) return 3;
  if (porcentajeAusencias >= 10) return 4;
  return 5;
}


function getDiaSemanaEscolar(fecha: string) {
  const date = new Date(`${fecha}T00:00:00`);
  const jsDay = date.getDay();
  return jsDay + 1;
}

async function buildResumenAsistencia(grupoId: number, materiaId: number, anioLectivoId: number, periodoId: number) {
  const pool = await getPool();

  const leccionesResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT COUNT(DISTINCT CONCAT(CONVERT(varchar(10), Fecha, 23), '-', ISNULL(CONVERT(varchar(20), HorarioGrupoId), '0'))) AS TotalLecciones
      FROM dbo.AsistenciaRegistro
      WHERE GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
    `);

  const totalLecciones = Number(leccionesResult.recordset[0]?.TotalLecciones || 0);

  const registrosResult = await pool.request()
    .input("grupoId", sql.Int, grupoId)
    .input("materiaId", sql.Int, materiaId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        ar.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        ar.Estado
      FROM dbo.AsistenciaRegistro ar
      INNER JOIN dbo.Estudiante e ON e.EstudianteId = ar.EstudianteId
      WHERE ar.GrupoId = @grupoId
        AND ar.MateriaId = @materiaId
        AND ar.AnioLectivoId = @anioLectivoId
        AND ar.PeriodoId = @periodoId
      ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre, ar.Fecha, ar.HorarioGrupoId
    `);

  const resumenMap = new Map<number, any>();
  for (const row of registrosResult.recordset) {
    const estudianteId = Number(row.EstudianteId);
    if (!resumenMap.has(estudianteId)) {
      resumenMap.set(estudianteId, {
        EstudianteId: estudianteId,
        Identificacion: row.Identificacion,
        Nombre: row.Nombre,
        PrimerApellido: row.PrimerApellido,
        SegundoApellido: row.SegundoApellido,
        TotalLecciones: totalLecciones,
        AusenciasInjustificadasEquivalentes: 0,
        PorcentajeAusencias: 0,
        PorcentajeAsignadoArticulo37: 5
      });
    }

    const resumen = resumenMap.get(estudianteId);
    resumen.AusenciasInjustificadasEquivalentes += calcularValorAusenciaArticulo37(String(row.Estado || ""));
  }

  for (const resumen of resumenMap.values()) {
    resumen.AusenciasInjustificadasEquivalentes = Number(resumen.AusenciasInjustificadasEquivalentes.toFixed(2));
    resumen.PorcentajeAusencias = totalLecciones > 0
      ? Number(((resumen.AusenciasInjustificadasEquivalentes * 100) / totalLecciones).toFixed(2))
      : 0;
    resumen.PorcentajeAsignadoArticulo37 = calcularPorcentajeArticulo37(resumen.PorcentajeAusencias);
  }

  return Array.from(resumenMap.values());
}

router.get("/mis-grupos/:grupoId/materias/:materiaId/asistencia", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const fecha = normalizeText(req.query.fecha) || new Date().toISOString().slice(0, 10);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para consultar asistencia de este grupo y materia");

    const pool = await getPool();
    const diaSemana = getDiaSemanaEscolar(fecha);

    const leccionesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .input("diaSemana", sql.Int, diaSemana)
      .query(`
        SELECT
          hg.HorarioGrupoId,
          hg.BloqueHorarioId,
          bh.Nombre,
          CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
          CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin,
          bh.OrdenVisual,
          hg.DiaSemana
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
         AND gm.Activo = 1
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        WHERE gm.GrupoId = @grupoId
          AND gm.MateriaId = @materiaId
          AND (@periodoId IS NULL OR gm.PeriodoId IS NULL OR gm.PeriodoId = @periodoId)
          AND hg.DiaSemana = @diaSemana
          AND hg.Activo = 1
        ORDER BY bh.OrdenVisual, bh.HoraInicio
      `);

    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          ma.MatriculaId
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.GrupoId = @grupoId
          AND ma.AnioLectivoId = @anioLectivoId
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    const registrosResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("fecha", sql.Date, fecha)
      .query(`
        SELECT
          AsistenciaRegistroId,
          EstudianteId,
          HorarioGrupoId,
          BloqueHorarioId,
          GrupoId,
          MateriaId,
          AnioLectivoId,
          PeriodoId,
          Fecha,
          Estado,
          MinutosTardia,
          Observacion
        FROM dbo.AsistenciaRegistro
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Fecha = @fecha
      `);

    const resumen = await buildResumenAsistencia(grupoId, materiaId, anioLectivoId, periodoId);

    return ok(res, {
      fecha,
      diaSemana,
      lecciones: leccionesResult.recordset,
      estudiantes: estudiantesResult.recordset,
      registros: registrosResult.recordset,
      resumen,
      escalaArticulo37: [
        { desde: 0, hastaMenor: 10, porcentaje: 5 },
        { desde: 10, hastaMenor: 20, porcentaje: 4 },
        { desde: 20, hastaMenor: 30, porcentaje: 3 },
        { desde: 30, hastaMenor: 40, porcentaje: 2 },
        { desde: 40, hastaMenor: 50, porcentaje: 1 },
        { desde: 50, hastaMenor: null, porcentaje: 0 }
      ]
    });
  } catch (error) {
    console.error("Error cargando asistencia:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la asistencia" });
  }
});

router.post("/mis-grupos/:grupoId/materias/:materiaId/asistencia", async (req, res) => {
  const transaction = new sql.Transaction(await getPool());

  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.body.anioLectivoId);
    const periodoId = toOptionalNumber(req.body.periodoId);
    const fecha = normalizeText(req.body.fecha);
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");
    if (!fecha) return badRequest(res, "La fecha de asistencia es obligatoria");
    if (registros.length === 0) return badRequest(res, "No se recibieron registros de asistencia");

    const asignacion = await getAsignacionPermitida(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!asignacion) return forbidden(res, "No tenés permisos para registrar asistencia en este grupo y materia");

    const pool = await getPool();
    const estudiantesResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .query(`
        SELECT DISTINCT e.EstudianteId
        FROM dbo.Matricula ma
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.GrupoId = @grupoId
          AND ma.AnioLectivoId = @anioLectivoId
          AND ma.Estado <> N'Inactiva'
          AND e.Activo = 1
      `);

    const estudiantesPermitidos = new Set<number>(estudiantesResult.recordset.map((item: any) => Number(item.EstudianteId)));

    const diaSemana = getDiaSemanaEscolar(fecha);
    const leccionesPermitidasResult = await pool.request()
      .input("grupoId", sql.Int, grupoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .input("diaSemana", sql.Int, diaSemana)
      .query(`
        SELECT
          hg.HorarioGrupoId,
          hg.BloqueHorarioId,
          bh.Nombre AS LeccionNombre
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
         AND gm.Activo = 1
        INNER JOIN dbo.BloqueHorario bh
          ON bh.BloqueHorarioId = hg.BloqueHorarioId
        WHERE gm.GrupoId = @grupoId
          AND gm.MateriaId = @materiaId
          AND (@periodoId IS NULL OR gm.PeriodoId IS NULL OR gm.PeriodoId = @periodoId)
          AND hg.DiaSemana = @diaSemana
          AND hg.Activo = 1
      `);
    const leccionesPermitidas = new Map<number, number>();
    const leccionesNombrePorHorario = new Map<number, string>();
    for (const item of leccionesPermitidasResult.recordset) {
      leccionesPermitidas.set(Number(item.HorarioGrupoId), Number(item.BloqueHorarioId));
      leccionesNombrePorHorario.set(Number(item.HorarioGrupoId), String(item.LeccionNombre || "").trim());
    }

    const normalizados = registros.map((item: any) => ({
      estudianteId: Number(item.estudianteId),
      horarioGrupoId: Number(item.horarioGrupoId || 0),
      bloqueHorarioId: Number(item.bloqueHorarioId || 0),
      estado: normalizeText(item.estado) || "PRESENTE",
      minutosTardia: toOptionalNumber(item.minutosTardia) || 0,
      observacion: normalizeText(item.observacion).slice(0, 500) || null,
      notificarEncargado: Boolean(item.notificarEncargado)
    }));

    for (const item of normalizados) {
      if (!Number.isFinite(item.estudianteId) || !estudiantesPermitidos.has(item.estudianteId)) {
        return badRequest(res, "Se recibió un estudiante que no pertenece al grupo seleccionado");
      }
      if (!leccionesPermitidas.has(item.horarioGrupoId)) {
        return badRequest(res, "Se recibió una lección que no pertenece al horario de esa sección, materia y fecha");
      }
      item.bloqueHorarioId = leccionesPermitidas.get(item.horarioGrupoId) || item.bloqueHorarioId;
      if (!asistenciaEstadosPermitidos.has(item.estado)) {
        return badRequest(res, "Estado de asistencia inválido");
      }
      if (item.minutosTardia < 0 || item.minutosTardia > 999) {
        return badRequest(res, "Los minutos de tardía deben estar entre 0 y 999");
      }
    }

    await transaction.begin();

    let guardados = 0;
    for (const item of normalizados) {
      const request = new sql.Request(transaction);
      await request
        .input("estudianteId", sql.Int, item.estudianteId)
        .input("horarioGrupoId", sql.Int, item.horarioGrupoId)
        .input("bloqueHorarioId", sql.Int, item.bloqueHorarioId)
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("fecha", sql.Date, fecha)
        .input("estado", sql.NVarChar(40), item.estado)
        .input("minutosTardia", sql.Int, item.minutosTardia)
        .input("observacion", sql.NVarChar(500), item.observacion)
        .input("usuarioId", sql.Int, getUserId(req))
        .query(`
          MERGE dbo.AsistenciaRegistro AS target
          USING (
            SELECT
              @estudianteId AS EstudianteId,
              @horarioGrupoId AS HorarioGrupoId,
              @bloqueHorarioId AS BloqueHorarioId,
              @grupoId AS GrupoId,
              @materiaId AS MateriaId,
              @anioLectivoId AS AnioLectivoId,
              @periodoId AS PeriodoId,
              @fecha AS Fecha
          ) AS source
          ON target.EstudianteId = source.EstudianteId
             AND target.HorarioGrupoId = source.HorarioGrupoId
             AND target.GrupoId = source.GrupoId
             AND target.MateriaId = source.MateriaId
             AND target.AnioLectivoId = source.AnioLectivoId
             AND target.PeriodoId = source.PeriodoId
             AND target.Fecha = source.Fecha
          WHEN MATCHED THEN
            UPDATE SET
              Estado = @estado,
              MinutosTardia = @minutosTardia,
              Observacion = @observacion,
              UsuarioRegistroId = @usuarioId,
              UpdatedAt = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (EstudianteId, HorarioGrupoId, BloqueHorarioId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, Fecha, Estado, MinutosTardia, Observacion, UsuarioRegistroId, CreatedAt)
            VALUES (@estudianteId, @horarioGrupoId, @bloqueHorarioId, @grupoId, @materiaId, @anioLectivoId, @periodoId, @fecha, @estado, @minutosTardia, @observacion, @usuarioId, SYSDATETIME());
        `);
      guardados += 1;
    }

    await transaction.commit();

    const resumen = await buildResumenAsistencia(grupoId, materiaId, anioLectivoId, periodoId);

    const notificaciones: any[] = [];
    const registrosNotificar = normalizados.filter((item: any) => item.notificarEncargado);
    const porEstudiante = new Map<number, any[]>();
    for (const item of registrosNotificar) {
      const list = porEstudiante.get(Number(item.estudianteId)) || [];
      list.push(item);
      porEstudiante.set(Number(item.estudianteId), list);
    }
    const correoCfg = await getCorreoNotificacionConfig(pool, Number(getAuth(req).institucionId || 0), "ASISTENCIA");
    const institucionNombreResult = await pool.request()
      .input("institucionId", sql.Int, Number(getAuth(req).institucionId || 0))
      .query(`SELECT TOP 1 Nombre FROM dbo.Institucion WHERE InstitucionId = @institucionId`);
    const institucionNombre = String(institucionNombreResult.recordset[0]?.Nombre || "");

    for (const [estudianteId, items] of porEstudiante.entries()) {
      try {
        const estudianteResult = await pool.request()
          .input("estudianteId", sql.Int, estudianteId)
          .query(`
            SELECT TOP 1
              e.EstudianteId,
              e.Identificacion,
              e.Nombre,
              e.PrimerApellido,
              e.SegundoApellido,
              e.Correo,
              e.AutorizaWhatsAppEncargado,
              enc.Telefono AS EncargadoPrincipalTelefono
            FROM dbo.Estudiante e
            OUTER APPLY (
              SELECT TOP 1 en.Telefono
              FROM dbo.EstudianteEncargado ee
              INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
              WHERE ee.EstudianteId = e.EstudianteId
                AND ISNULL(ee.Activo, 1) = 1
                AND ISNULL(en.Activo, 1) = 1
              ORDER BY ISNULL(ee.EsPrincipal, 0) DESC, ISNULL(ee.RecibeNotificaciones, 0) DESC, ee.EstudianteEncargadoId DESC
            ) enc
            WHERE e.EstudianteId = @estudianteId
          `);

        const estudiante = estudianteResult.recordset[0];
        if (!estudiante) continue;

        const nombreEstudiante = [estudiante.Nombre, estudiante.PrimerApellido, estudiante.SegundoApellido].filter(Boolean).join(" ");
        const detalle = items.map((item) => {
          const estadoTexto = String(item.estado || "").replace(/_/g, " ").toLowerCase();
          const leccionNombre = leccionesNombrePorHorario.get(Number(item.horarioGrupoId || 0));
          const bloque = leccionNombre || (item.bloqueHorarioId ? leccionOrdinalLabel(Number(item.bloqueHorarioId)) : "Leccion");
          return `${bloque}: ${estadoTexto}${item.observacion ? ` (${item.observacion})` : ""}`;
        }).join("\n");
        const vars = {
          fecha,
          alumno: nombreEstudiante,
          materia: String(asignacion?.MateriaNombre || ""),
          seccion: String(asignacion?.GrupoNombre || ""),
          lecciones: String(items.length),
          profesor: [asignacion?.ProfesorNombre || "", asignacion?.ProfesorPrimerApellido || "", asignacion?.ProfesorSegundoApellido || ""].join(" ").replace(/\s+/g, " ").trim(),
          colegio: institucionNombre,
          reporte: items.some((x) => String(x?.estado || "").includes("TARDIA")) && items.some((x) => String(x?.estado || "").includes("AUSENTE"))
            ? "Ausencia y tardía"
            : (items.some((x) => String(x?.estado || "").includes("TARDIA")) ? "Tardía" : "Ausencia"),
          detalle
        };
        const subject = correoCfg?.AsuntoTemplate ? renderTemplate(String(correoCfg.AsuntoTemplate), vars) : "Reporte de asistencia";
        const texto = correoCfg?.CuerpoTemplate
          ? renderTemplate(String(correoCfg.CuerpoTemplate), vars)
          : `Se registra asistencia para ${nombreEstudiante}. Fecha: ${fecha}. ${detalle}`;

        if (estudiante.Correo) {
          const correo = await sendEmail({
            from: String(correoCfg?.FromEmail || ""),
            to: estudiante.Correo,
            subject,
            text: texto,
            html: `<p>${toHtmlWithLineBreaks(texto)}</p>`
          });
          notificaciones.push({ estudianteId, canal: "correo", ...correo });
        }

        if (estudiante.AutorizaWhatsAppEncargado) {
          console.log("WhatsApp asistencia simulado:", { telefono: estudiante.EncargadoPrincipalTelefono, mensaje: texto });
          notificaciones.push({ estudianteId, canal: "whatsapp", enviado: Boolean(estudiante.EncargadoPrincipalTelefono), simulado: true });
        }
      } catch (notifyError: any) {
        console.error("No se pudo notificar asistencia:", notifyError);
        notificaciones.push({ estudianteId, enviado: false, error: notifyError?.message || "Error notificando" });
      }
    }

    return ok(res, {
      guardados,
      resumen,
      notificaciones,
      message: "Asistencia guardada correctamente"
    });
  } catch (error) {
    try { if ((transaction as any)._aborted === false) await transaction.rollback(); } catch {}
    console.error("Error guardando asistencia:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la asistencia" });
  }
});



router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/excel", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!data) return;

    const rows: any[][] = [];
    const contexto = data.contexto;

    rows.push(["MINISTERIO DE EDUCACIÓN PÚBLICA"]);
    rows.push([String(contexto.Nombre || "Institución")]);
    rows.push([`Código presupuestario: ${contexto.CodigoPresupuestario || ""}`]);
    rows.push([`Grupo: ${contexto.GrupoNombre || ""}`, `Materia: ${contexto.MateriaNombre || ""}`, `Periodo: ${contexto.PeriodoNombre || ""}`]);
    rows.push([`Profesor: ${[contexto.ProfesorNombre || "", contexto.ProfesorPrimerApellido || "", contexto.ProfesorSegundoApellido || ""].join(" ").trim()}`]);
    rows.push([`Generado: ${formatDateCR(data.generadoEn)}`]);
    rows.push([]);

    const header = ["Estudiante", "Identificación"];
    for (const actividad of data.actividades) {
      header.push(`${actividad.ComponenteDescripcion} - ${actividad.Descripcion} (${formatNumber(actividad.PorcentajeReal)}%)`);
    }
    header.push("% acumulado evaluación", "Lecciones registradas", "Ausencias equivalentes", "% ausencias", "% asistencia Art. 37");
    rows.push(header);

    for (const estudiante of data.estudiantes) {
      const row = [estudiante.NombreCompleto, estudiante.Identificacion];
      for (const actividad of data.actividades) {
        const nota = estudiante.detalleNotas.find((item: any) => Number(item.actividadId) === Number(actividad.EvaluacionActividadId));
        row.push(nota?.nota === null || nota?.nota === undefined ? "" : Number(nota.nota));
      }
      row.push(
        estudiante.acumuladoEvaluacion,
        estudiante.totalLecciones,
        estudiante.ausenciasEquivalentes,
        estudiante.porcentajeAusencias,
        estudiante.porcentajeAsistencia
      );
      rows.push(row);
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = header.map((_, index) => ({ wch: index === 0 ? 36 : 18 }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = `reporte-${String(contexto.GrupoNombre || "grupo").replace(/\s+/g, "-")}-${String(contexto.MateriaNombre || "materia").replace(/\s+/g, "-")}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error generando reporte Excel:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el reporte en Excel" });
  }
});

router.get("/mis-grupos/:grupoId/materias/:materiaId/reportes/pdf", async (req, res) => {
  try {
    if (!assertCanAccessProfessorModule(req, res)) return;

    const grupoId = Number(req.params.grupoId);
    const materiaId = Number(req.params.materiaId);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);

    if (!Number.isFinite(grupoId) || !Number.isFinite(materiaId)) return badRequest(res, "Grupo o materia inválida");
    if (!anioLectivoId || !periodoId) return badRequest(res, "Debés indicar año lectivo y periodo");

    const data = await buildReporteFormalData(req, res, grupoId, materiaId, anioLectivoId, periodoId);
    if (!data) return;

    const c = data.contexto;
    const profesor = [c.ProfesorNombre || "", c.ProfesorPrimerApellido || "", c.ProfesorSegundoApellido || ""].join(" ").replace(/\s+/g, " ").trim();

    const actividadHeaders = data.actividades.map((actividad: any) => `
      <th>${escapeHtml(actividad.ComponenteDescripcion)}<br><small>${escapeHtml(actividad.Descripcion)}<br>${formatNumber(actividad.PorcentajeReal)}%</small></th>
    `).join("");

    const rows = data.estudiantes.map((estudiante: any) => {
      const notas = data.actividades.map((actividad: any) => {
        const nota = estudiante.detalleNotas.find((item: any) => Number(item.actividadId) === Number(actividad.EvaluacionActividadId));
        return `<td class="num">${nota?.nota === null || nota?.nota === undefined ? "" : formatNumber(nota.nota, Number(data.plantilla?.DecimalesNota || 2))}</td>`;
      }).join("");

      return `
        <tr>
          <td>${escapeHtml(estudiante.NombreCompleto)}</td>
          <td>${escapeHtml(estudiante.Identificacion)}</td>
          ${notas}
          <td class="num strong">${formatNumber(estudiante.acumuladoEvaluacion)}%</td>
          <td class="num">${estudiante.totalLecciones}</td>
          <td class="num">${formatNumber(estudiante.ausenciasEquivalentes)}</td>
          <td class="num">${formatNumber(estudiante.porcentajeAusencias)}%</td>
          <td class="num strong">${formatNumber(estudiante.porcentajeAsistencia)}%</td>
        </tr>
      `;
    }).join("");

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Reporte académico</title>
<style>
  @page { size: letter landscape; margin: 1.2cm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11px; }
  .membrete { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 16px; align-items: center; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-weight: 700; color: #334155; letter-spacing: 0.5px; font-size: 15px; }
  .gov { color: #64748b; font-size: 13px; }
  .inst { text-align: right; color: #334155; line-height: 1.35; }
  h1 { text-align: center; font-size: 18px; margin: 16px 0 10px; letter-spacing: 1px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 18px; margin-bottom: 14px; font-size: 11px; }
  .meta div { border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #9ca3af; padding: 5px 6px; vertical-align: middle; }
  th { background: #f1f5f9; text-align: center; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
  .nota { margin-top: 12px; font-size: 10px; color: #374151; }
  .firma { margin-top: 35px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .linea { border-top: 1px solid #111827; padding-top: 6px; text-align: center; }
  .acciones { position: fixed; top: 10px; right: 10px; }
  .acciones button { padding: 8px 12px; border-radius: 8px; border: 1px solid #94a3b8; background: white; cursor: pointer; }
  @media print { .acciones { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="acciones"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <header class="membrete">
    <div class="brand">MINISTERIO DE<br>EDUCACIÓN PÚBLICA</div>
    <div class="gov">GOBIERNO<br>DE COSTA RICA</div>
    <div class="inst">
      <strong>${escapeHtml(c.Nombre || "Institución")}</strong><br>
      Código presupuestario: ${escapeHtml(c.CodigoPresupuestario || "")}<br>
      ${escapeHtml(c.DireccionExacta || c.Direccion || "")}
    </div>
  </header>

  <h1>REPORTE ACADÉMICO</h1>

  <section class="meta">
    <div><strong>Grupo:</strong> ${escapeHtml(c.GrupoNombre || "")}</div>
    <div><strong>Materia:</strong> ${escapeHtml(c.MateriaNombre || "")}</div>
    <div><strong>Periodo:</strong> ${escapeHtml(c.PeriodoNombre || "")}</div>
    <div><strong>Año lectivo:</strong> ${escapeHtml(c.AnioNombre || "")}</div>
    <div><strong>Docente:</strong> ${escapeHtml(profesor)}</div>
    <div><strong>Cargo:</strong> ${escapeHtml(c.ProfesorCargo || "")}</div>
  </section>

  <table>
    <thead>
      <tr>
        <th>Estudiante</th>
        <th>Identificación</th>
        ${actividadHeaders}
        <th>% acumulado evaluación</th>
        <th>Lecciones</th>
        <th>Ausencias equivalentes</th>
        <th>% ausencias</th>
        <th>% asistencia Art. 37</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p class="nota"><strong>Nota:</strong> el porcentaje de asistencia se calcula según el Artículo 37, usando ausencias injustificadas equivalentes registradas en el periodo.</p>

  <section class="firma">
    <div class="linea">${escapeHtml(profesor || "Docente")}<br>${escapeHtml(c.ProfesorCargo || "")}</div>
    <div class="linea">Dirección / Administración<br>${escapeHtml(c.Nombre || "")}</div>
  </section>

  <script>setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    console.error("Error generando reporte PDF:", error);
    return res.status(500).json({ ok: false, message: "No se pudo generar el reporte en PDF" });
  }
});

export default router;

