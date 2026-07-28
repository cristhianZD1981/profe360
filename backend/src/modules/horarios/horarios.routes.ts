import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, badRequest } from "../../utils/http";

const router = Router();

router.use(requireAuth);
router.use(
  requireRoles(
    "SUPER_ADMIN",
    "ADMIN_INSTITUCIONAL",
    "ADMINISTRATIVO",
    "PROFESOR",
    "PROFESOR_GUIA"
  )
);

type DiaLectivo = {
  numero: number;
  nombre: string;
};

const DIAS_SEMANA_DEFAULT: DiaLectivo[] = [
  { numero: 2, nombre: "Lunes" },
  { numero: 3, nombre: "Martes" },
  { numero: 4, nombre: "Miércoles" },
  { numero: 5, nombre: "Jueves" },
  { numero: 6, nombre: "Viernes" }
];

function getInstitutionId(req: any, res: any) {
  const institucionId = req.auth?.institucionId ?? null;

  if (!institucionId) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }

  return Number(institucionId);
}

function getUserId(req: any, res: any) {
  const auth = req.auth || {};

  const usuarioId =
    auth.usuarioId ??
    auth.userId ??
    auth.id ??
    null;

  if (!usuarioId) {
    badRequest(res, "No se pudo determinar el usuario autenticado");
    return null;
  }

  return Number(usuarioId);
}

function isValidNonNegativeId(value: any) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function formatTimeString(value?: any) {
  if (!value) return "";

  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, "0");
    const minutes = String(value.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  const str = String(value).trim();

  const isoMatch = str.match(/T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z?$/);
  if (isoMatch) {
    return isoMatch[1];
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(str)) {
    return str.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  return str;
}

async function getDiasLectivos(pool: any, institucionId: number): Promise<DiaLectivo[]> {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT
        DiaSemana,
        Nombre
      FROM dbo.DiaLectivoInstitucion
      WHERE InstitucionId = @institucionId
        AND Activo = 1
      ORDER BY
        CASE WHEN DiaSemana = 1 THEN 8 ELSE DiaSemana END
    `);

  const dias = (result.recordset || []).map((d: any) => ({
    numero: Number(d.DiaSemana),
    nombre: String(d.Nombre)
  }));

  return dias.length ? dias : DIAS_SEMANA_DEFAULT;
}

function diaNombreDesdeNumero(diaSemana: number, dias: DiaLectivo[]) {
  const found = dias.find((d) => d.numero === Number(diaSemana));
  return found?.nombre || "";
}

function buildEmptyCellMap(dias: DiaLectivo[]) {
  const map: Record<string, string> = {};
  dias.forEach((d) => {
    map[d.nombre] = "Libre";
  });
  return map;
}

function buildGridRows(
  bloques: any[],
  items: any[],
  dias: DiaLectivo[],
  valueBuilder: (item: any) => string
) {
  const rows = bloques.map((bloque) => ({
    bloqueHorarioId: Number(bloque.BloqueHorarioId),
    leccion: bloque.Nombre,
    horaInicio: formatTimeString(bloque.HoraInicio),
    horaFin: formatTimeString(bloque.HoraFin),
    ...buildEmptyCellMap(dias)
  }));

  const rowMap = new Map<number, any>();
  rows.forEach((row) => rowMap.set(row.bloqueHorarioId, row));

  for (const item of items) {
    const row = rowMap.get(Number(item.BloqueHorarioId));
    if (!row) continue;

    const diaNombre = diaNombreDesdeNumero(Number(item.DiaSemana), dias);
    if (!diaNombre) continue;

    row[diaNombre] = valueBuilder(item);
  }

  return rows;
}

async function getBloquesHorarios(pool: any, institucionId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT
        BloqueHorarioId,
        Nombre,
        HoraInicio,
        HoraFin,
        OrdenVisual
      FROM dbo.BloqueHorario
      WHERE InstitucionId = @institucionId
      ORDER BY OrdenVisual ASC, HoraInicio ASC
    `);

  return result.recordset;
}

