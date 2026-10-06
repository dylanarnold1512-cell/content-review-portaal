const test = require('node:test');
const assert = require('node:assert');
const { bepaalProfielStatus } = require('../src/services/merkprofiel');

const nu = new Date('2026-10-06T12:00:00Z');

test('geen rijen betekent geen profiel', () => {
  assert.strictEqual(bepaalProfielStatus([], nu).status, 'geen');
  assert.strictEqual(bepaalProfielStatus([{ id: 1, status: 'concept v2' }], nu).status, 'geen');
});

test('een recente bezig rij is bezig, een oude is mislukt', () => {
  assert.strictEqual(bepaalProfielStatus([{ id: 5, status: 'bezig', aangemaakt: '2026-10-06T11:55:00Z' }], nu).status, 'bezig');
  assert.strictEqual(bepaalProfielStatus([{ id: 5, status: 'bezig', aangemaakt: '2026-10-06T11:00:00Z' }], nu).status, 'mislukt');
});

test('de nieuwste rij wint en bevestigd blijft herkenbaar', () => {
  const rijen = [
    { id: 1, status: 'bevestigd', aangemaakt: '2026-10-01' },
    { id: 2, status: 'bezig', aangemaakt: '2026-10-06T11:58:00Z' },
    { id: 3, status: 'definitief concept', aangemaakt: '2026-10-06' }
  ];
  const stand = bepaalProfielStatus(rijen, nu);
  assert.strictEqual(stand.status, 'definitief concept');
  assert.strictEqual(stand.heeftBevestigd, true);
});

test('een lege uitkomst van de workflow wordt als leeg getoond', () => {
  assert.strictEqual(bepaalProfielStatus([{ id: 1, status: 'bezig', aangemaakt: '2026-10-06T11:58:00Z' }, { id: 2, status: 'leeg', aangemaakt: '2026-10-06' }], nu).status, 'leeg');
});
