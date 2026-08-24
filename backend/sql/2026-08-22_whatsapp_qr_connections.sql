SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF COL_LENGTH(N'dbo.WhatsAppCanal', N'CanalExternoId') IS NULL
    ALTER TABLE dbo.WhatsAppCanal ADD CanalExternoId NVARCHAR(150) NULL;

  IF COL_LENGTH(N'dbo.WhatsAppCanal', N'SincronizarContactos') IS NULL
    ALTER TABLE dbo.WhatsAppCanal ADD SincronizarContactos BIT NOT NULL CONSTRAINT DF_WhatsAppCanal_SincronizarContactos DEFAULT(0);

  IF COL_LENGTH(N'dbo.WhatsAppCanal', N'FechaUltimaConexion') IS NULL
    ALTER TABLE dbo.WhatsAppCanal ADD FechaUltimaConexion DATETIME2 NULL;

  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_WhatsAppCanal_TipoCanal' AND parent_object_id = OBJECT_ID(N'dbo.WhatsAppCanal'))
    ALTER TABLE dbo.WhatsAppCanal DROP CONSTRAINT CK_WhatsAppCanal_TipoCanal;

  ALTER TABLE dbo.WhatsAppCanal ADD CONSTRAINT CK_WhatsAppCanal_TipoCanal
    CHECK (TipoCanal IN (N'WABA', N'WHATSAPP_WEB'));

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.WhatsAppCanal') AND name = N'IX_WhatsAppCanal_CanalExterno')
    CREATE INDEX IX_WhatsAppCanal_CanalExterno ON dbo.WhatsAppCanal (CanalExternoId, TipoCanal, Activo);

  COMMIT TRANSACTION;
  SELECT N'OK' AS Resultado, N'Campos y tipo de conexión QR habilitados correctamente.' AS Mensaje;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
