import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.get("/suscripciones", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId ?? null).query(`
    SELECT s.SuscripcionId, p.Nombre AS Plan, es.Nombre AS Estado, s.FechaInicio, s.FechaFin, s.Monto, s.Moneda
    FROM dbo.Suscripcion s
    INNER JOIN dbo.PlanComercial p ON p.PlanId = s.PlanId
    INNER JOIN dbo.EstadoSuscripcion es ON es.EstadoSuscripcionId = s.EstadoSuscripcionId
    WHERE (@institucionId IS NULL OR s.InstitucionId = @institucionId)
  `);
  return ok(res, result.recordset);
});

router.post("/simular-link", async (req, res) => created(res, {
  proveedor: "Tilopay",
  modo: "estructura lista",
  url: "https://demo.profe360.cr/pago/simulado",
  payload: req.body
}, "Estructura de pago preparada"));
export default router;
