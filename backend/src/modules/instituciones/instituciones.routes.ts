import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { created, ok, badRequest } from "../../utils/http";
import { decryptWhatsAppSecret, encryptWhatsAppSecret } from "../../utils/whatsapp-secrets";

const router = Router();
router.use(requireAuth);

function friendlyQrWarning(value: unknown) {
  const warning = String(value || "").trim();
  const normalized = warning.toLowerCase();
  if (normalized.includes("no qr code received") || normalized.includes("connect command")) {
    return "El número quedó registrado en 2Chat, pero el código QR todavía no está listo. Presioná Conectar WA y esperá unos segundos mientras se genera.";
  }
  return warning || null;
}

function isMissingWhatsAppSourceNumberError(error: unknown) {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return message.includes("source number not found")
    || (message.includes("source number") && (message.includes("deleted") || message.includes("not found")));
}

function canAccessInstitution(req: any, id: number) {
  const isSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
  return isSuperAdmin || Number(req.auth?.institucionId || 0) === id;
}

async function getWhatsAppChannel(pool: Awaited<ReturnType<typeof getPool>>, institucionId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query(`
      SELECT TOP 1
        c.WhatsAppCanalId,
        c.InstitucionId,
        c.Proveedor,
        c.TipoCanal,
        c.CanalExternoId,
        c.NumeroOrigen,
        c.NombreVisible,
        c.Estado,
        c.EsFallback,
        c.Activo,
        CASE WHEN c.ApiKeyCifrada IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS TieneApiKey,
        c.FechaUltimaValidacion,
        c.UltimoError,
        c.CreatedAt,
        c.UpdatedAt
      FROM dbo.WhatsAppCanal c
      LEFT JOIN dbo.Institucion target ON target.InstitucionId = @institucionId
      WHERE c.InstitucionId = @institucionId
         OR (
           c.EsFallback = 1
           AND (
             UPPER(LTRIM(RTRIM(target.Nombre))) = N'PROFE360'
             OR UPPER(LTRIM(RTRIM(ISNULL(target.NombreComercial, N'')))) = N'PROFE360'
           )
         )
      ORDER BY
        CASE WHEN c.EsFallback = 1 AND (
          UPPER(LTRIM(RTRIM(target.Nombre))) = N'PROFE360'
          OR UPPER(LTRIM(RTRIM(ISNULL(target.NombreComercial, N'')))) = N'PROFE360'
        ) THEN 0 ELSE 1 END,
        c.Activo DESC,
        c.WhatsAppCanalId DESC
    `);
  return result.recordset[0] || null;
}

async function getProfe360WhatsAppChannel(pool: Awaited<ReturnType<typeof getPool>>) {
  const result = await pool.request().query([
    "SELECT TOP 1 c.WhatsAppCanalId, c.InstitucionId, c.Proveedor, c.TipoCanal, c.CanalExternoId,",
    "c.NumeroOrigen, c.NombreVisible, c.Estado, c.EsFallback, c.Activo,",
    "CASE WHEN c.ApiKeyCifrada IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS TieneApiKey,",
    "c.FechaUltimaValidacion, c.UltimoError, c.CreatedAt, c.UpdatedAt",
    "FROM dbo.WhatsAppCanal c LEFT JOIN dbo.Institucion i ON i.InstitucionId = c.InstitucionId",
    "WHERE c.EsFallback = 1",
    "AND (c.InstitucionId IS NULL OR UPPER(LTRIM(RTRIM(i.Nombre))) = N'PROFE360' OR UPPER(LTRIM(RTRIM(ISNULL(i.NombreComercial, N'')))) = N'PROFE360')",
    "ORDER BY c.Activo DESC, c.WhatsAppCanalId DESC"
  ].join(" "));
  return result.recordset[0] || null;
}

async function getInstitutionWhatsAppSelection(pool: Awaited<ReturnType<typeof getPool>>, institucionId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .query("SELECT WhatsAppModo, Nombre, NombreComercial FROM dbo.Institucion WHERE InstitucionId = @institucionId");
  const row = result.recordset[0] || null;
  return row ? {
    ...row,
    EsProfe360: String(row.NombreComercial || row.Nombre || "").trim().toUpperCase() === "PROFE360"
      || String(row.Nombre || "").trim().toUpperCase() === "PROFE360"
  } : null;
}

async function setInstitutionWhatsAppMode(pool: Awaited<ReturnType<typeof getPool>>, institucionId: number, modo: "PROPIO_API" | "PROPIO_QR") {
  await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("modo", sql.NVarChar(25), modo)
    .query("UPDATE dbo.Institucion SET WhatsAppModo = @modo, UpdatedAt = SYSDATETIME() WHERE InstitucionId = @institucionId");
}

async function getStoredWhatsAppApiKey(pool: Awaited<ReturnType<typeof getPool>>, channel: any, apiKeyOverride?: string) {
  const override = String(apiKeyOverride || "").trim();
  if (override) return override;
  const globalApiKey = String(process.env.WHATSAPP_2CHAT_API_KEY || process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  if (globalApiKey) return globalApiKey;
  if (!channel?.WhatsAppCanalId) return "";
  const result = await pool.request()
    .input("whatsappCanalId", sql.Int, Number(channel.WhatsAppCanalId))
    .query("SELECT ApiKeyCifrada FROM dbo.WhatsAppCanal WHERE WhatsAppCanalId = @whatsappCanalId");
  return decryptWhatsAppSecret(result.recordset[0]?.ApiKeyCifrada);
}

function pickWabaRecords(body: any): any[] {
  const candidates = [
    body,
    body?.data,
    body?.numbers,
    body?.results,
    body?.items,
    body?.data?.data,
    body?.data?.numbers,
    body?.data?.results,
    body?.data?.items
  ];
  return candidates.find(Array.isArray) || [];
}

function normalizeWabaRecord(value: any) {
  const connectionStatus = String(value?.connection_status ?? value?.connectionStatus ?? value?.status ?? "").toUpperCase();
  return {
    uuid: String(value?.uuid ?? value?.waba_uuid ?? value?.id ?? "").trim(),
    accountUuid: String(value?.account_uuid ?? value?.accountUuid ?? "").trim() || null,
    businessId: String(value?.business_id ?? value?.businessId ?? "").trim() || null,
    friendlyName: String(value?.friendly_name ?? value?.friendlyName ?? "").trim() || null,
    verifiedName: String(value?.verified_name ?? value?.verifiedName ?? "").trim() || null,
    phoneNumber: String(value?.phone_number ?? value?.phoneNumber ?? "").replace(/[^\d+]/g, "").trim(),
    phoneNumberId: String(value?.phone_number_id ?? value?.phoneNumberId ?? "").trim() || null,
    connectionStatus,
    connected: connectionStatus === "C" || connectionStatus === "CONNECTED",
    enabled: value?.enabled !== false && value?.is_enabled !== false,
    messagingProvider: String(value?.messaging_provider ?? value?.messagingProvider ?? "").trim() || null,
    metaWabaId: String(value?.meta_waba_id ?? value?.metaWabaId ?? "").trim() || null
  };
}

async function fetch2ChatWabaNumbers(apiKey: string) {
  const response = await fetch("https://api.p.2chat.io/open/waba/numbers?page=0&limit=200", {
    headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey }
  });
  const body: any = await response.json().catch(() => null);
  if (!response.ok || body?.success === false || body?.error === true) {
    throw new Error(body?.error_message || body?.message || `2Chat respondió HTTP ${response.status}`);
  }
  return pickWabaRecords(body).map(normalizeWabaRecord).filter((item) => item.uuid && item.phoneNumber);
}

async function fetch2ChatWabaNumber(apiKey: string, wabaUuid: string) {
  const response = await fetch(`https://api.p.2chat.io/open/waba/numbers/${encodeURIComponent(wabaUuid)}`, {
    headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey }
  });
  const body: any = await response.json().catch(() => null);
  if (!response.ok || body?.success === false || body?.error === true) {
    throw new Error(body?.error_message || body?.message || `2Chat respondió HTTP ${response.status}`);
  }
  const raw = body?.data?.data ?? body?.data ?? body?.number ?? body;
  return normalizeWabaRecord(Array.isArray(raw) ? raw[0] : raw);
}

