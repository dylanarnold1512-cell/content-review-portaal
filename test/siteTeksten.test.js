const test = require('node:test');
const assert = require('node:assert/strict');
const { hoofdTekst, kiesUrls, kapAfOpWoorden, haalSiteTeksten, formatSiteTekstenVoorPrompt } = require('../src/lp/siteTeksten');
const ai = require('../src/lp/ai');

const PAGINA = `<html><head><title>Renovatie - MAC Bouw</title><script>var x = "geheim";</script></head><body>
<header><a href="/">Home</a><nav><a href="/contact/">Contact menu</a></nav></header>
<main><h1>Breng jouw woning weer tot leven</h1>
<p>Renovatie is het proces waarbij een bestaande woning wordt hersteld, gemoderniseerd en verbeterd &amp; verduurzaamd.</p>
<ul><li>Badkamer renovatie</li><li>Keuken renovatie</li></ul>
<form><label>Naam</label><input></form>
<p>Renovatie is het proces waarbij een bestaande woning wordt hersteld, gemoderniseerd en verbeterd &amp; verduurzaamd.</p>
</main><footer>Footer tekst Hillegom</footer></body></html>`;

test('hoofdTekst haalt koppen, tekst en lijsten uit de hoofdinhoud, zonder menu, footer, formulier, scripts en dubbelen', () => {
  const t = hoofdTekst(PAGINA);
  assert.match(t, /## Breng jouw woning weer tot leven/);
  assert.match(t, /verbeterd & verduurzaamd/);
  assert.match(t, /- Badkamer renovatie/);
  for (const weg of ['geheim', 'Contact menu', 'Footer tekst', 'Naam']) assert.ok(!t.includes(weg), weg);
  assert.equal(t.split('Renovatie is het proces').length - 1, 1, 'dubbele regel eruit');
});

test('kiesUrls: homepage eerst, diensten voor de rest, eigen landingspagina\'s en rommel vallen af', () => {
  const lijst = kiesUrls({
    basis: 'https://mac-bouw.nl/',
    restPaginas: [
      { url: 'https://mac-bouw.nl/bouwbedrijf-hillegom/', titel: 'Bouwbedrijf Hillegom' },
      { url: 'https://mac-bouw.nl/privacybeleid/', titel: 'Privacy' },
      { url: 'https://mac-bouw.nl/over-ons/', titel: 'Over ons' },
      { url: 'https://mac-bouw.nl/renovatie/', titel: 'Renovatie' },
      { url: 'https://andere-site.nl/renovatie/', titel: 'Extern' },
      { url: 'https://mac-bouw.nl/wp-content/uploads/brochure.pdf', titel: 'pdf' }
    ],
    homepageLinks: ['https://mac-bouw.nl/renovatie/#top', 'https://mac-bouw.nl/zomaar/'],
    uitsluit: ['https://mac-bouw.nl/bouwbedrijf-hillegom']
  });
  const urls = lijst.map((p) => p.url);
  assert.equal(urls[0], 'https://mac-bouw.nl/');
  assert.deepEqual(urls.slice(1, 3).sort(), ['https://mac-bouw.nl/over-ons/', 'https://mac-bouw.nl/renovatie/']);
  assert.ok(urls.includes('https://mac-bouw.nl/zomaar/'));
  for (const weg of ['bouwbedrijf-hillegom', 'privacybeleid', 'andere-site', 'brochure.pdf']) assert.ok(!urls.some((u) => u.includes(weg)), weg);
  assert.equal(urls.filter((u) => u.includes('renovatie')).length, 1, 'geen dubbelen');
});

test('kapAfOpWoorden kapt op regelgrens af', () => {
  const t = 'een twee drie\nvier vijf zes\nzeven acht negen';
  assert.equal(kapAfOpWoorden(t, 7), 'een twee drie\nvier vijf zes');
  assert.equal(kapAfOpWoorden(t, 50), t);
});

function nepFetch(paginas) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/wp-json/wp/v2/pages')) {
      return { ok: true, status: 200, url: u, text: async () => JSON.stringify(Object.keys(paginas).map((p) => ({ link: `https://klant.nl${p}`, title: { rendered: p } }))) };
    }
    const pad = u.replace('https://klant.nl', '') || '/';
    if (paginas[pad]) return { ok: true, status: 200, url: u, text: async () => paginas[pad] };
    return { ok: false, status: 404, url: u, text: async () => '' };
  };
}
const lang = (zin) => `<main><h1>Titel</h1>${Array.from({ length: 12 }, (_, i) => `<p>${zin} nummer ${i} met voldoende woorden erin.</p>`).join('')}</main>`;

