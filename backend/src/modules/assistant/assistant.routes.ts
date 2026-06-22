import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.middleware";
import { getPool, sql } from "../../config/database";
import { badRequest, ok } from "../../utils/http";

const router = Router();

router.use(requireAuth);
router.use(requireRoles("SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"));

function getAuth(req: any) {
  return req.auth || {};
}

function getUserId(req: any) {
  const auth = getAuth(req);
  return Number(auth.userId || auth.usuarioId || 0);
}

function hasRole(req: any, role: string) {
  return Array.isArray(getAuth(req).roles) && getAuth(req).roles.includes(role);
}

function isSuperAdmin(req: any) {
  return hasRole(req, "SUPER_ADMIN");
}

function isProfesor(req: any) {
  return hasRole(req, "PROFESOR") || hasRole(req, "PROFESOR_GUIA");
}

function canManageAssistant(req: any) {
  return hasRole(req, "SUPER_ADMIN") || hasRole(req, "ADMIN_INSTITUCIONAL") || hasRole(req, "ADMINISTRATIVO");
}

type AssistantAdminInstruction = {
  id: number;
  institucionId: number | null;
  title: string;
  category: string;
  instruction: string;
  order: number;
  active: boolean;
};

function getInstitutionId(req: any, res: any) {
  const institucionId = getAuth(req).institucionId;
  if (institucionId === null || institucionId === undefined || Number.isNaN(Number(institucionId))) {
    badRequest(res, "El usuario no tiene institución asignada");
    return null;
  }
  return Number(institucionId);
}

function normalizeText(value: any) {
  return String(value ?? "").trim();
}

function sanitizeAssistantReply(value: any) {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const dedupedLines: string[] = [];
  let lastComparable = "";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const comparable = line.trim().toUpperCase();

    if (comparable && comparable === lastComparable) continue;

    dedupedLines.push(line);
    lastComparable = comparable || "";
  }

  return dedupedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeLike(value: any) {
  return `%${normalizeText(value)}%`;
}

function normalizeTextArray(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

async function loadAssistantAdminInstructions(pool: any, req: any, includeInactive = false): Promise<AssistantAdminInstruction[]> {
  const institucionId = isSuperAdmin(req) ? null : Number(getAuth(req).institucionId || 0);
  const request = pool.request();
  if (institucionId !== null) {
    request.input("institucionId", sql.Int, institucionId);
  }
  request.input("includeInactive", sql.Bit, includeInactive ? 1 : 0);

  const result = await request.query(`
    IF OBJECT_ID('dbo.AsistenteIndicacionAdmin', 'U') IS NULL
    BEGIN
      SELECT
        CAST(NULL AS int) AS AsistenteIndicacionAdminId,
        CAST(NULL AS int) AS InstitucionId,
        CAST(NULL AS nvarchar(150)) AS Titulo,
        CAST(NULL AS nvarchar(60)) AS Categoria,
        CAST(NULL AS nvarchar(max)) AS Instruccion,
        CAST(NULL AS int) AS OrdenVisual,
        CAST(NULL AS bit) AS Activo
      WHERE 1 = 0;
    END
    ELSE
    BEGIN
      SELECT
        AsistenteIndicacionAdminId,
        InstitucionId,
        Titulo,
        Categoria,
        Instruccion,
        OrdenVisual,
        Activo
      FROM dbo.AsistenteIndicacionAdmin
      WHERE (@includeInactive = 1 OR Activo = 1)
        AND (
          ${institucionId === null ? "1 = 1" : "InstitucionId IS NULL OR InstitucionId = @institucionId"}
        )
      ORDER BY
        CASE WHEN InstitucionId IS NULL THEN 0 ELSE 1 END,
        OrdenVisual,
        Titulo;
    END
  `);

  return (result.recordset || []).map((row: any) => ({
    id: Number(row.AsistenteIndicacionAdminId || 0),
    institucionId: row.InstitucionId === null || row.InstitucionId === undefined ? null : Number(row.InstitucionId),
    title: String(row.Titulo || "").trim(),
    category: String(row.Categoria || "GENERAL").trim(),
    instruction: String(row.Instruccion || "").trim(),
    order: Number(row.OrdenVisual || 0),
    active: Boolean(row.Activo)
  })).filter((item: AssistantAdminInstruction) => item.id > 0 && item.instruction);
}

function extractLookupTerm(question: string) {
  const text = normalizeText(question);
  const idMatch = text.match(/\b\d{5,20}\b/);
  if (idMatch) return idMatch[0];

  const alumnoMatch = text.match(/(?:alumno|estudiante|seccion|sección|grupo|materia)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\- ]{3,60})/i);
  if (alumnoMatch?.[1]) return alumnoMatch[1].trim();

  const cleaned = text
    .replace(/[¿?.,;:!]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 5)
    .join(" ");

  return cleaned || text;
}

function detectIntent(question: string) {
  const key = normalizeText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (/(PLANEAMIENTO|PLANEAR|PLANIFICAR|INDICADOR|INDICADORES|HABILIDAD|HABILIDADES|COMPETENCIA)/.test(key)) return "PLANEAMIENTO";
  if (/(HORARIO|LECCION|LECCIONES|BLOQUE|BLOQUES)/.test(key)) return "HORARIOS";
  if (/(NOTA|NOTAS|CALIFICACION|CALIFICACIONES|PROMEDIO|EXAMEN|EXAMENES|COTIDIANO|TAREA|TAREAS)/.test(key)) return "NOTAS";
  if (/(ASISTENCIA|AUSENCIA|TARDIA)/.test(key)) return "ASISTENCIA";
  if (/(ESTUDIANTE|ALUMNO|CEDULA|IDENTIFICACION)/.test(key)) return "ESTUDIANTES";
  if (/(GRUPO|SECCION|SECCIONES)/.test(key)) return "GRUPOS";
  if (/(REPORTE|REPORTES)/.test(key)) return "REPORTES";
  return "GENERAL";
}

function extractStudentId(question: string) {
  return normalizeText(question).match(/\b\d{5,20}\b/)?.[0] || null;
}

