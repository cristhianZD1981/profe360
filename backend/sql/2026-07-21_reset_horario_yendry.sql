/*
  REINICIO LOGICO COMPLETO DEL HORARIO DE YENDRY WONG VALVERDE
  Correo: yendry.wong.valverde@mep.go.cr

  Periodo: II Periodo del ano lectivo 2026.
  Anddy Peralta NO se incluye y no se toca.

  El reinicio desactiva asignaciones y bloques anteriores de Yendry y luego
  carga unicamente el mapa de la imagen. No se borran fisicamente registros
  para conservar historicos y evitar romper relaciones de la base.

  @Aplicar = 0 simula y revierte toda la transaccion.
  Cambie @Aplicar a 1 solo despues de revisar las verificaciones.

  Planeamiento y Equipo Base son bloques no lectivos de la imagen y no se
  registran como materias en HorarioGrupo.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(150) = N'yendry.wong.valverde@mep.go.cr';
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';
DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;

DECLARE @HorarioCorrecto TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
);

DECLARE @MateriasObjetivo TABLE (
  MateriaCodigo NVARCHAR(50) NOT NULL PRIMARY KEY,
  MateriaId INT NOT NULL
);

DECLARE @Secciones TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY
);

DECLARE @CombinacionesAnteriores TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

/*
  DiaSemana: 2 lunes, 3 martes, 4 miercoles, 5 jueves, 6 viernes.
  Bloques: 0/1/2 = lecciones 1/2/3;
           13/14/15 = lecciones 4/5/6;
           17/18/19 = lecciones 7/8/9;
           21/22/23 = lecciones 10/11/12.
*/

