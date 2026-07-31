/*
  CORRECCION DE HORARIO - ANDRES MORUN GARRO
  Correo: andres.morun.garro@mep.go.cr
  Fuente: Horario_Profesor_Morun_Marzo_2026.xlsx
  Periodo objetivo: II Periodo, ano lectivo 2026

  IMPORTANTE:
  - @Aplicar = 0 ejecuta la simulacion y revierte todo.
  - Cambie @Aplicar a 1 solo despues de revisar los resultados.
  - No crea materias.
  - No crea grupos.
  - No duplica GrupoMateria: reutiliza el registro canonico existente.
  - Para Andres deja activas solamente las 13 combinaciones indicadas.
  - En HorarioGrupo deja exactamente las 60 lecciones del Excel.

  Nota tecnica:
  HorarioGrupo pertenece a GrupoMateria, no directamente al profesor. Si otro
  profesor comparte una misma seccion/materia, vera tambien el horario que
  quede para esa seccion/materia.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(320) = N'andres.morun.garro@mep.go.cr';
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

/*
  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles,
    5 = jueves, 6 = viernes.

  Lecciones del Excel a BloqueHorarioId:
    1, 2, 3    -> 0, 1, 2
    4, 5, 6    -> 13, 14, 15
    7, 8, 9    -> 17, 18, 19
    10, 11, 12 -> 21, 22, 23

  Materias:
    Inco = Ingles conversacional
    Ingl = Ingles
*/
INSERT INTO @HorarioCorrecto (
  GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId
)
VALUES
  /* Lunes: 1-6 Inco 7-7; 7-12 Inco 7-4. */
  (N'7-7', N'Inco', 2, 0),
  (N'7-7', N'Inco', 2, 1),
  (N'7-7', N'Inco', 2, 2),
  (N'7-7', N'Inco', 2, 13),
  (N'7-7', N'Inco', 2, 14),
  (N'7-7', N'Inco', 2, 15),
  (N'7-4', N'Inco', 2, 17),
  (N'7-4', N'Inco', 2, 18),
  (N'7-4', N'Inco', 2, 19),
  (N'7-4', N'Inco', 2, 21),
  (N'7-4', N'Inco', 2, 22),
  (N'7-4', N'Inco', 2, 23),

  /* Martes: 1-6 Inco 7-3; 7-12 Inco 9-6. */
  (N'7-3', N'Inco', 3, 0),
  (N'7-3', N'Inco', 3, 1),
  (N'7-3', N'Inco', 3, 2),
  (N'7-3', N'Inco', 3, 13),
  (N'7-3', N'Inco', 3, 14),
  (N'7-3', N'Inco', 3, 15),
  (N'9-6', N'Inco', 3, 17),
  (N'9-6', N'Inco', 3, 18),
  (N'9-6', N'Inco', 3, 19),
  (N'9-6', N'Inco', 3, 21),
  (N'9-6', N'Inco', 3, 22),
  (N'9-6', N'Inco', 3, 23),

  /* Miercoles: Ingles. */
  (N'9-3', N'Ingl', 4, 0),
  (N'9-1', N'Ingl', 4, 1),
  (N'9-5', N'Ingl', 4, 2),
  (N'9-5', N'Ingl', 4, 13),
  (N'9-3', N'Ingl', 4, 14),
  (N'9-3', N'Ingl', 4, 15),
  (N'9-2', N'Ingl', 4, 17),
  (N'9-2', N'Ingl', 4, 18),
  (N'9-4', N'Ingl', 4, 19),
  (N'9-4', N'Ingl', 4, 21),
  (N'9-1', N'Ingl', 4, 22),
  (N'9-1', N'Ingl', 4, 23),

  /* Jueves: 1-6 Inco 7-5; 7-12 Inco 7-2. */
  (N'7-5', N'Inco', 5, 0),
  (N'7-5', N'Inco', 5, 1),
  (N'7-5', N'Inco', 5, 2),
  (N'7-5', N'Inco', 5, 13),
  (N'7-5', N'Inco', 5, 14),
  (N'7-5', N'Inco', 5, 15),
  (N'7-2', N'Inco', 5, 17),
  (N'7-2', N'Inco', 5, 18),
  (N'7-2', N'Inco', 5, 19),
  (N'7-2', N'Inco', 5, 21),
  (N'7-2', N'Inco', 5, 22),
  (N'7-2', N'Inco', 5, 23),

  /* Viernes: 1-6 Inco 7-1; 7-12 Ingles. */
  (N'7-1', N'Inco', 6, 0),
  (N'7-1', N'Inco', 6, 1),
  (N'7-1', N'Inco', 6, 2),
  (N'7-1', N'Inco', 6, 13),
  (N'7-1', N'Inco', 6, 14),
  (N'7-1', N'Inco', 6, 15),
  (N'9-4', N'Ingl', 6, 17),
  (N'9-6', N'Ingl', 6, 18),
  (N'9-6', N'Ingl', 6, 19),
  (N'9-2', N'Ingl', 6, 21),
  (N'9-5', N'Ingl', 6, 22),
  (N'9-6', N'Ingl', 6, 23);

