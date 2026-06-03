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
  (N'gestion-profe', N'asistencia', N'Asistencia', N'/gestion-profe', N'Panel para pasar lista, registrar estados y guardar asistencia del grupo.', N'["PROFESOR"]', 10),
  (N'gestion-profe', N'registro-notas', N'Registro de notas', N'/gestion-profe', N'Panel para revisar rubros, editar porcentajes y validar acumulados del estudiante.', N'["PROFESOR"]', 20),
  (N'gestion-profe', N'seguimiento-diario', N'Seguimiento diario', N'/gestion-profe', N'Panel para calificar cotidiano, tareas y examenes con actividades e indicadores.', N'["PROFESOR"]', 30),
  (N'gestion-profe', N'planeamiento-indicadores', N'Planeamiento e Indicadores', N'/gestion-profe', N'Panel para generar planeamientos, activar indicadores y dejarlos listos para evaluacion.', N'["PROFESOR"]', 40),
  (N'gestion-profe', N'reportes-grupo', N'Reportes del grupo', N'/gestion-profe', N'Panel para revisar resumenes, tablas por rubro y exportar salidas del grupo.', N'["PROFESOR"]', 50),
  (N'administrativo', N'anio-lectivo', N'Año Lectivo', N'/administrativo', N'Pestaña base para abrir el curso lectivo antes de periodos, grupos y operación académica.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 100),
  (N'administrativo', N'periodos', N'Periodos', N'/administrativo', N'Pestaña para crear trimestres o periodos del año lectivo.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 110),
  (N'administrativo', N'gestion-grupos', N'Gestión de grupos', N'/administrativo', N'Pestaña para crear secciones y grupos académicos.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 120),
  (N'administrativo', N'materias', N'Materias', N'/administrativo', N'Pestaña para administrar el catálogo de asignaturas.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 130),
  (N'administrativo', N'materias-por-grupo', N'Materias por grupo', N'/administrativo', N'Pestaña para definir qué materias recibe cada grupo.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 140),
  (N'administrativo', N'asignacion-docentes', N'Asignación Docentes', N'/administrativo', N'Pestaña para enlazar docente, grupo y materia.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 150),
  (N'administrativo', N'bloque-horario', N'Bloque Horario', N'/administrativo', N'Pestaña para registrar cada franja horaria antes de armar horarios.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 160),
  (N'administrativo', N'horario-clases', N'Horario de clases', N'/administrativo', N'Pestaña para construir el cruce de grupo, materia, día y bloque.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 170),
  (N'administrativo', N'fecha-clases', N'Fecha de clases', N'/administrativo', N'Pestaña para generar y ajustar fechas efectivas de clase.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 180),
  (N'administrativo', N'dias-lectivos', N'Días Lectivos', N'/administrativo', N'Pestaña para marcar los días hábiles de la institución.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 190),
  (N'administrativo', N'feriados', N'Feriados', N'/administrativo', N'Pestaña para registrar excepciones del calendario.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 200),
  (N'administrativo', N'correo-institucional', N'Correo Institucional', N'/administrativo', N'Pestaña para configurar plantillas y datos de salida de correo.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 210),
  (N'administrativo', N'mensajes', N'Mensajes', N'/administrativo', N'Pestaña para crear mensajes de seguimiento al encargado.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 220);

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
  (N'gestion-profe', N'asistencia', N'asistencia', 1),
  (N'gestion-profe', N'registro-notas', N'registro de notas', 1),
  (N'gestion-profe', N'registro-notas', N'notas', 2),
  (N'gestion-profe', N'seguimiento-diario', N'seguimiento diario', 1),
  (N'gestion-profe', N'seguimiento-diario', N'cotidiano', 2),
  (N'gestion-profe', N'seguimiento-diario', N'tareas', 3),
  (N'gestion-profe', N'seguimiento-diario', N'examenes', 4),
  (N'gestion-profe', N'planeamiento-indicadores', N'planeamiento e indicadores', 1),
  (N'gestion-profe', N'planeamiento-indicadores', N'planeamiento', 2),
  (N'gestion-profe', N'reportes-grupo', N'reportes', 1),
  (N'administrativo', N'anio-lectivo', N'año lectivo', 1),
  (N'administrativo', N'anio-lectivo', N'ano lectivo', 2),
  (N'administrativo', N'periodos', N'periodos', 1),
  (N'administrativo', N'gestion-grupos', N'gestion de grupos', 1),
  (N'administrativo', N'gestion-grupos', N'grupos', 2),
  (N'administrativo', N'materias', N'materias', 1),
  (N'administrativo', N'materias-por-grupo', N'materias por grupo', 1),
  (N'administrativo', N'asignacion-docentes', N'asignacion docentes', 1),
  (N'administrativo', N'bloque-horario', N'bloque horario', 1),
  (N'administrativo', N'horario-clases', N'horario de clases', 1),
  (N'administrativo', N'fecha-clases', N'fecha de clases', 1),
  (N'administrativo', N'dias-lectivos', N'dias lectivos', 1),
  (N'administrativo', N'feriados', N'feriados', 1),
  (N'administrativo', N'correo-institucional', N'correo institucional', 1),
  (N'administrativo', N'mensajes', N'mensajes', 1);

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
  (N'gestion-profe', N'asistencia', N'PASO', 1, N'Entrá a "Gestion del Profe".'),
  (N'gestion-profe', N'asistencia', N'PASO', 2, N'Elegí el grupo y la materia.'),
  (N'gestion-profe', N'asistencia', N'PASO', 3, N'Abrí el panel "Asistencia".'),
  (N'gestion-profe', N'asistencia', N'PASO', 4, N'Seleccioná la fecha y marcá el estado por estudiante.'),
  (N'gestion-profe', N'asistencia', N'PASO', 5, N'Presioná "Guardar asistencia".'),
  (N'gestion-profe', N'asistencia', N'VALIDACION', 1, N'Debés tener grupo y materia seleccionados.'),
  (N'gestion-profe', N'asistencia', N'VALIDACION', 2, N'Debe existir lista de estudiantes.'),
  (N'gestion-profe', N'asistencia', N'ERROR', 1, N'Si no ves estudiantes, el grupo puede no tener matrícula activa.'),
  (N'gestion-profe', N'asistencia', N'ACCION', 1, N'Si no carga bien, cambiá la fecha y volvé a intentar.'),

  (N'gestion-profe', N'registro-notas', N'PASO', 1, N'Entrá a "Gestion del Profe".'),
  (N'gestion-profe', N'registro-notas', N'PASO', 2, N'Elegí el grupo y la materia.'),
  (N'gestion-profe', N'registro-notas', N'PASO', 3, N'Abrí el panel "Registro de notas".'),
  (N'gestion-profe', N'registro-notas', N'PASO', 4, N'Usá el botón "Editar" en el rubro que querés ajustar.'),
  (N'gestion-profe', N'registro-notas', N'PASO', 5, N'Guardá el cambio y revisá "Ver detalle" o "Reportes".'),
  (N'gestion-profe', N'registro-notas', N'VALIDACION', 1, N'Debe existir una estructura de evaluación activa.'),
  (N'gestion-profe', N'registro-notas', N'VALIDACION', 2, N'El grupo tiene que tener estudiantes matriculados.'),
  (N'gestion-profe', N'registro-notas', N'ERROR', 1, N'Si faltan rubros, revisá la parametrización de evaluaciones.'),
  (N'gestion-profe', N'registro-notas', N'ACCION', 1, N'Si una nota no coincide, revisá primero el detalle del rubro y luego reportes.'),

  (N'gestion-profe', N'seguimiento-diario', N'PASO', 1, N'Entrá a "Gestion del Profe".'),
  (N'gestion-profe', N'seguimiento-diario', N'PASO', 2, N'Elegí grupo y materia.'),
  (N'gestion-profe', N'seguimiento-diario', N'PASO', 3, N'En "Rubro a calificar", elegí Cotidiano, Tareas o Exámenes.'),
  (N'gestion-profe', N'seguimiento-diario', N'PASO', 4, N'En "Actividad evaluativa", elegí la actividad correcta.'),
  (N'gestion-profe', N'seguimiento-diario', N'PASO', 5, N'Si el rubro usa indicadores, abrí "Asignar indicadores a actividades" y luego guardá la asignación.'),
  (N'gestion-profe', N'seguimiento-diario', N'PASO', 6, N'Elegí el "Indicador del planeamiento", marcá el nivel y guardá.'),
  (N'gestion-profe', N'seguimiento-diario', N'VALIDACION', 1, N'Deben existir actividades creadas para ese rubro.'),
  (N'gestion-profe', N'seguimiento-diario', N'VALIDACION', 2, N'Debe haber indicadores asignados si el flujo usa planeamiento.'),
  (N'gestion-profe', N'seguimiento-diario', N'ERROR', 1, N'Si no aparecen indicadores, revisá "Planeamiento e Indicadores".'),
  (N'gestion-profe', N'seguimiento-diario', N'ERROR', 2, N'Si faltan tareas o cotidianos, la plantilla puede estar incompleta.'),
  (N'gestion-profe', N'seguimiento-diario', N'ACCION', 1, N'Si faltan actividades, revisá que la plantilla tenga todas las actividades parametrizadas.'),

  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 1, N'Entrá a "Gestion del Profe".'),
  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 2, N'Elegí grupo y materia.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 3, N'Abrí "Planeamiento e Indicadores".'),
  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 4, N'Elegí secciones, plantilla IA, mes, periodicidad y competencia general.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 5, N'Marcá habilidades y presioná "Generar planeamiento con IA".'),
  (N'gestion-profe', N'planeamiento-indicadores', N'PASO', 6, N'Revisá el resultado y guardá el planeamiento.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'VALIDACION', 1, N'Debés tener grupo y materia seleccionados.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'VALIDACION', 2, N'Deben existir habilidades de planeamiento cargadas.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'ERROR', 1, N'Si no te aparecen habilidades, revisá el catálogo de habilidades.'),
  (N'gestion-profe', N'planeamiento-indicadores', N'ACCION', 1, N'Si luego no podés usar indicadores, verificá que hayan quedado activos para evaluaciones y reportes.'),

  (N'gestion-profe', N'reportes-grupo', N'PASO', 1, N'Entrá a "Gestion del Profe".'),
  (N'gestion-profe', N'reportes-grupo', N'PASO', 2, N'Elegí grupo y materia.'),
  (N'gestion-profe', N'reportes-grupo', N'PASO', 3, N'Abrí el panel "Reportes".'),
  (N'gestion-profe', N'reportes-grupo', N'PASO', 4, N'Elegí el tipo de reporte y revisá el resumen general.'),
  (N'gestion-profe', N'reportes-grupo', N'PASO', 5, N'Exportá en Excel, CSV o PDF según el botón disponible.'),
  (N'gestion-profe', N'reportes-grupo', N'VALIDACION', 1, N'Debe existir información calificada o asistencia guardada.'),
  (N'gestion-profe', N'reportes-grupo', N'ERROR', 1, N'Si un reporte sale vacío, puede no haber datos guardados todavía.'),
  (N'gestion-profe', N'reportes-grupo', N'ACCION', 1, N'Si un alumno trasladado sale raro, compará con Registro de notas antes de exportar.'),

  (N'administrativo', N'anio-lectivo', N'PASO', 1, N'Abrí "Año Lectivo".'),
  (N'administrativo', N'anio-lectivo', N'PASO', 2, N'Creá o editá el año base.'),
  (N'administrativo', N'anio-lectivo', N'PASO', 3, N'Guardá antes de seguir con periodos o grupos.'),
  (N'administrativo', N'anio-lectivo', N'ERROR', 1, N'Si no existe año lectivo activo, muchos procesos académicos no van a funcionar.'),

  (N'administrativo', N'periodos', N'PASO', 1, N'Entrá a "Periodos".'),
  (N'administrativo', N'periodos', N'PASO', 2, N'Creá los trimestres o periodos.'),
  (N'administrativo', N'periodos', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'periodos', N'ERROR', 1, N'Si faltan periodos, luego no vas a poder ordenar bien cargas académicas y reportes.'),

  (N'administrativo', N'gestion-grupos', N'PASO', 1, N'Entrá a "Gestión de grupos".'),
  (N'administrativo', N'gestion-grupos', N'PASO', 2, N'Creá la sección o grupo.'),
  (N'administrativo', N'gestion-grupos', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'gestion-grupos', N'ACCION', 1, N'Este paso va antes de asignar docentes, materias por grupo o matrícula.'),

  (N'administrativo', N'materias', N'PASO', 1, N'Entrá a "Materias".'),
  (N'administrativo', N'materias', N'PASO', 2, N'Creá o editá las asignaturas.'),
  (N'administrativo', N'materias', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'materias', N'ERROR', 1, N'Si una materia no existe aquí, luego no la vas a poder usar en asignaciones ni horarios.'),

  (N'administrativo', N'materias-por-grupo', N'PASO', 1, N'Entrá a "Materias por grupo".'),
  (N'administrativo', N'materias-por-grupo', N'PASO', 2, N'Elegí grupo, materia y periodo.'),
  (N'administrativo', N'materias-por-grupo', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'materias-por-grupo', N'ACCION', 1, N'Este paso define qué recibe cada grupo y va antes del horario de clases.'),

  (N'administrativo', N'asignacion-docentes', N'PASO', 1, N'Entrá a "Asignación Docentes".'),
  (N'administrativo', N'asignacion-docentes', N'PASO', 2, N'Elegí grupo, materia y docente.'),
  (N'administrativo', N'asignacion-docentes', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'asignacion-docentes', N'ERROR', 1, N'Si esto falta, luego el profesor no verá correctamente su grupo o materia.'),

  (N'administrativo', N'bloque-horario', N'PASO', 1, N'Entrá a "Bloque Horario".'),
  (N'administrativo', N'bloque-horario', N'PASO', 2, N'Creá cada franja horaria.'),
  (N'administrativo', N'bloque-horario', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'bloque-horario', N'ACCION', 1, N'Este paso va antes de "Horario de clases".'),

  (N'administrativo', N'horario-clases', N'PASO', 1, N'Entrá a "Horario de clases".'),
  (N'administrativo', N'horario-clases', N'PASO', 2, N'Elegí grupo, materia, día y bloque.'),
  (N'administrativo', N'horario-clases', N'PASO', 3, N'Guardá cada cruce.'),
  (N'administrativo', N'horario-clases', N'VALIDACION', 1, N'Deben existir "Materias por grupo" y "Bloque Horario".'),
  (N'administrativo', N'horario-clases', N'ERROR', 1, N'Si falta información, revisá primero materias por grupo y bloques.'),

  (N'administrativo', N'fecha-clases', N'PASO', 1, N'Entrá a "Fecha de clases".'),
  (N'administrativo', N'fecha-clases', N'PASO', 2, N'Generá o ajustá las fechas por grupo.'),
  (N'administrativo', N'fecha-clases', N'PASO', 3, N'Guardá.'),

  (N'administrativo', N'dias-lectivos', N'PASO', 1, N'Entrá a "Días Lectivos".'),
  (N'administrativo', N'dias-lectivos', N'PASO', 2, N'Marcá los días hábiles de clase.'),
  (N'administrativo', N'dias-lectivos', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'dias-lectivos', N'ERROR', 1, N'Si esto está mal, se pueden afectar horarios y validaciones futuras.'),

  (N'administrativo', N'feriados', N'PASO', 1, N'Entrá a "Feriados".'),
  (N'administrativo', N'feriados', N'PASO', 2, N'Registrá fecha y nombre.'),
  (N'administrativo', N'feriados', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'feriados', N'ERROR', 1, N'Si falta un feriado, puede aparecer como día normal en procesos académicos.'),

  (N'administrativo', N'correo-institucional', N'PASO', 1, N'Entrá a "Correo Institucional".'),
  (N'administrativo', N'correo-institucional', N'PASO', 2, N'Configurá dominio, remitente o plantilla disponible.'),
  (N'administrativo', N'correo-institucional', N'PASO', 3, N'Guardá.'),
  (N'administrativo', N'correo-institucional', N'ERROR', 1, N'Si esto está incompleto, las notificaciones pueden no salir bien.'),

  (N'administrativo', N'mensajes', N'PASO', 1, N'Entrá a "Mensajes".'),
  (N'administrativo', N'mensajes', N'PASO', 2, N'Elegí tipo de uso.'),
  (N'administrativo', N'mensajes', N'PASO', 3, N'Escribí título y cuerpo.'),
  (N'administrativo', N'mensajes', N'PASO', 4, N'Guardá.'),
  (N'administrativo', N'mensajes', N'ACCION', 1, N'Estos mensajes luego se usan para informar al encargado en flujos de seguimiento.');

MERGE dbo.AsistenteDetalleItem AS target
USING (
  SELECT d.AsistenteDetalleGuiaId, i.TipoItem, i.Descripcion, i.OrdenVisual
  FROM @DetailItems i
  INNER JOIN dbo.AsistenteDetalleGuia d
    ON d.ModuloClave = i.ModuloClave
   AND d.ClaveDetalle = i.ClaveDetalle
) AS source
  ON target.AsistenteDetalleGuiaId = source.AsistenteDetalleGuiaId
 AND target.TipoItem = source.TipoItem
 AND target.OrdenVisual = source.OrdenVisual
WHEN MATCHED THEN
  UPDATE SET Descripcion = source.Descripcion, Activo = 1, UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (AsistenteDetalleGuiaId, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.AsistenteDetalleGuiaId, source.TipoItem, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
