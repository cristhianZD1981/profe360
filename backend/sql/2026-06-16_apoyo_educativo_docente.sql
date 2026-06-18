IF OBJECT_ID('dbo.ApoyoEducativo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApoyoEducativo (
        ApoyoEducativoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        UsuarioId INT NOT NULL,
        Activo BIT NOT NULL CONSTRAINT DF_ApoyoEducativo_Activo DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ApoyoEducativo_CreatedAt DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_ApoyoEducativo_Institucion
            FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
        CONSTRAINT FK_ApoyoEducativo_Usuario
            FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuario(UsuarioId)
    );
END;
GO

IF OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApoyoEducativoEstudiante (
        ApoyoEducativoEstudianteId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ApoyoEducativoId INT NOT NULL,
        EstudianteId INT NOT NULL,
        GrupoId INT NOT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ApoyoEducativoEstudiante_CreatedAt DEFAULT SYSDATETIME(),
        CONSTRAINT FK_ApoyoEducativoEstudiante_ApoyoEducativo
            FOREIGN KEY (ApoyoEducativoId) REFERENCES dbo.ApoyoEducativo(ApoyoEducativoId),
        CONSTRAINT FK_ApoyoEducativoEstudiante_Estudiante
            FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId),
        CONSTRAINT FK_ApoyoEducativoEstudiante_Grupo
            FOREIGN KEY (GrupoId) REFERENCES dbo.Grupo(GrupoId),
        CONSTRAINT UQ_ApoyoEducativoEstudiante
            UNIQUE (ApoyoEducativoId, EstudianteId, GrupoId)
    );
END;
GO

IF OBJECT_ID('dbo.ApoyoEducativoDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApoyoEducativoDetalle (
        ApoyoEducativoDetalleId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ApoyoEducativoId INT NOT NULL,
        AdecuacionCatalogoId INT NOT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ApoyoEducativoDetalle_CreatedAt DEFAULT SYSDATETIME(),
        CONSTRAINT FK_ApoyoEducativoDetalle_ApoyoEducativo
            FOREIGN KEY (ApoyoEducativoId) REFERENCES dbo.ApoyoEducativo(ApoyoEducativoId),
        CONSTRAINT FK_ApoyoEducativoDetalle_AdecuacionCatalogo
            FOREIGN KEY (AdecuacionCatalogoId) REFERENCES dbo.AdecuacionCatalogo(AdecuacionCatalogoId),
        CONSTRAINT UQ_ApoyoEducativoDetalle
            UNIQUE (ApoyoEducativoId, AdecuacionCatalogoId)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ApoyoEducativo_Institucion_Usuario'
      AND object_id = OBJECT_ID('dbo.ApoyoEducativo')
)
BEGIN
    CREATE INDEX IX_ApoyoEducativo_Institucion_Usuario
        ON dbo.ApoyoEducativo (InstitucionId, UsuarioId, CreatedAt DESC);
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeNombre') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeNombre NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeMimeType') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeMimeType NVARCHAR(150) NULL;
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeDocx') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeDocx VARBINARY(MAX) NULL;
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeGeneradoAt') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeGeneradoAt DATETIME2 NULL;
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'PlantillaNombre') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD PlantillaNombre NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'DatosInformeJson') IS NULL
BEGIN
    ALTER TABLE dbo.ApoyoEducativoEstudiante ADD DatosInformeJson NVARCHAR(MAX) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ApoyoEducativoEstudiante_Estudiante'
      AND object_id = OBJECT_ID('dbo.ApoyoEducativoEstudiante')
)
BEGIN
    CREATE INDEX IX_ApoyoEducativoEstudiante_Estudiante
        ON dbo.ApoyoEducativoEstudiante (EstudianteId, GrupoId);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_ApoyoEducativoDetalle_Adecuacion'
      AND object_id = OBJECT_ID('dbo.ApoyoEducativoDetalle')
)
BEGIN
    CREATE INDEX IX_ApoyoEducativoDetalle_Adecuacion
        ON dbo.ApoyoEducativoDetalle (AdecuacionCatalogoId);
END;
GO
