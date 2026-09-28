// Tests voor src/lp/overrides.js: onderdelen (kaarten en secties) per pagina verbergen zonder het
// sjabloon aan te raken. Zie ook de koppeling in render.js, slotEngine.js en validator.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderPageHtml } = require('../src/lp/render');
const { validatePage } = require('../src/lp/validator');
const { vindSecties, zetVerborgen, markeerItemWortel, berekenOverrides } = require('../src/lp/overrides');

const HTML =
  '<div class="w">' +
  '<section class="hero"><h1>{{heroTitle}}</h1></section>' +
  '<section class="kamers"><div class="grid">{{#each offerItems}}<article class="kaart"><h3>{{title}}</h3><p>{{text}}</p></article>{{/each}}</div></section>' +
  '<section class="faq">{{#each faqItems}}<details><summary>{{question}}</summary><p>{{answer}}</p></details>{{/each}}</section>' +
  '</div>';

function blueprint() {
  return {
    templateFormat: 'slots',
    htmlTemplate: HTML,
    cssTemplate: '',
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'offerItems', type: 'list', verplicht: true, itemFields: ['title', 'text'] },
      { key: 'faqItems', type: 'list', itemFields: ['question', 'answer'] }
    ]
  };
}

function slotData() {
  return {
    heroTitle: 'Testival',
    offerItems: [
      { title: 'Hotelkamers', text: 'a' },
      { title: 'Gedeelde kamers', text: 'b' },
      { title: 'Privékamers', text: 'c' }
    ],
    faqItems: [{ question: 'Vraag?', answer: 'Antwoord.' }]
  };
}

function render(overrides, opts) {
  const page = { clientId: 'test-klant', slug: 's', template: blueprint(), slotData: slotData() };
  if (overrides) page.overrides = overrides;
  return renderPageHtml(page, opts);
}

test('vindSecties vindt alleen buitenste secties, niet die in een lijst', () => {
  const secties = vindSecties('<div><section class="a"><section class="b"></section></section>{{#each x}}<section>i</section>{{/each}}<section class="c"></section></div>');
  assert.equal(secties.length, 2);
  assert.equal(secties[0].openTag, '<section class="a">');
  assert.equal(secties[1].openTag, '<section class="c">');
});

test('zonder overrides is de uitvoer identiek aan een lege overrides', () => {
  assert.equal(render(null), render({ verborgenItems: [], verborgenSecties: [] }));
});

test('een verborgen kaart staat niet op de echte pagina, de andere wel', () => {
  const html = render({ verborgenItems: [{ lijst: 'offerItems', index: 2, label: 'Privékamers' }] });
  assert.ok(html.includes('Hotelkamers'));
  assert.ok(html.includes('Gedeelde kamers'));
  assert.ok(!html.includes('Privékamers'));
  assert.ok(!html.includes('data-lp-'), 'de echte pagina bevat geen data-lp attributen');
  assert.ok(!html.includes('"serviceType":["Hotelkamers","Gedeelde kamers","Privékamers"'), 'ook niet in het Service schema');
});

test('in het voorbeeld blijft een verborgen kaart staan, gemarkeerd, met de juiste index', () => {
  const html = render({ verborgenItems: [{ lijst: 'offerItems', index: 1, label: 'Gedeelde kamers' }] }, { forPreview: true });
  assert.match(html, /<article data-lp-item="offerItems\.1" data-lp-verborgen="1" class="kaart">/);
  assert.match(html, /<article data-lp-item="offerItems\.0" class="kaart">/);
  assert.match(html, /data-lp-text-slot="offerItems\.2\.title"/, 'de derde kaart houdt zijn eigen index');
});

test('een kaart die niet meer op die plek staat wordt niet verborgen en geeft een waarschuwing', () => {
  const overrides = { verborgenItems: [{ lijst: 'offerItems', index: 2, label: 'Iets anders' }] };
  const html = render(overrides);
  assert.ok(html.includes('Privékamers'));
  const r = berekenOverrides({ htmlTemplate: HTML, slotData: slotData(), overrides });
  assert.equal(r.aantalVerborgen, 0);
  assert.equal(r.waarschuwingen.length, 1);
});

