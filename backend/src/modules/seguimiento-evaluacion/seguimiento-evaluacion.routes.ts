import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, forbidden, ok, serverError } from "../../utils/http";

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

function hasRole(req: any, role: string) {
  return (getAuth(req).roles || []).includes(role);
}

function isSuperAdmin(req: any) {
  return hasRole(req, "SUPER_ADMIN");
}

function isAdmin(req: any) {
  return hasRole(req, "ADMIN_INSTITUCIONAL") || hasRole(req, "ADMINISTRATIVO");
}

function isProfesorOnly(req: any) {
  return (hasRole(req, "PROFESOR") || hasRole(req, "PROFESOR_GUIA")) && !isSuperAdmin(req) && !isAdmin(req);
}

function getInstitucionId(req: any, res: any) {
  const institucionId = getAuth(req).institucionId;
  if (institucionId === null || institucionId === undefined || !Number.isFinite(Number(institucionId))) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }
  return Number(institucionId);
}

function toRequiredNumber(value: any, field: string, res: any) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    badRequest(res, `El campo ${field} es inválido`);
    return null;
  }
  return parsed;
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

function getTipoUsoFromNombre(nombre: string) {
  const key = normalizeKey(nombre);
  if (key.includes("COTIDIAN")) return "COTIDIANO";
  if (key.includes("TAREA")) return "TAREA";
  if (key.includes("ASIST")) return "ASISTENCIA";
  if (key.includes("EXAM") || key.includes("PRUEBA")) return "EXAMEN";
  return "OTRO";
}

function calcularAsistenciaArticulo37(totalLecciones: number, ausencias: number, valorComponente: number) {
  if (totalLecciones <= 0) {
    return {
      totalLecciones,
      ausencias,
      porcentajeAusencias: 0,
      porcentajeArticulo37: valorComponente,
      notaSobre100: 100,
      porcentajeObtenido: valorComponente
    };
  }

  const porcentajeAusencias = (ausencias / totalLecciones) * 100;
  let proporcion = 0;

  if (porcentajeAusencias < 10) proporcion = 1;
  else if (porcentajeAusencias < 20) proporcion = 0.8;
  else if (porcentajeAusencias < 30) proporcion = 0.6;
  else if (porcentajeAusencias < 40) proporcion = 0.4;
  else if (porcentajeAusencias < 50) proporcion = 0.2;
  else proporcion = 0;

  const porcentajeObtenido = Number((valorComponente * proporcion).toFixed(2));

  return {
    totalLecciones,
    ausencias,
    porcentajeAusencias: Number(porcentajeAusencias.toFixed(2)),
    porcentajeArticulo37: porcentajeObtenido,
    notaSobre100: Number((proporcion * 100).toFixed(2)),
    porcentajeObtenido
  };
}

async function getEstructuraGrupo(req: any, res: any, estructuraGrupoId: number) {
  const pool = await getPool();
  const request = pool.request().input("estructuraGrupoId", sql.Int, estructuraGrupoId);

  let filtroInstitucion = "";
  if (!isSuperAdmin(req)) {
    const institucionId = getInstitucionId(req, res);
    if (institucionId === null) return null;
    request.input("institucionId", sql.Int, institucionId);
    filtroInstitucion = "AND eg.InstitucionId = @institucionId";
  }

  let filtroProfesor = "";
  if (isProfesorOnly(req)) {
    request.input("usuarioId", sql.Int, getUserId(req));
    filtroProfesor = "AND eg.UsuarioId = @usuarioId";
  }

  const result = await request.query(`
    SELECT TOP 1
      eg.EstructuraGrupoId,
      eg.InstitucionId,
      eg.GrupoId,
      eg.MateriaId,
      eg.AnioLectivoId,
      eg.PeriodoId,
      eg.UsuarioId,
      eg.Nombre,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      p.Nombre AS PeriodoNombre,
      a.Nombre AS AnioNombre
    FROM Eval360_EstructuraGrupo eg
    INNER JOIN Grupo g ON g.GrupoId = eg.GrupoId
    INNER JOIN Materia m ON m.MateriaId = eg.MateriaId
    INNER JOIN Periodo p ON p.PeriodoId = eg.PeriodoId
    INNER JOIN AnioLectivo a ON a.AnioLectivoId = eg.AnioLectivoId
    WHERE eg.EstructuraGrupoId = @estructuraGrupoId
      AND eg.Activo = 1
      ${filtroInstitucion}
      ${filtroProfesor}
  `);

  return result.recordset[0] || null;
}

