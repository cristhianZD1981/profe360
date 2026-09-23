export function esMayorParaWhatsApp(nacimiento: string, hoy: string) {
  const fecha = nacimiento.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const parsed = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha || fecha > hoy) return false;
  return Number(hoy.slice(0, 4)) - Number(fecha.slice(0, 4)) - (hoy.slice(5) < fecha.slice(5) ? 1 : 0) >= 18;
}

export function aceptaWhatsAppAlumno(decision: boolean | null, permisoEncargado: boolean, encargados: { aceptaWhatsApp: boolean }[]) {
  return decision ?? (permisoEncargado || encargados.some(e => e.aceptaWhatsApp));
}

export function permisoEncargadosEnFicha(esMayor: boolean, permisoActual: boolean, encargados: { aceptaWhatsApp: boolean }[]) {
  return esMayor ? encargados.some(e => e.aceptaWhatsApp) : permisoActual;
}
