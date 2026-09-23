const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../dist/config/database');
const email = require('../dist/services/email.service');
const whatsapp = require('../dist/services/whatsapp.service');
let mensajes, destinos, correos, was, autorizados, permisoWA, fallaWA, lecciones, alumnoExtra, contactosExtra;
beforeEach(() => { mensajes = []; destinos = []; correos = []; was = []; autorizados = true; permisoWA = true; fallaWA = false; lecciones = []; alumnoExtra = { FechaNacimiento: new Date("2015-01-01T00:00:00Z"), Telefono: "+50688880000" }; contactosExtra = null; });
class Request {
  constructor() { this.values = {}; }
  input(name, _type, value) { this.values[name] = value; return this; }
  async query(text) {
    const v = this.values;
    if (text.includes('CREATE TABLE dbo.ComunicadoProfe')) return { recordset: [] };
    if (text.includes('FROM dbo.Matricula ma')) return { recordset: [{ EstudianteId: 1, Nombre: 'Alumno', Identificacion: '001', AutorizaWhatsAppEncargado: permisoWA, ...alumnoExtra }] };
    if (text.includes('FROM dbo.HorarioGrupo hg')) return { recordset: lecciones };
    if (text.includes('CROSS JOIN dbo.Institucion')) return { recordset: [{ Nombre: 'Docente', Correo: 'docente@example.test', InstitucionNombre: 'Colegio' }] };
    if (text.includes('FROM dbo.EstudianteEncargado')) return { recordset: contactosExtra ?? [1,2].map((id) => ({ EncargadoId: id, Nombre: 'Encargado '+id, Correo: `enc${id}@example.test`, Telefono: '+5068888888'+id, AceptaWhatsApp: true })) };
    if (text.includes('WITH (UPDLOCK, HOLDLOCK)')) return { recordset: mensajes.filter((m) => m.SolicitudId === v.solicitudId) };
    if (text.includes('INSERT INTO dbo.ComunicadoProfe (')) {
      mensajes.push({ ComunicadoId: mensajes.length+1, SolicitudId: v.solicitudId, UsuarioId: v.usuarioId, InstitucionId: v.institucionId, EstudianteId: v.estudianteId, GrupoId: v.grupoId, MateriaId: v.materiaId, Mensaje: v.mensaje, Estado: 'EN_PROCESO', ContextoJson: v.snapshot, HorarioGrupoId: v.horario, Asunto: v.asunto, Cuerpo: v.texto });
      return { recordset: [{ ComunicadoId: mensajes.length }] };
    }
    if (text.includes('INSERT INTO dbo.ComunicadoProfeDestino')) {
      destinos.push({ ...v }); return { recordset: [{ ComunicadoDestinoId: destinos.length }] };
    }
    if (text.includes('UPDATE dbo.ComunicadoProfeDestino')) { Object.assign(destinos[v.id-1], v); return { recordset: [] }; }
    if (text.includes('UPDATE dbo.ComunicadoProfe SET')) { mensajes[v.id-1].Estado = v.estado; return { recordset: [] }; }
    return { recordset: [] };
  }
}
database.sql.Request = Request;
database.sql.Transaction = class { async begin() {} async commit() {} async rollback() {} };
const pool = { request: () => new Request() };
database.getPool = async () => pool;
email.sendEmail = async (args) => { correos.push(args); return { enviado: true, id: 'email-'+correos.length }; };
whatsapp.sendWhatsAppNotification = async (args) => { was.push(args); if (fallaWA) throw new Error('Proveedor no respondió'); return { enviado: true, whatsappEnvioId: was.length, messageUuid: 'wa-'+was.length }; };
const { registrarComunicados, parametrosComunicado, horaComunicado } = require('../dist/modules/gestion-profe/comunicados.routes');
const router = require('express').Router();
registrarComunicados(router, async () => autorizados ? { InstitucionId: 1, MateriaNombre: 'Matemáticas', GrupoNombre: '7-1' } : null);
const post = router.stack.find((s) => s.route.methods.post).route.stack[0].handle;
function req(override={}) { return { method: 'POST', auth: { userId: 20 }, params: { grupoId: '10', materiaId: '2' }, body: { anioLectivoId: 2026, periodoId: 1, estudianteId: 1, mensaje: 'Mensaje de prueba', solicitudId: '12345678-1234-1234-1234-123456789abc', ...override } }; }
function res() { return { code: 200, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; } }; }
test('envía a cada encargado por ambos canales, copia al profesor y conserva auditoría', async () => {
  const r = res(); await post(req(), r);
  assert.equal(r.code,200); assert.equal(correos.length,2); assert.equal(was.length,2); assert.equal(destinos.length,4);
  assert(correos.every((e) => e.cc === 'docente@example.test'));
  assert(was.every((w) => w.tipoMensaje === 'COMUNICADO' && w.templateParams.length === 8 && w.templateParams[0] === 'Comunicado'));
  assert.equal(mensajes[0].Estado,'COMPLETO'); assert(mensajes[0].Cuerpo.includes('Mensaje de prueba'));
  assert.equal(JSON.parse(mensajes[0].ContextoJson).profesor,'Docente');
  assert(destinos.every((d) => d.estado === 'ACEPTADO'));
});
test('repetir la solicitud no vuelve a contactar encargados', async () => {
  await post(req(),res()); const r=res(); await post(req(),r);
  assert.equal(r.body.data.repetido,true); assert.equal(mensajes.length,1); assert.equal(correos.length,2); assert.equal(was.length,2);
});
test('permite enviar sin horario disponible y guarda lección nula', async () => {
  const r = res(); await post(req(), r);
  assert.equal(r.code, 200);
  assert.equal(mensajes[0].HorarioGrupoId, null);
  assert.equal(correos.length, 2); assert.equal(was.length, 2);
  assert.equal(was[0].templateParams[5], 'Mensaje de prueba');
});
test('detecta automáticamente la lección actual sin recibirla del formulario', async () => {
  const { getCostaRicaIsoDate } = require('../dist/utils/date.utils');
  const fecha = getCostaRicaIsoDate();
  lecciones = [{ HorarioGrupoId: 5, DiaSemana: new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7, Nombre: 'Actual', HoraInicio: '00:00', HoraFin: '24:00' }];
  const r = res(); await post(req(), r);
  assert.equal(r.code, 200);
  assert.equal(mensajes[0].HorarioGrupoId, 5);
  assert.equal(JSON.parse(mensajes[0].ContextoJson).leccion, 'Actual (00:00–24:00)');
});
test('rechaza alumnos y lecciones ajenos y profesores sin asignación', async () => {
  for (const change of [{ estudianteId: 99 },{ horarioGrupoId:99 }]) { const r=res(); await post(req(change),r); assert(r.code >=400); }
  autorizados=false; const r=res(); await post(req(),r); assert.equal(r.code,403);
  assert.equal(correos.length,0); assert.equal(was.length,0);
});
test('respeta autorización WA y deja constancia sin bloquear correos', async () => {
  permisoWA=false; await post(req(),res()); assert.equal(was.length,0); assert.equal(correos.length,2);
  assert.equal(destinos.filter((d) => d.estado === 'OMITIDO').length,2);
});
test('un error de WA no interrumpe los demás destinatarios y queda como incierto', async () => {
  fallaWA=true; await post(req(),res()); assert.equal(correos.length,2); assert.equal(was.length,2);
  assert.equal(destinos.filter((d) => d.estado === 'INCIERTO').length,2); assert.equal(mensajes[0].Estado,'CON_OBSERVACIONES');
});
test('no permite reutilizar una solicitud para cambiar el mensaje y respeta el límite WABA', async () => {
  await post(req(),res()); const r=res(); await post(req({ mensaje:'Otro mensaje' }),r); assert.equal(r.code,409);
  const largo=res(); await post(req({ mensaje:'x'.repeat(801) }),largo); assert.equal(largo.code,400);
  assert.equal(correos.length,2);
});
test('metadatos WABA usan concepto, alumno, sección, materia, fecha, mensaje, profesor e institución', () => {
  const params=parametrosComunicado({ alumno:'A',seccion:'7-1',materia:'M',fecha:'2026-09-06',hora:'10:00:00',leccion:'Primera',profesor:'P',institucion:'I' },'Texto');
  assert.deepEqual(params.slice(0,5),['Comunicado','A','7-1','M','2026-09-06']); assert.equal(params[5],'Texto'); assert.deepEqual(params.slice(6),['P','I']);
  assert.equal(horaComunicado(new Date('2026-09-07T05:30:00Z')),'23:30:00');
});


