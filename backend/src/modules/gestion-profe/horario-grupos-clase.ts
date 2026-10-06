// Reuse the class-group ownership and period rules used by Mis grupos.
export const horarioGruposClaseSql = `
SELECT gc.GrupoClaseId, gc.GrupoIdPrincipal AS GrupoId, gc.Nombre AS GrupoNombre,
       gc.MateriaId, m.Nombre AS MateriaNombre, m.Codigo AS MateriaCodigo,
       gc.AnioLectivoId, al.Nombre AS AnioNombre, p.PeriodoId, p.Nombre AS PeriodoNombre
INTO #ClasesHorario
FROM dbo.GrupoClase gc
JOIN dbo.Materia m ON m.MateriaId = gc.MateriaId AND m.Activa = 1
JOIN dbo.AnioLectivo al ON al.AnioLectivoId = gc.AnioLectivoId
JOIN dbo.Periodo p ON p.AnioLectivoId = gc.AnioLectivoId AND p.PeriodoId = @periodoId
WHERE gc.InstitucionId = @institucionId AND gc.AnioLectivoId = @anioLectivoId
  AND gc.Activo = 1 AND gc.GrupoClaseCanonicoId IS NULL
  AND ((gc.AplicaTodosPeriodos = 1 AND p.Activo = 1)
       OR (gc.AplicaTodosPeriodos = 0 AND gc.PeriodoId = p.PeriodoId))
  AND EXISTS (SELECT 1 FROM dbo.GrupoClaseDocente d
              WHERE d.GrupoClaseId = gc.GrupoClaseId AND d.UsuarioId = @usuarioId AND d.Activo = 1);

SELECT DISTINCT s.GrupoId, c.MateriaId, c.AnioLectivoId, c.PeriodoId
FROM #ClasesHorario c
JOIN dbo.GrupoClaseSeccion s ON s.GrupoClaseId = c.GrupoClaseId AND s.Activo = 1;

WITH Candidatos AS (
  SELECT c.*, hg.HorarioGrupoId, hg.DiaSemana, hg.BloqueHorarioId,
         ROW_NUMBER() OVER (PARTITION BY c.GrupoClaseId, hg.DiaSemana, hg.BloqueHorarioId
           ORDER BY CASE WHEN gm.PeriodoId = @periodoId THEN 0 ELSE 1 END, hg.HorarioGrupoId DESC) AS rn
  FROM #ClasesHorario c
  JOIN dbo.GrupoClaseSeccion s ON s.GrupoClaseId = c.GrupoClaseId AND s.Activo = 1
  JOIN dbo.Grupo g ON g.GrupoId = s.GrupoId AND g.InstitucionId = @institucionId
    AND g.AnioLectivoId = @anioLectivoId AND g.Activo = 1
  JOIN dbo.GrupoMateria gm ON gm.GrupoId = s.GrupoId AND gm.MateriaId = c.MateriaId
    AND gm.Activo = 1 AND (gm.PeriodoId = @periodoId OR gm.PeriodoId IS NULL)
  JOIN dbo.HorarioGrupo hg ON hg.GrupoMateriaId = gm.GrupoMateriaId AND hg.Activo = 1
  JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId AND bh.InstitucionId = @institucionId
  WHERE EXISTS (SELECT 1 FROM dbo.GrupoClaseLeccionPatron lp
                WHERE lp.GrupoClaseId = c.GrupoClaseId AND lp.Activo = 1
                  AND lp.DiaSemana = hg.DiaSemana AND lp.BloqueHorarioId = hg.BloqueHorarioId)
     OR (NOT EXISTS (SELECT 1 FROM dbo.GrupoClaseLeccionPatron lp
                     WHERE lp.GrupoClaseId = c.GrupoClaseId AND lp.Activo = 1)
         AND EXISTS (SELECT 1 FROM dbo.GrupoClaseHorario ch
                     WHERE ch.GrupoClaseId = c.GrupoClaseId AND ch.Activo = 1
                       AND ch.HorarioGrupoId = hg.HorarioGrupoId))
)
SELECT GrupoClaseId, GrupoId, GrupoNombre, MateriaId, MateriaNombre, MateriaCodigo,
       AnioLectivoId, AnioNombre, PeriodoId, PeriodoNombre, HorarioGrupoId, DiaSemana, BloqueHorarioId
FROM Candidatos WHERE rn = 1;
DROP TABLE #ClasesHorario;
`;

export function combinarHorarios(base: any[], coberturas: any[], clases: any[]) {
  const key = (r: any) => [r.GrupoId, r.MateriaId, r.AnioLectivoId, r.PeriodoId].join('|');
  const cubiertos = new Set(coberturas.map(key));
  return [...base.filter(r => !cubiertos.has(key(r))), ...clases];
}
