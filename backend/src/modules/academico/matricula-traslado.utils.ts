import { sql } from "../../config/database";

function requestOf(executor: any) {
  if (executor && typeof executor.request === "function") return executor.request();
  return new sql.Request(executor);
}

export async function ensureMatriculaTrasladoHistorialTable(executor: any) {
  await requestOf(executor).query(`
    IF OBJECT_ID('dbo.MatriculaTrasladoHistorial', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.MatriculaTrasladoHistorial (
        MatriculaTrasladoHistorialId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InstitucionId INT NOT NULL,
        MatriculaId INT NOT NULL,
        EstudianteId INT NOT NULL,
        AnioLectivoId INT NOT NULL,
        GrupoIdOrigen INT NOT NULL,
        GrupoIdDestino INT NOT NULL,
        UsuarioTrasladoId INT NULL,
        Observacion NVARCHAR(500) NULL,
        TotalNotasClasicasCopiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Notas DEFAULT(0),
        TotalNotasEval360Copiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Eval360 DEFAULT(0),
        TotalSeguimientosCopiados INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Seguimientos DEFAULT(0),
        TotalAsistenciasCopiadas INT NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_Asistencias DEFAULT(0),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_MatriculaTrasladoHistorial_CreatedAt DEFAULT(SYSDATETIME())
      );
      CREATE INDEX IX_MatriculaTrasladoHistorial_Matricula
        ON dbo.MatriculaTrasladoHistorial (MatriculaId, CreatedAt DESC);
      CREATE INDEX IX_MatriculaTrasladoHistorial_Estudiante
        ON dbo.MatriculaTrasladoHistorial (InstitucionId, EstudianteId, AnioLectivoId, CreatedAt DESC);
    END
  `);
}

export async function copiarAsistenciaPorTraslado(executor: any, params: {
  estudianteId: number;
  grupoIdOrigen: number;
  grupoIdDestino: number;
  anioLectivoId: number;
  usuarioId: number | null;
}) {
  const result = await requestOf(executor)
    .input("estudianteId", sql.Int, params.estudianteId)
    .input("grupoIdOrigen", sql.Int, params.grupoIdOrigen)
    .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .input("usuarioId", sql.Int, params.usuarioId || null)
    .query(`
      ;WITH asistencia_origen AS (
        SELECT
          ar.EstudianteId,
          ar.MateriaId,
          ar.AnioLectivoId,
          ar.PeriodoId,
          ar.Fecha,
          ar.Estado,
          ar.MinutosTardia,
          ar.Observacion,
          CASE
            WHEN COL_LENGTH('dbo.AsistenciaRegistro', 'BloqueHorarioId') IS NULL THEN hg.BloqueHorarioId
            ELSE ISNULL(ar.BloqueHorarioId, hg.BloqueHorarioId)
          END AS BloqueHorarioId
        FROM dbo.AsistenciaRegistro ar
        LEFT JOIN dbo.HorarioGrupo hg
          ON hg.HorarioGrupoId = ar.HorarioGrupoId
        WHERE ar.EstudianteId = @estudianteId
          AND ar.GrupoId = @grupoIdOrigen
          AND ar.AnioLectivoId = @anioLectivoId
      ),
      horarios_destino AS (
        SELECT
          gm.MateriaId,
          gm.PeriodoId,
          hg.BloqueHorarioId,
          MIN(hg.HorarioGrupoId) AS HorarioGrupoIdDestino
        FROM dbo.HorarioGrupo hg
        INNER JOIN dbo.GrupoMateria gm
          ON gm.GrupoMateriaId = hg.GrupoMateriaId
        WHERE gm.GrupoId = @grupoIdDestino
          AND ISNULL(gm.Activo, 1) = 1
        GROUP BY gm.MateriaId, gm.PeriodoId, hg.BloqueHorarioId
      ),
      origen_mapeado AS (
        SELECT
          ao.EstudianteId,
          hd.HorarioGrupoIdDestino,
          ao.BloqueHorarioId,
          @grupoIdDestino AS GrupoIdDestino,
          ao.MateriaId,
          ao.AnioLectivoId,
          ao.PeriodoId,
          ao.Fecha,
          ao.Estado,
          ao.MinutosTardia,
          ao.Observacion
        FROM asistencia_origen ao
        LEFT JOIN horarios_destino hd
          ON hd.MateriaId = ao.MateriaId
         AND ISNULL(hd.PeriodoId, 0) = ISNULL(ao.PeriodoId, 0)
         AND ISNULL(hd.BloqueHorarioId, 0) = ISNULL(ao.BloqueHorarioId, 0)
      ),
      origen_mapeado_dedup AS (
        SELECT *
        FROM (
          SELECT
            om.*,
            ROW_NUMBER() OVER (
              PARTITION BY om.EstudianteId, ISNULL(om.HorarioGrupoIdDestino, 0), om.GrupoIdDestino, om.MateriaId, om.AnioLectivoId, ISNULL(om.PeriodoId, 0), om.Fecha
              ORDER BY ISNULL(om.BloqueHorarioId, 0) DESC
            ) AS rn
          FROM origen_mapeado om
        ) x
        WHERE x.rn = 1
      )
      MERGE dbo.AsistenciaRegistro AS target
      USING origen_mapeado_dedup AS source
      ON target.EstudianteId = source.EstudianteId
         AND ISNULL(target.HorarioGrupoId, 0) = ISNULL(source.HorarioGrupoIdDestino, 0)
         AND target.GrupoId = source.GrupoIdDestino
         AND target.MateriaId = source.MateriaId
         AND target.AnioLectivoId = source.AnioLectivoId
         AND ISNULL(target.PeriodoId, 0) = ISNULL(source.PeriodoId, 0)
         AND target.Fecha = source.Fecha
      WHEN MATCHED THEN
        UPDATE SET
          Estado = source.Estado,
          MinutosTardia = source.MinutosTardia,
          Observacion = source.Observacion,
          UsuarioRegistroId = COALESCE(@usuarioId, target.UsuarioRegistroId),
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (EstudianteId, HorarioGrupoId, BloqueHorarioId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, Fecha, Estado, MinutosTardia, Observacion, UsuarioRegistroId, CreatedAt)
        VALUES (source.EstudianteId, source.HorarioGrupoIdDestino, source.BloqueHorarioId, source.GrupoIdDestino, source.MateriaId, source.AnioLectivoId, source.PeriodoId, source.Fecha, source.Estado, source.MinutosTardia, source.Observacion, @usuarioId, SYSDATETIME());

      SELECT @@ROWCOUNT AS TotalAsistenciasCopiadas;
    `);

  return Number(result.recordset[0]?.TotalAsistenciasCopiadas || 0);
}

