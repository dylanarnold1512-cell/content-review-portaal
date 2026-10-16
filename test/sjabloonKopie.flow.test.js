// End to end test van "Sjabloon dupliceren" met een nep Notion in geheugen; de echte route draait.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.LP_PASSWORD = 'test-wachtwoord';
process.env.SESSION_SECRET = 'test-geheim';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const blueprint = {
  templateFormat: 'slots',
  htmlTemplate: '<section class="hero"><h1>{{heroTitle}}</h1></section><section class="a"><p>{{intro}}</p></section><section class="contact">{{formulier}}</section>',
  cssTemplate: '.hero{background:#123}',
  slots: [{ key: 'heroTitle', label: 'Hero', type: 'text', verplicht: true }, { key: 'intro', type: 'text' }],
  voorbeeldSlotData: { heroTitle: 'Voorbeeld', intro: 'Tekst' }
};
const opgeslagen = [];
const lijst = [{ id: 't1', naam: 'Locatiegericht', klant: 'macbouw', blueprintId: 'locatiegericht', status: 'Actief' }];
mockModule('../src/lp/templates', {
  getTemplate: async (id) => ({ ...lijst.find((t) => t.id === id), blueprint: JSON.parse(JSON.stringify(blueprint)) }),
  listTemplates: async () => lijst,
  createTemplate: async (t) => { opgeslagen.push(t); return { id: 'nieuw', naam: t.naam, klant: t.klant, blueprintId: t.blueprintId, status: t.status, blueprint: t.blueprint }; }
});

const lpRoutes = require('../src/routes/lp');

test('sjabloon dupliceren via de route: kopie als Concept met dezelfde opzet', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/lp/templates/t1/dupliceer`, { method: 'POST' })).status, 401);
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (naam) => fetch(`${base}/api/lp/templates/t1/dupliceer`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ naam }) });

    const ok = await post('Dakkapel');
    assert.equal(ok.status, 200);
    const { template } = await ok.json();
    assert.equal(template.blueprintId, 'dakkapel');
    assert.equal(template.status, 'Concept');
    assert.equal(opgeslagen.length, 1);
    assert.equal(opgeslagen[0].blueprint.cssTemplate, blueprint.cssTemplate);
    assert.equal(opgeslagen[0].blueprint.htmlTemplate, blueprint.htmlTemplate);

    const dubbel = await post('Locatiegericht');
    assert.equal(dubbel.status, 400);
    assert.match((await dubbel.json()).error, /al een sjabloon/);
    assert.equal(opgeslagen.length, 1, 'bij een fout wordt er niets aangemaakt');
  } finally { server.close(); }
});