async function getWhatsAppQrPayload(pool: Awaited<ReturnType<typeof getPool>>, channel: any, apiKeyOverride?: string) {
  const apiKey = await getStoredWhatsAppApiKey(pool, channel, apiKeyOverride);
  if (!apiKey) throw new Error("El canal QR no tiene API Key de 2Chat configurada");
  if (!channel?.CanalExternoId) throw new Error("El canal QR todavía no tiene un identificador de 2Chat");

  const response = await fetch(`https://api.p.2chat.io/open/whatsapp/channel/${encodeURIComponent(channel.CanalExternoId)}/qr-code`, {
    headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey }
  });
  const body: any = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error_message || `2Chat respondió HTTP ${response.status}`);
  if (body?.success === false && body?.error_message) throw new Error(body.error_message);
  return { ...body, apiKey };
}

async function getWhatsAppChannelStatus(pool: Awaited<ReturnType<typeof getPool>>, channel: any, apiKeyOverride?: string) {
  const apiKey = await getStoredWhatsAppApiKey(pool, channel, apiKeyOverride);
  if (!apiKey) throw new Error("El canal QR no tiene API Key de 2Chat configurada");
  if (!channel?.CanalExternoId) throw new Error("El canal QR todavía no tiene un identificador de 2Chat");

  const response = await fetch(`https://api.p.2chat.io/open/whatsapp/channel/${encodeURIComponent(channel.CanalExternoId)}/status`, {
    headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey }
  });
  const body: any = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) throw new Error(body?.error_message || `2Chat respondió HTTP ${response.status}`);
  return body;
}

