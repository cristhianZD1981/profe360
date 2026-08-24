import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest, forbidden } from "../../utils/http";

const router = Router();
const BOOTSTRAP_CACHE_TTL_MS = 10000;
const bootstrapCache = new Map<string, { at: number; data: any }>();
const bootstrapInFlight = new Map<string, Promise<any>>();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

type AuthUser = {
  usuarioId?: number;
  userId?: number;
  institucionId?: number | null;
  roles: string[];
};

function getAuth(req: any): AuthUser {
  return req.auth || { roles: [] };
}

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return auth.roles?.some((role) => roles.includes(role));
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

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.usuarioId || auth.userId || 0);
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

function toNumber(value: any, fieldName: string, res: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    badRequest(res, `El campo ${fieldName} es inválido`);
    return null;
  }
  return parsed;
}

function toOptionalNumber(value: any) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function toBooleanFlag(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = normalizeText(value).toUpperCase();
  return normalized === "1" || normalized === "TRUE" || normalized === "SI" || normalized === "S";
}

function normalizeEstado(value: any) {
  const estado = normalizeText(value || "BORRADOR").toUpperCase();
  return ["BORRADOR", "ACTIVA", "INACTIVA"].includes(estado) ? estado : "BORRADOR";
}

function normalizeTipoSeguimiento(value: any) {
  const tipo = normalizeText(value);
  if (!tipo) return null;
  if (tipo === "Cotidiano" || tipo === "Tareas" || tipo === "Asistencia") return tipo;
  return null;
}

async function ensureEvaluacionComponentePlaneamientoColumns(pool: any) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'PermitirProfesorEditar') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionPlantilla
      ADD PermitirProfesorEditar BIT NOT NULL CONSTRAINT DF_EvaluacionPlantilla_PermitirProfesorEditar DEFAULT(0);
    END;

    IF COL_LENGTH('dbo.EvaluacionComponente', 'PermitePlaneamiento') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionComponente
      ADD PermitePlaneamiento BIT NOT NULL CONSTRAINT DF_EvaluacionComponente_PermitePlaneamiento DEFAULT(0);
    END;

    IF COL_LENGTH('dbo.EvaluacionComponente', 'TipoSeguimiento') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionComponente
      ADD TipoSeguimiento NVARCHAR(40) NULL;
    END;

    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionPlantilla
      ADD UsuarioCreadorId INT NULL;
    END;

    IF COL_LENGTH('dbo.EvaluacionPlantilla', 'EsPublica') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionPlantilla
      ADD EsPublica BIT NOT NULL CONSTRAINT DF_EvaluacionPlantilla_EsPublica DEFAULT(1);
    END;

    IF COL_LENGTH('dbo.EvaluacionActividad', 'UsaIndicadoresPlaneamiento') IS NULL
    BEGIN
      ALTER TABLE dbo.EvaluacionActividad
      ADD UsaIndicadoresPlaneamiento BIT NOT NULL CONSTRAINT DF_EvaluacionActividad_UsaIndicadoresPlaneamiento DEFAULT(0);
    END;
  `);
}

const CICLOS_EVALUACION_PERMITIDOS = ["Primer Ciclo", "Segundo Ciclo", "Tercer Ciclo", "Cuarto Ciclo"];

function normalizeForCompare(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

async function resolveMateriaEvaluacionId(pool: any, institucionId: number, materiaIdRaw: any, cicloEvaluacionRaw: any, res: any) {
  const materiaId = toOptionalNumber(materiaIdRaw);
  if (materiaId !== null) return materiaId;

  const cicloEvaluacion = CICLOS_EVALUACION_PERMITIDOS.find(
    (item) => normalizeForCompare(item) === normalizeForCompare(cicloEvaluacionRaw)
  );

  if (!cicloEvaluacion) {
    badRequest(res, "Debe seleccionar un ciclo válido para la plantilla de evaluación");
    return null;
  }

  const existente = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("nombre", sql.NVarChar(100), cicloEvaluacion)
    .query(`
      SELECT TOP 1 MateriaId
      FROM dbo.Materia
      WHERE (InstitucionId = @institucionId OR EsGlobal = 1)
        AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
    `);

  if (existente.recordset.length) {
    return Number(existente.recordset[0].MateriaId);
  }

  const codigo = normalizeForCompare(cicloEvaluacion).replace(/\s+/g, "_");

  const creada = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("codigo", sql.NVarChar(50), codigo)
    .input("nombre", sql.NVarChar(100), cicloEvaluacion)
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
      OUTPUT INSERTED.MateriaId
      VALUES
      (
        @institucionId,
        @codigo,
        @nombre,
        N'Ciclo usado para parametrización de evaluación',
        1,
        SYSDATETIME()
      )
    `);

  return Number(creada.recordset[0].MateriaId);
}


function validatePercent(value: any, fieldName: string, res: any) {
  const number = toNumber(value, fieldName, res);
  if (number === null) return null;
  if (number < 0 || number > 100) {
    badRequest(res, `${fieldName} debe estar entre 0 y 100`);
    return null;
  }
  return number;
}

async function assertProfesorAsignado(pool: any, req: any, materiaId: number, anioLectivoId?: number | null) {
  const auth = getAuth(req);
  if (!isProfesor(req)) return true;
  if (!auth.usuarioId) return false;

  const request = pool.request()
    .input("usuarioId", sql.Int, Number(auth.usuarioId))
    .input("materiaId", sql.Int, materiaId);

  let filtroAnio = "";
  if (anioLectivoId) {
    request.input("anioLectivoId", sql.Int, Number(anioLectivoId));
    filtroAnio = " AND ad.AnioLectivoId = @anioLectivoId";
  }

  const result = await request.query(`
    SELECT TOP 1 ad.AsignacionDocenteId
    FROM dbo.AsignacionDocente ad
    WHERE ad.UsuarioId = @usuarioId
      AND ad.MateriaId = @materiaId
      AND ad.Activo = 1
      ${filtroAnio}
  `);

  return result.recordset.length > 0;
}

