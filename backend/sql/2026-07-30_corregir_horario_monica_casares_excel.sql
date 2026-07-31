/*
  CORRECCION DE HORARIO - MONICA CASARES CORREA
  Correo: monica.casares.correa@mep.go.cr
  Fuente: Horario_Profesora_Casares_Correa_Monica_Marzo_2026.xlsx
  Periodo objetivo: II Periodo, ano lectivo 2026

  IMPORTANTE:
  - @Aplicar = 0 ejecuta simulacion y revierte todo.
  - Cambie @Aplicar a 1 solo despues de revisar los resultados.
  - No crea materias.
  - No crea secciones/grupos.
  - No crea grupos combinados como 11-1/11-2; expande a secciones
    individuales porque la BD usa secciones oficiales separadas.
  - No valida como error que una profesora tenga mas de una seccion/materia
    en la misma leccion.
  - Solo elimina duplicados exactos de seccion/materia/dia/bloque.
  - Para Monica deja activas solo las 14 combinaciones del Excel.

  Nota tecnica:
  HorarioGrupo pertenece a GrupoMateria, no directamente al profesor. Por eso
  el script no toca HorarioGrupo de combinaciones que solo se quitan de Monica
  y quedan compartidas con otra persona, como 12-2 / GeCt.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(320) = N'monica.casares.correa@mep.go.cr';
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';

DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;

DECLARE @Bloques TABLE (
  LeccionExcel INT NOT NULL PRIMARY KEY,
  BloqueHorarioId INT NOT NULL UNIQUE
);

INSERT INTO @Bloques (LeccionExcel, BloqueHorarioId)
VALUES
  (1, 0), (2, 1), (3, 2),
  (4, 13), (5, 14), (6, 15),
  (7, 17), (8, 18), (9, 19),
  (10, 21), (11, 22), (12, 23);

DECLARE @Tramos TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  LeccionDesde INT NOT NULL,
  LeccionHasta INT NOT NULL
);

/*
  Materias:
    EOAF = English oriented accounting and finance
    EOTF = English oriented to accounting
    EOAL = English oriented to agricultural and livestock production
    EOPS = English oriented to productive processes and safety inspection
           in food industry

  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles,
    5 = jueves, 6 = viernes.
*/
INSERT INTO @Tramos (
  GrupoNombre, MateriaCodigo, DiaSemana, LeccionDesde, LeccionHasta
)
VALUES
  /* Lunes. */
  (N'11-1', N'EOAF', 2, 1, 6),
  (N'11-2', N'EOAF', 2, 1, 6),
  (N'10-3', N'EOPS', 2, 7, 12),

  /* Martes. */
  (N'12-3', N'EOTF', 3, 1, 6),
  (N'10-2', N'EOTF', 3, 7, 12),

  /* Miercoles. */
  (N'12-1', N'EOTF', 4, 1, 6),
  (N'12-2', N'EOTF', 4, 1, 6),
  (N'10-1', N'EOTF', 4, 7, 12),

  /* Jueves. */
  (N'11-3', N'EOAL', 5, 1, 6),
  (N'11-4', N'EOAL', 5, 1, 6),
  (N'12-1', N'EOTF', 5, 7, 12),
  (N'12-2', N'EOTF', 5, 7, 12),

  /* Viernes. */
  (N'12-1', N'EOPS', 6, 1, 6),
  (N'12-2', N'EOPS', 6, 1, 6),
  (N'11-1', N'EOPS', 6, 7, 12),
  (N'11-2', N'EOPS', 6, 7, 12);

DECLARE @HorarioCorrecto TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
);

INSERT INTO @HorarioCorrecto (
  GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId
)
SELECT
  t.GrupoNombre,
  t.MateriaCodigo,
  t.DiaSemana,
  b.BloqueHorarioId
FROM @Tramos t
INNER JOIN @Bloques b
  ON b.LeccionExcel BETWEEN t.LeccionDesde AND t.LeccionHasta;

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

