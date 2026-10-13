const test = require('node:test');
const assert = require('node:assert');
const b = require('../public/blogs-model.js');

const sv = { idea: 'Idee', planned: 'Gepland', generating: 'In generatie', approved: 'Goedgekeurd', rejected: 'Afgewezen', review: 'Ter review', published: 'Gepubliceerd' };
const it = (id, status, d) => ({ id, status, publicatiedatum: d });

test('filters: live, wacht op jou en de rest als gepland', () => {
  assert.strictEqual(b.groepVan(it(1, 'Gepubliceerd'), sv), 'live');
  assert.strictEqual(b.groepVan(it(2, 'Ter review'), sv), 'wacht');
  ['Idee', 'Gepland', 'In generatie', 'Goedgekeurd', 'Afgewezen'].forEach((s) => assert.strictEqual(b.groepVan(it(3, s), sv), 'gepland'));
});

test('pastBijFilter ondersteunt ook een oude exacte status', () => {
  assert.strictEqual(b.pastBijFilter(it(1, 'Idee'), 'Idee', sv), true);
  assert.strictEqual(b.pastBijFilter(it(1, 'Idee'), 'Gepland', sv), false);
  assert.strictEqual(b.pastBijFilter(it(1, 'Idee'), 'alle', sv), true);
});

test('tellers per filter', () => {
  const t = b.telPerFilter([it(1, 'Gepubliceerd'), it(2, 'Gepubliceerd'), it(3, 'Ter review'), it(4, 'Gepland')], sv);
  assert.deepStrictEqual(t, { alle: 4, wacht: 1, gepland: 1, live: 2 });
});

test('kleur per status', () => {
  assert.strictEqual(b.toonVan('Gepubliceerd', sv), 'goed');
  assert.strictEqual(b.toonVan('Ter review', sv), 'let-op');
  assert.strictEqual(b.toonVan('Afgewezen', sv), 'fout');
  assert.strictEqual(b.toonVan('Idee', sv), 'neutraal');
  assert.strictEqual(b.toonVan('Gepland', sv), 'plan');
});

test('komend: deze maand en later oplopend, daarna het verleden terug, zonder datum onderaan', () => {
  const items = [it(1, 'x', '2026-08-03'), it(2, 'x', '2026-10-20'), it(3, 'x', '2026-11-03'), it(4, 'x', '2026-10-02'), it(5, 'x', ''), it(6, 'x', '2026-09-01')];
  const g = b.groepeerPerMaand(items, 'komend', '2026-10-13');
  assert.deepStrictEqual(g.map((x) => x.sleutel), ['2026-10', '2026-11', '2026-09', '2026-08', 'zonder']);
  assert.deepStrictEqual(g[0].items.map((x) => x.id), [4, 2]);
  assert.strictEqual(g[0].label, 'oktober 2026');
});

test('nieuw en oud draaien de volgorde om', () => {
  const items = [it(1, 'x', '2026-08-03'), it(2, 'x', '2026-10-20')];
  assert.deepStrictEqual(b.groepeerPerMaand(items, 'nieuw', '2026-10-13').map((x) => x.sleutel), ['2026-10', '2026-08']);
  assert.deepStrictEqual(b.groepeerPerMaand(items, 'oud', '2026-10-13').map((x) => x.sleutel), ['2026-08', '2026-10']);
});

test('lege invoer', () => {
  assert.deepStrictEqual(b.groepeerPerMaand([], 'komend', '2026-10-13'), []);
});
