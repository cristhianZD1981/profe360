import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, HeadingLevel, BorderStyle, PageOrientation, TableLayoutType } from "docx";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { ok, created, badRequest, forbidden } from "../../utils/http";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const planeamientoUpload = upload.any();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

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

const plantillaFormatoDocxCache = new Map<string, PlantillaFormatoDocxGuardada>();

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
  await pool.request().query(`
    IF COL_LENGTH('dbo.PlaneamientoHabilidad', 'UsuarioCreadorId') IS NULL
    BEGIN
      ALTER TABLE dbo.PlaneamientoHabilidad
      ADD UsuarioCreadorId INT NULL;
    END;
  `);
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

  const estrategiasMediacion = [
    `Momento 1: Propuesta del problema. ${problemaReal}`,
    "Momento 2: Trabajo estudiantil independiente. El estudiantado trabaja de forma individual, en parejas o en pequeños grupos, explorando estrategias, representaciones, dibujos, tablas, cálculos o recursos concretos/digitales para buscar una solución al problema planteado.",
    "Momento 3: Discusión interactiva y comunicativa. Se socializan procedimientos, se comparan estrategias, se justifican respuestas y se formalizan los conocimientos matemáticos necesarios, promoviendo el uso correcto del vocabulario y la argumentación.",
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
}) {
  const habilidadesText = input.habilidades.map((h, index) => (
    `${index + 1}. Área: ${h.Area || "No indicada"}. Mes: ${h.Mes || "No indicado"}. Número ${h.NumeroHabilidad || ""}: ${h.DescripcionHabilidad || ""}. Documento referencia: ${h.DocumentoReferencia || "No indicado"}`
  )).join("\n");

  return `
Sos un asistente pedagógico experto en planeamiento didáctico del MEP de Costa Rica, con énfasis en Matemáticas cuando la materia sea Matemática o Matemáticas.

Generá un planeamiento mensual profesional, editable y aplicable al aula, siguiendo la estructura de la plantilla oficial de planeamiento didáctico de Matemáticas para Tercer Ciclo y Educación Diversificada.
Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
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

Habilidades específicas seleccionadas:
${habilidadesText}

Documento de apoyo aportado por la persona docente:
${input.documentoApoyoTexto || "No se aportó documento de apoyo adicional."}

Plantilla o formato de salida aportado por la persona docente:
${input.plantillaFormatoTexto || "No se aportó una plantilla de formato adicional."}

INSTRUCCIÓN PRIORITARIA SOBRE FORMATO:
Si se aportó una plantilla o formato de salida, usalo como referencia principal para el orden, nombres de secciones, tablas, encabezados y nivel de detalle del planeamiento. El documento de apoyo es solo contexto; no reemplaza el formato de salida. Mantené siempre JSON válido para que el sistema pueda guardar y exportar el planeamiento.

Criterios obligatorios para construir la respuesta:
1. Las estrategias de mediación deben organizarse desde la resolución de problemas, no como ejercicios aislados.
2. Deben partir de contextos reales, situaciones cercanas al estudiantado y modelización cuando aplique.
3. En estrategias de medición/mediación debe iniciar obligatoriamente con:
   - Momento 1: Propuesta del problema.
   Después del título, redactá un problema real y concreto que el estudiantado deba resolver, construido en función de los indicadores dados. No transcribás esta instrucción como contenido.
   - Momento 2: Trabajo estudiantil independiente
   - Momento 3: Discusión interactiva y comunicativa
   - Momento 4: Clausura o cierre
   - Etapa 2: Movilización y aplicación de los conocimientos
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
19. En "Momento 1" incluí contexto específico con al menos: actor, objetivo, dos alternativas comparables y criterio explícito de decisión.
20. En "Momento 2/3/4" evitá frases genéricas; describí acciones observables concretas que el estudiantado realizará en ese caso.

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
  "estrategiasMediacion": [
    "Momento 1: Propuesta del problema...",
    "Momento 2: Trabajo estudiantil independiente...",
    "Momento 3: Discusión interactiva y comunicativa...",
    "Momento 4: Clausura o cierre...",
    "Etapa 2: Movilización y aplicación de los conocimientos..."
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
  usuarioId?: number | null;
  esAdmin?: boolean;
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

  const prompt = `
${clampPromptText(row.IndicacionesSistema, 10000)}

${clampPromptText(row.ContextoBase, 12000)}

Contexto del planeamiento:
- Tipo de colegio: ${input.tipoColegio || "No indicado"}
- Materia: ${input.materiaNombre || "No indicada"}
- Grado: ${input.grado || "No indicado"}
- Mes: ${input.mes || "No indicado"}
- Tema o énfasis: ${input.tema || "No indicado"}
- Cantidad de semanas: ${input.semanas || 4}
- Documento de apoyo opcional: ${input.documentoApoyoNombre || "No adjuntado"}
- Plantilla o formato de salida opcional: ${input.plantillaFormatoNombre || "No adjuntado"}

Indicaciones, consideraciones o premisas del docente:
${clampPromptText(input.indicacionesDocente || "No se indicaron premisas adicionales.", 4000)}

IMPORTANTE SOBRE LAS INDICACIONES DEL DOCENTE:
Las indicaciones del docente tienen prioridad sobre la plantilla general.
Si las indicaciones del docente piden usar un ejemplo específico, una página o un formato tomado del Documento de apoyo, debés aplicarlo explícitamente en la respuesta.
Si el docente solicita adecuación significativa, color, resaltado o cualquier condición especial, debe reflejarse explícitamente en el JSON final.
Si el docente pide pintar o resaltar una sección en azul, devolvé colorResaltado = "azul" en el objeto correspondiente y agregá el marcador [AZUL] al inicio del texto visible.
Si el docente indica página(s), ejercicio(s), capítulo(s) o sección(es) concretas del documento de apoyo, tomalas de forma literal y citá en el contenido generado la referencia exacta (por ejemplo: "página 12, ejercicio 4").
No ignorés esta sección.

Habilidades específicas seleccionadas:
${clampPromptText(habilidadesText, 12000)}

Documento de apoyo aportado por la persona docente:
${clampPromptText(input.documentoApoyoTexto || "No se aportó documento de apoyo adicional.", 8000)}

Plantilla o formato de salida aportado por la persona docente:
${clampPromptText(input.plantillaFormatoTexto || "No se aportó una plantilla de formato adicional.", 10000)}

INSTRUCCIÓN PRIORITARIA SOBRE FORMATO:
Si se aportó una plantilla o formato de salida, usalo como referencia principal para el orden, nombres de secciones, tablas, encabezados y nivel de detalle del planeamiento. El documento de apoyo es solo contexto; no reemplaza el formato de salida. Si también hay una plantilla IA seleccionada, combiná ambas: la Plantilla IA define las reglas permanentes y este archivo define el formato específico de esta generación. Mantené siempre JSON válido para que el sistema pueda guardar y exportar el planeamiento.

REGLAS DE CALIDAD Y DIVERSIDAD (OBLIGATORIAS):
- Evitá repetir siempre el mismo caso contextual (por ejemplo municipalidad). Variá el actor y el contexto según materia, grado, tema y habilidades.
- En Momento 1 incluí: actor real, objetivo, dos alternativas comparables y criterio explícito de decisión.
- En Momento 2/3/4 redactá acciones observables concretas; evitá textos genéricos de plantilla.
- Si el docente no pidió un caso específico, proponé uno original y coherente con los datos de entrada.

Reglas de construcción:
${clampPromptText(row.ReglasConstruccion, 12000)}

Estructura de salida:
${clampPromptText(row.EstructuraSalida, 10000)}

Formato de respuesta:
${clampPromptText(row.FormatoRespuesta, 8000)}

Devolvé SOLO JSON válido, sin markdown.
`;

  const promptFinal = prompt.length > 60000
    ? `${prompt.slice(0, 60000)}\n\n[Prompt recortado automáticamente por límite global]`
    : prompt;

  return {
    plantillaPromptIAId: row.Id,
    prompt: promptFinal
  };
}

async function callOpenAiIfConfigured(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const timeoutMs = Number(process.env.OPENAI_PLANEAMIENTO_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.35
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Error OpenAI planeamiento:", text);
      return null;
    }

    const data: any = await response.json();
    const text = data.output_text || data.output?.[0]?.content?.[0]?.text || "";
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



function normalizarParaBusqueda(value: any) {
  return repararMojibakeTexto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function permiteMultiplesIndicadoresPorHabilidad(indicaciones: string) {
  const texto = normalizarParaBusqueda(indicaciones);
  if (!texto) return false;
  const mencionaObjetivo = texto.includes("indicador")
    || texto.includes("indicado")
    || texto.includes("habilidad");
  if (!mencionaObjetivo) return false;
  return (
    texto.includes("mas de un") ||
    texto.includes("más de un") ||
    texto.includes("varios") ||
    texto.includes("multiples") ||
    texto.includes("múltiples") ||
    texto.includes("adicional") ||
    texto.includes("genere") ||
    texto.includes("genera") ||
    texto.includes("dame") ||
    /\b2\b|\b3\b|\b4\b|\bdos\b|\btres\b|\bcuatro\b/.test(texto)
  );
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
  const base = (Array.isArray(estrategias) ? estrategias : []).map((e) => String(e || "").trim()).filter(Boolean);
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
  const base = (Array.isArray(estrategias) ? estrategias : []).map((e) => String(e || "").trim()).filter(Boolean);

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

function ajustarIndicadoresPorHabilidad(input: { indicadoresEntrada: string[]; habilidades: any[]; permitirMultiples: boolean; indicacionesDocente?: string }) {
  const habilidades = Array.isArray(input.habilidades) ? input.habilidades : [];
  const cantidadObjetivo = Math.max(1, habilidades.length || 1);
  const baseDesdeHabilidad = habilidades.map((h: any) => {
    const descripcion = String(h?.DescripcionHabilidad || "").trim() || "la habilidad seleccionada";
    return convertirInicioATerceraPersonaSingular(descripcion);
  });
  const indicaciones = normalizarParaBusqueda(String(input.indicacionesDocente || ""));
  const cantidadPorHabilidad = Array.from({ length: cantidadObjetivo }, () => 1);

  // Permite instrucciones como:
  // - "tomá el indicador 4 y generá 3 indicadores"
  // - "para la habilidad 2, dame 4 indicadores"
  // - "indicador 3 con 2 adicionales"
  // - "tome el indicado 4 y genere 3 indicadores (2 adicionales)"
  const tokenObjetivo = "(?:indicador(?:es)?|indicado(?:r)?|habilidad(?:es)?)";
  for (let i = 1; i <= cantidadObjetivo; i += 1) {
    const p1 = new RegExp(`${tokenObjetivo}\\s*${i}\\b[\\s\\S]{0,120}?(\\d{1,2})\\s+indicadores?`);
    const p2 = new RegExp(`(\\d{1,2})\\s+indicadores?[\\s\\S]{0,120}?${tokenObjetivo}\\s*${i}\\b`);
    const p3 = new RegExp(`${tokenObjetivo}\\s*${i}\\b[\\s\\S]{0,120}?(\\d{1,2})\\s+adicional(?:es)?`);
    const p4 = new RegExp(`${tokenObjetivo}\\s*${i}\\b[\\s\\S]{0,120}?\\((\\d{1,2})\\s+adicional(?:es)?\\)`);
    const m1 = indicaciones.match(p1);
    const m2 = indicaciones.match(p2);
    const m3 = indicaciones.match(p3);
    const m4 = indicaciones.match(p4);
    if (m1?.[1]) cantidadPorHabilidad[i - 1] = Math.max(1, Math.min(10, Number(m1[1])));
    else if (m2?.[1]) cantidadPorHabilidad[i - 1] = Math.max(1, Math.min(10, Number(m2[1])));
    else if (m3?.[1]) cantidadPorHabilidad[i - 1] = Math.max(1, Math.min(10, Number(m3[1]) + 1));
    else if (m4?.[1]) cantidadPorHabilidad[i - 1] = Math.max(1, Math.min(10, Number(m4[1]) + 1));
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
    const total = input.permitirMultiples ? totalSolicitado : 1;
    for (let j = 1; j <= total; j += 1) {
      const texto = j === 1 ? limpio : construirVariacionIndicador(limpio, j - 1);
      salida.push(`${i + 1}.${j} ${texto}`);
    }
  }

  return salida.length ? salida : baseDesdeHabilidad.map((t, i) => `${i + 1}.1 ${t}`);
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

function construirTextoAdecuacionSignificativa(input: {
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  usarAzul: boolean;
}) {
  const habilidadBase = input.habilidades?.[0]?.DescripcionHabilidad || input.tema || "la habilidad específica seleccionada";
  const prefijo = input.usarAzul ? "[AZUL] " : "";

  return `${prefijo}Estrategia de mediación para adecuación significativa:
Propósito de la adaptación: Favorecer la participación del estudiante con adecuación significativa mediante una actividad ajustada, concreta y vinculada con ${habilidadBase}, respetando su ritmo de aprendizaje y priorizando evidencias observables.
Actividad adaptada: El estudiante trabajará con material visual y manipulativo, como tarjetas, recta numérica ampliada, ejemplos resueltos y una guía paso a paso. A partir de situaciones cotidianas sencillas, identificará, representará o comparará números racionales según la habilidad seleccionada, usando menos ejercicios, instrucciones breves y apoyo gráfico.
Apoyo docente: La persona docente brindará modelaje inicial, instrucciones cortas, acompañamiento individual, preguntas guiadas y verificación constante de comprensión antes, durante y después de la actividad.
Material o recurso ajustado: Recta numérica ampliada, tarjetas con números racionales en diferentes representaciones, colores para diferenciar fracciones y decimales, guía simplificada, ejemplos resueltos y espacio amplio para responder.
Producto esperado: El estudiante elaborará una representación sencilla, clasificación o resolución guiada relacionada con números racionales, mostrando el procedimiento mediante dibujos, marcas en la recta numérica, selección de opciones o explicación oral breve.
Forma de evaluación ajustada: Se valorará el desempeño mediante observación directa, revisión del producto adaptado, explicación oral breve y cumplimiento de pasos esenciales, priorizando el avance individual y la comprensión funcional de la habilidad.`;
}

function aplicarReglasObligatoriasPlaneamiento(resultadoEntrada: any, input: {
  indicacionesDocente: string;
  materiaNombre: string;
  grado: string;
  mes: string;
  tema: string;
  habilidades: any[];
  documentoApoyoTexto?: string;
}) {
  const resultado = resultadoEntrada && typeof resultadoEntrada === "object" ? { ...resultadoEntrada } : {};
  const indicacionesDocente = input.indicacionesDocente || "";
  const requiereAdecuacion = pideAdecuacionSignificativa(indicacionesDocente);
  const requiereAzul = pideColorAzul(indicacionesDocente);
  const permitirMultiples = permiteMultiplesIndicadoresPorHabilidad(indicacionesDocente);

  if (!Array.isArray(resultado.estrategiasMediacion)) {
    resultado.estrategiasMediacion = splitLines(resultado.estrategiasMediacion);
  }
  resultado.estrategiasMediacion = asegurarMomento1Primero(
    limpiarEstrategiasMediacion(resultado.estrategiasMediacion),
    {
      habilidades: input.habilidades,
      materiaNombre: input.materiaNombre,
      grado: input.grado,
      tema: input.tema
    }
  );
  resultado.estrategiasMediacion = asegurarMomentosEspecificos(resultado.estrategiasMediacion, {
    habilidades: input.habilidades,
    materiaNombre: input.materiaNombre,
    grado: input.grado,
    tema: input.tema
  });

  resultado.indicadoresEvaluacion = ajustarIndicadoresPorHabilidad({
    indicadoresEntrada: splitLines(resultado.indicadoresEvaluacion),
    habilidades: input.habilidades,
    permitirMultiples,
    indicacionesDocente
  });

  resultado.aprendizajesEsperados = corregirErroresOrtograficosLista(splitLines(resultado.aprendizajesEsperados));
  resultado.indicadoresEvaluacion = corregirErroresOrtograficosLista(splitLines(resultado.indicadoresEvaluacion));
  resultado.estrategiasMediacion = corregirErroresOrtograficosLista(splitLines(resultado.estrategiasMediacion));

  resultado.observaciones = "";

  if (!requiereAdecuacion) return resultado;

  const yaTieneAdecuacion = resultado.estrategiasMediacion.some((item: any) => {
    const texto = normalizarParaBusqueda(item);
    return texto.includes("adecuacion significativa") || texto.includes("adecuacion curricular significativa");
  });

  const textoVisible = construirTextoAdecuacionSignificativa({
    materiaNombre: input.materiaNombre,
    grado: input.grado,
    mes: input.mes,
    tema: input.tema,
    habilidades: input.habilidades,
    usarAzul: requiereAzul
  });

  if (!yaTieneAdecuacion) {
    resultado.estrategiasMediacion.push(textoVisible);
  }

  resultado.estrategiaAdecuacionSignificativa = {
    aplica: true,
    colorResaltado: requiereAzul ? "azul" : "",
    titulo: "Estrategia de mediación para adecuación significativa",
    proposito: "Favorecer la participación del estudiante con adecuación significativa mediante una actividad ajustada, concreta y vinculada con la habilidad seleccionada.",
    actividadAdaptada: "Trabajo con material visual y manipulativo, recta numérica ampliada, tarjetas, ejemplos resueltos y guía paso a paso.",
    apoyoDocente: "Modelaje inicial, instrucciones cortas, acompañamiento individual, preguntas guiadas y verificación constante de comprensión.",
    recursoAjustado: "Recta numérica ampliada, tarjetas con números racionales, colores, guía simplificada, ejemplos resueltos y espacio amplio para responder.",
    productoEsperado: "Representación sencilla, clasificación o resolución guiada relacionada con la habilidad seleccionada, mediante dibujos, marcas, selección de opciones o explicación oral breve.",
    evaluacionAjustada: "Observación directa, revisión del producto adaptado, explicación oral breve y valoración del cumplimiento de pasos esenciales.",
    textoVisible
  };

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
    await ensurePlaneamientoHabilidadOwnershipColumns(pool);
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
          OR EXISTS (
            SELECT 1
            FROM dbo.Materia mref
            WHERE mref.MateriaId = @materiaId
              AND (
                (
                  ISNULL(h.MateriaNombre, N'') <> N''
                  AND (
                    UPPER(LTRIM(RTRIM(ISNULL(h.MateriaNombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI + N'%'
                    OR UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(ISNULL(h.MateriaNombre, N'')))) COLLATE Latin1_General_100_CI_AI + N'%'
                  )
                )
                OR EXISTS (
                  SELECT 1
                  FROM dbo.Materia mh
                  WHERE mh.MateriaId = h.MateriaId
                    AND (
                      UPPER(LTRIM(RTRIM(ISNULL(mh.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI + N'%'
                      OR UPPER(LTRIM(RTRIM(mref.Nombre))) COLLATE Latin1_General_100_CI_AI LIKE UPPER(LTRIM(RTRIM(ISNULL(mh.Nombre, N'')))) COLLATE Latin1_General_100_CI_AI + N'%'
                    )
                )
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
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(m.Nombre, h.MateriaNombre), h.Grado, ${monthOrderExpression("h")}, h.Area, TRY_CONVERT(INT, h.NumeroHabilidad), h.NumeroHabilidad
    `);

    ok(res, result.recordset);
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
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Habilidades");
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
  if (!canMaintainHabilidades(req)) return forbidden(res, "No tenes permisos para importar habilidades");

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

      const materiaNombre = normalizeText(row.Materia);
      const tipoColegio = normalizeText(row.Colegio);
      const ciclo = normalizeNullableText(row.Ciclo);
      const grado = normalizeText(row.Grado);
      const mes = normalizeText(row.mes || row.Mes);
      const area = normalizeNullableText(row.Area);
      const numeroHabilidad = normalizeNullableText(row["Numero de Habilidad"] || row.NumeroHabilidad);
      const descripcionHabilidad = normalizeText(row["Descripcion de la Habilidad"] || row.DescripcionHabilidad);
      const documentoReferencia = normalizeNullableText(row["Documento de referencia "] || row["Documento de referencia"] || row.DocumentoReferencia);

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
        .input("descripcionHabilidad", sql.NVarChar(sql.MAX), descripcionHabilidad)
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
        .input("descripcionHabilidad", sql.NVarChar(sql.MAX), descripcionHabilidad)
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
  return extractUploadedText(file, {
    defaultName: "documento_apoyo",
    maxChars: 12000,
    unsupportedMessage: "Se adjuntó el archivo {nombre}. Si el documento contiene lineamientos específicos, la persona docente debe revisar la propuesta generada y ajustar según ese material."
  });
}

