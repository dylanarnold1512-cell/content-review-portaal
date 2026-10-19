const test = require('node:test');
const assert = require('node:assert');
const { verdeelIconen } = require('../src/lp/ai');
const { ICON_NAMES } = require('../src/lp/slotEngine');

test('dubbele iconen in een lijst worden vervangen door een passend vrij icoon', () => {
  const d = { offerItems: [
    { icon: 'home', title: 'Verbouw en uitbreiding', text: '' },
    { icon: 'home', title: 'Renovatie', text: '' },
    { icon: 'shield', title: 'Timmerwerk', text: '' }
  ] };
  verdeelIconen(d);
  const iconen = d.offerItems.map((i) => i.icon);
  assert.strictEqual(new Set(iconen).size, 3);
  assert.strictEqual(d.offerItems[1].icon, 'layers');
  iconen.forEach((i) => assert.ok(ICON_NAMES.includes(i)));
});

test('lijsten zonder dubbele iconen blijven ongemoeid', () => {
  const d = { usp: [{ icon: 'check', title: 'a' }, { icon: 'users', title: 'b' }] };
  verdeelIconen(d);
  assert.deepStrictEqual(d.usp.map((i) => i.icon), ['check', 'users']);
});
