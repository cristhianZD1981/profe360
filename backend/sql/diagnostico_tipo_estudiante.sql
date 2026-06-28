SET NOCOUNT ON;

DECLARE @Tipos TABLE (Descripcion NVARCHAR(150) NOT NULL);
INSERT INTO @Tipos (Descripcion)
VALUES (N'Regular'), (N'Plan Nacional'), (N'Traslados');

SELECT t.Descripcion AS TipoEnExcel
FROM @Tipos t
LEFT JOIN dbo.TipoEstudiante te
  ON UPPER(LTRIM(RTRIM(te.Descripcion))) = UPPER(LTRIM(RTRIM(t.Descripcion)))
WHERE te.TipoEstudianteId IS NULL;

SELECT te.TipoEstudianteId, te.Descripcion
FROM dbo.TipoEstudiante te
ORDER BY te.Descripcion;