async function getHorarioPorGrupo(params: {
  pool: any;
  institucionId: number;
  grupoId: number;
  anioLectivoId?: number | null;
  periodoId?: number | null;
}) {
  const { pool, institucionId, grupoId, anioLectivoId = null, periodoId = null } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("grupoId", sql.Int, grupoId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        hg.HorarioGrupoId,
        hg.BloqueHorarioId,
        hg.DiaSemana,
        bh.Nombre AS BloqueNombre,
        bh.HoraInicio,
        bh.HoraFin,
        bh.OrdenVisual,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.MateriaId,
        m.Nombre AS MateriaNombre,
        p.PeriodoId,
        p.Nombre AS PeriodoNombre,
        a.AnioLectivoId,
        a.Nombre AS AnioNombre,
        ad.UsuarioId AS DocenteUsuarioId,
        u.Nombre AS DocenteNombre,
        u.PrimerApellido AS DocentePrimerApellido,
        u.SegundoApellido AS DocenteSegundoApellido
      FROM dbo.HorarioGrupo hg
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
       AND g.Activo = 1
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
       AND m.Activa = 1
      INNER JOIN dbo.BloqueHorario bh
        ON bh.BloqueHorarioId = hg.BloqueHorarioId
      LEFT JOIN dbo.Periodo p
        ON p.PeriodoId = gm.PeriodoId
      LEFT JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = g.AnioLectivoId
      OUTER APPLY
      (
        SELECT TOP 1
          ad2.UsuarioId
        FROM dbo.AsignacionDocente ad2
        WHERE ad2.InstitucionId = @institucionId
          AND ad2.GrupoId = g.GrupoId
          AND ad2.Activo = 1
          AND ad2.TipoAsignacion = N'PROFESOR_MATERIA'
          AND ISNULL(ad2.MateriaId, 0) = ISNULL(m.MateriaId, 0)
          AND (
            ad2.PeriodoId = gm.PeriodoId
            OR ad2.PeriodoId IS NULL
          )
          AND (
            ad2.AnioLectivoId = g.AnioLectivoId
            OR ad2.AnioLectivoId IS NULL
          )
        ORDER BY
          CASE WHEN ad2.PeriodoId = gm.PeriodoId THEN 0 ELSE 1 END,
          ad2.AsignacionDocenteId DESC
      ) ad
      LEFT JOIN dbo.Usuario u
        ON u.UsuarioId = ad.UsuarioId
      WHERE g.InstitucionId = @institucionId
        AND g.GrupoId = @grupoId
        AND hg.Activo = 1
        AND (@anioLectivoId IS NULL OR g.AnioLectivoId = @anioLectivoId)
        AND (@periodoId IS NULL OR gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
      ORDER BY bh.OrdenVisual ASC, hg.DiaSemana ASC
    `);

  return result.recordset;
}

async function getHorarioPorProfesor(params: {
  pool: any;
  institucionId: number;
  usuarioId: number;
  anioLectivoId?: number | null;
  periodoId?: number | null;
}) {
  const { pool, institucionId, usuarioId, anioLectivoId = null, periodoId = null } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, usuarioId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .input("periodoId", sql.Int, periodoId)
    .query(`
      SELECT
        hg.HorarioGrupoId,
        hg.BloqueHorarioId,
        hg.DiaSemana,
        bh.Nombre AS BloqueNombre,
        bh.HoraInicio,
        bh.HoraFin,
        bh.OrdenVisual,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.MateriaId,
        m.Nombre AS MateriaNombre,
        p.PeriodoId,
        p.Nombre AS PeriodoNombre,
        a.AnioLectivoId,
        a.Nombre AS AnioNombre,
        u.UsuarioId,
        u.Nombre AS DocenteNombre,
        u.PrimerApellido AS DocentePrimerApellido,
        u.SegundoApellido AS DocenteSegundoApellido
      FROM dbo.HorarioDocente hd
      INNER JOIN dbo.Usuario u
        ON u.UsuarioId = hd.UsuarioId
       AND u.InstitucionId = @institucionId
       AND u.Activo = 1
      INNER JOIN dbo.HorarioGrupo hg
        ON hg.HorarioGrupoId = hd.HorarioGrupoId
       AND hg.Activo = 1
      INNER JOIN dbo.GrupoMateria gm
        ON gm.GrupoMateriaId = hg.GrupoMateriaId
       AND gm.Activo = 1
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = gm.GrupoId
       AND g.Activo = 1
       AND g.InstitucionId = @institucionId
      INNER JOIN dbo.Materia m
        ON m.MateriaId = gm.MateriaId
       AND m.Activa = 1
      INNER JOIN dbo.BloqueHorario bh
        ON bh.BloqueHorarioId = hg.BloqueHorarioId
      LEFT JOIN dbo.Periodo p
        ON p.PeriodoId = gm.PeriodoId
      LEFT JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = g.AnioLectivoId
      WHERE hd.UsuarioId = @usuarioId
        AND hd.Activo = 1
        AND (@anioLectivoId IS NULL OR g.AnioLectivoId = @anioLectivoId)
        AND (@periodoId IS NULL OR gm.PeriodoId = @periodoId)
      ORDER BY bh.OrdenVisual ASC, hg.DiaSemana ASC, g.Nombre ASC
    `);

  return result.recordset;
}

async function getGruposGuiaPorProfesor(params: {
  pool: any;
  institucionId: number;
  usuarioId: number;
  anioLectivoId?: number | null;
}) {
  const { pool, institucionId, usuarioId, anioLectivoId = null } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("usuarioId", sql.Int, usuarioId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .query(`
      SELECT DISTINCT
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        a.AnioLectivoId,
        a.Nombre AS AnioNombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = ad.GrupoId
       AND g.Activo = 1
      LEFT JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = g.AnioLectivoId
      WHERE ad.InstitucionId = @institucionId
        AND ad.UsuarioId = @usuarioId
        AND ad.Activo = 1
        AND ad.TipoAsignacion = N'PROFESOR_GUIA'
        AND (@anioLectivoId IS NULL OR ad.AnioLectivoId = @anioLectivoId)
      ORDER BY g.Nombre ASC
    `);

  return result.recordset;
}

async function getGrupoPorEstudiante(params: {
  pool: any;
  institucionId: number;
  estudianteId: number;
  anioLectivoId?: number | null;
}) {
  const { pool, institucionId, estudianteId, anioLectivoId = null } = params;

  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("estudianteId", sql.Int, estudianteId)
    .input("anioLectivoId", sql.Int, anioLectivoId)
    .query(`
      SELECT TOP 1
        e.EstudianteId,
        e.Identificacion,
        e.Nombre,
        e.PrimerApellido,
        e.SegundoApellido,
        g.GrupoId,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        a.AnioLectivoId,
        a.Nombre AS AnioNombre,
        m.MatriculaId
      FROM dbo.Matricula m
      INNER JOIN dbo.Estudiante e
        ON e.EstudianteId = m.EstudianteId
      INNER JOIN dbo.Grupo g
        ON g.GrupoId = m.GrupoId
      LEFT JOIN dbo.AnioLectivo a
        ON a.AnioLectivoId = m.AnioLectivoId
      WHERE e.InstitucionId = @institucionId
        AND e.EstudianteId = @estudianteId
        AND m.Estado = N'Activa'
        AND (@anioLectivoId IS NULL OR m.AnioLectivoId = @anioLectivoId)
      ORDER BY m.MatriculaId DESC
    `);

  return result.recordset[0] || null;
}

function formatTeacherName(item: any) {
  return [item.DocentePrimerApellido, item.DocenteSegundoApellido, item.DocenteNombre]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildSectionResponse(
  grupoInfo: any,
  bloques: any[],
  horarioItems: any[],
  dias: DiaLectivo[]
) {
  const rows = buildGridRows(
    bloques,
    horarioItems,
    dias,
    (item) => {
      const profesor = formatTeacherName(item);
      return profesor
        ? `${item.MateriaNombre}\n${profesor}`
        : `${item.MateriaNombre}`;
    }
  );

  return {
    vista: "seccion",
    encabezado: {
      grupoId: Number(grupoInfo?.GrupoId || 0),
      grupo: grupoInfo?.GrupoNombre || "",
      nivel: grupoInfo?.GrupoNivel || "",
      anioLectivoId: grupoInfo?.AnioLectivoId || null,
      anioLectivo: grupoInfo?.AnioNombre || "",
      periodoId: grupoInfo?.PeriodoId || null,
      periodo: grupoInfo?.PeriodoNombre || ""
    },
    dias,
    filas: rows,
    detalles: horarioItems
  };
}

function buildTeacherResponse(
  docenteInfo: any,
  bloques: any[],
  horarioItems: any[],
  dias: DiaLectivo[]
) {
  const rows = buildGridRows(
    bloques,
    horarioItems,
    dias,
    (item) => `${item.GrupoNombre}${item.GrupoNivel ? ` - ${item.GrupoNivel}` : ""}\n${item.MateriaNombre}`
  );

  return {
    vista: "docente",
    encabezado: {
      usuarioId: Number(docenteInfo?.UsuarioId || 0),
      docente:
        [docenteInfo?.DocentePrimerApellido, docenteInfo?.DocenteSegundoApellido, docenteInfo?.DocenteNombre]
          .filter(Boolean)
          .join(" ")
          .trim(),
      anioLectivoId: docenteInfo?.AnioLectivoId || null,
      anioLectivo: docenteInfo?.AnioNombre || "",
      periodoId: docenteInfo?.PeriodoId || null,
      periodo: docenteInfo?.PeriodoNombre || ""
    },
    dias,
    filas: rows,
    detalles: horarioItems
  };
}

/* =========================================================
   MI HORARIO
   ========================================================= */
router.get("/mi-horario", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    const usuarioId = getUserId(req, res);
    if (institucionId === null || usuarioId === null) return;

    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;

    const pool = await getPool();
    const dias = await getDiasLectivos(pool, institucionId);
    const bloques = await getBloquesHorarios(pool, institucionId);
    const horarioItems = await getHorarioPorProfesor({
      pool,
      institucionId,
      usuarioId,
      anioLectivoId,
      periodoId
    });

    const authAny = req.auth as any;

const docenteInfo = horarioItems[0] || {
  UsuarioId: usuarioId,
  DocenteNombre: authAny?.nombre || "",
  DocentePrimerApellido: authAny?.primerApellido || "",
  DocenteSegundoApellido: authAny?.segundoApellido || "",
  AnioLectivoId: anioLectivoId,
  AnioNombre: "",
  PeriodoId: periodoId,
  PeriodoNombre: ""
};

    return ok(res, buildTeacherResponse(docenteInfo, bloques, horarioItems, dias));
  } catch (error) {
    console.error("Error al consultar mi horario:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al consultar mi horario"
    });
  }
});

/* =========================================================
   MIS GRUPOS GUIA
   ========================================================= */
router.get("/mis-grupos-guia", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    const usuarioId = getUserId(req, res);
    if (institucionId === null || usuarioId === null) return;

    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;

    const pool = await getPool();
    const dias = await getDiasLectivos(pool, institucionId);
    const bloques = await getBloquesHorarios(pool, institucionId);
    const grupos = await getGruposGuiaPorProfesor({
      pool,
      institucionId,
      usuarioId,
      anioLectivoId
    });

    const resultado: any[] = [];

    for (const grupo of grupos) {
      const horarioItems = await getHorarioPorGrupo({
        pool,
        institucionId,
        grupoId: Number(grupo.GrupoId),
        anioLectivoId,
        periodoId
      });

      resultado.push(buildSectionResponse(
        {
          GrupoId: grupo.GrupoId,
          GrupoNombre: grupo.GrupoNombre,
          GrupoNivel: grupo.GrupoNivel,
          AnioLectivoId: grupo.AnioLectivoId,
          AnioNombre: grupo.AnioNombre,
          PeriodoId: periodoId,
          PeriodoNombre: horarioItems[0]?.PeriodoNombre || ""
        },
        bloques,
        horarioItems,
        dias
      ));
    }

    return ok(res, {
      vista: "mis-grupos-guia",
      totalGrupos: resultado.length,
      grupos: resultado
    });
  } catch (error) {
    console.error("Error al consultar mis grupos guía:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al consultar mis grupos guía"
    });
  }
});

/* =========================================================
   HORARIO POR SECCION
   ========================================================= */
router.get("/seccion/:grupoId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const grupoId = Number(req.params.grupoId);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;

    if (!isValidNonNegativeId(grupoId)) {
      return badRequest(res, "GrupoId inválido");
    }

    const pool = await getPool();
    const dias = await getDiasLectivos(pool, institucionId);
    const bloques = await getBloquesHorarios(pool, institucionId);
    const horarioItems = await getHorarioPorGrupo({
      pool,
      institucionId,
      grupoId,
      anioLectivoId,
      periodoId
    });

    if (!horarioItems.length) {
      return ok(res, buildSectionResponse(
        {
          GrupoId: grupoId,
          GrupoNombre: "",
          GrupoNivel: "",
          AnioLectivoId: anioLectivoId,
          AnioNombre: "",
          PeriodoId: periodoId,
          PeriodoNombre: ""
        },
        bloques,
        [],
        dias
      ));
    }

    return ok(res, buildSectionResponse(
      {
        GrupoId: horarioItems[0].GrupoId,
        GrupoNombre: horarioItems[0].GrupoNombre,
        GrupoNivel: horarioItems[0].GrupoNivel,
        AnioLectivoId: horarioItems[0].AnioLectivoId,
        AnioNombre: horarioItems[0].AnioNombre,
        PeriodoId: horarioItems[0].PeriodoId,
        PeriodoNombre: horarioItems[0].PeriodoNombre
      },
      bloques,
      horarioItems,
      dias
    ));
  } catch (error) {
    console.error("Error al consultar horario por sección:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al consultar horario por sección"
    });
  }
});

/* =========================================================
   HORARIO POR DOCENTE
   ========================================================= */
router.get("/docente/:usuarioId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const usuarioId = Number(req.params.usuarioId);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;

    if (!isValidNonNegativeId(usuarioId)) {
      return badRequest(res, "UsuarioId inválido");
    }

    const pool = await getPool();
    const dias = await getDiasLectivos(pool, institucionId);
    const bloques = await getBloquesHorarios(pool, institucionId);
    const horarioItems = await getHorarioPorProfesor({
      pool,
      institucionId,
      usuarioId,
      anioLectivoId,
      periodoId
    });

    if (!horarioItems.length) {
      return ok(res, buildTeacherResponse(
        {
          UsuarioId: usuarioId,
          DocenteNombre: "",
          DocentePrimerApellido: "",
          DocenteSegundoApellido: "",
          AnioLectivoId: anioLectivoId,
          AnioNombre: "",
          PeriodoId: periodoId,
          PeriodoNombre: ""
        },
        bloques,
        [],
        dias
      ));
    }

    return ok(res, buildTeacherResponse(horarioItems[0], bloques, horarioItems, dias));
  } catch (error) {
    console.error("Error al consultar horario por docente:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al consultar horario por docente"
    });
  }
});

/* =========================================================
   HORARIO POR ESTUDIANTE
   ========================================================= */
router.get("/estudiante/:estudianteId", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const estudianteId = Number(req.params.estudianteId);
    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;

    if (!isValidNonNegativeId(estudianteId)) {
      return badRequest(res, "EstudianteId inválido");
    }

    const pool = await getPool();
    const estudianteGrupo = await getGrupoPorEstudiante({
      pool,
      institucionId,
      estudianteId,
      anioLectivoId
    });

    if (!estudianteGrupo) {
      return res.status(404).json({
        ok: false,
        message: "No se encontró una matrícula activa para el estudiante"
      });
    }

    const dias = await getDiasLectivos(pool, institucionId);
    const bloques = await getBloquesHorarios(pool, institucionId);
    const horarioItems = await getHorarioPorGrupo({
      pool,
      institucionId,
      grupoId: Number(estudianteGrupo.GrupoId),
      anioLectivoId: estudianteGrupo.AnioLectivoId || anioLectivoId,
      periodoId
    });

    return ok(res, {
      vista: "estudiante",
      estudiante: {
        estudianteId: estudianteGrupo.EstudianteId,
        identificacion: estudianteGrupo.Identificacion,
        nombre: [estudianteGrupo.PrimerApellido, estudianteGrupo.SegundoApellido, estudianteGrupo.Nombre]
          .filter(Boolean)
          .join(" ")
          .trim()
      },
      horario: buildSectionResponse(
        {
          GrupoId: estudianteGrupo.GrupoId,
          GrupoNombre: estudianteGrupo.GrupoNombre,
          GrupoNivel: estudianteGrupo.GrupoNivel,
          AnioLectivoId: estudianteGrupo.AnioLectivoId,
          AnioNombre: estudianteGrupo.AnioNombre,
          PeriodoId: periodoId,
          PeriodoNombre: horarioItems[0]?.PeriodoNombre || ""
        },
        bloques,
        horarioItems,
        dias
      )
    });
  } catch (error) {
    console.error("Error al consultar horario por estudiante:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al consultar horario por estudiante"
    });
  }
});

/* =========================================================
   BUSQUEDA ADMINISTRATIVA
   ========================================================= */
router.get("/busqueda", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const anioLectivoId = req.query.anioLectivoId ? Number(req.query.anioLectivoId) : null;
    const periodoId = req.query.periodoId ? Number(req.query.periodoId) : null;
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;
    const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : null;
    const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
    const alumno = String(req.query.alumno || "").trim();
    const profesor = String(req.query.profesor || "").trim();

    const pool = await getPool();

    if (isValidNonNegativeId(grupoId)) {
      const dias = await getDiasLectivos(pool, institucionId);
      const bloques = await getBloquesHorarios(pool, institucionId);
      const horarioItems = await getHorarioPorGrupo({
        pool,
        institucionId,
        grupoId: Number(grupoId),
        anioLectivoId,
        periodoId
      });

      return ok(res, {
        tipo: "seccion",
        resultado: buildSectionResponse(
          {
            GrupoId: horarioItems[0]?.GrupoId || grupoId,
            GrupoNombre: horarioItems[0]?.GrupoNombre || "",
            GrupoNivel: horarioItems[0]?.GrupoNivel || "",
            AnioLectivoId: horarioItems[0]?.AnioLectivoId || anioLectivoId,
            AnioNombre: horarioItems[0]?.AnioNombre || "",
            PeriodoId: horarioItems[0]?.PeriodoId || periodoId,
            PeriodoNombre: horarioItems[0]?.PeriodoNombre || ""
          },
          bloques,
          horarioItems,
          dias
        )
      });
    }

    if (isValidNonNegativeId(usuarioId)) {
      const dias = await getDiasLectivos(pool, institucionId);
      const bloques = await getBloquesHorarios(pool, institucionId);
      const horarioItems = await getHorarioPorProfesor({
        pool,
        institucionId,
        usuarioId: Number(usuarioId),
        anioLectivoId,
        periodoId
      });

      return ok(res, {
        tipo: "docente",
        resultado: buildTeacherResponse(
          horarioItems[0] || {
            UsuarioId: usuarioId,
            DocenteNombre: "",
            DocentePrimerApellido: "",
            DocenteSegundoApellido: "",
            AnioLectivoId: anioLectivoId,
            AnioNombre: "",
            PeriodoId: periodoId,
            PeriodoNombre: ""
          },
          bloques,
          horarioItems,
          dias
        )
      });
    }

    if (isValidNonNegativeId(estudianteId)) {
      const estudianteGrupo = await getGrupoPorEstudiante({
        pool,
        institucionId,
        estudianteId: Number(estudianteId),
        anioLectivoId
      });

      if (!estudianteGrupo) {
        return res.status(404).json({
          ok: false,
          message: "No se encontró matrícula activa para ese estudiante"
        });
      }

      const dias = await getDiasLectivos(pool, institucionId);
      const bloques = await getBloquesHorarios(pool, institucionId);
      const horarioItems = await getHorarioPorGrupo({
        pool,
        institucionId,
        grupoId: Number(estudianteGrupo.GrupoId),
        anioLectivoId: estudianteGrupo.AnioLectivoId || anioLectivoId,
        periodoId
      });

      return ok(res, {
        tipo: "estudiante",
        resultado: {
          estudiante: {
            estudianteId: estudianteGrupo.EstudianteId,
            identificacion: estudianteGrupo.Identificacion,
            nombre: [estudianteGrupo.PrimerApellido, estudianteGrupo.SegundoApellido, estudianteGrupo.Nombre]
              .filter(Boolean)
              .join(" ")
              .trim()
          },
          horario: buildSectionResponse(
            {
              GrupoId: estudianteGrupo.GrupoId,
              GrupoNombre: estudianteGrupo.GrupoNombre,
              GrupoNivel: estudianteGrupo.GrupoNivel,
              AnioLectivoId: estudianteGrupo.AnioLectivoId,
              AnioNombre: estudianteGrupo.AnioNombre,
              PeriodoId: periodoId,
              PeriodoNombre: horarioItems[0]?.PeriodoNombre || ""
            },
            bloques,
            horarioItems,
            dias
          )
        }
      });
    }

    if (alumno) {
      const alumnos = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("alumno", sql.NVarChar, `%${alumno}%`)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .query(`
          SELECT TOP 20
            e.EstudianteId,
            e.Identificacion,
            e.Nombre,
            e.PrimerApellido,
            e.SegundoApellido,
            e.Adecuacion AS TipoAdecuacion,
            g.GrupoId,
            g.Nombre AS GrupoNombre,
            g.Nivel AS GrupoNivel,
            m.MatriculaId
          FROM dbo.Matricula m
          INNER JOIN dbo.Estudiante e
            ON e.EstudianteId = m.EstudianteId
          INNER JOIN dbo.Grupo g
            ON g.GrupoId = m.GrupoId
          WHERE e.InstitucionId = @institucionId
            AND m.Estado = N'Activa'
            AND (@anioLectivoId IS NULL OR m.AnioLectivoId = @anioLectivoId)
            AND (
              e.Identificacion LIKE @alumno
              OR e.Nombre LIKE @alumno
              OR e.PrimerApellido LIKE @alumno
              OR e.SegundoApellido LIKE @alumno
              OR (e.Nombre + ' ' + ISNULL(e.PrimerApellido, '') + ' ' + ISNULL(e.SegundoApellido, '')) LIKE @alumno
              OR (ISNULL(e.PrimerApellido, '') + ' ' + ISNULL(e.SegundoApellido, '') + ' ' + e.Nombre) LIKE @alumno
            )
          ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
        `);

      return ok(res, {
        tipo: "busqueda-alumno",
        resultados: alumnos.recordset
      });
    }

    if (profesor) {
      const docentes = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("profesor", sql.NVarChar, `%${profesor}%`)
        .query(`
          SELECT DISTINCT TOP 20
            u.UsuarioId,
            u.Correo,
            u.Nombre,
            u.PrimerApellido,
            u.SegundoApellido
          FROM dbo.Usuario u
          INNER JOIN dbo.AsignacionDocente ad
            ON ad.UsuarioId = u.UsuarioId
           AND ad.Activo = 1
          WHERE u.InstitucionId = @institucionId
            AND (
              u.Correo LIKE @profesor
              OR u.Nombre LIKE @profesor
              OR u.PrimerApellido LIKE @profesor
              OR u.SegundoApellido LIKE @profesor
              OR (u.Nombre + ' ' + ISNULL(u.PrimerApellido, '') + ' ' + ISNULL(u.SegundoApellido, '')) LIKE @profesor
              OR (ISNULL(u.PrimerApellido, '') + ' ' + ISNULL(u.SegundoApellido, '') + ' ' + u.Nombre) LIKE @profesor
            )
          ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre
        `);

      return ok(res, {
        tipo: "busqueda-profesor",
        resultados: docentes.recordset
      });
    }

    return badRequest(
      res,
      "Debés enviar grupoId, usuarioId, estudianteId, alumno o profesor para realizar la búsqueda"
    );
  } catch (error) {
    console.error("Error en búsqueda administrativa de horarios:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al realizar la búsqueda de horarios"
    });
  }
});

export default router;
