const test = require('node:test');
const assert = require('node:assert/strict');
const { extraheerTekst, bepaalType } = require('../src/services/documentTekst');

test('bepaalType herkent bestandstype op extensie, ook als contentType ontbreekt of afwijkt', () => {
  assert.equal(bepaalType('kennis.docx', ''), 'docx');
  assert.equal(bepaalType('kennis.PDF', 'application/octet-stream'), 'pdf');
  assert.equal(bepaalType('notities.txt', ''), 'txt');
  assert.equal(bepaalType('notities.md', ''), 'txt');
  assert.equal(bepaalType('oud.doc', ''), 'doc');
  assert.equal(bepaalType('onbekend.xyz', ''), null);
});

test('bepaalType valt terug op contentType als de extensie niet herkend wordt', () => {
  assert.equal(bepaalType('bestand', 'application/pdf'), 'pdf');
  assert.equal(bepaalType('bestand', 'text/plain'), 'txt');
});

test('extraheerTekst geeft platte tekst terug voor een .txt-bestand, getrimd', async () => {
  const tekst = await extraheerTekst({
    filename: 'notities.txt',
    contentType: 'text/plain',
    buffer: Buffer.from('  Belangrijke informatie over de klant.  \n')
  });
  assert.equal(tekst, 'Belangrijke informatie over de klant.');
});

test('extraheerTekst geeft een duidelijke foutmelding bij het oude .doc-formaat', async () => {
  await assert.rejects(
    extraheerTekst({ filename: 'oud.doc', contentType: '', buffer: Buffer.from('x') }),
    /\.docx of \.pdf/
  );
});

test('extraheerTekst geeft een duidelijke foutmelding bij een onbekend bestandstype', async () => {
  await assert.rejects(
    extraheerTekst({ filename: 'foto.png', contentType: 'image/png', buffer: Buffer.from('x') }),
    /Onbekend bestandstype/
  );
});
