IF DB_ID() IS NULL
BEGIN
  RAISERROR('No hay base de datos seleccionada.', 16, 1);
  RETURN;
END
GO

/* =========================================================
   INDICES - EVAL360 SEGUIMIENTO/CONTEXTO
   Fecha: 2026-07-20
   ========================================================= */

IF OBJECT_ID('dbo.Eval360_IndicadorGrupo', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Eval360_IndicadorGrupo_Contexto'
      AND object_id = OBJECT_ID('dbo.Eval360_IndicadorGrupo')
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_IndicadorGrupo_Contexto
  ON dbo.Eval360_IndicadorGrupo (EstructuraGrupoId, Activo, TipoUso, IndicadorGrupoId)
  INCLUDE (PlaneamientoId);
END
GO

IF OBJECT_ID('dbo.Eval360_ActividadIndicador', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Eval360_ActividadIndicador_Contexto'
      AND object_id = OBJECT_ID('dbo.Eval360_ActividadIndicador')
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_ActividadIndicador_Contexto
  ON dbo.Eval360_ActividadIndicador (ActividadId, Activo, IndicadorGrupoId);
END
GO

IF OBJECT_ID('dbo.MensajeSeguimiento', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_MensajeSeguimiento_Contexto'
      AND object_id = OBJECT_ID('dbo.MensajeSeguimiento')
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_MensajeSeguimiento_Contexto
  ON dbo.MensajeSeguimiento (InstitucionId, Activo, TipoUso, ValorNivel, MensajeSeguimientoId DESC)
  INCLUDE (Titulo, Cuerpo);
END
GO

IF OBJECT_ID('dbo.MatriculaTrasladoHistorial', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_MatriculaTrasladoHistorial_ContextoGrupo'
      AND object_id = OBJECT_ID('dbo.MatriculaTrasladoHistorial')
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_MatriculaTrasladoHistorial_ContextoGrupo
  ON dbo.MatriculaTrasladoHistorial (GrupoIdDestino, AnioLectivoId, EstudianteId, CreatedAt DESC, MatriculaTrasladoHistorialId DESC)
  INCLUDE (GrupoIdOrigen);
END
GO

IF OBJECT_ID('dbo.Eval360_NotaEdicionAuditoria', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Eval360_NotaEdicionAuditoria_Nota'
      AND object_id = OBJECT_ID('dbo.Eval360_NotaEdicionAuditoria')
  )
BEGIN
  CREATE NONCLUSTERED INDEX IX_Eval360_NotaEdicionAuditoria_Nota
  ON dbo.Eval360_NotaEdicionAuditoria (NotaActividadId, CreatedAt DESC)
  INCLUDE (NotaEdicionAuditoriaId);
END
GO

IF OBJECT_ID('dbo.ReporteEnvioBitacora', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_ReporteEnvioBitacora_ModuloClave'
      AND object_id = OBJECT_ID('dbo.ReporteEnvioBitacora')
  )
BEGIN
  CREATE UNIQUE INDEX UX_ReporteEnvioBitacora_ModuloClave
  ON dbo.ReporteEnvioBitacora(Modulo, RegistroClave);
END
GO

BEGIN TRY
  EXEC sp_updatestats;
END TRY
BEGIN CATCH
  PRINT 'No se pudieron actualizar estadisticas con este usuario; los indices quedaron creados/validados.';
END CATCH;
GO

PRINT 'Indices Eval360 contexto creados/validados.';
GO
