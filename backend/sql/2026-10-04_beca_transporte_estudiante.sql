IF COL_LENGTH(N'dbo.Estudiante', N'BecaTransporte') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
        ADD BecaTransporte BIT NOT NULL
            CONSTRAINT DF_Estudiante_BecaTransporte DEFAULT (0) WITH VALUES;
END;
