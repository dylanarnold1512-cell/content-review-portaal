// Een paginabouwer met twee soorten (24-10-2026): SEO/GEO of campagne. Getest met nep Notion, nep sjablonen en nep OpenAI.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.SESSION_SECRET = 'test-geheim';
process.env.OPENAI_API_KEY = 'test';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const paginas = new Map();
mockModule('../src/lp/notion', {
  createPage: async (args) => { const id = `p${paginas.size + 1}`; paginas.set(id, { id, ...args, status: 'Formulier ingevuld' }); return paginas.get(id); },
  getPage: async (id) => JSON.parse(JSON.stringify(paginas.get(id))),
  updateSection: async (id, sectie, waarde) => { if (paginas.has(id)) paginas.get(id)[sectie] = JSON.parse(JSON.stringify(waarde)); },
  listPages: async () => [], setWordpressInfo: async () => {}, setStatus: async () => {}
});
const sjablonen = [];
const gemaakt = [];
const campagneBp = {
  templateFormat: 'slots', paginaSoort: 'campagne',
  htmlTemplate: '<section><h1>{{heroTitle}}</h1><a class="lp-cta-button" href="{{ctaHref}}">{{ctaLabel}}</a></section><section id="aanvraag">{{formulier}}</section>',
  cssTemplate: '.lpt section{padding:20px}',
  slots: [{ key: 'heroTitle', type: 'text', verplicht: true }, { key: 'ctaLabel', type: 'text', verplicht: true }, { key: 'ctaHref', type: 'text', verplicht: true }, { key: 'metaTitle', type: 'text' }, { key: 'metaDescription', type: 'text' }],
  invoerVelden: []
};
mockModule('../src/lp/templates', {
  listTemplates: async ({ status } = {}) => sjablonen.filter((t) => !status || t.status === status),
  getActiveTemplateByBlueprintId: async (klant, id) => { const t = sjablonen.find((s) => s.blueprintId === id && s.status === 'Actief'); if (!t) throw new Error('geen actief sjabloon'); return { id, ...(t.blueprint || campagneBp) }; },
  createTemplate: async (args) => { gemaakt.push(args); return { id: 't1', ...args }; }
});
mockModule('../src/lp/siteTeksten', {
  haalSiteTeksten: async () => ({ paginas: [], gefilterd: [] }), formatSiteTekstenVoorPrompt: () => '', normaliseerUrl: (u) => u,
  hoofdTekst: () => '', kiesUrls: () => [], kapAfOpWoorden: (t) => t, telWoorden: () => 0, OVERSLAAN_RE: /x/
});
mockModule('../src/lp/wordpress', {
  searchMedia: async () => ({ items: [] }), pushDraft: async () => ({}), deletePage: async () => {}, restorePage: async () => {},
  uploadMedia: async () => {}, listSitePages: async () => [], haalPaginaStatussen: async () => ({}), siteNaam: () => ''
});

const ai = require('../src/lp/ai');
const ck = require('../src/lp/campagneKennis');
const lpRoutes = require('../src/routes/lp');

