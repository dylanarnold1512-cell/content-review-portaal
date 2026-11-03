const test = require('node:test');
const assert = require('node:assert/strict');
const { start, recent } = require('../src/services/rapportStart');

function nepFetch(html, workflow) {
  const posts = [];
  global.fetch = async (url, opties) => {
    const u = String(url);
    if (u.includes('/form/') && (!opties || !opties.method)) return { ok: true, status: 200, text: async () => html };
    if (u.includes('/form/')) { posts.push(opties.body); return { ok: true, status: 200, text: async () => '' }; }
    if (u.includes('/api/v1/workflows/')) return { ok: true, status: 200, text: async () => JSON.stringify(workflow || {}) };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  return posts;
}

test('start leest labels met enkele aanhalingstekens in het n8n formulier', async () => {
  process.env.N8N_API_KEY = 'x';
  const posts = nepFetch("<form><label class='form-label' for='field-0'>Klant</label><label class='form-label' for='field-1'>Maand overschrijven (1-12, leeglaten = vorige maand)</label><label class='form-label' for='field-2'>Jaar overschrijven (bijv. 2026, leeglaten = huidig jaar)</label></form>");
  const r = await start({ organisatieId: 'digital-impact', klant: 'SPAWW', maand: 5, jaar: 2026 });
  assert.equal(r.ok, true);
  assert.equal(posts[0].get('field-0'), 'SPAWW');
  assert.equal(posts[0].get('field-1'), '5');
});

test('start valt terug op de velden uit de workflow als de pagina geen labels toont', async () => {
  process.env.N8N_API_KEY = 'x';
  const wf = { nodes: [{ type: 'n8n-nodes-base.formTrigger', parameters: { formFields: { values: [{ fieldLabel: 'Klant' }, { fieldLabel: 'Maand overschrijven (1-12, leeglaten = vorige maand)' }, { fieldLabel: 'Jaar overschrijven (bijv. 2026, leeglaten = huidig jaar)' }] } } }] };
  const posts = nepFetch('<html><div id="app"></div></html>', wf);
  await start({ organisatieId: 'digital-impact', klant: 'SPAWW', maand: 5, jaar: 2026 });
  assert.equal(posts[0].get('field-0'), 'SPAWW');
  assert.equal(posts[0].get('field-2'), '2026');
});

test('start vindt een veld waarvan de tekst op de pagina anders is geschreven, via de workflow', async () => {
  process.env.N8N_API_KEY = 'x';
  const wf = { nodes: [{ type: 'n8n-nodes-base.formTrigger', parameters: { formFields: { values: [{ fieldLabel: 'Klant' }, { fieldLabel: 'Maand overschrijven (1-12, leeglaten = vorige maand)' }, { fieldLabel: 'Jaar overschrijven (bijv. 2026, leeglaten = huidig jaar)' }, { fieldLabel: 'Google Ads - Conversies overschrijven (leeglaten = automatisch)' }] } } }] };
  const html = "<label for='field-0'>Klant</label><label for='field-1'>Maand overschrijven (1-12, leeglaten = vorige maand)</label><label for='field-2'>Jaar overschrijven (bijv. 2026, leeglaten = huidig jaar)</label><label for='field-3'>Google Ads &#8211; Conversies overschrijven (leeglaten = automatisch)</label>";
  const posts = nepFetch(html, wf);
  await start({ organisatieId: 'digital-impact', klant: 'UNIT45', velden: { 'Google Ads - Conversies overschrijven (leeglaten = automatisch)': '9' } });
  assert.equal(posts[0].get('field-3'), '9');
});

test('recent geeft de ingevulde velden en notities per start terug', async () => {
  process.env.N8N_API_KEY = 'x';
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/data-tables/')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ organisatie: 'digital-impact', klant: 'SPAWW', maand: '2026-10', gestart: '2026-11-02T10:00:00.000Z', workflow_id: 'w1', velden: JSON.stringify({ 'Google Ads - Conversies overschrijven (leeglaten = automatisch)': '0', notities: 'let op' }) }, { organisatie: 'digital-impact', klant: 'UNIT45', maand: '2026-10', gestart: '2026-11-01T10:00:00.000Z', workflow_id: 'w1', velden: 'kapot' }] }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
  };
  const r = await recent(10);
  assert.equal(r[0].klant, 'SPAWW');
  assert.equal(r[0].organisatieId, 'digital-impact');
  assert.equal(r[0].jaar, 2026);
  assert.equal(r[0].maandNummer, 10);
  assert.equal(r[0].notities, 'let op');
  assert.deepEqual(r[0].velden, { 'Google Ads - Conversies overschrijven (leeglaten = automatisch)': '0' });
  assert.deepEqual(r[1].velden, {});
});
