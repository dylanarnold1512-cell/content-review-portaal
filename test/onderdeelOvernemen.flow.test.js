// End to end test van "Een onderdeel overnemen van een voorbeeldpagina". Notion, sjablonen en WordPress zijn nep.
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
const maak = (id, plaats, wpPaginaId, blueprint, projects) => ({
  id, titel: `Bouwbedrijf ${plaats}`, klant: 'macbouw', blueprint, status: 'Ter review', slug: id, wpPaginaId, wpUrl: wpPaginaId ? `https://klant.test/${id}/` : null,
  invoer: { plaatsnaam: plaats },
  content: { slotData: { heroTitle: `Verbouw in ${plaats}`, ...projects } }
});
const tuinhuis = { projectsTitle: 'Van oude schuur naar tuinhuis', projectsIntro: '', projectsItems: [{ title: 'Tuinhuis', location: 'Hillegom', imageSrc: 'https://klant.test/tuinhuis.png' }] };
const pages = {
  sassenheim: maak('sassenheim', 'Sassenheim', 10, 'locatiegericht', { projectsTitle: 'Recente projecten van MAC Bouw', projectsIntro: 'Een greep uit ons werk in de regio Sassenheim.', projectsItems: [{ imageSrc: 'https://klant.test/1.png' }, { imageSrc: 'https://klant.test/2.png' }, { imageSrc: 'https://klant.test/3.jpg' }] }),
  hillegom: maak('hillegom', 'Hillegom', 11, 'locatiegericht', tuinhuis),
  lisse: maak('lisse', 'Lisse', null, 'locatiegericht', tuinhuis),
  dakkapel: maak('dakkapel', 'Haarlem', 13, 'dakkapel', tuinhuis)
};
const opgeslagen = {};
mockModule('../src/lp/notion', {
  listPages: async () => Object.values(pages).map(({ content, invoer, ...s }) => s),
  getPage: async (id) => JSON.parse(JSON.stringify(pages[id])),
  updateSection: async (id, sectie, waarde) => { opgeslagen[id] = waarde; },
  setStatus: async () => {},
  setWordpressInfo: async () => {}
});
mockModule('../src/lp/templates', {
  getActiveTemplateByBlueprintId: async () => ({
    templateFormat: 'slots',
    htmlTemplate: '<section class="hero"><h1>{{heroTitle}}</h1></section><section class="projects"><h2>{{projectsTitle}}</h2><p>{{projectsIntro}}</p>{{#each projectsItems}}<figure><img src="{{imageSrc}}" alt=""><figcaption>{{title}}</figcaption></figure>{{/each}}</section>',
    cssTemplate: '',
    slots: [
      { key: 'heroTitle', label: 'Hero', type: 'text', verplicht: true },
      { key: 'projectsTitle', type: 'text' }, { key: 'projectsIntro', type: 'text' },
      { key: 'projectsItems', type: 'list', itemFields: ['title', 'location', 'imageSrc'] }
    ]
  })
});

const wpPosts = [];
const echteFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith('https://klant.test')) return echteFetch(url, opts);
  const json = (o) => ({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => o });
  if (opts.method === 'POST') {
    wpPosts.push({ url: String(url), body: JSON.parse(opts.body) });
    const id = Number(/pages\/(\d+)/.exec(url)[1]);
    return json({ id, link: `https://klant.test/p${id}/`, status: id === 11 ? 'publish' : 'draft' });
  }
  if (String(url).includes('include=')) return json([{ id: 10, status: 'publish' }, { id: 11, status: 'publish' }, { id: 13, status: 'draft' }]);
  return json({ id: 0, slug: 's', meta: {} });
};

const lpRoutes = require('../src/routes/lp');

test('onderdeel overnemen: lijst, onderdelen, overnemen en publiceren met behoud van status', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/lp/clients/macbouw/onderdeel-overnemen/lijst`, { method: 'POST' })).status, 401);
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (pad, body) => fetch(`${base}/api/lp${pad}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body || {}) });

    const lijst = await (await post('/clients/macbouw/onderdeel-overnemen/lijst')).json();
    assert.equal(lijst.paginas.length, 4);
    assert.equal(lijst.paginas.find((p) => p.id === 'lisse').wpStatus, 'niet gepubliceerd');

    const ond = await (await fetch(`${base}/api/lp/pages/sassenheim/onderdelen`, { headers: { cookie } })).json();
    const proj = ond.onderdelen.find((o) => o.id === 'projects');
    assert.deepEqual(proj.slots, ['projectsTitle', 'projectsIntro', 'projectsItems']);
    assert.ok(proj.inhoud.includes('3 items (3 met foto)'));

    const r = await (await post('/pages/hillegom/onderdeel-overnemen', { bronPageId: 'sassenheim', onderdeelId: 'projects', publiceer: true })).json();
    assert.equal(r.opgeslagen, true);
    assert.equal(r.gepubliceerd, true);
    assert.equal(r.wpStatus, 'publish');
    assert.match(r.melding, /Plaatsnaam 1 keer/);
    const sd = opgeslagen.hillegom.slotData;
    assert.equal(sd.heroTitle, 'Verbouw in Hillegom');
    assert.equal(sd.projectsTitle, 'Recente projecten van MAC Bouw');
    assert.equal(sd.projectsIntro, 'Een greep uit ons werk in de regio Hillegom.');
    assert.equal(sd.projectsItems.length, 3);
    const wp = wpPosts.find((p) => p.url.includes('/pages/11'));
    assert.ok(!('status' in wp.body), 'status mag niet worden meegestuurd');
    assert.equal((wp.body.content.match(/<figure>/g) || []).length, 3);

    const lisse = await (await post('/pages/lisse/onderdeel-overnemen', { bronPageId: 'sassenheim', onderdeelId: 'projects', publiceer: true })).json();
    assert.equal(lisse.gepubliceerd, false);
    assert.match(lisse.melding, /nog niet in WordPress/);

    const ander = await post('/pages/dakkapel/onderdeel-overnemen', { bronPageId: 'sassenheim', onderdeelId: 'projects', publiceer: true });
    assert.equal(ander.status, 400);
    assert.match((await ander.json()).error, /Andere opbouw/);
    assert.equal(opgeslagen.dakkapel, undefined);
  } finally {
    server.close();
    global.fetch = echteFetch;
  }
});