INSERT INTO @HorarioCorrecto (GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes: 1 libre; 2 Habilidades 8-2; 3-4 Habilidades 11-1;
     5-6 Matematicas 12-1; 7-8 Habilidades 8-2;
     9-10 Matematicas 9-1; 11-12 Matematicas 8-1. */
  (N'8-2', N'PNHa', 2, 1),
  (N'11-1', N'PNHa', 2, 2),  (N'11-1', N'PNHa', 2, 13),
  (N'12-1', N'Mate', 2, 14),  (N'12-1', N'Mate', 2, 15),
  (N'8-2', N'PNHa', 2, 17),  (N'8-2', N'PNHa', 2, 18),
  (N'9-1', N'Mate', 2, 19),   (N'9-1', N'Mate', 2, 21),
  (N'8-1', N'Mate', 2, 22),   (N'8-1', N'Mate', 2, 23),

  /* Martes: 1-2 Planeamiento; 3-4 Matematicas 8-2;
     5-6 Matematicas 10-1; 7-8 Matematicas 11-1;
     9-10 Habilidades 12-1; 11-12 Matematicas 7-1. */
  (N'8-2', N'Mate', 3, 2),     (N'8-2', N'Mate', 3, 13),
  (N'10-1', N'Mate', 3, 14),   (N'10-1', N'Mate', 3, 15),
  (N'11-1', N'Mate', 3, 17),   (N'11-1', N'Mate', 3, 18),
  (N'12-1', N'PNHa', 3, 19),   (N'12-1', N'PNHa', 3, 21),
  (N'7-1', N'Mate', 3, 22),    (N'7-1', N'Mate', 3, 23),

  /* Miercoles: 1-2 Matematicas 9-1; 3-4 Matematicas 7-1;
     5-6 Matematicas 8-2; 7-8 Habilidades 11-1;
     9-10 Matematicas 12-1; 11-12 Matematicas 8-1. */
  (N'9-1', N'Mate', 4, 0),     (N'9-1', N'Mate', 4, 1),
  (N'7-1', N'Mate', 4, 2),     (N'7-1', N'Mate', 4, 13),
  (N'8-2', N'Mate', 4, 14),    (N'8-2', N'Mate', 4, 15),
  (N'11-1', N'PNHa', 4, 17),   (N'11-1', N'PNHa', 4, 18),
  (N'12-1', N'Mate', 4, 19),   (N'12-1', N'Mate', 4, 21),
  (N'8-1', N'Mate', 4, 22),    (N'8-1', N'Mate', 4, 23),

  /* Jueves: 1-2 Matematicas 11-1; 3-4 Habilidades 12-1;
     5-7 Habilidades 8-1; 8 Planeamiento;
     9-10 Matematicas 10-1; 11-12 Equipo Base. */
  (N'11-1', N'Mate', 5, 0),    (N'11-1', N'Mate', 5, 1),
  (N'12-1', N'PNHa', 5, 2),    (N'12-1', N'PNHa', 5, 13),
  (N'8-1', N'PNHa', 5, 14),    (N'8-1', N'PNHa', 5, 15),
  (N'8-1', N'PNHa', 5, 17),
  (N'10-1', N'Mate', 5, 19),  (N'10-1', N'Mate', 5, 21);

INSERT INTO @Secciones (GrupoNombre)
SELECT DISTINCT GrupoNombre
FROM @HorarioCorrecto;

BEGIN TRY
  BEGIN TRAN;

  SELECT TOP 1 @UsuarioId = u.UsuarioId
  FROM dbo.Usuario u
  WHERE u.InstitucionId = @InstitucionId
    AND LOWER(u.Correo) = LOWER(@Correo)
    AND u.Activo = 1;

  SELECT TOP 1 @AnioLectivoId = a.AnioLectivoId
  FROM dbo.AnioLectivo a
  WHERE a.InstitucionId = @InstitucionId
    AND a.Nombre = @AnioNombre;

  SELECT TOP 1 @PeriodoId = p.PeriodoId
  FROM dbo.Periodo p
  WHERE p.AnioLectivoId = @AnioLectivoId
    AND p.Nombre = @PeriodoNombre;

  IF @UsuarioId IS NULL
    THROW 51000, 'No se encontro la docente activa.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51001, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51002, 'No se encontro el II Periodo de 2026.', 1;

  IF EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL
  )
  BEGIN
    SELECT DISTINCT hc.MateriaCodigo AS MateriaFaltante
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL;
    THROW 51003, 'Falta una materia del horario.', 1;
  END;

  INSERT INTO @MateriasObjetivo (MateriaCodigo, MateriaId)
  SELECT DISTINCT hc.MateriaCodigo, m.MateriaId
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Materia m
    ON m.InstitucionId = @InstitucionId
   AND m.Codigo = hc.MateriaCodigo
   AND m.Activa = 1;

  IF EXISTS (
    SELECT 1
    FROM @Secciones s
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = s.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL
  )
  BEGIN
    SELECT s.GrupoNombre AS SeccionFaltante
    FROM @Secciones s
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = s.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL;
    THROW 51004, 'Faltan secciones. El script no crea secciones nuevas.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.BloqueHorario bh
      ON bh.InstitucionId = @InstitucionId
     AND bh.BloqueHorarioId = hc.BloqueHorarioId
    WHERE bh.BloqueHorarioId IS NULL
  )
  BEGIN
    SELECT DISTINCT hc.BloqueHorarioId AS BloqueFaltante
    FROM @HorarioCorrecto hc
    LEFT JOIN dbo.BloqueHorario bh
      ON bh.InstitucionId = @InstitucionId
     AND bh.BloqueHorarioId = hc.BloqueHorarioId
    WHERE bh.BloqueHorarioId IS NULL;
    THROW 51005, 'Faltan bloques horarios.', 1;
  END;

  /* Captura todas las combinaciones que Yendry tenia antes del reinicio. */
  INSERT INTO @CombinacionesAnteriores (GrupoId, MateriaId)
  SELECT DISTINCT ad.GrupoId, ad.MateriaId
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /* Limpia los HorarioGrupo de todas las combinaciones anteriores de Yendry. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @CombinacionesAnteriores ca
    ON ca.GrupoId = gm.GrupoId
   AND ca.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1;

  /* Limpia tambien todas las materias del mapa en sus secciones objetivo. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1;

  /* Desactiva todas las asignaciones anteriores de Yendry en el periodo. */
  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /* Reactiva o crea un GrupoMateria por cada combinacion del mapa. */
  UPDATE gm
  SET gm.Activo = 1, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @HorarioCorrecto hc ON hc.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.MateriaId = mo.MateriaId
    AND gm.PeriodoId = @PeriodoId
    AND gm.Activo = 0;

  INSERT INTO dbo.GrupoMateria (GrupoId, MateriaId, PeriodoId, Activo, CreatedAt)
  SELECT DISTINCT g.GrupoId, mo.MateriaId, @PeriodoId, 1, SYSDATETIME()
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = g.GrupoId
      AND gm.MateriaId = mo.MateriaId
      AND ISNULL(gm.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
  );

  /* Deja un solo GrupoMateria activo por grupo, materia y periodo. */
  ;WITH Duplicados AS (
    SELECT
      gm.GrupoMateriaId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
        ORDER BY gm.GrupoMateriaId ASC
      ) AS rn
    FROM dbo.GrupoMateria gm
    INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
    INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
    INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
      AND gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
  )
  UPDATE gm
  SET gm.Activo = CASE WHEN d.rn = 1 THEN 1 ELSE 0 END,
      gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Duplicados d ON d.GrupoMateriaId = gm.GrupoMateriaId
  WHERE d.rn > 1 OR d.rn = 1;

  /* Reactiva un solo AsignacionDocente por combinacion exacta. */
  ;WITH Candidatas AS (
    SELECT DISTINCT
      ad.AsignacionDocenteId,
      ad.GrupoId,
      ad.MateriaId
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN @HorarioCorrecto hc ON hc.GrupoNombre = g.Nombre
    INNER JOIN @MateriasObjetivo mo
      ON mo.MateriaCodigo = hc.MateriaCodigo
     AND mo.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  ), Exactas AS (
    SELECT
      ad.AsignacionDocenteId,
      ROW_NUMBER() OVER (
        PARTITION BY ad.GrupoId, ad.MateriaId
        ORDER BY ad.AsignacionDocenteId ASC
      ) AS rn
    FROM Candidatas ad
  )
  UPDATE ad
  SET ad.Activo = CASE WHEN e.rn = 1 THEN 1 ELSE 0 END,
      ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN Exactas e ON e.AsignacionDocenteId = ad.AsignacionDocenteId;

  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT DISTINCT
    @InstitucionId, @UsuarioId, g.GrupoId, mo.MateriaId,
    @AnioLectivoId, @PeriodoId, N'PROFESOR_MATERIA', 1, SYSDATETIME()
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.GrupoId = g.GrupoId
      AND ad.MateriaId = mo.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  );

  /* Carga unicamente los 42 bloques del horario corregido. */
  INSERT INTO dbo.HorarioGrupo (GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt)
  SELECT gm.GrupoMateriaId, hc.BloqueHorarioId, hc.DiaSemana, 1, SYSDATETIME()
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = g.GrupoId
   AND gm.MateriaId = mo.MateriaId
   AND gm.PeriodoId = @PeriodoId
   AND gm.Activo = 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    WHERE hg.GrupoMateriaId = gm.GrupoMateriaId
      AND hg.BloqueHorarioId = hc.BloqueHorarioId
      AND hg.DiaSemana = hc.DiaSemana
      AND hg.Activo = 1
  );

  /* Desactiva cualquier duplicado activo por grupo, materia, dia y bloque. */
  ;WITH Duplicados AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId ASC
      ) AS rn
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
    INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
    INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
      AND gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
      AND hg.Activo = 1
  )
  UPDATE hg
  SET hg.Activo = CASE WHEN d.rn = 1 THEN 1 ELSE 0 END,
      hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.HorarioGrupoId = hg.HorarioGrupoId;

  SELECT N'Bloques esperados' AS Verificacion, COUNT(*) AS Total
  FROM @HorarioCorrecto;

  SELECT N'Asignaciones activas de Yendry' AS Verificacion, COUNT(*) AS Total
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  SELECT
    N'Duplicados activos' AS Verificacion,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    hg.DiaSemana,
    hg.BloqueHorarioId,
    COUNT(*) AS Total
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
    AND hg.Activo = 1
  GROUP BY g.Nombre, m.Codigo, hg.DiaSemana, hg.BloqueHorarioId
  HAVING COUNT(*) > 1;

  ;WITH HorarioPorLeccion AS (
    SELECT DISTINCT
      hg.DiaSemana,
      hg.BloqueHorarioId,
      g.GrupoId,
      gm.MateriaId
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
    INNER JOIN dbo.AsignacionDocente ad
      ON ad.GrupoId = gm.GrupoId
     AND ad.MateriaId = gm.MateriaId
     AND ad.InstitucionId = @InstitucionId
     AND ad.UsuarioId = @UsuarioId
     AND ad.AnioLectivoId = @AnioLectivoId
     AND ad.PeriodoId = @PeriodoId
     AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
     AND ad.Activo = 1
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
      AND gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
      AND hg.Activo = 1
  )
  SELECT
    N'Traslape de Yendry en la misma leccion' AS Verificacion,
    DiaSemana,
    BloqueHorarioId,
    COUNT(*) AS Total
  FROM HorarioPorLeccion
  GROUP BY DiaSemana, BloqueHorarioId
  HAVING COUNT(*) > 1;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO' AS Resultado;
  END
  ELSE
  BEGIN
    ROLLBACK TRAN;
    SELECT N'SIMULACION: no se guardaron cambios' AS Resultado;
  END;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRAN;
  THROW;
END CATCH;
