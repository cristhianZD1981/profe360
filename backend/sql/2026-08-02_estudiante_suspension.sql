IF OBJECT_ID('dbo.EstudianteSuspension', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EstudianteSuspension (
    EstudianteSuspensionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    InstitucionId INT NOT NULL,
    EstudianteId INT NOT NULL,
    Motivo NVARCHAR(50) NOT NULL,
    FechaInicio DATE NOT NULL,
    FechaFin DATE NOT NULL,
    Observacion NVARCHAR(500) NULL,
    Activo BIT NOT NULL CONSTRAINT DF_EstudianteSuspension_Activo DEFAULT(1),
    UsuarioCreaId INT NULL,
    UsuarioActualizaId INT NULL,
    UsuarioLevantaId INT NULL,
    FechaLevantamiento DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_EstudianteSuspension_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT CK_EstudianteSuspension_Motivo
      CHECK (Motivo IN (N'Medida Precautoria', N'Acción Correctiva', N'Accion Correctiva')),
    CONSTRAINT CK_EstudianteSuspension_Fechas
      CHECK (FechaFin >= FechaInicio),
    CONSTRAINT FK_EstudianteSuspension_Institucion
      FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
    CONSTRAINT FK_EstudianteSuspension_Estudiante
      FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
    CONSTRAINT FK_EstudianteSuspension_UsuarioCrea
      FOREIGN KEY (UsuarioCreaId) REFERENCES dbo.Usuario(UsuarioId),
    CONSTRAINT FK_EstudianteSuspension_UsuarioActualiza
      FOREIGN KEY (UsuarioActualizaId) REFERENCES dbo.Usuario(UsuarioId),
    CONSTRAINT FK_EstudianteSuspension_UsuarioLevanta
      FOREIGN KEY (UsuarioLevantaId) REFERENCES dbo.Usuario(UsuarioId)
  );

  CREATE INDEX IX_EstudianteSuspension_Vigente
    ON dbo.EstudianteSuspension (InstitucionId, EstudianteId, Activo, FechaInicio, FechaFin)
    INCLUDE (Motivo, Observacion);

  CREATE INDEX IX_EstudianteSuspension_AdminBusqueda
    ON dbo.EstudianteSuspension (InstitucionId, Activo, FechaFin, FechaInicio)
    INCLUDE (EstudianteId, Motivo);
END;
GO

CREATE OR ALTER VIEW dbo.vw_EstudianteSuspensionVigente
AS
SELECT
  s.EstudianteSuspensionId,
  s.InstitucionId,
  s.EstudianteId,
  s.Motivo,
  s.FechaInicio,
  s.FechaFin,
  s.Observacion,
  s.Activo,
  s.UsuarioCreaId,
  s.UsuarioActualizaId,
  s.UsuarioLevantaId,
  s.FechaLevantamiento,
  s.CreatedAt,
  s.UpdatedAt
FROM dbo.EstudianteSuspension s
WHERE s.Activo = 1
  AND CONVERT(date, SYSDATETIME()) >= s.FechaInicio
  AND CONVERT(date, SYSDATETIME()) <= s.FechaFin;
GO
