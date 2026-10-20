const test = require('node:test');
const assert = require('node:assert/strict');
const { beeldbankAan, stuurAfbeelding } = require('../src/services/beeldbank');

test('beeldbank staat uit tenzij de klant hem aan heeft', () => {
  delete process.env.BEELDBANK_KLANTEN;
  assert.equal(beeldbankAan({ id: 'ppe' }), false);
  assert.equal(beeldbankAan({ id: 'nieuw', beeldbank: true }), true);
  process.env.BEELDBANK_KLANTEN = 'hirs-installaties, andere';
  assert.equal(beeldbankAan({ id: 'Hirs-Installaties' }), true);
  assert.equal(beeldbankAan({ id: 'ppe' }), false);
  delete process.env.BEELDBANK_KLANTEN;
});

test('een verkeerd bestandstype of lege afbeelding gaat niet naar n8n', async () => {
  const fout1 = await stuurAfbeelding('Test', { mime: 'image/gif', dataBase64: 'A'.repeat(500) });
  assert.equal(fout1.status, 'fout');
  const fout2 = await stuurAfbeelding('Test', { mime: 'image/webp', dataBase64: 'AAAA' });
  assert.equal(fout2.status, 'fout');
  const fout3 = await stuurAfbeelding('Test', { mime: 'image/webp', dataBase64: 'A'.repeat(6000001) });
  assert.equal(fout3.status, 'fout');
});
