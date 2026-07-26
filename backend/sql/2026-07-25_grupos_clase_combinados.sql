/*
  PROFE360 - Grupos de clase combinados
  Fecha: 2026-07-25

  Objetivo:
  - Mantener intactas las secciones oficiales y la matricula base.
  - Permitir grupos lectivos con estudiantes de varias secciones.
  - Relacionar matriculas y materias con especialidades/subespecialidades.
  - Conservar compatibilidad con asistencia, evaluacion, bitacora y cierres.

  El script es idempotente. Puede ejecutarse nuevamente sin duplicar objetos.
  No crea grupos de clase ni cambia matriculas existentes.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.Institucion', N'U') IS NULL
     OR OBJECT_ID(N'dbo.AnioLectivo', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Periodo', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Grupo', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Materia', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Matricula', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Especialidad', N'U') IS NULL
     OR OBJECT_ID(N'dbo.SubEspecialidad', N'U') IS NULL
     OR OBJECT_ID(N'dbo.Usuario', N'U') IS NULL
  BEGIN
    THROW 51001, N'Faltan tablas base requeridas para crear los grupos de clase.', 1;
  END;

  /* =======================================================
     1. PERFIL TECNICO DE LA MATRICULA
     ======================================================= */

  IF OBJECT_ID(N'dbo.MatriculaEspecialidad', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.MatriculaEspecialidad (
      MatriculaEspecialidadId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_MatriculaEspecialidad PRIMARY KEY,
      MatriculaId INT NOT NULL,
      EspecialidadId INT NOT NULL,
      EsPrincipal BIT NOT NULL
        CONSTRAINT DF_MatriculaEspecialidad_EsPrincipal DEFAULT(0),
      FechaDesde DATE NULL,
      FechaHasta DATE NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_MatriculaEspecialidad_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_MatriculaEspecialidad_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_MatriculaEspecialidad_Matricula
        FOREIGN KEY (MatriculaId) REFERENCES dbo.Matricula(MatriculaId),
      CONSTRAINT FK_MatriculaEspecialidad_Especialidad
        FOREIGN KEY (EspecialidadId) REFERENCES dbo.Especialidad(EspecialidadId),
      CONSTRAINT CK_MatriculaEspecialidad_Fechas
        CHECK (FechaHasta IS NULL OR FechaDesde IS NULL OR FechaHasta >= FechaDesde)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.MatriculaEspecialidad')
      AND name = N'UX_MatriculaEspecialidad_Activa'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_MatriculaEspecialidad_Activa
      ON dbo.MatriculaEspecialidad (MatriculaId, EspecialidadId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.MatriculaSubEspecialidad', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.MatriculaSubEspecialidad (
      MatriculaSubEspecialidadId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_MatriculaSubEspecialidad PRIMARY KEY,
      MatriculaId INT NOT NULL,
      SubEspecialidadId INT NOT NULL,
      FechaDesde DATE NULL,
      FechaHasta DATE NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_MatriculaSubEspecialidad_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_MatriculaSubEspecialidad_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_MatriculaSubEspecialidad_Matricula
        FOREIGN KEY (MatriculaId) REFERENCES dbo.Matricula(MatriculaId),
      CONSTRAINT FK_MatriculaSubEspecialidad_SubEspecialidad
        FOREIGN KEY (SubEspecialidadId) REFERENCES dbo.SubEspecialidad(SubEspecialidadId),
      CONSTRAINT CK_MatriculaSubEspecialidad_Fechas
        CHECK (FechaHasta IS NULL OR FechaDesde IS NULL OR FechaHasta >= FechaDesde)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.MatriculaSubEspecialidad')
      AND name = N'UX_MatriculaSubEspecialidad_Activa'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_MatriculaSubEspecialidad_Activa
      ON dbo.MatriculaSubEspecialidad (MatriculaId, SubEspecialidadId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.MateriaSubEspecialidad', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.MateriaSubEspecialidad (
      MateriaSubEspecialidadId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_MateriaSubEspecialidad PRIMARY KEY,
      MateriaId INT NOT NULL,
      SubEspecialidadId INT NOT NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_MateriaSubEspecialidad_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_MateriaSubEspecialidad_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_MateriaSubEspecialidad_Materia
        FOREIGN KEY (MateriaId) REFERENCES dbo.Materia(MateriaId),
      CONSTRAINT FK_MateriaSubEspecialidad_SubEspecialidad
        FOREIGN KEY (SubEspecialidadId) REFERENCES dbo.SubEspecialidad(SubEspecialidadId)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.MateriaSubEspecialidad')
      AND name = N'UX_MateriaSubEspecialidad_Activa'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_MateriaSubEspecialidad_Activa
      ON dbo.MateriaSubEspecialidad (MateriaId, SubEspecialidadId)
      WHERE Activo = 1;
  END;

  /* Conserva como especialidad principal la que ya existe en MatriculaDetalle. */
  IF OBJECT_ID(N'dbo.MatriculaDetalle', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.MatriculaDetalle', N'EspecialidadId') IS NOT NULL
  BEGIN
    INSERT INTO dbo.MatriculaEspecialidad
      (MatriculaId, EspecialidadId, EsPrincipal, Activo, CreatedAt)
    SELECT
      md.MatriculaId,
      md.EspecialidadId,
      1,
      1,
      SYSDATETIME()
    FROM dbo.MatriculaDetalle md
    WHERE md.EspecialidadId IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.MatriculaEspecialidad me
        WHERE me.MatriculaId = md.MatriculaId
          AND me.EspecialidadId = md.EspecialidadId
          AND me.Activo = 1
      );
  END;

  /* =======================================================
     2. GRUPO DE CLASE
     ======================================================= */

  IF OBJECT_ID(N'dbo.GrupoClase', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClase (
      GrupoClaseId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClase PRIMARY KEY,
      InstitucionId INT NOT NULL,
      AnioLectivoId INT NOT NULL,
      PeriodoId INT NOT NULL,
      MateriaId INT NOT NULL,
      GrupoIdPrincipal INT NOT NULL,
      Codigo NVARCHAR(50) NULL,
      Nombre NVARCHAR(200) NOT NULL,
      Descripcion NVARCHAR(500) NULL,
      ModoSeleccion NVARCHAR(20) NOT NULL
        CONSTRAINT DF_GrupoClase_ModoSeleccion DEFAULT(N'MIXTO'),
      ReglaCoincidencia NVARCHAR(20) NOT NULL
        CONSTRAINT DF_GrupoClase_ReglaCoincidencia DEFAULT(N'CUALQUIERA'),
      FechaInicio DATE NULL,
      FechaFin DATE NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClase_Activo DEFAULT(1),
      UsuarioCreadorId INT NULL,
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClase_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClase_Institucion
        FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
      CONSTRAINT FK_GrupoClase_AnioLectivo
        FOREIGN KEY (AnioLectivoId) REFERENCES dbo.AnioLectivo(AnioLectivoId),
      CONSTRAINT FK_GrupoClase_Periodo
        FOREIGN KEY (PeriodoId) REFERENCES dbo.Periodo(PeriodoId),
      CONSTRAINT FK_GrupoClase_Materia
        FOREIGN KEY (MateriaId) REFERENCES dbo.Materia(MateriaId),
      CONSTRAINT FK_GrupoClase_GrupoPrincipal
        FOREIGN KEY (GrupoIdPrincipal) REFERENCES dbo.Grupo(GrupoId),
      CONSTRAINT FK_GrupoClase_UsuarioCreador
        FOREIGN KEY (UsuarioCreadorId) REFERENCES dbo.Usuario(UsuarioId),
      CONSTRAINT CK_GrupoClase_ModoSeleccion
        CHECK (ModoSeleccion IN (N'MANUAL', N'SUBESPECIALIDAD', N'MIXTO')),
      CONSTRAINT CK_GrupoClase_ReglaCoincidencia
        CHECK (ReglaCoincidencia IN (N'CUALQUIERA', N'TODAS')),
      CONSTRAINT CK_GrupoClase_Fechas
        CHECK (FechaFin IS NULL OR FechaInicio IS NULL OR FechaFin >= FechaInicio)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClase')
      AND name = N'IX_GrupoClase_Busqueda'
  )
  BEGIN
    CREATE INDEX IX_GrupoClase_Busqueda
      ON dbo.GrupoClase
        (InstitucionId, AnioLectivoId, PeriodoId, MateriaId, Activo)
      INCLUDE (GrupoIdPrincipal, Nombre);
  END;

  IF OBJECT_ID(N'dbo.GrupoClaseSeccion', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseSeccion (
      GrupoClaseSeccionId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseSeccion PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      GrupoId INT NOT NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseSeccion_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseSeccion_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseSeccion_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseSeccion_Grupo
        FOREIGN KEY (GrupoId) REFERENCES dbo.Grupo(GrupoId)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseSeccion')
      AND name = N'UX_GrupoClaseSeccion_Activa'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseSeccion_Activa
      ON dbo.GrupoClaseSeccion (GrupoClaseId, GrupoId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.GrupoClaseSubEspecialidad', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseSubEspecialidad (
      GrupoClaseSubEspecialidadId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseSubEspecialidad PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      SubEspecialidadId INT NOT NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseSubEspecialidad_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseSubEspecialidad_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseSubEspecialidad_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseSubEspecialidad_SubEspecialidad
        FOREIGN KEY (SubEspecialidadId) REFERENCES dbo.SubEspecialidad(SubEspecialidadId)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseSubEspecialidad')
      AND name = N'UX_GrupoClaseSubEspecialidad_Activa'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseSubEspecialidad_Activa
      ON dbo.GrupoClaseSubEspecialidad (GrupoClaseId, SubEspecialidadId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.GrupoClaseEstudiante', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseEstudiante (
      GrupoClaseEstudianteId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseEstudiante PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      MatriculaId INT NOT NULL,
      OrigenAsignacion NVARCHAR(20) NOT NULL
        CONSTRAINT DF_GrupoClaseEstudiante_Origen DEFAULT(N'MANUAL'),
      FechaDesde DATE NULL,
      FechaHasta DATE NULL,
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseEstudiante_Activo DEFAULT(1),
      UsuarioRegistroId INT NULL,
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseEstudiante_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseEstudiante_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseEstudiante_Matricula
        FOREIGN KEY (MatriculaId) REFERENCES dbo.Matricula(MatriculaId),
      CONSTRAINT FK_GrupoClaseEstudiante_Usuario
        FOREIGN KEY (UsuarioRegistroId) REFERENCES dbo.Usuario(UsuarioId),
      CONSTRAINT CK_GrupoClaseEstudiante_Origen
        CHECK (OrigenAsignacion IN (N'MANUAL', N'SUBESPECIALIDAD', N'IMPORTACION')),
      CONSTRAINT CK_GrupoClaseEstudiante_Fechas
        CHECK (FechaHasta IS NULL OR FechaDesde IS NULL OR FechaHasta >= FechaDesde)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseEstudiante')
      AND name = N'UX_GrupoClaseEstudiante_Activo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseEstudiante_Activo
      ON dbo.GrupoClaseEstudiante (GrupoClaseId, MatriculaId)
      WHERE Activo = 1;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseEstudiante')
      AND name = N'IX_GrupoClaseEstudiante_Matricula'
  )
  BEGIN
    CREATE INDEX IX_GrupoClaseEstudiante_Matricula
      ON dbo.GrupoClaseEstudiante (MatriculaId, Activo, GrupoClaseId);
  END;

  IF OBJECT_ID(N'dbo.GrupoClaseDocente', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseDocente (
      GrupoClaseDocenteId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseDocente PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      UsuarioId INT NOT NULL,
      EsPrincipal BIT NOT NULL
        CONSTRAINT DF_GrupoClaseDocente_EsPrincipal DEFAULT(0),
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseDocente_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseDocente_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseDocente_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseDocente_Usuario
        FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
    );
  END;

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseDocente')
      AND name = N'UX_GrupoClaseDocente_Activo'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseDocente_Activo
      ON dbo.GrupoClaseDocente (GrupoClaseId, UsuarioId)
      WHERE Activo = 1;
  END;

  IF OBJECT_ID(N'dbo.HorarioGrupo', N'U') IS NOT NULL
     AND OBJECT_ID(N'dbo.GrupoClaseHorario', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.GrupoClaseHorario (
      GrupoClaseHorarioId INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_GrupoClaseHorario PRIMARY KEY,
      GrupoClaseId INT NOT NULL,
      HorarioGrupoId INT NOT NULL,
      EsPrincipal BIT NOT NULL
        CONSTRAINT DF_GrupoClaseHorario_EsPrincipal DEFAULT(0),
      Activo BIT NOT NULL
        CONSTRAINT DF_GrupoClaseHorario_Activo DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL
        CONSTRAINT DF_GrupoClaseHorario_CreatedAt DEFAULT(SYSDATETIME()),
      UpdatedAt DATETIME2 NULL,
      CONSTRAINT FK_GrupoClaseHorario_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId),
      CONSTRAINT FK_GrupoClaseHorario_HorarioGrupo
        FOREIGN KEY (HorarioGrupoId) REFERENCES dbo.HorarioGrupo(HorarioGrupoId)
    );
  END;

  IF OBJECT_ID(N'dbo.GrupoClaseHorario', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE object_id = OBJECT_ID(N'dbo.GrupoClaseHorario')
         AND name = N'UX_GrupoClaseHorario_Activo'
     )
  BEGIN
    CREATE UNIQUE INDEX UX_GrupoClaseHorario_Activo
      ON dbo.GrupoClaseHorario (GrupoClaseId, HorarioGrupoId)
      WHERE Activo = 1;
  END;

  /* =======================================================
     3. TRAZABILIDAD EN MODULOS EXISTENTES
     Las columnas son opcionales y no cambian datos anteriores.
     ======================================================= */

  IF OBJECT_ID(N'dbo.AsistenciaRegistro', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.AsistenciaRegistro', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.AsistenciaRegistro ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.EvaluacionNota', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.EvaluacionNota', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.EvaluacionNota ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.Eval360_EstructuraGrupo', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.Eval360_EstructuraGrupo', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.Eval360_EstructuraGrupo ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.BitacoraGrupo', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.BitacoraGrupo', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.BitacoraGrupo ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.CierreAcademicoCurso', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.CierreAcademicoCurso', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.CierreAcademicoCurso ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.Planeamiento', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.Planeamiento', N'GrupoClaseId') IS NULL
    ALTER TABLE dbo.Planeamiento ADD GrupoClaseId INT NULL;

  IF OBJECT_ID(N'dbo.AsistenciaRegistro', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.AsistenciaRegistro')
         AND name = N'FK_AsistenciaRegistro_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.AsistenciaRegistro WITH CHECK
        ADD CONSTRAINT FK_AsistenciaRegistro_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.EvaluacionNota', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.EvaluacionNota')
         AND name = N'FK_EvaluacionNota_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.EvaluacionNota WITH CHECK
        ADD CONSTRAINT FK_EvaluacionNota_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.Eval360_EstructuraGrupo', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.Eval360_EstructuraGrupo')
         AND name = N'FK_Eval360_EstructuraGrupo_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.Eval360_EstructuraGrupo WITH CHECK
        ADD CONSTRAINT FK_Eval360_EstructuraGrupo_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.BitacoraGrupo', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.BitacoraGrupo')
         AND name = N'FK_BitacoraGrupo_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.BitacoraGrupo WITH CHECK
        ADD CONSTRAINT FK_BitacoraGrupo_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.CierreAcademicoCurso', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.CierreAcademicoCurso')
         AND name = N'FK_CierreAcademicoCurso_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.CierreAcademicoCurso WITH CHECK
        ADD CONSTRAINT FK_CierreAcademicoCurso_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.Planeamiento', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.foreign_keys
       WHERE parent_object_id = OBJECT_ID(N'dbo.Planeamiento')
         AND name = N'FK_Planeamiento_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      ALTER TABLE dbo.Planeamiento WITH CHECK
        ADD CONSTRAINT FK_Planeamiento_GrupoClase
        FOREIGN KEY (GrupoClaseId) REFERENCES dbo.GrupoClase(GrupoClaseId);
    ';

  IF OBJECT_ID(N'dbo.AsistenciaRegistro', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE object_id = OBJECT_ID(N'dbo.AsistenciaRegistro')
         AND name = N'IX_AsistenciaRegistro_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      CREATE INDEX IX_AsistenciaRegistro_GrupoClase
        ON dbo.AsistenciaRegistro
          (GrupoClaseId, PeriodoId, Fecha, EstudianteId)
        WHERE GrupoClaseId IS NOT NULL;
    ';

  IF OBJECT_ID(N'dbo.Eval360_EstructuraGrupo', N'U') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE object_id = OBJECT_ID(N'dbo.Eval360_EstructuraGrupo')
         AND name = N'IX_Eval360_EstructuraGrupo_GrupoClase'
     )
    EXEC sys.sp_executesql N'
      CREATE INDEX IX_Eval360_EstructuraGrupo_GrupoClase
        ON dbo.Eval360_EstructuraGrupo
          (GrupoClaseId, Activo, EstructuraGrupoId)
        WHERE GrupoClaseId IS NOT NULL;
    ';

  COMMIT TRANSACTION;

  SELECT
    N'OK' AS Estado,
    N'Estructura de grupos de clase creada o verificada correctamente.' AS Mensaje;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