async function extractDocumentosApoyoText(files: Express.Multer.File[]) {
  const documentos = Array.isArray(files) ? files : [];
  if (!documentos.length) return { nombres: [] as string[], texto: "" };

  const partes: string[] = [];
  const nombres: string[] = [];
  const maxTotal = 16000;
  let usado = 0;

  for (const file of documentos) {
    const contenido = await extractDocumentoApoyoText(file);
    if (contenido.nombre) nombres.push(contenido.nombre);
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
    texto: partes.join("\n\n---\n\n").trim()
  };
}

function extractPlantillaFormatoText(file?: Express.Multer.File) {
  return extractUploadedText(file, {
    defaultName: "plantilla_formato",
    maxChars: 16000,
    unsupportedMessage: "Se adjuntó la plantilla de formato {nombre}, pero el sistema no pudo extraer su contenido. Para que la IA siga un formato exacto, subí una plantilla .docx o un archivo de texto, o registrá ese formato en Configuración con IA."
  });
}

function buildPlaneamientoNombre(input: { mes?: any; grado?: any; materiaNombre?: any }) {
  const mes = normalizeText(input.mes) || "Mes";
  const grado = normalizeText(input.grado) || "Grado";
  const materia = normalizeText(input.materiaNombre) || "Materia";
  return `${mes} - ${grado} - ${materia}`;
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

router.post("/generar-planeamiento", planeamientoUpload, async (req, res) => {
  try {
    const t0 = Date.now();
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const materiaId = toOptionalInt(req.body.materiaId);
    const materiaNombre = normalizeText(req.body.materiaNombre);
    const tipoColegio = normalizeText(req.body.tipoColegio);
    const grado = normalizeText(req.body.grado);
    const mes = normalizeText(req.body.mes);
    const tema = normalizeText(req.body.tema);
    const indicacionesDocente = normalizeText(req.body.indicacionesDocente);
    const anioLectivoId = toOptionalInt(req.body.anioLectivoId);
    const periodoId = toOptionalInt(req.body.periodoId);
    const grupoId = toOptionalInt(req.body.grupoId);
    const semanas = Math.min(8, Math.max(1, Number(req.body.semanas || 4)));
    const plantillaPromptIAId = toOptionalInt(req.body.plantillaPromptIAId);
    const rawHabilidadesIds = req.body.habilidadesIds ?? req.body["habilidadesIds[]"] ?? [];
    const habilidadesIds: number[] = (Array.isArray(rawHabilidadesIds) ? rawHabilidadesIds : [rawHabilidadesIds])
      .map(Number)
      .filter((n: number) => Number.isInteger(n) && n > 0);

    if (!habilidadesIds.length) return badRequest(res, "Debés seleccionar al menos una habilidad");

    const pool = await getPool();
    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) return;
    console.log(`[planeamiento-ia] generar-planeamiento: validación/asignación en ${Date.now() - t0}ms`);

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

    if (!habilidades.recordset.length) return badRequest(res, "No se encontraron las habilidades seleccionadas");
    console.log(`[planeamiento-ia] generar-planeamiento: carga de habilidades en ${Date.now() - t0}ms`);

    const effectiveMateria = materiaNombre || habilidades.recordset[0]?.MateriaNombre || "Materia";
    const documentoApoyoFiles = getUploadedFiles(req, "documentoApoyo");
    const documentoApoyo = await extractDocumentosApoyoText(documentoApoyoFiles);
    const plantillaFormatoFile = getUploadedFile(req, "plantillaFormato");
    const plantillaFormato = await extractPlantillaFormatoText(plantillaFormatoFile);
    const plantillaFormatoDocx = cachePlantillaFormatoDocx(plantillaFormatoFile);
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
      plantillaFormatoTexto: plantillaFormato.texto,
      plantillaFormatoNombre: plantillaFormato.nombre || undefined,
      plantillaPromptIAId,
      indicacionesDocente,
      usuarioId: getUserId(req) || null,
      esAdmin: canMaintainAnyHabilidad(req)
    });
    console.log(`[planeamiento-ia] generar-planeamiento: prompt construido en ${Date.now() - t0}ms`);
    const prompt = promptData.prompt;
    const aiResult = await callOpenAiIfConfigured(prompt);
    console.log(`[planeamiento-ia] generar-planeamiento: IA/fallback en ${Date.now() - t0}ms`);
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
      plantillaFormatoTexto: plantillaFormato.texto,
      plantillaFormatoNombre: plantillaFormato.nombre || undefined,
      indicacionesDocente
    });

    const resultadoBase = aplicarReglasObligatoriasPlaneamiento(resultadoBaseSinReglas, {
      indicacionesDocente,
      materiaNombre: effectiveMateria,
      grado,
      mes,
      tema,
      habilidades: habilidades.recordset,
      documentoApoyoTexto: documentoApoyo.texto
    });

    const resultado = {
      ...resultadoBase,
      nombre: buildPlaneamientoNombre({ mes, grado, materiaNombre: effectiveMateria }),
      documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
      plantillaFormatoNombre: plantillaFormato.nombre || null,
      plantillaFormatoCacheId: plantillaFormatoDocx?.cacheId || null,
      plantillaFormatoDocx: plantillaFormatoDocx
        ? {
            nombre: plantillaFormatoDocx.nombre,
            mimeType: plantillaFormatoDocx.mimeType,
            guardadaEnServidor: true
          }
        : null
    };

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
        semanas,
        habilidadesIds,
        plantillaPromptIAId: promptData.plantillaPromptIAId,
        documentoApoyoNombre: documentoApoyo.nombres.length ? documentoApoyo.nombres.join(", ") : null,
        plantillaFormatoNombre: plantillaFormato.nombre || null
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

    ok(res, { resultado, habilidades: habilidades.recordset, generadoConIA: !!aiResult }, "Planeamiento generado correctamente");
  } catch (error) {
    console.error("Error generando planeamiento con IA:", error);
    res.status(500).json({ ok: false, message: "No se pudo generar el planeamiento" });
  }
});