async function executeWhatsAppQrCommand(pool: Awaited<ReturnType<typeof getPool>>, channel: any, command: "connect" | "disconnect", apiKeyOverride?: string) {
  const apiKey = await getStoredWhatsAppApiKey(pool, channel, apiKeyOverride);
  if (!apiKey) throw new Error("El canal QR no tiene API Key de 2Chat configurada");
  const response = await fetch(`https://api.p.2chat.io/open/whatsapp/channel/${encodeURIComponent(channel.CanalExternoId)}/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey }
  });
  const body: any = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) throw new Error(body?.error_message || `2Chat respondió HTTP ${response.status}`);
  return body;
}

async function getWhatsAppFallback(pool: Awaited<ReturnType<typeof getPool>>) {
  const result = await pool.request().query(`
    SELECT TOP 1
      WhatsAppCanalId,
      InstitucionId,
      Proveedor,
      TipoCanal,
      NumeroOrigen,
      NombreVisible,
      Estado,
      EsFallback,
      Activo,
      CASE WHEN ApiKeyCifrada IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS TieneApiKey,
      FechaUltimaValidacion,
      UltimoError,
      CreatedAt,
      UpdatedAt
    FROM dbo.WhatsAppCanal
    WHERE EsFallback = 1
    ORDER BY Activo DESC, WhatsAppCanalId DESC
  `);
  return result.recordset[0] || null;
}

async function saveWhatsAppTemplates(pool: Awaited<ReturnType<typeof getPool>>, whatsappCanalId: number, templates: any[]) {
  for (const item of templates) {
    const tipoMensaje = String(item?.tipoMensaje || "").trim().toUpperCase();
    const nombre = String(item?.nombre || "").trim();
    const templateUuid = String(item?.templateUuid || "").trim();
    const codigoIdioma = String(item?.codigoIdioma || "es").trim() || "es";
    const cantidadParametrosBody = Math.max(0, Number(item?.cantidadParametrosBody || 0));
    const estado = String(item?.estado || "PENDIENTE").trim().toUpperCase();
    const activo = item?.activo === false ? false : true;
    if (!tipoMensaje || !nombre || !templateUuid) continue;

    const request = pool.request()
      .input("whatsappCanalId", sql.Int, whatsappCanalId)
      .input("tipoMensaje", sql.NVarChar(40), tipoMensaje)
      .input("nombre", sql.NVarChar(150), nombre)
      .input("templateUuid", sql.NVarChar(150), templateUuid)
      .input("codigoIdioma", sql.NVarChar(20), codigoIdioma)
      .input("cantidadParametrosBody", sql.Int, cantidadParametrosBody)
      .input("estado", sql.NVarChar(20), estado)
      .input("activo", sql.Bit, activo);

    const existing = await request.query(`
      SELECT TOP 1 WhatsAppPlantillaId
      FROM dbo.WhatsAppPlantilla
      WHERE WhatsAppCanalId = @whatsappCanalId
        AND TipoMensaje = @tipoMensaje
        AND CodigoIdioma = @codigoIdioma
        AND Activo = 1
      ORDER BY WhatsAppPlantillaId DESC
    `);

    if (existing.recordset[0]) {
      await request
        .input("whatsappPlantillaId", sql.Int, Number(existing.recordset[0].WhatsAppPlantillaId))
        .query(`
          UPDATE dbo.WhatsAppPlantilla
          SET Nombre = @nombre,
              TemplateUuid = @templateUuid,
              CantidadParametrosBody = @cantidadParametrosBody,
              Estado = @estado,
              Activo = @activo,
              UpdatedAt = SYSDATETIME()
          WHERE WhatsAppPlantillaId = @whatsappPlantillaId
        `);
    } else {
      await request.query(`
        INSERT INTO dbo.WhatsAppPlantilla
          (WhatsAppCanalId, TipoMensaje, Nombre, TemplateUuid, CodigoIdioma,
           CantidadParametrosBody, Estado, Activo)
        VALUES
          (@whatsappCanalId, @tipoMensaje, @nombre, @templateUuid, @codigoIdioma,
           @cantidadParametrosBody, @estado, @activo)
      `);
    }
  }

  const result = await pool.request()
    .input("whatsappCanalId", sql.Int, whatsappCanalId)
    .query(`
      SELECT WhatsAppPlantillaId, WhatsAppCanalId, TipoMensaje, Nombre, TemplateUuid,
             CodigoIdioma, CantidadParametrosBody, Estado, Activo,
             FechaUltimaSincronizacion, UltimoError
      FROM dbo.WhatsAppPlantilla
      WHERE WhatsAppCanalId = @whatsappCanalId
      ORDER BY TipoMensaje, WhatsAppPlantillaId
    `);
  return result.recordset;
}

async function getChannelForTemplates(pool: Awaited<ReturnType<typeof getPool>>, params: { institucionId?: number; fallback?: boolean }) {
  const request = pool.request();
  const result = params.fallback
    ? await request.query(`SELECT TOP 1 WhatsAppCanalId FROM dbo.WhatsAppCanal WHERE EsFallback = 1 AND Activo = 1 ORDER BY WhatsAppCanalId DESC`)
    : await request.input("institucionId", sql.Int, Number(params.institucionId)).query(`SELECT TOP 1 WhatsAppCanalId FROM dbo.WhatsAppCanal WHERE InstitucionId = @institucionId AND EsFallback = 0 AND Activo = 1 ORDER BY WhatsAppCanalId DESC`);
  return result.recordset[0]?.WhatsAppCanalId ? Number(result.recordset[0].WhatsAppCanalId) : null;
}

router.put("/whatsapp/fallback/plantillas", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const templates = Array.isArray(req.body?.plantillas) ? req.body.plantillas : [];
  if (!templates.length) return badRequest(res, "Debés enviar al menos una plantilla");
  try {
    const pool = await getPool();
    const channelId = await getChannelForTemplates(pool, { fallback: true });
    if (!channelId) return res.status(404).json({ ok: false, message: "Primero configurá el número fallback" });
    return ok(res, { plantillas: await saveWhatsAppTemplates(pool, channelId, templates) }, "Plantillas fallback guardadas correctamente");
  } catch (error: any) {
    console.error("Error guardando plantillas fallback:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron guardar las plantillas fallback" });
  }
});

router.put("/:id/whatsapp/plantillas", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  const templates = Array.isArray(req.body?.plantillas) ? req.body.plantillas : [];
  if (!institucionId) return badRequest(res, "Id de institución inválido");
  if (!templates.length) return badRequest(res, "Debés enviar al menos una plantilla");
  try {
    const pool = await getPool();
    const channelId = await getChannelForTemplates(pool, { institucionId });
    if (!channelId) return res.status(404).json({ ok: false, message: "Primero configurá el canal WhatsApp del colegio" });
    return ok(res, { plantillas: await saveWhatsAppTemplates(pool, channelId, templates) }, "Plantillas del colegio guardadas correctamente");
  } catch (error: any) {
    console.error("Error guardando plantillas WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron guardar las plantillas del colegio" });
  }
});

async function getWabaTemplatesFrom2Chat(pool: Awaited<ReturnType<typeof getPool>>, channel: any) {
  const apiKey = await getStoredWhatsAppApiKey(pool, channel);
  if (!apiKey) throw new Error("El canal no tiene API Key de 2Chat configurada");
  if (!channel?.NumeroOrigen) throw new Error("El canal no tiene número de origen configurado");
  const url = new URL("https://api.p.2chat.io/open/waba/templates");
  url.searchParams.set("phone_number", channel.NumeroOrigen);
  url.searchParams.set("limit", "200");
  const response = await fetch(url, { headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey } });
  const body: any = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) throw new Error(body?.error_message || `2Chat respondió HTTP ${response.status}`);
  return (Array.isArray(body?.templates) ? body.templates : []).map((item: any) => ({
    uuid: String(item?.uuid || ""),
    name: String(item?.name || ""),
    status: String(item?.status || ""),
    category: String(item?.category || ""),
    language: String(item?.language || item?.language_code || ""),
    templateContent: String(item?.template_content || item?.content || "")
  })).filter((item: any) => item.uuid && item.name);
}

router.get("/whatsapp/fallback/plantillas-disponibles", requireRoles("SUPER_ADMIN"), async (_req, res) => {
  try {
    const pool = await getPool();
    const channel = await getProfe360WhatsAppChannel(pool);
    if (!channel) return res.status(404).json({ ok: false, message: "Primero configurá el canal WABA de Profe360" });
    return ok(res, { plantillas: await getWabaTemplatesFrom2Chat(pool, channel) });
  } catch (error: any) {
    console.error("Error consultando plantillas WABA en 2Chat:", error);
    return res.status(502).json({ ok: false, message: error?.message || "No se pudieron consultar las plantillas en 2Chat" });
  }
});

router.get("/:id/whatsapp/plantillas-disponibles", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const institucionId = Number(req.params.id);
    if (!institucionId) return badRequest(res, "Id de institución inválido");
    const pool = await getPool();
    const channel = await getWhatsAppChannel(pool, institucionId);
    if (!channel) return res.status(404).json({ ok: false, message: "Primero configurá el canal WABA del colegio" });
    return ok(res, { plantillas: await getWabaTemplatesFrom2Chat(pool, channel) });
  } catch (error: any) {
    console.error("Error consultando plantillas WABA en 2Chat:", error);
    return res.status(502).json({ ok: false, message: error?.message || "No se pudieron consultar las plantillas en 2Chat" });
  }
});

router.get("/whatsapp/fallback", requireRoles("SUPER_ADMIN"), async (_req, res) => {
  try {
    const pool = await getPool();
    const canal = await getWhatsAppFallback(pool);
    const plantillas = canal
      ? await pool.request()
        .input("whatsappCanalId", sql.Int, canal.WhatsAppCanalId)
        .query(`
          SELECT WhatsAppPlantillaId, WhatsAppCanalId, TipoMensaje, Nombre, TemplateUuid,
                 CodigoIdioma, CantidadParametrosBody, Estado, Activo,
                 FechaUltimaSincronizacion, UltimoError
          FROM dbo.WhatsAppPlantilla
          WHERE WhatsAppCanalId = @whatsappCanalId
          ORDER BY TipoMensaje, WhatsAppPlantillaId
        `)
      : { recordset: [] };
    return ok(res, { canal, plantillas: plantillas.recordset });
  } catch (error) {
    console.error("Error consultando fallback WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar el fallback de WhatsApp" });
  }
});

router.put("/whatsapp/fallback", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const numeroOrigen = String(req.body?.numeroOrigen || "").replace(/[^\d+]/g, "").trim();
  const apiKey = String(req.body?.apiKey || "").trim();
  const nombreVisible = String(req.body?.nombreVisible || "").trim() || null;
  const activo = req.body?.activo === false ? false : true;
  if (!numeroOrigen) return badRequest(res, "El número fallback es obligatorio");
  if (!numeroOrigen.startsWith("+")) return badRequest(res, "El número debe estar en formato internacional, por ejemplo +506XXXXXXXX");

  try {
    const pool = await getPool();
    const existing = await getWhatsAppFallback(pool);
    const request = pool.request()
      .input("numeroOrigen", sql.NVarChar(30), numeroOrigen)
      .input("nombreVisible", sql.NVarChar(200), nombreVisible)
      .input("activo", sql.Bit, activo)
      .input("apiKeyCifrada", sql.VarBinary(sql.MAX), apiKey ? encryptWhatsAppSecret(apiKey) : null);

    if (existing) {
      request.input("whatsappCanalId", sql.Int, existing.WhatsAppCanalId);
      const result = await request.query(`
        UPDATE dbo.WhatsAppCanal
        SET TipoCanal = N'WABA',
            CanalExternoId = NULL,
            NumeroOrigen = @numeroOrigen,
            NombreVisible = @nombreVisible,
            Activo = @activo,
            Estado = CASE WHEN @activo = 1 THEN N'PENDIENTE' ELSE N'INACTIVO' END,
            ApiKeyCifrada = CASE WHEN @apiKeyCifrada IS NULL THEN ApiKeyCifrada ELSE @apiKeyCifrada END,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.WhatsAppCanalId, INSERTED.NumeroOrigen, INSERTED.NombreVisible,
               INSERTED.Estado, INSERTED.Activo,
               CASE WHEN INSERTED.ApiKeyCifrada IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS TieneApiKey
        WHERE WhatsAppCanalId = @whatsappCanalId AND EsFallback = 1
      `);
      return ok(res, result.recordset[0], "Fallback WhatsApp actualizado correctamente");
    }

    const result = await request.query(`
      INSERT INTO dbo.WhatsAppCanal
        (InstitucionId, Proveedor, TipoCanal, NumeroOrigen, NombreVisible, ApiKeyCifrada, Estado, EsFallback, Activo)
      OUTPUT INSERTED.WhatsAppCanalId, INSERTED.NumeroOrigen, INSERTED.NombreVisible,
             INSERTED.Estado, INSERTED.Activo,
             CASE WHEN INSERTED.ApiKeyCifrada IS NULL THEN CAST(0 AS bit) ELSE CAST(1 AS bit) END AS TieneApiKey
      VALUES (NULL, N'2CHAT', N'WABA', @numeroOrigen, @nombreVisible, @apiKeyCifrada,
              N'PENDIENTE', 1, @activo)
    `);
    return created(res, result.recordset[0], "Fallback WhatsApp creado correctamente");
  } catch (error: any) {
    console.error("Error guardando fallback WhatsApp:", error);
    if (error?.number === 2601 || error?.number === 2627) return res.status(409).json({ ok: false, message: "Ya existe un fallback WhatsApp activo" });
    return res.status(500).json({ ok: false, message: "No se pudo guardar el fallback de WhatsApp" });
  }
});

router.post("/:id/whatsapp/qr/crear", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  const numeroOrigen = String(req.body?.numeroOrigen || "").replace(/[^\d+]/g, "").trim();
  const apiKey = String(req.body?.apiKey || process.env.WHATSAPP_2CHAT_API_KEY || process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const nombreVisible = String(req.body?.nombreVisible || "").trim() || `WhatsApp ${institucionId}`;
  const sincronizarContactos = req.body?.sincronizarContactos === true;
  if (!numeroOrigen.startsWith("+")) return badRequest(res, "El número debe estar en formato internacional");
  if (!apiKey) return badRequest(res, "Configurá WHATSAPP_2CHAT_API_KEY en el archivo .env del backend");

  try {
    const pool = await getPool();
    const existing = await getWhatsAppChannel(pool, institucionId);
    const createResponse = await fetch("https://api.p.2chat.io/open/whatsapp/channel/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-API-Key": apiKey },
      body: JSON.stringify({ phone_number: numeroOrigen, friendly_name: nombreVisible })
    });
    let body: any = await createResponse.json().catch(() => null);
    let existing2ChatChannel: any = null;
    let detail = body?.error_message || body?.message || body?.error || body?.detail;
    if (!createResponse.ok || body?.success === false) {
      if (String(detail || "").toLowerCase().includes("phone number already exists")) {
        const listResponse = await fetch("https://api.p.2chat.io/open/whatsapp/get-numbers?page_number=0&results_per_page=50", {
          headers: { "X-User-API-Key": apiKey }
        });
        const listBody: any = await listResponse.json().catch(() => null);
        const numbers = Array.isArray(listBody?.numbers) ? listBody.numbers : [];
        const normalizedRequested = numeroOrigen.replace(/\D/g, "");
        existing2ChatChannel = numbers.find((item: any) => String(item?.phone_number || "").replace(/\D/g, "") === normalizedRequested) || null;
        if (existing2ChatChannel) {
          body = { success: true, channel: existing2ChatChannel, reused: true };
        } else {
          return res.status(502).json({ ok: false, message: "2Chat indica que el número ya existe, pero no se pudo localizar en la lista de canales de esta API Key" });
        }
      }
    }
    if ((!createResponse.ok || body?.success === false) && !existing2ChatChannel) {
      const message = detail
        ? `2Chat rechazó la creación del canal: ${String(detail)}`
        : `2Chat respondió HTTP ${createResponse.status}`;
      console.error("Respuesta de 2Chat al crear canal QR:", {
        status: createResponse.status,
        message,
        body
      });
      return res.status(502).json({ ok: false, message });
    }
    const externalId = String(body?.channel?.uuid || body?.channel?.id || "").trim();
    if (!externalId) return res.status(502).json({ ok: false, message: "2Chat no devolvió el identificador del canal QR" });

    const assigned = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("canalExternoId", sql.NVarChar(150), externalId)
      .query([
        "SELECT TOP 1 i.InstitucionId, i.Nombre",
        "FROM dbo.WhatsAppCanal c",
        "INNER JOIN dbo.Institucion i ON i.InstitucionId = c.InstitucionId",
        "WHERE c.CanalExternoId = @canalExternoId AND c.InstitucionId <> @institucionId",
        "ORDER BY c.Activo DESC, c.WhatsAppCanalId DESC"
      ].join(" "));
    if (assigned.recordset[0]) {
      return res.status(409).json({
        ok: false,
        message: "Este número ya está vinculado como canal propio de la institución " + assigned.recordset[0].Nombre + ". Si otras instituciones deben usarlo, seleccioná la opción Número genérico de Profe360."
      });
    }

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("numeroOrigen", sql.NVarChar(30), numeroOrigen)
      .input("nombreVisible", sql.NVarChar(200), nombreVisible)
      .input("apiKeyCifrada", sql.VarBinary(sql.MAX), encryptWhatsAppSecret(apiKey))
      .input("canalExternoId", sql.NVarChar(150), externalId)
      .input("sincronizarContactos", sql.Bit, sincronizarContactos);
    let channelId = Number(existing?.WhatsAppCanalId || 0);
    if (existing && !existing.EsFallback) {
      request.input("whatsappCanalId", sql.Int, channelId);
      await request.query(`
        UPDATE dbo.WhatsAppCanal
        SET TipoCanal = N'WHATSAPP_WEB', CanalExternoId = @canalExternoId,
            NumeroOrigen = @numeroOrigen, NombreVisible = @nombreVisible,
            ApiKeyCifrada = @apiKeyCifrada, SincronizarContactos = @sincronizarContactos,
            Estado = N'PENDIENTE', Activo = 1, UpdatedAt = SYSDATETIME()
        WHERE WhatsAppCanalId = @whatsappCanalId AND InstitucionId = @institucionId
      `);
    } else {
      const result = await request.query(`
        INSERT INTO dbo.WhatsAppCanal
          (InstitucionId, Proveedor, TipoCanal, CanalExternoId, NumeroOrigen, NombreVisible,
           ApiKeyCifrada, SincronizarContactos, Estado, EsFallback, Activo)
        OUTPUT INSERTED.WhatsAppCanalId
        VALUES (@institucionId, N'2CHAT', N'WHATSAPP_WEB', @canalExternoId, @numeroOrigen,
                @nombreVisible, @apiKeyCifrada, @sincronizarContactos, N'PENDIENTE', 0, 1)
      `);
      channelId = Number(result.recordset[0]?.WhatsAppCanalId || 0);
    }
    await setInstitutionWhatsAppMode(pool, institucionId, "PROPIO_QR");
    const channel = await getWhatsAppChannel(pool, institucionId);
    const status = await getWhatsAppChannelStatus(pool, channel, apiKey);
    const connected = String(status?.connection_status || "").toUpperCase() === "C";
    await pool.request()
      .input("whatsappCanalId", sql.Int, channelId)
      .input("estado", sql.NVarChar(20), connected ? "CONECTADO" : "PENDIENTE")
      .query(`UPDATE dbo.WhatsAppCanal SET Estado = @estado, FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
    if (connected) {
      return ok(res, { whatsappCanalId: channelId, channel, connectionStatus: status.connection_status, connected: true, qrCode: null, qrCodeImageUrl: null, warning: "El canal ya está conectado; no es necesario escanear un QR nuevo" }, existing2ChatChannel ? "Canal QR existente vinculado y conectado" : "Canal QR creado y conectado");
    }
    try {
      await executeWhatsAppQrCommand(pool, channel, "connect", apiKey);
    } catch (commandError: any) {
      const commandMessage = String(commandError?.message || "").toLowerCase();
      if (!commandMessage.includes("already") && !commandMessage.includes("invalid state")) throw commandError;
    }
    let latestStatus: any = status;
    let latestQr: any = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      latestStatus = await getWhatsAppChannelStatus(pool, channel, apiKey);
      if (String(latestStatus?.connection_status || "").toUpperCase() === "C") {
        return ok(res, { whatsappCanalId: channelId, channel, connectionStatus: "C", connected: true, qrCode: null, qrCodeImageUrl: null }, "Canal vinculado y conectado correctamente");
      }
      latestQr = await getWhatsAppQrPayload(pool, channel, apiKey);
      if (latestQr?.qr_code_image_url || latestQr?.qr_code) break;
    }
    if (latestQr?.qr_code_image_url || latestQr?.qr_code) {
      return ok(res, { whatsappCanalId: channelId, channel, connectionStatus: latestStatus?.connection_status || "D", connected: false, qrCode: latestQr.qr_code, qrCodeImageUrl: latestQr.qr_code_image_url, warning: friendlyQrWarning(latestQr.warning) }, existing2ChatChannel ? "Canal existente vinculado; escaneá el código" : "Canal creado; escaneá el código");
    }
    return ok(res, { whatsappCanalId: channelId, channel, connectionStatus: latestStatus?.connection_status || "D", connected: false, qrCode: null, qrCodeImageUrl: null, warning: friendlyQrWarning(latestQr?.warning) || "2Chat todavía está preparando el QR. Presioná Conectar WA nuevamente." }, "Canal creado y conexión iniciada");
  } catch (error: any) {
    console.error("Error creando canal QR:", error);
    return res.status(500).json({ ok: false, message: error?.message || "No se pudo crear el canal QR" });
  }
});

