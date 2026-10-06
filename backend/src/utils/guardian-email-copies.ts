import { sql } from "../config/database";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export async function getGuardianEmailCopiesByStudent(
  pool: any,
  estudianteIds: number[]
): Promise<Map<number, string[]>> {
  const ids = [...new Set(estudianteIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const copies = new Map<number, string[]>();
  if (!ids.length) return copies;

  const request = pool.request();
  const placeholders = ids.map((id, index) => {
    const key = `estudianteId${index}`;
    request.input(key, sql.Int, id);
    return `@${key}`;
  });
  const result = await request.query(`
    SELECT DISTINCT ee.EstudianteId, LTRIM(RTRIM(en.Correo)) AS Correo
    FROM dbo.EstudianteEncargado ee
    INNER JOIN dbo.Encargado en ON en.EncargadoId = ee.EncargadoId
    WHERE ee.EstudianteId IN (${placeholders.join(", ")})
      AND ISNULL(ee.Activo, 1) = 1
      AND ISNULL(en.Activo, 1) = 1
      AND ISNULL(ee.AceptaCorreo, 0) = 1
      AND NULLIF(LTRIM(RTRIM(ISNULL(en.Correo, N''))), N'') IS NOT NULL
  `);

  for (const row of result.recordset || []) {
    const estudianteId = Number(row.EstudianteId);
    const correo = String(row.Correo || "").trim();
    if (!EMAIL_PATTERN.test(correo)) continue;
    const list = copies.get(estudianteId) || [];
    if (!list.some((existing) => existing.toLowerCase() === correo.toLowerCase())) list.push(correo);
    copies.set(estudianteId, list);
  }
  return copies;
}

export function mergeEmailCopies(
  estudianteCorreo: string | null | undefined,
  ...groups: Array<string | string[] | null | undefined>
): string[] {
  const excluded = String(estudianteCorreo || "").trim().toLowerCase();
  const unique = new Map<string, string>();
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : [group]) {
      const correo = String(item || "").trim();
      const key = correo.toLowerCase();
      if (!EMAIL_PATTERN.test(correo) || key === excluded || unique.has(key)) continue;
      unique.set(key, correo);
    }
  }
  return [...unique.values()];
}
