IF OBJECT_ID(N'dbo.CatalogoMatricula', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CatalogoMatricula (
    CatalogoMatriculaId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CatalogoMatricula PRIMARY KEY,
    Tipo NVARCHAR(40) NOT NULL,
    Descripcion NVARCHAR(120) NOT NULL,
    Activo BIT NOT NULL CONSTRAINT DF_CatalogoMatricula_Activo DEFAULT (1),
    FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_CatalogoMatricula_Fecha DEFAULT (SYSDATETIME()),
    FechaActualizacion DATETIME2(0) NULL
  );
  CREATE UNIQUE INDEX UX_CatalogoMatricula_Tipo_Descripcion ON dbo.CatalogoMatricula(Tipo, Descripcion);
END;

DECLARE @Iniciales TABLE (Tipo NVARCHAR(40), Descripcion NVARCHAR(120));
INSERT INTO @Iniciales VALUES
 (N'TIPO_IDENTIFICACION',N'Cédula'),(N'TIPO_IDENTIFICACION',N'Dimex'),(N'TIPO_IDENTIFICACION',N'YR'),
 (N'NACIONALIDAD',N'Costarricense'),(N'NACIONALIDAD',N'Panameño'),(N'NACIONALIDAD',N'Nicaragüense'),(N'NACIONALIDAD',N'Colombiano'),(N'NACIONALIDAD',N'Venezolano'),(N'NACIONALIDAD',N'Cubano'),
 (N'TIPO_ENCARGADO',N'MADRE'),(N'TIPO_ENCARGADO',N'PADRE'),(N'TIPO_ENCARGADO',N'ENCARGADO');
INSERT INTO dbo.CatalogoMatricula(Tipo, Descripcion)
SELECT i.Tipo, i.Descripcion FROM @Iniciales i
WHERE NOT EXISTS (SELECT 1 FROM dbo.CatalogoMatricula c WHERE c.Tipo=i.Tipo AND c.Descripcion=i.Descripcion);
