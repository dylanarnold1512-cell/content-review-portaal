const test = require('node:test');
const assert = require('node:assert/strict');
const { isBulkKandidaat } = require('../src/lp/bulkKandidaat');

test('bulk neemt alleen goedgekeurde of eigen pagina\'s mee', () => {
  assert.equal(isBulkKandidaat('goedgekeurd'), true);
  assert.equal(isBulkKandidaat(undefined), true);
  assert.equal(isBulkKandidaat('voorgesteld'), false);
  assert.equal(isBulkKandidaat('idee van klant'), false);
});
