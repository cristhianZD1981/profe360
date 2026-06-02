IF OBJECT_ID('dbo.MatriculaTrasladoHistorial', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MatriculaTrasladoHistorial (
    MatriculaTrasladoHistorialId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    InstitucionId INT NOT NULL,
    MatriculaId INT NOT NULL,
    EstudianteId INT NOT NULL,
    AnioLectivoId INT NOT NULL,
    GrupoIdOrigen INT NOT NULL,
    GrupoIdDestino INT NOT NULL,
    UsuarioTrasladoId INT NULL,
    Observacion NVARCHAR(500) NULL,
    TotalNotasClasicasCopiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Notas DEFAULT(0),
    TotalNotasEval360Copiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Eval360 DEFAULT(0),
    TotalSeguimientosCopiados INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Seguimientos DEFAULT(0),
    TotalAsistenciasCopiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Asistencias DEFAULT(0),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_CreatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_MatriculaTrasladoHistorial_Matricula
    ON dbo.MatriculaTrasladoHistorial (MatriculaId, CreatedAt DESC);

  CREATE INDEX IX_MatriculaTrasladoHistorial_Estudiante
    ON dbo.MatriculaTrasladoHistorial (InstitucionId, EstudianteId, AnioLectivoId, CreatedAt DESC);
END;
