export const comunicadosSchema = `
IF OBJECT_ID('dbo.ComunicadoProfe', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ComunicadoProfe (
    ComunicadoId BIGINT IDENTITY PRIMARY KEY,
    SolicitudId UNIQUEIDENTIFIER NOT NULL UNIQUE,
    InstitucionId INT NOT NULL, GrupoId INT NOT NULL, MateriaId INT NOT NULL,
    AnioLectivoId INT NOT NULL, PeriodoId INT NOT NULL, GrupoClaseId INT NULL,
    EstudianteId INT NOT NULL, UsuarioId INT NOT NULL, HorarioGrupoId INT NULL,
    Fecha DATE NOT NULL, Hora VARCHAR(8) NOT NULL,
    Mensaje NVARCHAR(800) NOT NULL, ContextoJson NVARCHAR(MAX) NOT NULL,
    AsuntoCorreo NVARCHAR(600) NOT NULL, CuerpoCorreo NVARCHAR(MAX) NOT NULL,
    Estado NVARCHAR(30) NOT NULL DEFAULT N'EN_PROCESO',
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), FinalizadoAt DATETIME2 NULL
  );
  CREATE INDEX IX_Comunicado_Grupo ON dbo.ComunicadoProfe(InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, EstudianteId);
  IF OBJECT_ID('dbo.WhatsAppPlantilla', 'U') IS NOT NULL
    INSERT INTO dbo.WhatsAppPlantilla (WhatsAppCanalId, TipoMensaje, Nombre, TemplateUuid, CodigoIdioma, CantidadParametrosBody, Estado, Activo)
    SELECT p.WhatsAppCanalId, N'COMUNICADO', p.Nombre, p.TemplateUuid, p.CodigoIdioma, p.CantidadParametrosBody, p.Estado, 1
    FROM dbo.WhatsAppPlantilla p
    WHERE p.Nombre = N'notificacion_academica_general' AND p.Activo = 1 AND p.Estado = N'APPROVED'
      AND p.WhatsAppPlantillaId = (SELECT MAX(p2.WhatsAppPlantillaId) FROM dbo.WhatsAppPlantilla p2
        WHERE p2.WhatsAppCanalId = p.WhatsAppCanalId AND p2.Nombre = N'notificacion_academica_general' AND p2.Activo = 1 AND p2.Estado = N'APPROVED')
      AND NOT EXISTS (SELECT 1 FROM dbo.WhatsAppPlantilla x WHERE x.WhatsAppCanalId = p.WhatsAppCanalId AND x.TipoMensaje = N'COMUNICADO');
END;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ComunicadoProfe') AND name = 'HorarioGrupoId' AND is_nullable = 0)
  ALTER TABLE dbo.ComunicadoProfe ALTER COLUMN HorarioGrupoId INT NULL;
IF OBJECT_ID('dbo.ComunicadoProfeDestino', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ComunicadoProfeDestino (
    ComunicadoDestinoId BIGINT IDENTITY PRIMARY KEY,
    ComunicadoId BIGINT NOT NULL REFERENCES dbo.ComunicadoProfe(ComunicadoId),
    EncargadoId INT NULL, EncargadoNombre NVARCHAR(300) NULL,
    Canal NVARCHAR(15) NOT NULL, Destino NVARCHAR(320) NULL, CopiaProfesor NVARCHAR(320) NULL,
    Estado NVARCHAR(30) NOT NULL, Motivo NVARCHAR(2000) NULL,
    Proveedor NVARCHAR(40) NULL, ProveedorId NVARCHAR(150) NULL, WhatsAppEnvioId BIGINT NULL,
    ResultadoJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), ProcesadoAt DATETIME2 NULL
  );
  CREATE INDEX IX_ComunicadoDestino_Comunicado ON dbo.ComunicadoProfeDestino(ComunicadoId);
END;
`;

const initialized = new WeakMap<object, Promise<unknown>>();
export async function ensureComunicados(pool: any) {
  if (!initialized.has(pool)) {
    initialized.set(pool, pool.request().query(comunicadosSchema).catch((error: unknown) => { initialized.delete(pool); throw error; }));
  }
  await initialized.get(pool);
}
