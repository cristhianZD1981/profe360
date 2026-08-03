/*
  Refuerzo de conocimiento para Margarita sobre mejoras recientes:
  - Suspension temporal de estudiantes.
  - Indicadores desde habilidades en Gestion del Profe.
  - Informar al encargado en asistencia y seguimiento.
  - Marcado visual/bloqueo de estudiantes suspendidos en listas y reportes.

  Script idempotente: puede ejecutarse mas de una vez.
*/

IF OBJECT_ID('dbo.AsistenteDetalleGuia', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteDetalleAlias', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteDetalleItem', 'U') IS NOT NULL
BEGIN
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
    (N'estudiantes', N'suspension-estudiante', N'Suspension de estudiante', N'/estudiantes', N'Flujo administrativo para suspender temporalmente a un estudiante, modificar la suspension o volverlo a estado normal de suspension.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 430),
    (N'gestion-profe', N'alumno-suspendido', N'Alumno suspendido en listas docentes', N'/gestion-profe', N'Comportamiento que debe seguir el docente cuando un alumno aparece suspendido: se muestra, pero no se puede gestionar hasta despues de la fecha fin.', N'["SUPER_ADMIN","PROFESOR","PROFESOR_GUIA"]', 440),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'Indicadores desde habilidades', N'/gestion-profe', N'Flujo para crear indicadores y categorias a partir de habilidades filtradas por materia, grupo, secciones y meses.', N'["SUPER_ADMIN","PROFESOR","PROFESOR_GUIA"]', 450),
    (N'gestion-profe', N'asistencia-informar-encargado', N'Informar al encargado en asistencia', N'/gestion-profe', N'Reglas para activar y explicar la casilla Informar al encargado segun el estado de asistencia seleccionado.', N'["SUPER_ADMIN","PROFESOR","PROFESOR_GUIA"]', 460),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'Estudiantes suspendidos en reportes', N'/reportes', N'Explica que los estudiantes suspendidos siguen apareciendo en reportes y certificaciones, marcados visualmente con leyenda.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR_GUIA"]', 470);

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
    (N'estudiantes', N'suspension-estudiante', N'suspender estudiante', 1),
    (N'estudiantes', N'suspension-estudiante', N'alumno suspendido', 2),
    (N'estudiantes', N'suspension-estudiante', N'medida precautoria', 3),
    (N'estudiantes', N'suspension-estudiante', N'accion correctiva', 4),
    (N'estudiantes', N'suspension-estudiante', N'reactivar estudiante suspendido', 5),
    (N'gestion-profe', N'alumno-suspendido', N'estudiante suspendido', 1),
    (N'gestion-profe', N'alumno-suspendido', N'no puedo calificar alumno', 2),
    (N'gestion-profe', N'alumno-suspendido', N'alumno rosado', 3),
    (N'gestion-profe', N'alumno-suspendido', N'bloqueado para gestion', 4),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'agregar indicadores desde habilidades', 1),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'ver indicadores a partir de habilidades', 2),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'indicadores por habilidad', 3),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'sin planeamiento', 4),
    (N'gestion-profe', N'asistencia-informar-encargado', N'informar al encargado', 1),
    (N'gestion-profe', N'asistencia-informar-encargado', N'mensaje al encargado', 2),
    (N'gestion-profe', N'asistencia-informar-encargado', N'ausente injustificada', 3),
    (N'gestion-profe', N'asistencia-informar-encargado', N'tardia menor a 10 min', 4),
    (N'gestion-profe', N'asistencia-informar-encargado', N'llega 10 minutos tarde', 5),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'suspendido en reportes', 1),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'alumno rosado en reporte', 2),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'reporte con suspendidos', 3);

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
    (N'estudiantes', N'suspension-estudiante', N'PASO', 1, N'Entra al modulo Estudiantes y busca al alumno por nombre, apellidos o identificacion.'),
    (N'estudiantes', N'suspension-estudiante', N'PASO', 2, N'En acciones usa el boton Suspender Estudiante. Si ya esta suspendido, el boton permite modificar la suspension.'),
    (N'estudiantes', N'suspension-estudiante', N'PASO', 3, N'Escoge el motivo: Medida Precautoria o Accion Correctiva.'),
    (N'estudiantes', N'suspension-estudiante', N'PASO', 4, N'Indica Fecha de Inicio Suspension y Fecha fin de la suspension.'),
    (N'estudiantes', N'suspension-estudiante', N'PASO', 5, N'Guarda la suspension. Desde ese momento aplica a toda la institucion, no solo a un grupo o materia.'),
    (N'estudiantes', N'suspension-estudiante', N'PASO', 6, N'Si necesitas levantarla antes, vuelve a consultar el alumno y usa la opcion para ponerlo activo de suspension.'),
    (N'estudiantes', N'suspension-estudiante', N'VALIDACION', 1, N'Solo perfiles administrativos deben crear, modificar o levantar una suspension.'),
    (N'estudiantes', N'suspension-estudiante', N'VALIDACION', 2, N'La fecha fin no debe ser anterior a la fecha de inicio.'),
    (N'estudiantes', N'suspension-estudiante', N'VALIDACION', 3, N'Quitar la suspension no debe confundirse con activar o inactivar la ficha real del estudiante.'),
    (N'estudiantes', N'suspension-estudiante', N'ERROR', 1, N'Si el docente dice que aun puede gestionar al alumno, revisa que la suspension este vigente y que la pantalla haya recargado la lista.'),
    (N'estudiantes', N'suspension-estudiante', N'ERROR', 2, N'Si no aparece el boton, revisa el rol del usuario: profesor no debe administrar suspensiones.'),
    (N'estudiantes', N'suspension-estudiante', N'ACCION', 1, N'Cuando un alumno esta suspendido, debe verse con fondo rosado claro y leyenda con motivo y fecha fin.'),

    (N'gestion-profe', N'alumno-suspendido', N'PASO', 1, N'El docente puede ver al estudiante suspendido en sus listas, pero no debe poder gestionarlo.'),
    (N'gestion-profe', N'alumno-suspendido', N'PASO', 2, N'La fila debe aparecer con fondo rosado claro y una leyenda de Alumno Suspendido.'),
    (N'gestion-profe', N'alumno-suspendido', N'PASO', 3, N'Al posicionarse sobre la linea debe indicar Alumno Suspendido, el motivo y hasta cuando aplica.'),
    (N'gestion-profe', N'alumno-suspendido', N'PASO', 4, N'El bloqueo aplica en Asistencia, Cotidiano, Tareas, Examenes, Seguimiento diario y otras gestiones docentes.'),
    (N'gestion-profe', N'alumno-suspendido', N'VALIDACION', 1, N'El estudiante suspendido sigue apareciendo en la lista para trazabilidad, pero los controles deben quedar inactivos.'),
    (N'gestion-profe', N'alumno-suspendido', N'VALIDACION', 2, N'El docente no debe poder guardar asistencia, notas, observaciones ni avisos sobre ese alumno mientras la suspension este vigente.'),
    (N'gestion-profe', N'alumno-suspendido', N'ERROR', 1, N'Si la fila no sale rosada o aun permite editar, el problema suele ser que la consulta no esta trayendo los campos de suspension vigente.'),
    (N'gestion-profe', N'alumno-suspendido', N'ACCION', 1, N'Al dia siguiente de la Fecha fin, el alumno vuelve a gestion normal respecto a la suspension.'),

    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 1, N'Dentro de Gestion del Profe selecciona el grupo y la materia.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 2, N'Abre Planeamiento e Indicadores y usa Agregar Indicadores desde Habilidades.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 3, N'Escoge el mes o meses y una o varias habilidades filtradas por la materia correspondiente.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 4, N'Escoge la plantilla IA que se usara para crear los indicadores.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 5, N'Indica la cantidad de indicadores por habilidad. Si no se indica cantidad, el sistema usa 1 por defecto.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 6, N'Escoge si aplica solo para ese grupo o para mas secciones del mismo grado/grupo, y marca las secciones que correspondan.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 7, N'Genera los indicadores y revisa las categorias Inicial, Intermedio y Avanzado.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 8, N'Antes de guardar puedes editar indicadores, agregar mas, cambiar categoria o eliminar indicadores. Si eliminas un indicador, tambien se eliminan sus categorias.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'PASO', 9, N'Guarda el conjunto. Si escribes nombre, se lista como Sin Planeamiento - nombre indicado; si no escribes nombre, queda como Sin Planeamiento.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'VALIDACION', 1, N'Deben existir habilidades activas para la materia, grado y mes seleccionados.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'VALIDACION', 2, N'Por defecto deben quedar marcadas rubricas a calificar como Trabajo cotidiano, Tareas y Tabla de especificaciones cuando apliquen.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'VALIDACION', 3, N'Si las habilidades estan en otro idioma, la generacion debe respetar ese mismo idioma.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'ERROR', 1, N'Si no aparecen habilidades, revisa materia, grado, mes y que las habilidades esten activas en Administrativo.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'ERROR', 2, N'Si aparece Ver indicadores a partir de habilidades, significa que ya existe un conjunto creado desde habilidades.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'ACCION', 1, N'Los indicadores creados desde habilidades deben seguir la misma logica de rubricas de calificacion que el flujo normal.'),
    (N'gestion-profe', N'indicadores-desde-habilidades', N'ACCION', 2, N'En la lista de planeamientos no debe mostrarse Generar Plantilla en Word para estos conjuntos sin planeamiento.'),

    (N'gestion-profe', N'asistencia-informar-encargado', N'PASO', 1, N'En Asistencia, marca el estado que corresponda al estudiante.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'PASO', 2, N'Cuando se marque Ausente injustificada, Tardia menor a 10 min o Ausente (Llega 10 minutos tarde), la casilla Informar al encargado debe activarse de una vez.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'PASO', 3, N'Al posicionarse sobre la casilla marcada, el sistema debe mostrar la leyenda del mensaje que se enviara al encargado.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'PASO', 4, N'La leyenda del mensaje cambia segun lo marcado: Ausente injustificada, Tardia menor a 10 min, Ausente (Llega 10 minutos tarde), Ausente justificada u Otros.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'VALIDACION', 1, N'Si el alumno esta suspendido, no se debe poder tomar asistencia ni informar al encargado durante la suspension.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'ERROR', 1, N'Si la casilla no se activa para los estados definidos, revisa el estado exacto seleccionado y refresca la pantalla.'),
    (N'gestion-profe', N'asistencia-informar-encargado', N'ACCION', 1, N'Antes de guardar, revisa el mensaje visible para confirmar que corresponde al estado marcado.'),

    (N'reportes', N'estudiantes-suspendidos-reportes', N'PASO', 1, N'En Reporte y Certificaciones consulta el reporte o listado requerido.'),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'PASO', 2, N'Los estudiantes suspendidos deben seguir apareciendo en reportes y notas acumuladas.'),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'PASO', 3, N'La fila debe mostrarse con fondo rosado claro y leyenda al posicionarse con motivo y fecha fin.'),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'VALIDACION', 1, N'La suspension bloquea gestion activa, no borra historial academico ni reportes.'),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'ERROR', 1, N'Si el reporte no marca al alumno suspendido, revisa que la consulta del reporte este incluyendo suspension vigente.'),
    (N'reportes', N'estudiantes-suspendidos-reportes', N'ACCION', 1, N'Usa el modulo Estudiantes para modificar o levantar la suspension si el estado no corresponde.');

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
END;
GO