function extractSectionName(question: string) {
  const match = normalizeText(question).match(/\b\d{1,2}\s*-\s*\d{1,2}\b/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function isGreetingOnly(question: string) {
  const key = normalizeText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["HOLA", "BUENAS", "BUEN DIA", "BUEN DIA", "BUENAS TARDES", "BUENAS NOCHES", "HEY", "HOLI"].includes(key);
}

function isThanksOnly(question: string) {
  const key = normalizeText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["GRACIAS", "MUCHAS GRACIAS", "OK GRACIAS", "LISTO GRACIAS", "PERFECTO GRACIAS"].includes(key);
}

function isGoodbyeOnly(question: string) {
  const key = normalizeText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["ADIOS", "CHAO", "HASTA LUEGO", "NOS VEMOS", "BYE", "HASTA MANANA"].includes(key);
}

function looksLikePersonName(question: string) {
  const text = normalizeText(question);
  if (!text || /\d/.test(text)) return false;
  if (text.length > 40) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  const upper = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (["HOLA", "BUENAS", "HEY", "HOLI"].includes(upper)) return false;
  return words.every((word) => /^[A-Za-zÁÉÍÓÚáéíóúÑñ'-]+$/.test(word));
}

function formatStudentName(row: any) {
  return String(row?.Estudiante || row?.Nombre || "").trim();
}

function isPlaneamientoHelpQuestion(question: string, currentPath?: string) {
  const key = normalizeText(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const path = normalizeText(currentPath).toLowerCase();
  const asksHowTo = /(COMO|COMO HAGO|PASOS|PASO A PASO|QUE DEBO|QUE TENGO|AYUDA|GUIA|GUIAME|GENERAR)/.test(key);
  const mentionsPlaneamiento = /(PLANEAMIENTO|PLANEAR|PLANIFICAR|INDICADOR|INDICADORES|HABILIDAD|HABILIDADES|COMPETENCIA)/.test(key);
  return (mentionsPlaneamiento && asksHowTo)
    || ((path.includes("/gestion-profe") || path.includes("/planeamiento-ia")) && /(PLANEAMIENTO|INDICADOR|HABILIDAD)/.test(key));
}

function buildPlaneamientoGuideReply(greetingName: string, currentPath?: string) {
  const intro = greetingName
    ? `Hola ${greetingName}.`
    : "Hola.";

  if (String(currentPath || "").toLowerCase().includes("/gestion-profe")) {
    return `${intro} Para hacer un planeamiento desde Gestion del Profe, seguí estos pasos:

1. Entrá a tu grupo y materia.
2. Abrí el boton "Planeamiento e Indicadores".
3. En "Secciones", elegí una o varias secciones.
4. En "Plantilla IA", escogé una plantilla o dejá la institucional activa.
5. Seleccioná el "Mes o meses".
6. Elegí la "Periodicidad".
7. Escribí la "Competencia general".
8. En "Seleccioná las habilidades", marcá las habilidades que querés trabajar.
9. Presioná "Generar planeamiento con IA".
10. Revisá el resultado generado.
11. Si todo está bien, guardalo con "Guardar planeamiento".

Si querés, ahora te lo explico campo por campo dentro de esa misma pantalla.`;
  }

  return `${intro} Para generar un planeamiento con IA, seguí estos pasos:

1. Seleccioná la plantilla IA si querés una estructura específica.
2. Elegí materia, grado o secciones según la pantalla.
3. Seleccioná el mes o meses.
4. Definí la periodicidad.
5. Escribí la competencia general.
6. Marcá las habilidades que se van a trabajar.
7. Presioná "Generar planeamiento con IA".
8. Revisá el borrador.
9. Guardalo como planeamiento si el resultado te sirve.

Si querés, te lo adapto exactamente al modulo donde estás parado.`;
}

function buildModuleFallback(currentPath?: string) {
  const path = normalizeText(currentPath).toLowerCase();
  if (path.includes("/gestion-profe")) {
    return "Puedo guiarte con el uso de Gestion del Profe: planeamientos, indicadores, seguimiento diario, notas, asistencia y reportes. Decime que querés hacer y te lo explico paso a paso.";
  }
  if (path.includes("/planeamiento-ia")) {
    return "Puedo guiarte con el modulo de Planeamiento con IA: seleccion de plantilla, habilidades, generacion y guardado del planeamiento. Decime que paso necesitás hacer.";
  }
  return "Puedo ayudarte con el uso de los modulos de PROFE360 y tambien con consultas de estudiantes, grupos, horarios, notas, asistencia y reportes. Decime que necesitás hacer y te guio paso a paso.";
}

type ModuleGuide = {
  key: string;
  title: string;
  path: string;
  allowedRoles?: string[];
  aliases: string[];
  summary: string;
  steps: string[];
};

type ActionPattern = {
  guideKey: string;
  phrases: string[];
};

type DetailGuide = {
  moduleKey: string;
  detailKey: string;
  title: string;
  routePrefix: string;
  allowedRoles?: string[];
  aliases: string[];
  summary: string;
  steps: string[];
  validations: string[];
  commonErrors: string[];
  correctiveActions: string[];
};

type AssistantKnowledgeCache = {
  expiresAt: number;
  guides: ModuleGuide[];
  actions: ActionPattern[];
  detailGuides: DetailGuide[];
  conversationPatterns: ConversationPattern[];
  exampleQuestions: ExampleQuestion[];
  screenContexts: ScreenContext[];
  formGuides: FormGuide[];
  subflowContexts: SubflowContext[];
  faqs: AssistantFaq[];
};

type AssistantScreenSnapshot = {
  routeLabel?: string;
  documentTitle?: string;
  headings?: string[];
  buttons?: string[];
  labels?: string[];
};

type AssistantSuggestedAction = {
  label: string;
  type: "navigate" | "ask";
  target: string;
};

type ConversationPattern = {
  patternKey: string;
  phrases: string[];
};

type ExampleQuestion = {
  moduleKey: string;
  detailKey?: string | null;
  phrases: string[];
};

type ScreenContext = {
  routePrefix: string;
  moduleKey: string;
  title: string;
  summary: string;
  hints: string[];
  exampleQuestions: string[];
};

type FormGuideField = {
  fieldName: string;
  required: boolean;
  hint: string;
  order: number;
};

type FormGuide = {
  routePrefix: string;
  moduleKey: string;
  formKey: string;
  title: string;
  summary: string;
  aliases: string[];
  fields: FormGuideField[];
};

type SubflowContext = {
  routePrefix: string;
  moduleKey: string;
  subflowKey: string;
  title: string;
  summary: string;
  aliases: string[];
  hints: string[];
  exampleQuestions: string[];
};

type AssistantFaq = {
  faqKey: string;
  moduleKey: string;
  routePrefix: string;
  title: string;
  summary: string;
  answer: string;
  kind: string;
  allowedRoles?: string[];
  questionPatterns: string[];
  steps: string[];
};

const DEFAULT_MODULE_GUIDES: ModuleGuide[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    path: "/",
    aliases: ["dashboard", "inicio", "panel principal"],
    summary: "Te sirve para ubicarte rapido en la plataforma y entrar al modulo que necesitas.",
    steps: [
      "Entra al sistema con tu usuario y clave.",
      "Revisa los accesos visibles en el menu izquierdo.",
      "Elige el modulo que quieres trabajar.",
      "Si no ves un modulo, normalmente es por permisos del rol."
    ]
  },
  {
    key: "instituciones",
    title: "Instituciones",
    path: "/instituciones",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"],
    aliases: ["instituciones", "institucion", "nueva institucion", "crear institucion"],
    summary: "Permite crear, editar y mantener la informacion base de la institucion.",
    steps: [
      "Entra a Instituciones.",
      "Presiona el boton para crear una nueva institucion o editar una existente.",
      "Completa los datos generales de la institucion.",
      "Guarda los cambios.",
      "Verifica que la institucion quede disponible para los procesos relacionados."
    ]
  },
  {
    key: "administrativo",
    title: "Administrativo",
    path: "/administrativo",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"],
    aliases: ["administrativo", "academico", "area administrativa"],
    summary: "Es el modulo base para configurar anos, periodos, grupos, materias, asignaciones, bloques y horarios.",
    steps: [
      "Configura primero Ano Lectivo y Periodos.",
      "Luego crea los Grupos o secciones.",
      "Despues registra Materias y Habilidades de planeamiento si aplica.",
      "Asigna docentes a grupo y materia.",
      "Crea Bloques Horarios y luego Horario de clases.",
      "Usa Fechas de clase, Dias lectivos y Feriados para completar la operacion academica."
    ]
  },
  {
    key: "usuarios",
    title: "Usuarios",
    path: "/usuarios",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"],
    aliases: ["usuarios", "roles", "personal"],
    summary: "Sirve para crear usuarios, asignar roles y mantener accesos.",
    steps: [
      "Entra a Usuarios.",
      "Busca si la persona ya existe.",
      "Si no existe, crea el usuario con correo y datos basicos.",
      "Asignale el rol correcto.",
      "Guarda y confirma que la persona pueda ingresar."
    ]
  },
  {
    key: "estudiantes",
    title: "Estudiantes",
    path: "/estudiantes",
    aliases: ["estudiantes", "alumnos", "estudiante", "alumno"],
    summary: "Permite registrar, editar y consultar la informacion del estudiante.",
    steps: [
      "Abri Estudiantes.",
      "Busca por nombre, apellido o cedula.",
      "Si necesitas crear uno nuevo, completa los datos personales.",
      "Guarda el registro.",
      "Luego segui con Matricula si el estudiante debe quedar en una seccion."
    ]
  },
  {
    key: "matricula",
    title: "Matricula",
    path: "/matricula",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"],
    aliases: ["matricula", "matricular", "traslado de seccion", "cambio de seccion"],
    summary: "Sirve para ingresar al estudiante en un grupo y manejar cambios de seccion.",
    steps: [
      "Entra a Matricula.",
      "Busca el estudiante o crealo primero si hace falta.",
      "Elige ano lectivo, grupo y datos de matricula.",
      "Guarda la matricula.",
      "Si es traslado, verifica la seccion origen y destino antes de guardar.",
      "Luego revisa notas y reportes si el cambio afecta evaluaciones."
    ]
  },
  {
    key: "parametrizaciones",
    title: "Parametrizaciones",
    path: "/parametrizaciones",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"],
    aliases: ["parametrizaciones", "evaluaciones", "configuracion ia", "promt ia", "plantillas"],
    summary: "Te permite configurar plantillas, niveles, rubros y opciones base de evaluacion e IA.",
    steps: [
      "Entra a Parametrizaciones.",
      "Elige si vas a trabajar Evaluaciones o Configuracion IA.",
      "En Evaluaciones, configura rubros, porcentajes y estructuras.",
      "En Configuracion IA, ajusta plantillas o prompts visibles.",
      "Guarda los cambios y luego pruebalo en el modulo que los usa."
    ]
  },
  {
    key: "horarios",
    title: "Horarios",
    path: "/horarios",
    aliases: ["horarios", "horario", "consulta de horarios"],
    summary: "Se usa para consultar horarios por seccion, estudiante o profesor.",
    steps: [
      "Entra al modulo Horarios.",
      "Elige el criterio de consulta disponible.",
      "Busca por seccion, profesor o estudiante.",
      "Revisa la informacion mostrada por dia y bloque."
    ]
  },
  {
    key: "asistencia",
    title: "Asistencia",
    path: "/asistencia",
    aliases: ["asistencia", "ausencias", "tardias"],
    summary: "Permite revisar o registrar asistencia segun el flujo habilitado para tu rol.",
    steps: [
      "Entra al modulo Asistencia.",
      "Elige grupo, materia o filtro solicitado.",
      "Marca el estado del estudiante.",
      "Guarda la sesion o el registro.",
      "Luego revisa el reporte si necesitas validar resultados."
    ]
  },
  {
    key: "seguimiento-notas",
    title: "Seguimiento de Notas",
    path: "/seguimiento-notas",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"],
    aliases: ["seguimiento notas", "seguimiento de notas", "indicadores por estudiante"],
    summary: "Sirve para seguir indicadores y resumenes puntuales por estudiante.",
    steps: [
      "Entra a Seguimiento de Notas.",
      "Selecciona grupo, componente y estudiante.",
      "Si el rubro usa indicadores, elige el planeamiento.",
      "Carga los indicadores o revisa los ya guardados.",
      "Guarda los cambios y revisa el resumen."
    ]
  },
  {
    key: "gestion-profe",
    title: "Gestion del Profe",
    path: "/gestion-profe",
    allowedRoles: ["PROFESOR"],
    aliases: ["gestion del profe", "modulo del profe", "registro de notas", "seguimiento diario"],
    summary: "Es el modulo principal del docente para trabajar grupos, asistencia, notas, planeamientos y reportes.",
    steps: [
      "Entra a Gestion del Profe.",
      "Elige el grupo y la materia.",
      "Abre el panel que necesitas: Asistencia, Registro de notas, Seguimiento diario, Planeamiento e Indicadores o Reportes.",
      "Realiza la accion del panel.",
      "Guarda y luego valida el resultado en reportes si aplica."
    ]
  },
  {
    key: "planeamiento-ia",
    title: "Planeamiento con IA",
    path: "/planeamiento-ia",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR", "PROFESOR_GUIA"],
    aliases: ["planeamiento ia", "ia para planeamientos", "generar planeamiento"],
    summary: "Permite generar un borrador de planeamiento con apoyo de IA y luego guardarlo.",
    steps: [
      "Entra a Planeamiento con IA.",
      "Elige plantilla, materia, grado o secciones segun la pantalla.",
      "Selecciona mes o meses.",
      "Define la periodicidad.",
      "Indica la competencia general.",
      "Marca las habilidades.",
      "Genera el planeamiento con IA.",
      "Revisa el resultado y guardalo."
    ]
  },
  {
    key: "reportes",
    title: "Reportes",
    path: "/reportes",
    allowedRoles: ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO", "PROFESOR_GUIA"],
    aliases: ["reportes", "certificaciones", "reporte de asistencia", "reporte de notas"],
    summary: "Te ayuda a consultar reportes institucionales, de asistencia y otras salidas disponibles.",
    steps: [
      "Entra a Reportes.",
      "Elige el tipo de reporte.",
      "Completa filtros como grupo, periodo, estudiante o fecha.",
      "Genera el reporte.",
      "Revisa si quieres exportar o imprimir."
    ]
  }
];

const DEFAULT_SCREEN_CONTEXTS: ScreenContext[] = [
  {
    routePrefix: "/instituciones",
    moduleKey: "instituciones",
    title: "Instituciones",
    summary: "Aquí podés crear, editar o ubicar instituciones activas.",
    hints: [
      "Usá 'Agregar institución' si vas a registrar una nueva.",
      "Si ya existe, primero buscala antes de duplicarla."
    ],
    exampleQuestions: [
      "cómo creo una institución",
      "cómo edito una institución",
      "qué campos debo llenar aquí"
    ]
  },
  {
    routePrefix: "/usuarios",
    moduleKey: "usuarios",
    title: "Usuarios",
    summary: "Aquí podés crear usuarios, importar desde Excel y gestionar accesos.",
    hints: [
      "Si la persona ya existe, buscala primero por correo, nombre o cédula.",
      "La clave inicial suele quedar como el número de cédula."
    ],
    exampleQuestions: [
      "cómo creo un usuario",
      "cómo restablezco una clave",
      "cómo importo usuarios"
    ]
  },
  {
    routePrefix: "/administrativo",
    moduleKey: "administrativo",
    title: "Administrativo",
    summary: "Aquí están las pestañas base de operación académica: años, periodos, grupos, materias, asignaciones y horarios.",
    hints: [
      "Lo normal es avanzar de izquierda a derecha según el flujo.",
      "Si me decís la pestaña, te la explico paso a paso."
    ],
    exampleQuestions: [
      "qué hay en administrativo",
      "cómo creo un grupo",
      "cómo hago el horario de clases"
    ]
  },
  {
    routePrefix: "/matricula",
    moduleKey: "matricula",
    title: "Matrícula",
    summary: "Aquí podés crear matrículas, mover estudiantes de sección y revisar boletas.",
    hints: [
      "El estudiante debe existir antes de matricularlo.",
      "Si es un traslado, revisá bien sección origen y destino."
    ],
    exampleQuestions: [
      "cómo matriculo un alumno",
      "cómo cambio un alumno de sección",
      "cómo importo matrículas"
    ]
  },
  {
    routePrefix: "/parametrizaciones/evaluaciones",
    moduleKey: "parametrizaciones",
    title: "Parametrizaciones - Evaluaciones",
    summary: "Aquí configurás plantillas, rubros, actividades y niveles de desempeño.",
    hints: [
      "Primero crea o abre una plantilla.",
      "Luego agrega rubros y actividades con sus porcentajes."
    ],
    exampleQuestions: [
      "cómo creo una plantilla de evaluación",
      "cómo agrego un rubro",
      "cómo activo indicadores"
    ]
  },
  {
    routePrefix: "/parametrizaciones/promt-ia",
    moduleKey: "parametrizaciones",
    title: "Parametrizaciones - Promt IA",
    summary: "Aquí creás y ajustás plantillas de Promt IA para otros módulos.",
    hints: [
      "Podés crear una nueva o copiar una base existente.",
      "Conviene validar luego el resultado en Planeamiento o Evaluaciones."
    ],
    exampleQuestions: [
      "cómo creo una plantilla de promt ia",
      "cómo copio una plantilla ia",
      "qué debo llenar aquí"
    ]
  },
  {
    routePrefix: "/estudiantes",
    moduleKey: "estudiantes",
    title: "Estudiantes",
    summary: "Aquí podés registrar, buscar, editar y revisar detalle de estudiantes.",
    hints: [
      "Si querés ubicar uno, usá primero el buscador.",
      "Si luego debe quedar en grupo, seguí con Matrícula."
    ],
    exampleQuestions: [
      "cómo registro un estudiante",
      "cómo busco un alumno",
      "cómo genero una boleta de conducta"
    ]
  },
  {
    routePrefix: "/horarios",
    moduleKey: "horarios",
    title: "Horarios",
    summary: "Aquí podés ver tu horario, tus grupos guía o hacer consulta administrativa.",
    hints: [
      "Elegí la pestaña según si buscás docente, sección o estudiante.",
      "Para consultas administrativas, completá primero los filtros generales."
    ],
    exampleQuestions: [
      "cómo veo mi horario",
      "cómo busco el horario de una sección",
      "cómo consulto el horario de un estudiante"
    ]
  },
  {
    routePrefix: "/asistencia",
    moduleKey: "asistencia",
    title: "Asistencia",
    summary: "Aquí buscás clases programadas y luego tomás o editás la asistencia.",
    hints: [
      "Primero buscá la clase.",
      "Después usá 'Tomar lista' o 'Ver / editar'."
    ],
    exampleQuestions: [
      "cómo paso asistencia",
      "por qué no me salen clases programadas",
      "cómo edito una asistencia guardada"
    ]
  },
  {
    routePrefix: "/seguimiento-notas",
    moduleKey: "seguimiento-notas",
    title: "Seguimiento de Notas",
    summary: "Aquí registrás seguimiento por estudiante y revisás el consolidado.",
    hints: [
      "Seleccioná estudiante y componente antes de guardar.",
      "Después revisá el resultado del registro y el consolidado."
    ],
    exampleQuestions: [
      "cómo guardo seguimiento",
      "cómo guardo un examen",
      "cómo reviso el consolidado del estudiante"
    ]
  },
  {
    routePrefix: "/gestion-profe",
    moduleKey: "gestion-profe",
    title: "Gestión del Profe",
    summary: "Aquí trabajás asistencia, notas, seguimiento diario, planeamiento y reportes del grupo.",
    hints: [
      "Primero elegí grupo y materia.",
      "Después abrí el panel específico que querés trabajar."
    ],
    exampleQuestions: [
      "cómo califico tareas",
      "cómo hago un planeamiento",
      "cómo saco reportes del grupo"
    ]
  },
  {
    routePrefix: "/planeamiento-ia",
    moduleKey: "planeamiento-ia",
    title: "Planeamiento con IA",
    summary: "Aquí administrás habilidades y generás o guardás planeamientos con IA.",
    hints: [
      "Podés crear habilidades o importarlas desde Excel.",
      "Luego generás el borrador y lo guardás en Gestión del Profe."
    ],
    exampleQuestions: [
      "cómo creo una habilidad",
      "cómo genero un planeamiento con ia",
      "cómo guardo el planeamiento"
    ]
  },
  {
    routePrefix: "/reportes",
    moduleKey: "reportes",
    title: "Reportes",
    summary: "Aquí consultás reportes y generás certificaciones o constancias.",
    hints: [
      "Elegí primero el tipo de reporte.",
      "Completá la sección y filtros antes de consultar."
    ],
    exampleQuestions: [
      "cómo saco un reporte de notas",
      "cómo exporto a pdf",
      "cómo genero una constancia de estudio"
    ]
  }
];

const DEFAULT_FORM_GUIDES: FormGuide[] = [
  {
    routePrefix: "/usuarios",
    moduleKey: "usuarios",
    formKey: "usuario-principal",
    title: "Formulario de usuario",
    summary: "Este formulario sirve para crear o editar accesos del sistema.",
    aliases: ["usuario", "crear usuario", "editar usuario", "formulario de usuario"],
    fields: [
      { fieldName: "Institución", required: true, hint: "Elegila primero si tu rol puede administrarla.", order: 1 },
      { fieldName: "Nombre", required: true, hint: "Poné el nombre real de la persona.", order: 2 },
      { fieldName: "Correo", required: true, hint: "Debe quedar correcto porque se usa para ingreso y avisos.", order: 3 },
      { fieldName: "Cédula", required: true, hint: "También funciona como clave inicial del usuario nuevo.", order: 4 },
      { fieldName: "Rol", required: true, hint: "Elegilo según el acceso que realmente necesita.", order: 5 }
    ]
  },
  {
    routePrefix: "/instituciones",
    moduleKey: "instituciones",
    formKey: "institucion-principal",
    title: "Formulario de institución",
    summary: "Este formulario registra o ajusta la información base del colegio.",
    aliases: ["institucion", "crear institucion", "editar institucion"],
    fields: [
      { fieldName: "Nombre", required: true, hint: "Usá el nombre principal del colegio.", order: 1 },
      { fieldName: "Nombre comercial", required: false, hint: "Completalo si la institución maneja una variante visible.", order: 2 },
      { fieldName: "Nombre oficial para boleta", required: false, hint: "Ayuda para documentos formales y boletas.", order: 3 },
      { fieldName: "Correo", required: false, hint: "Conviene dejar un correo institucional válido.", order: 4 }
    ]
  },
  {
    routePrefix: "/estudiantes",
    moduleKey: "estudiantes",
    formKey: "estudiante-principal",
    title: "Formulario de estudiante",
    summary: "Este formulario registra la ficha principal del alumno.",
    aliases: ["estudiante", "registrar estudiante", "agregar estudiante"],
    fields: [
      { fieldName: "Identificación", required: true, hint: "Es la base del registro y no debe duplicarse.", order: 1 },
      { fieldName: "Nombre", required: true, hint: "Completá nombre y apellidos como aparecen oficialmente.", order: 2 },
      { fieldName: "Fecha de nacimiento", required: true, hint: "Ayuda a validar edad y documentos.", order: 3 },
      { fieldName: "Correo", required: false, hint: "Si existe, sirve para comunicación y acceso.", order: 4 },
      { fieldName: "Tipo de estudiante", required: false, hint: "Elegilo si la institución ya lo usa para clasificar.", order: 5 }
    ]
  },
  {
    routePrefix: "/matricula",
    moduleKey: "matricula",
    formKey: "matricula-principal",
    title: "Formulario de matrícula",
    summary: "Este formulario inscribe al estudiante en un grupo.",
    aliases: ["matricula", "crear matricula", "formulario de matricula"],
    fields: [
      { fieldName: "Estudiante", required: true, hint: "Debe existir antes de abrir esta matrícula.", order: 1 },
      { fieldName: "Año lectivo", required: true, hint: "Elegilo antes del grupo para no mezclar periodos.", order: 2 },
      { fieldName: "Grupo", required: true, hint: "Seleccioná la sección destino correcta.", order: 3 },
      { fieldName: "Fecha matrícula", required: true, hint: "Usá la fecha real del movimiento.", order: 4 },
      { fieldName: "Tipo matrícula", required: false, hint: "Completalo si la institución clasifica el ingreso.", order: 5 }
    ]
  },
  {
    routePrefix: "/parametrizaciones/evaluaciones",
    moduleKey: "parametrizaciones",
    formKey: "plantilla-evaluacion",
    title: "Formulario de plantilla de evaluación",
    summary: "Este formulario crea la base de rubros y actividades.",
    aliases: ["plantilla", "plantilla de evaluacion", "evaluaciones"],
    fields: [
      { fieldName: "Nombre", required: true, hint: "Poné un nombre que identifique ciclo, periodo o nivel.", order: 1 },
      { fieldName: "Año lectivo", required: true, hint: "Elegilo antes del período.", order: 2 },
      { fieldName: "Periodo", required: true, hint: "Debe corresponder al año lectivo seleccionado.", order: 3 },
      { fieldName: "Materia", required: true, hint: "La estructura queda ligada a esta materia.", order: 4 },
      { fieldName: "Decimales de nota", required: false, hint: "Ajustalo según la política institucional.", order: 5 }
    ]
  },
  {
    routePrefix: "/planeamiento-ia",
    moduleKey: "planeamiento-ia",
    formKey: "generador-planeamiento",
    title: "Formulario de generar planeamiento con IA",
    summary: "Este formulario prepara el contexto antes de generar el borrador.",
    aliases: ["planeamiento", "generar planeamiento", "plantilla ia"],
    fields: [
      { fieldName: "Plantilla IA", required: false, hint: "Si hay una institucional buena, podés reutilizarla.", order: 1 },
      { fieldName: "Habilidades", required: true, hint: "Debés marcar al menos una.", order: 2 },
      { fieldName: "Mes", required: true, hint: "Elegí el periodo del plan que querés generar.", order: 3 },
      { fieldName: "Periodicidad", required: true, hint: "Define el ritmo del planeamiento.", order: 4 },
      { fieldName: "Competencia general", required: true, hint: "Escribila clara porque guía la salida.", order: 5 }
    ]
  }
];

const DEFAULT_SUBFLOW_CONTEXTS: SubflowContext[] = [
  {
    routePrefix: "/usuarios",
    moduleKey: "usuarios",
    subflowKey: "crear-usuario",
    title: "crear usuario",
    summary: "Parece que estás en el flujo de crear o editar un usuario.",
    aliases: ["crear usuario", "agregar usuario", "editar usuario", "nuevo usuario"],
    hints: ["Primero revisá si la persona ya existe.", "Después completá institución, nombre, correo, cédula y rol."],
    exampleQuestions: ["qué lleno primero aquí", "qué rol le pongo", "cómo restablezco la clave"]
  },
  {
    routePrefix: "/usuarios",
    moduleKey: "usuarios",
    subflowKey: "importar-usuarios",
    title: "importar usuarios",
    summary: "Parece que estás en el flujo de importación de usuarios.",
    aliases: ["importar usuarios", "excel usuarios", "plantilla de usuarios"],
    hints: ["Descargá primero la plantilla.", "Luego cargá el Excel y ejecutá la importación."],
    exampleQuestions: ["cómo importo usuarios", "qué columnas necesita el excel"]
  },
  {
    routePrefix: "/instituciones",
    moduleKey: "instituciones",
    subflowKey: "crear-institucion",
    title: "crear institución",
    summary: "Parece que estás trabajando el alta o edición de una institución.",
    aliases: ["crear institucion", "agregar institucion", "editar institucion"],
    hints: ["Completá primero el nombre principal.", "Luego afiná nombres visibles y datos de contacto."],
    exampleQuestions: ["qué campos son requeridos", "cómo se llama el colegio"]
  },
  {
    routePrefix: "/matricula",
    moduleKey: "matricula",
    subflowKey: "crear-matricula",
    title: "crear matrícula",
    summary: "Parece que estás creando o editando una matrícula.",
    aliases: ["crear matricula", "editar matricula", "matricular alumno"],
    hints: ["Elegí primero el estudiante.", "Después seleccioná año lectivo y grupo destino."],
    exampleQuestions: ["qué lleno primero aquí", "cómo matriculo un alumno"]
  },
  {
    routePrefix: "/matricula",
    moduleKey: "matricula",
    subflowKey: "importar-matriculas",
    title: "importar matrículas",
    summary: "Parece que estás en el flujo de importación de matrículas.",
    aliases: ["importar matriculas", "excel matriculas", "plantilla de matriculas"],
    hints: ["Seleccioná el año lectivo antes del archivo.", "Revisá luego el resumen de creadas, reactivadas y errores."],
    exampleQuestions: ["cómo importo matrículas", "por qué omitió filas"]
  },
  {
    routePrefix: "/estudiantes",
    moduleKey: "estudiantes",
    subflowKey: "crear-estudiante",
    title: "registrar estudiante",
    summary: "Parece que estás llenando el formulario principal del estudiante.",
    aliases: ["agregar estudiante", "registrar estudiante", "editar estudiante"],
    hints: ["Empezá por identificación y nombre.", "Si luego debe entrar a grupo, seguí con matrícula."],
    exampleQuestions: ["qué pongo aquí", "qué campos son requeridos"]
  },
  {
    routePrefix: "/estudiantes",
    moduleKey: "estudiantes",
    subflowKey: "boleta-conducta",
    title: "generar boleta de conducta",
    summary: "Parece que estás en el flujo de boleta de reporte de conducta.",
    aliases: ["generar boleta", "boleta de conducta", "reporte de conducta"],
    hints: ["Revisá fecha, consecutivo y sección.", "Luego completá detalle de hechos y lugar."],
    exampleQuestions: ["qué lleno primero aquí", "qué hago si no abre el documento"]
  },
  {
    routePrefix: "/parametrizaciones/evaluaciones",
    moduleKey: "parametrizaciones",
    subflowKey: "crear-plantilla-evaluacion",
    title: "crear plantilla de evaluación",
    summary: "Parece que estás creando o editando una plantilla de evaluación.",
    aliases: ["guardar plantilla", "crear plantilla", "editar plantilla"],
    hints: ["Completá nombre, año lectivo, período y materia.", "Después agregá rubros y actividades."],
    exampleQuestions: ["qué lleno primero aquí", "cómo agrego un rubro"]
  },
  {
    routePrefix: "/parametrizaciones/evaluaciones",
    moduleKey: "parametrizaciones",
    subflowKey: "copiar-plantilla-evaluacion",
    title: "copiar plantilla de evaluación",
    summary: "Parece que estás copiando una plantilla de evaluación.",
    aliases: ["copiar plantilla", "copiando plantilla"],
    hints: ["Elegí bien año lectivo y período destino.", "Luego validá el detalle copiado antes de usarlo."],
    exampleQuestions: ["qué debo revisar después de copiar", "cómo cambio el período destino"]
  },
  {
    routePrefix: "/parametrizaciones/promt-ia",
    moduleKey: "parametrizaciones",
    subflowKey: "guardar-plantilla-ia",
    title: "guardar plantilla de Promt IA",
    summary: "Parece que estás creando o editando una plantilla de Promt IA.",
    aliases: ["guardar plantilla", "nueva plantilla de promt ia", "editar plantilla de promt ia"],
    hints: ["Definí primero el tipo y el nombre.", "Luego afiná instrucciones, contexto y formato de salida."],
    exampleQuestions: ["qué lleno primero aquí", "qué campos son requeridos"]
  },
  {
    routePrefix: "/parametrizaciones/promt-ia",
    moduleKey: "parametrizaciones",
    subflowKey: "copiar-plantilla-ia",
    title: "copiar plantilla de Promt IA",
    summary: "Parece que estás copiando una plantilla de Promt IA.",
    aliases: ["copiar plantilla", "copiar plantilla ia"],
    hints: ["Elegí una base estable.", "Cambiá el nombre antes de guardar la copia."],
    exampleQuestions: ["qué hago después de copiar", "cómo valido la copia"]
  },
  {
    routePrefix: "/asistencia",
    moduleKey: "asistencia",
    subflowKey: "tomar-lista",
    title: "tomar lista",
    summary: "Parece que estás en el subflujo de captura o edición de asistencia.",
    aliases: ["tomar lista", "guardar asistencia", "ver editar asistencia", "editar asistencia"],
    hints: ["Marcá primero el estado por estudiante.", "Luego agregá observaciones solo si hacen falta."],
    exampleQuestions: ["qué hago aquí", "qué reviso antes de guardar"]
  },
  {
    routePrefix: "/horarios",
    moduleKey: "horarios",
    subflowKey: "consulta-administrativa",
    title: "consulta administrativa de horarios",
    summary: "Parece que estás consultando horarios por sección, docente o estudiante.",
    aliases: ["consulta administrativa", "horario de seccion", "horario del profesor", "horario del estudiante"],
    hints: ["Completá primero los filtros generales.", "Si buscás persona, elegí el resultado correcto antes de consultar."],
    exampleQuestions: ["qué sigue aquí", "cómo consulto el horario de un estudiante"]
  },
  {
    routePrefix: "/seguimiento-notas",
    moduleKey: "seguimiento-notas",
    subflowKey: "guardar-seguimiento",
    title: "guardar seguimiento de notas",
    summary: "Parece que estás registrando seguimiento o examen por estudiante.",
    aliases: ["guardar seguimiento", "guardar examen", "seguimiento de notas"],
    hints: ["Seleccioná estudiante y componente antes de guardar.", "Después revisá el resultado del registro."],
    exampleQuestions: ["qué lleno primero aquí", "cómo reviso el consolidado"]
  },
  {
    routePrefix: "/planeamiento-ia",
    moduleKey: "planeamiento-ia",
    subflowKey: "generar-planeamiento",
    title: "generar planeamiento con IA",
    summary: "Parece que estás preparando o generando un planeamiento con IA.",
    aliases: ["generar con ia", "generar planeamiento", "guardar planeamiento"],
    hints: ["Primero seleccioná habilidades y contexto.", "Luego generá y validá antes de guardar."],
    exampleQuestions: ["qué lleno primero aquí", "cómo guardo el planeamiento"]
  }
];

let assistantKnowledgeCache: AssistantKnowledgeCache | null = null;

function parseJsonArray(value: any) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function loadAssistantKnowledge(pool: any) {
  const now = Date.now();
  if (assistantKnowledgeCache && assistantKnowledgeCache.expiresAt > now) {
    return assistantKnowledgeCache;
  }

  try {
    const modulesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteModuloGuia', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteModuloGuiaId,
          CAST(NULL AS nvarchar(80)) AS Clave,
          CAST(NULL AS nvarchar(120)) AS Titulo,
          CAST(NULL AS nvarchar(200)) AS Ruta,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS nvarchar(max)) AS AllowedRolesJson,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteModuloGuiaId,
          Clave,
          Titulo,
          Ruta,
          Resumen,
          AllowedRolesJson,
          OrdenVisual
        FROM dbo.AsistenteModuloGuia
        WHERE Activo = 1
        ORDER BY OrdenVisual, Titulo;
      END
    `);

    const aliasesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteModuloAlias', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteModuloGuiaId,
          CAST(NULL AS nvarchar(150)) AS Alias,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteModuloGuiaId,
          Alias,
          OrdenVisual
        FROM dbo.AsistenteModuloAlias
        WHERE Activo = 1
        ORDER BY AsistenteModuloGuiaId, OrdenVisual, Alias;
      END
    `);

    const stepsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteModuloPaso', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteModuloGuiaId,
          CAST(NULL AS nvarchar(max)) AS Descripcion,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteModuloGuiaId,
          Descripcion,
          OrdenVisual
        FROM dbo.AsistenteModuloPaso
        WHERE Activo = 1
        ORDER BY AsistenteModuloGuiaId, OrdenVisual;
      END
    `);

    const actionsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteAccionFrase', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(200)) AS Frase,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          ModuloClave,
          Frase,
          OrdenVisual
        FROM dbo.AsistenteAccionFrase
        WHERE Activo = 1
        ORDER BY ModuloClave, OrdenVisual, Frase;
      END
    `);

    const detailGuidesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteDetalleGuia', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteDetalleGuiaId,
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(80)) AS ClaveDetalle,
          CAST(NULL AS nvarchar(150)) AS Titulo,
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS nvarchar(max)) AS AllowedRolesJson,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteDetalleGuiaId,
          ModuloClave,
          ClaveDetalle,
          Titulo,
          RutaContexto,
          Resumen,
          AllowedRolesJson,
          OrdenVisual
        FROM dbo.AsistenteDetalleGuia
        WHERE Activo = 1
        ORDER BY ModuloClave, OrdenVisual, Titulo;
      END
    `);

    const detailAliasesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteDetalleAlias', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteDetalleGuiaId,
          CAST(NULL AS nvarchar(150)) AS Alias,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteDetalleGuiaId,
          Alias,
          OrdenVisual
        FROM dbo.AsistenteDetalleAlias
        WHERE Activo = 1
        ORDER BY AsistenteDetalleGuiaId, OrdenVisual, Alias;
      END
    `);

    const detailItemsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteDetalleItem', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS INT) AS AsistenteDetalleGuiaId,
          CAST(NULL AS nvarchar(20)) AS TipoItem,
          CAST(NULL AS nvarchar(max)) AS Descripcion,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          AsistenteDetalleGuiaId,
          TipoItem,
          Descripcion,
          OrdenVisual
        FROM dbo.AsistenteDetalleItem
        WHERE Activo = 1
        ORDER BY AsistenteDetalleGuiaId, TipoItem, OrdenVisual;
      END
    `);

    const conversationPatternsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistentePatronConversacion', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(80)) AS ClavePatron,
          CAST(NULL AS nvarchar(200)) AS Frase,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          ClavePatron,
          Frase,
          OrdenVisual
        FROM dbo.AsistentePatronConversacion
        WHERE Activo = 1
        ORDER BY ClavePatron, OrdenVisual, Frase;
      END
    `);

    const exampleQuestionsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteEjemploConsulta', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(80)) AS ClaveDetalle,
          CAST(NULL AS nvarchar(200)) AS FraseEjemplo,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          ModuloClave,
          ClaveDetalle,
          FraseEjemplo,
          OrdenVisual
        FROM dbo.AsistenteEjemploConsulta
        WHERE Activo = 1
        ORDER BY ModuloClave, ClaveDetalle, OrdenVisual, FraseEjemplo;
      END
    `);

    const screenContextsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteContextoPantalla', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(150)) AS Titulo,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ModuloClave,
          Titulo,
          Resumen,
          OrdenVisual
        FROM dbo.AsistenteContextoPantalla
        WHERE Activo = 1
        ORDER BY LEN(RutaContexto) DESC, OrdenVisual, Titulo;
      END
    `);

    const screenItemsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteContextoPantallaItem', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(20)) AS TipoItem,
          CAST(NULL AS nvarchar(max)) AS Descripcion,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          TipoItem,
          Descripcion,
          OrdenVisual
        FROM dbo.AsistenteContextoPantallaItem
        WHERE Activo = 1
        ORDER BY RutaContexto, TipoItem, OrdenVisual;
      END
    `);

    const formGuidesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteFormularioGuia', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(80)) AS ClaveFormulario,
          CAST(NULL AS nvarchar(150)) AS Titulo,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ModuloClave,
          ClaveFormulario,
          Titulo,
          Resumen,
          OrdenVisual
        FROM dbo.AsistenteFormularioGuia
        WHERE Activo = 1
        ORDER BY LEN(RutaContexto) DESC, OrdenVisual, Titulo;
      END
    `);

    const formAliasesResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteFormularioAlias', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ClaveFormulario,
          CAST(NULL AS nvarchar(150)) AS Alias,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ClaveFormulario,
          Alias,
          OrdenVisual
        FROM dbo.AsistenteFormularioAlias
        WHERE Activo = 1
        ORDER BY RutaContexto, ClaveFormulario, OrdenVisual, Alias;
      END
    `);

    const formFieldsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteFormularioCampo', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ClaveFormulario,
          CAST(NULL AS nvarchar(150)) AS NombreCampo,
          CAST(NULL AS bit) AS EsRequerido,
          CAST(NULL AS nvarchar(max)) AS Ayuda,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ClaveFormulario,
          NombreCampo,
          EsRequerido,
          Ayuda,
          OrdenVisual
        FROM dbo.AsistenteFormularioCampo
        WHERE Activo = 1
        ORDER BY RutaContexto, ClaveFormulario, OrdenVisual;
      END
    `);

    const subflowContextsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteSubflujoContexto', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(80)) AS ClaveSubflujo,
          CAST(NULL AS nvarchar(150)) AS Titulo,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ModuloClave,
          ClaveSubflujo,
          Titulo,
          Resumen,
          OrdenVisual
        FROM dbo.AsistenteSubflujoContexto
        WHERE Activo = 1
        ORDER BY LEN(RutaContexto) DESC, OrdenVisual, Titulo;
      END
    `);

    const subflowItemsResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteSubflujoItem', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(80)) AS ClaveSubflujo,
          CAST(NULL AS nvarchar(20)) AS TipoItem,
          CAST(NULL AS nvarchar(max)) AS Descripcion,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          RutaContexto,
          ClaveSubflujo,
          TipoItem,
          Descripcion,
          OrdenVisual
        FROM dbo.AsistenteSubflujoItem
        WHERE Activo = 1
        ORDER BY RutaContexto, ClaveSubflujo, TipoItem, OrdenVisual;
      END
    `);

    const faqResult = await pool.request().query(`
      IF OBJECT_ID('dbo.AsistenteFaq', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS nvarchar(80)) AS Clave,
          CAST(NULL AS nvarchar(80)) AS ModuloClave,
          CAST(NULL AS nvarchar(200)) AS RutaContexto,
          CAST(NULL AS nvarchar(150)) AS Titulo,
          CAST(NULL AS nvarchar(max)) AS Resumen,
          CAST(NULL AS nvarchar(max)) AS Respuesta,
          CAST(NULL AS nvarchar(30)) AS Tipo,
          CAST(NULL AS nvarchar(max)) AS PreguntasJson,
          CAST(NULL AS nvarchar(max)) AS PasosJson,
          CAST(NULL AS nvarchar(max)) AS AllowedRolesJson,
          CAST(NULL AS int) AS OrdenVisual
        WHERE 1 = 0;
      END
      ELSE
      BEGIN
        SELECT
          Clave,
          ModuloClave,
          RutaContexto,
          Titulo,
          Resumen,
          Respuesta,
          Tipo,
          PreguntasJson,
          PasosJson,
          AllowedRolesJson,
          OrdenVisual
        FROM dbo.AsistenteFaq
        WHERE Activo = 1
        ORDER BY OrdenVisual, Titulo;
      END
    `);

    const moduleRows = modulesResult.recordset || [];
    if (!moduleRows.length) {
      assistantKnowledgeCache = {
        expiresAt: now + 5 * 60 * 1000,
        guides: DEFAULT_MODULE_GUIDES,
        actions: DEFAULT_ACTION_PATTERNS,
        detailGuides: [],
        conversationPatterns: [],
        exampleQuestions: [],
        screenContexts: DEFAULT_SCREEN_CONTEXTS,
        formGuides: DEFAULT_FORM_GUIDES,
        subflowContexts: DEFAULT_SUBFLOW_CONTEXTS,
        faqs: []
      };
      return assistantKnowledgeCache;
    }

    const aliasesByModule = new Map<number, string[]>();
    for (const row of aliasesResult.recordset || []) {
      const moduleId = Number(row.AsistenteModuloGuiaId || 0);
      if (!moduleId) continue;
      if (!aliasesByModule.has(moduleId)) aliasesByModule.set(moduleId, []);
      aliasesByModule.get(moduleId)?.push(String(row.Alias || "").trim());
    }

    const stepsByModule = new Map<number, string[]>();
    for (const row of stepsResult.recordset || []) {
      const moduleId = Number(row.AsistenteModuloGuiaId || 0);
      if (!moduleId) continue;
      if (!stepsByModule.has(moduleId)) stepsByModule.set(moduleId, []);
      stepsByModule.get(moduleId)?.push(String(row.Descripcion || "").trim());
    }

    const guides: ModuleGuide[] = moduleRows.map((row: any) => ({
      key: String(row.Clave || "").trim(),
      title: String(row.Titulo || "").trim(),
      path: String(row.Ruta || "").trim(),
      allowedRoles: parseJsonArray(row.AllowedRolesJson),
      aliases: aliasesByModule.get(Number(row.AsistenteModuloGuiaId || 0)) || [],
      summary: String(row.Resumen || "").trim(),
      steps: stepsByModule.get(Number(row.AsistenteModuloGuiaId || 0)) || []
    })).filter((guide) => guide.key && guide.title);

    const actionsByKey = new Map<string, string[]>();
    for (const row of actionsResult.recordset || []) {
      const moduleKey = String(row.ModuloClave || "").trim();
      const phrase = String(row.Frase || "").trim();
      if (!moduleKey || !phrase) continue;
      if (!actionsByKey.has(moduleKey)) actionsByKey.set(moduleKey, []);
      actionsByKey.get(moduleKey)?.push(phrase);
    }

    const actions: ActionPattern[] = Array.from(actionsByKey.entries()).map(([guideKey, phrases]) => ({ guideKey, phrases }));

    const detailAliasesByGuide = new Map<number, string[]>();
    for (const row of detailAliasesResult.recordset || []) {
      const detailId = Number(row.AsistenteDetalleGuiaId || 0);
      if (!detailId) continue;
      if (!detailAliasesByGuide.has(detailId)) detailAliasesByGuide.set(detailId, []);
      detailAliasesByGuide.get(detailId)?.push(String(row.Alias || "").trim());
    }

    const detailItemsByGuide = new Map<number, { steps: string[]; validations: string[]; commonErrors: string[]; correctiveActions: string[] }>();
    for (const row of detailItemsResult.recordset || []) {
      const detailId = Number(row.AsistenteDetalleGuiaId || 0);
      if (!detailId) continue;
      if (!detailItemsByGuide.has(detailId)) {
        detailItemsByGuide.set(detailId, { steps: [], validations: [], commonErrors: [], correctiveActions: [] });
      }
      const bucket = detailItemsByGuide.get(detailId)!;
      const tipo = String(row.TipoItem || "").trim().toUpperCase();
      const descripcion = String(row.Descripcion || "").trim();
      if (!descripcion) continue;
      if (tipo === "PASO") bucket.steps.push(descripcion);
      else if (tipo === "VALIDACION") bucket.validations.push(descripcion);
      else if (tipo === "ERROR") bucket.commonErrors.push(descripcion);
      else if (tipo === "ACCION") bucket.correctiveActions.push(descripcion);
    }

    const detailGuides: DetailGuide[] = (detailGuidesResult.recordset || []).map((row: any) => {
      const detailId = Number(row.AsistenteDetalleGuiaId || 0);
      const items = detailItemsByGuide.get(detailId) || { steps: [], validations: [], commonErrors: [], correctiveActions: [] };
      return {
        moduleKey: String(row.ModuloClave || "").trim(),
        detailKey: String(row.ClaveDetalle || "").trim(),
        title: String(row.Titulo || "").trim(),
        routePrefix: String(row.RutaContexto || "").trim(),
        allowedRoles: parseJsonArray(row.AllowedRolesJson),
        aliases: detailAliasesByGuide.get(detailId) || [],
        summary: String(row.Resumen || "").trim(),
        steps: items.steps,
        validations: items.validations,
        commonErrors: items.commonErrors,
        correctiveActions: items.correctiveActions
      };
    }).filter((item) => item.moduleKey && item.detailKey && item.title);

    const conversationPatternsByKey = new Map<string, string[]>();
    for (const row of conversationPatternsResult.recordset || []) {
      const patternKey = String(row.ClavePatron || "").trim().toUpperCase();
      const phrase = String(row.Frase || "").trim();
      if (!patternKey || !phrase) continue;
      if (!conversationPatternsByKey.has(patternKey)) conversationPatternsByKey.set(patternKey, []);
      conversationPatternsByKey.get(patternKey)?.push(phrase);
    }

    const conversationPatterns: ConversationPattern[] = Array.from(conversationPatternsByKey.entries())
      .map(([patternKey, phrases]) => ({ patternKey, phrases }));

    const examplesByCompositeKey = new Map<string, string[]>();
    for (const row of exampleQuestionsResult.recordset || []) {
      const moduleKey = String(row.ModuloClave || "").trim();
      const detailKey = String(row.ClaveDetalle || "").trim();
      const phrase = String(row.FraseEjemplo || "").trim();
      if (!moduleKey || !phrase) continue;
      const compositeKey = `${moduleKey}::${detailKey || ""}`;
      if (!examplesByCompositeKey.has(compositeKey)) examplesByCompositeKey.set(compositeKey, []);
      examplesByCompositeKey.get(compositeKey)?.push(phrase);
    }

    const exampleQuestions: ExampleQuestion[] = Array.from(examplesByCompositeKey.entries()).map(([compositeKey, phrases]) => {
      const [moduleKey, detailKey] = compositeKey.split("::");
      return { moduleKey, detailKey: detailKey || null, phrases };
    });

    const screenItemsByRoute = new Map<string, { hints: string[]; exampleQuestions: string[] }>();
    for (const row of screenItemsResult.recordset || []) {
      const routePrefix = String(row.RutaContexto || "").trim();
      const tipo = String(row.TipoItem || "").trim().toUpperCase();
      const descripcion = String(row.Descripcion || "").trim();
      if (!routePrefix || !descripcion) continue;
      if (!screenItemsByRoute.has(routePrefix)) {
        screenItemsByRoute.set(routePrefix, { hints: [], exampleQuestions: [] });
      }
      const bucket = screenItemsByRoute.get(routePrefix)!;
      if (tipo === "HINT") bucket.hints.push(descripcion);
      else if (tipo === "EXAMPLE") bucket.exampleQuestions.push(descripcion);
    }

    const screenContexts: ScreenContext[] = (screenContextsResult.recordset || []).map((row: any) => {
      const routePrefix = String(row.RutaContexto || "").trim();
      const items = screenItemsByRoute.get(routePrefix) || { hints: [], exampleQuestions: [] };
      return {
        routePrefix,
        moduleKey: String(row.ModuloClave || "").trim(),
        title: String(row.Titulo || "").trim(),
        summary: String(row.Resumen || "").trim(),
        hints: items.hints,
        exampleQuestions: items.exampleQuestions
      };
    }).filter((item) => item.routePrefix && item.title);

    const formAliasesByKey = new Map<string, string[]>();
    for (const row of formAliasesResult.recordset || []) {
      const mapKey = `${String(row.RutaContexto || "").trim()}::${String(row.ClaveFormulario || "").trim()}`;
      const alias = String(row.Alias || "").trim();
      if (!mapKey || !alias) continue;
      if (!formAliasesByKey.has(mapKey)) formAliasesByKey.set(mapKey, []);
      formAliasesByKey.get(mapKey)?.push(alias);
    }

    const formFieldsByKey = new Map<string, FormGuideField[]>();
    for (const row of formFieldsResult.recordset || []) {
      const mapKey = `${String(row.RutaContexto || "").trim()}::${String(row.ClaveFormulario || "").trim()}`;
      if (!formFieldsByKey.has(mapKey)) formFieldsByKey.set(mapKey, []);
      formFieldsByKey.get(mapKey)?.push({
        fieldName: String(row.NombreCampo || "").trim(),
        required: Boolean(row.EsRequerido),
        hint: String(row.Ayuda || "").trim(),
        order: Number(row.OrdenVisual || 0)
      });
    }

    const formGuides: FormGuide[] = (formGuidesResult.recordset || []).map((row: any) => {
      const mapKey = `${String(row.RutaContexto || "").trim()}::${String(row.ClaveFormulario || "").trim()}`;
      return {
        routePrefix: String(row.RutaContexto || "").trim(),
        moduleKey: String(row.ModuloClave || "").trim(),
        formKey: String(row.ClaveFormulario || "").trim(),
        title: String(row.Titulo || "").trim(),
        summary: String(row.Resumen || "").trim(),
        aliases: formAliasesByKey.get(mapKey) || [],
        fields: (formFieldsByKey.get(mapKey) || []).sort((a, b) => a.order - b.order)
      };
    }).filter((item) => item.routePrefix && item.formKey && item.title);

    const subflowItemsByKey = new Map<string, { aliases: string[]; hints: string[]; exampleQuestions: string[] }>();
    for (const row of subflowItemsResult.recordset || []) {
      const mapKey = `${String(row.RutaContexto || "").trim()}::${String(row.ClaveSubflujo || "").trim()}`;
      const tipo = String(row.TipoItem || "").trim().toUpperCase();
      const descripcion = String(row.Descripcion || "").trim();
      if (!mapKey || !descripcion) continue;
      if (!subflowItemsByKey.has(mapKey)) {
        subflowItemsByKey.set(mapKey, { aliases: [], hints: [], exampleQuestions: [] });
      }
      const bucket = subflowItemsByKey.get(mapKey)!;
      if (tipo === "ALIAS") bucket.aliases.push(descripcion);
      else if (tipo === "HINT") bucket.hints.push(descripcion);
      else if (tipo === "EXAMPLE") bucket.exampleQuestions.push(descripcion);
    }

    const subflowContexts: SubflowContext[] = (subflowContextsResult.recordset || []).map((row: any) => {
      const mapKey = `${String(row.RutaContexto || "").trim()}::${String(row.ClaveSubflujo || "").trim()}`;
      const items = subflowItemsByKey.get(mapKey) || { aliases: [], hints: [], exampleQuestions: [] };
      return {
        routePrefix: String(row.RutaContexto || "").trim(),
        moduleKey: String(row.ModuloClave || "").trim(),
        subflowKey: String(row.ClaveSubflujo || "").trim(),
        title: String(row.Titulo || "").trim(),
        summary: String(row.Resumen || "").trim(),
        aliases: items.aliases,
        hints: items.hints,
        exampleQuestions: items.exampleQuestions
      };
    }).filter((item) => item.routePrefix && item.subflowKey && item.title);

    const faqs: AssistantFaq[] = (faqResult.recordset || []).map((row: any) => ({
      faqKey: String(row.Clave || "").trim(),
      moduleKey: String(row.ModuloClave || "").trim(),
      routePrefix: String(row.RutaContexto || "").trim(),
      title: String(row.Titulo || "").trim(),
      summary: String(row.Resumen || "").trim(),
      answer: String(row.Respuesta || "").trim(),
      kind: String(row.Tipo || "FAQ").trim().toUpperCase(),
      questionPatterns: parseJsonArray(row.PreguntasJson),
      steps: parseJsonArray(row.PasosJson),
      allowedRoles: parseJsonArray(row.AllowedRolesJson)
    })).filter((item) => item.faqKey && item.title && item.answer);

    assistantKnowledgeCache = {
      expiresAt: now + 5 * 60 * 1000,
      guides: guides.length ? guides : DEFAULT_MODULE_GUIDES,
      actions: actions.length ? actions : DEFAULT_ACTION_PATTERNS,
      detailGuides,
      conversationPatterns,
      exampleQuestions,
      screenContexts: screenContexts.length ? screenContexts : DEFAULT_SCREEN_CONTEXTS,
      formGuides: formGuides.length ? formGuides : DEFAULT_FORM_GUIDES,
      subflowContexts: subflowContexts.length ? subflowContexts : DEFAULT_SUBFLOW_CONTEXTS,
      faqs
    };
    return assistantKnowledgeCache;
  } catch {
    assistantKnowledgeCache = {
      expiresAt: now + 5 * 60 * 1000,
      guides: DEFAULT_MODULE_GUIDES,
      actions: DEFAULT_ACTION_PATTERNS,
      detailGuides: [],
      conversationPatterns: [],
      exampleQuestions: [],
      screenContexts: DEFAULT_SCREEN_CONTEXTS,
      formGuides: DEFAULT_FORM_GUIDES,
      subflowContexts: DEFAULT_SUBFLOW_CONTEXTS,
      faqs: []
    };
    return assistantKnowledgeCache;
  }
}

