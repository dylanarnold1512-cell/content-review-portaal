const test = require('node:test');
const assert = require('node:assert/strict');
const mammoth = require('mammoth');
const { haalNextStepsDocx } = require('../src/services/pakket');

test('haalNextStepsDocx geeft elk genummerd punt als een regel met titel en uitleg', async () => {
  const orig = mammoth.convertToHtml;
  mammoth.convertToHtml = async () => ({ value: '<h2>Website</h2><p>Tekst.</p><h1>Next steps</h1><ol><li><strong>Eerste punt<br /></strong>Uitleg een.</li><li><strong>Tweede punt<br /></strong>Uitleg twee.</li></ol><h1>Bijlage</h1><ol><li>Niet meenemen</li></ol>' });
  try {
    const r = await haalNextStepsDocx(Buffer.from(''));
    assert.deepEqual(r, ['Eerste punt: Uitleg een.', 'Tweede punt: Uitleg twee.']);
  } finally { mammoth.convertToHtml = orig; }
});