DECLARE @AsignacionesFueraMapa TABLE (
  AsignacionDocenteId INT NOT NULL PRIMARY KEY,
  GrupoNombre NVARCHAR(100) NOT NULL,
  MateriaCodigo NVARCHAR(50) NULL,
  MateriaNombre NVARCHAR(200) NULL
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
    THROW 51100, 'No se encontro la profesora activa con el correo indicado.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51101, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51102, 'No se encontro el II Periodo del ano lectivo 2026.', 1;
  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 96
    THROW 51103, 'El mapa no contiene los 96 horarios esperados al expandir secciones combinadas.', 1;

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

    THROW 51104, 'Falta una materia requerida. El script no crea materias.', 1;
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

    THROW 51105, 'Falta una seccion requerida. El script no crea grupos.', 1;
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

    THROW 51106, 'Falta un bloque horario requerido.', 1;
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

  IF (SELECT COUNT(*) FROM @Objetivos) <> 14
    THROW 51107, 'El mapa no contiene las 14 combinaciones seccion/materia esperadas.', 1;

  INSERT INTO @AsignacionesFueraMapa (
    AsignacionDocenteId, GrupoNombre, MateriaCodigo, MateriaNombre
  )
  SELECT
    ad.AsignacionDocenteId,
    g.Nombre,
    m.Codigo,
    m.Nombre
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g
    ON g.GrupoId = ad.GrupoId
  LEFT JOIN dbo.Materia m
    ON m.MateriaId = ad.MateriaId
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
    Para Monica: inactiva asignaciones fuera del Excel. No modifica
    HorarioGrupo de esas combinaciones, para no afectar clases compartidas.
  */
  UPDATE ad
  SET
    ad.Activo = 0,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN @AsignacionesFueraMapa fuera
    ON fuera.AsignacionDocenteId = ad.AsignacionDocenteId;

  /*
    GrupoMateria: no duplicar. Si ya existe, reutilizar el menor id activo
    o reactivar el menor id existente. Si no existe ningun registro, crear uno.
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

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 14
    THROW 51108, 'No se prepararon las 14 GrupoMateria canonicas.', 1;

  /*
    Para Monica: deja una sola AsignacionDocente activa por seccion/materia.
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
    @InstitucionId, @UsuarioId, o.GrupoId, o.MateriaId,
    @AnioLectivoId, @PeriodoId, N'PROFESOR_MATERIA',
    1, SYSDATETIME()
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
    HorarioGrupo: ajustar solo las 14 combinaciones objetivo.
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
  ) <> 14
    THROW 51109, 'Monica no quedo con exactamente 14 asignaciones activas.', 1;

  IF EXISTS (
    SELECT 1
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
      )
  )
    THROW 51110, 'Monica quedo con asignaciones activas fuera del Excel.', 1;

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
    THROW 51111, 'Monica quedo con asignaciones duplicadas.', 1;

  IF (
    SELECT COUNT(*)
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
  ) <> 96
    THROW 51112, 'El horario objetivo no quedo con exactamente 96 registros activos.', 1;

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
    THROW 51113, 'El horario final conserva duplicados exactos.', 1;

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
    THROW 51114, 'Quedaron horarios activos fuera del Excel para las combinaciones objetivo.', 1;

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
    THROW 51115, 'Faltan horarios activos del Excel.', 1;

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
    b.LeccionExcel,
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
  INNER JOIN @Bloques b
    ON b.BloqueHorarioId = hg.BloqueHorarioId
  WHERE hg.Activo = 1
  ORDER BY hg.DiaSemana, b.LeccionExcel, g.Nombre, m.Codigo;

  SELECT
    GrupoNombre AS Seccion,
    MateriaCodigo,
    MateriaNombre AS Materia
  FROM @AsignacionesFueraMapa
  ORDER BY GrupoNombre, MateriaCodigo;

  /*
    Informativo: otros profesores activos en las combinaciones objetivo.
    No bloquea porque puede ser co-docencia, y Monica comparte el horario
    de la misma seccion/materia.
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
       AND ad.Activo = 1) AS AsignacionesActivasEsperadas14,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN @GrupoMateriaCanonico canon
       ON canon.GrupoMateriaId = hg.GrupoMateriaId
     WHERE hg.Activo = 1) AS HorariosActivosEsperados96,
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
    SELECT N'APLICADO: horario de Monica Casares corregido segun Excel.' AS Resultado;
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
