/*
  Ajuste de horarios docentes:
  - yendry.wong.valverde@mep.go.cr
  - anddy.peralta.artavia@mep.go.cr

  Referencia: horarios de marzo 2026.
  Se asume el II Periodo del ano lectivo 2026.

  @Aplicar = 0 simula y revierte toda la transaccion.
  Cambie @Aplicar a 1 solamente despues de revisar los resultados.

  El script no crea filas en dbo.Grupo. Los duplicados se desactivan,
  no se borran fisicamente.

  Los bloques de Planeamiento y Equipo Base de las imagenes no se registran
  como lecciones de grupo/materia, por lo que se dejan fuera del mapa.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;

DECLARE @Docentes TABLE (
  Correo NVARCHAR(150) NOT NULL PRIMARY KEY,
  UsuarioId INT NULL
);

INSERT INTO @Docentes (Correo)
VALUES
  (N'yendry.wong.valverde@mep.go.cr'),
  (N'anddy.peralta.artavia@mep.go.cr');

DECLARE @MateriasObjetivo TABLE (
  MateriaCodigo NVARCHAR(50) NOT NULL PRIMARY KEY,
  MateriaId INT NOT NULL
);

DECLARE @Secciones TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY
);

DECLARE @HorarioCorrecto TABLE (
  Correo NVARCHAR(150) NOT NULL,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
);

DECLARE @DocenteCombinaciones TABLE (
  UsuarioId INT NOT NULL,
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (UsuarioId, GrupoId, MateriaId)
);

/*
  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles,
    5 = jueves, 6 = viernes.

  Bloques:
    0, 1, 2 = lecciones 1, 2, 3
    13, 14, 15 = lecciones 4, 5, 6
    17, 18, 19 = lecciones 7, 8, 9
    21, 22, 23 = lecciones 10, 11, 12
*/

/* Yendry Wong: Habilidades y Matematica. */
INSERT INTO @HorarioCorrecto (Correo, GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes */
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'PNHa', 2, 1),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'PNHa', 2, 2),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'PNHa', 2, 13),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'Mate', 2, 14),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'Mate', 2, 15),
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'PNHa', 2, 17),
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'PNHa', 2, 18),
  (N'yendry.wong.valverde@mep.go.cr', N'9-1', N'Mate', 2, 19),
  (N'yendry.wong.valverde@mep.go.cr', N'9-1', N'Mate', 2, 21),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'Mate', 2, 22),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'Mate', 2, 23),

  /* Martes */
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'Mate', 3, 2),
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'Mate', 3, 13),
  (N'yendry.wong.valverde@mep.go.cr', N'10-1', N'Mate', 3, 14),
  (N'yendry.wong.valverde@mep.go.cr', N'10-1', N'Mate', 3, 15),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'Mate', 3, 17),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'Mate', 3, 18),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'PNHa', 3, 19),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'PNHa', 3, 21),
  (N'yendry.wong.valverde@mep.go.cr', N'7-1', N'Mate', 3, 22),
  (N'yendry.wong.valverde@mep.go.cr', N'7-1', N'Mate', 3, 23),

  /* Miercoles */
  (N'yendry.wong.valverde@mep.go.cr', N'9-1', N'Mate', 4, 0),
  (N'yendry.wong.valverde@mep.go.cr', N'9-1', N'Mate', 4, 1),
  (N'yendry.wong.valverde@mep.go.cr', N'7-1', N'Mate', 4, 2),
  (N'yendry.wong.valverde@mep.go.cr', N'7-1', N'Mate', 4, 13),
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'Mate', 4, 14),
  (N'yendry.wong.valverde@mep.go.cr', N'8-2', N'Mate', 4, 15),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'PNHa', 4, 17),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'PNHa', 4, 18),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'Mate', 4, 19),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'Mate', 4, 21),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'Mate', 4, 22),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'Mate', 4, 23),

  /* Jueves */
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'Mate', 5, 0),
  (N'yendry.wong.valverde@mep.go.cr', N'11-1', N'Mate', 5, 1),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'PNHa', 5, 2),
  (N'yendry.wong.valverde@mep.go.cr', N'12-1', N'PNHa', 5, 13),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'PNHa', 5, 14),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'PNHa', 5, 15),
  (N'yendry.wong.valverde@mep.go.cr', N'8-1', N'PNHa', 5, 17),

  /* Anddy Peralta: Artes Industriales. */
  /* Lunes */
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 2, 2),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 2, 13),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 2, 14),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 2, 15),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 17),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 18),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 19),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 21),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 22),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 2, 23),

  /* Martes */
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 0),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 1),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 2),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 13),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 14),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-1', N'PNAI', 3, 15),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 17),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 18),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 19),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 21),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 22),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 3, 23),

  /* Jueves */
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 5, 0),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 5, 1),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 5, 2),
  (N'anddy.peralta.artavia@mep.go.cr', N'7-1', N'PNAI', 5, 13),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 5, 17),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 5, 18),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 5, 19),
  (N'anddy.peralta.artavia@mep.go.cr', N'8-2', N'PNAI', 5, 21);

