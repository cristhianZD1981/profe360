import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, ok } from "../../utils/http";
import {
  bumpProfesorPeriodoEstadosVersion,
  hasProfesorPeriodoSchema
} from "./periodos-profesor.utils";

const router = Router();

router.use(requireAuth);
router.use(requireRoles("ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"));

function getInstitutionId(req: any, res: any) {
  const value = Number(req.auth?.institucionId);
  if (!Number.isInteger(value) || value <= 0) {
    badRequest(res, "El usuario no tiene institucion asignada");
    return null;
  }
  return value;
}

function getUserId(req: any) {
  const value = Number(req.auth?.userId ?? req.auth?.usuarioId ?? req.auth?.id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/estado-esquema", async (_req, res) => {
  try {
    const pool = await getPool();
    return ok(res, { listo: await hasProfesorPeriodoSchema(pool, true) });
  } catch (error) {
    console.error("Error verificando periodos por profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudo verificar la configuracion" });
  }
});

router.get("/", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    if (!await hasProfesorPeriodoSchema(pool)) {
      return res.status(409).json({
        ok: false,
        code: "PERIODOS_PROFESOR_SCHEMA_PENDIENTE",
        message: "Debe ejecutar la migracion de grupos anuales y periodos por profesor"
      });
    }

    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT TOP 1
          AnioLectivoId,
          Nombre,
          FechaInicio,
          FechaFin
        FROM dbo.AnioLectivo
        WHERE InstitucionId = @institucionId
          AND Activo = 1
        ORDER BY FechaInicio DESC, AnioLectivoId DESC;

        SELECT
          p.PeriodoId,
          p.AnioLectivoId,
          p.Nombre,
          p.NumeroOrden,
          p.FechaInicio,
          p.FechaFin
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = p.AnioLectivoId
        WHERE al.InstitucionId = @institucionId
          AND al.Activo = 1
          AND p.Activo = 1
        ORDER BY p.NumeroOrden, p.PeriodoId;

        SELECT
          u.UsuarioId,
          u.Correo,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          STRING_AGG(r.Nombre, N', ') AS Roles
        FROM dbo.Usuario u
        INNER JOIN dbo.UsuarioRol ur
          ON ur.UsuarioId = u.UsuarioId
         AND ur.Activo = 1
        INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
        WHERE u.InstitucionId = @institucionId
          AND u.Activo = 1
          AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
        GROUP BY u.UsuarioId, u.Correo, u.Nombre, u.PrimerApellido, u.SegundoApellido
        ORDER BY u.PrimerApellido, u.SegundoApellido, u.Nombre;

        SELECT
          ppe.UsuarioId,
          ppe.PeriodoId,
          ppe.Habilitado,
          ppe.UpdatedAt,
          ppe.CreatedAt
        FROM dbo.ProfesorPeriodoEstado ppe
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ppe.AnioLectivoId
        WHERE ppe.InstitucionId = @institucionId
          AND al.Activo = 1;
      `);

    return ok(res, {
      anioLectivo: result.recordsets[0]?.[0] || null,
      periodos: result.recordsets[1] || [],
      profesores: result.recordsets[2] || [],
      estados: result.recordsets[3] || []
    });
  } catch (error) {
    console.error("Error listando periodos por profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar los periodos por profesor" });
  }
});

router.put("/:usuarioId/periodos/:periodoId", async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!await hasProfesorPeriodoSchema(pool)) {
      return res.status(409).json({ ok: false, message: "La configuracion de periodos por profesor esta pendiente" });
    }

    const usuarioId = positiveId(req.params.usuarioId);
    const periodoId = positiveId(req.params.periodoId);
    const habilitado = req.body?.habilitado;
    if (!usuarioId || !periodoId || typeof habilitado !== "boolean") {
      return badRequest(res, "Profesor, periodo y estado son obligatorios");
    }

    const valid = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT TOP 1 p.AnioLectivoId
        FROM dbo.Periodo p
        INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = p.AnioLectivoId
        WHERE p.PeriodoId = @periodoId
          AND p.Activo = 1
          AND al.Activo = 1
          AND al.InstitucionId = @institucionId;

        SELECT CAST(CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.Usuario u
          WHERE u.UsuarioId = @usuarioId
            AND u.InstitucionId = @institucionId
            AND u.Activo = 1
            AND EXISTS (
              SELECT 1
              FROM dbo.UsuarioRol ur
              INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
              WHERE ur.UsuarioId = u.UsuarioId
                AND ur.Activo = 1
                AND r.Nombre IN (N'PROFESOR', N'PROFESOR_GUIA')
            )
        ) THEN 1 ELSE 0 END AS bit) AS ProfesorValido;
      `);

    const anioLectivoId = Number(valid.recordsets[0]?.[0]?.AnioLectivoId || 0);
    if (!anioLectivoId) return badRequest(res, "El periodo no pertenece al ano lectivo vigente");
    if (!valid.recordsets[1]?.[0]?.ProfesorValido) return badRequest(res, "El profesor no pertenece al centro educativo");

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    if (!habilitado) {
      const enabled = await new sql.Request(transaction)
        .input("institucionId", sql.Int, institucionId)
        .input("usuarioId", sql.Int, usuarioId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .query(`
          SELECT COUNT(*) AS Total
          FROM dbo.Periodo p WITH (UPDLOCK, HOLDLOCK)
          WHERE p.AnioLectivoId = @anioLectivoId
            AND p.Activo = 1
            AND p.PeriodoId <> @periodoId
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.ProfesorPeriodoEstado ppe WITH (UPDLOCK, HOLDLOCK)
              WHERE ppe.InstitucionId = @institucionId
                AND ppe.UsuarioId = @usuarioId
                AND ppe.AnioLectivoId = @anioLectivoId
                AND ppe.PeriodoId = p.PeriodoId
                AND ppe.Habilitado = 0
            );
        `);
      if (Number(enabled.recordset[0]?.Total || 0) < 1) {
        await transaction.rollback();
        return res.status(409).json({
          ok: false,
          code: "PROFESOR_SIN_PERIODO",
          message: "El profesor debe conservar al menos un periodo habilitado"
        });
      }
    }

    await new sql.Request(transaction)
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId)
      .input("anioLectivoId", sql.Int, anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .input("habilitado", sql.Bit, habilitado)
      .input("usuarioRegistroId", sql.Int, getUserId(req))
      .query(`
        MERGE dbo.ProfesorPeriodoEstado AS target
        USING (SELECT
          @institucionId AS InstitucionId,
          @usuarioId AS UsuarioId,
          @anioLectivoId AS AnioLectivoId,
          @periodoId AS PeriodoId
        ) AS source
        ON target.InstitucionId = source.InstitucionId
         AND target.UsuarioId = source.UsuarioId
         AND target.AnioLectivoId = source.AnioLectivoId
         AND target.PeriodoId = source.PeriodoId
        WHEN MATCHED THEN
          UPDATE SET Habilitado = @habilitado,
                     UsuarioRegistroId = @usuarioRegistroId,
                     UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (InstitucionId, UsuarioId, AnioLectivoId, PeriodoId, Habilitado, UsuarioRegistroId)
          VALUES (@institucionId, @usuarioId, @anioLectivoId, @periodoId, @habilitado, @usuarioRegistroId);

        INSERT INTO dbo.ProfesorPeriodoEstadoHistorial
          (InstitucionId, UsuarioId, AnioLectivoId, PeriodoId, Habilitado, Origen, UsuarioRegistroId)
        VALUES
          (@institucionId, @usuarioId, @anioLectivoId, @periodoId, @habilitado, N'ADMINISTRATIVO', @usuarioRegistroId);
      `);
    await transaction.commit();
    bumpProfesorPeriodoEstadosVersion();
    return ok(res, { usuarioId, periodoId, habilitado }, "Periodo del profesor actualizado correctamente");
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    console.error("Error actualizando periodo del profesor:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el periodo del profesor" });
  }
});

export default router;