async function metServer(antwoorden, fn) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const echt = global.fetch;
  const prompts = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith(base)) return echt(url, opts);
    if (/api\.openai\.com/.test(String(url))) {
      const body = JSON.parse(opts.body);
      prompts.push(body.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(antwoorden.shift() || {}) } }] }) };
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
  try {
    const login = await echt(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (pad, body) => echt(`${base}/api/lp${pad}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
    const get = (pad) => echt(`${base}/api/lp${pad}`, { headers: { cookie } }).then((r) => r.json());
    await fn({ post, get, prompts });
  } finally { global.fetch = echt; server.close(); }
}

test('campagneVan en campagneInvoer', () => {
  assert.equal(ck.campagneVan({ blueprint: 'locatie', invoer: {} }), null);
  assert.deepEqual(ck.campagneVan({ blueprint: 'campagne', invoer: {} }), { kanaal: 'google', zoekwoord: '', aanbieding: '' });
  const inv = ck.campagneInvoer({ kanaal: 'META', zoekwoord: ' aanbouw ', aanbieding: 'gratis opname' });
  assert.deepEqual(inv, { _soort: 'campagne', _kanaal: 'meta', _zoekwoord: 'aanbouw', _aanbieding: 'gratis opname' });
  assert.equal(ck.campagneInvoer({ kanaal: 'tiktok' })._kanaal, 'google');
});

test('campagnesjabloon: geen verplichte interne links', () => {
  const bp = ck.maakCampagneBlueprint({ htmlTemplate: '<h1>{{heroTitle}}</h1>', slots: [{ key: 'heroTitle' }, { key: 'linksItems', verplicht: true }], linkRegels: { minimumInterneLinks: 2 } });
  assert.equal(bp.paginaSoort, 'campagne');
  assert.equal(bp.linkRegels.minimumInterneLinks, 0);
  assert.ok(!bp.slots.some((s) => s.key === 'linksItems'));
  const metLinks = ck.maakCampagneBlueprint({ htmlTemplate: '{{#each linksItems}}x{{/each}}', slots: [{ key: 'linksItems', verplicht: true }] });
  assert.equal(metLinks.slots[0].verplicht, false);
});

test('prompts: SEO/GEO blijft gelijk, campagne krijgt eigen regels', () => {
  const tpl = { slots: [{ key: 'heroTitle', type: 'text' }] };
  const seo = ai.buildContentSystemPrompt(tpl, {});
  const camp = ai.buildContentSystemPrompt(tpl, { campagne: true });
  assert.match(seo, /SEO EN GEO BIJ HET SCHRIJVEN/);
  assert.match(seo, /Interne links/);
  assert.doesNotMatch(camp, /SEO EN GEO BIJ HET SCHRIJVEN/);
  assert.match(camp, /DIT IS EEN CAMPAGNEPAGINA/);
  assert.match(camp, /Aansluiting op de advertentie/);
  assert.match(ai.buildTemplateSystemPrompt(), /SEO EN GEO IN HET SJABLOON/);
  const campTpl = ai.buildTemplateSystemPrompt({ campagne: true });
  assert.doesNotMatch(campTpl, /SEO EN GEO IN HET SJABLOON/);
  assert.match(campTpl, /DIT SJABLOON IS EEN CAMPAGNEPAGINA/);
});

test('generatePageContent: campagne zonder links, met kanaal en zoekwoord', async () => {
  const echt = global.fetch;
  const prompts = [];
  global.fetch = async (url, opts) => {
    prompts.push(JSON.parse(opts.body).messages.map((m) => m.content).join('\n'));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ slotData: { heroTitle: 'Bekijk [onze kamers](https://x.nl/kamers)' } }) } }] }) };
  };
  try {
    const uit = await ai.generatePageContent({
      klant: 'macbouw', template: { slots: [{ key: 'heroTitle', type: 'text' }] }, invoer: {}, feiten: [],
      watGaatDezePaginaOver: 'aanbouw', linkKandidaten: [{ label: 'Kamers', url: 'https://x.nl/kamers' }], zonderPlan: true,
      campagne: { kanaal: 'meta', zoekwoord: 'aanbouw laten bouwen', aanbieding: 'gratis opname' }, campagneVoorkeuren: ['Noem nooit prijzen']
    });
    assert.doesNotMatch(prompts[0], /Beschikbare linkbestemmingen/);
    assert.match(prompts[0], /Meta Ads/);
    assert.match(prompts[0], /aanbouw laten bouwen/);
    assert.match(prompts[0], /gratis opname/);
    assert.match(prompts[0], /Noem nooit prijzen/);
    assert.doesNotMatch(uit.slotData.heroTitle, /https/);
  } finally { global.fetch = echt; }
});

test('route: campagnepagina zonder actief campagnesjabloon geeft een duidelijke melding', async () => {
  sjablonen.length = 0;
  sjablonen.push({ blueprintId: 'locatie', naam: 'Locatiegericht', status: 'Actief' });
  await metServer([], async ({ post, get }) => {
    const r = await post('/pages/snel', { klant: 'macbouw', onderwerp: 'aanbouw Bollenstreek', soort: 'campagne', kanaal: 'google' });
    assert.equal(r.status, 400);
    assert.match(r.error, /campagnesjabloon/);
    assert.equal((await get('/templates/campagne/macbouw')).status, 'geen');
  });
});

test('route: campagnesjabloon maken en daarna een campagnepagina', async () => {
  sjablonen.length = 0;
  gemaakt.length = 0;
  paginas.clear();
  sjablonen.push({ blueprintId: 'locatie', naam: 'Locatiegericht', status: 'Actief' });
  const voorstel = { blueprint: { ...campagneBp, slots: [...campagneBp.slots, { key: 'linksItems', type: 'list', verplicht: true, itemFields: ['label', 'href'] }], linkRegels: { minimumInterneLinks: 2 } }, voorbeeldSlotData: { heroTitle: 'Voorbeeld' } };
  await metServer([voorstel, { blueprintId: 'campagne', titel: 'Ads: aanbouw Bollenstreek', slug: 'ads-aanbouw', invoer: {}, waarom: 'x' }], async ({ post, get, prompts }) => {
    const t = await post('/templates/campagne', { klant: 'macbouw' });
    assert.equal(t.status, 200, JSON.stringify(t));
    assert.equal(gemaakt[0].blueprintId, 'campagne');
    assert.equal(gemaakt[0].status, 'Concept');
    assert.equal(gemaakt[0].blueprint.linkRegels.minimumInterneLinks, 0);
    assert.equal(gemaakt[0].blueprint.voorbeeldSlotData.heroTitle, 'Voorbeeld');
    assert.match(prompts[0], /DIT SJABLOON IS EEN CAMPAGNEPAGINA/);

    sjablonen.push({ blueprintId: 'campagne', naam: 'Campagnepagina', status: 'Concept' });
    assert.equal((await get('/templates/campagne/macbouw')).status, 'concept');

    sjablonen[1].status = 'Actief';
    const r = await post('/pages/snel', { klant: 'macbouw', onderwerp: 'offertes voor een aanbouw', soort: 'campagne', kanaal: 'linkedin', zoekwoord: 'aanbouw laten bouwen', aanbieding: 'gratis opname' });
    assert.ok(r.page, JSON.stringify(r));
    const p = paginas.get(r.page.id);
    assert.equal(p.blueprint, 'campagne');
    assert.equal(p.invoer._soort, 'campagne');
    assert.equal(p.invoer._kanaal, 'linkedin');
    assert.equal(p.invoer._zoekwoord, 'aanbouw laten bouwen');
  });
});

test('route: een SEO/GEO pagina krijgt het campagnesjabloon nooit te zien', async () => {
  sjablonen.length = 0;
  sjablonen.push({ blueprintId: 'locatie', naam: 'Locatiegericht', status: 'Actief' }, { blueprintId: 'campagne', naam: 'Campagnepagina', status: 'Actief' });
  await metServer([{ blueprintId: 'locatie', titel: 'Aannemer Lisse', slug: 'aannemer-lisse', invoer: {}, waarom: 'x' }], async ({ post, prompts }) => {
    const r = await post('/pages/begeleiding', { klant: 'macbouw', onderwerp: 'aannemer in Lisse' });
    assert.equal(r.advies.blueprintId, 'locatie');
    assert.doesNotMatch(prompts[0], /Campagnepagina/);
  });
});

async function wachtOpTaak(get, taakId) {
  for (let i = 0; i < 100; i++) {
    const t = await get(`/chat/taak/${taakId}`);
    if (t.status !== 'bezig') return t;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('taak bleef bezig');
}

test('bijsturen: tekst op een pagina met een vast sjabloon, het sjabloon blijft van de database', async () => {
  sjablonen.length = 0;
  paginas.clear();
  sjablonen.push({ blueprintId: 'campagne', naam: 'Campagnepagina', status: 'Actief' });
  paginas.set('p1', { id: 'p1', klant: 'macbouw', blueprint: 'campagne', titel: 'Ads aanbouw', invoer: { _soort: 'campagne', _kanaal: 'google', _zoekwoord: 'aanbouw' }, content: { slotData: { heroTitle: 'Oude kop', ctaLabel: 'Vraag offerte aan', ctaHref: '#aanvraag' } }, sjabloon: null });
  await metServer([
    { actie: 'tekst', antwoord: 'Kop korter.', slotWijzigingen: { heroTitle: 'Nieuwe kop', onbekend: 'x' } },
    { actie: 'bouw', antwoord: 'Ik bouw opnieuw.', blueprint: { htmlTemplate: '<p>x</p>' }, slotData: { heroTitle: 'Mag niet' } }
  ], async ({ post, get, prompts }) => {
    let t = await wachtOpTaak(get, (await post('/pages/p1/bijsturen', { bericht: 'Maak de kop korter' })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    const p = paginas.get('p1');
    assert.equal(p.content.slotData.heroTitle, 'Nieuwe kop');
    assert.equal(p.content.slotData.onbekend, undefined);
    assert.equal(p.sjabloon.blueprint, null);
    assert.equal(p.sjabloon.berichten.length, 2);
    assert.match(prompts[0], /DIT IS EEN CAMPAGNEPAGINA/);
    assert.match(prompts[0], /aanbouw/);
    t = await wachtOpTaak(get, (await post('/pages/p1/bijsturen', { bericht: 'Bouw alles opnieuw' })).taakId);
    assert.equal(t.resultaat.actie, 'geen');
    assert.equal(paginas.get('p1').content.slotData.heroTitle, 'Nieuwe kop');
    assert.equal(paginas.get('p1').sjabloon.berichten.length, 4);
    assert.equal((await post('/pages/p1/bijsturen', { bericht: '  ' })).status, 400);
  });
});

test('bijsturen: een SEO/GEO pagina krijgt de SEO/GEO regels', async () => {
  sjablonen.length = 0;
  paginas.clear();
  sjablonen.push({ blueprintId: 'locatie', naam: 'Locatiegericht', status: 'Actief', blueprint: campagneBp });
  paginas.set('p2', { id: 'p2', klant: 'macbouw', blueprint: 'locatie', titel: 'Aannemer Lisse', invoer: {}, content: { slotData: { heroTitle: 'Aannemer in Lisse' } }, sjabloon: null });
  await metServer([{ actie: 'geen', antwoord: 'Prima zo.' }], async ({ post, get, prompts }) => {
    const t = await wachtOpTaak(get, (await post('/pages/p2/bijsturen', { bericht: 'Is de kop goed?' })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    assert.match(prompts[0], /SEO EN GEO BIJ HET SCHRIJVEN/);
    assert.doesNotMatch(prompts[0], /DIT IS EEN CAMPAGNEPAGINA/);
  });
});

test('meerdere campagnesjablonen: nieuw id, eigen keuze en standaard', async () => {
  sjablonen.length = 0;
  gemaakt.length = 0;
  paginas.clear();
  sjablonen.push(
    { blueprintId: 'locatie', naam: 'Locatiegericht', status: 'Actief' },
    { blueprintId: 'campagne', naam: 'Campagnepagina', status: 'Actief' },
    { blueprintId: 'campagne-2', naam: 'Kort en direct', status: 'Actief' },
    { blueprintId: 'campagne-3', naam: 'Nog niet klaar', status: 'Concept' }
  );
  assert.equal(ck.isCampagneBlueprintId('campagne-2'), true);
  assert.equal(ck.isCampagneBlueprintId('campagnes'), false);
  assert.equal(ck.volgendeCampagneBlueprintId(['campagne', 'campagne-2', 'campagne-4']), 'campagne-3');
  assert.deepEqual(ck.campagneVan({ blueprint: 'campagne-2', invoer: {} }), { kanaal: 'google', zoekwoord: '', aanbieding: '' });
  const voorstel = { blueprint: { ...campagneBp }, voorbeeldSlotData: { heroTitle: 'Voorbeeld' } };
  const adviesB = { blueprintId: 'campagne', titel: 'Ads: standaard', slug: 'ads-standaard', invoer: {}, waarom: 'x' };
  // Na een pagina start soms de automatische tekst en die gebruikt ook een antwoord, daarom staat adviesB er vaker.
  await metServer([voorstel, { blueprintId: 'campagne-2', titel: 'Ads: dakkapel', slug: 'ads-dakkapel', invoer: {}, waarom: 'x' }, adviesB, adviesB, adviesB], async ({ post, get, prompts }) => {
    const lijst = await get('/templates/campagne/macbouw');
    assert.equal(lijst.status, 'actief');
    assert.deepEqual(lijst.sjablonen.map((t) => t.blueprintId), ['campagne', 'campagne-2']);
    assert.deepEqual(lijst.concepten.map((t) => t.blueprintId), ['campagne-3']);

    const t = await post('/templates/campagne', { klant: 'macbouw', wensen: 'korter, met een video bovenaan' });
    assert.equal(t.status, 200, JSON.stringify(t));
    assert.equal(gemaakt[0].blueprintId, 'campagne-4');
    assert.equal(gemaakt[0].naam, 'Campagnepagina 4');
    assert.match(prompts[0], /korter, met een video bovenaan/);
    assert.match(prompts[0], /duidelijk anders/);

    const gekozen = await post('/pages/snel', { klant: 'macbouw', onderwerp: 'dakkapel', soort: 'campagne', kanaal: 'google', blueprintId: 'campagne-2' });
    assert.ok(gekozen.page, JSON.stringify(gekozen));
    assert.equal(paginas.get(gekozen.page.id).blueprint, 'campagne-2');
    assert.doesNotMatch(prompts[1], /Locatiegericht/);

    // Zonder keuze, of met een SEO sjabloon, wordt het standaard campagnesjabloon gebruikt.
    const standaard = await post('/pages/snel', { klant: 'macbouw', onderwerp: 'aanbouw', soort: 'campagne', kanaal: 'google', blueprintId: 'locatie' });
    assert.ok(standaard.page, JSON.stringify(standaard));
    assert.equal(paginas.get(standaard.page.id).blueprint, 'campagne');
  });
});

test('campagnesjabloon heeft geen eigen invoervelden en de AI schrijft vrij', () => {
  const bp = ck.maakCampagneBlueprint({ ...campagneBp, invoerVelden: [{ key: 'campagneKanaal', label: 'Advertentiekanaal', required: true }] });
  assert.deepEqual(bp.invoerVelden, []);
  assert.match(ck.CAMPAGNE_CONTENT_REGELS, /Jij bepaalt hoe de pagina wordt/);
  assert.match(ck.CAMPAGNE_CONTENT_REGELS, /Verzin geen harde gegevens/);
  assert.match(ck.CAMPAGNE_SJABLOON_REGELS, /minmax\(0, 1fr\)/);
  assert.match(ck.bouwCampagneBlok({ kanaal: 'google', zoekwoord: '', aanbieding: '' }), /opdracht aan jou en geen tekst om over te nemen/);
});

test('invoer opslaan laat de verborgen campagnevelden staan', async () => {
  sjablonen.length = 0;
  paginas.clear();
  paginas.set('p1', { id: 'p1', klant: 'macbouw', blueprint: 'campagne', titel: 'Ads', invoer: { _soort: 'campagne', _kanaal: 'meta', _zoekwoord: 'aanbouw', _watGaatDezePaginaOver: 'oud' }, content: null, sjabloon: null });
  const app = require('express')();
  app.use(require('express').json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const r = await fetch(`${base}/api/lp/pages/p1/invoer`, { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ invoer: { _watGaatDezePaginaOver: 'nieuw', _ctaOverride: '' } }) });
    assert.equal(r.status, 200);
    const invoer = paginas.get('p1').invoer;
    assert.equal(invoer._soort, 'campagne');
    assert.equal(invoer._kanaal, 'meta');
    assert.equal(invoer._zoekwoord, 'aanbouw');
    assert.equal(invoer._watGaatDezePaginaOver, 'nieuw');
  } finally { server.close(); }
});

test('generatePageContent: een campagnepagina wordt in een keer en vrij geschreven, zonder plan en feitenregels', async () => {
  const echt = global.fetch;
  const prompts = [];
  global.fetch = async (url, opts) => {
    prompts.push(JSON.parse(opts.body).messages.map((m) => m.content).join('\n'));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ slotData: { heroTitle: 'Uw aanbouw, zonder gedoe' } }) } }] }) };
  };
  try {
    const uit = await ai.generatePageContent({
      klant: 'macbouw', template: { slots: [{ key: 'heroTitle', type: 'text' }] }, invoer: {}, feiten: [{ id: 'f1', label: 'Ervaring', waarde: 'sinds 2012' }],
      watGaatDezePaginaOver: 'aanbouw', siteTeksten: 'Wij bouwen aanbouwen en dakkapellen.',
      campagne: { kanaal: 'google', zoekwoord: 'aanbouw', aanbieding: '' }, klantverhaal: { status: 'goedgekeurd', tekst: 'lang verhaal' }
    });
    assert.equal(prompts.length, 1);
    assert.equal(uit.schrijfplan, null);
    assert.match(prompts[0], /Jij bepaalt hoe de pagina wordt/);
    assert.match(prompts[0], /ACHTERGROND OVER DE KLANT/);
    assert.doesNotMatch(prompts[0], /gebruik uitsluitend deze, verzin niets extra's/);
    assert.doesNotMatch(prompts[0], /lang verhaal/);
    assert.equal(uit.slotData.heroTitle, 'Uw aanbouw, zonder gedoe');
  } finally { global.fetch = echt; }
});
