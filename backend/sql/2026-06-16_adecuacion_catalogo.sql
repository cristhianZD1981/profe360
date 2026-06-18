IF OBJECT_ID('dbo.AdecuacionCatalogo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdecuacionCatalogo (
        AdecuacionCatalogoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        TipoAdecuacionId INT NOT NULL,
        Tipo NVARCHAR(200) NOT NULL,
        Descripcion NVARCHAR(MAX) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_AdecuacionCatalogo_Activo DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdecuacionCatalogo_CreatedAt DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_AdecuacionCatalogo_Institucion
            FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
        CONSTRAINT FK_AdecuacionCatalogo_TipoAdecuacion
            FOREIGN KEY (TipoAdecuacionId) REFERENCES dbo.TipoAdecuacion(TipoAdecuacionId)
    );

    CREATE UNIQUE INDEX UX_AdecuacionCatalogo_Institucion_TipoAdecuacion_Tipo_Descripcion
        ON dbo.AdecuacionCatalogo (InstitucionId, TipoAdecuacionId, Tipo, Descripcion);
END;
GO

DECLARE @InstitucionId INT = 1;
DECLARE @AdecuacionDescripcion NVARCHAR(150) = N'Significativa';

IF NOT EXISTS (
    SELECT 1
    FROM dbo.TipoAdecuacion
    WHERE InstitucionId = @InstitucionId
      AND Descripcion = @AdecuacionDescripcion
)
BEGIN
    RAISERROR(N'No existe el TipoAdecuacion "%s" para la institución indicada.', 16, 1, @AdecuacionDescripcion);
    RETURN;
END;
GO

DECLARE @InstitucionId INT = 1;
DECLARE @AdecuacionDescripcion NVARCHAR(150) = N'Significativa';

DECLARE @TipoAdecuacionId INT = (
    SELECT TOP 1 TipoAdecuacionId
    FROM dbo.TipoAdecuacion
    WHERE InstitucionId = @InstitucionId
      AND Descripcion = @AdecuacionDescripcion
);

DECLARE @Seed TABLE (
    Tipo NVARCHAR(200) NOT NULL,
    Descripcion NVARCHAR(MAX) NOT NULL
);

INSERT INTO @Seed (Tipo, Descripcion)
VALUES
(N'Apoyos organizativos sugeridos', N'Ubicar al estudiante cerca de compañeros que no se desconcentren.'),
(N'Apoyos organizativos sugeridos', N'Ubicar al estudiante donde mejor pueda ver la pizarra.'),
(N'Apoyos organizativos sugeridos', N'Sentar al estudiante en un lugar donde tenga buena iluminación'),
(N'Apoyos organizativos sugeridos', N'Considerar colocar los asientos en semicírculo.'),
(N'Apoyos organizativos sugeridos', N'Rotular objetos y partes importantes de la clase.'),
(N'Apoyos organizativos sugeridos', N'Organizar y agrupar los y las estudiantes de acuerdo con sus intereses motivacionales'),
(N'Apoyos organizativos sugeridos', N'Organizar el tiempo y del espacio para mejorar el clima organizacional.'),
(N'Apoyos organizativos sugeridos', N'Anotar la fecha de exámenes y entrega de trabajo en un lugar visible.'),
(N'Apoyos organizativos sugeridos', N'Establecer rutinas de trabajo.'),
(N'Apoyos organizativos sugeridos', N'Anotar en la pizarra el número de página y/o ejercicios a realizar.'),

(N'Apoyos Materiales y Tecnológicos sugeridos', N'Ampliar la letra al tamaño que el estudiante sienta mejor.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso de lámparas y lupas para que pueda tener una mejor visión.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Utilización de rotafolios escribiendo con marcador grueso y letra amplia como material de apoyo de temas vistos en clase.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso de dispositivos para que realice grabaciones en clases.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Usar marcadores gruesos preferiblemente azul o negro para escribir en la pizarra.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso del diccionario para ejecución de trabajo cotidiano y pruebas.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Usar láminas, mapas, gráficos y videos relacionados con los aprendizajes que se desarrollan.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso de las tablas de multiplicar para ejecución de trabajo cotidiano y pruebas.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso de la calculadora para la ejecución de trabajo cotidiano y pruebas.'),
(N'Apoyos Materiales y Tecnológicos sugeridos', N'Permitir el uso de fichas con las fórmulas matemáticas para ejecución de trabajo cotidiano y pruebas.'),

