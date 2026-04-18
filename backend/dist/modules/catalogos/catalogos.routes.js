"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get("/roles", async (_req, res) => {
    const pool = await (0, database_1.getPool)();
    const result = await pool.request().query(`SELECT RolId, Nombre, Descripcion FROM dbo.Rol ORDER BY Nombre`);
    return (0, http_1.ok)(res, result.recordset);
});
router.get("/planes", async (_req, res) => {
    const pool = await (0, database_1.getPool)();
    const result = await pool.request().query(`SELECT PlanId, Nombre, Descripcion, TipoCobro, PrecioBase FROM dbo.PlanComercial ORDER BY PlanId`);
    return (0, http_1.ok)(res, result.recordset);
});
router.get("/canales", async (_req, res) => {
    const pool = await (0, database_1.getPool)();
    const result = await pool.request().query(`SELECT CanalNotificacionId, Nombre, Codigo FROM dbo.CanalNotificacion ORDER BY CanalNotificacionId`);
    return (0, http_1.ok)(res, result.recordset);
});
exports.default = router;
