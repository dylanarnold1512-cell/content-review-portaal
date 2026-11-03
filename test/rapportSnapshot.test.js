const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/services/rapportSnapshot');
const { bouwRapport } = require('../src/services/rapporten');

const week = (start, cluster, platform, antwoorden, genoemd, extra = {}) => ({ klant: 'X', week_start: start, cluster, platform, antwoorden, genoemd, geciteerd: extra.geciteerd || 0, fouten: extra.fouten || 0 });

test('bouwAiMaand: kernreeks, alleen complete weken die in de maand beginnen', () => {
  const rijen = [
    week('2026-10-05', 'kern', 'chatgpt', 60, 12, { geciteerd: 2 }), week('2026-10-05', 'kern', 'gemini', 60, 6),
    week('2026-10-12', 'kern', 'chatgpt', 60, 18), week('2026-10-12', 'kern', 'gemini', 60, 0, { fouten: 40 }), // te veel fouten: telt niet
    week('2026-10-26', 'kern', 'chatgpt', 60, 6), week('2026-10-26', 'kern', 'gemini', 60, 6), // loopt door in november, hoort bij oktober
    week('2026-10-05', 'totaal', 'chatgpt', 90, 50), week('2026-10-05', 'totaal', 'gemini', 90, 50), // andere reeks: telt niet
    week('2026-09-28', 'totaal', 'chatgpt', 60, 30), week('2026-09-28', 'totaal', 'gemini', 60, 30) // vorige maand zonder kern
  ];
  const prompts = [{ prompt_id: 'a', prompt: 'Vraag A', soort: 'kern', actief: 'true' }, { prompt_id: 'b', prompt: 'Vraag B', soort: 'wissel', actief: true }];
  const metingen = [
    { prompt_id: 'a', platform: 'chatgpt', datum: '2026-10-06', genoemd: true, geciteerd: true },
    { prompt_id: 'b', platform: 'gemini', datum: '2026-11-02', genoemd: 'true' }, // maandag 2 november: hoort bij november
    { prompt_id: 'b', platform: 'gemini', datum: '2026-10-28', genoemd: true }
  ];
  const a = S.bouwAiMaand(rijen, prompts, metingen, '2026-10');
  assert.equal(a.status, 'gemeten');
  assert.equal(a.reeks, 'kern');
  assert.equal(a.aantalKernvragen, 1);
  assert.equal(a.nu.weken, 2);
  assert.equal(a.nu.antwoorden, 240);
  assert.equal(a.nu.genoemd, 30);
  assert.equal(a.nu.percentage, 13);
  assert.equal(a.nu.geciteerd, 2);
  assert.equal(a.wekenOnvolledig, 1);
  // September heeft geen kernreeks: geen vergelijking op een andere basis.
  assert.equal(a.vorig, null);
  assert.equal(a.verschil, null);
  assert.deepEqual(a.vragen.map((v) => [v.id, v.kern, v.totaal]), [['a', true, 1], ['b', false, 1]]);
  assert.equal(a.vragenGesteld, 2);
});

test('bouwAiMaand: niet gemeten in die maand', () => {
  const a = S.bouwAiMaand([week('2026-09-07', 'totaal', 'chatgpt', 10, 1), week('2026-09-07', 'totaal', 'gemini', 10, 1)], [], [], '2026-10');
  assert.equal(a.status, 'niet_gemeten');
});

test('bouwOpbrengst: alleen de rij van precies die maand', () => {
  const rijen = [{ periode_type: 'maand', periode_start: '2026-11-01', sessies_ai: 99 }, { periode_type: '28d', periode_start: '2026-10-01', sessies_ai: 5 }];
  assert.equal(S.bouwOpbrengst(rijen, '2026-10', 'X'), null);
  const o = S.bouwOpbrengst([{ periode_type: 'maand', periode_start: '2026-10-01', sessies_ai: '7', leads_ai: 1, ondersteund_actief: 'true', ondersteund_blog_leads: 3, ai_bronnen: '["chatgpt.com"]' }], '2026-10', 'X');
  assert.equal(o.sessiesAi, 7);
  assert.equal(o.eerderLeads, 3);
  assert.deepEqual(o.aiBronnen, ['chatgpt.com']);
});

test('bouwGedaan telt FAQ aanpassingen, aanvullingen en interne links in de maand', () => {
  const gd = S.bouwGedaan(
    [{ soort: 'interne_link', actiedatum: '2026-10-02', details: '{"aantal":2}' }, { soort: 'interne_link', actiedatum: '2026-11-01' }],
    [{ status: 'geplaatst', geplaatst_op: '2026-10-09' }],
    [{ status: 'toegepast', toegepast: '2026-10-20T10:00:00Z', vraag: 'V1', pagina_titel: 'P1' }, { status: 'voorstel', toegepast: '2026-10-21' }, { status: 'toegepast', toegepast: '2026-09-30' }],
    '2026-10'
  );
  assert.deepEqual(gd, { aangevuld: 1, internelinks: 2, faq: 1, faqVoorbeelden: [{ vraag: 'V1', pagina: 'P1' }] });
});

test('bouwGoogle: alleen als de maandperiode bij het rapport hoort', () => {
  assert.equal(S.bouwGoogle({ overzicht: { periode_start: '2026-09-01' } }, '2026-10', 'X'), null);
});

test('maakSnapshot zonder AI en zonder data blijft heel', () => {
  const s = S.maakSnapshot({ maand: '2026-10', klantNaam: 'X', aiAan: false }, '2026-11-04T06:30:00Z');
  assert.equal(s.versie, 1);
  assert.equal(s.ai, null);
  assert.equal(s.google, null);
  assert.equal(s.opbrengst, null);
  assert.deepEqual(s.gedaan, { aangevuld: 0, internelinks: 0, faq: 0, faqVoorbeelden: [] });
});

test('bouwRapport leest de snapshot uit kolom extra en negeert live rijen', () => {
  const extra = { versie: 1, google: { blogsGemeten: 3 }, opbrengst: { sessiesAi: 4 }, ai: null, gedaan: { aangevuld: 2, internelinks: 1, faq: 3, faqVoorbeelden: [] }, effecten: { items: [{ titel: 'Vast' }] } };
  const r = bouwRapport({ maand: '2026-10', nieuwe_blogs: '[{"titel":"A"}]', extra: JSON.stringify(extra) },
    [{ soort: 'interne_link', actiedatum: '2026-10-12', details: '{"aantal":9}' }], [], [{ periode_type: 'maand', periode_start: '2026-10-01', sessies_ai: 77 }], 'X');
  assert.equal(r.vastgelegd, true);
  assert.equal(r.meting.sessiesAi, 4);
  assert.equal(r.gedaan.internelinks, 1);
  assert.equal(r.gedaan.faq, 3);
  assert.equal(r.gedaan.nieuweBlogs, 1);
  assert.equal(r.ai, null);
  assert.equal(r.effecten.items[0].titel, 'Vast');
  // Zonder snapshot: oude live route, ai undefined zodat het portaal de live AI data gebruikt.
  const oud = bouwRapport({ maand: '2026-10' }, [], [], [], 'X');
  assert.equal(oud.vastgelegd, false);
  assert.equal(oud.ai, undefined);
});
