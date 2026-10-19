// De routes voor de redactiecheck en het herschrijven, met een nep Notion en een nep OpenAI.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cookieSession = require('cookie-session');

process.env.LP_PASSWORD = 'test-wachtwoord';
process.env.SESSION_SECRET = 'test-geheim';
process.env.OPENAI_API_KEY = 'test';

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const blueprint = {
  templateFormat: 'slots',
  htmlTemplate: '<h1>{{heroTitle}}</h1><p>{{heroIntro}}</p>{{#each uspItems}}{{title}}{{text}}{{/each}}{{#each faqItems}}{{question}}{{answer}}{{/each}}{{formulier}}',
  cssTemplate: '',
  slots: [
    { key: 'heroTitle', type: 'text', verplicht: true }, { key: 'heroIntro', type: 'text' },
    { key: 'uspItems', type: 'list', itemFields: ['title', 'text'] },
    { key: 'faqItems', type: 'list', itemFields: ['question', 'answer'] },
    { key: 'ctaLabel', type: 'text' }, { key: 'ctaHref', type: 'text' }
  ]
};
const pagina = {
  id: 'p1', klant: 'macbouw', blueprint: 'locatiegericht', titel: 'Dakkapel Hillegom', invoer: {}, feitensheet: { gebruikt: [], extra: [] },
  content: {
    meta: { metaTitle: 't', metaDescription: 'd' },
    slotData: {
      heroTitle: 'Dakkapel in Hillegom', heroIntro: 'MAC Bouw voert dakkapellen uit voor opdrachtgevers.',
      uspItems: [{ title: 'Snel', text: 'Hoogwaardige kwaliteit en excellentie in elk detail van het werk.' }, { title: 'Netjes', text: 'U weet vooraf wat het kost en wanneer wij komen met het werk.' }],
      faqItems: [{ question: 'Vergunning?', answer: 'Dat bespreken we samen met je voor we beginnen met het werk.' }]
    }
  }
};
const bewaard = [];
mockModule('../src/lp/notion', {
  getPage: async () => JSON.parse(JSON.stringify(pagina)),
  updateSection: async (id, sectie, waarde) => { bewaard.push({ id, sectie, waarde }); },
  listPages: async () => []
});
mockModule('../src/lp/templates', { getActiveTemplateByBlueprintId: async () => JSON.parse(JSON.stringify(blueprint)), listTemplates: async () => [] });
mockModule('../src/lp/siteTeksten', {
  haalSiteTeksten: async () => ({ paginas: [], gefilterd: [] }), formatSiteTekstenVoorPrompt: () => '', normaliseerUrl: (u) => u,
  hoofdTekst: () => '', kiesUrls: () => [], kapAfOpWoorden: (t) => t, telWoorden: () => 0, OVERSLAAN_RE: /x/
});

const lpRoutes = require('../src/routes/lp');

async function metServer(fn) {
  const app = express();
  app.use(express.json());
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
    const a = antwoorden.shift();
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(a) } }] }) };
  };
}

test('de controle bevat redactiepunten met een herschrijfknop en meldt een ontbrekend klantverhaal', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    const res = await echt(`${base}/api/lp/pages/p1/controle`, { headers: { cookie } });
    const c = await res.json();
    assert.equal(res.status, 200, JSON.stringify(c));
    const punten = c.letOp.filter((p) => (p.acties || []).some((a) => a.type === 'herschrijf'));
    assert.ok(punten.some((p) => /bedrijfsnaam|Lege woorden|wisselt|afstandelijk/i.test(p.tekst)), JSON.stringify(c.letOp.map((p) => p.tekst)));
    assert.ok(c.letOp.some((p) => /nog geen goedgekeurd klantverhaal/.test(p.tekst)));
  });
});

test('herschrijf past alleen de gevraagde onderdelen aan en bewaart de rest', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    nepOpenAi(echt, base, [{ slotData: { uspItems: [{ title: 'Snel', text: 'Je weet binnen een week wanneer we komen.' }, { title: 'Netjes', text: 'We ruimen elke dag op.' }], heroTitle: 'mag niet' } }]);
    const res = await echt(`${base}/api/lp/pages/p1/herschrijf`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: ['uspItems'], aanwijzing: 'Persoonlijker.' }) });
    const r = await res.json();
    assert.equal(res.status, 200, JSON.stringify(r));
    assert.deepEqual(r.gewijzigd, ['uspItems']);
    assert.equal(r.slotData.heroTitle, 'Dakkapel in Hillegom');
    const opgeslagen = bewaard[bewaard.length - 1];
    assert.equal(opgeslagen.sectie, 'content');
    assert.equal(opgeslagen.waarde.meta.metaTitle, 't');
    assert.match(opgeslagen.waarde.slotData.uspItems[0].text, /binnen een week/);
  });
});

test('redactie-check geeft de verbeterpunten van de tweede lezer terug', async () => {
  await metServer(async ({ base, cookie, echt }) => {
    nepOpenAi(echt, base, [{ verbeteringen: [{ slots: ['heroIntro'], probleem: 'Klinkt als een brochure.', aanwijzing: 'Schrijf persoonlijker.' }] }]);
    const res = await echt(`${base}/api/lp/pages/p1/redactie-check`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{}' });
    const r = await res.json();
    assert.equal(res.status, 200, JSON.stringify(r));
    assert.equal(r.punten.length, 1);
    assert.deepEqual(r.punten[0].slots, ['heroIntro']);
    assert.ok(r.aantalMechanisch >= 1);
  });
});
