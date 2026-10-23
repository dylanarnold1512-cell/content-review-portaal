const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/services/merkprofiel');

const spoed = 'Niet beweren dat Hirs Installaties een spoeddienst aanbiedt; dit is niet gevonden op de website, vraag aan de klant.';
const prijzen = 'Niet beweren dat het bedrijf vaste prijzen, vanaf-prijzen, tarieven of prijsindicaties hanteert; prijzen zijn niet gevonden op de website, vraag aan de klant.';

test('een voorzorgsregel wordt herkend', () => {
  assert.equal(m.isVoorzorgsregel(spoed), true);
  assert.equal(m.isVoorzorgsregel('Niet noemen dat we 24 uur bereikbaar zijn'), true);
  assert.equal(m.isVoorzorgsregel('Geverifieerde feiten: niet gevonden op de website, vraag aan de klant.'), false);
});

test('de vraag aan de klant verdwijnt uit een voorzorgsregel', () => {
  assert.equal(m.schoneVoorzorgsregel(spoed), 'Niet beweren dat Hirs Installaties een spoeddienst aanbiedt.');
  assert.match(m.schoneVoorzorgsregel(prijzen), /^Niet beweren dat het bedrijf vaste prijzen/);
  assert.doesNotMatch(m.schoneVoorzorgsregel(prijzen), /vraag aan de klant/);
});

function profielTekst(extra) {
  return m.KOPJES.map((k, i) => `${i + 1}. ${k}\n${i === 1 ? extra : 'Een gewoon feit over het bedrijf (website: /over-ons)'}`).join('\n');
}

test('een voorzorgsregel is niet open, een echt ontbrekend punt wel', () => {
  const secties = m.parseProfiel(profielTekst(`${spoed}\nGeverifieerde feiten en voorwaarden: niet gevonden op de website, vraag aan de klant.`));
  const feiten = secties[1].feiten;
  assert.equal(feiten[0].voorzorg, true);
  assert.equal(feiten[0].open, false);
  assert.equal(feiten[0].tekst, 'Niet beweren dat Hirs Installaties een spoeddienst aanbiedt.');
  assert.equal(feiten[1].open, true);
});

test('het id van een voorzorgsregel blijft gelijk aan het oorspronkelijke feit', () => {
  const secties = m.parseProfiel(profielTekst(spoed));
  assert.equal(secties[1].feiten[0].id, m.regelId(spoed));
});
