-- Ejecutar en la base de datos de Profe360 ANTES de desplegar el código nuevo.
-- Agrega un dato opcional; no cambia teléfonos ni plantillas existentes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.Institucion', N'WhatsAppContacto') IS NULL
BEGIN
  ALTER TABLE dbo.Institucion ADD WhatsAppContacto NVARCHAR(30) NULL;
END;
COMMIT TRANSACTION;
