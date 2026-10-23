const test = require('node:test');
const assert = require('node:assert/strict');
const { schrijfDatums, isRijp, planZelfstandig, bouwPlanning, vandaagAms } = require('../src/lp/planning');
const { maakKlantLijst } = require('../src/lp/klantPaginas');

test('schrijfdatums: gespreid over werkdagen, nooit twee op een dag, binnen de maand', () => {
  const d = schrijfDatums(2, '2026-11', '2026-10-23');
  assert.deepEqual(d, ['2026-11-09', '2026-11-19']);
  const vier = schrijfDatums(4, '2026-10', '2026-10-23');
  assert.equal(new Set(vier).size, 4);
  vier.forEach((x) => { const dag = new Date(`${x}T12:00:00Z`).getUTCDay(); assert.ok(dag !== 0 && dag !== 6, x); });
  assert.deepEqual(schrijfDatums(0, '2026-11', '2026-10-23'), []);
  assert.equal(schrijfDatums(1, '2026-11', '2026-10-23').length, 1);
});

test('rijp als de datum is gekomen en de pagina is ingepland', () => {
  assert.equal(isRijp({ status: 'ingepland', schrijfOp: '2026-11-09' }, '2026-11-09'), true);
  assert.equal(isRijp({ status: 'ingepland', schrijfOp: '2026-11-09' }, '2026-11-08'), false);
  assert.equal(isRijp({ status: 'voorgesteld', schrijfOp: '2026-11-01' }, '2026-11-09'), false);
  assert.equal(isRijp({ status: 'goedgekeurd', schrijfOp: '2026-11-01' }, '2026-11-09'), false);
  assert.equal(isRijp(null, '2026-11-09'), false);
});

test('zelfstandig plannen is de standaard, alleen autoPlan false vraagt akkoord', () => {
  assert.equal(planZelfstandig({}), true);
  assert.equal(planZelfstandig(null), true);
  assert.equal(planZelfstandig({ autoPlan: true }), true);
  assert.equal(planZelfstandig({ autoPlan: false }), false);
});

test('planning: op datum, met reden, voorstellen wachten en klantidee zonder datum', () => {
  const p = bouwPlanning([
    { id: '2', titel: 'B', stand: 'Gepland', invoer: { plan: { status: 'ingepland', schrijfOp: '2026-11-19', reden: 'rb', maand: '2026-11' } } },
    { id: '1', titel: 'A', stand: 'Gepland', invoer: { plan: { status: 'ingepland', schrijfOp: '2026-11-09', reden: 'ra', maand: '2026-11', volume: 50 } } },
    { id: '3', titel: 'C', stand: 'Gepland', invoer: { plan: { status: 'voorgesteld', reden: 'rc' } } },
    { id: '4', titel: 'D', stand: 'Gepland', invoer: { plan: { status: 'idee van klant', toelichting: 'tl' } } },
    { id: '5', titel: 'E', stand: 'Live', invoer: {} }
  ]);
  assert.deepEqual(p.map((x) => x.id), ['1', '2', '3', '4']);
  assert.equal(p[0].volume, 50);
  assert.equal(p[2].wacht, true);
  assert.equal(p[3].vanKlant, true);
});

test('vandaag is een datum in Amsterdam', () => {
  assert.match(vandaagAms(), /^\d{4}-\d{2}-\d{2}$/);
});

test('klant ziet de schrijfdatum van een ingeplande pagina, niet van een klantidee', () => {
  const l = maakKlantLijst([{ id: '1', titel: 'A', status: 'Idee' }, { id: '2', titel: 'B', status: 'Idee' }], {
    1: { plan: { status: 'ingepland', schrijfOp: '2026-11-09', reden: 'r' } },
    2: { plan: { status: 'idee van klant', schrijfOp: '2026-11-10' } }
  });
  assert.equal(l[0].schrijfOp, '2026-11-09');
  assert.equal(l[1].schrijfOp, '');
});
