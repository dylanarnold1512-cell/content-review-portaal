// Geautomatiseerde tests voor src/lp/siteAnalyse.js — de pure, deterministische helpers die de
// ruwe site-analyse voeden (telefoonnummer-kandidaten, knoppen/links-met-href-classificatie,
// formulierplugin-detectie). Draait met de ingebouwde Node testrunner, zonder netwerk of OpenAI
// (zelfde filosofie als test/slotEngine.test.js): buildFeitenVoorstel zelf (die wél netwerk en
// OpenAI aanroept) wordt hier bewust niet getest, alleen de bouwstenen eronder.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  vindTelefoonKandidaten,
  vindKnoppenEnLinksMetHref,
  detecteerFormulierPlugin
} = require('../src/lp/siteAnalyse');

test('vindTelefoonKandidaten: herkent NL-nummers in platte en tel:-vorm, negeert ruis', () => {
  const html = `
    <p>Bel ons op 013-456 78 90 of via <a href="tel:+31612345678">+31 612 345 678</a>.</p>
    <p>Copyright 2026. Kamerprijs vanaf 89.</p>
  `;
  const kandidaten = vindTelefoonKandidaten(html);
  assert.ok(kandidaten.length >= 1, 'moet minstens een telefoonkandidaat vinden');
  // Jaartallen (2026) en korte prijzen (89) mogen niet als telefoonnummer meegenomen worden -
  // die hebben te weinig cijfers om de 9-13 ondergrens/bovengrens te halen.
  assert.ok(!kandidaten.some((k) => k.replace(/\D/g, '') === '2026'));
  assert.ok(!kandidaten.some((k) => k.replace(/\D/g, '') === '89'));
});

test('vindTelefoonKandidaten: levert nooit meer dan 8 kandidaten', () => {
  const nummers = Array.from({ length: 15 }, (_, i) => `06${String(10000000 + i)}`);
  const html = `<p>${nummers.join(' of ')}</p>`;
  const kandidaten = vindTelefoonKandidaten(html);
  assert.ok(kandidaten.length <= 8);
});

test('vindKnoppenEnLinksMetHref: markeert boek/reserveer-achtige linktekst als lijktOpCta', () => {
  const html = `
    <a href="/kamers/">Bekijk kamers</a>
    <a href="https://app.mews.com/distributor/xyz">Book now</a>
    <a href="https://facebook.com/roots">Volg ons op Facebook</a>
  `;
  const links = vindKnoppenEnLinksMetHref(html, 'https://www.hostelroots.nl');
  const boekLink = links.find((l) => l.href.includes('mews.com'));
  assert.ok(boekLink, 'moet de mews-link vinden');
  assert.equal(boekLink.lijktOpCta, true);
  assert.equal(boekLink.extern, true, 'mews.com is een ander domein dan hostelroots.nl, dus extern');

  const kamersLink = links.find((l) => l.href.includes('/kamers/'));
  assert.equal(kamersLink.extern, false, 'zelfde domein als de basis-URL is niet extern');
});

test('vindKnoppenEnLinksMetHref: negeert mailto:/tel:/javascript:-links en zet CTA-achtige links vooraan', () => {
  const html = `
    <a href="mailto:info@example.com">Mail ons</a>
    <a href="tel:0612345678">Bel ons</a>
    <a href="javascript:void(0)">Reserveer nu</a>
    <a href="/contact/">Contact</a>
    <a href="/boeken/">Kamer boeken</a>
  `;
  const links = vindKnoppenEnLinksMetHref(html, 'https://example.com');
  assert.ok(!links.some((l) => l.href.startsWith('mailto:')));
  assert.ok(!links.some((l) => l.href.startsWith('tel:')));
  assert.ok(!links.some((l) => l.tekst === 'Reserveer nu'), 'javascript:-href moet genegeerd worden, ook als de tekst CTA-achtig is');
  assert.equal(links.length, 2);
  assert.equal(links[0].lijktOpCta, true, 'CTA-achtige links moeten vooraan staan');
});

test('vindKnoppenEnLinksMetHref: negeert links met (te) lange linktekst', () => {
  const langeTekst = 'Dit is een heel erg lange stuk linktekst dat duidelijk geen knoptekst is maar een zin';
  const html = `<a href="/pagina/">${langeTekst}</a><a href="/boek/">Boek nu</a>`;
  const links = vindKnoppenEnLinksMetHref(html, 'https://example.com');
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.com/boek/');
});

test('detecteerFormulierPlugin: herkent Contact Form 7 aan wpcf7-f<id>', () => {
  const html = '<div class="wpcf7" id="wpcf7-f123-o1"><form class="wpcf7-form"></form></div>';
  const gevonden = detecteerFormulierPlugin(html);
  assert.deepEqual(gevonden, { plugin: 'Contact Form 7', formulierId: '123' });
});

test('detecteerFormulierPlugin: herkent Gravity Forms aan gform_wrapper_<id>', () => {
  const html = '<div id="gform_wrapper_7" class="gform_wrapper"></div>';
  const gevonden = detecteerFormulierPlugin(html);
  assert.deepEqual(gevonden, { plugin: 'Gravity Forms', formulierId: '7' });
});

test('detecteerFormulierPlugin: geeft null als er geen herkenbaar CF7/Gravity Forms-spoor is', () => {
  const html = '<form><input name="voornaam"><input name="email"><button>Verstuur</button></form>';
  assert.equal(detecteerFormulierPlugin(html), null);
});
