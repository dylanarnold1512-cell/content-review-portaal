const test = require('node:test');
const assert = require('node:assert/strict');
const { maakControle, oplossingVoor } = require('../src/lp/controle');

test('geen fouten en geen waarschuwingen is ok', () => {
  const c = maakControle({ errors: [], warnings: [] });
  assert.equal(c.ok, true);
  assert.match(c.samenvatting, /Alles is in orde/);
});

test('fouten blokkeren en krijgen een oplosknop als de AI het kan oplossen', () => {
  const c = maakControle({ errors: ['Meta title ontbreekt.', 'Iets onbekends.'], warnings: [] });
  assert.equal(c.ok, false);
  assert.equal(c.fouten[0].soort, 'opnieuw');
  assert.ok(c.fouten[0].knop);
  assert.equal(c.fouten[1].knop, null);
  assert.match(c.samenvatting, /2 fouten blokkeren/);
});

test('waarschuwingen blokkeren niet', () => {
  const c = maakControle({ errors: [], warnings: ['De sectie met "Projecten" heeft geen inhoud en wordt niet gepubliceerd.'] });
  assert.equal(c.ok, true);
  assert.equal(c.letOp[0].soort, 'info');
  assert.match(c.samenvatting, /1 aandachtspunt\./);
});

test('lege invoer geeft geen fout', () => {
  assert.equal(maakControle().ok, true);
  assert.equal(oplossingVoor('x').knop, null);
});
