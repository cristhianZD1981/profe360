/*
  Script: limpieza_pruebas_operacion.sql
  Objetivo: limpiar datos transaccionales de pruebas sin romper catálogos.
  Alcance base:
    - Calificaciones / seguimiento (cotidiano, tareas, exámenes)
    - Asistencia
    - Planeamientos e indicadores
    - Estructuras Eval360
    - Evaluación académica
    - Alertas/log de correos enviados a alumnos
    - Historial de generación IA de planeamiento

  Alcance opcional por bandera:
    - Boletas de conducta
    - Tokens de recuperación de contraseña
    - Tablas de auditoría/log personalizadas

  Uso recomendado:
    1) Ejecutar primero con @DryRun = 1 para ver conteos.
    2) Revisar resultados.
    3) Ejecutar con @DryRun = 0 para aplicar.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @InstitucionId INT = 1;      -- CAMBIAR, NULL = todas las instituciones
DECLARE @AnioLectivoId INT = NULL;   -- opcional: NULL = todos los años
DECLARE @PeriodoId INT = NULL;       -- opcional: NULL = todos los periodos
DECLARE @DryRun BIT = 0;             -- 1 = solo vista previa, 0 = borrar

DECLARE @LimpiarBoletas BIT = 1;     -- 1 = borra dbo.BoletaConducta (y su envío)
DECLARE @LimpiarTokens BIT = 1;      -- 1 = borra dbo.UsuarioResetPasswordToken
DECLARE @LimpiarAuditoria BIT = 1;   -- 1 = borra tablas detectadas tipo log/auditoría
DECLARE @LimpiarEvaluacion BIT = 1;  -- 1 = borra evaluaciones / plantillas / notas

IF OBJECT_ID('tempdb..#TargetEstructura') IS NOT NULL DROP TABLE #TargetEstructura;
IF OBJECT_ID('tempdb..#TargetPlaneamiento') IS NOT NULL DROP TABLE #TargetPlaneamiento;
IF OBJECT_ID('tempdb..#TargetAsistenciaSesion') IS NOT NULL DROP TABLE #TargetAsistenciaSesion;
IF OBJECT_ID('tempdb..#TargetEvaluacionPlantilla') IS NOT NULL DROP TABLE #TargetEvaluacionPlantilla;
IF OBJECT_ID('tempdb..#AuditTables') IS NOT NULL DROP TABLE #AuditTables;

SELECT eg.EstructuraGrupoId
INTO #TargetEstructura
FROM dbo.Eval360_EstructuraGrupo eg
WHERE (@InstitucionId IS NULL OR eg.InstitucionId = @InstitucionId)
  AND (@AnioLectivoId IS NULL OR eg.AnioLectivoId = @AnioLectivoId)
  AND (@PeriodoId IS NULL OR eg.PeriodoId = @PeriodoId);

SELECT p.PlaneamientoId
INTO #TargetPlaneamiento
FROM dbo.Planeamiento p
WHERE (@InstitucionId IS NULL OR p.InstitucionId = @InstitucionId)
  AND (@AnioLectivoId IS NULL OR p.AnioLectivoId = @AnioLectivoId)
  AND (@PeriodoId IS NULL OR p.PeriodoId = @PeriodoId);

SELECT ep.EvaluacionPlantillaId
INTO #TargetEvaluacionPlantilla
FROM dbo.EvaluacionPlantilla ep
WHERE (@InstitucionId IS NULL OR ep.InstitucionId = @InstitucionId)
  AND (@AnioLectivoId IS NULL OR ep.AnioLectivoId = @AnioLectivoId)
  AND (@PeriodoId IS NULL OR ep.PeriodoId = @PeriodoId);

CREATE TABLE #TargetAsistenciaSesion (
  AsistenciaSesionId INT NOT NULL PRIMARY KEY
);

DECLARE @hasAsiGrupoId BIT = CASE WHEN COL_LENGTH('dbo.AsistenciaSesion', 'GrupoId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @hasAsiFechaClaseId BIT = CASE WHEN COL_LENGTH('dbo.AsistenciaSesion', 'FechaClaseId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @hasFcFechaClaseId BIT = CASE WHEN COL_LENGTH('dbo.FechaClase', 'FechaClaseId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @hasFcGrupoId BIT = CASE WHEN COL_LENGTH('dbo.FechaClase', 'GrupoId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @hasFcAnioLectivoId BIT = CASE WHEN COL_LENGTH('dbo.FechaClase', 'AnioLectivoId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @hasFcPeriodoId BIT = CASE WHEN COL_LENGTH('dbo.FechaClase', 'PeriodoId') IS NOT NULL THEN 1 ELSE 0 END;
DECLARE @sqlAsistencia NVARCHAR(MAX);

IF @hasAsiGrupoId = 1
BEGIN
  SET @sqlAsistencia = N'
    INSERT INTO #TargetAsistenciaSesion (AsistenciaSesionId)
    SELECT s.AsistenciaSesionId
    FROM dbo.AsistenciaSesion s
    INNER JOIN dbo.Grupo g ON g.GrupoId = s.GrupoId
    WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId);';
END
ELSE IF @hasAsiFechaClaseId = 1 AND @hasFcFechaClaseId = 1 AND @hasFcGrupoId = 1
BEGIN
  SET @sqlAsistencia = N'
    INSERT INTO #TargetAsistenciaSesion (AsistenciaSesionId)
    SELECT s.AsistenciaSesionId
    FROM dbo.AsistenciaSesion s
    INNER JOIN dbo.FechaClase fc ON fc.FechaClaseId = s.FechaClaseId
    INNER JOIN dbo.Grupo g ON g.GrupoId = fc.GrupoId
    WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId)';

  IF @hasFcAnioLectivoId = 1
    SET @sqlAsistencia += N' AND (@AnioLectivoId IS NULL OR fc.AnioLectivoId = @AnioLectivoId)';

  IF @hasFcPeriodoId = 1
    SET @sqlAsistencia += N' AND (@PeriodoId IS NULL OR fc.PeriodoId = @PeriodoId)';

  SET @sqlAsistencia += N';';
END
ELSE
BEGIN
  SET @sqlAsistencia = N'
    INSERT INTO #TargetAsistenciaSesion (AsistenciaSesionId)
    SELECT s.AsistenciaSesionId
    FROM dbo.AsistenciaSesion s;';
END;

EXEC sp_executesql
  @sqlAsistencia,
  N'@InstitucionId INT, @AnioLectivoId INT, @PeriodoId INT',
  @InstitucionId = @InstitucionId,
  @AnioLectivoId = @AnioLectivoId,
  @PeriodoId = @PeriodoId;

CREATE TABLE #AuditTables (
  SchemaName SYSNAME NOT NULL,
  TableName SYSNAME NOT NULL,
  FullName NVARCHAR(400) NOT NULL,
  HasInstitucionId BIT NOT NULL
);

INSERT INTO #AuditTables (SchemaName, TableName, FullName, HasInstitucionId)
SELECT
  s.name,
  t.name,
  QUOTENAME(s.name) + N'.' + QUOTENAME(t.name),
  CASE WHEN EXISTS (
    SELECT 1
    FROM sys.columns c
    WHERE c.object_id = t.object_id
      AND c.name = 'InstitucionId'
  ) THEN 1 ELSE 0 END
FROM sys.tables t
INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
  AND (
    t.name LIKE '%Log%'
    OR t.name LIKE '%Audit%'
    OR t.name LIKE '%Auditoria%'
    OR t.name LIKE '%Bitacora%'
    OR t.name LIKE '%Historico%'
    OR t.name LIKE '%Historial%'
  )
  AND t.name NOT IN (
    'AsistenciaRegistro',
    'BoletaConductaEnvio',
    'PlaneamientoIAGeneracion'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys fk
    WHERE fk.referenced_object_id = t.object_id
  )
  AND t.name NOT LIKE '%Componente%'
  AND t.name NOT LIKE '%Catalogo%';

/* Vista previa de impacto */
SELECT 'Eval360_NotaActividad' AS Tabla, COUNT(1) AS Registros
FROM dbo.Eval360_NotaActividad n
WHERE EXISTS (
  SELECT 1
  FROM dbo.Eval360_Actividad a
  WHERE a.ActividadId = n.ActividadId
    AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
)
UNION ALL
SELECT 'Eval360_SeguimientoIndicador', COUNT(1)
FROM dbo.Eval360_SeguimientoIndicador s
WHERE EXISTS (
  SELECT 1
  FROM dbo.Eval360_Actividad a
  WHERE a.ActividadId = s.ActividadId
    AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
)
UNION ALL
SELECT 'Eval360_ActividadIndicador', COUNT(1)
FROM dbo.Eval360_ActividadIndicador ai
WHERE EXISTS (
  SELECT 1
  FROM dbo.Eval360_Actividad a
  WHERE a.ActividadId = ai.ActividadId
    AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
)
UNION ALL
SELECT 'Eval360_IndicadorGrupo', COUNT(1)
FROM dbo.Eval360_IndicadorGrupo ig
WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = ig.EstructuraGrupoId)
UNION ALL
SELECT 'Eval360_Actividad', COUNT(1)
FROM dbo.Eval360_Actividad a
WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
UNION ALL
SELECT 'Eval360_NivelDesempenoGrupo', COUNT(1)
FROM dbo.Eval360_NivelDesempenoGrupo ng
WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = ng.EstructuraGrupoId)
UNION ALL
SELECT 'Eval360_EstructuraGrupoDetalle (solo inactivar)', COUNT(1)
FROM dbo.Eval360_EstructuraGrupoDetalle d
WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = d.EstructuraGrupoId)
UNION ALL
SELECT 'Eval360_EstructuraGrupo (solo inactivar)', COUNT(1)
FROM dbo.Eval360_EstructuraGrupo eg
WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = eg.EstructuraGrupoId)