async function getComponente(pool: any, estructuraGrupoDetalleId: number, estructuraGrupoId: number) {
  const result = await pool.request()
    .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .query(`
      SELECT TOP 1
        d.EstructuraGrupoDetalleId,
        d.EstructuraGrupoId,
        d.ComponenteCatalogoId,
        d.Nombre,
        d.Porcentaje,
        d.Orden
      FROM Eval360_EstructuraGrupoDetalle d
      WHERE d.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
        AND d.EstructuraGrupoId = @estructuraGrupoId
        AND d.Activo = 1
    `);
  return result.recordset[0] || null;
}

async function getOrCreateActividad(pool: any, input: {
  estructuraGrupoId: number;
  estructuraGrupoDetalleId: number;
  nombre: string;
  fuente: string;
  puntosMaximos: number;
  fecha?: string | null;
}) {
  const existente = await pool.request()
    .input("estructuraGrupoId", sql.Int, input.estructuraGrupoId)
    .input("estructuraGrupoDetalleId", sql.Int, input.estructuraGrupoDetalleId)
    .input("nombre", sql.NVarChar(200), input.nombre)
    .query(`
      SELECT TOP 1 ActividadId
      FROM Eval360_Actividad
      WHERE EstructuraGrupoId = @estructuraGrupoId
        AND EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
        AND Nombre = @nombre
        AND Activo = 1
      ORDER BY ActividadId DESC
    `);

  if (existente.recordset[0]?.ActividadId) return Number(existente.recordset[0].ActividadId);

  const insertado = await pool.request()
    .input("estructuraGrupoId", sql.Int, input.estructuraGrupoId)
    .input("estructuraGrupoDetalleId", sql.Int, input.estructuraGrupoDetalleId)
    .input("nombre", sql.NVarChar(200), input.nombre)
    .input("fuente", sql.NVarChar(50), input.fuente)
    .input("puntosMaximos", sql.Decimal(10, 2), input.puntosMaximos)
    .input("fecha", sql.Date, input.fecha || null)
    .query(`
      INSERT INTO Eval360_Actividad
        (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Fecha, PuntosMaximos, Fuente, Activo, CreatedAt)
      OUTPUT INSERTED.ActividadId
      VALUES
        (@estructuraGrupoId, @estructuraGrupoDetalleId, @nombre, @fecha, @puntosMaximos, @fuente, 1, SYSDATETIME())
    `);

  return Number(insertado.recordset[0].ActividadId);
}

async function getOrCreateNivelDesempeno(transaction: any, estructuraGrupoId: number, valor: number) {
  const nombre = valor === 1 ? "Inicial" : valor === 2 ? "Intermedio" : "Avanzado";
  const orden = valor === 1 ? 1 : valor === 2 ? 2 : 3;

  const existente = await new sql.Request(transaction)
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("valor", sql.Decimal(10, 2), valor)
    .query(`
      SELECT TOP 1 NivelDesempenoGrupoId
      FROM Eval360_NivelDesempenoGrupo
      WHERE EstructuraGrupoId = @estructuraGrupoId
        AND Valor = @valor
        AND Activo = 1
    `);

  if (existente.recordset[0]?.NivelDesempenoGrupoId) {
    return Number(existente.recordset[0].NivelDesempenoGrupoId);
  }

  const insertado = await new sql.Request(transaction)
    .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
    .input("nombre", sql.NVarChar(100), nombre)
    .input("valor", sql.Decimal(10, 2), valor)
    .input("orden", sql.Int, orden)
    .query(`
      INSERT INTO Eval360_NivelDesempenoGrupo
        (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
      OUTPUT INSERTED.NivelDesempenoGrupoId
      VALUES
        (@estructuraGrupoId, @nombre, @valor, @orden, 1)
    `);

  return Number(insertado.recordset[0].NivelDesempenoGrupoId);
}