router.post("/guardar-planeamiento", async (req, res) => {
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const anioLectivoId = toRequiredInt(req.body.anioLectivoId, "anioLectivoId", res);
    const periodoId = toRequiredInt(req.body.periodoId, "periodoId", res);
    const grupoId = toRequiredInt(req.body.grupoId, "grupoId", res);
    const materiaId = toRequiredInt(req.body.materiaId, "materiaId", res);
    if ([anioLectivoId, periodoId, grupoId, materiaId].some((v) => v === null)) return;

    const resultado = normalizarSeleccionesPlaneamientoResultado(
      hydratePlantillaFormatoDocx(req.body.resultado || {})
    );
    const fechaInicio = normalizeNullableText(req.body.fechaInicio);
    const fechaFin = normalizeNullableText(req.body.fechaFin);
    const observaciones = normalizeNullableText(req.body.observaciones || "");
    const usuarioId = getAuth(req).usuarioId || getAuth(req).userId || null;

    const pool = await getPool();
    const materiaNombreOficial = await getMateriaNombreOficial(pool, institucionId, materiaId);
    const nombre = buildPlaneamientoNombre({
      mes: req.body.mes || resultado.mes || resultado.Mes || req.body.mesPlaneamiento,
      grado: req.body.grado || resultado.grado || resultado.Grado || req.body.gradoPlaneamiento,
      materiaNombre: materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || req.body.materiaNombrePlaneamiento
    }) || normalizeText(req.body.nombre || resultado.nombre || "Planeamiento generado con IA");

    resultado.nombre = nombre;
    resultado.materiaNombre = materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || "";
    resultado.MateriaNombre = resultado.materiaNombre;

    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) return;

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
            (@institucionId, @anioLectivoId, @periodoId, @grupoId, @materiaId, @usuarioId, @nombre, @fechaInicio, @fechaFin, @observaciones, @resultadoIAJson, 1, SYSDATETIME())
        `);

      const planeamientoId = planeamientoResult.recordset[0].PlaneamientoId;
      const indicadores = splitLines(resultado.indicadoresEvaluacion);

      for (const indicador of indicadores) {
        const text = normalizeText(indicador);
        if (!text) continue;
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, planeamientoId)
          .input("descripcion", sql.NVarChar(sql.MAX), text)
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            VALUES
              (@planeamientoId, @descripcion, NULL, 1, SYSDATETIME())
          `);
      }

      await transaction.commit();
      created(res, { planeamientoId }, "Planeamiento guardado correctamente");
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error guardando planeamiento generado:", error);
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

