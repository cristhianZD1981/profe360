const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  }).outputText)(exports);
  return exports;
}
const { aceptaWhatsAppAlumno, esMayorParaWhatsApp } = load('../src/utils/consentimientoWhatsApp.ts');
const { studentForm, studentPayload } = load('../src/features/estudiantes-matricula/model.ts');
test('check hereda aceptación y conserva negativa aunque encargado siga autorizado', () => {
  assert.equal(aceptaWhatsAppAlumno(null, true, []), true);
  assert.equal(aceptaWhatsAppAlumno(null, false, [{ aceptaWhatsApp: true }]), true);
  assert.equal(aceptaWhatsAppAlumno(false, true, [{ aceptaWhatsApp: true }]), false);
  assert.equal(aceptaWhatsAppAlumno(null, false, []), false);
});
test('el check solo se habilita desde el cumpleaños 18 con fecha válida', () => {
  assert.equal(esMayorParaWhatsApp('2008-09-22', '2026-09-22'), true);
  for (const fecha of ['2008-09-23', '', '2008-02-30', '2027-01-01']) {
    assert.equal(esMayorParaWhatsApp(fecha, '2026-09-22'), false);
  }
});
test('abrir y guardar la ficha conserva la diferencia entre heredado y decisión explícita', () => {
  for (const decision of [null, true, false]) {
    const form = studentForm({ AceptaWhatsAppEstudiante: decision, AutorizaWhatsAppEncargado: true });
    assert.equal(studentPayload(form, []).aceptaWhatsAppEstudiante, decision);
  }
});
const { permisoEncargadosEnFicha } = load('../src/utils/consentimientoWhatsApp.ts');
test('en mayor de edad el permiso informativo sigue el check de cualquier encargado', () => {
  assert.equal(permisoEncargadosEnFicha(true, false, [{ aceptaWhatsApp: false }, { aceptaWhatsApp: true }]), true);
  assert.equal(permisoEncargadosEnFicha(true, true, [{ aceptaWhatsApp: false }]), false);
  assert.equal(permisoEncargadosEnFicha(true, true, []), false);
});
test('para menor se conserva el permiso original y el check sigue el conjunto de encargados', () => {
  assert.equal(permisoEncargadosEnFicha(false, true, []), true);
  assert.equal(permisoEncargadosEnFicha(false, false, [{ aceptaWhatsApp: true }]), false);
  const guardians = [{ aceptaWhatsApp: true }];
  const info = permisoEncargadosEnFicha(true, false, guardians);
  assert.equal(info, true);
  assert.equal(aceptaWhatsAppAlumno(false, info, guardians), false);
});
