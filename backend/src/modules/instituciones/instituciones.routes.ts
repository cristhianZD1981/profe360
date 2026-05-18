import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { created, ok, badRequest } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.get("/", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";
    const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
    const institucionId = req.auth?.institucionId ?? null;

    if (!esSuperAdmin && !institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .input("esSuperAdmin", sql.Bit, esSuperAdmin)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          InstitucionId,
          TipoClienteId,
          Nombre,
          NombreComercial,
          CedulaJuridica,
          CorreoPrincipal,
          TelefonoPrincipal,
          Direccion,
          CodigoPresupuestario,
          DireccionExacta,
          LogoUrl,
          MembreteUrl,
          NombreOficialBoleta,
          RegionalEducativa,
          CircuitoEducativo,
          Activo
        FROM dbo.Institucion
        WHERE
          (@esSuperAdmin = 1 OR InstitucionId = @institucionId)
          AND (@incluirInactivas = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR NombreComercial LIKE @q
            OR CorreoPrincipal LIKE @q
            OR CedulaJuridica LIKE @q
            OR CodigoPresupuestario LIKE @q
            OR DireccionExacta LIKE @q
            OR NombreOficialBoleta LIKE @q
            OR RegionalEducativa LIKE @q
            OR CircuitoEducativo LIKE @q
          )
        ORDER BY InstitucionId DESC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar instituciones:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar instituciones"
    });
  }
});

router.post("/", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const {
      tipoClienteId,
      nombre,
      nombreComercial,
      cedulaJuridica,
      correoPrincipal,
      telefonoPrincipal,
      direccion,
      codigoPresupuestario,
      direccionExacta,
      logoUrl,
      membreteUrl,
      nombreOficialBoleta,
      regionalEducativa,
      circuitoEducativo
    } = req.body;

    if (!tipoClienteId || !nombre) {
      return badRequest(res, "tipoClienteId y nombre son obligatorios");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT TOP 1 InstitucionId
        FROM dbo.Institucion
        WHERE Nombre = @nombre
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe una institución con ese nombre"
      });
    }

    const result = await pool.request()
      .input("tipoClienteId", sql.Int, Number(tipoClienteId))
      .input("nombre", sql.NVarChar, nombre)
      .input("nombreComercial", sql.NVarChar, nombreComercial || null)
      .input("cedulaJuridica", sql.NVarChar, cedulaJuridica || null)
      .input("correoPrincipal", sql.NVarChar, correoPrincipal || null)
      .input("telefonoPrincipal", sql.NVarChar, telefonoPrincipal || null)
       .input("direccion", sql.NVarChar, direccion || null)
      .input("codigoPresupuestario", sql.NVarChar, codigoPresupuestario || null)
      .input("direccionExacta", sql.NVarChar, direccionExacta || null)
      .input("logoUrl", sql.NVarChar, logoUrl || null)
      .input("membreteUrl", sql.NVarChar, membreteUrl || null)
      .input("nombreOficialBoleta", sql.NVarChar, nombreOficialBoleta || null)
      .input("regionalEducativa", sql.NVarChar, regionalEducativa || null)
      .input("circuitoEducativo", sql.NVarChar, circuitoEducativo || null)
      .query(`
        INSERT INTO dbo.Institucion
        (
          TipoClienteId,
          Nombre,
          NombreComercial,
          CedulaJuridica,
          CorreoPrincipal,
          TelefonoPrincipal,
          Direccion,
          CodigoPresupuestario,
          DireccionExacta,
          LogoUrl,
          MembreteUrl,
          NombreOficialBoleta,
          RegionalEducativa,
          CircuitoEducativo,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @tipoClienteId,
          @nombre,
          @nombreComercial,
          @cedulaJuridica,
          @correoPrincipal,
          @telefonoPrincipal,
          @direccion,
          @codigoPresupuestario,
          @direccionExacta,
          @logoUrl,
          @membreteUrl,
          @nombreOficialBoleta,
          @regionalEducativa,
          @circuitoEducativo,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Institución creada correctamente");
  } catch (error: any) {
    console.error("Error al crear institución:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe una institución con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear institución"
    });
  }
});

router.put("/:id", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      tipoClienteId,
      nombre,
      nombreComercial,
      cedulaJuridica,
      correoPrincipal,
      telefonoPrincipal,
      direccion,
      codigoPresupuestario,
      direccionExacta,
      logoUrl,
      membreteUrl,
      nombreOficialBoleta,
      regionalEducativa,
      circuitoEducativo
    } = req.body;

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
    const institucionId = req.auth?.institucionId ?? null;

    if (!esSuperAdmin && !institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();

    const duplicado = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 InstitucionId
        FROM dbo.Institucion
        WHERE Nombre = @nombre
          AND InstitucionId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe otra institución con ese nombre"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("esSuperAdmin", sql.Bit, esSuperAdmin)
      .input("institucionId", sql.Int, institucionId)
      .input("tipoClienteId", sql.Int, tipoClienteId ? Number(tipoClienteId) : null)
      .input("nombre", sql.NVarChar, nombre)
      .input("nombreComercial", sql.NVarChar, nombreComercial || null)
      .input("cedulaJuridica", sql.NVarChar, cedulaJuridica || null)
      .input("correoPrincipal", sql.NVarChar, correoPrincipal || null)
      .input("telefonoPrincipal", sql.NVarChar, telefonoPrincipal || null)
       .input("direccion", sql.NVarChar, direccion || null)
      .input("codigoPresupuestario", sql.NVarChar, codigoPresupuestario || null)
      .input("direccionExacta", sql.NVarChar, direccionExacta || null)
      .input("logoUrl", sql.NVarChar, logoUrl || null)
      .input("membreteUrl", sql.NVarChar, membreteUrl || null)
      .input("nombreOficialBoleta", sql.NVarChar, nombreOficialBoleta || null)
      .input("regionalEducativa", sql.NVarChar, regionalEducativa || null)
      .input("circuitoEducativo", sql.NVarChar, circuitoEducativo || null)
      .query(`
        UPDATE dbo.Institucion
        SET
          TipoClienteId = CASE WHEN @esSuperAdmin = 1 AND @tipoClienteId IS NOT NULL THEN @tipoClienteId ELSE TipoClienteId END,
          Nombre = @nombre,
          NombreComercial = @nombreComercial,
          CedulaJuridica = @cedulaJuridica,
          CorreoPrincipal = @correoPrincipal,
          TelefonoPrincipal = @telefonoPrincipal,
          Direccion = @direccion,
          CodigoPresupuestario = @codigoPresupuestario,
          DireccionExacta = @direccionExacta,
          LogoUrl = @logoUrl,
          MembreteUrl = @membreteUrl,
          NombreOficialBoleta = @nombreOficialBoleta,
          RegionalEducativa = @regionalEducativa,
          CircuitoEducativo = @circuitoEducativo,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE InstitucionId = @id
          AND (@esSuperAdmin = 1 OR InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Institución actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar institución:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe otra institución con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar institución"
    });
  }
});

router.delete("/:id", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Institucion
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.InstitucionId
        WHERE InstitucionId = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, { InstitucionId: id }, "Institución desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar institución:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar institución"
    });
  }
});

router.patch("/:id/reactivar", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Institucion
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.InstitucionId
        WHERE InstitucionId = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, { InstitucionId: id }, "Institución reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar institución:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar institución"
    });
  }
});

export default router;