router.post("/:id/whatsapp/qr/conectar", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  try {
    const pool = await getPool();
    const seleccion = await getInstitutionWhatsAppSelection(pool, institucionId);
    if (seleccion?.WhatsAppModo === "GENERICA" && !seleccion.EsProfe360) {
      return res.status(403).json({ ok: false, message: "Esta institución solo puede dejar de usar el canal genérico; únicamente Profe360 puede cerrar su sesión" });
    }
    const channel = await getWhatsAppChannel(pool, institucionId);
    if (!channel || channel.TipoCanal !== "WHATSAPP_WEB" || !channel.CanalExternoId) return res.status(404).json({ ok: false, message: "No existe un canal QR configurado para esta institución" });
    const apiKeyOverride = String(req.body?.apiKey || "").trim();
    if (apiKeyOverride) {
      await pool.request()
        .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
        .input("apiKeyCifrada", sql.VarBinary(sql.MAX), encryptWhatsAppSecret(apiKeyOverride))
        .query(`UPDATE dbo.WhatsAppCanal SET ApiKeyCifrada = @apiKeyCifrada, UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
    }
    const currentStatus = await getWhatsAppChannelStatus(pool, channel, apiKeyOverride);
    if (String(currentStatus?.connection_status || "").toUpperCase() === "C") {
      await pool.request().input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId).query(`UPDATE dbo.WhatsAppCanal SET Estado = N'CONECTADO', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
      return ok(res, { connected: true, connectionStatus: currentStatus.connection_status, qrCode: null, qrCodeImageUrl: null, warning: "El canal ya está conectado; no es necesario escanear un QR nuevo" }, "WhatsApp ya está conectado");
   }
   await executeWhatsAppQrCommand(pool, channel, "connect", apiKeyOverride);
    let latestStatus: any = null;
    let latestQr: any = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
      latestStatus = await getWhatsAppChannelStatus(pool, channel, apiKeyOverride);
      if (String(latestStatus?.connection_status || "").toUpperCase() === "C") {
        await pool.request().input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId).query(`UPDATE dbo.WhatsAppCanal SET Estado = N'CONECTADO', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
        return ok(res, { connected: true, connectionStatus: latestStatus.connection_status, qrCode: null, qrCodeImageUrl: null, warning: "El canal se conectó correctamente; no es necesario escanear un QR nuevo" }, "WhatsApp conectado correctamente");
      }
      latestQr = await getWhatsAppQrPayload(pool, channel, apiKeyOverride);
      if (latestQr?.qr_code_image_url || latestQr?.qr_code) break;
    }
   await pool.request().input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId).query(`UPDATE dbo.WhatsAppCanal SET Estado = N'PENDIENTE', UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
    if (latestQr?.qr_code_image_url || latestQr?.qr_code) {
      return ok(res, { connected: false, connectionStatus: latestStatus?.connection_status || "D", qrCode: latestQr.qr_code, qrCodeImageUrl: latestQr.qr_code_image_url, warning: friendlyQrWarning(latestQr.warning) }, "QR generado correctamente");
    }
    return ok(res, { connected: false, connectionStatus: latestStatus?.connection_status || "D", qrCode: null, qrCodeImageUrl: null, warning: friendlyQrWarning(latestQr?.warning) || "2Chat todavía está preparando el código QR. Presioná Conectar WA nuevamente en unos segundos." }, "2Chat está preparando el código QR");
  } catch (error: any) {
    if (isMissingWhatsAppSourceNumberError(error)) {
      console.warn("No se puede conectar un QR que ya no existe en 2Chat:", error?.message || error);
      try {
        const pool = await getPool();
        const channel = await getWhatsAppChannel(pool, institucionId);
        await pool.request()
          .input("whatsappCanalId", sql.Int, channel?.WhatsAppCanalId)
          .query("UPDATE dbo.WhatsAppCanal SET Estado = N'PENDIENTE', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId");
      } catch (persistError) {
        console.warn("No se pudo actualizar el estado local del canal QR:", persistError);
      }
      return ok(res, {
        connected: false,
        connectionStatus: "D",
        sourceNumberNotFound: true,
        qrCode: null,
        qrCodeImageUrl: null,
        warning: "El número ya no existe en 2Chat. Usá Agregar/cambiar número para registrar otro."
      }, "El número QR ya no existe en 2Chat");
    }
    console.error("Error generando QR:", error);
    return res.status(500).json({ ok: false, message: error?.message || "No se pudo generar el QR" });
  }
});

router.get("/:id/whatsapp/qr/estado", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  try {
    const pool = await getPool();
    const channel = await getWhatsAppChannel(pool, institucionId);
    if (!channel || channel.TipoCanal !== "WHATSAPP_WEB" || !channel.CanalExternoId) return res.status(404).json({ ok: false, message: "No existe un canal QR configurado para esta institución" });
    const status = await getWhatsAppChannelStatus(pool, channel);
    const connected = String(status?.connection_status || "").toUpperCase() === "C";
    await pool.request()
      .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
      .input("estado", sql.NVarChar(20), connected ? "CONECTADO" : "PENDIENTE")
      .query("UPDATE dbo.WhatsAppCanal SET Estado = @estado, FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId");
    return ok(res, { connected, connectionStatus: status?.connection_status || null }, connected ? "WhatsApp conectado correctamente" : "Esperando que se escanee el código QR");
  } catch (error: any) {
    if (isMissingWhatsAppSourceNumberError(error)) {
      console.warn("Estado QR no disponible en 2Chat; se trata como desconectado:", error?.message || error);
      try {
        const pool = await getPool();
        const channel = await getWhatsAppChannel(pool, institucionId);
        if (channel?.WhatsAppCanalId) {
          await pool.request()
            .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
            .query("UPDATE dbo.WhatsAppCanal SET Estado = N'PENDIENTE', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId");
        }
      } catch (persistError) {
        console.warn("No se pudo actualizar el estado local del canal QR:", persistError);
      }
      return ok(res, { connected: false, connectionStatus: "D", sourceNumberNotFound: true }, "El número QR está desconectado o ya no existe en 2Chat");
    }
    console.error("Error consultando estado QR:", error);
    return res.status(500).json({ ok: false, message: error?.message || "No se pudo consultar el estado de WhatsApp" });
  }
});

