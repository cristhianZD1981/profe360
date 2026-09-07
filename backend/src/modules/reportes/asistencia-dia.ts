// Uses the report's institution, student, date and professor parameters.
// Keep recorded lessons even when their original schedule is no longer active.
export const asistenciaDiaSql = `
  WITH Matriculas AS (
    SELECT DISTINCT ma.EstudianteId, ma.GrupoId, ma.AnioLectivoId
    FROM dbo.Matricula ma
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
    WHERE e.InstitucionId = @institucionId AND e.Activo = 1
      AND (@guiaAnioId IS NULL OR ma.AnioLectivoId = @guiaAnioId)
      AND ISNULL(ma.Estado, N'') <> N'Inactiva'
      AND ma.EstudianteId = @estudianteId
      AND (@grupoId IS NULL OR ma.GrupoId = @grupoId)
  ), Registros AS (
    SELECT ar.*, COALESCE(ar.BloqueHorarioId, hg.BloqueHorarioId) AS BloqueId
    FROM dbo.AsistenciaRegistro ar
    INNER JOIN Matriculas ma ON ma.EstudianteId = ar.EstudianteId
      AND ma.GrupoId = ar.GrupoId AND ma.AnioLectivoId = ar.AnioLectivoId
    LEFT JOIN dbo.HorarioGrupo hg ON hg.HorarioGrupoId = ar.HorarioGrupoId
    WHERE (@desde IS NULL OR ar.Fecha >= @desde) AND ar.Fecha <= @fechaCorte
  ), Lecciones AS (
    SELECT ar.EstudianteId, ar.GrupoId, ar.AnioLectivoId, ar.PeriodoId,
      ar.MateriaId, ar.Fecha, ar.HorarioGrupoId, ar.BloqueId,
      ar.Estado, ar.UsuarioRegistroId, ar.AsistenciaRegistroId
    FROM Registros ar
    UNION ALL
    SELECT DISTINCT ma.EstudianteId, ma.GrupoId, ma.AnioLectivoId, fc.PeriodoId,
      gm.MateriaId, fc.Fecha, hg.HorarioGrupoId, hg.BloqueHorarioId,
      N'SIN_REGISTRAR', NULL, NULL
    FROM Matriculas ma
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoId = ma.GrupoId AND gm.Activo = 1
    INNER JOIN dbo.HorarioGrupo hg ON hg.GrupoMateriaId = gm.GrupoMateriaId AND hg.Activo = 1
    INNER JOIN dbo.FechaClase fc ON fc.HorarioGrupoId = hg.HorarioGrupoId
    INNER JOIN dbo.Periodo p ON p.PeriodoId = fc.PeriodoId AND p.AnioLectivoId = ma.AnioLectivoId
    WHERE (@desde IS NULL OR fc.Fecha >= @desde) AND fc.Fecha <= @fechaCorte
      AND NOT EXISTS (
        SELECT 1 FROM dbo.FeriadoInstitucional fi
        WHERE fi.InstitucionId = @institucionId AND fi.Fecha = fc.Fecha AND fi.Activo = 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM Registros ar
        WHERE ar.EstudianteId = ma.EstudianteId AND ar.GrupoId = ma.GrupoId
          AND ar.AnioLectivoId = ma.AnioLectivoId AND ar.PeriodoId = fc.PeriodoId
          AND ar.MateriaId = gm.MateriaId AND ar.Fecha = fc.Fecha
          AND (ar.HorarioGrupoId = hg.HorarioGrupoId OR ar.BloqueId = hg.BloqueHorarioId)
      )
  )
  SELECT l.EstudianteId AS estudianteId,
    CONCAT(l.GrupoId, '|', l.PeriodoId, '|', CONVERT(varchar(10), l.Fecha, 23), '|',
      l.HorarioGrupoId, '|', ISNULL(l.AsistenciaRegistroId, 0)) AS id,
    CONVERT(varchar(10), l.Fecha, 23) AS fecha,
    ISNULL(bh.Nombre, N'Lección sin bloque') AS leccion,
    CONVERT(varchar(5), bh.HoraInicio, 108) AS horaInicio,
    CONVERT(varchar(5), bh.HoraFin, 108) AS horaFin,
    m.Nombre AS materia,
    COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Nombre, N' ', u.PrimerApellido, N' ', u.SegundoApellido))), N''),
      N'Sin profesor asignado') AS profesor,
    ISNULL(NULLIF(l.Estado, N''), N'SIN_REGISTRAR') AS estado,
    CASE WHEN reb.CorreoEnviado = 1 THEN N'Enviado'
      WHEN reb.ReporteEnvioBitacoraId IS NOT NULL THEN N'Sin envío confirmado'
      ELSE N'Sin registro de envío' END AS envioCorreo,
    CASE WHEN reb.WaEnviado = 1 THEN N'Enviado'
      WHEN reb.ReporteEnvioBitacoraId IS NOT NULL THEN N'Sin envío confirmado'
      ELSE N'Sin registro de envío' END AS envioWhatsApp
  FROM Lecciones l
  INNER JOIN dbo.Materia m ON m.MateriaId = l.MateriaId
  LEFT JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = l.BloqueId
  OUTER APPLY (
    SELECT TOP 1 ad.UsuarioId
    FROM dbo.AsignacionDocente ad
    WHERE ad.InstitucionId = @institucionId AND ad.GrupoId = l.GrupoId
      AND ad.AnioLectivoId = l.AnioLectivoId AND ad.MateriaId = l.MateriaId AND ad.Activo = 1
      AND (ad.PeriodoId = l.PeriodoId OR ad.PeriodoId IS NULL)
      AND (@profesorId IS NULL OR ad.UsuarioId = @profesorId)
    ORDER BY CASE WHEN ad.PeriodoId = l.PeriodoId THEN 0 ELSE 1 END, ad.AsignacionDocenteId DESC
  ) prof
  LEFT JOIN dbo.Usuario u ON u.UsuarioId = COALESCE(l.UsuarioRegistroId, prof.UsuarioId)
  LEFT JOIN dbo.ReporteEnvioBitacora reb ON reb.Modulo = N'ASISTENCIA'
    AND reb.RegistroClave = CONCAT(N'ASIS|', l.GrupoId, N'|', l.MateriaId, N'|', l.PeriodoId,
      N'|', CONVERT(varchar(10), l.Fecha, 23), N'|', l.EstudianteId, N'|', l.HorarioGrupoId)
  WHERE @profesorId IS NULL OR l.UsuarioRegistroId = @profesorId OR prof.UsuarioId = @profesorId
  ORDER BY l.Fecha DESC, bh.HoraInicio, m.Nombre, l.HorarioGrupoId
`;
