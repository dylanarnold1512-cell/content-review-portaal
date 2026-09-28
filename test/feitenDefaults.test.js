// Feiten met standaard: true staan bij een nieuwe pagina vanzelf aan (src/lp/feitenDefaults.js), en de
// nieuwe Roots feiten van Marion (28-09-2026) staan er correct in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gebruikteFeitIds } = require('../src/lp/feitenDefaults');
const { feiten } = require('../src/lp/clients/roots/feiten');
const profile = require('../src/lp/clients/roots/profile');
const { pickImagesForPage } = require('../src/lp/ai');

const FEITEN = [
  { id: 'a', standaard: true },
  { id: 'b' },
  { id: 'c', standaard: true }
];

test('nog geen feitensheet: alleen de standaard feiten staan aan', () => {
  assert.deepEqual(gebruikteFeitIds(null, FEITEN), ['a', 'c']);
  assert.deepEqual(gebruikteFeitIds(undefined, FEITEN), ['a', 'c']);
  assert.deepEqual(gebruikteFeitIds({ extra: [] }, FEITEN), ['a', 'c']);
});

test('een opgeslagen feitensheet wint, ook als er minder of niets aan staat', () => {
  assert.deepEqual(gebruikteFeitIds({ gebruikt: ['b'], extra: [] }, FEITEN), ['b']);
  assert.deepEqual(gebruikteFeitIds({ gebruikt: [], extra: [] }, FEITEN), []);
});

test('zonder feiten of zonder standaard feiten komt er niets aan', () => {
  assert.deepEqual(gebruikteFeitIds(null, []), []);
  assert.deepEqual(gebruikteFeitIds(null, [{ id: 'x' }]), []);
});

test('Roots: feiten hebben unieke ids en een bron, en de feedback van Marion staat erin', () => {
  const ids = feiten.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  feiten.forEach((f) => assert.ok(f.bron && f.waarde, `feit ${f.id} mist bron of waarde`));
  const per = Object.fromEntries(feiten.map((f) => [f.id, f]));
  assert.match(per['check-out'].waarde, /11 uur.*13 uur/);
  assert.match(per['ligging'].waarde, /Centraal Station/);
  assert.match(per['vroeg-inchecken-festival'].waarde, /festival/);
  assert.match(per['kamertypes'].waarde, /TH \(Tiny House\).*hotelkamers.*dorms/);
  ['check-in', 'check-out', 'ligging', 'vroeg-inchecken-festival', 'kamertypes', 'adres-receptie'].forEach((id) => {
    assert.equal(per[id].standaard, true, `${id} moet standaard aan staan`);
  });
  assert.ok(!feiten.some((f) => /07:00/.test(f.waarde) && f.id === 'check-out'), 'oude uitchecktijd is vervangen');
});

test('Roots heeft een fotorichtlijn over de bar', () => {
  assert.match(profile.fotoRichtlijn, /bar/);
});

test('portaal en server gebruiken dezelfde standaard regel', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'lp.js'), 'utf8');
  assert.match(js, /feiten\.filter\(\(f\) => f\.standaard\)/);
  const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'lp.js'), 'utf8');
  assert.match(route, /gebruikteFeitIds\(page\.feitensheet, client\.feiten\)/);
  assert.equal(typeof pickImagesForPage, 'function');
});
