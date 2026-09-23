-- Ejecutar ANTES de publicar el backend y frontend de consentimiento del alumno.
-- NULL hereda la aceptación del encargado; 0/1 conserva la decisión del adulto.
-- No cambia autorizaciones existentes ni reactiva decisiones guardadas.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.Estudiante', N'AceptaWhatsAppEstudiante') IS NULL
BEGIN
  ALTER TABLE dbo.Estudiante ADD AceptaWhatsAppEstudiante BIT NULL;
END;
COMMIT TRANSACTION;
