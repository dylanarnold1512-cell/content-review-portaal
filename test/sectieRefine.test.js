// Tests voor src/lp/sectieRefine.js: feedback per onderdeel. Geen echte AI-aanroep, alleen de deterministische kant.
const test = require('node:test');
const assert = require('node:assert/strict');
const { beschrijfSecties, pasSectiePatchToe } = require('../src/lp/sectieRefine');

const HTML =
  '<section class="hero"><h1>{{heroTitle}}</h1><a class="knop" href="{{ctaHref}}">{{ctaLabel}}</a></section>\n' +
  '<section class="usps"><h2>{{uspTitel}}</h2>{{#each uspItems}}<div class="usp">{{title}}</div>{{/each}}</section>\n' +
  '<section class="faq"><h2>Veelgestelde vragen</h2></section>';
const CSS = '.lpt .hero { color: red; }\n.lpt .usps { background: blue; }\n.lpt .usp { padding: 8px; }\n';
function bp() {
  return { templateFormat: 'slots', htmlTemplate: HTML, cssTemplate: CSS, slots: [{ key: 'heroTitle', type: 'text' }, { key: 'uspTitel', type: 'text' }, { key: 'uspItems', type: 'list', itemFields: ['title'] }] };
}

test('beschrijfSecties geeft leesbare namen, met voorbeeldtekst of sleutel, en markeert de hero', () => {
  const s = beschrijfSecties(HTML, { uspTitel: 'Waarom wij' });
  assert.equal(s.length, 3);
  assert.equal(s[0].label, '1. heroTitle (hero)');
  assert.equal(s[1].label, '2. Waarom wij');
  assert.equal(s[2].label, '3. Veelgestelde vragen');
});

test('vervang: alleen de gekozen sectie verandert, de rest van de HTML is byte voor byte gelijk', () => {
  const nieuw = '<section class="usps"><h2>{{uspTitel}}</h2><p class="lp-x">nieuw</p></section>';
  const r = pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 1 }, { sectieHtml: nieuw, cssToevoegen: '.lpt .lp-x { color: green; }', uitleg: 'x' });
  const html = r.blueprint.htmlTemplate;
  assert.ok(html.startsWith(HTML.slice(0, HTML.indexOf('<section class="usps"'))));
  assert.ok(html.endsWith(HTML.slice(HTML.indexOf('<section class="faq"'))));
  assert.ok(html.includes('class="lp-x"'));
  assert.ok(r.blueprint.cssTemplate.includes('.lp-x { color: green; }'));
  assert.ok(r.blueprint.cssTemplate.startsWith(CSS.trim()));
});

test('voeg_toe_na: een nieuw onderdeel komt direct na de gekozen sectie', () => {
  const r = pasSectiePatchToe(bp(), {}, { modus: 'voeg_toe_na', index: 1 }, { sectieHtml: '<section class="nieuw"><h2>Nieuw</h2></section>' });
  const html = r.blueprint.htmlTemplate;
  assert.ok(html.indexOf('class="usps"') < html.indexOf('class="nieuw"'));
  assert.ok(html.indexOf('class="nieuw"') < html.indexOf('class="faq"'));
  assert.equal(beschrijfSecties(html, {}).length, 4);
});

test('cssVervangen moet exact een keer passen, anders een duidelijke fout en niets veranderd', () => {
  const p = { sectieHtml: '<section class="faq"><h2>Q</h2></section>' };
  assert.throws(() => pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 2 }, { ...p, cssVervangen: [{ zoek: 'bestaat niet', vervang: 'x' }] }), /niets veranderd/i);
  const ok = pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 2 }, { ...p, cssVervangen: [{ zoek: 'background: blue;', vervang: 'background: green;' }] });
  assert.ok(ok.blueprint.cssTemplate.includes('background: green;'));
});

test('waarschuwt als een aangepaste CSS-regel ook door een ander onderdeel gebruikt wordt', () => {
  const html = HTML.replace('<section class="faq">', '<section class="faq usp">');
  const b = { ...bp(), htmlTemplate: html };
  const r = pasSectiePatchToe(b, {}, { modus: 'vervang', index: 1 }, {
    sectieHtml: '<section class="usps"><h2>{{uspTitel}}</h2></section>',
    cssVervangen: [{ zoek: '.lpt .usp { padding: 8px; }', vervang: '.lpt .usp { padding: 20px; }' }]
  });
  assert.ok(r.waarschuwingen.some((w) => w.includes('usp')));
});

test('weigert twee secties, een script of het weghalen van de h1', () => {
  const p = (h) => ({ sectieHtml: h });
  assert.throws(() => pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 1 }, p('<section>a</section><section>b</section>')), /precies een/);
  assert.throws(() => pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 1 }, p('<section><script>alert(1)</script></section>')), /niet toegestaan/);
  assert.throws(() => pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 0 }, p('<section class="hero"><h2>geen h1</h2></section>')), /h1/i);
  assert.throws(() => pasSectiePatchToe(bp(), {}, { modus: 'vervang', index: 9 }, p('<section></section>')), /bestaat niet/);
});

test('nieuwe slots en voorbeeldwaarden worden toegevoegd, bestaande blijven staan', () => {
  const r = pasSectiePatchToe(bp(), { uspTitel: 'Oud' }, { modus: 'voeg_toe_na', index: 1 }, {
    sectieHtml: '<section class="n"><h2>{{nTitel}}</h2></section>',
    slotsToevoegen: [{ key: 'nTitel', type: 'text' }, { key: 'uspTitel', type: 'text', label: 'overschrijf niet' }],
    voorbeeldSlotDataToevoegen: { nTitel: 'Nieuw', uspTitel: 'Nieuw?' }
  });
  assert.equal(r.blueprint.slots.filter((s) => s.key === 'uspTitel').length, 1);
  assert.ok(r.blueprint.slots.some((s) => s.key === 'nTitel'));
  assert.equal(r.voorbeeldSlotData.uspTitel, 'Oud');
  assert.equal(r.voorbeeldSlotData.nTitel, 'Nieuw');
});
