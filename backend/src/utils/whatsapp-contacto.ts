export function agregarContactoConsultas(mensaje: string, contacto: { TelefonoPrincipal?: string | null; WhatsAppContacto?: string | null }) {
  const telefono = String(contacto.TelefonoPrincipal || "").trim();
  const whatsapp = String(contacto.WhatsAppContacto || "").trim();
  const consulta = telefono && whatsapp
    ? `Para consultas, favor de llamar al teléfono ${telefono} o al WhatsApp del colegio ${whatsapp}.`
    : telefono ? `Para consultas, favor de llamar al teléfono ${telefono}.`
    : whatsapp ? `Para consultas, favor de contactar al WhatsApp del colegio ${whatsapp}.`
    : "Para consultas, favor de comunicarse directamente con el colegio.";
  const pie = `${consulta}\n\nEste número es solo informativo.`;
  const cierre = /(Gracias por su atención\.|La institución educativa agradece su atención\.)\s*$/i;
  return cierre.test(mensaje)
    ? mensaje.replace(cierre, (texto) => `${pie}\n\n${texto}`)
    : `${mensaje.trimEnd()}\n\n${pie}`;
}
