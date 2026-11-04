const test = require('node:test');
const assert = require('node:assert/strict');
const { datumNl, bouwPayload, stuurIdeeIngepland } = require('../src/services/ideeMelding');

test('datumNl schrijft een datum in gewoon Nederlands', () => {
  assert.equal(datumNl('2027-03-02'), '2 maart 2027');
  assert.equal(datumNl('2027-02-09T00:00:00.000Z'), '9 februari 2027');
  assert.equal(datumNl(''), '');
  assert.equal(datumNl('onzin'), '');
});

test('bouwPayload neemt klant, titel en datum mee', () => {
  const p = bouwPayload({ naam: 'Basecamp Utrecht' }, 'basecamp-utrecht', { id: 'abc', titel: 'Activiteiten bij je evenement', publicatiedatum: '2027-03-02' });
  assert.deepEqual(p, { clientNaam: 'Basecamp Utrecht', portaalSlug: 'basecamp-utrecht', pageId: 'abc', blogTitel: 'Activiteiten bij je evenement', publicatiedatum: '2027-03-02', publicatiedatumTekst: '2 maart 2027' });
});

test('stuurIdeeIngepland roept de webhook aan en gooit nooit een fout', async () => {
  let url = ''; let body = null;
  const ok = await stuurIdeeIngepland({ naam: 'X' }, 'x', { id: '1', titel: 'T', publicatiedatum: '2027-03-02' }, async (u, o) => { url = u; body = JSON.parse(o.body); return { ok: true }; });
  assert.equal(ok, true);
  assert.match(url, /\/webhook\/stuur-idee-ingepland$/);
  assert.equal(body.blogTitel, 'T');
  const mis = await stuurIdeeIngepland({ naam: 'X' }, 'x', { id: '1' }, async () => { throw new Error('netwerk'); });
  assert.equal(mis, false);
});
