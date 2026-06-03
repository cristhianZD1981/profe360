IF OBJECT_ID('dbo.AsistenteSubflujoContexto', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteSubflujoContexto (
    AsistenteSubflujoContextoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ModuloClave NVARCHAR(80) NOT NULL,
    ClaveSubflujo NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteSubflujoContexto_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteSubflujoContexto_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteSubflujoContexto_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteSubflujoContexto_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteSubflujoContexto UNIQUE (RutaContexto, ClaveSubflujo),
    CONSTRAINT FK_AsistenteSubflujoContexto_Modulo FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteSubflujoContexto_Ruta
    ON dbo.AsistenteSubflujoContexto (RutaContexto, ModuloClave, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteSubflujoItem', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteSubflujoItem (
    AsistenteSubflujoItemId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ClaveSubflujo NVARCHAR(80) NOT NULL,
    TipoItem NVARCHAR(20) NOT NULL,
    Descripcion NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteSubflujoItem_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteSubflujoItem_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteSubflujoItem_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteSubflujoItem_UpdatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_AsistenteSubflujoItem_Ruta
    ON dbo.AsistenteSubflujoItem (RutaContexto, ClaveSubflujo, TipoItem, Activo, OrdenVisual);
END;

DECLARE @SubflowContexts TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveSubflujo NVARCHAR(80) NOT NULL,
  Titulo NVARCHAR(150) NOT NULL,
  Resumen NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @SubflowContexts (RutaContexto, ModuloClave, ClaveSubflujo, Titulo, Resumen, OrdenVisual)
VALUES
  (N'/usuarios', N'usuarios', N'crear-usuario', N'crear un usuario nuevo', N'Este subflujo te ayuda a registrar un usuario nuevo y dejarle acceso correcto desde el inicio.', 10),
  (N'/usuarios', N'usuarios', N'importar-usuarios', N'importar usuarios', N'Este subflujo sirve para cargar varios usuarios de una sola vez y revisar que entren con el rol correcto.', 20),
  (N'/instituciones', N'instituciones', N'crear-institucion', N'crear una institucion', N'Este subflujo te guia para registrar una institucion y dejar lista su informacion base.', 30),
  (N'/matricula', N'matricula', N'crear-matricula', N'crear una matricula', N'Este subflujo sirve para inscribir correctamente a un estudiante en un grupo.', 40),
  (N'/matricula', N'matricula', N'importar-matriculas', N'importar matriculas', N'Este subflujo sirve para cargar matriculas masivas y revisar errores de grupo o identificacion.', 50),
  (N'/estudiantes', N'estudiantes', N'crear-estudiante', N'registrar un estudiante', N'Este subflujo te acompana para crear la ficha principal del estudiante sin dejar datos clave incompletos.', 60),
  (N'/estudiantes', N'estudiantes', N'boleta-conducta', N'trabajar boleta de conducta', N'Este subflujo te orienta para registrar o consultar observaciones de conducta del estudiante.', 70),
  (N'/parametrizaciones/evaluaciones', N'parametrizaciones', N'crear-plantilla-evaluacion', N'crear plantilla de evaluacion', N'Este subflujo te guia para levantar una plantilla con rubros, porcentajes y actividades.', 80),
  (N'/parametrizaciones/evaluaciones', N'parametrizaciones', N'copiar-plantilla-evaluacion', N'copiar plantilla de evaluacion', N'Este subflujo te ayuda a duplicar una plantilla existente sin perder la estructura base.', 90),
  (N'/parametrizaciones/promt-ia', N'parametrizaciones', N'guardar-plantilla-ia', N'guardar plantilla IA', N'Este subflujo te orienta para guardar una plantilla IA clara y reutilizable.', 100),
  (N'/parametrizaciones/promt-ia', N'parametrizaciones', N'copiar-plantilla-ia', N'copiar plantilla IA', N'Este subflujo sirve para reutilizar una plantilla IA y ajustarla sin empezar de cero.', 110),
  (N'/asistencia', N'asistencia', N'tomar-lista', N'tomar asistencia', N'Este subflujo te acompana para buscar la clase correcta y marcar la asistencia del grupo.', 120),
  (N'/horarios', N'horarios', N'consulta-administrativa', N'consulta administrativa de horarios', N'Este subflujo te ayuda a buscar horarios por seccion, estudiante o profesor.', 130),
  (N'/seguimiento-notas', N'seguimiento-notas', N'guardar-seguimiento', N'guardar seguimiento de notas', N'Este subflujo te orienta para registrar seguimiento y revisar el consolidado del estudiante.', 140),
  (N'/planeamiento-ia', N'planeamiento-ia', N'generar-planeamiento', N'generar planeamiento con IA', N'Este subflujo te guia para preparar el contexto y luego generar el planeamiento con IA.', 150);

MERGE dbo.AsistenteSubflujoContexto AS target
USING @SubflowContexts AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.ClaveSubflujo = source.ClaveSubflujo
WHEN MATCHED THEN
  UPDATE SET
    ModuloClave = source.ModuloClave,
    Titulo = source.Titulo,
    Resumen = source.Resumen,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ModuloClave, ClaveSubflujo, Titulo, Resumen, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ModuloClave, source.ClaveSubflujo, source.Titulo, source.Resumen, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @SubflowItems TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ClaveSubflujo NVARCHAR(80) NOT NULL,
  TipoItem NVARCHAR(20) NOT NULL,
  Descripcion NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @SubflowItems (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual)
VALUES
  (N'/usuarios', N'crear-usuario', N'ALIAS', N'crear usuario', 1),
  (N'/usuarios', N'crear-usuario', N'ALIAS', N'nuevo usuario', 2),
  (N'/usuarios', N'crear-usuario', N'HINT', N'Llena primero institucion, nombre, correo, cedula y rol.', 1),
  (N'/usuarios', N'crear-usuario', N'HINT', N'Revisa que el rol coincida con el acceso real que necesita la persona.', 2),
  (N'/usuarios', N'crear-usuario', N'EXAMPLE', N'Que lleno primero para crear un usuario?', 1),
  (N'/usuarios', N'crear-usuario', N'EXAMPLE', N'Que reviso antes de guardar este usuario?', 2),

  (N'/usuarios', N'importar-usuarios', N'ALIAS', N'importar usuarios', 1),
  (N'/usuarios', N'importar-usuarios', N'ALIAS', N'carga masiva de usuarios', 2),
  (N'/usuarios', N'importar-usuarios', N'HINT', N'Confirma que el archivo tenga columnas validas antes de importarlo.', 1),
  (N'/usuarios', N'importar-usuarios', N'HINT', N'Si falla una fila, revisa correo, cedula y rol.', 2),
  (N'/usuarios', N'importar-usuarios', N'EXAMPLE', N'Como hago la importacion de usuarios?', 1),

  (N'/instituciones', N'crear-institucion', N'ALIAS', N'crear institucion', 1),
  (N'/instituciones', N'crear-institucion', N'ALIAS', N'nueva institucion', 2),
  (N'/instituciones', N'crear-institucion', N'HINT', N'Llena al menos nombre y datos base antes de guardar.', 1),
  (N'/instituciones', N'crear-institucion', N'EXAMPLE', N'Que hago para registrar una institucion nueva?', 1),

  (N'/matricula', N'crear-matricula', N'ALIAS', N'crear matricula', 1),
  (N'/matricula', N'crear-matricula', N'ALIAS', N'matricular estudiante', 2),
  (N'/matricula', N'crear-matricula', N'HINT', N'Busca primero al estudiante y luego define ano lectivo y grupo.', 1),
  (N'/matricula', N'crear-matricula', N'HINT', N'Si es traslado, confirma bien la seccion destino antes de guardar.', 2),
  (N'/matricula', N'crear-matricula', N'EXAMPLE', N'Como matriculo un alumno aqui?', 1),

  (N'/matricula', N'importar-matriculas', N'ALIAS', N'importar matriculas', 1),
  (N'/matricula', N'importar-matriculas', N'ALIAS', N'carga masiva de matriculas', 2),
  (N'/matricula', N'importar-matriculas', N'HINT', N'Revisa que cada cedula y grupo exista antes de importar.', 1),
  (N'/matricula', N'importar-matriculas', N'EXAMPLE', N'Que validaciones hago antes de importar matriculas?', 1),

  (N'/estudiantes', N'crear-estudiante', N'ALIAS', N'crear estudiante', 1),
  (N'/estudiantes', N'crear-estudiante', N'ALIAS', N'nuevo estudiante', 2),
  (N'/estudiantes', N'crear-estudiante', N'HINT', N'Empieza por identificacion y nombre completo.', 1),
  (N'/estudiantes', N'crear-estudiante', N'HINT', N'Evita duplicados revisando si la cedula ya existe.', 2),
  (N'/estudiantes', N'crear-estudiante', N'EXAMPLE', N'Que hago primero para registrar un estudiante?', 1),

  (N'/estudiantes', N'boleta-conducta', N'ALIAS', N'boleta de conducta', 1),
  (N'/estudiantes', N'boleta-conducta', N'ALIAS', N'conducta del estudiante', 2),
  (N'/estudiantes', N'boleta-conducta', N'HINT', N'Ubica primero al estudiante correcto antes de registrar observaciones.', 1),
  (N'/estudiantes', N'boleta-conducta', N'EXAMPLE', N'Como trabajo la boleta de conducta?', 1),

  (N'/parametrizaciones/evaluaciones', N'crear-plantilla-evaluacion', N'ALIAS', N'crear plantilla de evaluacion', 1),
  (N'/parametrizaciones/evaluaciones', N'crear-plantilla-evaluacion', N'ALIAS', N'nueva plantilla de evaluacion', 2),
  (N'/parametrizaciones/evaluaciones', N'crear-plantilla-evaluacion', N'HINT', N'Define nombre, ano, periodo y materia antes de cargar rubros.', 1),
  (N'/parametrizaciones/evaluaciones', N'crear-plantilla-evaluacion', N'HINT', N'Valida que la suma de porcentajes quede correcta.', 2),
  (N'/parametrizaciones/evaluaciones', N'crear-plantilla-evaluacion', N'EXAMPLE', N'Como hago una plantilla nueva de evaluacion?', 1),

  (N'/parametrizaciones/evaluaciones', N'copiar-plantilla-evaluacion', N'ALIAS', N'copiar plantilla de evaluacion', 1),
  (N'/parametrizaciones/evaluaciones', N'copiar-plantilla-evaluacion', N'ALIAS', N'duplicar plantilla de evaluacion', 2),
  (N'/parametrizaciones/evaluaciones', N'copiar-plantilla-evaluacion', N'HINT', N'Revisa el nombre destino para no confundirla con la original.', 1),
  (N'/parametrizaciones/evaluaciones', N'copiar-plantilla-evaluacion', N'EXAMPLE', N'Que debo revisar al copiar una plantilla de evaluacion?', 1),

  (N'/parametrizaciones/promt-ia', N'guardar-plantilla-ia', N'ALIAS', N'guardar plantilla ia', 1),
  (N'/parametrizaciones/promt-ia', N'guardar-plantilla-ia', N'ALIAS', N'crear plantilla ia', 2),
  (N'/parametrizaciones/promt-ia', N'guardar-plantilla-ia', N'HINT', N'Procura que el prompt quede claro y reutilizable para otros docentes.', 1),
  (N'/parametrizaciones/promt-ia', N'guardar-plantilla-ia', N'EXAMPLE', N'Como guardo una plantilla IA aqui?', 1),

  (N'/parametrizaciones/promt-ia', N'copiar-plantilla-ia', N'ALIAS', N'copiar plantilla ia', 1),
  (N'/parametrizaciones/promt-ia', N'copiar-plantilla-ia', N'ALIAS', N'duplicar plantilla ia', 2),
  (N'/parametrizaciones/promt-ia', N'copiar-plantilla-ia', N'HINT', N'Cambia el nombre y ajusta lo necesario antes de guardarla.', 1),
  (N'/parametrizaciones/promt-ia', N'copiar-plantilla-ia', N'EXAMPLE', N'Que hago para copiar una plantilla IA?', 1),

  (N'/asistencia', N'tomar-lista', N'ALIAS', N'tomar asistencia', 1),
  (N'/asistencia', N'tomar-lista', N'ALIAS', N'pasar lista', 2),
  (N'/asistencia', N'tomar-lista', N'HINT', N'Primero busca la clase correcta por grupo, fecha o bloque.', 1),
  (N'/asistencia', N'tomar-lista', N'HINT', N'Revisa antes de guardar si hay ausencias justificadas o tardias.', 2),
  (N'/asistencia', N'tomar-lista', N'EXAMPLE', N'Como paso asistencia en esta pantalla?', 1),

  (N'/horarios', N'consulta-administrativa', N'ALIAS', N'consulta administrativa', 1),
  (N'/horarios', N'consulta-administrativa', N'ALIAS', N'buscar horario', 2),
  (N'/horarios', N'consulta-administrativa', N'HINT', N'Puedes buscar por seccion, estudiante o profesor.', 1),
  (N'/horarios', N'consulta-administrativa', N'EXAMPLE', N'Como consulto el horario de una seccion?', 1),

  (N'/seguimiento-notas', N'guardar-seguimiento', N'ALIAS', N'guardar seguimiento', 1),
  (N'/seguimiento-notas', N'guardar-seguimiento', N'ALIAS', N'seguimiento de notas', 2),
  (N'/seguimiento-notas', N'guardar-seguimiento', N'HINT', N'Ubica el estudiante correcto y confirma el periodo antes de guardar.', 1),
  (N'/seguimiento-notas', N'guardar-seguimiento', N'EXAMPLE', N'Como guardo el seguimiento de notas?', 1),

  (N'/planeamiento-ia', N'generar-planeamiento', N'ALIAS', N'generar planeamiento', 1),
  (N'/planeamiento-ia', N'generar-planeamiento', N'ALIAS', N'planeamiento con ia', 2),
  (N'/planeamiento-ia', N'generar-planeamiento', N'HINT', N'Primero selecciona habilidades, mes, periodicidad y competencia general.', 1),
  (N'/planeamiento-ia', N'generar-planeamiento', N'HINT', N'Revisa el borrador antes de guardarlo como definitivo.', 2),
  (N'/planeamiento-ia', N'generar-planeamiento', N'EXAMPLE', N'Que hago para generar el planeamiento aqui?', 1);

MERGE dbo.AsistenteSubflujoItem AS target
USING @SubflowItems AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.ClaveSubflujo = source.ClaveSubflujo
 AND target.TipoItem = source.TipoItem
 AND target.Descripcion = source.Descripcion
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ClaveSubflujo, source.TipoItem, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

IF OBJECT_ID('dbo.AsistentePatronConversacion', 'U') IS NOT NULL
BEGIN
  DECLARE @Patterns TABLE (
    ClavePatron NVARCHAR(80) NOT NULL,
    Frase NVARCHAR(200) NOT NULL,
    OrdenVisual INT NOT NULL
  );

  INSERT INTO @Patterns (ClavePatron, Frase, OrdenVisual)
  VALUES
    (N'CURRENT_SUBFLOW', N'que hago aqui', 1),
    (N'CURRENT_SUBFLOW', N'ayudame aqui', 2),
    (N'CURRENT_SUBFLOW', N'que sigue aqui', 3),
    (N'CURRENT_SUBFLOW', N'aca que hago', 4),
    (N'CURRENT_SUBFLOW', N'en este paso que hago', 5),
    (N'CURRENT_SUBFLOW', N'en esta parte que sigue', 6),
    (N'CURRENT_SUBFLOW', N'ahora que hago', 7),
    (N'CURRENT_SUBFLOW', N'y aca', 8),
    (N'CURRENT_SUBFLOW', N'y aqui', 9),
    (N'CURRENT_SUBFLOW', N'y aca que se hace', 10),
    (N'CURRENT_SUBFLOW', N'y aqui que se hace', 11),
    (N'CURRENT_SUBFLOW', N'sabes en que pantalla estoy', 12);

  MERGE dbo.AsistentePatronConversacion AS target
  USING @Patterns AS source
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
END;
