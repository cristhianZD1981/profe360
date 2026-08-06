SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.GrupoClase', N'U') IS NULL
    THROW 50001, N'Debe ejecutar primero 2026-07-25_grupos_clase_combinados.sql.', 1;

  /* La fila original permanece como configuracion canonica o referencia historica. */
  IF COL_LENGTH(N'dbo.GrupoClase', N'AplicaTodosPeriodos') IS NULL
  BEGIN
    ALTER TABLE dbo.GrupoClase
      ADD AplicaTodosPeriodos BIT NOT NULL
        CONSTRAINT DF_GrupoClase_AplicaTodosPeriodos DEFAULT(0) WITH VALUES;
  END;

  IF COL_LENGTH(N'dbo.GrupoClase', N'GrupoClaseCanonicoId') IS NULL
    ALTER TABLE dbo.GrupoClase ADD GrupoClaseCanonicoId INT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.GrupoClase')
      AND name = N'FK_GrupoClase_Canonico'
  )
  BEGIN
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.GrupoClase WITH CHECK
        ADD CONSTRAINT FK_GrupoClase_Canonico
        FOREIGN KEY (GrupoClaseCanonicoId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClase')
      AND name = N'IX_GrupoClase_ConfiguracionAnual'
  )
  BEGIN
    EXEC sys.sp_executesql N'
      CREATE INDEX IX_GrupoClase_ConfiguracionAnual
        ON dbo.GrupoClase
          (InstitucionId, AnioLectivoId, AplicaTodosPeriodos, GrupoClaseCanonicoId, Activo)
        INCLUDE (PeriodoId, MateriaId, GrupoIdPrincipal, Nombre);
    ';
  END;

  EXEC sys.sp_executesql N'
    CREATE OR ALTER FUNCTION dbo.fn_GrupoClaseCanonicoId(@GrupoClaseId INT)
    RETURNS INT
    AS
    BEGIN
      DECLARE @Resultado INT;
      SELECT @Resultado = COALESCE(GrupoClaseCanonicoId, GrupoClaseId)
      FROM dbo.GrupoClase
      WHERE GrupoClaseId = @GrupoClaseId;
      RETURN COALESCE(@Resultado, @GrupoClaseId);
    END;
  ';

  IF OBJECT_ID(N'dbo.GrupoClaseLeccionPatron', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseLeccionPatron (
      GrupoClaseLeccionPatronId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseLeccionPatron PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      DiaSemana INT NOT NULL,
      BloqueHorarioId INT NOT NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseLeccionPatron_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseLeccionPatron_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseLeccionPatron_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseLeccionPatron_BloqueHorario
        FOREIGN KEY (BloqueHorarioId) REFERENCES dbo.BloqueHorario(BloqueHorarioId),
      CONSTRAINT CK_GrupoClaseLeccionPatron_DiaSemana
        CHECK (DiaSemana BETWEEN 1 AND 7)
    );
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseLeccionPatron')
      AND name = N'UX_GrupoClaseLeccionPatron_Activo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseLeccionPatron_Activo
      ON dbo.GrupoClaseLeccionPatron (GrupoClaseId, DiaSemana, BloqueHorarioId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.ProfesorPeriodoEstado', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.ProfesorPeriodoEstado (
      ProfesorPeriodoEstadoId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_ProfesorPeriodoEstado PRIMARY KEY,
      InstitucionId INT NOT NULL,
      UsuarioId INT NOT NULL,
      AnioLectivoId INT NOT NULL,
      PeriodoId INT NOT NULL,
      Habilitado BIT NOT NULL
        CONSTRAINT DF_ProfesorPeriodoEstado_Habilitado DEFAULT(1),
      UsuarioRegistroId INT NULL,
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_ProfesorPeriodoEstado_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_ProfesorPeriodoEstado_Institucion
        FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
      CONSTRAINT FK_ProfesorPeriodoEstado_Usuario
        FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId),
      CONSTRAINT FK_ProfesorPeriodoEstado_AnioLectivo
        FOREIGN KEY (AnioLectivoId) REFERENCES dbo.AnioLectivo(AnioLectivoId),
      CONSTRAINT FK_ProfesorPeriodoEstado_Periodo
        FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
      CONSTRAINT FK_ProfesorPeriodoEstado_UsuarioRegistro
        FOREIGN KEY (UsuarioRegistroId) REFERENCES dbo.Usuario(UsuarioId)
    );
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.ProfesorPeriodoEstado')
      AND name = N'UX_ProfesorPeriodoEstado_Contexto'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_ProfesorPeriodoEstado_Contexto
      ON dbo.ProfesorPeriodoEstado (InstitucionId, UsuarioId, AnioLectivoId, PeriodoId);
  END;

  IF OBJECT_ID(N'dbo.ProfesorPeriodoEstadoHistorial', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.ProfesorPeriodoEstadoHistorial (
      ProfesorPeriodoEstadoHistorialId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_ProfesorPeriodoEstadoHistorial PRIMARY KEY,
      InstitucionId INT NOT NULL,
      UsuarioId INT NOT NULL,
      AnioLectivoId INT NOT NULL,
      PeriodoId INT NOT NULL,
      Habilitado BIT NOT NULL,
      Origen NVARCHAR(40) NOT NULL,
      UsuarioRegistroId INT NULL,
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_ProfesorPeriodoEstadoHistorial_CreatedAt DEFAULT(SYSDATETIME())
    );
  END;

  /* Convierte en patrones las lecciones ya elegidas, sin tocar sus vinculos. */
  INSERT INTO dbo.GrupoClaseLeccionPatron
    (GrupoClaseId, DiaSemana, BloqueHorarioId, Activo, CreatedAt)
  SELECT DISTINCT
    gch.GrupoClaseId,
    hg.DiaSemana,
    hg.BloqueHorarioId,
    1,
    SYSDATETIME()
  FROM dbo.GrupoClaseHorario gch
  INNER JOIN dbo.GrupoClase gc ON gc.GrupoClaseId = gch.GrupoClaseId
  INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
  INNER JOIN dbo.HorarioGrupo hg ON hg.HorarioGrupoId = gch.HorarioGrupoId
  WHERE al.Activo = 1
    AND gc.Activo = 1
    AND gch.Activo = 1
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.GrupoClaseLeccionPatron existente
      WHERE existente.GrupoClaseId = gch.GrupoClaseId
        AND existente.DiaSemana = hg.DiaSemana
        AND existente.BloqueHorarioId = hg.BloqueHorarioId
        AND existente.Activo = 1
    );

  EXEC sys.sp_executesql N'
    UPDATE gc
    SET AplicaTodosPeriodos = 1,
        UpdatedAt = COALESCE(gc.UpdatedAt, SYSDATETIME())
    FROM dbo.GrupoClase gc
    INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
    WHERE al.Activo = 1
      AND gc.AplicaTodosPeriodos = 0;
  ';

  /* Solo el ano vigente se consolida. Los IDs duplicados quedan disponibles para historia. */
  IF OBJECT_ID(N'tempdb..#GrupoClaseFirmas') IS NOT NULL
    DROP TABLE #GrupoClaseFirmas;

  SELECT
    gc.GrupoClaseId,
    gc.InstitucionId,
    gc.AnioLectivoId,
    Firma = CONCAT(
      N'N:', UPPER(LTRIM(RTRIM(gc.Nombre))),
      N'|C:', UPPER(LTRIM(RTRIM(ISNULL(gc.Codigo, N'')))),
      N'|D:', UPPER(LTRIM(RTRIM(ISNULL(gc.Descripcion, N'')))),
      N'|M:', gc.MateriaId,
      N'|GP:', gc.GrupoIdPrincipal,
      N'|MS:', gc.ModoSeleccion,
      N'|RC:', gc.ReglaCoincidencia,
      N'|FI:', CONVERT(nvarchar(10), gc.FechaInicio, 23),
      N'|FF:', CONVERT(nvarchar(10), gc.FechaFin, 23),
      N'|S:', ISNULL((
        SELECT N',' + CONVERT(nvarchar(20), gcs.GrupoId)
        FROM dbo.GrupoClaseSeccion gcs
        WHERE gcs.GrupoClaseId = gc.GrupoClaseId AND gcs.Activo = 1
        ORDER BY gcs.GrupoId
        FOR XML PATH(N''), TYPE
      ).value(N'.', N'nvarchar(max)'), N''),
      N'|SE:', ISNULL((
        SELECT N',' + CONVERT(nvarchar(20), gcse.SubEspecialidadId)
        FROM dbo.GrupoClaseSubEspecialidad gcse
        WHERE gcse.GrupoClaseId = gc.GrupoClaseId AND gcse.Activo = 1
        ORDER BY gcse.SubEspecialidadId
        FOR XML PATH(N''), TYPE
      ).value(N'.', N'nvarchar(max)'), N''),
      N'|E:', ISNULL((
        SELECT
          N',' + CONVERT(nvarchar(20), gce.MatriculaId)
          + N':' + UPPER(LTRIM(RTRIM(ISNULL(gce.OrigenAsignacion, N''))))
          + N':' + ISNULL(CONVERT(nvarchar(10), gce.FechaDesde, 23), N'')
          + N':' + ISNULL(CONVERT(nvarchar(10), gce.FechaHasta, 23), N'')
        FROM dbo.GrupoClaseEstudiante gce
        WHERE gce.GrupoClaseId = gc.GrupoClaseId AND gce.Activo = 1
        ORDER BY gce.MatriculaId
        FOR XML PATH(N''), TYPE
      ).value(N'.', N'nvarchar(max)'), N''),
      N'|P:', ISNULL((
        SELECT N',' + CONVERT(nvarchar(20), gcd.UsuarioId) + N':' + CONVERT(nvarchar(1), gcd.EsPrincipal)
        FROM dbo.GrupoClaseDocente gcd
        WHERE gcd.GrupoClaseId = gc.GrupoClaseId AND gcd.Activo = 1
        ORDER BY gcd.EsPrincipal DESC, gcd.UsuarioId
        FOR XML PATH(N''), TYPE
      ).value(N'.', N'nvarchar(max)'), N''),
      N'|L:', ISNULL((
        SELECT N',' + CONVERT(nvarchar(2), patron.DiaSemana) + N':' + CONVERT(nvarchar(20), patron.BloqueHorarioId)
        FROM dbo.GrupoClaseLeccionPatron patron
        WHERE patron.GrupoClaseId = gc.GrupoClaseId AND patron.Activo = 1
        ORDER BY patron.DiaSemana, patron.BloqueHorarioId
        FOR XML PATH(N''), TYPE
      ).value(N'.', N'nvarchar(max)'), N'')
    )
  INTO #GrupoClaseFirmas
  FROM dbo.GrupoClase gc
  INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
  WHERE al.Activo = 1
    AND gc.Activo = 1;

  ALTER TABLE #GrupoClaseFirmas ADD FirmaHash VARBINARY(32) NULL;
  UPDATE #GrupoClaseFirmas
  SET FirmaHash = HASHBYTES(N'SHA2_256', CONVERT(nvarchar(max), Firma));

  EXEC sys.sp_executesql N'
    UPDATE gc
    SET GrupoClaseCanonicoId = CASE
          WHEN gc.GrupoClaseId = coincidencia.CanonicoId THEN NULL
          ELSE coincidencia.CanonicoId
        END,
        UpdatedAt = SYSDATETIME()
    FROM dbo.GrupoClase gc
    INNER JOIN #GrupoClaseFirmas firma ON firma.GrupoClaseId = gc.GrupoClaseId
    CROSS APPLY (
      SELECT MIN(otra.GrupoClaseId) AS CanonicoId
      FROM #GrupoClaseFirmas otra
      WHERE otra.InstitucionId = firma.InstitucionId
        AND otra.AnioLectivoId = firma.AnioLectivoId
        AND otra.FirmaHash = firma.FirmaHash
        AND otra.Firma = firma.Firma
    ) coincidencia;
  ';

  DROP TABLE #GrupoClaseFirmas;

  COMMIT TRANSACTION;

  SELECT
    N'OK' AS Estado,
    N'Configuracion anual de grupos y periodos por profesor preparada sin eliminar datos historicos.' AS Mensaje;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