async function getPlantillaHeader(pool: any, plantillaId: number) {
  const result = await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      SELECT TOP 1
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        ep.AnioLectivoId,
        ep.PeriodoId,
        ep.MateriaId,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo
      FROM dbo.EvaluacionPlantilla ep
      WHERE ep.EvaluacionPlantillaId = @plantillaId
    `);

  return result.recordset[0] || null;
}

async function canReadPlantilla(pool: any, req: any, plantilla: any) {
  if (!plantilla) return false;
  if (isSuperAdmin(req)) return true;

  const institucionId = getAuth(req).institucionId;
  if (Number(plantilla.InstitucionId) !== Number(institucionId)) return false;
  if (isInstitutionAdmin(req)) return true;

  if (!isProfesor(req)) return false;

  const esPropia = Number(plantilla.UsuarioCreadorId || 0) > 0 && Number(plantilla.UsuarioCreadorId) === getUserId(req);
  return Boolean(plantilla.EsPublica) || esPropia;
}

async function canWritePlantilla(pool: any, req: any, plantilla: any) {
  if (!plantilla) return false;
  if (isSuperAdmin(req)) return true;

  const institucionId = getAuth(req).institucionId;
  if (Number(plantilla.InstitucionId) !== Number(institucionId)) return false;
  if (isInstitutionAdmin(req)) return true;

  if (!isProfesor(req)) return false;
  return Number(plantilla.UsuarioCreadorId || 0) > 0 && Number(plantilla.UsuarioCreadorId) === getUserId(req);
}

async function getPlantillaDetalle(pool: any, plantillaId: number) {
  const plantillaResult = await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      SELECT
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        ep.AnioLectivoId,
        ep.PeriodoId,
        ep.MateriaId,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo,
        ep.CreatedAt,
        ep.UpdatedAt,
        al.Nombre AS AnioNombre,
        p.Nombre AS PeriodoNombre,
        m.Nombre AS MateriaNombre
      FROM dbo.EvaluacionPlantilla ep
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId
      INNER JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId
      INNER JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId
      WHERE ep.EvaluacionPlantillaId = @plantillaId
    `);

  const plantilla = plantillaResult.recordset[0] || null;
  if (!plantilla) return null;

  await ensureEvaluacionComponentePlaneamientoColumns(pool);

  const componentesResult = await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      SELECT
        EvaluacionComponenteId,
        EvaluacionPlantillaId,
        Descripcion,
        Porcentaje,
        Orden,
        Activo,
        ISNULL(PermitePlaneamiento, 0) AS PermitePlaneamiento,
        TipoSeguimiento,
        CreatedAt,
        UpdatedAt
      FROM dbo.EvaluacionComponente
      WHERE EvaluacionPlantillaId = @plantillaId
        AND Activo = 1
      ORDER BY Orden, EvaluacionComponenteId
    `);

  const actividadesResult = await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      SELECT
        ea.EvaluacionActividadId,
        ea.EvaluacionComponenteId,
        ea.Descripcion,
        ea.Porcentaje,
        ISNULL(ea.UsaIndicadoresPlaneamiento, 0) AS UsaIndicadoresPlaneamiento,
        ea.Fecha,
        ea.Orden,
        ea.Activo,
        ea.CreatedAt,
        ea.UpdatedAt
      FROM dbo.EvaluacionActividad ea
      INNER JOIN dbo.EvaluacionComponente ec
        ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
      WHERE ec.EvaluacionPlantillaId = @plantillaId
        AND ec.Activo = 1
        AND ea.Activo = 1
      ORDER BY ea.Orden, ea.EvaluacionActividadId
    `);

  const actividadesPorComponente = new Map<number, any[]>();
  for (const actividad of actividadesResult.recordset) {
    const key = Number(actividad.EvaluacionComponenteId);
    const list = actividadesPorComponente.get(key) || [];
    list.push(actividad);
    actividadesPorComponente.set(key, list);
  }

  const componentes = componentesResult.recordset.map((componente: any) => ({
    ...componente,
    Actividades: actividadesPorComponente.get(Number(componente.EvaluacionComponenteId)) || []
  }));

  const totalComponentes = componentes
    .filter((item: any) => item.Activo)
    .reduce((total: number, item: any) => total + Number(item.Porcentaje || 0), 0);

  return {
    ...plantilla,
    TotalComponentes: Number(totalComponentes.toFixed(2)),
    Componentes: componentes
  };
}

