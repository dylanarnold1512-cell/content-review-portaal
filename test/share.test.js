// Tests voor de deelbare voorbeeldlink (src/lp/share.js, src/routes/share.js, src/lp/pageRender.js)
// en de knop in de LP Fabriek UI. Draait zonder Notion: de route krijgt nepversies van
// lpNotion en templates mee.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const share = require('../src/lp/share');
const { buildRenderPage, contentIsEmpty } = require('../src/lp/pageRender');
const { createShareRouter } = require('../src/routes/share');

// ---- share.js ----
test('createToken geeft een geldig, uniek token van 43 tekens', () => {
  const a = share.createToken();
  const b = share.createToken();
  assert.equal(a.length, 43);
  assert.ok(share.isValidTokenShape(a));
  assert.notEqual(a, b);
});

test('isValidTokenShape weigert vreemde invoer', () => {
  assert.equal(share.isValidTokenShape(''), false);
  assert.equal(share.isValidTokenShape('kort'), false);
  assert.equal(share.isValidTokenShape('a'.repeat(43) + '!'), false);
  assert.equal(share.isValidTokenShape('a'.repeat(42) + '/'), false);
  assert.equal(share.isValidTokenShape(undefined), false);
  assert.equal(share.isValidTokenShape(null), false);
  assert.equal(share.isValidTokenShape({}), false);
});

test('clampDays houdt het aantal dagen tussen 1 en 90 en valt terug op 14', () => {
  assert.equal(share.clampDays(30), 30);
  assert.equal(share.clampDays(0), 1);
  assert.equal(share.clampDays(-5), 1);
  assert.equal(share.clampDays(500), 90);
  assert.equal(share.clampDays('abc'), 14);
  assert.equal(share.clampDays(undefined), 14);
});

test('buildShareValue en parseShareValue werken samen, en beschadigde waarden geven null', () => {
  const token = share.createToken();
  const expiry = share.computeExpiry(7, new Date('2026-09-21T10:00:00Z'));
  assert.equal(expiry, '2026-09-28T10:00:00.000Z');
  const parsed = share.parseShareValue(share.buildShareValue(token, expiry));
  assert.deepEqual(parsed, { token, expiresAt: expiry });
  assert.equal(share.parseShareValue(''), null);
  assert.equal(share.parseShareValue(null), null);
  assert.equal(share.parseShareValue('onzin'), null);
  assert.equal(share.parseShareValue(token + '|geen-datum'), null);
  assert.equal(share.parseShareValue('kort|2026-09-28T10:00:00.000Z'), null);
});

test('isExpired vergelijkt met de opgegeven tijd', () => {
  const expiry = '2026-09-28T10:00:00.000Z';
  assert.equal(share.isExpired(expiry, new Date('2026-09-27T10:00:00Z')), false);
  assert.equal(share.isExpired(expiry, new Date('2026-09-28T10:00:00Z')), true);
  assert.equal(share.isExpired(expiry, new Date('2026-10-01T10:00:00Z')), true);
});

test('tokensMatch is true alleen bij exact hetzelfde token', () => {
  const t = share.createToken();
  assert.equal(share.tokensMatch(t, t), true);
  assert.equal(share.tokensMatch(t, share.createToken()), false);
  assert.equal(share.tokensMatch(t, t + 'x'), false);
});

test('getPublicBaseUrl: eigen domein gaat voor Render, en zonder env wordt het verzoekadres gebruikt', () => {
  const req = { get: () => 'portaal.example.nl' };
  assert.equal(
    share.getPublicBaseUrl(req, { LP_SHARE_BASE_URL: 'https://voorbeeld.klant.nl/', RENDER_EXTERNAL_URL: 'https://x.onrender.com' }),
    'https://voorbeeld.klant.nl'
  );
  assert.equal(share.getPublicBaseUrl(req, { RENDER_EXTERNAL_URL: 'https://x.onrender.com' }), 'https://x.onrender.com');
  assert.equal(share.getPublicBaseUrl(req, {}), 'https://portaal.example.nl');
  assert.equal(share.getPublicBaseUrl({ get: () => 'localhost:3000' }, {}), 'http://localhost:3000');
  assert.equal(share.buildShareUrl('https://a.nl/', 'TOKEN'), 'https://a.nl/voorbeeld/TOKEN');
});

