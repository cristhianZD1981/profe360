/*
  Historial auditable de inactivaciones de estudiantes.
  Script idempotente; ejecutar una sola vez por base de datos antes de usar
  los cambios de estado de estudiante.
*/
IF OBJECT_ID(N'dbo.EstudianteInactivacion', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EstudianteInactivacion (
    EstudianteInactivacionId INT IDENTITY(1,1) NOT NULL
      CONSTRAINT PK_EstudianteInactivacion PRIMARY KEY,
    InstitucionId INT NOT NULL,
    EstudianteId INT NOT NULL,
    Motivo NVARCHAR(30) NOT NULL,
    Observacion NVARCHAR(1000) NULL,
    FechaInactivacion DATETIME2(0) NOT NULL
      CONSTRAINT DF_EstudianteInactivacion_Fecha DEFAULT(SYSDATETIME()),
    Activo BIT NOT NULL CONSTRAINT DF_EstudianteInactivacion_Activo DEFAULT(1),
    UsuarioInactivaId INT NULL,
    FechaReactivacion DATETIME2(0) NULL,
    UsuarioReactivaId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_EstudianteInactivacion_Created DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_EstudianteInactivacion_Updated DEFAULT(SYSDATETIME()),
    CONSTRAINT CK_EstudianteInactivacion_Motivo CHECK (Motivo IN (N'Traslado', N'Abandono'))
  );
  CREATE INDEX IX_EstudianteInactivacion_Actual
    ON dbo.EstudianteInactivacion(InstitucionId, EstudianteId, Activo, FechaInactivacion DESC);
END;
GO