router.get("/grupos", async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    let filtroInstitucion = "";
    if (!isSuperAdmin(req)) {
      const institucionId = getInstitucionId(req, res);
      if (institucionId === null) return;
      request.input("institucionId", sql.Int, institucionId);
      filtroInstitucion = "AND eg.InstitucionId = @institucionId";
    }

    let filtroProfesor = "";
    if (isProfesorOnly(req)) {
      request.input("usuarioId", sql.Int, getUserId(req));
      filtroProfesor = "AND eg.UsuarioId = @usuarioId";
    }

    const result = await request.query(`
      SELECT
        eg.EstructuraGrupoId,
        eg.GrupoId,
        eg.MateriaId,
        eg.AnioLectivoId,
        eg.PeriodoId,
        eg.Nombre,
        g.Nombre AS GrupoNombre,
        g.Nivel AS GrupoNivel,
        m.Nombre AS MateriaNombre,
        p.Nombre AS PeriodoNombre,
        a.Nombre AS AnioNombre,
        eg.TotalPorcentaje
      FROM Eval360_EstructuraGrupo eg
      INNER JOIN Grupo g ON g.GrupoId = eg.GrupoId
      INNER JOIN Materia m ON m.MateriaId = eg.MateriaId
      INNER JOIN Periodo p ON p.PeriodoId = eg.PeriodoId
      INNER JOIN AnioLectivo a ON a.AnioLectivoId = eg.AnioLectivoId
      WHERE eg.Activo = 1
        ${filtroInstitucion}
        ${filtroProfesor}
      ORDER BY a.Nombre DESC, p.NumeroOrden, g.Nombre, m.Nombre
    `);

    ok(res, result.recordset);
  } catch (error) {
    serverError(res, error);
  }
});

