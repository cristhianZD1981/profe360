const ESTADOS_PROPAGACION_INICIAL = new Set([
  "AUSENTE_JUSTIFICADA",
  "AUSENTE_INJUSTIFICADA"
]);

export function debePropagarPrimeraSeleccionAsistencia(
  estado: string,
  esPrimeraSeleccion: boolean,
  cantidadLecciones: number
) {
  return esPrimeraSeleccion
    && cantidadLecciones > 1
    && ESTADOS_PROPAGACION_INICIAL.has(String(estado || "").trim().toUpperCase());
}
