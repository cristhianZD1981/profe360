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

  const [users, students, grupos, enviosReporte, enviosBoleta] = await Promise.all([
    q(`SELECT COUNT(*) total FROM dbo.Usuario WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
    q(`SELECT COUNT(*) total FROM dbo.Estudiante WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
    q(`SELECT COUNT(*) total FROM dbo.Grupo WHERE @institucionId IS NULL OR InstitucionId = @institucionId`),
    q(`
      SELECT
        CorreosEnviados = ISNULL(SUM(CASE WHEN ISNULL(reb.CorreoEnviado, 0) = 1 THEN 1 ELSE 0 END), 0),
        WhatsAppEnviados = ISNULL(SUM(CASE WHEN ISNULL(reb.WaEnviado, 0) = 1 THEN 1 ELSE 0 END), 0)
      FROM dbo.ReporteEnvioBitacora reb
      LEFT JOIN dbo.Grupo g
        ON g.GrupoId = reb.GrupoId
      LEFT JOIN dbo.Estudiante e
        ON e.EstudianteId = reb.EstudianteId
      WHERE @institucionId IS NULL
        OR g.InstitucionId = @institucionId
        OR e.InstitucionId = @institucionId
    `),
    q(`
      SELECT
        CorreosEnviados = ISNULL(SUM(CASE WHEN ISNULL(be.CorreoEnviado, 0) = 1 THEN 1 ELSE 0 END), 0),
        WhatsAppEnviados = ISNULL(SUM(CASE WHEN ISNULL(be.WhatsAppEnviado, 0) = 1 THEN 1 ELSE 0 END), 0)
      FROM dbo.BoletaConductaEnvio be
      WHERE @institucionId IS NULL
        OR be.InstitucionId = @institucionId
    `)
  ]);

  return ok(res, {
    usuarios: Number(users.recordset[0]?.total || 0),
    estudiantes: Number(students.recordset[0]?.total || 0),
    grupos: Number(grupos.recordset[0]?.total || 0),
    correosEnviados: Number(enviosReporte.recordset[0]?.CorreosEnviados || 0) + Number(enviosBoleta.recordset[0]?.CorreosEnviados || 0),
    whatsappEnviados: Number(enviosReporte.recordset[0]?.WhatsAppEnviados || 0) + Number(enviosBoleta.recordset[0]?.WhatsAppEnviados || 0),
    modulos: ["Multiinstitucion", "Asistencia", "Evaluacion", "Tareas", "Trabajo cotidiano", "Incidencias", "Reportes", "Centro de ayuda"]
  });
});

export default router;
