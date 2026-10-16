const test = require('node:test');
const assert = require('node:assert');
const { bouwSjabloonKopie, uniekBlueprintId } = require('../src/lp/sjabloonKopie');

const orig = { klant: 'macbouw', naam: 'Locatiegericht', blueprintId: 'locatiegericht', blueprint: { templateFormat: 'slots', htmlTemplate: '<section>{{h1}}</section>', cssTemplate: '.a{color:red}', slots: [{ key: 'h1' }], voorbeeldSlotData: { h1: 'Voorbeeld' } } };

test('kopie neemt opzet letterlijk over en start als Concept', () => {
  const k = bouwSjabloonKopie(orig, { naam: 'Dakkapel', bestaandeSjablonen: [{ naam: 'Locatiegericht', blueprintId: 'locatiegericht' }] });
  assert.strictEqual(k.klant, 'macbouw');
  assert.strictEqual(k.status, 'Concept');
  assert.strictEqual(k.blueprintId, 'dakkapel');
  assert.deepStrictEqual(k.blueprint, orig.blueprint);
  k.blueprint.slots.push({ key: 'x' });
  assert.strictEqual(orig.blueprint.slots.length, 1, 'kopie is los van het origineel');
});

test('blueprintId blijft uniek en dubbele naam wordt geweigerd', () => {
  assert.strictEqual(uniekBlueprintId('Dakkapel', ['dakkapel', 'dakkapel-2']), 'dakkapel-3');
  assert.throws(() => bouwSjabloonKopie(orig, { naam: 'locatiegericht', bestaandeSjablonen: [{ naam: 'Locatiegericht', blueprintId: 'locatiegericht' }] }), /al een sjabloon/);
  assert.throws(() => bouwSjabloonKopie(orig, { naam: 'ab' }), /minstens 3/);
  assert.throws(() => bouwSjabloonKopie({ klant: 'x', blueprint: {} }, { naam: 'Nieuw' }), /geen opzet/);
});
