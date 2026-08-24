SET XACT_ABORT ON;
GO

IF COL_LENGTH(N'dbo.Institucion', N'WhatsAppModo') IS NULL
BEGIN
  EXEC sys.sp_executesql N'
    ALTER TABLE dbo.Institucion
      ADD WhatsAppModo NVARCHAR(25) NOT NULL
        CONSTRAINT DF_Institucion_WhatsAppModo DEFAULT(N''NO_CONFIGURADO'');
  ';
END;
GO

BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Institucion_WhatsAppModo'
    AND parent_object_id = OBJECT_ID(N'dbo.Institucion')
)
  ALTER TABLE dbo.Institucion DROP CONSTRAINT CK_Institucion_WhatsAppModo;

ALTER TABLE dbo.Institucion ADD CONSTRAINT CK_Institucion_WhatsAppModo
  CHECK (WhatsAppModo IN (N'NO_CONFIGURADO', N'GENERICA', N'PROPIO_API', N'PROPIO_QR'));

;WITH EstadoActual AS (
  SELECT
    i.InstitucionId,
    CanalActivo.TipoCanal AS TipoCanalActivo,
    CASE WHEN EXISTS (
      SELECT 1 FROM dbo.WhatsAppCanal c
      WHERE c.InstitucionId = i.InstitucionId AND c.EsFallback = 0
    ) THEN 1 ELSE 0 END AS TieneHistorial
  FROM dbo.Institucion i
  OUTER APPLY (
    SELECT TOP 1 c.TipoCanal
    FROM dbo.WhatsAppCanal c
    WHERE c.InstitucionId = i.InstitucionId
      AND c.EsFallback = 0
      AND c.Activo = 1
    ORDER BY c.WhatsAppCanalId DESC
  ) CanalActivo
)
UPDATE i
SET WhatsAppModo =
  CASE
    WHEN e.TipoCanalActivo = N'WHATSAPP_WEB' THEN N'PROPIO_QR'
    WHEN e.TipoCanalActivo = N'WABA' THEN N'PROPIO_API'
    WHEN e.TieneHistorial = 1 THEN N'GENERICA'
    ELSE N'NO_CONFIGURADO'
  END
FROM dbo.Institucion i
INNER JOIN EstadoActual e ON e.InstitucionId = i.InstitucionId
WHERE i.WhatsAppModo = N'NO_CONFIGURADO';

COMMIT TRANSACTION;

SELECT N'OK' AS Resultado,
       N'Modo explícito de WhatsApp habilitado por institución.' AS Mensaje;
