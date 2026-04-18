"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../../config/database");
const password_1 = require("../../utils/password");
const http_1 = require("../../utils/http");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const router = (0, express_1.Router)();
function randomTempPassword() {
    const n = Math.floor(100000 + Math.random() * 900000);
    return `Temp${n}`;
}
async function getUserPayloadById(usuarioId) {
    const pool = await (0, database_1.getPool)();
    const userResult = await pool.request()
        .input("usuarioId", database_1.sql.Int, usuarioId)
        .query(`
      SELECT TOP 1
        u.UsuarioId,
        u.InstitucionId,
        u.SedeId,
        u.Correo,
        u.Nombre,
        u.PrimerApellido,
        u.SegundoApellido,
        u.Activo,
        ISNULL(u.DebeCambiarPassword, 0) AS DebeCambiarPassword,
        i.Nombre AS InstitucionNombre,
        i.NombreComercial AS InstitucionNombreComercial,
        i.LogoUrl AS InstitucionLogoUrl
      FROM dbo.Usuario u
      LEFT JOIN dbo.Institucion i
        ON i.InstitucionId = u.InstitucionId
      WHERE u.UsuarioId = @usuarioId
    `);
    if (!userResult.recordset.length)
        return null;
    const user = userResult.recordset[0];
    const rolesResult = await pool.request()
        .input("usuarioId", database_1.sql.Int, user.UsuarioId)
        .query(`
      SELECT r.Nombre
      FROM dbo.UsuarioRol ur
      INNER JOIN dbo.Rol r
        ON r.RolId = ur.RolId
      WHERE ur.UsuarioId = @usuarioId
        AND ur.Activo = 1
    `);
    return {
        userId: user.UsuarioId,
        correo: user.Correo,
        institucionId: user.InstitucionId,
        sedeId: user.SedeId,
        roles: rolesResult.recordset.map((row) => row.Nombre),
        nombre: `${user.Nombre ?? ""} ${user.PrimerApellido ?? ""}`.trim(),
        institucionNombre: user.InstitucionNombre,
        institucionNombreComercial: user.InstitucionNombreComercial,
        institucionLogoUrl: user.InstitucionLogoUrl,
        debeCambiarPassword: !!user.DebeCambiarPassword
    };
}
router.post("/login", async (req, res) => {
    try {
        const { correo, password } = req.body;
        if (!correo || !password) {
            return (0, http_1.badRequest)(res, "correo y password son obligatorios");
        }
        const pool = await (0, database_1.getPool)();
        const userResult = await pool.request()
            .input("correo", database_1.sql.NVarChar, correo)
            .query(`
        SELECT TOP 1
          u.UsuarioId,
          u.InstitucionId,
          u.SedeId,
          u.Correo,
          u.HashPassword,
          u.Nombre,
          u.PrimerApellido,
          u.SegundoApellido,
          u.Activo,
          ISNULL(u.DebeCambiarPassword, 0) AS DebeCambiarPassword,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.LogoUrl AS InstitucionLogoUrl
        FROM dbo.Usuario u
        LEFT JOIN dbo.Institucion i
          ON i.InstitucionId = u.InstitucionId
        WHERE u.Correo = @correo
      `);
        if (!userResult.recordset.length) {
            return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
        }
        const user = userResult.recordset[0];
        if (!user.Activo) {
            return res.status(403).json({ ok: false, message: "La cuenta está inactiva" });
        }
        const passwordOk = await (0, password_1.comparePassword)(password, user.HashPassword);
        if (!passwordOk) {
            return res.status(401).json({ ok: false, message: "Credenciales inválidas" });
        }
        const rolesResult = await pool.request()
            .input("usuarioId", database_1.sql.Int, user.UsuarioId)
            .query(`
        SELECT r.Nombre
        FROM dbo.UsuarioRol ur
        INNER JOIN dbo.Rol r ON r.RolId = ur.RolId
        WHERE ur.UsuarioId = @usuarioId AND ur.Activo = 1
      `);
        const payload = {
            userId: user.UsuarioId,
            correo: user.Correo,
            institucionId: user.InstitucionId,
            sedeId: user.SedeId,
            roles: rolesResult.recordset.map((row) => row.Nombre),
            nombre: `${user.Nombre ?? ""} ${user.PrimerApellido ?? ""}`.trim(),
            institucionNombre: user.InstitucionNombre,
            institucionNombreComercial: user.InstitucionNombreComercial,
            institucionLogoUrl: user.InstitucionLogoUrl,
            debeCambiarPassword: !!user.DebeCambiarPassword
        };
        const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "dev_secret_change_me", { expiresIn: "8h" });
        return (0, http_1.ok)(res, { token, user: payload });
    }
    catch (error) {
        console.error("Error en login:", error);
        return res.status(500).json({ ok: false, message: "Error interno al iniciar sesión" });
    }
});
router.post("/forgot-password", async (req, res) => {
    try {
        const { correo } = req.body;
        if (!correo)
            return (0, http_1.badRequest)(res, "correo es obligatorio");
        const pool = await (0, database_1.getPool)();
        const result = await pool.request()
            .input("correo", database_1.sql.NVarChar, correo)
            .query(`
        SELECT TOP 1
          u.UsuarioId,
          u.Correo,
          e.EstudianteId,
          e.Identificacion AS IdentificacionEstudiante,
          enc.Correo AS CorreoEncargado,
          enc.Nombre AS NombreEncargado,
          enc.PrimerApellido AS PrimerApellidoEncargado
        FROM dbo.Usuario u
        INNER JOIN dbo.UsuarioRol ur ON ur.UsuarioId = u.UsuarioId AND ur.Activo = 1
        INNER JOIN dbo.Rol r ON r.RolId = ur.RolId AND r.Nombre = N'PADRE_FAMILIA'
        LEFT JOIN dbo.Estudiante e ON e.Correo = u.Correo AND e.Activo = 1
        OUTER APPLY (
          SELECT TOP 1 ec.Correo, ec.Nombre, ec.PrimerApellido
          FROM dbo.EstudianteEncargado ee
          INNER JOIN dbo.Encargado ec ON ec.EncargadoId = ee.EncargadoId
          WHERE ee.EstudianteId = e.EstudianteId
            AND ISNULL(ee.Activo, 1) = 1
            AND ec.Correo IS NOT NULL
          ORDER BY CASE WHEN ee.EsPrincipal = 1 THEN 0 ELSE 1 END, ee.EstudianteEncargadoId DESC
        ) enc
        WHERE u.Correo = @correo
      `);
        if (!result.recordset.length) {
            return (0, http_1.ok)(res, { enviado: true }, "Si el correo existe, se procesó la recuperación");
        }
        const row = result.recordset[0];
        const tempPassword = randomTempPassword();
        const hash = await (0, password_1.hashPassword)(tempPassword);
        await pool.request()
            .input("usuarioId", database_1.sql.Int, row.UsuarioId)
            .input("hashPassword", database_1.sql.NVarChar, hash)
            .query(`
        UPDATE dbo.Usuario
        SET HashPassword = @hashPassword,
            DebeCambiarPassword = 1,
            UpdatedAt = SYSDATETIME()
        WHERE UsuarioId = @usuarioId
      `);
        return (0, http_1.ok)(res, {
            enviado: true,
            modo: "simulado",
            correoDestino: row.CorreoEncargado || null,
            usuario: row.Correo,
            claveTemporal: tempPassword
        }, row.CorreoEncargado
            ? `Se generó una clave temporal y se envió al correo del encargado ${row.CorreoEncargado}`
            : "Se generó una clave temporal, pero el estudiante no tiene correo de encargado registrado");
    }
    catch (error) {
        console.error("Error en forgot-password:", error);
        return res.status(500).json({ ok: false, message: "Error interno al recuperar la clave" });
    }
});
router.post("/change-password", auth_middleware_1.requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const usuarioId = req.auth?.userId;
        if (!usuarioId)
            return res.status(401).json({ ok: false, message: "No autenticado" });
        if (!currentPassword || !newPassword)
            return (0, http_1.badRequest)(res, "currentPassword y newPassword son obligatorios");
        const pool = await (0, database_1.getPool)();
        const result = await pool.request().input("usuarioId", database_1.sql.Int, usuarioId).query(`SELECT TOP 1 UsuarioId, HashPassword FROM dbo.Usuario WHERE UsuarioId = @usuarioId`);
        if (!result.recordset.length)
            return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
        const user = result.recordset[0];
        const okPassword = await (0, password_1.comparePassword)(currentPassword, user.HashPassword);
        if (!okPassword)
            return res.status(400).json({ ok: false, message: "La clave actual no es correcta" });
        const hash = await (0, password_1.hashPassword)(newPassword);
        await pool.request()
            .input("usuarioId", database_1.sql.Int, usuarioId)
            .input("hashPassword", database_1.sql.NVarChar, hash)
            .query(`UPDATE dbo.Usuario SET HashPassword = @hashPassword, DebeCambiarPassword = 0, UpdatedAt = SYSDATETIME() WHERE UsuarioId = @usuarioId`);
        const payload = await getUserPayloadById(usuarioId);
        const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || "dev_secret_change_me", { expiresIn: "8h" });
        return (0, http_1.ok)(res, { token, user: payload }, "Clave actualizada correctamente");
    }
    catch (error) {
        console.error("Error en change-password:", error);
        return res.status(500).json({ ok: false, message: "Error interno al cambiar la clave" });
    }
});
router.get("/me", auth_middleware_1.requireAuth, async (req, res) => {
    try {
        if (!req.auth?.userId) {
            return res.status(401).json({ ok: false, message: "No autenticado" });
        }
        const payload = await getUserPayloadById(req.auth.userId);
        if (!payload)
            return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
        return (0, http_1.ok)(res, payload);
    }
    catch (error) {
        console.error("Error en /me:", error);
        return res.status(500).json({ ok: false, message: "Error interno al consultar el usuario" });
    }
});
exports.default = router;