function xmlTextRun(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
  const bold = opts.bold ? "<w:b/>" : "";
  const size = `<w:sz w:val="${opts.size || 20}"/>`;
  return `<w:r><w:rPr>${bold}${color}${size}</w:rPr><w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`;
}

function xmlParagraph(text: string, opts: { bold?: boolean; size?: number; align?: any; color?: string } = {}) {
  const marcadoAzul = esTextoAzul(text);
  const color = opts.color || (marcadoAzul ? "0070C0" : undefined);
  const align = opts.align ? `<w:pPr><w:jc w:val="${opts.align}"/></w:pPr>` : "";
  return `<w:p>${align}${xmlTextRun(limpiarMarcadorColor(text), { bold: opts.bold, size: opts.size || 20, color })}</w:p>`;
}

function xmlFieldParagraph(label: string, value: any, opts: { size?: number } = {}) {
  return `<w:p>${xmlTextRun(label, { bold: true, size: opts.size || 20 })}${xmlTextRun(String(value || ""), { size: opts.size || 20 })}</w:p>`;
}

function xmlParagraphsFromList(items: any[], fallback: string, opts: { bulletPrefix?: string; size?: number; numbered?: boolean } = {}) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const source = values.length ? values : [fallback];
  return source
    .filter((item) => String(item || "").trim())
    .map((item, index) => xmlParagraph(`${opts.numbered ? `${index + 1}. ` : (opts.bulletPrefix || "")}${item}`, { size: opts.size || 19 }));
}

