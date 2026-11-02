const test = require('node:test');
const assert = require('node:assert');
const { sectieLocaties, sectieZoekwoordenVergelijking, sectieLandingspaginasVergelijking, sectieMaandverloop, bouwTekst } = require('../src/services/pakket');

const exG = {
  geo_namen: [
    { sleutel: 'geoTargetConstants/1', naam: 'Drenthe' },
    { sleutel: 'geoTargetConstants/2', naam: 'Assen' },
    { sleutel: 'geoTargetConstants/3', naam: 'Lelystad' }
  ],
  locaties_regio: [
    { campagne: 'A', regioCode: 'geoTargetConstants/1', vertoningen: 100, klikken: 10, kosten: 20, conversies: 1 },
    { campagne: 'B', regioCode: 'geoTargetConstants/1', vertoningen: 50, klikken: 5, kosten: 10, conversies: 1 }
  ],
  locaties_stad: [
    { campagne: 'A', stadCode: 'geoTargetConstants/2', vertoningen: 10, klikken: 4, kosten: 30, conversies: 0 },
    { campagne: 'A', stadCode: 'geoTargetConstants/3', vertoningen: 10, klikken: 4, kosten: 5, conversies: 2 }
  ],
  zoekwoorden_vorige_maand: [{ campagne: 'A', advertentiegroep: 'G', zoekwoord: 'kip', zoekwoordType: 'EXACT', klikken: 10, kosten: 10, conversies: 1 }],
  landingspaginas: [{ url: 'https://x.nl/a', klikken: 20, kosten: 40, conversies: 2 }],
  landingspaginas_vorige_maand: [{ url: 'https://x.nl/a', klikken: 10, kosten: 20, conversies: 1 }],
  campagnes_per_maand: [
    { campagne: 'A', maand: '2026-08-01', klikken: 5, kosten: 10, conversies: 0 },
    { campagne: 'A', maand: '2026-07-01', klikken: 4, kosten: 8, conversies: 1 }
  ],
  groepen_per_maand: [{ campagne: 'A', advertentiegroep: 'G', maand: '2026-08-01', klikken: 5, kosten: 10, conversies: 0 }]
};

test('locaties tellen campagnes samen en tonen namen', () => {
  const t = sectieLocaties(exG).join('\n');
  assert.match(t, /Drenthe \|[^\n]*€30,00[^\n]*15 klikken[^\n]*2 conversies/);
  assert.match(t, /Assen/);
  assert.match(t, /Steden met kosten maar zonder conversie:\nAssen/);
  assert.equal(sectieLocaties(null), null);
});

test('zoekwoorden vergeleken met vorige maand', () => {
  const g = { zoekwoorden: [{ campagne: 'A', advertentiegroep: 'G', zoekwoord: 'kip', zoekwoordType: 'EXACT', klikken: 20, kosten: 40, conversies: 2 }, { campagne: 'A', advertentiegroep: 'G', zoekwoord: 'ei', zoekwoordType: 'BROAD', klikken: 2, kosten: 3, conversies: 0 }] };
  const t = sectieZoekwoordenVergelijking(g, exG).join('\n');
  assert.match(t, /kip[^\n]*kosten omhoog 300%/);
  assert.match(t, /ei[^\n]*vorige maand: geen vertoningen of nieuw/);
  assert.ok(!/ - /.test(t));
});

test('landingspaginas en maandverloop', () => {
  assert.match(sectieLandingspaginasVergelijking(exG).join('\n'), /x\.nl\/a[^\n]*klikken omhoog 100%/);
  const v = sectieMaandverloop(exG).join('\n');
  assert.match(v, /juli: [^|]*\| augustus:/);
  assert.match(v, /A, groep G/);
});

test('bouwTekst neemt de nieuwe secties mee', () => {
  const g = { campagnes: [], advertentiegroepen: [], zoekwoorden: [], zoektermen: [] };
  const t = bouwTekst({ klant: 'X', jaar: 2026, maand: 9, context: '', actiepunten: [], verdieping: { google: g, extra: { google: exG } }, opties: {}, rapportData: null, rapportTekst: null });
  assert.match(t, /GOOGLE ADS: LOCATIES DEZE MAAND/);
  assert.match(t, /VERLOOP OVER DE LAATSTE DRIE MAANDEN/);
});

test('opdracht en concept vragen om de wijzigingsgeschiedenis', () => {
  const { OPDRACHT, conceptSysteem } = require('../src/services/pakket');
  assert.match(OPDRACHT.join('\n'), /WIJZIGINGEN IN HET ACCOUNT/);
  assert.match(conceptSysteem(), /wijzigingen in het account/);
});