function getUserRoles(req: any) {
  return Array.isArray(getAuth(req).roles) ? getAuth(req).roles.map((role: any) => String(role || "").trim().toUpperCase()) : [];
}

function getAccessibleModuleGuides(req: any, guides: ModuleGuide[] = DEFAULT_MODULE_GUIDES) {
  const roles = getUserRoles(req);
  return guides.filter((guide) => {
    if (!guide.allowedRoles?.length) return true;
    return guide.allowedRoles.some((role) => roles.includes(String(role || "").trim().toUpperCase()));
  });
}

function getAccessibleDetailGuides(req: any, detailGuides: DetailGuide[] = []) {
  const roles = getUserRoles(req);
  return detailGuides.filter((guide) => {
    if (!guide.allowedRoles?.length) return true;
    return guide.allowedRoles.some((role) => roles.includes(String(role || "").trim().toUpperCase()));
  });
}

function getAccessibleFaqs(req: any, faqs: AssistantFaq[] = []) {
  const roles = getUserRoles(req);
  return faqs.filter((item) => {
    if (!item.allowedRoles?.length) return true;
    return item.allowedRoles.some((role) => roles.includes(String(role || "").trim().toUpperCase()));
  });
}

function matchesAlias(text: string, alias: string) {
  const normalizedText = normalizeText(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const normalizedAlias = normalizeText(alias).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return normalizedText.includes(normalizedAlias);
}

function resolveGuideFromQuestion(question: string, currentPath: string, guides: ModuleGuide[]) {
  const exactPathGuide = guides.find((guide) => currentPath && guide.path !== "/" && currentPath.startsWith(guide.path));
  const byAlias = guides.find((guide) => guide.aliases.some((alias) => matchesAlias(question, alias)));
  return byAlias || exactPathGuide || null;
}

function resolveDetailGuideFromQuestion(question: string, currentPath: string, detailGuides: DetailGuide[]) {
  const byAlias = detailGuides.find((guide) => {
    const routeOk = !guide.routePrefix || currentPath.startsWith(guide.routePrefix);
    return routeOk && guide.aliases.some((alias) => matchesAlias(question, alias));
  });
  if (byAlias) return byAlias;

  const byRoute = detailGuides.find((guide) => {
    if (!guide.routePrefix || !currentPath.startsWith(guide.routePrefix)) return false;
    return normalizeKey(question) === normalizeKey(guide.title) || guide.aliases.some((alias) => normalizeKey(question) === normalizeKey(alias));
  });

  return byRoute || null;
}

function resolveFaqFromQuestion(question: string, currentPath: string, faqs: AssistantFaq[]) {
  const normalizedPath = normalizeText(currentPath).toLowerCase();
  const prioritized = [...faqs].sort((a, b) => (b.routePrefix?.length || 0) - (a.routePrefix?.length || 0));
  return prioritized.find((item) => {
    const routeOk = !item.routePrefix || normalizedPath.startsWith(String(item.routePrefix || "").toLowerCase());
    if (!routeOk) return false;
    return item.questionPatterns.some((pattern) => matchesAlias(question, pattern));
  }) || null;
}

function normalizeScreenSnapshot(value: any): AssistantScreenSnapshot {
  const ensureArray = (items: any, max = 16) =>
    Array.isArray(items)
      ? items.map((item) => normalizeText(item)).filter(Boolean).slice(0, max)
      : [];
  return {
    routeLabel: normalizeText(value?.routeLabel),
    documentTitle: normalizeText(value?.documentTitle),
    headings: ensureArray(value?.headings, 10),
    buttons: ensureArray(value?.buttons, 16),
    labels: ensureArray(value?.labels, 18)
  };
}

function inferScreenFocus(snapshot: AssistantScreenSnapshot | null) {
  const focusPool = [
    ...(snapshot?.headings || []),
    ...(snapshot?.labels || [])
  ].filter(Boolean);
  return focusPool.slice(0, 4);
}

function pushSuggestedAction(list: AssistantSuggestedAction[], action: AssistantSuggestedAction | null | undefined) {
  if (!action?.label || !action?.target) return;
  if (list.some((item) => item.type === action.type && item.target === action.target)) return;
  list.push(action);
}

function buildSuggestedActions(question: string, context: any): AssistantSuggestedAction[] {
  const actions: AssistantSuggestedAction[] = [];
  const currentPath = normalizeText(context?.currentPath) || "/";
  const accessibleGuides = Array.isArray(context?.accessibleModuleGuides) ? context.accessibleModuleGuides : [];
  const accessibleDetailGuides = Array.isArray(context?.assistantDetailGuides) ? context.assistantDetailGuides : [];
  const screenContexts = Array.isArray(context?.assistantScreenContexts) ? context.assistantScreenContexts : DEFAULT_SCREEN_CONTEXTS;
  const faqs = Array.isArray(context?.assistantFaqs) ? context.assistantFaqs : [];
  const matchedGuide = resolveGuideFromQuestion(question, currentPath, accessibleGuides);
  const matchedDetailGuide = resolveDetailGuideFromQuestion(question, currentPath, accessibleDetailGuides);
  const matchedFaq = resolveFaqFromQuestion(question, currentPath, faqs);
  const currentScreenContext = getCurrentScreenContext(currentPath, screenContexts);

  if (matchedGuide?.path) {
    pushSuggestedAction(actions, { label: `Ir a ${matchedGuide.title}`, type: "navigate", target: matchedGuide.path });
    pushSuggestedAction(actions, { label: `Explicame ${matchedGuide.title}`, type: "ask", target: `Explicame ${matchedGuide.title} paso a paso` });
  }

  if (matchedDetailGuide?.title) {
    pushSuggestedAction(actions, { label: `Ver ${matchedDetailGuide.title}`, type: "ask", target: `Explicame ${matchedDetailGuide.title} campo por campo` });
  }

  if (matchedFaq?.kind === "DIAGNOSTICO") {
    pushSuggestedAction(actions, { label: "Que reviso primero", type: "ask", target: `Que reviso primero en ${matchedFaq.title}` });
  }

  if (currentScreenContext?.moduleKey) {
    const routeGuide = accessibleGuides.find((item) => item.key === currentScreenContext.moduleKey)
      || accessibleGuides.find((item) => currentPath.startsWith(item.path));
    if (routeGuide?.path) {
      pushSuggestedAction(actions, { label: "Abrir modulo", type: "navigate", target: routeGuide.path });
    }
    pushSuggestedAction(actions, { label: "Que hago aqui", type: "ask", target: "Que hago aqui" });
  }

  if (currentPath.startsWith("/gestion-profe")) {
    pushSuggestedAction(actions, { label: "Ir a Gestion del Profe", type: "navigate", target: "/gestion-profe" });
    pushSuggestedAction(actions, { label: "Revisar esta pantalla", type: "ask", target: "Que hago aqui" });
  } else if (currentPath.startsWith("/administrativo") || currentPath.startsWith("/academico")) {
    pushSuggestedAction(actions, { label: "Ir a Administrativo", type: "navigate", target: "/administrativo" });
    pushSuggestedAction(actions, { label: "Que reviso aqui", type: "ask", target: "Que hago aqui" });
  } else if (currentPath.startsWith("/estudiantes")) {
    pushSuggestedAction(actions, { label: "Ir a Estudiantes", type: "navigate", target: "/estudiantes" });
  } else if (currentPath.startsWith("/matricula")) {
    pushSuggestedAction(actions, { label: "Ir a Matricula", type: "navigate", target: "/matricula" });
  }

  if (!actions.length && accessibleGuides.length) {
    const firstGuide = accessibleGuides[0];
    pushSuggestedAction(actions, { label: `Ir a ${firstGuide.title}`, type: "navigate", target: firstGuide.path });
    pushSuggestedAction(actions, { label: "Ver modulos disponibles", type: "ask", target: "Que modulos puedo usar" });
  }

  return actions.slice(0, 4);
}

function isAccessQuestion(question: string) {
  const key = normalizeText(question).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /(QUE MODULOS|QUE PUEDO USAR|A QUE TENGO ACCESO|MIS MODULOS|MIS ACCESOS|QUE PUEDO HACER|TODO EL SISTEMA|MODULO POR MODULO|SISTEMA COMPLETO)/.test(key);
}

function isHowToQuestion(question: string) {
  const key = normalizeText(question).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /(COMO|PASOS|PASO A PASO|QUE DEBO|QUE TENGO|GUIA|GUIAME|AYUDA|EXPLICAME)/.test(key);
}

function isModuleSelection(question: string, guide: ModuleGuide | null) {
  if (!guide) return false;
  const clean = normalizeText(question).replace(/^[\-•\s:]+/, "");
  if (!clean) return false;
  const words = clean.split(/\s+/).filter(Boolean);
  return guide.aliases.some((alias) => normalizeKey(clean) === normalizeKey(alias)) || words.length <= 2;
}

function isStudentInfoQuestion(question: string) {
  const key = normalizeText(question).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /(INFORMACION DE UN ALUMNO|INFORMACION DE UN ESTUDIANTE|DATOS DE UN ALUMNO|DATOS DE UN ESTUDIANTE|PUEDES DARME INFORMACION DE UN ALUMNO|PUEDES DARME INFORMACION DE UN ESTUDIANTE|BUSCAR UN ALUMNO|BUSCAR UN ESTUDIANTE)/.test(key);
}

const DEFAULT_ACTION_PATTERNS: ActionPattern[] = [
  { guideKey: "instituciones", phrases: ["crear institucion", "nueva institucion", "ingresar una nueva institucion", "registrar institucion", "editar institucion"] },
  { guideKey: "usuarios", phrases: ["crear usuario", "nuevo usuario", "registrar usuario", "dar acceso", "asignar rol", "crear profesor", "crear admin"] },
  { guideKey: "estudiantes", phrases: ["crear estudiante", "nuevo estudiante", "registrar estudiante", "crear alumno", "nuevo alumno", "registrar alumno", "editar estudiante"] },
  { guideKey: "matricula", phrases: ["matricular alumno", "matricular estudiante", "hacer matricula", "crear matricula", "cambiar de seccion", "trasladar alumno", "trasladar estudiante", "mover de seccion"] },
  { guideKey: "administrativo", phrases: ["crear grupo", "crear seccion", "asignar docente", "crear horario", "hacer horario", "configurar bloques", "crear materia por grupo"] },
  { guideKey: "parametrizaciones", phrases: ["configurar evaluacion", "parametrizar evaluacion", "crear rubro", "configurar ia", "editar plantilla ia", "crear plantilla ia"] },
  { guideKey: "horarios", phrases: ["ver horario", "consultar horario", "buscar horario del profe", "buscar horario de un grupo"] },
  { guideKey: "asistencia", phrases: ["pasar asistencia", "registrar asistencia", "tomar asistencia", "ver asistencia"] },
  { guideKey: "seguimiento-notas", phrases: ["seguir indicadores", "seguimiento de notas", "ver seguimiento del estudiante"] },
  { guideKey: "gestion-profe", phrases: ["registro de notas", "calificar tareas", "calificar cotidiano", "calificar examenes", "seguir diario", "seguimiento diario", "trabajar con mi grupo"] },
  { guideKey: "planeamiento-ia", phrases: ["hacer planeamiento", "crear planeamiento", "generar planeamiento", "planeamiento con ia"] },
  { guideKey: "reportes", phrases: ["sacar reporte", "generar reporte", "ver reporte", "imprimir reporte", "exportar reporte"] }
];

function inferGuideFromAction(question: string, guides: ModuleGuide[], actionPatterns: ActionPattern[] = DEFAULT_ACTION_PATTERNS) {
  const key = normalizeKey(question);
  const pattern = actionPatterns.find((item) => item.phrases.some((phrase) => key.includes(normalizeKey(phrase))));
  if (!pattern) return null;
  return guides.find((guide) => guide.key === pattern.guideKey) || null;
}

function buildAccessibleModulesReply(greetingName: string, guides: ModuleGuide[]) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const items = guides.map((guide) => `- ${guide.title}: ${guide.summary}`).join("\n");
  return `${intro} Segun tu rol, estos son los modulos sobre los que puedo orientarte:\n\n${items}\n\nDecime cual queres usar y te lo explico paso a paso.`;
}