function xmlParagraphsEstrategiasMomentos(items: any[], fallback: string, size = 19) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const source = values.length ? values : [fallback];
  const out: string[] = [];
  source.forEach((item, idx) => {
    const m = String(item || "").match(/^\s*(Momento\s+\d+\s*:[^\.]*\.)\s*(.*)$/i);
    if (m) {
      const titulo = String(m[1] || "").trim();
      const cuerpo = String(m[2] || "").trim();
      out.push(xmlParagraph(titulo, { bold: true, size }));
      if (cuerpo) out.push(xmlParagraph(cuerpo, { size }));
      if (idx < source.length - 1) out.push(xmlParagraph("", { size }));
      return;
    }
    out.push(xmlParagraph(`- ${item}`, { size }));
  });
  return out;
}

function replaceCellBody(tcXml: string, paragraphsXml: string[]) {
  const opening = tcXml.match(/^<w:tc[^>]*>/)?.[0] || "<w:tc>";
  const props = tcXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/)?.[0] || "";
  const content = paragraphsXml.length ? paragraphsXml.join("") : xmlParagraph("");
  return `${opening}${props}${content}</w:tc>`;
}

function replaceCellsInRow(rowXml: string, replacers: Array<((cellXml: string) => string) | null | undefined>) {
  let cellIndex = 0;
  return rowXml.replace(/<w:tc[\s\S]*?<\/w:tc>/g, (cellXml) => {
    const replacer = replacers[cellIndex++];
    return replacer ? replacer(cellXml) : cellXml;
  });
}

