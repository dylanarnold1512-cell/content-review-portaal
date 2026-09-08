// Zelfcontrole (08-09-2026, zie besluiten.md "Zelfcontrole inbouwen"): dit test bestand vangt
// mechanisch precies het foutpatroon af van de Roots-lettertypebug — een custom lettertype
// (fontHeading/fontBody) dat niet ook in googleFonts staat, en dus buiten de eigen WordPress-
// pagina van de klant stilzwijgend niet geladen wordt. Loopt automatisch over ELKE geregistreerde
// klant, dus een nieuwe klant met dezelfde fout wordt hier al vóór de deploy gevangen (draait mee
// in de pre-push hook), zonder dat iemand het zelf in een screenshot hoeft te herkennen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { clientTokens, checkFontLoadConsistency } = require('../src/lp/tokens');

test('elke geregistreerde klant: custom lettertype staat ook echt in googleFonts', () => {
  Object.entries(clientTokens).forEach(([clientId, tokens]) => {
    const problemen = checkFontLoadConsistency(tokens);
    assert.deepEqual(problemen, [], `Klant "${clientId}": ${problemen.join(' ')}`);
  });
});

test('checkFontLoadConsistency: generieke fonts (inherit, sans-serif, Arial, ...) geven geen probleem', () => {
  const generiek = { fontHeading: 'inherit', fontBody: "Arial, 'Helvetica Neue', sans-serif" };
  assert.deepEqual(checkFontLoadConsistency(generiek), []);
});

test('checkFontLoadConsistency: custom font zonder googleFonts geeft wel een probleem (de Roots-bug zelf)', () => {
  const zonderGoogleFonts = { fontHeading: "'Ubuntu', sans-serif", fontBody: "'Ubuntu', sans-serif", googleFonts: [] };
  const problemen = checkFontLoadConsistency(zonderGoogleFonts);
  assert.equal(problemen.length, 2);
  assert.match(problemen[0], /fontHeading/);
  assert.match(problemen[1], /fontBody/);
});

test('checkFontLoadConsistency: custom font MET googleFonts (hoofdlettergevoelig-onafhankelijk) is prima', () => {
  const metGoogleFonts = { fontHeading: "'Ubuntu', sans-serif", fontBody: "'ubuntu', sans-serif", googleFonts: ['Ubuntu'] };
  assert.deepEqual(checkFontLoadConsistency(metGoogleFonts), []);
});

test('checkFontLoadConsistency: googleFonts-veld dat helemaal ontbreekt telt als leeg (bestaande klanten)', () => {
  const zonderVeld = { fontHeading: "'Poppins', sans-serif", fontBody: 'inherit' };
  const problemen = checkFontLoadConsistency(zonderVeld);
  assert.equal(problemen.length, 1);
  assert.match(problemen[0], /Poppins/);
});
