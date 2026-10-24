// De chatroutes (Bouwen met chat), met een nep Notion, een nep WordPress en een nep OpenAI.
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

const opgeslagen = new Map();
const schrijf = [];
mockModule('../src/lp/notion', {
  createPage: async (args) => { const id = `p${opgeslagen.size + 1}`; opgeslagen.set(id, { id, klant: args.klant, blueprint: args.blueprint, titel: args.titel, slug: args.slug, status: 'Formulier ingevuld', invoer: args.invoer, content: args.content || null, sjabloon: args.sjabloon || null }); return opgeslagen.get(id); },
  getPage: async (id) => { if (!opgeslagen.has(id)) throw new Error('niet gevonden'); return JSON.parse(JSON.stringify(opgeslagen.get(id))); },
  updateSection: async (id, sectie, waarde) => { schrijf.push({ id, sectie }); opgeslagen.get(id)[sectie] = JSON.parse(JSON.stringify(waarde)); return opgeslagen.get(id); },
  listPages: async () => [...opgeslagen.values()].map(({ id, klant, blueprint, titel, status }) => ({ id, klant, blueprint, titel, status })),
  setWordpressInfo: async () => {},
  setStatus: async () => {}
});
mockModule('../src/lp/templates', { getActiveTemplateByBlueprintId: async () => { throw new Error('mag niet nodig zijn'); }, listTemplates: async () => [] });
mockModule('../src/lp/siteTeksten', {
  haalSiteTeksten: async () => ({ paginas: [], gefilterd: [] }), formatSiteTekstenVoorPrompt: () => '', normaliseerUrl: (u) => u,
  hoofdTekst: () => '', kiesUrls: () => [], kapAfOpWoorden: (t) => t, telWoorden: () => 0, OVERSLAAN_RE: /x/
});
mockModule('../src/lp/wordpress', {
  searchMedia: async () => ({ items: [] }),
  pushDraft: async () => ({ id: 77, link: 'https://mac-bouw.nl/?page_id=77', seo: { melding: 'ok' } }),
  deletePage: async () => {}, restorePage: async () => {}, uploadMedia: async () => {}, listSitePages: async () => [], haalPaginaStatussen: async () => ({}), siteNaam: () => ''
});

const lpRoutes = require('../src/routes/lp');

const blueprint = {
  templateFormat: 'slots',
  htmlTemplate: '<section><h1>{{heroTitle}}</h1><p>{{heroIntro}}</p><img src="{{heroImageSrc}}" alt="{{heroImageAlt}}"><a class="lp-cta-button" href="{{ctaHref}}">{{ctaLabel}}</a></section><section id="aanvraag">{{formulier}}</section>',
  cssTemplate: '.lpt section{padding:20px}',
  slots: [
    { key: 'heroTitle', type: 'text', verplicht: true }, { key: 'heroIntro', type: 'text' },
    { key: 'heroImageSrc', type: 'text' }, { key: 'heroImageAlt', type: 'text' },
    { key: 'ctaLabel', type: 'text', verplicht: true }, { key: 'ctaHref', type: 'text', verplicht: true },
    { key: 'metaTitle', type: 'text', verplicht: true }, { key: 'metaDescription', type: 'text', verplicht: true }
  ],
  ctaRegel: { verplicht: true },
  seoRegels: { exactEenH1: true, metaTitleMin: 20, metaTitleMax: 70, metaDescriptionMin: 50, metaDescriptionMax: 160 }
};
const slotData = {
  heroTitle: 'Uw aanbouw in de Bollenstreek', heroIntro: 'Van plan tot oplevering.', ctaLabel: 'Vertel ons over uw plannen', ctaHref: '#aanvraag',
  metaTitle: 'Aanbouw laten bouwen in de Bollenstreek', metaDescription: 'Meer ruimte in huis? Wij bouwen uw aanbouw van eerste idee tot oplevering in de Bollenstreek.'
};

async function metServer(fn) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const echt = global.fetch;
  try {
    const login = await echt(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    await fn({ base, cookie, echt });
  } finally { global.fetch = echt; server.close(); }
}

function nepOpenAi(echt, base, antwoorden) {
  global.fetch = async (url, opts) => {
    if (String(url).startsWith(base)) return echt(url, opts);
    if (/api\.openai\.com/.test(String(url))) {
      const a = antwoorden.shift();
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(a) } }] }) };
    }
    return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
  };
}

