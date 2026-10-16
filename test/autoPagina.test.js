// Een nieuwe pagina doet de eerste stappen zelf: onderwerp invullen, feiten aan, tekst laten schrijven.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { onderwerpTekst, metOnderwerp, maakWachtrij } = require('../src/lp/autoPagina');
const { invoerVoorGoedgekeurd } = require('../src/lp/plan');

test('onderwerp wordt samengesteld uit dienst, plaats en reden', () => {
  const t = onderwerpTekst({ dienstFocus: 'Prefab dakkapellen plaatsen', plaatsnaam: 'Hillegom', werkgebied: 'Hillegom en omstreken', plan: { reden: 'Veel gezocht in de regio' } }, 'Prefab dakkapellen');
  assert.match(t, /^Pagina over Prefab dakkapellen plaatsen in Hillegom\./);
  assert.match(t, /Werkgebied: Hillegom en omstreken\./);
  assert.match(t, /Veel gezocht in de regio\./);
});

test('een zelf getypt onderwerp wint altijd', () => {
  assert.equal(onderwerpTekst({ _watGaatDezePaginaOver: 'Eigen tekst', dienstFocus: 'x', plaatsnaam: 'y' }), 'Eigen tekst');
  assert.equal(metOnderwerp({ _watGaatDezePaginaOver: 'Eigen tekst' }, 't')._watGaatDezePaginaOver, 'Eigen tekst');
});

test('zonder dienst en plaats valt het onderwerp terug op de titel, en zonder alles blijft het leeg', () => {
  assert.equal(onderwerpTekst({}, 'Zomerfestival'), 'Pagina over Zomerfestival.');
  assert.equal(onderwerpTekst({}, ''), '');
  assert.equal(metOnderwerp({}, '')._watGaatDezePaginaOver, undefined);
});

test('geen streepjes in het onderwerp', () => {
  const t = onderwerpTekst({ dienstFocus: 'Dakkapel', plaatsnaam: 'Lisse', plan: { reden: 'Veel gezocht – en weinig aanbod' } });
  assert.ok(!/[–—]/.test(t));
});

test('een goedgekeurd plan voorstel krijgt meteen een onderwerp', () => {
  const inv = invoerVoorGoedgekeurd({ titel: 'Warmtepomp installeren Heemstede', dienst: 'Warmtepomp installeren', plaats: 'Heemstede', reden: 'Veel gezocht' });
  assert.match(inv._watGaatDezePaginaOver, /Warmtepomp installeren in Heemstede/);
});

test('de wachtrij schrijft een pagina per keer en onthoudt een fout', async () => {
  const rij = maakWachtrij();
  const volgorde = [];
  const a = rij.zet('a', async () => { volgorde.push('a1'); await new Promise((r) => setTimeout(r, 10)); volgorde.push('a2'); });
  const b = rij.zet('b', async () => { volgorde.push('b'); throw new Error('stuk'); });
  assert.equal(rij.status('b').status, 'wacht');
  await Promise.all([a, b]);
  assert.deepEqual(volgorde, ['a1', 'a2', 'b']);
  assert.equal(rij.status('a'), null);
  assert.deepEqual(rij.status('b'), { status: 'fout', fout: 'stuk' });
});

test('pagina aanmaken en plan goedkeuren starten de tekst vanzelf, het scherm toont de stand', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'lp.js'), 'utf8');
  assert.match(route, /startAutoTekst\(page\.id\)/g);
  assert.equal((route.match(/startAutoTekst\(page\.id\)/g) || []).length, 2);
  assert.match(route, /tekstStatus: autoTekstRij\.status/);
  const adv = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp-begeleiding.js'), 'utf8');
  assert.match(adv, /De AI schrijft de tekst voor deze pagina/);
  assert.ok(!/Controleer de feiten\./.test(adv), 'de stap feiten bevestigen bestaat niet meer');
  const lp = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  assert.match(lp, /lpOnderwerpTekst\(invoer, page\.titel\)/);
});
