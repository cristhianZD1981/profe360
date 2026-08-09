/*
  Normaliza TipoColegio en dbo.PlaneamientoHabilidad.

  Académico: ACADEMICO, ACADÉMICO, ACADÉMICO CUARTO CICLO, CTPA SABALITO y variantes.
  Técnico:    TECNICO, TÉCNICO y variantes.
  Plan Nacional: cualquier valor restante.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @Cambios TABLE (
  TipoAnterior NVARCHAR(100),
  TipoNuevo NVARCHAR(100)
);

UPDATE h
SET
  TipoColegio = CASE
    WHEN UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%ACADEM%'
      OR UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%CTPA%'
      THEN N'Académico'
    WHEN UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%TECNIC%'
      THEN N'Técnico'
    ELSE N'Plan Nacional'
  END,
  UpdatedAt = SYSDATETIME()
OUTPUT DELETED.TipoColegio, INSERTED.TipoColegio
INTO @Cambios (TipoAnterior, TipoNuevo)
FROM dbo.PlaneamientoHabilidad h
WHERE ISNULL(h.TipoColegio, N'') <> CASE
  WHEN UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%ACADEM%'
    OR UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%CTPA%'
    THEN N'Académico'
  WHEN UPPER(ISNULL(h.TipoColegio, N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%TECNIC%'
    THEN N'Técnico'
  ELSE N'Plan Nacional'
END;

SELECT TipoAnterior, TipoNuevo, COUNT(*) AS Cantidad
FROM @Cambios
GROUP BY TipoAnterior, TipoNuevo
ORDER BY TipoNuevo, TipoAnterior;

COMMIT TRANSACTION;
