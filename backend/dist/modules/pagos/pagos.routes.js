"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const database_1 = require("../../config/database");
const http_1 = require("../../utils/http");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.requireAuth);
router.get("/suscripciones", async (req, res) => {
    const pool = await (0, database_1.getPool)();
    const result = await pool.request().input("institucionId", database_1.sql.Int, req.auth?.institucionId ?? null).query(`
    SELECT s.SuscripcionId, p.Nombre AS Plan, es.Nombre AS Estado, s.FechaInicio, s.FechaFin, s.Monto, s.Moneda
    FROM dbo.Suscripcion s
    INNER JOIN dbo.PlanComercial p ON p.PlanId = s.PlanId
    INNER JOIN dbo.EstadoSuscripcion es ON es.EstadoSuscripcionId = s.EstadoSuscripcionId
    WHERE (@institucionId IS NULL OR s.InstitucionId = @institucionId)
  `);
    return (0, http_1.ok)(res, result.recordset);
});
router.post("/simular-link", async (req, res) => (0, http_1.created)(res, {
    proveedor: "Tilopay",
    modo: "estructura lista",
    url: "https://demo.profe360.cr/pago/simulado",
    payload: req.body
}, "Estructura de pago preparada"));
exports.default = router;