router.get("/grupos/:estructuraGrupoId/detalle", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.params.estructuraGrupoId, "estructuraGrupoId", res);
    if (!estructuraGrupoId) return;

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();

    const componentes = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT
          d.EstructuraGrupoDetalleId,
          d.ComponenteCatalogoId,
          d.Nombre,
          d.Porcentaje,
          d.Orden,
          cc.Nombre AS ComponenteCatalogoNombre
        FROM Eval360_EstructuraGrupoDetalle d
        LEFT JOIN Eval360_ComponenteCatalogo cc ON cc.ComponenteCatalogoId = d.ComponenteCatalogoId
        WHERE d.EstructuraGrupoId = @estructuraGrupoId
          AND d.Activo = 1
        ORDER BY d.Orden, d.EstructuraGrupoDetalleId
      `);

    const estudiantes = await pool.request()
      .input("grupoId", sql.Int, grupo.GrupoId)
      .input("anioLectivoId", sql.Int, grupo.AnioLectivoId)
      .query(`
        SELECT
          e.EstudianteId,
          e.Identificacion,
          e.Nombre,
          e.PrimerApellido,
          e.SegundoApellido,
          LTRIM(RTRIM(CONCAT(ISNULL(e.PrimerApellido, ''), ' ', ISNULL(e.SegundoApellido, ''), ' ', e.Nombre))) AS NombreCompleto
        FROM Matricula ma
        INNER JOIN Estudiante e ON e.EstudianteId = ma.EstudianteId
        WHERE ma.GrupoId = @grupoId
          AND ma.AnioLectivoId = @anioLectivoId
          AND ma.Estado = N'Activa'
          AND e.Activo = 1
        ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
      `);

    const planeamientos = await pool.request()
      .input("grupoId", sql.Int, grupo.GrupoId)
      .input("materiaId", sql.Int, grupo.MateriaId)
      .input("anioLectivoId", sql.Int, grupo.AnioLectivoId)
      .input("periodoId", sql.Int, grupo.PeriodoId)
      .input("usuarioId", sql.Int, grupo.UsuarioId || getUserId(req))
      .query(`
        SELECT
          PlaneamientoId,
          Nombre,
          FechaInicio,
          FechaFin,
          CreatedAt
        FROM Planeamiento
        WHERE GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND Activo = 1
        ORDER BY CreatedAt DESC, PlaneamientoId DESC
      `);

    ok(res, {
      grupo,
      componentes: componentes.recordset,
      estudiantes: estudiantes.recordset,
      planeamientos: planeamientos.recordset
    });
  } catch (error) {
    serverError(res, error);
  }
});

router.get("/grupos/:estructuraGrupoId/planeamientos/:planeamientoId/indicadores", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.params.estructuraGrupoId, "estructuraGrupoId", res);
    const planeamientoId = toRequiredNumber(req.params.planeamientoId, "planeamientoId", res);
    const tipoUso = normalizeKey(req.query.tipoUso || "");
    if (!estructuraGrupoId || !planeamientoId) return;

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const tipoPermitido = ["COTIDIANO", "TAREA", "TABLA_ESPECIFICACION", "TODOS", ""].includes(tipoUso);
    if (!tipoPermitido) return badRequest(res, "Tipo de indicador inválido");

    const pool = await getPool();
    const request = pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("planeamientoId", sql.Int, planeamientoId);

    let filtroTipo = "";
    if (tipoUso && tipoUso !== "TODOS") {
      request.input("tipoUso", sql.NVarChar(50), tipoUso);
      filtroTipo = "AND UPPER(ig.TipoUso) = @tipoUso";
    }

    const result = await request.query(`
      SELECT
        ig.IndicadorGrupoId,
        ig.PlaneamientoId,
        ig.TipoUso,
        ig.IndicadorBase,
        ig.IndicadorAvanzado,
        ig.IndicadorIntermedio,
        ig.IndicadorInicial,
        ig.CreatedAt
      FROM Eval360_IndicadorGrupo ig
      WHERE ig.EstructuraGrupoId = @estructuraGrupoId
        AND ig.PlaneamientoId = @planeamientoId
        AND ig.Activo = 1
        ${filtroTipo}
      ORDER BY ig.IndicadorGrupoId
    `);

    ok(res, result.recordset);
  } catch (error) {
    serverError(res, error);
  }
});

router.get("/seguimiento", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.query.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.query.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const estudianteId = toRequiredNumber(req.query.estudianteId, "estudianteId", res);
    const planeamientoId = Number(req.query.planeamientoId || 0);
    if (!estructuraGrupoId || !estructuraGrupoDetalleId || !estudianteId) return;

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();
    const componente = await getComponente(pool, estructuraGrupoDetalleId, estructuraGrupoId);
    if (!componente) return badRequest(res, "El componente no pertenece al grupo seleccionado");

    const request = pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .input("estructuraGrupoDetalleId", sql.Int, estructuraGrupoDetalleId)
      .input("estudianteId", sql.Int, estudianteId);

    let filtroPlaneamiento = "";
    if (planeamientoId > 0) {
      request.input("planeamientoId", sql.Int, planeamientoId);
      filtroPlaneamiento = "AND ig.PlaneamientoId = @planeamientoId";
    }

    const result = await request.query(`
      SELECT
        si.SeguimientoIndicadorId,
        si.ActividadId,
        si.IndicadorGrupoId,
        si.EstudianteId,
        si.ValorSeleccionado,
        si.Observacion,
        ig.TipoUso,
        ig.PlaneamientoId,
        ig.IndicadorBase,
        ig.IndicadorAvanzado,
        ig.IndicadorIntermedio,
        ig.IndicadorInicial
      FROM Eval360_SeguimientoIndicador si
      INNER JOIN Eval360_Actividad a ON a.ActividadId = si.ActividadId
      INNER JOIN Eval360_IndicadorGrupo ig ON ig.IndicadorGrupoId = si.IndicadorGrupoId
      WHERE a.EstructuraGrupoId = @estructuraGrupoId
        AND a.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
        AND si.EstudianteId = @estudianteId
        AND a.Activo = 1
        AND ig.Activo = 1
        ${filtroPlaneamiento}
      ORDER BY si.SeguimientoIndicadorId
    `);

    ok(res, result.recordset);
  } catch (error) {
    serverError(res, error);
  }
});

router.post("/seguimiento-indicadores", async (req, res) => {
  const transactionPool = await getPool();
  const transaction = new sql.Transaction(transactionPool);

  try {
    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const planeamientoId = toRequiredNumber(req.body.planeamientoId, "planeamientoId", res);
    const estudianteId = toRequiredNumber(req.body.estudianteId, "estudianteId", res);
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];

    if (!estructuraGrupoId || !estructuraGrupoDetalleId || !planeamientoId || !estudianteId) return;
    if (!registros.length) return badRequest(res, "Debés seleccionar al menos un indicador");

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();
    const componente = await getComponente(pool, estructuraGrupoDetalleId, estructuraGrupoId);
    if (!componente) return badRequest(res, "El componente no pertenece al grupo seleccionado");

    const tipoUso = getTipoUsoFromNombre(componente.Nombre || "");
    if (!["COTIDIANO", "TAREA"].includes(tipoUso)) {
      return badRequest(res, "Este componente no se evalúa por indicadores");
    }

    const actividadNombre = `${componente.Nombre} - ${grupo.PeriodoNombre}`;
    const actividadId = await getOrCreateActividad(pool, {
      estructuraGrupoId,
      estructuraGrupoDetalleId,
      nombre: actividadNombre,
      fuente: tipoUso,
      puntosMaximos: 3,
      fecha: null
    });

    await transaction.begin();

    const requestDelete = new sql.Request(transaction);
    await requestDelete
      .input("actividadId", sql.Int, actividadId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        DELETE FROM Eval360_SeguimientoIndicador
        WHERE ActividadId = @actividadId
          AND EstudianteId = @estudianteId
      `);

    for (const item of registros) {
      const indicadorGrupoId = Number(item.IndicadorGrupoId || item.indicadorGrupoId);
      const valorSeleccionado = Number(item.ValorSeleccionado || item.valorSeleccionado);
      const observacion = normalizeText(item.Observacion || item.observacion);

      if (!Number.isFinite(indicadorGrupoId) || indicadorGrupoId <= 0) continue;
      if (![1, 2, 3].includes(valorSeleccionado)) continue;

      const validaIndicador = await new sql.Request(transaction)
        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
        .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("tipoUso", sql.NVarChar(50), tipoUso)
        .query(`
          SELECT TOP 1 IndicadorGrupoId
          FROM Eval360_IndicadorGrupo
          WHERE IndicadorGrupoId = @indicadorGrupoId
            AND EstructuraGrupoId = @estructuraGrupoId
            AND PlaneamientoId = @planeamientoId
            AND UPPER(TipoUso) = @tipoUso
            AND Activo = 1
        `);

      if (!validaIndicador.recordset[0]) continue;

      const nivelDesempenoGrupoId = await getOrCreateNivelDesempeno(transaction, estructuraGrupoId, valorSeleccionado);

      await new sql.Request(transaction)
        .input("actividadId", sql.Int, actividadId)
        .input("indicadorGrupoId", sql.Int, indicadorGrupoId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("valorSeleccionado", sql.Decimal(10, 2), valorSeleccionado)
        .input("nivelDesempenoGrupoId", sql.Int, nivelDesempenoGrupoId)
        .input("observacion", sql.NVarChar(sql.MAX), observacion || null)
        .query(`
          INSERT INTO Eval360_SeguimientoIndicador
            (ActividadId, IndicadorGrupoId, EstudianteId, NivelDesempenoGrupoId, ValorSeleccionado, Observacion, CreatedAt)
          VALUES
            (@actividadId, @indicadorGrupoId, @estudianteId, @nivelDesempenoGrupoId, @valorSeleccionado, @observacion, SYSDATETIME())
        `);
    }

    await transaction.commit();

    const resumen = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .input("estudianteId", sql.Int, estudianteId)
      .input("porcentajeComponente", sql.Decimal(10, 2), Number(componente.Porcentaje || 0))
      .query(`
        WITH asignados AS (
          SELECT COUNT(DISTINCT ai.IndicadorGrupoId) AS TotalAsignados
          FROM Eval360_ActividadIndicador ai
          WHERE ai.ActividadId = @actividadId
            AND ISNULL(ai.Activo, 1) = 1
        ),
        evaluados AS (
          SELECT
            COUNT(*) AS TotalEvaluados,
            ISNULL(SUM(ValorSeleccionado), 0) AS PuntosObtenidos
          FROM Eval360_SeguimientoIndicador
          WHERE ActividadId = @actividadId
            AND EstudianteId = @estudianteId
        )
        SELECT
          CAST(e.TotalEvaluados AS INT) AS TotalIndicadores,
          e.PuntosObtenidos,
          CASE WHEN ISNULL(a.TotalAsignados, 0) > 0 THEN a.TotalAsignados * 3 ELSE e.TotalEvaluados * 3 END AS PuntosMaximos,
          CASE
            WHEN (CASE WHEN ISNULL(a.TotalAsignados, 0) > 0 THEN a.TotalAsignados * 3 ELSE e.TotalEvaluados * 3 END) = 0 THEN 0
            ELSE (e.PuntosObtenidos / (CASE WHEN ISNULL(a.TotalAsignados, 0) > 0 THEN a.TotalAsignados * 3.0 ELSE e.TotalEvaluados * 3.0 END)) * 100
          END AS NotaSobre100,
          CASE
            WHEN (CASE WHEN ISNULL(a.TotalAsignados, 0) > 0 THEN a.TotalAsignados * 3 ELSE e.TotalEvaluados * 3 END) = 0 THEN 0
            ELSE ((e.PuntosObtenidos / (CASE WHEN ISNULL(a.TotalAsignados, 0) > 0 THEN a.TotalAsignados * 3.0 ELSE e.TotalEvaluados * 3.0 END)) * @porcentajeComponente)
          END AS PorcentajeObtenido
        FROM evaluados e
        CROSS JOIN asignados a
      `);

    ok(res, { actividadId, ...resumen.recordset[0] }, "Seguimiento guardado correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    serverError(res, error);
  }
});

