DECLARE @InstitucionId INT = 1;
DECLARE @TipoSignificativaId INT;
DECLARE @TipoTodasId INT;

SELECT TOP 1
  @TipoSignificativaId = TipoAdecuacionId
FROM dbo.TipoAdecuacion
WHERE InstitucionId = @InstitucionId
  AND UPPER(LTRIM(RTRIM(Descripcion))) = N'SIGNIFICATIVA';

IF @TipoSignificativaId IS NULL
BEGIN
  RAISERROR('No se encontro el tipo de adecuacion Significativa para la institucion indicada.', 16, 1);
  RETURN;
END;

SELECT TOP 1
  @TipoTodasId = TipoAdecuacionId
FROM dbo.TipoAdecuacion
WHERE InstitucionId = @InstitucionId
  AND UPPER(LTRIM(RTRIM(Descripcion))) = N'TODAS';

IF @TipoTodasId IS NULL
BEGIN
  INSERT INTO dbo.TipoAdecuacion
  (
    InstitucionId,
    Descripcion,
    Activo,
    CreatedAt,
    UpdatedAt
  )
  VALUES
  (
    @InstitucionId,
    N'Todas',
    1,
    SYSDATETIME(),
    SYSDATETIME()
  );

  SET @TipoTodasId = SCOPE_IDENTITY();
END;
ELSE
BEGIN
  UPDATE dbo.TipoAdecuacion
  SET
    Activo = 1,
    UpdatedAt = SYSDATETIME()
  WHERE TipoAdecuacionId = @TipoTodasId;
END;

UPDATE dbo.AdecuacionCatalogo
SET
  TipoAdecuacionId = @TipoTodasId,
  UpdatedAt = SYSDATETIME()
WHERE InstitucionId = @InstitucionId
  AND TipoAdecuacionId = @TipoSignificativaId;

SELECT
  ta.TipoAdecuacionId,
  ta.Descripcion,
  ta.Activo,
  TotalCatalogo = COUNT(ac.AdecuacionCatalogoId)
FROM dbo.TipoAdecuacion ta
LEFT JOIN dbo.AdecuacionCatalogo ac
  ON ac.TipoAdecuacionId = ta.TipoAdecuacionId
 AND ac.InstitucionId = ta.InstitucionId
WHERE ta.InstitucionId = @InstitucionId
  AND UPPER(LTRIM(RTRIM(ta.Descripcion))) IN (N'SIGNIFICATIVA', N'NO SIGNIFICATIVA', N'ACCESO', N'TODAS')
GROUP BY ta.TipoAdecuacionId, ta.Descripcion, ta.Activo
ORDER BY ta.Descripcion;
