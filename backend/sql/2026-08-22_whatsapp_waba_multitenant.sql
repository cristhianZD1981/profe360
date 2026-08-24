/*
  PROFE360 - WhatsApp WABA multiinstitución con 2Chat
  Fecha: 2026-08-22

  Esta migración crea únicamente la estructura de datos.
  No activa envíos ni guarda API Keys en texto plano.

  Conceptos:
    - WhatsAppCanal: número WABA de un colegio o número fallback general.
    - WhatsAppPlantilla: plantilla aprobada en Meta/2Chat por tipo de aviso.
    - WhatsAppEnvio: bitácora para reportes y auditoría.

  Ejecutar después de la creación de dbo.Institucion y dbo.Usuario.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.WhatsAppCanal', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.WhatsAppCanal (
      WhatsAppCanalId          INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_WhatsAppCanal PRIMARY KEY,
      InstitucionId            INT NULL,
      Proveedor                 NVARCHAR(30) NOT NULL
        CONSTRAINT DF_WhatsAppCanal_Proveedor DEFAULT(N'2CHAT'),
      TipoCanal                 NVARCHAR(20) NOT NULL
        CONSTRAINT DF_WhatsAppCanal_TipoCanal DEFAULT(N'WABA'),
      NumeroOrigen              NVARCHAR(30) NOT NULL,
      NombreVisible             NVARCHAR(200) NULL,
      ApiKeyCifrada             VARBINARY(MAX) NULL,
      ApiKeyReferencia          NVARCHAR(250) NULL,
      WabaBusinessAccountId     NVARCHAR(100) NULL,
      PhoneNumberId             NVARCHAR(100) NULL,
      Estado                    NVARCHAR(20) NOT NULL
        CONSTRAINT DF_WhatsAppCanal_Estado DEFAULT(N'PENDIENTE'),
      EsFallback                BIT NOT NULL
        CONSTRAINT DF_WhatsAppCanal_EsFallback DEFAULT(0),
      Activo                    BIT NOT NULL
        CONSTRAINT DF_WhatsAppCanal_Activo DEFAULT(1),
      FechaUltimaValidacion     DATETIME2 NULL,
      UltimoError               NVARCHAR(1000) NULL,
      CreatedAt                 DATETIME2 NOT NULL
        CONSTRAINT DF_WhatsAppCanal_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt                 DATETIME2 NULL,
      CONSTRAINT FK_WhatsAppCanal_Institucion
        FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
      CONSTRAINT CK_WhatsAppCanal_Proveedor
        CHECK (Proveedor IN (N'2CHAT')),
      CONSTRAINT CK_WhatsAppCanal_TipoCanal
        CHECK (TipoCanal IN (N'WABA')),
      CONSTRAINT CK_WhatsAppCanal_Estado
        CHECK (Estado IN (N'PENDIENTE', N'CONECTADO', N'ERROR', N'INACTIVO')),
      CONSTRAINT CK_WhatsAppCanal_Fallback
        CHECK ((EsFallback = 1 AND InstitucionId IS NULL) OR (EsFallback = 0 AND InstitucionId IS NOT NULL))
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppCanal')
      AND name = N'UX_WhatsAppCanal_InstitucionActivo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_WhatsAppCanal_InstitucionActivo
      ON dbo.WhatsAppCanal (InstitucionId)
      WHERE InstitucionId IS NOT NULL AND Activo = 1;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppCanal')
      AND name = N'UX_WhatsAppCanal_FallbackActivo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_WhatsAppCanal_FallbackActivo
      ON dbo.WhatsAppCanal (EsFallback)
      WHERE EsFallback = 1 AND Activo = 1;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppCanal')
      AND name = N'IX_WhatsAppCanal_NumeroOrigen'
  )
  BEGIN
    CREATE INDEX IX_WhatsAppCanal_NumeroOrigen
      ON dbo.WhatsAppCanal (NumeroOrigen, Activo);
  END;

  IF OBJECT_ID(N'dbo.WhatsAppPlantilla', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.WhatsAppPlantilla (
      WhatsAppPlantillaId       INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_WhatsAppPlantilla PRIMARY KEY,
      WhatsAppCanalId           INT NOT NULL,
      TipoMensaje               NVARCHAR(40) NOT NULL,
      Nombre                    NVARCHAR(150) NOT NULL,
      TemplateUuid              NVARCHAR(150) NOT NULL,
      CodigoIdioma              NVARCHAR(20) NOT NULL
        CONSTRAINT DF_WhatsAppPlantilla_CodigoIdioma DEFAULT(N'es'),
      CantidadParametrosBody    INT NOT NULL
        CONSTRAINT DF_WhatsAppPlantilla_CantidadBody DEFAULT(0),
      Estado                    NVARCHAR(20) NOT NULL
        CONSTRAINT DF_WhatsAppPlantilla_Estado DEFAULT(N'PENDIENTE'),
      Activo                    BIT NOT NULL
        CONSTRAINT DF_WhatsAppPlantilla_Activo DEFAULT(1),
      FechaUltimaSincronizacion DATETIME2 NULL,
      UltimoError               NVARCHAR(1000) NULL,
      CreatedAt                 DATETIME2 NOT NULL
        CONSTRAINT DF_WhatsAppPlantilla_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt                 DATETIME2 NULL,
      CONSTRAINT FK_WhatsAppPlantilla_Canal
        FOREIGN KEY (WhatsAppCanalId) REFERENCES dbo.WhatsAppCanal(WhatsAppCanalId),
      CONSTRAINT CK_WhatsAppPlantilla_Estado
        CHECK (Estado IN (N'PENDIENTE', N'APPROVED', N'REJECTED', N'PAUSED', N'INACTIVO')),
      CONSTRAINT CK_WhatsAppPlantilla_CantidadBody
        CHECK (CantidadParametrosBody >= 0)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppPlantilla')
      AND name = N'UX_WhatsAppPlantilla_CanalTipoIdiomaActivo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_WhatsAppPlantilla_CanalTipoIdiomaActivo
      ON dbo.WhatsAppPlantilla (WhatsAppCanalId, TipoMensaje, CodigoIdioma)
      WHERE Activo = 1;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppPlantilla')
      AND name = N'IX_WhatsAppPlantilla_Busqueda'
  )
  BEGIN
    CREATE INDEX IX_WhatsAppPlantilla_Busqueda
      ON dbo.WhatsAppPlantilla (WhatsAppCanalId, Estado, Activo, TipoMensaje);
  END;

  IF OBJECT_ID(N'dbo.WhatsAppEnvio', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.WhatsAppEnvio (
      WhatsAppEnvioId           BIGINT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_WhatsAppEnvio PRIMARY KEY,
      InstitucionId             INT NULL,
      WhatsAppCanalId           INT NULL,
      WhatsAppPlantillaId       INT NULL,
      GrupoId                   INT NULL,
      GrupoClaseId              INT NULL,
      EstudianteId              INT NULL,
      ProfesorUsuarioId         INT NULL,
      SolicitadoPorUsuarioId    INT NULL,
      TipoMensaje               NVARCHAR(40) NOT NULL,
      TelefonoDestino           NVARCHAR(30) NOT NULL,
      NombreInstitucionSnapshot NVARCHAR(200) NULL,
      NombreGrupoSnapshot       NVARCHAR(200) NULL,
      NombreProfesorSnapshot    NVARCHAR(250) NULL,
      NumeroOrigenSnapshot      NVARCHAR(30) NULL,
      EsFallback                BIT NOT NULL
        CONSTRAINT DF_WhatsAppEnvio_EsFallback DEFAULT(0),
      Estado                    NVARCHAR(20) NOT NULL
        CONSTRAINT DF_WhatsAppEnvio_Estado DEFAULT(N'PENDIENTE'),
      MessageUuid               NVARCHAR(150) NULL,
      CodigoErrorProveedor      NVARCHAR(100) NULL,
      MotivoError               NVARCHAR(2000) NULL,
      MensajeResumen            NVARCHAR(500) NULL,
      FechaProgramada           DATETIME2 NULL,
      FechaEnvio                DATETIME2 NULL,
      CreatedAt                 DATETIME2 NOT NULL
        CONSTRAINT DF_WhatsAppEnvio_CreatedAt DEFAULT(SYSDATETIME()),
      CONSTRAINT FK_WhatsAppEnvio_Institucion
        FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
      CONSTRAINT FK_WhatsAppEnvio_Canal
        FOREIGN KEY (WhatsAppCanalId) REFERENCES dbo.WhatsAppCanal(WhatsAppCanalId),
      CONSTRAINT FK_WhatsAppEnvio_Plantilla
        FOREIGN KEY (WhatsAppPlantillaId) REFERENCES dbo.WhatsAppPlantilla(WhatsAppPlantillaId),
      CONSTRAINT CK_WhatsAppEnvio_Estado
        CHECK (Estado IN (N'PENDIENTE', N'ENVIANDO', N'ACEPTADO', N'ENVIADO', N'ENTREGADO', N'LEIDO', N'FALLIDO', N'OMITIDO'))
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppEnvio')
      AND name = N'IX_WhatsAppEnvio_Reporte'
  )
  BEGIN
    CREATE INDEX IX_WhatsAppEnvio_Reporte
      ON dbo.WhatsAppEnvio (InstitucionId, TipoMensaje, CreatedAt)
      INCLUDE (GrupoId, GrupoClaseId, ProfesorUsuarioId, Estado, EsFallback, WhatsAppCanalId);
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppEnvio')
      AND name = N'IX_WhatsAppEnvio_FechaEstado'
  )
  BEGIN
    CREATE INDEX IX_WhatsAppEnvio_FechaEstado
      ON dbo.WhatsAppEnvio (CreatedAt, Estado);
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WhatsAppEnvio')
      AND name = N'IX_WhatsAppEnvio_MessageUuid'
  )
  BEGIN
    CREATE INDEX IX_WhatsAppEnvio_MessageUuid
      ON dbo.WhatsAppEnvio (MessageUuid)
      WHERE MessageUuid IS NOT NULL;
  END;

  COMMIT TRANSACTION;

  SELECT
    N'OK' AS Resultado,
    N'Estructura WABA multiinstitución creada o verificada correctamente.' AS Mensaje;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO

/* Validación rápida posterior a la ejecución */
SELECT
  t.name AS Tabla,
  SUM(CASE WHEN t.name IS NOT NULL THEN 1 ELSE 0 END) AS Existe
FROM (VALUES
  (N'WhatsAppCanal'),
  (N'WhatsAppPlantilla'),
  (N'WhatsAppEnvio')
) AS esperado(name)
LEFT JOIN sys.tables t ON t.name = esperado.name AND SCHEMA_NAME(t.schema_id) = N'dbo'
GROUP BY t.name;
GO
