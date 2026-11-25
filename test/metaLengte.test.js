const test = require('node:test');
const assert = require('node:assert');
const { kortTitelIn, kortBeschrijvingIn, pasMetaLengteToe } = require('../src/lp/metaLengte');

test('te lange titel: merk achter de streep wordt korter', () => {
  const uit = kortTitelIn('Mechanische ventilatie installeren in Haarlem | Hirs Installaties', 60);
  assert.strictEqual(uit, 'Mechanische ventilatie installeren in Haarlem | Hirs');
  assert.ok(uit.length <= 60);
});

test('titel die past blijft ongewijzigd', () => {
  assert.strictEqual(kortTitelIn('Badkamer renoveren Haarlem | Hirs', 60), 'Badkamer renoveren Haarlem | Hirs');
});

test('als het merk niet past valt het weg, geen halve woorden', () => {
  const uit = kortTitelIn('Mechanische ventilatie installeren in Haarlem en omgeving | Hirs Installaties', 55);
  assert.ok(uit.length <= 55);
  assert.ok(!uit.includes('|'));
});

test('beschrijving wordt aan het einde van een zin afgekapt', () => {
  const t = 'Eerste zin die lang genoeg is om mee te tellen voor de grens. Tweede zin hoort er nog net bij maar niet meer. Derde zin valt weg.';
  const uit = kortBeschrijvingIn(t, 110);
  assert.ok(uit.length <= 110);
  assert.ok(/[.!?]$/.test(uit));
});

test('pasMetaLengteToe past slotData aan en meldt wat er veranderde', () => {
  const slot = { metaTitle: 'Mechanische ventilatie installeren in Haarlem | Hirs Installaties', metaDescription: 'Kort.' };
  const gedaan = pasMetaLengteToe(slot, { metaTitleMax: 60, metaDescriptionMax: 155 });
  assert.strictEqual(gedaan.length, 1);
  assert.strictEqual(slot.metaTitle.length, 52);
  assert.strictEqual(slot.metaDescription, 'Kort.');
});

test('zonder seoRegels gebeurt er niets', () => {
  const slot = { metaTitle: 'x'.repeat(100) };
  assert.deepStrictEqual(pasMetaLengteToe(slot, null), []);
  assert.strictEqual(slot.metaTitle.length, 100);
});
