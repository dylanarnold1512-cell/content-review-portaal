const test = require('node:test');
const assert = require('node:assert/strict');
const { meetHuisstijl, afgeleideVormtaal, isLichtNeutraal } = require('../src/lp/huisstijlMeting');
const { corrigeerVoorstelMetMeting, controleerGoogleFont, bevestigdeGoogleFonts } = require('../src/lp/huisstijl');
const { buildGoogleFontsHref } = require('../src/lp/style');

// CSS zoals bij MAC Bouw: koppen Titillium Web in hoofdletters, tekst Jost, vierkante knoppen, lichtgrijs vlak,
// en een rozige tint die ALLEEN als rand voorkomt (dat ging bij het AI-voorstel mis).
const CSS = `
@font-face{font-family:"Titillium Web";src:url(a.woff2)}
body{font-family:Jost,sans-serif;color:#777777}
h1,h2,.elementor-heading-title{font-family:"Titillium Web",sans-serif;text-transform:uppercase;color:#0c0a0a;font-weight:600}
.elementor-button{background-color:#0e7bba;color:#ffffff;border-radius:0;text-transform:uppercase}
.card{border-radius:2px}
.sectie-grijs{background-color:#f6f6f6}
.kader{border:1px solid #eae2e2}
:root{--primary-color:#ff6600}
.overlay{background:rgba(0,0,0,.2)}
`;

// Nep-Google-Fonts: bestaat voor Titillium Web (geen 500) en Jost (alle gewichten).
function nepFetch(url) {
  const u = decodeURIComponent(String(url));
  const fam = (u.match(/family=([^:&]+)/) || [])[1] || '';
  const naam = fam.replace(/\+/g, ' ');
  const w = (u.match(/wght@(\d+)/) || [])[1];
  const bestaat = ['Titillium Web', 'Jost'].includes(naam);
  const ok = bestaat && (!w || (naam === 'Titillium Web' ? ['400', '600', '700'] : ['400', '500', '600', '700']).includes(w));
  return Promise.resolve({ ok });
}

test('meting: koppen en tekst apart, vormtaal afgeleid', () => {
  const m = meetHuisstijl(CSS);
  assert.equal(m.koppen.fonts[0].waarde, 'Titillium Web');
  assert.equal(m.tekst.fonts[0].waarde, 'Jost');
  assert.deepEqual(m.fontFaceFamilies, ['Titillium Web']);
  assert.equal(m.lichtNeutraleAchtergronden[0].waarde, '#f6f6f6');
  assert.ok(m.randen.some((r) => r.waarde === '#eae2e2'));
  assert.ok(!m.achtergronden.some((a) => a.waarde === '#eae2e2'), 'roze staat niet als achtergrond');
  assert.ok(!m.achtergronden.some((a) => a.waarde === '#000000'), 'doorzichtige vlakken tellen niet mee');
  const v = afgeleideVormtaal(m);
  assert.equal(v.headingTransform, 'uppercase');
  assert.equal(v.headingColor, '#0c0a0a');
  assert.equal(v.headingWeight, '600');
  assert.equal(v.buttonTransform, 'uppercase');
  assert.equal(v.buttonRadius, '0px');
  assert.equal(v.cardRadius, '2px');
});

test('een leeg CSS-bestand geeft geen vormtaal (bronprincipe: niets gokken)', () => {
  assert.deepEqual(afgeleideVormtaal(meetHuisstijl('')), {});
});

test('isLichtNeutraal: lichtgrijs ja, roze en blauw nee', () => {
  assert.equal(isLichtNeutraal('#f6f6f6'), true);
  assert.equal(isLichtNeutraal('#eae2e2'), false);
  assert.equal(isLichtNeutraal('#0e7bba'), false);
});

test('Google Fonts controle: bestaand lettertype met de juiste gewichten, onbekend lettertype niet', async () => {
  assert.deepEqual(await controleerGoogleFont('Titillium Web', nepFetch), { naam: 'Titillium Web', gewichten: [400, 600, 700] });
  assert.equal(await controleerGoogleFont('Verzonnen Font', nepFetch), null);
});

test('correctie: een fout AI-voorstel (roze vlak, Jost voor alles) wordt hersteld met de meting', async () => {
  const meting = meetHuisstijl(CSS);
  const bewezen = await bevestigdeGoogleFonts(meting, [], nepFetch);
  const aiVoorstel = {
    tokensVoorstel: { bgAlt: '#eae2e2', border: '#eae2e2', fontHeading: "'Jost', sans-serif", fontBody: "'Jost', sans-serif", googleFonts: ['Jost'] },
    twijfels: []
  };
  const uit = corrigeerVoorstelMetMeting(aiVoorstel, meting, bewezen);
  assert.equal(uit.tokensVoorstel.bgAlt, '#f6f6f6');
  assert.equal(uit.tokensVoorstel.fontHeading, "'Titillium Web', sans-serif");
  assert.equal(uit.tokensVoorstel.fontBody, "'Jost', sans-serif");
  assert.deepEqual(uit.tokensVoorstel.googleFonts.sort(), ['Jost', 'Titillium Web']);
  assert.deepEqual(uit.tokensVoorstel.googleFontGewichten['Titillium Web'], [400, 600, 700]);
  assert.equal(uit.tokensVoorstel.headingTransform, 'uppercase');
  assert.ok(uit.twijfels.some((t) => /bgAlt/.test(t)), 'de ingreep is zichtbaar als twijfelpunt');
});

test('style: gewichten uit de tokens gaan voor de standaard, zonder codewijziging per lettertype', () => {
  const href = buildGoogleFontsHref(['Nieuw Lettertype', 'Jost'], { 'Nieuw Lettertype': [300, 700] });
  assert.match(href, /family=Nieuw\+Lettertype:wght@300;700/);
  assert.match(href, /family=Jost:wght@400;500;600;700/);
});
