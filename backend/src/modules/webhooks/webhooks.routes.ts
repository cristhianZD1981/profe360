import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env";
import { getPool, sql } from "../../config/database";

const router = Router();

function getHeader(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function verifyResendSignature(req: any) {
  const secret = String(env.mail.resendWebhookSigningSecret || "").trim();
  if (!secret) return false;

  const timestamp = getHeader(req, "svix-timestamp");
  const messageId = getHeader(req, "svix-id");
  const signatures = getHeader(req, "svix-signature").split(" ").filter(Boolean);
  const timestampMs = Number(timestamp) * 1000;
  if (!timestamp || !messageId || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${messageId}.${timestamp}.${rawBody.toString("utf8")}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  return signatures.some((item) => {
    const [version, value] = item.split(",", 2);
    if (version !== "v1" || !value) return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(value);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  });
}

async function ensureResendWebhookTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.ResendWebhookEvent', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ResendWebhookEvent (
        ResendWebhookEventId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        EventId NVARCHAR(120) NOT NULL,
        EventType NVARCHAR(80) NOT NULL,
        EmailId NVARCHAR(120) NULL,
        EmailStatus NVARCHAR(80) NULL,
        Recipient NVARCHAR(500) NULL,
        PayloadJson NVARCHAR(MAX) NOT NULL,
        EventCreatedAt DATETIME2 NULL,
        ReceivedAt DATETIME2 NOT NULL CONSTRAINT DF_ResendWebhookEvent_ReceivedAt DEFAULT(SYSDATETIME()),
        CONSTRAINT UX_ResendWebhookEvent_EventId UNIQUE(EventId)
      );
      CREATE INDEX IX_ResendWebhookEvent_EmailId ON dbo.ResendWebhookEvent(EmailId, EventCreatedAt);
    END
  `);
}

router.post("/resend", async (req, res) => {
  if (!env.mail.resendWebhookSigningSecret) {
    return res.status(503).json({ ok: false, message: "RESEND_WEBHOOK_SIGNING_SECRET no configurado" });
  }
  if (!verifyResendSignature(req)) {
    return res.status(401).json({ ok: false, message: "Firma de webhook Resend inválida" });
  }

  try {
    const event = req.body || {};
    const data = event.data || {};
    const eventId = getHeader(req, "svix-id");
    const pool = await getPool();
    await ensureResendWebhookTable(pool);
    await pool.request()
      .input("eventId", sql.NVarChar(120), eventId)
      .input("eventType", sql.NVarChar(80), String(event.type || "unknown"))
      .input("emailId", sql.NVarChar(120), data.email_id ? String(data.email_id) : null)
      .input("emailStatus", sql.NVarChar(80), String(event.type || "").replace(/^email\./, "") || null)
      .input("recipient", sql.NVarChar(500), Array.isArray(data.to) ? data.to.join(", ") : String(data.to || "") || null)
      .input("payloadJson", sql.NVarChar(sql.MAX), JSON.stringify(event))
      .input("eventCreatedAt", sql.DateTime2, event.created_at ? new Date(event.created_at) : null)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.ResendWebhookEvent WHERE EventId = @eventId)
        INSERT INTO dbo.ResendWebhookEvent
          (EventId, EventType, EmailId, EmailStatus, Recipient, PayloadJson, EventCreatedAt)
        VALUES
          (@eventId, @eventType, @emailId, @emailStatus, @recipient, @payloadJson, @eventCreatedAt)
      `);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error procesando webhook de Resend:", error);
    return res.status(500).json({ ok: false, message: "No se pudo registrar el webhook" });
  }
});

export default router;
