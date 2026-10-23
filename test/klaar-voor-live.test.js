const test = require('node:test');
const assert = require('node:assert');
const K = require('../src/lp/klaarVoorLive');
const { standVan } = require('../src/lp/standen');

test('een pagina zonder fouten en punten is klaar, bewijs blokkeert niet', () => {
  assert.deepStrictEqual(K.beslisKlaar({ validatieFouten: [], punten: [{ soort: 'bewijs', tekst: 'Reviews ontbreken' }], fitPunten: [] }), { klaar: true, redenen: [] });
});

test('een punt, validatiefout of lege tekst maakt de pagina niet klaar', () => {
  const r = K.beslisKlaar({ validatieFouten: ['Titel ontbreekt'], punten: [{ soort: 'toon', tekst: 'Er staat hij' }], fitPunten: [{ tekst: 'Project past niet' }] });
  assert.strictEqual(r.klaar, false);
  assert.strictEqual(r.redenen.length, 3);
  assert.strictEqual(K.beslisKlaar({ contentLeeg: true }).klaar, false);
});

test('automatisch live alleen met schakelaar aan en genoeg live pagina\'s', () => {
  assert.strictEqual(K.autoLiveToegestaan({ autoLive: true }, 5), true);
  assert.strictEqual(K.autoLiveToegestaan({ autoLive: true }, 4), false);
  assert.strictEqual(K.autoLiveToegestaan({}, 20), false);
  assert.strictEqual(K.autoLiveToegestaan({ autoLive: 'ja' }, 20), false);
});

test('Klaar voor live heeft een eigen stand', () => {
  assert.strictEqual(standVan('Klaar voor live'), 'Klaar voor live');
  assert.strictEqual(standVan('Content klaar'), 'Ter controle');
});

test('plan automatisch goedkeuren werkt alleen met de schakelaar en genoeg live pagina\'s', () => {
  const { autoPlanToegestaan } = require('../src/lp/klaarVoorLive');
  assert.equal(autoPlanToegestaan({ autoPlan: true }, 5), true);
  assert.equal(autoPlanToegestaan({ autoPlan: true }, 4), false);
  assert.equal(autoPlanToegestaan({ autoPlan: false }, 20), false);
  assert.equal(autoPlanToegestaan({}, 20), false);
  assert.equal(autoPlanToegestaan(null, 20), false);
});
