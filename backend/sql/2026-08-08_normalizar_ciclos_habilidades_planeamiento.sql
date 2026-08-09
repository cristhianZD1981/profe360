/*
  Normaliza el ciclo de las habilidades según GradoNumero:
    1 a 3   = Primer Ciclo
    4 a 6   = Segundo Ciclo
    7 a 9   = Tercer Ciclo
    10 a 12 = Cuarto Ciclo

  Los registros fuera de 1 a 12 no se modifican y se muestran al final
  para revisión manual.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @Cambios TABLE (
  CicloAnterior NVARCHAR(100),
  CicloNuevo NVARCHAR(100),
  Cantidad INT
);

UPDATE dbo.PlaneamientoHabilidad
SET
  Ciclo = CASE
    WHEN GradoNumero BETWEEN 1 AND 3 THEN N'Primer Ciclo'
    WHEN GradoNumero BETWEEN 4 AND 6 THEN N'Segundo Ciclo'
    WHEN GradoNumero BETWEEN 7 AND 9 THEN N'Tercer Ciclo'
    WHEN GradoNumero BETWEEN 10 AND 12 THEN N'Cuarto Ciclo'
  END,
  UpdatedAt = SYSDATETIME()
OUTPUT DELETED.Ciclo, INSERTED.Ciclo, 1
INTO @Cambios (CicloAnterior, CicloNuevo, Cantidad)
WHERE GradoNumero BETWEEN 1 AND 12
  AND ISNULL(Ciclo, N'') <> CASE
    WHEN GradoNumero BETWEEN 1 AND 3 THEN N'Primer Ciclo'
    WHEN GradoNumero BETWEEN 4 AND 6 THEN N'Segundo Ciclo'
    WHEN GradoNumero BETWEEN 7 AND 9 THEN N'Tercer Ciclo'
    WHEN GradoNumero BETWEEN 10 AND 12 THEN N'Cuarto Ciclo'
  END;

SELECT CicloAnterior, CicloNuevo, COUNT(*) AS Cantidad
FROM @Cambios
GROUP BY CicloAnterior, CicloNuevo
ORDER BY CicloNuevo, CicloAnterior;

SELECT Grado, GradoNumero, ModalidadGrado, COUNT(*) AS Cantidad
FROM dbo.PlaneamientoHabilidad
WHERE GradoNumero IS NULL OR GradoNumero NOT BETWEEN 1 AND 12
GROUP BY Grado, GradoNumero, ModalidadGrado
ORDER BY GradoNumero, Grado;

COMMIT TRANSACTION;
