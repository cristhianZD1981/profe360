export function normalizeWhatsAppPhone(raw?: string | null) {
  const original = String(raw || "").trim();
  if (!original) return "";
  const normalized = original.replace(/[^\d+]/g, "");
  if (!normalized) return "";
  if (normalized.startsWith("+")) return normalized;
  return `+${normalized}`;
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
