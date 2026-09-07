const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../dist/config/database');
let queries;
beforeEach(() => { queries = []; });
db.getPool = async () => ({ request() {
  const values = {};
  return {
    input(name, type, value) { values[name] = value; return this; },
    async query(text) {
      queries.push({ text, values });
      if (text.includes('SELECT TOP 1 g.Nombre AS GrupoNombre')) return { recordset: values.grupoId === 10 && values.usuarioId === 20 && values.institucionId === 1 && values.anioLectivoId === 2026 && values.periodoId === 2 ? [{ GrupoNombre: '12-3', Desde: '2026-07-01', Hasta: '2026-12-01' }] : [] };
      if (text.includes('FROM dbo.Matricula ma INNER JOIN')) return { recordset: [{ EstudianteId: 1 }] };
      if (text.includes('SELECT OBJECT_ID')) return { recordset: [{ Id: 1 }] };
      if (text.includes('FROM dbo.ComunicadoProfe c')) return { recordset: [{ ComunicadoId: 1, ProfesorId: 99, Mensaje: 'Mensaje de otro profesor', ContextoJson: '{"profesor":"Otro profesor"}', DestinosJson: '[{"Canal":"CORREO","Estado":"ACEPTADO"}]' }] };
      return { recordset: [] };
    }
  };
} });
const router = require('express').Router();
require('../dist/modules/reportes/comunicados-guia.routes').registrarReporteComunicadosGuia(router);
const handler = router.stack[0].route.stack[0].handle;
const req = (query = {}, auth = {}) => ({ auth: { userId: 20, institucionId: 1, ...auth }, query: { guiaGrupoId: '10', guiaAnioLectivoId: '2026', guiaPeriodoId: '2', desde: '2026-07-01', hasta: '2026-09-06', ...query } });
const res = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('reporte guía consulta todos los docentes y conserva estados por destinatario sin escribir', async () => {
  const r = res(); await handler(req(), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.data.rows[0].ProfesorId, 99);
  assert.equal(r.body.data.rows[0].destinos[0].Estado, 'ACEPTADO');
  assert(queries.every(q => !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i.test(q.text)));
  const query = queries.find(q => q.text.includes('FROM dbo.ComunicadoProfe c'));
  assert.equal(query.values.profesorId, null);
  for (const check of ['c.InstitucionId = @institucionId', 'ma.GrupoId = @grupoId', 'c.AnioLectivoId = @anio', 'c.PeriodoId = @periodo', 'gcs.GrupoClaseId = c.GrupoClaseId', 'c.Fecha <= @hoy']) assert(query.text.includes(check));
});
test('rechaza otro grupo, institución, período, docente o alumno', async () => {
  for (const request of [req({ guiaGrupoId: '11' }), req({ guiaPeriodoId: '3' }), req({}, { institucionId: 2 }), req({}, { userId: 99 }), req({ estudianteId: '999' })]) {
    queries = []; const r = res(); await handler(request, r);
    assert.equal(r.code, 403);
    assert(!queries.some(q => q.text.includes('FROM dbo.ComunicadoProfe c')));
  }
});
test('aplica filtros parametrizados y rechaza fechas o identificadores inválidos', async () => {
  const r = res(); await handler(req({ estudianteId: '1', profesorId: '99', materiaId: '5' }), r);
  assert.equal(r.code, 200);
  const q = queries.find(q => q.text.includes('FROM dbo.ComunicadoProfe c'));
  assert.equal(q.values.estudianteId, 1); assert.equal(q.values.profesorId, 99); assert.equal(q.values.materiaId, 5);
  for (const change of [{ desde: '2026-02-30' }, { desde: '2026-10-01' }, { materiaId: 'abc' }]) {
    const invalid = res(); await handler(req(change), invalid); assert.equal(invalid.code, 400);
  }
});
test('exporta un XLSX real con mensajes completos y estados por canal', async () => {
  const mod = await import('../../frontend/src/utils/comunicadosGuiaExcel.ts');
  const { exportarComunicadosGuia } = mod.default || mod;
  const originalUrl = URL.createObjectURL, originalDocument = global.document;
  let blob;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  global.document = { body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; } };
  try {
    await exportarComunicadosGuia('Comunicados — 12-3', '2026-09-06', ['Fecha','Alumno','ID','Sección','Materia','Profesor','Mensaje','WA','Correo'], [['2026-09-06','Alumno','00123','12-3','Matemática','Docente','=Mensaje\nSegunda línea','ACEPTADO','OMITIDO']]);
    const book = await new (require('exceljs').Workbook)().xlsx.load(await blob.arrayBuffer());
    const sheet = book.worksheets[0];
    assert.equal(sheet.getCell('C4').value, '00123');
    assert.equal(sheet.getCell('G4').value, '=Mensaje\nSegunda línea');
    assert.equal(sheet.getCell('H4').value, 'ACEPTADO');
    assert.equal(sheet.getCell('I4').value, 'OMITIDO');
    assert.equal(sheet.pageSetup.fitToWidth, 1);
  } finally { URL.createObjectURL = originalUrl; global.document = originalDocument; }
});
