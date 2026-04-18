import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.get("/resumen", async (req, res) => {
  const pool = await getPool();
  const institucionId = req.auth?.institucionId ?? null;
  const q = (query: string) => pool.request().input("institucionId", sql.Int, institucionId).query(query);
  const [users, students, grupos] = await Promise.all([
    q(`SELECT COUNT(*) total FROM dbo.Usuario WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
    q(`SELECT COUNT(*) total FROM dbo.Estudiante WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
    q(`SELECT COUNT(*) total FROM dbo.Grupo WHERE @institucionId IS NULL OR InstitucionId = @institucionId`)
  ]);

  return ok(res, {
    usuarios: users.recordset[0].total,
    estudiantes: students.recordset[0].total,
    grupos: grupos.recordset[0].total,
    tareas: 0,
    incidencias: 0,
    modulos: ["Multiinstitución", "Asistencia", "Evaluación", "Tareas", "Trabajo cotidiano", "Incidencias", "Reportes", "Centro de ayuda"]
  });
});
export default router;
