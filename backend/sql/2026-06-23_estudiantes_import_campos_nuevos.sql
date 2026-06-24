IF COL_LENGTH('dbo.Estudiante', 'TipoIdentificacion') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD TipoIdentificacion NVARCHAR(80) NULL;
END;
GO

IF COL_LENGTH('dbo.Estudiante', 'Repitente') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD Repitente BIT NULL;
END;
GO

UPDATE dbo.Estudiante
SET Repitente = 0
WHERE Repitente IS NULL;
GO

IF COL_LENGTH('dbo.Estudiante', 'Repitente') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ALTER COLUMN Repitente BIT NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        WHERE dc.parent_object_id = OBJECT_ID('dbo.Estudiante')
          AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Estudiante'), 'Repitente', 'ColumnId')
    )
    BEGIN
        ALTER TABLE dbo.Estudiante
        ADD CONSTRAINT DF_Estudiante_Repitente DEFAULT (0) FOR Repitente;
    END
END;
GO

IF COL_LENGTH('dbo.Estudiante', 'Refugiado') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD Refugiado BIT NULL;
END;
GO

UPDATE dbo.Estudiante
SET Refugiado = 0
WHERE Refugiado IS NULL;
GO

IF COL_LENGTH('dbo.Estudiante', 'Refugiado') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ALTER COLUMN Refugiado BIT NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        WHERE dc.parent_object_id = OBJECT_ID('dbo.Estudiante')
          AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Estudiante'), 'Refugiado', 'ColumnId')
    )
    BEGIN
        ALTER TABLE dbo.Estudiante
        ADD CONSTRAINT DF_Estudiante_Refugiado DEFAULT (0) FOR Refugiado;
    END
END;
GO

IF COL_LENGTH('dbo.Estudiante', 'TipoDiscapacidad') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD TipoDiscapacidad NVARCHAR(150) NULL;
END;
GO

IF COL_LENGTH('dbo.Encargado', 'Titulo') IS NULL
BEGIN
    ALTER TABLE dbo.Encargado
    ADD Titulo NVARCHAR(30) NULL;
END;
GO

IF COL_LENGTH('dbo.Encargado', 'TelefonoSecundario') IS NULL
BEGIN
    ALTER TABLE dbo.Encargado
    ADD TelefonoSecundario NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.EstudianteEncargado', 'AceptaWhatsApp') IS NULL
BEGIN
    ALTER TABLE dbo.EstudianteEncargado
    ADD AceptaWhatsApp BIT NULL;
END;
GO

UPDATE dbo.EstudianteEncargado
SET AceptaWhatsApp = ISNULL(RecibeNotificaciones, 1)
WHERE AceptaWhatsApp IS NULL;
GO

IF COL_LENGTH('dbo.EstudianteEncargado', 'AceptaWhatsApp') IS NOT NULL
BEGIN
    ALTER TABLE dbo.EstudianteEncargado
    ALTER COLUMN AceptaWhatsApp BIT NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        WHERE dc.parent_object_id = OBJECT_ID('dbo.EstudianteEncargado')
          AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.EstudianteEncargado'), 'AceptaWhatsApp', 'ColumnId')
    )
    BEGIN
        ALTER TABLE dbo.EstudianteEncargado
        ADD CONSTRAINT DF_EstudianteEncargado_AceptaWhatsApp DEFAULT (1) FOR AceptaWhatsApp;
    END
END;
GO

IF COL_LENGTH('dbo.EstudianteEncargado', 'AceptaCorreo') IS NULL
BEGIN
    ALTER TABLE dbo.EstudianteEncargado
    ADD AceptaCorreo BIT NULL;
END;
GO

UPDATE dbo.EstudianteEncargado
SET AceptaCorreo = ISNULL(RecibeNotificaciones, 1)
WHERE AceptaCorreo IS NULL;
GO

IF COL_LENGTH('dbo.EstudianteEncargado', 'AceptaCorreo') IS NOT NULL
BEGIN
    ALTER TABLE dbo.EstudianteEncargado
    ALTER COLUMN AceptaCorreo BIT NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        WHERE dc.parent_object_id = OBJECT_ID('dbo.EstudianteEncargado')
          AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.EstudianteEncargado'), 'AceptaCorreo', 'ColumnId')
    )
    BEGIN
        ALTER TABLE dbo.EstudianteEncargado
        ADD CONSTRAINT DF_EstudianteEncargado_AceptaCorreo DEFAULT (1) FOR AceptaCorreo;
    END
END;
GO

IF OBJECT_ID('dbo.EstudianteMovimiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EstudianteMovimiento (
        EstudianteMovimientoId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        EstudianteId INT NOT NULL,
        TipoMovimiento NVARCHAR(80) NULL,
        DescripcionMovimiento NVARCHAR(250) NOT NULL,
        Fuente NVARCHAR(80) NULL,
        FechaMovimiento DATE NOT NULL CONSTRAINT DF_EstudianteMovimiento_Fecha DEFAULT (CAST(GETDATE() AS DATE)),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_EstudianteMovimiento_CreatedAt DEFAULT (SYSDATETIME()),
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_EstudianteMovimiento_Institucion FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId),
        CONSTRAINT FK_EstudianteMovimiento_Estudiante FOREIGN KEY (EstudianteId) REFERENCES dbo.Estudiante(EstudianteId)
    );

    CREATE INDEX IX_EstudianteMovimiento_Estudiante
        ON dbo.EstudianteMovimiento (InstitucionId, EstudianteId, FechaMovimiento DESC, EstudianteMovimientoId DESC);
END;
GO