UNION ALL
SELECT 'EvaluacionNota', COUNT(1)
FROM dbo.EvaluacionNota n
WHERE EXISTS (
  SELECT 1
  FROM dbo.EvaluacionActividad a
  INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
  WHERE a.EvaluacionActividadId = n.EvaluacionActividadId
    AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
)
UNION ALL
SELECT 'EvaluacionActividadIndicador', COUNT(1)
FROM dbo.EvaluacionActividadIndicador ai
WHERE EXISTS (
  SELECT 1
  FROM dbo.EvaluacionActividad a
  INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
  WHERE a.EvaluacionActividadId = ai.EvaluacionActividadId
    AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
)
UNION ALL
SELECT 'EvaluacionActividad', COUNT(1)
FROM dbo.EvaluacionActividad a
WHERE EXISTS (
  SELECT 1
  FROM dbo.EvaluacionComponente c
  WHERE c.EvaluacionComponenteId = a.EvaluacionComponenteId
    AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
)
UNION ALL
SELECT 'EvaluacionComponente', COUNT(1)
FROM dbo.EvaluacionComponente c
WHERE EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
UNION ALL
SELECT 'EvaluacionPlantilla', COUNT(1)
FROM dbo.EvaluacionPlantilla ep
WHERE EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = ep.EvaluacionPlantillaId)

