import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok } from "../../utils/http";

const router = Router();
router.use(requireAuth);

router.get("/academico", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId).query(`
    SELECT TOP 50 g.Nombre AS Grupo, m.Nombre AS Materia, COUNT(DISTINCT mat.EstudianteId) AS Estudiantes
    FROM dbo.Grupo g
    LEFT JOIN dbo.GrupoMateria gm ON gm.GrupoId = g.GrupoId
    LEFT JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
    LEFT JOIN dbo.Matricula mat ON mat.GrupoId = g.GrupoId
    WHERE g.InstitucionId = @institucionId
    GROUP BY g.Nombre, m.Nombre
    ORDER BY g.Nombre
  `);
  return ok(res, result.recordset);
});

router.get("/padres", async (req, res) => {
  const pool = await getPool();
  const result = await pool.request().input("institucionId", sql.Int, req.auth?.institucionId).query(`
    SELECT TOP 50 e.Nombre, e.PrimerApellido, enc.Nombre AS Encargado, enc.Correo, enc.Telefono
    FROM dbo.Estudiante e
    LEFT JOIN dbo.EstudianteEncargado ee ON ee.EstudianteId = e.EstudianteId AND ee.EsPrincipal = 1
    LEFT JOIN dbo.Encargado enc ON enc.EncargadoId = ee.EncargadoId
    WHERE e.InstitucionId = @institucionId
    ORDER BY e.Nombre
  `);
  return ok(res, result.recordset);
});
export default router;
