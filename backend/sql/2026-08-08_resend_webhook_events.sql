/*
  Registro idempotente de eventos de Resend.
  Ejecutar en SQL Server antes de configurar el webhook:
  POST https://<backend>/api/webhooks/resend
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

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

  CREATE INDEX IX_ResendWebhookEvent_EmailId
    ON dbo.ResendWebhookEvent(EmailId, EventCreatedAt);
END;