UNION ALL
SELECT 'PlaneamientoIndicador', COUNT(1)
FROM dbo.PlaneamientoIndicador pi
WHERE EXISTS (SELECT 1 FROM #TargetPlaneamiento t WHERE t.PlaneamientoId = pi.PlaneamientoId)
UNION ALL
SELECT 'Planeamiento', COUNT(1)
FROM dbo.Planeamiento p
WHERE EXISTS (SELECT 1 FROM #TargetPlaneamiento t WHERE t.PlaneamientoId = p.PlaneamientoId)
UNION ALL
SELECT 'PlaneamientoIAGeneracion', COUNT(1)
FROM dbo.PlaneamientoIAGeneracion g
WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId)
UNION ALL
SELECT 'AsistenciaRegistro', COUNT(1)
FROM dbo.AsistenciaRegistro ar
INNER JOIN dbo.Grupo g ON g.GrupoId = ar.GrupoId
WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId)
  AND (@AnioLectivoId IS NULL OR ar.AnioLectivoId = @AnioLectivoId)
  AND (@PeriodoId IS NULL OR ar.PeriodoId = @PeriodoId)
UNION ALL
SELECT 'DetalleAsistencia', COUNT(1)
FROM dbo.DetalleAsistencia da
WHERE EXISTS (SELECT 1 FROM #TargetAsistenciaSesion t WHERE t.AsistenciaSesionId = da.AsistenciaSesionId)
UNION ALL
SELECT 'AsistenciaSesion', COUNT(1)
FROM dbo.AsistenciaSesion s
WHERE EXISTS (SELECT 1 FROM #TargetAsistenciaSesion t WHERE t.AsistenciaSesionId = s.AsistenciaSesionId)
UNION ALL
SELECT 'BoletaConductaEnvio', COUNT(1)
FROM dbo.BoletaConductaEnvio be
WHERE (@InstitucionId IS NULL OR be.InstitucionId = @InstitucionId)
UNION ALL
SELECT 'BoletaConducta (opcional)', CASE WHEN @LimpiarBoletas = 1 THEN COUNT(1) ELSE 0 END
FROM dbo.BoletaConducta b
WHERE (@InstitucionId IS NULL OR b.InstitucionId = @InstitucionId)
UNION ALL
SELECT 'UsuarioResetPasswordToken (opcional)', CASE WHEN @LimpiarTokens = 1 THEN COUNT(1) ELSE 0 END
FROM dbo.UsuarioResetPasswordToken;

SELECT
  'AuditTablesDetectadas' AS Tipo,
  atb.FullName,
  atb.HasInstitucionId
FROM #AuditTables atb
ORDER BY atb.FullName;

IF @DryRun = 1
BEGIN
  PRINT 'DryRun activo: no se borró ningún dato.';
  RETURN;
END;

BEGIN TRY
  BEGIN TRAN;

  /* 1) Eval360 */
  DELETE n
  FROM dbo.Eval360_NotaActividad n
  WHERE EXISTS (
    SELECT 1
    FROM dbo.Eval360_Actividad a
    WHERE a.ActividadId = n.ActividadId
      AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
  );

  DELETE s
  FROM dbo.Eval360_SeguimientoIndicador s
  WHERE EXISTS (
    SELECT 1
    FROM dbo.Eval360_Actividad a
    WHERE a.ActividadId = s.ActividadId
      AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
  );

  DELETE ai
  FROM dbo.Eval360_ActividadIndicador ai
  WHERE EXISTS (
    SELECT 1
    FROM dbo.Eval360_Actividad a
    WHERE a.ActividadId = ai.ActividadId
      AND EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId)
  );

  DELETE ig
  FROM dbo.Eval360_IndicadorGrupo ig
  WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = ig.EstructuraGrupoId);

  DELETE a
  FROM dbo.Eval360_Actividad a
  WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = a.EstructuraGrupoId);

  DELETE ng
  FROM dbo.Eval360_NivelDesempenoGrupo ng
  WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = ng.EstructuraGrupoId);

  UPDATE d
  SET Activo = 0
  FROM dbo.Eval360_EstructuraGrupoDetalle d
  WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = d.EstructuraGrupoId);

  UPDATE eg
  SET Activo = 0
  FROM dbo.Eval360_EstructuraGrupo eg
  WHERE EXISTS (SELECT 1 FROM #TargetEstructura t WHERE t.EstructuraGrupoId = eg.EstructuraGrupoId);

  /* 2) Evaluación académica */
  IF @LimpiarEvaluacion = 1
  BEGIN
    DELETE ai
    FROM dbo.EvaluacionActividadIndicador ai
    WHERE EXISTS (
      SELECT 1
      FROM dbo.EvaluacionActividad a
      INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
      WHERE a.EvaluacionActividadId = ai.EvaluacionActividadId
        AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
    );

    DELETE n
    FROM dbo.EvaluacionNota n
    WHERE EXISTS (
      SELECT 1
      FROM dbo.EvaluacionActividad a
      INNER JOIN dbo.EvaluacionComponente c ON c.EvaluacionComponenteId = a.EvaluacionComponenteId
      WHERE a.EvaluacionActividadId = n.EvaluacionActividadId
        AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
    );

    DELETE a
    FROM dbo.EvaluacionActividad a
    WHERE EXISTS (
      SELECT 1
      FROM dbo.EvaluacionComponente c
      WHERE c.EvaluacionComponenteId = a.EvaluacionComponenteId
        AND EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId)
    );

    DELETE c
    FROM dbo.EvaluacionComponente c
    WHERE EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = c.EvaluacionPlantillaId);

    DELETE ep
    FROM dbo.EvaluacionPlantilla ep
    WHERE EXISTS (SELECT 1 FROM #TargetEvaluacionPlantilla t WHERE t.EvaluacionPlantillaId = ep.EvaluacionPlantillaId);
  END;

  /* 3) Planeamientos */
  DELETE pi
  FROM dbo.PlaneamientoIndicador pi
  WHERE EXISTS (SELECT 1 FROM #TargetPlaneamiento t WHERE t.PlaneamientoId = pi.PlaneamientoId);

  DELETE p
  FROM dbo.Planeamiento p
  WHERE EXISTS (SELECT 1 FROM #TargetPlaneamiento t WHERE t.PlaneamientoId = p.PlaneamientoId);

  DELETE g
  FROM dbo.PlaneamientoIAGeneracion g
  WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId);

  /* 4) Asistencia */
  DELETE da
  FROM dbo.DetalleAsistencia da
  WHERE EXISTS (SELECT 1 FROM #TargetAsistenciaSesion t WHERE t.AsistenciaSesionId = da.AsistenciaSesionId);

  DELETE s
  FROM dbo.AsistenciaSesion s
  WHERE EXISTS (SELECT 1 FROM #TargetAsistenciaSesion t WHERE t.AsistenciaSesionId = s.AsistenciaSesionId);

  DELETE ar
  FROM dbo.AsistenciaRegistro ar
  INNER JOIN dbo.Grupo g ON g.GrupoId = ar.GrupoId
  WHERE (@InstitucionId IS NULL OR g.InstitucionId = @InstitucionId)
    AND (@AnioLectivoId IS NULL OR ar.AnioLectivoId = @AnioLectivoId)
    AND (@PeriodoId IS NULL OR ar.PeriodoId = @PeriodoId);

  /* 5) Alertas/log de correos a alumnos */
  DELETE be
  FROM dbo.BoletaConductaEnvio be
  WHERE (@InstitucionId IS NULL OR be.InstitucionId = @InstitucionId);

  /* 6) Opcional: boletas */
  IF @LimpiarBoletas = 1
  BEGIN
    DELETE b
    FROM dbo.BoletaConducta b
    WHERE (@InstitucionId IS NULL OR b.InstitucionId = @InstitucionId);
  END;

  /* 7) Opcional: tokens */
  IF @LimpiarTokens = 1
  BEGIN
    DELETE FROM dbo.UsuarioResetPasswordToken;
  END;

  /* 8) Opcional: tablas de auditoría/log detectadas */
  IF @LimpiarAuditoria = 1
  BEGIN
    DECLARE @sql NVARCHAR(MAX);
    DECLARE @fullName NVARCHAR(400);
    DECLARE @hasInst BIT;

    DECLARE curAudit CURSOR LOCAL FAST_FORWARD FOR
      SELECT FullName, HasInstitucionId
      FROM #AuditTables;

    OPEN curAudit;
    FETCH NEXT FROM curAudit INTO @fullName, @hasInst;

    WHILE @@FETCH_STATUS = 0
    BEGIN
      SET @sql = CASE
        WHEN @hasInst = 1 THEN N'DELETE FROM ' + @fullName + N' WHERE InstitucionId = @InstitucionId;'
        ELSE N'DELETE FROM ' + @fullName + N';'
      END;

      EXEC sp_executesql @sql, N'@InstitucionId INT', @InstitucionId = @InstitucionId;

      FETCH NEXT FROM curAudit INTO @fullName, @hasInst;
    END;

    CLOSE curAudit;
    DEALLOCATE curAudit;
  END;

  COMMIT;
  PRINT 'Limpieza completada correctamente.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;