router.post("/:id/whatsapp/qr/desconectar", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  try {
    const pool = await getPool();
    const seleccion = await getInstitutionWhatsAppSelection(pool, institucionId);
    if (seleccion?.WhatsAppModo === "GENERICA" && !seleccion.EsProfe360) {
      return res.status(403).json({ ok: false, message: "Esta institución solo puede dejar de usar el canal genérico; únicamente Profe360 puede cerrar su sesión" });
    }
    const channel = await getWhatsAppChannel(pool, institucionId);
    if (!channel || channel.TipoCanal !== "WHATSAPP_WEB" || !channel.CanalExternoId) return res.status(404).json({ ok: false, message: "No existe un canal QR configurado para esta institución" });
    const apiKeyOverride = String(req.body?.apiKey || "").trim();
    if (apiKeyOverride) {
      await pool.request()
        .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
        .input("apiKeyCifrada", sql.VarBinary(sql.MAX), encryptWhatsAppSecret(apiKeyOverride))
        .query(`UPDATE dbo.WhatsAppCanal SET ApiKeyCifrada = @apiKeyCifrada, UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
    }
    const currentStatus = await getWhatsAppChannelStatus(pool, channel, apiKeyOverride);
    if (String(currentStatus?.connection_status || "").toUpperCase() !== "C") {
      await pool.request().input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId).query(`UPDATE dbo.WhatsAppCanal SET Estado = N'PENDIENTE', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
      return ok(res, { connected: false, connectionStatus: currentStatus.connection_status, qrCode: null, qrCodeImageUrl: null }, "WhatsApp ya estaba desconectado");
    }
    await executeWhatsAppQrCommand(pool, channel, "disconnect", apiKeyOverride);
    await pool.request().input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId).query(`UPDATE dbo.WhatsAppCanal SET Estado = N'PENDIENTE', FechaUltimaValidacion = SYSDATETIME(), UpdatedAt = SYSDATETIME() WHERE WhatsAppCanalId = @whatsappCanalId`);
    return ok(res, { connected: false, connectionStatus: "D", qrCode: null, qrCodeImageUrl: null }, "WhatsApp desconectado correctamente");
  } catch (error: any) {
    console.error("Error desconectando QR:", error);
    return res.status(500).json({ ok: false, message: error?.message || "No se pudo desconectar WhatsApp" });
  }
});

router.get("/whatsapp/waba/canales", requireRoles("SUPER_ADMIN"), async (_req, res) => {
  try {
    const pool = await getPool();
    const apiKey = await getStoredWhatsAppApiKey(pool, null);
    if (!apiKey) return badRequest(res, "Falta configurar WHATSAPP_2CHAT_API_KEY en el archivo .env del backend");

    const channels = await fetch2ChatWabaNumbers(apiKey);
    const assigned = await pool.request().query(`
      SELECT c.CanalExternoId, c.NumeroOrigen, c.InstitucionId,
             COALESCE(NULLIF(i.NombreComercial, N''), i.Nombre) AS InstitucionNombre
      FROM dbo.WhatsAppCanal c
      INNER JOIN dbo.Institucion i ON i.InstitucionId = c.InstitucionId
      WHERE c.TipoCanal = N'WABA'
    `);
    const values = channels.map((channel) => {
      const match = assigned.recordset.find((item: any) =>
        (channel.uuid && String(item.CanalExternoId || "") === channel.uuid)
        || (channel.phoneNumber && String(item.NumeroOrigen || "") === channel.phoneNumber)
      );
      return {
        ...channel,
        assignedInstitutionId: match?.InstitucionId || null,
        assignedInstitutionName: match?.InstitucionNombre || null
      };
    });
    return ok(res, {
      channels: values,
      onboardingUrl: String(process.env.WHATSAPP_2CHAT_WABA_ONBOARDING_URL || "https://app.2chat.io/").trim()
    }, values.length ? "Canales WABA consultados correctamente" : "No se encontraron números WABA en la cuenta de 2Chat");
  } catch (error: any) {
    console.error("Error consultando canales WABA:", error);
    return res.status(502).json({ ok: false, message: error?.message || "No se pudieron consultar los canales WABA de 2Chat" });
  }
});

