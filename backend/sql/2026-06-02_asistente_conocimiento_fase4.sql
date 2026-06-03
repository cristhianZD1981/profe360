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
  (N'instituciones', N'registro-institucion', N'Registro de institucion', N'/instituciones', N'Panel para crear, editar, buscar, inactivar y reactivar instituciones.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 500),
  (N'usuarios', N'registro-usuario', N'Registro de usuario', N'/usuarios', N'Panel para crear o editar usuarios, asignar institucion y rol, y dejar lista la clave inicial.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 510),
  (N'usuarios', N'importacion-usuarios', N'Importacion de usuarios', N'/usuarios', N'Flujo para descargar plantilla y cargar usuarios desde Excel.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 520),
  (N'usuarios', N'gestion-acceso', N'Gestion de acceso', N'/usuarios', N'Panel para restablecer clave, inactivar, eliminar o reactivar usuarios existentes.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 530),
  (N'horarios', N'mi-horario', N'Mi horario', N'/horarios', N'Pestaña para que el docente recargue y consulte su horario personal por periodo y año.', NULL, 540),
  (N'horarios', N'mis-grupos-guia', N'Mis grupos guia', N'/horarios', N'Pestaña para revisar los horarios de los grupos guia asignados al usuario.', NULL, 550),
  (N'horarios', N'consulta-administrativa', N'Consulta administrativa', N'/horarios', N'Pestaña para consultar horario por seccion, docente o estudiante.', NULL, 560),
  (N'asistencia', N'consulta-clases', N'Busqueda de clases', N'/asistencia', N'Panel para filtrar clases programadas y sesiones guardadas antes de pasar lista.', NULL, 570),
  (N'asistencia', N'captura-asistencia', N'Captura de asistencia', N'/asistencia', N'Panel para tomar lista o editar asistencia de una sesion guardada.', NULL, 580),
  (N'seguimiento-notas', N'registro-seguimiento', N'Registro de seguimiento', N'/seguimiento-notas', N'Panel para seleccionar estudiante, componente y guardar seguimiento o examen.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 590),
  (N'seguimiento-notas', N'consolidado-estudiante', N'Consolidado del estudiante', N'/seguimiento-notas', N'Panel para revisar el resultado del registro, resumen de asistencia y consolidado del estudiante.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 600);

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
  (N'instituciones', N'registro-institucion', N'crear institucion', 1),
  (N'instituciones', N'registro-institucion', N'editar institucion', 2),
  (N'instituciones', N'registro-institucion', N'instituciones', 3),
  (N'usuarios', N'registro-usuario', N'crear usuario', 1),
  (N'usuarios', N'registro-usuario', N'editar usuario', 2),
  (N'usuarios', N'registro-usuario', N'agregar usuario', 3),
  (N'usuarios', N'importacion-usuarios', N'importar usuarios', 1),
  (N'usuarios', N'importacion-usuarios', N'plantilla de usuarios', 2),
  (N'usuarios', N'gestion-acceso', N'restablecer clave', 1),
  (N'usuarios', N'gestion-acceso', N'reactivar usuario', 2),
  (N'usuarios', N'gestion-acceso', N'inactivar usuario', 3),
  (N'horarios', N'mi-horario', N'mi horario', 1),
  (N'horarios', N'mis-grupos-guia', N'mis grupos guia', 1),
  (N'horarios', N'consulta-administrativa', N'consulta administrativa', 1),
  (N'horarios', N'consulta-administrativa', N'horario de seccion', 2),
  (N'horarios', N'consulta-administrativa', N'horario del profesor', 3),
  (N'horarios', N'consulta-administrativa', N'horario del estudiante', 4),
  (N'asistencia', N'consulta-clases', N'buscar clases', 1),
  (N'asistencia', N'consulta-clases', N'clases programadas', 2),
  (N'asistencia', N'consulta-clases', N'sesiones guardadas', 3),
  (N'asistencia', N'captura-asistencia', N'guardar asistencia', 1),
  (N'asistencia', N'captura-asistencia', N'tomar lista', 2),
  (N'asistencia', N'captura-asistencia', N'editar asistencia', 3),
  (N'seguimiento-notas', N'registro-seguimiento', N'seguimiento de notas', 1),
  (N'seguimiento-notas', N'registro-seguimiento', N'guardar seguimiento', 2),
  (N'seguimiento-notas', N'registro-seguimiento', N'guardar examen', 3),
  (N'seguimiento-notas', N'consolidado-estudiante', N'consolidado del estudiante', 1),
  (N'seguimiento-notas', N'consolidado-estudiante', N'resumen de asistencia', 2),
  (N'seguimiento-notas', N'consolidado-estudiante', N'resultado del registro', 3);

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
  (N'instituciones', N'registro-institucion', N'PASO', 1, N'Entra a "Instituciones" y usa "Agregar institucion" si vas a crear una nueva.'),
  (N'instituciones', N'registro-institucion', N'PASO', 2, N'Completa los datos generales y oficiales del centro.'),
  (N'instituciones', N'registro-institucion', N'PASO', 3, N'Guarda con el boton principal y luego valida la institucion en el listado.'),
  (N'instituciones', N'registro-institucion', N'PASO', 4, N'Si hace falta un ajuste posterior, usa "Editar institucion".'),
  (N'instituciones', N'registro-institucion', N'VALIDACION', 1, N'Normalmente este flujo requiere perfil administrativo y algunos cambios sensibles quedan reservados al super admin.'),
  (N'instituciones', N'registro-institucion', N'ERROR', 1, N'Si no te deja reactivar o eliminar, revisa si tu rol tiene ese permiso.'),
  (N'instituciones', N'registro-institucion', N'ACCION', 1, N'Si solo ocupas ubicar una institucion, usa el buscador por nombre, comercial, boleta o correo antes de crear otra.'),

  (N'usuarios', N'registro-usuario', N'PASO', 1, N'Entra a "Usuarios" y presiona "Agregar usuario".'),
  (N'usuarios', N'registro-usuario', N'PASO', 2, N'Completa nombre, correo, cedula, institucion y el "Rol" correcto.'),
  (N'usuarios', N'registro-usuario', N'PASO', 3, N'Guarda y revisa el mensaje de confirmacion; si es nuevo, la clave inicial queda como el numero de cedula.'),
  (N'usuarios', N'registro-usuario', N'VALIDACION', 1, N'Un admin institucional o administrativo solo deberia crear usuarios dentro de su institucion.'),
  (N'usuarios', N'registro-usuario', N'VALIDACION', 2, N'El rol debe existir en el catalogo y corresponder al acceso real que necesita la persona.'),
  (N'usuarios', N'registro-usuario', N'ERROR', 1, N'Si el correo o la cedula ya existen, revisa primero el listado antes de duplicar el acceso.'),
  (N'usuarios', N'registro-usuario', N'ACCION', 1, N'Si el usuario ya existe pero esta inactivo, usa reactivacion en vez de crear otro registro.'),

  (N'usuarios', N'importacion-usuarios', N'PASO', 1, N'En "Incluir desde lista", descarga la plantilla y llenala en Excel.'),
  (N'usuarios', N'importacion-usuarios', N'PASO', 2, N'Selecciona el archivo en "Archivo Excel".'),
  (N'usuarios', N'importacion-usuarios', N'PASO', 3, N'Presiona "Importar usuarios" y espera a que finalice.'),
  (N'usuarios', N'importacion-usuarios', N'VALIDACION', 1, N'Debes seleccionar un archivo Excel antes de importar.'),
  (N'usuarios', N'importacion-usuarios', N'ERROR', 1, N'Si la importacion falla, revisa que la plantilla conserve el formato esperado.'),
  (N'usuarios', N'importacion-usuarios', N'ACCION', 1, N'Si son pocos usuarios, a veces es mas seguro cargarlos manualmente para controlar rol e institucion.'),

  (N'usuarios', N'gestion-acceso', N'PASO', 1, N'Busca a la persona por correo, nombre o cedula.'),
  (N'usuarios', N'gestion-acceso', N'PASO', 2, N'Desde acciones usa "Editar", "Inactivar", "Reactivar", "Eliminar" o restablecer clave segun el caso.'),
  (N'usuarios', N'gestion-acceso', N'PASO', 3, N'Si restableces la clave, confirma el mensaje para entregarle la nueva referencia al usuario.'),
  (N'usuarios', N'gestion-acceso', N'ERROR', 1, N'Si un usuario no puede entrar, revisa primero que siga activo y que el rol sea el correcto.'),
  (N'usuarios', N'gestion-acceso', N'ACCION', 1, N'Antes de eliminar definitivamente, valora si basta con inactivarlo para conservar trazabilidad.'),

  (N'horarios', N'mi-horario', N'PASO', 1, N'Entra a "Horarios" y deja activa la pestaña "Mi horario".'),
  (N'horarios', N'mi-horario', N'PASO', 2, N'Usa "Recargar" para traer el horario actualizado del docente.'),
  (N'horarios', N'mi-horario', N'PASO', 3, N'Revisa la cuadricula por dia y bloque.'),
  (N'horarios', N'mi-horario', N'VALIDACION', 1, N'Debe existir asignacion docente y horario de clases cargado.'),
  (N'horarios', N'mi-horario', N'ERROR', 1, N'Si sale vacio, primero revisa Asignacion Docentes y Horario de clases en Administrativo.'),

  (N'horarios', N'mis-grupos-guia', N'PASO', 1, N'Abre la pestaña "Mis grupos guia".'),
  (N'horarios', N'mis-grupos-guia', N'PASO', 2, N'Revisa cada horario de grupo guia disponible en pantalla.'),
  (N'horarios', N'mis-grupos-guia', N'VALIDACION', 1, N'El usuario debe tener grupos guia asignados para ver resultados.'),
  (N'horarios', N'mis-grupos-guia', N'ERROR', 1, N'Si no aparece ningun grupo, revisa la asignacion como PROFESOR_GUIA.'),

  (N'horarios', N'consulta-administrativa', N'PASO', 1, N'En la pestaña "Consulta administrativa", completa primero los "Filtros generales".'),
  (N'horarios', N'consulta-administrativa', N'PASO', 2, N'Elige si vas a consultar por seccion, profesor o estudiante.'),
  (N'horarios', N'consulta-administrativa', N'PASO', 3, N'Usa "Consultar" y luego revisa "Resultados".'),
  (N'horarios', N'consulta-administrativa', N'PASO', 4, N'Si buscas un profesor o un alumno, primero selecciona el resultado correcto desde la tabla de busqueda.'),
  (N'horarios', N'consulta-administrativa', N'VALIDACION', 1, N'El ano lectivo, el periodo y la seccion ayudan a filtrar mejor y evitar cruces incorrectos.'),
  (N'horarios', N'consulta-administrativa', N'ERROR', 1, N'Si no te carga el horario del estudiante, revisa que tenga matricula activa en esa seccion.'),
  (N'horarios', N'consulta-administrativa', N'ACCION', 1, N'Si ocupas el horario de un profe y hay varios resultados, selecciona el correo correcto antes de consultar.'),

  (N'asistencia', N'consulta-clases', N'PASO', 1, N'Entra a "Asistencia" y usa el formulario de busqueda para ubicar las clases programadas.'),
  (N'asistencia', N'consulta-clases', N'PASO', 2, N'Presiona "Buscar" y revisa las tablas de "Clases programadas" y "Sesiones guardadas".'),
  (N'asistencia', N'consulta-clases', N'PASO', 3, N'Usa "Tomar lista" para una clase pendiente o "Ver / editar" para una clase ya registrada.'),
  (N'asistencia', N'consulta-clases', N'VALIDACION', 1, N'Deben existir fechas de clase programadas para ese grupo o materia.'),
  (N'asistencia', N'consulta-clases', N'ERROR', 1, N'Si no aparecen clases, revisa Fechas de clase y el horario asociado.'),

  (N'asistencia', N'captura-asistencia', N'PASO', 1, N'Desde "Captura de asistencia" selecciona el estado por estudiante.'),
  (N'asistencia', N'captura-asistencia', N'PASO', 2, N'Agrega observacion cuando haga falta.'),
  (N'asistencia', N'captura-asistencia', N'PASO', 3, N'Guarda con "Guardar asistencia".'),
  (N'asistencia', N'captura-asistencia', N'PASO', 4, N'Si estas corrigiendo una sesion, el encabezado dira "Editar asistencia".'),
  (N'asistencia', N'captura-asistencia', N'VALIDACION', 1, N'Debe haber estudiantes cargados en el detalle para poder guardar.'),
  (N'asistencia', N'captura-asistencia', N'ERROR', 1, N'Si no ves alumnos, la clase puede no tener matriculas activas asociadas.'),
  (N'asistencia', N'captura-asistencia', N'ACCION', 1, N'Despues de guardar, revisa el mensaje de confirmacion y, si hace falta, valida en reportes.'),

  (N'seguimiento-notas', N'registro-seguimiento', N'PASO', 1, N'Entra a "Seguimiento de notas" y selecciona el estudiante.'),
  (N'seguimiento-notas', N'registro-seguimiento', N'PASO', 2, N'Escoge el componente o el rubro que vas a registrar.'),
  (N'seguimiento-notas', N'registro-seguimiento', N'PASO', 3, N'Si aplica, guarda con "Guardar seguimiento" o usa "Guardar examen".'),
  (N'seguimiento-notas', N'registro-seguimiento', N'VALIDACION', 1, N'Debe existir detalle del grupo y un estudiante seleccionado para habilitar el guardado.'),
  (N'seguimiento-notas', N'registro-seguimiento', N'ERROR', 1, N'Si no carga el detalle, revisa grupo, materia y estructura de evaluacion.'),
  (N'seguimiento-notas', N'registro-seguimiento', N'ACCION', 1, N'Si ocupas validar asistencia relacionada, usa el boton para "cargarResumenAsistencia" antes de cerrar el caso.'),

  (N'seguimiento-notas', N'consolidado-estudiante', N'PASO', 1, N'Despues de guardar, revisa "Resultado del registro".'),
  (N'seguimiento-notas', N'consolidado-estudiante', N'PASO', 2, N'Abre "Consolidado del estudiante" para validar el impacto general.'),
  (N'seguimiento-notas', N'consolidado-estudiante', N'PASO', 3, N'Si hace falta, consulta tambien el resumen de asistencia del mismo alumno.'),
  (N'seguimiento-notas', N'consolidado-estudiante', N'VALIDACION', 1, N'El consolidado depende de que ya existan registros guardados para ese estudiante.'),
  (N'seguimiento-notas', N'consolidado-estudiante', N'ERROR', 1, N'Si el consolidado no cambia, revisa que el guardado realmente haya confirmado exito.'),
  (N'seguimiento-notas', N'consolidado-estudiante', N'ACCION', 1, N'Si el resultado sigue raro, compara luego con Registro de notas o Reportes para descartar un problema de origen.');

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