DECLARE @MateriasObjetivo TABLE (
  MateriaCodigo NVARCHAR(50) NOT NULL PRIMARY KEY,
  MateriaId INT NOT NULL
);

DECLARE @Objetivos TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
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

  IF @UsuarioId IS NULL
    THROW 51000, 'No se encontro el profesor activo con el correo indicado.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51001, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51002, 'No se encontro el II Periodo del ano lectivo 2026.', 1;
  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 60
    THROW 51003, 'El mapa no contiene las 60 lecciones esperadas.', 1;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT MateriaCodigo FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL
  )
  BEGIN
    SELECT hc.MateriaCodigo AS MateriaFaltante
    FROM (SELECT DISTINCT MateriaCodigo FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Materia m
      ON m.InstitucionId = @InstitucionId
     AND m.Codigo = hc.MateriaCodigo
     AND m.Activa = 1
    WHERE m.MateriaId IS NULL;

    THROW 51005, 'Falta una materia requerida. El script no crea materias.', 1;
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
    FROM (SELECT DISTINCT GrupoNombre FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = hc.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL
  )
  BEGIN
    SELECT hc.GrupoNombre AS SeccionFaltante
    FROM (SELECT DISTINCT GrupoNombre FROM @HorarioCorrecto) hc
    LEFT JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = hc.GrupoNombre
     AND g.Activo = 1
    WHERE g.GrupoId IS NULL;

    THROW 51006, 'Falta una seccion requerida. El script no crea grupos.', 1;
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

    THROW 51007, 'Falta un bloque horario requerido.', 1;
  END;

  INSERT INTO @Objetivos (GrupoId, MateriaId, GrupoNombre, MateriaCodigo)
  SELECT DISTINCT
    g.GrupoId,
    mo.MateriaId,
    g.Nombre,
    mo.MateriaCodigo
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo
    ON mo.MateriaCodigo = hc.MateriaCodigo;

  IF (SELECT COUNT(*) FROM @Objetivos) <> 13
    THROW 51008, 'El mapa no contiene las 13 secciones/materias esperadas.', 1;

  /*
    Para Andres: inactiva asignaciones que no estan en el Excel.
    Esto evita que le aparezcan materias/secciones fuera del horario objetivo.
  */
  UPDATE ad
  SET
    ad.Activo = 0,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @Objetivos o
      WHERE o.GrupoId = ad.GrupoId
        AND o.MateriaId = ad.MateriaId
    );

  /*
    GrupoMateria: no duplicar. Si ya existe, reutilizar el menor id.
    Si no existe ningun registro, crear uno para poder enlazar el horario.
  */
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

  ;WITH Canonicos AS (
    SELECT
      gm.GrupoMateriaId,
      gm.GrupoId,
      gm.MateriaId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, gm.PeriodoId
        ORDER BY gm.GrupoMateriaId
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
  INNER JOIN Canonicos c
    ON c.GrupoMateriaId = gm.GrupoMateriaId;

  INSERT INTO @GrupoMateriaCanonico (GrupoId, MateriaId, GrupoMateriaId)
  SELECT o.GrupoId, o.MateriaId, MIN(gm.GrupoMateriaId)
  FROM @Objetivos o
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = o.GrupoId
   AND gm.MateriaId = o.MateriaId
   AND gm.PeriodoId = @PeriodoId
   AND gm.Activo = 1
  GROUP BY o.GrupoId, o.MateriaId;

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 13
    THROW 51009, 'No se prepararon las 13 GrupoMateria canonicas.', 1;

  /*
    Para Andres: dejar una sola AsignacionDocente activa por seccion/materia.
  */
  ;WITH Asignaciones AS (
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
    ad.Activo = CASE WHEN a.rn = 1 THEN 1 ELSE 0 END,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN Asignaciones a
    ON a.AsignacionDocenteId = ad.AsignacionDocenteId;

  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT
    @InstitucionId, @UsuarioId, o.GrupoId, o.MateriaId, @AnioLectivoId,
    @PeriodoId, N'PROFESOR_MATERIA', 1, SYSDATETIME()
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

  /*
    HorarioGrupo: limpiar extras y duplicados para las 13 combinaciones.
    Primero se desactiva lo que sobra; despues se garantiza una fila activa
    por cada una de las 60 lecciones del Excel.
  */
  ;WITH HorariosObjetivo AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS rn,
      CASE WHEN hc.GrupoNombre IS NULL THEN 0 ELSE 1 END AS EnMapa
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.Grupo g
      ON g.GrupoId = canon.GrupoId
    INNER JOIN dbo.Materia m
      ON m.MateriaId = canon.MateriaId
    LEFT JOIN @HorarioCorrecto hc
      ON hc.GrupoNombre = g.Nombre
     AND hc.MateriaCodigo = m.Codigo
     AND hc.DiaSemana = hg.DiaSemana
     AND hc.BloqueHorarioId = hg.BloqueHorarioId
    WHERE hg.Activo = 1
  )
  UPDATE hg
  SET
    hg.Activo = 0,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN HorariosObjetivo ho
    ON ho.HorarioGrupoId = hg.HorarioGrupoId
  WHERE ho.EnMapa = 0
     OR ho.rn > 1;

  /*
    Reactiva una fila existente que corresponda al mapa y este inactiva,
    solo cuando todavia no haya una activa para esa leccion.
  */
  ;WITH Reactivar AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS rn
    FROM @HorarioCorrecto hc
    INNER JOIN dbo.Grupo g
      ON g.InstitucionId = @InstitucionId
     AND g.AnioLectivoId = @AnioLectivoId
     AND g.Nombre = hc.GrupoNombre
     AND g.Activo = 1
    INNER JOIN @MateriasObjetivo mo
      ON mo.MateriaCodigo = hc.MateriaCodigo
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoId = g.GrupoId
     AND canon.MateriaId = mo.MateriaId
    INNER JOIN dbo.HorarioGrupo hg
      ON hg.GrupoMateriaId = canon.GrupoMateriaId
     AND hg.DiaSemana = hc.DiaSemana
     AND hg.BloqueHorarioId = hc.BloqueHorarioId
     AND hg.Activo = 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.HorarioGrupo activo
      WHERE activo.GrupoMateriaId = canon.GrupoMateriaId
        AND activo.DiaSemana = hc.DiaSemana
        AND activo.BloqueHorarioId = hc.BloqueHorarioId
        AND activo.Activo = 1
    )
  )
  UPDATE hg
  SET
    hg.Activo = 1,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Reactivar r
    ON r.HorarioGrupoId = hg.HorarioGrupoId
   AND r.rn = 1;

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
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo
    ON mo.MateriaCodigo = hc.MateriaCodigo
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = g.GrupoId
   AND canon.MateriaId = mo.MateriaId
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    WHERE hg.GrupoMateriaId = canon.GrupoMateriaId
      AND hg.DiaSemana = hc.DiaSemana
      AND hg.BloqueHorarioId = hc.BloqueHorarioId
      AND hg.Activo = 1
  );

  /*
    Validaciones finales.
  */
  IF (
    SELECT COUNT(*)
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  ) <> 13
    THROW 51010, 'Andres no quedo con exactamente 13 asignaciones activas.', 1;

  IF EXISTS (
    SELECT ad.GrupoId, ad.MateriaId
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
    GROUP BY ad.GrupoId, ad.MateriaId
    HAVING COUNT(*) > 1
  )
    THROW 51011, 'Andres quedo con asignaciones duplicadas.', 1;

  IF (
    SELECT COUNT(*)
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
  ) <> 60
    THROW 51012, 'El horario final no quedo con exactamente 60 lecciones activas.', 1;

  IF EXISTS (
    SELECT
      hg.GrupoMateriaId,
      hg.DiaSemana,
      hg.BloqueHorarioId
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
    GROUP BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51013, 'El horario final conserva duplicados exactos de seccion/materia/leccion.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.Grupo g
      ON g.GrupoId = canon.GrupoId
    INNER JOIN dbo.Materia m
      ON m.MateriaId = canon.MateriaId
    WHERE hg.Activo = 1
      AND NOT EXISTS (
        SELECT 1
        FROM @HorarioCorrecto hc
        WHERE hc.GrupoNombre = g.Nombre
          AND hc.MateriaCodigo = m.Codigo
          AND hc.DiaSemana = hg.DiaSemana
          AND hc.BloqueHorarioId = hg.BloqueHorarioId
      )
  )
    THROW 51014, 'Quedaron lecciones activas fuera del Excel.', 1;

  IF EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.Grupo g
      INNER JOIN @MateriasObjetivo mo
        ON mo.MateriaCodigo = hc.MateriaCodigo
      INNER JOIN @GrupoMateriaCanonico canon
        ON canon.GrupoId = g.GrupoId
       AND canon.MateriaId = mo.MateriaId
      INNER JOIN dbo.HorarioGrupo hg
        ON hg.GrupoMateriaId = canon.GrupoMateriaId
       AND hg.DiaSemana = hc.DiaSemana
       AND hg.BloqueHorarioId = hc.BloqueHorarioId
       AND hg.Activo = 1
      WHERE g.InstitucionId = @InstitucionId
        AND g.AnioLectivoId = @AnioLectivoId
        AND g.Nombre = hc.GrupoNombre
        AND g.Activo = 1
    )
  )
    THROW 51015, 'Faltan lecciones activas del Excel.', 1;

  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    COUNT(*) AS AsignacionesActivas
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
  GROUP BY g.Nombre, m.Codigo, m.Nombre
  ORDER BY g.Nombre, m.Codigo;

  SELECT
    CASE hg.DiaSemana
      WHEN 2 THEN N'Lunes'
      WHEN 3 THEN N'Martes'
      WHEN 4 THEN N'Miercoles'
      WHEN 5 THEN N'Jueves'
      WHEN 6 THEN N'Viernes'
    END AS Dia,
    CASE hg.BloqueHorarioId
      WHEN 0 THEN 1
      WHEN 1 THEN 2
      WHEN 2 THEN 3
      WHEN 13 THEN 4
      WHEN 14 THEN 5
      WHEN 15 THEN 6
      WHEN 17 THEN 7
      WHEN 18 THEN 8
      WHEN 19 THEN 9
      WHEN 21 THEN 10
      WHEN 22 THEN 11
      WHEN 23 THEN 12
    END AS LeccionExcel,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.HorarioGrupo hg
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = canon.GrupoId
  INNER JOIN dbo.Materia m
    ON m.MateriaId = canon.MateriaId
  WHERE hg.Activo = 1
  ORDER BY
    hg.DiaSemana,
    CASE hg.BloqueHorarioId
      WHEN 0 THEN 1
      WHEN 1 THEN 2
      WHEN 2 THEN 3
      WHEN 13 THEN 4
      WHEN 14 THEN 5
      WHEN 15 THEN 6
      WHEN 17 THEN 7
      WHEN 18 THEN 8
      WHEN 19 THEN 9
      WHEN 21 THEN 10
      WHEN 22 THEN 11
      WHEN 23 THEN 12
      ELSE 99
    END,
    g.Nombre,
    m.Codigo;

  /*
    Informativo: combinaciones compartidas con otros profesores. No bloquea.
  */
  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    u.Correo AS OtroProfesorActivo
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Objetivos o
    ON o.GrupoId = ad.GrupoId
   AND o.MateriaId = ad.MateriaId
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m
    ON m.MateriaId = ad.MateriaId
  INNER JOIN dbo.Usuario u
    ON u.UsuarioId = ad.UsuarioId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId <> @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre, m.Codigo, u.Correo;

  SELECT
    (SELECT COUNT(*)
     FROM dbo.AsignacionDocente ad
     WHERE ad.InstitucionId = @InstitucionId
       AND ad.UsuarioId = @UsuarioId
       AND ad.AnioLectivoId = @AnioLectivoId
       AND ad.PeriodoId = @PeriodoId
       AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
       AND ad.Activo = 1) AS AsignacionesActivasEsperadas13,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN @GrupoMateriaCanonico canon
       ON canon.GrupoMateriaId = hg.GrupoMateriaId
     WHERE hg.Activo = 1) AS LeccionesActivasEsperadas60,
    (SELECT COUNT(*)
     FROM (
       SELECT
         hg.GrupoMateriaId,
         hg.DiaSemana,
         hg.BloqueHorarioId
       FROM dbo.HorarioGrupo hg
       INNER JOIN @GrupoMateriaCanonico canon
         ON canon.GrupoMateriaId = hg.GrupoMateriaId
       WHERE hg.Activo = 1
       GROUP BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
       HAVING COUNT(*) > 1
     ) duplicados) AS DuplicadosExactosEsperados0;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: horario de Andres Morun corregido segun Excel.' AS Resultado;
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
