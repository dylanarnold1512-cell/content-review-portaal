// Tests voor de productkeuze per klant (Pagr. stap 4, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliseerProducten, productVlaggen } = require('../src/services/settings');
const { stappenVoor, STAPPEN, PAGR_STAPPEN } = require('../src/config/onboardingStappen');
const { normaliseerRij } = require('../src/services/onboarding');

test('leeg of onbekend product telt als Blogr.', () => {
  assert.equal(normaliseerProducten(''), 'Blogr.');
  assert.equal(normaliseerProducten(undefined), 'Blogr.');
  assert.equal(normaliseerProducten('iets'), 'Blogr.');
  assert.equal(normaliseerProducten('Beide'), 'Beide');
});

test('productVlaggen geeft per product de juiste onderdelen', () => {
  assert.deepEqual(productVlaggen('Blogr.'), { blogr: true, pagr: false });
  assert.deepEqual(productVlaggen('Pagr.'), { blogr: false, pagr: true });
  assert.deepEqual(productVlaggen('Beide'), { blogr: true, pagr: true });
  assert.deepEqual(productVlaggen(), { blogr: true, pagr: false });
});

test('stappenVoor kiest de juiste lijst', () => {
  assert.equal(stappenVoor('Blogr.').length, STAPPEN.length);
  assert.equal(stappenVoor('Pagr.').length, PAGR_STAPPEN.length);
  const beide = stappenVoor('Beide');
  assert.equal(beide.length, STAPPEN.length + PAGR_STAPPEN.filter((s) => !s.gedeeld).length);
  assert.equal(new Set(beide.map((s) => s.nr)).size, beide.length);
});

test('Pagr. stappen hebben unieke nummers vanaf 101 en bestaande fasen', () => {
  const nrs = PAGR_STAPPEN.map((s) => s.nr);
  assert.equal(new Set(nrs).size, nrs.length);
  assert.ok(nrs.every((n) => n >= 101));
  assert.ok(PAGR_STAPPEN.every((s) => 'ABCDE'.includes(s.fase)));
});

test('normaliseerRij herkent een Pagr. stap aan het nummer', () => {
  const rij = normaliseerRij({ id: 'x', properties: { Nr: { number: 104 }, Stap: { title: [{ plain_text: 'Plan voor de pagina\'s' }] } } });
  assert.equal(rij.fase, 'B');
  assert.ok(rij.uitleg.includes('planvoorstel'));
});