IF OBJECT_ID('dbo.AsistenteContextoPantalla', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteContextoPantallaItem', 'U') IS NOT NULL
BEGIN
  DECLARE @ScreenContexts TABLE (
    RutaContexto NVARCHAR(200) NOT NULL,
    ModuloClave NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL
  );

  INSERT INTO @ScreenContexts (RutaContexto, ModuloClave, Titulo, Resumen, OrdenVisual)
  VALUES
    (N'/estudiantes', N'estudiantes', N'Estudiantes', N'Aqui puedes registrar, buscar, editar, revisar detalle y administrar suspensiones temporales de estudiantes segun el rol.', 70),
    (N'/gestion-profe', N'gestion-profe', N'Gestion del Profe', N'Aqui trabajas asistencia, notas, seguimiento diario, planeamiento, indicadores desde habilidades y reportes del grupo.', 110),
    (N'/reportes', N'reportes', N'Reportes', N'Aqui consultas reportes, certificaciones y visualizas estudiantes suspendidos sin perder historial academico.', 130);

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
    (N'/estudiantes', N'HINT', N'Si un admin necesita aplicar una suspension temporal, debe buscar al estudiante y usar Suspender Estudiante.', 50),
    (N'/estudiantes', N'HINT', N'Un alumno suspendido se marca rosado claro y permite modificar motivo, fecha fin o levantar la suspension desde perfiles administrativos.', 51),
    (N'/estudiantes', N'EXAMPLE', N'como suspendo un estudiante', 60),
    (N'/estudiantes', N'EXAMPLE', N'como modifico una suspension', 61),
    (N'/estudiantes', N'EXAMPLE', N'como reactivo un alumno suspendido', 62),

    (N'/gestion-profe', N'HINT', N'En Planeamiento e Indicadores puedes agregar indicadores desde habilidades, filtrando por materia, meses y habilidades.', 50),
    (N'/gestion-profe', N'HINT', N'Si una fila aparece rosada, el alumno esta suspendido y no se debe gestionar hasta despues de la fecha fin.', 51),
    (N'/gestion-profe', N'HINT', N'En Asistencia, algunos estados activan automaticamente Informar al encargado y muestran el mensaje correspondiente.', 52),
    (N'/gestion-profe', N'EXAMPLE', N'como agrego indicadores desde habilidades', 60),
    (N'/gestion-profe', N'EXAMPLE', N'por que no puedo calificar a este estudiante', 61),
    (N'/gestion-profe', N'EXAMPLE', N'por que este alumno aparece rosado', 62),
    (N'/gestion-profe', N'EXAMPLE', N'que mensaje se envia al encargado', 63),

    (N'/reportes', N'HINT', N'Los estudiantes suspendidos deben seguir apareciendo en reportes, pero con fondo rosado claro y leyenda de suspension.', 50),
    (N'/reportes', N'HINT', N'La suspension no elimina notas ni historial; solo bloquea gestiones activas durante el periodo vigente.', 51),
    (N'/reportes', N'EXAMPLE', N'por que este estudiante sale rosado en reportes', 60),
    (N'/reportes', N'EXAMPLE', N'el alumno suspendido debe salir en reportes', 61);

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
END;
GO

IF OBJECT_ID('dbo.AsistenteFormularioGuia', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteFormularioAlias', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteFormularioCampo', 'U') IS NOT NULL
BEGIN
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
    (N'/estudiantes', N'estudiantes', N'suspension-estudiante', N'Formulario de suspension de estudiante', N'Formulario administrativo para registrar o modificar una suspension temporal.', 70),
    (N'/gestion-profe', N'gestion-profe', N'indicadores-desde-habilidades', N'Formulario de indicadores desde habilidades', N'Formulario docente para generar indicadores desde habilidades por materia, meses, secciones y plantilla IA.', 80);

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
    (N'/estudiantes', N'suspension-estudiante', N'suspender estudiante', 1),
    (N'/estudiantes', N'suspension-estudiante', N'modificar suspension', 2),
    (N'/estudiantes', N'suspension-estudiante', N'levantar suspension', 3),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'indicadores desde habilidades', 1),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'agregar indicadores desde habilidades', 2),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'indicadores por habilidad', 3);

  MERGE dbo.AsistenteFormularioAlias AS target
  USING @FormAliases AS source
    ON target.RutaContexto = source.RutaContexto
   AND target.ClaveFormulario = source.ClaveFormulario
   AND target.Alias = source.Alias
  WHEN MATCHED THEN
    UPDATE SET OrdenVisual = source.OrdenVisual, Activo = 1, UpdatedAt = SYSDATETIME()
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
    (N'/estudiantes', N'suspension-estudiante', N'Motivo', 1, N'Debe ser Medida Precautoria o Accion Correctiva.', 1),
    (N'/estudiantes', N'suspension-estudiante', N'Fecha de Inicio Suspension', 1, N'Fecha desde la que el alumno queda bloqueado para gestion activa.', 2),
    (N'/estudiantes', N'suspension-estudiante', N'Fecha fin de la suspension', 1, N'Fecha hasta la que aplica la suspension; al dia siguiente vuelve la gestion normal respecto a la suspension.', 3),
    (N'/estudiantes', N'suspension-estudiante', N'Volver a activo', 0, N'Usalo solo para levantar la suspension, sin cambiar la condicion activa/inactiva real de la ficha.', 4),

    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Mes o meses', 1, N'Puedes escoger uno o varios meses para filtrar habilidades y guardar el conjunto.', 1),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Habilidad o habilidades', 1, N'Deben corresponder a la materia seleccionada; puedes escoger una o varias.', 2),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Plantilla IA', 1, N'Se usa el mismo modelo de IA y la plantilla seleccionada para redactar los indicadores.', 3),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Cantidad por habilidad', 0, N'Si queda vacio, se usa 1 indicador por habilidad por defecto.', 4),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Secciones', 1, N'Escoge si aplica solo a este grupo o tambien a mas secciones del mismo grado/grupo.', 5),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Rubricas a calificar', 0, N'Deben venir marcadas por defecto las rubricas esperadas como Trabajo cotidiano, Tareas y Tabla de especificaciones cuando apliquen.', 6),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'Nombre del conjunto', 0, N'Si escribes un nombre se guarda como Sin Planeamiento - nombre; si queda vacio, se guarda como Sin Planeamiento.', 7);

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
END;
GO