async function validarSumaComponentes(pool: any, plantillaId: number) {
  const result = await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      SELECT ISNULL(SUM(Porcentaje), 0) AS Total
      FROM dbo.EvaluacionComponente
      WHERE EvaluacionPlantillaId = @plantillaId
        AND Activo = 1
    `);

  return Number(result.recordset[0]?.Total || 0);
}

async function validarSumaActividades(pool: any, componenteId: number) {
  const result = await pool.request()
    .input("componenteId", sql.Int, componenteId)
    .query(`
      SELECT ISNULL(SUM(Porcentaje), 0) AS Total
      FROM dbo.EvaluacionActividad
      WHERE EvaluacionComponenteId = @componenteId
        AND Activo = 1
    `);

  return Number(result.recordset[0]?.Total || 0);
}

async function validarTopeActividadesComponente(
  pool: any,
  componenteId: number,
  porcentajeNuevo: number,
  actividadIdExcluir?: number | null
) {
  const request = pool.request()
    .input("componenteId", sql.Int, componenteId)
    .input("actividadIdExcluir", sql.Int, actividadIdExcluir ?? null);

  const result = await request.query(`
      SELECT ISNULL(SUM(Porcentaje), 0) AS TotalActual
      FROM dbo.EvaluacionActividad
      WHERE EvaluacionComponenteId = @componenteId
        AND Activo = 1
        AND (@actividadIdExcluir IS NULL OR EvaluacionActividadId <> @actividadIdExcluir)
    `);

  const totalActual = Number(result.recordset[0]?.TotalActual || 0);
  const totalPropuesto = Number((totalActual + Number(porcentajeNuevo || 0)).toFixed(2));
  return {
    totalActual,
    totalPropuesto,
    excede: totalPropuesto > 100
  };
}

async function marcarPlantillaComoBorrador(pool: any, plantillaId: number) {
  await pool.request()
    .input("plantillaId", sql.Int, plantillaId)
    .query(`
      UPDATE dbo.EvaluacionPlantilla
      SET Estado = N'BORRADOR',
          UpdatedAt = SYSDATETIME()
      WHERE EvaluacionPlantillaId = @plantillaId
    `);
}

/* =========================================================
   CATÁLOGOS PARA PARAMETRIZACIÓN
   ========================================================= */
router.get("/catalogos", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = isSuperAdmin(req)
      ? toOptionalNumber(req.query.institucionId)
      : getInstitutionId(req, res);

    if (institucionId === null) return;
    const cacheKey = `evaluacion.catalogos|inst:${institucionId}`;
    const cached = bootstrapCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= BOOTSTRAP_CACHE_TTL_MS) {
      return ok(res, cached.data);
    }
    const inFlight = bootstrapInFlight.get(cacheKey);
    if (inFlight) {
      const shared = await inFlight;
      return ok(res, shared);
    }

    const loadPromise = (async () => {
      const requestBase = () => pool.request().input("institucionId", sql.Int, institucionId);

      const [anios, periodos, materias, niveles] = await Promise.all([
        requestBase().query(`
          SELECT AnioLectivoId, Nombre, FechaInicio, FechaFin, Activo
          FROM dbo.AnioLectivo
          WHERE InstitucionId = @institucionId AND Activo = 1
          ORDER BY FechaInicio DESC, Nombre
        `),
        requestBase().query(`
          SELECT p.PeriodoId, p.AnioLectivoId, p.Nombre, p.NumeroOrden, p.FechaInicio, p.FechaFin, p.Activo, al.Nombre AS AnioNombre
          FROM dbo.Periodo p
          INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = p.AnioLectivoId
          WHERE al.InstitucionId = @institucionId AND p.Activo = 1
          ORDER BY al.FechaInicio DESC, p.NumeroOrden, p.Nombre
        `),
        requestBase().query(`
          SELECT MateriaId, Codigo, Nombre, Descripcion, Activa AS Activo
          FROM dbo.Materia
          WHERE InstitucionId = @institucionId AND Activa = 1
          ORDER BY Nombre
        `),
        requestBase().query(`
          SELECT NivelDesempenoId, Descripcion, Valor, Activo
          FROM dbo.NivelDesempeno
          WHERE InstitucionId = @institucionId AND Activo = 1
          ORDER BY Valor, Descripcion
        `)
      ]);

      return {
        aniosLectivos: anios.recordset,
        periodos: periodos.recordset,
        materias: materias.recordset,
        nivelesDesempeno: niveles.recordset
      };
    })();
    bootstrapInFlight.set(cacheKey, loadPromise);
    let data: any;
    try {
      data = await loadPromise;
    } finally {
      bootstrapInFlight.delete(cacheKey);
    }
    bootstrapCache.set(cacheKey, { at: Date.now(), data });
    return ok(res, data);
  } catch (error) {
    console.error("Error cargando catálogos de evaluación:", error);
    return res.status(500).json({ ok: false, message: "Error interno al cargar catálogos de evaluación" });
  }
});

/* =========================================================
   NIVELES DE DESEMPEÑO
   ========================================================= */
router.get("/niveles-desempeno", async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = isSuperAdmin(req)
      ? toOptionalNumber(req.query.institucionId)
      : getInstitutionId(req, res);
    if (institucionId === null) return;

    const incluirInactivos = String(req.query.incluirInactivos || "false") === "true";
    const q = normalizeText(req.query.q);
    const cacheKey = `evaluacion.niveles|inst:${institucionId}|inact:${incluirInactivos ? 1 : 0}|q:${q.toLowerCase()}`;
    const cached = bootstrapCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= BOOTSTRAP_CACHE_TTL_MS) {
      return ok(res, cached.data);
    }
    const inFlight = bootstrapInFlight.get(cacheKey);
    if (inFlight) {
      const shared = await inFlight;
      return ok(res, shared);
    }

    const loadPromise = (async () => {
      const result = await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("q", sql.NVarChar(150), `%${q}%`)
        .query(`
          SELECT NivelDesempenoId, InstitucionId, Descripcion, Valor, Activo, CreatedAt, UpdatedAt
          FROM dbo.NivelDesempeno
          WHERE InstitucionId = @institucionId
            AND (@q = N'%%' OR Descripcion LIKE @q)
            ${incluirInactivos ? "" : "AND Activo = 1"}
          ORDER BY Valor, Descripcion
        `);
      return result.recordset;
    })();
    bootstrapInFlight.set(cacheKey, loadPromise);
    let rows: any[] = [];
    try {
      rows = await loadPromise;
    } finally {
      bootstrapInFlight.delete(cacheKey);
    }
    bootstrapCache.set(cacheKey, { at: Date.now(), data: rows });

    return ok(res, rows);
  } catch (error) {
    console.error("Error listando niveles de desempeño:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los niveles de desempeño" });
  }
});

router.post("/niveles-desempeno", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const pool = await getPool();
    const institucionId = isSuperAdmin(req)
      ? toOptionalNumber(req.body.institucionId)
      : getInstitutionId(req, res);
    if (institucionId === null) return;

    const descripcion = normalizeText(req.body.descripcion);
    const valor = toNumber(req.body.valor, "valor", res);
    if (valor === null) return;
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("valor", sql.Decimal(10, 2), valor)
      .query(`
        INSERT INTO dbo.NivelDesempeno (InstitucionId, Descripcion, Valor, Activo)
        OUTPUT INSERTED.*
        VALUES (@institucionId, @descripcion, @valor, 1)
      `);

    return created(res, result.recordset[0], "Nivel de desempeño creado correctamente");
  } catch (error) {
    console.error("Error creando nivel de desempeño:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear el nivel de desempeño" });
  }
});

router.put("/niveles-desempeno/:id", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const pool = await getPool();
    const id = Number(req.params.id);
    const institucionId = isSuperAdmin(req) ? null : getInstitutionId(req, res);
    if (!isSuperAdmin(req) && institucionId === null) return;

    const descripcion = normalizeText(req.body.descripcion);
    const valor = toNumber(req.body.valor, "valor", res);
    if (valor === null) return;
    if (!descripcion) return badRequest(res, "La descripción es obligatoria");

    const request = pool.request()
      .input("id", sql.Int, id)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("valor", sql.Decimal(10, 2), valor);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND InstitucionId = @institucionId";
    }

    const result = await request.query(`
      UPDATE dbo.NivelDesempeno
      SET Descripcion = @descripcion,
          Valor = @valor,
          UpdatedAt = SYSDATETIME()
      OUTPUT INSERTED.*
      WHERE NivelDesempenoId = @id
        ${filtroInstitucion}
    `);

    if (!result.recordset.length) return res.status(404).json({ ok: false, message: "Nivel de desempeño no encontrado" });
    return ok(res, result.recordset[0], "Nivel de desempeño actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando nivel de desempeño:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el nivel de desempeño" });
  }
});

router.delete("/niveles-desempeno/:id", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const pool = await getPool();
    const id = Number(req.params.id);
    const institucionId = isSuperAdmin(req) ? null : getInstitutionId(req, res);
    if (!isSuperAdmin(req) && institucionId === null) return;

    const request = pool.request().input("id", sql.Int, id);
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND InstitucionId = @institucionId";
    }

    await request.query(`
      UPDATE dbo.NivelDesempeno
      SET Activo = 0, UpdatedAt = SYSDATETIME()
      WHERE NivelDesempenoId = @id ${filtroInstitucion}
    `);

    return ok(res, null, "Nivel de desempeño desactivado correctamente");
  } catch (error) {
    console.error("Error desactivando nivel de desempeño:", error);
    return res.status(500).json({ ok: false, message: "No se pudo desactivar el nivel de desempeño" });
  }
});

router.patch("/niveles-desempeno/:id/reactivar", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const pool = await getPool();
    const id = Number(req.params.id);
    const institucionId = isSuperAdmin(req) ? null : getInstitutionId(req, res);
    if (!isSuperAdmin(req) && institucionId === null) return;

    const request = pool.request().input("id", sql.Int, id);
    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND InstitucionId = @institucionId";
    }

    await request.query(`
      UPDATE dbo.NivelDesempeno
      SET Activo = 1, UpdatedAt = SYSDATETIME()
      WHERE NivelDesempenoId = @id ${filtroInstitucion}
    `);

    return ok(res, null, "Nivel de desempeño reactivado correctamente");
  } catch (error) {
    console.error("Error reactivando nivel de desempeño:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reactivar el nivel de desempeño" });
  }
});

/* =========================================================
   PLANTILLAS DE EVALUACIÓN
   ========================================================= */
router.get("/plantillas", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);
    const auth = getAuth(req);
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";
    const q = normalizeText(req.query.q);
    const anioLectivoId = toOptionalNumber(req.query.anioLectivoId);
    const periodoId = toOptionalNumber(req.query.periodoId);
    const materiaId = toOptionalNumber(req.query.materiaId);

    const request = pool.request()
      .input("q", sql.NVarChar(200), `%${q}%`)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("usuarioId", sql.Int, getUserId(req) || 0);

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitutionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND (ep.InstitucionId = @institucionId OR ISNULL(ep.EsPublica, 1) = 1)";
    } else if (toOptionalNumber(req.query.institucionId)) {
      request.input("institucionId", sql.Int, toOptionalNumber(req.query.institucionId));
      filtroInstitucion = "AND ep.InstitucionId = @institucionId";
    }

    const filtroProfesor = isProfesor(req) && !isInstitutionAdmin(req) && !isSuperAdmin(req)
      ? "AND (ISNULL(ep.EsPublica, 1) = 1 OR ep.UsuarioCreadorId = @usuarioId)"
      : "";

    const result = await request.query(`
      SELECT
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        i.Nombre AS InstitucionNombre,
        ep.AnioLectivoId,
        al.Nombre AS AnioNombre,
        ep.PeriodoId,
        p.Nombre AS PeriodoNombre,
        ep.MateriaId,
        m.Nombre AS MateriaNombre,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo,
        ISNULL(SUM(CASE WHEN ec.Activo = 1 THEN ec.Porcentaje ELSE 0 END), 0) AS TotalComponentes
      FROM dbo.EvaluacionPlantilla ep
      INNER JOIN dbo.Institucion i ON i.InstitucionId = ep.InstitucionId
      INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ep.AnioLectivoId
      INNER JOIN dbo.Periodo p ON p.PeriodoId = ep.PeriodoId
      INNER JOIN dbo.Materia m ON m.MateriaId = ep.MateriaId
      LEFT JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionPlantillaId = ep.EvaluacionPlantillaId
      WHERE (@q = N'%%' OR ep.Nombre LIKE @q OR m.Nombre LIKE @q OR p.Nombre LIKE @q)
        AND (@anioLectivoId IS NULL OR ep.AnioLectivoId = @anioLectivoId)
        AND (@periodoId IS NULL OR ep.PeriodoId = @periodoId)
        AND (@materiaId IS NULL OR ep.MateriaId = @materiaId)
        ${incluirInactivas ? "" : "AND ep.Activo = 1"}
        ${filtroInstitucion}
        ${filtroProfesor}
      GROUP BY
        ep.EvaluacionPlantillaId,
        ep.InstitucionId,
        i.Nombre,
        ep.AnioLectivoId,
        al.Nombre,
        ep.PeriodoId,
        p.Nombre,
        p.NumeroOrden,
        ep.MateriaId,
        m.Nombre,
        ep.Nombre,
        ep.UsuarioCreadorId,
        ep.EsPublica,
        ep.PermitirProfesorEditar,
        ep.DecimalesNota,
        ep.Estado,
        ep.Activo
      ORDER BY al.Nombre DESC, p.NumeroOrden, m.Nombre, ep.Nombre
    `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error listando plantillas de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las plantillas de evaluación" });
  }
});

router.get("/plantillas/:id", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canReadPlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para consultar esta plantilla");

    const detalle = await getPlantillaDetalle(pool, plantillaId);
    return ok(res, detalle);
  } catch (error) {
    console.error("Error consultando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo consultar la plantilla de evaluación" });
  }
});

router.post("/plantillas", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);
    const institucionId = isSuperAdmin(req)
      ? toOptionalNumber(req.body.institucionId)
      : getInstitutionId(req, res);
    if (institucionId === null) return;

    if (!isSuperAdmin(req) && !isInstitutionAdmin(req) && !isProfesor(req)) {
      return forbidden(res, "No tenés permisos para crear plantillas");
    }

    const anioLectivoId = toNumber(req.body.anioLectivoId, "anioLectivoId", res);
    const periodoId = toNumber(req.body.periodoId, "periodoId", res);
    const materiaId = await resolveMateriaEvaluacionId(pool, Number(institucionId), req.body.materiaId, req.body.cicloEvaluacion, res);
    const nombre = normalizeText(req.body.nombre);
    const decimalesNota = Math.max(0, Math.min(4, Number(req.body.decimalesNota ?? 2)));
    const permitirProfesorEditar = !!req.body.permitirProfesorEditar;
    const esPublica = req.body.esPublica === undefined
      ? !isProfesor(req)
      : !!req.body.esPublica;
    const usuarioCreadorId = getUserId(req) || null;

    if (anioLectivoId === null || periodoId === null || materiaId === null) return;
    if (!nombre) return badRequest(res, "El nombre de la plantilla es obligatorio");

    const duplicada = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .query(`
        SELECT TOP 1 EvaluacionPlantillaId
        FROM dbo.EvaluacionPlantilla
        WHERE InstitucionId = @institucionId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND MateriaId = @materiaId
          AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
          AND Activo = 1
      `);

    if (duplicada.recordset.length) {
      return badRequest(res, "Ya existe una plantilla con ese nombre para ese año, periodo y ciclo");
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioCreadorId", sql.Int, usuarioCreadorId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .input("esPublica", sql.Bit, esPublica)
      .input("permitirProfesorEditar", sql.Bit, permitirProfesorEditar)
      .input("decimalesNota", sql.Int, decimalesNota)
      .query(`
        INSERT INTO dbo.EvaluacionPlantilla
        (
          InstitucionId,
          UsuarioCreadorId,
          AnioLectivoId,
          PeriodoId,
          MateriaId,
          Nombre,
          EsPublica,
          PermitirProfesorEditar,
          DecimalesNota,
          Estado,
          Activo
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @institucionId,
          @usuarioCreadorId,
          @anioLectivoId,
          @periodoId,
          @materiaId,
          @nombre,
          @esPublica,
          @permitirProfesorEditar,
          @decimalesNota,
          N'BORRADOR',
          1
        )
      `);

    return created(res, result.recordset[0], "Plantilla de evaluación creada correctamente");
  } catch (error) {
    console.error("Error creando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear la plantilla de evaluación" });
  }
});

router.put("/plantillas/:id", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para modificar esta plantilla");

    const nombre = normalizeText(req.body.nombre);
    const anioLectivoId = toNumber(req.body.anioLectivoId, "anioLectivoId", res);
    const periodoId = toNumber(req.body.periodoId, "periodoId", res);
    const materiaId = await resolveMateriaEvaluacionId(pool, Number(plantilla.InstitucionId), req.body.materiaId, req.body.cicloEvaluacion, res);
    const decimalesNota = Math.max(0, Math.min(4, Number(req.body.decimalesNota ?? plantilla.DecimalesNota ?? 2)));
    const permitirProfesorEditar = !!req.body.permitirProfesorEditar;
    const esPublica = req.body.esPublica === undefined ? !!plantilla.EsPublica : !!req.body.esPublica;

    if (anioLectivoId === null || periodoId === null || materiaId === null) return;
    if (!nombre) return badRequest(res, "El nombre de la plantilla es obligatorio");

    const duplicada = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .input("institucionId", sql.Int, Number(plantilla.InstitucionId))
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .query(`
        SELECT TOP 1 EvaluacionPlantillaId
        FROM dbo.EvaluacionPlantilla
        WHERE EvaluacionPlantillaId <> @plantillaId
          AND InstitucionId = @institucionId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND MateriaId = @materiaId
          AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
          AND Activo = 1
      `);

    if (duplicada.recordset.length) {
      return badRequest(res, "Ya existe una plantilla con ese nombre para ese año, periodo y ciclo");
    }

    const result = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .input("esPublica", sql.Bit, esPublica)
      .input("permitirProfesorEditar", sql.Bit, permitirProfesorEditar)
      .input("decimalesNota", sql.Int, decimalesNota)
      .query(`
        UPDATE dbo.EvaluacionPlantilla
        SET AnioLectivoId = @anioLectivoId,
            PeriodoId = @periodoId,
            MateriaId = @materiaId,
            Nombre = @nombre,
            EsPublica = @esPublica,
            PermitirProfesorEditar = @permitirProfesorEditar,
            DecimalesNota = @decimalesNota,
            Estado = N'BORRADOR',
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE EvaluacionPlantillaId = @plantillaId
      `);

    return ok(res, result.recordset[0], "Plantilla actualizada. Quedó en estado borrador para volver a validarla y activarla.");
  } catch (error) {
    console.error("Error actualizando plantilla de evaluacion:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la plantilla de evaluacion" });
  }
});

router.delete("/plantillas/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para eliminar esta plantilla");

    const asignaciones = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        DECLARE @usos INT = 0;

        IF OBJECT_ID('dbo.GrupoEvaluacionPlantilla', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.GrupoEvaluacionPlantilla', 'EvaluacionPlantillaId') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'SELECT @usosOut = @usosOut + COUNT(1)
              FROM dbo.GrupoEvaluacionPlantilla
              WHERE EvaluacionPlantillaId = @plantillaId
                AND ISNULL(Activo, 1) = 1;',
            N'@plantillaId INT, @usosOut INT OUTPUT',
            @plantillaId = @plantillaId,
            @usosOut = @usos OUTPUT;
        END;

        IF OBJECT_ID('dbo.Grupo', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.Grupo', 'EvaluacionPlantillaId') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'SELECT @usosOut = @usosOut + COUNT(1)
              FROM dbo.Grupo
              WHERE EvaluacionPlantillaId = @plantillaId;',
            N'@plantillaId INT, @usosOut INT OUTPUT',
            @plantillaId = @plantillaId,
            @usosOut = @usos OUTPUT;
        END;

        IF OBJECT_ID('dbo.GrupoAcademico', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.GrupoAcademico', 'EvaluacionPlantillaId') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'SELECT @usosOut = @usosOut + COUNT(1)
              FROM dbo.GrupoAcademico
              WHERE EvaluacionPlantillaId = @plantillaId;',
            N'@plantillaId INT, @usosOut INT OUTPUT',
            @plantillaId = @plantillaId,
            @usosOut = @usos OUTPUT;
        END;

        IF OBJECT_ID('dbo.AsignacionDocente', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.AsignacionDocente', 'EvaluacionPlantillaId') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'SELECT @usosOut = @usosOut + COUNT(1)
              FROM dbo.AsignacionDocente
              WHERE EvaluacionPlantillaId = @plantillaId
                AND ISNULL(Activo, 1) = 1;',
            N'@plantillaId INT, @usosOut INT OUTPUT',
            @plantillaId = @plantillaId,
            @usosOut = @usos OUTPUT;
        END;

        IF OBJECT_ID('dbo.Eval360_EstructuraGrupo', 'U') IS NOT NULL
           AND COL_LENGTH('dbo.Eval360_EstructuraGrupo', 'PlantillaBaseId') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'SELECT @usosOut = @usosOut + COUNT(1)
              FROM dbo.Eval360_EstructuraGrupo
              WHERE PlantillaBaseId = @plantillaId
                AND ISNULL(Activo, 1) = 1;',
            N'@plantillaId INT, @usosOut INT OUTPUT',
            @plantillaId = @plantillaId,
            @usosOut = @usos OUTPUT;
        END;

        SELECT @usos AS Usos;
      `);

    const usos = Number(asignaciones.recordset[0]?.Usos || 0);
    if (usos > 0) {
      return badRequest(res, "No se puede eliminar la plantilla porque ya está asignada a uno o más grupos");
    }

    const usoNotas = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        SELECT TOP 1 n.EvaluacionNotaId
        FROM dbo.EvaluacionNota n
        INNER JOIN dbo.EvaluacionActividad a ON a.EvaluacionActividadId = n.EvaluacionActividadId
        INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
        WHERE c.EvaluacionPlantillaId = @plantillaId
      `);

    if (usoNotas.recordset.length) {
      return badRequest(res, "No se puede eliminar la plantilla porque ya tiene calificaciones registradas");
    }

    await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        DELETE ai
        FROM dbo.EvaluacionActividadIndicador ai
        INNER JOIN dbo.EvaluacionActividad a ON a.EvaluacionActividadId = ai.EvaluacionActividadId
        INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
        WHERE c.EvaluacionPlantillaId = @plantillaId;

        DELETE FROM dbo.EvaluacionActividad
        WHERE EvaluacionComponenteId IN (
          SELECT EvaluacionComponenteId
          FROM dbo.EvaluacionComponente
          WHERE EvaluacionPlantillaId = @plantillaId
        );

        DELETE FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId;

        DELETE FROM dbo.EvaluacionPlantilla
        WHERE EvaluacionPlantillaId = @plantillaId;
      `);

    return ok(res, null, "Plantilla de evaluación eliminada correctamente");
  } catch (error) {
    console.error("Error eliminando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar la plantilla de evaluación" });
  }
});

