const test = require('node:test');
const assert = require('node:assert');
const publiceren = require('../src/services/publiceren');
const OverzichtModel = require('../public/overzicht-model');

test('leesKeuze: standaard uit, met inkijktijd van 48 uur', () => {
  assert.deepStrictEqual(publiceren.leesKeuze({}), { aan: false, modus: 'inkijk', inkijkUren: 48 });
  assert.deepStrictEqual(publiceren.leesKeuze({ auto_publiceren: 'ja', publiceer_modus: 'direct', inkijk_uren: 24 }), { aan: true, modus: 'direct', inkijkUren: 24 });
  assert.deepStrictEqual(publiceren.leesKeuze({ auto_publiceren: 'JA', publiceer_modus: 'raar', inkijk_uren: 5 }), { aan: true, modus: 'inkijk', inkijkUren: 48 });
});

test('metStreepjes: Notion id met en zonder streepjes wordt hetzelfde', () => {
  const zonder = '2a5b4c7cdb994333877fdb52aa2c8626';
  const met = '2a5b4c7c-db99-4333-877f-db52aa2c8626';
  assert.strictEqual(publiceren.metStreepjes(zonder), met);
  assert.strictEqual(publiceren.metStreepjes(met), met);
});

test('beschikbaar: niet voor klanten met eigen workflows', () => {
  assert.strictEqual(publiceren.beschikbaar('basecamp-utrecht'), false);
  assert.strictEqual(publiceren.beschikbaar('ppe'), false);
  assert.strictEqual(publiceren.beschikbaar('trockenblumengrosshandel'), true);
});

test('overzicht: een blog die vanzelf live gaat wacht niet op de klant', () => {
  const sv = { review: 'Ter review', published: 'Gepubliceerd', planned: 'Gepland', approved: 'Goedgekeurd', idea: 'Idee', generating: 'In generatie' };
  const items = [
    { id: '2a5b4c7c-db99-4333-877f-db52aa2c8626', titel: 'Automatisch', status: 'Ter review' },
    { id: '11111111-2222-3333-4444-555555555555', titel: 'Tegengehouden', status: 'Ter review' }
  ];
  const zonder = OverzichtModel.bouwStartscherm({ items, statusValues: sv, reviewEnabled: true }, '2026-11-12');
  assert.strictEqual(zonder.review.length, 2);
  assert.strictEqual(zonder.autoAan, false);

  const publ = { status: 'ok', data: { beschikbaar: true, aan: true, modus: 'inkijk', inkijkUren: 48, gepland: [{ pageId: '2a5b4c7cdb994333877fdb52aa2c8626', titel: 'Automatisch', klaarOp: '2026-11-12T10:00:00+01:00', liveOp: '2026-11-14T11:00:00+01:00' }] } };
  const met = OverzichtModel.bouwStartscherm({ items, statusValues: sv, reviewEnabled: true, publiceren: publ }, '2026-11-12');
  assert.strictEqual(met.review.length, 1);
  assert.strictEqual(met.review[0].titel, 'Tegengehouden');
  assert.strictEqual(met.autoAan, true);
  assert.ok(met.feed.some((f) => f.tekst === 'Blog gecontroleerd op 12 punten'));
});

test('overzicht: statustekst noemt automatisch publiceren als het aan staat', () => {
  const sv = { review: 'Ter review', published: 'Gepubliceerd' };
  const publ = { status: 'ok', data: { beschikbaar: true, aan: true, gepland: [] } };
  const s = OverzichtModel.bouwStartscherm({ items: [{ id: 'a', status: 'Gepubliceerd', publicatiedatum: '2026-11-01' }], statusValues: sv, reviewEnabled: true, publiceren: publ }, '2026-11-12');
  assert.match(OverzichtModel.statusTekst(s), /Automatisch publiceren staat aan/);
});

test('overzicht: agenda toont wat vaststaat, op datum', () => {
  const sv = { review: 'Ter review', published: 'Gepubliceerd', planned: 'Gepland', idea: 'Idee' };
  const items = [
    { id: '2a5b4c7c-db99-4333-877f-db52aa2c8626', titel: 'Auto blog', status: 'Ter review' },
    { id: '11111111-2222-3333-4444-555555555555', titel: 'Gepland blog', status: 'Gepland', publicatiedatum: '2026-11-20' }
  ];
  const publ = { status: 'ok', data: { beschikbaar: true, aan: true, gepland: [{ pageId: '2a5b4c7cdb994333877fdb52aa2c8626', titel: 'Auto blog', klaarOp: '2026-11-12T10:00:00+01:00', liveOp: '2026-11-14T11:00:00+01:00' }] } };
  const s = OverzichtModel.bouwStartscherm({ items, statusValues: sv, reviewEnabled: true, publiceren: publ }, '2026-11-12');
  assert.deepStrictEqual(s.agenda.map((a) => a.datum), ['2026-11-14', '2026-11-20']);
  assert.strictEqual(s.agenda[0].titel, 'Blog gaat live');
});
