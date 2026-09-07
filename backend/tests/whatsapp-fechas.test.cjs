const { test } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../dist/config/database');
const queries = [];
database.getPool = async () => ({ request() {
  const values = {};
  return {
    input(name, type, value) { values[name] = value; return this; },
    async query(text) { queries.push({ text, values }); return { recordset: [] }; }
  };
} });
const router = require('../dist/modules/reportes/reportes.routes').default;
const handler = router.stack.find(s => s.route?.path === '/admin/whatsapp').route.stack[0].handle;
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test('Excel incluye todos los registros filtrados y exige Super Admin', async () => {
  queries.length = 0;
  const r = response(); r.headers = {}; r.setHeader = (k, v) => { r.headers[k] = v; }; r.send = b => { r.buffer = b; };
  await handler({ auth: { roles: ['SUPER_ADMIN'] }, query: { fechaDesde: '2026-09-06', fechaHasta: '2026-09-06', formato: 'excel', tipo: 'COMUNICADO', institucionId: '4' } }, r);
  assert(r.headers['Content-Type'].includes('spreadsheetml'));
  const q = queries.find(q => q.text.includes('w.WhatsAppEnvioId,'));
  assert(!q.text.includes('TOP 1000')); assert.equal(q.values.tipo, 'COMUNICADO'); assert.equal(q.values.institucionId, 4);
  const book = await new (require('exceljs').Workbook)().xlsx.load(r.buffer);
  assert.equal(book.worksheets[0].getCell('B3').value, 'Fecha y hora');
  const denied = response(); await handler({ auth: { roles: ['PROFESOR'] }, query: { formato: 'excel' } }, denied);
  assert.equal(denied.code, 403);
});
test('Excel conserva teléfonos, texto y fecha de Costa Rica', async () => {
  const { crearExcelWhatsApp } = require('../dist/modules/reportes/whatsapp-excel');
  const buffer = await crearExcelWhatsApp([{ WhatsAppEnvioId: 1, CreatedAt: '2026-09-07T01:00:00Z', TelefonoDestino: '+50600123456', MotivoError: '=texto', Estado: 'FALLIDO' }], '2026-09-06', '2026-09-06');
  const book = await new (require('exceljs').Workbook)().xlsx.load(buffer);
  const sheet = book.worksheets[0];
  assert.equal(sheet.getCell('G4').value, '+50600123456');
  assert.equal(sheet.getCell('J4').value, '=texto');
  assert.equal(sheet.getCell('B4').value, new Date('2026-09-07T01:00:00Z').toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }));
});
test('resumen y listado filtran días de Costa Rica con límites UTC exclusivos', async () => {
  queries.length = 0;
  const res = response();
  await handler({ auth: { roles: ['SUPER_ADMIN'] }, query: { fechaDesde: '2026-09-06', fechaHasta: '2026-09-06' } }, res);
  assert.equal(res.code, 200);
  const filtered = queries.filter(q => q.text.includes('FROM dbo.WhatsAppEnvio w'));
  assert.equal(filtered.length, 2);
  for (const q of filtered) {
    assert(q.text.includes('w.CreatedAt >= DATEADD(hour, 6, CAST(@fechaDesde AS datetime2))'));
    assert(q.text.includes('w.CreatedAt < DATEADD(hour, 6, DATEADD(day, 1, CAST(@fechaHasta AS datetime2)))'));
    assert.equal(q.values.fechaDesde, '2026-09-06');
    assert.equal(q.values.fechaHasta, '2026-09-06');
  }
});
test('rechaza fechas inexistentes e intervalos invertidos', async () => {
  for (const query of [
    { fechaDesde: '2026-02-30', fechaHasta: '2026-03-01' },
    { fechaDesde: '2026-09-07', fechaHasta: '2026-09-06' }
  ]) {
    const res = response();
    await handler({ auth: { roles: ['SUPER_ADMIN'] }, query }, res);
    assert.equal(res.code, 400);
  }
});