router.patch("/plantillas/:id/reactivar", async (req, res) => {
  try {
    const pool = await getPool();
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para reactivar esta plantilla");

    await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        UPDATE dbo.EvaluacionPlantilla
        SET Activo = 1,
            Estado = CASE WHEN Estado = N'INACTIVA' THEN N'BORRADOR' ELSE Estado END,
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionPlantillaId = @plantillaId
      `);

    return ok(res, null, "Plantilla de evaluación reactivada correctamente");
  } catch (error) {
    console.error("Error reactivando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reactivar la plantilla de evaluación" });
  }
});

router.patch("/plantillas/:id/inactivar", async (req, res) => {
  try {
    const pool = await getPool();
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para inactivar esta plantilla");

    await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        UPDATE dbo.EvaluacionPlantilla
        SET Activo = 0,
            Estado = N'INACTIVA',
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionPlantillaId = @plantillaId
      `);

    return ok(res, null, "Plantilla de evaluación inactivada correctamente");
  } catch (error) {
    console.error("Error inactivando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo inactivar la plantilla de evaluación" });
  }
});

router.patch("/plantillas/:id/activar", async (req, res) => {
  try {
    const pool = await getPool();
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para activar esta plantilla");

    const totalComponentes = await validarSumaComponentes(pool, plantillaId);
    if (Number(totalComponentes.toFixed(2)) !== 100) {
      return badRequest(res, `La plantilla no se puede activar porque sus componentes suman ${totalComponentes}%. Deben sumar 100%.`);
    }

    const validacionActividades = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        SELECT
          ec.EvaluacionComponenteId,
          ec.Descripcion,
          COUNT(ea.EvaluacionActividadId) AS CantidadActividades,
          ISNULL(SUM(ISNULL(ea.Porcentaje, 0)), 0) AS TotalActividades
        FROM dbo.EvaluacionComponente ec
        LEFT JOIN dbo.EvaluacionActividad ea
          ON ea.EvaluacionComponenteId = ec.EvaluacionComponenteId
         AND ISNULL(ea.Activo, 1) = 1
        WHERE ec.EvaluacionPlantillaId = @plantillaId
          AND ISNULL(ec.Activo, 1) = 1
        GROUP BY ec.EvaluacionComponenteId, ec.Descripcion
      `);

    const componenteInvalido = (validacionActividades.recordset || []).find((row: any) => {
      const cantidad = Number(row.CantidadActividades || 0);
      const total = Number(Number(row.TotalActividades || 0).toFixed(2));
      return cantidad > 0 && total !== 100;
    });

    if (componenteInvalido) {
      const nombre = String(componenteInvalido.Descripcion || "Rubro");
      const total = Number(Number(componenteInvalido.TotalActividades || 0).toFixed(2));
      return badRequest(
        res,
        `No se puede activar. El rubro "${nombre}" tiene actividades que suman ${total}%. Si un rubro tiene actividades, debe sumar 100%.`
      );
    }

    await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .query(`
        UPDATE dbo.EvaluacionPlantilla
        SET Estado = N'ACTIVA',
            Activo = 1,
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionPlantillaId = @plantillaId
      `);

    return ok(res, null, "Plantilla de evaluación activada correctamente");
  } catch (error) {
    console.error("Error activando plantilla de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo activar la plantilla de evaluación" });
  }
});

router.post("/plantillas/:id/copiar", async (req, res) => {
  const pool = await getPool();
  await ensureEvaluacionComponentePlaneamientoColumns(pool);
  const transaction = new sql.Transaction(pool);

  try {
    const plantillaId = Number(req.params.id);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla origen no encontrada" });
    if (!(await canReadPlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para copiar esta plantilla");

    const institucionDestinoId = isSuperAdmin(req)
      ? toOptionalNumber(req.body.institucionId) || Number(plantilla.InstitucionId)
      : getInstitutionId(req, res);
    if (institucionDestinoId === null) return;

    const anioLectivoId = toNumber(req.body.anioLectivoId || plantilla.AnioLectivoId, "anioLectivoId", res);
    const periodoId = toNumber(req.body.periodoId || plantilla.PeriodoId, "periodoId", res);
    const materiaId = await resolveMateriaEvaluacionId(pool, Number(institucionDestinoId), req.body.materiaId || plantilla.MateriaId, req.body.cicloEvaluacion, res);
    const nombre = normalizeText(req.body.nombre || `${plantilla.Nombre} - copia`);
    const esPublica = req.body.esPublica === undefined ? !!plantilla.EsPublica : !!req.body.esPublica;
    const usuarioCreadorId = getUserId(req) || null;

    if (anioLectivoId === null || periodoId === null || materiaId === null) return;
    if (!nombre) return badRequest(res, "El nombre de la nueva plantilla es obligatorio");

    const duplicada = await pool.request()
      .input("institucionId", sql.Int, institucionDestinoId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .query(`
        SELECT TOP 1 EvaluacionPlantillaId
        FROM dbo.EvaluacionPlantilla
        WHERE InstitucionId = @institucionId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND MateriaId = @materiaId
          AND UPPER(LTRIM(RTRIM(Nombre))) = UPPER(LTRIM(RTRIM(@nombre)))
          AND Activo = 1
      `);

    if (duplicada.recordset.length) {
      return badRequest(res, "El nombre de la plantilla copiada debe ser diferente");
    }

    await transaction.begin();

    const requestPlantilla = new sql.Request(transaction);
    const nuevaPlantilla = await requestPlantilla
      .input("institucionId", sql.Int, institucionDestinoId)
      .input("usuarioCreadorId", sql.Int, usuarioCreadorId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("materiaId", sql.Int, materiaId)
      .input("nombre", sql.NVarChar(200), nombre)
      .input("esPublica", sql.Bit, esPublica)
      .input("permitirProfesorEditar", sql.Bit, !!plantilla.PermitirProfesorEditar)
      .input("decimalesNota", sql.Int, Number(plantilla.DecimalesNota || 2))
      .query(`
        INSERT INTO dbo.EvaluacionPlantilla
        (
          InstitucionId,
          UsuarioCreadorId,
          AnioLectivoId,
          PeriodoId,
          MateriaId,
          Nombre,
          EsPublica,
          PermitirProfesorEditar,
          DecimalesNota,
          Estado,
          Activo
        )
        OUTPUT INSERTED.EvaluacionPlantillaId
        VALUES
        (
          @institucionId,
          @usuarioCreadorId,
          @anioLectivoId,
          @periodoId,
          @materiaId,
          @nombre,
          @esPublica,
          @permitirProfesorEditar,
          @decimalesNota,
          N'BORRADOR',
          1
        )
      `);

    const nuevaPlantillaId = Number(nuevaPlantilla.recordset[0].EvaluacionPlantillaId);

    await new sql.Request(transaction)
      .input("plantillaId", sql.Int, plantillaId)
      .input("nuevaPlantillaId", sql.Int, nuevaPlantillaId)
      .query(`
        DECLARE @ComponentesMap TABLE
        (
          OrigenComponenteId INT NOT NULL,
          NuevoComponenteId INT NOT NULL
        );

        MERGE dbo.EvaluacionComponente AS target
        USING
        (
          SELECT
            EvaluacionComponenteId AS OrigenComponenteId,
            Descripcion,
            Porcentaje,
            Orden,
            Activo,
            ISNULL(PermitePlaneamiento, 0) AS PermitePlaneamiento,
            TipoSeguimiento
          FROM dbo.EvaluacionComponente
          WHERE EvaluacionPlantillaId = @plantillaId
        ) AS src
        ON 1 = 0
        WHEN NOT MATCHED THEN
          INSERT
          (
            EvaluacionPlantillaId,
            Descripcion,
            Porcentaje,
            Orden,
            Activo,
            PermitePlaneamiento,
            TipoSeguimiento
          )
          VALUES
          (
            @nuevaPlantillaId,
            src.Descripcion,
            src.Porcentaje,
            src.Orden,
            src.Activo,
            src.PermitePlaneamiento,
            src.TipoSeguimiento
          )
        OUTPUT src.OrigenComponenteId, inserted.EvaluacionComponenteId
          INTO @ComponentesMap (OrigenComponenteId, NuevoComponenteId);

        INSERT INTO dbo.EvaluacionActividad
        (
          EvaluacionComponenteId,
          Descripcion,
          Porcentaje,
          Fecha,
          Orden,
          UsaIndicadoresPlaneamiento,
          Activo
        )
        SELECT
          map.NuevoComponenteId,
          act.Descripcion,
          act.Porcentaje,
          act.Fecha,
          act.Orden,
          ISNULL(act.UsaIndicadoresPlaneamiento, 0),
          act.Activo
        FROM dbo.EvaluacionActividad act
        INNER JOIN @ComponentesMap map
          ON map.OrigenComponenteId = act.EvaluacionComponenteId;
      `);

    await transaction.commit();

    const detalle = await getPlantillaDetalle(pool, nuevaPlantillaId);
    return created(res, detalle, "Plantilla copiada correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error copiando plantilla de evaluacion:", error);
    return res.status(500).json({ ok: false, message: "No se pudo copiar la plantilla de evaluacion" });
  }
});

/* =========================================================
   COMPONENTES
   ========================================================= */
router.post("/plantillas/:plantillaId/componentes", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);

    const plantillaId = Number(req.params.plantillaId);
    const plantilla = await getPlantillaHeader(pool, plantillaId);

    if (!plantilla) return res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para modificar esta plantilla");

    const descripcion = normalizeText(req.body.descripcion);
    const porcentaje = validatePercent(req.body.porcentaje, "porcentaje", res);
    const orden = Math.max(1, Number(req.body.orden || 1));
    const usaIndicadoresPlaneamiento = toBooleanFlag(req.body.usaIndicadoresPlaneamiento);
    const permitePlaneamiento = Boolean(req.body.permitePlaneamiento);
    const tipoSeguimiento = permitePlaneamiento ? normalizeTipoSeguimiento(req.body.tipoSeguimiento) : null;

    if (porcentaje === null) return;
    if (!descripcion) return badRequest(res, "La descripción del componente es obligatoria");
    if (permitePlaneamiento && !tipoSeguimiento) {
      return badRequest(res, "Debe seleccionar si el componente se relaciona con Trabajo cotidiano, Tareas o Asistencia diaria");
    }
    const duplicado = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .query(`
        SELECT TOP 1 EvaluacionComponenteId
        FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId
          AND ISNULL(Activo, 1) = 1
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return badRequest(res, "Ya existe un rubro de calificación con ese nombre en esta plantilla");
    }
    const duplicadoOrden = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .input("orden", sql.Int, orden)
      .query(`
        SELECT TOP 1 EvaluacionComponenteId
        FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId
          AND ISNULL(Activo, 1) = 1
          AND Orden = @orden
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "El orden del rubro de calificación ya existe en esta plantilla");
    }

    const result = await pool.request()
      .input("plantillaId", sql.Int, plantillaId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("porcentaje", sql.Decimal(10, 2), porcentaje)
      .input("orden", sql.Int, orden)
      .input("permitePlaneamiento", sql.Bit, permitePlaneamiento)
      .input("tipoSeguimiento", sql.NVarChar(40), tipoSeguimiento)
      .query(`
        INSERT INTO dbo.EvaluacionComponente
        (EvaluacionPlantillaId, Descripcion, Porcentaje, Orden, Activo, PermitePlaneamiento, TipoSeguimiento)
        OUTPUT INSERTED.*
        VALUES (@plantillaId, @descripcion, @porcentaje, @orden, 1, @permitePlaneamiento, @tipoSeguimiento)
      `);

    const total = await validarSumaComponentes(pool, plantillaId);
    await marcarPlantillaComoBorrador(pool, plantillaId);
    const message = Number(total.toFixed(2)) === 100
      ? "Componente creado correctamente. La plantilla quedó en borrador para volver a activarla."
      : `Componente creado correctamente. La plantilla quedó en borrador y suma ${total}%, debe llegar a 100% para activarse.`;

    return created(res, result.recordset[0], message);
  } catch (error) {
    console.error("Error creando componente de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear el componente de evaluación" });
  }
});

router.put("/componentes/:id", async (req, res) => {
  try {
    const pool = await getPool();
    await ensureEvaluacionComponentePlaneamientoColumns(pool);

    const componenteId = Number(req.params.id);

    const componenteResult = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionComponente ec
        WHERE ec.EvaluacionComponenteId = @componenteId
      `);

    const plantillaId = componenteResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Componente no encontrado" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para modificar este componente");

    const descripcion = normalizeText(req.body.descripcion);
    const porcentaje = validatePercent(req.body.porcentaje, "porcentaje", res);
    const orden = Math.max(1, Number(req.body.orden || 1));
    const permitePlaneamiento = Boolean(req.body.permitePlaneamiento);
    const tipoSeguimiento = permitePlaneamiento ? normalizeTipoSeguimiento(req.body.tipoSeguimiento) : null;

    if (porcentaje === null) return;
    if (!descripcion) return badRequest(res, "La descripción del componente es obligatoria");
    if (permitePlaneamiento && !tipoSeguimiento) {
      return badRequest(res, "Debe seleccionar si el componente se relaciona con Trabajo cotidiano, Tareas o Asistencia diaria");
    }
    const duplicado = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .input("plantillaId", sql.Int, Number(plantillaId))
      .input("descripcion", sql.NVarChar(150), descripcion)
      .query(`
        SELECT TOP 1 EvaluacionComponenteId
        FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId
          AND EvaluacionComponenteId <> @componenteId
          AND ISNULL(Activo, 1) = 1
          AND UPPER(LTRIM(RTRIM(Descripcion))) = UPPER(LTRIM(RTRIM(@descripcion)))
      `);
    if (duplicado.recordset.length) {
      return badRequest(res, "Ya existe un rubro de calificación con ese nombre en esta plantilla");
    }
    const duplicadoOrden = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .input("plantillaId", sql.Int, Number(plantillaId))
      .input("orden", sql.Int, orden)
      .query(`
        SELECT TOP 1 EvaluacionComponenteId
        FROM dbo.EvaluacionComponente
        WHERE EvaluacionPlantillaId = @plantillaId
          AND EvaluacionComponenteId <> @componenteId
          AND ISNULL(Activo, 1) = 1
          AND Orden = @orden
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "El orden del rubro de calificación ya existe en esta plantilla");
    }

    const result = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("porcentaje", sql.Decimal(10, 2), porcentaje)
      .input("orden", sql.Int, orden)
      .input("permitePlaneamiento", sql.Bit, permitePlaneamiento)
      .input("tipoSeguimiento", sql.NVarChar(40), tipoSeguimiento)
      .query(`
        UPDATE dbo.EvaluacionComponente
        SET Descripcion = @descripcion,
            Porcentaje = @porcentaje,
            Orden = @orden,
            PermitePlaneamiento = @permitePlaneamiento,
            TipoSeguimiento = @tipoSeguimiento,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE EvaluacionComponenteId = @componenteId
      `);

    const total = await validarSumaComponentes(pool, Number(plantillaId));
    await marcarPlantillaComoBorrador(pool, Number(plantillaId));
    return ok(res, { componente: result.recordset[0], totalComponentes: total }, "Componente actualizado. La plantilla quedó en borrador para volver a activarla.");
  } catch (error) {
    console.error("Error actualizando componente de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el componente de evaluación" });
  }
});

router.delete("/componentes/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const componenteId = Number(req.params.id);

    const componenteResult = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionComponente ec
        WHERE ec.EvaluacionComponenteId = @componenteId
      `);

    const plantillaId = componenteResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Componente no encontrado" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para eliminar este rubro de calificación");

    const usoNotas = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 n.EvaluacionNotaId
        FROM dbo.EvaluacionNota n
        INNER JOIN dbo.EvaluacionActividad a ON a.EvaluacionActividadId = n.EvaluacionActividadId
        WHERE a.EvaluacionComponenteId = @componenteId
      `);

    if (usoNotas.recordset.length) {
      return badRequest(res, "No se puede eliminar el rubro porque ya tiene calificaciones registradas");
    }

    await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        DELETE ai
        FROM dbo.EvaluacionActividadIndicador ai
        INNER JOIN dbo.EvaluacionActividad a ON a.EvaluacionActividadId = ai.EvaluacionActividadId
        WHERE a.EvaluacionComponenteId = @componenteId;

        DELETE FROM dbo.EvaluacionActividad
        WHERE EvaluacionComponenteId = @componenteId;

        DELETE FROM dbo.EvaluacionComponente
        WHERE EvaluacionComponenteId = @componenteId;
      `);
    await marcarPlantillaComoBorrador(pool, Number(plantillaId));

    return ok(res, null, "Rubro de calificación eliminado. La plantilla quedó en borrador para volver a activarla.");
  } catch (error) {
    console.error("Error eliminando rubro de calificación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar el rubro de calificación" });
  }
});

