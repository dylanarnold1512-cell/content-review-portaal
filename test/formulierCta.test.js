// Tests voor src/lp/formulierCta.js: CTA's als jumplink naar het formulier op de pagina, en een CTA-balk halverwege.
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPageHtml } = require('../src/lp/render');
const { pasFormulierCtaToe, kiesBalkPositie } = require('../src/lp/formulierCta');
const { vindSecties } = require('../src/lp/overrides');

const HTML =
  '<header><a class="knop" href="{{ctaHref}}">{{ctaLabel}}</a></header>' +
  '<section class="hero"><h1>{{heroTitle}}</h1><a href="{{ctaHref}}">{{ctaLabel}}</a></section>' +
  '<section class="a"><h2>A</h2></section>' +
  '<section class="b"><h2>B</h2></section>' +
  '<section class="c"><h2>C</h2></section>' +
  '<section class="contact"><h2>Contact</h2>{{formulier}}</section>';

function blueprint(html) {
  return {
    templateFormat: 'slots', htmlTemplate: html || HTML, cssTemplate: '',
    slots: [{ key: 'heroTitle', type: 'text' }, { key: 'ctaLabel', type: 'text' }, { key: 'ctaHref', type: 'text' }]
  };
}
const data = { heroTitle: 'T', ctaLabel: 'Neem contact op', ctaHref: 'https://mac-bouw.nl/contact/' };
function render(opts, html, clientId) {
  return renderPageHtml({ clientId: clientId || 'macbouw', slug: 's', template: blueprint(html), slotData: { ...data } }, opts);
}

test('CTA-knoppen worden een jumplink naar het formulier, met een id op het formulier', () => {
  const html = render({ forWordPress: true });
  assert.ok(!html.includes('mac-bouw.nl/contact/'));
  assert.equal((html.match(/href="#lp-formulier"/g) || []).length, 3); // kop, hero en de balk
  assert.ok(html.includes('id="lp-formulier"'));
  assert.ok(html.includes('[metform form_id="3048"]'));
});

test('halverwege komt een CTA-balk met de knoptekst, niet vlak voor het formulier en niet na de hero', () => {
  const html = render({ forWordPress: true });
  const balk = html.indexOf('lp-cta-balk" data-lp-cta-balk');
  assert.ok(balk > html.indexOf('class="a"'));
  assert.ok(balk < html.indexOf('class="contact"'));
  assert.ok(html.slice(balk).startsWith('lp-cta-balk" data-lp-cta-balk="1"><a href="#lp-formulier">Neem contact op</a>'));
});

test('zonder formulier in het sjabloon verandert er niets', () => {
  const zonder = HTML.replace('{{formulier}}', '');
  const html = render({ forWordPress: true }, zonder);
  assert.ok(html.includes('https://mac-bouw.nl/contact/'));
  assert.ok(!html.includes('lp-cta-balk'));
});

test('op WordPress zonder ingesteld formulier blijven de CTA-links zoals ze zijn', () => {
  const html = render({ forWordPress: true }, null, 'test-klant');
  assert.ok(html.includes('https://mac-bouw.nl/contact/'));
  assert.ok(!html.includes('lp-cta-balk'));
});

test('in het voorbeeld werkt het ook, met de placeholder als doel', () => {
  const html = render({ forPreview: true });
  assert.ok(html.includes('lp-formulier-placeholder" id="lp-formulier"'));
  assert.ok(html.includes('data-lp-cta-balk'));
});

test('heeft het sjabloon zelf al een CTA halverwege, dan komt er geen extra balk', () => {
  const eigen = HTML.replace('<h2>B</h2>', '<h2>B</h2><a href="{{ctaHref}}">{{ctaLabel}}</a>');
  const html = render({ forWordPress: true }, eigen);
  assert.ok(!html.includes('lp-cta-balk"'));
  assert.equal((html.match(/href="#lp-formulier"/g) || []).length, 3);
});

test('te korte pagina krijgt geen balk', () => {
  const kort = '<section><h1>{{heroTitle}}</h1></section><section><h2>x</h2>{{formulier}}</section>';
  const secties = vindSecties(kort);
  assert.equal(kiesBalkPositie(kort, secties), -1);
});

test('pasFormulierCtaToe doet niets als het formulier niet actief is', () => {
  const r = pasFormulierCtaToe(HTML, { actief: false, rootClass: 'x', slotData: {} });
  assert.equal(r.html, HTML);
});

test('optionele ctaBandTekst komt in de balk', () => {
  const r = pasFormulierCtaToe(HTML, { actief: true, rootClass: 'x', slotData: { ctaBandTekst: 'Klaar?' } });
  assert.ok(r.html.includes('<p class="lp-cta-balk-tekst">{{ctaBandTekst}}</p>'));
});
