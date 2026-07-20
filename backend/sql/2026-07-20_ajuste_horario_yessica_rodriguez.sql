/*
  Ajuste horario docente:
  Profa. Rodriguez Espinoza Yessica
  Correo: yessica.rodríguez.espinoza@mep.go.cr
  Referencia: Horario #3 2026

  Notas:
  - SQL Server.
  - Este ajuste se aplica al II Periodo del anio lectivo 2026.
  - Los bloques de 12-1/12-2 se registran como dos secciones separadas,
    porque no existe un grupo combinado 12-1/12-2 en la BD.
*/

SET XACT_ABORT ON;
BEGIN TRAN;

DECLARE @Correo NVARCHAR(150) = N'yessica.rodríguez.espinoza@mep.go.cr';
DECLARE @InstitucionId INT = 1;
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';

DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;

SELECT TOP 1
  @UsuarioId = UsuarioId
FROM dbo.Usuario
WHERE InstitucionId = @InstitucionId
  AND LOWER(Correo) = LOWER(@Correo)
  AND Activo = 1;

SELECT TOP 1
  @AnioLectivoId = AnioLectivoId
FROM dbo.AnioLectivo
WHERE InstitucionId = @InstitucionId
  AND Nombre = @AnioNombre;

SELECT TOP 1
  @PeriodoId = PeriodoId
FROM dbo.Periodo
WHERE AnioLectivoId = @AnioLectivoId
  AND Nombre = @PeriodoNombre;

IF @UsuarioId IS NULL
  THROW 51000, 'No se encontro la docente activa con el correo indicado.', 1;

IF @AnioLectivoId IS NULL
  THROW 51001, 'No se encontro el anio lectivo 2026 para la institucion.', 1;

IF @PeriodoId IS NULL
  THROW 51002, 'No se encontro II Periodo para el anio lectivo 2026.', 1;

DECLARE @Asignaciones TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL
);

INSERT INTO @Asignaciones (GrupoNombre, MateriaCodigo)
VALUES
  (N'10-5', N'GeOp'), -- Gestion operaciones alimentos y bebidas para emprendimiento de turismo rural
  (N'11-3', N'GeAB'), -- Gestion alimentos y bebidas
  (N'12-3', N'OrGr'), -- Organizacion Grupos
  (N'12-1', N'PrRu'), -- Proyectos Rurales
  (N'12-2', N'PrRu'), -- Proyectos Rurales
  (N'12-1', N'OrGr'), -- Organizacion Grupos
  (N'12-2', N'OrGr'), -- Organizacion Grupos
  (N'12-1', N'InCT'), -- Ingles para la conversacion de Turismo
  (N'12-2', N'InCT'); -- Ingles para la conversacion de Turismo

IF EXISTS (
  SELECT 1
  FROM @Asignaciones a
  LEFT JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = a.GrupoNombre
   AND g.Activo = 1
  LEFT JOIN dbo.Materia m
    ON m.InstitucionId = @InstitucionId
   AND m.Codigo = a.MateriaCodigo
   AND m.Activa = 1
  WHERE g.GrupoId IS NULL
     OR m.MateriaId IS NULL
)
BEGIN
  SELECT
    a.GrupoNombre,
    a.MateriaCodigo,
    CASE WHEN g.GrupoId IS NULL THEN 1 ELSE 0 END AS FaltaGrupo,
    CASE WHEN m.MateriaId IS NULL THEN 1 ELSE 0 END AS FaltaMateria
  FROM @Asignaciones a
  LEFT JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = a.GrupoNombre
   AND g.Activo = 1
  LEFT JOIN dbo.Materia m
    ON m.InstitucionId = @InstitucionId
   AND m.Codigo = a.MateriaCodigo
   AND m.Activa = 1
  WHERE g.GrupoId IS NULL
     OR m.MateriaId IS NULL;

  THROW 51003, 'Hay grupos o materias que no existen. Revise el resultado anterior.', 1;
END;

/* Asegura GrupoMateria para el II Periodo. */
UPDATE gm
SET
  Activo = 1,
  UpdatedAt = SYSDATETIME()
FROM dbo.GrupoMateria gm
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE gm.PeriodoId = @PeriodoId
  AND gm.Activo = 0;

INSERT INTO dbo.GrupoMateria (GrupoId, MateriaId, PeriodoId, Activo, CreatedAt)
SELECT
  g.GrupoId,
  m.MateriaId,
  @PeriodoId,
  1,
  SYSDATETIME()