test('een verborgen sectie is echt weg, en het FAQ schema verwijst dan niet meer naar die tekst', () => {
  const secties = vindSecties(HTML);
  const overrides = { verborgenSecties: [{ index: 2, label: secties[2].openTag }] };
  const html = render(overrides);
  assert.ok(!html.includes('Vraag?'));
  assert.ok(!html.includes('FAQPage'));
  assert.ok(html.includes('Hotelkamers'));
  const zonder = render(null);
  assert.ok(zonder.includes('FAQPage'));
});

test('in het voorbeeld heeft elke sectie een nummer en een verborgen sectie een markering', () => {
  const secties = vindSecties(HTML);
  const html = render({ verborgenSecties: [{ index: 1, label: secties[1].openTag }] }, { forPreview: true });
  assert.match(html, /<section data-lp-sectie="0" class="hero">/);
  assert.match(html, /<section data-lp-sectie="1" data-lp-verborgen="1" class="kamers">/);
});

test('een sectie met een gewijzigde openingstag wordt niet verborgen', () => {
  const html = render({ verborgenSecties: [{ index: 1, label: '<section class="oud">' }] });
  assert.ok(html.includes('Hotelkamers'));
});

test('markeerItemWortel laat een itemsjabloon met meerdere hoofdelementen ongemoeid', () => {
  const twee = '<div>a</div><div>b</div>';
  assert.equal(markeerItemWortel(twee, 'x', 0, false), twee);
  assert.match(markeerItemWortel('<li>a</li>', 'x', 3, true), /^<li data-lp-item="x\.3" data-lp-verborgen="1">a<\/li>$/);
});

test('zetVerborgen zet een kaart of sectie aan en uit, en haalt lege overrides weg', () => {
  const content = { meta: {}, slotData: slotData() };
  const aan = zetVerborgen({ content, htmlTemplate: HTML, type: 'item', lijst: 'offerItems', index: 2, verborgen: true });
  assert.deepEqual(aan.overrides.verborgenItems, [{ lijst: 'offerItems', index: 2, label: 'Privékamers' }]);
  assert.equal(content.overrides, undefined, 'de oorspronkelijke content wordt niet gewijzigd');
  const uit = zetVerborgen({ content: aan, htmlTemplate: HTML, type: 'item', lijst: 'offerItems', index: 2, verborgen: false });
  assert.equal(uit.overrides, undefined);
  const sectie = zetVerborgen({ content, htmlTemplate: HTML, type: 'sectie', index: 1, verborgen: true });
  assert.equal(sectie.overrides.verborgenSecties[0].label, '<section class="kamers">');
});

test('zetVerborgen weigert onbestaande onderdelen', () => {
  const content = { slotData: slotData() };
  assert.throws(() => zetVerborgen({ content, htmlTemplate: HTML, type: 'item', lijst: 'offerItems', index: 9, verborgen: true }), /bestaat niet/);
  assert.throws(() => zetVerborgen({ content, htmlTemplate: HTML, type: 'sectie', index: 9, verborgen: true }), /bestaat niet/);
  assert.throws(() => zetVerborgen({ content, htmlTemplate: HTML, type: 'onzin', index: 0, verborgen: true }), /Onbekend/);
});

test('validatie: alle kaarten van een verplichte lijst verbergen geeft een fout, een verouderde verberging een waarschuwing', () => {
  const alle = { verborgenItems: [0, 1, 2].map((i) => ({ lijst: 'offerItems', index: i, label: slotData().offerItems[i].title })) };
  const r = validatePage({ blueprint: blueprint(), contentJson: { meta: {}, slotData: slotData(), overrides: alle } });
  assert.ok(r.errors.some((e) => /offerItems|Verplichte lijst/.test(e)));
  const oud = { verborgenItems: [{ lijst: 'offerItems', index: 2, label: 'Weg' }] };
  const r2 = validatePage({ blueprint: blueprint(), contentJson: { meta: {}, slotData: slotData(), overrides: oud } });
  assert.ok(r2.warnings.some((w) => /niet meer op dezelfde plek/.test(w)));
});

test('portaal: opslaan van de content neemt overrides mee en het voorbeeld heeft het verberg-balkje', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  const save = js.slice(js.indexOf('async function saveContentJson'), js.indexOf('document.getElementById(\'lpSaveContentBtn\')'));
  assert.match(save, /overrides/);
  assert.match(js, /function installeerVerbergBalk/);
  assert.match(js, /\/verberg`/);
});
