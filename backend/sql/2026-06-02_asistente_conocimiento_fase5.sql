IF OBJECT_ID('dbo.AsistentePatronConversacion', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistentePatronConversacion (
    AsistentePatronConversacionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ClavePatron NVARCHAR(80) NOT NULL,
    Frase NVARCHAR(200) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistentePatronConversacion_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistentePatronConversacion_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistentePatronConversacion_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistentePatronConversacion_UpdatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_AsistentePatronConversacion_Clave
    ON dbo.AsistentePatronConversacion (ClavePatron, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteEjemploConsulta', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteEjemploConsulta (
    AsistenteEjemploConsultaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ModuloClave NVARCHAR(80) NOT NULL,
    ClaveDetalle NVARCHAR(80) NULL,
    FraseEjemplo NVARCHAR(200) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteEjemploConsulta_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteEjemploConsulta_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteEjemploConsulta_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteEjemploConsulta_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteEjemploConsulta_Modulo FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteEjemploConsulta_Modulo
    ON dbo.AsistenteEjemploConsulta (ModuloClave, ClaveDetalle, Activo, OrdenVisual);
END;

DECLARE @ConversationPatterns TABLE (
  ClavePatron NVARCHAR(80) NOT NULL,
  Frase NVARCHAR(200) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @ConversationPatterns (ClavePatron, Frase, OrdenVisual)
VALUES
  (N'AFFIRM_CONTINUE', N'ok', 1),
  (N'AFFIRM_CONTINUE', N'oki', 2),
  (N'AFFIRM_CONTINUE', N'okey', 3),
  (N'AFFIRM_CONTINUE', N'dale', 4),
  (N'AFFIRM_CONTINUE', N'si dale', 5),
  (N'AFFIRM_CONTINUE', N'esta bien', 6),
  (N'AFFIRM_CONTINUE', N'está bien', 7),
  (N'AFFIRM_CONTINUE', N'perfecto', 8),
  (N'AFFIRM_CONTINUE', N'de una', 9),
  (N'ADMIN_OVERVIEW', N'que hay en administrativo', 1),
  (N'ADMIN_OVERVIEW', N'que tiene administrativo', 2),
  (N'ADMIN_OVERVIEW', N'que encuentro en administrativo', 3),
  (N'ADMIN_OVERVIEW', N'que puedo hacer en administrativo', 4),
  (N'SCHOOL_NAME', N'como se llama el colegio', 1),
  (N'SCHOOL_NAME', N'cual es el nombre del colegio', 2),
  (N'SCHOOL_NAME', N'como se llama la institucion', 3),
  (N'SCHOOL_NAME', N'cual es el nombre de la institucion', 4),
  (N'FORGOT_PASSWORD', N'se me olvido la clave', 1),
  (N'FORGOT_PASSWORD', N'olvide mi clave', 2),
  (N'FORGOT_PASSWORD', N'no recuerdo mi clave', 3),
  (N'FORGOT_PASSWORD', N'como recupero mi clave', 4);

MERGE dbo.AsistentePatronConversacion AS target
USING @ConversationPatterns AS source
  ON target.ClavePatron = source.ClavePatron
 AND target.Frase = source.Frase
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (ClavePatron, Frase, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.ClavePatron, source.Frase, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @Examples TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveDetalle NVARCHAR(80) NULL,
  FraseEjemplo NVARCHAR(200) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @Examples (ModuloClave, ClaveDetalle, FraseEjemplo, OrdenVisual)
VALUES
  (N'administrativo', NULL, N'que hay en administrativo', 1),
  (N'administrativo', N'horario-clases', N'como creo el horario de clases', 2),
  (N'administrativo', N'asignacion-docentes', N'como asigno un profesor a una materia', 3),
  (N'usuarios', NULL, N'quiero crear un usuario nuevo', 1),
  (N'usuarios', N'gestion-acceso', N'se me olvido la clave, que hago', 2),
  (N'estudiantes', NULL, N'quiero registrar un estudiante', 1),
  (N'estudiantes', N'busqueda-estudiantes', N'puedes darme informacion de un alumno', 2),
  (N'matricula', N'registro-matricula', N'quiero matricular un alumno', 1),
  (N'matricula', N'registro-matricula', N'quiero cambiar un alumno de seccion', 2),
  (N'parametrizaciones', N'evaluaciones', N'como configuro una plantilla de evaluacion', 1),
  (N'parametrizaciones', N'promt-ia', N'como creo una plantilla de promt ia', 2),
  (N'horarios', N'consulta-administrativa', N'que horario tiene el profe en 8-2', 1),
  (N'horarios', N'consulta-administrativa', N'quiero ver el horario de un estudiante', 2),
  (N'asistencia', N'captura-asistencia', N'como paso asistencia', 1),
  (N'asistencia', N'consulta-clases', N'no me salen clases programadas', 2),
  (N'seguimiento-notas', N'registro-seguimiento', N'como guardo seguimiento de notas', 1),
  (N'seguimiento-notas', N'consolidado-estudiante', N'como reviso el consolidado del estudiante', 2),
  (N'gestion-profe', N'seguimiento-diario', N'como califico tareas en seguimiento diario', 1),
  (N'gestion-profe', N'planeamiento-indicadores', N'dame los pasos para hacer un planeamiento', 2),
  (N'planeamiento-ia', N'generar-planeamiento', N'como genero un planeamiento con ia', 1),
  (N'planeamiento-ia', N'guardar-planeamiento', N'como guardo el planeamiento en gestion del profe', 2),
  (N'reportes', N'consulta-reportes', N'como saco un reporte de notas', 1),
  (N'reportes', N'certificaciones', N'como genero una constancia de estudio', 2);

MERGE dbo.AsistenteEjemploConsulta AS target
USING @Examples AS source
  ON target.ModuloClave = source.ModuloClave
 AND ISNULL(target.ClaveDetalle, N'') = ISNULL(source.ClaveDetalle, N'')
 AND target.FraseEjemplo = source.FraseEjemplo
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (ModuloClave, ClaveDetalle, FraseEjemplo, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.ModuloClave, source.ClaveDetalle, source.FraseEjemplo, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