function replaceRowsInTable(tableXml: string, replacers: Array<((rowXml: string) => string) | null | undefined>) {
  let rowIndex = 0;
  return tableXml.replace(/<w:tr[\s\S]*?<\/w:tr>/g, (rowXml) => {
    const replacer = replacers[rowIndex++];
    return replacer ? replacer(rowXml) : rowXml;
  });
}

function replaceIntroTemplateCell(cellXml: string, values: {
  direccionRegional: string;
  centroEducativo: string;
  docente: string;
  materia: string;
  anioEscolar: string;
  cursoLectivo: string;
  periodicidad: string;
}) {
  const text = normalizarParaBusqueda(xmlWordToText(cellXml));
  if (text.includes("direccion regional de educacion")) return replaceCellBody(cellXml, [xmlFieldParagraph("Dirección Regional de Educación: ", values.direccionRegional)]);
  if (text.includes("centro educativo")) return replaceCellBody(cellXml, [xmlFieldParagraph("Centro educativo: ", values.centroEducativo)]);
  if (text.includes("nombre de la persona docente")) return replaceCellBody(cellXml, [xmlFieldParagraph("Nombre de la persona docente: ", values.docente)]);
  if (text.includes("asignatura") || text.includes("subarea")) return replaceCellBody(cellXml, [xmlFieldParagraph("Asignatura, módulo, disciplina, especialidad, componente, área o subárea: ", values.materia)]);
  if (text.includes("ano escolar")) return replaceCellBody(cellXml, [xmlFieldParagraph("Año escolar: ", values.anioEscolar)]);
  if (text.includes("curso lectivo")) return replaceCellBody(cellXml, [xmlFieldParagraph("Curso lectivo: ", values.cursoLectivo)]);
  if (text.includes("periodicidad")) return replaceCellBody(cellXml, [xmlFieldParagraph("Periodicidad: ", values.periodicidad)]);
  return cellXml;
}

