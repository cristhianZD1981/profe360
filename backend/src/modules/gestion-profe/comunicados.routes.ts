import { Router } from "express";
import { getPool, sql } from "../../config/database";
import { getCostaRicaIsoDate } from "../../utils/date.utils";
import { sendEmail } from "../../services/email.service";
import { sendWhatsAppNotification } from "../../services/whatsapp.service";
import { normalizeWhatsAppPhone } from "../../utils/whatsapp.utils";
import { ensureComunicados } from "./comunicados.schema";

const ruta = "/mis-grupos/:grupoId/materias/:materiaId/comunicados";
type Autorizar = (req: any, res: any, grupo: number, materia: number, anio: number, periodo: number, grupoClase?: number | null) => Promise<any>;
const nombre = (r: any) => [r.Nombre, r.PrimerApellido, r.SegundoApellido].filter(Boolean).join(" ").trim();
export function horaComunicado(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Costa_Rica", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
}
export function parametrosComunicado(ctx: any, mensaje: string) {
  return ["Comunicado", ctx.alumno, ctx.seccion, ctx.materia, ctx.fecha,
    mensaje, ctx.profesor, ctx.institucion];
}

export function registrarComunicados(router: Router, autorizar: Autorizar) {
  async function contexto(req: any, res: any) {
    const src = req.method === "POST" ? req.body : req.query;
    const grupoId = Number(req.params.grupoId), materiaId = Number(req.params.materiaId);
    const anioLectivoId = Number(src.anioLectivoId), periodoId = Number(src.periodoId);
    const grupoClaseId = src.grupoClaseId ? Number(src.grupoClaseId) : null;
    if (![grupoId, materiaId, anioLectivoId, periodoId, ...(grupoClaseId === null ? [] : [grupoClaseId])].every((id) => Number.isInteger(id) && id > 0)) {
      res.status(400).json({ ok: false, message: "Grupo, materia o período inválidos" }); return null;
    }
    const asignacion = await autorizar(req, res, grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId);
    if (!asignacion) { if (!res.headersSent) res.status(403).json({ ok: false, message: "No tenés permiso para enviar comunicados en este grupo" }); return null; }
    const pool = await getPool(); await ensureComunicados(pool);
    const usuarioId = Number(req.auth?.userId || req.auth?.usuarioId || req.auth?.id || 0);
    const institucionId = Number(asignacion.InstitucionId);
    const request = () => pool.request().input("institucionId", sql.Int, institucionId)
      .input("grupoId", sql.Int, grupoId).input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, anioLectivoId).input("periodoId", sql.Int, periodoId)
      .input("grupoClaseId", sql.Int, grupoClaseId).input("usuarioId", sql.Int, usuarioId);
    const alumnos = await request().query(`
      SELECT DISTINCT e.EstudianteId, e.Identificacion, e.Nombre, e.PrimerApellido, e.SegundoApellido,
        e.AutorizaWhatsAppEncargado
      FROM dbo.Matricula ma INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
      WHERE e.InstitucionId = @institucionId AND e.Activo = 1
        AND ma.AnioLectivoId = @anioLectivoId AND ISNULL(ma.Estado, N'') <> N'Inactiva'
        AND ((@grupoClaseId IS NULL AND ma.GrupoId = @grupoId) OR (@grupoClaseId IS NOT NULL AND EXISTS (
          SELECT 1 FROM dbo.GrupoClaseEstudiante gce WHERE gce.GrupoClaseId = @grupoClaseId
            AND gce.MatriculaId = ma.MatriculaId AND gce.Activo = 1
            AND (gce.FechaDesde IS NULL OR gce.FechaDesde <= CONVERT(date, DATEADD(hour, -6, SYSUTCDATETIME())))
            AND (gce.FechaHasta IS NULL OR gce.FechaHasta >= CONVERT(date, DATEADD(hour, -6, SYSUTCDATETIME())))
        ))) ORDER BY e.PrimerApellido, e.SegundoApellido, e.Nombre
    `);
    const lecciones = await request().query(`
      SELECT DISTINCT hg.HorarioGrupoId, hg.DiaSemana, bh.Nombre,
        CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio, CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin
      FROM dbo.HorarioGrupo hg INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
      INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
      WHERE gm.MateriaId = @materiaId AND gm.Activo = 1 AND hg.Activo = 1
        AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
        AND ((@grupoClaseId IS NULL AND gm.GrupoId = @grupoId) OR (@grupoClaseId IS NOT NULL
          AND EXISTS (SELECT 1 FROM dbo.GrupoClaseSeccion gcs WHERE gcs.GrupoClaseId = @grupoClaseId AND gcs.GrupoId = gm.GrupoId AND gcs.Activo = 1)
          AND EXISTS (SELECT 1 FROM dbo.GrupoClaseLeccionPatron p WHERE p.GrupoClaseId = @grupoClaseId AND p.DiaSemana = hg.DiaSemana AND p.BloqueHorarioId = hg.BloqueHorarioId AND p.Activo = 1)))
      ORDER BY hg.DiaSemana, HoraInicio
    `);
    const datos = await request().query(`SELECT u.Nombre, u.PrimerApellido, u.SegundoApellido, u.Correo,
      i.Nombre AS InstitucionNombre FROM dbo.Usuario u CROSS JOIN dbo.Institucion i
      WHERE u.UsuarioId = @usuarioId AND i.InstitucionId = @institucionId`);
    const now = new Date(), fecha = getCostaRicaIsoDate(now), hora = horaComunicado(now);
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
    const actual = lecciones.recordset.find((l: any) => l.DiaSemana === dia && l.HoraInicio <= hora.slice(0, 5) && l.HoraFin > hora.slice(0, 5));
    return { pool, request, asignacion, alumnos: alumnos.recordset, lecciones: lecciones.recordset,
      fecha, hora, horarioActualId: actual?.HorarioGrupoId || null, profesor: nombre(datos.recordset[0] || {}),
      correoProfesor: String(datos.recordset[0]?.Correo || ""), institucion: String(datos.recordset[0]?.InstitucionNombre || ""),
      grupoId, materiaId, anioLectivoId, periodoId, grupoClaseId, institucionId, usuarioId };
  }

  const filtro = `c.InstitucionId = @institucionId AND c.GrupoId = @grupoId AND c.MateriaId = @materiaId
    AND c.AnioLectivoId = @anioLectivoId AND c.PeriodoId = @periodoId
    AND ISNULL(c.GrupoClaseId, 0) = ISNULL(@grupoClaseId, 0)`;
  router.get(ruta, async (req, res) => {
    try {
      const ctx = await contexto(req, res); if (!ctx) return;
      const estudianteId = req.query.estudianteId ? Number(req.query.estudianteId) : null;
      if (estudianteId && !ctx.alumnos.some((e: any) => e.EstudianteId === estudianteId)) return res.status(403).json({ ok: false, message: "El alumno no pertenece al grupo" });
      const history = await ctx.request().input("estudianteId", sql.Int, estudianteId).query(`
        SELECT c.ComunicadoId, c.EstudianteId, c.Mensaje, c.ContextoJson, c.CreatedAt, c.Estado,
          (SELECT d.Canal, d.Destino, d.EncargadoNombre, d.CopiaProfesor, d.Estado, d.Motivo, d.ProveedorId, d.WhatsAppEnvioId
            FROM dbo.ComunicadoProfeDestino d WHERE d.ComunicadoId = c.ComunicadoId FOR JSON PATH) AS DestinosJson
        FROM dbo.ComunicadoProfe c WHERE ${filtro} AND (@estudianteId IS NULL OR c.EstudianteId = @estudianteId)
        ORDER BY c.CreatedAt DESC, c.ComunicadoId DESC
      `);
      return res.json({ ok: true, data: { alumnos: ctx.alumnos, lecciones: ctx.lecciones, fecha: ctx.fecha, hora: ctx.hora,
        horarioActualId: ctx.horarioActualId, materia: ctx.asignacion.MateriaNombre, profesor: ctx.profesor,
        institucion: ctx.institucion, correoProfesor: ctx.correoProfesor,
        historial: history.recordset.map((h: any) => ({ ...h, contexto: JSON.parse(h.ContextoJson), destinos: JSON.parse(h.DestinosJson || "[]") })) } });
    } catch (e) { console.error("Error consultando comunicados", e); return res.status(500).json({ ok: false, message: "No se pudieron cargar los comunicados" }); }
  });

  router.post(ruta, async (req, res) => {
    try {
      const mensaje = String(req.body.mensaje || "").trim(), solicitudId = String(req.body.solicitudId || "");
      if (!mensaje || mensaje.length > 800 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(solicitudId)) {
        return res.status(400).json({ ok: false, message: "Escribí un mensaje de hasta 800 caracteres" });
      }
      const ctx = await contexto(req, res); if (!ctx) return;
      const estudianteId = Number(req.body.estudianteId);
      const alumno = ctx.alumnos.find((a: any) => a.EstudianteId === estudianteId);
      if (!alumno) return res.status(403).json({ ok: false, message: "El alumno no pertenece al grupo" });
      const leccionSolicitada = ctx.lecciones.find((l: any) => l.HorarioGrupoId === Number(req.body.horarioGrupoId));
      if (req.body.horarioGrupoId != null && !leccionSolicitada) return res.status(400).json({ ok: false, message: "Lección inválida para el grupo y materia" });
      const leccion = ctx.lecciones.find((l: any) => l.HorarioGrupoId === ctx.horarioActualId);
      if (!ctx.correoProfesor) return res.status(400).json({ ok: false, message: "El profesor debe tener un correo registrado para recibir la copia" });
      const snapshot = { fecha: ctx.fecha, hora: ctx.hora, alumno: nombre(alumno), seccion: ctx.asignacion.GrupoNombre,
        materia: ctx.asignacion.MateriaNombre, profesor: ctx.profesor, institucion: ctx.institucion,
        leccion: leccion ? `${leccion.Nombre} (${leccion.HoraInicio}–${leccion.HoraFin})` : "Sin lección en el horario actual", correoProfesor: ctx.correoProfesor };
      const params = parametrosComunicado(snapshot, mensaje);
      const texto = `Comunicado\nAlumno: ${snapshot.alumno}\nSección: ${snapshot.seccion}\nFecha: ${snapshot.fecha} ${snapshot.hora}\nLección: ${snapshot.leccion}\nMateria: ${snapshot.materia}\nProfesor: ${snapshot.profesor}\nInstitución: ${snapshot.institucion}\n\n${mensaje}`;
      const asunto = `Comunicado — ${snapshot.alumno} — ${snapshot.materia}`;
      if (params.some((p) => String(p || "").length > 1024)) return res.status(400).json({ ok: false, message: "El mensaje y los datos de la lección superan el máximo de WhatsApp" });
      const contactos = await ctx.request().input("estudianteId", sql.Int, estudianteId).query(`
        SELECT DISTINCT en.EncargadoId, en.Nombre, en.Correo, en.Telefono
        FROM dbo.EstudianteEncargado ee INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
        WHERE ee.EstudianteId = @estudianteId AND ISNULL(ee.Activo, 1) = 1
          AND ISNULL(en.Activo, 1) = 1 AND ISNULL(ee.RecibeNotificaciones, 1) = 1
      `);
      if (!contactos.recordset.length) return res.status(400).json({ ok: false, message: "El alumno no tiene encargados habilitados para recibir notificaciones" });
      const destinos = contactos.recordset.flatMap((en: any) => [
        { encargado: en, canal: "CORREO", destino: String(en.Correo || "").trim(), motivo: "Sin correo del encargado" },
        { encargado: en, canal: "WHATSAPP", destino: normalizeWhatsAppPhone(en.Telefono), motivo: alumno.AutorizaWhatsAppEncargado ? "Sin teléfono del encargado" : "WhatsApp al encargado no autorizado" }
      ]).map((d: any) => ({ ...d, habilitado: Boolean(d.destino && (d.canal === "CORREO" || alumno.AutorizaWhatsAppEncargado)) }));
      const trans = new sql.Transaction(ctx.pool); await trans.begin();
      let comunicadoId: number;
      try {
        const prev = await new sql.Request(trans).input("solicitudId", sql.UniqueIdentifier, solicitudId).query(`SELECT * FROM dbo.ComunicadoProfe WITH (UPDLOCK, HOLDLOCK) WHERE SolicitudId = @solicitudId`);
        if (prev.recordset[0]) {
          await trans.rollback();
          const r = prev.recordset[0];
          if (r.UsuarioId !== ctx.usuarioId || r.InstitucionId !== ctx.institucionId || r.EstudianteId !== estudianteId || r.Mensaje !== mensaje || r.GrupoId !== ctx.grupoId || r.MateriaId !== ctx.materiaId) return res.status(409).json({ ok: false, message: "La solicitud ya fue utilizada para otro comunicado" });
          return res.json({ ok: true, data: { comunicadoId: Number(r.ComunicadoId), repetido: true, estado: r.Estado }, message: "El comunicado ya está registrado. Consultá su estado en el historial; no se volvió a enviar." });
        }
        const created = await new sql.Request(trans)
          .input("solicitudId", sql.UniqueIdentifier, solicitudId).input("institucionId", sql.Int, ctx.institucionId)
          .input("grupoId", sql.Int, ctx.grupoId).input("materiaId", sql.Int, ctx.materiaId).input("anio", sql.Int, ctx.anioLectivoId)
          .input("periodo", sql.Int, ctx.periodoId).input("grupoClaseId", sql.Int, ctx.grupoClaseId)
          .input("estudianteId", sql.Int, estudianteId).input("usuarioId", sql.Int, ctx.usuarioId)
          .input("horario", sql.Int, leccion?.HorarioGrupoId || null).input("fecha", sql.Date, ctx.fecha).input("hora", sql.VarChar(8), ctx.hora)
          .input("mensaje", sql.NVarChar(800), mensaje).input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot))
          .input("asunto", sql.NVarChar(600), asunto).input("texto", sql.NVarChar(sql.MAX), texto)
          .query(`INSERT INTO dbo.ComunicadoProfe (SolicitudId, InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, GrupoClaseId, EstudianteId, UsuarioId, HorarioGrupoId, Fecha, Hora, Mensaje, ContextoJson, AsuntoCorreo, CuerpoCorreo)
            OUTPUT INSERTED.ComunicadoId VALUES (@solicitudId,@institucionId,@grupoId,@materiaId,@anio,@periodo,@grupoClaseId,@estudianteId,@usuarioId,@horario,@fecha,@hora,@mensaje,@snapshot,@asunto,@texto)`);
        comunicadoId = Number(created.recordset[0].ComunicadoId);
        for (const d of destinos) {
          const row = await new sql.Request(trans).input("id", sql.BigInt, comunicadoId).input("encargadoId", sql.Int, d.encargado.EncargadoId)
            .input("nombre", sql.NVarChar(300), d.encargado.Nombre).input("canal", sql.NVarChar(15), d.canal)
            .input("destino", sql.NVarChar(320), d.destino || null).input("cc", sql.NVarChar(320), d.canal === "CORREO" ? ctx.correoProfesor : null)
            .input("estado", sql.NVarChar(30), d.habilitado ? "PENDIENTE" : "OMITIDO").input("motivo", sql.NVarChar(2000), d.habilitado ? null : d.motivo)
            .query(`INSERT INTO dbo.ComunicadoProfeDestino (ComunicadoId,EncargadoId,EncargadoNombre,Canal,Destino,CopiaProfesor,Estado,Motivo)
              OUTPUT INSERTED.ComunicadoDestinoId VALUES (@id,@encargadoId,@nombre,@canal,@destino,@cc,@estado,@motivo)`);
          d.id = Number(row.recordset[0].ComunicadoDestinoId);
        }
        await trans.commit();
      } catch (e) { try { await trans.rollback(); } catch {} throw e; }
      const resultados = [];
      for (const d of destinos) {
        if (!d.habilitado) { resultados.push({ estado: "OMITIDO" }); continue; }
        let result: any, estado: string;
        try {
          result = d.canal === "CORREO"
            ? await sendEmail({ to: d.destino, cc: ctx.correoProfesor, subject: asunto, text: texto, idempotencyKey: `comunicado-${solicitudId}-${d.id}` })
            : await sendWhatsAppNotification({ institucionId: ctx.institucionId, grupoId: ctx.grupoId, grupoClaseId: ctx.grupoClaseId, estudianteId,
              profesorUsuarioId: ctx.usuarioId, solicitadoPorUsuarioId: ctx.usuarioId, tipoMensaje: "COMUNICADO", telefono: d.destino, mensaje: texto, templateParams: params });
          estado = result.enviado ? "ACEPTADO" : (result.estado || (result.modo === "simulado" || result.modo === "omitido" ? "OMITIDO" : "FALLIDO"));
        } catch (e: any) { result = { enviado: false, motivo: e.message || "No se confirmó el resultado del proveedor" }; estado = "INCIERTO"; }
        await ctx.pool.request().input("id", sql.BigInt, d.id).input("estado", sql.NVarChar(30), estado)
          .input("motivo", sql.NVarChar(2000), String(result.motivo || result.error || "").slice(0, 2000) || null)
          .input("proveedor", sql.NVarChar(40), d.canal === "CORREO" ? "RESEND" : "2CHAT")
          .input("proveedorId", sql.NVarChar(150), result.id || result.messageUuid || null)
          .input("waId", sql.BigInt, result.whatsappEnvioId || null).input("resultado", sql.NVarChar(sql.MAX), JSON.stringify(result))
          .query(`UPDATE dbo.ComunicadoProfeDestino SET Estado=@estado,Motivo=@motivo,Proveedor=@proveedor,ProveedorId=@proveedorId,WhatsAppEnvioId=@waId,ResultadoJson=@resultado,ProcesadoAt=SYSUTCDATETIME() WHERE ComunicadoDestinoId=@id`);
        resultados.push({ estado });
      }
      const estado = resultados.every((r) => r.estado === "ACEPTADO") ? "COMPLETO" : "CON_OBSERVACIONES";
      await ctx.pool.request().input("id", sql.BigInt, comunicadoId).input("estado", sql.NVarChar(30), estado)
        .query(`UPDATE dbo.ComunicadoProfe SET Estado=@estado,FinalizadoAt=SYSUTCDATETIME() WHERE ComunicadoId=@id`);
      return res.json({ ok: true, data: { comunicadoId, estado }, message: "Comunicado procesado. Revisá el resultado por destinatario en el historial." });
    } catch (e) { console.error("Error procesando comunicado", e); return res.status(500).json({ ok: false, message: "No se pudo confirmar el procesamiento. Actualizá el historial antes de intentar un nuevo comunicado." }); }
  });
}
