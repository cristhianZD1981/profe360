IF OBJECT_ID('dbo.AsistenteIndicacionAdmin', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AsistenteIndicacionAdmin (
    AsistenteIndicacionAdminId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    InstitucionId INT NULL,
    Titulo NVARCHAR(150) NOT NULL,
    Categoria NVARCHAR(60) NOT NULL CONSTRAINT DF_AsistenteIndicacionAdmin_Categoria DEFAULT(N'GENERAL'),
    Instruccion NVARCHAR(MAX) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_AsistenteIndicacionAdmin_Orden DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_AsistenteIndicacionAdmin_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteIndicacionAdmin_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AsistenteIndicacionAdmin_UpdatedAt DEFAULT(SYSDATETIME())
  );

  CREATE INDEX IX_AsistenteIndicacionAdmin_Institucion
    ON dbo.AsistenteIndicacionAdmin (InstitucionId, Activo, OrdenVisual);
END;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.AsistenteIndicacionAdmin
  WHERE InstitucionId IS NULL
    AND Titulo = N'Priorizar uso guiado'
)
BEGIN
  INSERT INTO dbo.AsistenteIndicacionAdmin (
    InstitucionId,
    Titulo,
    Categoria,
    Instruccion,
    OrdenVisual,
    Activo,
    CreatedAt,
    UpdatedAt
  )
  VALUES
  (
    NULL,
    N'Priorizar uso guiado',
    N'GUIA',
    N'Cuando la persona usuaria pregunte como usar un modulo, prioriza siempre explicar el paso a paso correcto dentro de la herramienta antes de responder de forma generica.',
    10,
    1,
    SYSDATETIME(),
    SYSDATETIME()
  ),
  (
    NULL,
    N'Enfoque administrativo',
    N'ADMINISTRATIVO',
    N'Si la persona esta en un flujo administrativo, explicale el orden correcto de configuracion y advertile dependencias previas como ano lectivo, periodos, grupos, materias y asignaciones.',
    20,
    1,
    SYSDATETIME(),
    SYSDATETIME()
  ),
  (
    NULL,
    N'Tono de Margarita',
    N'TONO',
    N'Responde como Margarita, de forma amable, clara, humana y orientada a resolver el uso de PROFE360 sin inventar datos.',
    30,
    1,
    SYSDATETIME(),
    SYSDATETIME()
  );
END;
