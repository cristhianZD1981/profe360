import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  alinearMomentosConReferencia,
  analizarReferenciaDocxSemantica,
  aplicarReglasObligatoriasPlaneamiento,
  ajustarIndicadoresPorHabilidad,
  construirAdecuacionSignificativa,
  construirPerfilEstrategiasReferencia,
  completarCamposReferenciaDeterministicamente,
  conservarReferenciaWordEnResultado,
  construirContenidoSeccionesPlantilla,
  construirReferenciaEstructuralParaPrompt,
  debeAuditarPlaneamientoConIa,
  detectTemplateContentRole,
  detectarCopiaSustantivaReferencia,
  extraerPaginasIndicadas,
  limpiarEncabezadoEstrategiaReferencia,
  normalizarModalidadGrado,
  normalizarAuditoriaSemantica,
  perfilDocumentoParaRevision,
  renderPlaneamientoEnPlantillaDocx,
  validarWordExportadoContraReferencia,
  resolverArchivoMachoteObligatorio,
  estructuraReferenciaConfiable,
  validarPeriodicidadPlaneamiento,
  validarOrdenEncabezadosEstrategias,
  validarPlaneamientoGenerado
} from "./planeamiento-ia.routes.js";

test("rechaza una periodicidad que contradice los meses seleccionados", () => {
  assert.match(
    validarPeriodicidadPlaneamiento("Junio, Julio y Agosto", "bimestre") || "",
    /abarcan 3 meses/i
  );
  assert.equal(validarPeriodicidadPlaneamiento("Junio, Julio y Agosto", "trimestre"), null);
});

test("distingue estrictamente el grado regular del grado PN", () => {
  assert.equal(normalizarModalidadGrado("8"), null);
  assert.equal(normalizarModalidadGrado("Octavo"), null);
  assert.equal(normalizarModalidadGrado("8 PN"), "PN");
  assert.equal(normalizarModalidadGrado("Octavo PN"), "PN");
});

test("usa archivoReferencia como machote aunque no llegue el campo antiguo plantillaFormato", () => {
  const referencia = { originalname: "07 SETIMO MUSICA.docx" };
  assert.equal(resolverArchivoMachoteObligatorio(referencia, null), referencia);
  assert.equal(resolverArchivoMachoteObligatorio(null, referencia), referencia);
});

test("completa Unit Domain y Scenario con datos nuevos sin otra llamada de IA", () => {
  const resultado: any = {
    nombre: "August - Eighth - English",
    materiaNombre: "English",
    grado: "Eighth",
    mes: "August",
    camposReferencia: {},
    controlCalidad: { contextoGeneracion: { tema: "Communication and listening" } }
  };
  completarCamposReferenciaDeterministicamente(resultado, {
    esDocx: true,
    columnas: [],
    camposVariables: [
      { etiqueta: "Unit", valorAnterior: "Old unit" },
      { etiqueta: "Domain", valorAnterior: "Old domain" },
      { etiqueta: "Scenario", valorAnterior: "Old scenario" }
    ],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 1,
    seccionesModelo: [],
    descripcion: "English template"
  }, [
    { DescripcionHabilidad: "Interacts using listening and speaking strategies." }
  ]);

  assert.equal(resultado.camposReferencia.Unit, "Communication and listening");
  assert.equal(resultado.camposReferencia.Domain, "English");
  assert.match(resultado.camposReferencia.Scenario, /listening and speaking/i);
});

test("completa campos particulares de cualquier machote con el contexto actual", () => {
  const resultado: any = {
    nombre: "Abril - Octavo - Ciencias",
    materiaNombre: "Ciencias",
    grado: "Octavo",
    mes: "Abril",
    periodicidad: "mes",
    competenciaGeneral: "Competencias para la ciudadanía responsable y solidaria",
    semanas: [{ semana: 1 }, { semana: 2 }, { semana: 3 }, { semana: 4 }],
    camposReferencia: {},
    controlCalidad: { contextoGeneracion: { tema: "Ecosistemas" } }
  };
  completarCamposReferenciaDeterministicamente(resultado, {
    esDocx: true,
    columnas: [],
    camposVariables: [
      { etiqueta: "Tiempo estimado", valorAnterior: "6 semanas" },
      { etiqueta: "Eje de la política educativa", valorAnterior: "Educación para el desarrollo sostenible" },
      { etiqueta: "Carrera técnica", valorAnterior: "Organización de empresas de turismo rural" },
      { etiqueta: "Competencias para el desarrollo humano", valorAnterior: "Proactividad" },
      { etiqueta: "Contexto disciplinar particular", valorAnterior: "Tema anterior" }
    ],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 1,
    cantidadBloquesContenido: 1,
    seccionesModelo: [],
    descripcion: "Machote variable"
  }, [{ DescripcionHabilidad: "Analiza relaciones en los ecosistemas." }]);

  assert.equal(resultado.camposReferencia["Tiempo estimado"], "6 semanas");
  assert.equal(
    resultado.camposReferencia["Eje de la política educativa"],
    "Educación para el desarrollo sostenible"
  );
  assert.equal(resultado.camposReferencia["Carrera técnica"], "Organización de empresas de turismo rural");
  assert.equal(
    resultado.camposReferencia["Competencias para el desarrollo humano"],
    "Competencias para la ciudadanía responsable y solidaria"
  );
  assert.equal(resultado.camposReferencia["Contexto disciplinar particular"], "Ecosistemas");
});

test("no convierte un unico rotulo de actor en secuencia obligatoria", () => {
  assert.deepEqual(estructuraReferenciaConfiable(["EL DOCENTE:"]), []);
  assert.deepEqual(estructuraReferenciaConfiable(["Teacher:"]), []);
  assert.deepEqual(
    estructuraReferenciaConfiable(["Conexión", "Construcción", "Cierre"]),
    ["Conexión", "Construcción", "Cierre"]
  );
});

test("la corrección conserva el machote y reemplaza Momentos por la secuencia del Word", () => {
  const resultadoInicial = {
    plantillaFormatoDocx: {
      nombre: "07 SETIMO MUSICA.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64: "machote-binario-prueba"
    },
    plantillaFormatoNombre: "07 SETIMO MUSICA.docx",
    estructuraEstrategiasReferencia: [],
    perfilEstrategiasReferencia: {
      encabezados: ["Conexión - Inicio", "Construcción", "Cierre - Clarificación"],
      cantidadParrafos: 3,
      cantidadCaracteres: 400,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "breve",
      descripcion: "Modelo de Música"
    }
  };
  const respuestaCorregida = {
    estrategiasMediacion: [
      "Momento 1: inicio\nEscucha activa de recursos musicales.",
      "Momento 2: desarrollo\nCreación de una secuencia sonora.",
      "Momento 3: cierre\nReflexión sobre el producto."
    ]
  };

  const conservado = conservarReferenciaWordEnResultado(respuestaCorregida, resultadoInicial);
  const estructura = estructuraReferenciaConfiable(
    conservado.estructuraEstrategiasReferencia,
    conservado.perfilEstrategiasReferencia
  );
  conservado.estrategiasMediacion = alinearMomentosConReferencia(
    conservado.estrategiasMediacion,
    estructura
  );

  assert.equal(conservado.plantillaFormatoDocx?.base64, "machote-binario-prueba");
  assert.deepEqual(estructura, ["Conexión - Inicio", "Construcción", "Cierre - Clarificación"]);
  assert.doesNotMatch(conservado.estrategiasMediacion.join("\n"), /momento\s+[1-4]/i);
  assert.match(conservado.estrategiasMediacion.join("\n"), /Conexión - Inicio/i);
});

test("sustituye Momentos genéricos por los encabezados de la referencia", () => {
  const estrategias = alinearMomentosConReferencia([
    "Momento 1: Propuesta del problema\nActividad contextualizada.",
    "Momento 2: Trabajo independiente\nPráctica guiada."
  ], ["Primera etapa: aprendizaje de conocimientos", "Segunda etapa: aplicación"]);

  assert.doesNotMatch(estrategias.join("\n"), /momento\s+[1-4]\s*:/i);
  assert.match(estrategias[0], /Primera etapa/i);
  assert.match(estrategias[1], /Segunda etapa/i);
});

test("descarta códigos internos y limpia encabezados pedagógicos del Word", () => {
  assert.equal(limpiarEncabezadoEstrategiaReferencia("66709646701 00"), "");
  assert.equal(
    limpiarEncabezadoEstrategiaReferencia("32385165100 Actividades de inicio"),
    "Actividades de inicio"
  );
  assert.equal(limpiarEncabezadoEstrategiaReferencia("Tema 2"), "Tema 2");
});

