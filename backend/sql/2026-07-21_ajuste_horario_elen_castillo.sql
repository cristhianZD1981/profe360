/*
  Ajuste de horario docente:
  Profesora Castillo Calderon Elen Lorena
  Correo: elen.castillo.calderon@mep.go.cr
  Referencia: Horario #3, marzo 2026

  Materias del horario correcto:
  - Inco: Ingles conversacional.
  - Ingl: Ingles.

  Importante:
  - Se asume el II Periodo del ano lectivo 2026.
  - @Aplicar = 0 simula y revierte toda la transaccion.
  - Cambie @Aplicar a 1 despues de revisar los resultados.
  - No se crean filas en dbo.Grupo.
  - Los duplicados se desactivan, no se borran fisicamente.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(150) = N'elen.castillo.calderon@mep.go.cr';
DECLARE @AnioNombre NVARCHAR(50) = N'2026';
DECLARE @PeriodoNombre NVARCHAR(50) = N'II Periodo';
DECLARE @MateriaConversacionalCodigo NVARCHAR(50) = N'Inco';
DECLARE @MateriaInglesCodigo NVARCHAR(50) = N'Ingl';

DECLARE @UsuarioId INT;
DECLARE @AnioLectivoId INT;
DECLARE @PeriodoId INT;
DECLARE @MateriaConversacionalId INT;
DECLARE @MateriaInglesId INT;

DECLARE @Secciones TABLE (
  GrupoNombre NVARCHAR(100) NOT NULL PRIMARY KEY
);

INSERT INTO @Secciones (GrupoNombre)
VALUES
  (N'8-1'), (N'8-2'), (N'8-3'), (N'8-4'), (N'8-5'), (N'8-6'),
  (N'9-2'), (N'10-1'), (N'10-2'), (N'10-3'), (N'10-4');

DECLARE @MateriasObjetivo TABLE (
  MateriaCodigo NVARCHAR(50) NOT NULL PRIMARY KEY,
  MateriaId INT NOT NULL
);

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

  Bloques:
    0, 1, 2 = lecciones 1, 2, 3
    13, 14, 15 = lecciones 4, 5, 6
    17, 18, 19 = lecciones 7, 8, 9
    21, 22, 23 = lecciones 10, 11, 12

  Jueves: las lecciones 9 y 10 quedan libres.
*/

