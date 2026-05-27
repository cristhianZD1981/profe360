IF DB_ID() IS NULL
BEGIN
  RAISERROR('No hay base de datos seleccionada.', 16, 1);
  RETURN;
END
GO

/* =========================================================
   OPTIMIZACION DE INDICES - PROFE360 (GESTION DEL PROFE)
   Fecha: 2026-05-25
   ========================================================= */

/* 1) mis-grupos: AsignacionDocente (filtros principales) */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_AsignacionDocente_BusquedaGestion' AND object_id = OBJECT_ID('dbo.AsignacionDocente')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AsignacionDocente_BusquedaGestion
  ON dbo.AsignacionDocente (InstitucionId, Activo, AnioLectivoId, PeriodoId, MateriaId, GrupoId, UsuarioId)
  INCLUDE (TipoAsignacion);
END
GO

/* 2) mis-grupos: Matricula para conteo por grupo/anio */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Matricula_GrupoAnioEstado' AND object_id = OBJECT_ID('dbo.Matricula')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Matricula_GrupoAnioEstado
  ON dbo.Matricula (GrupoId, AnioLectivoId, Estado)
  INCLUDE (MatriculaId, EstudianteId);
END
GO

/* 3) mis-grupos: EvaluacionPlantilla por institucion/anio/periodo/materia */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EvaluacionPlantilla_BaseGrupo' AND object_id = OBJECT_ID('dbo.EvaluacionPlantilla')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_EvaluacionPlantilla_BaseGrupo
  ON dbo.EvaluacionPlantilla (InstitucionId, AnioLectivoId, PeriodoId, MateriaId, Activo, Estado, EvaluacionPlantillaId DESC)
  INCLUDE (Nombre);
END
GO

/* 4) mis-grupos: Eval360_EstructuraGrupo para OUTER APPLY */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Eval360_EstructuraGrupo_Lookup' AND object_id = OBJECT_ID('dbo.Eval360_EstructuraGrupo')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_EstructuraGrupo_Lookup
  ON dbo.Eval360_EstructuraGrupo (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, Activo, EstructuraGrupoId DESC)
  INCLUDE (PlantillaBaseId);
END
GO

/* 5) mis-grupos: Eval360_Actividad para joins por estructura */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Eval360_Actividad_Estructura' AND object_id = OBJECT_ID('dbo.Eval360_Actividad')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_Actividad_Estructura
  ON dbo.Eval360_Actividad (EstructuraGrupoId, ActividadId);
END
GO

/* 6) mis-grupos: Eval360_NotaActividad para EXISTS de calificaciones */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Eval360_NotaActividad_Actividad' AND object_id = OBJECT_ID('dbo.Eval360_NotaActividad')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_NotaActividad_Actividad
  ON dbo.Eval360_NotaActividad (ActividadId)
  INCLUDE (PuntosObtenidos, PorcentajeObtenido);
END
GO

/* 7) mis-grupos: Eval360_SeguimientoIndicador para EXISTS por actividad */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Eval360_SeguimientoIndicador_Actividad' AND object_id = OBJECT_ID('dbo.Eval360_SeguimientoIndicador')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_SeguimientoIndicador_Actividad
  ON dbo.Eval360_SeguimientoIndicador (ActividadId)
  INCLUDE (ValorSeleccionado);
END
GO

/* 8) mis-grupos: AsistenciaRegistro para EXISTS de registros */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_AsistenciaRegistro_GrupoMateriaPeriodo' AND object_id = OBJECT_ID('dbo.AsistenciaRegistro')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AsistenciaRegistro_GrupoMateriaPeriodo
  ON dbo.AsistenciaRegistro (GrupoId, MateriaId, AnioLectivoId, PeriodoId);
END
GO

/* 9) catalogos: AnioLectivo */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_AnioLectivo_InstitucionActivo' AND object_id = OBJECT_ID('dbo.AnioLectivo')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_AnioLectivo_InstitucionActivo
  ON dbo.AnioLectivo (InstitucionId, Activo, FechaInicio DESC)
  INCLUDE (Nombre, FechaFin);
END
GO

/* 10) catalogos: Periodo */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Periodo_AnioActivoOrden' AND object_id = OBJECT_ID('dbo.Periodo')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Periodo_AnioActivoOrden
  ON dbo.Periodo (AnioLectivoId, Activo, NumeroOrden)
  INCLUDE (Nombre, FechaInicio, FechaFin);
END
GO

/* 11) catalogos: Materia */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_Materia_InstitucionActivaNombre' AND object_id = OBJECT_ID('dbo.Materia')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Materia_InstitucionActivaNombre
  ON dbo.Materia (InstitucionId, Activa, Nombre)
  INCLUDE (MateriaId, Codigo, Descripcion);
END
GO

/* 12) niveles: NivelDesempeno */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_NivelDesempeno_InstitucionActivoValor' AND object_id = OBJECT_ID('dbo.NivelDesempeno')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_NivelDesempeno_InstitucionActivoValor
  ON dbo.NivelDesempeno (InstitucionId, Activo, Valor, Descripcion)
  INCLUDE (CreatedAt, UpdatedAt);
END
GO

/* 13) plantillas IA: PlantillaPromptIA */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_PlantillaPromptIA_Listado' AND object_id = OBJECT_ID('dbo.PlantillaPromptIA')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PlantillaPromptIA_Listado
  ON dbo.PlantillaPromptIA (TipoGeneracionIAId, Activo, EsPublica, UsuarioCreadorId, NombrePlantilla)
  INCLUDE (IndicacionesSistema, ContextoBase, ReglasConstruccion, EstructuraSalida, FormatoRespuesta, FechaCreacion);
END
GO

/* 14) plantillas IA: TipoGeneracionIA */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_TipoGeneracionIA_ActivoNombre' AND object_id = OBJECT_ID('dbo.TipoGeneracionIA')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_TipoGeneracionIA_ActivoNombre
  ON dbo.TipoGeneracionIA (Activo, Nombre)
  INCLUDE (Id);
END
GO

/* Actualizar estadisticas para que el optimizador use los nuevos indices */
EXEC sp_updatestats;
GO

PRINT 'Indices creados/validados y estadisticas actualizadas.';
GO
