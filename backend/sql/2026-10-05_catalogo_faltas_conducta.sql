/*
  Catálogo institucional de faltas para boletas de conducta.
  Script idempotente: crea el catálogo, conserva boletas existentes y carga
  las faltas iniciales en cada institución registrada.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.CatalogoFaltaConducta', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CatalogoFaltaConducta
  (
    FaltaConductaId INT IDENTITY(1,1) NOT NULL
      CONSTRAINT PK_CatalogoFaltaConducta PRIMARY KEY,
    InstitucionId INT NOT NULL,
    TipoFalta NVARCHAR(120) NOT NULL,
    Falta NVARCHAR(1200) NOT NULL,
    Articulo NVARCHAR(250) NOT NULL,
    OrdenVisual INT NOT NULL CONSTRAINT DF_CatalogoFaltaConducta_OrdenVisual DEFAULT(0),
    Activo BIT NOT NULL CONSTRAINT DF_CatalogoFaltaConducta_Activo DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CatalogoFaltaConducta_CreatedAt DEFAULT(SYSDATETIME()),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT FK_CatalogoFaltaConducta_Institucion
      FOREIGN KEY (InstitucionId) REFERENCES dbo.Institucion(InstitucionId)
  );

  CREATE INDEX IX_CatalogoFaltaConducta_InstitucionActivoOrden
    ON dbo.CatalogoFaltaConducta (InstitucionId, Activo, OrdenVisual, FaltaConductaId);
END;

IF COL_LENGTH(N'dbo.BoletaConducta', N'FaltaConductaId') IS NULL
  ALTER TABLE dbo.BoletaConducta ADD FaltaConductaId INT NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_BoletaConducta_CatalogoFaltaConducta'
)
BEGIN
  EXEC sys.sp_executesql N'
    ALTER TABLE dbo.BoletaConducta WITH CHECK
      ADD CONSTRAINT FK_BoletaConducta_CatalogoFaltaConducta
      FOREIGN KEY (FaltaConductaId) REFERENCES dbo.CatalogoFaltaConducta(FaltaConductaId);
  ';
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.BoletaConducta')
    AND name = N'IX_BoletaConducta_FaltaConductaId'
)
  EXEC sys.sp_executesql N'
    CREATE INDEX IX_BoletaConducta_FaltaConductaId
      ON dbo.BoletaConducta (InstitucionId, FaltaConductaId)
      WHERE FaltaConductaId IS NOT NULL;
  ';

DECLARE @Faltas TABLE
(
  OrdenVisual INT NOT NULL,
  TipoFalta NVARCHAR(120) NOT NULL,
  Falta NVARCHAR(1200) NOT NULL,
  Articulo NVARCHAR(250) NOT NULL
);

INSERT INTO @Faltas (OrdenVisual, TipoFalta, Falta, Articulo)
VALUES
  (1, N'Faltas Muy Leves', N'Uso incorrecto del uniforme.', N'153, Inciso a'),
  (2, N'Faltas Muy Leves', N'Uso de accesorios personales no autorizados según las disposiciones establecidas por el centro educativo y comunicadas previamente al estudiantado.', N'153, Inciso b'),
  (3, N'Faltas Muy Leves', N'Incumplimiento de las normas de presentación personal establecidas por el centro educativo, conforme a las disposiciones emitidas por el Ministerio de Educación Pública.', N'153, Inciso c'),
  (4, N'Faltas leves', N'El uso del cuaderno de comunicaciones para acciones diferentes al objetivo para el cual fue establecido.', N'154, Inciso a'),
  (5, N'Faltas leves', N'No informar a las madres, los padres o las personas encargadas legales sobre la existencia de comunicaciones remitidas al hogar.', N'154, Inciso a'),
  (6, N'Faltas leves', N'Interrupciones al proceso de aprendizaje en espacios educativos.', N'154, Inciso b'),
  (7, N'Faltas leves', N'Fuga de las lecciones y de actividades curriculares o cocurriculares programadas por el centro educativo.', N'154, Inciso c'),
  (8, N'Faltas leves', N'Ausencias injustificadas a actividades debidamente convocadas y no reguladas en los artículos 36° y 37° de este reglamento.', N'154, Inciso d');

INSERT INTO dbo.CatalogoFaltaConducta
  (InstitucionId, TipoFalta, Falta, Articulo, OrdenVisual, Activo, CreatedAt)
SELECT i.InstitucionId, f.TipoFalta, f.Falta, f.Articulo, f.OrdenVisual, 1, SYSDATETIME()
FROM dbo.Institucion i
CROSS JOIN @Faltas f
WHERE NOT EXISTS
(
  SELECT 1
  FROM dbo.CatalogoFaltaConducta existing
  WHERE existing.InstitucionId = i.InstitucionId
    AND existing.Falta = f.Falta
);

COMMIT TRANSACTION;