test('haalSiteTeksten leest de pagina\'s van de klantsite, slaat eigen landingspagina\'s over en maakt een brontekst', async () => {
  const oud = global.fetch;
  global.fetch = nepFetch({ '/': lang('Homepage tekst'), '/renovatie/': lang('Renovatie uitleg'), '/bouwbedrijf-lisse/': lang('Onze eigen landingspagina'), '/leeg/': '<main>kort</main>' });
  try {
    const r = await haalSiteTeksten({ url: 'https://klant.nl', uitsluit: ['https://klant.nl/bouwbedrijf-lisse/'] });
    assert.equal(r.fout, null);
    const urls = r.paginas.map((p) => p.url);
    assert.ok(urls.includes('https://klant.nl/renovatie/') && urls.includes('https://klant.nl/'));
    assert.ok(!urls.some((u) => u.includes('lisse')), 'eigen landingspagina niet als bron');
    assert.ok(!urls.some((u) => u.includes('leeg')), 'te korte pagina niet als bron');
    const tekst = formatSiteTekstenVoorPrompt(r);
    assert.match(tekst, /Renovatie uitleg/);
    assert.ok(!tekst.includes('Onze eigen landingspagina'));
  } finally {
    global.fetch = oud;
  }
});

test('haalSiteTeksten gooit nooit: een onbereikbare site geeft een melding', async () => {
  const oud = global.fetch;
  global.fetch = async () => { throw new Error('netwerk weg'); };
  try {
    const r = await haalSiteTeksten({ url: 'https://onbereikbaar-voorbeeld.nl', uitsluit: [] });
    assert.deepEqual(r.paginas, []);
    assert.ok(r.fout);
    assert.equal(formatSiteTekstenVoorPrompt(r), '');
  } finally {
    global.fetch = oud;
  }
});

test('generatePageContent geeft de bronteksten en de regels voor bronteksten aan de AI', async () => {
  const oud = global.fetch;
  const oudeSleutel = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test';
  let prompts = null;
  global.fetch = async (url, opties) => {
    const body = JSON.parse(opties.body);
    prompts = { systeem: body.messages[0].content, gebruiker: body.messages[1].content };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ slotData: { heroTitle: 'x' } }) } }] }) };
  };
  try {
    const template = { slots: [{ key: 'heroTitle', type: 'text', verplicht: true }] };
    await ai.generatePageContent({ klant: 'macbouw', template, invoer: {}, feiten: [], siteTeksten: '--- Renovatie (https://mac-bouw.nl/renovatie/) ---\n## Wat is woningrenovatie?' });
    assert.match(prompts.systeem, /BRONTEKSTEN VAN DE KLANTSITE/);
    assert.match(prompts.systeem, /acht woorden/);
    assert.match(prompts.gebruiker, /Wat is woningrenovatie/);
    await ai.generatePageContent({ klant: 'macbouw', template, invoer: {}, feiten: [] });
    assert.match(prompts.gebruiker, /geen bronteksten van de klantsite beschikbaar/);
  } finally {
    global.fetch = oud;
    if (oudeSleutel === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oudeSleutel;
  }
});