async function wachtOpTaak(echt, base, cookie, taakId) {
  for (let i = 0; i < 100; i++) {
    const r = await (await echt(`${base}/api/lp/chat/taak/${taakId}`, { headers: { cookie } })).json();
    if (r.status !== 'bezig') return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('taak bleef bezig');
}

test('chat: vraag zonder pagina, daarna bouwen, tekst aanpassen, voorbeeld en publiceren', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    const post = (pad, body) => echt(`${base}/api/lp${pad}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    nepOpenAi(echt, base, [
      { actie: 'geen', antwoord: 'Welke dienst wil je promoten?' },
      { actie: 'bouw', antwoord: 'Staat klaar.', titel: 'Ads: aanbouw', slug: 'ads-aanbouw', blueprint, slotData },
      { actie: 'tekst', antwoord: 'Kop korter.', slotWijzigingen: { heroTitle: 'Aanbouw in de Bollenstreek' } }
    ]);

    // 1. Sparren zonder pagina: er wordt niets in Notion gemaakt.
    let t = await wachtOpTaak(echt, base, cookie, (await post('/chat/bericht', { klant: 'macbouw', bericht: 'Ik wil een Ads pagina' })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    assert.equal(t.resultaat.pageId, null);
    assert.equal(opgeslagen.size, 0);

    // 2. Bouwen: pagina met eigen sjabloon en het hele gesprek.
    t = await wachtOpTaak(echt, base, cookie, (await post('/chat/bericht', { klant: 'macbouw', bericht: 'Aanbouw, offertes', berichten: t.resultaat.berichten })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    const pageId = t.resultaat.pageId;
    const p = opgeslagen.get(pageId);
    assert.equal(p.blueprint, 'chat');
    assert.equal(p.sjabloon.berichten.length, 4);
    assert.equal(p.content.slotData.heroTitle, 'Uw aanbouw in de Bollenstreek');
    assert.ok(t.resultaat.waarschuwingen.some((w) => /mediabibliotheek/.test(w)));

    // 3. Alleen tekst: sjabloon blijft gelijk, content wordt bijgewerkt.
    t = await wachtOpTaak(echt, base, cookie, (await post('/chat/bericht', { klant: 'macbouw', pageId, bericht: 'Maak de kop korter' })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    assert.equal(opgeslagen.get(pageId).content.slotData.heroTitle, 'Aanbouw in de Bollenstreek');
    assert.equal(opgeslagen.get(pageId).sjabloon.blueprint.htmlTemplate, blueprint.htmlTemplate);
    assert.equal(opgeslagen.get(pageId).sjabloon.berichten.length, 6);

    // 4. Lijst en openen.
    const lijst = await (await echt(`${base}/api/lp/chat/lijst?klant=macbouw`, { headers: { cookie } })).json();
    assert.equal(lijst.paginas.length, 1);
    const open = await (await echt(`${base}/api/lp/chat/${pageId}`, { headers: { cookie } })).json();
    assert.equal(open.berichten.length, 6);

    // 5. Voorbeeld en publiceren gebruiken het eigen sjabloon (de Sjablonen database wordt niet aangeroepen).
    const vb = await (await echt(`${base}/api/lp/pages/${pageId}/preview`, { headers: { cookie } })).json();
    assert.match(vb.html, /Aanbouw in de Bollenstreek/);
    const pub = await post(`/pages/${pageId}/publish`, {});
    assert.ok(pub.page, JSON.stringify(pub));
    const bp = await (await echt(`${base}/api/lp/clients/macbouw/blueprints/chat?pagina=${pageId}`, { headers: { cookie } })).json();
    assert.equal(bp.blueprint.htmlTemplate, blueprint.htmlTemplate);
  });
});

test('chat: lege berichten en een onbekende klant worden geweigerd', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    const post = (body) => echt(`${base}/api/lp/chat/bericht`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ klant: 'macbouw', bericht: '  ' })).status, 400);
    assert.equal((await post({ klant: 'bestaatniet', bericht: 'hoi' })).status, 400);
  });
});

test('chat: een eigen ontwerp voor een campagnepagina bewaart kanaal, zoekwoord en aanbieding', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    const post = (pad, body) => echt(`${base}/api/lp${pad}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    nepOpenAi(echt, base, [{ actie: 'bouw', antwoord: 'Staat klaar.', titel: 'Ads: aanbouw', slug: 'ads-aanbouw-eigen', blueprint, slotData }]);
    const campagne = { kanaal: 'meta', zoekwoord: 'aanbouw laten bouwen', aanbieding: 'gratis opname' };
    const t = await wachtOpTaak(echt, base, cookie, (await post('/chat/bericht', { klant: 'macbouw', bericht: 'Bouw een campagnepagina', campagne })).taakId);
    assert.equal(t.status, 'klaar', JSON.stringify(t));
    const p = opgeslagen.get(t.resultaat.pageId);
    assert.equal(p.blueprint, 'chat');
    assert.equal(p.invoer._soort, 'campagne');
    assert.equal(p.invoer._kanaal, 'meta');
    assert.equal(p.invoer._zoekwoord, 'aanbouw laten bouwen');
    assert.equal(p.invoer._aanbieding, 'gratis opname');
    assert.equal(p.invoer._gebouwdMetChat, true);
  });
});
