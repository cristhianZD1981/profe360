IF OBJECT_ID('dbo.AsistenteFaq', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteFaq (
    AsistenteFaqId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Clave NVARCHAR(80) NOT NULL,
    ModuloClave NVARCHAR(80) NOT NULL,
    RutaContexto NVARCHAR(200) NOT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Resumen NVARCHAR(MAX) NULL,
    Respuesta NVARCHAR(MAX) NOT NULL,
    Tipo NVARCHAR(30) NOT NULL CONSTRAINT DF_AsistenteFaq_Tipo DEFAULT(N'FAQ'),
    PreguntasJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AsistenteFaq_Preguntas DEFAULT(N'[]'),
    PasosJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AsistenteFaq_Pasos DEFAULT(N'[]'),
    AllowedRolesJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_AsistenteFaq_AllowedRoles DEFAULT(N'[]'),
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteFaq_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteFaq_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFaq_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteFaq_UpdatedAt DEFAULT(SYSDATETIME()),
    CONSTRAINT UQ_AsistenteFaq_Clave UNIQUE (Clave)
  );
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_AsistenteFaq_ModuloRuta'
    AND object_id = OBJECT_ID('dbo.AsistenteFaq')
)
BEGIN
  CREATE INDEX IX_AsistenteFaq_ModuloRuta
    ON dbo.AsistenteFaq (ModuloClave, RutaContexto, Activo, OrdenVisual);
END
GO

MERGE dbo.AsistenteFaq AS target
USING (
  SELECT *
  FROM (VALUES
    (
      N'gestion-profe-no-veo-estudiantes',
      N'gestion-profe',
      N'/gestion-profe',
      N'No veo estudiantes en Gestion del Profe',
      N'Chequeo rapido cuando el docente no encuentra alumnos en su grupo o panel.',
      N'Si no ves estudiantes, normalmente el problema esta en la matricula activa del grupo, en la asignacion docente o en los filtros de grupo, materia, periodo o fecha.',
      N'DIAGNOSTICO',
      N'["no veo estudiantes","no me aparecen estudiantes","no salen alumnos","no carga la lista de estudiantes"]',
      N'["Revisa que el grupo tenga matricula activa.","Confirma que la materia este asignada al docente.","Verifica que elegiste el grupo, materia y periodo correctos.","Si estas en asistencia o notas, cambia la fecha o refresca el panel."]',
      N'["PROFESOR","PROFESOR_GUIA","ADMIN_INSTITUCIONAL","ADMINISTRATIVO","SUPER_ADMIN"]',
      10
    ),
    (
      N'administrativo-no-aparece-grupo',
      N'administrativo',
      N'/administrativo',
      N'No aparece un grupo o seccion',
      N'Chequeo rapido cuando una seccion no aparece donde deberia.',
      N'Si una seccion no aparece, casi siempre falta crearla en Gestion de grupos, asociarle el ano lectivo correcto o relacionarla con materias y docente.',
      N'DIAGNOSTICO',
      N'["no aparece el grupo","no aparece la seccion","no veo la seccion","no me sale el grupo"]',
      N'["Revisa que el grupo exista en Gestion de grupos.","Confirma que el ano lectivo sea el correcto.","Verifica Materias por grupo.","Revisa Asignacion Docentes si el problema es del profe."]',
      N'["ADMIN_INSTITUCIONAL","ADMINISTRATIVO","SUPER_ADMIN"]',
      20
    ),
    (
      N'estudiantes-como-importar',
      N'estudiantes',
      N'/estudiantes',
      N'Como importar estudiantes',
      N'Guia corta para el flujo de importacion de alumnos.',
      N'Para importar estudiantes, primero descarga la plantilla, completa los datos obligatorios, revisa adecuacion si aplica y luego sube el archivo desde el modulo de Estudiantes.',
      N'FAQ',
      N'["como importo estudiantes","como cargar estudiantes","como subir alumnos por excel","como importar alumnos"]',
      N'["Descarga la plantilla oficial.","Completa identificacion, nombres y demas datos requeridos.","Si el alumno tiene adecuacion, marca el check correspondiente.","Sube el archivo y revisa el resumen de importacion antes de terminar."]',
      N'["ADMIN_INSTITUCIONAL","ADMINISTRATIVO","SUPER_ADMIN"]',
      30
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
GO