(N'Apoyos Curriculares (Metodología)', N'Ajustar los aprendizajes esperados del programa según nivel de funcionamiento.'),
(N'Apoyos Curriculares (Metodología)', N'Utilizar canales sensoriales como: auditivos, kinestésico y táctil para transmitir los aprendizajes.'),
(N'Apoyos Curriculares (Metodología)', N'Permitir más tiempo para terminar los trabajos cotidianos individualmente.'),
(N'Apoyos Curriculares (Metodología)', N'Permitir al estudiante que se comunique como mejor pueda.'),
(N'Apoyos Curriculares (Metodología)', N'Apoyar en señas y gestos al comunicarse.'),
(N'Apoyos Curriculares (Metodología)', N'Hablar siempre frente al estudiante (contacto visual).'),
(N'Apoyos Curriculares (Metodología)', N'De ser necesario disminuir la longitud y la cantidad de las tareas y/ actividades.'),
(N'Apoyos Curriculares (Metodología)', N'Utilizar hojas y material de trabajo poco recargados.'),
(N'Apoyos Curriculares (Metodología)', N'Involucrar al estudiante durante la lección, es decir participación frecuente utilizando la realimentación.'),
(N'Apoyos Curriculares (Metodología)', N'Dividir la actividad o tarea en partes y déselas una por una.'),
(N'Apoyos Curriculares (Metodología)', N'Permitir un rato de descanso entre una actividad y otra.'),
(N'Apoyos Curriculares (Metodología)', N'Devolver los trabajos que realiza muy rápido para que los revise.'),
(N'Apoyos Curriculares (Metodología)', N'Dividir el trabajo de clase de tal manera que, si queda algo pendiente, pueda terminarlo en la casa.'),
(N'Apoyos Curriculares (Metodología)', N'Relacionar la escritura del estudiante con su fonética y no evaluar o restar puntos por el error.'),
(N'Apoyos Curriculares (Metodología)', N'Desarrollar metodología sobre un solo tema a la vez.'),
(N'Apoyos Curriculares (Metodología)', N'Facilitar prácticas de reforzamiento para hacer en casa.'),
(N'Apoyos Curriculares (Metodología)', N'Utilizar la técnica de la dramatización.'),

(N'Apoyos Curriculares sugeridos (Evaluación)', N'Dar tiempo adicional para la realización de los trabajos en clase y las pruebas.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Utilizar solamente ítems de selección simple.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Resolver la prueba en recinto aparte.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Aplicar prueba específica.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Omitir la calificación de la caligrafía.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Ajustar el tamaño de la letra.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Aplicar una prueba por día.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Eliminar ítems memorísticos.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Aplicar evaluaciones cortas y frecuentes.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Tutor especialista.'),
(N'Apoyos Curriculares sugeridos (Evaluación)', N'Permitir emitir algunas respuestas de manera oral y la transcripción por parte de la persona docente, ante el rezago en el proceso de lectoescritura.');

INSERT INTO dbo.AdecuacionCatalogo
(
    InstitucionId,
    TipoAdecuacionId,
    Tipo,
    Descripcion,
    Activo,
    CreatedAt
)
SELECT
    @InstitucionId,
    @TipoAdecuacionId,
    s.Tipo,
    s.Descripcion,
    1,
    SYSDATETIME()
FROM @Seed s
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.AdecuacionCatalogo a
    WHERE a.InstitucionId = @InstitucionId
      AND a.TipoAdecuacionId = @TipoAdecuacionId
      AND a.Tipo = s.Tipo
      AND a.Descripcion = s.Descripcion
);
GO
