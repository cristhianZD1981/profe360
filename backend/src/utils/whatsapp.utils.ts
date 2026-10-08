export function normalizeWhatsAppPhone(raw?: string | null) {
  const original = String(raw || "").trim();
  if (!original) return "";
  const normalized = original.replace(/[^\d+]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("+")) return normalized;
  return `+${normalized}`;
}

export function buildWhatsAppWabaPayload(params: {
  fromNumber: string;
  toNumber: string;
  message: string;
}) {
  const mode = String(process.env.WHATSAPP_WABA_MESSAGE_MODE || "template")
    .trim()
    .toLowerCase();

  if (mode === "session") {
    return {
      from_number: params.fromNumber,
      to_number: params.toNumber,
      text: params.message
    };
  }

  const templateUuid = String(process.env.WHATSAPP_WABA_TEMPLATE_UUID || "").trim();
  if (!templateUuid) return null;

  let bodyParams = [params.message];
  const configuredParams = String(process.env.WHATSAPP_WABA_TEMPLATE_BODY_PARAMS_JSON || "").trim();
  if (configuredParams) {
    try {
      const parsed = JSON.parse(configuredParams);
      if (Array.isArray(parsed)) bodyParams = parsed.map((item) => String(item ?? ""));
    } catch {
      // Se conserva el mensaje completo como {{1}} cuando la configuración no es JSON válido.
    }
  }

  return {
    from_number: params.fromNumber,
    to_number: params.toNumber,
    template_uuid: templateUuid,
    params: { body: bodyParams }
  };
}

export function isAdultByBirthDate(fechaNacimiento?: string | Date | null) {
  const birthDate = fechaNacimiento instanceof Date
    ? (Number.isNaN(fechaNacimiento.getTime()) ? "" : fechaNacimiento.toISOString().slice(0, 10))
    : String(fechaNacimiento || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return false;
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const today = Object.fromEntries(todayParts.map(part => [part.type, part.value]));
  const year = Number(today.year), month = Number(today.month), day = Number(today.day);
  let age = year - birth.getUTCFullYear();
  const monthDiff = month - (birth.getUTCMonth() + 1);
  if (monthDiff < 0 || (monthDiff === 0 && day < birth.getUTCDate())) age -= 1;
  return age >= 18;
}

export function resolveWhatsAppPhonesForNotification(params: {
  fechaNacimiento?: string | Date | null;
  telefonoEstudiante?: string | null;
  telefonosEncargados?: Array<string | null | undefined>;
  autorizaWhatsAppEncargado?: boolean;
  aceptaWhatsAppEstudiante?: boolean | number | null;
}) {
  const isAdult = isAdultByBirthDate(params.fechaNacimiento);
  const telefonoEstudiante = normalizeWhatsAppPhone(params.telefonoEstudiante);
  const studentAccepted = params.aceptaWhatsAppEstudiante === true || params.aceptaWhatsAppEstudiante === 1;
  const destinations: string[] = [];
  if (params.autorizaWhatsAppEncargado) {
    destinations.push(...(params.telefonosEncargados || []).map(telefono => normalizeWhatsAppPhone(telefono)));
  }
  if (isAdult && studentAccepted && telefonoEstudiante) destinations.push(telefonoEstudiante);
  return Array.from(new Set(destinations.filter(Boolean)));
}
