/* Indices para cargar el detalle de una seccion en Gestion del Profe. */

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EstudianteEncargado_EstudianteActivoPrincipal'
    AND object_id = OBJECT_ID('dbo.EstudianteEncargado')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_EstudianteEncargado_EstudianteActivoPrincipal
  ON dbo.EstudianteEncargado (EstudianteId, Activo, EsPrincipal DESC, RecibeNotificaciones DESC, EstudianteEncargadoId DESC)
  INCLUDE (EncargadoId, Parentesco);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EvaluacionComponente_PlantillaActivoOrden'
    AND object_id = OBJECT_ID('dbo.EvaluacionComponente')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_EvaluacionComponente_PlantillaActivoOrden
  ON dbo.EvaluacionComponente (EvaluacionPlantillaId, Activo, Orden, EvaluacionComponenteId)
  INCLUDE (Descripcion, Porcentaje);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EvaluacionActividad_ComponenteActivoOrden'
    AND object_id = OBJECT_ID('dbo.EvaluacionActividad')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_EvaluacionActividad_ComponenteActivoOrden
  ON dbo.EvaluacionActividad (EvaluacionComponenteId, Activo, Orden, EvaluacionActividadId)
  INCLUDE (Descripcion, Porcentaje, Fecha);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EvaluacionNota_GrupoMateriaPeriodo'
    AND object_id = OBJECT_ID('dbo.EvaluacionNota')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_EvaluacionNota_GrupoMateriaPeriodo
  ON dbo.EvaluacionNota (GrupoId, MateriaId, PeriodoId)
  INCLUDE (EvaluacionActividadId, EstudianteId, Nota, PorcentajeGanado, Observacion);
END;
