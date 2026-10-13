const test = require('node:test');
const assert = require('node:assert');
const { bouwPdf, aiMaand, vorigeMaand } = require('../src/services/rapportPdf');

const rapport = { maand: '2026-09', label: 'september 2026', aangemaakt: '2026-10-04', bron: 'Search Console', voortgang: 'Het gaat de goede kant op.',
  totalen: { vertoningen: 2046, vertoningen_vorig: 900, clicks: 2, clicks_vorig: 0, paginaweergaven: 14, hk_positie_gemiddeld: 10.1 },
  terugblik: ['In september zijn 7 nieuwe blogs live gegaan.'], nieuweBlogs: [{ titel: 'Teamdag met resultaat', datum: '2026-09-03' }],
  blogs: [{ titel: 'Waarom duurzame vergaderlocaties', vertoningen: 900, clicks: 2 }, { titel: 'Nul', vertoningen: 0, clicks: 0 }],
  effecten: { items: [{ soortLabel: 'Blog verbeterd', datum: '2026-09-20', titel: 'Een blog', regels: ['Van 100 naar 140.'] }] }, vooruitblik: [{ titel: 'Verbeteren', tekst: 'Voeg iets toe.' }] };

test('vorigeMaand rekent over de jaargrens', () => {
  assert.strictEqual(vorigeMaand('2026-01'), '2025-12');
  assert.strictEqual(vorigeMaand('2026-10'), '2026-09');
});

test('aiMaand telt alleen weken in die maand', () => {
  const ai = { trend: [{ weekStart: '2026-09-07', platformen: { chatgpt: { antwoorden: 30, genoemd: 3 } } }, { weekStart: '2026-10-05', platformen: { chatgpt: { antwoorden: 30, genoemd: 9 } } }] };
  assert.strictEqual(aiMaand(ai, '2026-09').percentage, 10);
  assert.strictEqual(aiMaand(ai, '2026-08'), null);
});

test('bouwPdf maakt een PDF, ook zonder AI en met vreemde tekens', async () => {
  const buf = await bouwPdf({ rapport: { ...rapport, terugblik: ['Trockenblumen im Großhandel → test \u{1F600}'] }, klantNaam: 'Trockenblumengrosshandel', ai: null });
  assert.strictEqual(buf.slice(0, 4).toString(), '%PDF');
  const ai = { beschikbaar: true, platformen: [{ id: 'chatgpt', label: 'ChatGPT' }], trend: [{ weekStart: '2026-09-07', platformen: { chatgpt: { antwoorden: 30, genoemd: 3 } } }] };
  const buf2 = await bouwPdf({ rapport, klantNaam: 'Basecamp Utrecht', ai });
  assert.ok(buf2.length > 2000);
});
