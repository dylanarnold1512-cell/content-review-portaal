const test = require('node:test');
const assert = require('node:assert/strict');
const { wachtOpJou } = require('../src/lp/wachtOpJou');

test('telt controleren, mislukt en ideeen', () => {
  const r = wachtOpJou([
    { id: '1', titel: 'A', status: 'Content klaar' },
    { id: '2', titel: 'B', status: 'Ter review' },
    { id: '3', titel: 'C', status: 'Fout' },
    { id: '4', titel: 'D', status: 'Gepubliceerd' },
    { id: '5', titel: 'E', status: 'Idee' }
  ], 2);
  assert.equal(r.controleren.length, 2);
  assert.equal(r.fout.length, 1);
  assert.equal(r.ideeen, 2);
  assert.equal(r.totaal, 5);
});

test('lege invoer geeft nul', () => {
  assert.equal(wachtOpJou().totaal, 0);
});
