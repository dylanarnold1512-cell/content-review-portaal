const test = require('node:test');
const assert = require('node:assert');
const A = require('../public/publiceren-aanbod');

const sv = { review: 'Ter review', approved: 'Goedgekeurd', published: 'Gepubliceerd' };
const blogs = (...st) => st.map((status, i) => ({ id: String(i), status }));
const beschikbaar = { beschikbaar: true, aan: false };

test('telGoedgekeurd telt goedgekeurde en live blogs, niet de rest', () => {
  assert.strictEqual(A.telGoedgekeurd(blogs('Gepubliceerd', 'Goedgekeurd', 'Ter review', 'Idee', 'Afgewezen'), sv), 2);
  assert.strictEqual(A.telGoedgekeurd([], sv), 0);
  assert.strictEqual(A.telGoedgekeurd(undefined, sv), 0);
});

test('aanbod komt pas vanaf 3 goedgekeurde of live blogs', () => {
  const twee = blogs('Gepubliceerd', 'Goedgekeurd', 'Ter review');
  const drie = blogs('Gepubliceerd', 'Goedgekeurd', 'Goedgekeurd', 'Ter review');
  assert.strictEqual(A.moetAanbodTonen({ stand: beschikbaar, items: twee, statusValues: sv }), false);
  assert.strictEqual(A.moetAanbodTonen({ stand: beschikbaar, items: drie, statusValues: sv }), true);
});

test('aanbod blijft weg bij wegklikken, bij automatisch publiceren aan en bij eigen workflows', () => {
  const drie = blogs('Gepubliceerd', 'Goedgekeurd', 'Goedgekeurd');
  assert.strictEqual(A.moetAanbodTonen({ stand: beschikbaar, items: drie, statusValues: sv, weggeklikt: true }), false);
  assert.strictEqual(A.moetAanbodTonen({ stand: { beschikbaar: true, aan: true }, items: drie, statusValues: sv }), false);
  assert.strictEqual(A.moetAanbodTonen({ stand: { beschikbaar: false, aan: false }, items: drie, statusValues: sv }), false);
  assert.strictEqual(A.moetAanbodTonen({ items: drie, statusValues: sv }), false);
});

test('label Nieuw: bij elke klant waar het kan, tot de klant het tabblad opent', () => {
  assert.strictEqual(A.moetNieuwTonen({ stand: beschikbaar, gezien: false }), true);
  assert.strictEqual(A.moetNieuwTonen({ stand: beschikbaar, gezien: true }), false);
  assert.strictEqual(A.moetNieuwTonen({ stand: { beschikbaar: true, aan: true }, gezien: false }), true);
  assert.strictEqual(A.moetNieuwTonen({ stand: { beschikbaar: true, aan: true }, gezien: true }), false);
  assert.strictEqual(A.moetNieuwTonen({ stand: { beschikbaar: false }, gezien: false }), false);
  assert.strictEqual(A.moetNieuwTonen({}), false);
});
