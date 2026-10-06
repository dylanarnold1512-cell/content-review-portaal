const test = require('node:test');
const assert = require('node:assert');
const { normaliseerKeyword, vergelijkKeywords, vindOverlap } = require('../src/services/dubbelingen');

test('normaliseert volgorde, hoofdletters en stopwoorden', () => {
  assert.strictEqual(normaliseerKeyword('Vergaderruimte huren in Utrecht'), normaliseerKeyword('utrecht vergaderruimte huren'));
});

test('zelfde en deels overlappend keyword', () => {
  assert.strictEqual(vergelijkKeywords('teamdag utrecht', 'Utrecht teamdag'), 'zelfde');
  assert.strictEqual(vergelijkKeywords('teamdag utrecht', 'teamdag utrecht nieuwe teams'), 'deels');
  assert.strictEqual(vergelijkKeywords('teamdag', 'teamdag utrecht'), null);
  assert.strictEqual(vergelijkKeywords('', 'teamdag utrecht'), null);
});

test('vindOverlap slaat zichzelf over', () => {
  const idee = { id: '1', mainKeyword: 'vergaderruimte huren utrecht' };
  const res = vindOverlap(idee, [
    idee,
    { id: '2', titel: 'Oud', status: 'Gepland', mainKeyword: 'vergaderruimte huren utrecht' },
    { id: '3', titel: 'Anders', status: 'Gepland', mainKeyword: 'catering' }
  ]);
  assert.deepStrictEqual(res.map((r) => r.id), ['2']);
});