router.post("/examenes", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.body.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.body.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const estudianteId = toRequiredNumber(req.body.estudianteId, "estudianteId", res);
    const nombre = normalizeText(req.body.nombre || "Examen");
    const puntosObtenidos = Number(req.body.puntosObtenidos);
    const puntosMaximos = Number(req.body.puntosMaximos);
    const fecha = normalizeText(req.body.fecha) || null;
    const observacion = normalizeText(req.body.observacion) || null;

    if (!estructuraGrupoId || !estructuraGrupoDetalleId || !estudianteId) return;
    if (!Number.isFinite(puntosObtenidos) || puntosObtenidos < 0) return badRequest(res, "Los puntos obtenidos son inválidos");
    if (!Number.isFinite(puntosMaximos) || puntosMaximos <= 0) return badRequest(res, "Los puntos máximos son inválidos");
    if (puntosObtenidos > puntosMaximos) return badRequest(res, "Los puntos obtenidos no pueden superar los puntos máximos");

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();
    const componente = await getComponente(pool, estructuraGrupoDetalleId, estructuraGrupoId);
    if (!componente) return badRequest(res, "El componente no pertenece al grupo seleccionado");

    const actividadId = await getOrCreateActividad(pool, {
      estructuraGrupoId,
      estructuraGrupoDetalleId,
      nombre,
      fuente: "EXAMEN",
      puntosMaximos,
      fecha
    });

    const notaSobre100 = Number(((puntosObtenidos / puntosMaximos) * 100).toFixed(2));
    const porcentajeObtenido = Number(((notaSobre100 / 100) * Number(componente.Porcentaje || 0)).toFixed(2));

    const existente = await pool.request()
      .input("actividadId", sql.Int, actividadId)
      .input("estudianteId", sql.Int, estudianteId)
      .query(`
        SELECT TOP 1 NotaActividadId
        FROM Eval360_NotaActividad
        WHERE ActividadId = @actividadId
          AND EstudianteId = @estudianteId
      `);

    if (existente.recordset[0]?.NotaActividadId) {
      await pool.request()
        .input("notaActividadId", sql.Int, existente.recordset[0].NotaActividadId)
        .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)
        .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
        .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)
        .input("observacion", sql.NVarChar(sql.MAX), observacion)
        .query(`
          UPDATE Eval360_NotaActividad
          SET PuntosObtenidos = @puntosObtenidos,
              PuntosMaximos = @puntosMaximos,
              PorcentajeObtenido = @porcentajeObtenido,
              Observacion = @observacion,
              UpdatedAt = SYSDATETIME()
          WHERE NotaActividadId = @notaActividadId
        `);
    } else {
      await pool.request()
        .input("actividadId", sql.Int, actividadId)
        .input("estudianteId", sql.Int, estudianteId)
        .input("puntosObtenidos", sql.Decimal(10, 2), puntosObtenidos)
        .input("puntosMaximos", sql.Decimal(10, 2), puntosMaximos)
        .input("porcentajeObtenido", sql.Decimal(10, 2), porcentajeObtenido)
        .input("observacion", sql.NVarChar(sql.MAX), observacion)
        .query(`
          INSERT INTO Eval360_NotaActividad
            (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, Observacion, CreatedAt)
          VALUES
            (@actividadId, @estudianteId, @puntosObtenidos, @puntosMaximos, @porcentajeObtenido, @observacion, SYSDATETIME())
        `);
    }

    ok(res, { actividadId, notaSobre100, porcentajeObtenido }, "Examen guardado correctamente");
  } catch (error) {
    serverError(res, error);
  }
});

