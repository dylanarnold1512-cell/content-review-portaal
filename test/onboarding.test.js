const test = require('node:test');
const assert = require('node:assert');
const { samenvat, normaliseerRij, groepeerPerKlant, chatZin } = require('../src/services/onboarding');
const { STAPPEN, FASEN, STATUSSEN } = require('../src/config/onboardingStappen');

const rij = (nr, status, extra = {}) => ({ nr, status, fase: (STAPPEN.find((s) => s.nr === nr) || {}).fase, titel: 'x' + nr, ...extra });

test('de lijst heeft 21 stappen met unieke nummers in 5 fasen', () => {
  assert.strictEqual(STAPPEN.length, 21);
  assert.strictEqual(new Set(STAPPEN.map((s) => s.nr)).size, 21);
  assert.strictEqual(FASEN.length, 5);
  STAPPEN.forEach((s) => assert.ok(FASEN.some((f) => f.code === s.fase), `fase van stap ${s.nr}`));
  assert.ok(STATUSSEN.includes('Wacht op Dylan'));
});

test('samenvat telt klaar en overgeslagen als afgerond en vindt de volgende stap', () => {
  const rijen = [rij(1, 'Klaar'), rij(2, 'Overgeslagen'), rij(3, 'Bezig'), rij(4, 'Wacht op Dylan'), rij(5, 'Wacht op klant'), rij(6, 'Nog niet gestart')];
  const s = samenvat(rijen);
  assert.strictEqual(s.totaal, 6);
  assert.strictEqual(s.afgerond, 2);
  assert.strictEqual(s.procent, 33);
  assert.strictEqual(s.volgende.nr, 3);
  assert.strictEqual(s.wachtOpDylan.length, 1);
  assert.strictEqual(s.wachtOpKlant.length, 1);
  assert.strictEqual(s.fase, 'A');
  assert.strictEqual(s.gereed, false);
});

test('samenvat zonder rijen geeft nul en niet gereed', () => {
  const s = samenvat([]);
  assert.strictEqual(s.totaal, 0);
  assert.strictEqual(s.procent, 0);
  assert.strictEqual(s.gereed, false);
  assert.strictEqual(s.volgende, null);
});

test('alles klaar is gereed', () => {
  const s = samenvat([rij(1, 'Klaar'), rij(2, 'Overgeslagen')]);
  assert.strictEqual(s.gereed, true);
  assert.strictEqual(s.procent, 100);
});

test('normaliseerRij leest een Notion pagina en vult de uitleg uit de vaste lijst', () => {
  const r = normaliseerRij({
    id: 'p1',
    properties: {
      Stap: { title: [{ plain_text: 'SEO en GEO strategie' }] },
      Klant: { rich_text: [{ plain_text: 'Hirs Installaties' }] },
      'Client ID': { rich_text: [{ plain_text: 'hirs-installaties' }] },
      Nr: { number: 7 },
      Status: { select: { name: 'Wacht op Dylan' } },
      'Aan zet': { select: { name: 'Dylan' } },
      Uitkomst: { rich_text: [{ plain_text: 'Concept klaar' }] }
    }
  });
  assert.strictEqual(r.nr, 7);
  assert.strictEqual(r.fase, 'B');
  assert.strictEqual(r.status, 'Wacht op Dylan');
  assert.strictEqual(r.clientId, 'hirs-installaties');
  assert.match(r.uitleg, /akkoord/i);
});

test('rijen zonder Client ID worden genegeerd en klanten worden gegroepeerd', () => {
  const groepen = groepeerPerKlant([
    rij(1, 'Klaar', { clientId: 'a', klant: 'A' }),
    rij(2, 'Bezig', { clientId: 'a', klant: 'A' }),
    rij(1, 'Klaar', { clientId: 'b', klant: 'B' }),
    rij(1, 'Klaar', { clientId: '' })
  ]);
  assert.strictEqual(groepen.length, 2);
  assert.strictEqual(groepen.find((g) => g.clientId === 'a').samenvatting.totaal, 2);
});

test('de chatzin noemt de klant', () => {
  assert.strictEqual(chatZin('Hirs Installaties'), 'Onboarding Hirs Installaties, ga verder.');
});

const { bepaalMerkprofielStap } = require('../src/services/onboarding');

test('stap 4 volgt de status van het merkprofiel', () => {
  assert.deepStrictEqual(bepaalMerkprofielStap('Nog niet gestart', 'bezig').status, 'Bezig');
  assert.strictEqual(bepaalMerkprofielStap('Bezig', 'definitief concept').status, 'Klaar');
  assert.strictEqual(bepaalMerkprofielStap('Bezig', 'mislukt').status, 'Wacht op Dylan');
});

test('stap 4 verandert niet als er niets nieuws is', () => {
  assert.strictEqual(bepaalMerkprofielStap('Klaar', 'bevestigd') && bepaalMerkprofielStap('Klaar', 'definitief concept'), null);
  assert.strictEqual(bepaalMerkprofielStap('Bezig', 'geen'), null);
  assert.strictEqual(bepaalMerkprofielStap('Overgeslagen', 'bezig'), null);
});

test('ontbrekendeStappen vult alleen aan wat er mist', () => {
  const { ontbrekendeStappen } = require('../src/services/onboarding');
  const { STAPPEN } = require('../src/config/onboardingStappen');
  const blog = STAPPEN.map((s) => s.nr);
  const erbij = ontbrekendeStappen('Pagr.', blog);
  assert.ok(erbij.length > 0);
  assert.ok(erbij.every((s) => s.nr >= 100 && !s.gedeeld));
  assert.equal(ontbrekendeStappen('Blogr.', blog).length, 0);
  assert.equal(ontbrekendeStappen('Beide', []).length, require('../src/config/onboardingStappen').stappenVoor('Beide').length);
});

test('portaal en login staat als stap 11 direct na de Notion database', () => {
  const nrs = STAPPEN.map((s) => s.nr);
  assert.deepStrictEqual(nrs, Array.from({ length: 21 }, (_, i) => i + 1));
  assert.strictEqual(STAPPEN.find((s) => s.nr === 10).titel, 'Notion content database');
  assert.strictEqual(STAPPEN.find((s) => s.nr === 11).titel, 'Portaal en login');
  assert.strictEqual(STAPPEN.find((s) => s.nr === 12).titel, 'WordPress');
});

test('een oude rij met het oude nummer krijgt toch de juiste uitleg via de titel', () => {
  const { normaliseerRij } = require('../src/services/onboarding');
  const oud = normaliseerRij({ id: 'x', properties: { Nr: { number: 11 }, Stap: { title: [{ plain_text: 'WordPress' }] }, Status: { select: { name: 'Klaar' } } } });
  assert.strictEqual(oud.titel, 'WordPress');
  assert.match(oud.uitleg, /REST test/);
  const nieuw = normaliseerRij({ id: 'y', properties: { Nr: { number: 11 }, Stap: { title: [{ plain_text: 'Portaal en login' }] } } });
  assert.match(nieuw.uitleg, /PORTAL_PASSWORD/);
});
