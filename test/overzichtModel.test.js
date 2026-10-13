const test = require('node:test');
const assert = require('node:assert');
const { bouwStartscherm, statusZin } = require('../public/overzicht-model.js');

const sv = { idea: 'Idee', planned: 'Gepland', generating: 'Bezig', approved: 'Goedgekeurd', review: 'Ter review', published: 'Gepubliceerd' };
const NU = '2026-10-13';
const blog = (id, status, datum, extra) => ({ id, titel: 'Blog ' + id, status, publicatiedatum: datum, ...(extra || {}) });
const basis = (items, rest) => ({ items, statusValues: sv, reviewEnabled: true, ...(rest || {}) });
const google = (t, weken) => ({ status: 'ok', data: { totalen: t, weken: weken || [], laatstBijgewerkt: '2026-10-13' } });

test('blogs op review geven de stand actie nodig en een zin met het aantal', () => {
  const s = bouwStartscherm(basis([blog(1, 'Ter review', ''), blog(2, 'Ter review', '')]), NU);
  assert.strictEqual(s.stand, 'actie');
  assert.strictEqual(s.review.length, 2);
  assert.strictEqual(statusZin(s), 'Er wachten 2 blogs op jouw beoordeling.');
});

test('zonder review voor de klant telt review niet mee', () => {
  const s = bouwStartscherm({ ...basis([blog(1, 'Ter review', '')]), reviewEnabled: false }, NU);
  assert.strictEqual(s.review.length, 0);
  assert.notStrictEqual(s.stand, 'actie');
});

test('een klant zonder live blogs en zonder Google cijfers is nieuw', () => {
  const s = bouwStartscherm(basis([blog(1, 'Gepland', '2026-10-20')]), NU);
  assert.strictEqual(s.stand, 'nieuw');
  assert.match(statusZin(s), /contentplan staat klaar/);
});

test('een lopende klant noemt de volgende blog in dagen', () => {
  const s = bouwStartscherm(basis([blog(1, 'Gepubliceerd', '2026-10-01'), blog(2, 'Gepland', '2026-10-15')], { google: google({ vertoningen: 10, clicks: 1 }) }), NU);
  assert.strictEqual(s.stand, 'normaal');
  assert.strictEqual(s.volgendeBlog.dagen, 2);
  assert.strictEqual(statusZin(s), 'Alles loopt. De volgende blog gaat over 2 dagen live.');
});

test('komende blogs: gesorteerd, verleden en zonder datum eruit, maximaal vijf', () => {
  const items = [blog(1, 'Gepland', '2026-12-01'), blog(2, 'Gepland', '2026-10-14'), blog(3, 'Gepland', '2026-09-01'), blog(4, 'Idee', ''),
    blog(5, 'Gepland', '2026-10-20'), blog(6, 'Gepland', '2026-10-21'), blog(7, 'Gepland', '2026-10-22'), blog(8, 'Gepland', '2026-10-23')];
  const s = bouwStartscherm(basis(items), NU);
  assert.deepStrictEqual(s.komend.map((x) => x.id), [2, 5, 6, 7, 8]);
  assert.strictEqual(s.aantalKomend, 6);
  assert.strictEqual(s.zonderDatum, 1);
});

test('voortgang telt live en gepland', () => {
  const s = bouwStartscherm(basis([blog(1, 'Gepubliceerd', '2026-10-01'), blog(2, 'Gepubliceerd', '2026-10-02'), blog(3, 'Gepland', '2026-10-20')]), NU);
  assert.deepStrictEqual(s.voortgang, { live: 2, gepland: 1 });
});

test('Google: staafjes uit de laatste volledige weken en markering van nieuwe blogs', () => {
  const weken = [];
  for (let i = 0; i < 12; i += 1) weken.push({ start: '2026-08-' + String(i + 1).padStart(2, '0'), volledig: true, vertoningen: i * 10, nieuw: i === 11 ? ['x'] : [] });
  weken.push({ start: '2026-10-12', volledig: false, vertoningen: 5, nieuw: [] });
  const s = bouwStartscherm(basis([], { google: google({ vertoningen: 500, vertoningenVorig: 400, clicks: 5, clicksVorig: 0 }, weken) }), NU);
  assert.strictEqual(s.google.staafjes.length, 10);
  assert.strictEqual(s.google.staafjes[9], 110);
  assert.strictEqual(s.google.weken[9].nieuw, 1);
  assert.strictEqual(s.google.heeftData, true);
});

