const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwPrestaties, positieLabel, kiesPeriode, rijenVanPeriode } = require('../src/services/prestaties');

const overzicht = {
  periode_start: '2026-09-01', periode_eind: '2026-09-28', bijgewerkt: '2026-09-29',
  clicks: 3, vertoningen: 400, clicks_vorig: 0, vertoningen_vorig: 200,
  paginaweergaven: 20, blogs_gepubliceerd: 4, blogs_pipeline: 2, toelichting: '  Mooie start.  '
};
const blog = (o) => ({
  titel: 'Blog', cluster: 'A', publicatiedatum: '2026-07-01', vertoningen: 0, clicks: 0, hoofdkeyword: 'kw',
  hk_positie: null, hk_positie_vorig: null, hk_vertoningen: 0, zoekwoorden: '[]', ...o
});

test('positieLabel geeft pagina', () => {
  assert.equal(positieLabel(4), 'Pagina 1');
  assert.equal(positieLabel(14), 'Pagina 2');
  assert.equal(positieLabel(31), 'Pagina 3 of verder');
  assert.equal(positieLabel(null), null);
});

test('statusbadges op basis van leeftijd en cijfers', () => {
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [
    blog({ titel: 'nieuw', publicatiedatum: '2026-09-25' }),
    blog({ titel: 'oud0' }),
    blog({ titel: 'getoond', vertoningen: 10 }),
    blog({ titel: 'klik', vertoningen: 10, clicks: 1 })
  ] }, '2026-09-29');
  const s = Object.fromEntries(r.blogs.map((b) => [b.titel, b.status.code]));
  assert.deepEqual(s, { nieuw: 'nieuw', oud0: 'nietgetoond', getoond: 'getoond', klik: 'clicks' });
});

test('kans, aandacht en goed nieuws volgen de vaste regels', () => {
  const zw = JSON.stringify([{ q: 'kans', c: 0, i: 60, p: 12 }, { q: 'laag', c: 0, i: 5, p: 12 }]);
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [
    blog({ titel: 'K', vertoningen: 65, zoekwoorden: zw }),
    blog({ titel: 'Leeg' }),
    blog({ titel: 'P1', vertoningen: 40, hk_positie: 6, hk_vertoningen: 40, hk_positie_vorig: 9 })
  ] }, '2026-09-29');
  assert.equal(r.inzichten.kansen.length, 1);
  assert.match(r.inzichten.kansen[0].titel, /kans/);
  // Leeg (0 vertoningen) en K (65 vertoningen, hoofdzoekwoord niet gevonden)
  assert.equal(r.inzichten.aandacht.length, 2);
  assert.match(r.inzichten.aandacht[0].titel, /Leeg/);
  assert.match(r.inzichten.aandacht[1].titel, /K/);
  assert.ok(r.inzichten.goed.some((g) => /pagina 1/.test(g.titel)));
  assert.ok(r.inzichten.goed.some((g) => /Eerste clicks/.test(g.titel)));
});

test('samenvatting, toelichting en weken', () => {
  const r = bouwPrestaties({ overzicht, blogs: [], weken: [
    { week_start: '2026-09-21', week_eind: '2026-09-27', volledig: true, clicks: 1, vertoningen: 5, nieuwe_blogs: '[{"t":"X","d":"2026-09-22"}]' },
    { week_start: '2026-09-14', week_eind: '2026-09-20', volledig: true, clicks: 0, vertoningen: 2, nieuwe_blogs: 'kapot' }
  ] }, '2026-09-29');
  assert.equal(r.toelichting, 'Mooie start.');
  assert.equal(r.weken[0].start, '2026-09-14');
  assert.equal(r.weken[1].nieuw.length, 1);
  assert.equal(r.weken[0].nieuw.length, 0);
  assert.match(r.samenvatting.join(' '), /400 keer/);
});

test('zonder vertoningen komt er een eerlijke samenvatting', () => {
  const r = bouwPrestaties({ overzicht: { ...overzicht, vertoningen: 0, clicks: 0, vertoningen_vorig: 0, clicks_vorig: 0 }, blogs: [], weken: [] }, '2026-09-29');
  assert.match(r.samenvatting[0], /nog geen enkele blog/);
});

test('indexatiestatus komt bij de blog en bepaalt de actie bij aandacht', () => {
  const r = bouwPrestaties({
    overzicht,
    weken: [],
    blogs: [blog({ titel: 'Leeg', blog_pad: '/news/leeg' }), blog({ titel: 'Geen data', blog_pad: '/news/geen' })],
    indexatie: [{ blog_pad: '/news/leeg', status_code: 'ontdekt_niet_geindexeerd', status_tekst: 'Google kent de pagina maar heeft hem nog niet bekeken' }]
  }, '2026-09-29');
  const leeg = r.blogs.find((b) => b.titel === 'Leeg');
  assert.equal(leeg.indexatie.code, 'ontdekt_niet_geindexeerd');
  assert.equal(r.blogs.find((b) => b.titel === 'Geen data').indexatie, null);
  const a = r.inzichten.aandacht.find((x) => /Leeg/.test(x.titel));
  assert.match(a.tekst, /Google kent de pagina, maar heeft hem nog niet bekeken/);
  assert.match(a.actie, /vragen indexering aan/);
});

test('geblokkeerde pagina komt altijd in aandacht', () => {
  const r = bouwPrestaties({
    overzicht,
    weken: [],
    blogs: [blog({ titel: 'Nieuw', blog_pad: '/news/n', publicatiedatum: '2026-09-27' })],
    indexatie: [{ blog_pad: '/news/n', status_code: 'geblokkeerd', status_tekst: 'De pagina is voor Google geblokkeerd' }]
  }, '2026-09-29');
  assert.equal(r.inzichten.aandacht.length, 1);
  assert.match(r.inzichten.aandacht[0].actie, /blokkade/);
});