function buildModuleGuideReply(greetingName: string, guide: ModuleGuide) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const steps = guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  return `${intro} Te guio con ${guide.title}.\n\n${guide.summary}\n\nPaso a paso:\n${steps}\n\nSi queres, despues te explico ese modulo campo por campo.`;
}

function buildDetailGuideReply(greetingName: string, guide: DetailGuide) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const steps = guide.steps.length ? guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n") : "1. Revisa el proceso configurado para este panel.";
  const validations = guide.validations.length ? `\n\nValidaciones previas:\n${guide.validations.map((item) => `- ${item}`).join("\n")}` : "";
  const errors = guide.commonErrors.length ? `\n\nErrores comunes:\n${guide.commonErrors.map((item) => `- ${item}`).join("\n")}` : "";
  const actions = guide.correctiveActions.length ? `\n\nSi pasa esto, hace esto otro:\n${guide.correctiveActions.map((item) => `- ${item}`).join("\n")}` : "";
  return `${intro} Te guio con ${guide.title}.\n\n${guide.summary}\n\nPaso a paso:\n${steps}${validations}${errors}${actions}`;
}

function buildWhatElseReply(greetingName: string, guides: ModuleGuide[]) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const names = guides.map((guide) => guide.title).join(", ");
  return `${intro} Además de responder dudas, puedo:\n\n- guiarte paso a paso en los módulos que tenés acceso\n- decirte en qué módulo se hace cada proceso\n- indicarte validaciones previas antes de guardar\n- explicarte errores comunes y qué revisar\n- ayudarte a buscar estudiantes, grupos, horarios, notas, asistencia y reportes cuando aplique\n\nCon tu rol, te puedo orientar sobre: ${names}.\n\nSi querés, probá diciéndome algo natural como "quiero crear un usuario", "quiero matricular un alumno" o "quiero sacar un reporte".`;
}

