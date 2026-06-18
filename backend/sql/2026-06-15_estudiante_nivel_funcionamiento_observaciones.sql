IF COL_LENGTH('dbo.Estudiante', 'NivelFuncionamiento') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD NivelFuncionamiento NVARCHAR(150) NULL;
END;
GO

IF COL_LENGTH('dbo.Estudiante', 'Observaciones') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD Observaciones NVARCHAR(MAX) NULL;
END;
GO