FROM @Asignaciones a
INNER JOIN dbo.Grupo g
  ON g.InstitucionId = @InstitucionId
 AND g.AnioLectivoId = @AnioLectivoId
 AND g.Nombre = a.GrupoNombre
 AND g.Activo = 1
INNER JOIN dbo.Materia m
  ON m.InstitucionId = @InstitucionId
 AND m.Codigo = a.MateriaCodigo
 AND m.Activa = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.GrupoMateria gm
  WHERE gm.GrupoId = g.GrupoId
    AND gm.MateriaId = m.MateriaId
    AND ISNULL(gm.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
);

/* Si por cargas previas quedaron GrupoMateria duplicados en II Periodo, deja uno activo. */
;WITH GrupoMateriaDuplicado AS (
  SELECT
    gm.GrupoMateriaId,
    ROW_NUMBER() OVER (
      PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
      ORDER BY gm.GrupoMateriaId ASC
    ) AS rn
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m
    ON m.MateriaId = gm.MateriaId
  INNER JOIN @Asignaciones a
    ON a.GrupoNombre = g.Nombre
   AND a.MateriaCodigo = m.Codigo
  WHERE gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
)
UPDATE hg
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.HorarioGrupo hg
INNER JOIN GrupoMateriaDuplicado d
  ON d.GrupoMateriaId = hg.GrupoMateriaId
WHERE d.rn > 1
  AND hg.Activo = 1;

;WITH GrupoMateriaDuplicado AS (
  SELECT
    gm.GrupoMateriaId,
    ROW_NUMBER() OVER (
      PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
      ORDER BY gm.GrupoMateriaId ASC
    ) AS rn
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m
    ON m.MateriaId = gm.MateriaId
  INNER JOIN @Asignaciones a
    ON a.GrupoNombre = g.Nombre
   AND a.MateriaCodigo = m.Codigo
  WHERE gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
)
UPDATE gm
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.GrupoMateria gm
INNER JOIN GrupoMateriaDuplicado d
  ON d.GrupoMateriaId = gm.GrupoMateriaId
WHERE d.rn > 1;

/* Desactiva asignaciones activas de esas mismas combinaciones fuera del II Periodo. */
UPDATE ad
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.AsignacionDocente ad
INNER JOIN dbo.Grupo g
  ON g.GrupoId = ad.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = ad.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE ad.InstitucionId = @InstitucionId
  AND ad.UsuarioId = @UsuarioId
  AND ad.AnioLectivoId = @AnioLectivoId
  AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  AND ad.Activo = 1
  AND ISNULL(ad.PeriodoId, 0) <> ISNULL(@PeriodoId, 0);

/*
  Limpieza de duplicados entre periodos:
  Gestion del Profe arma el horario desde GrupoMateria + HorarioGrupo.
  Si queda activo el mismo GrupoMateria en I Periodo y II Periodo, el horario
  se pinta dos veces aunque la asignacion docente este filtrada al II Periodo.

  Por integridad historica no se borran filas fisicamente; se desactivan.
*/
UPDATE hg
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.HorarioGrupo hg
INNER JOIN dbo.GrupoMateria gm
  ON gm.GrupoMateriaId = hg.GrupoMateriaId
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE hg.Activo = 1
  AND ISNULL(gm.PeriodoId, 0) <> ISNULL(@PeriodoId, 0);

UPDATE gm
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.GrupoMateria gm
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE gm.Activo = 1
  AND ISNULL(gm.PeriodoId, 0) <> ISNULL(@PeriodoId, 0);

/* Crea o reactiva las asignaciones de Yessica para II Periodo. */
UPDATE ad
SET
  Activo = 1,
  UpdatedAt = SYSDATETIME()