test("la adecuacion significativa se reconstruye con las habilidades actuales", () => {
  const adecuacion = construirAdecuacionSignificativa({
    materiaNombre: "Matematicas PN",
    grado: "Segundo",
    mes: "Julio",
    tema: "Valor posicional y sucesiones",
    habilidades: [
      {
        DescripcionHabilidad: "Reconoce el valor posicional de numeros naturales menores que 1000."
      },
      {
        DescripcionHabilidad: "Completa sucesiones de 10 en 10 y de 100 en 100."
      }
    ],
    usarAzul: false,
    idioma: "es"
  });

  const contenido = JSON.stringify(adecuacion);
  assert.match(contenido, /valor posicional/i);
  assert.match(contenido, /sucesiones/i);
  assert.doesNotMatch(contenido, /racionales|fracciones|decimales/i);
  assert.match(adecuacion.textoVisible, /menores que 1000/i);
  assert.match(adecuacion.recursoAjustado, /de 10 en 10/i);
});

test("mejorar con IA elimina la adecuacion anterior y la reemplaza por la actual", () => {
  const resultado = aplicarReglasObligatoriasPlaneamiento({
    aprendizajesEsperados: ["Valor posicional", "Sucesiones"],
    criteriosEvaluacion: ["Reconoce el valor posicional", "Completa sucesiones"],
    indicadoresEvaluacion: ["1.1 Reconoce el valor posicional", "2.1 Completa sucesiones"],
    estrategiasMediacion: [
      "Actividad inicial sobre valor posicional.",
      "Estrategia de mediacion para adecuacion significativa: trabajar fracciones y decimales."
    ],
    estrategiaAdecuacionSignificativa: {
      aplica: true,
      recursoAjustado: "Tarjetas con numeros racionales y fracciones.",
      textoVisible: "Adecuacion significativa sobre numeros racionales."
    }
  }, {
    indicacionesDocente: "Incluir una adecuacion significativa.",
    materiaNombre: "Matematicas PN",
    grado: "Segundo",
    mes: "Julio",
    tema: "Valor posicional y sucesiones",
    habilidades: [
      { DescripcionHabilidad: "Reconoce el valor posicional de numeros naturales menores que 1000." },
      { DescripcionHabilidad: "Completa sucesiones de 10 en 10 y de 100 en 100." }
    ]
  });

  const contenido = JSON.stringify(resultado);
  assert.doesNotMatch(contenido, /racionales|fracciones|decimales/i);
  assert.match(resultado.estrategiaAdecuacionSignificativa.textoVisible, /valor posicional/i);
  assert.equal(
    resultado.estrategiasMediacion.filter((item: string) => /adecuaci[oó]n significativa/i.test(item)).length,
    1
  );
});

test("conserva la adecuacion significativa especifica que ya resolvio la IA", () => {
  const resultado = aplicarReglasObligatoriasPlaneamiento({
    aprendizajesEsperados: [
      "Analiza relaciones entre eventos",
      "Aplica axiomas de probabilidad"
    ],
    criteriosEvaluacion: [
      "Analisis de relaciones entre eventos",
      "Aplicacion de axiomas de probabilidad"
    ],
    indicadoresEvaluacion: [
      "1.1 Analiza relaciones entre eventos en situaciones contextualizadas",
      "2.1 Aplica axiomas de probabilidad en problemas nuevos"
    ],
    estrategiasMediacion: [
      "PRIMERA ETAPA: APRENDIZAJE DE CONOCIMIENTOS\nLa persona docente plantea una situacion de probabilidad y guia el analisis inicial.",
      "Estrategia de mediacion para adecuacion curricular significativa\nEl estudiante con nivel de competencia de decimo resuelve un problema de proporcionalidad directa mediante tabla de valores, identifica el dato faltante y explica el procedimiento con apoyo visual."
    ],
    estrategiaAdecuacionSignificativa: {
      aplica: true,
      titulo: "Estrategia de mediacion para adecuacion curricular significativa",
      proposito: "Ajustar la participacion del estudiante con nivel de competencia de decimo mediante una tarea matematica concreta y observable antes de abordar la probabilidad formal de duodecimo.",
      actividadAdaptada: "Resolver un problema de proporcionalidad directa con una tabla de valores, completar un dato faltante y explicar oralmente el procedimiento seguido con una guia de tres pasos.",
      apoyoDocente: "Modelar un ejemplo corto, verificar cada paso con preguntas guiadas y ofrecer retroalimentacion inmediata antes de que el estudiante complete un segundo caso similar.",
      recursoAjustado: "Tabla de valores impresa, tarjetas con datos numericos sencillos, calculadora basica y organizador visual para distinguir dato conocido, dato faltante y operacion utilizada.",
      productoEsperado: "Tabla completada, procedimiento marcado en la guia y explicacion breve del resultado obtenido para evidenciar avance en el nivel de competencia de decimo.",
      evaluacionAjustada: "Valorar la identificacion del dato faltante, el procedimiento proporcional usado y la explicacion del resultado mediante una lista de cotejo individual.",
      textoVisible: "Estrategia de mediacion para adecuacion curricular significativa\nNivel de competencia: decimo. Actividad adaptada: resolver un problema de proporcionalidad directa con tabla de valores, completar un dato faltante y explicar el procedimiento con apoyo visual. Producto esperado: tabla completada, guia de pasos y explicacion breve."
    }
  }, {
    indicacionesDocente: "Incluir una adecuacion curricular significativa para estudiante con nivel de competencia de decimo; ajustar problemas, procedimientos y productos concretos.",
    materiaNombre: "Matematicas",
    grado: "Duodecimo",
    mes: "Julio",
    tema: "Relaciones entre eventos y axiomas de probabilidad",
    habilidades: [
      { DescripcionHabilidad: "Analiza relaciones entre eventos para interpretar situaciones de probabilidad." },
      { DescripcionHabilidad: "Aplica axiomas de probabilidad para resolver problemas contextualizados." }
    ]
  });

  const adecuacion = resultado.estrategiaAdecuacionSignificativa;
  assert.match(adecuacion.textoVisible, /decimo/i);
  assert.match(adecuacion.actividadAdaptada, /tabla de valores/i);
  assert.match(adecuacion.productoEsperado, /guia de pasos|tabla completada/i);
  assert.doesNotMatch(adecuacion.textoVisible, /pasos breves y secuenciales/i);
  assert.equal(
    resultado.estrategiasMediacion.filter((item: string) => /adecuaci[oÃ³]n curricular significativa/i.test(item)).length,
    1
  );
});

