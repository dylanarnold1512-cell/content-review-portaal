const test = require('node:test');
const assert = require('node:assert');
const { verwijderPlaceholderWaarden } = require('../src/lp/ai');

test('Niet vermeld in een lijstveld wordt leeg', () => {
  const d = { reviewItems: [{ name: 'Sylvia', project: 'Niet vermeld' }, { name: 'Fung', project: 'Onbekend.' }, { name: 'JM', project: 'n.v.t.' }] };
  verwijderPlaceholderWaarden(d);
  assert.deepStrictEqual(d.reviewItems.map((i) => i.project), ['', '', '']);
  assert.strictEqual(d.reviewItems[0].name, 'Sylvia');
});

test('echte waarden en losse tekstvelden blijven staan', () => {
  const d = { heroTitle: 'Geen gedoe', reviewItems: [{ project: 'Verbouwing' }, { project: 'Geen gedoe bij de oplevering' }] };
  verwijderPlaceholderWaarden(d);
  assert.strictEqual(d.heroTitle, 'Geen gedoe');
  assert.strictEqual(d.reviewItems[0].project, 'Verbouwing');
  assert.strictEqual(d.reviewItems[1].project, 'Geen gedoe bij de oplevering');
});
