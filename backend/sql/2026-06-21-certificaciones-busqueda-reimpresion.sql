IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'EstudianteNombre') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD EstudianteNombre NVARCHAR(220) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'Identificacion') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD Identificacion NVARCHAR(60) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'GrupoNombre') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD GrupoNombre NVARCHAR(120) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'CursoLectivo') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD CursoLectivo NVARCHAR(20) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'OtroColegioDestino') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD OtroColegioDestino NVARCHAR(250) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'LugarEmision') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD LugarEmision NVARCHAR(250) NULL;
END
GO

IF COL_LENGTH('dbo.CertificacionEstudioRegistro', 'HtmlSnapshot') IS NULL
BEGIN
    ALTER TABLE dbo.CertificacionEstudioRegistro
    ADD HtmlSnapshot NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CertificacionEstudioRegistro')
      AND name = 'IX_CertificacionEstudioRegistro_Busqueda'
)
BEGIN
    CREATE INDEX IX_CertificacionEstudioRegistro_Busqueda
    ON dbo.CertificacionEstudioRegistro (InstitucionId, MotivoTramite, GrupoId, EstudianteId, CreatedAt DESC)
    INCLUDE (CodigoConstancia, EstudianteNombre, Identificacion, GrupoNombre, CursoLectivo, OtroColegioDestino, FechaEmision);
END
GO
