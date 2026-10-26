// Pagina's als agenda in het klantportaal (26-10-2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../public/paginas-agenda');

const meting = { google: true, ai: false };
const paginas = [
  { id: 'a', titel: 'Badkamer renoveren Haarlem', stand: 'Live', liveDatum: '2026-10-23', url: 'https://www.hirs-installaties.nl/badkamer-renoveren-haarlem/', reden: 'Complete badkamers.', google: { vertoningen: 0, klikken: 0, positie: null }, ai: null },
  { id: 'b', titel: 'Loodgieter en lekkage Haarlem', stand: 'Live', liveDatum: '', bijgewerkt: '2026-10-23T08:07:00Z', url: 'https://www.hirs-installaties.nl/loodgieter-lekkage-haarlem/', google: { vertoningen: 120, klikken: 3, positie: 8.4 }, ai: null },
  { id: 'c', titel: 'Inloopdouche laten plaatsen', stand: 'Gepland', schrijfOp: '2026-11-09', reden: 'Mensen zoeken gericht <naar> een inloopdouche.' },
  { id: 'd', titel: 'Badkamer verbouwen in Heemstede', stand: 'Gepland', schrijfOp: '2026-11-19', reden: 'Lokaal.' },
  { id: 'e', titel: 'Cv ketel Haarlem', stand: 'In de maak' },
  { id: 'f', titel: 'Dakkapel idee', stand: 'Gepland', vanKlant: true, schrijfOp: '', reden: 'Jullie idee, wij beoordelen het.' }
];

test('agenda: alleen dagen met iets erop, per maand, vandaag op de goede plek', () => {
  const m = A.agendaModel(paginas, '2026-10-26', { perMaand: 2 });
  assert.deepEqual(m.maanden.map((x) => x.maand), ['2026-10', '2026-11', '2026-12']);
  const okt = m.maanden[0];
  assert.deepEqual(okt.regels.map((r) => r.soort), ['dag', 'vandaag']);
  assert.equal(okt.regels[0].items.length, 2);
  assert.equal(okt.regels[0].datum, '2026-10-23');
  assert.equal(okt.regels[1].items[0].id, 'e');
  assert.equal(okt.samenvatting, '2 live · 1 in de maak');
  const nov = m.maanden[1];
  assert.deepEqual(nov.regels.map((r) => r.dag), [9, 19]);
  assert.equal(nov.regels[0].weekdag, 'ma');
  const dec = m.maanden[2];
  assert.equal(dec.regels[0].items[0].soort, 'plan');
  assert.equal(dec.samenvatting, 'plan volgt');
  assert.deepEqual(m.zonderDatum.map((p) => p.id), ['f']);
  assert.deepEqual(m.telling, { alles: 6, komt: 4, live: 2 });
});

test('agenda: vandaag tussen twee dagen in dezelfde maand', () => {
  const m = A.agendaModel([{ id: 'x', titel: 'X', stand: 'Live', liveDatum: '2026-11-03' }, { id: 'y', titel: 'Y', stand: 'Gepland', schrijfOp: '2026-11-20' }], '2026-11-10', {});
  assert.deepEqual(m.maanden[0].regels.map((r) => r.soort), ['dag', 'vandaag', 'dag']);
});

test('agenda: filter live laat geen vandaag en geen maandplan zien, filter komt geen live pagina', () => {
  const live = A.agendaModel(paginas, '2026-10-26', { filter: 'live', perMaand: 2 });
  assert.deepEqual(live.maanden.map((x) => x.maand), ['2026-10']);
  assert.ok(live.maanden[0].regels.every((r) => r.soort === 'dag'));
  const komt = A.agendaModel(paginas, '2026-10-26', { filter: 'komt', perMaand: 2 });
  const html = A.agendaHtml(komt, meting, '2026-10-26');
  assert.ok(!html.includes('Loodgieter'));
  assert.ok(html.includes('Inloopdouche'));
  assert.ok(html.includes('Maandplan december 2026: we kiezen 2 nieuwe pagina\'s'));
});

test('agenda zonder maandplan als er geen aantal per maand is', () => {
  const m = A.agendaModel(paginas, '2026-10-26', { perMaand: null });
  assert.deepEqual(m.maanden.map((x) => x.maand), ['2026-10', '2026-11']);
});

test('html: cijfers, reden ontsnapt, vandaag en zonder datum', () => {
  const html = A.agendaHtml(A.agendaModel(paginas, '2026-10-26', { perMaand: 2 }), meting, '2026-10-26');
  assert.ok(html.includes('VANDAAG, 26 OKT'));
  assert.ok(html.includes('nog geen vertoningen'));
  assert.ok(html.includes('120 keer getoond'));
  assert.ok(html.includes('hirs-installaties.nl/badkamer-renoveren-haarlem'));
  assert.ok(html.includes('&lt;naar&gt;'));
  assert.ok(!html.includes('<naar>'));
  assert.ok(html.includes('NOG ZONDER DATUM'));
  assert.ok(html.includes('Wordt geschreven rond 9 nov'));
  assert.ok(!html.includes('undefined'));
});

test('volgende pagina: eerst wat in de maak is, anders de vroegste geplande', () => {
  assert.equal(A.volgendePagina(paginas, '2026-10-26').p.id, 'e');
  const zonder = paginas.filter((p) => p.stand !== 'In de maak');
  const v = A.volgendePagina(zonder, '2026-10-26');
  assert.equal(v.p.id, 'c');
  assert.equal(v.tekst, '9 nov');
  assert.equal(A.volgendePagina([], '2026-10-26'), null);
});

test('paneel: stappen en teksten per stand', () => {
  const live = A.paneelHtml(paginas[0], meting);
  assert.ok(live.includes('Live gezet') && live.includes('23 oktober 2026'));
  assert.ok(live.includes('Complete badkamers.'));
  assert.ok(live.includes('Bekijk de pagina'));
  assert.ok(live.includes('pa-stap-komt'));
  const gepland = A.paneelHtml(paginas[2], meting);
  assert.ok(gepland.includes('Deze pagina schrijven we rond 9 november 2026'));
  const idee = A.paneelHtml(paginas[5], meting);
  assert.ok(idee.includes('Dit is jullie idee'));
  const bezig = A.stappen(paginas[4], meting);
  assert.equal(bezig[1].stand, 'bezig');
  assert.equal(A.stappen({ stand: 'Ter controle' }, meting)[2].stand, 'bezig');
});

test('scores: zonder meting staat er nog niet gemeten, geen tabel zonder live pagina', () => {
  const html = A.scoreHtml(paginas, { google: false, ai: false });
  assert.ok(html.includes('nog niet gemeten'));
  assert.ok(html.indexOf('Loodgieter') < html.indexOf('Badkamer renoveren'));
  assert.equal(A.scoreHtml(paginas.filter((p) => p.stand !== 'Live'), meting), '');
});

test('plan: aantal per maand en volgend maandplan', () => {
  const html = A.planHtml(2, '2026-10-26', paginas);
  assert.ok(html.includes('<b>2</b>'));
  assert.ok(html.includes('1 december'));
  assert.ok(A.planHtml(2, '2026-10-26', []).includes('1 november'));
  assert.equal(A.volgendPlan([], '2026-12-15'), '2027-01');
  assert.ok(!A.planHtml(null, '2026-10-26').includes('Volgend maandplan'));
});
