/*
  REINICIO LOGICO COMPLETO DEL HORARIO - VERSION 3
  Profesor: Andres Morun Garro
  Correo: andres.morun.garro@mep.go.cr
  Periodo: II Periodo del ano lectivo 2026

  Materias:
    Inco = Ingles conversacional
    Ingl = Ingles

  SEGURIDAD:
  - @Aplicar = 0 simula y revierte toda la transaccion.
  - Cambie @Aplicar a 1 solo despues de revisar las verificaciones.
  - No borra registros fisicamente: desactiva los anteriores.
  - No crea ni duplica registros en dbo.Grupo.
  - Conserva el GrupoMateria original para no separar evaluaciones y otros
    datos academicos; desactiva solamente sus duplicados.
  - No reutiliza horarios historicos: crea 60 filas de horario nuevas.
  - Deja exactamente un GrupoMateria y una AsignacionDocente activos por
    combinacion de seccion y materia.
  - Se detiene si otro profesor comparte una combinacion que debe ajustar.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar BIT = 0;
DECLARE @InstitucionId INT = 1;
DECLARE @Correo NVARCHAR(150) = N'andres.morun.garro@mep.go.cr';
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

  Bloques:
    0, 1, 2    = lecciones 1, 2, 3
    13, 14, 15 = lecciones 4, 5, 6
    17, 18, 19 = lecciones 7, 8, 9
    21, 22, 23 = lecciones 10, 11, 12
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

  /* Viernes: 1-6 Inco 7-1; 7-12 Ingles segun la imagen. */
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
    FROM @HorarioCorrecto
    GROUP BY DiaSemana, BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51010, 'El mapa contiene dos materias en una misma leccion.', 1;

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
    THROW 51004, 'Falta una materia del horario.', 1;
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
    THROW 51005, 'Falta una seccion. El script no crea ni duplica grupos.', 1;
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
  SELECT DISTINCT g.GrupoId, mo.MateriaId
  FROM @HorarioCorrecto hc
  INNER JOIN dbo.Grupo g
    ON g.InstitucionId = @InstitucionId
   AND g.AnioLectivoId = @AnioLectivoId
   AND g.Nombre = hc.GrupoNombre
   AND g.Activo = 1
  INNER JOIN @MateriasObjetivo mo
    ON mo.MateriaCodigo = hc.MateriaCodigo;

  IF (SELECT COUNT(*) FROM @Objetivos) <> 13
    THROW 51007, 'El mapa no contiene las 13 combinaciones esperadas.', 1;

  /*
    Incluye todas las combinaciones anteriores del profesor y las trece
    combinaciones correctas que se reconstruiran.
  */
  INSERT INTO @CombinacionesAjustar (GrupoId, MateriaId)
  SELECT DISTINCT ad.GrupoId, ad.MateriaId
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  INSERT INTO @CombinacionesAjustar (GrupoId, MateriaId)
  SELECT o.GrupoId, o.MateriaId
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM @CombinacionesAjustar ca
    WHERE ca.GrupoId = o.GrupoId
      AND ca.MateriaId = o.MateriaId
  );

  /*
    HorarioGrupo pertenece a grupo/materia. Si otra persona comparte una
    combinacion que se va a limpiar, se detiene para no alterar su horario.
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
      m.Nombre AS Materia,
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
    ORDER BY g.Nombre, m.Nombre, u.Correo;
    THROW 51008, 'Otro profesor comparte una combinacion que debe ajustarse.', 1;
  END;

  /*
    BORRADO LOGICO TOTAL DEL HORARIO:
    desactiva todas las filas de horario de las combinaciones anteriores
    del profesor y de las trece combinaciones correctas.
  */
  UPDATE hg
  SET hg.Activo = 0, hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @CombinacionesAjustar ca
    ON ca.GrupoId = gm.GrupoId
   AND ca.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoId
    AND hg.Activo = 1;

  UPDATE ad
  SET ad.Activo = 0, ad.UpdatedAt = SYSDATETIME()
  FROM dbo.AsignacionDocente ad
  WHERE ad.InstitucionId = @InstitucionId
    AND ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoId
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1;

  /*
    Conserva el GrupoMateria original de menor id para mantener sus
    relaciones academicas y desactiva cualquier GrupoMateria duplicado.
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

  IF (SELECT COUNT(*) FROM @GrupoMateriaCanonico) <> 13
    THROW 51009, 'No se prepararon las 13 combinaciones correctas.', 1;

  /*
    Conserva una sola asignacion historica por combinacion y crea
    solamente las que no existan.
  */
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

  /* Crea exactamente las 60 filas nuevas; ninguna fila vieja se reactiva. */
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
   AND canon.MateriaId = mo.MateriaId;

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
    THROW 51011, 'La reconstruccion no dejo exactamente 13 asignaciones activas.', 1;

  IF (
    SELECT COUNT(*)
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
  ) <> 60
    THROW 51012, 'La reconstruccion no dejo exactamente 60 filas de horario.', 1;

  IF EXISTS (
    SELECT hg.DiaSemana, hg.BloqueHorarioId
    FROM dbo.HorarioGrupo hg
    INNER JOIN @GrupoMateriaCanonico canon
      ON canon.GrupoMateriaId = hg.GrupoMateriaId
    WHERE hg.Activo = 1
    GROUP BY hg.DiaSemana, hg.BloqueHorarioId
    HAVING COUNT(*) > 1
  )
    THROW 51013, 'La reconstruccion produjo un traslape de lecciones.', 1;

  /* Verificacion 1: deben aparecer 13 asignaciones unicas. */
  SELECT
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
    AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
    AND ad.Activo = 1
  ORDER BY g.Nombre, m.Nombre;

  /* Verificacion 2: horario final por dia y leccion. */
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

  /*
    Verificacion 3: cuenta exactamente las entradas que devuelve
    /gestion-profe/mi-horario. Deben ser 13 asignaciones, 60 entradas
    visibles y cero entradas fuera del mapa.
  */
  SELECT
    (SELECT COUNT(*)
     FROM dbo.AsignacionDocente ad
     WHERE ad.InstitucionId = @InstitucionId
       AND ad.UsuarioId = @UsuarioId
       AND ad.AnioLectivoId = @AnioLectivoId
       AND ad.PeriodoId = @PeriodoId
       AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
       AND ad.Activo = 1) AS AsignacionesEsperadas13,
    (SELECT COUNT(DISTINCT hg.HorarioGrupoId)
     FROM dbo.HorarioGrupo hg
     INNER JOIN dbo.GrupoMateria gm
       ON gm.GrupoMateriaId = hg.GrupoMateriaId
      AND gm.Activo = 1
      AND gm.PeriodoId = @PeriodoId
     INNER JOIN dbo.AsignacionDocente ad
       ON ad.GrupoId = gm.GrupoId
      AND ad.MateriaId = gm.MateriaId
      AND ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
     WHERE hg.Activo = 1) AS EntradasVisiblesEsperadas60,
    (SELECT COUNT(*)
     FROM dbo.HorarioGrupo hg
     INNER JOIN dbo.GrupoMateria gm
       ON gm.GrupoMateriaId = hg.GrupoMateriaId
      AND gm.Activo = 1
      AND gm.PeriodoId = @PeriodoId
     INNER JOIN dbo.Grupo g
       ON g.GrupoId = gm.GrupoId
     INNER JOIN dbo.Materia m
       ON m.MateriaId = gm.MateriaId
     INNER JOIN dbo.AsignacionDocente ad
       ON ad.GrupoId = gm.GrupoId
      AND ad.MateriaId = gm.MateriaId
      AND ad.InstitucionId = @InstitucionId
      AND ad.UsuarioId = @UsuarioId
      AND ad.AnioLectivoId = @AnioLectivoId
      AND ad.PeriodoId = @PeriodoId
      AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
      AND ad.Activo = 1
     WHERE hg.Activo = 1
       AND NOT EXISTS (
         SELECT 1
         FROM @HorarioCorrecto hc
         WHERE hc.GrupoNombre = g.Nombre
           AND hc.MateriaCodigo = m.Codigo
           AND hc.DiaSemana = hg.DiaSemana
           AND hc.BloqueHorarioId = hg.BloqueHorarioId
       )) AS EntradasFueraMapaEsperadas0,
    (SELECT COUNT(*)
     FROM @HorarioCorrecto hc
     WHERE NOT EXISTS (
       SELECT 1
       FROM dbo.Grupo g
       INNER JOIN dbo.Materia m
         ON m.InstitucionId = @InstitucionId
        AND m.Codigo = hc.MateriaCodigo
       INNER JOIN dbo.GrupoMateria gm
         ON gm.GrupoId = g.GrupoId
        AND gm.MateriaId = m.MateriaId
        AND gm.PeriodoId = @PeriodoId
        AND gm.Activo = 1
       INNER JOIN dbo.HorarioGrupo hg
         ON hg.GrupoMateriaId = gm.GrupoMateriaId
        AND hg.DiaSemana = hc.DiaSemana
        AND hg.BloqueHorarioId = hc.BloqueHorarioId
        AND hg.Activo = 1
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
         AND g.Nombre = hc.GrupoNombre
     )) AS EntradasFaltantesEsperadas0,
    (SELECT COUNT(*)
     FROM (
       SELECT
         gm.GrupoId,
         gm.MateriaId,
         hg.DiaSemana,
         hg.BloqueHorarioId
       FROM dbo.HorarioGrupo hg
       INNER JOIN dbo.GrupoMateria gm
         ON gm.GrupoMateriaId = hg.GrupoMateriaId
        AND gm.Activo = 1
        AND gm.PeriodoId = @PeriodoId
       INNER JOIN dbo.AsignacionDocente ad
         ON ad.GrupoId = gm.GrupoId
        AND ad.MateriaId = gm.MateriaId
        AND ad.InstitucionId = @InstitucionId
        AND ad.UsuarioId = @UsuarioId
        AND ad.AnioLectivoId = @AnioLectivoId
        AND ad.PeriodoId = @PeriodoId
        AND ad.TipoAsignacion = N'PROFESOR_MATERIA'
        AND ad.Activo = 1
       WHERE hg.Activo = 1
       GROUP BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
       HAVING COUNT(*) > 1
     ) duplicados) AS DuplicadosExactosEsperados0;

  /* Verificacion 4: esta consulta debe devolver cero filas. */
  ;WITH HorarioProfesor AS (
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
  FROM HorarioProfesor
  GROUP BY DiaSemana, BloqueHorarioId
  HAVING COUNT(*) > 1;

  IF @Aplicar = 1
  BEGIN
    COMMIT TRAN;
    SELECT N'APLICADO: horario de Andres reconstruido correctamente.' AS Resultado;
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