test("extrae paginas indicadas en instrucciones docentes para priorizar PDFs", () => {
  assert.deepEqual(
    extraerPaginasIndicadas("Considerar la pagina 47 y elaborar ejercicios entre las paginas 47 y 64 del PDF."),
    Array.from({ length: 18 }, (_item, index) => 47 + index)
  );
  assert.deepEqual(extraerPaginasIndicadas("Usar p. 12-14 y pagina 20."), [12, 13, 14, 20]);
});

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraph(text: string, bold = false) {
  return `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function cell(...paragraphs: string[]) {
  return `<w:tc>${paragraphs.join("")}</w:tc>`;
}

function row(...cells: string[]) {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function table(...rows: string[]) {
  return `<w:tbl>${rows.join("")}</w:tbl>`;
}

async function createReferenceDocx() {
  const metadata = table(
    row(
      cell(paragraph("Asignatura: Estudios Sociales")),
      cell(paragraph("Eje tematico: Los pueblos originarios"))
    )
  );
  const content = table(
    row(
      cell(paragraph("Criterios de evaluacion")),
      cell(paragraph("Estrategias de mediacion")),
      cell(paragraph("Indicadores"))
    ),
    row(
      cell(paragraph("Criterio anterior del plan")),
      cell(
        paragraph("Preparacion del escenario", true),
        paragraph("La persona docente presenta el contexto anterior."),
        paragraph("Construccion colaborativa", true),
        paragraph("El estudiantado desarrolla la primera actividad."),
        paragraph("Preparacion del escenario", true),
        paragraph("Se retoma el encabezado en una segunda secuencia.")
      ),
      cell(paragraph("1.1 Indicador anterior del plan"))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${metadata}${content}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("clasifica criterios e indicadores como columnas distintas", () => {
  assert.equal(detectTemplateContentRole(cell(paragraph("Criterios de evaluacion"))), "criterios");
  assert.equal(detectTemplateContentRole(cell(paragraph("Indicadores"))), "indicadores");
  assert.equal(detectTemplateContentRole(cell(paragraph("Estrategias de mediacion"))), "estrategias");
});

test("clasifica encabezados de machotes de ingles conversacional", () => {
  assert.equal(detectTemplateContentRole(cell(paragraph("Goals"))), "aprendizajes");
  assert.equal(detectTemplateContentRole(cell(paragraph("Task Mediation Activities"))), "estrategias");
  assert.equal(detectTemplateContentRole(cell(paragraph("Indicators of Learning"))), "indicadores");
  assert.equal(detectTemplateContentRole(cell(paragraph("Learner can"))), "aprendizajes");
  assert.equal(detectTemplateContentRole(cell(paragraph("Didactic Sequence Mediation"))), "estrategias");
  assert.equal(detectTemplateContentRole(cell(paragraph("Assessment Strategies & Evidences"))), "indicadores");
});

test("clasifica las columnas exactas del machote de Musica", () => {
  assert.equal(detectTemplateContentRole(cell(paragraph("Aprendizaje esperado"))), "aprendizajes");
  assert.equal(detectTemplateContentRole(cell(paragraph("Estrategias didácticas sugeridas"))), "estrategias");
  assert.equal(detectTemplateContentRole(cell(paragraph("Indicador del aprendizaje esperado"))), "indicadores");
});

test("clasifica por separado las cinco columnas de un plan tecnico", () => {
  assert.equal(detectTemplateContentRole(cell(paragraph("Resultados de aprendizaje"))), "aprendizajes");
  assert.equal(detectTemplateContentRole(cell(paragraph("Saberes esenciales"))), "saberes");
  assert.equal(detectTemplateContentRole(cell(paragraph("Estrategias para la mediación pedagógica"))), "estrategias");
  assert.equal(detectTemplateContentRole(cell(paragraph("Evidencias de aprendizaje"))), "indicadores");
  assert.equal(detectTemplateContentRole(cell(paragraph("Tiempo estimado (horas)"))), "tiempo");
});

test("el resumen estructural para la IA no expone actividades del plan anterior", () => {
  const resumen = construirReferenciaEstructuralParaPrompt({
    esDocx: true,
    columnas: [
      { indice: 0, encabezado: "Aprendizaje esperado", rol: "aprendizajes" },
      { indice: 1, encabezado: "Estrategias didácticas sugeridas", rol: "estrategias" },
      { indice: 2, encabezado: "Indicador del aprendizaje esperado", rol: "indicadores" }
    ],
    camposVariables: [],
    estrategiasTexto: "Actividad anterior sobre culturas milenarias que nunca debe llegar al prompt.",
    encabezadosEstrategias: ["Conexión – Inicio"],
    valoresContenidoAnterior: ["Pregunta anterior concreta"],
    cantidadSeccionesContenido: 1,
    cantidadBloquesContenido: 12,
    seccionesModelo: [],
    descripcion: "Referencia de Música"
  }, {
    encabezados: ["Conexión – Inicio"],
    cantidadParrafos: 40,
    cantidadCaracteres: 8000,
    cantidadActividadesNumeradas: 4,
    cantidadPreguntas: 3,
    usaTemasNumerados: false,
    usaActividadesNumeradas: true,
    nivelDetalle: "amplio",
    descripcion: "Secuencia amplia"
  });

  assert.match(resumen, /Bloques o filas de desarrollo: 12/i);
  assert.match(resumen, /Conexión – Inicio/i);
  assert.doesNotMatch(resumen, /culturas milenarias|Pregunta anterior concreta/i);
});

test("la auditoria excluye metadatos que completa el servidor", () => {
  const perfil = perfilDocumentoParaRevision({
    esDocx: true,
    columnas: [],
    camposVariables: [
      { etiqueta: "Dirección Regional de Educación", valorAnterior: "No especificada" },
      { etiqueta: "Centro educativo", valorAnterior: "No especificado" },
      { etiqueta: "Nombre y apellidos del o la docente", valorAnterior: "No especificado" },
      { etiqueta: "Institution", valorAnterior: "CTP Sabalito" },
      { etiqueta: "Teacher", valorAnterior: "Docente anterior" },
      { etiqueta: "Level", valorAnterior: "Seventh" },
      { etiqueta: "Mes", valorAnterior: "Mes anterior" },
      { etiqueta: "Eje temático Integrador", valorAnterior: "Tema anterior" },
      { etiqueta: "Unidad de trabajo", valorAnterior: "Unidad anterior" }
    ],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 0,
    seccionesModelo: [],
    descripcion: "Referencia de prueba"
  });

  assert.deepEqual(
    perfil?.camposVariables.map((campo) => campo.etiqueta),
    ["Eje temático Integrador", "Unidad de trabajo"]
  );
});

test("extrae estrategias desde machote original de ingles conversacional", async () => {
  const metadata = table(
    row(
      cell(paragraph("Institution: CTP Sabalito")),
      cell(paragraph("CEFR: A1.1"))
    ),
    row(
      cell(paragraph("Teacher: Docente anterior")),
      cell(paragraph("Level: Seventh"))
    )
  );
  const content = table(
    row(
      cell(paragraph("Goals")),
      cell(paragraph("Task Mediation Activities")),
      cell(paragraph("Indicators of Learning"))
    ),
    row(
      cell(paragraph("Acquire knowledge, understand and think critically in a friendship environment.")),
      cell(
        paragraph("Pre-teaching Routine:", true),
        paragraph("Teacher greets the class and checks attendance."),
        paragraph("Participating:", true),
        paragraph("Learners solve a classroom challenge and share responses.")
      ),
      cell(paragraph("Analyzes classroom responses in order to demonstrate understanding."))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${metadata}${content}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const perfil = await analizarReferenciaDocxSemantica({
    buffer,
    originalname: "english-reference.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  } as Express.Multer.File);

  assert.deepEqual(
    perfil.columnas.map((columna) => columna.rol),
    ["aprendizajes", "estrategias", "indicadores"]
  );
  assert.match(perfil.estrategiasTexto, /Pre-teaching Routine/);
  assert.doesNotMatch(perfil.estrategiasTexto, /Acquire knowledge/);
  assert.doesNotMatch(perfil.estrategiasTexto, /Analyzes classroom responses/);
  assert.deepEqual(
    perfilDocumentoParaRevision(perfil)?.camposVariables.map((campo) => campo.etiqueta),
    ["CEFR"]
  );
});

test("extrae estrategias desde machote academico de ingles con secuencia didactica", async () => {
  const content = table(
    row(
      cell(paragraph("Assessment Strategies & Evidences")),
      cell(paragraph("Learner can")),
      cell(paragraph("Didactic Sequence Mediation")),
      cell(paragraph("Time Total: 120 min (3 lessons)"))
    ),
    row(
      cell(paragraph("L.1. identifies expressions related to media.")),
      cell(paragraph("L.1. understand the main idea and key details.")),
      cell(
        paragraph("CONNECTION/ Pre-teaching", true),
        paragraph("Teacher calls attendance and introduces the topic."),
        paragraph("CONNECTION/ Participating", true),
        paragraph("Learners perform a warm-up activity related to social media logos.")
      ),
      cell(paragraph("120 min"))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${content}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const perfil = await analizarReferenciaDocxSemantica({
    buffer,
    originalname: "ninth-reference.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  } as Express.Multer.File);

  assert.deepEqual(
    perfil.columnas.map((columna) => columna.rol),
    ["indicadores", "aprendizajes", "estrategias", null]
  );
  assert.match(perfil.estrategiasTexto, /CONNECTION\/ Pre-teaching/);
  assert.doesNotMatch(perfil.estrategiasTexto, /identifies expressions/);
  assert.doesNotMatch(perfil.estrategiasTexto, /120 min/);
});

test("infiere columna de mediacion por estructura cuando el alias no es exacto", async () => {
  const content = table(
    row(
      cell(paragraph("Evidence")),
      cell(paragraph("Learner profile")),
      cell(paragraph("Classroom Mediation Flow")),
      cell(paragraph("Time"))
    ),
    row(
      cell(paragraph("Short assessment note.")),
      cell(paragraph("Learners can exchange simple ideas.")),
      cell(
        paragraph("Opening mediation", true),
        paragraph("Teacher presents a contextualized challenge and students respond with examples.")
      ),
      cell(paragraph("40 min"))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${content}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const perfil = await analizarReferenciaDocxSemantica({
    buffer,
    originalname: "fallback-reference.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  } as Express.Multer.File);

  assert.match(perfil.estrategiasTexto, /Opening mediation/);
  assert.doesNotMatch(perfil.estrategiasTexto, /Learners can exchange/);
  assert.equal(perfil.cantidadSeccionesContenido, 1);
});

test("reemplaza indicadores copiados de habilidades por indicadores observables", () => {
  const indicadores = ajustarIndicadoresPorHabilidad({
    indicadoresEntrada: [
      "1.1 Solve problems with family and friends, organize and self-regulate one's own learning.",
      "2.1 Acquire knowledge, understand and think critically in a friendship environment."
    ],
    habilidades: [
      { DescripcionHabilidad: "Solve problems with family and friends, organize and self-regulate one's own learning." },
      { DescripcionHabilidad: "Acquire knowledge, understand and think critically in a friendship environment." }
    ],
    permitirMultiples: false,
    indicacionesDocente: "Aplicar mediacion contextualizada, DUA e indicadores observables."
  });

  assert.equal(indicadores.length, 2);
  assert.match(indicadores[0], /^1\.1 Describes and justifies/i);
  assert.match(indicadores[1], /^2\.1 Describes and justifies/i);
  assert.match(indicadores[1], /oral or written product|observable participation evidence/i);
  assert.notEqual(
    indicadores[1],
    "2.1 Acquire knowledge, understand and think critically in a friendship environment."
  );
});

test("no bloquea por falsos positivos tecnicos de la auditoria semantica", () => {
  const auditoria = normalizarAuditoriaSemantica({
    cumple: false,
    incumplimientos: [
      'El campo "estrategiasMediacion" no cumple el formato obligatorio: se presenta como un arreglo de textos, cuando la referencia y las indicaciones mandatorias exigen un único texto plano (string).',
      'El resultado incorpora campos extra fuera de la estructura exacta obligatoria: "mes", "grado", "materiaNombre", "MateriaNombre", "criteriosEvaluacion", "camposReferencia" y "nombre".'
    ],
    fortalezas: []
  });

  assert.equal(auditoria.disponible, true);
  assert.equal(auditoria.cumple, true);
  assert.deepEqual(auditoria.incumplimientos, []);
});

test("la auditoria semantica puede quedar como alerta sin bloquear el planeamiento", () => {
  const resultado = {
    nombre: "Marzo - Noveno - Ingles",
    aprendizajesEsperados: ["1: Learners understand information about media."],
    criteriosEvaluacion: ["Understands information about media in classroom contexts."],
    estrategiasMediacion: [
      "Connection. Teacher presents a contextualized media situation and learners answer guided questions.",
      "Practice. Learners work in pairs and produce short oral and written responses."
    ],
    indicadoresEvaluacion: ["1.1 Demonstrates understanding of media information through guided oral or written responses in a classroom activity."]
  };
  const auditoria = normalizarAuditoriaSemantica({
    cumple: false,
    incumplimientos: ["La revisión independiente considera que falta mayor profundidad pedagógica."],
    fortalezas: []
  });

  const bloqueante = validarPlaneamientoGenerado(resultado, {
    idiomaEsperado: "en",
    indicadoresEsperadosPorHabilidad: [1],
    auditoriaSemantica: auditoria,
    auditoriaSemanticaBloqueante: true
  });
  assert.equal(bloqueante.puedeGuardar, false);

  const noBloqueante = validarPlaneamientoGenerado(resultado, {
    idiomaEsperado: "en",
    indicadoresEsperadosPorHabilidad: [1],
    auditoriaSemantica: auditoria,
    auditoriaSemanticaBloqueante: false
  });
  const revision = noBloqueante.verificaciones.find((item) => item.codigo === "auditoria_semantica");
  assert.equal(revision?.estado, "alerta");
  assert.equal(noBloqueante.puedeGuardar, true);
});

test("la auditoria ia se omite solo cuando la validacion deterministica esta limpia", () => {
  const resultado = {
    nombre: "Marzo - Noveno - Ingles",
    aprendizajesEsperados: ["1: Comprende informacion sobre medios de comunicacion."],
    criteriosEvaluacion: ["Comprende informacion sobre medios de comunicacion en contextos de aula."],
    estrategiasMediacion: [
      "Conexion. La persona docente presenta una situacion contextualizada sobre medios y el estudiantado responde preguntas guiadas.",
      "Practica. El estudiantado trabaja en parejas y produce respuestas orales y escritas breves."
    ],
    indicadoresEvaluacion: ["1.1 Demuestra comprension de informacion sobre medios mediante respuestas orales o escritas guiadas en una actividad de aula."]
  };
  const validacionLimpia = validarPlaneamientoGenerado(resultado, {
    idiomaEsperado: "es",
    indicadoresEsperadosPorHabilidad: [1]
  });
  assert.equal(validacionLimpia.puedeGuardar, true);
  assert.equal(debeAuditarPlaneamientoConIa({ validacion: validacionLimpia }), false);

  const validacionConError = validarPlaneamientoGenerado({
    ...resultado,
    indicadoresEvaluacion: []
  }, {
    idiomaEsperado: "es",
    indicadoresEsperadosPorHabilidad: [1]
  });
  assert.equal(debeAuditarPlaneamientoConIa({ validacion: validacionConError }), true);
});

test("la auditoria ia se conserva para referencias amplias o indicaciones complejas", () => {
  const validacion = validarPlaneamientoGenerado({
    nombre: "Marzo - Noveno - Ingles",
    aprendizajesEsperados: ["1: Learners understand information about media."],
    estrategiasMediacion: [
      "Connection. Teacher presents a contextualized media situation and learners answer guided questions.",
      "Practice. Learners work in pairs and produce short oral and written responses."
    ],
    indicadoresEvaluacion: ["1.1 Demonstrates understanding of media information through guided oral or written responses in a classroom activity."]
  }, {
    idiomaEsperado: "en",
    indicadoresEsperadosPorHabilidad: [1]
  });

  assert.equal(debeAuditarPlaneamientoConIa({
    validacion,
    indicacionesDocente: "Conservar exactamente la secuencia del machote y no copiar contenido sustantivo anterior.",
    usaReferenciaEstrategias: true,
    perfilEstrategiasReferencia: {
      encabezados: ["Connection", "Practice"],
      cantidadParrafos: 40,
      cantidadCaracteres: 9500,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "amplio",
      descripcion: "Referencia amplia."
    }
  }), true);
});

test("extrae solo la estrategia y conserva encabezados dinamicos repetidos", async () => {
  const buffer = await createReferenceDocx();
  const perfil = await analizarReferenciaDocxSemantica({
    buffer,
    originalname: "referencia.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  } as Express.Multer.File);

  assert.deepEqual(
    perfil.columnas.map((columna) => columna.rol),
    ["criterios", "estrategias", "indicadores"]
  );
  assert.match(perfil.estrategiasTexto, /Construccion colaborativa/);
  assert.doesNotMatch(perfil.estrategiasTexto, /Criterio anterior/);
  assert.doesNotMatch(perfil.estrategiasTexto, /Indicador anterior/);
  assert.deepEqual(perfil.encabezadosEstrategias, [
    "Preparacion del escenario",
    "Construccion colaborativa",
    "Preparacion del escenario"
  ]);
  assert.equal(perfil.seccionesModelo.length, 1);
  assert.equal(perfil.seccionesModelo[0]?.indiceTabla, 2);
  assert.deepEqual(
    perfil.seccionesModelo[0]?.roles,
    ["criterios", "estrategias", "indicadores"]
  );
  assert.ok(perfil.camposVariables.some((campo) => campo.etiqueta === "Eje tematico"));
});

test("valida el orden exacto incluso cuando un encabezado se repite", () => {
  const esperado = [
    "Preparacion del escenario",
    "Construccion colaborativa",
    "Preparacion del escenario"
  ];
  assert.equal(
    validarOrdenEncabezadosEstrategias(
      "Preparacion del escenario\nA\nConstruccion colaborativa\nB\nPreparacion del escenario\nC",
      esperado
    ).cumple,
    true
  );
  assert.equal(
    validarOrdenEncabezadosEstrategias(
      "Preparacion del escenario\nA\nConstruccion colaborativa\nB",
      esperado
    ).cumple,
    false
  );
});

test("reconoce contenido en etapas repetidas aunque el texto anterior tenga tildes", () => {
  const etapa = "PRIMERA ETAPA: APRENDIZAJE DE CONOCIMIENTOS";
  const validacion = validarPlaneamientoGenerado({
    nombre: "Planeamiento de prueba",
    aprendizajesEsperados: ["Aprendizaje actual"],
    indicadoresEvaluacion: ["1.1 Indicador observable"],
    estrategiasMediacion: [
      `${etapa}\nLa persona docente explica la relación entre el contenido y una situación auténtica del contexto.`,
      `${etapa}\nEl estudiantado analiza información, formula hipótesis y registra conclusiones mediante una guía.`,
      `${etapa}\nLos equipos comparan sus resultados, justifican las decisiones y reciben retroalimentación específica.`,
      `${etapa}\nCada estudiante aplica lo aprendido en una producción nueva y explica claramente su procedimiento.`
    ]
  }, {
    estructuraEstrategias: [etapa, etapa, etapa, etapa]
  });

  const estrategias = validacion.verificaciones.find((item) => item.codigo === "estructura_estrategias");
  assert.equal(estrategias?.estado, "ok");
  assert.equal(validacion.estrategiasEstructuradas.length, 4);
  assert.ok(validacion.estrategiasEstructuradas.every((item) => item.contenido.length >= 20));
});

test("advierte estrategias resumidas sin bloquear si tienen contenido útil", () => {
  const etapa = "PRIMERA ETAPA: APRENDIZAJE DE CONOCIMIENTOS";
  const referencia = [
    etapa,
    ...Array.from(
      { length: 96 },
      (_, index) => `Párrafo ${index + 1}: intervención pedagógica amplia con acciones, preguntas, apoyos y evidencias.`
    )
  ].join("\n");
  const perfil = construirPerfilEstrategiasReferencia(referencia, [etapa]);
  const validacion = validarPlaneamientoGenerado({
    nombre: "Planeamiento resumido",
    aprendizajesEsperados: ["Aprendizaje actual"],
    indicadoresEvaluacion: ["1.1 Indicador observable"],
    estrategiasMediacion: [
      etapa,
      ...Array.from(
        { length: 10 },
        (_, index) => `Párrafo breve ${index + 1} con una acción general del grupo.`
      )
    ]
  }, {
    estructuraEstrategias: [etapa],
    perfilEstrategias: perfil
  });

  const fidelidad = validacion.verificaciones.find((item) => item.codigo === "fidelidad_referencia");
  assert.equal(fidelidad?.estado, "alerta");
  assert.match(fidelidad?.detalle || "", /párrafos/i);
});

test("acepta estrategias con margen minimo de parrafos si conservan profundidad textual", () => {
  const etapa = "PRIMERA ETAPA: APRENDIZAJE DE CONOCIMIENTOS";
  const estrategias = [
    `${etapa}\nActividad de inicio con situacion contextualizada, preguntas generadoras, analisis de datos y registro de procedimientos para probabilidad de union y complemento.`,
    ...Array.from(
      { length: 78 },
      (_, index) => `Parrafo ${index + 2}: desarrollo amplio con mediacion docente, trabajo del estudiantado, ejercicio contextualizado, recurso concreto, producto observable, retroalimentacion y cierre parcial de la actividad de probabilidad.`
    )
  ];
  const validacion = validarPlaneamientoGenerado({
    nombre: "Planeamiento amplio",
    aprendizajesEsperados: ["Aprendizaje actual"],
    indicadoresEvaluacion: ["1.1 Indicador observable"],
    estrategiasMediacion: estrategias
  }, {
    perfilEstrategias: {
      encabezados: [etapa],
      cantidadParrafos: 115,
      cantidadCaracteres: 8262,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "amplio",
      descripcion: "Referencia amplia."
    }
  });

  const fidelidad = validacion.verificaciones.find((item) => item.codigo === "fidelidad_referencia");
  assert.equal(fidelidad?.estado, "ok");
});

test("no exige el volumen completo de un machote trimestral amplio para pocas habilidades", () => {
  const estrategiaSustantiva = "Construcción\n" + "Actividad musical contextualizada con escucha, exploración, producción sonora, retroalimentación y evidencia del aprendizaje. ".repeat(75);
  const validacion = validarPlaneamientoGenerado({
    nombre: "Junio, Julio y Agosto - Octavo - Música",
    aprendizajesEsperados: ["Aprendizaje musical"],
    criteriosEvaluacion: ["Criterio musical"],
    estrategiasMediacion: Array.from({ length: 42 }, (_, i) => `${estrategiaSustantiva} ${i + 1}`),
    indicadoresEvaluacion: ["1.1 Indicador musical"]
  }, {
    perfilEstrategias: {
      encabezados: [],
      cantidadParrafos: 248,
      cantidadCaracteres: 25754,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 18,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "amplio",
      descripcion: "Machote trimestral amplio."
    },
    habilidades: [{ DescripcionHabilidad: "Habilidad musical" }],
    indicadoresEsperadosPorHabilidad: [1]
  });

  assert.equal(validacion.verificaciones.find((item) => item.codigo === "fidelidad_referencia")?.estado, "ok");
});

test("el perfil no impone momentos cuando la referencia usa otra secuencia", () => {
  const perfil = construirPerfilEstrategiasReferencia(
    "Preparacion del escenario\nTexto amplio\nConstruccion colaborativa\nTexto amplio",
    ["Preparacion del escenario", "Construccion colaborativa"]
  );
  assert.deepEqual(perfil.encabezados, ["Preparacion del escenario", "Construccion colaborativa"]);
  assert.equal(perfil.encabezados.some((item) => /momento/i.test(item)), false);
});

test("no inventa encabezados por texto interno cuando el DOCX ya definio la secuencia", () => {
  const perfil = construirPerfilEstrategiasReferencia(
    [
      "El problema ¿que se debe conocer?",
      "Contenido inicial.",
      "Actividades de desarrollo",
      "Esta frase aparece dentro del contenido, pero no era un encabezado tipografico.",
      "El reporte oral o escrito",
      "El estudiantado prepara y presenta un reporte completo."
    ].join("\n"),
    ["El problema ¿que se debe conocer?", "El reporte oral o escrito"]
  );

  assert.deepEqual(
    perfil.encabezados,
    ["El problema ¿que se debe conocer?", "El reporte oral o escrito"]
  );
});

test("detecta contenido real entre encabezados sin reconstruir las estrategias", () => {
  const validacion = validarPlaneamientoGenerado({
    nombre: "Julio - Setimo - Estudios Sociales",
    aprendizajesEsperados: ["Aprendizaje uno"],
    criteriosEvaluacion: ["Criterio uno"],
    estrategiasMediacion: [
      "El problema ¿que se debe conocer?\nSe presenta una situacion contextualizada y una pregunta generadora.",
      "El reporte oral o escrito\nEl estudiantado organiza hallazgos y presenta un reporte con conclusiones.",
      "Para finalizar\nSe comparten conclusiones y se brinda retroalimentacion."
    ],
    indicadoresEvaluacion: ["Indicador uno"]
  }, {
    estructuraEstrategias: [
      "El problema ¿que se debe conocer?",
      "El reporte oral o escrito",
      "Para finalizar"
    ],
    perfilEstrategias: {
      encabezados: [
        "El problema ¿que se debe conocer?",
        "El reporte oral o escrito",
        "Para finalizar"
      ],
      cantidadParrafos: 6,
      cantidadCaracteres: 300,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 1,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "breve",
      descripcion: "Secuencia de prueba."
    }
  });

  const estructura = validacion.verificaciones.find(
    (item) => item.codigo === "estructura_estrategias"
  );
  assert.equal(estructura?.estado, "ok");
});

test("bloquea columnas vacias y estructura ajena aunque la auditoria no disponible sea alerta", () => {
  const validacion = validarPlaneamientoGenerado({
    nombre: "Plan solicitado",
    aprendizajesEsperados: ["Aprendizaje nuevo"],
    criteriosEvaluacion: [],
    estrategiasMediacion: [
      "Momento 1: estructura generica",
      "Momento 2: estructura generica"
    ],
    indicadoresEvaluacion: ["Indicador nuevo"]
  }, {
    nombreSolicitado: "Plan solicitado",
    estructuraEstrategias: ["Preparacion del escenario", "Construccion colaborativa"],
    perfilEstrategias: {
      encabezados: ["Preparacion del escenario", "Construccion colaborativa"],
      cantidadParrafos: 6,
      cantidadCaracteres: 1200,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "medio",
      descripcion: "Secuencia propia."
    },
    perfilDocumentoReferencia: {
      esDocx: true,
      columnas: [
        { indice: 0, encabezado: "Criterios", rol: "criterios" },
        { indice: 1, encabezado: "Estrategias", rol: "estrategias" },
        { indice: 2, encabezado: "Indicadores", rol: "indicadores" }
      ],
      camposVariables: [{ etiqueta: "Eje tematico", valorAnterior: "Tema anterior" }],
      estrategiasTexto: "",
      encabezadosEstrategias: ["Preparacion del escenario", "Construccion colaborativa"],
      valoresContenidoAnterior: [],
      cantidadSeccionesContenido: 1,
      seccionesModelo: [],
      descripcion: "Referencia de prueba."
    },
    auditoriaSemantica: {
      disponible: false,
      cumple: false,
      incumplimientos: ["No disponible"],
      fortalezas: []
    },
    referenciaObligatoria: true
  });

  assert.equal(validacion.puedeGuardar, false);
  const errores = new Set(
    validacion.verificaciones
      .filter((item) => item.estado === "error")
      .map((item) => item.codigo)
  );
  assert.ok(errores.has("criterios_referencia"));
  assert.equal(errores.has("campos_machote"), false);
  const alertas = new Set(
    validacion.verificaciones
      .filter((item) => item.estado === "alerta")
      .map((item) => item.codigo)
  );
  assert.ok(alertas.has("estructura_estrategias"));
  assert.equal(
    validacion.verificaciones.find((item) => item.codigo === "auditoria_semantica")?.estado,
    "alerta"
  );
});

test("rechaza etapas genéricas ajenas al machote de referencia", () => {
  const validacion = validarPlaneamientoGenerado({
    nombre: "Plan de Música",
    aprendizajesEsperados: ["Explora recursos de música digital."],
    criteriosEvaluacion: ["Aplica recursos digitales con intención musical."],
    estrategiasMediacion: [
      "PRIMERA ETAPA: APRENDIZAJE DE CONOCIMIENTOS\nEl grupo escucha ejemplos y completa una guía.",
      "SEGUNDA ETAPA: MOVILIZACIÓN Y APLICACIÓN\nEl grupo crea una secuencia sonora breve."
    ],
    indicadoresEvaluacion: ["1.1 Clasifica recursos de música digital."],
    camposReferencia: {}
  }, {
    nombreSolicitado: "Plan de Música",
    estructuraEstrategias: ["Conexión - Inicio", "Construcción", "Cierre - Clarificación"],
    perfilEstrategias: {
      encabezados: ["Conexión - Inicio", "Construcción", "Cierre - Clarificación"],
      cantidadParrafos: 2,
      cantidadCaracteres: 100,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "breve",
      descripcion: "Secuencia propia de Música."
    }
  });

  assert.equal(
    validacion.verificaciones.find((item) => item.codigo === "fidelidad_referencia")?.estado,
    "error"
  );
  assert.match(
    validacion.verificaciones.find((item) => item.codigo === "fidelidad_referencia")?.detalle || "",
    /etapas genéricas/i
  );
});

test("permite guardar si solo falla la disponibilidad de la auditoria independiente", () => {
  const etapa = "Preparacion del escenario";
  const validacion = validarPlaneamientoGenerado({
    nombre: "Plan solicitado",
    aprendizajesEsperados: ["Aprendizaje nuevo"],
    criteriosEvaluacion: ["Criterio nuevo"],
    estrategiasMediacion: [
      `${etapa}\nLa persona docente desarrolla una actividad contextualizada con consignas, recursos, evidencia y cierre.`,
      "La persona docente modela una resolucion breve y verifica comprension con preguntas guiadas.",
      "El estudiantado registra datos, compara procedimientos y explica el criterio utilizado.",
      "Construccion colaborativa\nEl estudiantado resuelve una practica guiada y comunica sus conclusiones con apoyo docente.",
      "Los equipos revisan respuestas, ajustan procedimientos y preparan una evidencia breve.",
      "La persona docente cierra con retroalimentacion y conecta el producto con el aprendizaje esperado."
    ],
    indicadoresEvaluacion: ["1.1 Indicador observable"],
    camposReferencia: { "Eje tematico": "Probabilidad" }
  }, {
    nombreSolicitado: "Plan solicitado",
    estructuraEstrategias: [etapa, "Construccion colaborativa"],
    perfilEstrategias: {
      encabezados: [etapa, "Construccion colaborativa"],
      cantidadParrafos: 6,
      cantidadCaracteres: 150,
      cantidadActividadesNumeradas: 0,
      cantidadPreguntas: 0,
      usaTemasNumerados: false,
      usaActividadesNumeradas: false,
      nivelDetalle: "breve",
      descripcion: "Secuencia propia."
    },
    perfilDocumentoReferencia: {
      esDocx: true,
      columnas: [
        { indice: 0, encabezado: "Criterios", rol: "criterios" },
        { indice: 1, encabezado: "Estrategias", rol: "estrategias" },
        { indice: 2, encabezado: "Indicadores", rol: "indicadores" }
      ],
      camposVariables: [{ etiqueta: "Eje tematico", valorAnterior: "Tema anterior" }],
      estrategiasTexto: "",
      encabezadosEstrategias: [etapa, "Construccion colaborativa"],
      valoresContenidoAnterior: [],
      cantidadSeccionesContenido: 1,
      seccionesModelo: [],
      descripcion: "Referencia de prueba."
    },
    auditoriaSemantica: {
      disponible: false,
      cumple: false,
      incumplimientos: ["No disponible"],
      fortalezas: []
    },
    referenciaObligatoria: true
  });

  assert.equal(validacion.puedeGuardar, true);
  assert.equal(
    validacion.verificaciones.find((item) => item.codigo === "auditoria_semantica")?.estado,
    "alerta"
  );
});

test("el Word coloca criterios, estrategias e indicadores en sus columnas correctas", async () => {
  const templateBuffer = await createReferenceDocx();
  const output = await renderPlaneamientoEnPlantillaDocx({
    resultado: {
      nombre: "Plan nuevo",
      materiaNombre: "Ciencias",
      mes: "Marzo",
      camposReferencia: {
        "Eje tematico": "Seres vivos y ambiente"
      },
      estructuraEstrategiasReferencia: [
        "Preparacion del escenario",
        "Construccion colaborativa",
        "Preparacion del escenario"
      ],
      plantillaFormatoDocx: {
        base64: templateBuffer.toString("base64")
      }
    },
    row: {
      MateriaNombre: "Ciencias",
      Observaciones: ""
    },
    contenido: {
      periodicidad: "mes",
      competenciaGeneral: "",
      aprendizajes: ["Aprendizaje nuevo"],
      criterios: ["Criterio nuevo"],
      estrategias: [
        "Preparacion del escenario\nContenido nuevo uno.",
        "Construccion colaborativa\nContenido nuevo dos.",
        "Preparacion del escenario\nContenido nuevo tres."
      ],
      indicadores: ["1.1 Indicador nuevo"],
      reflexiones: {},
      observaciones: ""
    },
    docente: "Docente de prueba",
    direccionRegional: "Regional de prueba",
    centroEducativo: "Centro de prueba",
    anioEscolar: "2026",
    cursoLectivo: "Setimo",
    periodoTexto: "I periodo"
  });

  assert.ok(output);
  const zip = await JSZip.loadAsync(output!);
  const xml = await zip.file("word/document.xml")!.async("string");
  const criterioIndex = xml.indexOf("Criterio nuevo");
  const estrategiaIndex = xml.indexOf("Contenido nuevo uno");
  const indicadorIndex = xml.indexOf("1.1 Indicador nuevo");
  assert.ok(criterioIndex >= 0);
  assert.ok(estrategiaIndex > criterioIndex);
  assert.ok(indicadorIndex > estrategiaIndex);
  assert.doesNotMatch(xml, /Criterio anterior del plan/);
  assert.doesNotMatch(xml, /Indicador anterior del plan/);
});

test("distribuye el contenido global entre varias tablas sin copiar el bloque completo", () => {
  const sections = construirContenidoSeccionesPlantilla({}, {
    aprendizajes: ["Aprendizaje 1", "Aprendizaje 2"],
    criterios: ["Criterio 1", "Criterio 2"],
    estrategias: ["Actividad 1", "Actividad 2", "Actividad 3", "Actividad 4"],
    indicadores: ["1.1 Indicador 1", "2.1 Indicador 2"]
  }, 2);

  assert.deepEqual(sections[0].estrategias, ["Actividad 1", "Actividad 2"]);
  assert.deepEqual(sections[1].estrategias, ["Actividad 3", "Actividad 4"]);
  assert.notDeepEqual(sections[0], sections[1]);
});

test("no convierte nueve filas tecnicas en nueve semanas ni repite habilidades", () => {
  const sections = construirContenidoSeccionesPlantilla({
    semanas: Array.from({ length: 4 }, (_, index) => ({
      semana: index + 1,
      habilidadBase: index % 2 ? "Habilidad semanal B" : "Habilidad semanal A",
      mediacionPedagogica: [`Mediación semanal ${index + 1}`],
      indicadores: [`Indicador semanal ${index + 1}`]
    }))
  }, {
    aprendizajes: ["Aprendizaje A", "Aprendizaje B"],
    saberes: ["Saber A", "Saber B"],
    criterios: ["Criterio A", "Criterio B"],
    estrategias: Array.from({ length: 9 }, (_, index) => `Actividad técnica ${index + 1}`),
    indicadores: ["1.1 Evidencia A", "2.1 Evidencia B"]
  }, 9);

  assert.equal(sections.length, 9);
  assert.equal(sections.flatMap((section) => section.aprendizajes).filter((item) => item === "Aprendizaje A").length, 1);
  assert.equal(sections.flatMap((section) => section.aprendizajes).filter((item) => item === "Aprendizaje B").length, 1);
  assert.equal(sections.flatMap((section) => section.estrategias).length, 9);
  assert.equal(sections.flatMap((section) => section.estrategias).some((item) => /Mediación semanal/.test(item)), false);
});

test("el Word tecnico separa saberes y conserva tiempos sin copiar contenido anterior", async () => {
  const technicalTable = table(
    row(
      cell(paragraph("Resultados de aprendizaje")),
      cell(paragraph("Saberes esenciales")),
      cell(paragraph("Estrategias para la mediación pedagógica")),
      cell(paragraph("Evidencias de aprendizaje")),
      cell(paragraph("Tiempo estimado (horas)"))
    ),
    ...Array.from({ length: 9 }, (_, index) => row(
      cell(paragraph(`Aprendizaje anterior ${index + 1}`)),
      cell(paragraph(`Saber anterior ${index + 1}`)),
      cell(paragraph(`Actividad anterior ${index + 1}`)),
      cell(paragraph(`Evidencia anterior ${index + 1}`)),
      cell(paragraph(`${index + 1} Horas`))
    ))
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${technicalTable}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const templateBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const output = await renderPlaneamientoEnPlantillaDocx({
    resultado: {
      plantillaFormatoDocx: { base64: templateBuffer.toString("base64") },
      semanas: Array.from({ length: 4 }, (_, index) => ({
        semana: index + 1,
        habilidadBase: index % 2 ? "Habilidad B" : "Habilidad A",
        mediacionPedagogica: [`Mediación semanal ${index + 1}`],
        indicadores: [`Indicador semanal ${index + 1}`]
      }))
    },
    row: { MateriaNombre: "Turismo rural", Observaciones: "" },
    contenido: {
      periodicidad: "mes",
      competenciaGeneral: "",
      aprendizajes: ["Aprendizaje nuevo A", "Aprendizaje nuevo B"],
      saberes: ["Saber esencial nuevo A", "Saber esencial nuevo B"],
      criterios: ["Criterio nuevo A", "Criterio nuevo B"],
      estrategias: Array.from({ length: 9 }, (_, index) => `Actividad técnica nueva ${index + 1}`),
      indicadores: ["1.1 Evidencia nueva A", "2.1 Evidencia nueva B"],
      reflexiones: {},
      observaciones: ""
    },
    docente: "Docente",
    direccionRegional: "Coto",
    centroEducativo: "CTP",
    anioEscolar: "2026",
    cursoLectivo: "Décimo",
    periodoTexto: "Mayo"
  });

  assert.ok(output);
  const outputZip = await JSZip.loadAsync(output!);
  const outputXml = await outputZip.file("word/document.xml")!.async("string");
  assert.equal((outputXml.match(/Aprendizaje nuevo A/g) || []).length, 1);
  assert.equal((outputXml.match(/Aprendizaje nuevo B/g) || []).length, 1);
  assert.equal((outputXml.match(/Saber esencial nuevo A/g) || []).length, 1);
  assert.equal((outputXml.match(/Saber esencial nuevo B/g) || []).length, 1);
  assert.equal((outputXml.match(/Actividad técnica nueva/g) || []).length, 9);
  assert.doesNotMatch(outputXml, /Aprendizaje anterior|Saber anterior|Actividad anterior|Evidencia anterior/);
  assert.match(outputXml, /1 Horas/);
  assert.match(outputXml, /9 Horas/);
});

test("verifica el Word final por estructura universal sin depender de la materia", async () => {
  const universalTable = table(
    row(
      cell(paragraph("Resultados de aprendizaje")),
      cell(paragraph("Saberes esenciales")),
      cell(paragraph("Estrategias para la mediación pedagógica")),
      cell(paragraph("Evidencias de aprendizaje")),
      cell(paragraph("Tiempo estimado (horas)"))
    ),
    row(
      cell(paragraph("Aprendizaje anterior extenso que debe desaparecer por completo.")),
      cell(paragraph("Saber anterior extenso que debe desaparecer por completo.")),
      cell(paragraph("Estrategia anterior extensa que debe desaparecer por completo y no corresponde a la materia nueva.")),
      cell(paragraph("Evidencia anterior extensa que debe desaparecer por completo.")),
      cell(paragraph("8 horas"))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${universalTable}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const templateBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const contenido = {
    periodicidad: "mes",
    competenciaGeneral: "",
    aprendizajes: ["Aprendizaje nuevo aplicable a cualquier área curricular."],
    saberes: ["Saber nuevo conceptual y procedimental de la materia actual."],
    criterios: ["Criterio nuevo observable."],
    estrategias: ["Estrategia nueva con acciones de la persona docente y del estudiantado para la habilidad actual."],
    indicadores: ["1.1 Evidencia nueva observable del aprendizaje actual."],
    reflexiones: {},
    observaciones: ""
  };
  const output = await renderPlaneamientoEnPlantillaDocx({
    resultado: { plantillaFormatoDocx: { base64: templateBuffer.toString("base64") } },
    row: { MateriaNombre: "Materia nueva", Observaciones: "" }, contenido,
    docente: "Docente", direccionRegional: "Regional", centroEducativo: "Centro",
    anioEscolar: "2026", cursoLectivo: "Décimo", periodoTexto: "Mayo"
  });
  assert.ok(output);
  const verificacion = await validarWordExportadoContraReferencia({
    referencia: templateBuffer,
    generado: output!,
    contenido,
    nombreReferencia: "plantilla-desconocida.docx"
  });
  assert.equal(verificacion.valido, true, verificacion.errores.join(" | "));

  const plantillaSinRenovar = await validarWordExportadoContraReferencia({
    referencia: templateBuffer,
    generado: templateBuffer,
    contenido,
    nombreReferencia: "plantilla-desconocida.docx"
  });
  assert.equal(plantillaSinRenovar.valido, false);
  assert.ok(plantillaSinRenovar.errores.length > 0);
});

test("no cuenta observaciones repetidas por celdas combinadas como fila pedagogica", async () => {
  const tableWithClosingRow = table(
    row(
      cell(paragraph("Resultados de aprendizaje")),
      cell(paragraph("Estrategias para la mediación pedagógica")),
      cell(paragraph("Evidencias de aprendizaje"))
    ),
    row(cell(paragraph("Aprendizaje anterior 1")), cell(paragraph("Estrategia anterior 1")), cell(paragraph("Evidencia anterior 1"))),
    row(cell(paragraph("Aprendizaje anterior 2")), cell(paragraph("Estrategia anterior 2")), cell(paragraph("Evidencia anterior 2"))),
    row(cell(paragraph("Observaciones:")), cell(paragraph("Observaciones:")), cell(paragraph("Observaciones:")))
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${tableWithClosingRow}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const perfil = await analizarReferenciaDocxSemantica({ buffer, originalname: "cierre-repetido.docx" } as any);
  assert.equal(perfil.cantidadBloquesContenido, 2);
});

test("el Word usa un bloque semanal distinto por tabla y elimina contenido pedagogico anterior", async () => {
  const weeklyTable = (suffix: string) => table(
    row(cell(
      paragraph("Grammar & Sentence Frames"),
      paragraph(`Old grammar ${suffix}`),
      paragraph("Vocabulary"),
      paragraph(`Old social networks ${suffix}`),
      paragraph("Phonology"),
      paragraph(`Old phonology ${suffix}`)
    )),
    row(
      cell(paragraph("Assessment Strategies & Evidences")),
      cell(paragraph("Learner can")),
      cell(paragraph("Didactic Sequence Mediation"))
    ),
    row(
      cell(paragraph(`Old indicator ${suffix}`)),
      cell(paragraph(`Old learning ${suffix}`)),
      cell(paragraph(`Old mediation ${suffix}`))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${weeklyTable("one")}${weeklyTable("two")}</w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const templateBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const output = await renderPlaneamientoEnPlantillaDocx({
    resultado: {
      plantillaFormatoDocx: { base64: templateBuffer.toString("base64") },
      semanas: [
        {
          semana: 1,
          habilidadBase: "Learning week one",
          proposito: "Purpose week one",
          mediacionPedagogica: ["Activity week one"],
          indicadores: ["1.1 Indicator week one"],
          camposPedagogicos: [
            { campo: "Grammar & Sentence Frames", valores: ["Present simple week one"] },
            { campo: "Vocabulary", valores: ["Wildlife week one"] },
            { campo: "Phonology", valores: ["Animal sounds week one"] }
          ]
        },
        {
          semana: 2,
          habilidadBase: "Learning week two",
          proposito: "Purpose week two",
          mediacionPedagogica: ["Activity week two"],
          indicadores: ["2.1 Indicator week two"],
          camposPedagogicos: [{ campo: "Vocabulary", valores: ["Conservation week two"] }]
        }
      ]
    },
    row: { MateriaNombre: "English", Observaciones: "" },
    contenido: {
      periodicidad: "month",
      competenciaGeneral: "",
      aprendizajes: ["Global learning"],
      criterios: ["Global criterion one", "Global criterion two"],
      estrategias: ["Global activity one", "Global activity two"],
      indicadores: ["Global indicator"],
      reflexiones: {},
      observaciones: ""
    },
    docente: "Teacher",
    direccionRegional: "Regional",
    centroEducativo: "School",
    anioEscolar: "2026",
    cursoLectivo: "Ninth",
    periodoTexto: "March"
  });

  assert.ok(output);
  const outputZip = await JSZip.loadAsync(output!);
  const outputXml = await outputZip.file("word/document.xml")!.async("string");
  assert.equal((outputXml.match(/Activity week one/g) || []).length, 1);
  assert.equal((outputXml.match(/Activity week two/g) || []).length, 1);
  assert.match(outputXml, /Wildlife week one/);
  assert.match(outputXml, /Conservation week two/);
  assert.match(outputXml, /Grammar &amp; Sentence Frames/);
  assert.match(outputXml, /Phonology/);
  assert.doesNotMatch(outputXml, /Old grammar|Old social networks|Old phonology|Old mediation|Old learning|Old indicator/);
});

test("el machote de Musica renueva cada fila de una misma tabla sin copiar el trimestre anterior", async () => {
  const musicTable = table(
    row(
      cell(paragraph("Aprendizaje esperado")),
      cell(paragraph("Estrategias didácticas sugeridas")),
      cell(paragraph("Indicador del aprendizaje esperado"))
    ),
    row(
      cell(paragraph("Aprendizaje anterior uno")),
      cell(paragraph("JUNIO semana 1"), paragraph("Actividad anterior sobre culturas milenarias uno.")),
      cell(paragraph("Se anota en las observaciones del proyecto."))
    ),
    row(
      cell(paragraph("Aprendizaje anterior dos")),
      cell(paragraph("JUNIO semana 2"), paragraph("Actividad anterior sobre culturas milenarias dos.")),
      cell(paragraph("Indicador anterior dos"))
    )
  );
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${musicTable}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", xml);
  const templateBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const output = await renderPlaneamientoEnPlantillaDocx({
    resultado: {
      plantillaFormatoDocx: { base64: templateBuffer.toString("base64") },
      semanas: [
        {
          semana: 1,
          habilidadBase: "Analiza recursos de producción musical.",
          proposito: "Reconocer recursos.",
          mediacionPedagogica: ["Setiembre semana 1", "Explora una estación de producción sonora y registra hallazgos nuevos."],
          indicadores: ["1.1 Reconoce recursos en una estación sonora."],
          camposPedagogicos: []
        },
        {
          semana: 2,
          habilidadBase: "Aplica recursos de producción musical.",
          proposito: "Producir una secuencia.",
          mediacionPedagogica: ["Setiembre semana 2", "Crea una secuencia sonora inédita y explica las decisiones técnicas."],
          indicadores: ["2.1 Produce una secuencia sonora verificable."],
          camposPedagogicos: []
        }
      ]
    },
    row: { MateriaNombre: "Música", Observaciones: "" },
    contenido: {
      periodicidad: "trimestre",
      competenciaGeneral: "",
      aprendizajes: ["Aprendizaje global uno", "Aprendizaje global dos"],
      criterios: ["Criterio uno", "Criterio dos"],
      estrategias: ["Estrategia global uno", "Estrategia global dos"],
      indicadores: ["1.1 Indicador global uno", "2.1 Indicador global dos"],
      reflexiones: {},
      observaciones: ""
    },
    docente: "Docente",
    direccionRegional: "Coto",
    centroEducativo: "Colegio",
    anioEscolar: "2026",
    cursoLectivo: "Octavo",
    periodoTexto: "II trimestre"
  });

  assert.ok(output);
  const outputZip = await JSZip.loadAsync(output!);
  const outputXml = await outputZip.file("word/document.xml")!.async("string");
  assert.equal((outputXml.match(/Setiembre semana 1/g) || []).length, 1);
  assert.equal((outputXml.match(/Setiembre semana 2/g) || []).length, 1);
  assert.match(outputXml, /Explora una estación de producción sonora/);
  assert.match(outputXml, /Crea una secuencia sonora inédita/);
  assert.doesNotMatch(outputXml, /JUNIO|culturas milenarias|Aprendizaje anterior|Indicador anterior/);
});

test("detecta una copia sustantiva de las estrategias de referencia", () => {
  const copiadoUno = "La persona docente proyecta un video sobre culturas milenarias y solicita comparar sus paisajes sonoros mediante preguntas concretas. Después organiza una plenaria y registra las respuestas del grupo en una guía de observación detallada.";
  const copiadoDos = "El estudiantado recopila información bibliográfica, prepara una muestra musical y presenta los hallazgos obtenidos ante el grupo. Finalmente construye réplicas de instrumentos, documenta el procedimiento y evalúa colectivamente los productos elaborados.";
  const deteccion = detectarCopiaSustantivaReferencia({
    estrategiasMediacion: [copiadoUno, copiadoDos, "Cierre nuevo y breve."]
  }, {
    esDocx: true,
    columnas: [],
    camposVariables: [],
    estrategiasTexto: `${copiadoUno}\n${copiadoDos}`,
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 1,
    cantidadBloquesContenido: 2,
    seccionesModelo: [],
    descripcion: "Referencia"
  });

  assert.equal(deteccion.copiaSustantiva, true);
  assert.equal(deteccion.coincidencias.length, 2);
});

test("el contrato estructurado exige cobertura verificable para cada habilidad", () => {
  const resultado = {
    contratoGeneracion: "planeamiento-estructurado-v1",
    aprendizajesEsperados: ["Resuelve ecuaciones de primer grado."],
    criteriosEvaluacion: ["Aplica procedimientos algebraicos."],
    estrategiasMediacion: ["El estudiantado modela y resuelve ecuaciones en parejas."],
    indicadoresEvaluacion: [
      "1.1 Comprueba la solución de una ecuación de primer grado.",
      "2.1 Plantea una ecuación a partir de un problema contextualizado."
    ],
    coberturaHabilidades: [
      { habilidadIndice: 1, aprendizajesIndices: [1], indicadoresIndices: [1] },
      { habilidadIndice: 2, aprendizajesIndices: [], indicadoresIndices: [2] }
    ]
  };

  const validacion = validarPlaneamientoGenerado(resultado, {
    habilidades: [
      { DescripcionHabilidad: "Comprueba ecuaciones de primer grado." },
      { DescripcionHabilidad: "Plantea problemas con ecuaciones." }
    ],
    indicadoresEsperadosPorHabilidad: [1, 1]
  });

  assert.equal(validacion.puedeGuardar, false);
  assert.equal(
    validacion.verificaciones.find((item) => item.codigo === "cobertura_habilidades")?.estado,
    "error"
  );
});
