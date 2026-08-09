/*
  Ajuste puntual para el catálogo de habilidades de secundaria:
    4 -> 10
    5 -> 11
    6 -> 12
  Conserva la modalidad PN cuando exista.
  No modifica registros que ya sean 10, 11 o 12.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @Cambios TABLE (
  PlaneamientoHabilidadId INT,
  GradoAnterior NVARCHAR(100),
  GradoNuevo NVARCHAR(100),
  GradoNumeroNuevo SMALLINT,
  ModalidadGrado NVARCHAR(20)
);

UPDATE h
SET
  GradoNumero = CASE h.GradoNumero WHEN 4 THEN 10 WHEN 5 THEN 11 WHEN 6 THEN 12 END,
  Grado = CONCAT(
    CONVERT(NVARCHAR(10), CASE h.GradoNumero WHEN 4 THEN 10 WHEN 5 THEN 11 WHEN 6 THEN 12 END),
    CASE WHEN ISNULL(h.ModalidadGrado, N'') = N'PN' OR UPPER(ISNULL(h.Grado, N'')) LIKE N'%PN%' THEN N' PN' ELSE N'' END
  ),
  ModalidadGrado = CASE WHEN ISNULL(h.ModalidadGrado, N'') = N'PN' OR UPPER(ISNULL(h.Grado, N'')) LIKE N'%PN%' THEN N'PN' ELSE NULL END,
  UpdatedAt = SYSDATETIME()
OUTPUT INSERTED.PlaneamientoHabilidadId, DELETED.Grado, INSERTED.Grado, INSERTED.GradoNumero, INSERTED.ModalidadGrado
INTO @Cambios (PlaneamientoHabilidadId, GradoAnterior, GradoNuevo, GradoNumeroNuevo, ModalidadGrado)
FROM dbo.PlaneamientoHabilidad h
WHERE h.GradoNumero IN (4, 5, 6);

SELECT GradoAnterior, GradoNuevo, GradoNumeroNuevo, ModalidadGrado, COUNT(*) AS Cantidad
FROM @Cambios
GROUP BY GradoAnterior, GradoNuevo, GradoNumeroNuevo, ModalidadGrado
ORDER BY GradoNumeroNuevo, ModalidadGrado, GradoAnterior;

COMMIT TRANSACTION;