async function renderPlaneamientoEnPlantillaDocx(input: {
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
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return null;

  const competenciasBase = [
    "Competencias para la ciudadanía responsable y solidaria",
    "Competencias para la vida: sociales, emocionales y de aprendizaje",
    "Competencias para el empleo digno y el emprendimiento"
  ];
  const competenciaUnica = normalizarParaBusqueda(input.contenido.competenciaGeneral || "");
  const competenciasSeleccionadas = competenciaUnica
    ? competenciasBase.map((competencia) => normalizarParaBusqueda(competencia).includes(competenciaUnica) || competenciaUnica.includes(normalizarParaBusqueda(competencia)))
    : (
      input.contenido.competenciasGenerales?.length
        ? competenciasBase.map((competencia) => input.contenido.competenciasGenerales.some((item: string) => normalizarParaBusqueda(item).includes(normalizarParaBusqueda(competencia).slice(0, 24))))
        : competenciasBase.map(() => true)
    );

    const estrategiasXml = [
      ...xmlParagraphsEstrategiasMomentos(input.contenido.estrategias, input.row.Observaciones || "Sin estrategias registradas", 19)
    ];

  if (input.contenido.cotidiano.length || input.contenido.tareas.length || input.contenido.evaluacion.length || input.contenido.recursos.length) {
    estrategiasXml.push(xmlParagraph("Seguimiento sugerido", { bold: true, size: 19 }));
    if (input.contenido.cotidiano.length) estrategiasXml.push(xmlParagraph("Trabajo cotidiano", { bold: true, size: 19 }), ...xmlParagraphsFromList(input.contenido.cotidiano, "", { bulletPrefix: "- ", size: 19 }));
    if (input.contenido.tareas.length) estrategiasXml.push(xmlParagraph("Tareas", { bold: true, size: 19 }), ...xmlParagraphsFromList(input.contenido.tareas, "", { bulletPrefix: "- ", size: 19 }));
    if (input.contenido.evaluacion.length) estrategiasXml.push(xmlParagraph("Evaluación sugerida", { bold: true, size: 19 }), ...xmlParagraphsFromList(input.contenido.evaluacion, "", { bulletPrefix: "- ", size: 19 }));
    if (input.contenido.recursos.length) estrategiasXml.push(xmlParagraph("Recursos", { bold: true, size: 19 }), ...xmlParagraphsFromList(input.contenido.recursos, "", { bulletPrefix: "- ", size: 19 }));
  }

  let tableIndex = 0;
  let xml = await documentFile.async("string");
  xml = xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    const current = tableIndex++;

    if (current === 0) {
      return tableXml.replace(/<w:tc[\s\S]*?<\/w:tc>/g, (cellXml) => replaceIntroTemplateCell(cellXml, {
        direccionRegional: input.direccionRegional,
        centroEducativo: input.centroEducativo,
        docente: input.docente,
        materia: input.row.MateriaNombre || "",
        anioEscolar: input.anioEscolar,
        cursoLectivo: input.cursoLectivo,
        periodicidad: periodicidadConMarca(input.periodoTexto, input.contenido.periodicidad)
      }));
    }

    if (current === 1) {
      let competenciaIndex = 0;
      return tableXml.replace(/<w:tc[\s\S]*?<\/w:tc>/g, (cellXml) => {
        const competencia = competenciasBase[competenciaIndex] || xmlWordToText(cellXml);
        const marcada = competenciasSeleccionadas[competenciaIndex++] ? "X" : " ";
        return replaceCellBody(cellXml, [xmlParagraph(`${competencia} (${marcada})`, { size: 19 })]);
      });
    }

    if (current === 2) {
      return replaceRowsInTable(tableXml, [
        null,
        (rowXml) => replaceCellsInRow(rowXml, [
          (cellXml) => replaceCellBody(cellXml, xmlParagraphsFromList(input.contenido.aprendizajes, "Sin aprendizajes registrados", { numbered: true, size: 19 })),
          (cellXml) => replaceCellBody(cellXml, estrategiasXml),
          (cellXml) => replaceCellBody(cellXml, input.contenido.indicadores.length
            ? input.contenido.indicadores.map((item: string) => xmlParagraph(limpiarPrefijoIndicador(item), { size: 19 }))
            : [xmlParagraph("Sin indicadores registrados", { size: 19 })])
        ]),
        null,
        (rowXml) => replaceCellsInRow(rowXml, [
          (cellXml) => replaceCellBody(cellXml, [
            xmlParagraph("¿Qué funcionó?", { bold: true, size: 19 }),
            xmlParagraph(String(input.contenido.reflexiones?.queFunciono || ""), { size: 19 })
          ]),
          (cellXml) => replaceCellBody(cellXml, [
            xmlParagraph("¿Qué no funcionó?", { bold: true, size: 19 }),
            xmlParagraph(String(input.contenido.reflexiones?.queNoFunciono || ""), { size: 19 })
          ]),
          (cellXml) => replaceCellBody(cellXml, [
            xmlParagraph("¿Qué puedo mejorar?", { bold: true, size: 19 }),
            xmlParagraph(String(input.contenido.reflexiones?.quePuedoMejorar || ""), { size: 19 })
          ])
        ]),
        (rowXml) => replaceCellsInRow(rowXml, [
          (cellXml) => replaceCellBody(cellXml, [
            xmlFieldParagraph("Observaciones: ", input.contenido.observaciones || input.row.Observaciones || "", { size: 19 })
          ])
        ])
      ]);
    }

    return tableXml;
  });

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

