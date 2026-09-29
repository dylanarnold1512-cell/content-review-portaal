const test = require('node:test');
const assert = require('node:assert/strict');
const { bouwPrestaties, positieLabel } = require('../src/services/prestaties');

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