INSERT INTO @Secciones (GrupoNombre)
SELECT DISTINCT GrupoNombre
FROM @HorarioCorrecto;

BEGIN TRY
  BEGIN TRAN;

  UPDATE d
  SET d.UsuarioId = u.UsuarioId
  FROM @Docentes d
  INNER JOIN dbo.Usuario u
    ON LOWER(u.Correo) = LOWER(d.Correo)
   AND u.InstitucionId = @InstitucionId
   AND u.Activo = 1;

  SELECT TOP 1 @AnioLectivoId = a.AnioLectivoId
  FROM dbo.AnioLectivo a
  WHERE a.InstitucionId = @InstitucionId
    AND a.Nombre = @AnioNombre;

  SELECT TOP 1 @PeriodoId = p.PeriodoId
  FROM dbo.Periodo p
  WHERE p.AnioLectivoId = @AnioLectivoId
    AND p.Nombre = @PeriodoNombre;

  IF EXISTS (SELECT 1 FROM @Docentes WHERE UsuarioId IS NULL)
  BEGIN
    SELECT Correo AS DocenteFaltante FROM @Docentes WHERE UsuarioId IS NULL;
    THROW 51000, 'No se encontro uno o ambos docentes activos.', 1;
  END;

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

  /* Guarda las combinaciones que el docente tenia antes de reconstruirlas. */
  INSERT INTO @DocenteCombinaciones (UsuarioId, GrupoId, MateriaId)
  SELECT DISTINCT
    d.UsuarioId,
    ad.GrupoId,
    ad.MateriaId
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /* Reactiva o crea GrupoMateria para todas las combinaciones del mapa. */
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
  SELECT DISTINCT
    g.GrupoId, mo.MateriaId, @PeriodoId, 1, SYSDATETIME()
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

  /* Conserva el GrupoMateria activo mas antiguo y desactiva duplicados. */
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
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.GrupoMateriaId = hg.GrupoMateriaId
  WHERE d.rn > 1 AND hg.Activo = 1;

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
  SET gm.Activo = 0, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Duplicados d ON d.GrupoMateriaId = gm.GrupoMateriaId
  WHERE d.rn > 1;

  /* Desactiva todas las asignaciones viejas del docente en estas secciones. */
  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /* Reactiva las asignaciones exactas e inserta las que no existan. */
  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT DISTINCT
    @InstitucionId,
    d.UsuarioId,
    g.GrupoId,
    mo.MateriaId,
    @AnioLectivoId,
    @PeriodoId,
    N'PROFESOR_MATERIA',
    1,
    SYSDATETIME()
  FROM @HorarioCorrecto hc
  INNER JOIN @Docentes d ON d.Correo = hc.Correo
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
      AND ad.UsuarioId = d.UsuarioId
      AND ad.GrupoId = g.GrupoId
      AND ad.MateriaId = mo.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ISNULL(ad.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  );

  UPDATE ad
  SET ad.Activo = 1, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND EXISTS (
      SELECT 1
      FROM @HorarioCorrecto hc
      WHERE hc.Correo = d.Correo
        AND hc.GrupoNombre = g.Nombre
        AND hc.MateriaCodigo = mo.MateriaCodigo
    );

  /* Desactiva horarios anteriores de las combinaciones que tenia el docente. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @DocenteCombinaciones dc
    ON dc.GrupoId = gm.GrupoId
   AND dc.MateriaId = gm.MateriaId
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
    AND hg.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @HorarioCorrecto hc
      WHERE hc.GrupoNombre = g.Nombre
        AND EXISTS (
          SELECT 1
          FROM @Docentes d
          INNER JOIN @DocenteCombinaciones dc2
            ON dc2.UsuarioId = d.UsuarioId
           AND dc2.GrupoId = gm.GrupoId
           AND dc2.MateriaId = gm.MateriaId
          INNER JOIN @MateriasObjetivo mo
            ON mo.MateriaId = gm.MateriaId
           AND mo.MateriaCodigo = hc.MateriaCodigo
          WHERE hc.Correo = d.Correo
        )
        AND hc.DiaSemana = hg.DiaSemana
        AND hc.BloqueHorarioId = hg.BloqueHorarioId
    );

  /* Reactiva los bloques correctos que ya existen. */
  UPDATE hg
  SET hg.Activo = 1, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @HorarioCorrecto hc
    ON hc.GrupoNombre = g.Nombre
   AND hc.DiaSemana = hg.DiaSemana
   AND hc.BloqueHorarioId = hg.BloqueHorarioId
  INNER JOIN @MateriasObjetivo mo
    ON mo.MateriaCodigo = hc.MateriaCodigo
   AND mo.MateriaId = gm.MateriaId
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1;

  /* Inserta solo los bloques correctos que no existan. */
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
  );

  /* Deja un solo HorarioGrupo activo por grupo, materia, dia y bloque. */
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
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.HorarioGrupoId = hg.HorarioGrupoId
  WHERE d.rn > 1;

  /* Verificacion de asignaciones activas por docente. */
  SELECT
    N'Asignacion activa' AS Verificacion,
    d.Correo,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    ad.PeriodoId,
    ad.Activo
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY d.Correo, g.Nombre, m.Codigo;

  SELECT
    N'Asignaciones fuera del mapa' AS Verificacion,
    d.Correo,
    COUNT(*) AS Total
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @HorarioCorrecto hc
      INNER JOIN @Docentes d2 ON d2.Correo = hc.Correo
      INNER JOIN @MateriasObjetivo mo2 ON mo2.MateriaCodigo = hc.MateriaCodigo
      WHERE d2.UsuarioId = d.UsuarioId
        AND hc.GrupoNombre = g.Nombre
        AND mo2.MateriaId = ad.MateriaId
    )
  GROUP BY d.Correo;

  SELECT
    N'Bloques activos esperados' AS Verificacion,
    hc.Correo,
    COUNT(*) AS Total
  FROM @HorarioCorrecto hc
  GROUP BY hc.Correo;

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

  ;WITH HorarioPorDocente AS (
    SELECT DISTINCT
      d.Correo,
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
     AND ad.AnioLectivoId = @AnioLectivoId
     AND ad.PeriodoId = @PeriodoId
     AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
     AND ad.Activo = 1
    INNER JOIN @Docentes d ON d.UsuarioId = ad.UsuarioId
    INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
      AND gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
      AND hg.Activo = 1
  )
  SELECT
    N'Docente con mas de una materia o seccion en la misma leccion' AS Verificacion,
    Correo,
    DiaSemana,
    BloqueHorarioId,
    COUNT(*) AS Total
  FROM HorarioPorDocente
  GROUP BY Correo, DiaSemana, BloqueHorarioId
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
