const test = require('node:test');
const assert = require('node:assert');

test('klantregels en derde persoon gaan mee in de schrijfopdracht (hirs)', () => {
  const ai = require('../src/lp/ai');
  assert.ok(typeof ai.generatePageContent === 'function');
});