router.get("/asistencia/resumen", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.query.estructuraGrupoId, "estructuraGrupoId", res);
    const estructuraGrupoDetalleId = toRequiredNumber(req.query.estructuraGrupoDetalleId, "estructuraGrupoDetalleId", res);
    const estudianteId = toRequiredNumber(req.query.estudianteId, "estudianteId", res);
    if (!estructuraGrupoId || !estructuraGrupoDetalleId || !estudianteId) return;

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();
    const componente = await getComponente(pool, estructuraGrupoDetalleId, estructuraGrupoId);
    if (!componente) return badRequest(res, "El componente no pertenece al grupo seleccionado");

    const result = await pool.request()
      .input("estudianteId", sql.Int, estudianteId)
      .input("grupoId", sql.Int, grupo.GrupoId)
      .input("materiaId", sql.Int, grupo.MateriaId)
      .input("anioLectivoId", sql.Int, grupo.AnioLectivoId)
      .input("periodoId", sql.Int, grupo.PeriodoId)
      .query(`
        SELECT
          COUNT(*) AS TotalLecciones,
          SUM(CASE WHEN UPPER(Estado) IN (N'AUSENTE', N'AUSENCIA', N'AUSENTE INJUSTIFICADO', N'AUSENCIA INJUSTIFICADA') THEN 1 ELSE 0 END) AS Ausencias
        FROM AsistenciaRegistro
        WHERE EstudianteId = @estudianteId
          AND GrupoId = @grupoId
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
      `);

    const totalLecciones = Number(result.recordset[0]?.TotalLecciones || 0);
    const ausencias = Number(result.recordset[0]?.Ausencias || 0);
    const resumen = calcularAsistenciaArticulo37(totalLecciones, ausencias, Number(componente.Porcentaje || 0));

    ok(res, resumen);
  } catch (error) {
    serverError(res, error);
  }
});

