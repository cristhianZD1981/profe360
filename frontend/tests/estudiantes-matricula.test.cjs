const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const model = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/estudiantes-matricula/model.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText)(model);

test('conserva todos los encargados y sus autorizaciones independientes', () => {
  const guardians = model.guardiansForm([1, 2, 3].map(id => ({ Nombre: `Encargado ${id}`, AceptaWhatsApp: id === 1, AceptaCorreo: id === 2 })));
  const payload = model.studentPayload(model.studentForm({ Identificacion: '001', Nombre: 'Ana' }), guardians);
  assert.equal(payload.encargados.length, 3);
  assert.deepEqual(payload.encargados.map(g => g.recibeNotificaciones), [true, true, false]);
  assert.equal(payload.identificacion, '001');
});

test('rechaza duplicados activos y grupos de otro año o inactivos', () => {
  const form = model.enrollmentForm({ AnioLectivoId: 2, GrupoId: 20 });
  const years = [{ AnioLectivoId: 2, Activo: true }];
  const groups = [{ GrupoId: 20, AnioLectivoId: 2, Activo: true }];
  const history = [{ MatriculaId: 7, AnioLectivoId: 2, Estado: 'ACTIVA' }];
  assert.match(model.enrollmentError(form, history, null, groups, years, []), /Ya hay/);
  assert.equal(model.enrollmentError(form, history, 7, groups, years, []), '');
  assert.match(model.enrollmentError(form, [], null, [{ ...groups[0], Activo: false }], years, []), /grupo/);
  assert.match(model.enrollmentError(form, [], null, [{ ...groups[0], AnioLectivoId: 1 }], years, []), /grupo/);
});

test('valida repitencia y exige justificación para saltar niveles', () => {
  const history = [{ AnioLectivoId: 1, GrupoNivelAcademico: 7 }];
  const form = model.enrollmentForm({ AnioLectivoId: 2, NivelAcademico: 7 });
  assert.match(model.progressionError(form, history), /repitente/);
  form.esRepitente = true;
  assert.equal(model.progressionError(form, history), '');
  form.nivelAcademico = '9';
  assert.match(model.progressionError(form, history), /excepción/);
  form.permiteExcepcionProgresion = true;
  assert.match(model.progressionError(form, history), /justificación/);
  form.justificacionExcepcion = 'Autorización registrada';
  assert.equal(model.progressionError(form, history), '');
});

test('reintenta matrícula fallida sin duplicar al estudiante ya guardado', async () => {
  let studentId = null, saves = 0, attempts = 0;
  const steps = () => ({ studentId, studentChanged: false, withEnrollment: true,
    saveStudent: async () => { saves++; return { EstudianteId: 8 }; },
    studentSaved: record => { studentId = record.EstudianteId; return studentId; },
    saveEnrollment: async id => { assert.equal(id, 8); if (++attempts === 1) throw new Error('Fallo temporal'); }
  });
  await assert.rejects(model.saveCombined(steps()), /Fallo temporal/);
  await model.saveCombined(steps());
  assert.equal(saves, 1);
  assert.equal(attempts, 2);
});

test('fallo al guardar estudiante impide crear matrícula y ficha sola no matricula', async () => {
  let enrollments = 0;
  await assert.rejects(model.saveCombined({ studentId: null, studentChanged: true, withEnrollment: true,
    saveStudent: async () => { throw new Error('No guardado'); }, studentSaved: () => 1,
    saveEnrollment: async () => { enrollments++; }
  }), /No guardado/);
  await model.saveCombined({ studentId: 1, studentChanged: false, withEnrollment: false,
    saveStudent: async () => { throw new Error('No debe guardar'); }, studentSaved: () => 1,
    saveEnrollment: async () => { enrollments++; }
  });
  assert.equal(enrollments, 0);
});
