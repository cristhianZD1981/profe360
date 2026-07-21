/*
  Copia planeamientos guardados en I Periodo hacia II Periodo para asignaciones
  activas del mismo docente, grupo, materia y anio lectivo.

  Tambien copia:
  - dbo.PlaneamientoIndicador
  - dbo.Eval360_IndicadorGrupo, solo cuando ya existe una estructura Eval360
    activa para el mismo grupo/materia/anio/periodo destino.

  Uso seguro:
  1. Ejecutar con @Aplicar = 0 para revisar el resumen. Hace ROLLBACK.
  2. Si el resumen es correcto, cambiar @Aplicar = 1 y ejecutar de nuevo.

  Filtros opcionales:
  - Dejar @CorreoDocente, @GrupoNombre o @MateriaNombre en NULL para aplicar a todos.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @AnioLectivoNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoOrigenNombre NVARCHAR(100) = N'I Periodo';
DECLARE @PeriodoDestinoNombre NVARCHAR(100) = N'II Periodo';

DECLARE @CorreoDocente NVARCHAR(320) = NULL;
DECLARE @GrupoNombre NVARCHAR(100) = NULL;
DECLARE @MateriaNombre NVARCHAR(250) = NULL;

IF OBJECT_ID('tempdb..#PlaneamientosMap') IS NOT NULL DROP TABLE #PlaneamientosMap;
IF OBJECT_ID('tempdb..#Candidatos') IS NOT NULL DROP TABLE #Candidatos;

CREATE TABLE #PlaneamientosMap (
  PlaneamientoOrigenId INT NOT NULL PRIMARY KEY,
  PlaneamientoDestinoId INT NOT NULL,
  Accion NVARCHAR(20) NOT NULL
);

BEGIN TRAN;

SELECT
  p.PlaneamientoId AS PlaneamientoOrigenId,
  ad.InstitucionId,
  ad.AnioLectivoId,
  ad.PeriodoId AS PeriodoDestinoId,
  ad.GrupoId,
  ad.MateriaId,
  ad.UsuarioId,
  p.Nombre,
  p.FechaInicio,
  p.FechaFin,
  p.Observaciones,
  p.ResultadoIAJson
INTO #Candidatos
FROM dbo.AsignacionDocente ad
INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
INNER JOIN dbo.Periodo pd ON pd.PeriodoId = ad.PeriodoId
INNER JOIN dbo.Periodo po ON po.Nombre = @PeriodoOrigenNombre
INNER JOIN dbo.Planeamiento p
  ON p.InstitucionId = ad.InstitucionId
 AND p.AnioLectivoId = ad.AnioLectivoId
 AND p.PeriodoId = po.PeriodoId
 AND p.GrupoId = ad.GrupoId
 AND p.MateriaId = ad.MateriaId
 AND p.UsuarioId = ad.UsuarioId
 AND p.Activo = 1
WHERE ad.Activo = 1
  AND al.Nombre = @AnioLectivoNombre
  AND pd.Nombre = @PeriodoDestinoNombre
  AND (@CorreoDocente IS NULL OR LOWER(u.Correo) = LOWER(@CorreoDocente))
  AND (@GrupoNombre IS NULL OR g.Nombre = @GrupoNombre)
  AND (@MateriaNombre IS NULL OR m.Nombre = @MateriaNombre);

INSERT INTO #PlaneamientosMap (PlaneamientoOrigenId, PlaneamientoDestinoId, Accion)
SELECT
  c.PlaneamientoOrigenId,
  d.PlaneamientoId,
  N'EXISTIA'
FROM #Candidatos c
INNER JOIN dbo.Planeamiento d
  ON d.InstitucionId = c.InstitucionId
 AND d.AnioLectivoId = c.AnioLectivoId
 AND d.PeriodoId = c.PeriodoDestinoId
 AND d.GrupoId = c.GrupoId
 AND d.MateriaId = c.MateriaId
 AND d.UsuarioId = c.UsuarioId
 AND d.Activo = 1
 AND UPPER(LTRIM(RTRIM(ISNULL(d.Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(c.Nombre, N''))))
 AND ISNULL(CONVERT(VARCHAR(10), d.FechaInicio, 23), '') = ISNULL(CONVERT(VARCHAR(10), c.FechaInicio, 23), '')
 AND ISNULL(CONVERT(VARCHAR(10), d.FechaFin, 23), '') = ISNULL(CONVERT(VARCHAR(10), c.FechaFin, 23), '');

MERGE dbo.Planeamiento AS destino
USING (
  SELECT c.*
  FROM #Candidatos c
  WHERE NOT EXISTS (
    SELECT 1
    FROM #PlaneamientosMap pm
    WHERE pm.PlaneamientoOrigenId = c.PlaneamientoOrigenId
  )
) AS origen
ON 1 = 0
WHEN NOT MATCHED THEN
  INSERT (
    InstitucionId,
    AnioLectivoId,
    PeriodoId,
    GrupoId,
    MateriaId,
    UsuarioId,
    Nombre,
    FechaInicio,
    FechaFin,
    Observaciones,
    ResultadoIAJson,
    Activo,
    CreatedAt
  )
  VALUES (
    origen.InstitucionId,
    origen.AnioLectivoId,
    origen.PeriodoDestinoId,
    origen.GrupoId,
    origen.MateriaId,
    origen.UsuarioId,
    origen.Nombre,
    origen.FechaInicio,
    origen.FechaFin,
    origen.Observaciones,
    origen.ResultadoIAJson,
    1,
    SYSDATETIME()
  )
OUTPUT origen.PlaneamientoOrigenId, INSERTED.PlaneamientoId, N'CREADO'
INTO #PlaneamientosMap (PlaneamientoOrigenId, PlaneamientoDestinoId, Accion);

INSERT INTO dbo.PlaneamientoIndicador (
  PlaneamientoId,
  Descripcion,
  NivelDesempenoId,
  Activo,
  CreatedAt
)
SELECT
  pm.PlaneamientoDestinoId,
  pi.Descripcion,
  pi.NivelDesempenoId,
  1,
  SYSDATETIME()
FROM #PlaneamientosMap pm
INNER JOIN dbo.PlaneamientoIndicador pi
  ON pi.PlaneamientoId = pm.PlaneamientoOrigenId
 AND pi.Activo = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.PlaneamientoIndicador pid
  WHERE pid.PlaneamientoId = pm.PlaneamientoDestinoId
    AND pid.Activo = 1
    AND UPPER(LTRIM(RTRIM(ISNULL(pid.Descripcion, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(pi.Descripcion, N''))))
    AND ISNULL(pid.NivelDesempenoId, 0) = ISNULL(pi.NivelDesempenoId, 0)
);

INSERT INTO dbo.Eval360_IndicadorGrupo (
  EstructuraGrupoId,
  PlaneamientoId,
  TipoUso,
  IndicadorBase,
  IndicadorAvanzado,
  IndicadorIntermedio,
  IndicadorInicial,
  Activo,
  CreatedAt
)
SELECT
  egDestino.EstructuraGrupoId,
  pm.PlaneamientoDestinoId,
  i.TipoUso,
  i.IndicadorBase,
  i.IndicadorAvanzado,
  i.IndicadorIntermedio,
  i.IndicadorInicial,
  1,
  SYSDATETIME()
FROM #PlaneamientosMap pm
INNER JOIN dbo.Eval360_IndicadorGrupo i
  ON i.PlaneamientoId = pm.PlaneamientoOrigenId
 AND i.Activo = 1
INNER JOIN dbo.Planeamiento destino
  ON destino.PlaneamientoId = pm.PlaneamientoDestinoId
CROSS APPLY (
  SELECT TOP 1 eg.EstructuraGrupoId
  FROM dbo.Eval360_EstructuraGrupo eg
  WHERE eg.InstitucionId = destino.InstitucionId
    AND eg.AnioLectivoId = destino.AnioLectivoId
    AND eg.PeriodoId = destino.PeriodoId
    AND eg.GrupoId = destino.GrupoId
    AND eg.MateriaId = destino.MateriaId
    AND eg.Activo = 1
  ORDER BY eg.EstructuraGrupoId DESC
) egDestino
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.Eval360_IndicadorGrupo id
  WHERE id.EstructuraGrupoId = egDestino.EstructuraGrupoId
    AND id.PlaneamientoId = pm.PlaneamientoDestinoId
    AND id.Activo = 1
    AND ISNULL(id.TipoUso, N'') = ISNULL(i.TipoUso, N'')
    AND UPPER(LTRIM(RTRIM(ISNULL(id.IndicadorBase, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(i.IndicadorBase, N''))))
);

SELECT Accion, COUNT(*) AS TotalPlaneamientos
FROM #PlaneamientosMap
GROUP BY Accion
ORDER BY Accion;

SELECT TOP 100
  u.Correo,
  g.Nombre AS Grupo,
  m.Nombre AS Materia,
  po.Nombre AS PeriodoOrigen,
  pd.Nombre AS PeriodoDestino,
  pm.Accion,
  origen.Nombre AS Planeamiento
FROM #PlaneamientosMap pm
INNER JOIN dbo.Planeamiento origen ON origen.PlaneamientoId = pm.PlaneamientoOrigenId
INNER JOIN dbo.Planeamiento destino ON destino.PlaneamientoId = pm.PlaneamientoDestinoId
INNER JOIN dbo.Usuario u ON u.UsuarioId = destino.UsuarioId
INNER JOIN dbo.Grupo g ON g.GrupoId = destino.GrupoId
INNER JOIN dbo.Materia m ON m.MateriaId = destino.MateriaId
INNER JOIN dbo.Periodo po ON po.PeriodoId = origen.PeriodoId
INNER JOIN dbo.Periodo pd ON pd.PeriodoId = destino.PeriodoId
ORDER BY u.Correo, g.Nombre, m.Nombre, origen.PlaneamientoId;

SELECT
  u.Correo,
  g.Nombre AS Grupo,
  m.Nombre AS Materia,
  COUNT(DISTINCT i.IndicadorGrupoId) AS IndicadoresEval360SinCopiar,
  N'No existe estructura Eval360 activa en el periodo destino' AS Motivo
FROM #PlaneamientosMap pm
INNER JOIN dbo.Eval360_IndicadorGrupo i
  ON i.PlaneamientoId = pm.PlaneamientoOrigenId
 AND i.Activo = 1
INNER JOIN dbo.Planeamiento destino
  ON destino.PlaneamientoId = pm.PlaneamientoDestinoId
INNER JOIN dbo.Usuario u ON u.UsuarioId = destino.UsuarioId
INNER JOIN dbo.Grupo g ON g.GrupoId = destino.GrupoId
INNER JOIN dbo.Materia m ON m.MateriaId = destino.MateriaId
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.Eval360_EstructuraGrupo eg
  WHERE eg.InstitucionId = destino.InstitucionId
    AND eg.AnioLectivoId = destino.AnioLectivoId
    AND eg.PeriodoId = destino.PeriodoId
    AND eg.GrupoId = destino.GrupoId
    AND eg.MateriaId = destino.MateriaId
    AND eg.Activo = 1
)
GROUP BY u.Correo, g.Nombre, m.Nombre
ORDER BY u.Correo, g.Nombre, m.Nombre;

IF @Aplicar = 1
BEGIN
  COMMIT;
  PRINT 'Cambios aplicados.';
END
ELSE
BEGIN
  ROLLBACK;
  PRINT 'Modo prueba: cambios revertidos. Cambia @Aplicar a 1 para aplicar.';
END