function normalizeKey(text: string) {
  return normalizeText(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function includesAny(text: string, needles: string[]) {
  const key = normalizeKey(text);
  return needles.some((needle) => key.includes(normalizeKey(needle)));
}

function isWhatElseQuestion(question: string) {
  const key = normalizeKey(question);
  return /(Y QUE MAS PUEDES HACER|QUE MAS PUEDES HACER|EN QUE MAS PUEDES AYUDARME|COMO MAS ME PUEDES AYUDAR|QUE MAS HACES)/.test(key);
}

function matchesConversationPattern(question: string, patterns: ConversationPattern[], patternKey: string, defaults: string[] = []) {
  const desiredKey = normalizeKey(patternKey);
  const phrases = patterns.find((item) => normalizeKey(item.patternKey) === desiredKey)?.phrases || defaults;
  if (!phrases.length) return false;
  const key = normalizeKey(question);
  return phrases.some((phrase) => key === normalizeKey(phrase) || key.includes(normalizeKey(phrase)));
}

function getLastAssistantText(history: any[] = []) {
  const assistantItems = history.filter((item) => String(item?.role || "").toLowerCase() === "assistant");
  const lastAssistant = assistantItems.length ? assistantItems[assistantItems.length - 1] : null;
  return normalizeText(lastAssistant?.text);
}

function getFollowupGuideFromHistory(history: any[] = [], guides: ModuleGuide[] = [], detailGuides: DetailGuide[] = []) {
  const lastAssistantText = getLastAssistantText(history);
  if (!lastAssistantText) return { guide: null as ModuleGuide | null, detailGuide: null as DetailGuide | null };

  const normalizedLast = normalizeKey(lastAssistantText);
  const detailGuide = detailGuides.find((item) =>
    normalizedLast.includes(normalizeKey(`Te guio con ${item.title}`))
    || normalizedLast.includes(normalizeKey(item.title))
  ) || null;

  if (detailGuide) {
    const guide = guides.find((item) => item.key === detailGuide.moduleKey) || null;
    return { guide, detailGuide };
  }

  const guide = guides.find((item) =>
    normalizedLast.includes(normalizeKey(`Te guio con ${item.title}`))
    || normalizedLast.includes(normalizeKey(item.title))
  ) || null;

  return { guide, detailGuide: null as DetailGuide | null };
}

function buildAdministrativeOverviewReply(greetingName: string, detailGuides: DetailGuide[] = []) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const items = detailGuides
    .filter((item) => item.moduleKey === "administrativo")
    .map((item) => `- ${item.title}: ${item.summary}`)
    .join("\n");

  if (!items) {
    return `${intro} En Administrativo normalmente encontrás Año Lectivo, Periodos, Gestión de grupos, Materias, Materias por grupo, Asignación Docentes, Bloque Horario, Horario de clases, Fecha de clases, Días Lectivos, Feriados, Correo Institucional y Mensajes.\n\nSi querés, te explico cualquiera de esas pestañas paso a paso.`;
  }

  return `${intro} En Administrativo encontrás estas pestañas:\n\n${items}\n\nSi querés, decime cuál te explico paso a paso.`;
}

function buildFieldByFieldFollowupReply(
  greetingName: string,
  guide: ModuleGuide | null,
  detailGuide: DetailGuide | null,
  detailGuides: DetailGuide[] = [],
  exampleQuestions: ExampleQuestion[] = []
) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";

  if (detailGuide) {
    const examples = exampleQuestions
      .find((item) => item.moduleKey === detailGuide.moduleKey && item.detailKey === detailGuide.detailKey)?.phrases
      || [];
    const exampleBlock = examples.length
      ? `\n\nEjemplos de preguntas que también te puedo responder sobre este tema:\n${examples.slice(0, 3).map((item) => `- ${item}`).join("\n")}`
      : "";
    return `${intro} Claro. Te sigo guiando con ${detailGuide.title}.\n\n${buildDetailGuideReply("", detailGuide).replace(/^Hola\.\s*/, "")}${exampleBlock}`;
  }

  if (!guide) return null;

  const moduleDetails = detailGuides.filter((item) => item.moduleKey === guide.key);
  if (moduleDetails.length) {
    const items = moduleDetails.map((item) => `- ${item.title}: ${item.summary}`).join("\n");
    return `${intro} Claro. Dentro de ${guide.title} tenés estas partes:\n\n${items}\n\nDecime cuál querés que te explique campo por campo.`;
  }

  const examples = exampleQuestions.find((item) => item.moduleKey === guide.key && !item.detailKey)?.phrases || [];
  const exampleBlock = examples.length
    ? `\n\nEjemplos de preguntas útiles:\n${examples.slice(0, 3).map((item) => `- ${item}`).join("\n")}`
    : "";
  return `${intro} Claro. Te amplío ${guide.title} paso a paso.\n\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}${exampleBlock}`;
}

function buildForgotPasswordReply(greetingName: string, currentPath: string, canManageUsers: boolean) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const loginHint = currentPath.startsWith("/login") || currentPath.startsWith("/restablecer-clave")
    ? `\n\nSi estás en la pantalla de ingreso, usá "Olvidé mi clave". Luego ingresás tu correo, tu número de cédula y la nueva clave en "Restablecer clave".`
    : `\n\nSi todavía podés entrar al sistema, usá el botón "Cambiar clave" que aparece arriba a la derecha.`;
  const adminHint = canManageUsers
    ? `\n\nSi el problema es de otra persona y tu rol lo permite, también podés ir a "Usuarios" y usar "Restablecer clave".`
    : "";
  return `${intro} Si se te olvidó la clave, esto es lo correcto:${loginHint}${adminHint}\n\nSi querés, te digo cuál de esas opciones te conviene según si estás dentro o fuera del sistema.`;
}

function isCurrentScreenQuestion(question: string) {
  const key = normalizeKey(question);
  return /(QUE HAGO AQUI|QUE PUEDO HACER AQUI|AYUDAME AQUI|EN ESTA PANTALLA|ACA QUE HAGO|AQUI QUE HAGO|DONDE ESTOY|QUE SIGUE AQUI|SABES EN QUE PANTALLA ESTOY|AHORA QUE HAGO|Y ACA|Y AQUI|Y ACA QUE SE HACE|Y AQUI QUE SE HACE)/.test(key);
}

function getCurrentScreenContext(currentPath: string, screenContexts: ScreenContext[] = DEFAULT_SCREEN_CONTEXTS) {
  const path = normalizeText(currentPath).toLowerCase();
  const sorted = [...screenContexts].sort((a, b) => b.routePrefix.length - a.routePrefix.length);
  return sorted.find((item) => path.startsWith(String(item.routePrefix || "").toLowerCase())) || null;
}

function buildCurrentScreenReply(greetingName: string, screenContext: ScreenContext | null) {
  if (!screenContext) return null;
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const hints = screenContext.hints.length ? `\n\nEn esta pantalla te recomiendo:\n${screenContext.hints.map((item) => `- ${item}`).join("\n")}` : "";
  const examples = screenContext.exampleQuestions.length ? `\n\nMe podés preguntar cosas como:\n${screenContext.exampleQuestions.map((item) => `- ${item}`).join("\n")}` : "";
  return `${intro} Estás en ${screenContext.title}.\n\n${screenContext.summary}${hints}${examples}`;
}

function buildLiveScreenSnapshotReply(greetingName: string, snapshot: AssistantScreenSnapshot | null, focus: string[] = []) {
  if (!snapshot) return null;
  const visibleFocus = focus.filter(Boolean);
  if (!visibleFocus.length && !snapshot.routeLabel && !snapshot.documentTitle) return null;
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const routeLine = snapshot.routeLabel ? `EstÃ¡s trabajando en ${snapshot.routeLabel}.` : "EstÃ¡s trabajando dentro de PROFE360.";
  const focusLine = visibleFocus.length
    ? `\n\nAhorita veo estas referencias en tu pantalla:\n${visibleFocus.map((item) => `- ${item}`).join("\n")}`
    : "";
  const actionLine = snapshot.buttons?.length
    ? `\n\nTambien veo acciones disponibles como: ${snapshot.buttons.slice(0, 5).join(", ")}.`
    : "";
  return `${intro} ${routeLine}${focusLine}${actionLine}\n\nDecime quÃ© parte querÃ©s resolver y te guÃ­o sobre esa vista exacta.`;
}

function isFormGuidanceQuestion(question: string) {
  const key = normalizeKey(question);
  return /(QUE LLENO PRIMERO|QUE VA PRIMERO|QUE CAMPO SIGUE|COMO LLENO ESTE FORMULARIO|QUE PONGO AQUI|QUE LLENO AQUI|CAMPOS REQUERIDOS|CAMPO POR CAMPO|QUE DATOS PIDE)/.test(key);
}

function getCurrentFormGuide(question: string, currentPath: string, formGuides: FormGuide[] = DEFAULT_FORM_GUIDES) {
  const path = normalizeText(currentPath).toLowerCase();
  const key = normalizeKey(question);
  const sorted = [...formGuides].sort((a, b) => b.routePrefix.length - a.routePrefix.length);
  const byAlias = sorted.find((guide) =>
    path.startsWith(guide.routePrefix.toLowerCase())
    && guide.aliases.some((alias) => key.includes(normalizeKey(alias)))
  );
  if (byAlias) return byAlias;
  return sorted.find((guide) => path.startsWith(guide.routePrefix.toLowerCase())) || null;
}

function buildFormGuideReply(greetingName: string, formGuide: FormGuide | null) {
  if (!formGuide) return null;
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const orderedFields = [...formGuide.fields].sort((a, b) => a.order - b.order);
  const fieldLines = orderedFields.map((field, index) =>
    `${index + 1}. ${field.fieldName}${field.required ? " (Requerido)" : ""}: ${field.hint}`
  ).join("\n");
  return `${intro} Para llenar ${formGuide.title}, te recomiendo este orden:\n\n${fieldLines}\n\nResumen: ${formGuide.summary}`;
}

function getCurrentSubflowContext(question: string, currentPath: string, history: any[] = [], subflowContexts: SubflowContext[] = DEFAULT_SUBFLOW_CONTEXTS) {
  const path = normalizeText(currentPath).toLowerCase();
  const key = normalizeKey(question);
  const sorted = [...subflowContexts].sort((a, b) => b.routePrefix.length - a.routePrefix.length);
  const routeMatches = sorted.filter((item) => path.startsWith(item.routePrefix.toLowerCase()));

  const byAlias = routeMatches.find((item) =>
    path.startsWith(item.routePrefix.toLowerCase())
    && item.aliases.some((alias) => key.includes(normalizeKey(alias)))
  );
  if (byAlias) return byAlias;

  const lastAssistantText = normalizeKey(getLastAssistantText(history));
  const byHistory = routeMatches.find((item) =>
    path.startsWith(item.routePrefix.toLowerCase())
    && (lastAssistantText.includes(normalizeKey(item.title)) || item.aliases.some((alias) => lastAssistantText.includes(normalizeKey(alias))))
  );
  if (byHistory) return byHistory;

  return routeMatches.length === 1 ? routeMatches[0] : null;
}

function buildSubflowReply(greetingName: string, subflow: SubflowContext | null) {
  if (!subflow) return null;
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const hints = subflow.hints.length ? `\n\nEn este subflujo te recomiendo:\n${subflow.hints.map((item) => `- ${item}`).join("\n")}` : "";
  const examples = subflow.exampleQuestions.length ? `\n\nMe podés preguntar cosas como:\n${subflow.exampleQuestions.map((item) => `- ${item}`).join("\n")}` : "";
  return `${intro} Parece que estás en ${subflow.title}.\n\n${subflow.summary}${hints}${examples}`;
}