test('bron die faalt zonder oude stand geeft status fout, met oude stand blijven de cijfers staan', () => {
  const zonder = bouwStartscherm(basis([], { google: { status: 'fout' } }), NU);
  assert.strictEqual(zonder.google.status, 'fout');
  const met = bouwStartscherm(basis([], { google: { status: 'fout', stand: { totalen: { vertoningen: 7, clicks: 1 }, weken: [] } } }), NU);
  assert.strictEqual(met.google.status, 'ok');
  assert.strictEqual(met.google.oud, true);
  assert.strictEqual(met.google.vertoningen, 7);
  assert.strictEqual(met.bronFout, false);
});

test('bron zonder dienst voor deze klant is uit', () => {
  const s = bouwStartscherm(basis([], { google: { status: 'uit' }, ai: { status: 'ok', data: { beschikbaar: false } }, merk: { status: 'ok', data: { beschikbaar: false } } }), NU);
  assert.strictEqual(s.google.status, 'uit');
  assert.strictEqual(s.ai.status, 'uit');
  assert.strictEqual(s.merk.status, 'uit');
});

test('AI: percentage over alle platformen en verschil met de week ervoor', () => {
  const data = {
    beschikbaar: true, status: 'ok', laatsteWeek: { start: '2026-10-05', label: 'week van 5 okt' },
    platformen: [{ antwoorden: 10, genoemd: 3 }, { antwoorden: 10, genoemd: 5 }],
    trend: [{ platformen: { a: { antwoorden: 10, genoemd: 2 }, b: { antwoorden: 10, genoemd: 2 } } }, { platformen: { a: { antwoorden: 10, genoemd: 3 }, b: { antwoorden: 10, genoemd: 5 } } }],
    clusters: []
  };
  const s = bouwStartscherm(basis([], { ai: { status: 'ok', data } }), NU);
  assert.strictEqual(s.ai.percentage, 40);
  assert.strictEqual(s.ai.vorigPercentage, 20);
  assert.strictEqual(s.ai.weekLabel, 'week van 5 okt');
});

test('AI zonder volledige meting heeft geen percentage', () => {
  const s = bouwStartscherm(basis([], { ai: { status: 'ok', data: { beschikbaar: true, status: 'leeg', melding: 'De eerste meting volgt.' } } }), NU);
  assert.strictEqual(s.ai.heeftMeting, false);
});

test('onderwerpen tellen live en gepland per cluster en koppelen AI per naam', () => {
  const items = [blog(1, 'Gepubliceerd', '2026-10-01', { cluster: 'Teamdagen', impressions30d: 40 }), blog(2, 'Gepland', '2026-10-20', { cluster: 'teamdagen' }), blog(3, 'Gepland', '2026-10-21', { cluster: 'Campus' })];
  const ai = { status: 'ok', data: { beschikbaar: true, status: 'ok', platformen: [], trend: [], clusters: [{ naam: 'Teamdagen', platformen: { chatgpt: { antwoorden: 4, genoemd: 1 } } }] } };
  const s = bouwStartscherm(basis(items, { ai }), NU);
  const t = s.onderwerpen.find((o) => o.naam === 'Teamdagen');
  assert.strictEqual(t.live, 1);
  assert.strictEqual(t.vertoningen, 40);
  assert.strictEqual(t.aiPercentage, 25);
  assert.strictEqual(s.onderwerpen.find((o) => o.naam === 'teamdagen').gepland, 1);
});

test('wat er gebeurde: nieuwste eerst, toekomst en blogs zonder datum tellen niet', () => {
  const items = [blog(1, 'Gepubliceerd', '2026-10-01'), blog(2, 'Gepubliceerd', '2026-10-09'), blog(3, 'Gepubliceerd', '2026-11-01'), blog(4, 'Gepubliceerd', '')];
  const s = bouwStartscherm(basis(items), NU);
  assert.deepStrictEqual(s.feed.map((f) => f.id), [2, 1]);
});

test('lege invoer breekt niet', () => {
  const s = bouwStartscherm({}, NU);
  assert.strictEqual(s.stand, 'nieuw');
  assert.strictEqual(s.komend.length, 0);
  assert.match(statusZin(s), /We zijn begonnen/);
});
