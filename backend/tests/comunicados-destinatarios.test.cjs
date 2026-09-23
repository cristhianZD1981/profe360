const { test } = require('node:test');
const assert = require('node:assert/strict');
const { edadComunicado, destinosWhatsAppComunicado, validarPermisoEstudiante } = require('../dist/modules/gestion-profe/comunicados-destinatarios');
const base = () => ({ hoy: '2026-09-22', fechaNacimiento: '2008-09-23', autorizaEncargados: true,
  estudiante: { EncargadoId: null, Nombre: 'Alumno', Telefono: '+50688880000', AceptaWhatsApp: true },
  encargados: [{ EncargadoId: 1, Nombre: 'Encargado', Telefono: '+50688881111', AceptaWhatsApp: true }] });
test('edad: víspera, cumpleaños 18 y fechas inválidas', () => {
  assert.equal(edadComunicado('2008-09-23', '2026-09-22'), 17);
  assert.equal(edadComunicado('2008-09-22', '2026-09-22'), 18);
  assert.equal(edadComunicado(new Date('2008-09-22T00:00:00Z'), '2026-09-22'), 18);
  for (const fecha of [null, '', 'inválida', '2008-02-30', '2027-01-01']) assert.equal(edadComunicado(fecha, '2026-09-22'), null);
});
test('menor recibe solo por encargado; adulto solo por alumno incluso sin encargados', () => {
  const p = base();
  assert.equal(destinosWhatsAppComunicado(p)[0].destino, p.encargados[0].Telefono);
  p.fechaNacimiento = '2008-09-22'; p.encargados = []; p.autorizaEncargados = false;
  const destinos = destinosWhatsAppComunicado(p);
  assert.equal(destinos.length, 1); assert.equal(destinos[0].destino, p.estudiante.Telefono); assert.equal(destinos[0].habilitado, true);
});
test('cada destinatario requiere su autorización y número, sin sustituirlo por otro', () => {
  for (const adulto of [true, false]) {
    for (const cambio of [{ AceptaWhatsApp: false }, { Telefono: '' }, { Telefono: 'abc' }]) {
      const p = base(); if (adulto) p.fechaNacimiento = '2000-01-01';
      Object.assign(adulto ? p.estudiante : p.encargados[0], cambio);
      const destinos = destinosWhatsAppComunicado(p);
      assert.equal(destinos.length, 1); assert.equal(destinos[0].habilitado, false); assert(destinos[0].motivo);
    }
  }
});
test('edad desconocida, permiso general apagado y menor sin encargados dejan motivo', () => {
  for (const cambio of [{ fechaNacimiento: null }, { autorizaEncargados: false }, { encargados: [] }]) {
    const destinos = destinosWhatsAppComunicado({ ...base(), ...cambio });
    assert.equal(destinos[0].habilitado, false); assert(destinos[0].motivo);
  }
});

test('herencia solo sin decisión propia; una negativa no se reactiva', () => {
  const p = base(); p.fechaNacimiento = '2000-01-01'; p.estudiante.AceptaWhatsApp = null;
  assert.equal(destinosWhatsAppComunicado(p)[0].habilitado, true);
  p.autorizaEncargados = false;
  assert.equal(destinosWhatsAppComunicado(p)[0].habilitado, true);
  p.encargados = [];
  assert.equal(destinosWhatsAppComunicado(p)[0].habilitado, false);
  p.estudiante.AceptaWhatsApp = false; p.autorizaEncargados = true;
  assert.equal(destinosWhatsAppComunicado(p)[0].habilitado, false);
});
test('servidor rechaza desactivar a menores y valores de permiso incorrectos', () => {
  assert.match(validarPermisoEstudiante(false, '2020-01-01'), /18 años/);
  assert.match(validarPermisoEstudiante(false, null), /18 años/);
  assert.match(validarPermisoEstudiante('false', '2000-01-01'), /verdadero o falso/);
  assert.equal(validarPermisoEstudiante(false, '2000-01-01'), '');
  assert.equal(validarPermisoEstudiante(null, '2020-01-01'), '');
});