FROM dbo.AsignacionDocente ad
INNER JOIN dbo.Grupo g
  ON g.GrupoId = ad.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = ad.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE ad.InstitucionId = @InstitucionId
  AND ad.UsuarioId = @UsuarioId
  AND ad.AnioLectivoId = @AnioLectivoId
  AND ISNULL(ad.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
  AND ad.TipoAsignacion = N'PROFESOR_MATERIA';

INSERT INTO dbo.AsignacionDocente (
  InstitucionId,
  UsuarioId,
  GrupoId,
  MateriaId,
  AnioLectivoId,
  PeriodoId,
  TipoAsignacion,
  Activo,
  CreatedAt
)
SELECT
  @InstitucionId,
  @UsuarioId,
  g.GrupoId,
  m.MateriaId,
  @AnioLectivoId,
  @PeriodoId,
  N'PROFESOR_MATERIA',
  1,
  SYSDATETIME()
FROM @Asignaciones a
INNER JOIN dbo.Grupo g
  ON g.InstitucionId = @InstitucionId
 AND g.AnioLectivoId = @AnioLectivoId
 AND g.Nombre = a.GrupoNombre
 AND g.Activo = 1
INNER JOIN dbo.Materia m
  ON m.InstitucionId = @InstitucionId
 AND m.Codigo = a.MateriaCodigo
 AND m.Activa = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.GrupoId = g.GrupoId
    AND ad.MateriaId = m.MateriaId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ISNULL(ad.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
);

DECLARE @HorarioCorrecto TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL
);

/*
  DiaSemana en SQL Server/app:
  2=Lunes, 3=Martes, 4=Miercoles, 5=Jueves, 6=Viernes

  Bloques:
  0 Primera, 1 Segunda, 2 Tercera,
  13 Cuarta, 14 Quinta, 15 Sexta,
  17 Septima, 18 Octava, 19 Novena,
  21 Decima, 22 Undecima, 23 Duodecima/Duedecima
*/

