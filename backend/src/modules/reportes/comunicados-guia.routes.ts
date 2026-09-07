import { Router } from "express";
import { getPool, sql } from "../../config/database";
import { getCostaRicaIsoDate } from "../../utils/date.utils";
import { autorizarReporteGuia, cargarFiltrosGuia } from "./profe-guia-access";

export function registrarReporteComunicadosGuia(router: Router) {
  router.get("/guia/comunicados", async (req, res) => {
    try {
      const scope = await autorizarReporteGuia(req, res);
      if (!scope) return;
      const filtros = await cargarFiltrosGuia(scope);
      const hoy = getCostaRicaIsoDate();
      const desde = String(req.query.desde || scope.Desde);
      const hasta = String(req.query.hasta || (scope.Hasta < hoy ? scope.Hasta : hoy));
      const fechaValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
      if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) return res.status(400).json({ ok: false, message: "Indicá un rango de fechas válido" });
      const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
      const profesorId = req.query.profesorId ? Number(req.query.profesorId) : null;
      const materiaId = req.query.materiaId ? Number(req.query.materiaId) : null;
      if ([estudianteId, profesorId, materiaId].some(id => id !== null && (!Number.isInteger(id) || id <= 0))) return res.status(400).json({ ok: false, message: "Filtro inválido" });
      if (estudianteId && !filtros.alumnos.some((a: any) => a.EstudianteId === estudianteId)) return res.status(403).json({ ok: false, message: "El alumno no pertenece al grupo guía" });
      const pool = await getPool();
      const schema = await pool.request().query("SELECT OBJECT_ID('dbo.ComunicadoProfe', 'U') AS Id");
      if (!schema.recordset[0]?.Id) return res.json({ ok: true, data: { rows: [], grupo: scope.GrupoNombre, desde, hasta } });
      const result = await pool.request()
        .input("institucionId", sql.Int, scope.institucionId).input("grupoId", sql.Int, scope.grupoId)
        .input("anio", sql.Int, scope.anioLectivoId).input("periodo", sql.Int, scope.periodoId)
        .input("desde", sql.Date, desde).input("hasta", sql.Date, hasta).input("hoy", sql.Date, hoy)
        .input("estudianteId", sql.Int, estudianteId).input("profesorId", sql.Int, profesorId).input("materiaId", sql.Int, materiaId)
        .query(`SELECT c.ComunicadoId, c.EstudianteId, c.UsuarioId AS ProfesorId, c.MateriaId,
          CONVERT(varchar(10), c.Fecha, 23) AS Fecha, c.Hora, c.Mensaje, c.Estado, c.ContextoJson,
          e.Identificacion,
          (SELECT d.Canal, d.Destino, d.EncargadoNombre, d.CopiaProfesor, d.Estado, d.Motivo
            FROM dbo.ComunicadoProfeDestino d WHERE d.ComunicadoId = c.ComunicadoId FOR JSON PATH) AS DestinosJson
        FROM dbo.ComunicadoProfe c
        INNER JOIN dbo.Estudiante e ON e.EstudianteId = c.EstudianteId AND e.InstitucionId = @institucionId
        WHERE c.InstitucionId = @institucionId AND c.AnioLectivoId = @anio AND c.PeriodoId = @periodo
          AND EXISTS (SELECT 1 FROM dbo.Matricula ma WHERE ma.EstudianteId = c.EstudianteId
            AND ma.GrupoId = @grupoId AND ma.AnioLectivoId = @anio AND ISNULL(ma.Estado, N'') <> N'Inactiva')
          AND (c.GrupoId = @grupoId OR EXISTS (SELECT 1 FROM dbo.GrupoClaseSeccion gcs
            WHERE gcs.GrupoClaseId = c.GrupoClaseId AND gcs.GrupoId = @grupoId AND gcs.Activo = 1))
          AND c.Fecha >= @desde AND c.Fecha <= @hasta AND c.Fecha <= @hoy
          AND (@estudianteId IS NULL OR c.EstudianteId = @estudianteId)
          AND (@profesorId IS NULL OR c.UsuarioId = @profesorId)
          AND (@materiaId IS NULL OR c.MateriaId = @materiaId)
        ORDER BY c.Fecha DESC, c.Hora DESC, c.ComunicadoId DESC`);
      return res.json({ ok: true, data: { grupo: scope.GrupoNombre, desde, hasta,
        rows: result.recordset.map((r: any) => ({ ...r, contexto: JSON.parse(r.ContextoJson), destinos: JSON.parse(r.DestinosJson || "[]") })) } });
    } catch (error) {
      console.error("Error consultando comunicados del grupo guía", error);
      return res.status(500).json({ ok: false, message: "No se pudo consultar el reporte de comunicados" });
    }
  });
}