test('gedrag en totalen uit GA4 komen bij de blog, en zonder data blijft het leeg', () => {
  const r = bouwPrestaties({
    overzicht,
    weken: [],
    blogs: [blog({ titel: 'A', blog_pad: '/news/a' }), blog({ titel: 'B', blog_pad: '/news/b' })],
    conversies: [
      { blog_pad: '/news/a', sessies_google: 4, betrokken_seconden: 30, leads: 1, boekingen: 0, omzet: 0, doorkliks_contact: 2, doorkliks_boeken: 1 },
      { blog_pad: '/news/b', sessies_google: 1, betrokken_seconden: 10, leads: 0, boekingen: 1, omzet: 250.5, doorkliks_contact: 0, doorkliks_boeken: 0 }
    ]
  }, '2026-09-29');
  assert.equal(r.blogs.find((b) => b.titel === 'A').gedrag.leads, 1);
  const { woorden, ...cv } = r.totalen.conversies;
  assert.deepEqual(cv, { sessiesGoogle: 5, leads: 1, boekingen: 1, omzet: 250.5, doorkliks: 3, heeftLeads: true, heeftBoekingen: true, heeftDoorklik: true });
  assert.equal(woorden.boeking[0], 'boeking');
  const tbg = bouwPrestaties({ overzicht, weken: [], blogs: [blog({ blog_pad: '/news/a' })], conversies: [{ blog_pad: '/news/a', sessies_google: 1, boekingen: 0 }], klantNaam: 'Trockenblumengrosshandel' }, '2026-09-29');
  assert.equal(tbg.totalen.conversies.woorden.boekLabel, 'aankoop');
  assert.equal(tbg.totalen.conversies.heeftLeads, false);
  const leeg = bouwPrestaties({ overzicht, weken: [], blogs: [blog({ blog_pad: '/news/a' })] }, '2026-09-29');
  assert.equal(leeg.totalen.conversies, null);
});

test('aandacht toont niet meer dan de bovengrens en blokkades staan bovenaan', () => {
  const blogs = [];
  for (let i = 0; i < 20; i++) blogs.push(blog({ titel: 'Leeg ' + i, blog_pad: '/news/l' + i, publicatiedatum: '2026-06-01' }));
  blogs.push(blog({ titel: 'Nieuw', blog_pad: '/news/n', publicatiedatum: '2026-09-27' }));
  const r = bouwPrestaties({
    overzicht, weken: [], blogs,
    indexatie: [{ blog_pad: '/news/n', status_code: 'geblokkeerd', status_tekst: 'De pagina is voor Google geblokkeerd' }]
  }, '2026-09-29');
  assert.ok(r.inzichten.aandacht.length <= 16);
  assert.match(r.inzichten.aandacht[0].titel, /Nieuw/);
});

test('periodekeuze: onbekende waarde wordt 28d en oude rijen tellen als 28d', () => {
  assert.equal(kiesPeriode('90d'), '90d');
  assert.equal(kiesPeriode('maand'), 'maand');
  assert.equal(kiesPeriode('rommel'), '28d');
  assert.equal(kiesPeriode(undefined), '28d');
  const oud = [{ id: 1 }, { id: 2, periode_type: '' }];
  assert.equal(rijenVanPeriode(oud, '28d').length, 2);
  assert.equal(rijenVanPeriode(oud, '90d').length, 0);
  const mix = [{ id: 1 }, { id: 2, periode_type: '28d' }, { id: 3, periode_type: '90d' }];
  assert.deepEqual(rijenVanPeriode(mix, '28d').map((r) => r.id), [2]);
  assert.deepEqual(rijenVanPeriode(mix, '90d').map((r) => r.id), [3]);
});

test('kansen uit de tabel krijgen signaal, waarom, actie en onderbouwing en gaan voor de oude regels', () => {
  const kansenRijen = [
    { soort: 'nieuw_onderwerp', prioriteit: 'hoog', zoekwoord: 'x', vertoningen: 300, signaal: 'S2', waarom: 'W2', actie: 'A2', onderbouwing: 'O2', periode_start: '2026-09-01', periode_eind: '2026-09-28' },
    { soort: 'verbeteren', prioriteit: 'laag', zoekwoord: 'y', vertoningen: 40, blog_titel: 'B', signaal: 'S1', waarom: 'W1', actie: 'A1', onderbouwing: 'O1' }
  ];
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [blog({ titel: 'K', zoekwoorden: JSON.stringify([{ q: 'oud', c: 0, i: 60, p: 12 }]) })], kansenRijen, periode: '90d' }, '2026-09-29');
  assert.equal(r.inzichten.kansen.length, 2);
  assert.equal(r.inzichten.kansen[0].soort, 'verbeteren');
  assert.equal(r.inzichten.kansen[0].signaal, 'S1');
  assert.equal(r.inzichten.kansen[1].onderbouwing, 'O2');
  assert.equal(r.periodeType, '90d');
  assert.match(r.samenvatting.join(' '), /3 maanden/);
  assert.equal(r.kansenPeriode.eind, '2026-09-28');
  assert.equal(r.periodeOpties.length, 3);
});

test('zonder kansen in de tabel blijven de oude regels gelden', () => {
  const zw = JSON.stringify([{ q: 'kans', c: 0, i: 60, p: 12 }]);
  const r = bouwPrestaties({ overzicht, weken: [], blogs: [blog({ titel: 'K', vertoningen: 65, zoekwoorden: zw })], kansenRijen: [] }, '2026-09-29');
  assert.equal(r.inzichten.kansen.length, 1);
  assert.equal(r.periodeType, '28d');
});