INSERT INTO @HorarioCorrecto (GrupoNombre, MateriaCodigo, DiaSemana, BloqueHorarioId)
VALUES
  /* Lunes: Ingles conversacional. */
  (N'8-4', N'Inco', 2, 0),  (N'8-4', N'Inco', 2, 1),  (N'8-4', N'Inco', 2, 2),
  (N'8-4', N'Inco', 2, 13), (N'8-4', N'Inco', 2, 14), (N'8-4', N'Inco', 2, 15),
  (N'9-2', N'Inco', 2, 17), (N'9-2', N'Inco', 2, 18), (N'9-2', N'Inco', 2, 19),
  (N'9-2', N'Inco', 2, 21), (N'9-2', N'Inco', 2, 22), (N'9-2', N'Inco', 2, 23),

  /* Martes: Ingles conversacional. */
  (N'8-2', N'Inco', 3, 0),  (N'8-2', N'Inco', 3, 1),  (N'8-2', N'Inco', 3, 2),
  (N'8-2', N'Inco', 3, 13), (N'8-2', N'Inco', 3, 14), (N'8-2', N'Inco', 3, 15),
  (N'8-6', N'Inco', 3, 17), (N'8-6', N'Inco', 3, 18), (N'8-6', N'Inco', 3, 19),
  (N'8-6', N'Inco', 3, 21), (N'8-6', N'Inco', 3, 22), (N'8-6', N'Inco', 3, 23),

  /* Miercoles: Ingles conversacional. */
  (N'8-3', N'Inco', 4, 0),  (N'8-3', N'Inco', 4, 1),  (N'8-3', N'Inco', 4, 2),
  (N'8-3', N'Inco', 4, 13), (N'8-3', N'Inco', 4, 14), (N'8-3', N'Inco', 4, 15),
  (N'8-5', N'Inco', 4, 17), (N'8-5', N'Inco', 4, 18), (N'8-5', N'Inco', 4, 19),
  (N'8-5', N'Inco', 4, 21), (N'8-5', N'Inco', 4, 22), (N'8-5', N'Inco', 4, 23),

  /* Jueves: Ingles para 10-1, 10-2, 10-3 y 10-4. */
  (N'10-3', N'Ingl', 5, 0),  (N'10-3', N'Ingl', 5, 1),
  (N'10-1', N'Ingl', 5, 2),
  (N'10-1', N'Ingl', 5, 13),
  (N'10-2', N'Ingl', 5, 14), (N'10-2', N'Ingl', 5, 15),
  (N'10-4', N'Ingl', 5, 17), (N'10-4', N'Ingl', 5, 18),
  (N'10-4', N'Ingl', 5, 22), (N'10-4', N'Ingl', 5, 23),

  /* Viernes: Ingles en 10-1 a 10-4, conversacional en 8-1. */
  (N'10-3', N'Ingl', 6, 0),  (N'10-3', N'Ingl', 6, 1),
  (N'10-1', N'Ingl', 6, 2),
  (N'10-1', N'Ingl', 6, 13),
  (N'10-2', N'Ingl', 6, 14), (N'10-2', N'Ingl', 6, 15),
  (N'8-1', N'Inco', 6, 17),  (N'8-1', N'Inco', 6, 18), (N'8-1', N'Inco', 6, 19),
  (N'8-1', N'Inco', 6, 21),  (N'8-1', N'Inco', 6, 22), (N'8-1', N'Inco', 6, 23);

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

  SELECT TOP 1 @MateriaConversacionalId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Activa = 1
    AND m.Codigo = @MateriaConversacionalCodigo;

  SELECT TOP 1 @MateriaInglesId = m.MateriaId
  FROM dbo.Materia m
  WHERE m.InstitucionId = @InstitucionId
    AND m.Activa = 1
    AND m.Codigo = @MateriaInglesCodigo;

  IF @UsuarioId IS NULL
    THROW 51000, 'No se encontro la docente activa con el correo indicado.', 1;
  IF @AnioLectivoId IS NULL
    THROW 51001, 'No se encontro el ano lectivo 2026.', 1;
  IF @PeriodoId IS NULL
    THROW 51002, 'No se encontro el II Periodo de 2026.', 1;
  IF @MateriaConversacionalId IS NULL
    THROW 51003, 'No se encontro la materia Inco.', 1;
  IF @MateriaInglesId IS NULL
    THROW 51004, 'No se encontro la materia Ingl.', 1;
  IF @MateriaConversacionalId = @MateriaInglesId
    THROW 51005, 'Las materias Inco e Ingl no pueden ser la misma.', 1;

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
    THROW 51006, 'Faltan secciones. El script no crea secciones nuevas.', 1;
  END;

  INSERT INTO @MateriasObjetivo (MateriaCodigo, MateriaId)
  VALUES
    (@MateriaConversacionalCodigo, @MateriaConversacionalId),
    (@MateriaInglesCodigo, @MateriaInglesId);

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
    THROW 51007, 'Faltan bloques horarios.', 1;
  END;

  /* Reactiva o crea GrupoMateria para las combinaciones del horario correcto. */
  UPDATE gm
  SET gm.Activo = 1, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @HorarioCorrecto hc ON hc.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  WHERE gm.MateriaId = mo.MateriaId
    AND gm.PeriodoId = @PeriodoId
    AND gm.Activo = 0;

  INSERT INTO dbo.GrupoMateria (GrupoId, MateriaId, PeriodoId, Activo, CreatedAt)
  SELECT DISTINCT
    g.GrupoId,
    mo.MateriaId,
    @PeriodoId,
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
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = g.GrupoId
      AND gm.MateriaId = mo.MateriaId
      AND ISNULL(gm.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
  );

  /* Conserva el GrupoMateria mas antiguo por grupo, materia y periodo. */
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
    WHERE gm.PeriodoId = @PeriodoId
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
    WHERE gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
  )
  UPDATE gm
  SET gm.Activo = 0, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Duplicados d ON d.GrupoMateriaId = gm.GrupoMateriaId
  WHERE d.rn > 1;

  /* Desactiva asignaciones antiguas de Inco/Ingl para estas secciones. */
  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND (ad.PeriodoId = @PeriodoId OR ad.PeriodoId IS NULL);

  /* Reactiva las asignaciones correctas e inserta las que no existan. */
  UPDATE ad
  SET ad.Activo = 1, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @HorarioCorrecto hc ON hc.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaCodigo = hc.MateriaCodigo
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.GrupoId = g.GrupoId
    AND ad.MateriaId = mo.MateriaId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA';

  INSERT INTO dbo.AsignacionDocente (
    InstitucionId, UsuarioId, GrupoId, MateriaId, AnioLectivoId,
    PeriodoId, TipoAsignacion, Activo, CreatedAt
  )
  SELECT DISTINCT
    @InstitucionId,
    @UsuarioId,
    g.GrupoId,
    mo.MateriaId,
    @AnioLectivoId,
    @PeriodoId,
    N'PROFESOR_MATERIA',
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
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.GrupoId = g.GrupoId
      AND ad.MateriaId = mo.MateriaId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ISNULL(ad.PeriodoId, 0) = ISNULL(@PeriodoId, 0)
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
  );

  /* Desactiva horarios del mismo profesor que pertenecen a otro periodo. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE gm.Activo = 1
    AND ISNULL(gm.PeriodoId, 0) <> ISNULL(@PeriodoId, 0)
    AND hg.Activo = 1;

  UPDATE gm
  SET gm.Activo = 0, gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE gm.Activo = 1
    AND ISNULL(gm.PeriodoId, 0) <> ISNULL(@PeriodoId, 0)
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.AsignacionDocente ad
      WHERE ad.GrupoId = gm.GrupoId
        AND ad.MateriaId = gm.MateriaId
        AND ad.AnioLectivoId = @AnioLectivoId
        AND ad.Activo = 1
    );

  /* Desactiva combinaciones de materia que no pertenecen al horario correcto. */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
    AND hg.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @HorarioCorrecto hc
      WHERE hc.GrupoNombre = g.Nombre
        AND hc.MateriaCodigo = mo.MateriaCodigo
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
  WHERE gm.PeriodoId = @PeriodoId;

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
    WHERE gm.PeriodoId = @PeriodoId
      AND gm.Activo = 1
      AND hg.Activo = 1
  )
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.HorarioGrupoId = hg.HorarioGrupoId
  WHERE d.rn > 1;

  /* Verificacion de asignaciones: solo deben quedar las combinaciones del mapa. */
  SELECT
    N'Asignacion activa' AS Verificacion,
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia,
    ad.PeriodoId,
    ad.Activo
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre, m.Codigo;

  SELECT
    N'Asignaciones fuera del mapa' AS Verificacion,
    COUNT(*) AS Total
  FROM dbo.AsignacionDocente ad
  INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = ad.MateriaId
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM @HorarioCorrecto hc
      WHERE hc.GrupoNombre = g.Nombre
        AND hc.MateriaCodigo = mo.MateriaCodigo
    );

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
    g.Nombre AS Seccion,
    m.Codigo AS MateriaCodigo,
    m.Nombre AS Materia
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
  INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
  INNER JOIN @Secciones s ON s.GrupoNombre = g.Nombre
  INNER JOIN @MateriasObjetivo mo ON mo.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND gm.Activo = 1
    AND hg.Activo = 1
  ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre, m.Codigo;

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
