/*
  INCLUIR HORARIO - ERICK VILLALOBOS
  Sustituye a: Johanna / Johana Mendez Palma
  Fuente: Horario_Profesora_Mendez_Palma_Johanna_Marzo_2026.xlsx
  Periodo objetivo: II Periodo, ano lectivo 2026

  IMPORTANTE:
  - @Aplicar = 0 ejecuta simulacion y revierte todo.
  - Cambie @Aplicar a 1 solo despues de revisar los resultados.
  - Reemplace @CorreoErick antes de ejecutar.
  - @CorreoDocenteSustituida es opcional. Si se llena, inactiva para esa
    docente las mismas combinaciones que se asignan a Erick.
  - No crea usuarios, materias ni secciones/grupos.
  - Expande 12-1/12-2 a 12-1 y 12-2.
  - No valida como error que un profesor tenga mas de una seccion/materia
    en la misma leccion.
  - Solo elimina duplicados exactos de seccion/materia/dia/bloque.

  Nota tecnica:
  HorarioGrupo pertenece a GrupoMateria, no directamente al profesor. Las
  combinaciones 12-1 / PrRu y 12-2 / PrRu estan compartidas con otros
  docentes activos. Si se aplica, el horario de esas combinaciones se ajusta
  para todos los docentes que compartan esa seccion/materia.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @CorreoErick NVARCHAR(320) = N'PENDIENTE_CORREO_ERICK@mep.go.cr';
DECLARE @CorreoDocenteSustituida NVARCHAR(320) = N''; -- Opcional: correo de Johanna/Johana si existe en BD.
DECLARE @LimpiarAsignacionesErickFueraMapa BIT = 1;
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';

DECLARE @UsuarioErickId INT;
DECLARE @UsuarioSustituidaId INT;
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
  Materias:
    PrRu = Proyectos Rurales
    GeAB = Gestion alimentos y bebidas

  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles.

  BloqueHorarioId:
    0, 1, 2    = lecciones 1, 2, 3
    13, 14, 15 = lecciones 4, 5, 6
    17, 18, 19 = lecciones 7, 8, 9
    21, 22, 23 = lecciones 10, 11, 12
*/
INSERT INTO @HorarioCorrecto (
  GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId
)
VALUES
  /* Lunes: 12-1/12-2 PrRu lecciones 1-6. */
  (N'12-1', N'PrRu', 2, 0),
  (N'12-1', N'PrRu', 2, 1),
  (N'12-1', N'PrRu', 2, 2),
  (N'12-1', N'PrRu', 2, 13),
  (N'12-1', N'PrRu', 2, 14),
  (N'12-1', N'PrRu', 2, 15),
  (N'12-2', N'PrRu', 2, 0),
  (N'12-2', N'PrRu', 2, 1),
  (N'12-2', N'PrRu', 2, 2),
  (N'12-2', N'PrRu', 2, 13),
  (N'12-2', N'PrRu', 2, 14),
  (N'12-2', N'PrRu', 2, 15),

  /* Lunes: 11-4 GeAB lecciones 7-12. */
  (N'11-4', N'GeAB', 2, 17),
  (N'11-4', N'GeAB', 2, 18),
  (N'11-4', N'GeAB', 2, 19),
  (N'11-4', N'GeAB', 2, 21),
  (N'11-4', N'GeAB', 2, 22),
  (N'11-4', N'GeAB', 2, 23),

  /* Martes: 12-1/12-2 PrRu lecciones 1-12. */
  (N'12-1', N'PrRu', 3, 0),
  (N'12-1', N'PrRu', 3, 1),
  (N'12-1', N'PrRu', 3, 2),
  (N'12-1', N'PrRu', 3, 13),
  (N'12-1', N'PrRu', 3, 14),
  (N'12-1', N'PrRu', 3, 15),
  (N'12-1', N'PrRu', 3, 17),
  (N'12-1', N'PrRu', 3, 18),
  (N'12-1', N'PrRu', 3, 19),
  (N'12-1', N'PrRu', 3, 21),
  (N'12-1', N'PrRu', 3, 22),
  (N'12-1', N'PrRu', 3, 23),
  (N'12-2', N'PrRu', 3, 0),
  (N'12-2', N'PrRu', 3, 1),
  (N'12-2', N'PrRu', 3, 2),
  (N'12-2', N'PrRu', 3, 13),
  (N'12-2', N'PrRu', 3, 14),
  (N'12-2', N'PrRu', 3, 15),
  (N'12-2', N'PrRu', 3, 17),
  (N'12-2', N'PrRu', 3, 18),
  (N'12-2', N'PrRu', 3, 19),
  (N'12-2', N'PrRu', 3, 21),
  (N'12-2', N'PrRu', 3, 22),
  (N'12-2', N'PrRu', 3, 23),

  /* Miercoles: 11-4 GeAB lecciones 1-6. */
  (N'11-4', N'GeAB', 4, 0),
  (N'11-4', N'GeAB', 4, 1),
  (N'11-4', N'GeAB', 4, 2),
  (N'11-4', N'GeAB', 4, 13),
  (N'11-4', N'GeAB', 4, 14),
  (N'11-4', N'GeAB', 4, 15);

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

