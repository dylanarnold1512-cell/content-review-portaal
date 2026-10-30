const test = require('node:test');
const assert = require('node:assert/strict');
const { beeldbankAan, stuurAfbeelding } = require('../src/services/beeldbank');

test('beeldbank staat aan voor elke klant met een Drive beeldmap', async () => {
  delete process.env.BEELDBANK_KLANTEN;
  const metMap = async () => [{ beeld_map_id: '1VgNFyrMLE8kix_fCr8CidWDEvXBELe1m' }];
  const zonderMap = async () => [{ beeld_map_id: '  ' }];
  const kapot = async () => { throw new Error('n8n down'); };
  assert.equal(await beeldbankAan({ id: 'a', naam: 'Klant Met Map' }, metMap), true);
  assert.equal(await beeldbankAan({ id: 'b', naam: 'Klant Zonder Map' }, zonderMap), false);
  assert.equal(await beeldbankAan({ id: 'c', naam: 'Klant Kapot' }, kapot), false);
  assert.equal(await beeldbankAan({ id: 'd', naam: 'Uit', beeldbank: false }, metMap), false);
  assert.equal(await beeldbankAan({ id: 'e', naam: 'Aan', beeldbank: true }, zonderMap), true);
  process.env.BEELDBANK_KLANTEN = 'hirs-installaties, andere';
  assert.equal(await beeldbankAan({ id: 'Hirs-Installaties', naam: 'Hirs' }, zonderMap), true);
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