router.patch("/componentes/:id/reactivar", async (req, res) => {
  try {
    const pool = await getPool();
    const componenteId = Number(req.params.id);

    const componenteResult = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionComponente ec
        WHERE ec.EvaluacionComponenteId = @componenteId
      `);

    const plantillaId = componenteResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Componente no encontrado" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para reactivar este componente");
    const duplicadoOrden = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 c2.EvaluacionComponenteId
        FROM dbo.EvaluacionComponente c1
        INNER JOIN dbo.EvaluacionComponente c2
          ON c2.EvaluacionPlantillaId = c1.EvaluacionPlantillaId
         AND c2.EvaluacionComponenteId <> c1.EvaluacionComponenteId
         AND ISNULL(c2.Activo, 1) = 1
         AND c2.Orden = c1.Orden
        WHERE c1.EvaluacionComponenteId = @componenteId
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "No se puede reactivar el rubro porque su orden ya está en uso");
    }

    await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        UPDATE dbo.EvaluacionComponente
        SET Activo = 1,
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionComponenteId = @componenteId
      `);

    return ok(res, null, "Componente reactivado correctamente");
  } catch (error) {
    console.error("Error reactivando componente de evaluación:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reactivar el componente de evaluación" });
  }
});

/* =========================================================
   ACTIVIDADES EVALUATIVAS
   ========================================================= */