DECLARE @AsignacionesErickFueraMapa TABLE (
  AsignacionDocenteId INT NOT NULL PRIMARY KEY,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NULL,
  MateriaNombre NVARCHAR(200) NULL
);

DECLARE @AsignacionesSustituidaInactivadas TABLE (
  AsignacionDocenteId INT NOT NULL PRIMARY KEY,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NULL,
  MateriaNombre NVARCHAR(200) NULL
);

BEGIN TRY
  BEGIN TRAN;

  IF LOWER(@CorreoErick) LIKE N'%pendiente%'
     OR LTRIM(RTRIM(@CorreoErick)) = N''
    THROW 51200, 'Debe reemplazar @CorreoErick con el correo real de Erick Villalobos antes de ejecutar.', 1;

  SELECT TOP (1)
    @UsuarioErickId = u.UsuarioId
  FROM dbo.Usuario u
  WHERE u.InstitucionId = @InstitucionId
    AND LOWER(LTRIM(RTRIM(u.Correo))) = LOWER(LTRIM(RTRIM(@CorreoErick)))
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

  IF @UsuarioErickId IS NULL
    THROW 51201, 'No se encontro un usuario activo para @CorreoErick.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51202, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51203, 'No se encontro el II Periodo del ano lectivo 2026.', 1;
  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 48
    THROW 51204, 'El mapa no contiene los 48 horarios esperados al expandir 12-1/12-2.', 1;

  IF LTRIM(RTRIM(ISNULL(@CorreoDocenteSustituida, N''))) <> N''
  BEGIN
    SELECT TOP (1)
      @UsuarioSustituidaId = u.UsuarioId
    FROM dbo.Usuario u
    WHERE u.InstitucionId = @InstitucionId
      AND LOWER(LTRIM(RTRIM(u.Correo))) = LOWER(LTRIM(RTRIM(@CorreoDocenteSustituida)))
      AND u.Activo = 1;

    IF @UsuarioSustituidaId IS NULL
      THROW 51205, 'Se lleno @CorreoDocenteSustituida, pero no se encontro esa docente activa.', 1;
  END;

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
    THROW 51206, 'Falta una materia requerida. El script no crea materias.', 1;
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
    THROW 51207, 'Falta una seccion requerida. El script no crea grupos.', 1;
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
    THROW 51208, 'Falta un bloque horario requerido.', 1;
  END;

  INSERT INTO @Objetivos (
    GrupoId, MateriaId, GrupoNombre, MateriaCodigo
  )
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

  IF (SELECT COUNT(*) FROM @Objetivos) <> 3
    THROW 51209, 'El mapa no contiene las 3 combinaciones seccion/materia esperadas.', 1;

  IF @LimpiarAsignacionesErickFueraMapa = 1
  BEGIN
    INSERT INTO @AsignacionesErickFueraMapa (
      AsignacionDocenteId, GrupoNombre, MateriaCodigo, MateriaNombre
    )
    SELECT ad.AsignacionDocenteId, g.Nombre, m.Codigo, m.Nombre
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    LEFT JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioErickId
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

    UPDATE ad
    SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
    FROM dbo.AsignacionDocente ad
    INNER JOIN @AsignacionesErickFueraMapa fuera
      ON fuera.AsignacionDocenteId = ad.AsignacionDocenteId;
  END;

  IF @UsuarioSustituidaId IS NOT NULL
  BEGIN
    INSERT INTO @AsignacionesSustituidaInactivadas (
      AsignacionDocenteId, GrupoNombre, MateriaCodigo, MateriaNombre
    )
    SELECT ad.AsignacionDocenteId, g.Nombre, m.Codigo, m.Nombre
    FROM dbo.AsignacionDocente ad
    INNER JOIN @Objetivos o
      ON o.GrupoId = ad.GrupoId
     AND o.MateriaId = ad.MateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioSustituidaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1;

    UPDATE ad
    SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
    FROM dbo.AsignacionDocente ad
    INNER JOIN @AsignacionesSustituidaInactivadas sust
      ON sust.AsignacionDocenteId = ad.AsignacionDocenteId;
  END;

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

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 3
    THROW 51210, 'No se prepararon las 3 GrupoMateria canonicas.', 1;

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
      AND ad.UsuarioId = @UsuarioErickId
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
    @InstitucionId, @UsuarioErickId, o.GrupoId, o.MateriaId,
    @AnioLectivoId, @PeriodoId, N'PROFESOR_MATERIA',
    1, SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioErickId
      AND ad.GrupoId = o.GrupoId
      AND ad.MateriaId = o.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  );

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
    INNER JOIN dbo.Grupo g ON g.GrupoId = canon.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = canon.MateriaId
    LEFT JOIN @HorarioCorrecto hc
      ON hc.GrupoNombre = g.Nombre
     AND hc.MateriaCodigo = m.Codigo
     AND hc.DiaSemana = hg.DiaSemana
     AND hc.BloqueHorarioId = hg.BloqueHorarioId
    WHERE hg.Activo = 1
  )
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN HorariosObjetivo ho
    ON ho.HorarioGrupoId = hg.HorarioGrupoId
  WHERE ho.EnMapa = 0
     OR ho.rn > 1;

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
    INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
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
  SET hg.Activo = 1, hg.UpdatedAt = SYSDATETIME()
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
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
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

  IF NOT EXISTS (
    SELECT 1
    FROM @Objetivos o
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.AsignacionDocente ad
      WHERE ad.InstitucionId = @InstitucionId
        AND ad.UsuarioId = @UsuarioErickId
        AND ad.GrupoId = o.GrupoId
        AND ad.MateriaId = o.MateriaId
        AND ad.AnioLectivoId = @AnioLectivoId
        AND ad.PeriodoId = @PeriodoId
        AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
        AND ad.Activo = 1
    )
  )
    SELECT 1 AS ObjetivosAsignadosOk;
  ELSE
    THROW 51211, 'Faltan asignaciones activas objetivo para Erick.', 1;

  IF @LimpiarAsignacionesErickFueraMapa = 1
     AND (
       SELECT COUNT(*)
       FROM dbo.AsignacionDocente ad
       WHERE ad.InstitucionId = @InstitucionId
         AND ad.UsuarioId = @UsuarioErickId
         AND ad.AnioLectivoId = @AnioLectivoId
         AND ad.PeriodoId = @PeriodoId
         AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
         AND ad.Activo = 1
     ) <> 3
    THROW 51212, 'Erick no quedo con exactamente 3 asignaciones activas.', 1;

  IF EXISTS (
    SELECT ad.GrupoId, ad.MateriaId
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioErickId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
    GROUP BY ad.GrupoId, ad.MateriaId
    HAVING COUNT(*) > 1
  )
    THROW 51213, 'Erick quedo con asignaciones duplicadas.', 1;

  IF (
    SELECT COUNT(*)
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
  ) <> 48
    THROW 51214, 'El horario objetivo no quedo con exactamente 48 registros activos.', 1;

  IF EXISTS (
    SELECT hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
    GROUP BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51215, 'El horario final conserva duplicados exactos.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon ON canon.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = canon.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = canon.MateriaId
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
    THROW 51216, 'Quedaron horarios activos fuera del Excel para las combinaciones objetivo.', 1;

  IF EXISTS (
    SELECT 1
    FROM @HorarioCorrecto hc
    WHERE NOT EXISTS (
      SELECT 1
      FROM dbo.Grupo g
      INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
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
    THROW 51217, 'Faltan horarios activos del Excel.', 1;

  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    COUNT(*) AS AsignacionesActivas
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioErickId
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
      WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 3
      WHEN 13 THEN 4 WHEN 14 THEN 5 WHEN 15 THEN 6
      WHEN 17 THEN 7 WHEN 18 THEN 8 WHEN 19 THEN 9
      WHEN 21 THEN 10 WHEN 22 THEN 11 WHEN 23 THEN 12
    END AS LeccionExcel,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.HorarioGrupo hg
  INNER JOIN @GrupoMateriaCanonico canon ON canon.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = canon.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = canon.MateriaId
  WHERE hg.Activo = 1
  ORDER BY hg.DiaSemana, LeccionExcel, g.Nombre, m.Codigo;

  SELECT GrupoNombre AS Seccion, MateriaCodigo, MateriaNombre AS Materia
  FROM @AsignacionesErickFueraMapa
  ORDER BY GrupoNombre, MateriaCodigo;

  SELECT GrupoNombre AS Seccion, MateriaCodigo, MateriaNombre AS Materia
  FROM @AsignacionesSustituidaInactivadas
  ORDER BY GrupoNombre, MateriaCodigo;

  SELECT
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    u.Correo AS OtroProfesorActivo
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Objetivos o
    ON o.GrupoId = ad.GrupoId
   AND o.MateriaId = ad.MateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId <> @UsuarioErickId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre, m.Codigo, u.Correo;

  SELECT
    (SELECT COUNT(*)
     FROM dbo.AsignacionDocente ad
     WHERE ad.InstitucionId = @InstitucionId
       AND ad.UsuarioId = @UsuarioErickId
       AND ad.AnioLectivoId = @AnioLectivoId
       AND ad.PeriodoId = @PeriodoId
       AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
       AND ad.Activo = 1) AS AsignacionesActivasErick,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN @GrupoMateriaCanonico canon
       ON canon.GrupoMateriaId = hg.GrupoMateriaId
     WHERE hg.Activo = 1) AS HorariosActivosEsperados48,
    (SELECT COUNT(*)
     FROM (
       SELECT hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
       FROM dbo.HorarioGrupo hg
       INNER JOIN @GrupoMateriaCanonico canon
         ON canon.GrupoMateriaId = hg.GrupoMateriaId
       WHERE hg.Activo = 1
       GROUP BY hg.GrupoMateriaId, hg.DiaSemana, hg.BloqueHorarioId
       HAVING COUNT(*) > 1
     ) duplicados) AS DuplicadosExactosEsperados0,
    @LimpiarAsignacionesErickFueraMapa AS LimpiarAsignacionesErickFueraMapa;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: horario de Erick Villalobos incluido segun Excel.' AS Resultado;
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
