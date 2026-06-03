IF OBJECT_ID('dbo.AsistenteContextoPantalla', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteContextoPantalla (
    AsistenteContextoPantallaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    ModuloClave NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteContextoPantalla_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteContextoPantalla_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteContextoPantalla_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteContextoPantalla_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteContextoPantalla_Ruta UNIQUE (RutaContexto),
    CONSTRAINT FK_AsistenteContextoPantalla_Modulo FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteContextoPantalla_Modulo
    ON dbo.AsistenteContextoPantalla (ModuloClave, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteContextoPantallaItem', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteContextoPantallaItem (
    AsistenteContextoPantallaItemId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    RutaContexto NVARCHAR(200) NOT NULL,
    TipoItem NVARCHAR(20) NOT NULL,
    Descripcion NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteContextoPantallaItem_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteContextoPantallaItem_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteContextoPantallaItem_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteContextoPantallaItem_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteContextoPantallaItem_Ruta FOREIGN KEY (RutaContexto)
      REFERENCES dbo.AsistenteContextoPantalla (RutaContexto)
  );

  CREATE INDEX IX_AsistenteContextoPantallaItem_Ruta
    ON dbo.AsistenteContextoPantallaItem (RutaContexto, TipoItem, Activo, OrdenVisual);
END;

DECLARE @ScreenContexts TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  ModuloClave NVARCHAR(80) NOT NULL,
  Titulo NVARCHAR(150) NOT NULL,
  Resumen NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @ScreenContexts (RutaContexto, ModuloClave, Titulo, Resumen, OrdenVisual)
VALUES
  (N'/instituciones', N'instituciones', N'Instituciones', N'Aquí podés crear, editar o ubicar instituciones activas.', 10),
  (N'/usuarios', N'usuarios', N'Usuarios', N'Aquí podés crear usuarios, importar desde Excel y gestionar accesos.', 20),
  (N'/administrativo', N'administrativo', N'Administrativo', N'Aquí están las pestañas base de operación académica: años, periodos, grupos, materias, asignaciones y horarios.', 30),
  (N'/matricula', N'matricula', N'Matrícula', N'Aquí podés crear matrículas, mover estudiantes de sección y revisar boletas.', 40),
  (N'/parametrizaciones/evaluaciones', N'parametrizaciones', N'Parametrizaciones - Evaluaciones', N'Aquí configurás plantillas, rubros, actividades y niveles de desempeño.', 50),
  (N'/parametrizaciones/promt-ia', N'parametrizaciones', N'Parametrizaciones - Promt IA', N'Aquí creás y ajustás plantillas de Promt IA para otros módulos.', 60),
  (N'/estudiantes', N'estudiantes', N'Estudiantes', N'Aquí podés registrar, buscar, editar y revisar detalle de estudiantes.', 70),
  (N'/horarios', N'horarios', N'Horarios', N'Aquí podés ver tu horario, tus grupos guía o hacer consulta administrativa.', 80),
  (N'/asistencia', N'asistencia', N'Asistencia', N'Aquí buscás clases programadas y luego tomás o editás la asistencia.', 90),
  (N'/seguimiento-notas', N'seguimiento-notas', N'Seguimiento de Notas', N'Aquí registrás seguimiento por estudiante y revisás el consolidado.', 100),
  (N'/gestion-profe', N'gestion-profe', N'Gestión del Profe', N'Aquí trabajás asistencia, notas, seguimiento diario, planeamiento y reportes del grupo.', 110),
  (N'/planeamiento-ia', N'planeamiento-ia', N'Planeamiento con IA', N'Aquí administrás habilidades y generás o guardás planeamientos con IA.', 120),
  (N'/reportes', N'reportes', N'Reportes', N'Aquí consultás reportes y generás certificaciones o constancias.', 130);

MERGE dbo.AsistenteContextoPantalla AS target
USING @ScreenContexts AS source
  ON target.RutaContexto = source.RutaContexto
WHEN MATCHED THEN
  UPDATE SET
    ModuloClave = source.ModuloClave,
    Titulo = source.Titulo,
    Resumen = source.Resumen,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, ModuloClave, Titulo, Resumen, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.ModuloClave, source.Titulo, source.Resumen, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @ScreenItems TABLE (
  RutaContexto NVARCHAR(200) NOT NULL,
  TipoItem NVARCHAR(20) NOT NULL,
  Descripcion NVARCHAR(MAX) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @ScreenItems (RutaContexto, TipoItem, Descripcion, OrdenVisual)
VALUES
  (N'/instituciones', N'HINT', N'Usá "Agregar institución" si vas a registrar una nueva.', 1),
  (N'/instituciones', N'HINT', N'Si ya existe, primero buscala antes de duplicarla.', 2),
  (N'/instituciones', N'EXAMPLE', N'cómo creo una institución', 10),
  (N'/instituciones', N'EXAMPLE', N'cómo edito una institución', 11),

  (N'/usuarios', N'HINT', N'Si la persona ya existe, buscala primero por correo, nombre o cédula.', 1),
  (N'/usuarios', N'HINT', N'La clave inicial suele quedar como el número de cédula.', 2),
  (N'/usuarios', N'EXAMPLE', N'cómo creo un usuario', 10),
  (N'/usuarios', N'EXAMPLE', N'cómo restablezco una clave', 11),
  (N'/usuarios', N'EXAMPLE', N'cómo importo usuarios', 12),

  (N'/administrativo', N'HINT', N'Lo normal es avanzar de izquierda a derecha según el flujo.', 1),
  (N'/administrativo', N'HINT', N'Si me decís la pestaña, te la explico paso a paso.', 2),
  (N'/administrativo', N'EXAMPLE', N'qué hay en administrativo', 10),
  (N'/administrativo', N'EXAMPLE', N'cómo creo un grupo', 11),
  (N'/administrativo', N'EXAMPLE', N'cómo hago el horario de clases', 12),

  (N'/matricula', N'HINT', N'El estudiante debe existir antes de matricularlo.', 1),
  (N'/matricula', N'HINT', N'Si es un traslado, revisá bien sección origen y destino.', 2),
  (N'/matricula', N'EXAMPLE', N'cómo matriculo un alumno', 10),
  (N'/matricula', N'EXAMPLE', N'cómo cambio un alumno de sección', 11),

  (N'/parametrizaciones/evaluaciones', N'HINT', N'Primero crea o abre una plantilla.', 1),
  (N'/parametrizaciones/evaluaciones', N'HINT', N'Luego agrega rubros y actividades con sus porcentajes.', 2),
  (N'/parametrizaciones/evaluaciones', N'EXAMPLE', N'cómo creo una plantilla de evaluación', 10),
  (N'/parametrizaciones/evaluaciones', N'EXAMPLE', N'cómo agrego un rubro', 11),
  (N'/parametrizaciones/evaluaciones', N'EXAMPLE', N'cómo activo indicadores', 12),

  (N'/parametrizaciones/promt-ia', N'HINT', N'Podés crear una nueva o copiar una base existente.', 1),
  (N'/parametrizaciones/promt-ia', N'HINT', N'Conviene validar luego el resultado en Planeamiento o Evaluaciones.', 2),
  (N'/parametrizaciones/promt-ia', N'EXAMPLE', N'cómo creo una plantilla de promt ia', 10),
  (N'/parametrizaciones/promt-ia', N'EXAMPLE', N'cómo copio una plantilla ia', 11),

  (N'/estudiantes', N'HINT', N'Si querés ubicar uno, usá primero el buscador.', 1),
  (N'/estudiantes', N'HINT', N'Si luego debe quedar en grupo, seguí con Matrícula.', 2),
  (N'/estudiantes', N'EXAMPLE', N'cómo registro un estudiante', 10),
  (N'/estudiantes', N'EXAMPLE', N'cómo busco un alumno', 11),
  (N'/estudiantes', N'EXAMPLE', N'cómo genero una boleta de conducta', 12),

  (N'/horarios', N'HINT', N'Elegí la pestaña según si buscás docente, sección o estudiante.', 1),
  (N'/horarios', N'HINT', N'Para consultas administrativas, completá primero los filtros generales.', 2),
  (N'/horarios', N'EXAMPLE', N'cómo veo mi horario', 10),
  (N'/horarios', N'EXAMPLE', N'cómo busco el horario de una sección', 11),
  (N'/horarios', N'EXAMPLE', N'cómo consulto el horario de un estudiante', 12),

  (N'/asistencia', N'HINT', N'Primero buscá la clase.', 1),
  (N'/asistencia', N'HINT', N'Después usá "Tomar lista" o "Ver / editar".', 2),
  (N'/asistencia', N'EXAMPLE', N'cómo paso asistencia', 10),
  (N'/asistencia', N'EXAMPLE', N'por qué no me salen clases programadas', 11),
  (N'/asistencia', N'EXAMPLE', N'cómo edito una asistencia guardada', 12),

  (N'/seguimiento-notas', N'HINT', N'Seleccioná estudiante y componente antes de guardar.', 1),
  (N'/seguimiento-notas', N'HINT', N'Después revisá el resultado del registro y el consolidado.', 2),
  (N'/seguimiento-notas', N'EXAMPLE', N'cómo guardo seguimiento', 10),
  (N'/seguimiento-notas', N'EXAMPLE', N'cómo guardo un examen', 11),
  (N'/seguimiento-notas', N'EXAMPLE', N'cómo reviso el consolidado del estudiante', 12),

  (N'/gestion-profe', N'HINT', N'Primero elegí grupo y materia.', 1),
  (N'/gestion-profe', N'HINT', N'Después abrí el panel específico que querés trabajar.', 2),
  (N'/gestion-profe', N'EXAMPLE', N'cómo califico tareas', 10),
  (N'/gestion-profe', N'EXAMPLE', N'cómo hago un planeamiento', 11),
  (N'/gestion-profe', N'EXAMPLE', N'cómo saco reportes del grupo', 12),

  (N'/planeamiento-ia', N'HINT', N'Podés crear habilidades o importarlas desde Excel.', 1),
  (N'/planeamiento-ia', N'HINT', N'Luego generás el borrador y lo guardás en Gestión del Profe.', 2),
  (N'/planeamiento-ia', N'EXAMPLE', N'cómo creo una habilidad', 10),
  (N'/planeamiento-ia', N'EXAMPLE', N'cómo genero un planeamiento con ia', 11),
  (N'/planeamiento-ia', N'EXAMPLE', N'cómo guardo el planeamiento', 12),

  (N'/reportes', N'HINT', N'Elegí primero el tipo de reporte.', 1),
  (N'/reportes', N'HINT', N'Completá la sección y filtros antes de consultar.', 2),
  (N'/reportes', N'EXAMPLE', N'cómo saco un reporte de notas', 10),
  (N'/reportes', N'EXAMPLE', N'cómo exporto a pdf', 11),
  (N'/reportes', N'EXAMPLE', N'cómo genero una constancia de estudio', 12);

MERGE dbo.AsistenteContextoPantallaItem AS target
USING @ScreenItems AS source
  ON target.RutaContexto = source.RutaContexto
 AND target.TipoItem = source.TipoItem
 AND target.OrdenVisual = source.OrdenVisual
WHEN MATCHED THEN
  UPDATE SET
    Descripcion = source.Descripcion,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (RutaContexto, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.RutaContexto, source.TipoItem, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
