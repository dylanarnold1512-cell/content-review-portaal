// Tests voor meting per pagina, updatevoorstellen en zoekvolume (Pagr. stap 6, 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwGoogle, haalGoogle, bouwAiPerUrl, haalAi, verrijkMetMeting, trend, schoon } = require('../src/lp/meting');
const { maakUpdateVoorstellen } = require('../src/lp/bijhouden');
const zoekvolume = require('../src/lp/zoekvolume');
const { maakPlanVoorstel } = require('../src/lp/plan');

test('bouwGoogle zet rijen om per schone url en negeert andere periodes', () => {
  const g = bouwGoogle([
    { url: 'https://x.nl/haarlem/?utm=1', periode_type: '28d', vertoningen: '120', klikken: 9, positie: 7.234, vorige_vertoningen: 100, vorige_klikken: 12 },
    { url: 'https://x.nl/oud', periode_type: '90d', vertoningen: 5 }
  ]);
  assert.deepEqual(Object.keys(g), ['https://x.nl/haarlem']);
  assert.equal(g['https://x.nl/haarlem'].positie, 7.2);
  assert.equal(g['https://x.nl/haarlem'].vertoningen, 120);
});

test('haalGoogle is niet beschikbaar zonder tabel of bij een fout, en nooit een fout', async () => {
  assert.equal((await haalGoogle('k1', { tabelId: '' })).beschikbaar, false);
  const kapot = await haalGoogle('k2', { tabelId: 'T', tabelFn: async () => { throw new Error('n8n plat'); } });
  assert.equal(kapot.beschikbaar, false);
  const ok = await haalGoogle('k3', { tabelId: 'T', tabelFn: async () => [{ url: 'https://x.nl/a', vertoningen: 3 }] });
  assert.equal(ok.beschikbaar, true);
});

test('bouwAiPerUrl telt citaties per pagina en vragen waar het merk genoemd wordt', () => {
  const r = bouwAiPerUrl({ vragen: [
    { vraag: 'Wie plaatst dakkapellen?', chatgpt: { genoemd: 1, geciteerd: 1 }, gemini: { genoemd: 0, geciteerd: 0 }, urls: ['https://x.nl/dakkapel/'] },
    { vraag: 'Kosten zolder', chatgpt: { genoemd: 0, geciteerd: 0 }, gemini: { genoemd: 0, geciteerd: 0 }, urls: [] }
  ] });
  assert.equal(r.perUrl['https://x.nl/dakkapel'].geciteerd, 1);
  assert.deepEqual(r.totaal, { vragen: 2, genoemd: 1 });
});

test('haalAi zonder status ok is niet beschikbaar', async () => {
  const r = await haalAi('Klant', { aiVragenFn: async () => ({ status: 'leeg', vragen: [] }) });
  assert.equal(r.beschikbaar, false);
});

test('trend: alleen bij genoeg klikken in de vorige periode', () => {
  assert.equal(trend(5, 10), 'onbekend');
  assert.equal(trend(10, 40), 'zakt');
  assert.equal(trend(60, 40), 'stijgt');
  assert.equal(trend(41, 40), 'stabiel');
});

test('verrijkMetMeting koppelt alleen live pagina\'s en geeft nullen als er geen rij is', () => {
  const google = { beschikbaar: true, perUrl: { [schoon('https://x.nl/a')]: { vertoningen: 50, klikken: 4, positie: 9, vorigeVertoningen: 40, vorigeKlikken: 30 } } };
  const ai = { beschikbaar: true, perUrl: {} };
  const l = verrijkMetMeting([
    { id: '1', stand: 'Live', url: 'https://x.nl/a/' }, { id: '2', stand: 'Live', url: 'https://x.nl/b' }, { id: '3', stand: 'Gepland', url: '' }
  ], google, ai);
  assert.equal(l[0].google.trend, 'zakt');
  assert.equal(l[1].google.vertoningen, 0);
  assert.equal(l[1].ai.geciteerd, 0);
  assert.equal(l[2].google, null);
});

