import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest } from "../../utils/http";

const router = Router();
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
      ORDER BY u.Nombre, u.PrimerApellido, u.SegundoApellido
    `);
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

/* =========================================================
   CATALOGOS
   ========================================================= */
router.get("/catalogos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const pool = await getPool();

    const [anios, estudiantes, grupos, periodos, materias, docentes, bloques, feriados, diasLectivos, configCorreo] = await Promise.all([
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
            Activo
          FROM dbo.Estudiante
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Nombre, PrimerApellido, SegundoApellido
        `),

      pool.request()
        .input("institucionId", sql.Int, institucionId)
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
            Activa AS Activo,
            CreatedAt,
            UpdatedAt
          FROM dbo.Materia
          WHERE InstitucionId = @institucionId
            AND Activa = 1
          ORDER BY Nombre
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
          Activa AS Activo,
          CreatedAt,
          UpdatedAt
        FROM dbo.Materia
        WHERE InstitucionId = @institucionId
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

    const { nombre, codigo, descripcion } = req.body;

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("nombre", sql.NVarChar, nombre)
      .input("codigo", sql.NVarChar, codigo || null)
      .query(`
        SELECT TOP 1 MateriaId
        FROM dbo.Materia
        WHERE InstitucionId = @institucionId
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
      .query(`
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
    const { nombre, codigo, descripcion } = req.body;

    if (!isValidNonNegativeId(id)) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const pool = await getPool();

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
      .query(`
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
          md.Especialidad,
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
          )
        ORDER BY m.MatriculaId DESC
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
          md.Especialidad,
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
      .input("usuarioRegistroId", sql.Int, req.auth?.usuarioId || req.auth?.userId || req.auth?.id || null)
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

    await transaction.begin();

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
      .input("usuarioActualizaId", sql.Int, req.auth?.usuarioId || req.auth?.userId || req.auth?.id || null)
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

    const existeDetalle = await transaction.request()
      .input("matriculaId", sql.Int, id)
      .query(`
        SELECT TOP 1 MatriculaDetalleId
        FROM dbo.MatriculaDetalle
        WHERE MatriculaId = @matriculaId
      `);

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
        ORDER BY ad.AsignacionDocenteId DESC
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

    return router.handle(
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

export default router;