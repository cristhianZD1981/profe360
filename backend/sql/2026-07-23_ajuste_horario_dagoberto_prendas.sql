/*
  AJUSTE DE HORARIO - DAGOBERTO PRENDAS BERMUDEZ
  Correo: dagoberto.prendas.bermudez@mep.go.cr
  Periodo: II Periodo del ano lectivo 2026
  Materia: Ingl - Ingles

  Horario de la imagen:
    Lunes:
      1      7-2
      2-4    7-4
      5-6    7-2
      7-8    7-3
      9      Libre
      10     7-6
      11-12  Libre

    Jueves:
      1-2    Libre
      3-4    7-6
      5-6    Libre
      7-9    7-5
      10     Libre
      11     7-5
      12     7-3

    Martes, miercoles y viernes: libres.

  SEGURIDAD:
  - @Aplicar = 0 simula y revierte todos los cambios.
  - Cambie @Aplicar a 1 solamente despues de revisar los resultados.
  - No elimina registros fisicamente; desactiva los sobrantes.
  - No modifica horarios de otros profesores.
  - Si otra persona tiene activa una de estas mismas combinaciones
    grupo/materia, el script se detiene antes de cambiar datos.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(150) = N'dagoberto.prendas.bermudez@mep.go.cr';
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';
DECLARE @MateriaCodigo NVARCHAR(50) = N'Ingl';

DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;
DECLARE @MateriaId INT;

DECLARE @HorarioCorrecto TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL,
  DiaSemana INT NOT NULL,
  BloqueHorarioId INT NOT NULL,
  PRIMARY KEY (GrupoNombre, DiaSemana, BloqueHorarioId)
);

/*
  DiaSemana:
    2 = lunes, 3 = martes, 4 = miercoles, 5 = jueves, 6 = viernes.

  BloqueHorarioId usados por el sistema:
    0, 1, 2    = lecciones 1, 2, 3
    13, 14, 15 = lecciones 4, 5, 6
    17, 18, 19 = lecciones 7, 8, 9
    21, 22, 23 = lecciones 10, 11, 12
*/
INSERT INTO @HorarioCorrecto (GrupoNombre, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes. */
  (N'7-2', 2, 0),
  (N'7-4', 2, 1),
  (N'7-4', 2, 2),
  (N'7-4', 2, 13),
  (N'7-2', 2, 14),
  (N'7-2', 2, 15),
  (N'7-3', 2, 17),
  (N'7-3', 2, 18),
  (N'7-6', 2, 21),

  /* Jueves. */
  (N'7-6', 5, 2),
  (N'7-6', 5, 13),
  (N'7-5', 5, 17),
  (N'7-5', 5, 18),
  (N'7-5', 5, 19),
  (N'7-5', 5, 22),
  (N'7-3', 5, 23);

DECLARE @Objetivos TABLE (
  GrupoId INT NOT NULL,
  MateriaId INT NOT NULL,
  PRIMARY KEY (GrupoId, MateriaId)
);

DECLARE @CombinacionesAjustar TABLE (
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
    @MateriaId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Codigo = @MateriaCodigo
    AND m.Activa = 1;

  IF @UsuarioId IS NULL
    THROW 51000, 'No se encontro el profesor activo con el correo indicado.', 1;

  IF @AnioLectivoId IS NULL
    THROW 51001, 'No se encontro el ano lectivo 2026.', 1;

  IF @PeriodoId IS NULL
    THROW 51002, 'No se encontro el II Periodo del ano lectivo 2026.', 1;

  IF @MateriaId IS NULL
    THROW 51003, 'No se encontro la materia activa con codigo Ingl.', 1;

  IF (SELECT COUNT(*) FROM @HorarioCorrecto) <> 16
    THROW 51004, 'El mapa del horario no contiene las 16 lecciones esperadas.', 1;

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

    THROW 51005, 'Falta una seccion del horario. El script no crea secciones.', 1;
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

    THROW 51006, 'Falta un bloque horario requerido.', 1;
  END;

  INSERT INTO @Objetivos (GrupoId, MateriaId)
  SELECT DISTINCT g.GrupoId, @MateriaId
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1;

  /*
    Incluye las secciones correctas y cualquier seccion de Ingles que
    Dagoberto tuviera asignada anteriormente en este periodo.
  */
  INSERT INTO @CombinacionesAjustar (GrupoId, MateriaId)
  SELECT o.GrupoId, o.MateriaId
  FROM @Objetivos o;

  INSERT INTO @CombinacionesAjustar (GrupoId, MateriaId)
  SELECT DISTINCT ad.GrupoId, ad.MateriaId
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.MateriaId = @MateriaId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @CombinacionesAjustar ca
      WHERE ca.GrupoId = ad.GrupoId
        AND ca.MateriaId = ad.MateriaId
    );

  /*
    HorarioGrupo pertenece a grupo/materia, no directamente al profesor.
    Por eso se detiene si otra persona comparte una combinacion que se
    pretende ajustar.
  */
  IF EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    INNER JOIN @CombinacionesAjustar ca
      ON ca.GrupoId = ad.GrupoId
     AND ca.MateriaId = ad.MateriaId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
  )
  BEGIN
    SELECT
      g.Nombre AS Seccion,
      m.Codigo AS MateriaCodigo,
      u.Correo AS OtroProfesor
    FROM dbo.AsignacionDocente ad
    INNER JOIN @CombinacionesAjustar ca
      ON ca.GrupoId = ad.GrupoId
     AND ca.MateriaId = ad.MateriaId
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.Usuario u ON u.UsuarioId = ad.UsuarioId
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId <> @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
    ORDER BY g.Nombre, u.Correo;

    THROW 51007, 'Existe otro profesor activo en una combinacion que se debe ajustar. No se aplicaron cambios.', 1;
  END;

  /* Desactiva los horarios anteriores de las combinaciones de Dagoberto. */
  UPDATE hg
  SET
    hg.Activo = 0,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @CombinacionesAjustar ca
    ON ca.GrupoId = gm.GrupoId
   AND ca.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1;

  /* Desactiva solo las asignaciones de Ingles anteriores de Dagoberto. */
  UPDATE ad
  SET
    ad.Activo = 0,
    ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.MateriaId = @MateriaId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /*
    Deja un GrupoMateria canonico por cada seccion objetivo. Si existe,
    conserva el de menor id; si no existe, lo crea.
  */
  ;WITH Candidatos AS (
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
  INNER JOIN Candidatos c
    ON c.GrupoMateriaId = gm.GrupoMateriaId;

  INSERT INTO dbo.GrupoMateria (
    GrupoId, MateriaId, PeriodoId, Activo, CreatedAt
  )
  SELECT
    o.GrupoId, o.MateriaId, @PeriodoId, 1, SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = o.GrupoId
      AND gm.MateriaId = o.MateriaId
      AND gm.PeriodoId = @PeriodoId
  );

  INSERT INTO @GrupoMateriaCanonico (GrupoId, MateriaId, GrupoMateriaId)
  SELECT
    o.GrupoId,
    o.MateriaId,
    MIN(gm.GrupoMateriaId)
  FROM @Objetivos o
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = o.GrupoId
   AND gm.MateriaId = o.MateriaId
   AND gm.PeriodoId = @PeriodoId
   AND gm.Activo = 1
  GROUP BY o.GrupoId, o.MateriaId;

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 5
    THROW 51008, 'No se pudieron preparar las cinco secciones de Ingles.', 1;

  /* Reactiva una sola asignacion existente por seccion, cuando exista. */
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
  INNER JOIN Candidatas c
    ON c.AsignacionDocenteId = ad.AsignacionDocenteId;

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
    o.GrupoId,
    o.MateriaId,
    @AnioLectivoId,
    @PeriodoId,
    N'PROFESOR_MATERIA',
    1,
    SYSDATETIME()
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
    Reactiva un solo HorarioGrupo si ya existia el bloque correcto.
    Los duplicados del mismo bloque quedan inactivos.
  */
  ;WITH HorariosExistentes AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS rn
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN dbo.GrupoMateria gm
      ON gm.GrupoMateriaId = canon.GrupoMateriaId
    INNER JOIN dbo.Grupo g
      ON g.GrupoId = gm.GrupoId
    INNER JOIN @HorarioCorrecto hc
      ON hc.GrupoNombre = g.Nombre
     AND hc.DiaSemana = hg.DiaSemana
     AND hc.BloqueHorarioId = hg.BloqueHorarioId
  )
  UPDATE hg
  SET
    hg.Activo = CASE WHEN he.rn = 1 THEN 1 ELSE 0 END,
    hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN HorariosExistentes he
    ON he.HorarioGrupoId = hg.HorarioGrupoId;

  INSERT INTO dbo.HorarioGrupo (
    GrupoMateriaId,
    BloqueHorarioId,
    DiaSemana,
    Activo,
    CreatedAt
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
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = g.GrupoId
   AND canon.MateriaId = @MateriaId
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    WHERE hg.GrupoMateriaId = canon.GrupoMateriaId
      AND hg.BloqueHorarioId = hc.BloqueHorarioId
      AND hg.DiaSemana = hc.DiaSemana
      AND hg.Activo = 1
  );

  /* Verificacion 1: las cinco asignaciones correctas. */
  SELECT
    N'Asignaciones activas' AS Verificacion,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.MateriaId = @MateriaId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre;

  /* Verificacion 2: horario final ordenado por dia y leccion. */
  SELECT
    CASE hg.DiaSemana
      WHEN 2 THEN N'Lunes'
      WHEN 3 THEN N'Martes'
      WHEN 4 THEN N'Miercoles'
      WHEN 5 THEN N'Jueves'
      WHEN 6 THEN N'Viernes'
      ELSE CONCAT(N'Dia ', hg.DiaSemana)
    END AS Dia,
    bh.OrdenVisual AS Leccion,
    bh.Nombre AS Bloque,
    g.Nombre AS Seccion,
    m.Nombre AS Materia
  FROM dbo.AsignacionDocente ad
  INNER JOIN @Objetivos o
    ON o.GrupoId = ad.GrupoId
   AND o.MateriaId = ad.MateriaId
  INNER JOIN @GrupoMateriaCanonico canon
    ON canon.GrupoId = ad.GrupoId
   AND canon.MateriaId = ad.MateriaId
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.GrupoMateriaId = canon.GrupoMateriaId
   AND hg.Activo = 1
  INNER JOIN dbo.BloqueHorario bh
    ON bh.BloqueHorarioId = hg.BloqueHorarioId
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
  ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre;

  /* Verificacion 3: deben ser cinco asignaciones y dieciseis bloques. */
  SELECT
    (SELECT COUNT(*)
     FROM dbo.AsignacionDocente ad
     WHERE ad.InstitucionId = @InstitucionId
       AND ad.UsuarioId = @UsuarioId
       AND ad.AnioLectivoId = @AnioLectivoId
       AND ad.PeriodoId = @PeriodoId
       AND ad.MateriaId = @MateriaId
       AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
       AND ad.Activo = 1) AS AsignacionesActivasEsperadas5,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN @GrupoMateriaCanonico canon
       ON canon.GrupoMateriaId = hg.GrupoMateriaId
     WHERE hg.Activo = 1) AS BloquesActivosEsperados16;

  /* Verificacion 4: esta consulta debe devolver cero filas. */
  ;WITH HorarioProfesor AS (
    SELECT DISTINCT
      hg.DiaSemana,
      hg.BloqueHorarioId,
      gm.GrupoId,
      gm.MateriaId
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
  FROM HorarioProfesor
  GROUP BY DiaSemana, BloqueHorarioId
  HAVING COUNT(*) > 1;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: horario guardado correctamente.' AS Resultado;
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
