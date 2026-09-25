const test = require('node:test');
const assert = require('node:assert/strict');
const { isOntbrekendeSelectOptie } = require('../src/lp/utils');

test('isOntbrekendeSelectOptie herkent de Notion-fout voor een keuzewaarde die nog niet bestaat', () => {
  const err = new Error('select option "macbouw" not found for property "Klant". Available options: "roots", "jmb".');
  assert.equal(isOntbrekendeSelectOptie(err), true);
});

test('isOntbrekendeSelectOptie negeert andere fouten', () => {
  assert.equal(isOntbrekendeSelectOptie(new Error('Unauthorized')), false);
  assert.equal(isOntbrekendeSelectOptie(null), false);
  assert.equal(isOntbrekendeSelectOptie(undefined), false);
});