IF OBJECT_ID('dbo.AsistenteSubflujoContexto', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.AsistenteSubflujoItem', 'U') IS NOT NULL
BEGIN
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
    (N'/estudiantes', N'estudiantes', N'suspender-estudiante', N'suspender un estudiante', N'Guia para aplicar, modificar o levantar una suspension temporal del estudiante.', 160),
    (N'/gestion-profe', N'gestion-profe', N'indicadores-desde-habilidades', N'agregar indicadores desde habilidades', N'Guia para crear indicadores y categorias desde habilidades, meses, secciones y plantilla IA.', 170),
    (N'/gestion-profe', N'gestion-profe', N'informar-encargado-asistencia', N'informar al encargado desde asistencia', N'Guia para entender cuando se marca automaticamente Informar al encargado y que mensaje se envia.', 180),
    (N'/reportes', N'reportes', N'ver-suspendidos-reportes', N'ver suspendidos en reportes', N'Guia para interpretar filas rosadas de estudiantes suspendidos en reportes y certificaciones.', 190);

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
    (N'/estudiantes', N'suspender-estudiante', N'ALIAS', N'suspender estudiante', 1),
    (N'/estudiantes', N'suspender-estudiante', N'ALIAS', N'modificar suspension', 2),
    (N'/estudiantes', N'suspender-estudiante', N'HINT', N'Primero busca al estudiante y confirma que es el correcto.', 1),
    (N'/estudiantes', N'suspender-estudiante', N'HINT', N'La suspension es institucional y temporal; no cambia la inactivacion real del alumno.', 2),
    (N'/estudiantes', N'suspender-estudiante', N'EXAMPLE', N'Como suspendo un estudiante?', 1),
    (N'/estudiantes', N'suspender-estudiante', N'EXAMPLE', N'Como le cambio la fecha fin a una suspension?', 2),

    (N'/gestion-profe', N'indicadores-desde-habilidades', N'ALIAS', N'indicadores desde habilidades', 1),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'ALIAS', N'agregar indicadores desde habilidades', 2),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'HINT', N'Selecciona mes o meses, habilidades, plantilla IA y cantidad por habilidad.', 1),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'HINT', N'Puedes aplicar el conjunto al grupo actual o a mas secciones del mismo grado/grupo.', 2),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'HINT', N'Antes de guardar puedes editar, agregar o eliminar indicadores y categorias.', 3),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'EXAMPLE', N'Como genero indicadores desde habilidades?', 1),
    (N'/gestion-profe', N'indicadores-desde-habilidades', N'EXAMPLE', N'Por que se guardo como Sin Planeamiento?', 2),

    (N'/gestion-profe', N'informar-encargado-asistencia', N'ALIAS', N'informar al encargado', 1),
    (N'/gestion-profe', N'informar-encargado-asistencia', N'ALIAS', N'mensaje al encargado', 2),
    (N'/gestion-profe', N'informar-encargado-asistencia', N'HINT', N'Ausente injustificada, Tardia menor a 10 min y Ausente (Llega 10 minutos tarde) activan Informar al encargado.', 1),
    (N'/gestion-profe', N'informar-encargado-asistencia', N'HINT', N'La leyenda del mensaje cambia segun el estado marcado.', 2),
    (N'/gestion-profe', N'informar-encargado-asistencia', N'EXAMPLE', N'Que mensaje se manda al encargado?', 1),
    (N'/gestion-profe', N'informar-encargado-asistencia', N'EXAMPLE', N'Por que se marco informar al encargado?', 2),

    (N'/reportes', N'ver-suspendidos-reportes', N'ALIAS', N'suspendido en reportes', 1),
    (N'/reportes', N'ver-suspendidos-reportes', N'ALIAS', N'alumno rosado en reportes', 2),
    (N'/reportes', N'ver-suspendidos-reportes', N'HINT', N'La fila rosada indica suspension vigente y mantiene el historial visible.', 1),
    (N'/reportes', N'ver-suspendidos-reportes', N'HINT', N'Para corregir una suspension usa Estudiantes, no el reporte.', 2),
    (N'/reportes', N'ver-suspendidos-reportes', N'EXAMPLE', N'Por que el alumno sale rosado en reportes?', 1);

  MERGE dbo.AsistenteSubflujoItem AS target
  USING @SubflowItems AS source
    ON target.RutaContexto = source.RutaContexto
   AND target.ClaveSubflujo = source.ClaveSubflujo
   AND target.TipoItem = source.TipoItem
   AND target.Descripcion = source.Descripcion
  WHEN MATCHED THEN
    UPDATE SET OrdenVisual = source.OrdenVisual, Activo = 1, UpdatedAt = SYSDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
    VALUES (source.RutaContexto, source.ClaveSubflujo, source.TipoItem, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
END;
GO

IF OBJECT_ID('dbo.AsistenteFaq', 'U') IS NOT NULL
BEGIN
  MERGE dbo.AsistenteFaq AS target
  USING (
    SELECT *
    FROM (VALUES
      (
        N'estudiantes-como-suspender',
        N'estudiantes',
        N'/estudiantes',
        N'Como suspender un estudiante',
        N'Guia para aplicar una suspension temporal desde Estudiantes.',
        N'Para suspender un estudiante, entra a Estudiantes, busca al alumno y usa Suspender Estudiante. Escoge Medida Precautoria o Accion Correctiva, indica fecha de inicio y fecha fin, y guarda. La suspension aplica a toda la institucion y no cambia la inactivacion real de la ficha.',
        N'FAQ',
        N'["como suspendo un estudiante","suspender estudiante","poner alumno suspendido","aplicar medida precautoria","aplicar accion correctiva"]',
        N'["Busca al estudiante correcto.","Presiona Suspender Estudiante.","Escoge el motivo.","Completa fecha inicio y fecha fin.","Guarda y verifica que la fila quede rosada claro."]',
        N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]',
        110
      ),
      (
        N'estudiantes-modificar-suspension',
        N'estudiantes',
        N'/estudiantes',
        N'Modificar o levantar suspension',
        N'Guia para cambiar causa, fecha fin o levantar una suspension vigente.',
        N'Si el estudiante ya esta suspendido, vuelve a buscarlo en Estudiantes y usa Modificar suspension. Desde ahi puedes cambiar el motivo, ajustar la fecha fin o levantar la suspension para que vuelva a gestion normal respecto a la suspension.',
        N'FAQ',
        N'["como modifico una suspension","cambiar fecha fin suspension","reactivar alumno suspendido","levantar suspension","quitar suspension"]',
        N'["Busca el estudiante suspendido.","Abre Modificar suspension.","Ajusta motivo o fecha fin, o usa volver a activo de suspension.","Guarda y refresca las listas relacionadas."]',
        N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]',
        120
      ),
      (
        N'gestion-profe-alumno-rosado',
        N'gestion-profe',
        N'/gestion-profe',
        N'Alumno rosado o suspendido en Gestion del Profe',
        N'Explica por que el docente ve un alumno rosado y bloqueado.',
        N'Si un alumno aparece con fondo rosado claro en Gestion del Profe, esta suspendido. El docente puede verlo para conservar trazabilidad, pero no puede tomar asistencia, calificar, registrar tareas, cotidiano, examenes, seguimiento ni avisos hasta que termine la suspension.',
        N'DIAGNOSTICO',
        N'["por que el alumno sale rosado","por que no puedo calificar al estudiante","alumno suspendido en gestion del profe","no me deja tomar asistencia a un alumno","fila rosada"]',
        N'["Pasa el mouse sobre la fila para ver motivo y fecha fin.","Confirma si la suspension sigue vigente.","Si la suspension no corresponde, pide a un admin revisar Estudiantes.","No intentes crear registros alternos mientras este suspendido."]',
        N'["PROFESOR","PROFESOR_GUIA","SUPER_ADMIN"]',
        130
      ),
      (
        N'gestion-profe-indicadores-habilidades',
        N'gestion-profe',
        N'/gestion-profe',
        N'Agregar indicadores desde habilidades',
        N'Guia completa para crear indicadores desde habilidades.',
        N'En Gestion del Profe, entra al grupo y materia, abre Planeamiento e Indicadores y usa Agregar Indicadores desde Habilidades. Selecciona mes o meses, habilidades de esa materia, plantilla IA, cantidad por habilidad y secciones. Luego genera, revisa, edita si hace falta y guarda el conjunto como Sin Planeamiento o Sin Planeamiento - nombre.',
        N'FAQ',
        N'["como agrego indicadores desde habilidades","generar indicadores por habilidades","ver indicadores a partir de habilidades","indicadores desde habilidades","sin planeamiento"]',
        N'["Selecciona grupo y materia.","Abre Planeamiento e Indicadores.","Usa Agregar Indicadores desde Habilidades.","Escoge meses, habilidades, plantilla IA y secciones.","Genera, revisa los niveles Inicial, Intermedio y Avanzado.","Edita o elimina lo necesario y guarda."]',
        N'["PROFESOR","PROFESOR_GUIA","SUPER_ADMIN"]',
        140
      ),
      (
        N'gestion-profe-no-aparecen-habilidades',
        N'gestion-profe',
        N'/gestion-profe',
        N'No aparecen habilidades para indicadores',
        N'Diagnostico cuando no se cargan habilidades para generar indicadores.',
        N'Si no aparecen habilidades al crear indicadores desde habilidades, revisa que la materia seleccionada corresponda al grupo, que exista el mes escogido, que las habilidades esten activas y que pertenezcan al grado o grupo esperado.',
        N'DIAGNOSTICO',
        N'["no aparecen habilidades","no me salen habilidades","no carga habilidades para indicadores","no puedo seleccionar habilidades"]',
        N'["Confirma el grupo y materia seleccionados.","Revisa mes o meses escogidos.","Valida en Administrativo que existan habilidades activas.","Si la materia o grado no coincide, ajusta el filtro antes de generar."]',
        N'["PROFESOR","PROFESOR_GUIA","SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]',
        150
      ),
      (
        N'gestion-profe-diferencia-indicadores-ia-habilidades',
        N'gestion-profe',
        N'/gestion-profe',
        N'Diferencia entre indicadores IA e indicadores desde habilidades',
        N'Explica las etiquetas de acciones en la lista de planeamientos.',
        N'Generar Indicadores con IA aparece cuando aun no hay indicadores creados para el planeamiento. Ver indicadores generados con IA aparece cuando ya existen indicadores del flujo normal. Ver indicadores a partir de habilidades aparece cuando el conjunto fue creado desde habilidades y normalmente se lista como Sin Planeamiento.',
        N'FAQ',
        N'["diferencia indicadores ia habilidades","por que dice ver indicadores","generar indicadores con ia","ver indicadores generados con ia","ver indicadores a partir de habilidades"]',
        N'["Revisa la etiqueta del boton.","Si dice Generar, aun no existen indicadores para ese caso.","Si dice Ver indicadores generados con IA, ya existen del flujo normal.","Si dice Ver indicadores a partir de habilidades, fueron creados desde habilidades."]',
        N'["PROFESOR","PROFESOR_GUIA","SUPER_ADMIN"]',
        160
      ),
      (
        N'asistencia-informar-encargado',
        N'gestion-profe',
        N'/gestion-profe',
        N'Informar al encargado en asistencia',
        N'Explica cuando se marca automaticamente la casilla de aviso.',
        N'En asistencia, los estados Ausente injustificada, Tardia menor a 10 min y Ausente (Llega 10 minutos tarde) activan automaticamente Informar al encargado. Al posicionarse sobre la casilla marcada, se muestra la leyenda del mensaje que se enviara y el texto cambia segun el estado seleccionado.',
        N'FAQ',
        N'["informar al encargado","mensaje al encargado","que mensaje se envia","ausente injustificada informar","tardia menor a 10 min"]',
        N'["Marca el estado de asistencia.","Verifica si Informar al encargado se activo automaticamente.","Posicionate sobre la casilla para revisar la leyenda del mensaje.","Guarda cuando el mensaje corresponda al estado marcado."]',
        N'["PROFESOR","PROFESOR_GUIA","SUPER_ADMIN"]',
        170
      ),
      (
        N'reportes-alumno-suspendido',
        N'reportes',
        N'/reportes',
        N'Alumno suspendido en reportes',
        N'Explica como interpretar estudiantes suspendidos en Reportes y Certificaciones.',
        N'En Reportes y Certificaciones, el estudiante suspendido debe seguir apareciendo porque conserva historial academico. La fila se marca con fondo rosado claro y al posicionarse muestra Alumno Suspendido, motivo y fecha fin. La suspension bloquea gestion activa, no elimina datos acumulados.',
        N'DIAGNOSTICO',
        N'["alumno suspendido en reportes","por que sale rosado en reportes","estudiante suspendido reporte","suspendido en certificaciones"]',
        N'["Revisa la leyenda al posicionarte sobre la fila.","Confirma motivo y fecha fin.","Si la suspension no corresponde, corrigela desde Estudiantes.","No borres ni alteres datos academicos por una suspension vigente."]',
        N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR_GUIA"]',
        180
      )
    ) AS src (Clave, ModuloClave, RutaContexto, Titulo, Resumen, Respuesta, Tipo, PreguntasJson, PasosJson, AllowedRolesJson, OrdenVisual)
  ) AS source
  ON target.Clave = source.Clave
  WHEN MATCHED THEN
    UPDATE SET
      ModuloClave = source.ModuloClave,
      RutaContexto = source.RutaContexto,
      Titulo = source.Titulo,
      Resumen = source.Resumen,
      Respuesta = source.Respuesta,
      Tipo = source.Tipo,
      PreguntasJson = source.PreguntasJson,
      PasosJson = source.PasosJson,
      AllowedRolesJson = source.AllowedRolesJson,
      OrdenVisual = source.OrdenVisual,
      Activo = 1,
      UpdatedAt = SYSDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (
      Clave, ModuloClave, RutaContexto, Titulo, Resumen, Respuesta, Tipo,
      PreguntasJson, PasosJson, AllowedRolesJson, OrdenVisual, Activo, CreatedAt, UpdatedAt
    )
    VALUES (
      source.Clave, source.ModuloClave, source.RutaContexto, source.Titulo, source.Resumen, source.Respuesta, source.Tipo,
      source.PreguntasJson, source.PasosJson, source.AllowedRolesJson, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME()
    );
