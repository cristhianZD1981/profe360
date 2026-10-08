/*
  Extiende dbo.RutaTransporte con número, descripción ampliada y teléfono.
  La columna Descripcion existente se conserva como nombre de la ruta para
  mantener compatibilidad con expedientes y procesos que ya la consultan.
*/
IF COL_LENGTH('dbo.RutaTransporte', 'NumeroRuta') IS NULL
  ALTER TABLE dbo.RutaTransporte ADD NumeroRuta NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.RutaTransporte', 'Detalle') IS NULL
  ALTER TABLE dbo.RutaTransporte ADD Detalle NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.RutaTransporte', 'Telefono') IS NULL
  ALTER TABLE dbo.RutaTransporte ADD Telefono NVARCHAR(40) NULL;
GO
