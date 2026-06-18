IF COL_LENGTH('dbo.Estudiante', 'TieneAdecuacion') IS NOT NULL
   AND COL_LENGTH('dbo.Estudiante', 'Adecuacion') IS NOT NULL
BEGIN
    UPDATE dbo.Estudiante
    SET TieneAdecuacion = 0,
        Adecuacion = NULL
    WHERE UPPER(LTRIM(RTRIM(ISNULL(Adecuacion, N'')))) IN (
        N'REGULAR',
        N'SIN ADECUACION',
        N'SIN ADECUACIÓN',
        N'SELECCIONE',
        N'NO'
    );
END
GO

IF OBJECT_ID('dbo.TipoAdecuacion', 'U') IS NOT NULL
BEGIN
    UPDATE dbo.TipoAdecuacion
    SET Activo = 0
    WHERE UPPER(LTRIM(RTRIM(ISNULL(Descripcion, N'')))) IN (
        N'REGULAR',
        N'SIN ADECUACION',
        N'SIN ADECUACIÓN',
        N'SELECCIONE',
        N'NO'
    );
END
GO