router.get("/:id/whatsapp/waba/estado", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  try {
    const pool = await getPool();
    const channel = await getWhatsAppChannel(pool, institucionId);
    if (!channel || channel.TipoCanal !== "WABA" || !channel.CanalExternoId) {
      return res.status(404).json({ ok: false, message: "Esta institución todavía no tiene un canal WABA vinculado desde 2Chat" });
    }
    const apiKey = await getStoredWhatsAppApiKey(pool, channel);
    if (!apiKey) return badRequest(res, "Falta configurar WHATSAPP_2CHAT_API_KEY en el archivo .env del backend");
    const waba = await fetch2ChatWabaNumber(apiKey, channel.CanalExternoId);
    const estado = waba.connected && waba.enabled ? "CONECTADO" : "PENDIENTE";
    await pool.request()
      .input("whatsappCanalId", sql.Int, channel.WhatsAppCanalId)
      .input("estado", sql.NVarChar(20), estado)
      .input("numeroOrigen", sql.NVarChar(30), waba.phoneNumber || channel.NumeroOrigen)
      .input("nombreVisible", sql.NVarChar(200), waba.verifiedName || waba.friendlyName || channel.NombreVisible)
      .query(`
        UPDATE dbo.WhatsAppCanal
        SET Estado = @estado, NumeroOrigen = @numeroOrigen, NombreVisible = @nombreVisible,
            FechaUltimaValidacion = SYSDATETIME(), UltimoError = NULL, UpdatedAt = SYSDATETIME()
        WHERE WhatsAppCanalId = @whatsappCanalId
      `);
    return ok(res, { ...waba, estado }, waba.connected ? "Canal WABA conectado y verificado" : "El canal WABA todavía no está conectado en 2Chat");
  } catch (error: any) {
    console.error("Error consultando estado WABA:", error);
    return res.status(502).json({ ok: false, message: error?.message || "No se pudo verificar el canal WABA" });
  }
});

router.post("/:id/whatsapp/waba/vincular", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  const wabaUuid = String(req.body?.wabaUuid || "").trim();
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });
  if (!wabaUuid) return badRequest(res, "Seleccioná el número WABA que querés vincular");

  try {
    const pool = await getPool();
    const seleccion = await getInstitutionWhatsAppSelection(pool, institucionId);
    if (!seleccion) return res.status(404).json({ ok: false, message: "Institución no encontrada" });
    const apiKey = await getStoredWhatsAppApiKey(pool, null);
    if (!apiKey) return badRequest(res, "Falta configurar WHATSAPP_2CHAT_API_KEY en el archivo .env del backend");

    const waba = await fetch2ChatWabaNumber(apiKey, wabaUuid);
    if (!waba.uuid || !waba.phoneNumber) return badRequest(res, "2Chat no devolvió los datos completos del número WABA");
    if (!waba.connected || !waba.enabled) {
      return res.status(409).json({ ok: false, message: "El número WABA existe, pero todavía no aparece conectado y habilitado en 2Chat" });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const duplicate = await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("canalExternoId", sql.NVarChar(150), waba.uuid)
        .input("numeroOrigen", sql.NVarChar(30), waba.phoneNumber)
        .query(`
          SELECT TOP 1 c.InstitucionId,
                 COALESCE(NULLIF(i.NombreComercial, N''), i.Nombre) AS InstitucionNombre
          FROM dbo.WhatsAppCanal c WITH (UPDLOCK, HOLDLOCK)
          INNER JOIN dbo.Institucion i ON i.InstitucionId = c.InstitucionId
          WHERE c.InstitucionId <> @institucionId
            AND (c.CanalExternoId = @canalExternoId OR c.NumeroOrigen = @numeroOrigen)
        `);
      if (duplicate.recordset[0]) {
        await transaction.rollback();
        return res.status(409).json({
          ok: false,
          message: `Este número WABA ya está vinculado a ${duplicate.recordset[0].InstitucionNombre}`
        });
      }

      const current = await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("esProfe360", sql.Bit, Boolean(seleccion.EsProfe360))
        .query(`
          SELECT TOP 1 WhatsAppCanalId
          FROM dbo.WhatsAppCanal WITH (UPDLOCK, HOLDLOCK)
          WHERE InstitucionId = @institucionId
             OR (@esProfe360 = 1 AND EsFallback = 1)
          ORDER BY
            CASE WHEN @esProfe360 = 1 AND EsFallback = 1 THEN 0 ELSE 1 END,
            Activo DESC,
            WhatsAppCanalId DESC
        `);
      const whatsappCanalId = Number(current.recordset[0]?.WhatsAppCanalId || 0);
      const request = transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .input("esProfe360", sql.Bit, Boolean(seleccion.EsProfe360))
        .input("canalExternoId", sql.NVarChar(150), waba.uuid)
        .input("numeroOrigen", sql.NVarChar(30), waba.phoneNumber)
        .input("nombreVisible", sql.NVarChar(200), waba.verifiedName || waba.friendlyName || null)
        .input("esFallback", sql.Bit, Boolean(seleccion.EsProfe360));
      let saved;
      if (whatsappCanalId) {
        request.input("whatsappCanalId", sql.Int, whatsappCanalId);
        saved = await request.query(`
          UPDATE dbo.WhatsAppCanal
          SET Proveedor = N'2CHAT', TipoCanal = N'WABA', CanalExternoId = @canalExternoId,
              NumeroOrigen = @numeroOrigen, NombreVisible = @nombreVisible, Estado = N'CONECTADO',
              EsFallback = @esFallback, Activo = 1, FechaUltimaValidacion = SYSDATETIME(),
              UltimoError = NULL, UpdatedAt = SYSDATETIME()
          OUTPUT INSERTED.WhatsAppCanalId, INSERTED.InstitucionId, INSERTED.CanalExternoId,
                 INSERTED.NumeroOrigen, INSERTED.NombreVisible, INSERTED.Estado, INSERTED.Activo
          WHERE WhatsAppCanalId = @whatsappCanalId
            AND (InstitucionId = @institucionId OR (@esProfe360 = 1 AND EsFallback = 1))
        `);
      } else {
        saved = await request.query(`
          INSERT INTO dbo.WhatsAppCanal
            (InstitucionId, Proveedor, TipoCanal, CanalExternoId, NumeroOrigen, NombreVisible,
             Estado, EsFallback, Activo, FechaUltimaValidacion)
          OUTPUT INSERTED.WhatsAppCanalId, INSERTED.InstitucionId, INSERTED.CanalExternoId,
                 INSERTED.NumeroOrigen, INSERTED.NombreVisible, INSERTED.Estado, INSERTED.Activo
          VALUES (@institucionId, N'2CHAT', N'WABA', @canalExternoId, @numeroOrigen, @nombreVisible,
                  N'CONECTADO', @esFallback, 1, SYSDATETIME())
        `);
      }
      await transaction.request()
        .input("institucionId", sql.Int, institucionId)
        .query("UPDATE dbo.Institucion SET WhatsAppModo = N'PROPIO_API', UpdatedAt = SYSDATETIME() WHERE InstitucionId = @institucionId");
      await transaction.commit();
      return ok(res, { canal: saved.recordset[0], waba }, "Canal WABA vinculado y verificado correctamente");
    } catch (error) {
      if ((transaction as any)._aborted !== true) await transaction.rollback().catch(() => undefined);
      throw error;
    }
  } catch (error: any) {
    console.error("Error vinculando canal WABA:", error);
    return res.status(500).json({ ok: false, message: error?.message || "No se pudo vincular el canal WABA" });
  }
});

