import { sql } from "../../config/database";

export const MOTIVOS_SUSPENSION_ESTUDIANTE = new Set([
  "Medida Precautoria",
  "Acción Correctiva",
  "Accion Correctiva"
]);

export function normalizeSuspensionMotivo(value: any) {
  const text = String(value || "").trim();
  if (text === "Accion Correctiva") return "Acción Correctiva";
  return text;
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
        AND CONVERT(date, SYSDATETIME()) >= s.FechaInicio
        AND CONVERT(date, SYSDATETIME()) <= s.FechaFin
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
      AND CONVERT(date, SYSDATETIME()) >= s.FechaInicio
      AND CONVERT(date, SYSDATETIME()) <= s.FechaFin
  `);

  return result.recordset || [];
}

export async function assertNoSuspendedStudents(pool: any, institucionId: number, estudianteIds: number[]) {
  const suspensiones = await getSuspensionesVigentes(pool, institucionId, estudianteIds);
  if (!suspensiones.length) return null;

  const detalle = suspensiones.map((item: any) =>
    `${item.EstudianteId}: ${item.Motivo} hasta ${String(item.FechaFin || "").slice(0, 10)}`
  ).join(" | ");

  return {
    message: `No se puede realizar la gestión: hay estudiante(s) suspendido(s). ${detalle}`,
    suspensiones
  };
}