function buildFaqReply(greetingName: string, faq: AssistantFaq | null) {
  if (!faq) return null;
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";
  const summaryBlock = faq.summary ? `\n\n${faq.summary}` : "";
  const stepsBlock = faq.steps.length
    ? `\n\n${faq.kind === "DIAGNOSTICO" ? "Chequeo sugerido" : "Pasos sugeridos"}:\n${faq.steps.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
    : "";
  return `${intro} ${faq.title}.${summaryBlock}\n\n${faq.answer}${stepsBlock}`.trim();
}

function buildGestionProfeDetailedReply(greetingName: string, question: string) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";

  if (includesAny(question, ["asistencia"])) {
    return `${intro} Para usar el panel "Asistencia" en Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí el grupo y la materia.
3. Abrí el panel "Asistencia".
4. Seleccioná la fecha.
5. Marcá el estado de cada estudiante.
6. Si hay tardía, agregá minutos.
7. Si hace falta, escribí observación.
8. Presioná "Guardar asistencia".

Validaciones previas:
- Debés tener grupo y materia seleccionados.
- Debe existir lista de estudiantes.

Errores comunes:
- Si no ves estudiantes, revisá que el grupo tenga matrícula activa.
- Si no te carga bien, cambiá la fecha y volvé a intentar.`;
  }

  if (includesAny(question, ["registro de notas", "notas", "calificar"])) {
    return `${intro} Para usar "Registro de notas" en Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí el grupo y la materia.
3. Abrí el panel "Registro de notas".
4. Revisá los rubros visibles: Asistencia, Cotidiano, Tareas, Exámenes y total.
5. Usá el botón "Editar" en el rubro que querés ajustar.
6. Guardá el cambio.
7. Confirmá el resultado en "Ver detalle" o en "Reportes".

Validaciones previas:
- Debe existir una estructura de evaluación activa.
- El grupo tiene que tener estudiantes matriculados.

Errores comunes:
- Si faltan rubros, revisá la parametrización de evaluaciones.
- Si una nota no coincide, revisá primero el detalle del rubro y luego reportes.`;
  }

  if (includesAny(question, ["seguimiento diario", "cotidiano", "tareas", "indicadores"])) {
    return `${intro} Para usar "Seguimiento diario" en Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí grupo y materia.
3. Abrí el panel de seguimiento del rubro.
4. En "Rubro a calificar", elegí Cotidiano, Tareas o Exámenes.
5. En "Actividad evaluativa", elegí la actividad correcta.
6. Si el rubro usa indicadores, abrí "Asignar indicadores a actividades".
7. Marcá los indicadores y presioná "Guardar asignación de indicadores".
8. Luego elegí el "Indicador del planeamiento".
9. Marcá el nivel por estudiante.
10. Presioná "Calificar" o el guardado correspondiente.

Validaciones previas:
- Deben existir actividades creadas para ese rubro.
- Debe haber indicadores asignados si el flujo usa planeamiento.

Errores comunes:
- Si no aparecen indicadores, revisá "Planeamiento e Indicadores".
- Si faltan tareas o cotidianos, revisá que la plantilla tenga todas las actividades parametrizadas.`;
  }

  if (includesAny(question, ["planeamiento", "planeamiento e indicadores"])) {
    return `${intro} Para usar "Planeamiento e Indicadores" en Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí grupo y materia.
3. Abrí "Planeamiento e Indicadores".
4. En "Secciones", elegí una o varias.
5. En "Plantilla IA", escogé una plantilla o dejá la activa.
6. Seleccioná "Mes o meses".
7. Elegí la "Periodicidad".
8. Escribí la "Competencia general".
9. Marcá "Seleccioná las habilidades".
10. Presioná "Generar planeamiento con IA".
11. Revisá el resultado.
12. Guardá el planeamiento.

Validaciones previas:
- Debés tener grupo y materia seleccionados.
- Deben existir habilidades de planeamiento cargadas.

Errores comunes:
- Si no te aparecen habilidades, revisá el catálogo de habilidades.
- Si no podés usar indicadores después, verificá que hayan quedado activos para evaluaciones y reportes.`;
  }

  if (includesAny(question, ["reportes"])) {
    return `${intro} Para usar "Reportes" en Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí grupo y materia.
3. Abrí el panel "Reportes".
4. Elegí el tipo de reporte.
5. Revisá el resumen general del grupo.
6. Bajá a la tabla del reporte correspondiente.
7. Si querés, exportá en Excel, CSV o PDF según el botón disponible.

Validaciones previas:
- Debe existir información calificada o asistencia guardada.

Errores comunes:
- Si un reporte sale vacío, revisá primero que ya existan datos guardados en notas o asistencia.
- Si un alumno trasladado sale raro, compará con Registro de notas antes de exportar.`;
  }

  if (includesAny(question, ["horario"])) {
    return `${intro} Para ver el horario desde Gestion del Profe:

1. Entrá a "Gestion del Profe".
2. Elegí grupo y materia.
3. Abrí el panel de horario.
4. Revisá los bloques por día.
5. Si querés trabajar una materia desde el horario, usá la selección correspondiente.

Error común:
- Si no aparecen bloques, revisá en Administrativo que el "Horario de clases" esté creado.`;
  }

  return null;
}

function buildAdministrativoDetailedReply(greetingName: string, question: string) {
  const intro = greetingName ? `Hola ${greetingName}.` : "Hola.";

  const guides = [
    {
      aliases: ["año lectivo", "ano lectivo"],
      title: "Año Lectivo",
      body: `1. Abrí "Año Lectivo".\n2. Creá o editá el año base.\n3. Guardá antes de seguir con periodos o grupos.\n\nSi no existe año lectivo activo, muchos procesos académicos no van a funcionar.`
    },
    {
      aliases: ["periodos", "periodos academicos"],
      title: "Periodos",
      body: `1. Entrá a "Periodos".\n2. Creá los trimestres o periodos.\n3. Guardá.\n\nSi faltan periodos, luego no vas a poder ordenar bien cargas académicas y reportes.`
    },
    {
      aliases: ["gestion de grupos", "grupos", "secciones"],
      title: "Gestión de grupos",
      body: `1. Entrá a "Gestión de grupos".\n2. Creá la sección o grupo.\n3. Guardá.\n\nEste paso va antes de asignar docentes, materias por grupo o matrícula.`
    },
    {
      aliases: ["materias"],
      title: "Materias",
      body: `1. Entrá a "Materias".\n2. Creá o editá las asignaturas.\n3. Guardá.\n\nSi una materia no existe aquí, luego no la vas a poder usar en asignaciones ni horarios.`
    },
    {
      aliases: ["materias por grupo", "grupos materia"],
      title: "Materias por grupo",
      body: `1. Entrá a "Materias por grupo".\n2. Elegí grupo, materia y periodo.\n3. Guardá.\n\nEste paso define qué recibe cada grupo y va antes del horario de clases.`
    },
    {
      aliases: ["asignacion docentes", "asignacion de docentes", "docentes"],
      title: "Asignación Docentes",
      body: `1. Entrá a "Asignación Docentes".\n2. Elegí grupo, materia y docente.\n3. Guardá.\n\nSi esto falta, luego el profesor no verá correctamente su grupo o materia.`
    },
    {
      aliases: ["bloque horario", "bloques"],
      title: "Bloque Horario",
      body: `1. Entrá a "Bloque Horario".\n2. Creá cada franja horaria.\n3. Guardá.\n\nEste paso va antes de "Horario de clases".`
    },
    {
      aliases: ["horario de clases", "horarios"],
      title: "Horario de clases",
      body: `1. Entrá a "Horario de clases".\n2. Elegí grupo, materia, día y bloque.\n3. Guardá cada cruce.\n\nSi no existe "Materias por grupo" o "Bloque Horario", aquí te va a faltar información.`
    },
    {
      aliases: ["fecha de clases", "fechas de clase"],
      title: "Fecha de clases",
      body: `1. Entrá a "Fecha de clases".\n2. Generá o ajustá las fechas por grupo.\n3. Guardá.\n\nEsto sirve para afinar operación real del calendario académico.`
    },
    {
      aliases: ["dias lectivos", "dias hábiles", "dias habiles"],
      title: "Días Lectivos",
      body: `1. Entrá a "Días Lectivos".\n2. Marcá los días hábiles de clase.\n3. Guardá.\n\nSi esto está mal, se pueden afectar horarios y validaciones futuras.`
    },
    {
      aliases: ["feriados"],
      title: "Feriados",
      body: `1. Entrá a "Feriados".\n2. Registrá fecha y nombre.\n3. Guardá.\n\nSi falta un feriado, después puede aparecer como día normal en procesos académicos.`
    },
    {
      aliases: ["correo institucional", "correo"],
      title: "Correo Institucional",
      body: `1. Entrá a "Correo Institucional".\n2. Configurá dominio, remitente o plantilla disponible.\n3. Guardá.\n\nSi esto está incompleto, las notificaciones pueden no salir bien.`
    },
    {
      aliases: ["mensajes"],
      title: "Mensajes",
      body: `1. Entrá a "Mensajes".\n2. Elegí tipo de uso.\n3. Escribí título y cuerpo.\n4. Guardá.\n\nEstos mensajes luego se usan para informar al encargado en flujos de seguimiento.`
    }
  ];

  const match = guides.find((item) => item.aliases.some((alias) => includesAny(question, [alias])));
  if (!match) return null;
  return `${intro} Te guio con ${match.title} en Administrativo:\n\n${match.body}`;
}
function buildDirectReply(question: string, userName: string, userDisplayName: string, context: any, history: any[] = []) {
  const greetingName = userDisplayName || userName;
  const currentPath = normalizeText(context?.currentPath);
  const accessibleGuides = Array.isArray(context?.accessibleModuleGuides) ? context.accessibleModuleGuides : [];
  const accessibleDetailGuides = Array.isArray(context?.assistantDetailGuides) ? context.assistantDetailGuides : [];
  const actionPatterns = Array.isArray(context?.assistantActionPatterns) ? context.assistantActionPatterns : DEFAULT_ACTION_PATTERNS;
  const conversationPatterns = Array.isArray(context?.assistantConversationPatterns) ? context.assistantConversationPatterns : [];
  const exampleQuestions = Array.isArray(context?.assistantExampleQuestions) ? context.assistantExampleQuestions : [];
  const screenContexts = Array.isArray(context?.assistantScreenContexts) ? context.assistantScreenContexts : DEFAULT_SCREEN_CONTEXTS;
  const formGuides = Array.isArray(context?.assistantFormGuides) ? context.assistantFormGuides : DEFAULT_FORM_GUIDES;
  const subflowContexts = Array.isArray(context?.assistantSubflowContexts) ? context.assistantSubflowContexts : DEFAULT_SUBFLOW_CONTEXTS;
  const faqs = Array.isArray(context?.assistantFaqs) ? context.assistantFaqs : [];
  const screenSnapshot = (context?.screenSnapshot || null) as AssistantScreenSnapshot | null;
  const screenFocus = Array.isArray(context?.screenFocus) ? context.screenFocus : [];
  const currentScreenContext = getCurrentScreenContext(currentPath, screenContexts);
  const currentSubflowContext = getCurrentSubflowContext(question, currentPath, history, subflowContexts);
  const matchedFaq = resolveFaqFromQuestion(question, currentPath, faqs);
  const matchedGuide = resolveGuideFromQuestion(question, currentPath, accessibleGuides);
  const matchedDetailGuide = resolveDetailGuideFromQuestion(question, currentPath, accessibleDetailGuides);
  const actionGuide = inferGuideFromAction(question, accessibleGuides, actionPatterns);
  const gestionProfeDetailedReply = currentPath.startsWith("/gestion-profe") ? buildGestionProfeDetailedReply(greetingName, question) : null;
  const administrativoDetailedReply = currentPath.startsWith("/administrativo") || currentPath.startsWith("/academico")
    ? buildAdministrativoDetailedReply(greetingName, question)
    : null;
  const canManageUsers = accessibleGuides.some((guide) => guide.key === "usuarios");
  if (isGreetingOnly(question)) {
    return greetingName
      ? `Hola ${greetingName}! Que gusto saludarte. Estoy listo para ayudarte con estudiantes, grupos, horarios, notas, asistencia y reportes. Que necesitas hacer en PROFE360?`
      : "Hola! Que gusto saludarte. Estoy aqui para ayudarte con el uso de PROFE360. Que necesitas hacer?";
  }

  if (isThanksOnly(question)) {
    return greetingName
      ? `Con mucho gusto, ${greetingName}. Cuando necesites algo más en PROFE360, aquí estoy para ayudarte.`
      : "Con mucho gusto. Cuando necesites algo más en PROFE360, aquí estoy para ayudarte.";
  }

  if (isGoodbyeOnly(question)) {
    return greetingName
      ? `Hasta luego, ${greetingName}. Que te vaya muy bien. Cuando ocupes ayuda en PROFE360, con gusto te acompaño.`
      : "Hasta luego. Que te vaya muy bien. Cuando ocupes ayuda en PROFE360, con gusto te acompaño.";
  }

  if (
    matchesConversationPattern(question, conversationPatterns, "SCHOOL_NAME", [
      "como se llama el colegio",
      "cual es el nombre del colegio",
      "como se llama la institucion",
      "cual es el nombre de la institucion"
    ])
  ) {
    const institucion = context?.institucion;
    const institutionName = institucion?.NombreOficialBoleta || institucion?.NombreComercial || institucion?.Nombre;
    if (institutionName) {
      return `${greetingName ? `Hola ${greetingName}. ` : ""}El nombre del colegio que tengo asociado en tu sesión es: ${institutionName}.`;
    }
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Ahorita no pude leer el nombre del colegio desde tu sesión. Si querés, lo revisamos por el módulo "Instituciones".`;
  }

  if (
    matchesConversationPattern(question, conversationPatterns, "FORGOT_PASSWORD", [
      "se me olvido la clave",
      "olvide mi clave",
      "no recuerdo mi clave",
      "como recupero mi clave"
    ])
  ) {
    return buildForgotPasswordReply(greetingName, currentPath, canManageUsers);
  }

  if (
    matchesConversationPattern(question, conversationPatterns, "AFFIRM_CONTINUE", [
      "ok",
      "oki",
      "okey",
      "dale",
      "esta bien",
      "está bien",
      "si dale",
      "perfecto",
      "de una"
    ])
  ) {
    const previousPromptOfferedFollowup = /CAMPO POR CAMPO|DECIME CUAL TE EXPLICO|SI QUERES.*TE EXPLICO/i.test(normalizeKey(getLastAssistantText(history)));
    if (previousPromptOfferedFollowup) {
      const followup = getFollowupGuideFromHistory(history, accessibleGuides, accessibleDetailGuides);
      const reply = buildFieldByFieldFollowupReply(greetingName, followup.guide, followup.detailGuide, accessibleDetailGuides, exampleQuestions);
      if (reply) return reply;
    }
  }

  if (
    matchesConversationPattern(question, conversationPatterns, "ADMIN_OVERVIEW", [
      "que hay en administrativo",
      "que tiene administrativo",
      "que encuentro en administrativo",
      "que puedo hacer en administrativo"
    ])
  ) {
    return buildAdministrativeOverviewReply(greetingName, accessibleDetailGuides);
  }

  if (matchesConversationPattern(question, conversationPatterns, "CURRENT_SUBFLOW", ["que hago aqui", "ayudame aqui", "que sigue aqui", "aca que hago", "ahora que hago", "y aca", "y aqui", "y aca que se hace", "y aqui que se hace", "sabes en que pantalla estoy"])) {
    const reply = buildSubflowReply(greetingName, currentSubflowContext);
    if (reply) return reply;
  }

  if (isCurrentScreenQuestion(question)) {
    const reply = buildCurrentScreenReply(greetingName, currentScreenContext);
    if (reply) return reply;
    const liveReply = buildLiveScreenSnapshotReply(greetingName, screenSnapshot, screenFocus);
    if (liveReply) return liveReply;
  }

  if (isFormGuidanceQuestion(question)) {
    const reply = buildFormGuideReply(greetingName, getCurrentFormGuide(question, currentPath, formGuides));
    if (reply) return reply;
  }

  if (isAccessQuestion(question) && accessibleGuides.length) {
    return buildAccessibleModulesReply(greetingName, accessibleGuides);
  }

  if (isWhatElseQuestion(question) && accessibleGuides.length) {
    return buildWhatElseReply(greetingName, accessibleGuides);
  }

  if (matchedFaq) {
    return buildFaqReply(greetingName, matchedFaq);
  }

  if (matchedDetailGuide && (isHowToQuestion(question) || isModuleSelection(question, { key: matchedDetailGuide.detailKey, title: matchedDetailGuide.title, path: matchedDetailGuide.routePrefix, aliases: matchedDetailGuide.aliases, summary: matchedDetailGuide.summary, steps: matchedDetailGuide.steps }))) {
    return buildDetailGuideReply(greetingName, matchedDetailGuide);
  }

  if (matchedGuide && (isHowToQuestion(question) || isModuleSelection(question, matchedGuide))) {
    return buildModuleGuideReply(greetingName, matchedGuide);
  }

  if (actionGuide) {
    return buildModuleGuideReply(greetingName, actionGuide);
  }

  if (gestionProfeDetailedReply && isHowToQuestion(question)) {
    return gestionProfeDetailedReply;
  }

  if (administrativoDetailedReply && isHowToQuestion(question)) {
    return administrativoDetailedReply;
  }

  if (isStudentInfoQuestion(question) && !context?.studentId) {
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Sí, con gusto te puedo ayudar con información de un alumno. Mandame la cédula o el nombre completo y te digo lo que encuentre en el sistema.`;
  }

  if (isPlaneamientoHelpQuestion(question, currentPath)) {
    return buildPlaneamientoGuideReply(greetingName, currentPath);
  }

  if (!userName && /^(soy|me llamo|mi nombre es)\b/i.test(normalizeText(question))) {
    const possibleName = normalizeText(question).replace(/^(soy|me llamo|mi nombre es)\s+/i, "").trim();
    return `¡Mucho gusto, ${possibleName}! Estoy aquí para apoyarte en el uso de PROFE360.\n\nDecime qué necesitás hacer en la plataforma y te guío paso a paso. Por ejemplo:\n- cargar notas\n- revisar asistencia\n- consultar horarios\n- buscar un estudiante\n- ver reportes`;
  }

  if (!userName && looksLikePersonName(question)) {
    const possibleName = normalizeText(question);
    return `¡Mucho gusto, ${possibleName}! Estoy aquí para apoyarte en el uso de PROFE360.\n\nDecime qué necesitás hacer en la plataforma y te guío paso a paso. Por ejemplo:\n- cargar notas\n- revisar asistencia\n- consultar horarios\n- buscar un estudiante\n- ver reportes`;
  }

  if (context?.studentId && Array.isArray(context?.notasAlumno) && context.notasAlumno.length > 0) {
    const first = context.notasAlumno[0];
    const studentName = formatStudentName(first);
    const items = context.notasAlumno.slice(0, 6).map((item: any) => {
      const pct = item?.PorcentajeObtenido !== null && item?.PorcentajeObtenido !== undefined
        ? `${Number(item.PorcentajeObtenido).toFixed(2)}%`
        : "Sin porcentaje";
      return `- ${item.MateriaNombre} | ${item.ActividadNombre}: ${pct}`;
    }).join("\n");
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Encontré notas del estudiante ${studentName} con cédula ${context.studentId}.\n${items}\nSi querés, te lo puedo filtrar por grupo, materia o solo promedio final.`;
  }

  if (context?.studentId && Array.isArray(context?.estudiantes) && context.estudiantes.length > 0) {
    const student = context.estudiantes[0];
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Encontré al estudiante ${student.Nombre} ${student.PrimerApellido || ""} ${student.SegundoApellido || ""} con cédula ${student.Identificacion}. Está relacionado con el grupo ${student.GrupoNombre || "sin grupo visible"}${student.MateriaNombre ? ` y la materia ${student.MateriaNombre}` : ""}. Si querés, ahora te muestro notas, asistencia o reportes.`;
  }

  if (context?.sectionName && Array.isArray(context?.horariosSeccion) && context.horariosSeccion.length > 0) {
    const items = context.horariosSeccion.slice(0, 10).map((item: any) =>
      `- Día ${item.DiaSemana}: ${item.MateriaNombre} | ${item.BloqueNombre} | ${item.HoraInicio}-${item.HoraFin}`
    ).join("\n");
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Encontré horario para la sección ${context.sectionName}.\n${items}\nSi querés, te lo organizo por día o solo por materia.`;
  }

  if (context?.sectionName && /HORARIO/.test(String(context?.intent || ""))) {
    return `${greetingName ? `Hola ${greetingName}. ` : ""}Todavía no encontré horario para la sección ${context.sectionName} con los datos disponibles. Si querés, probá con otra sección o decime también la materia.`;
  }

  return null;
}

