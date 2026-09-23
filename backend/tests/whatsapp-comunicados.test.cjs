const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../dist/config/database');
let queries, bodies, canal, template, failNetwork, consentimientoAlumno;
const originalFetch=global.fetch;
const oldMode=process.env.WHATSAPP_MODE, oldKey=process.env.WHATSAPP_2CHAT_API_KEY;
process.env.WHATSAPP_MODE='webhook'; process.env.WHATSAPP_2CHAT_API_KEY='test-only';
beforeEach(() => {
  queries=[]; bodies=[]; failNetwork=false; consentimientoAlumno=null;
  canal={WhatsAppCanalId:1,TipoCanal:'WABA',NumeroOrigen:'+50680000000'};
  template={Nombre:'notificacion_academica_general',TemplateUuid:'template-test',CantidadParametrosBody:8};
});
after(() => { global.fetch=originalFetch; if(oldMode===undefined) delete process.env.WHATSAPP_MODE; else process.env.WHATSAPP_MODE=oldMode; if(oldKey===undefined) delete process.env.WHATSAPP_2CHAT_API_KEY; else process.env.WHATSAPP_2CHAT_API_KEY=oldKey; });
class Request {
  constructor(){this.params={};}
  input(k,_t,v){this.params[k]=v;return this;}
  async query(q){
    queries.push({q,params:{...this.params}});
    if(q.includes("SELECT AceptaWhatsAppEstudiante")) return {recordset:[{AceptaWhatsAppEstudiante:consentimientoAlumno}]};
    if(q.includes('SELECT TelefonoPrincipal, WhatsAppContacto')) return {recordset:[{TelefonoPrincipal:this.params.institucionId===2?'22223333':'27840616',WhatsAppContacto:this.params.institucionId===2?'88889999':'8641 6420'}]};
    if(q.includes('SELECT TOP 1 c.*')) return {recordset:canal?[canal]:[]};
    if(q.includes('OUTPUT INSERTED.WhatsAppEnvioId')) return {recordset:[{WhatsAppEnvioId:10}]};
    if(q.includes('SELECT TOP 1 *') && q.includes('dbo.WhatsAppPlantilla')) return {recordset:template?[template]:[]};
    if(q.includes('SELECT TOP 1 c.WhatsAppCanalId')) return {recordset:[{WhatsAppCanalId:1}]};
    return {recordset:[]};
  }
}
database.sql.Request=Request;
database.sql.Transaction=class{async begin(){} async commit(){} async rollback(){}};
database.getPool=async()=>({request:()=>new Request()});
global.fetch=async(_url,options)=>{bodies.push(JSON.parse(options.body)); if(failNetwork) throw new Error('Timeout de prueba'); return {ok:true,status:200,text:async()=>JSON.stringify({success:true,message_uuid:'uuid-test'})};};
const {sendWhatsAppNotification}=require('../dist/services/whatsapp.service');
const input={tipoMensaje:'COMUNICADO',institucionId:1,telefono:'+50688888888',mensaje:'Prueba',templateParams:['Comunicado','Alumno','7-1','Materia','2026-09-06','Mensaje','Profesor','Institución']};
test('COMUNICADO usa la plantilla WABA y queda en la bitácora',async()=>{
  const r=await sendWhatsAppNotification(input); assert.equal(r.enviado,true); assert.equal(r.whatsappEnvioId,10);
  assert.equal(bodies[0].template_uuid,'template-test'); assert.deepEqual(bodies[0].params.body,input.templateParams);
  assert(queries.some((x)=>x.params.tipoMensaje==='COMUNICADO')); assert(queries.some((x)=>x.params.estado==='ACEPTADO'));
});
test('rechaza canal QR o plantilla incorrecta sin contactar al proveedor',async()=>{
  canal.TipoCanal='WHATSAPP_WEB'; assert.equal((await sendWhatsAppNotification(input)).enviado,false);
  canal.TipoCanal='WABA'; template.Nombre='otra'; assert.equal((await sendWhatsAppNotification(input)).enviado,false);
  assert.equal(bodies.length,0);
});
test('conserva el id de bitácora ante error de red o falta de canal',async()=>{
  failNetwork=true; const r=await sendWhatsAppNotification(input); assert.equal(r.estado,'INCIERTO'); assert.equal(r.whatsappEnvioId,10);
  assert(queries.some((x)=>x.params.estado==='INCIERTO'));
  canal=null; const omitido=await sendWhatsAppNotification(input); assert.equal(omitido.modo,'omitido'); assert.equal(omitido.whatsappEnvioId,10);
});
function response(){return {code:200,status(c){this.code=c;return this;},json(body){this.body=body;return this;}};}
test('mantenimiento está protegido por SUPER_ADMIN y valida conceptos antes de guardar',async()=>{
  const router=require('../dist/modules/instituciones/instituciones.routes').default;
  const route=router.stack.find((s)=>s.route?.path==='/whatsapp/fallback/conceptos').route;
  const denied=response(); route.stack[0].handle({auth:{roles:['PROFESOR']}},denied,()=>assert.fail('No debe autorizar')); assert.equal(denied.code,403);
  const handler=route.stack.at(-1).handle;
  for(const plantillas of [[{tipoMensaje:'COMUNICADO',nombre:'otra',templateUuid:'x',cantidadParametrosBody:8}], [{tipoMensaje:'COMUNICADO',nombre:'notificacion_academica_general',templateUuid:'x',cantidadParametrosBody:7}]]){
    const r=response();await handler({body:{plantillas}},r);assert.equal(r.code,400);
  }
});
test('quitar conceptos desactiva asociaciones sin borrar historial',async()=>{
  const router=require('../dist/modules/instituciones/instituciones.routes').default;
  const handler=router.stack.find((s)=>s.route?.path==='/whatsapp/fallback/conceptos').route.stack.at(-1).handle;
  const r=response();await handler({body:{plantillas:[]}},r);assert.equal(r.code,200);
  assert(queries.some((x)=>x.q.includes('SET Activo=0')&&x.params.tipos==='[]'));
  assert(!queries.some((x)=>/\bDELETE\b/i.test(x.q)));
  assert(!queries.some((x)=>x.q.includes('dbo.WhatsAppEnvio')));
});

