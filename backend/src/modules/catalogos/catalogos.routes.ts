import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool } from "../../config/database";
import { ok } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.get("/roles", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`SELECT RolId, Nombre, Descripcion FROM dbo.Rol ORDER BY Nombre`);
  return ok(res, result.recordset);
});

router.get("/planes", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`SELECT PlanId, Nombre, Descripcion, TipoCobro, PrecioBase FROM dbo.PlanComercial ORDER BY PlanId`);
  return ok(res, result.recordset);
});

router.get("/canales", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`SELECT CanalNotificacionId, Nombre, Codigo FROM dbo.CanalNotificacion ORDER BY CanalNotificacionId`);
  return ok(res, result.recordset);
});
export default router;
