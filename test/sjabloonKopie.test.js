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

const { schoonFocus, trefwoordenUitOnderwerp } = require('../src/lp/sjabloonKopie');
const { bouwFocusBlok } = require('../src/lp/ai');
const { kiesUrls } = require('../src/lp/siteTeksten');

test('kopie met onderwerp: alleen de focus verschilt, opzet blijft gelijk', () => {
  const k = bouwSjabloonKopie(orig, { naam: 'Dakkapel', onderwerp: 'Dakkapellen plaatsen', instructie: 'Noem de soorten.' });
  assert.deepStrictEqual({ ...k.blueprint, focus: undefined }, { ...orig.blueprint, focus: undefined });
  assert.strictEqual(k.blueprint.focus.onderwerp, 'Dakkapellen plaatsen');
  assert.ok(k.blueprint.focus.trefwoorden.includes('dakkapel'));
  assert.ok(k.blueprint.focus.trefwoorden.includes('dakkapellen'));
  assert.strictEqual(schoonFocus({}), null);
  assert.deepStrictEqual(trefwoordenUitOnderwerp('Het plaatsen van een dakkapel'), ['plaatsen', 'plaats', 'dakkapel']);
});

test('focus komt in de AI prompt en pagina\'s over het onderwerp gaan voor bij het lezen van de site', () => {
  assert.strictEqual(bouwFocusBlok(null), '');
  const blok = bouwFocusBlok({ onderwerp: 'Dakkapellen', instructie: 'Noem de levertijd.' });
  assert.match(blok, /Onderwerp: Dakkapellen/);
  assert.match(blok, /Noem de levertijd/);
  const urls = kiesUrls({
    basis: 'https://klant.nl/', restPaginas: [{ url: 'https://klant.nl/over-ons/', titel: 'Over ons' }, { url: 'https://klant.nl/zolder/', titel: 'Zolder' }, { url: 'https://klant.nl/dakkapel-plaatsen/', titel: 'Dakkapel plaatsen' }],
    homepageLinks: [], uitsluit: [], voorkeur: ['dakkapel']
  });
  assert.deepStrictEqual(urls.map((u) => u.url), ['https://klant.nl/', 'https://klant.nl/dakkapel-plaatsen/', 'https://klant.nl/over-ons/', 'https://klant.nl/zolder/']);
});
