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
  if (!fechaNacimiento) return false;
  const dob = new Date(fechaNacimiento);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 18;
}

export function resolveWhatsAppPhonesForNotification(params: {
  fechaNacimiento?: string | Date | null;
  telefonoEstudiante?: string | null;
  telefonosEncargados?: Array<string | null | undefined>;
  autorizaWhatsAppEncargado?: boolean;
}) {
  const isAdult = isAdultByBirthDate(params.fechaNacimiento);
  const telefonoEstudiante = normalizeWhatsAppPhone(params.telefonoEstudiante);

  if (isAdult) {
    return telefonoEstudiante ? [telefonoEstudiante] : [];
  }

  if (!params.autorizaWhatsAppEncargado) return [];

  return Array.from(
    new Set(
      (params.telefonosEncargados || [])
        .map((telefono) => normalizeWhatsAppPhone(telefono))
        .filter(Boolean)
    )
  );
}