async function callAssistantModel(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EVAL360_MODEL || process.env.OPENAI_PLANEAMIENTO_MODEL || "gpt-4.1-mini",
      input: prompt
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI assistant error: ${response.status} ${text}`);
  }

  const data: any = await response.json();
  return data?.output_text || data?.output?.[0]?.content?.[0]?.text || null;
}

async function buildContext(pool: any, req: any, question: string, currentPath?: string, screenSnapshotInput?: any) {
  const auth = getAuth(req);
  const institucionId = isSuperAdmin(req) ? null : Number(auth.institucionId || 0);
  const usuarioId = getUserId(req);
  const assistantKnowledge = await loadAssistantKnowledge(pool);
  const assistantAdminInstructions = await loadAssistantAdminInstructions(pool, req, false);
  const lookup = extractLookupTerm(question);
  const intent = detectIntent(question);
  const studentId = extractStudentId(question);
  const sectionName = extractSectionName(question);
  const accessibleModuleGuides = getAccessibleModuleGuides(req, assistantKnowledge.guides);
  const assistantDetailGuides = getAccessibleDetailGuides(req, assistantKnowledge.detailGuides);
  const assistantFaqs = getAccessibleFaqs(req, assistantKnowledge.faqs);
  const screenSnapshot = normalizeScreenSnapshot(screenSnapshotInput);
  const screenFocus = inferScreenFocus(screenSnapshot);
  const q = normalizeLike(lookup);

  const makeRequest = () => pool.request().input("q", sql.NVarChar(250), q).input("usuarioId", sql.Int, usuarioId);
  let filtroInstitucion = "";
  if (institucionId !== null) {
    filtroInstitucion = "AND ad.InstitucionId = @institucionId";
  }
  const filtroProfesor = isProfesor(req) && !isSuperAdmin(req) ? "AND ad.UsuarioId = @usuarioId" : "";

  const gruposRequest = makeRequest();
  if (institucionId !== null) gruposRequest.input("institucionId", sql.Int, Number(institucionId));
  const grupos = await gruposRequest.query(`
    SELECT TOP 8
      ad.GrupoId,
      g.Nombre AS GrupoNombre,
      ad.MateriaId,
      m.Nombre AS MateriaNombre,
      ad.AnioLectivoId,
      al.Nombre AS AnioLectivoNombre,
      ad.PeriodoId,
      p.Nombre AS PeriodoNombre
    FROM dbo.AsignacionDocente ad
    INNER JOIN dbo.Grupo g ON g.GrupoId = ad.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
    INNER JOIN dbo.AnioLectivo al ON al.AnioLectivoId = ad.AnioLectivoId
    LEFT JOIN dbo.Periodo p ON p.PeriodoId = ad.PeriodoId
    WHERE ad.Activo = 1
      ${filtroInstitucion}
      ${filtroProfesor}
      AND (
        @q = N'%%'
        OR g.Nombre LIKE @q
        OR ISNULL(g.Nivel, N'') LIKE @q
        OR ISNULL(m.Nombre, N'') LIKE @q
        OR ISNULL(al.Nombre, N'') LIKE @q
        OR ISNULL(p.Nombre, N'') LIKE @q
      )
    ORDER BY ad.AnioLectivoId DESC, ad.PeriodoId DESC, g.Nombre, m.Nombre
  `);

  const estudiantesRequest = makeRequest();
  if (institucionId !== null) estudiantesRequest.input("institucionId", sql.Int, Number(institucionId));
  const estudiantes = await estudiantesRequest.query(`
    SELECT TOP 8
      e.EstudianteId,
      e.Identificacion,
      e.Nombre,
      e.PrimerApellido,
      e.SegundoApellido,
      g.Nombre AS GrupoNombre,
      m2.Nombre AS MateriaNombre,
      ma.AnioLectivoId
    FROM dbo.Matricula ma
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = ma.EstudianteId
    INNER JOIN dbo.Grupo g ON g.GrupoId = ma.GrupoId
    OUTER APPLY (
      SELECT TOP 1 m.Nombre
      FROM dbo.AsignacionDocente ad
      INNER JOIN dbo.Materia m ON m.MateriaId = ad.MateriaId
      WHERE ad.GrupoId = ma.GrupoId
        AND ad.AnioLectivoId = ma.AnioLectivoId
        AND ad.Activo = 1
        ${institucionId !== null ? "AND ad.InstitucionId = @institucionId" : ""}
        ${isProfesor(req) && !isSuperAdmin(req) ? "AND ad.UsuarioId = @usuarioId" : ""}
      ORDER BY ad.AsignacionDocenteId DESC
    ) m2
    WHERE ma.Estado <> N'Inactiva'
      AND e.Activo = 1
      ${institucionId !== null ? "AND e.InstitucionId = @institucionId" : ""}
      AND (
        @q = N'%%'
        OR e.Identificacion LIKE @q
        OR e.Nombre LIKE @q
        OR e.PrimerApellido LIKE @q
        OR e.SegundoApellido LIKE @q
        OR CONCAT(ISNULL(e.Nombre, N''), N' ', ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N'')) LIKE @q
        OR g.Nombre LIKE @q
      )
    ORDER BY ma.AnioLectivoId DESC, e.PrimerApellido, e.SegundoApellido, e.Nombre
  `);

  const horariosRequest = makeRequest();
  if (institucionId !== null) horariosRequest.input("institucionId", sql.Int, Number(institucionId));
  const horarios = await horariosRequest.query(`
    SELECT TOP 10
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      hg.DiaSemana,
      bh.Nombre AS BloqueNombre,
      CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
      CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId AND gm.Activo = 1
    INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
    INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
    WHERE hg.Activo = 1
      AND (
        @q = N'%%'
        OR g.Nombre LIKE @q
        OR m.Nombre LIKE @q
        OR bh.Nombre LIKE @q
      )
      ${institucionId !== null ? "AND g.InstitucionId = @institucionId" : ""}
      ${isProfesor(req) && !isSuperAdmin(req) ? `
        AND EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.GrupoId = gm.GrupoId
            AND ad.MateriaId = gm.MateriaId
            AND ad.Activo = 1
            AND ad.UsuarioId = @usuarioId
        )` : ""}
    ORDER BY g.Nombre, m.Nombre, hg.DiaSemana, bh.OrdenVisual
  `);

  const notasRequest = makeRequest();
  if (institucionId !== null) notasRequest.input("institucionId", sql.Int, Number(institucionId));
  const notas = await notasRequest.query(`
    SELECT TOP 8
      e.Identificacion,
      CONCAT(ISNULL(e.Nombre, N''), N' ', ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N'')) AS Estudiante,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      act.Nombre AS ActividadNombre,
      na.PorcentajeObtenido,
      na.PuntosObtenidos
    FROM dbo.Eval360_NotaActividad na
    INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = na.ActividadId
    INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = act.EstructuraGrupoId
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = na.EstudianteId
    INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
    WHERE (
        @q = N'%%'
        OR e.Identificacion LIKE @q
        OR e.Nombre LIKE @q
        OR e.PrimerApellido LIKE @q
        OR e.SegundoApellido LIKE @q
        OR g.Nombre LIKE @q
        OR m.Nombre LIKE @q
        OR act.Nombre LIKE @q
      )
      ${institucionId !== null ? "AND eg.InstitucionId = @institucionId" : ""}
      ${isProfesor(req) && !isSuperAdmin(req) ? "AND eg.UsuarioId = @usuarioId" : ""}
    ORDER BY na.NotaActividadId DESC
  `);

  const asistenciaRequest = makeRequest();
  if (institucionId !== null) asistenciaRequest.input("institucionId", sql.Int, Number(institucionId));
  const asistencia = await asistenciaRequest.query(`
    SELECT TOP 8
      e.Identificacion,
      CONCAT(ISNULL(e.Nombre, N''), N' ', ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N'')) AS Estudiante,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      CONVERT(varchar(10), ar.Fecha, 23) AS Fecha,
      ar.Estado
    FROM dbo.AsistenciaRegistro ar
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = ar.EstudianteId
    INNER JOIN dbo.Grupo g ON g.GrupoId = ar.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = ar.MateriaId
    WHERE (
        @q = N'%%'
        OR e.Identificacion LIKE @q
        OR e.Nombre LIKE @q
        OR e.PrimerApellido LIKE @q
        OR e.SegundoApellido LIKE @q
        OR g.Nombre LIKE @q
        OR m.Nombre LIKE @q
      )
      ${institucionId !== null ? "AND g.InstitucionId = @institucionId" : ""}
      ${isProfesor(req) && !isSuperAdmin(req) ? `
        AND EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.GrupoId = ar.GrupoId
            AND ad.MateriaId = ar.MateriaId
            AND ad.AnioLectivoId = ar.AnioLectivoId
            AND ad.PeriodoId = ar.PeriodoId
            AND ad.Activo = 1
            AND ad.UsuarioId = @usuarioId
        )` : ""}
    ORDER BY ar.AsistenciaRegistroId DESC
  `);

  const notasAlumnoRequest = makeRequest();
  const horariosSeccionRequest = makeRequest();
  if (institucionId !== null) {
    notasAlumnoRequest.input("institucionId", sql.Int, Number(institucionId));
    horariosSeccionRequest.input("institucionId", sql.Int, Number(institucionId));
  }
  if (studentId) notasAlumnoRequest.input("studentId", sql.NVarChar(40), studentId);
  if (sectionName) horariosSeccionRequest.input("sectionName", sql.NVarChar(50), sectionName);

  const notasAlumno = studentId ? await notasAlumnoRequest.query(`
    SELECT TOP 20
      e.Identificacion,
      CONCAT(ISNULL(e.Nombre, N''), N' ', ISNULL(e.PrimerApellido, N''), N' ', ISNULL(e.SegundoApellido, N'')) AS Estudiante,
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      act.Nombre AS ActividadNombre,
      na.PorcentajeObtenido,
      na.PuntosObtenidos
    FROM dbo.Eval360_NotaActividad na
    INNER JOIN dbo.Eval360_Actividad act ON act.ActividadId = na.ActividadId
    INNER JOIN dbo.Eval360_EstructuraGrupo eg ON eg.EstructuraGrupoId = act.EstructuraGrupoId
    INNER JOIN dbo.Estudiante e ON e.EstudianteId = na.EstudianteId
    INNER JOIN dbo.Grupo g ON g.GrupoId = eg.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = eg.MateriaId
    WHERE e.Identificacion = @studentId
      ${institucionId !== null ? "AND eg.InstitucionId = @institucionId" : ""}
      ${isProfesor(req) && !isSuperAdmin(req) ? "AND eg.UsuarioId = @usuarioId" : ""}
    ORDER BY na.NotaActividadId DESC
  `) : { recordset: [] };

  const horariosSeccion = sectionName ? await horariosSeccionRequest.query(`
    SELECT TOP 20
      g.Nombre AS GrupoNombre,
      m.Nombre AS MateriaNombre,
      hg.DiaSemana,
      bh.Nombre AS BloqueNombre,
      CONVERT(varchar(5), bh.HoraInicio, 108) AS HoraInicio,
      CONVERT(varchar(5), bh.HoraFin, 108) AS HoraFin
    FROM dbo.HorarioGrupo hg
    INNER JOIN dbo.GrupoMateria gm ON gm.GrupoMateriaId = hg.GrupoMateriaId AND gm.Activo = 1
    INNER JOIN dbo.Grupo g ON g.GrupoId = gm.GrupoId
    INNER JOIN dbo.Materia m ON m.MateriaId = gm.MateriaId
    INNER JOIN dbo.BloqueHorario bh ON bh.BloqueHorarioId = hg.BloqueHorarioId
    WHERE hg.Activo = 1
      AND g.Nombre = @sectionName
      ${institucionId !== null ? "AND g.InstitucionId = @institucionId" : ""}
      ${isProfesor(req) && !isSuperAdmin(req) ? `
        AND EXISTS (
          SELECT 1
          FROM dbo.AsignacionDocente ad
          WHERE ad.GrupoId = gm.GrupoId
            AND ad.MateriaId = gm.MateriaId
            AND ad.Activo = 1
            AND ad.UsuarioId = @usuarioId
        )` : ""}
    ORDER BY hg.DiaSemana, bh.OrdenVisual, m.Nombre
  `) : { recordset: [] };

  const institucion = institucionId !== null
    ? await pool.request()
      .input("institucionId", sql.Int, Number(institucionId))
      .query(`
        SELECT TOP 1
          InstitucionId,
          Nombre,
          NombreComercial,
          NombreOficialBoleta
        FROM dbo.Institucion
        WHERE InstitucionId = @institucionId
      `)
    : { recordset: [] };

  return {
    currentPath: currentPath || "/",
    screenSnapshot,
    screenFocus,
    intent,
    lookup,
    studentId,
    sectionName,
    assistantActionPatterns: assistantKnowledge.actions,
    assistantConversationPatterns: assistantKnowledge.conversationPatterns,
    assistantExampleQuestions: assistantKnowledge.exampleQuestions,
    assistantScreenContexts: assistantKnowledge.screenContexts,
    assistantFormGuides: assistantKnowledge.formGuides,
    assistantSubflowContexts: assistantKnowledge.subflowContexts,
    assistantFaqs,
    assistantAdminInstructions,
    accessibleModuleGuides,
    assistantDetailGuides,
    institucion: institucion.recordset?.[0] || null,
    grupos: grupos.recordset || [],
    estudiantes: estudiantes.recordset || [],
    horarios: horarios.recordset || [],
    notas: notas.recordset || [],
    asistencia: asistencia.recordset || [],
    notasAlumno: notasAlumno.recordset || [],
    horariosSeccion: horariosSeccion.recordset || [],
    reportesDisponibles: [
      "Reportes de Gestión del Profe",
      "Registro de notas",
      "Reporte de asistencia",
      "Reporte de cotidiano",
      "Reporte de tareas",
      "Reporte de exámenes"
    ]
  };
}

router.get("/admin/instructions", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }
    const pool = await getPool();
    const instructions = await loadAssistantAdminInstructions(pool, req, true);
    return ok(res, { items: instructions });
  } catch (error) {
    console.error("Error listando indicaciones del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudieron cargar las indicaciones de Margarita" });
  }
});

router.get("/admin/knowledge", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }
    const pool = await getPool();
    const knowledge = await loadAssistantKnowledge(pool);
    return ok(res, {
      modules: knowledge.guides,
      details: knowledge.detailGuides,
      conversationPatterns: knowledge.conversationPatterns,
      exampleQuestions: knowledge.exampleQuestions,
      screenContexts: knowledge.screenContexts,
      formGuides: knowledge.formGuides,
      subflowContexts: knowledge.subflowContexts,
      faqs: knowledge.faqs
    });
  } catch (error) {
    console.error("Error cargando base de conocimiento del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo cargar la base de conocimiento de Margarita" });
  }
});

router.put("/admin/detail-guides/:moduleKey/:detailKey", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }

    const moduleKey = normalizeText(req.params.moduleKey);
    const detailKey = normalizeText(req.params.detailKey);
    const title = normalizeText(req.body?.title);
    const routePrefix = normalizeText(req.body?.routePrefix);
    const summary = normalizeText(req.body?.summary);
    const aliases = normalizeTextArray(req.body?.aliases);
    const steps = normalizeTextArray(req.body?.steps);
    const validations = normalizeTextArray(req.body?.validations);
    const commonErrors = normalizeTextArray(req.body?.commonErrors);
    const correctiveActions = normalizeTextArray(req.body?.correctiveActions);

    if (!moduleKey || !detailKey) return badRequest(res, "El modulo y el detalle son obligatorios");
    if (!title) return badRequest(res, "El titulo es obligatorio");
    if (!routePrefix) return badRequest(res, "La ruta es obligatoria");
    if (!summary) return badRequest(res, "El resumen es obligatorio");

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const guideResult = await new sql.Request(transaction)
        .input("moduleKey", sql.NVarChar(80), moduleKey)
        .input("detailKey", sql.NVarChar(80), detailKey)
        .query(`
          SELECT TOP 1 AsistenteDetalleGuiaId
          FROM dbo.AsistenteDetalleGuia
          WHERE ModuloClave = @moduleKey
            AND ClaveDetalle = @detailKey
        `);

      const guideId = Number(guideResult.recordset?.[0]?.AsistenteDetalleGuiaId || 0);
      if (!guideId) {
        await transaction.rollback();
        return res.status(404).json({ ok: false, message: "No se encontro el panel base a modificar" });
      }

      await new sql.Request(transaction)
        .input("guideId", sql.Int, guideId)
        .input("title", sql.NVarChar(150), title)
        .input("routePrefix", sql.NVarChar(200), routePrefix)
        .input("summary", sql.NVarChar(sql.MAX), summary)
        .query(`
          UPDATE dbo.AsistenteDetalleGuia
          SET
            Titulo = @title,
            RutaContexto = @routePrefix,
            Resumen = @summary,
            UpdatedAt = SYSDATETIME()
          WHERE AsistenteDetalleGuiaId = @guideId
        `);

      await new sql.Request(transaction)
        .input("guideId", sql.Int, guideId)
        .query(`
          UPDATE dbo.AsistenteDetalleAlias
          SET Activo = 0, UpdatedAt = SYSDATETIME()
          WHERE AsistenteDetalleGuiaId = @guideId;

          UPDATE dbo.AsistenteDetalleItem
          SET Activo = 0, UpdatedAt = SYSDATETIME()
          WHERE AsistenteDetalleGuiaId = @guideId;
        `);

      if (aliases.length) {
        await new sql.Request(transaction)
          .input("guideId", sql.Int, guideId)
          .input("aliasesJson", sql.NVarChar(sql.MAX), JSON.stringify(aliases))
          .query(`
            INSERT INTO dbo.AsistenteDetalleAlias (
              AsistenteDetalleGuiaId, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt
            )
            SELECT
              @guideId,
              value,
              [key] + 1,
              1,
              SYSDATETIME(),
              SYSDATETIME()
            FROM OPENJSON(@aliasesJson);
          `);
      }

      const detailItems = [
        ...steps.map((descripcion, index) => ({ tipo: "PASO", descripcion, orden: index + 1 })),
        ...validations.map((descripcion, index) => ({ tipo: "VALIDACION", descripcion, orden: index + 1 })),
        ...commonErrors.map((descripcion, index) => ({ tipo: "ERROR", descripcion, orden: index + 1 })),
        ...correctiveActions.map((descripcion, index) => ({ tipo: "ACCION", descripcion, orden: index + 1 }))
      ];

      if (detailItems.length) {
        await new sql.Request(transaction)
          .input("guideId", sql.Int, guideId)
          .input("itemsJson", sql.NVarChar(sql.MAX), JSON.stringify(detailItems))
          .query(`
            INSERT INTO dbo.AsistenteDetalleItem (
              AsistenteDetalleGuiaId, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt
            )
            SELECT
              @guideId,
              JSON_VALUE(value, '$.tipo'),
              JSON_VALUE(value, '$.descripcion'),
              TRY_CAST(JSON_VALUE(value, '$.orden') AS INT),
              1,
              SYSDATETIME(),
              SYSDATETIME()
            FROM OPENJSON(@itemsJson);
          `);
      }

      await transaction.commit();
      assistantKnowledgeCache = null;
      return ok(res, { updated: true });
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (error) {
    console.error("Error actualizando panel base del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el panel base de Margarita" });
  }
});

router.put("/admin/module-guides", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const moduleKey = normalizeText(req.body?.key);
    const title = normalizeText(req.body?.title);
    const path = normalizeText(req.body?.path);
    const summary = normalizeText(req.body?.summary);
    const aliases = normalizeTextArray(req.body?.aliases);
    const steps = normalizeTextArray(req.body?.steps);
    if (!moduleKey || !title || !path || !summary) return badRequest(res, "Faltan datos obligatorios del modulo");

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const guideResult = await new sql.Request(transaction)
        .input("moduleKey", sql.NVarChar(80), moduleKey)
        .query(`SELECT TOP 1 AsistenteModuloGuiaId FROM dbo.AsistenteModuloGuia WHERE Clave = @moduleKey`);
      const guideId = Number(guideResult.recordset?.[0]?.AsistenteModuloGuiaId || 0);
      if (!guideId) {
        await transaction.rollback();
        return res.status(404).json({ ok: false, message: "No se encontro el modulo a modificar" });
      }

      await new sql.Request(transaction)
        .input("guideId", sql.Int, guideId)
        .input("title", sql.NVarChar(150), title)
        .input("path", sql.NVarChar(200), path)
        .input("summary", sql.NVarChar(sql.MAX), summary)
        .query(`
          UPDATE dbo.AsistenteModuloGuia
          SET Titulo = @title, Ruta = @path, Resumen = @summary, UpdatedAt = SYSDATETIME()
          WHERE AsistenteModuloGuiaId = @guideId;
          UPDATE dbo.AsistenteModuloAlias SET Activo = 0, UpdatedAt = SYSDATETIME() WHERE AsistenteModuloGuiaId = @guideId;
          UPDATE dbo.AsistenteModuloPaso SET Activo = 0, UpdatedAt = SYSDATETIME() WHERE AsistenteModuloGuiaId = @guideId;
        `);

      if (aliases.length) {
        await new sql.Request(transaction)
          .input("guideId", sql.Int, guideId)
          .input("aliasesJson", sql.NVarChar(sql.MAX), JSON.stringify(aliases))
          .query(`
            INSERT INTO dbo.AsistenteModuloAlias (AsistenteModuloGuiaId, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt)
            SELECT @guideId, value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
            FROM OPENJSON(@aliasesJson);
          `);
      }

      if (steps.length) {
        await new sql.Request(transaction)
          .input("guideId", sql.Int, guideId)
          .input("stepsJson", sql.NVarChar(sql.MAX), JSON.stringify(steps))
          .query(`
            INSERT INTO dbo.AsistenteModuloPaso (AsistenteModuloGuiaId, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
            SELECT @guideId, value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
            FROM OPENJSON(@stepsJson);
          `);
      }

      await transaction.commit();
      assistantKnowledgeCache = null;
      return ok(res, { updated: true });
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (error) {
    console.error("Error actualizando modulo base del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el modulo base de Margarita" });
  }
});

router.put("/admin/conversation-patterns", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const patternKey = normalizeText(req.body?.patternKey);
    const phrases = normalizeTextArray(req.body?.phrases);
    if (!patternKey || !phrases.length) return badRequest(res, "Debes indicar el patron y al menos una frase");
    const pool = await getPool();
    await pool.request()
      .input("patternKey", sql.NVarChar(80), patternKey)
      .input("phrasesJson", sql.NVarChar(sql.MAX), JSON.stringify(phrases))
      .query(`
        UPDATE dbo.AsistentePatronConversacion
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE ClavePatron = @patternKey;

        INSERT INTO dbo.AsistentePatronConversacion (ClavePatron, Frase, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @patternKey, value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@phrasesJson);
      `);
    assistantKnowledgeCache = null;
    return ok(res, { updated: true });
  } catch (error) {
    console.error("Error actualizando patron conversacional:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el patron conversacional de Margarita" });
  }
});

router.put("/admin/screen-contexts", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const routePrefix = normalizeText(req.body?.routePrefix);
    const moduleKey = normalizeText(req.body?.moduleKey);
    const title = normalizeText(req.body?.title);
    const summary = normalizeText(req.body?.summary);
    const hints = normalizeTextArray(req.body?.hints);
    const exampleQuestions = normalizeTextArray(req.body?.exampleQuestions);
    if (!routePrefix || !moduleKey || !title || !summary) return badRequest(res, "Faltan datos obligatorios del contexto");

    const pool = await getPool();
    await pool.request()
      .input("routePrefix", sql.NVarChar(200), routePrefix)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .input("title", sql.NVarChar(150), title)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .input("hintsJson", sql.NVarChar(sql.MAX), JSON.stringify(hints))
      .input("examplesJson", sql.NVarChar(sql.MAX), JSON.stringify(exampleQuestions))
      .query(`
        UPDATE dbo.AsistenteContextoPantalla
        SET ModuloClave = @moduleKey, Titulo = @title, Resumen = @summary, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix;

        UPDATE dbo.AsistenteContextoPantallaItem
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix;

        INSERT INTO dbo.AsistenteContextoPantallaItem (RutaContexto, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, N'HINT', value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@hintsJson);

        INSERT INTO dbo.AsistenteContextoPantallaItem (RutaContexto, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, N'EXAMPLE', value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@examplesJson);
      `);
    assistantKnowledgeCache = null;
    return ok(res, { updated: true });
  } catch (error) {
    console.error("Error actualizando contexto de pantalla:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el contexto de pantalla de Margarita" });
  }
});

router.put("/admin/form-guides", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const routePrefix = normalizeText(req.body?.routePrefix);
    const moduleKey = normalizeText(req.body?.moduleKey);
    const formKey = normalizeText(req.body?.formKey);
    const title = normalizeText(req.body?.title);
    const summary = normalizeText(req.body?.summary);
    const aliases = normalizeTextArray(req.body?.aliases);
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
    if (!routePrefix || !moduleKey || !formKey || !title || !summary) return badRequest(res, "Faltan datos obligatorios del formulario");

    const normalizedFields = fields.map((field: any, index: number) => ({
      fieldName: normalizeText(field?.fieldName),
      required: Boolean(field?.required),
      hint: normalizeText(field?.hint),
      order: Number(field?.order || index + 1)
    })).filter((field: any) => field.fieldName);

    const pool = await getPool();
    await pool.request()
      .input("routePrefix", sql.NVarChar(200), routePrefix)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .input("formKey", sql.NVarChar(80), formKey)
      .input("title", sql.NVarChar(150), title)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .input("aliasesJson", sql.NVarChar(sql.MAX), JSON.stringify(aliases))
      .input("fieldsJson", sql.NVarChar(sql.MAX), JSON.stringify(normalizedFields))
      .query(`
        UPDATE dbo.AsistenteFormularioGuia
        SET ModuloClave = @moduleKey, Titulo = @title, Resumen = @summary, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix AND ClaveFormulario = @formKey;

        UPDATE dbo.AsistenteFormularioAlias
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix AND ClaveFormulario = @formKey;

        UPDATE dbo.AsistenteFormularioCampo
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix AND ClaveFormulario = @formKey;

        INSERT INTO dbo.AsistenteFormularioAlias (RutaContexto, ClaveFormulario, Alias, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, @formKey, value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@aliasesJson);

        INSERT INTO dbo.AsistenteFormularioCampo (RutaContexto, ClaveFormulario, NombreCampo, EsRequerido, Ayuda, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT
          @routePrefix,
          @formKey,
          JSON_VALUE(value, '$.fieldName'),
          CASE WHEN JSON_VALUE(value, '$.required') IN ('true', '1') THEN 1 ELSE 0 END,
          JSON_VALUE(value, '$.hint'),
          TRY_CAST(JSON_VALUE(value, '$.order') AS INT),
          1,
          SYSDATETIME(),
          SYSDATETIME()
        FROM OPENJSON(@fieldsJson);
      `);
    assistantKnowledgeCache = null;
    return ok(res, { updated: true });
  } catch (error) {
    console.error("Error actualizando formulario base:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el formulario base de Margarita" });
  }
});

router.put("/admin/subflow-contexts", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const routePrefix = normalizeText(req.body?.routePrefix);
    const moduleKey = normalizeText(req.body?.moduleKey);
    const subflowKey = normalizeText(req.body?.subflowKey);
    const title = normalizeText(req.body?.title);
    const summary = normalizeText(req.body?.summary);
    const aliases = normalizeTextArray(req.body?.aliases);
    const hints = normalizeTextArray(req.body?.hints);
    const exampleQuestions = normalizeTextArray(req.body?.exampleQuestions);
    if (!routePrefix || !moduleKey || !subflowKey || !title || !summary) return badRequest(res, "Faltan datos obligatorios del subflujo");

    const pool = await getPool();
    await pool.request()
      .input("routePrefix", sql.NVarChar(200), routePrefix)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .input("subflowKey", sql.NVarChar(80), subflowKey)
      .input("title", sql.NVarChar(150), title)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .input("aliasesJson", sql.NVarChar(sql.MAX), JSON.stringify(aliases))
      .input("hintsJson", sql.NVarChar(sql.MAX), JSON.stringify(hints))
      .input("examplesJson", sql.NVarChar(sql.MAX), JSON.stringify(exampleQuestions))
      .query(`
        UPDATE dbo.AsistenteSubflujoContexto
        SET ModuloClave = @moduleKey, Titulo = @title, Resumen = @summary, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix AND ClaveSubflujo = @subflowKey;

        UPDATE dbo.AsistenteSubflujoItem
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        WHERE RutaContexto = @routePrefix AND ClaveSubflujo = @subflowKey;

        INSERT INTO dbo.AsistenteSubflujoItem (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, @subflowKey, N'ALIAS', value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@aliasesJson);

        INSERT INTO dbo.AsistenteSubflujoItem (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, @subflowKey, N'HINT', value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@hintsJson);

        INSERT INTO dbo.AsistenteSubflujoItem (RutaContexto, ClaveSubflujo, TipoItem, Descripcion, OrdenVisual, Activo, CreatedAt, UpdatedAt)
        SELECT @routePrefix, @subflowKey, N'EXAMPLE', value, [key] + 1, 1, SYSDATETIME(), SYSDATETIME()
        FROM OPENJSON(@examplesJson);
      `);
    assistantKnowledgeCache = null;
    return ok(res, { updated: true });
  } catch (error) {
    console.error("Error actualizando subflujo base:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar el subflujo base de Margarita" });
  }
});

router.put("/admin/faqs", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });

    const faqKey = normalizeText(req.body?.faqKey);
    const moduleKey = normalizeText(req.body?.moduleKey);
    const routePrefix = normalizeText(req.body?.routePrefix);
    const title = normalizeText(req.body?.title);
    const summary = normalizeText(req.body?.summary);
    const answer = normalizeText(req.body?.answer);
    const kind = normalizeText(req.body?.kind || "FAQ").toUpperCase();
    const questionPatterns = normalizeTextArray(req.body?.questionPatterns);
    const steps = normalizeTextArray(req.body?.steps);
    const allowedRoles = normalizeTextArray(req.body?.allowedRoles);

    if (!faqKey || !moduleKey || !routePrefix || !title || !answer) {
      return badRequest(res, "Faltan datos obligatorios de la FAQ");
    }

    const pool = await getPool();
    await pool.request()
      .input("faqKey", sql.NVarChar(80), faqKey)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .input("routePrefix", sql.NVarChar(200), routePrefix)
      .input("title", sql.NVarChar(150), title)
      .input("summary", sql.NVarChar(sql.MAX), summary)
      .input("answer", sql.NVarChar(sql.MAX), answer)
      .input("kind", sql.NVarChar(30), kind || "FAQ")
      .input("questionPatternsJson", sql.NVarChar(sql.MAX), JSON.stringify(questionPatterns))
      .input("stepsJson", sql.NVarChar(sql.MAX), JSON.stringify(steps))
      .input("allowedRolesJson", sql.NVarChar(sql.MAX), JSON.stringify(allowedRoles))
      .query(`
        MERGE dbo.AsistenteFaq AS target
        USING (
          SELECT
            @faqKey AS Clave,
            @moduleKey AS ModuloClave,
            @routePrefix AS RutaContexto,
            @title AS Titulo,
            @summary AS Resumen,
            @answer AS Respuesta,
            @kind AS Tipo,
            @questionPatternsJson AS PreguntasJson,
            @stepsJson AS PasosJson,
            @allowedRolesJson AS AllowedRolesJson
        ) AS source
        ON target.Clave = source.Clave
        WHEN MATCHED THEN
          UPDATE SET
            ModuloClave = source.ModuloClave,
            RutaContexto = source.RutaContexto,
            Titulo = source.Titulo,
            Resumen = source.Resumen,
            Respuesta = source.Respuesta,
            Tipo = source.Tipo,
            PreguntasJson = source.PreguntasJson,
            PasosJson = source.PasosJson,
            AllowedRolesJson = source.AllowedRolesJson,
            Activo = 1,
            UpdatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            Clave, ModuloClave, RutaContexto, Titulo, Resumen, Respuesta, Tipo,
            PreguntasJson, PasosJson, AllowedRolesJson, OrdenVisual, Activo, CreatedAt, UpdatedAt
          )
          VALUES (
            source.Clave, source.ModuloClave, source.RutaContexto, source.Titulo, source.Resumen, source.Respuesta, source.Tipo,
            source.PreguntasJson, source.PasosJson, source.AllowedRolesJson, 0, 1, SYSDATETIME(), SYSDATETIME()
          );
      `);
    assistantKnowledgeCache = null;
    return ok(res, { updated: true });
  } catch (error) {
    console.error("Error actualizando FAQ de Margarita:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la FAQ de Margarita" });
  }
});

router.delete("/admin/faqs/:faqKey", async (req, res) => {
  try {
    if (!canManageAssistant(req)) return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    const faqKey = normalizeText(req.params.faqKey);
    if (!faqKey) return badRequest(res, "La clave de la FAQ es obligatoria");

    const pool = await getPool();
    const result = await pool.request()
      .input("faqKey", sql.NVarChar(80), faqKey)
      .query(`
        UPDATE dbo.AsistenteFaq
        SET Activo = 0, UpdatedAt = SYSDATETIME()
        OUTPUT inserted.Clave
        WHERE Clave = @faqKey
      `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, message: "No se encontro la FAQ a quitar" });
    }

    assistantKnowledgeCache = null;
    return ok(res, { removed: true });
  } catch (error) {
    console.error("Error quitando FAQ de Margarita:", error);
    return res.status(500).json({ ok: false, message: "No se pudo quitar la FAQ de Margarita" });
  }
});

router.post("/admin/instructions", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }

    const title = normalizeText(req.body?.title);
    const category = normalizeText(req.body?.category) || "GENERAL";
    const instruction = normalizeText(req.body?.instruction);
    const order = Number(req.body?.order || 0);
    const active = req.body?.active === undefined ? true : Boolean(req.body?.active);
    const institucionId = isSuperAdmin(req) ? null : Number(getAuth(req).institucionId || 0);

    if (!title) return badRequest(res, "El titulo es obligatorio");
    if (!instruction) return badRequest(res, "La indicacion es obligatoria");

    const pool = await getPool();
    const request = pool.request()
      .input("institucionId", sql.Int, institucionId)
      .input("title", sql.NVarChar(150), title)
      .input("category", sql.NVarChar(60), category)
      .input("instruction", sql.NVarChar(sql.MAX), instruction)
      .input("order", sql.Int, order)
      .input("active", sql.Bit, active ? 1 : 0);

    const result = await request.query(`
      INSERT INTO dbo.AsistenteIndicacionAdmin (
        InstitucionId,
        Titulo,
        Categoria,
        Instruccion,
        OrdenVisual,
        Activo,
        CreatedAt,
        UpdatedAt
      )
      OUTPUT
        inserted.AsistenteIndicacionAdminId,
        inserted.InstitucionId,
        inserted.Titulo,
        inserted.Categoria,
        inserted.Instruccion,
        inserted.OrdenVisual,
        inserted.Activo
      VALUES (
        @institucionId,
        @title,
        @category,
        @instruction,
        @order,
        @active,
        SYSDATETIME(),
        SYSDATETIME()
      );
    `);

    return ok(res, { item: result.recordset?.[0] || null });
  } catch (error) {
    console.error("Error creando indicacion del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la indicacion de Margarita" });
  }
});

router.put("/admin/instructions/:id", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }

    const id = Number(req.params.id || 0);
    const title = normalizeText(req.body?.title);
    const category = normalizeText(req.body?.category) || "GENERAL";
    const instruction = normalizeText(req.body?.instruction);
    const order = Number(req.body?.order || 0);
    const active = Boolean(req.body?.active);
    const institucionId = isSuperAdmin(req) ? null : Number(getAuth(req).institucionId || 0);

    if (!id) return badRequest(res, "El id es obligatorio");
    if (!title) return badRequest(res, "El titulo es obligatorio");
    if (!instruction) return badRequest(res, "La indicacion es obligatoria");

    const pool = await getPool();
    const request = pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId)
      .input("title", sql.NVarChar(150), title)
      .input("category", sql.NVarChar(60), category)
      .input("instruction", sql.NVarChar(sql.MAX), instruction)
      .input("order", sql.Int, order)
      .input("active", sql.Bit, active ? 1 : 0);

    const result = await request.query(`
      UPDATE dbo.AsistenteIndicacionAdmin
      SET
        Titulo = @title,
        Categoria = @category,
        Instruccion = @instruction,
        OrdenVisual = @order,
        Activo = @active,
        UpdatedAt = SYSDATETIME()
      OUTPUT
        inserted.AsistenteIndicacionAdminId,
        inserted.InstitucionId,
        inserted.Titulo,
        inserted.Categoria,
        inserted.Instruccion,
        inserted.OrdenVisual,
        inserted.Activo
      WHERE AsistenteIndicacionAdminId = @id
        AND (
          ${isSuperAdmin(req) ? "1 = 1" : "InstitucionId = @institucionId"}
        );
    `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, message: "No se encontro la indicacion a modificar" });
    }

    return ok(res, { item: result.recordset[0] });
  } catch (error) {
    console.error("Error actualizando indicacion del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo actualizar la indicacion de Margarita" });
  }
});

router.delete("/admin/instructions/:id", async (req, res) => {
  try {
    if (!canManageAssistant(req)) {
      return res.status(403).json({ ok: false, message: "No tenes permisos para administrar Margarita" });
    }

    const id = Number(req.params.id || 0);
    const institucionId = isSuperAdmin(req) ? null : Number(getAuth(req).institucionId || 0);
    if (!id) return badRequest(res, "El id es obligatorio");

    const pool = await getPool();
    const request = pool.request()
      .input("id", sql.Int, id)
      .input("institucionId", sql.Int, institucionId);

    const result = await request.query(`
      UPDATE dbo.AsistenteIndicacionAdmin
      SET
        Activo = 0,
        UpdatedAt = SYSDATETIME()
      OUTPUT inserted.AsistenteIndicacionAdminId
      WHERE AsistenteIndicacionAdminId = @id
        AND (
          ${isSuperAdmin(req) ? "1 = 1" : "InstitucionId = @institucionId"}
        );
    `);

    if (!result.recordset?.length) {
      return res.status(404).json({ ok: false, message: "No se encontro la indicacion a quitar" });
    }

    return ok(res, { removed: true });
  } catch (error) {
    console.error("Error quitando indicacion del asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo quitar la indicacion de Margarita" });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const question = normalizeText(req.body?.question);
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
    const currentPath = normalizeText(req.body?.currentPath);
    const screenSnapshot = normalizeScreenSnapshot(req.body?.screenSnapshot);
    const userName = normalizeText(req.body?.userName);
    const userDisplayName = normalizeText(req.body?.userDisplayName);
    const userRoleLabel = normalizeText(req.body?.userRoleLabel);
    if (!question) return badRequest(res, "La pregunta es obligatoria");

    const pool = await getPool();
    const context = await buildContext(pool, req, question, currentPath, screenSnapshot);
    const suggestedActions = buildSuggestedActions(question, context);
    const directReply = buildDirectReply(question, userName, userDisplayName, context, history);
    if (directReply) {
      return ok(res, {
        reply: sanitizeAssistantReply(directReply),
        suggestedActions,
        contextPreview: {
          estudiantes: context.estudiantes.length,
          grupos: context.grupos.length,
          horarios: context.horarios.length,
          notas: context.notas.length,
          asistencia: context.asistencia.length
        }
      });
    }

    const systemPrompt = [
      "Sos Margarita, la asistente interna de PROFE360.",
      "Responde en espanol claro, amable, cordial y humano.",
      "Saluda de forma natural.",
      userDisplayName
        ? `La persona usuaria esta logueada como ${userDisplayName}${userRoleLabel ? ` y su rol visible es ${userRoleLabel}` : ""}. Si es natural, saludala de esa forma.`
        : userName
          ? `La persona se llama ${userName}. Si es natural, llamala por su nombre.`
          : "Si todavia no sabes el nombre de la persona, pediselo amablemente en tu respuesta.",
      "Tu trabajo principal es apoyar el uso correcto de los modulos de PROFE360, paso a paso.",
      "Si la persona pregunta como hacer algo en la plataforma, prioriza una guia clara antes de pedir cedula, grupo o materia.",
      "Usa primero el contexto real del sistema que te paso.",
      "Si la consulta es sobre notas de un alumno, prioriza el bloque notasAlumno.",
      "Si la consulta es sobre horario de una seccion, prioriza el bloque horariosSeccion.",
      "Si el usuario pide algo que no aparece en el contexto, decilo y pedi un dato puntual solo cuando haga falta.",
      "No inventes datos ni afirmes consultas que no aparezcan en el contexto.",
      "Guia solo sobre modulos a los que la persona tenga acceso segun el contexto.",
      "Podes ayudar con estudiantes, grupos, horarios, notas, asistencia, reportes, planeamientos e indicadores.",
      ...(Array.isArray(context?.assistantAdminInstructions) && context.assistantAdminInstructions.length
        ? [
            "Indicaciones administrativas vigentes para Margarita:",
            ...context.assistantAdminInstructions.map((item: AssistantAdminInstruction, index: number) =>
              `${index + 1}. [${item.category || "GENERAL"}] ${item.title}: ${item.instruction}`
            )
          ]
        : [])
    ].join("\n");

    const prompt = [
      systemPrompt,
      "",
      `Ruta actual: ${context.currentPath || "/"}`,
      `Pantalla visible: ${JSON.stringify(context.screenSnapshot || {}, null, 2)}`,
      `Foco visible detectado: ${JSON.stringify(context.screenFocus || [], null, 2)}`,
      `Búsqueda detectada: ${context.lookup || "(ninguna)"}`,
      "",
      "Contexto real del sistema:",
      JSON.stringify(context, null, 2),
      "",
      "Historial reciente del chat:",
      JSON.stringify(history, null, 2),
      "",
      `Pregunta del usuario: ${question}`
    ].join("\n");

    const reply = await callAssistantModel(prompt);
    const fallback = isStudentInfoQuestion(question)
      ? `${userDisplayName || userName ? `Hola ${userDisplayName || userName}. ` : ""}Si querés información de un alumno, mandame la cédula o el nombre completo y te ayudo a ubicarlo.`
      : context.estudiantes.length || context.grupos.length || context.horarios.length || context.notas.length || context.asistencia.length
      ? "Encontre datos relacionados en el sistema. Si queres, tambien puedo guiarte paso a paso dentro del modulo donde estas trabajando."
      : (context.accessibleModuleGuides?.length
          ? buildAccessibleModulesReply(userDisplayName || userName, context.accessibleModuleGuides)
          : buildModuleFallback(currentPath));

    return ok(res, {
      reply: sanitizeAssistantReply(reply || fallback),
      suggestedActions,
      contextPreview: {
        estudiantes: context.estudiantes.length,
        grupos: context.grupos.length,
        horarios: context.horarios.length,
        notas: context.notas.length,
        asistencia: context.asistencia.length
      }
    });
  } catch (error) {
    console.error("Error en asistente:", error);
    return res.status(500).json({ ok: false, message: "No se pudo procesar la consulta del asistente" });
  }
});

export default router;
