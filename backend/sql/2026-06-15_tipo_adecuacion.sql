IF OBJECT_ID('dbo.TipoAdecuacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TipoAdecuacion (
        TipoAdecuacionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        Descripcion NVARCHAR(150) NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_TipoAdecuacion_Activo DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_TipoAdecuacion_CreatedAt DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_TipoAdecuacion_Institucion
            FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
        CONSTRAINT UQ_TipoAdecuacion_Institucion_Descripcion
            UNIQUE (InstitucionId, Descripcion)
    );
END;
GO