test('adulto hereda permiso, envía solo al alumno y no duplica solicitud', async () => {
  alumnoExtra.FechaNacimiento = '2000-01-01';
  await post(req(), res()); await post(req(), res());
  assert.equal(was.length, 1); assert.equal(was[0].telefono, alumnoExtra.Telefono);
  assert.equal(correos.length, 2);
  const destino = destinos.find(d => d.canal === 'WHATSAPP');
  assert.equal(destino.encargadoId, null); assert.match(destino.nombre, /estudiante/);
});
test('adulto con negativa propia no envía al alumno ni al encargado', async () => {
  alumnoExtra.FechaNacimiento = '2000-01-01'; alumnoExtra.AceptaWhatsAppEstudiante = false;
  await post(req(), res()); assert.equal(was.length, 0); assert.equal(correos.length, 2);
  assert.match(destinos.find(d => d.canal === 'WHATSAPP').motivo, /no acepta/);
});
test('adulto autorizado sin encargados recibe su comunicado', async () => {
  alumnoExtra.FechaNacimiento = '2000-01-01'; alumnoExtra.AceptaWhatsAppEstudiante = true;
  contactosExtra = []; const r = res(); await post(req(), r);
  assert.equal(r.code, 200); assert.equal(was.length, 1); assert.equal(correos.length, 0);
});
test('menor exige aceptación individual y conserva los demás destinatarios', async () => {
  contactosExtra = [
    { EncargadoId: 1, Nombre: 'Acepta', Telefono: '+50688881111', AceptaWhatsApp: true },
    { EncargadoId: 2, Nombre: 'No acepta', Telefono: '+50688882222', AceptaWhatsApp: false }
  ];
  await post(req(), res()); assert.equal(was.length, 1); assert.equal(was[0].telefono, '+50688881111');
  assert.match(destinos.find(d => d.encargadoId === 2 && d.canal === 'WHATSAPP').motivo, /no acepta/);
});
test('nacimiento desconocido o adulto sin teléfono omite WA sin enviarlo al encargado', async () => {
  alumnoExtra.FechaNacimiento = null;
  await post(req(), res()); assert.equal(was.length, 0);
  assert.match(destinos.find(d => d.canal === 'WHATSAPP').motivo, /nacimiento/);
  alumnoExtra.FechaNacimiento = '2000-01-01'; alumnoExtra.Telefono = '';
  await post(req({ solicitudId: '22345678-1234-1234-1234-123456789abc' }), res());
  assert.equal(was.length, 0); assert.equal(correos.length, 4);
  assert(destinos.some(d => d.canal === 'WHATSAPP' && /teléfono/.test(d.motivo)));
});
