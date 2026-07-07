import { sql } from "../../config/database";

export const CIERRE_CURSO_ESTADO_CERRADO = "CERRADO_DOCENTE";
export const CIERRE_CURSO_ESTADO_REABIERTO = "REABIERTO_DIRECCION";

type CierreCursoKey = {
  institucionId: number;
  grupoId: number;
  materiaId: number;
  anioLectivoId: number;
  periodoId: number;
};

let cierreCursoTablesReady: Promise<void> | null = null;

export async function ensureCierreAcademicoCursoTables(pool: any) {
  if (!cierreCursoTablesReady) {
    cierreCursoTablesReady = pool.request().query(`
      IF OBJECT_ID(N'dbo.CierreAcademicoCurso', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CierreAcademicoCurso (
          CierreAcademicoCursoId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CierreAcademicoCurso PRIMARY KEY,
          InstitucionId INT NOT NULL,
          GrupoId INT NOT NULL,
          MateriaId INT NOT NULL,
          AnioLectivoId INT NOT NULL,
          PeriodoId INT NOT NULL,
          UsuarioDocenteId INT NULL,
          Estado NVARCHAR(40) NOT NULL CONSTRAINT DF_CierreAcademicoCurso_Estado DEFAULT N'${CIERRE_CURSO_ESTADO_CERRADO}',
          PromedioGeneral DECIMAL(10,2) NULL,
          TotalEstudiantes INT NOT NULL CONSTRAINT DF_CierreAcademicoCurso_TotalEstudiantes DEFAULT 0,
          TotalCompletos INT NOT NULL CONSTRAINT DF_CierreAcademicoCurso_TotalCompletos DEFAULT 0,
          TotalIncompletos INT NOT NULL CONSTRAINT DF_CierreAcademicoCurso_TotalIncompletos DEFAULT 0,
          SnapshotJson NVARCHAR(MAX) NULL,
          AdvertenciasJson NVARCHAR(MAX) NULL,
          CerradoPorUsuarioId INT NULL,
          CerradoAt DATETIME2 NULL,
          ReabiertoPorUsuarioId INT NULL,
          ReabiertoAt DATETIME2 NULL,
          MotivoReapertura NVARCHAR(1000) NULL,
          Activo BIT NOT NULL CONSTRAINT DF_CierreAcademicoCurso_Activo DEFAULT 1,
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CierreAcademicoCurso_CreatedAt DEFAULT SYSDATETIME(),
          UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CierreAcademicoCurso_UpdatedAt DEFAULT SYSDATETIME()
        );
      END;

      IF OBJECT_ID(N'dbo.CierreAcademicoCursoAuditoria', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.CierreAcademicoCursoAuditoria (
          CierreAcademicoCursoAuditoriaId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CierreAcademicoCursoAuditoria PRIMARY KEY,
          CierreAcademicoCursoId INT NOT NULL,
          Accion NVARCHAR(40) NOT NULL,
          UsuarioId INT NULL,
          Motivo NVARCHAR(1000) NULL,
          EstadoAnterior NVARCHAR(40) NULL,
          EstadoNuevo NVARCHAR(40) NULL,
          SnapshotJson NVARCHAR(MAX) NULL,
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CierreAcademicoCursoAuditoria_CreatedAt DEFAULT SYSDATETIME()
        );
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.CierreAcademicoCurso')
          AND name = N'UX_CierreAcademicoCurso_Activo'
      )
      BEGIN
        CREATE UNIQUE INDEX UX_CierreAcademicoCurso_Activo
          ON dbo.CierreAcademicoCurso (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId)
          WHERE Activo = 1;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.CierreAcademicoCurso')
          AND name = N'IX_CierreAcademicoCurso_Estado'
      )
      BEGIN
        CREATE INDEX IX_CierreAcademicoCurso_Estado
          ON dbo.CierreAcademicoCurso (InstitucionId, AnioLectivoId, PeriodoId, Estado)
          INCLUDE (GrupoId, MateriaId, CerradoAt, ReabiertoAt);
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.CierreAcademicoCursoAuditoria')
          AND name = N'IX_CierreAcademicoCursoAuditoria_Cierre'
      )
      BEGIN
        CREATE INDEX IX_CierreAcademicoCursoAuditoria_Cierre
          ON dbo.CierreAcademicoCursoAuditoria (CierreAcademicoCursoId, CreatedAt DESC);
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.CierreAcademicoCurso')
          AND name = N'CK_CierreAcademicoCurso_Estado'
      )
      BEGIN
        ALTER TABLE dbo.CierreAcademicoCurso
          ADD CONSTRAINT CK_CierreAcademicoCurso_Estado
          CHECK (Estado IN (N'${CIERRE_CURSO_ESTADO_CERRADO}', N'${CIERRE_CURSO_ESTADO_REABIERTO}'));
      END;
    `).then(() => undefined);
  }

  return cierreCursoTablesReady;
}

export async function getCierreAcademicoCurso(pool: any, input: CierreCursoKey) {
  await ensureCierreAcademicoCursoTables(pool);

  const result = await pool.request()
    .input("institucionId", sql.Int, input.institucionId)
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .query(`
      SELECT TOP 1 *
      FROM dbo.CierreAcademicoCurso
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoId
        AND MateriaId = @materiaId
        AND AnioLectivoId = @anioLectivoId
        AND PeriodoId = @periodoId
        AND Activo = 1
      ORDER BY CierreAcademicoCursoId DESC
    `);

  return result.recordset[0] || null;
}

export function isCierreCursoCerrado(cierre: any) {
  return String(cierre?.Estado || "").toUpperCase() === CIERRE_CURSO_ESTADO_CERRADO;
}

export async function assertCierreCursoAbierto(pool: any, input: CierreCursoKey) {
  const cierre = await getCierreAcademicoCurso(pool, input);
  return {
    abierto: !isCierreCursoCerrado(cierre),
    cierre
  };
}
