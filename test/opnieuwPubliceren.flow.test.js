// End to end test van "Pagina's opnieuw naar WordPress sturen": de lijst en het opnieuw versturen met behoud van de
// status. Notion, sjablonen en WordPress zijn nepversies in geheugen, de echte route code draait.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.LP_PASSWORD = 'test-wachtwoord';
process.env.SESSION_SECRET = 'test-geheim';
process.env.WP_URL_MACBOUW = 'https://klant.test';
process.env.WP_USERNAME_MACBOUW = 'u';
process.env.WP_APP_PASSWORD_MACBOUW = 'p';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const maak = (id, titel, wpPaginaId) => ({
  id, titel, klant: 'macbouw', blueprint: 'locatiegericht', status: 'Ter review', slug: id, wpPaginaId, wpUrl: wpPaginaId ? `https://klant.test/${id}/` : null, invoer: {},
  content: { slotData: { heroTitle: `Aannemer ${titel}`, ctaLabel: 'Vraag een offerte aan', ctaHref: '/contact/', reviewItems: [{ quote: 'Top' }] } }
});
const pages = { live: maak('live', 'Hillegom', 11), concept: maak('concept', 'Lisse', 12), nietInWp: maak('nietInWp', 'Voorhout', null) };
const aangeroepen = { setStatus: 0, updateSection: 0 };

mockModule('../src/lp/notion', {
  listPages: async () => Object.values(pages).map(({ content, invoer, ...samenvatting }) => samenvatting),
  getPage: async (id) => ({ ...pages[id], content: JSON.parse(JSON.stringify(pages[id].content)) }),
  updateSection: async () => { aangeroepen.updateSection += 1; },
  setStatus: async () => { aangeroepen.setStatus += 1; },
  setWordpressInfo: async () => {}
});
const sec = (n, b) => `<section class="${n}"><h2>${n}</h2>${b || ''}</section>`;
mockModule('../src/lp/templates', {
  getActiveTemplateByBlueprintId: async () => ({
    templateFormat: 'slots',
    htmlTemplate: '<section class="hero"><h1>{{heroTitle}}</h1><a href="{{ctaHref}}">{{ctaLabel}}</a></section>' + ['a', 'b', 'c', 'd', 'e'].map((n) => sec(n)).join('') + sec('ervaringen', '{{#each reviewItems}}<p>{{quote}}</p>{{/each}}') + sec('praktisch') + '<section class="contact">{{formulier}}</section>',
    cssTemplate: '',
    slots: [
      { key: 'heroTitle', label: 'Hero', type: 'text', verplicht: true },
      { key: 'ctaLabel', type: 'text' }, { key: 'ctaHref', type: 'text' },
      { key: 'reviewItems', type: 'list', itemFields: ['quote'] }
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

test('opnieuw naar WordPress sturen: lijst, versturen met behoud van status en twee offertebalken', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/lp/clients/macbouw/opnieuw-publiceren/lijst`, { method: 'POST' })).status, 401);
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (pad) => fetch(`${base}/api/lp${pad}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{}' });

    const lijst = await (await post('/clients/macbouw/opnieuw-publiceren/lijst')).json();
    assert.deepEqual(lijst.paginas.map((p) => p.id), ['live', 'concept'], 'alleen pagina\'s die in WordPress staan');
    assert.deepEqual(lijst.paginas.map((p) => p.wpStatus), ['publish', 'draft']);

    const r = await (await post('/pages/live/opnieuw-publiceren')).json();
    assert.equal(r.gepubliceerd, true);
    assert.equal(r.wpStatus, 'publish');
    assert.equal(r.ctaBalken, 2);
    const wpPost = wpAanroepen.find((a) => a.opts.method === 'POST' && a.url.includes('/pages/11'));
    const wpBody = JSON.parse(wpPost.opts.body);
    assert.ok(!('status' in wpBody), 'status mag niet worden meegestuurd');
    assert.equal((wpBody.content.match(/data-lp-cta-balk/g) || []).length, 2);
    assert.equal(aangeroepen.setStatus, 0, 'Notion status mag niet veranderen');
    assert.equal(aangeroepen.updateSection, 0, 'de tekst in Notion mag niet veranderen');

    const nietInWp = await post('/pages/nietInWp/opnieuw-publiceren');
    assert.equal(nietInWp.status, 400);
    assert.match((await nietInWp.json()).error, /nog niet in WordPress/);
  } finally {
    server.close();
    global.fetch = echteFetch;
  }
});
