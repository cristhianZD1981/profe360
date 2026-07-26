import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import JSZip from "jszip";
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
};

const progresoOperaciones = new Map<string, ProgresoOperacion>();
const PROGRESO_OPERACION_TTL_MS = 30 * 60 * 1000;
const SQL_COSTA_RICA_NOW = "CONVERT(datetime2(3), SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central America Standard Time')";

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
    actualizadoEn: Date.now()
  });
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

type TemplateContentRole = "aprendizajes" | "criterios" | "estrategias" | "indicadores";

type ColumnaReferencia = {
  indice: number;
  encabezado: string;
  rol: TemplateContentRole | null;
};

type CampoVariableReferencia = {
  etiqueta: string;
  valorAnterior: string;
};

type PerfilDocumentoReferencia = {
  esDocx: boolean;
  columnas: ColumnaReferencia[];
  camposVariables: CampoVariableReferencia[];
  estrategiasTexto: string;
  encabezadosEstrategias: string[];
  valoresContenidoAnterior: string[];
  cantidadSeccionesContenido: number;
  descripcion: string;
};

type AuditoriaSemanticaPlaneamiento = {
  disponible: boolean;
  cumple: boolean;
  incumplimientos: string[];
  fortalezas: string[];
};

const plantillaFormatoDocxCache = new Map<string, PlantillaFormatoDocxGuardada>();
let planeamientoHabilidadOwnershipColumnsEnsured = false;

function getAuth(req: any): AuthUser {
  return req.auth || { roles: [] };
}

function hasAnyRole(req: any, roles: string[]) {
  const auth = getAuth(req);
  return auth.roles?.some((role) => roles.includes(role));
}

function canMaintainHabilidades(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"]);
}

