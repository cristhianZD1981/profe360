"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get("/", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL"), async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";
        const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
        const institucionId = req.auth?.institucionId ?? null;
        if (!esSuperAdmin && !institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("q", database_1.sql.NVarChar, `%${q}%`)
            .input("incluirInactivas", database_1.sql.Bit, incluirInactivas)
            .input("esSuperAdmin", database_1.sql.Bit, esSuperAdmin)
            .input("institucionId", database_1.sql.Int, institucionId)
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
            OR NombreOficialBoleta LIKE @q
            OR RegionalEducativa LIKE @q
            OR CircuitoEducativo LIKE @q
          )
        ORDER BY InstitucionId DESC
      `);
        return (0, http_1.ok)(res, result.recordset);
    }
    catch (error) {
        console.error("Error al listar instituciones:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al listar instituciones"
        });
    }
});
router.post("/", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN"), async (req, res) => {
    try {
        const { tipoClienteId, nombre, nombreComercial, cedulaJuridica, correoPrincipal, telefonoPrincipal, direccion, logoUrl, membreteUrl, nombreOficialBoleta, regionalEducativa, circuitoEducativo } = req.body;
        if (!tipoClienteId || !nombre) {
            return (0, http_1.badRequest)(res, "tipoClienteId y nombre son obligatorios");
        }
        const pool = await (0, database_1.getPool)();
        const duplicado = await pool.request()
            .input("nombre", database_1.sql.NVarChar, nombre)
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
            .input("tipoClienteId", database_1.sql.Int, Number(tipoClienteId))
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("nombreComercial", database_1.sql.NVarChar, nombreComercial || null)
            .input("cedulaJuridica", database_1.sql.NVarChar, cedulaJuridica || null)
            .input("correoPrincipal", database_1.sql.NVarChar, correoPrincipal || null)
            .input("telefonoPrincipal", database_1.sql.NVarChar, telefonoPrincipal || null)
            .input("direccion", database_1.sql.NVarChar, direccion || null)
            .input("logoUrl", database_1.sql.NVarChar, logoUrl || null)
            .input("membreteUrl", database_1.sql.NVarChar, membreteUrl || null)
            .input("nombreOficialBoleta", database_1.sql.NVarChar, nombreOficialBoleta || null)
            .input("regionalEducativa", database_1.sql.NVarChar, regionalEducativa || null)
            .input("circuitoEducativo", database_1.sql.NVarChar, circuitoEducativo || null)
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
          @logoUrl,
          @membreteUrl,
          @nombreOficialBoleta,
          @regionalEducativa,
          @circuitoEducativo,
          1,
          SYSDATETIME()
        )
      `);
        return (0, http_1.created)(res, result.recordset[0], "Institución creada correctamente");
    }
    catch (error) {
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
router.put("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { tipoClienteId, nombre, nombreComercial, cedulaJuridica, correoPrincipal, telefonoPrincipal, direccion, logoUrl, membreteUrl, nombreOficialBoleta, regionalEducativa, circuitoEducativo } = req.body;
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!nombre) {
            return (0, http_1.badRequest)(res, "nombre es obligatorio");
        }
        const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
        const institucionId = req.auth?.institucionId ?? null;
        if (!esSuperAdmin && !institucionId) {
            return (0, http_1.badRequest)(res, "El usuario no tiene institución asignada");
        }
        const pool = await (0, database_1.getPool)();
        const duplicado = await pool.request()
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("id", database_1.sql.Int, id)
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
            .input("id", database_1.sql.Int, id)
            .input("esSuperAdmin", database_1.sql.Bit, esSuperAdmin)
            .input("institucionId", database_1.sql.Int, institucionId)
            .input("tipoClienteId", database_1.sql.Int, tipoClienteId ? Number(tipoClienteId) : null)
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("nombreComercial", database_1.sql.NVarChar, nombreComercial || null)
            .input("cedulaJuridica", database_1.sql.NVarChar, cedulaJuridica || null)
            .input("correoPrincipal", database_1.sql.NVarChar, correoPrincipal || null)
            .input("telefonoPrincipal", database_1.sql.NVarChar, telefonoPrincipal || null)
            .input("direccion", database_1.sql.NVarChar, direccion || null)
            .input("logoUrl", database_1.sql.NVarChar, logoUrl || null)
            .input("membreteUrl", database_1.sql.NVarChar, membreteUrl || null)
            .input("nombreOficialBoleta", database_1.sql.NVarChar, nombreOficialBoleta || null)
            .input("regionalEducativa", database_1.sql.NVarChar, regionalEducativa || null)
            .input("circuitoEducativo", database_1.sql.NVarChar, circuitoEducativo || null)
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
        return (0, http_1.ok)(res, result.recordset[0], "Institución actualizada correctamente");
    }
    catch (error) {
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
router.delete("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("id", database_1.sql.Int, id)
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
        return (0, http_1.ok)(res, { InstitucionId: id }, "Institución desactivada correctamente");
    }
    catch (error) {
        console.error("Error al desactivar institución:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al desactivar institución"
        });
    }
});
router.patch("/:id/reactivar", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("id", database_1.sql.Int, id)
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
        return (0, http_1.ok)(res, { InstitucionId: id }, "Institución reactivada correctamente");
    }
    catch (error) {
        console.error("Error al reactivar institución:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al reactivar institución"
        });
    }
});
exports.default = router;
