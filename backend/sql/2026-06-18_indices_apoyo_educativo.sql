IF DB_ID() IS NULL
BEGIN
  RAISERROR('No hay base de datos seleccionada.', 16, 1);
  RETURN;
END
GO

/* =========================================================
   INDICES PARA APOYO EDUCATIVO / ADECUACIONES
   Fecha: 2026-06-18
   ========================================================= */

IF OBJECT_ID('dbo.AsignacionDocente', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_AsignacionDocente_ApoyoEducativo'
    AND object_id = OBJECT_ID('dbo.AsignacionDocente')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AsignacionDocente_ApoyoEducativo
  ON dbo.AsignacionDocente (InstitucionId, UsuarioId, Activo, MateriaId, GrupoId, AnioLectivoId, PeriodoId);
END
GO

IF OBJECT_ID('dbo.Estudiante', 'U') IS NOT NULL
AND COL_LENGTH('dbo.Estudiante', 'TieneAdecuacion') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_Estudiante_ApoyoEducativo'
    AND object_id = OBJECT_ID('dbo.Estudiante')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Estudiante_ApoyoEducativo
  ON dbo.Estudiante (Activo, TieneAdecuacion, EstudianteId)
  INCLUDE (Identificacion, Nombre, PrimerApellido, SegundoApellido, FechaNacimiento);
END
GO

IF OBJECT_ID('dbo.AdecuacionCatalogo', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_AdecuacionCatalogo_ApoyoEducativo'
    AND object_id = OBJECT_ID('dbo.AdecuacionCatalogo')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AdecuacionCatalogo_ApoyoEducativo
  ON dbo.AdecuacionCatalogo (InstitucionId, Activo, TipoAdecuacionId, Tipo)
  INCLUDE (Descripcion);
END
GO

IF OBJECT_ID('dbo.TipoAdecuacion', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_TipoAdecuacion_ApoyoEducativo'
    AND object_id = OBJECT_ID('dbo.TipoAdecuacion')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_TipoAdecuacion_ApoyoEducativo
  ON dbo.TipoAdecuacion (InstitucionId, Activo, TipoAdecuacionId)
  INCLUDE (Descripcion);
END
GO

IF OBJECT_ID('dbo.ApoyoEducativo', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ApoyoEducativo_Bootstrap'
    AND object_id = OBJECT_ID('dbo.ApoyoEducativo')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ApoyoEducativo_Bootstrap
  ON dbo.ApoyoEducativo (InstitucionId, Activo, UsuarioId, ApoyoEducativoId)
  INCLUDE (CreatedAt);
END
GO

IF OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ApoyoEducativoEstudiante_Informes'
    AND object_id = OBJECT_ID('dbo.ApoyoEducativoEstudiante')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ApoyoEducativoEstudiante_Informes
  ON dbo.ApoyoEducativoEstudiante (ApoyoEducativoId, GrupoId, EstudianteId, InformeGeneradoAt DESC)
  INCLUDE (InformeNombre, PlantillaNombre)
  WHERE InformeGeneradoAt IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ApoyoEducativoEstudiante_InformesRecientes'
    AND object_id = OBJECT_ID('dbo.ApoyoEducativoEstudiante')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ApoyoEducativoEstudiante_InformesRecientes
  ON dbo.ApoyoEducativoEstudiante (GrupoId, InformeGeneradoAt DESC, ApoyoEducativoEstudianteId DESC)
  INCLUDE (ApoyoEducativoId, EstudianteId, InformeNombre, PlantillaNombre)
  WHERE InformeGeneradoAt IS NOT NULL;
END
GO
