const test = require('node:test');
const assert = require('node:assert/strict');
const { huidigeMaand, moetPlannen, isPlanVanMaand, invoerVoorVoorgesteld, maandNaam } = require('../src/lp/maandplan');

test('huidigeMaand telt in Amsterdamse tijd', () => {
  assert.equal(huidigeMaand(new Date('2026-10-31T23:30:00Z')), '2026-11');
  assert.equal(huidigeMaand(new Date('2026-11-15T12:00:00Z')), '2026-11');
});

test('moetPlannen alleen met module, aantal en nog geen plan', () => {
  assert.equal(moetPlannen({ pagr: true, paginasPerMaand: 4, planBestaat: false, gedaan: false }), true);
  assert.equal(moetPlannen({ pagr: false, paginasPerMaand: 4 }), false);
  assert.equal(moetPlannen({ pagr: true, paginasPerMaand: null }), false);
  assert.equal(moetPlannen({ pagr: true, paginasPerMaand: 4, planBestaat: true }), false);
  assert.equal(moetPlannen({ pagr: true, paginasPerMaand: 4, gedaan: true }), false);
});

test('isPlanVanMaand herkent voorgesteld en goedgekeurd plan', () => {
  assert.equal(isPlanVanMaand({ invoer: { plan: { status: 'voorgesteld', maand: '2026-11' } } }, '2026-11'), true);
  assert.equal(isPlanVanMaand({ invoer: { plan: { status: 'goedgekeurd', goedgekeurdOp: '2026-11-03' } } }, '2026-11'), true);
  assert.equal(isPlanVanMaand({ invoer: { plan: { maand: '2026-10' } } }, '2026-11'), false);
  assert.equal(isPlanVanMaand({ invoer: {} }, '2026-11'), false);
});

test('voorgesteld plan heeft stand voorgesteld en een onderwerp', () => {
  const inv = invoerVoorVoorgesteld({ titel: 'Dakkapel Lisse', dienst: 'dakkapel', plaats: 'Lisse', reden: 'Kerndienst' }, '2026-11');
  assert.equal(inv.plan.status, 'voorgesteld');
  assert.equal(inv.plan.maand, '2026-11');
  assert.match(inv._watGaatDezePaginaOver, /dakkapel in Lisse/);
  assert.equal(maandNaam('2026-11'), 'november');
});

test('Geen van beide is een geldig product zonder Blogr. of Pagr.', () => {
  const s = require('../src/services/settings');
  assert.ok(s.PRODUCT_WAARDEN.includes('Geen van beide'));
  assert.equal(s.normaliseerProducten('Geen van beide'), 'Geen van beide');
  assert.equal(s.normaliseerProducten(''), 'Blogr.');
});