router.get("/:id/whatsapp", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });

  try {
    res.setHeader("Cache-Control", "no-store");
    const pool = await getPool();
    const canal = await getWhatsAppChannel(pool, institucionId);
    const seleccion = await getInstitutionWhatsAppSelection(pool, institucionId);
    const modo = String(seleccion?.WhatsAppModo || "NO_CONFIGURADO").toUpperCase();
    const canalEfectivo = modo === "GENERICA"
      ? await getProfe360WhatsAppChannel(pool)
      : modo === "PROPIO_API" || modo === "PROPIO_QR"
        ? canal
        : null;
    if (!canal) return ok(res, { canal: null, canalEfectivo, modo, esProfe360: Boolean(seleccion?.EsProfe360), plantillas: [] });

    const templates = await pool.request()
      .input("whatsappCanalId", sql.Int, canal.WhatsAppCanalId)
      .query(`
        SELECT WhatsAppPlantillaId, WhatsAppCanalId, TipoMensaje, Nombre, TemplateUuid,
               CodigoIdioma, CantidadParametrosBody, Estado, Activo,
               FechaUltimaSincronizacion, UltimoError
        FROM dbo.WhatsAppPlantilla
        WHERE WhatsAppCanalId = @whatsappCanalId
        ORDER BY TipoMensaje, WhatsAppPlantillaId
      `);

    return ok(res, { canal, canalEfectivo, modo, esProfe360: Boolean(seleccion?.EsProfe360), plantillas: templates.recordset });
  } catch (error) {
    console.error("Error consultando configuración WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la configuración de WhatsApp" });
  }
});

router.put("/:id/whatsapp/mode", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  const modo = String(req.body?.modo || "").trim().toUpperCase();
  if (!institucionId || !["NO_CONFIGURADO", "GENERICA"].includes(modo)) return badRequest(res, "Modo WhatsApp inválido");
  try {
    const pool = await getPool();
    const seleccion = await getInstitutionWhatsAppSelection(pool, institucionId);
    if (!seleccion) return res.status(404).json({ ok: false, message: "Institución no encontrada" });
    if (modo === "GENERICA" && seleccion.EsProfe360) return badRequest(res, "Profe360 es la fuente del canal genérico y debe utilizar una conexión propia");
    if (modo === "GENERICA" || modo === "NO_CONFIGURADO") {
      await pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query("UPDATE dbo.WhatsAppCanal SET Activo = 0, Estado = N'INACTIVO', UpdatedAt = SYSDATETIME() WHERE InstitucionId = @institucionId AND EsFallback = 0");
    }
    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("modo", sql.NVarChar(25), modo)
      .query("UPDATE dbo.Institucion SET WhatsAppModo = @modo, UpdatedAt = SYSDATETIME() WHERE InstitucionId = @institucionId");
    return ok(res, { institucionId, modo }, "Modo WhatsApp actualizado correctamente");
  } catch (error) {
    console.error("Error actualizando modo WhatsApp:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el modo WhatsApp" });
  }
});

router.put("/:id/whatsapp", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const institucionId = Number(req.params.id);
  if (!institucionId || !canAccessInstitution(req, institucionId)) return res.status(403).json({ ok: false, message: "No tenés permisos para esta institución" });

  const numeroOrigen = String(req.body?.numeroOrigen || "").replace(/[^\d+]/g, "").trim();
  const apiKey = String(req.body?.apiKey || "").trim();
  const nombreVisible = String(req.body?.nombreVisible || "").trim() || null;
  const activo = req.body?.activo === false ? false : true;
  if (!numeroOrigen) return badRequest(res, "El número de origen es obligatorio");
  if (!numeroOrigen.startsWith("+")) return badRequest(res, "El número debe estar en formato internacional, por ejemplo +506XXXXXXXX");

  try {
    const pool = await getPool();
    const existing = await getWhatsAppChannel(pool, institucionId);
    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("numeroOrigen", sql.NVarChar(30), numeroOrigen)
      .input("nombreVisible", sql.NVarChar(200), nombreVisible)
      .input("activo", sql.Bit, activo)
      .input("apiKeyCifrada", sql.VarBinary(sql.MAX), apiKey ? encryptWhatsAppSecret(apiKey) : null);

    if (existing) {
      request.input("whatsappCanalId", sql.Int, existing.WhatsAppCanalId);
      const result = await request.query(`
        UPDATE dbo.WhatsAppCanal
        SET TipoCanal = N'WABA',
            CanalExternoId = NULL,
            NumeroOrigen = @numeroOrigen,
            NombreVisible = @nombreVisible,
            Activo = @activo,
            Estado = CASE WHEN @activo = 1 THEN N'PENDIENTE' ELSE N'INACTIVO' END,
            ApiKeyCifrada = CASE WHEN @apiKeyCifrada IS NULL THEN ApiKeyCifrada ELSE @apiKeyCifrada END,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.WhatsAppCanalId, INSERTED.InstitucionId, INSERTED.NumeroOrigen,
               INSERTED.NombreVisible, INSERTED.Estado, INSERTED.Activo, INSERTED.FechaUltimaValidacion,
               INSERTED.UltimoError
        WHERE WhatsAppCanalId = @whatsappCanalId AND InstitucionId = @institucionId
      `);
      await setInstitutionWhatsAppMode(pool, institucionId, "PROPIO_API");
      return ok(res, result.recordset[0], "Configuración WhatsApp actualizada correctamente");
    }

    const result = await request.query(`
      INSERT INTO dbo.WhatsAppCanal
        (InstitucionId, Proveedor, TipoCanal, NumeroOrigen, NombreVisible, ApiKeyCifrada, Estado, EsFallback, Activo)
      OUTPUT INSERTED.WhatsAppCanalId, INSERTED.InstitucionId, INSERTED.NumeroOrigen,
             INSERTED.NombreVisible, INSERTED.Estado, INSERTED.Activo
      VALUES (@institucionId, N'2CHAT', N'WABA', @numeroOrigen, @nombreVisible, @apiKeyCifrada,
              N'PENDIENTE', 0, @activo)
    `);
    await setInstitutionWhatsAppMode(pool, institucionId, "PROPIO_API");
    return created(res, result.recordset[0], "Configuración WhatsApp creada correctamente");
  } catch (error: any) {
    console.error("Error guardando configuración WhatsApp:", error);
    if (error?.number === 2601 || error?.number === 2627) return res.status(409).json({ ok: false, message: "El colegio ya tiene otro canal WhatsApp activo" });
    return res.status(500).json({ ok: false, message: "No se pudo guardar la configuración de WhatsApp" });
  }
});

