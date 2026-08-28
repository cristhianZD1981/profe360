import { sql } from "../../config/database";

export async function ensureSustitucionProfesorTables(pool: any) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.SustitucionProfesor', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SustitucionProfesor (
        SustitucionProfesorId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        ProfesorTitularUsuarioId INT NOT NULL,
        ProfesorSustitutoUsuarioId INT NOT NULL,
        Causa NVARCHAR(40) NOT NULL,
        Justificacion NVARCHAR(2000) NOT NULL,
        FechaInicio DATE NOT NULL,
        FechaFin DATE NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_SustitucionProfesor_Estado DEFAULT(N'PROGRAMADA'),
        CreatedByUsuarioId INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_SustitucionProfesor_CreatedAt DEFAULT(SYSDATETIME()),
        UpdatedAt DATETIME2 NULL,
        FinalizadaAt DATETIME2 NULL
      );
      CREATE INDEX IX_SustitucionProfesor_InstitucionEstado
        ON dbo.SustitucionProfesor (InstitucionId, Estado, FechaInicio, FechaFin);
    END;
    IF OBJECT_ID('dbo.SustitucionProfesorAsignacion', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SustitucionProfesorAsignacion (
        SustitucionProfesorAsignacionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SustitucionProfesorId INT NOT NULL,
        AsignacionOriginalId INT NOT NULL,
        AsignacionSustitutaId INT NOT NULL,
        SustitutaActivaAntes BIT NOT NULL CONSTRAINT DF_SustitucionProfesorAsignacion_ActivaAntes DEFAULT(0),
        CONSTRAINT FK_SustitucionProfesorAsignacion_Sustitucion FOREIGN KEY (SustitucionProfesorId) REFERENCES dbo.SustitucionProfesor(SustitucionProfesorId)
      );
      CREATE INDEX IX_SustitucionProfesorAsignacion_Sustitucion
        ON dbo.SustitucionProfesorAsignacion (SustitucionProfesorId);
    END;
  `);
}

export async function procesarSustitucionesProfesor(pool: any) {
  await ensureSustitucionProfesorTables(pool);
  const programadas = await pool.request().query(`
    SELECT SustitucionProfesorId
    FROM dbo.SustitucionProfesor
    WHERE Estado = N'PROGRAMADA'
      AND FechaInicio <= CAST(SYSDATETIME() AS date)
  `);
  for (const row of programadas.recordset || []) {
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      const request = new sql.Request(transaction).input("id", sql.Int, Number(row.SustitucionProfesorId));
      await request.query(`
        UPDATE original
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        FROM dbo.AsignacionDocente original
        INNER JOIN dbo.SustitucionProfesorAsignacion spa ON spa.AsignacionOriginalId = original.AsignacionDocenteId
        WHERE spa.SustitucionProfesorId = @id;
        UPDATE sustituta
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        FROM dbo.AsignacionDocente sustituta
        INNER JOIN dbo.SustitucionProfesorAsignacion spa ON spa.AsignacionSustitutaId = sustituta.AsignacionDocenteId
        WHERE spa.SustitucionProfesorId = @id;
        UPDATE dbo.SustitucionProfesor
        SET Estado = N'ACTIVA', UpdatedAt = SYSDATETIME()
        WHERE SustitucionProfesorId = @id;
      `);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      console.error("Error activando sustitución programada:", error);
    }
  }
  const vencidas = await pool.request().query(`
    SELECT SustitucionProfesorId
    FROM dbo.SustitucionProfesor
    WHERE Estado = N'ACTIVA'
      AND FechaFin IS NOT NULL
      AND FechaFin < CAST(SYSDATETIME() AS date)
  `);
  for (const row of vencidas.recordset || []) {
    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      const request = new sql.Request(transaction).input("id", sql.Int, Number(row.SustitucionProfesorId));
      await request.query(`
        UPDATE original
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        FROM dbo.AsignacionDocente original
        INNER JOIN dbo.SustitucionProfesorAsignacion spa ON spa.AsignacionOriginalId = original.AsignacionDocenteId
        WHERE spa.SustitucionProfesorId = @id;
        UPDATE sustituta
        SET Activo = spa.SustitutaActivaAntes, UpdatedAt = SYSDATETIME()
        FROM dbo.AsignacionDocente sustituta
        INNER JOIN dbo.SustitucionProfesorAsignacion spa ON spa.AsignacionSustitutaId = sustituta.AsignacionDocenteId
        WHERE spa.SustitucionProfesorId = @id;
        UPDATE dbo.SustitucionProfesor
        SET Estado = N'FINALIZADA', FinalizadaAt = SYSDATETIME(), UpdatedAt = SYSDATETIME()
        WHERE SustitucionProfesorId = @id;
      `);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      console.error("Error restaurando sustitución vencida:", error);
    }
  }
}
