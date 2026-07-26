/*
  CORRECCION DEFINITIVA - YENDRY WONG VALVERDE
  Correo: yendry.wong.valverde@mep.go.cr
  Periodo: II Periodo del ano lectivo 2026

  MATEMATICAS:
    Matematica (Mate) -> Matematicas PN
    7-1  -> 7 PN
    8-1  -> 8 PN
    8-2  -> 8 PN
    9-1  -> 9 PN
    10-1 -> 10 PN
    11-1 -> 11 PN
    12-1 -> 12 PN

  HABILIDADES:
    8-1  -> 8 PN
    8-2  -> 8 PN
    11-1 -> 11 PN
    12-1 -> 12 PN

  LIMPIEZA:
    7 PL, 8 PL, 9 PL, 10 PL, 11 PL y 12 PL quedan inactivas.

  SEGURIDAD:
  - @Aplicar = 0 simula y revierte todos los cambios.
  - Cambie @Aplicar a 1 solo despues de revisar las verificaciones.
  - No borra historicos fisicamente.
  - Se detiene si una seccion PL tiene matriculas.
  - Se detiene si otro profesor usa una seccion PL o una combinacion PN
    que este script debe modificar.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(150) = N'yendry.wong.valverde@mep.go.cr';
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';
DECLARE @MatematicaOrigenCodigo NVARCHAR(50) = N'Mate';
DECLARE @MatematicasPnNombre NVARCHAR(150) = N'Matemáticas PN';
DECLARE @HabilidadesCodigo NVARCHAR(50) = N'PNHa';

DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;
DECLARE @MatematicaOrigenId INT;
DECLARE @MatematicasPnId INT;
DECLARE @HabilidadesId INT;

DECLARE @SeccionesPn TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY,
  GrupoBaseNombre NVARCHAR(100) NOT NULL
);

INSERT INTO @SeccionesPn (GrupoNombre, GrupoBaseNombre)
VALUES
  (N'7 PN', N'7-1'),
  (N'8 PN', N'8-1'),
  (N'9 PN', N'9-1'),
  (N'10 PN', N'10-1'),
  (N'11 PN', N'11-1'),
  (N'12 PN', N'12-1');

DECLARE @SeccionesPl TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY
);

INSERT INTO @SeccionesPl (GrupoNombre)
VALUES
  (N'7 PL'), (N'8 PL'), (N'9 PL'),
  (N'10 PL'), (N'11 PL'), (N'12 PL');

DECLARE @SeccionesOrigen TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY
);

INSERT INTO @SeccionesOrigen (GrupoNombre)
VALUES
  (N'7-1'), (N'8-1'), (N'8-2'), (N'9-1'),
  (N'10-1'), (N'11-1'), (N'12-1');

DECLARE @MateriasObjetivo TABLE (
  MateriaClave NVARCHAR(20) NOT NULL PRIMARY KEY,
  MateriaId INT NOT NULL
);

DECLARE @HorarioCorrecto TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaClave NVARCHAR(20) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (GrupoNombre, MateriaClave, DiaSemana, BloqueHorarioId)
);

/*
  DiaSemana: 2 lunes, 3 martes, 4 miercoles, 5 jueves, 6 viernes.
  Bloques: 0/1/2 = lecciones 1/2/3;
           13/14/15 = lecciones 4/5/6;
           17/18/19 = lecciones 7/8/9;
           21/22/23 = lecciones 10/11/12.
*/
INSERT INTO @HorarioCorrecto (
  GrupoNombre, MateriaClave, DiaSemana, BloqueHorarioId
)
VALUES
  /* Lunes: 1 libre. */
  (N'8 PN', N'HABILIDADES', 2, 1),
  (N'11 PN', N'HABILIDADES', 2, 2),
  (N'11 PN', N'HABILIDADES', 2, 13),
  (N'12 PN', N'MATEMATICAS', 2, 14),
  (N'12 PN', N'MATEMATICAS', 2, 15),
  (N'8 PN', N'HABILIDADES', 2, 17),
  (N'8 PN', N'HABILIDADES', 2, 18),
  (N'9 PN', N'MATEMATICAS', 2, 19),
  (N'9 PN', N'MATEMATICAS', 2, 21),
  (N'8 PN', N'MATEMATICAS', 2, 22),
  (N'8 PN', N'MATEMATICAS', 2, 23),

  /* Martes: 1-2 libres. */
  (N'8 PN', N'MATEMATICAS', 3, 2),
  (N'8 PN', N'MATEMATICAS', 3, 13),
  (N'10 PN', N'MATEMATICAS', 3, 14),
  (N'10 PN', N'MATEMATICAS', 3, 15),
  (N'11 PN', N'MATEMATICAS', 3, 17),
  (N'11 PN', N'MATEMATICAS', 3, 18),
  (N'12 PN', N'HABILIDADES', 3, 19),
  (N'12 PN', N'HABILIDADES', 3, 21),
  (N'7 PN', N'MATEMATICAS', 3, 22),
  (N'7 PN', N'MATEMATICAS', 3, 23),

  /* Miercoles. */
  (N'9 PN', N'MATEMATICAS', 4, 0),
  (N'9 PN', N'MATEMATICAS', 4, 1),
  (N'7 PN', N'MATEMATICAS', 4, 2),
  (N'7 PN', N'MATEMATICAS', 4, 13),
  (N'8 PN', N'MATEMATICAS', 4, 14),
  (N'8 PN', N'MATEMATICAS', 4, 15),
  (N'11 PN', N'HABILIDADES', 4, 17),
  (N'11 PN', N'HABILIDADES', 4, 18),
  (N'12 PN', N'MATEMATICAS', 4, 19),
  (N'12 PN', N'MATEMATICAS', 4, 21),
  (N'8 PN', N'MATEMATICAS', 4, 22),
  (N'8 PN', N'MATEMATICAS', 4, 23),

  /* Jueves: 8 libre; 11-12 no lectivas. */
  (N'11 PN', N'MATEMATICAS', 5, 0),
  (N'11 PN', N'MATEMATICAS', 5, 1),
  (N'12 PN', N'HABILIDADES', 5, 2),
  (N'12 PN', N'HABILIDADES', 5, 13),
  (N'8 PN', N'HABILIDADES', 5, 14),
  (N'8 PN', N'HABILIDADES', 5, 15),
  (N'8 PN', N'HABILIDADES', 5, 17),
  (N'10 PN', N'MATEMATICAS', 5, 19),
  (N'10 PN', N'MATEMATICAS', 5, 21);

