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
const {automaticEnrollment, transportDescription} = model;
test('boleta usa grupo, ruta y correo principal actuales sin alterar historial', () => {
  const original = model.enrollmentForm({AnioLectivoId:2,GrupoId:20,SeccionTexto:'Vieja',RutaTransporte:'Anterior',CorreoEnvioBoleta:'old@example.com'});
  const student = model.studentForm({RutaTransporteId:3,RutaTransporteHabitual:'Texto anterior'});
  const guardians = model.guardiansForm([{Correo:'otro@example.com'},{Correo:' principal@example.com ',EsPrincipal:true}]);
  const resolved = automaticEnrollment(original,student,guardians,[{GrupoId:20,AnioLectivoId:2,Nombre:'12-3'}],[{RutaTransporteId:3,Descripcion:'Ruta centro'}]);
  assert.equal(resolved.seccionTexto,'12-3'); assert.equal(resolved.rutaTransporte,'Ruta centro'); assert.equal(resolved.correoEnvioBoleta,'principal@example.com');
  assert.equal(original.rutaTransporte,'Anterior'); assert.equal(original.seccionTexto,'Vieja');
});
test('correo alternativo y ausencia de correos no reutilizan direcciones ajenas', () => {
  const form=model.enrollmentForm({CorreoEnvioBoleta:'viejo@example.com'}), student=model.studentForm();
  const contacts=model.guardiansForm([{EsPrincipal:true},{Correo:'alterno@example.com'}]);
  assert.equal(automaticEnrollment(form,student,contacts,[],[]).correoEnvioBoleta,'alterno@example.com');
  contacts[1].correo=''; assert.equal(automaticEnrollment(form,student,contacts,[],[]).correoEnvioBoleta,'');
});
test('ruta histórica sin catálogo se conserva y selección vacía permite quitarla', () => {
  const student=model.studentForm({RutaTransporteHabitual:'Ruta antigua'});
  assert.equal(transportDescription(student,[]),'Ruta antigua');
  student.rutaTransporteId='99'; assert.equal(transportDescription(student,[]),'Ruta antigua');
  student.rutaTransporteId=''; student.rutaTransporteHabitual=''; assert.equal(transportDescription(student,[]),'');
});
test('secciones ordenadas por números, sin modificar el catálogo original', () => {
  const groups=['12-11','8-3','7-2','12-10','8-1','7-1','8-2'].map(Nombre=>({Nombre}));
  assert.deepEqual(model.sortedGroups(groups).map(g=>g.Nombre),['7-1','7-2','8-1','8-2','8-3','12-10','12-11']);
  assert.equal(groups[0].Nombre,'12-11');
});
test('nivel visible y guardado se derivan de la sección seleccionada', () => {
  assert.equal(model.levelName(model.groupLevel({Nombre:'8-1'})),'Octavo');
  assert.equal(model.levelName(model.groupLevel({Nombre:'10-2'})),'Décimo');
  assert.equal(model.groupLevel({Nombre:'8-1',NivelAcademico:10}),'8');
  assert.equal(model.groupLevel({Nombre:'Grupo especial',NivelAcademico:7}),'7');
  const result=model.automaticEnrollment(model.enrollmentForm({AnioLectivoId:1,GrupoId:2,NivelAcademico:10}),model.studentForm(),[],[{GrupoId:2,AnioLectivoId:1,Nombre:'8-1'}],[]);
  assert.equal(model.enrollmentPayload(result,1).nivelAcademico,8);
});
test('ruta guardada por identificador o descripción se muestra sin perder valores antiguos', () => {
  const routes=[{RutaTransporteId:1,Descripcion:'Ruta Centro',Activo:true}];
  assert.equal(model.studentForm({RutaTransporteHabitual:' ruta centro '},routes).rutaTransporteId,'1');
  assert.equal(model.studentForm({RutaTransporteDescripcion:'Ruta Centro'},routes).rutaTransporteId,'1');
  const old=model.studentForm({RutaTransporteId:99,RutaTransporteHabitual:'Ruta antigua'},routes);
  assert.equal(old.rutaTransporteId,'99');assert.equal(old.rutaTransporteHabitual,'Ruta antigua');
  assert.equal(model.studentForm({RutaTransporteHabitual:'Ruta Centro'},[...routes,{RutaTransporteId:2,Descripcion:'Ruta Centro'}]).rutaTransporteId,'');
});

test('los teléfonos nuevos muestran +506 editable y el prefijo solo no se guarda como número', () => {
  assert.equal(model.studentForm().telefono, '+506 ');
  assert.equal(model.guardianForm().telefono, '+506 ');
  assert.equal(model.guardianForm().telefonoSecundario, '+506 ');
  assert.equal(model.phonePayload('+506 '), null);
  assert.equal(model.phonePayload('8888-1234'), '+50688881234');
  assert.equal(model.phonePayload('+1 (202) 555-0100'), '+12025550100');
  const student = model.studentForm({Telefono:'8888 1234'});
  assert.equal(student.telefono, '+506 8888 1234');
  assert.equal(model.studentPayload(student, []).telefono, '+50688881234');
  const guardian = model.guardianForm({Telefono:'8888 1234',TelefonoSecundario:'+1 202 555 0100'});
  assert.equal(guardian.telefono, '+506 8888 1234');
  assert.equal(guardian.telefonoSecundario, '+1 202 555 0100');
  assert.equal(model.studentPayload(model.studentForm(), [guardian]).encargados[0].telefonoSecundario, '+12025550100');
});
test('un prefijo vacío no crea encargados ficticios en el expediente', () => {
  assert.deepEqual(model.studentPayload(model.studentForm(), model.guardiansForm()).encargados, []);
});
