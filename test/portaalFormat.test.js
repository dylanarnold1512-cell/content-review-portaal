const test = require('node:test');
const assert = require('node:assert');
const f = require('../public/portaal-format.js');

test('getal zet punten bij duizendtallen en rondt af', () => {
  assert.strictEqual(f.getal(2207), '2.207');
  assert.strictEqual(f.getal(1234567), '1.234.567');
  assert.strictEqual(f.getal(999), '999');
  assert.strictEqual(f.getal(0), '0');
  assert.strictEqual(f.getal(1535.6), '1.536');
  assert.strictEqual(f.getal(-1052), '-1.052');
});

test('getal geeft niets terug bij een ontbrekend of ongeldig cijfer', () => {
  assert.strictEqual(f.getal(null), '');
  assert.strictEqual(f.getal(undefined), '');
  assert.strictEqual(f.getal(NaN), '');
  assert.strictEqual(f.getal('12'), '');
});

test('decimaal en positie gebruiken een komma', () => {
  assert.strictEqual(f.positie(9.3), '9,3');
  assert.strictEqual(f.positie(19), '19,0');
  assert.strictEqual(f.positie(25), '25,0');
  assert.strictEqual(f.decimaal(1234.56, 2), '1.234,56');
  assert.strictEqual(f.decimaal(2.8, 0), '3');
  assert.strictEqual(f.positie(null), '');
});

test('decimaal toont geen min bij een afgeronde nul', () => {
  assert.strictEqual(f.decimaal(-0.04, 1), '0,0');
});

test('procent rondt af op een geheel getal', () => {
  assert.strictEqual(f.procent(5.6), '6%');
  assert.strictEqual(f.procent(0), '0%');
  assert.strictEqual(f.procent(undefined), '');
});

test('verschil gebruikt percentage bij grote aantallen', () => {
  assert.deepStrictEqual(f.verschil(3338, 2046), { tekst: '+63%', toon: 'goed' });
  assert.deepStrictEqual(f.verschil(1000, 2000), { tekst: '-50%', toon: 'slecht' });
});

test('verschil gebruikt het absolute verschil bij kleine aantallen', () => {
  assert.deepStrictEqual(f.verschil(5, 2), { tekst: '+3', toon: 'goed' });
  assert.deepStrictEqual(f.verschil(1, 3), { tekst: '-2', toon: 'slecht' });
});

test('verschil vanaf nul is nooit een percentage', () => {
  assert.deepStrictEqual(f.verschil(150, 0), { tekst: '+150', toon: 'goed' });
});

test('verschil zonder verandering of zonder vergelijking', () => {
  assert.deepStrictEqual(f.verschil(6, 6), { tekst: 'gelijk', toon: 'gelijk' });
  assert.strictEqual(f.verschil(6, null), null);
  assert.strictEqual(f.verschil(undefined, 4), null);
});

test('verschil bij een positie: lager is beter', () => {
  assert.deepStrictEqual(f.verschil(9.3, 6.5, { lagerIsBeter: true, decimalen: 1 }), { tekst: '+2,8', toon: 'slecht' });
  assert.deepStrictEqual(f.verschil(6.5, 9.3, { lagerIsBeter: true, decimalen: 1 }), { tekst: '-2,8', toon: 'goed' });
});

test('datums zijn Nederlands en in elke notatie gelijk', () => {
  assert.strictEqual(f.datumKort('2026-10-20'), '20 okt');
  assert.strictEqual(f.datumKort('2027-01-26'), '26 jan');
  assert.strictEqual(f.datumMetJaar('2027-01-26'), '26 jan 2027');
  assert.strictEqual(f.datumLang('2026-10-20'), '20 oktober 2026');
  assert.strictEqual(f.datumKort('2026-03-05'), '5 mrt');
});

test('een datum met tijd en tijdzone verschuift niet van dag', () => {
  assert.strictEqual(f.datumKort('2026-10-06T00:00:00.000+02:00'), '6 okt');
  assert.strictEqual(f.datumKort('2026-10-06T23:30:00.000-05:00'), '6 okt');
});

test('een Date object wordt gelezen op lokale dag', () => {
  assert.strictEqual(f.datumKort(new Date(2026, 9, 20, 12, 0, 0)), '20 okt');
});

test('ongeldige datums geven een lege tekst', () => {
  assert.strictEqual(f.datumKort(''), '');
  assert.strictEqual(f.datumKort(null), '');
  assert.strictEqual(f.datumKort('morgen'), '');
  assert.strictEqual(f.datumKort('2026-13-01'), '');
  assert.strictEqual(f.datumLang(new Date('x')), '');
});

test('maand maakt van een maandcode een leesbare maand', () => {
  assert.strictEqual(f.maand('2026-09'), 'september 2026');
  assert.strictEqual(f.maand('2026-09-30'), 'september 2026');
  assert.strictEqual(f.maand('2026-00'), '');
  assert.strictEqual(f.maand(undefined), '');
});

test('dagNaam geeft de dag van de week', () => {
  assert.strictEqual(f.dagNaam('2026-10-20'), 'di');
  assert.strictEqual(f.dagNaam('2026-10-19'), 'ma');
  assert.strictEqual(f.dagNaam(''), '');
});