test('wrapSharedDoc: noindex, titel geescaped, inhoud en uitleg aanwezig', () => {
  const doc = share.wrapSharedDoc({ title: '<script>alert(1)</script>', html: '<p id="inhoud">Hallo</p>', expiresAt: '2026-09-28T10:00:00.000Z' });
  assert.match(doc, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.ok(!doc.includes('<script>alert(1)</script>'));
  assert.ok(doc.includes('&lt;script&gt;'));
  assert.ok(doc.includes('<p id="inhoud">Hallo</p>'));
  assert.match(doc, /Header, menu en footer komen van jullie eigen site/);
  assert.match(doc, /geldig tot 28 september 2026/);
});

// ---- pageRender.js ----
test('buildRenderPage en contentIsEmpty kennen het slot pad en het blokken pad', () => {
  const slotBp = { templateFormat: 'slots' };
  assert.deepEqual(buildRenderPage({ blueprint: slotBp, content: { slotData: { a: 1 } }, clientId: 'k', slug: 's' }), {
    clientId: 'k', slug: 's', template: slotBp, slotData: { a: 1 }
  });
  assert.deepEqual(buildRenderPage({ blueprint: {}, content: { blocks: [{ type: 'x' }] }, clientId: 'k', slug: 's' }), {
    clientId: 'k', slug: 's', blocks: [{ type: 'x' }]
  });
  assert.equal(contentIsEmpty(slotBp, null), true);
  assert.equal(contentIsEmpty(slotBp, { slotData: {} }), true);
  assert.equal(contentIsEmpty(slotBp, { slotData: { a: 1 } }), false);
  assert.equal(contentIsEmpty({}, { blocks: [] }), true);
  assert.equal(contentIsEmpty({}, { blocks: [{}] }), false);
});

// ---- publieke route ----
const BLUEPRINT = {
  templateFormat: 'slots',
  htmlTemplate: '<h1>{{heroTitle}}</h1><img src="{{heroImageSrc}}">',
  cssTemplate: '.lpt h1 { color: red; }',
  slots: [
    { key: 'heroTitle', type: 'text', verplicht: true },
    { key: 'heroImageSrc', type: 'text', verplicht: true }
  ]
};

async function withServer(deps, fn) {
  const app = express();
  app.use('/voorbeeld', createShareRouter(deps));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function makeDeps({ token, expiresAt, content, blueprint = BLUEPRINT, deellink, throwError } = {}) {
  const value = deellink !== undefined ? deellink : share.buildShareValue(token, expiresAt);
  return {
    now: () => new Date('2026-09-21T10:00:00Z'),
    lpNotion: {
      findPageByShareToken: async (t) => {
        if (throwError) throw new Error('GEHEIME NOTION FOUT');
        return t === token
          ? { id: 'pagina-1', titel: 'Testival Tilburg', klant: 'test-klant', blueprint: 'festivals', slug: 'testival', content, deellink: value }
          : null;
      }
    },
    templates: { getActiveTemplateByBlueprintId: async () => blueprint }
  };
}

const GOOD_CONTENT = { slotData: { heroTitle: 'Overnachten in Tilburg', heroImageSrc: 'https://example.com/a.jpg' } };

test('route: geldige link toont de pagina, zonder klikbare voorbeeld markeringen en met de juiste headers', async () => {
  const token = share.createToken();
  const deps = makeDeps({ token, expiresAt: '2026-09-28T10:00:00.000Z', content: GOOD_CONTENT });
  await withServer(deps, async (base) => {
    const res = await fetch(`${base}/voorbeeld/${token}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.text();
    assert.ok(body.includes('Overnachten in Tilburg'));
    assert.ok(!body.includes('data-lp-slot'));
    assert.ok(!body.includes('data-lp-text-slot'));
    assert.ok(!body.includes('<!-- wp:html -->'));
    assert.match(body, /noindex, nofollow/);
  });
});

test('route: verkeerde vorm, onbekend token en niet passend token geven 404', async () => {
  const token = share.createToken();
  const deps = makeDeps({ token, expiresAt: '2026-09-28T10:00:00.000Z', content: GOOD_CONTENT });
  await withServer(deps, async (base) => {
    assert.equal((await fetch(`${base}/voorbeeld/kort`)).status, 404);
    assert.equal((await fetch(`${base}/voorbeeld/${share.createToken()}`)).status, 404);
  });
  // Notion vindt de pagina, maar het opgeslagen token wijkt af (bijvoorbeeld handmatig aangepast).
  const other = share.createToken();
  const wrongDeps = makeDeps({ token, deellink: share.buildShareValue(other, '2026-09-28T10:00:00.000Z'), content: GOOD_CONTENT });
  await withServer(wrongDeps, async (base) => {
    assert.equal((await fetch(`${base}/voorbeeld/${token}`)).status, 404);
  });
});

test('route: verlopen link geeft 410 en toont geen inhoud', async () => {
  const token = share.createToken();
  const deps = makeDeps({ token, expiresAt: '2026-09-20T10:00:00.000Z', content: GOOD_CONTENT });
  await withServer(deps, async (base) => {
    const res = await fetch(`${base}/voorbeeld/${token}`);
    assert.equal(res.status, 410);
    const body = await res.text();
    assert.match(body, /verlopen/);
    assert.ok(!body.includes('Overnachten in Tilburg'));
  });
});

test('route: pagina zonder content geeft 404', async () => {
  const token = share.createToken();
  const deps = makeDeps({ token, expiresAt: '2026-09-28T10:00:00.000Z', content: null });
  await withServer(deps, async (base) => {
    assert.equal((await fetch(`${base}/voorbeeld/${token}`)).status, 404);
  });
});

test('route: een interne fout geeft 500 zonder de foutmelding te lekken', async () => {
  const token = share.createToken();
  const deps = makeDeps({ token, expiresAt: '2026-09-28T10:00:00.000Z', content: GOOD_CONTENT, throwError: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/voorbeeld/${token}`);
      assert.equal(res.status, 500);
      assert.ok(!(await res.text()).includes('GEHEIME NOTION FOUT'));
    });
  } finally {
    console.error = originalError;
  }
});

// ---- UI en verdrading ----
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('UI: de deellink knoppen bestaan in lp.html en zijn gekoppeld in lp.js', () => {
  for (const id of ['lpShareBox', 'lpShareCreateBtn', 'lpShareCopyBtn', 'lpShareOpenBtn', 'lpShareRevokeBtn', 'lpShareUrl', 'lpShareDagen', 'lpShareStatus']) {
    assert.ok(html.includes(`id="${id}"`), `${id} ontbreekt in lp.html`);
  }
  for (const id of ['lpShareCreateBtn', 'lpShareCopyBtn', 'lpShareOpenBtn', 'lpShareRevokeBtn']) {
    assert.ok(js.includes(`getElementById('${id}')`), `${id} is niet gekoppeld in lp.js`);
  }
  assert.ok(js.includes('loadShareStatus();'), 'loadShareStatus wordt niet aangeroepen bij het openen van een pagina');
});

test('server: /voorbeeld staat VOOR de catch all route, anders wordt de link door index.html opgevangen', () => {
  const mount = serverSrc.indexOf("app.use('/voorbeeld'");
  const catchAll = serverSrc.indexOf("app.get('*'");
  assert.ok(mount > -1, "app.use('/voorbeeld') ontbreekt in server.js");
  assert.ok(catchAll > -1 && mount < catchAll);
});