for (const tipoMensaje of ['ASISTENCIA','BOLETA','TAREA','PROYECTO','COTIDIANO','EXAMENES','COMUNICADO']) {
  test(`${tipoMensaje}: conserva 8 variables y agrega contacto solo al configurar 10`, async()=>{
    await sendWhatsAppNotification({...input,tipoMensaje});
    assert.deepEqual(bodies[0].params.body,input.templateParams);
    assert(!queries.some(x=>x.q.includes('SELECT TelefonoPrincipal, WhatsAppContacto')));
    template.CantidadParametrosBody=10;
    assert.equal((await sendWhatsAppNotification({...input,tipoMensaje,institucionId:2})).enviado,true);
    assert.deepEqual(bodies[1].params.body,[...input.templateParams,'22223333','88889999']);
    assert.equal((await sendWhatsAppNotification({...input,tipoMensaje,institucionId:1})).enviado,true);
    assert.deepEqual(bodies[2].params.body.slice(-2),['27840616','8641 6420']);
  });
}
test('canal QR incorpora contactos antes del agradecimiento',async()=>{
  canal.TipoCanal='WHATSAPP_WEB';
  const r=await sendWhatsAppNotification({...input,tipoMensaje:'ASISTENCIA',mensaje:'Reporte\n\nGracias por su atención.'});
  assert.equal(r.enviado,true);
  assert.match(bodies[0].text,/teléfono 27840616 o al WhatsApp del colegio 8641 6420/);
  assert.match(bodies[0].text,/Este número es solo informativo.\n\nGracias por su atención.$/);
});
test('plantilla nueva rechaza datos incompletos sin llamar al proveedor',async()=>{
  template.CantidadParametrosBody=10;
  assert.equal((await sendWhatsAppNotification({...input,templateParams:['incompleto']})).enviado,false);
  assert.equal(bodies.length,0);
});
test('contactos opcionales en texto libre no inventan números',()=>{
  const {agregarContactoConsultas}=require('../dist/utils/whatsapp-contacto');
  assert.match(agregarContactoConsultas('Reporte',{}),/comunicarse directamente con el colegio/);
  assert.match(agregarContactoConsultas('Reporte',{TelefonoPrincipal:'12345678'}),/llamar al teléfono 12345678/);
  assert.match(agregarContactoConsultas('Reporte',{WhatsAppContacto:'87654321'}),/WhatsApp del colegio 87654321/);
});

for (const tipoMensaje of ['ASISTENCIA','BOLETA','TAREA','PROYECTO','COTIDIANO','EXAMENES','COMUNICADO']) {
  test(`${tipoMensaje}: la negativa propia impide envío al alumno o al encargado`, async () => {
    consentimientoAlumno = false;
    for (const telefono of ['+50688881111', '+50688882222']) {
      const r = await sendWhatsAppNotification({ ...input, tipoMensaje, estudianteId: 17, telefono });
      assert.equal(r.enviado, false); assert.equal(r.modo, 'omitido'); assert.match(r.motivo, /desactivó/);
    }
    assert.equal(bodies.length, 0);
    assert(queries.every(x => x.q.includes('SELECT AceptaWhatsAppEstudiante')));
    assert(queries.every(x => x.params.estudianteId === 17 && x.params.institucionId === 1));
  });
}
test('permiso heredado no bloquea los demás flujos; decisión explícita sí', async () => {
  for (const permiso of [null, true]) {
    consentimientoAlumno = permiso;
    assert.equal((await sendWhatsAppNotification({ ...input, estudianteId: 17 })).enviado, true);
  }
  assert.equal(bodies.length, 2);
});