INSERT INTO @HorarioCorrecto (GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  -- 10-5 Gestion operaciones: lunes 1-6 y viernes 7-12
  (N'10-5', N'GeOp', 2, 0),  (N'10-5', N'GeOp', 2, 1),  (N'10-5', N'GeOp', 2, 2),
  (N'10-5', N'GeOp', 2, 13), (N'10-5', N'GeOp', 2, 14), (N'10-5', N'GeOp', 2, 15),
  (N'10-5', N'GeOp', 6, 17), (N'10-5', N'GeOp', 6, 18), (N'10-5', N'GeOp', 6, 19),
  (N'10-5', N'GeOp', 6, 21), (N'10-5', N'GeOp', 6, 22), (N'10-5', N'GeOp', 6, 23),

  -- 12-3 Organizacion Grupos: lunes 7-12 y martes 1-6
  (N'12-3', N'OrGr', 2, 17), (N'12-3', N'OrGr', 2, 18), (N'12-3', N'OrGr', 2, 19),
  (N'12-3', N'OrGr', 2, 21), (N'12-3', N'OrGr', 2, 22), (N'12-3', N'OrGr', 2, 23),
  (N'12-3', N'OrGr', 3, 0),  (N'12-3', N'OrGr', 3, 1),  (N'12-3', N'OrGr', 3, 2),
  (N'12-3', N'OrGr', 3, 13), (N'12-3', N'OrGr', 3, 14), (N'12-3', N'OrGr', 3, 15),

  -- 12-1/12-2 Proyectos Rurales: martes 7-12 y miercoles 1-6
  (N'12-1', N'PrRu', 3, 17), (N'12-1', N'PrRu', 3, 18), (N'12-1', N'PrRu', 3, 19),
  (N'12-1', N'PrRu', 3, 21), (N'12-1', N'PrRu', 3, 22), (N'12-1', N'PrRu', 3, 23),
  (N'12-1', N'PrRu', 4, 0),  (N'12-1', N'PrRu', 4, 1),  (N'12-1', N'PrRu', 4, 2),
  (N'12-1', N'PrRu', 4, 13), (N'12-1', N'PrRu', 4, 14), (N'12-1', N'PrRu', 4, 15),
  (N'12-2', N'PrRu', 3, 17), (N'12-2', N'PrRu', 3, 18), (N'12-2', N'PrRu', 3, 19),
  (N'12-2', N'PrRu', 3, 21), (N'12-2', N'PrRu', 3, 22), (N'12-2', N'PrRu', 3, 23),
  (N'12-2', N'PrRu', 4, 0),  (N'12-2', N'PrRu', 4, 1),  (N'12-2', N'PrRu', 4, 2),
  (N'12-2', N'PrRu', 4, 13), (N'12-2', N'PrRu', 4, 14), (N'12-2', N'PrRu', 4, 15),

  -- 11-3 Gestion alimentos y bebidas: miercoles 7-12 y jueves 1-6
  (N'11-3', N'GeAB', 4, 17), (N'11-3', N'GeAB', 4, 18), (N'11-3', N'GeAB', 4, 19),
  (N'11-3', N'GeAB', 4, 21), (N'11-3', N'GeAB', 4, 22), (N'11-3', N'GeAB', 4, 23),
  (N'11-3', N'GeAB', 5, 0),  (N'11-3', N'GeAB', 5, 1),  (N'11-3', N'GeAB', 5, 2),
  (N'11-3', N'GeAB', 5, 13), (N'11-3', N'GeAB', 5, 14), (N'11-3', N'GeAB', 5, 15),

  -- 12-1/12-2 Organizacion Grupos: jueves 7-12
  (N'12-1', N'OrGr', 5, 17), (N'12-1', N'OrGr', 5, 18), (N'12-1', N'OrGr', 5, 19),
  (N'12-1', N'OrGr', 5, 21), (N'12-1', N'OrGr', 5, 22), (N'12-1', N'OrGr', 5, 23),
  (N'12-2', N'OrGr', 5, 17), (N'12-2', N'OrGr', 5, 18), (N'12-2', N'OrGr', 5, 19),
  (N'12-2', N'OrGr', 5, 21), (N'12-2', N'OrGr', 5, 22), (N'12-2', N'OrGr', 5, 23),

  -- 12-1/12-2 Ingles para la conversacion de Turismo: viernes 1-6
  (N'12-1', N'InCT', 6, 0),  (N'12-1', N'InCT', 6, 1),  (N'12-1', N'InCT', 6, 2),
  (N'12-1', N'InCT', 6, 13), (N'12-1', N'InCT', 6, 14), (N'12-1', N'InCT', 6, 15),
  (N'12-2', N'InCT', 6, 0),  (N'12-2', N'InCT', 6, 1),  (N'12-2', N'InCT', 6, 2),
  (N'12-2', N'InCT', 6, 13), (N'12-2', N'InCT', 6, 14), (N'12-2', N'InCT', 6, 15);

IF EXISTS (
  SELECT 1
  FROM @HorarioCorrecto hc
  LEFT JOIN dbo.BloqueHorario bh
    ON bh.BloqueHorarioId = hc.BloqueHorarioId
   AND bh.InstitucionId = @InstitucionId
  WHERE bh.BloqueHorarioId IS NULL
)
BEGIN
  SELECT DISTINCT hc.BloqueHorarioId
  FROM @HorarioCorrecto hc
  LEFT JOIN dbo.BloqueHorario bh
    ON bh.BloqueHorarioId = hc.BloqueHorarioId
   AND bh.InstitucionId = @InstitucionId
  WHERE bh.BloqueHorarioId IS NULL;

  THROW 51004, 'Hay bloques horarios inexistentes. Revise el resultado anterior.', 1;
END;

/* Desactiva bloques sobrantes de estas combinaciones en II Periodo. */
UPDATE hg
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.HorarioGrupo hg
INNER JOIN dbo.GrupoMateria gm
  ON gm.GrupoMateriaId = hg.GrupoMateriaId
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
INNER JOIN @Asignaciones a
  ON a.GrupoNombre = g.Nombre
 AND a.MateriaCodigo = m.Codigo
WHERE gm.PeriodoId = @PeriodoId
  AND hg.Activo = 1
  AND NOT EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    WHERE hc.GrupoNombre = g.Nombre
      AND hc.MateriaCodigo = m.Codigo
      AND hc.DiaSemana = hg.DiaSemana
      AND hc.BloqueHorarioId = hg.BloqueHorarioId
  );

/* Reactiva horarios correctos si ya existian inactivos. */
UPDATE hg
SET
  Activo = 1,
  UpdatedAt = SYSDATETIME()
FROM dbo.HorarioGrupo hg
INNER JOIN dbo.GrupoMateria gm
  ON gm.GrupoMateriaId = hg.GrupoMateriaId
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
INNER JOIN @HorarioCorrecto hc
  ON hc.GrupoNombre = g.Nombre
 AND hc.MateriaCodigo = m.Codigo
 AND hc.DiaSemana = hg.DiaSemana
 AND hc.BloqueHorarioId = hg.BloqueHorarioId
WHERE gm.PeriodoId = @PeriodoId
  AND hg.Activo = 0;

/* Inserta horarios correctos faltantes. */
INSERT INTO dbo.HorarioGrupo (GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt)
SELECT
  gm.GrupoMateriaId,
  hc.BloqueHorarioId,
  hc.DiaSemana,
  1,
  SYSDATETIME()
