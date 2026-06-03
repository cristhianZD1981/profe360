IF OBJECT_ID('dbo.AsistenteDetalleGuia', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteDetalleGuia (
    AsistenteDetalleGuiaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ModuloClave NVARCHAR(80) NOT NULL,
    ClaveDetalle NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    RutaContexto NVARCHAR(200) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    AllowedRolesJson NVARCHAR(MAX) NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteDetalleGuia_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteDetalleGuia_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleGuia_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleGuia_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteDetalleGuia_Clave UNIQUE (ModuloClave, ClaveDetalle),
    CONSTRAINT FK_AsistenteDetalleGuia_Modulo FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteDetalleGuia_Modulo
    ON dbo.AsistenteDetalleGuia (ModuloClave, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteDetalleAlias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteDetalleAlias (
    AsistenteDetalleAliasId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AsistenteDetalleGuiaId INT NOT NULL,
    Alias NVARCHAR(150) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteDetalleAlias_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteDetalleAlias_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleAlias_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleAlias_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteDetalleAlias_Guia FOREIGN KEY (AsistenteDetalleGuiaId)
      REFERENCES dbo.AsistenteDetalleGuia (AsistenteDetalleGuiaId)
  );

  CREATE INDEX IX_AsistenteDetalleAlias_Guia
    ON dbo.AsistenteDetalleAlias (AsistenteDetalleGuiaId, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteDetalleItem', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteDetalleItem (
    AsistenteDetalleItemId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AsistenteDetalleGuiaId INT NOT NULL,
    TipoItem NVARCHAR(20) NOT NULL,
    Descripcion NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteDetalleItem_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteDetalleItem_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleItem_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteDetalleItem_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteDetalleItem_Guia FOREIGN KEY (AsistenteDetalleGuiaId)
      REFERENCES dbo.AsistenteDetalleGuia (AsistenteDetalleGuiaId)
  );

  CREATE INDEX IX_AsistenteDetalleItem_Guia
    ON dbo.AsistenteDetalleItem (AsistenteDetalleGuiaId, TipoItem, Activo, OrdenVisual);
END;

DECLARE @DetailGuides TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveDetalle NVARCHAR(80) NOT NULL,
  Titulo NVARCHAR(150) NOT NULL,
  RutaContexto NVARCHAR(200) NOT NULL,
  Resumen NVARCHAR(MAX) NOT NULL,
  AllowedRolesJson NVARCHAR(MAX) NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @DetailGuides (ModuloClave, ClaveDetalle, Titulo, RutaContexto, Resumen, AllowedRolesJson, OrdenVisual)
VALUES
  (N'parametrizaciones', N'evaluaciones', N'Evaluaciones', N'/parametrizaciones', N'Submodulo para crear plantillas de evaluacion, rubros, actividades y niveles de desempeno.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 300),
  (N'parametrizaciones', N'promt-ia', N'Promt IA', N'/parametrizaciones', N'Submodulo para crear, copiar, editar y descargar plantillas de Promt IA.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 310),
  (N'matricula', N'registro-matricula', N'Registro de matricula', N'/matricula', N'Panel para crear, editar, buscar, reactivar y ver boletas de matricula.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 320),
  (N'matricula', N'importacion-matriculas', N'Importacion de matriculas', N'/matricula', N'Flujo para descargar plantilla, importar Excel y revisar el resumen de matriculas.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 330),
  (N'estudiantes', N'registro-estudiante', N'Registro de estudiante', N'/estudiantes', N'Panel para registrar, editar, reactivar y consultar el detalle del estudiante.', NULL, 340),
  (N'estudiantes', N'busqueda-estudiantes', N'Busqueda de estudiantes', N'/estudiantes', N'Panel para ubicar estudiantes por identificacion, nombre, nacionalidad, tipo o ruta.', NULL, 350),
  (N'estudiantes', N'importacion-estudiantes', N'Importacion de estudiantes', N'/estudiantes', N'Flujo para descargar plantilla, importar Excel y exportar el resumen de importacion.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 360),
  (N'estudiantes', N'boleta-conducta', N'Boleta de conducta', N'/estudiantes', N'Flujo del profesor para generar e imprimir la boleta de reporte de conducta.', N'["PROFESOR","PROFESOR_GUIA"]', 370),
  (N'reportes', N'consulta-reportes', N'Consulta de reportes', N'/reportes', N'Panel para consultar reportes, filtrar por seccion y exportar en Excel o PDF.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR_GUIA"]', 380),
  (N'reportes', N'certificaciones', N'Certificaciones', N'/reportes', N'Panel para generar constancias de estudio segun seccion, estudiante y motivo.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR_GUIA"]', 390),
  (N'planeamiento-ia', N'habilidades', N'Habilidades', N'/planeamiento-ia', N'Panel para crear, editar, desactivar, reactivar e importar habilidades.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 400),
  (N'planeamiento-ia', N'generar-planeamiento', N'Generar planeamiento con IA', N'/planeamiento-ia', N'Panel para seleccionar plantilla, habilidades y generar el borrador del planeamiento.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 410),
  (N'planeamiento-ia', N'guardar-planeamiento', N'Guardar planeamiento', N'/planeamiento-ia', N'Panel para enviar el planeamiento generado a Gestion del Profe con grupo, periodo y materia.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 420);

MERGE dbo.AsistenteDetalleGuia AS target
USING @DetailGuides AS source
  ON target.ModuloClave = source.ModuloClave
 AND target.ClaveDetalle = source.ClaveDetalle
WHEN MATCHED THEN
  UPDATE SET
    Titulo = source.Titulo,
    RutaContexto = source.RutaContexto,
    Resumen = source.Resumen,
    AllowedRolesJson = source.AllowedRolesJson,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (ModuloClave, ClaveDetalle, Titulo, RutaContexto, Resumen, AllowedRolesJson, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.ModuloClave, source.ClaveDetalle, source.Titulo, source.RutaContexto, source.Resumen, source.AllowedRolesJson, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @DetailAliases TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveDetalle NVARCHAR(80) NOT NULL,
  Alias NVARCHAR(150) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @DetailAliases (ModuloClave, ClaveDetalle, Alias, OrdenVisual)
VALUES
  (N'parametrizaciones', N'evaluaciones', N'evaluaciones', 1),
  (N'parametrizaciones', N'evaluaciones', N'plantillas de evaluacion', 2),
  (N'parametrizaciones', N'evaluaciones', N'rubros de calificacion', 3),
  (N'parametrizaciones', N'evaluaciones', N'niveles de desempeno', 4),
  (N'parametrizaciones', N'promt-ia', N'promt ia', 1),
  (N'parametrizaciones', N'promt-ia', N'configuracion ia', 2),
  (N'parametrizaciones', N'promt-ia', N'plantillas ia', 3),
  (N'parametrizaciones', N'promt-ia', N'copiar plantilla ia', 4),
  (N'matricula', N'registro-matricula', N'matricula', 1),
  (N'matricula', N'registro-matricula', N'registro de matricula', 2),
  (N'matricula', N'registro-matricula', N'boleta de matricula', 3),
  (N'matricula', N'registro-matricula', N'traslado de seccion', 4),
  (N'matricula', N'importacion-matriculas', N'importar matriculas', 1),
  (N'matricula', N'importacion-matriculas', N'importacion de matriculas', 2),
  (N'matricula', N'importacion-matriculas', N'plantilla de matriculas', 3),
  (N'estudiantes', N'registro-estudiante', N'registrar estudiante', 1),
  (N'estudiantes', N'registro-estudiante', N'editar estudiante', 2),
  (N'estudiantes', N'registro-estudiante', N'detalle del estudiante', 3),
  (N'estudiantes', N'busqueda-estudiantes', N'buscar estudiante', 1),
  (N'estudiantes', N'busqueda-estudiantes', N'busqueda de estudiantes', 2),
  (N'estudiantes', N'busqueda-estudiantes', N'consultar estudiante', 3),
  (N'estudiantes', N'importacion-estudiantes', N'importar estudiantes', 1),
  (N'estudiantes', N'importacion-estudiantes', N'plantilla de estudiantes', 2),
  (N'estudiantes', N'importacion-estudiantes', N'resumen de importacion', 3),
  (N'estudiantes', N'boleta-conducta', N'boleta de conducta', 1),
  (N'estudiantes', N'boleta-conducta', N'reporte de conducta', 2),
  (N'estudiantes', N'boleta-conducta', N'generar boleta', 3),
  (N'reportes', N'consulta-reportes', N'reportes', 1),
  (N'reportes', N'consulta-reportes', N'reporte de asistencia', 2),
  (N'reportes', N'consulta-reportes', N'reporte de notas', 3),
  (N'reportes', N'consulta-reportes', N'exportar excel', 4),
  (N'reportes', N'consulta-reportes', N'exportar pdf', 5),
  (N'reportes', N'certificaciones', N'certificaciones', 1),
  (N'reportes', N'certificaciones', N'constancia de estudio', 2),
  (N'reportes', N'certificaciones', N'generar constancia', 3),
  (N'planeamiento-ia', N'habilidades', N'habilidades', 1),
  (N'planeamiento-ia', N'habilidades', N'importar excel', 2),
  (N'planeamiento-ia', N'habilidades', N'crear habilidad', 3),
  (N'planeamiento-ia', N'generar-planeamiento', N'generar planeamiento', 1),
  (N'planeamiento-ia', N'generar-planeamiento', N'generar con ia', 2),
  (N'planeamiento-ia', N'generar-planeamiento', N'plantilla ia', 3),
  (N'planeamiento-ia', N'guardar-planeamiento', N'guardar planeamiento', 1),
  (N'planeamiento-ia', N'guardar-planeamiento', N'guardar en planeamientos', 2),
  (N'planeamiento-ia', N'guardar-planeamiento', N'gestion del profe', 3);

MERGE dbo.AsistenteDetalleAlias AS target
USING (
  SELECT d.AsistenteDetalleGuiaId, a.Alias, a.OrdenVisual
  FROM @DetailAliases a
  INNER JOIN dbo.AsistenteDetalleGuia d
    ON d.ModuloClave = a.ModuloClave
   AND d.ClaveDetalle = a.ClaveDetalle
) AS source
  ON target.AsistenteDetalleGuiaId = source.AsistenteDetalleGuiaId
 AND target.Alias = source.Alias
WHEN MATCHED THEN
  UPDATE SET OrdenVisual = source.OrdenVisual, Activo = 1, UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (AsistenteDetalleGuiaId, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.AsistenteDetalleGuiaId, source.Alias, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @DetailItems TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  ClaveDetalle NVARCHAR(80) NOT NULL,
  TipoItem NVARCHAR(20) NOT NULL,
  OrdenVisual INT NOT NULL,
  Descripcion NVARCHAR(MAX) NOT NULL
);

INSERT INTO @DetailItems (ModuloClave, ClaveDetalle, TipoItem, OrdenVisual, Descripcion)
VALUES
  (N'parametrizaciones', N'evaluaciones', N'PASO', 1, N'Entra a "Parametrizaciones" y luego elegi "Evaluaciones".'),
  (N'parametrizaciones', N'evaluaciones', N'PASO', 2, N'Usa "Nueva plantilla" si vas a crear la base o "Ver" para abrir una plantilla existente.'),
  (N'parametrizaciones', N'evaluaciones', N'PASO', 3, N'Completa "Ano lectivo", "Periodo", "Materia" y luego guarda con "Guardar plantilla".'),
  (N'parametrizaciones', N'evaluaciones', N'PASO', 4, N'Dentro del detalle usa "Agregar Rubro de Calificacion" y despues "Guardar Rubro de Calificacion".'),
  (N'parametrizaciones', N'evaluaciones', N'PASO', 5, N'Luego crea actividades evaluativas con "Guardar actividad" y activa indicadores cuando aplique.'),
  (N'parametrizaciones', N'evaluaciones', N'VALIDACION', 1, N'Debe existir al menos un ano lectivo, un periodo y una materia disponibles.'),
  (N'parametrizaciones', N'evaluaciones', N'VALIDACION', 2, N'Si la plantilla va a usarse en Seguimiento Diario, revisa la suma de porcentajes por rubro y por actividad.'),
  (N'parametrizaciones', N'evaluaciones', N'ERROR', 1, N'Si faltan periodos o materias en el formulario, primero revisa la configuracion academica.'),
  (N'parametrizaciones', N'evaluaciones', N'ERROR', 2, N'Si no te deja editar, la plantilla puede no haber sido creada por tu usuario.'),
  (N'parametrizaciones', N'evaluaciones', N'ACCION', 1, N'Si queres reutilizar la estructura, usa "Copiar plantilla" en vez de rehacerla desde cero.'),

  (N'parametrizaciones', N'promt-ia', N'PASO', 1, N'Entra a "Parametrizaciones" y luego elegi "Promt IA".'),
  (N'parametrizaciones', N'promt-ia', N'PASO', 2, N'Si hace falta, crea primero un "Nuevo tipo de plantilla IA".'),
  (N'parametrizaciones', N'promt-ia', N'PASO', 3, N'Usa "Nueva plantilla de Promt IA" o "Editar plantilla de Promt IA" para completar nombre, instrucciones y formato.'),
  (N'parametrizaciones', N'promt-ia', N'PASO', 4, N'Guarda con "Guardar plantilla" o duplica una base con "Copiar plantilla".'),
  (N'parametrizaciones', N'promt-ia', N'PASO', 5, N'Valida la salida real desde Planeamiento o Evaluaciones y ajusta si hace falta.'),
  (N'parametrizaciones', N'promt-ia', N'VALIDACION', 1, N'Debes seleccionar el tipo de generacion IA y escribir el nombre de la plantilla.'),
  (N'parametrizaciones', N'promt-ia', N'VALIDACION', 2, N'Las instrucciones principales del sistema no pueden quedar vacias.'),
  (N'parametrizaciones', N'promt-ia', N'ERROR', 1, N'Si no te deja crear tipos, el perfil puede no ser administrativo.'),
  (N'parametrizaciones', N'promt-ia', N'ERROR', 2, N'Si no te deja editar o eliminar, la plantilla puede no haber sido creada por vos.'),
  (N'parametrizaciones', N'promt-ia', N'ACCION', 1, N'Si queres respaldar una plantilla, usa "Descargar Word" antes de hacer cambios grandes.'),

  (N'matricula', N'registro-matricula', N'PASO', 1, N'Entra al modulo "Matricula" y abre la pestaña "Matricula".'),
  (N'matricula', N'registro-matricula', N'PASO', 2, N'Si vas a crear una nueva, usa el formulario "Crear matricula".'),
  (N'matricula', N'registro-matricula', N'PASO', 3, N'Selecciona estudiante, ano lectivo, grupo, fecha y los datos adicionales como tipo, nivel o especialidad.'),
  (N'matricula', N'registro-matricula', N'PASO', 4, N'Si aplica, completa "Correo envio boleta", repitencia o justificacion de excepcion.'),
  (N'matricula', N'registro-matricula', N'PASO', 5, N'Guarda y luego valida el registro en el listado o abre "Ver boleta".'),
  (N'matricula', N'registro-matricula', N'VALIDACION', 1, N'El estudiante debe existir antes de matricularlo.'),
  (N'matricula', N'registro-matricula', N'VALIDACION', 2, N'Deben existir grupo y ano lectivo activos.'),
  (N'matricula', N'registro-matricula', N'ERROR', 1, N'Si el estudiante no aparece en el combo, primero registralo en "Estudiantes".'),
  (N'matricula', N'registro-matricula', N'ERROR', 2, N'Si es un traslado de seccion, revisa origen y destino antes de guardar para no afectar notas y reportes.'),
  (N'matricula', N'registro-matricula', N'ACCION', 1, N'Si una matricula fue desactivada por error, usa "Reactivar" en vez de crearla duplicada.'),

  (N'matricula', N'importacion-matriculas', N'PASO', 1, N'Desde "Matriculas" descarga primero la plantilla de Excel.'),
  (N'matricula', N'importacion-matriculas', N'PASO', 2, N'Selecciona el "Ano lectivo" de la importacion y luego el archivo.'),
  (N'matricula', N'importacion-matriculas', N'PASO', 3, N'Presiona "Importar matriculas" y espera la barra de progreso.'),
  (N'matricula', N'importacion-matriculas', N'PASO', 4, N'Revisa el resumen con creadas, reactivadas, omitidas y errores.'),
  (N'matricula', N'importacion-matriculas', N'PASO', 5, N'Si hace falta, descarga el archivo de resumen para depurar casos.'),
  (N'matricula', N'importacion-matriculas', N'VALIDACION', 1, N'Debes elegir ano lectivo y archivo antes de importar.'),
  (N'matricula', N'importacion-matriculas', N'VALIDACION', 2, N'La plantilla debe conservar las columnas esperadas por el sistema.'),
  (N'matricula', N'importacion-matriculas', N'ERROR', 1, N'Si la importacion omite filas, revisa identificacion, grupo o ano lectivo en el archivo.'),
  (N'matricula', N'importacion-matriculas', N'ACCION', 1, N'Si el error es masivo, corrige el Excel y vuelve a importar en vez de tocar registro por registro.'),

  (N'estudiantes', N'registro-estudiante', N'PASO', 1, N'Entra a "Estudiantes" y usa "Agregar estudiante" para abrir el formulario.'),
  (N'estudiantes', N'registro-estudiante', N'PASO', 2, N'Completa "Datos del estudiante" y los apartados del encargado, salud y contacto que correspondan.'),
  (N'estudiantes', N'registro-estudiante', N'PASO', 3, N'Revisa campos como tipo de estudiante, ruta, foto y datos medicos si aplican.'),
  (N'estudiantes', N'registro-estudiante', N'PASO', 4, N'Guarda y despues, si el alumno debe quedar en grupo, usa el boton "Matricula".'),
  (N'estudiantes', N'registro-estudiante', N'VALIDACION', 1, N'Debes tener permiso para incluir o modificar estudiantes.'),
  (N'estudiantes', N'registro-estudiante', N'VALIDACION', 2, N'La identificacion no debe quedar duplicada.'),
  (N'estudiantes', N'registro-estudiante', N'ERROR', 1, N'Si el sistema avisa que el estudiante ya existe, revisa si corresponde reactivarlo.'),
  (N'estudiantes', N'registro-estudiante', N'ERROR', 2, N'Si no te deja guardar, revisa los campos requeridos del formulario.'),
  (N'estudiantes', N'registro-estudiante', N'ACCION', 1, N'Si solo necesitas revisar informacion, usa "Detalle del estudiante" en vez de editarlo sin necesidad.'),

  (N'estudiantes', N'busqueda-estudiantes', N'PASO', 1, N'Entra a "Busqueda de estudiantes".'),
  (N'estudiantes', N'busqueda-estudiantes', N'PASO', 2, N'Escribe en el filtro un dato como identificacion, nombre, nacionalidad, tipo o ruta.'),
  (N'estudiantes', N'busqueda-estudiantes', N'PASO', 3, N'Presiona "Buscar" y revisa el listado o el resumen por seccion.'),
  (N'estudiantes', N'busqueda-estudiantes', N'PASO', 4, N'Desde acciones podes abrir "Matricula", "Editar", "Detalle", "Carnet" o "Generar Boleta" segun el rol.'),
  (N'estudiantes', N'busqueda-estudiantes', N'VALIDACION', 1, N'Debe existir al menos un valor de busqueda para consultar estudiantes.'),
  (N'estudiantes', N'busqueda-estudiantes', N'ERROR', 1, N'Si no aparece nadie, revisa que la busqueda no tenga espacios o filtros demasiado cerrados.'),
  (N'estudiantes', N'busqueda-estudiantes', N'ACCION', 1, N'Si lo que queres es el alta del alumno, usa "Agregar estudiante" antes de buscar.'),

  (N'estudiantes', N'importacion-estudiantes', N'PASO', 1, N'Usa "Descargar plantilla" para bajar el formato oficial.'),
  (N'estudiantes', N'importacion-estudiantes', N'PASO', 2, N'Carga el archivo desde el formulario de importacion y ejecuta el proceso.'),
  (N'estudiantes', N'importacion-estudiantes', N'PASO', 3, N'Espera a que termine el progreso y revisa el resumen en pantalla.'),
  (N'estudiantes', N'importacion-estudiantes', N'PASO', 4, N'Si necesitas respaldo, presiona "Exportar resumen a Excel".'),
  (N'estudiantes', N'importacion-estudiantes', N'VALIDACION', 1, N'El archivo debe respetar la plantilla y no omitir columnas clave.'),
  (N'estudiantes', N'importacion-estudiantes', N'ERROR', 1, N'Si el proceso falla por filas especificas, revisa identificacion, fechas y datos obligatorios.'),
  (N'estudiantes', N'importacion-estudiantes', N'ACCION', 1, N'Si son pocos casos con error, corrige el archivo y reimporta para mantener consistencia.'),

  (N'estudiantes', N'boleta-conducta', N'PASO', 1, N'Desde el listado de estudiantes usa "Generar Boleta".'),
  (N'estudiantes', N'boleta-conducta', N'PASO', 2, N'Revisa datos como fecha, consecutivo, estudiante, seccion y colegio.'),
  (N'estudiantes', N'boleta-conducta', N'PASO', 3, N'Completa "Describi el hecho reportado" y el lugar del acontecimiento.'),
  (N'estudiantes', N'boleta-conducta', N'PASO', 4, N'Presiona "Generar e imprimir boleta".'),
  (N'estudiantes', N'boleta-conducta', N'VALIDACION', 1, N'El detalle de hechos y el lugar no pueden quedar vacios.'),
  (N'estudiantes', N'boleta-conducta', N'ERROR', 1, N'Si no abre el documento, revisa si el navegador bloqueo la nueva ventana.'),
  (N'estudiantes', N'boleta-conducta', N'ACCION', 1, N'Si el consecutivo no coincide, revisa la configuracion de boleta de conducta en Administrativo.'),

  (N'reportes', N'consulta-reportes', N'PASO', 1, N'Entra a "Reportes" y elige el tipo como "Reporte de Asistencia", "Reporte de Cotidiano", "Reporte de Tareas", "Reporte de Examenes", "Reporte de Boletas" o "Reporte de Notas".'),
  (N'reportes', N'consulta-reportes', N'PASO', 2, N'Selecciona la "Seccion" y, si hace falta, escribe el filtro de estudiante por nombre o cedula.'),
  (N'reportes', N'consulta-reportes', N'PASO', 3, N'Presiona "Consultar" para cargar la tabla.'),
  (N'reportes', N'consulta-reportes', N'PASO', 4, N'Si el resultado es correcto, usa "Exportar Excel" o "Exportar PDF".'),
  (N'reportes', N'consulta-reportes', N'VALIDACION', 1, N'Debes elegir al menos el tipo de reporte y normalmente la seccion.'),
  (N'reportes', N'consulta-reportes', N'VALIDACION', 2, N'Tiene que existir informacion cargada para ese grupo o estudiante.'),
  (N'reportes', N'consulta-reportes', N'ERROR', 1, N'Si sale vacio, revisa primero que la seccion tenga datos guardados en el modulo origen.'),
  (N'reportes', N'consulta-reportes', N'ACCION', 1, N'Si el problema es un alumno puntual, compara con Notas o Asistencia antes de exportar.'),

  (N'reportes', N'certificaciones', N'PASO', 1, N'Dentro de "Reportes" baja a la seccion "Certificaciones".'),
  (N'reportes', N'certificaciones', N'PASO', 2, N'Elige la "Seccion", el estudiante y el motivo de constancia.'),
  (N'reportes', N'certificaciones', N'PASO', 3, N'Presiona "Generar constancia de estudio".'),
  (N'reportes', N'certificaciones', N'VALIDACION', 1, N'Debe existir el estudiante asociado a la seccion seleccionada.'),
  (N'reportes', N'certificaciones', N'ERROR', 1, N'Si no te lista estudiantes, revisa primero la matricula activa de esa seccion.'),
  (N'reportes', N'certificaciones', N'ACCION', 1, N'Si el motivo no corresponde, cambia la opcion antes de generar para no repetir la constancia.'),

  (N'planeamiento-ia', N'habilidades', N'PASO', 1, N'Entra a "IA para planeamientos" y usa "Crear habilidad" si vas a cargar una nueva.'),
  (N'planeamiento-ia', N'habilidades', N'PASO', 2, N'Completa materia, tipo de colegio, grado, mes, area, numero y descripcion de la habilidad.'),
  (N'planeamiento-ia', N'habilidades', N'PASO', 3, N'Guarda y luego usa "Buscar" para validar que quedo en el listado.'),
  (N'planeamiento-ia', N'habilidades', N'PASO', 4, N'Si tenes muchas, usa "Importar Excel" con la plantilla esperada.'),
  (N'planeamiento-ia', N'habilidades', N'VALIDACION', 1, N'El Excel debe traer columnas como Materia, Colegio, Ciclo, Grado, mes, Area, Numero de Habilidad y Descripcion de la Habilidad.'),
  (N'planeamiento-ia', N'habilidades', N'ERROR', 1, N'Si no salen habilidades al buscar, revisa filtros como materia, grado o mes.'),
  (N'planeamiento-ia', N'habilidades', N'ACCION', 1, N'Si una habilidad ya no aplica, usa "Desactivar" en vez de borrarla del historial.'),

  (N'planeamiento-ia', N'generar-planeamiento', N'PASO', 1, N'Abre "Generar planeamiento" para mostrar el generador.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'PASO', 2, N'Selecciona la "Plantilla IA".'),
  (N'planeamiento-ia', N'generar-planeamiento', N'PASO', 3, N'Marca las habilidades activas que queres usar.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'PASO', 4, N'Completa datos como mes, periodicidad, competencia general y el contexto que te pida el generador.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'PASO', 5, N'Presiona "Generar con IA" y espera el borrador.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'VALIDACION', 1, N'Debes seleccionar al menos una habilidad.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'VALIDACION', 2, N'Debe existir una plantilla IA cargada.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'ERROR', 1, N'Si no aparecen plantillas, revisa "Promt IA" en Parametrizaciones.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'ERROR', 2, N'Si el sistema indica modo local, puede faltar OPENAI_API_KEY.'),
  (N'planeamiento-ia', N'generar-planeamiento', N'ACCION', 1, N'Si el resultado sale flojo, ajusta la plantilla IA o cambia la seleccion de habilidades antes de regenerar.'),

  (N'planeamiento-ia', N'guardar-planeamiento', N'PASO', 1, N'Cuando el borrador este listo, abre "Guardar como planeamiento".'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'PASO', 2, N'Completa grupo, materia, periodo y los datos que pide el formulario final.'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'PASO', 3, N'Presiona "Guardar planeamiento".'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'PASO', 4, N'Confirma el mensaje "Planeamiento guardado correctamente en Gestion del Profe".'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'VALIDACION', 1, N'Debe existir un borrador generado antes de intentar guardarlo.'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'VALIDACION', 2, N'Debes tener disponibles grupo, materia y periodo destino.'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'ERROR', 1, N'Si no te lista periodos, primero revisa Ano Lectivo y Periodos en Administrativo.'),
  (N'planeamiento-ia', N'guardar-planeamiento', N'ACCION', 1, N'Despues de guardar, valida el resultado dentro de Gestion del Profe en Planeamiento e Indicadores.');

MERGE dbo.AsistenteDetalleItem AS target
USING (
  SELECT d.AsistenteDetalleGuiaId, i.TipoItem, i.OrdenVisual, i.Descripcion
  FROM @DetailItems i
  INNER JOIN dbo.AsistenteDetalleGuia d
    ON d.ModuloClave = i.ModuloClave
   AND d.ClaveDetalle = i.ClaveDetalle
) AS source
  ON target.AsistenteDetalleGuiaId = source.AsistenteDetalleGuiaId
 AND target.TipoItem = source.TipoItem
 AND target.OrdenVisual = source.OrdenVisual
WHEN MATCHED THEN
  UPDATE SET
    Descripcion = source.Descripcion,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (AsistenteDetalleGuiaId, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.AsistenteDetalleGuiaId, source.TipoItem, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
