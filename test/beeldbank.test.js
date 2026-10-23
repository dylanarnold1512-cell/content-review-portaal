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

test('verwijderen stuurt de juiste actie en weigert een ongeldig bestandsnummer', async () => {
  const { verwijderAfbeelding, ruimOp } = require('../src/services/beeldbank');
  const ongeldig = await verwijderAfbeelding('Test', '../x');
  assert.equal(ongeldig.status, 'fout');
  const orig = global.fetch;
  const aanroepen = [];
  global.fetch = async (url, opties) => { aanroepen.push({ url, body: JSON.parse(opties.body) }); return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'verwijderd' }) }; };
  try {
    const a = await verwijderAfbeelding('Hirs Installaties', '1AbCdEfGhIjKlMn');
    assert.equal(a.status, 'verwijderd');
    assert.equal(aanroepen[0].body.actie, 'verwijder');
    assert.equal(aanroepen[0].body.driveFileId, '1AbCdEfGhIjKlMn');
    assert.match(aanroepen[0].url, /beeldbank-verwijder$/);
    await ruimOp('Hirs Installaties');
    assert.equal(aanroepen[1].body.actie, 'opschonen');
  } finally { global.fetch = orig; }
});
