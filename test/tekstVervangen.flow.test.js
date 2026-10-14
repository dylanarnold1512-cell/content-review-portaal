// End to end test van "Tekst vervangen bij alle pagina's van een klant": zoeken, vervangen per pagina, en
// WordPress bijwerken zonder de status te veranderen. Notion, sjablonen en WordPress zijn nepversies in geheugen,
// de echte route code draait.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.SESSION_SECRET = 'test-geheim';
process.env.WP_URL_MACBOUW = 'https://klant.test';
process.env.WP_USERNAME_MACBOUW = 'u';
process.env.WP_APP_PASSWORD_MACBOUW = 'p';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const VULZIN = 'MAC Bouw toont uiteenlopende projecten, van verbouw en timmerwerk tot werkzaamheden buiten de woning.';
const maak = (id, titel, wpPaginaId, intro) => ({
  id, titel, klant: 'macbouw', blueprint: 'locatiegericht', status: 'Ter review', slug: id, wpPaginaId, wpUrl: wpPaginaId ? `https://klant.test/${id}/` : null, invoer: {},
  content: { slotData: { heroTitle: `Aannemer ${titel}`, projectsIntro: intro } }
});
const pages = {
  live: maak('live', 'Hillegom', 11, VULZIN),
  concept: maak('concept', 'Lisse', 12, VULZIN),
  schoon: maak('schoon', 'Sassenheim', 13, 'Dakterrassen en tuinhuizen in de buurt.'),
  nietInWp: maak('nietInWp', 'Voorhout', null, VULZIN)
};
const aangeroepen = { setStatus: 0, updateSection: [] };

mockModule('../src/lp/notion', {
  listPages: async () => Object.values(pages).map(({ content, invoer, ...samenvatting }) => samenvatting),
  getPage: async (id) => ({ ...pages[id], content: JSON.parse(JSON.stringify(pages[id].content)) }),
  updateSection: async (id, sectie, waarde) => { aangeroepen.updateSection.push(id); pages[id][sectie] = waarde; return pages[id]; },
  setStatus: async () => { aangeroepen.setStatus += 1; },
  setWordpressInfo: async () => {}
});
mockModule('../src/lp/templates', {
  getActiveTemplateByBlueprintId: async () => ({
    templateFormat: 'slots',
    htmlTemplate: '<h1>{{heroTitle}}</h1><p>{{projectsIntro}}</p>',
    cssTemplate: '',
    slots: [
      { key: 'heroTitle', label: 'Hero hoofdtitel', type: 'text', verplicht: true },
      { key: 'projectsIntro', label: 'Projecten introductie', type: 'text', verplicht: false }
    ]
  })
});

const wpAanroepen = [];
const echteFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith('https://klant.test')) return echteFetch(url, opts);
  wpAanroepen.push({ url: String(url), opts });
  const json = (o) => ({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => o });
  if (opts.method === 'POST') {
    const id = Number(/pages\/(\d+)/.exec(url)[1]);
    return json({ id, link: `https://klant.test/p${id}/`, status: id === 11 ? 'publish' : 'draft' });
  }
  if (String(url).includes('include=')) return json([{ id: 11, status: 'publish' }, { id: 12, status: 'draft' }]);
  return json({ id: 0, slug: 's', meta: {} });
};

const lpRoutes = require('../src/routes/lp');

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('tekst vervangen: zoeken, per pagina vervangen en een live pagina blijft live', async () => {
  const { server, base } = await startApp();
  try {
    // Zonder inlog mag het niet.
    assert.equal((await fetch(`${base}/api/lp/clients/macbouw/tekst-vervangen/zoek`, { method: 'POST' })).status, 401);
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (pad, body) => fetch(`${base}/api/lp${pad}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });

    // 1. Zoeken: drie van de vier pagina's bevatten de tekst, met de echte WordPress status.
    const zoek = await (await post('/clients/macbouw/tekst-vervangen/zoek', { zoek: 'toont uiteenlopende projecten' })).json();
    assert.equal(zoek.totaalGescand, 4);
    assert.deepEqual(zoek.paginas.map((p) => p.id).sort(), ['concept', 'live', 'nietInWp']);
    const perId = Object.fromEntries(zoek.paginas.map((p) => [p.id, p]));
    assert.equal(perId.live.wpStatus, 'publish');
    assert.equal(perId.concept.wpStatus, 'draft');
    assert.equal(perId.nietInWp.wpStatus, 'niet gepubliceerd');
    assert.deepEqual(perId.live.velden, ['projectsIntro']);
    assert.equal(aangeroepen.updateSection.length, 0, 'zoeken mag niets aanpassen');

    // 2. Een zin die te kort is wordt geweigerd.
    assert.equal((await post('/clients/macbouw/tekst-vervangen/zoek', { zoek: 'ab' })).status, 400);

    // 3. Vervangen bij de live pagina, hele veld leegmaken en WordPress bijwerken.
    const body = { zoek: 'toont uiteenlopende projecten', vervang: '', slotKey: 'projectsIntro', heleVeld: true, publiceer: true };
    const r = await (await post('/pages/live/tekst-vervangen', body)).json();
    assert.equal(r.aantal, 1);
    assert.equal(r.opgeslagen, true);
    assert.equal(r.gepubliceerd, true);
    assert.equal(r.wpStatus, 'publish');
    assert.equal(pages.live.content.slotData.projectsIntro, '');
    const wpPost = wpAanroepen.find((a) => a.opts.method === 'POST' && a.url.includes('/pages/11'));
    const wpBody = JSON.parse(wpPost.opts.body);
    assert.ok(!('status' in wpBody), 'status mag niet worden meegestuurd bij een live pagina');
    assert.ok(!wpBody.content.includes('uiteenlopende'), 'de oude zin mag niet meer naar WordPress');
    assert.equal(aangeroepen.setStatus, 0, 'de Notion status mag niet veranderen');

    // 4. Pagina die niet in WordPress staat: alleen het portaal, met een duidelijke melding.
    const n = await (await post('/pages/nietInWp/tekst-vervangen', body)).json();
    assert.equal(n.opgeslagen, true);
    assert.equal(n.gepubliceerd, false);
    assert.match(n.melding, /nog niet in WordPress/);

    // 5. Zonder publiceren blijft WordPress onaangeroerd.
    const voor = wpAanroepen.length;
    const c = await (await post('/pages/concept/tekst-vervangen', { ...body, publiceer: false })).json();
    assert.equal(c.opgeslagen, true);
    assert.equal(c.gepubliceerd, false);
    assert.equal(wpAanroepen.length, voor);

    // 6. Een tweede keer: de tekst staat er niet meer, er wordt niets opnieuw gepubliceerd.
    const nogmaals = await (await post('/pages/live/tekst-vervangen', body)).json();
    assert.equal(nogmaals.aantal, 0);
    assert.equal(nogmaals.opgeslagen, false);

    // 7. Een verplicht veld leegmaken wordt geweigerd en niets wordt opgeslagen.
    const opgeslagenVoor = aangeroepen.updateSection.length;
    const fout = await post('/pages/schoon/tekst-vervangen', { zoek: 'Aannemer Sassenheim', vervang: '', slotKey: 'heroTitle', heleVeld: true, publiceer: true });
    assert.equal(fout.status, 400);
    assert.match((await fout.json()).error, /Niet aangepast/);
    assert.equal(aangeroepen.updateSection.length, opgeslagenVoor);
  } finally {
    server.close();
    global.fetch = echteFetch;
  }
});