DECLARE @GruposPn TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY,
  GrupoId INT NOT NULL
);

DECLARE @Objetivos TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

DECLARE @GrupoMateriaCanonico TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  GrupoMateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

BEGIN TRY
  BEGIN TRAN;

  SELECT TOP (1)
    @UsuarioId = u.UsuarioId
  FROM dbo.Usuario u
  WHERE u.InstitucionId = @InstitucionId
    AND LOWER(LTRIM(RTRIM(u.Correo))) = LOWER(@Correo)
    AND u.Activo = 1;

  SELECT TOP (1)
    @AnioLectivoId = a.AnioLectivoId
  FROM dbo.AnioLectivo a
  WHERE a.InstitucionId = @InstitucionId
    AND a.Nombre = @AnioNombre;

  SELECT TOP (1)
    @PeriodoId = p.PeriodoId
  FROM dbo.Periodo p
  WHERE p.AnioLectivoId = @AnioLectivoId
    AND p.Nombre = @PeriodoNombre;

  SELECT TOP (1)
    @MatematicaOrigenId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Codigo = @MatematicaOrigenCodigo
    AND m.Activa = 1;

  SELECT TOP (1)
    @MatematicasPnId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Activa = 1
    AND LOWER(LTRIM(RTRIM(m.Nombre))) COLLATE Latin1_General_100_CI_AI
        = LOWER(@MatematicasPnNombre) COLLATE Latin1_General_100_CI_AI
  ORDER BY m.MateriaId;

  SELECT TOP (1)
    @HabilidadesId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Codigo = @HabilidadesCodigo
    AND m.Activa = 1;

  IF @UsuarioId IS NULL
    THROW 51000, 'No se encontro la profesora activa.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51001, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51002, 'No se encontro el II Periodo de 2026.', 1;
  IF @MatematicaOrigenId IS NULL
    THROW 51003, 'No se encontro Matematica con codigo Mate.', 1;
  IF @MatematicasPnId IS NULL
  BEGIN
    SELECT m.MateriaId, m.Codigo, m.Nombre
    FROM dbo.Materia m
    WHERE m.InstitucionId = @InstitucionId
      AND m.Nombre COLLATE Latin1_General_100_CI_AI LIKE N'%matem%';
    THROW 51004, 'No se encontro la materia activa Matematicas PN.', 1;
  END;
  IF @HabilidadesId IS NULL
    THROW 51005, 'No se encontro Habilidades con codigo PNHa.', 1;

  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 42
    THROW 51006, 'El mapa no contiene las 42 lecciones esperadas.', 1;

  INSERT INTO @MateriasObjetivo (MateriaClave, MateriaId)
  VALUES
    (N'MATEMATICAS', @MatematicasPnId),
    (N'HABILIDADES', @HabilidadesId);

  IF EXISTS (
    SELECT 1
    FROM @SeccionesPn sp
    LEFT JOIN dbo.Grupo base
      ON base.InstitucionId = @InstitucionId
     AND base.AnioLectivoId = @AnioLectivoId
     AND base.Nombre = sp.GrupoBaseNombre
     AND base.Activo = 1
    WHERE base.GrupoId IS NULL
  )
  BEGIN
    SELECT sp.GrupoBaseNombre AS SeccionBaseFaltante
    FROM @SeccionesPn sp
    LEFT JOIN dbo.Grupo base
      ON base.InstitucionId = @InstitucionId
     AND base.AnioLectivoId = @AnioLectivoId
     AND base.Nombre = sp.GrupoBaseNombre
     AND base.Activo = 1
    WHERE base.GrupoId IS NULL;
    THROW 51007, 'Falta una seccion regular usada como base.', 1;
  END;

  /* Reactiva una sola seccion PN existente por nombre. */
  ;WITH Candidatos AS (
    SELECT
      g.GrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY g.InstitucionId, g.AnioLectivoId, g.Nombre
        ORDER BY CASE WHEN g.Activo = 1 THEN 0 ELSE 1 END, g.GrupoId
      ) AS rn
    FROM dbo.Grupo g
    INNER JOIN @SeccionesPn sp ON sp.GrupoNombre = g.Nombre
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
  )
  UPDATE g
  SET
    g.Activo = CASE WHEN c.rn = 1 THEN 1 ELSE 0 END,
    g.UpdatedAt = SYSDATETIME()
  FROM dbo.Grupo g
  INNER JOIN Candidatos c ON c.GrupoId = g.GrupoId;

  /* Crea las secciones PN faltantes copiando sede, nivel y jornada. */
  INSERT INTO dbo.Grupo (
    InstitucionId, SedeId, AnioLectivoId, Nombre,
    Nivel, Jornada, Activo, CreatedAt
  )
  SELECT
    @InstitucionId,
    base.SedeId,
    @AnioLectivoId,
    sp.GrupoNombre,
    base.Nivel,
    base.Jornada,
    1,
    SYSDATETIME()
  FROM @SeccionesPn sp
  INNER JOIN dbo.Grupo base
    ON base.InstitucionId = @InstitucionId
   AND base.AnioLectivoId = @AnioLectivoId
   AND base.Nombre = sp.GrupoBaseNombre
   AND base.Activo = 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.Grupo g
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
      AND g.Nombre = sp.GrupoNombre
  );

  INSERT INTO @GruposPn (GrupoNombre, GrupoId)
  SELECT sp.GrupoNombre, MIN(g.GrupoId)
  FROM @SeccionesPn sp
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = sp.GrupoNombre
   AND g.Activo = 1
  GROUP BY sp.GrupoNombre;

  IF (SELECT COUNT(*) FROM @GruposPn) <> 6
    THROW 51008, 'No se pudieron preparar las seis secciones PN.', 1;

  /*
    Antes de inactivar PL, verifica que no tenga matriculas ni profesores
    distintos de Yendry.
  */
  IF EXISTS (
    SELECT 1
    FROM dbo.Matricula ma
    INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
    INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
  )
  BEGIN
    SELECT g.Nombre AS SeccionPl, COUNT(*) AS Matriculas
    FROM dbo.Matricula ma
    INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
    INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
    WHERE g.InstitucionId = @InstitucionId
      AND g.AnioLectivoId = @AnioLectivoId
    GROUP BY g.Nombre;
    THROW 51009, 'Una seccion PL tiene matriculas y no se puede inactivar automaticamente.', 1;
  END;

  IF EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.Activo = 1
  )
  BEGIN
    SELECT g.Nombre AS SeccionPl, u.Correo AS OtroProfesor
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
    INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.Activo = 1;
    THROW 51010, 'Otro profesor usa una seccion PL. No se aplicaron cambios.', 1;
  END;

  /* Protege las combinaciones PN que se van a reconstruir. */
  INSERT INTO @Objetivos (GrupoId, MateriaId)
  SELECT DISTINCT gp.GrupoId, mo.MateriaId
  FROM @HorarioCorrecto hc
  INNER JOIN @GruposPn gp ON gp.GrupoNombre = hc.GrupoNombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaClave = hc.MateriaClave;

  IF EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Objetivos o
      ON o.GrupoId = ad.GrupoId
     AND o.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  )
  BEGIN
    SELECT g.Nombre AS Seccion, m.Nombre AS Materia, u.Correo AS OtroProfesor
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Objetivos o
      ON o.GrupoId = ad.GrupoId
     AND o.MateriaId = ad.MateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1;
    THROW 51011, 'Otra persona usa una combinacion PN que debe modificarse.', 1;
  END;

  /* Inactiva las asignaciones antiguas de Yendry en las secciones regulares. */
  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @SeccionesOrigen so ON so.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.MateriaId IN (@MatematicaOrigenId, @HabilidadesId)
    AND ad.Activo = 1;

  /* Inactiva horarios, materias, asignaciones y secciones PL. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND hg.Activo = 1;

  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.Activo = 1;

  UPDATE gm
  SET gm.Activo = 0, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND gm.Activo = 1;

  UPDATE g
  SET g.Activo = 0, g.UpdatedAt = SYSDATETIME()
  FROM dbo.Grupo g
  INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
  WHERE g.InstitucionId = @InstitucionId
    AND g.AnioLectivoId = @AnioLectivoId
    AND g.Activo = 1;

  /* Prepara un GrupoMateria canonico por cada combinacion PN. */
  ;WITH Candidatos AS (
    SELECT
      gm.GrupoMateriaId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
        ORDER BY CASE WHEN gm.Activo = 1 THEN 0 ELSE 1 END, gm.GrupoMateriaId
      ) AS rn
    FROM dbo.GrupoMateria gm
    INNER JOIN @Objetivos o
      ON o.GrupoId = gm.GrupoId
     AND o.MateriaId = gm.MateriaId
    WHERE gm.PeriodoId = @PeriodoId
  )
  UPDATE gm
  SET
    gm.Activo = CASE WHEN c.rn = 1 THEN 1 ELSE 0 END,
    gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Candidatos c ON c.GrupoMateriaId = gm.GrupoMateriaId;

  INSERT INTO dbo.GrupoMateria (
    GrupoId, MateriaId, PeriodoId, Activo, CreatedAt
  )
  SELECT o.GrupoId, o.MateriaId, @PeriodoId, 1, SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = o.GrupoId
      AND gm.MateriaId = o.MateriaId
      AND gm.PeriodoId = @PeriodoId
  );

  INSERT INTO @GrupoMateriaCanonico (GrupoId, MateriaId, GrupoMateriaId)
  SELECT o.GrupoId, o.MateriaId, MIN(gm.GrupoMateriaId)
  FROM @Objetivos o
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = o.GrupoId
   AND gm.MateriaId = o.MateriaId
   AND gm.PeriodoId = @PeriodoId
   AND gm.Activo = 1
  GROUP BY o.GrupoId, o.MateriaId;

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 9
    THROW 51012, 'No se pudieron preparar las nueve combinaciones PN.', 1;

  /* Deja una sola asignacion de Yendry por cada combinacion PN. */
  ;WITH Candidatas AS (
    SELECT
      ad.AsignacionDocenteId,
      ROW_NUMBER() OVER (
        PARTITION BY ad.GrupoId, ad.MateriaId
        ORDER BY ad.AsignacionDocenteId
      ) AS rn
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Objetivos o
      ON o.GrupoId = ad.GrupoId
     AND o.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  )
  UPDATE ad
  SET
    ad.Activo = CASE WHEN c.rn = 1 THEN 1 ELSE 0 END,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN Candidatas c ON c.AsignacionDocenteId = ad.AsignacionDocenteId;

  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT
    @InstitucionId, @UsuarioId, o.GrupoId, o.MateriaId,
    @AnioLectivoId, @PeriodoId, N'PROFESOR_MATERIA', 1, SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.GrupoId = o.GrupoId
      AND ad.MateriaId = o.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  );

  /* Reemplaza el horario PN por el mapa exacto de 42 lecciones. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1;

  ;WITH Existentes AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS rn
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = canon.GrupoMateriaId
    INNER JOIN @GruposPn gp ON gp.GrupoId = gm.GrupoId
    INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
    INNER JOIN @HorarioCorrecto hc
      ON hc.GrupoNombre = gp.GrupoNombre
     AND hc.MateriaClave = mo.MateriaClave
     AND hc.DiaSemana = hg.DiaSemana
     AND hc.BloqueHorarioId = hg.BloqueHorarioId
  )
  UPDATE hg
  SET
    hg.Activo = CASE WHEN e.rn = 1 THEN 1 ELSE 0 END,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Existentes e ON e.HorarioGrupoId = hg.HorarioGrupoId;

  INSERT INTO dbo.HorarioGrupo (
    GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt
  )
  SELECT
    canon.GrupoMateriaId,
    hc.BloqueHorarioId,
    hc.DiaSemana,
    1,
    SYSDATETIME()
  FROM @HorarioCorrecto hc
  INNER JOIN @GruposPn gp ON gp.GrupoNombre = hc.GrupoNombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaClave = hc.MateriaClave
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = gp.GrupoId
   AND canon.MateriaId = mo.MateriaId
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    WHERE hg.GrupoMateriaId = canon.GrupoMateriaId
      AND hg.BloqueHorarioId = hc.BloqueHorarioId
      AND hg.DiaSemana = hc.DiaSemana
      AND hg.Activo = 1
  );

  /* Verificacion 1: nueve asignaciones PN. */
  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Objetivos o
    ON o.GrupoId = ad.GrupoId
   AND o.MateriaId = ad.MateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre, m.Nombre;

  /* Verificacion 2: horario exacto y ordenado. */
  SELECT
    CASE hg.DiaSemana
      WHEN 2 THEN N'Lunes'
      WHEN 3 THEN N'Martes'
      WHEN 4 THEN N'Miercoles'
      WHEN 5 THEN N'Jueves'
      WHEN 6 THEN N'Viernes'
    END AS Dia,
    bh.OrdenVisual AS Leccion,
    g.Nombre AS Seccion,
    m.Nombre AS Materia
  FROM dbo.AsignacionDocente ad
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = ad.GrupoId
   AND canon.MateriaId = ad.MateriaId
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.GrupoMateriaId = canon.GrupoMateriaId
   AND hg.Activo = 1
  INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre, m.Nombre;

  /* Verificacion 3: resumen esperado 9, 42 y 0 PL activas. */
  SELECT
    (SELECT COUNT(*)
     FROM dbo.AsignacionDocente ad
     INNER JOIN @Objetivos o
       ON o.GrupoId = ad.GrupoId
      AND o.MateriaId = ad.MateriaId
     WHERE ad.InstitucionId = @InstitucionId
       AND ad.UsuarioId = @UsuarioId
       AND ad.AnioLectivoId = @AnioLectivoId
       AND ad.PeriodoId = @PeriodoId
       AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
       AND ad.Activo = 1) AS AsignacionesEsperadas9,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN @GrupoMateriaCanonico canon
       ON canon.GrupoMateriaId = hg.GrupoMateriaId
     WHERE hg.Activo = 1) AS BloquesEsperados42,
    (SELECT COUNT(*)
     FROM dbo.Grupo g
     INNER JOIN @SeccionesPl spl ON spl.GrupoNombre = g.Nombre
     WHERE g.InstitucionId = @InstitucionId
       AND g.AnioLectivoId = @AnioLectivoId
       AND g.Activo = 1) AS SeccionesPlActivasEsperadas0;

  /* Verificacion 4: debe devolver cero filas. */
  ;WITH HorarioYendry AS (
    SELECT DISTINCT
      hg.DiaSemana,
      hg.BloqueHorarioId,
      ad.GrupoId,
      ad.MateriaId
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoId = ad.GrupoId
     AND gm.MateriaId = ad.MateriaId
     AND gm.PeriodoId = ad.PeriodoId
     AND gm.Activo = 1
    INNER JOIN dbo.HorarioGrupo hg
      ON hg.GrupoMateriaId = gm.GrupoMateriaId
     AND hg.Activo = 1
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  )
  SELECT
    N'Traslape' AS Problema,
    DiaSemana,
    BloqueHorarioId,
    COUNT(*) AS Total
  FROM HorarioYendry
  GROUP BY DiaSemana, BloqueHorarioId
  HAVING COUNT(*) > 1;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: secciones PN corregidas y PL inactivadas.' AS Resultado;
  END
  ELSE
  BEGIN
    ROLLBACK TRAN;
    SELECT N'SIMULACION: no se guardaron cambios. Cambie @Aplicar a 1 para aplicar.' AS Resultado;
  END;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRAN;
  THROW;
END CATCH;
