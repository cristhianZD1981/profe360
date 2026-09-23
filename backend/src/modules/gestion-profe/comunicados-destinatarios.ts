import { getCostaRicaIsoDate } from "../../utils/date.utils";
import { normalizeWhatsAppPhone } from "../../utils/whatsapp.utils";

// La fecha SQL es una fecha civil; no desplazar su día por la zona horaria.
export function edadComunicado(fechaNacimiento: string | Date | null | undefined, hoy = getCostaRicaIsoDate()): number | null {
  const fecha = fechaNacimiento instanceof Date
    ? (Number.isNaN(fechaNacimiento.getTime()) ? "" : fechaNacimiento.toISOString().slice(0, 10))
    : String(fechaNacimiento || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const parsed = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha || fecha > hoy) return null;
  return Number(hoy.slice(0, 4)) - Number(fecha.slice(0, 4)) - (hoy.slice(5) < fecha.slice(5) ? 1 : 0);
}

const acepta = (value: unknown) => value === true || value === 1;
export function validarPermisoEstudiante(valor: unknown, nacimiento: string | Date | null | undefined) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "boolean") return "El permiso WhatsApp del estudiante debe ser verdadero o falso.";
  if (valor === false && (edadComunicado(nacimiento) ?? -1) < 18) return "Solo se puede desactivar WhatsApp al estudiante cuando tiene 18 años o más y una fecha de nacimiento válida.";
  return "";
}
type Contacto = { EncargadoId: number | null; Nombre: string; Telefono?: string | null; AceptaWhatsApp?: unknown };
export function destinosWhatsAppComunicado(params: {
  fechaNacimiento?: string | Date | null;
  hoy?: string;
  estudiante: Contacto;
  encargados: Contacto[];
  autorizaEncargados: unknown;
}) {
  const edad = edadComunicado(params.fechaNacimiento, params.hoy);
  const adulto = edad !== null && edad >= 18;
  const permisoAlumno = params.estudiante.AceptaWhatsApp ?? (acepta(params.autorizaEncargados) || params.encargados.some(c => acepta(c.AceptaWhatsApp)));
  const contactos = edad === null || adulto ? [{ ...params.estudiante, AceptaWhatsApp: permisoAlumno }] : params.encargados;
  const elegidos: Contacto[] = contactos.length ? contactos : [{ EncargadoId: null, Nombre: "Encargado no registrado" }];
  return elegidos.map(contacto => {
    const telefono = normalizeWhatsAppPhone(contacto.Telefono);
    const destino = /^\+\d{7,15}$/.test(telefono) ? telefono : "";
    const motivo = edad === null ? "Fecha de nacimiento ausente o inválida; no se puede determinar el destinatario"
      : !adulto && !params.encargados.length ? "Sin encargados habilitados para recibir notificaciones"
      : !adulto && !acepta(params.autorizaEncargados) ? "WhatsApp al encargado no autorizado"
      : !acepta(contacto.AceptaWhatsApp) ? `${adulto ? "El estudiante" : "El encargado"} no acepta mensajes de WhatsApp`
      : !destino ? `Sin teléfono válido del ${adulto ? "estudiante" : "encargado"}` : "";
    return { encargado: contacto, canal: "WHATSAPP", destino, motivo, habilitado: !motivo };
  });
}