router.post("/componentes/:componenteId/actividades", async (req, res) => {
  try {
    const pool = await getPool();
    const componenteId = Number(req.params.componenteId);

    const componenteResult = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionComponente ec
        WHERE ec.EvaluacionComponenteId = @componenteId
      `);

    const plantillaId = componenteResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Componente no encontrado" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para modificar este componente");

    const descripcion = normalizeText(req.body.descripcion);
    const porcentaje = validatePercent(req.body.porcentaje, "porcentaje", res);
    const fecha = normalizeText(req.body.fecha) || null;
    const orden = Math.max(1, Number(req.body.orden || 1));
    const usaIndicadoresPlaneamiento = toBooleanFlag(req.body.usaIndicadoresPlaneamiento);

    if (porcentaje === null) return;
    if (!descripcion) return badRequest(res, "La descripción de la actividad es obligatoria");
    const duplicadoOrden = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .input("orden", sql.Int, orden)
      .query(`
        SELECT TOP 1 EvaluacionActividadId
        FROM dbo.EvaluacionActividad
        WHERE EvaluacionComponenteId = @componenteId
          AND ISNULL(Activo, 1) = 1
          AND Orden = @orden
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "El orden de la actividad ya existe en este rubro de calificación");
    }

    const validacionTope = await validarTopeActividadesComponente(pool, componenteId, Number(porcentaje), null);
    if (validacionTope.excede) {
      return badRequest(
        res,
        `La suma de actividades de este rubro no puede superar 100%. Total propuesto: ${validacionTope.totalPropuesto}%.`
      );
    }

    const result = await pool.request()
      .input("componenteId", sql.Int, componenteId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("porcentaje", sql.Decimal(10, 2), porcentaje)
      .input("fecha", sql.Date, fecha)
      .input("orden", sql.Int, orden)
      .input("usaIndicadoresPlaneamiento", sql.Bit, usaIndicadoresPlaneamiento)
      .query(`
        INSERT INTO dbo.EvaluacionActividad
        (EvaluacionComponenteId, Descripcion, Porcentaje, Fecha, Orden, UsaIndicadoresPlaneamiento, Activo)
        OUTPUT INSERTED.*
        VALUES (@componenteId, @descripcion, @porcentaje, @fecha, @orden, @usaIndicadoresPlaneamiento, 1)
      `);

    const total = await validarSumaActividades(pool, componenteId);
    await marcarPlantillaComoBorrador(pool, Number(plantillaId));
    const message = Number(total.toFixed(2)) === 100
      ? "Actividad creada correctamente. La plantilla quedó en borrador para volver a activarla."
      : `Actividad creada correctamente. La plantilla quedó en borrador. Las actividades del componente suman ${total}%.`;

    return created(res, result.recordset[0], message);
  } catch (error) {
    console.error("Error creando actividad evaluativa:", error);
    return res.status(500).json({ ok: false, message: "No se pudo crear la actividad evaluativa" });
  }
});

