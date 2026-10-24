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
  updateSection: async () => {}, listPages: async () => [], setWordpressInfo: async () => {}, setStatus: async () => {}
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
    assert.equal((await post('/templates/campagne', { klant: 'macbouw' })).status, 400);

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
