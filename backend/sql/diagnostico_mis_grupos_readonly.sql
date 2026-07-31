/*
  PROFE360 - Diagnostico de gestion/mis-grupos

  SOLO LECTURA:
  - No ejecuta la consulta lenta.
  - No crea ni modifica indices.
  - No actualiza estadisticas.
  - No modifica datos.

  Ejecutar en la misma base de datos usada por la prueba local, despues de
  reproducir una carga lenta. Cada bloque devuelve un conjunto de resultados.
*/

SET NOCOUNT ON;

SELECT
  DB_NAME() AS BaseDatos,
  SUSER_SNAME() AS LoginActual,
  USER_NAME() AS UsuarioActual,
  SYSDATETIME() AS FechaDiagnostico;

/* 1. Volumen aproximado de las tablas involucradas. */
BEGIN TRY
  SELECT
    s.name AS Esquema,
    t.name AS Tabla,
    SUM(CASE WHEN p.index_id IN (0, 1) THEN p.row_count ELSE 0 END) AS Filas
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  LEFT JOIN sys.dm_db_partition_stats p ON p.object_id = t.object_id
  WHERE s.name = N'dbo'
    AND t.name IN (
      N'AsignacionDocente',
      N'Matricula',
      N'EvaluacionPlantilla',
      N'Eval360_EstructuraGrupo',
      N'Eval360_Actividad',
      N'Eval360_NotaActividad',
      N'Eval360_SeguimientoIndicador',
      N'AsistenciaRegistro',
      N'CierreAcademicoCurso',
      N'GrupoClase',
      N'GrupoClaseDocente',
      N'GrupoClaseSeccion',
      N'GrupoClaseEstudiante'
    )
  GROUP BY s.name, t.name
  ORDER BY Filas DESC, t.name;
END TRY
BEGIN CATCH
  SELECT
    N'No se pudieron consultar los tamanos de tabla. Puede faltar VIEW DATABASE STATE/VIEW DATABASE PERFORMANCE STATE.' AS Aviso,
    ERROR_MESSAGE() AS Detalle;
END CATCH;

/* 2. Confirma los indices que ya contempla el repositorio. */
DECLARE @IndicesEsperados TABLE (
  Tabla sysname NOT NULL,
  Indice sysname NOT NULL
);

INSERT INTO @IndicesEsperados (Tabla, Indice)
VALUES
  (N'AsignacionDocente', N'IX_AsignacionDocente_BusquedaGestion'),
  (N'Matricula', N'IX_Matricula_GrupoAnioEstado'),
  (N'EvaluacionPlantilla', N'IX_EvaluacionPlantilla_BaseGrupo'),
  (N'Eval360_EstructuraGrupo', N'IX_Eval360_EstructuraGrupo_Lookup'),
  (N'Eval360_Actividad', N'IX_Eval360_Actividad_Estructura'),
  (N'Eval360_NotaActividad', N'IX_Eval360_NotaActividad_Actividad'),
  (N'Eval360_SeguimientoIndicador', N'IX_Eval360_SeguimientoIndicador_Actividad'),
  (N'AsistenciaRegistro', N'IX_AsistenciaRegistro_GrupoMateriaPeriodo'),
  (N'CierreAcademicoCurso', N'UX_CierreAcademicoCurso_Activo'),
  (N'GrupoClase', N'IX_GrupoClase_Busqueda'),
  (N'GrupoClaseDocente', N'UX_GrupoClaseDocente_Activo'),
  (N'GrupoClaseSeccion', N'UX_GrupoClaseSeccion_Activa'),
  (N'GrupoClaseEstudiante', N'UX_GrupoClaseEstudiante_Activo');

SELECT
  e.Tabla,
  e.Indice,
  CASE
    WHEN t.object_id IS NULL THEN N'TABLA_AUSENTE'
    WHEN i.index_id IS NULL THEN N'FALTA'
    WHEN i.is_disabled = 1 THEN N'DESHABILITADO'
    ELSE N'OK'
  END AS Estado
FROM @IndicesEsperados e
LEFT JOIN sys.tables t
  ON t.name = e.Tabla
 AND t.schema_id = SCHEMA_ID(N'dbo')
LEFT JOIN sys.indexes i
  ON i.object_id = t.object_id
 AND i.name = e.Indice
ORDER BY
  CASE
    WHEN t.object_id IS NULL THEN 0
    WHEN i.index_id IS NULL THEN 1
    WHEN i.is_disabled = 1 THEN 2
    ELSE 3
  END,
  e.Tabla,
  e.Indice;

