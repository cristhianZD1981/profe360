IF OBJECT_ID('dbo.CertificacionEstudioConfig', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CertificacionEstudioConfig (
    InstitucionId INT NOT NULL PRIMARY KEY,
    SiguienteNumero INT NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_SiguienteNumero DEFAULT(1),
    Prefijo NVARCHAR(40) NULL,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioConfig_UpdatedAt DEFAULT(SYSDATETIME())
  );
END;
GO

IF OBJECT_ID('dbo.CertificacionEstudioRegistro', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CertificacionEstudioRegistro (
    CertificacionEstudioId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    InstitucionId INT NOT NULL,
    Consecutivo INT NOT NULL,
    CodigoConstancia NVARCHAR(120) NOT NULL,
    EstudianteId INT NOT NULL,
    GrupoId INT NULL,
    Suscrito NVARCHAR(200) NOT NULL,
    Puesto NVARCHAR(200) NOT NULL,
    CodigoPresupuestario NVARCHAR(50) NULL,
    TipoEducacion NVARCHAR(80) NOT NULL,
    MotivoTramite NVARCHAR(120) NOT NULL,
    FechaEmision DATE NOT NULL,
    CreatedByUsuarioId INT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CertificacionEstudioRegistro_CreatedAt DEFAULT(SYSDATETIME())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.CertificacionEstudioRegistro')
    AND name = 'UX_CertificacionEstudioRegistro_InstitucionConsecutivo'
)
BEGIN
  CREATE UNIQUE INDEX UX_CertificacionEstudioRegistro_InstitucionConsecutivo
    ON dbo.CertificacionEstudioRegistro(InstitucionId, Consecutivo);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.CertificacionEstudioRegistro')
    AND name = 'IX_CertificacionEstudioRegistro_Estudiante'
)
BEGIN
  CREATE INDEX IX_CertificacionEstudioRegistro_Estudiante
    ON dbo.CertificacionEstudioRegistro(InstitucionId, EstudianteId, CreatedAt DESC);
END;
GO

