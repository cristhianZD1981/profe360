const { test } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../dist/config/database');
let transacciones = 0;
database.getPool = async () => ({});
database.sql.Transaction = class { async begin() { transacciones++; throw new Error('No debe escribir'); } };
const router = require('../dist/modules/estudiantes/estudiantes.routes').default;
for (const [method, path] of [['post', '/'], ['put', '/:id']]) {
  test(`${method}: rechaza desactivar a menor antes de escribir en la BD`, async () => {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
    const handler = route.stack[route.stack.length - 1].handle;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ auth: { institucionId: 1 }, params: { id: '1' }, body: {
      identificacion: '001', nombre: 'Alumno', primerApellido: 'Uno', segundoApellido: 'Dos',
      fechaNacimiento: '2020-01-01', aceptaWhatsAppEstudiante: false
    } }, res);
    assert.equal(res.code, 400);
    assert.match(res.body.message, /18 años/);
    assert.equal(transacciones, 0);
  });
}
