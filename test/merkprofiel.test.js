const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseProfiel, regelId, splitsHerkomst, bouwWeergave, bouwKennisdocument, KOPJES } = require('../src/services/merkprofiel');

const tekst = fs.readFileSync(path.join(__dirname, 'fixtures', 'basecamp-profiel.txt'), 'utf8');

test('parseProfiel vindt alle tien kopjes in de goede volgorde', () => {
  const secties = parseProfiel(tekst);
  assert.ok(secties);
  assert.strictEqual(secties.length, 10);
  assert.deepStrictEqual(secties.map((s) => s.titel), KOPJES);
  secties.slice(0, 9).forEach((s) => assert.ok(s.feiten.length > 0, `sectie ${s.nr} heeft feiten`));
});

test('parseProfiel geeft null zonder de vaste kopjes', () => {
  assert.strictEqual(parseProfiel('Gewoon een lap tekst zonder kopjes.'), null);
  assert.strictEqual(parseProfiel(''), null);
  assert.strictEqual(parseProfiel('1. Over het bedrijf\nEen feit. (website: /)'), null);
});

test('splitsHerkomst haalt PDF en paden uit de herkomst', () => {
  const r = splitsHerkomst('De ruimte is groot. (PDF, website: /vergaderen/tipi, website: /contact)');
  assert.strictEqual(r.tekst, 'De ruimte is groot.');
  assert.strictEqual(r.herkomst.pdf, true);
  assert.deepStrictEqual(r.herkomst.paginas, ['/vergaderen/tipi', '/contact']);
  const z = splitsHerkomst('Zonder herkomst.');
  assert.strictEqual(z.herkomst.pdf, false);
  assert.strictEqual(z.herkomst.website, false);
});

test('prijzen krijgen het label intern en subkoppen worden herkend', () => {
  const secties = parseProfiel(tekst);
  const s8 = secties[7];
  const prijzen = s8.feiten.filter((f) => f.intern);
  assert.ok(prijzen.length > 5);
  assert.ok(s8.feiten.some((f) => f.subkop === 'Ruimtegegevens'));
  assert.ok(!s8.feiten.some((f) => f.tekst === 'Ruimtegegevens'));
});

test('regelId is stabiel en negeert hoofdletters en witruimte', () => {
  assert.strictEqual(regelId('Een  Feit'), regelId('een feit'));
  assert.notStrictEqual(regelId('een feit'), regelId('een ander feit'));
});

test('bouwWeergave telt bevestigde secties en verzamelt open vragen', () => {
  const secties = parseProfiel(tekst);
  const eerste = secties[0].feiten[0].id;
  const w = bouwWeergave(secties, { 'sectie-1': { status: 'klopt', datum: '2026-10-06' }, [eerste]: { status: 'niet_gebruiken', opmerking: 'x' } }, { bijgewerkt: '2026-10-06', aantalPaginas: 24 });
  assert.strictEqual(w.aantalBevestigd, 1);
  assert.strictEqual(w.secties[0].bevestigd, true);
  assert.strictEqual(w.secties[0].feiten[0].status, 'niet_gebruiken');
  assert.ok(w.openVragen.some((v) => /bevestigd/i.test(v.tekst)));
});

test('bouwKennisdocument laat uitgesloten feiten en open punten weg en past tekst aan', () => {
  const secties = parseProfiel(tekst);
  const uit = secties[1].feiten[0];
  const aan = secties[1].feiten[1];
  const open = secties[2].feiten.find((f) => f.open) || secties.flatMap((x) => x.feiten).find((f) => f.open);
  const regel9 = secties[8].feiten[0];
  const doc = bouwKennisdocument(secties, {
    [uit.id]: { status: 'niet_gebruiken', opmerking: '' },
    [aan.id]: { status: 'aangepast', opmerking: 'Nieuwe tekst van de klant.' },
    [regel9.id]: { status: 'niet_gebruiken', opmerking: '' }
  });
  assert.ok(!doc.includes(uit.tekst));
  assert.ok(doc.includes('Nieuwe tekst van de klant. (klant bevestigd)'));
  assert.ok(!doc.includes(aan.tekst));
  assert.ok(doc.includes(regel9.tekst), 'sectie 9 kan niet worden uitgesloten');
  assert.ok(!doc.includes(open.tekst));
  assert.ok(doc.startsWith('1. Over het bedrijf'));
});

test('aangepast open punt verdwijnt uit de open vragen', () => {
  const secties = parseProfiel(tekst);
  const open = secties.flatMap((x) => x.feiten).find((f) => f.open);
  const w = bouwWeergave(secties, { [open.id]: { status: 'aangepast', opmerking: 'Het zijn acht ruimtes.' } }, { bijgewerkt: '', aantalPaginas: 0 });
  assert.ok(!w.openVragen.some((v) => v.tekst === open.tekst));
});

test('parseMerktermen splitst op puntkomma, trimt en ontdubbelt', () => {
  const { parseMerktermen } = require('../src/services/merkprofiel');
  assert.deepEqual(parseMerktermen(' the base; Red Room ;;the base '), ['the base', 'Red Room']);
  assert.deepEqual(parseMerktermen(''), []);
  assert.deepEqual(parseMerktermen(null), []);
});
