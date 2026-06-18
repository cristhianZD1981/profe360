IF COL_LENGTH('dbo.Estudiante', 'TieneAdecuacion') IS NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ADD TieneAdecuacion BIT NULL;
END
GO

UPDATE dbo.Estudiante
SET TieneAdecuacion = CASE
    WHEN NULLIF(LTRIM(RTRIM(ISNULL(Adecuacion, N''))), N'') IS NOT NULL THEN 1
    ELSE 0
END
WHERE TieneAdecuacion IS NULL;
GO

DECLARE @constraintName NVARCHAR(128);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
WHERE dc.parent_object_id = OBJECT_ID('dbo.Estudiante')
  AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Estudiante'), 'TieneAdecuacion', 'ColumnId');

IF @constraintName IS NOT NULL
BEGIN
    DECLARE @dropSql NVARCHAR(MAX) = N'ALTER TABLE dbo.Estudiante DROP CONSTRAINT ' + QUOTENAME(@constraintName) + N';';
    EXEC sys.sp_executesql @dropSql;
END
GO

IF COL_LENGTH('dbo.Estudiante', 'TieneAdecuacion') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Estudiante
    ALTER COLUMN TieneAdecuacion BIT NOT NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.default_constraints dc
        WHERE dc.parent_object_id = OBJECT_ID('dbo.Estudiante')
          AND dc.parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Estudiante'), 'TieneAdecuacion', 'ColumnId')
    )
    BEGIN
        ALTER TABLE dbo.Estudiante
        ADD CONSTRAINT DF_Estudiante_TieneAdecuacion DEFAULT (0) FOR TieneAdecuacion;
    END
END
GO
