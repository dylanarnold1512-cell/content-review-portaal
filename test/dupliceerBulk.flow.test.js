// End to end test van "Een pagina in bulk dupliceren": alleen de plaats verandert, de tekst blijft. Notion is nep.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.SESSION_SECRET = 'test-geheim';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const bron = {
  id: 'hillegom', titel: 'Aannemer Hillegom', klant: 'macbouw', blueprint: 'locatiegericht', status: 'Ter review', slug: 'aannemer-hillegom',
  invoer: { plaatsnaam: 'Hillegom' },
  feitensheet: null,
  content: {
    meta: { metaTitle: 'Aannemer in Hillegom | MAC Bouw', metaDescription: 'Aannemer in Hillegom voor verbouw.' },
    slotData: {
      heroTitle: 'Aannemer in Hillegom',
      intro: 'Wij bouwen en verbouwen in Hillegom en omstreken.',
      heroImageSrc: 'https://klant.test/hillegom-foto.jpg',
      ctaHref: '/contact/hillegom/'
    },
    overrides: {}
  }
};
const paginas = { hillegom: bron };
const aangemaakt = [];
const inhoud = {};
let teller = 0;
mockModule('../src/lp/notion', {
  listPages: async () => Object.values(paginas),
  getPage: async (id) => JSON.parse(JSON.stringify(paginas[id])),
  createPage: async (data) => {
    teller += 1;
    const id = `nieuw${teller}`;
    aangemaakt.push({ id, ...data });
    paginas[id] = { id, ...data, status: 'Formulier ingevuld' };
    return { id };
  },
  updateSection: async (id, sectie, waarde) => { inhoud[`${id}:${sectie}`] = waarde; },
  setStatus: async () => {},
  setWordpressInfo: async () => {}
});

const lpRoutes = require('../src/routes/lp');

test('bulk dupliceren: tekst mee met alleen de plaats vervangen, of alleen de opzet', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieSession({ name: 'portal_session', keys: ['test-geheim'] }));
  app.post('/test-login', (req, res) => { req.session.isAdmin = true; res.json({ ok: true }); });
  app.use('/api/lp', lpRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/test-login`, { method: 'POST' });
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const post = (pad, body) => fetch(`${base}/api/lp${pad}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body || {}) });

    const r = await (await post('/pages/hillegom/dupliceer-meerdere', { plaatsen: ['Lisse', 'Sassenheim'], modus: 'kopieer' })).json();
    assert.equal(r.resultaten.length, 2);
    assert.ok(r.resultaten.every((x) => !x.fout && x.modus === 'kopieer'));
    const lisse = aangemaakt.find((p) => p.invoer.plaatsnaam === 'Lisse');
    assert.equal(lisse.titel, 'Aannemer Lisse');
    const tekst = inhoud[`${lisse.id}:content`];
    assert.equal(tekst.slotData.heroTitle, 'Aannemer in Lisse');
    assert.equal(tekst.slotData.intro, 'Wij bouwen en verbouwen in Lisse en omstreken.');
    assert.equal(tekst.meta.metaTitle, 'Aannemer in Lisse | MAC Bouw');
    assert.equal(tekst.slotData.heroImageSrc, 'https://klant.test/hillegom-foto.jpg');
    assert.equal(tekst.slotData.ctaHref, '/contact/hillegom/');
    assert.equal(paginas.hillegom.content.slotData.heroTitle, 'Aannemer in Hillegom', 'de voorbeeldpagina blijft ongewijzigd');

    const aantalVoor = aangemaakt.length;
    const opzet = await (await post('/pages/hillegom/dupliceer-meerdere', { plaatsen: ['Noordwijkerhout'] })).json();
    assert.equal(opzet.resultaten[0].modus, 'opzet');
    assert.equal(aangemaakt.length, aantalVoor + 1);
    assert.equal(inhoud[`${aangemaakt[aantalVoor].id}:content`], undefined, 'bij alleen de opzet wordt geen tekst gekopieerd');

    const veel = Array.from({ length: 35 }, (_, i) => `Plaats ${i + 1}`);
    const vol = await (await post('/pages/hillegom/dupliceer-meerdere', { plaatsen: veel, modus: 'kopieer' })).json();
    assert.equal(vol.resultaten.length, 30);
  } finally {
    server.close();
  }
});
