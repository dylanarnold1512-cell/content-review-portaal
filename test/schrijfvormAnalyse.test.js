const test = require('node:test');
const assert = require('node:assert');
const { analyseerSchrijfvorm } = require('../src/lp/schrijfvormAnalyse');

const vul = (zin, n) => Array(n).fill(zin).join(' ');

test('wij-vorm met weinig bedrijfsnaam geeft wij', () => {
  const tekst = vul('Wij helpen je bij je badkamer en we denken met je mee over onze aanpak.', 30);
  const r = analyseerSchrijfvorm([{ titel: 'a', tekst: tekst + ' Hirs Installaties' }, { titel: 'b', tekst }], 'Hirs Installaties');
  assert.strictEqual(r.schrijfvorm, 'wij');
  assert.ok(r.zeker);
});

test('veel bedrijfsnaam en weinig wij geeft derde', () => {
  const tekst = vul('Hirs Installaties verzorgt het werk en de klant krijgt een offerte van het bedrijf.', 30);
  const r = analyseerSchrijfvorm([{ titel: 'a', tekst }, { titel: 'b', tekst }], 'Hirs Installaties');
  assert.strictEqual(r.schrijfvorm, 'derde');
});

test('naam en wij samen geeft mix', () => {
  const tekst = vul('Wij werken netjes. Hirs Installaties plaatst elke dag badkamers voor klanten uit de regio.', 20) + ' ' + vul('Hirs Installaties levert kwaliteit.', 2);
  const r = analyseerSchrijfvorm([{ titel: 'a', tekst }, { titel: 'b', tekst }], 'Hirs Installaties');
  assert.strictEqual(r.schrijfvorm, 'mix');
});

test('te weinig tekst is niet zeker en valt terug op wij', () => {
  const r = analyseerSchrijfvorm([{ titel: 'a', tekst: 'Korte tekst.' }], 'Hirs Installaties');
  assert.strictEqual(r.schrijfvorm, 'wij');
  assert.strictEqual(r.zeker, false);
});

test('B.V. in de naam telt de kale naam ook mee', () => {
  const tekst = vul('Hirs Installaties levert kwaliteit en zorg voor de klant.', 40);
  const r = analyseerSchrijfvorm([{ titel: 'a', tekst }, { titel: 'b', tekst }], 'Hirs Installaties B.V.');
  assert.ok(r.naamPerPagina >= 40);
});
