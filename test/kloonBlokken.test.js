const test = require('node:test');
const assert = require('node:assert');
const { lijstSecties, renderSectieHtml } = require('../src/lp/kloonBlokken');
const { bouwKloonVerzoek } = require('../src/lp/wpKloon');

const blueprint = {
  templateFormat: 'slots',
  htmlTemplate: '<section><h1>{{kop}}</h1></section>\n<section class="blokjes"><h2>Blokjes</h2><p>{{tekst}}</p><script>alert(1)</script></section>\n<section class="vorm"><h2>Contact</h2>{{formulier}}</section>',
  cssTemplate: '.blokjes{color:red}'
};
const pagina = { klant: 'roots', slug: 'testival', content: { slotData: { kop: 'Hoofdkop', tekst: 'Slapen na het festival' }, overrides: { x: 1 } }, invoer: {} };

test('lijstSecties: laat de hero weg', () => {
  const s = lijstSecties(blueprint, pagina.content.slotData);
  assert.deepStrictEqual(s.map((x) => x.index), [1, 2]);
});

test('lijstSecties: oud blokkenformaat wordt geweigerd', () => {
  assert.throws(() => lijstSecties({ templateFormat: 'blocks' }, {}), /slot-formaat/);
});

test('renderSectieHtml: alleen die sectie, met css, zonder scripts en schema', () => {
  const html = renderSectieHtml({ blueprint, pagina, sectie: 1 });
  assert.match(html, /Slapen na het festival/);
  assert.match(html, /\.blokjes\{color:red\}/);
  assert.doesNotMatch(html, /Hoofdkop/);
  assert.doesNotMatch(html, /<script/i);
});

test('renderSectieHtml: onbekend onderdeel en formulier geven een duidelijke fout', () => {
  assert.throws(() => renderSectieHtml({ blueprint, pagina, sectie: 9 }), /bestaat niet/);
  assert.throws(() => renderSectieHtml({ blueprint, pagina, sectie: 2 }), /formulier/);
});

test('bouwKloonVerzoek: blokken worden opgeschoond en meegestuurd', () => {
  const v = bouwKloonVerzoek({ bron: 1, titel: 'X', blokken: [{ na: ' a1 ', html: ' <p>hoi</p> ', titel: 'T' }] });
  assert.deepStrictEqual(v.blokken, [{ na: 'a1', html: '<p>hoi</p>', titel: 'T' }]);
  assert.strictEqual(bouwKloonVerzoek({ bron: 1, titel: 'X' }).blokken, undefined);
});

test('bouwKloonVerzoek: blok zonder plek of inhoud geeft een fout', () => {
  assert.throws(() => bouwKloonVerzoek({ bron: 1, titel: 'X', blokken: [{ html: '<p>a</p>' }] }), /plek/);
  assert.throws(() => bouwKloonVerzoek({ bron: 1, titel: 'X', blokken: [{ na: 'a', html: '' }] }), /inhoud/);
});
