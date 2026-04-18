"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const password_1 = require("../../utils/password");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
const ROLES_PERMITIDOS_SUPER_ADMIN = [
    "SUPER_ADMIN",
    "ADMIN_INSTITUCIONAL",
    "PROFESOR",
    "PROFESOR_GUIA",
    "ADMINISTRATIVO",
    "PADRE_FAMILIA"
];
const ROLES_PERMITIDOS_GESTION_INSTITUCIONAL = [
    "PROFESOR",
    "PROFESOR_GUIA",
    "ADMINISTRATIVO",
    "PADRE_FAMILIA"
];
function getRolesPermitidos(currentRoles) {
    if (currentRoles.includes("SUPER_ADMIN")) {
        return ROLES_PERMITIDOS_SUPER_ADMIN;
    }
    if (currentRoles.includes("ADMIN_INSTITUCIONAL") ||
        currentRoles.includes("ADMINISTRATIVO")) {
        return ROLES_PERMITIDOS_GESTION_INSTITUCIONAL;
    }
    return [];
}
function validarRolesAsignables(currentRoles, roleNames) {
    const permitidos = getRolesPermitidos(currentRoles);
    return roleNames.every((role) => permitidos.includes(String(role)));
}
router.get("/", async (req, res) => {
    try {
        const q = String(req.query.q || "").trim();
        const pool = await (0, database_1.getPool)();
        const request = pool.request()
            .input("institucionId", database_1.sql.Int, req.auth?.institucionId ?? null)
            .input("q", database_1.sql.NVarChar, `%${q}%`);
        const result = await request.query(`
      SELECT
        u.UsuarioId,
        u.InstitucionId,
        i.Nombre AS InstitucionNombre,
        i.NombreComercial AS InstitucionNombreComercial,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.Telefono,
        u.Activo,
        COALESCE(STRING_AGG(r.Nombre, ', '), '') AS Roles
      FROM dbo.Usuario u
      LEFT JOIN dbo.Institucion i
        ON i.InstitucionId = u.InstitucionId
      LEFT JOIN dbo.UsuarioRol ur
        ON ur.UsuarioId = u.UsuarioId
       AND ur.Activo = 1
      LEFT JOIN dbo.Rol r
        ON r.RolId = ur.RolId
      WHERE (@institucionId IS NULL OR u.InstitucionId = @institucionId)
        AND (
          @q = '%%'
          OR u.Correo LIKE @q
          OR u.Nombre LIKE @q
          OR u.PrimerApellido LIKE @q
          OR u.SegundoApellido LIKE @q
        )
      GROUP BY
        u.UsuarioId,
        u.InstitucionId,
        i.Nombre,
        i.NombreComercial,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.Telefono,
        u.Activo
      ORDER BY u.UsuarioId DESC
    `);
        return (0, http_1.ok)(res, result.recordset);
    }
    catch (error) {
        console.error("Error al listar usuarios:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al listar usuarios"
        });
    }
});
router.post("/", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    const txPool = await (0, database_1.getPool)();
    const tx = new database_1.sql.Transaction(txPool);
    try {
        const { correo, password, nombre, primerApellido, segundoApellido, telefono, institucionId, roleNames = [] } = req.body;
        if (!correo || !password || !nombre) {
            return (0, http_1.badRequest)(res, "correo, password y nombre son obligatorios");
        }
        if (!Array.isArray(roleNames) || roleNames.length === 0) {
            return (0, http_1.badRequest)(res, "Debe seleccionar al menos un rol");
        }
        if (!validarRolesAsignables(req.auth?.roles || [], roleNames)) {
            return res.status(403).json({
                ok: false,
                message: "No tenés permisos para asignar uno o más de los roles seleccionados"
            });
        }
        const targetInstitucionId = req.auth?.roles.includes("SUPER_ADMIN")
            ? Number(institucionId || req.auth?.institucionId || 0)
            : Number(req.auth?.institucionId || 0);
        if (!targetInstitucionId) {
            return (0, http_1.badRequest)(res, "institucionId es obligatorio");
        }
        const pool = await (0, database_1.getPool)();
        const existe = await pool.request()
            .input("correo", database_1.sql.NVarChar, correo)
            .query(`
          SELECT TOP 1 UsuarioId
          FROM dbo.Usuario
          WHERE Correo = @correo
        `);
        if (existe.recordset.length > 0) {
            return res.status(409).json({
                ok: false,
                code: "USUARIO_DUPLICADO",
                message: "Ya existe un usuario con ese correo"
            });
        }
        await tx.begin();
        const hash = await (0, password_1.hashPassword)(password);
        const insertUser = await new database_1.sql.Request(tx)
            .input("institucionId", database_1.sql.Int, targetInstitucionId)
            .input("correo", database_1.sql.NVarChar, correo)
            .input("hashPassword", database_1.sql.NVarChar, hash)
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
            .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
            .input("telefono", database_1.sql.NVarChar, telefono || null)
            .query(`
          INSERT INTO dbo.Usuario
          (
            InstitucionId,
            Correo,
            HashPassword,
            Nombre,
            PrimerApellido,
            SegundoApellido,
            Telefono,
            Activo
          )
          OUTPUT INSERTED.UsuarioId, INSERTED.InstitucionId, INSERTED.Correo, INSERTED.Nombre, INSERTED.PrimerApellido, INSERTED.Activo
          VALUES
          (
            @institucionId,
            @correo,
            @hashPassword,
            @nombre,
            @primerApellido,
            @segundoApellido,
            @telefono,
            1
          )
        `);
        const createdUser = insertUser.recordset[0];
        for (const roleName of roleNames) {
            await new database_1.sql.Request(tx)
                .input("usuarioId", database_1.sql.Int, createdUser.UsuarioId)
                .input("roleName", database_1.sql.NVarChar, String(roleName))
                .query(`
            INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
            SELECT @usuarioId, RolId, 1
            FROM dbo.Rol
            WHERE Nombre = @roleName
          `);
        }
        await tx.commit();
        return (0, http_1.created)(res, createdUser, "Usuario creado correctamente");
    }
    catch (error) {
        try {
            if (tx?._aborted === false || tx?._aborted == null) {
                await tx.rollback();
            }
        }
        catch { }
        console.error("Error al crear usuario:", error);
        if (error?.number === 2627 || error?.number === 2601) {
            return res.status(409).json({
                ok: false,
                code: "USUARIO_DUPLICADO",
                message: "Ya existe un usuario con ese correo"
            });
        }
        return res.status(500).json({
            ok: false,
            message: "Error interno al crear usuario"
        });
    }
});
router.put("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    const txPool = await (0, database_1.getPool)();
    const tx = new database_1.sql.Transaction(txPool);
    try {
        const id = Number(req.params.id);
        const { correo, nombre, primerApellido, segundoApellido, telefono, roleNames = [], institucionId } = req.body;
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        if (!correo || !nombre) {
            return (0, http_1.badRequest)(res, "correo y nombre son obligatorios");
        }
        if (!Array.isArray(roleNames) || roleNames.length === 0) {
            return (0, http_1.badRequest)(res, "Debe seleccionar al menos un rol");
        }
        if (!validarRolesAsignables(req.auth?.roles || [], roleNames)) {
            return res.status(403).json({
                ok: false,
                message: "No tenés permisos para asignar uno o más de los roles seleccionados"
            });
        }
        const esSuperAdmin = req.auth?.roles.includes("SUPER_ADMIN");
        const targetInstitucionId = esSuperAdmin
            ? Number(institucionId || req.auth?.institucionId || 0)
            : Number(req.auth?.institucionId || 0);
        if (!targetInstitucionId) {
            return (0, http_1.badRequest)(res, "institucionId es obligatorio");
        }
        const pool = await (0, database_1.getPool)();
        const existe = await pool.request()
            .input("correo", database_1.sql.NVarChar, correo)
            .input("id", database_1.sql.Int, id)
            .query(`
          SELECT TOP 1 UsuarioId
          FROM dbo.Usuario
          WHERE Correo = @correo
            AND UsuarioId <> @id
        `);
        if (existe.recordset.length > 0) {
            return res.status(409).json({
                ok: false,
                code: "USUARIO_DUPLICADO",
                message: "Ya existe otro usuario con ese correo"
            });
        }
        await tx.begin();
        const updateResult = await new database_1.sql.Request(tx)
            .input("id", database_1.sql.Int, id)
            .input("institucionFiltro", database_1.sql.Int, esSuperAdmin ? null : targetInstitucionId)
            .input("institucionId", database_1.sql.Int, targetInstitucionId)
            .input("correo", database_1.sql.NVarChar, correo)
            .input("nombre", database_1.sql.NVarChar, nombre)
            .input("primerApellido", database_1.sql.NVarChar, primerApellido || null)
            .input("segundoApellido", database_1.sql.NVarChar, segundoApellido || null)
            .input("telefono", database_1.sql.NVarChar, telefono || null)
            .query(`
          UPDATE dbo.Usuario
          SET
            InstitucionId = @institucionId,
            Correo = @correo,
            Nombre = @nombre,
            PrimerApellido = @primerApellido,
            SegundoApellido = @segundoApellido,
            Telefono = @telefono,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.UsuarioId, INSERTED.InstitucionId, INSERTED.Correo, INSERTED.Nombre, INSERTED.PrimerApellido, INSERTED.Activo
          WHERE UsuarioId = @id
            AND (@institucionFiltro IS NULL OR InstitucionId = @institucionFiltro)
        `);
        if (!updateResult.recordset.length) {
            await tx.rollback();
            return res.status(404).json({
                ok: false,
                message: "Usuario no encontrado"
            });
        }
        await new database_1.sql.Request(tx)
            .input("usuarioId", database_1.sql.Int, id)
            .query(`
          DELETE FROM dbo.UsuarioRol
          WHERE UsuarioId = @usuarioId
        `);
        for (const roleName of roleNames) {
            await new database_1.sql.Request(tx)
                .input("usuarioId", database_1.sql.Int, id)
                .input("roleName", database_1.sql.NVarChar, String(roleName))
                .query(`
            INSERT INTO dbo.UsuarioRol (UsuarioId, RolId, Activo)
            SELECT @usuarioId, RolId, 1
            FROM dbo.Rol
            WHERE Nombre = @roleName
          `);
        }
        await tx.commit();
        return (0, http_1.ok)(res, updateResult.recordset[0], "Usuario actualizado correctamente");
    }
    catch (error) {
        try {
            if (tx?._aborted === false || tx?._aborted == null) {
                await tx.rollback();
            }
        }
        catch { }
        console.error("Error al actualizar usuario:", error);
        if (error?.number === 2627 || error?.number === 2601) {
            return res.status(409).json({
                ok: false,
                code: "USUARIO_DUPLICADO",
                message: "Ya existe otro usuario con ese correo"
            });
        }
        return res.status(500).json({
            ok: false,
            message: "Error interno al actualizar usuario"
        });
    }
});
router.delete("/:id", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const esSuperAdmin = req.auth?.roles.includes("SUPER_ADMIN");
        const institucionId = Number(req.auth?.institucionId || 0);
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, esSuperAdmin ? null : institucionId)
            .query(`
          UPDATE dbo.Usuario
          SET
            Activo = 0,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.UsuarioId
          WHERE UsuarioId = @id
            AND (@institucionId IS NULL OR InstitucionId = @institucionId)
        `);
        if (!result.recordset.length) {
            return res.status(404).json({
                ok: false,
                message: "Usuario no encontrado"
            });
        }
        return (0, http_1.ok)(res, { UsuarioId: id }, "Usuario desactivado correctamente");
    }
    catch (error) {
        console.error("Error al desactivar usuario:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al desactivar usuario"
        });
    }
});
router.patch("/:id/reactivar", (0, auth_middleware_1.requireRoles)("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return (0, http_1.badRequest)(res, "Id inválido");
        }
        const esSuperAdmin = req.auth?.roles.includes("SUPER_ADMIN");
        const institucionId = Number(req.auth?.institucionId || 0);
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("id", database_1.sql.Int, id)
            .input("institucionId", database_1.sql.Int, esSuperAdmin ? null : institucionId)
            .query(`
          UPDATE dbo.Usuario
          SET
            Activo = 1,
            UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.UsuarioId
          WHERE UsuarioId = @id
            AND (@institucionId IS NULL OR InstitucionId = @institucionId)
        `);
        if (!result.recordset.length) {
            return res.status(404).json({
                ok: false,
                message: "Usuario no encontrado"
            });
        }
        return (0, http_1.ok)(res, { UsuarioId: id }, "Usuario reactivado correctamente");
    }
    catch (error) {
        console.error("Error al reactivar usuario:", error);
        return res.status(500).json({
            ok: false,
            message: "Error interno al reactivar usuario"
        });
    }
});
exports.default = router;