router.put("/actividades/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const actividadId = Number(req.params.id);

    const actividadResult = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 ea.EvaluacionComponenteId, ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ea.EvaluacionActividadId = @actividadId
      `);

    const actividad = actividadResult.recordset[0];
    if (!actividad) return res.status(404).json({ ok: false, message: "Actividad no encontrada" });

    const plantilla = await getPlantillaHeader(pool, Number(actividad.EvaluacionPlantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para modificar esta actividad");

    const descripcion = normalizeText(req.body.descripcion);
    const porcentaje = validatePercent(req.body.porcentaje, "porcentaje", res);
    const fecha = normalizeText(req.body.fecha) || null;
    const orden = Math.max(1, Number(req.body.orden || 1));
    const usaIndicadoresPlaneamiento = toBooleanFlag(req.body.usaIndicadoresPlaneamiento);

    if (porcentaje === null) return;
    if (!descripcion) return badRequest(res, "La descripción de la actividad es obligatoria");
    const duplicadoOrden = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .input("componenteId", sql.Int, Number(actividad.EvaluacionComponenteId))
      .input("orden", sql.Int, orden)
      .query(`
        SELECT TOP 1 EvaluacionActividadId
        FROM dbo.EvaluacionActividad
        WHERE EvaluacionComponenteId = @componenteId
          AND EvaluacionActividadId <> @actividadId
          AND ISNULL(Activo, 1) = 1
          AND Orden = @orden
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "El orden de la actividad ya existe en este rubro de calificación");
    }

    const validacionTope = await validarTopeActividadesComponente(
      pool,
      Number(actividad.EvaluacionComponenteId),
      Number(porcentaje),
      actividadId
    );
    if (validacionTope.excede) {
      return badRequest(
        res,
        `La suma de actividades de este rubro no puede superar 100%. Total propuesto: ${validacionTope.totalPropuesto}%.`
      );
    }

    const result = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .input("descripcion", sql.NVarChar(150), descripcion)
      .input("porcentaje", sql.Decimal(10, 2), porcentaje)
      .input("fecha", sql.Date, fecha)
      .input("orden", sql.Int, orden)
      .input("usaIndicadoresPlaneamiento", sql.Bit, usaIndicadoresPlaneamiento)
      .query(`
        UPDATE dbo.EvaluacionActividad
        SET Descripcion = @descripcion,
            Porcentaje = @porcentaje,
            Fecha = @fecha,
            Orden = @orden,
            UsaIndicadoresPlaneamiento = @usaIndicadoresPlaneamiento,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE EvaluacionActividadId = @actividadId
      `);

    const total = await validarSumaActividades(pool, Number(actividad.EvaluacionComponenteId));
    await marcarPlantillaComoBorrador(pool, Number(actividad.EvaluacionPlantillaId));
    return ok(res, { actividad: result.recordset[0], totalActividades: total }, "Actividad actualizada. La plantilla quedó en borrador para volver a activarla.");
  } catch (error) {
    console.error("Error actualizando actividad evaluativa:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la actividad evaluativa" });
  }
});