function canMaintainAnyHabilidad(req: any) {
  return hasAnyRole(req, ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"]);
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
Sos un asistente pedagógico experto en planeamiento didáctico del MEP de Costa Rica para todas las materias, niveles y modalidades.

Generá un planeamiento profesional, editable y aplicable al aula. Cuando exista un planeamiento de referencia, su lógica y estructura específica tienen prioridad sobre cualquier formato genérico.
Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
- Nombre obligatorio del planeamiento: ${input.nombrePlaneamiento || "Proponer un nombre claro según el mes, grado y materia."}
- Grado: ${input.grado || "No indicado"}
- Mes: ${input.mes || "No indicado"}
- Tema o énfasis: ${input.tema || "No indicado"}
- Cantidad de semanas: ${input.semanas || 4}
- Documento de apoyo opcional: ${input.documentoApoyoNombre || "No adjuntado"}
- Plantilla o formato de salida opcional: ${input.plantillaFormatoNombre || "No adjuntado"}

Indicaciones, consideraciones o premisas del docente:
${input.indicacionesDocente || "No se indicaron premisas adicionales."}

IMPORTANTE SOBRE LAS INDICACIONES DEL DOCENTE:
Las indicaciones del docente tienen prioridad sobre la plantilla general.
Si las indicaciones del docente piden usar un ejemplo específico, una página o un formato tomado del Documento de apoyo, debés aplicarlo explícitamente y de forma mandatoria en la respuesta.
Si el docente solicita adecuación significativa, color, resaltado o cualquier condición especial, debe reflejarse explícitamente en el JSON final.
Si el docente pide pintar o resaltar una sección en azul, devolvé colorResaltado = "azul" en el objeto correspondiente y agregá el marcador [AZUL] al inicio del texto visible.
Si el docente indica página(s), ejercicio(s), capítulo(s) o sección(es) concretas del documento de apoyo, tomalas de forma literal y citá en el contenido generado la referencia exacta (por ejemplo: "página 12, ejercicio 4").
Si no se aportan indicaciones y/o documento de apoyo, generá el planeamiento con los datos disponibles sin bloquear la salida.
No ignorés esta sección.

${instruccionCantidadIndicadores(input.indicacionesDocente || "", input.habilidades)}

Habilidades específicas seleccionadas:
${habilidadesText}

Documento de apoyo aportado por la persona docente:
${input.documentoApoyoTexto || "No se aportó documento de apoyo adicional."}

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
13. Si se adjunta Documento de apoyo y las indicaciones piden usar un ejemplo o copiar literal un ejercicio de una página concreta, debés hacerlo de forma mandatoria.
14. Si faltan Indicaciones y/o Documento de apoyo, construí el planeamiento únicamente con los datos disponibles sin bloquear la generación.
15. En "estrategiasMediacion" no incluyás líneas que inicien con "Enfoque:".
16. En "indicadoresEvaluacion" no iniciés ningún indicador con "Identifica y aplica".
17. El campo "observaciones" debe quedar como string vacío: "".
18. Evitá repetir siempre el mismo escenario (por ejemplo, municipalidad). Variá el actor y el contexto según materia, grado, tema y habilidades.
19. Evitá frases genéricas; describí acciones observables concretas que el estudiantado realizará.
20. Igualá el nivel de desarrollo de la referencia: no resumas un documento amplio en cuatro párrafos breves.

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
      "trabajoCotidiano": ["..."],
      "tareas": ["..."],
      "evaluacionSugerida": { "cotidiano": "...", "tarea": "...", "prueba": "..." },
      "recursos": ["..."]
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

Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
- Nombre obligatorio del planeamiento: ${input.nombrePlaneamiento || "Proponer un nombre claro según el mes, grado y materia."}
- Grado: ${input.grado || "No indicado"}
- Mes: ${input.mes || "No indicado"}
- Tema o énfasis: ${input.tema || "No indicado"}
- Cantidad de semanas: ${input.semanas || 4}
- Documento de apoyo opcional: ${input.documentoApoyoNombre || "No adjuntado"}
- Plantilla o formato de salida opcional: ${input.plantillaFormatoNombre || "No adjuntado"}

Indicaciones, consideraciones o premisas del docente:
${clampPromptText(input.indicacionesDocente || "No se indicaron premisas adicionales.", 4000)}

Prompt de trabajo revisado por la persona docente:
${clampPromptText(input.promptDocente || "No se aportó un prompt adicional.", 12000)}

IMPORTANTE SOBRE LAS INDICACIONES DEL DOCENTE:
Las indicaciones del docente tienen prioridad sobre la plantilla general.
Si las indicaciones del docente piden usar un ejemplo específico, una página o un formato tomado del Documento de apoyo, debés aplicarlo explícitamente en la respuesta.
Si el docente solicita adecuación significativa, color, resaltado o cualquier condición especial, debe reflejarse explícitamente en el JSON final.
Si el docente pide pintar o resaltar una sección en azul, devolvé colorResaltado = "azul" en el objeto correspondiente y agregá el marcador [AZUL] al inicio del texto visible.
Si el docente indica página(s), ejercicio(s), capítulo(s) o sección(es) concretas del documento de apoyo, tomalas de forma literal y citá en el contenido generado la referencia exacta (por ejemplo: "página 12, ejercicio 4").
No ignorés esta sección.

${instruccionCantidadIndicadores(input.indicacionesDocente || "", input.habilidades)}

Habilidades específicas seleccionadas:
${clampPromptText(habilidadesText, 12000)}

Documento de apoyo aportado por la persona docente:
${clampPromptText(input.documentoApoyoTexto || "No se aportó documento de apoyo adicional.", 8000)}

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
- "camposReferencia": objeto cuyas claves son exactamente los rótulos variables del machote y cuyos valores corresponden al planeamiento nuevo.

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
  options: { maxOutputTokens?: number } = {}
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
  if (!isGpt5FamilyModel(model)) {
    body.temperature = 0.35;
  }

  try {
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

function serializarParaPrompt(value: any, maxLength = 30000) {
  const text = JSON.stringify(value, null, 2);
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength)}\n[Contenido recortado por límite técnico]`;
}

function normalizarAuditoriaSemantica(value: any): AuditoriaSemanticaPlaneamiento {
  if (!value || typeof value !== "object" || typeof value.cumple !== "boolean") {
    return {
      disponible: false,
      cumple: false,
      incumplimientos: ["La respuesta de la revisión semántica no tuvo el formato esperado."],
      fortalezas: []
    };
  }

  return {
    disponible: true,
    cumple: value.cumple,
    incumplimientos: splitLines(value.incumplimientos).slice(0, 12),
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
  idiomaSalida: "es" | "en";
  estrategiasReferencia: string;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
}): Promise<AuditoriaSemanticaPlaneamiento> {
  const prompt = `
Actuá como revisor independiente de un planeamiento didáctico. No generés ni reescribás el documento.
Compará el RESULTADO contra los DATOS ACTUALES, las INDICACIONES MANDATORIAS y el PERFIL DINÁMICO extraído del planeamiento de referencia.

La referencia puede pertenecer a cualquier materia y usar cualquier estructura. No impongás momentos, fases, metodologías ni encabezados que no estén en su perfil.

Marcá "cumple": false ante cualquiera de estas situaciones:
- No cumple una indicación expresa del docente.
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

  const response = await callOpenAiIfConfigured(prompt, [], { maxOutputTokens: 1400 });
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
  idiomaSalida: "es" | "en";
  nombrePlaneamiento: string;
  estrategiasReferencia: string;
  perfilEstrategiasReferencia?: PerfilEstrategiasReferencia;
  perfilDocumentoReferencia?: PerfilDocumentoReferencia;
  imagenes?: ImagenApoyoIA[];
}) {
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
  const fallasSonSoloDeEstrategias = input.fallas.length > 0 && input.fallas.every((falla) => {
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
    const minimoParrafos = Math.max(encabezadosEsperados.length * 3, Math.ceil(parrafosReferencia * 0.75));
    const minimoCaracteres = Math.max(1200, Math.ceil(caracteresReferencia * 0.6));
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

SECUENCIA EXACTA, INCLUIDAS LAS REPETICIONES:
${secuenciaNumerada || "Conservá la organización narrativa de la referencia."}

FALLAS DETECTADAS:
${input.fallas.map((falla, index) => `${index + 1}. ${falla}`).join("\n")}

DIAGNÓSTICO POR APARICIÓN:
${serializarParaPrompt(diagnosticoEstrategias, 18000)}

ESTRATEGIAS DE REFERENCIA:
${String(input.estrategiasReferencia || "").slice(0, 24000)}

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

    const reparacionEstrategias = await callOpenAiIfConfigured(promptEstrategias, input.imagenes || []);
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

FALLAS QUE DEBÉS CORREGIR:
${input.fallas.map((falla, index) => `${index + 1}. ${falla}`).join("\n")}

DIAGNÓSTICO DE CADA APARICIÓN DE LAS ESTRATEGIAS:
${serializarParaPrompt(diagnosticoEstrategias, 16000)}

PERFIL DINÁMICO DEL DOCUMENTO:
${serializarParaPrompt(perfilDocumentoParaRevision(input.perfilDocumentoReferencia) || {}, 12000)}

PERFIL DE ESTRATEGIAS:
${serializarParaPrompt(input.perfilEstrategiasReferencia || {}, 8000)}

ESTRATEGIAS DE REFERENCIA:
${String(input.estrategiasReferencia || "").slice(0, 22000)}

PLANEAMIENTO A CORREGIR:
${serializarParaPrompt(input.resultado, 36000)}
`.trim();

  return callOpenAiIfConfigured(prompt, input.imagenes || []);
}

async function callOpenAiTextIfConfigured(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const timeoutMs = Number(process.env.OPENAI_PLANEAMIENTO_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45000);
  const model = process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini";
  const body: Record<string, any> = { model, input: prompt };
  if (!isGpt5FamilyModel(model)) body.temperature = 0.35;

  try {
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

    return normalizeText(extraerTextoRespuestaOpenAI(await response.json()));
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
      const texto = redactadosPorIa[j - 1]
        ? referencia
        : j === 1
          ? referencia
          : construirVariacionIndicador(referencia, j - 1);
      salida.push(`${i + 1}.${j} ${texto}`);
    }
  }

  return salida;
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
    // La estructura de una referencia puede repetir rótulos o usar una secuencia
    // propia. No la rearmamos aquí: la IA la genera y la validación comprueba
    // el orden exacto sin introducir una estructura pedagógica ajena.
    resultado.estrategiasMediacion = estrategiasLimpias;
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
  const adecuacion = construirAdecuacionSignificativa({
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

    const [materias, anios, periodos, grupos, filtros] = await Promise.all([
      pool.request()
        .input("institucionId", sql.Int, institucionId)
        .query(`
          SELECT MateriaId, Codigo, Nombre, Descripcion, Activa AS Activo
          FROM dbo.Materia
          WHERE InstitucionId = @institucionId
            AND Activa = 1
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
        .query(`
          SELECT
            (SELECT DISTINCT TipoColegio FROM dbo.PlaneamientoHabilidad WHERE (InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND TipoColegio IS NOT NULL FOR JSON PATH) AS TiposColegioJson,
            (SELECT DISTINCT Grado FROM dbo.PlaneamientoHabilidad WHERE (InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Grado IS NOT NULL FOR JSON PATH) AS GradosJson,
            (SELECT DISTINCT Mes FROM dbo.PlaneamientoHabilidad WHERE (InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Mes IS NOT NULL FOR JSON PATH) AS MesesJson,
            (SELECT DISTINCT Area FROM dbo.PlaneamientoHabilidad WHERE (InstitucionId = @institucionId OR InstitucionId IS NULL) AND Activo = 1 AND Area IS NOT NULL FOR JSON PATH) AS AreasJson
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

router.get("/habilidades", async (req, res) => {
  try {
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

    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("globalPermitido", sql.Bit, canUseGlobalRows(req) ? 1 : 0);

    const filters: string[] = ["(h.InstitucionId = @institucionId OR (@globalPermitido = 1 AND h.InstitucionId IS NULL))"];

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
      request.input("gradoNumero", sql.Int, gradoNumero);
      request.input("gradoPrefijo", sql.NVarChar(20), gradoPrefijo ? `${gradoPrefijo}%` : null);
      filters.push(`
        (
          UPPER(LTRIM(RTRIM(ISNULL(h.Grado, N'')))) COLLATE Latin1_General_100_CI_AI = UPPER(LTRIM(RTRIM(@grado))) COLLATE Latin1_General_100_CI_AI
          OR (
            @gradoNumero IS NOT NULL
            AND (
              LTRIM(RTRIM(ISNULL(h.Grado, N''))) LIKE CAST(@gradoNumero AS NVARCHAR(10)) + N'%'
              OR (
                @gradoPrefijo IS NOT NULL
                AND UPPER(LTRIM(RTRIM(ISNULL(h.Grado, N'')))) COLLATE Latin1_General_100_CI_AI LIKE @gradoPrefijo COLLATE Latin1_General_100_CI_AI
              )
            )
          )
        )
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
        h.Activo,
        h.CreatedAt,
        h.UpdatedAt
      FROM dbo.PlaneamientoHabilidad h
      LEFT JOIN dbo.Materia m ON m.MateriaId = h.MateriaId
      ${materiaId ? "CROSS JOIN (SELECT TOP 1 Nombre FROM dbo.Materia WHERE MateriaId = @materiaId) mref" : ""}
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(m.Nombre, h.MateriaNombre), h.Grado, ${monthOrderExpression("h")}, h.Area, TRY_CONVERT(INT, h.NumeroHabilidad), h.NumeroHabilidad
      OPTION (RECOMPILE)
    `);

    const habilidadesUnicas = Array.from(new Map(
      result.recordset.map((item: any) => [Number(item.PlaneamientoHabilidadId), item])
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
    const tipoColegio = normalizeText(req.body.tipoColegio);
    const ciclo = normalizeNullableText(req.body.ciclo);
    const grado = normalizeText(req.body.grado);
    const mes = normalizeText(req.body.mes);
    const area = normalizeNullableText(req.body.area);
    const numeroHabilidad = normalizeNullableText(req.body.numeroHabilidad);
    const descripcionHabilidad = normalizeText(req.body.descripcionHabilidad);
    const documentoReferencia = normalizeNullableText(req.body.documentoReferencia);

    if (!materiaId && !materiaNombre) return badRequest(res, "Debés indicar la materia");
    if (!tipoColegio) return badRequest(res, "Debés indicar el tipo de colegio");
    if (!grado) return badRequest(res, "Debés indicar el grado");
    if (!mes) return badRequest(res, "Debés indicar el mes");
    if (!descripcionHabilidad) return badRequest(res, "Debés indicar la descripción de la habilidad");

    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
    const usuarioId = getUserId(req);
    const result = await pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("usuarioId", sql.Int, usuarioId || null)
      .input("materiaId", sql.Int, materiaId)
      .input("materiaNombre", sql.NVarChar(200), materiaNombre || null)
      .input("tipoColegio", sql.NVarChar(100), tipoColegio)
      .input("ciclo", sql.NVarChar(100), ciclo)
      .input("grado", sql.NVarChar(100), grado)
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
            (InstitucionId, UsuarioCreadorId, MateriaId, MateriaNombre, TipoColegio, Ciclo, Grado, Mes, Area, NumeroHabilidad, DescripcionHabilidad, DocumentoReferencia, Activo, CreatedAt)
          OUTPUT INSERTED.*, CAST(0 AS bit) AS Duplicado
          VALUES
            (@institucionId, @usuarioId, @materiaId, @materiaNombre, @tipoColegio, @ciclo, @grado, @mes, @area, @numeroHabilidad, @descripcionHabilidad, @documentoReferencia, 1, SYSDATETIME())
        END
      `);

    if (result.recordset[0]?.Duplicado) return badRequest(res, "Ya existe una habilidad igual para esa materia, grado, mes y área");
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
    const tipoColegio = normalizeText(req.body.tipoColegio);
    const ciclo = normalizeNullableText(req.body.ciclo);
    const grado = normalizeText(req.body.grado);
    const mes = normalizeText(req.body.mes);
    const area = normalizeNullableText(req.body.area);
    const numeroHabilidad = normalizeNullableText(req.body.numeroHabilidad);
    const descripcionHabilidad = normalizeText(req.body.descripcionHabilidad);
    const documentoReferencia = normalizeNullableText(req.body.documentoReferencia);

    if (!materiaId && !materiaNombre) return badRequest(res, "Debés indicar la materia");
    if (!tipoColegio) return badRequest(res, "Debés indicar el tipo de colegio");
    if (!grado) return badRequest(res, "Debés indicar el grado");
    if (!mes) return badRequest(res, "Debés indicar el mes");
    if (!descripcionHabilidad) return badRequest(res, "Debés indicar la descripción de la habilidad");

    const pool = await getPool();
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
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
            AND InstitucionId = @institucionId
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
            Mes = @mes,
            Area = @area,
            NumeroHabilidad = @numeroHabilidad,
            DescripcionHabilidad = @descripcionHabilidad,
            DocumentoReferencia = @documentoReferencia,
            UpdatedAt = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE PlaneamientoHabilidadId = @id
          AND InstitucionId = @institucionId
          AND (@esAdmin = 1 OR UsuarioCreadorId = @usuarioId)
      `);

    if (result.recordset[0]?.Duplicado) return badRequest(res, "Ya existe una habilidad igual para esa materia, grado, mes y área");
    if (!result.recordset.length) {
      return forbidden(res, "Solo podés modificar habilidades creadas por vos. Para otras, usá un perfil administrativo.");
    }
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
          AND InstitucionId = @institucionId
          AND (@esAdmin = 1 OR UsuarioCreadorId = @usuarioId)
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
          AND InstitucionId = @institucionId
          AND (@esAdmin = 1 OR UsuarioCreadorId = @usuarioId)
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
        Colegio: "Academico",
        Ciclo: "Tercer ciclo",
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
        Descripcion: "Tipo de colegio. Ejemplo: Academico, Tecnico."
      },
      {
        Columna: "Ciclo",
        Requerido: "NO",
        Descripcion: "Texto libre. Ejemplo: Tercer ciclo."
      },
      {
        Columna: "Grado",
        Requerido: "SI",
        Descripcion: "Grado. Ejemplo: 7, Octavo, Duodecimo."
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
        const tipoColegio = limitRequiredText(row.Colegio, 100);
        const ciclo = limitNullableText(row.Ciclo, 100);
        const grado = limitRequiredText(row.Grado, 100);
        const mes = limitRequiredText(row.mes || row.Mes, 100);
        const area = limitNullableText(row.Area, 150);
        const numeroHabilidad = limitNullableText(row["Numero de Habilidad"] || row.NumeroHabilidad, 50);
        const descripcionHabilidad = limitRequiredText(row["Descripcion de la Habilidad"] || row.DescripcionHabilidad, 4000);
        const documentoReferencia = limitNullableText(row["Documento de referencia"] || row.DocumentoReferencia, 300);

        if (!materiaNombre || !tipoColegio || !grado || !mes || !descripcionHabilidad) {
          omitidos += 1;
          resultados.push({
            fila,
            estado: "Omitido",
            motivo: "Faltan campos obligatorios"
          });
          continue;
        }

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
          .input("mes", sql.NVarChar(100), mes)
          .input("area", sql.NVarChar(150), area)
          .input("numeroHabilidad", sql.NVarChar(50), numeroHabilidad)
          .input("descripcionHabilidad", sql.NVarChar(4000), descripcionHabilidad)
          .input("documentoReferencia", sql.NVarChar(300), documentoReferencia)
          .query(`
            INSERT INTO dbo.PlaneamientoHabilidad
              (InstitucionId, UsuarioCreadorId, MateriaId, MateriaNombre, TipoColegio, Ciclo, Grado, Mes, Area, NumeroHabilidad, DescripcionHabilidad, DocumentoReferencia, Activo, CreatedAt)
            OUTPUT INSERTED.PlaneamientoHabilidadId
            VALUES
              (@institucionId, @usuarioId, @materiaId, @materiaNombre, @tipoColegio, @ciclo, @grado, @mes, @area, @numeroHabilidad, @descripcionHabilidad, @documentoReferencia, 1, SYSDATETIME())
          `);

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

function cachePlantillaFormatoDocx(file?: Express.Multer.File) {
  if (!isDocxFile(file)) return null;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const data: PlantillaFormatoDocxGuardada = {
    nombre: file?.originalname || "plantilla_formato.docx",
    mimeType: file?.mimetype || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    base64: file?.buffer.toString("base64") || ""
  };

  plantillaFormatoDocxCache.set(id, data);
  return {
    cacheId: id,
    nombre: data.nombre,
    mimeType: data.mimeType
  };
}

function hydratePlantillaFormatoDocx(resultado: any) {
  if (!resultado || typeof resultado !== "object") return resultado;
  if (resultado.plantillaFormatoDocx?.base64) return resultado;

  const cacheId = normalizeText(resultado.plantillaFormatoCacheId);
  if (!cacheId) return resultado;

  const cached = plantillaFormatoDocxCache.get(cacheId);
  if (!cached?.base64) return resultado;

  resultado.plantillaFormatoDocx = {
    nombre: cached.nombre,
    mimeType: cached.mimeType,
    base64: cached.base64
  };
  resultado.plantillaFormatoNombre = resultado.plantillaFormatoNombre || cached.nombre;
  resultado.plantillaFormatoCacheId = cacheId;
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

async function extractUploadedText(file: Express.Multer.File | undefined, input: { defaultName: string; maxChars: number; unsupportedMessage: string }) {
  if (!file?.buffer) return { nombre: null as string | null, texto: "" };

  const nombre = file.originalname || input.defaultName;
  const mime = String(file.mimetype || "").toLowerCase();
  const esTexto = mime.includes("text")
    || mime.includes("json")
    || mime.includes("csv")
    || /\.(txt|csv|json|md)$/i.test(nombre);
  const esDocx = mime.includes("wordprocessingml.document") || /\.docx$/i.test(nombre);

  try {
    if (esTexto) {
      const texto = file.buffer.toString("utf8").replace(/\u0000/g, " ").slice(0, input.maxChars);
      return { nombre, texto };
    }

    if (esDocx) {
      const texto = await extractDocxText(file, input.maxChars);
      if (texto) return { nombre, texto };
    }
  } catch (error) {
    console.warn(`No se pudo extraer texto del archivo ${nombre}:`, error);
  }

  return {
    nombre,
    texto: input.unsupportedMessage.replace(/\{nombre\}/g, nombre)
  };
}

function extractDocumentoApoyoText(file?: Express.Multer.File) {
  if (isImageFile(file)) {
    return Promise.resolve({
      nombre: file?.originalname || "imagen_apoyo",
      texto: `Imagen adjunta: ${file?.originalname || "imagen_apoyo"}. Debe analizarse como material de referencia obligatorio cuando las indicaciones del docente lo requieran.`
    });
  }

  return extractUploadedText(file, {
    defaultName: "documento_apoyo",
    maxChars: 12000,
    unsupportedMessage: "Se adjuntó el archivo {nombre}. Si el documento contiene lineamientos específicos, la persona docente debe revisar la propuesta generada y ajustar según ese material."
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

function instruccionesObligatoriasPlaneamiento(input: { idiomaSalida?: "es" | "en"; usaMachote?: boolean; cantidadImagenes?: number }) {
  const idioma = input.idiomaSalida === "en" ? "English" : "Spanish";
  const machote = input.usaMachote
    ? "El machote se utiliza únicamente para conservar diseño, tablas, encabezados y orden. Eliminá y sustituí todos sus datos variables anteriores; no reutilicés nombres, fechas, temas, habilidades, estrategias, indicadores, observaciones ni ejemplos del planeamiento previo."
    : "";
  const imagenes = input.cantidadImagenes
    ? `Hay ${input.cantidadImagenes} imagen(es) adjunta(s). Analizalas como fuente de referencia junto con las instrucciones del docente.`
    : "";

  return `
REGLAS DE CUMPLIMIENTO NO NEGOCIABLES:
- Las indicaciones, consideraciones y premisas escritas por la persona docente son datos e instrucciones obligatorias. No podés omitirlas, suavizarlas, sustituirlas ni contradecirlas.
- Si existe conflicto entre una indicación del docente y una regla genérica o un ejemplo adjunto, prevalece la indicación del docente.
- Idioma obligatorio de toda la salida generada: ${idioma}. Conservá sin traducir solamente los rótulos fijos que ya pertenezcan al diseño del machote.
${machote}
${imagenes}
`.trim();
}

async function extractDocumentosApoyoText(files: Express.Multer.File[]) {
  const documentos = Array.isArray(files) ? files : [];
  if (!documentos.length) return { nombres: [] as string[], texto: "", imagenes: [] as ImagenApoyoIA[] };

  const partes: string[] = [];
  const nombres: string[] = [];
  const imagenes: ImagenApoyoIA[] = [];
  const maxTotal = 16000;
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
    const contenido = await extractDocumentoApoyoText(file);
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

export async function analizarReferenciaDocxSemantica(file?: Express.Multer.File): Promise<PerfilDocumentoReferencia> {
  const vacio: PerfilDocumentoReferencia = {
    esDocx: false,
    columnas: [],
    camposVariables: [],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 0,
    descripcion: "No se adjuntó un DOCX utilizable como referencia."
  };
  if (!file?.buffer || !/\.docx$/i.test(file.originalname || "")) return vacio;

  try {
    const zip = await JSZip.loadAsync(file.buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml) return { ...vacio, esDocx: true, descripcion: "El DOCX no contiene word/document.xml." };

    const columnas: ColumnaReferencia[] = [];
    const camposVariables: CampoVariableReferencia[] = [];
    const estrategiasPartes: string[] = [];
    const encabezadosEstrategias: string[] = [];
    const valoresContenidoAnterior: string[] = [];
    let cantidadSeccionesContenido = 0;

    for (const tableXml of getDirectXmlElements(documentXml, "w:tbl")) {
      const rows = getDirectXmlElements(tableXml, "w:tr");
      let rolesActivos: Array<TemplateContentRole | null> | null = null;

      for (const rowXml of rows) {
        const cells = getDirectXmlElements(rowXml, "w:tc");
        const roles = cells.map(detectTemplateContentRole);
        const rolesReconocidos = roles.filter(Boolean).length;
        const esCabeceraContenido = rolesReconocidos >= 2 && roles.includes("estrategias");
        const rowText = normalizarParaBusqueda(xmlWordToText(rowXml));
        const terminaContenido = rowText.includes("reflexiones docentes")
          || rowText.includes("teacher reflections")
          || rowText.startsWith("observaciones")
          || rowText.startsWith("observations");

        if (esCabeceraContenido) {
          rolesActivos = roles;
          cantidadSeccionesContenido += 1;
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
          cells.forEach((cellXml, indice) => {
            const rol = rolesActivos?.[indice] || null;
            const texto = xmlWordToText(cellXml).trim();
            if (!texto) return;
            valoresContenidoAnterior.push(texto);
            if (rol !== "estrategias") return;

            const parrafos = extraerParrafosCeldaReferencia(cellXml);
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
          });
          continue;
        }

        for (const cellXml of cells) {
          const campo = extraerCampoVariableReferencia(cellXml);
          if (campo) camposVariables.push(campo);
        }
      }
    }

    const columnasUnicas = Array.from(new Map(
      columnas.map((columna) => [`${columna.indice}|${normalizarParaBusqueda(columna.encabezado)}`, columna])
    ).values());
    const camposUnicos = Array.from(new Map(
      camposVariables.map((campo) => [normalizarParaBusqueda(campo.etiqueta), campo])
    ).values());
    const encabezadosSecuencia = encabezadosEstrategias
      .filter((encabezado, index, lista) => (
        index === 0
        || normalizarParaBusqueda(encabezado) !== normalizarParaBusqueda(lista[index - 1])
      ));
    const estrategiasTexto = estrategiasPartes.filter(Boolean).join("\n\n").trim();
    const descripcion = [
      `${cantidadSeccionesContenido} sección(es) principal(es) de contenido.`,
      columnasUnicas.length
        ? `Columnas detectadas: ${columnasUnicas.map((columna) => columna.encabezado).join(" | ")}.`
        : "No se detectaron columnas semánticas.",
      encabezadosSecuencia.length
        ? `Secuencia pedagógica detectada por formato: ${encabezadosSecuencia.join(" → ")}.`
        : "La referencia organiza las estrategias de forma narrativa, sin encabezados tipográficos inequívocos."
    ].join(" ");

    return {
      esDocx: true,
      columnas: columnasUnicas,
      camposVariables: camposUnicos,
      estrategiasTexto,
      encabezadosEstrategias: encabezadosSecuencia,
      valoresContenidoAnterior,
      cantidadSeccionesContenido,
      descripcion
    };
  } catch (error) {
    console.warn("No se pudo analizar semánticamente el DOCX de referencia:", error);
    return { ...vacio, esDocx: true, descripcion: "No se pudo analizar semánticamente el DOCX." };
  }
}

function buildPlaneamientoNombre(input: { mes?: any; grado?: any; materiaNombre?: any }) {
  const mes = normalizeText(input.mes) || "Mes";
  const grado = normalizeText(input.grado) || "Grado";
  const materia = normalizeText(input.materiaNombre) || "Materia";
  return `${mes} - ${grado} - ${materia}`;
}

export function extraerEstrategiasMediacionReferencia(...fuentes: Array<string | null | undefined>) {
  const texto = fuentes.filter(Boolean).join("\n\n").replace(/\r/g, "");
  const inicioSeccion = texto.search(/^\s*estrategias?\s+(?:de\s+)?mediaci[oó]n(?:\s*\([^)]*\))?\s*$/im);
  if (inicioSeccion >= 0) return texto.slice(inicioSeccion, inicioSeccion + 30000).trim();

  const marcadorEstructura = /^\s*(?:\d+\s*)?(?:tema\s+n?[.°º]?\s*\d+|actividades?\s+de\s+(?:inicio|desarrollo|cierre)|focalizaci[oó]n|exploraci[oó]n|contrastaci[oó]n|aplicaci[oó]n|problematizaci[oó]n|desarrollo|cierre|inicio|mediation\s+phase|introduction|exploration|application)\s*\.?\s*$/im;
  const inicioEstructura = texto.search(marcadorEstructura);
  if (inicioEstructura >= 0) return texto.slice(inicioEstructura, inicioEstructura + 30000).trim();

  const inicio = texto.search(/estrategias?\s+(?:de\s+)?mediaci[oó]n|mediation\s+strateg(?:y|ies)/i);
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
    /^(avances?\s+en\s+monograf[ií]a(?:\s+y\s+lectura\s+diaria)?|monograf[ií]a|lectura\s+diaria)\s*\.?\s*$/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
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
    const anterior = encabezados.length ? normalizarParaBusqueda(encabezados[encabezados.length - 1]) : "";
    if (key && key !== anterior) {
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
  const minimoParrafos = Math.max(perfil.encabezados.length * 3, Math.ceil(perfil.cantidadParrafos * 0.75));
  const minimoCaracteres = Math.max(1200, Math.ceil(perfil.cantidadCaracteres * 0.6));
  return `
REGLA DINÁMICA Y PRIORITARIA PARA ESTRATEGIAS DE MEDIACIÓN:
- El planeamiento adjunto es la autoridad para la lógica, jerarquía, secuencia, cantidad aproximada de bloques y nivel de detalle.
- Perfil detectado: ${perfil.descripcion}
- Encabezados y orden que deben conservarse: ${perfil.encabezados.join(" → ") || "los observados en el documento adjunto"}.
- No uses "Momento 1", "Momento 2", "Momento 3", "Momento 4" ni otra secuencia predeterminada, salvo que esos rótulos aparezcan realmente en la referencia.
- No copies temas, autores, obras, ejemplos, preguntas ni actividades anteriores. Conservá el patrón pedagógico y redactá contenido completamente nuevo con las habilidades, materia, grado, meses e indicaciones actuales.
- Si la referencia usa actividades numeradas, generá actividades numeradas con una densidad y profundidad semejantes, ajustadas al alcance solicitado.
- Cada actividad nueva debe conservar la lógica observable de la referencia: propósito, acción docente, acción del estudiantado, recurso o dinámica, evidencia/producto y forma de retroalimentación cuando corresponda.
- No resumás una referencia amplia. Desarrollá al menos ${minimoParrafos} párrafos útiles y aproximadamente ${minimoCaracteres} caracteres en Estrategias de mediación, distribuidos entre todos sus bloques.
`.trim();
}

function instruccionPerfilDocumentoReferencia(perfil?: PerfilDocumentoReferencia) {
  if (!perfil?.esDocx) {
    return "No existe un perfil semántico DOCX; conservá la estructura observable del archivo de referencia aportado.";
  }

  const campos = perfil.camposVariables
    .filter((campo) => !esCampoMetadataFijo(campo.etiqueta))
    .map((campo) => campo.etiqueta);
  return `
PERFIL SEMÁNTICO OBLIGATORIO DEL DOCUMENTO DE REFERENCIA:
- ${perfil.descripcion}
- Roles de columnas: ${perfil.columnas.map((columna) => `${columna.encabezado} = ${columna.rol || "columna adicional"}`).join(" | ") || "No detectados"}.
- Campos variables que deben sustituirse: ${campos.join(" | ") || "No se detectaron campos rotulados adicionales"}.
- La estructura nace de este documento específico. No apliqués fases, momentos, apartados ni secuencias predeterminadas de otra materia.
- "Criterios de Evaluación" y "Indicadores" son columnas distintas. Nunca coloqués los indicadores numerados dentro de Criterios.
- En "camposReferencia" devolvé una propiedad para cada campo variable detectado, usando exactamente su rótulo y un valor nuevo coherente con los datos actuales.
- Todo dato sustantivo anterior del machote debe desaparecer, salvo que también forme parte explícita de las habilidades, tema o indicaciones actuales.
`.trim();
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
    "educational center",
    "nombre de la persona docente",
    "nombre del docente",
    "nombre y apellidos del o la docente",
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
    "nivel educativo",
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
      estado: fasesVacias.length ? "error" : "ok",
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
    const referenciaUsaMomentos = perfilEstrategias.encabezados.some((encabezado) =>
      /^momento\s+\d+/i.test(encabezado)
    );
    const resultadoUsaMomentos = /\bmomento\s+[1-4]\s*:/i.test(estrategiasTexto);
    const actividadesGeneradas = new Set(
      Array.from(estrategiasTexto.matchAll(/\bactividad\s+n?[.°º]?\s*(\d+)\b/gi))
        .map((match) => Number(match[1]))
        .filter((numero) => Number.isInteger(numero) && numero > 0)
    ).size;
    const minimoActividades = perfilEstrategias.usaActividadesNumeradas
      ? Math.max(1, Math.ceil(perfilEstrategias.cantidadActividadesNumeradas * 0.6))
      : 0;
    const incumpleMomentos = !referenciaUsaMomentos && resultadoUsaMomentos;
    const incumpleActividades = minimoActividades > 0 && actividadesGeneradas < minimoActividades;
    const validacionOrden = validarOrdenEncabezadosEstrategias(
      estrategiasTexto,
      perfilEstrategias.encabezados
    );
    const minimoCaracteres = perfilEstrategias.cantidadCaracteres
      ? Math.max(400, Math.floor(perfilEstrategias.cantidadCaracteres * 0.5))
      : 0;
    const parrafosGenerados = splitLines(resultado?.estrategiasMediacion).length;
    const minimoParrafos = perfilEstrategias.cantidadParrafos
      ? Math.max(
          perfilEstrategias.encabezados.length * 3,
          Math.ceil(perfilEstrategias.cantidadParrafos * 0.7)
        )
      : 0;
    const incumpleCaracteres = minimoCaracteres > 0 && estrategiasTexto.length < minimoCaracteres;
    const incumpleParrafos = minimoParrafos > 0 && parrafosGenerados < minimoParrafos;
    const incumpleProfundidad = incumpleCaracteres || incumpleParrafos;
    verificaciones.push({
      codigo: "fidelidad_referencia",
      etiqueta: "Fidelidad al planeamiento de referencia",
      estado: incumpleMomentos || incumpleActividades || !validacionOrden.cumple || incumpleProfundidad ? "error" : "ok",
      detalle: incumpleMomentos
        ? "La referencia no usa Momentos 1–4, pero esa estructura apareció en el resultado."
        : incumpleActividades
          ? `La referencia desarrolla ${perfilEstrategias.cantidadActividadesNumeradas} actividades numeradas; el resultado debe incluir al menos ${minimoActividades} con profundidad semejante.`
          : !validacionOrden.cumple
            ? `No se respetó la secuencia de la referencia. Faltantes: ${validacionOrden.faltantes.join(", ") || "ninguno"}. Fuera de orden: ${validacionOrden.fueraDeOrden.join(", ") || "ninguno"}.`
            : incumpleProfundidad
              ? `Las estrategias tienen ${parrafosGenerados} párrafos y ${estrategiasTexto.length} caracteres; deben alcanzar al menos ${minimoParrafos} párrafos y ${minimoCaracteres} caracteres para conservar la profundidad de la referencia.`
              : `Se respetó el patrón dinámico de la referencia (${perfilEstrategias.nivelDetalle}, ${actividadesGeneradas || "sin"} actividades numeradas).`
    });
  }

  if (perfilDocumento?.esDocx) {
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
      estado: faltantes.length ? "error" : "ok",
      detalle: faltantes.length
        ? `Faltan valores nuevos para: ${faltantes.map((campo) => campo.etiqueta).join(", ")}.`
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
      estado: proporcion >= 0.4 || input.auditoriaSemantica?.cumple ? "ok" : "error",
      detalle: proporcion >= 0.4 || input.auditoriaSemantica?.cumple
        ? "Las indicaciones obligatorias tienen evidencia en el resultado."
        : "No existe evidencia suficiente de que se cumplieron las indicaciones obligatorias del docente."
    });
  }

  if (input.referenciaObligatoria || input.auditoriaSemantica) {
    const auditoria = input.auditoriaSemantica;
    verificaciones.push({
      codigo: "auditoria_semantica",
      etiqueta: "Revisión semántica final",
      estado: auditoria?.disponible && auditoria.cumple ? "ok" : "error",
      detalle: auditoria?.disponible
        ? (
          auditoria.cumple
            ? "La revisión independiente confirmó referencia, coherencia e indicaciones."
            : `Incumplimientos: ${auditoria.incumplimientos.join(" | ") || "la revisión semántica rechazó el resultado"}`
        )
        : "No fue posible completar la revisión independiente; el planeamiento no puede guardarse todavía."
    });
  }

  const errores = verificaciones.filter((item) => item.estado === "error");
  const alertas = verificaciones.filter((item) => item.estado === "alerta");
  const puntuacion = Math.max(0, 100 - (errores.length * 30) - (alertas.length * 10));

  return {
    valido: errores.length === 0,
    puedeGuardar: errores.length === 0,
    puntuacion,
    verificaciones,
    estrategiasEstructuradas
  };
}

function revalidarResultadoPlaneamiento(resultado: any, nombreActual: string) {
  const controlAnterior = resultado?.controlCalidad;
  if (!controlAnterior || typeof controlAnterior !== "object") return null;

  const validacion = validarPlaneamientoGenerado(resultado, {
    nombreSolicitado: nombreActual,
    idiomaEsperado: controlAnterior.idiomaEsperado === "en" ? "en" : "es",
    estructuraEstrategias: Array.isArray(controlAnterior.estructuraEstrategias)
      ? controlAnterior.estructuraEstrategias
      : [],
    indicacionesDocente: normalizeText(controlAnterior.indicacionesDocente),
    indicadoresEsperadosPorHabilidad: Array.isArray(controlAnterior.indicadoresEsperadosPorHabilidad)
      ? controlAnterior.indicadoresEsperadosPorHabilidad
      : undefined,
    perfilEstrategias: controlAnterior.perfilEstrategias || resultado?.perfilEstrategiasReferencia,
    perfilDocumentoReferencia: controlAnterior.perfilDocumentoReferencia || resultado?.perfilDocumentoReferencia,
    auditoriaSemantica: controlAnterior.auditoriaSemantica || undefined,
    referenciaObligatoria: Boolean(controlAnterior.referenciaObligatoria)
  });

  resultado.estrategiasMediacionEstructuradas = validacion.estrategiasEstructuradas;
  resultado.controlCalidad = {
    ...controlAnterior,
    valido: validacion.valido,
    puedeGuardar: validacion.puedeGuardar,
    puntuacion: validacion.puntuacion,
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
Mejorá el siguiente prompt de trabajo para que sea claro, concreto, aplicable al aula y útil para generar un planeamiento de alta calidad.
Conservá exactamente los datos ya indicados: no inventés habilidades, normas, fechas, instituciones, secciones ni contenidos oficiales.
Mantené las indicaciones docentes y el uso solicitado de archivos de ejemplo o machote.
Devolvé solamente el prompt mejorado en texto plano, sin saludo, explicación, markdown ni un planeamiento terminado.

PROMPT ORIGINAL:
${prompt}
`);

    if (!mejorado) {
      marcarErrorProgreso(operacionId, "La IA no devolvió un prompt mejorado");
      return res.status(503).json({ ok: false, message: "No se pudo mejorar el prompt con IA. Podés editarlo manualmente o intentar de nuevo." });
    }

    actualizarProgresoOperacion(operacionId, 90, "Validando el prompt mejorado");
    actualizarProgresoOperacion(operacionId, 100, "Prompt mejorado", "completado");
    return ok(res, { prompt: mejorado }, "Prompt mejorado con IA");
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
    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);
    const promptDocente = normalizeText(req.body.promptDocente);
    const referenciaObligatoria = String(req.body.referenciaObligatoria || "").toLowerCase() === "true";
    const anioLectivoId = toOptionalInt(req.body.anioLectivoId);
    const periodoId = toOptionalInt(req.body.periodoId);
    const grupoId = toOptionalInt(req.body.grupoId);
    const semanas = Math.min(8, Math.max(1, Number(req.body.semanas || 4)));
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
    const habilidades = await pool.request()
      .input("institucionId", sql.Int, institucionId)
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
          AND (h.InstitucionId = @institucionId OR h.InstitucionId IS NULL)
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
    console.log(`[planeamiento-ia] generar-planeamiento: carga de habilidades en ${Date.now() - t0}ms`);

    actualizarProgresoOperacion(operacionId, 24, "Analizando el planeamiento de referencia");
    const effectiveMateria = materiaNombre || habilidades.recordset[0]?.MateriaNombre || "Materia";
    const documentoApoyoFiles = getUploadedFiles(req, "documentoApoyo");
    const documentoApoyo = await extractDocumentosApoyoText(documentoApoyoFiles);
    const plantillaFormatoFile = getUploadedFile(req, "plantillaFormato");
    const referenciaFile = getUploadedFile(req, "archivoReferencia") || plantillaFormatoFile;
    if (referenciaObligatoria && !referenciaFile) {
      marcarErrorProgreso(operacionId, "Falta el planeamiento de referencia");
      return badRequest(res, "Debés adjuntar un planeamiento de referencia antes de generar");
    }

    const referencia = await extractPlantillaFormatoText(referenciaFile);
    const perfilDocumentoReferencia = await analizarReferenciaDocxSemantica(referenciaFile);
    const plantillaFormato = plantillaFormatoFile === referenciaFile
      ? referencia
      : await extractPlantillaFormatoText(plantillaFormatoFile);
    const plantillaFormatoDocx = cachePlantillaFormatoDocx(plantillaFormatoFile);
    const idiomaSalida = detectarIdiomaSalida(referencia.texto, plantillaFormato.texto, documentoApoyo.texto);
    const estrategiasReferencia = perfilDocumentoReferencia.estrategiasTexto
      || extraerEstrategiasMediacionReferencia(referencia.texto, plantillaFormato.texto, documentoApoyo.texto);
    if (referenciaObligatoria && !estrategiasReferencia.trim()) {
      marcarErrorProgreso(operacionId, "No se identificaron las estrategias de mediación");
      return badRequest(res, "No se pudo identificar la sección de Estrategias de mediación en el planeamiento de referencia");
    }
    const perfilEstrategiasReferencia = construirPerfilEstrategiasReferencia(
      estrategiasReferencia,
      perfilDocumentoReferencia.encabezadosEstrategias
    );
    const estructuraEstrategiasReferencia = perfilEstrategiasReferencia.encabezados;
    const usaReferenciaEstrategias = Boolean(estrategiasReferencia.trim());
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
      plantillaFormatoTexto: referencia.texto || plantillaFormato.texto,
      plantillaFormatoNombre: referencia.nombre || plantillaFormato.nombre || undefined,
      plantillaPromptIAId,
      indicacionesDocente,
      promptDocente,
      idiomaSalida,
      usaMachote: !!plantillaFormatoDocx,
      cantidadImagenes: documentoApoyo.imagenes.length,
      nombrePlaneamiento,
      estrategiasReferencia,
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia,
      usuarioId: getUserId(req) || null,
      esAdmin: canMaintainAnyHabilidad(req)
    });
    console.log(`[planeamiento-ia] generar-planeamiento: prompt construido en ${Date.now() - t0}ms`);
    const prompt = promptData.prompt;
    actualizarProgresoOperacion(operacionId, 45, "La IA está generando el planeamiento");
    const aiResult = await callOpenAiIfConfigured(prompt, documentoApoyo.imagenes);
    console.log(`[planeamiento-ia] generar-planeamiento: IA en ${Date.now() - t0}ms`);
    actualizarProgresoOperacion(operacionId, 60, "Procesando la respuesta de la IA");
    const permitirFallback = String(process.env.OPENAI_PLANEAMIENTO_ALLOW_FALLBACK || "").toLowerCase() === "true";
    if (!aiResult && (!permitirFallback || referenciaObligatoria)) {
      marcarErrorProgreso(operacionId, "El modelo de IA no respondió correctamente");
      return res.status(503).json({
        ok: false,
        message: "El modelo de IA no respondió correctamente. No se generó un planeamiento alternativo para evitar presentar contenido que no provenga del modelo."
      });
    }
    const resultadoBaseSinReglas = aiResult || buildFallbackPlaneamiento({
      materiaNombre: effectiveMateria,
      tipoColegio,
      grado,
      mes,
      tema,
      semanas,
      habilidades: habilidades.recordset,
      documentoApoyoTexto: documentoApoyo.texto,
      documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : undefined,
      plantillaFormatoTexto: referencia.texto || plantillaFormato.texto,
      plantillaFormatoNombre: referencia.nombre || plantillaFormato.nombre || undefined,
      indicacionesDocente,
      estrategiasReferencia,
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia,
      perfilDocumentoReferencia
    });

    const nombreResultado = nombrePlaneamiento || buildPlaneamientoNombre({ mes, grado, materiaNombre: effectiveMateria });
    const indicadoresEsperadosPorHabilidad = cantidadesIndicadoresSolicitadas(
      indicacionesDocente,
      habilidades.recordset.length
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
        estructuraEstrategiasReferencia,
        usaReferenciaEstrategias
      });
      preparado.nombre = nombreResultado;
      return preparado;
    };

    let resultadoBase = prepararResultado(resultadoBaseSinReglas);
    const debeAuditar = referenciaObligatoria || Boolean(referenciaFile) || Boolean(indicacionesDocente);
    actualizarProgresoOperacion(operacionId, 66, "Revisando estructura, contenido e indicaciones");
    let auditoriaSemantica = debeAuditar
      ? await auditarPlaneamientoConIa({
          resultado: resultadoBase,
          materiaNombre: effectiveMateria,
          grado,
          mes,
          tema,
          habilidades: habilidades.recordset,
          indicacionesDocente,
          idiomaSalida,
          estrategiasReferencia,
          perfilEstrategiasReferencia,
          perfilDocumentoReferencia
        })
      : undefined;
    console.log(`[planeamiento-ia] generar-planeamiento: auditoría inicial en ${Date.now() - t0}ms`);
    actualizarProgresoOperacion(operacionId, 70, "Evaluando la calidad del planeamiento");

    const crearValidacion = () => validarPlaneamientoGenerado(resultadoBase, {
      nombreSolicitado: nombrePlaneamiento,
      idiomaEsperado: idiomaSalida,
      estructuraEstrategias: estructuraEstrategiasReferencia,
      indicacionesDocente,
      habilidades: habilidades.recordset,
      indicadoresEsperadosPorHabilidad,
      perfilEstrategias: usaReferenciaEstrategias ? perfilEstrategiasReferencia : undefined,
      perfilDocumentoReferencia,
      auditoriaSemantica,
      referenciaObligatoria
    });
    let validacion = crearValidacion();
    let reparadoAutomaticamente = false;
    let reparacionesAutomaticas = 0;

    while (!validacion.puedeGuardar && reparacionesAutomaticas < 1) {
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
        74,
        "Corrigiendo integralmente el planeamiento"
      );
      const reparado = await repararPlaneamientoConIa({
        resultado: resultadoBase,
        fallas,
        materiaNombre: effectiveMateria,
        grado,
        mes,
        tema,
        habilidades: habilidades.recordset,
        indicacionesDocente,
        idiomaSalida,
        nombrePlaneamiento: nombreResultado,
        estrategiasReferencia,
        perfilEstrategiasReferencia,
        perfilDocumentoReferencia,
        imagenes: documentoApoyo.imagenes
      });
      if (!reparado) break;

      resultadoBase = prepararResultado(reparado);
      reparadoAutomaticamente = true;
      reparacionesAutomaticas += 1;
      auditoriaSemantica = debeAuditar
        ? await auditarPlaneamientoConIa({
            resultado: resultadoBase,
            materiaNombre: effectiveMateria,
            grado,
            mes,
            tema,
            habilidades: habilidades.recordset,
            indicacionesDocente,
            idiomaSalida,
            estrategiasReferencia,
            perfilEstrategiasReferencia,
            perfilDocumentoReferencia
          })
        : undefined;
      validacion = crearValidacion();
      actualizarProgresoOperacion(
        operacionId,
        82,
        "Verificando las correcciones aplicadas"
      );
    }
    if (reparacionesAutomaticas) {
      console.log(`[planeamiento-ia] generar-planeamiento: ${reparacionesAutomaticas} reparación(es) y auditoría final en ${Date.now() - t0}ms`);
    }

    const resultado = {
      ...resultadoBase,
      nombre: nombreResultado,
      estrategiasMediacionEstructuradas: validacion.estrategiasEstructuradas,
      documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
      plantillaFormatoNombre: plantillaFormato.nombre || null,
      documentoReferenciaNombre: referencia.nombre || null,
      idiomaSalida,
      estructuraEstrategiasReferencia,
      perfilEstrategiasReferencia,
      perfilDocumentoReferencia,
      usaReferenciaEstrategias,
      controlCalidad: {
        valido: validacion.valido,
        puedeGuardar: validacion.puedeGuardar,
        puntuacion: validacion.puntuacion,
        verificaciones: validacion.verificaciones,
        nombreSolicitado: nombrePlaneamiento || null,
        idiomaEsperado: idiomaSalida,
        estructuraEstrategias: estructuraEstrategiasReferencia,
        perfilEstrategias: usaReferenciaEstrategias ? perfilEstrategiasReferencia : null,
        perfilDocumentoReferencia,
        indicacionesDocente: indicacionesDocente || null,
        indicadoresEsperadosPorHabilidad,
        referenciaObligatoria,
        auditoriaSemantica: auditoriaSemantica || null,
        reparadoAutomaticamente,
        intentosRevision: 1 + reparacionesAutomaticas,
        contextoGeneracion: {
          materiaNombre: effectiveMateria,
          grado,
          mes,
          tema,
          habilidades: habilidades.recordset.map((habilidad: any) => ({
            Area: habilidad.Area,
            Mes: habilidad.Mes,
            NumeroHabilidad: habilidad.NumeroHabilidad,
            DescripcionHabilidad: habilidad.DescripcionHabilidad
          }))
        }
      },
      plantillaFormatoCacheId: plantillaFormatoDocx?.cacheId || null,
      plantillaFormatoDocx: plantillaFormatoDocx
        ? {
            nombre: plantillaFormatoDocx.nombre,
            mimeType: plantillaFormatoDocx.mimeType,
            guardadaEnServidor: true
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
    ok(res, { resultado, habilidades: habilidades.recordset, generadoConIA: !!aiResult }, "Planeamiento generado correctamente");
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

    if (referenciaObligatoria && !estrategiasReferencia.trim()) {
      marcarErrorProgreso(operacionId, "No está disponible el contenido de referencia");
      return badRequest(res, "No se conserva el contenido de la referencia necesario para volver a revisar el planeamiento");
    }

    const prepararResultado = (value: any) => {
      const preparado = aplicarReglasObligatoriasPlaneamiento(value, {
        indicacionesDocente,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        estructuraEstrategiasReferencia,
        usaReferenciaEstrategias: Boolean(estrategiasReferencia.trim())
      });
      preparado.nombre = nombrePlaneamiento;
      return preparado;
    };

    let resultado = prepararResultado(resultadoEntrada);
    actualizarProgresoOperacion(operacionId, 91, "Auditando nuevamente el planeamiento");
    let auditoriaSemantica = await auditarPlaneamientoConIa({
      resultado,
      materiaNombre,
      grado,
      mes,
      tema,
      habilidades,
      indicacionesDocente,
      idiomaSalida,
      estrategiasReferencia,
      perfilEstrategiasReferencia,
      perfilDocumentoReferencia
    });

    const validar = () => validarPlaneamientoGenerado(resultado, {
      nombreSolicitado: nombrePlaneamiento,
      idiomaEsperado: idiomaSalida,
      estructuraEstrategias: estructuraEstrategiasReferencia,
      indicacionesDocente,
      habilidades,
      indicadoresEsperadosPorHabilidad,
      perfilEstrategias: perfilEstrategiasReferencia,
      perfilDocumentoReferencia,
      auditoriaSemantica,
      referenciaObligatoria
    });
    let validacion = validar();
    let reparadoAutomaticamente = false;
    let reparacionesAutomaticas = 0;

    while (!validacion.puedeGuardar && reparacionesAutomaticas < 1) {
      const fallas = validacion.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => `${item.etiqueta}: ${item.detalle}`);
      const soloFalloAuditoriaNoDisponible = fallas.length === 1
        && !auditoriaSemantica.disponible
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
        idiomaSalida,
        nombrePlaneamiento,
        estrategiasReferencia,
        perfilEstrategiasReferencia,
        perfilDocumentoReferencia
      });

      if (!reparado) break;

      resultado = prepararResultado(reparado);
      reparadoAutomaticamente = true;
      reparacionesAutomaticas += 1;
      auditoriaSemantica = await auditarPlaneamientoConIa({
        resultado,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades,
        indicacionesDocente,
        idiomaSalida,
        estrategiasReferencia,
        perfilEstrategiasReferencia,
        perfilDocumentoReferencia
      });
      validacion = validar();
      actualizarProgresoOperacion(
        operacionId,
        97,
        "Comprobando las mejoras"
      );
    }

    resultado.estrategiasMediacionEstructuradas = validacion.estrategiasEstructuradas;
    resultado.estructuraEstrategiasReferencia = estructuraEstrategiasReferencia;
    resultado.perfilEstrategiasReferencia = perfilEstrategiasReferencia;
    resultado.controlCalidad = {
      ...controlAnterior,
      valido: validacion.valido,
      puedeGuardar: validacion.puedeGuardar,
      puntuacion: validacion.puntuacion,
      verificaciones: validacion.verificaciones,
      nombreSolicitado: nombrePlaneamiento,
      estructuraEstrategias: estructuraEstrategiasReferencia,
      perfilEstrategias: perfilEstrategiasReferencia,
      auditoriaSemantica,
      reparadoAutomaticamente,
      intentosRevision: Number(controlAnterior.intentosRevision || 0) + 1 + reparacionesAutomaticas,
      contextoGeneracion: {
        ...contexto,
        materiaNombre,
        grado,
        mes,
        tema,
        habilidades
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
      { resultado },
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
    const validacionGuardado = revalidarResultadoPlaneamiento(resultado, nombre);
    if (validacionGuardado && !validacionGuardado.puedeGuardar) {
      const detalle = validacionGuardado.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => item.detalle)
        .join(" ");
      marcarErrorProgreso(operacionId, "El planeamiento no superó la validación final");
      return badRequest(res, `Revisá el planeamiento antes de guardarlo. ${detalle}`.trim());
    }

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
  if (startsWithAny(["centro educativo", "institucion educativa", "school", "educational center"])) {
    return replaceSimpleTemplateField(cellXml, values.centroEducativo);
  }
  if (startsWithAny(["nombre de la persona docente", "nombre del docente", "nombre y apellidos del o la docente", "docente", "teacher name", "name of the teacher"])) {
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
  if (startsWithAny(["grade level"])) {
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
    text.includes("aprendizaje esperado")
    || text.includes("aprendizajes esperados")
    || text.includes("resultado de aprendizaje")
    || text.includes("resultados de aprendizaje")
    || text.includes("aprendizaje por lograr")
    || text.includes("aprendizajes por lograr")
    || text.includes("saber esencial")
    || text.includes("saberes esenciales")
    || text.includes("habilidad especifica")
    || text.includes("habilidades especificas")
    || text.includes("learning outcome")
    || text.includes("expected learning")
    || text.includes("learning objective")
    || text.includes("learning goal")
  ) return "aprendizajes";
  if (
    text.includes("estrategias de mediacion")
    || text.includes("estrategia de mediacion")
    || text.includes("mediacion pedagogica")
    || text.includes("actividades de mediacion")
    || text.includes("situaciones de aprendizaje")
    || text.includes("experiencias de aprendizaje")
    || text === "metodologia"
    || text.includes("mediation strateg")
    || text.includes("teaching strateg")
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
    || text.includes("evidencias de aprendizaje")
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

function renderSemanticTemplateTable(tableXml: string, input: {
  metadata: Parameters<typeof replaceMetadataTemplateCell>[1];
  competenciaGeneral: string;
  aprendizajes: string[];
  criterios: string[];
  estrategias: string[];
  indicadores: string[];
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
  let populatedContentRows = 0;
  let rowIndex = 0;

  return replaceDirectXmlElements(tableXml, "w:tr", (originalRowXml) => {
    const currentHeaderRoles = headerRoles[rowIndex++] || null;
    const rowText = normalizarParaBusqueda(xmlWordToText(originalRowXml));
    const isReflectionSection = rowText.includes("reflexiones docentes") || rowText.includes("teacher reflections");
    const isReflectionQuestions = rowText.includes("que funciono")
      || rowText.includes("que no funciono")
      || rowText.includes("que puedo mejorar")
      || rowText.includes("what worked")
      || rowText.includes("what can i improve");
    const isObservations = rowText.includes("observaciones") || rowText.includes("observations");

    let cellIndex = 0;
    let rowXml = replaceDirectXmlElements(originalRowXml, "w:tc", (cellXml) => {
      const currentCellIndex = cellIndex++;
      let next = replaceMetadataTemplateCell(cellXml, input.metadata);
      next = replaceCompetencyTemplateCell(next, input.competenciaGeneral);

      if (isReflectionQuestions) return replaceReflectionTemplateCell(next, input.reflexiones);
      if (isObservations) return replaceObservationsTemplateCell(next, input.observaciones);
      if (!hasContentSlots || currentHeaderRoles || isReflectionSection || !activeRoles) return next;

      const role = activeRoles[currentCellIndex];
      if (!role) return replaceCellBodyPreservingFormatting(next, []);
      if (populatedContentRows > 0) return replaceCellBodyPreservingFormatting(next, []);
      if (role === "aprendizajes") {
        return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(input.aprendizajes));
      }
      if (role === "criterios") {
        return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(
          input.criterios.length ? input.criterios : input.aprendizajes
        ));
      }
      if (role === "estrategias") {
        return replaceCellBodyPreservingFormatting(next, buildStrategyParagraphSpecs(
          input.estrategias,
          input.encabezadosEstrategias
        ));
      }
      return replaceCellBodyPreservingFormatting(next, buildListParagraphSpecs(input.indicadores));
    });

    if (currentHeaderRoles) {
      activeRoles = currentHeaderRoles;
      return rowXml;
    }
    if (isReflectionSection || isReflectionQuestions || isObservations) {
      activeRoles = null;
      return rowXml;
    }
    if (hasContentSlots && activeRoles) populatedContentRows += 1;
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
  xml = replaceDirectXmlElements(xml, "w:tbl", (tableXml) => renderSemanticTemplateTable(tableXml, {
    metadata,
    competenciaGeneral: input.contenido.competenciaGeneral || "",
    aprendizajes: input.contenido.aprendizajes,
    criterios: input.contenido.criterios,
    estrategias: input.contenido.estrategias,
    indicadores: input.contenido.indicadores,
    encabezadosEstrategias: Array.isArray(input.resultado?.estructuraEstrategiasReferencia)
      ? input.resultado.estructuraEstrategiasReferencia
      : [],
    reflexiones: input.contenido.reflexiones,
    observaciones: input.contenido.observaciones || input.row.Observaciones || ""
  }));

  zip.file("word/document.xml", xml);
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name]?.dir && !originalPackageEntries.has(name)) {
      delete zip.files[name];
    }
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

function tableRow(values: { text: string; bold?: boolean; width?: number }[]) {
  return new TableRow({
    children: values.map((value) => cell([p(value.text, { bold: value.bold, size: value.bold ? 21 : 20 })], value.width))
  });
}

function normalizeResultadoForDoc(resultado: any, indicadoresFallback: string[]) {
  const aprendizajes = splitLines(resultado?.aprendizajesEsperados).map(limpiarPrefijoAprendizaje).filter(Boolean);
  const criterios = splitLines(resultado?.criteriosEvaluacion).map(limpiarPrefijoAprendizaje).filter(Boolean);
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
    const validacionGuardado = revalidarResultadoPlaneamiento(resultado, nombre);
    if (validacionGuardado && !validacionGuardado.puedeGuardar) {
      const detalle = validacionGuardado.verificaciones
        .filter((item) => item.estado === "error")
        .map((item) => item.detalle)
        .join(" ");
      marcarErrorProgreso(operacionId, "El planeamiento no superó la validación final");
      return badRequest(res, `Revisá el planeamiento antes de guardarlo. ${detalle}`.trim());
    }

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

      await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, planeamientoId)
        .query(`
          UPDATE dbo.PlaneamientoIndicador
          SET Activo = 0, UpdatedAt = ${SQL_COSTA_RICA_NOW}
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
    const contenido = normalizeResultadoForDoc(resultado, indicadoresFallback);

    const docente = [row.DocenteNombre, row.DocentePrimerApellido, row.DocenteSegundoApellido].filter(Boolean).join(" ") || "Persona docente";
    const direccionRegional = row.RegionalEducativa || "";
    const centroEducativo = row.InstitucionNombreComercial || row.InstitucionNombreOficialBoleta || row.InstitucionNombre || "";
    const anioEscolar = row.AnioNombre || "";
    const cursoLectivo = row.GrupoNivel || row.GrupoNombre || "";
    const periodoTexto = row.PeriodoNombre || "";
    const plantillaBuffer = await renderPlaneamientoEnPlantillaDocx({
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
      const filename = `${safeFileName(row.Nombre || contenido.nombre)}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(plantillaBuffer);
      return;
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
