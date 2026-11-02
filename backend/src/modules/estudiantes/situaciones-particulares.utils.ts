export async function ensureSituacionesParticularesTable(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.SituacionParticular', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SituacionParticular (
        SituacionParticularId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        EstudianteId INT NOT NULL,
        GrupoId INT NULL,
        Situacion NVARCHAR(MAX) NOT NULL,
        UsuarioId INT NOT NULL,
        NombreUsuario NVARCHAR(300) NOT NULL,
        CorreoUsuario NVARCHAR(320) NULL,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_SituacionParticular_Fecha DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_SituacionParticular_Consulta ON dbo.SituacionParticular(InstitucionId, Fecha DESC, EstudianteId);
    END;
  `);
}
