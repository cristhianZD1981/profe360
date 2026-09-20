const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
}
const helpers = {};
new Function('exports', compile(fs.readFileSync(path.join(__dirname, '../src/utils/seguimientoProgreso.ts'), 'utf8')))(helpers);
const { crearProgresoIndicadores, coincideFiltroProgreso } = helpers;
const page = fs.readFileSync(path.join(__dirname, '../src/pages/GestionProfePage.tsx'), 'utf8');
function fragment(from, to) { return page.slice(page.indexOf(from), page.indexOf(to, page.indexOf(from))); }
// Ejecutar también los memos de la pantalla real, con su criterio de suspensión
// y asignación, para verificar que el resumen use los mismos datos que la tabla.
const screenCode = fragment('function isEstudianteSuspendido(', 'function getSuspensionTooltip(')
  + fragment('  function getSeguimientoIndicadoresAsignadosActividad(', '  function seguimientoIndicadorTieneCalificacion(')
  + fragment('  const seguimientoResumenSeccion = useMemo(', '  function ordenarActividadesEvaluativas(');
const calculateScreen = new Function('context', 'crearProgresoIndicadores', compile(`
  const {seguimientoContexto, seguimientoTipo = 'TAREAS', seguimientoPlaneamientoId = '',
    seguimientoComponenteTieneActividadesPlaneamiento = true,
    seguimientoActividadesPlaneamiento = [{ActividadId: 11}, {ActividadId: 12}],
    seguimientoActividadIndicadoresDraft = {}} = context;
  const useMemo = fn => fn();
  const normalizarSeguimientoKey = value => String(value || '').toUpperCase();
  const isTipoIndicadorSeguimiento = value => ['TAREAS', 'COTIDIANO'].includes(value);
  ${screenCode}
  return {resumen: seguimientoResumenSeccion, progreso: seguimientoProgresoIndicadores, estudiantes: seguimientoEstudiantesEvaluables};
`));
const students = Array.from({ length: 27 }, (_, index) => ({ EstudianteId: index + 1 }));
const indicadores = [1, 2, 3, 4].map(id => ({ IndicadorGrupoId: id, TipoUso: 'TAREAS', PlaneamientoId: 1 }));
const records = (id, count = 26, activity = id + 10) => Array.from({ length: count }, (_, index) => ({ IndicadorGrupoId: id, ActividadId: activity, EstudianteId: index + 1, ValorSeleccionado: 0 }));
function screen(overrides = {}, context = {}) {
  return calculateScreen({ seguimientoContexto: {
    estudiantes: students, indicadores, seguimientos: [...records(1), ...records(2)],
    actividadIndicadores: [{ IndicadorGrupoId: 1, ActividadId: 11 }, { IndicadorGrupoId: 2, ActividadId: 12 }],
    ...overrides
  }, ...context }, crearProgresoIndicadores);
}