async function ensureInstitucionPlColumns(pool: Awaited<ReturnType<typeof getPool>>) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Institucion', 'CodigoPresupuestarioPL') IS NULL
    BEGIN
      ALTER TABLE dbo.Institucion
      ADD CodigoPresupuestarioPL NVARCHAR(100) NULL;
    END

    IF COL_LENGTH('dbo.Institucion', 'DescripcionCodigoPresupuestarioPL') IS NULL
    BEGIN
      ALTER TABLE dbo.Institucion
      ADD DescripcionCodigoPresupuestarioPL NVARCHAR(255) NULL;
    END
  `);
}

router.get("/", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";
    const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
    const institucionId = req.auth?.institucionId ?? null;

    if (!esSuperAdmin && !institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();
    await ensureInstitucionPlColumns(pool);

    const result = await pool.request()
      .input("q", sql.NVarChar, `%${q}%`)
      .input("incluirInactivas", sql.Bit, incluirInactivas)
      .input("esSuperAdmin", sql.Bit, esSuperAdmin)
      .input("institucionId", sql.Int, institucionId)
      .query(`
        SELECT
          InstitucionId,
          TipoClienteId,
          Nombre,
          NombreComercial,
          CedulaJuridica,
          CorreoPrincipal,
          TelefonoPrincipal,
          Direccion,
          CodigoPresupuestario,
          CodigoPresupuestarioPL,
          DescripcionCodigoPresupuestarioPL,
          DireccionExacta,
          LogoUrl,
          MembreteUrl,
          NombreOficialBoleta,
          RegionalEducativa,
          CircuitoEducativo,
          Activo
        FROM dbo.Institucion
        WHERE
          (@esSuperAdmin = 1 OR InstitucionId = @institucionId)
          AND (@incluirInactivas = 1 OR Activo = 1)
          AND (
            @q = '%%'
            OR Nombre LIKE @q
            OR NombreComercial LIKE @q
            OR CorreoPrincipal LIKE @q
            OR CedulaJuridica LIKE @q
            OR CodigoPresupuestario LIKE @q
            OR DireccionExacta LIKE @q
            OR NombreOficialBoleta LIKE @q
            OR RegionalEducativa LIKE @q
            OR CircuitoEducativo LIKE @q
          )
        ORDER BY InstitucionId DESC
      `);

    return ok(res, result.recordset);
  } catch (error) {
    console.error("Error al listar instituciones:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al listar instituciones"
    });
  }
});

router.post("/", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const {
      tipoClienteId,
      nombre,
      nombreComercial,
      cedulaJuridica,
      correoPrincipal,
      telefonoPrincipal,
      direccion,
      codigoPresupuestario,
      codigoPresupuestarioPL,
      descripcionCodigoPresupuestarioPL,
      direccionExacta,
      logoUrl,
      membreteUrl,
      nombreOficialBoleta,
      regionalEducativa,
      circuitoEducativo
    } = req.body;

    if (!tipoClienteId || !nombre) {
      return badRequest(res, "tipoClienteId y nombre son obligatorios");
    }

    const pool = await getPool();
    await ensureInstitucionPlColumns(pool);

    const duplicado = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .query(`
        SELECT TOP 1 InstitucionId
        FROM dbo.Institucion
        WHERE Nombre = @nombre
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe una institución con ese nombre"
      });
    }

    const result = await pool.request()
      .input("tipoClienteId", sql.Int, Number(tipoClienteId))
      .input("nombre", sql.NVarChar, nombre)
      .input("nombreComercial", sql.NVarChar, nombreComercial || null)
      .input("cedulaJuridica", sql.NVarChar, cedulaJuridica || null)
      .input("correoPrincipal", sql.NVarChar, correoPrincipal || null)
      .input("telefonoPrincipal", sql.NVarChar, telefonoPrincipal || null)
       .input("direccion", sql.NVarChar, direccion || null)
      .input("codigoPresupuestario", sql.NVarChar, codigoPresupuestario || null)
      .input("codigoPresupuestarioPL", sql.NVarChar, codigoPresupuestarioPL || null)
      .input("descripcionCodigoPresupuestarioPL", sql.NVarChar, descripcionCodigoPresupuestarioPL || null)
      .input("direccionExacta", sql.NVarChar, direccionExacta || null)
      .input("logoUrl", sql.NVarChar, logoUrl || null)
      .input("membreteUrl", sql.NVarChar, membreteUrl || null)
      .input("nombreOficialBoleta", sql.NVarChar, nombreOficialBoleta || null)
      .input("regionalEducativa", sql.NVarChar, regionalEducativa || null)
      .input("circuitoEducativo", sql.NVarChar, circuitoEducativo || null)
      .query(`
        INSERT INTO dbo.Institucion
        (
          TipoClienteId,
          Nombre,
          NombreComercial,
          CedulaJuridica,
          CorreoPrincipal,
          TelefonoPrincipal,
          Direccion,
          CodigoPresupuestario,
          CodigoPresupuestarioPL,
          DescripcionCodigoPresupuestarioPL,
          DireccionExacta,
          LogoUrl,
          MembreteUrl,
          NombreOficialBoleta,
          RegionalEducativa,
          CircuitoEducativo,
          Activo,
          CreatedAt
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @tipoClienteId,
          @nombre,
          @nombreComercial,
          @cedulaJuridica,
          @correoPrincipal,
          @telefonoPrincipal,
          @direccion,
          @codigoPresupuestario,
          @codigoPresupuestarioPL,
          @descripcionCodigoPresupuestarioPL,
          @direccionExacta,
          @logoUrl,
          @membreteUrl,
          @nombreOficialBoleta,
          @regionalEducativa,
          @circuitoEducativo,
          1,
          SYSDATETIME()
        )
      `);

    return created(res, result.recordset[0], "Institución creada correctamente");
  } catch (error: any) {
    console.error("Error al crear institución:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe una institución con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al crear institución"
    });
  }
});

router.put("/:id", requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      tipoClienteId,
      nombre,
      nombreComercial,
      cedulaJuridica,
      correoPrincipal,
      telefonoPrincipal,
      direccion,
      codigoPresupuestario,
      codigoPresupuestarioPL,
      descripcionCodigoPresupuestarioPL,
      direccionExacta,
      logoUrl,
      membreteUrl,
      nombreOficialBoleta,
      regionalEducativa,
      circuitoEducativo
    } = req.body;

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    if (!nombre) {
      return badRequest(res, "nombre es obligatorio");
    }

    const esSuperAdmin = req.auth?.roles?.includes("SUPER_ADMIN") ?? false;
    const institucionId = req.auth?.institucionId ?? null;

    if (!esSuperAdmin && !institucionId) {
      return badRequest(res, "El usuario no tiene institución asignada");
    }

    const pool = await getPool();
    await ensureInstitucionPlColumns(pool);

    const duplicado = await pool.request()
      .input("nombre", sql.NVarChar, nombre)
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1 InstitucionId
        FROM dbo.Institucion
        WHERE Nombre = @nombre
          AND InstitucionId <> @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe otra institución con ese nombre"
      });
    }

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("esSuperAdmin", sql.Bit, esSuperAdmin)
      .input("institucionId", sql.Int, institucionId)
      .input("tipoClienteId", sql.Int, tipoClienteId ? Number(tipoClienteId) : null)
      .input("nombre", sql.NVarChar, nombre)
      .input("nombreComercial", sql.NVarChar, nombreComercial || null)
      .input("cedulaJuridica", sql.NVarChar, cedulaJuridica || null)
      .input("correoPrincipal", sql.NVarChar, correoPrincipal || null)
      .input("telefonoPrincipal", sql.NVarChar, telefonoPrincipal || null)
       .input("direccion", sql.NVarChar, direccion || null)
      .input("codigoPresupuestario", sql.NVarChar, codigoPresupuestario || null)
      .input("codigoPresupuestarioPL", sql.NVarChar, codigoPresupuestarioPL || null)
      .input("descripcionCodigoPresupuestarioPL", sql.NVarChar, descripcionCodigoPresupuestarioPL || null)
      .input("direccionExacta", sql.NVarChar, direccionExacta || null)
      .input("logoUrl", sql.NVarChar, logoUrl || null)
      .input("membreteUrl", sql.NVarChar, membreteUrl || null)
      .input("nombreOficialBoleta", sql.NVarChar, nombreOficialBoleta || null)
      .input("regionalEducativa", sql.NVarChar, regionalEducativa || null)
      .input("circuitoEducativo", sql.NVarChar, circuitoEducativo || null)
      .query(`
        UPDATE dbo.Institucion
        SET
          TipoClienteId = CASE WHEN @esSuperAdmin = 1 AND @tipoClienteId IS NOT NULL THEN @tipoClienteId ELSE TipoClienteId END,
          Nombre = @nombre,
          NombreComercial = @nombreComercial,
          CedulaJuridica = @cedulaJuridica,
          CorreoPrincipal = @correoPrincipal,
          TelefonoPrincipal = @telefonoPrincipal,
          Direccion = @direccion,
          CodigoPresupuestario = @codigoPresupuestario,
          CodigoPresupuestarioPL = @codigoPresupuestarioPL,
          DescripcionCodigoPresupuestarioPL = @descripcionCodigoPresupuestarioPL,
          DireccionExacta = @direccionExacta,
          LogoUrl = @logoUrl,
          MembreteUrl = @membreteUrl,
          NombreOficialBoleta = @nombreOficialBoleta,
          RegionalEducativa = @regionalEducativa,
          CircuitoEducativo = @circuitoEducativo,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE InstitucionId = @id
          AND (@esSuperAdmin = 1 OR InstitucionId = @institucionId)
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, result.recordset[0], "Institución actualizada correctamente");
  } catch (error: any) {
    console.error("Error al actualizar institución:", error);

    if (error?.number === 2627 || error?.number === 2601) {
      return res.status(409).json({
        ok: false,
        code: "INSTITUCION_DUPLICADA",
        message: "Ya existe otra institución con ese nombre"
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Error interno al actualizar institución"
    });
  }
});

router.delete("/:id", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Institucion
        SET
          Activo = 0,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.InstitucionId
        WHERE InstitucionId = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, { InstitucionId: id }, "Institución desactivada correctamente");
  } catch (error) {
    console.error("Error al desactivar institución:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al desactivar institución"
    });
  }
});

router.patch("/:id/reactivar", requireRoles("SUPER_ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return badRequest(res, "Id inválido");
    }

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.Institucion
        SET
          Activo = 1,
          UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.InstitucionId
        WHERE InstitucionId = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: "Institución no encontrada"
      });
    }

    return ok(res, { InstitucionId: id }, "Institución reactivada correctamente");
  } catch (error) {
    console.error("Error al reactivar institución:", error);
    return res.status(500).json({
      ok: false,
      message: "Error interno al reactivar institución"
    });
  }
});

export default router;
