import type { CSSProperties } from "react";

type AdecuacionStyleKind = "SIGNIFICATIVA" | "NO_SIGNIFICATIVA" | null;

export const ADECUACION_NO_SIGNIFICATIVA_COLOR = "#64748b";
export const ADECUACION_SIGNIFICATIVA_ASISTENCIA_BACKGROUND = "#dcfce7";
export const ADECUACION_NO_SIGNIFICATIVA_ASISTENCIA_BACKGROUND = "#e0f2fe";

export function normalizeAdecuacionText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getAdecuacionStyleKind(value?: string | null): AdecuacionStyleKind {
  const normalized = normalizeAdecuacionText(value);
  if (!normalized) return null;
  if (normalized.includes("no significativa")) return "NO_SIGNIFICATIVA";
  if (normalized.includes("significativa")) return "SIGNIFICATIVA";
  return null;
}

export function getAdecuacionValue(row: any): string | null {
  if (!row || typeof row !== "object") return null;
  return row.TipoAdecuacion
    ?? row.Adecuacion
    ?? row.adecuacion
    ?? row["Tipo de Adecuación"]
    ?? row["Tipo de Adecuacion"]
    ?? null;
}

export function getAdecuacionRowStyle(value?: string | null): CSSProperties {
  const kind = getAdecuacionStyleKind(value);
  if (kind === "SIGNIFICATIVA") return { fontWeight: 800 };
  if (kind === "NO_SIGNIFICATIVA") return { color: ADECUACION_NO_SIGNIFICATIVA_COLOR };
  return {};
}

export function getAdecuacionAsistenciaBackground(value?: string | null) {
  const kind = getAdecuacionStyleKind(value);
  if (kind === "SIGNIFICATIVA") return ADECUACION_SIGNIFICATIVA_ASISTENCIA_BACKGROUND;
  if (kind === "NO_SIGNIFICATIVA") return ADECUACION_NO_SIGNIFICATIVA_ASISTENCIA_BACKGROUND;
  return "";
}

export function getAdecuacionAsistenciaRowStyle(value?: string | null): CSSProperties {
  const backgroundColor = getAdecuacionAsistenciaBackground(value);
  return {
    ...getAdecuacionRowStyle(value),
    ...(backgroundColor ? { backgroundColor } : {})
  };
}

export function getAdecuacionListRowStyle(value?: string | null): CSSProperties {
  return getAdecuacionAsistenciaRowStyle(value);
}

export function mergeAdecuacionCellStyle(
  baseStyle: CSSProperties,
  value?: string | null
): CSSProperties {
  return {
    ...baseStyle,
    ...getAdecuacionRowStyle(value)
  };
}

export function getAdecuacionHtmlStyle(value?: string | null) {
  const kind = getAdecuacionStyleKind(value);
  if (kind === "SIGNIFICATIVA") return "font-weight:800;";
  if (kind === "NO_SIGNIFICATIVA") return `color:${ADECUACION_NO_SIGNIFICATIVA_COLOR};`;
  return "";
}

export function getAdecuacionAsistenciaHtmlStyle(
  value?: string | null,
  fallbackBackground = ""
) {
  const backgroundColor = getAdecuacionAsistenciaBackground(value) || fallbackBackground;
  return `${backgroundColor ? `background:${backgroundColor};` : ""}${getAdecuacionHtmlStyle(value)}`;
}

export function getAdecuacionListHtmlStyle(
  value?: string | null,
  fallbackBackground = ""
) {
  return getAdecuacionAsistenciaHtmlStyle(value, fallbackBackground);
}
