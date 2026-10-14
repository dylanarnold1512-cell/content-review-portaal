// Tests voor de schakelaar Paginameting en de n8n koppelingen (Pagr., 14-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const zoekvolume = require('../src/lp/zoekvolume');
const meting = require('../src/lp/meting');
const { maakPlanVoorstel } = require('../src/lp/plan');

function schoneEnv() {
  delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD; delete process.env.N8N_VOLUME_WEBHOOK_URL;
}

test('zoekvolume gebruikt de n8n webhook als die is ingesteld, zonder DataForSEO inlog', async () => {
  schoneEnv();
  process.env.N8N_VOLUME_WEBHOOK_URL = 'https://n8n.example/webhook/geheim';
  try {
    assert.equal(zoekvolume.beschikbaar(), true);
    let doel; let body;
    const f = async (url, opties) => { doel = url; body = JSON.parse(opties.body); return { ok: true, text: async () => JSON.stringify({ volumes: { 'dakkapel plaatsen': 1900, 'zolder lisse': 20 } }) }; };
    const uit = await zoekvolume.voegVolumeToe([{ dienst: 'Dakkapel plaatsen', plaats: '' }, { dienst: 'zolder', plaats: 'Lisse' }, { dienst: 'loft', plaats: '' }], { fetchImpl: f });
    assert.equal(doel, 'https://n8n.example/webhook/geheim');
    assert.deepEqual(body.termen, ['dakkapel plaatsen', 'zolder lisse', 'loft']);
    assert.equal(uit[0].volume, 1900);
    assert.equal(uit[1].volume, 20);
    assert.equal(uit[2].volume, null);
  } finally { schoneEnv(); }
});

test('zoekvolume geeft leeg terug als de webhook faalt of onzin antwoordt', async () => {
  schoneEnv();
  process.env.N8N_VOLUME_WEBHOOK_URL = 'https://n8n.example/webhook/geheim';
  try {
    assert.deepEqual(await zoekvolume.haalVolumes(['a'], { fetchImpl: async () => ({ ok: false }) }), {});
    assert.deepEqual(await zoekvolume.haalVolumes(['a'], { fetchImpl: async () => { throw new Error('plat'); } }), {});
    assert.deepEqual(await zoekvolume.haalVolumes(['a'], { fetchImpl: async () => ({ ok: true, text: async () => 'geen json' }) }), {});
    assert.deepEqual(await zoekvolume.haalVolumes(['a'], { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ volumes: { a: 'veel' } }) }) }), {});
  } finally { schoneEnv(); }
});

test('plan haalt geen volumes op als de Paginameting uit staat', async () => {
  schoneEnv();
  process.env.N8N_VOLUME_WEBHOOK_URL = 'https://n8n.example/webhook/geheim';
  try {
    let aangeroepen = 0;
    const volumeFetch = async () => { aangeroepen += 1; return { ok: true, text: async () => JSON.stringify({ volumes: {} }) }; };
    const fetchImpl = async () => ({ ok: true, text: async () => '[]' });
    const aiFn = async () => ({ voorstellen: [{ titel: 'Zolder Lisse', dienst: 'zolder', plaats: 'Lisse', reden: 'x' }] });
    const uit = await maakPlanVoorstel({ klant: 'k', aantal: 1, bestaandePaginas: [], klantTekst: '', aiVragen: [], aiFn, fetchImpl, volumeFetch, volumeAan: false });
    assert.equal(aangeroepen, 0);
    assert.equal(uit.volumeBeschikbaar, false);
    assert.equal(uit.voorstellen[0].volume, null);
    await maakPlanVoorstel({ klant: 'k', aantal: 1, bestaandePaginas: [], klantTekst: '', aiVragen: [], aiFn, fetchImpl, volumeFetch, volumeAan: true });
    assert.equal(aangeroepen, 1);
  } finally { schoneEnv(); }
});

test('lege meting laat bij live pagina\'s geen Google of AI cijfers zien', () => {
  const leeg = meting.leegMeting();
  assert.equal(leeg.google.uit, true);
  assert.equal(leeg.ai.beschikbaar, false);
  const lijst = [{ id: '1', stand: 'Live', url: 'https://x.nl/a/', titel: 'A' }];
  const uit = meting.verrijkMetMeting(lijst, leeg.google, leeg.ai);
  assert.equal(uit[0].google, null);
  assert.equal(uit[0].ai, null);
});

test('google meting leest standaard de pagr_meting tabel', async () => {
  let gebruikteTabel;
  const res = await meting.haalGoogle('klant-test-tabel', { tabelFn: async (id, filter) => { gebruikteTabel = id; assert.equal(filter[0].value, 'klant-test-tabel'); return [{ klant_id: 'klant-test-tabel', url: 'https://x.nl/a/', periode_type: '28d', vertoningen: 10, klikken: 1, positie: 12.34, vorige_vertoningen: 5, vorige_klikken: 0 }]; } });
  assert.equal(gebruikteTabel, 'bBaHDpJwm1h7vl5a');
  assert.equal(res.beschikbaar, true);
  assert.equal(res.perUrl['https://x.nl/a'].positie, 12.3);
});
