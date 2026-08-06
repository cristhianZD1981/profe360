import { sql } from "../../config/database";

let schemaCache: { ready: boolean; checkedAt: number } | null = null;
let estadosVersion = 0;
const SCHEMA_CACHE_MS = 30_000;

export async function hasProfesorPeriodoSchema(pool: any, force = false) {
  if (!force && schemaCache && Date.now() - schemaCache.checkedAt < SCHEMA_CACHE_MS) {
    return schemaCache.ready;
  }

  const result = await pool.request().query(`
    SELECT CAST(CASE
      WHEN OBJECT_ID(N'dbo.ProfesorPeriodoEstado', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.ProfesorPeriodoEstadoHistorial', N'U') IS NOT NULL
      THEN 1 ELSE 0 END AS bit) AS Ready
  `);
  const ready = Boolean(result.recordset[0]?.Ready);
  schemaCache = { ready, checkedAt: Date.now() };
  return ready;
}

export function getProfesorPeriodoEstadosVersion() {
  return estadosVersion;
}

export function bumpProfesorPeriodoEstadosVersion() {
  estadosVersion += 1;
}

export async function isPeriodoProfesorHabilitado(params: {
  pool: any;
  institucionId: number;
  usuarioId: number;
  periodoId: number;
}) {
  if (!await hasProfesorPeriodoSchema(params.pool)) return true;

  const result = await params.pool.request()
    .input("institucionId", sql.Int, params.institucionId)
    .input("usuarioId", sql.Int, params.usuarioId)
    .input("periodoId", sql.Int, params.periodoId)
    .query(`
      SELECT CAST(CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.ProfesorPeriodoEstado ppe
        WHERE ppe.InstitucionId = @institucionId
          AND ppe.UsuarioId = @usuarioId
          AND ppe.PeriodoId = @periodoId
          AND ppe.Habilitado = 0
      ) THEN 0 ELSE 1 END AS bit) AS Habilitado
    `);

  return Boolean(result.recordset[0]?.Habilitado);
}