FROM @HorarioCorrecto hc
INNER JOIN dbo.Grupo g
  ON g.InstitucionId = @InstitucionId
 AND g.AnioLectivoId = @AnioLectivoId
 AND g.Nombre = hc.GrupoNombre
INNER JOIN dbo.Materia m
  ON m.InstitucionId = @InstitucionId
 AND m.Codigo = hc.MateriaCodigo
INNER JOIN dbo.GrupoMateria gm
  ON gm.GrupoId = g.GrupoId
 AND gm.MateriaId = m.MateriaId
 AND gm.PeriodoId = @PeriodoId
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.HorarioGrupo hg
  WHERE hg.GrupoMateriaId = gm.GrupoMateriaId
    AND hg.BloqueHorarioId = hc.BloqueHorarioId
    AND hg.DiaSemana = hc.DiaSemana
);

/* Si quedaron HorarioGrupo duplicados activos para el mismo bloque, deja uno activo. */
;WITH HorarioDuplicado AS (
  SELECT
    hg.HorarioGrupoId,
    ROW_NUMBER() OVER (
      PARTITION BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
      ORDER BY hg.HorarioGrupoId ASC
    ) AS rn
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m
    ON m.MateriaId = gm.MateriaId
  INNER JOIN @Asignaciones a
    ON a.GrupoNombre = g.Nombre
   AND a.MateriaCodigo = m.Codigo
  WHERE gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1
)
UPDATE hg
SET
  Activo = 0,
  UpdatedAt = SYSDATETIME()
FROM dbo.HorarioGrupo hg
INNER JOIN HorarioDuplicado d
  ON d.HorarioGrupoId = hg.HorarioGrupoId
WHERE d.rn > 1;

/* Resumen de verificacion antes del COMMIT. */
SELECT
  'Asignaciones activas Yessica II Periodo' AS Verificacion,
  g.Nombre AS Grupo,
  m.Codigo AS MateriaCodigo,
  m.Nombre AS Materia,
  ad.PeriodoId,
  ad.Activo
FROM dbo.AsignacionDocente ad
INNER JOIN dbo.Grupo g
  ON g.GrupoId = ad.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = ad.MateriaId
WHERE ad.InstitucionId = @InstitucionId
  AND ad.UsuarioId = @UsuarioId
  AND ad.AnioLectivoId = @AnioLectivoId
  AND ad.PeriodoId = @PeriodoId
  AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  AND ad.Activo = 1
ORDER BY g.Nombre, m.Codigo;

SELECT
  CASE hg.DiaSemana
    WHEN 2 THEN N'Lunes'
    WHEN 3 THEN N'Martes'
    WHEN 4 THEN N'Miercoles'
    WHEN 5 THEN N'Jueves'
    WHEN 6 THEN N'Viernes'
    ELSE CONCAT(N'Dia ', hg.DiaSemana)
  END AS Dia,
  bh.OrdenVisual,
  bh.Nombre AS Bloque,
  CONVERT(VARCHAR(5), bh.HoraInicio, 108) AS HoraInicio,
  CONVERT(VARCHAR(5), bh.HoraFin, 108) AS HoraFin,
  g.Nombre AS Grupo,
  m.Codigo AS MateriaCodigo,
  m.Nombre AS Materia
FROM dbo.AsignacionDocente ad
INNER JOIN dbo.GrupoMateria gm
  ON gm.GrupoId = ad.GrupoId
 AND gm.MateriaId = ad.MateriaId
 AND gm.PeriodoId = ad.PeriodoId
INNER JOIN dbo.HorarioGrupo hg
  ON hg.GrupoMateriaId = gm.GrupoMateriaId
 AND hg.Activo = 1
INNER JOIN dbo.BloqueHorario bh
  ON bh.BloqueHorarioId = hg.BloqueHorarioId
INNER JOIN dbo.Grupo g
  ON g.GrupoId = gm.GrupoId
INNER JOIN dbo.Materia m
  ON m.MateriaId = gm.MateriaId
WHERE ad.InstitucionId = @InstitucionId
  AND ad.UsuarioId = @UsuarioId
  AND ad.AnioLectivoId = @AnioLectivoId
  AND ad.PeriodoId = @PeriodoId
  AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  AND ad.Activo = 1
ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre, m.Codigo;

COMMIT TRAN;
