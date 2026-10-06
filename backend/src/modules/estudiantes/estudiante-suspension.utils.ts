import { sql } from "../../config/database";

export const MOTIVOS_SUSPENSION_ESTUDIANTE = new Set([
  "Medida Precautoria",
  "Acción Correctiva",
  "Situación Médica"
]);

export function normalizeSuspensionMotivo(value: any) {
  const text = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
  const motivos: Record<string, string> = {
    "medida precautoria": "Medida Precautoria",
    "accion correctiva": "Acción Correctiva",
    "situacion medica": "Situación Médica"
  };
  return motivos[text] || String(value || "").trim();
}

export function getSuspensionVigenteApplySql(estudianteAlias = "e") {
  return `
    OUTER APPLY (
      SELECT TOP 1
        s.EstudianteSuspensionId,
        s.Motivo,
        s.FechaInicio,
        s.FechaFin,
        s.Observacion
      FROM dbo.EstudianteSuspension s
      WHERE s.InstitucionId = ${estudianteAlias}.InstitucionId
        AND s.EstudianteId = ${estudianteAlias}.EstudianteId
        AND s.Activo = 1
        AND CONVERT(date, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') >= s.FechaInicio
        AND CONVERT(date, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') <= s.FechaFin
      ORDER BY s.FechaFin DESC, s.EstudianteSuspensionId DESC
    ) suspension
  `;
}

export const suspensionVigenteSelectSql = `
  suspension.EstudianteSuspensionId AS SuspensionId,
  CAST(CASE WHEN suspension.EstudianteSuspensionId IS NULL THEN 0 ELSE 1 END AS bit) AS Suspendido,
  suspension.Motivo AS MotivoSuspension,
  suspension.FechaInicio AS FechaInicioSuspension,
  suspension.FechaFin AS FechaFinSuspension,
  suspension.Observacion AS ObservacionSuspension
`;

export async function getSuspensionesVigentes(pool: any, institucionId: number, estudianteIds: number[]) {
  const ids = Array.from(new Set((estudianteIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)));

  if (!ids.length) return [];

  const request = pool.request()
    .input("institucionId", sql.Int, institucionId);
  ids.forEach((id, index) => request.input(`id${index}`, sql.Int, id));

  const result = await request.query(`
    SELECT
      s.EstudianteSuspensionId,
      s.EstudianteId,
      s.Motivo,
      s.FechaInicio,
      s.FechaFin,
      s.Observacion
    FROM dbo.EstudianteSuspension s
    WHERE s.InstitucionId = @institucionId
      AND s.EstudianteId IN (${ids.map((_, index) => `@id${index}`).join(", ")})
      AND s.Activo = 1
      AND CONVERT(date, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') >= s.FechaInicio
      AND CONVERT(date, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'Central America Standard Time') <= s.FechaFin
  `);

  return result.recordset || [];
}

export async function assertNoSuspendedStudents(pool: any, institucionId: number, estudianteIds: number[]) {
  const suspensiones = await getSuspensionesVigentes(pool, institucionId, estudianteIds);
  const ids = Array.from(new Set((estudianteIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return null;
  const request = pool.request().input("institucionId", sql.Int, institucionId);
  ids.forEach((id, index) => request.input(`estadoId${index}`, sql.Int, id));
  const estadoResult = await request.query(`
    SELECT EstudianteId
    FROM dbo.Estudiante
    WHERE InstitucionId = @institucionId
      AND Activo = 0
      AND EstudianteId IN (${ids.map((_, index) => `@estadoId${index}`).join(", ")})
  `);
  const inactivos = (estadoResult.recordset || []).map((row: any) => Number(row.EstudianteId));
  if (!suspensiones.length && !inactivos.length) return null;

  const detalle = suspensiones.map((item: any) =>
    `${item.EstudianteId}: ${item.Motivo} hasta ${String(item.FechaFin || "").slice(0, 10)}`
  ).concat(inactivos.map((id: number) => `${id}: estudiante inactivo`)).join(" | ");

  return {
    message: `No se puede realizar la gestión: hay estudiante(s) suspendido(s) o inactivo(s). ${detalle}`,
    suspensiones,
    inactivos
  };
}
