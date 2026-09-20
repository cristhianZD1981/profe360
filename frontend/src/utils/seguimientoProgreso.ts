export type EstadoProgresoIndicador = "NO_CALIFICADO" | "PARCIAL" | "COMPLETO";
export type ProgresoIndicador = {
  estado: EstadoProgresoIndicador;
  calificados: number;
  total: number;
  pendientes: number;
};
export const etiquetasProgresoIndicador: Record<EstadoProgresoIndicador, string> = {
  NO_CALIFICADO: "Sin calificar",
  PARCIAL: "Parcialmente calificado",
  COMPLETO: "Completamente calificado"
};

// Solo presentación: no recalcula notas ni modifica los registros recibidos.
// El llamador proporciona el mismo conjunto de estudiantes que puede calificar.
export function crearProgresoIndicadores({ indicadoresIds, estudiantesIds, seguimientos, actividadPorIndicador }: {
  indicadoresIds: Array<number | string>;
  estudiantesIds: Array<number | string>;
  seguimientos: Array<{ IndicadorGrupoId: number | string; EstudianteId: number | string; ActividadId?: number | string | null }>;
  // Sin mapa: cotidiano sin asignación por actividad. Con mapa: respetar la
  // actividad asignada a cada indicador; cero significa que aún no se asignó.
  actividadPorIndicador?: ReadonlyMap<number, number>;
}): Map<number, ProgresoIndicador> {
  const estudiantes = new Set(estudiantesIds.map(Number).filter(id => Number.isInteger(id) && id > 0));
  const registrados = new Map<number, Set<number>>();
  for (const registro of seguimientos) {
    const estudianteId = Number(registro.EstudianteId);
    const indicadorId = Number(registro.IndicadorGrupoId);
    if (!estudiantes.has(estudianteId)) continue;
    if (actividadPorIndicador) {
      const actividadId = actividadPorIndicador.get(indicadorId);
      if (!actividadId || Number(registro.ActividadId) !== actividadId) continue;
    }
    if (!registrados.has(indicadorId)) registrados.set(indicadorId, new Set());
    registrados.get(indicadorId)!.add(estudianteId);
  }
  return new Map(indicadoresIds.map(Number).map(id => {
    const calificados = registrados.get(id)?.size || 0;
    const total = estudiantes.size;
    return [id, {
      estado: calificados === 0 ? "NO_CALIFICADO" : calificados === total ? "COMPLETO" : "PARCIAL",
      calificados, total, pendientes: total - calificados
    }];
  }));
}

export function coincideFiltroProgreso(estado: EstadoProgresoIndicador, filtro: string) {
  // Conservar el filtro anterior de cualquier calificación y sumar los estados
  // precisos sin alterar los filtros de nivel (Inicial, Ausente, etc.).
  if (filtro === "CALIFICADO") return estado !== "NO_CALIFICADO";
  if (["NO_CALIFICADO", "PARCIAL", "COMPLETO"].includes(filtro)) return estado === filtro;
  return true;
}
