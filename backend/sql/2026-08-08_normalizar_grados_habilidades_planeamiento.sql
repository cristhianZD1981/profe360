/*
  Normaliza los grados del catálogo dbo.PlaneamientoHabilidad.

  Ejemplos:
    Sétimo, Séptimo, 7°, 7°°  -> Grado = 7,    GradoNumero = 7
    7 PN, 7 P N               -> Grado = 7 PN, GradoNumero = 7, ModalidadGrado = PN

  El script NO borra habilidades. Solo estandariza el campo Grado y agrega
  campos técnicos para que los filtros futuros no dependan del texto.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF COL_LENGTH('dbo.PlaneamientoHabilidad', 'GradoNumero') IS NULL
BEGIN
  ALTER TABLE dbo.PlaneamientoHabilidad
  ADD GradoNumero SMALLINT NULL;
END;
GO

IF COL_LENGTH('dbo.PlaneamientoHabilidad', 'ModalidadGrado') IS NULL
BEGIN
  ALTER TABLE dbo.PlaneamientoHabilidad
  ADD ModalidadGrado NVARCHAR(20) NULL;
END;
GO

DECLARE @Cambios TABLE (
  PlaneamientoHabilidadId INT NOT NULL,
  GradoAnterior NVARCHAR(100) NULL,
  GradoNuevo NVARCHAR(100) NULL,
  GradoNumero SMALLINT NULL,
  ModalidadGrado NVARCHAR(20) NULL
);

;WITH GradosPreparados AS (
  SELECT
    h.PlaneamientoHabilidadId,
    h.Grado AS GradoAnterior,
    -- Se eliminan espacios y símbolos solo para reconocer el valor.
    UPPER(
      REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(h.Grado, N''))), N' ', N''), N'°', N''), N'.', N'')
    ) COLLATE Latin1_General_100_CI_AI AS ClaveGrado
  FROM dbo.PlaneamientoHabilidad h
),
GradosInterpretados AS (
  SELECT
    PlaneamientoHabilidadId,
    GradoAnterior,
    CASE
      -- Los números de dos dígitos se evalúan antes de 1 para evitar confusiones.
      WHEN ClaveGrado LIKE N'18%' THEN 18
      WHEN ClaveGrado LIKE N'17%' THEN 17
      WHEN ClaveGrado LIKE N'16%' THEN 16
      WHEN ClaveGrado LIKE N'15%' THEN 15
      WHEN ClaveGrado LIKE N'14%' THEN 14
      WHEN ClaveGrado LIKE N'13%' THEN 13
      WHEN ClaveGrado LIKE N'DUODEC%' OR ClaveGrado LIKE N'DUIDEC%' OR ClaveGrado LIKE N'12%' THEN 12
      WHEN ClaveGrado LIKE N'UNDEC%' OR ClaveGrado LIKE N'11%' THEN 11
      WHEN ClaveGrado LIKE N'DECIM%' OR ClaveGrado LIKE N'10%' THEN 10
      WHEN ClaveGrado LIKE N'PRIMER%' OR ClaveGrado LIKE N'1%' THEN 1
      WHEN ClaveGrado LIKE N'SEGUND%' OR ClaveGrado LIKE N'2%' THEN 2
      WHEN ClaveGrado LIKE N'TERCER%' OR ClaveGrado LIKE N'3%' THEN 3
      -- En este catálogo de secundaria, 4, 5 y 6 son códigos para 10°, 11° y 12°.
      WHEN ClaveGrado LIKE N'CUART%' OR ClaveGrado LIKE N'4%' THEN 10
      WHEN ClaveGrado LIKE N'QUINT%' OR ClaveGrado LIKE N'5%' THEN 11
      WHEN ClaveGrado LIKE N'SEXT%' OR ClaveGrado LIKE N'6%' THEN 12
      WHEN ClaveGrado LIKE N'SETIM%' OR ClaveGrado LIKE N'SEPTIM%' OR ClaveGrado LIKE N'7%' THEN 7
      WHEN ClaveGrado LIKE N'OCTAV%' OR ClaveGrado LIKE N'8%' THEN 8
      WHEN ClaveGrado LIKE N'NOVEN%' OR ClaveGrado LIKE N'9%' THEN 9
      ELSE NULL
    END AS GradoNumero,
    CASE WHEN ClaveGrado LIKE N'%PN%' THEN N'PN' ELSE NULL END AS ModalidadGrado
  FROM GradosPreparados
)
UPDATE h
SET
  GradoNumero = gi.GradoNumero,
  ModalidadGrado = gi.ModalidadGrado,
  Grado = CONCAT(CONVERT(NVARCHAR(10), gi.GradoNumero), CASE WHEN gi.ModalidadGrado IS NOT NULL THEN N' ' + gi.ModalidadGrado ELSE N'' END),
  UpdatedAt = SYSDATETIME()
OUTPUT
  INSERTED.PlaneamientoHabilidadId,
  DELETED.Grado,
  INSERTED.Grado,
  INSERTED.GradoNumero,
  INSERTED.ModalidadGrado
INTO @Cambios (PlaneamientoHabilidadId, GradoAnterior, GradoNuevo, GradoNumero, ModalidadGrado)
FROM dbo.PlaneamientoHabilidad h
INNER JOIN GradosInterpretados gi ON gi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
WHERE gi.GradoNumero IS NOT NULL
  AND (
    ISNULL(h.GradoNumero, -1) <> gi.GradoNumero
    OR ISNULL(h.ModalidadGrado, N'') <> ISNULL(gi.ModalidadGrado, N'')
    OR ISNULL(h.Grado, N'') <> CONCAT(CONVERT(NVARCHAR(10), gi.GradoNumero), CASE WHEN gi.ModalidadGrado IS NOT NULL THEN N' ' + gi.ModalidadGrado ELSE N'' END)
  );

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_PlaneamientoHabilidad_GradoNumero_Modalidad'
    AND object_id = OBJECT_ID('dbo.PlaneamientoHabilidad')
)
BEGIN
  CREATE INDEX IX_PlaneamientoHabilidad_GradoNumero_Modalidad
    ON dbo.PlaneamientoHabilidad (GradoNumero, ModalidadGrado);
END;

-- Auditoría: los grados que no se pudieron interpretar quedan visibles para revisión manual.
SELECT
  Grado AS GradoSinNormalizar,
  COUNT(*) AS Cantidad
FROM dbo.PlaneamientoHabilidad
WHERE GradoNumero IS NULL
GROUP BY Grado
ORDER BY Cantidad DESC, Grado;

-- Resumen de cambios efectuados.
SELECT
  GradoAnterior,
  GradoNuevo,
  GradoNumero,
  ModalidadGrado,
  COUNT(*) AS Cantidad
FROM @Cambios
GROUP BY GradoAnterior, GradoNuevo, GradoNumero, ModalidadGrado
ORDER BY GradoNumero, ModalidadGrado, GradoAnterior;

COMMIT TRANSACTION;
