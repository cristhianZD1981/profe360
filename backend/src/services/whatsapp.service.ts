import { getPool, sql } from "../config/database";
import { decryptWhatsAppSecret } from "../utils/whatsapp-secrets";
import { normalizeWhatsAppPhone } from "../utils/whatsapp.utils";

type WhatsAppNotificationInput = {
  institucionId?: number | null;
  grupoId?: number | null;
  grupoClaseId?: number | null;
  estudianteId?: number | null;
  profesorUsuarioId?: number | null;
  solicitadoPorUsuarioId?: number | null;
  tipoMensaje: string;
  telefono?: string | null;
  mensaje: string;
  templateParams?: string[];
};

function result(input: Partial<WhatsAppNotificationInput>, data: Record<string, any>): Record<string, any> {
  return { telefono: input.telefono, ...data };
}

export async function sendWhatsAppNotification(input: WhatsAppNotificationInput) {
  const telefono = normalizeWhatsAppPhone(input.telefono);
  if (!telefono) return result(input, { enviado: false, modo: "omitido", motivo: "Sin teléfono válido" });

  const pool = await getPool();
  const channelResult = await pool.request()
    .input("institucionId", sql.Int, input.institucionId || null)
    .query(`
      SELECT TOP 1 c.*
      FROM dbo.WhatsAppCanal c
      LEFT JOIN dbo.Institucion i ON i.InstitucionId = c.InstitucionId
      LEFT JOIN dbo.Institucion target ON target.InstitucionId = @institucionId
      WHERE c.Activo = 1
        AND (
          (c.InstitucionId = @institucionId AND target.WhatsAppModo IN (N'PROPIO_API', N'PROPIO_QR'))
          OR (
            (@institucionId IS NULL OR target.WhatsAppModo = N'GENERICA')
            AND c.EsFallback = 1
            AND (
              c.InstitucionId IS NULL
              OR UPPER(LTRIM(RTRIM(COALESCE(i.NombreComercial, i.Nombre, N'')))) = N'PROFE360'
            )
          )
        )
      ORDER BY CASE
        WHEN c.InstitucionId = @institucionId THEN 0
        WHEN c.EsFallback = 1 AND c.InstitucionId IS NULL THEN 1
        WHEN c.EsFallback = 1 AND UPPER(LTRIM(RTRIM(COALESCE(i.NombreComercial, i.Nombre, N'')))) = N'PROFE360' THEN 2
        ELSE 3 END,
               c.WhatsAppCanalId DESC
    `);
  const channel = channelResult.recordset[0];

  if (!channel) {
    await pool.request()
      .input("institucionId", sql.Int, input.institucionId || null)
      .input("grupoId", sql.Int, input.grupoId || null)
      .input("grupoClaseId", sql.Int, input.grupoClaseId || null)
      .input("estudianteId", sql.Int, input.estudianteId || null)
      .input("profesorUsuarioId", sql.Int, input.profesorUsuarioId || null)
      .input("solicitadoPorUsuarioId", sql.Int, input.solicitadoPorUsuarioId || null)
      .input("tipoMensaje", sql.NVarChar(40), String(input.tipoMensaje || "GENERAL").toUpperCase())
      .input("telefonoDestino", sql.NVarChar(30), telefono)
      .input("mensajeResumen", sql.NVarChar(500), String(input.mensaje || "").replace(/\s+/g, " ").trim().slice(0, 500))
      .query(`
        INSERT INTO dbo.WhatsAppEnvio
          (InstitucionId, WhatsAppCanalId, GrupoId, GrupoClaseId, EstudianteId,
           ProfesorUsuarioId, SolicitadoPorUsuarioId, TipoMensaje, TelefonoDestino,
           NumeroOrigenSnapshot, EsFallback, Estado, MotivoError, MensajeResumen)
        VALUES
          (@institucionId, NULL, @grupoId, @grupoClaseId, @estudianteId,
           @profesorUsuarioId, @solicitadoPorUsuarioId, @tipoMensaje, @telefonoDestino,
           NULL, 0, N'OMITIDO', N'No hay canal WhatsApp institucional ni fallback activo', @mensajeResumen)
      `);
    return result(input, { enviado: false, modo: "omitido", motivo: "No hay canal WhatsApp institucional ni fallback activo" });
  }

  const insertRequest = pool.request()
    .input("institucionId", sql.Int, input.institucionId || null)
    .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
    .input("grupoId", sql.Int, input.grupoId || null)
    .input("grupoClaseId", sql.Int, input.grupoClaseId || null)
    .input("estudianteId", sql.Int, input.estudianteId || null)
    .input("profesorUsuarioId", sql.Int, input.profesorUsuarioId || null)
    .input("solicitadoPorUsuarioId", sql.Int, input.solicitadoPorUsuarioId || null)
    .input("tipoMensaje", sql.NVarChar(40), String(input.tipoMensaje || "GENERAL").toUpperCase())
    .input("telefonoDestino", sql.NVarChar(30), telefono)
    .input("numeroOrigenSnapshot", sql.NVarChar(30), channel.NumeroOrigen)
    .input("esFallback", sql.Bit, Boolean(channel.EsFallback))
    .input("mensajeResumen", sql.NVarChar(500), String(input.mensaje || "").replace(/\s+/g, " ").trim().slice(0, 500));
  const pending = await insertRequest.query(`
    INSERT INTO dbo.WhatsAppEnvio
      (InstitucionId, WhatsAppCanalId, GrupoId, GrupoClaseId, EstudianteId,
       ProfesorUsuarioId, SolicitadoPorUsuarioId, TipoMensaje, TelefonoDestino,
       NumeroOrigenSnapshot, EsFallback, Estado, MensajeResumen)
    OUTPUT INSERTED.WhatsAppEnvioId
    VALUES
      (@institucionId, @whatsappCanalId, @grupoId, @grupoClaseId, @estudianteId,
       @profesorUsuarioId, @solicitadoPorUsuarioId, @tipoMensaje, @telefonoDestino,
       @numeroOrigenSnapshot, @esFallback, N'PENDIENTE', @mensajeResumen)
  `);
  const envioId = Number(pending.recordset[0]?.WhatsAppEnvioId || 0);

  const updateLog = async (values: { estado: string; motivo?: string; codigo?: string; uuid?: string }) => {
    await pool.request()
      .input("envioId", sql.BigInt, envioId)
      .input("estado", sql.NVarChar(20), values.estado)
      .input("motivo", sql.NVarChar(2000), values.motivo || null)
      .input("codigo", sql.NVarChar(100), values.codigo || null)
      .input("uuid", sql.NVarChar(150), values.uuid || null)
      .query(`
        UPDATE dbo.WhatsAppEnvio
        SET Estado = @estado,
            MotivoError = @motivo,
            CodigoErrorProveedor = @codigo,
            MessageUuid = @uuid,
            FechaEnvio = CASE WHEN @estado IN (N'ACEPTADO', N'ENVIADO', N'FALLIDO') THEN SYSDATETIME() ELSE FechaEnvio END
        WHERE WhatsAppEnvioId = @envioId
      `);
  };

  if (String(process.env.WHATSAPP_MODE || "simulado").trim().toLowerCase() !== "webhook") {
    await updateLog({ estado: "OMITIDO", motivo: "WHATSAPP_MODE no está configurado como webhook" });
    return result(input, { enviado: false, modo: "simulado", whatsappEnvioId: envioId });
  }

  const token = String(process.env.WHATSAPP_2CHAT_API_KEY || process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim()
    || decryptWhatsAppSecret(channel.ApiKeyCifrada);
  if (!token) {
    await updateLog({ estado: "FALLIDO", motivo: "El canal no tiene API Key configurada" });
    return result(input, { enviado: false, modo: "webhook", motivo: "El canal no tiene API Key configurada", whatsappEnvioId: envioId });
  }

  if (String(channel.TipoCanal || "WABA").toUpperCase() === "WHATSAPP_WEB") {
    const response = await fetch("https://api.p.2chat.io/open/whatsapp/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-API-Key": token },
      body: JSON.stringify({ from_number: channel.NumeroOrigen, to_number: telefono, text: input.mensaje })
    });
    const rawBody = await response.text();
    let body: any = null;
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = null; }
    if (!response.ok || body?.success === false || body?.error === true) {
      const motivo = body?.error_message || rawBody || `HTTP ${response.status}`;
      await updateLog({ estado: "FALLIDO", motivo, codigo: body?.error_code });
      return result(input, { enviado: false, modo: "whatsapp_web", status: response.status, motivo, whatsappEnvioId: envioId });
    }
    await updateLog({ estado: "ACEPTADO", uuid: body?.message_uuid || body?.id });
    return result(input, { enviado: true, modo: "whatsapp_web", status: response.status, messageUuid: body?.message_uuid || body?.id, whatsappEnvioId: envioId });
  }

  const templateResult = await pool.request()
    .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
    .input("tipoMensaje", sql.NVarChar(40), String(input.tipoMensaje || "GENERAL").toUpperCase())
    .query(`
      SELECT TOP 1 *
      FROM dbo.WhatsAppPlantilla
      WHERE WhatsAppCanalId = @whatsappCanalId
        AND TipoMensaje = @tipoMensaje
        AND Activo = 1
        AND Estado = N'APPROVED'
      ORDER BY WhatsAppPlantillaId DESC
    `);
  const template = templateResult.recordset[0];
  if (!template) {
    await updateLog({ estado: "FALLIDO", motivo: "No hay una plantilla APPROVED para este tipo de mensaje" });
    return result(input, { enviado: false, modo: "webhook", motivo: "No hay una plantilla APPROVED para este tipo de mensaje", whatsappEnvioId: envioId });
  }

  const bodyParams = (input.templateParams?.length ? input.templateParams : [String(input.mensaje || "").replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, " ").trim()])
    .map((item) => String(item || "").replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, " ").trim().slice(0, 1024));
  const response = await fetch("https://api.p.2chat.io/open/waba/send-message", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-API-Key": token },
    body: JSON.stringify({
      from_number: channel.NumeroOrigen,
      to_number: telefono,
      template_uuid: template.TemplateUuid,
      params: { body: bodyParams }
    })
  });
  const rawBody = await response.text();
  let body: any = null;
  try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = null; }
  if (!response.ok || body?.success === false || body?.error === true) {
    const motivo = body?.error_message || rawBody || `HTTP ${response.status}`;
    await updateLog({ estado: "FALLIDO", motivo, codigo: body?.error_code });
    return result(input, { enviado: false, modo: "webhook", status: response.status, motivo, whatsappEnvioId: envioId });
  }

  await updateLog({ estado: "ACEPTADO", uuid: body?.message_uuid });
  return result(input, { enviado: true, modo: "webhook", status: response.status, messageUuid: body?.message_uuid, whatsappEnvioId: envioId });
}
