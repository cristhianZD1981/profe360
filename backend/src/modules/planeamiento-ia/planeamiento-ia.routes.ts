import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, HeadingLevel, BorderStyle, PageOrientation, TableLayoutType } from "docx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest, forbidden } from "../../utils/http";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const planeamientoUpload = upload.any();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

type EstadoProgresoOperacion = "procesando" | "completado" | "error";

type ProgresoOperacion = {
  porcentaje: number;
  etapa: string;
  estado: EstadoProgresoOperacion;
  actualizadoEn: number;
  usoIa?: UsoIaOperacion;
};

const progresoOperaciones = new Map<string, ProgresoOperacion>();
const PROGRESO_OPERACION_TTL_MS = 30 * 60 * 1000;
const SQL_COSTA_RICA_NOW = "CONVERT(datetime2(3), SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time')";
type UsoIaLlamada = {
  etapa: string;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duracionMs: number;
};

type UsoIaOperacion = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duracionMs: number;
  llamadas: UsoIaLlamada[];
};

function normalizeOperacionId(value: unknown) {
  const operacionId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,120}$/.test(operacionId) ? operacionId : "";
}

function limpiarProgresosExpirados() {
  const limite = Date.now() - PROGRESO_OPERACION_TTL_MS;
  for (const [operacionId, progreso] of progresoOperaciones.entries()) {
    if (progreso.actualizadoEn < limite) progresoOperaciones.delete(operacionId);
  }
}

function actualizarProgresoOperacion(
  operacionId: string,
  porcentaje: number,
  etapa: string,
  estado: EstadoProgresoOperacion = "procesando"
) {
  if (!operacionId) return;
  limpiarProgresosExpirados();
  const anterior = progresoOperaciones.get(operacionId);
  const porcentajeNormalizado = Math.max(
    anterior?.porcentaje || 0,
    Math.min(100, Math.max(0, Math.round(porcentaje)))
  );
  progresoOperaciones.set(operacionId, {
    porcentaje: porcentajeNormalizado,
    etapa,
    estado,
    actualizadoEn: Date.now(),
    usoIa: anterior?.usoIa
  });
}

function registrarUsoIaOperacion(
  operacionId: string,
  etapa: string,
  modelo: string,
  usage: any,
  duracionMs: number
) {
  if (!operacionId || !usage) return;
  limpiarProgresosExpirados();
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? (inputTokens + outputTokens)) || 0;
  const anterior = progresoOperaciones.get(operacionId) || {
    porcentaje: 0,
    etapa: "Procesando con IA",
    estado: "procesando" as EstadoProgresoOperacion,
    actualizadoEn: Date.now()
  };
  const llamada: UsoIaLlamada = {
    etapa,
    modelo,
    inputTokens,
    outputTokens,
    totalTokens,
    duracionMs: Math.max(0, Math.round(duracionMs || 0))
  };
  const llamadas = [...(anterior.usoIa?.llamadas || []), llamada];
  progresoOperaciones.set(operacionId, {
    ...anterior,
    actualizadoEn: Date.now(),
    usoIa: {
      inputTokens: llamadas.reduce((total, item) => total + item.inputTokens, 0),
      outputTokens: llamadas.reduce((total, item) => total + item.outputTokens, 0),
      totalTokens: llamadas.reduce((total, item) => total + item.totalTokens, 0),
      duracionMs: llamadas.reduce((total, item) => total + item.duracionMs, 0),
      llamadas
    }
  });
}

function obtenerUsoIaOperacion(operacionId: string): UsoIaOperacion | null {
  return operacionId ? progresoOperaciones.get(operacionId)?.usoIa || null : null;
}

function marcarErrorProgreso(operacionId: string, etapa: string) {
  if (!operacionId) return;
  const anterior = progresoOperaciones.get(operacionId);
  actualizarProgresoOperacion(operacionId, anterior?.porcentaje || 0, etapa, "error");
}

function crearProgresoGuardado(body: any) {
  const total = Math.min(50, Math.max(1, Number(body?.totalGuardados) || 1));
  const indice = Math.min(total - 1, Math.max(0, Number(body?.indiceGuardado) || 0));
  const inicio = 5 + ((indice / total) * 90);
  const fin = 5 + (((indice + 1) / total) * 90);
  const porcentaje = (avance: number) => Math.round(inicio + ((fin - inicio) * Math.min(1, Math.max(0, avance))));
  const sufijo = total > 1 ? ` (${indice + 1}/${total})` : "";
  return { total, indice, porcentaje, sufijo };
}

router.get("/progreso/:operacionId", (req, res) => {
  limpiarProgresosExpirados();
  const operacionId = normalizeOperacionId(req.params.operacionId);
  if (!operacionId) return badRequest(res, "El identificador de la operación no es válido");

  return ok(res, progresoOperaciones.get(operacionId) || {
    porcentaje: 0,
    etapa: "Esperando que inicie la operación",
    estado: "procesando"
  });
});

type AuthUser = {
  userId?: number;
  usuarioId?: number;
  institucionId?: number | null;
  roles: string[];
};

type HabilidadRow = {
  Materia?: string;
  Colegio?: string;
  Ciclo?: string;
  Grado?: string;
  mes?: string;
  Mes?: string;
  Area?: string;
  "Numero de Habilidad"?: string | number;
  NumeroHabilidad?: string | number;
  "Descripcion de la Habilidad"?: string;
  DescripcionHabilidad?: string;
  "Documento de referencia "?: string;
  DocumentoReferencia?: string;
};

type PlantillaFormatoDocxGuardada = {
  nombre: string;
  mimeType: string;
  base64: string;
};

type ImagenApoyoIA = {
  nombre: string;
  mimeType: string;
  base64: string;
};

type PerfilEstrategiasReferencia = {
  encabezados: string[];
  cantidadParrafos: number;
  cantidadCaracteres: number;
  cantidadActividadesNumeradas: number;
  cantidadPreguntas: number;
  usaTemasNumerados: boolean;
  usaActividadesNumeradas: boolean;
  nivelDetalle: "breve" | "medio" | "amplio";
  descripcion: string;
};

type TemplateContentRole = "aprendizajes" | "saberes" | "criterios" | "estrategias" | "indicadores" | "tiempo";

type ColumnaReferencia = {
  indice: number;
  encabezado: string;
  rol: TemplateContentRole | null;
};

type CampoVariableReferencia = {
  etiqueta: string;
  valorAnterior: string;
};

export type SeccionModeloReferencia = {
  id: string;
  etiqueta: string;
  indiceTabla: number;
  indiceFilaEncabezado: number;
  columnas: ColumnaReferencia[];
  roles: Array<TemplateContentRole | null>;
  estrategiasTexto: string;
  encabezadosEstrategias: string[];
};

export type PerfilDocumentoReferencia = {
  esDocx: boolean;
  cantidadTablas?: number;
  // Topología física del documento. Esta es la fuente de verdad para saber
  // si la exportación agregó o eliminó filas; el conteo semántico puede variar
  // por celdas combinadas o rótulos de cierre repetidos por Word.
  filasFisicasPorTabla?: number[];
  columnas: ColumnaReferencia[];
  camposVariables: CampoVariableReferencia[];
  estrategiasTexto: string;
  encabezadosEstrategias: string[];
  valoresContenidoAnterior: string[];
  cantidadSeccionesContenido: number;
  cantidadBloquesContenido?: number;
  seccionesModelo: SeccionModeloReferencia[];
  descripcion: string;
};

type AuditoriaSemanticaPlaneamiento = {
  disponible: boolean;
  cumple: boolean;
  incumplimientos: string[];
  fortalezas: string[];
};

let planeamientoHabilidadOwnershipColumnsEnsured = false;
let planeamientoHabilidadDisponibilidadEnsured = false;
let planeamientoHabilidadDisponibilidadPromise: Promise<void> | null = null;

function getAuth(req: any): AuthUser {
  return req.auth || { roles: [] };
}

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return auth.roles?.some((role) => roles.includes(role));
}

function canMaintainHabilidades(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function canMaintainAnyHabilidad(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.usuarioId || auth.userId || 0);
}

function getInstitutionId(req: any, res: any) {
  const institucionId = getAuth(req).institucionId ?? null;

  if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }

  return Number(institucionId);
}

const WINDOWS_1252_CONTROL_CHARS: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ"
};

const MOJIBAKE_FIX_CHARS = Array.from(
  "áéíóúÁÉÍÓÚñÑüÜ¿¡°ªºàèìòùÀÈÌÒÙäëïöüÄËÏÖÜçÇâêîôûÂÊÎÔÛ–—…“”‘’•€™"
);

function decodeBufferAsWindows1252(buffer: Buffer) {
  return Array.from(buffer)
    .map((byte) => WINDOWS_1252_CONTROL_CHARS[byte] || String.fromCharCode(byte))
    .join("");
}

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = (() => {
  const replacements: Array<[string, string]> = [];
  const seen = new Set<string>();

  for (const char of MOJIBAKE_FIX_CHARS) {
    const utf8Bytes = Buffer.from(char, "utf8");
    const variants = [
      utf8Bytes.toString("latin1"),
      decodeBufferAsWindows1252(utf8Bytes)
    ];

    for (const variant of variants) {
      if (variant && variant !== char && !seen.has(variant)) {
        replacements.push([variant, char]);
        seen.add(variant);
      }
    }
  }

  return replacements.sort((a, b) => b[0].length - a[0].length);
})();

function repararMojibakeTexto(value: any) {
  let text = String(value ?? "");
  if (!/[ÃÂâ]|[\u0080-\u009F]/.test(text)) return text;

  for (let pass = 0; pass < 2; pass += 1) {
    let fixed = text;
    for (const [badText, goodText] of MOJIBAKE_REPLACEMENTS) {
      fixed = fixed.split(badText).join(goodText);
    }
    if (fixed === text) break;
    text = fixed;
  }

  return text;
}

function normalizeText(value: any) {
  return repararMojibakeTexto(value).trim();
}

function normalizeNullableText(value: any) {
  const text = normalizeText(value);
  return text.length ? text : null;
}

function limitNullableText(value: any, maxLength: number) {
  const text = normalizeNullableText(value);
  if (!text) return null;
  return text.slice(0, maxLength);
}

function limitRequiredText(value: any, maxLength: number) {
  return normalizeText(value).slice(0, maxLength);
}

function normalizeForCompare(value: any) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function inferGradoNumero(value: any): number | null {
  const normalized = normalizeForCompare(value);
  if (!normalized) return null;

  const match = normalized.match(/\d{1,2}/);
  if (match) {
    const numero = Number(match[0]);
    if (numero >= 1 && numero <= 12) return numero;
  }

  if (normalized.includes("SETIMO") || normalized.includes("SEPTIMO")) return 7;
  if (normalized.includes("OCTAVO")) return 8;
  if (normalized.includes("NOVENO")) return 9;

  if (normalized.includes("PRIMER")) return 1;
  if (normalized.includes("SEGUND")) return 2;
  if (normalized.includes("TERCER")) return 3;
  if (normalized.includes("CUART")) return 4;
  if (normalized.includes("QUINT")) return 5;
  if (normalized.includes("SEXT")) return 6;

  // Importante: undécimo y duodécimo contienen la palabra "décimo".
  // Por eso se validan antes de décimo, para no cargar habilidades de 10°
  // cuando el grupo realmente es 11° o 12°.
  if (
    normalized.includes("DUODECIMO") ||
    normalized.includes("DUODECIMA") ||
    normalized.includes("DUO DECIMO") ||
    normalized.includes("DUO DECIMA") ||
    normalized.includes("DUIDECIMO") ||
    normalized.includes("DUIDECIMA")
  ) return 12;

  if (normalized.includes("UNDECIMO") || normalized.includes("UNDECIMA")) return 11;

  if (normalized.includes("DECIMO") || normalized.includes("DECIMA")) return 10;

  return null;
}

function getGradoPrefijo(numero: number | null) {
  switch (numero) {
    case 7: return "SEPT";
    case 8: return "OCT";
    case 9: return "NOV";
    case 10: return "DEC";
    case 11: return "UNDEC";
    case 12: return "DUODEC";
    default: return null;
  }
}

function toOptionalInt(value: any) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toRequiredInt(value: any, field: string, res: any) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    badRequest(res, `El campo ${field} es inválido`);
    return null;
  }
  return parsed;
}

function canUseGlobalRows(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN"]);
}

async function ensurePlaneamientoHabilidadOwnershipColumns(pool: any) {
  if (planeamientoHabilidadOwnershipColumnsEnsured) return;
  await pool.request().query(`
    IF COL_LENGTH('dbo.PlaneamientoHabilidad', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlaneamientoHabilidad
      ADD UsuarioCreadorId INT NULL;
    END;
  `);
  planeamientoHabilidadOwnershipColumnsEnsured = true;
}

function cicloEsperadoPorGrado(gradoNumero: number | null) {
  if (!gradoNumero) return null;
  if (gradoNumero >= 1 && gradoNumero <= 3) return "Primer Ciclo";
  if (gradoNumero >= 4 && gradoNumero <= 6) return "Segundo Ciclo";
  if (gradoNumero >= 7 && gradoNumero <= 9) return "Tercer Ciclo";
  if (gradoNumero >= 10 && gradoNumero <= 12) return "Cuarto Ciclo";
  return null;
}

function normalizarGradoConCiclo(gradoValor: any, cicloValor: any) {
  const gradoTexto = normalizeText(gradoValor);
  const cicloTexto = normalizeText(cicloValor);
  let gradoNumero = inferGradoNumero(gradoTexto);
  const cicloClave = normalizeForCompare(cicloTexto);
  // Los códigos históricos 4, 5 y 6 solo representan 10°, 11° y 12°
  // cuando venían marcados explícitamente como Cuarto Ciclo.
  if (cicloClave.includes("CUARTO") && gradoNumero && gradoNumero >= 4 && gradoNumero <= 6) {
    gradoNumero += 6;
  }
  const ciclo = cicloEsperadoPorGrado(gradoNumero);
  if (!gradoNumero || !ciclo) return { error: "El grado debe estar entre 1 y 12" };
  if (cicloTexto && normalizeForCompare(cicloTexto) !== normalizeForCompare(ciclo)) {
    return { error: `El grado ${gradoNumero} corresponde a ${ciclo}` };
  }
  const modalidadGrado = normalizeForCompare(gradoTexto).replace(/\s/g, "").includes("PN") ? "PN" : null;
  return { gradoNumero, ciclo, modalidadGrado, grado: `${gradoNumero}${modalidadGrado ? " PN" : ""}` };
}

function normalizarTipoColegio(value: any) {
  const clave = normalizeForCompare(value);
  if (clave.includes("ACADEM") || clave.includes("CTPA")) return "Académico";
  if (clave.includes("TECNIC")) return "Técnico";
  return "Plan Nacional";
}

function normalizarGradoRespaldo(value: any, cicloValor: any = "") {
  const original = normalizeForCompare(value);
  if (!original) return null;
  const clave = original.replace(/[\s°.]/g, "");
  const modalidadGrado = clave.includes("PN") ? "PN" : null;
  const palabras: Array<[number, string[]]> = [
    [18, ["18"]], [17, ["17"]], [16, ["16"]], [15, ["15"]], [14, ["14"]], [13, ["13"]],
    [12, ["12", "DUODEC", "DUIDEC"]], [11, ["11", "UNDEC"]], [10, ["10", "DECIM"]],
    [9, ["9", "NOVEN"]], [8, ["8", "OCTAV"]], [7, ["7", "SETIM", "SEPTIM"]],
    [6, ["6", "SEXT"]], [5, ["5", "QUINT"]], [4, ["4", "CUART"]],
    [3, ["3", "TERCER"]], [2, ["2", "SEGUND"]], [1, ["1", "PRIMER"]]
  ];
  let gradoNumero = palabras.find(([, prefijos]) => prefijos.some((prefijo) => clave.startsWith(prefijo)))?.[0] || null;
  if (normalizeForCompare(cicloValor).includes("CUARTO") && gradoNumero && gradoNumero >= 4 && gradoNumero <= 6) gradoNumero += 6;
  if (!gradoNumero) return null;
  return {
    gradoNumero,
    modalidadGrado,
    grado: `${gradoNumero}${modalidadGrado ? ` ${modalidadGrado}` : ""}`
  };
}

async function ensurePlaneamientoHabilidadDisponibilidad(pool: any) {
  if (planeamientoHabilidadDisponibilidadEnsured) return;
  if (planeamientoHabilidadDisponibilidadPromise) {
    await planeamientoHabilidadDisponibilidadPromise;
    return;
  }

  planeamientoHabilidadDisponibilidadPromise = (async () => {
    await pool.request().query(`
    IF COL_LENGTH('dbo.PlaneamientoHabilidad', 'DisponibleTodos') IS NULL
    BEGIN
      ALTER TABLE dbo.PlaneamientoHabilidad
      ADD DisponibleTodos BIT NOT NULL
        CONSTRAINT DF_PlaneamientoHabilidad_DisponibleTodos DEFAULT(1);
    END;

    IF OBJECT_ID('dbo.PlaneamientoHabilidadInstitucion', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PlaneamientoHabilidadInstitucion (
        PlaneamientoHabilidadId INT NOT NULL,
        InstitucionId INT NOT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PlaneamientoHabilidadInstitucion_CreatedAt DEFAULT(SYSDATETIME()),
        CONSTRAINT PK_PlaneamientoHabilidadInstitucion PRIMARY KEY (PlaneamientoHabilidadId, InstitucionId),
        CONSTRAINT FK_PlaneamientoHabilidadInstitucion_Habilidad FOREIGN KEY (PlaneamientoHabilidadId)
          REFERENCES dbo.PlaneamientoHabilidad(PlaneamientoHabilidadId),
        CONSTRAINT FK_PlaneamientoHabilidadInstitucion_Institucion FOREIGN KEY (InstitucionId)
          REFERENCES dbo.Institucion(InstitucionId)
      );
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_PlaneamientoHabilidadInstitucion_InstitucionId'
        AND object_id = OBJECT_ID('dbo.PlaneamientoHabilidadInstitucion')
    )
    BEGIN
      CREATE INDEX IX_PlaneamientoHabilidadInstitucion_InstitucionId
      ON dbo.PlaneamientoHabilidadInstitucion (InstitucionId, PlaneamientoHabilidadId);
    END;
    `);
    planeamientoHabilidadDisponibilidadEnsured = true;
  })();

  try {
    await planeamientoHabilidadDisponibilidadPromise;
  } catch (error) {
    planeamientoHabilidadDisponibilidadPromise = null;
    throw error;
  }
}

// La modalidad forma parte del grado. "8" y "8 PN" no son equivalentes:
// mezclar ambas hacía que una habilidad de Plan Nacional apareciera en un
// grupo regular solo porque los dos comparten el número de nivel.
export function normalizarModalidadGrado(value: any): "PN" | null {
  const normalized = normalizeForCompare(value).replace(/\s/g, "");
  return /PN(?:$|[^A-Z])/.test(normalized) ? "PN" : null;
}

function toPositiveIntList(value: any) {
  let normalizedValue = value;
  if (typeof value === "string") {
    try {
      normalizedValue = JSON.parse(value);
    } catch {
      normalizedValue = value.split(",");
    }
  }
  const raw = Array.isArray(normalizedValue) ? normalizedValue : (normalizedValue === null || normalizedValue === undefined ? [] : [normalizedValue]);
  return Array.from(new Set(raw.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
}

async function guardarDisponibilidadHabilidad(pool: any, habilidadId: number, disponibleTodos: boolean, institucionesIds: number[]) {
  if (!disponibleTodos && !institucionesIds.length) {
    throw new Error("Seleccioná al menos un colegio o marcá la disponibilidad para todos");
  }

  if (institucionesIds.length) {
    const request = pool.request();
    institucionesIds.forEach((id, index) => request.input(`institucion${index}`, sql.Int, id));
    const result = await request.query(`
      SELECT COUNT(*) AS Cantidad
      FROM dbo.Institucion
      WHERE InstitucionId IN (${institucionesIds.map((_, index) => `@institucion${index}`).join(", ")})
        AND Activo = 1
    `);
    if (Number(result.recordset[0]?.Cantidad || 0) !== institucionesIds.length) {
      throw new Error("Uno o más colegios seleccionados no están disponibles");
    }
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input("habilidadId", sql.Int, habilidadId)
      .input("disponibleTodos", sql.Bit, disponibleTodos ? 1 : 0)
      .query(`
        UPDATE dbo.PlaneamientoHabilidad
        SET DisponibleTodos = @disponibleTodos, UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoHabilidadId = @habilidadId;

        DELETE FROM dbo.PlaneamientoHabilidadInstitucion
        WHERE PlaneamientoHabilidadId = @habilidadId;
      `);

    if (!disponibleTodos) {
      const request = new sql.Request(transaction).input("habilidadId", sql.Int, habilidadId);
      institucionesIds.forEach((id, index) => request.input(`institucion${index}`, sql.Int, id));
      await request.query(`
        INSERT INTO dbo.PlaneamientoHabilidadInstitucion (PlaneamientoHabilidadId, InstitucionId)
        VALUES ${institucionesIds.map((_, index) => `(@habilidadId, @institucion${index})`).join(", ")};
      `);
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

let plantillaPromptIAColumnsEnsured = false;

async function ensurePlantillaPromptIAVisibilityColumns(pool: any) {
  if (plantillaPromptIAColumnsEnsured) return;
  await pool.request().query(`
    IF COL_LENGTH('dbo.PlantillaPromptIA', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD UsuarioCreadorId INT NULL;
    END;

    IF COL_LENGTH('dbo.PlantillaPromptIA', 'EsPublica') IS NULL
    BEGIN
      ALTER TABLE dbo.PlantillaPromptIA
      ADD EsPublica BIT NOT NULL CONSTRAINT DF_PlantillaPromptIA_EsPublica_planeamiento DEFAULT(1);
    END;
  `);
  plantillaPromptIAColumnsEnsured = true;
}

function monthOrderExpression(alias = "h") {
  return `
    CASE UPPER(${alias}.Mes)
      WHEN N'ENERO' THEN 1
      WHEN N'FEBRERO' THEN 2
      WHEN N'MARZO' THEN 3
      WHEN N'ABRIL' THEN 4
      WHEN N'MAYO' THEN 5
      WHEN N'JUNIO' THEN 6
      WHEN N'JULIO' THEN 7
      WHEN N'AGOSTO' THEN 8
      WHEN N'SETIEMBRE' THEN 9
      WHEN N'SEPTIEMBRE' THEN 9
      WHEN N'OCTUBRE' THEN 10
      WHEN N'NOVIEMBRE' THEN 11
      WHEN N'DICIEMBRE' THEN 12
      ELSE 99
    END
  `;
}

async function findMateriaId(pool: any, institucionId: number, materiaNombre: string) {
  if (!materiaNombre) return null;

  const materiaNormalizada = normalizeForCompare(materiaNombre);
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("materia", sql.NVarChar(200), materiaNombre)
    .input("materiaNormalizada", sql.NVarChar(200), materiaNormalizada)
    .query(`
      SELECT TOP 1 MateriaId
      FROM dbo.Materia
      WHERE InstitucionId = @institucionId
        AND (
          UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI = UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI
          OR UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI + N'%'
          OR UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI + N'%'
        )
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI = UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI THEN 0
          WHEN UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI + N'%' THEN 1
          WHEN UPPER(LTRIM(RTRIM(@materia))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI + N'%' THEN 2
          ELSE 3
        END,
        ABS(LEN(UPPER(LTRIM(RTRIM(Nombre))) COLLATE Latin1_General_100_CI_AI) - LEN(@materiaNormalizada)),
        MateriaId DESC
    `);

  return result.recordset[0]?.MateriaId ?? null;
}

function buildFallbackPlaneamiento(input: {
  materiaNombre: string;
  tipoColegio: string;
  grado: string;
  mes: string;
  tema: string;
  semanas: number;
  habilidades: any[];
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
  plantillaFormatoTexto?: string;
  plantillaFormatoNombre?: string;
  indicacionesDocente?: string;
  idiomaSalida?: "es" | "en";
  usaMachote?: boolean;
  cantidadImagenes?: number;
  nombrePlaneamiento?: string;
  estrategiasReferencia?: string;
  estructuraEstrategiasReferencia?: string[];
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
}) {
  const permiteMultiplesIndicadores = permiteMultiplesIndicadoresPorHabilidad(input.indicacionesDocente || "");
  const habilidadesSeleccionadas = input.habilidades.map((h) => {
    const numero = h.NumeroHabilidad ? `${h.NumeroHabilidad}: ` : "";
    return `${numero}${h.DescripcionHabilidad || input.tema || "habilidad seleccionada"}`;
  });

  const problemaReal = construirProblemaRealMomento1(habilidadesSeleccionadas, input.materiaNombre, input.grado, input.tema);

  const indicadoresEvaluacion = habilidadesSeleccionadas.flatMap((descripcion) => {
    const base = `Resuelve situaciones contextualizadas relacionadas con ${descripcion}, explicando su procedimiento de forma clara.`;
    if (!permiteMultiplesIndicadores) return [base];
    return [
      base,
      `Resuelve situaciones matemáticas vinculadas con ${descripcion} usando estrategias pertinentes.`,
      `Comunica resultados y justifica decisiones asociadas con ${descripcion}.`
    ];
  });

  const estructuraReferencia = input.perfilEstrategiasReferencia?.encabezados?.length
    ? input.perfilEstrategiasReferencia.encabezados
    : (input.estructuraEstrategiasReferencia || []);
  const estrategiasMediacion = String(input.estrategiasReferencia || "").trim()
    ? (
      estructuraReferencia.length
        ? estructuraReferencia.map((encabezado, index) =>
          `${encabezado}\nActividad ${index + 1}. El estudiantado desarrolla acciones nuevas y observables vinculadas con ${habilidadesSeleccionadas[index % Math.max(1, habilidadesSeleccionadas.length)] || input.tema || "la habilidad seleccionada"}, siguiendo la profundidad y secuencia pedagógica del documento de referencia.`
        )
        : [
            `Actividad de mediación. ${problemaReal}`,
            "El estudiantado desarrolla acciones nuevas según la organización narrativa del documento de referencia, con acompañamiento docente, producción de evidencias y retroalimentación."
          ]
    )
    : [
        `Momento 1: Propuesta del problema. ${problemaReal}`,
        "Momento 2: Trabajo estudiantil independiente. El estudiantado trabaja de forma individual, en parejas o en pequeños grupos, explorando estrategias, representaciones, dibujos, tablas, cálculos o recursos concretos/digitales para buscar una solución al problema planteado.",
        "Momento 3: Discusión interactiva y comunicativa. Se socializan procedimientos, se comparan estrategias, se justifican respuestas y se formalizan los conocimientos necesarios, promoviendo el vocabulario de la materia y la argumentación.",
        "Momento 4: Clausura o cierre. Se sistematizan los aprendizajes, se aclaran errores frecuentes, se relacionan los resultados con la habilidad trabajada y se deja una evidencia breve del aprendizaje alcanzado.",
        "Etapa 2: Movilización y aplicación de los conocimientos. Se proponen nuevos retos, prácticas, tareas o productos donde el estudiantado aplique lo aprendido en situaciones variadas, con realimentación docente y seguimiento del trabajo cotidiano."
      ];

  const semanas = Array.from({ length: Math.max(1, input.semanas || 4) }).map((_, index) => {
    const habilidad = input.habilidades[index % Math.max(1, input.habilidades.length)] || input.habilidades[0];
    const descripcion = habilidad?.DescripcionHabilidad || input.tema || "habilidad seleccionada";

    return {
      semana: index + 1,
      habilidadBase: descripcion,
      proposito: `Desarrollar la habilidad específica relacionada con: ${descripcion}`,
      mediacionPedagogica: estrategiasMediacion,
      indicadores: [
        `Identifica información relevante relacionada con ${descripcion} en una situación contextualizada.`,
        `Resuelve situaciones matemáticas vinculadas con ${descripcion}, aplicando procedimientos adecuados.`,
        `Comunica y justifica los procedimientos utilizados para abordar ${descripcion}.`
      ],
      trabajoCotidiano: [
        "Participación en la resolución de problemas durante la clase.",
        "Registro ordenado de procedimientos, representaciones y conclusiones.",
        "Trabajo colaborativo y comunicación de estrategias matemáticas."
      ],
      tareas: [
        "Práctica contextualizada para reforzar la habilidad trabajada.",
        "Actividad de aplicación en un contexto familiar, institucional o comunal."
      ],
      evaluacionSugerida: {
        cotidiano: "Lista de cotejo o escala de desempeño sobre participación, razonamiento, comunicación matemática y uso de procedimientos.",
        tarea: "Revisión de práctica con retroalimentación formativa.",
        prueba: "Ítems de aplicación, resolución de problemas, representación y justificación del procedimiento."
      },
      recursos: [
        "Programa de estudio vigente",
        "Material concreto o digital según disponibilidad",
        "Cuaderno, pizarra, guías de práctica y recursos del contexto"
      ]
    };
  });

  return {
    nombre: `Planeamiento ${input.materiaNombre || "materia"} - ${input.grado || "grado"} - ${input.mes || "mes"}`,
    enfoque: "Resolución de problemas, contextualización y mediación pedagógica basada en habilidades específicas.",
    advertencia: "Borrador generado con apoyo de IA. Debe ser revisado y ajustado por la persona docente según su grupo, contexto institucional y lineamientos vigentes del MEP.",
    aprendizajesEsperados: habilidadesSeleccionadas,
    estrategiasMediacion,
    indicadoresEvaluacion,
    competenciasGenerales: [
      "Competencias para la ciudadanía responsable y solidaria",
      "Competencias para la vida: sociales, emocionales y de aprendizaje",
      "Competencias para el empleo digno y el emprendimiento"
    ],
    reflexionesDocentes: {
      queFunciono: "",
      queNoFunciono: "",
      quePuedoMejorar: ""
    },
    observaciones: "",
    semanas
  };
}

function buildPrompt(input: {
  materiaNombre: string;
  tipoColegio: string;
  grado: string;
  mes: string;
  tema: string;
  semanas: number;
  habilidades: any[];
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
  plantillaFormatoTexto?: string;
  plantillaFormatoNombre?: string;
  indicacionesDocente?: string;
  idiomaSalida?: "es" | "en";
  usaMachote?: boolean;
  cantidadImagenes?: number;
  nombrePlaneamiento?: string;
  estrategiasReferencia?: string;
  estructuraEstrategiasReferencia?: string[];
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
}) {
  const habilidadesText = input.habilidades.map((h, index) => (
    `${index + 1}. Área: ${h.Area || "No indicada"}. Mes: ${h.Mes || "No indicado"}. Número ${h.NumeroHabilidad || ""}: ${h.DescripcionHabilidad || ""}. Documento referencia: ${h.DocumentoReferencia || "No indicado"}`
  )).join("\n");
  const usaReferenciaEstrategias = Boolean(String(input.estrategiasReferencia || "").trim());
  const reglasEstructuraPredeterminada = usaReferenciaEstrategias
    ? instruccionPerfilEstrategiasReferencia(input)
    : `
ESTRUCTURA PEDAGÓGICA PREDETERMINADA (solo porque no se adjuntó referencia):
- Momento 1: Propuesta del problema.
- Momento 2: Trabajo estudiantil independiente.
- Momento 3: Discusión interactiva y comunicativa.
- Momento 4: Clausura o cierre.
- Etapa 2: Movilización y aplicación de los conocimientos.
En Momento 1 incluí actor real, objetivo, dos alternativas comparables y criterio explícito de decisión. En los demás momentos describí acciones observables concretas.
`.trim();
  const ejemploEstrategias = usaReferenciaEstrategias
    ? (
      input.perfilEstrategiasReferencia?.encabezados?.length
        ? input.perfilEstrategiasReferencia.encabezados.map((encabezado) => `"${encabezado}\\nContenido nuevo según la referencia..."`).join(",\n    ")
        : "\"Bloques nuevos organizados exactamente como la referencia adjunta...\""
    )
    : [
        "\"Momento 1: Propuesta del problema...\"",
        "\"Momento 2: Trabajo estudiantil independiente...\"",
        "\"Momento 3: Discusión interactiva y comunicativa...\"",
        "\"Momento 4: Clausura o cierre...\"",
        "\"Etapa 2: Movilización y aplicación de los conocimientos...\""
      ].join(",\n    ");

  return `
Sos especialista en didáctica y evaluación de ${input.materiaNombre || "la materia seleccionada"} para ${input.grado || "el nivel seleccionado"}, dentro del currículo del MEP de Costa Rica. Aplicá vocabulario, progresión conceptual, mediación y evaluación propios de esa materia y nivel.

Generá un planeamiento profesional, editable y aplicable al aula. Cuando exista un planeamiento de referencia, su lógica y estructura específica tienen prioridad sobre cualquier formato genérico.
Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
- Nombre obligatorio del planeamiento: ${input.nombrePlaneamiento || "Proponer un nombre claro según el mes, grado y materia."}
- Grado: ${input.grado || "No indicado"}
- Mes: ${input.mes || "No indicado"}
- Tema o énfasis: ${input.tema || "No indicado"}
- Cantidad de semanas: ${input.semanas || 4}
- Documento de apoyo mandatorio si fue adjuntado: ${input.documentoApoyoNombre || "No adjuntado"}
- Plantilla o formato de salida opcional: ${input.plantillaFormatoNombre || "No adjuntado"}

Indicaciones, consideraciones o premisas del docente:
${input.indicacionesDocente || "No se indicaron premisas adicionales."}

IMPORTANTE SOBRE LAS INDICACIONES DEL DOCENTE:
Las indicaciones del docente tienen prioridad sobre la plantilla general.
Si las indicaciones del docente piden usar un ejemplo específico, una página o un formato tomado del Documento de apoyo, debés aplicarlo explícitamente y de forma mandatoria en la respuesta.
Si se adjuntó Documento de apoyo, imagen o archivo adicional, su uso es obligatorio para enriquecer el apartado indicado por la persona docente; no lo trates como material opcional.
Si el docente solicita adecuación significativa, color, resaltado o cualquier condición especial, debe reflejarse explícitamente en el JSON final.
Si solicita adecuación curricular significativa, generá una adaptación sustantiva al nivel de competencia indicado por la persona docente, con problema, procedimiento, recurso, producto y evidencia diferenciados; no repitás las habilidades completas del grado regular como actividad reducida.
Si el docente pide pintar o resaltar una sección en azul, devolvé colorResaltado = "azul" en el objeto correspondiente y agregá el marcador [AZUL] al inicio del texto visible.
Si el docente indica página(s), ejercicio(s), capítulo(s) o sección(es) concretas del documento de apoyo, tomalas de forma literal y citá en el contenido generado la referencia exacta (por ejemplo: "página 12, ejercicio 4").
Si no se aportan indicaciones y/o documento de apoyo, generá el planeamiento con los datos disponibles sin bloquear la salida.
No ignorés esta sección.

${instruccionCantidadIndicadores(input.indicacionesDocente || "", input.habilidades)}

Habilidades específicas seleccionadas:
${habilidadesText}

Documento de apoyo aportado por la persona docente:
${String(input.documentoApoyoTexto || "No se aportó documento de apoyo adicional.").slice(0, 24000)}

Plantilla o formato de salida aportado por la persona docente:
${input.plantillaFormatoTexto || "No se aportó una plantilla de formato adicional."}

Estrategias de mediación identificadas en el planeamiento de referencia:
${input.estrategiasReferencia || "No se identificó una sección de estrategias en el archivo de referencia."}

${instruccionesObligatoriasPlaneamiento(input)}

${instruccionPerfilDocumentoReferencia(input.perfilDocumentoReferencia)}

INSTRUCCIÓN PRIORITARIA SOBRE FORMATO:
Si se aportó una plantilla o formato de salida, usalo como referencia principal para el orden, nombres de secciones, tablas, encabezados y nivel de detalle del planeamiento. El documento de apoyo es solo contexto; no reemplaza el formato de salida. Mantené siempre JSON válido para que el sistema pueda guardar y exportar el planeamiento.

INSTRUCCIÓN PRIORITARIA SOBRE ESTRATEGIAS DE MEDIACIÓN:
Si se adjuntó un planeamiento de referencia, analizá su sección de Estrategias de mediación y reproducí obligatoriamente su estructura, encabezados, orden, secuencia pedagógica, nivel de detalle y forma de organizar los momentos. Conservá los tipos pedagógicos generales, pero redactá de nuevo los nombres de actividades, consignas, preguntas, ejercicios, ejemplos, recursos concretos y productos para las habilidades actuales. Nunca copies contenido sustantivo del plan anterior. La secuencia obligatoria identificada es: ${(input.estructuraEstrategiasReferencia || []).join(" → ") || "la que aparece en el documento de referencia"}. No la sustituyás por una estructura genérica de Momentos ni interpretés números internos o códigos del Word como encabezados.

${reglasEstructuraPredeterminada}

Criterios obligatorios para construir la respuesta:
1. Las estrategias deben seguir la lógica pedagógica propia de la materia y, si existe referencia, la lógica observable de ese documento.
2. Los contextos, recursos, productos y dinámicas deben ser pertinentes para la materia, el nivel y las habilidades seleccionadas.
3. No impongás una secuencia fija distinta de la referencia adjunta.
4. Los indicadores deben estar redactados en tercera persona singular.
5. Cada indicador debe enfocarse en una única conducta observable.
6. Cada indicador debe responder a la estructura: Acción observable + conocimiento específico + condición o contexto.
7. Las actividades deben permitir seguimiento del trabajo cotidiano, tareas, prácticas, pruebas, proyectos u otros instrumentos.
8. El texto debe ser formal, claro, docente y costarricense.
9. No inventés normativa oficial específica ni citas textuales. Si falta información, proponé una versión razonable como borrador editable.
10. Las estrategias de mediación e indicadores deben alinearse directamente con las habilidades seleccionadas.
11. En "indicadoresEvaluacion", generá por defecto UN (1) indicador por cada habilidad seleccionada. Solo generá más de uno por habilidad si en las indicaciones del docente se solicita explícitamente. Si hay múltiples para una misma habilidad, numeralos como 1.1, 1.2, 1.3, etc.
12. No incluyás el texto "Enfoque:" dentro de "estrategiasMediacion". El enfoque va únicamente en el campo "enfoque".
13. Si se adjunta Documento de apoyo, imagen o archivo adicional, debés usarlo de forma mandatoria para enriquecer el apartado indicado por la persona docente; si además pide un ejemplo o copiar literal un ejercicio de una página concreta, debés hacerlo de forma explícita.
14. Si faltan Indicaciones y/o Documento de apoyo, construí el planeamiento únicamente con los datos disponibles sin bloquear la generación.
15. En "estrategiasMediacion" no incluyás líneas que inicien con "Enfoque:".
16. En "indicadoresEvaluacion" no iniciés ningún indicador con "Identifica y aplica".
17. El campo "observaciones" debe quedar como string vacío: "".
18. Evitá repetir siempre el mismo escenario (por ejemplo, municipalidad). Variá el actor y el contexto según materia, grado, tema y habilidades.
19. Evitá frases genéricas; describí acciones observables concretas que el estudiantado realizará.
20. Igualá el nivel de desarrollo de la referencia: no resumas un documento amplio en cuatro párrafos breves.
21. En "semanas", generá exactamente ${input.semanas || 4} bloque(s) distintos y progresivos. No repitás el mismo conjunto de actividades en semanas diferentes.
22. Distribuí las habilidades, indicadores y estrategias entre las semanas. Una habilidad puede continuar, pero su actividad, producto y evidencia deben avanzar y no ser una copia literal.
23. En "camposPedagogicos" completá los apartados variables propios de cada bloque del machote, por ejemplo Grammar & Sentence Frames, Vocabulary, Phonology, Function, Discourse Markers, Psychosocial o Sociocultural. Usá el rótulo visible del Word y contenido nuevo; nunca conservés ejemplos sustantivos del planeamiento anterior.

Devolvé SOLO JSON válido, sin markdown, con esta estructura exacta:

{
  "nombre": "Tercer ciclo - I Trimestre 2026",
  "enfoque": "Texto breve del enfoque metodológico",
  "advertencia": "Borrador generado con apoyo de IA y sujeto a revisión docente",
  "competenciasGenerales": [
    "Competencias para la ciudadanía responsable y solidaria",
    "Competencias para la vida: sociales, emocionales y de aprendizaje",
    "Competencias para el empleo digno y el emprendimiento"
  ],
  "aprendizajesEsperados": [
    "1: ...",
    "2: ..."
  ],
  "saberesEsenciales": [
    "Conceptos, procedimientos y actitudes nuevos vinculados con cada aprendizaje..."
  ],
  "criteriosEvaluacion": [
    "Criterio directamente relacionado con cada aprendizaje o habilidad..."
  ],
  "estrategiasMediacion": [
    ${ejemploEstrategias}
  ],
  "indicadoresEvaluacion": [
    "Identifica...",
    "Representa...",
    "Calcula...",
    "Evalúa..."
  ],
  "trabajoCotidiano": [
    "Evidencia o actividad para seguimiento cotidiano..."
  ],
  "tareas": [
    "Tarea sugerida..."
  ],
  "evaluacionSugerida": [
    "Instrumento o criterio sugerido..."
  ],
  "recursos": [
    "Recursos sugeridos..."
  ],
  "semanas": [
    {
      "semana": 1,
      "habilidadBase": "...",
      "proposito": "...",
      "mediacionPedagogica": ["..."],
      "indicadores": ["..."],
      "camposPedagogicos": [
        { "campo": "Vocabulary", "valores": ["Vocabulario nuevo y pertinente para esta semana"] }
      ]
    }
  ],
  "reflexionesDocentes": {
    "queFunciono": "",
    "queNoFunciono": "",
    "quePuedoMejorar": ""
  },
  "camposReferencia": {
    ${input.perfilDocumentoReferencia?.camposVariables?.some((campo) => !esCampoMetadataFijo(campo.etiqueta))
      ? input.perfilDocumentoReferencia.camposVariables
          .filter((campo) => !esCampoMetadataFijo(campo.etiqueta))
          .map((campo) => `${JSON.stringify(campo.etiqueta)}: "Valor nuevo correspondiente al planeamiento actual"`)
          .join(",\n    ")
      : ""}
  },
  "observaciones": "Observaciones editables del docente"
}`;
}



async function buildPromptDesdeBD(pool: any, input: {
  materiaNombre: string;
  tipoColegio: string;
  grado: string;
  mes: string;
  tema: string;
  semanas: number;
  habilidades: any[];
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
  plantillaFormatoTexto?: string;
  plantillaFormatoNombre?: string;
  plantillaPromptIAId?: number | null;
  indicacionesDocente?: string;
  promptDocente?: string;
  usuarioId?: number | null;
  esAdmin?: boolean;
  idiomaSalida?: "es" | "en";
  usaMachote?: boolean;
  cantidadImagenes?: number;
  nombrePlaneamiento?: string;
  estrategiasReferencia?: string;
  estructuraEstrategiasReferencia?: string[];
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
}) {
  await ensurePlantillaPromptIAVisibilityColumns(pool);

  const plantilla = await pool.request()
    .input("plantillaPromptIAId", sql.Int, input.plantillaPromptIAId || null)
    .input("usuarioId", sql.Int, input.usuarioId || null)
    .input("esAdmin", sql.Bit, input.esAdmin ? 1 : 0)
    .query(`
      SELECT TOP 1
        p.Id,
        p.IndicacionesSistema,
        p.ContextoBase,
        p.ReglasConstruccion,
        p.EstructuraSalida,
        p.FormatoRespuesta
      FROM dbo.PlantillaPromptIA p
      INNER JOIN dbo.TipoGeneracionIA t
        ON t.Id = p.TipoGeneracionIAId
      WHERE t.Nombre = N'Planeamiento didáctico'
        AND t.Activo = 1
        AND p.Activo = 1
        AND (@esAdmin = 1 OR ISNULL(p.EsPublica, 1) = 1 OR p.UsuarioCreadorId = @usuarioId)
        AND (@plantillaPromptIAId IS NULL OR p.Id = @plantillaPromptIAId)
      ORDER BY
        CASE WHEN @plantillaPromptIAId IS NOT NULL AND p.Id = @plantillaPromptIAId THEN 0 ELSE 1 END,
        p.Id DESC
    `);

  const row = plantilla.recordset[0];

  if (!row) {
    return {
      plantillaPromptIAId: null,
      prompt: buildPrompt(input)
    };
  }

  function clampPromptText(value: any, max = 12000) {
    const text = String(value || "");
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n[Contenido recortado automáticamente por límite de tamaño del prompt]`;
  }

  const habilidadesText = input.habilidades.map((h, index) => (
    `${index + 1}. Área: ${h.Area || "No indicada"}. Mes: ${h.Mes || "No indicado"}. Número ${h.NumeroHabilidad || ""}: ${h.DescripcionHabilidad || ""}. Documento referencia: ${h.DocumentoReferencia || "No indicado"}`
  )).join("\n");
  const usaReferenciaEstrategias = Boolean(String(input.estrategiasReferencia || "").trim());
  const reglaDinamicaEstrategias = instruccionPerfilEstrategiasReferencia(input);

  const prompt = `
${clampPromptText(row.IndicacionesSistema, 10000)}

${clampPromptText(row.ContextoBase, 12000)}

ROL PEDAGÓGICO OBLIGATORIO:
Actuá como especialista en didáctica y evaluación de ${input.materiaNombre || "la materia seleccionada"} para ${input.grado || "el nivel seleccionado"}, dentro del currículo del MEP de Costa Rica. Aplicá vocabulario, progresión conceptual, mediación y evaluación propios de esa materia y nivel.

Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
- Nombre obligatorio del planeamiento: ${input.nombrePlaneamiento || "Proponer un nombre claro según el mes, grado y materia."}
- Grado: ${input.grado || "No indicado"}
- Mes: ${input.mes || "No indicado"}
- Tema o énfasis: ${input.tema || "No indicado"}
- Cantidad de semanas: ${input.semanas || 4}
- Documento de apoyo mandatorio si fue adjuntado: ${input.documentoApoyoNombre || "No adjuntado"}
- Plantilla o formato de salida opcional: ${input.plantillaFormatoNombre || "No adjuntado"}

Indicaciones, consideraciones o premisas del docente:
${clampPromptText(input.indicacionesDocente || "No se indicaron premisas adicionales.", 4000)}

Prompt de trabajo revisado por la persona docente:
${clampPromptText(input.promptDocente || "No se aportó un prompt adicional.", 12000)}

IMPORTANTE SOBRE LAS INDICACIONES DEL DOCENTE:
Las indicaciones del docente tienen prioridad sobre la plantilla general.
Si las indicaciones del docente piden usar un ejemplo específico, una página o un formato tomado del Documento de apoyo, debés aplicarlo explícitamente en la respuesta.
Si se adjuntó Documento de apoyo, imagen o archivo adicional, su uso es obligatorio para enriquecer el apartado indicado por la persona docente; no lo trates como material opcional.
Si el docente solicita adecuación significativa, color, resaltado o cualquier condición especial, debe reflejarse explícitamente en el JSON final.
Si solicita adecuación curricular significativa, generá una adaptación sustantiva al nivel de competencia indicado por la persona docente, con problema, procedimiento, recurso, producto y evidencia diferenciados; no repitás las habilidades completas del grado regular como actividad reducida.
Si el docente pide pintar o resaltar una sección en azul, devolvé colorResaltado = "azul" en el objeto correspondiente y agregá el marcador [AZUL] al inicio del texto visible.
Si el docente indica página(s), ejercicio(s), capítulo(s) o sección(es) concretas del documento de apoyo, tomalas de forma literal y citá en el contenido generado la referencia exacta (por ejemplo: "página 12, ejercicio 4").
No ignorés esta sección.

${instruccionCantidadIndicadores(input.indicacionesDocente || "", input.habilidades)}

Habilidades específicas seleccionadas:
${clampPromptText(habilidadesText, 12000)}

Documento de apoyo aportado por la persona docente:
${clampPromptText(input.documentoApoyoTexto || "No se aportó documento de apoyo adicional.", 24000)}

Plantilla o formato de salida aportado por la persona docente:
${clampPromptText(input.plantillaFormatoTexto || "No se aportó una plantilla de formato adicional.", 30000)}

Estrategias de mediación identificadas en el planeamiento de referencia:
${clampPromptText(input.estrategiasReferencia || "No se identificó una sección de estrategias en el archivo de referencia.", 25000)}

${instruccionesObligatoriasPlaneamiento(input)}

${instruccionPerfilDocumentoReferencia(input.perfilDocumentoReferencia)}

INSTRUCCIÓN PRIORITARIA SOBRE FORMATO:
Si se aportó una plantilla o formato de salida, usalo como referencia principal para el orden, nombres de secciones, tablas, encabezados y nivel de detalle del planeamiento. El documento de apoyo es solo contexto; no reemplaza el formato de salida. Si también hay una plantilla IA seleccionada, combiná ambas: la Plantilla IA define las reglas permanentes y este archivo define el formato específico de esta generación. Mantené siempre JSON válido para que el sistema pueda guardar y exportar el planeamiento.

INSTRUCCIÓN PRIORITARIA SOBRE ESTRATEGIAS DE MEDIACIÓN:
Si se adjuntó un planeamiento de referencia, analizá su sección de Estrategias de mediación y reproducí obligatoriamente su estructura, encabezados, orden, secuencia pedagógica, nivel de detalle y forma de organizar los momentos. Conservá los tipos pedagógicos generales, pero redactá de nuevo los nombres de actividades, consignas, preguntas, ejercicios, ejemplos, recursos concretos y productos para las habilidades actuales. Nunca copies contenido sustantivo del plan anterior. La secuencia obligatoria identificada es: ${(input.estructuraEstrategiasReferencia || []).join(" → ") || "la que aparece en el documento de referencia"}. No la sustituyás por una estructura genérica de Momentos ni interpretés números internos o códigos del Word como encabezados.

${reglaDinamicaEstrategias}

REGLAS DE CALIDAD Y DIVERSIDAD (OBLIGATORIAS):
- Evitá repetir siempre el mismo caso contextual (por ejemplo municipalidad). Variá el actor y el contexto según materia, grado, tema y habilidades.
- ${usaReferenciaEstrategias ? "Seguí la secuencia de la referencia y redactá actividades observables con profundidad semejante." : "En Momento 1 incluí actor real, objetivo, dos alternativas comparables y criterio explícito de decisión."}
- ${usaReferenciaEstrategias ? "No introduzcás Momentos ni etapas que no existan en la referencia." : "En Momento 2/3/4 redactá acciones observables concretas; evitá textos genéricos de plantilla."}
- Si el docente no pidió un caso específico, proponé uno original y coherente con los datos de entrada.

Reglas de construcción:
${clampPromptText(row.ReglasConstruccion, 12000)}

Estructura de salida:
${clampPromptText(row.EstructuraSalida, 10000)}

Formato de respuesta:
${clampPromptText(row.FormatoRespuesta, 8000)}

CAMPOS JSON ADICIONALES OBLIGATORIOS:
- "criteriosEvaluacion": arreglo de criterios nuevos, separado de "indicadoresEvaluacion".
- "saberesEsenciales": arreglo de contenidos conceptuales, procedimentales y actitudinales propios de las habilidades actuales. No repitás literalmente los aprendizajes; usalo cuando el machote incluya Saberes esenciales, contenidos u objetos de conocimiento.
- "semanas": generá exactamente ${input.semanas || 4} bloques semanales distintos y progresivos. Cada bloque contiene "semana", "habilidadBase", "proposito", "mediacionPedagogica", "indicadores" y "camposPedagogicos". No repitás literalmente el mismo bloque en semanas diferentes.
- "camposPedagogicos": arreglo de objetos { "campo", "valores" } dentro de cada semana. Completá con contenido nuevo los rótulos pedagógicos variables observados en el machote (por ejemplo Grammar & Sentence Frames, Vocabulary, Phonology, Function, Discourse Markers, Psychosocial y Sociocultural). Si no existen rótulos adicionales, devolvé un arreglo vacío.
- "camposReferencia": arreglo de objetos { "campo", "valor" }; cada campo corresponde a un rótulo variable del machote.
- "coberturaHabilidades": arreglo obligatorio. Para cada habilidad seleccionada, incluí su índice (empezando en 1), los índices de aprendizajes que la cubren y los índices de indicadores que la evalúan (también empezando en 1). Ninguna habilidad puede quedar sin al menos un aprendizaje y un indicador.
- No agregués propiedades fuera del contrato solicitado. El sistema valida este contrato antes de permitir guardar.

REGLA FINAL DE PRECEDENCIA:
${usaReferenciaEstrategias
    ? "El perfil dinámico del planeamiento de referencia prevalece sobre cualquier regla anterior de la Plantilla IA que exija Momentos, etapas o una secuencia fija diferente. La salida será rechazada si usa Momento 1–4 cuando esos rótulos no existen en la referencia."
    : "Como no existe una referencia utilizable, aplicá la estructura pedagógica definida por la Plantilla IA seleccionada."}

Devolvé SOLO JSON válido, sin markdown.
`;

  const promptFinal = prompt.length > 100000
    ? `${prompt.slice(0, 85000)}\n\n[Contenido intermedio recortado automáticamente por límite global]\n\n${prompt.slice(-15000)}`
    : prompt;

  return {
    plantillaPromptIAId: row.Id,
    prompt: promptFinal
  };
}

async function callOpenAiIfConfigured(
  prompt: string,
  imagenes: ImagenApoyoIA[] = [],
  options: {
    maxOutputTokens?: number;
    operacionId?: string;
    etapa?: string;
    schema?: Record<string, any>;
    schemaName?: string;
  } = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const timeoutMs = Number(process.env.OPENAI_PLANEAMIENTO_TIMEOUT_MS || 180000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 180000);
  const model = process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini";
  const maxOutputTokens = Number(
    options.maxOutputTokens
    ?? process.env.OPENAI_PLANEAMIENTO_MAX_OUTPUT_TOKENS
    ?? 16000
  );
  const body: Record<string, any> = {
    model,
    input: imagenes.length
      ? [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...imagenes.map((imagen) => ({
              type: "input_image",
              image_url: `data:${imagen.mimeType};base64,${imagen.base64}`
            }))
          ]
        }]
      : prompt
  };
  if (Number.isFinite(maxOutputTokens) && maxOutputTokens > 0) {
    body.max_output_tokens = Math.floor(maxOutputTokens);
  }
  if (options.schema) {
    body.text = {
      format: {
        type: "json_schema",
        name: options.schemaName || "planeamiento_didactico",
        strict: true,
        schema: options.schema
      }
    };
  }
  if (!isGpt5FamilyModel(model)) {
    body.temperature = 0.35;
  }

  try {
    const inicio = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Error OpenAI planeamiento:", text);
      return null;
    }

    const data: any = await response.json();
    registrarUsoIaOperacion(
      options.operacionId || "",
      options.etapa || "planeamiento_ia",
      model,
      data?.usage,
      Date.now() - inicio
    );
    const text = extraerTextoRespuestaOpenAI(data);
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]);
    }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.error("Timeout OpenAI planeamiento: se superó el tiempo máximo de espera");
      return null;
    }
    console.error("Error OpenAI planeamiento:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Contrato de la generación inicial. Se mantiene deliberadamente separado del
// documento Word: la referencia define la presentación y este contrato protege
// la consistencia pedagógica que el sistema puede comprobar antes de guardar.
const PLANEAMIENTO_GENERACION_SCHEMA: Record<string, any> = {
  type: "object",
  additionalProperties: false,
  required: [
    "nombre",
    "aprendizajesEsperados",
    "saberesEsenciales",
    "criteriosEvaluacion",
    "estrategiasMediacion",
    "indicadoresEvaluacion",
    "semanas",
    "camposReferencia",
    "coberturaHabilidades",
    "observaciones"
  ],
  properties: {
    nombre: { type: "string" },
    aprendizajesEsperados: { type: "array", items: { type: "string" } },
    saberesEsenciales: { type: "array", items: { type: "string" } },
    criteriosEvaluacion: { type: "array", items: { type: "string" } },
    estrategiasMediacion: { type: "array", items: { type: "string" } },
    indicadoresEvaluacion: { type: "array", items: { type: "string" } },
    semanas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "semana",
          "habilidadBase",
          "proposito",
          "mediacionPedagogica",
          "indicadores",
          "camposPedagogicos"
        ],
        properties: {
          semana: { type: "integer" },
          habilidadBase: { type: "string" },
          proposito: { type: "string" },
          mediacionPedagogica: { type: "array", items: { type: "string" } },
          indicadores: { type: "array", items: { type: "string" } },
          camposPedagogicos: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["campo", "valores"],
              properties: {
                campo: { type: "string" },
                valores: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    },
    camposReferencia: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campo", "valor"],
        properties: {
          campo: { type: "string" },
          valor: { type: "string" }
        }
      }
    },
    coberturaHabilidades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["habilidadIndice", "aprendizajesIndices", "indicadoresIndices"],
        properties: {
          habilidadIndice: { type: "integer" },
          aprendizajesIndices: { type: "array", items: { type: "integer" } },
          indicadoresIndices: { type: "array", items: { type: "integer" } }
        }
      }
    },
    observaciones: { type: "string" }
  }
};

function normalizarContratoGeneracionPlaneamiento(resultado: any) {
  if (!resultado || typeof resultado !== "object") return resultado;
  const camposEntrada = resultado.camposReferencia;
  const camposReferencia = Array.isArray(camposEntrada)
    ? Object.fromEntries(
        camposEntrada
          .map((campo: any) => [normalizeText(campo?.campo), normalizeText(campo?.valor)])
          .filter(([campo]: [string, string]) => Boolean(campo))
      )
    : camposEntrada;
  return {
    ...resultado,
    camposReferencia,
    contratoGeneracion: "planeamiento-estructurado-v1"
  };
}

function serializarParaPrompt(value: any, maxLength = 30000) {
  const text = JSON.stringify(value, null, 2);
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength)}\n[Contenido recortado por límite técnico]`;
}

function esIncumplimientoTecnicoNoBloqueanteAuditoria(value: any) {
  const text = normalizarParaBusqueda(value);
  if (!text) return false;
  if (
    text.includes("estrategiasmediacion")
    && (
      text.includes("arreglo")
      || text.includes("array")
      || text.includes("string")
      || text.includes("texto plano")
    )
  ) return true;
  if (
    (
      text.includes("campos extra")
      || text.includes("campos adicionales")
      || text.includes("fuera de la estructura")
      || text.includes("estructura exacta")
    )
    && (
      text.includes("mes")
      || text.includes("grado")
      || text.includes("materianombre")
      || text.includes("criteriosevaluacion")
      || text.includes("camposreferencia")
      || text.includes("nombre")
    )
  ) return true;
  return false;
}

export function normalizarAuditoriaSemantica(value: any): AuditoriaSemanticaPlaneamiento {
  if (!value || typeof value !== "object" || typeof value.cumple !== "boolean") {
    return {
      disponible: false,
      cumple: false,
      incumplimientos: ["La respuesta de la revisión semántica no tuvo el formato esperado."],
      fortalezas: []
    };
  }

  const incumplimientos = splitLines(value.incumplimientos)
    .filter((item) => !esIncumplimientoTecnicoNoBloqueanteAuditoria(item))
    .slice(0, 12);

  return {
    disponible: true,
    cumple: Boolean(value.cumple || !incumplimientos.length),
    incumplimientos,
    fortalezas: splitLines(value.fortalezas).slice(0, 12)
  };
}

export function perfilDocumentoParaRevision(perfil?: PerfilDocumentoReferencia) {
  if (!perfil) return undefined;
  return {
    ...perfil,
    camposVariables: perfil.camposVariables.filter(
      (campo) => !esCampoMetadataFijo(campo.etiqueta)
    )
  };
}

async function auditarPlaneamientoConIa(input: {
  resultado: any;
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  indicacionesDocente: string;
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
  idiomaSalida: "es" | "en";
  estrategiasReferencia: string;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
  operacionId?: string;
  etapa?: string;
}): Promise<AuditoriaSemanticaPlaneamiento> {
  const prompt = `
Actuá como revisor independiente de un planeamiento didáctico. No generés ni reescribás el documento.
Compará el RESULTADO contra los DATOS ACTUALES, las INDICACIONES MANDATORIAS y el PERFIL DINÁMICO extraído del planeamiento de referencia.

La referencia puede pertenecer a cualquier materia y usar cualquier estructura. No impongás momentos, fases, metodologías ni encabezados que no estén en su perfil.

Marcá "cumple": false ante cualquiera de estas situaciones:
- No cumple una indicación expresa del docente.
- Ignora, omite o usa de forma decorativa un documento, imagen o archivo de apoyo adjunto cuando ese material aporta contenido, ejemplo, machote, ejercicio, formato o referencia para enriquecer el apartado indicado.
- Conserva tema, unidad, subtema, ejemplos, lugares, personas, consignas, respuestas o contenido sustantivo concreto del plan anterior.
- Cambia el orden, los encabezados, la lógica o la secuencia de las estrategias de mediación de la referencia.
- Resume de forma marcada el nivel de detalle de la referencia.
- Mezcla criterios de evaluación con indicadores o deja vacía una columna semántica de la referencia.
- Usa datos incompatibles con materia, grado, mes, tema o habilidades actuales.
- No completa con información nueva los campos variables detectados en el machote.
- Usa un idioma distinto al del documento de referencia.

No marqués como incumplimiento el uso de tipos pedagógicos generales que forman parte de la lógica de la referencia, como trabajo individual o grupal, preguntas, discusión, plenaria, consulta de fuentes, organizadores gráficos, producción escrita, cierre o retroalimentación. Es correcto conservar esa lógica siempre que las consignas, casos, ejemplos, recursos concretos, preguntas y productos se hayan redactado nuevamente para las habilidades actuales.
Los únicos rótulos que pueden conservarse literalmente son los incluidos en "encabezadosEstrategias". Cualquier número interno, código de control o identificador del Word carece de valor pedagógico y debe ignorarse.

No evalués como campos variables Dirección Regional de Educación, Centro educativo, nombre de la persona docente, asignatura, año escolar, curso lectivo, grado, mes, período ni periodicidad. Esos datos los completa el servidor al exportar el Word y no deben aparecer como incumplimientos.

No rechacés el resultado por formato técnico interno del JSON. Para este sistema, "estrategiasMediacion" puede ser un arreglo de textos y eso es válido. También son válidos campos internos o de exportación como "mes", "grado", "materiaNombre", "MateriaNombre", "criteriosEvaluacion", "camposReferencia" y "nombre"; no los reportés como campos extra ni como incumplimiento. Tu revisión debe enfocarse en coherencia pedagógica, uso verificable de la referencia disponible, indicaciones docentes, habilidades, idioma e indicadores observables.

DATOS ACTUALES:
${serializarParaPrompt({
    materia: input.materiaNombre,
    grado: input.grado,
    mes: input.mes,
    tema: input.tema,
    idioma: input.idiomaSalida,
    habilidades: input.habilidades.map((habilidad) => ({
      area: habilidad?.Area,
      numero: habilidad?.NumeroHabilidad,
      descripcion: habilidad?.DescripcionHabilidad
    }))
  }, 12000)}

INDICACIONES MANDATORIAS:
${input.indicacionesDocente || "No se aportaron indicaciones adicionales."}

DOCUMENTOS/ARCHIVOS DE APOYO MANDATORIOS:
${input.documentoApoyoTexto?.trim()
    ? `Nombres: ${input.documentoApoyoNombre || "documento(s) adjunto(s)"}\n${String(input.documentoApoyoTexto || "").slice(0, 16000)}`
    : "No se aportaron documentos de apoyo adicionales."}

PERFIL DEL DOCUMENTO DE REFERENCIA:
${serializarParaPrompt(perfilDocumentoParaRevision(input.perfilDocumentoReferencia) || {}, 8000)}

PERFIL DE ESTRATEGIAS:
${serializarParaPrompt(input.perfilEstrategiasReferencia || {}, 8000)}

EXTRACTO DE ESTRATEGIAS DE REFERENCIA:
${String(input.estrategiasReferencia || "").slice(0, 14000)}

RESULTADO A REVISAR:
${serializarParaPrompt(input.resultado, 24000)}

Devolvé SOLO JSON válido:
{
  "cumple": true,
  "incumplimientos": [],
  "fortalezas": ["..."]
}
`.trim();

  const response = await callOpenAiIfConfigured(prompt, [], {
    maxOutputTokens: 1400,
    operacionId: input.operacionId,
    etapa: input.etapa || "auditoria_semantica"
  });
  return normalizarAuditoriaSemantica(response);
}

async function repararPlaneamientoConIa(input: {
  resultado: any;
  fallas: string[];
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  indicacionesDocente: string;
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
  idiomaSalida: "es" | "en";
  nombrePlaneamiento: string;
  estrategiasReferencia: string;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
  imagenes?: ImagenApoyoIA[];
  operacionId?: string;
  etapa?: string;
}) {
  const referenciaEstructuralParaReparacion = construirReferenciaEstructuralParaPrompt(
    input.perfilDocumentoReferencia,
    input.perfilEstrategiasReferencia
  );
  const encabezadosEsperados = (
    input.perfilDocumentoReferencia?.encabezadosEstrategias?.length
      ? input.perfilDocumentoReferencia.encabezadosEstrategias
      : input.perfilEstrategiasReferencia?.encabezados
  ) || [];
  const estrategiasDiagnosticadas = estructurarEstrategiasMediacion(
    input.resultado?.estrategiasMediacion,
    encabezadosEsperados
  );
  const totalesEncabezados = encabezadosEsperados.reduce((mapa, encabezado) => {
    const clave = normalizarParaBusqueda(encabezado);
    mapa.set(clave, (mapa.get(clave) || 0) + 1);
    return mapa;
  }, new Map<string, number>());
  const aparicionesEncabezados = new Map<string, number>();
  const diagnosticoEstrategias = estrategiasDiagnosticadas.map((item, index) => {
    const clave = normalizarParaBusqueda(item.fase);
    const aparicion = (aparicionesEncabezados.get(clave) || 0) + 1;
    aparicionesEncabezados.set(clave, aparicion);
    const total = totalesEncabezados.get(clave) || 1;
    return {
      posicion: index + 1,
      encabezado: item.fase,
      aparicion,
      totalApariciones: total,
      estado: item.contenido.trim().length >= 20 ? "completo" : "incompleto",
      contenidoActual: item.contenido
    };
  });
  const hayFallasDeAdecuacionSignificativa = input.fallas.some((falla) => {
    const texto = normalizarParaBusqueda(falla);
    return texto.includes("adecuacion")
      || texto.includes("adaptacion")
      || texto.includes("significativa")
      || texto.includes("competencia");
  });
  const fallasSonSoloDeEstrategias = !hayFallasDeAdecuacionSignificativa && input.fallas.length > 0 && input.fallas.every((falla) => {
    const texto = normalizarParaBusqueda(falla);
    return texto.includes("estrateg")
      || texto.includes("mediacion")
      || texto.includes("nivel de detalle")
      || texto.includes("parrafo")
      || texto.includes("intervencion")
      || texto.includes("pregunta")
      || texto.includes("dua");
  });

  if (fallasSonSoloDeEstrategias) {
    const parrafosReferencia = Math.max(1, Number(input.perfilEstrategiasReferencia?.cantidadParrafos || 0));
    const caracteresReferencia = Math.max(1, Number(input.perfilEstrategiasReferencia?.cantidadCaracteres || 0));
    const minimoParrafos = Math.max(
      encabezadosEsperados.length * 2,
      input.habilidades.length * 4,
      Math.min(40, Math.ceil(parrafosReferencia * 0.35))
    );
    const minimoCaracteres = Math.max(
      1200,
      Math.min(9000, Math.ceil(caracteresReferencia * 0.4))
    );
    const secuenciaNumerada = encabezadosEsperados.map(
      (encabezado, index) => `${index + 1}. ${encabezado}`
    ).join("\n");

    const promptEstrategias = `
Reescribí ÚNICAMENTE las Estrategias de mediación del planeamiento actual.
No devolvás ni modifiqués ninguna otra sección.

OBJETIVO:
- Corregir todas las fallas indicadas.
- Conservar la estructura, lógica, secuencia, amplitud y profundidad del documento de referencia.
- Sustituir completamente sus contenidos anteriores por contenidos nuevos, coherentes con la materia, grado, tema y habilidades actuales.

REGLAS OBLIGATORIAS:
1. Conservá cada encabezado en el orden exacto indicado. Si se repite, incluí y desarrollá cada aparición por separado.
2. Nunca coloqués dos encabezados consecutivos sin varios párrafos sustantivos entre ellos.
3. Incluí intervenciones diferenciadas de mediación docente, trabajo del estudiantado, trabajo independiente o colaborativo, discusión, preguntas, cierre, apoyos DUA, recursos y evidencia, siguiendo únicamente el patrón que realmente exista en la referencia.
4. No resumás. La salida debe contener al menos ${minimoParrafos} párrafos útiles y aproximadamente ${minimoCaracteres} caracteres o más.
5. Distribuí la profundidad entre todos los bloques; ningún encabezado puede quedar vacío o con una descripción mínima.
6. Conservá los tipos pedagógicos generales de la referencia, pero no copiés sus nombres de actividad, consignas, temas, ejemplos, personas, lugares, preguntas, ejercicios, respuestas ni productos concretos.
7. Usá literalmente solo los encabezados incluidos en la SECUENCIA EXACTA. Ignorá números internos, códigos de control y cualquier rótulo que no aparezca allí.
8. Usá el idioma ${input.idiomaSalida === "en" ? "inglés" : "español"}.
9. Devolvé solamente JSON válido con la clave "estrategiasMediacion", como arreglo de párrafos. Cada encabezado también debe ocupar un elemento propio del arreglo.
10. Si una falla nombra temas, sonidos, conectores, ejercicios, productos o ejemplos heredados del plan anterior, eliminálos por completo y reemplazalos por contenido verificable de las habilidades actuales.

DATOS ACTUALES:
${serializarParaPrompt({
      materia: input.materiaNombre,
      grado: input.grado,
      mes: input.mes,
      tema: input.tema,
      habilidades: input.habilidades.map((habilidad) => ({
        area: habilidad?.Area,
        numero: habilidad?.NumeroHabilidad,
        descripcion: habilidad?.DescripcionHabilidad
      }))
    }, 14000)}

INDICACIONES MANDATORIAS:
${input.indicacionesDocente || "No se aportaron indicaciones adicionales."}

DOCUMENTOS/ARCHIVOS DE APOYO MANDATORIOS:
${input.documentoApoyoTexto?.trim()
      ? `Nombres: ${input.documentoApoyoNombre || "documento(s) adjunto(s)"}\n${String(input.documentoApoyoTexto || "").slice(0, 16000)}`
      : "No se aportaron documentos de apoyo adicionales."}

SECUENCIA EXACTA, INCLUIDAS LAS REPETICIONES:
${secuenciaNumerada || "Conservá la organización narrativa de la referencia."}

FALLAS DETECTADAS:
${input.fallas.map((falla, index) => `${index + 1}. ${falla}`).join("\n")}

DIAGNÓSTICO POR APARICIÓN:
${serializarParaPrompt(diagnosticoEstrategias, 18000)}

ESTRATEGIAS DE REFERENCIA:
${referenciaEstructuralParaReparacion}

ESTRATEGIAS ACTUALES QUE SE DEBEN REEMPLAZAR:
${serializarParaPrompt(splitLines(input.resultado?.estrategiasMediacion), 28000)}

FORMATO EXACTO:
{
  "estrategiasMediacion": [
    "Encabezado 1",
    "Primer párrafo desarrollado...",
    "Segundo párrafo desarrollado...",
    "Encabezado 2",
    "..."
  ]
}
`.trim();

    const reparacionEstrategias = await callOpenAiIfConfigured(promptEstrategias, input.imagenes || [], {
      operacionId: input.operacionId,
      etapa: input.etapa || "reparar_planeamiento"
    });
    const estrategiasReparadas = splitLines(reparacionEstrategias?.estrategiasMediacion);
    if (estrategiasReparadas.length) {
      return {
        ...input.resultado,
        estrategiasMediacion: estrategiasReparadas
      };
    }
  }

  const prompt = `
Corregí integralmente el planeamiento JSON adjunto. Devolvé el objeto completo corregido, no un resumen.

REGLAS ABSOLUTAS:
1. Las indicaciones del docente son mandatorias.
2. El planeamiento de referencia define dinámicamente la estructura, secuencia, encabezados y nivel de detalle. No agregués una estructura fija de otra materia.
3. Usá la referencia solo como estructura y lógica. Eliminá sus datos sustantivos anteriores y reemplazalos por los datos actuales.
4. Conservá separados aprendizajes, criterios de evaluación e indicadores de evaluación.
5. Llená "camposReferencia" con una clave exacta para cada campo variable detectado y con valores nuevos.
6. Conservá exactamente el nombre solicitado.
7. La salida debe estar en el idioma indicado.
8. Devolvé exclusivamente JSON válido.
9. No intentés completar Dirección Regional, Centro educativo, nombre docente, asignatura, año escolar, curso lectivo, grado, mes, período ni periodicidad dentro de "camposReferencia"; el servidor los completa.
10. En "estrategiasMediacion", cada aparición de cada encabezado debe conservarse en el orden exacto y tener contenido pedagógico sustantivo inmediatamente después. Si un encabezado se repite, completá cada aparición por separado.
11. Nunca dejés dos encabezados consecutivos sin desarrollo entre ellos. Cada aparición debe contener al menos dos oraciones nuevas y coherentes con las habilidades actuales.
12. Podés conservar tipos pedagógicos generales de la referencia, pero reemplazá totalmente sus nombres de actividad, consignas, ejemplos, preguntas, ejercicios, respuestas, recursos concretos y productos por otros coherentes con los datos actuales.
13. Ignorá números internos, códigos de control e identificadores del Word. Solo son encabezados los incluidos en el perfil dinámico.
14. Todo documento, imagen o archivo de apoyo adjunto es mandatorio: usalo para enriquecer el apartado indicado por el docente con datos, ejemplos, estructura, ejercicios o lenguaje concreto del material. No lo tratés como opcional.
15. Si hay adecuación curricular significativa, no repitás las habilidades completas del grado regular como propósito, actividad, recurso y producto. Redactá una adaptación sustantiva al nivel de competencia indicado por la persona docente, con tarea, procedimiento, recurso, producto y evidencia diferenciados.
16. Si alguna falla indica que se conservó contenido sustantivo del plan anterior, eliminá por completo esos temas, ejemplos, sonidos, conectores, ejercicios o productos nombrados en la falla, salvo que estén explícitamente en las habilidades, tema, indicaciones o documentos actuales.
17. Cada indicador de evaluación debe corresponder a una habilidad específica distinta, con desempeño observable, producto o evidencia, contexto de aula y criterio mínimo de logro. No usés indicadores genéricos como "demonstrates progress" sin producto, desempeño y evidencia concretos.

DATOS ACTUALES:
${serializarParaPrompt({
    nombre: input.nombrePlaneamiento,
    materia: input.materiaNombre,
    grado: input.grado,
    mes: input.mes,
    tema: input.tema,
    idioma: input.idiomaSalida,
    habilidades: input.habilidades.map((habilidad) => ({
      area: habilidad?.Area,
      numero: habilidad?.NumeroHabilidad,
      descripcion: habilidad?.DescripcionHabilidad
    }))
  }, 12000)}

INDICACIONES MANDATORIAS:
${input.indicacionesDocente || "No se aportaron indicaciones adicionales."}

DOCUMENTOS/ARCHIVOS DE APOYO MANDATORIOS:
${input.documentoApoyoTexto?.trim()
    ? `Nombres: ${input.documentoApoyoNombre || "documento(s) adjunto(s)"}\n${String(input.documentoApoyoTexto || "").slice(0, 16000)}`
    : "No se aportaron documentos de apoyo adicionales."}

FALLAS QUE DEBÉS CORREGIR:
${input.fallas.map((falla, index) => `${index + 1}. ${falla}`).join("\n")}

DIAGNÓSTICO DE CADA APARICIÓN DE LAS ESTRATEGIAS:
${serializarParaPrompt(diagnosticoEstrategias, 16000)}

PERFIL DINÁMICO DEL DOCUMENTO:
${referenciaEstructuralParaReparacion}

PERFIL DE ESTRATEGIAS:
${serializarParaPrompt(input.perfilEstrategiasReferencia || {}, 8000)}

ESTRATEGIAS DE REFERENCIA:
${referenciaEstructuralParaReparacion}

PLANEAMIENTO A CORREGIR:
${serializarParaPrompt(input.resultado, 36000)}
`.trim();

  return callOpenAiIfConfigured(prompt, input.imagenes || [], {
    operacionId: input.operacionId,
    etapa: input.etapa || "reparar_planeamiento"
  });
}

async function callOpenAiTextIfConfigured(
  prompt: string,
  options: { operacionId?: string; etapa?: string } = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Number(process.env.OPENAI_PLANEAMIENTO_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45000);
  const model = process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini";
  const body: Record<string, any> = { model, input: prompt };
  if (!isGpt5FamilyModel(model)) body.temperature = 0.35;

  try {
    const inicio = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error("Error OpenAI mejorando prompt de planeamiento:", await response.text());
      return null;
    }

    const data = await response.json();
    registrarUsoIaOperacion(
      options.operacionId || "",
      options.etapa || "texto_ia",
      model,
      data?.usage,
      Date.now() - inicio
    );
    return normalizeText(extraerTextoRespuestaOpenAI(data));
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.error("Timeout OpenAI mejorando prompt de planeamiento");
      return null;
    }
    console.error("Error OpenAI mejorando prompt de planeamiento:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extraerTextoRespuestaOpenAI(data: any) {
  const direct = normalizeText(data?.output_text);
  if (direct) return direct;

  const output = Array.isArray(data?.output) ? data.output : [];
  for (const message of output) {
    if (message?.type !== "message") continue;
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const part of content) {
      const text = normalizeText(part?.text || part?.output_text);
      if (text) return text;
    }
  }

  return "";
}



function normalizarParaBusqueda(value: any) {
  return repararMojibakeTexto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Word puede partir una misma frase en varios runs, párrafos o celdas. Para
// verificar que el contenido llegó al DOCX no se debe exigir que conserve el
// mismo salto de línea interno que tenía el texto de entrada.
export function normalizarTextoWordParaComparacion(value: any) {
  return normalizarParaBusqueda(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarParaBusquedaConMapa(value: any) {
  const original = repararMojibakeTexto(value);
  let texto = "";
  const indicesOriginales: number[] = [];
  let indiceOriginal = 0;

  for (const caracter of original) {
    const normalizado = caracter
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    for (const caracterNormalizado of normalizado) {
      texto += caracterNormalizado;
      indicesOriginales.push(indiceOriginal);
    }
    indiceOriginal += caracter.length;
  }
  indicesOriginales.push(original.length);

  return { original, texto, indicesOriginales };
}

function normalizarPeriodicidadSeleccionada(value: any) {
  const t = normalizarParaBusqueda(String(value || ""));
  if (t.includes("semestre")) return "semestre";
  if (t.includes("trimestre")) return "trimestre";
  if (t.includes("bimestre")) return "bimestre";
  if (t === "mes" || t.includes(" mes") || t.startsWith("mes ")) return "mes";
  return "";
}

function obtenerMesesPlaneamiento(value: any) {
  const texto = normalizarParaBusqueda(String(value || ""));
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "septiembre", "octubre", "noviembre", "diciembre",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  return Array.from(new Set(meses.filter((mes) => new RegExp(`\\b${mes}\\b`, "i").test(texto))));
}

export function validarPeriodicidadPlaneamiento(meses: any, periodicidad: any) {
  const seleccion = normalizarPeriodicidadSeleccionada(periodicidad);
  const cantidadMeses = obtenerMesesPlaneamiento(meses).length;
  if (!seleccion || cantidadMeses <= 1) return null;

  const cantidadEsperada: Record<string, number> = { mes: 1, bimestre: 2, trimestre: 3, semestre: 6 };
  const esperada = cantidadEsperada[seleccion];
  if (!esperada || cantidadMeses === esperada) return null;
  return `Seleccionaste ${seleccion}, pero los meses indicados abarcan ${cantidadMeses} meses. Elegí una periodicidad coherente antes de generar.`;
}

const COMPETENCIAS_BASE_PLANEAMIENTO = [
  "Competencias para la ciudadanía responsable y solidaria",
  "Competencias para la vida: sociales, emocionales y de aprendizaje",
  "Competencias para el empleo digno y el emprendimiento"
];

function normalizarCompetenciaGeneralSeleccionada(value: any) {
  const texto = normalizarParaBusqueda(String(value || ""));
  const match = COMPETENCIAS_BASE_PLANEAMIENTO.find((item) => {
    const base = normalizarParaBusqueda(item);
    return base.includes(texto) || texto.includes(base);
  });
  return match || "";
}

function isGpt5FamilyModel(model: string) {
  return String(model ?? "").trim().toLowerCase().includes("gpt-5");
}

function normalizarSeleccionesPlaneamientoResultado(resultado: any) {
  const out = resultado && typeof resultado === "object" ? { ...resultado } : {};
  const periodicidad = normalizarPeriodicidadSeleccionada(out.periodicidad);
  const competenciaGeneral = normalizarCompetenciaGeneralSeleccionada(
    out.competenciaGeneral || (Array.isArray(out.competenciasGenerales) ? out.competenciasGenerales[0] : "")
  );
  out.periodicidad = periodicidad;
  out.competenciaGeneral = competenciaGeneral;
  out.competenciasGenerales = competenciaGeneral ? [competenciaGeneral] : [];
  return out;
}

function numeroIndicadoresDesdeTexto(value: string | undefined) {
  const texto = normalizarParaBusqueda(value || "").trim();
  if (!texto) return null;
  const numero = Number(texto);
  if (Number.isInteger(numero)) return Math.max(1, Math.min(10, numero));
  const palabras: Record<string, number> = {
    uno: 1,
    un: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10
  };
  return palabras[texto] || null;
}

export function cantidadesIndicadoresSolicitadas(indicaciones: string, cantidadHabilidades: number) {
  const totalHabilidades = Math.max(1, cantidadHabilidades || 1);
  const texto = normalizarParaBusqueda(indicaciones);
  const cantidades: number[] = Array.from({ length: totalHabilidades }, () => 1);
  if (!texto || !texto.includes("indicador")) return cantidades;

  const cantidadToken = "(\\d{1,2}|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";
  const patronesGlobales = [
    new RegExp(`${cantidadToken}\\s+indicadores?(?:\\s+de\\s+evaluacion)?\\s+(?:por|para)\\s+cada(?:\\s+una\\s+de\\s+las)?\\s+habilidad(?:es)?`),
    new RegExp(`${cantidadToken}\\s+indicadores?(?:\\s+de\\s+evaluacion)?\\s+por\\s+habilidad`),
    new RegExp(`(?:por|para)\\s+cada(?:\\s+una\\s+de\\s+las)?\\s+habilidad(?:es)?[\\s\\S]{0,80}?${cantidadToken}\\s+indicadores?`)
  ];

  for (const patron of patronesGlobales) {
    const match = texto.match(patron);
    const cantidadGlobal = numeroIndicadoresDesdeTexto(match?.[1]);
    if (cantidadGlobal) {
      cantidades.fill(cantidadGlobal);
      break;
    }
  }

  if (cantidades.every((cantidad) => cantidad === 1)) {
    if (texto.includes("varios indicadores") || texto.includes("multiples indicadores") || texto.includes("mas de un indicador")) {
      (cantidades as number[]).fill(2);
    }
  }

  const tokenObjetivo = "(?:indicador(?:es)?|indicado(?:r)?|habilidad(?:es)?)";
  for (let i = 1; i <= totalHabilidades; i += 1) {
    const p1 = new RegExp(`${tokenObjetivo}\\s*${i}\\b[\\s\\S]{0,120}?${cantidadToken}\\s+indicadores?`);
    const p2 = new RegExp(`${cantidadToken}\\s+indicadores?[\\s\\S]{0,120}?${tokenObjetivo}\\s*${i}\\b`);
    const p3 = new RegExp(`${tokenObjetivo}\\s*${i}\\b[\\s\\S]{0,120}?${cantidadToken}\\s+adicional(?:es)?`);
    const m1 = texto.match(p1);
    const m2 = texto.match(p2);
    const m3 = texto.match(p3);
    const cantidadDirecta = numeroIndicadoresDesdeTexto(m1?.[1] || m2?.[1]);
    const cantidadAdicional = numeroIndicadoresDesdeTexto(m3?.[1]);
    if (cantidadDirecta) cantidades[i - 1] = cantidadDirecta;
    else if (cantidadAdicional) cantidades[i - 1] = Math.min(10, cantidadAdicional + 1);
  }

  return cantidades;
}

function permiteMultiplesIndicadoresPorHabilidad(indicaciones: string) {
  return cantidadesIndicadoresSolicitadas(indicaciones, 1).some((cantidad) => cantidad > 1);
}

function instruccionCantidadIndicadores(indicaciones: string, habilidades: any[]) {
  const cantidades = cantidadesIndicadoresSolicitadas(indicaciones, habilidades.length);
  const total = cantidades.reduce((suma, cantidad) => suma + cantidad, 0);
  return `
REQUISITO OBLIGATORIO DE INDICADORES:
- Cantidad total requerida: ${total}.
${cantidades.map((cantidad, index) => `- Habilidad ${index + 1}: generar exactamente ${cantidad} indicador(es), numerados ${Array.from({ length: cantidad }, (_, subindice) => `${index + 1}.${subindice + 1}`).join(", ")}.`).join("\n")}
- Cada indicador debe conservar contenido propio redactado por la IA según las indicaciones del docente; no repitás el mismo texto.
- La numeración indicada debe aparecer literalmente al inicio de cada elemento de "indicadoresEvaluacion".
`.trim();
}

function limpiarEstrategiasMediacion(estrategias: any[]) {
  return (Array.isArray(estrategias) ? estrategias : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const normalizado = normalizarParaBusqueda(item).replace(/^[\-\*\d\.\)\s:]+/, "");
      return !normalizado.startsWith("enfoque:");
    });
}

export function alinearMomentosConReferencia(estrategias: string[], estructuraReferencia: string[] = []) {
  const fasesReferencia = Array.from(new Map(
    (Array.isArray(estructuraReferencia) ? estructuraReferencia : [])
      .map((fase) => String(fase || "").trim())
      .filter((fase) => fase && !/^momento\s+\d+/i.test(fase))
      .map((fase) => [normalizarParaBusqueda(fase), fase])
  ).values());
  if (!fasesReferencia.length) return estrategias;

  let indiceFase = 0;
  return estrategias.map((estrategia) => String(estrategia || "").replace(
    /(^|\n)\s*momento\s*[1-4]\s*:\s*[^\n]*/gim,
    (_coincidencia, prefijo) => {
      const fase = fasesReferencia[Math.min(indiceFase, fasesReferencia.length - 1)];
      indiceFase += 1;
      return `${prefijo}${fase}`;
    }
  ));
}

function claveEncabezadoPedagogico(value: any) {
  const clave = normalizarParaBusqueda(value).replace(/[^a-z0-9]+/g, " ").trim();
  if (clave.includes("construccion") && clave.includes("colaboracion")) return "construccion colaboracion";
  if (clave.includes("construccion") && clave.includes("desarrollo")) return "construccion desarrollo";
  if (clave.includes("clarificacion") && clave.includes("cierre")) return "clarificacion cierre";
  if (clave.includes("conexion") && clave.includes("inicio")) return "conexion inicio";
  return clave;
}

function deduplicarEncabezadosPedagogicos(encabezados: any) {
  return Array.from(new Map(
    (Array.isArray(encabezados) ? encabezados : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => [claveEncabezadoPedagogico(item), item])
  ).values());
}

export function estructuraReferenciaConfiable(estructura: any, perfil?: PerfilEstrategiasReferencia | null) {
  const directa = deduplicarEncabezadosPedagogicos(estructura);
  // Un único rótulo de actor en negrita (por ejemplo, "El docente:") suele
  // ser parte de la redacción de una actividad, no una secuencia pedagógica.
  // Tratarlo como estructura obligatoria producía falsos rechazos en machotes
  // de materias y niveles muy distintos.
  if (
    directa.length === 1
    && /^(?:el |la )?(?:docente|estudiantado|estudiante|teacher|students?)\s*:?$/i.test(directa[0])
  ) return [];
  if (directa.length) return directa;
  const inferida = deduplicarEncabezadosPedagogicos(perfil?.encabezados);
  if (
    inferida.length === 1
    && /^(?:el |la )?(?:docente|estudiantado|estudiante|teacher|students?)\s*:?$/i.test(inferida[0])
  ) return [];
  return inferida;
}

export function conservarReferenciaWordEnResultado(resultado: any, resultadoAnterior: any) {
  if (!resultado || typeof resultado !== "object") return resultado;
  const anterior = resultadoAnterior && typeof resultadoAnterior === "object" ? resultadoAnterior : {};
  if (!resultado.plantillaFormatoDocx?.base64 && anterior.plantillaFormatoDocx?.base64) {
    resultado.plantillaFormatoDocx = anterior.plantillaFormatoDocx;
  }
  for (const campo of [
    "plantillaFormatoNombre",
    "documentoReferenciaNombre",
    "perfilDocumentoReferencia",
    "perfilEstrategiasReferencia",
    "estructuraEstrategiasReferencia",
    "seccionModeloReferenciaId",
    "usaReferenciaEstrategias",
    "referenciaGeneralSinEstrategias"
  ]) {
    if ((resultado[campo] === undefined || resultado[campo] === null || resultado[campo] === "") && anterior[campo] !== undefined) {
      resultado[campo] = anterior[campo];
    }
  }
  return resultado;
}

function separarBloquesPorMomento(estrategias: string[]) {
  const base = (Array.isArray(estrategias) ? estrategias : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const salida: string[] = [];
  const marker = /(?=Momento\s+[1-4]\s*:)/gi;

  for (const item of base) {
    const partes = item
      .split(marker)
      .map((parte) => String(parte || "").trim())
      .filter(Boolean);
    if (partes.length > 1) {
      salida.push(...partes);
    } else {
      salida.push(item);
    }
  }

  return salida;
}

function hashTextoBase(value: string) {
  let h = 0;
  const s = String(value || "");
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function construirProblemaRealMomento1(habilidades: any[], materiaNombre?: string, grado?: string, tema?: string) {
  const descripciones = (Array.isArray(habilidades) ? habilidades : [])
    .map((h: any) => String(h?.DescripcionHabilidad || h || "").trim())
    .map((h) => h
      .replace(/^[\-\*\u2022]\s*/, "")
      .replace(/^\d+(\.\d+)?\s*[:.-]?\s*/, "")
      .replace(/^habilidad\s+/i, ""))
    .filter(Boolean);
  const focoPrincipal = descripciones[0] || tema || "los aprendizajes seleccionados";
  const focoSecundario = descripciones[1] || "aplicar procedimientos matemáticos con claridad";
  const materia = materiaNombre || "la asignatura";
  const nivel = grado ? ` de ${grado}` : "";
  const llave = `${materia}|${tema || ""}|${nivel}|${focoPrincipal}|${focoSecundario}`;
  const idx = hashTextoBase(llave) % 6;
  const escenarios = [
    "el comité de infraestructura del colegio debe escoger entre dos propuestas para optimizar iluminación y seguridad en zonas de tránsito estudiantil",
    "la asociación de desarrollo local debe priorizar un plan de mejora de espacios deportivos con presupuesto limitado",
    "la cooperativa estudiantil debe decidir entre dos esquemas de compra y distribución de materiales para ferias académicas",
    "la dirección del centro educativo debe comparar alternativas para el uso eficiente del agua en servicios sanitarios y áreas verdes",
    "el equipo organizador de la feria científica debe seleccionar el plan logístico más eficiente entre dos propuestas operativas",
    "el consejo de transporte escolar debe evaluar dos rutas de traslado y su impacto en tiempo, costo y cobertura"
  ];
  const escenario = escenarios[idx];
  return `En este caso, ${escenario}. Cada alternativa presenta datos numéricos distintos (cantidades, costos unitarios, tiempos o consumos) que requieren modelación matemática. Para resolver el reto, el grupo deberá representar la situación mediante expresiones vinculadas con ${focoPrincipal}, aplicar ${focoSecundario}, comparar resultados y justificar cuál opción ofrece mejores condiciones de eficiencia y viabilidad. Como producto final, elaborarán una recomendación técnica argumentada para el contexto${nivel} en ${materia}, explicando procedimiento, resultados y conclusión con claridad.`;
}

function asegurarMomento1Primero(estrategias: string[], input?: { habilidades?: any[]; materiaNombre?: string; grado?: string; tema?: string }) {
  const base = separarBloquesPorMomento(estrategias);
  const idxMomento1 = base.findIndex((linea) => normalizarParaBusqueda(linea).includes("momento 1: propuesta del problema"));
  const textoOriginal = idxMomento1 >= 0 ? base[idxMomento1] : "";
  const originalNormalizado = normalizarParaBusqueda(textoOriginal);
  const requiereReemplazo = !textoOriginal
    || originalNormalizado.includes("planteamiento de un problema real a resolver")
    || originalNormalizado.length < 90;
  const problemaReal = construirProblemaRealMomento1(input?.habilidades || [], input?.materiaNombre, input?.grado, input?.tema);
  const momento1Texto = requiereReemplazo
    ? `Momento 1: Propuesta del problema. ${problemaReal}`
    : textoOriginal;
  const resto = idxMomento1 >= 0 ? base.filter((_, i) => i !== idxMomento1) : base;
  return [momento1Texto, ...resto];
}

function construirMomentoEspecifico(numero: 2 | 3 | 4, input?: { habilidades?: any[]; materiaNombre?: string; grado?: string; tema?: string }) {
  const descripciones = (Array.isArray(input?.habilidades) ? input?.habilidades : [])
    .map((h: any) => String(h?.DescripcionHabilidad || h || "").trim())
    .map((h) => h
      .replace(/^[\-\*\u2022]\s*/, "")
      .replace(/^\d+(\.\d+)?\s*[:.-]?\s*/, "")
      .replace(/^habilidad\s+/i, ""))
    .filter(Boolean);
  const h1 = descripciones[0] || "la habilidad principal";
  const h2 = descripciones[1] || "la habilidad complementaria";

  if (numero === 2) {
    return `Momento 2: Trabajo estudiantil. En equipos, el estudiantado organiza los datos del caso (cantidades, costos y condiciones), plantea expresiones algebraicas para cada propuesta y simplifica los términos aplicando procedimientos vinculados con ${h1}. Luego contrasta resultados parciales, verifica unidades, interpreta el significado de cada operación y registra evidencia del proceso en una tabla de análisis del Plan A y Plan B.`;
  }
  if (numero === 3) {
    return `Momento 3: Discusión e intercambio. Cada equipo socializa su modelación, explica cómo aplicó ${h2} para sustentar sus resultados y responde preguntas de contraste sobre supuestos, errores de cálculo y validez del procedimiento. Con mediación docente, se comparan estrategias, se corrigen inconsistencias y se consolidan criterios comunes para decidir la propuesta más conveniente.`;
  }
  return `Momento 4: Cierre y formalización. De forma individual, cada estudiante redacta una recomendación técnica breve para la municipalidad, justificando la decisión final con evidencia matemática (expresión usada, simplificación realizada, resultado obtenido e interpretación). Se sistematizan los aprendizajes logrados, se explicitan los errores frecuentes detectados y se define una meta de mejora para futuras resoluciones de problemas contextualizados.`;
}

function asegurarMomentosEspecificos(estrategias: string[], input?: { habilidades?: any[]; materiaNombre?: string; grado?: string; tema?: string }) {
  const base = separarBloquesPorMomento(estrategias);

  const idx2 = base.findIndex((linea) => normalizarParaBusqueda(linea).includes("momento 2:"));
  const idx3 = base.findIndex((linea) => normalizarParaBusqueda(linea).includes("momento 3:"));
  const idx4 = base.findIndex((linea) => normalizarParaBusqueda(linea).includes("momento 4:"));

  const t2 = idx2 >= 0 ? base[idx2] : "";
  const t3 = idx3 >= 0 ? base[idx3] : "";
  const t4 = idx4 >= 0 ? base[idx4] : "";

  const gen2 = !t2 || normalizarParaBusqueda(t2).length < 120;
  const gen3 = !t3 || normalizarParaBusqueda(t3).length < 120;
  const gen4 = !t4 || normalizarParaBusqueda(t4).length < 120;

  const r2 = gen2 ? construirMomentoEspecifico(2, input) : t2;
  const r3 = gen3 ? construirMomentoEspecifico(3, input) : t3;
  const r4 = gen4 ? construirMomentoEspecifico(4, input) : t4;

  const resto = base.filter((_, i) => i !== idx2 && i !== idx3 && i !== idx4);
  return [...resto, r2, r3, r4];
}

export function ajustarIndicadoresPorHabilidad(input: { indicadoresEntrada: string[]; habilidades: any[]; permitirMultiples: boolean; indicacionesDocente?: string }) {
  const habilidades = Array.isArray(input.habilidades) ? input.habilidades : [];
  const cantidadObjetivo = Math.max(1, habilidades.length || 1);
  const cantidadPorHabilidad = cantidadesIndicadoresSolicitadas(
    String(input.indicacionesDocente || ""),
    cantidadObjetivo
  );
  const indicadoresEntrada = (Array.isArray(input.indicadoresEntrada) ? input.indicadoresEntrada : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const indicadoresPorHabilidad = Array.from({ length: cantidadObjetivo }, () => [] as string[]);
  const sinGrupo: string[] = [];

  for (const indicador of indicadoresEntrada) {
    const match = indicador.match(/^\s*(\d+)(?:\.(\d+))?\s*[\)\].:\-]?\s*(.+)$/);
    const indiceHabilidad = match ? Number(match[1]) - 1 : -1;
    const contenido = limpiarPrefijoIndicador(match?.[3] || indicador);
    if (indiceHabilidad >= 0 && indiceHabilidad < cantidadObjetivo) {
      indicadoresPorHabilidad[indiceHabilidad].push(contenido);
    } else {
      sinGrupo.push(contenido);
    }
  }

  if (sinGrupo.length) {
    const totalEsperado = cantidadPorHabilidad.reduce((suma, cantidad) => suma + cantidad, 0);
    if (sinGrupo.length === totalEsperado) {
      let cursor = 0;
      for (let i = 0; i < cantidadObjetivo; i += 1) {
        indicadoresPorHabilidad[i].push(...sinGrupo.slice(cursor, cursor + cantidadPorHabilidad[i]));
        cursor += cantidadPorHabilidad[i];
      }
    } else {
      for (let i = 0; i < sinGrupo.length; i += 1) {
        indicadoresPorHabilidad[i % cantidadObjetivo].push(sinGrupo[i]);
      }
    }
  }

  function construirVariacionIndicador(base: string, indice: number) {
    const limpio = String(base || "").trim().replace(/\.$/, "");
    if (indice === 1) return `${limpio}, justificando el procedimiento y la representación utilizada.`;
    if (indice === 2) return `${limpio} en una situación contextualizada con datos distintos y validando el resultado.`;
    if (indice === 3) return `${limpio}, comparando estrategias y explicando la más eficiente según el contexto.`;
    return `${limpio}, comunicando con claridad los pasos, resultados y criterios de decisión.`;
  }

  const salida: string[] = [];

  for (let i = 0; i < cantidadObjetivo; i += 1) {
    const descripcion = String(habilidades[i]?.DescripcionHabilidad || "").trim() || "la habilidad seleccionada";
    const base = convertirInicioATerceraPersonaSingular(descripcion);
    const limpio = String(base).replace(/^\d+(\.\d+)?\s*[\)\.\-:]?\s*/, "").trim();
    const totalSolicitado = Math.max(1, Number(cantidadPorHabilidad[i] || 1));
    const total = totalSolicitado;
    const redactadosPorIa = indicadoresPorHabilidad[i];
    for (let j = 1; j <= total; j += 1) {
      const referencia = redactadosPorIa[j - 1] || redactadosPorIa[0] || limpio;
      const indicadorIa = redactadosPorIa[j - 1]
        ? referencia
        : j === 1
          ? referencia
          : construirVariacionIndicador(referencia, j - 1);
      const texto = esIndicadorCopiaDeHabilidad(indicadorIa, descripcion)
        ? construirIndicadorObservableDesdeHabilidad(descripcion, input.indicacionesDocente)
        : indicadorIa;
      salida.push(`${i + 1}.${j} ${texto}`);
    }
  }

  return salida;
}

function normalizarIndicadorComparable(value: any) {
  return normalizarParaBusqueda(
    limpiarPrefijoIndicador(value)
      .replace(/^\d+(\.\d+)?\s*[\)\.\-:]?\s*/, "")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
  )
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function esIndicadorCopiaDeHabilidad(indicador: string, habilidad: string) {
  const indicadorNormalizado = normalizarIndicadorComparable(indicador);
  const habilidadNormalizada = normalizarIndicadorComparable(habilidad);
  if (!indicadorNormalizado || !habilidadNormalizada) return false;
  if (indicadorNormalizado === habilidadNormalizada) return true;

  const menor = Math.min(indicadorNormalizado.length, habilidadNormalizada.length);
  const mayor = Math.max(indicadorNormalizado.length, habilidadNormalizada.length);
  if (menor >= 30 && mayor > 0 && menor / mayor >= 0.82) {
    return indicadorNormalizado.includes(habilidadNormalizada) || habilidadNormalizada.includes(indicadorNormalizado);
  }

  const ignorar = new Set(["and", "or", "the", "with", "para", "por", "con", "las", "los", "una", "uno", "del", "de"]);
  const tokensIndicador = new Set(indicadorNormalizado.split(/\s+/).filter((token) => token.length > 2 && !ignorar.has(token)));
  const tokensHabilidad = habilidadNormalizada.split(/\s+/).filter((token) => token.length > 2 && !ignorar.has(token));
  if (tokensHabilidad.length < 4) return false;
  const coincidencias = tokensHabilidad.filter((token) => tokensIndicador.has(token)).length;
  return coincidencias / tokensHabilidad.length >= 0.9 && tokensIndicador.size <= tokensHabilidad.length + 3;
}

function construirIndicadorObservableDesdeHabilidad(habilidad: string, indicacionesDocente?: string) {
  const descripcion = limpiarPrefijoAprendizaje(habilidad).replace(/\.$/, "").trim() || "la habilidad seleccionada";
  const texto = normalizarParaBusqueda(`${habilidad} ${indicacionesDocente || ""}`);
  const pareceIngles = /\b(solve|acquire|understand|think|organize|self|learning|friendship|environment|communicat|listen|speak|write|read|student|students|classroom|oral|written)\b/.test(texto)
    || /\b(the|and|with|through|in|to|from|about|one|own)\b/.test(texto);

  if (pareceIngles) {
    if (/\bhealthy|health|well.?being|wellbeing|lives|promote\b/.test(texto)) {
      return `Identifies, explains, and supports healthy-life and well-being actions through a contextualized classroom product, using relevant vocabulary and clear oral or written evidence.`;
    }
    if (/\bfriend|friendship|environment|classroom|relationship\b/.test(texto)) {
      return `Describes and justifies respectful friendship or classroom-environment actions through a short oral or written product, using relevant vocabulary and observable participation evidence.`;
    }
    if (/\bmedia|social|network|communicat|message|information\b/.test(texto)) {
      return `Interprets and communicates key information about media or messages through a guided oral or written product with observable evidence of understanding.`;
    }
    return `Explains or applies key ideas related to ${descripcion} through a contextualized classroom product, guided oral or written responses, and clear evidence of performance.`;
  }

  if (/\bsalud|saludable|bienestar|vida|vidas|promover\b/.test(texto)) {
    return "Identifica, explica y justifica acciones de vida saludable y bienestar mediante un producto contextualizado, vocabulario pertinente y evidencia oral o escrita observable.";
  }
  return `Explica o aplica ideas clave relacionadas con ${descripcion} mediante un producto contextualizado, respuestas orales o escritas guiadas y evidencia observable de desempeño.`;
}

function requiereUsoMandatorioDocumento(indicacionesDocente: string, documentoApoyoTexto?: string) {
  const texto = normalizarParaBusqueda(indicacionesDocente);
  const hayDocumento = Boolean(String(documentoApoyoTexto || "").trim());
  if (!hayDocumento) return false;
  const pideEjemplo = texto.includes("usar un ejemplo") || texto.includes("use un ejemplo") || texto.includes("tomar un ejemplo");
  const pideLiteral = texto.includes("copie de forma literal") || texto.includes("copiar de forma literal") || texto.includes("literal");
  const pidePagina = texto.includes("pagina") || texto.includes("página");
  return (pideEjemplo || pideLiteral) && pidePagina;
}

function requiereUsoMandatorioCondicionales(indicacionesDocente: string, documentoApoyoTexto?: string) {
  const hayIndicaciones = Boolean(String(indicacionesDocente || "").trim());
  const hayDocumento = Boolean(String(documentoApoyoTexto || "").trim());
  return hayIndicaciones || hayDocumento;
}

function limpiarPrefijoAprendizaje(value: any) {
  return String(value || "")
    .trim()
    .replace(/^[\-\*\u2022]\s*/, "")
    .replace(/^\d+(\.\d+)?\s*[\)\.\-:]?\s*/, "")
    .replace(/^habilidad\s+/i, "");
}

function limpiarPrefijoIndicador(value: any) {
  return String(value || "")
    .trim()
    .replace(/^[\-\*\u2022]\s*/, "")
    .replace(/^indicador\s+\d+(\.\d+)?\s*[:.-]?\s*/i, "")
    .replace(/^identifica\s+y\s+aplica\s+/i, "")
    .replace(/\bhabilidad\s+(\d+\s*:)/gi, "$1");
}

function convertirInicioATerceraPersonaSingular(texto: string) {
  const raw = String(texto || "").trim();
  if (!raw) return raw;

  const match = raw.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)(\b.*)$/);
  if (!match) return raw;

  const verbo = match[1];
  const resto = match[2] || "";
  const lower = verbo.toLowerCase();

  let convertido = verbo;
  if (/(ar)$/.test(lower)) {
    convertido = `${verbo.slice(0, -2)}a`;
  } else if (/(er|ir)$/.test(lower)) {
    convertido = `${verbo.slice(0, -2)}e`;
  }

  const capitalizado = convertido.charAt(0).toUpperCase() + convertido.slice(1).toLowerCase();
  return `${capitalizado}${resto}`.trim();
}

function corregirErroresOrtograficosTexto(value: any) {
  let text = String(value || "");
  if (!text) return text;
  text = text.replace(/\bcontrue\b/gi, "Construye");
  text = text.replace(/\bconstrue\b/gi, "Construye");
  text = text.replace(/\bconstruie\b/gi, "Construye");
  return text;
}

function corregirErroresOrtograficosLista(values: any[]) {
  return (Array.isArray(values) ? values : [])
    .map((item) => corregirErroresOrtograficosTexto(item))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function pideAdecuacionSignificativa(indicacionesDocente: string) {
  const texto = normalizarParaBusqueda(indicacionesDocente);
  return texto.includes("adecuacion significativa")
    || texto.includes("adecuaciones significativas")
    || texto.includes("adecuacion curricular significativa")
    || texto.includes("alumnos con adecuacion")
    || texto.includes("estudiantes con adecuacion");
}

function pideColorAzul(indicacionesDocente: string) {
  const texto = normalizarParaBusqueda(indicacionesDocente);
  return texto.includes("azul") || texto.includes("pintamela") || texto.includes("pintarla") || texto.includes("resaltala") || texto.includes("resaltar");
}

export function construirAdecuacionSignificativa(input: {
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  usarAzul: boolean;
  idioma?: "es" | "en";
}) {
  const habilidades = (Array.isArray(input.habilidades) ? input.habilidades : [])
    .map((habilidad) => String(habilidad?.DescripcionHabilidad || habilidad || "").trim())
    .filter(Boolean);
  const habilidadesTexto = (habilidades.join("; ") || input.tema || "las habilidades seleccionadas").slice(0, 1200);
  const prefijo = input.usarAzul ? "[AZUL] " : "";
  const contexto = [input.materiaNombre, input.grado, input.mes, input.tema].filter(Boolean).join(" - ");
  const idioma = input.idioma || "es";

  if (idioma === "en") {
    const detalle = {
      aplica: true,
      colorResaltado: input.usarAzul ? "azul" : "",
      titulo: "Mediation strategy for significant curricular accommodation",
      proposito: `Support active participation through an adjusted activity directly aligned with: ${habilidadesTexto}.`,
      actividadAdaptada: `Present a central task related to ${habilidadesTexto} in short, sequential steps, with fewer items, guided examples and alternative ways to respond orally, graphically, practically or in writing.`,
      apoyoDocente: "Provide initial modeling, brief instructions, individual support, guided questions, frequent comprehension checks and formative feedback.",
      recursoAjustado: `Use visual supports, graphic organizers, concrete or digital resources and examples specifically related to ${habilidadesTexto}, selected according to the subject and classroom context.`,
      productoEsperado: `Produce brief and observable evidence that demonstrates progress in ${habilidadesTexto}, using the response format that best fits the student's needs.`,
      evaluacionAjustada: "Assess through direct observation, review of the adapted product, brief explanation and completion of essential steps, prioritizing individual progress."
    };
    const textoVisible = `${prefijo}${detalle.titulo}:
Purpose of the adaptation: ${detalle.proposito}
Adapted activity: ${detalle.actividadAdaptada}
Teacher support: ${detalle.apoyoDocente}
Adjusted material or resource: ${detalle.recursoAjustado}
Expected product: ${detalle.productoEsperado}
Adjusted assessment: ${detalle.evaluacionAjustada}`;
    return { ...detalle, textoVisible };
  }

  const detalle = {
    aplica: true,
    colorResaltado: input.usarAzul ? "azul" : "",
    titulo: "Estrategia de mediación para adecuación significativa",
    proposito: `Favorecer la participación activa mediante una actividad ajustada y vinculada directamente con: ${habilidadesTexto}.`,
    actividadAdaptada: `Presentar una tarea central relacionada con ${habilidadesTexto} en pasos breves y secuenciales, con menor cantidad de ejercicios, ejemplos guiados y alternativas para responder de forma oral, gráfica, práctica o escrita.`,
    apoyoDocente: "Brindar modelaje inicial, instrucciones breves, acompañamiento individual, preguntas guiadas, verificación frecuente de comprensión y retroalimentación formativa.",
    recursoAjustado: `Utilizar apoyos visuales, organizadores gráficos, recursos concretos o digitales y ejemplos relacionados específicamente con ${habilidadesTexto}, seleccionados según la asignatura y el contexto ${contexto || "del grupo"}.`,
    productoEsperado: `Elaborar una evidencia breve y observable que demuestre avance en ${habilidadesTexto}, mediante el formato de respuesta que mejor se ajuste a las necesidades del estudiante.`,
    evaluacionAjustada: "Valorar mediante observación directa, revisión del producto adaptado, explicación breve y cumplimiento de pasos esenciales, priorizando el progreso individual."
  };
  const textoVisible = `${prefijo}${detalle.titulo}:
Propósito de la adaptación: ${detalle.proposito}
Actividad adaptada: ${detalle.actividadAdaptada}
Apoyo docente: ${detalle.apoyoDocente}
Material o recurso ajustado: ${detalle.recursoAjustado}
Producto esperado: ${detalle.productoEsperado}
Forma de evaluación ajustada: ${detalle.evaluacionAjustada}`;
  return { ...detalle, textoVisible };
}

function palabrasClaveContextoAdecuacion(input: {
  indicacionesDocente?: string;
  materiaNombre?: string;
  grado?: string;
  tema?: string;
  habilidades?: any[];
}) {
  const stopwords = new Set([
    "adecuacion", "adecuaciones", "curricular", "significativa", "significativas",
    "estudiante", "estudiantes", "persona", "docente", "actividad", "actividades",
    "habilidad", "habilidades", "grado", "materia", "tema", "nivel", "competencia",
    "trabajo", "producto", "recurso", "apoyo", "proposito", "evaluacion", "forma",
    "incluir", "incluya", "solicita", "solicito", "regular", "seleccionada",
    "seleccionadas", "numero", "numeros", "indicacion", "indicaciones"
  ]);
  const texto = [
    input.indicacionesDocente,
    input.materiaNombre,
    input.grado,
    input.tema,
    ...(Array.isArray(input.habilidades) ? input.habilidades.map((habilidad) =>
      `${habilidad?.Area || ""} ${habilidad?.NumeroHabilidad || ""} ${habilidad?.DescripcionHabilidad || habilidad || ""}`
    ) : [])
  ].join(" ");

  return Array.from(new Set(
    normalizarParaBusqueda(texto)
      .split(/[^a-z0-9]+/i)
      .map((palabra) => palabra.trim())
      .filter((palabra) => palabra.length >= 5 && !stopwords.has(palabra))
  )).slice(0, 80);
}

function normalizarAdecuacionSignificativaExistente(
  raw: any,
  textoEstrategias: string,
  input: {
    indicacionesDocente: string;
    materiaNombre: string;
    grado: string;
    tema: string;
    habilidades: any[];
    usarAzul: boolean;
  }
) {
  const rawObj = raw && typeof raw === "object" ? raw : {};
  const campos = [
    "proposito",
    "actividadAdaptada",
    "apoyoDocente",
    "recursoAjustado",
    "productoEsperado",
    "evaluacionAjustada"
  ];
  const partes = [
    rawObj.titulo,
    rawObj.textoVisible,
    rawObj.texto,
    ...campos.map((campo) => rawObj[campo]),
    textoEstrategias
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const textoCompleto = partes.join("\n");
  if (!textoCompleto.trim()) return null;

  const camposDetallados = campos.filter((campo) => normalizeText(rawObj[campo]).length >= 35).length;
  const tieneDetalleSustantivo = textoCompleto.length >= 250 || camposDetallados >= 3;
  const textoNormalizado = normalizarParaBusqueda(textoCompleto);
  const claves = palabrasClaveContextoAdecuacion(input);
  const coincideConContextoActual = claves.some((clave) => textoNormalizado.includes(clave));
  if (!tieneDetalleSustantivo || !coincideConContextoActual) return null;

  const titulo = normalizeText(rawObj.titulo) || "Estrategia de mediación para adecuación significativa";
  let textoVisible = normalizeText(rawObj.textoVisible || textoEstrategias);
  if (!textoVisible) {
    textoVisible = [
      titulo,
      ...campos
        .map((campo) => normalizeText(rawObj[campo]))
        .filter(Boolean)
    ].join("\n");
  }
  if (input.usarAzul && !/^\[AZUL\]/i.test(textoVisible)) {
    textoVisible = `[AZUL] ${textoVisible}`;
  }

  return {
    ...rawObj,
    aplica: true,
    colorResaltado: input.usarAzul ? "azul" : normalizeText(rawObj.colorResaltado || ""),
    titulo,
    textoVisible
  };
}

export function aplicarReglasObligatoriasPlaneamiento(resultadoEntrada: any, input: {
  indicacionesDocente: string;
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  documentoApoyoTexto?: string;
  estructuraEstrategiasReferencia?: string[];
  usaReferenciaEstrategias?: boolean;
}) {
  const resultado = resultadoEntrada && typeof resultadoEntrada === "object" ? { ...resultadoEntrada } : {};
  const indicacionesDocente = input.indicacionesDocente || "";
  const requiereAdecuacion = pideAdecuacionSignificativa(indicacionesDocente);
  const requiereAzul = pideColorAzul(indicacionesDocente);
  const permitirMultiples = permiteMultiplesIndicadoresPorHabilidad(indicacionesDocente);
  resultado.mes = normalizeText(input.mes);
  resultado.grado = normalizeText(input.grado);
  resultado.materiaNombre = normalizeText(input.materiaNombre);
  resultado.MateriaNombre = resultado.materiaNombre;

  if (!Array.isArray(resultado.estrategiasMediacion)) {
    resultado.estrategiasMediacion = splitLines(resultado.estrategiasMediacion);
  }
  const estrategiasLimpias = limpiarEstrategiasMediacion(resultado.estrategiasMediacion);
  if (input.usaReferenciaEstrategias) {
    // Algunas directrices pedagógicas históricas aún devuelven "Momento 1–4".
    // La referencia seleccionada prevalece: sustituimos solo esos encabezados
    // genéricos por los encabezados reales, sin alterar su contenido.
    resultado.estrategiasMediacion = alinearMomentosConReferencia(
      estrategiasLimpias,
      input.estructuraEstrategiasReferencia || []
    );
  } else {
    resultado.estrategiasMediacion = asegurarMomentosEspecificos(
        asegurarMomento1Primero(estrategiasLimpias, {
          habilidades: input.habilidades,
          materiaNombre: input.materiaNombre,
          grado: input.grado,
          tema: input.tema
        }),
        {
          habilidades: input.habilidades,
          materiaNombre: input.materiaNombre,
          grado: input.grado,
          tema: input.tema
        }
      );
  }

  resultado.indicadoresEvaluacion = ajustarIndicadoresPorHabilidad({
    indicadoresEntrada: splitLines(resultado.indicadoresEvaluacion),
    habilidades: input.habilidades,
    permitirMultiples,
    indicacionesDocente
  });

  resultado.aprendizajesEsperados = corregirErroresOrtograficosLista(splitLines(resultado.aprendizajesEsperados));
  resultado.saberesEsenciales = corregirErroresOrtograficosLista(
    splitLines(resultado.saberesEsenciales).length
      ? splitLines(resultado.saberesEsenciales)
      : splitLines(resultado.criteriosEvaluacion).length
        ? splitLines(resultado.criteriosEvaluacion)
        : input.habilidades.map((habilidad) => String(habilidad?.DescripcionHabilidad || "").trim()).filter(Boolean)
  );
  resultado.criteriosEvaluacion = corregirErroresOrtograficosLista(
    splitLines(resultado.criteriosEvaluacion).length
      ? splitLines(resultado.criteriosEvaluacion)
      : input.habilidades.map((habilidad) => String(habilidad?.DescripcionHabilidad || "").trim()).filter(Boolean)
  );
  resultado.indicadoresEvaluacion = corregirErroresOrtograficosLista(splitLines(resultado.indicadoresEvaluacion));
  resultado.estrategiasMediacion = corregirErroresOrtograficosLista(splitLines(resultado.estrategiasMediacion));
  resultado.camposReferencia = resultado.camposReferencia && typeof resultado.camposReferencia === "object"
    ? Object.fromEntries(
        Object.entries(resultado.camposReferencia)
          .map(([key, value]) => [String(key || "").trim(), String(value || "").trim()])
          .filter(([key]) => key && !esCampoMetadataFijo(key))
      )
    : {};

  resultado.observaciones = "";

  const esBloqueAdecuacion = (item: any) => {
    const texto = normalizarParaBusqueda(item);
    return texto.includes("adecuacion significativa") || texto.includes("adecuacion curricular significativa");
  };
  const bloquesAdecuacionExistentes = resultado.estrategiasMediacion.filter(esBloqueAdecuacion);
  const adecuacionExistente = requiereAdecuacion
    ? normalizarAdecuacionSignificativaExistente(
        resultado.estrategiaAdecuacionSignificativa,
        bloquesAdecuacionExistentes.join("\n\n"),
        {
          indicacionesDocente,
          materiaNombre: input.materiaNombre,
          grado: input.grado,
          tema: input.tema,
          habilidades: input.habilidades,
          usarAzul: requiereAzul
        }
      )
    : null;
  resultado.estrategiasMediacion = resultado.estrategiasMediacion.filter(
    (item: any) => !esBloqueAdecuacion(item)
  );

  if (!requiereAdecuacion) {
    delete resultado.estrategiaAdecuacionSignificativa;
    return resultado;
  }

  const idiomaAdecuacion = detectarIdiomaSalida(
    resultado?.enfoque,
    splitLines(resultado?.aprendizajesEsperados).join("\n"),
    splitLines(resultado?.estrategiasMediacion).join("\n")
  );
  const adecuacion = adecuacionExistente || construirAdecuacionSignificativa({
    materiaNombre: input.materiaNombre,
    grado: input.grado,
    mes: input.mes,
    tema: input.tema,
    habilidades: input.habilidades,
    usarAzul: requiereAzul,
    idioma: idiomaAdecuacion
  });
  resultado.estrategiasMediacion.push(adecuacion.textoVisible);
  resultado.estrategiaAdecuacionSignificativa = adecuacion;

  const observaciones = String(resultado.observaciones || "").trim();
  const nota = `Indicaciones dadas a la IA: ${indicacionesDocente}`;
  resultado.observaciones = observaciones.includes("Indicaciones dadas a la IA")
    ? observaciones
    : [observaciones, nota].filter(Boolean).join("\n\n");

  return resultado;
}


function isProfesorOnly(req: any) {
  return hasAnyRole(req, ["PROFESOR", "PROFESOR_GUIA"]) && !hasAnyRole(req, ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
}

async function getAsignacionPlaneamientoPermitida(req: any, pool: any, input: { grupoId: number; materiaId: number; anioLectivoId: number; periodoId: number }) {
  const institucionId = getAuth(req).institucionId ?? null;
  const usuarioId = getAuth(req).usuarioId ?? getAuth(req).userId ?? null;
  if (!institucionId) return null;

  const request = pool.request()
    .input("institucionId", sql.Int, Number(institucionId))
    .input("grupoId", sql.Int, input.grupoId)
    .input("materiaId", sql.Int, input.materiaId)
    .input("anioLectivoId", sql.Int, input.anioLectivoId)
    .input("periodoId", sql.Int, input.periodoId)
    .input("usuarioId", sql.Int, usuarioId ? Number(usuarioId) : null);

  const filtroProfesor = isProfesorOnly(req) ? "AND ad.UsuarioId = @usuarioId" : "";

  const result = await request.query(`
    SELECT TOP 1
      ad.AsignacionDocenteId,
      ad.UsuarioId,
      ad.InstitucionId,
      ad.GrupoId,
      ad.MateriaId,
      ad.AnioLectivoId,
      ad.PeriodoId
    FROM dbo.AsignacionDocente ad
    WHERE ad.Activo = 1
      AND ad.InstitucionId = @institucionId
      AND ad.GrupoId = @grupoId
      AND ad.MateriaId = @materiaId
      AND ad.AnioLectivoId = @anioLectivoId
      AND ad.PeriodoId = @periodoId
      ${filtroProfesor}
  `);

  return result.recordset[0] || null;
}

async function ensurePlaneamientoAsignacion(req: any, res: any, pool: any, input: { grupoId: number | null; materiaId: number | null; anioLectivoId: number | null; periodoId: number | null }) {
  if (!input.grupoId || !input.materiaId || !input.anioLectivoId || !input.periodoId) return null;
  const asignacion = await getAsignacionPlaneamientoPermitida(req, pool, {
    grupoId: input.grupoId,
    materiaId: input.materiaId,
    anioLectivoId: input.anioLectivoId,
    periodoId: input.periodoId
  });
  if (!asignacion) {
    forbidden(res, "No tenés permisos para generar o guardar planeamientos en ese grupo y materia");
    return false;
  }
  return asignacion;
}

router.get("/catalogos", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const pool = await getPool();
    await ensurePlaneamientoHabilidadDisponibilidad(pool);

    const [materias, anios, periodos, grupos, filtros] = await Promise.all([
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("esSuperAdmin", sql.Bit, canUseGlobalRows(req) ? 1 : 0)
        .query(`
          SELECT
            MIN(MateriaId) AS MateriaId,
            MIN(Codigo) AS Codigo,
            Nombre,
            MIN(Descripcion) AS Descripcion,
            CAST(1 AS bit) AS Activo
          FROM dbo.Materia
          WHERE (@esSuperAdmin = 1 OR InstitucionId = @institucionId)
            AND Activa = 1
          GROUP BY Nombre
          ORDER BY Nombre
        `),
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT AnioLectivoId, Nombre, FechaInicio, FechaFin, Activo
          FROM dbo.AnioLectivo
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY FechaInicio DESC
        `),
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT p.PeriodoId, p.AnioLectivoId, p.Nombre, p.NumeroOrden, p.Activo, a.Nombre AS AnioNombre
          FROM dbo.Periodo p
          INNER JOIN dbo.AnioLectivo a ON a.AnioLectivoId = p.AnioLectivoId
          WHERE a.InstitucionId = @institucionId
            AND p.Activo = 1
          ORDER BY a.FechaInicio DESC, p.NumeroOrden ASC
        `),
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT GrupoId, AnioLectivoId, Nombre, Nivel, Jornada, Activo
          FROM dbo.Grupo
          WHERE InstitucionId = @institucionId
            AND Activo = 1
          ORDER BY Nombre
        `),
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .input("esSuperAdmin", sql.Bit, canUseGlobalRows(req) ? 1 : 0)
        .query(`
          SELECT
            (SELECT DISTINCT TipoColegio FROM dbo.PlaneamientoHabilidad WHERE (@esSuperAdmin = 1 OR InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND TipoColegio IS NOT NULL FOR JSON PATH) AS TiposColegioJson,
            (SELECT DISTINCT Grado FROM dbo.PlaneamientoHabilidad WHERE (@esSuperAdmin = 1 OR InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Grado IS NOT NULL FOR JSON PATH) AS GradosJson,
            (SELECT DISTINCT Mes FROM dbo.PlaneamientoHabilidad WHERE (@esSuperAdmin = 1 OR InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Mes IS NOT NULL FOR JSON PATH) AS MesesJson,
            (SELECT DISTINCT Area FROM dbo.PlaneamientoHabilidad WHERE (@esSuperAdmin = 1 OR InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Area IS NOT NULL FOR JSON PATH) AS AreasJson
        `)
    ]);

    const row = filtros.recordset[0] || {};
    const parseDistinct = (value: string | null | undefined, key: string) => {
      try {
        return JSON.parse(value || "[]").map((x: any) => x[key]).filter(Boolean).sort();
      } catch {
        return [];
      }
    };

    ok(res, {
      materias: materias.recordset,
      anios: anios.recordset,
      periodos: periodos.recordset,
      grupos: grupos.recordset,
      tiposColegio: parseDistinct(row.TiposColegioJson, "TipoColegio"),
      grados: parseDistinct(row.GradosJson, "Grado"),
      meses: parseDistinct(row.MesesJson, "Mes"),
      areas: parseDistinct(row.AreasJson, "Area")
    });
  } catch (error) {
    console.error("Error cargando catálogos de planeamiento IA:", error);
    res.status(500).json({ ok: false, message: "Error interno al cargar catálogos de planeamiento IA" });
  }
});

router.get("/habilidades/instituciones", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "Solo Super admin puede administrar la disponibilidad de habilidades");
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT InstitucionId, COALESCE(NULLIF(NombreComercial, N''), Nombre) AS Nombre
      FROM dbo.Institucion
      WHERE Activo = 1
      ORDER BY COALESCE(NULLIF(NombreComercial, N''), Nombre)
    `);
    ok(res, result.recordset);
  } catch (error) {
    console.error("Error cargando colegios para habilidades:", error);
    res.status(500).json({ ok: false, message: "No se pudieron cargar los colegios" });
  }
});

router.get("/habilidades/resumen", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "Solo Super admin puede consultar el resumen de habilidades");
  try {
    const pool = await getPool();
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    const result = await pool.request().query(`
      DECLARE @Resumen TABLE (
        MateriaNombre NVARCHAR(200) NULL,
        Grado NVARCHAR(100) NULL,
        TipoColegio NVARCHAR(100) NULL,
        Activo BIT NOT NULL
      );

      INSERT INTO @Resumen (MateriaNombre, Grado, TipoColegio, Activo)
      SELECT
        COALESCE(m.Nombre, h.MateriaNombre, N'Sin materia'),
        COALESCE(NULLIF(h.Grado, N''), N'Sin grado'),
        COALESCE(NULLIF(h.TipoColegio, N''), N'Sin tipo'),
        h.Activo
      FROM dbo.PlaneamientoHabilidad h
      LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId;

      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN Activo = 1 THEN 1 ELSE 0 END) AS Activas,
        SUM(CASE WHEN Activo = 0 THEN 1 ELSE 0 END) AS Inactivas,
        COUNT(DISTINCT MateriaNombre) AS MateriasDistintas,
        COUNT(DISTINCT Grado) AS GradosDistintos,
        COUNT(DISTINCT TipoColegio) AS TiposColegioDistintos
      FROM @Resumen;

      SELECT TOP 6 MateriaNombre AS Label, COUNT(*) AS Cantidad
      FROM @Resumen GROUP BY MateriaNombre
      ORDER BY COUNT(*) DESC, MateriaNombre;

      SELECT TOP 6 Grado AS Label, COUNT(*) AS Cantidad
      FROM @Resumen GROUP BY Grado
      ORDER BY COUNT(*) DESC, Grado;

      SELECT TOP 6 TipoColegio AS Label, COUNT(*) AS Cantidad
      FROM @Resumen GROUP BY TipoColegio
      ORDER BY COUNT(*) DESC, TipoColegio;
    `);
    const totales = result.recordsets[0]?.[0] || {};
    ok(res, {
      total: Number(totales.Total || 0),
      activas: Number(totales.Activas || 0),
      inactivas: Number(totales.Inactivas || 0),
      materiasDistintas: Number(totales.MateriasDistintas || 0),
      gradosDistintos: Number(totales.GradosDistintos || 0),
      tiposColegioDistintos: Number(totales.TiposColegioDistintos || 0),
      porMateria: (result.recordsets[1] || []).map((row: any) => ({ label: row.Label, cantidad: Number(row.Cantidad || 0) })),
      porGrado: (result.recordsets[2] || []).map((row: any) => ({ label: row.Label, cantidad: Number(row.Cantidad || 0) })),
      porTipoColegio: (result.recordsets[3] || []).map((row: any) => ({ label: row.Label, cantidad: Number(row.Cantidad || 0) }))
    });
  } catch (error) {
    console.error("Error cargando resumen de habilidades:", error);
    res.status(500).json({ ok: false, message: "No se pudo cargar el resumen de habilidades" });
  }
});

router.get("/habilidades/exportar", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "Solo Super admin puede descargar las habilidades");
  try {
    const pool = await getPool();
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    const materiaId = toOptionalInt(req.query.materiaId);
    const grado = normalizeNullableText(req.query.grado);
    const mes = normalizeNullableText(req.query.mes);
    const filters: string[] = ["1 = 1"];
    const request = pool.request();
    if (materiaId) {
      request.input("materiaId", sql.Int, materiaId);
      filters.push("h.MateriaId = @materiaId");
    }
    if (grado) {
      request.input("grado", sql.NVarChar(100), grado);
      filters.push("h.Grado = @grado");
    }
    if (mes) {
      request.input("mes", sql.NVarChar(100), mes);
      filters.push("h.Mes = @mes");
    }
    const result = await request.query(`
      SELECT
        h.PlaneamientoHabilidadId AS [ID de habilidad],
        h.MateriaId,
        COALESCE(m.Nombre, h.MateriaNombre) AS Materia,
        h.TipoColegio AS [Tipo de colegio], h.Ciclo, h.Grado, h.Mes, h.Area,
        h.NumeroHabilidad AS [Número de habilidad], h.DescripcionHabilidad AS [Descripción de la habilidad],
        h.DocumentoReferencia AS [Documento de referencia],
        CASE WHEN h.Activo = 1 THEN N'Activa' ELSE N'Inactiva' END AS Estado,
        CASE WHEN h.DisponibleTodos = 1 THEN N'Todos los colegios' ELSE N'Colegios específicos' END AS Disponibilidad,
        CASE WHEN h.DisponibleTodos = 1 THEN N'' ELSE STUFF((SELECT N',' + CONVERT(NVARCHAR(20), hi.InstitucionId)
          FROM dbo.PlaneamientoHabilidadInstitucion hi
          WHERE hi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
          ORDER BY hi.InstitucionId
          FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, N'') END AS ColegiosIds,
        STUFF((SELECT N', ' + COALESCE(NULLIF(i.NombreComercial, N''), i.Nombre)
          FROM dbo.PlaneamientoHabilidadInstitucion hi
          INNER JOIN dbo.Institucion i ON i.InstitucionId = hi.InstitucionId
          WHERE hi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
          ORDER BY COALESCE(NULLIF(i.NombreComercial, N''), i.Nombre)
          FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, N'') AS Colegios
      FROM dbo.PlaneamientoHabilidad h
      LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(m.Nombre, h.MateriaNombre), h.Grado, ${monthOrderExpression("h")}, h.Area, h.NumeroHabilidad
    `);
    const sheet = XLSX.utils.json_to_sheet(result.recordset);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Habilidades");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="habilidades_planeamiento.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error("Error exportando habilidades:", error);
    res.status(500).json({ ok: false, message: "No se pudieron descargar las habilidades" });
  }
});

router.get("/habilidades", async (req, res) => {
  try {
    const esSuperAdmin = canUseGlobalRows(req);
    if (!esSuperAdmin && !isProfesorOnly(req)) {
      return forbidden(res, "Las habilidades solo están disponibles para docentes durante el planeamiento");
    }
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const materiaId = toOptionalInt(req.query.materiaId);
    const tipoColegio = normalizeNullableText(req.query.tipoColegio);
    const grado = normalizeNullableText(req.query.grado);
    const mes = normalizeNullableText(req.query.mes);
    const area = normalizeNullableText(req.query.area);
    const q = normalizeNullableText(req.query.q);
    const incluirInactivas = String(req.query.incluirInactivas || "false") === "true";

    const pool = await getPool();
    await ensurePlaneamientoHabilidadDisponibilidad(pool);

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("esSuperAdmin", sql.Bit, esSuperAdmin ? 1 : 0)
      .input("incluirInactivas", sql.Bit, incluirInactivas ? 1 : 0);

    const filters: string[] = [`(
      @esSuperAdmin = 1
      OR h.DisponibleTodos = 1
      OR EXISTS (
        SELECT 1
        FROM dbo.PlaneamientoHabilidadInstitucion hi
        WHERE hi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
          AND hi.InstitucionId = @institucionId
      )
    )`];

    if (!incluirInactivas) filters.push("h.Activo = 1");
    if (materiaId) {
      request.input("materiaId", sql.Int, materiaId);
      filters.push(`
        (
          h.MateriaId = @materiaId
          OR (
            LEN(LTRIM(RTRIM(COALESCE(NULLIF(h.MateriaNombre, N''), m.Nombre, N'')))) >= 4
            AND (
              UPPER(LTRIM(RTRIM(COALESCE(NULLIF(h.MateriaNombre, N''), m.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI
                LIKE N'%' + UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI + N'%'
              OR UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI
                LIKE N'%' + UPPER(LTRIM(RTRIM(COALESCE(NULLIF(h.MateriaNombre, N''), m.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI + N'%'
            )
          )
        )
      `);
    }
    if (tipoColegio) {
      request.input("tipoColegio", sql.NVarChar(100), tipoColegio);
      filters.push("h.TipoColegio = @tipoColegio");
    }
    if (grado) {
      request.input("grado", sql.NVarChar(100), grado);
      const gradoNumero = inferGradoNumero(grado);
      const gradoPrefijo = getGradoPrefijo(gradoNumero);
      const modalidadGrado = normalizarModalidadGrado(grado);
      request.input("gradoNumero", sql.Int, gradoNumero);
      request.input("gradoPrefijo", sql.NVarChar(20), gradoPrefijo ? `${gradoPrefijo}%` : null);
      request.input("modalidadGrado", sql.NVarChar(20), modalidadGrado);
      filters.push(`
        (
          (
            @gradoNumero IS NOT NULL
            AND (
              h.GradoNumero = @gradoNumero
              OR (
                h.GradoNumero IS NULL
                AND (
                  UPPER(LTRIM(RTRIM(ISNULL(h.Grado, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(LTRIM(RTRIM(@grado))) COLLATE Latin1_General_100_CI_AI
                  OR LTRIM(RTRIM(ISNULL(h.Grado, N''))) LIKE CAST(@gradoNumero AS NVARCHAR(10)) + N'%'
                  OR (
                    @gradoPrefijo IS NOT NULL
                    AND UPPER(LTRIM(RTRIM(ISNULL(h.Grado, N'')))) COLLATE Latin1_General_100_CI_AI LIKE @gradoPrefijo COLLATE Latin1_General_100_CI_AI
                  )
                )
              )
            )
          )
          OR (
            @gradoNumero IS NULL
            AND UPPER(LTRIM(RTRIM(ISNULL(h.Grado, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(LTRIM(RTRIM(@grado))) COLLATE Latin1_General_100_CI_AI
          )
        )
        AND ISNULL(NULLIF(UPPER(LTRIM(RTRIM(h.ModalidadGrado))) COLLATE Latin1_General_100_CI_AI, N''),
          CASE WHEN UPPER(REPLACE(ISNULL(h.Grado, N''), N' ', N'')) COLLATE Latin1_General_100_CI_AI LIKE N'%PN%' THEN N'PN' ELSE N'' END
        ) = ISNULL(@modalidadGrado, N'')
      `);
    }
    if (mes) {
      request.input("mes", sql.NVarChar(100), mes);
      filters.push("h.Mes = @mes");
    }
    if (area) {
      request.input("area", sql.NVarChar(150), area);
      filters.push("h.Area = @area");
    }
    if (q) {
      request.input("q", sql.NVarChar(300), `%${q}%`);
      filters.push("(h.DescripcionHabilidad LIKE @q OR h.Area LIKE @q OR h.NumeroHabilidad LIKE @q OR h.MateriaNombre LIKE @q)");
    }

    const result = await request.query(`
      SELECT TOP 500
        h.PlaneamientoHabilidadId,
        h.InstitucionId,
        h.MateriaId,
        COALESCE(m.Nombre, h.MateriaNombre) AS MateriaNombre,
        h.TipoColegio,
        h.Ciclo,
        h.Grado,
        h.Mes,
        h.Area,
        h.NumeroHabilidad,
        h.DescripcionHabilidad,
        h.DocumentoReferencia,
        h.UsuarioCreadorId,
        h.DisponibleTodos,
        (
          SELECT hi.InstitucionId
          FROM dbo.PlaneamientoHabilidadInstitucion hi
          WHERE hi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
          FOR JSON PATH
        ) AS InstitucionesDisponiblesJson,
        h.Activo,
        h.CreatedAt,
        h.UpdatedAt
      FROM dbo.PlaneamientoHabilidad h
      LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
      ${materiaId ? "CROSS JOIN (SELECT TOP 1 Nombre FROM dbo.Materia WHERE MateriaId = @materiaId) mref" : ""}
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE WHEN @incluirInactivas = 1 AND h.Activo = 0 THEN 0 ELSE 1 END,
        COALESCE(m.Nombre, h.MateriaNombre), h.Grado, ${monthOrderExpression("h")}, h.Area, TRY_CONVERT(INT, h.NumeroHabilidad), h.NumeroHabilidad
      OPTION (RECOMPILE)
    `);

    const habilidadesUnicas = Array.from(new Map(
      result.recordset.map((item: any) => [Number(item.PlaneamientoHabilidadId), {
        ...item,
        InstitucionesDisponibles: (() => {
          try {
            return JSON.parse(item.InstitucionesDisponiblesJson || "[]")
              .map((row: any) => Number(row.InstitucionId))
              .filter(Boolean);
          } catch {
            return [];
          }
        })()
      }])
    ).values());

    ok(res, habilidadesUnicas);
  } catch (error) {
    console.error("Error listando habilidades de planeamiento:", error);
    res.status(500).json({ ok: false, message: "No se pudieron cargar las habilidades" });
  }
});

router.post("/habilidades", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenés permisos para mantener habilidades");

  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const materiaId = toOptionalInt(req.body.materiaId);
    const materiaNombre = normalizeText(req.body.materiaNombre);
    const tipoColegioEntrada = normalizeText(req.body.tipoColegio);
    const cicloSolicitado = normalizeNullableText(req.body.ciclo);
    const gradoEntrada = normalizeText(req.body.grado);
    const mes = normalizeText(req.body.mes);
    const area = normalizeNullableText(req.body.area);
    const numeroHabilidad = normalizeNullableText(req.body.numeroHabilidad);
    const descripcionHabilidad = normalizeText(req.body.descripcionHabilidad);
    const documentoReferencia = normalizeNullableText(req.body.documentoReferencia);
    const disponibleTodos = String(req.body.disponibleTodos ?? "true") !== "false";
    const institucionesIds = toPositiveIntList(req.body.institucionesIds);

    if (!materiaId && !materiaNombre) return badRequest(res, "Debés indicar la materia");
    if (!tipoColegioEntrada) return badRequest(res, "Debés indicar el tipo de colegio");
    if (!gradoEntrada) return badRequest(res, "Debés indicar el grado");
    if (!mes) return badRequest(res, "Debés indicar el mes");
    if (!descripcionHabilidad) return badRequest(res, "Debés indicar la descripción de la habilidad");

    const gradoNormalizado = normalizarGradoConCiclo(gradoEntrada, cicloSolicitado);
    if ("error" in gradoNormalizado) return badRequest(res, gradoNormalizado.error);
    const tipoColegio = normalizarTipoColegio(tipoColegioEntrada);
    const ciclo = gradoNormalizado.ciclo;
    const grado = gradoNormalizado.grado;
    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    if (!disponibleTodos && !institucionesIds.length) return badRequest(res, "Seleccioná al menos un colegio o habilitá la habilidad para todos");
    const usuarioId = getUserId(req);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId || null)
      .input("materiaId", sql.Int, materiaId)
      .input("materiaNombre", sql.NVarChar(200), materiaNombre || null)
      .input("tipoColegio", sql.NVarChar(100), tipoColegio)
      .input("ciclo", sql.NVarChar(100), ciclo)
      .input("grado", sql.NVarChar(100), grado)
      .input("gradoNumero", sql.SmallInt, gradoNormalizado.gradoNumero)
      .input("modalidadGrado", sql.NVarChar(20), gradoNormalizado.modalidadGrado)
      .input("mes", sql.NVarChar(100), mes)
      .input("area", sql.NVarChar(150), area)
      .input("numeroHabilidad", sql.NVarChar(50), numeroHabilidad)
      .input("descripcionHabilidad", sql.NVarChar(sql.MAX), descripcionHabilidad)
      .input("documentoReferencia", sql.NVarChar(300), documentoReferencia)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.PlaneamientoHabilidad
          WHERE InstitucionId = @institucionId
            AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
            AND UPPER(ISNULL(MateriaNombre, N'')) = UPPER(ISNULL(@materiaNombre, N''))
            AND UPPER(ISNULL(TipoColegio, N'')) = UPPER(ISNULL(@tipoColegio, N''))
            AND UPPER(ISNULL(Grado, N'')) = UPPER(ISNULL(@grado, N''))
            AND UPPER(ISNULL(Mes, N'')) = UPPER(ISNULL(@mes, N''))
            AND UPPER(ISNULL(Area, N'')) = UPPER(ISNULL(@area, N''))
            AND UPPER(ISNULL(NumeroHabilidad, N'')) = UPPER(ISNULL(@numeroHabilidad, N''))
            AND UPPER(LTRIM(RTRIM(DescripcionHabilidad))) = UPPER(LTRIM(RTRIM(@descripcionHabilidad)))
        )
        BEGIN
          SELECT CAST(1 AS bit) AS Duplicado;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.PlaneamientoHabilidad
            (InstitucionId, UsuarioCreadorId, MateriaId, MateriaNombre, TipoColegio, Ciclo, Grado, GradoNumero, ModalidadGrado, Mes, Area, NumeroHabilidad, DescripcionHabilidad, DocumentoReferencia, Activo, CreatedAt)
          OUTPUT INSERTED.*, CAST(0 AS bit) AS Duplicado
          VALUES
            (@institucionId, @usuarioId, @materiaId, @materiaNombre, @tipoColegio, @ciclo, @grado, @gradoNumero, @modalidadGrado, @mes, @area, @numeroHabilidad, @descripcionHabilidad, @documentoReferencia, 1, SYSDATETIME())
        END
      `);

    if (result.recordset[0]?.Duplicado) return badRequest(res, "Ya existe una habilidad igual para esa materia, grado, mes y área");
    await guardarDisponibilidadHabilidad(pool, Number(result.recordset[0].PlaneamientoHabilidadId), disponibleTodos, institucionesIds);
    created(res, result.recordset[0], "Habilidad creada correctamente");
  } catch (error) {
    console.error("Error creando habilidad:", error);
    res.status(500).json({ ok: false, message: "No se pudo crear la habilidad" });
  }
});

router.put("/habilidades/:id", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenés permisos para mantener habilidades");

  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;

    const materiaId = toOptionalInt(req.body.materiaId);
    const materiaNombre = normalizeText(req.body.materiaNombre);
    const tipoColegioEntrada = normalizeText(req.body.tipoColegio);
    const cicloSolicitado = normalizeNullableText(req.body.ciclo);
    const gradoEntrada = normalizeText(req.body.grado);
    const mes = normalizeText(req.body.mes);
    const area = normalizeNullableText(req.body.area);
    const numeroHabilidad = normalizeNullableText(req.body.numeroHabilidad);
    const descripcionHabilidad = normalizeText(req.body.descripcionHabilidad);
    const documentoReferencia = normalizeNullableText(req.body.documentoReferencia);
    const disponibleTodos = String(req.body.disponibleTodos ?? "true") !== "false";
    const institucionesIds = toPositiveIntList(req.body.institucionesIds);

    if (!materiaId && !materiaNombre) return badRequest(res, "Debés indicar la materia");
    if (!tipoColegioEntrada) return badRequest(res, "Debés indicar el tipo de colegio");
    if (!gradoEntrada) return badRequest(res, "Debés indicar el grado");
    if (!mes) return badRequest(res, "Debés indicar el mes");
    if (!descripcionHabilidad) return badRequest(res, "Debés indicar la descripción de la habilidad");

    const gradoNormalizado = normalizarGradoConCiclo(gradoEntrada, cicloSolicitado);
    if ("error" in gradoNormalizado) return badRequest(res, gradoNormalizado.error);
    const tipoColegio = normalizarTipoColegio(tipoColegioEntrada);
    const ciclo = gradoNormalizado.ciclo;
    const grado = gradoNormalizado.grado;
    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    if (!disponibleTodos && !institucionesIds.length) return badRequest(res, "Seleccioná al menos un colegio o habilitá la habilidad para todos");
    const usuarioId = getUserId(req);
    const esAdminHabilidades = canMaintainAnyHabilidad(req);
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("esAdmin", sql.Bit, esAdminHabilidades ? 1 : 0)
      .input("usuarioId", sql.Int, usuarioId || null)
      .input("materiaId", sql.Int, materiaId)
      .input("materiaNombre", sql.NVarChar(200), materiaNombre || null)
      .input("tipoColegio", sql.NVarChar(100), tipoColegio)
      .input("ciclo", sql.NVarChar(100), ciclo)
      .input("grado", sql.NVarChar(100), grado)
      .input("gradoNumero", sql.SmallInt, gradoNormalizado.gradoNumero)
      .input("modalidadGrado", sql.NVarChar(20), gradoNormalizado.modalidadGrado)
      .input("mes", sql.NVarChar(100), mes)
      .input("area", sql.NVarChar(150), area)
      .input("numeroHabilidad", sql.NVarChar(50), numeroHabilidad)
      .input("descripcionHabilidad", sql.NVarChar(sql.MAX), descripcionHabilidad)
      .input("documentoReferencia", sql.NVarChar(300), documentoReferencia)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.PlaneamientoHabilidad
          WHERE PlaneamientoHabilidadId <> @id
            AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
            AND UPPER(ISNULL(MateriaNombre, N'')) = UPPER(ISNULL(@materiaNombre, N''))
            AND UPPER(ISNULL(TipoColegio, N'')) = UPPER(ISNULL(@tipoColegio, N''))
            AND UPPER(ISNULL(Grado, N'')) = UPPER(ISNULL(@grado, N''))
            AND UPPER(ISNULL(Mes, N'')) = UPPER(ISNULL(@mes, N''))
            AND UPPER(ISNULL(Area, N'')) = UPPER(ISNULL(@area, N''))
            AND UPPER(ISNULL(NumeroHabilidad, N'')) = UPPER(ISNULL(@numeroHabilidad, N''))
            AND UPPER(LTRIM(RTRIM(DescripcionHabilidad))) = UPPER(LTRIM(RTRIM(@descripcionHabilidad)))
        )
        BEGIN
          SELECT CAST(1 AS bit) AS Duplicado;
          RETURN;
        END

        UPDATE dbo.PlaneamientoHabilidad
        SET MateriaId = @materiaId,
            MateriaNombre = @materiaNombre,
            TipoColegio = @tipoColegio,
            Ciclo = @ciclo,
            Grado = @grado,
            GradoNumero = @gradoNumero,
            ModalidadGrado = @modalidadGrado,
            Mes = @mes,
            Area = @area,
            NumeroHabilidad = @numeroHabilidad,
            DescripcionHabilidad = @descripcionHabilidad,
            DocumentoReferencia = @documentoReferencia,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE PlaneamientoHabilidadId = @id
          AND @esAdmin = 1
      `);

    if (result.recordset[0]?.Duplicado) return badRequest(res, "Ya existe una habilidad igual para esa materia, grado, mes y área");
    if (!result.recordset.length) {
      return forbidden(res, "Solo podés modificar habilidades creadas por vos. Para otras, usá un perfil administrativo.");
    }
    await guardarDisponibilidadHabilidad(pool, id, disponibleTodos, institucionesIds);
    ok(res, result.recordset[0], "Habilidad actualizada correctamente");
  } catch (error) {
    console.error("Error actualizando habilidad:", error);
    res.status(500).json({ ok: false, message: "No se pudo actualizar la habilidad" });
  }
});

router.delete("/habilidades/:id", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenés permisos para mantener habilidades");

  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;
    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    const usuarioId = getUserId(req);
    const esAdminHabilidades = canMaintainAnyHabilidad(req);

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("esAdmin", sql.Bit, esAdminHabilidades ? 1 : 0)
      .input("usuarioId", sql.Int, usuarioId || null)
      .query(`
        UPDATE dbo.PlaneamientoHabilidad
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoHabilidadId = @id
          AND @esAdmin = 1
      `);

    if (!result.rowsAffected?.[0]) {
      return forbidden(res, "Solo podés inhabilitar habilidades creadas por vos. Para otras, usá un perfil administrativo.");
    }
    ok(res, null, "Habilidad desactivada correctamente");
  } catch (error) {
    console.error("Error desactivando habilidad:", error);
    res.status(500).json({ ok: false, message: "No se pudo desactivar la habilidad" });
  }
});

router.patch("/habilidades/:id/reactivar", async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenés permisos para mantener habilidades");

  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    const id = toRequiredInt(req.params.id, "id", res);
    if (id === null) return;
    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    const usuarioId = getUserId(req);
    const esAdminHabilidades = canMaintainAnyHabilidad(req);

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("esAdmin", sql.Bit, esAdminHabilidades ? 1 : 0)
      .input("usuarioId", sql.Int, usuarioId || null)
      .query(`
        UPDATE dbo.PlaneamientoHabilidad
        SET Activo = 1, UpdatedAt = SYSDATETIME()
        WHERE PlaneamientoHabilidadId = @id
          AND @esAdmin = 1
      `);

    if (!result.rowsAffected?.[0]) {
      return forbidden(res, "Solo podés reactivar habilidades creadas por vos. Para otras, usá un perfil administrativo.");
    }
    ok(res, null, "Habilidad reactivada correctamente");
  } catch (error) {
    console.error("Error reactivando habilidad:", error);
    res.status(500).json({ ok: false, message: "No se pudo reactivar la habilidad" });
  }
});

router.get("/habilidades/plantilla", async (_req, res) => {
  try {
    const rows = [
      {
        Materia: "Matematica",
        Colegio: "Académico",
        Ciclo: "Tercer Ciclo",
        Grado: "7",
        Mes: "Febrero",
        Area: "Numeros",
        "Numero de Habilidad": "1",
        "Descripcion de la Habilidad": "Reconoce y representa numeros racionales en diferentes contextos.",
        "Documento de referencia": "Programa de estudio MEP"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const instrucciones = XLSX.utils.json_to_sheet([
      {
        Columna: "Materia",
        Requerido: "SI",
        Descripcion: "Nombre de la materia. Debe existir en el catalogo de materias de la institucion."
      },
      {
        Columna: "Colegio",
        Requerido: "SI",
        Descripcion: "Tipo de colegio. Valores permitidos: Académico, Técnico o Plan Nacional."
      },
      {
        Columna: "Ciclo",
        Requerido: "NO",
        Descripcion: "Se asigna automáticamente según el grado. Si se indica, debe coincidir exactamente: 1-3 Primer Ciclo; 4-6 Segundo Ciclo; 7-9 Tercer Ciclo; 10-12 Cuarto Ciclo."
      },
      {
        Columna: "Grado",
        Requerido: "SI",
        Descripcion: "Usá los valores normalizados 1 a 12. Para modalidad PN, usá por ejemplo: 7 PN, 10 PN o 12 PN. El sistema valida el ciclo correspondiente."
      },
      {
        Columna: "Mes",
        Requerido: "SI",
        Descripcion: "Mes de la habilidad. Ejemplo: Febrero."
      },
      {
        Columna: "Area",
        Requerido: "NO",
        Descripcion: "Area o eje tematico."
      },
      {
        Columna: "Numero de Habilidad",
        Requerido: "NO",
        Descripcion: "Numeracion de referencia. Ejemplo: 1, 2, 3."
      },
      {
        Columna: "Descripcion de la Habilidad",
        Requerido: "SI",
        Descripcion: "Texto de la habilidad."
      },
      {
        Columna: "Documento de referencia",
        Requerido: "NO",
        Descripcion: "Fuente de respaldo. Ejemplo: Programa de estudio MEP."
      },
      {
        Columna: "Disponibilidad de colegios",
        Requerido: "NO ES COLUMNA",
        Descripcion: "La disponibilidad para todos los colegios o colegios específicos se selecciona en la pantalla antes de importar el archivo."
      }
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Habilidades");
    XLSX.utils.book_append_sheet(workbook, instrucciones, "Instrucciones");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="plantilla_habilidades_planeamiento.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error("Error generando plantilla de habilidades:", error);
    res.status(500).json({ ok: false, message: "No se pudo generar la plantilla de habilidades" });
  }
});

router.post("/habilidades/importar-excel", upload.single("archivo"), async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenés permisos para importar habilidades");

  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;
    if (!req.file?.buffer) return badRequest(res, "Debes adjuntar un archivo Excel");

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return badRequest(res, "El Excel no contiene hojas");

    const rows = XLSX.utils.sheet_to_json<HabilidadRow>(workbook.Sheets[firstSheetName], { defval: "" });
    if (!rows.length) return badRequest(res, "El Excel no contiene registros");

    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    const disponibleTodos = String(req.body.disponibleTodos ?? "true") !== "false";
    const institucionesIds = toPositiveIntList(req.body.institucionesIds);
    if (!disponibleTodos && !institucionesIds.length) return badRequest(res, "Seleccioná al menos un colegio o habilitá las habilidades para todos");
    const usuarioId = getUserId(req);

    let insertados = 0;
    let duplicados = 0;
    let omitidos = 0;
    const resultados: any[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const fila = index + 2;

      try {
        const materiaNombre = limitRequiredText(row.Materia, 200);
        const tipoColegioEntrada = limitRequiredText(row.Colegio, 100);
        const cicloSolicitado = limitNullableText(row.Ciclo, 100);
        const gradoEntrada = limitRequiredText(row.Grado, 100);
        const mes = limitRequiredText(row.mes || row.Mes, 100);
        const area = limitNullableText(row.Area, 150);
        const numeroHabilidad = limitNullableText(row["Numero de Habilidad"] || row.NumeroHabilidad, 50);
        const descripcionHabilidad = limitRequiredText(row["Descripcion de la Habilidad"] || row.DescripcionHabilidad, 4000);
        const documentoReferencia = limitNullableText(row["Documento de referencia"] || row.DocumentoReferencia, 300);

        if (!materiaNombre || !tipoColegioEntrada || !gradoEntrada || !mes || !descripcionHabilidad) {
          omitidos += 1;
          resultados.push({
            fila,
            estado: "Omitido",
            motivo: "Faltan campos obligatorios"
          });
          continue;
        }

        const gradoNormalizado = normalizarGradoConCiclo(gradoEntrada, cicloSolicitado);
        if ("error" in gradoNormalizado) {
          omitidos += 1;
          resultados.push({ fila, estado: "Omitido", motivo: gradoNormalizado.error });
          continue;
        }
        const tipoColegio = normalizarTipoColegio(tipoColegioEntrada);
        const ciclo = gradoNormalizado.ciclo;
        const grado = gradoNormalizado.grado;

        const materiaId = await findMateriaId(pool, institucionId, materiaNombre);

        const duplicateResult = await pool.request()
          .input("institucionId", sql.Int, institucionId)
          .input("materiaId", sql.Int, materiaId)
          .input("materiaNombre", sql.NVarChar(200), materiaNombre)
          .input("tipoColegio", sql.NVarChar(100), tipoColegio)
          .input("grado", sql.NVarChar(100), grado)
          .input("mes", sql.NVarChar(100), mes)
          .input("area", sql.NVarChar(150), area)
          .input("numeroHabilidad", sql.NVarChar(50), numeroHabilidad)
          .input("descripcionHabilidad", sql.NVarChar(4000), descripcionHabilidad)
          .query(`
            SELECT TOP 1 PlaneamientoHabilidadId
            FROM dbo.PlaneamientoHabilidad
            WHERE InstitucionId = @institucionId
              AND ISNULL(MateriaId, 0) = ISNULL(@materiaId, 0)
              AND UPPER(ISNULL(MateriaNombre, N'')) = UPPER(ISNULL(@materiaNombre, N''))
              AND UPPER(ISNULL(TipoColegio, N'')) = UPPER(ISNULL(@tipoColegio, N''))
              AND UPPER(ISNULL(Grado, N'')) = UPPER(ISNULL(@grado, N''))
              AND UPPER(ISNULL(Mes, N'')) = UPPER(ISNULL(@mes, N''))
              AND UPPER(ISNULL(Area, N'')) = UPPER(ISNULL(@area, N''))
              AND UPPER(ISNULL(NumeroHabilidad, N'')) = UPPER(ISNULL(@numeroHabilidad, N''))
              AND UPPER(LTRIM(RTRIM(DescripcionHabilidad))) = UPPER(LTRIM(RTRIM(@descripcionHabilidad)))
          `);

        if (duplicateResult.recordset.length) {
          duplicados += 1;
          resultados.push({
            fila,
            estado: "Duplicado",
            motivo: "Ya existe una habilidad igual"
          });
          continue;
        }

        const insertResult = await pool.request()
          .input("institucionId", sql.Int, institucionId)
          .input("usuarioId", sql.Int, usuarioId || null)
          .input("materiaId", sql.Int, materiaId)
          .input("materiaNombre", sql.NVarChar(200), materiaNombre)
          .input("tipoColegio", sql.NVarChar(100), tipoColegio)
          .input("ciclo", sql.NVarChar(100), ciclo)
          .input("grado", sql.NVarChar(100), grado)
          .input("gradoNumero", sql.SmallInt, gradoNormalizado.gradoNumero)
          .input("modalidadGrado", sql.NVarChar(20), gradoNormalizado.modalidadGrado)
          .input("mes", sql.NVarChar(100), mes)
          .input("area", sql.NVarChar(150), area)
          .input("numeroHabilidad", sql.NVarChar(50), numeroHabilidad)
          .input("descripcionHabilidad", sql.NVarChar(4000), descripcionHabilidad)
          .input("documentoReferencia", sql.NVarChar(300), documentoReferencia)
          .query(`
            INSERT INTO dbo.PlaneamientoHabilidad
              (InstitucionId, UsuarioCreadorId, MateriaId, MateriaNombre, TipoColegio, Ciclo, Grado, GradoNumero, ModalidadGrado, Mes, Area, NumeroHabilidad, DescripcionHabilidad, DocumentoReferencia, Activo, CreatedAt)
            OUTPUT INSERTED.PlaneamientoHabilidadId
            VALUES
              (@institucionId, @usuarioId, @materiaId, @materiaNombre, @tipoColegio, @ciclo, @grado, @gradoNumero, @modalidadGrado, @mes, @area, @numeroHabilidad, @descripcionHabilidad, @documentoReferencia, 1, SYSDATETIME())
          `);

        await guardarDisponibilidadHabilidad(
          pool,
          Number(insertResult.recordset[0]?.PlaneamientoHabilidadId),
          disponibleTodos,
          institucionesIds
        );

        insertados += 1;
        resultados.push({
          fila,
          estado: "Insertado",
          habilidadId: insertResult.recordset[0]?.PlaneamientoHabilidadId || null
        });
      } catch (rowError: any) {
        omitidos += 1;
        resultados.push({
          fila,
          estado: "Error",
          motivo: rowError?.message || "No se pudo procesar la fila"
        });
      }
    }

    ok(
      res,
      {
        totalLeidos: rows.length,
        procesados: rows.length,
        insertados,
        duplicados,
        omitidos,
        resultados
      },
      "Importacion procesada correctamente"
    );
  } catch (error) {
    console.error("Error importando habilidades desde Excel:", error);
    res.status(500).json({ ok: false, message: "No se pudo importar el archivo de habilidades" });
  }
});

router.post("/habilidades/restaurar-grados-excel", upload.single("archivo"), async (req, res) => {
  if (!canMaintainHabilidades(req)) return forbidden(res, "Solo Super admin puede restaurar grados de habilidades");
  try {
    if (!req.file?.buffer) return badRequest(res, "Debés adjuntar el Excel de respaldo");
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return badRequest(res, "El Excel no contiene hojas");
    const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[firstSheetName], { defval: "" });
    if (!rows.length) return badRequest(res, "El Excel no contiene registros");

    const filasConId = rows.map((row) => {
      const id = Number(row["ID de habilidad"] || row.PlaneamientoHabilidadId || 0);
      if (!Number.isInteger(id) || id <= 0) return null;
      const gradoNormalizado = normalizarGradoConCiclo(row.Grado, row.Ciclo);
      if ("error" in gradoNormalizado) return null;
      const disponibilidad = normalizeForCompare(row.Disponibilidad);
      const colegiosIds = toPositiveIntList(row.ColegiosIds);
      return {
        id,
        materiaId: toOptionalInt(row.MateriaId),
        materia: normalizeText(row.Materia),
        tipoColegio: normalizarTipoColegio(row["Tipo de colegio"] || row.Colegio),
        ciclo: gradoNormalizado.ciclo,
        grado: gradoNormalizado.grado,
        gradoNumero: gradoNormalizado.gradoNumero,
        modalidadGrado: gradoNormalizado.modalidadGrado,
        mes: normalizeText(row.Mes || row.mes),
        area: normalizeText(row.Area),
        numeroHabilidad: normalizeText(row["Número de habilidad"] || row["Numero de Habilidad"] || row.NumeroHabilidad),
        descripcion: normalizeText(row["Descripción de la habilidad"] || row["Descripcion de la Habilidad"] || row.DescripcionHabilidad),
        documento: normalizeText(row["Documento de referencia"] || row.DocumentoReferencia),
        activo: normalizeForCompare(row.Estado) !== "INACTIVA",
        disponibleTodos: !disponibilidad || disponibilidad.includes("TODOS"),
        colegiosIds: colegiosIds.join(",")
      };
    }).filter(Boolean);

    if (filasConId.length) {
      const filasInvalidas = rows.length - filasConId.length;
      if (filasInvalidas) return badRequest(res, `Hay ${filasInvalidas} fila(s) sin ID o con grado/ciclo inválido`);
      const pool = await getPool();
      await ensurePlaneamientoHabilidadDisponibilidad(pool);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const request = new sql.Request(transaction)
          .input("filasJson", sql.NVarChar(sql.MAX), JSON.stringify(filasConId));
        const result = await request.query(`
          DECLARE @Actualizadas INT = 0;
          ;WITH Cambios AS (
            SELECT *
            FROM OPENJSON(@filasJson)
            WITH (
              Id INT '$.id', MateriaId INT '$.materiaId', Materia NVARCHAR(200) '$.materia',
              TipoColegio NVARCHAR(100) '$.tipoColegio', Ciclo NVARCHAR(100) '$.ciclo', Grado NVARCHAR(100) '$.grado',
              GradoNumero SMALLINT '$.gradoNumero', ModalidadGrado NVARCHAR(20) '$.modalidadGrado',
              Mes NVARCHAR(100) '$.mes', Area NVARCHAR(150) '$.area', NumeroHabilidad NVARCHAR(50) '$.numeroHabilidad',
              Descripcion NVARCHAR(MAX) '$.descripcion', Documento NVARCHAR(300) '$.documento',
              Activo BIT '$.activo', DisponibleTodos BIT '$.disponibleTodos', ColegiosIds NVARCHAR(MAX) '$.colegiosIds'
            )
          )
          UPDATE h
          SET MateriaId = COALESCE(c.MateriaId, h.MateriaId),
              MateriaNombre = NULLIF(c.Materia, N''), TipoColegio = c.TipoColegio, Ciclo = c.Ciclo,
              Grado = c.Grado, GradoNumero = c.GradoNumero, ModalidadGrado = c.ModalidadGrado,
              Mes = c.Mes, Area = NULLIF(c.Area, N''), NumeroHabilidad = NULLIF(c.NumeroHabilidad, N''),
              DescripcionHabilidad = c.Descripcion, DocumentoReferencia = NULLIF(c.Documento, N''),
              Activo = c.Activo, UpdatedAt = SYSDATETIME()
          FROM dbo.PlaneamientoHabilidad h
          INNER JOIN Cambios c ON c.Id = h.PlaneamientoHabilidadId;
          SET @Actualizadas = @@ROWCOUNT;

          DELETE hi
          FROM dbo.PlaneamientoHabilidadInstitucion hi
          INNER JOIN OPENJSON(@filasJson)
          WITH (Id INT '$.id') c ON c.Id = hi.PlaneamientoHabilidadId;

          INSERT INTO dbo.PlaneamientoHabilidadInstitucion (PlaneamientoHabilidadId, InstitucionId)
          SELECT c.Id, TRY_CONVERT(INT, value)
          FROM OPENJSON(@filasJson)
          WITH (Id INT '$.id', DisponibleTodos BIT '$.disponibleTodos', ColegiosIds NVARCHAR(MAX) '$.colegiosIds') c
          CROSS APPLY STRING_SPLIT(ISNULL(c.ColegiosIds, N''), N',')
          WHERE c.DisponibleTodos = 0 AND TRY_CONVERT(INT, value) IS NOT NULL;

          SELECT @Actualizadas AS Actualizadas;
        `);
        await transaction.commit();
        return ok(res, { leidas: rows.length, actualizadas: Number(result.recordset[0]?.Actualizadas || 0) }, "Habilidades actualizadas desde el Excel");
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    // Si el archivo incluye "Grado correguido", la descripción (columna H) es la llave
    // indicada por el usuario y ese valor es la fuente definitiva del grado.
    const correcciones = rows.map((row) => {
      const grado = normalizarGradoRespaldo(row["Grado correguido"], row.Ciclo);
      const descripcion = normalizeText(row["Descripción de la habilidad"]);
      return grado && descripcion ? { descripcion, ...grado } : null;
    }).filter(Boolean);

    if (correcciones.length) {
      const pool = await getPool();
      await ensurePlaneamientoHabilidadDisponibilidad(pool);
      const result = await pool.request()
        .input("correccionesJson", sql.NVarChar(sql.MAX), JSON.stringify(correcciones))
        .query(`
          ;WITH Correcciones AS (
            SELECT Descripcion, Grado, GradoNumero, ModalidadGrado
            FROM OPENJSON(@correccionesJson)
            WITH (
              Descripcion NVARCHAR(MAX) '$.descripcion', Grado NVARCHAR(100) '$.grado',
              GradoNumero SMALLINT '$.gradoNumero', ModalidadGrado NVARCHAR(20) '$.modalidadGrado'
            )
          ),
          CorreccionesUnicas AS (
            SELECT Descripcion, MIN(Grado) AS Grado, MIN(GradoNumero) AS GradoNumero, MIN(ModalidadGrado) AS ModalidadGrado
            FROM Correcciones
            GROUP BY Descripcion
            HAVING COUNT(DISTINCT Grado) = 1
          )
          UPDATE h
          SET Grado = c.Grado, GradoNumero = c.GradoNumero, ModalidadGrado = c.ModalidadGrado, UpdatedAt = SYSDATETIME()
          FROM dbo.PlaneamientoHabilidad h
          INNER JOIN CorreccionesUnicas c
            ON UPPER(LTRIM(RTRIM(h.DescripcionHabilidad))) COLLATE Latin1_General_100_CI_AI
             = UPPER(LTRIM(RTRIM(c.Descripcion))) COLLATE Latin1_General_100_CI_AI;

          SELECT @@ROWCOUNT AS Actualizadas;
        `);
      return ok(res, {
        leidas: rows.length,
        correcciones: correcciones.length,
        actualizadas: Number(result.recordset[0]?.Actualizadas || 0)
      }, "Grados actualizados desde el archivo de correcciones");
    }

    const respaldo = rows.map((row) => {
      const grado = normalizarGradoRespaldo(row.Grado, row.Ciclo);
      return grado ? {
        materia: normalizeText(row.Materia),
        tipoColegio: normalizeText(row["Tipo de colegio"]),
        ciclo: normalizeText(row.Ciclo),
        mes: normalizeText(row.Mes),
        area: normalizeText(row.Area),
        numeroHabilidad: normalizeText(row["Número de habilidad"]),
        descripcion: normalizeText(row["Descripción de la habilidad"]),
        documento: normalizeText(row["Documento de referencia"]),
        ...grado
      } : null;
    }).filter(Boolean);
    if (!respaldo.length) return badRequest(res, "El Excel no contiene grados que se puedan normalizar");

    const pool = await getPool();
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    const result = await pool.request()
      .input("respaldoJson", sql.NVarChar(sql.MAX), JSON.stringify(respaldo))
      .query(`
        ;WITH RespaldoGrados AS (
          SELECT Materia, TipoColegio, Ciclo, Mes, Area, NumeroHabilidad, Descripcion, Documento, Grado, GradoNumero, ModalidadGrado
          FROM OPENJSON(@respaldoJson)
          WITH (
            Materia NVARCHAR(200) '$.materia', TipoColegio NVARCHAR(100) '$.tipoColegio', Ciclo NVARCHAR(100) '$.ciclo',
            Mes NVARCHAR(100) '$.mes', Area NVARCHAR(150) '$.area', NumeroHabilidad NVARCHAR(50) '$.numeroHabilidad',
            Descripcion NVARCHAR(MAX) '$.descripcion', Documento NVARCHAR(300) '$.documento', Grado NVARCHAR(100) '$.grado',
            GradoNumero SMALLINT '$.gradoNumero', ModalidadGrado NVARCHAR(20) '$.modalidadGrado'
          )
        ),
        RespaldoUnico AS (
          SELECT Materia, TipoColegio, Ciclo, Mes, Area, NumeroHabilidad, Descripcion, Documento,
            MIN(Grado) AS Grado, MIN(GradoNumero) AS GradoNumero, MIN(ModalidadGrado) AS ModalidadGrado
          FROM RespaldoGrados
          GROUP BY Materia, TipoColegio, Ciclo, Mes, Area, NumeroHabilidad, Descripcion, Documento
          HAVING COUNT(DISTINCT Grado) = 1
        )
        UPDATE h
        SET Grado = r.Grado, GradoNumero = r.GradoNumero, ModalidadGrado = r.ModalidadGrado, UpdatedAt = SYSDATETIME()
        FROM dbo.PlaneamientoHabilidad h
        LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
        INNER JOIN RespaldoUnico r
          ON UPPER(LTRIM(RTRIM(COALESCE(m.Nombre, h.MateriaNombre, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Materia) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.TipoColegio, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.TipoColegio) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.Ciclo, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Ciclo) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.Mes, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Mes) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.Area, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Area) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.NumeroHabilidad, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.NumeroHabilidad) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.DescripcionHabilidad, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Descripcion) COLLATE Latin1_General_100_CI_AI
          AND UPPER(LTRIM(RTRIM(ISNULL(h.DocumentoReferencia, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(r.Documento) COLLATE Latin1_General_100_CI_AI
        WHERE h.Grado = N'1' AND h.GradoNumero = 1 AND r.GradoNumero <> 1;

        SELECT @@ROWCOUNT AS Recuperadas;
      `);
    ok(res, { leidas: rows.length, normalizables: respaldo.length, recuperadas: Number(result.recordset[0]?.Recuperadas || 0) }, "Grados restaurados desde el respaldo");
  } catch (error) {
    console.error("Error restaurando grados desde respaldo:", error);
    res.status(500).json({ ok: false, message: "No se pudieron restaurar los grados desde el respaldo" });
  }
});

function getUploadedFile(req: any, fieldName: string) {
  const files = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
  if (Array.isArray(files)) {
    return files.find((file) => file.fieldname === fieldName);
  }
  return files?.[fieldName]?.[0] || undefined;
}

function getUploadedFiles(req: any, fieldName: string) {
  const files = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
  if (Array.isArray(files)) {
    const normalized = fieldName.replace(/\[\]$/, "");
    return files.filter((file) => {
      const current = String(file.fieldname || "");
      return current === fieldName || current === normalized || current === `${normalized}[]`;
    });
  }
  const normalized = fieldName.replace(/\[\]$/, "");
  return [
    ...(files?.[fieldName] || []),
    ...(files?.[normalized] || []),
    ...(files?.[`${normalized}[]`] || [])
  ];
}

function isDocxFile(file?: Express.Multer.File) {
  if (!file?.buffer) return false;
  const nombre = file.originalname || "";
  const mime = String(file.mimetype || "").toLowerCase();
  return mime.includes("wordprocessingml.document") || /\.docx$/i.test(nombre);
}

function buildPlantillaFormatoDocx(file?: Express.Multer.File): PlantillaFormatoDocxGuardada | null {
  if (!isDocxFile(file)) return null;

  return {
    nombre: file?.originalname || "plantilla_formato.docx",
    mimeType: file?.mimetype || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: file?.buffer.toString("base64") || ""
  };
}

export function resolverArchivoMachoteObligatorio<T>(archivoReferencia?: T | null, plantillaOpcional?: T | null) {
  return archivoReferencia || plantillaOpcional || null;
}

function hydratePlantillaFormatoDocx(resultado: any) {
  if (!resultado || typeof resultado !== "object") return resultado;
  if (resultado.plantillaFormatoDocx?.base64) return resultado;
  delete resultado.plantillaFormatoCacheId;
  return resultado;
}

function preservePlantillaFormatoDocx(resultado: any, resultadoExistente: any) {
  if (!resultado || typeof resultado !== "object") return resultado;
  if (resultado.plantillaFormatoDocx?.base64) return resultado;

  const plantillaExistente = resultadoExistente?.plantillaFormatoDocx;
  if (!plantillaExistente?.base64) return resultado;

  resultado.plantillaFormatoDocx = {
    nombre: resultado.plantillaFormatoDocx?.nombre || plantillaExistente.nombre || resultado.plantillaFormatoNombre || "plantilla_formato.docx",
    mimeType: resultado.plantillaFormatoDocx?.mimeType || plantillaExistente.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: plantillaExistente.base64
  };
  resultado.plantillaFormatoNombre = resultado.plantillaFormatoNombre || plantillaExistente.nombre || null;
  return resultado;
}

function requiereMachoteWord(resultado: any) {
  if (!resultado || typeof resultado !== "object") return false;
  const nombre = normalizeText(
    resultado.plantillaFormatoDocx?.nombre
    || resultado.plantillaFormatoNombre
    || resultado.documentoReferenciaNombre
  );
  return /\.docx$/i.test(nombre)
    && Boolean(
      resultado.plantillaFormatoNombre
      || resultado.plantillaFormatoDocx?.nombre
      || resultado.controlCalidad?.usaMachote
    );
}

function tieneMachoteWordPersistido(resultado: any) {
  return Boolean(resultado?.plantillaFormatoDocx?.base64);
}

function referenciaWordEsObligatoria(resultado: any) {
  return Boolean(
    resultado?.controlCalidad?.referenciaObligatoria
    || resultado?.controlCalidad?.usaMachote
    || resultado?.plantillaFormatoNombre
    || resultado?.plantillaFormatoDocx?.nombre
  );
}

function mensajeMachoteWordFaltante() {
  return "La referencia Word obligatoria no está disponible dentro de este resultado. No se iniciará el guardado hasta que el .docx de referencia se haya conservado correctamente.";
}

function crearHuellaDocumentoWord(resultado: any, row: any, contenido: any) {
  const fuente = {
    version: "word-con-machote-v5-columnas-tecnicas-sin-repeticion",
    referencia: String(resultado?.plantillaFormatoDocx?.base64 || ""),
    nombre: String(row?.Nombre || contenido?.nombre || ""),
    materia: String(row?.MateriaNombre || resultado?.materiaNombre || ""),
    grupo: String(row?.GrupoId || ""),
    resultado: {
      aprendizajes: splitLines(resultado?.aprendizajesEsperados),
      saberes: splitLines(resultado?.saberesEsenciales),
      criterios: splitLines(resultado?.criteriosEvaluacion),
      estrategias: splitLines(resultado?.estrategiasMediacion),
      indicadores: splitLines(resultado?.indicadoresEvaluacion),
      semanas: Array.isArray(resultado?.semanas) ? resultado.semanas : [],
      camposReferencia: resultado?.camposReferencia || {},
      periodicidad: resultado?.periodicidad || "",
      competenciaGeneral: resultado?.competenciaGeneral || ""
    }
  };
  return createHash("sha256").update(JSON.stringify(fuente)).digest("hex");
}

function agregarVerificacionReferenciaWordPersistida(resultado: any, validacion: any, referenciaObligatoria: boolean) {
  if (!referenciaObligatoria && !requiereMachoteWord(resultado)) return validacion;

  const referenciaPersistida = tieneMachoteWordPersistido(resultado);
  const verificaciones = (validacion?.verificaciones || []).filter(
    (item: any) => item?.codigo !== "referencia_word_persistida"
  );
  verificaciones.unshift({
    codigo: "referencia_word_persistida",
    etiqueta: "Referencia Word obligatoria",
    estado: referenciaPersistida ? "ok" : "error",
    detalle: referenciaPersistida
      ? "La referencia Word quedó incluida con el resultado y se usará al generar el documento descargable."
      : mensajeMachoteWordFaltante()
  });
  const tieneErrores = verificaciones.some((item: any) => item?.estado === "error");
  return {
    ...validacion,
    valido: !tieneErrores,
    puedeGuardar: !tieneErrores,
    verificaciones
  };
}

function decodeXmlEntities(value: string) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function xmlWordToText(xml: string) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<[^>]*\btab\b[^>]*\/>/gi, "\t")
      .replace(/<[^>]*\bbr\b[^>]*\/>/gi, "\n")
      .replace(/<\/[^>]*tc>/gi, "\t")
      .replace(/<\/[^>]*tr>/gi, "\n")
      .replace(/<\/[^>]*p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(file: Express.Multer.File, maxChars = 16000) {
  const zip = await JSZip.loadAsync(file.buffer);
  const names = Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(name))
    .sort((a, b) => {
      if (a === "word/document.xml") return -1;
      if (b === "word/document.xml") return 1;
      return a.localeCompare(b);
    });

  const parts: string[] = [];
  let usedChars = 0;
  for (const name of names) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    const text = xmlWordToText(xml);
    if (!text) continue;
    const remaining = Math.max(0, maxChars - usedChars);
    if (remaining <= 0) break;
    const trimmed = text.slice(0, remaining);
    if (trimmed) {
      parts.push(trimmed);
      usedChars += trimmed.length;
    }
    if (usedChars >= maxChars) break;
  }

  return parts.join("\n\n").trim();
}

function expandirRangoPaginas(inicio: number, fin: number, maxPaginas = 40) {
  if (!Number.isInteger(inicio) || !Number.isInteger(fin) || inicio <= 0 || fin <= 0) return [];
  const desde = Math.min(inicio, fin);
  const hasta = Math.max(inicio, fin);
  const limite = Math.min(hasta, desde + maxPaginas - 1);
  return Array.from({ length: limite - desde + 1 }, (_item, index) => desde + index);
}

export function extraerPaginasIndicadas(textoEntrada: string, maxPaginas = 40) {
  const texto = repararMojibakeTexto(textoEntrada);
  const paginas: number[] = [];
  const coincidencias: Array<{ index: number; pages: number[] }> = [];
  const agregar = (values: number[]) => {
    for (const page of values) {
      if (!Number.isInteger(page) || page <= 0 || page > 2000) continue;
      if (!paginas.includes(page)) paginas.push(page);
      if (paginas.length >= maxPaginas) return;
    }
  };

  const patrones = [
    /entre\s+las?\s+p[aá]ginas?\s+(\d{1,4})\s+(?:y|a|al|hasta|-|–|—)\s+(\d{1,4})/gi,
    /p[aá]g(?:ina|inas)?s?\.?\s*(?:n[úu]m(?:ero)?\.?\s*)?(\d{1,4})(?:\s*(?:a|al|hasta|-|–|—|y)\s*(\d{1,4}))?/gi,
    /\bp\.?\s*(\d{1,4})(?:\s*(?:a|al|hasta|-|–|—|y)\s*(\d{1,4}))?/gi
  ];

  for (const patron of patrones) {
    let match: RegExpExecArray | null;
    while ((match = patron.exec(texto))) {
      const inicio = Number(match[1]);
      const fin = match[2] ? Number(match[2]) : inicio;
      coincidencias.push({
        index: match.index,
        pages: expandirRangoPaginas(inicio, fin, maxPaginas)
      });
    }
  }

  coincidencias
    .sort((a, b) => a.index - b.index)
    .forEach((coincidencia) => agregar(coincidencia.pages));

  return paginas;
}

function normalizePdfExtractedText(value: any) {
  return repararMojibakeTexto(value)
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(file: Express.Multer.File, maxChars = 24000, paginasSolicitadas: number[] = []) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(file.buffer) });

  try {
    const info = await parser.getInfo();
    const totalPaginas = Math.max(0, Number(info.total || 0));
    const paginas = Array.from(new Set(
      paginasSolicitadas
        .map(Number)
        .filter((page) => Number.isInteger(page) && page > 0 && (!totalPaginas || page <= totalPaginas))
    )).slice(0, 40);

    const params = paginas.length
      ? { partial: paginas, pageJoiner: "" }
      : { first: Math.min(totalPaginas || 12, 12), pageJoiner: "" };
    const result = await parser.getText(params);
    const pages = Array.isArray(result.pages) ? result.pages : [];
    const partes: string[] = [];
    let usedChars = 0;

    for (const page of pages) {
      const text = normalizePdfExtractedText(page.text);
      if (!text) continue;
      const encabezado = `Página ${page.num}${totalPaginas ? ` de ${totalPaginas}` : ""}`;
      const bloque = `${encabezado}\n${text}`.trim();
      const restante = Math.max(0, maxChars - usedChars);
      if (!restante) break;
      const recortado = bloque.slice(0, restante);
      if (!recortado) continue;
      partes.push(recortado);
      usedChars += recortado.length;
    }

    const texto = partes.join("\n\n---\n\n").trim();
    if (texto && paginas.length) {
      return `Páginas solicitadas por las indicaciones docentes: ${paginas.join(", ")}.\n\n${texto}`;
    }
    return texto;
  } finally {
    await parser.destroy();
  }
}

async function extractUploadedText(file: Express.Multer.File | undefined, input: { defaultName: string; maxChars: number; unsupportedMessage: string; paginasPdf?: number[] }) {
  if (!file?.buffer) return { nombre: null as string | null, texto: "" };

  const nombre = file.originalname || input.defaultName;
  const mime = String(file.mimetype || "").toLowerCase();
  const esTexto = mime.includes("text")
    || mime.includes("json")
    || mime.includes("csv")
    || /\.(txt|csv|json|md)$/i.test(nombre);
  const esDocx = mime.includes("wordprocessingml.document") || /\.docx$/i.test(nombre);
  const esPdf = mime.includes("pdf") || /\.pdf$/i.test(nombre);

  try {
    if (esTexto) {
      const texto = file.buffer.toString("utf8").replace(/\u0000/g, " ").slice(0, input.maxChars);
      return { nombre, texto };
    }

    if (esDocx) {
      const texto = await extractDocxText(file, input.maxChars);
      if (texto) return { nombre, texto };
    }

    if (esPdf) {
      const texto = await extractPdfText(file, input.maxChars, input.paginasPdf || []);
      if (texto) return { nombre, texto };
      return {
        nombre,
        texto: `Se adjuntó el PDF ${nombre} como apoyo obligatorio, pero no se pudo extraer texto seleccionable. Si el PDF es escaneado o está protegido, subí una versión con texto seleccionable o convertí las páginas solicitadas a imágenes legibles.`
      };
    }
  } catch (error) {
    console.warn(`No se pudo extraer texto del archivo ${nombre}:`, error);
  }

  return {
    nombre,
    texto: input.unsupportedMessage.replace(/\{nombre\}/g, nombre)
  };
}

function extractDocumentoApoyoText(file?: Express.Multer.File, paginasPdf: number[] = []) {
  if (isImageFile(file)) {
    return Promise.resolve({
      nombre: file?.originalname || "imagen_apoyo",
      texto: `Imagen adjunta: ${file?.originalname || "imagen_apoyo"}. Debe analizarse como material de apoyo obligatorio para enriquecer el apartado indicado por la persona docente.`
    });
  }

  return extractUploadedText(file, {
    defaultName: "documento_apoyo",
    maxChars: paginasPdf.length ? 30000 : 16000,
    unsupportedMessage: "Se adjuntó el archivo {nombre} como apoyo obligatorio, pero el sistema no pudo extraer su contenido. Para que la IA lo use con precisión, subí el material en PDF, DOCX, TXT o imagen legible.",
    paginasPdf
  });
}

function isImageFile(file?: Express.Multer.File) {
  if (!file?.buffer) return false;
  const mime = String(file.mimetype || "").toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.originalname || "");
}

function detectarIdiomaSalida(...fuentes: Array<string | null | undefined>) {
  const texto = fuentes.filter(Boolean).join("\n").toLowerCase();
  if (!texto) return "es" as const;

  const ingles = ["learning", "assessment", "teacher", "students", "school", "subject", "grade", "period", "strategies", "observation"]
    .reduce((total, palabra) => total + (texto.match(new RegExp(`\\b${palabra}\\b`, "g"))?.length || 0), 0);
  const espanol = ["aprendizaje", "evaluación", "docente", "estudiantes", "colegio", "materia", "grado", "período", "estrategias", "observaciones"]
    .reduce((total, palabra) => total + (texto.match(new RegExp(`\\b${palabra}\\b`, "g"))?.length || 0), 0);

  return ingles >= 3 && ingles > espanol ? "en" as const : "es" as const;
}

function instruccionesObligatoriasPlaneamiento(input: {
  idiomaSalida?: "es" | "en";
  usaMachote?: boolean;
  cantidadImagenes?: number;
  documentoApoyoTexto?: string;
  documentoApoyoNombre?: string;
}) {
  const idioma = input.idiomaSalida === "en" ? "English" : "Spanish";
  const machote = input.usaMachote
    ? "El machote se utiliza únicamente para conservar diseño, tablas, encabezados y orden. Eliminá y sustituí todos sus datos variables anteriores; no reutilicés nombres, fechas, temas, habilidades, estrategias, indicadores, observaciones ni ejemplos del planeamiento previo."
    : "";
  const imagenes = input.cantidadImagenes
    ? `Hay ${input.cantidadImagenes} imagen(es) adjunta(s). Analizalas como fuente de referencia junto con las instrucciones del docente.`
    : "";
  const apoyo = String(input.documentoApoyoTexto || "").trim()
    ? `Hay documento(s) de apoyo adjunto(s): ${input.documentoApoyoNombre || "documento(s) adjunto(s)"}. Su uso es obligatorio: extraé de ese material ejemplos, estructura, lenguaje, ejercicios, recursos o criterios pertinentes para enriquecer el apartado indicado por la persona docente. No lo menciones solo como adjunto; integrá evidencia concreta en el contenido generado.`
    : "";

  return `
REGLAS DE CUMPLIMIENTO NO NEGOCIABLES:
- Las indicaciones, consideraciones y premisas escritas por la persona docente son datos e instrucciones obligatorias. No podés omitirlas, suavizarlas, sustituirlas ni contradecirlas.
- Si existe conflicto entre una indicación del docente y una regla genérica o un ejemplo adjunto, prevalece la indicación del docente.
- Idioma obligatorio de toda la salida generada: ${idioma}. Conservá sin traducir solamente los rótulos fijos que ya pertenezcan al diseño del machote.
${machote}
${imagenes}
${apoyo}
`.trim();
}

async function extractDocumentosApoyoText(files: Express.Multer.File[], indicacionesDocente = "") {
  const documentos = Array.isArray(files) ? files : [];
  if (!documentos.length) return { nombres: [] as string[], texto: "", imagenes: [] as ImagenApoyoIA[] };

  const partes: string[] = [];
  const nombres: string[] = [];
  const imagenes: ImagenApoyoIA[] = [];
  const paginasPdf = extraerPaginasIndicadas(indicacionesDocente);
  const maxTotal = paginasPdf.length ? 32000 : 18000;
  let usado = 0;

  for (const file of documentos) {
    if (isImageFile(file)) {
      nombres.push(file.originalname || "imagen_apoyo");
      if (imagenes.length < 4) {
        imagenes.push({
          nombre: file.originalname || "imagen_apoyo",
          mimeType: String(file.mimetype || "image/png").toLowerCase(),
          base64: file.buffer.toString("base64")
        });
      }
    }
    const contenido = await extractDocumentoApoyoText(file, paginasPdf);
    if (contenido.nombre && !isImageFile(file)) nombres.push(contenido.nombre);
    if (!contenido.texto) continue;

    const bloque = `Archivo: ${contenido.nombre || "documento_apoyo"}\n${contenido.texto}`.trim();
    const restante = Math.max(0, maxTotal - usado);
    if (!restante) break;
    const recortado = bloque.slice(0, restante);
    if (!recortado) continue;
    partes.push(recortado);
    usado += recortado.length;
  }

  return {
    nombres,
    texto: partes.join("\n\n---\n\n").trim(),
    imagenes
  };
}

function extractPlantillaFormatoText(file?: Express.Multer.File) {
  return extractUploadedText(file, {
    defaultName: "plantilla_formato",
    maxChars: 50000,
    unsupportedMessage: "Se adjuntó la plantilla de formato {nombre}, pero el sistema no pudo extraer su contenido. Para que la IA siga un formato exacto, subí una plantilla .docx o un archivo de texto, o registrá ese formato en Configuración con IA."
  });
}

export function limpiarEncabezadoEstrategiaReferencia(value: string) {
  let contenido = String(value || "").replace(/\s+/g, " ").trim();
  if (!contenido) return "";

  const prefijoCodigo = contenido.match(/^(?:\d[\d\s._/-]{5,})\s+(.+)$/u);
  if (prefijoCodigo?.[1]) contenido = prefijoCodigo[1].trim();

  const letras = (contenido.match(/\p{L}/gu) || []).length;
  const digitos = (contenido.match(/\d/g) || []).length;
  if (
    letras < 2
    || /^\d[\d\s._/-]*$/u.test(contenido)
    || /\d{6,}/.test(contenido)
    || digitos > Math.max(4, Math.floor(contenido.length * 0.35))
  ) return "";

  return contenido;
}

function esParrafoEncabezadoReferencia(paragraphXml: string, texto: string) {
  const contenido = limpiarEncabezadoEstrategiaReferencia(texto);
  if (!contenido || contenido.length > 220) return false;
  const cantidadPalabras = contenido.split(/\s+/).filter(Boolean).length;
  if (cantidadPalabras > 16) return false;

  const runs = getDirectXmlElements(paragraphXml, "w:r");
  if (!runs.length) return false;
  let caracteresTotales = 0;
  let caracteresNegrita = 0;
  for (const run of runs) {
    const runText = xmlWordToText(run).trim();
    if (!runText) continue;
    caracteresTotales += runText.length;
    if (/<w:b(?:\s[^>]*)?\/?>/i.test(run) && !/<w:b[^>]*w:val=["'](?:0|false|off)["']/i.test(run)) {
      caracteresNegrita += runText.length;
    }
  }

  const esEstiloTitulo = /<w:pStyle[^>]*w:val=["'][^"']*(?:heading|titulo|title)[^"']*["']/i.test(paragraphXml);
  const proporcionNegrita = caracteresTotales ? caracteresNegrita / caracteresTotales : 0;
  return esEstiloTitulo || proporcionNegrita >= 0.7;
}

function extraerParrafosCeldaReferencia(cellXml: string) {
  return getDirectXmlElements(cellXml, "w:p")
    .map((paragraphXml) => {
      const texto = xmlWordToText(paragraphXml).trim();
      return {
        texto,
        esEncabezado: esParrafoEncabezadoReferencia(paragraphXml, texto)
      };
    })
    .filter((item) => item.texto);
}

function extraerCampoVariableReferencia(cellXml: string): CampoVariableReferencia | null {
  const texto = xmlWordToText(cellXml).replace(/\r/g, "").trim();
  if (!texto || texto.length > 1800) return null;
  const primeraLinea = texto.split(/\n+/).map((linea) => linea.trim()).find(Boolean) || "";
  const match = primeraLinea.match(/^([^:]{2,120}):\s*(.*)$/);
  if (!match) return null;

  const etiqueta = String(match[1] || "").trim();
  const valorAnterior = String(match[2] || "").trim();
  const etiquetaNormalizada = normalizarParaBusqueda(etiqueta);
  if (
    !etiqueta
    || /^\d/.test(etiqueta)
    || detectTemplateContentRole(cellXml)
    || etiquetaNormalizada.includes("reflexiones docentes")
    || etiquetaNormalizada === "observaciones"
  ) return null;

  return { etiqueta, valorAnterior };
}

// Word puede repetir el texto de una celda combinada al serializarla. Por eso
// no basta con mirar el texto completo de la fila: identificamos los rótulos
// de cierre por celda, sin confundir una frase pedagógica que solo mencione
// "observaciones" dentro de un indicador.
function esFilaCierreContenido(cells: string[]) {
  const textos = cells.map((cell) => normalizarParaBusqueda(cell)).filter(Boolean);
  if (!textos.length) return false;
  const esEtiqueta = (texto: string) => /^(?:reflexiones docentes|teacher reflections|observaciones|observations)\s*:?$/.test(texto);
  if (textos.every(esEtiqueta)) return true;
  // En una fila combinada Word puede repetir también el valor que sigue al
  // rótulo (por ejemplo, "Observaciones: Pendiente"). Si todas las celdas
  // son esa misma clase de rótulo, sigue siendo una fila de cierre, no una
  // fila pedagógica adicional.
  if (textos.every((texto) => /^(?:reflexiones docentes|teacher reflections|observaciones|observations)\s*:/i.test(texto))) return true;
  // También aceptamos una sola celda rotulada con un valor vacío o texto
  // breve de docente; las demás celdas deben estar vacías para ser cierre.
  return textos.length === 1 && /^(?:reflexiones docentes|teacher reflections|observaciones|observations)\s*:/i.test(textos[0]);
}

export async function analizarReferenciaDocxSemantica(file?: Express.Multer.File): Promise<PerfilDocumentoReferencia> {
  const vacio: PerfilDocumentoReferencia = {
    esDocx: false,
    cantidadTablas: 0,
    filasFisicasPorTabla: [],
    columnas: [],
    camposVariables: [],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 0,
    cantidadBloquesContenido: 0,
    seccionesModelo: [],
    descripcion: "No se adjuntó un DOCX utilizable como referencia."
  };
  if (!file?.buffer || !/\.docx$/i.test(file.originalname || "")) return vacio;

  try {
    const zip = await JSZip.loadAsync(file.buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml) return { ...vacio, esDocx: true, descripcion: "El DOCX no contiene word/document.xml." };

    const tablasDocumento = getDirectXmlElements(documentXml, "w:tbl");
    const columnas: ColumnaReferencia[] = [];
    const camposVariables: CampoVariableReferencia[] = [];
    const estrategiasPartes: string[] = [];
    const encabezadosEstrategias: string[] = [];
    const valoresContenidoAnterior: string[] = [];
    const seccionesModelo: SeccionModeloReferencia[] = [];
    let cantidadSeccionesContenido = 0;
    let cantidadBloquesContenido = 0;

    for (const [indiceTabla, tableXml] of tablasDocumento.entries()) {
      const rows = getDirectXmlElements(tableXml, "w:tr");
      let rolesActivos: Array<TemplateContentRole | null> | null = null;

      for (const [indiceFila, rowXml] of rows.entries()) {
        const cells = getDirectXmlElements(rowXml, "w:tc");
        const roles = cells.map(detectTemplateContentRole);
        const tieneColumnaContenido = roles.some((rol) => (
          rol === "aprendizajes" || rol === "criterios" || rol === "indicadores"
        ));
        const esCabeceraContenido = !rolesActivos
          && cells.length >= 3
          && roles.includes("estrategias")
          && tieneColumnaContenido;
        const terminaContenido = esFilaCierreContenido(cells.map((cellXml) => xmlWordToText(cellXml)));

        if (esCabeceraContenido) {
          rolesActivos = roles;
          cantidadSeccionesContenido += 1;
          const columnasSeccion = cells.map((cellXml, indice) => ({
            indice,
            encabezado: xmlWordToText(cellXml).trim(),
            rol: roles[indice] || null
          }));
          seccionesModelo.push({
            id: `tabla-${indiceTabla + 1}-seccion-${cantidadSeccionesContenido}`,
            etiqueta: columnasSeccion.map((columna) => columna.encabezado).filter(Boolean).join(" | ")
              || `Sección de contenido ${cantidadSeccionesContenido}`,
            indiceTabla: indiceTabla + 1,
            indiceFilaEncabezado: indiceFila + 1,
            columnas: columnasSeccion,
            roles,
            estrategiasTexto: "",
            encabezadosEstrategias: []
          });
          cells.forEach((cellXml, indice) => {
            const encabezado = xmlWordToText(cellXml).trim();
            columnas.push({ indice, encabezado, rol: roles[indice] || null });
          });
          continue;
        }

        if (terminaContenido) {
          rolesActivos = null;
          continue;
        }

        if (rolesActivos) {
          if (cells.some((cellXml) => xmlWordToText(cellXml).trim())) {
            cantidadBloquesContenido += 1;
          }
          cells.forEach((cellXml, indice) => {
            const rol = rolesActivos?.[indice] || null;
            const texto = xmlWordToText(cellXml).trim();
            if (!texto) return;
            valoresContenidoAnterior.push(texto);
            if (rol !== "estrategias") return;

            const parrafos = extraerParrafosCeldaReferencia(cellXml);
            if (parrafos.length) {
              const estrategiasSeccion = parrafos.map((item) => item.texto).join("\n");
              estrategiasPartes.push(estrategiasSeccion);
              const seccionActiva = seccionesModelo[seccionesModelo.length - 1];
              if (seccionActiva) seccionActiva.estrategiasTexto += `${seccionActiva.estrategiasTexto ? "\n\n" : ""}${estrategiasSeccion}`;
              for (const parrafo of parrafos) {
                if (parrafo.esEncabezado) {
                  const encabezadoLimpio = limpiarEncabezadoEstrategiaReferencia(parrafo.texto);
                  if (encabezadoLimpio) {
                    encabezadosEstrategias.push(encabezadoLimpio);
                    if (seccionActiva) seccionActiva.encabezadosEstrategias.push(encabezadoLimpio);
                  }
                }
              }
            } else {
              estrategiasPartes.push(texto);
            }
          });
          continue;
        }

        for (const cellXml of cells) {
          const campo = extraerCampoVariableReferencia(cellXml);
          if (campo) camposVariables.push(campo);
        }
      }
    }

    if (!estrategiasPartes.length) {
      const inferido = inferirEstrategiasMediacionPorTabla(documentXml);
      columnas.push(...inferido.columnas);
      estrategiasPartes.push(...inferido.estrategiasPartes);
      encabezadosEstrategias.push(...inferido.encabezadosEstrategias);
      valoresContenidoAnterior.push(...inferido.valoresContenidoAnterior);
      cantidadSeccionesContenido += inferido.cantidadSeccionesContenido;
    }
    // Algunos Word válidos contienen tablas anidadas o párrafos con formato
    // que no se exponen como hijos directos. Como respaldo, analizamos su
    // texto completo antes de declarar que no existe una estrategia.
    if (!estrategiasPartes.length) {
      const estrategiasTextoPlano = extraerEstrategiasMediacionReferencia(xmlWordToText(documentXml));
      if (estrategiasTextoPlano) {
        estrategiasPartes.push(estrategiasTextoPlano);
        cantidadSeccionesContenido = Math.max(1, cantidadSeccionesContenido);
      }
    }

    const columnasUnicas = Array.from(new Map(
      columnas.map((columna) => [`${columna.indice}|${normalizarParaBusqueda(columna.encabezado)}`, columna])
    ).values());
    const camposUnicos = Array.from(new Map(
      camposVariables.map((campo) => [normalizarParaBusqueda(campo.etiqueta), campo])
    ).values());
    const seccionesModeloUnicas = Array.from(new Map(
      seccionesModelo.map((seccion) => [seccion.indiceTabla, seccion])
    ).values());
    const encabezadosSecuencia = encabezadosEstrategias
      .filter((encabezado, index, lista) => (
        index === 0
        || normalizarParaBusqueda(encabezado) !== normalizarParaBusqueda(lista[index - 1])
      ));
    const estrategiasTexto = estrategiasPartes.filter(Boolean).join("\n\n").trim();
    const descripcion = [
      `${cantidadSeccionesContenido} sección(es) principal(es) de contenido.`,
      `${cantidadBloquesContenido} bloque(s) o fila(s) de desarrollo.`,
      columnasUnicas.length
        ? `Columnas detectadas: ${columnasUnicas.map((columna) => columna.encabezado).join(" | ")}.`
        : "No se detectaron columnas semánticas.",
      encabezadosSecuencia.length
        ? `Secuencia pedagógica detectada por formato: ${encabezadosSecuencia.join(" → ")}.`
        : "La referencia organiza las estrategias de forma narrativa, sin encabezados tipográficos inequívocos."
    ].join(" ");

    return {
      esDocx: true,
      cantidadTablas: tablasDocumento.length,
      filasFisicasPorTabla: tablasDocumento.map((tablaXml) => getDirectXmlElements(tablaXml, "w:tr").length),
      columnas: columnasUnicas,
      camposVariables: camposUnicos,
      estrategiasTexto,
      encabezadosEstrategias: encabezadosSecuencia,
      valoresContenidoAnterior,
      cantidadSeccionesContenido,
      cantidadBloquesContenido,
      seccionesModelo: seccionesModeloUnicas,
      descripcion
    };
  } catch (error) {
    console.warn("No se pudo analizar semánticamente el DOCX de referencia:", error);
    return { ...vacio, esDocx: true, descripcion: "No se pudo analizar semánticamente el DOCX." };
  }
}

function inferirEstrategiasMediacionPorTabla(documentXml: string) {
  const columnas: ColumnaReferencia[] = [];
  const estrategiasPartes: string[] = [];
  const encabezadosEstrategias: string[] = [];
  const valoresContenidoAnterior: string[] = [];
  let cantidadSeccionesContenido = 0;

  const esEncabezadoProbableMediacion = (text: string) => {
    const normalizado = normalizarParaBusqueda(text);
    return normalizado.length <= 180
      && (
        normalizado.includes("mediacion")
        || normalizado.includes("mediation")
        || normalizado.includes("learning activit")
        || normalizado.includes("teaching activit")
        || normalizado.includes("didactic sequence")
      );
  };

  const inferirRolEncabezado = (text: string): TemplateContentRole | null => {
    const rol = detectTemplateContentRole(`<w:tc><w:p><w:r><w:t>${escapeXmlForDocx(text)}</w:t></w:r></w:p></w:tc>`);
    if (rol) return rol;
    const normalizado = normalizarParaBusqueda(text);
    if (normalizado.includes("mediacion") || normalizado.includes("mediation") || normalizado.includes("didactic sequence")) return "estrategias";
    if (normalizado.includes("assessment") || normalizado.includes("evidence") || normalizado.includes("indicador")) return "indicadores";
    if (normalizado.includes("learner") || normalizado.includes("goal") || normalizado.includes("objective") || normalizado.includes("aprendizaje")) return "aprendizajes";
    return null;
  };

  for (const tableXml of getDirectXmlElements(documentXml, "w:tbl")) {
    const rows = getDirectXmlElements(tableXml, "w:tr");
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const headerCells = getDirectXmlElements(rows[rowIndex], "w:tc");
      if (headerCells.length < 2) continue;
      const headerTexts = headerCells.map((cellXml) => xmlWordToText(cellXml).trim());
      const indiceEstrategias = headerTexts.findIndex(esEncabezadoProbableMediacion);
      if (indiceEstrategias < 0) continue;
      const cantidadParrafosEncabezado = getCellParagraphTexts(headerCells[indiceEstrategias]).filter(Boolean).length;
      if (cantidadParrafosEncabezado > 1) continue;

      const roles = headerTexts.map(inferirRolEncabezado);
      roles[indiceEstrategias] = "estrategias";
      if (roles.filter(Boolean).length < 2 && headerCells.length >= 3) {
        if (indiceEstrategias > 0 && !roles[indiceEstrategias - 1]) roles[indiceEstrategias - 1] = "aprendizajes";
        if (indiceEstrategias < headerCells.length - 1 && !roles[indiceEstrategias + 1]) roles[indiceEstrategias + 1] = "indicadores";
      }

      cantidadSeccionesContenido += 1;
      headerTexts.forEach((encabezado, indice) => {
        columnas.push({ indice, encabezado, rol: roles[indice] || null });
      });

      for (let contentIndex = rowIndex + 1; contentIndex < rows.length; contentIndex += 1) {
        const rowText = normalizarParaBusqueda(xmlWordToText(rows[contentIndex]));
        if (
          rowText.includes("reflective teaching")
          || rowText.includes("teacher reflections")
          || rowText.includes("week plan self assessment")
          || rowText.includes("observaciones")
          || rowText.includes("observations")
        ) break;

        const cells = getDirectXmlElements(rows[contentIndex], "w:tc");
        if (cells.length <= indiceEstrategias) continue;
        const texto = xmlWordToText(cells[indiceEstrategias]).trim();
        if (!texto || texto.length < 20) continue;

        valoresContenidoAnterior.push(...cells.map((cellXml) => xmlWordToText(cellXml).trim()).filter(Boolean));
        const parrafos = extraerParrafosCeldaReferencia(cells[indiceEstrategias]);
        if (parrafos.length) {
          estrategiasPartes.push(parrafos.map((item) => item.texto).join("\n"));
          for (const parrafo of parrafos) {
            if (parrafo.esEncabezado) {
              const encabezadoLimpio = limpiarEncabezadoEstrategiaReferencia(parrafo.texto);
              if (encabezadoLimpio) encabezadosEstrategias.push(encabezadoLimpio);
            }
          }
        } else {
          estrategiasPartes.push(texto);
        }
      }
    }
  }

  return {
    columnas,
    estrategiasPartes,
    encabezadosEstrategias,
    valoresContenidoAnterior,
    cantidadSeccionesContenido
  };
}

function escapeXmlForDocx(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildPlaneamientoNombre(input: { mes?: any; grado?: any; materiaNombre?: any }) {
  const mes = normalizeText(input.mes) || "Mes";
  const grado = normalizeText(input.grado) || "Grado";
  const materia = normalizeText(input.materiaNombre) || "Materia";
  return `${mes} - ${grado} - ${materia}`;
}

export function extraerEstrategiasMediacionReferencia(...fuentes: Array<string | null | undefined>) {
  const texto = fuentes.filter(Boolean).join("\n\n").replace(/\r/g, "");
  const inicioSeccion = texto.search(/^\s*estrategias?\s+(?:(?:de\s+)?mediaci[oó]n|did[aá]cticas?\s+sugeridas?|de\s+aprendizaje)(?:\s*\([^)]*\))?\s*$/im);
  if (inicioSeccion >= 0) return texto.slice(inicioSeccion, inicioSeccion + 30000).trim();

  const marcadorEstructura = /^\s*(?:\d+\s*)?(?:tema\s+n?[.°º]?\s*\d+|actividades?\s+de\s+(?:inicio|desarrollo|cierre)|focalizaci[oó]n|exploraci[oó]n|contrastaci[oó]n|aplicaci[oó]n|problematizaci[oó]n|desarrollo|cierre|inicio|mediation\s+phase|introduction|exploration|application)\s*\.?\s*$/im;
  const inicioEstructura = texto.search(marcadorEstructura);
  if (inicioEstructura >= 0) return texto.slice(inicioEstructura, inicioEstructura + 30000).trim();

  const inicio = texto.search(/estrategias?\s+(?:(?:de\s+)?mediaci[oó]n|did[aá]cticas?\s+sugeridas?|de\s+aprendizaje)|mediation\s+strateg(?:y|ies)/i);
  return inicio >= 0 ? texto.slice(inicio, inicio + 30000).trim() : "";
}

function extraerEncabezadoEstrategiaReferencia(linea: string) {
  const text = limpiarEncabezadoEstrategiaReferencia(linea);
  if (!text || text.length > 140) return "";
  const patterns = [
    /^(tema\s+n?[.°º]?\s*\d+)\s*\.?\s*$/i,
    /^(momento\s+\d+\s*:[^.]+)\s*\.?\s*$/i,
    /^(actividades?\s+de\s+(?:inicio|desarrollo|cierre))\s*\.?\s*$/i,
    /^(focalizaci[oó]n|exploraci[oó]n|contrastaci[oó]n|aplicaci[oó]n|problematizaci[oó]n|inicio|desarrollo|cierre)\s*\.?\s*$/i,
    /^(mediation\s+phase|introduction|exploration|application|development|closure)\s*\.?\s*$/i,
    /^(conexi[oó]n(?:\s*[–-]\s*(?:inicio|exploraci[oó]n))?|construcci[oó]n(?:\s*[–-]\s*(?:desarrollo|colaboraci[oó]n))?|colaboraci[oó]n|clarificaci[oó]n(?:\s*[–-]\s*cierre)?|cierre(?:\s*[–-]\s*clarificaci[oó]n)?)\s*[:.]?\s*$/i,
    /^(avances?\s+en\s+monograf[ií]a(?:\s+y\s+lectura\s+diaria)?|monograf[ií]a|lectura\s+diaria)\s*\.?\s*$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  const encabezadoConContenido = text.match(/^(conexi[oó]n(?:\s*[–-]\s*(?:inicio|exploraci[oó]n))?|construcci[oó]n(?:\s*[–-]\s*(?:desarrollo|colaboraci[oó]n))?|colaboraci[oó]n|clarificaci[oó]n(?:\s*[–-]\s*cierre)?|cierre(?:\s*[–-]\s*clarificaci[oó]n)?)\s*:/i);
  if (encabezadoConContenido?.[1]) return encabezadoConContenido[1].trim();
  return "";
}

export function construirPerfilEstrategiasReferencia(
  texto: string,
  encabezadosDocumento: string[] = []
): PerfilEstrategiasReferencia {
  const lineas = String(texto || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((linea) => linea.trim())
    .filter(Boolean);
  const vistos = new Set<string>();
  const encabezados: string[] = [];
  for (const encabezadoDocumento of encabezadosDocumento) {
    const encabezado = limpiarEncabezadoEstrategiaReferencia(encabezadoDocumento);
    const key = normalizarParaBusqueda(encabezado);
    // En una tabla por aprendizajes, las mismas fases aparecen una vez por cada
    // fila. Son un patrón de formato, no fases nuevas que deban multiplicarse.
    if (key && !vistos.has(key)) {
      vistos.add(key);
      encabezados.push(encabezado);
    }
  }
  if (!encabezados.length) {
    for (const linea of lineas) {
      const encabezado = extraerEncabezadoEstrategiaReferencia(linea);
      const key = normalizarParaBusqueda(encabezado);
      if (key && !vistos.has(key)) {
        vistos.add(key);
        encabezados.push(encabezado);
      }
    }
  }

  const actividades = Array.from(String(texto || "").matchAll(/\bactividad\s+n?[.°º]?\s*(\d+)\b/gi))
    .map((match) => Number(match[1]))
    .filter((numero) => Number.isInteger(numero) && numero > 0);
  const cantidadActividadesNumeradas = new Set(actividades).size;
  const cantidadPreguntas = lineas.filter((linea) => /[?¿]/.test(linea)).length;
  const cantidadParrafos = lineas.length;
  const cantidadCaracteres = String(texto || "").length;
  const nivelDetalle = cantidadParrafos >= 35 || cantidadCaracteres >= 12000
    ? "amplio"
    : cantidadParrafos >= 15 || cantidadCaracteres >= 5000
      ? "medio"
      : "breve";
  const usaTemasNumerados = lineas.some((linea) => /^tema\s+n?[.°º]?\s*\d+/i.test(linea));
  const usaActividadesNumeradas = cantidadActividadesNumeradas > 0;
  const descripcion = [
    encabezados.length ? `Secuencia principal: ${encabezados.join(" → ")}.` : "La referencia no usa fases fijas reconocibles; se debe conservar su organización narrativa.",
    usaTemasNumerados ? "Organiza el contenido por temas numerados." : "",
    usaActividadesNumeradas ? `Desarrolla ${cantidadActividadesNumeradas} actividades numeradas con propósito, acciones docentes/estudiantiles y producto o cierre.` : "",
    cantidadPreguntas ? `Incluye ${cantidadPreguntas} bloque(s) con preguntas o consignas explícitas.` : "",
    `Nivel de detalle: ${nivelDetalle}; ${cantidadParrafos} párrafos útiles en la sección analizada.`
  ].filter(Boolean).join(" ");

  return {
    encabezados,
    cantidadParrafos,
    cantidadCaracteres,
    cantidadActividadesNumeradas,
    cantidadPreguntas,
    usaTemasNumerados,
    usaActividadesNumeradas,
    nivelDetalle,
    descripcion
  };
}

function extraerEstructuraEstrategiasReferencia(texto: string) {
  return construirPerfilEstrategiasReferencia(texto).encabezados;
}

function instruccionPerfilEstrategiasReferencia(input: {
  estrategiasReferencia?: string;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
}) {
  if (!String(input.estrategiasReferencia || "").trim()) {
    return `
No se adjuntó una referencia utilizable para Estrategias de mediación. Aplicá la organización pedagógica predeterminada de la materia y la plantilla IA seleccionada.
`.trim();
  }

  const perfil = input.perfilEstrategiasReferencia || construirPerfilEstrategiasReferencia(input.estrategiasReferencia || "");
  return `
REGLA DINÁMICA Y PRIORITARIA PARA ESTRATEGIAS DE MEDIACIÓN:
- El planeamiento adjunto es la autoridad para la lógica, jerarquía, secuencia y nivel de detalle, adaptados al alcance real de las habilidades, semanas, materia y grado solicitados.
- Perfil detectado: ${perfil.descripcion}
- Encabezados y orden que deben conservarse: ${perfil.encabezados.join(" → ") || "los observados en el documento adjunto"}.
- No uses "Momento 1", "Momento 2", "Momento 3", "Momento 4" ni otra secuencia predeterminada, salvo que esos rótulos aparezcan realmente en la referencia.
- No copies temas, autores, obras, ejemplos, preguntas ni actividades anteriores. Conservá el patrón pedagógico y redactá contenido completamente nuevo con las habilidades, materia, grado, meses e indicaciones actuales.
- Si la referencia usa actividades numeradas, generá actividades numeradas con una densidad y profundidad semejantes, ajustadas al alcance solicitado.
- Cada actividad nueva debe conservar la lógica observable de la referencia: propósito, acción docente, acción del estudiantado, recurso o dinámica, evidencia/producto y forma de retroalimentación cuando corresponda.
- No copies la longitud bruta del documento anterior. Generá desarrollo sustantivo y equilibrado para cada bloque solicitado; una referencia trimestral o con muchas habilidades puede ser más extensa que el planeamiento actual sin que eso implique pérdida de calidad.
`.trim();
}

function instruccionPerfilDocumentoReferencia(perfil?: PerfilDocumentoReferencia) {
  if (!perfil?.esDocx) {
    return "No existe un perfil semántico DOCX; conservá la estructura observable del archivo de referencia aportado.";
  }

  const campos = perfil.camposVariables
    .filter((campo) => !esCampoMetadataFijo(campo.etiqueta))
    .map((campo) => campo.etiqueta);
  const reglaFilasContenido = perfil.cantidadBloquesContenido
    && perfil.cantidadBloquesContenido >= 2
    && perfil.cantidadBloquesContenido <= 20
      ? `- El Word contiene ${perfil.cantidadBloquesContenido} filas físicas de desarrollo. Generá al menos ${perfil.cantidadBloquesContenido} bloques globales de Estrategias de mediación distintos y sustantivos para renovar cada fila. Esas filas no son semanas: mantené en "semanas" únicamente la cantidad solicitada por el formulario.`
      : "";
  return `
PERFIL SEMÁNTICO OBLIGATORIO DEL DOCUMENTO DE REFERENCIA:
- ${perfil.descripcion}
- Roles de columnas: ${perfil.columnas.map((columna) => `${columna.encabezado} = ${columna.rol || "columna adicional"}`).join(" | ") || "No detectados"}.
- Campos variables que deben sustituirse: ${campos.join(" | ") || "No se detectaron campos rotulados adicionales"}.
- La estructura nace de este documento específico. No apliqués fases, momentos, apartados ni secuencias predeterminadas de otra materia.
- "Criterios de Evaluación" y "Indicadores" son columnas distintas. Nunca coloqués los indicadores numerados dentro de Criterios.
- En "camposReferencia" devolvé una propiedad para cada campo variable detectado, usando exactamente su rótulo y un valor nuevo coherente con los datos actuales.
${reglaFilasContenido}
- Todo dato sustantivo anterior del machote debe desaparecer, salvo que también forme parte explícita de las habilidades, tema o indicaciones actuales.
`.trim();
}

export function construirReferenciaEstructuralParaPrompt(
  perfil?: PerfilDocumentoReferencia,
  perfilEstrategias?: PerfilEstrategiasReferencia
) {
  if (!perfil?.esDocx) return "Referencia Word disponible; conservá su diseño y redactá todo el contenido sustantivo nuevamente.";
  const columnas = perfil.columnas
    .map((columna) => `${columna.encabezado}: ${columna.rol || "adicional"}`)
    .join(" | ");
  const campos = perfil.camposVariables
    .filter((campo) => !esCampoMetadataFijo(campo.etiqueta))
    .map((campo) => campo.etiqueta)
    .join(" | ");
  return [
    "RESUMEN ESTRUCTURAL DEL WORD (sin contenido anterior reutilizable):",
    `Columnas: ${columnas || "no identificadas"}.`,
    `Secciones principales: ${perfil.cantidadSeccionesContenido || 0}.`,
    `Bloques o filas de desarrollo: ${perfil.cantidadBloquesContenido || 0}.`,
    `Encabezados pedagógicos: ${perfilEstrategias?.encabezados.join(" → ") || "organización narrativa"}.`,
    `Nivel de detalle: ${perfilEstrategias?.nivelDetalle || "no determinado"}.`,
    `Campos variables: ${campos || "ninguno adicional"}.`,
    "El texto, las actividades, preguntas, ejemplos, obras, recursos y productos del plan anterior fueron omitidos deliberadamente: no deben copiarse ni reconstruirse."
  ].join("\n");
}

export function aplicarEstructuraEstrategiasReferencia(estrategias: string[], estructura: string[]) {
  const encabezados = (Array.isArray(estructura) ? estructura : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const base = separarBloquesPorMomento(estrategias);
  if (!encabezados.length || !base.length) return base;

  const encabezadosNormalizados = encabezados.map(normalizarParaBusqueda);
  const gruposReferencia = encabezados.map(() => "");
  let indiceReferencia = -1;

  for (const item of base) {
    const texto = String(item || "").trim();
    const normalizado = normalizarParaBusqueda(texto);
    const indiceDetectado = encabezadosNormalizados.findIndex((encabezado) => normalizado.startsWith(encabezado));
    if (indiceDetectado >= 0) {
      indiceReferencia = indiceDetectado;
      gruposReferencia[indiceReferencia] = texto
        .slice(encabezados[indiceDetectado].length)
        .replace(/^[\s:.\-]+/, "")
        .trim();
      continue;
    }
    if (indiceReferencia >= 0) {
      gruposReferencia[indiceReferencia] = [gruposReferencia[indiceReferencia], texto].filter(Boolean).join("\n");
    }
  }

  if (gruposReferencia.every((contenido) => contenido.trim().length > 0)) {
    return encabezados.map((encabezado, index) => `${encabezado}\n${gruposReferencia[index].trim()}`);
  }

  const gruposMomento: string[] = [];
  let indiceMomento = -1;
  for (const item of base) {
    const texto = String(item || "").trim();
    if (/^momento\s+\d+\s*:/i.test(texto)) {
      indiceMomento += 1;
      gruposMomento[indiceMomento] = texto
        .replace(/^momento\s+\d+\s*:[^.]*\.?\s*/i, "")
        .trim();
      continue;
    }
    if (indiceMomento >= 0) {
      gruposMomento[indiceMomento] = [gruposMomento[indiceMomento], texto].filter(Boolean).join("\n");
    }
  }

  const fuente = gruposMomento.length ? gruposMomento : base;

  return encabezados.map((encabezado, index) => {
    const contenido = String(fuente[index] || "").trim();
    return `${encabezado}${contenido ? `\n${contenido}` : ""}`;
  });
}

type EstrategiaMediacionEstructurada = {
  fase: string;
  contenido: string;
};

type ValidacionPlaneamientoItem = {
  codigo: string;
  etiqueta: string;
  estado: "ok" | "alerta" | "error";
  detalle: string;
};

function estructurarEstrategiasMediacion(estrategias: any, estructuraReferencia: string[] = []) {
  const bloques = limpiarEstrategiasMediacion(
    Array.isArray(estrategias) ? estrategias : splitLines(estrategias)
  );
  const estructura = (Array.isArray(estructuraReferencia) ? estructuraReferencia : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (estructura.length) {
    const textoCompleto = bloques.join("\n\n");
    const {
      original: textoOriginal,
      texto: textoNormalizado,
      indicesOriginales
    } = normalizarParaBusquedaConMapa(textoCompleto);
    let cursor = 0;
    const posiciones = estructura.map((fase) => {
      const faseNormalizada = normalizarParaBusqueda(fase);
      const inicio = textoNormalizado.indexOf(faseNormalizada, cursor);
      if (inicio < 0) return { inicio: -1, finTitulo: -1 };
      const finTitulo = inicio + faseNormalizada.length;
      cursor = finTitulo;
      return { inicio, finTitulo };
    });

    return estructura.map((fase, index): EstrategiaMediacionEstructurada => {
      const posicion = posiciones[index];
      if (posicion.inicio < 0) return { fase, contenido: "" };
      const siguiente = posiciones.slice(index + 1).find((item) => item.inicio >= 0);
      const inicioOriginal = indicesOriginales[Math.min(posicion.finTitulo, indicesOriginales.length - 1)]
        ?? textoOriginal.length;
      const finOriginal = siguiente
        ? (indicesOriginales[Math.min(siguiente.inicio, indicesOriginales.length - 1)] ?? textoOriginal.length)
        : textoOriginal.length;
      const contenido = textoOriginal
        .slice(inicioOriginal, finOriginal)
        .replace(/^[\s:.\-–—]+/, "")
        .trim();
      return { fase, contenido };
    });
  }

  return bloques.map((bloque, index): EstrategiaMediacionEstructurada => {
    const texto = String(bloque || "").trim();
    const lineas = texto.split(/\r?\n/);
    const encabezadoMomento = lineas[0]?.match(/^momento\s+\d+\s*:[^.]*\.?\s*/i)?.[0]?.trim();
    return {
      fase: encabezadoMomento || `Estrategia ${index + 1}`,
      contenido: encabezadoMomento ? lineas.slice(1).join("\n").trim() : texto
    };
  });
}

function obtenerTextoResultadoPlaneamiento(resultado: any) {
  return [
    resultado?.nombre,
    resultado?.enfoque,
    resultado?.competenciaGeneral,
    ...(splitLines(resultado?.aprendizajesEsperados)),
    ...(splitLines(resultado?.criteriosEvaluacion)),
    ...(splitLines(resultado?.estrategiasMediacion)),
    ...(splitLines(resultado?.indicadoresEvaluacion)),
    ...(splitLines(resultado?.trabajoCotidiano)),
    ...(splitLines(resultado?.tareas)),
    ...(splitLines(resultado?.evaluacionSugerida)),
    ...(splitLines(resultado?.recursos)),
    ...(
      resultado?.camposReferencia && typeof resultado.camposReferencia === "object"
        ? Object.values(resultado.camposReferencia).map((value) => String(value || ""))
        : []
    )
  ].filter(Boolean).join("\n");
}

export function detectarCopiaSustantivaReferencia(resultado: any, perfil?: PerfilDocumentoReferencia) {
  const referencia = splitLines(perfil?.estrategiasTexto)
    .map((texto) => ({ texto, clave: normalizarParaBusqueda(texto).replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim() }))
    .filter((item) => item.clave.length >= 80);
  const clavesReferencia = new Map(referencia.map((item) => [item.clave, item.texto]));
  const estrategiasResultado = [
    ...splitLines(resultado?.estrategiasMediacion),
    ...(Array.isArray(resultado?.semanas)
      ? resultado.semanas.flatMap((semana: any) => splitLines(semana?.mediacionPedagogica))
      : [])
  ];
  const fragmentosResultado = estrategiasResultado
    .map((texto) => ({ texto, clave: normalizarParaBusqueda(texto).replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim() }))
    .filter((item) => item.clave.length >= 80);
  const coincidencias = Array.from(new Map(
    fragmentosResultado
      .filter((item) => clavesReferencia.has(item.clave))
      .map((item) => [item.clave, item.texto])
  ).values());
  const caracteresResultado = fragmentosResultado.reduce((total, item) => total + item.texto.length, 0);
  const caracteresCopiados = coincidencias.reduce((total, texto) => total + texto.length, 0);
  const proporcion = caracteresResultado ? caracteresCopiados / caracteresResultado : 0;
  const copiaSustantiva = caracteresCopiados >= 300
    && proporcion >= 0.12
    && (coincidencias.length >= 2 || caracteresCopiados >= 500);
  return { copiaSustantiva, coincidencias, caracteresCopiados, proporcion };
}

function palabrasClaveIndicaciones(indicaciones: string) {
  const ignorar = new Set([
    "para", "como", "debe", "deben", "desde", "hasta", "este", "esta", "estos", "estas",
    "usar", "incluya", "incluir", "planeamiento", "docente", "estudiante", "estudiantes",
    "hacer", "donde", "cuando", "sobre", "segun", "tambien", "tenga", "tener"
  ]);
  return Array.from(new Set(
    normalizarParaBusqueda(indicaciones)
      .split(/[^a-z0-9]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 5 && !ignorar.has(item))
  )).slice(0, 10);
}

function esCampoMetadataFijo(etiqueta: string) {
  const text = normalizarParaBusqueda(etiqueta);
  return [
    "direccion regional de educacion",
    "regional education directorate",
    "centro educativo",
    "institucion educativa",
    "institution",
    "educational center",
    "nombre de la persona docente",
    "nombre del docente",
    "nombre y apellidos del o la docente",
    "teacher",
    "teacher name",
    "asignatura",
    "materia",
    "subarea",
    "modulo",
    "subject",
    "ano escolar",
    "anos escolar",
    "curso lectivo",
    "academic course",
    "academic year",
    "school year",
    "grado",
    "nivel",
    "nivel educativo",
    "level",
    "grade level",
    "mes",
    "month",
    "periodo lectivo",
    "periodo academico",
    "academic period",
    "school term",
    "periodicidad",
    "periodicity",
    "frequency"
  ].some((alias) => text.startsWith(alias));
}

function esCampoTecnicoConservable(etiqueta: string) {
  const text = normalizarParaBusqueda(etiqueta);
  return [
    "carrera tecnica",
    "modalidad",
    "technical program",
    "technical career",
    "modality",
    "tiempo estimado",
    "estimated time",
    "eje de la politica educativa",
    "educational policy axis"
  ].some((alias) => text.startsWith(alias));
}

export function validarOrdenEncabezadosEstrategias(texto: string, encabezados: string[]) {
  const normalized = normalizarParaBusqueda(texto);
  let cursor = -1;
  const faltantes: string[] = [];
  const fueraDeOrden: string[] = [];

  for (const encabezado of encabezados) {
    const token = normalizarParaBusqueda(encabezado);
    if (!token) continue;
    const posicion = normalized.indexOf(token, cursor + 1);
    if (posicion < 0) {
      faltantes.push(encabezado);
      continue;
    }
    cursor = posicion;
  }

  return {
    cumple: faltantes.length === 0 && fueraDeOrden.length === 0,
    faltantes,
    fueraDeOrden
  };
}

export function completarCamposReferenciaDeterministicamente(
  resultado: any,
  perfilDocumento?: PerfilDocumentoReferencia,
  habilidades: any[] = []
) {
  if (!resultado || typeof resultado !== "object" || !perfilDocumento?.esDocx) return resultado;
  const actuales = resultado.camposReferencia && typeof resultado.camposReferencia === "object"
    ? { ...resultado.camposReferencia }
    : {};
  const contexto = resultado?.controlCalidad?.contextoGeneracion || {};
  const nombre = normalizeText(resultado.nombre);
  const materia = normalizeText(resultado.materiaNombre || resultado.MateriaNombre || contexto.materiaNombre);
  const grado = normalizeText(resultado.grado || contexto.grado);
  const mes = normalizeText(resultado.mes || contexto.mes);
  const tema = normalizeText(contexto.tema);
  const periodicidad = normalizeText(resultado.periodicidad || contexto.periodicidad);
  const competenciaGeneral = normalizeText(
    resultado.competenciaGeneral
    || (Array.isArray(resultado.competenciasGenerales) ? resultado.competenciasGenerales[0] : "")
    || contexto.competenciaGeneral
  );
  const semanas = Math.max(0, Number(resultado?.semanas?.length || contexto.semanas || 0));
  const idiomaIngles = resultado?.idiomaSalida === "en"
    || resultado?.controlCalidad?.idiomaEsperado === "en";
  const habilidadesTexto = habilidades
    .map((habilidad) => normalizeText(habilidad?.DescripcionHabilidad || habilidad))
    .filter(Boolean)
    .join("; ");

  for (const campo of perfilDocumento.camposVariables || []) {
    const etiqueta = normalizeText(campo.etiqueta);
    if (!etiqueta || esCampoMetadataFijo(etiqueta)) continue;
    const existente = Object.entries(actuales).find(
      ([key]) => normalizarParaBusqueda(key) === normalizarParaBusqueda(etiqueta)
    );
    const valorExistente = String(existente?.[1] || "").trim();
    const esMarcadorGenerico = /^(?:valor nuevo|new value|por definir|pendiente|n\/a|no aplica)(?:\b|\s)/i.test(valorExistente);
    // PROFE360 no dispone de estos datos técnicos en todos los centros. En
    // ausencia de una fuente institucional autoritativa se conserva el valor
    // del machote, en lugar de inventarlo a partir de las habilidades.
    if (esCampoTecnicoConservable(etiqueta) && campo.valorAnterior) {
      actuales[etiqueta] = campo.valorAnterior;
      continue;
    }
    if (valorExistente && !esMarcadorGenerico) continue;

    const clave = normalizarParaBusqueda(etiqueta);
    let valor = "";
    if (/subarea|sub area|campo detallado|detailed field/.test(clave)) valor = materia || tema || nombre;
    else if (/competencias? para el desarrollo humano|human development competenc/.test(clave)) {
      valor = competenciaGeneral || campo.valorAnterior;
    }
    if (/^(?:unit|unidad)(?: de estudio| of study)?$/.test(clave)) valor = tema || materia || nombre;
    else if (clave === "domain" || clave === "dominio") valor = materia || tema || nombre;
    else if (clave === "scenario" || clave === "escenario") {
      valor = habilidadesTexto || [materia, grado, mes].filter(Boolean).join(" - ") || tema || nombre;
    }
    else if (/tiempo|duracion|duration|estimated time|time estimate/.test(clave)) {
      valor = semanas
        ? `${semanas} ${idiomaIngles ? (semanas === 1 ? "week" : "weeks") : (semanas === 1 ? "semana" : "semanas")}`
        : periodicidad || mes || (idiomaIngles ? "According to the selected period" : "Según el período seleccionado");
    }
    else if (/competencia general/.test(clave)) {
      valor = competenciaGeneral
        || (idiomaIngles ? "Learning and responsible citizenship" : "Aprendizaje y ciudadanía responsable");
    }
    // Los machotes pueden incorporar cualquier rótulo adicional. Si no existe
    // una regla semántica específica, lo completamos con el contexto actual en
    // vez de bloquear el guardado o conservar el dato del plan anterior.
    if (!valor) {
      valor = tema
        || habilidadesTexto
        || [materia, grado, mes].filter(Boolean).join(" - ")
        || nombre
        || campo.valorAnterior
        || (idiomaIngles ? "Current planning context" : "Contexto del planeamiento actual");
    }
    if (valor) actuales[etiqueta] = valor;
  }
  resultado.camposReferencia = actuales;
  return resultado;
}

export function validarPlaneamientoGenerado(resultado: any, input: {
  nombreSolicitado?: string;
  idiomaEsperado?: "es" | "en";
  estructuraEstrategias?: string[];
  indicacionesDocente?: string;
  habilidades?: any[];
  indicadoresEsperadosPorHabilidad?: number[];
  perfilEstrategias?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
  auditoriaSemantica?: AuditoriaSemanticaPlaneamiento;
  auditoriaSemanticaBloqueante?: boolean;
  referenciaObligatoria?: boolean;
}) {
  const verificaciones: ValidacionPlaneamientoItem[] = [];
  const textoCompleto = obtenerTextoResultadoPlaneamiento(resultado);
  const nombreSolicitado = normalizeText(input.nombreSolicitado);
  const estructura = (input.estructuraEstrategias || []).filter(Boolean);
  const estrategiasEstructuradas = estructurarEstrategiasMediacion(
    resultado?.estrategiasMediacion,
    estructura
  );

  const aprendizajes = splitLines(resultado?.aprendizajesEsperados);
  const saberes = splitLines(resultado?.saberesEsenciales);
  const criterios = splitLines(resultado?.criteriosEvaluacion);
  const indicadores = splitLines(resultado?.indicadoresEvaluacion);
  if (aprendizajes.length && indicadores.length) {
    verificaciones.push({
      codigo: "contenido_base",
      etiqueta: "Contenido pedagógico",
      estado: "ok",
      detalle: `${aprendizajes.length} aprendizaje(s) y ${indicadores.length} indicador(es) generados.`
    });
  } else {
    verificaciones.push({
      codigo: "contenido_base",
      etiqueta: "Contenido pedagógico",
      estado: "error",
      detalle: "Faltan aprendizajes esperados o indicadores de evaluación."
    });
  }

  const perfilDocumento = input.perfilDocumentoReferencia;
  completarCamposReferenciaDeterministicamente(resultado, perfilDocumento, input.habilidades || []);
  const rolesReferencia = new Set(
    (perfilDocumento?.columnas || []).map((columna) => columna.rol).filter(Boolean)
  );
  if (rolesReferencia.has("criterios")) {
    verificaciones.push({
      codigo: "criterios_referencia",
      etiqueta: "Criterios de evaluación",
      estado: criterios.length ? "ok" : "error",
      detalle: criterios.length
        ? `${criterios.length} criterio(s) preparado(s) para su columna específica.`
        : "La referencia contiene una columna de Criterios de Evaluación y quedó vacía."
    });
  }
  if (rolesReferencia.has("saberes")) {
    verificaciones.push({
      codigo: "saberes_referencia",
      etiqueta: "Saberes esenciales",
      estado: saberes.length ? "ok" : "alerta",
      detalle: saberes.length
        ? `${saberes.length} saber(es) esencial(es) preparados para su columna específica.`
        : "La referencia contiene Saberes esenciales; se completarán desde los contenidos actuales antes de exportar."
    });
  }
  if (rolesReferencia.has("indicadores") && !indicadores.length) {
    verificaciones.push({
      codigo: "indicadores_referencia",
      etiqueta: "Columna de indicadores",
      estado: "error",
      detalle: "La referencia contiene una columna de Indicadores y quedó vacía."
    });
  }

  const cantidadesIndicadores = Array.isArray(input.indicadoresEsperadosPorHabilidad)
    && input.indicadoresEsperadosPorHabilidad.length
    ? input.indicadoresEsperadosPorHabilidad
    : Array.isArray(input.habilidades) && input.habilidades.length
      ? cantidadesIndicadoresSolicitadas(input.indicacionesDocente || "", input.habilidades.length)
      : [];
  if (cantidadesIndicadores.length) {
    const numeracionEsperada = cantidadesIndicadores.flatMap((cantidad, indiceHabilidad) =>
      Array.from({ length: cantidad }, (_, indiceIndicador) => `${indiceHabilidad + 1}.${indiceIndicador + 1}`)
    );
    const numeracionActual = indicadores.map((indicador) =>
      String(indicador || "").trim().match(/^(\d+\.\d+)\b/)?.[1] || ""
    );
    const cumpleCantidad = indicadores.length === numeracionEsperada.length;
    const cumpleNumeracion = cumpleCantidad
      && numeracionEsperada.every((numero, index) => numeracionActual[index] === numero);
    verificaciones.push({
      codigo: "cantidad_indicadores",
      etiqueta: "Cantidad y numeración de indicadores",
      estado: cumpleCantidad && cumpleNumeracion ? "ok" : "error",
      detalle: cumpleCantidad && cumpleNumeracion
        ? `Se generaron ${indicadores.length} indicadores con la numeración ${numeracionEsperada.join(", ")}.`
        : `Se requieren ${numeracionEsperada.length} indicadores numerados ${numeracionEsperada.join(", ")}.`
    });
  }

  if (resultado?.contratoGeneracion === "planeamiento-estructurado-v1") {
    const cobertura = Array.isArray(resultado?.coberturaHabilidades)
      ? resultado.coberturaHabilidades
      : [];
    const erroresCobertura = (input.habilidades || []).flatMap((habilidad, indice) => {
      const numero = indice + 1;
      const registro = cobertura.find((item: any) => Number(item?.habilidadIndice) === numero);
      const aprendizajesIndices = Array.isArray(registro?.aprendizajesIndices)
        ? registro.aprendizajesIndices.map(Number)
        : [];
      const indicadoresIndices = Array.isArray(registro?.indicadoresIndices)
        ? registro.indicadoresIndices.map(Number)
        : [];
      const aprendizajeValido = aprendizajesIndices.some((valor: number) => Number.isInteger(valor) && valor >= 1 && valor <= aprendizajes.length);
      const indicadorValido = indicadoresIndices.some((valor: number) => Number.isInteger(valor) && valor >= 1 && valor <= indicadores.length);
      return aprendizajeValido && indicadorValido
        ? []
        : [String(habilidad?.DescripcionHabilidad || `habilidad ${numero}`).trim()];
    });
    verificaciones.push({
      codigo: "cobertura_habilidades",
      etiqueta: "Cobertura de habilidades",
      estado: erroresCobertura.length ? "error" : "ok",
      detalle: erroresCobertura.length
        ? `Estas habilidades no tienen un aprendizaje y un indicador vinculados de forma verificable: ${erroresCobertura.join("; ")}.`
        : `Las ${input.habilidades?.length || 0} habilidad(es) seleccionada(s) quedaron vinculadas a aprendizajes e indicadores.`
    });
  }

  if (estructura.length) {
    const totalesPorFase = estructura.reduce((mapa, fase) => {
      const clave = normalizarParaBusqueda(fase);
      mapa.set(clave, (mapa.get(clave) || 0) + 1);
      return mapa;
    }, new Map<string, number>());
    const aparicionesPorFase = new Map<string, number>();
    const fasesVacias = estrategiasEstructuradas.flatMap((item) => {
      const clave = normalizarParaBusqueda(item.fase);
      const aparicion = (aparicionesPorFase.get(clave) || 0) + 1;
      aparicionesPorFase.set(clave, aparicion);
      if (item.contenido.trim().length >= 20) return [];
      const total = totalesPorFase.get(clave) || 1;
      return [total > 1 ? `${item.fase} (aparición ${aparicion} de ${total})` : item.fase];
    });
    verificaciones.push({
      codigo: "estructura_estrategias",
      etiqueta: "Estrategias de mediación",
      // Si no pudimos separar de forma confiable una fase repetida de la
      // referencia, avisamos; no bloqueamos un planeamiento pedagógicamente
      // completo por una inferencia de formato ambigua.
      estado: fasesVacias.length ? "alerta" : "ok",
      detalle: fasesVacias.length
        ? `Estas fases quedaron vacías o incompletas: ${fasesVacias.join(", ")}.`
        : `Se respetó la secuencia ${estructura.map((item) => item.toUpperCase()).join(" → ")}.`
    });
  } else {
    verificaciones.push({
      codigo: "estructura_estrategias",
      etiqueta: "Estrategias de mediación",
      estado: estrategiasEstructuradas.length ? "ok" : "error",
      detalle: estrategiasEstructuradas.length
        ? `${estrategiasEstructuradas.length} bloque(s) de mediación generados.`
        : "No se generaron estrategias de mediación."
    });
  }

  const perfilEstrategias = input.perfilEstrategias;
  if (perfilEstrategias) {
    const estrategiasTexto = splitLines(resultado?.estrategiasMediacion).join("\n");
    const encabezadosPerfil = estructuraReferenciaConfiable(
      perfilEstrategias.encabezados,
      perfilEstrategias
    );
    const referenciaUsaMomentos = encabezadosPerfil.some((encabezado) =>
      /^momento\s+\d+/i.test(encabezado)
    );
    const resultadoUsaMomentos = /\bmomento\s+[1-4]\s*:/i.test(estrategiasTexto);
    const referenciaUsaEtapasGenericas = encabezadosPerfil.some((encabezado) =>
      /\b(?:primera|segunda)\s+etapa\b|\baprendizaje\s+de\s+conocimientos\b|\bmovilizacion\s+y\s+aplicacion\b/i.test(normalizarParaBusqueda(encabezado))
    );
    const resultadoUsaEtapasGenericas = /\b(?:primera|segunda)\s+etapa\b|\baprendizaje\s+de\s+conocimientos\b|\bmovilizacion\s+y\s+aplicacion\b/i.test(normalizarParaBusqueda(estrategiasTexto));
    const actividadesGeneradas = new Set(
      Array.from(estrategiasTexto.matchAll(/\bactividad\s+n?[.°º]?\s*(\d+)\b/gi))
        .map((match) => Number(match[1]))
        .filter((numero) => Number.isInteger(numero) && numero > 0)
    ).size;
    const minimoActividades = perfilEstrategias.usaActividadesNumeradas
      ? Math.max(1, Math.ceil(perfilEstrategias.cantidadActividadesNumeradas * 0.6))
      : 0;
    const incumpleMomentos = !referenciaUsaMomentos && resultadoUsaMomentos;
    const incumpleEtapasGenericas = !referenciaUsaEtapasGenericas && resultadoUsaEtapasGenericas;
    const incumpleActividades = minimoActividades > 0 && actividadesGeneradas < minimoActividades;
    const validacionOrden = validarOrdenEncabezadosEstrategias(
      estrategiasTexto,
      encabezadosPerfil
    );
    // Una referencia amplia suele abarcar muchas semanas y habilidades
    // anteriores. Para un subconjunto nuevo no corresponde exigir la mitad de
    // todo el trimestre: conservamos profundidad útil, no volumen heredado.
    const referenciaAmplia = perfilEstrategias.cantidadParrafos >= 100
      || perfilEstrategias.cantidadCaracteres >= 15000;
    const factorProfundidad = referenciaAmplia ? 0.3 : 0.5;
    const minimoCaracteres = perfilEstrategias.cantidadCaracteres
      ? Math.max(referenciaAmplia ? 2400 : 400, Math.floor(perfilEstrategias.cantidadCaracteres * factorProfundidad))
      : 0;
    const parrafosGenerados = splitLines(resultado?.estrategiasMediacion).length;
    const minimoParrafos = perfilEstrategias.cantidadParrafos
      ? Math.max(3, Math.ceil(perfilEstrategias.cantidadParrafos * factorProfundidad))
      : 0;
    const incumpleCaracteres = minimoCaracteres > 0 && estrategiasTexto.length < minimoCaracteres;
    // La profundidad no se mide solo por saltos de línea. Un bloque con más
    // desarrollo textual que el requerido no puede rechazarse por tener cinco
    // párrafos menos que un Word de referencia.
    const margenProfundidadTextual = referenciaAmplia ? 1.2 : 1.25;
    const cumpleProfundidadTextual = minimoCaracteres === 0 || estrategiasTexto.length >= Math.ceil(minimoCaracteres * margenProfundidadTextual);
    const incumpleParrafos = minimoParrafos > 0
      && parrafosGenerados < minimoParrafos
      && !cumpleProfundidadTextual;
    const incumpleProfundidad = incumpleCaracteres || incumpleParrafos;
    const contenidoAbsolutamenteInsuficiente = parrafosGenerados < 3 || estrategiasTexto.length < 400;
    const incumplimientoBloqueante = incumpleMomentos
      || incumpleEtapasGenericas
      || contenidoAbsolutamenteInsuficiente;
    const observacionNoBloqueante = incumpleActividades
      || incumpleProfundidad
      || !validacionOrden.cumple;
    verificaciones.push({
      codigo: "fidelidad_referencia",
      etiqueta: "Fidelidad al planeamiento de referencia",
      estado: incumplimientoBloqueante ? "error" : observacionNoBloqueante ? "alerta" : "ok",
      detalle: incumpleMomentos
        ? "La referencia no usa Momentos 1–4, pero esa estructura apareció en el resultado."
        : incumpleEtapasGenericas
          ? "La referencia no usa etapas genéricas, pero aparecieron rótulos como Primera etapa o Aprendizaje de conocimientos."
        : contenidoAbsolutamenteInsuficiente
          ? `Las estrategias son realmente insuficientes: contienen ${parrafosGenerados} párrafos y ${estrategiasTexto.length} caracteres útiles.`
        : incumpleActividades
          ? `La referencia desarrolla ${perfilEstrategias.cantidadActividadesNumeradas} actividades numeradas; el resultado debe incluir al menos ${minimoActividades} con profundidad semejante.`
          : !validacionOrden.cumple
            ? `No se respetó la secuencia de la referencia. Faltantes: ${validacionOrden.faltantes.join(", ") || "ninguno"}. Fuera de orden: ${validacionOrden.fueraDeOrden.join(", ") || "ninguno"}.`
            : incumpleProfundidad
              ? `La referencia es más extensa (${perfilEstrategias.cantidadParrafos} párrafos y ${perfilEstrategias.cantidadCaracteres} caracteres) que el resultado actual (${parrafosGenerados} párrafos y ${estrategiasTexto.length} caracteres). El resultado conserva contenido útil y esta diferencia proporcional no impide guardar; conviene revisarla según el alcance solicitado.`
              : `Se respetó el patrón dinámico de la referencia (${perfilEstrategias.nivelDetalle}, ${actividadesGeneradas || "sin"} actividades numeradas).`
    });
  }

  if (perfilDocumento?.esDocx) {
    const originalidad = detectarCopiaSustantivaReferencia(resultado, perfilDocumento);
    verificaciones.push({
      codigo: "originalidad_referencia",
      etiqueta: "Renovación del contenido de la referencia",
      estado: originalidad.copiaSustantiva ? "error" : "ok",
      detalle: originalidad.copiaSustantiva
        ? `Se detectaron ${originalidad.coincidencias.length} fragmentos copiados literalmente del plan anterior (${Math.round(originalidad.proporcion * 100)}% del contenido de mediación comparable). Deben redactarse nuevamente.`
        : "La estructura se conserva sin reutilizar contenido sustantivo literal del planeamiento anterior."
    });
    const camposEsperados = perfilDocumento.camposVariables
      .filter((campo) => !esCampoMetadataFijo(campo.etiqueta));
    const camposResultado = resultado?.camposReferencia && typeof resultado.camposReferencia === "object"
      ? resultado.camposReferencia
      : {};
    const faltantes = camposEsperados.filter((campo) => {
      const value = Object.entries(camposResultado).find(
        ([key]) => normalizarParaBusqueda(key) === normalizarParaBusqueda(campo.etiqueta)
      )?.[1];
      return !String(value || "").trim();
    });
    verificaciones.push({
      codigo: "campos_machote",
      etiqueta: "Limpieza y llenado del machote",
      // Un rótulo adicional del Word nunca debe impedir guardar contenido
      // pedagógico válido. La mayoría se completa arriba de forma
      // determinística; cualquier formato imposible de inferir queda visible
      // como advertencia editable.
      estado: faltantes.length ? "alerta" : "ok",
      detalle: faltantes.length
        ? `No fue posible inferir automáticamente estos campos opcionales del machote: ${faltantes.map((campo) => campo.etiqueta).join(", ")}. Podés editarlos, pero no bloquean el planeamiento.`
        : "Todos los campos variables detectados tienen un valor nuevo."
    });
  }

  if (nombreSolicitado) {
    const coincide = normalizeText(resultado?.nombre) === nombreSolicitado;
    verificaciones.push({
      codigo: "nombre",
      etiqueta: "Nombre solicitado",
      estado: coincide ? "ok" : "error",
      detalle: coincide
        ? `Se conservará el nombre “${nombreSolicitado}”.`
        : `El resultado no conserva el nombre “${nombreSolicitado}”.`
    });
  }

  const idiomaEsperado = input.idiomaEsperado || "es";
  const idiomaDetectado = detectarIdiomaSalida(textoCompleto);
  verificaciones.push({
    codigo: "idioma",
    etiqueta: "Idioma",
    estado: idiomaDetectado === idiomaEsperado ? "ok" : "alerta",
    detalle: idiomaDetectado === idiomaEsperado
      ? `La salida está en ${idiomaEsperado === "en" ? "inglés" : "español"}.`
      : `Se esperaba ${idiomaEsperado === "en" ? "inglés" : "español"}; conviene revisar el texto antes de guardar.`
  });

  const indicaciones = normalizeText(input.indicacionesDocente);
  if (indicaciones) {
    const claves = palabrasClaveIndicaciones(indicaciones);
    const textoNormalizado = normalizarParaBusqueda(textoCompleto);
    const encontradas = claves.filter((palabra) => textoNormalizado.includes(palabra));
    const proporcion = claves.length ? encontradas.length / claves.length : 1;
    verificaciones.push({
      codigo: "indicaciones",
      etiqueta: "Indicaciones del docente",
      // La coincidencia por palabras clave era un validador heredado y produce
      // falsos negativos con paráfrasis, otros idiomas o indicaciones amplias.
      // Se conserva como advertencia visible, nunca como bloqueo de guardado.
      estado: proporcion >= 0.4 || input.auditoriaSemantica?.cumple ? "ok" : "alerta",
      detalle: proporcion >= 0.4 || input.auditoriaSemantica?.cumple
        ? "Las indicaciones obligatorias tienen evidencia en el resultado."
        : "No existe evidencia suficiente de que se cumplieron las indicaciones obligatorias del docente."
    });
  }

  if (input.referenciaObligatoria || input.auditoriaSemantica) {
    const auditoria = input.auditoriaSemantica;
    const auditoriaDisponible = Boolean(auditoria?.disponible);
    const auditoriaBloqueante = input.auditoriaSemanticaBloqueante !== false;
    verificaciones.push({
      codigo: "auditoria_semantica",
      etiqueta: "Revisión semántica final",
      estado: auditoriaDisponible ? (auditoria?.cumple ? "ok" : (auditoriaBloqueante ? "error" : "alerta")) : "alerta",
      detalle: auditoriaDisponible
        ? (
          auditoria.cumple
            ? "La revisión independiente confirmó referencia, coherencia e indicaciones."
            : `Incumplimientos: ${auditoria.incumplimientos.join(" | ") || "la revisión semántica rechazó el resultado"}`
        )
        : "No fue posible completar la revisión independiente; se permite continuar si las demás verificaciones obligatorias están correctas."
    });
  }

  const errores = verificaciones.filter((item) => item.estado === "error");
  const alertas = verificaciones.filter((item) => item.estado === "alerta");
  return {
    valido: errores.length === 0,
    puedeGuardar: errores.length === 0,
    verificaciones,
    estrategiasEstructuradas
  };
}

export function debeAuditarPlaneamientoConIa(input: {
  validacion: ReturnType<typeof validarPlaneamientoGenerado>;
  indicacionesDocente?: string;
  documentoApoyoTexto?: string;
  usaReferenciaEstrategias?: boolean;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
}) {
  const verificaciones = Array.isArray(input.validacion?.verificaciones)
    ? input.validacion.verificaciones
    : [];
  if (verificaciones.some((item) => item.estado === "error")) return true;
  if (verificaciones.some((item) => item.codigo === "idioma" && item.estado === "alerta")) return true;

  const indicaciones = normalizarParaBusqueda(input.indicacionesDocente);
  const indicacionesComplejas = indicaciones.length >= 180
    || [
      "adecuacion",
      "adaptacion",
      "significativa",
      "obligatori",
      "exactamente",
      "literal",
      "pagina",
      "documento",
      "archivo",
      "conservar",
      "no copiar",
      "referencia",
      "machote"
    ].some((token) => indicaciones.includes(token));
  if (indicacionesComplejas) return true;

  const hayDocumentoApoyo = Boolean(String(input.documentoApoyoTexto || "").trim());
  if (hayDocumentoApoyo && indicaciones) return true;

  if (input.usaReferenciaEstrategias) {
    const perfil = input.perfilEstrategiasReferencia;
    if (!perfil) return true;
    if (perfil.nivelDetalle === "amplio") return true;
    if (perfil.usaActividadesNumeradas || perfil.cantidadPreguntas >= 3) return true;
    if (perfil.encabezados.length >= 6 || perfil.cantidadCaracteres >= 9000 || perfil.cantidadParrafos >= 30) return true;
  }

  return false;
}

async function enriquecerReferenciaDesdeMachotePersistido(resultado: any) {
  const plantilla = resultado?.plantillaFormatoDocx;
  if (!plantilla?.base64) return;
  const perfilActual = resultado?.perfilEstrategiasReferencia || resultado?.controlCalidad?.perfilEstrategias;
  if (Array.isArray(perfilActual?.encabezados) && perfilActual.encabezados.length) return;
  try {
    const perfilDocumento = await analizarReferenciaDocxSemantica({
      buffer: Buffer.from(String(plantilla.base64), "base64"),
      originalname: String(plantilla.nombre || "referencia.docx")
    } as Express.Multer.File);
    const perfilEstrategias = construirPerfilEstrategiasReferencia(
      perfilDocumento.estrategiasTexto,
      perfilDocumento.encabezadosEstrategias
    );
    resultado.perfilDocumentoReferencia = perfilDocumento;
    resultado.perfilEstrategiasReferencia = perfilEstrategias;
    resultado.estructuraEstrategiasReferencia = perfilEstrategias.encabezados;
    if (resultado.controlCalidad && typeof resultado.controlCalidad === "object") {
      resultado.controlCalidad.perfilDocumentoReferencia = perfilDocumento;
      resultado.controlCalidad.perfilEstrategias = perfilEstrategias;
      resultado.controlCalidad.estructuraEstrategias = perfilEstrategias.encabezados;
    }
  } catch (error) {
    console.warn("No se pudo reconstruir el perfil del machote persistido:", error);
  }
}

async function revalidarResultadoPlaneamiento(resultado: any, nombreActual: string) {
  const controlAnterior = resultado?.controlCalidad;
  if (!controlAnterior || typeof controlAnterior !== "object") return null;

  await enriquecerReferenciaDesdeMachotePersistido(resultado);

  const perfilEstrategias = controlAnterior.perfilEstrategias || resultado?.perfilEstrategiasReferencia;
  const estructuraReferencia = estructuraReferenciaConfiable(
    controlAnterior.estructuraEstrategias || resultado?.estructuraEstrategiasReferencia,
    perfilEstrategias
  );
  const referenciaUsaMomentos = Array.isArray(perfilEstrategias?.encabezados)
    && perfilEstrategias.encabezados.some((encabezado: any) => /^momento\s+\d+/i.test(String(encabezado || "")));
  if (!referenciaUsaMomentos && estructuraReferencia.length) {
    resultado.estrategiasMediacion = alinearMomentosConReferencia(
      splitLines(resultado?.estrategiasMediacion),
      estructuraReferencia
    );
  }

  const validacionBase = validarPlaneamientoGenerado(resultado, {
    nombreSolicitado: nombreActual,
    idiomaEsperado: controlAnterior.idiomaEsperado === "en" ? "en" : "es",
    estructuraEstrategias: estructuraReferencia,
    indicacionesDocente: normalizeText(controlAnterior.indicacionesDocente),
    indicadoresEsperadosPorHabilidad: Array.isArray(controlAnterior.indicadoresEsperadosPorHabilidad)
      ? controlAnterior.indicadoresEsperadosPorHabilidad
      : undefined,
    habilidades: Array.isArray(controlAnterior.contextoGeneracion?.habilidades)
      ? controlAnterior.contextoGeneracion.habilidades
      : undefined,
    perfilEstrategias,
    perfilDocumentoReferencia: controlAnterior.perfilDocumentoReferencia || resultado?.perfilDocumentoReferencia,
    auditoriaSemantica: controlAnterior.auditoriaSemantica || undefined,
    auditoriaSemanticaBloqueante: false,
    referenciaObligatoria: Boolean(controlAnterior.referenciaObligatoria)
  });
  const validacion = agregarVerificacionReferenciaWordPersistida(
    resultado,
    validacionBase,
    Boolean(controlAnterior.referenciaObligatoria)
  );

  resultado.estrategiasMediacionEstructuradas = validacion.estrategiasEstructuradas;
  resultado.controlCalidad = {
    ...controlAnterior,
    valido: validacion.valido,
    puedeGuardar: validacion.puedeGuardar,
    verificaciones: validacion.verificaciones,
    nombreSolicitado: nombreActual
  };

  return validacion;
}

async function analizarFormatoDocx(file?: Express.Multer.File) {
  if (!file?.buffer || !/\.docx$/i.test(file.originalname || "")) {
    return { esDocx: false, cantidadTablas: 0, seccionesPlaneamientoDetectadas: 0 };
  }

  try {
    const zip = await JSZip.loadAsync(file.buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    return {
      esDocx: true,
      cantidadTablas: xml ? (xml.match(/<w:tbl\b/g) || []).length : 0,
      seccionesPlaneamientoDetectadas: xml ? countTemplateContentSections(xml) : 0
    };
  } catch {
    return { esDocx: true, cantidadTablas: 0, seccionesPlaneamientoDetectadas: 0 };
  }
}

async function getMateriaNombreOficial(pool: any, institucionId: number, materiaId: number) {
  const result = await pool.request()
    .input("institucionId", sql.Int, institucionId)
    .input("materiaId", sql.Int, materiaId)
    .query(`
      SELECT TOP 1 Nombre
      FROM dbo.Materia
      WHERE MateriaId = @materiaId
        AND InstitucionId = @institucionId
    `);

  return normalizeText(result.recordset[0]?.Nombre);
}

router.post("/analizar-referencia", planeamientoUpload, async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const file = getUploadedFile(req, "archivoReferencia");
    if (!file) return badRequest(res, "Seleccioná un archivo de referencia");
    if (!/\.docx$/i.test(file.originalname || "")) {
      return badRequest(res, "La referencia del planeamiento debe ser un archivo Word (.docx)");
    }

    const contenido = await extractPlantillaFormatoText(file);
    const formato = await analizarFormatoDocx(file);
    const perfilDocumento = await analizarReferenciaDocxSemantica(file);
    const estrategiasReferencia = perfilDocumento.estrategiasTexto
      || extraerEstrategiasMediacionReferencia(contenido.texto);
    const perfilEstrategias = construirPerfilEstrategiasReferencia(
      estrategiasReferencia,
      perfilDocumento.encabezadosEstrategias
    );
    const estructuraEstrategias = perfilEstrategias.encabezados;
    const idioma = detectarIdiomaSalida(contenido.texto);
    const advertencias: string[] = [];

    if (!contenido.texto.trim()) {
      advertencias.push("No se pudo extraer texto del archivo; revisá que no esté protegido o compuesto únicamente por imágenes.");
    }
    if (!estrategiasReferencia.trim()) {
      advertencias.push("No se identificó contenido en la columna de Estrategias de mediación.");
    }
    if (formato.esDocx && !formato.cantidadTablas) {
      advertencias.push("El Word no contiene tablas detectables; se conservarán sus encabezados y orden cuando sea posible.");
    }
    if (formato.esDocx && !formato.seccionesPlaneamientoDetectadas) {
      advertencias.push("No se reconocieron columnas de aprendizajes, estrategias e indicadores. Revisá que el machote tenga esos rótulos visibles antes de generar.");
    }
    if (perfilDocumento.seccionesModelo.length > 1) {
      advertencias.push("La referencia contiene varias secciones de contenido. Seleccioná una como modelo antes de generar.");
    }
    if (!perfilDocumento.seccionesModelo.length) {
      advertencias.push("No se pudo aislar una sección de contenido completa; se usará el orden general del Word y se señalarán las partes que podrían no conservarse.");
    }

    return ok(res, {
      nombre: contenido.nombre || file.originalname,
      idioma,
      idiomaNombre: idioma === "en" ? "Inglés" : "Español",
      esDocx: formato.esDocx,
      cantidadTablas: formato.cantidadTablas,
      seccionesPlaneamientoDetectadas: formato.seccionesPlaneamientoDetectadas,
      estructuraEstrategias,
      perfilEstrategias,
      perfilDocumento,
      seccionesModelo: perfilDocumento.seccionesModelo,
      seccionModeloPredeterminadaId: perfilDocumento.seccionesModelo[0]?.id || null,
      usaComoEjemplo: true,
      puedeUsarseComoMachote: formato.esDocx,
      advertencias,
      listo: contenido.texto.trim().length > 0
    }, "Archivo analizado correctamente");
  } catch (error) {
    console.error("Error analizando referencia de planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo analizar el archivo de referencia" });
  }
});

router.post("/mejorar-prompt", async (req, res) => {
  const operacionId = normalizeOperacionId(req.body?.operacionId);
  actualizarProgresoOperacion(operacionId, 3, "Recibiendo el prompt");
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) {
      marcarErrorProgreso(operacionId, "No se pudo validar la institución");
      return;
    }

    const prompt = normalizeText(req.body?.prompt);
    const grupoId = toOptionalInt(req.body?.grupoId);
    const materiaId = toOptionalInt(req.body?.materiaId);
    const anioLectivoId = toOptionalInt(req.body?.anioLectivoId);
    const periodoId = toOptionalInt(req.body?.periodoId);

    if (prompt.length < 20) {
      marcarErrorProgreso(operacionId, "El prompt está incompleto");
      return badRequest(res, "Construí o escribí primero el prompt que querés mejorar");
    }
    if (prompt.length > 12000) {
      marcarErrorProgreso(operacionId, "El prompt supera el tamaño permitido");
      return badRequest(res, "El prompt no puede superar 12000 caracteres");
    }

    actualizarProgresoOperacion(operacionId, 12, "Validando materia, sección y período");
    const pool = await getPool();
    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, {
      grupoId,
      materiaId,
      anioLectivoId,
      periodoId
    });
    if (asignacion === false) {
      marcarErrorProgreso(operacionId, "No se pudo validar la asignación docente");
      return;
    }

    actualizarProgresoOperacion(operacionId, 30, "Preparando las instrucciones para la IA");
    actualizarProgresoOperacion(operacionId, 40, "La IA está mejorando el prompt");
    const mejorado = await callOpenAiTextIfConfigured(`
Sos un asistente pedagógico que mejora prompts para crear planeamientos didácticos del MEP de Costa Rica.
Mejorá el siguiente prompt de trabajo para que sea claro, concreto, aplicable al aula y resistente a fallos de validación automática.
Conservá exactamente los datos ya indicados: no inventés habilidades, normas, fechas, instituciones, secciones ni contenidos oficiales.
Mantené las indicaciones docentes y el uso solicitado de archivos de ejemplo, machote o apoyo.
Convertí cualquier indicación sobre archivos adjuntos en una obligación verificable: si se pide usar páginas específicas de un PDF, indicá que el planeamiento debe recuperar datos, contextos, ejercicios, representaciones o ejemplos concretos de esas páginas, no solo mencionarlas.
Si hay machote o referencia Word, indicá que debe conservarse su estructura, encabezados, orden y profundidad pedagógica, pero sin copiar contenido sustantivo anterior.
Si hay adecuación curricular significativa, exigí actividades, apoyos, consignas, recursos, productos y ejercicios diferenciados al nivel indicado, no reducciones genéricas.
Si alguna fuente adjunta no puede extraerse, el resultado no debe fingir uso documental: debe explicitar la limitación y construir el planeamiento solo con evidencia disponible, sin referencias decorativas.
Devolvé solamente el prompt mejorado en texto plano, sin saludo, explicación, markdown ni un planeamiento terminado.

PROMPT ORIGINAL:
${prompt}
`, { operacionId, etapa: "mejorar_prompt" });

    if (!mejorado) {
      marcarErrorProgreso(operacionId, "La IA no devolvió un prompt mejorado");
      return res.status(503).json({ ok: false, message: "No se pudo mejorar el prompt con IA. Podés editarlo manualmente o intentar de nuevo." });
    }

    actualizarProgresoOperacion(operacionId, 90, "Validando el prompt mejorado");
    actualizarProgresoOperacion(operacionId, 100, "Prompt mejorado", "completado");
    return ok(res, { prompt: mejorado, usoIa: obtenerUsoIaOperacion(operacionId) }, "Prompt mejorado con IA");
  } catch (error) {
    console.error("Error mejorando prompt de planeamiento:", error);
    marcarErrorProgreso(operacionId, "No se pudo mejorar el prompt");
    return res.status(500).json({ ok: false, message: "No se pudo mejorar el prompt con IA" });
  }
});

router.post("/generar-planeamiento", planeamientoUpload, async (req, res) => {
  const operacionId = normalizeOperacionId(req.body?.operacionId);
  actualizarProgresoOperacion(operacionId, 2, "Recibiendo datos y archivos");
  try {
    const t0 = Date.now();
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) {
      marcarErrorProgreso(operacionId, "No se pudo validar la institución");
      return;
    }

    const materiaId = toOptionalInt(req.body.materiaId);
    const materiaNombre = normalizeText(req.body.materiaNombre);
    const tipoColegio = normalizeText(req.body.tipoColegio);
    const grado = normalizeText(req.body.grado);
    let mes = normalizeText(req.body.mes);
    const tema = normalizeText(req.body.tema);
    const nombrePlaneamiento = normalizeText(req.body.nombrePlaneamiento);
    const periodicidad = normalizarPeriodicidadSeleccionada(req.body.periodicidad);
    const competenciaGeneral = normalizarCompetenciaGeneralSeleccionada(req.body.competenciaGeneral);
    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);
    const promptDocente = normalizeText(req.body.promptDocente);
    const referenciaObligatoria = String(req.body.referenciaObligatoria || "").toLowerCase() === "true";
    const anioLectivoId = toOptionalInt(req.body.anioLectivoId);
    const periodoId = toOptionalInt(req.body.periodoId);
    const grupoId = toOptionalInt(req.body.grupoId);
    let semanas = Math.min(20, Math.max(1, Number(req.body.semanas || 4)));
    const plantillaPromptIAId = toOptionalInt(req.body.plantillaPromptIAId);
    const rawHabilidadesIds = req.body.habilidadesIds ?? req.body["habilidadesIds[]"] ?? [];
    const habilidadesIds: number[] = (Array.isArray(rawHabilidadesIds) ? rawHabilidadesIds : [rawHabilidadesIds])
      .map(Number)
      .filter((n: number) => Number.isInteger(n) && n > 0);

    if (!habilidadesIds.length) {
      marcarErrorProgreso(operacionId, "No se seleccionaron habilidades");
      return badRequest(res, "Debés seleccionar al menos una habilidad");
    }

    actualizarProgresoOperacion(operacionId, 8, "Validando asignación docente");
    const pool = await getPool();
    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) {
      marcarErrorProgreso(operacionId, "No se pudo validar la asignación docente");
      return;
    }
    console.log(`[planeamiento-ia] generar-planeamiento: validación/asignación en ${Date.now() - t0}ms`);

    actualizarProgresoOperacion(operacionId, 15, "Cargando habilidades seleccionadas");
    const ids = habilidadesIds.join(",");
    await ensurePlaneamientoHabilidadDisponibilidad(pool);
    const habilidades = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("esSuperAdmin", sql.Bit, canUseGlobalRows(req) ? 1 : 0)
      .query(`
        SELECT
          h.PlaneamientoHabilidadId,
          h.MateriaId,
          COALESCE(m.Nombre, h.MateriaNombre) AS MateriaNombre,
          h.TipoColegio,
          h.Ciclo,
          h.Grado,
          h.Mes,
          h.Area,
          h.NumeroHabilidad,
          h.DescripcionHabilidad,
          h.DocumentoReferencia
        FROM dbo.PlaneamientoHabilidad h
        LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
        WHERE h.PlaneamientoHabilidadId IN (${ids})
          AND (
            @esSuperAdmin = 1
            OR h.DisponibleTodos = 1
            OR EXISTS (
              SELECT 1
              FROM dbo.PlaneamientoHabilidadInstitucion hi
              WHERE hi.PlaneamientoHabilidadId = h.PlaneamientoHabilidadId
                AND hi.InstitucionId = @institucionId
            )
          )
          AND h.Activo = 1
      `);

    if (!habilidades.recordset.length) {
      marcarErrorProgreso(operacionId, "No se encontraron las habilidades seleccionadas");
      return badRequest(res, "No se encontraron las habilidades seleccionadas");
    }
    if (!mes) {
      mes = Array.from(new Set(
        habilidades.recordset
          .map((habilidad: any) => normalizeText(habilidad?.Mes))
          .filter(Boolean)
      )).join(", ");
    }
    const errorPeriodicidad = validarPeriodicidadPlaneamiento(mes, periodicidad);
    if (errorPeriodicidad) {
      marcarErrorProgreso(operacionId, "La periodicidad no coincide con los meses seleccionados");
      return badRequest(res, errorPeriodicidad);
    }
    console.log(`[planeamiento-ia] generar-planeamiento: carga de habilidades en ${Date.now() - t0}ms`);

    actualizarProgresoOperacion(operacionId, 24, "Analizando el planeamiento de referencia");
    const effectiveMateria = materiaNombre || habilidades.recordset[0]?.MateriaNombre || "Materia";
    const documentoApoyoFiles = getUploadedFiles(req, "documentoApoyo");
    const documentoApoyo = await extractDocumentosApoyoText(documentoApoyoFiles, indicacionesDocente);
    const referenciaAdjunta = getUploadedFile(req, "archivoReferencia");
    const plantillaOpcional = getUploadedFile(req, "plantillaFormato");
    // La referencia es el machote obligatorio. Los controles antiguos podían
    // enviar un segundo campo, pero el flujo actual solo adjunta
    // archivoReferencia; nunca debemos perder su binario por eso.
    const referenciaFile = resolverArchivoMachoteObligatorio(referenciaAdjunta, plantillaOpcional);
    const plantillaFormatoFile = resolverArchivoMachoteObligatorio(referenciaFile, plantillaOpcional);
    if (referenciaObligatoria && !referenciaFile) {
      marcarErrorProgreso(operacionId, "Falta el planeamiento de referencia");
      return badRequest(res, "Debés adjuntar un planeamiento de referencia antes de generar");
    }

    const referencia = await extractPlantillaFormatoText(referenciaFile);
    const perfilDocumentoReferencia = await analizarReferenciaDocxSemantica(referenciaFile);
    // Las filas físicas del Word no equivalen necesariamente a semanas. En
    // machotes técnicos pueden representar resultados, contenidos, etapas o
    // evidencias. La cantidad solicitada por el formulario se conserva y el
    // exportador distribuye el contenido entre todas las filas disponibles.
    const seccionModeloReferenciaId = normalizeText(req.body.seccionModeloReferenciaId);
    if (perfilDocumentoReferencia.seccionesModelo.length > 1 && !seccionModeloReferenciaId) {
      marcarErrorProgreso(operacionId, "Falta seleccionar la sección modelo de la referencia");
      return badRequest(res, "Seleccioná la sección del Word que se usará como modelo");
    }
    const seccionModeloReferencia = seccionModeloReferenciaId
      ? perfilDocumentoReferencia.seccionesModelo.find((seccion) => seccion.id === seccionModeloReferenciaId)
      : perfilDocumentoReferencia.seccionesModelo[0];
    if (seccionModeloReferenciaId && !seccionModeloReferencia) {
      marcarErrorProgreso(operacionId, "La sección modelo seleccionada no existe en la referencia");
      return badRequest(res, "La sección modelo seleccionada ya no coincide con el Word analizado");
    }
    const plantillaFormato = plantillaFormatoFile === referenciaFile
      ? referencia
      : await extractPlantillaFormatoText(plantillaFormatoFile);
    const plantillaFormatoDocx = buildPlantillaFormatoDocx(plantillaFormatoFile);
    const idiomaSalida = detectarIdiomaSalida(referencia.texto, plantillaFormato.texto, documentoApoyo.texto);
    const estrategiasReferencia = seccionModeloReferencia?.estrategiasTexto
      || perfilDocumentoReferencia.estrategiasTexto
      || extraerEstrategiasMediacionReferencia(referencia.texto, plantillaFormato.texto, documentoApoyo.texto);
    const perfilEstrategiasReferencia = construirPerfilEstrategiasReferencia(
      estrategiasReferencia,
      seccionModeloReferencia?.encabezadosEstrategias.length
        ? seccionModeloReferencia.encabezadosEstrategias
        : perfilDocumentoReferencia.encabezadosEstrategias
    );
    const estructuraEstrategiasReferencia = perfilEstrategiasReferencia.encabezados;
    const referenciaEstructuralParaPrompt = construirReferenciaEstructuralParaPrompt(
      perfilDocumentoReferencia,
      perfilEstrategiasReferencia
    );
    const usaReferenciaEstrategias = Boolean(estrategiasReferencia.trim());
    const referenciaEstrategiasObligatoria = referenciaObligatoria && usaReferenciaEstrategias;
    const referenciaGeneralSinEstrategias = Boolean(referenciaFile) && !usaReferenciaEstrategias;
    const estrategiasReferenciaParaRevision = usaReferenciaEstrategias ? estrategiasReferencia : "";
    const perfilEstrategiasParaRevision = usaReferenciaEstrategias ? perfilEstrategiasReferencia : undefined;
    const perfilDocumentoParaRevisionSemantica = usaReferenciaEstrategias ? perfilDocumentoReferencia : undefined;
    if (referenciaGeneralSinEstrategias) {
      actualizarProgresoOperacion(
        operacionId,
        30,
        "No se detectó una columna de mediación; se usará la referencia como machote general"
      );
    }
    actualizarProgresoOperacion(operacionId, 35, "Construyendo el prompt del planeamiento");
    const promptData = await buildPromptDesdeBD(pool, {
      materiaNombre: effectiveMateria,
      tipoColegio,
      grado,
      mes,
      tema,
      semanas,
      habilidades: habilidades.recordset,
      documentoApoyoTexto: documentoApoyo.texto,
      documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : undefined,
      plantillaFormatoTexto: referenciaEstructuralParaPrompt,
      plantillaFormatoNombre: referencia.nombre || plantillaFormato.nombre || undefined,
      plantillaPromptIAId,
      indicacionesDocente,
      promptDocente,
      idiomaSalida,
      usaMachote: !!plantillaFormatoDocx,
      cantidadImagenes: documentoApoyo.imagenes.length,
      nombrePlaneamiento,
      estrategiasReferencia: referenciaEstructuralParaPrompt,
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia,
      perfilDocumentoReferencia,
      usuarioId: getUserId(req) || null,
      esAdmin: canMaintainAnyHabilidad(req)
    });
    console.log(`[planeamiento-ia] generar-planeamiento: prompt construido en ${Date.now() - t0}ms`);
    const prompt = promptData.prompt;
    actualizarProgresoOperacion(operacionId, 45, "La IA está generando el planeamiento");
    const aiResultSinNormalizar = await callOpenAiIfConfigured(prompt, documentoApoyo.imagenes, {
      operacionId,
      etapa: "generar_planeamiento",
      schema: PLANEAMIENTO_GENERACION_SCHEMA,
      schemaName: "planeamiento_didactico_v1"
    });
    const aiResult = normalizarContratoGeneracionPlaneamiento(aiResultSinNormalizar);
    console.log(`[planeamiento-ia] generar-planeamiento: IA en ${Date.now() - t0}ms`);
    actualizarProgresoOperacion(operacionId, 60, "Procesando la respuesta de la IA");
    if (!aiResult) {
      marcarErrorProgreso(operacionId, "El modelo de IA no respondió correctamente");
      return res.status(503).json({
        ok: false,
        message: "El modelo de IA no respondió correctamente. No se generó un planeamiento alternativo para evitar presentar contenido que no provenga del modelo."
      });
    }
    const resultadoBaseSinReglas = aiResult;

    const nombreResultado = nombrePlaneamiento || buildPlaneamientoNombre({ mes, grado, materiaNombre: effectiveMateria });
    const indicadoresEsperadosPorHabilidad = cantidadesIndicadoresSolicitadas(
      indicacionesDocente,
      habilidades.recordset.length
    );

    const estructuraAplicable = estructuraReferenciaConfiable(
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia
    );
    const prepararResultado = (value: any) => {
      const preparado = aplicarReglasObligatoriasPlaneamiento(value, {
        indicacionesDocente,
        materiaNombre: effectiveMateria,
        grado,
        mes,
        tema,
        habilidades: habilidades.recordset,
        documentoApoyoTexto: documentoApoyo.texto,
        estructuraEstrategiasReferencia: estructuraAplicable,
        usaReferenciaEstrategias
      });
      preparado.nombre = nombreResultado;
      if (usaReferenciaEstrategias) {
        preparado.estrategiasMediacion = alinearMomentosConReferencia(
          splitLines(preparado.estrategiasMediacion),
          estructuraAplicable
        );
      }
      return preparado;
    };

    let resultadoBase = prepararResultado(resultadoBaseSinReglas);
    resultadoBase.periodicidad = periodicidad;
    resultadoBase.competenciaGeneral = competenciaGeneral;
    resultadoBase.competenciasGenerales = competenciaGeneral ? [competenciaGeneral] : [];
    let auditoriaSemantica: AuditoriaSemanticaPlaneamiento | undefined;
    actualizarProgresoOperacion(operacionId, 70, "Evaluando la calidad del planeamiento");

    const crearValidacion = (auditoriaSemanticaBloqueante = true) => validarPlaneamientoGenerado(resultadoBase, {
      nombreSolicitado: nombrePlaneamiento,
      idiomaEsperado: idiomaSalida,
      estructuraEstrategias: estructuraAplicable,
      indicacionesDocente,
      habilidades: habilidades.recordset,
      indicadoresEsperadosPorHabilidad,
      perfilEstrategias: usaReferenciaEstrategias ? perfilEstrategiasReferencia : undefined,
      perfilDocumentoReferencia: perfilDocumentoParaRevisionSemantica,
      auditoriaSemantica,
      auditoriaSemanticaBloqueante,
      referenciaObligatoria: referenciaEstrategiasObligatoria
    });
    let validacion = crearValidacion();
    // La generación inicial tiene exactamente una llamada de IA. Cualquier
    // corrección ocurre solo desde la acción explícita "Corregir con IA".
    validacion = crearValidacion();

    const resultado = {
      ...resultadoBase,
      nombre: nombreResultado,
      estrategiasMediacionEstructuradas: validacion.estrategiasEstructuradas,
      documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
      documentoApoyoExtracto: documentoApoyo.texto ? documentoApoyo.texto.slice(0, 16000) : null,
      plantillaFormatoNombre: plantillaFormato.nombre || null,
      documentoReferenciaNombre: referencia.nombre || null,
      idiomaSalida,
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia,
      perfilDocumentoReferencia,
      seccionModeloReferenciaId: seccionModeloReferencia?.id || null,
      usaReferenciaEstrategias,
      referenciaGeneralSinEstrategias,
      controlCalidad: {
        valido: validacion.valido,
        puedeGuardar: validacion.puedeGuardar,
        verificaciones: validacion.verificaciones,
        nombreSolicitado: nombrePlaneamiento || null,
        idiomaEsperado: idiomaSalida,
        estructuraEstrategias: estructuraEstrategiasReferencia,
        perfilEstrategias: usaReferenciaEstrategias ? perfilEstrategiasReferencia : null,
        perfilDocumentoReferencia,
        seccionModeloReferenciaId: seccionModeloReferencia?.id || null,
        indicacionesDocente: indicacionesDocente || null,
        indicadoresEsperadosPorHabilidad,
        // La referencia Word es obligatoria aunque su columna de estrategias
        // sea atípica o no pueda extraerse por completo.
        referenciaObligatoria,
        referenciaGeneralSinEstrategias,
        usaMachote: Boolean(plantillaFormatoDocx),
        auditoriaSemantica: auditoriaSemantica || null,
        usoIa: obtenerUsoIaOperacion(operacionId),
        contextoGeneracion: {
          materiaNombre: effectiveMateria,
          grado,
          mes,
          tema,
          semanas,
          periodicidad,
          competenciaGeneral,
          habilidades: habilidades.recordset.map((habilidad: any) => ({
            Area: habilidad.Area,
            Mes: habilidad.Mes,
            NumeroHabilidad: habilidad.NumeroHabilidad,
            DescripcionHabilidad: habilidad.DescripcionHabilidad
          })),
          documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
          documentoApoyoExtracto: documentoApoyo.texto ? documentoApoyo.texto.slice(0, 16000) : null
        }
      },
      plantillaFormatoCacheId: null,
      plantillaFormatoDocx: plantillaFormatoDocx
        ? {
            nombre: plantillaFormatoDocx.nombre,
            mimeType: plantillaFormatoDocx.mimeType,
            base64: plantillaFormatoDocx.base64
          }
        : null
    };

    actualizarProgresoOperacion(operacionId, 86, "Guardando el historial de generación");
    await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, getAuth(req).usuarioId || null)
      .input("materiaId", sql.Int, materiaId)
      .input("materiaNombre", sql.NVarChar(200), effectiveMateria)
      .input("tipoColegio", sql.NVarChar(100), tipoColegio || null)
      .input("grado", sql.NVarChar(100), grado || null)
      .input("mes", sql.NVarChar(100), mes || null)
      .input("tema", sql.NVarChar(300), tema || null)
      .input("habilidadesJson", sql.NVarChar(sql.MAX), JSON.stringify(habilidades.recordset))
      .input("resultadoJson", sql.NVarChar(sql.MAX), JSON.stringify(resultado))
      .query(`
        INSERT INTO dbo.PlaneamientoIAGeneracion
          (InstitucionId, UsuarioId, MateriaId, MateriaNombre, TipoColegio, Grado, Mes, Tema, HabilidadesJson, ResultadoJson, CreatedAt)
        VALUES
          (@institucionId, @usuarioId, @materiaId, @materiaNombre, @tipoColegio, @grado, @mes, @tema, @habilidadesJson, @resultadoJson, SYSDATETIME())
      `);

    await pool.request()
      .input("tipoGeneracionIAId", sql.Int, 1)
      .input("plantillaPromptIAId", sql.Int, promptData.plantillaPromptIAId)
      .input("usuarioId", sql.Int, getAuth(req).usuarioId || getAuth(req).userId || null)
      .input("datosEntrada", sql.NVarChar(sql.MAX), JSON.stringify({
        materiaNombre: effectiveMateria,
        tipoColegio,
        grado,
        mes,
        tema,
        indicacionesDocente,
        promptDocente,
        semanas,
        habilidadesIds,
        plantillaPromptIAId: promptData.plantillaPromptIAId,
        documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
        plantillaFormatoNombre: plantillaFormato.nombre || null,
        documentoReferenciaNombre: referencia.nombre || null
      }))
      .input("promptGenerado", sql.NVarChar(sql.MAX), prompt)
      .input("respuestaIA", sql.NVarChar(sql.MAX), JSON.stringify(resultado))
      .query(`
        INSERT INTO dbo.HistorialGeneracionIA
          (TipoGeneracionIAId, PlantillaPromptIAId, UsuarioId, DatosEntrada, PromptGenerado, RespuestaIA)
        VALUES
          (@tipoGeneracionIAId, @plantillaPromptIAId, @usuarioId, @datosEntrada, @promptGenerado, @respuestaIA)
      `);
    console.log(`[planeamiento-ia] generar-planeamiento: historial guardado en ${Date.now() - t0}ms`);

    actualizarProgresoOperacion(
      operacionId,
      validacion.puedeGuardar ? 100 : 88,
      validacion.puedeGuardar
        ? "Planeamiento generado y validado"
        : "La IA debe completar ajustes adicionales",
      validacion.puedeGuardar ? "completado" : "procesando"
    );
    ok(res, {
      resultado,
      habilidades: habilidades.recordset,
      generadoConIA: !!aiResult,
      usoIa: obtenerUsoIaOperacion(operacionId)
    }, "Planeamiento generado correctamente");
  } catch (error) {
    console.error("Error generando planeamiento con IA:", error);
    marcarErrorProgreso(operacionId, "No se pudo generar el planeamiento");
    res.status(500).json({ ok: false, message: "No se pudo generar el planeamiento" });
  }
});

router.post("/revisar-planeamiento", async (req, res) => {
  const operacionId = normalizeOperacionId(req.body?.operacionId);
  actualizarProgresoOperacion(operacionId, 89, "Preparando la revisión automática");
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) {
      marcarErrorProgreso(operacionId, "No se pudo validar la institución");
      return;
    }

    const resultadoEntrada = req.body?.resultado;
    if (!resultadoEntrada || typeof resultadoEntrada !== "object") {
      marcarErrorProgreso(operacionId, "No se recibió el planeamiento para revisar");
      return badRequest(res, "No se recibió el planeamiento que se debe revisar");
    }

    const controlAnterior = resultadoEntrada.controlCalidad && typeof resultadoEntrada.controlCalidad === "object"
      ? resultadoEntrada.controlCalidad
      : {};
    const contexto = controlAnterior.contextoGeneracion && typeof controlAnterior.contextoGeneracion === "object"
      ? controlAnterior.contextoGeneracion
      : {};
    const perfilDocumentoReferencia = controlAnterior.perfilDocumentoReferencia
      || resultadoEntrada.perfilDocumentoReferencia;
    const perfilEstrategiasGuardado = controlAnterior.perfilEstrategias
      || resultadoEntrada.perfilEstrategiasReferencia;
    const perfilEstrategiasReferencia = perfilDocumentoReferencia?.estrategiasTexto
      ? construirPerfilEstrategiasReferencia(
          perfilDocumentoReferencia.estrategiasTexto,
          perfilDocumentoReferencia.encabezadosEstrategias || []
        )
      : perfilEstrategiasGuardado;
    const estructuraEstrategiasReferencia = perfilEstrategiasReferencia?.encabezados?.length
      ? perfilEstrategiasReferencia.encabezados
      : Array.isArray(controlAnterior.estructuraEstrategias)
        ? controlAnterior.estructuraEstrategias
        : Array.isArray(resultadoEntrada.estructuraEstrategiasReferencia)
          ? resultadoEntrada.estructuraEstrategiasReferencia
          : [];
    const habilidades = Array.isArray(contexto.habilidades) && contexto.habilidades.length
      ? contexto.habilidades
      : splitLines(resultadoEntrada.aprendizajesEsperados).map((descripcion) => ({
          DescripcionHabilidad: descripcion
        }));
    const materiaNombre = normalizeText(req.body?.materiaNombre || contexto.materiaNombre || resultadoEntrada.materiaNombre);
    const grado = normalizeText(req.body?.grado || contexto.grado || resultadoEntrada.grado);
    const mesesHabilidades = Array.from(new Set(
      habilidades.map((habilidad: any) => normalizeText(habilidad?.Mes)).filter(Boolean)
    ));
    const mes = normalizeText(req.body?.mes || contexto.mes || resultadoEntrada.mes)
      || mesesHabilidades.join(", ");
    const tema = normalizeText(req.body?.tema || contexto.tema || resultadoEntrada.tema);
    const nombreEntrada = normalizeText(req.body?.nombre || resultadoEntrada.nombre);
    const nombreUsaMarcadores = /^(?:mes|month)\b/i.test(nombreEntrada)
      || /-\s*(?:grado|grade|materia|subject)\b/i.test(nombreEntrada);
    const nombrePlaneamiento = !nombreEntrada || nombreUsaMarcadores
      ? buildPlaneamientoNombre({ mes, grado, materiaNombre })
      : nombreEntrada;
    const indicacionesDocente = normalizeText(controlAnterior.indicacionesDocente);
    const documentoApoyoTexto = normalizeText(
      contexto.documentoApoyoExtracto
      || contexto.documentoApoyoTexto
      || resultadoEntrada.documentoApoyoExtracto
      || resultadoEntrada.documentoApoyoTexto
    ).slice(0, 16000);
    const documentoApoyoNombre = normalizeText(
      contexto.documentoApoyoNombre
      || resultadoEntrada.documentoApoyoNombre
    );
    const idiomaSalida: "es" | "en" = controlAnterior.idiomaEsperado === "en" ? "en" : "es";
    const estrategiasReferencia = String(perfilDocumentoReferencia?.estrategiasTexto || "");
    const indicadoresEsperadosPorHabilidad = Array.isArray(controlAnterior.indicadoresEsperadosPorHabilidad)
      ? controlAnterior.indicadoresEsperadosPorHabilidad
      : cantidadesIndicadoresSolicitadas(indicacionesDocente, habilidades.length);
    const referenciaObligatoria = Boolean(
      controlAnterior.referenciaObligatoria
      || perfilDocumentoReferencia?.esDocx
      || estrategiasReferencia
    );
    const usaReferenciaEstrategias = Boolean(estrategiasReferencia.trim());
    const referenciaEstrategiasObligatoria = referenciaObligatoria && usaReferenciaEstrategias;
    const estrategiasReferenciaParaRevision = usaReferenciaEstrategias ? estrategiasReferencia : "";
    const perfilEstrategiasParaRevision = usaReferenciaEstrategias ? perfilEstrategiasReferencia : undefined;
    const perfilDocumentoParaRevisionSemantica = usaReferenciaEstrategias ? perfilDocumentoReferencia : undefined;

    const estructuraAplicable = estructuraReferenciaConfiable(
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia
    );
    const prepararResultado = (value: any) => {
      const preparado = aplicarReglasObligatoriasPlaneamiento(value, {
        indicacionesDocente,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        documentoApoyoTexto,
        estructuraEstrategiasReferencia: estructuraAplicable,
        usaReferenciaEstrategias
      });
      preparado.nombre = nombrePlaneamiento;
      conservarReferenciaWordEnResultado(preparado, resultadoEntrada);
      if (usaReferenciaEstrategias) {
        preparado.estrategiasMediacion = alinearMomentosConReferencia(
          splitLines(preparado.estrategiasMediacion),
          estructuraAplicable
        );
      }
      return preparado;
    };

    let resultado = prepararResultado(resultadoEntrada);
    let auditoriaSemantica: AuditoriaSemanticaPlaneamiento | undefined;

    const validar = (auditoriaSemanticaBloqueante = true) => validarPlaneamientoGenerado(resultado, {
      nombreSolicitado: nombrePlaneamiento,
      idiomaEsperado: idiomaSalida,
      estructuraEstrategias: estructuraAplicable,
      indicacionesDocente,
      habilidades,
      indicadoresEsperadosPorHabilidad,
      perfilEstrategias: perfilEstrategiasParaRevision,
      perfilDocumentoReferencia: perfilDocumentoParaRevisionSemantica,
      auditoriaSemantica,
      auditoriaSemanticaBloqueante,
      referenciaObligatoria: referenciaEstrategiasObligatoria
    });
    let validacion = validar();
    // Esta ruta se ejecuta únicamente cuando la persona docente pulsa
    // "Corregir con IA". Permitimos una corrección explícita, no reintentos.
    const maxCorreccionesSolicitadas = 1;
    const debeAuditar = debeAuditarPlaneamientoConIa({
      validacion,
      indicacionesDocente,
      documentoApoyoTexto,
      usaReferenciaEstrategias,
      perfilEstrategiasReferencia
    });
    if (debeAuditar) {
      actualizarProgresoOperacion(operacionId, 91, "Auditando nuevamente el planeamiento");
      auditoriaSemantica = await auditarPlaneamientoConIa({
        resultado,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        indicacionesDocente,
        documentoApoyoTexto,
        documentoApoyoNombre,
        idiomaSalida,
        estrategiasReferencia: estrategiasReferenciaParaRevision,
        perfilEstrategiasReferencia: perfilEstrategiasParaRevision,
        perfilDocumentoReferencia: perfilDocumentoParaRevisionSemantica,
        operacionId,
        etapa: "auditoria_correccion"
      });
      validacion = validar();
    }
    let reparacionesAutomaticas = 0;

    while (!validacion.puedeGuardar && reparacionesAutomaticas < maxCorreccionesSolicitadas) {
      const fallas = validacion.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => `${item.etiqueta}: ${item.detalle}`);
      const soloFalloAuditoriaNoDisponible = fallas.length === 1
        && !auditoriaSemantica?.disponible
        && validacion.verificaciones.some(
          (item) => item.codigo === "auditoria_semantica" && item.estado === "error"
        );
      if (!fallas.length || soloFalloAuditoriaNoDisponible) break;

      actualizarProgresoOperacion(
        operacionId,
        94,
        "Aplicando la mejora integral"
      );
      const reparado = await repararPlaneamientoConIa({
        resultado,
        fallas,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        indicacionesDocente,
        documentoApoyoTexto,
        documentoApoyoNombre,
        idiomaSalida,
        nombrePlaneamiento,
        estrategiasReferencia: estrategiasReferenciaParaRevision,
        perfilEstrategiasReferencia: perfilEstrategiasParaRevision,
        perfilDocumentoReferencia: perfilDocumentoParaRevisionSemantica,
        operacionId,
        etapa: `reparacion_correccion_${reparacionesAutomaticas + 1}`
      });

      if (!reparado) break;

      resultado = prepararResultado(reparado);
      reparacionesAutomaticas += 1;
      auditoriaSemantica = debeAuditar
        ? await auditarPlaneamientoConIa({
            resultado,
            materiaNombre,
            grado,
            mes,
            tema,
            habilidades,
            indicacionesDocente,
            documentoApoyoTexto,
            documentoApoyoNombre,
            idiomaSalida,
            estrategiasReferencia: estrategiasReferenciaParaRevision,
            perfilEstrategiasReferencia: perfilEstrategiasParaRevision,
            perfilDocumentoReferencia: perfilDocumentoParaRevisionSemantica,
            operacionId,
            etapa: `auditoria_post_reparacion_correccion_${reparacionesAutomaticas}`
          })
        : undefined;
      validacion = validar();
      actualizarProgresoOperacion(
        operacionId,
        97,
        "Comprobando las mejoras"
      );
    }
    // La auditoría semántica aporta una segunda opinión y puede orientar la
    // corrección, pero no vuelve a bloquear un resultado que ya satisface las
    // verificaciones determinísticas obligatorias.
    validacion = validar(false);

    resultado.estrategiasMediacionEstructuradas = validacion.estrategiasEstructuradas;
    resultado.estructuraEstrategiasReferencia = estructuraEstrategiasReferencia;
    resultado.perfilEstrategiasReferencia = perfilEstrategiasReferencia;
    resultado.controlCalidad = {
      ...controlAnterior,
      valido: validacion.valido,
      puedeGuardar: validacion.puedeGuardar,
      verificaciones: validacion.verificaciones,
      nombreSolicitado: nombrePlaneamiento,
      estructuraEstrategias: estructuraEstrategiasReferencia,
      perfilEstrategias: perfilEstrategiasParaRevision,
      referenciaObligatoria,
      auditoriaSemantica,
      usoIa: obtenerUsoIaOperacion(operacionId),
      contextoGeneracion: {
        ...contexto,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        documentoApoyoNombre,
        documentoApoyoExtracto: documentoApoyoTexto || null
      }
    };

    actualizarProgresoOperacion(
      operacionId,
      validacion.puedeGuardar ? 100 : 98,
      validacion.puedeGuardar
        ? "Planeamiento corregido y listo para guardar"
        : "La revisión aún encontró datos pendientes",
      validacion.puedeGuardar ? "completado" : "procesando"
    );
    return ok(
      res,
      { resultado, usoIa: obtenerUsoIaOperacion(operacionId) },
      validacion.puedeGuardar
        ? "Planeamiento revisado y listo para guardar"
        : "La revisión todavía encontró datos pendientes"
    );
  } catch (error) {
    console.error("Error revisando planeamiento con IA:", error);
    marcarErrorProgreso(operacionId, "No se pudo completar la revisión automática");
    return res.status(500).json({ ok: false, message: "No se pudo revisar nuevamente el planeamiento" });
  }
});

router.post("/validar-guardado-planeamiento", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const resultado = normalizarSeleccionesPlaneamientoResultado(
      hydratePlantillaFormatoDocx(req.body?.resultado || {})
    );
    const nombre = normalizeText(req.body?.nombre || resultado.nombre);
    if (!resultado?.controlCalidad || typeof resultado.controlCalidad !== "object") {
      return badRequest(res, "Generá o revisá el planeamiento antes de validarlo para guardar");
    }

    resultado.nombre = nombre;
    const validacion = await revalidarResultadoPlaneamiento(resultado, nombre);
    return ok(res, {
      resultado,
      listoParaGuardar: Boolean(validacion?.puedeGuardar),
      verificaciones: validacion?.verificaciones || []
    }, validacion?.puedeGuardar
      ? "Planeamiento validado y listo para guardar"
      : "El planeamiento requiere ajustes antes de guardar");
  } catch (error) {
    console.error("Error validando guardado de planeamiento:", error);
    return res.status(500).json({ ok: false, message: "No se pudo validar el planeamiento antes de guardar" });
  }
});

router.post("/guardar-planeamiento", async (req, res) => {
  const operacionId = normalizeOperacionId(req.body?.operacionId);
  const progresoGuardado = crearProgresoGuardado(req.body);
  actualizarProgresoOperacion(
    operacionId,
    progresoGuardado.porcentaje(0),
    `Validando el planeamiento${progresoGuardado.sufijo}`
  );
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) {
      marcarErrorProgreso(operacionId, "No se pudo validar la institución");
      return;
    }

    const anioLectivoId = toRequiredInt(req.body.anioLectivoId, "anioLectivoId", res);
    const periodoId = toRequiredInt(req.body.periodoId, "periodoId", res);
    const grupoId = toRequiredInt(req.body.grupoId, "grupoId", res);
    const materiaId = toRequiredInt(req.body.materiaId, "materiaId", res);
    if ([anioLectivoId, periodoId, grupoId, materiaId].some((v) => v === null)) {
      marcarErrorProgreso(operacionId, "Faltan datos requeridos para guardar");
      return;
    }

    const resultado = normalizarSeleccionesPlaneamientoResultado(
      hydratePlantillaFormatoDocx(req.body.resultado || {})
    );
    const fechaInicio = normalizeNullableText(req.body.fechaInicio);
    const fechaFin = normalizeNullableText(req.body.fechaFin);
    const observaciones = normalizeNullableText(req.body.observaciones || "");
    const usuarioId = getAuth(req).usuarioId || getAuth(req).userId || null;

    actualizarProgresoOperacion(
      operacionId,
      progresoGuardado.porcentaje(0.2),
      `Comprobando materia y asignación${progresoGuardado.sufijo}`
    );
    const pool = await getPool();
    const materiaNombreOficial = await getMateriaNombreOficial(pool, institucionId, materiaId);
    const nombreSolicitado = normalizeText(req.body.nombre || resultado.nombre);
    const nombre = nombreSolicitado || buildPlaneamientoNombre({
      mes: req.body.mes || resultado.mes || resultado.Mes || req.body.mesPlaneamiento,
      grado: req.body.grado || resultado.grado || resultado.Grado || req.body.gradoPlaneamiento,
      materiaNombre: materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || req.body.materiaNombrePlaneamiento
    });

    resultado.nombre = nombre;
    resultado.materiaNombre = materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || "";
    resultado.MateriaNombre = resultado.materiaNombre;
    const validacionGuardado = await revalidarResultadoPlaneamiento(resultado, nombre);
    if (validacionGuardado && !validacionGuardado.puedeGuardar) {
      const detalle = validacionGuardado.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => item.detalle)
        .join(" ");
      marcarErrorProgreso(operacionId, "El planeamiento no superó la validación final");
      return badRequest(res, `Revisá el planeamiento antes de guardarlo. ${detalle}`.trim());
    }
    delete resultado.documentoWordInterno;

    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) {
      marcarErrorProgreso(operacionId, "No se pudo validar la asignación docente");
      return;
    }

    actualizarProgresoOperacion(
      operacionId,
      progresoGuardado.porcentaje(0.45),
      `Iniciando el guardado${progresoGuardado.sufijo}`
    );
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      const planeamientoResult = await request
        .input("institucionId", sql.Int, asignacion ? Number(asignacion.InstitucionId) : institucionId)
        .input("anioLectivoId", sql.Int, anioLectivoId)
        .input("periodoId", sql.Int, periodoId)
        .input("grupoId", sql.Int, grupoId)
        .input("materiaId", sql.Int, materiaId)
        .input("usuarioId", sql.Int, asignacion ? Number(asignacion.UsuarioId) : usuarioId)
        .input("nombre", sql.NVarChar(200), nombre)
        .input("fechaInicio", sql.Date, fechaInicio)
        .input("fechaFin", sql.Date, fechaFin)
        .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
        .input("resultadoIAJson", sql.NVarChar(sql.MAX), JSON.stringify(resultado || {}))
        .query(`
          INSERT INTO dbo.Planeamiento
            (InstitucionId, AnioLectivoId, PeriodoId, GrupoId, MateriaId, UsuarioId, Nombre, FechaInicio, FechaFin, Observaciones, ResultadoIAJson, Activo, CreatedAt)
          OUTPUT INSERTED.PlaneamientoId
          VALUES
            (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, @resultadoIAJson, 1, ${SQL_COSTA_RICA_NOW})
        `);

      const planeamientoId = planeamientoResult.recordset[0].PlaneamientoId;
      actualizarProgresoOperacion(
        operacionId,
        progresoGuardado.porcentaje(0.7),
        `Guardando indicadores${progresoGuardado.sufijo}`
      );
      const indicadores = splitLines(resultado.indicadoresEvaluacion)
        .map((indicador) => normalizeText(indicador))
        .filter(Boolean);

      if (indicadores.length) {
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, planeamientoId)
          .input("indicadoresJson", sql.NVarChar(sql.MAX), JSON.stringify(indicadores))
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            SELECT
              @planeamientoId,
              j.Descripcion,
              NULL,
              1,
              ${SQL_COSTA_RICA_NOW}
            FROM OPENJSON(@indicadoresJson)
            WITH (Descripcion NVARCHAR(MAX) '$') j
            WHERE NULLIF(LTRIM(RTRIM(j.Descripcion)), N'') IS NOT NULL
          `);
      }

      actualizarProgresoOperacion(
        operacionId,
        progresoGuardado.porcentaje(0.9),
        `Confirmando cambios${progresoGuardado.sufijo}`
      );
      await transaction.commit();
      const esUltimo = progresoGuardado.indice + 1 >= progresoGuardado.total;
      actualizarProgresoOperacion(
        operacionId,
        esUltimo ? 100 : progresoGuardado.porcentaje(1),
        esUltimo ? "Planeamiento guardado" : `Sección guardada${progresoGuardado.sufijo}`,
        esUltimo ? "completado" : "procesando"
      );
      created(res, { planeamientoId }, "Planeamiento guardado correctamente");
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error guardando planeamiento generado:", error);
    marcarErrorProgreso(operacionId, "No se pudo guardar el planeamiento");
    res.status(500).json({ ok: false, message: "No se pudo guardar el planeamiento generado" });
  }
});


function safeFileName(value: string) {
  return String(value || "planeamiento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function splitLines(value: any) {
  if (Array.isArray(value)) {
    return value
      .flatMap((x) => String(x || "").split(/\r?\n+/))
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function indicadoresPlaneamientoSonIguales(actuales: any[], nuevos: any[]) {
  const normalizar = (items: any[]) => splitLines(items)
    .map((item) => normalizeText(item).replace(/\s+/g, " ").toLocaleLowerCase())
    .filter(Boolean);
  const izquierda = normalizar(actuales);
  const derecha = normalizar(nuevos);
  return izquierda.length === derecha.length && izquierda.every((item, indice) => item === derecha[indice]);
}

function parseResultadoPlaneamiento(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function docText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text: repararMojibakeTexto(text), bold: !!opts.bold, size: opts.size || 22, color: opts.color });
}

function fieldParagraph(label: string, value: any, opts: { size?: number } = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      docText(label, { bold: true, size: opts.size || 20 }),
      docText(String(value || ""), { size: opts.size || 20 })
    ]
  });
}

function simpleParagraph(text: string, opts: { bold?: boolean; size?: number; align?: any; color?: string } = {}) {
  const color = opts.color || (esTextoAzul(text) ? "0070C0" : undefined);
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 80 },
    children: [docText(limpiarMarcadorColor(text || ""), { bold: opts.bold, size: opts.size || 20, color })]
  });
}

function textParagraphs(items: any[], fallback: string, opts: { bulletPrefix?: string; size?: number; numbered?: boolean } = {}) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const source = values.length ? values : [fallback];
  return source.map((item, index) => simpleParagraph(`${opts.numbered ? `${index + 1}. ` : (opts.bulletPrefix || "")}${item}`, {
    size: opts.size || 19,
    bold: !values.length && index === 0 ? false : undefined
  }));
}

function textParagraphsEstrategiasMomentos(items: any[], fallback: string, size = 19) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const source = values.length ? values : [fallback];
  const paragraphs: Paragraph[] = [];
  source.forEach((item, idx) => {
    const m = String(item || "").match(/^\s*(Momento\s+\d+\s*:[^\.]*\.)\s*(.*)$/i);
    if (m) {
      const titulo = String(m[1] || "").trim();
      const cuerpo = String(m[2] || "").trim();
      paragraphs.push(simpleParagraph(titulo, { bold: true, size }));
      if (cuerpo) paragraphs.push(simpleParagraph(cuerpo, { size }));
      if (idx < source.length - 1) paragraphs.push(simpleParagraph("", { size }));
      return;
    }
    paragraphs.push(simpleParagraph(`- ${item}`, { size }));
  });
  return paragraphs;
}

function limpiarMarcadorColor(text: string) {
  return String(text || "").replace(/^\s*\[AZUL\]\s*/i, "");
}

function esTextoAzul(text: string) {
  return /^\s*\[AZUL\]/i.test(String(text || ""));
}

function p(text: string, opts: { bold?: boolean; size?: number; heading?: any; align?: any; color?: string } = {}) {
  const color = opts.color || (esTextoAzul(text) ? "0070C0" : undefined);
  return new Paragraph({
    heading: opts.heading,
    alignment: opts.align,
    spacing: { after: 120 },
    children: [docText(limpiarMarcadorColor(text || ""), { bold: opts.bold, size: opts.size, color })]
  });
}

function bullet(text: string) {
  const color = esTextoAzul(text) ? "0070C0" : undefined;
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80 },
    children: [docText(limpiarMarcadorColor(text), { size: 21, color })]
  });
}

function cell(children: Paragraph[], width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    children,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "444444" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "444444" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "444444" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "444444" }
    }
  });
}

function templateCell(children: Paragraph[], opts: { width?: number; columnSpan?: number; bold?: boolean; fill?: string } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    columnSpan: opts.columnSpan,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    shading: opts.fill ? { fill: opts.fill } : undefined,
    children,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "000000" }
    }
  });
}

function templateHeaderCell(text: string, width: number) {
  return templateCell([simpleParagraph(text, { bold: true, size: 20, align: AlignmentType.CENTER })], { width, fill: "F2F2F2" });
}

function mergedTemplateCell(text: string, columnSpan: number) {
  return templateCell([simpleParagraph(text, { bold: true, size: 20, align: AlignmentType.CENTER })], {
    width: 14034,
    columnSpan,
    fill: "F2F2F2"
  });
}

function periodicidadConMarca(periodoTexto: string, periodicidadSeleccionada?: string) {
  const seleccion = normalizarPeriodicidadSeleccionada(periodicidadSeleccionada || periodoTexto);
  const mark = (key: string) => seleccion === key ? "X" : " ";
  return `( ${mark("mes")} ) mes  ( ${mark("bimestre")} ) bimestre  ( ${mark("trimestre")} ) trimestre  ( ${mark("semestre")} ) semestre`;
}

function escapeXmlText(value: any) {
  return repararMojibakeTexto(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXmlTagName(tagName: string) {
  return tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findXmlElementEnd(xml: string, startIndex: number, tagName: string) {
  const escapedTagName = escapeXmlTagName(tagName);
  const tagMatcher = new RegExp(`<\\/?${escapedTagName}(?:\\s[^>]*?)?\\/?\>`, "g");
  tagMatcher.lastIndex = startIndex;
  let depth = 0;

  for (let match = tagMatcher.exec(xml); match; match = tagMatcher.exec(xml)) {
    const token = match[0];
    const isClosing = token.startsWith("</");
    const isSelfClosing = /\/\s*>$/.test(token);

    if (isClosing) {
      depth -= 1;
      if (depth === 0) return tagMatcher.lastIndex;
      continue;
    }

    if (!isSelfClosing) depth += 1;
    if (isSelfClosing && depth === 0) return tagMatcher.lastIndex;
  }

  return -1;
}

function replaceDirectXmlElements(xml: string, tagName: string, replacer: (elementXml: string) => string) {
  const escapedTagName = escapeXmlTagName(tagName);
  const openingMatcher = new RegExp(`<${escapedTagName}(?:\\s[^>]*?)?>`, "g");
  let result = "";
  let cursor = 0;

  for (let match = openingMatcher.exec(xml); match; match = openingMatcher.exec(xml)) {
    const startIndex = match.index;
    const endIndex = findXmlElementEnd(xml, startIndex, tagName);
    if (endIndex < 0) return xml;

    result += xml.slice(cursor, startIndex);
    result += replacer(xml.slice(startIndex, endIndex));
    cursor = endIndex;
    openingMatcher.lastIndex = endIndex;
  }

  return result ? `${result}${xml.slice(cursor)}` : xml;
}

type TemplateParagraphSpec = {
  text: string;
  bold?: boolean;
};

function getDirectXmlElements(xml: string, tagName: string) {
  const escapedTagName = escapeXmlTagName(tagName);
  const openingMatcher = new RegExp(`<${escapedTagName}(?:\\s[^>]*?)?>`, "g");
  const elements: string[] = [];

  for (let match = openingMatcher.exec(xml); match; match = openingMatcher.exec(xml)) {
    const endIndex = findXmlElementEnd(xml, match.index, tagName);
    if (endIndex < 0) break;
    elements.push(xml.slice(match.index, endIndex));
    openingMatcher.lastIndex = endIndex;
  }

  return elements;
}

function getCellParagraphTexts(cellXml: string) {
  return getDirectXmlElements(cellXml, "w:p")
    .map((paragraphXml) => xmlWordToText(paragraphXml).trim());
}

function isTemplateHeading(value: string) {
  const text = String(value || "").trim();
  if (!text || text.length > 100) return false;
  const normalized = normalizarParaBusqueda(text);
  const known = [
    "focalizacion",
    "exploracion",
    "contrastacion",
    "aplicacion",
    "problematizacion",
    "inicio",
    "desarrollo",
    "cierre",
    "introduction",
    "exploration",
    "application",
    "mediation phase"
  ];
  return known.some((heading) => normalized === heading || normalized.startsWith(`${heading}:`))
    || /^(tema\s+n?[.°º]?\s*\d+|actividades?\s+de\s+(inicio|desarrollo|cierre)|actividad\s+n?[.°º]?\s*\d+|avances?\s+en\s+monograf[ií]a|monograf[ií]a|lectura\s+diaria)\b/i.test(text)
    || (text.length >= 3 && text === text.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(text));
}

function addBoldToRunProperties(runProperties: string) {
  if (/<w:b(?:\s[^>]*)?\/?>/.test(runProperties)) return runProperties;
  if (runProperties) return runProperties.replace(/<\/w:rPr>$/, "<w:b/></w:rPr>");
  return "<w:rPr><w:b/></w:rPr>";
}

function xmlParagraphFromTemplate(paragraphTemplate: string, spec: TemplateParagraphSpec) {
  const opening = paragraphTemplate.match(/^<w:p(?:\s[^>]*)?>/)?.[0] || "<w:p>";
  const paragraphProperties = paragraphTemplate.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] || "";
  let runProperties = paragraphTemplate.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] || "";
  if (spec.bold) runProperties = addBoldToRunProperties(runProperties);
  if (!spec.text) return `${opening}${paragraphProperties}</w:p>`;
  return `${opening}${paragraphProperties}<w:r>${runProperties}<w:t xml:space="preserve">${escapeXmlText(spec.text)}</w:t></w:r></w:p>`;
}

function replaceCellBodyPreservingFormatting(cellXml: string, specs: TemplateParagraphSpec[]) {
  const opening = cellXml.match(/^<w:tc(?:\s[^>]*)?>/)?.[0] || "<w:tc>";
  const properties = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/)?.[0] || "";
  const paragraphs = getDirectXmlElements(cellXml, "w:p");
  const fallback = paragraphs[0] || "<w:p/>";
  const headingTemplate = paragraphs.find((paragraph) => isTemplateHeading(xmlWordToText(paragraph))) || fallback;
  const bodyTemplate = paragraphs.find((paragraph) => {
    const text = xmlWordToText(paragraph).trim();
    return text && !isTemplateHeading(text);
  }) || fallback;
  const source = specs.length ? specs : [{ text: "" }];
  const content = source.map((spec) => {
    const template = spec.bold ? headingTemplate : bodyTemplate;
    return xmlParagraphFromTemplate(template, spec);
  }).join("");
  return `${opening}${properties}${content}</w:tc>`;
}

function replaceSimpleTemplateField(cellXml: string, value: any) {
  const lines = getCellParagraphTexts(cellXml);
  const firstLine = lines.find(Boolean) || xmlWordToText(cellXml).trim();
  const colonIndex = firstLine.indexOf(":");
  const label = colonIndex >= 0 ? firstLine.slice(0, colonIndex + 1) : firstLine;
  return replaceCellBodyPreservingFormatting(cellXml, [{
    text: `${label}${value ? ` ${String(value).trim()}` : ""}`.trim()
  }]);
}

function optionMatchesSelection(option: string, selection: string) {
  const normalizedOption = normalizarParaBusqueda(option);
  const normalizedSelection = normalizarParaBusqueda(selection);
  if (!normalizedOption || !normalizedSelection) return false;
  if (normalizedSelection.includes(normalizedOption) || normalizedOption.includes(normalizedSelection)) return true;

  const selectionTokens = new Set(normalizedSelection.split(/[^a-z0-9]+/).filter(Boolean));
  const ordinalGroups = [
    ["primero", "primer", "1", "i"],
    ["segundo", "2", "ii"],
    ["tercero", "tercer", "3", "iii"],
    ["cuarto", "4", "iv"]
  ];
  if (ordinalGroups.some((group) =>
    group.some((token) => normalizedOption.split(/[^a-z0-9]+/).includes(token))
    && group.some((token) => selectionTokens.has(token))
  )) return true;

  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "setiembre", "septiembre", "octubre", "noviembre", "diciembre",
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  return months.some((month) => normalizedOption.includes(month) && normalizedSelection.includes(month));
}

function markTemplateOptions(value: string, selection: string) {
  return String(value || "").replace(
    /\(\s*[xX]?\s*\)([^(]*)/g,
    (_match, optionText) => `(${optionMatchesSelection(optionText, selection) ? "X" : " "})${optionText}`
  );
}

function replacePeriodTemplateField(cellXml: string, selection: string) {
  const lines = getCellParagraphTexts(cellXml);
  const source = lines.length ? lines : [xmlWordToText(cellXml).trim()];
  const hasOptions = source.some((line) => /\(\s*[xX]?\s*\)/.test(line));
  const specs = source.map((line, index) => {
    if (hasOptions) return { text: markTemplateOptions(line, selection) };
    if (index === 0) {
      const colonIndex = line.indexOf(":");
      const label = colonIndex >= 0 ? line.slice(0, colonIndex + 1) : line;
      return { text: `${label}${selection ? ` ${selection}` : ""}`.trim() };
    }
    return { text: "" };
  });
  return replaceCellBodyPreservingFormatting(cellXml, specs);
}

function replacePeriodicityTemplateField(cellXml: string, periodicity: string, months: string) {
  const lines = getCellParagraphTexts(cellXml);
  const source = lines.length ? lines : [xmlWordToText(cellXml).trim()];
  const specs = source.map((line, index) => {
    let next = markTemplateOptions(line, months);
    if (index === 0) {
      const optionIndex = next.search(/\(\s*[xX]?\s*\)/);
      const prefix = optionIndex >= 0 ? next.slice(0, optionIndex) : next;
      const options = optionIndex >= 0 ? next.slice(optionIndex) : "";
      const colonIndex = prefix.indexOf(":");
      const label = colonIndex >= 0 ? prefix.slice(0, colonIndex + 1) : prefix;
      next = `${label}${periodicity ? ` ${periodicity}` : ""}${options ? ` ${options}` : ""}`.trim();
    }
    return { text: next };
  });
  return replaceCellBodyPreservingFormatting(cellXml, specs);
}

function replaceSchoolGradeTemplateField(cellXml: string, grade: string, periodicity: string, months: string) {
  const lines = getCellParagraphTexts(cellXml);
  const source = lines.length ? lines : [xmlWordToText(cellXml).trim()];
  const periodicityNormalized = normalizarPeriodicidadSeleccionada(periodicity);
  const specs = source.map((line, index) => {
    if (index === 0) {
      const colonIndex = line.indexOf(":");
      const label = colonIndex >= 0 ? line.slice(0, colonIndex + 1) : line;
      return { text: `${label}${grade ? ` ${grade}` : ""}`.trim() };
    }

    const normalized = normalizarParaBusqueda(line);
    if (normalized.includes("mensual") || normalized.includes("monthly")) {
      const marked = line.replace(/\(\s*[xX]?\s*\)/, `(${periodicityNormalized === "mes" ? "X" : " "})`);
      const colonIndex = marked.indexOf(":");
      const label = colonIndex >= 0 ? marked.slice(0, colonIndex + 1) : marked;
      return { text: `${label}${months ? ` ${months}` : ""}`.trim() };
    }
    return { text: markTemplateOptions(line, periodicity || months) };
  });
  return replaceCellBodyPreservingFormatting(cellXml, specs);
}

function replaceMetadataTemplateCell(cellXml: string, values: {
  direccionRegional: string;
  centroEducativo: string;
  docente: string;
  materia: string;
  anioEscolar: string;
  cursoLectivo: string;
  periodoTexto: string;
  periodicidad: string;
  meses: string;
  camposReferencia?: Record<string, string>;
}) {
  const text = normalizarParaBusqueda(xmlWordToText(cellXml));
  const startsWithAny = (aliases: string[]) => aliases.some((alias) => text.startsWith(alias));

  if (startsWithAny(["direccion regional de educacion", "regional education directorate"])) {
    return replaceSimpleTemplateField(cellXml, values.direccionRegional);
  }
  if (startsWithAny(["centro educativo", "institucion educativa", "school", "institution:", "educational center"])) {
    return replaceSimpleTemplateField(cellXml, values.centroEducativo);
  }
  if (startsWithAny(["nombre de la persona docente", "nombre del docente", "nombre y apellidos del o la docente", "docente", "teacher:", "teacher name", "name of the teacher"])) {
    return replaceSimpleTemplateField(cellXml, values.docente);
  }
  if (startsWithAny(["asignatura", "materia", "subarea", "modulo", "subject", "sub-area"])) {
    return replaceSimpleTemplateField(cellXml, values.materia);
  }
  if (startsWithAny(["anos escolar", "ano escolar"])) {
    return replaceSchoolGradeTemplateField(cellXml, values.cursoLectivo, values.periodicidad, values.meses);
  }
  if (startsWithAny(["curso lectivo", "academic course", "academic year", "school year"])) {
    return replaceSimpleTemplateField(cellXml, values.anioEscolar);
  }
  if (startsWithAny(["level:", "grade level"])) {
    return replaceSimpleTemplateField(cellXml, values.cursoLectivo);
  }
  if (startsWithAny(["grado:", "nivel educativo:", "grade:"])) {
    return replaceSimpleTemplateField(cellXml, values.cursoLectivo);
  }
  if (startsWithAny(["mes:", "month:"])) {
    return replaceSimpleTemplateField(cellXml, values.meses);
  }
  if (startsWithAny(["periodo lectivo", "periodo academico", "academic period", "school term"])) {
    return replacePeriodTemplateField(cellXml, values.periodoTexto);
  }
  if (startsWithAny(["periodicidad", "periodicity", "frequency"])) {
    return replacePeriodicityTemplateField(cellXml, values.periodicidad, values.meses);
  }

  const primeraLinea = xmlWordToText(cellXml).split(/\n+/).map((linea) => linea.trim()).find(Boolean) || "";
  const etiqueta = primeraLinea.match(/^([^:]{2,120}):/)?.[1]?.trim() || "";
  const etiquetaNormalizada = normalizarParaBusqueda(etiqueta);
  const camposReferencia = values.camposReferencia || {};
  const campoDinamico = Object.entries(camposReferencia).find(
    ([nombre]) => normalizarParaBusqueda(nombre) === etiquetaNormalizada
  );
  if (campoDinamico) {
    return replaceSimpleTemplateField(cellXml, campoDinamico[1]);
  }
  return cellXml;
}

export function detectTemplateContentRole(cellXml: string): TemplateContentRole | null {
  const text = normalizarParaBusqueda(xmlWordToText(cellXml));
  if (
    text.includes("saber esencial")
    || text.includes("saberes esenciales")
    || text === "contenidos"
    || text === "contenido"
    || text.includes("essential knowledge")
    || text.includes("core knowledge")
    || text.includes("learning contents")
  ) return "saberes";
  if (
    text.includes("tiempo estimado")
    || text.includes("duracion estimada")
    || text.includes("estimated time")
    || text.includes("estimated duration")
  ) return "tiempo";
  if (!text.includes("indicador") && !text.includes("indicator") && (
    text.includes("aprendizaje esperado")
    || text.includes("aprendizajes esperados")
    || text.includes("resultado de aprendizaje")
    || text.includes("resultados de aprendizaje")
    || text.includes("aprendizaje por lograr")
    || text.includes("aprendizajes por lograr")
    || text.includes("habilidad especifica")
    || text.includes("habilidades especificas")
    || text.includes("learner can")
    || text.includes("learning outcome")
    || text.includes("expected learning")
    || text.includes("learning objective")
    || text.includes("learning goal")
    || text === "goal"
    || text === "goals"
  )) return "aprendizajes";
  if (
    text.includes("estrategias de mediacion")
    || text.includes("estrategia de mediacion")
    || text.includes("mediacion pedagogica")
    || text.includes("actividades de mediacion")
    || text.includes("situaciones de aprendizaje")
    || text.includes("experiencias de aprendizaje")
    || text === "metodologia"
    || text.includes("didactic sequence mediation")
    || text.includes("didactic mediation")
    || text.includes("sequence mediation")
    || text.includes("mediation sequence")
    || text.includes("mediation strateg")
    || text.includes("mediation activities")
    || text.includes("task mediation")
    || text.includes("teaching strateg")
    || text.includes("estrategias didacticas sugeridas")
    || text.includes("estrategia didactica sugerida")
    || text.includes("learning activities")
  ) return "estrategias";
  if (
    text === "indicadores"
    || text === "indicador"
    || text === "indicators"
    || text === "indicator"
    || text.includes("indicadores de evaluacion")
    || text.includes("indicador de evaluacion")
    || text.includes("indicadores del aprendizaje esperado")
    || text.includes("indicador del aprendizaje esperado")
    || text.includes("evidencias de aprendizaje")
    || text.includes("assessment strategies")
    || text.includes("assessment evidence")
    || text.includes("assessment evidences")
    || text.includes("evidence of learning")
    || text.includes("learning evidence")
    || text.includes("indicators of learning")
    || text.includes("learning indicators")
    || text.includes("evaluation indicator")
    || text.includes("assessment indicator")
  ) return "indicadores";
  if (
    text.includes("criterios de evaluacion")
    || text.includes("criterio de evaluacion")
    || text.includes("criterios de logro")
    || text.includes("criterio de logro")
    || text.includes("assessment criteria")
    || text.includes("success criteria")
    || text.includes("evaluation criteria")
  ) return "criterios";
  return null;
}

function countTemplateContentSections(documentXml: string) {
  return getDirectXmlElements(documentXml, "w:tbl").reduce((total, tableXml) => {
    const sections = getDirectXmlElements(tableXml, "w:tr").filter((rowXml) => {
      const roles = getDirectXmlElements(rowXml, "w:tc").map(detectTemplateContentRole);
      return roles.filter(Boolean).length >= 2;
    }).length;
    return total + sections;
  }, 0);
}

function buildStrategyParagraphSpecs(items: any[], referenceHeadings: string[] = []) {
  const headingPattern = /^(tema\s+n?[.°º]?\s*\d+|actividades?\s+de\s+(?:inicio|desarrollo|cierre)|actividad\s+n?[.°º]?\s*\d+|avances?\s+en\s+monograf[ií]a(?:\s+y\s+lectura\s+diaria)?|monograf[ií]a|lectura\s+diaria|focalizaci[oó]n|exploraci[oó]n|contrastaci[oó]n|aplicaci[oó]n|problematizaci[oó]n|inicio|desarrollo|cierre|introduction|exploration|application|mediation\s+phase)\b\s*[:.\-]?\s*(.*)$/i;
  const referenceHeadingMap = new Map(
    (Array.isArray(referenceHeadings) ? referenceHeadings : [])
      .map((heading) => [normalizarParaBusqueda(heading), String(heading || "").trim()] as const)
      .filter(([normalized, heading]) => normalized && heading)
  );
  const specs: TemplateParagraphSpec[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    for (const line of String(item || "").split(/\r?\n+/).map((part) => part.trim()).filter(Boolean)) {
      const normalizedLine = normalizarParaBusqueda(line);
      const exactReferenceHeading = referenceHeadingMap.get(normalizedLine);
      if (exactReferenceHeading) {
        specs.push({ text: line, bold: true });
        continue;
      }
      const match = line.match(headingPattern);
      if (match) {
        specs.push({ text: String(match[1] || "").trim(), bold: true });
        if (match[2]) specs.push({ text: String(match[2]).trim() });
      } else {
        specs.push({ text: line, bold: isTemplateHeading(line) });
      }
    }
  }

  return specs;
}

function buildListParagraphSpecs(items: any[]) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function replaceCompetencyTemplateCell(cellXml: string, selectedCompetency: string) {
  const lines = getCellParagraphTexts(cellXml);
  const text = lines.join(" ").trim();
  const normalized = normalizarParaBusqueda(text);
  if (
    !/\(\s*[xX]?\s*\)/.test(text)
    || !(normalized.includes("competencia") || normalized.includes("competenc"))
  ) return cellXml;

  const selected = normalizarParaBusqueda(selectedCompetency);
  const comparable = normalizarParaBusqueda(text.replace(/\(\s*[xX]?\s*\)/g, ""));
  const ignored = new Set(["competencia", "competencias", "competency", "competencies", "para", "for", "con", "and", "the", "una", "las", "los", "del"]);
  const selectedTokens = selected.split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !ignored.has(token));
  const comparableTokens = new Set(comparable.split(/[^a-z0-9]+/).filter((token) => token.length > 3 && !ignored.has(token)));
  const matchingTokens = selectedTokens.filter((token) => comparableTokens.has(token)).length;
  const marked = Boolean(selected)
    && (
      selected === comparable
      || selected.includes(comparable)
      || comparable.includes(selected)
      || (selectedTokens.length > 0 && matchingTokens / selectedTokens.length >= 0.6)
    );
  const replaced = text.replace(/\(\s*[xX]?\s*\)(?![\s\S]*\(\s*[xX]?\s*\))/, `(${marked ? "X" : " "})`);
  return replaceCellBodyPreservingFormatting(cellXml, [{ text: replaced }]);
}

function replaceReflectionTemplateCell(cellXml: string, reflections: any) {
  const lines = getCellParagraphTexts(cellXml);
  const firstLine = lines.find(Boolean) || "";
  const text = normalizarParaBusqueda(firstLine);
  const reflectionMap = [
    {
      aliases: ["que funciono", "what worked"],
      value: reflections?.queFunciono
    },
    {
      aliases: ["que no funciono", "what did not work", "what didnt work"],
      value: reflections?.queNoFunciono
    },
    {
      aliases: ["que puedo mejorar", "what can i improve"],
      value: reflections?.quePuedoMejorar
    }
  ];
  const match = reflectionMap.find((item) => item.aliases.some((alias) => text.startsWith(alias)));
  if (!match) return cellXml;
  return replaceCellBodyPreservingFormatting(cellXml, [
    { text: firstLine, bold: true },
    { text: String(match.value || "").trim() }
  ]);
}

function replaceObservationsTemplateCell(cellXml: string, observations: string) {
  const lines = getCellParagraphTexts(cellXml);
  const firstLine = lines.find(Boolean) || "";
  const text = normalizarParaBusqueda(firstLine);
  if (!(text.startsWith("observaciones") || text.startsWith("observations"))) return cellXml;
  const colonIndex = firstLine.indexOf(":");
  const label = colonIndex >= 0 ? firstLine.slice(0, colonIndex + 1) : firstLine;
  return replaceCellBodyPreservingFormatting(cellXml, [
    { text: label, bold: true },
    { text: String(observations || "").trim() }
  ]);
}

const TEMPLATE_PEDAGOGICAL_FIELD_LABELS = new Set([
  "learn to know",
  "learn to do",
  "learn to be and live in community",
  "grammar sentence frames",
  "grammar & sentence frames",
  "grammar and sentence frames",
  "vocabulary",
  "phonology",
  "function",
  "discourse markers",
  "psychosocial",
  "sociocultural",
  "aprender a conocer",
  "aprender a hacer",
  "aprender a ser y vivir en comunidad",
  "gramatica y estructuras",
  "vocabulario",
  "fonologia",
  "funcion",
  "marcadores discursivos"
]);

function normalizePedagogicalFieldValues(fields: any[]) {
  const values = new Map<string, string[]>();
  for (const field of Array.isArray(fields) ? fields : []) {
    const key = normalizarParaBusqueda(field?.campo);
    if (!key) continue;
    const entries = splitLines(field?.valores).map((item) => String(item || "").trim()).filter(Boolean);
    values.set(key, entries);
  }
  return values;
}

function replacePedagogicalVariableTemplateCell(cellXml: string, fields: Map<string, string[]>) {
  const lines = getCellParagraphTexts(cellXml).filter(Boolean);
  const hasVariableLabels = lines.some((line) => (
    TEMPLATE_PEDAGOGICAL_FIELD_LABELS.has(normalizarParaBusqueda(line))
  ));
  if (!hasVariableLabels) return cellXml;

  const specs: TemplateParagraphSpec[] = [];
  let insideVariableField = false;
  for (const line of lines) {
    const key = normalizarParaBusqueda(line);
    if (TEMPLATE_PEDAGOGICAL_FIELD_LABELS.has(key)) {
      insideVariableField = true;
      specs.push({ text: line, bold: true });
      specs.push(...(fields.get(key) || []).map((text) => ({ text })));
      continue;
    }
    // El contenido situado después de un rótulo pedagógico pertenece al plan
    // anterior. Se elimina hasta encontrar el próximo rótulo de la misma celda.
    if (!insideVariableField) specs.push({ text: line });
  }

  return replaceCellBodyPreservingFormatting(cellXml, specs);
}

function templateTableHasContentSlots(tableXml: string) {
  return getDirectXmlElements(tableXml, "w:tr").some((rowXml) => {
    const roles = getDirectXmlElements(rowXml, "w:tc").map(detectTemplateContentRole);
    return roles.filter(Boolean).length >= 2;
  });
}

function templateTableContentRowCount(tableXml: string) {
  const rows = getDirectXmlElements(tableXml, "w:tr");
  let activeRoles: Array<TemplateContentRole | null> | null = null;
  let count = 0;
  for (const rowXml of rows) {
    const roles = getDirectXmlElements(rowXml, "w:tc").map(detectTemplateContentRole);
    if (roles.filter(Boolean).length >= 2) {
      activeRoles = roles;
      continue;
    }
    const cells = getDirectXmlElements(rowXml, "w:tc");
    if (esFilaCierreContenido(cells.map((cellXml) => xmlWordToText(cellXml)))) {
      activeRoles = null;
      continue;
    }
    if (activeRoles && cells.length) count += 1;
  }
  return count;
}

export function contarFilasContenidoPlantillaDocx(documentXml: string) {
  return getDirectXmlElements(documentXml, "w:tbl").map(templateTableContentRowCount);
}

function distributeItemsAcrossSections(items: any[], sectionCount: number) {
  const count = Math.max(1, sectionCount);
  const clean = (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const groups = Array.from({ length: count }, () => [] as string[]);
  clean.forEach((item, index) => {
    const target = Math.min(count - 1, Math.floor(index * count / clean.length));
    groups[target].push(item);
  });
  return groups;
}

export function construirContenidoSeccionesPlantilla(resultado: any, contenido: any, sectionCount: number) {
  const count = Math.max(1, sectionCount);
  const weeks = Array.isArray(resultado?.semanas) ? resultado.semanas : [];
  // Solo hay correspondencia uno-a-uno cuando el machote realmente ofrece la
  // misma cantidad de bloques que semanas. Si tiene más filas, se trata como
  // una tabla de contenido y se distribuyen los apartados globales sin repetir.
  const usarSemanasDirectamente = weeks.length === count;
  const fallbackLearnings = distributeItemsAcrossSections(contenido?.aprendizajes, count);
  const fallbackKnowledge = distributeItemsAcrossSections(contenido?.saberes, count);
  const fallbackCriteria = distributeItemsAcrossSections(contenido?.criterios, count);
  const fallbackStrategies = distributeItemsAcrossSections(contenido?.estrategias, count);
  const fallbackIndicators = distributeItemsAcrossSections(contenido?.indicadores, count);

  return Array.from({ length: count }, (_, index) => {
    const week = usarSemanasDirectamente && weeks[index] && typeof weeks[index] === "object" ? weeks[index] : null;
    const weeklyLearnings = splitLines(week?.habilidadBase || week?.proposito);
    const weeklyStrategies = splitLines(week?.mediacionPedagogica);
    const weeklyIndicators = splitLines(week?.indicadores);
    return {
      aprendizajes: weeklyLearnings.length ? weeklyLearnings : fallbackLearnings[index],
      saberes: fallbackKnowledge[index].length
        ? fallbackKnowledge[index]
        : fallbackCriteria[index],
      criterios: fallbackCriteria[index].length
        ? fallbackCriteria[index]
        : splitLines(week?.proposito),
      estrategias: weeklyStrategies.length ? weeklyStrategies : fallbackStrategies[index],
      indicadores: weeklyIndicators.length ? weeklyIndicators : fallbackIndicators[index],
      camposPedagogicos: normalizePedagogicalFieldValues(week?.camposPedagogicos)
    };
  });
}

function renderSemanticTemplateTable(tableXml: string, input: {
  metadata: Parameters<typeof replaceMetadataTemplateCell>[1];
  competenciaGeneral: string;
  seccionesContenido: ReturnType<typeof construirContenidoSeccionesPlantilla>;
  encabezadosEstrategias: string[];
  reflexiones: any;
  observaciones: string;
}) {
  const rows = getDirectXmlElements(tableXml, "w:tr");
  const headerRoles = rows.map((rowXml) => {
    const roles = getDirectXmlElements(rowXml, "w:tc").map(detectTemplateContentRole);
    return roles.filter(Boolean).length >= 2 ? roles : null;
  });
  const hasContentSlots = headerRoles.some(Boolean);
  let activeRoles: Array<TemplateContentRole | null> | null = null;
  let contentRowIndex = 0;
  let rowIndex = 0;

  return replaceDirectXmlElements(tableXml, "w:tr", (originalRowXml) => {
    const currentHeaderRoles = headerRoles[rowIndex++] || null;
    const rowText = normalizarParaBusqueda(xmlWordToText(originalRowXml));
    const rowCells = getDirectXmlElements(originalRowXml, "w:tc");
    const isClosingRow = esFilaCierreContenido(rowCells.map((cellXml) => xmlWordToText(cellXml)));
    const isReflectionSection = isClosingRow && /reflexiones docentes|teacher reflections/.test(rowText);
    const isReflectionQuestions = rowText.startsWith("que funciono")
      || rowText.startsWith("que no funciono")
      || rowText.startsWith("que puedo mejorar")
      || rowText.startsWith("what worked")
      || rowText.startsWith("what can i improve");
    const isObservations = isClosingRow && /observaciones|observations/.test(rowText);
    const defaultSection = input.seccionesContenido[0] || {
      aprendizajes: [], saberes: [], criterios: [], estrategias: [], indicadores: [], camposPedagogicos: new Map()
    };
    const currentSection = activeRoles && !currentHeaderRoles
      ? input.seccionesContenido[Math.min(contentRowIndex, input.seccionesContenido.length - 1)] || defaultSection
      : defaultSection;

    let cellIndex = 0;
    let rowXml = replaceDirectXmlElements(originalRowXml, "w:tc", (cellXml) => {
      const currentCellIndex = cellIndex++;
      let next = replaceMetadataTemplateCell(cellXml, input.metadata);
      next = replaceCompetencyTemplateCell(next, input.competenciaGeneral);
      next = replacePedagogicalVariableTemplateCell(next, currentSection.camposPedagogicos);

      if (isReflectionQuestions) return replaceReflectionTemplateCell(next, input.reflexiones);
      if (isObservations) return replaceObservationsTemplateCell(next, input.observaciones);
      if (!hasContentSlots || currentHeaderRoles || isReflectionSection || !activeRoles) return next;

      const role = activeRoles[currentCellIndex];
      if (!role) return replaceCellBodyPreservingFormatting(next, []);
      if (role === "aprendizajes") {
        return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(currentSection.aprendizajes));
      }
      if (role === "saberes") {
        return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(
          currentSection.saberes.length ? currentSection.saberes : currentSection.criterios
        ));
      }
      if (role === "criterios") {
        return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(
          currentSection.criterios.length ? currentSection.criterios : currentSection.aprendizajes
        ));
      }
      if (role === "estrategias") {
        return replaceCellBodyPreservingFormatting(next, buildStrategyParagraphSpecs(
          currentSection.estrategias,
          input.encabezadosEstrategias
        ));
      }
      if (role === "tiempo") {
        // PROFE360 todavía no administra horas por resultado de aprendizaje.
        // Se conserva el tiempo del machote como dato técnico de respaldo.
        return next;
      }
      return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(currentSection.indicadores));
    });

    if (currentHeaderRoles) {
      activeRoles = currentHeaderRoles;
      return rowXml;
    }
    if (isReflectionSection || isReflectionQuestions || isObservations) {
      activeRoles = null;
      return rowXml;
    }
    if (hasContentSlots && activeRoles) contentRowIndex += 1;
    return rowXml;
  });
}

export async function renderPlaneamientoEnPlantillaDocx(input: {
  resultado: any;
  row: any;
  contenido: any;
  docente: string;
  direccionRegional: string;
  centroEducativo: string;
  anioEscolar: string;
  cursoLectivo: string;
  periodoTexto: string;
}) {
  const template = input.resultado?.plantillaFormatoDocx;
  if (!template?.base64) return null;

  const zip = await JSZip.loadAsync(Buffer.from(String(template.base64), "base64"));
  const originalPackageEntries = new Set(Object.keys(zip.files));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return null;

  let xml = await documentFile.async("string");
  const contentRowsPerTable = contarFilasContenidoPlantillaDocx(xml);
  const semanticSectionCount = contentRowsPerTable.reduce((total, count) => total + count, 0);
  const sectionContents = construirContenidoSeccionesPlantilla(
    input.resultado,
    input.contenido,
    semanticSectionCount || 1
  );
  let semanticSectionIndex = 0;
  let tableIndex = 0;
  const metadata = {
    direccionRegional: input.direccionRegional,
    centroEducativo: input.centroEducativo,
    docente: input.docente,
    materia: input.row.MateriaNombre || input.resultado?.materiaNombre || "",
    anioEscolar: input.anioEscolar,
    cursoLectivo: input.cursoLectivo,
    periodoTexto: input.periodoTexto,
    periodicidad: input.contenido.periodicidad,
    meses: input.resultado?.mes || input.resultado?.Mes || "",
    camposReferencia: input.resultado?.camposReferencia && typeof input.resultado.camposReferencia === "object"
      ? input.resultado.camposReferencia
      : {}
  };
  xml = replaceDirectXmlElements(xml, "w:tbl", (tableXml) => {
    const contentRowCount = contentRowsPerTable[tableIndex++] || 0;
    const tableSections = contentRowCount
      ? sectionContents.slice(semanticSectionIndex, semanticSectionIndex + contentRowCount)
      : [sectionContents[0]];
    semanticSectionIndex += contentRowCount;
    return renderSemanticTemplateTable(tableXml, {
      metadata,
      competenciaGeneral: input.contenido.competenciaGeneral || "",
      seccionesContenido: tableSections,
      encabezadosEstrategias: Array.isArray(input.resultado?.estructuraEstrategiasReferencia)
        ? input.resultado.estructuraEstrategiasReferencia
        : [],
      reflexiones: input.contenido.reflexiones,
      observaciones: input.contenido.observaciones || input.row.Observaciones || ""
    });
  });

  zip.file("word/document.xml", xml);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name]?.dir && !originalPackageEntries.has(name)) {
      delete zip.files[name];
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

// Verificación posterior a la exportación: la IA genera contenido, pero el
// Word final debe demostrar que aún respeta el machote concreto que se subió.
// No contiene reglas de materias ni nombres de plantillas: compara únicamente
// topología, roles detectados y contenido nuevo que el propio sistema entregó.
export async function validarWordExportadoContraReferencia(input: {
  referencia: Buffer;
  generado: Buffer;
  contenido: any;
  nombreReferencia?: string;
}) {
  const referencia = await analizarReferenciaDocxSemantica({
    buffer: input.referencia,
    originalname: input.nombreReferencia || "referencia.docx"
  } as Express.Multer.File);
  const generado = await analizarReferenciaDocxSemantica({
    buffer: input.generado,
    originalname: "planeamiento-generado.docx"
  } as Express.Multer.File);
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!referencia.esDocx || !generado.esDocx) {
    errores.push("No fue posible leer la estructura DOCX de referencia o del documento generado.");
  }
  if (referencia.cantidadTablas !== generado.cantidadTablas) {
    errores.push(`El Word generado tiene ${generado.cantidadTablas || 0} tabla(s) y la referencia tiene ${referencia.cantidadTablas || 0}.`);
  }
  const filasReferencia = referencia.filasFisicasPorTabla || [];
  const filasGenerado = generado.filasFisicasPorTabla || [];
  if (filasReferencia.join(",") !== filasGenerado.join(",")) {
    errores.push(`El Word generado no conserva la misma cantidad de filas por tabla que la referencia (generado: ${filasGenerado.join(", ") || "ninguna"}; referencia: ${filasReferencia.join(", ") || "ninguna"}).`);
  }
  const firmaRoles = (perfil: PerfilDocumentoReferencia) => perfil.seccionesModelo
    .map((seccion) => seccion.roles.map((rol) => rol || "adicional").join("|"))
    .join(";");
  if (firmaRoles(referencia) !== firmaRoles(generado)) {
    errores.push("Las columnas pedagógicas detectadas no conservan los mismos roles que la referencia.");
  }

  // El análisis semántico se usa para entender la plantilla, pero Word puede
  // serializar celdas combinadas y párrafos de una forma que deje contenido
  // válido fuera de valoresContenidoAnterior. Para confirmar que el texto
  // nuevo llegó al archivo final, la fuente de verdad es el XML completo.
  const textoGeneradoSemantico = normalizarParaBusqueda(obtenerTextoResultadoPlaneamiento({
    aprendizajesEsperados: generado.valoresContenidoAnterior.filter(Boolean),
    estrategiasMediacion: generado.estrategiasTexto
  }));
  let textoGenerado = normalizarTextoWordParaComparacion(textoGeneradoSemantico);
  try {
    const zipGenerado = await JSZip.loadAsync(input.generado);
    const documentXmlGenerado = await zipGenerado.file("word/document.xml")?.async("string");
    if (documentXmlGenerado) textoGenerado = normalizarTextoWordParaComparacion(xmlWordToText(documentXmlGenerado));
  } catch (error) {
    // Si el XML no pudiera releerse, conservamos la validación semántica; la
    // estructura DOCX ya fue comprobada antes de llegar a este punto.
    console.warn("No se pudo leer el texto completo del Word exportado:", error);
  }
  const rolesReferencia = new Set(referencia.columnas.map((columna) => columna.rol).filter(Boolean));
  const valoresEsperados = [
    ...(rolesReferencia.has("aprendizajes") ? splitLines(input.contenido?.aprendizajes) : []),
    ...(rolesReferencia.has("saberes") ? splitLines(input.contenido?.saberes) : []),
    ...(rolesReferencia.has("criterios") ? splitLines(input.contenido?.criterios) : []),
    ...(rolesReferencia.has("estrategias") ? splitLines(input.contenido?.estrategias) : []),
    ...(rolesReferencia.has("indicadores") ? splitLines(input.contenido?.indicadores) : [])
  ]
    .map((valor) => normalizarTextoWordParaComparacion(valor))
    .filter((valor) => valor.length >= 24);
  const valoresAusentes = valoresEsperados.filter((valor) => !textoGenerado.includes(valor));
  if (valoresAusentes.length) {
    // La distribución del contenido cambia entre machotes: una celda puede
    // resumir, dividir o combinar elementos que venían separados en el
    // resultado IA. Exigir coincidencia literal de cada fragmento genera
    // falsos positivos y no prueba un daño del DOCX. Se conserva el dato para
    // diagnóstico, sin impedir entregar un Word cuya estructura es correcta.
    advertencias.push(`No se localizaron literalmente ${valoresAusentes.length} contenido(s) nuevos previstos en el Word exportado.`);
  }
  // La ausencia total sí demuestra que el render no depositó ningún contenido
  // pedagógico nuevo. Ese caso no es una diferencia de formato y se mantiene
  // como bloqueo para no entregar un machote vacío o sin renovar.
  if (valoresEsperados.length && valoresAusentes.length === valoresEsperados.length) {
    errores.push("El Word exportado no contiene ningún contenido pedagógico nuevo verificable.");
  }

  const valoresAnteriores = referencia.valoresContenidoAnterior
    .map((valor) => normalizarParaBusqueda(valor))
    .filter((valor) => valor.length >= 100 && !valoresEsperados.includes(valor));
  const residuos = valoresAnteriores.filter((valor) => textoGeneradoSemantico.includes(valor));
  if (residuos.length) {
    errores.push(`Se detectaron ${residuos.length} fragmento(s) sustantivo(s) de la referencia dentro del Word exportado.`);
  }
  const diagnostico = {
    tablas: { referencia: referencia.cantidadTablas || 0, generado: generado.cantidadTablas || 0 },
    filasPorTabla: { referencia: filasReferencia, generado: filasGenerado },
    firmaColumnas: { referencia: firmaRoles(referencia), generado: firmaRoles(generado) },
    contenido: {
      esperados: valoresEsperados.length,
      encontrados: valoresEsperados.length - valoresAusentes.length,
      faltantes: valoresAusentes.slice(0, 5).map((valor) => valor.slice(0, 160))
    },
    residuosReferencia: residuos.length
  };
  return { valido: errores.length === 0, errores, advertencias, diagnostico, referencia, generado };
}

function tableRow(values: { text: string; bold?: boolean; width?: number }[]) {
  return new TableRow({
    children: values.map((value) => cell([p(value.text, { bold: value.bold, size: value.bold ? 21 : 20 })], value.width))
  });
}

function normalizeResultadoForDoc(resultado: any, indicadoresFallback: string[]) {
  const aprendizajes = splitLines(resultado?.aprendizajesEsperados).map(limpiarPrefijoAprendizaje).filter(Boolean);
  const criterios = splitLines(resultado?.criteriosEvaluacion).map(limpiarPrefijoAprendizaje).filter(Boolean);
  const saberes = splitLines(resultado?.saberesEsenciales).map(limpiarPrefijoAprendizaje).filter(Boolean);
  const estrategiasBase = splitLines(resultado?.estrategiasMediacion);
  const estrategiaAdecuacion = resultado?.estrategiaAdecuacionSignificativa;
  const textoAdecuacionVisible = estrategiaAdecuacion?.aplica && estrategiaAdecuacion?.textoVisible
    ? String(estrategiaAdecuacion.textoVisible)
    : "";
  const estructuraReferencia = Array.isArray(resultado?.estructuraEstrategiasReferencia)
    ? resultado.estructuraEstrategiasReferencia
    : [];
  const estrategiasSinFormato = limpiarEstrategiasMediacion(estrategiasBase);
  const usaReferenciaEstrategias = Boolean(
    resultado?.usaReferenciaEstrategias
    || resultado?.plantillaFormatoNombre
    || resultado?.perfilEstrategiasReferencia
  );
  const estrategiasLimpias = usaReferenciaEstrategias
    ? estrategiasSinFormato
    : asegurarMomento1Primero(estrategiasSinFormato, {
      habilidades: aprendizajes,
      tema: resultado?.nombre
    });
  const estrategias = textoAdecuacionVisible && !estrategiasLimpias.some((item: string) => normalizarParaBusqueda(item).includes("adecuacion significativa"))
    ? (estructuraReferencia.length
        ? [...estrategiasLimpias, textoAdecuacionVisible]
        : asegurarMomento1Primero([...estrategiasLimpias, textoAdecuacionVisible], {
            habilidades: aprendizajes,
            tema: resultado?.nombre
          }))
    : estrategiasLimpias;
  const indicadores = splitLines(resultado?.indicadoresEvaluacion).length
    ? splitLines(resultado?.indicadoresEvaluacion)
      .map((item) => String(item || "").trim().replace(/^[\-\*\u2022]\s*/, ""))
      .filter(Boolean)
    : indicadoresFallback
      .map((item) => String(item || "").trim().replace(/^[\-\*\u2022]\s*/, ""))
      .filter(Boolean);
  const cotidiano = splitLines(resultado?.trabajoCotidiano);
  const tareas = splitLines(resultado?.tareas);
  const evaluacion = splitLines(resultado?.evaluacionSugerida);
  const recursos = splitLines(resultado?.recursos);
  const competenciasGenerales = splitLines(resultado?.competenciasGenerales);

  const semanas = Array.isArray(resultado?.semanas) ? resultado.semanas : [];

  const estrategiasFromWeeks = semanas.flatMap((semana: any) => {
    const mediacion = Array.isArray(semana?.mediacionPedagogica) ? semana.mediacionPedagogica : [];
    return mediacion.map((item: any) => `Semana ${semana?.semana || ""}: ${item}`);
  });

  const indicadoresFromWeeks = semanas.flatMap((semana: any) => Array.isArray(semana?.indicadores) ? semana.indicadores : []);

  return {
    nombre: String(resultado?.nombre || "Planeamiento didáctico"),
    enfoque: String(resultado?.enfoque || "Resolución de problemas, contextualización y mediación pedagógica basada en habilidades específicas"),
    periodicidad: String(resultado?.periodicidad || ""),
    competenciaGeneral: String(resultado?.competenciaGeneral || ""),
    aprendizajes: aprendizajes.length ? aprendizajes : semanas.map((s: any) => limpiarPrefijoAprendizaje(s?.habilidadBase || s?.proposito || "")).filter(Boolean),
    saberes: saberes.length ? saberes : criterios,
    criterios: criterios.length ? criterios : aprendizajes,
    estrategias: estrategias.length ? estrategias : estrategiasFromWeeks,
    indicadores: indicadores.length ? indicadores : indicadoresFromWeeks.map(limpiarPrefijoIndicador).filter(Boolean),
    competenciasGenerales,
    cotidiano,
    tareas,
    evaluacion,
    recursos,
    observaciones: "",
    reflexiones: resultado?.reflexionesDocentes || {}
  };
}



router.put("/planeamientos/:id/resultado", async (req, res) => {
  const operacionId = normalizeOperacionId(req.body?.operacionId);
  const progresoGuardado = crearProgresoGuardado(req.body);
  actualizarProgresoOperacion(
    operacionId,
    progresoGuardado.porcentaje(0),
    `Validando la actualización${progresoGuardado.sufijo}`
  );
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) {
      marcarErrorProgreso(operacionId, "No se pudo validar la institución");
      return;
    }

    const planeamientoId = toRequiredInt(req.params.id, "planeamientoId", res);
    if (planeamientoId === null) {
      marcarErrorProgreso(operacionId, "El planeamiento indicado no es válido");
      return;
    }

    const resultado = normalizarSeleccionesPlaneamientoResultado(
      hydratePlantillaFormatoDocx(req.body.resultado || {})
    );
    const fechaInicio = normalizeNullableText(req.body.fechaInicio);
    const fechaFin = normalizeNullableText(req.body.fechaFin);
    const observaciones = normalizeNullableText(req.body.observaciones || "");

    actualizarProgresoOperacion(
      operacionId,
      progresoGuardado.porcentaje(0.2),
      `Comprobando permisos y asignación${progresoGuardado.sufijo}`
    );
    const pool = await getPool();
    const lookup = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT TOP 1
          PlaneamientoId,
          InstitucionId,
          AnioLectivoId,
          PeriodoId,
          GrupoId,
          MateriaId,
          TRY_CAST(ResultadoIAJson AS NVARCHAR(MAX)) AS ResultadoIAJson
        FROM dbo.Planeamiento
        WHERE PlaneamientoId = @planeamientoId
          AND Activo = 1
      `);

    if (!lookup.recordset[0]) {
      marcarErrorProgreso(operacionId, "No hay permisos para editar el planeamiento");
      return res.status(403).json({ ok: false, message: "No tenés permisos para editar este planeamiento" });
    }
    const planeamientoRow = lookup.recordset[0];
    if (Number(planeamientoRow.InstitucionId) !== Number(institucionId)) {
      marcarErrorProgreso(operacionId, "No hay permisos para editar el planeamiento");
      return res.status(403).json({ ok: false, message: "No tenés permisos para editar este planeamiento" });
    }

    const anioLectivoId = Number(planeamientoRow.AnioLectivoId);
    const periodoId = Number(planeamientoRow.PeriodoId);
    const grupoId = Number(planeamientoRow.GrupoId);
    const materiaId = Number(planeamientoRow.MateriaId);

    // Una edición puede llegar sin el binario porque la pantalla solo cambió
    // texto. Conservamos la referencia ya guardada antes de validar, para no
    // convertir esa edición legítima en un falso error de machote perdido.
    preservePlantillaFormatoDocx(resultado, parseResultadoPlaneamiento(planeamientoRow.ResultadoIAJson));

    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) {
      marcarErrorProgreso(operacionId, "No se pudo validar la asignación docente");
      return;
    }

    const materiaNombreOficial = await getMateriaNombreOficial(pool, institucionId, materiaId);
    const nombreSolicitado = normalizeText(req.body.nombre || resultado.nombre);
    const nombre = nombreSolicitado || buildPlaneamientoNombre({
      mes: req.body.mes || resultado.mes || resultado.Mes || req.body.mesPlaneamiento,
      grado: req.body.grado || resultado.grado || resultado.Grado || req.body.gradoPlaneamiento,
      materiaNombre: materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || req.body.materiaNombrePlaneamiento
    });

    resultado.nombre = nombre;
    resultado.materiaNombre = materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || "";
    resultado.MateriaNombre = resultado.materiaNombre;
    const validacionGuardado = await revalidarResultadoPlaneamiento(resultado, nombre);
    if (validacionGuardado && !validacionGuardado.puedeGuardar) {
      const detalle = validacionGuardado.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => item.detalle)
        .join(" ");
      marcarErrorProgreso(operacionId, "El planeamiento no superó la validación final");
      return badRequest(res, `Revisá el planeamiento antes de guardarlo. ${detalle}`.trim());
    }
    delete resultado.documentoWordInterno;

    actualizarProgresoOperacion(
      operacionId,
      progresoGuardado.porcentaje(0.45),
      `Actualizando el planeamiento${progresoGuardado.sufijo}`
    );
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      preservePlantillaFormatoDocx(resultado, parseResultadoPlaneamiento(lookup.recordset[0].ResultadoIAJson));

      await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, planeamientoId)
        .input("nombre", sql.NVarChar(200), nombre)
        .input("fechaInicio", sql.Date, fechaInicio)
        .input("fechaFin", sql.Date, fechaFin)
        .input("observaciones", sql.NVarChar(sql.MAX), observaciones)
        .input("resultadoIAJson", sql.NVarChar(sql.MAX), JSON.stringify(resultado || {}))
        .query(`
          UPDATE dbo.Planeamiento
          SET Nombre = @nombre,
              FechaInicio = @fechaInicio,
              FechaFin = @fechaFin,
              Observaciones = @observaciones,
              ResultadoIAJson = @resultadoIAJson,
              UpdatedAt = ${SQL_COSTA_RICA_NOW}
          WHERE PlaneamientoId = @planeamientoId
        `);

      actualizarProgresoOperacion(
        operacionId,
        progresoGuardado.porcentaje(0.7),
        `Actualizando indicadores${progresoGuardado.sufijo}`
      );
      const indicadores = splitLines(resultado.indicadoresEvaluacion)
        .map((indicador) => normalizeText(indicador))
        .filter(Boolean);
      const indicadoresActualesResult = await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, planeamientoId)
        .query(`
          SELECT Descripcion
          FROM dbo.PlaneamientoIndicador
          WHERE PlaneamientoId = @planeamientoId AND Activo = 1
          ORDER BY PlaneamientoIndicadorId
        `);
      const indicadoresActuales = indicadoresActualesResult.recordset.map((item: any) => item.Descripcion);
      const indicadoresCambiaron = !indicadoresPlaneamientoSonIguales(indicadoresActuales, indicadores);

      if (indicadoresCambiaron) {
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, planeamientoId)
          .query(`
            UPDATE dbo.PlaneamientoIndicador
            SET Activo = 0, UpdatedAt = ${SQL_COSTA_RICA_NOW}
            WHERE PlaneamientoId = @planeamientoId
          `);
      }

      if (indicadoresCambiaron && indicadores.length) {
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, planeamientoId)
          .input("indicadoresJson", sql.NVarChar(sql.MAX), JSON.stringify(indicadores))
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            SELECT
              @planeamientoId,
              j.Descripcion,
              NULL,
              1,
              ${SQL_COSTA_RICA_NOW}
            FROM OPENJSON(@indicadoresJson)
            WITH (Descripcion NVARCHAR(MAX) '$') j
            WHERE NULLIF(LTRIM(RTRIM(j.Descripcion)), N'') IS NOT NULL
          `);
      }

      actualizarProgresoOperacion(
        operacionId,
        progresoGuardado.porcentaje(0.9),
        `Confirmando cambios${progresoGuardado.sufijo}`
      );
      await transaction.commit();
      const esUltimo = progresoGuardado.indice + 1 >= progresoGuardado.total;
      actualizarProgresoOperacion(
        operacionId,
        esUltimo ? 100 : progresoGuardado.porcentaje(1),
        esUltimo ? "Planeamiento actualizado" : `Sección actualizada${progresoGuardado.sufijo}`,
        esUltimo ? "completado" : "procesando"
      );
      ok(res, { planeamientoId }, "Planeamiento actualizado correctamente");
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error actualizando planeamiento generado con IA:", error);
    marcarErrorProgreso(operacionId, "No se pudo actualizar el planeamiento");
    res.status(500).json({ ok: false, message: "No se pudo actualizar el planeamiento generado" });
  }
});

router.delete("/planeamientos/:id/eliminar-definitivo", async (req, res) => {
  try {
    const planeamientoId = toRequiredInt(req.params.id, "id", res);
    if (planeamientoId === null) return;
    const pool = await getPool();

    const lookup = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT TOP 1 GrupoId, MateriaId, AnioLectivoId, PeriodoId
        FROM dbo.Planeamiento
        WHERE PlaneamientoId = @planeamientoId
      `);

    const row = lookup.recordset[0];
    if (!row) return badRequest(res, "No se encontró el planeamiento indicado");

    const permiso = await ensurePlaneamientoAsignacion(req, res, pool, {
      grupoId: Number(row.GrupoId),
      materiaId: Number(row.MateriaId),
      anioLectivoId: Number(row.AnioLectivoId),
      periodoId: Number(row.PeriodoId)
    });
    if (permiso === false) return;

    const indicadoresIaResult = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT COUNT(1) AS TotalIndicadoresIA
        FROM dbo.Eval360_IndicadorGrupo
        WHERE PlaneamientoId = @planeamientoId
          AND ISNULL(Activo, 1) = 1
      `);

    const totalIndicadoresIA = Number(indicadoresIaResult.recordset?.[0]?.TotalIndicadoresIA || 0);
    if (totalIndicadoresIA > 0) {
      return res.status(409).json({
        ok: false,
        message: "No se puede eliminar este planeamiento porque ya tiene indicadores generados con IA. Primero eliminá los indicadores IA asociados al planeamiento.",
        data: { totalIndicadoresIA }
      });
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).input("planeamientoId", sql.Int, planeamientoId).query(`
        DELETE FROM dbo.PlaneamientoIndicador WHERE PlaneamientoId = @planeamientoId;
        DELETE FROM dbo.Planeamiento WHERE PlaneamientoId = @planeamientoId;
      `);
      await tx.commit();
      ok(res, null, "Planeamiento eliminado correctamente");
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error eliminando planeamiento:", error);
    res.status(500).json({ ok: false, message: "No se pudo eliminar el planeamiento" });
  }
});

router.get("/planeamientos/:id/exportar-word", async (req, res) => {
  try {
    const planeamientoId = toRequiredInt(req.params.id, "id", res);
    if (planeamientoId === null) return;

    const pool = await getPool();
    const result = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT TOP 1
          p.PlaneamientoId,
          p.InstitucionId,
          p.AnioLectivoId,
          p.PeriodoId,
          p.GrupoId,
          p.MateriaId,
          p.UsuarioId,
          p.Nombre,
          p.FechaInicio,
          p.FechaFin,
          p.Observaciones,
          TRY_CAST(p.ResultadoIAJson AS NVARCHAR(MAX)) AS ResultadoIAJson,
          i.Nombre AS InstitucionNombre,
          i.NombreComercial AS InstitucionNombreComercial,
          i.NombreOficialBoleta AS InstitucionNombreOficialBoleta,
          i.RegionalEducativa,
          i.CodigoPresupuestario,
          i.DireccionExacta,
          a.Nombre AS AnioNombre,
          per.Nombre AS PeriodoNombre,
          g.Nombre AS GrupoNombre,
          g.Nivel AS GrupoNivel,
          m.Nombre AS MateriaNombre,
          u.Nombre AS DocenteNombre,
          u.PrimerApellido AS DocentePrimerApellido,
          u.SegundoApellido AS DocenteSegundoApellido,
          u.Cargo AS DocenteCargo
        FROM dbo.Planeamiento p
        INNER JOIN dbo.Institucion i ON i.InstitucionId = p.InstitucionId
        INNER JOIN dbo.AnioLectivo a ON a.AnioLectivoId = p.AnioLectivoId
        INNER JOIN dbo.Periodo per ON per.PeriodoId = p.PeriodoId
        INNER JOIN dbo.Grupo g ON g.GrupoId = p.GrupoId
        INNER JOIN dbo.Materia m ON m.MateriaId = p.MateriaId
        LEFT JOIN dbo.Usuario u ON u.UsuarioId = p.UsuarioId
        WHERE p.PlaneamientoId = @planeamientoId
      `);

    const row = result.recordset[0];
    if (!row) return badRequest(res, "No se encontró el planeamiento indicado");

    const permiso = await ensurePlaneamientoAsignacion(req, res, pool, {
      grupoId: Number(row.GrupoId),
      materiaId: Number(row.MateriaId),
      anioLectivoId: Number(row.AnioLectivoId),
      periodoId: Number(row.PeriodoId)
    });
    if (permiso === false) return;

    const indicadoresResult = await pool.request()
      .input("planeamientoId", sql.Int, planeamientoId)
      .query(`
        SELECT Descripcion
        FROM dbo.PlaneamientoIndicador
        WHERE PlaneamientoId = @planeamientoId
          AND Activo = 1
        ORDER BY PlaneamientoIndicadorId
      `);

    const indicadoresFallback = indicadoresResult.recordset.map((item: any) => String(item.Descripcion || "")).filter(Boolean);
    const resultado = parseResultadoPlaneamiento(row.ResultadoIAJson);
    if (referenciaWordEsObligatoria(resultado) && !tieneMachoteWordPersistido(resultado)) {
      return res.status(409).json({ ok: false, message: mensajeMachoteWordFaltante() });
    }
    const contenido = normalizeResultadoForDoc(resultado, indicadoresFallback);

    const docente = [row.DocenteNombre, row.DocentePrimerApellido, row.DocenteSegundoApellido].filter(Boolean).join(" ") || "Persona docente";
    const direccionRegional = row.RegionalEducativa || "";
    const centroEducativo = row.InstitucionNombreComercial || row.InstitucionNombreOficialBoleta || row.InstitucionNombre || "";
    const anioEscolar = row.AnioNombre || "";
    const cursoLectivo = row.GrupoNivel || row.GrupoNombre || "";
    const periodoTexto = row.PeriodoNombre || "";
    const huellaDocumento = crearHuellaDocumentoWord(resultado, row, contenido);
    const wordInterno = resultado?.documentoWordInterno?.base64
      && resultado.documentoWordInterno?.huella === huellaDocumento
      ? Buffer.from(String(resultado.documentoWordInterno.base64), "base64")
      : null;
    const plantillaBuffer = wordInterno || await renderPlaneamientoEnPlantillaDocx({
      resultado,
      row,
      contenido,
      docente,
      direccionRegional,
      centroEducativo,
      anioEscolar,
      cursoLectivo,
      periodoTexto
    });

    if (plantillaBuffer) {
      if (!wordInterno && resultado?.plantillaFormatoDocx?.base64) {
        const verificacionWord = await validarWordExportadoContraReferencia({
          referencia: Buffer.from(String(resultado.plantillaFormatoDocx.base64), "base64"),
          generado: plantillaBuffer,
          contenido,
          nombreReferencia: resultado.plantillaFormatoDocx.nombre
        });
        if (!verificacionWord.valido) {
          console.error("El Word generado no superó la verificación estructural:", {
            errores: verificacionWord.errores,
            diagnostico: verificacionWord.diagnostico
          });
          return res.status(500).json({
            ok: false,
            message: `No se pudo verificar el Word generado contra la estructura de referencia. ${verificacionWord.errores.join(" ")}`
          });
        }
        if (verificacionWord.advertencias?.length) {
          console.warn("El Word se exporta con observaciones no bloqueantes:", {
            advertencias: verificacionWord.advertencias,
            diagnostico: verificacionWord.diagnostico
          });
        }
      }
      if (!wordInterno) {
        resultado.documentoWordInterno = {
          base64: plantillaBuffer.toString("base64"),
          generadoEn: new Date().toISOString(),
          nombre: `${safeFileName(row.Nombre || contenido.nombre)}.docx`,
          huella: huellaDocumento
        };
        await pool.request()
          .input("planeamientoId", sql.Int, planeamientoId)
          .input("resultadoIAJson", sql.NVarChar(sql.MAX), JSON.stringify(resultado))
          .query(`
            UPDATE dbo.Planeamiento
            SET ResultadoIAJson = @resultadoIAJson,
                UpdatedAt = ${SQL_COSTA_RICA_NOW}
            WHERE PlaneamientoId = @planeamientoId
          `);
      }
      const filename = `${safeFileName(row.Nombre || contenido.nombre)}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(plantillaBuffer);
      return;
    }
    if (referenciaWordEsObligatoria(resultado)) {
      return res.status(500).json({
        ok: false,
        message: "No se pudo aplicar el machote Word al exportar. Se detuvo la exportación para no entregar un formato genérico incorrecto."
      });
    }

    const competenciasBase = [
      "Competencias para la ciudadanía responsable y solidaria",
      "Competencias para la vida: sociales, emocionales y de aprendizaje",
      "Competencias para el empleo digno y el emprendimiento"
    ];
    const competenciaUnica = normalizarParaBusqueda(contenido.competenciaGeneral || "");
    const competenciasSeleccionadas = competenciaUnica
      ? competenciasBase.map((competencia) => normalizarParaBusqueda(competencia).includes(competenciaUnica) || competenciaUnica.includes(normalizarParaBusqueda(competencia)))
      : (
        contenido.competenciasGenerales.length
          ? competenciasBase.map((competencia) => contenido.competenciasGenerales.some((item: string) => normalizarParaBusqueda(item).includes(normalizarParaBusqueda(competencia).slice(0, 24))))
          : competenciasBase.map(() => true)
      );

    const estrategiasChildren = [
      ...textParagraphsEstrategiasMomentos(contenido.estrategias, row.Observaciones || "Sin estrategias registradas", 19)
    ];

    if (contenido.cotidiano.length || contenido.tareas.length || contenido.evaluacion.length || contenido.recursos.length) {
      estrategiasChildren.push(simpleParagraph("Seguimiento sugerido", { bold: true, size: 19 }));
      if (contenido.cotidiano.length) estrategiasChildren.push(simpleParagraph("Trabajo cotidiano", { bold: true, size: 19 }), ...textParagraphs(contenido.cotidiano, "", { bulletPrefix: "- ", size: 19 }));
      if (contenido.tareas.length) estrategiasChildren.push(simpleParagraph("Tareas", { bold: true, size: 19 }), ...textParagraphs(contenido.tareas, "", { bulletPrefix: "- ", size: 19 }));
      if (contenido.evaluacion.length) estrategiasChildren.push(simpleParagraph("Evaluación sugerida", { bold: true, size: 19 }), ...textParagraphs(contenido.evaluacion, "", { bulletPrefix: "- ", size: 19 }));
      if (contenido.recursos.length) estrategiasChildren.push(simpleParagraph("Recursos", { bold: true, size: 19 }), ...textParagraphs(contenido.recursos, "", { bulletPrefix: "- ", size: 19 }));
    }

    const children: any[] = [
      simpleParagraph("PLANTILLA DE PLANEAMIENTO DIDÁCTICO MATEMÁTICAS TERCER CICLO Y EDUCACIÓN DIVERSIFICADA", {
        align: AlignmentType.CENTER,
        bold: true,
        size: 24
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [5285, 2849, 5847],
        rows: [
          new TableRow({
            children: [
              templateCell([fieldParagraph("Dirección Regional de Educación: ", direccionRegional)], { width: 5285 }),
              templateCell([fieldParagraph("Centro educativo: ", centroEducativo)], { width: 8696, columnSpan: 2 })
            ]
          }),
          new TableRow({
            children: [
              templateCell([fieldParagraph("Nombre de la persona docente: ", docente)], { width: 5285 }),
              templateCell([fieldParagraph("Asignatura, módulo, disciplina, especialidad, componente, área o subárea: ", row.MateriaNombre || "")], { width: 8696, columnSpan: 2 })
            ]
          }),
          new TableRow({
            children: [
              templateCell([fieldParagraph("Año escolar: ", anioEscolar)], { width: 5285 }),
              templateCell([fieldParagraph("Curso lectivo: ", cursoLectivo)], { width: 2849 }),
              templateCell([fieldParagraph("Periodicidad: ", periodicidadConMarca(periodoTexto, contenido.periodicidad))], { width: 5847 })
            ]
          })
        ]
      }),
      simpleParagraph("Competencias generales:", { bold: true, size: 20 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [4341, 4229, 5442],
        rows: [
          new TableRow({
            children: competenciasBase.map((competencia, index) => templateCell([
              simpleParagraph(`${competencia} (${competenciasSeleccionadas[index] ? "X" : " "})`, { size: 19 })
            ], { width: [4341, 4229, 5442][index] }))
          })
        ]
      }),
      new Paragraph({ spacing: { after: 120 } }),
      new Table({
        width: { size: 14034, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [2830, 8222, 2982],
        rows: [
          new TableRow({
            children: [
              templateHeaderCell("Aprendizajes esperados", 2830),
              templateHeaderCell("Estrategias de mediación", 8222),
              templateHeaderCell("Indicadores de evaluación", 2982)
            ]
          }),
          new TableRow({
            children: [
              templateCell(textParagraphs(contenido.aprendizajes, "Sin aprendizajes registrados", { numbered: true, size: 19 }), { width: 2830 }),
              templateCell(estrategiasChildren, { width: 8222 }),
              templateCell(
                contenido.indicadores.length
                  ? contenido.indicadores.map((item: string) => simpleParagraph(item, { size: 19 }))
                  : [simpleParagraph("Sin indicadores registrados", { size: 19 })],
                { width: 2982 }
              )
            ]
          }),
          new TableRow({
            children: [
              mergedTemplateCell("Reflexiones docentes", 3)
            ]
          }),
          new TableRow({
            children: [
              templateCell([
                simpleParagraph("¿Qué funcionó?", { bold: true, size: 19 }),
                simpleParagraph(String(contenido.reflexiones?.queFunciono || ""), { size: 19 })
              ], { width: 2830 }),
              templateCell([
                simpleParagraph("¿Qué no funcionó?", { bold: true, size: 19 }),
                simpleParagraph(String(contenido.reflexiones?.queNoFunciono || ""), { size: 19 })
              ], { width: 8222 }),
              templateCell([
                simpleParagraph("¿Qué puedo mejorar?", { bold: true, size: 19 }),
                simpleParagraph(String(contenido.reflexiones?.quePuedoMejorar || ""), { size: 19 })
              ], { width: 2982 })
            ]
          }),
          new TableRow({
            children: [
              templateCell([
                fieldParagraph("Observaciones: ", contenido.observaciones || row.Observaciones || "", { size: 19 })
              ], { width: 14034, columnSpan: 3 })
            ]
          })
        ]
      })
    ];

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
              width: 15840,
              height: 12240
            },
            margin: { top: 1701, right: 1417, bottom: 1701, left: 1417 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${safeFileName(row.Nombre || contenido.nombre)}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Error exportando planeamiento a Word:", error);
    res.status(500).json({ ok: false, message: "No se pudo generar la plantilla Word del planeamiento" });
  }
});

export default router;