test('updatevoorstellen volgen de regels en zetten het belangrijkste bovenaan', () => {
  const nu = new Date('2026-10-14');
  const lijst = [
    { id: 'a', titel: 'A', stand: 'Live', liveDatum: '2026-08-01', google: { vertoningen: 3, klikken: 0, positie: null, trend: 'onbekend' }, ai: { geciteerd: 0 } },
    { id: 'b', titel: 'B', stand: 'Live', liveDatum: '2026-08-01', google: { vertoningen: 200, klikken: 5, positie: 11.2, trend: 'stabiel' }, ai: { geciteerd: 2 } },
    { id: 'c', titel: 'C', stand: 'Live', liveDatum: '2026-10-10', google: { vertoningen: 0, klikken: 0, positie: null, trend: 'onbekend' }, ai: { geciteerd: 0 } },
    { id: 'd', titel: 'D', stand: 'Gepland' }
  ];
  const v = maakUpdateVoorstellen(lijst, { nu, aiBeschikbaar: true });
  const soorten = v.map((x) => `${x.paginaId}:${x.soort}`);
  assert.ok(soorten.includes('a:niet-gevonden'));
  assert.ok(soorten.includes('b:bijna-pagina-1'));
  assert.ok(soorten.includes('a:ai-noemt-niet'));
  assert.ok(!soorten.some((s) => s.startsWith('c:')), 'net live: nog te vroeg');
  assert.equal(v[0].prioriteit, 1);
});

test('zoekvolume is uit zonder inloggegevens en leest DataForSEO met inloggegevens', async () => {
  delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
  assert.deepEqual(await zoekvolume.haalVolumes(['dakkapel plaatsen']), {});
  process.env.DATAFORSEO_LOGIN = 'a'; process.env.DATAFORSEO_PASSWORD = 'b';
  try {
    let verstuurd;
    const f = async (url, opties) => { verstuurd = JSON.parse(opties.body); return { ok: true, text: async () => JSON.stringify({ tasks: [{ result: [{ keyword: 'dakkapel plaatsen', search_volume: 1900 }] }] }) }; };
    const uit = await zoekvolume.voegVolumeToe([{ dienst: 'Dakkapel plaatsen', plaats: '' }, { dienst: 'zolder', plaats: 'Lisse' }], { fetchImpl: f });
    assert.equal(verstuurd[0].location_code, 2528);
    assert.equal(uit[0].volume, 1900);
    assert.equal(uit[1].volume, null);
  } finally {
    delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
  }
});

test('planvoorstel gebruikt AI vragen als bron en sorteert op volume als dat er is', async () => {
  process.env.DATAFORSEO_LOGIN = 'a'; process.env.DATAFORSEO_PASSWORD = 'b';
  try {
    const aiFn = async ({ userPrompt }) => {
      assert.match(userPrompt, /Wat kost een dakkapel/);
      return { voorstellen: [
        { titel: 'Zolder Lisse', dienst: 'zolder', plaats: 'Lisse', reden: 'x' },
        { titel: 'Dakkapel plaatsen', dienst: 'dakkapel plaatsen', plaats: '', reden: 'y' }
      ] };
    };
    const volumeFetch = async () => ({ ok: true, text: async () => JSON.stringify({ tasks: [{ result: [{ keyword: 'zolder lisse', search_volume: 20 }, { keyword: 'dakkapel plaatsen', search_volume: 1900 }] }] }) });
    const fetchImpl = async () => ({ ok: true, text: async () => '[]' });
    const uit = await maakPlanVoorstel({ klant: 'k', aantal: 2, bestaandePaginas: [], klantTekst: '', aiVragen: ['Wat kost een dakkapel?'], aiFn, fetchImpl, volumeFetch });
    assert.equal(uit.volumeBeschikbaar, true);
    assert.equal(uit.voorstellen[0].titel, 'Dakkapel plaatsen');
  } finally {
    delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
  }
});
