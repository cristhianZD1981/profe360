import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  analizarReferenciaDocxSemantica,
  aplicarReglasObligatoriasPlaneamiento,
  construirAdecuacionSignificativa,
  construirPerfilEstrategiasReferencia,
  detectTemplateContentRole,
  extraerPaginasIndicadas,
  limpiarEncabezadoEstrategiaReferencia,
  perfilDocumentoParaRevision,
  renderPlaneamientoEnPlantillaDocx,
  validarOrdenEncabezadosEstrategias,
  validarPlaneamientoGenerado
} from "./planeamiento-ia.routes.js";

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

test("la auditoria excluye metadatos que completa el servidor", () => {
  const perfil = perfilDocumentoParaRevision({
    esDocx: true,
    columnas: [],
    camposVariables: [
      { etiqueta: "Dirección Regional de Educación", valorAnterior: "No especificada" },
      { etiqueta: "Centro educativo", valorAnterior: "No especificado" },
      { etiqueta: "Nombre y apellidos del o la docente", valorAnterior: "No especificado" },
      { etiqueta: "Mes", valorAnterior: "Mes anterior" },
      { etiqueta: "Eje temático Integrador", valorAnterior: "Tema anterior" },
      { etiqueta: "Unidad de trabajo", valorAnterior: "Unidad anterior" }
    ],
    estrategiasTexto: "",
    encabezadosEstrategias: [],
    valoresContenidoAnterior: [],
    cantidadSeccionesContenido: 0,
    descripcion: "Referencia de prueba"
  });

  assert.deepEqual(
    perfil?.camposVariables.map((campo) => campo.etiqueta),
    ["Eje temático Integrador", "Unidad de trabajo"]
  );
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

test("rechaza estrategias resumidas cuando la referencia tiene muchos parrafos", () => {
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
  assert.equal(fidelidad?.estado, "error");
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

test("bloquea columnas vacias, estructura ajena y auditoria no disponible", () => {
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
  assert.ok(errores.has("estructura_estrategias"));
  assert.ok(errores.has("fidelidad_referencia"));
  assert.ok(errores.has("campos_machote"));
  assert.ok(errores.has("auditoria_semantica"));
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
