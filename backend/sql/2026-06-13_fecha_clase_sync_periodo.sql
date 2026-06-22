/*
  PROFE360
  Mejora de sincronizacion de FechaClase por periodo

  Ejecutar manualmente en SQL Server.
  Este script no elimina datos.
*/

SET NOCOUNT ON;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_FechaClase_PeriodoId_Fecha'
    AND object_id = OBJECT_ID('dbo.FechaClase')
)
BEGIN
  CREATE INDEX IX_FechaClase_PeriodoId_Fecha
    ON dbo.FechaClase (PeriodoId, Fecha);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_HorarioGrupo_GrupoMateria_Activo_DiaSemana'
    AND object_id = OBJECT_ID('dbo.HorarioGrupo')
)
BEGIN
  CREATE INDEX IX_HorarioGrupo_GrupoMateria_Activo_DiaSemana
    ON dbo.HorarioGrupo (GrupoMateriaId, Activo, DiaSemana)
    INCLUDE (BloqueHorarioId);
END;
GO

IF OBJECT_ID('dbo.FechaClaseSyncLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.FechaClaseSyncLog (
    FechaClaseSyncLogId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    InstitucionId INT NOT NULL,
    PeriodoId INT NOT NULL,
    FechaCorteSolicitada DATE NULL,
    FechaCorteAplicada DATE NOT NULL,
    Modo NVARCHAR(30) NOT NULL,
    UsuarioId INT NULL,
    ResumenJson NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_FechaClaseSyncLog_CreatedAt DEFAULT (SYSDATETIME())
  );

  CREATE INDEX IX_FechaClaseSyncLog_PeriodoId_CreatedAt
    ON dbo.FechaClaseSyncLog (PeriodoId, CreatedAt DESC);

  CREATE INDEX IX_FechaClaseSyncLog_InstitucionId_CreatedAt
    ON dbo.FechaClaseSyncLog (InstitucionId, CreatedAt DESC);
END;
GO
