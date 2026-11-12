const test = require('node:test');
const assert = require('node:assert');
const klantvragen = require('../src/services/klantvragen');

test('kennisRegel: vraag en antwoord achter elkaar op een regel', () => {
  assert.strictEqual(klantvragen.kennisRegel('Kunnen groepen in het weekend vergaderen?', 'Ja.'), 'Kunnen groepen in het weekend vergaderen? Ja.');
  assert.strictEqual(klantvragen.kennisRegel('Vraag?\n', '  Nee,   alleen op zaterdag. '), 'Vraag? Nee, alleen op zaterdag.');
});