function tableRow(values: { text: string; bold?: boolean; width?: number }[]) {
  return new TableRow({
    children: values.map((value) => cell([p(value.text, { bold: value.bold, size: value.bold ? 21 : 20 })], value.width))
  });
}

function normalizeResultadoForDoc(resultado: any, indicadoresFallback: string[]) {
  const aprendizajes = splitLines(resultado?.aprendizajesEsperados).map(limpiarPrefijoAprendizaje).filter(Boolean);
  const estrategiasBase = splitLines(resultado?.estrategiasMediacion);
  const estrategiaAdecuacion = resultado?.estrategiaAdecuacionSignificativa;
  const textoAdecuacionVisible = estrategiaAdecuacion?.aplica && estrategiaAdecuacion?.textoVisible
    ? String(estrategiaAdecuacion.textoVisible)
    : "";
  const estrategiasLimpias = asegurarMomento1Primero(limpiarEstrategiasMediacion(estrategiasBase), {
    habilidades: aprendizajes,
    tema: resultado?.nombre
  });
  const estrategias = textoAdecuacionVisible && !estrategiasLimpias.some((item: string) => normalizarParaBusqueda(item).includes("adecuacion significativa"))
    ? asegurarMomento1Primero([...estrategiasLimpias, textoAdecuacionVisible], {
      habilidades: aprendizajes,
      tema: resultado?.nombre
    })
    : estrategiasLimpias;
  const indicadores = splitLines(resultado?.indicadoresEvaluacion).length
    ? splitLines(resultado?.indicadoresEvaluacion).map(limpiarPrefijoIndicador).filter(Boolean)
    : indicadoresFallback.map(limpiarPrefijoIndicador).filter(Boolean);
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
  try {
    const institucionId = getInstitutionId(req, res);
    if (institucionId === null) return;

    const planeamientoId = toRequiredInt(req.params.id, "planeamientoId", res);
    if (planeamientoId === null) return;

    const resultado = normalizarSeleccionesPlaneamientoResultado(
      hydratePlantillaFormatoDocx(req.body.resultado || {})
    );
    const fechaInicio = normalizeNullableText(req.body.fechaInicio);
    const fechaFin = normalizeNullableText(req.body.fechaFin);
    const observaciones = normalizeNullableText(req.body.observaciones || "");

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
      return res.status(403).json({ ok: false, message: "No tenés permisos para editar este planeamiento" });
    }
    const planeamientoRow = lookup.recordset[0];
    if (Number(planeamientoRow.InstitucionId) !== Number(institucionId)) {
      return res.status(403).json({ ok: false, message: "No tenés permisos para editar este planeamiento" });
    }

    const anioLectivoId = Number(planeamientoRow.AnioLectivoId);
    const periodoId = Number(planeamientoRow.PeriodoId);
    const grupoId = Number(planeamientoRow.GrupoId);
    const materiaId = Number(planeamientoRow.MateriaId);

    const asignacion = await ensurePlaneamientoAsignacion(req, res, pool, { grupoId, materiaId, anioLectivoId, periodoId });
    if (asignacion === false) return;

    const materiaNombreOficial = await getMateriaNombreOficial(pool, institucionId, materiaId);
    const nombre = buildPlaneamientoNombre({
      mes: req.body.mes || resultado.mes || resultado.Mes || req.body.mesPlaneamiento,
      grado: req.body.grado || resultado.grado || resultado.Grado || req.body.gradoPlaneamiento,
      materiaNombre: materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || req.body.materiaNombrePlaneamiento
    }) || normalizeText(req.body.nombre || resultado.nombre || "Planeamiento generado con IA");

    resultado.nombre = nombre;
    resultado.materiaNombre = materiaNombreOficial || req.body.materiaNombre || resultado.materiaNombre || resultado.MateriaNombre || "";
    resultado.MateriaNombre = resultado.materiaNombre;

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
              UpdatedAt = SYSDATETIME()
          WHERE PlaneamientoId = @planeamientoId
        `);

      await new sql.Request(transaction)
        .input("planeamientoId", sql.Int, planeamientoId)
        .query(`
          UPDATE dbo.PlaneamientoIndicador
          SET Activo = 0, UpdatedAt = SYSDATETIME()
          WHERE PlaneamientoId = @planeamientoId
        `);

      const indicadores = splitLines(resultado.indicadoresEvaluacion);

      for (const indicador of indicadores) {
        const text = normalizeText(indicador);
        if (!text) continue;
        await new sql.Request(transaction)
          .input("planeamientoId", sql.Int, planeamientoId)
          .input("descripcion", sql.NVarChar(sql.MAX), text)
          .query(`
            INSERT INTO dbo.PlaneamientoIndicador
              (PlaneamientoId, Descripcion, NivelDesempenoId, Activo, CreatedAt)
            VALUES
              (@planeamientoId, @descripcion, NULL, 1, SYSDATETIME())
          `);
      }

      await transaction.commit();
      ok(res, { planeamientoId }, "Planeamiento actualizado correctamente");
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error actualizando planeamiento generado con IA:", error);
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
                  ? contenido.indicadores.map((item: string) => simpleParagraph(limpiarPrefijoIndicador(item), { size: 19 }))
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
