// End to end test van de deellink: inloggen in de LP Fabriek, link maken, de link openen ZONDER
// inlog, de link intrekken, en controleren dat hij daarna niet meer werkt. Notion en de sjablonen
// zijn vervangen door een kleine in geheugen versie, verder draait de echte route code en een
// app die net als server.js is opgebouwd (inclusief de catch all route).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.LP_PASSWORD = 'test-wachtwoord';
process.env.SESSION_SECRET = 'test-geheim';
process.env.LP_SHARE_BASE_URL = 'https://portaal.test';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// In geheugen "Notion": twee pagina's, een met content en een zonder.
const store = { 'pagina-goed': '', 'pagina-leeg': '' };
const pages = {
  'pagina-goed': {
    id: 'pagina-goed', titel: 'Testival Tilburg', klant: 'test-klant', blueprint: 'festivals', slug: 'testival',
    content: { slotData: { heroTitle: 'Flowtest titel', heroImageSrc: 'https://example.com/a.jpg' } }
  },
  'pagina-leeg': { id: 'pagina-leeg', titel: 'Leeg', klant: 'test-klant', blueprint: 'festivals', slug: 'leeg', content: null }
};
mockModule('../src/lp/notion', {
  getPage: async (id) => {
    if (!pages[id]) throw new Error('Pagina niet gevonden');
    return { ...pages[id] };
  },
  getShare: async (id) => store[id] || '',
  setShare: async (id, value) => { store[id] = value; },
  findPageByShareToken: async (token) => {
    const id = Object.keys(store).find((k) => (store[k] || '').startsWith(token + '|'));
    return id ? { ...pages[id], deellink: store[id] } : null;
  }
});
mockModule('../src/lp/templates', {
  getActiveTemplateByBlueprintId: async () => ({
    templateFormat: 'slots',
    htmlTemplate: '<h1>{{heroTitle}}</h1><img src="{{heroImageSrc}}">',
    cssTemplate: '.lpt h1 { color: red; }',
    slots: [
      { key: 'heroTitle', type: 'text', verplicht: true },
      { key: 'heroImageSrc', type: 'text', verplicht: true }
    ]
  })
});

const lpRoutes = require('../src/routes/lp');
const shareRoutes = require('../src/routes/share');

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.use('/api/lp', lpRoutes);
  app.use('/voorbeeld', shareRoutes);
  app.get('*', (req, res) => res.status(200).send('INDEX HTML VAN HET PORTAAL'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('deellink flow: maken, openen zonder inlog, vervangen, intrekken', async () => {
  const { server, base } = await startApp();
  try {
    // Zonder inlog mag je geen link beheren.
    assert.equal((await fetch(`${base}/api/lp/pages/pagina-goed/deellink`)).status, 401);
    assert.equal((await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, { method: 'POST' })).status, 401);

    // Inloggen.
    const login = await fetch(`${base}/api/lp/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-wachtwoord' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const authed = (extra = {}) => ({ headers: { 'Content-Type': 'application/json', cookie }, ...extra });

    // Nog geen link.
    assert.deepEqual(await (await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed())).json(), { actief: false });

    // Pagina zonder content kan niet gedeeld worden.
    const leeg = await fetch(`${base}/api/lp/pages/pagina-leeg/deellink`, authed({ method: 'POST', body: '{}' }));
    assert.equal(leeg.status, 400);

    // Link maken voor 7 dagen.
    const created = await (await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed({ method: 'POST', body: JSON.stringify({ dagen: 7 }) }))).json();
    assert.equal(created.actief, true);
    assert.match(created.url, /^https:\/\/portaal\.test\/voorbeeld\/[A-Za-z0-9_-]{43}$/);
    const days = (Date.parse(created.verlooptOp) - Date.now()) / 86400000;
    assert.ok(days > 6.9 && days < 7.1, `verwacht ongeveer 7 dagen, kreeg ${days}`);
    const token = created.url.split('/').pop();

    // De klant opent de link zonder inlog (geen cookie), via het lokale adres.
    const open = await fetch(`${base}/voorbeeld/${token}`);
    assert.equal(open.status, 200);
    const body = await open.text();
    assert.ok(body.includes('Flowtest titel'));
    assert.ok(!body.includes('INDEX HTML VAN HET PORTAAL'));
    assert.ok(!body.includes('data-lp-slot'));

    // Status opnieuw opvragen geeft dezelfde link.
    const status = await (await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed())).json();
    assert.equal(status.url, created.url);

    // Een nieuwe link vervangt de oude: de oude werkt niet meer.
    const second = await (await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed({ method: 'POST', body: JSON.stringify({ dagen: 30 }) }))).json();
    const token2 = second.url.split('/').pop();
    assert.notEqual(token2, token);
    assert.equal((await fetch(`${base}/voorbeeld/${token}`)).status, 404);
    assert.equal((await fetch(`${base}/voorbeeld/${token2}`)).status, 200);

    // Intrekken: daarna 404 en de status is weer leeg.
    const revoked = await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed({ method: 'DELETE' }));
    assert.equal(revoked.status, 200);
    assert.equal((await fetch(`${base}/voorbeeld/${token2}`)).status, 404);
    assert.deepEqual(await (await fetch(`${base}/api/lp/pages/pagina-goed/deellink`, authed())).json(), { actief: false });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('deellink flow: een aan de klant gegeven link geeft nooit toegang tot de interne API', async () => {
  const { server, base } = await startApp();
  try {
    assert.equal((await fetch(`${base}/api/lp/pages`)).status, 401);
    assert.equal((await fetch(`${base}/api/lp/pages/pagina-goed`)).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