export async function asegurarEstructuraEval360ParaTraslado(executor: any, params: {
  institucionId: number;
  grupoIdOrigen: number;
  grupoIdDestino: number;
  anioLectivoId: number;
  usuarioId: number | null;
}) {
  const estructurasOrigen = await requestOf(executor)
    .input("institucionId", sql.Int, params.institucionId)
    .input("grupoIdOrigen", sql.Int, params.grupoIdOrigen)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .query(`
      SELECT *
      FROM dbo.Eval360_EstructuraGrupo
      WHERE InstitucionId = @institucionId
        AND GrupoId = @grupoIdOrigen
        AND AnioLectivoId = @anioLectivoId
        AND ISNULL(Activo, 1) = 1
      ORDER BY EstructuraGrupoId
    `);

  for (const estructuraOrigen of estructurasOrigen.recordset || []) {
    const materiaId = Number(estructuraOrigen.MateriaId || 0);
    const periodoId = Number(estructuraOrigen.PeriodoId || 0);

    let estructuraDestinoId = Number((await requestOf(executor)
      .input("institucionId", sql.Int, params.institucionId)
      .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
      .input("anioLectivoId", sql.Int, params.anioLectivoId)
      .input("materiaId", sql.Int, materiaId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT TOP 1 EstructuraGrupoId
        FROM dbo.Eval360_EstructuraGrupo
        WHERE InstitucionId = @institucionId
          AND GrupoId = @grupoIdDestino
          AND AnioLectivoId = @anioLectivoId
          AND MateriaId = @materiaId
          AND PeriodoId = @periodoId
          AND ISNULL(Activo, 1) = 1
        ORDER BY EstructuraGrupoId DESC
      `)).recordset[0]?.EstructuraGrupoId || 0);

    if (!estructuraDestinoId) {
      estructuraDestinoId = Number((await requestOf(executor)
        .input("institucionId", sql.Int, params.institucionId)
        .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
        .input("materiaId", sql.Int, materiaId)
        .input("anioLectivoId", sql.Int, params.anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("usuarioId", sql.Int, params.usuarioId || estructuraOrigen.UsuarioId || null)
        .input("plantillaBaseId", sql.Int, estructuraOrigen.PlantillaBaseId || null)
        .input("nombre", sql.NVarChar(200), estructuraOrigen.Nombre || "Estructura de evaluacion")
        .input("totalPorcentaje", sql.Decimal(5, 2), Number(estructuraOrigen.TotalPorcentaje || 100))
        .query(`
          INSERT INTO dbo.Eval360_EstructuraGrupo
            (InstitucionId, GrupoId, MateriaId, AnioLectivoId, PeriodoId, UsuarioId, PlantillaBaseId, Nombre, TotalPorcentaje, Activo, CreatedAt)
          OUTPUT INSERTED.EstructuraGrupoId
          VALUES
            (@institucionId, @grupoIdDestino, @materiaId, @anioLectivoId, @periodoId, @usuarioId, @plantillaBaseId, @nombre, @totalPorcentaje, 1, SYSDATETIME())
        `)).recordset[0]?.EstructuraGrupoId || 0);
    }

    const planeamientosOrigen = await requestOf(executor)
      .input("grupoIdOrigen", sql.Int, params.grupoIdOrigen)
      .input("materiaId", sql.Int, materiaId)
      .input("anioLectivoId", sql.Int, params.anioLectivoId)
      .input("periodoId", sql.Int, periodoId)
      .query(`
        SELECT *
        FROM dbo.Planeamiento
        WHERE GrupoId = @grupoIdOrigen
          AND MateriaId = @materiaId
          AND AnioLectivoId = @anioLectivoId
          AND PeriodoId = @periodoId
          AND ISNULL(Activo, 1) = 1
        ORDER BY FechaInicio, PlaneamientoId
      `);

    const planeamientoMap = new Map<number, number>();
    for (const planeamientoOrigen of planeamientosOrigen.recordset || []) {
      const existente = await requestOf(executor)
        .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
        .input("materiaId", sql.Int, materiaId)
        .input("anioLectivoId", sql.Int, params.anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("nombre", sql.NVarChar(200), planeamientoOrigen.Nombre || "")
        .input("fechaInicio", sql.Date, planeamientoOrigen.FechaInicio || null)
        .input("fechaFin", sql.Date, planeamientoOrigen.FechaFin || null)
        .query(`
          SELECT TOP 1 PlaneamientoId
          FROM dbo.Planeamiento
          WHERE GrupoId = @grupoIdDestino
            AND MateriaId = @materiaId
            AND AnioLectivoId = @anioLectivoId
            AND PeriodoId = @periodoId
            AND ISNULL(Activo, 1) = 1
            AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
            AND ISNULL(CONVERT(date, FechaInicio), '19000101') = ISNULL(CONVERT(date, @fechaInicio), '19000101')
            AND ISNULL(CONVERT(date, FechaFin), '19000101') = ISNULL(CONVERT(date, @fechaFin), '19000101')
          ORDER BY PlaneamientoId DESC
        `);

      let planeamientoDestinoId = Number(existente.recordset[0]?.PlaneamientoId || 0);
      if (!planeamientoDestinoId) {
        planeamientoDestinoId = Number((await requestOf(executor)
          .input("institucionId", sql.Int, params.institucionId)
          .input("anioLectivoId", sql.Int, params.anioLectivoId)
          .input("periodoId", sql.Int, periodoId)
          .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
          .input("materiaId", sql.Int, materiaId)
          .input("usuarioId", sql.Int, planeamientoOrigen.UsuarioId || params.usuarioId || null)
          .input("nombre", sql.NVarChar(200), planeamientoOrigen.Nombre || null)
          .input("fechaInicio", sql.Date, planeamientoOrigen.FechaInicio || null)
          .input("fechaFin", sql.Date, planeamientoOrigen.FechaFin || null)
          .input("observaciones", sql.NVarChar(sql.MAX), planeamientoOrigen.Observaciones || null)
          .input("resultadoIAJson", sql.NVarChar(sql.MAX), planeamientoOrigen.ResultadoIAJson || null)
          .query(`
            INSERT INTO dbo.Planeamiento
              (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, ResultadoIAJson, Activo, CreatedAt)
            OUTPUT INSERTED.PlaneamientoId
            VALUES
              (@institucionId, @anioLectivoId, @periodoId, @grupoIdDestino, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, @resultadoIAJson, 1, SYSDATETIME())
          `)).recordset[0]?.PlaneamientoId || 0);

        const indicadoresPlaneamiento = await requestOf(executor)
          .input("planeamientoOrigenId", sql.Int, Number(planeamientoOrigen.PlaneamientoId))
          .query(`
            SELECT Descripcion, NivelDesempenoId
            FROM dbo.PlaneamientoIndicador
            WHERE PlaneamientoId = @planeamientoOrigenId
              AND ISNULL(Activo, 1) = 1
            ORDER BY PlaneamientoIndicadorId
          `);

        for (const indicador of indicadoresPlaneamiento.recordset || []) {
          await requestOf(executor)
            .input("planeamientoId", sql.Int, planeamientoDestinoId)
            .input("descripcion", sql.NVarChar(sql.MAX), indicador.Descripcion || null)
            .input("nivelDesempenoId", sql.Int, indicador.NivelDesempenoId || null)
            .query(`
              INSERT INTO dbo.PlaneamientoIndicador
                (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
              VALUES
                (@planeamientoId, @descripcion, @nivelDesempenoId, 1, SYSDATETIME())
            `);
        }
      }

      planeamientoMap.set(Number(planeamientoOrigen.PlaneamientoId), planeamientoDestinoId);
    }

    const detallesOrigen = await requestOf(executor)
      .input("estructuraOrigenId", sql.Int, Number(estructuraOrigen.EstructuraGrupoId))
      .query(`
        SELECT *
        FROM dbo.Eval360_EstructuraGrupoDetalle
        WHERE EstructuraGrupoId = @estructuraOrigenId
          AND ISNULL(Activo, 1) = 1
        ORDER BY Orden, EstructuraGrupoDetalleId
      `);

    const detalleMap = new Map<number, number>();
    for (const detalleOrigen of detallesOrigen.recordset || []) {
      const detalleDestinoExistente = await requestOf(executor)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("nombre", sql.NVarChar(150), detalleOrigen.Nombre || "")
        .input("orden", sql.Int, Number(detalleOrigen.Orden || 0))
        .query(`
          SELECT TOP 1 EstructuraGrupoDetalleId
          FROM dbo.Eval360_EstructuraGrupoDetalle
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND ISNULL(Activo, 1) = 1
            AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
            AND ISNULL(Orden, 0) = ISNULL(@orden, 0)
          ORDER BY EstructuraGrupoDetalleId DESC
        `);

      let detalleDestinoId = Number(detalleDestinoExistente.recordset[0]?.EstructuraGrupoDetalleId || 0);
      if (!detalleDestinoId) {
        detalleDestinoId = Number((await requestOf(executor)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("componenteCatalogoId", sql.Int, detalleOrigen.ComponenteCatalogoId || null)
          .input("nombre", sql.NVarChar(150), detalleOrigen.Nombre || null)
          .input("porcentaje", sql.Decimal(5, 2), Number(detalleOrigen.Porcentaje || 0))
          .input("orden", sql.Int, Number(detalleOrigen.Orden || 0))
          .query(`
            INSERT INTO dbo.Eval360_EstructuraGrupoDetalle
              (EstructuraGrupoId, ComponenteCatalogoId, Nombre, Porcentaje, Orden, Activo, CreatedAt)
            OUTPUT INSERTED.EstructuraGrupoDetalleId
            VALUES
              (@estructuraGrupoId, @componenteCatalogoId, @nombre, @porcentaje, @orden, 1, SYSDATETIME())
          `)).recordset[0]?.EstructuraGrupoDetalleId || 0);
      }
      detalleMap.set(Number(detalleOrigen.EstructuraGrupoDetalleId), detalleDestinoId);
    }

    const nivelesOrigen = await requestOf(executor)
      .input("estructuraOrigenId", sql.Int, Number(estructuraOrigen.EstructuraGrupoId))
      .query(`
        SELECT *
        FROM dbo.Eval360_NivelDesempenoGrupo
        WHERE EstructuraGrupoId = @estructuraOrigenId
          AND ISNULL(Activo, 1) = 1
        ORDER BY Orden, NivelDesempenoGrupoId
      `);

    for (const nivelOrigen of nivelesOrigen.recordset || []) {
      const existeNivel = await requestOf(executor)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("valor", sql.Decimal(5, 2), Number(nivelOrigen.Valor || 0))
        .query(`
          SELECT TOP 1 NivelDesempenoGrupoId
          FROM dbo.Eval360_NivelDesempenoGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND Valor = @valor
            AND ISNULL(Activo, 1) = 1
        `);
      if (existeNivel.recordset[0]) continue;
      await requestOf(executor)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("nombre", sql.NVarChar(100), nivelOrigen.Nombre || null)
        .input("valor", sql.Decimal(5, 2), Number(nivelOrigen.Valor || 0))
        .input("orden", sql.Int, Number(nivelOrigen.Orden || 0))
        .query(`
          INSERT INTO dbo.Eval360_NivelDesempenoGrupo
            (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
          VALUES
            (@estructuraGrupoId, @nombre, @valor, @orden, 1)
        `);
    }

    const actividadesOrigen = await requestOf(executor)
      .input("estructuraOrigenId", sql.Int, Number(estructuraOrigen.EstructuraGrupoId))
      .query(`
        SELECT *
        FROM dbo.Eval360_Actividad
        WHERE EstructuraGrupoId = @estructuraOrigenId
          AND ISNULL(Activo, 1) = 1
        ORDER BY ActividadId
      `);

    const actividadMap = new Map<number, number>();
    for (const actividadOrigen of actividadesOrigen.recordset || []) {
      const detalleDestinoId = detalleMap.get(Number(actividadOrigen.EstructuraGrupoDetalleId));
      if (!detalleDestinoId) continue;
      const existente = await requestOf(executor)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("detalleDestinoId", sql.Int, detalleDestinoId)
        .input("nombre", sql.NVarChar(200), actividadOrigen.Nombre || "")
        .input("fuente", sql.NVarChar(50), actividadOrigen.Fuente || null)
        .query(`
          SELECT TOP 1 ActividadId
          FROM dbo.Eval360_Actividad
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND EstructuraGrupoDetalleId = @detalleDestinoId
            AND ISNULL(Activo, 1) = 1
            AND UPPER(LTRIM(RTRIM(ISNULL(Nombre, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@nombre, N''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(Fuente, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@fuente, N''))))
          ORDER BY ActividadId DESC
        `);

      let actividadDestinoId = Number(existente.recordset[0]?.ActividadId || 0);
      if (!actividadDestinoId) {
        actividadDestinoId = Number((await requestOf(executor)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("detalleDestinoId", sql.Int, detalleDestinoId)
          .input("nombre", sql.NVarChar(200), actividadOrigen.Nombre || null)
          .input("descripcion", sql.NVarChar(sql.MAX), actividadOrigen.Descripcion || null)
          .input("fecha", sql.Date, actividadOrigen.Fecha || null)
          .input("puntosMaximos", sql.Decimal(10, 2), Number(actividadOrigen.PuntosMaximos || 100))
          .input("porcentajeDentroRubro", sql.Decimal(5, 2), actividadOrigen.PorcentajeDentroRubro === null ? null : Number(actividadOrigen.PorcentajeDentroRubro || 0))
          .input("usaIndicadoresPlaneamiento", sql.Bit, !!actividadOrigen.UsaIndicadoresPlaneamiento)
          .input("fuente", sql.NVarChar(50), actividadOrigen.Fuente || null)
          .query(`
            INSERT INTO dbo.Eval360_Actividad
              (EstructuraGrupoId, EstructuraGrupoDetalleId, Nombre, Descripcion, Fecha, PuntosMaximos, PorcentajeDentroRubro, UsaIndicadoresPlaneamiento, Fuente, Activo, CreatedAt)
            OUTPUT INSERTED.ActividadId
            VALUES
              (@estructuraGrupoId, @detalleDestinoId, @nombre, @descripcion, @fecha, @puntosMaximos, @porcentajeDentroRubro, @usaIndicadoresPlaneamiento, @fuente, 1, SYSDATETIME())
          `)).recordset[0]?.ActividadId || 0);
      }
      actividadMap.set(Number(actividadOrigen.ActividadId), actividadDestinoId);
    }

    const indicadoresOrigen = await requestOf(executor)
      .input("estructuraOrigenId", sql.Int, Number(estructuraOrigen.EstructuraGrupoId))
      .query(`
        SELECT *
        FROM dbo.Eval360_IndicadorGrupo
        WHERE EstructuraGrupoId = @estructuraOrigenId
          AND ISNULL(Activo, 1) = 1
        ORDER BY IndicadorGrupoId
      `);

    const indicadorMap = new Map<number, number>();
    for (const indicadorOrigen of indicadoresOrigen.recordset || []) {
      const planeamientoDestinoId = planeamientoMap.get(Number(indicadorOrigen.PlaneamientoId || 0)) || null;
      const existente = await requestOf(executor)
        .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
        .input("planeamientoId", sql.Int, planeamientoDestinoId)
        .input("tipoUso", sql.NVarChar(50), indicadorOrigen.TipoUso || null)
        .input("indicadorBase", sql.NVarChar(sql.MAX), indicadorOrigen.IndicadorBase || "")
        .query(`
          SELECT TOP 1 IndicadorGrupoId
          FROM dbo.Eval360_IndicadorGrupo
          WHERE EstructuraGrupoId = @estructuraGrupoId
            AND ISNULL(Activo, 1) = 1
            AND ISNULL(PlaneamientoId, 0) = ISNULL(@planeamientoId, 0)
            AND UPPER(LTRIM(RTRIM(ISNULL(TipoUso, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@tipoUso, N''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(IndicadorBase, N'')))) = UPPER(LTRIM(RTRIM(ISNULL(@indicadorBase, N''))))
          ORDER BY IndicadorGrupoId DESC
        `);

      let indicadorDestinoId = Number(existente.recordset[0]?.IndicadorGrupoId || 0);
      if (!indicadorDestinoId) {
        indicadorDestinoId = Number((await requestOf(executor)
          .input("estructuraGrupoId", sql.Int, estructuraDestinoId)
          .input("planeamientoId", sql.Int, planeamientoDestinoId)
          .input("tipoUso", sql.NVarChar(50), indicadorOrigen.TipoUso || null)
          .input("indicadorBase", sql.NVarChar(sql.MAX), indicadorOrigen.IndicadorBase || null)
          .input("indicadorAvanzado", sql.NVarChar(sql.MAX), indicadorOrigen.IndicadorAvanzado || null)
          .input("indicadorIntermedio", sql.NVarChar(sql.MAX), indicadorOrigen.IndicadorIntermedio || null)
          .input("indicadorInicial", sql.NVarChar(sql.MAX), indicadorOrigen.IndicadorInicial || null)
          .query(`
            INSERT INTO dbo.Eval360_IndicadorGrupo
              (EstructuraGrupoId, PlaneamientoId, TipoUso, IndicadorBase, IndicadorAvanzado, IndicadorIntermedio, IndicadorInicial, Activo, CreatedAt)
            OUTPUT INSERTED.IndicadorGrupoId
            VALUES
              (@estructuraGrupoId, @planeamientoId, @tipoUso, @indicadorBase, @indicadorAvanzado, @indicadorIntermedio, @indicadorInicial, 1, SYSDATETIME())
          `)).recordset[0]?.IndicadorGrupoId || 0);
      }
      indicadorMap.set(Number(indicadorOrigen.IndicadorGrupoId), indicadorDestinoId);
    }

    const actividadIndicadoresOrigen = await requestOf(executor)
      .input("estructuraOrigenId", sql.Int, Number(estructuraOrigen.EstructuraGrupoId))
      .query(`
        SELECT ai.ActividadId, ai.IndicadorGrupoId
        FROM dbo.Eval360_ActividadIndicador ai
        INNER JOIN dbo.Eval360_Actividad a ON a.ActividadId = ai.ActividadId
        WHERE a.EstructuraGrupoId = @estructuraOrigenId
          AND ISNULL(ai.Activo, 1) = 1
      `);

    for (const asignacion of actividadIndicadoresOrigen.recordset || []) {
      const actividadDestinoId = actividadMap.get(Number(asignacion.ActividadId));
      const indicadorDestinoId = indicadorMap.get(Number(asignacion.IndicadorGrupoId));
      if (!actividadDestinoId || !indicadorDestinoId) continue;
      const existente = await requestOf(executor)
        .input("actividadId", sql.Int, actividadDestinoId)
        .input("indicadorGrupoId", sql.Int, indicadorDestinoId)
        .query(`
          SELECT TOP 1 1 AS Existe
          FROM dbo.Eval360_ActividadIndicador
          WHERE ActividadId = @actividadId
            AND IndicadorGrupoId = @indicadorGrupoId
            AND ISNULL(Activo, 1) = 1
        `);
      if (existente.recordset[0]) continue;
      await requestOf(executor)
        .input("actividadId", sql.Int, actividadDestinoId)
        .input("indicadorGrupoId", sql.Int, indicadorDestinoId)
        .query(`
          INSERT INTO dbo.Eval360_ActividadIndicador
            (ActividadId, IndicadorGrupoId, Activo)
          VALUES
            (@actividadId, @indicadorGrupoId, 1)
        `);
    }
  }
}

export async function copiarNotasPorTraslado(executor: any, params: {
  institucionId: number;
  estudianteId: number;
  grupoIdOrigen: number;
  grupoIdDestino: number;
  anioLectivoId: number;
}) {
  await asegurarEstructuraEval360ParaTraslado(executor, {
    institucionId: params.institucionId,
    grupoIdOrigen: params.grupoIdOrigen,
    grupoIdDestino: params.grupoIdDestino,
    anioLectivoId: params.anioLectivoId,
    usuarioId: null
  });

  return requestOf(executor)
    .input("institucionId", sql.Int, params.institucionId)
    .input("estudianteId", sql.Int, params.estudianteId)
    .input("grupoIdOrigen", sql.Int, params.grupoIdOrigen)
    .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .query(`
      ;WITH notas_origen AS (
        SELECT
          en.EvaluacionActividadId AS EvaluacionActividadOrigenId,
          en.EstudianteId,
          en.MateriaId,
          en.PeriodoId,
          en.Nota,
          en.PorcentajeGanado,
          en.Observacion,
          comp.Descripcion AS ComponenteDescripcion,
          act.Descripcion AS ActividadDescripcion,
          comp.Orden AS ComponenteOrden,
          act.Orden AS ActividadOrden
        FROM dbo.EvaluacionNota en
        INNER JOIN dbo.EvaluacionActividad act ON act.EvaluacionActividadId = en.EvaluacionActividadId
        INNER JOIN dbo.EvaluacionComponente comp ON comp.EvaluacionComponenteId = act.EvaluacionComponenteId
        INNER JOIN dbo.EvaluacionPlantilla pla ON pla.EvaluacionPlantillaId = comp.EvaluacionPlantillaId
        WHERE en.EstudianteId = @estudianteId
          AND en.GrupoId = @grupoIdOrigen
          AND pla.InstitucionId = @institucionId
          AND pla.AnioLectivoId = @anioLectivoId
          AND ISNULL(comp.Activo, 1) = 1
          AND ISNULL(act.Activo, 1) = 1
      ),
      actividades_destino AS (
        SELECT
          gm.GrupoId,
          gm.MateriaId,
          gm.PeriodoId,
          act.EvaluacionActividadId,
          comp.Descripcion AS ComponenteDescripcion,
          act.Descripcion AS ActividadDescripcion,
          comp.Orden AS ComponenteOrden,
          act.Orden AS ActividadOrden
        FROM dbo.GrupoMateria gm
        INNER JOIN dbo.EvaluacionPlantilla pla
          ON pla.InstitucionId = @institucionId
         AND pla.AnioLectivoId = @anioLectivoId
         AND pla.MateriaId = gm.MateriaId
         AND pla.PeriodoId = gm.PeriodoId
         AND ISNULL(pla.Activo, 1) = 1
        INNER JOIN dbo.EvaluacionComponente comp
          ON comp.EvaluacionPlantillaId = pla.EvaluacionPlantillaId
         AND ISNULL(comp.Activo, 1) = 1
        INNER JOIN dbo.EvaluacionActividad act
          ON act.EvaluacionComponenteId = comp.EvaluacionComponenteId
         AND ISNULL(act.Activo, 1) = 1
        WHERE gm.GrupoId = @grupoIdDestino
          AND ISNULL(gm.Activo, 1) = 1
      ),
      mapeo_notas AS (
        SELECT
          o.EstudianteId,
          @grupoIdDestino AS GrupoIdDestino,
          o.MateriaId,
          o.PeriodoId,
          d.EvaluacionActividadId AS EvaluacionActividadDestinoId,
          o.Nota,
          o.PorcentajeGanado,
          o.Observacion
        FROM notas_origen o
        INNER JOIN actividades_destino d
          ON d.GrupoId = @grupoIdDestino
         AND d.MateriaId = o.MateriaId
         AND d.PeriodoId = o.PeriodoId
         AND UPPER(LTRIM(RTRIM(d.ComponenteDescripcion))) = UPPER(LTRIM(RTRIM(o.ComponenteDescripcion)))
         AND UPPER(LTRIM(RTRIM(d.ActividadDescripcion))) = UPPER(LTRIM(RTRIM(o.ActividadDescripcion)))
         AND ISNULL(d.ComponenteOrden, 0) = ISNULL(o.ComponenteOrden, 0)
         AND ISNULL(d.ActividadOrden, 0) = ISNULL(o.ActividadOrden, 0)
      ),
      mapeo_notas_dedup AS (
        SELECT *
        FROM (
          SELECT
            mn.*,
            ROW_NUMBER() OVER (
              PARTITION BY mn.EstudianteId, mn.GrupoIdDestino, mn.MateriaId, mn.PeriodoId, mn.EvaluacionActividadDestinoId
              ORDER BY mn.EvaluacionActividadDestinoId DESC
            ) AS rn
          FROM mapeo_notas mn
        ) x
        WHERE x.rn = 1
      )
      MERGE dbo.EvaluacionNota AS target
      USING mapeo_notas_dedup AS source
      ON target.EvaluacionActividadId = source.EvaluacionActividadDestinoId
         AND target.EstudianteId = source.EstudianteId
         AND target.GrupoId = source.GrupoIdDestino
         AND target.MateriaId = source.MateriaId
         AND target.PeriodoId = source.PeriodoId
      WHEN MATCHED THEN
        UPDATE SET
          Nota = source.Nota,
          PorcentajeGanado = source.PorcentajeGanado,
          Observacion = source.Observacion,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (EvaluacionActividadId, EstudianteId, GrupoId, MateriaId, PeriodoId, Nota, PorcentajeGanado, Observacion, CreatedAt)
        VALUES (source.EvaluacionActividadDestinoId, source.EstudianteId, source.GrupoIdDestino, source.MateriaId, source.PeriodoId, source.Nota, source.PorcentajeGanado, source.Observacion, SYSDATETIME());

      ;WITH estructuras_origen AS (
        SELECT DISTINCT eg.EstructuraGrupoId, eg.MateriaId, eg.PeriodoId
        FROM dbo.Eval360_EstructuraGrupo eg
        INNER JOIN dbo.Eval360_Actividad a ON a.EstructuraGrupoId = eg.EstructuraGrupoId
        LEFT JOIN dbo.Eval360_NotaActividad na ON na.ActividadId = a.ActividadId AND na.EstudianteId = @estudianteId
        LEFT JOIN dbo.Eval360_SeguimientoIndicador si ON si.ActividadId = a.ActividadId AND si.EstudianteId = @estudianteId
        WHERE eg.InstitucionId = @institucionId
          AND eg.GrupoId = @grupoIdOrigen
          AND eg.AnioLectivoId = @anioLectivoId
          AND ISNULL(eg.Activo, 1) = 1
          AND (na.NotaActividadId IS NOT NULL OR si.SeguimientoIndicadorId IS NOT NULL)
      ),
      estructuras_destino AS (
        SELECT eo.EstructuraGrupoId AS EstructuraGrupoOrigenId, ed.EstructuraGrupoId AS EstructuraGrupoDestinoId
        FROM estructuras_origen eo
        INNER JOIN dbo.Eval360_EstructuraGrupo ed
          ON ed.InstitucionId = @institucionId
         AND ed.GrupoId = @grupoIdDestino
         AND ed.AnioLectivoId = @anioLectivoId
         AND ed.MateriaId = eo.MateriaId
         AND ed.PeriodoId = eo.PeriodoId
         AND ISNULL(ed.Activo, 1) = 1
      ),
      actividades_map AS (
        SELECT
          ao.ActividadId AS ActividadOrigenId,
          ad.ActividadId AS ActividadDestinoId
        FROM estructuras_destino em
        INNER JOIN dbo.Eval360_Actividad ao
          ON ao.EstructuraGrupoId = em.EstructuraGrupoOrigenId
         AND ISNULL(ao.Activo, 1) = 1
        INNER JOIN dbo.Eval360_EstructuraGrupoDetalle cdo
          ON cdo.EstructuraGrupoDetalleId = ao.EstructuraGrupoDetalleId
        INNER JOIN dbo.Eval360_EstructuraGrupoDetalle cdd
          ON cdd.EstructuraGrupoId = em.EstructuraGrupoDestinoId
         AND UPPER(LTRIM(RTRIM(cdd.Nombre))) = UPPER(LTRIM(RTRIM(cdo.Nombre)))
         AND ISNULL(cdd.Orden, 0) = ISNULL(cdo.Orden, 0)
         AND ISNULL(cdd.Activo, 1) = 1
        INNER JOIN dbo.Eval360_Actividad ad
          ON ad.EstructuraGrupoId = em.EstructuraGrupoDestinoId
         AND ad.EstructuraGrupoDetalleId = cdd.EstructuraGrupoDetalleId
         AND UPPER(LTRIM(RTRIM(ad.Nombre))) = UPPER(LTRIM(RTRIM(ao.Nombre)))
         AND UPPER(LTRIM(RTRIM(ISNULL(ad.Fuente, '')))) = UPPER(LTRIM(RTRIM(ISNULL(ao.Fuente, ''))))
         AND ISNULL(ad.Activo, 1) = 1
      )
      SELECT ActividadOrigenId, ActividadDestinoId
      INTO #ActividadesMap
      FROM (
        SELECT
          am.*,
          ROW_NUMBER() OVER (
            PARTITION BY am.ActividadOrigenId, am.ActividadDestinoId
            ORDER BY am.ActividadDestinoId DESC
          ) AS rn
        FROM actividades_map am
      ) dedup
      WHERE dedup.rn = 1;

      ;WITH estructuras_destino_uso AS (
        SELECT DISTINCT ad.EstructuraGrupoId
        FROM #ActividadesMap am
        INNER JOIN dbo.Eval360_Actividad ad ON ad.ActividadId = am.ActividadDestinoId
      ),
      valores_requeridos AS (
        SELECT DISTINCT
          ed.EstructuraGrupoId,
          CAST(si.ValorSeleccionado AS DECIMAL(10,2)) AS ValorSeleccionado
        FROM dbo.Eval360_SeguimientoIndicador si
        INNER JOIN #ActividadesMap am ON am.ActividadOrigenId = si.ActividadId
        INNER JOIN dbo.Eval360_Actividad ad ON ad.ActividadId = am.ActividadDestinoId
        INNER JOIN estructuras_destino_uso ed ON ed.EstructuraGrupoId = ad.EstructuraGrupoId
        WHERE si.EstudianteId = @estudianteId
          AND si.ValorSeleccionado IS NOT NULL
      )
      INSERT INTO dbo.Eval360_NivelDesempenoGrupo (EstructuraGrupoId, Nombre, Valor, Orden, Activo)
      SELECT
        vr.EstructuraGrupoId,
        CASE
          WHEN vr.ValorSeleccionado = 3 THEN N'Avanzado'
          WHEN vr.ValorSeleccionado = 2 THEN N'Intermedio'
          WHEN vr.ValorSeleccionado = 1 THEN N'Inicial'
          ELSE CONCAT(N'Nivel ', CONVERT(nvarchar(20), vr.ValorSeleccionado))
        END AS Nombre,
        vr.ValorSeleccionado,
        CASE
          WHEN vr.ValorSeleccionado = 1 THEN 1
          WHEN vr.ValorSeleccionado = 2 THEN 2
          WHEN vr.ValorSeleccionado = 3 THEN 3
          ELSE 99
        END AS Orden,
        1
      FROM valores_requeridos vr
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Eval360_NivelDesempenoGrupo nd
        WHERE nd.EstructuraGrupoId = vr.EstructuraGrupoId
          AND nd.Valor = vr.ValorSeleccionado
      );

      MERGE dbo.Eval360_NotaActividad AS target
      USING (
        SELECT
          y.ActividadId,
          y.EstudianteId,
          y.PuntosObtenidos,
          y.PuntosMaximos,
          y.PorcentajeObtenido,
          y.Observacion
        FROM (
          SELECT
            m.ActividadDestinoId AS ActividadId,
            n.EstudianteId,
            n.PuntosObtenidos,
            n.PuntosMaximos,
            n.PorcentajeObtenido,
            n.Observacion,
            ROW_NUMBER() OVER (
              PARTITION BY m.ActividadDestinoId, n.EstudianteId
              ORDER BY ISNULL(n.NotaActividadId, 0) DESC
            ) AS rn
          FROM dbo.Eval360_NotaActividad n
          INNER JOIN #ActividadesMap m ON m.ActividadOrigenId = n.ActividadId
          WHERE n.EstudianteId = @estudianteId
        ) y
        WHERE y.rn = 1
      ) AS source
      ON target.ActividadId = source.ActividadId
         AND target.EstudianteId = source.EstudianteId
      WHEN MATCHED THEN
        UPDATE SET
          PuntosObtenidos = source.PuntosObtenidos,
          PuntosMaximos = source.PuntosMaximos,
          PorcentajeObtenido = source.PorcentajeObtenido,
          Observacion = source.Observacion,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (ActividadId, EstudianteId, PuntosObtenidos, PuntosMaximos, PorcentajeObtenido, Observacion, CreatedAt)
        VALUES (source.ActividadId, source.EstudianteId, source.PuntosObtenidos, source.PuntosMaximos, source.PorcentajeObtenido, source.Observacion, SYSDATETIME());

      MERGE dbo.Eval360_SeguimientoIndicador AS target
      USING (
        SELECT
          z.ActividadId,
          z.IndicadorGrupoId,
          z.EstudianteId,
          z.NivelDesempenoGrupoId,
          z.ValorSeleccionado,
          z.Observacion
        FROM (
          SELECT
            m.ActividadDestinoId AS ActividadId,
            igd.IndicadorGrupoId,
            si.EstudianteId,
            nd.NivelDesempenoGrupoId,
            si.ValorSeleccionado,
            si.Observacion,
            ROW_NUMBER() OVER (
              PARTITION BY m.ActividadDestinoId, igd.IndicadorGrupoId, si.EstudianteId
              ORDER BY ISNULL(si.SeguimientoIndicadorId, 0) DESC
            ) AS rn
          FROM dbo.Eval360_SeguimientoIndicador si
          INNER JOIN dbo.Eval360_Actividad ao ON ao.ActividadId = si.ActividadId
          INNER JOIN dbo.Eval360_IndicadorGrupo igo ON igo.IndicadorGrupoId = si.IndicadorGrupoId
          INNER JOIN dbo.Eval360_EstructuraGrupo ego ON ego.EstructuraGrupoId = ao.EstructuraGrupoId
          INNER JOIN #ActividadesMap m ON m.ActividadOrigenId = si.ActividadId
          INNER JOIN dbo.Eval360_Actividad ad ON ad.ActividadId = m.ActividadDestinoId
          INNER JOIN dbo.Eval360_EstructuraGrupo egd ON egd.EstructuraGrupoId = ad.EstructuraGrupoId
          INNER JOIN dbo.Eval360_IndicadorGrupo igd
            ON igd.EstructuraGrupoId = egd.EstructuraGrupoId
           AND UPPER(LTRIM(RTRIM(ISNULL(igd.TipoUso, '')))) = UPPER(LTRIM(RTRIM(ISNULL(igo.TipoUso, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(igd.IndicadorBase, '')))) = UPPER(LTRIM(RTRIM(ISNULL(igo.IndicadorBase, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(igd.IndicadorAvanzado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(igo.IndicadorAvanzado, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(igd.IndicadorIntermedio, '')))) = UPPER(LTRIM(RTRIM(ISNULL(igo.IndicadorIntermedio, ''))))
           AND UPPER(LTRIM(RTRIM(ISNULL(igd.IndicadorInicial, '')))) = UPPER(LTRIM(RTRIM(ISNULL(igo.IndicadorInicial, ''))))
           AND ISNULL(igd.Activo, 1) = 1
          OUTER APPLY (
            SELECT TOP 1 nd2.NivelDesempenoGrupoId
            FROM dbo.Eval360_NivelDesempenoGrupo nd2
            WHERE nd2.EstructuraGrupoId = egd.EstructuraGrupoId
              AND nd2.Valor = si.ValorSeleccionado
              AND ISNULL(nd2.Activo, 1) = 1
            ORDER BY nd2.Orden, nd2.NivelDesempenoGrupoId
          ) nd
          WHERE si.EstudianteId = @estudianteId
            AND ego.EstructuraGrupoId = ao.EstructuraGrupoId
            AND ISNULL(igo.Activo, 1) = 1
            AND nd.NivelDesempenoGrupoId IS NOT NULL
        ) z
        WHERE z.rn = 1
      ) AS source
      ON target.ActividadId = source.ActividadId
         AND target.IndicadorGrupoId = source.IndicadorGrupoId
         AND target.EstudianteId = source.EstudianteId
      WHEN MATCHED THEN
        UPDATE SET
          NivelDesempenoGrupoId = source.NivelDesempenoGrupoId,
          ValorSeleccionado = source.ValorSeleccionado,
          Observacion = source.Observacion,
          UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (ActividadId, IndicadorGrupoId, EstudianteId, NivelDesempenoGrupoId, ValorSeleccionado, Observacion, CreatedAt)
        VALUES (source.ActividadId, source.IndicadorGrupoId, source.EstudianteId, source.NivelDesempenoGrupoId, source.ValorSeleccionado, source.Observacion, SYSDATETIME());

      DROP TABLE #ActividadesMap;
    `);
}

export async function reaplicarTrasladosPendientesEnGrupo(executor: any, params: {
  institucionId: number;
  grupoIdDestino: number;
  anioLectivoId: number;
}) {
  await ensureMatriculaTrasladoHistorialTable(executor);
  const historial = await requestOf(executor)
    .input("institucionId", sql.Int, params.institucionId)
    .input("grupoIdDestino", sql.Int, params.grupoIdDestino)
    .input("anioLectivoId", sql.Int, params.anioLectivoId)
    .query(`
      ;WITH traslados AS (
        SELECT
          h.*,
          ROW_NUMBER() OVER (PARTITION BY h.EstudianteId ORDER BY h.CreatedAt DESC, h.MatriculaTrasladoHistorialId DESC) AS rn
        FROM dbo.MatriculaTrasladoHistorial h
        INNER JOIN dbo.Matricula m
          ON m.MatriculaId = h.MatriculaId
         AND m.GrupoId = h.GrupoIdDestino
         AND m.AnioLectivoId = h.AnioLectivoId
         AND ISNULL(m.Estado, N'Activa') <> N'Inactiva'
        WHERE h.InstitucionId = @institucionId
          AND h.GrupoIdDestino = @grupoIdDestino
          AND h.AnioLectivoId = @anioLectivoId
      )
      SELECT *
      FROM traslados
      WHERE rn = 1
    `);

  for (const traslado of historial.recordset || []) {
    await copiarNotasPorTraslado(executor, {
      institucionId: params.institucionId,
      estudianteId: Number(traslado.EstudianteId || 0),
      grupoIdOrigen: Number(traslado.GrupoIdOrigen || 0),
      grupoIdDestino: Number(traslado.GrupoIdDestino || 0),
      anioLectivoId: Number(traslado.AnioLectivoId || 0)
    });
    await copiarAsistenciaPorTraslado(executor, {
      estudianteId: Number(traslado.EstudianteId || 0),
      grupoIdOrigen: Number(traslado.GrupoIdOrigen || 0),
      grupoIdDestino: Number(traslado.GrupoIdDestino || 0),
      anioLectivoId: Number(traslado.AnioLectivoId || 0),
      usuarioId: Number(traslado.UsuarioTrasladoId || 0) || null
    });
  }
}
