const COSTA_RICA_TIME_ZONE = "America/Costa_Rica";

export function getCostaRicaIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function parseDateInputAsLocalDate(value?: string | Date | null, fallback = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value || "").trim();
  if (!raw) return new Date(`${getCostaRicaIsoDate(fallback)}T12:00:00`);

  const exactIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exactIso) {
    const [, year, month, day] = exactIso;
    return new Date(`${year}-${month}-${day}T12:00:00`);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return new Date(`${getCostaRicaIsoDate(fallback)}T12:00:00`);
}