END;
GO

IF OBJECT_ID('dbo.AsistentePatronConversacion', 'U') IS NOT NULL
BEGIN
  DECLARE @Patterns TABLE (
    ClavePatron NVARCHAR(80) NOT NULL,
    Frase NVARCHAR(200) NOT NULL,
    OrdenVisual INT NOT NULL
  );

  INSERT INTO @Patterns (ClavePatron, Frase, OrdenVisual)
  VALUES
    (N'CURRENT_SUBFLOW', N'como suspendo un estudiante', 40),
    (N'CURRENT_SUBFLOW', N'por que este alumno sale rosado', 41),
    (N'CURRENT_SUBFLOW', N'por que no puedo calificar este alumno', 42),
    (N'CURRENT_SUBFLOW', N'como agrego indicadores desde habilidades', 43),
    (N'CURRENT_SUBFLOW', N'que mensaje se envia al encargado', 44),
    (N'CURRENT_SUBFLOW', N'por que se marco informar al encargado', 45),
    (N'CURRENT_SUBFLOW', N'como veo indicadores a partir de habilidades', 46);

  MERGE dbo.AsistentePatronConversacion AS target
  USING @Patterns AS source
    ON target.ClavePatron = source.ClavePatron
   AND target.Frase = source.Frase
  WHEN MATCHED THEN
    UPDATE SET OrdenVisual = source.OrdenVisual, Activo = 1, UpdatedAt = SYSDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (ClavePatron, Frase, OrdenVisual, Activo, CreatedAt, UpdatedAt)
    VALUES (source.ClavePatron, source.Frase, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
END;
GO