/* 3. Definicion real de todos los indices de las tablas criticas. */
SELECT
  t.name AS Tabla,
  i.name AS Indice,
  i.type_desc AS Tipo,
  i.is_unique AS EsUnico,
  i.is_disabled AS Deshabilitado,
  i.has_filter AS TieneFiltro,
  i.filter_definition AS Filtro,
  STUFF((
    SELECT
      N', ' + QUOTENAME(c.name)
      + CASE WHEN ic2.is_descending_key = 1 THEN N' DESC' ELSE N'' END
    FROM sys.index_columns ic2
    INNER JOIN sys.columns c
      ON c.object_id = ic2.object_id
     AND c.column_id = ic2.column_id
    WHERE ic2.object_id = i.object_id
      AND ic2.index_id = i.index_id
      AND ic2.is_included_column = 0
      AND ic2.key_ordinal > 0
    ORDER BY ic2.key_ordinal
    FOR XML PATH(N''), TYPE
  ).value(N'.', N'nvarchar(max)'), 1, 2, N'') AS ColumnasClave,
  STUFF((
    SELECT N', ' + QUOTENAME(c.name)
    FROM sys.index_columns ic2
    INNER JOIN sys.columns c
      ON c.object_id = ic2.object_id
     AND c.column_id = ic2.column_id
    WHERE ic2.object_id = i.object_id
      AND ic2.index_id = i.index_id
      AND ic2.is_included_column = 1
    ORDER BY ic2.index_column_id
    FOR XML PATH(N''), TYPE
  ).value(N'.', N'nvarchar(max)'), 1, 2, N'') AS ColumnasIncluidas
FROM sys.tables t
INNER JOIN sys.indexes i
  ON i.object_id = t.object_id
 AND i.index_id > 0
WHERE t.schema_id = SCHEMA_ID(N'dbo')
  AND t.name IN (
    N'AsignacionDocente',
    N'Matricula',
    N'EvaluacionPlantilla',
    N'Eval360_EstructuraGrupo',
    N'Eval360_Actividad',
    N'Eval360_NotaActividad',
    N'Eval360_SeguimientoIndicador',
    N'AsistenciaRegistro',
    N'CierreAcademicoCurso'
  )
ORDER BY t.name, i.index_id;

/* 4. Antiguedad y cambios pendientes de las estadisticas de esos indices. */
BEGIN TRY
  SELECT
    OBJECT_NAME(i.object_id) AS Tabla,
    i.name AS Indice,
    sp.last_updated AS EstadisticaActualizada,
    sp.rows AS FilasAlActualizar,
    sp.modification_counter AS CambiosDesdeActualizacion
  FROM sys.indexes i
  OUTER APPLY sys.dm_db_stats_properties(i.object_id, i.index_id) sp
  WHERE i.object_id IN (
      OBJECT_ID(N'dbo.AsignacionDocente'),
      OBJECT_ID(N'dbo.Matricula'),
      OBJECT_ID(N'dbo.EvaluacionPlantilla'),
      OBJECT_ID(N'dbo.Eval360_EstructuraGrupo'),
      OBJECT_ID(N'dbo.Eval360_Actividad'),
      OBJECT_ID(N'dbo.Eval360_NotaActividad'),
      OBJECT_ID(N'dbo.Eval360_SeguimientoIndicador'),
      OBJECT_ID(N'dbo.AsistenciaRegistro'),
      OBJECT_ID(N'dbo.CierreAcademicoCurso')
    )
    AND i.index_id > 0
  ORDER BY
    CASE WHEN sp.last_updated IS NULL THEN 0 ELSE 1 END,
    sp.modification_counter DESC,
    Tabla,
    Indice;
END TRY
BEGIN CATCH
  SELECT
    N'No se pudo consultar la antiguedad de estadisticas con este usuario.' AS Aviso,
    ERROR_MESSAGE() AS Detalle;
END CATCH;

/*
  5. Busca la consulta de mis-grupos en la cache del motor.
  La columna PlanEjecucion es XML: abrirla en SSMS y guardar el plan si aparece.
*/
BEGIN TRY
  SELECT TOP (10)
    qs.last_execution_time AS UltimaEjecucion,
    qs.execution_count AS EjecucionesEnCache,
    CAST(qs.last_elapsed_time / 1000.0 AS decimal(18, 2)) AS UltimaDuracionMs,
    CAST(qs.total_elapsed_time / NULLIF(qs.execution_count, 0) / 1000.0 AS decimal(18, 2)) AS PromedioDuracionMs,
    qs.last_logical_reads AS UltimasLecturasLogicas,
    qs.last_physical_reads AS UltimasLecturasFisicas,
    qs.last_rows AS UltimasFilas,
    qp.query_plan AS PlanEjecucion,
    st.text AS TextoConsulta
  FROM sys.dm_exec_query_stats qs
  CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
  OUTER APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
  WHERE st.text LIKE N'%FROM dbo.AsignacionDocente ad%'
    AND st.text LIKE N'%Eval360_SeguimientoIndicador%'
    AND st.text LIKE N'%CierreAcademicoCurso c%'
    AND st.text NOT LIKE N'%DECLARE @IndicesEsperados TABLE%'
    AND st.text NOT LIKE N'%sys.dm_exec_query_stats qs%'
    AND (
      st.text LIKE N'%AsignacionesBase AS (%'
      OR st.text LIKE N'%OUTER APPLY (%'
    )
  ORDER BY qs.last_execution_time DESC;
END TRY
BEGIN CATCH
  SELECT
    N'No se pudo consultar el plan en cache. Puede faltar VIEW SERVER STATE/VIEW SERVER PERFORMANCE STATE.' AS Aviso,
    ERROR_MESSAGE() AS Detalle;
END CATCH;
