/*
  Jonathan Segura Sibaja - copy the verified I Period schedule to II Period.
  Run first with @Aplicar = 0. Review the 44 rows, then change it to 1.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Correo NVARCHAR(320) = N'jonathan.segura.sibaja@mep.go.cr';
DECLARE @AnioLectivoId INT = 1;
DECLARE @PeriodoFuenteId INT = 1;
DECLARE @PeriodoDestinoId INT = 2;
DECLARE @Aplicar BIT = 0;
DECLARE @UsuarioId INT;

BEGIN TRY
  BEGIN TRAN;

  SELECT TOP (1) @UsuarioId = u.UsuarioId
  FROM dbo.Usuario u
  WHERE LOWER(u.Correo) = LOWER(@Correo);

  IF @UsuarioId IS NULL
    THROW 51001, 'No se encontro el usuario de Jonathan.', 1;

  DECLARE @Objetivos TABLE (
    GrupoId INT NOT NULL,
    MateriaId INT NOT NULL,
    PRIMARY KEY (GrupoId, MateriaId)
  );

  INSERT INTO @Objetivos (GrupoId, MateriaId)
  SELECT DISTINCT ad.GrupoId, ad.MateriaId
  FROM dbo.AsignacionDocente ad
  WHERE ad.UsuarioId = @UsuarioId
    AND ad.AnioLectivoId = @AnioLectivoId
    AND ad.PeriodoId = @PeriodoDestinoId
    AND ad.Activo = 1;

  IF (SELECT COUNT(*) FROM @Objetivos) <> 14
    THROW 51002, 'Las 14 asignaciones activas esperadas del II periodo no coinciden.', 1;

  DECLARE @Fuente TABLE (
    GrupoId INT NOT NULL,
    MateriaId INT NOT NULL,
    DiaSemana INT NOT NULL,
    BloqueHorarioId INT NOT NULL,
    PRIMARY KEY (GrupoId, MateriaId, DiaSemana, BloqueHorarioId)
  );

  INSERT INTO @Fuente (GrupoId, MateriaId, DiaSemana, BloqueHorarioId)
  SELECT DISTINCT
    gm.GrupoId,
    gm.MateriaId,
    hg.DiaSemana,
    hg.BloqueHorarioId
  FROM dbo.GrupoMateria gm
  INNER JOIN dbo.HorarioGrupo hg
    ON hg.GrupoMateriaId = gm.GrupoMateriaId
   AND hg.Activo = 1
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoFuenteId
    AND gm.Activo = 1;

  IF (SELECT COUNT(DISTINCT CONCAT(GrupoId, ':', MateriaId)) FROM @Fuente) <> 14
    THROW 51003, 'El horario fuente no cubre las 14 asignaciones esperadas.', 1;

  IF (SELECT COUNT(*) FROM @Fuente) <> 44
    THROW 51004, 'El horario fuente no tiene los 44 bloques verificados.', 1;

  /* Create or reactivate only Jonathan's group-subject pairs in II Period. */
  UPDATE gm
  SET gm.Activo = 1,
      gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoDestinoId
    AND gm.Activo = 0;

  INSERT INTO dbo.GrupoMateria (GrupoId, MateriaId, PeriodoId, Activo, CreatedAt)
  SELECT o.GrupoId, o.MateriaId, @PeriodoDestinoId, 1, SYSDATETIME()
  FROM @Objetivos o
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.GrupoMateria gm
    WHERE gm.GrupoId = o.GrupoId
      AND gm.MateriaId = o.MateriaId
      AND gm.PeriodoId = @PeriodoDestinoId
  );

  /* Keep one active GrupoMateria per group, subject, and period. */
  ;WITH Duplicados AS (
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
    WHERE gm.PeriodoId = @PeriodoDestinoId
      AND gm.Activo = 1
  )
  UPDATE hg
  SET hg.Activo = 0,
      hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.GrupoMateriaId = hg.GrupoMateriaId
  WHERE d.rn > 1
    AND hg.Activo = 1;

  ;WITH Duplicados AS (
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
    WHERE gm.PeriodoId = @PeriodoDestinoId
      AND gm.Activo = 1
  )
  UPDATE gm
  SET gm.Activo = 0,
      gm.UpdatedAt = SYSDATETIME()
  FROM dbo.GrupoMateria gm
  INNER JOIN Duplicados d ON d.GrupoMateriaId = gm.GrupoMateriaId
  WHERE d.rn > 1;

  /* Clear only the target-period schedule for Jonathan's assigned pairs. */
  UPDATE hg
  SET hg.Activo = 0,
      hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoDestinoId
    AND gm.Activo = 1
    AND hg.Activo = 1;

  /* Reactivate matching rows before inserting new ones. */
  UPDATE hg
  SET hg.Activo = 1,
      hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @Fuente f
    ON f.GrupoId = gm.GrupoId
   AND f.MateriaId = gm.MateriaId
   AND f.DiaSemana = hg.DiaSemana
   AND f.BloqueHorarioId = hg.BloqueHorarioId
  WHERE gm.PeriodoId = @PeriodoDestinoId
    AND gm.Activo = 1;

  INSERT INTO dbo.HorarioGrupo (GrupoMateriaId, BloqueHorarioId, DiaSemana, Activo, CreatedAt)
  SELECT gm.GrupoMateriaId, f.BloqueHorarioId, f.DiaSemana, 1, SYSDATETIME()
  FROM @Fuente f
  INNER JOIN dbo.GrupoMateria gm
    ON gm.GrupoId = f.GrupoId
   AND gm.MateriaId = f.MateriaId
   AND gm.PeriodoId = @PeriodoDestinoId
   AND gm.Activo = 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.HorarioGrupo hg
    WHERE hg.GrupoMateriaId = gm.GrupoMateriaId
      AND hg.BloqueHorarioId = f.BloqueHorarioId
      AND hg.DiaSemana = f.DiaSemana
  );

  /* Deactivate any duplicate time slot for the same group and subject. */
  ;WITH Duplicados AS (
    SELECT
      hg.HorarioGrupoId,
      ROW_NUMBER() OVER (
        PARTITION BY gm.GrupoId, gm.MateriaId, hg.DiaSemana, hg.BloqueHorarioId
        ORDER BY hg.HorarioGrupoId
      ) AS rn
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
    INNER JOIN @Objetivos o
      ON o.GrupoId = gm.GrupoId
     AND o.MateriaId = gm.MateriaId
    WHERE gm.PeriodoId = @PeriodoDestinoId
      AND gm.Activo = 1
      AND hg.Activo = 1
  )
  UPDATE hg
  SET hg.Activo = 0,
      hg.UpdatedAt = SYSDATETIME()
  FROM dbo.HorarioGrupo hg
  INNER JOIN Duplicados d ON d.HorarioGrupoId = hg.HorarioGrupoId
  WHERE d.rn > 1;

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
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
  INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
  INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoDestinoId
    AND gm.Activo = 1
    AND hg.Activo = 1
  ORDER BY hg.DiaSemana, bh.OrdenVisual, g.Nombre, m.Nombre;

  SELECT COUNT(*) AS TotalBloquesActivos
  FROM dbo.HorarioGrupo hg
  INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId
  INNER JOIN @Objetivos o
    ON o.GrupoId = gm.GrupoId
   AND o.MateriaId = gm.MateriaId
  WHERE gm.PeriodoId = @PeriodoDestinoId
    AND gm.Activo = 1
    AND hg.Activo = 1;

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
