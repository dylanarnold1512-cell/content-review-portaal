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

test('haalNextStepsDocx leest ook punten met de uitleg in de alinea na de lijst en een kop met anker', async () => {
  const orig = mammoth.convertToHtml;
  mammoth.convertToHtml = async () => ({ value: '<h3><a id="_h"></a>Next steps</h3><ol><li><strong>Punt een</strong></li></ol><p>Uitleg een.</p><ol><li><strong>Punt twee</strong></li></ol><p>Uitleg twee.</p><p>Meer uitleg twee.</p>' });
  try {
    const r = await haalNextStepsDocx(Buffer.from(''));
    assert.deepEqual(r, ['Punt een: Uitleg een.', 'Punt twee: Uitleg twee. Meer uitleg twee.']);
  } finally { mammoth.convertToHtml = orig; }
});