test('caso 4 indicadores y 27 alumnos: dos parciales y dos sin calificar', () => {
  const result = screen();
  assert.deepEqual(result.resumen, { total: 4, calificados: 0, parciales: 2, noCalificados: 2, totalEstudiantes: 27 });
  assert.deepEqual(result.progreso.get(1), { estado: 'PARCIAL', calificados: 26, total: 27, pendientes: 1 });
  assert.equal(result.progreso.get(3).estado, 'NO_CALIFICADO');
});
test('un suspendido no impide completar: 26 de 26, conservando el total de 27', () => {
  for (const suspension of [{ Suspendido: true }, { Suspendido: '1' }, { Suspendido: 'Sí' }, { SuspensionId: 42 }, { MotivoSuspension: 'Medida', FechaFinSuspension: '2026-09-30' }]) {
    const result = screen({ estudiantes: students.map(s => s.EstudianteId === 27 ? { ...s, ...suspension } : s) });
    assert.equal(result.resumen.calificados, 2);
    assert.equal(result.resumen.parciales, 0);
    assert.equal(result.resumen.totalEstudiantes, 27);
    assert.deepEqual(result.progreso.get(1), { estado: 'COMPLETO', calificados: 26, total: 26, pendientes: 0 });
  }
});
test('sin alumnos habilitados nunca declara un indicador completo', () => {
  for (const roster of [[], students.map(s => ({ ...s, Suspendido: true }))]) {
    const result = screen({ estudiantes: roster });
    assert.equal(result.resumen.calificados, 0);
    assert.equal(result.resumen.parciales, 0);
    assert.equal(result.progreso.get(1).total, 0);
  }
});
test('duplicados, alumnos ajenos y suspendidos no inflan el numerador', () => {
  const input = { indicadoresIds: [1], estudiantesIds: [1, 2, 3, '3'], seguimientos: [
    { IndicadorGrupoId: 1, EstudianteId: 1 }, { IndicadorGrupoId: 1, EstudianteId: '1' },
    { IndicadorGrupoId: 1, EstudianteId: 99 }, { IndicadorGrupoId: 1, EstudianteId: 100 }
  ] };
  const before = JSON.stringify(input);
  assert.deepEqual(crearProgresoIndicadores(input).get(1), { estado: 'PARCIAL', calificados: 1, total: 3, pendientes: 2 });
  assert.equal(JSON.stringify(input), before, 'no cambia ni elimina calificaciones');
});
test('respeta actividad asignada: notas de otra tarea no completan este indicador', () => {
  const result = screen({ seguimientos: [...records(1, 27, 12), ...records(2, 27, 12)] });
  assert.equal(result.progreso.get(1).estado, 'NO_CALIFICADO');
  assert.equal(result.progreso.get(2).estado, 'COMPLETO');
  assert.equal(result.resumen.calificados, 1);
});
test('indicador sin asignar o con asignación inactiva no toma notas ajenas a la asignación', () => {
  const result = screen({ actividadIndicadores: [{ IndicadorGrupoId: 1, ActividadId: 11, Activo: false }], seguimientos: records(1, 27) });
  assert.equal(result.progreso.get(1).estado, 'NO_CALIFICADO');
});
test('cambiar el borrador de asignación actualiza la tabla y el resumen juntos', () => {
  const result = screen({ seguimientos: records(1, 27, 12) }, { seguimientoActividadIndicadoresDraft: { 11: [], 12: [1, 2] } });
  assert.equal(result.progreso.get(1).estado, 'COMPLETO');
  assert.equal(result.resumen.calificados, 1);
});
test('cotidiano sin asignaciones sigue contando sus calificaciones, incluidos ceros', () => {
  const result = screen({ indicadores: indicadores.map(i => ({ ...i, TipoUso: 'COTIDIANO' })), seguimientos: records(1, 27, 90), actividadIndicadores: [] }, { seguimientoTipo: 'COTIDIANO', seguimientoComponenteTieneActividadesPlaneamiento: false });
  assert.equal(result.resumen.calificados, 1);
  assert.equal(result.progreso.get(1).calificados, 27);
});
test('resumen respeta el rubro y el planeamiento sin depender de la tarea seleccionada', () => {
  const result = screen({ indicadores: [...indicadores, { IndicadorGrupoId: 5, TipoUso: 'COTIDIANO', PlaneamientoId: 1 }, { IndicadorGrupoId: 6, TipoUso: 'TAREAS', PlaneamientoId: 2 }] }, { seguimientoPlaneamientoId: '1' });
  assert.equal(result.resumen.total, 4);
  assert.equal(result.resumen.total, result.resumen.calificados + result.resumen.parciales + result.resumen.noCalificados);
});
test('filtros separan parcial/completo y conservan con alguna calificación y niveles', () => {
  for (const state of ['NO_CALIFICADO', 'PARCIAL', 'COMPLETO']) {
    assert.equal(coincideFiltroProgreso(state, state), true);
    assert.equal(coincideFiltroProgreso(state, 'CALIFICADO'), state !== 'NO_CALIFICADO');
    assert.equal(coincideFiltroProgreso(state, ''), true);
    assert.equal(coincideFiltroProgreso(state, 'INICIAL'), true);
    assert.equal(coincideFiltroProgreso(state, 'NO_ENTREGADO'), true);
  }
  assert.equal(coincideFiltroProgreso('PARCIAL', 'COMPLETO'), false);
  assert.equal(coincideFiltroProgreso('COMPLETO', 'NO_CALIFICADO'), false);
});
