const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwServiceSchema, vindPlaats } = require('../src/lp/seoSchema');
const { pushDraft } = require('../src/lp/wordpress');
const { vindBedrijfsgegevens, detecteerSeoPlugin, bouwZekereFeiten } = require('../src/lp/siteAnalyse');
const { buildTemplateSystemPrompt, buildContentSystemPrompt } = require('../src/lp/ai');
const { renderPageHtml } = require('../src/lp/render');
const { getLpClient } = require('../src/lp/clients');

test('dienst-schema: plaats uit de invoer, aanbod als soorten, verwijzing naar de Yoast organisatie', () => {
  const profile = getLpClient('macbouw').profile;
  const schema = bouwServiceSchema({
    slotData: { heroTitle: 'Aannemer in [Amersfoort](x)', metaDescription: 'Verbouw en renovatie.', offerItems: [{ title: 'Verbouwing' }, { title: 'Renovatie' }] },
    invoer: { plaatsnaam: 'Amersfoort' },
    profile
  });
  assert.equal(schema['@type'], 'Service');
  assert.equal(schema.name, 'Aannemer in Amersfoort');
  assert.deepEqual(schema.areaServed, { '@type': 'City', name: 'Amersfoort' });
  assert.deepEqual(schema.serviceType, ['Verbouwing', 'Renovatie']);
  assert.deepEqual(schema.provider, { '@id': 'https://mac-bouw.nl/#organization' });
});

test('dienst-schema: zonder Yoast een volledige organisatie uit het klantprofiel, zonder titel geen schema', () => {
  const profile = { ...getLpClient('macbouw').profile, seo: undefined };
  const schema = bouwServiceSchema({ slotData: { heroTitle: 'Titel' }, invoer: {}, profile });
  assert.equal(schema.provider['@type'], 'Organization');
  assert.equal(schema.provider.telephone, '+31 252 34 95 23');
  assert.equal(schema.areaServed, undefined, 'geen plaats in de invoer, dan geen werkgebied verzinnen');
  assert.equal(bouwServiceSchema({ slotData: {}, invoer: {}, profile }), null);
  assert.equal(vindPlaats({ stad: 'Hillegom' }), 'Hillegom');
});

test('een gerenderde slot-pagina bevat het dienst-schema als JSON-LD', () => {
  const html = renderPageHtml({
    clientId: 'macbouw', slug: 'x', invoer: { plaatsnaam: 'Lisse' },
    template: { htmlTemplate: '<h1>{{heroTitle}}</h1>', cssTemplate: '', slots: [] },
    slotData: { heroTitle: 'Aannemer in Lisse', metaDescription: 'Omschrijving' }
  }, { forWordPress: true });
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"@type":"Service"/);
  assert.match(html, /"name":"Lisse"/);
});

// Nep WordPress voor pushDraft.
function nepWordPress({ metaRegistered }) {
  const oud = global.fetch;
  const aanroepen = [];
  global.fetch = async (url, opts = {}) => {
    aanroepen.push({ url, opts });
    const json = (o, ok = true) => ({ ok, status: ok ? 200 : 400, statusText: 'x', json: async () => o });
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      nepWordPress.laatsteBody = body;
      return json({ id: 7, link: 'https://klant.nl/?p=7' });
    }
    return json({ id: 7, slug: 'aannemer-lisse', meta: metaRegistered ? nepWordPress.laatsteBody.meta : {} });
  };
  return { aanroepen, herstel: () => { global.fetch = oud; } };
}

test('publiceren: slug en SEO-meta gaan mee, en opgeslagen meta wordt bevestigd', async () => {
  process.env.WP_URL_MACBOUW = 'https://klant.nl';
  process.env.WP_USERNAME_MACBOUW = 'u';
  process.env.WP_APP_PASSWORD_MACBOUW = 'p';
  const nep = nepWordPress({ metaRegistered: true });
  try {
    const res = await pushDraft({
      profile: getLpClient('macbouw').profile, titel: 'T', html: '<p>x</p>', slug: 'aannemer-lisse',
      metaTitel: 'Aannemer in Lisse | MAC Bouw', metaBeschrijving: 'Beschrijving'
    });
    assert.equal(nepWordPress.laatsteBody.slug, 'aannemer-lisse');
    assert.equal(nepWordPress.laatsteBody.meta._yoast_wpseo_title, 'Aannemer in Lisse | MAC Bouw');
    assert.equal(nepWordPress.laatsteBody.meta._yoast_wpseo_metadesc, 'Beschrijving');
    assert.equal(nepWordPress.laatsteBody.status, 'draft');
    assert.equal(res.seo.status, 'opgeslagen');
  } finally { nep.herstel(); }
});

test('publiceren: als de SEO plugin de meta niet accepteert, meldt de tool dat eerlijk', async () => {
  const nep = nepWordPress({ metaRegistered: false });
  try {
    const res = await pushDraft({
      profile: getLpClient('macbouw').profile, titel: 'T', html: '<p>x</p>', slug: 's',
      metaTitel: 'Titel', metaBeschrijving: 'Beschrijving'
    });
    assert.equal(res.seo.status, 'niet_opgeslagen');
    assert.match(res.seo.melding, /NIET/);
  } finally { nep.herstel(); }
});

test('publiceren: klant zonder SEO plugin stuurt geen meta mee', async () => {
  const nep = nepWordPress({ metaRegistered: true });
  try {
    const profile = { ...getLpClient('macbouw').profile, seo: undefined };
    const res = await pushDraft({ profile, titel: 'T', html: '<p>x</p>', metaTitel: 'a', metaBeschrijving: 'b' });
    assert.equal(nepWordPress.laatsteBody.meta, undefined);
    assert.equal(res.seo.status, 'niet_van_toepassing');
  } finally { nep.herstel(); }
});

test('site-analyse: telefoon, e-mail en naam uit tel-links, mailto en JSON-LD, en de SEO plugin', () => {
  const html = '<!-- This site is optimized with the Yoast SEO plugin --><script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"MAC Bouw"}]}</script>' +
    '<a href="tel:+31(0)252349523">bel</a><a href="tel:+31651370691">mobiel</a><a href="mailto:info@mac-bouw.nl">mail</a><a href="mailto:Marconistraat 31A, 2181 AK Hillegom">adres</a>';
  const g = vindBedrijfsgegevens(html);
  assert.equal(g.naam, 'MAC Bouw');
  assert.equal(g.telefoon.length, 2);
  assert.deepEqual(g.email, ['info@mac-bouw.nl'], 'een mailto met een adres erin is geen e-mailadres');
  assert.equal(detecteerSeoPlugin(html), 'yoast');
  const feiten = bouwZekereFeiten({ url: 'https://www.mac-bouw.nl/', bedrijfsgegevens: g, seoPlugin: 'yoast' }, '2026-09-25');
  assert.ok(feiten.every((f) => f.bron.startsWith('mac-bouw.nl,')), 'elke bron noemt het domein');
  assert.ok(feiten.some((f) => f.label === 'Bedrijfsnaam'));
});

test('AI-prompts bevatten de SEO en GEO regels voor sjabloon en content', () => {
  assert.match(buildTemplateSystemPrompt(), /SEO EN GEO IN HET SJABLOON/);
  assert.match(buildTemplateSystemPrompt(), /<address>/);
  const inhoud = buildContentSystemPrompt({ slots: [], htmlTemplate: '' });
  assert.match(inhoud, /SEO EN GEO BIJ HET SCHRIJVEN/);
  assert.match(inhoud, /Antwoord eerst/);
});