router.get("/consolidado", async (req, res) => {
  try {
    const estructuraGrupoId = toRequiredNumber(req.query.estructuraGrupoId, "estructuraGrupoId", res);
    const estudianteId = toRequiredNumber(req.query.estudianteId, "estudianteId", res);
    if (!estructuraGrupoId || !estudianteId) return;

    const grupo = await getEstructuraGrupo(req, res, estructuraGrupoId);
    if (!grupo) return forbidden(res, "No tenés acceso a este grupo o no existe");

    const pool = await getPool();

    const componentes = await pool.request()
      .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
      .query(`
        SELECT EstructuraGrupoDetalleId, Nombre, Porcentaje
        FROM Eval360_EstructuraGrupoDetalle
        WHERE EstructuraGrupoId = @estructuraGrupoId
          AND Activo = 1
        ORDER BY Orden, EstructuraGrupoDetalleId
      `);

    const detalle: any[] = [];

    for (const componente of componentes.recordset) {
      const tipo = getTipoUsoFromNombre(componente.Nombre || "");
      const porcentaje = Number(componente.Porcentaje || 0);

      if (["COTIDIANO", "TAREA"].includes(tipo)) {
        const result = await pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .input("estructuraGrupoDetalleId", sql.Int, componente.EstructuraGrupoDetalleId)
          .input("estudianteId", sql.Int, estudianteId)
          .input("porcentajeComponente", sql.Decimal(10, 2), porcentaje)
          .query(`
            WITH por_actividad AS (
              SELECT
                a.ActividadId,
                COUNT(DISTINCT CASE WHEN ISNULL(ai.Activo, 1) = 1 THEN ai.IndicadorGrupoId END) AS TotalAsignados,
                ISNULL(SUM(CASE WHEN si.EstudianteId = @estudianteId THEN si.ValorSeleccionado ELSE 0 END), 0) AS PuntosObtenidos
              FROM Eval360_Actividad a
              LEFT JOIN Eval360_ActividadIndicador ai
                ON ai.ActividadId = a.ActividadId
              LEFT JOIN Eval360_SeguimientoIndicador si
                ON si.ActividadId = a.ActividadId
                AND si.IndicadorGrupoId = ai.IndicadorGrupoId
              WHERE a.EstructuraGrupoId = @estructuraGrupoId
                AND a.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
                AND ISNULL(a.Activo, 1) = 1
              GROUP BY a.ActividadId
            )
            SELECT
              COUNT(1) AS TotalRegistros,
              ISNULL(SUM(PuntosObtenidos), 0) AS PuntosObtenidos,
              ISNULL(SUM(TotalAsignados * 3), 0) AS PuntosMaximos,
              CASE WHEN ISNULL(SUM(TotalAsignados * 3), 0) = 0 THEN 0 ELSE (ISNULL(SUM(PuntosObtenidos), 0) / ISNULL(SUM(TotalAsignados * 3.0), 0)) * 100 END AS NotaSobre100,
              CASE WHEN ISNULL(SUM(TotalAsignados * 3), 0) = 0 THEN 0 ELSE ((ISNULL(SUM(PuntosObtenidos), 0) / ISNULL(SUM(TotalAsignados * 3.0), 0)) * @porcentajeComponente) END AS PorcentajeObtenido
            FROM por_actividad
          `);
        detalle.push({ ...componente, Tipo: tipo, ...result.recordset[0] });
      } else if (tipo === "EXAMEN") {
        const result = await pool.request()
          .input("estructuraGrupoId", sql.Int, estructuraGrupoId)
          .input("estructuraGrupoDetalleId", sql.Int, componente.EstructuraGrupoDetalleId)
          .input("estudianteId", sql.Int, estudianteId)
          .query(`
            SELECT
              COUNT(*) AS TotalRegistros,
              AVG(ISNULL(na.NotaObtenida, 0)) AS NotaSobre100,
              AVG(ISNULL(na.PorcentajeObtenido, 0)) AS PorcentajeObtenido,
              SUM(ISNULL(na.PuntosObtenidos, 0)) AS PuntosObtenidos,
              SUM(ISNULL(na.PuntosMaximos, 0)) AS PuntosMaximos
            FROM Eval360_NotaActividad na
            INNER JOIN Eval360_Actividad a ON a.ActividadId = na.ActividadId
            WHERE a.EstructuraGrupoId = @estructuraGrupoId
              AND a.EstructuraGrupoDetalleId = @estructuraGrupoDetalleId
              AND na.EstudianteId = @estudianteId
              AND a.Activo = 1
          `);
        detalle.push({ ...componente, Tipo: tipo, ...result.recordset[0] });
      } else if (tipo === "ASISTENCIA") {
        const asistencia = await pool.request()
          .input("estudianteId", sql.Int, estudianteId)
          .input("grupoId", sql.Int, grupo.GrupoId)
          .input("materiaId", sql.Int, grupo.MateriaId)
          .input("anioLectivoId", sql.Int, grupo.AnioLectivoId)
          .input("periodoId", sql.Int, grupo.PeriodoId)
          .query(`
            SELECT
              COUNT(*) AS TotalLecciones,
              SUM(CASE WHEN UPPER(Estado) IN (N'AUSENTE', N'AUSENCIA', N'AUSENTE INJUSTIFICADO', N'AUSENCIA INJUSTIFICADA') THEN 1 ELSE 0 END) AS Ausencias
            FROM AsistenciaRegistro
            WHERE EstudianteId = @estudianteId
              AND GrupoId = @grupoId
              AND MateriaId = @materiaId
              AND AnioLectivoId = @anioLectivoId
              AND PeriodoId = @periodoId
          `);
        const resumen = calcularAsistenciaArticulo37(Number(asistencia.recordset[0]?.TotalLecciones || 0), Number(asistencia.recordset[0]?.Ausencias || 0), porcentaje);
        detalle.push({ ...componente, Tipo: tipo, TotalRegistros: resumen.totalLecciones, NotaSobre100: resumen.notaSobre100, PorcentajeObtenido: resumen.porcentajeObtenido, PorcentajeAusencias: resumen.porcentajeAusencias });
      } else {
        detalle.push({ ...componente, Tipo: tipo, TotalRegistros: 0, NotaSobre100: 0, PorcentajeObtenido: 0 });
      }
    }

    const notaFinal = Number(detalle.reduce((sum, item) => sum + Number(item.PorcentajeObtenido || 0), 0).toFixed(2));

    ok(res, { detalle, notaFinal });
  } catch (error) {
    serverError(res, error);
  }
});

export default router;
