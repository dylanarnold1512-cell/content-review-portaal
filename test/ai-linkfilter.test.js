// Tests voor verwijderVerzonnenLinks in src/lp/ai.js — de anti-hallucinatie-filter die na een
// AI-generatie draait: een link (inline [tekst](url), een linksItems-item, of een los *LinkHref-
// veld zoals "roomsLinkHref") mag ALLEEN een URL uit de aangeleverde linkKandidaten zijn. Puur
// deze functie testen (geen echte OpenAI-aanroep nodig) omdat generatePageContent zelf een
// live API-key en netwerktoegang vereist die hier niet beschikbaar zijn.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verwijderVerzonnenLinks } = require('../src/lp/ai');

const kandidaten = [
  { label: 'Echte pagina', url: 'https://site.test/echt', zusterpagina: false }
];

test('een geldige inline link (bestaat in linkKandidaten) blijft staan', () => {
  const slotData = { heroIntro: 'Zie [deze pagina](https://site.test/echt) voor meer info.' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.match(slotData.heroIntro, /<?\[deze pagina\]\(https:\/\/site\.test\/echt\)|deze pagina/);
  assert.ok(slotData.heroIntro.includes('https://site.test/echt'));
});

test('een verzonnen inline link wordt teruggezet naar platte tekst (URL verdwijnt, ankertekst blijft)', () => {
  const slotData = { heroIntro: 'Zie [verzonnen pagina](https://verzonnen.test/x) voor meer info.' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.ok(!slotData.heroIntro.includes('verzonnen.test'), 'de verzonnen URL mag niet overblijven');
  assert.ok(slotData.heroIntro.includes('verzonnen pagina'), 'de ankertekst zelf mag blijven staan als platte tekst');
});

test('een linksItems-item met een niet-bestaande href wordt uit de lijst verwijderd', () => {
  const slotData = {
    linksItems: [
      { label: 'Goed', href: 'https://site.test/echt', reason: 'relevant', zusterpagina: false },
      { label: 'Verzonnen', href: 'https://nep.test/x', reason: 'verzonnen', zusterpagina: false }
    ]
  };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.equal(slotData.linksItems.length, 1);
  assert.equal(slotData.linksItems[0].href, 'https://site.test/echt');
});

test('een *LinkHref-veld (bv. roomsLinkHref) met een niet-bestaande URL wordt geleegd, niet verwijderd', () => {
  const slotData = { roomsLinkHref: 'https://nep.test/kamers', roomsLinkLabel: 'Bekijk kamers' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.equal(slotData.roomsLinkHref, '');
  assert.equal(slotData.roomsLinkLabel, 'Bekijk kamers', 'het label zelf hoeft niet weg, alleen de foute href');
});

test('een geldig *LinkHref-veld blijft ongewijzigd, en ctaHref wordt NOOIT als linkveld behandeld', () => {
  const slotData = { roomsLinkHref: 'https://site.test/echt', ctaHref: 'https://willekeurig.test/cta' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.equal(slotData.roomsLinkHref, 'https://site.test/echt');
  assert.equal(slotData.ctaHref, 'https://willekeurig.test/cta', 'ctaHref is geen "*LinkHref"-slot en mag niet aangeraakt worden');
});

test('linksyntax in metaTitle/metaDescription wordt altijd verwijderd, ook als de URL geldig is', () => {
  const slotData = { metaTitle: 'Titel met [link](https://site.test/echt) erin', metaDescription: 'Normale tekst' };
  verwijderVerzonnenLinks(slotData, kandidaten);
  assert.equal(slotData.metaTitle, 'Titel met link erin');
});
