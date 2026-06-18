IF OBJECT_ID('dbo.ApoyoEducativoEstudiante', 'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeNombre') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeNombre NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeMimeType') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeMimeType NVARCHAR(150) NULL;

    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeDocx') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeDocx VARBINARY(MAX) NULL;

    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'InformeGeneradoAt') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD InformeGeneradoAt DATETIME2 NULL;

    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'PlantillaNombre') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD PlantillaNombre NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.ApoyoEducativoEstudiante', 'DatosInformeJson') IS NULL
        ALTER TABLE dbo.ApoyoEducativoEstudiante ADD DatosInformeJson NVARCHAR(MAX) NULL;
END;
GO
