const { test } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../dist/config/database');
let consultas = [];
database.getPool = async () => ({ request() {
  const values = {};
  return {
    input(name, _type, value) { values[name] = value; return this; },
    async query(sql) {
      consultas.push(sql);
      if (sql.includes('SELECT TOP 1 g.Nombre AS GrupoNombre')) {
        return { recordset: values.grupoId === 10 && values.usuarioId === 20 && values.institucionId === 1 && values.anioLectivoId === 2026 && values.periodoId === 2
          ? [{ GrupoNombre: '7-1', Desde: '2026-07-01', Hasta: '2026-12-01' }] : [] };
      }
      return { recordset: [] };
    }
  };
} });
const { autorizarReporteGuia } = require('../dist/modules/reportes/profe-guia-access');
const base = { auth: { userId: 20, institucionId: 1, roles: ['PROFESOR_GUIA'] }, query: { guiaGrupoId: '10', guiaAnioLectivoId: '2026', guiaPeriodoId: '2' } };
function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('autoriza únicamente una asignación guía de la institución, año y período solicitados', async () => {
  assert.equal((await autorizarReporteGuia(base, response())).grupoId, 10);
  for (const override of [{ guiaGrupoId: '11' }, { guiaAnioLectivoId: '2025' }, { guiaPeriodoId: '3' }, { guiaGrupoId: '-1' }]) {
    const res = response();
    assert.equal(await autorizarReporteGuia({ ...base, query: { ...base.query, ...override } }, res), null);
    assert.equal(res.code, 403);
  }
  const res = response();
  assert.equal(await autorizarReporteGuia({ ...base, auth: { ...base.auth, institucionId: 2 } }, res), null);
  assert.equal(res.code, 403);
});
test('reportes rechazan otro grupo, tipos no autorizados y alumnos ajenos', async () => {
  const router = require('../dist/modules/reportes/reportes.routes').default;
  const handler = router.stack.find((s) => s.route?.path === '/gestion-profe').route.stack[0].handle;
  for (const query of [{ tipo: 'ASISTENCIA', grupoId: '11' }, { tipo: 'NOTAS', grupoId: '10' }, { tipo: 'ASISTENCIA', grupoId: '10', estudianteId: '999' }]) {
    const res = response();
    await handler({ ...base, query: { ...base.query, ...query } }, res);
    assert.equal(res.code, 403);
  }
});
test('registro guía rechaza sincronización y materias no autorizadas sin escribir', async () => {
  const router = require('../dist/modules/eval360/eval360.routes').default;
  const handler = router.stack.find((s) => s.route?.path === '/seguimiento/contexto').route.stack[0].handle;
  consultas = [];
  for (const extra of [{ sincronizar: '1' }, { materiaId: '999' }, { grupoId: '11' }]) {
    const res = response();
    await handler({ ...base, query: { ...base.query, grupoId: '10', materiaId: '5', anioLectivoId: '2026', periodoId: '2', ...extra } }, res);
    assert.equal(res.code, 403);
  }
  assert(!consultas.some((sql) => /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE)\b/i.test(sql)));
});
test('el consolidado conserva notas cero, porcentajes, pendientes y ajustes manuales', async () => {
  const mod = await import('../../frontend/src/utils/registroNotas.ts');
  const { calcularRegistroNotas, prepararContextoNotas } = mod.default || mod;
  const contexto = prepararContextoNotas({
    estudiantes: [{ EstudianteId: 1, Nombre: 'Prueba', Identificacion: '001' }],
    detalles: [{ EstructuraGrupoDetalleId: 1, Nombre: 'Proyecto', Porcentaje: 40 }],
    actividades: [{ ActividadId: 1, EstructuraGrupoDetalleId: 1, Nombre: 'Proyecto 1', PuntosMaximos: 100, PorcentajeDentroRubro: 20 }, { ActividadId: 2, EstructuraGrupoDetalleId: 1, Nombre: 'Proyecto 2', PuntosMaximos: 100, PorcentajeDentroRubro: 20 }],
    notasActividades: [{ ActividadId: 1, EstudianteId: 1, PuntosObtenidos: 0, PuntosMaximos: 100, NotaObtenida: 0 }]
  });
  let alumno = calcularRegistroNotas(contexto)[0];
  assert.equal(alumno.totalEvaluado, 20);
  assert.equal(alumno.totalGanado, 0);
  assert.equal(alumno.componentes[0].evaluados, 1);
  assert.equal(alumno.componentes[0].pendientes, 1);
  assert.equal(alumno.componentes[0].detalles[0].estado, 'Calificada');
  contexto.componenteAjustesManuales = [{ EstudianteId: 1, EstructuraGrupoDetalleId: 1, PorcentajeObtenidoComponente: 35 }];
  alumno = calcularRegistroNotas(contexto)[0];
  assert.equal(alumno.totalGanado, 35);
  assert.equal(alumno.totalEvaluado, 40);
  assert.equal(alumno.componentes[0].ajustadoManual, true);
});
test('cotidiano, tareas, pruebas y asistencia mantienen sus cálculos y detalle', async () => {
  const mod = await import('../../frontend/src/utils/registroNotas.ts');
  const { calcularRegistroNotas, prepararContextoNotas } = mod.default || mod;
  const contexto = prepararContextoNotas({
    estudiantes: [{ EstudianteId: 1, Nombre: 'Prueba' }],
    detalles: ['Cotidiano', 'Tareas', 'Pruebas', 'Asistencia'].map((Nombre, i) => ({ Nombre, EstructuraGrupoDetalleId: i + 1, Porcentaje: [40, 15, 40, 5][i] })),
    actividades: [1, 2, 3].map((id) => ({ ActividadId: id, EstructuraGrupoDetalleId: id, Nombre: 'Actividad ' + id, PuntosMaximos: 100 })),
    indicadores: [1, 2].map((id) => ({ IndicadorGrupoId: id, IndicadorBase: 'Indicador ' + id, TipoUso: id === 1 ? 'Cotidiano' : 'Tareas' })),
    actividadIndicadores: [1, 2].map((id) => ({ ActividadId: id, IndicadorGrupoId: id, Activo: 1 })),
    seguimientos: [1, 2].map((id) => ({ SeguimientoIndicadorId: id, EstructuraGrupoDetalleId: id, ActividadId: id, EstudianteId: 1, IndicadorGrupoId: id, ValorSeleccionado: 3 })),
    notasActividades: [{ ActividadId: 3, EstudianteId: 1, PuntosObtenidos: 80, PuntosMaximos: 100, NotaObtenida: 80 }],
    asistenciaRegistros: [{ AsistenciaRegistroId: 1, EstudianteId: 1, Fecha: '2026-09-06', Estado: 'PRESENTE' }]
  });
  const a = calcularRegistroNotas(contexto)[0];
  assert.equal(a.totalEvaluado, 100);
  assert.equal(a.totalGanado, 92);
  assert.deepEqual(a.componentes.map((c) => c.porcentajeGanado), [40, 15, 32, 5]);
  assert(a.componentes.every((c) => c.detalles.length === 1));
});
test('la exportación de notas produce un XLSX con materia, profesor y detalle', async () => {
  const calcMod = await import('../../frontend/src/utils/registroNotas.ts');
  const { calcularRegistroNotas, prepararContextoNotas } = calcMod.default || calcMod;
  const exportMod = await import('../../frontend/src/utils/registroGuiaExcel.ts');
  const { exportarRegistroGuia } = exportMod.default || exportMod;
  const alumnos = calcularRegistroNotas(prepararContextoNotas({ estudiantes: [{ EstudianteId: 1, Nombre: 'Prueba', Identificacion: '00123' }], detalles: [{ EstructuraGrupoDetalleId: 1, Nombre: 'Proyecto', Porcentaje: 40 }], actividades: [{ ActividadId: 1, EstructuraGrupoDetalleId: 1, Nombre: 'Proyecto 1', PuntosMaximos: 100, PorcentajeDentroRubro: 40 }], notasActividades: [{ ActividadId: 1, EstudianteId: 1, PuntosObtenidos: 80, NotaObtenida: 80 }] }));
  const originalUrl = URL.createObjectURL;
  const originalDocument = global.document;
  let blob;
  URL.createObjectURL = (value) => { blob = value; return 'blob:test'; };
  global.document = { body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; } };
  try {
    await exportarRegistroGuia([{ materia: { MateriaNombre: 'Matemáticas', ProfesorNombre: 'Docente' }, alumnos }], '7-1');
    const ExcelJS = require('exceljs');
    const wb = await new ExcelJS.Workbook().xlsx.load(await blob.arrayBuffer());
    const sheet = wb.worksheets[0];
    assert.equal(sheet.getCell('B4').value, '00123');
    assert.equal(sheet.getCell('C4').value, 'Matemáticas');
    assert.equal(sheet.getCell('D4').value, 'Docente');
    assert.equal(sheet.getCell('I5').value, 'Proyecto 1');
    assert.equal(sheet.getCell('H6').value, 0.32);
    assert.equal(sheet.pageSetup.fitToWidth, 1);
  } finally { URL.createObjectURL = originalUrl; global.document = originalDocument; }
});
