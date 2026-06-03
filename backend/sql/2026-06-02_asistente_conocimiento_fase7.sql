IF OBJECT_ID('dbo.AsistenteFormularioGuia', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteFormularioGuia (
    AsistenteFormularioGuiaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ModuloClave NVARCHAR(80) NOT NULL,
    ClaveFormulario NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteFormularioGuia_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteFormularioGuia_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioGuia_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioGuia_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteFormularioGuia UNIQUE (RutaContexto, ClaveFormulario),
    CONSTRAINT FK_AsistenteFormularioGuia_Modulo FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteFormularioGuia_Ruta
    ON dbo.AsistenteFormularioGuia (RutaContexto, ModuloClave, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteFormularioAlias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteFormularioAlias (
    AsistenteFormularioAliasId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ClaveFormulario NVARCHAR(80) NOT NULL,
    Alias NVARCHAR(150) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteFormularioAlias_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteFormularioAlias_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioAlias_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioAlias_UpdatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_AsistenteFormularioAlias_Ruta
    ON dbo.AsistenteFormularioAlias (RutaContexto, ClaveFormulario, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteFormularioCampo', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteFormularioCampo (
    AsistenteFormularioCampoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ClaveFormulario NVARCHAR(80) NOT NULL,
    NombreCampo NVARCHAR(150) NOT NULL,
    EsRequerido BIT NOT NULL CONSTRAINT DF_AsistenteFormularioCampo_Requerido DEFAULT(0),
    Ayuda NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteFormularioCampo_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteFormularioCampo_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioCampo_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFormularioCampo_UpdatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_AsistenteFormularioCampo_Ruta
    ON dbo.AsistenteFormularioCampo (RutaContexto, ClaveFormulario, Activo, OrdenVisual);
END;

DECLARE @FormGuides TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveFormulario NVARCHAR(80) NOT NULL,
  Titulo NVARCHAR(150) NOT NULL,
  Resumen NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @FormGuides (RutaContexto, ModuloClave, ClaveFormulario, Titulo, Resumen, OrdenVisual)
VALUES
  (N'/usuarios', N'usuarios', N'usuario-principal', N'Formulario de usuario', N'Este formulario sirve para crear o editar accesos del sistema.', 10),
  (N'/instituciones', N'instituciones', N'institucion-principal', N'Formulario de institución', N'Este formulario registra o ajusta la información base del colegio.', 20),
  (N'/estudiantes', N'estudiantes', N'estudiante-principal', N'Formulario de estudiante', N'Este formulario registra la ficha principal del alumno.', 30),
  (N'/matricula', N'matricula', N'matricula-principal', N'Formulario de matrícula', N'Este formulario inscribe al estudiante en un grupo.', 40),
  (N'/parametrizaciones/evaluaciones', N'parametrizaciones', N'plantilla-evaluacion', N'Formulario de plantilla de evaluación', N'Este formulario crea la base de rubros y actividades.', 50),
  (N'/planeamiento-ia', N'planeamiento-ia', N'generador-planeamiento', N'Formulario de generar planeamiento con IA', N'Este formulario prepara el contexto antes de generar el borrador.', 60);

MERGE dbo.AsistenteFormularioGuia AS target
USING @FormGuides AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.ClaveFormulario = source.ClaveFormulario
WHEN MATCHED THEN
  UPDATE SET
    ModuloClave = source.ModuloClave,
    Titulo = source.Titulo,
    Resumen = source.Resumen,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ModuloClave, ClaveFormulario, Titulo, Resumen, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ModuloClave, source.ClaveFormulario, source.Titulo, source.Resumen, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @FormAliases TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ClaveFormulario NVARCHAR(80) NOT NULL,
  Alias NVARCHAR(150) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @FormAliases (RutaContexto, ClaveFormulario, Alias, OrdenVisual)
VALUES
  (N'/usuarios', N'usuario-principal', N'usuario', 1),
  (N'/usuarios', N'usuario-principal', N'crear usuario', 2),
  (N'/usuarios', N'usuario-principal', N'formulario de usuario', 3),
  (N'/instituciones', N'institucion-principal', N'institucion', 1),
  (N'/instituciones', N'institucion-principal', N'crear institucion', 2),
  (N'/estudiantes', N'estudiante-principal', N'estudiante', 1),
  (N'/estudiantes', N'estudiante-principal', N'registrar estudiante', 2),
  (N'/matricula', N'matricula-principal', N'matricula', 1),
  (N'/matricula', N'matricula-principal', N'crear matricula', 2),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'plantilla de evaluacion', 1),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'evaluaciones', 2),
  (N'/planeamiento-ia', N'generador-planeamiento', N'planeamiento', 1),
  (N'/planeamiento-ia', N'generador-planeamiento', N'generar planeamiento', 2);

MERGE dbo.AsistenteFormularioAlias AS target
USING @FormAliases AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.ClaveFormulario = source.ClaveFormulario
 AND target.Alias = source.Alias
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ClaveFormulario, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ClaveFormulario, source.Alias, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @FormFields TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ClaveFormulario NVARCHAR(80) NOT NULL,
  NombreCampo NVARCHAR(150) NOT NULL,
  EsRequerido BIT NOT NULL,
  Ayuda NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @FormFields (RutaContexto, ClaveFormulario, NombreCampo, EsRequerido, Ayuda, OrdenVisual)
VALUES
  (N'/usuarios', N'usuario-principal', N'Institución', 1, N'Elegila primero si tu rol puede administrarla.', 1),
  (N'/usuarios', N'usuario-principal', N'Nombre', 1, N'Poné el nombre real de la persona.', 2),
  (N'/usuarios', N'usuario-principal', N'Correo', 1, N'Debe quedar correcto porque se usa para ingreso y avisos.', 3),
  (N'/usuarios', N'usuario-principal', N'Cédula', 1, N'También funciona como clave inicial del usuario nuevo.', 4),
  (N'/usuarios', N'usuario-principal', N'Rol', 1, N'Elegilo según el acceso que realmente necesita.', 5),

  (N'/instituciones', N'institucion-principal', N'Nombre', 1, N'Usá el nombre principal del colegio.', 1),
  (N'/instituciones', N'institucion-principal', N'Nombre comercial', 0, N'Completalo si la institución maneja una variante visible.', 2),
  (N'/instituciones', N'institucion-principal', N'Nombre oficial para boleta', 0, N'Ayuda para documentos formales y boletas.', 3),
  (N'/instituciones', N'institucion-principal', N'Correo', 0, N'Conviene dejar un correo institucional válido.', 4),

  (N'/estudiantes', N'estudiante-principal', N'Identificación', 1, N'Es la base del registro y no debe duplicarse.', 1),
  (N'/estudiantes', N'estudiante-principal', N'Nombre', 1, N'Completá nombre y apellidos como aparecen oficialmente.', 2),
  (N'/estudiantes', N'estudiante-principal', N'Fecha de nacimiento', 1, N'Ayuda a validar edad y documentos.', 3),
  (N'/estudiantes', N'estudiante-principal', N'Correo', 0, N'Si existe, sirve para comunicación y acceso.', 4),
  (N'/estudiantes', N'estudiante-principal', N'Tipo de estudiante', 0, N'Elegilo si la institución ya lo usa para clasificar.', 5),

  (N'/matricula', N'matricula-principal', N'Estudiante', 1, N'Debe existir antes de abrir esta matrícula.', 1),
  (N'/matricula', N'matricula-principal', N'Año lectivo', 1, N'Elegilo antes del grupo para no mezclar periodos.', 2),
  (N'/matricula', N'matricula-principal', N'Grupo', 1, N'Seleccioná la sección destino correcta.', 3),
  (N'/matricula', N'matricula-principal', N'Fecha matrícula', 1, N'Usá la fecha real del movimiento.', 4),
  (N'/matricula', N'matricula-principal', N'Tipo matrícula', 0, N'Completalo si la institución clasifica el ingreso.', 5),

  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'Nombre', 1, N'Poné un nombre que identifique ciclo, periodo o nivel.', 1),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'Año lectivo', 1, N'Elegilo antes del período.', 2),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'Periodo', 1, N'Debe corresponder al año lectivo seleccionado.', 3),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'Materia', 1, N'La estructura queda ligada a esta materia.', 4),
  (N'/parametrizaciones/evaluaciones', N'plantilla-evaluacion', N'Decimales de nota', 0, N'Ajustalo según la política institucional.', 5),

  (N'/planeamiento-ia', N'generador-planeamiento', N'Plantilla IA', 0, N'Si hay una institucional buena, podés reutilizarla.', 1),
  (N'/planeamiento-ia', N'generador-planeamiento', N'Habilidades', 1, N'Debés marcar al menos una.', 2),
  (N'/planeamiento-ia', N'generador-planeamiento', N'Mes', 1, N'Elegí el periodo del plan que querés generar.', 3),
  (N'/planeamiento-ia', N'generador-planeamiento', N'Periodicidad', 1, N'Define el ritmo del planeamiento.', 4),
  (N'/planeamiento-ia', N'generador-planeamiento', N'Competencia general', 1, N'Escribila clara porque guía la salida.', 5);

MERGE dbo.AsistenteFormularioCampo AS target
USING @FormFields AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.ClaveFormulario = source.ClaveFormulario
 AND target.NombreCampo = source.NombreCampo
WHEN MATCHED THEN
  UPDATE SET
    EsRequerido = source.EsRequerido,
    Ayuda = source.Ayuda,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ClaveFormulario, NombreCampo, EsRequerido, Ayuda, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ClaveFormulario, source.NombreCampo, source.EsRequerido, source.Ayuda, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
