const test = require('node:test');
const assert = require('node:assert');
const { maakOverzicht } = require('../public/overzicht.js');

const sv = { review: 'Ter review', approved: 'Goedgekeurd', rejected: 'Afgewezen', published: 'Gepubliceerd', idea: 'Idee', planned: 'Gepland' };
const nu = new Date('2026-10-06T12:00:00');

test('telt blogs die op review wachten en ideeën', () => {
  const o = maakOverzicht([
    { id: 1, status: 'Ter review', publicatiedatum: '2026-10-07' },
    { id: 2, status: 'Ter review', publicatiedatum: '' },
    { id: 3, status: 'Idee', publicatiedatum: '' },
    { id: 4, status: 'Afgewezen', publicatiedatum: '2026-10-08' }
  ], sv, nu);
  assert.strictEqual(o.review.length, 2);
  assert.strictEqual(o.aantalIdeeen, 1);
});

test('planning groepeert per maand op datum en zet blogs zonder datum apart', () => {
  const o = maakOverzicht([
    { id: 1, status: 'Gepland', publicatiedatum: '2026-11-03' },
    { id: 2, status: 'Gepland', publicatiedatum: '2026-10-20' },
    { id: 3, status: 'Gepland', publicatiedatum: '2026-10-08' },
    { id: 4, status: 'Idee', publicatiedatum: '' },
    { id: 5, status: 'Gepland', publicatiedatum: '2026-10-01' }
  ], sv, nu);
  assert.deepStrictEqual(o.perMaand.map((g) => g.label), ['oktober 2026', 'november 2026']);
  assert.deepStrictEqual(o.perMaand[0].items.map((i) => i.id), [3, 2]);
  assert.deepStrictEqual(o.zonderDatum.map((i) => i.id), [4]);
  assert.strictEqual(o.aantalGepland, 3);
});

test('gepubliceerd telt alleen de laatste 30 dagen en niet de toekomst', () => {
  const o = maakOverzicht([
    { id: 1, status: 'Gepubliceerd', publicatiedatum: '2026-10-01' },
    { id: 2, status: 'Gepubliceerd', publicatiedatum: '2026-08-01' },
    { id: 3, status: 'Gepubliceerd', publicatiedatum: '2026-10-06T00:00:00.000+02:00' },
    { id: 4, status: 'Gepubliceerd', publicatiedatum: '2026-12-01' }
  ], sv, nu);
  assert.strictEqual(o.gepubliceerd30d, 2);
});

test('lege of onjuiste invoer geeft een leeg overzicht', () => {
  const o = maakOverzicht(undefined, sv, nu);
  assert.strictEqual(o.review.length, 0);
  assert.deepStrictEqual(o.perMaand, []);
});

test('blogs ter review staan niet dubbel in de planning', () => {
  const o = maakOverzicht([
    { id: 1, status: 'Ter review', publicatiedatum: '2026-10-08' },
    { id: 2, status: 'Gepland', publicatiedatum: '2026-10-09' }
  ], sv, nu);
  assert.strictEqual(o.aantalGepland, 1);
  assert.deepStrictEqual(o.perMaand[0].items.map((i) => i.id), [2]);
});
