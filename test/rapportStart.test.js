const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../src/services/rapportStart');

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
  const posts = nepFetch("<form><label class='form-label' for='field-0'>Klant</label><label class='form-label' for='field-1'>Maand overschrijven (1-12, leeglaten = vorige maand)</label></form>");
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