router.delete("/actividades/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const actividadId = Number(req.params.id);

    const actividadResult = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ea.EvaluacionActividadId = @actividadId
      `);

    const plantillaId = actividadResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Actividad no encontrada" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para eliminar esta actividad");

    const usoNotas = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 EvaluacionNotaId
        FROM dbo.EvaluacionNota
        WHERE EvaluacionActividadId = @actividadId
      `);
    if (usoNotas.recordset.length) {
      return badRequest(res, "No se puede eliminar la actividad porque ya tiene calificaciones registradas");
    }

    await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        DELETE FROM dbo.EvaluacionActividadIndicador
        WHERE EvaluacionActividadId = @actividadId;

        DELETE FROM dbo.EvaluacionActividad
        WHERE EvaluacionActividadId = @actividadId;
      `);
    await marcarPlantillaComoBorrador(pool, Number(plantillaId));

    return ok(res, null, "Actividad eliminada. La plantilla quedó en borrador para volver a activarla.");
  } catch (error) {
    console.error("Error eliminando actividad evaluativa:", error);
    return res.status(500).json({ ok: false, message: "No se pudo eliminar la actividad evaluativa" });
  }
});

router.patch("/actividades/:id/reactivar", async (req, res) => {
  try {
    const pool = await getPool();
    const actividadId = Number(req.params.id);

    const actividadResult = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 ec.EvaluacionPlantillaId
        FROM dbo.EvaluacionActividad ea
        INNER JOIN dbo.EvaluacionComponente ec ON ec.EvaluacionComponenteId = ea.EvaluacionComponenteId
        WHERE ea.EvaluacionActividadId = @actividadId
      `);

    const plantillaId = actividadResult.recordset[0]?.EvaluacionPlantillaId;
    if (!plantillaId) return res.status(404).json({ ok: false, message: "Actividad no encontrada" });

    const plantilla = await getPlantillaHeader(pool, Number(plantillaId));
    if (!(await canWritePlantilla(pool, req, plantilla))) return forbidden(res, "No tenés permisos para reactivar esta actividad");
    const duplicadoOrden = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        SELECT TOP 1 a2.EvaluacionActividadId
        FROM dbo.EvaluacionActividad a1
        INNER JOIN dbo.EvaluacionActividad a2
          ON a2.EvaluacionComponenteId = a1.EvaluacionComponenteId
         AND a2.EvaluacionActividadId <> a1.EvaluacionActividadId
         AND ISNULL(a2.Activo, 1) = 1
         AND a2.Orden = a1.Orden
        WHERE a1.EvaluacionActividadId = @actividadId
      `);
    if (duplicadoOrden.recordset.length) {
      return badRequest(res, "No se puede reactivar la actividad porque su orden ya está en uso");
    }

    await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .query(`
        UPDATE dbo.EvaluacionActividad
        SET Activo = 1,
            UpdatedAt = SYSDATETIME()
        WHERE EvaluacionActividadId = @actividadId
      `);

    return ok(res, null, "Actividad reactivada correctamente");
  } catch (error) {
    console.error("Error reactivando actividad evaluativa:", error);
    return res.status(500).json({ ok: false, message: "No se pudo reactivar la actividad evaluativa" });
  }
});

export default router;

