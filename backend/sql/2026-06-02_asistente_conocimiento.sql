IF OBJECT_ID('dbo.AsistenteModuloGuia', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteModuloGuia (
    AsistenteModuloGuiaId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Clave NVARCHAR(80) NOT NULL,
    Titulo NVARCHAR(120) NOT NULL,
    Ruta NVARCHAR(200) NOT NULL,
    Resumen NVARCHAR(MAX) NOT NULL,
    AllowedRolesJson NVARCHAR(MAX) NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteModuloGuia_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteModuloGuia_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloGuia_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloGuia_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteModuloGuia_Clave UNIQUE (Clave)
  );

  CREATE INDEX IX_AsistenteModuloGuia_Activo_Orden
    ON dbo.AsistenteModuloGuia (Activo, OrdenVisual, Titulo);
END;

IF OBJECT_ID('dbo.AsistenteModuloAlias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteModuloAlias (
    AsistenteModuloAliasId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AsistenteModuloGuiaId INT NOT NULL,
    Alias NVARCHAR(150) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteModuloAlias_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteModuloAlias_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloAlias_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloAlias_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteModuloAlias_Guia FOREIGN KEY (AsistenteModuloGuiaId)
      REFERENCES dbo.AsistenteModuloGuia (AsistenteModuloGuiaId)
  );

  CREATE INDEX IX_AsistenteModuloAlias_Guia
    ON dbo.AsistenteModuloAlias (AsistenteModuloGuiaId, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteModuloPaso', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteModuloPaso (
    AsistenteModuloPasoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AsistenteModuloGuiaId INT NOT NULL,
    Descripcion NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteModuloPaso_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteModuloPaso_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloPaso_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteModuloPaso_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteModuloPaso_Guia FOREIGN KEY (AsistenteModuloGuiaId)
      REFERENCES dbo.AsistenteModuloGuia (AsistenteModuloGuiaId)
  );

  CREATE INDEX IX_AsistenteModuloPaso_Guia
    ON dbo.AsistenteModuloPaso (AsistenteModuloGuiaId, Activo, OrdenVisual);
END;

IF OBJECT_ID('dbo.AsistenteAccionFrase', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteAccionFrase (
    AsistenteAccionFraseId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ModuloClave NVARCHAR(80) NOT NULL,
    Frase NVARCHAR(200) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteAccionFrase_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteAccionFrase_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteAccionFrase_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteAccionFrase_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT FK_AsistenteAccionFrase_Guia FOREIGN KEY (ModuloClave)
      REFERENCES dbo.AsistenteModuloGuia (Clave)
  );

  CREATE INDEX IX_AsistenteAccionFrase_Modulo
    ON dbo.AsistenteAccionFrase (ModuloClave, Activo, OrdenVisual);
END;

DECLARE @Guides TABLE (
  Clave NVARCHAR(80) NOT NULL,
  Titulo NVARCHAR(120) NOT NULL,
  Ruta NVARCHAR(200) NOT NULL,
  Resumen NVARCHAR(MAX) NOT NULL,
  AllowedRolesJson NVARCHAR(MAX) NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @Guides (Clave, Titulo, Ruta, Resumen, AllowedRolesJson, OrdenVisual)
VALUES
  (N'dashboard', N'Dashboard', N'/', N'Te sirve para ubicarte rapido en la plataforma y entrar al modulo que necesitas.', NULL, 10),
  (N'instituciones', N'Instituciones', N'/instituciones', N'Permite crear, editar y mantener la informacion base de la institucion.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 20),
  (N'administrativo', N'Administrativo', N'/administrativo', N'Es el modulo base para configurar anos, periodos, grupos, materias, asignaciones, bloques y horarios.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 30),
  (N'usuarios', N'Usuarios', N'/usuarios', N'Sirve para crear usuarios, asignar roles y mantener accesos.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 40),
  (N'estudiantes', N'Estudiantes', N'/estudiantes', N'Permite registrar, editar y consultar la informacion del estudiante.', NULL, 50),
  (N'matricula', N'Matricula', N'/matricula', N'Sirve para ingresar al estudiante en un grupo y manejar cambios de seccion.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO"]', 60),
  (N'parametrizaciones', N'Parametrizaciones', N'/parametrizaciones', N'Te permite configurar plantillas, niveles, rubros y opciones base de evaluacion e IA.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 70),
  (N'horarios', N'Horarios', N'/horarios', N'Se usa para consultar horarios por seccion, estudiante o profesor.', NULL, 80),
  (N'asistencia', N'Asistencia', N'/asistencia', N'Permite revisar o registrar asistencia segun el flujo habilitado para tu rol.', NULL, 90),
  (N'seguimiento-notas', N'Seguimiento de Notas', N'/seguimiento-notas', N'Sirve para seguir indicadores y resumenes puntuales por estudiante.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 100),
  (N'gestion-profe', N'Gestion del Profe', N'/gestion-profe', N'Es el modulo principal del docente para trabajar grupos, asistencia, notas, planeamientos y reportes.', N'["PROFESOR"]', 110),
  (N'planeamiento-ia', N'Planeamiento con IA', N'/planeamiento-ia', N'Permite generar un borrador de planeamiento con apoyo de IA y luego guardarlo.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR","PROFESOR_GUIA"]', 120),
  (N'reportes', N'Reportes', N'/reportes', N'Te ayuda a consultar reportes institucionales, de asistencia y otras salidas disponibles.', N'["SUPER_ADMIN","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","PROFESOR_GUIA"]', 130);

MERGE dbo.AsistenteModuloGuia AS target
USING @Guides AS source
  ON target.Clave = source.Clave
WHEN MATCHED THEN
  UPDATE SET
    Titulo = source.Titulo,
    Ruta = source.Ruta,
    Resumen = source.Resumen,
    AllowedRolesJson = source.AllowedRolesJson,
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (Clave, Titulo, Ruta, Resumen, AllowedRolesJson, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.Clave, source.Titulo, source.Ruta, source.Resumen, source.AllowedRolesJson, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @Aliases TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  Alias NVARCHAR(150) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @Aliases (ModuloClave, Alias, OrdenVisual)
VALUES
  (N'dashboard', N'dashboard', 1),
  (N'dashboard', N'inicio', 2),
  (N'dashboard', N'panel principal', 3),
  (N'instituciones', N'instituciones', 1),
  (N'instituciones', N'institucion', 2),
  (N'instituciones', N'nueva institucion', 3),
  (N'instituciones', N'crear institucion', 4),
  (N'administrativo', N'administrativo', 1),
  (N'administrativo', N'academico', 2),
  (N'administrativo', N'area administrativa', 3),
  (N'usuarios', N'usuarios', 1),
  (N'usuarios', N'roles', 2),
  (N'usuarios', N'personal', 3),
  (N'estudiantes', N'estudiantes', 1),
  (N'estudiantes', N'estudiante', 2),
  (N'estudiantes', N'alumnos', 3),
  (N'estudiantes', N'alumno', 4),
  (N'matricula', N'matricula', 1),
  (N'matricula', N'matricular', 2),
  (N'matricula', N'traslado de seccion', 3),
  (N'matricula', N'cambio de seccion', 4),
  (N'parametrizaciones', N'parametrizaciones', 1),
  (N'parametrizaciones', N'evaluaciones', 2),
  (N'parametrizaciones', N'configuracion ia', 3),
  (N'parametrizaciones', N'plantillas', 4),
  (N'horarios', N'horarios', 1),
  (N'horarios', N'horario', 2),
  (N'horarios', N'consulta de horarios', 3),
  (N'asistencia', N'asistencia', 1),
  (N'asistencia', N'ausencias', 2),
  (N'asistencia', N'tardias', 3),
  (N'seguimiento-notas', N'seguimiento notas', 1),
  (N'seguimiento-notas', N'seguimiento de notas', 2),
  (N'seguimiento-notas', N'indicadores por estudiante', 3),
  (N'gestion-profe', N'gestion del profe', 1),
  (N'gestion-profe', N'modulo del profe', 2),
  (N'gestion-profe', N'registro de notas', 3),
  (N'gestion-profe', N'seguimiento diario', 4),
  (N'planeamiento-ia', N'planeamiento ia', 1),
  (N'planeamiento-ia', N'ia para planeamientos', 2),
  (N'planeamiento-ia', N'generar planeamiento', 3),
  (N'reportes', N'reportes', 1),
  (N'reportes', N'certificaciones', 2),
  (N'reportes', N'reporte de asistencia', 3),
  (N'reportes', N'reporte de notas', 4);

MERGE dbo.AsistenteModuloAlias AS target
USING (
  SELECT g.AsistenteModuloGuiaId, a.Alias, a.OrdenVisual
  FROM @Aliases a
  INNER JOIN dbo.AsistenteModuloGuia g ON g.Clave = a.ModuloClave
) AS source
  ON target.AsistenteModuloGuiaId = source.AsistenteModuloGuiaId
 AND target.Alias = source.Alias
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (AsistenteModuloGuiaId, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.AsistenteModuloGuiaId, source.Alias, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @Steps TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  OrdenVisual INT NOT NULL,
  Descripcion NVARCHAR(MAX) NOT NULL
);

INSERT INTO @Steps (ModuloClave, OrdenVisual, Descripcion)
VALUES
  (N'dashboard', 1, N'Entra al sistema con tu usuario y clave.'),
  (N'dashboard', 2, N'Revisa los accesos visibles en el menu izquierdo.'),
  (N'dashboard', 3, N'Elige el modulo que quieres trabajar.'),
  (N'dashboard', 4, N'Si no ves un modulo, normalmente es por permisos del rol.'),
  (N'instituciones', 1, N'Entra a Instituciones.'),
  (N'instituciones', 2, N'Presiona el boton para crear una nueva institucion o editar una existente.'),
  (N'instituciones', 3, N'Completa los datos generales de la institucion.'),
  (N'instituciones', 4, N'Guarda los cambios.'),
  (N'instituciones', 5, N'Verifica que la institucion quede disponible para los procesos relacionados.'),
  (N'administrativo', 1, N'Configura primero Ano Lectivo y Periodos.'),
  (N'administrativo', 2, N'Luego crea los Grupos o secciones.'),
  (N'administrativo', 3, N'Despues registra Materias y Habilidades de planeamiento si aplica.'),
  (N'administrativo', 4, N'Asigna docentes a grupo y materia.'),
  (N'administrativo', 5, N'Crea Bloques Horarios y luego Horario de clases.'),
  (N'administrativo', 6, N'Usa Fechas de clase, Dias lectivos y Feriados para completar la operacion academica.'),
  (N'usuarios', 1, N'Entra a Usuarios.'),
  (N'usuarios', 2, N'Busca si la persona ya existe.'),
  (N'usuarios', 3, N'Si no existe, crea el usuario con correo y datos basicos.'),
  (N'usuarios', 4, N'Asignale el rol correcto.'),
  (N'usuarios', 5, N'Guarda y confirma que la persona pueda ingresar.'),
  (N'estudiantes', 1, N'Abri Estudiantes.'),
  (N'estudiantes', 2, N'Busca por nombre, apellido o cedula.'),
  (N'estudiantes', 3, N'Si necesitas crear uno nuevo, completa los datos personales.'),
  (N'estudiantes', 4, N'Guarda el registro.'),
  (N'estudiantes', 5, N'Luego segui con Matricula si el estudiante debe quedar en una seccion.'),
  (N'matricula', 1, N'Entra a Matricula.'),
  (N'matricula', 2, N'Busca el estudiante o crealo primero si hace falta.'),
  (N'matricula', 3, N'Elige ano lectivo, grupo y datos de matricula.'),
  (N'matricula', 4, N'Guarda la matricula.'),
  (N'matricula', 5, N'Si es traslado, verifica la seccion origen y destino antes de guardar.'),
  (N'matricula', 6, N'Luego revisa notas y reportes si el cambio afecta evaluaciones.'),
  (N'parametrizaciones', 1, N'Entra a Parametrizaciones.'),
  (N'parametrizaciones', 2, N'Elige si vas a trabajar Evaluaciones o Configuracion IA.'),
  (N'parametrizaciones', 3, N'En Evaluaciones, configura rubros, porcentajes y estructuras.'),
  (N'parametrizaciones', 4, N'En Configuracion IA, ajusta plantillas o prompts visibles.'),
  (N'parametrizaciones', 5, N'Guarda los cambios y luego pruebalo en el modulo que los usa.'),
  (N'horarios', 1, N'Entra al modulo Horarios.'),
  (N'horarios', 2, N'Elige el criterio de consulta disponible.'),
  (N'horarios', 3, N'Busca por seccion, profesor o estudiante.'),
  (N'horarios', 4, N'Revisa la informacion mostrada por dia y bloque.'),
  (N'asistencia', 1, N'Entra al modulo Asistencia.'),
  (N'asistencia', 2, N'Elige grupo, materia o filtro solicitado.'),
  (N'asistencia', 3, N'Marca el estado del estudiante.'),
  (N'asistencia', 4, N'Guarda la sesion o el registro.'),
  (N'asistencia', 5, N'Luego revisa el reporte si necesitas validar resultados.'),
  (N'seguimiento-notas', 1, N'Entra a Seguimiento de Notas.'),
  (N'seguimiento-notas', 2, N'Selecciona grupo, componente y estudiante.'),
  (N'seguimiento-notas', 3, N'Si el rubro usa indicadores, elige el planeamiento.'),
  (N'seguimiento-notas', 4, N'Carga los indicadores o revisa los ya guardados.'),
  (N'seguimiento-notas', 5, N'Guarda los cambios y revisa el resumen.'),
  (N'gestion-profe', 1, N'Entra a Gestion del Profe.'),
  (N'gestion-profe', 2, N'Elige el grupo y la materia.'),
  (N'gestion-profe', 3, N'Abre el panel que necesitas: Asistencia, Registro de notas, Seguimiento diario, Planeamiento e Indicadores o Reportes.'),
  (N'gestion-profe', 4, N'Realiza la accion del panel.'),
  (N'gestion-profe', 5, N'Guarda y luego valida el resultado en reportes si aplica.'),
  (N'planeamiento-ia', 1, N'Entra a Planeamiento con IA.'),
  (N'planeamiento-ia', 2, N'Elige plantilla, materia, grado o secciones segun la pantalla.'),
  (N'planeamiento-ia', 3, N'Selecciona mes o meses.'),
  (N'planeamiento-ia', 4, N'Define la periodicidad.'),
  (N'planeamiento-ia', 5, N'Indica la competencia general.'),
  (N'planeamiento-ia', 6, N'Marca las habilidades.'),
  (N'planeamiento-ia', 7, N'Genera el planeamiento con IA.'),
  (N'planeamiento-ia', 8, N'Revisa el resultado y guardalo.'),
  (N'reportes', 1, N'Entra a Reportes.'),
  (N'reportes', 2, N'Elige el tipo de reporte.'),
  (N'reportes', 3, N'Completa filtros como grupo, periodo, estudiante o fecha.'),
  (N'reportes', 4, N'Genera el reporte.'),
  (N'reportes', 5, N'Revisa si quieres exportar o imprimir.');

MERGE dbo.AsistenteModuloPaso AS target
USING (
  SELECT g.AsistenteModuloGuiaId, s.Descripcion, s.OrdenVisual
  FROM @Steps s
  INNER JOIN dbo.AsistenteModuloGuia g ON g.Clave = s.ModuloClave
) AS source
  ON target.AsistenteModuloGuiaId = source.AsistenteModuloGuiaId
 AND target.OrdenVisual = source.OrdenVisual
WHEN MATCHED THEN
  UPDATE SET
    Descripcion = source.Descripcion,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (AsistenteModuloGuiaId, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.AsistenteModuloGuiaId, source.Descripcion, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());

DECLARE @Actions TABLE (
  ModuloClave NVARCHAR(80) NOT NULL,
  Frase NVARCHAR(200) NOT NULL,
  OrdenVisual INT NOT NULL
);

INSERT INTO @Actions (ModuloClave, Frase, OrdenVisual)
VALUES
  (N'instituciones', N'crear institucion', 1),
  (N'instituciones', N'nueva institucion', 2),
  (N'instituciones', N'ingresar una nueva institucion', 3),
  (N'instituciones', N'registrar institucion', 4),
  (N'instituciones', N'editar institucion', 5),
  (N'usuarios', N'crear usuario', 1),
  (N'usuarios', N'nuevo usuario', 2),
  (N'usuarios', N'registrar usuario', 3),
  (N'usuarios', N'dar acceso', 4),
  (N'usuarios', N'asignar rol', 5),
  (N'usuarios', N'crear profesor', 6),
  (N'usuarios', N'crear admin', 7),
  (N'estudiantes', N'crear estudiante', 1),
  (N'estudiantes', N'nuevo estudiante', 2),
  (N'estudiantes', N'registrar estudiante', 3),
  (N'estudiantes', N'crear alumno', 4),
  (N'estudiantes', N'nuevo alumno', 5),
  (N'estudiantes', N'registrar alumno', 6),
  (N'estudiantes', N'editar estudiante', 7),
  (N'matricula', N'matricular alumno', 1),
  (N'matricula', N'matricular estudiante', 2),
  (N'matricula', N'hacer matricula', 3),
  (N'matricula', N'crear matricula', 4),
  (N'matricula', N'cambiar de seccion', 5),
  (N'matricula', N'trasladar alumno', 6),
  (N'matricula', N'trasladar estudiante', 7),
  (N'matricula', N'mover de seccion', 8),
  (N'administrativo', N'crear grupo', 1),
  (N'administrativo', N'crear seccion', 2),
  (N'administrativo', N'asignar docente', 3),
  (N'administrativo', N'crear horario', 4),
  (N'administrativo', N'hacer horario', 5),
  (N'administrativo', N'configurar bloques', 6),
  (N'administrativo', N'crear materia por grupo', 7),
  (N'parametrizaciones', N'configurar evaluacion', 1),
  (N'parametrizaciones', N'parametrizar evaluacion', 2),
  (N'parametrizaciones', N'crear rubro', 3),
  (N'parametrizaciones', N'configurar ia', 4),
  (N'parametrizaciones', N'editar plantilla ia', 5),
  (N'parametrizaciones', N'crear plantilla ia', 6),
  (N'horarios', N'ver horario', 1),
  (N'horarios', N'consultar horario', 2),
  (N'horarios', N'buscar horario del profe', 3),
  (N'horarios', N'buscar horario de un grupo', 4),
  (N'asistencia', N'pasar asistencia', 1),
  (N'asistencia', N'registrar asistencia', 2),
  (N'asistencia', N'tomar asistencia', 3),
  (N'asistencia', N'ver asistencia', 4),
  (N'seguimiento-notas', N'seguir indicadores', 1),
  (N'seguimiento-notas', N'seguimiento de notas', 2),
  (N'seguimiento-notas', N'ver seguimiento del estudiante', 3),
  (N'gestion-profe', N'registro de notas', 1),
  (N'gestion-profe', N'calificar tareas', 2),
  (N'gestion-profe', N'calificar cotidiano', 3),
  (N'gestion-profe', N'calificar examenes', 4),
  (N'gestion-profe', N'seguir diario', 5),
  (N'gestion-profe', N'seguimiento diario', 6),
  (N'gestion-profe', N'trabajar con mi grupo', 7),
  (N'planeamiento-ia', N'hacer planeamiento', 1),
  (N'planeamiento-ia', N'crear planeamiento', 2),
  (N'planeamiento-ia', N'generar planeamiento', 3),
  (N'planeamiento-ia', N'planeamiento con ia', 4),
  (N'reportes', N'sacar reporte', 1),
  (N'reportes', N'generar reporte', 2),
  (N'reportes', N'ver reporte', 3),
  (N'reportes', N'imprimir reporte', 4),
  (N'reportes', N'exportar reporte', 5);

MERGE dbo.AsistenteAccionFrase AS target
USING @Actions AS source
  ON target.ModuloClave = source.ModuloClave
 AND target.Frase = source.Frase
WHEN MATCHED THEN
  UPDATE SET
    OrdenVisual = source.OrdenVisual,
    Activo = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (ModuloClave, Frase, OrdenVisual, Activo, CreatedAt, UpdatedAt)
  VALUES (source.ModuloClave, source.Frase, source.OrdenVisual, 1, SYSDATETIME(), SYSDATETIME());
