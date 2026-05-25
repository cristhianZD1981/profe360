IF OBJECT_ID('dbo.ReporteEnvioBitacora', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReporteEnvioBitacora (
    ReporteEnvioBitacoraId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Modulo NVARCHAR(40) NOT NULL,
    RegistroClave NVARCHAR(200) NOT NULL,
    GrupoId INT NULL,
    MateriaId INT NULL,
    PeriodoId INT NULL,
    AnioLectivoId INT NULL,
    EstudianteId INT NULL,
    Fecha DATE NULL,
    CorreoEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Correo DEFAULT(0),
    WaEnviado BIT NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_Wa DEFAULT(0),
    UltimoEnvioAt DATETIME2 NULL,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_UpdatedAt DEFAULT(SYSDATETIME()),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReporteEnvioBitacora_CreatedAt DEFAULT(SYSDATETIME())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UX_ReporteEnvioBitacora_ModuloClave'
    AND object_id = OBJECT_ID('dbo.ReporteEnvioBitacora')
)
BEGIN
  CREATE UNIQUE INDEX UX_ReporteEnvioBitacora_ModuloClave
    ON dbo.ReporteEnvioBitacora(Modulo, RegistroClave);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ReporteEnvioBitacora_Filtros'
    AND object_id = OBJECT_ID('dbo.ReporteEnvioBitacora')
)
BEGIN
  CREATE INDEX IX_ReporteEnvioBitacora_Filtros
    ON dbo.ReporteEnvioBitacora(GrupoId, MateriaId, PeriodoId, AnioLectivoId, EstudianteId, Fecha);
END;
GO

/*
  Módulos soportados:
  - ASISTENCIA
  - COTIDIANO_INDICADOR
  - COTIDIANO_ACTIVIDAD
*/
