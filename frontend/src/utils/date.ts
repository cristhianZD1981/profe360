export function getCostaRicaIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function getCostaRicaIsoDateWithOffset(days: number, baseDate = new Date()) {
  const shifted = new Date(baseDate);
  shifted.setDate(shifted.getDate() + days);
  return getCostaRicaIsoDate(shifted);
}
